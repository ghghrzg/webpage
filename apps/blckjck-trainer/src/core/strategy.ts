import {
  cardValue,
  handValue,
  sampleCard,
  type Card,
  type Rank,
  type RNG,
} from "./cards";

export type Action = "H" | "S" | "D" | "P";
export type StrategyCode = "H" | "S" | "D/H" | "D/S" | "P/H" | "P/S";
export type HandType = "hard" | "soft" | "pair";
export const ACTIONS: readonly Action[] = ["H", "S", "D", "P"];
export const ACTION_LABEL: Record<Action, string> = {
  H: "Card",
  S: "Rest",
  D: "Double",
  P: "Split",
};
export const DEALERS = [
  "2",
  "3",
  "4",
  "5",
  "6",
  "7",
  "8",
  "9",
  "10",
  "A",
] as const;
export type Dealer = (typeof DEALERS)[number];
export interface StrategyRow {
  type: HandType;
  value: string;
  label: string;
  cells: readonly StrategyCode[];
}
const row = (
  type: HandType,
  value: string,
  label: string,
  cells: string,
): StrategyRow =>
  Object.freeze({
    type,
    value,
    label,
    cells: Object.freeze(cells.split(" ") as StrategyCode[]),
  });
// Canonical matrix, transcribed from concept.md. Every consumer uses these rows.
export const STRATEGY: readonly StrategyRow[] = Object.freeze([
  ...[5, 6, 7, 8].map((v) =>
    row("hard", `${v}`, `${v}`, "H H H H H H H H H H"),
  ),
  row("hard", "9", "9", "H D/H D/H D/H D/H H H H H H"),
  row("hard", "10", "10", "D/H D/H D/H D/H D/H D/H D/H D/H H H"),
  row("hard", "11", "11", "D/H D/H D/H D/H D/H D/H D/H D/H H H"),
  row("hard", "12", "12", "H H S S S H H H H H"),
  ...[13, 14, 15, 16].map((v) =>
    row("hard", `${v}`, `${v}`, "S S S S S H H H H H"),
  ),
  ...[17, 18, 19, 20, 21].map((v) =>
    row("hard", `${v}`, `${v}`, "S S S S S S S S S S"),
  ),
  ...[2, 3, 4, 5, 6].map((v) =>
    row("soft", `A${v}`, `A, ${v}`, "H H H H H H H H H H"),
  ),
  row("soft", "A7", "A, 7", "S S S S S S S H H H"),
  ...[8, 9, 10].map((v) =>
    row("soft", `A${v}`, `A, ${v}`, "S S S S S S S S S S"),
  ),
  row("pair", "22", "2, 2", "P/H P/H P/H P/H P/H P/H H H H H"),
  row("pair", "33", "3, 3", "P/H P/H P/H P/H P/H P/H H H H H"),
  row("pair", "44", "4, 4", "H H H P/H P/H H H H H H"),
  row("pair", "55", "5, 5", "D/H D/H D/H D/H D/H D/H D/H D/H H H"),
  row("pair", "66", "6, 6", "P/H P/H P/S P/S P/S H H H H H"),
  row("pair", "77", "7, 7", "P/S P/S P/S P/S P/S P/H H H H H"),
  row("pair", "88", "8, 8", "P/S P/S P/S P/S P/S P/H P/H P/H H H"),
  row("pair", "99", "9, 9", "P/S P/S P/S P/S P/S S P/S P/S S S"),
  row("pair", "1010", "10, 10", "S S S S S S S S S S"),
  row("pair", "AA", "A, A", "P/H P/H P/H P/H P/H P/H P/H P/H P/H H"),
]);
export interface Cell {
  key: string;
  row: StrategyRow;
  dealer: Dealer;
  code: StrategyCode;
}
export const CELLS: readonly Cell[] = STRATEGY.flatMap((r) =>
  DEALERS.map((dealer, i) => ({
    key: `${r.type}-${r.value}-vs-${dealer}`,
    row: r,
    dealer,
    code: r.cells[i],
  })),
);
export const CELL_BY_KEY = new Map(CELLS.map((c) => [c.key, c]));
export function resolveLegalAction(
  code: StrategyCode,
  allowed: readonly Action[],
): Action {
  const [primary, fallback] = code.split("/") as Action[];
  if (allowed.includes(primary)) return primary;
  if (fallback && allowed.includes(fallback)) return fallback;
  throw new Error(`Keine legale Strategieaktion für ${code}.`);
}
export function getAdvice(
  cards: readonly Card[],
  dealer: Card,
  allowed: readonly Action[],
) {
  const { total, soft, bust } = handValue(cards);
  if (bust) throw new Error("Keine Entscheidung für eine überkaufte Hand.");
  const pair =
    cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]);
  const type: HandType = pair ? "pair" : soft ? "soft" : "hard";
  const value = pair
    ? cards[0].rank === "A"
      ? "AA"
      : `${cardValue(cards[0])}${cardValue(cards[0])}`
    : soft
      ? `A${total - 11}`
      : `${total}`;
  const up = (dealer.rank === "A" ? "A" : `${cardValue(dealer)}`) as Dealer;
  const key = `${type}-${value}-vs-${up}`;
  const cell = CELL_BY_KEY.get(key);
  if (!cell) throw new Error(`Strategiezelle fehlt: ${key}`);
  return {
    ...cell,
    action: resolveLegalAction(cell.code, allowed),
    explanation: explain(cell, allowed),
  };
}
export function explain(
  cell: Cell,
  allowed: readonly Action[] = ACTIONS,
): string {
  const action = resolveLegalAction(cell.code, allowed);
  const base = `${cell.row.label} gegen ${cell.dealer}: ${ACTION_LABEL[action]}.`;
  if (cell.code.startsWith("P") && action !== "P")
    return `${base} Teilen ist hier nicht verfügbar. Die Tabelle verwendet deshalb den hinterlegten ${ACTION_LABEL[action]}-Fallback.`;
  if (cell.code.startsWith("D") && action !== "D")
    return `${base} Verdoppeln ist nur mit zwei Karten und Hard 9–11 möglich; sonst eine Karte ziehen.`;
  if (
    (cell.row.value === "11" ||
      cell.row.value === "88" ||
      cell.row.value === "AA") &&
    ["10", "A"].includes(cell.dealer) &&
    action === "H"
  )
    return `${base} ENHC-Ausnahme: Der Dealer zieht seine zweite Karte erst später. Ein Dealer-Blackjack würde auch zusätzliche Split- und Double-Einsätze verlieren lassen.`;
  if (action === "P")
    return `${base} Nach dieser Matrix ist es günstiger, das Paar als zwei getrennte Hände zu spielen.`;
  if (action === "D")
    return `${base} Eine günstige Double-Situation: Einsatz verdoppeln, genau eine weitere Karte erhalten.`;
  if (cell.row.type === "soft")
    return `${base} Das Ass kann 1 oder 11 zählen. Soft 18 steht gegen 2–8; gegen 9, 10 und Ass wird gezogen. Soft 19+ steht immer.`;
  if (action === "S")
    return `${base} Die Tabelle empfiehlt, mit dieser Kombination stehen zu bleiben.`;
  return `${base} Die Tabelle empfiehlt eine weitere Karte. Ein mögliches Überkaufen macht diese Entscheidung nicht falsch.`;
}
export interface Question {
  cell: Cell;
  cards: Card[];
  dealer: Card;
  allowed: Action[];
}
export function questionFor(cell: Cell, rng: RNG = Math.random): Question {
  let ranks: Rank[];
  if (cell.row.type === "pair")
    ranks =
      cell.row.value === "AA"
        ? ["A", "A"]
        : cell.row.value === "1010"
          ? ["10", "10"]
          : [cell.row.value[0] as Rank, cell.row.value[0] as Rank];
  else if (cell.row.type === "soft")
    ranks = ["A", cell.row.value.slice(1) as Rank];
  else {
    const total = Number(cell.row.value);
    const combos: Rank[][] = [];
    for (let a = 2; a <= 10; a++)
      for (let b = a + 1; b <= 10; b++)
        if (a + b === total) combos.push([`${a}` as Rank, `${b}` as Rank]);
    // High hard totals need three cards to avoid teaching a pair as a hard hand.
    ranks = combos.length
      ? combos[Math.floor(rng() * combos.length)]
      : total === 20
        ? ["10", "8", "2"]
        : ["10", "9", "2"];
  }
  const cards = ranks.map((r, i) => sampleCard(r, i, rng));
  const allowed: Action[] = ["H", "S"];
  const value = handValue(cards);
  if (cards.length === 2 && !value.soft && [9, 10, 11].includes(value.total))
    allowed.push("D");
  if (cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1]))
    allowed.push("P");
  return { cell, cards, dealer: sampleCard(cell.dealer, 9, rng), allowed };
}
export const isTrap = (cell: Cell) =>
  (cell.row.type === "hard" &&
    cell.row.value === "11" &&
    ["10", "A"].includes(cell.dealer)) ||
  (cell.row.type === "pair" &&
    cell.row.value === "88" &&
    ["10", "A"].includes(cell.dealer)) ||
  (cell.row.type === "pair" && cell.row.value === "AA" && cell.dealer === "A");
