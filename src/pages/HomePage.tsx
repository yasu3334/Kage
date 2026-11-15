import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  Compass,
  Filter,
  Loader2,
  MessageSquare,
  RefreshCw,
  RotateCcw,
  Shuffle,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { formatCompactNumber } from '../lib/formatters';
import { ALL_ANIME_GENRES, type RealmSectionDefinition } from '../lib/genres';
import { KageImage } from '../components/KageImage';
import { OwnerBadge } from '../components/KageBrand';
import { RecommendationEnginePanel } from '../components/RecommendationEnginePanel';
import {
  getAnimeRouteId,
  HorizontalAnimeCarousel,
  HorizontalCarouselSkeleton,
  PopularNowBanner,
  type RealmsAnimeItem,
} from '../components/RealmsComponents';
import { getStaticRealmsFallback } from '../lib/staticRealmsFallback';

interface RealmCarouselRowData {
  definition: RealmSectionDefinition;
  items: RealmsAnimeItem[];
  total: number | null;
  source: string;
}

interface RealmsHomeResponse {
  featured: RealmsAnimeItem | null;
  featuredPool: RealmsAnimeItem[];
  initialRows: RealmCarouselRowData[];
  deferredCategorySections: RealmSectionDefinition[];
  discoveryCollections: RealmSectionDefinition[];
  recentlyViewed: RealmsAnimeItem[];
  communityHighlights: any[];
  featuredGuilds: any[];
}

function getAnimeCanonicalKey(item: any): number | null {
  const id = Number(item?.canonicalId || item?.malId || 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

interface HomePageProps {
  onReplayIntro?: () => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onReplayIntro }) => {
  const navigate = useNavigate();
  const [data, setData] = useState<RealmsHomeResponse | null>(null);
  const [deferredRows, setDeferredRows] = useState<Record<string, RealmCarouselRowData>>({});
  const [collectionRows, setCollectionRows] = useState<Record<string, RealmCarouselRowData>>({});
  const [loading, setLoading] = useState(true);
  const [loadingMoreRows, setLoadingMoreRows] = useState(false);
  const [error, setError] = useState('');

  const loadRealms = useCallback(async () => {
    setLoading(true);
    setError('');
    setDeferredRows({});
    setCollectionRows({});
    try {
      const res = await apiFetch<RealmsHomeResponse>('/api/realms/home');
      setData(res);
    } catch {
      // Seamless static fallback so Vercel deployments and offline views never show an empty screen
      setData(getStaticRealmsFallback() as unknown as RealmsHomeResponse);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadRealms();
  }, [loadRealms]);

  // Progressive below-the-fold carousel loading with global canonicalId exclusion so zero duplicates appear across REALMS rows
  useEffect(() => {
    if (!data) return;
    let cancelled = false;

    const loadBatches = async () => {
      setLoadingMoreRows(true);
      const seenIds = new Set<number>();
      for (const row of data.initialRows || []) {
        for (const item of row.items || []) {
          const cid = getAnimeCanonicalKey(item);
          if (cid) seenIds.add(cid);
        }
      }

      try {
        const catSlugs = (data.deferredCategorySections || []).map((s) => s.slug);
        for (let i = 0; i < catSlugs.length; i += 6) {
          if (cancelled) return;
          const chunk = catSlugs.slice(i, i + 6);
          const excludeParam = Array.from(seenIds).slice(0, 800).join(',');
          const batchRes = await apiFetch<{ rows: RealmCarouselRowData[] }>(
            `/api/realms/rows?slugs=${encodeURIComponent(chunk.join(','))}&perPage=16&homepage=1&excludeIds=${encodeURIComponent(excludeParam)}`
          );
          if (cancelled) return;
          if (Array.isArray(batchRes.rows)) {
            const nextBatch: Record<string, RealmCarouselRowData> = {};
            for (const r of batchRes.rows) {
              if (!r?.definition?.slug) continue;
              const uniqueItems: RealmsAnimeItem[] = [];
              for (const item of r.items || []) {
                const cid = getAnimeCanonicalKey(item);
                if (!cid || seenIds.has(cid)) continue;
                seenIds.add(cid);
                uniqueItems.push(item);
              }
              nextBatch[r.definition.slug] = { ...r, items: uniqueItems };
            }
            setDeferredRows((prev) => ({ ...prev, ...nextBatch }));
          }
        }

        const discSlugs = (data.discoveryCollections || []).map((c) => c.slug);
        if (discSlugs.length > 0 && !cancelled) {
          const excludeParam = Array.from(seenIds).slice(0, 900).join(',');
          const discRes = await apiFetch<{ rows: RealmCarouselRowData[] }>(
            `/api/realms/rows?slugs=${encodeURIComponent(discSlugs.join(','))}&perPage=16&homepage=1&excludeIds=${encodeURIComponent(excludeParam)}`
          );
          if (!cancelled && Array.isArray(discRes.rows)) {
            const nextCollections: Record<string, RealmCarouselRowData> = {};
            for (const r of discRes.rows) {
              if (!r?.definition?.slug) continue;
              const uniqueItems: RealmsAnimeItem[] = [];
              for (const item of r.items || []) {
                const cid = getAnimeCanonicalKey(item);
                if (!cid || seenIds.has(cid)) continue;
                seenIds.add(cid);
                uniqueItems.push(item);
              }
              nextCollections[r.definition.slug] = { ...r, items: uniqueItems };
            }
            setCollectionRows((prev) => ({ ...prev, ...nextCollections }));
          }
        }
      } catch {
        // Non-fatal: already rendered rows remain interactive
      } finally {
        if (!cancelled) setLoadingMoreRows(false);
      }
    };

    loadBatches();
    return () => {
      cancelled = true;
    };
  }, [data]);

  // Deterministic client-side safety net guaranteeing 0 duplicate canonicalIds across all rendered homepage category & spotlight rows
  const deduplicatedHomepageRows = useMemo(() => {
    if (!data) {
      return {
        initial: [] as RealmCarouselRowData[],
        deferred: {} as Record<string, RealmCarouselRowData>,
        collections: {} as Record<string, RealmCarouselRowData>,
      };
    }
    const globalSeen = new Set<number>();
    const initial: RealmCarouselRowData[] = (data.initialRows || []).map((row) => {
      const items = (row.items || []).filter((item) => {
        const cid = getAnimeCanonicalKey(item);
        if (!cid || globalSeen.has(cid)) return false;
        globalSeen.add(cid);
        return true;
      });
      return { ...row, items };
    });

    const deferred: Record<string, RealmCarouselRowData> = {};
    for (const def of data.deferredCategorySections || []) {
      const loaded = deferredRows[def.slug];
      if (!loaded) continue;
      const items = (loaded.items || []).filter((item) => {
        const cid = getAnimeCanonicalKey(item);
        if (!cid || globalSeen.has(cid)) return false;
        globalSeen.add(cid);
        return true;
      });
      deferred[def.slug] = { ...loaded, items };
    }

    const collections: Record<string, RealmCarouselRowData> = {};
    for (const col of data.discoveryCollections || []) {
      const loaded = collectionRows[col.slug];
      if (!loaded) continue;
      const items = (loaded.items || []).filter((item) => {
        const cid = getAnimeCanonicalKey(item);
        if (!cid || globalSeen.has(cid)) return false;
        globalSeen.add(cid);
        return true;
      });
      collections[col.slug] = { ...loaded, items };
    }

    return { initial, deferred, collections };
  }, [data, deferredRows, collectionRows]);

  if (loading) {
    return (
      <div className="space-y-6 py-1" aria-busy="true" aria-label="Loading KAGE Realms">
        <div className="space-y-2.5">
          <div className="h-6 w-36 rounded bg-[#141116] animate-pulse" />
          <div className="h-[235px] sm:h-[320px] lg:h-[360px] rounded-2xl bg-[#141116] animate-pulse border border-white/8" />
        </div>
        <div className="h-6 w-28 rounded bg-[#141116] animate-pulse" />
        <HorizontalCarouselSkeleton label="Action" />
        <HorizontalCarouselSkeleton label="Romance" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-7 rounded-2xl bg-[#141116] border border-[#C0263D]/35 text-center space-y-3 my-4">
        <p className="text-sm font-medium text-[#F5F1F2]">
          {error || 'Could not reach the anime catalog right now.'}
        </p>
        <p className="text-xs text-[#A7A0AA]">
          Check your connection or retry to reload live anime discovery.
        </p>
        <button
          type="button"
          onClick={loadRealms}
          className="min-h-[44px] px-5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-semibold inline-flex items-center gap-2 cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          <span>Retry Realms</span>
        </button>
      </div>
    );
  }

  const {
    featured,
    featuredPool,
    deferredCategorySections,
    discoveryCollections,
    recentlyViewed,
    featuredGuilds,
    communityHighlights,
  } = data;

  return (
    <div className="space-y-8">
      {/* 1. Popular Now Cinematic Hero Banner */}
      {featured && (
        <PopularNowBanner
          featured={featured}
          pool={featuredPool}
          allGenresCount={ALL_ANIME_GENRES.length}
        />
      )}

      {/* 2. Categories Heading + Zero-Duplicate Single-Category Horizontal Carousels */}
      <section className="space-y-5" aria-label="Anime Categories">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-lg sm:text-xl font-bold text-[#F5F1F2] tracking-tight">
            Categories
          </h2>
          <div className="flex items-center gap-2 shrink-0 flex-wrap">
            {onReplayIntro && (
              <button
                type="button"
                onClick={onReplayIntro}
                className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#141116] hover:bg-[#1C1720] border border-white/[0.09] text-xs font-medium text-[#A7A0AA] hover:text-[#F5F1F2] inline-flex items-center gap-1.5 kage-press whitespace-nowrap shrink-0 cursor-pointer transition-colors"
                title="Replay KAGE Opening Intro"
              >
                <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                <span>Replay Intro</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => {
                const pool: RealmsAnimeItem[] = [];
                if (featuredPool?.length) pool.push(...featuredPool);
                for (const r of deduplicatedHomepageRows.initial) pool.push(...r.items);
                for (const r of Object.values(deduplicatedHomepageRows.deferred)) pool.push(...r.items);
                for (const r of Object.values(deduplicatedHomepageRows.collections)) pool.push(...r.items);
                if (pool.length === 0) return;
                const picked = pool[Math.floor(Math.random() * pool.length)];
                const rid = getAnimeRouteId(picked);
                if (rid) navigate(`/anime/${rid}`);
              }}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#141116] hover:bg-[#1C1720] border border-white/[0.09] text-xs font-medium text-[#F5F1F2] inline-flex items-center gap-1.5 kage-press whitespace-nowrap shrink-0 cursor-pointer transition-colors"
            >
              <Shuffle className="w-3.5 h-3.5 text-[#C0263D]" />
              <span>Surprise Me</span>
            </button>
            <Link
              to="/filters"
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-[#141116] hover:bg-[#1C1720] border border-white/[0.09] text-xs font-medium text-[#A7A0AA] hover:text-[#F5F1F2] inline-flex items-center gap-1.5 kage-press whitespace-nowrap shrink-0 transition-colors"
            >
              <Filter className="w-3.5 h-3.5 text-[#6D28D9]" />
              <span>Anime Filters</span>
            </Link>
          </div>
        </div>

        {/* Initial Above-the-Fold Genre Carousels */}
        <div className="space-y-6">
          {deduplicatedHomepageRows.initial.map((row) =>
            row.items.length > 0 ? (
              <HorizontalAnimeCarousel
                key={row.definition.slug}
                title={row.definition.title}
                subtitle={row.definition.subtitle}
                kind={row.definition.kind}
                seeAllTo={`/realms/genre/${row.definition.slug}`}
                items={row.items}
              />
            ) : null
          )}

          {/* Private Recently Viewed Carousel (Signed-in User Only) */}
          {recentlyViewed && recentlyViewed.length > 0 && (
            <HorizontalAnimeCarousel
              title="Recently Viewed"
              subtitle="Private to your KAGE account"
              kind="collection"
              items={recentlyViewed}
            />
          )}

          {/* Progressive Below-the-Fold Genre Carousels */}
          {deferredCategorySections.map((def) => {
            const loaded = deduplicatedHomepageRows.deferred[def.slug];
            if (!loaded) {
              return loadingMoreRows ? (
                <HorizontalCarouselSkeleton key={def.slug} label={def.title} />
              ) : null;
            }
            if (!loaded.items || loaded.items.length === 0) return null;
            return (
              <HorizontalAnimeCarousel
                key={def.slug}
                title={loaded.definition.title}
                subtitle={loaded.definition.subtitle}
                kind={loaded.definition.kind}
                seeAllTo={`/realms/genre/${loaded.definition.slug}`}
                items={loaded.items}
              />
            );
          })}
        </div>
      </section>

      {/* 3. Curated Discovery Collections (Zero Duplicates with Genre Rows) */}
      {discoveryCollections.some((c) => deduplicatedHomepageRows.collections[c.slug]?.items?.length) && (
        <section className="space-y-5 pt-2 border-t border-white/8" aria-label="Discovery Collections">
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#C0263D]" />
            <h2 className="text-lg sm:text-xl font-bold text-[#F5F1F2] tracking-tight">
              Realms Spotlights &amp; Collections
            </h2>
          </div>

          <div className="space-y-6">
            {discoveryCollections.map((col) => {
              const row = deduplicatedHomepageRows.collections[col.slug];
              if (!row || !row.items || row.items.length === 0) return null;
              return (
                <HorizontalAnimeCarousel
                  key={col.slug}
                  title={row.definition.title}
                  subtitle={row.definition.subtitle}
                  kind={row.definition.kind}
                  seeAllTo={`/realms/genre/${col.slug}`}
                  items={row.items}
                />
              );
            })}
          </div>
        </section>
      )}

      {/* 4. Dynamic Personalized Anime Recommendation Engine */}
      <div className="pt-2 border-t border-white/8">
        <RecommendationEnginePanel />
      </div>

      {/* 5. Featured Guilds & Community Highlights */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-4 border-t border-white/8">
        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-bold text-[#F5F1F2] flex items-center gap-2">
              <Users className="w-4 h-4 text-[#6D28D9]" />
              <span>Featured Communities &amp; Guilds</span>
            </h3>
            <Link
              to="/guilds"
              className="text-xs font-medium text-[#A7A0AA] hover:text-[#F5F1F2] inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Explore All</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          <div className="space-y-2.5">
            {featuredGuilds.map((g: any) => (
              <Link
                key={g.id}
                to={`/guilds/${g.slug}`}
                className="p-3.5 rounded-2xl bg-[#141116] border border-white/[0.08] hover:border-[#6D28D9]/55 hover:bg-[#18141C] flex items-center gap-3.5 transition-colors"
              >
                <div className="w-13 h-13 rounded-full overflow-hidden border border-[#6D28D9]/50 shrink-0">
                  <KageImage
                    src={g.artworkUrl}
                    alt={g.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-[#F5F1F2] truncate">
                    {g.name}
                  </p>
                  <p className="text-xs text-[#A7A0AA] line-clamp-1 mt-0.5">
                    {g.tagline || g.description}
                  </p>
                  <p className="text-[11px] font-mono-num text-[#A7A0AA]/90 mt-1">
                    {formatCompactNumber(g.memberCount)} members · {formatCompactNumber(g.discussionCount)} posts
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <section className="space-y-3.5">
          <div className="flex items-center justify-between">
            <h3 className="text-base sm:text-lg font-bold text-[#F5F1F2] flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#C0263D]" />
              <span>Community Highlights</span>
            </h3>
            <Link
              to="/pulse"
              className="text-xs font-medium text-[#A7A0AA] hover:text-[#F5F1F2] inline-flex items-center gap-1 transition-colors whitespace-nowrap shrink-0"
            >
              <span>Open Pulse</span>
              <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {communityHighlights.length === 0 ? (
            <div className="p-6 rounded-2xl bg-[#141116] border border-white/[0.08] text-center space-y-2.5">
              <p className="text-xs text-[#A7A0AA]">
                No discussions posted yet. Spark the first fandom thread on Pulse.
              </p>
              <Link
                to="/pulse"
                className="inline-flex min-h-[40px] px-4 items-center rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-semibold transition-colors"
              >
                Create First Post
              </Link>
            </div>
          ) : (
            <div className="space-y-2.5">
              {communityHighlights.map((post: any) => (
                <Link
                  key={post.id}
                  to={`/pulse?discussion=${post.id}`}
                  className={`block p-3.5 rounded-2xl bg-[#141116] border transition-colors ${
                    post.author?.role === 'owner'
                      ? 'border-amber-400/35 hover:border-amber-400/65 hover:bg-[#18141C]'
                      : 'border-white/[0.08] hover:border-white/20 hover:bg-[#18141C]'
                  }`}
                >
                  <p className="text-sm font-semibold text-[#F5F1F2] line-clamp-1">
                    {post.title}
                  </p>
                  <p className="text-xs text-[#A7A0AA] line-clamp-2 mt-1 leading-relaxed">{post.content}</p>
                  <div className="flex items-center gap-2 text-[11px] text-[#A7A0AA] mt-2 font-mono-num flex-wrap">
                    <span className="inline-flex items-center gap-1.5">
                      <span>@{post.author?.username}</span>
                      <OwnerBadge role={post.author?.role} size="xs" />
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{formatCompactNumber(post.likeCount)} likes</span>
                    <span aria-hidden="true">·</span>
                    <span>{formatCompactNumber(post.commentCount)} comments</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
