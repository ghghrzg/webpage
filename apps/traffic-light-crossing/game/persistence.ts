import { createInitialGame } from './engine';
import { DEFAULT_LEVEL_ID, getLevelById, LEVELS } from './levels';
import { GameState } from './types';

export const STORAGE_KEY = 'traffic-light-crossing-save-v2';
export const MAX_HISTORY_MS = 10 * 60 * 1000;
export type CityStatsState = {
  allCars: number;
  allSatisfactionSum: number;
  history: Array<{ ts: number; cars: number; satisfactionSum: number }>;
};
export type PersistedState = {
  version: 3;
  levelId: string;
  game: GameState;
  cityStats: CityStatsState;
  autoSwitchEnabled: boolean;
  autoSwitchSeconds: number;
  autoSwitchSecondsByPhase: Record<string, number>;
  autoSwitchSensorMode: boolean;
};

const finite = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
const seconds = (value: unknown) => Math.min(99.9, finite(value, 8));

export function parseSavedState(raw: string | null, now = Date.now()): PersistedState | null {
  if (!raw) return null;
  try {
    const saved = JSON.parse(raw);
    if (!saved || typeof saved !== 'object') return null;
    const levelId = LEVELS.some((level) => level.id === saved.levelId) ? saved.levelId : DEFAULT_LEVEL_ID;
    const level = getLevelById(levelId);
    const initial = createInitialGame(level, saved.game?.gameMode === 'challenge' ? 'challenge' : 'simulation');
    const stats = saved.cityStats ?? {};
    const allCars = Math.floor(finite(stats.allCars));
    const cityStats: CityStatsState = {
      allCars,
      allSatisfactionSum: Math.min(allCars * 10, finite(stats.allSatisfactionSum)),
      history: Array.isArray(stats.history) ? stats.history.filter((sample: any) =>
        sample && Number.isFinite(sample.ts) && sample.ts >= now - MAX_HISTORY_MS && sample.ts <= now &&
        Number.isInteger(sample.cars) && sample.cars > 0 && Number.isFinite(sample.satisfactionSum) &&
        sample.satisfactionSum >= 0 && sample.satisfactionSum <= sample.cars * 10,
      ).slice(-1000) : [],
    };
    // Old geometry and controllers are incompatible. Preserve earned city progress,
    // but start those intersections fresh instead of reviving a broken queue.
    let game = initial;
    if (saved.version === 3 && saved.game?.levelId === level.id) {
      const source = saved.game;
      const validVehicles = Array.isArray(source.vehicles) && source.vehicles.length <= level.traffic.maxVehicles &&
        source.vehicles.every((vehicle: any) => {
          const lane = level.approaches.find((approach) => approach.direction === vehicle?.direction)?.lanes.find((item) => item.id === vehicle?.laneId);
          return lane && lane.turns.includes(vehicle.turn) &&
            ['regular', 'sport', 'motorcycle'].includes(vehicle.kind) &&
            ['id', 'progress', 'speed', 'maxSpeed', 'acceleration', 'braking', 'reactionMs', 'followGap', 'waitMs', 'lateralOffset', 'lateralVelocity', 'crashMs', 'confusedMs', 'thinkCooldownMs', 'brakeLightMs'].every((key) => Number.isFinite(vehicle[key])) &&
            vehicle.progress >= 0 && vehicle.speed >= 0 && vehicle.braking > 0 && vehicle.acceleration > 0;
        });
      const validPhases = Array.isArray(source.activePhaseIds) && source.activePhaseIds.every((id: unknown) => level.phases.some((phase) => phase.id === id));
      const validRequest = source.manualSceneRequest === null || (Array.isArray(source.manualSceneRequest) && source.manualSceneRequest.every((id: unknown) => level.phases.some((phase) => phase.id === id)));
      const validLights = level.phases.every((phase) => ['red', 'redYellow', 'yellow', 'green'].includes(source.manualLights?.[phase.id]));
      const validNumbers = ['elapsedMs', 'incidents', 'cars', 'score', 'completedWaitMs', 'streak', 'bestStreak', 'switchMs', 'greenMs', 'transitionId', 'transitionTotalMs', 'nextVehicleId', 'lives', 'remainingMs', 'spillCooldownMs'].every((key) => Number.isFinite(source[key]) && source[key] >= 0);
      const validTimers = level.approaches.every((approach) => Number.isFinite(source.spawnMsByDirection?.[approach.direction]));
      if (validVehicles && validPhases && validRequest && validLights && validNumbers && validTimers && ['none', 'yellow', 'allRed', 'redYellow'].includes(source.transitionKind)) {
        const over = initial.gameMode === 'challenge' && (source.lives <= 0 || source.remainingMs <= 0);
        game = {
          ...initial, ...source,
          currentGroupGreenMs: finite(source.currentGroupGreenMs),
          lastGroupGreenMs: finite(source.lastGroupGreenMs),
          gameMode: initial.gameMode, running: !over, paused: !over, over,
          message: over ? 'Runde beendet.' : 'Gespeichertes Spiel. Weiter zum Fortsetzen.',
        };
      }
    }
    return {
      version: 3, levelId, game, cityStats,
      autoSwitchEnabled: saved.autoSwitchEnabled === true && allCars >= 100,
      autoSwitchSeconds: seconds(saved.autoSwitchSeconds),
      autoSwitchSecondsByPhase: Object.fromEntries(level.phases.map((phase) => [phase.id, seconds(saved.autoSwitchSecondsByPhase?.[phase.id] ?? saved.autoSwitchSeconds)])),
      autoSwitchSensorMode: saved.autoSwitchSensorMode === true && allCars >= 1000,
    };
  } catch {
    return null;
  }
}

export function loadPersistedState(): PersistedState | null {
  try { return parseSavedState(localStorage.getItem(STORAGE_KEY)); } catch { return null; }
}
