export interface Account {
  id: number;
  game_id: number;
  branch_id?: number | null;
  name: string;
  start_date: string;
  start_time: string;
  request_template: string;
  created_at?: string;
  package_id?: number;
  proxy_state?: string;
  branch_name?: string | null;
}

export interface CompletedAccount extends Account {
  game_name: string;
}

export interface CreateAccountRequest {
  game_id: number;
  branch_id?: number | null;
  name: string;
  start_date: string;
  start_time: string;
  request_template: string;
  country: string;
}

export interface UpdateAccountRequest {
  id: number;
  branch_id?: number | null;
  name?: string;
  start_date?: string;
  start_time?: string;
  request_template?: string;
  proxy_state?: string;
}