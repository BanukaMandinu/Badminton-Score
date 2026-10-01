import { Hono } from 'hono';
import {
  adjustScore,
  createSessionWithSchedule,
  createTeam,
  declareWinner,
  deleteSession,
  deleteTeam,
  extendSessionSchedule,
  getFinalSlotForSession,
  listSessions,
  getLatestSession,
  getMatch,
  getOrStartMatchForSlot,
  getScheduleSlotById,
  getSessionById,
  getSessionTeamStandings,
  listAllPlayers,
  listCompletedMatchesGroupedByWeek,
  listPlayerStats,
  listScheduleSlots,
  listTeamsWithPlayers,
  reopenMatch,
  resolveSetting,
  setMatchScoringRule,
  updateTeam,
} from './lib/repo';
import type { ScoringRule } from './lib/types';

type Bindings = {
  DB: D1Database;
};

const app = new Hono<{ Bindings: Bindings }>().basePath('/api');

// ---- Teams ----

app.get('/teams', async (c) => {
  const teams = await listTeamsWithPlayers(c.env.DB);
  return c.json({ teams });
});

app.get('/players', async (c) => {
  const [players, stats] = await Promise.all([listAllPlayers(c.env.DB), listPlayerStats(c.env.DB)]);
  return c.json({ players, stats });
});

app.post('/teams', async (c) => {
  const body = await c.req.json<{ name: string; playerNames: string[] }>();
  if (!body.name?.trim()) return c.json({ error: 'Team name is required' }, 400);
  const teamId = await createTeam(c.env.DB, body.name, body.playerNames ?? []);
  return c.json({ teamId });
});

app.put('/teams/:id', async (c) => {
  const teamId = Number(c.req.param('id'));
  const body = await c.req.json<{ name: string; playerNames: string[] }>();
  if (!body.name?.trim()) return c.json({ error: 'Team name is required' }, 400);
  await updateTeam(c.env.DB, teamId, body.name, body.playerNames ?? []);
  return c.json({ ok: true });
});

app.delete('/teams/:id', async (c) => {
  const teamId = Number(c.req.param('id'));
  await deleteTeam(c.env.DB, teamId);
  return c.json({ ok: true });
});

// ---- Sessions & schedule ----

app.get('/sessions', async (c) => {
  return c.json({ sessions: await listSessions(c.env.DB) });
});

app.get('/sessions/latest', async (c) => {
  const idParam = Number(c.req.query('id'));
  const session = (idParam ? await getSessionById(c.env.DB, idParam) : null) ?? (await getLatestSession(c.env.DB));
  if (!session) return c.json({ session: null, slots: [] });
  const slots = await listScheduleSlots(c.env.DB, session.id);
  return c.json({ session, slots });
});

app.post('/sessions', async (c) => {
  const body = await c.req.json<{
    name: string;
    sessionDate: string;
    courtCount: number;
    slotMinutes: number;
    useTimeSlots: boolean;
    scoringRule: ScoringRule;
    teamIds: number[];
    rounds?: number;
    hasFinal: boolean;
  }>();
  if (!body.teamIds || body.teamIds.length < 2) {
    return c.json({ error: 'At least 2 teams are required' }, 400);
  }
  const sessionId = await createSessionWithSchedule(c.env.DB, {
    name: body.name?.trim() || 'Session',
    sessionDate: body.sessionDate,
    courtCount: Math.max(1, body.courtCount || 1),
    slotMinutes: Math.max(5, body.slotMinutes || 15),
    useTimeSlots: body.useTimeSlots !== false,
    scoringRule: body.scoringRule,
    teamIds: body.teamIds,
    rounds: body.rounds && body.rounds > 0 ? body.rounds : undefined,
    hasFinal: body.hasFinal !== false,
  });
  return c.json({ sessionId });
});

app.get('/sessions/:id/leaderboard', async (c) => {
  const sessionId = Number(c.req.param('id'));
  const [standings, finalSlot] = await Promise.all([
    getSessionTeamStandings(c.env.DB, sessionId),
    getFinalSlotForSession(c.env.DB, sessionId),
  ]);
  return c.json({ standings, finalSlot });
});

app.delete('/sessions/:id', async (c) => {
  const sessionId = Number(c.req.param('id'));
  await deleteSession(c.env.DB, sessionId);
  return c.json({ ok: true });
});

app.post('/sessions/:id/extend', async (c) => {
  const sessionId = Number(c.req.param('id'));
  const finalSlot = await getFinalSlotForSession(c.env.DB, sessionId);
  if (finalSlot?.status === 'completed') return c.json({ error: 'The final is finished; the schedule can no longer be extended.' }, 409);
  await extendSessionSchedule(c.env.DB, sessionId);
  const slots = await listScheduleSlots(c.env.DB, sessionId);
  return c.json({ slots });
});

app.get('/sessions/:id/slots', async (c) => {
  const sessionId = Number(c.req.param('id'));
  const slots = await listScheduleSlots(c.env.DB, sessionId);
  return c.json({ slots });
});

// ---- Matches / live scoring ----

app.post('/slots/:id/start', async (c) => {
  const slotId = Number(c.req.param('id'));
  const slot = await getScheduleSlotById(c.env.DB, slotId);
  if (!slot) return c.json({ error: 'Slot not found' }, 404);
  const session = await getSessionById(c.env.DB, slot.session_id);
  if (!session) return c.json({ error: 'Session not found' }, 404);
  const matchId = await getOrStartMatchForSlot(c.env.DB, slot, session);
  const match = await getMatch(c.env.DB, matchId);
  return c.json({ match });
});

// One round trip for "start (if needed) and declare winner" from the schedule.
app.post('/slots/:id/declare-winner', async (c) => {
  const slotId = Number(c.req.param('id'));
  const body = await c.req.json<{ winnerSide: 'a' | 'b' }>();
  if (body.winnerSide !== 'a' && body.winnerSide !== 'b') return c.json({ error: 'Invalid winner' }, 400);
  const slot = await getScheduleSlotById(c.env.DB, slotId);
  if (!slot) return c.json({ error: 'Slot not found' }, 404);
  const session = await getSessionById(c.env.DB, slot.session_id);
  if (!session) return c.json({ error: 'Session not found' }, 404);
  const matchId = await getOrStartMatchForSlot(c.env.DB, slot, session);
  const match = await declareWinner(c.env.DB, matchId, body.winnerSide);
  return c.json({ match });
});

app.get('/matches/:id', async (c) => {
  const matchId = Number(c.req.param('id'));
  const match = await getMatch(c.env.DB, matchId);
  if (!match) return c.json({ error: 'Match not found' }, 404);
  return c.json({ match });
});

app.post('/matches/:id/score', async (c) => {
  const matchId = Number(c.req.param('id'));
  const body = await c.req.json<{ side: 'a' | 'b'; delta: 1 | -1 }>();
  const match = await adjustScore(c.env.DB, matchId, body.side, body.delta);
  return c.json({ match });
});

app.post('/matches/:id/setting', async (c) => {
  const matchId = Number(c.req.param('id'));
  const body = await c.req.json<{ choice: 'set' | 'straight' }>();
  await resolveSetting(c.env.DB, matchId, body.choice);
  const match = await getMatch(c.env.DB, matchId);
  return c.json({ match });
});

app.post('/matches/:id/rule', async (c) => {
  const matchId = Number(c.req.param('id'));
  const body = await c.req.json<{ rule: ScoringRule }>();
  await setMatchScoringRule(c.env.DB, matchId, body.rule);
  const match = await getMatch(c.env.DB, matchId);
  return c.json({ match });
});

app.post('/matches/:id/declare-winner', async (c) => {
  const matchId = Number(c.req.param('id'));
  const body = await c.req.json<{ winnerSide: 'a' | 'b' }>();
  const match = await declareWinner(c.env.DB, matchId, body.winnerSide);
  return c.json({ match });
});

app.post('/matches/:id/reopen', async (c) => {
  const matchId = Number(c.req.param('id'));
  await reopenMatch(c.env.DB, matchId);
  const match = await getMatch(c.env.DB, matchId);
  return c.json({ match });
});

// ---- History ----

app.get('/history', async (c) => {
  const [weeks, stats] = await Promise.all([
    listCompletedMatchesGroupedByWeek(c.env.DB),
    listPlayerStats(c.env.DB),
  ]);
  return c.json({ weeks, stats });
});

app.onError((err, c) => {
  console.error(err);
  return c.json({ error: err instanceof Error ? err.message : 'Internal error' }, 500);
});

export default app;
