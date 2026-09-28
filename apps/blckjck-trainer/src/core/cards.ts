export const RANKS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "J",
  "Q",
  "K",
  "A",
] as const;
export const SUITS = ["clubs", "diamonds", "hearts", "spades"] as const;
export type Rank = (typeof RANKS)[number];
export type Suit = (typeof SUITS)[number];
export interface Card {
  id: string;
  deck: number;
  rank: Rank;
  suit: Suit;
}
export type RNG = () => number;
export const cardValue = (card: Card) =>
  card.rank === "A"
    ? 11
    : ["J", "Q", "K"].includes(card.rank)
      ? 10
      : Number(card.rank);
export function handValue(cards: readonly Card[]) {
  let total = cards.reduce((sum, card) => sum + cardValue(card), 0);
  let aces = cards.filter((c) => c.rank === "A").length;
  while (total > 21 && aces > 0) {
    total -= 10;
    aces--;
  }
  return { total, soft: aces > 0, bust: total > 21 };
}
export const isBlackjack = (cards: readonly Card[], fromSplit = false) =>
  !fromSplit && cards.length === 2 && handValue(cards).total === 21;
export function createShoe(rng: RNG = Math.random, decks = 6): Card[] {
  const cards: Card[] = [];
  for (let deck = 0; deck < decks; deck++)
    for (const suit of SUITS)
      for (const rank of RANKS)
        cards.push({ id: `${deck}-${suit}-${rank}`, deck, rank, suit });
  for (let i = cards.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [cards[i], cards[j]] = [cards[j], cards[i]];
  }
  return cards;
}
export function sampleCard(
  rank: Rank,
  index: number,
  rng: RNG = Math.random,
): Card {
  const actualRank =
    rank === "10"
      ? (["10", "J", "Q", "K"] as const)[Math.floor(rng() * 4)]
      : rank;
  return {
    id: `question-${index}`,
    deck: 0,
    rank: actualRank,
    suit: SUITS[Math.floor(rng() * 4)],
  };
}
