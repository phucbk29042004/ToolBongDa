import { getDatabase, queryAll, queryGet } from '../db/database.js';
import { predict } from '../models/predictor.js';
import { blendWithBookmaker } from '../scrapers/oddsApi.js';
import { getAIAdjustment } from '../ai/claudeAnalyzer.js';

async function evaluateMatches(db, matches, name) {
  let correct1X2 = 0;
  let correctOU = 0;
  let correctScore = 0;
  let aiCorrect1X2 = 0;
  let aiCorrectOU = 0;
  let aiCorrectScore = 0;
  let aiAppliedCount = 0;

  for (const m of matches) {
    const matchDate = m.date;
    const homeId = m.home_team_id;
    const awayId = m.away_team_id;

    // Lấy league average goals trước ngày của trận đấu
    const leagueAvgHomeRow = await queryGet(db,
      `SELECT AVG(CAST(score_home AS REAL)) as avg
       FROM matches
       WHERE league = ? AND status = 'FINISHED' AND date < ? AND season = ?`,
      [m.league, matchDate, m.season]
    );
    const leagueAvgAwayRow = await queryGet(db,
      `SELECT AVG(CAST(score_away AS REAL)) as avg
       FROM matches
       WHERE league = ? AND status = 'FINISHED' AND date < ? AND season = ?`,
      [m.league, matchDate, m.season]
    );
    const leagueAvgHome = leagueAvgHomeRow?.avg || 1.5;
    const leagueAvgAway = leagueAvgAwayRow?.avg || 1.2;

    // H2H trước ngày trận đấu
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

    // 6 trận gần nhất trước ngày trận đấu cho home team
    const homeRecentMatches = await queryAll(db,
      `SELECT * FROM matches
       WHERE (home_team_id = ? OR away_team_id = ?)
         AND status = 'FINISHED' AND score_home IS NOT NULL AND score_away IS NOT NULL
         AND date < ?
       ORDER BY date DESC LIMIT 6`,
      [homeId, homeId, matchDate]
    );

    // 6 trận gần nhất trước ngày trận đấu cho away team
    const awayRecentMatches = await queryAll(db,
      `SELECT * FROM matches
       WHERE (home_team_id = ? OR away_team_id = ?)
         AND status = 'FINISHED' AND score_home IS NOT NULL AND score_away IS NOT NULL
         AND date < ?
       ORDER BY date DESC LIMIT 6`,
      [awayId, awayId, matchDate]
    );

    // Tính rest days trước trận đấu
    function calcRestDays(target, last) {
      if (!last || !target) return 4;
      const diff = Math.round((new Date(target) - new Date(last)) / (1000 * 60 * 60 * 24));
      return diff >= 0 ? diff : 4;
    }
    const homeRestDays = calcRestDays(matchDate, homeRecentMatches[0]?.date);
    const awayRestDays = calcRestDays(matchDate, awayRecentMatches[0]?.date);

    // Fetch last 10 finished home matches for home team before this match
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

    const homeStats = await queryGet(db,
      'SELECT * FROM team_stats WHERE team_id = ? AND season = ?',
      [homeId, m.season]
    ) || { goals_scored: 20, goals_conceded: 15, matches_played: 14, xG: 0, xGA: 0 };

    const awayStats = await queryGet(db,
      'SELECT * FROM team_stats WHERE team_id = ? AND season = ?',
      [awayId, m.season]
    ) || { goals_scored: 15, goals_conceded: 20, matches_played: 14, xG: 0, xGA: 0 };

    // Chạy predict engine
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
      homeRestDays,
      awayRestDays,
      homeWinRate,
      matchDate,
    });

    // Blend với Bookmaker Odds nếu có
    const blend = await blendWithBookmaker(pred.result, pred.overUnder, m.id, db);
    pred.result = blend.result;
    pred.overUnder = blend.overUnder;

    // Đảm bảo tính nhất quán tỉ số và Tài/Xỉu
    if (pred.scoreMatrix) {
      const predictedScoreTotal = pred.score.home + pred.score.away;
      const isScoreOver = predictedScoreTotal > 2.5;
      const isOuOver = pred.overUnder.prediction === 'Tài';

      if (isScoreOver !== isOuOver) {
        let maxProb = 0;
        let bestScore = pred.score;
        for (let i = 0; i < pred.scoreMatrix.length; i++) {
          for (let j = 0; j < pred.scoreMatrix[i].length; j++) {
            const total = i + j;
            const isCellOver = total > 2.5;
            if (isCellOver === isOuOver) {
              if (pred.scoreMatrix[i][j] > maxProb) {
                maxProb = pred.scoreMatrix[i][j];
                bestScore = { home: i, away: j };
              }
            }
          }
        }
        pred.score = bestScore;
      }
    }

    // AI Adjustment khi độ tự tin thấp
    const blendConfidence = Math.max(pred.result.home, pred.result.draw, pred.result.away);
    let aiAdjustment = { adjustment: { home: 0, draw: 0, away: 0 }, ou_adjustment: 0, confidence: 0, key_factor: '', applied: false };

    if (blendConfidence < 0.55) {
      aiAdjustment = await getAIAdjustment({
        matchId: m.id,
        homeTeamId: homeId,
        awayTeamId: awayId,
        homeRecentMatches,
        awayRecentMatches
      });

      if (aiAdjustment.applied) {
        aiAppliedCount++;
        pred.result.home = Math.max(0, Math.min(1, pred.result.home + aiAdjustment.adjustment.home));
        pred.result.draw = Math.max(0, Math.min(1, pred.result.draw + aiAdjustment.adjustment.draw));
        pred.result.away = Math.max(0, Math.min(1, pred.result.away + aiAdjustment.adjustment.away));
        
        const sum = pred.result.home + pred.result.draw + pred.result.away;
        if (sum > 0) {
          pred.result.home /= sum;
          pred.result.draw /= sum;
          pred.result.away /= sum;
        }

        if (aiAdjustment.ou_adjustment !== 0) {
          pred.overUnder.over25 = Math.max(0, Math.min(1, pred.overUnder.over25 + aiAdjustment.ou_adjustment));
          pred.overUnder.under25 = 1 - pred.overUnder.over25;
          pred.overUnder.prediction = pred.overUnder.over25 > 0.5 ? 'Tài' : 'Xỉu';

          // Cập nhật lại tính nhất quán của tỷ số sau khi điều chỉnh Tài/Xỉu
          if (pred.scoreMatrix) {
            const predictedScoreTotal = pred.score.home + pred.score.away;
            const isScoreOver = predictedScoreTotal > 2.5;
            const isOuOver = pred.overUnder.prediction === 'Tài';

            if (isScoreOver !== isOuOver) {
              let maxProb = 0;
              let bestScore = pred.score;
              for (let i = 0; i < pred.scoreMatrix.length; i++) {
                for (let j = 0; j < pred.scoreMatrix[i].length; j++) {
                  const total = i + j;
                  const isCellOver = total > 2.5;
                  if (isCellOver === isOuOver) {
                    if (pred.scoreMatrix[i][j] > maxProb) {
                      maxProb = pred.scoreMatrix[i][j];
                      bestScore = { home: i, away: j };
                    }
                  }
                }
              }
              pred.score = bestScore;
            }
          }
        }
      }
    }

    const actGF = m.score_home;
    const actGA = m.score_away;
    const actTotal = actGF + actGA;
    const act1X2 = actGF > actGA ? '1' : (actGF < actGA ? '2' : 'X');
    const actOU = actTotal > 2.5 ? 'Tài' : 'Xỉu';

    const predGF = pred.score.home;
    const predGA = pred.score.away;
    
    let pred1X2 = 'X';
    const maxProb = Math.max(pred.result.home, pred.result.draw, pred.result.away);
    if (maxProb === pred.result.home) pred1X2 = '1';
    else if (maxProb === pred.result.away) pred1X2 = '2';

    const predOU = pred.overUnder.prediction;

    const ok1X2 = act1X2 === pred1X2;
    const okOU = actOU === predOU;
    const okScore = actGF === predGF && actGA === predGA;

    if (ok1X2) correct1X2++;
    if (okOU) correctOU++;
    if (okScore) correctScore++;
    if (aiAdjustment.applied) {
      if (ok1X2) aiCorrect1X2++;
      if (okOU) aiCorrectOU++;
      if (okScore) aiCorrectScore++;
    }
  }

  return {
    name,
    total: matches.length,
    correct1X2,
    correctOU,
    correctScore,
    aiAppliedCount,
    aiCorrect1X2,
    aiCorrectOU,
    aiCorrectScore
  };
}

async function runBacktest() {
  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║           Football Predictor — Backtest Engine       ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  try {
    const db = await getDatabase();

    // 1. Định nghĩa 3 bộ test
    const testCases = [
      {
        name: 'Bộ 1: Giữa mùa 24/25 (11/2024 - 02/2025)',
        query: `
          SELECT m.*, ht.name as home_name, at.name as away_name,
                 ht.elo_rating as home_elo, at.elo_rating as away_elo
          FROM matches m
          JOIN teams ht ON m.home_team_id = ht.id
          JOIN teams at ON m.away_team_id = at.id
          WHERE m.status = 'FINISHED' AND m.score_home IS NOT NULL AND m.score_away IS NOT NULL
            AND m.date BETWEEN '2024-11-01' AND '2025-02-28'
          ORDER BY m.date DESC LIMIT 50
        `
      },
      {
        name: 'Bộ 2: Đầu mùa 24/25 (08/2024 - 11/2024)',
        query: `
          SELECT m.*, ht.name as home_name, at.name as away_name,
                 ht.elo_rating as home_elo, at.elo_rating as away_elo
          FROM matches m
          JOIN teams ht ON m.home_team_id = ht.id
          JOIN teams at ON m.away_team_id = at.id
          WHERE m.status = 'FINISHED' AND m.score_home IS NOT NULL AND m.score_away IS NOT NULL
            AND m.date BETWEEN '2024-08-01' AND '2024-10-31'
          ORDER BY m.date DESC LIMIT 50
        `
      },
      {
        name: 'Bộ 3: Mùa giải trước 23/24',
        query: `
          SELECT m.*, ht.name as home_name, at.name as away_name,
                 ht.elo_rating as home_elo, at.elo_rating as away_elo
          FROM matches m
          JOIN teams ht ON m.home_team_id = ht.id
          JOIN teams at ON m.away_team_id = at.id
          WHERE m.status = 'FINISHED' AND m.score_home IS NOT NULL AND m.score_away IS NOT NULL
            AND m.season = 2023
          ORDER BY m.date DESC LIMIT 50
        `
      }
    ];

    const results = [];

    for (const test of testCases) {
      console.log(`⏳ Đang chạy thử nghiệm: ${test.name}...`);
      const matches = await queryAll(db, test.query);
      
      if (matches.length === 0) {
        console.warn(`⚠️ Không tìm thấy trận đấu nào cho: ${test.name}`);
        continue;
      }
      
      const res = await evaluateMatches(db, matches, test.name);
      results.push(res);
      
      console.log(`   -> Hoàn thành (${matches.length} trận). 1X2: ${((res.correct1X2 / res.total) * 100).toFixed(1)}%, T/X: ${((res.correctOU / res.total) * 100).toFixed(1)}%\n`);
    }

    if (results.length === 0) {
      console.log('❌ Không có dữ liệu test case nào chạy thành công.');
      process.exit(1);
    }

    // 2. Xuất kết quả tổng hợp
    console.log('╔══════════════════════════════════════════════════════════════════════════════════════╗');
    console.log('║                          TỔNG KẾT HỆ SỐ CHÍNH XÁC CHI TIẾT                           ║');
    console.log('╚══════════════════════════════════════════════════════════════════════════════════════╝');
    
    let sum1X2 = 0;
    let sumOU = 0;
    let sumScore = 0;

    const summaryTable = results.map(r => {
      const acc1X2 = (r.correct1X2 / r.total) * 100;
      const accOU = (r.correctOU / r.total) * 100;
      const accScore = (r.correctScore / r.total) * 100;

      sum1X2 += acc1X2;
      sumOU += accOU;
      sumScore += accScore;

      return {
        'Bộ Thử Nghiệm': r.name,
        'Số Trận': r.total,
        'Chính Xác Tỷ Số': `${accScore.toFixed(1)}% (${r.correctScore}/${r.total})`,
        'Chính Xác 1X2': `${acc1X2.toFixed(1)}% (${r.correct1X2}/${r.total})`,
        'Chính Xác Tài/Xỉu': `${accOU.toFixed(1)}% (${r.correctOU}/${r.total})`,
        'Số trận áp dụng AI': r.aiAppliedCount
      };
    });

    console.table(summaryTable);

    const avg1X2 = sum1X2 / results.length;
    const avgOU = sumOU / results.length;
    const avgScore = sumScore / results.length;

    console.log('══════════════════════════════════════════════════════════════════════════════════════');
    console.log(`🏆 ĐỘ CHÍNH XÁC TRUNG BÌNH TỔNG (AVERAGE OVERALL):`);
    console.log(`   ⚽ Đúng tỉ số chính xác:     ${avgScore.toFixed(1)}%`);
    console.log(`   ⚖️  Đúng thắng/hòa/thua (1X2): ${avg1X2.toFixed(1)}%`);
    console.log(`   🥅 Đúng Tài/Xỉu 2.5:         ${avgOU.toFixed(1)}%`);
    console.log('══════════════════════════════════════════════════════════════════════════════════════\n');

    const stable1X2 = results.every(r => (r.correct1X2 / r.total) >= 0.70);
    const stableOU = results.every(r => (r.correctOU / r.total) >= 0.70);

    if (stable1X2 && stableOU) {
      console.log('🎉 ĐÁNH GIÁ: Model cực kỳ ỔN ĐỊNH và TIN CẬY trên cả 3 giai đoạn (Đều >= 70%!).');
    } else if (stable1X2) {
      console.log('💡 ĐÁNH GIÁ: Model đạt độ ổn định tốt ở dự đoán 1X2 (Đều >= 70%!), nhưng tỷ lệ Tài/Xỉu cần cải thiện thêm.');
    } else {
      console.log('⚠️ ĐÁNH GIÁ: Có sự chênh lệch lớn giữa các bộ test. Có thể model đang bị Overfit với tập dữ liệu gần đây.');
    }
    console.log('\n');

  } catch (err) {
    console.error('❌ Lỗi chạy backtest:', err.message);
  }
  process.exit(0);
}

runBacktest();
