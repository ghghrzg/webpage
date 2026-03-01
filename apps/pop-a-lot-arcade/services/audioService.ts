class AudioService {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicOscillators: OscillatorNode[] = [];
  private isMuted: boolean = false;
  private isMusicPlaying: boolean = false;
  private nextNoteTime: number = 0;
  private timerID: number | null = null;
  private tempo: number = 100;

  constructor() {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.connect(this.ctx.destination);
      this.masterGain.gain.value = 0.3; 
    } catch (e) {
      console.warn("Web Audio API not supported", e);
    }
  }

  public async resume() {
    if (this.ctx?.state === 'suspended') {
      await this.ctx.resume();
    }
  }

  public playPopSound(pitchMultiplier: number = 1) {
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

  public playComboBoost(level: number) {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'square';
    // Pitch rises with combo level
    const freq = 440 + (level * 50);
    osc.frequency.setValueAtTime(freq, this.ctx.currentTime);
    osc.frequency.linearRampToValueAtTime(freq + 100, this.ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.1, this.ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  public playSpeedBonus() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    // A quick, high-pitch "zing"
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1200, this.ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(2000, this.ctx.currentTime + 0.1);
    
    gain.gain.setValueAtTime(0.08, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.1);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.1);
  }

  public playComboBreak() {
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
    if (!this.ctx || !this.masterGain || this.isMuted) return;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    
    osc.type = 'sine';
    
    // Distinct pitches for 3, 2, 1
    let freq = 880; // Default High A
    if (secondsLeft === 3) freq = 880; // A5
    if (secondsLeft === 2) freq = 987; // B5
    if (secondsLeft === 1) freq = 1174; // D6
    if (secondsLeft > 3) freq = 660; // E5 (for 10s mark etc)

    osc.frequency.setValueAtTime(freq, this.ctx.currentTime); 
    
    gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, this.ctx.currentTime + 0.15);
    
    osc.connect(gain);
    gain.connect(this.masterGain);
    
    osc.start();
    osc.stop(this.ctx.currentTime + 0.15);
  }

  public playGameOverSound() {
    if (!this.ctx || !this.masterGain || this.isMuted) return;
    
    const now = this.ctx.currentTime;
    const notes = [440, 415, 392, 370]; 
    
    notes.forEach((freq, i) => {
      const osc = this.ctx!.createOscillator();
      const gain = this.ctx!.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.2, now + i * 0.2);
      gain.gain.linearRampToValueAtTime(0, now + i * 0.2 + 0.15);
      osc.connect(gain);
      gain.connect(this.masterGain!);
      osc.start(now + i * 0.2);
      osc.stop(now + i * 0.2 + 0.2);
    });
  }

  public playMultiplierMilestone(multiplierValue: number) {
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
    if (this.isMusicPlaying || !this.ctx || this.isMuted) return;
    this.isMusicPlaying = true;
    this.nextNoteTime = this.ctx.currentTime;
    this.scheduler();
  }

  public stopMusic() {
    this.isMusicPlaying = false;
    if (this.timerID) {
      window.clearTimeout(this.timerID);
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

  private currentNoteIndex = 0;
  private melody = [
    392, 0, 440, 0, 392, 0, 523, 0, 
    392, 0, 440, 0, 392, 0, 587, 0,
    392, 0, 659, 0, 587, 0, 523, 0, 
    440, 0, 392, 0, 440, 0, 523, 0
  ]; 

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
    } else {
      this.startMusic();
    }
    return this.isMuted;
  }
}

export const audioService = new AudioService();
