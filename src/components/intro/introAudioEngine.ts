import { kageSound } from '../../lib/soundEngine';

/**
 * KAGE — 6-Scene Cinematic Intro Soundscape Engine
 *
 * Original procedural Web Audio synthesis synchronized with the 6-scene Captain Yami sequence:
 * - Scene 01 (0–2s):   Low #050505 atmospheric sub-bass drone gradually building tension (quiet start)
 * - Scene 02 (2–6s):   Rising dark-mana tension harmonic pulse
 * - Scene 03 (6–9s):   Dark magic compression + metallic katana unsheathe & slash + sub-bass impact
 * - Scene 04 (9–10s):  Dimensional screen-cut crackle & spatial rift dispersion
 * - Scene 05 (10–13s): Crimson ignition + subtle crystalline light-sweep shimmer & dark regal chord
 * - Scene 06 (13–14s): Deep cinematic finishing resonance resolving cleanly into REALMS
 */
class IntroCinematicSoundEngine {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private ambientOscA: OscillatorNode | null = null;
  private ambientOscB: OscillatorNode | null = null;
  private ambientGain: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private stopped = false;

  public resetSession(): void {
    this.stop();
    this.stopped = false;
  }

  private ensureContext(): AudioContext | null {
    if (this.stopped) return null;
    if (!kageSound.isSplashAudioAllowed()) return null;

    const masterVol = kageSound.getSplashMasterVolume();
    if (masterVol <= 0) return null;

    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;

    try {
      if (!this.ctx) {
        this.ctx = new AudioCtx();
        this.masterGain = this.ctx.createGain();
        this.masterGain.gain.setValueAtTime(Math.min(1, masterVol), this.ctx.currentTime);
        this.masterGain.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      if (this.masterGain) {
        this.masterGain.gain.setTargetAtTime(Math.min(1, masterVol), this.ctx.currentTime, 0.05);
      }
      return this.ctx.state === 'running' ? this.ctx : null;
    } catch {
      return null;
    }
  }

  public tryUnlock(): void {
    if (this.stopped || !kageSound.isSplashAudioAllowed()) return;
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    } else if (!this.ctx) {
      this.ensureContext();
    }
  }

  private getNoiseBuffer(ctx: AudioContext): AudioBuffer {
    if (this.noiseBuffer && this.noiseBuffer.sampleRate === ctx.sampleRate) {
      return this.noiseBuffer;
    }
    const length = Math.floor(ctx.sampleRate * 1.4);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    this.noiseBuffer = buffer;
    return buffer;
  }

  /**
   * Scene 01 (0–2s) — Deep atmospheric tension slowly fading up from near silence.
   */
  public startDarkOpening(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain || this.ambientOscA) return;

    try {
      const now = ctx.currentTime;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(115, now);
      filter.frequency.linearRampToValueAtTime(210, now + 5.5);

      const droneGain = ctx.createGain();
      droneGain.gain.setValueAtTime(0.0001, now);
      // Gentle gradual build — never starts abruptly loud
      droneGain.gain.linearRampToValueAtTime(0.24, now + 1.9);

      const oscA = ctx.createOscillator();
      oscA.type = 'sawtooth';
      oscA.frequency.setValueAtTime(41.2, now); // Deep E1

      const oscB = ctx.createOscillator();
      oscB.type = 'triangle';
      oscB.frequency.setValueAtTime(61.74, now); // Fifth B1

      oscA.connect(filter);
      oscB.connect(filter);
      filter.connect(droneGain);
      droneGain.connect(this.masterGain);

      oscA.start(now);
      oscB.start(now);

      this.ambientOscA = oscA;
      this.ambientOscB = oscB;
      this.ambientGain = droneGain;
    } catch {
      // Non-blocking
    }
  }

  /**
   * Scene 02 (2–6s) — Rising battle momentum underneath Yami's entrance.
   */
  public triggerEntranceTension(videoHasUnmutedTrack = false): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const scale = videoHasUnmutedTrack ? 0.35 : 1;

      if (this.ambientGain) {
        this.ambientGain.gain.setTargetAtTime(0.28 * scale, now, 0.45);
      }

      const pulseOsc = ctx.createOscillator();
      const pulseGain = ctx.createGain();
      pulseOsc.type = 'sine';
      pulseOsc.frequency.setValueAtTime(55, now);
      pulseOsc.frequency.exponentialRampToValueAtTime(82.41, now + 3.4);

      pulseGain.gain.setValueAtTime(0.0001, now);
      pulseGain.gain.linearRampToValueAtTime(0.16 * scale, now + 1.2);
      pulseGain.gain.exponentialRampToValueAtTime(0.0001, now + 3.8);

      pulseOsc.connect(pulseGain);
      pulseGain.connect(this.masterGain);
      pulseOsc.start(now);
      pulseOsc.stop(now + 3.9);
    } catch {
      // Non-blocking
    }
  }

  /**
   * Scene 03A (6.0–7.7s) — Dark magic aura charge & compression before the katana strike.
   */
  public playKatanaCharge(videoHasUnmutedTrack = false): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const scale = videoHasUnmutedTrack ? 0.5 : 1;

      const chargeOsc = ctx.createOscillator();
      const filter = ctx.createBiquadFilter();
      const g = ctx.createGain();

      chargeOsc.type = 'sawtooth';
      chargeOsc.frequency.setValueAtTime(73.42, now);
      chargeOsc.frequency.exponentialRampToValueAtTime(246.94, now + 1.65);

      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(180, now);
      filter.frequency.exponentialRampToValueAtTime(980, now + 1.65);
      filter.Q.setValueAtTime(3.2, now);

      g.gain.setValueAtTime(0.0001, now);
      g.gain.linearRampToValueAtTime(0.22 * scale, now + 1.45);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 1.8);

      chargeOsc.connect(filter);
      filter.connect(g);
      g.connect(this.masterGain);
      chargeOsc.start(now);
      chargeOsc.stop(now + 1.85);
    } catch {
      // Non-blocking
    }
  }

  /**
   * Scene 03B (~7.84s) — Razor-sharp metallic katana slash + Dark Magic sub-bass impact.
   */
  public playKatanaSlash(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;

      // 1. Metallic katana blade ring
      const bladeA = ctx.createOscillator();
      const bladeB = ctx.createOscillator();
      const bladeGain = ctx.createGain();

      bladeA.type = 'sine';
      bladeA.frequency.setValueAtTime(2640, now);
      bladeA.frequency.exponentialRampToValueAtTime(1180, now + 0.34);

      bladeB.type = 'triangle';
      bladeB.frequency.setValueAtTime(3960, now);
      bladeB.frequency.exponentialRampToValueAtTime(1760, now + 0.28);

      bladeGain.gain.setValueAtTime(0.0001, now);
      bladeGain.gain.linearRampToValueAtTime(0.26, now + 0.012);
      bladeGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.42);

      bladeA.connect(bladeGain);
      bladeB.connect(bladeGain);
      bladeGain.connect(this.masterGain);
      bladeA.start(now);
      bladeB.start(now);
      bladeA.stop(now + 0.44);
      bladeB.stop(now + 0.44);

      // 2. High-velocity air slash whoosh (bandpass swept noise)
      const noise = ctx.createBufferSource();
      noise.buffer = this.getNoiseBuffer(ctx);
      const slashFilter = ctx.createBiquadFilter();
      slashFilter.type = 'bandpass';
      slashFilter.frequency.setValueAtTime(2400, now);
      slashFilter.frequency.exponentialRampToValueAtTime(360, now + 0.36);
      slashFilter.Q.setValueAtTime(1.8, now);

      const slashGain = ctx.createGain();
      slashGain.gain.setValueAtTime(0.0001, now);
      slashGain.gain.linearRampToValueAtTime(0.42, now + 0.018);
      slashGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

      noise.connect(slashFilter);
      slashFilter.connect(slashGain);
      slashGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.4);

      // 3. Heavy Dark Magic sub-bass impact drop
      const subImpact = ctx.createOscillator();
      const subGain = ctx.createGain();
      subImpact.type = 'sine';
      subImpact.frequency.setValueAtTime(108, now + 0.02);
      subImpact.frequency.exponentialRampToValueAtTime(29, now + 0.85);

      subGain.gain.setValueAtTime(0.0001, now + 0.02);
      subGain.gain.linearRampToValueAtTime(0.58, now + 0.045);
      subGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.92);

      subImpact.connect(subGain);
      subGain.connect(this.masterGain);
      subImpact.start(now + 0.02);
      subImpact.stop(now + 0.95);
    } catch {
      // Non-blocking
    }
  }

  /**
   * Scene 04 (9.0–10.0s) — Dimensional screen-cut rift dispersion & fade of battlefield drone.
   */
  public playScreenCutRift(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;

      if (this.ambientGain) {
        this.ambientGain.gain.setTargetAtTime(0.0001, now, 0.25);
      }

      const noise = ctx.createBufferSource();
      noise.buffer = this.getNoiseBuffer(ctx);
      const riftFilter = ctx.createBiquadFilter();
      riftFilter.type = 'highpass';
      riftFilter.frequency.setValueAtTime(900, now);
      riftFilter.frequency.exponentialRampToValueAtTime(220, now + 0.75);

      const riftGain = ctx.createGain();
      riftGain.gain.setValueAtTime(0.0001, now);
      riftGain.gain.linearRampToValueAtTime(0.22, now + 0.04);
      riftGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.82);

      noise.connect(riftFilter);
      riftFilter.connect(riftGain);
      riftGain.connect(this.masterGain);
      noise.start(now);
      noise.stop(now + 0.85);
    } catch {
      // Non-blocking
    }
  }

  /**
   * Scene 05 (10.0–13.0s) — KAGE logo reveal shimmer & dark regal chord.
   */
  public playLogoRevealShimmer(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;

      // Subtle crystalline light-sweep shimmer across KAGE letters
      const shimmerOsc = ctx.createOscillator();
      const shimmerGain = ctx.createGain();
      shimmerOsc.type = 'sine';
      shimmerOsc.frequency.setValueAtTime(659.25, now + 0.35);
      shimmerOsc.frequency.exponentialRampToValueAtTime(1318.51, now + 1.35);

      shimmerGain.gain.setValueAtTime(0.0001, now + 0.35);
      shimmerGain.gain.linearRampToValueAtTime(0.09, now + 0.72);
      shimmerGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.65);

      shimmerOsc.connect(shimmerGain);
      shimmerGain.connect(this.masterGain);
      shimmerOsc.start(now + 0.35);
      shimmerOsc.stop(now + 1.7);

      // Noble dark minor chord (A2, E3, A3, C4, E4)
      const chordHz = [110, 164.81, 220, 261.63, 329.63];
      chordHz.forEach((hz, idx) => {
        if (!this.masterGain) return;
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = idx === 0 ? 'triangle' : 'sine';
        osc.frequency.setValueAtTime(hz, now + 0.12);
        g.gain.setValueAtTime(0.0001, now + 0.12);
        g.gain.linearRampToValueAtTime(idx === 0 ? 0.22 : 0.11, now + 0.48);
        g.gain.exponentialRampToValueAtTime(0.0001, now + 2.75);
        osc.connect(g);
        g.connect(this.masterGain);
        osc.start(now + 0.12);
        osc.stop(now + 2.8);
      });
    } catch {
      // Non-blocking
    }
  }

  /**
   * Scene 06 (13.0–14.2s) — Deep cinematic finishing resonance resolving into REALMS.
   */
  public playFinalResolution(): void {
    const ctx = this.ensureContext();
    if (!ctx || !this.masterGain) return;

    try {
      const now = ctx.currentTime;
      const tailOsc = ctx.createOscillator();
      const tailGain = ctx.createGain();
      tailOsc.type = 'sine';
      tailOsc.frequency.setValueAtTime(55, now); // Deep A1 resolution

      tailGain.gain.setValueAtTime(0.0001, now);
      tailGain.gain.linearRampToValueAtTime(0.24, now + 0.12);
      tailGain.gain.exponentialRampToValueAtTime(0.0001, now + 1.05);

      tailOsc.connect(tailGain);
      tailGain.connect(this.masterGain);
      tailOsc.start(now);
      tailOsc.stop(now + 1.1);
    } catch {
      // Non-blocking
    }
  }

  /**
   * Quick reveal cue used only when reducedMotion accessibility is enabled.
   */
  public playBrandRevealImpact(): void {
    this.playLogoRevealShimmer();
  }

  public stop(): void {
    this.stopped = true;
    try {
      this.ambientOscA?.stop();
    } catch {
      // ignore
    }
    try {
      this.ambientOscB?.stop();
    } catch {
      // ignore
    }
    this.ambientOscA = null;
    this.ambientOscB = null;
    this.ambientGain = null;
    this.masterGain = null;

    if (!this.ctx) return;
    const current = this.ctx;
    this.ctx = null;
    try {
      current.close().catch(() => {});
    } catch {
      // ignore
    }
  }
}

export const introBrandAudio = new IntroCinematicSoundEngine();
