import { describe, expect, it } from "vitest";
import { STRATEGY, type Action } from "./strategy";
import { ACTIONS, DEALERS, getAdvice } from "./strategy";
import { handValue, sampleCard } from "./cards";
import { freshState, parseBackup } from "./storage";
import {
  STRATEGY_RANGES,
  describeRange,
  editRange,
  emptyRangeDraft,
  nextRange,
  rangeHand,
  recordRangeAnswer,
  scoreRange,
} from "./strategyRanges";

describe("strategy ranges", () => {
  it("generates two unambiguous cards per category with matching advice", () => {
    let seed = 791;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const hardNineHands = new Set<string>();
    for (const category of STRATEGY_RANGES) {
      for (let i = 0; i < 40; i++) {
        const cards = rangeHand(category, rng);
        expect(cards).toHaveLength(2);
        expect(cards[0].suit).not.toBe(cards[1].suit);
        expect(handValue(cards).bust).toBe(false);
        for (const [index, dealer] of DEALERS.entries()) {
          const advice = getAdvice(cards, sampleCard(dealer, 9, rng), ACTIONS);
          expect(advice.row.type).toBe(category.type);
          expect(category.values).toContain(advice.row.value);
          expect(advice.action).toBe(category.answers[index]);
        }
        if (category.id === "pair-10")
          expect(cards.map((card) => card.rank)).toEqual(["10", "10"]);
        if (category.id === "hard-9")
          hardNineHands.add(
            cards
              .map((card) => card.rank)
              .sort()
              .join(","),
          );
      }
    }
    expect(hardNineHands.size).toBe(3);
    const legacy = JSON.parse(JSON.stringify(freshState()));
    delete legacy.settings.rangeCards;
    expect(parseBackup(JSON.stringify(legacy)).settings.rangeCards).toBe(false);
    legacy.settings.rangeCards = true;
    expect(parseBackup(JSON.stringify(legacy)).settings.rangeCards).toBe(true);
  });
  it("shrinks a swipe range and restores the answers from before the gesture", () => {
    for (const marked of [false, true]) {
      const original = marked
        ? editRange(emptyRangeDraft(), {
            type: "paint",
            indices: [5, 6],
            action: "S",
            stroke: 1,
          })
        : emptyRangeDraft();
      const extended = editRange(original, {
        type: "paint",
        indices: [0, 1, 2, 3, 4, 5, 6],
        action: "P",
        stroke: 2,
        base: original.answers,
      });
      expect(extended.answers.slice(0, 7)).toEqual(Array(7).fill("P"));
      const shortened = editRange(extended, {
        type: "paint",
        indices: [0, 1, 2, 3, 4],
        action: "P",
        stroke: 2,
        base: original.answers,
      });
      expect(shortened.answers.slice(0, 5)).toEqual(Array(5).fill("P"));
      expect(shortened.answers.slice(5)).toEqual(original.answers.slice(5));
      expect(shortened.history).toHaveLength(original.history.length + 1);
      expect(editRange(shortened, { type: "undo" }).answers).toEqual(
        original.answers,
      );
    }
  });
  it("matches all 17 requested categories and covers the canonical matrix once", () => {
    const expected = [
      ["Hard ≤8", "HHHHHHHHHH"],
      ["Hard 9", "HDDDDHHHHH"],
      ["Hard 10–11", "DDDDDDDDHH"],
      ["Hard 12", "HHSSSHHHHH"],
      ["Hard 13–16", "SSSSSHHHHH"],
      ["Hard 17+", "SSSSSSSSSS"],
      ["Soft ≤17", "HHHHHHHHHH"],
      ["Soft 18", "SSSSSSSHHH"],
      ["Soft 19+", "SSSSSSSSSS"],
      ["A,A", "PPPPPPPPPH"],
      ["10,10", "SSSSSSSSSS"],
      ["9,9", "PPPPPSPPSS"],
      ["8,8", "PPPPPPPPHH"],
      ["2,2 / 3,3 / 7,7", "PPPPPPHHHH"],
      ["6,6", "PPPPPHHHHH"],
      ["5,5", "DDDDDDDDHH"],
      ["4,4", "HHHPPHHHHH"],
    ];
    expect(
      STRATEGY_RANGES.map((range) => [range.label, range.answers.join("")]),
    ).toEqual(expected);
    expect(new Set(STRATEGY_RANGES.map((range) => range.id)).size).toBe(17);
    expect(
      STRATEGY_RANGES.flatMap((range) =>
        range.values.map((value) => `${range.type}-${value}`),
      ).sort(),
    ).toEqual(STRATEGY.map((row) => `${row.type}-${row.value}`).sort());
  });

  it("records a whole category as one attempt and refuses incomplete answers", () => {
    const category = STRATEGY_RANGES.find((range) => range.id === "pair-8")!;
    expect(() => scoreRange(category, emptyRangeDraft().answers)).toThrow();
    expect(() => recordRangeAnswer({}, category, ["P"])).toThrow();
    const answers = [...category.answers];
    answers[8] = "P";
    expect(scoreRange(category, answers)).toBe(9);
    const first = recordRangeAnswer({}, category, answers, 100);
    const second = recordRangeAnswer(first, category, category.answers, 200);
    expect(first[category.id]).toEqual({
      attempts: 1,
      perfect: 0,
      mistakes: 1,
      lastSeen: 100,
    });
    expect(second[category.id]).toEqual({
      attempts: 2,
      perfect: 1,
      mistakes: 1,
      lastSeen: 200,
    });
    expect(describeRange(category)).toEqual(["2–9 → Split", "10–A → Hit"]);
    expect(
      describeRange(STRATEGY_RANGES.find((range) => range.id === "pair-9")!),
    ).toEqual(["2–6 → Split", "7 → Stand", "8–9 → Split", "10–A → Stand"]);
  });

  it("prioritizes categories with errors, keeps all categories eligible and avoids repeats", () => {
    const training = Object.fromEntries(
      STRATEGY_RANGES.map(({ id }) => [
        id,
        {
          attempts: 10,
          perfect: 10,
          mistakes: 0,
          lastSeen: 100,
        },
      ]),
    );
    training["pair-8"] = {
      attempts: 10,
      perfect: 0,
      mistakes: 80,
      lastSeen: 100,
    };
    let seed = 731;
    const rng = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    const counts: Record<string, number> = {};
    for (let i = 0; i < 6000; i++) {
      const category = nextRange(training, undefined, rng);
      counts[category.id] = (counts[category.id] ?? 0) + 1;
      expect(nextRange(training, category.id, rng).id).not.toBe(category.id);
    }
    expect(Object.keys(counts)).toHaveLength(17);
    expect(counts["pair-8"]).toBeGreaterThan(counts["hard-12"] * 4);
    expect(nextRange({}, undefined, () => 0).id).not.toBe(
      nextRange({}, undefined, () => 0.99).id,
    );
  });

  it("undoes entire strokes, overwrites and fills without retaining no-op edits", () => {
    const blank = emptyRangeDraft();
    const first = editRange(blank, {
      type: "paint",
      indices: [0],
      action: "H",
      stroke: 1,
    });
    const swipe = editRange(first, {
      type: "paint",
      indices: [1, 2, 3, 4],
      action: "H",
      stroke: 1,
    });
    expect(swipe.history).toHaveLength(1);
    expect(editRange(swipe, { type: "undo" }).answers).toEqual(blank.answers);
    const noop = editRange(swipe, {
      type: "paint",
      indices: [0],
      action: "H",
      stroke: 2,
    });
    expect(noop).toBe(swipe);
    const rest = editRange(noop, {
      type: "paint",
      indices: [5, 6, 7, 8, 9],
      action: "S",
      stroke: 2,
    });
    expect(rest.history).toHaveLength(2);
    expect(rest.answers).toEqual([
      "H",
      "H",
      "H",
      "H",
      "H",
      "S",
      "S",
      "S",
      "S",
      "S",
    ]);
    const overwrite = editRange(rest, {
      type: "paint",
      indices: [0],
      action: "P",
      stroke: 3,
    });
    expect(editRange(overwrite, { type: "undo" }).answers).toEqual(
      rest.answers,
    );
    expect(editRange(rest, { type: "undo" }).answers).toEqual(swipe.answers);
    expect(editRange(rest, { type: "reset" })).toEqual(blank);
  });

  it("migrates old saves and validates range statistics on import", () => {
    const state = freshState();
    const legacy = JSON.parse(JSON.stringify(state));
    delete legacy.strategyRanges;
    expect(parseBackup(JSON.stringify(legacy))).toEqual(state);
    const category = STRATEGY_RANGES[0];
    state.strategyRanges = recordRangeAnswer(
      {},
      category,
      Array<Action>(10).fill("S"),
      100,
    );
    expect(parseBackup(JSON.stringify(state))).toEqual(state);
    for (const stats of [
      { attempts: 1, perfect: 2, mistakes: 0, lastSeen: 100 },
      { attempts: 1, perfect: 1, mistakes: 1, lastSeen: 100 },
      { attempts: 1, perfect: 0, mistakes: 0, lastSeen: 100 },
      { attempts: 1, perfect: 0, mistakes: 11, lastSeen: 100 },
    ]) {
      state.strategyRanges[category.id] = stats;
      expect(() => parseBackup(JSON.stringify(state))).toThrow();
    }
    state.strategyRanges = {
      unknown: { attempts: 1, perfect: 1, mistakes: 0, lastSeen: 100 },
    };
    expect(() => parseBackup(JSON.stringify(state))).toThrow();
  });
});
