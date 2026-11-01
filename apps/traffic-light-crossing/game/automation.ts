import { getStopProgress, phaseForVehicle } from './engine';
import { GameState, LevelConfig } from './types';

export type AutoSwitchCursor = { phaseKey: string; startedAtMs: number | null; durationMs: number; groupIndex?: number; groupPhaseIds?: string[] };
export type AutoSwitchSettings = { enabled: boolean; sensorMode: boolean; secondsByPhase: Record<string, number> };
export const initialAutoSwitchCursor = (): AutoSwitchCursor => ({ phaseKey: '', startedAtMs: null, durationMs: 0 });

export function advanceAutoSwitch(game: GameState, level: LevelConfig, settings: AutoSwitchSettings, previous: AutoSwitchCursor) {
  const result = (cursor: AutoSwitchCursor, request: string | null = null, requestPhases: string[] | null = null) => ({
    cursor, request, requestPhases,
    remainingMs: Math.max(0, cursor.durationMs - (cursor.startedAtMs === null ? 0 : game.elapsedMs - cursor.startedAtMs)),
  });
  if (!settings.enabled || game.over) return result(initialAutoSwitchCursor());
  if (!game.running || game.paused) return result(previous);
  const enabled = level.phases.filter((phase) => settings.secondsByPhase[phase.id] > 0);
  if (!enabled.length) return result(initialAutoSwitchCursor());

  if (level.autoGroups) {
    const rawGroups = level.autoGroups;
    const groups = rawGroups.map((ids) => ids.filter((id) => settings.secondsByPhase[id] > 0));
    const currentIndex = previous.groupIndex ?? rawGroups.findIndex((ids) =>
      game.activePhaseIds.some((id) => ids.includes(id)),
    );
    if (game.transitionKind !== 'none') {
      const pending = game.manualSceneRequest ?? [];
      if (previous.groupIndex === undefined || pending.some((id) => !previous.groupPhaseIds?.includes(id))) {
        return result(initialAutoSwitchCursor());
      }
    }
    if (!game.activePhaseIds.length) {
      if (game.transitionKind !== 'none') return result(previous);
      const start = currentIndex < 0 ? 0 : (currentIndex + 1) % groups.length;
      for (let offset = 0; offset < groups.length; offset++) {
        const candidate = groups[(start + offset) % groups.length];
        if (candidate.length) return result(initialAutoSwitchCursor(), null, candidate);
      }
      return result(initialAutoSwitchCursor());
    }
    if (currentIndex < 0) return result(initialAutoSwitchCursor());

    const groupPhaseIds = previous.groupPhaseIds ?? game.activePhaseIds;
    const groupKey = currentIndex + ':' + groupPhaseIds.map((id) => `${id}=${settings.secondsByPhase[id] ?? 0}`).join(',');
    if (game.transitionKind !== 'none' && previous.phaseKey !== groupKey) return result(initialAutoSwitchCursor());
    const cursor: AutoSwitchCursor = previous.phaseKey === groupKey
      ? { ...previous }
      : { phaseKey: groupKey, groupIndex: currentIndex, groupPhaseIds: [...game.activePhaseIds], durationMs: 0, startedAtMs: settings.sensorMode ? null : game.elapsedMs };
    const active = game.activePhaseIds;
    const durations = active.map((id) => Math.max(0, (settings.secondsByPhase[id] ?? 0) * 1000));
    cursor.durationMs = Math.min(...durations);

    let next: string[] | null = null;
    for (let offset = 1; offset < groups.length; offset++) {
      const candidate = groups[(currentIndex + offset) % groups.length];
      if (!candidate.length || candidate.every((id) => active.includes(id))) continue;
      if (settings.sensorMode && !game.vehicles.some((vehicle) => !vehicle.crashed &&
        candidate.includes(phaseForVehicle(level, vehicle)) &&
        vehicle.progress <= getStopProgress(level) + level.traffic.stopEpsilon)) continue;
      next = candidate;
      break;
    }
    if (!next) return result(cursor);
    if (cursor.startedAtMs === null) cursor.startedAtMs = game.elapsedMs;
    const elapsed = game.elapsedMs - cursor.startedAtMs;
    const retained = active.filter((id) => elapsed < Math.max(0, (settings.secondsByPhase[id] ?? 0) * 1000));
    if (retained.length === active.length) return result(cursor);
    // Shorter green times retire through yellow while longer-running signals
    // remain green. Once the last one expires, switch to the next full group.
    return retained.length > 0
      ? result(cursor, null, retained)
      : result(initialAutoSwitchCursor(), null, next);
  }

  if (game.transitionKind !== 'none') return result(initialAutoSwitchCursor());
  if (!game.activePhaseIds.length) return result(initialAutoSwitchCursor(), enabled[0].id);

  const phaseId = game.activePhaseIds[0];
  const phaseKey = game.activePhaseIds.join('|');
  const durationMs = Math.max(0, (settings.secondsByPhase[phaseId] ?? 0) * 1000);
  const cursor = previous.phaseKey === phaseKey && previous.durationMs === durationMs
    ? { ...previous }
    : { phaseKey, durationMs, startedAtMs: settings.sensorMode ? null : game.elapsedMs };
  const from = level.phases.findIndex((phase) => phase.id === phaseId);
  let next: string | null = null;
  for (let offset = 1; offset <= level.phases.length; offset++) {
    const id = level.phases[(from + offset) % level.phases.length].id;
    if (!(settings.secondsByPhase[id] > 0) || game.activePhaseIds.includes(id)) continue;
    if (settings.sensorMode && !game.vehicles.some((vehicle) => !vehicle.crashed &&
      phaseForVehicle(level, vehicle) === id && vehicle.progress <= getStopProgress(level) + level.traffic.stopEpsilon)) continue;
    next = id;
    break;
  }
  if (next === null) return result(cursor);
  if (cursor.startedAtMs === null) cursor.startedAtMs = game.elapsedMs;
  if (game.elapsedMs - cursor.startedAtMs >= durationMs) return result(initialAutoSwitchCursor(), next);
  return result(cursor);
}
