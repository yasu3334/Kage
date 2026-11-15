import { resolveStaticApiFallback } from './staticSnapshotResolver';

// Session token store (uses in-memory + safe sessionStorage/localStorage fallback for kage_srv tokens)
const SERVER_SESSION_KEY = 'kage_srv_session_v1';

function readStoredServerToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const fromSession = window.sessionStorage?.getItem(SERVER_SESSION_KEY);
    if (fromSession) return fromSession;
  } catch {
    // ignore storage errors in restricted iframes
  }
  try {
    const fromLocal = window.localStorage?.getItem(SERVER_SESSION_KEY);
    if (fromLocal) return fromLocal;
  } catch {
    // ignore storage errors in restricted iframes
  }
  return null;
}

let memoryIdToken: string | null = null;
let serverSessionToken: string | null = readStoredServerToken();
let tokenGetter: (() => Promise<string | null>) | null = null;

export function setAuthTokenAccessor(getter: (() => Promise<string | null>) | null) {
  tokenGetter = getter;
}

export function setCachedMemoryToken(token: string | null) {
  memoryIdToken = token;
}

export function setServerSessionToken(token: string | null) {
  serverSessionToken = token;
  if (typeof window === 'undefined') return;
  try {
    if (token) {
      window.sessionStorage?.setItem(SERVER_SESSION_KEY, token);
    } else {
      window.sessionStorage?.removeItem(SERVER_SESSION_KEY);
    }
  } catch {
    // ignore storage errors in restricted iframes
  }
  try {
    if (token) {
      window.localStorage?.setItem(SERVER_SESSION_KEY, token);
    } else {
      window.localStorage?.removeItem(SERVER_SESSION_KEY);
    }
  } catch {
    // ignore storage errors in restricted iframes
  }
}

export function getServerSessionToken(): string | null {
  if (!serverSessionToken) {
    serverSessionToken = readStoredServerToken();
  }
  return serverSessionToken;
}

export async function getActiveToken(): Promise<string | null> {
  if (serverSessionToken) {
    return serverSessionToken;
  }
  if (tokenGetter) {
    try {
      const fresh = await tokenGetter();
      if (fresh) {
        memoryIdToken = fresh;
        return fresh;
      }
    } catch {
      return memoryIdToken;
    }
  }
  return memoryIdToken;
}

const CONFIGURED_API_BASE = (import.meta.env.VITE_API_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

let staticBackendUnavailable = false;

export function resolveApiUrl(path: string): string {
  if (/^https?:\/\//i.test(path)) return path;
  if (CONFIGURED_API_BASE && path.startsWith('/')) {
    return `${CONFIGURED_API_BASE}${path}`;
  }
  return path;
}

export async function apiFetch<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const isApiPath = path.startsWith('/api/');

  if (isApiPath && staticBackendUnavailable) {
    const fallback = await resolveStaticApiFallback<T>(path, options);
    if (fallback.handled) return fallback.data;
    throw new Error('Backend API unavailable on this host');
  }

  const token = await getActiveToken();
  const headers = new Headers(options.headers || {});
  if (!headers.has('Content-Type') && options.body && typeof options.body === 'string') {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let res: Response;
  try {
    res = await fetch(resolveApiUrl(path), {
      ...options,
      headers,
    });
  } catch (err) {
    if (isApiPath) {
      const fallback = await resolveStaticApiFallback<T>(path, options);
      if (fallback.handled) return fallback.data;
    }
    throw err;
  }

  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    if (isApiPath) {
      if (!CONFIGURED_API_BASE && (res.status === 404 || res.status === 405 || res.ok)) {
        staticBackendUnavailable = true;
      }
      const fallback = await resolveStaticApiFallback<T>(path, options);
      if (fallback.handled) return fallback.data;
    }
    if (!res.ok) {
      throw new Error(`Request failed (${res.status})`);
    }
    // Static hosts (e.g. GitHub Pages) may return 200 text/html for unknown /api/* paths
    throw new Error('Backend API unavailable on this host');
  }

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (isApiPath && (res.status === 404 || res.status === 405 || res.status >= 502)) {
      const fallback = await resolveStaticApiFallback<T>(path, options);
      if (fallback.handled) return fallback.data;
    }
    throw new Error(data?.error || `Request failed (${res.status})`);
  }
  return data as T;
}
