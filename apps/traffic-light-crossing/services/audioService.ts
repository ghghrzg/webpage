export class AudioService {
  private audioContext: AudioContext | null = null;
  private isMuted = false;
  private volumes = {
    horn: 0.5,
    lightClick: 0.5,
  };

  constructor() {
    this.loadMuteState();
  }

  private loadMuteState() {
    try {
      const saved = localStorage.getItem('traffic-light-muted');
      this.isMuted = saved === 'true';
      const horn = Number(localStorage.getItem('traffic-light-volume-horn'));
      const lightClick = Number(localStorage.getItem('traffic-light-volume-light-click'));
      if (!Number.isNaN(horn)) this.volumes.horn = this.clampVolume(horn);
      if (!Number.isNaN(lightClick)) this.volumes.lightClick = this.clampVolume(lightClick);
    } catch {
      this.isMuted = false;
    }
  }

  private saveMuteState() {
    try {
      localStorage.setItem('traffic-light-muted', String(this.isMuted));
      localStorage.setItem('traffic-light-volume-horn', String(this.volumes.horn));
      localStorage.setItem('traffic-light-volume-light-click', String(this.volumes.lightClick));
    } catch {
      // ignore
    }
  }

  private clampVolume(value: number) {
    return Math.max(0, Math.min(1, value));
  }

  private ensureAudioContext() {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
  }

  toggle() {
    this.isMuted = !this.isMuted;
    this.saveMuteState();
    return this.isMuted;
  }

  getMuted() {
    return this.isMuted;
  }

  getVolumes() {
    return { ...this.volumes };
  }

  setVolume(channel: 'horn' | 'lightClick', value: number) {
    this.volumes[channel] = this.clampVolume(value);
    this.saveMuteState();
  }

  private playSimpleOscillator(
    frequency: number,
    gainValue: number,
    duration: number,
    type: OscillatorType = 'sine',
    toFrequency?: number,
  ) {
    if (this.isMuted) return;
    this.ensureAudioContext();
    try {
      const ctx = this.audioContext!;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = type;
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.setValueAtTime(frequency, ctx.currentTime);
      if (toFrequency) {
        osc.frequency.exponentialRampToValueAtTime(toFrequency, ctx.currentTime + duration);
      }
      gain.gain.setValueAtTime(gainValue, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {
      // ignore errors
    }
  }

  playCrash() {
    this.playSimpleOscillator(150, 0.3, 0.1, 'sawtooth', 50);
  }

  playSuccess() {
    this.playSimpleOscillator(400, 0.2, 0.1, 'triangle');
  }

  playWarning() {
    this.playSimpleOscillator(800, 0.15, 0.05, 'square');
  }

  playLightClick() {
    const volume = this.volumes.lightClick;
    if (volume <= 0) return;
    this.playSimpleOscillator(1120, 0.03 * volume, 0.028, 'square');
  }

  playHorn() {
    const volume = this.volumes.horn;
    if (volume <= 0) return;
    this.playSimpleOscillator(350, 0.055 * volume, 0.12, 'sawtooth');
  }
}

export const audioService = new AudioService();
