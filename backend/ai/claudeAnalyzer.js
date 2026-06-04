const adjustmentCache = new Map();

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function normalizeAdjustment(adj) {
  const home = clamp(Number(adj?.home) || 0, -0.12, 0.12);
  const draw = clamp(Number(adj?.draw) || 0, -0.08, 0.08);
  const away = clamp(Number(adj?.away) || 0, -0.12, 0.12);
  const sum = home + draw + away;
  if (Math.abs(sum) > 1e-9) {
    return { home, draw, away: away - sum };
  }
  return { home, draw, away };
}

function getCacheKey(context) {
  return context.matchId ? `match:${context.matchId}` : `match:${context.homeTeam}|${context.awayTeam}`;
}

function getCachedResult(key) {
  const hit = adjustmentCache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.createdAt > 60 * 60 * 1000) {
    adjustmentCache.delete(key);
    return null;
  }
  return hit.value;
}

function setCachedResult(key, value) {
  adjustmentCache.set(key, { value, createdAt: Date.now() });
}

function analyzeTeamRecent(matches, teamId) {
  const last5 = (matches || []).slice(0, 5);
  if (last5.length === 0) {
    return { winRate5: 0.5, avgScored: 1.5, avgConceded: 1.5 };
  }
  
  let wins = 0;
  let totalScored = 0;
  let totalConceded = 0;
  
  for (const m of last5) {
    if (m.home_team_id === teamId) {
      totalScored += m.score_home;
      totalConceded += m.score_away;
      if (m.score_home > m.score_away) wins++;
    } else {
      totalScored += m.score_away;
      totalConceded += m.score_home;
      if (m.score_away > m.score_home) wins++;
    }
  }
  
  const count = last5.length;
  return {
    winRate5: wins / count,
    avgScored: totalScored / count,
    avgConceded: totalConceded / count
  };
}

function getAvgGoals(matches) {
  const last5 = (matches || []).slice(0, 5);
  if (last5.length === 0) return 2.5; // default fallback
  const total = last5.reduce((sum, m) => sum + m.score_home + m.score_away, 0);
  return total / last5.length;
}

export async function getAIAdjustment(context = {}) {
  const key = getCacheKey(context);
  const cached = getCachedResult(key);
  if (cached) return cached;

  try {
    const homeTeamId = context.homeTeamId;
    const awayTeamId = context.awayTeamId;
    const homeRecentMatches = context.homeRecentMatches || [];
    const awayRecentMatches = context.awayRecentMatches || [];

    // Fallback if team data isn't provided
    const homeStats = analyzeTeamRecent(homeRecentMatches, homeTeamId);
    const awayStats = analyzeTeamRecent(awayRecentMatches, awayTeamId);

    let homeAdj = 0;
    let drawAdj = 0;
    let awayAdj = 0;
    let ou_adjustment = 0;
    const triggeredRules = [];

    // Rule 1 — Form momentum: (1X2 adjustments disabled)
    if (homeStats.winRate5 >= 0.8 && awayStats.winRate5 <= 0.2) {
      triggeredRules.push('Form Momentum (Home strong - 1X2 disabled)');
    } else if (awayStats.winRate5 >= 0.8 && homeStats.winRate5 <= 0.2) {
      triggeredRules.push('Form Momentum (Away strong - 1X2 disabled)');
    }

    // Rule 2 — Goals momentum (tài/xỉu):
    const homeAvgGoals = getAvgGoals(homeRecentMatches);
    const awayAvgGoals = getAvgGoals(awayRecentMatches);
    const avgGoals5 = (homeAvgGoals + awayAvgGoals) / 2;
    if (homeAvgGoals > 1.8 && awayAvgGoals > 1.8) {
      if (avgGoals5 > 3.8) {
        ou_adjustment = 0.08;
        triggeredRules.push('High Goals Momentum');
      } else if (avgGoals5 < 1.4) {
        ou_adjustment = -0.08;
        triggeredRules.push('Low Goals Momentum');
      }
    }

    // Rule 3 — Defence vs Attack mismatch: (1X2 adjustments disabled)
    if (homeStats.avgScored > 2.5 && awayStats.avgConceded > 2.0) {
      triggeredRules.push('Attack/Defence mismatch (Home advantage - 1X2 disabled)');
    }
    if (awayStats.avgScored > 2.5 && homeStats.avgConceded > 2.0) {
      triggeredRules.push('Attack/Defence mismatch (Away advantage - 1X2 disabled)');
    }

    // Rule 4 — Cân bằng: (1X2 adjustments disabled)
    drawAdj = -(homeAdj + awayAdj);
    drawAdj = clamp(drawAdj, -0.08, 0.08);

    const adjustment = normalizeAdjustment({ home: homeAdj, draw: drawAdj, away: awayAdj });
    const key_factor = triggeredRules.length > 0 
      ? `Rule-based: ${triggeredRules.join(', ')}`
      : 'Rule-based: No momentum mismatch; standard baseline used';

    const value = {
      adjustment,
      ou_adjustment,
      confidence: 0.7,
      key_factor,
      applied: true
    };

    setCachedResult(key, value);
    return value;
  } catch (err) {
    console.error('[RuleAI] getAIAdjustment error:', err.message);
    const fallback = { adjustment: { home: 0, draw: 0, away: 0 }, ou_adjustment: 0, confidence: 0.7, key_factor: 'Rule engine error fallback', applied: true };
    setCachedResult(key, fallback);
    return fallback;
  }
}

export async function analyzeMatch(context) {
  const ai = await getAIAdjustment(context);
  return {
    keyFactors: [
      { factor: ai.key_factor || 'Rule-based adjustment applied', impact: ai.applied ? 'positive' : 'neutral', weight: 0.7 },
    ],
    riskLevel: 'medium',
    recommendation: `Rule-based calibration adjusted probabilities based on recent team forms.`,
    summary: `Rule-based calibration applied: ${ai.key_factor}`,
  };
}
