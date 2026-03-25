export interface PurchaseEvent {
  id: number;
  game_id: number;
  event_token: string;
  is_restricted: boolean;
  max_days_offset?: number | null;
  days_offset?: number | null;
  created_at?: string | null;
}

export interface CreatePurchaseEventRequest {
  game_id: number;
  event_token: string;
  is_restricted: boolean;
  max_days_offset?: number | null;
  days_offset?: number | null;
}

export interface UpdatePurchaseEventRequest {
  id: number;
  event_token?: string;
  is_restricted?: boolean;
  max_days_offset?: number | null;
  days_offset?: number | null;
}
