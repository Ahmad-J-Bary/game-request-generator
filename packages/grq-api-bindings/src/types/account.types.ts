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

export interface AccountBranchTransferResult {
  accountId: number;
  accountName: string;
  sourceBranchId: number | null;
  sourceBranchName: string | null;
  targetBranchId: number;
  targetBranchName: string;
  transferredLevels: number;
  transferredPurchaseEvents: number;
  warnings: string[];
}

export interface TransferPreview {
  matchedLevels: string[];
  missingLevels: string[];
  matchedPurchaseEvents: string[];
  missingPurchaseEvents: string[];
  totalSourceLevels: number;
  totalTargetLevels: number;
  totalSourcePurchaseEvents: number;
  totalTargetPurchaseEvents: number;
}