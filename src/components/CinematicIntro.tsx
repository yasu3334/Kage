import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Play, RotateCcw, Volume2, VolumeX } from 'lucide-react';
import { KAGE_LOGO_URL } from '../lib/assets';
import { kageSound } from '../lib/soundEngine';
import {
  DEFAULT_KAGE_FINAL_LOGO_HD,
  DEFAULT_KAGE_INTRO_MP4,
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
 * Full-HD (1920×1080) Theater-Grade Opening Screen
 *
 * Plays the authoritative watermark-free KAGE Zenitsu animation (/assets/kage-intro.mp4 & .webm)
 * on a seamless #09080B obsidian canvas with smooth fade-in on ready, authentic audio track
 * playback, subtle edge vignette integration, and unobtrusive bottom-corner glass controls.
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
  const [videoReady, setVideoReady] = useState(false);
  const [videoStarted, setVideoStarted] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(false);
  const [autoplayBlockedCompletely, setAutoplayBlockedCompletely] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const [fallbackImgError, setFallbackImgError] = useState(false);
  const [progressRatio, setProgressRatio] = useState(0);
  const [exiting, setExiting] = useState(false);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const videoStartedRef = useRef(false);
  const finishedRef = useRef(false);
  const exitTimerRef = useRef<number | null>(null);
  const watchdogTimerRef = useRef<number | null>(null);

  const isReducedStaticMode = shouldUseStaticReducedMotion && !forcePlayOverride;

  // Lock background scroll while full-viewport theater intro is active
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

  // Reveal subtle corner controls cleanly after initial obsidian settle
  useEffect(() => {
    const timer = window.setTimeout(() => setControlsVisible(true), 280);
    return () => window.clearTimeout(timer);
  }, []);

  // Resolve latest splash config once per session
  useEffect(() => {
    let cancelled = false;
    fetchSplashVideoConfig()
      .then((resolved) => {
        if (!cancelled) setConfig(resolved);
      })
      .catch(() => {
        // Bundled KAGE intro defaults remain active
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
      // ignore pause errors
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
        }, 200);
        return;
      }

      setProgressRatio(1);
      setExiting(true);
      exitTimerRef.current = window.setTimeout(() => {
        releaseVideoElement();
        onComplete({ skipped: false });
      }, 480);
    },
    [clearTimers, onComplete, releaseVideoElement]
  );

  // Ordered H.264 MP4 + VP9 WebM source list for maximum cross-device compatibility
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

  const fallbackHdLogoUrl = config.fallbackLogoUrl || DEFAULT_KAGE_FINAL_LOGO_HD;

  const getPreferredVideoVolume = useCallback(() => {
    const prefVol = (kageSound.getPreferences().soundVolume ?? 35) / 100;
    // Ensure authentic cinematic intro sound stays rich even when UI click volume is moderate
    return Math.max(0.55, Math.min(1, Math.max(prefVol * 1.6, 0.78)));
  }, []);

  // Attempt automatic playback on mount / replay without re-triggering on play state changes
  const startPlayback = useCallback(
    async (preferUnmuted?: boolean) => {
      const vid = videoRef.current;
      if (!vid || finishedRef.current) return;

      const allowSound =
        preferUnmuted !== undefined ? preferUnmuted : kageSound.isSplashAudioAllowed();

      if (allowSound) {
        try {
          vid.muted = false;
          vid.volume = getPreferredVideoVolume();
          await vid.play();
          videoStartedRef.current = true;
          setIsMuted(false);
          setVideoStarted(true);
          setAutoplayBlockedCompletely(false);
          return;
        } catch {
          // Browser autoplay policy requires user gesture before unmuted audio plays
        }
      }

      try {
        vid.muted = true;
        await vid.play();
        videoStartedRef.current = true;
        setIsMuted(true);
        setVideoStarted(true);
        setAutoplayBlockedCompletely(false);
      } catch {
        setAutoplayBlockedCompletely(true);
      }
    },
    [getPreferredVideoVolume]
  );

  // Reduced-motion entrance: crisp HD brand reveal then transition to homepage
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

  // Standard video playback lifecycle (never re-runs on videoStarted change)
  useEffect(() => {
    if (isReducedStaticMode) return;
    finishedRef.current = false;

    if (videoFailed) {
      const fallbackHold = window.setTimeout(() => {
        finishIntro(false);
      }, 2400);
      exitTimerRef.current = fallbackHold;
      return () => window.clearTimeout(fallbackHold);
    }

    void startPlayback();

    watchdogTimerRef.current = window.setTimeout(() => {
      const vid = videoRef.current;
      if (
        !finishedRef.current &&
        !videoStartedRef.current &&
        (!vid || (vid.readyState < 2 && vid.currentTime < 0.05))
      ) {
        setVideoFailed(true);
        logMissingSplashAssetForDeveloper('playback startup timeout');
      }
    }, 15000);

    return () => {
      clearTimers();
    };
  }, [clearTimers, finishIntro, isReducedStaticMode, startPlayback, videoFailed]);

  // Pause cleanly when browser tab is hidden and resume when active
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

  const handleToggleMute = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      const vid = videoRef.current;
      if (!vid) return;
      const nextMuted = !vid.muted;
      vid.muted = nextMuted;
      if (!nextMuted) {
        vid.volume = getPreferredVideoVolume();
        if (vid.paused) {
          vid.play().catch(() => {});
        }
      }
      setIsMuted(nextMuted);
    },
    [getPreferredVideoVolume]
  );

  const handleReplay = useCallback(
    (e?: React.MouseEvent) => {
      e?.stopPropagation();
      clearTimers();
      finishedRef.current = false;
      videoStartedRef.current = false;
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
          // ignore early seek error
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

  // Keyboard shortcuts: Escape = Skip, M = Mute/Unmute, R = Replay
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
          vid.volume = getPreferredVideoVolume();
          setIsMuted(false);
        }
      }}
      className={`fixed inset-0 z-[120] w-screen h-dvh bg-[#09080B] text-[#F5F1F2] overflow-hidden select-none flex items-center justify-center transition-all duration-500 ease-out transform-gpu ${
        exiting ? 'opacity-0 scale-[1.015] pointer-events-none' : 'opacity-100 scale-100'
      }`}
    >
      {/* Subtle Ambient Theater Backdrop Blending 16:9 Stage Edges Into Obsidian Canvas */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,rgba(109,40,217,0.08)_0%,rgba(192,38,61,0.04)_38%,rgba(9,8,11,1)_78%)]"
      />

      {!showStaticBrandFallback ? (
        <div className="relative w-full h-full flex items-center justify-center">
          <div className="relative w-full h-full max-w-[1920px] flex items-center justify-center">
            <video
              ref={videoRef}
              autoPlay
              preload="auto"
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
              onLoadedData={() => {
                setVideoReady(true);
              }}
              onPlaying={() => {
                setVideoReady(true);
                videoStartedRef.current = true;
                setVideoStarted(true);
                setAutoplayBlockedCompletely(false);
              }}
              onPlay={() => {
                videoStartedRef.current = true;
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
              className={`w-full h-full max-w-full max-h-full object-contain bg-transparent block select-none pointer-events-none transition-opacity duration-300 ${
                videoReady || videoStarted ? 'opacity-100' : 'opacity-0'
              }`}
            >
              {videoSources.map((source) => (
                <source key={source.src} src={source.src} type={source.type} />
              ))}
            </video>

            {/* Soft top & bottom gradient scrims so controls never clash with lightning or subtitle frames */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-[#09080B]/85 via-[#09080B]/25 to-transparent"
            />
          </div>

          {/* Only shown if device Low-Power Mode completely blocks autoplay */}
          {autoplayBlockedCompletely && (
            <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#09080B]/80 backdrop-blur-xs px-6 text-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  void startPlayback(true);
                }}
                className="min-h-[48px] px-7 py-3 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-sm font-semibold tracking-wide flex items-center gap-2.5 shadow-[0_14px_36px_rgba(192,38,61,0.4)] cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white kage-press"
              >
                <Play className="w-4 h-4 fill-white shrink-0" />
                <span>Play Intro</span>
              </button>
            </div>
          )}
        </div>
      ) : (
        /* Graceful HD Brand Presentation for Reduced Motion or Video Fallback */
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
              <div className="mt-4 w-48 sm:w-72 h-[2px] rounded-full bg-gradient-to-r from-transparent via-[#C0263D] to-transparent" />
              <p className="mt-3.5 text-xs sm:text-sm font-semibold uppercase tracking-[0.36em] text-[#F5F1F2]">
                THE ANIME UNIVERSE
              </p>
            </div>
          )}

          {isReducedStaticMode && (
            <div className="kage-intro-bottombar absolute bottom-4 inset-x-0 z-30 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setForcePlayOverride(true);
                }}
                className="min-h-[44px] px-4 py-2 rounded-xl bg-[#141116]/90 hover:bg-[#1C1720] border border-white/15 text-xs font-semibold text-[#F5F1F2] flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C0263D] whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span>Watch Animation</span>
              </button>
              <button
                type="button"
                onClick={handleSkip}
                className="min-h-[44px] px-5 py-2 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-xs font-semibold text-white flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white whitespace-nowrap"
              >
                <span>Enter KAGE</span>
                <ArrowRight className="w-3.5 h-3.5 shrink-0" />
              </button>
            </div>
          )}
        </div>
      )}

      {/* Sleek Bottom-Corner Cinema Controls Dock (Thumb-Zone Reachable, Uncluttered, Zero Floating Pills Over Video) */}
      <div
        className={`kage-intro-bottombar absolute bottom-3 inset-x-0 z-40 flex items-center justify-between gap-3 pointer-events-none transition-opacity duration-300 ${
          controlsVisible ? 'opacity-100' : 'opacity-0'
        }`}
      >
        <div className="flex items-center gap-2 pointer-events-auto">
          {!showStaticBrandFallback && (
            <button
              type="button"
              data-kage-silent="true"
              onClick={handleToggleMute}
              aria-label={isMuted ? 'Unmute intro audio' : 'Mute intro audio'}
              title={isMuted ? 'Tap for audio (M)' : 'Mute audio (M)'}
              className={`min-h-[40px] px-3.5 py-2 rounded-lg backdrop-blur-md border text-xs font-medium flex items-center gap-2 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C0263D] whitespace-nowrap shrink-0 ${
                isMuted && videoStarted
                  ? 'bg-[#09080B]/75 border-amber-400/40 text-amber-200 hover:bg-[#141116] hover:border-amber-400/75'
                  : 'bg-[#09080B]/65 border-white/12 text-[#D8D2DC] hover:bg-[#141116]/90 hover:text-white hover:border-white/25'
              }`}
            >
              {isMuted ? (
                <>
                  <VolumeX className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                  <span>{videoStarted ? 'Tap for Sound' : 'Unmute'}</span>
                </>
              ) : (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  <span className="hidden sm:inline">Sound On</span>
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
            className="min-h-[40px] min-w-[40px] px-3 py-2 rounded-lg bg-[#09080B]/65 hover:bg-[#141116]/90 backdrop-blur-md border border-white/12 hover:border-white/25 text-xs font-medium text-[#A7A0AA] hover:text-[#F5F1F2] flex items-center justify-center gap-1.5 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C0263D] whitespace-nowrap shrink-0"
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
          className="pointer-events-auto min-h-[40px] px-4 py-2 rounded-lg bg-[#09080B]/75 hover:bg-[#141116]/95 backdrop-blur-md border border-white/15 hover:border-[#C0263D]/70 text-xs font-semibold tracking-wide text-[#F5F1F2] flex items-center gap-2 cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C0263D] whitespace-nowrap shrink-0"
        >
          <span>Skip</span>
          <ArrowRight className="w-3.5 h-3.5 text-[#C0263D] shrink-0" />
        </button>
      </div>

      {/* Ultra-Thin Bottom Progress Hairline */}
      {!showStaticBrandFallback && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute bottom-0 inset-x-0 z-30 h-[2px] bg-white/8 overflow-hidden"
        >
          <div
            className="h-full w-full origin-left bg-gradient-to-r from-[#6D28D9] via-[#C0263D] to-amber-400 transition-transform duration-150 ease-linear"
            style={{ transform: `scaleX(${Math.max(0, Math.min(1, progressRatio))})` }}
          />
        </div>
      )}
    </div>
  );
};
