import assert from 'node:assert/strict';
import { test } from 'node:test';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Window } from 'happy-dom';
import App from './App';
import { createInitialGame } from './game/engine';
import { getLevelById } from './game/levels';
import { STORAGE_KEY } from './game/persistence';

const level = getLevelById('three-lane-crossing');
const group = level.autoGroups![0];

async function mountGame(autoSwitchEnabled: boolean, timers?: { current: number; last: number }, shouldResume = true) {
  const browser = new Window({ url: 'http://localhost:3001/' });
  const globals: Record<string, unknown> = {
    window: browser, document: browser.document, localStorage: browser.localStorage,
    navigator: browser.navigator, Element: browser.Element, HTMLElement: browser.HTMLElement,
    SVGElement: browser.SVGElement, IS_REACT_ACT_ENVIRONMENT: true,
  };
  const originals = new Map(Object.keys(globals).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  for (const [key, value] of Object.entries(globals)) Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
  const game = {
    ...createInitialGame(level), running: true, phase: group[0], targetPhase: group[0], activePhaseIds: group,
    manualLights: Object.fromEntries(level.phases.map((phase) => [phase.id, group.includes(phase.id) ? 'green' : 'red'])),
    currentGroupGreenMs: timers?.current ?? 0, lastGroupGreenMs: timers?.last ?? 0,
  };
  browser.localStorage.setItem(STORAGE_KEY, JSON.stringify({
    version: 3, levelId: level.id, game,
    cityStats: { allCars: 1000, allSatisfactionSum: 8000, history: [] },
    autoSwitchEnabled, autoSwitchSeconds: 0.2,
    autoSwitchSecondsByPhase: Object.fromEntries(level.phases.map((phase) => [phase.id, 0.2])),
  }));
  const host = browser.document.createElement('div');
  browser.document.body.appendChild(host);
  const root = createRoot(host as unknown as HTMLElement);
  await act(async () => { root.render(React.createElement(App)); });
  const resume = host.querySelector('.overlay-panel button');
  assert.ok(resume);
  if (shouldResume) await act(async () => { resume.dispatchEvent(new browser.MouseEvent('click', { bubbles: true })); });
  const dispose = async () => {
    await act(async () => { root.unmount(); });
    await browser.happyDOM.abort();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
  };
  return { browser, host, dispose };
}

test('the control panel renders both seven-segment group timers', async () => {
  const { host, dispose } = await mountGame(false, { current: 12345, last: 7600 }, false);
  try {
    const displays = host.querySelectorAll('.control-console .seven-segment');
    assert.equal(displays.length, 2);
    assert.equal(displays[0].getAttribute('aria-label'), 'Aktuelle Gruppe: 12,3 Sekunden');
    assert.equal(displays[1].getAttribute('aria-label'), 'Letzte Gruppe: 07,6 Sekunden');
    assert.equal(displays[0].querySelectorAll('polygon').length, 21);
    assert.equal(displays[1].querySelectorAll('polygon').length, 21);
  } finally { await dispose(); }
});

test('hover previews a group, wheel cycles it without scrolling, and click switches that group', async () => {
  const { browser, host, dispose } = await mountGame(false);
  try {
    const signal = (id: string) => host.querySelector(`[data-phase-id="${id}"]`)!;
    const north = signal('northOuter');
    await act(async () => { north.dispatchEvent(new browser.MouseEvent('mouseover', { bubbles: true })); });
    assert.ok(north.classList.contains('preview-source'));
    assert.ok(signal('southOuter').classList.contains('group-preview'));
    assert.match(host.querySelector('.signal-group-info')!.textContent!, /N\/S Gerade/);

    const wheel = new browser.WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    await act(async () => { north.dispatchEvent(wheel); });
    assert.equal(wheel.defaultPrevented, true);
    assert.match(host.querySelector('.signal-group-info')!.textContent!, /Nord Komplett/);
    assert.ok(signal('northLeft').classList.contains('group-preview'));
    assert.equal(signal('southOuter').classList.contains('group-preview'), false);

    const next = new browser.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    await act(async () => { north.dispatchEvent(next); });
    assert.equal(next.defaultPrevented, true);
    assert.match(host.querySelector('.signal-group-info')!.textContent!, /Nur Nord Gerade außen/);
    assert.equal(signal('northInner').classList.contains('group-preview'), false);
    const previous = new browser.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, cancelable: true });
    await act(async () => { north.dispatchEvent(previous); });
    assert.match(host.querySelector('.signal-group-info')!.textContent!, /Nord Komplett/);

    await act(async () => { north.dispatchEvent(new browser.MouseEvent('click', { bubbles: true })); });
    assert.equal(signal('northOuter').querySelector('circle[cy="24"]')?.getAttribute('fill'), '#22c55e');
    assert.equal(signal('southOuter').querySelector('circle[cy="0"]')?.getAttribute('fill'), '#facc15');
    const boardWheel = new browser.WheelEvent('wheel', { deltaY: 120, bubbles: true, cancelable: true });
    await act(async () => { host.querySelector('.board')!.dispatchEvent(boardWheel); });
    assert.equal(boardWheel.defaultPrevented, false);
    await act(async () => { north.dispatchEvent(new browser.MouseEvent('mouseout', { bubbles: true, relatedTarget: browser.document.body })); });
    assert.equal(host.querySelector('.signal-group-info'), null);
  } finally { await dispose(); }
});

test('the always-visible autopilot switch stops and restarts automatic changes', async () => {
  const { browser, host, dispose } = await mountGame(true);
  try {
    const toggle = host.querySelector('.pilot-quick')!;
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    assert.ok(toggle.compareDocumentPosition(host.querySelector('.control-console')!) & browser.Node.DOCUMENT_POSITION_FOLLOWING);
    await act(async () => { toggle.dispatchEvent(new browser.MouseEvent('click', { bubbles: true })); });
    assert.equal(toggle.getAttribute('aria-pressed'), 'false');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
    const north = host.querySelector('[data-phase-id="northOuter"]')!;
    assert.equal(north.querySelector('circle[cy="24"]')?.getAttribute('fill'), '#22c55e');

    await act(async () => { toggle.dispatchEvent(new browser.MouseEvent('click', { bubbles: true })); });
    assert.equal(toggle.getAttribute('aria-pressed'), 'true');
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 850)); });
    assert.equal(north.querySelector('circle[cy="0"]')?.getAttribute('fill'), '#facc15');
  } finally { await dispose(); }
});
