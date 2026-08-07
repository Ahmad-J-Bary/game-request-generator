// src/types/game.types.ts

export interface Game {
  id: number;
  name: string;
  package_name?: string;
  created_at?: string;
}

export interface CreateGameRequest {
  name: string;
  package_name?: string;
}

export interface UpdateGameRequest {
  id: number;
  name?: string;
  package_name?: string;
}

export interface GameBranch {
  id: number;
  game_id: number;
  name: string;
  is_default: boolean;
  created_at?: string;
}

export interface CreateBranchRequest {
  game_id: number;
  name: string;
  copy_from_branch_id?: number;
}

export interface UpdateBranchRequest {
  id: number;
  name?: string;
}