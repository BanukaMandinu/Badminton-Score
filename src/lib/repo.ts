import { generateExtensionSchedule, generateInitialSchedule } from './scheduling';
import { defaultTargetPoints, evaluateScore } from './scoring';
import type {
  MatchRow,
  Player,
  ScheduleSlotRow,
  ScoringRule,
  SessionRow,
  TeamStanding,
  TeamWithPlayers,
} from './types';

const SLOT_SELECT = `
  s.*, ta.name AS team_a_name, tb.name AS team_b_name,
  m.winner_team_id AS match_winner_team_id,
  m.team_a_score AS match_team_a_score,
  m.team_b_score AS match_team_b_score
`;

export async function listAllPlayers(db: D1Database): Promise<Player[]> {
  const rows = await db.prepare('SELECT id, name, created_at FROM players ORDER BY name COLLATE NOCASE').all<Player>();
  return rows.results;
}

export async function listTeamsWithPlayers(db: D1Database): Promise<TeamWithPlayers[]> {
  const teams = await db.prepare('SELECT id, name, created_at FROM teams ORDER BY created_at DESC').all<{
    id: number;
    name: string;
    created_at: number;
  }>();
  const players = await db
    .prepare(
      `SELECT p.id, p.name, p.created_at, tp.team_id
       FROM players p
       JOIN team_players tp ON tp.player_id = p.id
       ORDER BY p.id ASC`,
    )
    .all<Player & { team_id: number }>();

  return teams.results.map((team) => ({
    ...team,
    players: players.results
      .filter((p) => p.team_id === team.id)
      .map(({ team_id, ...player }) => player),
  }));
}

async function findOrCreatePlayerId(db: D1Database, name: string): Promise<number> {
  const trimmed = name.trim();
  const existing = await db
    .prepare('SELECT id FROM players WHERE name = ? COLLATE NOCASE')
    .bind(trimmed)
    .first<{ id: number }>();
  if (existing) return existing.id;
  const result = await db
    .prepare('INSERT INTO players (name, created_at) VALUES (?, ?)')
    .bind(trimmed, Date.now())
    .run();
  return result.meta.last_row_id as number;
}

export async function createTeam(db: D1Database, name: string, playerNames: string[]): Promise<number> {
  const teamResult = await db
    .prepare('INSERT INTO teams (name, created_at) VALUES (?, ?)')
    .bind(name.trim(), Date.now())
    .run();
  const teamId = teamResult.meta.last_row_id as number;

  for (const playerName of playerNames) {
    if (!playerName.trim()) continue;
    const playerId = await findOrCreatePlayerId(db, playerName);
    await db
      .prepare('INSERT OR IGNORE INTO team_players (team_id, player_id) VALUES (?, ?)')
      .bind(teamId, playerId)
      .run();
  }
  return teamId;
}

export async function updateTeam(db: D1Database, teamId: number, name: string, playerNames: string[]): Promise<void> {
  await db.prepare('UPDATE teams SET name = ? WHERE id = ?').bind(name.trim(), teamId).run();
  await db.prepare('DELETE FROM team_players WHERE team_id = ?').bind(teamId).run();
  for (const playerName of playerNames) {
    if (!playerName.trim()) continue;
    const playerId = await findOrCreatePlayerId(db, playerName);
    await db
      .prepare('INSERT OR IGNORE INTO team_players (team_id, player_id) VALUES (?, ?)')
      .bind(teamId, playerId)
      .run();
  }
}

export async function deleteTeam(db: D1Database, teamId: number): Promise<void> {
  await db.prepare('DELETE FROM teams WHERE id = ?').bind(teamId).run();
}

export interface CreateSessionInput {
  name: string;
  sessionDate: string;
  courtCount: number;
  slotMinutes: number;
  useTimeSlots: boolean;
  scoringRule: ScoringRule;
  teamIds: number[];
  rounds?: number;
  hasFinal: boolean;
}

export async function createSessionWithSchedule(db: D1Database, input: CreateSessionInput): Promise<number> {
  // Matches are played until finished rather than to a clock when time
  // slots are disabled — store a nominal 1-minute unit so the round-robin
  // wave-chunking math still works, but the UI never surfaces it.
  const effectiveSlotMinutes = input.useTimeSlots ? input.slotMinutes : 1;

  const sessionResult = await db
    .prepare(
      'INSERT INTO sessions (name, session_date, court_count, slot_minutes, use_time_slots, has_final, scoring_rule, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .bind(
      input.name.trim(),
      input.sessionDate,
      input.courtCount,
      effectiveSlotMinutes,
      input.useTimeSlots ? 1 : 0,
      input.hasFinal ? 1 : 0,
      input.scoringRule,
      Date.now(),
    )
    .run();
  const sessionId = sessionResult.meta.last_row_id as number;

  const statements = input.teamIds.map((teamId) =>
    db.prepare('INSERT OR IGNORE INTO session_teams (session_id, team_id) VALUES (?, ?)').bind(sessionId, teamId),
  );

  const slots = generateInitialSchedule(input.teamIds, input.courtCount, effectiveSlotMinutes, input.rounds);
  const now = Date.now();
  for (const slot of slots) {
    statements.push(
      db
        .prepare(
          `INSERT INTO schedule_slots
            (session_id, round_number, court_number, team_a_id, team_b_id, start_offset_minutes, duration_minutes, is_extension, extension_number, status, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
        )
        .bind(
          sessionId,
          slot.roundNumber,
          slot.courtNumber,
          slot.teamAId,
          slot.teamBId,
          slot.startOffsetMinutes,
          slot.durationMinutes,
          slot.isExtension ? 1 : 0,
          slot.extensionNumber,
          now,
        ),
    );
  }

  if (statements.length) await db.batch(statements);
  return sessionId;
}

export async function getLatestSession(db: D1Database): Promise<SessionRow | null> {
  const row = await db.prepare('SELECT * FROM sessions ORDER BY created_at DESC LIMIT 1').first<SessionRow>();
  return row ?? null;
}

export async function getSessionById(db: D1Database, sessionId: number): Promise<SessionRow | null> {
  const row = await db.prepare('SELECT * FROM sessions WHERE id = ?').bind(sessionId).first<SessionRow>();
  return row ?? null;
}

export async function getSessionTeamIds(db: D1Database, sessionId: number): Promise<number[]> {
  const rows = await db
    .prepare('SELECT team_id FROM session_teams WHERE session_id = ?')
    .bind(sessionId)
    .all<{ team_id: number }>();
  return rows.results.map((r) => r.team_id);
}

/** Deletes a session and everything scoped to it (schedule, matches, team
 * roster for that session) — teams themselves are untouched, since they're
 * shared across sessions. */
export async function deleteSession(db: D1Database, sessionId: number): Promise<void> {
  await db.batch([
    db.prepare('DELETE FROM schedule_slots WHERE session_id = ?').bind(sessionId),
    db.prepare('DELETE FROM matches WHERE session_id = ?').bind(sessionId),
    db.prepare('DELETE FROM session_teams WHERE session_id = ?').bind(sessionId),
    db.prepare('DELETE FROM sessions WHERE id = ?').bind(sessionId),
  ]);
}

export async function listScheduleSlots(db: D1Database, sessionId: number): Promise<ScheduleSlotRow[]> {
  const rows = await db
    .prepare(
      `SELECT ${SLOT_SELECT}
       FROM schedule_slots s
       JOIN teams ta ON ta.id = s.team_a_id
       JOIN teams tb ON tb.id = s.team_b_id
       LEFT JOIN matches m ON m.id = s.match_id
       WHERE s.session_id = ?
       ORDER BY s.is_final ASC, s.start_offset_minutes ASC, s.court_number ASC`,
    )
    .bind(sessionId)
    .all<ScheduleSlotRow>();
  return rows.results;
}

export async function getFinalSlotForSession(db: D1Database, sessionId: number): Promise<ScheduleSlotRow | null> {
  const row = await db
    .prepare(
      `SELECT ${SLOT_SELECT}
       FROM schedule_slots s
       JOIN teams ta ON ta.id = s.team_a_id
       JOIN teams tb ON tb.id = s.team_b_id
       LEFT JOIN matches m ON m.id = s.match_id
       WHERE s.session_id = ? AND s.is_final = 1`,
    )
    .bind(sessionId)
    .first<ScheduleSlotRow>();
  return row ?? null;
}

export async function getScheduleSlotById(db: D1Database, slotId: number): Promise<ScheduleSlotRow | null> {
  const row = await db
    .prepare(
      `SELECT ${SLOT_SELECT}
       FROM schedule_slots s
       JOIN teams ta ON ta.id = s.team_a_id
       JOIN teams tb ON tb.id = s.team_b_id
       LEFT JOIN matches m ON m.id = s.match_id
       WHERE s.id = ?`,
    )
    .bind(slotId)
    .first<ScheduleSlotRow>();
  return row ?? null;
}

export async function extendSessionSchedule(db: D1Database, sessionId: number): Promise<void> {
  const session = await getSessionById(db, sessionId);
  if (!session) throw new Error('Session not found');

  const teamIds = await getSessionTeamIds(db, sessionId);
  const last = await db
    .prepare(
      `SELECT round_number, (start_offset_minutes + duration_minutes) AS end_offset, extension_number
       FROM schedule_slots WHERE session_id = ? AND is_final = 0
       ORDER BY start_offset_minutes DESC LIMIT 1`,
    )
    .bind(sessionId)
    .first<{ round_number: number; end_offset: number; extension_number: number }>();

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

  const now = Date.now();
  const statements = slots.map((slot) =>
    db
      .prepare(
        `INSERT INTO schedule_slots
          (session_id, round_number, court_number, team_a_id, team_b_id, start_offset_minutes, duration_minutes, is_extension, extension_number, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)`,
      )
      .bind(
        sessionId,
        slot.roundNumber,
        slot.courtNumber,
        slot.teamAId,
        slot.teamBId,
        slot.startOffsetMinutes,
        slot.durationMinutes,
        slot.isExtension ? 1 : 0,
        slot.extensionNumber,
        now,
      ),
  );
  if (statements.length) await db.batch(statements);
  // New pending rounds mean the group stage is no longer complete — drop
  // any not-yet-started Final so it gets re-seeded once these finish.
  await syncFinal(db, sessionId);
}

export async function getMatch(db: D1Database, matchId: number): Promise<MatchRow | null> {
  const row = await db
    .prepare(
      `SELECT m.*, ta.name AS team_a_name, tb.name AS team_b_name
       FROM matches m
       JOIN teams ta ON ta.id = m.team_a_id
       JOIN teams tb ON tb.id = m.team_b_id
       WHERE m.id = ?`,
    )
    .bind(matchId)
    .first<MatchRow>();
  return row ?? null;
}

export async function getOrStartMatchForSlot(db: D1Database, slot: ScheduleSlotRow, session: SessionRow): Promise<number> {
  if (slot.match_id) return slot.match_id;

  const target = defaultTargetPoints(session.scoring_rule);
  const result = await db
    .prepare(
      `INSERT INTO matches
        (session_id, team_a_id, team_b_id, scoring_rule, team_a_score, team_b_score, target_points, is_set, status, started_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, 0, 'in_progress', ?)`,
    )
    .bind(slot.session_id, slot.team_a_id, slot.team_b_id, session.scoring_rule, target, Date.now())
    .run();
  const matchId = result.meta.last_row_id as number;

  await db
    .prepare("UPDATE schedule_slots SET match_id = ?, status = 'in_progress' WHERE id = ?")
    .bind(matchId, slot.id)
    .run();

  return matchId;
}

export async function adjustScore(db: D1Database, matchId: number, side: 'a' | 'b', delta: 1 | -1): Promise<MatchRow | null> {
  const match = await getMatch(db, matchId);
  if (!match || match.status === 'completed') return match;

  const nextA = side === 'a' ? Math.max(0, match.team_a_score + delta) : match.team_a_score;
  const nextB = side === 'b' ? Math.max(0, match.team_b_score + delta) : match.team_b_score;

  const evaluation = evaluateScore({
    scoringRule: match.scoring_rule,
    teamAScore: nextA,
    teamBScore: nextB,
    targetPoints: match.target_points,
    isSet: match.is_set,
  });

  if (evaluation.winner) {
    const winnerTeamId = evaluation.winner === 'a' ? match.team_a_id : match.team_b_id;
    await db.batch([
      db
        .prepare(
          `UPDATE matches SET team_a_score = ?, team_b_score = ?, status = 'completed', winner_team_id = ?, completed_at = ? WHERE id = ?`,
        )
        .bind(nextA, nextB, winnerTeamId, Date.now(), matchId),
      db.prepare("UPDATE schedule_slots SET status = 'completed' WHERE match_id = ?").bind(matchId),
    ]);
    await syncFinal(db, match.session_id);
  } else {
    await db
      .prepare('UPDATE matches SET team_a_score = ?, team_b_score = ? WHERE id = ?')
      .bind(nextA, nextB, matchId)
      .run();
  }

  return getMatch(db, matchId);
}

export async function declareWinner(db: D1Database, matchId: number, winnerSide: 'a' | 'b'): Promise<MatchRow | null> {
  const match = await getMatch(db, matchId);
  if (!match || match.status === 'completed') return match;

  const winnerTeamId = winnerSide === 'a' ? match.team_a_id : match.team_b_id;
  await db.batch([
    db
      .prepare(`UPDATE matches SET status = 'completed', winner_team_id = ?, completed_at = ? WHERE id = ?`)
      .bind(winnerTeamId, Date.now(), matchId),
    db.prepare("UPDATE schedule_slots SET status = 'completed' WHERE match_id = ?").bind(matchId),
  ]);
  await syncFinal(db, match.session_id);

  return getMatch(db, matchId);
}

export async function resolveSetting(db: D1Database, matchId: number, choice: 'set' | 'straight'): Promise<void> {
  const targetPoints = choice === 'set' ? 17 : 15;
  await db.prepare('UPDATE matches SET is_set = 1, target_points = ? WHERE id = ?').bind(targetPoints, matchId).run();
}

export async function setMatchScoringRule(db: D1Database, matchId: number, rule: ScoringRule): Promise<void> {
  const target = defaultTargetPoints(rule);
  await db
    .prepare(
      'UPDATE matches SET scoring_rule = ?, target_points = ?, is_set = 0 WHERE id = ? AND team_a_score = 0 AND team_b_score = 0',
    )
    .bind(rule, target, matchId)
    .run();
}

export async function reopenMatch(db: D1Database, matchId: number): Promise<void> {
  const match = await getMatch(db, matchId);
  if (!match) return;
  await db.batch([
    db
      .prepare("UPDATE matches SET status = 'in_progress', winner_team_id = NULL, completed_at = NULL WHERE id = ?")
      .bind(matchId),
    db.prepare("UPDATE schedule_slots SET status = 'in_progress' WHERE match_id = ?").bind(matchId),
  ]);
  await syncFinal(db, match.session_id);
}

/**
 * Team standings for one session: wins/losses/points aggregated from
 * completed matches. Pass `excludeFinal: true` to get pre-Final standings
 * (used to seed the Final itself); omit it for the session Leaderboard
 * view, where the Final's result should count too.
 */
export async function getSessionTeamStandings(
  db: D1Database,
  sessionId: number,
  options?: { excludeFinal?: boolean },
): Promise<TeamStanding[]> {
  const finalFilter = options?.excludeFinal ? 'AND s.is_final = 0' : '';
  const rows = await db
    .prepare(
      `SELECT t.id AS team_id, t.name AS team_name,
              m.team_a_id AS match_team_id, m.team_a_score AS team_score, m.team_b_score AS opponent_score,
              m.winner_team_id AS winner_team_id
       FROM session_teams st
       JOIN teams t ON t.id = st.team_id
       JOIN matches m ON m.team_a_id = st.team_id AND m.session_id = st.session_id AND m.status = 'completed'
       JOIN schedule_slots s ON s.match_id = m.id
       WHERE st.session_id = ? ${finalFilter}
       UNION ALL
       SELECT t.id AS team_id, t.name AS team_name,
              m.team_b_id AS match_team_id, m.team_b_score AS team_score, m.team_a_score AS opponent_score,
              m.winner_team_id AS winner_team_id
       FROM session_teams st
       JOIN teams t ON t.id = st.team_id
       JOIN matches m ON m.team_b_id = st.team_id AND m.session_id = st.session_id AND m.status = 'completed'
       JOIN schedule_slots s ON s.match_id = m.id
       WHERE st.session_id = ? ${finalFilter}`,
    )
    .bind(sessionId, sessionId)
    .all<{
      team_id: number;
      team_name: string;
      team_score: number;
      opponent_score: number;
      winner_team_id: number | null;
    }>();

  const byTeam = new Map<number, TeamStanding>();
  // Ensure every team in the session appears even with zero matches played.
  const teamIds = await getSessionTeamIds(db, sessionId);
  const teams = await db
    .prepare(`SELECT id, name FROM teams WHERE id IN (${teamIds.map(() => '?').join(',') || 'NULL'})`)
    .bind(...teamIds)
    .all<{ id: number; name: string }>();
  for (const t of teams.results) {
    byTeam.set(t.id, { team_id: t.id, team_name: t.name, wins: 0, losses: 0, points_for: 0, points_against: 0 });
  }

  for (const row of rows.results) {
    const standing = byTeam.get(row.team_id);
    if (!standing) continue;
    standing.points_for += row.team_score;
    standing.points_against += row.opponent_score;
    if (row.winner_team_id === row.team_id) standing.wins += 1;
    else standing.losses += 1;
  }

  return Array.from(byTeam.values()).sort(
    (a, b) => b.wins - a.wins || b.points_for - b.points_against - (a.points_for - a.points_against),
  );
}

/**
 * Creates, re-seeds, or retracts the session's Final slot based on
 * whether every non-Final match is done and who's currently on top.
 * A Final whose match has already started/finished is left alone even
 * if the group stage is later reopened and standings shift.
 */
export async function syncFinal(db: D1Database, sessionId: number): Promise<void> {
  const session = await getSessionById(db, sessionId);
  if (!session || !session.has_final) return;

  const nonFinalSlots = await db
    .prepare('SELECT status FROM schedule_slots WHERE session_id = ? AND is_final = 0')
    .bind(sessionId)
    .all<{ status: string }>();
  const allDone = nonFinalSlots.results.length > 0 && nonFinalSlots.results.every((s) => s.status === 'completed');

  const existingFinal = await db
    .prepare('SELECT * FROM schedule_slots WHERE session_id = ? AND is_final = 1')
    .bind(sessionId)
    .first<ScheduleSlotRow>();

  if (!allDone) {
    if (existingFinal && !existingFinal.match_id) {
      await db.prepare('DELETE FROM schedule_slots WHERE id = ?').bind(existingFinal.id).run();
    }
    return;
  }

  // With only 2 teams the round-robin already decided it head-to-head —
  // a Final would just be an identical rematch.
  const standings = await getSessionTeamStandings(db, sessionId, { excludeFinal: true });
  if (standings.length < 3) return;
  const [first, second] = standings;

  if (!existingFinal) {
    const last = await db
      .prepare(
        `SELECT round_number, (start_offset_minutes + duration_minutes) AS end_offset
         FROM schedule_slots WHERE session_id = ? AND is_final = 0
         ORDER BY start_offset_minutes DESC LIMIT 1`,
      )
      .bind(sessionId)
      .first<{ round_number: number; end_offset: number }>();

    await db
      .prepare(
        `INSERT INTO schedule_slots
          (session_id, round_number, court_number, team_a_id, team_b_id, start_offset_minutes, duration_minutes, is_extension, extension_number, is_final, status, created_at)
         VALUES (?, ?, 1, ?, ?, ?, ?, 0, 0, 1, 'pending', ?)`,
      )
      .bind(
        sessionId,
        (last?.round_number ?? 0) + 1,
        first.team_id,
        second.team_id,
        last?.end_offset ?? 0,
        session.slot_minutes,
        Date.now(),
      )
      .run();
  } else if (!existingFinal.match_id) {
    await db
      .prepare('UPDATE schedule_slots SET team_a_id = ?, team_b_id = ? WHERE id = ?')
      .bind(first.team_id, second.team_id, existingFinal.id)
      .run();
  }
}

export interface WeekGroup {
  weekKey: string;
  weekLabel: string;
  matches: MatchRow[];
}

export interface PlayerStat {
  playerId: number;
  playerName: string;
  wins: number;
  losses: number;
  pointsFor: number;
  pointsAgainst: number;
}

function startOfWeek(date: Date): Date {
  const d = new Date(date);
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  return d;
}

function formatWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
  return `${fmt(weekStart)} - ${fmt(weekEnd)}, ${weekEnd.getUTCFullYear()}`;
}

export async function listCompletedMatchesGroupedByWeek(db: D1Database): Promise<WeekGroup[]> {
  const rows = await db
    .prepare(
      `SELECT m.*, ta.name AS team_a_name, tb.name AS team_b_name
       FROM matches m
       JOIN teams ta ON ta.id = m.team_a_id
       JOIN teams tb ON tb.id = m.team_b_id
       WHERE m.status = 'completed'
       ORDER BY m.completed_at DESC`,
    )
    .all<MatchRow>();

  const groups = new Map<string, WeekGroup>();
  for (const match of rows.results) {
    const completedAt = match.completed_at ?? match.started_at;
    const weekStart = startOfWeek(new Date(completedAt));
    const weekKey = weekStart.toISOString().slice(0, 10);
    if (!groups.has(weekKey)) {
      groups.set(weekKey, { weekKey, weekLabel: formatWeekLabel(weekStart), matches: [] });
    }
    groups.get(weekKey)!.matches.push(match);
  }

  return Array.from(groups.values()).sort((a, b) => (a.weekKey < b.weekKey ? 1 : -1));
}

export async function listPlayerStats(db: D1Database): Promise<PlayerStat[]> {
  const rows = await db
    .prepare(
      `SELECT p.id AS player_id, p.name AS player_name, tp.team_id AS team_id,
              m.team_a_id AS match_team_id, m.team_a_score AS team_score, m.team_b_score AS opponent_score,
              m.winner_team_id AS winner_team_id
       FROM players p
       JOIN team_players tp ON tp.player_id = p.id
       JOIN matches m ON m.team_a_id = tp.team_id AND m.status = 'completed'
       UNION ALL
       SELECT p.id AS player_id, p.name AS player_name, tp.team_id AS team_id,
              m.team_b_id AS match_team_id, m.team_b_score AS team_score, m.team_a_score AS opponent_score,
              m.winner_team_id AS winner_team_id
       FROM players p
       JOIN team_players tp ON tp.player_id = p.id
       JOIN matches m ON m.team_b_id = tp.team_id AND m.status = 'completed'`,
    )
    .all<{
      player_id: number;
      player_name: string;
      team_id: number;
      team_score: number;
      opponent_score: number;
      winner_team_id: number | null;
    }>();

  const statsByPlayer = new Map<number, PlayerStat>();
  for (const row of rows.results) {
    if (!statsByPlayer.has(row.player_id)) {
      statsByPlayer.set(row.player_id, {
        playerId: row.player_id,
        playerName: row.player_name,
        wins: 0,
        losses: 0,
        pointsFor: 0,
        pointsAgainst: 0,
      });
    }
    const stat = statsByPlayer.get(row.player_id)!;
    stat.pointsFor += row.team_score;
    stat.pointsAgainst += row.opponent_score;
    if (row.winner_team_id === row.team_id) stat.wins += 1;
    else stat.losses += 1;
  }

  return Array.from(statsByPlayer.values()).sort((a, b) => b.wins - a.wins || b.pointsFor - a.pointsFor);
}
