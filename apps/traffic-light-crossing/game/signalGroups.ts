import { LevelConfig, PhaseId } from './types';

export type SignalGroupOption = { label: string; phaseIds: PhaseId[] };

// Only expose combinations already present on the control panel; these are
// the level's intended compatible movements. Keep single-signal control too.
export function signalGroupsForPhase(level: LevelConfig, phaseId: PhaseId): SignalGroupOption[] {
  if (!level.phases.some((phase) => phase.id === phaseId)) return [];
  const groups: SignalGroupOption[] = [];
  const seen = new Set<string>();
  const add = (label: string, phaseIds: PhaseId[]) => {
    const key = [...phaseIds].sort().join('|');
    if (seen.has(key)) return;
    seen.add(key);
    groups.push({ label, phaseIds });
  };
  level.controlButtons.forEach((button) => {
    if (button.action.type === 'scene' && button.action.phaseIds.includes(phaseId)) {
      add(button.label, button.action.phaseIds);
    } else if (button.action.type === 'phase' && button.action.phaseId === phaseId) {
      add(button.label, [phaseId]);
    }
  });
  add(`Nur ${level.phases.find((phase) => phase.id === phaseId)!.label}`, [phaseId]);
  return groups;
}

export function cycleSignalGroup(index: number, direction: number, count: number) {
  if (count <= 0) return 0;
  return ((index + Math.sign(direction)) % count + count) % count;
}
