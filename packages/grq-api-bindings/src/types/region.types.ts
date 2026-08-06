export interface Region {
  id: number;
  name: string;
  parent_id: number | null;
  is_primary: boolean;
  sort_order: number;
  emoji?: string | null;
  color?: string | null;
  frozen?: boolean;
  created_at?: string;
}

export interface CreateRegionRequest {
  name: string;
  parent_id?: number | null;
  emoji?: string | null;
  color?: string | null;
}

export interface UpdateRegionRequest {
  id: number;
  name?: string;
  parent_id?: number | null;
  emoji?: string | null;
  color?: string | null;
  sort_order?: number;
  frozen?: boolean;
}

export interface DeleteRegionRequest {
  id: number;
  mode: 'single' | 'rotate';
  target_id?: number | null;
}

export const REGION_PALETTE = [
  'orange',
  'blue',
  'red',
  'purple',
  'teal',
  'green',
  'pink',
  'yellow',
  'indigo',
  'cyan',
] as const;
