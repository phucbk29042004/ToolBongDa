import { getDatabase, queryRun } from '../db/database.js';

const WC_GROUPS = {
  A: [
    {match:1, date:"12/06", time:"02:00", t1:"Mexico", t2:"Nam Phi", 
     t1_en:"Mexico", t2_en:"South Africa", t1_flag:"🇲🇽", t2_flag:"🇿🇦"},
    {match:2, date:"12/06", time:"09:00", t1:"Hàn Quốc", t2:"CH Séc",
     t1_en:"South Korea", t2_en:"Czech Republic", t1_flag:"🇰🇷", t2_flag:"🇨🇿"},
    {match:25, date:"18/06", time:"23:00", t1:"CH Séc", t2:"Nam Phi",
     t1_en:"Czech Republic", t2_en:"South Africa", t1_flag:"🇨🇿", t2_flag:"🇿🇦"},
    {match:28, date:"19/06", time:"08:00", t1:"Mexico", t2:"Hàn Quốc",
     t1_en:"Mexico", t2_en:"South Korea", t1_flag:"🇲🇽", t2_flag:"🇰🇷"},
    {match:53, date:"25/06", time:"08:00", t1:"Nam Phi", t2:"Hàn Quốc",
     t1_en:"South Africa", t2_en:"South Korea", t1_flag:"🇿🇦", t2_flag:"🇰🇷"},
    {match:54, date:"25/06", time:"08:00", t1:"CH Séc", t2:"Mexico",
     t1_en:"Czech Republic", t2_en:"Mexico", t1_flag:"🇨🇿", t2_flag:"🇲🇽"}
  ],
  B: [
    {match:3, date:"13/06", time:"02:00", t1:"Canada", t2:"Bosnia",
     t1_en:"Canada", t2_en:"Bosnia Herzegovina", t1_flag:"🇨🇦", t2_flag:"🇧🇦"},
    {match:5, date:"14/06", time:"02:00", t1:"Qatar", t2:"Thụy Sĩ",
     t1_en:"Qatar", t2_en:"Switzerland", t1_flag:"🇶🇦", t2_flag:"🇨🇭"},
    {match:26, date:"19/06", time:"02:00", t1:"Thụy Sĩ", t2:"Bosnia",
     t1_en:"Switzerland", t2_en:"Bosnia Herzegovina", t1_flag:"🇨🇭", t2_flag:"🇧🇦"},
    {match:27, date:"19/06", time:"05:00", t1:"Canada", t2:"Qatar",
     t1_en:"Canada", t2_en:"Qatar", t1_flag:"🇨🇦", t2_flag:"🇶🇦"},
    {match:49, date:"25/06", time:"02:00", t1:"Bosnia", t2:"Qatar",
     t1_en:"Bosnia Herzegovina", t2_en:"Qatar", t1_flag:"🇧🇦", t2_flag:"🇶🇦"},
    {match:50, date:"25/06", time:"02:00", t1:"Thụy Sĩ", t2:"Canada",
     t1_en:"Switzerland", t2_en:"Canada", t1_flag:"🇨🇭", t2_flag:"🇨🇦"}
  ],
  C: [
    {match:6, date:"14/06", time:"05:00", t1:"Brazil", t2:"Marocco",
     t1_en:"Brazil", t2_en:"Morocco", t1_flag:"🇧🇷", t2_flag:"🇲🇦"},
    {match:7, date:"14/06", time:"08:00", t1:"Haiti", t2:"Scotland",
     t1_en:"Haiti", t2_en:"Scotland", t1_flag:"🇭🇹", t2_flag:"🏴󠁧󠁢󠁳󠁣󠁴󠁿"},
    {match:30, date:"20/06", time:"05:00", t1:"Scotland", t2:"Marocco",
     t1_en:"Scotland", t2_en:"Morocco", t1_flag:"🏴󠁧󠁢󠁳󠁣󠁴󠁿", t2_flag:"🇲🇦"},
    {match:31, date:"20/06", time:"07:30", t1:"Brazil", t2:"Haiti",
     t1_en:"Brazil", t2_en:"Haiti", t1_flag:"🇧🇷", t2_flag:"🇭🇹"},
    {match:51, date:"25/06", time:"05:00", t1:"Marocco", t2:"Haiti",
     t1_en:"Morocco", t2_en:"Haiti", t1_flag:"🇲🇦", t2_flag:"🇭🇹"},
    {match:52, date:"25/06", time:"05:00", t1:"Scotland", t2:"Brazil",
     t1_en:"Scotland", t2_en:"Brazil", t1_flag:"🏴󠁧󠁢󠁳󠁣󠁴󠁿", t2_flag:"🇧🇷"}
  ],
  D: [
    {match:4, date:"13/06", time:"08:00", t1:"Mỹ", t2:"Paraguay",
     t1_en:"USA", t2_en:"Paraguay", t1_flag:"🇺🇸", t2_flag:"🇵🇾"},
    {match:8, date:"14/06", time:"11:00", t1:"Úc", t2:"Thổ Nhĩ Kỳ",
     t1_en:"Australia", t2_en:"Turkey", t1_flag:"🇦🇺", t2_flag:"🇹🇷"},
    {match:29, date:"20/06", time:"02:00", t1:"Mỹ", t2:"Úc",
     t1_en:"USA", t2_en:"Australia", t1_flag:"🇺🇸", t2_flag:"🇦🇺"},
    {match:32, date:"20/06", time:"10:00", t1:"Thổ Nhĩ Kỳ", t2:"Paraguay",
     t1_en:"Turkey", t2_en:"Paraguay", t1_flag:"🇹🇷", t2_flag:"🇵🇾"},
    {match:59, date:"26/06", time:"09:00", t1:"Thổ Nhĩ Kỳ", t2:"Mỹ",
     t1_en:"Turkey", t2_en:"USA", t1_flag:"🇹🇷", t2_flag:"🇺🇸"},
    {match:60, date:"26/06", time:"09:00", t1:"Paraguay", t2:"Úc",
     t1_en:"Paraguay", t2_en:"Australia", t1_flag:"🇵🇾", t2_flag:"🇦🇺"}
  ],
  E: [
    {match:9, date:"15/06", time:"00:00", t1:"Đức", t2:"Curacao",
     t1_en:"Germany", t2_en:"Curacao", t1_flag:"🇩🇪", t2_flag:"🇨🇼"},
    {match:11, date:"15/06", time:"06:00", t1:"Bờ Biển Ngà", t2:"Ecuador",
     t1_en:"Ivory Coast", t2_en:"Ecuador", t1_flag:"🇨🇮", t2_flag:"🇪🇨"},
    {match:34, date:"21/06", time:"03:00", t1:"Đức", t2:"Bờ Biển Ngà",
     t1_en:"Germany", t2_en:"Ivory Coast", t1_flag:"🇩🇪", t2_flag:"🇨🇮"},
    {match:35, date:"21/06", time:"07:00", t1:"Ecuador", t2:"Curacao",
     t1_en:"Ecuador", t2_en:"Curacao", t1_flag:"🇪🇨", t2_flag:"🇨🇼"},
    {match:55, date:"26/06", time:"03:00", t1:"Curacao", t2:"Bờ Biển Ngà",
     t1_en:"Curacao", t2_en:"Ivory Coast", t1_flag:"🇨🇼", t2_flag:"🇨🇮"},
    {match:56, date:"26/06", time:"03:00", t1:"Ecuador", t2:"Đức",
     t1_en:"Ecuador", t2_en:"Germany", t1_flag:"🇪🇨", t2_flag:"🇩🇪"}
  ],
  F: [
    {match:10, date:"15/06", time:"03:00", t1:"Hà Lan", t2:"Nhật Bản",
     t1_en:"Netherlands", t2_en:"Japan", t1_flag:"🇳🇱", t2_flag:"🇯🇵"},
    {match:12, date:"15/06", time:"09:00", t1:"Thụy Điển", t2:"Tunisia",
     t1_en:"Sweden", t2_en:"Tunisia", t1_flag:"🇸🇪", t2_flag:"🇹🇳"},
    {match:33, date:"21/06", time:"00:00", t1:"Hà Lan", t2:"Thụy Điển",
     t1_en:"Netherlands", t2_en:"Sweden", t1_flag:"🇳🇱", t2_flag:"🇸🇪"},
    {match:36, date:"21/06", time:"11:00", t1:"Tunisia", t2:"Nhật Bản",
     t1_en:"Tunisia", t2_en:"Japan", t1_flag:"🇹🇳", t2_flag:"🇯🇵"},
    {match:57, date:"26/06", time:"06:00", t1:"Tunisia", t2:"Hà Lan",
     t1_en:"Tunisia", t2_en:"Netherlands", t1_flag:"🇹🇳", t2_flag:"🇳🇱"},
    {match:58, date:"26/06", time:"06:00", t1:"Nhật Bản", t2:"Thụy Điển",
     t1_en:"Japan", t2_en:"Sweden", t1_flag:"🇯🇵", t2_flag:"🇸🇪"}
  ],
  G: [
    {match:14, date:"16/06", time:"02:00", t1:"Bỉ", t2:"Ai Cập",
     t1_en:"Belgium", t2_en:"Egypt", t1_flag:"🇧🇪", t2_flag:"🇪🇬"},
    {match:16, date:"16/06", time:"08:00", t1:"Iran", t2:"New Zealand",
     t1_en:"Iran", t2_en:"New Zealand", t1_flag:"🇮🇷", t2_flag:"🇳🇿"},
    {match:38, date:"22/06", time:"02:00", t1:"Bỉ", t2:"Iran",
     t1_en:"Belgium", t2_en:"Iran", t1_flag:"🇧🇪", t2_flag:"🇮🇷"},
    {match:40, date:"22/06", time:"08:00", t1:"New Zealand", t2:"Ai Cập",
     t1_en:"New Zealand", t2_en:"Egypt", t1_flag:"🇳🇿", t2_flag:"🇪🇬"},
    {match:65, date:"27/06", time:"10:00", t1:"New Zealand", t2:"Bỉ",
     t1_en:"New Zealand", t2_en:"Belgium", t1_flag:"🇳🇿", t2_flag:"🇧🇪"},
    {match:66, date:"27/06", time:"10:00", t1:"Ai Cập", t2:"Iran",
     t1_en:"Egypt", t2_en:"Iran", t1_flag:"🇪🇬", t2_flag:"🇮🇷"}
  ],
  H: [
    {match:13, date:"15/06", time:"23:00", t1:"Tây Ban Nha", t2:"Cabo Verde",
     t1_en:"Spain", t2_en:"Cape Verde", t1_flag:"🇪🇸", t2_flag:"🇨🇻"},
    {match:15, date:"16/06", time:"05:00", t1:"Saudi Arabia", t2:"Uruguay",
     t1_en:"Saudi Arabia", t2_en:"Uruguay", t1_flag:"🇸🇦", t2_flag:"🇺🇾"},
    {match:37, date:"21/06", time:"23:00", t1:"Tây Ban Nha", t2:"Saudi Arabia",
     t1_en:"Spain", t2_en:"Saudi Arabia", t1_flag:"🇪🇸", t2_flag:"🇸🇦"},
    {match:39, date:"22/06", time:"05:00", t1:"Uruguay", t2:"Cabo Verde",
     t1_en:"Uruguay", t2_en:"Cape Verde", t1_flag:"🇺🇾", t2_flag:"🇨🇻"},
    {match:63, date:"27/06", time:"07:00", t1:"Cabo Verde", t2:"Saudi Arabia",
     t1_en:"Cape Verde", t2_en:"Saudi Arabia", t1_flag:"🇨🇻", t2_flag:"🇸🇦"},
    {match:64, date:"27/06", time:"07:00", t1:"Uruguay", t2:"Tây Ban Nha",
     t1_en:"Uruguay", t2_en:"Spain", t1_flag:"🇺🇾", t2_flag:"🇪🇸"}
  ],
  I: [
    {match:17, date:"17/06", time:"02:00", t1:"Pháp", t2:"Senegal",
     t1_en:"France", t2_en:"Senegal", t1_flag:"🇫🇷", t2_flag:"🇸🇳"},
    {match:18, date:"17/06", time:"05:00", t1:"Iraq", t2:"Na Uy",
     t1_en:"Iraq", t2_en:"Norway", t1_flag:"🇮🇶", t2_flag:"🇳🇴"},
    {match:42, date:"23/06", time:"04:00", t1:"Pháp", t2:"Iraq",
     t1_en:"France", t2_en:"Iraq", t1_flag:"🇫🇷", t2_flag:"🇮🇶"},
    {match:43, date:"23/06", time:"07:00", t1:"Na Uy", t2:"Senegal",
     t1_en:"Norway", t2_en:"Senegal", t1_flag:"🇳🇴", t2_flag:"🇸🇳"},
    {match:61, date:"27/06", time:"02:00", t1:"Na Uy", t2:"Pháp",
     t1_en:"Norway", t2_en:"France", t1_flag:"🇳🇴", t2_flag:"🇫🇷"},
    {match:62, date:"27/06", time:"02:00", t1:"Senegal", t2:"Iraq",
     t1_en:"Senegal", t2_en:"Iraq", t1_flag:"🇸🇳", t2_flag:"🇮🇶"}
  ],
  J: [
    {match:19, date:"17/06", time:"08:00", t1:"Argentina", t2:"Algeria",
     t1_en:"Argentina", t2_en:"Algeria", t1_flag:"🇦🇷", t2_flag:"🇩🇿"},
    {match:20, date:"17/06", time:"11:00", t1:"Áo", t2:"Jordan",
     t1_en:"Austria", t2_en:"Jordan", t1_flag:"🇦🇹", t2_flag:"🇯🇴"},
    {match:41, date:"23/06", time:"00:00", t1:"Argentina", t2:"Áo",
     t1_en:"Argentina", t2_en:"Austria", t1_flag:"🇦🇷", t2_flag:"🇦🇹"},
    {match:44, date:"23/06", time:"10:00", t1:"Jordan", t2:"Algeria",
     t1_en:"Jordan", t2_en:"Algeria", t1_flag:"🇯🇴", t2_flag:"🇩🇿"},
    {match:71, date:"28/06", time:"09:00", t1:"Algeria", t2:"Áo",
     t1_en:"Algeria", t2_en:"Austria", t1_flag:"🇩🇿", t2_flag:"🇦🇹"},
    {match:72, date:"28/06", time:"09:00", t1:"Jordan", t2:"Argentina",
     t1_en:"Jordan", t2_en:"Argentina", t1_flag:"🇯🇴", t2_flag:"🇦🇷"}
  ],
  K: [
    {match:21, date:"18/06", time:"00:00", t1:"Bồ Đào Nha", t2:"CHDC Congo",
     t1_en:"Portugal", t2_en:"DR Congo", t1_flag:"🇵🇹", t2_flag:"🇨🇩"},
    {match:24, date:"18/06", time:"09:00", t1:"Uzbekistan", t2:"Colombia",
     t1_en:"Uzbekistan", t2_en:"Colombia", t1_flag:"🇺🇿", t2_flag:"🇨🇴"},
    {match:45, date:"24/06", time:"00:00", t1:"Bồ Đào Nha", t2:"Uzbekistan",
     t1_en:"Portugal", t2_en:"Uzbekistan", t1_flag:"🇵🇹", t2_flag:"🇺🇿"},
    {match:48, date:"24/06", time:"09:00", t1:"Colombia", t2:"CHDC Congo",
     t1_en:"Colombia", t2_en:"DR Congo", t1_flag:"🇨🇴", t2_flag:"🇨🇩"},
    {match:69, date:"28/06", time:"06:30", t1:"Colombia", t2:"Bồ Đào Nha",
     t1_en:"Colombia", t2_en:"Portugal", t1_flag:"🇨🇴", t2_flag:"🇵🇹"},
    {match:70, date:"28/06", time:"06:30", t1:"CHDC Congo", t2:"Uzbekistan",
     t1_en:"DR Congo", t2_en:"Uzbekistan", t1_flag:"🇨🇩", t2_flag:"🇺🇿"}
  ],
  L: [
    {match:22, date:"18/06", time:"03:00", t1:"Anh", t2:"Croatia",
     t1_en:"England", t2_en:"Croatia", t1_flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿", t2_flag:"🇭🇷"},
    {match:23, date:"18/06", time:"06:00", t1:"Ghana", t2:"Panama",
     t1_en:"Ghana", t2_en:"Panama", t1_flag:"🇬🇭", t2_flag:"🇵🇦"},
    {match:46, date:"24/06", time:"03:00", t1:"Anh", t2:"Ghana",
     t1_en:"England", t2_en:"Ghana", t1_flag:"🏴\u200D󠁡󠁩󠁲󠁿", t2_flag:"🇬🇭"},
    {match:47, date:"24/06", time:"06:00", t1:"Panama", t2:"Croatia",
     t1_en:"Panama", t2_en:"Croatia", t1_flag:"🇵🇦", t2_flag:"🇭🇷"},
    {match:67, date:"28/06", time:"04:00", t1:"Panama", t2:"Anh",
     t1_en:"Panama", t2_en:"England", t1_flag:"🇵🇦", t2_flag:"🏴󠁧󠁢󠁥󠁮󠁧󠁿"},
    {match:68, date:"28/06", time:"04:00", t1:"Croatia", t2:"Ghana",
     t1_en:"Croatia", t2_en:"Ghana", t1_flag:"🇭🇷", t2_flag:"🇬🇭"}
  ]
};

async function seed() {
  const db = await getDatabase();
  console.log('[Seed WC 2026] Bắt đầu xóa dữ liệu cũ...');
  await queryRun(db, 'DELETE FROM wc2026_groups');
  await queryRun(db, 'DELETE FROM wc2026_matches');

  console.log('[Seed WC 2026] Đang chèn dữ liệu bảng đấu (Groups)...');
  const seenTeams = new Set();
  for (const [groupName, matches] of Object.entries(WC_GROUPS)) {
    for (const m of matches) {
      if (!seenTeams.has(m.t1)) {
        await queryRun(db, 
          `INSERT OR REPLACE INTO wc2026_groups (group_name, team_name, team_vi)
           VALUES (?, ?, ?)`,
          [groupName, m.t1_en, m.t1]
        );
        seenTeams.add(m.t1);
      }
      if (!seenTeams.has(m.t2)) {
        await queryRun(db, 
          `INSERT OR REPLACE INTO wc2026_groups (group_name, team_name, team_vi)
           VALUES (?, ?, ?)`,
          [groupName, m.t2_en, m.t2]
        );
        seenTeams.add(m.t2);
      }
    }
  }

  console.log('[Seed WC 2026] Đang chèn 72 trận đấu vòng bảng...');
  for (const [groupName, matches] of Object.entries(WC_GROUPS)) {
    for (const m of matches) {
      await queryRun(db,
        `INSERT INTO wc2026_matches (match_id, group_name, match_date, match_time, team1_vi, team2_vi, team1_en, team2_en, team1_flag, team2_flag, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'scheduled')`,
        [m.match, groupName, m.date, m.time, m.t1, m.t2, m.t1_en, m.t2_en, m.t1_flag, m.t2_flag]
      );
    }
  }

  console.log('🎉 Seed WC 2026 hoàn tất thành công!');
  process.exit(0);
}

seed().catch(err => {
  console.error('❌ Lỗi seed WC 2026:', err);
  process.exit(1);
});
