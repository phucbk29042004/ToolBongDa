import fs from 'fs';
import path from 'path';
import { getDatabase, queryRun, queryGet, queryAll } from '../db/database.js';

// Map Understat team names to exact DB names
const TEAM_MAP = {
  "Aston Villa": "Aston Villa FC",
  "Manchester City": "Manchester City FC",
  "Arsenal": "Arsenal FC",
  "Chelsea": "Chelsea FC",
  "Liverpool": "Liverpool FC",
  "Manchester United": "Manchester United FC",
  "Tottenham": "Tottenham Hotspur FC",
  "Newcastle United": "Newcastle United FC",
  "Wolverhampton Wanderers": "Wolverhampton Wanderers FC",
  "Wolves": "Wolverhampton Wanderers FC",
  "West Ham": "West Ham United FC",
  "Brighton": "Brighton & Hove Albion FC",
  "Leicester": "Leicester City FC",
  "Nottingham Forest": "Nottingham Forest FC",
  "Crystal Palace": "Crystal Palace FC",
  "Brentford": "Brentford FC",
  "Everton": "Everton FC",
  "Fulham": "Fulham FC",
  "Bournemouth": "Bournemouth FC",
  "Ipswich": "Ipswich Town FC",
  "Southampton": "Southampton FC"
};

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

// Parse concatenated JSON blocks or single JSON object
function parseConcatenatedJson(content) {
  try {
    return JSON.parse(content);
  } catch (e) {
    // If it fails, parse using brace counting (handles concatenated JSON blocks)
    const blocks = [];
    let braceCount = 0;
    let startIdx = 0;
    for (let i = 0; i < content.length; i++) {
      if (content[i] === '{') {
        if (braceCount === 0) startIdx = i;
        braceCount++;
      } else if (content[i] === '}') {
        braceCount--;
        if (braceCount === 0) {
          try {
            const obj = JSON.parse(content.substring(startIdx, i + 1));
            blocks.push(obj);
          } catch (err) {
            // ignore malformed sub-blocks
          }
        }
      }
    }
    
    const merged = { teams: {} };
    for (const block of blocks) {
      if (block && block.teams) {
        Object.assign(merged.teams, block.teams);
      }
    }
    return merged;
  }
}

async function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('❌ Vui lòng truyền đường dẫn file JSON: node scripts/importUnderstat.js <path>');
    process.exit(1);
  }

  const filePath = path.resolve(args[0]);
  if (!fs.existsSync(filePath)) {
    console.error(`❌ Không tìm thấy file JSON tại: ${filePath}`);
    process.exit(1);
  }

  console.log(`⏳ Đang đọc file JSON: ${filePath}...`);
  const content = fs.readFileSync(filePath, 'utf8');
  const data = parseConcatenatedJson(content);

  if (!data || !data.teams || Object.keys(data.teams).length === 0) {
    console.error('❌ Cấu trúc file JSON không hợp lệ hoặc không có dữ liệu teams.');
    process.exit(1);
  }

  const db = await getDatabase();
  const dbTeams = await queryAll(db, 'SELECT id, name FROM teams');
  let updateCount = 0;

  console.log(`⏳ Bắt đầu import dữ liệu xG cho mùa giải 2025...`);

  for (const [id, teamInfo] of Object.entries(data.teams)) {
    const understatTitle = teamInfo.title;
    const history = teamInfo.history || [];

    if (history.length === 0) {
      console.warn(`⚠️ Đội ${understatTitle} không có dữ liệu lịch sử đấu.`);
      continue;
    }

    // 1. Tính toán thống kê từ history
    const matches_played = history.length;
    const total_xG = history.reduce((sum, h) => sum + (parseFloat(h.xG) || 0), 0);
    const total_xGA = history.reduce((sum, h) => sum + (parseFloat(h.xGA) || 0), 0);
    const goals_scored = history.reduce((sum, h) => sum + (parseInt(h.scored) || 0), 0);
    const goals_conceded = history.reduce((sum, h) => sum + (parseInt(h.missed) || 0), 0);

    // 2. Map tên đội sang DB name
    let dbTeamName = TEAM_MAP[understatTitle];
    let dbTeam = null;

    if (dbTeamName) {
      dbTeam = dbTeams.find(t => t.name === dbTeamName);
    }

    if (!dbTeam) {
      // Fallback matching
      dbTeam = dbTeams.find(t => t.name.toLowerCase() === understatTitle.toLowerCase()) ||
               dbTeams.find(t => isMatch(t.name, understatTitle));
    }

    if (!dbTeam) {
      console.warn(`⚠️ Không thể map đội bóng Understat: "${understatTitle}" với bất kỳ đội nào trong DB. Bỏ qua.`);
      continue;
    }

    // 3. Upsert vào bảng team_stats với season = '2025'
    const season = '2025';
    const existing = await queryGet(
      db,
      'SELECT team_id FROM team_stats WHERE team_id = ? AND season = ?',
      [dbTeam.id, season]
    );

    if (existing) {
      await queryRun(
        db,
        `UPDATE team_stats
         SET matches_played = ?, goals_scored = ?, goals_conceded = ?, xG = ?, xGA = ?
         WHERE team_id = ? AND season = ?`,
        [matches_played, goals_scored, goals_conceded, total_xG, total_xGA, dbTeam.id, season]
      );
    } else {
      await queryRun(
        db,
        `INSERT INTO team_stats (team_id, season, matches_played, goals_scored, goals_conceded, xG, xGA)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [dbTeam.id, season, matches_played, goals_scored, goals_conceded, total_xG, total_xGA]
      );
    }

    console.log(`✅ [${understatTitle} -> ${dbTeam.name}]: MP=${matches_played}, GS=${goals_scored}, GC=${goals_conceded}, xG=${total_xG.toFixed(2)}, xGA=${total_xGA.toFixed(2)}`);
    updateCount++;
  }

  console.log(`\n🎉 Đã hoàn thành! Đã cập nhật thành công ${updateCount} đội bóng vào DB.`);
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Lỗi thực thi import:', err);
  process.exit(1);
});
