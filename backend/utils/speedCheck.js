import { performance } from 'node:perf_hooks';
import { predict } from '../models/predictor.js';

function buildSampleMatches(teamId, otherTeamId) {
  return [
    { date: '2024-05-01', home_team_id: teamId, away_team_id: otherTeamId, score_home: 2, score_away: 1 },
    { date: '2024-05-08', home_team_id: otherTeamId, away_team_id: teamId, score_home: 1, score_away: 3 },
    { date: '2024-05-15', home_team_id: teamId, away_team_id: otherTeamId, score_home: 1, score_away: 1 },
    { date: '2024-05-22', home_team_id: otherTeamId, away_team_id: teamId, score_home: 0, score_away: 2 },
    { date: '2024-05-29', home_team_id: teamId, away_team_id: otherTeamId, score_home: 3, score_away: 0 },
  ];
}

async function main() {
  const iterations = 200;
  const homeRecentMatches = buildSampleMatches(1, 2);
  const awayRecentMatches = buildSampleMatches(2, 1);

  const start = performance.now();
  for (let i = 0; i < iterations; i += 1) {
    predict({
      homeStats: { goals_scored: 18, goals_conceded: 12, matches_played: 30, xG: 17, xGA: 13 },
      awayStats: { goals_scored: 16, goals_conceded: 15, matches_played: 30, xG: 16, xGA: 14 },
      homeRecentMatches,
      awayRecentMatches,
      homeTeamId: 1,
      awayTeamId: 2,
      homeElo: 1600,
      awayElo: 1500,
      leagueAvgHome: 1.5,
      leagueAvgAway: 1.2,
      situationalFactors: {},
      h2hAvgGoals: 2.2,
      homeRestDays: 5,
      awayRestDays: 4,
      homeWinRate: 0.55,
      matchDate: '2024-06-01',
    });
  }

  const elapsedMs = performance.now() - start;
  const avgMs = elapsedMs / iterations;

  console.log(`Speed check: ${iterations} predictions in ${elapsedMs.toFixed(2)} ms`);
  console.log(`Average per prediction: ${avgMs.toFixed(3)} ms`);
}

main().catch((err) => {
  console.error('Speed check failed:', err);
  process.exit(1);
});
