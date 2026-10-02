import { test, expect, type Page } from "@playwright/test";
import {
  freshState,
  parseBackup,
  STORAGE_KEY,
  type AppState,
} from "../src/core/storage";
import { deal, newGame, type Game } from "../src/core/engine";
import type { Rank } from "../src/core/cards";
import { markUncertain } from "../src/core/training";

function fixture(ranks: Rank[]): Game {
  const game = newGame(() => 0.3);
  const upcoming = ranks.map(
    (rank) =>
      game.shoe.splice(
        game.shoe.findIndex((c) => c.rank === rank),
        1,
      )[0],
  );
  game.shoe.push(...upcoming.reverse());
  return deal(game, 10);
}
async function seed(page: Page, state: AppState) {
  await page.addInitScript(
    ({ key, state }) => {
      if (!localStorage.getItem(key))
        localStorage.setItem(key, JSON.stringify(state));
    },
    { key: STORAGE_KEY, state },
  );
}
async function saved(page: Page): Promise<AppState> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE_KEY,
  );
}
async function nav(page: Page, tab: string) {
  await page.locator(`nav:visible a[href="#${tab}"]`).click();
}
test("initial cards and all actions fit above the mobile navigation", async ({
  page,
}, info) => {
  await page.goto("./");
  const actions = await page
    .locator(".training-panel .action-grid")
    .boundingBox();
  const navigation =
    info.project.name === "mobile"
      ? await page.locator(".mobile-nav").boundingBox()
      : null;
  expect(actions!.y + actions!.height).toBeLessThan(navigation?.y ?? 1000);
  await page.screenshot({
    path: `test-results/first-screen-${info.project.name}.png`,
  });
});
test("auto-advance, uncertain drill exit and keyboard shortcuts work", async ({
  page,
}) => {
  await page.goto("./");
  await page.keyboard.press("u");
  await page.keyboard.press("s");
  await expect(
    page.getByRole("button", { name: "Nächste Hand" }),
  ).toBeVisible();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("button", { name: "Nächste Hand" })).toHaveCount(
    0,
  );
  await page.getByRole("tab", { name: /^Unsicher/ }).click();
  await expect(page.locator(".difficult-row")).toHaveCount(1);
  await page.getByRole("button", { name: /gegen .* trainieren/ }).click();
  await expect(page.getByText("GEZIELTER DRILL")).toBeVisible();
  await page.getByRole("tab", { name: "Üben", exact: true }).click();
  await expect(page.getByText("GEZIELTER DRILL")).toHaveCount(0);
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await page.getByLabel("Automatisch nächste Trainingshand").check();
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "Rest – Stehen bleiben" }).click();
  await expect(
    page.getByRole("button", { name: "Nächste Hand" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Nächste Hand" })).toHaveCount(
    0,
    { timeout: 4000 },
  );
});
test("training marks without hints, counts answers once, and persists across reload", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("./");
  await expect(
    page.getByRole("heading", { name: "Gute Entscheidungen." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Bin unsicher" }).click();
  await expect(
    page.getByText("Gemerkt. Entscheide dich trotzdem selbst."),
  ).toBeVisible();
  expect(Object.keys((await saved(page)).training.difficult)).toHaveLength(1);
  expect(Object.keys((await saved(page)).training.decisions)).toHaveLength(0);
  await page.getByRole("button", { name: "Rest – Stehen bleiben" }).click();
  await expect(
    page.getByRole("button", { name: "Nächste Hand" }),
  ).toBeVisible();
  const before = await saved(page);
  expect(Object.values(before.training.decisions)[0].seen).toBe(1);
  await page.reload();
  expect((await saved(page)).training).toEqual(before.training);
  await page.screenshot({
    path: `test-results/training-${info.project.name}.png`,
    fullPage: true,
  });
  await nav(page, "stats");
  await expect(page.getByText("Wie sicher ist dein Wissen?")).toBeVisible();
  expect(errors).toEqual([]);
});
test("all pages and light theme fit narrow screens; strategy cells are inspectable", async ({
  page,
}, info) => {
  await page.goto("./");
  await page.getByRole("tab", { name: "Lernen", exact: true }).click();
  await page.getByLabel("Handgruppe").selectOption("traps");
  await expect(page.getByText("Achtung, europäische Regeln.")).toBeVisible();
  await nav(page, "strategy");
  await page.getByRole("button", { name: "Paare", exact: true }).click();
  await page
    .getByRole("button", { name: "8, 8 gegen 10: Card", exact: true })
    .click();
  await expect(
    page.getByText(/8, 8 gegen 10: Card. ENHC-Ausnahme/),
  ).toBeVisible();
  await page.getByLabel("Lernstand", { exact: true }).check();
  for (const tab of ["train", "play", "strategy", "stats"]) {
    await nav(page, tab);
    if (info.project.name === "mobile")
      await page.setViewportSize({ width: 320, height: 740 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await page.getByLabel("Erscheinungsbild").selectOption("light");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await nav(page, "strategy");
  await page.screenshot({
    path: `test-results/strategy-light-${info.project.name}.png`,
    fullPage: true,
  });
});
test("play warning preserves original intent and resumes exactly after reload", async ({
  page,
}, info) => {
  const state = freshState();
  state.game = fixture(["8", "K", "8", "2", "A"]);
  await seed(page, state);
  await page.goto("./#play");
  await page.getByRole("button", { name: "Bin unsicher" }).click();
  await page.getByRole("button", { name: "Split – Teilen" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect((await saved(page)).game.bankroll).toBe(990);
  await page.getByRole("button", { name: "Card übernehmen" }).click();
  const progressed = await saved(page);
  expect(progressed.freePlay).toMatchObject({
    correct: 0,
    wrong: 1,
    adherence: 1,
    warnings: 1,
    accepted: 1,
  });
  expect(progressed.freePlay.history[0]).toMatchObject({
    attempted: "P",
    recommended: "H",
    executed: "H",
    unsure: true,
  });
  expect(progressed.game.hands[0].cards).toHaveLength(3);
  await page.reload();
  expect((await saved(page)).game).toEqual(progressed.game);
  await page.screenshot({
    path: `test-results/play-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Rest – Stehen bleiben" }).click();
  await expect(page.getByText("RUNDE ABGESCHLOSSEN")).toBeVisible();
  expect((await saved(page)).game.bankroll).toBe(990);
  expect((await saved(page)).freePlay.rounds).toBe(1);
});
test("after-action and disabled warnings execute immediately; insurance settles correctly", async ({
  page,
}) => {
  const state = freshState();
  state.settings.strategyWarnings = "after";
  state.game = fixture(["10", "6", "6", "2", "K", "4"]);
  await seed(page, state);
  await page.goto("./#play");
  await page.getByRole("button", { name: "Card – Karte ziehen" }).click();
  await expect(page.getByText(/Deine letzte Entscheidung: Card/)).toBeVisible();
  expect((await saved(page)).game.hands[0].cards).toHaveLength(3);
  expect((await saved(page)).freePlay.wrong).toBe(1);
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await page.getByLabel("Strategiehinweise im Spiel").selectOption("disabled");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await page.getByRole("button", { name: "Card – Karte ziehen" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await saved(page)).freePlay.wrong).toBe(2);
  const insurance = freshState();
  insurance.game = fixture(["10", "A", "8", "K"]);
  await page.evaluate(
    ({ key, state }) => localStorage.setItem(key, JSON.stringify(state)),
    { key: STORAGE_KEY, state: insurance },
  );
  await page.reload();
  await page.getByRole("button", { name: "Versichern", exact: true }).click();
  await page.getByRole("button", { name: "Rest – Stehen bleiben" }).click();
  await expect(page.getByText("RUNDE ABGESCHLOSSEN")).toBeVisible();
  expect((await saved(page)).game.bankroll).toBe(1000);
});
test("export, validated import, and cancelled reset retain progress", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Bin unsicher" }).click();
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "JSON exportieren" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/^blackjack-trainer-/);
  const fs = await import("node:fs/promises");
  const backup = parseBackup(
    await fs.readFile((await download.path())!, "utf8"),
  );
  expect(Object.keys(backup.training.difficult)).toHaveLength(1);
  await page
    .getByRole("button", { name: "Alles zurücksetzen", exact: true })
    .click();
  await page.getByRole("button", { name: "Abbrechen", exact: true }).click();
  expect(Object.keys((await saved(page)).training.difficult)).toHaveLength(1);
  await page.getByLabel("Backup-Datei importieren").setInputFiles({
    name: "bad.json",
    mimeType: "application/json",
    buffer: Buffer.from('{"schemaVersion":99}'),
  });
  await expect(page.getByRole("alert")).toContainText("kein gültiges");
  expect(Object.keys((await saved(page)).training.difficult)).toHaveLength(1);
  backup.game.bankroll = 1230;
  await page.getByLabel("Backup-Datei importieren").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page
    .getByRole("button", { name: "Spielstand übernehmen", exact: true })
    .click();
  expect((await saved(page)).game.bankroll).toBe(1230);
});
test("full training hand evaluates each move, hides sums, and leaves the free-play bank alone", async ({
  page,
}, info) => {
  const state = freshState();
  state.settings.playFullHands = true;
  state.settings.showHandTotals = false;
  state.training = markUncertain(state.training, "hard-5-vs-6");
  await seed(page, state);
  await page.goto("./");
  await page.getByRole("tab", { name: /^Unsicher/ }).click();
  await expect(
    page.getByRole("switch", { name: "Hand zu Ende spielen", exact: true }),
  ).toBeChecked();
  await expect(page.locator(".training-table .total-badge")).toHaveCount(0);
  await page.getByRole("button", { name: "Card – Karte ziehen" }).click();
  await expect(page.locator(".trainer-hand .playing-card")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Hand weiterspielen" }),
  ).toBeVisible();
  expect((await saved(page)).training.decisions["hard-5-vs-6"].seen).toBe(1);
  await page.getByRole("button", { name: "Hand weiterspielen" }).click();
  await expect(
    page.getByRole("button", { name: "Double – Verdoppeln" }),
  ).toBeDisabled();
  await page.getByText("Warum ist Double gesperrt?").click();
  await expect(
    page.getByText(/Nach Card ist Double nicht mehr möglich/),
  ).toBeVisible();
  await page.getByRole("button", { name: "Rest – Stehen bleiben" }).click();
  await expect(page.getByText("Trainingsrunde beendet.")).toBeVisible();
  await expect(page.locator(".training-table .total-badge")).toHaveCount(0);
  const result = await saved(page);
  expect(
    Object.values(result.training.decisions).reduce((n, s) => n + s.seen, 0),
  ).toBe(2);
  expect(result.game.bankroll).toBe(1000);
  expect(result.freePlay.rounds).toBe(0);
  await page.screenshot({
    path: `test-results/full-hand-${info.project.name}.png`,
    fullPage: true,
  });
  await page
    .getByRole("switch", { name: "Handsumme anzeigen", exact: true })
    .check();
  await expect(page.locator(".training-table .total-badge")).toHaveCount(2);
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Hand zu Ende spielen", exact: true }),
  ).toBeChecked();
});
test("trainer splits play out both hands and casino test stays in single-decision mode", async ({
  page,
}) => {
  const state = freshState();
  state.settings.playFullHands = true;
  state.training = markUncertain(state.training, "pair-88-vs-6");
  await seed(page, state);
  await page.goto("./");
  await page.getByRole("tab", { name: /^Unsicher/ }).click();
  await page.getByRole("button", { name: "Split – Teilen" }).click();
  await expect(page.locator(".trainer-hand")).toHaveCount(2);
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Hand weiterspielen" }).click();
    await page.getByRole("button", { name: "Rest – Stehen bleiben" }).click();
  }
  await expect(page.getByText("Trainingsrunde beendet.")).toBeVisible();
  expect((await saved(page)).sessions[0].total).toBe(3);
  await page.getByRole("tab", { name: "Casino-Test" }).click();
  await expect(
    page.getByRole("switch", { name: "Hand zu Ende spielen", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("switch", { name: "Hand zu Ende spielen", exact: true }),
  ).not.toBeChecked();
  await page.getByRole("tab", { name: "Üben", exact: true }).click();
  await expect(
    page.getByRole("switch", { name: "Hand zu Ende spielen", exact: true }),
  ).toBeChecked();
});
test("sums switch also hides dealer and player totals in free play and survives reload", async ({
  page,
}) => {
  const state = freshState();
  state.settings.showHandTotals = false;
  state.game = fixture(["10", "6", "8", "10", "2"]);
  await seed(page, state);
  await page.goto("./#play");
  await expect(page.locator(".casino-table .total-badge")).toHaveCount(0);
  await page.getByRole("button", { name: "Rest – Stehen bleiben" }).click();
  await expect(page.getByText("RUNDE ABGESCHLOSSEN")).toBeVisible();
  await expect(page.locator(".casino-table .total-badge")).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Handsumme anzeigen", exact: true }),
  ).not.toBeChecked();
  await page
    .getByRole("switch", { name: "Handsumme anzeigen", exact: true })
    .check();
  await expect(page.locator(".casino-table .total-badge")).toHaveCount(2);
});
test("cards deal sequentially, inputs wait for the flight, and hit adds one animated card", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page.clock.install({ time: new Date("2026-09-28T12:00:00Z") });
  await page.clock.pauseAt(new Date("2026-09-28T12:00:01Z"));
  const state = freshState();
  state.game = fixture(["8", "K", "8", "2", "7"]);
  await seed(page, state);
  await page.goto("./#play");
  const table = page.locator(".casino-table");
  await expect(table).toHaveAttribute("aria-busy", "true");
  await expect(
    page.getByRole("button", { name: "Card – Karte ziehen" }),
  ).toBeDisabled();
  await page.clock.runFor(20);
  await expect(table.getByRole("img")).toHaveCount(1);
  await page.clock.runFor(150);
  await expect(table.getByRole("img")).toHaveCount(2);
  await page.clock.runFor(150);
  await expect(table.getByRole("img")).toHaveCount(3);
  await expect(
    page.getByRole("button", { name: "Card – Karte ziehen" }),
  ).toBeDisabled();
  await page.clock.runFor(300);
  await expect(
    page.getByRole("button", { name: "Card – Karte ziehen" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Card – Karte ziehen" }).click();
  await expect(table).toHaveAttribute("aria-busy", "true");
  await page.clock.runFor(20);
  await expect(table.getByRole("img")).toHaveCount(4);
  expect(
    await table
      .getByRole("img")
      .last()
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("card-deal");
  await page.clock.runFor(300);
  await expect(table).toHaveAttribute("aria-busy", "false");
});
test("casino test hides all correctness feedback until the 100th decision", async ({
  page,
}) => {
  await page.goto("./");
  await page.getByRole("tab", { name: "Casino-Test" }).click();
  for (let i = 0; i < 100; i++) {
    await page.getByRole("button", { name: "Rest – Stehen bleiben" }).click();
    if (i < 99) {
      await expect(page.getByText("Entscheidung gespeichert.")).toBeVisible();
      await expect(
        page.getByText("Richtig entschieden.", { exact: true }),
      ).toHaveCount(0);
      await page.getByRole("button", { name: "Weiter", exact: true }).click();
    }
  }
  await expect(
    page.getByText("100 ENTSCHEIDUNGEN · DEIN ERGEBNIS"),
  ).toBeVisible();
  expect((await saved(page)).sessions[0].total).toBe(100);
});
test("installed service worker supports a complete offline reload", async ({
  page,
  context,
}) => {
  await page.goto("./");
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
  await context.setOffline(true);
  await page.reload();
  await expect(
    page.getByRole("heading", { name: "Gute Entscheidungen." }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Rest – Stehen bleiben" }).click();
  await expect(
    page.getByRole("button", { name: "Nächste Hand" }),
  ).toBeVisible();
  await nav(page, "play");
  await page.getByRole("button", { name: "Karten geben" }).click();
  expect((await saved(page)).game.round).toBe(1);
});
