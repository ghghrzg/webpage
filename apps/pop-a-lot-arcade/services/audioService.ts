type WaveKind = 'sine' | 'square' | 'sawtooth' | 'triangle';
const OUTPUT_GAIN_MULTIPLIER = 1.5;
const USE_HTML_MEDIA_ENGINE_EVERYWHERE = true;
const ENABLE_BACKGROUND_MUSIC = false;
const GODLIKE_SCORE_THRESHOLD_DEFAULT = 20000;

interface SequenceEvent {
  startMs: number;
  durationMs: number;
  freqStart: number;
  freqEnd?: number;
  wave: WaveKind;
  volume: number;
  attackMs?: number;
  releaseMs?: number;
}

type TimerSampleName = 'timerPing523' | 'timerPing660' | 'timerPing880' | 'timerPing987' | 'timerPing1174';

interface RenderOptions {
  filterHz?: number | null;
  sampleRate?: number;
}

interface HtmlVoice {
  audio: HTMLAudioElement;
  lastStartAt: number;
  estimatedBusyUntil: number;
  lastRate: number;
  lastVolume: number;
}

interface HtmlSampleMeta {
  dataUri: string;
  baseVolume: number;
  fallbackDurationSec: number;
  maxVoices: number;
}

export interface AudioPerfSnapshot {
  timestamp: number;
  playsPerSecond: number;
  voiceStealsPerSecond: number;
  poolSizes: Record<string, number>;
}

class AudioService {
  // WebAudio engine (desktop/non-iOS fallback)
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private nextNoteTime: number = 0;
  private timerID: number | null = null;
  private tempo: number = 100;
  private currentNoteIndex = 0;
  private readonly melody = [
    392, 0, 440, 0, 392, 0, 523, 0,
    392, 0, 440, 0, 392, 0, 587, 0,
    392, 0, 659, 0, 587, 0, 523, 0,
    440, 0, 392, 0, 440, 0, 523, 0,
  ];

  // HTML media engine (preferred on iPhone/iPad for media volume path)
  private readonly useHtmlMediaEngine: boolean;
  private htmlReady = false;
  private htmlInitPromise: Promise<void> | null = null;
  private readonly htmlSampleVoices = new Map<string, HtmlVoice[]>();
  private readonly htmlSampleMeta = new Map<string, HtmlSampleMeta>();
  private htmlMusic: HTMLAudioElement | null = null;
  private readonly baseHtmlMusicVolume = 0.2;
  private readonly outputGainMultiplier = OUTPUT_GAIN_MULTIPLIER;
  private readonly perfDebugEnabled: boolean;
  private readonly perfCounters = {
    plays: 0,
    voiceSteals: 0,
  };
  private perfWindowStartMs = 0;
  private perfLastSnapshotAtMs = 0;
  private perfTickerId: number | null = null;
  private perfSnapshot: AudioPerfSnapshot = {
    timestamp: 0,
    playsPerSecond: 0,
    voiceStealsPerSecond: 0,
    poolSizes: {},
  };

  private isMuted: boolean = false;
  private isMusicPlaying: boolean = false;

  constructor() {
    this.useHtmlMediaEngine = USE_HTML_MEDIA_ENGINE_EVERYWHERE || this.isAppleMobileDevice();
    this.perfDebugEnabled = this.readPerfDebugFlag();
    this.startPerfTelemetry();
  }

  private readPerfDebugFlag() {
    if (typeof window === 'undefined') return false;
    try {
      return new URLSearchParams(window.location.search).get('perf') === '1';
    } catch {
      return false;
    }
  }

  private nowMs() {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  private startPerfTelemetry() {
    if (!this.perfDebugEnabled || typeof window === 'undefined' || this.perfTickerId !== null) return;
    const now = this.nowMs();
    this.perfWindowStartMs = now;
    this.perfLastSnapshotAtMs = now;
    this.perfTickerId = window.setInterval(() => {
      this.flushPerfSnapshot();
    }, 1000);
  }

  private maybeRefreshPerfSnapshot() {
    if (!this.perfDebugEnabled) return;
    const now = this.nowMs();
    if (now - this.perfLastSnapshotAtMs >= 1000) {
      this.flushPerfSnapshot(now);
    }
  }

  private flushPerfSnapshot(nowMs: number = this.nowMs()) {
    if (!this.perfDebugEnabled) return;
    const elapsedMs = Math.max(1, nowMs - this.perfWindowStartMs);
    const poolSizes: Record<string, number> = {};
    this.htmlSampleVoices.forEach((voices, sampleName) => {
      poolSizes[sampleName] = voices.length;
    });

    this.perfSnapshot = {
      timestamp: Date.now(),
      playsPerSecond: (this.perfCounters.plays * 1000) / elapsedMs,
      voiceStealsPerSecond: (this.perfCounters.voiceSteals * 1000) / elapsedMs,
      poolSizes,
    };
    this.perfCounters.plays = 0;
    this.perfCounters.voiceSteals = 0;
    this.perfWindowStartMs = nowMs;
    this.perfLastSnapshotAtMs = nowMs;
    this.publishPerfSnapshot();
  }

  private publishPerfSnapshot() {
    if (!this.perfDebugEnabled || typeof window === 'undefined') return;
    (window as Window & { __popALotAudioPerf?: AudioPerfSnapshot }).__popALotAudioPerf = this.perfSnapshot;
  }

  public getPerfSnapshot(): AudioPerfSnapshot | null {
    if (!this.perfDebugEnabled) return null;
    this.maybeRefreshPerfSnapshot();
    return this.perfSnapshot;
  }

  private isAppleMobileDevice() {
    const ua = navigator.userAgent || '';
    const touchMac = navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1;
    return /iPhone|iPad|iPod/i.test(ua) || touchMac;
  }

  private ensureReady() {
    if (this.useHtmlMediaEngine) {
      if (!this.htmlReady && !this.htmlInitPromise) {
        void this.initHtmlAssets();
      }
      return;
    }
    this.ensureWebAudioReady();
  }

  private ensureWebAudioReady() {
    if (this.ctx && this.masterGain) return;
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = this.scaleVolume(0.3);
    } catch (e) {
      console.warn('Web Audio API not supported', e);
    }
  }

  private async initHtmlAssets() {
    if (this.htmlReady) return;
    if (this.htmlInitPromise) return this.htmlInitPromise;

    this.htmlInitPromise = this.buildHtmlAssets();
    try {
      await this.htmlInitPromise;
    } finally {
      this.htmlInitPromise = null;
    }
  }

  private async buildHtmlAssets() {
    try {
      const [
        pop,
        comboBoost,
        speedBonus,
        comboBreak,
        timerPing523,
        timerPing660,
        timerPing880,
        timerPing987,
        timerPing1174,
        gameOver,
        gameOverGodlike,
        milestoneSmall,
        milestoneBig,
        musicLoop,
      ] = await Promise.all([
        this.renderSequenceSample([
          { startMs: 0, durationMs: 105, freqStart: 320, freqEnd: 620, wave: 'sine', volume: 0.42, attackMs: 2, releaseMs: 95 },
          { startMs: 0, durationMs: 96, freqStart: 640, freqEnd: 840, wave: 'sine', volume: 0.08, attackMs: 2, releaseMs: 80 },
        ], 120, { filterHz: 5400 }),
        this.renderSequenceSample([
          // Closer to the old realtime boost timbre: square core + slight top layer.
          { startMs: 0, durationMs: 108, freqStart: 440, freqEnd: 560, wave: 'square', volume: 0.18, attackMs: 2, releaseMs: 82 },
          { startMs: 0, durationMs: 96, freqStart: 880, freqEnd: 980, wave: 'triangle', volume: 0.045, attackMs: 2, releaseMs: 70 },
        ], 124, { filterHz: 3600 }),
        this.renderSequenceSample([
          // Old speed bonus character: fast bright saw ramp.
          { startMs: 0, durationMs: 96, freqStart: 1180, freqEnd: 1980, wave: 'sawtooth', volume: 0.16, attackMs: 1, releaseMs: 74 },
          { startMs: 0, durationMs: 84, freqStart: 2360, freqEnd: 3100, wave: 'triangle', volume: 0.05, attackMs: 1, releaseMs: 62 },
        ], 110, { filterHz: 5800 }),
        this.renderSequenceSample([
          { startMs: 0, durationMs: 285, freqStart: 155, freqEnd: 90, wave: 'sawtooth', volume: 0.24, attackMs: 3, releaseMs: 220 },
        ], 305, { filterHz: 1700 }),
        this.renderTimerPingSample(523),
        this.renderTimerPingSample(660),
        this.renderTimerPingSample(880),
        this.renderTimerPingSample(987),
        this.renderTimerPingSample(1174),
        this.renderSequenceSample([
          { startMs: 0, durationMs: 165, freqStart: 440, wave: 'square', volume: 0.22, attackMs: 3, releaseMs: 125 },
          { startMs: 200, durationMs: 165, freqStart: 415, wave: 'square', volume: 0.22, attackMs: 3, releaseMs: 125 },
          { startMs: 400, durationMs: 165, freqStart: 392, wave: 'square', volume: 0.22, attackMs: 3, releaseMs: 125 },
          { startMs: 600, durationMs: 165, freqStart: 370, wave: 'square', volume: 0.22, attackMs: 3, releaseMs: 125 },
        ], 790, { filterHz: 2400 }),
        this.renderSequenceSample([
          { startMs: 0, durationMs: 130, freqStart: 523, freqEnd: 587, wave: 'square', volume: 0.22, attackMs: 2, releaseMs: 96 },
          { startMs: 120, durationMs: 130, freqStart: 659, freqEnd: 698, wave: 'square', volume: 0.22, attackMs: 2, releaseMs: 96 },
          { startMs: 240, durationMs: 145, freqStart: 784, freqEnd: 830, wave: 'square', volume: 0.24, attackMs: 2, releaseMs: 106 },
          { startMs: 390, durationMs: 180, freqStart: 1046, freqEnd: 1174, wave: 'triangle', volume: 0.26, attackMs: 2, releaseMs: 130 },
        ], 620, { filterHz: 4300 }),
        this.renderSequenceSample([
          { startMs: 0, durationMs: 68, freqStart: 440, wave: 'triangle', volume: 0.24, attackMs: 2, releaseMs: 50 },
          { startMs: 82, durationMs: 68, freqStart: 587, wave: 'triangle', volume: 0.24, attackMs: 2, releaseMs: 50 },
          { startMs: 164, durationMs: 68, freqStart: 831, wave: 'triangle', volume: 0.24, attackMs: 2, releaseMs: 50 },
        ], 262, { filterHz: 4500 }),
        this.renderSequenceSample([
          { startMs: 0, durationMs: 68, freqStart: 523, wave: 'square', volume: 0.22, attackMs: 2, releaseMs: 50 },
          { startMs: 82, durationMs: 68, freqStart: 698, wave: 'square', volume: 0.22, attackMs: 2, releaseMs: 50 },
          { startMs: 164, durationMs: 68, freqStart: 988, wave: 'square', volume: 0.22, attackMs: 2, releaseMs: 50 },
        ], 262, { filterHz: 3000 }),
        this.renderMusicLoopSample(),
      ]);

      this.registerHtmlSample('pop', pop, 16, 0.5, 120, 30);
      this.registerHtmlSample('comboBoost', comboBoost, 10, 0.3, 124, 24);
      this.registerHtmlSample('speedBonus', speedBonus, 10, 0.25, 110, 24);
      this.registerHtmlSample('comboBreak', comboBreak, 5, 0.34, 305, 12);
      this.registerHtmlSample('timerPing523', timerPing523, 5, 0.3, 170, 10);
      this.registerHtmlSample('timerPing660', timerPing660, 5, 0.3, 170, 10);
      this.registerHtmlSample('timerPing880', timerPing880, 5, 0.3, 170, 10);
      this.registerHtmlSample('timerPing987', timerPing987, 5, 0.3, 170, 10);
      this.registerHtmlSample('timerPing1174', timerPing1174, 5, 0.3, 170, 10);
      this.registerHtmlSample('gameOver', gameOver, 3, 0.3, 790, 6);
      this.registerHtmlSample('gameOverGodlike', gameOverGodlike, 3, 0.32, 620, 6);
      this.registerHtmlSample('milestoneSmall', milestoneSmall, 3, 0.28, 262, 8);
      this.registerHtmlSample('milestoneBig', milestoneBig, 3, 0.3, 262, 8);

      this.htmlMusic = new Audio(musicLoop);
      this.htmlMusic.loop = true;
      this.htmlMusic.preload = 'auto';
      this.htmlMusic.volume = this.isMuted ? 0 : this.getHtmlMusicVolume();

      this.htmlReady = true;
    } catch (e) {
      console.warn('Falling back to basic iOS audio samples', e);
      this.buildFallbackHtmlAssets();
      this.htmlReady = true;
    }
  }

  private buildFallbackHtmlAssets() {
    const pop = this.makeSequenceSampleFallback([
      { startMs: 0, durationMs: 110, freqStart: 320, freqEnd: 620, wave: 'sine', volume: 0.45 },
    ], 120);
    this.registerHtmlSample('pop', pop, 14, 0.45, 120, 24);
    this.registerHtmlSample('comboBoost', pop, 10, 0.2, 120, 20);
    this.registerHtmlSample('speedBonus', pop, 10, 0.2, 120, 20);
    this.registerHtmlSample('comboBreak', pop, 5, 0.3, 180, 10);
    this.registerHtmlSample('timerPing523', pop, 5, 0.2, 180, 10);
    this.registerHtmlSample('timerPing660', pop, 5, 0.2, 180, 10);
    this.registerHtmlSample('timerPing880', pop, 5, 0.2, 180, 10);
    this.registerHtmlSample('timerPing987', pop, 5, 0.2, 180, 10);
    this.registerHtmlSample('timerPing1174', pop, 5, 0.2, 180, 10);
    this.registerHtmlSample('gameOver', pop, 3, 0.22, 220, 6);
    this.registerHtmlSample('gameOverGodlike', pop, 3, 0.24, 220, 6);
    this.registerHtmlSample('milestoneSmall', pop, 3, 0.22, 180, 8);
    this.registerHtmlSample('milestoneBig', pop, 3, 0.24, 180, 8);
    this.htmlMusic = new Audio(pop);
    this.htmlMusic.loop = true;
    this.htmlMusic.preload = 'auto';
    this.htmlMusic.volume = this.isMuted ? 0 : this.getHtmlMusicVolume();
  }

  private createHtmlVoice(meta: HtmlSampleMeta): HtmlVoice {
    const audio = new Audio(meta.dataUri);
    audio.preload = 'auto';
    this.disablePitchCorrection(audio);
    audio.volume = meta.baseVolume;
    audio.load();
    return {
      audio,
      lastStartAt: 0,
      estimatedBusyUntil: 0,
      lastRate: 1,
      lastVolume: meta.baseVolume,
    };
  }

  private registerHtmlSample(
    name: string,
    dataUri: string,
    poolSize: number,
    volume: number,
    fallbackDurationMs: number = 180,
    maxVoices: number = Math.max(poolSize + 2, Math.ceil(poolSize * 2.25))
  ) {
    const pool: HtmlVoice[] = [];
    const scaledVolume = this.scaleVolume(volume);
    const meta: HtmlSampleMeta = {
      dataUri,
      baseVolume: scaledVolume,
      fallbackDurationSec: Math.max(0.02, fallbackDurationMs / 1000),
      maxVoices: Math.max(poolSize, maxVoices),
    };
    for (let i = 0; i < poolSize; i += 1) {
      pool.push(this.createHtmlVoice(meta));
    }
    this.htmlSampleMeta.set(name, meta);
    this.htmlSampleVoices.set(name, pool);
    this.maybeRefreshPerfSnapshot();
  }

  private disablePitchCorrection(audio: HTMLAudioElement) {
    const media = audio as HTMLAudioElement & {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };

    // Ensure playbackRate changes also change pitch on Safari/iOS/Firefox.
    media.preservesPitch = false;
    media.mozPreservesPitch = false;
    media.webkitPreservesPitch = false;
  }

  private scaleVolume(base: number) {
    return Math.max(0, Math.min(1, base * this.outputGainMultiplier));
  }

  private getHtmlMusicVolume() {
    return this.scaleVolume(this.baseHtmlMusicVolume);
  }

  private getHtmlVoiceDurationSec(sampleName: string, voice: HtmlVoice, playbackRate: number) {
    const meta = this.htmlSampleMeta.get(sampleName);
    const fallbackDuration = meta?.fallbackDurationSec ?? 0.18;
    const rawDuration = Number.isFinite(voice.audio.duration) && voice.audio.duration > 0
      ? voice.audio.duration
      : fallbackDuration;
    return Math.max(0.02, rawDuration / Math.max(0.5, playbackRate));
  }

  private selectHtmlVoice(sampleName: string): { voice: HtmlVoice; stoleVoice: boolean } | null {
    const meta = this.htmlSampleMeta.get(sampleName);
    const pool = this.htmlSampleVoices.get(sampleName);
    if (!meta || !pool || pool.length === 0) return null;

    const now = this.nowMs();
    let freeVoice: HtmlVoice | null = null;
    let stealCandidate: HtmlVoice | null = null;
    let shortestRemainingMs = Number.POSITIVE_INFINITY;

    for (const voice of pool) {
      const remainingMs = voice.estimatedBusyUntil - now;
      if (voice.audio.ended || voice.audio.paused || remainingMs <= 0) {
        freeVoice = voice;
        break;
      }
      if (remainingMs < shortestRemainingMs) {
        shortestRemainingMs = remainingMs;
        stealCandidate = voice;
      }
    }

    if (freeVoice) {
      return { voice: freeVoice, stoleVoice: false };
    }

    const canGrow = pool.length < meta.maxVoices;
    if (canGrow && (shortestRemainingMs > 24 || !stealCandidate)) {
      const freshVoice = this.createHtmlVoice(meta);
      pool.push(freshVoice);
      return { voice: freshVoice, stoleVoice: false };
    }

    if (stealCandidate) {
      return { voice: stealCandidate, stoleVoice: true };
    }

    if (canGrow) {
      const freshVoice = this.createHtmlVoice(meta);
      pool.push(freshVoice);
      return { voice: freshVoice, stoleVoice: false };
    }

    return null;
  }

  private playHtmlSample(name: string, playbackRate: number = 1) {
    if (this.isMuted || !this.htmlReady) return;
    const meta = this.htmlSampleMeta.get(name);
    if (!meta) return;

    const clampedRate = Math.max(0.5, Math.min(2.6, playbackRate));
    const selected = this.selectHtmlVoice(name);
    if (!selected) return;

    const { voice, stoleVoice } = selected;
    const audio = voice.audio;
    if (stoleVoice) {
      this.perfCounters.voiceSteals += 1;
    }
    if (!audio.paused) {
      audio.pause();
    }
    audio.currentTime = 0;
    if (Math.abs(voice.lastRate - clampedRate) > 0.001) {
      audio.playbackRate = clampedRate;
      voice.lastRate = clampedRate;
    }
    if (Math.abs(voice.lastVolume - meta.baseVolume) > 0.001) {
      audio.volume = meta.baseVolume;
      voice.lastVolume = meta.baseVolume;
    }

    const now = this.nowMs();
    voice.lastStartAt = now;
    voice.estimatedBusyUntil = now + (this.getHtmlVoiceDurationSec(name, voice, clampedRate) * 1000);
    this.perfCounters.plays += 1;
    this.maybeRefreshPerfSnapshot();

    audio.play().catch(() => {
      // Ignore blocked play errors before first user interaction.
      voice.estimatedBusyUntil = this.nowMs();
    });
  }

  private getOfflineAudioContextClass() {
    return (window as any).OfflineAudioContext || (window as any).webkitOfflineAudioContext;
  }

  private renderTimerPingSample(freq: number) {
    return this.renderSequenceSample([
      { startMs: 0, durationMs: 145, freqStart: freq, freqEnd: freq * 1.01, wave: 'sine', volume: 0.3, attackMs: 2, releaseMs: 118 },
      { startMs: 0, durationMs: 115, freqStart: freq * 2, wave: 'triangle', volume: 0.05, attackMs: 2, releaseMs: 92 },
    ], 170, { filterHz: 5000 });
  }

  private getTimerPingTone(secondsLeft: number): { freq: number; sampleName: TimerSampleName } {
    if (secondsLeft <= 1) return { freq: 1174, sampleName: 'timerPing1174' };
    if (secondsLeft === 2) return { freq: 987, sampleName: 'timerPing987' };
    if (secondsLeft === 3) return { freq: 880, sampleName: 'timerPing880' };
    if (secondsLeft <= 5) return { freq: 660, sampleName: 'timerPing660' };
    return { freq: 523, sampleName: 'timerPing523' };
  }

  private getComboBoostPlaybackRate(level: number, maxLevel: number) {
    const semitoneStep = this.getSemitoneStepFromLevel(level, maxLevel, 0, 22);
    return this.semitoneStepToRate(semitoneStep);
  }

  private getSpeedBonusPlaybackRate(level: number, maxLevel: number) {
    const semitoneStep = this.getSemitoneStepFromLevel(level, maxLevel, 2, 24);
    return this.semitoneStepToRate(semitoneStep);
  }

  private getSemitoneStepFromLevel(
    level: number,
    maxLevel: number,
    offset: number,
    maxSemitoneStep: number
  ) {
    const normalized = this.getNormalizedMultiplier(level, maxLevel);
    const step = Math.round(normalized * (maxSemitoneStep - offset)) + offset;
    return Math.max(0, Math.min(maxSemitoneStep, step));
  }

  private getNormalizedMultiplier(level: number, maxLevel: number) {
    const safeLevel = Math.max(1, level);
    const safeMaxLevel = Math.max(1, maxLevel);
    if (safeMaxLevel <= 1) return 0;
    return Math.max(0, Math.min(1, (safeLevel - 1) / (safeMaxLevel - 1)));
  }

  private semitoneStepToRate(semitoneStep: number) {
    return Math.max(0.75, Math.min(2.35, Math.pow(2, semitoneStep / 12)));
  }

  private async renderMusicLoopSample() {
    const secondsPerBeat = 60 / this.tempo;
    const stepMs = secondsPerBeat * 0.25 * 1000;
    const events: SequenceEvent[] = [];

    this.melody.forEach((freq, index) => {
      if (freq <= 0) return;
      const startMs = index * stepMs;
      events.push({
        startMs,
        durationMs: stepMs * 0.95,
        freqStart: freq,
        freqEnd: freq * 1.01,
        wave: 'sine',
        volume: 0.12,
        attackMs: 6,
        releaseMs: stepMs * 0.6,
      });
      events.push({
        startMs,
        durationMs: stepMs * 0.8,
        freqStart: freq * 2,
        freqEnd: freq * 2.02,
        wave: 'triangle',
        volume: 0.03,
        attackMs: 4,
        releaseMs: stepMs * 0.5,
      });
    });

    const totalMs = (this.melody.length * stepMs) + 30;
    return this.renderSequenceSample(events, totalMs, { filterHz: 5400, sampleRate: 44100 });
  }

  private async renderSequenceSample(events: SequenceEvent[], totalMs: number, options: RenderOptions = {}) {
    const OfflineAudioContextClass = this.getOfflineAudioContextClass();
    if (!OfflineAudioContextClass) {
      return this.makeSequenceSampleFallback(events, totalMs);
    }

    const sampleRate = options.sampleRate ?? 44100;
    const frames = Math.max(1, Math.ceil((totalMs / 1000) * sampleRate));
    const ctx = new OfflineAudioContextClass(1, frames, sampleRate) as OfflineAudioContext;

    for (const event of events) {
      const startSec = event.startMs / 1000;
      const endSec = (event.startMs + event.durationMs) / 1000;
      const osc = ctx.createOscillator();
      osc.type = event.wave;
      osc.frequency.setValueAtTime(Math.max(20, event.freqStart), startSec);
      if (event.freqEnd && event.freqEnd !== event.freqStart) {
        osc.frequency.exponentialRampToValueAtTime(Math.max(20, event.freqEnd), endSec);
      }

      const gain = ctx.createGain();
      const peak = Math.max(0.0001, Math.min(1, event.volume));
      const attackSec = Math.max(0.001, (event.attackMs ?? Math.min(16, event.durationMs * 0.1)) / 1000);
      const releaseSec = Math.max(0.001, (event.releaseMs ?? Math.min(event.durationMs * 0.65, event.durationMs - 4)) / 1000);
      const releaseStartSec = Math.max(startSec + attackSec + 0.003, endSec - releaseSec);

      gain.gain.setValueAtTime(0.0001, startSec);
      gain.gain.exponentialRampToValueAtTime(peak, startSec + attackSec);
      gain.gain.setValueAtTime(peak, releaseStartSec);
      gain.gain.exponentialRampToValueAtTime(0.0001, endSec);

      if (options.filterHz && options.filterHz > 0) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(options.filterHz, startSec);
        osc.connect(filter);
        filter.connect(gain);
      } else {
        osc.connect(gain);
      }
      gain.connect(ctx.destination);

      osc.start(startSec);
      osc.stop(endSec + 0.003);
    }

    const buffer = await ctx.startRendering();
    return this.audioBufferToWavDataUri(buffer);
  }

  private audioBufferToWavDataUri(buffer: AudioBuffer) {
    const samples = buffer.getChannelData(0);
    return this.floatToWavDataUri(samples, buffer.sampleRate);
  }

  private makeSequenceSampleFallback(events: SequenceEvent[], totalMs: number) {
    const sampleRate = 32000;
    const totalSamples = Math.max(1, Math.round((totalMs / 1000) * sampleRate));
    const data = new Float32Array(totalSamples);

    events.forEach((event) => {
      const startSample = Math.max(0, Math.round((event.startMs / 1000) * sampleRate));
      const eventSamples = Math.max(1, Math.round((event.durationMs / 1000) * sampleRate));
      const attackSamples = Math.max(1, Math.round(((event.attackMs ?? Math.min(16, event.durationMs * 0.1)) / 1000) * sampleRate));
      const releaseSamples = Math.max(1, Math.round(((event.releaseMs ?? Math.min(event.durationMs * 0.65, event.durationMs - 4)) / 1000) * sampleRate));
      let phase = 0;

      for (let i = 0; i < eventSamples; i += 1) {
        const globalI = startSample + i;
        if (globalI >= totalSamples) break;
        const t = i / Math.max(1, eventSamples - 1);
        const freqEnd = event.freqEnd ?? event.freqStart;
        const freq = event.freqStart + ((freqEnd - event.freqStart) * t);
        phase += (2 * Math.PI * freq) / sampleRate;
        const wave = this.waveAtPhase(event.wave, phase);
        const env = this.envelopeAtSample(i, eventSamples, attackSamples, releaseSamples);
        data[globalI] += wave * env * event.volume;
      }
    });

    for (let i = 0; i < data.length; i += 1) {
      if (data[i] > 1) data[i] = 1;
      if (data[i] < -1) data[i] = -1;
    }

    return this.floatToWavDataUri(data, sampleRate);
  }

  private envelopeAtSample(i: number, totalSamples: number, attackSamples: number, releaseSamples: number) {
    const attack = Math.min(1, i / attackSamples);
    const releaseStart = Math.max(0, totalSamples - releaseSamples);
    const release = i < releaseStart ? 1 : Math.max(0, (totalSamples - i) / releaseSamples);
    return Math.min(attack, release);
  }

  private waveAtPhase(wave: WaveKind, phase: number) {
    switch (wave) {
      case 'square':
        return Math.sign(Math.sin(phase)) || 1;
      case 'sawtooth': {
        const wrapped = phase % (2 * Math.PI);
        return (wrapped / Math.PI) - 1;
      }
      case 'triangle':
        return (2 / Math.PI) * Math.asin(Math.sin(phase));
      case 'sine':
      default:
        return Math.sin(phase);
    }
  }

  private floatToWavDataUri(samples: Float32Array, sampleRate: number) {
    const numChannels = 1;
    const bytesPerSample = 2;
    const blockAlign = numChannels * bytesPerSample;
    const byteRate = sampleRate * blockAlign;
    const dataSize = samples.length * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataSize);
    const view = new DataView(buffer);

    const writeString = (offset: number, value: string) => {
      for (let i = 0; i < value.length; i += 1) {
        view.setUint8(offset + i, value.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataSize, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, 16, true);
    writeString(36, 'data');
    view.setUint32(40, dataSize, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i += 1) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      const pcm = s < 0 ? s * 0x8000 : s * 0x7fff;
      view.setInt16(offset, pcm, true);
      offset += 2;
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.length; i += 1) {
      binary += String.fromCharCode(bytes[i]);
    }

    return `data:audio/wav;base64,${btoa(binary)}`;
  }

  public async resume() {
    this.ensureReady();

    if (this.useHtmlMediaEngine) {
      await this.initHtmlAssets();
      const navAny = navigator as Navigator & { audioSession?: { type?: string } };
      try {
        if (navAny.audioSession) {
          navAny.audioSession.type = 'playback';
        }
      } catch {
        // Best effort only.
      }

      if (this.htmlMusic) {
        this.htmlMusic.muted = this.isMuted;
        this.htmlMusic.volume = this.isMuted ? 0 : this.getHtmlMusicVolume();
      }
      return;
    }

    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  public playPopSound(pitchMultiplier: number = 1) {
    this.ensureReady();
    if (this.useHtmlMediaEngine) {
      this.playHtmlSample('pop', Math.max(0.65, Math.min(2.2, pitchMultiplier)));
      return;
    }
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';
    const baseFreq = 300 * pitchMultiplier;
    osc.frequency.setValueAtTime(baseFreq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 2, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  public playStartSound() {
    this.ensureReady();
    if (this.useHtmlMediaEngine) {
      this.playHtmlSample('milestoneSmall', 1.04);
      return;
    }
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const notes = [523, 659, 784];
    notes.forEach((freq, i) => {
      const start = now + (i * 0.045);
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      gain.gain.setValueAtTime(this.scaleVolume(0.12), start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.08);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(start);
      osc.stop(start + 0.085);
    });
  }

  public playComboBoost(level: number, maxLevel: number = 20) {
    this.ensureReady();
    if (this.useHtmlMediaEngine) {
      this.playHtmlSample('comboBoost', this.getComboBoostPlaybackRate(level, maxLevel));
      return;
    }
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'square';
    const normalized = this.getNormalizedMultiplier(level, maxLevel);
    const freq = 440 + (normalized * 650);
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(freq + 140, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  public playSpeedBonus(level: number = 1, maxLevel: number = 20) {
    this.ensureReady();
    if (this.useHtmlMediaEngine) {
      this.playHtmlSample('speedBonus', this.getSpeedBonusPlaybackRate(level, maxLevel));
      return;
    }
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    const normalized = this.getNormalizedMultiplier(level, maxLevel);
    const freq = 1200 + (normalized * 1250);
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(freq * 1.65, this.ctx.currentTime + 0.1);

    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  public playComboBreak() {
    this.ensureReady();
    if (this.useHtmlMediaEngine) {
      this.playHtmlSample('comboBreak');
      return;
    }
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(100, this.ctx.currentTime + 0.3);

    gain.gain.setValueAtTime(0.3, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.3);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.3);
  }

  public playTimerPing(secondsLeft: number) {
    this.ensureReady();
    const { freq, sampleName } = this.getTimerPingTone(secondsLeft);
    if (this.useHtmlMediaEngine) {
      this.playHtmlSample(sampleName, 1);
      return;
    }
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.type = 'sine';

    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  public playGameOverSound(finalScore: number = 0, godlikeThreshold: number = GODLIKE_SCORE_THRESHOLD_DEFAULT) {
    this.ensureReady();
    const isGodlikeFinish = finalScore >= godlikeThreshold;
    if (this.useHtmlMediaEngine) {
      this.playHtmlSample(isGodlikeFinish ? 'gameOverGodlike' : 'gameOver');
      return;
    }
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const notes = isGodlikeFinish ? [523, 659, 784, 988] : [440, 415, 392, 370];

    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      const start = now + i * (isGodlikeFinish ? 0.14 : 0.2);
      const end = start + (isGodlikeFinish ? 0.18 : 0.15);
      gain.gain.setValueAtTime(isGodlikeFinish ? 0.22 : 0.2, start);
      gain.gain.linearRampToValueAtTime(0, end);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(start);
      osc.stop(end + 0.05);
    });
  }

  public playMultiplierMilestone(multiplierValue: number) {
    this.ensureReady();
    if (this.useHtmlMediaEngine) {
      this.playHtmlSample(multiplierValue >= 20 ? 'milestoneBig' : 'milestoneSmall');
      return;
    }
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const now = this.ctx.currentTime;
    const isBigMilestone = multiplierValue >= 20;
    const notes = isBigMilestone ? [523, 698, 988] : [440, 587, 831];

    notes.forEach((freq, i) => {
      const start = now + i * 0.07;
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();

      osc.type = isBigMilestone ? 'square' : 'triangle';
      osc.frequency.setValueAtTime(freq, start);
      osc.frequency.exponentialRampToValueAtTime(freq * 1.02, start + 0.06);

      gain.gain.setValueAtTime(isBigMilestone ? 0.18 : 0.14, start);
      gain.gain.exponentialRampToValueAtTime(0.01, start + 0.065);

      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(start);
      osc.stop(start + 0.07);
    });
  }

  public startMusic() {
    if (!ENABLE_BACKGROUND_MUSIC) {
      this.stopMusic();
      return;
    }

    this.ensureReady();
    if (this.isMuted || this.isMusicPlaying) return;

    if (this.useHtmlMediaEngine) {
      if (!this.htmlMusic || !this.htmlReady) return;
      this.isMusicPlaying = true;
      this.htmlMusic.muted = false;
      this.htmlMusic.volume = this.getHtmlMusicVolume();
      this.htmlMusic.play().catch(() => {
        this.isMusicPlaying = false;
      });
      return;
    }

    if (!this.ctx) return;
    this.isMusicPlaying = true;
    this.nextNoteTime = this.ctx.currentTime;
    this.scheduler();
  }

  public stopMusic() {
    this.isMusicPlaying = false;

    if (this.useHtmlMediaEngine) {
      if (this.htmlMusic) {
        this.htmlMusic.pause();
      }
      return;
    }

    if (this.timerID) {
      window.clearTimeout(this.timerID);
      this.timerID = null;
    }
  }

  private scheduler() {
    if (!this.isMusicPlaying || !this.ctx) return;

    while (this.nextNoteTime < this.ctx.currentTime + 0.1) {
      this.scheduleNote(this.nextNoteTime);
      this.advanceNote();
    }

    this.timerID = window.setTimeout(() => this.scheduler(), 25);
  }

  private scheduleNote(time: number) {
    if (!this.masterGain || !this.ctx) return;

    const freq = this.melody[this.currentNoteIndex % this.melody.length];

    if (freq > 0) {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = freq;

      gain.gain.setValueAtTime(0, time);
      gain.gain.linearRampToValueAtTime(0.05, time + 0.05);
      gain.gain.linearRampToValueAtTime(0, time + 0.2);

      osc.connect(gain);
      gain.connect(this.masterGain);
      osc.start(time);
      osc.stop(time + 0.25);
    }
  }

  private advanceNote() {
    const secondsPerBeat = 60.0 / this.tempo;
    this.nextNoteTime += 0.25 * secondsPerBeat;
    this.currentNoteIndex++;
  }

  public toggleMute() {
    this.isMuted = !this.isMuted;

    if (this.isMuted) {
      this.stopMusic();
    }

    if (this.htmlMusic) {
      this.htmlMusic.muted = this.isMuted;
      this.htmlMusic.volume = this.isMuted ? 0 : this.getHtmlMusicVolume();
    }

    return this.isMuted;
  }
}

export const audioService = new AudioService();
