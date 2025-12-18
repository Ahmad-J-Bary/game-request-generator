// Daily Request Types
export interface DailyRequest {
  request_type: 'session' | 'event' | 'purchase_event';
  content: string;
  event_token?: string;
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