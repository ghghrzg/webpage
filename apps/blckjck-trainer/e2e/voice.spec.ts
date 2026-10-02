import { test, expect, type Page } from "@playwright/test";
import { freshState, STORAGE_KEY, type AppState } from "../src/core/storage";
import { markUncertain } from "../src/core/training";
import { deal, newGame } from "../src/core/engine";

async function setup(page: Page, state: AppState) {
  await page.addInitScript(
    ({ key, state }) => {
      localStorage.setItem(key, JSON.stringify(state));
      const instances: any[] = [];
      class Recognition {
        running = false;
        onstart: any;
        onresult: any;
        onend: any;
        onerror: any;
        constructor() {
          instances.push(this);
        }
        start() {
          this.running = true;
          queueMicrotask(() => {
            if (this.running) this.onstart?.();
          });
        }
        abort() {
          this.running = false;
          queueMicrotask(() => this.onend?.());
        }
      }
      (window as any).SpeechRecognition = Recognition;
      (window as any).__speech = instances;
    },
    { key: STORAGE_KEY, state },
  );
}
async function running(page: Page) {
  return page.evaluate(
    () => (window as any).__speech.filter((item: any) => item.running).length,
  );
}
async function speak(page: Page, transcript: string, final = true) {
  await expect.poll(() => running(page)).toBe(1);
  await page.evaluate(
    ({ transcript, final }) => {
      const instance = (window as any).__speech.findLast(
        (item: any) => item.running,
      );
      const handler = instance.onresult;
      const event = {
        resultIndex: 0,
        results: [{ isFinal: final, 0: { transcript } }],
      };
      (window as any).__lateResult = () => handler(event);
      handler(event);
      handler(event); // Some engines repeat final results: count only once.
    },
    { transcript, final },
  );
}
async function saved(page: Page): Promise<AppState> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE_KEY,
  );
}
const mic = (page: Page) => page.locator(".voice-control:visible");

test("voice training ignores interim and stale results, continues hands and pauses outside training", async ({
  page,
}) => {
  const state = freshState();
  state.settings.playFullHands = true;
  state.settings.autoAdvance = false;
  state.training = markUncertain(state.training, "hard-5-vs-6");
  await setup(page, state);
  await page.goto("./");
  await page.getByRole("tab", { name: /^Unsicher/ }).click();
  expect(await running(page)).toBe(0);
  await mic(page)
    .getByRole("button", { name: "Sprachsteuerung einschalten" })
    .click();
  await speak(page, "card", false);
  expect((await saved(page)).training.decisions).toEqual({});
  await speak(page, "double"); // Not legal for hard 5.
  expect((await saved(page)).training.decisions).toEqual({});
  await speak(page, "card");
  await expect(page.locator(".trainer-hand .playing-card")).toHaveCount(3);
  expect((await saved(page)).training.decisions["hard-5-vs-6"].seen).toBe(1);
  await expect(
    page.getByRole("button", { name: "Hand weiterspielen" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Card – Karte ziehen" }),
  ).toBeEnabled();
  await page.evaluate(() => (window as any).__lateResult());
  expect((await saved(page)).sessions[0].total).toBe(1);
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await expect.poll(() => running(page)).toBe(0);
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect.poll(() => running(page)).toBe(1);
  await page.locator('nav:visible a[href="#ranges"]').click();
  await expect(page.locator(".voice-control:visible")).toHaveCount(0);
  await expect.poll(() => running(page)).toBe(0);
  await page.locator('nav:visible a[href="#train"]').click();
  await speak(page, "rest");
  await expect(page.getByText("Trainingsrunde beendet.")).toBeVisible();
  expect((await saved(page)).sessions[0].total).toBe(2);
  await expect(
    page.getByRole("button", { name: "Nächste Hand" }),
  ).toBeVisible();
  await mic(page)
    .getByRole("button", { name: "Sprachsteuerung ausschalten" })
    .click();
  await expect.poll(() => running(page)).toBe(0);
});

test("voice play rejects next and automatically continues after three seconds unless switched off", async ({
  page,
}) => {
  const state = freshState();
  const game = newGame(() => 0.3);
  const upcoming = ["10", "6", "6"].map(
    (rank) =>
      game.shoe.splice(
        game.shoe.findIndex((card) => card.rank === rank),
        1,
      )[0],
  );
  game.shoe.push(...upcoming.reverse());
  state.game = deal(game, 10);
  await setup(page, state);
  await page.goto("./#play");
  await mic(page)
    .getByRole("button", { name: "Sprachsteuerung einschalten" })
    .click();
  await expect(mic(page)).not.toContainText("Next");
  await speak(page, "next");
  expect((await saved(page)).game.round).toBe(1);
  expect((await saved(page)).freePlay.history).toHaveLength(0);
  await speak(page, "card");
  await expect(page.getByRole("dialog")).toBeVisible();
  expect((await saved(page)).freePlay.history).toHaveLength(0);
  await expect.poll(() => running(page)).toBe(0);
  await page.evaluate(() => (window as any).__lateResult());
  expect((await saved(page)).freePlay.history).toHaveLength(0);
  await page.getByRole("button", { name: "Rest übernehmen" }).click();
  expect((await saved(page)).freePlay.history).toHaveLength(1);
  await expect(
    page.getByRole("button", { name: "Nächste Runde automatisch nach 3 s" }),
  ).toBeVisible();
  await expect.poll(() => running(page)).toBe(0);
  await mic(page)
    .getByRole("button", { name: "Sprachsteuerung ausschalten" })
    .click();
  await page.waitForTimeout(3200);
  expect((await saved(page)).game.round).toBe(1);
  await mic(page)
    .getByRole("button", { name: "Sprachsteuerung einschalten" })
    .click();
  await page.waitForTimeout(1000);
  expect((await saved(page)).game.round).toBe(1);
  await expect.poll(async () => (await saved(page)).game.round).toBe(2);
});

test("permission failures stop retries and unsupported browsers keep manual controls", async ({
  page,
}) => {
  await setup(page, freshState());
  await page.goto("./");
  await mic(page)
    .getByRole("button", { name: "Sprachsteuerung einschalten" })
    .click();
  await expect.poll(() => running(page)).toBe(1);
  await page.evaluate(() =>
    (window as any).__speech
      .findLast((item: any) => item.running)
      .onerror({ error: "not-allowed" }),
  );
  await expect(mic(page)).toContainText("Mikrofonzugriff nicht erlaubt");
  await expect.poll(() => running(page)).toBe(0);
  await expect(
    mic(page).getByRole("button", { name: "Sprachsteuerung einschalten" }),
  ).toBeVisible();
  await page.addInitScript(() => {
    (window as any).SpeechRecognition = undefined;
    (window as any).webkitSpeechRecognition = undefined;
  });
  await page.reload();
  await expect(
    mic(page).getByRole("button", { name: "Sprachsteuerung einschalten" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Rest – Stehen bleiben" }).click();
  await expect(
    page.getByRole("button", { name: "Nächste Hand" }),
  ).toBeVisible();
});
