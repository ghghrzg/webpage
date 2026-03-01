import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { GameState, Target, RunHistoryItem, GameStats, GameMode, Shape } from './types';
import { GAME_DURATION, MODE_CONFIG } from './constants';
import { audioService } from './services/audioService';
import { getGameCommentary, GameCommentary } from './services/commentaryService';
import TargetButton from './components/TargetButton';
import ShapePreview from './components/ShapePreview';
import { Volume2, VolumeX, Play, Zap, RotateCcw, History, Home, Trophy } from 'lucide-react';

const RUN_HISTORY_KEY = 'pop-a-lot-run-history-v1';
const MAX_RUN_HISTORY = 30;
const MULTIPLIER_CAP = 20;
const MULTIPLIER_ANNOUNCE_STEP = 10;
const PRO_QUEUE_LENGTH = 3;
const PRO_QUEUE_ICON_SCALE = 0.75;

function loadRunHistoryFromStorage(): RunHistoryItem[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RUN_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter((item): item is RunHistoryItem => {
        return (
          item &&
          typeof item.id === 'string' &&
          typeof item.timestamp === 'number' &&
          typeof item.score === 'number' &&
          (item.mode === 'Arcade' || item.mode === 'Pro') &&
          typeof item.maxMultiplier === 'number'
        );
      })
      .sort((a, b) => b.timestamp - a.timestamp)
      .slice(0, MAX_RUN_HISTORY);
  } catch {
    return [];
  }
}

function saveRunHistoryToStorage(runHistory: RunHistoryItem[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RUN_HISTORY_KEY, JSON.stringify(runHistory.slice(0, MAX_RUN_HISTORY)));
  } catch {
    // Ignore storage quota/private-mode errors.
  }
}

const App: React.FC = () => {
  // Game Configuration
  const [currentMode, setCurrentMode] = useState<GameMode>('Arcade');
  const currentTargetSizePct = 17.5; 

  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [hasInteractionStarted, setHasInteractionStarted] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);
  
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(GAME_DURATION);
  const [targets, setTargets] = useState<Target[]>([]);
  const [runHistory, setRunHistory] = useState<RunHistoryItem[]>(() => loadRunHistoryFromStorage());
  const [proRoute, setProRoute] = useState<Shape[]>([]);
  
  // Multiplier State
  const [multiplier, setMultiplier] = useState(1.0);
  const [activeColorStreak, setActiveColorStreak] = useState<string | null>(null);
  const [currentStreakPoints, setCurrentStreakPoints] = useState(0);
  const [bestStreakPoints, setBestStreakPoints] = useState(0);

  // Statistics State
  const [stats, setStats] = useState<GameStats>({ 
    bestResponseTime: 0, 
    worstResponseTime: 0, 
    medianResponseTime: 0, 
    clickIntervals: [],
    maxMultiplier: 1.0
  });
  const lastClickTimeRef = useRef<number>(0);
  
  const [isMuted, setIsMuted] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<GameCommentary | null>(null);
  const [isLoadingAnalysis, setIsLoadingAnalysis] = useState(false);
  
  // Refs
  const gameLoopRef = useRef<number | null>(null);
  const spawnCheckRef = useRef<number | null>(null);
  const multiplierDecayRef = useRef<number | null>(null);
  const lastMultiplierUpdateRef = useRef<number>(0);
  const timeLeftRef = useRef<number>(GAME_DURATION);
  const gameOverHandledRef = useRef(false);
  const gameContainerRef = useRef<HTMLDivElement>(null);
  
  // Ref for active streak color to use in spawn logic without re-triggering effects
  const activeColorStreakRef = useRef<string | null>(null);
  const proRouteRef = useRef<Shape[]>([]);

  // Computed visual size
  const [targetSizePx, setTargetSizePx] = useState(60);

  // Floating text effects
  const [floatingTexts, setFloatingTexts] = useState<{id: number, x: number, y: number, text: string, color: string, scale: number}[]>([]);

  // Keep Ref in sync with state
  useEffect(() => {
    activeColorStreakRef.current = activeColorStreak;
  }, [activeColorStreak]);

  useEffect(() => {
    proRouteRef.current = proRoute;
  }, [proRoute]);

  useEffect(() => {
    timeLeftRef.current = timeLeft;
  }, [timeLeft]);

  useEffect(() => {
    saveRunHistoryToStorage(runHistory);
  }, [runHistory]);

  // Handle Resize - End game if playing
  const stopAllLoops = useCallback(() => {
    if (gameLoopRef.current) {
      clearInterval(gameLoopRef.current);
      gameLoopRef.current = null;
    }
    if (spawnCheckRef.current) {
      clearInterval(spawnCheckRef.current);
      spawnCheckRef.current = null;
    }
    if (multiplierDecayRef.current) {
      cancelAnimationFrame(multiplierDecayRef.current);
      multiplierDecayRef.current = null;
    }
    audioService.stopMusic();
  }, []);

  const shapeShortLabel = useCallback((shape: Shape) => {
    switch (shape) {
      case 'circle': return 'CIR';
      case 'square': return 'SQR';
      case 'triangle': return 'TRI';
      case 'star': return 'STR';
      case 'pentagon': return 'PEN';
      case 'hexagon': return 'HEX';
      case 'diamond': return 'DIA';
      default: return '???';
    }
  }, []);

  const proShapeColorMap = useMemo(() => {
    const mapping = new Map<Shape, string>();
    MODE_CONFIG.Pro.shapes.forEach((shape, idx) => {
      mapping.set(shape, MODE_CONFIG.Pro.colors[idx]);
    });
    return mapping;
  }, []);

  const getProQueueNoSpawnZone = useCallback((width: number, iconSize: number, targetSize: number) => {
    const topOffset = width >= 768 ? 126 : 118;
    const horizontalPadding = 14;
    const verticalPadding = 10;
    const gap = 10;
    const queueWidth = (horizontalPadding * 2) + (PRO_QUEUE_LENGTH * iconSize) + ((PRO_QUEUE_LENGTH - 1) * gap);
    const queueHeight = (verticalPadding * 2) + iconSize;
    const expansion = Math.max(targetSize * 1.15, 42);
    const centerX = width / 2;

    return {
      left: centerX - (queueWidth / 2) - expansion,
      right: centerX + (queueWidth / 2) + expansion,
      top: topOffset - expansion,
      bottom: topOffset + queueHeight + expansion,
    };
  }, []);

  const buildProQueueFromTargets = useCallback((targetList: Target[], seedQueue: Shape[] = proRouteRef.current): Shape[] => {
    if (targetList.length === 0) return [];

    const counts = new Map<Shape, number>();
    targetList.forEach((target) => {
      counts.set(target.shape, (counts.get(target.shape) || 0) + 1);
    });

    const nextQueue: Shape[] = [];

    for (const shape of seedQueue) {
      const remaining = counts.get(shape) || 0;
      if (remaining > 0 && nextQueue.length < PRO_QUEUE_LENGTH) {
        nextQueue.push(shape);
        counts.set(shape, remaining - 1);
      }
    }

    while (nextQueue.length < PRO_QUEUE_LENGTH) {
      const weightedPool: Shape[] = [];
      counts.forEach((count, shape) => {
        for (let i = 0; i < count; i += 1) {
          weightedPool.push(shape);
        }
      });
      if (weightedPool.length === 0) break;

      let pick = weightedPool[Math.floor(Math.random() * weightedPool.length)];
      if (nextQueue.length > 0 && pick === nextQueue[nextQueue.length - 1]) {
        const alternative = weightedPool.find((shape) => shape !== pick);
        if (alternative) pick = alternative;
      }

      nextQueue.push(pick);
      counts.set(pick, Math.max(0, (counts.get(pick) || 0) - 1));
    }

    return nextQueue;
  }, []);

  const syncProQueueFromTargets = useCallback((targetList: Target[], seedQueue?: Shape[]) => {
    const nextQueue = buildProQueueFromTargets(targetList, seedQueue);
    const prevQueue = proRouteRef.current;
    const changed =
      nextQueue.length !== prevQueue.length ||
      nextQueue.some((shape, idx) => shape !== prevQueue[idx]);

    if (changed) {
      proRouteRef.current = nextQueue;
      setProRoute(nextQueue);
    }
    return nextQueue;
  }, [buildProQueueFromTargets]);

  useEffect(() => {
    if (currentMode !== 'Pro' || gameState !== GameState.PLAYING) return;
    const route = proRouteRef.current;
    const requiredShape = route[0];

    if (requiredShape && !targets.some((target) => target.shape === requiredShape)) {
      syncProQueueFromTargets(targets, route.slice(1));
      return;
    }

    syncProQueueFromTargets(targets, route);
  }, [targets, currentMode, gameState, syncProQueueFromTargets]);

  const calculateStats = useCallback(() => {
    setStats(prev => {
      const intervals = prev.clickIntervals;

      if (intervals.length === 0) return { ...prev, bestResponseTime: 0, worstResponseTime: 0, medianResponseTime: 0 };

      const sorted = [...intervals].sort((a, b) => a - b);
      const median = sorted.length % 2 === 0
        ? (sorted[sorted.length/2 - 1] + sorted[sorted.length/2]) / 2
        : sorted[Math.floor(sorted.length/2)];

      return {
        ...prev,
        bestResponseTime: Math.min(...intervals),
        worstResponseTime: Math.max(...intervals),
        medianResponseTime: median,
      };
    });
  }, []);

  const endGame = useCallback(() => {
    stopAllLoops();
    setGameState(GameState.GAME_OVER);
    audioService.playGameOverSound();
    calculateStats();
  }, [stopAllLoops, calculateStats]);

  const handleResizeReset = useCallback(() => {
    stopAllLoops();
    setGameState(GameState.START);
    setTargets([]); 
    // Play a distinct sound for feedback
    audioService.playComboBreak(); 
    setFeedbackMessage("WINDOW RESIZED! GAME RESET!");
    setTimeout(() => {
        setFeedbackMessage(null);
    }, 2000);
  }, [stopAllLoops]);

  // Handle Resize
  useEffect(() => {
    // Separate calculation from logic to avoid immediate trigger
    const updateSize = () => {
      const minDim = Math.min(window.innerWidth, window.innerHeight);
      setTargetSizePx(Math.floor(minDim * (currentTargetSizePct / 100)));
    };

    // Initial size set
    updateSize();

    const handleResizeEvent = () => {
      updateSize();
      // Enforce game reset on resize
      if (gameState === GameState.PLAYING) {
        handleResizeReset();
      }
    };
    
    window.addEventListener('resize', handleResizeEvent);
    return () => window.removeEventListener('resize', handleResizeEvent);
  }, [gameState, handleResizeReset, currentTargetSizePct]); 

  // Handle ESC Key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (gameState === GameState.PLAYING) {
          // Abort game and return to start
          stopAllLoops();
          setGameState(GameState.START);
          setTargets([]); // Clear screen
        } else if (gameState === GameState.GAME_OVER) {
          setGameState(GameState.START);
        }
      }
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [gameState, stopAllLoops]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllLoops();
    };
  }, [stopAllLoops]);

  const spawnIfNeeded = useCallback(() => {
    if (gameState !== GameState.PLAYING) return;
    
    // Get dimensions for pixel-based math
    const width = window.innerWidth;
    const height = window.innerHeight;
    
    if (width === 0 || height === 0) return;

    const proQueueIconSize = Math.max(32, Math.round(targetSizePx * PRO_QUEUE_ICON_SCALE));
    const proQueueNoSpawnZone = currentMode === 'Pro'
      ? getProQueueNoSpawnZone(width, proQueueIconSize, targetSizePx)
      : null;

    setTargets(prev => {
      const config = MODE_CONFIG[currentMode];
      const maxTargets = config.maxTargets;

      // Maintain maxTargets
      if (prev.length >= maxTargets) return prev;

      const needed = maxTargets - prev.length;
      const newTargets: Target[] = [];
      const allCurrentTargets = [...prev]; // Working copy for collision checks

      // Helpers
      const toPx = (pct: number, dim: number) => (pct / 100) * dim;
      const toPct = (px: number, dim: number) => (px / dim) * 100;

      for (let i = 0; i < needed; i++) {
        // --- 1. Type & Color Generation ---
        let typeIndex = 0;
        const activeColor = activeColorStreakRef.current;

        if (currentMode === 'Pro') {
            // Pro mode: queue-driven spawn weighting by shape.
            const route = proRouteRef.current;
            const requiredShape = route[0];
            const nextShape = route[1] || null;
            const weights = config.shapes.map(shape => {
                if (shape === requiredShape) return 7;
                if (nextShape && shape === nextShape) return 3;
                return 1;
            });
            const totalWeight = weights.reduce((a, b) => a + b, 0);
            let random = Math.random() * totalWeight;

            typeIndex = weights.findIndex(w => {
                random -= w;
                return random < 0;
            });
            if (typeIndex === -1) typeIndex = Math.floor(Math.random() * config.colors.length);
        } else if (activeColor) {
            // Arcade: active streak color gets weighted preference.
            const weights = config.colors.map(c => c === activeColor ? 4 : 1);
            const totalWeight = weights.reduce((a, b) => a + b, 0);
            let random = Math.random() * totalWeight;
            
            typeIndex = weights.findIndex(w => {
                random -= w;
                return random < 0;
            });
            
            if (typeIndex === -1) typeIndex = Math.floor(Math.random() * config.colors.length);
        } else {
            // Uniform random
            typeIndex = Math.floor(Math.random() * config.colors.length);
        }

        const color = config.colors[typeIndex];
        const shape = config.shapes[typeIndex];

        // Stacked Logic:
        // - stacked spawn chance ramps from 10% -> 30% over the run
        // - base maximum stack ramps from 5 -> 10
        // - in the last 5 seconds, base max stack jumps to 15
        // - stack tier per stacked target:
        //   90% normal (up to base max)
        //   5% high (up to base max * 3)
        //   5% extreme (up to base max * 5)
        let stackCount = 1;
        const currentTimeLeft = timeLeftRef.current;
        const progress = Math.min(1, Math.max(0, (GAME_DURATION - currentTimeLeft) / GAME_DURATION));
        const stackedChance = 0.1 + 0.2 * progress;
        const maxStackByProgress = Math.max(2, Math.round(5 + 5 * progress));
        const baseMaxStack = currentTimeLeft <= 5 ? 15 : maxStackByProgress;

        if (Math.random() < stackedChance) {
            const tierRoll = Math.random();
            let tierMax = baseMaxStack;
            if (tierRoll >= 0.95) {
                tierMax = baseMaxStack * 5;
            } else if (tierRoll >= 0.9) {
                tierMax = baseMaxStack * 3;
            }

            const range = Math.max(1, Math.floor(tierMax) - 1);
            stackCount = 2 + Math.floor(Math.random() * range);
        }

        // --- 2. Position Generation with Constraints ---
        let attempts = 0;
        let placed = false;
        
        // Cluster Logic: 35% chance to spawn next to a same-color target (Increased from 10%)
        let anchorTarget: Target | null = null;
        if (Math.random() < 0.35 && allCurrentTargets.length > 0) {
            const sameColorTargets = allCurrentTargets.filter(t => t.color === color);
            if (sameColorTargets.length > 0) {
                anchorTarget = sameColorTargets[Math.floor(Math.random() * sameColorTargets.length)];
            }
        }

        while (attempts < 50 && !placed) {
            let xPx = 0;
            let yPx = 0;

            if (anchorTarget && attempts < 15) { // Increased attempts for anchor
                // Try to place near anchor (approx 1.05x diameter distance)
                const angle = Math.random() * Math.PI * 2;
                const dist = targetSizePx * 1.05; 
                const anchorXPx = toPx(anchorTarget.x, width);
                const anchorYPx = toPx(anchorTarget.y, height);
                xPx = anchorXPx + Math.cos(angle) * dist;
                yPx = anchorYPx + Math.sin(angle) * dist;
            } else {
                // Random Placement
                // Safe zone logic: Padding of 0.85x size from edges (Increased from 0.6)
                const pad = targetSizePx * 0.85;
                const headerH = height * 0.15; // 15% top header
                
                const minX = pad;
                const maxX = width - pad;
                const minY = headerH + pad;
                const maxY = height - pad;

                if (maxX > minX) xPx = minX + Math.random() * (maxX - minX);
                else xPx = width / 2;
                
                if (maxY > minY) yPx = minY + Math.random() * (maxY - minY);
                else yPx = height / 2;
            }

            // Boundary Check (Strict)
            // Ensure center is at least 0.6 * size from edge (radius is 0.5, so 0.1 margin)
            const margin = targetSizePx * 0.6;
            if (xPx < margin || xPx > width - margin || 
                yPx < margin || yPx > height - margin || 
                yPx < height * 0.15 + margin/2) {
                attempts++;
                continue;
            }

            if (
              proQueueNoSpawnZone &&
              xPx >= proQueueNoSpawnZone.left &&
              xPx <= proQueueNoSpawnZone.right &&
              yPx >= proQueueNoSpawnZone.top &&
              yPx <= proQueueNoSpawnZone.bottom
            ) {
              attempts++;
              continue;
            }

            // Collision & Rules Check
            let valid = true;
            let touchingCount = 0;
            
            // Rules:
            // 1. No overlap > 20% (Distance must be >= 0.8 * size)
            // 2. Cannot touch 2 other icons (Touching = Distance <= 1.1 * size)
            const minDistance = targetSizePx * 0.8;
            const touchingDistance = targetSizePx * 1.1;

            for (const other of allCurrentTargets) {
                const ox = toPx(other.x, width);
                const oy = toPx(other.y, height);
                const dx = xPx - ox;
                const dy = yPx - oy;
                const dist = Math.sqrt(dx*dx + dy*dy);

                if (dist < minDistance) {
                    valid = false;
                    break;
                }
                
                if (dist <= touchingDistance) {
                    touchingCount++;
                }
            }

            if (valid && touchingCount >= 2) {
                valid = false;
            }

            if (valid) {
                const id = Date.now().toString() + Math.random();
                const newTarget: Target = {
                    id, 
                    x: toPct(xPx, width), 
                    y: toPct(yPx, height), 
                    color, 
                    shape, 
                    createdAt: Date.now(), 
                    stackCount 
                };
                newTargets.push(newTarget);
                allCurrentTargets.push(newTarget);
                placed = true;
            }
            attempts++;
        }
      }
      return [...prev, ...newTargets];
    });
  }, [gameState, currentMode, targetSizePx, getProQueueNoSpawnZone]);

  // Multiplier Decay Logic
  const updateMultiplier = useCallback((timestamp: number) => {
    if (gameState !== GameState.PLAYING || !hasInteractionStarted) {
      if (gameState === GameState.PLAYING && !hasInteractionStarted) {
         multiplierDecayRef.current = requestAnimationFrame(updateMultiplier);
      }
      return; 
    }

    if (lastMultiplierUpdateRef.current === 0) lastMultiplierUpdateRef.current = timestamp;
    const delta = timestamp - lastMultiplierUpdateRef.current;
    lastMultiplierUpdateRef.current = timestamp;

    setMultiplier(prev => {
      if (prev <= 1.0) return 1.0;

      // Slower decay so multiplier is easier to build/maintain.
      const decayFactor = 0.08 * (prev * 0.5); 
      const drop = (delta / 1000) * decayFactor;
      
      return Math.max(1.0, prev - drop);
    });

    multiplierDecayRef.current = requestAnimationFrame(updateMultiplier);
  }, [gameState, hasInteractionStarted]);

  // Game Timer
  useEffect(() => {
    if (gameState === GameState.PLAYING) {
      // Spawn Logic runs regardless of interaction start so targets appear
      spawnCheckRef.current = window.setInterval(spawnIfNeeded, 100);

      if (hasInteractionStarted) {
        // Start Multiplier Loop
        lastMultiplierUpdateRef.current = 0;
        multiplierDecayRef.current = requestAnimationFrame(updateMultiplier);

        // Timer Loop
        gameLoopRef.current = window.setInterval(() => {
          setTimeLeft(prev => {
            const nextTime = prev - 1;
            
            // Countdown Sounds with pitch variation
            if (nextTime <= 3 && nextTime > 0) {
               audioService.playTimerPing(nextTime);
            } else if (nextTime === 10 || nextTime === 5) {
               audioService.playTimerPing(nextTime);
            }

            if (nextTime <= 0) {
              endGame();
              return 0;
            }
            return nextTime;
          });
        }, 1000);
      }
    } else {
      stopAllLoops();
    }
    
    return () => stopAllLoops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState, hasInteractionStarted, spawnIfNeeded, endGame, stopAllLoops]);

  const startGame = async (mode: GameMode) => {
    gameOverHandledRef.current = false;
    setCurrentMode(mode);
    setFeedbackMessage(null);
    await audioService.resume();
    audioService.startMusic();
    
    setScore(0);
    setTimeLeft(GAME_DURATION);
    setTargets([]);
    setAiAnalysis(null);
    setFloatingTexts([]);
    setMultiplier(1.0);
    setActiveColorStreak(null);
    setCurrentStreakPoints(0);
    setBestStreakPoints(0);
    setStats({ 
      bestResponseTime: Infinity, 
      worstResponseTime: 0, 
      medianResponseTime: 0, 
      clickIntervals: [], 
      maxMultiplier: 1.0 
    });
    
    setHasInteractionStarted(false);
    if (mode === 'Pro') {
      setProRoute([]);
      proRouteRef.current = [];
    } else {
      setProRoute([]);
      proRouteRef.current = [];
    }
    setGameState(GameState.PLAYING);
    spawnIfNeeded(); // Initial spawn
  };

  const handleTargetClick = (id: string, color: string, clientX: number, clientY: number) => {
    if (gameState !== GameState.PLAYING) return;
    
    const config = MODE_CONFIG[currentMode];

    // First Interaction Start
    if (!hasInteractionStarted) {
      setHasInteractionStarted(true);
      lastClickTimeRef.current = Date.now();
    }

    const now = Date.now();
    const interval = now - lastClickTimeRef.current;
    
    // Rapid Click Bonus detection - MODE SPECIFIC
    const isRapidClick = hasInteractionStarted && interval < config.speedThresholdMs;

    lastClickTimeRef.current = now;

    // Find target logic
    const targetHit = targets.find(t => t.id === id);
    if (!targetHit) return;

    // How many items to pop?
    const burstCount = targetHit.stackCount; 

    // Remove target immediately (Pop-One-Collects-All)
    let nextTargetsAfterHit: Target[] = [];
    setTargets(prev => {
      const next = prev.filter(t => t.id !== id);
      nextTargetsAfterHit = next;
      return next;
    });

    const isProMode = currentMode === 'Pro';
    let brokeStreak = activeColorStreak !== null && activeColorStreak !== color;
    let baseMultiplier = brokeStreak ? 1.0 : multiplier;

    if (isProMode) {
      let route = proRouteRef.current;
      let requiredShape = route[0];

      // If the required shape is no longer present, re-route immediately.
      if (requiredShape && !targets.some((target) => target.shape === requiredShape)) {
        route = syncProQueueFromTargets(targets, route.slice(1));
        requiredShape = route[0];
      }

      if (!requiredShape) {
        route = syncProQueueFromTargets(targets);
        requiredShape = route[0];
        if (!requiredShape) return;
      }
      const isCorrectShape = targetHit.shape === requiredShape;

      if (!isCorrectShape) {
        audioService.playComboBreak();
        // Wrong icon in Pro mode immediately breaks the streak.
        setMultiplier(1.0);
        setCurrentStreakPoints(0);
        setActiveColorStreak(null);
        syncProQueueFromTargets(nextTargetsAfterHit.length > 0 ? nextTargetsAfterHit : targets);

        if (hasInteractionStarted) {
          setStats(prev => ({
            ...prev,
            clickIntervals: [...prev.clickIntervals, interval]
          }));
        }

        const textId = Date.now();
        setFloatingTexts(prev => [...prev, {
          id: textId,
          x: clientX,
          y: clientY,
          text: `WRONG ${shapeShortLabel(requiredShape)}!`,
          color: "text-gray-800",
          scale: 1.6
        }]);
        setTimeout(() => {
          setFloatingTexts(prev => prev.filter(t => t.id !== textId));
        }, 800);
        return;
      }

      const remainingQueue = route.slice(1);
      syncProQueueFromTargets(nextTargetsAfterHit.length > 0 ? nextTargetsAfterHit : targets, remainingQueue);

      brokeStreak = false;
      baseMultiplier = multiplier;
    }

    if (brokeStreak) {
      // User-requested behavior: play streak-loss first, then still reward the new first hit.
      audioService.playComboBreak();
      setCurrentStreakPoints(0);
    }

    setActiveColorStreak(color);

    // MODE SPECIFIC GAIN
    const baseGain = config.multGainBase * burstCount;
    const speedBonus = isRapidClick ? config.multGainBase * burstCount : 0; // Double gain for speed
    const multiplierGain = baseGain + speedBonus;
    const nextMultiplier = Math.min(baseMultiplier + multiplierGain, MULTIPLIER_CAP);

    const previousTier = Math.floor(baseMultiplier / MULTIPLIER_ANNOUNCE_STEP);
    const nextTier = Math.floor(nextMultiplier / MULTIPLIER_ANNOUNCE_STEP);
    if (nextTier > previousTier) {
      for (let tier = previousTier + 1; tier <= nextTier; tier++) {
        const milestone = tier * MULTIPLIER_ANNOUNCE_STEP;
        setTimeout(() => {
          audioService.playMultiplierMilestone(milestone);
        }, (tier - previousTier - 1) * 90);
      }
    }

    // Update Multiplier
    setMultiplier(nextMultiplier);

    // AUDIO BURST: Play sound 'burstCount' times rapidly.
    // If streak was broken, delay these slightly so break-sound is clearly heard first.
    const burstStartDelay = brokeStreak ? 120 : 0;
    for (let i = 0; i < burstCount; i++) {
      setTimeout(() => {
        if (isRapidClick) {
          audioService.playSpeedBonus();
        } else {
          audioService.playComboBoost(baseMultiplier + (i * 0.1));
        }
      }, burstStartDelay + (i * 60));
    }

    // Update Max Mult Stat
    setStats(prev => ({ 
        ...prev, 
        maxMultiplier: Math.max(prev.maxMultiplier, nextMultiplier) 
    }));

    // Points calculation
    const earned = Math.floor(config.basePoints * baseMultiplier * burstCount);
    setScore(prev => prev + earned);

    setCurrentStreakPoints(prev => {
      const next = (brokeStreak ? 0 : prev) + earned;
      setBestStreakPoints(best => Math.max(best, next));
      return next;
    });

    // Update stats intervals
    if (hasInteractionStarted) { 
        setStats(prev => ({
        ...prev,
        clickIntervals: [...prev.clickIntervals, interval]
        }));
    }

    // Floating Text
    const textId = Date.now();
    let floatText = `+${earned}`;
    if (brokeStreak) floatText = `RESET! +${earned}`;
    if (isRapidClick) floatText = `SPEED! +${earned}`;
    if (burstCount > 1) {
      floatText = `${isRapidClick ? 'SPEED ' : ''}BURST x${burstCount}! +${earned}`;
      if (brokeStreak) {
        floatText = `RESET BURST x${burstCount}! +${earned}`;
      }
    }

    setFloatingTexts(prev => [...prev, { 
      id: textId, 
      x: clientX, 
      y: clientY, 
      text: floatText, 
      color: brokeStreak ? "text-gray-800" : "text-white",
      scale: Math.min(1 + (multiplier * 0.1) + (burstCount * 0.2), 3.5) 
    }]);
    
    setTimeout(() => {
      setFloatingTexts(prev => prev.filter(t => t.id !== textId));
    }, 800);
  };

  // AI Analysis Effect
  useEffect(() => {
    if (gameState !== GameState.GAME_OVER) {
      gameOverHandledRef.current = false;
      return;
    }
    if (gameOverHandledRef.current) return;
    gameOverHandledRef.current = true;

    const analyze = async () => {
      setIsLoadingAnalysis(true);
      let finalStats = { ...stats };
      if (stats.clickIntervals.length > 0) {
          const intervals = stats.clickIntervals;
          const sorted = [...intervals].sort((a, b) => a - b);
          const median = sorted.length % 2 === 0
            ? (sorted[sorted.length/2 - 1] + sorted[sorted.length/2]) / 2
            : sorted[Math.floor(sorted.length/2)];
          finalStats.bestResponseTime = Math.min(...intervals);
          finalStats.worstResponseTime = Math.max(...intervals);
          finalStats.medianResponseTime = median;
      }

      const commentary = await getGameCommentary(score, finalStats, currentMode);
      setAiAnalysis(commentary);
      setIsLoadingAnalysis(false);

      const runEntry: RunHistoryItem = {
        id: crypto.randomUUID?.() || `${Date.now()}-${Math.random()}`,
        timestamp: Date.now(),
        score,
        mode: currentMode,
        maxMultiplier: finalStats.maxMultiplier,
        rankTitle: commentary.rankTitle
      };
      setRunHistory(prev => [runEntry, ...prev].slice(0, MAX_RUN_HISTORY));
    };
    analyze();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameState]); 

  const formatRunDateTime = useCallback((timestamp: number) => {
    const date = new Date(timestamp);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const currentYear = new Date().getFullYear();
    const year = String(date.getFullYear()).slice(-2);
    const hour = String(date.getHours()).padStart(2, '0');
    const minute = String(date.getMinutes()).padStart(2, '0');
    const datePart = date.getFullYear() === currentYear ? `${day}.${month}` : `${day}.${month}.${year}`;
    return `${datePart} ${hour}:${minute}`;
  }, []);

  const getLatestRunsForMode = useCallback((mode: GameMode) => {
    return runHistory
      .filter((run) => run.mode === mode)
      .slice(0, 3);
  }, [runHistory]);

  const getBestRunsForMode = useCallback((mode: GameMode) => {
    return runHistory
      .filter((run) => run.mode === mode)
      .sort((a, b) => (b.score - a.score) || (b.timestamp - a.timestamp))
      .slice(0, 3);
  }, [runHistory]);

  const fillToThree = useCallback((runs: RunHistoryItem[]) => {
    const filled: Array<RunHistoryItem | null> = [...runs.slice(0, 3)];
    while (filled.length < 3) filled.push(null);
    return filled;
  }, []);

  const arcadeLatestRuns = fillToThree(getLatestRunsForMode('Arcade'));
  const arcadeBestRuns = fillToThree(getBestRunsForMode('Arcade'));
  const proLatestRuns = fillToThree(getLatestRunsForMode('Pro'));
  const proBestRuns = fillToThree(getBestRunsForMode('Pro'));
  const proQueueIconSize = Math.max(32, Math.round(targetSizePx * PRO_QUEUE_ICON_SCALE));

  const toggleSound = () => {
    const muted = audioService.toggleMute();
    setIsMuted(muted);
  };

  const handleBgClick = (e: React.MouseEvent) => {
    if (gameState === GameState.PLAYING && (e.target as HTMLElement).id === "game-area") {
        // Optional miss mechanic
    }
  };

  return (
    <div className="relative w-full h-screen bg-yellow-300 overflow-hidden select-none font-bold text-gray-900">
      
      <div className="absolute inset-0 bg-pattern pointer-events-none"></div>

      {/* Header UI */}
      <div className="absolute top-0 left-0 w-full p-2 md:p-4 z-50 pointer-events-none flex flex-col md:flex-row justify-between items-start">
        
        {/* Left: Total Score */}
        <div className="flex flex-col items-start pointer-events-auto mb-2 md:mb-0 w-1/4">
           <div className="bg-white border-4 border-black rounded-2xl px-4 py-2 shadow-hard inline-block">
             <span className="text-xs md:text-sm uppercase tracking-wider text-gray-500 block">Total Score</span>
             <div className="text-4xl md:text-6xl text-blue-500 text-stroke leading-none">{score}</div>
           </div>
        </div>

        {/* Center: Multiplier Display with LARGE Horizontal Liquid Bar */}
        {gameState === GameState.PLAYING && (
          <div className="absolute left-1/2 transform -translate-x-1/2 top-4 pointer-events-none flex flex-col items-center w-full max-w-2xl px-4">
             {/* Text & Streak Info */}
             <div className="flex items-end gap-3 mb-1">
                <div 
                  className={`text-6xl font-black text-stroke-lg text-white drop-shadow-lg transition-transform duration-75 leading-none`}
                  style={{
                    transform: `rotate(${Math.sin(Date.now() / 100) * 3}deg) scale(${1 + (multiplier / 24)})`,
                    color: activeColorStreak || '#FFFFFF'
                  }}
                >
                  x{multiplier.toFixed(1)}
                </div>
                <div className="bg-black/80 text-white rounded-full px-3 py-1 text-sm border-2 border-white/50 backdrop-blur-sm shadow-hard mb-2">
                    Streak: {currentStreakPoints}
                </div>
             </div>

             {/* Liquid Bar - Horizontal and Big */}
             <div className={`w-full h-8 bg-white border-4 border-black rounded-full relative overflow-hidden shadow-hard ${multiplier >= 10 ? 'animate-crazy-shake ring-4 ring-yellow-400' : ''}`}>
               <div 
                 className={`absolute left-0 top-0 h-full transition-all duration-100 ease-linear ${multiplier >= 10 ? 'animate-rainbow' : ''}`}
                 style={{
                   width: `${Math.min(100, ((multiplier - 1) / (MULTIPLIER_CAP - 1)) * 100)}%`, // 1 to 20 scale
                   backgroundColor: multiplier >= 10 ? undefined : (activeColorStreak || '#3B82F6')
                 }}
               >
                 {/* Bubbles / Glint overlay */}
                 <div className="absolute inset-0 w-full bg-white/30 animate-pulse"></div>
                 <div className="absolute right-0 top-0 h-full w-2 bg-white/50"></div>
               </div>
               
               {/* Tick marks */}
               <div className="absolute inset-0 flex justify-between px-2 items-center opacity-30 pointer-events-none">
                  {[...Array(6)].map((_, i) => <div key={i} className="h-full w-0.5 bg-black"></div>)}
               </div>
             </div>

             {currentMode === 'Pro' && proRoute.length > 0 && (
               <div className="mt-2 bg-white border-4 border-black rounded-2xl px-3 py-2 shadow-hard flex items-center justify-center gap-2">
                 {proRoute.map((shape, idx) => (
                   <ShapePreview
                     key={`${shape}-${idx}`}
                     shape={shape}
                     color={proShapeColorMap.get(shape) || '#FFFFFF'}
                     sizePx={proQueueIconSize}
                     isPrimary={idx === 0}
                   />
                 ))}
               </div>
             )}
          </div>
        )}

        {/* Right: Controls & Time */}
        <div className="flex flex-col items-end pointer-events-auto absolute right-4 top-4 md:static w-1/4">
           <a
             href="/"
             className="bg-white border-4 border-black rounded-full px-4 py-2 shadow-hard cursor-pointer hover:bg-gray-100 active:shadow-none active:translate-x-1 active:translate-y-1 transition-all flex items-center gap-2 mb-2 text-sm md:text-base"
             aria-label="Back to home"
           >
             <Home className="w-5 h-5" />
             Home
           </a>
           <div className={`bg-white border-4 border-black rounded-full p-2 shadow-hard cursor-pointer hover:bg-gray-100 mb-2`} onClick={toggleSound}>
             {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
           </div>
           
           {gameState === GameState.PLAYING && (
             <div className={`bg-white border-4 border-black rounded-2xl px-4 py-2 shadow-hard w-[132px] md:w-[162px] text-center ${timeLeft <= 10 ? 'animate-pulse-subtle' : ''}`}>
               <span className="text-xs md:text-sm uppercase tracking-wider text-gray-500 block">Time</span>
               <div className={`text-4xl md:text-6xl text-stroke leading-none font-mono tabular-nums ${timeLeft <= 5 ? 'text-red-500' : 'text-green-500'}`}>
                 {!hasInteractionStarted ? "GO" : String(timeLeft).padStart(2, '0')}
               </div>
             </div>
           )}
        </div>
      </div>

      {/* START SCREEN */}
      {gameState === GameState.START && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-40 bg-black/20 backdrop-blur-sm p-4 overflow-y-auto">
          {/* Feedback Message Overlay */}
          {feedbackMessage && (
             <div className="absolute top-20 z-50 animate-pop-in">
                <div className="bg-red-500 text-white text-2xl md:text-3xl font-black border-4 border-black px-6 py-4 rounded-full shadow-hard-lg rotate-2">
                   {feedbackMessage}
                </div>
             </div>
          )}

          <div className="w-full max-w-7xl grid grid-cols-1 xl:grid-cols-12 gap-4 md:gap-6 items-center my-auto">
            <div className="xl:col-span-3 order-2 xl:order-1">
              <div className="bg-white border-4 border-black rounded-3xl p-4 md:p-5 shadow-hard-lg w-full max-w-md mx-auto">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border-2 border-black bg-green-500 text-white text-sm font-black mb-4">
                  <Play className="w-4 h-4 fill-current" />
                  ARCADE
                </div>

                <div className="space-y-4 text-left">
                  <div className="bg-gray-100 rounded-xl border-2 border-black p-3">
                    <div className="flex items-center gap-2 mb-2 text-sm font-black">
                      <History className="w-4 h-4 text-blue-500" />
                      Last 3
                    </div>
                    <ul className="space-y-1.5">
                      {arcadeLatestRuns.map((run, idx) => (
                        <li key={run?.id || `arcade-latest-placeholder-${idx}`} className="flex items-center justify-between text-xs bg-white rounded-md border border-gray-300 px-2 py-1.5">
                          <span className="font-bold">{idx + 1}. {run ? `${run.score} pts` : '---'}</span>
                          <span className="text-[11px] text-gray-500 tabular-nums">{run ? formatRunDateTime(run.timestamp) : '---'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-gray-100 rounded-xl border-2 border-black p-3">
                    <div className="flex items-center gap-2 mb-2 text-sm font-black">
                      <Trophy className="w-4 h-4 text-yellow-500" />
                      Best 3
                    </div>
                    <ul className="space-y-1.5">
                      {arcadeBestRuns.map((run, idx) => (
                        <li key={run?.id || `arcade-best-placeholder-${idx}`} className="flex items-center justify-between text-xs bg-white rounded-md border border-gray-300 px-2 py-1.5">
                          <span className="font-bold">{idx + 1}. {run ? `${run.score} pts` : '---'}</span>
                          <div className="text-right leading-tight">
                            <span className="block text-[11px] text-purple-600 font-bold">{run ? `x${run.maxMultiplier.toFixed(1)}` : '---'}</span>
                            <span className="block text-[10px] text-gray-500 tabular-nums">{run ? formatRunDateTime(run.timestamp) : '---'}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="xl:col-span-6 order-1 xl:order-2">
              <div className="bg-white border-4 border-black rounded-3xl p-6 md:p-8 max-w-xl w-full shadow-hard-lg text-center mx-auto">
                <h1 className="text-6xl md:text-7xl mb-6 py-2 px-4 text-yellow-400 text-stroke-lg tracking-wide drop-shadow-md animate-bounce leading-tight">
                  POP<br/>A<br/>LOT
                </h1>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => startGame('Arcade')}
                    className="bg-green-500 text-white text-xl p-4 rounded-2xl border-4 border-black shadow-hard hover:bg-green-400 active:shadow-none active:translate-x-1 active:translate-y-1 transition-all flex flex-col items-center justify-center gap-2 group"
                  >
                    <Play className="w-8 h-8 fill-current group-hover:scale-110 transition-transform" />
                    <span className="font-black">ARCADE</span>
                    <span className="text-xs text-green-100 opacity-80 font-medium">Standard Fun</span>
                  </button>

                  <button
                    onClick={() => startGame('Pro')}
                    className="bg-purple-600 text-white text-xl p-4 rounded-2xl border-4 border-black shadow-hard hover:bg-purple-500 active:shadow-none active:translate-x-1 active:translate-y-1 transition-all flex flex-col items-center justify-center gap-2 group relative overflow-hidden"
                  >
                    <div className="absolute inset-0 bg-gradient-to-br from-transparent to-black/20 pointer-events-none"></div>
                    <Zap className="w-8 h-8 fill-current group-hover:scale-110 transition-transform animate-pulse" />
                    <span className="font-black">PRO MODE</span>
                    <span className="text-xs text-purple-200 opacity-80 font-medium">7 Colors • Harder</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="xl:col-span-3 order-3">
              <div className="bg-white border-4 border-black rounded-3xl p-4 md:p-5 shadow-hard-lg w-full max-w-md mx-auto">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border-2 border-black bg-purple-600 text-white text-sm font-black mb-4">
                  <Zap className="w-4 h-4 fill-current" />
                  PRO
                </div>

                <div className="space-y-4 text-left">
                  <div className="bg-gray-100 rounded-xl border-2 border-black p-3">
                    <div className="flex items-center gap-2 mb-2 text-sm font-black">
                      <History className="w-4 h-4 text-blue-500" />
                      Last 3
                    </div>
                    <ul className="space-y-1.5">
                      {proLatestRuns.map((run, idx) => (
                        <li key={run?.id || `pro-latest-placeholder-${idx}`} className="flex items-center justify-between text-xs bg-white rounded-md border border-gray-300 px-2 py-1.5">
                          <span className="font-bold">{idx + 1}. {run ? `${run.score} pts` : '---'}</span>
                          <span className="text-[11px] text-gray-500 tabular-nums">{run ? formatRunDateTime(run.timestamp) : '---'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-gray-100 rounded-xl border-2 border-black p-3">
                    <div className="flex items-center gap-2 mb-2 text-sm font-black">
                      <Trophy className="w-4 h-4 text-yellow-500" />
                      Best 3
                    </div>
                    <ul className="space-y-1.5">
                      {proBestRuns.map((run, idx) => (
                        <li key={run?.id || `pro-best-placeholder-${idx}`} className="flex items-center justify-between text-xs bg-white rounded-md border border-gray-300 px-2 py-1.5">
                          <span className="font-bold">{idx + 1}. {run ? `${run.score} pts` : '---'}</span>
                          <div className="text-right leading-tight">
                            <span className="block text-[11px] text-purple-600 font-bold">{run ? `x${run.maxMultiplier.toFixed(1)}` : '---'}</span>
                            <span className="block text-[10px] text-gray-500 tabular-nums">{run ? formatRunDateTime(run.timestamp) : '---'}</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GAME OVER SCREEN */}
      {gameState === GameState.GAME_OVER && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-40 bg-black/40 backdrop-blur-md p-4 overflow-y-auto">
          <div className="bg-white border-4 border-black rounded-3xl p-6 md:p-8 max-w-lg w-full shadow-hard-lg text-center animate-pop-in my-auto">
            <h2 className="text-5xl md:text-6xl mb-2 text-red-500 text-stroke-lg">TIME'S UP!</h2>
            
            <div className="flex justify-center items-end gap-2 mb-6">
              <div className="text-8xl text-blue-500 text-stroke-lg drop-shadow-md">{score}</div>
              <div className="text-xl font-bold text-gray-500 mb-4">pts</div>
            </div>
            
            <div className="mb-4">
                <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold border-2 border-black ${currentMode === 'Pro' ? 'bg-purple-600 text-white' : 'bg-green-500 text-white'}`}>
                    MODE: {currentMode.toUpperCase()}
                </span>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-6 text-sm">
              <div className="bg-gray-100 p-2 rounded-lg border-2 border-black">
                <div className="text-gray-500 text-xs uppercase">Best Time</div>
                <div className="font-bold text-green-600">{stats.bestResponseTime}ms</div>
              </div>
              <div className="bg-gray-100 p-2 rounded-lg border-2 border-black">
                <div className="text-gray-500 text-xs uppercase">Median</div>
                <div className="font-bold text-blue-600">{Math.round(stats.medianResponseTime)}ms</div>
              </div>
              <div className="bg-gray-100 p-2 rounded-lg border-2 border-black">
                <div className="text-gray-500 text-xs uppercase">Worst</div>
                <div className="font-bold text-red-600">{stats.worstResponseTime}ms</div>
              </div>
              <div className="bg-gray-100 p-2 rounded-lg border-2 border-black">
                <div className="text-gray-500 text-xs uppercase">Best Mult</div>
                <div className="font-bold text-purple-600">x{stats.maxMultiplier.toFixed(1)}</div>
              </div>
            </div>

            {/* Commentary */}
            <div className="bg-yellow-100 border-2 border-black border-dashed rounded-xl p-4 mb-6 relative">
               <div className="absolute -top-3 -left-3 bg-black text-white text-xs px-2 py-1 rotate-[-5deg] rounded-md font-bold">GAME MASTER SAYS</div>
               {isLoadingAnalysis ? (
                 <div className="flex justify-center items-center py-4 space-x-2">
                   <div className="w-3 h-3 bg-black rounded-full animate-bounce delay-0"></div>
                   <div className="w-3 h-3 bg-black rounded-full animate-bounce delay-100"></div>
                   <div className="w-3 h-3 bg-black rounded-full animate-bounce delay-200"></div>
                 </div>
               ) : (
                 <>
                   <div className="text-2xl font-black uppercase text-purple-600 mb-1">{aiAnalysis?.rankTitle || "Player"}</div>
                   <div className="text-lg italic text-gray-800">"{aiAnalysis?.comment || "Nice clicking!"}"</div>
                 </>
               )}
            </div>

            <button 
              onClick={() => setGameState(GameState.START)}
              className="bg-blue-500 text-white text-2xl px-8 py-4 rounded-2xl border-4 border-black shadow-hard hover:bg-blue-400 active:shadow-none active:translate-x-1 active:translate-y-1 transition-all flex items-center justify-center gap-2 mx-auto w-full group"
            >
              <RotateCcw className="w-8 h-8 group-hover:-rotate-180 transition-transform duration-500" />
              PLAY AGAIN
            </button>
          </div>
        </div>
      )}

      {/* PLAY AREA */}
      <div 
        id="game-area"
        ref={gameContainerRef}
        className="absolute inset-0 z-10 cursor-crosshair"
        onMouseDown={handleBgClick}
      >
        {targets.map(target => (
          <TargetButton 
            key={target.id}
            target={target}
            sizePx={targetSizePx}
            // If we have an active streak, bring matching colors to front (zIndex 50), push others back (zIndex 10)
            zIndex={activeColorStreak && target.color === activeColorStreak ? 50 : 10}
            onClick={handleTargetClick}
          />
        ))}

        {/* Floating Texts */}
        {floatingTexts.map(ft => (
          <div 
            key={ft.id}
            className={`absolute font-black text-stroke pointer-events-none transition-all duration-700 ease-out ${ft.color}`}
            style={{ 
              left: ft.x, 
              top: ft.y,
              fontSize: `${2 + (ft.scale)}rem`, // Dynamic size based on multiplier
              transform: 'translate(-50%, -100%)',
              opacity: 0,
              zIndex: 100,
              animation: 'floatUp 0.8s forwards'
            }}
          >
            {ft.text}
          </div>
        ))}
        
        <style>{`
          @keyframes floatUp {
            0% { transform: translate(-50%, -50%) scale(0.5); opacity: 1; }
            50% { transform: translate(-50%, -150%) scale(1.2); opacity: 1; }
            100% { transform: translate(-50%, -250%) scale(1); opacity: 0; }
          }
        `}</style>
      </div>
    </div>
  );
};

export default App;
