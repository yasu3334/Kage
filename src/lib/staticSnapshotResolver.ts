import { resolvePublicAssetPath } from './assets';
import { ALL_ANIME_GENRES, resolveRealmDefinition, slugifyRealm } from './genres';
import { getStaticRealmsFallback } from './staticRealmsFallback';

interface StaticSnapshotData {
  generatedAt?: string;
  realmsHome?: any;
  deferredRowsBySlug?: Record<string, any>;
  communities?: { items?: any[]; hasMore?: boolean };
  communityDetailsBySlug?: Record<string, any>;
  voiceRooms?: { items?: any[] };
  voiceRoomDetailsById?: Record<string, any>;
  voiceRoomMessagesById?: Record<string, any>;
  discussions?: { items?: any[]; hasMore?: boolean };
  discussionDetailsById?: Record<string, any>;
  leaderboard?: any;
  clashes?: { items?: any[]; hasMore?: boolean };
  inkverseDashboard?: any;
  inkverseBrowse?: { items?: any[]; pageInfo?: any };
  inkverseDetailsById?: Record<string, any>;
  inkverseChaptersById?: Record<string, any>;
  animeDetailsById?: Record<string, any>;
}

const STATIC_CLASH_VOTES_KEY = 'kage_static_clash_votes_v1';
let snapshotCachePromise: Promise<StaticSnapshotData | null> | null = null;
const jikanAnimeCache = new Map<string, any>();

function normalizeBaseAssets<T>(value: T): T {
  const base = (import.meta.env.BASE_URL || '/').trim();
  if (!base || base === '/') return value;

  if (typeof value === 'string') {
    if (value.startsWith('/assets/')) {
      return resolvePublicAssetPath(value) as unknown as T;
    }
    return value;
  }
  if (Array.isArray(value)) {
    return value.map((item) => normalizeBaseAssets(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      out[k] = normalizeBaseAssets(v);
    }
    return out as T;
  }
  return value;
}

async function loadSnapshot(): Promise<StaticSnapshotData | null> {
  if (snapshotCachePromise) return snapshotCachePromise;

  snapshotCachePromise = (async () => {
    try {
      const url = resolvePublicAssetPath('/static-snapshot.json');
      const res = await fetch(url, { cache: 'no-cache' });
      if (!res.ok) return null;
      const ctype = (res.headers.get('content-type') || '').toLowerCase();
      if (!ctype.includes('json')) return null;
      const parsed = (await res.json()) as StaticSnapshotData;
      return normalizeBaseAssets(parsed);
    } catch {
      return null;
    }
  })();

  return snapshotCachePromise;
}

function readLocalClashVotes(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage?.getItem(STATIC_CLASH_VOTES_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function writeLocalClashVote(clashId: number | string, side: 'a' | 'b') {
  if (typeof window === 'undefined') return;
  try {
    const map = readLocalClashVotes();
    map[String(clashId)] = side;
    window.localStorage?.setItem(STATIC_CLASH_VOTES_KEY, JSON.stringify(map));
  } catch {
    // ignore storage errors
  }
}

function applyLocalVoteToClash(clash: any): any {
  if (!clash) return clash;
  const votes = readLocalClashVotes();
  const votedSide = votes[String(clash.id)] as 'a' | 'b' | undefined;
  if (!votedSide) return clash;

  const baseA = Number(clash.votesA || 0);
  const baseB = Number(clash.votesB || 0);
  const alreadyMatches = clash.userVote === votedSide;
  const nextA = baseA + (!alreadyMatches && votedSide === 'a' ? 1 : 0);
  const nextB = baseB + (!alreadyMatches && votedSide === 'b' ? 1 : 0);
  const total = Math.max(1, nextA + nextB);
  const percentA = Math.round((nextA / total) * 100);
  const percentB = 100 - percentA;

  return {
    ...clash,
    votesA: nextA,
    votesB: nextB,
    totalVotes: nextA + nextB,
    percentA,
    percentB,
    userVote: votedSide,
  };
}

function collectAllSnapshotAnime(snapshot: StaticSnapshotData | null): any[] {
  const seen = new Map<number, any>();
  const add = (item: any) => {
    const id = Number(item?.canonicalId || item?.malId || 0);
    if (!id || seen.has(id)) return;
    seen.set(id, { ...item, malId: item.malId || id, canonicalId: id });
  };

  if (snapshot?.realmsHome) {
    if (snapshot.realmsHome.featured) add(snapshot.realmsHome.featured);
    for (const f of snapshot.realmsHome.featuredPool || []) add(f);
    for (const row of snapshot.realmsHome.initialRows || []) {
      for (const item of row?.items || []) add(item);
    }
  }
  for (const row of Object.values(snapshot?.deferredRowsBySlug || {})) {
    for (const item of row?.items || []) add(item);
  }
  if (seen.size === 0) {
    const basic = getStaticRealmsFallback();
    for (const row of basic.initialRows || []) {
      for (const item of row.items || []) add(item);
    }
  }
  return Array.from(seen.values());
}

function collectAllSnapshotManga(snapshot: StaticSnapshotData | null): any[] {
  const seen = new Map<number, any>();
  const add = (m: any) => {
    if (!m?.id || seen.has(m.id)) return;
    seen.set(m.id, m);
  };
  for (const m of snapshot?.inkverseBrowse?.items || []) add(m);
  for (const m of snapshot?.inkverseDashboard?.trending || []) add(m);
  for (const m of snapshot?.inkverseDashboard?.readableInApp || []) add(m);
  for (const d of Object.values(snapshot?.inkverseDetailsById || {})) {
    if (d?.manga) add(d.manga);
  }
  return Array.from(seen.values());
}

function sortAnimeList(list: any[], sort: string): any[] {
  const copy = [...list];
  if (sort === 'rating') {
    copy.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
  } else if (sort === 'newest') {
    copy.sort((a, b) => Number(b.year || 0) - Number(a.year || 0));
  } else if (sort === 'alphabetical') {
    copy.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
  } else {
    copy.sort((a, b) => Number(b.members || b.popularity || b.score || 0) - Number(a.members || a.popularity || a.score || 0));
  }
  return copy;
}

function mapJikanAnimeToItem(j: any): any {
  const genres = Array.isArray(j.genres)
    ? j.genres.map((g: any) => g.name).filter(Boolean)
    : [];
  return {
    malId: j.mal_id,
    canonicalId: j.mal_id,
    title: j.title_english || j.title,
    romajiTitle: j.title,
    englishTitle: j.title_english || j.title,
    nativeTitle: j.title_japanese || null,
    imageUrl: j.images?.jpg?.large_image_url || j.images?.jpg?.image_url || '',
    bannerUrl: j.trailer?.images?.maximum_image_url || j.images?.jpg?.large_image_url || '',
    score: typeof j.score === 'number' ? j.score : null,
    scoreSource: 'MAL',
    episodes: j.episodes || null,
    status: j.status || null,
    year: j.year || j.aired?.prop?.from?.year || null,
    format: j.type || 'TV',
    formatLabel: j.episodes ? `${j.type || 'TV'} · ${j.episodes} ep` : j.type || 'TV',
    genres,
    synopsis: j.synopsis || '',
    members: j.members || 0,
    trailerUrl: j.trailer?.url || null,
    trailerEmbedUrl: j.trailer?.embed_url || null,
  };
}

async function fetchJikanAnimeDetail(malId: string, snapshot: StaticSnapshotData | null): Promise<any | null> {
  if (jikanAnimeCache.has(malId)) return jikanAnimeCache.get(malId);
  try {
    const res = await fetch(`https://api.jikan.moe/v4/anime/${encodeURIComponent(malId)}/full`);
    if (!res.ok) return null;
    const json = await res.json();
    const raw = json?.data;
    if (!raw) return null;

    const anime = mapJikanAnimeToItem(raw);
    anime.studios = Array.isArray(raw.studios) ? raw.studios.map((s: any) => s.name) : [];
    anime.streaming = Array.isArray(raw.streaming) ? raw.streaming : [];
    anime.providerUrl = raw.url || null;
    anime.durationMins = raw.duration ? parseInt(String(raw.duration), 10) || null : null;
    anime.startDate = raw.aired?.string || null;

    const [charsRes, recsRes] = await Promise.all([
      fetch(`https://api.jikan.moe/v4/anime/${encodeURIComponent(malId)}/characters`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
      fetch(`https://api.jikan.moe/v4/anime/${encodeURIComponent(malId)}/recommendations`)
        .then((r) => (r.ok ? r.json() : null))
        .catch(() => null),
    ]);

    const characters = Array.isArray(charsRes?.data)
      ? charsRes.data.slice(0, 12).map((c: any) => ({
          id: c.character?.mal_id,
          name: c.character?.name,
          role: c.role || 'Supporting',
          imageUrl: c.character?.images?.jpg?.image_url || '',
          voiceActor: c.voice_actors?.[0]?.person?.name || null,
        }))
      : [];

    const related = Array.isArray(recsRes?.data)
      ? recsRes.data.slice(0, 12).map((r: any) => ({
          malId: r.entry?.mal_id,
          canonicalId: r.entry?.mal_id,
          title: r.entry?.title,
          imageUrl: r.entry?.images?.jpg?.large_image_url || r.entry?.images?.jpg?.image_url || '',
          genres: anime.genres,
        }))
      : [];

    // Link matching INKVERSE manga if present in snapshot
    const titleLower = String(anime.title || '').toLowerCase();
    const mangaRelations: any[] = [];
    for (const md of Object.values(snapshot?.inkverseDetailsById || {})) {
      const m = md?.manga;
      if (!m) continue;
      const mTitle = String(m.title || '').toLowerCase();
      if (
        (mTitle && titleLower && (titleLower.includes(mTitle) || mTitle.includes(titleLower))) ||
        (md.relatedAnime || []).some((ra: any) => Number(ra.animeMalId || ra.malId) === Number(malId))
      ) {
        mangaRelations.push({
          relationLabel: 'Source Manga',
          manga: m,
        });
      }
    }

    const payload = {
      anime,
      characters,
      staff: [],
      episodes: [],
      related,
      discussions: (snapshot?.discussions?.items || [])
        .filter((p: any) => Number(p.animeMalId) === Number(malId))
        .slice(0, 6),
      guilds: (snapshot?.communities?.items || []).slice(0, 3),
      reviews: [],
      mangaRelations,
      kageReviewCount: 0,
      kageAverageScore: null,
      viewerEntry: null,
    };
    jikanAnimeCache.set(malId, payload);
    return payload;
  } catch {
    return null;
  }
}

export async function resolveStaticApiFallback<T = any>(
  path: string,
  options: RequestInit = {}
): Promise<{ handled: true; data: T } | { handled: false }> {
  const method = String(options.method || 'GET').toUpperCase();
  const url = new URL(path, 'https://kage.local');
  const pathname = url.pathname;
  const sp = url.searchParams;
  const snapshot = await loadSnapshot();

  // 1. Splash Config
  if (pathname === '/api/splash-config' && method === 'GET') {
    return {
      handled: true,
      data: {
        splash: {
          mode: 'bundled',
          presetKey: 'zenitsu-thunder',
          url: resolvePublicAssetPath('/assets/kage-intro-zenitsu.mp4'),
          posterUrl: resolvePublicAssetPath('/assets/extracted/zenitsu-live-room.jpg'),
        },
      } as T,
    };
  }

  // 2. Realms Home & Deferred Rows
  if (pathname === '/api/realms/home' && method === 'GET') {
    const data = snapshot?.realmsHome || getStaticRealmsFallback();
    return { handled: true, data: data as T };
  }

  if (pathname === '/api/realms/rows' && method === 'GET') {
    const slugs = (sp.get('slugs') || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const excludeSet = new Set(
      (sp.get('excludeIds') || '')
        .split(',')
        .map((n) => Number(n.trim()))
        .filter((n) => n > 0)
    );
    const rows: any[] = [];
    for (const slug of slugs) {
      const found =
        snapshot?.deferredRowsBySlug?.[slug] ||
        (snapshot?.realmsHome?.initialRows || []).find((r: any) => r?.definition?.slug === slug);
      if (found) {
        rows.push({
          ...found,
          items: (found.items || []).filter(
            (item: any) => !excludeSet.has(Number(item?.canonicalId || item?.malId || 0))
          ),
        });
      }
    }
    return { handled: true, data: { rows } as T };
  }

  // 3. Anime Genres
  if (pathname === '/api/anime/genres' && method === 'GET') {
    return { handled: true, data: { items: ALL_ANIME_GENRES } as T };
  }

  // 4. Genre Detail Catalog (/api/realms/genre/:slug)
  const genreMatch = pathname.match(/^\/api\/realms\/genre\/([^/]+)$/);
  if (genreMatch && method === 'GET') {
    const slug = decodeURIComponent(genreMatch[1]);
    const page = Math.max(1, Number(sp.get('page') || 1));
    const perPage = Math.min(48, Math.max(1, Number(sp.get('perPage') || 24)));
    const sort = sp.get('sort') || 'popularity';
    const yearFilter = sp.get('year') ? Number(sp.get('year')) : null;
    const formatFilter = (sp.get('format') || '').toLowerCase();
    const statusFilter = (sp.get('status') || '').toLowerCase();
    const minScore = sp.get('minScore') ? Number(sp.get('minScore')) : null;

    const row =
      snapshot?.deferredRowsBySlug?.[slug] ||
      (snapshot?.realmsHome?.initialRows || []).find((r: any) => r?.definition?.slug === slug);
    const realmMeta = resolveRealmDefinition(slug);
    let pool: any[] = row?.items ? [...row.items] : [];

    if (pool.length === 0 && realmMeta) {
      const targetGenre = (realmMeta.title || slug).toLowerCase();
      pool = collectAllSnapshotAnime(snapshot).filter((a) =>
        (a.genres || []).some((g: string) => slugifyRealm(g) === slug || g.toLowerCase() === targetGenre)
      );
    }

    // If snapshot has very few results or page > 1, fetch live from public Jikan API when available
    if ((pool.length < 6 || page > 1) && realmMeta?.jikanGenreId) {
      try {
        const orderMap: Record<string, string> = {
          rating: 'score',
          newest: 'start_date',
          alphabetical: 'title',
          popularity: 'members',
        };
        const jikanUrl = new URL('https://api.jikan.moe/v4/anime');
        jikanUrl.searchParams.set('genres', String(realmMeta.jikanGenreId));
        jikanUrl.searchParams.set('page', String(page));
        jikanUrl.searchParams.set('limit', String(Math.min(25, perPage)));
        jikanUrl.searchParams.set('order_by', orderMap[sort] || 'members');
        jikanUrl.searchParams.set('sort', sort === 'alphabetical' ? 'asc' : 'desc');
        jikanUrl.searchParams.set('sfw', 'true');
        const jRes = await fetch(jikanUrl.toString());
        if (jRes.ok) {
          const jJson = await jRes.json();
          const mapped = (jJson.data || []).map(mapJikanAnimeToItem);
          if (page === 1) {
            const seen = new Set(pool.map((i) => i.malId));
            for (const m of mapped) {
              if (!seen.has(m.malId)) pool.push(m);
            }
          } else {
            pool = mapped;
          }
        }
      } catch {
        // use local snapshot pool cleanly
      }
    }

    pool = pool.filter((item) => {
      if (yearFilter && Number(item.year) !== yearFilter) return false;
      if (formatFilter && String(item.format || '').toLowerCase() !== formatFilter) return false;
      if (statusFilter && !String(item.status || '').toLowerCase().includes(statusFilter)) return false;
      if (minScore && Number(item.score || 0) < minScore) return false;
      return true;
    });
    pool = sortAnimeList(pool, sort);

    return {
      handled: true,
      data: {
        items: pool.slice(0, perPage),
        pageInfo: {
          currentPage: page,
          perPage,
          hasNextPage: Boolean(realmMeta?.jikanGenreId && pool.length >= 16),
          total: pool.length,
          totalEstablished: false,
          source: 'snapshot+jikan',
        },
      } as T,
    };
  }

  // 5. Anime Detail (/api/anime/:malId)
  const animeDetailMatch = pathname.match(/^\/api\/anime\/(\d+)$/);
  if (animeDetailMatch && method === 'GET') {
    const malId = animeDetailMatch[1];
    if (snapshot?.animeDetailsById?.[malId]) {
      return { handled: true, data: snapshot.animeDetailsById[malId] as T };
    }
    const jikanDetail = await fetchJikanAnimeDetail(malId, snapshot);
    if (jikanDetail) {
      return { handled: true, data: jikanDetail as T };
    }
    const foundSummary = collectAllSnapshotAnime(snapshot).find(
      (a) => String(a.malId) === malId || String(a.canonicalId) === malId
    );
    if (foundSummary) {
      return {
        handled: true,
        data: {
          anime: foundSummary,
          characters: [],
          staff: [],
          episodes: [],
          related: collectAllSnapshotAnime(snapshot).slice(0, 8),
          discussions: [],
          guilds: (snapshot?.communities?.items || []).slice(0, 3),
          reviews: [],
          mangaRelations: [],
          kageReviewCount: 0,
          kageAverageScore: null,
          viewerEntry: null,
        } as T,
      };
    }
  }

  // 6. Communities / Guilds
  if (pathname === '/api/communities' && method === 'GET') {
    const q = (sp.get('q') || '').trim().toLowerCase();
    const privacyMode = sp.get('privacyMode') || '';
    const genre = (sp.get('genre') || '').trim().toLowerCase();
    const sort = sp.get('sort') || 'most_active';
    const limit = Math.min(50, Math.max(1, Number(sp.get('limit') || 24)));
    const offset = Math.max(0, Number(sp.get('offset') || 0));

    let items = [...(snapshot?.communities?.items || [])];
    if (q) {
      items = items.filter(
        (g) =>
          String(g.name || '').toLowerCase().includes(q) ||
          String(g.description || '').toLowerCase().includes(q) ||
          String(g.category || '').toLowerCase().includes(q)
      );
    }
    if (privacyMode) {
      items = items.filter((g) => (g.privacyMode || 'public') === privacyMode);
    }
    if (genre) {
      items = items.filter((g) => String(g.category || '').toLowerCase().includes(genre));
    }
    if (sort === 'most_members') {
      items.sort((a, b) => Number(b.memberCount || 0) - Number(a.memberCount || 0));
    } else if (sort === 'alphabetical') {
      items.sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
    } else if (sort === 'newest') {
      items.sort((a, b) => Number(b.id || 0) - Number(a.id || 0));
    } else {
      items.sort((a, b) => Number(b.postCount || b.memberCount || 0) - Number(a.postCount || a.memberCount || 0));
    }

    const sliced = items.slice(offset, offset + limit);
    return {
      handled: true,
      data: { items: sliced, hasMore: offset + sliced.length < items.length } as T,
    };
  }

  const guildSlugMatch = pathname.match(/^\/api\/communities\/([^/]+)$/);
  if (guildSlugMatch && method === 'GET') {
    const slug = decodeURIComponent(guildSlugMatch[1]);
    if (snapshot?.communityDetailsBySlug?.[slug]) {
      return { handled: true, data: snapshot.communityDetailsBySlug[slug] as T };
    }
    const summary = (snapshot?.communities?.items || []).find(
      (g) => g.slug === slug || String(g.id) === slug
    );
    if (summary) {
      return {
        handled: true,
        data: {
          guild: { ...summary, members: [], chatRooms: [], events: [], permissions: {} },
          discussions: (snapshot?.discussions?.items || [])
            .filter((d: any) => d.communityId === summary.id)
            .slice(0, 12),
        } as T,
      };
    }
  }

  // 7. Voice Rooms (KAGE LIVE)
  if (pathname === '/api/voice-rooms' && method === 'GET') {
    const q = (sp.get('q') || '').trim().toLowerCase();
    const category = sp.get('category') || '';
    let items = [...(snapshot?.voiceRooms?.items || [])];
    if (q) {
      items = items.filter(
        (r) =>
          String(r.title || '').toLowerCase().includes(q) ||
          String(r.topic || '').toLowerCase().includes(q) ||
          String(r.category || '').toLowerCase().includes(q)
      );
    }
    if (category && category !== 'All') {
      items = items.filter((r) => String(r.category || '').toLowerCase() === category.toLowerCase());
    }
    return { handled: true, data: { items } as T };
  }

  const voiceMsgMatch = pathname.match(/^\/api\/voice-rooms\/(\d+)\/messages$/);
  if (voiceMsgMatch && method === 'GET') {
    const roomId = voiceMsgMatch[1];
    return {
      handled: true,
      data: (snapshot?.voiceRoomMessagesById?.[roomId] || { items: [], messages: [] }) as T,
    };
  }

  const voiceDetailMatch = pathname.match(/^\/api\/voice-rooms\/(\d+)$/);
  if (voiceDetailMatch && method === 'GET') {
    const roomId = voiceDetailMatch[1];
    if (snapshot?.voiceRoomDetailsById?.[roomId]) {
      return { handled: true, data: snapshot.voiceRoomDetailsById[roomId] as T };
    }
    const found = (snapshot?.voiceRooms?.items || []).find((r) => String(r.id) === roomId);
    if (found) {
      return {
        handled: true,
        data: {
          room: found,
          messages: snapshot?.voiceRoomMessagesById?.[roomId]?.items || [],
        } as T,
      };
    }
  }

  // 8. Pulse Discussions
  if (pathname === '/api/discussions' && method === 'GET') {
    const feedTab = sp.get('feedTab') || sp.get('tab') || 'for_you';
    const hashtag = (sp.get('hashtag') || '').trim().toLowerCase();
    const q = (sp.get('q') || '').trim().toLowerCase();
    const limit = Math.min(50, Math.max(1, Number(sp.get('limit') || 25)));
    const offset = Math.max(0, Number(sp.get('offset') || 0));

    let items = [...(snapshot?.discussions?.items || [])];
    if (hashtag) {
      items = items.filter((p) => {
        const text = `${p.title || ''} ${p.content || ''}`.toLowerCase();
        const tags = Array.isArray(p.hashtags) ? p.hashtags.map((h: string) => h.toLowerCase()) : [];
        return tags.includes(hashtag) || text.includes(`#${hashtag}`);
      });
    }
    if (q) {
      items = items.filter((p) =>
        `${p.title || ''} ${p.content || ''} ${p.animeTitle || ''}`.toLowerCase().includes(q)
      );
    }
    if (feedTab === 'polls') {
      items = items.filter((p) => Array.isArray(p.pollOptions) && p.pollOptions.length > 0);
    } else if (feedTab === 'theories') {
      items = items.filter((p) => p.kind === 'theory' || (p.hashtags || []).includes('Theory'));
    } else if (feedTab === 'trending') {
      items.sort(
        (a, b) =>
          Number(b.upvotes || b.likeCount || 0) +
          Number(b.commentCount || 0) -
          (Number(a.upvotes || a.likeCount || 0) + Number(a.commentCount || 0))
      );
    }

    const sliced = items.slice(offset, offset + limit);
    return {
      handled: true,
      data: { items: sliced, hasMore: offset + sliced.length < items.length } as T,
    };
  }

  const discDetailMatch = pathname.match(/^\/api\/discussions\/(\d+)$/);
  if (discDetailMatch && method === 'GET') {
    const id = discDetailMatch[1];
    if (snapshot?.discussionDetailsById?.[id]) {
      return { handled: true, data: snapshot.discussionDetailsById[id] as T };
    }
    const found = (snapshot?.discussions?.items || []).find((d) => String(d.id) === id);
    if (found) {
      return { handled: true, data: { discussion: { ...found, comments: [] } } as T };
    }
  }

  // 9. Global Leaderboard
  if (pathname === '/api/leaderboard' && method === 'GET') {
    if (snapshot?.leaderboard) {
      return { handled: true, data: snapshot.leaderboard as T };
    }
  }

  // 10. Clashes & Static Interactive Voting
  if (pathname === '/api/clashes' && method === 'GET') {
    const tab = sp.get('tab') || 'all';
    const q = (sp.get('q') || '').trim().toLowerCase();
    const limit = Math.min(50, Math.max(1, Number(sp.get('limit') || 16)));
    const offset = Math.max(0, Number(sp.get('offset') || 0));

    let items = (snapshot?.clashes?.items || []).map(applyLocalVoteToClash);
    if (tab === 'active' || tab === 'live') {
      items = items.filter((c) => c.status === 'active' || c.isLive !== false);
    } else if (tab === 'ended') {
      items = items.filter((c) => c.status === 'ended' || c.isLive === false);
    }
    if (q) {
      items = items.filter(
        (c) =>
          String(c.title || '').toLowerCase().includes(q) ||
          String(c.contenderAName || '').toLowerCase().includes(q) ||
          String(c.contenderBName || '').toLowerCase().includes(q)
      );
    }
    const sliced = items.slice(offset, offset + limit);
    return {
      handled: true,
      data: { items: sliced, hasMore: offset + sliced.length < items.length } as T,
    };
  }

  const clashDetailMatch = pathname.match(/^\/api\/clashes\/(\d+)$/);
  if (clashDetailMatch && method === 'GET') {
    const id = clashDetailMatch[1];
    const found = (snapshot?.clashes?.items || []).find((c) => String(c.id) === id);
    if (found) {
      return { handled: true, data: { clash: applyLocalVoteToClash(found) } as T };
    }
  }

  const clashVoteMatch = pathname.match(/^\/api\/clashes\/(\d+)\/vote$/);
  if (clashVoteMatch && method === 'POST') {
    const id = clashVoteMatch[1];
    const body = typeof options.body === 'string' ? JSON.parse(options.body || '{}') : {};
    const side = body?.side === 'b' ? 'b' : 'a';
    writeLocalClashVote(id, side);
    const found = (snapshot?.clashes?.items || []).find((c) => String(c.id) === id);
    if (found) {
      return { handled: true, data: { clash: applyLocalVoteToClash(found) } as T };
    }
  }

  // 11. INKVERSE Manga Platform
  if (pathname === '/api/inkverse/dashboard' && method === 'GET') {
    if (snapshot?.inkverseDashboard) {
      return { handled: true, data: snapshot.inkverseDashboard as T };
    }
  }

  if (pathname === '/api/inkverse/browse' && method === 'GET') {
    const q = (sp.get('q') || '').trim().toLowerCase();
    const genre = (sp.get('genre') || '').trim().toLowerCase();
    const status = (sp.get('status') || '').trim().toLowerCase();
    const year = sp.get('year') ? Number(sp.get('year')) : null;
    const minRating = sp.get('minRating') ? Number(sp.get('minRating')) : null;
    const color = (sp.get('color') || '').trim().toLowerCase();
    const language = (sp.get('language') || '').trim().toLowerCase();
    const inAppOnly = sp.get('inAppOnly') === '1' || sp.get('inAppOnly') === 'true';
    const originalsOnly = sp.get('originalsOnly') === '1' || sp.get('originalsOnly') === 'true';
    const sort = sp.get('sort') || 'popularity';
    const page = Math.max(1, Number(sp.get('page') || 1));
    const perPage = Math.min(40, Math.max(1, Number(sp.get('perPage') || 20)));

    let items = collectAllSnapshotManga(snapshot);
    if (q) {
      items = items.filter(
        (m) =>
          String(m.title || '').toLowerCase().includes(q) ||
          (m.alternativeTitles || []).some((t: string) => t.toLowerCase().includes(q)) ||
          (m.authors || []).some((a: string) => a.toLowerCase().includes(q)) ||
          (m.genres || []).some((g: string) => g.toLowerCase().includes(q))
      );
    }
    if (genre) {
      items = items.filter((m) =>
        (m.genres || []).some((g: string) => slugifyRealm(g) === genre || g.toLowerCase() === genre)
      );
    }
    if (status) {
      items = items.filter((m) => String(m.status || '').toLowerCase().includes(status));
    }
    if (year) {
      items = items.filter((m) => Number(m.releaseYear) === year);
    }
    if (minRating) {
      items = items.filter((m) => Number(m.score || 0) >= minRating);
    }
    if (color === 'color') {
      items = items.filter((m) => Boolean(m.isColor));
    } else if (color === 'bw') {
      items = items.filter((m) => !m.isColor);
    }
    if (language) {
      items = items.filter((m) =>
        (m.availableLanguages || ['en']).some((l: string) => l.toLowerCase() === language)
      );
    }
    if (inAppOnly) {
      items = items.filter((m) => Boolean(m.hasInAppChapters) || m.isOriginal);
    }
    if (originalsOnly) {
      items = items.filter((m) => Boolean(m.isOriginal) || m.sourceProvider === 'kage_studio');
    }

    if (sort === 'rating') {
      items.sort((a, b) => Number(b.score || 0) - Number(a.score || 0));
    } else if (sort === 'newest') {
      items.sort((a, b) => Number(b.releaseYear || 0) - Number(a.releaseYear || 0));
    } else if (sort === 'alphabetical') {
      items.sort((a, b) => String(a.title || '').localeCompare(String(b.title || '')));
    } else if (sort === 'recent') {
      items.sort((a, b) => Number(b.chaptersCount || 0) - Number(a.chaptersCount || 0));
    } else {
      items.sort((a, b) => Number(b.viewsCount || b.score || 0) - Number(a.viewsCount || a.score || 0));
    }

    const total = items.length;
    const start = (page - 1) * perPage;
    const sliced = items.slice(start, start + perPage);
    return {
      handled: true,
      data: {
        items: sliced,
        pageInfo: {
          currentPage: page,
          perPage,
          hasNextPage: start + sliced.length < total,
          total,
        },
      } as T,
    };
  }

  if (pathname === '/api/inkverse/suggestions' && method === 'GET') {
    const q = (sp.get('q') || '').trim().toLowerCase();
    const mangaMatches = collectAllSnapshotManga(snapshot)
      .filter((m) => String(m.title || '').toLowerCase().includes(q))
      .slice(0, 5);
    const animeMatches = collectAllSnapshotAnime(snapshot)
      .filter((a) => String(a.title || '').toLowerCase().includes(q))
      .slice(0, 5);
    return {
      handled: true,
      data: {
        manga: mangaMatches,
        anime: animeMatches,
        authors: [],
        characters: [],
      } as T,
    };
  }

  const mangaDetailMatch = pathname.match(/^\/api\/inkverse\/manga\/(\d+)$/);
  if (mangaDetailMatch && method === 'GET') {
    const mangaId = mangaDetailMatch[1];
    if (snapshot?.inkverseDetailsById?.[mangaId]) {
      return { handled: true, data: snapshot.inkverseDetailsById[mangaId] as T };
    }
    const found = collectAllSnapshotManga(snapshot).find((m) => String(m.id) === mangaId);
    if (found) {
      return {
        handled: true,
        data: {
          manga: found,
          chapters: [],
          relatedManga: collectAllSnapshotManga(snapshot).slice(0, 4),
          relatedAnime: [],
          reviews: [],
          viewerEntry: null,
        } as T,
      };
    }
  }

  const chapterPagesMatch = pathname.match(/^\/api\/inkverse\/chapters\/(\d+)\/pages$/);
  if (chapterPagesMatch && method === 'GET') {
    const chapterId = chapterPagesMatch[1];
    if (snapshot?.inkverseChaptersById?.[chapterId]) {
      return { handled: true, data: snapshot.inkverseChaptersById[chapterId] as T };
    }
    // Check if the chapter exists in any manga detail cached in snapshot
    for (const md of Object.values(snapshot?.inkverseDetailsById || {})) {
      const chapters: any[] = md?.chapters || [];
      const idx = chapters.findIndex((c) => String(c.id) === chapterId);
      if (idx >= 0) {
        const ch = chapters[idx];
        const prevChapterId = idx > 0 ? chapters[idx - 1].id : null;
        const nextChapterId = idx < chapters.length - 1 ? chapters[idx + 1].id : null;
        // Try fetching live from public MangaDex At-Home if externalId looks like UUID
        if (ch.externalId && /^[0-9a-f-]{20,}$/i.test(String(ch.externalId)) && !ch.externalUrl) {
          try {
            const mdRes = await fetch(`https://api.mangadex.org/at-home/server/${ch.externalId}`);
            if (mdRes.ok) {
              const mdJson = await mdRes.json();
              const host = mdJson?.baseUrl;
              const hash = mdJson?.chapter?.hash;
              const files: string[] = mdJson?.chapter?.data || [];
              if (host && hash && files.length > 0) {
                return {
                  handled: true,
                  data: {
                    manga: md.manga,
                    chapter: ch,
                    prevChapterId,
                    nextChapterId,
                    isExternalRestricted: false,
                    pages: files.map((file, i) => ({
                      pageNumber: i + 1,
                      imageUrl: `${host}/data/${hash}/${file}`,
                      hdUrl: mdJson?.chapter?.dataSaver?.[i]
                        ? `${host}/data-saver/${hash}/${mdJson.chapter.dataSaver[i]}`
                        : null,
                      width: null,
                      height: null,
                      qualityLabel: 'HD',
                      isColor: Boolean(md.manga?.isColor),
                    })),
                    bookmarks: [],
                  } as T,
                };
              }
            }
          } catch {
            // fall through to notice
          }
        }
        return {
          handled: true,
          data: {
            manga: md.manga,
            chapter: ch,
            prevChapterId,
            nextChapterId,
            isExternalRestricted: true,
            externalUrl: ch.externalUrl || null,
            providerNotice: ch.externalUrl
              ? 'This chapter is hosted on an official licensed publisher platform.'
              : 'Open this chapter from the live KAGE server to stream full chapter pages.',
            pages: [],
            bookmarks: [],
          } as T,
        };
      }
    }
  }

  // 12. Global Search & Realms Search
  if ((pathname === '/api/search' || pathname === '/api/realms/search' || pathname === '/api/anime/search') && method === 'GET') {
    const q = (sp.get('q') || '').trim().toLowerCase();
    const genre = (sp.get('genre') || '').trim().toLowerCase();
    const sort = sp.get('sort') || 'popularity';

    let anime = collectAllSnapshotAnime(snapshot).filter((a) => {
      if (q && !`${a.title || ''} ${a.englishTitle || ''} ${(a.genres || []).join(' ')}`.toLowerCase().includes(q)) {
        return false;
      }
      if (genre && !(a.genres || []).some((g: string) => slugifyRealm(g) === genre || g.toLowerCase() === genre)) {
        return false;
      }
      return true;
    });

    if (q && anime.length < 6) {
      try {
        const jRes = await fetch(`https://api.jikan.moe/v4/anime?q=${encodeURIComponent(q)}&limit=12&sfw=true`);
        if (jRes.ok) {
          const jJson = await jRes.json();
          const mapped = (jJson.data || []).map(mapJikanAnimeToItem);
          const seen = new Set(anime.map((a) => a.malId));
          for (const m of mapped) {
            if (!seen.has(m.malId)) anime.push(m);
          }
        }
      } catch {
        // use snapshot matches cleanly
      }
    }

    anime = sortAnimeList(anime, sort);

    if (pathname === '/api/realms/search') {
      return {
        handled: true,
        data: {
          items: anime.slice(0, 24),
          pageInfo: { currentPage: 1, hasNextPage: false, total: anime.length, totalEstablished: true },
        } as T,
      };
    }

    if (pathname === '/api/anime/search') {
      return { handled: true, data: { items: anime.slice(0, 12) } as T };
    }

    const manga = collectAllSnapshotManga(snapshot).filter(
      (m) =>
        (!q || `${m.title || ''} ${(m.genres || []).join(' ')} ${(m.authors || []).join(' ')}`.toLowerCase().includes(q)) &&
        (!genre || (m.genres || []).some((g: string) => slugifyRealm(g) === genre))
    );
    const communities = (snapshot?.communities?.items || []).filter(
      (c) => !q || `${c.name || ''} ${c.description || ''} ${c.category || ''}`.toLowerCase().includes(q)
    );
    const people = (snapshot?.leaderboard?.hunters || []).filter(
      (u: any) => !q || `${u.displayName || ''} ${u.username || ''}`.toLowerCase().includes(q)
    );
    const discussions = (snapshot?.discussions?.items || []).filter(
      (d: any) => !q || `${d.title || ''} ${d.content || ''} ${d.animeTitle || ''}`.toLowerCase().includes(q)
    );
    const voiceRooms = (snapshot?.voiceRooms?.items || []).filter(
      (v: any) => !q || `${v.title || ''} ${v.topic || ''}`.toLowerCase().includes(q)
    );

    return {
      handled: true,
      data: {
        queryKind: 'general',
        isExplicitPersonQuery: false,
        anime: anime.slice(0, 24),
        manga: manga.slice(0, 20),
        people: people.slice(0, 12),
        communities: communities.slice(0, 12),
        discussions: discussions.slice(0, 12),
        voiceRooms: voiceRooms.slice(0, 8),
        mangaPageInfo: { total: manga.length },
        animePageInfo: { currentPage: 1, hasNextPage: false, total: anime.length, totalEstablished: true },
      } as T,
    };
  }

  // 13. Hunter Profiles (/api/profiles/:identifier)
  const profileMatch = pathname.match(/^\/api\/profiles\/([^/]+)$/);
  if (profileMatch && method === 'GET') {
    const ident = decodeURIComponent(profileMatch[1]).toLowerCase();
    const hunter = (snapshot?.leaderboard?.hunters || []).find(
      (h: any) => String(h.username || '').toLowerCase() === ident || String(h.uid || '').toLowerCase() === ident
    );
    if (hunter) {
      return {
        handled: true,
        data: {
          user: {
            uid: hunter.uid,
            username: hunter.username,
            displayName: hunter.displayName,
            avatarUrl: hunter.avatarUrl,
            bannerUrl: null,
            bio: hunter.bio || 'Active KAGE Hunter across Realms, Clash & Guilds.',
            role: hunter.role || 'member',
            isAiMember: hunter.isAiMember,
            isFollowing: false,
            isBlocked: false,
          },
          stats: {
            followersCount: 18,
            followingCount: 12,
            animeTrackedCount: 14,
            discussionsCount: hunter.postsCount || 4,
            clashScore: hunter.clashScore || 0,
            clashWins: hunter.clashWins || 0,
          },
          animeList: collectAllSnapshotAnime(snapshot).slice(0, 6).map((a: any) => ({
            malId: a.malId,
            title: a.title,
            imageUrl: a.imageUrl,
            status: 'completed',
            score: Math.round(a.score || 9),
          })),
          discussions: (snapshot?.discussions?.items || [])
            .filter((d: any) => String(d.author?.username || '').toLowerCase() === ident)
            .slice(0, 10),
        } as T,
      };
    }
  }

  // 14. Clean empty fallbacks for optional authenticated/secondary lists in static mode
  if (pathname === '/api/inkverse/studio/my-uploads' && method === 'GET') {
    return { handled: true, data: { items: [] } as T };
  }

  return { handled: false };
}
