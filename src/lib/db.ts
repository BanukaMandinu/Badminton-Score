import type { SQLiteDatabase } from 'expo-sqlite';

export const DATABASE_NAME = 'badminton.db';
const DATABASE_VERSION = 1;

export async function migrateDbIfNeeded(db: SQLiteDatabase) {
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let currentVersion = row?.user_version ?? 0;
  if (currentVersion >= DATABASE_VERSION) return;

  if (currentVersion === 0) {
    await db.execAsync(`
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;

      CREATE TABLE IF NOT EXISTS players (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS teams (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS team_players (
        team_id INTEGER NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
        player_id INTEGER NOT NULL REFERENCES players(id) ON DELETE CASCADE,
        PRIMARY KEY (team_id, player_id)
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL,
        session_date TEXT NOT NULL,
        court_count INTEGER NOT NULL,
        slot_minutes INTEGER NOT NULL,
        scoring_rule TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS session_teams (
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        team_id INTEGER NOT NULL REFERENCES teams(id),
        PRIMARY KEY (session_id, team_id)
      );

      CREATE TABLE IF NOT EXISTS matches (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        team_a_id INTEGER NOT NULL REFERENCES teams(id),
        team_b_id INTEGER NOT NULL REFERENCES teams(id),
        scoring_rule TEXT NOT NULL,
        team_a_score INTEGER NOT NULL DEFAULT 0,
        team_b_score INTEGER NOT NULL DEFAULT 0,
        target_points INTEGER NOT NULL,
        is_set INTEGER NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'in_progress',
        winner_team_id INTEGER REFERENCES teams(id),
        started_at INTEGER NOT NULL,
        completed_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS schedule_slots (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        round_number INTEGER NOT NULL,
        court_number INTEGER NOT NULL,
        team_a_id INTEGER NOT NULL REFERENCES teams(id),
        team_b_id INTEGER NOT NULL REFERENCES teams(id),
        start_offset_minutes INTEGER NOT NULL,
        duration_minutes INTEGER NOT NULL,
        is_extension INTEGER NOT NULL DEFAULT 0,
        extension_number INTEGER NOT NULL DEFAULT 0,
        match_id INTEGER REFERENCES matches(id),
        status TEXT NOT NULL DEFAULT 'pending',
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_team_players_player ON team_players(player_id);
      CREATE INDEX IF NOT EXISTS idx_schedule_slots_session ON schedule_slots(session_id);
      CREATE INDEX IF NOT EXISTS idx_matches_session ON matches(session_id);
      CREATE INDEX IF NOT EXISTS idx_matches_status_completed ON matches(status, completed_at);
    `);
    currentVersion = 1;
  }

  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
}
