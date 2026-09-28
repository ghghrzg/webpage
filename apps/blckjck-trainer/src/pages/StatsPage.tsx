import { Activity, ArrowUpRight, CircleHelp, Crosshair } from "lucide-react";
import { EmptyState, Metric, percent } from "../components";
import { CELL_BY_KEY } from "../core/strategy";
import { median } from "../core/training";
import { useStore } from "../state";

export function StatsPage() {
  const { state } = useStore();
  const values = Object.values(state.training.decisions);
  const seen = values.reduce((sum, s) => sum + s.seen, 0);
  const correct = values.reduce((sum, s) => sum + s.correct, 0);
  const sum = (
    key:
      "confidentCorrect" | "confidentWrong" | "unsureCorrect" | "unsureWrong",
  ) => values.reduce((sum, s) => sum + s[key], 0);
  const plays = state.freePlay.correct + state.freePlay.wrong;
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DEIN LERNFORTSCHRITT</span>
          <h1>
            Wissen, <em>wo du stehst.</em>
          </h1>
          <p>
            Entscheidungen aus Trainer und Spiel. Lokal in diesem Browser
            gespeichert.
          </p>
        </div>
        <div className="heading-stamp">
          <span>♥</span>
          <small>
            FORTSCHRITT.
            <br />
            KEIN GLÜCKSSPIEL.
          </small>
        </div>
      </div>
      <section className="main-panel overview-metrics">
        <Metric
          value={percent(correct, seen)}
          label="Richtige Erstentscheidungen"
          accent
        />
        <Metric value={seen} label="Entscheidungen insgesamt" />
        <Metric
          value={
            seen
              ? `${(median(values.flatMap((s) => s.times)) / 1000).toFixed(2)} s`
              : "–"
          }
          label="Median · letzte 50 je Zelle"
        />
        <Metric
          value={
            Object.values(state.training.difficult).filter((d) => !d.resolved)
              .length
          }
          label="Offene unsichere Hände"
        />
      </section>
      {!seen && (
        <EmptyState title="Dein Fortschritt beginnt mit einer Hand.">
          Nach deinen ersten Entscheidungen siehst du hier, was schon sitzt und
          was noch Übung braucht.
        </EmptyState>
      )}
      <div className="stats-grid">
        <section className="main-panel stat-panel">
          <div className="section-heading">
            <h2>Wie sicher ist dein Wissen?</h2>
            <Crosshair size={19} />
          </div>
          <p className="muted">
            „Sicher“ bedeutet: vor der Antwort nicht als unsicher markiert.
          </p>
          <div className="confidence-grid">
            <div>
              <span>Sicher & richtig</span>
              <strong className="text-good">{sum("confidentCorrect")}</strong>
              <small>Das sitzt schon.</small>
            </div>
            <div>
              <span>Unsicher & richtig</span>
              <strong>{sum("unsureCorrect")}</strong>
              <small>Wissen braucht Vertrauen.</small>
            </div>
            <div>
              <span>Unsicher & falsch</span>
              <strong>{sum("unsureWrong")}</strong>
              <small>Eine erkannte Lücke.</small>
            </div>
            <div className="confidence-warning">
              <span>Sicher & falsch</span>
              <strong>{sum("confidentWrong")}</strong>
              <small>Hier lohnt sich gezielte Übung.</small>
            </div>
          </div>
        </section>
        <section className="main-panel stat-panel">
          <div className="section-heading">
            <h2>Deine Handgruppen</h2>
            <Activity size={19} />
          </div>
          {(["hard", "soft", "pair"] as const).map((type) => {
            const cells = Object.entries(state.training.decisions)
              .filter(([key]) => key.startsWith(type))
              .map(([, s]) => s);
            const count = cells.reduce((sum, s) => sum + s.seen, 0),
              right = cells.reduce((sum, s) => sum + s.correct, 0);
            return (
              <div className="group-stat" key={type}>
                <div>
                  <strong>
                    {type === "hard"
                      ? "Hard Totals"
                      : type === "soft"
                        ? "Soft Hands"
                        : "Paare"}
                  </strong>
                  <span>{percent(right, count)}</span>
                </div>
                <div className="progress-track">
                  <span
                    style={{ width: `${count ? (right / count) * 100 : 0}%` }}
                  />
                </div>
                <small className="muted">
                  {count} Entscheidungen · {cells.length} verschiedene Zellen
                </small>
              </div>
            );
          })}
        </section>
        <section className="main-panel stat-panel">
          <div className="section-heading">
            <h2>Am Spieltisch</h2>
            <ArrowUpRight size={19} />
          </div>
          <div className="metrics compact">
            <Metric
              value={percent(state.freePlay.correct, plays)}
              label="Erster Impuls"
            />
            <Metric
              value={percent(state.freePlay.adherence, plays)}
              label="Ausgeführte Strategie"
            />
          </div>
          <dl className="data-list">
            <div>
              <dt>Runden / Hände</dt>
              <dd>
                {state.freePlay.rounds} / {state.freePlay.hands}
              </dd>
            </div>
            <div>
              <dt>Strategiehinweise</dt>
              <dd>{state.freePlay.warnings}</dd>
            </div>
            <div>
              <dt>Korrekturen übernommen</dt>
              <dd>{state.freePlay.accepted}</dd>
            </div>
            <div>
              <dt>Bewusst anders gespielt</dt>
              <dd>{state.freePlay.overridden}</dd>
            </div>
          </dl>
          <p className="small muted">
            Versicherung und Even Money zählen nicht als H/S/D/P-Entscheidung.
          </p>
        </section>
        <section className="main-panel stat-panel">
          <div className="section-heading">
            <h2>Zuletzt trainiert</h2>
            <CircleHelp size={18} />
          </div>
          {state.sessions.length ? (
            <div className="session-list">
              {state.sessions.slice(0, 6).map((session) => (
                <div key={session.id}>
                  <div>
                    <strong>
                      {session.mode}
                      {session.mode === "Casino-Test" && session.total < 100
                        ? " · läuft / unvollständig"
                        : ""}
                    </strong>
                    <small>
                      {new Date(session.id).toLocaleDateString("de-DE")} ·{" "}
                      {session.total} Entscheidungen
                    </small>
                  </div>
                  <span>{percent(session.correct, session.total)}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">
              Hier erscheinen deine nächsten Trainingseinheiten.
            </p>
          )}
        </section>
      </div>
      {state.freePlay.history.length > 0 && (
        <section className="main-panel stat-panel">
          <h2>Letzte Spielentscheidungen</h2>
          <div className="history-scroll">
            <table className="history-table">
              <thead>
                <tr>
                  <th>Situation</th>
                  <th>Versuch</th>
                  <th>Strategie</th>
                  <th>Gespielt</th>
                </tr>
              </thead>
              <tbody>
                {state.freePlay.history.slice(0, 12).map((item, i) => {
                  const cell = CELL_BY_KEY.get(item.key)!;
                  return (
                    <tr key={i}>
                      <td>
                        {cell.row.label} vs {cell.dealer}
                        {item.unsure ? " ?" : ""}
                      </td>
                      <td
                        className={
                          item.attempted === item.recommended
                            ? "text-good"
                            : "text-warn"
                        }
                      >
                        {item.attempted}
                      </td>
                      <td>{item.recommended}</td>
                      <td>{item.executed}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </>
  );
}
