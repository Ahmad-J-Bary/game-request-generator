import { Level } from './level.types';

export interface GenerateRequestData {
  account_id: number;
  target_date: string;
}

export interface AccountProgress {
  account_id: number;
  game_id: number;
  account_name: string;
  days_passed: number;
  current_level?: Level;
  next_level?: Level;
  completed_levels: Level[];
  remaining_levels: Level[];
}

export interface GeneratedRequest {
  session_request: string;
  event_request?: string;
  has_event: boolean;
  event_token?: string;
  time_spent: number;
}