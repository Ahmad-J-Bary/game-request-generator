export interface SpecialEvent {
  id: number;
  account_id: number;
  event_name: string;
  event_token: string;
  scheduled_date: string;
  time_spent: number;
  is_completed: boolean;
  created_at?: string;
}

export interface CreateEventRequest {
  account_id: number;
  event_name: string;
  event_token: string;
  scheduled_date: string;
  time_spent: number;
}

export interface UpdateEventRequest {
  id: number;
  event_name?: string;
  event_token?: string;
  scheduled_date?: string;
  time_spent?: number;
  is_completed?: boolean;
}