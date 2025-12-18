export interface Level {
  id: number;
  game_id: number;
  event_token: string;
  level_name: string;
  days_offset: number;
  time_spent: number;
}

export interface CreateLevelRequest {
  game_id: number;
  event_token: string;
  level_name: string;
  days_offset: number;
  time_spent: number;
}

export interface UpdateLevelRequest {
  id: number;
  event_token?: string;
  level_name?: string;
  days_offset?: number;
  time_spent?: number;
}

export interface LevelDate {
  event_token: string;
  level_name: string;
  date: string;
  time_spent: number;
}