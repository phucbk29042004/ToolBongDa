/**
 * validateMatch.js — Middleware kiểm tra điều kiện trước khi dự đoán
 *
 * Điều kiện:
 * 1. Cả 2 đội phải tồn tại trong DB
 * 2. Mỗi đội phải có ít nhất 5 trận trong team_stats
 */

import { getDatabase, queryGet } from '../db/database.js';

const MIN_MATCHES = 5;

export async function validateMatch(req, res, next) {
  const { homeTeamId, awayTeamId } = req.body;

  // ── Basic input check ────────────────────────────────────────
  if (!homeTeamId || !awayTeamId) {
    return res.status(400).json({
      error: 'Thiếu thông tin đội bóng',
      detail: 'homeTeamId và awayTeamId là bắt buộc',
    });
  }

  if (homeTeamId === awayTeamId) {
    return res.status(400).json({
      error: 'Đội nhà và đội khách không thể giống nhau',
      detail: `Cả hai đều có ID: ${homeTeamId}`,
    });
  }

  try {
    const db = await getDatabase();

    // ── Check đội tồn tại ────────────────────────────────────────
    const homeTeam = await queryGet(db, 'SELECT id, name FROM teams WHERE id = ?', [homeTeamId]);
    if (!homeTeam) {
      return res.status(404).json({
        error: 'Không tìm thấy đội nhà',
        detail: `Không có đội nào với ID ${homeTeamId} trong cơ sở dữ liệu`,
      });
    }

    const awayTeam = await queryGet(db, 'SELECT id, name FROM teams WHERE id = ?', [awayTeamId]);
    if (!awayTeam) {
      return res.status(404).json({
        error: 'Không tìm thấy đội khách',
        detail: `Không có đội nào với ID ${awayTeamId} trong cơ sở dữ liệu`,
      });
    }

    const targetDate = req.body.matchDate || new Date().toISOString().split('T')[0];
    const targetDateObj = new Date(targetDate);
    const targetYear = targetDateObj.getFullYear();
    const targetMonth = targetDateObj.getMonth() + 1;
    const targetSeason = targetMonth >= 7 ? targetYear : targetYear - 1;

    // Fetch latest season stats for home team that is <= targetSeason
    let homeStats = await queryGet(db,
      'SELECT * FROM team_stats WHERE team_id = ? AND season <= ? ORDER BY season DESC LIMIT 1',
      [homeTeamId, targetSeason]
    );

    // If the latest stats row has less than MIN_MATCHES, try to find a previous season with enough matches
    if (!homeStats || (homeStats.matches_played || 0) < MIN_MATCHES) {
      const fallbackStats = await queryGet(db,
        'SELECT * FROM team_stats WHERE team_id = ? AND season < ? AND matches_played >= ? ORDER BY season DESC LIMIT 1',
        [homeTeamId, targetSeason, MIN_MATCHES]
      );
      if (fallbackStats) {
        homeStats = fallbackStats;
      }
    }

    if (!homeStats || (homeStats.matches_played || 0) < MIN_MATCHES) {
      return res.status(422).json({
        error: 'Dữ liệu đội nhà không đủ',
        detail: `${homeTeam.name} không có đủ dữ liệu thống kê (cần ít nhất ${MIN_MATCHES} trận). Hãy chạy 'npm run seed' để nạp dữ liệu.`,
      });
    }

    // Fetch latest season stats for away team that is <= targetSeason
    let awayStats = await queryGet(db,
      'SELECT * FROM team_stats WHERE team_id = ? AND season <= ? ORDER BY season DESC LIMIT 1',
      [awayTeamId, targetSeason]
    );

    if (!awayStats || (awayStats.matches_played || 0) < MIN_MATCHES) {
      const fallbackStats = await queryGet(db,
        'SELECT * FROM team_stats WHERE team_id = ? AND season < ? AND matches_played >= ? ORDER BY season DESC LIMIT 1',
        [awayTeamId, targetSeason, MIN_MATCHES]
      );
      if (fallbackStats) {
        awayStats = fallbackStats;
      }
    }

    if (!awayStats || (awayStats.matches_played || 0) < MIN_MATCHES) {
      return res.status(422).json({
        error: 'Dữ liệu đội khách không đủ',
        detail: `${awayTeam.name} không có đủ dữ liệu thống kê (cần ít nhất ${MIN_MATCHES} trận). Hãy chạy 'npm run seed' để nạp dữ liệu.`,
      });
    }

    // Gắn thêm thông tin đội vào request để route dùng lại (tránh query lại)
    req.homeTeam = homeTeam;
    req.awayTeam = awayTeam;
    req.homeStats = homeStats;
    req.awayStats = awayStats;

    next();
  } catch (err) {
    console.error('[validateMatch] Error:', err.message);
    res.status(500).json({
      error: 'Lỗi kiểm tra dữ liệu',
      detail: err.message,
    });
  }
}
