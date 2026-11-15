import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, BookOpen, Compass, Eye, Library, Star, Upload } from 'lucide-react';
import { KageImage } from './KageImage';
import { INKVERSE_HERO_SLIDES } from '../lib/inkverseAssets';
import { formatCompactNumber } from '../lib/formatters';

export interface InkverseMangaItem {
  id: number;
  canonicalId: number;
  anilistId: number | null;
  malId: number | null;
  mangadexId: string | null;
  slug: string;
  title: string;
  titleEnglish: string | null;
  titleRomaji: string;
  titleNative: string | null;
  altTitles: string[];
  synopsis: string;
  coverImageUrl: string;
  coverQuality: string;
  coverWidth?: number | null;
  coverHeight?: number | null;
  bannerImageUrl?: string | null;
  format: string;
  status: string;
  releaseYear: number | null;
  volumesCount: number | null;
  chaptersCount: number | null;
  score: number | null;
  averageScore100: number | null;
  scoreSource: string;
  popularity: number;
  trending: number;
  readCount: number;
  isColor: boolean;
  originalLanguage: string;
  availableLanguages: string[];
  latestChapterNumber: string | null;
  latestChapterAt: string | null;
  externalReaderUrl: string | null;
  providerUrl: string | null;
  uploadedByUid?: string | null;
  isOriginalUpload?: boolean;
  moderationStatus?: string;
  hasInAppChapters?: boolean;
  inAppChapterCount?: number;
  genres: string[];
  authors: { id: number; name: string; role: string }[];
  characters?: { id?: number | null; name: string; role?: string; imageUrl?: string | null }[];
}

export const InkverseSubnav: React.FC<{
  active: 'dashboard' | 'browse' | 'my-manga' | 'studio';
}> = ({ active }) => {
  const tabs = [
    { id: 'dashboard', label: 'INKVERSE Home', to: '/inkverse', icon: Compass },
    { id: 'browse', label: 'Browse All', to: '/inkverse/browse', icon: BookOpen },
    { id: 'my-manga', label: 'My Manga', to: '/inkverse/my-manga', icon: Library },
    { id: 'studio', label: 'Upload Studio', to: '/inkverse/studio', icon: Upload },
  ] as const;

  return (
    <nav
      aria-label="INKVERSE Navigation"
      className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar"
    >
      {tabs.map((t) => {
        const Icon = t.icon;
        const isActive = active === t.id;
        return (
          <Link
            key={t.id}
            to={t.to}
            className={`min-h-[40px] px-4 rounded-xl text-xs font-semibold inline-flex items-center gap-2 whitespace-nowrap shrink-0 transition-all kage-press border ${
              isActive
                ? 'bg-[#C0263D] border-[#C0263D] text-white shadow-[0_0_20px_rgba(192,38,61,0.35)]'
                : 'bg-[#141116] border-white/10 text-[#A7A0AA] hover:text-[#F5F1F2] hover:border-white/25'
            }`}
          >
            <Icon className="w-3.5 h-3.5" />
            <span>{t.label}</span>
          </Link>
        );
      })}
    </nav>
  );
};

export const MangaPosterCard: React.FC<{
  manga: InkverseMangaItem;
  showSubtitle?: boolean;
}> = ({ manga, showSubtitle = false }) => {
  const verifiedBadge =
    manga.coverQuality === '4K' || manga.coverQuality === 'HD' ? manga.coverQuality : null;
  const inAppCount = Number(manga.inAppChapterCount || 0);

  return (
    <Link
      to={`/inkverse/manga/${manga.id}`}
      className="group flex flex-col rounded-2xl bg-[#141116] border border-white/[0.08] hover:border-[#C0263D]/55 overflow-hidden transition-all duration-200 hover:shadow-[0_14px_32px_rgba(0,0,0,0.65)] kage-press"
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden bg-[#09080B]">
        <KageImage
          strictArtwork
          src={manga.coverImageUrl}
          alt={manga.title}
          fallbackLabel={manga.title}
          className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.05]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#141116] via-[#141116]/40 to-transparent"
        />

        {verifiedBadge && (
          <span
            className={`absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md text-[10px] font-bold tracking-wider uppercase border backdrop-blur-md ${
              verifiedBadge === '4K'
                ? 'bg-[#6D28D9]/85 border-violet-300/40 text-white'
                : 'bg-[#09080B]/85 border-white/20 text-[#F5F1F2]'
            }`}
          >
            {verifiedBadge}
          </span>
        )}
      </div>

      <div className="p-3 flex flex-col flex-1 justify-between gap-2">
        <div className="space-y-1">
          <h3 className="text-xs sm:text-sm font-bold text-[#F5F1F2] group-hover:text-white line-clamp-2 leading-snug">
            {manga.title}
          </h3>
          {(showSubtitle || inAppCount > 0 || manga.isOriginalUpload) && (
            <p className="text-[11px] text-[#A7A0AA] truncate font-mono-num">
              {manga.isOriginalUpload ? 'Original' : manga.format}
              {inAppCount > 0 ? ` · ${inAppCount} ch in-app` : manga.releaseYear ? ` · ${manga.releaseYear}` : ''}
            </p>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-[11px] font-mono-num text-[#A7A0AA] pt-0.5">
          {typeof manga.score === 'number' && manga.score > 0 ? (
            <span className="inline-flex items-center gap-1 text-[#F5F1F2] font-semibold">
              <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" />
              <span>{manga.score.toFixed(1)}</span>
            </span>
          ) : (
            <span className="text-[#A7A0AA]/80">
              {manga.isOriginalUpload ? 'Creator' : 'Unrated'}
            </span>
          )}

          <span
            className="inline-flex items-center gap-1 text-[#A7A0AA]"
            title="Verified KAGE reader views"
          >
            <Eye className="w-3.5 h-3.5 text-[#A7A0AA]/80 shrink-0" />
            <span>{formatCompactNumber(manga.readCount || 0)}</span>
          </span>
        </div>
      </div>
    </Link>
  );
};

export const InkverseHeroBanner: React.FC = () => {
  const [activeSlide, setActiveSlide] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused) return;
    const timer = setInterval(() => {
      setActiveSlide((prev) => (prev + 1) % INKVERSE_HERO_SLIDES.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [paused]);

  const slide = INKVERSE_HERO_SLIDES[activeSlide];

  return (
    <section
      aria-label="INKVERSE Showcase"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      className="relative rounded-3xl overflow-hidden bg-[#09080B] border border-[#C0263D]/30 shadow-[0_0_60px_rgba(192,38,61,0.14)]"
    >
      {/* Atmospheric Crimson + Violet Lighting */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -left-16 w-96 h-96 rounded-full bg-[#C0263D]/22 blur-[90px]"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-24 right-0 w-96 h-96 rounded-full bg-[#6D28D9]/24 blur-[95px]"
      />

      <div className="relative z-10 grid grid-cols-1 md:grid-cols-12 items-stretch min-h-[260px] lg:aspect-[16/5]">
        {/* Left Artwork (~40% on Desktop = 5/12 cols) */}
        <div className="md:col-span-5 relative min-h-[190px] sm:min-h-[240px] md:min-h-full overflow-hidden bg-[#141116]">
          <img
            key={slide.id}
            src={slide.artworkUrl}
            alt={slide.artworkAlt}
            className="w-full h-full object-cover transition-opacity duration-500"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 bg-gradient-to-t md:bg-gradient-to-r from-transparent via-[#09080B]/25 to-[#09080B]"
          />
        </div>

        {/* Right Content (~60% on Desktop = 7/12 cols) */}
        <div className="md:col-span-7 p-6 sm:p-8 lg:px-12 lg:py-9 flex flex-col justify-center gap-3.5 relative">
          <div className="space-y-1">
            <p className="text-xs font-bold tracking-[0.26em] text-[#C0263D] uppercase">
              {slide.kicker}
            </p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-[#F5F1F2] text-balance">
              {slide.title}
            </h1>
            <p className="text-base sm:text-xl font-bold bg-gradient-to-r from-[#F5F1F2] via-[#F5F1F2] to-[#C0263D] bg-clip-text text-transparent">
              {slide.subtitle}
            </p>
          </div>

          <p className="text-xs sm:text-sm text-[#A7A0AA] max-w-xl leading-relaxed">
            {slide.description}
          </p>

          <div className="pt-1 flex flex-wrap items-center justify-between gap-4">
            <Link
              to={slide.targetHref}
              className="min-h-[44px] px-6 py-2.5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2.5 shadow-[0_0_28px_rgba(192,38,61,0.48)] transition-all kage-press whitespace-nowrap shrink-0"
            >
              <BookOpen className="w-4 h-4" />
              <span>{slide.ctaLabel}</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            {/* 3 Carousel Indicators */}
            <div className="flex items-center gap-2" role="tablist" aria-label="Hero showcase slides">
              {INKVERSE_HERO_SLIDES.map((s, idx) => (
                <button
                  key={s.id}
                  type="button"
                  role="tab"
                  aria-selected={activeSlide === idx}
                  aria-label={`Showcase slide ${idx + 1}`}
                  onClick={() => setActiveSlide(idx)}
                  className={`h-2 rounded-full transition-all cursor-pointer ${
                    activeSlide === idx
                      ? 'w-7 bg-[#C0263D] shadow-[0_0_10px_rgba(192,38,61,0.75)]'
                      : 'w-2 bg-white/25 hover:bg-white/45'
                  }`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
