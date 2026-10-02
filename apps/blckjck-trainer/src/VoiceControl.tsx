import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { ACTION_LABEL, type Action } from "./core/strategy";
import {
  speechConstructor,
  voiceAlternatives,
  voiceError,
  type SpeechRecognizer,
} from "./core/voice";

interface Props {
  active: boolean;
  compact?: boolean;
  contextKey: string;
  allowed: readonly Action[];
  onAction: (action: Action) => void;
  onNext?: () => void;
  autoContinue?: boolean;
  onEnabledChange?: (enabled: boolean) => void;
}

export function VoiceControl(props: Props) {
  const [enabled, setEnabled] = useState(false);
  const [visible, setVisible] = useState(() => !document.hidden);
  const [listening, setListening] = useState(false);
  const [message, setMessage] = useState("");
  const latest = useRef(props);
  latest.current = props;
  const constructor = speechConstructor();
  const supported = !!constructor && window.isSecureContext;
  const ready = props.allowed.length > 0 || !!props.onNext;
  const available = props.allowed.join("") + (props.onNext ? ":next" : "");
  const running = enabled && props.active && visible && ready;

  useEffect(() => {
    props.onEnabledChange?.(enabled);
  }, [enabled, props.onEnabledChange]);

  useEffect(() => {
    const update = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => {
    if (!running || !constructor) {
      setListening(false);
      return;
    }
    let disposed = false;
    let fatal = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let current: SpeechRecognizer | undefined;
    const contextKey = props.contextKey;
    const usable = () =>
      !disposed &&
      !fatal &&
      !document.hidden &&
      latest.current.active &&
      latest.current.contextKey === contextKey &&
      !document.querySelector("dialog[open]");

    const start = () => {
      if (!usable()) return;
      const recognition = new constructor();
      current = recognition;
      let handled = false;
      let ended = false;
      const consumed = new Set<number>();
      const startedAt = performance.now();
      recognition.lang = "en-US";
      // Keep listening through silence and rejected utterances. Only a new
      // decision/pause replaces the context, so late audio cannot make a move.
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 5;
      recognition.onstart = () => {
        if (usable() && !ended) setListening(true);
      };
      recognition.onresult = (event) => {
        if (!usable() || handled || ended || current !== recognition) return;
        for (
          let index = event.resultIndex;
          index < event.results.length;
          index++
        ) {
          const result = event.results[index];
          if (!result?.isFinal || consumed.has(index)) continue;
          consumed.add(index);
          const alternatives = Array.from(result);
          const transcript = alternatives[0]?.transcript ?? "";
          const command = voiceAlternatives(
            alternatives.map((item) => item.transcript),
          );
          console.info("[BJ Voice]", {
            transcript,
            alternatives,
            language: recognition.lang,
            command: command ?? null,
            accepted:
              command === "next"
                ? !!latest.current.onNext
                : !!command && latest.current.allowed.includes(command),
          });
          if (command === "next" && latest.current.onNext) {
            handled = true;
            setMessage("Erkannt: Weiter");
            latest.current.onNext();
            return;
          } else if (
            command &&
            command !== "next" &&
            latest.current.allowed.includes(command)
          ) {
            handled = true;
            setMessage(`Erkannt: ${ACTION_LABEL[command]}`);
            latest.current.onAction(command);
            return;
          } else {
            setMessage(
              command
                ? "Diese Aktion ist gerade nicht verfügbar."
                : latest.current.autoContinue
                  ? "Bitte Card, Rest, Double oder Split sagen."
                  : "Bitte Card, Rest, Double, Split oder Next sagen.",
            );
          }
        }
      };
      recognition.onerror = ({ error }) => {
        if (disposed || ended) return;
        console.warn("[BJ Voice] recognition error", {
          error,
          language: recognition.lang,
          secureContext: window.isSecureContext,
        });
        if (error === "no-speech" || (error === "aborted" && handled)) return;
        fatal = true;
        setMessage(`${voiceError(error)} (${error})`);
        setEnabled(false);
        setListening(false);
      };
      recognition.onend = () => {
        if (disposed || ended) return;
        ended = true;
        setListening(false);
        // Browsers may still end a continuous session. Restart immediately
        // after a normal session; rate-limit only repeated immediate ends.
        if (usable())
          timer = setTimeout(
            start,
            Math.max(0, 250 - (performance.now() - startedAt)),
          );
      };
      try {
        recognition.start();
      } catch (error) {
        console.warn("[BJ Voice] start failed", error);
        fatal = true;
        setEnabled(false);
        setListening(false);
        setMessage(
          "Spracherkennung konnte nicht starten. Bitte erneut einschalten.",
        );
      }
    };
    start();
    return () => {
      disposed = true;
      clearTimeout(timer);
      if (current) {
        current.onstart =
          current.onresult =
          current.onerror =
          current.onend =
            null;
        current.abort();
      }
    };
  }, [running, props.contextKey, available, constructor]);

  return (
    <div className="voice-control">
      <button
        className="voice-toggle"
        aria-label={
          enabled
            ? "Sprachsteuerung ausschalten"
            : "Sprachsteuerung einschalten"
        }
        aria-pressed={enabled}
        disabled={!supported}
        onClick={() => {
          setMessage("");
          setEnabled((value) => !value);
        }}
      >
        {enabled ? <Mic size={16} /> : <MicOff size={16} />}
        Sprache {enabled ? "an" : "aus"}
      </button>
      <div className="voice-status" role="status">
        <span>
          {!supported
            ? !window.isSecureContext
              ? "Sprachsteuerung benötigt HTTPS (oder localhost)."
              : "Dieser Browser stellt keine Spracherkennung bereit."
            : enabled
              ? !running
                ? "Pausiert"
                : listening
                  ? "Hört zu …"
                  : "Mikrofon startet …"
              : props.compact
                ? ""
                : props.autoContinue
                  ? "Card · Rest · Double · Split"
                  : "Card · Rest · Double · Split · Next"}
        </span>
        {message && <small>{message}</small>}
      </div>
      <details className="voice-info">
        <summary>Info</summary>
        <p>
          Befehle: Card, Rest, Double, Split{!props.autoContinue && " und Next"}
          . Nur Training und Spielen. Einmal einschalten und die Aktion deutlich
          aussprechen. Die Erkennung ist auf Englisch eingestellt.{" "}
          {props.autoContinue
            ? "Bei eingeschalteter Sprache startet drei Sekunden nach dem Rundenergebnis automatisch die nächste Runde mit dem gewählten Einsatz. Zum Anhalten Sprache ausschalten."
            : "„Next“ bedeutet „Weiter“ und startet die nächste Hand."}{" "}
          Der Browser benötigt Mikrofonzugriff und kann Audio an seinen
          Spracherkennungsdienst senden; eine Internetverbindung kann
          erforderlich sein. Die App speichert keine Sprachaufnahmen. Erkannter
          Text und Befehlszuordnung erscheinen zur Fehlersuche unter „[BJ
          Voice]“ in der Browserkonsole. In anderen Tabs, Dialogen und während
          des Austeilens pausiert die Erkennung.
        </p>
        <p>
          Safari auf dem iPhone: Siri in den iOS-Einstellungen aktivieren und
          den Mikrofonzugriff für die Website erlauben. Die Seite über HTTPS
          öffnen; eine lokale HTTP-Adresse im WLAN reicht nicht. Fehlt die
          Sprachschnittstelle im Browser, kann die App sie nicht einschalten.
        </p>
      </details>
    </div>
  );
}
