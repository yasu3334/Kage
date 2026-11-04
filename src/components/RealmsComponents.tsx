import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Bookmark,
  Check,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Film,
  Info,
  Play,
  Plus,
  Star,
  Tv,
  X,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { KageImage } from './KageImage';

export interface RealmsStreamingOption {
  name: string;
  url: string;
  hostname?: string;
  accessNote?: string;
  language?: string | null;
}

export interface RealmsStreamingAvailability {
  caseType: 'B' | 'C' | 'D' | 'E';
  primaryOption: RealmsStreamingOption | null;
  verifiedOptions: RealmsStreamingOption[];
  platformMentions: string[];
  providerCatalogUrl: string | null;
  disclaimer: string;
}

export interface RealmsAnimeItem {
  canonicalId?: number;
  malId?: number | null;
  anilistId?: number | null;
  title: string;
  englishTitle?: string | null;
  romajiTitle?: string;
  nativeTitle?: string | null;
  synonyms?: string[];
  synopsis?: string;
  imageUrl: string;
  bannerUrl?: string | null;
  year?: number | null;
  format?: string | null;
  rawFormat?: string | null;
  episodes?: number | null;
  durationMins?: number | null;
  formatLabel?: string | null;
  seasonsLabel?: string | null;
  score?: number | null;
  scoreSource?: 'AniList' | 'MyAnimeList' | string;
  status?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  genres?: string[];
  tags?: { name: string; rank: number }[];
  studios?: string[];
  streaming?: RealmsStreamingOption[];
  streamingAvailability?: RealmsStreamingAvailability;
  trailerUrl?: string | null;
  trailerEmbedUrl?: string | null;
  providerUrl?: string | null;
  primaryCategory?: string | null;
  primaryCategorySlug?: string | null;
  relationType?: string;
}

export function getAnimeRouteId(anime: RealmsAnimeItem): number | string {
  if (typeof anime.canonicalId === 'number' && anime.canonicalId > 0) {
    return anime.canonicalId;
  }
  if (typeof anime.malId === 'number' && anime.malId > 0) {
    return anime.malId;
  }
  if (typeof anime.anilistId === 'number' && anime.anilistId > 0) {
    return 10_000_000 + anime.anilistId;
  }
  return 0;
}

function getTrackableAnimeId(anime: RealmsAnimeItem): number {
  const raw = Number(anime.malId || anime.canonicalId || 0);
  if (Number.isFinite(raw) && raw > 0) return raw;
  const fallback = Number(getAnimeRouteId(anime));
  return Number.isFinite(fallback) && fallback > 0 ? fallback : 0;
}

/* ============================================================================
   1. REUSABLE ANIME POSTER CARD (PART 10)
   ============================================================================ */
export const AnimePosterCard: React.FC<{
  anime: RealmsAnimeItem;
  className?: string;
  showSubtitle?: boolean;
}> = ({ anime, className = '', showSubtitle = false }) => {
  const { user, bumpTasteRevision } = useAuth();
  const navigate = useNavigate();
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [justPopped, setJustPopped] = useState(false);

  const routeId = getAnimeRouteId(anime);
  const trackId = getTrackableAnimeId(anime);
  const scoreValue =
    typeof anime.score === 'number' && anime.score > 0 ? anime.score.toFixed(1) : null;
  const secondaryTitle =
    showSubtitle &&
    anime.romajiTitle &&
    anime.romajiTitle.toLowerCase() !== anime.title.toLowerCase()
      ? anime.romajiTitle
      : null;

  const metaParts: string[] = [];
  if (anime.year) metaParts.push(String(anime.year));
  if (anime.format) {
    metaParts.push(anime.format === 'TV Series' ? 'TV' : anime.format);
  } else if (anime.episodes && anime.episodes > 0) {
    metaParts.push(`${anime.episodes} ep`);
  }

  const handleQuickBookmark = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!user) {
      navigate('/auth/login');
      return;
    }
    if (!trackId || saving) return;

    const nextSaved = !saved;
    setSaved(nextSaved);
    if (nextSaved) {
      setJustPopped(true);
      setTimeout(() => setJustPopped(false), 240);
    }
    setSaving(true);
    try {
      if (nextSaved) {
        await apiFetch('/api/me/anime', {
          method: 'POST',
          body: JSON.stringify({
            animeMalId: trackId,
            animeTitle: anime.title,
            animeImageUrl: anime.imageUrl,
            genres: anime.genres || [],
            status: 'plan_to_watch',
            score: null,
          }),
        });
      } else {
        await apiFetch(`/api/me/anime/${trackId}`, { method: 'DELETE' });
      }
      bumpTasteRevision();
    } catch {
      setSaved(!nextSaved);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Link
      to={`/anime/${routeId}`}
      className={`group block space-y-1.5 kage-press focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C0263D] rounded-xl ${className}`}
    >
      <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-[#141116] border border-white/8 group-hover:border-[#C0263D]/55 group-hover:-translate-y-0.5 transition-all duration-150">
        <KageImage
          strictArtwork
          src={anime.imageUrl}
          alt={anime.title}
          fallbackLabel={anime.title}
          className="w-full h-full object-cover group-hover:scale-[1.04] transition-transform duration-200"
        />

        {/* Quick Watchlist Action with expanded touch hitbox */}
        {trackId > 0 && (
          <button
            type="button"
            onClick={handleQuickBookmark}
            aria-label={saved ? `Remove ${anime.title} from watchlist` : `Save ${anime.title} to watchlist`}
            title={saved ? 'Saved to Watchlist' : 'Quick add to Watchlist'}
            className="absolute top-0 right-0 z-10 w-10 h-10 flex items-center justify-center cursor-pointer"
          >
            <span
              className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center backdrop-blur-md border transition-all duration-150 ${
                saved
                  ? 'bg-[#C0263D] border-[#C0263D] text-white opacity-100'
                  : 'bg-[#09080B]/75 border-white/15 text-[#F5F1F2]/90 hover:bg-[#C0263D] hover:border-[#C0263D] hover:text-white opacity-85 sm:opacity-0 sm:group-hover:opacity-100'
              } ${justPopped ? 'kage-heart-pop' : ''}`}
            >
              {saved ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                <Bookmark className="w-3.5 h-3.5" />
              )}
            </span>
          </button>
        )}

        <div className="absolute inset-x-0 bottom-0 h-14 bg-gradient-to-t from-[#09080B]/95 via-[#09080B]/35 to-transparent pointer-events-none" />
        {scoreValue && (
          <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] font-mono-num text-[#F5F1F2] pointer-events-none">
            <span className="inline-flex items-center gap-1 drop-shadow">
              <Star className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" />
              <span className="font-semibold">{scoreValue}</span>
            </span>
          </div>
        )}
      </div>

      <div className="px-0.5 space-y-0.5">
        <h4 className="text-xs sm:text-[13px] font-semibold text-[#F5F1F2] group-hover:text-[#C0263D] line-clamp-1 transition-colors leading-snug">
          {anime.title}
        </h4>
        {secondaryTitle && (
          <p className="text-[11px] text-[#A7A0AA]/80 line-clamp-1 leading-tight">
            {secondaryTitle}
          </p>
        )}
        {metaParts.length > 0 && (
          <p className="text-[11px] text-[#A7A0AA] font-mono-num line-clamp-1 leading-tight">
            {metaParts.join(' · ')}
          </p>
        )}
      </div>
    </Link>
  );
};

/* ============================================================================
   2. INDEPENDENT SINGLE-ROW HORIZONTAL ANIME CAROUSEL (PART 4)
   ============================================================================ */
export const HorizontalAnimeCarousel: React.FC<{
  title: string;
  subtitle?: string;
  kind?: string;
  seeAllTo?: string;
  items: RealmsAnimeItem[];
}> = ({ title, subtitle, kind, seeAllTo, items }) => {
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const updateScrollEdges = useCallback(() => {
    const el = scrollerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 8);
    setCanScrollRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 8);
  }, []);

  useEffect(() => {
    updateScrollEdges();
    const el = scrollerRef.current;
    if (!el) return;
    el.addEventListener('scroll', updateScrollEdges, { passive: true });
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(updateScrollEdges);
      ro.observe(el);
    }
    return () => {
      el.removeEventListener('scroll', updateScrollEdges);
      if (ro) ro.disconnect();
    };
  }, [items.length, updateScrollEdges]);

  if (!items || items.length === 0) return null;

  const scrollRow = (direction: 'left' | 'right') => {
    const el = scrollerRef.current;
    if (!el) return;
    const distance = Math.max(260, Math.round(el.clientWidth * 0.78));
    el.scrollBy({
      left: direction === 'left' ? -distance : distance,
      behavior: 'smooth',
    });
  };

  return (
    <section className="space-y-2.5" aria-label={title}>
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <h3 className="text-base sm:text-lg font-bold text-[#F5F1F2] tracking-tight">
              {title}
            </h3>
            {(kind === 'editorial' || kind === 'collection') && subtitle && (
              <span className="hidden sm:inline text-xs text-[#A7A0AA] truncate">
                · {subtitle}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <div className="hidden md:flex items-center gap-1 mr-1">
            <button
              type="button"
              disabled={!canScrollLeft}
              onClick={() => scrollRow('left')}
              className={`w-8 h-8 rounded-lg bg-[#141116] border border-white/10 flex items-center justify-center kage-press ${
                canScrollLeft
                  ? 'text-[#A7A0AA] hover:text-[#F5F1F2] hover:bg-[#1C1720] cursor-pointer'
                  : 'text-[#A7A0AA]/35 opacity-50 cursor-default'
              }`}
              aria-label={`Scroll ${title} left`}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              disabled={!canScrollRight}
              onClick={() => scrollRow('right')}
              className={`w-8 h-8 rounded-lg bg-[#141116] border border-white/10 flex items-center justify-center kage-press ${
                canScrollRight
                  ? 'text-[#A7A0AA] hover:text-[#F5F1F2] hover:bg-[#1C1720] cursor-pointer'
                  : 'text-[#A7A0AA]/35 opacity-50 cursor-default'
              }`}
              aria-label={`Scroll ${title} right`}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {seeAllTo && (
            <Link
              to={seeAllTo}
              className="min-h-[40px] px-1 inline-flex items-center gap-0.5 text-xs font-medium text-[#A7A0AA] hover:text-[#F5F1F2] transition-colors whitespace-nowrap shrink-0"
            >
              <span>See All</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </Link>
          )}
        </div>
      </div>

      {/* Single horizontal row with subtle edge-fade cues */}
      <div className="relative">
        {canScrollLeft && (
          <div className="hidden sm:block pointer-events-none absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#09080B] to-transparent z-10" />
        )}
        {canScrollRight && (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-7 sm:w-10 bg-gradient-to-l from-[#09080B] to-transparent z-10" />
        )}

        <div
          ref={scrollerRef}
          data-kage-scroll-x="true"
          className="flex flex-nowrap items-start gap-3 sm:gap-3.5 overflow-x-auto no-scrollbar snap-x snap-proximity pt-0.5 pb-1.5 cursor-grab active:cursor-grabbing select-none"
        >
          {items.map((anime) => {
            const key = getAnimeRouteId(anime) || anime.title;
            return (
              <div
                key={key}
                className="shrink-0 snap-start w-[30.5%] min-w-[104px] max-w-[146px] sm:w-[150px] sm:max-w-none md:w-[162px] lg:w-[168px]"
              >
                <AnimePosterCard anime={anime} />
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
};

export const HorizontalCarouselSkeleton: React.FC<{ label?: string }> = ({ label }) => (
  <section className="space-y-2.5" aria-busy="true">
    <div className="flex items-center justify-between">
      {label ? (
        <span className="text-base font-bold text-[#F5F1F2]/70">{label}</span>
      ) : (
        <div className="h-5 w-32 rounded bg-[#141116] animate-pulse" />
      )}
      <div className="h-4 w-14 rounded bg-[#141116] animate-pulse" />
    </div>
    <div className="flex flex-nowrap gap-3 sm:gap-3.5 overflow-hidden">
      {Array.from({ length: 6 }).map((_, idx) => (
        <div
          key={idx}
          className="shrink-0 w-[30.5%] min-w-[104px] max-w-[146px] sm:w-[150px] md:w-[162px] lg:w-[168px] space-y-2"
        >
          <div className="aspect-[2/3] rounded-xl bg-[#141116] animate-pulse border border-white/6" />
          <div className="h-3.5 w-4/5 rounded bg-[#141116] animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-[#141116] animate-pulse" />
        </div>
      ))}
    </div>
  </section>
);

/* ============================================================================
   3. HONEST STREAMING SELECTOR & AVAILABILITY MODAL (PART 12)
   ============================================================================ */
export const StreamingModal: React.FC<{
  anime: RealmsAnimeItem | null;
  onClose: () => void;
}> = ({ anime, onClose }) => {
  if (!anime) return null;

  const availability = anime.streamingAvailability;
  const verifiedOptions = availability?.verifiedOptions || anime.streaming || [];
  const mentions = availability?.platformMentions || [];
  const routeId = getAnimeRouteId(anime);

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label={`Where to watch ${anime.title}`}
    >
      <div
        className="w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl bg-[#141116] border border-white/12 p-5 sm:p-6 text-[#F5F1F2] space-y-4 max-h-[88dvh] overflow-y-auto kage-modal-enter"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 pb-3 border-b border-white/8">
          <div className="min-w-0">
            <p className="text-xs text-[#A7A0AA]">Official Streaming Availability</p>
            <h3 className="text-base sm:text-lg font-bold text-[#F5F1F2] truncate mt-0.5">
              {anime.title} {anime.year ? `(${anime.year})` : ''}
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] -mr-2 -mt-1 flex items-center justify-center rounded-lg text-[#A7A0AA] hover:text-white cursor-pointer"
            aria-label="Close streaming dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {verifiedOptions.length > 0 ? (
          <div className="space-y-2.5">
            <p className="text-xs text-[#A7A0AA]">
              Verified official distributor links reported by metadata provider:
            </p>
            <div className="space-y-2">
              {verifiedOptions.map((opt) => (
                <a
                  key={`${opt.name}-${opt.url}`}
                  href={opt.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[54px] px-4 py-3 rounded-xl bg-[#09080B] hover:bg-[#1C1720] border border-white/12 hover:border-[#C0263D]/60 flex items-center justify-between gap-3 kage-press"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Tv className="w-4 h-4 text-[#C0263D] shrink-0" />
                      <span className="text-sm font-semibold text-[#F5F1F2]">
                        Watch on {opt.name}
                      </span>
                      {opt.language && (
                        <span className="text-[11px] text-[#A7A0AA]">· {opt.language}</span>
                      )}
                    </div>
                    {opt.accessNote && (
                      <p className="text-[11px] text-[#A7A0AA] mt-0.5 pl-6">{opt.accessNote}</p>
                    )}
                  </div>
                  <ExternalLink className="w-4 h-4 text-[#A7A0AA] shrink-0" />
                </a>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-xl bg-[#09080B] border border-white/10 space-y-2">
            <p className="text-xs sm:text-sm font-medium text-[#F5F1F2]">
              Direct regional streaming links are not verified for this title yet.
            </p>
            {mentions.length > 0 ? (
              <p className="text-xs text-[#A7A0AA]">
                Upstream metadata lists <span className="text-[#F5F1F2]">{mentions.join(', ')}</span>,
                but did not supply a verified title-specific URL. Check those services directly in your region.
              </p>
            ) : (
              <p className="text-xs text-[#A7A0AA]">
                KAGE never links to unlicensed streams or fabricated URLs. Check licensed services such as Crunchyroll, Netflix, or HIDIVE in your country.
              </p>
            )}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2.5 pt-1">
          {anime.trailerUrl && (
            <a
              href={anime.trailerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] px-4 rounded-xl bg-[#09080B] hover:bg-[#1C1720] border border-white/12 text-xs font-semibold text-[#F5F1F2] inline-flex items-center gap-2 kage-press"
            >
              <Film className="w-3.5 h-3.5 text-[#6D28D9]" />
              <span>Watch Official Trailer</span>
              <ExternalLink className="w-3 h-3 text-[#A7A0AA]" />
            </a>
          )}

          {anime.providerUrl && (
            <a
              href={anime.providerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="min-h-[42px] px-4 rounded-xl bg-[#09080B] hover:bg-[#1C1720] border border-white/12 text-xs font-medium text-[#A7A0AA] hover:text-[#F5F1F2] inline-flex items-center gap-1.5 kage-press"
            >
              <span>Official Catalog Listing</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          )}

          <Link
            to={`/anime/${routeId}`}
            onClick={onClose}
            className="min-h-[42px] px-4 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-semibold inline-flex items-center gap-1.5 kage-press ml-auto"
          >
            <Info className="w-3.5 h-3.5" />
            <span>Anime Details</span>
          </Link>
        </div>

        <p className="text-[11px] text-[#A7A0AA]/80 leading-relaxed pt-1 border-t border-white/8">
          {availability?.disclaimer ||
            'External links open outside KAGE. Regional licensing and subscription requirements vary by country.'}
        </p>
      </div>
    </div>
  );
};

/* ============================================================================
   4. POPULAR NOW FEATURED HERO BANNER (PART 3)
   ============================================================================ */
export const PopularNowBanner: React.FC<{
  featured: RealmsAnimeItem;
  pool?: RealmsAnimeItem[];
  allGenresCount?: number;
  hideHeader?: boolean;
}> = ({ featured, pool = [], hideHeader = false }) => {
  const { user, bumpTasteRevision } = useAuth();
  const navigate = useNavigate();

  const slides = (pool.length > 0 ? pool : [featured]).slice(0, 5);
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [streamingTarget, setStreamingTarget] = useState<RealmsAnimeItem | null>(null);
  const [trailerTarget, setTrailerTarget] = useState<RealmsAnimeItem | null>(null);
  const [savedIds, setSavedIds] = useState<Record<number, boolean>>({});
  const touchStartXRef = useRef<number | null>(null);

  // Reset activeIndex when featured changes (e.g. switching genre pages)
  useEffect(() => {
    setActiveIndex(0);
  }, [featured?.canonicalId, featured?.malId]);

  const isModalOpen = Boolean(streamingTarget || trailerTarget);

  // Auto-advance hero showcase every 6.5s unless hovered, touched, modal open, or single slide
  useEffect(() => {
    if (slides.length <= 1 || paused || isModalOpen) return;
    if (
      typeof window !== 'undefined' &&
      (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ||
        document.documentElement.classList.contains('kage-reduced-motion'))
    ) {
      return;
    }
    const timer = window.setInterval(() => {
      setActiveIndex((prev) => (prev + 1) % slides.length);
    }, 6500);
    return () => window.clearInterval(timer);
  }, [slides.length, paused, isModalOpen, activeIndex]);

  const current = slides[activeIndex] || featured;
  const routeId = getAnimeRouteId(current);
  const trackId = getTrackableAnimeId(current);
  const isSaved = Boolean(trackId && savedIds[trackId]);
  const bannerSrc = current.bannerUrl || current.imageUrl;

  const goPrevSlide = () => {
    setActiveIndex((prev) => (prev - 1 + slides.length) % slides.length);
  };

  const goNextSlide = () => {
    setActiveIndex((prev) => (prev + 1) % slides.length);
  };

  const handleHeroBookmark = async () => {
    if (!user) {
      navigate('/auth/login');
      return;
    }
    if (!trackId) return;
    const next = !isSaved;
    setSavedIds((prev) => ({ ...prev, [trackId]: next }));
    try {
      if (next) {
        await apiFetch('/api/me/anime', {
          method: 'POST',
          body: JSON.stringify({
            animeMalId: trackId,
            animeTitle: current.title,
            animeImageUrl: current.imageUrl,
            genres: current.genres || [],
            status: 'plan_to_watch',
            score: null,
          }),
        });
      } else {
        await apiFetch(`/api/me/anime/${trackId}`, { method: 'DELETE' });
      }
      bumpTasteRevision();
    } catch {
      setSavedIds((prev) => ({ ...prev, [trackId]: !next }));
    }
  };

  const metaItems: string[] = [];
  if (current.seasonsLabel || current.formatLabel) {
    metaItems.push((current.seasonsLabel || current.formatLabel)!);
  } else if (current.episodes) {
    metaItems.push(`${current.episodes} episodes`);
  }

  return (
    <section className="space-y-2.5" aria-label={hideHeader ? current.title : 'Popular Now'}>
      {!hideHeader && (
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-bold text-[#F5F1F2] tracking-tight">
            Popular Now
          </h2>

          {slides.length > 1 && (
            <div className="flex items-center gap-1.5" role="tablist" aria-label="Featured anime">
              {slides.map((item, idx) => {
                const active = idx === activeIndex;
                return (
                  <button
                    key={getAnimeRouteId(item) || idx}
                    type="button"
                    role="tab"
                    aria-selected={active}
                    aria-label={`Show ${item.title}`}
                    onClick={() => setActiveIndex(idx)}
                    className={`relative h-1.5 rounded-full overflow-hidden transition-all duration-200 cursor-pointer ${
                      active ? 'w-7 bg-white/25' : 'w-2 bg-white/25 hover:bg-white/50'
                    }`}
                  >
                    {active && (
                      <span
                        key={`${activeIndex}-${paused || isModalOpen ? 'paused' : 'run'}`}
                        className={`absolute inset-0 bg-[#C0263D] rounded-full ${
                          paused || isModalOpen ? '' : 'kage-hero-progress'
                        }`}
                      />
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
        onTouchStart={(e) => {
          setPaused(true);
          touchStartXRef.current = e.touches[0]?.clientX ?? null;
        }}
        onTouchEnd={(e) => {
          setPaused(false);
          const startX = touchStartXRef.current;
          const endX = e.changedTouches[0]?.clientX ?? null;
          touchStartXRef.current = null;
          if (startX !== null && endX !== null && slides.length > 1) {
            const deltaX = endX - startX;
            if (Math.abs(deltaX) > 44) {
              if (deltaX < 0) goNextSlide();
              else goPrevSlide();
            }
          }
        }}
        className="group/hero relative rounded-2xl overflow-hidden bg-[#141116] border border-white/10 min-h-[225px] sm:min-h-[305px] lg:min-h-[355px] flex items-end select-none"
      >
        <KageImage
          key={String(routeId)}
          strictArtwork
          priority
          src={bannerSrc}
          alt={current.title}
          fallbackLabel={current.title}
          className="absolute inset-0 w-full h-full object-cover object-center transition-transform duration-300 group-hover/hero:scale-[1.015]"
        />
        {/* Measured multi-stop dark scrim for WCAG legibility */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#09080B] via-[#09080B]/55 to-black/15" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#09080B]/88 via-[#09080B]/30 to-transparent" />

        {/* Desktop Prev / Next Slide Arrows on Hover */}
        {slides.length > 1 && (
          <>
            <button
              type="button"
              onClick={goPrevSlide}
              aria-label="Previous featured anime"
              className="hidden md:flex absolute left-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-[#09080B]/70 hover:bg-[#09080B] border border-white/15 text-[#F5F1F2] items-center justify-center opacity-0 group-hover/hero:opacity-100 transition-opacity cursor-pointer kage-press"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={goNextSlide}
              aria-label="Next featured anime"
              className="hidden md:flex absolute right-3 top-1/2 -translate-y-1/2 z-20 w-9 h-9 rounded-full bg-[#09080B]/70 hover:bg-[#09080B] border border-white/15 text-[#F5F1F2] items-center justify-center opacity-0 group-hover/hero:opacity-100 transition-opacity cursor-pointer kage-press"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </>
        )}

        <div
          key={`caption-${routeId}`}
          className="relative z-10 w-full p-4 sm:p-6 lg:p-8 flex flex-col sm:flex-row sm:items-end justify-between gap-3 sm:gap-5 kage-page-enter"
        >
          <div className="space-y-1 max-w-2xl min-w-0">
            <Link to={`/anime/${routeId}`} className="group inline-block max-w-full">
              <h1 className="text-lg sm:text-3xl lg:text-4xl font-bold text-[#F5F1F2] group-hover:text-white tracking-tight leading-tight line-clamp-2">
                {current.title}{' '}
                {current.year ? (
                  <span className="font-normal text-[#F5F1F2]/85">({current.year})</span>
                ) : null}
              </h1>
            </Link>

            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-[#A7A0AA] font-mono-num">
              {metaItems.map((m) => (
                <span key={m} className="whitespace-nowrap">
                  {m}
                </span>
              ))}
              {typeof current.score === 'number' && current.score > 0 && (
                <span className="inline-flex items-center gap-1 text-[#F5F1F2] whitespace-nowrap">
                  {metaItems.length > 0 && (
                    <span className="text-[#A7A0AA] mr-1" aria-hidden="true">
                      ·
                    </span>
                  )}
                  <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
                  <span className="font-semibold">{current.score.toFixed(1)}/10</span>
                </span>
              )}
              {current.genres && current.genres.length > 0 && (
                <span className="hidden md:inline font-sans text-[#F5F1F2]/80">
                  · {current.genres.slice(0, 3).join(' · ')}
                </span>
              )}
            </div>

            {current.synopsis && (
              <p className="hidden sm:line-clamp-2 text-xs sm:text-sm text-[#F5F1F2]/80 pt-1 max-w-xl leading-relaxed">
                {current.synopsis}
              </p>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setStreamingTarget(current)}
              className="min-h-[44px] px-4 sm:px-5 py-2 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 shadow-lg kage-press whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>Watch Now</span>
            </button>

            {current.trailerEmbedUrl ? (
              <button
                type="button"
                onClick={() => setTrailerTarget(current)}
                aria-label={`Play ${current.title} trailer`}
                className="min-h-[44px] px-3.5 sm:px-4 py-2 rounded-xl bg-[#141116]/90 hover:bg-[#1C1720] border border-white/15 text-[#F5F1F2] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 kage-press whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Film className="w-3.5 h-3.5 text-[#6D28D9]" />
                <span className="hidden sm:inline">Trailer</span>
              </button>
            ) : current.trailerUrl ? (
              <a
                href={current.trailerUrl}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`Watch ${current.title} trailer`}
                className="min-h-[44px] px-3.5 sm:px-4 py-2 rounded-xl bg-[#141116]/90 hover:bg-[#1C1720] border border-white/15 text-[#F5F1F2] text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 kage-press whitespace-nowrap shrink-0"
              >
                <Film className="w-3.5 h-3.5 text-[#6D28D9]" />
                <span className="hidden sm:inline">Trailer</span>
              </a>
            ) : null}

            {trackId > 0 && (
              <button
                type="button"
                onClick={handleHeroBookmark}
                aria-label={isSaved ? 'Remove from Watchlist' : 'Add to Watchlist'}
                title={isSaved ? 'Saved to Watchlist' : 'Add to Watchlist'}
                className={`min-h-[44px] min-w-[44px] sm:px-3.5 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-1.5 kage-press whitespace-nowrap shrink-0 cursor-pointer ${
                  isSaved
                    ? 'bg-[#6D28D9]/25 border-[#6D28D9] text-[#F5F1F2]'
                    : 'bg-[#141116]/90 hover:bg-[#1C1720] border-white/15 text-[#F5F1F2]'
                }`}
              >
                {isSaved ? <Check className="w-4 h-4 text-emerald-400" /> : <Plus className="w-4 h-4" />}
                <span className="hidden lg:inline">{isSaved ? 'Saved' : 'Watchlist'}</span>
              </button>
            )}

            <Link
              to={`/anime/${routeId}`}
              className="hidden md:inline-flex min-h-[44px] px-4 py-2 rounded-xl bg-[#141116]/90 hover:bg-[#1C1720] border border-white/15 text-[#F5F1F2] text-xs sm:text-sm font-semibold items-center justify-center kage-press whitespace-nowrap shrink-0"
            >
              Details
            </Link>
          </div>
        </div>
      </div>

      {streamingTarget && (
        <StreamingModal anime={streamingTarget} onClose={() => setStreamingTarget(null)} />
      )}

      {trailerTarget && trailerTarget.trailerEmbedUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/88 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setTrailerTarget(null)}
          role="dialog"
          aria-modal="true"
          aria-label={`${trailerTarget.title} Official Trailer`}
        >
          <div
            className="w-full max-w-3xl rounded-2xl bg-[#141116] border border-white/15 overflow-hidden shadow-2xl kage-modal-enter"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
              <div className="min-w-0">
                <p className="text-[11px] text-[#A7A0AA]">Official Trailer Preview</p>
                <h3 className="text-sm sm:text-base font-bold text-[#F5F1F2] truncate">
                  {trailerTarget.title}
                </h3>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link
                  to={`/anime/${getAnimeRouteId(trailerTarget)}`}
                  onClick={() => setTrailerTarget(null)}
                  className="min-h-[36px] px-3 rounded-lg bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-semibold inline-flex items-center gap-1.5 kage-press"
                >
                  <span>Full Page</span>
                </Link>
                <button
                  type="button"
                  onClick={() => setTrailerTarget(null)}
                  className="min-h-[36px] min-w-[36px] rounded-lg bg-[#09080B] border border-white/10 flex items-center justify-center text-[#A7A0AA] hover:text-white cursor-pointer"
                  aria-label="Close trailer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="aspect-video w-full bg-black">
              <iframe
                src={trailerTarget.trailerEmbedUrl}
                title={`${trailerTarget.title} Official Trailer`}
                className="w-full h-full"
                allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

