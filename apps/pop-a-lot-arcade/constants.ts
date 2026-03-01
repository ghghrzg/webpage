import { GameMode, Shape } from './types';

export const GAME_DURATION = 30; // seconds
export const POINTS_BASE = 10;

// Config for Game Modes
export const MODE_CONFIG: Record<GameMode, { 
  colors: string[], 
  shapes: Shape[], 
  maxTargets: number,
  basePoints: number,
  multGainBase: number,
  speedThresholdMs: number
}> = {
  Arcade: {
    colors: ['#EF4444', '#3B82F6', '#22C55E'], // Red, Blue, Green
    shapes: ['circle', 'square', 'triangle'],
    maxTargets: 10,
    basePoints: POINTS_BASE,
    multGainBase: 0.3, // Doubled from 0.15 (Easier)
    speedThresholdMs: 170
  },
  Pro: {
    colors: [
        '#EF4444', // Red
        '#3B82F6', // Blue
        '#22C55E', // Green
        '#EAB308', // Yellow
        '#A855F7', // Purple
        '#F97316', // Orange
        '#06B6D4'  // Cyan
    ],
    shapes: ['circle', 'square', 'triangle', 'star', 'pentagon', 'hexagon', 'diamond'],
    maxTargets: 15, // Increased to 50% more than Arcade
    basePoints: 18, // Higher base reward for harder mode
    multGainBase: 0.3, // Same as Arcade (Easier than before)
    speedThresholdMs: 170 // Same as Arcade
  }
};
