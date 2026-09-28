import { describe, expect, it } from "vitest";
import {
  ACTIONS,
  CELLS,
  STRATEGY,
  getAdvice,
  questionFor,
  resolveLegalAction,
  explain,
} from "./strategy";
import { sampleCard, type Rank } from "./cards";

describe("canonical strategy contract", () => {
  it.each([
    [["8", "8"], "10", "H"],
    [["8", "8"], "A", "H"],
    [["8", "8"], "9", "P"],
    [["A", "A"], "A", "H"],
    [["A", "A"], "10", "P"],
    [["A", "7"], "8", "S"],
    [["A", "7"], "9", "H"],
    [["6", "6"], "6", "P"],
    [["6", "6"], "7", "H"],
    [["10", "6"], "6", "S"],
    [["10", "6"], "7", "H"],
    [["5", "6"], "10", "H"],
    [["5", "6"], "A", "H"],
    [["5", "6"], "9", "D"],
    [["4", "4"], "5", "P"],
    [["9", "9"], "7", "S"],
    [["9", "9"], "8", "P"],
    [["K", "Q"], "6", "S"],
  ])("%j against %s recommends %s", (ranks, dealer, action) => {
    const cards = (ranks as Rank[]).map((rank, i) => sampleCard(rank, i));
    expect(
      getAdvice(cards, sampleCard(dealer as Rank, 9), ACTIONS).action,
    ).toBe(action);
  });
  it("has unique IDs, ten valid cells per row and an explanation for all 360 cells", () => {
    expect(CELLS.length).toBe(360);
    expect(new Set(CELLS.map((c) => c.key)).size).toBe(CELLS.length);
    for (const row of STRATEGY) expect(row.cells).toHaveLength(10);
    for (const cell of CELLS) {
      expect(["H", "S", "D/H", "D/S", "P/H", "P/S"]).toContain(cell.code);
      expect(explain(cell).length).toBeGreaterThan(30);
    }
  });
  it("generates every matrix cell as real cards that map back to that same decision", () => {
    for (const cell of CELLS)
      for (const rng of [() => 0.01, () => 0.55, () => 0.99]) {
        const question = questionFor(cell, rng);
        const advice = getAdvice(
          question.cards,
          question.dealer,
          question.allowed,
        );
        expect(advice.key, cell.key).toBe(cell.key);
        expect(question.allowed).toContain(advice.action);
        expect(advice.action).toBe(
          resolveLegalAction(cell.code, question.allowed),
        );
      }
  });
  it("uses exact fallbacks for limited splits, funds and multi-card doubles", () => {
    const advice = (ranks: Rank[], dealer: Rank) =>
      getAdvice(
        ranks.map((r, i) => sampleCard(r, i)),
        sampleCard(dealer, 9),
        ["H", "S"],
      ).action;
    expect(advice(["6", "6"], "2")).toBe("H");
    expect(advice(["6", "6"], "4")).toBe("S");
    expect(advice(["8", "8"], "6")).toBe("S");
    expect(advice(["8", "8"], "8")).toBe("H");
    expect(advice(["A", "A"], "10")).toBe("H");
    expect(advice(["2", "3", "4"], "6")).toBe("H");
    expect(advice(["5", "5"], "6")).toBe("H");
  });
  it("normalizes suits and all ten-valued dealer cards", () => {
    const keys = ["10", "J", "Q", "K"].map(
      (rank, i) =>
        getAdvice(
          [sampleCard("10", 0), sampleCard("6", 1)],
          sampleCard(rank as Rank, i),
          ACTIONS,
        ).key,
    );
    expect(new Set(keys)).toEqual(new Set(["hard-16-vs-10"]));
  });
});
