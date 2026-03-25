// src/types/progress.types.ts

export interface AccountLevelProgress {
  account_id: number;
  level_id: number;
  is_completed: boolean;
  completed_at?: string | null;
}

export interface CreateAccountLevelProgressRequest {
  account_id: number;
  level_id: number;
}

export interface UpdateAccountLevelProgressRequest {
  account_id: number;
  level_id: number;
  is_completed: boolean;
}

export interface AccountPurchaseEventProgress {
  account_id: number;
  purchase_event_id: number;
  is_completed: boolean;
  days_offset: number;
  time_spent: number;
  completed_at?: string | null;
}

export interface CreateAccountPurchaseEventProgressRequest {
  account_id: number;
  purchase_event_id: number;
  days_offset: number;
  time_spent: number;
}

export interface UpdateAccountPurchaseEventProgressRequest {
  account_id: number;
  purchase_event_id: number;
  is_completed?: boolean;
  days_offset?: number;
  time_spent?: number;
}
