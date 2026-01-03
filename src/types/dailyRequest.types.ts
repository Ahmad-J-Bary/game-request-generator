// Daily Request Types
export interface DailyRequest {
  request_type: 'Session Only' | 'Level Session' | 'Level Event' | 'Purchase Session' | 'Purchase Event';
  content: string;
  event_token?: string;
  level_id?: number;
  level_name?: string;
  time_spent: number;
  timestamp?: string;
}

export interface DailyRequestsResponse {
  account_id: number;
  account_name: string;
  target_date: string;
  days_passed: number;
  requests: DailyRequest[];
}