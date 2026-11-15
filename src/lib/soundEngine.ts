/**
 * KAGE — Centralized Original Sound & Audio Experience Engine
 *
 * Architecture:
 * - 100% original procedural + pre-rendered AudioBuffer synthesis (zero copyrighted samples, zero redundant network downloads)
 * - Essential short UI textures are pre-baked into lightweight in-memory AudioBuffers once upon user gesture
 * - Polyphony cap & per-cue cooldowns prevent chaotic overlapping sounds
 * - Automatic background-tab silence (document.visibilityState)
 * - Automatic WebRTC Voice/Video room ducking so voice communication remains crystal clear
 * - Master Mute strictly overrides all sound categories (UI, Splash, Notifications, Voice Room SFX, Background Music)
 */

export type KageSoundCategory = 'ui' | 'splash' | 'notification' | 'voice' | 'music';

export type KageSoundId =
  // 1. Splash Intro
  | 'splash_sequence_preview'
  // 2. UI Buttons
  | 'ui_click'
  | 'ui_menu_open'
  | 'ui_menu_close'
  | 'ui_search'
  | 'ui_add'
  | 'ui_bookmark'
  | 'ui_filter'
  | 'ui_surprise'
  | 'ui_back'
  | 'ui_follow'
  | 'ui_like'
  | 'ui_share'
  // 3. Navigation Destinations
  | 'nav_realms'
  | 'nav_pulse'
  | 'nav_guilds'
  | 'nav_clash'
  | 'nav_inbox'
  | 'nav_profile'
  // 4. PULSE Social
  | 'pulse_like'
  | 'pulse_repost'
  | 'pulse_comment'
  | 'msg_outgoing'
  | 'msg_incoming'
  | 'pulse_mention'
  | 'pulse_reaction_received'
  | 'pulse_upload_done'
  | 'pulse_publish_success'
  // 5. GUILDS Community
  | 'guild_join'
  | 'guild_new_post'
  | 'guild_challenge_announce'
  | 'guild_new_member'
  | 'guild_level_up'
  | 'guild_reward_unlocked'
  | 'guild_invite'
  // 6. CLASH Battles
  | 'clash_created'
  | 'clash_accepted'
  | 'clash_countdown'
  | 'clash_battle_start'
  | 'clash_vote'
  | 'clash_victory'
  | 'clash_result'
  | 'clash_reward_unlocked'
  // 7. Voice & Video Rooms
  | 'voice_join'
  | 'voice_leave'
  | 'voice_speaker_request'
  | 'voice_speaker_approved'
  | 'voice_host_announce'
  | 'voice_mic_on'
  | 'voice_mic_off'
  | 'voice_cam_on'
  | 'voice_cam_off'
  | 'voice_new_participant'
  // 8. Notifications
  | 'notif_message'
  | 'notif_follower'
  | 'notif_mention'
  | 'notif_guild_invite'
  | 'notif_clash_invite'
  | 'notif_challenge_result'
  | 'notif_account';

export interface KageAudioPreferences {
  masterEnabled: boolean;
  uiSoundsEnabled: boolean;
  splashSoundEnabled: boolean;
  notificationSoundsEnabled: boolean;
  voiceRoomSoundsEnabled: boolean;
  bgMusicEnabled: boolean;
  soundVolume: number; // 0..100
  bgMusicVolume: number; // 0..100
}

export const DEFAULT_AUDIO_PREFERENCES: KageAudioPreferences = {
  masterEnabled: true,
  uiSoundsEnabled: true,
  splashSoundEnabled: true,
  notificationSoundsEnabled: true,
  voiceRoomSoundsEnabled: true,
  bgMusicEnabled: false,
  soundVolume: 35,
  bgMusicVolume: 20,
};

export const AUDIO_PREFS_STORAGE_KEY = 'kage_audio_prefs_v1';

export function loadStoredAudioPreferences(): KageAudioPreferences {
  if (typeof window === 'undefined') return { ...DEFAULT_AUDIO_PREFERENCES };
  try {
    const raw = localStorage.getItem(AUDIO_PREFS_STORAGE_KEY);
    if (!raw) return { ...DEFAULT_AUDIO_PREFERENCES };
    const parsed = JSON.parse(raw);
    return {
      masterEnabled:
        typeof parsed.masterEnabled === 'boolean'
          ? parsed.masterEnabled
          : DEFAULT_AUDIO_PREFERENCES.masterEnabled,
      uiSoundsEnabled:
        typeof parsed.uiSoundsEnabled === 'boolean'
          ? parsed.uiSoundsEnabled
          : DEFAULT_AUDIO_PREFERENCES.uiSoundsEnabled,
      splashSoundEnabled:
        typeof parsed.splashSoundEnabled === 'boolean'
          ? parsed.splashSoundEnabled
          : DEFAULT_AUDIO_PREFERENCES.splashSoundEnabled,
      notificationSoundsEnabled:
        typeof parsed.notificationSoundsEnabled === 'boolean'
          ? parsed.notificationSoundsEnabled
          : DEFAULT_AUDIO_PREFERENCES.notificationSoundsEnabled,
      voiceRoomSoundsEnabled:
        typeof parsed.voiceRoomSoundsEnabled === 'boolean'
          ? parsed.voiceRoomSoundsEnabled
          : DEFAULT_AUDIO_PREFERENCES.voiceRoomSoundsEnabled,
      bgMusicEnabled:
        typeof parsed.bgMusicEnabled === 'boolean'
          ? parsed.bgMusicEnabled
          : DEFAULT_AUDIO_PREFERENCES.bgMusicEnabled,
      soundVolume:
        typeof parsed.soundVolume === 'number'
          ? Math.max(0, Math.min(100, Math.round(parsed.soundVolume)))
          : DEFAULT_AUDIO_PREFERENCES.soundVolume,
      bgMusicVolume:
        typeof parsed.bgMusicVolume === 'number'
          ? Math.max(0, Math.min(100, Math.round(parsed.bgMusicVolume)))
          : DEFAULT_AUDIO_PREFERENCES.bgMusicVolume,
    };
  } catch {
    return { ...DEFAULT_AUDIO_PREFERENCES };
  }
}

export function saveStoredAudioPreferences(prefs: KageAudioPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(AUDIO_PREFS_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    // ignore storage quota errors
  }
}

function getSoundCategory(id: KageSoundId): KageSoundCategory {
  if (id === 'splash_sequence_preview') return 'splash';
  if (id.startsWith('voice_')) return 'voice';
  if (
    id.startsWith('notif_') ||
    id === 'msg_incoming' ||
    id === 'pulse_mention' ||
    id === 'pulse_reaction_received' ||
    id === 'guild_new_member' ||
    id === 'guild_invite'
  ) {
    return 'notification';
  }
  return 'ui';
}

class KageSoundManager {
  private ctx: AudioContext | null = null;
  private sfxBus: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private preloadedShortBuffers = new Map<string, AudioBuffer>();
  private lastPlayedAt = new Map<KageSoundId, number>();
  private activeVoiceCount = 0;
  private unlockedByGesture = false;
  private inVoiceRoom = false;
  private prefs: KageAudioPreferences = loadStoredAudioPreferences();

  // Generative Dark-Fantasy Ambient Pad nodes
  private musicActive = false;
  private musicOscillators: OscillatorNode[] = [];
  private musicLfo: OscillatorNode | null = null;
  private musicFilter: BiquadFilterNode | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      const unlockHandler = () => {
        this.unlockedByGesture = true;
        if (this.prefs.masterEnabled) {
          this.ensureContext();
          this.syncBackgroundMusic();
        }
      };
      window.addEventListener('pointerdown', unlockHandler, { passive: true });
      window.addEventListener('keydown', unlockHandler, { passive: true });
      document.addEventListener('visibilitychange', () => {
        this.handleVisibilityChange();
      });
    }
  }

  public getPreferences(): KageAudioPreferences {
    return { ...this.prefs };
  }

  public isGestureUnlocked(): boolean {
    return this.unlockedByGesture;
  }

  public setInVoiceRoom(active: boolean): void {
    if (this.inVoiceRoom === active) return;
    this.inVoiceRoom = active;
    this.applyBusVolumes();
    this.syncBackgroundMusic();
  }

  public updatePreferences(next: KageAudioPreferences): void {
    this.prefs = { ...next };
    saveStoredAudioPreferences(this.prefs);
    this.applyBusVolumes();
    if (!this.prefs.masterEnabled || !this.prefs.bgMusicEnabled) {
      this.stopBackgroundMusic();
    } else if (this.unlockedByGesture) {
      this.ensureContext();
      this.syncBackgroundMusic();
    }
  }

  private handleVisibilityChange(): void {
    if (typeof document === 'undefined' || !this.ctx) return;
    if (document.visibilityState === 'hidden') {
      this.stopBackgroundMusic();
      if (this.ctx.state === 'running') {
        this.ctx.suspend().catch(() => {});
      }
    } else if (document.visibilityState === 'visible' && this.unlockedByGesture && this.prefs.masterEnabled) {
      if (this.ctx.state === 'suspended') {
        this.ctx.resume().catch(() => {});
      }
      this.syncBackgroundMusic();
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.unlockedByGesture) return null;

    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioCtx) return null;
      try {
        this.ctx = new AudioCtx();
        this.sfxBus = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus.connect(this.ctx.destination);
        this.musicBus.connect(this.ctx.destination);
        this.buildSharedBuffers(this.ctx);
        this.applyBusVolumes();
      } catch {
        this.ctx = null;
        return null;
      }
    }

    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }

    return this.ctx;
  }

  private applyBusVolumes(): void {
    if (!this.ctx || !this.sfxBus || !this.musicBus) return;
    const now = this.ctx.currentTime;
    const voiceDuck = this.inVoiceRoom ? 0.3 : 1.0;
    const sfxTarget = this.prefs.masterEnabled
      ? (this.prefs.soundVolume / 100) * 0.22 * voiceDuck
      : 0.0001;
    const musicTarget =
      this.prefs.masterEnabled && this.prefs.bgMusicEnabled && !this.inVoiceRoom
        ? (this.prefs.bgMusicVolume / 100) * 0.15
        : 0.0001;

    this.sfxBus.gain.setTargetAtTime(sfxTarget, now, 0.03);
    this.musicBus.gain.setTargetAtTime(musicTarget, now, 0.15);
  }

  private buildSharedBuffers(ctx: AudioContext): void {
    // 1. Warm filtered noise buffer (reused across all atmospheric & whoosh cues — zero re-allocation)
    const len = Math.floor(ctx.sampleRate * 1.4);
    const noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const ch = noise.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      last = (last + 0.05 * w) / 1.05;
      ch[i] = last * 1.6;
    }
    this.noiseBuffer = noise;

    // 2. Preload gentle organic haptic tap AudioBuffer (subtle, non-piercing, pleasant)
    const clickLen = Math.floor(ctx.sampleRate * 0.035);
    const clickBuf = ctx.createBuffer(1, clickLen, ctx.sampleRate);
    const clickData = clickBuf.getChannelData(0);
    for (let i = 0; i < clickLen; i++) {
      const t = i / ctx.sampleRate;
      const env = Math.exp(-t * 90);
      // Warm, deep, comfortable tactile click (no piercing highs)
      clickData[i] =
        (Math.sin(2 * Math.PI * 340 * t) * 0.5 +
          Math.sin(2 * Math.PI * 180 * t) * 0.35) *
        env *
        0.28;
    }
    this.preloadedShortBuffers.set('ui_click', clickBuf);
  }

  private canPlayCategory(category: KageSoundCategory): boolean {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      return false;
    }
    if (!this.prefs.masterEnabled) return false;
    if (this.prefs.soundVolume <= 0 && category !== 'music') return false;

    switch (category) {
      case 'ui':
        return this.prefs.uiSoundsEnabled;
      case 'splash':
        return this.prefs.splashSoundEnabled;
      case 'notification':
        return this.prefs.notificationSoundsEnabled;
      case 'voice':
        return this.prefs.voiceRoomSoundsEnabled;
      case 'music':
        return this.prefs.bgMusicEnabled && this.prefs.bgMusicVolume > 0;
      default:
        return false;
    }
  }

  public isSplashAudioAllowed(): boolean {
    return (
      this.prefs.masterEnabled &&
      this.prefs.splashSoundEnabled &&
      this.prefs.soundVolume > 0 &&
      (typeof document === 'undefined' || document.visibilityState === 'visible')
    );
  }

  public getSplashMasterVolume(): number {
    if (!this.isSplashAudioAllowed()) return 0;
    return Math.max(0.02, Math.min(0.55, (this.prefs.soundVolume / 100) * 0.42));
  }

  /**
   * Plays a specific KAGE sound cue with cooldown & polyphony protection.
   * Pass `forcePreview = true` from Settings Preview buttons to unlock & audition immediately.
   */
  public play(id: KageSoundId, options?: { forcePreview?: boolean }): void {
    if (options?.forcePreview) {
      this.unlockedByGesture = true;
    }

    const category = getSoundCategory(id);
    if (!options?.forcePreview && !this.canPlayCategory(category)) {
      return;
    }
    if (options?.forcePreview && !this.prefs.masterEnabled) {
      return;
    }

    const nowMs = performance.now();
    const minGapMs = id === 'ui_click' ? 45 : 95;
    const prevMs = this.lastPlayedAt.get(id) || 0;
    if (nowMs - prevMs < minGapMs) return;

    // Polyphony guard: never let more than 6 simultaneous SFX overlap
    if (this.activeVoiceCount >= 6 && id === 'ui_click') return;
    if (this.activeVoiceCount >= 8) return;

    const ctx = this.ensureContext();
    if (!ctx || !this.sfxBus) return;

    this.lastPlayedAt.set(id, nowMs);
    this.dispatchSynthesis(ctx, this.sfxBus, id);
  }

  private trackVoice(durationSec: number): void {
    this.activeVoiceCount += 1;
    setTimeout(() => {
      this.activeVoiceCount = Math.max(0, this.activeVoiceCount - 1);
    }, Math.ceil(durationSec * 1000) + 40);
  }

  private playTone(
    ctx: AudioContext,
    dest: AudioNode,
    params: {
      type?: OscillatorType;
      freqStart: number;
      freqEnd?: number;
      delay?: number;
      duration: number;
      gain: number;
      filterHz?: number;
    }
  ): void {
    const start = ctx.currentTime + (params.delay || 0);
    const dur = Math.max(0.015, params.duration);
    this.trackVoice(dur + (params.delay || 0));

    const osc = ctx.createOscillator();
    osc.type = params.type || 'sine';
    osc.frequency.setValueAtTime(Math.max(20, params.freqStart), start);
    if (params.freqEnd && params.freqEnd !== params.freqStart) {
      osc.frequency.exponentialRampToValueAtTime(Math.max(20, params.freqEnd), start + dur);
    }

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(params.gain, start + Math.min(0.014, dur * 0.25));
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    if (params.filterHz) {
      const flt = ctx.createBiquadFilter();
      flt.type = 'lowpass';
      flt.frequency.setValueAtTime(params.filterHz, start);
      osc.connect(flt);
      flt.connect(env);
    } else {
      osc.connect(env);
    }

    env.connect(dest);
    osc.start(start);
    osc.stop(start + dur + 0.02);
  }

  private playAirSweep(
    ctx: AudioContext,
    dest: AudioNode,
    params: {
      startHz: number;
      endHz: number;
      duration: number;
      gain: number;
      delay?: number;
      q?: number;
    }
  ): void {
    if (!this.noiseBuffer) return;
    const start = ctx.currentTime + (params.delay || 0);
    const dur = Math.max(0.03, params.duration);
    this.trackVoice(dur + (params.delay || 0));

    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = params.q ?? 2.2;
    filter.frequency.setValueAtTime(params.startHz, start);
    filter.frequency.exponentialRampToValueAtTime(params.endHz, start + dur);

    const env = ctx.createGain();
    env.gain.setValueAtTime(0.0001, start);
    env.gain.linearRampToValueAtTime(params.gain, start + dur * 0.3);
    env.gain.exponentialRampToValueAtTime(0.0001, start + dur);

    src.connect(filter);
    filter.connect(env);
    env.connect(dest);

    src.start(start);
    src.stop(start + dur + 0.02);
  }

  private playChordNotes(
    ctx: AudioContext,
    dest: AudioNode,
    notes: number[],
    stepSec: number,
    noteDur: number,
    gain: number,
    type: OscillatorType = 'triangle',
    filterHz = 1800
  ): void {
    notes.forEach((hz, idx) => {
      this.playTone(ctx, dest, {
        type,
        freqStart: hz,
        delay: idx * stepSec,
        duration: noteDur,
        gain,
        filterHz,
      });
    });
  }

  private dispatchSynthesis(ctx: AudioContext, bus: GainNode, id: KageSoundId): void {
    switch (id) {
      // --- 2. BUTTON CLICKS & CORE UI ---
      case 'ui_click': {
        const pre = this.preloadedShortBuffers.get('ui_click');
        if (pre) {
          this.trackVoice(0.045);
          const src = ctx.createBufferSource();
          src.buffer = pre;
          const g = ctx.createGain();
          g.gain.value = 0.55;
          src.connect(g);
          g.connect(bus);
          src.start();
        } else {
          this.playTone(ctx, bus, { freqStart: 620, freqEnd: 420, duration: 0.04, gain: 0.25 });
        }
        break;
      }

      case 'ui_menu_open':
        this.playAirSweep(ctx, bus, { startHz: 260, endHz: 920, duration: 0.16, gain: 0.28, q: 1.8 });
        this.playTone(ctx, bus, { type: 'sine', freqStart: 330, freqEnd: 523.25, duration: 0.15, gain: 0.22 });
        break;

      case 'ui_menu_close':
        this.playAirSweep(ctx, bus, { startHz: 780, endHz: 220, duration: 0.12, gain: 0.22, q: 1.8 });
        this.playTone(ctx, bus, { type: 'sine', freqStart: 460, freqEnd: 290, duration: 0.11, gain: 0.2 });
        break;

      case 'ui_search':
        this.playTone(ctx, bus, { type: 'sine', freqStart: 587.33, freqEnd: 880, duration: 0.11, gain: 0.22 });
        break;

      case 'ui_add':
        this.playChordNotes(ctx, bus, [440, 659.25], 0.045, 0.12, 0.24, 'sine');
        break;

      case 'ui_bookmark':
        // Subtle magical activation shimmer
        this.playChordNotes(ctx, bus, [523.25, 659.25, 987.77], 0.04, 0.16, 0.22, 'triangle', 2400);
        break;

      case 'ui_filter':
        this.playTone(ctx, bus, { type: 'triangle', freqStart: 480, freqEnd: 720, duration: 0.08, gain: 0.22, filterHz: 1600 });
        break;

      case 'ui_surprise':
        // Anime-style crystalline randomization arpeggio
        this.playChordNotes(ctx, bus, [392, 523.25, 659.25, 783.99, 1046.5], 0.038, 0.16, 0.24, 'triangle', 2800);
        this.playAirSweep(ctx, bus, { startHz: 400, endHz: 1800, duration: 0.24, gain: 0.2, q: 2.5 });
        break;

      case 'ui_back':
        this.playTone(ctx, bus, { type: 'sine', freqStart: 420, freqEnd: 310, duration: 0.09, gain: 0.2 });
        break;

      case 'ui_follow':
        this.playChordNotes(ctx, bus, [440, 554.37, 659.25], 0.045, 0.15, 0.24, 'sine');
        break;

      case 'ui_like':
      case 'pulse_like':
        // Short energetic pulse
        this.playTone(ctx, bus, { type: 'sine', freqStart: 220, freqEnd: 520, duration: 0.09, gain: 0.3 });
        this.playTone(ctx, bus, { type: 'triangle', freqStart: 659.25, freqEnd: 880, delay: 0.03, duration: 0.11, gain: 0.2, filterHz: 2200 });
        break;

      case 'ui_share':
        // Clean digital send sound
        this.playAirSweep(ctx, bus, { startHz: 450, endHz: 1500, duration: 0.13, gain: 0.22, q: 2.6 });
        this.playTone(ctx, bus, { type: 'sine', freqStart: 587.33, freqEnd: 880, duration: 0.12, gain: 0.22 });
        break;

      // --- 3. NAVIGATION DESTINATIONS (Very subtle, distinct dark-anime signatures) ---
      case 'nav_realms':
        this.playTone(ctx, bus, { type: 'sine', freqStart: 293.66, freqEnd: 440, duration: 0.11, gain: 0.18 });
        break;
      case 'nav_pulse':
        this.playTone(ctx, bus, { type: 'sine', freqStart: 329.63, freqEnd: 493.88, duration: 0.1, gain: 0.18 });
        break;
      case 'nav_guilds':
        this.playTone(ctx, bus, { type: 'triangle', freqStart: 261.63, freqEnd: 392, duration: 0.12, gain: 0.18, filterHz: 1200 });
        break;
      case 'nav_clash':
        this.playTone(ctx, bus, { type: 'triangle', freqStart: 220, freqEnd: 329.63, duration: 0.12, gain: 0.2, filterHz: 1400 });
        this.playAirSweep(ctx, bus, { startHz: 520, endHz: 1100, duration: 0.09, gain: 0.15, q: 3 });
        break;
      case 'nav_inbox':
        this.playTone(ctx, bus, { type: 'sine', freqStart: 392, freqEnd: 523.25, duration: 0.1, gain: 0.17 });
        break;
      case 'nav_profile':
        this.playTone(ctx, bus, { type: 'sine', freqStart: 349.23, freqEnd: 466.16, duration: 0.1, gain: 0.17 });
        break;

      // --- 4. PULSE SOCIAL ---
      case 'pulse_repost':
        this.playChordNotes(ctx, bus, [392, 587.33], 0.055, 0.13, 0.24, 'triangle', 1900);
        break;

      case 'pulse_comment':
        this.playChordNotes(ctx, bus, [493.88, 659.25], 0.04, 0.11, 0.22, 'sine');
        break;

      case 'msg_outgoing':
        // Crisp upward send tone
        this.playTone(ctx, bus, { type: 'sine', freqStart: 440, freqEnd: 740, duration: 0.11, gain: 0.24 });
        break;

      case 'msg_incoming':
      case 'notif_message':
        // Warm two-note incoming chime (distinct from outgoing)
        this.playChordNotes(ctx, bus, [587.33, 440], 0.075, 0.16, 0.25, 'sine');
        break;

      case 'pulse_mention':
      case 'notif_mention':
        this.playChordNotes(ctx, bus, [659.25, 880, 987.77], 0.055, 0.16, 0.25, 'sine');
        break;

      case 'pulse_reaction_received':
        this.playChordNotes(ctx, bus, [523.25, 783.99], 0.05, 0.14, 0.2, 'sine');
        break;

      case 'pulse_upload_done':
        this.playChordNotes(ctx, bus, [440, 554.37, 880], 0.05, 0.16, 0.24, 'triangle', 2200);
        break;

      case 'pulse_publish_success':
        this.playAirSweep(ctx, bus, { startHz: 320, endHz: 1200, duration: 0.22, gain: 0.22, q: 2 });
        this.playChordNotes(ctx, bus, [329.63, 493.88, 659.25, 987.77], 0.055, 0.24, 0.26, 'triangle', 2400);
        break;

      // --- 5. GUILDS COMMUNITY ---
      case 'guild_join':
        this.playTone(ctx, bus, { type: 'triangle', freqStart: 110, freqEnd: 82.41, duration: 0.28, gain: 0.3, filterHz: 600 });
        this.playChordNotes(ctx, bus, [293.66, 440, 587.33, 880], 0.065, 0.28, 0.26, 'triangle', 2200);
        break;

      case 'guild_new_post':
        this.playChordNotes(ctx, bus, [392, 523.25], 0.055, 0.15, 0.22, 'sine');
        break;

      case 'guild_challenge_announce':
        this.playTone(ctx, bus, { type: 'sawtooth', freqStart: 146.83, freqEnd: 110, duration: 0.34, gain: 0.24, filterHz: 650 });
        this.playChordNotes(ctx, bus, [293.66, 440, 587.33], 0.07, 0.26, 0.26, 'triangle', 1800);
        break;

      case 'guild_new_member':
        this.playChordNotes(ctx, bus, [440, 659.25], 0.06, 0.16, 0.22, 'sine');
        break;

      case 'guild_level_up':
        // Exciting, cinematic dark-fantasy ascension fanfare
        this.playAirSweep(ctx, bus, { startHz: 240, endHz: 1900, duration: 0.42, gain: 0.28, q: 1.9 });
        this.playChordNotes(ctx, bus, [261.63, 329.63, 392, 523.25, 659.25, 1046.5], 0.06, 0.38, 0.28, 'triangle', 3200);
        break;

      case 'guild_reward_unlocked':
      case 'clash_reward_unlocked':
        this.playAirSweep(ctx, bus, { startHz: 500, endHz: 2400, duration: 0.35, gain: 0.25, q: 2.4 });
        this.playChordNotes(ctx, bus, [587.33, 739.99, 880, 1174.66], 0.065, 0.34, 0.28, 'triangle', 3000);
        break;

      case 'guild_invite':
      case 'notif_guild_invite':
        this.playChordNotes(ctx, bus, [392, 493.88, 783.99], 0.065, 0.22, 0.25, 'sine');
        break;

      // --- 6. CLASH BATTLES ---
      case 'clash_created':
        this.playAirSweep(ctx, bus, { startHz: 300, endHz: 1600, duration: 0.28, gain: 0.32, q: 2.2 });
        this.playTone(ctx, bus, { type: 'triangle', freqStart: 130.81, freqEnd: 65.41, duration: 0.35, gain: 0.36, filterHz: 700 });
        this.playChordNotes(ctx, bus, [261.63, 392, 523.25], 0.055, 0.25, 0.28, 'sawtooth', 1600);
        break;

      case 'clash_accepted':
        this.playTone(ctx, bus, { type: 'triangle', freqStart: 98, freqEnd: 55, duration: 0.32, gain: 0.36, filterHz: 600 });
        this.playChordNotes(ctx, bus, [329.63, 440, 659.25], 0.05, 0.26, 0.3, 'triangle', 2200);
        break;

      case 'clash_countdown':
        this.playTone(ctx, bus, { type: 'sine', freqStart: 523.25, freqEnd: 493.88, duration: 0.09, gain: 0.24 });
        break;

      case 'clash_battle_start':
        this.playTone(ctx, bus, { type: 'triangle', freqStart: 110, freqEnd: 38, duration: 0.55, gain: 0.45, filterHz: 500 });
        this.playAirSweep(ctx, bus, { startHz: 220, endHz: 1400, duration: 0.4, gain: 0.34, q: 1.6 });
        this.playChordNotes(ctx, bus, [220, 329.63, 440, 659.25], 0.04, 0.36, 0.28, 'sawtooth', 1800);
        break;

      case 'clash_vote':
        // Decisive battle lock-in strike
        this.playTone(ctx, bus, { type: 'triangle', freqStart: 180, freqEnd: 72, duration: 0.16, gain: 0.34, filterHz: 900 });
        this.playTone(ctx, bus, { type: 'sine', freqStart: 587.33, freqEnd: 880, delay: 0.02, duration: 0.14, gain: 0.25 });
        break;

      case 'clash_victory':
        this.playTone(ctx, bus, { type: 'triangle', freqStart: 110, freqEnd: 55, duration: 0.5, gain: 0.38, filterHz: 600 });
        this.playChordNotes(ctx, bus, [293.66, 369.99, 440, 587.33, 880], 0.07, 0.42, 0.3, 'triangle', 2800);
        break;

      case 'clash_result':
      case 'notif_challenge_result':
        this.playChordNotes(ctx, bus, [293.66, 349.23, 440], 0.08, 0.28, 0.25, 'triangle', 1600);
        break;

      // --- 7. VOICE & VIDEO ROOMS (Soft, non-intrusive over WebRTC speech) ---
      case 'voice_join':
        this.playChordNotes(ctx, bus, [392, 587.33], 0.06, 0.16, 0.2, 'sine');
        break;
      case 'voice_leave':
        this.playChordNotes(ctx, bus, [523.25, 349.23], 0.06, 0.15, 0.18, 'sine');
        break;
      case 'voice_speaker_request':
        this.playChordNotes(ctx, bus, [523.25, 659.25], 0.055, 0.14, 0.2, 'sine');
        break;
      case 'voice_speaker_approved':
        this.playChordNotes(ctx, bus, [440, 554.37, 880], 0.05, 0.18, 0.22, 'sine');
        break;
      case 'voice_host_announce':
        this.playChordNotes(ctx, bus, [329.63, 493.88, 659.25], 0.06, 0.2, 0.22, 'triangle', 1800);
        break;
      case 'voice_mic_on':
        this.playTone(ctx, bus, { type: 'sine', freqStart: 480, freqEnd: 680, duration: 0.07, gain: 0.18 });
        break;
      case 'voice_mic_off':
        this.playTone(ctx, bus, { type: 'sine', freqStart: 620, freqEnd: 380, duration: 0.07, gain: 0.18 });
        break;
      case 'voice_cam_on':
        this.playTone(ctx, bus, { type: 'triangle', freqStart: 520, freqEnd: 780, duration: 0.08, gain: 0.18, filterHz: 1800 });
        break;
      case 'voice_cam_off':
        this.playTone(ctx, bus, { type: 'triangle', freqStart: 700, freqEnd: 410, duration: 0.08, gain: 0.18, filterHz: 1800 });
        break;
      case 'voice_new_participant':
        this.playTone(ctx, bus, { type: 'sine', freqStart: 587.33, freqEnd: 659.25, duration: 0.08, gain: 0.14 });
        break;

      // --- 8. REMAINING NOTIFICATIONS & SPLASH PREVIEW ---
      case 'notif_follower':
        this.playChordNotes(ctx, bus, [493.88, 659.25, 783.99], 0.055, 0.18, 0.24, 'sine');
        break;

      case 'notif_clash_invite':
        this.playChordNotes(ctx, bus, [220, 329.63, 440], 0.06, 0.22, 0.28, 'triangle', 1700);
        break;

      case 'notif_account':
        this.playChordNotes(ctx, bus, [329.63, 440, 659.25, 880], 0.065, 0.26, 0.28, 'sine');
        break;

      case 'splash_sequence_preview':
        // Compact 2.8s preview of the KAGE Dark Magic ambience + slash + logo resonance
        this.playAirSweep(ctx, bus, { startHz: 140, endHz: 620, duration: 1.1, gain: 0.28, q: 1.4 });
        this.playTone(ctx, bus, { type: 'sawtooth', freqStart: 55, freqEnd: 110, duration: 0.9, gain: 0.24, filterHz: 380 });
        this.playAirSweep(ctx, bus, { startHz: 380, endHz: 1900, delay: 0.85, duration: 0.45, gain: 0.36, q: 1.8 });
        this.playTone(ctx, bus, { type: 'triangle', freqStart: 98, freqEnd: 32, delay: 0.88, duration: 1.1, gain: 0.42, filterHz: 520 });
        this.playChordNotes(ctx, bus, [110, 164.81, 220, 261.63, 329.63], 0.04, 1.7, 0.18, 'sine');
        break;
    }
  }

  private syncBackgroundMusic(): void {
    if (!this.canPlayCategory('music') || this.inVoiceRoom) {
      this.stopBackgroundMusic();
      return;
    }
    if (this.musicActive) {
      this.applyBusVolumes();
      return;
    }

    const ctx = this.ensureContext();
    if (!ctx || !this.musicBus) return;

    try {
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 340;
      filter.Q.value = 1.2;

      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      lfo.type = 'sine';
      lfo.frequency.value = 0.09; // 11-second slow atmospheric breathing cycle
      lfoGain.gain.value = 140;
      lfo.connect(lfoGain);
      lfoGain.connect(filter.frequency);

      // Mysterious A-minor / Phrygian dark-anime ambient pad
      const droneFreqs = [55, 82.41, 110, 130.81, 164.81];
      const oscs: OscillatorNode[] = [];

      droneFreqs.forEach((hz, idx) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = idx < 2 ? 'sine' : 'triangle';
        osc.frequency.value = hz;
        osc.detune.value = (idx - 2) * 4.5;
        g.gain.value = idx === 0 ? 0.32 : 0.14;
        osc.connect(g);
        g.connect(filter);
        osc.start();
        oscs.push(osc);
      });

      filter.connect(this.musicBus);
      lfo.start();

      this.musicFilter = filter;
      this.musicLfo = lfo;
      this.musicOscillators = oscs;
      this.musicActive = true;
      this.applyBusVolumes();
    } catch {
      this.stopBackgroundMusic();
    }
  }

  private stopBackgroundMusic(): void {
    if (!this.musicActive) return;
    this.musicActive = false;
    for (const osc of this.musicOscillators) {
      try {
        osc.stop();
        osc.disconnect();
      } catch {
        // ignore
      }
    }
    this.musicOscillators = [];
    try {
      this.musicLfo?.stop();
      this.musicLfo?.disconnect();
    } catch {
      // ignore
    }
    this.musicLfo = null;
    try {
      this.musicFilter?.disconnect();
    } catch {
      // ignore
    }
    this.musicFilter = null;
  }
}

export const kageSound = new KageSoundManager();
