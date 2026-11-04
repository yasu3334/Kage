import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithPopup,
  signOut,
  type User as FirebaseUser,
} from 'firebase/auth';
import {
  auth,
  googleAuthProvider,
  isFirebaseTokenServiceDisabledError,
  OAUTH_CLIENT_ID,
  purgeStaleFirebaseBrowserPersistence,
} from '../lib/firebase';
import {
  apiFetch,
  getActiveToken,
  getServerSessionToken,
  setAuthTokenAccessor,
  setCachedMemoryToken,
  setServerSessionToken,
} from '../lib/api';

let gisScriptPromise: Promise<void> | null = null;

function ensureGoogleIdentityScript(): Promise<void> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Google Sign-In requires a browser environment.'));
  }
  if ((window as any).google?.accounts?.oauth2) {
    return Promise.resolve();
  }
  if (gisScriptPromise) return gisScriptPromise;

  gisScriptPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[src="https://accounts.google.com/gsi/client"]'
    );
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener(
        'error',
        () => {
          gisScriptPromise = null;
          reject(new Error('Could not load Google Identity Services.'));
        },
        { once: true }
      );
      return;
    }

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      gisScriptPromise = null;
      reject(new Error('Could not load Google Identity Services.'));
    };
    document.head.appendChild(script);
  });

  return gisScriptPromise;
}

async function requestGoogleAccessTokenViaGIS(clientId: string): Promise<string> {
  if (!clientId) {
    throw new Error('Google OAuth Client ID is not configured for this project.');
  }
  await ensureGoogleIdentityScript();
  const oauth2 = (window as any).google?.accounts?.oauth2;
  if (!oauth2?.initTokenClient) {
    throw new Error('Google OAuth client failed to initialize.');
  }

  return await new Promise<string>((resolve, reject) => {
    let settled = false;
    const tokenClient = oauth2.initTokenClient({
      client_id: clientId,
      scope: 'openid email profile',
      prompt: 'select_account',
      callback: (response: any) => {
        if (settled) return;
        settled = true;
        if (response?.error) {
          reject(
            new Error(
              response.error_description ||
                (response.error === 'access_denied'
                  ? 'Google sign-in was cancelled.'
                  : `Google sign-in error: ${response.error}`)
            )
          );
          return;
        }
        if (!response?.access_token) {
          reject(new Error('Google did not return an access token.'));
          return;
        }
        resolve(String(response.access_token));
      },
      error_callback: (err: any) => {
        if (settled) return;
        settled = true;
        if (err?.type === 'popup_closed') {
          reject({ code: 'auth/popup-closed-by-user' });
          return;
        }
        if (err?.type === 'popup_failed_to_open') {
          reject(new Error('Popup was blocked by the browser. Please allow popups and retry.'));
          return;
        }
        reject(new Error(err?.message || 'Google sign-in popup was closed.'));
      },
    });

    tokenClient.requestAccessToken({ prompt: 'select_account' });
  });
}

export interface KageUser {
  uid: string;
  kageId?: string | null;
  email: string;
  username: string;
  role: string;
  emailVerified: boolean;
  createdAt: string;
}

export interface KageProfile {
  userUid: string;
  displayName: string;
  bio: string;
  avatarUrl: string;
  bannerUrl: string;
  favoriteGenres: string[];
  isPrivate: boolean;
  showActivity: boolean;
  showWatchlist: boolean;
}

export interface KageSettings {
  emailNotifications: boolean;
  marketingEmails: boolean;
  notifyComments: boolean;
  notifyReactions: boolean;
  notifyGuilds: boolean;
  notifyVoiceInvites: boolean;
  notifyMentions?: boolean;
  notifyReposts?: boolean;
  notifyMessages?: boolean;
  notifyChallenges?: boolean;
  allowDirectMessages?: boolean;
  messageRequestMode?: 'everyone' | 'followers' | 'none';
  showOnlineStatus?: boolean;
  showReadReceipts?: boolean;
  themeAccent: 'crimson' | 'violet' | 'gold';
  highContrast: boolean;
  largerText: boolean;
  reducedMotion: boolean;
  skipIntroAlways: boolean;
}

export interface LiveAnnouncementBanner {
  title: string;
  body: string;
  linkUrl: string;
  actorName?: string;
}

interface AuthContextValue {
  firebaseUser: FirebaseUser | null;
  user: KageUser | null;
  profile: KageProfile | null;
  settings: KageSettings | null;
  unreadNotifications: number;
  unreadMessages: number;
  loading: boolean;
  wsConnected: boolean;
  onlineUserUids: string[];
  tasteRevision: number;
  latestAnnouncement: LiveAnnouncementBanner | null;
  dismissAnnouncement: () => void;
  bumpTasteRevision: () => void;
  refreshMe: () => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signUpWithEmail: (params: {
    name: string;
    username: string;
    email: string;
    password: string;
  }) => Promise<void>;
  loginWithIdentifier: (identifier: string, password: string) => Promise<void>;
  requestPasswordReset: (email: string) => Promise<void>;
  resendVerificationEmail: () => Promise<void>;
  logout: () => Promise<void>;
  sendWsMessage: (payload: unknown) => void;
  subscribeWs: (listener: (msg: any) => void) => () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [firebaseUser, setFirebaseUser] = useState<FirebaseUser | null>(null);
  const [user, setUser] = useState<KageUser | null>(null);
  const [profile, setProfile] = useState<KageProfile | null>(null);
  const [settings, setSettings] = useState<KageSettings | null>(null);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [loading, setLoading] = useState(true);
  const [wsConnected, setWsConnected] = useState(false);
  const [onlineUserUids, setOnlineUserUids] = useState<string[]>([]);
  const [tasteRevision, setTasteRevision] = useState(0);
  const [latestAnnouncement, setLatestAnnouncement] = useState<LiveAnnouncementBanner | null>(
    null
  );

  const wsRef = useRef<WebSocket | null>(null);
  const wsListenersRef = useRef<Set<(msg: any) => void>>(new Set());
  const googleAuthInFlightRef = useRef(false);

  const bumpTasteRevision = useCallback(() => {
    setTasteRevision((r) => r + 1);
  }, []);

  const dismissAnnouncement = useCallback(() => {
    setLatestAnnouncement(null);
  }, []);

  // Apply accessibility & theme preferences to <html>
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('kage-high-contrast', Boolean(settings?.highContrast));
    root.classList.toggle('kage-large-text', Boolean(settings?.largerText));
    root.classList.toggle('kage-reduced-motion', Boolean(settings?.reducedMotion));
    root.classList.remove('kage-accent-violet', 'kage-accent-gold');
    if (settings?.themeAccent === 'violet') root.classList.add('kage-accent-violet');
    if (settings?.themeAccent === 'gold') root.classList.add('kage-accent-gold');
  }, [settings]);

  const applyBundle = useCallback((data: any) => {
    if (data?.token) {
      setServerSessionToken(data.token);
      setCachedMemoryToken(null);
    }
    setUser(data.user);
    setProfile(data.profile);
    setSettings(data.settings);
    setUnreadNotifications(data.unreadNotifications || 0);
    setUnreadMessages(data.unreadMessages || 0);
  }, []);

  const syncWithBackend = useCallback(
    async (fbUser: FirebaseUser, preferredUsername?: string) => {
      const token = await fbUser.getIdToken(false);
      setCachedMemoryToken(token);
      const data = await apiFetch('/api/auth/sync', {
        method: 'POST',
        body: JSON.stringify({
          username: preferredUsername,
          displayName: fbUser.displayName || preferredUsername,
        }),
      });
      if (data?.token) {
        setServerSessionToken(data.token);
        setCachedMemoryToken(null);
        await signOut(auth).catch(() => {});
      }
      applyBundle(data);
    },
    [applyBundle]
  );

  const refreshMe = useCallback(async () => {
    if (!getServerSessionToken() && !auth.currentUser) return;
    try {
      const data = await apiFetch('/api/me');
      applyBundle(data);
    } catch (err) {
      console.error('Failed to refresh user state:', err);
    }
  }, [applyBundle]);

  useEffect(() => {
    purgeStaleFirebaseBrowserPersistence();

    setAuthTokenAccessor(async () => {
      if (getServerSessionToken()) return getServerSessionToken();
      if (!auth.currentUser) return null;
      try {
        return await auth.currentUser.getIdToken(false);
      } catch (err) {
        if (isFirebaseTokenServiceDisabledError(err)) {
          await signOut(auth).catch(() => {});
        }
        return null;
      }
    });

    let cancelled = false;

    const bootstrapSession = async () => {
      const srvToken = getServerSessionToken();
      if (srvToken) {
        try {
          const data = await apiFetch('/api/me');
          if (!cancelled) {
            applyBundle(data);
            setLoading(false);
          }
          return;
        } catch {
          setServerSessionToken(null);
        }
      }
      if (!cancelled) {
        setLoading(false);
      }
    };

    bootstrapSession();

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (cancelled) return;
      setFirebaseUser(fbUser);

      // Ignore transient Firebase popup states when signInWithGoogle is handling token exchange
      if (googleAuthInFlightRef.current) {
        return;
      }

      // Active KAGE server session always takes precedence over client Firebase state
      if (getServerSessionToken()) {
        return;
      }

      if (fbUser) {
        try {
          await syncWithBackend(fbUser);
        } catch (err) {
          if (isFirebaseTokenServiceDisabledError(err)) {
            purgeStaleFirebaseBrowserPersistence();
            await signOut(auth).catch(() => {});
          }
        } finally {
          if (!cancelled) setLoading(false);
        }
      }
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [applyBundle, syncWithBackend]);

  // Connect real-time WebSocket when authenticated (either Server Session or Firebase Google)
  useEffect(() => {
    if (!user?.uid || !profile) {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setWsConnected(false);
      return;
    }

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = async () => {
      if (cancelled) return;
      const token = await getActiveToken();
      if (!token) return;

      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(`${protocol}//${window.location.host}/ws`);
      wsRef.current = ws;

      ws.onopen = () => {
        setWsConnected(true);
        ws.send(
          JSON.stringify({
            type: 'auth',
            token,
            displayName: profile.displayName,
            avatarUrl: profile.avatarUrl,
          })
        );
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'auth:ok' || msg.type === 'presence:online') {
            if (Array.isArray(msg.onlineUsers)) {
              setOnlineUserUids(msg.onlineUsers);
            }
          }
          if (msg.type === 'notification:new') {
            setUnreadNotifications((n) => n + 1);
            if (msg.announcement?.title) {
              setLatestAnnouncement(msg.announcement);
            }
          }
          if (msg.type === 'inbox:message') {
            setUnreadMessages((n) => n + 1);
          }
          for (const listener of wsListenersRef.current) {
            listener(msg);
          }
        } catch {
          // ignore malformed frames
        }
      };

      ws.onclose = () => {
        setWsConnected(false);
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [user?.uid, profile?.displayName, profile?.avatarUrl]);

  const sendWsMessage = useCallback((payload: unknown) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(payload));
    }
  }, []);

  const subscribeWs = useCallback((listener: (msg: any) => void) => {
    wsListenersRef.current.add(listener);
    return () => {
      wsListenersRef.current.delete(listener);
    };
  }, []);

  const signInWithGoogle = async () => {
    googleAuthInFlightRef.current = true;
    try {
      let googleAccessToken = '';
      let googleIdToken = '';
      let displayName: string | undefined;

      try {
        const cred = await signInWithPopup(auth, googleAuthProvider);
        const oauthCred = GoogleAuthProvider.credentialFromResult(cred);
        googleAccessToken = oauthCred?.accessToken || '';
        googleIdToken = oauthCred?.idToken || '';
        displayName = cred.user?.displayName || undefined;
        await signOut(auth).catch(() => {});
      } catch (popupErr: any) {
        await signOut(auth).catch(() => {});
        const code = String(popupErr?.code || '');
        if (
          code === 'auth/popup-closed-by-user' ||
          code === 'auth/cancelled-popup-request'
        ) {
          throw popupErr;
        }
        if (OAUTH_CLIENT_ID) {
          googleAccessToken = await requestGoogleAccessTokenViaGIS(OAUTH_CLIENT_ID);
        } else {
          throw popupErr;
        }
      }

      if (!googleAccessToken && !googleIdToken) {
        if (OAUTH_CLIENT_ID) {
          googleAccessToken = await requestGoogleAccessTokenViaGIS(OAUTH_CLIENT_ID);
        } else {
          throw new Error('Google sign-in did not return an OAuth credential.');
        }
      }

      setServerSessionToken(null);
      setCachedMemoryToken(null);
      const data = await apiFetch('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({
          googleAccessToken: googleAccessToken || undefined,
          googleIdToken: googleIdToken || undefined,
          displayName,
        }),
      });
      setServerSessionToken(data.token);
      applyBundle(data);
    } finally {
      googleAuthInFlightRef.current = false;
      setFirebaseUser(null);
    }
  };

  const signUpWithEmail = async (params: {
    name: string;
    username: string;
    email: string;
    password: string;
  }) => {
    const cleanName = params.name.trim();
    const cleanUsername = params.username.trim().replace(/^@+/, '');
    const data = await apiFetch('/api/auth/server-signup', {
      method: 'POST',
      body: JSON.stringify({
        name: cleanName,
        displayName: cleanName,
        username: cleanUsername,
        email: params.email.trim(),
        password: params.password,
      }),
    });
    if (auth.currentUser) {
      await signOut(auth).catch(() => {});
    }
    setCachedMemoryToken(null);
    setServerSessionToken(data.token);
    applyBundle(data);
  };

  const loginWithIdentifier = async (identifier: string, password: string) => {
    const data = await apiFetch('/api/auth/server-login', {
      method: 'POST',
      body: JSON.stringify({
        identifier: identifier.trim(),
        password,
      }),
    });
    if (auth.currentUser) {
      await signOut(auth).catch(() => {});
    }
    setCachedMemoryToken(null);
    setServerSessionToken(data.token);
    applyBundle(data);
  };

  const requestPasswordReset = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email.trim());
    } catch (err) {
      if (isFirebaseTokenServiceDisabledError(err)) {
        throw new Error(
          'Password reset emails are unavailable while Firebase Token Service is disabled on this project. Sign in with Google or contact an administrator.'
        );
      }
      throw err;
    }
  };

  const resendVerificationEmail = async () => {
    if (!auth.currentUser) throw new Error('Your KAGE account is already verified.');
    await sendEmailVerification(auth.currentUser);
  };

  const logout = async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch {
      // continue sign out locally even if network hiccups
    }
    if (auth.currentUser) {
      await signOut(auth).catch(() => {});
    }
    purgeStaleFirebaseBrowserPersistence();
    setServerSessionToken(null);
    setCachedMemoryToken(null);
    setFirebaseUser(null);
    setUser(null);
    setProfile(null);
    setSettings(null);
    setUnreadNotifications(0);
    setUnreadMessages(0);
    setLatestAnnouncement(null);
  };

  return (
    <AuthContext.Provider
      value={{
        firebaseUser,
        user,
        profile,
        settings,
        unreadNotifications,
        unreadMessages,
        loading,
        wsConnected,
        onlineUserUids,
        tasteRevision,
        latestAnnouncement,
        dismissAnnouncement,
        bumpTasteRevision,
        refreshMe,
        signInWithGoogle,
        signUpWithEmail,
        loginWithIdentifier,
        requestPasswordReset,
        resendVerificationEmail,
        logout,
        sendWsMessage,
        subscribeWs,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
