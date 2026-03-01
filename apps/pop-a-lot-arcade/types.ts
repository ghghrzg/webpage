export enum GameState {
  START = 'START',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER',
}

export type Shape = 'circle' | 'square' | 'triangle' | 'star' | 'pentagon' | 'hexagon' | 'diamond';
export type GameMode = 'Arcade' | 'Pro';
export type TargetSizePct = 10 | 15 | 20;

export interface GameSettings {
  mode: GameMode;
  targetSizePct: TargetSizePct;
}

export interface Target {
  id: string;
  x: number; // Percentage 0-100
  y: number; // Percentage 0-100
  color: string;
  shape: Shape;
  createdAt: number;
  stackCount: number; // 1 = normal, >1 = stacked
}

export interface RunHistoryItem {
  id: string;
  timestamp: number;
  score: number;
  mode: GameMode;
  maxMultiplier: number;
  rankTitle?: string;
}

export interface HighScore { // Keeping for backward compatibility if needed, but we will use RunHistoryItem
  name: string;
  score: number;
  commentary?: string;
  mode: GameMode;
}

export interface GameStats {
  bestResponseTime: number;
  worstResponseTime: number;
  medianResponseTime: number;
  clickIntervals: number[];
  maxMultiplier: number;
}

export interface AudioConfig {
  musicVolume: number;
  sfxVolume: number;
}