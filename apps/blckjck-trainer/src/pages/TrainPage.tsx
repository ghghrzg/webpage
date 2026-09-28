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
}
const LESSONS: Record<Group, { title: string; text: string }> = {
  all: {
    title: "Eine Entscheidung nach der anderen.",
    text: "Vergleiche deine Hand mit der offenen Dealerkarte. Hit zieht eine Karte, Stand beendet deine Hand. Double verdoppelt den Einsatz, Split teilt ein Paar.",
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
  const [question, setQuestion] = useState<Question | undefined>(() => {
    const cell = nextCell(
      state.training,
      poolFor(state.training, "practice", "all"),
    );
    return cell && questionFor(cell);
  });
  const [answer, setAnswer] = useState<Answer>();
  const [marked, setMarked] = useState(false);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [testDone, setTestDone] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [sessionId, setSessionId] = useState(Date.now());
  const [showResolved, setShowResolved] = useState(false);
  const locked = useRef(false);
  const clock = useRef({ elapsed: 0, last: performance.now(), running: false });
  const canTime = active && !answer && !testDone && !!question;
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
  ) {
    const cell = nextCell(
      state.training,
      poolFor(state.training, nextMode, nextGroup, single ?? undefined),
      question?.cell.key,
      Math.random,
      nextMode !== "test",
    );
    setQuestion(cell ? questionFor(cell) : undefined);
    setAnswer(undefined);
    setMarked(false);
    locked.current = false;
    clock.current = {
      elapsed: 0,
      last: performance.now(),
      running: active && !document.hidden,
    };
    setElapsed(0);
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
    if (!question || marked || answer || testDone) return;
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
    };
    const next = [...answers, result];
    setAnswers(next);
    setAnswer(result);
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
      (mode !== "test" && !state.settings.autoAdvance)
    )
      return;
    const timer = setTimeout(() => pick(), mode === "test" ? 350 : 1400);
    return () => clearTimeout(timer);
  }, [answer, testDone, active, state.settings.autoAdvance]);
  useShortcuts(
    respond,
    mark,
    () => {
      if (answer && !testDone) pick();
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
      <div className="page-heading">
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
              <div className="training-table">
                <HandCards
                  cards={[question.dealer]}
                  label="DEALER"
                  total={false}
                />
                <div className="table-divider">
                  <span />
                  vs
                  <span />
                </div>
                <HandCards cards={question.cards} label="DEINE HAND" />
                <div className="uncertainty-row">
                  <UnsureButton
                    marked={marked}
                    onClick={mark}
                    disabled={!!answer}
                  />
                  {state.settings.showTimer && (
                    <span className="decision-timer">
                      {((answer?.ms ?? elapsed) / 1000).toFixed(1)} s
                    </span>
                  )}
                </div>
              </div>
              <div className="decision-area">
                <ActionButtons
                  allowed={question.allowed}
                  onAction={respond}
                  disabled={!!answer}
                />
                <div
                  className={`feedback ${answer && mode !== "test" ? (answer.correct ? "correct" : "incorrect") : ""}`}
                  aria-live="polite"
                >
                  {answer ? (
                    mode === "test" ? (
                      <>
                        <span>Entscheidung gespeichert.</span>
                        <button className="next-button" onClick={() => pick()}>
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
                          <p>{explain(question.cell, question.allowed)}</p>
                        </div>
                        <button
                          className="next-button"
                          onClick={() => pick()}
                          aria-label="Nächste Hand"
                        >
                          Weiter <ArrowRight size={18} />
                        </button>
                      </>
                    )
                  ) : (
                    <span>
                      {marked
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
              {mode === "test" ? "Zufällige Auswahl" : "Adaptive Wiederholung"}
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
              <Metric value={answers.length} label="Hände" />
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
