import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  PauseIcon,
  PlayIcon,
  RotateCcwIcon,
  SlidersHorizontalIcon,
  Volume2Icon,
  VolumeXIcon,
} from 'lucide-react';
import { audioService } from './services/audioService';
import {
  applyManualScene,
  createInitialGame,
  getCenter,
  getDirectionLabel,
  getPhaseLabel,
  getStopProgress,
  lightLabel,
  lightForPhase,
  phaseForVehicle,
  queueCounts,
  requestPhase,
  setAllRed,
  tickGame,
  vehicleTransform,
} from './game/engine';
import { DEFAULT_LEVEL_ID, getLevelById, LEVELS } from './game/levels';
import { ControlButtonConfig, Direction, GameEvent, GameState, LightColor, Phase, StopReason } from './game/types';

const formatSeconds = (ms: number) => `${(ms / 1000).toFixed(1)}s`;

const keyLabel = (key?: string) => {
  switch (key) {
    case 'ArrowUp':
      return '↑';
    case 'ArrowRight':
      return '→';
    case 'ArrowDown':
      return '↓';
    case 'ArrowLeft':
      return '←';
    default:
      return '';
  }
};

const waitColor = (waitMs: number, targetWaitMs: number) => {
  const ratio = Math.max(0, Math.min(2, waitMs / targetWaitMs));
  if (ratio < 1) {
    const t = ratio;
    return `rgb(${Math.round(34 + 216 * t)}, ${Math.round(197 + 7 * t)}, ${Math.round(94 - 73 * t)})`;
  }
  const t = ratio - 1;
  return `rgb(${Math.round(250 - 11 * t)}, ${Math.round(204 - 136 * t)}, ${Math.round(21 + 47 * t)})`;
};

const STORAGE_KEY = 'traffic-light-crossing-save-v2';
const MAX_HISTORY_MS = 10 * 60 * 1000;

type TrafficHistorySample = {
  ts: number;
  cars: number;
  satisfactionSum: number;
};

type CityStatsState = {
  allCars: number;
  allSatisfactionSum: number;
  history: TrafficHistorySample[];
};

type PersistedState = {
  levelId: string;
  game: GameState;
  cityStats: CityStatsState;
  autoSwitchEnabled: boolean;
  autoSwitchSeconds: number;
  autoSwitchSecondsByPhase?: Record<string, number>;
  autoSwitchSensorMode?: boolean;
};

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const nextHalfStep = (value: number) => clamp(Math.floor(value * 2) / 2 + 0.5, 0, 99.5);
const prevHalfStep = (value: number) => clamp(Math.ceil(value * 2) / 2 - 0.5, 0, 99.5);
const parseSecondsInput = (raw: string) => {
  const normalized = raw.replace(',', '.');
  if (!/^\d*\.?\d*$/.test(normalized)) return null;
  if (normalized === '' || normalized === '.') return null;
  return clamp(Number(normalized), 0, 99.9);
};

const waitToSatisfaction = (waitMs: number, targetWaitMs: number) => {
  const ratio = Math.min(2, waitMs / Math.max(1, targetWaitMs));
  return clamp(10 * (1 - ratio / 2), 0, 10);
};

const loadPersistedState = (): PersistedState | null => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as PersistedState;
    if (!parsed?.levelId || !parsed?.game || !parsed?.cityStats) return null;
    return parsed;
  } catch {
    return null;
  }
};

const stopReasonLabel: Record<StopReason, string> = {
  moving: 'faehrt',
  red_light: 'Rot',
  red_yellow: 'Rot-Gelb',
  yellow_hold: 'Gelb-Halt',
  reaction: 'Reaktionszeit',
  lead_vehicle: 'Vordermann',
  cross_traffic: 'Kreuzung blockiert',
  manual_block: 'Blockiert',
  crashed: 'Crash',
};

const isInteractiveTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  Boolean(target.closest('button, a, input, textarea, select, [role="button"]'));

const SignalHead: React.FC<{
  x: number;
  y: number;
  light: LightColor;
  label: string;
  arrow?: 'up' | 'down';
  onClick: () => void;
}> = ({ x, y, light, label, arrow, onClick }) => {
  const redOn = light === 'red' || light === 'redYellow';
  const yellowOn = light === 'yellow' || light === 'redYellow';
  const greenOn = light === 'green';
  const arrowPath = 'M0 -4.1 L3.4 -0.2 H1.35 V3.4 H-1.35 V-0.2 H-3.4 Z';

  return (
  <g
    className="signal-head"
    transform={`translate(${x} ${y})`}
    onClick={onClick}
    role="button"
    tabIndex={0}
    aria-label={label}
    onKeyDown={(event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        onClick();
      }
    }}
  >
    <rect x="-17" y="-39" width="34" height="78" rx="12" fill="#111827" stroke="#334155" strokeWidth="3" />
    <circle
      cy="-24"
      r="9"
      fill={redOn ? '#ef4444' : '#47151a'}
      className={redOn ? 'lamp on' : 'lamp'}
    />
    <circle
      cy="0"
      r="9"
      fill={yellowOn ? '#facc15' : '#493a12'}
      className={yellowOn ? 'lamp on' : 'lamp'}
    />
    <circle cy="24" r="9" fill={greenOn ? '#22c55e' : '#12351f'} className={greenOn ? 'lamp on' : 'lamp'} />
    {arrow && (
      <>
        <g transform={`translate(0 -24) ${arrow === 'up' ? '' : 'rotate(180)'}`}>
          <path d={arrowPath} fill={redOn ? '#fff7f7' : '#4b5563'} opacity={redOn ? 0.95 : 0.85} />
        </g>
        <g transform={`translate(0 0) ${arrow === 'up' ? '' : 'rotate(180)'}`}>
          <path d={arrowPath} fill={yellowOn ? '#fffbeb' : '#4b5563'} opacity={yellowOn ? 0.95 : 0.85} />
        </g>
        <g transform={`translate(0 24) ${arrow === 'up' ? '' : 'rotate(180)'}`}>
          <path d={arrowPath} fill={greenOn ? '#f0fdf4' : '#4b5563'} opacity={greenOn ? 0.95 : 0.85} />
        </g>
      </>
    )}
  </g>
  );
};

const PushButton: React.FC<{
  button: ControlButtonConfig;
  active: boolean;
  pulsing?: boolean;
  status?: string;
  onPress: () => void;
}> = ({ button, active, pulsing, status, onPress }) => (
  <button
    type="button"
    className={`console-button ${active ? 'active' : ''} ${pulsing ? 'pulsing' : ''}`}
    data-color={button.color}
    onClick={onPress}
    title={button.controlKey ? `${button.label}: ${keyLabel(button.controlKey)}` : button.label}
    aria-pressed={button.mode === 'latched' ? active : undefined}
  >
    <span className="button-hardware" aria-hidden="true">
      <span className="button-bezel">
        <span className="button-lens" />
      </span>
    </span>
    <span className="button-meta">
      <span className="button-label">{button.label}</span>
      <span className="button-subline">
        {button.controlKey && <kbd>{keyLabel(button.controlKey)}</kbd>}
        {status && <span>{status}</span>}
      </span>
    </span>
  </button>
);

const App: React.FC = () => {
  const persisted = useMemo(() => loadPersistedState(), []);
  const [levelId, setLevelId] = useState(persisted?.levelId || DEFAULT_LEVEL_ID);
  const level = useMemo(() => getLevelById(levelId), [levelId]);
  const [game, setGame] = useState(() => {
    if (persisted?.game && persisted.levelId === level.id) {
      return {
        ...persisted.game,
        running: true,
        paused: false,
        over: false,
      };
    }
    return {
      ...createInitialGame(level),
      running: true,
      paused: false,
      over: false,
      message: 'Simulation aktiv.',
    };
  });
  const [cityStats, setCityStats] = useState<CityStatsState>(
    persisted?.cityStats || { allCars: 0, allSatisfactionSum: 0, history: [] },
  );
  const [autoSwitchEnabled, setAutoSwitchEnabled] = useState(persisted?.autoSwitchEnabled || false);
  const [autoSwitchSeconds, setAutoSwitchSeconds] = useState<number>(
    clamp(Number(persisted?.autoSwitchSeconds ?? 8), 0, 99.9),
  );
  const [autoSwitchSecondsByPhase, setAutoSwitchSecondsByPhase] = useState<Record<string, number>>(
    () =>
      level.phases.reduce(
        (acc, phase) => {
          const persistedValue = persisted?.autoSwitchSecondsByPhase?.[phase.id];
          acc[phase.id] = clamp(
            Number.isFinite(Number(persistedValue))
              ? Number(persistedValue)
              : Number(persisted?.autoSwitchSeconds ?? 8),
            0,
            99.9,
          );
          return acc;
        },
        {} as Record<string, number>,
      ),
  );
  const [autoSwitchSensorMode, setAutoSwitchSensorMode] = useState(Boolean(persisted?.autoSwitchSensorMode));
  const [autoSwitchSecondsInput, setAutoSwitchSecondsInput] = useState(() =>
    clamp(Number(persisted?.autoSwitchSeconds ?? 8), 0, 99.9).toFixed(1),
  );
  const [phaseSecondsInputByPhase, setPhaseSecondsInputByPhase] = useState<Record<string, string>>(
    () =>
      level.phases.reduce(
        (acc, phase) => {
          const persistedValue = persisted?.autoSwitchSecondsByPhase?.[phase.id];
          const value = clamp(
            Number.isFinite(Number(persistedValue))
              ? Number(persistedValue)
              : Number(persisted?.autoSwitchSeconds ?? 8),
            0,
            99.9,
          );
          acc[phase.id] = value.toFixed(1);
          return acc;
        },
        {} as Record<string, string>,
      ),
  );
  const [isMuted, setIsMuted] = useState(audioService.getMuted());
  const [soundSettingsOpen, setSoundSettingsOpen] = useState(false);
  const [soundVolumes, setSoundVolumes] = useState(() => audioService.getVolumes());
  const [momentaryImpulse, setMomentaryImpulse] = useState<string | null>(null);
  const [cursorBoardPos, setCursorBoardPos] = useState<{ x: number; y: number } | null>(null);
  const [fps, setFps] = useState(0);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const previousPhaseLightsRef = useRef<Record<string, LightColor> | null>(null);
  const honkScheduleRef = useRef<Map<number, number>>(new Map());
  const gameRef = useRef(game);
  const autoSwitchPhaseIndexRef = useRef(0);
  const autoSwitchNextAtRef = useRef<number | null>(null);
  const autoSwitchCyclePhaseRef = useRef<string | null>(null);
  const autoSwitchCountdownStartedRef = useRef(false);
  const [autoSwitchRemainingMs, setAutoSwitchRemainingMs] = useState(0);
  const statsProgressRef = useRef({ cars: game.cars, completedWaitMs: game.completedWaitMs });

  const center = getCenter(level);
  const geometry = level.geometry;
  const counts = useMemo(() => queueCounts(level, game.vehicles), [game.vehicles, level]);
  const averageWaitMs = game.cars > 0 ? game.completedWaitMs / game.cars : 0;
  const autoSwitchUnlocked = cityStats.allCars >= 100;
  const autoSwitchAdvancedUnlocked = cityStats.allCars >= 1000;
  useEffect(() => {
    if (!autoSwitchUnlocked && autoSwitchEnabled) setAutoSwitchEnabled(false);
  }, [autoSwitchEnabled, autoSwitchUnlocked]);
  useEffect(() => {
    if (!autoSwitchAdvancedUnlocked && autoSwitchSensorMode) setAutoSwitchSensorMode(false);
  }, [autoSwitchAdvancedUnlocked, autoSwitchSensorMode]);
  useEffect(() => {
    setAutoSwitchSecondsByPhase((prev) =>
      level.phases.reduce(
        (acc, phase) => {
          acc[phase.id] = clamp(prev[phase.id] ?? autoSwitchSeconds, 0, 99.9);
          return acc;
        },
        {} as Record<string, number>,
      ),
    );
  }, [level, autoSwitchSeconds]);
  useEffect(() => {
    if (!autoSwitchAdvancedUnlocked) {
      const nextByPhase = level.phases.reduce(
        (acc, phase) => {
          acc[phase.id] = clamp(autoSwitchSeconds, 0, 99.9);
          return acc;
        },
        {} as Record<string, number>,
      );
      const nextInputs = level.phases.reduce(
        (acc, phase) => {
          acc[phase.id] = clamp(autoSwitchSeconds, 0, 99.9).toFixed(1);
          return acc;
        },
        {} as Record<string, string>,
      );
      setAutoSwitchSecondsByPhase(nextByPhase);
      setPhaseSecondsInputByPhase(nextInputs);
    }
  }, [autoSwitchAdvancedUnlocked, autoSwitchSeconds, level.phases]);
  const recent10Min = useMemo(() => {
    const cutoff = clockMs - MAX_HISTORY_MS;
    return cityStats.history.filter((item) => item.ts >= cutoff);
  }, [cityStats.history, clockMs]);
  const recent1Min = useMemo(() => {
    const cutoff = clockMs - 60_000;
    return cityStats.history.filter((item) => item.ts >= cutoff);
  }, [cityStats.history, clockMs]);
  const carsLast10Min = useMemo(() => recent10Min.reduce((sum, item) => sum + item.cars, 0), [recent10Min]);
  const carsLast1Min = useMemo(() => recent1Min.reduce((sum, item) => sum + item.cars, 0), [recent1Min]);
  const satisfactionAll = cityStats.allCars > 0 ? cityStats.allSatisfactionSum / cityStats.allCars : 10;
  const satisfaction10Min = carsLast10Min > 0
    ? recent10Min.reduce((sum, item) => sum + item.satisfactionSum, 0) / carsLast10Min
    : satisfactionAll;
  const satisfaction1Min = carsLast1Min > 0
    ? recent1Min.reduce((sum, item) => sum + item.satisfactionSum, 0) / carsLast1Min
    : satisfactionAll;
  const stopProgress = useMemo(() => getStopProgress(level), [level]);
  const phaseLights = useMemo(
    () =>
      level.phases.reduce(
        (acc, phase) => {
          acc[phase.id] = lightForPhase(game, phase.id);
          return acc;
        },
        {} as Record<string, LightColor>,
      ),
    [game, level.phases],
  );
  const hoveredVehicle = useMemo(() => {
    if (!cursorBoardPos) return null;

    let nearest: { id: number; distanceSq: number } | null = null;
    for (const vehicle of game.vehicles) {
      const pos = vehicleTransform(level, vehicle);
      const dx = pos.x - cursorBoardPos.x;
      const dy = pos.y - cursorBoardPos.y;
      const distanceSq = dx * dx + dy * dy;
      if (!nearest || distanceSq < nearest.distanceSq) {
        nearest = { id: vehicle.id, distanceSq };
      }
    }
    if (!nearest) return null;
    return game.vehicles.find((vehicle) => vehicle.id === nearest.id) || null;
  }, [cursorBoardPos, game.vehicles, level]);
  const hoveredHonkChance = hoveredVehicle
    ? (() => {
        const phaseId = phaseForVehicle(level, hoveredVehicle);
        const light = lightForPhase(game, phaseId);
        const waitingAtSignal =
          hoveredVehicle.speed < 0.06 &&
          hoveredVehicle.progress >= stopProgress - 18 &&
          hoveredVehicle.progress <= stopProgress + 6 &&
          !hoveredVehicle.crashed;
        if (!waitingAtSignal) return 0;
        if (light === 'red') return 100;
        if (light === 'yellow') return 50;
        return 0;
      })()
    : 0;
  const debugStatus = hoveredVehicle
    ? `#${hoveredVehicle.id} ${hoveredVehicle.kind}${hoveredVehicle.noVisibleExhaust ? ' (E/OPF)' : ''} · ${hoveredVehicle.direction}/${hoveredVehicle.laneId}/${hoveredVehicle.turn} · ${stopReasonLabel[hoveredVehicle.stopReason]} · v ${hoveredVehicle.speed.toFixed(2)}/${hoveredVehicle.maxSpeed.toFixed(2)} · a ${hoveredVehicle.acceleration.toFixed(3)} b ${hoveredVehicle.braking.toFixed(3)} · r ${Math.round(hoveredVehicle.reactionMs)}ms · wait ${(hoveredVehicle.waitMs / 1000).toFixed(1)}s · p ${hoveredVehicle.progress.toFixed(0)} · hup ${hoveredHonkChance}%`
    : 'Debug: Maus ueber das Spielfeld bewegen fuer Fahrzeugdaten.';
  const animatedExhaustIds = useMemo(() => {
    const ids = new Set<number>();
    let budget = 12;
    for (const vehicle of game.vehicles) {
      if (budget <= 0) break;
      if (!vehicle.crashed && vehicle.confusedMs <= 0 && vehicle.speed < 0.04) {
        ids.add(vehicle.id);
        budget -= 1;
      }
    }
    return ids;
  }, [game.vehicles]);

  const reset = useCallback(() => {
    const next = {
      ...createInitialGame(level),
      running: true,
      paused: false,
      over: false,
      message: 'Simulation aktiv.',
    };
    statsProgressRef.current = { cars: next.cars, completedWaitMs: next.completedWaitMs };
    honkScheduleRef.current.clear();
    autoSwitchCyclePhaseRef.current = null;
    autoSwitchNextAtRef.current = null;
    autoSwitchCountdownStartedRef.current = false;
    setGame(next);
  }, [level]);

  const start = useCallback(() => {
    setGame((prev) => {
      if (prev.levelId !== level.id) {
        const next = {
          ...createInitialGame(level),
          running: true,
          paused: false,
          over: false,
          message: 'Simulation aktiv.',
        };
        statsProgressRef.current = { cars: next.cars, completedWaitMs: next.completedWaitMs };
        honkScheduleRef.current.clear();
        autoSwitchCyclePhaseRef.current = null;
        autoSwitchNextAtRef.current = null;
        autoSwitchCountdownStartedRef.current = false;
        return next;
      }
      return {
        ...prev,
        running: true,
        paused: false,
        over: false,
        message: prev.phase === 'allRed' ? 'Simulation aktiv.' : '',
      };
    });
  }, [level]);

  const togglePause = useCallback(() => {
    setGame((prev) => {
      if (!prev.running || prev.over) return prev;
      return { ...prev, paused: !prev.paused, message: prev.paused ? '' : 'Pausiert.' };
    });
  }, []);

  const toggleMute = useCallback(() => {
    setIsMuted(audioService.toggle());
  }, []);

  const setSoundVolume = useCallback((channel: 'horn' | 'lightClick', nextPercent: number) => {
    const normalized = Math.max(0, Math.min(1, nextPercent / 100));
    audioService.setVolume(channel, normalized);
    setSoundVolumes((prev) => ({ ...prev, [channel]: normalized }));
  }, []);

  const handleHalfStepKey = useCallback(
    (
      event: React.KeyboardEvent<HTMLInputElement>,
      value: number,
      apply: (next: number) => void,
    ) => {
      if (event.key === '+' || event.key === '.') {
        event.preventDefault();
        event.stopPropagation();
        apply(nextHalfStep(value));
        return;
      }
      if (event.key === '-') {
        event.preventDefault();
        event.stopPropagation();
        apply(prevHalfStep(value));
        return;
      }
      event.stopPropagation();
    },
    [],
  );

  const getPhaseAutoSwitchMs = useCallback(
    (phaseId: string) => {
      const seconds = autoSwitchAdvancedUnlocked
        ? clamp(autoSwitchSecondsByPhase[phaseId] ?? autoSwitchSeconds, 0, 99.9)
        : clamp(autoSwitchSeconds, 0, 99.9);
      return seconds * 1000;
    },
    [autoSwitchAdvancedUnlocked, autoSwitchSeconds, autoSwitchSecondsByPhase],
  );

  const getNextAutoSwitchPhase = useCallback((fromPhaseId: string) => {
    const fromIndex = level.phases.findIndex((phase) => phase.id === fromPhaseId);
    if (fromIndex < 0 || level.phases.length === 0) return null;

    for (let offset = 1; offset <= level.phases.length; offset += 1) {
      const candidate = level.phases[(fromIndex + offset) % level.phases.length];
      if (getPhaseAutoSwitchMs(candidate.id) > 0) return candidate.id;
    }
    return null;
  }, [getPhaseAutoSwitchMs, level.phases]);

  const getFirstAutoSwitchPhase = useCallback(() => {
    for (const phase of level.phases) {
      if (getPhaseAutoSwitchMs(phase.id) > 0) return phase.id;
    }
    return null;
  }, [getPhaseAutoSwitchMs, level.phases]);

  const applyIntervalToAllPhases = useCallback((seconds: number) => {
    const value = clamp(seconds, 0, 99.9);
    const byPhase = level.phases.reduce(
      (acc, phase) => {
        acc[phase.id] = value;
        return acc;
      },
      {} as Record<string, number>,
    );
    const inputsByPhase = level.phases.reduce(
      (acc, phase) => {
        acc[phase.id] = value.toFixed(1);
        return acc;
      },
      {} as Record<string, string>,
    );
    setAutoSwitchSeconds(value);
    setAutoSwitchSecondsInput(value.toFixed(1));
    setAutoSwitchSecondsByPhase(byPhase);
    setPhaseSecondsInputByPhase(inputsByPhase);
  }, [level.phases]);

  const phaseHasWaitingVehicle = useCallback((state: GameState, phaseId: string) => {
    return state.vehicles.some(
      (vehicle) =>
        !vehicle.crashed &&
        phaseForVehicle(level, vehicle) === phaseId &&
        vehicle.progress >= 0 &&
        vehicle.progress <= stopProgress + 12,
    );
  }, [level, stopProgress]);

  const resetAutoSwitchDeadline = useCallback((phaseId?: string) => {
    if (!autoSwitchEnabled) return;
    const cyclePhase = phaseId || autoSwitchCyclePhaseRef.current;
    if (!cyclePhase) return;
    const intervalMs = Math.max(0, getPhaseAutoSwitchMs(cyclePhase));
    autoSwitchCyclePhaseRef.current = cyclePhase;
    autoSwitchCountdownStartedRef.current = !autoSwitchSensorMode;
    autoSwitchNextAtRef.current = performance.now() + intervalMs;
    setAutoSwitchRemainingMs(intervalMs);
  }, [autoSwitchEnabled, autoSwitchSensorMode, getPhaseAutoSwitchMs]);

  const changeLevel = useCallback((nextLevelId: string) => {
    const nextLevel = getLevelById(nextLevelId);
    setLevelId(nextLevel.id);
    const next = {
      ...createInitialGame(nextLevel),
      running: true,
      paused: false,
      over: false,
      message: 'Simulation aktiv.',
    };
    statsProgressRef.current = { cars: next.cars, completedWaitMs: next.completedWaitMs };
    honkScheduleRef.current.clear();
    autoSwitchCyclePhaseRef.current = null;
    autoSwitchNextAtRef.current = null;
    autoSwitchCountdownStartedRef.current = false;
    setGame(next);
  }, []);

  const setPhase = useCallback((phase: Phase, manualTrigger = true) => {
    setGame((prev) => {
      if (phase === 'allRed') return setAllRed(prev, level);
      if (prev.controlMode === 'manual') return applyManualScene(prev, [phase], level);
      return requestPhase(prev, phase, level);
    });
    if (manualTrigger && phase !== 'allRed') resetAutoSwitchDeadline(phase);
  }, [applyManualScene, level, resetAutoSwitchDeadline]);

  const triggerControl = useCallback((button: ControlButtonConfig) => {
    if (button.mode === 'momentary') {
      setMomentaryImpulse(button.id);
      window.setTimeout(() => {
        setMomentaryImpulse((current) => (current === button.id ? null : current));
      }, 420);
    }

    if (button.action.type === 'phase') setPhase(button.action.phaseId, true);
    if (button.action.type === 'scene') {
      setGame((prev) => applyManualScene(prev, button.action.phaseIds, level));
      if (button.action.phaseIds.length > 0) resetAutoSwitchDeadline(button.action.phaseIds[0]);
    }
    if (button.action.type === 'allRed') setPhase('allRed', true);
  }, [applyManualScene, level, resetAutoSwitchDeadline, setPhase]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const control = level.controlButtons.find((item) => item.controlKey === event.key);
      if (!control) return;
      event.preventDefault();
      triggerControl(control);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [level, triggerControl]);

  useEffect(() => {
    if (game.running && !game.paused && !game.over) return;

    const handlePrimaryAction = (event: KeyboardEvent) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (isInteractiveTarget(event.target)) return;

      event.preventDefault();
      if (game.over) reset();
      else start();
    };

    window.addEventListener('keydown', handlePrimaryAction);
    return () => window.removeEventListener('keydown', handlePrimaryAction);
  }, [game.over, game.paused, game.running, reset, start]);

  useEffect(() => {
    gameRef.current = game;
  }, [game]);

  useEffect(() => {
    if (!game.running || game.paused || game.over) return;

    const timer = window.setInterval(() => {
      let events: GameEvent[] = [];
      setGame((prev) => {
        const result = tickGame(prev, level);
        events = result.events;
        return result.state;
      });
      events.forEach((event) => {
        if (event === 'success') audioService.playSuccess();
        if (event === 'warning') audioService.playWarning();
        if (event === 'crash') audioService.playCrash();
      });
    }, level.timings.updateMs);

    return () => window.clearInterval(timer);
  }, [game.over, game.paused, game.running, level]);

  useEffect(() => {
    const previous = previousPhaseLightsRef.current;
    previousPhaseLightsRef.current = phaseLights;
    if (!previous) return;

    const changedGroups = level.phases.filter((phase) => previous[phase.id] !== phaseLights[phase.id]);
    changedGroups.forEach(() => audioService.playLightClick());
  }, [level.phases, phaseLights]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const currentGame = gameRef.current;
      if (!currentGame.running || currentGame.paused || currentGame.over) return;

      const now = performance.now();
      const schedule = honkScheduleRef.current;
      const activeVehicleIds = new Set(currentGame.vehicles.map((vehicle) => vehicle.id));
      [...schedule.keys()].forEach((id) => {
        if (!activeVehicleIds.has(id)) schedule.delete(id);
      });

      currentGame.vehicles.forEach((vehicle) => {
        if (vehicle.crashed) {
          schedule.delete(vehicle.id);
          return;
        }

        const phaseId = phaseForVehicle(level, vehicle);
        const light = lightForPhase(currentGame, phaseId);
        const waitingAtSignal =
          vehicle.speed < 0.06 &&
          vehicle.progress >= stopProgress - 18 &&
          vehicle.progress <= stopProgress + 6 &&
          (light === 'red' || light === 'yellow');

        if (!waitingAtSignal) {
          schedule.delete(vehicle.id);
          return;
        }

        const dueAt = schedule.get(vehicle.id) ?? now + 1200 + Math.random() * 3400;
        schedule.set(vehicle.id, dueAt);
        if (now < dueAt) return;

        const chance = light === 'yellow' ? 0.5 : 1;
        if (Math.random() <= chance) audioService.playHorn();
        schedule.set(vehicle.id, now + 1800 + Math.random() * 4700);
      });
    }, 220);

    return () => window.clearInterval(timer);
  }, [level, stopProgress]);

  useEffect(() => {
    let frameCount = 0;
    let lastSecond = performance.now();
    let rafId = 0;

    const loop = (now: number) => {
      frameCount += 1;
      if (now - lastSecond >= 1000) {
        setFps(Math.round((frameCount * 1000) / (now - lastSecond)));
        frameCount = 0;
        lastSecond = now;
      }
      rafId = window.requestAnimationFrame(loop);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(rafId);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => setClockMs(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const previous = statsProgressRef.current;
    const deltaCars = game.cars - previous.cars;
    const deltaWaitMs = game.completedWaitMs - previous.completedWaitMs;
    statsProgressRef.current = { cars: game.cars, completedWaitMs: game.completedWaitMs };

    if (deltaCars <= 0 || deltaWaitMs < 0) return;
    const perCarWait = deltaWaitMs / Math.max(1, deltaCars);
    const perCarSatisfaction = waitToSatisfaction(perCarWait, level.scoring.targetWaitMs);
    const now = Date.now();

    setCityStats((prev) => {
      const history = [...prev.history, { ts: now, cars: deltaCars, satisfactionSum: perCarSatisfaction * deltaCars }]
        .filter((item) => item.ts >= now - MAX_HISTORY_MS);
      return {
        allCars: prev.allCars + deltaCars,
        allSatisfactionSum: prev.allSatisfactionSum + perCarSatisfaction * deltaCars,
        history,
      };
    });
  }, [game.cars, game.completedWaitMs, level.scoring.targetWaitMs]);

  useEffect(() => {
    if (!autoSwitchEnabled || level.phases.length === 0) {
      autoSwitchNextAtRef.current = null;
      autoSwitchCyclePhaseRef.current = null;
      autoSwitchCountdownStartedRef.current = false;
      setAutoSwitchRemainingMs(0);
      return;
    }

    const timer = window.setInterval(() => {
      const now = performance.now();
      const current = gameRef.current;
      const inTransition =
        current.transitionKind !== 'none' ||
        current.switchMs > 0 ||
        Boolean(current.yellowPhase) ||
        Boolean(current.redYellowPhase);
      const stableGreenPhase =
        !inTransition && current.phase !== 'allRed'
          ? current.phase
          : null;
      if (!stableGreenPhase) {
        const canStartFromAllRed =
          !inTransition &&
          current.phase === 'allRed' &&
          current.targetPhase === 'allRed';
        if (!canStartFromAllRed) return;
        const firstPhaseId = getFirstAutoSwitchPhase();
        if (!firstPhaseId) {
          autoSwitchNextAtRef.current = null;
          setAutoSwitchRemainingMs(0);
          return;
        }
        setPhase(firstPhaseId, false);
        autoSwitchCyclePhaseRef.current = firstPhaseId;
        autoSwitchNextAtRef.current = null;
        autoSwitchCountdownStartedRef.current = false;
        setAutoSwitchRemainingMs(0);
        return;
      }

      if (autoSwitchCyclePhaseRef.current !== stableGreenPhase) {
        autoSwitchCyclePhaseRef.current = stableGreenPhase;
        autoSwitchCountdownStartedRef.current = !autoSwitchSensorMode;
        const totalMs = Math.max(0, getPhaseAutoSwitchMs(stableGreenPhase));
        autoSwitchNextAtRef.current = now + totalMs;
        setAutoSwitchRemainingMs(totalMs);
      }

      const nextPhaseId = getNextAutoSwitchPhase(stableGreenPhase);
      if (!nextPhaseId) {
        setAutoSwitchRemainingMs(0);
        autoSwitchNextAtRef.current = null;
        return;
      }
      const activePhaseMs = Math.max(0, getPhaseAutoSwitchMs(stableGreenPhase));

      if (autoSwitchSensorMode && !autoSwitchCountdownStartedRef.current) {
        if (!phaseHasWaitingVehicle(current, nextPhaseId)) {
          setAutoSwitchRemainingMs(activePhaseMs);
          autoSwitchNextAtRef.current = now + activePhaseMs;
          return;
        }
        autoSwitchCountdownStartedRef.current = true;
        autoSwitchNextAtRef.current = now + activePhaseMs;
      }

      const nextAt = autoSwitchNextAtRef.current;
      if (!nextAt) return;
      if (now < nextAt) {
        setAutoSwitchRemainingMs(nextAt - now);
        return;
      }
      if (inTransition) return;

      const nextIndex = level.phases.findIndex((phase) => phase.id === nextPhaseId);
      autoSwitchPhaseIndexRef.current = nextIndex;
      setPhase(nextPhaseId, false);
      autoSwitchNextAtRef.current = null;
      autoSwitchCountdownStartedRef.current = false;
      setAutoSwitchRemainingMs(0);
    }, 100);

    return () => window.clearInterval(timer);
  }, [autoSwitchEnabled, autoSwitchSensorMode, getFirstAutoSwitchPhase, getNextAutoSwitchPhase, getPhaseAutoSwitchMs, level, phaseHasWaitingVehicle, setPhase]);

  useEffect(() => {
    const persist = () => {
      const payload: PersistedState = {
        levelId,
        game: { ...gameRef.current, running: true, paused: false, over: false },
        cityStats,
        autoSwitchEnabled,
        autoSwitchSeconds,
        autoSwitchSecondsByPhase,
        autoSwitchSensorMode,
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      } catch {
        // ignore
      }
    };

    const timer = window.setInterval(persist, 2000);
    persist();
    return () => window.clearInterval(timer);
  }, [autoSwitchEnabled, autoSwitchSeconds, autoSwitchSecondsByPhase, autoSwitchSensorMode, cityStats, levelId]);

  const activeLabel = game.yellowPhase
    ? `${getPhaseLabel(level, game.yellowPhase)} gelb`
    : game.redYellowPhase
      ? `${getPhaseLabel(level, game.redYellowPhase)} Rot-Gelb`
      : getPhaseLabel(level, game.phase);
  const autoSwitchProgressTotalMs = useMemo(() => {
    const phaseId =
      autoSwitchCyclePhaseRef.current ||
      (game.targetPhase !== 'allRed' ? game.targetPhase : game.phase !== 'allRed' ? game.phase : null);
    if (!phaseId || phaseId === 'allRed') return Math.max(1, autoSwitchSeconds * 1000);
    return Math.max(1, getPhaseAutoSwitchMs(phaseId));
  }, [autoSwitchSeconds, game.phase, game.targetPhase, getPhaseAutoSwitchMs]);

  const signalPosition = (direction: Direction, slot: number, totalSlots: number) => {
    const centeredSlot = slot - (totalSlots - 1) / 2;
    const slotShift = centeredSlot * 34;
    switch (direction) {
      case 'north':
        return { x: center - geometry.roadHalf - 50 + slotShift, y: center - geometry.roadHalf - 44 };
      case 'south':
        return { x: center + geometry.roadHalf + 50 - slotShift, y: center + geometry.roadHalf + 44 };
      case 'east':
        return { x: center + geometry.roadHalf + 44, y: center - geometry.roadHalf - 50 + slotShift };
      case 'west':
        return { x: center - geometry.roadHalf - 44, y: center + geometry.roadHalf + 50 - slotShift };
    }
  };

  const signalHeads = useMemo(
    () =>
      level.approaches.flatMap((approach) => {
        const uniquePhaseIds = Array.from(new Set(approach.lanes.map((lane) => lane.phaseId || approach.phaseId)));
        return uniquePhaseIds.map((phaseId, slot) => {
          const phase = level.phases.find((item) => item.id === phaseId);
          const pos = signalPosition(approach.direction, slot, uniquePhaseIds.length);
          return {
            key: `${approach.direction}-${phaseId}`,
            phaseId,
            label: `${phase?.label || approach.label} Gruen`,
            x: pos.x,
            y: pos.y,
            arrow:
              approach.direction === 'north'
                ? 'down'
                : approach.direction === 'south'
                  ? 'up'
                  : undefined,
          };
        });
      }),
    [level, center, geometry.roadHalf],
  );

  const verticalLaneDividers = useMemo(() => {
    const north = level.approaches.find((approach) => approach.direction === 'north')?.lanes || [];
    const south = level.approaches.find((approach) => approach.direction === 'south')?.lanes || [];
    const offsets = Array.from(
      new Set(
        [...north, ...south]
          .map((lane) => lane.offset ?? geometry.laneOffset)
          .sort((a, b) => a - b),
      ),
    );
    if (offsets.length < 2) return [];
    return offsets.slice(0, -1).map((offset, index) => (offset + offsets[index + 1]) / 2);
  }, [geometry.laneOffset, level.approaches]);

  const horizontalLaneDividers = useMemo(() => {
    const east = level.approaches.find((approach) => approach.direction === 'east')?.lanes || [];
    const west = level.approaches.find((approach) => approach.direction === 'west')?.lanes || [];
    const offsets = Array.from(
      new Set(
        [...east, ...west]
          .map((lane) => lane.offset ?? geometry.laneOffset)
          .sort((a, b) => a - b),
      ),
    );
    if (offsets.length < 2) return [];
    return offsets.slice(0, -1).map((offset, index) => (offset + offsets[index + 1]) / 2);
  }, [geometry.laneOffset, level.approaches]);

  const leftTurnGuides = useMemo(() => {
    const rotationForDirection = (direction: Direction) => {
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
    };
    const leftTurnTarget = (direction: Direction): Direction => {
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
    };
    const rotate = (x: number, y: number, degrees: number) => {
      const radians = (degrees * Math.PI) / 180;
      const cos = Math.cos(radians);
      const sin = Math.sin(radians);
      return {
        x: x * cos - y * sin,
        y: x * sin + y * cos,
      };
    };
    const toWorld = (x: number, y: number, direction: Direction) => {
      const point = rotate(x, y, rotationForDirection(direction));
      return { x: center + point.x, y: center + point.y };
    };

    return level.approaches.flatMap((approach) =>
      approach.lanes
        .filter((lane) => lane.turns.includes('left'))
        .map((lane) => {
          const inboundOffset = lane.offset ?? geometry.laneOffset;
          const targetDirection = leftTurnTarget(approach.direction);
          const targetLanes = level.approaches.find((item) => item.direction === targetDirection)?.lanes || [];
          const targetLaneOffset =
            (targetLanes.length > 0
              ? Math.max(...targetLanes.map((targetLane) => targetLane.offset ?? geometry.laneOffset))
              : geometry.laneOffset);
          const radius = Math.max(12, inboundOffset + targetLaneOffset);
          const curveSamples = 10;
          const tailLen = 46;
          const exitLen = 34;
          const points: Array<{ x: number; y: number }> = [];

          points.push(toWorld(-inboundOffset, -inboundOffset - tailLen, approach.direction));
          points.push(toWorld(-inboundOffset, -inboundOffset, approach.direction));

          for (let index = 0; index <= curveSamples; index += 1) {
            const t = index / curveSamples;
            const theta = Math.PI - t * (Math.PI / 2);
            const x = targetLaneOffset + radius * Math.cos(theta);
            const y = -inboundOffset + radius * Math.sin(theta);
            points.push(toWorld(x, y, approach.direction));
          }

          points.push(toWorld(targetLaneOffset + exitLen, targetLaneOffset, approach.direction));
          const d = points.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x.toFixed(1)} ${point.y.toFixed(1)}`).join(' ');
          return {
            key: `${approach.direction}-${lane.id}-left-guide`,
            d,
          };
        }),
    );
  }, [center, geometry.laneOffset, level.approaches]);

  const handleBoardMouseMove = useCallback(
    (event: React.MouseEvent<SVGSVGElement>) => {
      const rect = event.currentTarget.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const x = ((event.clientX - rect.left) / rect.width) * geometry.board;
      const y = ((event.clientY - rect.top) / rect.height) * geometry.board;
      setCursorBoardPos({ x, y });
    },
    [geometry.board],
  );

  const controlState = (button: ControlButtonConfig) => {
    if (button.mode === 'momentary') {
      return {
        active: momentaryImpulse === button.id,
        pulsing: false,
        status: button.action.type === 'allRed' ? 'Impuls' : undefined,
      };
    }

    if (button.action.type === 'scene') {
      const requested = new Set(button.action.phaseIds);
      const requestedLights = button.action.phaseIds.map((phaseId) => game.manualLights[phaseId] || 'red');
      const allRequestedLive = requestedLights.every((light) => light !== 'red');
      const anyRequestedTransitioning = button.action.phaseIds.some((phaseId) => {
        const transition = game.manualTransitions[phaseId];
        return (game.manualLights[phaseId] || 'red') === 'red' && transition?.target === 'green';
      });
      const allOtherRed = level.phases
        .filter((phase) => !requested.has(phase.id))
        .every((phase) => (game.manualLights[phase.id] || 'red') === 'red');
      const active = allRequestedLive && allOtherRed;
      return {
        active: active || anyRequestedTransitioning,
        pulsing: anyRequestedTransitioning,
        status: anyRequestedTransitioning ? 'Wechselt' : active ? 'Aktiv' : 'Bereit',
      };
    }

    if (button.action.type === 'phase') {
      const phase = button.action.phaseId;
      const phaseLight = lightForPhase(game, phase);
      if (game.controlMode === 'manual') {
        return {
          active: phaseLight !== 'red',
          pulsing: false,
          status: lightLabel(phaseLight),
        };
      }

      const pulsing =
        game.targetPhase === phase &&
        phaseLight === 'red' &&
        (game.transitionKind !== 'none' || game.phase !== phase);
      const active = phaseLight !== 'red' || pulsing;
      return {
        active,
        pulsing,
        status: pulsing ? 'Wechselt' : active ? 'Aktiv' : 'Bereit',
      };
    }

    return { active: false, pulsing: false, status: undefined };
  };

  return (
    <main className="game-root">
      <section className="hud" aria-label="Spielstatus">
        <div className="brand">
          <span className="brand-mark">TL</span>
          <div>
            <h1>Traffic Light Crossing</h1>
            <p>{game.message}</p>
            <small className="debug-hint">{debugStatus}</small>
          </div>
        </div>

        <div className="meters" aria-live="polite">
          <div>
            <span>Autos Gesamt</span>
            <strong>{cityStats.allCars}</strong>
          </div>
          <div>
            <span>Autos 10 Min</span>
            <strong>{carsLast10Min}</strong>
          </div>
          <div>
            <span>Autos 1 Min</span>
            <strong>{carsLast1Min}</strong>
          </div>
          <div>
            <span>Zufriedenheit</span>
            <strong>{satisfactionAll.toFixed(1)}</strong>
          </div>
          <div>
            <span>Zufr. 10 Min</span>
            <strong>{satisfaction10Min.toFixed(1)}</strong>
          </div>
          <div>
            <span>Zufr. 1 Min</span>
            <strong>{satisfaction1Min.toFixed(1)}</strong>
          </div>
          <div>
            <span>FPS</span>
            <strong>{fps}</strong>
          </div>
        </div>

        <div className="icon-actions">
          <button type="button" onClick={toggleMute} title="Sound umschalten" aria-label="Sound umschalten">
            {isMuted ? <VolumeXIcon size={20} /> : <Volume2Icon size={20} />}
          </button>
          <button
            type="button"
            onClick={() => setSoundSettingsOpen((prev) => !prev)}
            title="Sound Einstellungen"
            aria-label="Sound Einstellungen"
          >
            <SlidersHorizontalIcon size={20} />
          </button>
          <button
            type="button"
            onClick={game.running ? togglePause : start}
            title={game.running && !game.paused ? 'Pause' : 'Start'}
            aria-label={game.running && !game.paused ? 'Pause' : 'Start'}
          >
            {game.running && !game.paused ? <PauseIcon size={20} /> : <PlayIcon size={20} />}
          </button>
          <button type="button" onClick={reset} title="Reset" aria-label="Reset">
            <RotateCcwIcon size={20} />
          </button>
          {soundSettingsOpen && (
            <div className="sound-popup" role="dialog" aria-label="Sound Einstellungen">
              <label>
                <span>Hupe</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(soundVolumes.horn * 100)}
                  onChange={(event) => setSoundVolume('horn', Number(event.target.value))}
                />
                <strong>{Math.round(soundVolumes.horn * 100)}%</strong>
              </label>
              <label>
                <span>Light Click</span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(soundVolumes.lightClick * 100)}
                  onChange={(event) => setSoundVolume('lightClick', Number(event.target.value))}
                />
                <strong>{Math.round(soundVolumes.lightClick * 100)}%</strong>
              </label>
            </div>
          )}
        </div>
      </section>

      <section className="play-area">
        <div className="board-wrap">
          <svg
            className="board"
            viewBox={`0 0 ${geometry.board} ${geometry.board}`}
            role="img"
            aria-label="Signalgesteuerte Kreuzung"
            onMouseMove={handleBoardMouseMove}
            onMouseLeave={() => setCursorBoardPos(null)}
          >
            <defs>
              <pattern id="asphalt" width="24" height="24" patternUnits="userSpaceOnUse">
                <rect width="24" height="24" fill="#313945" />
                <path d="M2 8h4M14 17h5M20 5h2" stroke="#46505f" strokeWidth="1.2" opacity="0.45" />
              </pattern>
              <filter id="softShadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#05070a" floodOpacity="0.35" />
              </filter>
            </defs>

            <rect width={geometry.board} height={geometry.board} fill="#1f6a47" />
            <path d={`M0 82 C106 112 190 104 284 76 C398 42 500 56 ${geometry.board} 110 V0 H0 Z`} fill="#2d7b54" opacity="0.8" />
            <path d={`M0 ${geometry.board - 76} C132 ${geometry.board - 112} 232 ${geometry.board - 78} 342 ${geometry.board - 50} C456 ${geometry.board - 22} 536 ${geometry.board - 58} ${geometry.board} ${geometry.board - 94} V${geometry.board} H0 Z`} fill="#245f43" />

            <rect x={center - geometry.roadHalf} y="0" width={geometry.roadHalf * 2} height={geometry.board} fill="url(#asphalt)" />
            <rect x="0" y={center - geometry.roadHalf} width={geometry.board} height={geometry.roadHalf * 2} fill="url(#asphalt)" />
            <rect
              x={center - geometry.roadHalf}
              y={center - geometry.roadHalf}
              width={geometry.roadHalf * 2}
              height={geometry.roadHalf * 2}
              fill="#353d49"
            />

            <path d={`M${center} 0V${center - geometry.roadHalf}`} className="road-dash" />
            <path d={`M${center} ${center + geometry.roadHalf}V${geometry.board}`} className="road-dash" />
            <path d={`M0 ${center}H${center - geometry.roadHalf}`} className="road-dash" />
            <path d={`M${center + geometry.roadHalf} ${center}H${geometry.board}`} className="road-dash" />

            {verticalLaneDividers.map((offset) => (
              <React.Fragment key={`v-lane-${offset}`}>
                <path d={`M${center - offset} 0V${center - geometry.roadHalf}`} className="lane-divider" />
                <path d={`M${center + offset} 0V${center - geometry.roadHalf}`} className="lane-divider" />
                <path d={`M${center - offset} ${center + geometry.roadHalf}V${geometry.board}`} className="lane-divider" />
                <path d={`M${center + offset} ${center + geometry.roadHalf}V${geometry.board}`} className="lane-divider" />
              </React.Fragment>
            ))}
            {horizontalLaneDividers.map((offset) => (
              <React.Fragment key={`h-lane-${offset}`}>
                <path d={`M0 ${center + offset}H${center - geometry.roadHalf}`} className="lane-divider" />
                <path d={`M${center + geometry.roadHalf} ${center - offset}H${geometry.board}`} className="lane-divider" />
              </React.Fragment>
            ))}

            {leftTurnGuides.map((guide) => (
              <path key={guide.key} d={guide.d} className="turn-guide" />
            ))}

            <line x1={center - geometry.roadHalf} y1={center - geometry.roadHalf - 18} x2={center} y2={center - geometry.roadHalf - 18} className="stop-line" />
            <line x1={center} y1={center + geometry.roadHalf + 18} x2={center + geometry.roadHalf} y2={center + geometry.roadHalf + 18} className="stop-line" />
            <line x1={center - geometry.roadHalf - 18} y1={center} x2={center - geometry.roadHalf - 18} y2={center + geometry.roadHalf} className="stop-line" />
            <line x1={center + geometry.roadHalf + 18} y1={center - geometry.roadHalf} x2={center + geometry.roadHalf + 18} y2={center} className="stop-line" />

            {signalHeads.map((signal) => (
              <SignalHead
                key={signal.key}
                x={signal.x}
                y={signal.y}
                light={lightForPhase(game, signal.phaseId)}
                label={signal.label}
                arrow={signal.arrow}
                onClick={() => setPhase(signal.phaseId)}
              />
            ))}

            {game.vehicles.map((vehicle) => {
              const pos = vehicleTransform(level, vehicle);
              const vehicleLength = vehicle.kind === 'motorcycle' ? geometry.carLength * 0.45 : geometry.carLength;
              const vehicleWidth = vehicle.kind === 'motorcycle' ? geometry.carWidth * 0.42 : geometry.carWidth;
              const patienceColor = waitColor(vehicle.waitMs, level.scoring.targetWaitMs);
              const dotY = 0;
              const showExhaust =
                !vehicle.noVisibleExhaust &&
                !vehicle.crashed &&
                vehicle.speed < 0.04 &&
                vehicle.confusedMs <= 0;
              const animateExhaust = animatedExhaustIds.has(vehicle.id);
              const exhaustDelay = ((vehicle.id % 9) * 0.12).toFixed(2);
              return (
                <g
                  key={vehicle.id}
                  transform={`translate(${pos.x} ${pos.y}) rotate(${pos.rotation})`}
                  className={`${vehicle.crashed ? 'car crashed' : 'car'} ${vehicle.confusedMs > 0 ? 'confused' : ''} ${vehicle.kind === 'sport' ? 'sport' : ''} ${vehicle.brakeLight ? 'braking' : ''}`}
                >
                  {vehicle.kind === 'motorcycle' ? (
                    <>
                      <polygon
                        points={`${-vehicleLength / 2 + 7},${-vehicleWidth / 2} ${vehicleLength / 2 - 4},${-vehicleWidth / 2 + 3} ${vehicleLength / 2 - 1},0 ${vehicleLength / 2 - 4},${vehicleWidth / 2 - 3} ${-vehicleLength / 2 + 7},${vehicleWidth / 2}`}
                        fill={vehicle.crashed ? '#ef4444' : vehicle.hue}
                        stroke="#0f172a"
                        strokeWidth="2.4"
                        strokeLinejoin="miter"
                      />
                      <rect x={-vehicleLength / 2 - 2} y={-vehicleWidth / 2 + 2} width="7" height={vehicleWidth - 4} fill="#0f172a" />
                      <rect x={vehicleLength / 2 - 6} y={-vehicleWidth / 2 + 1} width="7" height={vehicleWidth - 2} fill="#0f172a" />
                      <rect x="-4" y={-vehicleWidth / 2 - 3} width="8" height={vehicleWidth + 6} fill="#111827" opacity="0.9" />
                      <circle className="headlight" cx={vehicleLength / 2 - 1} cy="0" r="2.8" fill="#fff7bf" />
                      <circle className="tail-light" cx={-vehicleLength / 2 + 1} cy="0" r="2.6" />
                    </>
                  ) : (
                    <>
                      <rect x={-vehicleLength / 2} y={-vehicleWidth / 2} width={vehicleLength} height={vehicleWidth} rx="8" fill={vehicle.crashed ? '#ef4444' : vehicle.hue} />
                      {vehicle.kind === 'sport' && (
                        <>
                          <path d={`M${-vehicleLength / 2 + 7} 0H${vehicleLength / 2 - 8}`} stroke="#0f172a" strokeWidth="4" strokeLinecap="round" opacity="0.8" />
                          <path d={`M${vehicleLength / 2 - 14} -13L${vehicleLength / 2 - 4} 0L${vehicleLength / 2 - 14} 13`} fill="#38bdf8" opacity="0.9" />
                        </>
                      )}
                      <rect x="-11" y="-11" width="24" height="22" rx="5" fill="#e8f7ff" opacity="0.78" />
                      <circle cx={-vehicleLength / 2 + 11} cy={-vehicleWidth / 2 - 3} r="4.3" fill="#111827" />
                      <circle cx={vehicleLength / 2 - 11} cy={-vehicleWidth / 2 - 3} r="4.3" fill="#111827" />
                      <circle cx={-vehicleLength / 2 + 11} cy={vehicleWidth / 2 + 3} r="4.3" fill="#111827" />
                      <circle cx={vehicleLength / 2 - 11} cy={vehicleWidth / 2 + 3} r="4.3" fill="#111827" />
                      <circle className="headlight-glow" cx={vehicleLength / 2 - 3} cy="-8.5" r="7.2" />
                      <circle className="headlight-glow" cx={vehicleLength / 2 - 3} cy="8.5" r="7.2" />
                      <circle className="headlight" cx={vehicleLength / 2 - 3} cy="-8.5" r="3.6" fill="#fff7bf" />
                      <circle className="headlight" cx={vehicleLength / 2 - 3} cy="8.5" r="3.6" fill="#fff7bf" />
                      <circle className="tail-light-glow" cx={-vehicleLength / 2 + 3} cy="-8.5" r="6.8" />
                      <circle className="tail-light-glow" cx={-vehicleLength / 2 + 3} cy="8.5" r="6.8" />
                      <circle className="tail-light" cx={-vehicleLength / 2 + 3} cy="-8.5" r="3.4" />
                      <circle className="tail-light" cx={-vehicleLength / 2 + 3} cy="8.5" r="3.4" />
                    </>
                  )}
                  <circle className="patience-dot" cx="0" cy={dotY} r="5" fill={patienceColor} />
                  {showExhaust && (
                    <g
                      className={animateExhaust ? 'exhaust' : 'exhaust-static'}
                      style={animateExhaust ? ({ '--smoke-delay': `${exhaustDelay}s` } as React.CSSProperties) : undefined}
                    >
                      <circle className="exhaust-puff puff-a" cx={-vehicleLength / 2 - 7} cy="-2.2" r="1.35" />
                      <circle className="exhaust-puff puff-b" cx={-vehicleLength / 2 - 8.1} cy="2.5" r="1.15" />
                    </g>
                  )}
                  {vehicle.confusedMs > 0 && (
                    <text className="confused-marker" x="0" y="-23" textAnchor="middle">
                      ?
                    </text>
                  )}
                  {vehicle.crashed && <path d="M-22 -20 L20 18 M-18 20 L22 -18" stroke="#fff7ed" strokeWidth="5" strokeLinecap="round" />}
                </g>
              );
            })}
          </svg>

          {(!game.running || game.paused || game.over) && (
            <div className="overlay">
              <div className="overlay-panel">
                <span>{game.over ? 'Ende' : game.paused ? 'Pause' : 'Bereit'}</span>
                <strong>{game.over ? `${game.score} Punkte` : 'Ampeln selbst korrigieren'}</strong>
                <p>
                  {game.over
                    ? `Durchgelassen: ${game.cars} Autos. Beste Serie: ${game.bestStreak}.`
                    : 'Schalte die Phasen passend zum Rueckstau. Bei Rueckstau verlierst du Leben.'}
                </p>
                <button type="button" onClick={game.over ? reset : start}>
                  <PlayIcon size={20} />
                  {game.over ? 'Nochmal' : game.paused ? 'Weiter' : 'Start'}
                </button>
              </div>
            </div>
          )}
        </div>

        <aside className="control-deck" aria-label="Ampelsteuerung">
          <div className="phase-readout">
            <span>{level.name} · Ampelsteuerung</span>
            <strong>{activeLabel}</strong>
          </div>

          {LEVELS.length > 1 && (
            <div className="level-buttons" aria-label="Levelauswahl">
              {LEVELS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={item.id === level.id ? 'selected' : ''}
                  onClick={() => changeLevel(item.id)}
                >
                  {item.name}
                </button>
              ))}
            </div>
          )}

          <div className="control-console" aria-label="Bedienkonsole">
            <span className="console-screw screw-tl" aria-hidden="true" />
            <span className="console-screw screw-tr" aria-hidden="true" />
            <span className="console-screw screw-bl" aria-hidden="true" />
            <span className="console-screw screw-br" aria-hidden="true" />
            <div className="console-header">
              <span>Signalsteuerung</span>
              <strong>AUTO</strong>
            </div>
            <div className="console-buttons">
              {level.controlButtons.map((button) => {
                const state = controlState(button);
                return (
                  <PushButton
                    key={button.id}
                    button={button}
                    active={state.active}
                    pulsing={state.pulsing}
                    status={state.status}
                    onPress={() => triggerControl(button)}
                  />
                );
              })}
            </div>
            <div className="console-cable-row" aria-hidden="true">
              <span />
              <span />
            </div>
          </div>

          {autoSwitchUnlocked && (
            <div className="aux-switch-box" aria-label="Auto Switch">
              <div className="aux-header">
                <span>Auto Switch</span>
                <strong>Taktpilot</strong>
              </div>
              <label className="rotary-switch">
                <input
                  type="checkbox"
                  checked={autoSwitchEnabled}
                  onChange={(event) => setAutoSwitchEnabled(event.target.checked)}
                />
                <span className="rotary-knob" aria-hidden="true" />
                <span>{autoSwitchEnabled ? 'EIN' : 'AUS'}</span>
              </label>
              <div className="switch-progress" aria-hidden="true">
                <span
                  className="switch-progress-bar"
                  style={{
                    width:
                      autoSwitchEnabled
                        ? `${clamp((autoSwitchRemainingMs / autoSwitchProgressTotalMs) * 100, 0, 100)}%`
                        : '0%',
                  }}
                />
              </div>
              <label className="segment-input">
                <span>Intervall</span>
                <div className="segment-input-row">
                  <button
                    type="button"
                    onClick={() =>
                      setAutoSwitchSeconds((current) => {
                        const next = prevHalfStep(current);
                        setAutoSwitchSecondsInput(next.toFixed(1));
                        return next;
                      })
                    }
                    aria-label="Intervall verringern"
                  >
                    -
                  </button>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={autoSwitchSecondsInput}
                    onChange={(event) => {
                      const raw = event.target.value;
                      setAutoSwitchSecondsInput(raw);
                      const parsed = parseSecondsInput(raw);
                      if (parsed == null) return;
                      setAutoSwitchSeconds(parsed);
                    }}
                    onBlur={() => setAutoSwitchSecondsInput(autoSwitchSeconds.toFixed(1))}
                    onKeyDown={(event) =>
                      handleHalfStepKey(event, autoSwitchSeconds, (next) => {
                        setAutoSwitchSeconds(next);
                        setAutoSwitchSecondsInput(next.toFixed(1));
                      })
                    }
                  />
                  <button
                    type="button"
                    onClick={() =>
                      setAutoSwitchSeconds((current) => {
                        const next = nextHalfStep(current);
                        setAutoSwitchSecondsInput(next.toFixed(1));
                        return next;
                      })
                    }
                    aria-label="Intervall erhoehen"
                  >
                    +
                  </button>
                </div>
                <small>sek</small>
              </label>
              {!autoSwitchAdvancedUnlocked && (
                <div className="advanced-progress">
                  <span>Advanced ab 1000 Autos</span>
                  <strong>{cityStats.allCars}/1000</strong>
                </div>
              )}
              {autoSwitchAdvancedUnlocked && (
                <>
                  <label className="sensor-switch">
                    <input
                      type="checkbox"
                      checked={autoSwitchSensorMode}
                      onChange={(event) => setAutoSwitchSensorMode(event.target.checked)}
                    />
                    <span className="sensor-track">
                      <span className="sensor-thumb" />
                    </span>
                    <span>Timer erst bei Fahrzeug an Rot</span>
                  </label>
                  <button
                    type="button"
                    className="apply-all-interval"
                    onClick={() => applyIntervalToAllPhases(autoSwitchSeconds)}
                  >
                    Intervall auf alle Phasen uebertragen
                  </button>
                  <div className="phase-intervals">
                    {level.phases.map((phase) => (
                      <div key={phase.id} className="phase-interval-row">
                        <span>{phase.label}</span>
                        <div className="phase-interval-controls">
                          <button
                            type="button"
                            onClick={() => {
                              const next = prevHalfStep(autoSwitchSecondsByPhase[phase.id] ?? autoSwitchSeconds);
                              setAutoSwitchSecondsByPhase((current) => ({ ...current, [phase.id]: next }));
                              setPhaseSecondsInputByPhase((current) => ({ ...current, [phase.id]: next.toFixed(1) }));
                            }}
                            aria-label={`${phase.label} Intervall verringern`}
                          >
                            -
                          </button>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={phaseSecondsInputByPhase[phase.id] ?? (autoSwitchSecondsByPhase[phase.id] ?? autoSwitchSeconds).toFixed(1)}
                            onChange={(event) => {
                              const raw = event.target.value;
                              setPhaseSecondsInputByPhase((current) => ({ ...current, [phase.id]: raw }));
                              const parsed = parseSecondsInput(raw);
                              if (parsed == null) return;
                              setAutoSwitchSecondsByPhase((current) => ({ ...current, [phase.id]: parsed }));
                            }}
                            onBlur={() =>
                              setPhaseSecondsInputByPhase((current) => ({
                                ...current,
                                [phase.id]: (autoSwitchSecondsByPhase[phase.id] ?? autoSwitchSeconds).toFixed(1),
                              }))
                            }
                            onKeyDown={(event) =>
                              handleHalfStepKey(
                                event,
                                autoSwitchSecondsByPhase[phase.id] ?? autoSwitchSeconds,
                                (next) =>
                                  {
                                    setAutoSwitchSecondsByPhase((current) => ({ ...current, [phase.id]: next }));
                                    setPhaseSecondsInputByPhase((current) => ({ ...current, [phase.id]: next.toFixed(1) }));
                                  },
                              )
                            }
                          />
                          <button
                            type="button"
                            onClick={() => {
                              const next = nextHalfStep(autoSwitchSecondsByPhase[phase.id] ?? autoSwitchSeconds);
                              setAutoSwitchSecondsByPhase((current) => ({ ...current, [phase.id]: next }));
                              setPhaseSecondsInputByPhase((current) => ({ ...current, [phase.id]: next.toFixed(1) }));
                            }}
                            aria-label={`${phase.label} Intervall erhoehen`}
                          >
                            +
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
          {!autoSwitchUnlocked && (
            <div className="aux-switch-locked">
              <span>Auto Switch gesperrt</span>
              <strong>{cityStats.allCars}/100 Autos</strong>
            </div>
          )}

          <div className="queue-list">
            {level.approaches.map((approach) => (
              <div key={approach.direction}>
                <span>{getDirectionLabel(level, approach.direction)}</span>
                <meter min="0" max={level.traffic.maxQueuePerApproach} value={Math.min(level.traffic.maxQueuePerApproach, counts[approach.direction] || 0)} />
                <strong>{counts[approach.direction] || 0}</strong>
              </div>
            ))}
          </div>

          <div className="streak">
            <span>Wartezeit</span>
            <strong>{formatSeconds(averageWaitMs)}</strong>
            <small>Gut: {'<='} {formatSeconds(level.scoring.targetWaitMs)} pro Auto. Rot ab {formatSeconds(level.scoring.targetWaitMs * 2)}.</small>
          </div>
        </aside>
      </section>
    </main>
  );
};

export default App;
