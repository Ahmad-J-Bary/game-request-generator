// src/types/level.types.ts

export interface Level {
  id: number;
  game_id: number;
  event_token: string;
  level_name: string;
  days_offset: number;
  time_spent: number;
  is_bonus: boolean; // جديد
  synthetic?: boolean; // For interpolated levels
}

export interface CreateLevelRequest {
  game_id: number;
  event_token: string;
  level_name: string;
  days_offset: number;
  time_spent: number;
  is_bonus?: boolean; // اختياري عند الإرسال (defaults false backend)
}

export interface UpdateLevelRequest {
  id: number;
  event_token?: string;
  level_name?: string;
  days_offset?: number;
  time_spent?: number;
  is_bonus?: boolean; // جديد
}
