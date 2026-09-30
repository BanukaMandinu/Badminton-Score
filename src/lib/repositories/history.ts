import type { SQLiteDatabase } from 'expo-sqlite';
import type { MatchWithTeams } from '@/lib/types';

export interface WeekGroup {
  weekKey: string;
  weekLabel: string;
  matches: MatchWithTeams[];
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
  const day = d.getDay();
  const diffToMonday = (day + 6) % 7;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diffToMonday);
  return d;
}

function formatWeekLabel(weekStart: Date): string {
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  const fmt = (d: Date) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  const year = weekEnd.getFullYear();
  return `${fmt(weekStart)} - ${fmt(weekEnd)}, ${year}`;
}

export async function listCompletedMatchesGroupedByWeek(db: SQLiteDatabase): Promise<WeekGroup[]> {
  const matches = await db.getAllAsync<MatchWithTeams>(
    `SELECT m.*, ta.name AS team_a_name, tb.name AS team_b_name
     FROM matches m
     JOIN teams ta ON ta.id = m.team_a_id
     JOIN teams tb ON tb.id = m.team_b_id
     WHERE m.status = 'completed'
     ORDER BY m.completed_at DESC`,
  );

  const groups = new Map<string, WeekGroup>();
  for (const match of matches) {
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

export async function listPlayerStats(db: SQLiteDatabase): Promise<PlayerStat[]> {
  const rows = await db.getAllAsync<{
    player_id: number;
    player_name: string;
    team_id: number;
    match_team_id: number;
    opponent_team_id: number;
    team_score: number;
    opponent_score: number;
    winner_team_id: number | null;
  }>(
    `SELECT p.id AS player_id, p.name AS player_name, tp.team_id AS team_id,
            m.team_a_id AS match_team_id, m.team_b_id AS opponent_team_id,
            m.team_a_score AS team_score, m.team_b_score AS opponent_score,
            m.winner_team_id AS winner_team_id
     FROM players p
     JOIN team_players tp ON tp.player_id = p.id
     JOIN matches m ON m.team_a_id = tp.team_id AND m.status = 'completed'
     UNION ALL
     SELECT p.id AS player_id, p.name AS player_name, tp.team_id AS team_id,
            m.team_b_id AS match_team_id, m.team_a_id AS opponent_team_id,
            m.team_b_score AS team_score, m.team_a_score AS opponent_score,
            m.winner_team_id AS winner_team_id
     FROM players p
     JOIN team_players tp ON tp.player_id = p.id
     JOIN matches m ON m.team_b_id = tp.team_id AND m.status = 'completed'`,
  );

  const statsByPlayer = new Map<number, PlayerStat>();
  for (const row of rows) {
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
