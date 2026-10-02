import { useEffect, useRef, useState } from "react";
import { Mic, MicOff } from "lucide-react";
import { ACTION_LABEL, type Action } from "./core/strategy";
import {
  speechConstructor,
  voiceCommand,
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
      recognition.lang = "en-US";
      // One utterance per instance: duplicate final results cannot become a
      // second move, and each new decision gets a fresh recognition context.
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;
      recognition.onstart = () => {
        if (usable() && !ended) setListening(true);
      };
      recognition.onresult = (event) => {
        if (!usable() || handled || ended || current !== recognition) return;
        const result = event.results[event.resultIndex];
        if (!result?.isFinal) return;
        handled = true;
        const transcript = result[0]?.transcript ?? "";
        const command = voiceCommand(transcript);
        console.info("[BJ Voice]", {
          transcript,
          language: recognition.lang,
          command: command ?? null,
          accepted:
            command === "next"
              ? !!latest.current.onNext
              : !!command && latest.current.allowed.includes(command),
        });
        if (command === "next" && latest.current.onNext) {
          setMessage("Erkannt: Weiter");
          latest.current.onNext();
        } else if (
          command &&
          command !== "next" &&
          latest.current.allowed.includes(command)
        ) {
          setMessage(`Erkannt: ${ACTION_LABEL[command]}`);
          latest.current.onAction(command);
        } else {
          setMessage(
            command
              ? "Diese Aktion ist gerade nicht verfügbar."
              : latest.current.autoContinue
                ? "Bitte Card, Rest, Double oder Split sagen."
                : "Bitte Card, Rest, Double, Split oder Next sagen.",
          );
        }
        // Flush the utterance even if the browser has not emitted end yet.
        recognition.abort();
      };
      recognition.onerror = ({ error }) => {
        if (disposed || ended) return;
        if (error === "no-speech" || (error === "aborted" && handled)) return;
        fatal = true;
        setMessage(voiceError(error));
        setEnabled(false);
        setListening(false);
      };
      recognition.onend = () => {
        if (disposed || ended) return;
        ended = true;
        setListening(false);
        if (usable()) timer = setTimeout(start, 350);
      };
      try {
        recognition.start();
      } catch {
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
            ? "Spracherkennung hier nicht verfügbar."
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
      </details>
    </div>
  );
}
