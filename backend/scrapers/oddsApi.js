import axios from 'axios';
import dotenv from 'dotenv';
import { getDatabase, queryGet, queryRun } from '../db/database.js';

dotenv.config();

// Smart matching helpers
function normalizeName(name) {
  if (!name) return '';
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\b(fc|cf|rcd|rc|ud|sd|sv|de|club|real|afc|town|city|hotspur|wanderers|albion|munich|munchen|athletics|sporting|united|utd|atletico|athletic|bayer|borussia)\b/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .trim()
    .split(/\s+/)
    .filter(word => word.length > 0)
    .join(' ');
}

function isMatch(name1, name2) {
  const n1 = normalizeName(name1);
  const n2 = normalizeName(name2);
  if (!n1 || !n2) {
    const simple1 = name1.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    const simple2 = name2.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
    return simple1.includes(simple2) || simple2.includes(simple1);
  }
  return n1.includes(n2) || n2.includes(n1) || n1.split(' ').some(w => n2.split(' ').includes(w));
}

/**
 * Fetch odds and save to DB
 */
export async function fetchAndStoreOdds() {
  const apiKey = process.env.ODDS_API_KEY;
  if (!apiKey || apiKey === 'your_key_here') {
    console.warn('[Odds] ODDS_API_KEY is not configured in .env. Skipping API fetch.');
    return;
  }

  const db = await getDatabase();
  const url = `https://api.the-odds-api.com/v4/sports/soccer_epl/odds`;

  console.log(`[Odds] Fetching odds from: ${url}`);

  try {
    const res = await axios.get(url, {
      params: {
        apiKey,
        regions: 'eu',
        markets: 'h2h,totals',
        oddsFormat: 'decimal'
      },
      timeout: 15000
    });

    const matchesData = res.data;
    if (!Array.isArray(matchesData)) {
      console.warn('[Odds] API did not return a valid array of matches.');
      return;
    }

    console.log(`[Odds] Received ${matchesData.length} matches from Odds API.`);

    const dbMatches = await queryAll(db, `
      SELECT m.id, m.date, m.status, ht.name as home_name, at.name as away_name
      FROM matches m
      JOIN teams ht ON m.home_team_id = ht.id
      JOIN teams at ON m.away_team_id = at.id
    `);

    for (const match of matchesData) {
      const matchDate = match.commence_time.split('T')[0];

      // Find database match using smart matching
      let dbMatch = dbMatches.find(m => 
        m.date === matchDate && 
        isMatch(m.home_name, match.home_team) && 
        isMatch(m.away_name, match.away_team)
      );

      if (!dbMatch) {
        dbMatch = dbMatches.find(m => 
          m.status === 'SCHEDULED' && 
          isMatch(m.home_name, match.home_team) && 
          isMatch(m.away_name, match.away_team)
        );
      }

      if (!dbMatch) {
        continue;
      }

      // Calculate fair odds probabilities across bookmakers
      let totalH2HCount = 0;
      let sumHomeProb = 0;
      let sumDrawProb = 0;
      let sumAwayProb = 0;

      let totalTotalsCount = 0;
      let sumOverProb = 0;
      let sumUnderProb = 0;

      if (match.bookmakers && Array.isArray(match.bookmakers)) {
        for (const bookmaker of match.bookmakers) {
          const h2hMarket = bookmaker.markets.find(m => m.key === 'h2h');
          if (h2hMarket) {
            const homeOutcome = h2hMarket.outcomes.find(o => o.name === match.home_team);
            const awayOutcome = h2hMarket.outcomes.find(o => o.name === match.away_team);
            const drawOutcome = h2hMarket.outcomes.find(o => o.name === 'Draw');
            if (homeOutcome && awayOutcome && drawOutcome) {
              const oddHome = parseFloat(homeOutcome.price);
              const oddAway = parseFloat(awayOutcome.price);
              const oddDraw = parseFloat(drawOutcome.price);
              const pHome = 1 / oddHome;
              const pAway = 1 / oddAway;
              const pDraw = 1 / oddDraw;
              const overround = pHome + pDraw + pAway;
              sumHomeProb += pHome / overround;
              sumDrawProb += pDraw / overround;
              sumAwayProb += pAway / overround;
              totalH2HCount++;
            }
          }

          const totalsMarket = bookmaker.markets.find(m => m.key === 'totals');
          if (totalsMarket) {
            const overOutcome = totalsMarket.outcomes.find(o => o.name === 'Over' && o.point === 2.5);
            const underOutcome = totalsMarket.outcomes.find(o => o.name === 'Under' && o.point === 2.5);
            if (overOutcome && underOutcome) {
              const oddOver = parseFloat(overOutcome.price);
              const oddUnder = parseFloat(underOutcome.price);
              const pOver = 1 / oddOver;
              const pUnder = 1 / oddUnder;
              const overround = pOver + pUnder;
              sumOverProb += pOver / overround;
              sumUnderProb += pUnder / overround;
              totalTotalsCount++;
            }
          }
        }
      }

      if (totalH2HCount > 0) {
        const avgHome = sumHomeProb / totalH2HCount;
        const avgDraw = sumDrawProb / totalH2HCount;
        const avgAway = sumAwayProb / totalH2HCount;
        const avgOver = totalTotalsCount > 0 ? (sumOverProb / totalTotalsCount) : 0.5;
        const avgUnder = totalTotalsCount > 0 ? (sumUnderProb / totalTotalsCount) : 0.5;

        await queryRun(db,
          `INSERT INTO odds_cache (match_id, home_prob, draw_prob, away_prob, over25_prob, under25_prob, fetched_at)
           VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
           ON CONFLICT(match_id) DO UPDATE SET
             home_prob = excluded.home_prob,
             draw_prob = excluded.draw_prob,
             away_prob = excluded.away_prob,
             over25_prob = excluded.over25_prob,
             under25_prob = excluded.under25_prob,
             fetched_at = CURRENT_TIMESTAMP`,
          [dbMatch.id, avgHome, avgDraw, avgAway, avgOver, avgUnder]
        );
        console.log(`[Odds] Saved odds for ${match.home_team} vs ${match.away_team} (Match ID: ${dbMatch.id})`);
      }
    }
  } catch (err) {
    console.error(`[Odds] Error fetching/storing odds: ${err.message}`);
  }
}

/**
 * Blend Poisson probabilities with bookmaker implied probabilities (0.55 / 0.45 weight)
 */
export async function blendWithBookmaker(poissonResult, poissonOU, matchId, db) {
  const database = db || await getDatabase();
  try {
    // Check cache within 6 hours
    const odds = await queryGet(database,
      `SELECT * FROM odds_cache 
       WHERE match_id = ? AND datetime(fetched_at, '+6 hours') >= datetime('now')`,
      [matchId]
    );

    if (odds) {
      const blendedResult = {
        home: 0.35 * poissonResult.home + 0.65 * odds.home_prob,
        draw: 0.35 * poissonResult.draw + 0.65 * odds.draw_prob,
        away: 0.35 * poissonResult.away + 0.65 * odds.away_prob
      };
      
      const blendedOU = {
        over25: 0.35 * poissonOU.over25 + 0.65 * odds.over25_prob,
        under25: 0.35 * poissonOU.under25 + 0.65 * odds.under25_prob,
        prediction: (0.35 * poissonOU.over25 + 0.65 * odds.over25_prob) > 0.5 ? 'Tài' : 'Xỉu'
      };

      return { result: blendedResult, overUnder: blendedOU, blended: true };
    }
  } catch (e) {
    console.error('[Odds] blendWithBookmaker error:', e.message);
  }
  return { result: poissonResult, overUnder: poissonOU, blended: false };
}

// Self-run entry point
async function main() {
  await fetchAndStoreOdds();
  process.exit(0);
}

const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('oddsApi.js') || 
  process.argv[1].endsWith('oddsApi')
);

if (isDirectRun) {
  main().catch(err => {
    console.error('Odds fetcher failed:', err);
    process.exit(1);
  });
}
