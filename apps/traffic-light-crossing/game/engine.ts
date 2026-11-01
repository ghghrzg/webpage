import {
  Direction,
  GameEvent,
  GameState,
  GameMode,
  LaneTurn,
  LevelConfig,
  LightColor,
  Phase,
  PhaseId,
  QueueCounts,
  Vehicle,
  VehicleKind,
  StopReason,
} from './types';

const FRAME_MS = 1000 / 60;
const CRASH_CLEAR_MS = 2000;
const VEHICLE_COLORS = ['#f97316', '#22c55e', '#38bdf8', '#a78bfa', '#f43f5e', '#facc15'];
const MOTORCYCLE_COLORS = ['#ef4444', '#22c55e', '#3b82f6'];

export function getLevelDirections(level: LevelConfig): Direction[] {
  return level.approaches.map((approach) => approach.direction);
}

export function getCenter(level: LevelConfig) {
  return level.geometry.board / 2;
}

export function getExitProgress(level: LevelConfig) {
  return level.geometry.board - level.geometry.start + level.geometry.carLength;
}

function getVehicleExitProgress(level: LevelConfig, vehicle: Pick<Vehicle, 'direction' | 'laneId' | 'turn'>) {
  if (vehicle.turn !== 'left') return getExitProgress(level);

  const { inboundOffset, radius, incomingLength, arcLength } = leftTurnGeometry(level, vehicle);
  const center = getCenter(level);
  const outgoingLen = level.geometry.board + level.geometry.carLength - (center + radius - inboundOffset);
  return incomingLength + arcLength + outgoingLen;
}

export function getStopProgress(level: LevelConfig) {
  const center = getCenter(level);
  return (
    center -
    level.geometry.roadHalf -
    level.geometry.stopLineOffset -
    level.geometry.carLength / 2 -
    level.geometry.start
  );
}

export function getIntersectionStart(level: LevelConfig) {
  return getCenter(level) - level.geometry.roadHalf - level.geometry.start;
}

export function getIntersectionEnd(level: LevelConfig) {
  return getCenter(level) + level.geometry.roadHalf - level.geometry.start;
}

export function getPhaseLabel(level: LevelConfig, phase: Phase) {
  if (phase === 'allRed') return 'Alle rot';
  return level.phases.find((item) => item.id === phase)?.label || phase;
}

export function getDirectionLabel(level: LevelConfig, direction: Direction) {
  return level.approaches.find((approach) => approach.direction === direction)?.label || direction;
}

function approachForDirection(level: LevelConfig, direction: Direction) {
  return level.approaches.find((approach) => approach.direction === direction);
}

function laneIdsForDirection(level: LevelConfig, direction: Direction) {
  const approach = approachForDirection(level, direction);
  if (!approach || approach.lanes.length === 0) return ['main'];
  return approach.lanes.map((lane) => lane.id);
}

function laneForVehicle(level: LevelConfig, vehicle: Pick<Vehicle, 'direction' | 'laneId'>) {
  const approach = approachForDirection(level, vehicle.direction);
  return approach?.lanes.find((lane) => lane.id === vehicle.laneId) || approach?.lanes[0];
}

function laneOffsetForDirection(level: LevelConfig, direction: Direction, strategy: 'first' | 'outermost' = 'first') {
  const approach = approachForDirection(level, direction);
  if (!approach || approach.lanes.length === 0) return level.geometry.laneOffset;
  const offsets = approach.lanes.map((lane) => lane.offset ?? level.geometry.laneOffset);
  if (strategy === 'outermost') return Math.max(...offsets);
  return offsets[0];
}

function leftTurnTargetDirection(direction: Direction): Direction {
  switch (direction) {
    case 'north':
      return 'east';
    case 'east':
      return 'south';
    case 'south':
      return 'west';
    case 'west':
      return 'north';
  }
}

function approachRotationDeg(direction: Direction) {
  switch (direction) {
    case 'north':
      return 0;
    case 'east':
      return 90;
    case 'south':
      return 180;
    case 'west':
      return -90;
  }
}

function rotateByDegrees(x: number, y: number, degrees: number) {
  const radians = (degrees * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  };
}

type VehiclePose = {
  x: number;
  y: number;
  dx: number;
  dy: number;
};

type VehicleRoute = Pick<Vehicle, 'direction' | 'laneId' | 'turn' | 'progress'>;

function leftTurnGeometry(level: LevelConfig, vehicle: Pick<Vehicle, 'direction' | 'laneId'>) {
  const inboundOffset = laneForVehicle(level, vehicle)?.offset ?? level.geometry.laneOffset;
  const outboundOffset = laneOffsetForDirection(level, leftTurnTargetDirection(vehicle.direction), 'outermost');
  // The turn begins before the centre so opposing left turns have room to pass.
  const radius = level.geometry.roadHalf + outboundOffset + level.geometry.carWidth;
  return {
    inboundOffset,
    outboundOffset,
    radius,
    incomingLength: getCenter(level) + outboundOffset - radius - level.geometry.start,
    arcLength: Math.PI * radius / 2,
  };
}

function straightPose(level: LevelConfig, vehicle: VehicleRoute, laneOffset: number): VehiclePose {
  const center = getCenter(level);
  const travel = level.geometry.start + vehicle.progress;

  switch (vehicle.direction) {
    case 'north':
      return { x: center - laneOffset, y: travel, dx: 0, dy: 1 };
    case 'south':
      return { x: center + laneOffset, y: level.geometry.board - travel, dx: 0, dy: -1 };
    case 'west':
      return { x: travel, y: center + laneOffset, dx: 1, dy: 0 };
    case 'east':
      return { x: level.geometry.board - travel, y: center - laneOffset, dx: -1, dy: 0 };
  }
}

function leftTurnPose(level: LevelConfig, vehicle: VehicleRoute): VehiclePose {
  const center = getCenter(level);
  const { inboundOffset, outboundOffset, radius, incomingLength, arcLength } = leftTurnGeometry(level, vehicle);
  const startLocalY = level.geometry.start - center;

  let localX = -inboundOffset;
  let localY = startLocalY + vehicle.progress;
  let localDx = 0;
  let localDy = 1;

  if (vehicle.progress > incomingLength) {
    const onTurn = vehicle.progress - incomingLength;
    if (onTurn <= arcLength) {
      const theta = Math.PI - onTurn / radius;
      const cx = radius - inboundOffset;
      const cy = outboundOffset - radius;
      localX = cx + radius * Math.cos(theta);
      localY = cy + radius * Math.sin(theta);
      localDx = Math.sin(theta);
      localDy = -Math.cos(theta);
    } else {
      const outLen = onTurn - arcLength;
      localX = radius - inboundOffset + outLen;
      localY = outboundOffset;
      localDx = 1;
      localDy = 0;
    }
  }

  const rotation = approachRotationDeg(vehicle.direction);
  const rotatedPoint = rotateByDegrees(localX, localY, rotation);
  const rotatedDir = rotateByDegrees(localDx, localDy, rotation);
  return {
    x: center + rotatedPoint.x,
    y: center + rotatedPoint.y,
    dx: rotatedDir.x,
    dy: rotatedDir.y,
  };
}

function lateralVectorForApproach(direction: Direction, dx: number, dy: number) {
  // Preserve existing approach semantics so motorcycle side-offset behavior stays backwards compatible.
  if (direction === 'north' || direction === 'south') {
    return { x: dy, y: -dx };
  }
  return { x: -dy, y: dx };
}

function vehiclePose(level: LevelConfig, vehicle: VehicleRoute): VehiclePose {
  const lane = laneForVehicle(level, vehicle);
  const laneOffset = lane?.offset ?? level.geometry.laneOffset;
  return vehicle.turn === 'left'
    ? leftTurnPose(level, vehicle)
    : straightPose(level, vehicle, laneOffset);
}

// The marking follows the inside edge of the left-turn lane, not the car's centre.
export function leftTurnGuidePoints(level: LevelConfig, direction: Direction, laneId: string) {
  const route: VehicleRoute = { direction, laneId, turn: 'left', progress: 0 };
  const { inboundOffset, outboundOffset, incomingLength, arcLength } = leftTurnGeometry(level, route);
  const pointAt = (progress: number, offset: number) => {
    const pose = vehiclePose(level, { ...route, progress });
    return { x: pose.x + pose.dy * offset, y: pose.y - pose.dx * offset };
  };
  const points = [pointAt(incomingLength - 46, inboundOffset)];
  const samples = 24;
  for (let index = 0; index <= samples; index += 1) {
    const fraction = index / samples;
    points.push(pointAt(incomingLength + arcLength * fraction,
      inboundOffset + (outboundOffset - inboundOffset) * fraction));
  }
  points.push(pointAt(incomingLength + arcLength + 34, outboundOffset));
  return points;
}

export function phaseForDirection(level: LevelConfig, direction: Direction): PhaseId {
  return approachForDirection(level, direction)?.phaseId || 'allRed';
}

export function phaseForVehicle(level: LevelConfig, vehicle: Pick<Vehicle, 'direction' | 'laneId'>): PhaseId {
  const approach = approachForDirection(level, vehicle.direction);
  if (!approach) return 'allRed';
  const lane = laneForVehicle(level, vehicle);
  return lane?.phaseId || approach.phaseId;
}

export function createInitialGame(level: LevelConfig, gameMode: GameMode = 'simulation'): GameState {
  return {
    levelId: level.id,
    gameMode,
    elapsedMs: 0,
    incidents: 0,
    activePhaseIds: [],
    nextVehicleId: 1,
    running: false,
    paused: false,
    over: false,
    score: 0,
    cars: 0,
    completedWaitMs: 0,
    lives: level.traffic.lives,
    streak: 0,
    bestStreak: 0,
    remainingMs: level.timings.gameMs,
    manualLights: createAllRedLights(level),
    manualSceneRequest: null,
    phase: 'allRed',
    targetPhase: 'allRed',
    yellowPhase: null,
    redYellowPhase: null,
    transitionKind: 'none',
    transitionTotalMs: 0,
    transitionId: 0,
    greenMs: 0,
    currentGroupGreenMs: 0,
    lastGroupGreenMs: 0,
    switchMs: 0,
    spawnMsByDirection: createInitialSpawnTimers(level),
    spillCooldownMs: 0,
    vehicles: [],
    message: 'Bring die Autos durch, ohne die Kreuzung zu verstopfen.',
  };
}

export function formatTime(ms: number) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export function lightForDirection(
  state: Pick<GameState, 'manualLights'>,
  level: LevelConfig,
  direction: Direction,
): LightColor {
  const phase = phaseForDirection(level, direction);
  return lightForPhase(state, phase);
}

export function lightForPhase(
  state: Pick<GameState, 'manualLights'>,
  phase: PhaseId,
): LightColor {
  return state.manualLights[phase] || 'red';
}

export function vehicleTransform(level: LevelConfig, vehicle: Vehicle) {
  const pose = vehiclePose(level, vehicle);
  const lateral = lateralVectorForApproach(vehicle.direction, pose.dx, pose.dy);
  const x = pose.x + lateral.x * vehicle.lateralOffset;
  const y = pose.y + lateral.y * vehicle.lateralOffset;
  const rotation = (Math.atan2(pose.dy, pose.dx) * 180) / Math.PI;
  return { x, y, rotation };
}

// Separating-axis test for the actual rotated vehicle bodies, including turns.
export function vehiclesOverlap(level: LevelConfig, a: Vehicle, b: Vehicle) {
  const box = (vehicle: Vehicle) => {
    const pose = vehiclePose(level, vehicle);
    const position = vehicleTransform(level, vehicle);
    return {
      ...position,
      axes: [{ x: pose.dx, y: pose.dy }, { x: -pose.dy, y: pose.dx }],
      halfLength: level.geometry.carLength * (vehicle.kind === 'motorcycle' ? 0.45 : 1) / 2,
      halfWidth: level.geometry.carWidth * (vehicle.kind === 'motorcycle' ? 0.42 : 1) / 2,
    };
  };
  const first = box(a);
  const second = box(b);
  if (Math.hypot(first.x - second.x, first.y - second.y) > level.geometry.carLength * 1.5) return false;
  const dot = (u: { x: number; y: number }, v: { x: number; y: number }) => u.x * v.x + u.y * v.y;
  return [...first.axes, ...second.axes].every((axis) => {
    const radius = (body: typeof first) =>
      body.halfLength * Math.abs(dot(axis, body.axes[0])) + body.halfWidth * Math.abs(dot(axis, body.axes[1]));
    return Math.abs(dot(axis, { x: first.x - second.x, y: first.y - second.y })) < radius(first) + radius(second) - 1;
  });
}

export function queueCounts(level: LevelConfig, vehicles: Vehicle[]): QueueCounts {
  const stopProgress = getStopProgress(level);
  return getLevelDirections(level).reduce((counts, direction) => {
    counts[direction] = vehicles.filter(
      (vehicle) => vehicle.direction === direction && !vehicle.crashed && vehicle.progress <= stopProgress + level.traffic.stopEpsilon,
    ).length;
    return counts;
  }, {} as QueueCounts);
}

export function requestPhase(state: GameState, phase: Phase, level: LevelConfig): GameState {
  return applyManualScene(state, phase === 'allRed' ? [] : [phase], level);
}

export function setAllRed(state: GameState, level: LevelConfig): GameState {
  return applyManualScene(state, [], level);
}

export function applyManualScene(state: GameState, phaseIds: PhaseId[], level: LevelConfig): GameState {
  if (state.over || phaseIds.some((id) => !level.phases.some((phase) => phase.id === id))) return state;
  const requested = [...new Set(phaseIds)];
  const target = state.manualSceneRequest ?? state.activePhaseIds;
  if (requested.length === target.length && requested.every((id) => target.includes(id))) return state;

  const retained = requested.filter((id) => state.manualLights[id] === 'green');
  const retiring = level.phases.filter((phase) => state.manualLights[phase.id] === 'green' && !requested.includes(phase.id));
  const lights = createAllRedLights(level);
  retained.forEach((id) => { lights[id] = 'green'; });
  retiring.forEach(({ id }) => { lights[id] = 'yellow'; });
  // A lamp already on yellow must complete that phase, even if requested again.
  level.phases.forEach(({ id }) => {
    if (state.manualLights[id] === 'yellow') lights[id] = 'yellow';
  });
  const yellowIds = level.phases.filter(({ id }) => lights[id] === 'yellow').map(({ id }) => id);
  const keepTransition = retiring.length === 0 && (state.transitionKind === 'yellow' || state.transitionKind === 'allRed');
  const duration = yellowIds.length > 0 ? level.timings.yellowMs : level.timings.allRedMs;
  const finishedGroup = state.transitionKind === 'none' && state.activePhaseIds.length > 0;
  return {
    ...state, running: true, manualLights: lights, manualSceneRequest: requested,
    activePhaseIds: retained, phase: retained[0] ?? 'allRed', targetPhase: requested[0] ?? 'allRed',
    yellowPhase: yellowIds[0] ?? null, redYellowPhase: null,
    transitionKind: yellowIds.length > 0 ? 'yellow' : 'allRed',
    transitionTotalMs: keepTransition ? state.transitionTotalMs : duration,
    switchMs: keepTransition ? state.switchMs : duration,
    transitionId: keepTransition ? state.transitionId : state.transitionId + 1,
    greenMs: retained.length > 0 ? state.greenMs : 0,
    currentGroupGreenMs: finishedGroup ? 0 : state.currentGroupGreenMs,
    lastGroupGreenMs: finishedGroup ? state.currentGroupGreenMs : state.lastGroupGreenMs,
    message: retained.length > 0
      ? 'Gruppenwechsel. Gemeinsame Freigaben bleiben gruen.'
      : yellowIds.length > 0 ? 'Gelb. Die Kreuzung wird geraeumt.' : 'Raeumzeit. Alle Ampeln rot.',
  };
}

function crossingOccupied(level: LevelConfig, vehicles: Vehicle[], retainedPhases: PhaseId[]) {
  const center = getCenter(level);
  const edge = level.geometry.roadHalf + level.geometry.carLength / 2;
  return vehicles.some((vehicle) => {
    if (!vehicle.crashed && retainedPhases.includes(phaseForVehicle(level, vehicle))) return false;
    if (vehicle.progress <= getStopProgress(level) + level.traffic.stopEpsilon) return false;
    const pos = vehicleTransform(level, vehicle);
    return Math.abs(pos.x - center) < edge && Math.abs(pos.y - center) < edge;
  });
}

function advanceSignals(state: GameState, level: LevelConfig): GameState {
  if (state.transitionKind === 'none') return { ...state, greenMs: state.greenMs + level.timings.updateMs };
  if (state.activePhaseIds.length > 0) state = { ...state, greenMs: state.greenMs + level.timings.updateMs };
  const switchMs = Math.max(0, state.switchMs - level.timings.updateMs);
  if (switchMs > 0.001) return { ...state, switchMs };
  const requested = state.manualSceneRequest ?? [];
  const retainedLights = createAllRedLights(level);
  state.activePhaseIds.forEach((id) => { retainedLights[id] = 'green'; });
  if (state.transitionKind === 'yellow') {
    return {
      ...state, manualLights: retainedLights, yellowPhase: null,
      transitionKind: 'allRed', switchMs: level.timings.allRedMs,
      transitionTotalMs: level.timings.allRedMs,
      message: state.activePhaseIds.length > 0 ? 'Raeumzeit. Gemeinsame Freigaben bleiben gruen.' : 'Raeumzeit. Alle Ampeln rot.',
    };
  }
  if (state.transitionKind === 'allRed') {
    if (crossingOccupied(level, state.vehicles, state.activePhaseIds)) return { ...state, switchMs: 0 };
    const starting = requested.filter((id) => !state.activePhaseIds.includes(id));
    if (starting.length > 0) {
      starting.forEach((id) => { retainedLights[id] = 'redYellow'; });
      return {
        ...state, manualLights: retainedLights, redYellowPhase: starting[0],
        transitionKind: 'redYellow', switchMs: level.timings.redYellowMs,
        transitionTotalMs: level.timings.redYellowMs, message: 'Rot-Gelb. Gleich geht es los.',
      };
    }
  }
  const lights = createAllRedLights(level);
  requested.forEach((id) => { lights[id] = 'green'; });
  return {
    ...state, manualLights: lights, activePhaseIds: requested, manualSceneRequest: null,
    phase: requested[0] ?? 'allRed', redYellowPhase: null, yellowPhase: null,
    transitionKind: 'none', switchMs: 0, transitionTotalMs: 0,
    greenMs: state.activePhaseIds.length > 0 ? state.greenMs : 0,
    message: requested.length ? requested.map((id) => getPhaseLabel(level, id)).join(' + ') + ' ist gruen.' : 'Alle Ampeln rot.',
  };
}

export function tickGame(state: GameState, level: LevelConfig): { state: GameState; events: GameEvent[] } {
  if (!state.running || state.paused || state.over) return { state, events: [] };

  const groupWasGreen = state.transitionKind === 'none' && state.activePhaseIds.length > 0;
  const groupUpdateMs = state.gameMode === 'challenge'
    ? Math.min(level.timings.updateMs, state.remainingMs)
    : level.timings.updateMs;
  state = advanceSignals(state, level);
  if (groupWasGreen) state = { ...state, currentGroupGreenMs: state.currentGroupGreenMs + groupUpdateMs };
  const events: GameEvent[] = [];
  const updateMs = level.timings.updateMs;
  const stopProgress = getStopProgress(level);
  const directions = getLevelDirections(level);
  const elapsedMs = state.elapsedMs + updateMs;
  const { manualLights, greenMs } = state;
  const spawnMsByDirection = { ...state.spawnMsByDirection };
  let { score, cars, completedWaitMs, streak, bestStreak, message, nextVehicleId, incidents } = state;
  let lives = state.lives;
  let spillCooldownMs = Math.max(0, state.spillCooldownMs - updateMs);
  const remainingMs = state.gameMode === 'challenge' ? Math.max(0, state.remainingMs - updateMs) : state.remainingMs;
  let vehicles = state.vehicles.map((vehicle) => ({ ...vehicle }));
  const frameScale = updateMs / FRAME_MS;

  if (vehicles.length < level.traffic.maxVehicles) {
    const liveQueues = queueCounts(level, vehicles);
    directions.forEach((direction) => {
      const currentTimer = spawnMsByDirection[direction] ?? level.traffic.spawnInitialMs;
      const nextTimer = currentTimer - updateMs;
      if (nextTimer > 0) {
        spawnMsByDirection[direction] = nextTimer;
        return;
      }

      const demand = trafficDemand(level, direction, elapsedMs);
      const queuePressure = Math.min(0.42, (liveQueues[direction] || 0) * 0.045);
      const laneIds = laneIdsForDirection(level, direction);
      const freeLaneIds = laneIds.filter((laneId) => !hasVehicleNearSpawn(level, vehicles, direction, laneId));
      const spawnLaneId = freeLaneIds.length > 0 ? freeLaneIds[Math.floor(Math.random() * freeLaneIds.length)] : null;
      const spawnAllowed =
        demand > 0.34 &&
        vehicles.length < level.traffic.maxVehicles &&
        Boolean(spawnLaneId);

      if (spawnAllowed && spawnLaneId) {
        const activeMotorcycles = vehicles.filter(
          (vehicle) =>
            vehicle.direction === direction &&
            vehicle.kind === 'motorcycle' &&
            vehicle.progress < stopProgress,
        ).length;
        vehicles.push(createVehicle(nextVehicleId, level, direction, spawnLaneId, score, activeMotorcycles));
        nextVehicleId += 1;
      }

      spawnMsByDirection[direction] = nextSpawnDelay(level, direction, elapsedMs, demand, queuePressure, !spawnAllowed);
    });
  }

  const nextVehicles: Vehicle[] = [];

  directions.forEach((direction) => {
    laneIdsForDirection(level, direction).forEach((laneId) => {
      const group = vehicles
        .filter((vehicle) => vehicle.direction === direction && vehicle.laneId === laneId)
        .sort((a, b) => b.progress - a.progress);

      group.forEach((vehicle, index) => {
      const phaseId = phaseForVehicle(level, vehicle);
      const light = lightForPhase(
        { manualLights },
        phaseId,
      );

      if (vehicle.crashed) {
        const crashMs = vehicle.crashMs > 0 ? vehicle.crashMs : CRASH_CLEAR_MS;
        nextVehicles.push({
          ...vehicle,
          crashMs: Math.max(0, crashMs - updateMs),
          speed: 0,
          stopReason: 'crashed',
          brakeLight: false,
          brakeLightMs: 0,
        });
        return;
      }

      if (vehicle.confusedMs > 0) {
        nextVehicles.push({
          ...vehicle,
          confusedMs: Math.max(0, vehicle.confusedMs - updateMs),
          speed: 0,
          waitMs: vehicle.waitMs + updateMs,
          stopReason: 'manual_block',
          brakeLight: true,
          brakeLightMs: level.timings.brakeLightStopHoldMs,
        });
        return;
      }

      const cooledThinkMs = Math.max(0, vehicle.thinkCooldownMs - updateMs);
      const canCooldownReason =
        vehicle.stopReason === 'red_light' ||
        vehicle.stopReason === 'red_yellow' ||
        vehicle.stopReason === 'yellow_hold' ||
        vehicle.stopReason === 'cross_traffic' ||
        vehicle.stopReason === 'lead_vehicle';
      const canCheapWait =
        light !== 'green' &&
        cooledThinkMs > 0 &&
        vehicle.speed < 0.06 &&
        vehicle.progress >= stopProgress - 24 &&
        vehicle.progress <= stopProgress + 10 &&
        canCooldownReason &&
        vehicle.kind !== 'motorcycle';

      if (canCheapWait) {
        nextVehicles.push({
          ...vehicle,
          speed: 0,
          waitMs: vehicle.waitMs + updateMs,
          brakeLight: true,
          brakeLightMs: Math.max(level.timings.brakeLightStopHoldMs, vehicle.brakeLightMs),
          thinkCooldownMs: cooledThinkMs,
        });
        return;
      }

      const ahead = group[index - 1];
      let limit = Number.POSITIVE_INFINITY;
      const filterTargetOffset = 0;
      const filteredMergeMs = 0;
      let stopReason: StopReason = vehicle.stopReason === 'moving' ? 'moving' : vehicle.stopReason;

      if (ahead) {
        limit = Math.min(limit, ahead.progress - followingDistance(level, vehicle, ahead));
        stopReason = 'lead_vehicle';
      }

      let canProceed = light === 'green';
      if (light === 'yellow') {
        if (vehicle.yellowDecisionId !== state.transitionId) {
          const distance = stopProgress - vehicle.progress;
          const brakingDistance = vehicle.speed * vehicle.speed / (2 * vehicle.braking);
          vehicle.yellowDecisionId = state.transitionId;
          vehicle.yellowProceed = vehicle.speed > 0.1 && distance < brakingDistance + vehicle.speed * frameScale;
        }
        canProceed = vehicle.yellowProceed;
      }
      const greenReactionHold = light === 'green' &&
        vehicle.progress <= stopProgress + level.traffic.stopEpsilon &&
        vehicle.speed < 0.08 && greenMs < vehicle.reactionMs;
      const stopIntent =
        (!canProceed || greenReactionHold) &&
        vehicle.progress <= stopProgress + level.traffic.stopEpsilon;
      if (stopIntent) {
        limit = Math.min(limit, stopProgress);
        if (greenReactionHold) stopReason = 'reaction';
        else if (!canProceed) {
          if (light === 'red') stopReason = 'red_light';
          else if (light === 'redYellow') stopReason = 'red_yellow';
          else if (light === 'yellow') stopReason = 'yellow_hold';
        }
      }
      const advanced = advanceVehicle(
        { ...vehicle, filteredMergeMs, thinkCooldownMs: cooledThinkMs },
        level,
        limit,
        frameScale,
        stopIntent,
        filterTargetOffset,
      );
      if (advanced.speed > 0.08) stopReason = 'moving';
      advanced.stopReason = stopReason;
      advanced.thinkCooldownMs =
        advanced.speed < 0.06 &&
        (stopReason === 'red_light' ||
          stopReason === 'red_yellow' ||
          stopReason === 'yellow_hold' ||
          stopReason === 'lead_vehicle')
          ? Math.max(48, Math.min(140, advanced.reactionMs * 0.26))
          : 0;
      const isDelayed = (stopIntent || Number.isFinite(limit)) && advanced.speed < advanced.maxSpeed * 0.65;
      if (!advanced.crashed && isDelayed && advanced.progress < getVehicleExitProgress(level, advanced)) {
        advanced.waitMs += updateMs;
      }
      nextVehicles.push(advanced);
      });
    });
  });

  const movedVehicles = enforceVehicleSpacing(level, nextVehicles);
  const collidingIds = new Set<number>();
  for (let i = 0; i < movedVehicles.length; i += 1) {
    for (let j = i + 1; j < movedVehicles.length; j += 1) {
      const a = movedVehicles[i];
      const b = movedVehicles[j];
      if (a.crashed && b.crashed) continue;
      if (a.direction === b.direction && a.laneId === b.laneId) continue;
      if (vehiclesOverlap(level, a, b)) {
        if (!a.crashed) collidingIds.add(a.id);
        if (!b.crashed) collidingIds.add(b.id);
      }
    }
  }
  if (collidingIds.size > 0) {
    incidents += 1;
    if (state.gameMode === 'challenge') lives = Math.max(0, lives - 1);
    streak = 0;
    message = 'Unfall. Die Kreuzung wird geraeumt.';
    events.push('crash');
    movedVehicles.forEach((vehicle) => {
      if (!collidingIds.has(vehicle.id)) return;
      vehicle.crashed = true;
      vehicle.crashMs = CRASH_CLEAR_MS;
      vehicle.speed = 0;
      vehicle.stopReason = 'crashed';
    });
  }

  const afterPass: Vehicle[] = [];
  movedVehicles.forEach((vehicle) => {
    if (vehicle.progress > getVehicleExitProgress(level, vehicle)) {
      if (!vehicle.crashed) {
        cars += 1;
        completedWaitMs += vehicle.waitMs;
        streak += 1;
        bestStreak = Math.max(bestStreak, streak);
        score += scoreVehicle(level, vehicle.waitMs, streak);
        events.push('success');
      }
      return;
    }

    if (vehicle.crashed && vehicle.crashMs <= 0) return;
    afterPass.push(vehicle);
  });
  vehicles = afterPass;

  if (state.gameMode === 'challenge' && spillCooldownMs <= 0 && vehicles.some((vehicle) =>
    !vehicle.crashed && vehicle.progress <= stopProgress + level.traffic.stopEpsilon && vehicle.waitMs >= 30_000,
  )) {
    lives = Math.max(0, lives - 1);
    streak = 0;
    spillCooldownMs = 8000;
    message = 'Zu lange Wartezeit: ein Leben verloren. Loese den Rueckstau!';
    events.push('warning');
  }
  const over = state.gameMode === 'challenge' && (remainingMs <= 0.001 || lives <= 0);
  if (over) message = lives <= 0 ? 'Keine Leben mehr.' : 'Zeit abgelaufen.';

  const baseState: GameState = {
    ...state, nextVehicleId, vehicles, spawnMsByDirection, elapsedMs, incidents,
    score, cars, completedWaitMs, streak, bestStreak, message, lives, spillCooldownMs,
    remainingMs: remainingMs <= 0.001 ? 0 : remainingMs, over, running: !over,
  };

  return { state: baseState, events };
}

function hasVehicleNearSpawn(level: LevelConfig, vehicles: Vehicle[], direction: Direction, laneId: string) {
  return vehicles.some(
    (vehicle) =>
      vehicle.direction === direction &&
      vehicle.laneId === laneId &&
      vehicle.progress < level.traffic.safeGap,
  );
}

function createInitialSpawnTimers(level: LevelConfig) {
  return getLevelDirections(level).reduce(
    (timers, direction, index) => {
      timers[direction] = level.traffic.spawnInitialMs + index * 260;
      return timers;
    },
    {} as Record<Direction, number>,
  );
}

function rand(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function pseudoRandom(seed: number) {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function directionIndex(direction: Direction) {
  switch (direction) {
    case 'north':
      return 0;
    case 'east':
      return 1;
    case 'south':
      return 2;
    case 'west':
      return 3;
  }
}

function smoothPulse(timeMs: number, periodMs: number, phase: number) {
  return (Math.sin((timeMs / periodMs) * Math.PI * 2 + phase) + 1) / 2;
}

function trafficDemand(level: LevelConfig, direction: Direction, elapsedMs: number) {
  const index = directionIndex(direction);
  const baseBias = [0.46, 0.38, 0.43, 0.35][index];
  const mainWave = smoothPulse(elapsedMs, 24_000 + index * 2300, index * 1.45);
  const platoonWave = smoothPulse(elapsedMs, 9_500 + index * 800, index * 2.1 + 0.6);
  const quietWave = smoothPulse(elapsedMs, 31_000 + index * 1900, index * 1.3 + 2.8);
  const latePressure = Math.min(0.14, (elapsedMs / 90_000) * 0.18);
  let demand = baseBias * 0.24 + mainWave * 0.3 + platoonWave * 0.18 + latePressure;

  if (quietWave < 0.26) demand *= 0.06;
  if (platoonWave > 0.86 && mainWave > 0.52) demand += 0.1;

  return Math.max(0, Math.min(1, demand));
}

function nextSpawnDelay(
  level: LevelConfig,
  direction: Direction,
  elapsedMs: number,
  demand: number,
  queuePressure: number,
  blocked: boolean,
) {
  if (demand <= 0.34) return 1450 + directionIndex(direction) * 170;
  if (blocked) return 360 + directionIndex(direction) * 45;

  const index = directionIndex(direction);
  const deterministicJitter =
    (pseudoRandom(Math.floor(elapsedMs / 1000) * 53 + index * 997) - 0.5) * level.traffic.spawnVarianceMs;
  const demandFactor = 1.25 - demand;
  const pressureFactor = 1 + queuePressure;
  return Math.max(
    820,
    level.traffic.spawnBaseMs * demandFactor * pressureFactor + deterministicJitter,
  );
}

function createAllRedLights(level: LevelConfig) {
  return level.phases.reduce(
    (lights, phase) => {
      lights[phase.id] = 'red';
      return lights;
    },
    {} as Record<PhaseId, LightColor>,
  );
}

export function lightLabel(light: LightColor) {
  switch (light) {
    case 'red':
      return 'Rot';
    case 'redYellow':
      return 'Rot-Gelb';
    case 'green':
      return 'Gruen';
    case 'yellow':
      return 'Gelb';
  }
}

function scoreVehicle(level: LevelConfig, waitMs: number, streak: number) {
  const waitRatio = Math.min(2, waitMs / level.scoring.targetWaitMs);
  const waitQuality = Math.max(0, 1 - waitRatio / 2);
  const base = Math.round(
    level.scoring.minPointsPerCar +
    (level.scoring.pointsPerCar - level.scoring.minPointsPerCar) * waitQuality,
  );
  const streakBonus = Math.min(
    level.scoring.streakBonusMax,
    Math.floor(streak / level.scoring.streakBonusEvery) * level.scoring.streakBonusStep,
  );
  return base + streakBonus;
}

function updateLateralMotion(vehicle: Vehicle, targetOffset: number, frameScale: number) {
  if (vehicle.kind !== 'motorcycle') return { offset: 0, velocity: 0 };

  const delta = targetOffset - vehicle.lateralOffset;
  const distance = Math.abs(delta);
  const direction = Math.sign(delta);
  const maxVelocity = targetOffset !== 0 ? 1.12 : 0.62;
  const blend = targetOffset !== 0 ? 0.16 : 0.095;
  const t = Math.min(1, distance / 24);
  const easedSpeed = maxVelocity * t * t * (3 - 2 * t);
  let velocity = vehicle.lateralVelocity + (direction * easedSpeed - vehicle.lateralVelocity) * blend * frameScale;
  velocity = Math.max(-maxVelocity, Math.min(maxVelocity, velocity));
  let offset = vehicle.lateralOffset + velocity * frameScale;

  if (Math.sign(targetOffset - offset) !== direction && distance > 0) {
    offset = targetOffset;
    velocity = 0;
  }

  if (Math.abs(targetOffset - offset) < 0.2 && Math.abs(velocity) < 0.05) {
    offset = targetOffset;
    velocity = 0;
  }

  return { offset, velocity };
}

function followingDistance(level: LevelConfig, vehicle: Vehicle, ahead: Vehicle) {
  const baseGap = Math.max(48, level.traffic.safeGap + vehicle.followGap);
  if (vehicle.kind === 'motorcycle' && ahead.kind === 'motorcycle') return Math.max(32, baseGap - 18);
  if (vehicle.kind === 'motorcycle') return Math.max(34, baseGap - 14);
  if (ahead.kind === 'motorcycle') return Math.max(46, baseGap - 4);
  return baseGap;
}

function enforceVehicleSpacing(level: LevelConfig, vehicles: Vehicle[]) {
  const byId = new Map(vehicles.map((vehicle) => [vehicle.id, { ...vehicle }]));

  getLevelDirections(level).forEach((direction) => {
    laneIdsForDirection(level, direction).forEach((laneId) => {
      const group = vehicles
        .filter((vehicle) => vehicle.direction === direction && vehicle.laneId === laneId)
        .sort((a, b) => b.progress - a.progress);

      for (let index = 1; index < group.length; index += 1) {
        const follower = byId.get(group[index].id);
        if (!follower || follower.crashed) continue;

        for (let aheadIndex = index - 1; aheadIndex >= 0; aheadIndex -= 1) {
          const ahead = byId.get(group[aheadIndex].id);
          if (!ahead) continue;

          const gap = followingDistance(level, follower, ahead);

          const maxProgress = ahead.progress - gap;
          if (follower.progress > maxProgress + 0.08) {
            follower.progress = Math.max(0, maxProgress);
            follower.speed = Math.min(follower.speed, Math.max(0, ahead.speed));
            follower.brakeLight = true;
            follower.brakeLightMs = Math.max(follower.brakeLightMs, level.timings.brakeLightStopHoldMs);
          }
          break;
        }
      }
    });
  });

  return vehicles.map((vehicle) => byId.get(vehicle.id) || vehicle);
}

function createVehicle(
  id: number,
  level: LevelConfig,
  direction: Direction,
  laneId: string,
  score: number,
  activeMotorcycles: number,
): Vehicle {
  let kind: VehicleKind = 'regular';
  if (
    activeMotorcycles < level.traffic.maxMotorcyclesPerApproach &&
    Math.random() < level.traffic.motorcycleChance
  ) kind = 'motorcycle';
  else if (Math.random() < level.traffic.sportChance) kind = 'sport';
  const maxSpeed = rand(1.35, 1.92) + Math.min(0.45, score / 1200);
  const acceleration = rand(0.022, 0.044);
  const isMotorcycle = kind === 'motorcycle';
  const lane = approachForDirection(level, direction)?.lanes.find((item) => item.id === laneId);
  const turns = lane?.turns && lane.turns.length > 0 ? lane.turns : (['straight'] as LaneTurn[]);
  const turn = turns[Math.floor(Math.random() * turns.length)] || 'straight';

  return {
    id,
    direction,
    laneId,
    turn,
    progress: 0,
    speed: rand(0.28, 0.72),
    maxSpeed: kind === 'sport' ? maxSpeed * 2 : isMotorcycle ? maxSpeed * 1.2 : maxSpeed,
    acceleration: kind === 'sport' ? acceleration * 2 : isMotorcycle ? acceleration * 1.45 : acceleration,
    braking: isMotorcycle ? rand(0.1, 0.15) : rand(0.078, 0.13),
    reactionMs: kind === 'sport' ? rand(80, 180) : isMotorcycle ? rand(70, 170) : rand(110, 310),
    followGap: isMotorcycle ? rand(0, 8) : rand(-7, 8),
    waitMs: 0,
    lateralOffset: 0,
    lateralVelocity: 0,
    filteredMergeMs: 0,
    kind,
    yellowDecisionId: null,
    yellowProceed: false,
    brakeLight: false,
    brakeLightMs: 0,
    hue: kind === 'sport' ? '#e5e7eb' : isMotorcycle ? MOTORCYCLE_COLORS[id % MOTORCYCLE_COLORS.length] : VEHICLE_COLORS[id % VEHICLE_COLORS.length],
    crashed: false,
    crashMs: 0,
    confusedMs: 0,
    stopReason: 'moving',
    noVisibleExhaust: Math.random() < 0.5,
    thinkCooldownMs: 0,
  };
}

function advanceVehicle(
  vehicle: Vehicle,
  level: LevelConfig,
  limit: number,
  frameScale: number,
  stopIntent: boolean,
  targetLateralOffset: number,
): Vehicle {
  const coolingBrakeMs = Math.max(0, vehicle.brakeLightMs - level.timings.updateMs);
  const lateral = updateLateralMotion(vehicle, targetLateralOffset, frameScale);

  if (!Number.isFinite(limit)) {
    const speed = Math.min(vehicle.maxSpeed, vehicle.speed + vehicle.acceleration * frameScale);
    return {
      ...vehicle,
      speed,
      progress: vehicle.progress + speed * frameScale,
      lateralOffset: lateral.offset,
      lateralVelocity: lateral.velocity,
      brakeLightMs: coolingBrakeMs,
      brakeLight: coolingBrakeMs > 0,
    };
  }

  const distance = limit - vehicle.progress;
  if (distance <= Math.max(level.traffic.stopEpsilon, 1.2) && vehicle.speed < 0.22) {
    return {
      ...vehicle,
      progress: Math.max(vehicle.progress, limit),
      speed: 0,
      lateralOffset: lateral.offset,
      lateralVelocity: lateral.velocity,
      brakeLightMs: stopIntent ? level.timings.brakeLightStopHoldMs : coolingBrakeMs,
      brakeLight: stopIntent || coolingBrakeMs > 0,
    };
  }

  const reactionFrames = vehicle.reactionMs / FRAME_MS;
  const stoppingDistance = (vehicle.speed * vehicle.speed) / (2 * vehicle.braking) + vehicle.speed * reactionFrames * 0.08;
  const shouldBrake = distance <= stoppingDistance + (stopIntent ? 8 : 5);
  const nextSpeed = shouldBrake
    ? Math.max(0, vehicle.speed - vehicle.braking * frameScale)
    : Math.min(vehicle.maxSpeed, vehicle.speed + vehicle.acceleration * frameScale);

  if (stopIntent && nextSpeed < 0.06 && distance < 6) {
    return {
      ...vehicle,
      progress: Math.max(vehicle.progress, limit),
      speed: 0,
      lateralOffset: lateral.offset,
      lateralVelocity: lateral.velocity,
      brakeLightMs: level.timings.brakeLightStopHoldMs,
      brakeLight: true,
    };
  }

  const nextProgress = vehicle.progress + nextSpeed * frameScale;

  if (nextProgress >= limit) {
    return {
      ...vehicle,
      progress: Math.max(vehicle.progress, limit),
      speed: 0,
      lateralOffset: lateral.offset,
      lateralVelocity: lateral.velocity,
      brakeLightMs: stopIntent ? level.timings.brakeLightStopHoldMs : coolingBrakeMs,
      brakeLight: stopIntent || coolingBrakeMs > 0,
    };
  }

  const strongDecel = vehicle.speed - nextSpeed > 0.055 * frameScale;
  const brakeLightMs =
    stopIntent && (shouldBrake || strongDecel) ? level.timings.brakeLightHoldMs : coolingBrakeMs;

  return {
    ...vehicle,
    progress: nextProgress,
    speed: nextSpeed,
    lateralOffset: lateral.offset,
    lateralVelocity: lateral.velocity,
    brakeLightMs,
    brakeLight: brakeLightMs > 0,
  };
}
