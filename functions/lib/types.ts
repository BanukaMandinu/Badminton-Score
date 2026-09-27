export type ScoringRule = 'bwf21' | 'classic15';
export type SlotStatus = 'pending' | 'in_progress' | 'completed';
export type MatchStatus = 'in_progress' | 'completed';

export interface Player {
  id: number;
  name: string;
  created_at: number;
}

export interface TeamRow {
  id: number;
  name: string;
  created_at: number;
}

export interface TeamWithPlayers extends TeamRow {
  players: Player[];
}

export interface SessionRow {
  id: number;
  name: string;
  session_date: string;
  court_count: number;
  slot_minutes: number;
  use_time_slots: number;
  has_final: number;
  scoring_rule: ScoringRule;
  created_at: number;
}

export interface ScheduleSlotRow {
  id: number;
  session_id: number;
  round_number: number;
  court_number: number;
  team_a_id: number;
  team_b_id: number;
  start_offset_minutes: number;
  duration_minutes: number;
  is_extension: number;
  extension_number: number;
  is_final: number;
  match_id: number | null;
  status: SlotStatus;
  created_at: number;
  team_a_name: string;
  team_b_name: string;
  match_winner_team_id: number | null;
  match_team_a_score: number | null;
  match_team_b_score: number | null;
}

export interface TeamStanding {
  team_id: number;
  team_name: string;
  wins: number;
  losses: number;
  points_for: number;
  points_against: number;
}

export interface MatchRow {
  id: number;
  session_id: number;
  team_a_id: number;
  team_b_id: number;
  scoring_rule: ScoringRule;
  team_a_score: number;
  team_b_score: number;
  target_points: number;
  is_set: number;
  status: MatchStatus;
  winner_team_id: number | null;
  started_at: number;
  completed_at: number | null;
  team_a_name: string;
  team_b_name: string;
}
