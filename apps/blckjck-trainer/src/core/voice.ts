import type { Action } from "./strategy";

export type VoiceCommand = Action | "next";

function normalizeTranscript(transcript: string): string {
  return transcript
    .toLowerCase()
    .trim()
    .replace(/[.!?,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function voiceCommand(transcript: string): VoiceCommand | undefined {
  const phrase = normalizeTranscript(transcript);
  const commands: Record<string, VoiceCommand> = {
    card: "H",
    // Observed en-US transcriptions of the spoken casino command "Card".
    cart: "H",
    caught: "H",
    called: "H",
    call: "H",
    carrot: "H",
    account: "H",
    karte: "H",
    "karte ziehen": "H",
    rest: "S",
    double: "D",
    split: "P",
    weiter: "next",
    next: "next",
    continue: "next",
  };
  const lookup = (word: string) =>
    Object.hasOwn(commands, word) ? commands[word] : undefined;
  const exact = lookup(phrase);
  if (exact) return exact;
  // A repeated command ("Card, cart") is one move. Mixed commands and
  // arbitrary sentences are never reduced to a word contained in them.
  const words = phrase.split(" ");
  const repeated = lookup(words[0]);
  return repeated && words.every((word) => lookup(word) === repeated)
    ? repeated
    : undefined;
}

export function voiceAlternatives(
  transcripts: readonly string[],
): VoiceCommand | undefined {
  const primary = normalizeTranscript(transcripts[0] ?? "");
  // Do not reinterpret sentences/negations using a lower-ranked alternative.
  if (!primary || (!voiceCommand(primary) && /\s/.test(primary)))
    return undefined;
  const matches = new Set(transcripts.map(voiceCommand).filter(Boolean));
  return matches.size === 1 ? [...matches][0] : undefined;
}

export interface SpeechResult extends ArrayLike<{
  transcript: string;
  confidence?: number;
}> {
  isFinal: boolean;
}

export interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}

export interface SpeechRecognizer {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onstart: (() => void) | null;
  onresult: ((event: SpeechResultEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  abort(): void;
}

export type SpeechConstructor = new () => SpeechRecognizer;

export function speechConstructor(): SpeechConstructor | undefined {
  const browser = window as unknown as {
    SpeechRecognition?: SpeechConstructor;
    webkitSpeechRecognition?: SpeechConstructor;
  };
  return browser.SpeechRecognition ?? browser.webkitSpeechRecognition;
}

export function voiceError(error: string): string {
  switch (error) {
    case "not-allowed":
      return "Mikrofonzugriff nicht erlaubt. Bitte in den Browser-Einstellungen freigeben.";
    case "service-not-allowed":
      return "Spracherkennungsdienst nicht verfügbar oder nicht erlaubt. In Safari bitte prüfen, ob Siri aktiviert ist.";
    case "audio-capture":
      return "Kein verfügbares Mikrofon gefunden.";
    case "network":
      return "Spracherkennung nicht erreichbar. Bitte Verbindung prüfen und erneut einschalten.";
    case "language-not-supported":
      return "Dieser Browser unterstützt die benötigte Spracherkennung nicht.";
    default:
      return "Spracherkennung beendet. Du kannst sie erneut einschalten.";
  }
}
