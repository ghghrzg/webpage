import {
  useEffect,
  useReducer,
  useRef,
  useState,
  type PointerEvent,
} from "react";
import { ArrowRight, Check, List, Shuffle, Undo2, X } from "lucide-react";
import { PlayingCard } from "../components";
import { handValue } from "../core/cards";
import { RangesOverview } from "./RangesOverview";
import { ACTION_LABEL, ACTIONS, DEALERS, type Action } from "../core/strategy";
import {
  describeRange,
  editRange,
  emptyRangeDraft,
  nextRange,
  rangeHand,
  recordRangeAnswer,
  scoreRange,
  type RangeAnswers,
} from "../core/strategyRanges";
import { useStore } from "../state";

interface Stroke {
  pointerId: number;
  id: number;
  action: Action;
  start: number;
  base: RangeAnswers;
}

export function RangesPage({ active: pageActive }: { active: boolean }) {
  const { state, setState } = useStore();
  const [overview, setOverview] = useState(false);
  const active = pageActive && !overview;
  const [task, setTask] = useState(() => {
    const category = nextRange(state.strategyRanges);
    return { category, cards: rangeHand(category) };
  });
  const { category, cards } = task;
  const cardMode = state.settings.rangeCards;
  const [selected, setSelected] = useState<Action>("H");
  const [draft, dispatch] = useReducer(editRange, undefined, emptyRangeDraft);
  const [checked, setChecked] = useState(false);
  const [round, setRound] = useState(1);
  const [swipeSelection, setSwipeSelection] = useState<[number, number] | null>(
    null,
  );
  const submitted = useRef(false);
  const stroke = useRef<Stroke | null>(null);
  const strokeId = useRef(0);
  const grid = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLDivElement>(null);
  const answered = draft.answers.filter(Boolean).length;
  const correct = checked ? scoreRange(category, draft.answers) : 0;
  const stats = state.strategyRanges[category.id];

  function clearStroke() {
    stroke.current = null;
    setSwipeSelection(null);
  }

  useEffect(() => {
    if (!active) clearStroke();
  }, [active]);

  useEffect(() => {
    if (!active || checked) return;
    const keydown = (event: KeyboardEvent) => {
      if (
        event.target instanceof HTMLElement &&
        (event.target.matches("input, select, textarea") ||
          event.target.isContentEditable)
      )
        return;
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "z" &&
        !event.shiftKey
      ) {
        event.preventDefault();
        clearStroke();
        dispatch({ type: "undo" });
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const action = event.key.toUpperCase() as Action;
      if (ACTIONS.includes(action)) {
        event.preventDefault();
        setSelected(action);
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  }, [active, checked]);

  function paint(event: PointerEvent<HTMLDivElement>) {
    const current = stroke.current;
    if (!current || current.pointerId !== event.pointerId || !active || checked)
      return;
    // Dealer order defines the range, independent of the path across the grid.
    const card = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest<HTMLElement>("[data-dealer-index]");
    if (!card || !grid.current?.contains(card)) return;
    const end = Number(card.dataset.dealerIndex);
    const first = Math.min(current.start, end);
    const last = Math.max(current.start, end);
    setSwipeSelection([first, last]);
    dispatch({
      type: "paint",
      indices: DEALERS.flatMap((_, index) =>
        index >= first && index <= last ? [index] : [],
      ),
      action: current.action,
      stroke: current.id,
      // Rebuild from the pre-gesture answers so shrinking restores older marks.
      base: current.base,
    });
  }

  function startStroke(event: PointerEvent<HTMLDivElement>) {
    if (
      !active ||
      checked ||
      !event.isPrimary ||
      event.button !== 0 ||
      stroke.current
    )
      return;
    const card = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-dealer-index]",
    );
    if (!card) return;
    event.preventDefault();
    card.focus({ preventScroll: true });
    stroke.current = {
      pointerId: event.pointerId,
      id: ++strokeId.current,
      action: selected,
      start: Number(card.dataset.dealerIndex),
      base: draft.answers,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    paint(event);
  }

  function finishStroke(event: PointerEvent<HTMLDivElement>) {
    if (stroke.current?.pointerId !== event.pointerId) return;
    if (event.type === "pointerup") paint(event);
    clearStroke();
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function fill(remaining: boolean) {
    if (checked || !active) return;
    dispatch({
      type: "paint",
      action: selected,
      indices: DEALERS.flatMap((_, index) =>
        !remaining || draft.answers[index] === null ? [index] : [],
      ),
      stroke: ++strokeId.current,
    });
  }

  function check() {
    if (!active || submitted.current || answered !== DEALERS.length) return;
    submitted.current = true;
    clearStroke();
    setChecked(true);
    setState((previous) => ({
      ...previous,
      lastUsedAt: Date.now(),
      strategyRanges: recordRangeAnswer(
        previous.strategyRanges,
        category,
        draft.answers,
      ),
    }));
  }

  function next() {
    if (!active || !submitted.current) return;
    const nextCategory = nextRange(state.strategyRanges, category.id);
    setTask({ category: nextCategory, cards: rangeHand(nextCategory) });
    dispatch({ type: "reset" });
    setChecked(false);
    submitted.current = false;
    setRound((value) => value + 1);
    heading.current?.focus({ preventScroll: true });
    heading.current?.scrollIntoView({ block: "nearest" });
  }

  return (
    <section className="ranges-page" aria-label="Strategy-Ranges">
      <div className="page-heading ranges-heading">
        <div>
          <span className="eyebrow">17 KATEGORIEN · GANZE REGELN LERNEN</span>
          <h1>
            Strategy-<em>Ranges.</em>
          </h1>
          <p>Eine Handkategorie. Alle Dealer-Karten. Deine Strategie.</p>
        </div>
        <button
          className="ranges-overview-toggle secondary"
          aria-pressed={overview}
          onClick={() => setOverview((value) => !value)}
        >
          <List size={16} aria-hidden="true" />{" "}
          {overview ? "Zur Übung" : "Übersicht"}
        </button>
      </div>

      {overview && <RangesOverview training={state.strategyRanges} />}
      <div hidden={overview}>
        <div className="ranges-panel">
          <div className="ranges-task-meta">
            <span className="eyebrow">AUFGABE {round}</span>
            <label className="ranges-card-switch">
              <input
                type="checkbox"
                role="switch"
                checked={cardMode}
                onChange={(event) => {
                  const enabled = event.target.checked;
                  setState((previous) => ({
                    ...previous,
                    settings: { ...previous.settings, rangeCards: enabled },
                  }));
                }}
              />{" "}
              Karten anzeigen
            </label>
          </div>
          <div className="ranges-prompt" ref={heading} tabIndex={-1}>
            <div className="ranges-prompt-main">
              {cardMode ? (
                <div className="cards ranges-hand" aria-label="Deine Karten">
                  {cards.map((card) => (
                    <PlayingCard key={card.id} card={card} />
                  ))}
                </div>
              ) : (
                <h2 className="ranges-category">{category.label}</h2>
              )}
            </div>
            <div className="ranges-reveal" aria-live="polite">
              {cardMode
                ? checked
                  ? `${category.label} · Summe ${handValue(cards).total}`
                  : "Range und Summe erscheinen nach Prüfen."
                : "Eine Kategorie · alle Dealer-Karten"}
            </div>
          </div>
          <p className="ranges-instructions" id="ranges-instructions">
            Ziehen markiert eine zusammenhängende Range.
          </p>
          <div className="ranges-grid-label">
            <span className="eyebrow">DEALER ZEIGT</span>
            <span aria-live="polite">{answered}/10 markiert</span>
          </div>
          <div
            className="ranges-grid"
            role="group"
            aria-label="Aktionen für die zehn Dealer-Karten"
            aria-describedby="ranges-instructions"
            ref={grid}
            onPointerDown={startStroke}
            onPointerMove={paint}
            onPointerUp={finishStroke}
            onPointerCancel={finishStroke}
            onLostPointerCapture={clearStroke}
            onContextMenu={(event) => event.preventDefault()}
          >
            {DEALERS.map((dealer, index) => {
              const answer = draft.answers[index];
              const expected = category.answers[index];
              const right = answer === expected;
              return (
                <button
                  key={dealer}
                  type="button"
                  className={`range-card ${answer ? `range-mark-${answer}` : ""} ${swipeSelection && index >= swipeSelection[0] && index <= swipeSelection[1] ? "range-swipe-selected" : ""} ${checked ? (right ? "range-correct" : "range-wrong") : ""}`}
                  data-dealer-index={index}
                  disabled={checked || !active}
                  aria-label={`Dealer ${dealer}: ${answer ? ACTION_LABEL[answer] : "offen"}${checked ? (right ? ", richtig" : `, falsch. Richtig: ${ACTION_LABEL[expected]}`) : ""}`}
                  onClick={(event) => {
                    // Pointer input is handled as a stroke; native keyboard and
                    // assistive clicks still get the same editing behaviour.
                    if (event.detail === 0 && !checked && active)
                      dispatch({
                        type: "paint",
                        indices: [index],
                        action: selected,
                        stroke: ++strokeId.current,
                      });
                  }}
                >
                  <span className="range-dealer">{dealer}</span>
                  <span className="range-answer">
                    {checked &&
                      (right ? (
                        <Check size={14} aria-hidden="true" />
                      ) : (
                        <X size={14} aria-hidden="true" />
                      ))}
                    <span className={checked && !right ? "range-struck" : ""}>
                      {answer ?? "·"}
                    </span>
                  </span>
                  <span
                    className="range-correction"
                    aria-hidden={!checked || right}
                  >
                    {checked && !right ? `→ ${expected}` : "\u00a0"}
                  </span>
                </button>
              );
            })}
          </div>

          <p className="ranges-edit-hint">
            {checked
              ? "✓ Richtig · ✕ Falsch · Korrektur direkt im Feld"
              : `Mit ${ACTION_LABEL[selected]} markieren · Überschreiben jederzeit möglich`}
          </p>
        </div>

        <div className="ranges-dock">
          {checked && (
            <div className="ranges-dock-result" role="status">
              <strong>{correct}/10 richtig</strong>
              <span>
                {correct === 10
                  ? "Die ganze Range sitzt."
                  : "Die richtigen Aktionen stehen in den Feldern."}
              </span>
            </div>
          )}
          <div
            className="ranges-actions"
            role="group"
            aria-label="Aktion zum Markieren"
            hidden={checked}
          >
            {ACTIONS.map((action) => (
              <button
                key={action}
                className={`ranges-action range-mark-${action}`}
                aria-label={`${ACTION_LABEL[action]} auswählen`}
                aria-pressed={selected === action}
                disabled={checked || !active}
                onClick={() => setSelected(action)}
              >
                <strong aria-hidden="true">{action}</strong>
                <span>{ACTION_LABEL[action]}</span>
              </button>
            ))}
            <button
              className="ranges-action ranges-undo"
              aria-label="Undo – letzte Markierung rückgängig"
              disabled={checked || !active || !draft.history.length}
              onClick={() => {
                clearStroke();
                dispatch({ type: "undo" });
              }}
            >
              <Undo2 size={20} aria-hidden="true" />
              <span>Undo</span>
            </button>
          </div>
          <div className="ranges-submit">
            {checked ? (
              <button className="primary full-width" onClick={next}>
                Weiter <ArrowRight size={18} />
              </button>
            ) : (
              <>
                <button
                  className="secondary"
                  onClick={() => fill(false)}
                  title={`Alle Karten mit ${ACTION_LABEL[selected]} markieren`}
                >
                  Alles
                </button>
                <button
                  className="secondary"
                  onClick={() => fill(true)}
                  disabled={answered === 10}
                  title={`Offene Karten mit ${ACTION_LABEL[selected]} markieren`}
                >
                  Offene
                </button>
                <button
                  className="primary"
                  onClick={check}
                  disabled={answered !== 10}
                >
                  Prüfen <Check size={17} />
                </button>
              </>
            )}
          </div>
        </div>

        <div className="ranges-feedback-slot">
          {checked ? (
            <div
              className={`ranges-result ${correct === 10 ? "text-good" : "text-warn"}`}
            >
              <strong>Die Regel für {category.label}</strong>
              <span className="ranges-result-hint">
                {correct === 10
                  ? "Die ganze Range sitzt."
                  : "Merke dir die Regel für die nächste Runde:"}
              </span>
              <div className="ranges-rule">
                {describeRange(category).map((rule) => (
                  <span key={rule}>{rule}</span>
                ))}
              </div>
            </div>
          ) : (
            <p className="ranges-edit-hint">
              Nach Prüfen findest du hier die zusammenhängende Regel.
            </p>
          )}
        </div>

        <div className="ranges-learning-note">
          <p>
            {cardMode && !checked
              ? "Deine Kategorie-Statistik erscheint nach Prüfen."
              : stats?.attempts
                ? `${stats.attempts} Durchgänge · ${stats.perfect} fehlerfrei · ${Math.round((100 * stats.mistakes) / (10 * stats.attempts))} % falsche Felder in dieser Kategorie`
                : "Diese Kategorie hast du noch nicht geprüft."}
          </p>
          <p>
            <Shuffle size={13} aria-hidden="true" /> Zufällige Reihenfolge.
            Kategorien mit Fehlern kommen häufiger dran.
          </p>
        </div>
      </div>
    </section>
  );
}
