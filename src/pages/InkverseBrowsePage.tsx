import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Loader2,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  InkverseSubnav,
  MangaPosterCard,
  type InkverseMangaItem,
} from '../components/InkverseComponents';

const MANGA_GENRE_OPTIONS = [
  'Action',
  'Adventure',
  'Fantasy',
  'Drama',
  'Romance',
  'Sci-Fi',
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

const SORT_OPTIONS = [
  { value: 'popularity', label: 'Most Popular' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'updated', label: 'Recently Updated' },
  { value: 'newest', label: 'Newest First' },
  { value: 'alphabetical', label: 'Alphabetical (A–Z)' },
  { value: 'trending', label: 'Trending Now' },
] as const;

const LANGUAGE_OPTIONS = [
  { value: '', label: 'All Languages' },
  { value: 'en', label: 'English (EN)' },
  { value: 'ja', label: 'Japanese (JA)' },
  { value: 'ko', label: 'Korean (KO)' },
  { value: 'zh', label: 'Chinese (ZH)' },
  { value: 'es', label: 'Spanish (ES)' },
  { value: 'fr', label: 'French (FR)' },
];

export const InkverseBrowsePage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [q, setQ] = useState(searchParams.get('q') || '');
  const [genre, setGenre] = useState(searchParams.get('genre') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [year, setYear] = useState(searchParams.get('year') || '');
  const [minRating, setMinRating] = useState(searchParams.get('minRating') || '');
  const [color, setColor] = useState<'color' | 'bw' | ''>(
    (searchParams.get('color') as 'color' | 'bw') || ''
  );
  const [language, setLanguage] = useState(searchParams.get('language') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'popularity');
  const [inAppOnly, setInAppOnly] = useState(searchParams.get('inAppOnly') === '1');
  const [originalsOnly, setOriginalsOnly] = useState(searchParams.get('originalsOnly') === '1');
  const [filtersOpen, setFiltersOpen] = useState(
    Boolean(
      searchParams.get('status') ||
        searchParams.get('year') ||
        searchParams.get('minRating') ||
        searchParams.get('color') ||
        searchParams.get('language')
    )
  );

  const [items, setItems] = useState<InkverseMangaItem[]>([]);
  const [pageInfo, setPageInfo] = useState({
    currentPage: 1,
    perPage: 20,
    hasNextPage: false,
    total: 0,
  });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const incomingQ = searchParams.get('q') || '';
    const incomingGenre = searchParams.get('genre') || '';
    const incomingSort = searchParams.get('sort') || 'popularity';
    const incomingInApp = searchParams.get('inAppOnly') === '1';
    const incomingOriginals = searchParams.get('originalsOnly') === '1';
    setQ(incomingQ);
    setGenre(incomingGenre);
    setSort(incomingSort);
    setInAppOnly(incomingInApp);
    setOriginalsOnly(incomingOriginals);
  }, [searchParams]);

  const buildQueryString = useCallback(
    (page = 1) => {
      const p = new URLSearchParams();
      if (q.trim()) p.set('q', q.trim());
      if (genre) p.set('genre', genre);
      if (status) p.set('status', status);
      if (year) p.set('year', year);
      if (minRating) p.set('minRating', minRating);
      if (color) p.set('color', color);
      if (language) p.set('language', language);
      if (inAppOnly) p.set('inAppOnly', '1');
      if (originalsOnly) p.set('originalsOnly', '1');
      if (sort && sort !== 'popularity') p.set('sort', sort);
      if (page > 1) p.set('page', String(page));
      return p;
    },
    [q, genre, status, year, minRating, color, language, inAppOnly, originalsOnly, sort]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const params = buildQueryString(1);
      setSearchParams(params, { replace: true });
      setLoading(true);
      setError('');

      apiFetch<{
        items: InkverseMangaItem[];
        pageInfo: { currentPage: number; perPage: number; hasNextPage: boolean; total: number };
      }>(`/api/inkverse/browse?${params.toString()}&perPage=20`, {
        signal: controller.signal,
      })
        .then((res) => {
          if (controller.signal.aborted) return;
          setItems(Array.isArray(res.items) ? res.items : []);
          if (res.pageInfo) setPageInfo(res.pageInfo);
        })
        .catch((err: any) => {
          if (controller.signal.aborted || err?.name === 'AbortError') return;
          setError(err?.message || 'Failed to load manga catalog.');
        })
        .finally(() => {
          if (!controller.signal.aborted) setLoading(false);
        });
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [buildQueryString, setSearchParams]);

  const handleLoadMore = async () => {
    if (loadingMore || !pageInfo.hasNextPage) return;
    const nextPage = pageInfo.currentPage + 1;
    setLoadingMore(true);
    try {
      const params = buildQueryString(nextPage);
      const res = await apiFetch<{
        items: InkverseMangaItem[];
        pageInfo: { currentPage: number; perPage: number; hasNextPage: boolean; total: number };
      }>(`/api/inkverse/browse?${params.toString()}&perPage=20`);

      setItems((prev) => {
        const seen = new Set(prev.map((m) => m.id));
        const merged = [...prev];
        for (const item of res.items || []) {
          if (!seen.has(item.id)) {
            seen.add(item.id);
            merged.push(item);
          }
        }
        return merged;
      });
      if (res.pageInfo) setPageInfo(res.pageInfo);
    } catch {
      // keep existing results
    } finally {
      setLoadingMore(false);
    }
  };

  const resetAllFilters = () => {
    setQ('');
    setGenre('');
    setStatus('');
    setYear('');
    setMinRating('');
    setColor('');
    setLanguage('');
    setInAppOnly(false);
    setOriginalsOnly(false);
    setSort('popularity');
  };

  const currentYear = new Date().getFullYear();
  const yearsList = useMemo(
    () => Array.from({ length: 40 }, (_, i) => currentYear + 1 - i),
    [currentYear]
  );

  const hasActiveFilters = Boolean(
    q.trim() ||
      genre ||
      status ||
      year ||
      minRating ||
      color ||
      language ||
      inAppOnly ||
      originalsOnly ||
      sort !== 'popularity'
  );

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate('/inkverse')}
            aria-label="Back to INKVERSE dashboard"
            className="min-h-[42px] min-w-[42px] -ml-2 rounded-xl flex items-center justify-center text-[#F5F1F2] hover:bg-white/[0.06] cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#F5F1F2] tracking-tight">
              INKVERSE Library
            </h1>
            <p className="text-xs text-[#A7A0AA] font-mono-num">
              {genre ? `${genre} Manga` : 'Complete Catalog'} · {pageInfo.total} series indexed
            </p>
          </div>
        </div>

        <InkverseSubnav active="browse" />
      </div>

      {/* Search + Sort + Filter Toggle Bar */}
      <div className="flex flex-col sm:flex-row gap-2.5">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#A7A0AA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search manga titles, authors, artists, characters..."
            aria-label="Search manga catalog"
            className="w-full min-h-[44px] rounded-xl bg-[#141116] border border-white/12 focus:border-[#C0263D] pl-10 pr-9 text-xs sm:text-sm text-[#F5F1F2] focus:outline-none transition-colors"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label="Clear manga search"
              className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center text-[#A7A0AA] hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <select
          aria-label="Sort manga"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
          className="min-h-[44px] px-3.5 rounded-xl bg-[#141116] border border-white/12 text-xs sm:text-sm font-medium text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
        >
          {SORT_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              Sort: {opt.label}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => setInAppOnly((v) => !v)}
          aria-pressed={inAppOnly}
          className={`min-h-[44px] px-3.5 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-colors whitespace-nowrap ${
            inAppOnly
              ? 'bg-[#C0263D] border-[#C0263D] text-white shadow-[0_0_16px_rgba(192,38,61,0.35)]'
              : 'bg-[#141116] border-white/12 text-[#A7A0AA] hover:text-[#F5F1F2]'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Read In-App Only</span>
        </button>

        <button
          type="button"
          onClick={() => setOriginalsOnly((v) => !v)}
          aria-pressed={originalsOnly}
          className={`min-h-[44px] px-3.5 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-colors whitespace-nowrap ${
            originalsOnly
              ? 'bg-[#6D28D9] border-[#6D28D9] text-white shadow-[0_0_16px_rgba(109,40,217,0.35)]'
              : 'bg-[#141116] border-white/12 text-[#A7A0AA] hover:text-[#F5F1F2]'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>Creator Originals</span>
        </button>

        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          aria-expanded={filtersOpen}
          className={`min-h-[44px] px-4 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer transition-colors ${
            filtersOpen || status || year || minRating || color || language
              ? 'bg-[#1C1720] border-[#C0263D] text-[#F5F1F2]'
              : 'bg-[#141116] border-white/12 text-[#A7A0AA] hover:text-[#F5F1F2]'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span>Filters</span>
        </button>
      </div>

      {/* Horizontal Genre Strip */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => setGenre('')}
          className={`min-h-[36px] px-3.5 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
            !genre
              ? 'bg-[#C0263D] border-[#C0263D] text-white'
              : 'bg-[#141116] border-white/10 text-[#A7A0AA] hover:text-[#F5F1F2]'
          }`}
        >
          All Genres
        </button>
        {MANGA_GENRE_OPTIONS.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => setGenre(genre === g ? '' : g)}
            className={`min-h-[36px] px-3.5 rounded-xl border text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
              genre.toLowerCase() === g.toLowerCase()
                ? 'bg-[#C0263D] border-[#C0263D] text-white'
                : 'bg-[#141116] border-white/10 text-[#A7A0AA] hover:text-[#F5F1F2]'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Expanded Filters Grid */}
      {filtersOpen && (
        <div className="p-4 sm:p-5 rounded-2xl bg-[#141116] border border-white/10 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <label className="space-y-1 text-xs text-[#A7A0AA]">
            <span className="font-semibold text-[#F5F1F2] block">Publication Status</span>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-2.5 text-xs text-[#F5F1F2]"
            >
              <option value="">Any Status</option>
              <option value="RELEASING">Ongoing</option>
              <option value="FINISHED">Completed</option>
              <option value="HIATUS">On Hiatus</option>
            </select>
          </label>

          <label className="space-y-1 text-xs text-[#A7A0AA]">
            <span className="font-semibold text-[#F5F1F2] block">Release Year</span>
            <select
              value={year}
              onChange={(e) => setYear(e.target.value)}
              className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-2.5 text-xs text-[#F5F1F2]"
            >
              <option value="">Any Year</option>
              {yearsList.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs text-[#A7A0AA]">
            <span className="font-semibold text-[#F5F1F2] block">Minimum Rating</span>
            <select
              value={minRating}
              onChange={(e) => setMinRating(e.target.value)}
              className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-2.5 text-xs text-[#F5F1F2]"
            >
              <option value="">Any Score</option>
              <option value="8.5">8.5+ Masterpiece</option>
              <option value="8">8.0+ Acclaimed</option>
              <option value="7">7.0+ Recommended</option>
            </select>
          </label>

          <label className="space-y-1 text-xs text-[#A7A0AA]">
            <span className="font-semibold text-[#F5F1F2] block">Artwork Style</span>
            <select
              value={color}
              onChange={(e) => setColor(e.target.value as 'color' | 'bw' | '')}
              className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-2.5 text-xs text-[#F5F1F2]"
            >
              <option value="">Color &amp; B&amp;W</option>
              <option value="color">Full Color (Webtoon/Manhwa)</option>
              <option value="bw">Black &amp; White Manga</option>
            </select>
          </label>

          <label className="space-y-1 text-xs text-[#A7A0AA]">
            <span className="font-semibold text-[#F5F1F2] block">Language</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-2.5 text-xs text-[#F5F1F2]"
            >
              {LANGUAGE_OPTIONS.map((l) => (
                <option key={l.value} value={l.value}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          {hasActiveFilters && (
            <div className="col-span-full flex justify-end pt-1">
              <button
                type="button"
                onClick={resetAllFilters}
                className="min-h-[36px] px-3.5 rounded-xl bg-[#09080B] border border-white/15 text-xs font-semibold text-[#A7A0AA] hover:text-[#F5F1F2] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset All Filters</span>
              </button>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="p-4 rounded-2xl bg-[#141116] border border-rose-500/35 text-xs text-rose-300 flex items-center justify-between gap-3">
          <span>{error}</span>
          <button
            type="button"
            onClick={resetAllFilters}
            className="px-3 py-1.5 rounded-lg bg-[#C0263D] text-white font-semibold cursor-pointer"
          >
            Reset
          </button>
        </div>
      )}

      {/* Results Grid (5 cards per desktop row, 3 tablet, 2 mobile) */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
          {Array.from({ length: 10 }).map((_, i) => (
            <div
              key={i}
              className="rounded-2xl bg-[#141116] border border-white/8 overflow-hidden"
            >
              <div className="aspect-[2/3] bg-white/[0.04] animate-pulse" />
              <div className="p-3 space-y-2">
                <div className="h-4 w-3/4 rounded bg-white/[0.06] animate-pulse" />
                <div className="h-3 w-1/2 rounded bg-white/[0.05] animate-pulse" />
              </div>
            </div>
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="py-12 px-5 rounded-3xl bg-[#141116] border border-white/10 text-center space-y-3">
          <p className="text-base font-bold text-[#F5F1F2]">No Manga Matched Your Filters</p>
          <p className="text-xs sm:text-sm text-[#A7A0AA] max-w-md mx-auto">
            Try clearing one of your active genre, year, or language filters, or search for any
            manga title, author, or character.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetAllFilters}
              className="min-h-[42px] px-5 rounded-xl bg-[#C0263D] text-white text-xs font-semibold cursor-pointer"
            >
              Clear All Filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
            {items.map((manga) => (
              <MangaPosterCard key={manga.id} manga={manga} showSubtitle />
            ))}
          </div>

          {pageInfo.hasNextPage && (
            <div className="flex justify-center pt-3">
              <button
                type="button"
                disabled={loadingMore}
                onClick={handleLoadMore}
                className="min-h-[44px] px-6 rounded-xl bg-[#141116] hover:bg-[#1C1720] border border-white/15 text-xs sm:text-sm font-semibold text-[#F5F1F2] inline-flex items-center gap-2 disabled:opacity-60 cursor-pointer"
              >
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{loadingMore ? 'Loading Manga...' : 'Load More Manga'}</span>
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
