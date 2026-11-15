import React, { useEffect, useId, useMemo, useRef } from 'react';
import * as d3 from 'd3';

interface SpeakerLiveWaveformProps {
  uid: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isHost?: boolean;
  getFrequencyData?: (uid: string) => Uint8Array | null;
  className?: string;
}

const POINT_COUNT = 17;
const SVG_WIDTH = 96;
const SVG_HEIGHT = 24;
const MID_Y = SVG_HEIGHT / 2;

function hashUidSeed(uid: string): number {
  let h = 2166136261;
  for (let i = 0; i < uid.length; i++) {
    h ^= uid.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h % 1000) / 1000;
}

/**
 * Real-time D3 SVG mirrored audio waveform visualizer for each active voice speaker.
 * Consumes live Web Audio AnalyserNode frequency bins when available, seamlessly blending
 * with WebSocket voice-activity signaling and settling cleanly to a quiet hairline when muted/silent.
 */
export const SpeakerLiveWaveform: React.FC<SpeakerLiveWaveformProps> = ({
  uid,
  isSpeaking,
  isMuted,
  isHost = false,
  getFrequencyData,
  className = '',
}) => {
  const rawId = useId();
  const safeId = rawId.replace(/[^a-zA-Z0-9_-]/g, '');
  const gradStrokeId = `kage-wf-stroke-${safeId}`;
  const gradFillId = `kage-wf-fill-${safeId}`;

  const areaPathRef = useRef<SVGPathElement | null>(null);
  const topLinePathRef = useRef<SVGPathElement | null>(null);
  const bottomLinePathRef = useRef<SVGPathElement | null>(null);

  const isSpeakingRef = useRef(isSpeaking);
  const isMutedRef = useRef(isMuted);
  const getFreqRef = useRef(getFrequencyData);

  isSpeakingRef.current = isSpeaking;
  isMutedRef.current = isMuted;
  getFreqRef.current = getFrequencyData;

  const uidSeed = useMemo(() => hashUidSeed(uid), [uid]);

  useEffect(() => {
    const xScale = d3
      .scaleLinear()
      .domain([0, POINT_COUNT - 1])
      .range([2, SVG_WIDTH - 2]);

    const areaGenerator = d3
      .area<number>()
      .x((_, i) => xScale(i))
      .y0((d) => MID_Y + d)
      .y1((d) => MID_Y - d)
      .curve(d3.curveCatmullRom.alpha(0.55));

    const topLineGenerator = d3
      .line<number>()
      .x((_, i) => xScale(i))
      .y((d) => MID_Y - d)
      .curve(d3.curveCatmullRom.alpha(0.55));

    const bottomLineGenerator = d3
      .line<number>()
      .x((_, i) => xScale(i))
      .y((d) => MID_Y + d)
      .curve(d3.curveCatmullRom.alpha(0.55));

    const smoothed = new Array<number>(POINT_COUNT).fill(0.45);
    const maxAmp = SVG_HEIGHT / 2 - 2.2;
    let rafId = 0;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
        document.documentElement.classList.contains('kage-reduced-motion'));

    const applyPaths = (values: number[]) => {
      if (areaPathRef.current) {
        d3.select(areaPathRef.current).attr('d', areaGenerator(values) || '');
      }
      if (topLinePathRef.current) {
        d3.select(topLinePathRef.current).attr('d', topLineGenerator(values) || '');
      }
      if (bottomLinePathRef.current) {
        d3.select(bottomLinePathRef.current).attr('d', bottomLineGenerator(values) || '');
      }
    };

    if (prefersReducedMotion) {
      const staticVals = Array.from({ length: POINT_COUNT }, (_, i) => {
        if (isMutedRef.current || !isSpeakingRef.current) return 0.45;
        const env = Math.sin((i / (POINT_COUNT - 1)) * Math.PI);
        return 0.8 + env * 5.2;
      });
      applyPaths(staticVals);
      return;
    }

    const renderFrame = (nowMs: number) => {
      const t = nowMs * 0.001;
      const muted = isMutedRef.current;
      const wsSpeaking = isSpeakingRef.current;
      const freqBins = !muted ? getFreqRef.current?.(uid) : null;

      let peakAudioEnergy = 0;
      if (freqBins && freqBins.length > 0) {
        const usableBins = Math.min(freqBins.length, 28);
        for (let b = 0; b < usableBins; b++) {
          if (freqBins[b] > peakAudioEnergy) peakAudioEnergy = freqBins[b];
        }
      }

      const hasRealSignal = !muted && peakAudioEnergy > 14;
      const activeSpeech = !muted && (hasRealSignal || wsSpeaking);

      for (let i = 0; i < POINT_COUNT; i++) {
        // Taper endpoints smoothly so waveform pinches into clean anchor points
        const taper = Math.pow(Math.sin((i / (POINT_COUNT - 1)) * Math.PI), 0.72);
        let target = 0.4;

        if (!muted) {
          if (hasRealSignal && freqBins && freqBins.length > 0) {
            // Map symmetric vocal spectrum across center points for balanced visual rhythm
            const centerDist = Math.abs(i - (POINT_COUNT - 1) / 2) / ((POINT_COUNT - 1) / 2);
            const binIdx = Math.min(
              freqBins.length - 1,
              Math.floor(centerDist * Math.min(freqBins.length - 1, 20))
            );
            const secondaryIdx = Math.min(freqBins.length - 1, binIdx + (i % 3));
            const rawVal = (freqBins[binIdx] * 0.68 + freqBins[secondaryIdx] * 0.32) / 255;
            const boosted = Math.min(1, Math.pow(rawVal * 1.38, 1.05));
            target = (0.85 + boosted * (maxAmp - 0.85)) * (0.28 + taper * 0.72);
          } else if (wsSpeaking) {
            // Organic speech cadence driven by real WebSocket voice activity state
            const phase = t * 9.2 + uidSeed * 19.3 + i * 0.68;
            const modulation =
              0.52 +
              0.28 * Math.sin(phase) +
              0.2 * Math.cos(phase * 1.73 + i * 0.41);
            const syllablePulse = 0.65 + 0.35 * Math.sin(t * 4.4 + uidSeed * 7.1);
            const norm = Math.max(0.12, Math.min(1, modulation * syllablePulse));
            target = (0.9 + norm * (maxAmp * 0.88)) * (0.25 + taper * 0.75);
          } else {
            // Subtle mic-live idle breathing floor
            target = 0.55 + Math.sin(t * 2.2 + i * 0.5 + uidSeed * 10) * 0.22 * taper;
          }
        }

        const lerpRate = activeSpeech ? 0.34 : 0.16;
        smoothed[i] = smoothed[i] + (target - smoothed[i]) * lerpRate;
      }

      applyPaths(smoothed);
      rafId = window.requestAnimationFrame(renderFrame);
    };

    rafId = window.requestAnimationFrame(renderFrame);
    return () => {
      if (rafId) window.cancelAnimationFrame(rafId);
    };
  }, [uid, uidSeed]);

  const activeNow = isSpeaking && !isMuted;
  const mutedColor = '#524B58';

  return (
    <div
      className={`w-full max-w-[84px] h-6 flex items-center justify-center ${className}`}
      aria-label={
        isMuted
          ? 'Microphone muted'
          : activeNow
            ? 'Speaking audio waveform active'
            : 'Microphone ready'
      }
    >
      <svg
        viewBox={`0 0 ${SVG_WIDTH} ${SVG_HEIGHT}`}
        className="w-full h-full overflow-visible block"
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id={gradStrokeId} x1="0%" y1="0%" x2="100%" y2="0%">
            {isMuted ? (
              <>
                <stop offset="0%" stopColor={mutedColor} stopOpacity="0.4" />
                <stop offset="50%" stopColor={mutedColor} stopOpacity="0.55" />
                <stop offset="100%" stopColor={mutedColor} stopOpacity="0.4" />
              </>
            ) : activeNow ? (
              <>
                <stop offset="0%" stopColor={isHost ? '#FBBF24' : '#6D28D9'} />
                <stop offset="50%" stopColor="#34D399" />
                <stop offset="100%" stopColor="#C0263D" />
              </>
            ) : (
              <>
                <stop offset="0%" stopColor="#6D28D9" stopOpacity="0.45" />
                <stop offset="50%" stopColor="#A7A0AA" stopOpacity="0.55" />
                <stop offset="100%" stopColor="#C0263D" stopOpacity="0.45" />
              </>
            )}
          </linearGradient>
          <linearGradient id={gradFillId} x1="0%" y1="0%" x2="100%" y2="0%">
            {isMuted ? (
              <stop offset="0%" stopColor={mutedColor} stopOpacity="0.08" />
            ) : activeNow ? (
              <>
                <stop offset="0%" stopColor="#6D28D9" stopOpacity="0.32" />
                <stop offset="50%" stopColor="#34D399" stopOpacity="0.42" />
                <stop offset="100%" stopColor="#C0263D" stopOpacity="0.32" />
              </>
            ) : (
              <stop offset="0%" stopColor="#6D28D9" stopOpacity="0.1" />
            )}
          </linearGradient>
        </defs>

        <path ref={areaPathRef} fill={`url(#${gradFillId})`} stroke="none" />
        <path
          ref={topLinePathRef}
          fill="none"
          stroke={`url(#${gradStrokeId})`}
          strokeWidth={activeNow ? 1.5 : 1}
          strokeLinecap="round"
        />
        <path
          ref={bottomLinePathRef}
          fill="none"
          stroke={`url(#${gradStrokeId})`}
          strokeWidth={activeNow ? 1.15 : 0.75}
          strokeLinecap="round"
          opacity={activeNow ? 0.85 : 0.45}
        />
      </svg>
    </div>
  );
};
