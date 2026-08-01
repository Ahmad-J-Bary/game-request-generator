// src/types/maintenance-log.types.ts

export type MaintenanceLogAction =
  | 'session_deleted'
  | 'session_retokenized'
  | 'session_skipped'
  | 'session_reused'
  | 'session_only_completed'
  | 'session_only_skipped';

export interface MaintenanceLog {
  id: number;
  loggedAt: string;
  action: string;
  branchId?: number;
  levelId?: number;
  eventToken?: string;
  newEventToken?: string;
  daysOffset?: number;
  reason?: string;
  detail?: string;
}

export interface LogMaintenanceEventRequest {
  action: MaintenanceLogAction | string;
  branchId?: number;
  levelId?: number;
  eventToken?: string;
  newEventToken?: string;
  daysOffset?: number;
  reason?: string;
  detail?: string;
}
