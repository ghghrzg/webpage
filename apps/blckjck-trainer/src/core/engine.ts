import {
  cardValue,
  createShoe,
  handValue,
  isBlackjack,
  type Card,
  type RNG,
} from "./cards";
import { WIESBADEN_RULES, type RuleSet } from "./rules";
import type { Action } from "./strategy";

export interface PlayerHand {
  cards: Card[];
  bet: number;
  fromSplit: boolean;
  splitAce: boolean;
  done: boolean;
  result?: "win" | "loss" | "push" | "blackjack" | "even-money";
  profit?: number;
}
export interface Game {
  phase: "betting" | "insurance" | "player" | "settled";
  shoe: Card[];
  discard: Card[];
  dealer: Card[];
  hands: PlayerHand[];
  active: number;
  bankroll: number;
  startingBankroll: number;
  baseBet: number;
  insuranceBet: number;
  insuranceProfit: number;
  evenMoney: boolean;
  round: number;
  net: number;
}
export function newGame(rng: RNG = Math.random): Game {
  return {
    phase: "betting",
    shoe: createShoe(rng),
    discard: [],
    dealer: [],
    hands: [],
    active: 0,
    bankroll: 1000,
    startingBankroll: 1000,
    baseBet: 10,
    insuranceBet: 0,
    insuranceProfit: 0,
    evenMoney: false,
    round: 0,
    net: 0,
  };
}
function draw(game: Game): Card {
  const card = game.shoe.pop();
  if (!card) throw new Error("Kartenschuh erschöpft.");
  return card;
}
export function legalActions(
  game: Game,
  rules: RuleSet = WIESBADEN_RULES,
): Action[] {
  if (game.phase !== "player") return [];
  const hand = game.hands[game.active];
  if (!hand || hand.done || handValue(hand.cards).total >= 21) return [];
  const value = handValue(hand.cards);
  const pair =
    hand.cards.length === 2 &&
    cardValue(hand.cards[0]) === cardValue(hand.cards[1]);
  const aceRestricted = hand.splitAce && rules.splitAcesOneCardOnly;
  const actions: Action[] = aceRestricted ? ["S"] : ["H", "S"];
  if (
    !aceRestricted &&
    hand.cards.length === 2 &&
    !value.soft &&
    rules.doubleAllowedTotals.includes(value.total) &&
    (!hand.fromSplit || rules.doubleAfterSplit) &&
    game.bankroll >= hand.bet
  )
    actions.push("D");
  if (
    pair &&
    game.hands.length < rules.maxHandsAfterSplits &&
    game.bankroll >= hand.bet &&
    (!hand.splitAce || rules.resplitAces)
  )
    actions.push("P");
  return actions;
}
function settle(game: Game, rules: RuleSet) {
  game.dealer.push(draw(game));
  const dealerBJ = isBlackjack(game.dealer);
  // Only draw further if an ordinary, live hand still needs a comparison.
  if (
    !dealerBJ &&
    game.hands.some(
      (h) => !handValue(h.cards).bust && !isBlackjack(h.cards, h.fromSplit),
    ) &&
    !game.evenMoney
  ) {
    while (
      handValue(game.dealer).total < 17 ||
      (rules.dealerHitsSoft17 &&
        handValue(game.dealer).total === 17 &&
        handValue(game.dealer).soft)
    )
      game.dealer.push(draw(game));
  }
  const dealer = handValue(game.dealer);
  for (const hand of game.hands) {
    const value = handValue(hand.cards);
    const bj = isBlackjack(hand.cards, hand.fromSplit);
    if (game.evenMoney && bj) {
      hand.result = "even-money";
      hand.profit = hand.bet;
    } else if (value.bust) {
      hand.result = "loss";
      hand.profit = -hand.bet;
    } else if (dealerBJ) {
      hand.result = bj ? "push" : "loss";
      hand.profit = bj ? 0 : -hand.bet;
    } else if (bj) {
      hand.result = "blackjack";
      hand.profit = hand.bet * rules.blackjackPayout;
    } else if (dealer.bust || value.total > dealer.total) {
      hand.result = "win";
      hand.profit = hand.bet;
    } else if (value.total === dealer.total) {
      hand.result = "push";
      hand.profit = 0;
    } else {
      hand.result = "loss";
      hand.profit = -hand.bet;
    }
    game.bankroll += hand.bet + hand.profit;
    hand.done = true;
  }
  game.insuranceProfit = dealerBJ ? game.insuranceBet * 2 : -game.insuranceBet;
  game.bankroll += game.insuranceBet + game.insuranceProfit;
  game.net = game.bankroll - game.startingBankroll;
  game.phase = "settled";
}
function advance(game: Game, rules: RuleSet) {
  while (game.active < game.hands.length) {
    const hand = game.hands[game.active];
    if (hand.cards.length === 1) hand.cards.push(draw(game));
    const lockedAce =
      hand.splitAce &&
      rules.splitAcesOneCardOnly &&
      !(
        rules.resplitAces &&
        hand.cards[1].rank === "A" &&
        game.hands.length < rules.maxHandsAfterSplits &&
        game.bankroll >= hand.bet
      );
    if (lockedAce || handValue(hand.cards).total >= 21) hand.done = true;
    if (!hand.done) return;
    game.active++;
  }
  settle(game, rules);
}
export function deal(
  previous: Game,
  bet: number,
  rng: RNG = Math.random,
  rules: RuleSet = WIESBADEN_RULES,
): Game {
  if (!["betting", "settled"].includes(previous.phase))
    throw new Error("Die Runde läuft bereits.");
  if (
    !Number.isFinite(bet) ||
    bet < 10 ||
    bet % 10 !== 0 ||
    bet > previous.bankroll
  )
    throw new Error("Einsatz muss ein verfügbares Vielfaches von 10 sein.");
  const game = structuredClone(previous);
  game.discard.push(...game.dealer, ...game.hands.flatMap((h) => h.cards));
  if (game.shoe.length < 100) {
    game.shoe = createShoe(rng, rules.decks);
    game.discard = [];
  }
  game.startingBankroll = game.bankroll;
  game.bankroll -= bet;
  game.baseBet = bet;
  game.insuranceBet = 0;
  game.insuranceProfit = 0;
  game.evenMoney = false;
  game.net = 0;
  const first = draw(game);
  game.dealer = [draw(game)];
  game.hands = [
    {
      cards: [first, draw(game)],
      bet,
      fromSplit: false,
      splitAce: false,
      done: false,
    },
  ];
  game.active = 0;
  game.round++;
  game.phase =
    game.dealer[0].rank === "A" && (rules.insurance || rules.evenMoney)
      ? "insurance"
      : "player";
  if (game.phase === "player") advance(game, rules);
  return game;
}
export function chooseInsurance(
  previous: Game,
  choice: "decline" | "insurance" | "even",
  rules: RuleSet = WIESBADEN_RULES,
): Game {
  if (previous.phase !== "insurance")
    throw new Error("Keine Versicherungsentscheidung offen.");
  const game = structuredClone(previous);
  if (choice === "even") {
    if (!rules.evenMoney || !isBlackjack(game.hands[0].cards))
      throw new Error("Even Money nicht verfügbar.");
    game.evenMoney = true;
  }
  if (choice === "insurance") {
    if (!rules.insurance || game.bankroll < game.baseBet / 2)
      throw new Error("Versicherung nicht verfügbar.");
    game.insuranceBet = game.baseBet / 2;
    game.bankroll -= game.insuranceBet;
  }
  game.phase = "player";
  advance(game, rules);
  return game;
}
export function playAction(
  previous: Game,
  action: Action,
  rules: RuleSet = WIESBADEN_RULES,
): Game {
  if (!legalActions(previous, rules).includes(action))
    throw new Error(`Aktion ${action} ist nicht erlaubt.`);
  const game = structuredClone(previous);
  const hand = game.hands[game.active];
  if (action === "H") hand.cards.push(draw(game));
  if (action === "S") hand.done = true;
  if (action === "D") {
    game.bankroll -= hand.bet;
    hand.bet *= 2;
    hand.cards.push(draw(game));
    hand.done = true;
  }
  if (action === "P") {
    game.bankroll -= hand.bet;
    const splitAce = hand.cards[0].rank === "A";
    const next: PlayerHand = {
      cards: [hand.cards.pop()!],
      bet: hand.bet,
      fromSplit: true,
      splitAce,
      done: false,
    };
    hand.fromSplit = true;
    hand.splitAce = splitAce;
    hand.cards.push(draw(game));
    game.hands.splice(game.active + 1, 0, next);
  }
  advance(game, rules);
  return game;
}
