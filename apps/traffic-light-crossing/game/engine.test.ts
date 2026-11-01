import assert from 'node:assert/strict';
import { test } from 'node:test';
import { applyManualScene, createInitialGame, getStopProgress, leftTurnGuidePoints, lightForPhase, phaseForVehicle, queueCounts, requestPhase, setAllRed, tickGame, vehicleTransform, vehiclesOverlap } from './engine';
import { DEFAULT_LEVEL_ID, getLevelById, LEVELS } from './levels';
import { parseSavedState } from './persistence';
import { GameState, LevelConfig, Vehicle } from './types';
import { AudioService } from '../services/audioService';
import { advanceAutoSwitch, initialAutoSwitchCursor } from './automation';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import App from '../App';
import { formatSegmentTime } from '../SevenSegmentDisplay';
import '../ui.test';
import { cycleSignalGroup, signalGroupsForPhase } from './signalGroups';

const basic = LEVELS[0];
const turns = LEVELS[1];
const wide = getLevelById('three-lane-crossing');
const empty = (level = basic): GameState => ({
  ...createInitialGame(level), running: true,
  spawnMsByDirection: { north: 1e9, south: 1e9, east: 1e9, west: 1e9 },
});
const car = (patch: Partial<Vehicle> = {}): Vehicle => ({
  id: 1, direction: 'north', laneId: 'main', turn: 'straight', progress: 0,
  speed: 0, maxSpeed: 1.7, acceleration: 0.035, braking: 0.1, reactionMs: 150,
  followGap: 0, waitMs: 0, lateralOffset: 0, lateralVelocity: 0, filteredMergeMs: 0,
  kind: 'regular', yellowDecisionId: null, yellowProceed: false, brakeLight: false,
  brakeLightMs: 0, hue: '#fff', crashed: false, crashMs: 0, confusedMs: 0,
  stopReason: 'moving', noVisibleExhaust: false, thinkCooldownMs: 0, ...patch,
});
function ticks(state: GameState, count: number, level = basic) {
  for (let i = 0; i < count; i++) state = tickGame(state, level).state;
  return state;
}
function green(ids: string[], level = basic) {
  return ticks(applyManualScene(empty(level), ids, level), 60, level);
}

test('all level controls and lanes refer to existing signal groups', () => {
  for (const level of LEVELS) {
    const ids = level.phases.map((phase) => phase.id);
    for (const approach of level.approaches) for (const lane of approach.lanes) assert.ok(ids.includes(lane.phaseId ?? approach.phaseId));
    for (const button of level.controlButtons) {
      const idsToCheck = button.action.type === 'scene' ? button.action.phaseIds : button.action.type === 'phase' ? [button.action.phaseId] : [];
      idsToCheck.forEach((id) => assert.ok(ids.includes(id), `${level.id}/${id}`));
    }
  }
});

test('rapid phase changes cannot bypass yellow or the all-red clearance', () => {
  let state = requestPhase(green(['northSouth']), 'eastWest', basic);
  const initialYellow = state.switchMs;
  state = ticks(state, 10);
  state = requestPhase(state, 'northSouth', basic);
  assert.equal(state.transitionKind, 'yellow');
  assert.ok(state.switchMs < initialYellow);
  assert.equal(lightForPhase(state, 'eastWest'), 'red');
  state = ticks(state, 50);
  assert.equal(state.transitionKind, 'allRed');
  assert.ok(Object.values(state.manualLights).every((light) => light === 'red'));
  state = ticks(state, 60);
  assert.deepEqual(state.activePhaseIds, ['northSouth']);
});

test('duplicate requests are idempotent and invalid phase IDs are ignored', () => {
  const state = requestPhase(empty(), 'northSouth', basic);
  assert.equal(requestPhase(state, 'northSouth', basic), state);
  assert.equal(requestPhase(state, 'missing-phase', basic), state);
});

test('cars and motorcycles stop at red and rot-gelb', () => {
  for (const kind of ['regular', 'sport', 'motorcycle'] as const) {
    let state = { ...empty(), vehicles: [car({ kind, progress: getStopProgress(basic), stopReason: 'red_light' })] };
    state = ticks(state, 60);
    assert.equal(state.vehicles[0].progress, getStopProgress(basic));
    state = requestPhase(state, 'northSouth', basic);
    while (state.transitionKind !== 'redYellow') state = ticks(state, 1);
    state = ticks(state, 10);
    assert.equal(lightForPhase(state, 'northSouth'), 'redYellow');
    assert.equal(state.vehicles[0].progress, getStopProgress(basic));
    state = ticks(state, 30);
    assert.ok(state.vehicles[0].progress > getStopProgress(basic));
  }
});

test('yellow does not release a stationary queue', () => {
  let state = { ...green(['northSouth']), vehicles: [car({ progress: getStopProgress(basic) })] };
  state = requestPhase(state, 'eastWest', basic);
  state = ticks(state, 50);
  assert.equal(state.vehicles[0].progress, getStopProgress(basic));
});

test('clearance waits until a slow car has actually left the junction', () => {
  let state = { ...green(['northSouth']), vehicles: [car({ progress: 500, speed: 0.2, maxSpeed: 0.2 })] };
  state = requestPhase(state, 'eastWest', basic);
  state = ticks(state, 120);
  assert.equal(state.transitionKind, 'allRed');
  assert.equal(lightForPhase(state, 'eastWest'), 'red');
  state = ticks(state, 400);
  assert.equal(lightForPhase(state, 'eastWest'), 'green');
});

test('pause freezes vehicles, signals, elapsed time, and new phase requests do not resume it', () => {
  const paused = { ...green(['northSouth']), paused: true };
  assert.equal(ticks(paused, 100), paused);
  const requested = requestPhase(paused, 'eastWest', basic);
  assert.equal(requested.paused, true);
  assert.equal(ticks(requested, 100), requested);
});

test('group timers measure stable green only, freeze on pause and record the last group at yellow', () => {
  let state = requestPhase(empty(), 'northSouth', basic);
  while (state.transitionKind !== 'none') {
    assert.equal(state.currentGroupGreenMs, 0);
    assert.equal(state.lastGroupGreenMs, 0);
    state = ticks(state, 1);
  }
  assert.equal(state.currentGroupGreenMs, 0);
  state = ticks(state, 30);
  assert.ok(Math.abs(state.currentGroupGreenMs - 1000) < 0.001);
  const paused = { ...state, paused: true };
  assert.equal(ticks(paused, 60), paused);
  const firstDuration = state.currentGroupGreenMs;
  state = requestPhase(state, 'eastWest', basic);
  assert.equal(state.currentGroupGreenMs, 0);
  assert.equal(state.lastGroupGreenMs, firstDuration);
  const phasesSeen = new Set<string>();
  while (state.transitionKind !== 'none') {
    phasesSeen.add(state.transitionKind);
    assert.equal(state.currentGroupGreenMs, 0);
    assert.equal(state.lastGroupGreenMs, firstDuration);
    state = ticks(state, 1);
  }
  assert.deepEqual(phasesSeen, new Set(['yellow', 'allRed', 'redYellow']));
  state = ticks(state, 45);
  assert.ok(Math.abs(state.currentGroupGreenMs - 1500) < 0.001);
  assert.equal(state.lastGroupGreenMs, firstDuration);
  const secondDuration = state.currentGroupGreenMs;
  state = setAllRed(state, basic);
  assert.equal(state.lastGroupGreenMs, secondDuration);
  assert.equal(state.currentGroupGreenMs, 0);
  state = ticks(state, 120);
  assert.equal(state.currentGroupGreenMs, 0);
  assert.equal(state.lastGroupGreenMs, secondDuration);
});

test('group timers exclude yellow even when a shared signal stays green', () => {
  let state = green(['northThrough', 'southThrough'], turns);
  const firstDuration = state.currentGroupGreenMs;
  assert.ok(firstDuration > 0);
  state = applyManualScene(state, ['northThrough', 'northLeft'], turns);
  assert.equal(state.lastGroupGreenMs, firstDuration);
  for (let frame = 0; frame < 100 && state.transitionKind !== 'none'; frame++) {
    assert.equal(lightForPhase(state, 'northThrough'), 'green');
    assert.equal(state.currentGroupGreenMs, 0);
    assert.equal(state.lastGroupGreenMs, firstDuration);
    state = ticks(state, 1, turns);
  }
  assert.equal(state.transitionKind, 'none');
  state = ticks(state, 30, turns);
  assert.ok(Math.abs(state.currentGroupGreenMs - 1000) < 0.001);
  assert.equal(state.lastGroupGreenMs, firstDuration);
});

test('seven-segment values show two digits and a tenth, capped at 99.9 seconds', () => {
  assert.equal(formatSegmentTime(0), '00.0');
  assert.equal(formatSegmentTime(9876), '09.8');
  assert.equal(formatSegmentTime(12345), '12.3');
  assert.equal(formatSegmentTime(99900), '99.9');
  assert.equal(formatSegmentTime(180000), '99.9');
});

test('group controls return to individual phases without a stuck controller', () => {
  let state = green(['northThrough', 'southThrough'], turns);
  assert.equal(lightForPhase(state, 'northThrough'), 'green');
  assert.equal(lightForPhase(state, 'southThrough'), 'green');
  state = ticks(requestPhase(state, 'eastWest', turns), 120, turns);
  assert.deepEqual(state.activePhaseIds, ['eastWest']);
  assert.equal(lightForPhase(state, 'northThrough'), 'red');
  state = ticks(setAllRed(state, turns), 120, turns);
  assert.deepEqual(state.activePhaseIds, []);
});

test('every overlapping NS scene keeps its common green signals throughout the change', () => {
  const scenes = turns.controlButtons.flatMap(({ action }) => action.type === 'scene' ? [action.phaseIds] : []);
  for (const from of scenes) for (const to of scenes) {
    if (from === to) continue;
    const shared = from.filter((id) => to.includes(id));
    if (shared.length === 0) continue;
    let state = applyManualScene(green(from, turns), to, turns);
    const seen = new Map<string, Set<string>>(to.map((id) => [id, new Set()]));
    for (let frame = 0; frame < 150; frame++) {
      for (const id of shared) assert.equal(lightForPhase(state, id), 'green', `${from} -> ${to}: ${id}, frame ${frame}`);
      for (const id of to) seen.get(id)!.add(lightForPhase(state, id));
      state = ticks(state, 1, turns);
    }
    assert.equal(state.transitionKind, 'none');
    assert.deepEqual(state.activePhaseIds, to);
    for (const id of from.filter((id) => !to.includes(id))) assert.equal(lightForPhase(state, id), 'red');
    for (const id of to.filter((id) => !from.includes(id))) assert.ok(seen.get(id)!.has('redYellow'));
  }
});

test('traffic on a retained green does not hold up the new compatible group', () => {
  let state = green(['northThrough', 'southThrough'], turns);
  state.vehicles = [car({ laneId: 'through', progress: 700, speed: 0.01, maxSpeed: 0.01 })];
  state = applyManualScene(state, ['northThrough', 'northLeft'], turns);
  state = ticks(state, 120, turns);
  assert.equal(state.transitionKind, 'none');
  assert.equal(lightForPhase(state, 'northThrough'), 'green');
  assert.equal(lightForPhase(state, 'northLeft'), 'green');
  assert.ok(state.vehicles[0].progress < 710, 'the retained traffic is still in the junction');
});

test('retiring traffic still clears before the new group starts while the shared green remains on', () => {
  let state = green(['northThrough', 'southThrough'], turns);
  state.vehicles = [car({ direction: 'south', laneId: 'through', progress: 700, speed: 0.1, maxSpeed: 0.1 })];
  state = applyManualScene(state, ['northThrough', 'northLeft'], turns);
  state = ticks(state, 120, turns);
  assert.equal(state.transitionKind, 'allRed');
  assert.equal(lightForPhase(state, 'northThrough'), 'green');
  assert.equal(lightForPhase(state, 'southThrough'), 'red');
  assert.equal(lightForPhase(state, 'northLeft'), 'red');
  state = ticks(state, 1000, turns);
  assert.equal(lightForPhase(state, 'northThrough'), 'green');
  assert.equal(lightForPhase(state, 'northLeft'), 'green');
});

test('a changed request retires a formerly retained green through a full yellow period', () => {
  for (const delay of [10, 60, 90]) {
    let state = applyManualScene(green(['northThrough', 'southThrough'], turns), ['northThrough', 'northLeft'], turns);
    state = ticks(state, delay, turns);
    assert.equal(lightForPhase(state, 'northThrough'), 'green');
    state = requestPhase(state, 'eastWest', turns);
    assert.equal(lightForPhase(state, 'northThrough'), 'yellow');
    assert.equal(state.switchMs, turns.timings.yellowMs);
    assert.deepEqual(state.activePhaseIds, []);
    state = ticks(state, 120, turns);
    assert.equal(lightForPhase(state, 'eastWest'), 'green');
    assert.equal(lightForPhase(state, 'northThrough'), 'red');
  }
});

test('queue counts include the first car exactly on the stop line', () => {
  assert.equal(queueCounts(basic, [car({ progress: getStopProgress(basic) })]).north, 1);
});

test('opposing left-turn paths stay separate and end in the correct outgoing lanes', () => {
  for (let progress = 0; progress < 1250; progress += 2) {
    const north = car({ direction: 'north', laneId: 'left', turn: 'left', progress });
    const south = car({ id: 2, direction: 'south', laneId: 'left', turn: 'left', progress });
    assert.equal(vehiclesOverlap(turns, north, south), false, `overlap at ${progress}`);
    if (progress === 1100) {
      const pos = vehicleTransform(turns, north);
      assert.ok(pos.x > turns.geometry.board / 2 + turns.geometry.roadHalf);
      assert.equal(Math.round(pos.y), turns.geometry.board / 2 + 60);
    }
  }
});

test('collisions produce one incident and wrecks clear after two seconds', () => {
  const position = basic.geometry.board / 2 - basic.geometry.laneOffset - basic.geometry.start;
  const state = { ...empty(), vehicles: [car({ progress: position }), car({ id: 2, direction: 'east', progress: basic.geometry.board / 2 + basic.geometry.laneOffset - basic.geometry.start })] };
  const result = tickGame(state, basic);
  assert.deepEqual(result.events, ['crash']);
  assert.equal(result.state.incidents, 1);
  assert.ok(result.state.vehicles.every((vehicle) => vehicle.crashed));
  const cleared = ticks(result.state, 62);
  assert.equal(cleared.vehicles.length, 0);
  assert.equal(cleared.incidents, 1);
});

test('saved progress survives v2 migration, malformed saves fall back safely', () => {
  assert.equal(parseSavedState('{bad json'), null);
  const migrated = parseSavedState(JSON.stringify({ levelId: turns.id, game: { remainingMs: -1e9 }, cityStats: { allCars: 150, allSatisfactionSum: 1100, history: {} }, autoSwitchSeconds: 'bad' }));
  assert.equal(migrated?.cityStats.allCars, 150);
  assert.equal(migrated?.game.vehicles.length, 0);
  assert.equal(migrated?.autoSwitchSeconds, 8);
  const malformed = parseSavedState(JSON.stringify({ version: 3, levelId: basic.id, game: { ...empty(), vehicles: [null] }, cityStats: {} }));
  assert.ok(malformed);
  assert.equal(malformed.game.vehicles.length, 0);
});

test('current saves restore paused with their queue intact', () => {
  const game = { ...green(['northSouth']), currentGroupGreenMs: 12345, lastGroupGreenMs: 6789, vehicles: [car({ progress: 200 })] };
  const saved = parseSavedState(JSON.stringify({ version: 3, levelId: basic.id, game, cityStats: {} }));
  assert.equal(saved?.game.paused, true);
  assert.equal(saved?.game.vehicles[0].progress, 200);
  assert.deepEqual(saved?.game.activePhaseIds, ['northSouth']);
  assert.equal(saved?.game.currentGroupGreenMs, 12345);
  assert.equal(saved?.game.lastGroupGreenMs, 6789);
  const oldSave = { ...game } as Partial<GameState>;
  delete oldSave.currentGroupGreenMs;
  delete oldSave.lastGroupGreenMs;
  const restoredOldSave = parseSavedState(JSON.stringify({ version: 3, levelId: basic.id, game: oldSave, cityStats: {} }));
  assert.equal(restoredOldSave?.game.currentGroupGreenMs, 0);
  assert.equal(restoredOldSave?.game.lastGroupGreenMs, 0);
});

test('audio uses audible defaults on first visit and preserves explicitly muted channels', () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  assert.deepEqual(new AudioService().getVolumes(), { horn: 0.5, lightClick: 0.5 });
  values.set('traffic-light-volume-horn', '0');
  assert.equal(new AudioService().getVolumes().horn, 0);
  Reflect.deleteProperty(globalThis, 'localStorage');
});

test('all levels sustain ten minutes of changing traffic without collisions or invalid positions', () => {
  const originalRandom = Math.random;
  let seed = 42;
  Math.random = () => ((seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 4294967296);
  try {
    for (const level of LEVELS) {
      let state = { ...createInitialGame(level), running: true };
      const lanesSeen = new Set<string>();
      const controls = level.controlButtons.filter((button) => button.action.type !== 'allRed');
      for (let frame = 0; frame < 18000; frame++) {
        if (frame % 420 === 0) {
          const action = controls[Math.floor(frame / 420) % controls.length].action;
          state = action.type === 'scene' ? applyManualScene(state, action.phaseIds, level) : action.type === 'phase' ? requestPhase(state, action.phaseId, level) : state;
        }
        const result = tickGame(state, level);
        state = result.state;
        state.vehicles.forEach((vehicle) => lanesSeen.add(phaseForVehicle(level, vehicle)));
        assert.ok(state.vehicles.length <= level.traffic.maxVehicles);
        assert.ok(state.vehicles.every((vehicle) => Number.isFinite(vehicle.progress) && vehicle.progress >= 0));
      }
      assert.ok(state.cars > 50, `${level.id}: only ${state.cars} cars passed`);
      assert.equal(state.incidents, 0, `${level.id}: ${state.incidents} accidents`);
      assert.ok(state.elapsedMs > 599000);
      if (level.id === 'three-lane-crossing') {
        for (const phase of level.phases) assert.ok(lanesSeen.has(phase.id), `no traffic on ${phase.id}`);
      }
    }
  } finally { Math.random = originalRandom; }
});

test('the new intersection has twelve individually controlled lanes with two straight and one left per approach', () => {
  assert.equal(wide.approaches.length, 4);
  assert.equal(wide.phases.length, 12);
  assert.equal(new Set(wide.phases.map((phase) => phase.id)).size, 12);
  for (const approach of wide.approaches) {
    assert.equal(approach.lanes.length, 3);
    assert.equal(approach.lanes.filter((lane) => lane.turns.includes('straight')).length, 2);
    assert.equal(approach.lanes.filter((lane) => lane.turns.includes('left')).length, 1);
    assert.equal(new Set(approach.lanes.map((lane) => lane.phaseId)).size, 3);
  }
  assert.deepEqual(wide.controlButtons.filter((button) => button.controlKey).map((button) => button.controlKey),
    ['ArrowUp', 'ArrowRight', 'ArrowLeft', 'ArrowDown']);
});

test('each new intersection scene gets its vehicles through without collisions', () => {
  const scenes = wide.controlButtons.flatMap((button) => button.action.type === 'scene' ? [button.action.phaseIds] : []);
  for (const ids of scenes) {
    const vehicles = wide.approaches.flatMap((approach) => approach.lanes
      .filter((lane) => ids.includes(lane.phaseId!))
      .map((lane) => car({
        id: ids.indexOf(lane.phaseId!) + 1,
        direction: approach.direction,
        laneId: lane.id,
        turn: lane.turns[0],
        progress: getStopProgress(wide),
      })));
    let state = { ...green(ids, wide), vehicles };
    state = ticks(state, 600, wide);
    assert.equal(state.incidents, 0, ids.join(','));
    assert.equal(state.cars, vehicles.length, ids.join(','));
  }
});

test('the new intersection keeps common straight signals green during a group change', () => {
  const straight = wide.autoGroups![0];
  const north = wide.controlButtons.find((button) => button.id === 'north-complete')!.action;
  assert.equal(north.type, 'scene');
  if (north.type !== 'scene') return;
  let state = applyManualScene(green(straight, wide), north.phaseIds, wide);
  for (let frame = 0; frame < 150; frame++) {
    assert.equal(lightForPhase(state, 'northOuter'), 'green');
    assert.equal(lightForPhase(state, 'northInner'), 'green');
    state = ticks(state, 1, wide);
  }
  assert.deepEqual(state.activePhaseIds, north.phaseIds);
});

test('the wide junction autopilot cycles coordinated phases and honors sensor demand', () => {
  const settings = { enabled: true, sensorMode: false, secondsByPhase: Object.fromEntries(wide.phases.map((phase) => [phase.id, 8])) };
  const first = advanceAutoSwitch(empty(wide), wide, settings, initialAutoSwitchCursor());
  assert.deepEqual(first.requestPhases, wide.autoGroups![0]);
  const state = green(wide.autoGroups![0], wide);
  const stable = advanceAutoSwitch(state, wide, settings, first.cursor);
  const next = advanceAutoSwitch({ ...state, elapsedMs: state.elapsedMs + 8000 }, wide, settings, stable.cursor);
  assert.deepEqual(next.requestPhases, wide.autoGroups![1]);
  const skipped = { ...settings, secondsByPhase: { ...settings.secondsByPhase, northOuter: 0 } };
  assert.deepEqual(advanceAutoSwitch(empty(wide), wide, skipped, initialAutoSwitchCursor()).requestPhases,
    wide.autoGroups![0].filter((id) => id !== 'northOuter'));
  const sensor = { ...settings, sensorMode: true };
  const waiting = { ...state, vehicles: [car({ direction: 'east', laneId: 'outer', progress: getStopProgress(wide) })] };
  const detected = advanceAutoSwitch(waiting, wide, sensor, initialAutoSwitchCursor());
  const due = advanceAutoSwitch({ ...waiting, elapsedMs: waiting.elapsedMs + 8000 }, wide, sensor, detected.cursor);
  assert.deepEqual(due.requestPhases, wide.autoGroups![2]);
  const differentIntervals = { ...settings, secondsByPhase: { ...settings.secondsByPhase, northOuter: 6 } };
  const coordinated = advanceAutoSwitch(empty(wide), wide, differentIntervals, initialAutoSwitchCursor());
  assert.equal(coordinated.request, null);
  assert.deepEqual(coordinated.requestPhases, wide.autoGroups![0]);
});

test('different green times retire individual lamps while the autopilot keeps the remaining group green', () => {
  const secondsByPhase = Object.fromEntries(wide.phases.map((phase) => [phase.id, 8]));
  secondsByPhase.northOuter = 6;
  const settings = { enabled: true, sensorMode: false, secondsByPhase };
  let state = green(wide.autoGroups![0], wide);
  const started = advanceAutoSwitch(state, wide, settings, initialAutoSwitchCursor());
  state = { ...state, elapsedMs: state.elapsedMs + 6000 };
  const shorter = advanceAutoSwitch(state, wide, settings, started.cursor);
  assert.deepEqual(shorter.requestPhases, ['northInner', 'southOuter', 'southInner']);
  state = applyManualScene(state, shorter.requestPhases!, wide);
  assert.equal(lightForPhase(state, 'northOuter'), 'yellow');
  assert.equal(lightForPhase(state, 'northInner'), 'green');
  state = ticks(state, 60, wide);
  const next = advanceAutoSwitch(state, wide, settings, shorter.cursor);
  assert.deepEqual(next.requestPhases, wide.autoGroups![1]);
  state = applyManualScene(state, next.requestPhases!, wide);
  state = ticks(state, 120, wide);
  assert.deepEqual(state.activePhaseIds, wide.autoGroups![1]);
  const stopped = advanceAutoSwitch(state, wide, { ...settings, enabled: false }, next.cursor);
  assert.equal(stopped.requestPhases, null);
  assert.equal(stopped.request, null);
  assert.deepEqual(stopped.cursor, initialAutoSwitchCursor());
});

test('the autopilot keeps its timers through a mixed manual group and preserves shared greens', () => {
  const secondsByPhase = Object.fromEntries(wide.phases.map((phase) => [phase.id, 8]));
  secondsByPhase.northOuter = 6;
  const settings = { enabled: true, sensorMode: false, secondsByPhase };
  let state = green(['northOuter', 'northInner', 'northLeft'], wide);
  const started = advanceAutoSwitch(state, wide, settings, initialAutoSwitchCursor());
  state = { ...state, elapsedMs: state.elapsedMs + 6000 };
  const shorter = advanceAutoSwitch(state, wide, settings, started.cursor);
  assert.deepEqual(shorter.requestPhases, ['northInner', 'northLeft']);
  state = applyManualScene(state, shorter.requestPhases!, wide);
  state = ticks(state, 60, wide);
  const next = advanceAutoSwitch(state, wide, settings, shorter.cursor);
  assert.deepEqual(next.requestPhases, wide.autoGroups![1]);
  state = applyManualScene(state, next.requestPhases!, wide);
  assert.equal(lightForPhase(state, 'northLeft'), 'green');
  state = ticks(state, 120, wide);
  assert.deepEqual(state.activePhaseIds, wide.autoGroups![1]);
});

test('hover choices contain only configured groups plus the individual signal and cycle both ways', () => {
  const groups = signalGroupsForPhase(wide, 'northOuter');
  assert.deepEqual(groups.map((group) => group.label), ['N/S Gerade', 'Nord Komplett', 'Nur Nord Gerade außen']);
  assert.deepEqual(groups[0].phaseIds, wide.autoGroups![0]);
  assert.deepEqual(groups[1].phaseIds, ['northOuter', 'northInner', 'northLeft']);
  assert.deepEqual(groups[2].phaseIds, ['northOuter']);
  assert.equal(cycleSignalGroup(0, -1, groups.length), 2);
  assert.equal(cycleSignalGroup(2, 1, groups.length), 0);
  assert.equal(signalGroupsForPhase(basic, 'northSouth').length, 1);
  assert.deepEqual(signalGroupsForPhase(wide, 'unknown'), []);
});

test('the wide intersection turn guides clear the full width of turning cars on all approaches', () => {
  const center = wide.geometry.board / 2;
  for (const direction of ['north', 'south', 'east', 'west'] as const) {
    const guide = leftTurnGuidePoints(wide, direction, 'left');
    const radius = wide.geometry.roadHalf + 150 + wide.geometry.carWidth;
    const incomingLength = center + 150 - radius - wide.geometry.start;
    for (let index = 0; index <= 24; index++) {
      const point = guide[index + 1];
      if (Math.abs(point.x - center) > wide.geometry.roadHalf || Math.abs(point.y - center) > wide.geometry.roadHalf) continue;
      const progress = incomingLength + Math.PI * radius / 2 * index / 24;
      const pose = vehicleTransform(wide, car({ direction, laneId: 'left', turn: 'left', progress }));
      assert.ok(Math.hypot(point.x - pose.x, point.y - pose.y) > wide.geometry.carWidth / 2 + 1.5,
        `${direction} guide touches vehicle at sample ${index}`);
    }
  }
});

test('the new intersection renders twelve distinct labeled signal heads', () => {
  const saved = JSON.stringify({ version: 3, levelId: wide.id, game: createInitialGame(wide), cityStats: {} });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => saved } });
  try {
    const markup = renderToStaticMarkup(React.createElement(App));
    assert.equal((markup.match(/class="signal-head"/g) ?? []).length, 12);
    for (const phase of wide.phases) assert.ok(markup.includes(`aria-label="${phase.label}: Rot"`));
    assert.ok(markup.includes('O/W Links'));
    assert.equal((markup.match(/class="turn-guide"/g) ?? []).length, 4);
  } finally { Reflect.deleteProperty(globalThis, 'localStorage'); }
});

test('challenge ends at 90 seconds and cannot continue after game over', () => {
  let state: GameState = { ...empty(), gameMode: 'challenge' };
  state = ticks(state, 2700);
  assert.equal(state.remainingMs, 0);
  assert.equal(state.over, true);
  assert.equal(state.running, false);
  assert.equal(ticks(state, 100), state);
  assert.equal(requestPhase(state, 'northSouth', basic), state);
});

test('long queues cost lives only in challenge and eventually end the round', () => {
  const waiting = car({ progress: getStopProgress(basic), waitMs: 31000 });
  const simulation = ticks({ ...empty(), vehicles: [waiting] }, 1000);
  assert.equal(simulation.lives, basic.traffic.lives);
  assert.equal(simulation.over, false);
  const challenge = ticks({ ...empty(), gameMode: 'challenge', lives: 1, vehicles: [waiting] }, 1);
  assert.equal(challenge.lives, 0);
  assert.equal(challenge.over, true);
  const twoLives = ticks({ ...empty(), gameMode: 'challenge', lives: 2, vehicles: [waiting] }, 30);
  assert.equal(twoLives.lives, 1, 'a continuous queue must respect the penalty cooldown');
});

test('an expired challenge is restored as finished rather than revived', () => {
  const restored = parseSavedState(JSON.stringify({ version: 3, levelId: basic.id, game: { ...empty(), gameMode: 'challenge', remainingMs: 0, over: true }, cityStats: {} }));
  assert.equal(restored?.game.over, true);
  assert.equal(restored?.game.running, false);
});

test('automatic switching starts from all red and counts full green time after startup', () => {
  const settings = { enabled: true, sensorMode: false, secondsByPhase: { northSouth: 8, eastWest: 8 } };
  const first = advanceAutoSwitch(empty(), basic, settings, initialAutoSwitchCursor());
  assert.equal(first.request, 'northSouth');
  const state = green(['northSouth']);
  const stable = advanceAutoSwitch(state, basic, settings, first.cursor);
  assert.equal(stable.remainingMs, 8000);
  assert.equal(stable.request, null);
  const due = advanceAutoSwitch({ ...state, elapsedMs: state.elapsedMs + 8000 }, basic, settings, stable.cursor);
  assert.equal(due.request, 'eastWest');
});

test('automatic switching respects pause, zero intervals, and group controls', () => {
  const settings = { enabled: true, sensorMode: false, secondsByPhase: Object.fromEntries(turns.phases.map((phase) => [phase.id, 8])) };
  const state = green(['northThrough', 'southThrough'], turns);
  const stable = advanceAutoSwitch(state, turns, settings, initialAutoSwitchCursor());
  const paused = advanceAutoSwitch({ ...state, paused: true }, turns, settings, stable.cursor);
  assert.equal(paused.request, null);
  assert.equal(paused.remainingMs, 8000);
  assert.equal(advanceAutoSwitch({ ...state, elapsedMs: state.elapsedMs + 8000 }, turns, settings, stable.cursor).request, 'northLeft');
  const disabled = { ...settings, secondsByPhase: Object.fromEntries(turns.phases.map((phase) => [phase.id, 0])) };
  assert.equal(advanceAutoSwitch(empty(turns), turns, disabled, initialAutoSwitchCursor()).request, null);
});

test('sensor controller detects demand beyond empty intermediate phases', () => {
  const settings = { enabled: true, sensorMode: true, secondsByPhase: Object.fromEntries(turns.phases.map((phase) => [phase.id, 8])) };
  const state = green(['northThrough'], turns);
  const idle = advanceAutoSwitch(state, turns, settings, initialAutoSwitchCursor());
  assert.equal(idle.cursor.startedAtMs, null);
  const waiting = { ...state, vehicles: [car({ direction: 'east', laneId: 'through', progress: getStopProgress(turns) })] };
  const detected = advanceAutoSwitch(waiting, turns, settings, idle.cursor);
  assert.equal(detected.cursor.startedAtMs, state.elapsedMs);
  assert.equal(advanceAutoSwitch({ ...waiting, elapsedMs: state.elapsedMs + 8000 }, turns, settings, detected.cursor).request, 'eastWest');
});

test('opposing left turn bodies remain separate even with different progress', () => {
  for (let first = 500; first < 1050; first += 8) for (let second = 500; second < 1050; second += 8) {
    assert.equal(vehiclesOverlap(turns, car({ laneId: 'left', turn: 'left', progress: first }), car({ id: 2, direction: 'south', laneId: 'left', turn: 'left', progress: second })), false, `${first}/${second}`);
  }
});

test('the left-turn intersection is the default while a saved selection is retained', () => {
  assert.equal(DEFAULT_LEVEL_ID, turns.id);
  assert.equal(getLevelById('unknown').id, turns.id);
  assert.equal(parseSavedState(JSON.stringify({ levelId: 'unknown' }))?.levelId, turns.id);
  assert.equal(parseSavedState(JSON.stringify({ levelId: basic.id }))?.levelId, basic.id);
});

test('turn guides stay outside both turning car bodies inside the intersection', () => {
  const center = turns.geometry.board / 2;
  const half = turns.geometry.roadHalf;
  const points = (['north', 'south'] as const).flatMap((direction) => {
    const guide = leftTurnGuidePoints(turns, direction, 'left');
    return guide.slice(1).flatMap((point, index) => Array.from({ length: 5 }, (_, step) => {
      const fraction = step / 4;
      return {
        x: guide[index].x + (point.x - guide[index].x) * fraction,
        y: guide[index].y + (point.y - guide[index].y) * fraction,
      };
    }));
  }).filter((point) => Math.abs(point.x - center) <= half && Math.abs(point.y - center) <= half);
  assert.ok(points.length > 0);
  for (const direction of ['north', 'south'] as const) {
    for (let progress = 500; progress <= 1000; progress += 2) {
      const pose = vehicleTransform(turns, car({ direction, laneId: 'left', turn: 'left', progress }));
      const angle = pose.rotation * Math.PI / 180;
      for (const point of points) {
        const dx = point.x - pose.x;
        const dy = point.y - pose.y;
        const along = dx * Math.cos(angle) + dy * Math.sin(angle);
        const across = -dx * Math.sin(angle) + dy * Math.cos(angle);
        assert.ok(Math.abs(along) > turns.geometry.carLength / 2 + 1.5 || Math.abs(across) > turns.geometry.carWidth / 2 + 1.5,
          `${direction} vehicle overlaps a guide at progress ${progress}`);
      }
    }
  }
});

test('the app renders the fresh simulation and the finished challenge with mode controls', () => {
  const fresh = renderToStaticMarkup(React.createElement(App));
  assert.ok(fresh.includes('Endlose Simulation:'));
  assert.ok(fresh.includes('aria-label="Spielmodus"'));
  assert.ok(fresh.includes('90-Sek.-Runde'));
  const save = JSON.stringify({ version: 3, levelId: basic.id, game: { ...empty(), gameMode: 'challenge', remainingMs: 0, score: 42 }, cityStats: {} });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => save } });
  try {
    const finished = renderToStaticMarkup(React.createElement(App));
    assert.ok(finished.includes('42 Punkte'));
    assert.ok(finished.includes('Nochmal'));
    assert.ok(finished.includes('<span>Zeit</span><strong>0:00</strong>'));
    assert.ok(finished.includes('<span>Leben</span>'));
  } finally { Reflect.deleteProperty(globalThis, 'localStorage'); }
});
