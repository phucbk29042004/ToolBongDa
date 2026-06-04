import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const dbPath = process.env.DB_PATH || path.join(__dirname, 'football.db');

const dbDir = path.dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

export function initDatabase() {
  return new Promise((resolve, reject) => {
    console.log(`[Database] Đang khởi tạo SQLite tại: ${dbPath}`);
    
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        console.error('[Database] Lỗi kết nối SQLite:', err.message);
        return reject(err);
      }
      
      db.serialize(() => {
        // Chạy chế độ WAL
        db.run('PRAGMA journal_mode = WAL');

        // 1. Bảng teams
        db.run(`
          CREATE TABLE IF NOT EXISTS teams (
            id INTEGER PRIMARY KEY,
            name TEXT NOT NULL,
            league TEXT NOT NULL,
            elo_rating REAL DEFAULT 1500,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 2. Bảng matches
        db.run(`
          CREATE TABLE IF NOT EXISTS matches (
            id INTEGER PRIMARY KEY,
            home_team_id INTEGER NOT NULL,
            away_team_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            score_home INTEGER,
            score_away INTEGER,
            league TEXT NOT NULL,
            season INTEGER NOT NULL,
            status TEXT DEFAULT 'SCHEDULED',
            FOREIGN KEY (home_team_id) REFERENCES teams (id),
            FOREIGN KEY (away_team_id) REFERENCES teams (id)
          )
        `);

        // 3. Bảng team_stats
        db.run(`
          CREATE TABLE IF NOT EXISTS team_stats (
            team_id INTEGER NOT NULL,
            season INTEGER NOT NULL,
            matches_played INTEGER DEFAULT 0,
            goals_scored INTEGER DEFAULT 0,
            goals_conceded INTEGER DEFAULT 0,
            xG REAL DEFAULT 0.0,
            xGA REAL DEFAULT 0.0,
            PRIMARY KEY (team_id, season),
            FOREIGN KEY (team_id) REFERENCES teams (id)
          )
        `);

        // 4. Bảng predictions
        db.run(`
          CREATE TABLE IF NOT EXISTS predictions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            match_id INTEGER NOT NULL,
            predicted_score TEXT,
            result_probs TEXT, -- JSON string
            confidence REAL,
            ai_analysis TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (match_id) REFERENCES matches (id)
          )
        `);

         // 5. Bảng elo_history
        db.run(`
          CREATE TABLE IF NOT EXISTS elo_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            team_id INTEGER NOT NULL,
            match_id INTEGER,
            elo_before REAL NOT NULL,
            elo_after REAL NOT NULL,
            date TEXT NOT NULL,
            FOREIGN KEY (team_id) REFERENCES teams (id),
            FOREIGN KEY (match_id) REFERENCES matches (id)
          )
        `);

        // 6. Bảng odds_cache
        db.run(`
          CREATE TABLE IF NOT EXISTS odds_cache (
            match_id INTEGER PRIMARY KEY,
            home_prob REAL,
            draw_prob REAL,
            away_prob REAL,
            over25_prob REAL,
            under25_prob REAL,
            fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (match_id) REFERENCES matches (id)
          )
        `);

        // 7. Bảng national_teams [NEW]
        db.run(`
          CREATE TABLE IF NOT EXISTS national_teams (
            id INTEGER PRIMARY KEY,
            name TEXT,
            name_vi TEXT,
            confederation TEXT,
            fifa_ranking INTEGER,
            elo_rating REAL DEFAULT 1500,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // 8. Bảng national_team_stats [NEW]
        db.run(`
          CREATE TABLE IF NOT EXISTS national_team_stats (
            team_id INTEGER,
            competition TEXT,
            season TEXT,
            matches_played INTEGER DEFAULT 0,
            goals_scored INTEGER DEFAULT 0,
            goals_conceded INTEGER DEFAULT 0,
            wins INTEGER DEFAULT 0,
            draws INTEGER DEFAULT 0,
            losses INTEGER DEFAULT 0,
            avg_goals_scored REAL DEFAULT 0.0,
            avg_goals_conceded REAL DEFAULT 0.0,
            clean_sheets INTEGER DEFAULT 0,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (team_id, competition, season),
            FOREIGN KEY (team_id) REFERENCES national_teams (id)
          )
        `);

        // 9. Bảng wc2026_groups [NEW]
        db.run(`
          CREATE TABLE IF NOT EXISTS wc2026_groups (
            group_name TEXT,
            team_name TEXT,
            team_vi TEXT,
            PRIMARY KEY (group_name, team_name)
          )
        `);

        // 10. Bảng wc2026_matches [NEW]
        db.run(`
          CREATE TABLE IF NOT EXISTS wc2026_matches (
            match_id INTEGER PRIMARY KEY,
            group_name TEXT,
            match_date TEXT,
            match_time TEXT,
            team1_vi TEXT,
            team2_vi TEXT,
            team1_en TEXT,
            team2_en TEXT,
            team1_flag TEXT,
            team2_flag TEXT,
            score_team1 INTEGER DEFAULT NULL,
            score_team2 INTEGER DEFAULT NULL,
            status TEXT DEFAULT 'scheduled'
          )
        `);

        // 11. Bảng player_stats [NEW]
        db.run(`
          CREATE TABLE IF NOT EXISTS player_stats (
            player_name TEXT,
            team_name TEXT,
            apps INTEGER DEFAULT 0,
            goals INTEGER DEFAULT 0,
            assists INTEGER DEFAULT 0,
            xG REAL DEFAULT 0.0,
            xA REAL DEFAULT 0.0,
            xG90 REAL DEFAULT 0.0,
            xA90 REAL DEFAULT 0.0,
            PRIMARY KEY (player_name, team_name)
          )
        `, (err) => {
          if (err) {
            console.error('[Database] Lỗi khởi tạo bảng:', err.message);
            return reject(err);
          }
          console.log('[Database] Đã tạo thành công tất cả các bảng dữ liệu (bao gồm ĐTQG & WC 2026).');
          resolve(db);
        });
      });
    });
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  initDatabase().then(() => process.exit(0)).catch(() => process.exit(1));
}
