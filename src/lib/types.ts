export type ScoringRule = 'bwf21' | 'classic15';

export type SlotStatus = 'pending' | 'in_progress' | 'completed';
export type MatchStatus = 'in_progress' | 'completed';

export interface Player {
  id: number;
  name: string;
  created_at: number;
}

export interface Team {
  id: number;
  name: string;
  created_at: number;
}

export interface TeamWithPlayers extends Team {
  players: Player[];
}

export interface Session {
  id: number;
  name: string;
  session_date: string;
  court_count: number;
  slot_minutes: number;
  scoring_rule: ScoringRule;
  created_at: number;
}

export interface ScheduleSlot {
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
  match_id: number | null;
  status: SlotStatus;
  created_at: number;
}

export interface ScheduleSlotWithTeams extends ScheduleSlot {
  team_a_name: string;
  team_b_name: string;
}

export interface Match {
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
}

export interface MatchWithTeams extends Match {
  team_a_name: string;
  team_b_name: string;
}
