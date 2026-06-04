import fs from 'fs';
import path from 'path';
import { getDatabase, queryRun } from '../db/database.js';

async function run() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    console.error('❌ Vui lòng truyền đường dẫn các file JSON của cầu thủ: node scripts/importPlayerStats.js <path1> <path2> ...');
    process.exit(1);
  }

  const db = await getDatabase();
  let totalImported = 0;

  for (const filePathRaw of args) {
    const filePath = path.resolve(filePathRaw);
    if (!fs.existsSync(filePath)) {
      console.warn(`⚠️ Không tìm thấy file: ${filePathRaw}. Bỏ qua.`);
      continue;
    }

    console.log(`⏳ Đang đọc file cầu thủ: ${filePath}...`);
    let playersList = [];
    try {
      const buffer = fs.readFileSync(filePath);
      let content = '';
      if (buffer[0] === 0xFF && buffer[1] === 0xFE) {
        content = buffer.toString('utf16le');
      } else if (buffer[0] === 0xFE && buffer[1] === 0xFF) {
        content = buffer.toString('utf16be');
      } else {
        content = buffer.toString('utf8');
      }

      if (content.charCodeAt(0) === 0xFEFF) {
        content = content.slice(1);
      }
      
      playersList = JSON.parse(content.trim());
    } catch (e) {
      console.error(`❌ Không thể parse file JSON ${filePathRaw}:`, e.message);
      continue;
    }

    if (!Array.isArray(playersList)) {
      console.warn(`⚠️ File ${filePathRaw} không phải dạng Array. Bỏ qua.`);
      continue;
    }

    console.log(`🚀 Bắt đầu import ${playersList.length} cầu thủ...`);
    let importCount = 0;

    for (const p of playersList) {
      const playerName = p.player;
      const teamName = p.team;
      const apps = parseInt(p.apps) || 0;
      const goals = parseInt(p.goals) || 0;
      const assists = parseInt(p.a) || parseInt(p.assists) || 0;
      const xG = parseFloat(p.xG) || 0.0;
      const xA = parseFloat(p.xA) || 0.0;
      const xG90 = parseFloat(p.xG90) || 0.0;
      const xA90 = parseFloat(p.xA90) || 0.0;

      if (!playerName || !teamName) continue;

      // Upsert cầu thủ vào bảng player_stats
      await queryRun(
        db,
        `INSERT INTO player_stats (player_name, team_name, apps, goals, assists, xG, xA, xG90, xA90)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(player_name, team_name) DO UPDATE SET
           apps = excluded.apps,
           goals = excluded.goals,
           assists = excluded.assists,
           xG = excluded.xG,
           xA = excluded.xA,
           xG90 = excluded.xG90,
           xA90 = excluded.xA90`,
        [playerName, teamName, apps, goals, assists, xG, xA, xG90, xA90]
      );
      importCount++;
    }

    console.log(`✅ File ${path.basename(filePathRaw)}: Đã nạp thành công ${importCount} cầu thủ.`);
    totalImported += importCount;
  }

  console.log(`\n🎉 Đã hoàn thành! Tổng cộng nhập thành công ${totalImported} thông số cầu thủ vào DB.`);
  process.exit(0);
}

run().catch(err => {
  console.error('❌ Lỗi thực thi import cầu thủ:', err);
  process.exit(1);
});
