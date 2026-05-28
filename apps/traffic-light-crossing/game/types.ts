export type Direction = 'north' | 'south' | 'east' | 'west';
export type LaneTurn = 'straight' | 'left' | 'right';
export type PhaseId = string;
export type Phase = PhaseId | 'allRed';
export type LightColor = 'red' | 'redYellow' | 'yellow' | 'green';
export type TransitionKind = 'none' | 'yellow' | 'allRed' | 'redYellow';
export type VehicleKind = 'regular' | 'sport' | 'motorcycle';
export type ControlMode = 'auto' | 'manual';
export type GameEvent = 'success' | 'warning' | 'crash';
export type StopReason =
  | 'moving'
  | 'red_light'
  | 'red_yellow'
  | 'yellow_hold'
  | 'reaction'
  | 'lead_vehicle'
  | 'cross_traffic'
  | 'manual_block'
  | 'crashed';
export type ControlButtonColor = 'red' | 'green' | 'amber' | 'blue' | 'black';
export type ControlButtonMode = 'latched' | 'momentary';
export type ControlAction =
  | { type: 'phase'; phaseId: PhaseId }
  | { type: 'scene'; phaseIds: PhaseId[] }
  | { type: 'allRed' };

export type ManualTransition = {
  target: 'red' | 'green';
  kind: 'yellow' | 'redYellow';
  switchMs: number;
  totalMs: number;
  transitionId: number;
};

export type LaneConfig = {
  id: string;
  turns: LaneTurn[];
  offset?: number;
  phaseId?: PhaseId;
};

export type ApproachConfig = {
  direction: Direction;
  label: string;
  phaseId: PhaseId;
  lanes: LaneConfig[];
  spawnWeight?: number;
};

export type SignalPhaseConfig = {
  id: PhaseId;
  label: string;
  directions: Direction[];
  controlKey?: 'ArrowUp' | 'ArrowRight' | 'ArrowDown' | 'ArrowLeft';
};

export type ControlButtonConfig = {
  id: string;
  label: string;
  color: ControlButtonColor;
  mode: ControlButtonMode;
  action: ControlAction;
  controlKey?: 'ArrowUp' | 'ArrowRight' | 'ArrowDown' | 'ArrowLeft';
};

export type LevelGeometry = {
  board: number;
  roadHalf: number;
  laneOffset: number;
  start: number;
  carLength: number;
  carWidth: number;
  stopLineOffset: number;
};

export type LevelTimings = {
  gameMs: number;
  updateMs: number;
  yellowMs: number;
  redYellowMs: number;
  allRedMs: number;
  brakeLightHoldMs: number;
  brakeLightStopHoldMs: number;
};

export type LevelTraffic = {
  lives: number;
  maxVehicles: number;
  maxQueuePerApproach: number;
  spawnInitialMs: number;
  spawnBaseMs: number;
  spawnVarianceMs: number;
  spawnPressureBoostMaxMs: number;
  spawnPressureScoreFactor: number;
  safeGap: number;
  stopEpsilon: number;
  sportChance: number;
  motorcycleChance: number;
  maxMotorcyclesPerApproach: number;
};

export type LevelScoring = {
  pointsPerCar: number;
  minPointsPerCar: number;
  targetWaitMs: number;
  streakBonusEvery: number;
  streakBonusStep: number;
  streakBonusMax: number;
};

export type LevelConfig = {
  id: string;
  name: string;
  description: string;
  geometry: LevelGeometry;
  timings: LevelTimings;
  traffic: LevelTraffic;
  scoring: LevelScoring;
  approaches: ApproachConfig[];
  phases: SignalPhaseConfig[];
  controlButtons: ControlButtonConfig[];
};

export type Vehicle = {
  id: number;
  direction: Direction;
  laneId: string;
  turn: LaneTurn;
  progress: number;
  speed: number;
  maxSpeed: number;
  acceleration: number;
  braking: number;
  reactionMs: number;
  followGap: number;
  waitMs: number;
  lateralOffset: number;
  lateralVelocity: number;
  filteredMergeMs: number;
  kind: VehicleKind;
  yellowDecisionId: number | null;
  yellowProceed: boolean;
  brakeLight: boolean;
  brakeLightMs: number;
  hue: string;
  crashed: boolean;
  crashMs: number;
  confusedMs: number;
  stopReason: StopReason;
  noVisibleExhaust: boolean;
  thinkCooldownMs: number;
};

export type GameState = {
  levelId: string;
  nextVehicleId: number;
  running: boolean;
  paused: boolean;
  over: boolean;
  score: number;
  cars: number;
  completedWaitMs: number;
  lives: number;
  streak: number;
  bestStreak: number;
  remainingMs: number;
  controlMode: ControlMode;
  manualLights: Record<PhaseId, LightColor>;
  manualTransitions: Record<PhaseId, ManualTransition | null>;
  manualSceneRequest?: PhaseId[] | null;
  phase: Phase;
  targetPhase: Phase;
  yellowPhase: PhaseId | null;
  redYellowPhase: PhaseId | null;
  transitionKind: TransitionKind;
  transitionTotalMs: number;
  transitionId: number;
  greenMs: number;
  switchMs: number;
  spawnMs: number;
  spawnMsByDirection: Record<Direction, number>;
  spillCooldownMs: number;
  vehicles: Vehicle[];
  message: string;
};

export type QueueCounts = Record<Direction, number>;
