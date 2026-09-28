import type { Card, RNG } from "./cards";
import { legalActions, newGame, type Game } from "./engine";
import { getAdvice, type Question } from "./strategy";

/** Start at a selected learning situation, removing its cards from a real shoe.
 * This is a targeted exercise, not a randomly dealt casino initial hand.
 * Insurance is declined; virtual training stakes never touch the free-play bank.
 */
export function createTrainingRound(
  question: Question,
  rng: RNG = Math.random,
): Game {
  const game = newGame(rng);
  const take = (card: Card) => {
    const index = game.shoe.findIndex(
      (c) => c.rank === card.rank && c.suit === card.suit,
    );
    if (index < 0) throw new Error("Trainingskarte fehlt im Kartenschuh.");
    return game.shoe.splice(index, 1)[0];
  };
  game.hands = [
    {
      cards: question.cards.map(take),
      bet: 10,
      fromSplit: false,
      splitAce: false,
      done: false,
    },
  ];
  game.dealer = [take(question.dealer)];
  game.bankroll -= 10;
  game.round = 1;
  game.phase = "player";
  return game;
}
export function questionFromRound(game: Game): Question {
  if (game.phase !== "player") throw new Error("Trainingsrunde ist beendet.");
  const cards = game.hands[game.active].cards;
  const dealer = game.dealer[0];
  const allowed = legalActions(game);
  return { cards, dealer, allowed, cell: getAdvice(cards, dealer, allowed) };
}

/** Initial deal: player, dealer, player. Further cards: hands, then dealer. */
export function cardsInDealOrder(game: Game): Card[] {
  if (!game.hands.length) return [];
  return [
    game.hands[0].cards[0],
    game.dealer[0],
    ...game.hands[0].cards.slice(1),
    ...game.hands.slice(1).flatMap((h) => h.cards),
    ...game.dealer.slice(1),
  ].filter(Boolean);
}
