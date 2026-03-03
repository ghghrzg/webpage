const OUTPUT_GAIN_MULTIPLIER = 1.5;
const ENABLE_BACKGROUND_MUSIC = false;
const GODLIKE_SCORE_THRESHOLD_DEFAULT = 20000;
const GAMEOVER_MULTIPLIER_REFERENCE = 20;

export interface AudioPerfSnapshot {
  timestamp: number;
  playsPerSecond: number;
  voiceStealsPerSecond: number;
  poolSizes: Record<string, number>;
}

class AudioService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private nextNoteTime = 0;
  private timerID: number | null = null;
  private tempo = 100;
  private currentNoteIndex = 0;
  private readonly melody = [
    392, 0, 440, 0, 392, 0, 523, 0,
    392, 0, 440, 0, 392, 0, 587, 0,
    392, 0, 659, 0, 587, 0, 523, 0,
    440, 0, 392, 0, 440, 0, 523, 0,
  ];

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

  private isMuted = false;
  private isMusicPlaying = false;

  constructor() {
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
    this.perfSnapshot = {
      timestamp: Date.now(),
      playsPerSecond: (this.perfCounters.plays * 1000) / elapsedMs,
      voiceStealsPerSecond: (this.perfCounters.voiceSteals * 1000) / elapsedMs,
      poolSizes: {},
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

  private notePlay() {
    this.perfCounters.plays += 1;
    this.maybeRefreshPerfSnapshot();
  }

  public getPerfSnapshot(): AudioPerfSnapshot | null {
    if (!this.perfDebugEnabled) return null;
    this.maybeRefreshPerfSnapshot();
    return this.perfSnapshot;
  }

  public isHtmlMediaEngineActive() {
    return false;
  }

  private ensureReady() {
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

  private scaleVolume(base: number) {
    return Math.max(0, Math.min(1, base * this.outputGainMultiplier));
  }

  private getTimerPingTone(secondsLeft: number): number {
    if (secondsLeft <= 1) return 1174;
    if (secondsLeft === 2) return 987;
    if (secondsLeft === 3) return 880;
    if (secondsLeft <= 5) return 660;
    return 523;
  }

  private getNormalizedMultiplier(level: number, maxLevel: number) {
    const safeLevel = Math.max(1, level);
    const safeMaxLevel = Math.max(1, maxLevel);
    if (safeMaxLevel <= 1) return 0;
    return Math.max(0, Math.min(1, (safeLevel - 1) / (safeMaxLevel - 1)));
  }

  public async resume() {
    this.ensureReady();

    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  public playPopSound(pitchMultiplier: number = 1) {
    this.ensureReady();
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
    this.notePlay();
  }

  public playStartSound() {
    this.ensureReady();
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
    this.notePlay();
  }

  public playComboBoost(level: number, maxLevel: number = 20) {
    this.ensureReady();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const normalized = this.getNormalizedMultiplier(level, maxLevel);
    const now = this.ctx.currentTime;
    const baseFreq = 430 + (normalized * 700);

    const coreOsc = this.ctx.createOscillator();
    const coreGain = this.ctx.createGain();
    coreOsc.type = 'square';
    coreOsc.frequency.setValueAtTime(baseFreq, now);
    coreOsc.frequency.exponentialRampToValueAtTime(baseFreq * 1.18, now + 0.08);
    coreGain.gain.setValueAtTime(this.scaleVolume(0.085), now);
    coreGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    coreOsc.connect(coreGain);
    coreGain.connect(this.masterGain);

    const topOsc = this.ctx.createOscillator();
    const topGain = this.ctx.createGain();
    topOsc.type = 'triangle';
    topOsc.frequency.setValueAtTime(baseFreq * 2.01, now);
    topOsc.frequency.exponentialRampToValueAtTime(baseFreq * 2.3, now + 0.06);
    topGain.gain.setValueAtTime(this.scaleVolume(0.028), now);
    topGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
    topOsc.connect(topGain);
    topGain.connect(this.masterGain);

    coreOsc.start(now);
    coreOsc.stop(now + 0.102);
    topOsc.start(now);
    topOsc.stop(now + 0.094);
    this.notePlay();
  }

  public playSpeedBonus(level: number = 1, maxLevel: number = 20) {
    this.ensureReady();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const normalized = this.getNormalizedMultiplier(level, maxLevel);
    const now = this.ctx.currentTime;
    const baseFreq = 1080 + (normalized * 1320);

    const leadOsc = this.ctx.createOscillator();
    const leadGain = this.ctx.createGain();
    leadOsc.type = 'sawtooth';
    leadOsc.frequency.setValueAtTime(baseFreq, now);
    leadOsc.frequency.exponentialRampToValueAtTime(baseFreq * 1.72, now + 0.085);
    leadGain.gain.setValueAtTime(this.scaleVolume(0.062), now);
    leadGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
    leadOsc.connect(leadGain);
    leadGain.connect(this.masterGain);

    const snapOsc = this.ctx.createOscillator();
    const snapGain = this.ctx.createGain();
    snapOsc.type = 'square';
    snapOsc.frequency.setValueAtTime(baseFreq * 2.05, now);
    snapOsc.frequency.exponentialRampToValueAtTime(baseFreq * 2.45, now + 0.05);
    snapGain.gain.setValueAtTime(this.scaleVolume(0.018), now);
    snapGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.062);
    snapOsc.connect(snapGain);
    snapGain.connect(this.masterGain);

    leadOsc.start(now);
    leadOsc.stop(now + 0.102);
    snapOsc.start(now);
    snapOsc.stop(now + 0.066);
    this.notePlay();
  }

  public playComboBreak() {
    this.ensureReady();
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
    this.notePlay();
  }

  public playTimerPing(secondsLeft: number) {
    this.ensureReady();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const freq = this.getTimerPingTone(secondsLeft);
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
    this.notePlay();
  }

  public playGameOverSound(
    finalScore: number = 0,
    godlikeThreshold: number = GODLIKE_SCORE_THRESHOLD_DEFAULT,
    finalMultiplier: number = 1
  ) {
    this.ensureReady();
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const isGodlikeFinish = finalScore >= godlikeThreshold;
    const normalizedMultiplier = this.getNormalizedMultiplier(finalMultiplier, GAMEOVER_MULTIPLIER_REFERENCE);
    const transposeSemitones = isGodlikeFinish
      ? Math.round(normalizedMultiplier * 6)
      : Math.round(normalizedMultiplier * 3);
    const transposeRate = Math.pow(2, transposeSemitones / 12);

    const now = this.ctx.currentTime;
    const notes = isGodlikeFinish
      ? [523, 659, 784, 988, 1174]
      : [440, 415, 392, 370];
    const noteSpacing = isGodlikeFinish ? 0.12 : 0.19;

    notes.forEach((freq, i) => {
      const start = now + i * noteSpacing;
      const duration = isGodlikeFinish ? (i === notes.length - 1 ? 0.26 : 0.16) : 0.16;
      const pitchedFreq = Math.max(20, freq * transposeRate);
      const end = start + duration;

      const coreOsc = this.ctx!.createOscillator();
      const coreGain = this.ctx!.createGain();
      coreOsc.type = 'square';
      coreOsc.frequency.setValueAtTime(pitchedFreq, start);
      coreOsc.frequency.exponentialRampToValueAtTime(pitchedFreq * (isGodlikeFinish ? 1.035 : 1.015), end);
      coreGain.gain.setValueAtTime(this.scaleVolume(isGodlikeFinish ? 0.16 : 0.14), start);
      coreGain.gain.exponentialRampToValueAtTime(0.0001, end);
      coreOsc.connect(coreGain);
      coreGain.connect(this.masterGain!);

      const sheenOsc = this.ctx!.createOscillator();
      const sheenGain = this.ctx!.createGain();
      sheenOsc.type = isGodlikeFinish ? 'triangle' : 'sine';
      sheenOsc.frequency.setValueAtTime(pitchedFreq * 2.01, start);
      sheenOsc.frequency.exponentialRampToValueAtTime(pitchedFreq * 2.08, end);
      sheenGain.gain.setValueAtTime(this.scaleVolume(isGodlikeFinish ? 0.03 : 0.02), start);
      sheenGain.gain.exponentialRampToValueAtTime(0.0001, end);
      sheenOsc.connect(sheenGain);
      sheenGain.connect(this.masterGain!);

      coreOsc.start(start);
      coreOsc.stop(end + 0.01);
      sheenOsc.start(start);
      sheenOsc.stop(end + 0.01);
    });
    this.notePlay();
  }

  public playMultiplierMilestone(multiplierValue: number) {
    this.ensureReady();
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
    this.notePlay();
  }

  public startMusic() {
    if (!ENABLE_BACKGROUND_MUSIC) {
      this.stopMusic();
      return;
    }

    this.ensureReady();
    if (this.isMuted || this.isMusicPlaying || !this.ctx) return;

    this.isMusicPlaying = true;
    this.nextNoteTime = this.ctx.currentTime;
    this.scheduler();
  }

  public stopMusic() {
    this.isMusicPlaying = false;

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
    if (freq <= 0) return;

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

    return this.isMuted;
  }
}

export const audioService = new AudioService();
