import { describe, expect, it } from "vitest";
import {
  createShoe,
  handValue,
  isBlackjack,
  type Card,
  type Rank,
} from "./cards";
import {
  chooseInsurance,
  deal,
  legalActions,
  newGame,
  playAction,
  type Game,
} from "./engine";
import { getAdvice } from "./strategy";
import { WIESBADEN_RULES } from "./rules";
import { freshState, parseBackup } from "./storage";

const cards = (ranks: Rank[]): Card[] =>
  ranks.map((rank, i) => ({ rank, suit: "clubs", deck: 0, id: `${i}` }));
function rig(ranks: Rank[]): Game {
  const game = newGame(() => 0.4);
  const upcoming = ranks.map((rank) => {
    const index = game.shoe.findIndex((c) => c.rank === rank);
    return game.shoe.splice(index, 1)[0];
  });
  game.shoe.push(...upcoming.reverse());
  return game;
}
function seeded(seed = 42) {
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}
describe("hand and shoe", () => {
  it("contains all 312 unique cards and shuffles reproducibly", () => {
    const shoe = createShoe(seeded());
    expect(shoe).toHaveLength(312);
    expect(new Set(shoe.map((c) => c.id)).size).toBe(312);
    expect(shoe).toEqual(createShoe(seeded()));
    expect(shoe).not.toEqual(createShoe(seeded(2)));
    for (const rank of ["A", "2", "10", "K"])
      expect(shoe.filter((c) => c.rank === rank)).toHaveLength(24);
  });
  it("handles multiple aces, soft to hard and bust", () => {
    expect(handValue(cards(["A", "A", "9"]))).toEqual({
      total: 21,
      soft: true,
      bust: false,
    });
    expect(handValue(cards(["A", "6", "10"]))).toEqual({
      total: 17,
      soft: false,
      bust: false,
    });
    expect(handValue(cards(["A", "A", "K", "K"]))).toEqual({
      total: 22,
      soft: false,
      bust: true,
    });
    expect(isBlackjack(cards(["A", "K"]))).toBe(true);
    expect(isBlackjack(cards(["A", "K"]), true)).toBe(false);
    expect(isBlackjack(cards(["7", "7", "7"]))).toBe(false);
  });
});
describe("ENHC game transitions and payouts", () => {
  it("deals only one dealer card and deducts the stake once", () => {
    const initial = rig(["10", "6", "7"]);
    const game = deal(initial, 20);
    expect(game.dealer).toHaveLength(1);
    expect(game.shoe).toHaveLength(309);
    expect(game.bankroll).toBe(980);
    expect(initial.bankroll).toBe(1000);
    expect(initial.hands).toHaveLength(0);
  });
  it("stands on soft 17", () => {
    let game = deal(rig(["10", "A", "8", "6", "K"]), 10);
    game = chooseInsurance(game, "decline");
    game = playAction(game, "S");
    expect(game.dealer.map((c) => c.rank)).toEqual(["A", "6"]);
    expect(game.bankroll).toBe(1010);
  });
  it("dealer hits 16, then pushes on equal totals", () => {
    const game = playAction(deal(rig(["10", "6", "8", "10", "2"]), 10), "S");
    expect(game.dealer.map((c) => c.rank)).toEqual(["6", "10", "2"]);
    expect(game.bankroll).toBe(1000);
    expect(game.net).toBe(0);
  });
  it("player bust loses even if dealer could bust", () => {
    const game = playAction(
      deal(rig(["10", "6", "9", "K", "10", "10"]), 20),
      "H",
    );
    expect(game.phase).toBe("settled");
    expect(game.bankroll).toBe(980);
    expect(game.hands[0].result).toBe("loss");
  });
  it("dealer bust wins an ordinary hand", () => {
    const game = playAction(deal(rig(["10", "6", "8", "10", "K"]), 20), "S");
    expect(game.bankroll).toBe(1020);
    expect(game.hands[0].result).toBe("win");
  });
  it("blackjack pays 3:2, even if dealer draws a non-natural 21", () => {
    const game = deal(rig(["A", "7", "K", "4", "K"]), 10);
    expect(game.phase).toBe("settled");
    expect(game.bankroll).toBe(1015);
    expect(game.hands[0].result).toBe("blackjack");
  });
  it("natural blackjack pushes against a dealer natural", () => {
    const game = deal(rig(["A", "K", "Q", "A"]), 20);
    expect(game.bankroll).toBe(1000);
    expect(game.hands[0].result).toBe("push");
  });
  it("double draws exactly once and pays the doubled bet", () => {
    const game = playAction(
      deal(rig(["5", "6", "6", "10", "10", "2"]), 20),
      "D",
    );
    expect(game.hands[0].cards).toHaveLength(3);
    expect(game.hands[0].bet).toBe(40);
    expect(game.bankroll).toBe(1040);
  });
  it("dealer blackjack takes the entire double against an ace", () => {
    let game = chooseInsurance(
      deal(rig(["5", "A", "6", "10", "K"]), 20),
      "decline",
    );
    game = playAction(game, "D");
    expect(game.bankroll).toBe(960);
    expect(game.net).toBe(-40);
  });
  it("only permits double on two-card hard 9–11 and with sufficient funds", () => {
    expect(legalActions(deal(rig(["4", "6", "5"]), 10))).toContain("D");
    expect(legalActions(deal(rig(["A", "6", "8"]), 10))).not.toContain("D");
    let game = deal(rig(["2", "6", "3", "4"]), 10);
    game = playAction(game, "H");
    expect(handValue(game.hands[0].cards).total).toBe(9);
    expect(legalActions(game)).not.toContain("D");
    expect(legalActions(deal(rig(["5", "6", "6"]), 1000))).not.toContain("D");
  });
  it("allows splitting value-equal face cards", () => {
    expect(legalActions(deal(rig(["K", "6", "Q"]), 10))).toContain("P");
    expect(legalActions(deal(rig(["8", "6", "9"]), 10))).not.toContain("P");
  });
  it("split hands get their second cards in playing order and allow DAS", () => {
    let game = playAction(
      deal(rig(["4", "6", "4", "5", "K", "7", "10", "10", "2"]), 10),
      "P",
    );
    expect(game.hands[1].cards).toHaveLength(1);
    expect(legalActions(game)).toContain("D");
    game = playAction(game, "D");
    expect(game.hands[0].cards.map((c) => c.rank)).toEqual(["4", "5", "K"]);
    expect(game.hands[1].cards.map((c) => c.rank)).toEqual(["4", "7"]);
    expect(legalActions(game)).toContain("D");
    game = playAction(game, "D");
    expect(game.phase).toBe("settled");
    expect(game.bankroll).toBe(1040);
  });
  it("dealer blackjack takes all split stakes, including a doubled split hand", () => {
    let game = playAction(
      deal(rig(["8", "K", "8", "3", "10", "2", "A"]), 10),
      "P",
    );
    game = playAction(game, "D");
    game = playAction(game, "S");
    expect(game.bankroll).toBe(970);
    expect(game.hands.map((h) => h.profit)).toEqual([-20, -10]);
  });
  it("limits resplitting to four hands", () => {
    let game = deal(rig(["8", "6", "8", "8", "8", "8"]), 10);
    for (let i = 0; i < 3; i++) game = playAction(game, "P");
    expect(game.hands).toHaveLength(4);
    expect(legalActions(game)).not.toContain("P");
    expect(game.bankroll).toBe(960);
  });
  it("gives split aces one card, disables resplit, and pays split 21 as ordinary 21", () => {
    const game = playAction(
      deal(rig(["A", "6", "A", "K", "Q", "10", "3"]), 10),
      "P",
    );
    expect(game.phase).toBe("settled");
    expect(game.hands.every((h) => h.cards.length === 2)).toBe(true);
    expect(game.bankroll).toBe(1020);
    expect(game.hands.every((h) => h.result === "win")).toBe(true);
    const resplit = playAction(
      deal(rig(["A", "6", "A", "A", "8", "10", "2"]), 10),
      "P",
    );
    expect(resplit.phase).toBe("settled");
  });
  it("makes ace-resplit a deliberate configurable rule", () => {
    const rules = { ...WIESBADEN_RULES, resplitAces: true };
    const game = playAction(
      deal(rig(["A", "6", "A", "A", "8"]), 10),
      "P",
      rules,
    );
    expect(game.phase).toBe("player");
    expect(legalActions(game, rules)).toEqual(["S", "P"]);
  });
  it("dealer natural beats split 21", () => {
    const game = playAction(
      deal(rig(["A", "K", "A", "10", "Q", "A"]), 10),
      "P",
    );
    expect(game.bankroll).toBe(980);
    expect(game.hands.every((h) => h.result === "loss")).toBe(true);
  });
  it("insurance pays 2:1, including returning its stake", () => {
    let game = chooseInsurance(
      deal(rig(["10", "A", "8", "K"]), 20),
      "insurance",
    );
    expect(game.bankroll).toBe(970);
    game = playAction(game, "S");
    expect(game.insuranceProfit).toBe(20);
    expect(game.bankroll).toBe(1000);
  });
  it("losing insurance is charged once", () => {
    let game = chooseInsurance(
      deal(rig(["10", "A", "8", "6"]), 20),
      "insurance",
    );
    game = playAction(game, "S");
    expect(game.insuranceProfit).toBe(-10);
    expect(game.bankroll).toBe(1010);
  });
  it.each(["K", "6"] as Rank[])(
    "even money pays 1:1 regardless of dealer %s",
    (rank) => {
      const game = chooseInsurance(
        deal(rig(["A", "A", "K", rank]), 20),
        "even",
      );
      expect(game.phase).toBe("settled");
      expect(game.bankroll).toBe(1020);
      expect(game.hands[0].result).toBe("even-money");
    },
  );
  it("rejects invalid actions, bets, insurance and repeated settlement", () => {
    const game = deal(rig(["10", "6", "9", "10", "2"]), 10);
    expect(() => playAction(game, "D")).toThrow();
    expect(() => playAction(game, "P")).toThrow();
    expect(() => chooseInsurance(game, "insurance")).toThrow();
    expect(() => deal(game, 10)).toThrow();
    for (const amount of [-10, 0, 5, 15, 1001, Infinity, NaN])
      expect(() => deal(newGame(), amount)).toThrow();
    const end = playAction(game, "S");
    expect(() => playAction(end, "S")).toThrow();
  });
  it("conserves all 312 cards and survives backup/restore over 500 deterministic rounds", () => {
    const rng = seeded(721);
    let game = newGame(rng);
    const base = freshState();
    for (let round = 0; round < 500; round++) {
      if (game.bankroll < 10) game = newGame(rng);
      game = deal(game, 10, rng);
      if (game.phase === "insurance") game = chooseInsurance(game, "decline");
      let moves = 0;
      while (game.phase === "player") {
        const allowed = legalActions(game);
        const advice = getAdvice(
          game.hands[game.active].cards,
          game.dealer[0],
          allowed,
        );
        game = playAction(game, advice.action);
        if (++moves > 50) throw new Error("Unbounded round");
      }
      expect(game.phase).toBe("settled");
      expect(game.bankroll).toBeGreaterThanOrEqual(0);
      expect(game.net).toBe(
        game.hands.reduce((sum, h) => sum + (h.profit ?? 0), 0) +
          game.insuranceProfit,
      );
      game = parseBackup(JSON.stringify({ ...base, game })).game;
    }
  });
});
