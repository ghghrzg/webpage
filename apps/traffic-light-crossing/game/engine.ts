import {
  Direction,
  GameEvent,
  GameState,
  LaneTurn,
  LevelConfig,
  LightColor,
  ManualTransition,
  Phase,
  PhaseId,
  QueueCounts,
  TransitionKind,
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

  const lane = laneForVehicle(level, vehicle);
  const inboundOffset = lane?.offset ?? level.geometry.laneOffset;
  const targetDirection = leftTurnTargetDirection(vehicle.direction);
  const outboundOffset = laneOffsetForDirection(level, targetDirection, 'outermost');
  const radius = Math.max(12, inboundOffset + outboundOffset);
  const center = getCenter(level);
  const incomingLen = center - inboundOffset - level.geometry.start;
  const arcLen = (Math.PI / 2) * radius;
  const outgoingLen = level.geometry.board + level.geometry.carLength - (center + outboundOffset);
  return incomingLen + arcLen + outgoingLen;
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
      return 'west';
    case 'east':
      return 'north';
    case 'south':
      return 'east';
    case 'west':
      return 'south';
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

function straightPose(level: LevelConfig, vehicle: Vehicle, laneOffset: number): VehiclePose {
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

function leftTurnPose(level: LevelConfig, vehicle: Vehicle, inboundOffset: number): VehiclePose {
  const center = getCenter(level);
  const targetDirection = leftTurnTargetDirection(vehicle.direction);
  const outboundOffset = laneOffsetForDirection(level, targetDirection, 'outermost');
  const radius = Math.max(12, inboundOffset + outboundOffset);
  const startLocalY = level.geometry.start - center;
  const incomingLen = -inboundOffset - startLocalY;
  const arcLen = (Math.PI / 2) * radius;

  let localX = -inboundOffset;
  let localY = startLocalY + vehicle.progress;
  let localDx = 0;
  let localDy = 1;

  if (vehicle.progress > incomingLen) {
    const onTurn = vehicle.progress - incomingLen;
    if (onTurn <= arcLen) {
      const theta = Math.PI - onTurn / radius;
      const cx = outboundOffset;
      const cy = -inboundOffset;
      localX = cx + radius * Math.cos(theta);
      localY = cy + radius * Math.sin(theta);
      localDx = Math.sin(theta);
      localDy = -Math.cos(theta);
    } else {
      const outLen = onTurn - arcLen;
      localX = outboundOffset + outLen;
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

function vehiclePose(level: LevelConfig, vehicle: Vehicle): VehiclePose {
  const lane = laneForVehicle(level, vehicle);
  const laneOffset = lane?.offset ?? level.geometry.laneOffset;
  return vehicle.turn === 'left'
    ? leftTurnPose(level, vehicle, laneOffset)
    : straightPose(level, vehicle, laneOffset);
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

export function createInitialGame(level: LevelConfig): GameState {
  return {
    levelId: level.id,
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
    controlMode: 'auto',
    manualLights: createAllRedLights(level),
    manualTransitions: createEmptyManualTransitions(level),
    manualSceneRequest: null,
    phase: 'allRed',
    targetPhase: 'allRed',
    yellowPhase: null,
    redYellowPhase: null,
    transitionKind: 'none',
    transitionTotalMs: 0,
    transitionId: 0,
    greenMs: 0,
    switchMs: 0,
    spawnMs: level.traffic.spawnInitialMs,
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
  state: Pick<GameState, 'controlMode' | 'manualLights' | 'phase' | 'yellowPhase' | 'redYellowPhase'>,
  level: LevelConfig,
  direction: Direction,
): LightColor {
  const phase = phaseForDirection(level, direction);
  return lightForPhase(state, phase);
}

export function lightForPhase(
  state: Pick<GameState, 'controlMode' | 'manualLights' | 'phase' | 'yellowPhase' | 'redYellowPhase'>,
  phase: PhaseId,
): LightColor {
  if (state.controlMode === 'manual') return state.manualLights[phase] || 'red';
  if (state.yellowPhase === phase) return 'yellow';
  if (state.redYellowPhase === phase) return 'redYellow';
  if (!state.yellowPhase && !state.redYellowPhase && state.phase === phase) return 'green';
  return 'red';
}

export function vehicleTransform(level: LevelConfig, vehicle: Vehicle) {
  const pose = vehiclePose(level, vehicle);
  const lateral = lateralVectorForApproach(vehicle.direction, pose.dx, pose.dy);
  const x = pose.x + lateral.x * vehicle.lateralOffset;
  const y = pose.y + lateral.y * vehicle.lateralOffset;
  const rotation = (Math.atan2(pose.dy, pose.dx) * 180) / Math.PI;
  return { x, y, rotation };
}

function hasVehicleExited(level: LevelConfig, vehicle: Vehicle) {
  const margin = level.geometry.carLength;
  const pos = vehicleTransform(level, vehicle);
  return (
    pos.x < -margin ||
    pos.y < -margin ||
    pos.x > level.geometry.board + margin ||
    pos.y > level.geometry.board + margin
  );
}

export function queueCounts(level: LevelConfig, vehicles: Vehicle[]): QueueCounts {
  const stopProgress = getStopProgress(level);
  return getLevelDirections(level).reduce((counts, direction) => {
    counts[direction] = vehicles.filter(
      (vehicle) => vehicle.direction === direction && !vehicle.crashed && vehicle.progress < stopProgress,
    ).length;
    return counts;
  }, {} as QueueCounts);
}

export function requestPhase(state: GameState, phase: Phase, level: LevelConfig): GameState {
  const running = state.running || (!state.over && phase !== 'allRed');
  if (state.over) return state;
  if (
    state.targetPhase === phase &&
    (state.transitionKind !== 'none' || state.yellowPhase || state.redYellowPhase || state.phase === phase)
  ) {
    return { ...state, running, paused: false };
  }

  const currentPhase = state.phase === 'allRed' ? null : state.phase;
  const transitionKind: TransitionKind = currentPhase && currentPhase !== phase ? 'yellow' : 'redYellow';
  const switchMs =
    transitionKind === 'yellow'
      ? level.timings.yellowMs
      : phase === 'allRed'
        ? level.timings.allRedMs
        : level.timings.redYellowMs;

  return {
    ...state,
    running,
    paused: false,
    phase: currentPhase ? 'allRed' : state.phase,
    targetPhase: phase,
    yellowPhase: transitionKind === 'yellow' ? currentPhase : null,
    redYellowPhase: transitionKind === 'redYellow' && phase !== 'allRed' ? phase : null,
    transitionKind: phase === 'allRed' && !currentPhase ? 'none' : transitionKind,
    transitionTotalMs: switchMs,
    transitionId: state.transitionId + 1,
    greenMs: 0,
    switchMs,
    message: phase === 'allRed' ? 'Kreuzung wird geraeumt.' : `${getPhaseLabel(level, phase)} bereitet Gruen vor.`,
  };
}

export function setAllRed(state: GameState, level: LevelConfig): GameState {
  if (state.controlMode !== 'manual') return requestPhase(state, 'allRed', level);

  const nextTransitionId = state.transitionId + 1;
  const manualLights = { ...state.manualLights };
  const manualTransitions = { ...state.manualTransitions };
  level.phases.forEach((phase) => {
    const currentLight = state.manualLights[phase.id] || 'red';
    if (currentLight === 'green' || currentLight === 'redYellow') {
      manualLights[phase.id] = 'yellow';
      manualTransitions[phase.id] = createManualTransition('red', 'yellow', level.timings.yellowMs, nextTransitionId);
    } else {
      manualLights[phase.id] = 'red';
      manualTransitions[phase.id] = null;
    }
  });

  return {
    ...state,
    running: state.running,
    paused: false,
    manualLights,
    manualTransitions,
    manualSceneRequest: null,
    phase: 'allRed',
    targetPhase: 'allRed',
    yellowPhase: null,
    redYellowPhase: null,
    transitionKind: 'none',
    transitionTotalMs: level.timings.yellowMs,
    transitionId: nextTransitionId,
    switchMs: 0,
    greenMs: 0,
    message: 'Alle Freigaben werden auf Rot gefuehrt.',
  };
}

export function cycleManualPhase(state: GameState, phase: PhaseId, level: LevelConfig): GameState {
  if (state.over) return state;

  const currentLight = state.manualLights[phase] || 'red';
  const currentTransition = state.manualTransitions[phase];
  const turningGreen = currentTransition ? currentTransition.target === 'red' : currentLight !== 'green';
  const nextTransitionId = state.transitionId + 1;
  const nextLight: LightColor = turningGreen ? 'redYellow' : 'yellow';
  const manualTransition = turningGreen
    ? createManualTransition('green', 'redYellow', level.timings.redYellowMs, nextTransitionId)
    : createManualTransition('red', 'yellow', level.timings.yellowMs, nextTransitionId);

  return {
    ...state,
    running: state.running || !state.over,
    paused: false,
    controlMode: 'manual',
    manualLights: {
      ...state.manualLights,
      [phase]: nextLight,
    },
    manualTransitions: {
      ...state.manualTransitions,
      [phase]: manualTransition,
    },
    manualSceneRequest: null,
    phase: 'allRed',
    targetPhase: 'allRed',
    yellowPhase: null,
    redYellowPhase: null,
    transitionKind: 'none',
    transitionTotalMs: manualTransition.totalMs,
    transitionId: nextTransitionId,
    switchMs: 0,
    greenMs: 0,
    message: turningGreen
      ? `${getPhaseLabel(level, phase)} startet mit Rot-Gelb.`
      : `${getPhaseLabel(level, phase)} geht ueber Gelb auf Rot.`,
  };
}

export function applyManualScene(state: GameState, scenePhaseIds: PhaseId[], level: LevelConfig): GameState {
  if (state.over) return state;

  const nextTransitionId = state.transitionId + 1;
  const requested = new Set(scenePhaseIds);
  const manualLights = { ...state.manualLights };
  const manualTransitions = { ...state.manualTransitions };
  const isPhaseGreenOrStarting = (light: LightColor, transition: ManualTransition | null) =>
    light === 'green' || (light === 'redYellow' && transition?.target === 'green');
  let longestTransitionMs = 0;
  const hasPhaseNeedingRed = level.phases.some((phase) => {
    const currentLight = manualLights[phase.id] || 'red';
    const currentTransition = manualTransitions[phase.id];
    const shouldBeGreen = requested.has(phase.id);
    if (shouldBeGreen && isPhaseGreenOrStarting(currentLight, currentTransition)) return false;
    return currentLight !== 'red' || currentTransition?.target === 'green';
  });
  const hasPhaseNeedingGreen = level.phases.some((phase) => {
    if (!requested.has(phase.id)) return false;
    const currentLight = manualLights[phase.id] || 'red';
    const currentTransition = manualTransitions[phase.id];
    return !isPhaseGreenOrStarting(currentLight, currentTransition);
  });

  if (hasPhaseNeedingRed) {
    level.phases.forEach((phase) => {
      const currentLight = manualLights[phase.id] || 'red';
      const currentTransition = manualTransitions[phase.id];
      const shouldBeGreen = requested.has(phase.id);

      if (shouldBeGreen && isPhaseGreenOrStarting(currentLight, currentTransition)) {
        if (currentLight === 'green') {
          manualLights[phase.id] = 'green';
          manualTransitions[phase.id] = null;
        } else {
          manualLights[phase.id] = currentLight;
          manualTransitions[phase.id] = currentTransition;
          longestTransitionMs = Math.max(longestTransitionMs, currentTransition?.switchMs || 0);
        }
        return;
      }

      if (currentLight === 'green' || currentLight === 'redYellow') {
        manualLights[phase.id] = 'yellow';
        manualTransitions[phase.id] = createManualTransition('red', 'yellow', level.timings.yellowMs, nextTransitionId);
        longestTransitionMs = Math.max(longestTransitionMs, level.timings.yellowMs);
        return;
      }
      if (currentLight === 'yellow' && currentTransition?.target === 'red') {
        longestTransitionMs = Math.max(longestTransitionMs, currentTransition.totalMs);
        return;
      }
      manualLights[phase.id] = 'red';
      manualTransitions[phase.id] = null;
    });

    return {
      ...state,
      running: state.running || !state.over,
      paused: false,
      controlMode: 'manual',
      manualLights,
      manualTransitions,
      manualSceneRequest: hasPhaseNeedingGreen && scenePhaseIds.length > 0 ? [...scenePhaseIds] : null,
      phase: 'allRed',
      targetPhase: 'allRed',
      yellowPhase: null,
      redYellowPhase: null,
      transitionKind: 'none',
      transitionTotalMs: longestTransitionMs,
      transitionId: nextTransitionId,
      switchMs: 0,
      greenMs: 0,
      message: hasPhaseNeedingGreen
        ? 'Szene wird sicher geschaltet (bestehendes Gruen bleibt aktiv).'
        : 'Szene wird auf Rot reduziert.',
    };
  }

  level.phases.forEach((phase) => {
    const currentLight = manualLights[phase.id] || 'red';
    const currentTransition = manualTransitions[phase.id];
    const shouldBeGreen = requested.has(phase.id);
    const next = transitionManualLightToTarget(currentLight, currentTransition, shouldBeGreen, nextTransitionId, level);
    manualLights[phase.id] = next.light;
    manualTransitions[phase.id] = next.transition;
    if (next.transition) longestTransitionMs = Math.max(longestTransitionMs, next.transition.totalMs);
  });

  return {
    ...state,
    running: state.running || !state.over,
    paused: false,
    controlMode: 'manual',
    manualLights,
    manualTransitions,
    manualSceneRequest: null,
    phase: 'allRed',
    targetPhase: 'allRed',
    yellowPhase: null,
    redYellowPhase: null,
    transitionKind: 'none',
    transitionTotalMs: longestTransitionMs,
    transitionId: nextTransitionId,
    switchMs: 0,
    greenMs: 0,
    message: requested.size > 0 ? 'Szene geschaltet.' : 'Szene auf Rot.',
  };
}

export function toggleControlMode(state: GameState, level: LevelConfig): GameState {
  if (state.controlMode === 'auto') {
    return {
      ...state,
      controlMode: 'manual',
      manualLights: createManualLightsFromVisibleState(state, level),
      manualTransitions: createEmptyManualTransitions(level),
      manualSceneRequest: null,
      phase: 'allRed',
      targetPhase: 'allRed',
      yellowPhase: null,
      redYellowPhase: null,
      transitionKind: 'none',
      transitionTotalMs: 0,
      switchMs: 0,
      greenMs: 0,
      message: 'Direktsteuerung aktiv.',
    };
  }

  return {
    ...state,
    controlMode: 'auto',
    manualLights: createAllRedLights(level),
    manualTransitions: createEmptyManualTransitions(level),
    manualSceneRequest: null,
    phase: 'allRed',
    targetPhase: 'allRed',
    yellowPhase: null,
    redYellowPhase: null,
    transitionKind: 'none',
    transitionTotalMs: 0,
    switchMs: 0,
    greenMs: 0,
    message: 'Halbautomatik aktiv. Waehle eine Richtung fuer Gruen.',
  };
}

function transitionManualLightToTarget(
  currentLight: LightColor,
  currentTransition: ManualTransition | null,
  shouldBeGreen: boolean,
  transitionId: number,
  level: LevelConfig,
): { light: LightColor; transition: ManualTransition | null } {
  if (shouldBeGreen) {
    if (currentLight === 'green') return { light: 'green', transition: null };
    if (currentLight === 'redYellow' && currentTransition?.target === 'green') {
      return { light: currentLight, transition: currentTransition };
    }
    return {
      light: 'redYellow',
      transition: createManualTransition('green', 'redYellow', level.timings.redYellowMs, transitionId),
    };
  }

  if (currentLight === 'red') return { light: 'red', transition: null };
  if (currentLight === 'yellow' && currentTransition?.target === 'red') {
    return { light: currentLight, transition: currentTransition };
  }
  if (currentLight === 'green' || currentLight === 'redYellow') {
    return {
      light: 'yellow',
      transition: createManualTransition('red', 'yellow', level.timings.yellowMs, transitionId),
    };
  }

  return { light: 'red', transition: null };
}

export function tickGame(state: GameState, level: LevelConfig): { state: GameState; events: GameEvent[] } {
  if (!state.running || state.paused || state.over) return { state, events: [] };

  const events: GameEvent[] = [];
  const updateMs = level.timings.updateMs;
  const stopProgress = getStopProgress(level);
  const directions = getLevelDirections(level);
  const remainingMs = state.remainingMs - updateMs;
  let phase = state.phase;
  let targetPhase = state.targetPhase;
  let yellowPhase = state.yellowPhase;
  let redYellowPhase = state.redYellowPhase;
  let manualLights = state.manualLights;
  let manualTransitions = state.manualTransitions;
  let manualSceneRequest = state.manualSceneRequest ?? null;
  let transitionKind = state.transitionKind;
  let transitionTotalMs = state.transitionTotalMs;
  let transitionId = state.transitionId;
  const manualHasStartSignal =
    state.controlMode === 'manual' &&
    Object.values(state.manualLights).some((light) => light === 'green' || light === 'redYellow');
  let greenMs =
    state.controlMode === 'manual'
      ? manualHasStartSignal
        ? state.greenMs + updateMs
        : 0
      : state.phase !== 'allRed' && state.transitionKind === 'none'
        ? state.greenMs + updateMs
        : state.greenMs;
  let switchMs = Math.max(0, state.switchMs - updateMs);
  let spawnMs = Math.max(0, state.spawnMs - updateMs);
  let spawnMsByDirection = { ...state.spawnMsByDirection };
  let spillCooldownMs = Math.max(0, state.spillCooldownMs - updateMs);
  let lives = state.lives;
  let score = state.score;
  let cars = state.cars;
  let completedWaitMs = state.completedWaitMs;
  let streak = state.streak;
  let bestStreak = state.bestStreak;
  let message = state.message;
  let nextVehicleId = state.nextVehicleId;
  let vehicles = state.vehicles.map((vehicle) => ({ ...vehicle }));
  const frameScale = updateMs / FRAME_MS;

  if (state.controlMode === 'auto' && state.switchMs > 0 && switchMs <= 0) {
    if (state.transitionKind === 'yellow' && targetPhase !== 'allRed') {
      yellowPhase = null;
      redYellowPhase = null;
      transitionKind = 'allRed';
      transitionTotalMs = level.timings.allRedMs;
      switchMs = level.timings.allRedMs;
      phase = 'allRed';
      greenMs = 0;
      message = 'Raeumzeit. Alle Richtungen warten kurz.';
    } else if (state.transitionKind === 'allRed' && targetPhase !== 'allRed') {
      yellowPhase = null;
      redYellowPhase = targetPhase;
      transitionKind = 'redYellow';
      transitionTotalMs = level.timings.redYellowMs;
      switchMs = level.timings.redYellowMs;
      phase = 'allRed';
      greenMs = 0;
      message = `${getPhaseLabel(level, targetPhase)} Rot-Gelb. Gleich geht es los.`;
    } else {
      yellowPhase = null;
      redYellowPhase = null;
      transitionKind = 'none';
      transitionTotalMs = 0;
      phase = targetPhase;
      greenMs = phase === 'allRed' ? 0 : updateMs;
      message = phase === 'allRed' ? 'Alle Ampeln rot.' : `${getPhaseLabel(level, phase)} ist gruen.`;
    }
  }

  if (state.controlMode === 'manual') {
    const transitionResult = advanceManualTransitions(level, manualLights, manualTransitions, updateMs);
    manualLights = transitionResult.lights;
    manualTransitions = transitionResult.transitions;

    if (manualSceneRequest && manualSceneRequest.length > 0) {
      const requested = new Set(manualSceneRequest);
      const isPhaseGreenOrStarting = (light: LightColor, transition: ManualTransition | null) =>
        light === 'green' || (light === 'redYellow' && transition?.target === 'green');
      const canActivateRequestedScene = level.phases.every((phase) => {
        const currentLight = manualLights[phase.id] || 'red';
        const currentTransition = manualTransitions[phase.id];
        if (requested.has(phase.id)) {
          if (currentLight === 'yellow' && currentTransition?.target === 'red') return false;
          return true;
        }
        return currentLight === 'red' && !currentTransition;
      });
      if (canActivateRequestedScene) {
        transitionId += 1;
        let longestTransitionMs = 0;
        level.phases.forEach((phase) => {
          const shouldBeGreen = requested.has(phase.id);
          const currentLight = manualLights[phase.id] || 'red';
          const currentTransition = manualTransitions[phase.id];
          if (shouldBeGreen && isPhaseGreenOrStarting(currentLight, currentTransition)) {
            if (currentLight === 'green') {
              manualLights[phase.id] = 'green';
              manualTransitions[phase.id] = null;
            } else {
              manualLights[phase.id] = currentLight;
              manualTransitions[phase.id] = currentTransition;
              longestTransitionMs = Math.max(longestTransitionMs, currentTransition?.switchMs || 0);
            }
            return;
          }
          const next = transitionManualLightToTarget(currentLight, currentTransition, shouldBeGreen, transitionId, level);
          manualLights[phase.id] = next.light;
          manualTransitions[phase.id] = next.transition;
          if (next.transition) longestTransitionMs = Math.max(longestTransitionMs, next.transition.totalMs);
        });
        manualSceneRequest = null;
        transitionTotalMs = longestTransitionMs;
        switchMs = 0;
        greenMs = 0;
        message = 'Szene geht ueber Rot-Gelb auf Gruen.';
      }
    }
  }

  const elapsedMs = level.timings.gameMs - remainingMs;
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
        { controlMode: state.controlMode, manualLights, phase, yellowPhase, redYellowPhase },
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

      if (ahead && !ahead.crashed) {
        limit = Math.min(limit, ahead.progress - followingDistance(level, vehicle, ahead));
        stopReason = 'lead_vehicle';
      }

      const signalStart = signalStartContext(
        state.controlMode,
        phaseId,
        light,
        transitionTotalMs,
        switchMs,
        greenMs,
        manualTransitions,
      );
      let canProceed = light === 'green' || light === 'redYellow';
      const runsRedLight = shouldRunRedLight(level, vehicles, vehicle, direction, ahead, light);

      if (light === 'yellow') {
        if (vehicle.progress > stopProgress + level.traffic.stopEpsilon) {
          canProceed = true;
        } else {
          const yellowContext = yellowDecisionContext(
            state.controlMode,
            phaseId,
            state.transitionId,
            transitionTotalMs,
            switchMs,
            manualTransitions,
            level.timings.yellowMs,
          );
          if (vehicle.yellowDecisionId !== yellowContext.transitionId) {
            const elapsed = Math.max(0, Math.min(level.timings.yellowMs, yellowContext.totalMs - yellowContext.switchMs));
            const yellowRatio = level.timings.yellowMs > 0 ? elapsed / level.timings.yellowMs : 1;
            const passChance = 1 - 0.8 * yellowRatio;
            vehicle.yellowDecisionId = yellowContext.transitionId;
            vehicle.yellowProceed = pseudoRandom(vehicle.id * 97 + yellowContext.transitionId * 131) <= passChance;
          }
          canProceed = vehicle.yellowProceed;
        }
      }
      if (runsRedLight) canProceed = true;

      const greenReactionHold =
        (light === 'green' || light === 'redYellow') &&
        vehicle.progress <= stopProgress + level.traffic.stopEpsilon &&
        vehicle.speed < 0.08 &&
        signalStart < vehicle.reactionMs;
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
      const isDelayed = stopIntent || (Number.isFinite(limit) && advanced.speed < advanced.maxSpeed * 0.65);
      if (!advanced.crashed && isDelayed && advanced.progress < getVehicleExitProgress(level, advanced)) {
        advanced.waitMs += updateMs;
      }
      nextVehicles.push(advanced);
      });
    });
  });

  const movedVehicles = enforceVehicleSpacing(level, nextVehicles, frameScale);

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

  const queues = queueCounts(level, vehicles);
  const worstDirection = directions.reduce((worst, direction) =>
    (queues[direction] || 0) > (queues[worst] || 0) ? direction : worst,
  );

  if (spillCooldownMs <= 0 && (queues[worstDirection] || 0) > level.traffic.maxQueuePerApproach) {
    const candidate = vehicles
      .filter((vehicle) => vehicle.direction === worstDirection && vehicle.progress < stopProgress)
      .sort((a, b) => a.progress - b.progress)[0];

    if (candidate) {
      vehicles = vehicles.filter((vehicle) => vehicle.id !== candidate.id);
      lives -= 1;
      streak = 0;
      spillCooldownMs = 1600;
      message = `${getDirectionLabel(level, worstDirection)} staut zurueck. Ein Leben weg.`;
      events.push('warning');
    }
  }

  const baseState = {
    ...state,
    nextVehicleId,
    vehicles,
    controlMode: state.controlMode,
    manualLights,
    manualTransitions,
    manualSceneRequest,
    phase,
    targetPhase,
    yellowPhase,
    redYellowPhase,
    transitionKind,
    transitionTotalMs,
    transitionId,
    greenMs,
    switchMs,
    spawnMs,
    spawnMsByDirection,
    spillCooldownMs,
    remainingMs,
    score,
    cars,
    completedWaitMs,
    lives: Math.max(0, lives),
    streak,
    bestStreak,
    message,
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
  const latePressure = Math.min(0.14, (elapsedMs / level.timings.gameMs) * 0.18);
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

function createEmptyManualTransitions(level: LevelConfig) {
  return level.phases.reduce(
    (transitions, phase) => {
      transitions[phase.id] = null;
      return transitions;
    },
    {} as Record<PhaseId, ManualTransition | null>,
  );
}

function createManualTransition(
  target: 'red' | 'green',
  kind: ManualTransition['kind'],
  duration: number,
  transitionId: number,
): ManualTransition {
  return {
    target,
    kind,
    switchMs: duration,
    totalMs: duration,
    transitionId,
  };
}

function advanceManualTransitions(
  level: LevelConfig,
  currentLights: Record<PhaseId, LightColor>,
  currentTransitions: Record<PhaseId, ManualTransition | null>,
  updateMs: number,
) {
  const lights = { ...currentLights };
  const transitions = { ...currentTransitions };

  level.phases.forEach((phase) => {
    const transition = transitions[phase.id];
    if (!transition) return;

    const switchMs = Math.max(0, transition.switchMs - updateMs);
    if (switchMs <= 0) {
      lights[phase.id] = transition.target;
      transitions[phase.id] = null;
      return;
    }

    transitions[phase.id] = { ...transition, switchMs };
  });

  return { lights, transitions };
}

function createManualLightsFromVisibleState(state: GameState, level: LevelConfig) {
  return level.phases.reduce(
    (lights, phase) => {
      lights[phase.id] = visibleLightForPhase(state, phase.id);
      return lights;
    },
    {} as Record<PhaseId, LightColor>,
  );
}

function visibleLightForPhase(
  state: Pick<GameState, 'phase' | 'yellowPhase' | 'redYellowPhase'>,
  phase: PhaseId,
): LightColor {
  if (state.yellowPhase === phase) return 'yellow';
  if (state.redYellowPhase === phase) return 'redYellow';
  if (!state.yellowPhase && !state.redYellowPhase && state.phase === phase) return 'green';
  return 'red';
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

function signalStartContext(
  mode: GameState['controlMode'],
  phase: PhaseId,
  light: LightColor,
  transitionTotalMs: number,
  switchMs: number,
  greenMs: number,
  manualTransitions: Record<PhaseId, ManualTransition | null>,
) {
  if (mode === 'manual') {
    const transition = manualTransitions[phase];
    if (light === 'redYellow' && transition?.kind === 'redYellow') {
      return transition.totalMs - transition.switchMs;
    }
    return light === 'green' ? greenMs : 0;
  }

  if (light === 'redYellow') return transitionTotalMs - switchMs;
  return light === 'green' ? greenMs : 0;
}

function yellowDecisionContext(
  mode: GameState['controlMode'],
  phase: PhaseId,
  transitionId: number,
  transitionTotalMs: number,
  switchMs: number,
  manualTransitions: Record<PhaseId, ManualTransition | null>,
  fallbackYellowMs: number,
) {
  if (mode === 'manual') {
    const transition = manualTransitions[phase];
    if (transition?.kind === 'yellow') {
      return {
        transitionId: transition.transitionId,
        totalMs: transition.totalMs,
        switchMs: transition.switchMs,
      };
    }
  }

  return {
    transitionId,
    totalMs: transitionTotalMs || fallbackYellowMs,
    switchMs,
  };
}

function shouldRunRedLight(
  level: LevelConfig,
  vehicles: Vehicle[],
  vehicle: Vehicle,
  direction: Direction,
  ahead: Vehicle | undefined,
  light: LightColor,
) {
  if (light !== 'red') return false;
  if (vehicle.kind !== 'sport' && vehicle.kind !== 'motorcycle') return false;
  const stopProgress = getStopProgress(level);
  if (vehicle.progress > stopProgress + level.traffic.stopEpsilon) return false;
  if (ahead?.crashed) return false;
  if (ahead && ahead.progress <= stopProgress + level.traffic.stopEpsilon) return false;

  return pseudoRandom(vehicle.id * 193 + direction.length * 41) < 0.5;
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

function enforceVehicleSpacing(level: LevelConfig, vehicles: Vehicle[], frameScale: number) {
  const byId = new Map(vehicles.map((vehicle) => [vehicle.id, { ...vehicle }]));

  getLevelDirections(level).forEach((direction) => {
    laneIdsForDirection(level, direction).forEach((laneId) => {
      const group = vehicles
        .filter((vehicle) => vehicle.direction === direction && vehicle.laneId === laneId && !vehicle.crashed)
        .sort((a, b) => b.progress - a.progress);

      for (let index = 1; index < group.length; index += 1) {
        const follower = byId.get(group[index].id);
        if (!follower) continue;

        for (let aheadIndex = index - 1; aheadIndex >= 0; aheadIndex -= 1) {
          const ahead = byId.get(group[aheadIndex].id);
          if (!ahead) continue;

          const gap = enforcedGap(level, follower, ahead);
          if (gap === null) continue;

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

function enforcedGap(level: LevelConfig, follower: Vehicle, ahead: Vehicle) {
  return followingDistance(level, follower, ahead);
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
      progress: limit,
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
      progress: limit,
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
      progress: limit,
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
