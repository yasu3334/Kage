import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, RotateCcw, SkipForward, Volume2, VolumeX } from 'lucide-react';
import { KAGE_LOGO_URL } from '../lib/assets';
import { kageSound } from '../lib/soundEngine';
import {
  DEFAULT_KAGE_FINAL_LOGO_HD,
  DEFAULT_KAGE_INTRO_MP4,
  DEFAULT_KAGE_INTRO_POSTER,
  DEFAULT_KAGE_INTRO_WEBM,
  SplashVideoConfig,
  fetchSplashVideoConfig,
  getCachedSplashVideoConfig,
  logMissingSplashAssetForDeveloper,
} from '../lib/splashVideoStore';

export interface IntroCompletionPayload {
  skipped: boolean;
}

interface CinematicIntroProps {
  onComplete: (payload?: IntroCompletionPayload) => void;
  reducedMotion?: boolean;
  isManualReplay?: boolean;
}

/**
 * KAGE — THE ANIME UNIVERSE
 * Premium, Responsive Full-HD (1920×1080) Website Opening Screen
 *
 * Preserves the exact 10-step watermark-free animation sequence:
 *  1. Zenitsu appears first.
 *  2. He runs toward the camera.
 *  3. He prepares and performs Thunder Breathing.
 *  4. The golden lightning attack explodes.
 *  5. The KAGE logo appears.
 *  6. Zenitsu becomes smaller.
 *  7. He runs toward the letter K.
 *  8. He jumps and climbs onto the K.
 *  9. He sits on top of the K.
 * 10. The final complete KAGE logo remains visible.
 *
 * Responsive & Performance Guarantees:
 * - Full-screen #09080B obsidian canvas across desktop, laptop, tablet, iOS & Android (portrait & landscape)
 * - `object-fit: contain` so Zenitsu, KAGE lettering, #C0263D underline, and THE ANIME UNIVERSE subtitle are NEVER cropped or stretched
 * - H.264 MP4 + VP9 WebM sources with `preload="metadata"`, `playsInline`, and 1920×1080 poster frame
 * - Smart browser autoplay compliance (attempts unmuted when allowed, seamlessly falls back to muted with one-tap Unmute toggle)
 * - Respects `prefers-reduced-motion` and provides resilient brand fallback if video playback fails
 */
export const CinematicIntro: React.FC<CinematicIntroProps> = ({
  onComplete,
  reducedMotion = false,
  isManualReplay = false,
}) => {
  const [config, setConfig] = useState<SplashVideoConfig>(() => getCachedSplashVideoConfig());
  const [prefersOsReducedMotion] = useState<boolean>(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    try {
      return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    } catch {
      return false;
    }
  });

  const shouldUseStaticReducedMotion =
    (reducedMotion || prefersOsReducedMotion) && !isManualReplay;

  const [forcePlayOverride, setForcePlayOverride] = useState(false);
  const [isMuted, setIsMuted] = useState<boolean>(() => !kageSound.isSplashAudioAllowed());
  const [videoStarted, setVideoStarted] = useState(false);
  const [autoplayBlockedCompletely, setAutoplayBlockedCompletely] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [fallbackImgError, setFallbackImgError] = useState(false);
  const [progressRatio, setProgressRatio] = useState(0);
  const [exiting, setExiting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const finishedRef = useRef(false);
  const exitTimerRef = useRef<number | null>(null);
  const watchdogTimerRef = useRef<number | null>(null);

  const isReducedStaticMode = shouldUseStaticReducedMotion && !forcePlayOverride;

  // Lock background page scroll while full-screen opening screen is active
  useEffect(() => {
    const prevHtmlOverflow = document.documentElement.style.overflow;
    const prevBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    return () => {
      document.documentElement.style.overflow = prevHtmlOverflow;
      document.body.style.overflow = prevBodyOverflow;
    };
  }, []);

  // Resolve latest splash config once per session
  useEffect(() => {
    let cancelled = false;
    fetchSplashVideoConfig()
      .then((resolved) => {
        if (!cancelled) {
          setConfig(resolved);
        }
      })
      .catch(() => {
        // Uses bundled KAGE intro defaults cleanly
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const clearTimers = useCallback(() => {
    if (exitTimerRef.current !== null) {
      window.clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (watchdogTimerRef.current !== null) {
      window.clearTimeout(watchdogTimerRef.current);
      watchdogTimerRef.current = null;
    }
  }, []);

  const releaseVideoElement = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;
    try {
      vid.pause();
    } catch {
      // ignore media pause errors
    }
  }, []);

  const finishIntro = useCallback(
    (skipped: boolean) => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      clearTimers();

      if (skipped) {
        releaseVideoElement();
        setExiting(true);
        window.setTimeout(() => {
          onComplete({ skipped: true });
        }, 220);
        return;
      }

      setProgressRatio(1);
      setExiting(true);
      exitTimerRef.current = window.setTimeout(() => {
        releaseVideoElement();
        onComplete({ skipped: false });
      }, 520);
    },
    [clearTimers, onComplete, releaseVideoElement]
  );

  // Build ordered MP4 + WebM source list for maximum cross-browser compatibility (Safari/iOS H.264 + Chrome/Firefox VP9)
  const videoSources = useMemo(() => {
    const list: { src: string; type: string }[] = [];
    const addUnique = (src?: string | null, type?: string | null) => {
      if (!src) return;
      if (list.some((item) => item.src === src)) return;
      list.push({
        src,
        type: type || (/\.webm(\?|$)/i.test(src) ? 'video/webm' : 'video/mp4'),
      });
    };

    addUnique(config.videoUrl, config.mimeType);
    addUnique(config.fallbackVideoUrl, config.fallbackMimeType);
    addUnique(DEFAULT_KAGE_INTRO_MP4, 'video/mp4');
    addUnique(DEFAULT_KAGE_INTRO_WEBM, 'video/webm');
    return list;
  }, [config.fallbackMimeType, config.fallbackVideoUrl, config.mimeType, config.videoUrl]);

  const posterUrl = config.posterUrl || DEFAULT_KAGE_INTRO_POSTER;
  const fallbackHdLogoUrl = config.fallbackLogoUrl || DEFAULT_KAGE_FINAL_LOGO_HD;

  // Attempt automatic playback on mount / source update
  const startPlayback = useCallback(
    async (preferUnmuted?: boolean) => {
      const vid = videoRef.current;
      if (!vid || finishedRef.current) return;

      const allowSound =
        preferUnmuted !== undefined ? preferUnmuted : kageSound.isSplashAudioAllowed();
      const targetVol = Math.max(
        0.15,
        Math.min(1, (kageSound.getPreferences().soundVolume || 72) / 100)
      );
      vid.volume = targetVol;

      if (allowSound) {
        try {
          vid.muted = false;
          await vid.play();
          setIsMuted(false);
          setVideoStarted(true);
          setAutoplayBlockedCompletely(false);
          return;
        } catch {
          // Browser blocked autoplay with sound — fall back immediately to smooth muted autoplay
        }
      }

      try {
        vid.muted = true;
        await vid.play();
        setIsMuted(true);
        setVideoStarted(true);
        setAutoplayBlockedCompletely(false);
      } catch {
        // Strict power-saver / browser autoplay restriction blocked even muted play
        setAutoplayBlockedCompletely(true);
      }
    },
    []
  );

  // Reduced-motion calm entrance: show crisp static KAGE brand lockup and transition smoothly
  useEffect(() => {
    if (!isReducedStaticMode) return;
    finishedRef.current = false;
    const id = window.setTimeout(() => {
      finishIntro(false);
    }, 2400);
    exitTimerRef.current = id;
    return () => {
      window.clearTimeout(id);
    };
  }, [finishIntro, isReducedStaticMode]);

  // Standard video lifecycle + stall/error watchdog so visitors never get stuck on the intro screen
  useEffect(() => {
    if (isReducedStaticMode) return;
    finishedRef.current = false;

    if (videoFailed) {
      const fallbackHold = window.setTimeout(() => {
        finishIntro(false);
      }, 2600);
      exitTimerRef.current = fallbackHold;
      return () => window.clearTimeout(fallbackHold);
    }

    void startPlayback();

    // Watchdog: if video fails to begin advancing within 5.5s (e.g. network stall or Low Power block), ensure graceful progression
    watchdogTimerRef.current = window.setTimeout(() => {
      const vid = videoRef.current;
      if (!finishedRef.current && (!vid || vid.currentTime < 0.05) && !videoStarted) {
        setVideoFailed(true);
        logMissingSplashAssetForDeveloper('playback startup timeout');
      }
    }, 5500);

    return () => {
      clearTimers();
    };
  }, [clearTimers, finishIntro, isReducedStaticMode, startPlayback, videoFailed, videoStarted]);

  // Pause cleanly when browser tab is hidden and resume when visible
  useEffect(() => {
    const onVisibility = () => {
      const vid = videoRef.current;
      if (!vid || finishedRef.current || isReducedStaticMode || videoFailed) return;
      if (document.visibilityState === 'hidden') {
        vid.pause();
      } else if (document.visibilityState === 'visible') {
        vid.play().catch(() => {});
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [isReducedStaticMode, videoFailed]);

  const handleToggleMute = useCallback((e?: React.MouseEvent) => {
    e?.stopPropagation();
    const vid = videoRef.current;
    if (!vid) return;
    const nextMuted = !vid.muted;
    vid.muted = nextMuted;
    if (!nextMuted) {
      vid.volume = Math.max(
        0.2,
        Math.min(1, (kageSound.getPreferences().soundVolume || 75) / 100)
      );
      if (vid.paused) {
        vid.play().catch(() => {});
      }
    }
    setIsMuted(nextMuted);
  }, []);

  const handleReplay = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      clearTimers();
      finishedRef.current = false;
      setExiting(false);
      setProgressRatio(0);
      setAutoplayBlockedCompletely(false);

      if (isReducedStaticMode) {
        setForcePlayOverride(true);
        return;
      }

      if (videoFailed) {
        setVideoFailed(false);
        return;
      }

      const vid = videoRef.current;
      if (vid) {
        try {
          vid.currentTime = Number(config.startOffsetSec || 0);
        } catch {
          // ignore seek error before metadata
        }
        void startPlayback(true);
      }
    },
    [clearTimers, config.startOffsetSec, isReducedStaticMode, startPlayback, videoFailed]
  );

  const handleSkip = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      finishIntro(true);
    },
    [finishIntro]
  );

  // Keyboard shortcuts: Escape = Skip Intro, M = Mute/Unmute, R = Replay
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        finishIntro(true);
      } else if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handleToggleMute();
      } else if ((e.key === 'r' || e.key === 'R') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        handleReplay();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [finishIntro, handleReplay, handleToggleMute]);

  const showStaticBrandFallback = isReducedStaticMode || videoFailed;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="KAGE — The Anime Universe Opening Intro"
      onClick={() => {
        if (showStaticBrandFallback) return;
        const vid = videoRef.current;
        if (!vid) return;
        if (vid.paused) {
          void startPlayback(true);
        } else if (vid.muted) {
          vid.muted = false;
          vid.volume = Math.max(
            0.35,
            Math.min(1, (kageSound.getPreferences().soundVolume || 80) / 100)
          );
          setIsMuted(false);
        }
      }}
      className={`fixed inset-0 z-[120] w-screen h-dvh bg-[#09080B] text-[#F5F1F2] overflow-hidden select-none flex items-center justify-center transition-all duration-500 ease-out transform-gpu ${
        exiting ? 'opacity-0 scale-[1.015] pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Full-Screen Responsive Video / Brand Stage (#09080B deep black, object-fit: contain — zero cropping, zero stretching) */}
      {!showStaticBrandFallback ? (
        <div className="relative w-full h-full flex items-center justify-center bg-[#09080B]">
          <video
            ref={videoRef}
            poster={posterUrl}
            preload="metadata"
            playsInline
            muted={isMuted}
            disablePictureInPicture
            controls={false}
            onLoadedMetadata={(e) => {
              const vid = e.currentTarget;
              const offset = Number(config.startOffsetSec || 0);
              if (offset > 0 && (!Number.isFinite(vid.duration) || vid.duration > offset + 3)) {
                try {
                  vid.currentTime = offset;
                } catch {
                  // ignore early seek errors
                }
              }
            }}
            onPlay={() => {
              setVideoStarted(true);
              setAutoplayBlockedCompletely(false);
            }}
            onTimeUpdate={(e) => {
              const vid = e.currentTarget;
              if (Number.isFinite(vid.duration) && vid.duration > 0) {
                setProgressRatio(Math.min(1, Math.max(0, vid.currentTime / vid.duration)));
              }
            }}
            onEnded={() => {
              finishIntro(false);
            }}
            onError={() => {
              setVideoFailed(true);
              logMissingSplashAssetForDeveloper('HTML5 video element failed across all sources');
            }}
            className="w-full h-full max-w-full max-h-full object-contain bg-[#09080B] block select-none pointer-events-none"
          >
            {videoSources.map((source) => (
              <source key={source.src} src={source.src} type={source.type} />
            ))}
          </video>

          {/* Optional Tap-to-Play prompt ONLY if strict mobile Low-Power mode blocks even muted autoplay */}
          {autoplayBlockedCompletely && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#09080B]/70 backdrop-blur-xs px-6 text-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void startPlayback(true);
                }}
                className="min-h-[48px] px-6 py-3 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-sm font-semibold tracking-wide flex items-center gap-2.5 shadow-[0_12px_32px_rgba(192,38,61,0.4)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white kage-press"
              >
                <Play className="w-4 h-4 fill-white shrink-0" />
                <span>Play KAGE Intro</span>
              </button>
            </div>
          )}

          {/* Tap-to-Unmute Floating Hint Pill when video begins muted due to browser policy */}
          {isMuted && videoStarted && !autoplayBlockedCompletely && (
            <div className="absolute bottom-6 inset-x-0 z-20 flex justify-center pointer-events-none px-4">
              <button
                type="button"
                onClick={handleToggleMute}
                className="pointer-events-auto min-h-[38px] px-4 py-1.5 rounded-full bg-[#09080B]/85 hover:bg-[#141116] border border-amber-400/40 hover:border-amber-400 text-xs font-semibold text-amber-200 hover:text-white flex items-center gap-2 shadow-[0_4px_20px_rgba(0,0,0,0.6)] backdrop-blur-md animate-pulse cursor-pointer transition-all"
              >
                <Volume2 className="w-4 h-4 text-amber-400" />
                <span>Tap for Authentic Intro Sound 🔊</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Graceful High-Definition KAGE Brand Fallback & Reduced-Motion Presentation (#09080B) */
        <div className="relative w-full h-full flex flex-col items-center justify-center bg-[#09080B] px-6">
          {!fallbackImgError ? (
            <img
              src={fallbackHdLogoUrl}
              alt="KAGE — The Anime Universe"
              referrerPolicy="no-referrer"
              onError={() => setFallbackImgError(true)}
              draggable={false}
              className="w-full h-full max-w-full max-h-full object-contain select-none"
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center max-w-xl">
              <img
                src={KAGE_LOGO_URL}
                alt="KAGE"
                referrerPolicy="no-referrer"
                draggable={false}
                className="h-16 sm:h-24 md:h-28 w-auto object-contain select-none"
              />
              <div className="mt-4 w-48 sm:w-72 h-[3px] rounded-full bg-gradient-to-r from-transparent via-[#C0263D] to-transparent shadow-[0_0_16px_rgba(192,38,61,0.85)]" />
              <p className="mt-3.5 text-xs sm:text-sm md:text-base font-bold uppercase tracking-[0.38em] text-[#F5F1F2]">
                THE ANIME UNIVERSE
              </p>
            </div>
          )}

          {isReducedStaticMode && (
            <div className="kage-intro-bottombar absolute bottom-0 inset-x-0 z-30 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setForcePlayOverride(true);
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#141116]/90 hover:bg-[#1C1720] border border-white/15 text-xs font-semibold text-[#F5F1F2] flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C0263D] whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Play Animation</span>
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-xs font-semibold text-white flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white whitespace-nowrap"
              >
                <span>Enter KAGE</span>
                <SkipForward className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Subtle Top-Right Controls Bar (Safe-Area Aware, Keyboard Accessible, >= 44px Touch Targets) */}
      <div className="kage-intro-topbar absolute top-0 inset-x-0 z-40 flex items-center justify-between gap-3 pointer-events-none">
        <div className="flex items-center gap-2 pointer-events-auto">
          {!showStaticBrandFallback && (
            <button
              type="button"
              data-kage-silent="true"
              onClick={handleToggleMute}
              aria-label={isMuted ? 'Unmute intro audio' : 'Mute intro audio'}
              title={isMuted ? 'Unmute audio (M)' : 'Mute audio (M)'}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-[#09080B]/75 hover:bg-[#141116]/90 backdrop-blur-md border border-white/15 hover:border-white/30 text-xs font-medium text-[#F5F1F2] flex items-center gap-2 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C0263D] whitespace-nowrap shrink-0"
            >
              {isMuted ? (
                <>
                  <VolumeX className="w-4 h-4 text-[#A7A0AA] shrink-0" />
                  <span className="hidden xs:inline sm:inline text-[#D8D2DC]">Unmute</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-4 h-4 text-amber-400 shrink-0" />
                  <span className="hidden xs:inline sm:inline text-[#F5F1F2]">Sound On</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            data-kage-silent="true"
            onClick={handleReplay}
            aria-label="Replay KAGE intro"
            title="Replay Intro (R)"
            className="min-h-[44px] min-w-[44px] px-3 py-2 rounded-xl bg-[#09080B]/75 hover:bg-[#141116]/90 backdrop-blur-md border border-white/15 hover:border-white/30 text-xs font-medium text-[#D8D2DC] hover:text-[#F5F1F2] flex items-center justify-center gap-1.5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C0263D] whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3.5 h-3.5 shrink-0" />
            <span className="hidden sm:inline">Replay</span>
          </button>
        </div>

        <button
          type="button"
          data-kage-silent="true"
          onClick={handleSkip}
          aria-label="Skip intro and enter KAGE homepage"
          className="pointer-events-auto min-h-[44px] px-4 py-2 rounded-xl bg-[#09080B]/80 hover:bg-[#141116]/95 backdrop-blur-md border border-white/18 hover:border-[#C0263D]/80 text-xs font-semibold tracking-wide text-[#F5F1F2] flex items-center gap-2 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C0263D] whitespace-nowrap shrink-0"
        >
          <span>Skip Intro</span>
          <SkipForward className="w-3.5 h-3.5 text-[#C0263D] shrink-0" />
        </button>
      </div>

      {/* Ultra-Subtle Bottom Timeline Hairline */}
      {!showStaticBrandFallback && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 inset-x-0 z-30 h-[2px] bg-white/6 overflow-hidden"
        >
          <svg
            className="w-full h-full block"
            viewBox="0 0 1000 2"
            preserveAspectRatio="none"
          >
            <defs>
              <linearGradient id="kageIntroTimelineGrad" x1="0" y1="0" x2="1000" y2="0" gradientUnits="userSpaceOnUse">
                <stop offset="0%" stopColor="#6D28D9" />
                <stop offset="55%" stopColor="#C0263D" />
                <stop offset="100%" stopColor="#FBBF24" />
              </linearGradient>
            </defs>
            <rect
              x="0"
              y="0"
              width={Math.max(0, Math.min(1000, Math.round(progressRatio * 1000)))}
              height="2"
              fill="url(#kageIntroTimelineGrad)"
            />
          </svg>
        </div>
      )}
    </div>
  );
};
