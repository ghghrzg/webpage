import { CELLS, isTrap, type Cell, type HandType } from "./strategy";
import type { RNG } from "./cards";

export interface DecisionStats {
  seen: number;
  correct: number;
  confidentCorrect: number;
  confidentWrong: number;
  unsureCorrect: number;
  unsureWrong: number;
  streak: number;
  lastSeen: number;
  times: number[];
  recent: boolean[];
}
export interface DifficultDecision {
  firstMarkedAt: number;
  lastMarkedAt: number;
  unsureCount: number;
  correctAfterMark: number;
  wrongAfterMark: number;
  pinned: boolean;
  resolved: boolean;
}
export interface Training {
  decisions: Record<string, DecisionStats>;
  difficult: Record<string, DifficultDecision>;
}
export type Mode = "practice" | "learn" | "weak" | "unsure" | "test";
export type Group = "all" | HandType | "traps";
export const emptyTraining = (): Training => ({ decisions: {}, difficult: {} });
export const emptyDecision = (): DecisionStats => ({
  seen: 0,
  correct: 0,
  confidentCorrect: 0,
  confidentWrong: 0,
  unsureCorrect: 0,
  unsureWrong: 0,
  streak: 0,
  lastSeen: 0,
  times: [],
  recent: [],
});
export function markUncertain(
  training: Training,
  key: string,
  now = Date.now(),
): Training {
  const next = structuredClone(training);
  const entry = next.difficult[key] ?? {
    firstMarkedAt: now,
    lastMarkedAt: now,
    unsureCount: 0,
    correctAfterMark: 0,
    wrongAfterMark: 0,
    pinned: false,
    resolved: false,
  };
  entry.lastMarkedAt = now;
  entry.unsureCount++;
  entry.resolved = false;
  next.difficult[key] = entry;
  return next;
}
export function recordAnswer(
  training: Training,
  key: string,
  correct: boolean,
  unsure: boolean,
  ms: number,
  now = Date.now(),
): Training {
  const next = structuredClone(training);
  const stats = next.decisions[key] ?? emptyDecision();
  stats.seen++;
  stats.correct += Number(correct);
  stats.lastSeen = now;
  stats.streak = correct ? stats.streak + 1 : 0;
  stats[
    unsure
      ? correct
        ? "unsureCorrect"
        : "unsureWrong"
      : correct
        ? "confidentCorrect"
        : "confidentWrong"
  ]++;
  stats.times = [...stats.times, Math.max(0, Math.min(ms, 3600000))].slice(-50);
  stats.recent = [...stats.recent, correct].slice(-10);
  next.decisions[key] = stats;
  const difficult = next.difficult[key];
  if (difficult) difficult[correct ? "correctAfterMark" : "wrongAfterMark"]++;
  return next;
}
export const isWeak = (stats?: DecisionStats) =>
  !!stats &&
  (stats.correct / stats.seen < 0.9 ||
    stats.recent.filter(Boolean).length / stats.recent.length < 0.8 ||
    (stats.confidentWrong > 0 && stats.streak < 3));
export function poolFor(
  training: Training,
  mode: Mode,
  group: Group,
  onlyKey?: string,
): readonly Cell[] {
  return CELLS.filter((cell) => {
    if (cell.row.value === "21" || cell.row.value === "A10") return false;
    if (onlyKey) return cell.key === onlyKey;
    if (
      group !== "all" &&
      (group === "traps" ? !isTrap(cell) : cell.row.type !== group)
    )
      return false;
    if (mode === "weak") return isWeak(training.decisions[cell.key]);
    if (mode === "unsure")
      return (
        !!training.difficult[cell.key] && !training.difficult[cell.key].resolved
      );
    return true;
  });
}
export function nextCell(
  training: Training,
  pool: readonly Cell[],
  previousKey?: string,
  rng: RNG = Math.random,
  adaptive = true,
  now = Date.now(),
): Cell | undefined {
  const candidates = pool.filter(
    (c) => pool.length === 1 || c.key !== previousKey,
  );
  const weights = candidates.map((cell) => {
    if (!adaptive) return 1;
    const stats = training.decisions[cell.key];
    const difficult = training.difficult[cell.key];
    let weight = stats
      ? 1 +
        5 * (1 - stats.correct / stats.seen) +
        Math.min(3, (now - stats.lastSeen) / 86400000) +
        (stats.confidentWrong && stats.streak < 3 ? 3 : 0) +
        Math.min(2, median(stats.times) / 4000)
      : 4;
    if (stats) weight /= 1 + Math.min(stats.streak, 5) * 0.2;
    if (difficult && !difficult.resolved)
      weight *=
        1 +
        Math.min(difficult.unsureCount, 4) * 0.75 +
        Number(difficult.pinned);
    return weight;
  });
  let target = rng() * weights.reduce((a, b) => a + b, 0);
  return (
    candidates.find((_, i) => (target -= weights[i]) < 0) ?? candidates.at(-1)
  );
}
export function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}
