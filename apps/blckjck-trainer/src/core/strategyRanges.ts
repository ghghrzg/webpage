import { SUITS, type Card, type Rank, type RNG } from "./cards";
import {
  ACTION_LABEL,
  ACTIONS,
  DEALERS,
  STRATEGY,
  resolveLegalAction,
  type Action,
  type HandType,
} from "./strategy";

export interface StrategyRange {
  readonly id: string;
  readonly label: string;
  readonly type: HandType;
  readonly values: readonly string[];
  readonly answers: readonly Action[];
}

function range(
  id: string,
  label: string,
  type: HandType,
  values: string[],
): StrategyRange {
  // Use the canonical matrix, including its ENHC exceptions. Fallbacks do not
  // apply here: a range asks for the primary action with all actions available.
  const rows = values.map((value) =>
    STRATEGY.find((row) => row.type === type && row.value === value),
  );
  if (rows.some((row) => !row)) throw new Error(`Strategie fehlt: ${id}`);
  const answers = rows[0]!.cells.map((code) =>
    resolveLegalAction(code, ACTIONS),
  );
  if (
    rows.some((row) =>
      row!.cells.some(
        (code, index) => resolveLegalAction(code, ACTIONS) !== answers[index],
      ),
    )
  )
    throw new Error(`Unterschiedliche Strategien in Kategorie ${id}`);
  return Object.freeze({
    id,
    label,
    type,
    values: Object.freeze(values),
    answers: Object.freeze(answers),
  });
}

export const STRATEGY_RANGES: readonly StrategyRange[] = Object.freeze([
  range("hard-low", "Hard ≤8", "hard", ["5", "6", "7", "8"]),
  range("hard-9", "Hard 9", "hard", ["9"]),
  range("hard-10-11", "Hard 10–11", "hard", ["10", "11"]),
  range("hard-12", "Hard 12", "hard", ["12"]),
  range("hard-13-16", "Hard 13–16", "hard", ["13", "14", "15", "16"]),
  range("hard-high", "Hard 17+", "hard", ["17", "18", "19", "20", "21"]),
  range("soft-low", "Soft ≤17", "soft", ["A2", "A3", "A4", "A5", "A6"]),
  range("soft-18", "Soft 18", "soft", ["A7"]),
  range("soft-high", "Soft 19+", "soft", ["A8", "A9", "A10"]),
  range("pair-aces", "A,A", "pair", ["AA"]),
  range("pair-10", "10,10", "pair", ["1010"]),
  range("pair-9", "9,9", "pair", ["99"]),
  range("pair-8", "8,8", "pair", ["88"]),
  range("pair-2-3-7", "2,2 / 3,3 / 7,7", "pair", ["22", "33", "77"]),
  range("pair-6", "6,6", "pair", ["66"]),
  range("pair-5", "5,5", "pair", ["55"]),
  range("pair-4", "4,4", "pair", ["44"]),
]);

export interface RangeStats {
  attempts: number;
  perfect: number;
  mistakes: number;
  lastSeen: number;
}
export type RangeTraining = Record<string, RangeStats>;
export type RangeAnswers = readonly (Action | null)[];

export function rangeHand(
  category: StrategyRange,
  rng: RNG = Math.random,
): Card[] {
  const combinations: [Rank, Rank][] = [];
  if (category.type === "hard") {
    // Equal values belong to the pair categories; aces would make a soft hand.
    for (let first = 2; first <= 10; first++)
      for (let second = first + 1; second <= 10; second++)
        if (category.values.includes(String(first + second)))
          combinations.push([String(first) as Rank, String(second) as Rank]);
  } else {
    for (const value of category.values) {
      if (category.type === "soft")
        combinations.push(["A", value.slice(1) as Rank]);
      else {
        const rank = (
          value === "AA" ? "A" : value === "1010" ? "10" : value[0]
        ) as Rank;
        combinations.push([rank, rank]);
      }
    }
  }
  if (!combinations.length)
    throw new Error(`Kein Kartenpaar für ${category.id}`);
  const ranks = [...combinations[Math.floor(rng() * combinations.length)]];
  if (rng() < 0.5) ranks.reverse();
  const firstSuit = Math.floor(rng() * SUITS.length);
  const secondSuit = (firstSuit + 1 + Math.floor(rng() * 3)) % SUITS.length;
  return ranks.map((rank, index) => ({
    id: `range-card-${index}`,
    deck: 0,
    rank,
    suit: SUITS[index === 0 ? firstSuit : secondSuit],
  }));
}

export function scoreRange(category: StrategyRange, answers: RangeAnswers) {
  if (answers.length !== DEALERS.length || answers.some((answer) => !answer))
    throw new Error("Bitte alle zehn Dealer-Karten beantworten.");
  return answers.filter((answer, index) => answer === category.answers[index])
    .length;
}

export function recordRangeAnswer(
  training: RangeTraining,
  category: StrategyRange,
  answers: RangeAnswers,
  now = Date.now(),
): RangeTraining {
  const correct = scoreRange(category, answers);
  const previous = training[category.id] ?? {
    attempts: 0,
    perfect: 0,
    mistakes: 0,
    lastSeen: 0,
  };
  return {
    ...training,
    [category.id]: {
      attempts: previous.attempts + 1,
      perfect: previous.perfect + Number(correct === DEALERS.length),
      mistakes: previous.mistakes + DEALERS.length - correct,
      lastSeen: now,
    },
  };
}

export function nextRange(
  training: RangeTraining,
  previousId?: string,
  rng: RNG = Math.random,
): StrategyRange {
  const candidates = STRATEGY_RANGES.filter((range) => range.id !== previousId);
  const weights = candidates.map(({ id }) => {
    const stats = training[id];
    if (!stats?.attempts) return 2;
    // A whole category is one attempt. Both imperfect rounds and the number of
    // wrong fields increase its weight, while every category remains eligible.
    return (
      1 +
      4 * (1 - stats.perfect / stats.attempts) +
      (2 * stats.mistakes) / (DEALERS.length * stats.attempts)
    );
  });
  let cursor = rng() * weights.reduce((sum, weight) => sum + weight, 0);
  for (let index = 0; index < candidates.length; index++) {
    cursor -= weights[index];
    if (cursor < 0) return candidates[index];
  }
  return candidates[candidates.length - 1];
}

export function describeRange(category: StrategyRange): string[] {
  const runs: string[] = [];
  for (let start = 0; start < DEALERS.length;) {
    let end = start;
    while (
      end + 1 < DEALERS.length &&
      category.answers[end + 1] === category.answers[start]
    )
      end++;
    const dealers =
      end === start ? DEALERS[start] : `${DEALERS[start]}–${DEALERS[end]}`;
    runs.push(`${dealers} → ${ACTION_LABEL[category.answers[start]]}`);
    start = end + 1;
  }
  return runs;
}

export interface RangeDraft {
  answers: RangeAnswers;
  history: readonly RangeAnswers[];
  stroke: number | null;
}
export type RangeEdit =
  | {
      type: "paint";
      indices: number[];
      action: Action;
      stroke: number;
      base?: RangeAnswers;
    }
  | { type: "undo" }
  | { type: "reset" };

export const emptyRangeDraft = (): RangeDraft => ({
  answers: DEALERS.map(() => null),
  history: [],
  stroke: null,
});

export function editRange(draft: RangeDraft, edit: RangeEdit): RangeDraft {
  if (edit.type === "reset") return emptyRangeDraft();
  if (edit.type === "undo") {
    if (!draft.history.length) return draft;
    return {
      answers: draft.history[draft.history.length - 1],
      history: draft.history.slice(0, -1),
      stroke: null,
    };
  }
  const indices = new Set(edit.indices);
  const answers = (edit.base ?? draft.answers).map((answer, index) =>
    indices.has(index) ? edit.action : answer,
  );
  if (answers.every((answer, index) => answer === draft.answers[index]))
    return draft;
  return {
    answers,
    history:
      edit.stroke === draft.stroke
        ? draft.history
        : [...draft.history.slice(-99), draft.answers],
    stroke: edit.stroke,
  };
}
