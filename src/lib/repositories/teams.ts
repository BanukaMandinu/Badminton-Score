import type { SQLiteDatabase } from 'expo-sqlite';
import type { Player, TeamWithPlayers } from '@/lib/types';

export async function listTeamsWithPlayers(db: SQLiteDatabase): Promise<TeamWithPlayers[]> {
  const teams = await db.getAllAsync<{ id: number; name: string; created_at: number }>(
    'SELECT id, name, created_at FROM teams ORDER BY created_at DESC',
  );
  const players = await db.getAllAsync<Player & { team_id: number }>(
    `SELECT p.id, p.name, p.created_at, tp.team_id
     FROM players p
     JOIN team_players tp ON tp.player_id = p.id
     ORDER BY p.id ASC`,
  );

  return teams.map((team) => ({
    ...team,
    players: players.filter((p) => p.team_id === team.id).map(({ team_id, ...player }) => player),
  }));
}

async function findOrCreatePlayerId(db: SQLiteDatabase, name: string): Promise<number> {
  const trimmed = name.trim();
  const existing = await db.getFirstAsync<{ id: number }>(
    'SELECT id FROM players WHERE name = ? COLLATE NOCASE',
    trimmed,
  );
  if (existing) return existing.id;
  const result = await db.runAsync('INSERT INTO players (name, created_at) VALUES (?, ?)', trimmed, Date.now());
  return result.lastInsertRowId;
}

export async function createTeam(db: SQLiteDatabase, name: string, playerNames: string[]): Promise<number> {
  let teamId = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const result = await txn.runAsync('INSERT INTO teams (name, created_at) VALUES (?, ?)', name.trim(), Date.now());
    teamId = result.lastInsertRowId;
    for (const playerName of playerNames) {
      if (!playerName.trim()) continue;
      const playerId = await findOrCreatePlayerId(txn, playerName);
      await txn.runAsync('INSERT OR IGNORE INTO team_players (team_id, player_id) VALUES (?, ?)', teamId, playerId);
    }
  });
  return teamId;
}

export async function updateTeam(
  db: SQLiteDatabase,
  teamId: number,
  name: string,
  playerNames: string[],
): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('UPDATE teams SET name = ? WHERE id = ?', name.trim(), teamId);
    await txn.runAsync('DELETE FROM team_players WHERE team_id = ?', teamId);
    for (const playerName of playerNames) {
      if (!playerName.trim()) continue;
      const playerId = await findOrCreatePlayerId(txn, playerName);
      await txn.runAsync('INSERT OR IGNORE INTO team_players (team_id, player_id) VALUES (?, ?)', teamId, playerId);
    }
  });
}

export async function deleteTeam(db: SQLiteDatabase, teamId: number): Promise<void> {
  await db.runAsync('DELETE FROM teams WHERE id = ?', teamId);
}
