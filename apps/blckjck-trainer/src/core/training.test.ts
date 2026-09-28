import { describe, expect, it } from "vitest";
import { CELLS } from "./strategy";
import {
  emptyTraining,
  edgeWeight,
  isWeak,
  markUncertain,
  median,
  nextCell,
  poolFor,
  recordAnswer,
} from "./training";
import { freshState, parseBackup } from "./storage";
import { deal } from "./engine";

describe("learning and persistence", () => {
  const key = "soft-A7-vs-9";
  it("marks once per canonical cell and never counts marking as an answer", () => {
    const first = markUncertain(emptyTraining(), key, 100);
    const second = markUncertain(first, key, 200);
    expect(Object.keys(second.difficult)).toEqual([key]);
    expect(second.difficult[key].unsureCount).toBe(2);
    expect(second.difficult[key].firstMarkedAt).toBe(100);
    expect(second.difficult[key].lastMarkedAt).toBe(200);
    expect(second.decisions).toEqual({});
    expect(first.difficult[key].unsureCount).toBe(1);
  });
  it("tracks all four confidence quadrants and restores resolved items on marking", () => {
    let training = markUncertain(emptyTraining(), key);
    for (const unsure of [true, false])
      for (const correct of [true, false])
        training = recordAnswer(training, key, correct, unsure, 1400);
    expect(training.decisions[key]).toMatchObject({
      seen: 4,
      correct: 2,
      confidentCorrect: 1,
      confidentWrong: 1,
      unsureCorrect: 1,
      unsureWrong: 1,
    });
    expect(training.difficult[key]).toMatchObject({
      correctAfterMark: 2,
      wrongAfterMark: 2,
    });
    training.difficult[key].resolved = true;
    expect(poolFor(training, "unsure", "all")).toHaveLength(0);
    training = markUncertain(training, key);
    expect(training.difficult[key].resolved).toBe(false);
  });
  it("keeps weak-spot and manually unsure pools independent", () => {
    let training = markUncertain(emptyTraining(), key);
    training = recordAnswer(training, "hard-16-vs-10", false, false, 1200);
    expect(poolFor(training, "unsure", "all").map((c) => c.key)).toEqual([key]);
    expect(poolFor(training, "weak", "all").map((c) => c.key)).toEqual([
      "hard-16-vs-10",
    ]);
    expect(poolFor(training, "practice", "traps")).toHaveLength(5);
    expect(
      poolFor(training, "practice", "hard").every((c) => c.row.type === "hard"),
    ).toBe(true);
    expect(isWeak(training.decisions["hard-16-vs-10"])).toBe(true);
  });
  it("avoids immediate repeats, handles empty pools and can drill one cell", () => {
    expect(nextCell(emptyTraining(), [], key)).toBeUndefined();
    const cell = CELLS.find((c) => c.key === key)!;
    expect(nextCell(emptyTraining(), [cell], key)).toBe(cell);
    expect(
      nextCell(emptyTraining(), CELLS, CELLS[0].key, () => 0)?.key,
    ).not.toBe(CELLS[0].key);
  });
  it("prioritizes boundaries and ENHC traps without changing the advice or excluding basics", () => {
    const pool = poolFor(emptyTraining(), "practice", "all");
    let seed = 761;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    let focused = 0,
      balanced = 0;
    for (let i = 0; i < 3000; i++) {
      if (
        edgeWeight(
          nextCell(emptyTraining(), pool, undefined, rng, true, 0, true)!,
        ) > 1
      )
        focused++;
      if (
        edgeWeight(
          nextCell(emptyTraining(), pool, undefined, rng, true, 0, false)!,
        ) > 1
      )
        balanced++;
    }
    expect(focused / 3000).toBeGreaterThan(0.88);
    expect(focused / 3000).toBeLessThan(0.99);
    expect(balanced / 3000).toBeLessThan(0.65);
    const trap = pool.find((c) => c.key === "pair-88-vs-10")!;
    const basic = pool.find((c) => c.key === "hard-19-vs-6")!;
    expect(edgeWeight(trap)).toBeGreaterThan(edgeWeight(basic) * 10);
    // A test is uniform and independent of the training preference.
    expect(
      nextCell(emptyTraining(), pool, undefined, () => 0.33, false, 0, true),
    ).toBe(
      nextCell(emptyTraining(), pool, undefined, () => 0.33, false, 0, false),
    );
  });
  it("loads existing v1 saves with additive defaults and preserves explicit switches", () => {
    const state = freshState();
    state.training = recordAnswer(state.training, key, true, false, 1500);
    const legacy = JSON.parse(JSON.stringify(state));
    delete legacy.settings.showHandTotals;
    delete legacy.settings.playFullHands;
    delete legacy.settings.focusEdges;
    const migrated = parseBackup(JSON.stringify(legacy));
    expect(migrated.training).toEqual(state.training);
    expect(migrated.settings).toMatchObject({
      showHandTotals: true,
      playFullHands: false,
      focusEdges: true,
    });
    state.settings.showHandTotals = false;
    state.settings.playFullHands = true;
    state.settings.focusEdges = false;
    expect(parseBackup(JSON.stringify(state)).settings).toEqual(state.settings);
  });
  it("computes medians and bounds retained samples", () => {
    expect(median([5, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBe(0);
    let training = emptyTraining();
    for (let i = 0; i < 80; i++)
      training = recordAnswer(training, key, true, false, i);
    expect(training.decisions[key].times).toHaveLength(50);
    expect(training.decisions[key].recent).toHaveLength(10);
  });
  it("round-trips a full state and an active game without dealing again", () => {
    const state = freshState();
    state.training = markUncertain(state.training, key);
    state.game = deal(state.game, 10);
    const restored = parseBackup(JSON.stringify(state));
    expect(restored).toEqual(state);
    expect(restored.game.bankroll).toBe(state.game.bankroll);
  });
  it("rejects malformed, unknown-version, inconsistent and duplicated-card backups", () => {
    expect(() => parseBackup("{no}")).toThrow();
    expect(() =>
      parseBackup(JSON.stringify({ ...freshState(), schemaVersion: 2 })),
    ).toThrow();
    const state = freshState();
    state.game.shoe[0] = state.game.shoe[1];
    expect(() => parseBackup(JSON.stringify(state))).toThrow();
    const wrong = freshState();
    wrong.training = recordAnswer(wrong.training, key, true, false, 1000);
    wrong.training.decisions[key].correct = 20;
    expect(() => parseBackup(JSON.stringify(wrong))).toThrow();
    const invalid = freshState();
    invalid.game.phase = "player";
    expect(() => parseBackup(JSON.stringify(invalid))).toThrow();
  });
});
