import express from 'express';
import { getDatabase, queryAll, queryGet, queryRun } from '../db/database.js';
import { predictWCMatch } from '../models/wcPredictor.js';

const router = express.Router();

const DEFAULT_ELO = {
  "Argentina": 2080, "France": 1990, "Spain": 1970,
  "England": 1950, "Brazil": 1940, "Portugal": 1920,
  "Germany": 1900, "Netherlands": 1880, "Belgium": 1850,
  "Uruguay": 1820, "USA": 1800, "Mexico": 1780,
  "Colombia": 1760, "Switzerland": 1750, "Japan": 1740,
  "Morocco": 1720, "Senegal": 1700, "South Korea": 1690,
  "Turkey": 1680, "Croatia": 1670, "Australia": 1650,
  "Norway": 1640, "Austria": 1630, "Sweden": 1620,
  "Ecuador": 1600, "Tunisia": 1580, "Iran": 1570,
  "Ghana": 1550, "Saudi Arabia": 1530, "Algeria": 1520,
  "Czech Republic": 1510, "Scotland": 1500,
  "Bosnia Herzegovina": 1480, "Paraguay": 1460,
  "Canada": 1450, "Qatar": 1380, "Egypt": 1430,
  "Iraq": 1370, "Jordan": 1350, "Ivory Coast": 1560,
  "New Zealand": 1320, "Cape Verde": 1400,
  "DR Congo": 1410, "Uzbekistan": 1390,
  "Panama": 1340, "Haiti": 1300, "Curacao": 1290,
  "South Africa": 1420
};

/**
 * GET /api/wc2026/groups
 * Trả về danh sách 12 bảng đấu kèm đội bóng
 */
router.get('/groups', async (req, res) => {
  try {
    const db = await getDatabase();
    const groups = await queryAll(db, 'SELECT * FROM wc2026_groups ORDER BY group_name, team_name');
    
    const grouped = {};
    groups.forEach(g => {
      if (!grouped[g.group_name]) grouped[g.group_name] = [];
      grouped[g.group_name].push(g);
    });

    res.json({ groups: grouped });
  } catch (err) {
    console.error('[API/wc2026/groups] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/wc2026/matches
 * Trả về lịch thi đấu các trận vòng bảng
 */
router.get('/matches', async (req, res) => {
  try {
    const db = await getDatabase();
    const { group, date } = req.query;

    let sql = 'SELECT * FROM wc2026_matches';
    const params = [];
    const conditions = [];

    if (group) {
      conditions.push('group_name = ?');
      params.push(group);
    }
    if (date) {
      conditions.push('match_date = ?');
      params.push(date);
    }

    if (conditions.length > 0) {
      sql += ' WHERE ' + conditions.join(' AND ');
    }
    sql += ' ORDER BY match_id ASC';

    const matches = await queryAll(db, sql, params);
    res.json({ matches });
  } catch (err) {
    console.error('[API/wc2026/matches] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/wc2026/predict
 * Dự đoán kết quả 1 trận đấu
 */
router.post('/predict', async (req, res) => {
  try {
    const db = await getDatabase();
    const { matchId } = req.body;

    if (!matchId) {
      return res.status(400).json({ error: 'matchId is required' });
    }

    const match = await queryGet(db, 'SELECT * FROM wc2026_matches WHERE match_id = ?', [matchId]);
    if (!match) {
      return res.status(404).json({ error: 'Match not found' });
    }

    const prediction = await predictWCMatch(match.team1_en, match.team2_en, { db });

    // Blend với Odds 50/50 nếu có trong odds_cache
    const oddsId = `wc_${matchId}`;
    const odds = await queryGet(db, 'SELECT * FROM odds_cache WHERE match_id = ?', [oddsId]);
    if (odds) {
      prediction.result_probs = {
        home: 0.50 * prediction.result_probs.home + 0.50 * odds.home_prob,
        draw: 0.50 * prediction.result_probs.draw + 0.50 * odds.draw_prob,
        away: 0.50 * prediction.result_probs.away + 0.50 * odds.away_prob
      };
      
      prediction.over_under = {
        over25: 0.50 * prediction.over_under.over25 + 0.50 * odds.over25_prob,
        under25: 0.50 * prediction.over_under.under25 + 0.50 * odds.under25_prob,
        prediction: (0.50 * prediction.over_under.over25 + 0.50 * odds.over25_prob) > 0.5 ? 'Tài' : 'Xỉu'
      };

      prediction.key_factors.push({ factor: 'Tích hợp tỷ lệ nhà cái (Odds API 50/50)', impact: 0.5, icon: '📈' });
    }

    // Lưu kết quả dự đoán
    const predId = `wc_${matchId}`;
    const existingPred = await queryGet(db, 'SELECT id FROM predictions WHERE match_id = ?', [predId]);
    if (existingPred) {
      await queryRun(db,
        `UPDATE predictions
         SET predicted_score = ?, result_probs = ?, confidence = ?, created_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [JSON.stringify(prediction.score), JSON.stringify(prediction.result_probs), prediction.confidence, existingPred.id]
      );
    } else {
      await queryRun(db,
        `INSERT INTO predictions (match_id, predicted_score, result_probs, confidence, ai_analysis)
         VALUES (?, ?, ?, ?, ?)`,
        [predId, JSON.stringify(prediction.score), JSON.stringify(prediction.result_probs), prediction.confidence, 'World Cup Prediction']
      );
    }

    res.json({
      matchId,
      team1: match.team1_vi,
      team2: match.team2_vi,
      prediction
    });
  } catch (err) {
    console.error('[API/wc2026/predict] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/wc2026/predict/all
 * Dự đoán tất cả các trận vòng bảng
 */
router.get('/predict/all', async (req, res) => {
  try {
    const db = await getDatabase();
    const matches = await queryAll(db, 'SELECT * FROM wc2026_matches');
    
    const results = [];

    for (const m of matches) {
      const prediction = await predictWCMatch(m.team1_en, m.team2_en, { db });
      
      const oddsId = `wc_${m.match_id}`;
      const odds = await queryGet(db, 'SELECT * FROM odds_cache WHERE match_id = ?', [oddsId]);
      if (odds) {
        prediction.result_probs = {
          home: 0.50 * prediction.result_probs.home + 0.50 * odds.home_prob,
          draw: 0.50 * prediction.result_probs.draw + 0.50 * odds.draw_prob,
          away: 0.50 * prediction.result_probs.away + 0.50 * odds.away_prob
        };
        prediction.over_under = {
          over25: 0.50 * prediction.over_under.over25 + 0.50 * odds.over25_prob,
          under25: 0.50 * prediction.over_under.under25 + 0.50 * odds.under25_prob,
          prediction: (0.50 * prediction.over_under.over25 + 0.50 * odds.over25_prob) > 0.5 ? 'Tài' : 'Xỉu'
        };
      }

      // Lưu kết quả dự báo
      const predId = `wc_${m.match_id}`;
      const existingPred = await queryGet(db, 'SELECT id FROM predictions WHERE match_id = ?', [predId]);
      if (existingPred) {
        await queryRun(db,
          `UPDATE predictions
           SET predicted_score = ?, result_probs = ?, confidence = ?, created_at = CURRENT_TIMESTAMP
           WHERE id = ?`,
          [JSON.stringify(prediction.score), JSON.stringify(prediction.result_probs), prediction.confidence, existingPred.id]
        );
      } else {
        await queryRun(db,
          `INSERT INTO predictions (match_id, predicted_score, result_probs, confidence, ai_analysis)
           VALUES (?, ?, ?, ?, ?)`,
          [predId, JSON.stringify(prediction.score), JSON.stringify(prediction.result_probs), prediction.confidence, 'World Cup Prediction']
        );
      }

      results.push({
        matchId: m.match_id,
        team1: m.team1_vi,
        team2: m.team2_vi,
        prediction
      });
    }

    res.json({ results });
  } catch (err) {
    console.error('[API/wc2026/predict/all] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /api/wc2026/summary
 * Tính toán BXH từ dự đoán và mô phỏng vòng Knockout
 */
router.get('/summary', async (req, res) => {
  try {
    const db = await getDatabase();
    
    // 1. Lấy tất cả các trận và bảng đấu
    const matches = await queryAll(db, 'SELECT * FROM wc2026_matches');
    const groups = await queryAll(db, 'SELECT * FROM wc2026_groups');
    const predictions = await queryAll(db, 'SELECT * FROM predictions WHERE match_id LIKE \'wc_%\'');

    const predMap = new Map();
    predictions.forEach(p => {
      const matchId = parseInt(p.match_id.replace('wc_', ''));
      predMap.set(matchId, JSON.parse(p.predicted_score));
    });

    // Tính điểm vòng bảng
    const standings = {}; // team_vi -> { points, gd, gs, group, name_en }
    groups.forEach(g => {
      standings[g.team_vi] = { team_vi: g.team_vi, team_en: g.team_name, points: 0, gd: 0, gs: 0, group: g.group_name };
    });

    matches.forEach(m => {
      let score1 = m.score_team1;
      let score2 = m.score_team2;

      // Sử dụng dự đoán nếu chưa đấu
      if (score1 === null && predMap.has(m.match_id)) {
        const predScore = predMap.get(m.match_id);
        score1 = predScore.home;
        score2 = predScore.away;
      }

      if (score1 !== null && score2 !== null) {
        const t1 = standings[m.team1_vi];
        const t2 = standings[m.team2_vi];
        if (t1 && t2) {
          t1.gs += score1;
          t1.gd += (score1 - score2);
          t2.gs += score2;
          t2.gd += (score2 - score1);

          if (score1 > score2) {
            t1.points += 3;
          } else if (score1 < score2) {
            t2.points += 3;
          } else {
            t1.points += 1;
            t2.points += 1;
          }
        }
      }
    });

    // Chia BXH theo bảng đấu và xếp hạng
    const groupStandings = {};
    Object.values(standings).forEach(s => {
      if (!groupStandings[s.group]) groupStandings[s.group] = [];
      groupStandings[s.group].push(s);
    });

    const qualifiers = []; // Đội đi tiếp: Top 2 mỗi bảng
    const thirdPlaces = []; // Đội thứ 3

    for (const [groupName, list] of Object.entries(groupStandings)) {
      list.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gs - a.gs);
      qualifiers.push(list[0]);
      qualifiers.push(list[1]);
      thirdPlaces.push(list[2]);
    }

    // Lọc 8 đội thứ 3 tốt nhất
    thirdPlaces.sort((a, b) => b.points - a.points || b.gd - a.gd || b.gs - a.gs);
    const top8Thirds = thirdPlaces.slice(0, 8);
    
    // Tổng hợp 32 đội đi tiếp
    const roundOf32Teams = [...qualifiers, ...top8Thirds];

    // Mô phỏng các vòng Knock-out (32 -> 16 -> 8 -> 4 -> 2 -> Vô địch)
    const simulateKnockout = async (teamsList) => {
      const rounds = [];
      let currentRoundMatches = [];

      // Vòng 32 đội
      for (let i = 0; i < teamsList.length; i += 2) {
        if (i + 1 < teamsList.length) {
          currentRoundMatches.push({ t1: teamsList[i], t2: teamsList[i+1] });
        }
      }

      rounds.push({ name: 'Vòng 32', matches: currentRoundMatches });

      const simulateRound = async (prevMatches, roundName) => {
        const nextRoundTeams = [];
        const matchesOut = [];

        for (const pair of prevMatches) {
          // Tính toán dự đoán để tìm đội đi tiếp
          const pred = await predictWCMatch(pair.t1.team_en, pair.t2.team_en, { db });
          const score = `${pred.score.home} - ${pred.score.away}`;
          
          let winner = pair.t1;
          if (pred.result_probs.away > pred.result_probs.home) {
            winner = pair.t2;
          }

          matchesOut.push({
            t1: pair.t1,
            t2: pair.t2,
            score,
            winner
          });

          nextRoundTeams.push(winner);
        }

        const nextMatches = [];
        for (let i = 0; i < nextRoundTeams.length; i += 2) {
          if (i + 1 < nextRoundTeams.length) {
            nextMatches.push({ t1: nextRoundTeams[i], t2: nextRoundTeams[i+1] });
          }
        }

        return {
          round: { name: roundName, matches: matchesOut },
          nextMatches
        };
      };

      // Vòng 16
      const r16Res = await simulateRound(currentRoundMatches, 'Vòng 16 Đội');
      rounds.push(r16Res.round);

      // Tứ kết
      const qfRes = await simulateRound(r16Res.nextMatches, 'Tứ Kết');
      rounds.push(qfRes.round);

      // Bán kết
      const sfRes = await simulateRound(qfRes.nextMatches, 'Bán Kết');
      rounds.push(sfRes.round);

      // Chung kết
      const finalMatch = sfRes.nextMatches;
      const winnerOut = [];
      const finalPred = await predictWCMatch(finalMatch[0].t1.team_en, finalMatch[0].t2.team_en, { db });
      const finalScore = `${finalPred.score.home} - ${finalPred.score.away}`;
      let champion = finalMatch[0].t1;
      if (finalPred.result_probs.away > finalPred.result_probs.home) {
        champion = finalMatch[0].t2;
      }
      winnerOut.push({
        t1: finalMatch[0].t1,
        t2: finalMatch[0].t2,
        score: finalScore,
        winner: champion
      });

      rounds.push({ name: 'Chung Kết', matches: winnerOut });

      return { rounds, champion };
    };

    const knockoutBracket = await simulateKnockout(roundOf32Teams);

    res.json({
      groupStandings,
      top8Thirds,
      knockoutBracket
    });

  } catch (err) {
    console.error('[API/wc2026/summary] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /api/wc2026/matches/:id/result
 * Lưu kết quả tỷ số thực
 */
router.post('/matches/:id/result', async (req, res) => {
  try {
    const db = await getDatabase();
    const matchId = parseInt(req.params.id);
    const { score_team1, score_team2 } = req.body;

    if (score_team1 === undefined || score_team2 === undefined) {
      return res.status(400).json({ error: 'score_team1 and score_team2 are required' });
    }

    await queryRun(db,
      `UPDATE wc2026_matches
       SET score_team1 = ?, score_team2 = ?, status = 'finished'
       WHERE match_id = ?`,
      [score_team1, score_team2, matchId]
    );

    res.json({ success: true, matchId });
  } catch (err) {
    console.error('[API/wc2026/result] Error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
