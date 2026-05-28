// Game Configuration
export const GAME_DURATION = 60; // 60 seconds
export const INTERSECTION_SIZE = 100; // pixels for the intersection
export const VEHICLE_SIZE = 20;
export const SPAWN_RATE = 800; // ms between vehicle spawns
export const UPDATE_RATE = 30; // ms per update cycle

// Road Configuration
// North/South: 1 lane each
// East/West: 2 lanes each (1 straight + 1 left turn)
export const ROAD_CONFIG = {
  north: {
    lanes: ['straight'],
    position: 'top',
  },
  south: {
    lanes: ['straight'],
    position: 'bottom',
  },
  east: {
    lanes: ['straight', 'left-turn'],
    position: 'right',
  },
  west: {
    lanes: ['straight', 'left-turn'],
    position: 'left',
  },
} as const;

export const VEHICLE_SPEED = 0.5; // units per update
export const SPAWN_PROBABILITY = 0.3; // probability per update

// Scoring
export const POINTS_PER_VEHICLE = 10;
export const BONUS_SAFE_PASS = 5;

// UI Colors
export const COLOR_SAFE = '#10B981';
export const COLOR_WARNING = '#F59E0B';
export const COLOR_DANGER = '#EF4444';
export const COLOR_BG = '#2F3E55';
