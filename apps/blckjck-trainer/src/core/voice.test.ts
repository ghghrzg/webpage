import { expect, it } from "vitest";
import { voiceCommand } from "./voice";

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
