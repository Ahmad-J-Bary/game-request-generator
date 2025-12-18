export interface Account {
  id: number;
  game_id: number;
  name: string;
  start_date: string;
  start_time: string;
  request_template: string;
  created_at?: string;
}

export interface CreateAccountRequest {
  game_id: number;
  name: string;
  start_date: string;
  start_time: string;
  request_template: string;
}

export interface UpdateAccountRequest {
  id: number;
  name?: string;
  start_date?: string;
  start_time?: string;
  request_template?: string;
}