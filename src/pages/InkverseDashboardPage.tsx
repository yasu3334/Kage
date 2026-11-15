import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Bookmark,
  BookOpen,
  Compass,
  Flame,
  Heart,
  Play,
  Rocket,
  Sparkles,
  Swords,
  Theater,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { KageImage } from '../components/KageImage';
import {
  INKVERSE_BW_FALLBACK_PREVIEW,
  INKVERSE_CATEGORY_ARTWORK,
} from '../lib/inkverseAssets';
import {
  InkverseHeroBanner,
  InkverseSubnav,
  MangaPosterCard,
  type InkverseMangaItem,
} from '../components/InkverseComponents';

interface ContinueReadingState {
  manga: InkverseMangaItem;
  chapterId: number | null;
  chapterNumber: string;
  chapterTitle: string;
  pageNumber: number;
  totalPages: number;
  progressPercent: number;
  readingMode: string;
  previewImageUrl: string | null;
  isBookmarked: boolean;
  lastReadAt: string;
}

const PRIMARY_CATEGORIES = [
  { name: 'Action', slug: 'action', icon: Swords, accent: 'crimson' },
  { name: 'Adventure', slug: 'adventure', icon: Compass, accent: 'violet' },
  { name: 'Fantasy', slug: 'fantasy', icon: Sparkles, accent: 'crimson' },
  { name: 'Drama', slug: 'drama', icon: Theater, accent: 'violet' },
  { name: 'Romance', slug: 'romance', icon: Heart, accent: 'crimson' },
  { name: 'Sci-Fi', slug: 'sci-fi', icon: Rocket, accent: 'violet' },
] as const;

const SECONDARY_CATEGORIES = [
  'Comedy',
  'Mystery',
  'Thriller',
  'Horror',
  'Supernatural',
  'Sports',
  'Historical',
  'Martial Arts',
  'Psychological',
  'Slice of Life',
];

export const InkverseDashboardPage: React.FC = () => {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [trending, setTrending] = useState<InkverseMangaItem[]>([]);
  const [readableInApp, setReadableInApp] = useState<InkverseMangaItem[]>([]);
  const [trendingMode, setTrendingMode] = useState<'in_app' | 'all'>('in_app');
  const [continueReading, setContinueReading] = useState<ContinueReadingState | null>(null);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [bookmarkSaving, setBookmarkSaving] = useState(false);

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        trending: InkverseMangaItem[];
        readableInApp?: InkverseMangaItem[];
        continueReading: ContinueReadingState | null;
        categoryCounts: Record<string, number>;
      }>('/api/inkverse/dashboard');
      const trendingList = Array.isArray(res.trending) ? res.trending : [];
      const inAppList = Array.isArray(res.readableInApp) ? res.readableInApp : [];
      setTrending(trendingList);
      setReadableInApp(inAppList);
      if (inAppList.length === 0 && trendingList.length > 0) {
        setTrendingMode('all');
      }
      setContinueReading(res.continueReading || null);
      setCategoryCounts(res.categoryCounts || {});
    } catch (err) {
      console.error('INKVERSE dashboard error:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard, user?.uid]);

  const handleToggleBookmarkContinue = async () => {
    if (!continueReading) return;
    if (!user) {
      navigate('/auth/login?redirect=%2Finkverse');
      return;
    }
    setBookmarkSaving(true);
    try {
      const nextVal = !continueReading.isBookmarked;
      await apiFetch('/api/inkverse/my-manga', {
        method: 'POST',
        body: JSON.stringify({
          mangaId: continueReading.manga.id,
          isBookmarked: nextVal,
        }),
      });
      setContinueReading((prev) => (prev ? { ...prev, isBookmarked: nextVal } : prev));
    } catch {
      // ignore
    } finally {
      setBookmarkSaving(false);
    }
  };

  const resumeUrl = continueReading
    ? continueReading.chapterId
      ? `/inkverse/read/${continueReading.manga.id}/${continueReading.chapterId}?page=${continueReading.pageNumber}`
      : `/inkverse/manga/${continueReading.manga.id}`
    : '/inkverse/browse?inAppOnly=1';

  const displayedShelf =
    trendingMode === 'in_app' && readableInApp.length > 0 ? readableInApp : trending;

  return (
    <div className="space-y-8 pb-6">
      {/* Sub-navigation bar */}
      <InkverseSubnav active="dashboard" />

      {/* 2. Hero Banner */}
      <InkverseHeroBanner />

      {/* 3. Trending Manga (5 cards per desktop row) */}
      <section aria-label="Trending Manga" className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Flame className="w-5 h-5 text-[#C0263D]" />
              <h2 className="text-lg sm:text-xl font-bold text-[#F5F1F2] tracking-tight">
                {trendingMode === 'in_app' ? 'Readable In-App Manga' : 'Trending Manga'}
              </h2>
            </div>

            {readableInApp.length > 0 && (
              <div className="inline-flex items-center rounded-xl bg-[#141116] border border-white/10 p-0.5 text-xs">
                <button
                  type="button"
                  onClick={() => setTrendingMode('in_app')}
                  className={`px-3 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                    trendingMode === 'in_app'
                      ? 'bg-[#C0263D] text-white'
                      : 'text-[#A7A0AA] hover:text-[#F5F1F2]'
                  }`}
                >
                  Read In-App ({readableInApp.length})
                </button>
                <button
                  type="button"
                  onClick={() => setTrendingMode('all')}
                  className={`px-3 py-1 rounded-lg font-semibold cursor-pointer transition-colors ${
                    trendingMode === 'all'
                      ? 'bg-[#6D28D9] text-white'
                      : 'text-[#A7A0AA] hover:text-[#F5F1F2]'
                  }`}
                >
                  All Trending
                </button>
              </div>
            )}
          </div>

          <Link
            to={trendingMode === 'in_app' ? '/inkverse/browse?inAppOnly=1' : '/inkverse/browse?sort=trending'}
            className="text-xs sm:text-sm font-semibold text-[#C0263D] hover:text-rose-400 inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
          >
            <span>See All</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="rounded-2xl bg-[#141116] border border-white/8 overflow-hidden"
              >
                <div className="aspect-[2/3] bg-white/[0.04] animate-pulse" />
                <div className="p-3 space-y-2">
                  <div className="h-4 w-4/5 rounded bg-white/[0.06] animate-pulse" />
                  <div className="h-3 w-1/2 rounded bg-white/[0.05] animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        ) : displayedShelf.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#141116] border border-white/10 text-center space-y-2">
            <p className="text-sm font-semibold text-[#F5F1F2]">Catalog initializing</p>
            <p className="text-xs text-[#A7A0AA]">
              Trending manga titles are syncing with INKVERSE providers.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
            {displayedShelf.slice(0, 5).map((manga) => (
              <MangaPosterCard key={manga.id} manga={manga} />
            ))}
          </div>
        )}
      </section>

      {/* 4. Continue Reading */}
      <section aria-label="Continue Reading">
        {continueReading ? (
          <div className="rounded-3xl bg-[#141116] border border-white/10 overflow-hidden grid grid-cols-1 lg:grid-cols-12 shadow-[0_18px_45px_rgba(0,0,0,0.45)]">
            {/* Left Side: B&W Manga Page Preview + Floating Continue Reading CTA */}
            <div className="lg:col-span-6 relative min-h-[220px] sm:min-h-[270px] bg-[#09080B] overflow-hidden">
              <img
                src={
                  continueReading.previewImageUrl ||
                  INKVERSE_BW_FALLBACK_PREVIEW
                }
                alt={`${continueReading.manga.title} manga page preview`}
                className="w-full h-full object-cover grayscale contrast-125 opacity-85"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-t from-[#09080B]/90 via-transparent to-black/30"
              />
              <Link
                to={resumeUrl}
                className="absolute bottom-4 left-4 min-h-[44px] px-5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-[0_0_24px_rgba(192,38,61,0.5)] kage-press"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>Continue Reading</span>
              </Link>
            </div>

            {/* Right Side: YOUR READING + Cover + Title + Chapter + Synopsis + Actions */}
            <div className="lg:col-span-6 p-5 sm:p-7 flex flex-col justify-between gap-4">
              <div className="space-y-3">
                <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C0263D]">
                  YOUR READING
                </p>

                <div className="flex items-start gap-4">
                  <Link
                    to={`/inkverse/manga/${continueReading.manga.id}`}
                    className="w-20 sm:w-24 aspect-[2/3] rounded-xl overflow-hidden bg-[#09080B] border border-white/15 shrink-0"
                  >
                    <KageImage
                      strictArtwork
                      src={continueReading.manga.coverImageUrl}
                      alt={continueReading.manga.title}
                      className="w-full h-full object-cover"
                    />
                  </Link>

                  <div className="min-w-0 flex-1 space-y-1.5">
                    <Link
                      to={`/inkverse/manga/${continueReading.manga.id}`}
                      className="text-lg sm:text-xl font-bold text-[#F5F1F2] hover:text-[#C0263D] transition-colors line-clamp-1 block"
                    >
                      {continueReading.manga.title}
                    </Link>
                    <p className="text-xs sm:text-sm font-semibold text-[#F5F1F2]/90 font-mono-num">
                      Chapter {continueReading.chapterNumber}
                      {continueReading.chapterTitle ? ` — ${continueReading.chapterTitle}` : ''}
                    </p>
                    <p className="text-xs text-[#A7A0AA] line-clamp-2 leading-relaxed">
                      {continueReading.manga.synopsis}
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-mono-num text-[#A7A0AA]">
                    <span>
                      Page {continueReading.pageNumber} of {continueReading.totalPages}
                    </span>
                    <span className="text-[#F5F1F2] font-semibold">
                      {continueReading.progressPercent}% complete
                    </span>
                  </div>
                  <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-[#C0263D] to-[#6D28D9]"
                      style={{ width: `${continueReading.progressPercent}%` }}
                    />
                  </div>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 pt-1">
                <Link
                  to={resumeUrl}
                  className="min-h-[44px] px-5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 kage-press"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Resume Reading</span>
                </Link>

                <button
                  type="button"
                  disabled={bookmarkSaving}
                  onClick={handleToggleBookmarkContinue}
                  className={`min-h-[44px] px-4 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors kage-press ${
                    continueReading.isBookmarked
                      ? 'bg-[#6D28D9]/20 border-[#6D28D9] text-violet-200'
                      : 'bg-[#09080B] border-white/15 text-[#F5F1F2] hover:border-white/30'
                  }`}
                >
                  <Bookmark
                    className={`w-4 h-4 ${continueReading.isBookmarked ? 'fill-violet-300 text-violet-300' : ''}`}
                  />
                  <span>{continueReading.isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="rounded-3xl bg-[#141116] border border-white/10 overflow-hidden grid grid-cols-1 lg:grid-cols-12">
            <div className="lg:col-span-5 relative min-h-[190px] sm:min-h-[220px] bg-[#09080B] overflow-hidden">
              <img
                src={INKVERSE_BW_FALLBACK_PREVIEW}
                alt="Monochrome manga ink spread preview"
                className="w-full h-full object-cover grayscale contrast-125 opacity-80"
              />
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 bg-gradient-to-r from-transparent via-[#09080B]/30 to-[#141116]"
              />
            </div>

            <div className="lg:col-span-7 p-6 sm:p-8 flex flex-col justify-center gap-3">
              <p className="text-[11px] font-bold tracking-[0.2em] uppercase text-[#C0263D]">
                YOUR READING
              </p>
              <h2 className="text-xl sm:text-2xl font-bold text-[#F5F1F2] text-balance">
                No Active Reading Session Yet
              </h2>
              <p className="text-xs sm:text-sm text-[#A7A0AA] leading-relaxed max-w-xl">
                Open any chapter in INKVERSE and your current manga, chapter, exact page, and
                progress bar automatically save here for instant resume across devices.
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Link
                  to="/inkverse/browse"
                  className="min-h-[44px] px-5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 kage-press"
                >
                  <BookOpen className="w-4 h-4" />
                  <span>Start Your First Manga</span>
                </Link>
                {!user && (
                  <Link
                    to="/auth/login?redirect=%2Finkverse"
                    className="min-h-[44px] px-4 rounded-xl bg-[#09080B] border border-white/15 hover:border-white/30 text-[#F5F1F2] text-xs sm:text-sm font-semibold inline-flex items-center kage-press"
                  >
                    Sign In to Sync History
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* 5. Manga Categories (6 Primary Cards + Full Genre Filter Strip) */}
      <section aria-label="Manga Categories" className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-lg sm:text-xl font-bold text-[#F5F1F2] tracking-tight">
            Manga Categories
          </h2>

          <Link
            to="/inkverse/browse"
            className="text-xs sm:text-sm font-semibold text-[#C0263D] hover:text-rose-400 inline-flex items-center gap-1 whitespace-nowrap shrink-0 transition-colors"
          >
            <span>Browse All</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3.5">
          {PRIMARY_CATEGORIES.map((cat) => {
            const Icon = cat.icon;
            const artUrl = INKVERSE_CATEGORY_ARTWORK[cat.slug];
            const isCrimson = cat.accent === 'crimson';
            const titleCount = categoryCounts[cat.slug] || 0;

            return (
              <Link
                key={cat.slug}
                to={`/inkverse/browse?genre=${encodeURIComponent(cat.name)}`}
                className={`group relative aspect-[3/4] rounded-2xl overflow-hidden bg-[#141116] border transition-all duration-200 kage-press ${
                  isCrimson
                    ? 'border-white/10 hover:border-[#C0263D]/70 hover:shadow-[0_0_24px_rgba(192,38,61,0.22)]'
                    : 'border-white/10 hover:border-[#6D28D9]/70 hover:shadow-[0_0_24px_rgba(109,40,217,0.24)]'
                }`}
              >
                <img
                  src={artUrl}
                  alt={`${cat.name} manga genre artwork`}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
                <div
                  aria-hidden="true"
                  className={`absolute inset-0 bg-gradient-to-t ${
                    isCrimson
                      ? 'from-[#09080B] via-[#09080B]/55 to-[#C0263D]/15'
                      : 'from-[#09080B] via-[#09080B]/55 to-[#6D28D9]/18'
                  }`}
                />

                <div className="relative z-10 h-full p-3.5 flex flex-col justify-between">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center backdrop-blur-md border ${
                      isCrimson
                        ? 'bg-[#C0263D]/25 border-[#C0263D]/50 text-rose-200'
                        : 'bg-[#6D28D9]/25 border-[#6D28D9]/50 text-violet-200'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                  </div>

                  <div>
                    <h3 className="text-sm sm:text-base font-bold text-[#F5F1F2]">{cat.name}</h3>
                    <p className="text-[11px] text-[#A7A0AA] font-mono-num">
                      {titleCount > 0 ? `${titleCount} series` : 'Explore genre'}
                    </p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        {/* All Supported Extended Manga Genres */}
        <div className="flex items-center gap-2 overflow-x-auto pt-1 pb-1 no-scrollbar">
          {SECONDARY_CATEGORIES.map((genreName) => (
            <Link
              key={genreName}
              to={`/inkverse/browse?genre=${encodeURIComponent(genreName)}`}
              className="min-h-[38px] px-3.5 rounded-xl bg-[#141116] hover:bg-[#1C1720] border border-white/10 hover:border-[#6D28D9]/60 text-xs font-medium text-[#A7A0AA] hover:text-[#F5F1F2] inline-flex items-center whitespace-nowrap shrink-0 transition-colors kage-press"
            >
              {genreName}
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
};
