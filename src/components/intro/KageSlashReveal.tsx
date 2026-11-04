import React from 'react';
import { KAGE_LOGO_URL } from '../../lib/assets';

export type KageLogoRevealPhase = 'hidden' | 'crimson-line' | 'logo-reveal' | 'final-hold';

interface KageSlashRevealProps {
  phase: KageLogoRevealPhase;
}

/**
 * Scene 05 (10–13s) & Scene 06 (13–14s) — KAGE & THE ANIME UNIVERSE Brand Reveal
 *
 * Exact choreographed sequence on deep #050505 black:
 * 1. Subtle crimson energy line ignites at center
 * 2. Smooth cinematic reveal of large centered white KAGE brand mark
 * 3. Subtle diagonal light sweep across the KAGE letters
 * 4. Small amount of crimson/purple energy dissipating behind the logo into #050505
 * 5. THE ANIME UNIVERSE centered underneath in uppercase, wide letter-spacing, crisp white
 */
export const KageSlashReveal: React.FC<KageSlashRevealProps> = ({ phase }) => {
  const isVisible = phase !== 'hidden';
  const showLogo = phase === 'logo-reveal' || phase === 'final-hold';
  const isFinalHold = phase === 'final-hold';

  return (
    <div
      className={`pointer-events-none absolute inset-0 z-30 flex flex-col items-center justify-center px-6 transition-opacity duration-500 ${
        isVisible ? 'opacity-100' : 'opacity-0'
      }`}
    >
      {/* Subtle crimson & purple energy behind KAGE that dissipates cleanly during Scene 06 */}
      <div
        className={`kage-brand-reveal-halo absolute w-[min(78vw,440px)] h-[min(48vw,240px)] rounded-full blur-3xl transition-opacity duration-1000 ${
          phase === 'logo-reveal' ? 'opacity-90' : isFinalHold ? 'opacity-0' : 'opacity-45'
        }`}
      />

      <div className="relative flex flex-col items-center justify-center text-center max-w-xl w-full">
        {/* Step 1: Subtle horizontal crimson energy line */}
        <div
          className={`h-[1.5px] bg-gradient-to-r from-transparent via-[#C0263D] to-transparent transition-all duration-700 ease-out ${
            phase === 'crimson-line'
              ? 'w-56 sm:w-80 opacity-100 mb-0'
              : showLogo
                ? 'w-36 sm:w-48 opacity-0 -mb-1.5'
                : 'w-0 opacity-0'
          }`}
        />

        {/* Step 2 & 3: Large centered high-contrast white KAGE reveal + subtle light sweep */}
        <div
          className={`relative overflow-hidden py-2 transition-all duration-700 ease-out transform-gpu ${
            showLogo ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-2'
          }`}
        >
          <img
            src={KAGE_LOGO_URL}
            alt="KAGE"
            draggable={false}
            className="h-14 sm:h-20 md:h-24 w-auto object-contain block select-none"
          />

          {/* Subtle single specular light sweep across the KAGE letters */}
          {showLogo && <div className="kage-logo-sheen pointer-events-none absolute inset-0" />}
        </div>

        {/* Thin refined crimson separator beneath KAGE */}
        <div
          className={`mt-3.5 sm:mt-4 h-[1px] bg-gradient-to-r from-transparent via-[#C0263D]/85 to-transparent transition-all duration-700 ${
            isFinalHold
              ? 'w-28 sm:w-36 opacity-55'
              : showLogo
                ? 'w-44 sm:w-60 opacity-95'
                : 'w-0 opacity-0'
          }`}
        />

        {/* Step 5: THE ANIME UNIVERSE centered underneath in uppercase, wide letter-spacing, crisp white */}
        <p
          className={`mt-3.5 sm:mt-4 text-[11px] sm:text-xs md:text-sm font-semibold uppercase tracking-[0.38em] text-[#F5F1F2] transition-all duration-700 delay-200 transform-gpu ${
            showLogo ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-1.5'
          }`}
        >
          THE ANIME UNIVERSE
        </p>
      </div>
    </div>
  );
};
