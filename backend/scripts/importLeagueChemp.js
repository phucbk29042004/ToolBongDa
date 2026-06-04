import fs from 'fs';
import path from 'path';
import { getDatabase, queryRun, queryGet, queryAll } from '../db/database.js';

// Mapping rules to clean and match team names
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
  return n1.includes(n2) || n2.includes(n1);
}

// Detect league from team list samples
function detectLeague(teams) {
  const names = teams.map(t => t.team);
  
  if (names.some(n => ['Bayern Munich', 'Borussia Dortmund', 'Werder Bremen'].includes(n))) {
    return { code: 'BL1', name: 'Bundesliga' };
  }
  if (names.some(n => ['Barcelona', 'Real Madrid', 'Atletico Madrid', 'Villarreal'].includes(n))) {
    return { code: 'PD', name: 'La Liga' };
  }
  if (names.some(n => ['Inter', 'Napoli', 'Juventus', 'AC Milan'].includes(n))) {
    return { code: 'SA', name: 'Serie A' };
  }
  if (names.some(n => ['Paris Saint Germain', 'Marseille', 'Lille'].includes(n))) {
    return { code: 'FL1', name: 'Ligue 1' };
  }
  if (names.some(n => ['Zenit St. Petersburg', 'FC Krasnodar', 'Spartak Moscow'].includes(n))) {
    return { code: 'RPL', name: 'Russian Premier League' };
  }
  return { code: 'UNKNOWN', name: 'Unknown League' };
}

async function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('❌ Vui lòng truyền đường dẫn các file JSON: node scripts/importLeagueChemp.js <path1> <path2> ...');
    process.exit(1);
  }

  const db = await getDatabase();
  const dbTeams = await queryAll(db, 'SELECT id, name, league FROM teams');

  for (const filePathRaw of args) {
    const filePath = path.resolve(filePathRaw);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Không tìm thấy file: ${filePathRaw}. Bỏ qua.`);
      continue;
    }

    console.log(`\n⏳ Đang đọc file: ${filePath}...`);
    let teamsList = [];
    try {
      let contentBuffer = fs.readFileSync(filePath);
      let content = '';
      
      // Phát hiện mã hóa UTF-16 hoặc UTF-8 BOM
      if (contentBuffer[0] === 0xFF && contentBuffer[1] === 0xFE) {
        content = contentBuffer.toString('utf16le');
      } else if (contentBuffer[0] === 0xFE && contentBuffer[1] === 0xFF) {
        content = contentBuffer.toString('utf16be');
      } else {
        content = contentBuffer.toString('utf8');
      }

      // Xóa ký tự BOM (Byte Order Mark) nếu xuất hiện ở đầu chuỗi
      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }
      
      content = content.trim();
      teamsList = JSON.parse(content);
    } catch (e) {
      console.error(`❌ Không thể parse file JSON ${filePathRaw}:`, e.message);
      continue;
    }

    if (!Array.isArray(teamsList) || teamsList.length === 0) {
      console.warn(`⚠️ File ${filePathRaw} rỗng hoặc không phải Array. Bỏ qua.`);
      continue;
    }

    const detected = detectLeague(teamsList);
    console.log(`📡 Phát hiện giải đấu: ${detected.name} (Mã: ${detected.code})`);

    let updateCount = 0;
    let insertCount = 0;

    for (const item of teamsList) {
      const teamName = item.team;
      const matches = parseInt(item.matches) || 0;
      const goals = parseInt(item.goals) || 0;
      const ga = parseInt(item.ga) || 0;
      const xG = parseFloat(item.xG) || 0.0;
      const xGA = parseFloat(item.xGA) || 0.0;

      // Tìm kiếm đội bóng trong database
      let dbTeam = dbTeams.find(t => t.name.toLowerCase() === teamName.toLowerCase()) ||
                   dbTeams.find(t => isMatch(t.name, teamName));

      if (!dbTeam) {
        // Tạo đội bóng mới nếu chưa tồn tại
        const insertRes = await queryRun(
          db,
          'INSERT INTO teams (name, league) VALUES (?, ?)',
          [teamName, detected.code]
        );
        dbTeam = { id: insertRes.lastID, name: teamName, league: detected.code };
        
        // Cập nhật mảng cache dbTeams
        dbTeams.push(dbTeam);
        insertCount++;
      } else {
        // Cập nhật giải đấu cho đội bóng hiện tại nếu cần
        const currentLeagues = dbTeam.league ? dbTeam.league.split(',').map(l => l.trim()) : [];
        if (!currentLeagues.includes(detected.code)) {
          currentLeagues.push(detected.code);
          const newLeagueStr = currentLeagues.join(',');
          await queryRun(db, 'UPDATE teams SET league = ? WHERE id = ?', [newLeagueStr, dbTeam.id]);
          dbTeam.league = newLeagueStr;
        }
      }

      // Upsert thống kê mùa giải 2025
      const season = 2025;
      const existingStats = await queryGet(
        db,
        'SELECT team_id FROM team_stats WHERE team_id = ? AND season = ?',
        [dbTeam.id, season]
      );

      if (existingStats) {
        await queryRun(
          db,
          `UPDATE team_stats
           SET matches_played = ?, goals_scored = ?, goals_conceded = ?, xG = ?, xGA = ?
           WHERE team_id = ? AND season = ?`,
          [matches, goals, ga, xG, xGA, dbTeam.id, season]
        );
      } else {
        await queryRun(
          db,
          `INSERT INTO team_stats (team_id, season, matches_played, goals_scored, goals_conceded, xG, xGA)
           VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [dbTeam.id, season, matches, goals, ga, xG, xGA]
        );
      }

      console.log(`   ✅ [${teamName} -> ${dbTeam.name}]: Trận=${matches}, Bàn thắng=${goals}, Bàn thua=${ga}, xG=${xG.toFixed(2)}, xGA=${xGA.toFixed(2)}`);
      updateCount++;
    }
    console.log(`🎉 Giải đấu ${detected.name}: Thêm mới ${insertCount} đội, Cập nhật thống kê cho ${updateCount} đội.`);
  }

  process.exit(0);
}

run().catch(err => {
  console.error('❌ Lỗi thực thi import:', err);
  process.exit(1);
});
