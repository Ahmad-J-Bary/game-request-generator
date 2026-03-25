// src/types/game.types.ts

export interface Game {
  id: number;
  name: string;
  created_at?: string;
}

export interface CreateGameRequest {
  name: string;
}

export interface UpdateGameRequest {
  id: number;
  name?: string;
}