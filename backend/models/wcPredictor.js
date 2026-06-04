import { getDatabase, queryGet, queryAll } from '../db/database.js';
import { calcLambda, buildScoreMatrix, calcResultProbs, calcOverUnder, getMostLikelyScore } from './poisson.js';
import { applyDixonColes } from './dixonColes.js';
import { eloToProbabilityAdjustment } from './elo.js';

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

const TOP_10_TEAMS = ["Argentina", "France", "Spain", "England", "Brazil", "Portugal", "Germany", "Netherlands", "Belgium", "Uruguay"];
const DEBUT_TEAMS = ["Haiti", "Curacao", "Cape Verde"];

const clamp = (val, min, max) => Math.min(max, Math.max(min, val));

export async function predictWCMatch(team1_en, team2_en, context = {}) {
  const db = context.db || await getDatabase();

  // Get info from DB or use fallback
  const t1 = await queryGet(db, 'SELECT * FROM national_teams WHERE name = ?', [team1_en]);
  const t2 = await queryGet(db, 'SELECT * FROM national_teams WHERE name = ?', [team2_en]);

  const elo1 = t1?.elo_rating || DEFAULT_ELO[team1_en] || 1500;
  const elo2 = t2?.elo_rating || DEFAULT_ELO[team2_en] || 1500;

  // Lấy stats từ national_team_stats (ưu tiên WCQ > NL > WC > Friendly)
  const getBestStats = async (teamId) => {
    if (!teamId) return null;
    const allStats = await queryAll(db, 'SELECT * FROM national_team_stats WHERE team_id = ?', [teamId]);
    const priorities = ['WCQ', 'NL', 'WC', 'Friendly'];
    for (const p of priorities) {
      const found = allStats.find(s => s.competition === p);
      if (found) return found;
    }
    return allStats[0] || null;
  };

  const stats1 = await getBestStats(t1?.id);
  const stats2 = await getBestStats(t2?.id);

  const key_factors = [];
  let lambda1 = 0;
  let lambda2 = 0;

  if (stats1 && stats2 && stats1.matches_played > 0 && stats2.matches_played > 0) {
    const goalsScored1 = stats1.avg_goals_scored;
    const goalsConceded1 = stats1.avg_goals_conceded;
    const goalsScored2 = stats2.avg_goals_scored;
    const goalsConceded2 = stats2.avg_goals_conceded;

    lambda1 = goalsScored1 * goalsConceded2;
    lambda2 = goalsScored2 * goalsConceded1;
  } else {
    // ELO-only prediction fallback
    const elo_diff = elo1 - elo2;
    const win_prob = 1 / (1 + Math.pow(10, -elo_diff / 400));
    // Estimate expected goals assuming 2.5 average sum
    lambda1 = 2.5 * win_prob;
    lambda2 = 2.5 * (1 - win_prob);
    key_factors.push({ factor: 'Sử dụng dự đoán thuần ELO do thiếu thống kê bàn thắng', impact: 0, icon: '📊' });
  }

  // 1. Không có home advantage (home_multiplier = 1.0) -> lambda giữ nguyên

  // 2. ELO adjustment
  const elo_diff = elo1 - elo2;
  lambda1 *= clamp(1 + elo_diff / 2000, 0.7, 1.4);
  lambda2 *= clamp(1 - elo_diff / 2000, 0.7, 1.4);
  if (Math.abs(elo_diff) > 100) {
    key_factors.push({ factor: `Hiệu chỉnh ELO chênh lệch: ${elo_diff.toFixed(0)}`, impact: elo_diff / 2000, icon: '📈' });
  }

  // 3. Tournament factor
  if (TOP_10_TEAMS.includes(team1_en)) {
    lambda1 *= 1.05;
    key_factors.push({ factor: `Top 10 FIFA (${team1_en})`, impact: 0.05, icon: '⭐' });
  }
  if (TOP_10_TEAMS.includes(team2_en)) {
    lambda2 *= 1.05;
    key_factors.push({ factor: `Top 10 FIFA (${team2_en})`, impact: 0.05, icon: '⭐' });
  }

  const isT1Weak = DEFAULT_ELO[team1_en] < 1550 || (t1?.fifa_ranking && t1.fifa_ranking > 50);
  const isT2Weak = DEFAULT_ELO[team2_en] < 1550 || (t2?.fifa_ranking && t2.fifa_ranking > 50);
  if (isT1Weak) {
    lambda1 *= 0.92;
    key_factors.push({ factor: `Hạng FIFA ngoài 50 (${team1_en})`, impact: -0.08, icon: '📉' });
  }
  if (isT2Weak) {
    lambda2 *= 0.92;
    key_factors.push({ factor: `Hạng FIFA ngoài 50 (${team2_en})`, impact: -0.08, icon: '📉' });
  }

  if (DEBUT_TEAMS.includes(team1_en)) {
    lambda1 *= 0.85;
    key_factors.push({ factor: `Áp lực lần đầu dự World Cup (${team1_en})`, impact: -0.15, icon: '😰' });
  }
  if (DEBUT_TEAMS.includes(team2_en)) {
    lambda2 *= 0.85;
    key_factors.push({ factor: `Áp lực lần đầu dự World Cup (${team2_en})`, impact: -0.15, icon: '😰' });
  }

  // Build Poisson Matrix
  let scoreMatrix = buildScoreMatrix(lambda1, lambda2);

  // Dixon-Coles correction (rho = -0.10 cho WC)
  scoreMatrix = applyDixonColes(scoreMatrix, lambda1, lambda2, -0.10);

  // Normalize matrix
  let matrixSum = 0;
  for (let i = 0; i < scoreMatrix.length; i++) {
    for (let j = 0; j < scoreMatrix[i].length; j++) {
      matrixSum += scoreMatrix[i][j];
    }
  }
  if (matrixSum > 0) {
    for (let i = 0; i < scoreMatrix.length; i++) {
      for (let j = 0; j < scoreMatrix[i].length; j++) {
        scoreMatrix[i][j] /= matrixSum;
      }
    }
  }

  // Extract result probabilities
  const rawProbs = calcResultProbs(scoreMatrix);

  // Blend with ELO adjustment (30% weight)
  const eloWinProb = eloToProbabilityAdjustment(elo1, elo2);
  const eloHome = eloWinProb;
  const eloAway = 1 - eloWinProb;
  const rawDraw = rawProbs.draw;

  const blendedHome = 0.70 * rawProbs.home + 0.30 * eloHome * (1 - rawDraw);
  const blendedAway = 0.70 * rawProbs.away + 0.30 * eloAway * (1 - rawDraw);
  const total = blendedHome + rawDraw + blendedAway;

  const resultProbs = {
    home: blendedHome / total,
    draw: rawDraw / total,
    away: blendedAway / total
  };

  // Over/Under and predicted score
  const overUnder = calcOverUnder(scoreMatrix);
  let predictedScore = getMostLikelyScore(scoreMatrix);

  // Enforce consistency between score and Over/Under
  const expectedTotalGoals = lambda1 + lambda2;
  const predictedOU = expectedTotalGoals > 2.5 ? 'Tài' : 'Xỉu';

  const predictedScoreTotal = predictedScore.home + predictedScore.away;
  const isScoreOver = predictedScoreTotal > 2.5;
  const isOuOver = predictedOU === 'Tài';

  if (isScoreOver !== isOuOver) {
    let maxProb = 0;
    let bestScore = predictedScore;
    for (let i = 0; i < scoreMatrix.length; i++) {
      for (let j = 0; j < scoreMatrix[i].length; j++) {
        const total = i + j;
        const isCellOver = total > 2.5;
        if (isCellOver === isOuOver) {
          if (scoreMatrix[i][j] > maxProb) {
            maxProb = scoreMatrix[i][j];
            bestScore = { home: i, away: j };
          }
        }
      }
    }
    predictedScore = bestScore;
  }

  const confidence = Math.round((Math.max(resultProbs.home, resultProbs.draw, resultProbs.away) * 0.7 + 0.3) * 100) / 100;

  return {
    score: predictedScore,
    result_probs: {
      home: Math.round(resultProbs.home * 100) / 100,
      draw: Math.round(resultProbs.draw * 100) / 100,
      away: Math.round(resultProbs.away * 100) / 100
    },
    over_under: {
      over25: Math.round(overUnder.over * 100) / 100,
      under25: Math.round(overUnder.under * 100) / 100,
      prediction: predictedOU
    },
    confidence,
    key_factors
  };
}
