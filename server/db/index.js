import Database from 'better-sqlite3'
import { fileURLToPath } from 'url'
import { join, dirname } from 'path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DB_PATH = join(__dirname, '../data/ingame.db')

let _db = null

export function getDb() {
  if (_db) return _db

  _db = new Database(DB_PATH)
  _db.pragma('journal_mode = WAL')
  _db.pragma('foreign_keys = ON')

  _db.exec(`
    CREATE TABLE IF NOT EXISTS teams (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      short_name TEXT
    );

    CREATE TABLE IF NOT EXISTS players (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      position TEXT,
      nationality TEXT
    );

    CREATE TABLE IF NOT EXISTS fixtures (
      id INTEGER PRIMARY KEY,
      season_id INTEGER NOT NULL,
      home_team_id INTEGER NOT NULL,
      away_team_id INTEGER NOT NULL,
      home_score INTEGER,
      away_score INTEGER,
      date TEXT NOT NULL,
      competition TEXT DEFAULT 'Premier League'
    );

    CREATE TABLE IF NOT EXISTS player_fixture_stats (
      player_id INTEGER NOT NULL,
      fixture_id INTEGER NOT NULL,
      team_id INTEGER,
      goals INTEGER DEFAULT 0,
      assists INTEGER DEFAULT 0,
      minutes INTEGER DEFAULT 0,
      yellow_cards INTEGER DEFAULT 0,
      red_cards INTEGER DEFAULT 0,
      shots INTEGER DEFAULT 0,
      shots_on_target INTEGER DEFAULT 0,
      rating REAL,
      PRIMARY KEY (player_id, fixture_id)
    );

    CREATE TABLE IF NOT EXISTS h2h_seed_log (
      team1_id INTEGER NOT NULL,
      team2_id INTEGER NOT NULL,
      seeded_at TEXT NOT NULL,
      fixture_count INTEGER DEFAULT 0,
      PRIMARY KEY (team1_id, team2_id)
    );
  `)

  return _db
}
