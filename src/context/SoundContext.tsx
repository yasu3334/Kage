import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from './AuthContext';
import { apiFetch } from '../lib/api';
import {
  DEFAULT_AUDIO_PREFERENCES,
  kageSound,
  KageAudioPreferences,
  KageSoundId,
  loadStoredAudioPreferences,
} from '../lib/soundEngine';

interface SoundContextValue {
  audioPrefs: KageAudioPreferences;
  updateAudioPrefs: (patch: Partial<KageAudioPreferences>) => void;
  playSound: (id: KageSoundId, options?: { forcePreview?: boolean }) => void;
}

const SoundContext = createContext<SoundContextValue>({
  audioPrefs: DEFAULT_AUDIO_PREFERENCES,
  updateAudioPrefs: () => {},
  playSound: (id, opts) => kageSound.play(id, opts),
});

function inferNavigationSound(pathname: string): KageSoundId | null {
  if (pathname === '/' || pathname.startsWith('/realms') || pathname.startsWith('/category')) {
    return 'nav_realms';
  }
  if (pathname.startsWith('/pulse')) return 'nav_pulse';
  if (pathname.startsWith('/guilds')) return 'nav_guilds';
  if (pathname.startsWith('/clash')) return 'nav_clash';
  if (pathname.startsWith('/inbox')) return 'nav_inbox';
  if (pathname.startsWith('/profile')) return 'nav_profile';
  return null;
}

function classifyInteractiveButtonSound(btn: HTMLElement): KageSoundId | null {
  const explicit = btn.dataset.kageSound as KageSoundId | undefined;
  if (explicit) return explicit;
  if (btn.dataset.kageSilent === 'true') return null;

  const label = `${btn.getAttribute('aria-label') || ''} ${btn.getAttribute('title') || ''} ${
    btn.textContent || ''
  }`
    .trim()
    .toLowerCase();

  if (label.includes('open navigation menu')) return 'ui_menu_open';
  if (label.includes('close') || label === 'cancel' || label === 'dismiss announcement') {
    return 'ui_menu_close';
  }
  if (label.includes('search')) return 'ui_search';
  if (label.includes('surprise me')) return 'ui_surprise';
  if (label.includes('filter')) return 'ui_filter';
  if (label.includes('watchlist') || label.includes('bookmark')) return 'ui_bookmark';
  if (label.includes('share') || label.includes('copy link')) return 'ui_share';
  if (label.startsWith('back') || label.includes('go back')) return 'ui_back';
  if (label === 'follow' || label.includes('follow @')) return 'ui_follow';
  if (label.includes('repost')) return 'pulse_repost';
  if (label.includes('create ') || label.includes('forge ') || label.includes('launch ') || label === '+') {
    return 'ui_add';
  }
  return 'ui_click';
}

export const SoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, settings, subscribeWs } = useAuth();
  const location = useLocation();
  const [audioPrefs, setAudioPrefs] = useState<KageAudioPreferences>(() =>
    loadStoredAudioPreferences()
  );
  const prevPathRef = useRef<string>(location.pathname);
  const syncedUidRef = useRef<string | null>(null);

  // Hydrate server-saved audio preferences if present on user.settings
  useEffect(() => {
    if (!user?.uid || !settings || syncedUidRef.current === user.uid) return;
    syncedUidRef.current = user.uid;
    const srv = settings as unknown as Record<string, unknown>;
    if (typeof srv.soundMasterEnabled === 'boolean') {
      const merged: KageAudioPreferences = {
        masterEnabled: Boolean(srv.soundMasterEnabled),
        uiSoundsEnabled:
          typeof srv.soundUiEnabled === 'boolean' ? srv.soundUiEnabled : audioPrefs.uiSoundsEnabled,
        splashSoundEnabled:
          typeof srv.soundSplashEnabled === 'boolean'
            ? srv.soundSplashEnabled
            : audioPrefs.splashSoundEnabled,
        notificationSoundsEnabled:
          typeof srv.soundNotificationsEnabled === 'boolean'
            ? srv.soundNotificationsEnabled
            : audioPrefs.notificationSoundsEnabled,
        voiceRoomSoundsEnabled:
          typeof srv.soundVoiceEnabled === 'boolean'
            ? srv.soundVoiceEnabled
            : audioPrefs.voiceRoomSoundsEnabled,
        bgMusicEnabled:
          typeof srv.soundBgMusicEnabled === 'boolean'
            ? srv.soundBgMusicEnabled
            : audioPrefs.bgMusicEnabled,
        soundVolume:
          typeof srv.soundVolume === 'number'
            ? Math.max(0, Math.min(100, Math.round(srv.soundVolume)))
            : audioPrefs.soundVolume,
        bgMusicVolume:
          typeof srv.soundBgMusicVolume === 'number'
            ? Math.max(0, Math.min(100, Math.round(srv.soundBgMusicVolume)))
            : audioPrefs.bgMusicVolume,
      };
      setAudioPrefs(merged);
      kageSound.updatePreferences(merged);
    }
  }, [user?.uid, settings, audioPrefs]);

  // Keep engine synced & auto-duck inside active Voice/Video rooms (/voice/:id)
  useEffect(() => {
    const inActiveVoiceRoom = /^\/voice\/\d+/.test(location.pathname);
    kageSound.setInVoiceRoom(inActiveVoiceRoom);
  }, [location.pathname]);

  // Play distinct subtle navigation sound when switching top-level sections
  useEffect(() => {
    const prev = prevPathRef.current;
    const curr = location.pathname;
    prevPathRef.current = curr;
    if (prev === curr) return;

    // Entering or leaving an active voice room uses dedicated room join/leave cues
    const wasVoice = /^\/voice\/\d+/.test(prev);
    const isVoice = /^\/voice\/\d+/.test(curr);
    if (!wasVoice && isVoice) {
      kageSound.play('voice_join');
      return;
    }
    if (wasVoice && !isVoice) {
      kageSound.play('voice_leave');
    }
  }, [location.pathname]);

  // Real-time WebSocket notification & live room audio cues
  useEffect(() => {
    const unsub = subscribeWs((msg: any) => {
      if (!msg || typeof msg.type !== 'string') return;

      if (msg.type === 'inbox:message') {
        if (msg.message?.senderUid && msg.message.senderUid !== user?.uid) {
          kageSound.play('msg_incoming');
        }
        return;
      }

      if (msg.type === 'notification:new') {
        const kind = String(msg.notificationType || msg.kind || '').toLowerCase();
        if (msg.announcement?.title) {
          kageSound.play('notif_account');
        } else if (kind.includes('follow')) {
          kageSound.play('notif_follower');
        } else if (kind.includes('mention')) {
          kageSound.play('notif_mention');
        } else if (kind.includes('guild') || kind.includes('invite')) {
          kageSound.play('notif_guild_invite');
        } else if (kind.includes('clash_result') || kind.includes('winner')) {
          kageSound.play('notif_challenge_result');
        } else if (kind.includes('clash')) {
          kageSound.play('notif_clash_invite');
        } else if (kind.includes('reaction') || kind.includes('like')) {
          kageSound.play('pulse_reaction_received');
        } else {
          kageSound.play('notif_account');
        }
        return;
      }

      if (msg.type === 'voice:participant_joined' && msg.uid !== user?.uid) {
        kageSound.play('voice_new_participant');
      } else if (msg.type === 'voice:speak_request') {
        kageSound.play('voice_speaker_request');
      } else if (msg.type === 'voice:role_updated' && msg.targetUid === user?.uid) {
        if (msg.role === 'speaker' || msg.role === 'co_host') {
          kageSound.play('voice_speaker_approved');
        }
      } else if (msg.type === 'chat:message' && msg.message?.senderUid !== user?.uid) {
        kageSound.play('guild_new_post');
      }
    });

    return unsub;
  }, [subscribeWs, user?.uid]);

  const updateAudioPrefs = useCallback(
    (patch: Partial<KageAudioPreferences>) => {
      setAudioPrefs((prev) => {
        const next: KageAudioPreferences = { ...prev, ...patch };
        kageSound.updatePreferences(next);
        if (user?.uid) {
          apiFetch('/api/me/settings', {
            method: 'PUT',
            body: JSON.stringify({
              soundMasterEnabled: next.masterEnabled,
              soundUiEnabled: next.uiSoundsEnabled,
              soundSplashEnabled: next.splashSoundEnabled,
              soundNotificationsEnabled: next.notificationSoundsEnabled,
              soundVoiceEnabled: next.voiceRoomSoundsEnabled,
              soundBgMusicEnabled: next.bgMusicEnabled,
              soundVolume: next.soundVolume,
              soundBgMusicVolume: next.bgMusicVolume,
            }),
          }).catch(() => {});
        }
        return next;
      });
    },
    [user?.uid]
  );

  const playSound = useCallback((id: KageSoundId, options?: { forcePreview?: boolean }) => {
    kageSound.play(id, options);
  }, []);

  return (
    <SoundContext.Provider value={{ audioPrefs, updateAudioPrefs, playSound }}>
      {children}
    </SoundContext.Provider>
  );
};

export function useSound() {
  return useContext(SoundContext);
}
