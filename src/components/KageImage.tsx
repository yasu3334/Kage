import React, { useEffect, useState } from 'react';
import { Film, Sparkles } from 'lucide-react';
import { KAGE_ASSETS, resolveAssetUrl } from '../lib/assets';

interface KageImageProps {
  src?: string | null;
  alt: string;
  className?: string;
  fallbackLabel?: string;
  /**
   * When true, never substitutes a default unrelated anime image when `src` is empty or fails.
   * Renders a clean, title-matched dark KAGE placeholder instead.
   */
  strictArtwork?: boolean;
  /**
   * When true, loads image eagerly with high fetch priority (for above-the-fold hero banners).
   */
  priority?: boolean;
}

export const KageImage: React.FC<KageImageProps> = ({
  src,
  alt,
  className = '',
  fallbackLabel,
  strictArtwork = false,
  priority = false,
}) => {
  const [failed, setFailed] = useState(false);
  const [retryWithFallback, setRetryWithFallback] = useState(false);

  useEffect(() => {
    setFailed(false);
    setRetryWithFallback(false);
  }, [src]);

  const resolved = strictArtwork
    ? src
      ? KAGE_ASSETS[src] || src
      : ''
    : resolveAssetUrl(src);

  const currentSrc = resolved;

  if (failed || !currentSrc) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-gradient-to-br from-[#1C1720] via-[#141116] to-[#09080B] text-[#A7A0AA] p-3 text-center select-none ${className}`}
        role="img"
        aria-label={alt}
      >
        {strictArtwork ? (
          <Film className="w-5 h-5 text-[#A7A0AA]/60 mb-1.5 shrink-0" />
        ) : (
          <Sparkles className="w-5 h-5 text-[#C0263D] mb-1.5 opacity-80 shrink-0" />
        )}
        <span className="text-[11px] font-medium line-clamp-2 text-[#F5F1F2]/80">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={currentSrc}
      alt={alt}
      referrerPolicy="no-referrer"
      loading={priority ? 'eager' : 'lazy'}
      fetchPriority={priority ? 'high' : 'auto'}
      decoding={priority ? 'sync' : 'async'}
      onError={() => {
        if (!strictArtwork && !retryWithFallback && resolved && !resolved.startsWith('/assets/')) {
          setRetryWithFallback(true);
        } else {
          setFailed(true);
        }
      }}
      className={className}
    />
  );
};
