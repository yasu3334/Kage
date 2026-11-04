import { apiFetch } from './api';

export interface SplashVideoConfig {
  configured: boolean;
  sourceType: 'bundled' | 'uploaded' | 'env' | 'stream' | 'none';
  videoUrl: string | null;
  mimeType: string | null;
  posterUrl?: string | null;
  fallbackLogoUrl?: string | null;
  fallbackVideoUrl?: string | null;
  fallbackMimeType?: string | null;
  startOffsetSec?: number | null;
  assetId: number | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  updatedAt: string | null;
}

const ENV_VIDEO_URL = (import.meta.env.VITE_SPLASH_VIDEO_URL || '').trim();
export const DEFAULT_KAGE_INTRO_MP4 = '/assets/kage-intro.mp4';
export const DEFAULT_KAGE_INTRO_WEBM = '/assets/kage-intro.webm';
export const DEFAULT_KAGE_INTRO_POSTER = '/assets/kage-intro-poster.jpg';
export const DEFAULT_KAGE_FINAL_LOGO_HD = '/assets/kage-intro-final-hd.png';

let memoizedConfig: SplashVideoConfig | null = null;
let inflightPromise: Promise<SplashVideoConfig> | null = null;
let missingAssetLoggedForDeveloper = false;

export function invalidateSplashVideoCache(): void {
  memoizedConfig = null;
  inflightPromise = null;
}

export function getDefaultBundledSplashConfig(): SplashVideoConfig {
  if (ENV_VIDEO_URL) {
    return {
      configured: true,
      sourceType: 'env',
      videoUrl: ENV_VIDEO_URL,
      mimeType: /\.webm(\?|$)/i.test(ENV_VIDEO_URL) ? 'video/webm' : 'video/mp4',
      posterUrl: DEFAULT_KAGE_INTRO_POSTER,
      fallbackLogoUrl: DEFAULT_KAGE_FINAL_LOGO_HD,
      fallbackVideoUrl: DEFAULT_KAGE_INTRO_WEBM,
      fallbackMimeType: 'video/webm',
      startOffsetSec: 0,
      assetId: null,
      durationSec: 11,
      width: 1920,
      height: 1080,
      byteSize: null,
      updatedAt: null,
    };
  }
  return {
    configured: true,
    sourceType: 'bundled',
    videoUrl: DEFAULT_KAGE_INTRO_MP4,
    mimeType: 'video/mp4',
    posterUrl: DEFAULT_KAGE_INTRO_POSTER,
    fallbackLogoUrl: DEFAULT_KAGE_FINAL_LOGO_HD,
    fallbackVideoUrl: DEFAULT_KAGE_INTRO_WEBM,
    fallbackMimeType: 'video/webm',
    startOffsetSec: 0,
    assetId: null,
    durationSec: 11,
    width: 1920,
    height: 1080,
    byteSize: null,
    updatedAt: null,
  };
}

/**
 * Logs a single non-intrusive diagnostic message exclusively for developers in DevTools
 * when the intro video fails to play, while displaying the clean KAGE brand fallback to visitors.
 */
export function logMissingSplashAssetForDeveloper(reason?: string): void {
  if (missingAssetLoggedForDeveloper) return;
  missingAssetLoggedForDeveloper = true;
  // eslint-disable-next-line no-console
  console.warn(
    `[KAGE Intro] Falling back to static KAGE brand lockup${
      reason ? ` (${reason})` : ''
    }. Verify /public/assets/kage-intro.mp4 and /public/assets/kage-intro.webm.`
  );
}

/**
 * Resolves the KAGE intro video configuration once per session (relying on <video preload="metadata">
 * rather than forcing eager full-video downloads).
 */
export async function fetchSplashVideoConfig(forceRefresh = false): Promise<SplashVideoConfig> {
  if (!forceRefresh && memoizedConfig) {
    return memoizedConfig;
  }

  if (!forceRefresh && inflightPromise) {
    return inflightPromise;
  }

  inflightPromise = apiFetch<{ splash: SplashVideoConfig }>('/api/splash-config')
    .then((res) => {
      const splash = res?.splash;
      if (splash && splash.configured && splash.videoUrl) {
        memoizedConfig = splash;
        return splash;
      }
      const fallback = getDefaultBundledSplashConfig();
      memoizedConfig = fallback;
      return fallback;
    })
    .catch(() => {
      const fallback = getDefaultBundledSplashConfig();
      memoizedConfig = fallback;
      return fallback;
    })
    .finally(() => {
      inflightPromise = null;
    });

  return inflightPromise;
}

export function getCachedSplashVideoConfig(): SplashVideoConfig {
  if (memoizedConfig) return memoizedConfig;
  return getDefaultBundledSplashConfig();
}
