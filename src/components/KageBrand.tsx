import React from 'react';
import { Crown, Shield, ShieldCheck } from 'lucide-react';
import { KAGE_LOGO_URL } from '../lib/assets';

interface KageLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showSubtitle?: boolean;
  centered?: boolean;
  className?: string;
}

/**
 * Renders the authentic KAGE brand wordmark from the user's design
 * featuring real Zenitsu Agatsuma perched on the diagonal leg of the "K".
 */
export const KageLogo: React.FC<KageLogoProps> = ({
  size = 'md',
  showSubtitle = false,
  centered = false,
  className = '',
}) => {
  const heightClass =
    size === 'sm'
      ? 'h-6 sm:h-6.5'
      : size === 'md'
        ? 'h-6 sm:h-7 lg:h-7.5'
        : size === 'lg'
          ? 'h-10 sm:h-12'
          : 'h-16 sm:h-24 md:h-28';

  return (
    <div
      className={`flex flex-col ${
        centered ? 'items-center text-center' : 'items-start'
      } select-none ${className}`}
    >
      <img
        src={KAGE_LOGO_URL}
        alt="KAGE"
        className={`${heightClass} w-auto object-contain block`}
        draggable={false}
      />
      {showSubtitle && (
        <span
          className={`text-[#B8B1BC] font-medium leading-none mt-1 whitespace-nowrap ${
            size === 'xl'
              ? 'text-xs sm:text-base tracking-[0.34em] uppercase mt-2 self-center'
              : 'text-[9px] sm:text-[10px] tracking-[0.12em]'
          }`}
        >
          The Anime Universe
        </span>
      )}
    </div>
  );
};

interface OwnerBadgeProps {
  role?: string | null;
  size?: 'xs' | 'sm' | 'md';
  showTitle?: boolean;
}

/**
 * Unmistakable Sovereign Owner / Admin / Moderator badge rendered across KAGE
 * so everyone in the community immediately recognizes the Founder & Owner.
 */
export const OwnerBadge: React.FC<OwnerBadgeProps> = ({
  role,
  size = 'xs',
  showTitle = false,
}) => {
  if (!role || role === 'user') return null;

  if (role === 'owner') {
    const padding =
      size === 'md'
        ? 'px-3 py-1 text-xs gap-1.5'
        : size === 'sm'
          ? 'px-2 py-0.5 text-[11px] gap-1'
          : 'px-1.5 py-0.5 text-[10px] gap-1';

    return (
      <span
        className={`inline-flex items-center font-bold uppercase tracking-wider rounded-md bg-gradient-to-r from-amber-500/25 via-[#C0263D]/30 to-amber-500/25 border border-amber-400/70 text-amber-300 shadow-[0_0_14px_rgba(251,191,36,0.22)] whitespace-nowrap shrink-0 ${padding}`}
        title="Founder & Sovereign Owner of KAGE"
      >
        <Crown
          className={`${
            size === 'md' ? 'w-3.5 h-3.5' : 'w-3 h-3'
          } text-amber-400 fill-amber-400 shrink-0`}
        />
        <span>{showTitle ? 'FOUNDER & OWNER OF KAGE' : 'OWNER'}</span>
      </span>
    );
  }

  if (role === 'admin') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#C0263D]/20 border border-[#C0263D]/60 text-[10px] font-bold uppercase tracking-wider text-rose-300 whitespace-nowrap shrink-0">
        <ShieldCheck className="w-3 h-3 text-[#C0263D]" />
        <span>ADMIN</span>
      </span>
    );
  }

  if (role === 'moderator') {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-[#6D28D9]/20 border border-[#6D28D9]/60 text-[10px] font-bold uppercase tracking-wider text-violet-300 whitespace-nowrap shrink-0">
        <Shield className="w-3 h-3 text-[#6D28D9]" />
        <span>MOD</span>
      </span>
    );
  }

  return null;
};
