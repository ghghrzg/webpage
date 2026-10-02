import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  CircleHelp,
  Coins,
  ShieldCheck,
  Shuffle,
} from "lucide-react";
import {
  ActionButtons,
  HandCards,
  Metric,
  Modal,
  UnsureButton,
  euros,
  percent,
  useShortcuts,
} from "../components";
import { handValue, isBlackjack } from "../core/cards";
import {
  chooseInsurance,
  deal,
  legalActions,
  newGame,
  playAction,
  type Game,
} from "../core/engine";
import { ACTION_LABEL, getAdvice, type Action } from "../core/strategy";
import { markUncertain, recordAnswer } from "../core/training";
import { useStore } from "../state";
import { cardsInDealOrder } from "../core/trainingRound";
import { useCardDeal } from "../useCardDeal";
import { VoiceControl } from "../VoiceControl";

interface Pending {
  attempted: Action;
  advice: ReturnType<typeof getAdvice>;
  unsure: boolean;
  ms: number;
}
const resultLabel = {
  win: "Gewonnen",
  loss: "Verloren",
  push: "Unentschieden",
  blackjack: "Blackjack · 3:2",
  "even-money": "Even Money · 1:1",
};
export function PlayPage({ active }: { active: boolean }) {
  const { state, setState } = useStore();
  const game = state.game;
  const animation = useCardDeal(
    cardsInDealOrder(game),
    `play-${game.round}`,
    active,
  );
  const [bet, setBet] = useState(game.baseBet);
  const [pending, setPending] = useState<Pending>();
  const [after, setAfter] = useState("");
  const [reset, setReset] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const locked = useRef(false);
  const hand = game.hands[game.active];
  const allowed = legalActions(game);
  const decisionId = `${game.round}-${game.active}-${hand?.cards.map((c) => c.id).join(",")}`;
  const marked = state.playUnsure === decisionId;
  const clock = useRef({ ms: 0, last: performance.now(), running: false });
  useEffect(() => {
    locked.current = false;
    clock.current = {
      ms: 0,
      last: performance.now(),
      running:
        active &&
        game.phase === "player" &&
        !animation.busy &&
        !document.hidden,
    };
  }, [decisionId, game.phase]);
  useEffect(() => {
    const tick = () => {
      const now = performance.now();
      if (clock.current.running) clock.current.ms += now - clock.current.last;
      clock.current.last = now;
      clock.current.running =
        active &&
        game.phase === "player" &&
        !pending &&
        !animation.busy &&
        !document.hidden;
    };
    tick();
    document.addEventListener("visibilitychange", tick);
    return () => {
      tick();
      document.removeEventListener("visibilitychange", tick);
    };
  }, [active, game.phase, pending, animation.busy]);
  function updateGame(next: Game) {
    setState((s) => ({
      ...s,
      game: next,
      lastUsedAt: Date.now(),
      playUnsure: null,
      freePlay:
        next.phase === "settled" && s.game.phase !== "settled"
          ? {
              ...s.freePlay,
              rounds: s.freePlay.rounds + 1,
              hands: s.freePlay.hands + next.hands.length,
            }
          : s.freePlay,
    }));
  }
  function mark() {
    if (game.phase !== "player" || marked || !hand || animation.busy) return;
    const advice = getAdvice(hand.cards, game.dealer[0], allowed);
    setState((s) => ({
      ...s,
      playUnsure: decisionId,
      training: markUncertain(s.training, advice.key),
    }));
  }
  function execute(decision: Pending, action: Action, warning: boolean) {
    const next = playAction(game, action);
    const correct = decision.attempted === decision.advice.action;
    const adherence = action === decision.advice.action;
    setState((s) => ({
      ...s,
      lastUsedAt: Date.now(),
      game: next,
      playUnsure: null,
      training: recordAnswer(
        s.training,
        decision.advice.key,
        correct,
        decision.unsure,
        decision.ms,
      ),
      freePlay: {
        ...s.freePlay,
        rounds: s.freePlay.rounds + Number(next.phase === "settled"),
        hands:
          s.freePlay.hands + (next.phase === "settled" ? next.hands.length : 0),
        correct: s.freePlay.correct + Number(correct),
        wrong: s.freePlay.wrong + Number(!correct),
        adherence: s.freePlay.adherence + Number(adherence),
        warnings: s.freePlay.warnings + Number(warning),
        accepted: s.freePlay.accepted + Number(warning && adherence),
        overridden:
          s.freePlay.overridden +
          Number(
            warning && !adherence && s.settings.strategyWarnings === "before",
          ),
        history: [
          {
            key: decision.advice.key,
            attempted: decision.attempted,
            recommended: decision.advice.action,
            executed: action,
            unsure: decision.unsure,
            warning,
            at: Date.now(),
          },
          ...s.freePlay.history,
        ].slice(0, 200),
      },
    }));
    setPending(undefined);
    setAfter(
      !correct && state.settings.strategyWarnings === "after"
        ? `Deine letzte Entscheidung: ${ACTION_LABEL[decision.attempted]}. ${decision.advice.explanation}`
        : "",
    );
  }
  function act(action: Action) {
    if (
      !hand ||
      locked.current ||
      pending ||
      animation.busy ||
      !allowed.includes(action)
    )
      return;
    locked.current = true;
    const advice = getAdvice(hand.cards, game.dealer[0], allowed);
    const decision = {
      attempted: action,
      advice,
      unsure: marked,
      ms:
        clock.current.ms +
        (clock.current.running ? performance.now() - clock.current.last : 0),
    };
    if (
      action !== advice.action &&
      state.settings.strategyWarnings === "before"
    )
      setPending(decision);
    else
      execute(
        decision,
        action,
        action !== advice.action && state.settings.strategyWarnings === "after",
      );
  }
  function start() {
    if (
      !["betting", "settled"].includes(game.phase) ||
      bet > game.bankroll ||
      locked.current ||
      animation.busy
    )
      return;
    locked.current = true;
    setAfter("");
    updateGame(deal(game, bet));
  }
  useShortcuts(act, mark, start, active);
  const finished = game.phase === "settled" && !animation.busy;
  const betting = game.phase === "betting" || finished;
  const autoContinue =
    voiceEnabled &&
    active &&
    finished &&
    !pending &&
    !reset &&
    bet <= game.bankroll;
  const startRef = useRef(start);
  startRef.current = start;
  useEffect(() => {
    if (!autoContinue) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const schedule = () => {
      clearTimeout(timer);
      if (!document.hidden) {
        timer = setTimeout(() => {
          if (!document.hidden && !document.querySelector("dialog[open]"))
            startRef.current();
        }, 3000);
      }
    };
    schedule();
    document.addEventListener("visibilitychange", schedule);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [autoContinue, game.round, bet]);
  const playCount = state.freePlay.correct + state.freePlay.wrong;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">VOM WISSEN ZUM SPIEL</span>
          <h1>
            Dein Platz <em>am Tisch.</em>
          </h1>
          <p>
            Sechs Decks. Echte Entscheidungen. Ausschließlich virtuelles Geld.
          </p>
        </div>
        <div className="heading-stamp">
          <span>♣</span>
          <small>
            SPIELEN.
            <br />
            VERSTEHEN. LERNEN.
          </small>
        </div>
      </div>
      <VoiceControl
        active={active}
        contextKey={`play-${decisionId}-${game.phase}-${!!pending}-${reset}`}
        allowed={!animation.busy && !pending && !reset ? allowed : []}
        onAction={act}
        autoContinue
        onEnabledChange={setVoiceEnabled}
      />
      <div className="workspace">
        <section className="main-panel play-panel">
          <div className="panel-toolbar">
            <span className="eyebrow">WIESBADEN RULES</span>
            <span className="muted">
              Runde {game.round || "–"} · {game.shoe.length} Karten
            </span>
          </div>
          <div className="casino-table" aria-busy={animation.busy}>
            {game.dealer.length ? (
              <HandCards
                cards={game.dealer}
                label="DEALER"
                total={finished && state.settings.showHandTotals}
                visible={animation.visible}
              />
            ) : (
              <div className="empty-dealer">
                <div className="card-outline">♠</div>
                <span className="hand-label">DER TISCH IST BEREIT</span>
              </div>
            )}
            <div className="table-inscription">
              <span>BLACKJACK PAYS 3 TO 2</span>
              <small>Dealer stands on all 17s · No hole card</small>
            </div>
            {game.hands.length ? (
              <div
                className={`player-hands ${game.hands.length > 1 ? "multiple" : ""}`}
              >
                {game.hands.map((h, i) => (
                  <div
                    key={i}
                    className={`player-hand ${!finished && game.active === i ? "active-hand" : ""}`}
                  >
                    <HandCards
                      cards={h.cards}
                      total={state.settings.showHandTotals}
                      visible={animation.visible}
                      label={
                        game.hands.length > 1 ? `HAND ${i + 1}` : "DEINE HAND"
                      }
                    />
                    <div className="hand-result">
                      <span className="bet-pill">{euros(h.bet)}</span>
                      {animation.busy ? (
                        <span>Karten werden ausgeteilt …</span>
                      ) : h.result ? (
                        <span
                          className={
                            (h.profit ?? 0) > 0
                              ? "text-good"
                              : (h.profit ?? 0) < 0
                                ? "text-warn"
                                : ""
                          }
                        >
                          {resultLabel[h.result]} ·{" "}
                          {(h.profit ?? 0) > 0 ? "+" : ""}
                          {euros(h.profit ?? 0)}
                        </span>
                      ) : h.done ? (
                        <span>
                          {handValue(h.cards).bust ? "Überkauft" : "Steht"}
                        </span>
                      ) : (
                        <span>
                          {game.active === i ? "Du bist dran" : "Wartet"}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="table-welcome">
                <h2>
                  Eine Hand sagt wenig.
                  <br />
                  Deine Entscheidungen zählen.
                </h2>
                <p>Wähle deinen Einsatz und gib die erste Runde.</p>
              </div>
            )}
          </div>
          <div className="decision-area play-controls">
            <label className="play-total-switch">
              <input
                type="checkbox"
                role="switch"
                checked={state.settings.showHandTotals}
                onChange={(e) =>
                  setState((s) => ({
                    ...s,
                    settings: {
                      ...s.settings,
                      showHandTotals: e.target.checked,
                    },
                  }))
                }
              />
              Handsumme anzeigen
            </label>
            {game.phase === "insurance" && (
              <div className="insurance-offer">
                <strong>Der Dealer zeigt ein Ass.</strong>
                <p>
                  {isBlackjack(game.hands[0].cards)
                    ? "Even Money zahlt deinen Blackjack sofort 1:1 aus. Oder du spielst ihn regulär zu Ende."
                    : `Versicherung kostet ${euros(game.baseBet / 2)} und zahlt bei Dealer-Blackjack 2:1.`}
                </p>
                <div className="button-row">
                  <button
                    className="primary"
                    disabled={animation.busy}
                    onClick={() => updateGame(chooseInsurance(game, "decline"))}
                  >
                    Ablehnen & weiterspielen
                  </button>
                  {isBlackjack(game.hands[0].cards) ? (
                    <button
                      className="secondary"
                      disabled={animation.busy}
                      onClick={() => updateGame(chooseInsurance(game, "even"))}
                    >
                      Even Money
                    </button>
                  ) : (
                    <button
                      className="secondary"
                      disabled={
                        animation.busy || game.bankroll < game.baseBet / 2
                      }
                      onClick={() =>
                        updateGame(chooseInsurance(game, "insurance"))
                      }
                    >
                      Versichern
                    </button>
                  )}
                </div>
                <small className="muted">
                  Basic Strategy empfiehlt, Versicherung und Even Money
                  abzulehnen.
                </small>
              </div>
            )}
            {finished && (
              <div className="round-summary" aria-live="polite">
                <div>
                  <span className="eyebrow">RUNDE ABGESCHLOSSEN</span>
                  <strong
                    className={
                      game.net > 0
                        ? "text-good"
                        : game.net < 0
                          ? "text-warn"
                          : ""
                    }
                  >
                    {game.net > 0 ? "+" : ""}
                    {euros(game.net)}
                  </strong>
                </div>
                <span>
                  {game.insuranceBet
                    ? `Versicherung: ${game.insuranceProfit > 0 ? "+" : ""}${euros(game.insuranceProfit)}`
                    : "Virtuelles Rundenergebnis"}
                </span>
              </div>
            )}
            {betting && (
              <div className="bet-controls">
                <div>
                  <span className="eyebrow">DEIN EINSATZ</span>
                  <div className="chips">
                    {[10, 20, 50, 100].map((value) => (
                      <button
                        key={value}
                        className={`chip chip-${value} ${bet === value ? "selected" : ""}`}
                        aria-pressed={bet === value}
                        disabled={game.bankroll < value}
                        onClick={() => setBet(value)}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  className="primary deal-button"
                  onClick={start}
                  disabled={bet > game.bankroll || animation.busy}
                >
                  {autoContinue
                    ? "Nächste Runde automatisch nach 3 s"
                    : finished
                      ? "Nächste Runde"
                      : "Karten geben"}
                  <ArrowRight size={18} />
                </button>
              </div>
            )}
            {betting && game.bankroll < bet && game.bankroll >= 10 && (
              <button className="text-button" onClick={() => setBet(10)}>
                Einsatz auf 10 € reduzieren
              </button>
            )}
            {game.bankroll < 10 && betting && (
              <div className="feedback incorrect">
                <span>Dein Übungsguthaben ist aufgebraucht.</span>
                <button className="text-button" onClick={() => setReset(true)}>
                  Guthaben zurücksetzen
                </button>
              </div>
            )}
            {game.phase === "player" && (
              <div className="uncertainty-row">
                <UnsureButton
                  marked={marked}
                  onClick={mark}
                  disabled={animation.busy}
                />
                <span className="small muted">
                  {game.hands.length > 1
                    ? `Hand ${game.active + 1} von ${game.hands.length}`
                    : "Deine Entscheidung"}
                </span>
              </div>
            )}
            <ActionButtons
              allowed={allowed}
              onAction={act}
              disabled={!!pending || animation.busy}
              doubleReason={
                hand && game.bankroll < hand.bet
                  ? "Nicht genug verfügbares Übungsguthaben für den zusätzlichen Einsatz."
                  : undefined
              }
            />
            {game.phase === "player" && !allowed.includes("D") && (
              <details className="action-rule-help">
                <summary>Warum ist Double gesperrt?</summary>
                <p>
                  {hand && game.bankroll < hand.bet
                    ? "Dein verfügbares Übungsguthaben reicht nicht für den zusätzlichen Einsatz."
                    : "Wiesbaden Rules: Double ist nur mit den ersten zwei Karten und Hard 9–11 erlaubt, auch nach Split. Nach Card ist kein Double mehr möglich."}
                </p>
              </details>
            )}
            {after && (
              <div className="feedback incorrect" role="status">
                <p>{after}</p>
              </div>
            )}
          </div>
          <div className="panel-footer">
            <span>
              <span className="status-dot" /> Nur virtuelles Geld
            </span>
            <span>Kein Joker · Keine Zusatzwetten</span>
          </div>
        </section>
        <aside className="training-sidebar">
          <section className="side-panel">
            <div className="section-heading">
              <h2>Dein Übungsguthaben</h2>
              <Coins size={19} />
            </div>
            <div className="session-score">
              <strong>
                {euros(
                  game.phase === "settled" && animation.busy
                    ? game.startingBankroll -
                        game.hands.reduce((sum, h) => sum + h.bet, 0) -
                        game.insuranceBet
                    : game.bankroll,
                )}
              </strong>
              <span>verfügbar · Startguthaben 1.000 €</span>
            </div>
            <div className="metrics compact">
              <Metric value={state.freePlay.rounds} label="Runden" />
              <Metric
                value={percent(state.freePlay.correct, playCount)}
                label="Erster Impuls"
              />
            </div>
            <p className="small muted">
              Während einer Runde sind alle gesetzten Einsätze bereits
              abgezogen.
            </p>
            <button className="text-button" onClick={() => setReset(true)}>
              Übungsspiel zurücksetzen <Shuffle size={15} />
            </button>
          </section>
          <section className="side-panel subtle">
            <span className="eyebrow">
              <ShieldCheck size={15} /> DEIN STRATEGIE-COACH
            </span>
            <h3>
              {state.settings.strategyWarnings === "disabled"
                ? "Du spielst selbstständig."
                : state.settings.strategyWarnings === "after"
                  ? "Feedback nach dem Spielzug."
                  : "Ein kurzer Check vor dem Zug."}
            </h3>
            <p>
              Dein erster Impuls und die tatsächlich ausgeführte Aktion werden
              getrennt bewertet. Korrigieren ist Lernen.
            </p>
            <div className="metrics compact">
              <Metric
                value={percent(state.freePlay.adherence, playCount)}
                label="Strategietreue"
              />
              <Metric value={state.freePlay.accepted} label="Korrekturen" />
            </div>
          </section>
          <section className="side-panel">
            <span className="eyebrow">
              <CircleHelp size={14} /> AM TISCH
            </span>
            <ul className="rule-list">
              <li>Dealer zieht erst nach deinen Händen.</li>
              <li>Double: zwei Karten, Hard 9–11.</li>
              <li>Bis zu vier Hände, Double nach Split.</li>
              <li>Geteilte Asse erhalten je eine Karte.</li>
              <li>Dealer steht auch auf Soft 17.</li>
            </ul>
          </section>
        </aside>
      </div>
      {pending && active && (
        <Modal
          title="Kurz die Strategie prüfen."
          dismissible={false}
          onClose={() => {}}
        >
          <span className="eyebrow">
            DEIN ERSTER IMPULS: {ACTION_LABEL[pending.attempted].toUpperCase()}
          </span>
          <h3>Die Tabelle empfiehlt {ACTION_LABEL[pending.advice.action]}.</h3>
          <p>{pending.advice.explanation}</p>
          <div className="modal-actions">
            <button
              className="primary"
              onClick={() => execute(pending, pending.advice.action, true)}
            >
              {ACTION_LABEL[pending.advice.action]} übernehmen <CheckIcon />
            </button>
            <button
              className="secondary"
              onClick={() => execute(pending, pending.attempted, true)}
            >
              Trotzdem {ACTION_LABEL[pending.attempted]} spielen
            </button>
            <UnsureButton marked={marked} onClick={mark} />
          </div>
          <p className="small muted">
            Dein erster Versuch bleibt in der Statistik erhalten.
          </p>
        </Modal>
      )}
      {reset && (
        <Modal
          title="Übungsspiel zurücksetzen?"
          onClose={() => setReset(false)}
        >
          <p>
            Die aktuelle Runde endet. Guthaben, Kartenschuh und Spielstatistiken
            starten neu. Dein Lernfortschritt und deine Merkliste bleiben
            erhalten.
          </p>
          <button
            className="primary"
            onClick={() => {
              setState((s) => ({
                ...s,
                game: newGame(),
                playUnsure: null,
                freePlay: {
                  rounds: 0,
                  hands: 0,
                  correct: 0,
                  wrong: 0,
                  adherence: 0,
                  warnings: 0,
                  accepted: 0,
                  overridden: 0,
                  history: [],
                },
              }));
              setBet(10);
              setReset(false);
              setPending(undefined);
              setAfter("");
            }}
          >
            Mit 1.000 € neu starten
          </button>
        </Modal>
      )}
    </>
  );
}
function CheckIcon() {
  return <ShieldCheck size={17} />;
}
