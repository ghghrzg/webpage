import { useRef, useState } from "react";
import { Download, ExternalLink, Upload } from "lucide-react";
import { Modal } from "../components";
import {
  emptyFreeStats,
  exportState,
  freshState,
  parseBackup,
  type AppState,
} from "../core/storage";
import { newGame } from "../core/engine";
import { emptyTraining } from "../core/training";
import { useStore } from "../state";

export function Settings({
  onClose,
  onReset,
}: {
  onClose: () => void;
  onReset: () => void;
}) {
  const { state, setState, setNotice } = useStore();
  const [confirm, setConfirm] = useState<"stats" | "play" | "all" | "import">();
  const [imported, setImported] = useState<AppState>();
  const [error, setError] = useState("");
  const input = useRef<HTMLInputElement>(null);
  function commitReset() {
    if (confirm === "all") setState(freshState());
    if (confirm === "stats")
      setState((s) => ({
        ...s,
        training: emptyTraining(),
        strategyRanges: {},
        sessions: [],
        challenge: [false, false, false],
        playUnsure: null,
        freePlay: emptyFreeStats(),
      }));
    if (confirm === "play")
      setState((s) => ({
        ...s,
        game: newGame(),
        freePlay: emptyFreeStats(),
        playUnsure: null,
      }));
    if (confirm === "import" && imported) setState(imported);
    setConfirm(undefined);
    onReset();
    onClose();
  }
  return (
    <Modal title="Einstellungen & Infos" onClose={onClose}>
      <div className="settings-body">
        <section>
          <h3>Dein Training</h3>
          <label className="setting-row">
            <span>Handsumme anzeigen (Training & Spiel)</span>
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
          </label>
          <label className="setting-row">
            <span>Erscheinungsbild</span>
            <select
              value={state.settings.theme}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  settings: {
                    ...s.settings,
                    theme: e.target.value as AppState["settings"]["theme"],
                  },
                }))
              }
            >
              <option value="dark">Dunkel</option>
              <option value="light">Hell</option>
              <option value="system">Wie das Gerät</option>
            </select>
          </label>
          <label className="setting-row">
            <span>Strategiehinweise im Spiel</span>
            <select
              value={state.settings.strategyWarnings}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  settings: {
                    ...s.settings,
                    strategyWarnings: e.target
                      .value as AppState["settings"]["strategyWarnings"],
                  },
                }))
              }
            >
              <option value="before">Vor der Aktion</option>
              <option value="after">Nach der Aktion</option>
              <option value="disabled">Aus</option>
            </select>
          </label>
          <label className="setting-row">
            <span>Automatisch nächste Trainingshand</span>
            <input
              type="checkbox"
              checked={state.settings.autoAdvance}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  settings: { ...s.settings, autoAdvance: e.target.checked },
                }))
              }
            />
          </label>
          <label className="setting-row">
            <span>Antwortzeit anzeigen</span>
            <input
              type="checkbox"
              checked={state.settings.showTimer}
              onChange={(e) =>
                setState((s) => ({
                  ...s,
                  settings: { ...s.settings, showTimer: e.target.checked },
                }))
              }
            />
          </label>
        </section>
        <section>
          <h3>Deine Daten gehören dir.</h3>
          <p>
            Kein Konto, kein Tracking, kein Backend. Lernfortschritt und
            Übungsspiel bleiben in diesem Browser. Beim Löschen der Browserdaten
            gehen sie ohne Export verloren.
          </p>
          <p>
            Optional aktivierte Sprachsteuerung: Der Browser kann Audio an
            seinen Spracherkennungsdienst übertragen. Die App speichert keine
            Sprachaufnahmen. Ohne aktivierte Sprachsteuerung wird das Mikrofon
            nicht verwendet.
          </p>
          <div className="button-row">
            <button className="secondary" onClick={() => exportState(state)}>
              <Download size={16} /> JSON exportieren
            </button>
            <button
              className="secondary"
              onClick={() => input.current?.click()}
            >
              <Upload size={16} /> JSON importieren
            </button>
          </div>
          <input
            hidden
            ref={input}
            type="file"
            accept="application/json,.json"
            aria-label="Backup-Datei importieren"
            onChange={async (e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              try {
                if (file.size > 5_000_000)
                  throw new Error(
                    "Bitte eine Datei bis maximal 5 MB auswählen.",
                  );
                setImported(parseBackup(await file.text()));
                setConfirm("import");
                setError("");
              } catch (err) {
                setError(
                  err instanceof Error ? err.message : "Import fehlgeschlagen.",
                );
              }
              e.target.value = "";
            }}
          />
          {error && (
            <p className="text-warn" role="alert">
              {error}
            </p>
          )}
          <div className="reset-links">
            <button onClick={() => setConfirm("stats")}>
              Statistiken zurücksetzen
            </button>
            <button onClick={() => setConfirm("play")}>
              Übungsspiel zurücksetzen
            </button>
            <button onClick={() => setConfirm("all")}>
              Alles zurücksetzen
            </button>
          </div>
          {confirm && (
            <div className="confirm-box" role="alert">
              <strong>
                {confirm === "import"
                  ? "Diesen geprüften Spielstand übernehmen?"
                  : "Wirklich zurücksetzen?"}
              </strong>
              <p>
                {confirm === "import"
                  ? "Der Import ersetzt Fortschritt, Einstellungen und die aktuelle Runde. Exportiere vorher einen Stand, den du behalten möchtest."
                  : confirm === "stats"
                    ? "Lern- und Spielstatistiken, Merkliste und Tagesplan werden gelöscht. Die aktuelle Runde bleibt erhalten."
                    : confirm === "play"
                      ? "Die aktuelle Runde und Spielstatistiken werden gelöscht. Du startest wieder mit 1.000 €."
                      : "Der gesamte lokale Fortschritt und das Übungsspiel werden gelöscht."}
              </p>
              <div className="button-row">
                <button
                  className="secondary"
                  onClick={() => setConfirm(undefined)}
                >
                  Abbrechen
                </button>
                <button className="primary" onClick={commitReset}>
                  {confirm === "import"
                    ? "Spielstand übernehmen"
                    : "Zurücksetzen"}
                </button>
              </div>
            </div>
          )}
        </section>
        <section>
          <h3>Wiesbaden Rules · Arbeitsprofil</h3>
          <p>
            6 Decks · ENHC · S17 · Blackjack 3:2 · Hard Double 9–11 · Double
            nach Split · maximal 4 Hände · kein Surrender.
          </p>
          <p>
            Ass-Re-Split ist nicht eindeutig dokumentiert und hier deaktiviert.
            ENHC wird mit Verlust aller Split- und Double-Einsätze bei
            Dealer-Blackjack modelliert. Die Konzeptmatrix ist noch nicht mit
            einem Solver für exakt dieses Profil validiert.
          </p>
          <p>
            Der Kartenschuh wird zwischen Runden bei weniger als 100
            verbleibenden Karten neu gemischt. Das simuliert keine konkrete
            Wiesbadener Mischmaschine. Joker und Zusatzwetten sind nicht
            enthalten.
          </p>
          <a
            className="source-link"
            href="https://www.spielbank-wiesbaden.de/fileadmin/user_upload/Downloads/Spielerklaerungen/S-W_Homepage_Spielregeln_Black_Jack_25WEB.pdf"
            target="_blank"
            rel="noreferrer"
          >
            Offizielle Wiesbadener Spielregeln <ExternalLink size={13} />
          </a>
          <a
            className="source-link"
            href="https://www.blackjackinfo.com/blackjack_variation/european-blackjack/"
            target="_blank"
            rel="noreferrer"
          >
            ENHC-Regeln und Strategie-Hintergrund <ExternalLink size={13} />
          </a>
        </section>
        <section>
          <h3>Für deinen Home-Bildschirm</h3>
          <p>
            Über das Browsermenü installieren. Auf dem iPhone: Teilen → Zum
            Home-Bildschirm. Nach dem ersten vollständigen Laden funktioniert
            die App auch offline.
          </p>
          <p className="small muted">
            European Blackjack Trainer ist ein unabhängiges Lernprojekt ohne
            Verbindung zur Spielbank Wiesbaden. Ausschließlich virtuelles Geld.
            Karten und Gestaltung sind selbst erstellt.
          </p>
        </section>
        <button
          className="primary full-width"
          onClick={() => {
            setNotice("");
            onClose();
          }}
        >
          Zurück zum Training
        </button>
      </div>
    </Modal>
  );
}
