import express from 'express';
import { getDatabase, queryAll } from '../db/database.js';

const router = express.Router();

/**
 * GET /api/history
 * Optional Query Filters: league, startDate, endDate
 */
router.get('/', async (req, res) => {
  try {
    const db = await getDatabase();
    const { league, startDate, endDate } = req.query;

    let sql = `
      SELECT 
        p.id as prediction_id,
        p.predicted_score,
        p.result_probs,
        p.confidence,
        p.created_at,
        m.id as match_id,
        m.date as match_date,
        m.score_home as actual_home,
        m.score_away as actual_away,
        m.league,
        m.status as match_status,
        ht.name as home_name,
        at.name as away_name
      FROM predictions p
      JOIN matches m ON p.match_id = m.id
      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id
      WHERE 1=1
    `;
    const params = [];

    if (league) {
      sql += ` AND m.league = ?`;
      params.push(league);
    }
    if (startDate) {
      sql += ` AND m.date >= ?`;
      params.push(startDate);
    }
    if (endDate) {
      sql += ` AND m.date <= ?`;
      params.push(endDate);
    }

    sql += ` ORDER BY m.date DESC, p.created_at DESC`;

    const predictions = await queryAll(db, sql, params);

    // Format output
    const formatted = predictions.map(p => {
      let predScore = null;
      let predProbs = null;

      try {
        predScore = JSON.parse(p.predicted_score);
      } catch (e) {}

      try {
        predProbs = JSON.parse(p.result_probs);
      } catch (e) {}

      // Calculate accuracy status if match is finished
      let is1X2Correct = null;
      let isOUCorrect = null;

      if (p.match_status === 'FINISHED' && p.actual_home !== null && p.actual_away !== null && predScore && predProbs) {
        // Actual result
        const actResult = p.actual_home > p.actual_away ? '1' : (p.actual_home < p.actual_away ? '2' : 'X');
        const actTotalGoals = p.actual_home + p.actual_away;
        const actOU = actTotalGoals > 2.5 ? 'over' : 'under';

        // Predicted result based on highest probability
        let pred1X2 = 'X';
        const maxProb = Math.max(predProbs.home || 0, predProbs.draw || 0, predProbs.away || 0);
        if (maxProb === predProbs.home) pred1X2 = '1';
        else if (maxProb === predProbs.away) pred1X2 = '2';

        is1X2Correct = (actResult === pred1X2);

        // Predicted Over/Under
        const overProb = predProbs.over25 ?? 0.5;
        const predOU = overProb > 0.5 ? 'over' : 'under';
        isOUCorrect = (actOU === predOU);
      }

      return {
        id: p.prediction_id,
        matchId: p.match_id,
        matchDate: p.match_date,
        league: p.league,
        homeTeam: p.home_name,
        awayTeam: p.away_name,
        predictedScore: predScore,
        resultProbs: predProbs,
        actualScore: p.actual_home !== null && p.actual_away !== null ? { home: p.actual_home, away: p.actual_away } : null,
        status: p.match_status,
        confidence: p.confidence,
        is1X2Correct,
        isOUCorrect,
        createdAt: p.created_at
      };
    });

    res.json({ success: true, history: formatted });
  } catch (err) {
    console.error('[API/history] Error fetching history:', err.message);
    res.status(500).json({ error: err.message });
  }
});

export default router;
