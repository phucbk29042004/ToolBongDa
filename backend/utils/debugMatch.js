import { getDatabase, queryAll, queryGet } from '../db/database.js';
import { predict } from '../models/predictor.js';
import { blendWithBookmaker } from '../scrapers/oddsApi.js';

async function debug() {
  const db = await getDatabase();
  const matches = await queryAll(db, `
    SELECT m.*, ht.name as home, at.name as away,
           ht.elo_rating as home_elo, at.elo_rating as away_elo
    FROM matches m
    JOIN teams ht ON m.home_team_id = ht.id
    JOIN teams at ON m.away_team_id = at.id
    WHERE (ht.name LIKE '%Barcelona%' OR at.name LIKE '%Barcelona%')
      AND (ht.name LIKE '%Real Madrid%' OR at.name LIKE '%Real Madrid%')
    ORDER BY date DESC
  `);
  
  console.log('Matches found:', matches.map(m => ({ id: m.id, date: m.date, home: m.home, away: m.away, score: `${m.score_home}-${m.score_away}` })));
  
  // Find match close to May 11
  const m = matches.find(m => m.date.includes('-05-11') || m.date.includes('-05-10') || m.date.includes('-05-12')) || matches[0];
  if (!m) {
    console.log('No matches found near May 11.');
    return;
  }
  
  console.log('\n--- Debugging Match ---');
  console.log(`Match: ${m.home} vs ${m.away} on ${m.date} (Score: ${m.score_home}-${m.score_away})`);
  
  const homeId = m.home_team_id;
  const awayId = m.away_team_id;
  const matchDate = m.date;

  const homeStats = await queryGet(db,
    'SELECT * FROM team_stats WHERE team_id = ? ORDER BY season DESC LIMIT 1',
    [homeId]
  ) || { goals_scored: 0, goals_conceded: 0, matches_played: 0, xG: 0, xGA: 0 };

  const awayStats = await queryGet(db,
    'SELECT * FROM team_stats WHERE team_id = ? ORDER BY season DESC LIMIT 1',
    [awayId]
  ) || { goals_scored: 0, goals_conceded: 0, matches_played: 0, xG: 0, xGA: 0 };

  const targetDateObj = new Date(matchDate);
  const targetYear = targetDateObj.getFullYear();
  const targetMonth = targetDateObj.getMonth() + 1;
  const season = targetMonth >= 7 ? targetYear : targetYear - 1;

  const leagueAvgHomeRow = await queryGet(db,
    `SELECT AVG(CAST(score_home AS REAL)) as avg
     FROM matches
     WHERE league = ? AND status = 'FINISHED' AND season = ? AND date < ?`,
    [m.league, season, matchDate]
  );
  const leagueAvgAwayRow = await queryGet(db,
    `SELECT AVG(CAST(score_away AS REAL)) as avg
     FROM matches
     WHERE league = ? AND status = 'FINISHED' AND season = ? AND date < ?`,
    [m.league, season, matchDate]
  );
  const leagueAvgHome = leagueAvgHomeRow?.avg || 1.5;
  const leagueAvgAway = leagueAvgAwayRow?.avg || 1.2;

  const h2hMatches = await queryAll(db,
    `SELECT score_home, score_away FROM matches
     WHERE ((home_team_id = ? AND away_team_id = ?) OR (home_team_id = ? AND away_team_id = ?))
       AND status = 'FINISHED' AND score_home IS NOT NULL AND score_away IS NOT NULL
       AND date < ?
     ORDER BY date DESC LIMIT 5`,
    [homeId, awayId, awayId, homeId, matchDate]
  );

  let h2hAvgGoals = 0;
  if (h2hMatches.length > 0) {
    const totalGoals = h2hMatches.reduce((sum, hm) => sum + hm.score_home + hm.score_away, 0);
    h2hAvgGoals = totalGoals / h2hMatches.length;
  }

  const homeRecentMatches = await queryAll(db,
    `SELECT * FROM matches
     WHERE (home_team_id = ? OR away_team_id = ?)
       AND status = 'FINISHED' AND score_home IS NOT NULL AND score_away IS NOT NULL
       AND date < ?
     ORDER BY date DESC LIMIT 6`,
    [homeId, homeId, matchDate]
  );

  const awayRecentMatches = await queryAll(db,
    `SELECT * FROM matches
     WHERE (home_team_id = ? OR away_team_id = ?)
       AND status = 'FINISHED' AND score_home IS NOT NULL AND score_away IS NOT NULL
       AND date < ?
     ORDER BY date DESC LIMIT 6`,
    [awayId, awayId, matchDate]
  );

  const homeHomeMatches = await queryAll(db,
    `SELECT score_home, score_away FROM matches
     WHERE home_team_id = ? AND status = 'FINISHED' AND score_home IS NOT NULL AND score_away IS NOT NULL
       AND date < ?
     ORDER BY date DESC LIMIT 10`,
    [homeId, matchDate]
  );

  let homeWinRate = 0.5;
  if (homeHomeMatches.length > 0) {
    const wins = homeHomeMatches.filter(hm => hm.score_home > hm.score_away).length;
    homeWinRate = wins / homeHomeMatches.length;
  }

  const pred = predict({
    homeStats,
    awayStats,
    homeRecentMatches,
    awayRecentMatches,
    homeTeamId: homeId,
    awayTeamId: awayId,
    homeElo: m.home_elo || 1500,
    awayElo: m.away_elo || 1500,
    leagueAvgHome,
    leagueAvgAway,
    situationalFactors: {},
    h2hAvgGoals,
    homeRestDays: 4,
    awayRestDays: 4,
    homeWinRate,
    matchDate,
  });

  console.log('\n--- Predictor Result (Before Odds Blend) ---');
  console.log('Lambdas:', pred.lambdas);
  console.log('Predicted Score:', pred.score);
  console.log('Result Probs:', pred.result);
  console.log('Over/Under Probs:', pred.overUnder);
  
  const blend = await blendWithBookmaker(pred.result, pred.overUnder, m.id, db);
  console.log('\n--- Blended Result ---');
  console.log('Blended Result Probs:', blend.result);
  console.log('Blended Over/Under:', blend.overUnder);
}

debug().catch(console.error);
