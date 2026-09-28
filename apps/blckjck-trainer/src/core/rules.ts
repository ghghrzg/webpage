export interface RuleSet {
  id: string;
  name: string;
  decks: number;
  dealerHoleCard: boolean;
  dealerHitsSoft17: boolean;
  blackjackPayout: number;
  doubleAllowedTotals: readonly number[];
  doubleAfterSplit: boolean;
  maxHandsAfterSplits: number;
  splitAcesOneCardOnly: boolean;
  resplitAces: boolean;
  surrender: boolean;
  insurance: boolean;
  evenMoney: boolean;
  dealerBlackjackLosesAllBets: boolean;
}
export const WIESBADEN_RULES: Readonly<RuleSet> = Object.freeze({
  id: "wiesbaden",
  name: "Wiesbaden Rules",
  decks: 6,
  dealerHoleCard: false,
  dealerHitsSoft17: false,
  blackjackPayout: 1.5,
  doubleAllowedTotals: Object.freeze([9, 10, 11]),
  doubleAfterSplit: true,
  maxHandsAfterSplits: 4,
  splitAcesOneCardOnly: true,
  resplitAces: false,
  surrender: false,
  insurance: true,
  evenMoney: true,
  dealerBlackjackLosesAllBets: true,
});
