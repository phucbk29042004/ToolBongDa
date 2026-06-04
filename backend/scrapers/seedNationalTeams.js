import { getDatabase, queryRun, queryGet, queryAll } from '../db/database.js';
import { footballDataGet, apiDelay } from '../utils/apiClient.js';

const DELAY_MS = 7000; // 7 seconds delay between API calls

const INITIAL_ELO_MAP = {
  "Argentina": 1900, "France": 1880, "Brazil": 1860, "England": 1850, "Belgium": 1840,
  "Croatia": 1820, "Portugal": 1810, "Netherlands": 1800, "Spain": 1850, "Italy": 1780,
  "Morocco": 1680, "Germany": 1720, "Uruguay": 1700, "Colombia": 1690, "USA": 1650,
  "Mexico": 1640, "Japan": 1660, "South Korea": 1630, "Switzerland": 1620, "Austria": 1610,
  "Senegal": 1600, "Ukraine": 1580, "Sweden": 1590, "Norway": 1560, "Turkey": 1570,
  "Scotland": 1550, "Czech Republic": 1560, "Paraguay": 1530, "Ecuador": 1540,
  "Ivory Coast": 1540, "Egypt": 1530, "Tunisia": 1520, "Algeria": 1520, "Australia": 1550,
  "Saudi Arabia": 1500, "Qatar": 1500, "Iraq": 1480, "Uzbekistan": 1470, "Jordan": 1460,
  "South Africa": 1450, "DR Congo": 1440, "Ghana": 1430, "Panama": 1440,
  "Haiti": 1300, "Cape Verde": 1350, "Bosnia Herzegovina": 1380, "New Zealand": 1280,
  "Curacao": 1250
};

const CONFEDERATIONS = {
  // UEFA
  "France": "UEFA", "England": "UEFA", "Belgium": "UEFA", "Croatia": "UEFA", "Portugal": "UEFA",
  "Netherlands": "UEFA", "Spain": "UEFA", "Italy": "UEFA", "Germany": "UEFA", "Switzerland": "UEFA",
  "Austria": "UEFA", "Sweden": "UEFA", "Norway": "UEFA", "Turkey": "UEFA", "Scotland": "UEFA",
  "Czech Republic": "UEFA", "Bosnia Herzegovina": "UEFA",
  // CONMEBOL
  "Argentina": "CONMEBOL", "Brazil": "CONMEBOL", "Uruguay": "CONMEBOL", "Colombia": "CONMEBOL",
  "Paraguay": "CONMEBOL", "Ecuador": "CONMEBOL",
  // CAF
  "Morocco": "CAF", "Senegal": "CAF", "Egypt": "CAF", "Tunisia": "CAF", "Algeria": "CAF",
  "South Africa": "CAF", "DR Congo": "CAF", "Ghana": "CAF", "Cape Verde": "CAF", "Ivory Coast": "CAF",
  // AFC
  "Japan": "AFC", "South Korea": "AFC", "Australia": "AFC", "Saudi Arabia": "AFC", "Qatar": "AFC",
  "Iraq": "AFC", "Uzbekistan": "AFC", "Jordan": "AFC", "Iran": "AFC",
  // CONCACAF
  "USA": "CONCACAF", "Mexico": "CONCACAF", "Panama": "CONCACAF", "Haiti": "CONCACAF", "Curacao": "CONCACAF",
  // OFC
  "New Zealand": "OFC"
};

const TEAM_VI_MAP = {
  "Mexico": "Mexico", "South Africa": "Nam Phi", "South Korea": "Hàn Quốc", "Czech Republic": "CH Séc",
  "Canada": "Canada", "Bosnia Herzegovina": "Bosnia", "Qatar": "Qatar", "Switzerland": "Thụy Sĩ",
  "Brazil": "Brazil", "Morocco": "Marocco", "Haiti": "Haiti", "Scotland": "Scotland",
  "USA": "Mỹ", "Paraguay": "Paraguay", "Australia": "Úc", "Turkey": "Thổ Nhĩ Kỳ",
  "Germany": "Đức", "Curacao": "Curacao", "Ivory Coast": "Bờ Biển Ngà", "Ecuador": "Ecuador",
  "Netherlands": "Hà Lan", "Japan": "Nhật Bản", "Sweden": "Thụy Điển", "Tunisia": "Tunisia",
  "Belgium": "Bỉ", "Egypt": "Ai Cập", "Iran": "Iran", "New Zealand": "New Zealand",
  "Spain": "Tây Ban Nha", "Cape Verde": "Cabo Verde", "Saudi Arabia": "Saudi Arabia",
  "Uruguay": "Uruguay", "France": "Pháp", "Senegal": "Senegal", "Iraq": "Iraq",
  "Norway": "Na Uy", "Argentina": "Argentina", "Austria": "Áo", "Jordan": "Jordan",
  "Algeria": "Algeria", "Portugal": "Bồ Đào Nha", "DR Congo": "CHDC Congo",
  "Uzbekistan": "Uzbekistan", "Colombia": "Colombia", "England": "Anh",
  "Croatia": "Croatia", "Ghana": "Ghana", "Panama": "Panama"
};

function getConfederation(name) {
  return CONFEDERATIONS[name] || "Other";
}

function getInitialElo(name) {
  return INITIAL_ELO_MAP[name] || 1400;
}

async function run() {
  const db = await getDatabase();
  console.log('[Seed ĐTQG] Đang chuẩn bị lấy dữ liệu từ football-data.org...');

  const competitions = [
    { code: 'WC', season: 2022, category: 'WC' },
    { code: 'BSA', season: 2026, category: 'WCQ' },
    { code: 'ECQ', season: 2024, category: 'WCQ' }, // Euro/WC Qualifiers
    { code: 'UNL', season: 2024, category: 'NL' }
  ];

  const allMatches = [];
  const rawTeams = new Map();

  for (const comp of competitions) {
    try {
      console.log(`⏳ Đang gọi API cho giải đấu: ${comp.code} (Mùa ${comp.season})...`);
      const data = await footballDataGet(`/competitions/${comp.code}/matches`, { season: comp.season });
      const matches = data.matches || [];
      console.log(`✅ Lấy được ${matches.length} trận đấu cho ${comp.code}`);

      for (const m of matches) {
        if (!m.homeTeam?.name || !m.awayTeam?.name) continue;
        
        // Lưu thông tin team để tạo national_teams sau
        rawTeams.set(m.homeTeam.name, { id: m.homeTeam.id, name: m.homeTeam.name });
        rawTeams.set(m.awayTeam.name, { id: m.awayTeam.id, name: m.awayTeam.name });

        if (m.status === 'FINISHED' && m.score?.fullTime?.home !== null) {
          allMatches.push({
            id: m.id,
            homeTeam: m.homeTeam.name,
            awayTeam: m.awayTeam.name,
            scoreHome: m.score.fullTime.home,
            scoreAway: m.score.fullTime.away,
            date: m.utcDate,
            competition: comp.category,
            season: String(comp.season)
          });
        }
      }
      
      console.log(`⏳ Chờ ${DELAY_MS / 1000} giây để không vượt quá rate limit...`);
      await apiDelay(DELAY_MS);
    } catch (err) {
      console.warn(`⚠️ Bỏ qua giải đấu ${comp.code} do lỗi: ${err.message}`);
    }
  }

  // Sắp xếp các trận đấu theo thứ tự thời gian tăng dần để tính ELO
  allMatches.sort((a, b) => new Date(a.date) - new Date(b.date));
  console.log(`📊 Bắt đầu tính toán ELO và thống kê cho ${allMatches.length} trận đấu...`);

  // Lưu trữ ELO và Stats trong bộ nhớ
  const eloMap = new Map();
  const statsMap = new Map(); // teamName -> comp -> season -> statsObj

  // Khởi tạo các đội
  for (const [name, info] of rawTeams.entries()) {
    eloMap.set(name, getInitialElo(name));
  }

  for (const m of allMatches) {
    const homeElo = eloMap.get(m.homeTeam) || 1400;
    const awayElo = eloMap.get(m.awayTeam) || 1400;

    // Tính K-factor
    let K = 10;
    if (m.competition === 'WCQ') K = 40;
    else if (m.competition === 'NL' || m.competition === 'WC') K = 30;

    // Công thức ELO mong đợi
    const expHome = 1 / (1 + Math.pow(10, (awayElo - homeElo) / 400));
    const expAway = 1 - expHome;

    let actHome = 0.5;
    let actAway = 0.5;
    if (m.scoreHome > m.scoreAway) {
      actHome = 1;
      actAway = 0;
    } else if (m.scoreHome < m.scoreAway) {
      actHome = 0;
      actAway = 1;
    }

    const newHomeElo = homeElo + K * (actHome - expHome);
    const newAwayElo = awayElo + K * (actAway - expAway);

    eloMap.set(m.homeTeam, newHomeElo);
    eloMap.set(m.awayTeam, newAwayElo);

    // Cập nhật thống kê
    const updateStats = (team, comp, season, gf, ga, isHome) => {
      if (!statsMap.has(team)) statsMap.set(team, {});
      if (!statsMap.get(team)[comp]) statsMap.get(team)[comp] = {};
      if (!statsMap.get(team)[comp][season]) {
        statsMap.get(team)[comp][season] = {
          matches_played: 0, goals_scored: 0, goals_conceded: 0,
          wins: 0, draws: 0, losses: 0, clean_sheets: 0
        };
      }
      const s = statsMap.get(team)[comp][season];
      s.matches_played++;
      s.goals_scored += gf;
      s.goals_conceded += ga;
      if (gf > ga) s.wins++;
      else if (gf === ga) s.draws++;
      else s.losses++;
      if (ga === 0) s.clean_sheets++;
    };

    updateStats(m.homeTeam, m.competition, m.season, m.scoreHome, m.scoreAway, true);
    updateStats(m.awayTeam, m.competition, m.season, m.scoreAway, m.scoreHome, false);
  }

  // Lưu ĐTQG vào DB
  console.log('[Seed ĐTQG] Đang cập nhật dữ liệu ĐTQG vào database...');
  for (const [name, info] of rawTeams.entries()) {
    const elo = eloMap.get(name) || 1400;
    const nameVi = TEAM_VI_MAP[name] || name;
    const conf = getConfederation(name);

    const existing = await queryGet(db, 'SELECT id FROM national_teams WHERE name = ?', [name]);
    if (existing) {
      await queryRun(db,
        `UPDATE national_teams
         SET name_vi = ?, confederation = ?, elo_rating = ?, updated_at = CURRENT_TIMESTAMP
         WHERE id = ?`,
        [nameVi, conf, elo, existing.id]
      );
    } else {
      await queryRun(db,
        `INSERT INTO national_teams (id, name, name_vi, confederation, elo_rating)
         VALUES (?, ?, ?, ?, ?)`,
        [info.id, name, nameVi, conf, elo]
      );
    }
  }

  // Lưu thống kê vào DB
  console.log('[Seed ĐTQG] Đang cập nhật thống kê đội tuyển (national_team_stats) vào database...');
  for (const [teamName, comps] of statsMap.entries()) {
    const team = await queryGet(db, 'SELECT id FROM national_teams WHERE name = ?', [teamName]);
    if (!team) continue;

    for (const [comp, seasons] of Object.entries(comps)) {
      for (const [season, s] of Object.entries(seasons)) {
        const avg_gf = s.goals_scored / s.matches_played;
        const avg_ga = s.goals_conceded / s.matches_played;

        await queryRun(db,
          `INSERT OR REPLACE INTO national_team_stats (
            team_id, competition, season, matches_played, goals_scored, goals_conceded,
            wins, draws, losses, avg_goals_scored, avg_goals_conceded, clean_sheets, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
          [
            team.id, comp, season, s.matches_played, s.goals_scored, s.goals_conceded,
            s.wins, s.draws, s.losses, avg_gf, avg_ga, s.clean_sheets
          ]
        );
      }
    }
  }

  console.log('🎉 Seed ĐTQG hoàn tất thành công!');
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Lỗi seed ĐTQG:', err);
  process.exit(1);
});
