// Purchase Event Types
export interface PurchaseEvent {
  id: number;
  account_id: number;
  event_token: string;
  event_name: string;
  target_date: string;
  time_spent: number;
  is_completed: boolean;
  created_at?: string;
}

export interface CreatePurchaseEventRequest {
  account_id: number;
  event_token: string;
  event_name: string;
  target_date: string;
  time_spent: number;
}

export interface UpdatePurchaseEventRequest {
  id: number;
  event_token?: string;
  event_name?: string;
  target_date?: string;
  time_spent?: number;
  is_completed?: boolean;
}