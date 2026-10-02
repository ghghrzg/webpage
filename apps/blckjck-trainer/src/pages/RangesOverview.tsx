import {
  describeRange,
  STRATEGY_RANGES,
  type RangeTraining,
} from "../core/strategyRanges";

export function RangesOverview({ training }: { training: RangeTraining }) {
  const stats = Object.values(training);
  const attempts = stats.reduce((sum, entry) => sum + entry.attempts, 0);
  const mistakes = stats.reduce((sum, entry) => sum + entry.mistakes, 0);
  const errorRate = (errors: number, rounds: number) =>
    rounds ? `${Math.round((100 * errors) / (rounds * 10))} %` : "—";
  return (
    <section
      className="ranges-overview"
      aria-label="Alle Ranges mit Lösungen und Statistik"
    >
      <h2>Alle Ranges im Überblick</h2>
      <p className="muted small">
        Lösungen nach Wiesbaden Rules. Karten- und Range-Modus zählen gemeinsam
        pro Kategorie.
      </p>
      <dl className="ranges-overview-summary">
        <div>
          <dt>Geübt</dt>
          <dd>{stats.filter((entry) => entry.attempts > 0).length}/17</dd>
        </div>
        <div>
          <dt>Durchgänge</dt>
          <dd>{attempts}</dd>
        </div>
        <div>
          <dt>Falsche Felder</dt>
          <dd>{errorRate(mistakes, attempts)}</dd>
        </div>
      </dl>
      <div className="ranges-overview-list">
        {STRATEGY_RANGES.map((category) => {
          const entry = training[category.id];
          return (
            <article className="ranges-overview-card" key={category.id}>
              <header>
                <h3>{category.label}</h3>
                <span className="muted small">
                  {entry?.attempts ? "Geübt" : "Noch nicht geübt"}
                </span>
              </header>
              <div
                className="ranges-rule"
                aria-label={`Lösung für ${category.label}`}
              >
                {describeRange(category).map((rule) => (
                  <span key={rule}>{rule}</span>
                ))}
              </div>
              <dl className="ranges-overview-stats">
                <div>
                  <dt>Durchgänge</dt>
                  <dd>{entry?.attempts ?? 0}</dd>
                </div>
                <div>
                  <dt>Fehlerfrei</dt>
                  <dd>{entry?.perfect ?? 0}</dd>
                </div>
                <div>
                  <dt>Falsche Felder</dt>
                  <dd>
                    {errorRate(entry?.mistakes ?? 0, entry?.attempts ?? 0)}
                  </dd>
                </div>
              </dl>
              <p className="small muted">
                {entry?.attempts
                  ? `${entry.mistakes} Fehler bei ${entry.attempts * 10} Feldern · Zuletzt ${new Date(entry.lastSeen).toLocaleDateString("de-DE")}`
                  : "Noch keine Antworten gespeichert."}
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
