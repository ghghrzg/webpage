import { useState } from "react";
import { Info } from "lucide-react";
import {
  ACTION_LABEL,
  CELL_BY_KEY,
  DEALERS,
  STRATEGY,
  explain,
  type HandType,
} from "../core/strategy";
import { useStore } from "../state";
import { percent } from "../components";

export function StrategyPage() {
  const { state } = useStore();
  const [type, setType] = useState<HandType>("hard");
  const [heatmap, setHeatmap] = useState(false);
  const [selected, setSelected] = useState("hard-12-vs-4");
  const cell = CELL_BY_KEY.get(selected)!;
  const stats = state.training.decisions[selected];
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">DEIN NACHSCHLAGEWERK</span>
          <h1>
            Ein klarer <em>Spielplan.</em>
          </h1>
          <p>
            Eine Tabelle für Training, Spiel und Feedback. Tippe auf eine Zelle.
          </p>
        </div>
        <div className="heading-stamp">
          <span>♦</span>
          <small>
            WENIGER RATEN.
            <br />
            MEHR VERSTEHEN.
          </small>
        </div>
      </div>
      <div className="workspace">
        <section className="main-panel strategy-panel">
          <div className="panel-toolbar">
            <div className="segmented">
              {(["hard", "soft", "pair"] as const).map((t) => (
                <button
                  className={type === t ? "selected" : ""}
                  key={t}
                  onClick={() => setType(t)}
                >
                  {t === "hard" ? "Hard" : t === "soft" ? "Soft" : "Paare"}
                </button>
              ))}
            </div>
            <label className="check-label">
              <input
                type="checkbox"
                checked={heatmap}
                onChange={(e) => setHeatmap(e.target.checked)}
              />{" "}
              Lernstand
            </label>
          </div>
          <div className="table-scroll">
            <table className={`strategy-matrix ${heatmap ? "heatmap" : ""}`}>
              <caption>
                {type === "hard"
                  ? "Harte Hände"
                  : type === "soft"
                    ? "Soft Hands"
                    : "Paare"}{" "}
                · Spalten zeigen die offene Dealerkarte
              </caption>
              <thead>
                <tr>
                  <th scope="col">
                    Du ↓<br />
                    Dealer →
                  </th>
                  {DEALERS.map((d) => (
                    <th scope="col" key={d}>
                      {d}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {STRATEGY.filter((r) => r.type === type).map((row) => (
                  <tr key={row.value}>
                    <th scope="row">{row.label}</th>
                    {row.cells.map((code, i) => {
                      const key = `${row.type}-${row.value}-vs-${DEALERS[i]}`;
                      const record = state.training.decisions[key];
                      const mastery = !record
                        ? "unseen"
                        : record.correct / record.seen >= 0.9 &&
                            record.seen >= 3
                          ? "mastered"
                          : record.correct / record.seen < 0.8
                            ? "needs-work"
                            : "learning";
                      return (
                        <td key={key}>
                          <button
                            className={`matrix-cell code-${code[0]} ${heatmap ? mastery : ""} ${selected === key ? "selected" : ""}`}
                            aria-label={`${row.label} gegen ${DEALERS[i]}: ${ACTION_LABEL[code[0] as keyof typeof ACTION_LABEL]}${heatmap ? `, ${record ? percent(record.correct, record.seen) : "nicht geübt"}` : ""}`}
                            aria-pressed={selected === key}
                            onClick={() => setSelected(key)}
                          >
                            {code[0]}
                            {code.includes("/") && (
                              <small>{code.slice(2)}</small>
                            )}
                            {state.training.difficult[key] &&
                              !state.training.difficult[key].resolved && (
                                <span className="cell-mark" />
                              )}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="matrix-legend">
            {heatmap ? (
              <>
                <span>
                  <i className="legend-dot mastered" />
                  Sicher: ≥ 90 %, ≥ 3 Versuche
                </span>
                <span>
                  <i className="legend-dot learning" />
                  Im Aufbau
                </span>
                <span>
                  <i className="legend-dot needs-work" />
                  Unter 80 %
                </span>
                <span>
                  <i className="legend-dot unseen" />
                  Ungeübt
                </span>
              </>
            ) : (
              <>
                <span>
                  <i className="legend-dot code-H" />H · {ACTION_LABEL.H}
                </span>
                <span>
                  <i className="legend-dot code-S" />S · {ACTION_LABEL.S}
                </span>
                <span>
                  <i className="legend-dot code-D" />D · Double
                </span>
                <span>
                  <i className="legend-dot code-P" />P · Split
                </span>
              </>
            )}
          </div>
          <p className="matrix-footnote">
            Kleiner Buchstabe = Ersatzaktion, wenn Double oder Split nicht
            möglich ist. Punkt = auf deiner Merkliste.
          </p>
        </section>
        <aside className="training-sidebar">
          <section className="side-panel advice-panel">
            <span className="eyebrow">DIESE SITUATION</span>
            <h2>
              {cell.row.label} <span className="muted">gegen</span>{" "}
              {cell.dealer}
            </h2>
            <span className={`advice-action code-${cell.code[0]}`}>
              {ACTION_LABEL[cell.code[0] as keyof typeof ACTION_LABEL]}
            </span>
            <p>{explain(cell)}</p>
            {cell.code.includes("/") && (
              <p className="small muted">
                Falls nicht möglich:{" "}
                {ACTION_LABEL[cell.code.slice(2) as keyof typeof ACTION_LABEL]}.
              </p>
            )}
            <div className="metrics compact">
              <div className="metric">
                <strong>{stats?.seen ?? 0}</strong>
                <span>Versuche</span>
              </div>
              <div className="metric">
                <strong>
                  {stats ? percent(stats.correct, stats.seen) : "–"}
                </strong>
                <span>richtig</span>
              </div>
            </div>
          </section>
          <section className="side-panel subtle">
            <span className="eyebrow">
              <Info size={15} /> ZUM REGELPROFIL
            </span>
            <h3>European ≠ überall gleich.</h3>
            <p>
              Diese Tabelle gilt für das hier verwendete Profil: 6 Decks, ENHC,
              S17, Hard Double 9–11, DAS, kein Surrender.
            </p>
            <p className="small muted">
              Arbeitsmatrix aus dem Konzept. Die exakte Solver-Prüfung für
              Wiesbaden steht noch aus. Ass-Re-Split wird vorsichtig als nicht
              erlaubt modelliert.
            </p>
          </section>
        </aside>
      </div>
    </>
  );
}
