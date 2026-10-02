import { test, expect, type Page } from "@playwright/test";
import { STORAGE_KEY, type AppState } from "../src/core/storage";
import { STRATEGY_RANGES } from "../src/core/strategyRanges";
import { ACTION_LABEL, type Action } from "../src/core/strategy";

const cards = (page: Page) => page.locator(".range-card");
const select = (page: Page, action: Action) =>
  page
    .getByRole("button", {
      name: `${ACTION_LABEL[action]} auswählen`,
      exact: true,
    })
    .click();
const undo = (page: Page) =>
  page.getByRole("button", { name: "Undo – letzte Markierung rückgängig" });
async function saved(page: Page): Promise<AppState> {
  return page.evaluate(
    (key) => JSON.parse(localStorage.getItem(key)!),
    STORAGE_KEY,
  );
}
async function nav(page: Page, tab: string) {
  await page.locator(`nav:visible a[href="#${tab}"]`).click();
}
async function swipeRow(page: Page, touch: boolean) {
  const first = (await cards(page).nth(0).boundingBox())!;
  const last = (await cards(page).nth(4).boundingBox())!;
  const start = { x: first.x + first.width / 2, y: first.y + first.height / 2 };
  const end = { x: last.x + last.width / 2, y: last.y + last.height / 2 };
  if (touch) {
    const session = await page.context().newCDPSession(page);
    await session.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [start],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [end],
    });
    await session.send("Input.dispatchTouchEvent", {
      type: "touchEnd",
      touchPoints: [],
    });
    await session.detach();
  } else {
    await page.mouse.move(start.x, start.y);
    await page.mouse.down();
    // One event intentionally jumps over the middle cards.
    await page.mouse.move(end.x, end.y, { steps: 1 });
    await page.mouse.up();
  }
}

test("ranges support taps, fast swipes, grouped undo, correction and persisted category attempts", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  if (info.project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("./#ranges");
  await expect(
    page.getByRole("heading", { name: "Strategy-Ranges." }),
  ).toBeVisible();
  const label = await page.locator(".ranges-category").innerText();
  const current = STRATEGY_RANGES.find((range) => range.label === label)!;
  expect(current).toBeTruthy();
  await expect(
    page.getByRole("button", { name: "Prüfen", exact: true }),
  ).toBeDisabled();
  await expect(undo(page)).toBeDisabled();
  await expect(cards(page)).toHaveCount(10);
  await expect(page.locator(".ranges-rule")).toHaveCount(0);

  await cards(page).nth(0).click();
  await select(page, "S");
  await cards(page).nth(0).click();
  await expect(cards(page).nth(0)).toHaveAccessibleName("Dealer 2: Rest");
  await undo(page).click();
  await expect(cards(page).nth(0)).toHaveAccessibleName("Dealer 2: Card");
  await undo(page).click();
  await expect(page.getByText("0/10 markiert", { exact: true })).toBeVisible();

  await select(page, "P");
  const scrollBefore = await page.evaluate(() => scrollY);
  await swipeRow(page, info.project.name === "mobile");
  await expect(page.getByText("5/10 markiert", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => scrollY)).toBe(scrollBefore);
  await undo(page).click();
  await expect(page.getByText("0/10 markiert", { exact: true })).toBeVisible();
  await swipeRow(page, info.project.name === "mobile");
  await select(page, "H");
  await page.getByRole("button", { name: "Offene", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Prüfen", exact: true }),
  ).toBeEnabled();
  await undo(page).click();
  await expect(page.getByText("5/10 markiert", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Offene", exact: true }).click();
  await select(page, "S");
  await page.getByRole("button", { name: "Alles", exact: true }).click();
  await expect(cards(page).filter({ hasText: "S" })).toHaveCount(10);
  await undo(page).click();
  await expect(cards(page).nth(0)).toHaveAccessibleName("Dealer 2: Split");
  await expect(cards(page).nth(9)).toHaveAccessibleName("Dealer A: Card");

  const lastWrong = current.answers[9] === "H" ? "S" : "H";
  await select(page, lastWrong);
  await cards(page).nth(9).click();
  const answers: Action[] = [
    "P",
    "P",
    "P",
    "P",
    "P",
    "H",
    "H",
    "H",
    "H",
    lastWrong,
  ];
  const correct = answers.filter(
    (answer, index) => current.answers[index] === answer,
  ).length;
  await page.getByRole("button", { name: "Prüfen", exact: true }).click();
  await expect(
    page.getByText(`${correct}/10 richtig`, { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".range-wrong")).toHaveCount(10 - correct);
  await expect(page.locator(".range-correct")).toHaveCount(correct);
  await expect(cards(page).nth(9)).toHaveAccessibleName(
    new RegExp(`falsch. Richtig: ${ACTION_LABEL[current.answers[9]]}`),
  );
  await expect(cards(page).nth(9).locator(".range-correction")).toHaveText(
    `→ ${current.answers[9]}`,
  );
  await expect(page.locator(".ranges-actions")).toBeHidden();
  for (const card of await cards(page).all()) await expect(card).toBeDisabled();
  const resultBox = (await page.locator(".ranges-dock-result").boundingBox())!;
  const resultDock = (await page.locator(".ranges-dock").boundingBox())!;
  expect(resultBox.y).toBeGreaterThanOrEqual(0);
  expect(resultBox.y + resultBox.height).toBeLessThanOrEqual(
    resultDock.y + resultDock.height,
  );
  await page.screenshot({
    path: `test-results/ranges-feedback-${info.project.name}.png`,
    fullPage: true,
  });
  const before = await saved(page);
  expect(before.strategyRanges[current.id]).toMatchObject({
    attempts: 1,
    perfect: 0,
    mistakes: 10 - correct,
  });
  expect(before.training.decisions).toEqual({});

  await nav(page, "strategy");
  await nav(page, "ranges");
  await expect(
    page.getByText(`${correct}/10 richtig`, { exact: true }),
  ).toBeVisible();
  expect((await saved(page)).strategyRanges).toEqual(before.strategyRanges);
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(page.locator(".ranges-category")).not.toHaveText(label);
  await expect(page.getByText("0/10 markiert", { exact: true })).toBeVisible();
  await expect(undo(page)).toBeDisabled();
  await page.reload();
  expect((await saved(page)).strategyRanges).toEqual(before.strategyRanges);
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await page
    .getByRole("button", { name: "Statistiken zurücksetzen", exact: true })
    .click();
  await page.getByRole("button", { name: "Zurücksetzen", exact: true }).click();
  expect((await saved(page)).strategyRanges).toEqual({});
  expect(errors).toEqual([]);
});

test("ranges fit narrow screens in both themes with the action bar above navigation", async ({
  page,
}, info) => {
  await page.goto("./#ranges");
  const widths =
    info.project.name === "mobile" ? [390, 320] : [1440, 1101, 801];
  for (const width of widths) {
    await page.setViewportSize({
      width,
      height:
        info.project.name === "mobile" ? (width === 320 ? 740 : 844) : 1000,
    });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    const boxes = await Promise.all(
      (await cards(page).all()).map((card) => card.boundingBox()),
    );
    for (let i = 0; i < 5; i++) {
      expect(boxes[i]!.y).toBe(boxes[0]!.y);
      expect(boxes[i + 5]!.y).toBeGreaterThan(boxes[i]!.y);
      expect(boxes[i]!.width).toBeGreaterThanOrEqual(44);
      expect(boxes[i]!.height).toBeGreaterThanOrEqual(80);
    }
    const dock = (await page.locator(".ranges-dock").boundingBox())!;
    const grid = (await page.locator(".ranges-grid").boundingBox())!;
    expect(grid.y + grid.height).toBeLessThanOrEqual(dock.y);
    const navBox =
      width <= 800 ? await page.locator(".mobile-nav").boundingBox() : null;
    expect(dock.y + dock.height).toBeLessThanOrEqual(navBox?.y ?? 1000);
    await page.screenshot({
      path: `test-results/ranges-dark-${width}.png`,
      fullPage: true,
    });
  }
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await page.getByLabel("Erscheinungsbild").selectOption("light");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await select(page, "D");
  await page.getByRole("button", { name: "Alles", exact: true }).click();
  await page.screenshot({
    path: `test-results/ranges-light-${info.project.name}.png`,
    fullPage: true,
  });
  await expect(
    page.getByRole("button", { name: "Prüfen", exact: true }),
  ).toBeEnabled();
});

test("keyboard painting and undo stay scoped to the active ranges tab", async ({
  page,
}) => {
  await page.goto("./#ranges");
  await page.keyboard.press("p");
  await expect(
    page.getByRole("button", { name: "Split auswählen" }),
  ).toHaveAttribute("aria-pressed", "true");
  await cards(page).nth(0).focus();
  await page.keyboard.press("Space");
  await expect(cards(page).nth(0)).toHaveAccessibleName("Dealer 2: Split");
  await page.keyboard.press("s");
  await page.keyboard.press("Enter");
  await expect(cards(page).nth(0)).toHaveAccessibleName("Dealer 2: Rest");
  await page.keyboard.press("Control+z");
  await expect(cards(page).nth(0)).toHaveAccessibleName("Dealer 2: Split");
  await page.getByRole("button", { name: "Einstellungen öffnen" }).click();
  await page.keyboard.press("h");
  await page.getByRole("button", { name: "Schließen", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Rest auswählen" }),
  ).toHaveAttribute("aria-pressed", "true");
  await nav(page, "strategy");
  await page.keyboard.press("d");
  await nav(page, "ranges");
  await expect(
    page.getByRole("button", { name: "Rest auswählen" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(cards(page).nth(0)).toHaveAccessibleName("Dealer 2: Split");
  expect((await saved(page)).strategyRanges).toEqual({});
});

test("overview includes every solution and stats; card mode reveals totals without layout shifts", async ({
  page,
}, info) => {
  if (info.project.name === "mobile")
    await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("./#ranges");
  const category = await page.locator(".ranges-category").innerText();
  await page.getByRole("button", { name: "Übersicht", exact: true }).click();
  await expect(page.locator(".ranges-overview-card")).toHaveCount(17);
  await expect(page.locator(".ranges-overview-summary")).toContainText("0/17");
  for (const range of STRATEGY_RANGES) {
    await expect(
      page.getByRole("heading", { name: range.label, exact: true }),
    ).toBeVisible();
    await expect(
      page.getByLabel(`Lösung für ${range.label}`, { exact: true }),
    ).not.toBeEmpty();
  }
  await page.getByRole("button", { name: "Zur Übung", exact: true }).click();
  const gridBefore = (await page.locator(".ranges-grid").boundingBox())!;
  await page.getByRole("switch", { name: "Karten anzeigen" }).check();
  await expect(page.locator(".ranges-hand .playing-card")).toHaveCount(2);
  await expect(page.locator(".ranges-category")).toHaveCount(0);
  await expect(page.locator(".ranges-reveal")).toHaveText(
    "Range und Summe erscheinen nach Prüfen.",
  );
  expect((await page.locator(".ranges-grid").boundingBox())!.y).toBe(
    gridBefore.y,
  );
  const dealt = await page
    .locator(".ranges-hand .playing-card")
    .evaluateAll((elements) =>
      elements.map((element) => element.getAttribute("aria-label")),
    );
  await page.getByRole("button", { name: "Alles", exact: true }).click();
  const before = await Promise.all([
    page.locator(".ranges-grid").boundingBox(),
    page.locator(".ranges-dock").boundingBox(),
  ]);
  await page.getByRole("button", { name: "Prüfen", exact: true }).click();
  await expect(page.locator(".ranges-reveal")).toContainText(
    `${category} · Summe`,
  );
  expect(
    await page
      .locator(".ranges-hand .playing-card")
      .evaluateAll((elements) =>
        elements.map((element) => element.getAttribute("aria-label")),
      ),
  ).toEqual(dealt);
  const after = await Promise.all([
    page.locator(".ranges-grid").boundingBox(),
    page.locator(".ranges-dock").boundingBox(),
  ]);
  expect(after).toEqual(before);
  await page.screenshot({
    path: `test-results/ranges-cards-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Übersicht", exact: true }).click();
  await expect(page.locator(".ranges-overview-summary")).toContainText("1/17");
  const entry = page.locator(".ranges-overview-card").filter({
    has: page.getByRole("heading", { name: category, exact: true }),
  });
  await expect(entry).toContainText("10 Feldern");
  await page.screenshot({
    path: `test-results/ranges-overview-${info.project.name}.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Zur Übung", exact: true }).click();
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(page.locator(".ranges-reveal")).toHaveText(
    "Range und Summe erscheinen nach Prüfen.",
  );
  await page.reload();
  await expect(
    page.getByRole("switch", { name: "Karten anzeigen" }),
  ).toBeChecked();
});
