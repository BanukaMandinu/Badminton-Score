import type { SQLiteDatabase } from 'expo-sqlite';
import { generateExtensionSchedule, generateInitialSchedule } from '@/lib/scheduling';
import type { ScheduleSlotWithTeams, ScoringRule, Session } from '@/lib/types';

export interface CreateSessionInput {
  name: string;
  sessionDate: string;
  courtCount: number;
  slotMinutes: number;
  scoringRule: ScoringRule;
  teamIds: number[];
}

export async function createSessionWithSchedule(db: SQLiteDatabase, input: CreateSessionInput): Promise<number> {
  let sessionId = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const result = await txn.runAsync(
      'INSERT INTO sessions (name, session_date, court_count, slot_minutes, scoring_rule, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      input.name.trim(),
      input.sessionDate,
      input.courtCount,
      input.slotMinutes,
      input.scoringRule,
      Date.now(),
    );
    sessionId = result.lastInsertRowId;

    for (const teamId of input.teamIds) {
      await txn.runAsync('INSERT OR IGNORE INTO session_teams (session_id, team_id) VALUES (?, ?)', sessionId, teamId);
    }

    const slots = generateInitialSchedule(input.teamIds, input.courtCount, input.slotMinutes);
    for (const slot of slots) {
      await txn.runAsync(
        `INSERT INTO schedule_slots
          (session_id, round_number, court_number, team_a_id, team_b_id, start_offset_minutes, duration_minutes, is_extension, extension_number, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        sessionId,
        slot.roundNumber,
        slot.courtNumber,
        slot.teamAId,
        slot.teamBId,
        slot.startOffsetMinutes,
        slot.durationMinutes,
        slot.isExtension ? 1 : 0,
        slot.extensionNumber,
        Date.now(),
      );
    }
  });
  return sessionId;
}

// Explicit child-first deletes: PRAGMA foreign_keys is only enabled on the first migration run,
// so we can't rely on ON DELETE CASCADE being active on every connection.
export async function deleteSession(db: SQLiteDatabase, sessionId: number): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync('DELETE FROM schedule_slots WHERE session_id = ?', sessionId);
    await txn.runAsync('DELETE FROM matches WHERE session_id = ?', sessionId);
    await txn.runAsync('DELETE FROM session_teams WHERE session_id = ?', sessionId);
    await txn.runAsync('DELETE FROM sessions WHERE id = ?', sessionId);
  });
}

export async function listSessions(db: SQLiteDatabase): Promise<Session[]> {
  return db.getAllAsync<Session>('SELECT * FROM sessions ORDER BY created_at DESC');
}

export async function getLatestSession(db: SQLiteDatabase): Promise<Session | null> {
  const row = await db.getFirstAsync<Session>('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1');
  return row ?? null;
}

export async function getSessionTeamIds(db: SQLiteDatabase, sessionId: number): Promise<number[]> {
  const rows = await db.getAllAsync<{ team_id: number }>(
    'SELECT team_id FROM session_teams WHERE session_id = ?',
    sessionId,
  );
  return rows.map((r) => r.team_id);
}

export async function getSessionById(db: SQLiteDatabase, sessionId: number): Promise<Session | null> {
  const row = await db.getFirstAsync<Session>('SELECT * FROM sessions WHERE id = ?', sessionId);
  return row ?? null;
}

export async function getScheduleSlotById(db: SQLiteDatabase, slotId: number): Promise<ScheduleSlotWithTeams | null> {
  const row = await db.getFirstAsync<ScheduleSlotWithTeams>(
    `SELECT s.*, ta.name AS team_a_name, tb.name AS team_b_name
     FROM schedule_slots s
     JOIN teams ta ON ta.id = s.team_a_id
     JOIN teams tb ON tb.id = s.team_b_id
     WHERE s.id = ?`,
    slotId,
  );
  return row ?? null;
}

export async function listScheduleSlots(db: SQLiteDatabase, sessionId: number): Promise<ScheduleSlotWithTeams[]> {
  return db.getAllAsync<ScheduleSlotWithTeams>(
    `SELECT s.*, ta.name AS team_a_name, tb.name AS team_b_name
     FROM schedule_slots s
     JOIN teams ta ON ta.id = s.team_a_id
     JOIN teams tb ON tb.id = s.team_b_id
     WHERE s.session_id = ?
     ORDER BY s.start_offset_minutes ASC, s.court_number ASC`,
    sessionId,
  );
}

export async function extendSessionSchedule(db: SQLiteDatabase, sessionId: number): Promise<void> {
  const session = await db.getFirstAsync<Session>('SELECT * FROM sessions WHERE id = ?', sessionId);
  if (!session) throw new Error('Session not found');

  const teamIds = await getSessionTeamIds(db, sessionId);
  const last = await db.getFirstAsync<{ round_number: number; end_offset: number; extension_number: number }>(
    `SELECT round_number, (start_offset_minutes + duration_minutes) AS end_offset, extension_number
     FROM schedule_slots WHERE session_id = ?
     ORDER BY start_offset_minutes DESC LIMIT 1`,
    sessionId,
  );

  const lastRoundNumber = last?.round_number ?? 0;
  const lastEndOffset = last?.end_offset ?? 0;
  const nextExtensionNumber = (last?.extension_number ?? 0) + 1;

  const slots = generateExtensionSchedule(
    teamIds,
    session.court_count,
    session.slot_minutes,
    lastRoundNumber,
    lastEndOffset,
    nextExtensionNumber,
  );

  await db.withExclusiveTransactionAsync(async (txn) => {
    for (const slot of slots) {
      await txn.runAsync(
        `INSERT INTO schedule_slots
          (session_id, round_number, court_number, team_a_id, team_b_id, start_offset_minutes, duration_minutes, is_extension, extension_number, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        sessionId,
        slot.roundNumber,
        slot.courtNumber,
        slot.teamAId,
        slot.teamBId,
        slot.startOffsetMinutes,
        slot.durationMinutes,
        slot.isExtension ? 1 : 0,
        slot.extensionNumber,
        Date.now(),
      );
    }
  });
}
