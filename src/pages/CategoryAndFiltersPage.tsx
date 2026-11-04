import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  ChevronRight,
  Filter,
  Loader2,
  RefreshCw,
  Search,
  SlidersHorizontal,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import {
  ALL_ANIME_GENRES,
  REALMS_CATEGORY_SECTIONS,
  REALMS_DISCOVERY_COLLECTIONS,
  resolveRealmDefinition,
  type AnimeGenreMeta,
} from '../lib/genres';
import { KageImage } from '../components/KageImage';
import {
  AnimePosterCard,
  PopularNowBanner,
  getAnimeRouteId,
  type RealmsAnimeItem,
} from '../components/RealmsComponents';
import { formatCompactNumber } from '../lib/formatters';

const DEMOGRAPHIC_GENRES = new Set(['Shounen', 'Seinen', 'Shoujo']);
const THEME_GENRES = new Set([
  'Isekai',
  'Mecha',
  'Cyberpunk',
  'Music',
  'Historical',
  'Family',
  'Dark Fantasy',
  'Martial Arts',
  'Military',
  'Super Power',
  'School',
  'Mythology',
  'Psychological',
]);

function getGenreGroup(genreName: string): 'core' | 'theme' | 'demographic' {
  if (DEMOGRAPHIC_GENRES.has(genreName)) return 'demographic';
  if (THEME_GENRES.has(genreName)) return 'theme';
  return 'core';
}

/* ============================================================================
   1. ALL GENRES & REALMS DIRECTORY (/filters)
   ============================================================================ */
export const AnimeFiltersPage: React.FC = () => {
  const navigate = useNavigate();
  const [genresList, setGenresList] = useState<(AnimeGenreMeta & { animeCount?: number })[]>(
    ALL_ANIME_GENRES
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [groupFilter, setGroupFilter] = useState<'all' | 'core' | 'theme' | 'demographic'>('all');

  useEffect(() => {
    let active = true;
    apiFetch<{ items: (AnimeGenreMeta & { animeCount?: number })[] }>('/api/anime/genres')
      .then((res) => {
        if (active && Array.isArray(res.items) && res.items.length >= 20) {
          setGenresList(res.items);
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const filteredGenres = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return genresList.filter((item) => {
      if (groupFilter !== 'all' && getGenreGroup(item.genre) !== groupFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.genre.toLowerCase().includes(q) || item.subtitle.toLowerCase().includes(q)
      );
    });
  }, [genresList, searchQuery, groupFilter]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-lg text-[#F5F1F2] hover:bg-white/5 cursor-pointer"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#F5F1F2]">
              Anime Filters
            </h1>
            <p className="text-xs text-[#A7A0AA] hidden sm:block">
              Explore {genresList.length} anime genres, themes &amp; curated collections
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-64">
            <Search className="w-4 h-4 text-[#A7A0AA] absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Find a genre (e.g., Romance, Mecha)..."
              className="w-full min-h-[42px] rounded-xl bg-[#141116] border border-white/12 pl-10 pr-8 text-xs sm:text-sm text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#A7A0AA] hover:text-white cursor-pointer"
                aria-label="Clear search"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <select
            aria-label="Filter genre group"
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value as any)}
            className="min-h-[42px] px-3 rounded-xl bg-[#141116] border border-white/12 text-xs font-semibold text-[#F5F1F2] shrink-0 cursor-pointer"
          >
            <option value="all">All ({genresList.length})</option>
            <option value="core">Core</option>
            <option value="theme">Themes</option>
            <option value="demographic">Demographics</option>
          </select>
        </div>
      </div>

      {filteredGenres.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#141116] border border-white/8 text-center space-y-3">
          <p className="text-sm text-[#A7A0AA]">No anime genres matched &ldquo;{searchQuery}&rdquo;.</p>
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setGroupFilter('all');
            }}
            className="min-h-[40px] px-4 rounded-xl bg-[#C0263D] text-white text-xs font-semibold cursor-pointer"
          >
            Show All Genres
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredGenres.map((item) => (
            <Link
              key={item.slug || item.genre}
              to={`/realms/genre/${item.slug || encodeURIComponent(item.genre)}`}
              className="group relative h-44 sm:h-52 rounded-2xl overflow-hidden bg-[#141116] border border-white/10 hover:border-white/25 flex items-end p-5 transition-colors"
            >
              <KageImage
                strictArtwork
                src={item.bannerUrl}
                alt={item.genre}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#09080B] via-[#09080B]/35 to-transparent" />
              <div className="relative z-10 w-full flex items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold text-[#F5F1F2] drop-shadow-sm">
                    {item.genre}
                  </h2>
                  <p className="text-xs text-[#F5F1F2]/80 mt-0.5 line-clamp-1">{item.subtitle}</p>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}

      {/* Curated Collections Section */}
      <div className="pt-2 space-y-2.5">
        <h2 className="text-sm font-bold text-[#A7A0AA] uppercase tracking-wider">
          Curated Collections
        </h2>
        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar pb-1">
          {[
            ...REALMS_DISCOVERY_COLLECTIONS,
            ...REALMS_CATEGORY_SECTIONS.filter((c) => c.kind === 'editorial' || c.kind === 'collection'),
          ].map((col) => (
            <Link
              key={col.slug}
              to={`/realms/genre/${col.slug}`}
              className="min-h-[38px] px-3.5 py-1.5 rounded-xl bg-[#141116] hover:bg-[#1C1720] border border-white/12 text-xs font-semibold text-[#F5F1F2] inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 transition-colors"
            >
              <span>{col.title}</span>
              <ChevronRight className="w-3.5 h-3.5 text-[#6D28D9]" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
};

/* ============================================================================
   2. DEDICATED GENRE / COLLECTION CATALOG PAGE (/realms/genre/:genre & /category/:genre)
      Implements Part 6: Breadcrumb, Description, Verified Count, Sorting, Filters & Pagination
   ============================================================================ */

const SORT_OPTIONS = [
  { value: 'popularity', label: 'Popularity' },
  { value: 'rating', label: 'Highest rated' },
  { value: 'newest', label: 'Recently released' },
  { value: 'oldest', label: 'Oldest released' },
  { value: 'title_asc', label: 'Title A–Z' },
];

const FORMAT_OPTIONS = [
  { value: '', label: 'All Formats' },
  { value: 'TV', label: 'TV Series' },
  { value: 'MOVIE', label: 'Movie' },
  { value: 'OVA', label: 'OVA' },
  { value: 'ONA', label: 'ONA' },
  { value: 'SPECIAL', label: 'Special' },
  { value: 'TV_SHORT', label: 'TV Short' },
];

const STATUS_OPTIONS = [
  { value: '', label: 'All Statuses' },
  { value: 'RELEASING', label: 'Currently Airing' },
  { value: 'FINISHED', label: 'Completed' },
  { value: 'NOT_YET_RELEASED', label: 'Upcoming' },
];

const MIN_RATING_OPTIONS = [
  { value: '', label: 'Any Rating' },
  { value: '85', label: '8.5+ / 10' },
  { value: '80', label: '8.0+ / 10' },
  { value: '75', label: '7.5+ / 10' },
  { value: '70', label: '7.0+ / 10' },
];

const TAG_FILTER_OPTIONS = [
  '',
  'Isekai',
  'Dark Fantasy',
  'Cyberpunk',
  'Martial Arts',
  'Military',
  'School',
  'Mythology',
  'Revenge',
  'Time Manipulation',
  'Survival',
  'Shounen',
  'Seinen',
  'Shoujo',
];

const YEAR_OPTIONS = (() => {
  const current = new Date().getFullYear() + 1;
  const years: number[] = [];
  for (let y = current; y >= 1980; y--) years.push(y);
  return years;
})();

export const CategoryDetailPage: React.FC = () => {
  const { genre = '' } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const resolvedRealm = useMemo(() => resolveRealmDefinition(genre), [genre]);

  const [sort, setSort] = useState(searchParams.get('sort') || 'popularity');
  const [year, setYear] = useState(searchParams.get('year') || '');
  const [format, setFormat] = useState(searchParams.get('format') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [minScore, setMinScore] = useState(searchParams.get('minScore') || '');
  const [tag, setTag] = useState(searchParams.get('tag') || '');
  const [filtersOpen, setFiltersOpen] = useState(false);

  const [items, setItems] = useState<RealmsAnimeItem[]>([]);
  const [page, setPage] = useState(1);
  const [pageInfo, setPageInfo] = useState<{
    currentPage: number;
    perPage: number;
    hasNextPage: boolean;
    total: number | null;
    totalEstablished: boolean;
    source: string;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  // Reset pagination when genre param changes
  useEffect(() => {
    setPage(1);
  }, [genre]);

  // Sync URL query params cleanly
  useEffect(() => {
    if (!resolvedRealm) return;
    const sp = new URLSearchParams();
    if (sort && sort !== 'popularity') sp.set('sort', sort);
    if (year) sp.set('year', year);
    if (format) sp.set('format', format);
    if (status) sp.set('status', status);
    if (minScore) sp.set('minScore', minScore);
    if (tag) sp.set('tag', tag);
    setSearchParams(sp, { replace: true });
  }, [resolvedRealm, sort, year, format, status, minScore, tag, setSearchParams]);

  const fetchCatalogPage = useCallback(
    async (targetPage: number, append: boolean, signal?: AbortSignal) => {
      if (!resolvedRealm) {
        setLoading(false);
        return;
      }

      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
        setError('');
      }

      try {
        const sp = new URLSearchParams();
        sp.set('page', String(targetPage));
        sp.set('perPage', '24');
        sp.set('sort', sort);
        if (year) sp.set('year', year);
        if (format) sp.set('format', format);
        if (status) sp.set('status', status);
        if (minScore) sp.set('minScore', minScore);
        if (tag) sp.set('tag', tag);

        const res = await apiFetch<{
          items: RealmsAnimeItem[];
          pageInfo: {
            currentPage: number;
            perPage: number;
            hasNextPage: boolean;
            total: number | null;
            totalEstablished: boolean;
            source: string;
          };
        }>(`/api/realms/genre/${encodeURIComponent(resolvedRealm.slug)}?${sp.toString()}`, {
          signal,
        });

        if (signal?.aborted) return;

        setPageInfo(res.pageInfo);
        setPage(targetPage);

        if (append) {
          setItems((prev) => {
            const seen = new Set(prev.map((p) => getAnimeRouteId(p)));
            const merged = [...prev];
            for (const nextItem of res.items || []) {
              const k = getAnimeRouteId(nextItem);
              if (!seen.has(k)) {
                seen.add(k);
                merged.push(nextItem);
              }
            }
            return merged;
          });
        } else {
          setItems(res.items || []);
        }
      } catch (err: any) {
        if (signal?.aborted || err?.name === 'AbortError') return;
        setError(err.message || 'Unable to load catalog titles.');
      } finally {
        if (!signal?.aborted) {
          setLoading(false);
          setLoadingMore(false);
        }
      }
    },
    [resolvedRealm, sort, year, format, status, minScore, tag]
  );

  useEffect(() => {
    const controller = new AbortController();
    fetchCatalogPage(1, false, controller.signal);
    return () => controller.abort();
  }, [fetchCatalogPage]);

  // Invalid genre route -> Clean Not-Found State (Part 6)
  if (!resolvedRealm) {
    return (
      <div className="p-8 sm:p-12 rounded-2xl bg-[#141116] border border-white/10 text-center space-y-4 my-4">
        <p className="text-xs font-mono-num text-[#C0263D]">404 · REALM NOT FOUND</p>
        <h1 className="text-xl sm:text-2xl font-bold text-[#F5F1F2]">
          &ldquo;{genre}&rdquo; is not a recognized anime genre or collection
        </h1>
        <p className="text-xs sm:text-sm text-[#A7A0AA] max-w-md mx-auto">
          Choose one of the verified anime genres or curated collections in KAGE Realms.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
          <Link
            to="/"
            className="min-h-[44px] px-5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-semibold inline-flex items-center"
          >
            Back to Realms
          </Link>
          <Link
            to="/filters"
            className="min-h-[44px] px-5 rounded-xl bg-[#09080B] border border-white/12 text-[#F5F1F2] text-xs font-semibold inline-flex items-center"
          >
            Browse All Genres
          </Link>
        </div>
      </div>
    );
  }

  const activeFilterCount = [year, format, status, minScore, tag].filter(Boolean).length;

  const resetFilters = () => {
    setSort('popularity');
    setYear('');
    setFormat('');
    setStatus('');
    setMinScore('');
    setTag('');
  };

  return (
    <div className="space-y-4">
      {/* Header matching KAGE Genre Page (<- Action / Romance + Filter/Sort) */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-lg text-[#F5F1F2] hover:bg-white/5 cursor-pointer shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-[#F5F1F2] tracking-tight truncate">
              {resolvedRealm.title}
            </h1>
            {pageInfo && pageInfo.total !== null && (
              <p className="text-[11px] text-[#A7A0AA] font-mono-num truncate">
                {resolvedRealm.subtitle} ·{' '}
                {pageInfo.totalEstablished
                  ? `${formatCompactNumber(pageInfo.total)} titles`
                  : `${formatCompactNumber(pageInfo.total)}+ titles`}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setFiltersOpen((v) => !v)}
            className={`min-h-[38px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap ${
              filtersOpen || activeFilterCount > 0
                ? 'bg-[#6D28D9] border-[#6D28D9] text-white'
                : 'bg-[#141116] border-white/12 text-[#F5F1F2] hover:border-white/25'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Filters</span>
            {activeFilterCount > 0 && <span>({activeFilterCount})</span>}
          </button>

          <select
            aria-label="Sort anime"
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="min-h-[38px] px-2.5 sm:px-3 rounded-xl bg-[#141116] border border-white/12 text-xs font-semibold text-[#F5F1F2] focus:outline-none focus:border-[#C0263D] cursor-pointer"
          >
            {SORT_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Featured Genre Hero Banner (e.g., Attack On Titan on Action, Your Name on Romance) */}
      {!loading && !error && items.length > 0 && activeFilterCount === 0 && sort === 'popularity' && (
        <PopularNowBanner featured={items[0]} pool={items.slice(0, 4)} hideHeader />
      )}

      {/* Expandable Filter Panel (Release Year, Format, Status, Minimum Rating, Tag) */}
      {filtersOpen && (
        <div className="p-4 rounded-2xl bg-[#141116] border border-white/12 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-[#F5F1F2] inline-flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5 text-[#6D28D9]" />
              <span>Refine {resolvedRealm.title} Catalog</span>
            </span>
            {activeFilterCount > 0 && (
              <button
                type="button"
                onClick={resetFilters}
                className="text-xs font-medium text-[#C0263D] hover:underline cursor-pointer"
              >
                Clear all filters
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <label className="space-y-1">
              <span className="block text-[11px] text-[#A7A0AA]">Release Year</span>
              <select
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full min-h-[40px] px-2.5 rounded-xl bg-[#09080B] border border-white/10 text-xs text-[#F5F1F2]"
              >
                <option value="">All Years</option>
                {YEAR_OPTIONS.map((y) => (
                  <option key={y} value={String(y)}>
                    {y}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="block text-[11px] text-[#A7A0AA]">Format</span>
              <select
                value={format}
                onChange={(e) => setFormat(e.target.value)}
                className="w-full min-h-[40px] px-2.5 rounded-xl bg-[#09080B] border border-white/10 text-xs text-[#F5F1F2]"
              >
                {FORMAT_OPTIONS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="block text-[11px] text-[#A7A0AA]">Airing Status</span>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full min-h-[40px] px-2.5 rounded-xl bg-[#09080B] border border-white/10 text-xs text-[#F5F1F2]"
              >
                {STATUS_OPTIONS.map((st) => (
                  <option key={st.value} value={st.value}>
                    {st.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1">
              <span className="block text-[11px] text-[#A7A0AA]">Minimum Rating</span>
              <select
                value={minScore}
                onChange={(e) => setMinScore(e.target.value)}
                className="w-full min-h-[40px] px-2.5 rounded-xl bg-[#09080B] border border-white/10 text-xs text-[#F5F1F2]"
              >
                {MIN_RATING_OPTIONS.map((mr) => (
                  <option key={mr.value} value={mr.value}>
                    {mr.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="space-y-1 col-span-2 sm:col-span-1">
              <span className="block text-[11px] text-[#A7A0AA]">Theme / Tag</span>
              <select
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="w-full min-h-[40px] px-2.5 rounded-xl bg-[#09080B] border border-white/10 text-xs text-[#F5F1F2]"
              >
                <option value="">Any Theme Tag</option>
                {TAG_FILTER_OPTIONS.filter(Boolean).map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>
      )}

      {/* Results State: Skeleton / Error / Empty / Responsive Grid */}
      {loading ? (
        <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3.5" aria-busy="true">
          {Array.from({ length: 18 }).map((_, idx) => (
            <div key={idx} className="space-y-2">
              <div className="aspect-[2/3] rounded-xl bg-[#141116] animate-pulse border border-white/6" />
              <div className="h-3.5 w-4/5 rounded bg-[#141116] animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-[#141116] animate-pulse" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="p-8 rounded-2xl bg-[#141116] border border-[#C0263D]/35 text-center space-y-3">
          <p className="text-sm font-medium text-[#F5F1F2]">{error}</p>
          <button
            type="button"
            onClick={() => fetchCatalogPage(1, false)}
            className="min-h-[44px] px-5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Retry</span>
          </button>
        </div>
      ) : items.length === 0 ? (
        <div className="p-10 rounded-2xl bg-[#141116] border border-white/8 text-center space-y-3">
          <p className="text-sm font-semibold text-[#F5F1F2]">
            No anime matched your filters in {resolvedRealm.title}.
          </p>
          <p className="text-xs text-[#A7A0AA]">
            Try relaxing the release year, format, or minimum score filter.
          </p>
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={resetFilters}
              className="min-h-[42px] px-5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-semibold cursor-pointer"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 gap-3.5">
            {items.map((anime) => (
              <AnimePosterCard
                key={getAnimeRouteId(anime) || anime.title}
                anime={anime}
                showSubtitle
              />
            ))}
          </div>

          {/* Server-Backed Load More Pagination */}
          {pageInfo?.hasNextPage && (
            <div className="flex flex-col items-center gap-2 pt-2">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => fetchCatalogPage(page + 1, true)}
                className="min-h-[46px] px-7 rounded-xl bg-[#141116] hover:bg-[#1C1720] disabled:opacity-60 border border-white/15 hover:border-[#C0263D] text-xs sm:text-sm font-semibold text-[#F5F1F2] inline-flex items-center gap-2 transition-colors cursor-pointer"
              >
                {loadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin text-[#C0263D]" />
                    <span>Loading more titles...</span>
                  </>
                ) : (
                  <span>Load More {resolvedRealm.title} Anime</span>
                )}
              </button>
              <span className="text-[11px] font-mono-num text-[#A7A0AA]">
                Showing {items.length} loaded titles · Page {page}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
