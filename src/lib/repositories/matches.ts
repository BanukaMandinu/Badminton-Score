import type { SQLiteDatabase } from 'expo-sqlite';
import { defaultTargetPoints, evaluateScore } from '@/lib/scoring';
import type { MatchWithTeams, ScheduleSlotWithTeams, Session } from '@/lib/types';

export async function getOrStartMatchForSlot(
  db: SQLiteDatabase,
  slot: ScheduleSlotWithTeams,
  session: Session,
): Promise<number> {
  if (slot.match_id) return slot.match_id;

  let matchId = 0;
  await db.withExclusiveTransactionAsync(async (txn) => {
    const target = defaultTargetPoints(session.scoring_rule);
    const result = await txn.runAsync(
      `INSERT INTO matches
        (session_id, team_a_id, team_b_id, scoring_rule, team_a_score, team_b_score, target_points, is_set, status, started_at)
       VALUES (?, ?, ?, ?, 0, 0, ?, 0, 'in_progress', ?)`,
      slot.session_id,
      slot.team_a_id,
      slot.team_b_id,
      session.scoring_rule,
      target,
      Date.now(),
    );
    matchId = result.lastInsertRowId;
    await txn.runAsync(
      "UPDATE schedule_slots SET match_id = ?, status = 'in_progress' WHERE id = ?",
      matchId,
      slot.id,
    );
  });
  return matchId;
}

export async function getMatch(db: SQLiteDatabase, matchId: number): Promise<MatchWithTeams | null> {
  const row = await db.getFirstAsync<MatchWithTeams>(
    `SELECT m.*, ta.name AS team_a_name, tb.name AS team_b_name
     FROM matches m
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     WHERE m.id = ?`,
    matchId,
  );
  return row ?? null;
}

export async function adjustScore(db: SQLiteDatabase, matchId: number, side: 'a' | 'b', delta: 1 | -1): Promise<void> {
  const match = await getMatch(db, matchId);
  if (!match || match.status === 'completed') return;

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
    await db.withExclusiveTransactionAsync(async (txn) => {
      await txn.runAsync(
        `UPDATE matches SET team_a_score = ?, team_b_score = ?, status = 'completed', winner_team_id = ?, completed_at = ? WHERE id = ?`,
        nextA,
        nextB,
        winnerTeamId,
        Date.now(),
        matchId,
      );
      await txn.runAsync("UPDATE schedule_slots SET status = 'completed' WHERE match_id = ?", matchId);
    });
    return;
  }

  await db.runAsync('UPDATE matches SET team_a_score = ?, team_b_score = ? WHERE id = ?', nextA, nextB, matchId);
}

export async function setMatchScoringRule(
  db: SQLiteDatabase,
  matchId: number,
  rule: 'bwf21' | 'classic15',
): Promise<void> {
  const target = defaultTargetPoints(rule);
  await db.runAsync(
    'UPDATE matches SET scoring_rule = ?, target_points = ?, is_set = 0 WHERE id = ? AND team_a_score = 0 AND team_b_score = 0',
    rule,
    target,
    matchId,
  );
}

export async function resolveSetting(db: SQLiteDatabase, matchId: number, choice: 'set' | 'straight'): Promise<void> {
  const targetPoints = choice === 'set' ? 17 : 15;
  await db.runAsync('UPDATE matches SET is_set = 1, target_points = ? WHERE id = ?', targetPoints, matchId);
}

export async function reopenMatch(db: SQLiteDatabase, matchId: number): Promise<void> {
  await db.withExclusiveTransactionAsync(async (txn) => {
    await txn.runAsync(
      "UPDATE matches SET status = 'in_progress', winner_team_id = NULL, completed_at = NULL WHERE id = ?",
      matchId,
    );
    await txn.runAsync("UPDATE schedule_slots SET status = 'in_progress' WHERE match_id = ?", matchId);
  });
}
