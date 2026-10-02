import type { Action } from "./strategy";

export type VoiceCommand = Action | "next";

export function voiceCommand(transcript: string): VoiceCommand | undefined {
  const phrase = transcript
    .toLowerCase()
    .trim()
    .replace(/[.!?,;:]+$/g, "")
    .replace(/\s+/g, " ");
  const commands: Record<string, VoiceCommand> = {
    card: "H",
    karte: "H",
    "karte ziehen": "H",
    rest: "S",
    double: "D",
    split: "P",
    weiter: "next",
    next: "next",
    continue: "next",
  };
  return Object.hasOwn(commands, phrase) ? commands[phrase] : undefined;
}

export interface SpeechResultEvent {
  resultIndex: number;
  results: ArrayLike<{
    isFinal: boolean;
    [index: number]: { transcript: string };
  }>;
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
    case "service-not-allowed":
      return "Mikrofonzugriff nicht erlaubt. Bitte in den Browser-Einstellungen freigeben.";
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
