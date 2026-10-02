import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Bookmark,
  Check,
  CheckCheck,
  Flame,
  GraduationCap,
  Pin,
  RotateCcw,
  Target,
  Trash2,
} from "lucide-react";
import {
  ActionButtons,
  EmptyState,
  HandCards,
  Metric,
  UnsureButton,
  percent,
  useShortcuts,
} from "../components";
import {
  ACTION_LABEL,
  CELL_BY_KEY,
  explain,
  questionFor,
  resolveLegalAction,
  type Action,
  type Question,
} from "../core/strategy";
import {
  isWeak,
  markUncertain,
  median,
  nextCell,
  poolFor,
  recordAnswer,
  type Group,
  type Mode,
} from "../core/training";
import { useStore } from "../state";
import { playAction, type Game } from "../core/engine";
import {
  cardsInDealOrder,
  createTrainingRound,
  questionFromRound,
} from "../core/trainingRound";
import { useCardDeal } from "../useCardDeal";
import { VoiceControl } from "../VoiceControl";

const MODES: { id: Mode; label: string }[] = [
  { id: "practice", label: "Üben" },
  { id: "learn", label: "Lernen" },
  { id: "weak", label: "Schwachstellen" },
  { id: "unsure", label: "Unsicher" },
  { id: "test", label: "Casino-Test" },
];
const GROUPS: { id: Group; label: string }[] = [
  { id: "all", label: "Alle Hände" },
  { id: "hard", label: "Hard" },
  { id: "soft", label: "Soft" },
  { id: "pair", label: "Paare" },
  { id: "traps", label: "ENHC" },
];
interface Answer {
  key: string;
  correct: boolean;
  action: Action;
  expected: Action;
  ms: number;
  explanation: string;
}
const LESSONS: Record<Group, { title: string; text: string }> = {
  all: {
    title: "Eine Entscheidung nach der anderen.",
    text: "Vergleiche deine Hand mit der offenen Dealerkarte. Card zieht eine Karte, Rest beendet deine Hand. Double verdoppelt den Einsatz, Split teilt ein Paar.",
  },
  hard: {
    title: "Die Grenzen lernen.",
    text: "Hard 13–16 steht gegen 2–6 und zieht gegen 7–Ass. Hard 12 steht nur gegen 4–6. Ab Hard 17 bleibst du immer stehen.",
  },
  soft: {
    title: "Ein Ass gibt dir Spielraum.",
    text: "Soft bedeutet: Ein Ass zählt als 11. A,2 bis A,6 ziehen immer. A,7 steht gegen 2–8 und zieht gegen 9–Ass. A,8 und höher stehen. Soft Double ist hier nicht erlaubt.",
  },
  pair: {
    title: "Zwei Karten. Zwei Chancen?",
    text: "Ein Paar kann in zwei Hände geteilt werden. Zehner bleiben zusammen, Fünfer werden wie Hard 10 gespielt. Bei anderen Paaren entscheidet die Dealerkarte.",
  },
  traps: {
    title: "Achtung, europäische Regeln.",
    text: "Der Dealer hat keine verdeckte zweite Karte. Deshalb: 11 gegen 10/Ass ziehen; 8,8 gegen 10/Ass ziehen; A,A gegen Ass ziehen. Zusatzeinsätze sind sonst einem späten Dealer-Blackjack ausgesetzt.",
  },
};

export function TrainPage({ active }: { active: boolean }) {
  const { state, setState } = useStore();
  const [mode, setMode] = useState<Mode>("practice");
  const [group, setGroup] = useState<Group>("all");
  const [onlyKey, setOnlyKey] = useState<string>();
  const [initial] = useState(() => {
    const cell = nextCell(
      state.training,
      poolFor(state.training, "practice", "all"),
      undefined,
      Math.random,
      true,
      Date.now(),
      state.settings.focusEdges,
    );
    const sample = cell && questionFor(cell);
    const round =
      sample && state.settings.playFullHands
        ? createTrainingRound(sample)
        : undefined;
    return { question: round ? questionFromRound(round) : sample, round };
  });
  const [question, setQuestion] = useState<Question | undefined>(
    initial.question,
  );
  const [round, setRound] = useState<Game | undefined>(initial.round);
  const [dealNumber, setDealNumber] = useState(0);
  const [answer, setAnswer] = useState<Answer>();
  const [marked, setMarked] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [testDone, setTestDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessionId, setSessionId] = useState(Date.now());
  const [showResolved, setShowResolved] = useState(false);
  const locked = useRef(false);
  const clock = useRef({ elapsed: 0, last: performance.now(), running: false });
  const dealCards = round
    ? cardsInDealOrder(round)
    : question
      ? [question.cards[0], question.dealer, ...question.cards.slice(1)]
      : [];
  const animation = useCardDeal(dealCards, `train-${dealNumber}`, active);
  const canTime =
    active && !answer && !testDone && !!question && !animation.busy;
  useEffect(() => {
    const tick = () => {
      const now = performance.now();
      if (clock.current.running)
        clock.current.elapsed += now - clock.current.last;
      clock.current.last = now;
      clock.current.running = canTime && !document.hidden;
      setElapsed(clock.current.elapsed);
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    const timer = setInterval(tick, 250);
    return () => {
      tick();
      clearInterval(timer);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [canTime]);
  function pick(
    nextMode = mode,
    nextGroup = group,
    single: string | null = onlyKey ?? null,
    fullHands = state.settings.playFullHands,
    focusEdges = state.settings.focusEdges,
  ) {
    const cell = nextCell(
      state.training,
      poolFor(state.training, nextMode, nextGroup, single ?? undefined),
      question?.cell.key,
      Math.random,
      nextMode !== "test",
      Date.now(),
      focusEdges,
    );
    const sample = cell ? questionFor(cell) : undefined;
    const nextRound =
      sample && fullHands && nextMode !== "test"
        ? createTrainingRound(sample)
        : undefined;
    setRound(nextRound);
    setQuestion(nextRound ? questionFromRound(nextRound) : sample);
    setDealNumber((n) => n + 1);
    setAnswer(undefined);
    setMarked(false);
    locked.current = false;
    clock.current = {
      elapsed: 0,
      last: performance.now(),
      running: false,
    };
    setElapsed(0);
  }
  function continueHand() {
    if (!answer || testDone || animation.busy) return;
    if (round?.phase === "player") {
      setQuestion(questionFromRound(round));
      setAnswer(undefined);
      setMarked(false);
      locked.current = false;
      clock.current = { elapsed: 0, last: performance.now(), running: false };
      setElapsed(0);
    } else pick();
  }
  function changeMode(next: Mode, nextGroup: Group = group) {
    setMode(next);
    setGroup(next === "test" ? "all" : nextGroup);
    setOnlyKey(undefined);
    setAnswers([]);
    setTestDone(false);
    setSessionId(Date.now());
    pick(next, next === "test" ? "all" : nextGroup, null);
  }
  function mark() {
    if (!question || marked || answer || testDone || animation.busy) return;
    setMarked(true);
    setState((s) => ({
      ...s,
      training: markUncertain(s.training, question.cell.key),
    }));
  }
  function respond(action: Action) {
    if (
      !question ||
      locked.current ||
      testDone ||
      animation.busy ||
      !question.allowed.includes(action)
    )
      return;
    locked.current = true;
    const expected = resolveLegalAction(question.cell.code, question.allowed);
    const ms =
      clock.current.elapsed +
      (clock.current.running ? performance.now() - clock.current.last : 0);
    clock.current.running = false;
    const result = {
      key: question.cell.key,
      correct: action === expected,
      action,
      expected,
      ms,
      explanation: explain(question.cell, question.allowed),
    };
    const next = [...answers, result];
    setAnswers(next);
    setAnswer(result);
    if (round) setRound(playAction(round, action));
    setState((s) => ({
      ...s,
      lastUsedAt: Date.now(),
      training: recordAnswer(
        s.training,
        result.key,
        result.correct,
        marked,
        ms,
      ),
      sessions: [
        {
          id: sessionId,
          mode: MODES.find((m) => m.id === mode)!.label,
          correct: next.filter((a) => a.correct).length,
          total: next.length,
          medianMs: median(next.map((a) => a.ms)),
        },
        ...s.sessions.filter((x) => x.id !== sessionId),
      ].slice(0, 50),
    }));
    if (mode === "test" && next.length === 100) setTestDone(true);
  }
  useEffect(() => {
    if (
      !answer ||
      testDone ||
      !active ||
      animation.busy ||
      (mode !== "test" &&
        !state.settings.autoAdvance &&
        !(state.settings.playFullHands && round?.phase === "player"))
    )
      return;
    // Allow time to read the round result before starting a new exercise.
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      if (!document.hidden)
        timer = setTimeout(
          continueHand,
          mode === "test"
            ? 350
            : round?.phase === "settled"
              ? 2400
              : round?.phase === "player"
                ? answer.correct
                  ? 700
                  : 1600
                : 1400,
        );
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [
    answer,
    testDone,
    active,
    state.settings.autoAdvance,
    state.settings.playFullHands,
    animation.busy,
    mode,
    round,
  ]);
  useShortcuts(
    respond,
    mark,
    () => {
      continueHand();
    },
    active,
  );
  const correct = answers.filter((a) => a.correct).length;
  const streak = answers
    .slice()
    .reverse()
    .findIndex((a) => !a.correct);
  const difficult = Object.entries(state.training.difficult)
    .filter(([, d]) => showResolved || !d.resolved)
    .sort(
      (a, b) =>
        Number(b[1].pinned) - Number(a[1].pinned) ||
        b[1].unsureCount - a[1].unsureCount,
    );
  const unsureCount = Object.values(state.training.difficult).filter(
    (d) => !d.resolved,
  ).length;
  function updateDifficult(key: string, action: "pin" | "resolve" | "delete") {
    setState((s) => {
      const training = structuredClone(s.training);
      if (action === "delete") delete training.difficult[key];
      else if (action === "pin")
        training.difficult[key].pinned = !training.difficult[key].pinned;
      else training.difficult[key].resolved = !training.difficult[key].resolved;
      return { ...s, training };
    });
  }
  return (
    <>
      <div className="page-heading training-intro">
        <div>
          <span className="eyebrow">DEIN STRATEGIE-LABOR</span>
          <h1>
            Gute Entscheidungen.
            <br />
            <em>Mit jeder Hand.</em>
          </h1>
          <p>Lerne die Strategie. Erkenne deine Lücken. Werde sicherer.</p>
        </div>
        <div className="heading-stamp">
          <span>♠</span>
          <small>
            ÜBUNG MACHT
            <br />
            DEN UNTERSCHIED.
          </small>
        </div>
      </div>
      <div className="mode-tabs" role="tablist" aria-label="Trainingsmodus">
        {MODES.map((m) => (
          <button
            role="tab"
            aria-selected={m.id === mode}
            key={m.id}
            className={mode === m.id ? "selected" : ""}
            onClick={() => changeMode(m.id)}
          >
            {m.label}
            {m.id === "unsure" && unsureCount > 0 && (
              <span className="count">{unsureCount}</span>
            )}
          </button>
        ))}
      </div>
      <div className="training-switches" aria-label="Trainingsoptionen">
        <label>
          <input
            type="checkbox"
            role="switch"
            checked={state.settings.focusEdges}
            disabled={mode === "test"}
            onChange={(e) => {
              const value = e.target.checked;
              setState((s) => ({
                ...s,
                settings: { ...s.settings, focusEdges: value },
              }));
              if (!round || round.phase === "settled")
                pick(mode, group, onlyKey, state.settings.playFullHands, value);
            }}
          />
          Grenzfälle priorisieren
        </label>
        <label>
          <input
            type="checkbox"
            role="switch"
            checked={state.settings.playFullHands && mode !== "test"}
            disabled={mode === "test"}
            onChange={(e) => {
              const value = e.target.checked;
              setState((s) => ({
                ...s,
                settings: { ...s.settings, playFullHands: value },
              }));
              pick(mode, group, onlyKey, value);
            }}
          />
          Hand zu Ende spielen
        </label>
        <label>
          <input
            type="checkbox"
            role="switch"
            checked={state.settings.showHandTotals}
            onChange={(e) =>
              setState((s) => ({
                ...s,
                settings: { ...s.settings, showHandTotals: e.target.checked },
              }))
            }
          />
          Handsumme anzeigen
        </label>
        <VoiceControl
          compact
          active={active}
          contextKey={`train-${dealNumber}-${answers.length}-${!!answer}-${mode}-${group}`}
          allowed={canTime ? question!.allowed : []}
          onAction={respond}
          onNext={
            answer && !testDone && !animation.busy ? continueHand : undefined
          }
        />
      </div>
      <div className="workspace">
        <section className="main-panel training-panel">
          <div className="panel-toolbar">
            <span className="eyebrow">
              {mode === "test"
                ? `TEST · ${Math.min(answers.length + 1, 100)} / 100`
                : onlyKey
                  ? "GEZIELTER DRILL"
                  : "DEINE NÄCHSTE ENTSCHEIDUNG"}
            </span>
            {mode !== "test" && (
              <label className="visually-hidden" htmlFor="group">
                Handgruppe
              </label>
            )}
            {mode !== "test" && (
              <select
                id="group"
                value={group}
                onChange={(e) => changeMode(mode, e.target.value as Group)}
              >
                {GROUPS.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.label}
                  </option>
                ))}
              </select>
            )}
            {mode === "test" && <span className="muted">Ohne Hinweise</span>}
          </div>
          {mode === "learn" && (
            <div className="lesson">
              <GraduationCap size={22} />
              <div>
                <strong>{LESSONS[group].title}</strong>
                <p>{LESSONS[group].text}</p>
              </div>
            </div>
          )}
          {testDone ? (
            <div className="test-summary">
              <span className="eyebrow">
                100 ENTSCHEIDUNGEN · DEIN ERGEBNIS
              </span>
              <h2>
                {correct >= 95 && median(answers.map((a) => a.ms)) < 2000
                  ? "Trainingsziel erreicht."
                  : "Dein nächster Schritt steht fest."}
              </h2>
              <div className="metrics">
                <Metric
                  value={percent(correct, 100)}
                  label="Richtig · Ziel ≥ 95 %"
                  accent
                />
                <Metric
                  value={`${(median(answers.map((a) => a.ms)) / 1000).toFixed(2)} s`}
                  label="Median · Ziel < 2 s"
                />
              </div>
              <p>
                Ein Trainingswert, keine Vorhersage für Gewinne am Spieltisch.
              </p>
              <button className="primary" onClick={() => changeMode("weak")}>
                Fehler gezielt üben <ArrowRight size={17} />
              </button>
              <details>
                <summary>Entscheidungen ansehen</summary>
                <div className="test-results">
                  {answers.map((a, i) => (
                    <p
                      key={i}
                      className={a.correct ? "text-good" : "text-warn"}
                    >
                      {i + 1}. {CELL_BY_KEY.get(a.key)?.row.label} vs{" "}
                      {CELL_BY_KEY.get(a.key)?.dealer} ·{" "}
                      {ACTION_LABEL[a.action]}{" "}
                      {a.correct ? "✓" : `→ ${ACTION_LABEL[a.expected]}`}
                    </p>
                  ))}
                </div>
              </details>
            </div>
          ) : question ? (
            <>
              <div
                className={`training-table ${round && round.hands.length > 1 ? "training-split-table" : ""}`}
                aria-busy={animation.busy}
              >
                <HandCards
                  cards={round?.dealer ?? [question.dealer]}
                  label="DEALER"
                  total={
                    state.settings.showHandTotals &&
                    round?.phase === "settled" &&
                    !animation.busy
                  }
                  visible={animation.visible}
                />
                <div className="table-divider">
                  <span />
                  vs
                  <span />
                </div>
                {round ? (
                  <div
                    className={`trainer-hands ${round.hands.length > 1 ? "multiple" : ""}`}
                  >
                    {round.hands.map((hand, i) => (
                      <div
                        key={hand.cards[0].id}
                        className={`trainer-hand ${round.phase === "player" && round.active === i ? "current" : ""}`}
                      >
                        <HandCards
                          cards={hand.cards}
                          label={
                            round.hands.length > 1
                              ? `HAND ${i + 1}`
                              : "DEINE HAND"
                          }
                          total={state.settings.showHandTotals}
                          visible={animation.visible}
                        />
                        {round.phase === "settled" && !animation.busy && (
                          <span
                            className={`training-hand-result ${(hand.profit ?? 0) > 0 ? "text-good" : (hand.profit ?? 0) < 0 ? "text-warn" : ""}`}
                          >
                            {hand.result === "win" ||
                            hand.result === "blackjack"
                              ? "Gewonnen"
                              : hand.result === "loss"
                                ? "Verloren"
                                : "Unentschieden"}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                ) : (
                  <HandCards
                    cards={question.cards}
                    label="DEINE HAND"
                    total={state.settings.showHandTotals}
                    visible={animation.visible}
                  />
                )}
                <div className="uncertainty-row">
                  <UnsureButton
                    marked={marked}
                    onClick={mark}
                    disabled={!!answer || animation.busy}
                  />
                  {state.settings.showTimer && (
                    <span className="decision-timer">
                      {((answer?.ms ?? elapsed) / 1000).toFixed(1)} s
                    </span>
                  )}
                </div>
                {answer && mode !== "test" && (
                  <span
                    key={answers.length}
                    className={`decision-glow ${answer.correct ? "correct" : "incorrect"}`}
                    aria-hidden="true"
                  />
                )}
              </div>
              <div className="decision-area">
                <ActionButtons
                  allowed={question.allowed}
                  onAction={respond}
                  disabled={!!answer || animation.busy}
                />
                {!question.allowed.includes("D") && !answer && (
                  <details className="action-rule-help">
                    <summary>Warum ist Double gesperrt?</summary>
                    <p>
                      Wiesbaden Rules: nur mit den ersten zwei Karten und Hard
                      9, 10 oder 11. Nach Card ist Double nicht mehr möglich;
                      nach Split gelten dieselben Grenzen.
                    </p>
                  </details>
                )}
                {round?.phase === "settled" && !animation.busy && (
                  <div className="training-round-result" role="status">
                    <strong>Trainingsrunde beendet.</strong>
                    <span>
                      Das Rundenergebnis ändert die Bewertung deiner
                      Entscheidungen nicht.
                    </span>
                  </div>
                )}
                <div
                  className={`feedback ${answer && mode !== "test" ? (answer.correct ? "correct" : "incorrect") : ""}`}
                  aria-live="polite"
                >
                  {answer ? (
                    mode === "test" ? (
                      <>
                        <span>Entscheidung gespeichert.</span>
                        <button
                          className="next-button"
                          onClick={continueHand}
                          disabled={animation.busy}
                        >
                          Weiter <ArrowRight size={17} />
                        </button>
                      </>
                    ) : (
                      <>
                        <div>
                          <strong>
                            {answer.correct
                              ? "Richtig entschieden."
                              : `Die Strategie empfiehlt ${ACTION_LABEL[answer.expected]}.`}
                          </strong>
                          <p>{answer.explanation}</p>
                        </div>
                        {round?.phase === "player" &&
                        state.settings.playFullHands ? (
                          <span className="training-auto-next">
                            Geht automatisch weiter …
                          </span>
                        ) : (
                          <button
                            className="next-button"
                            onClick={continueHand}
                            disabled={animation.busy}
                            aria-label="Nächste Hand"
                          >
                            Weiter <ArrowRight size={18} />
                          </button>
                        )}
                      </>
                    )
                  ) : (
                    <span>
                      {animation.busy
                        ? "Karten werden ausgeteilt …"
                        : marked
                          ? "Gemerkt. Entscheide dich trotzdem selbst."
                          : "Was ist hier der beste Spielzug?"}
                    </span>
                  )}
                </div>
              </div>
            </>
          ) : (
            <EmptyState
              title={
                mode === "unsure"
                  ? "Noch nichts auf deiner Merkliste."
                  : "Hier gibt es gerade nichts zu üben."
              }
            >
              {mode === "unsure"
                ? "Markiere eine Hand mit „Bin unsicher“. Hier kannst du sie später gezielt wiederholen."
                : "Trainiere ein paar Hände im Modus „Üben“. Fehler werden hier automatisch gesammelt."}
              <button
                className="primary"
                onClick={() => changeMode("practice", "all")}
              >
                Training starten <ArrowRight size={17} />
              </button>
            </EmptyState>
          )}
          <div className="panel-footer">
            <span>
              <span className="status-dot" />{" "}
              {mode === "test"
                ? "Zufällige Auswahl"
                : state.settings.focusEdges
                  ? "Grenzfälle + deine Schwächen"
                  : "Adaptive Wiederholung"}
            </span>
            <span>6D · ENHC · S17</span>
          </div>
        </section>
        <aside className="training-sidebar">
          <section className="side-panel">
            <div className="section-heading">
              <h2>Diese Session</h2>
              <Target size={18} />
            </div>
            <div className="session-score">
              <strong>
                {mode === "test" && !testDone
                  ? answers.length
                  : percent(correct, answers.length)}
              </strong>
              <span>
                {mode === "test" && !testDone
                  ? "von 100 Entscheidungen"
                  : "richtig entschieden"}
              </span>
            </div>
            <div className="metrics compact">
              <Metric value={answers.length} label="Entscheidungen" />
              <Metric
                value={
                  mode === "test" && !testDone
                    ? "–"
                    : streak === -1
                      ? answers.length
                      : streak
                }
                label="in Folge"
              />
              <Metric
                value={
                  answers.length
                    ? `${(median(answers.map((a) => a.ms)) / 1000).toFixed(1)}s`
                    : "–"
                }
                label="Median"
              />
            </div>
            <div className="progress-track">
              <span
                style={{
                  width: `${mode === "test" ? answers.length : answers.length ? (correct / answers.length) * 100 : 0}%`,
                }}
              />
            </div>
            <p className="small muted">
              {mode === "test"
                ? "Korrekturen und Auswertung nach der letzten Entscheidung."
                : "Dein erster Impuls zählt. Unsicherheit ist kein Fehler."}
            </p>
          </section>
          <section className="side-panel subtle">
            <span className="eyebrow">
              <Bookmark size={14} /> BEWUSST LERNEN
            </span>
            <h3>Unsicher? Gut erkannt.</h3>
            <p>
              Merke dir schwierige Hände, ohne die Lösung aufzudecken. Dein
              nächstes Training setzt genau dort an.
            </p>
            <button
              className="text-button"
              onClick={() => changeMode("unsure", "all")}
            >
              Merkliste öffnen <span>{unsureCount}</span>
              <ArrowRight size={16} />
            </button>
          </section>
          {mode !== "test" && (
            <section className="side-panel challenge">
              <span className="eyebrow">
                <Flame size={14} /> DEIN 3-TAGE-PLAN
              </span>
              {[
                {
                  title: "Das Fundament",
                  sub: "Hard & Soft Hands",
                  group: "hard",
                },
                { title: "Die Ausnahmen", sub: "Paare & ENHC", group: "traps" },
                {
                  title: "Alles zusammen",
                  sub: "100 Entscheidungen",
                  group: "all",
                },
              ].map((day, i) => (
                <div className="challenge-day" key={day.title}>
                  <button
                    className={`day-check ${state.challenge[i] ? "done" : ""}`}
                    aria-label={`Tag ${i + 1} ${state.challenge[i] ? "als offen" : "als erledigt"} markieren`}
                    onClick={() =>
                      setState((s) => ({
                        ...s,
                        challenge: s.challenge.map((v, index) =>
                          i === index ? !v : v,
                        ),
                      }))
                    }
                  >
                    {state.challenge[i] ? <Check size={16} /> : `0${i + 1}`}
                  </button>
                  <button
                    className="day-link"
                    onClick={() =>
                      changeMode(i === 2 ? "test" : "learn", day.group as Group)
                    }
                  >
                    <strong>{day.title}</strong>
                    <small>{day.sub}</small>
                  </button>
                  <ArrowRight size={14} />
                </div>
              ))}
            </section>
          )}
          <p className="keyboard-note">
            Tastatur: H · S · D · P<br />U zum Merken · Enter für die nächste
            Hand
          </p>
        </aside>
      </div>
      {mode === "unsure" && (
        <section className="main-panel list-panel">
          <div className="section-heading">
            <h2>Deine schwierigen Hände</h2>
            <label className="check-label">
              <input
                type="checkbox"
                checked={showResolved}
                onChange={(e) => setShowResolved(e.target.checked)}
              />{" "}
              Gelernte anzeigen
            </label>
          </div>
          {difficult.length ? (
            <div className="difficult-list">
              {difficult.map(([key, entry]) => {
                const cell = CELL_BY_KEY.get(key)!;
                return (
                  <div
                    className={`difficult-row ${entry.resolved ? "resolved" : ""}`}
                    key={key}
                  >
                    <div>
                      <strong>
                        {cell.row.label} <span className="muted">gegen</span>{" "}
                        {cell.dealer}
                      </strong>
                      <small>
                        {entry.unsureCount}× unsicher ·{" "}
                        {percent(
                          entry.correctAfterMark,
                          entry.correctAfterMark + entry.wrongAfterMark,
                        )}{" "}
                        seit Markierung ·{" "}
                        {new Date(entry.lastMarkedAt).toLocaleDateString(
                          "de-DE",
                        )}
                      </small>
                    </div>
                    <div className="row-actions">
                      <button
                        title="Nur diese Hand trainieren"
                        aria-label={`${cell.row.label} gegen ${cell.dealer} trainieren`}
                        className="icon-button"
                        onClick={() => {
                          setOnlyKey(key);
                          pick("unsure", "all", key);
                          window.scrollTo({ top: 0, behavior: "smooth" });
                        }}
                      >
                        <RotateCcw size={17} />
                      </button>
                      <button
                        title="Anheften"
                        aria-label="Anheften"
                        aria-pressed={entry.pinned}
                        className="icon-button"
                        onClick={() => updateDifficult(key, "pin")}
                      >
                        <Pin size={17} />
                      </button>
                      <button
                        title={
                          entry.resolved
                            ? "Wieder öffnen"
                            : "Als gelernt markieren"
                        }
                        aria-label={
                          entry.resolved
                            ? "Wieder öffnen"
                            : "Als gelernt markieren"
                        }
                        className="icon-button"
                        onClick={() => updateDifficult(key, "resolve")}
                      >
                        <CheckCheck size={17} />
                      </button>
                      <button
                        title="Entfernen"
                        aria-label="Aus Merkliste entfernen"
                        className="icon-button"
                        onClick={() => updateDifficult(key, "delete")}
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="muted">Deine Merkliste ist leer.</p>
          )}
          <button
            className="text-button"
            onClick={() => {
              setOnlyKey(undefined);
              pick("unsure", "all", null);
            }}
          >
            Alle offenen Hände trainieren <ArrowRight size={16} />
          </button>
        </section>
      )}
      {mode === "weak" && (
        <p className="small muted">
          Schwachstellen: unter 90 % richtig, unter 80 % in den letzten zehn
          Versuchen oder sichere Fehler ohne anschließende Dreier-Serie.
          Aktuell:{" "}
          {Object.values(state.training.decisions).filter(isWeak).length}{" "}
          Zellen.
        </p>
      )}
    </>
  );
}
