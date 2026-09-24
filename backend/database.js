const Database = require("better-sqlite3");

const db = new Database("room-party.db");

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
  CREATE TABLE IF NOT EXISTS rooms (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    code TEXT UNIQUE NOT NULL,
    password TEXT,
    locked INTEGER NOT NULL DEFAULT 0,
    host_player_id TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS room_members (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_code TEXT NOT NULL,
    player_id TEXT NOT NULL,
    name TEXT NOT NULL,
    seat INTEGER,
    is_admin INTEGER NOT NULL DEFAULT 0,
    activity_status TEXT NOT NULL DEFAULT 'offline',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(room_code, player_id),
    FOREIGN KEY(room_code) REFERENCES rooms(code)
  );
`);

module.exports = db;
