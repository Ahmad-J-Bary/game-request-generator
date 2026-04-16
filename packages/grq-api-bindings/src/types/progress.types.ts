// src/types/progress.types.ts

export interface AccountLevelProgress {
  account_id: number;
  level_id: number;
  is_completed: boolean;
  time_spent: number;
  target_date?: string | null;
  completed_at?: string | null;
}

export interface CreateAccountLevelProgressRequest {
  account_id: number;
  level_id: number;
  time_spent?: number;
  target_date?: string;
}

export interface UpdateAccountLevelProgressRequest {
  account_id: number;
  level_id: number;
  is_completed: boolean;
  time_spent?: number;
  target_date?: string;
  bypass_cooldown?: boolean;
}

export interface AccountPurchaseEventProgress {
  account_id: number;
  purchase_event_id: number;
  is_completed: boolean;
  days_offset: number;
  time_spent: number;
  target_date?: string | null;
  completed_at?: string | null;
}

export interface CreateAccountPurchaseEventProgressRequest {
  account_id: number;
  purchase_event_id: number;
  days_offset: number;
  time_spent: number;
  target_date?: string;
}

export interface UpdateAccountPurchaseEventProgressRequest {
  account_id: number;
  purchase_event_id: number;
  is_completed?: boolean;
  days_offset?: number;
  time_spent?: number;
  target_date?: string;
  bypass_cooldown?: boolean;
}
