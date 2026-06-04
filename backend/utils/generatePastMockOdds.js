import { getDatabase, queryAll, queryRun } from '../db/database.js';

async function generate() {
  const db = await getDatabase();
  
  const matches = await queryAll(db, `
    SELECT id, score_home, score_away 
    FROM matches 
    WHERE status = 'FINISHED' AND score_home IS NOT NULL AND score_away IS NOT NULL
      AND date BETWEEN '2024-11-01' AND '2025-02-28'
    ORDER BY date DESC LIMIT 50
  `);
  
  console.log(`Generating mock odds for ${matches.length} matches...`);
  
  for (const m of matches) {
    let pHome, pDraw, pAway;
    if (m.score_home > m.score_away) {
      // Home win
      pHome = 0.50 + Math.random() * 0.15; // 0.50 to 0.65
      pDraw = 0.20 + Math.random() * 0.08; // 0.20 to 0.28
      pAway = 1.0 - pHome - pDraw;
    } else if (m.score_home < m.score_away) {
      // Away win
      pAway = 0.50 + Math.random() * 0.15;
      pDraw = 0.20 + Math.random() * 0.08;
      pHome = 1.0 - pAway - pDraw;
    } else {
      // Draw
      pDraw = 0.38 + Math.random() * 0.12; // 0.38 to 0.50
      pHome = 0.25 + Math.random() * 0.10;
      pAway = 1.0 - pDraw - pHome;
    }
    
    // Total goals
    const totalGoals = m.score_home + m.score_away;
    let pOver, pUnder;
    if (totalGoals > 2.5) {
      pOver = 0.55 + Math.random() * 0.15; // 0.55 to 0.70
      pUnder = 1.0 - pOver;
    } else {
      pUnder = 0.55 + Math.random() * 0.15;
      pOver = 1.0 - pUnder;
    }
    
    await queryRun(db, `
      INSERT OR REPLACE INTO odds_cache (match_id, home_prob, draw_prob, away_prob, over25_prob, under25_prob, fetched_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `, [m.id, pHome, pDraw, pAway, pOver, pUnder]);
  }
  
  console.log('✅ Mock odds generation completed!');
}

generate().catch(console.error);
