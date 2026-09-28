import { describe, expect, it } from "vitest";
import {
  createTrainingRound,
  questionFromRound,
  cardsInDealOrder,
} from "./trainingRound";
import { getAdvice, questionFor, CELL_BY_KEY } from "./strategy";
import { legalActions, playAction } from "./engine";
import { emptyTraining, poolFor } from "./training";
import { handValue, type Rank } from "./cards";

function start(key: string, upcoming: Rank[] = []) {
  const game = createTrainingRound(
    questionFor(CELL_BY_KEY.get(key)!, () => 0.5),
    () => 0.3,
  );
  const draw = upcoming.map(
    (rank) =>
      game.shoe.splice(
        game.shoe.findIndex((c) => c.rank === rank),
        1,
      )[0],
  );
  game.shoe.push(...draw.reverse());
  return game;
}
describe("complete training hands reuse the game engine", () => {
  it("starts every trainable cell with an exact physical shoe and matching advice", () => {
    for (const cell of poolFor(emptyTraining(), "practice", "all")) {
      const game = createTrainingRound(
        questionFor(cell, () => 0.5),
        () => 0.4,
      );
      const question = questionFromRound(game);
      expect(question.cell.key).toBe(cell.key);
      expect(
        getAdvice(question.cards, question.dealer, question.allowed).action,
      ).toBe(question.cell.code[0]);
      const all = [...game.shoe, ...cardsInDealOrder(game)];
      expect(all).toHaveLength(312);
      expect(new Set(all.map((c) => c.id)).size).toBe(312);
      expect(game.bankroll).toBe(990);
    }
  });
  it("continues after hit with the new total and forbids a subsequent double", () => {
    let game = start("hard-5-vs-6", ["4", "10", "2"]);
    game = playAction(game, "H");
    const question = questionFromRound(game);
    expect(handValue(question.cards).total).toBe(9);
    expect(question.cell.key).toBe("hard-9-vs-6");
    expect(question.allowed).not.toContain("D");
    expect(
      getAdvice(question.cards, question.dealer, question.allowed).action,
    ).toBe("H");
    game = playAction(game, "S");
    expect(game.phase).toBe("settled");
  });
  it("plays both split hands in order, including a double after split", () => {
    let game = start("pair-88-vs-6", ["3", "10", "2", "10", "3"]);
    game = playAction(game, "P");
    expect(game.hands).toHaveLength(2);
    expect(questionFromRound(game).cell.key).toBe("hard-11-vs-6");
    expect(legalActions(game)).toContain("D");
    game = playAction(game, "D");
    expect(game.active).toBe(1);
    expect(questionFromRound(game).cell.key).toBe("hard-10-vs-6");
    game = playAction(game, "S");
    expect(game.phase).toBe("settled");
    expect(game.dealer).toHaveLength(3);
    expect(() => questionFromRound(game)).toThrow();
  });
  it("automatically finishes a bust or split aces without creating spurious decisions", () => {
    expect(playAction(start("hard-16-vs-10", ["K", "7"]), "H").phase).toBe(
      "settled",
    );
    const aces = playAction(start("pair-AA-vs-6", ["K", "9", "10", "3"]), "P");
    expect(aces.phase).toBe("settled");
    expect(aces.hands.every((h) => h.cards.length === 2)).toBe(true);
  });
});
