import { expect, it } from "vitest";
import { voiceAlternatives, voiceCommand, voiceError } from "./voice";

it("accepts isolated commands and ignores ambiguous phrases", () => {
  expect(
    [
      "Card",
      " Rest. ",
      "DOUBLE!",
      "split",
      "Weiter",
      "next",
      "Karte ziehen",
    ].map(voiceCommand),
  ).toEqual(["H", "S", "D", "P", "next", "next", "H"]);
  for (const phrase of [
    "discard",
    "restaurant",
    "card rest",
    "don't split",
    "",
    "constructor",
    "weiter card",
  ])
    expect(voiceCommand(phrase)).toBeUndefined();
});

it("maps observed Card transcriptions and repeated commands to one action", () => {
  for (const phrase of [
    "Called.",
    "Account.",
    "Caught.",
    "Cart.",
    "Carrot.",
    "Call.",
    "Card cart.",
    "Card, card!",
  ])
    expect(voiceCommand(phrase)).toBe("H");
  for (const phrase of [
    "Next. Card.",
    "call rest",
    "my account",
    "don't call",
    "card please",
    "credit card",
  ])
    expect(voiceCommand(phrase)).toBeUndefined();
});

it("uses consistent recognition alternatives without guessing between actions", () => {
  expect(voiceAlternatives(["Cot.", "Card."])).toBe("H");
  expect(voiceAlternatives(["Caught.", "Card."])).toBe("H");
  expect(voiceAlternatives(["Rest.", "Card."])).toBeUndefined();
  expect(voiceAlternatives(["don't split", "split"])).toBeUndefined();
  expect(voiceAlternatives(["card rest", "card"])).toBeUndefined();
  expect(voiceAlternatives(["Next.Card.", "card"])).toBeUndefined();
  expect(voiceAlternatives(["", "card"])).toBeUndefined();
  expect(voiceAlternatives(["hello", "world"])).toBeUndefined();
  expect(voiceAlternatives([])).toBeUndefined();
});

it("distinguishes microphone permission from an unavailable speech service", () => {
  expect(voiceError("not-allowed")).toContain("Mikrofonzugriff");
  expect(voiceError("service-not-allowed")).toContain("Siri");
});
