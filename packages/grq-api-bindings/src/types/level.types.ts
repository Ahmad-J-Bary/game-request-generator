// src/types/level.types.ts

export interface Level {
  id: number;
  game_id: number;
  branch_id?: number | null;
  event_token: string;
  level_name: string;
  days_offset: number;
  time_spent: number;
  is_bonus: boolean;
  synthetic?: boolean; // For interpolated levels
}

export interface CreateLevelRequest {
  game_id: number;
  branch_id: number;
  event_token: string;
  level_name: string;
  days_offset: number;
  time_spent: number;
  is_bonus?: boolean;
}

export interface UpdateLevelRequest {
  id: number;
  branch_id?: number | null;
  event_token?: string;
  level_name?: string;
  days_offset?: number;
  time_spent?: number;
  is_bonus?: boolean;
}
