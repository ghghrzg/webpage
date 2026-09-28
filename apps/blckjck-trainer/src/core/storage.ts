import { z } from "zod";
import { RANKS, SUITS, handValue } from "./cards";
import { CELL_BY_KEY, type Action } from "./strategy";
import { newGame, type Game } from "./engine";
import { emptyTraining, type Training } from "./training";

export const STORAGE_KEY = "european-blackjack-trainer:v1";
export interface Settings {
  theme: "dark" | "light" | "system";
  strategyWarnings: "before" | "after" | "disabled";
  autoAdvance: boolean;
  showTimer: boolean;
}
export interface PlayDecision {
  key: string;
  attempted: Action;
  recommended: Action;
  executed: Action;
  unsure: boolean;
  warning: boolean;
  at: number;
}
export interface FreeStats {
  rounds: number;
  hands: number;
  correct: number;
  wrong: number;
  adherence: number;
  warnings: number;
  accepted: number;
  overridden: number;
  history: PlayDecision[];
}
export interface Session {
  id: number;
  mode: string;
  correct: number;
  total: number;
  medianMs: number;
}
export interface AppState {
  schemaVersion: 1;
  createdAt: number;
  lastUsedAt: number;
  settings: Settings;
  training: Training;
  game: Game;
  freePlay: FreeStats;
  sessions: Session[];
  playUnsure: string | null;
  challenge: boolean[];
}
export const emptyFreeStats = (): FreeStats => ({
  rounds: 0,
  hands: 0,
  correct: 0,
  wrong: 0,
  adherence: 0,
  warnings: 0,
  accepted: 0,
  overridden: 0,
  history: [],
});
export const freshState = (): AppState => ({
  schemaVersion: 1,
  createdAt: Date.now(),
  lastUsedAt: Date.now(),
  settings: {
    theme: "dark",
    strategyWarnings: "before",
    autoAdvance: false,
    showTimer: true,
  },
  training: emptyTraining(),
  game: newGame(),
  freePlay: emptyFreeStats(),
  sessions: [],
  playUnsure: null,
  challenge: [false, false, false],
});
const count = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);
const money = z.number().min(0).max(1e12).multipleOf(0.5);
const action = z.enum(["H", "S", "D", "P"]);
const key = z
  .string()
  .refine((k) => CELL_BY_KEY.has(k), "Unbekannte Strategiezelle");
const card = z
  .object({
    id: z.string().max(80),
    deck: z.number().int().min(0).max(5),
    rank: z.enum(RANKS),
    suit: z.enum(SUITS),
  })
  .refine(
    (c) => c.id === `${c.deck}-${c.suit}-${c.rank}`,
    "Ungültige Karten-ID",
  );
const hand = z.object({
  cards: z.array(card).min(1).max(22),
  bet: money.positive(),
  fromSplit: z.boolean(),
  splitAce: z.boolean(),
  done: z.boolean(),
  result: z.enum(["win", "loss", "push", "blackjack", "even-money"]).optional(),
  profit: z.number().finite().optional(),
});
const gameSchema = z
  .object({
    phase: z.enum(["betting", "insurance", "player", "settled"]),
    shoe: z.array(card).max(312),
    discard: z.array(card).max(312),
    dealer: z.array(card).max(22),
    hands: z.array(hand).max(4),
    active: z.number().int().min(0).max(4),
    bankroll: money,
    startingBankroll: money,
    baseBet: money,
    insuranceBet: money,
    insuranceProfit: z.number().finite(),
    evenMoney: z.boolean(),
    round: count,
    net: z.number().finite(),
  })
  .superRefine((game, ctx) => {
    const all = [
      ...game.shoe,
      ...game.discard,
      ...game.dealer,
      ...game.hands.flatMap((h) => h.cards),
    ];
    const bad = (message: string) => ctx.addIssue({ code: "custom", message });
    if (all.length !== 312 || new Set(all.map((c) => c.id)).size !== 312)
      bad("Kartenschuh ist unvollständig oder enthält doppelte Karten.");
    if (game.phase !== "betting" && (!game.dealer.length || !game.hands.length))
      bad("Unvollständige Runde.");
    if (game.phase === "betting" && (game.hands.length || game.dealer.length))
      bad("Ungültiger Startzustand.");
    if (
      game.phase === "player" &&
      (!game.hands[game.active] ||
        game.hands[game.active].cards.length < 2 ||
        game.hands[game.active].done ||
        handValue(game.hands[game.active].cards).total >= 21 ||
        game.dealer.length !== 1 ||
        game.hands[game.active].splitAce)
    )
      bad("Ungültige aktive Hand.");
    if (
      game.phase === "insurance" &&
      (game.dealer.length !== 1 ||
        game.dealer[0].rank !== "A" ||
        game.hands.length !== 1 ||
        game.hands[0].cards.length !== 2)
    )
      bad("Ungültige Versicherungssituation.");
    if (
      game.phase === "settled" &&
      (game.dealer.length < 2 ||
        game.hands.some((h) => !h.done || !h.result || h.profit === undefined))
    )
      bad("Ungültige Abrechnung.");
  });
const decision = z
  .object({
    seen: count,
    correct: count,
    confidentCorrect: count,
    confidentWrong: count,
    unsureCorrect: count,
    unsureWrong: count,
    streak: count,
    lastSeen: count,
    times: z.array(z.number().min(0).max(3600000)).max(50),
    recent: z.array(z.boolean()).max(10),
  })
  .refine(
    (s) =>
      s.correct === s.confidentCorrect + s.unsureCorrect &&
      s.seen === s.correct + s.confidentWrong + s.unsureWrong &&
      s.streak <= s.seen,
    "Inkonsistente Statistik",
  );
const difficult = z.object({
  firstMarkedAt: count,
  lastMarkedAt: count,
  unsureCount: count,
  correctAfterMark: count,
  wrongAfterMark: count,
  pinned: z.boolean(),
  resolved: z.boolean(),
});
const schema = z.object({
  schemaVersion: z.literal(1),
  createdAt: count,
  lastUsedAt: count,
  settings: z.object({
    theme: z.enum(["dark", "light", "system"]),
    strategyWarnings: z.enum(["before", "after", "disabled"]),
    autoAdvance: z.boolean(),
    showTimer: z.boolean(),
  }),
  training: z.object({
    decisions: z.record(key, decision),
    difficult: z.record(key, difficult),
  }),
  game: gameSchema,
  freePlay: z.object({
    rounds: count,
    hands: count,
    correct: count,
    wrong: count,
    adherence: count,
    warnings: count,
    accepted: count,
    overridden: count,
    history: z
      .array(
        z.object({
          key,
          attempted: action,
          recommended: action,
          executed: action,
          unsure: z.boolean(),
          warning: z.boolean(),
          at: count,
        }),
      )
      .max(200),
  }),
  sessions: z
    .array(
      z
        .object({
          id: count,
          mode: z.string().max(80),
          correct: count,
          total: count,
          medianMs: z.number().min(0).max(3600000),
        })
        .refine((s) => s.correct <= s.total),
    )
    .max(50),
  playUnsure: z.string().max(150).nullable(),
  challenge: z.array(z.boolean()).length(3),
});
// Version 1 is the initial schema. Future migrations must run before validation.
export function parseBackup(raw: string): AppState {
  if (raw.length > 5_000_000)
    throw new Error("Die Datei ist zu groß (maximal 5 MB).");
  const parsed: unknown = JSON.parse(raw);
  const result = schema.safeParse(parsed);
  if (!result.success)
    throw new Error(
      "Die Datei ist kein gültiges Blackjack-Backup der Version 1. Es wurden keine Daten ersetzt.",
    );
  return result.data;
}
export function loadState(): { state: AppState; notice: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: freshState(), notice: "" };
    try {
      return { state: parseBackup(raw), notice: "" };
    } catch {
      localStorage.setItem(`${STORAGE_KEY}:recovery`, raw);
      return {
        state: freshState(),
        notice:
          "Der lokale Spielstand war beschädigt. Eine Sicherung liegt im Browser; ein neuer Stand wurde gestartet.",
      };
    }
  } catch {
    return {
      state: freshState(),
      notice:
        "Der Browser erlaubt keine lokale Speicherung. Nutze den JSON-Export, um deinen Fortschritt zu sichern.",
    };
  }
}
export function saveState(state: AppState): boolean {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}
export function exportState(state: AppState) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download = `blackjack-trainer-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
