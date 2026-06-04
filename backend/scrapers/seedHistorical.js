/**
 * seedHistorical.js — Pull 2 mùa giải gần nhất từ football-data.org
 * Chạy bằng: npm run seed
 * 
 * Giới hạn free tier: 10 requests/phút → delay 6s giữa mỗi request
 */

import dotenv from 'dotenv';
dotenv.config();

import axios from 'axios';
import { initDatabase } from '../db/init.js';
import { queryRun, queryGet, queryAll } from '../db/database.js';

const BASE_URL = 'https://api.football-data.org/v4';
const DELAY_MS = 6000; // 10 req/phút = 6s/req (safe margin)
const LEAGUES = ['PL', 'PD', 'BL1', 'CL'];
const CURRENT_YEAR = new Date().getFullYear();
const SEASONS = [CURRENT_YEAR - 1, CURRENT_YEAR - 2, CURRENT_YEAR - 3, CURRENT_YEAR - 4, CURRENT_YEAR - 5]; // 5 mùa giải gần nhất (2025 lùi về 2021) để tránh lỗi 404 của mùa chưa bắt đầu

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getHeaders() {
  const key = process.env.FOOTBALL_DATA_API_KEY;
  if (!key || key === 'your_football_data_key_here') {
    console.error('[Seed] ❌ FOOTBALL_DATA_API_KEY chưa được cấu hình trong file .env');
    console.error('[Seed]    Đăng ký tại: https://www.football-data.org/client/register');
    process.exit(1);
  }
  return { 'X-Auth-Token': key };
}

/**
 * Retry logic với exponential backoff
 * Thử lại tối đa 3 lần: wait 6s → 12s → 24s
 */
async function fetchWithRetry(url, retries = 3, baseDelay = DELAY_MS) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await axios.get(url, { headers: getHeaders(), timeout: 15000 });
      return res.data;
    } catch (err) {
      const status = err.response?.status;
      const isRateLimit = status === 429;
      const isServerError = status >= 500;

      if (attempt === retries) {
        throw new Error(`[Seed] Thất bại sau ${retries} lần thử: ${err.message}`);
      }

      const waitMs = baseDelay * Math.pow(2, attempt - 1); // 6s, 12s, 24s
      console.warn(`[Seed] Lần ${attempt} thất bại (${status || err.code}) — thử lại sau ${waitMs / 1000}s...`);
      await sleep(waitMs);
    }
  }
}

// ─── Upsert helpers ───────────────────────────────────────────────────────────

async function upsertTeam(db, team, league) {
  const existing = await queryGet(db, 'SELECT league FROM teams WHERE id = ?', [team.id]);
  if (existing) {
    let newLeague = existing.league || '';
    const leagues = newLeague.split(',').map(l => l.trim()).filter(Boolean);
    if (!leagues.includes(league)) {
      leagues.push(league);
      newLeague = leagues.join(',');
    }
    await queryRun(db,
      'UPDATE teams SET name = ?, league = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [team.name, newLeague, team.id]
    );
  } else {
    await queryRun(db,
      'INSERT OR IGNORE INTO teams (id, name, league, elo_rating) VALUES (?, ?, ?, 1500)',
      [team.id, team.name, league]
    );
  }
}

async function upsertMatch(db, match, league, season) {
  const homeId = match.homeTeam?.id;
  const awayId = match.awayTeam?.id;
  if (!homeId || !awayId) return false;

  const scoreHome = match.score?.fullTime?.home ?? null;
  const scoreAway = match.score?.fullTime?.away ?? null;
  const date = match.utcDate ? match.utcDate.split('T')[0] : null;
  const status = match.status || 'SCHEDULED';

  const existing = await queryGet(db, 'SELECT id FROM matches WHERE id = ?', [match.id]);
  if (existing) {
    await queryRun(db,
      `UPDATE matches SET score_home = ?, score_away = ?, status = ? WHERE id = ?`,
      [scoreHome, scoreAway, status, match.id]
    );
  } else {
    await queryRun(db,
      `INSERT OR IGNORE INTO matches
         (id, home_team_id, away_team_id, date, score_home, score_away, league, season, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [match.id, homeId, awayId, date, scoreHome, scoreAway, league, season, status]
    );
  }
  return true;
}

// ─── Rebuild team_stats từ match results ─────────────────────────────────────

async function rebuildTeamStats(db, league, season) {
  console.log(`\n[Seed] Tính toán lại team_stats cho ${league} ${season}...`);

  const teams = await queryAll(db,
    'SELECT id, name FROM teams WHERE league LIKE ?', [`%${league}%`]
  );

  for (const team of teams) {
    const matches = await queryAll(db,
      `SELECT * FROM matches
       WHERE (home_team_id = ? OR away_team_id = ?)
         AND league = ? AND season = ? AND status = 'FINISHED'
         AND score_home IS NOT NULL`,
      [team.id, team.id, league, season]
    );

    let played = 0, scored = 0, conceded = 0, wins = 0, draws = 0, losses = 0;

    for (const m of matches) {
      played++;
      const isHome = m.home_team_id === team.id;
      const gf = isHome ? m.score_home : m.score_away;
      const ga = isHome ? m.score_away : m.score_home;
      scored += gf;
      conceded += ga;
      if (gf > ga) wins++;
      else if (gf === ga) draws++;
      else losses++;
    }

    // Ước tính xG từ số bàn thực tế (không có Opta data ở free tier)
    // Dùng tỷ lệ hồi quy: xG ≈ 0.9 * scored + noise nhỏ (conservative estimate)
    const xG  = Math.round(scored  * 0.92 * 10) / 10;
    const xGA = Math.round(conceded * 0.92 * 10) / 10;

    await queryRun(db,
      `INSERT INTO team_stats (team_id, season, matches_played, goals_scored, goals_conceded, xG, xGA)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(team_id, season) DO UPDATE SET
         matches_played  = excluded.matches_played,
         goals_scored    = excluded.goals_scored,
         goals_conceded  = excluded.goals_conceded,
         xG              = excluded.xG,
         xGA             = excluded.xGA`,
      [team.id, season, played, scored, conceded, xG, xGA]
    );
  }
}

// ─── Main seed logic ──────────────────────────────────────────────────────────

async function seed() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║  Football Predictor — Seed lịch sử các giải đấu       ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  const db = await initDatabase();
  let totalMatches = 0;

  for (const league of LEAGUES) {
    console.log(`\n🏆 KHỞI ĐẦU GIẢI ĐẤU: ${league}`);
    for (const season of SEASONS) {
      try {
        console.log(`\n${'═'.repeat(55)}`);
        console.log(`📅  Mùa giải: ${season}/${season + 1} (${league})`);
        console.log('═'.repeat(55));

        // Step 1: Lấy danh sách đội
        console.log(`\n[Step 1] Lấy đội bóng ${league} ${season}...`);
        await sleep(DELAY_MS);
        const teamsData = await fetchWithRetry(`${BASE_URL}/competitions/${league}/teams?season=${season}`);
        const teams = teamsData.teams || [];
        console.log(`         → ${teams.length} đội`);

        for (const team of teams) {
          await upsertTeam(db, team, league);
        }

        // Step 2: Lấy kết quả trận đấu
        console.log(`\n[Step 2] Lấy kết quả trận ${league} ${season}...`);
        await sleep(DELAY_MS);
        const matchesData = await fetchWithRetry(`${BASE_URL}/competitions/${league}/matches?season=${season}`);
        const matches = matchesData.matches || [];

        let saved = 0;
        for (const match of matches) {
          const ok = await upsertMatch(db, match, league, season);
          if (ok) saved++;
        }
        console.log(`         → ${saved} trận đã lưu`);
        totalMatches += saved;

        // Step 3: Rebuild team_stats
        await rebuildTeamStats(db, league, season);

        console.log(`\n✅  Mùa ${season} giải ${league} hoàn thành.`);
      } catch (leagueErr) {
        console.error(`\n❌ Lỗi khi đồng bộ giải ${league} mùa ${season}:`, leagueErr.message);
        console.log('Chuyển sang giải đấu/mùa giải tiếp theo...');
      }
    }
  }

  console.log(`\n${'═'.repeat(55)}`);
  console.log(`🏁  Seed hoàn tất! Tổng: ${totalMatches} trận.`);
  console.log('═'.repeat(55));

  process.exit(0);
}

seed().catch(err => {
  console.error('\n❌ Seed thất bại:', err.message);
  process.exit(1);
});
