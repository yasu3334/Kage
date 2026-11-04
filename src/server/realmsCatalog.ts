import { and, asc, desc, eq, gte, ilike, inArray, notInArray, or, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  animeCatalog,
  animeCatalogGenres,
  animeCatalogTags,
  animeGenres,
  animeReviews,
  animeTags,
  blockedUsers,
  profiles,
  userRecentlyViewed,
  users,
} from '../db/schema.ts';
import {
  ALL_ANIME_GENRES,
  ALL_GENRE_NAMES,
  ALL_REALMS_SECTIONS,
  REALMS_CATEGORY_SECTIONS,
  REALMS_DISCOVERY_COLLECTIONS,
  resolveRealmDefinition,
  slugifyRealm,
  type RealmSectionDefinition,
} from '../lib/genres.ts';
import { VERIFIED_ANIME_CATALOG } from './animeCatalog.ts';
import {
  PRIMARY_CATEGORY_SLUGS_SET,
  resolvePrimaryAnimeCategory,
} from './primaryCategoryClassifier.ts';

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const JIKAN_BASE = 'https://api.jikan.moe/v4';
export const SYNTHETIC_ID_OFFSET = 10_000_000;

export interface VerifiedStreamingOption {
  name: string;
  url: string;
  hostname: string;
  accessNote: string;
  language?: string | null;
}

export interface StreamingAvailabilityInfo {
  caseType: 'B' | 'C' | 'D' | 'E';
  primaryOption: VerifiedStreamingOption | null;
  verifiedOptions: VerifiedStreamingOption[];
  platformMentions: string[];
  providerCatalogUrl: string | null;
  disclaimer: string;
}

export interface RealmsAnimeRecord {
  canonicalId: number;
  malId: number | null;
  anilistId: number | null;
  provider: 'anilist' | 'jikan' | 'verified_seed';
  providerId: string;
  slug: string;
  title: string;
  englishTitle: string | null;
  romajiTitle: string;
  nativeTitle: string | null;
  synonyms: string[];
  synopsis: string;
  imageUrl: string;
  bannerUrl: string | null;
  year: number | null;
  season: string | null;
  format: string | null;
  rawFormat: string | null;
  episodes: number | null;
  durationMins: number | null;
  formatLabel: string | null;
  seasonsLabel: string | null; // backward-compatible alias for formatLabel
  score: number | null;
  averageScore100: number | null;
  scoreSource: 'AniList' | 'MyAnimeList';
  popularity: number;
  trending: number;
  favourites: number;
  status: string | null;
  rawStatus: string | null;
  startDate: string | null;
  endDate: string | null;
  genres: string[];
  tags: { name: string; rank: number }[];
  primaryCategory: string;
  primaryCategorySlug: string;
  studios: string[];
  streaming: VerifiedStreamingOption[];
  streamingAvailability: StreamingAvailabilityInfo;
  trailerUrl: string | null;
  trailerEmbedUrl: string | null;
  providerUrl: string | null;
  lastSyncedAt: string;
}

export interface PaginatedRealmsResult {
  realm?: RealmSectionDefinition;
  items: RealmsAnimeRecord[];
  pageInfo: {
    currentPage: number;
    perPage: number;
    hasNextPage: boolean;
    total: number | null;
    totalEstablished: boolean;
    source: 'anilist' | 'jikan' | 'postgres_cache';
  };
}

// ============================================================================
// OFFICIAL STREAMING ALLOWLIST & VALIDATION (PART 12)
// ============================================================================

const OFFICIAL_STREAMING_ALLOWLIST: {
  matchHost: (host: string) => boolean;
  canonicalName: string;
  accessNote: string;
}[] = [
  {
    matchHost: (h) => h === 'crunchyroll.com' || h.endsWith('.crunchyroll.com'),
    canonicalName: 'Crunchyroll',
    accessNote: 'Subscription / Regional tiers vary',
  },
  {
    matchHost: (h) => h === 'netflix.com' || h.endsWith('.netflix.com'),
    canonicalName: 'Netflix',
    accessNote: 'Subscription required',
  },
  {
    matchHost: (h) => h === 'hidive.com' || h.endsWith('.hidive.com'),
    canonicalName: 'HIDIVE',
    accessNote: 'Subscription required',
  },
  {
    matchHost: (h) => h === 'hulu.com' || h.endsWith('.hulu.com'),
    canonicalName: 'Hulu',
    accessNote: 'Subscription required (US/JP)',
  },
  {
    matchHost: (h) => h === 'disneyplus.com' || h.endsWith('.disneyplus.com'),
    canonicalName: 'Disney+',
    accessNote: 'Subscription required',
  },
  {
    matchHost: (h) =>
      h === 'primevideo.com' ||
      h.endsWith('.primevideo.com') ||
      h === 'amazon.com' ||
      h.endsWith('.amazon.com'),
    canonicalName: 'Prime Video',
    accessNote: 'Subscription or digital rental',
  },
  {
    matchHost: (h) => h === 'bilibili.tv' || h.endsWith('.bilibili.tv') || h === 'bilibili.com' || h.endsWith('.bilibili.com'),
    canonicalName: 'Bilibili',
    accessNote: 'Regional / Freemium tiers vary',
  },
  {
    matchHost: (h) => h === 'iq.com' || h.endsWith('.iq.com'),
    canonicalName: 'iQIYI',
    accessNote: 'Regional / VIP tiers vary',
  },
  {
    matchHost: (h) => h === 'tubitv.com' || h.endsWith('.tubitv.com'),
    canonicalName: 'Tubi',
    accessNote: 'Ad-supported regional availability',
  },
  {
    matchHost: (h) => h === 'pluto.tv' || h.endsWith('.pluto.tv'),
    canonicalName: 'Pluto TV',
    accessNote: 'Ad-supported regional availability',
  },
  {
    matchHost: (h) => h === 'max.com' || h.endsWith('.max.com') || h === 'hbomax.com' || h.endsWith('.hbomax.com'),
    canonicalName: 'Max',
    accessNote: 'Subscription required',
  },
  {
    matchHost: (h) => h === 'adultswim.com' || h.endsWith('.adultswim.com'),
    canonicalName: 'Adult Swim',
    accessNote: 'Cable / Regional login may apply',
  },
  {
    matchHost: (h) => h === 'youtube.com' || h.endsWith('.youtube.com') || h === 'youtu.be',
    canonicalName: 'YouTube (Official Channel)',
    accessNote: 'Official distributor channel · Regional availability applies',
  },
];

const STREAMING_DISCLAIMER =
  'Opens an external licensed platform. Regional licensing and subscription requirements vary by country.';

export function classifyStreamingLinks(
  rawLinks: { name?: string | null; site?: string | null; url?: string | null; language?: string | null; type?: string | null; isDisabled?: boolean | null }[],
  providerCatalogUrl: string | null
): StreamingAvailabilityInfo {
  const verifiedOptions: VerifiedStreamingOption[] = [];
  const seenUrls = new Set<string>();
  const seenPlatforms = new Set<string>();
  const platformMentions = new Set<string>();

  for (const raw of rawLinks || []) {
    if (!raw || raw.isDisabled) continue;
    if (raw.type && raw.type !== 'STREAMING') continue;

    const label = String(raw.name || raw.site || '').trim();
    const urlStr = String(raw.url || '').trim();
    if (!urlStr) {
      if (label) platformMentions.add(label);
      continue;
    }

    let parsed: URL;
    try {
      parsed = new URL(urlStr);
    } catch {
      continue;
    }

    if (parsed.protocol !== 'https:') continue;
    const host = parsed.hostname.toLowerCase();
    const allowEntry = OFFICIAL_STREAMING_ALLOWLIST.find((entry) => entry.matchHost(host));
    if (!allowEntry) continue;

    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    const hasTitleSpecificPath =
      cleanPath.length > 1 ||
      (host.includes('youtube.com') && (parsed.searchParams.has('v') || parsed.searchParams.has('list')));

    if (!hasTitleSpecificPath) {
      platformMentions.add(allowEntry.canonicalName);
      continue;
    }

    const dedupKey = `${allowEntry.canonicalName}:${parsed.origin}${cleanPath}`;
    if (seenUrls.has(dedupKey) || seenPlatforms.has(allowEntry.canonicalName)) continue;
    seenUrls.add(dedupKey);
    seenPlatforms.add(allowEntry.canonicalName);

    verifiedOptions.push({
      name: allowEntry.canonicalName,
      url: parsed.toString(),
      hostname: host.replace(/^www\./, ''),
      accessNote: allowEntry.accessNote,
      language: raw.language || null,
    });
  }

  for (const v of verifiedOptions) {
    platformMentions.delete(v.name);
  }

  const mentionsList = Array.from(platformMentions);
  let caseType: 'B' | 'C' | 'D' | 'E' = 'E';
  if (verifiedOptions.length === 1) {
    caseType = 'B';
  } else if (verifiedOptions.length > 1) {
    caseType = 'C';
  } else if (mentionsList.length > 0) {
    caseType = 'D';
  }

  return {
    caseType,
    primaryOption: verifiedOptions[0] || null,
    verifiedOptions,
    platformMentions: mentionsList,
    providerCatalogUrl,
    disclaimer: STREAMING_DISCLAIMER,
  };
}

// ============================================================================
// TEXT, FORMAT & NORMALIZATION HELPERS
// ============================================================================

export function normalizeAnimeTitle(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripCleanSynopsis(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[^>]+(>|$)/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&mdash;/g, '—')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function humanizeFormat(rawFormat?: string | null): string | null {
  if (!rawFormat) return null;
  const map: Record<string, string> = {
    TV: 'TV Series',
    TV_SHORT: 'TV Short',
    MOVIE: 'Movie',
    SPECIAL: 'Special',
    OVA: 'OVA',
    ONA: 'ONA',
    MUSIC: 'Music Video',
    Movie: 'Movie',
    Special: 'Special',
  };
  return map[rawFormat] || rawFormat;
}

function humanizeStatus(rawStatus?: string | null): string | null {
  if (!rawStatus) return null;
  const map: Record<string, string> = {
    RELEASING: 'Currently Airing',
    FINISHED: 'Finished Airing',
    NOT_YET_RELEASED: 'Not Yet Released',
    CANCELLED: 'Cancelled',
    HIATUS: 'On Hiatus',
    'Currently Airing': 'Currently Airing',
    'Finished Airing': 'Finished Airing',
    'Not yet aired': 'Not Yet Released',
  };
  return map[rawStatus] || rawStatus;
}

function formatFuzzyDate(d?: { year?: number | null; month?: number | null; day?: number | null } | null): string | null {
  if (!d?.year) return null;
  const y = String(d.year);
  if (!d.month) return y;
  const m = String(d.month).padStart(2, '0');
  if (!d.day) return `${y}-${m}`;
  const day = String(d.day).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function isMovieFormat(fmt?: string | null): boolean {
  return fmt === 'Movie' || fmt === 'MOVIE';
}

function makeFormatSummary(
  humanFmt: string | null,
  episodes: number | null,
  durationMins: number | null,
  rawStatus: string | null
): string | null {
  const parts: string[] = [];
  if (humanFmt) parts.push(humanFmt);
  if (isMovieFormat(humanFmt)) {
    if (durationMins && durationMins > 0) parts.push(`${durationMins} min`);
  } else if (typeof episodes === 'number' && episodes > 0) {
    parts.push(`${episodes} ${episodes === 1 ? 'episode' : 'episodes'}`);
  } else if (rawStatus === 'RELEASING') {
    parts.push('Ongoing');
  } else if (rawStatus === 'NOT_YET_RELEASED') {
    parts.push('Upcoming');
  }
  return parts.length > 0 ? parts.join(' · ') : null;
}

// ============================================================================
// ANILIST GRAPHQL & JIKAN CACHED CLIENTS WITH IN-FLIGHT DEDUP & THROTTLING
// ============================================================================

const responseCache = new Map<string, { expiresAt: number; staleUntil: number; value: any }>();
const inFlightRequests = new Map<string, Promise<any>>();
let anilistCooldownUntil = 0;
let lastJikanCallAt = 0;

const ANILIST_MEDIA_FIELDS = `
  id
  idMal
  siteUrl
  title {
    english
    romaji
    native
  }
  synonyms
  season
  seasonYear
  format
  status
  episodes
  duration
  averageScore
  popularity
  trending
  favourites
  isAdult
  description(asHtml: false)
  genres
  tags {
    name
    rank
    isMediaSpoiler
    isAdult
  }
  startDate { year month day }
  endDate { year month day }
  bannerImage
  coverImage {
    extraLarge
    large
  }
  studios(isMain: true) {
    nodes {
      name
    }
  }
  trailer {
    id
    site
  }
  externalLinks {
    site
    url
    type
    language
    isDisabled
  }
`;

export async function queryAniListCached(
  query: string,
  variables: Record<string, any> = {},
  ttlMs = 20 * 60 * 1000
): Promise<any | null> {
  const cacheKey = `al:${query.replace(/\s+/g, ' ').trim()}:${JSON.stringify(variables)}`;
  const now = Date.now();
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inflight = inFlightRequests.get(cacheKey);
  if (inflight) return inflight;

  const task = (async () => {
    if (Date.now() < anilistCooldownUntil) {
      return cached && cached.staleUntil > Date.now() ? cached.value : null;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 7500);
    try {
      const resp = await fetch(ANILIST_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
          'User-Agent': 'KAGE-Realms/2.0',
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      if (resp.status === 429) {
        const retryAfter = Number(resp.headers.get('retry-after') || '15');
        anilistCooldownUntil = Date.now() + Math.min(60, Math.max(5, retryAfter)) * 1000;
        return cached && cached.staleUntil > Date.now() ? cached.value : null;
      }

      if (!resp.ok) {
        return cached && cached.staleUntil > Date.now() ? cached.value : null;
      }

      const payload = await resp.json();
      if (!payload?.data) {
        return cached && cached.staleUntil > Date.now() ? cached.value : null;
      }

      responseCache.set(cacheKey, {
        value: payload.data,
        expiresAt: Date.now() + ttlMs,
        staleUntil: Date.now() + ttlMs * 6,
      });
      return payload.data;
    } catch {
      return cached && cached.staleUntil > Date.now() ? cached.value : null;
    } finally {
      clearTimeout(timer);
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, task);
  return task;
}

export async function queryJikanCached(path: string, ttlMs = 30 * 60 * 1000): Promise<any | null> {
  const cacheKey = `jk:${path}`;
  const now = Date.now();
  const cached = responseCache.get(cacheKey);
  if (cached && cached.expiresAt > now) {
    return cached.value;
  }

  const inflight = inFlightRequests.get(cacheKey);
  if (inflight) return inflight;

  const task = (async () => {
    // Respect Jikan 3 req/sec rate limit
    const elapsed = Date.now() - lastJikanCallAt;
    if (elapsed < 360) {
      await new Promise((r) => setTimeout(r, 360 - elapsed));
    }
    lastJikanCallAt = Date.now();

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6500);
    try {
      const resp = await fetch(`${JIKAN_BASE}${path}`, {
        headers: { Accept: 'application/json', 'User-Agent': 'KAGE-Realms/2.0' },
        signal: controller.signal,
      });
      if (!resp.ok) {
        return cached && cached.staleUntil > Date.now() ? cached.value : null;
      }
      const data = await resp.json();
      responseCache.set(cacheKey, {
        value: data,
        expiresAt: Date.now() + ttlMs,
        staleUntil: Date.now() + ttlMs * 6,
      });
      return data;
    } catch {
      return cached && cached.staleUntil > Date.now() ? cached.value : null;
    } finally {
      clearTimeout(timer);
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, task);
  return task;
}

// ============================================================================
// RECORD MAPPING (ANILIST, JIKAN & POSTGRES)
// ============================================================================

export function mapAniListMediaToRecord(media: any): RealmsAnimeRecord | null {
  if (!media || media.isAdult) return null;
  const anilistId = typeof media.id === 'number' ? media.id : null;
  const malId = typeof media.idMal === 'number' && media.idMal > 0 ? media.idMal : null;
  if (!anilistId && !malId) return null;

  const canonicalId = malId ?? SYNTHETIC_ID_OFFSET + (anilistId as number);
  const coverUrl =
    media.coverImage?.extraLarge || media.coverImage?.large || '';
  if (!coverUrl) return null;

  const romajiTitle = String(
    media.title?.romaji || media.title?.english || media.title?.native || 'Untitled Anime'
  ).trim();
  const englishTitle = media.title?.english ? String(media.title.english).trim() : null;
  const nativeTitle = media.title?.native ? String(media.title.native).trim() : null;
  const displayTitle = englishTitle || romajiTitle;

  const rawFormat = media.format ? String(media.format) : null;
  const humanFmt = humanizeFormat(rawFormat);
  const rawStatus = media.status ? String(media.status) : null;
  const humanSt = humanizeStatus(rawStatus);
  const episodes = typeof media.episodes === 'number' && media.episodes > 0 ? media.episodes : null;
  const durationMins =
    typeof media.duration === 'number' && media.duration > 0 ? media.duration : null;
  const year =
    media.seasonYear || media.startDate?.year || null;

  const averageScore100 =
    typeof media.averageScore === 'number' && media.averageScore > 0
      ? Math.round(media.averageScore)
      : null;
  const score =
    averageScore100 !== null ? Math.round((averageScore100 / 10) * 10) / 10 : null;

  const cleanTags = Array.isArray(media.tags)
    ? media.tags
        .filter((t: any) => t?.name && !t.isMediaSpoiler && !t.isAdult)
        .slice(0, 14)
        .map((t: any) => ({ name: String(t.name), rank: Number(t.rank || 0) }))
    : [];

  // Preserve exact Solo Leveling KAGE hero art when matching MAL 52299 if no upstream banner
  const verifiedSeed = malId
    ? VERIFIED_ANIME_CATALOG.find((v) => v.malId === malId)
    : undefined;

  const bannerUrl =
    (malId === 52299 ? '/assets/extracted/solo-hero-home.jpg' : null) ||
    media.bannerImage ||
    verifiedSeed?.bannerUrl ||
    null;

  const providerUrl =
    media.siteUrl ||
    (anilistId ? `https://anilist.co/anime/${anilistId}` : malId ? `https://myanimelist.net/anime/${malId}` : null);

  const rawStreamingInput = [
    ...(Array.isArray(media.externalLinks) ? media.externalLinks : []),
    ...(verifiedSeed?.streaming || []).map((s) => ({
      name: s.name,
      url: s.url,
      type: 'STREAMING',
    })),
  ];
  const streamingAvailability = classifyStreamingLinks(rawStreamingInput, providerUrl);

  let trailerUrl: string | null = null;
  let trailerEmbedUrl: string | null = null;
  if (media.trailer?.id && String(media.trailer.site || '').toLowerCase() === 'youtube') {
    const ytId = String(media.trailer.id).trim();
    trailerUrl = `https://www.youtube.com/watch?v=${ytId}`;
    trailerEmbedUrl = `https://www.youtube-nocookie.com/embed/${ytId}`;
  }

  const formatLabel = makeFormatSummary(humanFmt, episodes, durationMins, rawStatus);

  const cleanGenres = Array.isArray(media.genres) ? media.genres.filter(Boolean) : [];
  const cleanSynopsis =
    stripCleanSynopsis(media.description) ||
    verifiedSeed?.synopsis ||
    'Official synopsis has not been published for this title yet.';
  const primaryCategory = resolvePrimaryAnimeCategory({
    malId,
    title: displayTitle,
    englishTitle,
    romajiTitle,
    genres: cleanGenres,
    tags: cleanTags,
    synopsis: cleanSynopsis,
  });

  return {
    canonicalId,
    malId,
    anilistId,
    provider: 'anilist',
    providerId: String(anilistId || malId),
    slug: slugifyRealm(displayTitle) || `anime-${canonicalId}`,
    title: displayTitle,
    englishTitle,
    romajiTitle,
    nativeTitle,
    synonyms: Array.isArray(media.synonyms)
      ? media.synonyms.filter((s: any) => typeof s === 'string').slice(0, 8)
      : [],
    synopsis: cleanSynopsis,
    imageUrl: coverUrl,
    bannerUrl,
    year,
    season: media.season ? String(media.season) : null,
    format: humanFmt,
    rawFormat,
    episodes,
    durationMins,
    formatLabel,
    seasonsLabel: formatLabel,
    score,
    averageScore100,
    scoreSource: 'AniList',
    popularity: Number(media.popularity || 0),
    trending: Number(media.trending || 0),
    favourites: Number(media.favourites || 0),
    status: humanSt,
    rawStatus,
    startDate: formatFuzzyDate(media.startDate),
    endDate: formatFuzzyDate(media.endDate),
    genres: cleanGenres,
    tags: cleanTags,
    primaryCategory,
    primaryCategorySlug: slugifyRealm(primaryCategory),
    studios: Array.isArray(media.studios?.nodes)
      ? media.studios.nodes.map((s: any) => String(s.name)).filter(Boolean)
      : [],
    streaming: streamingAvailability.verifiedOptions,
    streamingAvailability,
    trailerUrl,
    trailerEmbedUrl,
    providerUrl,
    lastSyncedAt: new Date().toISOString(),
  };
}

export function mapJikanToRecord(raw: any): RealmsAnimeRecord | null {
  if (!raw || !raw.mal_id) return null;
  const malId = Number(raw.mal_id);
  const coverUrl =
    raw.images?.webp?.large_image_url ||
    raw.images?.jpg?.large_image_url ||
    raw.images?.jpg?.image_url ||
    '';
  if (!coverUrl) return null;

  const verifiedSeed = VERIFIED_ANIME_CATALOG.find((v) => v.malId === malId);
  const englishTitle = raw.title_english ? String(raw.title_english).trim() : null;
  const romajiTitle = String(raw.title || englishTitle || 'Untitled Anime').trim();
  const nativeTitle = raw.title_japanese ? String(raw.title_japanese).trim() : null;
  const displayTitle = englishTitle || romajiTitle;

  const rawType = raw.type ? String(raw.type).toUpperCase().replace(/\s+/g, '_') : null;
  const humanFmt = humanizeFormat(rawType || raw.type);
  const rawStatus =
    raw.status === 'Currently Airing'
      ? 'RELEASING'
      : raw.status === 'Finished Airing'
        ? 'FINISHED'
        : raw.status === 'Not yet aired'
          ? 'NOT_YET_RELEASED'
          : null;
  const episodes = typeof raw.episodes === 'number' && raw.episodes > 0 ? raw.episodes : null;
  const parsedDuration = raw.duration ? parseInt(String(raw.duration), 10) : NaN;
  const durationMins = !Number.isNaN(parsedDuration) && parsedDuration > 0 ? parsedDuration : null;
  const year = raw.year || raw.aired?.prop?.from?.year || verifiedSeed?.year || null;

  const score = typeof raw.score === 'number' && raw.score > 0 ? Math.round(raw.score * 10) / 10 : null;
  const averageScore100 = score !== null ? Math.round(score * 10) : null;

  const genres = Array.from(
    new Set([
      ...(raw.genres || []).map((g: any) => String(g.name)),
      ...(raw.themes || []).map((t: any) => String(t.name)),
      ...(raw.demographics || []).map((d: any) => String(d.name)),
    ])
  ).filter(Boolean);

  const providerUrl = raw.url || `https://myanimelist.net/anime/${malId}`;
  const rawStreaming = [
    ...(Array.isArray(raw.streaming) ? raw.streaming : []).map((s: any) => ({
      name: s.name,
      url: s.url,
      type: 'STREAMING',
    })),
    ...(verifiedSeed?.streaming || []).map((s) => ({
      name: s.name,
      url: s.url,
      type: 'STREAMING',
    })),
  ];
  const streamingAvailability = classifyStreamingLinks(rawStreaming, providerUrl);

  const ytId = raw.trailer?.youtube_id ? String(raw.trailer.youtube_id).trim() : '';
  const trailerUrl = ytId ? `https://www.youtube.com/watch?v=${ytId}` : raw.trailer?.url || null;
  const trailerEmbedUrl = ytId ? `https://www.youtube-nocookie.com/embed/${ytId}` : null;

  const formatLabel = makeFormatSummary(humanFmt, episodes, durationMins, rawStatus);

  const cleanSynopsis =
    stripCleanSynopsis(raw.synopsis) ||
    verifiedSeed?.synopsis ||
    'Official synopsis has not been published for this title yet.';
  const primaryCategory = resolvePrimaryAnimeCategory({
    malId,
    title: displayTitle,
    englishTitle,
    romajiTitle,
    genres,
    tags: [],
    synopsis: cleanSynopsis,
  });

  return {
    canonicalId: malId,
    malId,
    anilistId: null,
    provider: 'jikan',
    providerId: String(malId),
    slug: slugifyRealm(displayTitle) || `anime-${malId}`,
    title: displayTitle,
    englishTitle,
    romajiTitle,
    nativeTitle,
    synonyms: Array.isArray(raw.title_synonyms) ? raw.title_synonyms.slice(0, 8) : [],
    synopsis: cleanSynopsis,
    imageUrl: coverUrl,
    bannerUrl: verifiedSeed?.bannerUrl || raw.trailer?.images?.maximum_image_url || null,
    year,
    season: raw.season ? String(raw.season).toUpperCase() : null,
    format: humanFmt,
    rawFormat: rawType,
    episodes,
    durationMins,
    formatLabel,
    seasonsLabel: formatLabel,
    score,
    averageScore100,
    scoreSource: 'MyAnimeList',
    popularity: Number(raw.members || 0),
    trending: 0,
    favourites: Number(raw.favorites || 0),
    status: humanizeStatus(rawStatus || raw.status),
    rawStatus,
    startDate: raw.aired?.from ? String(raw.aired.from).slice(0, 10) : null,
    endDate: raw.aired?.to ? String(raw.aired.to).slice(0, 10) : null,
    genres,
    tags: [],
    primaryCategory,
    primaryCategorySlug: slugifyRealm(primaryCategory),
    studios: Array.isArray(raw.studios) ? raw.studios.map((s: any) => String(s.name)) : [],
    streaming: streamingAvailability.verifiedOptions,
    streamingAvailability,
    trailerUrl,
    trailerEmbedUrl,
    providerUrl,
    lastSyncedAt: new Date().toISOString(),
  };
}

function mapCatalogRowToRecord(
  row: typeof animeCatalog.$inferSelect,
  genres: string[],
  tags: { name: string; rank: number }[]
): RealmsAnimeRecord {
  const displayTitle = row.titleEnglish || row.titleRomaji;
  const humanFmt = humanizeFormat(row.format);
  const formatLabel = makeFormatSummary(humanFmt, row.episodes, row.durationMins, row.status);
  const score =
    typeof row.averageScore === 'number' && row.averageScore > 0
      ? Math.round((row.averageScore / 10) * 10) / 10
      : null;

  const streamingAvailability = classifyStreamingLinks(
    (row.streamingLinks || []).map((s) => ({
      name: s.name,
      url: s.url,
      language: s.language,
      type: s.type || 'STREAMING',
    })),
    row.providerUrl || null
  );

  let trailerEmbedUrl: string | null = null;
  if (row.trailerUrl && row.trailerUrl.includes('youtube.com/watch?v=')) {
    const idPart = row.trailerUrl.split('watch?v=')[1]?.split('&')[0];
    if (idPart) trailerEmbedUrl = `https://www.youtube-nocookie.com/embed/${idPart}`;
  }

  const computedPrimary = resolvePrimaryAnimeCategory({
    malId: row.malId ?? null,
    title: displayTitle,
    englishTitle: row.titleEnglish ?? null,
    romajiTitle: row.titleRomaji,
    genres,
    tags,
    synopsis: row.synopsis,
  });

  return {
    canonicalId: row.canonicalId,
    malId: row.malId ?? null,
    anilistId: row.anilistId ?? null,
    provider: (row.provider as any) || 'anilist',
    providerId: row.providerId,
    slug: row.slug,
    title: displayTitle,
    englishTitle: row.titleEnglish ?? null,
    romajiTitle: row.titleRomaji,
    nativeTitle: row.titleNative ?? null,
    synonyms: Array.isArray(row.synonyms) ? row.synonyms : [],
    synopsis: row.synopsis || 'Official synopsis has not been published for this title yet.',
    imageUrl: row.coverImageUrl,
    bannerUrl: row.bannerImageUrl ?? null,
    year: row.releaseYear ?? null,
    season: row.season ?? null,
    format: humanFmt,
    rawFormat: row.format ?? null,
    episodes: row.episodes ?? null,
    durationMins: row.durationMins ?? null,
    formatLabel,
    seasonsLabel: formatLabel,
    score,
    averageScore100: row.averageScore ?? null,
    scoreSource: row.scoreSource === 'MyAnimeList' ? 'MyAnimeList' : 'AniList',
    popularity: row.popularity || 0,
    trending: row.trending || 0,
    favourites: row.favourites || 0,
    status: humanizeStatus(row.status),
    rawStatus: row.status ?? null,
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
    genres,
    tags,
    primaryCategory: computedPrimary,
    primaryCategorySlug: slugifyRealm(computedPrimary),
    studios: Array.isArray(row.studios) ? row.studios : [],
    streaming: streamingAvailability.verifiedOptions,
    streamingAvailability,
    trailerUrl: row.trailerUrl ?? null,
    trailerEmbedUrl,
    providerUrl: row.providerUrl ?? null,
    lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : new Date().toISOString(),
  };
}

// ============================================================================
// DEDUPLICATION & NORMALIZED POSTGRESQL PERSISTENCE (PART 8 & PART 16)
// ============================================================================

export function deduplicateAnimeRecords(records: RealmsAnimeRecord[]): RealmsAnimeRecord[] {
  const byCanonical = new Map<number, RealmsAnimeRecord>();
  const byTitleYearFormat = new Map<string, number>();

  for (const rec of records) {
    if (!rec || !rec.imageUrl) continue;
    const normKey = `${normalizeAnimeTitle(rec.title)}|${rec.year || 'na'}|${rec.rawFormat || 'na'}`;

    const existingId = byCanonical.has(rec.canonicalId)
      ? rec.canonicalId
      : byTitleYearFormat.get(normKey);

    if (existingId !== undefined) {
      const prev = byCanonical.get(existingId)!;
      // Merge richer fields without ever cross-contaminating another anime's artwork
      const merged: RealmsAnimeRecord = {
        ...prev,
        anilistId: prev.anilistId || rec.anilistId,
        malId: prev.malId || rec.malId,
        bannerUrl: prev.bannerUrl || rec.bannerUrl,
        englishTitle: prev.englishTitle || rec.englishTitle,
        nativeTitle: prev.nativeTitle || rec.nativeTitle,
        episodes: prev.episodes || rec.episodes,
        durationMins: prev.durationMins || rec.durationMins,
        genres: Array.from(new Set([...prev.genres, ...rec.genres])),
        tags: prev.tags.length >= rec.tags.length ? prev.tags : rec.tags,
        studios: prev.studios.length >= rec.studios.length ? prev.studios : rec.studios,
        streaming:
          prev.streaming.length >= rec.streaming.length ? prev.streaming : rec.streaming,
        streamingAvailability:
          prev.streaming.length >= rec.streaming.length
            ? prev.streamingAvailability
            : rec.streamingAvailability,
        trailerUrl: prev.trailerUrl || rec.trailerUrl,
        trailerEmbedUrl: prev.trailerEmbedUrl || rec.trailerEmbedUrl,
      };
      byCanonical.set(existingId, merged);
    } else {
      byCanonical.set(rec.canonicalId, rec);
      byTitleYearFormat.set(normKey, rec.canonicalId);
    }
  }

  return Array.from(byCanonical.values());
}

const genreIdCache = new Map<string, number>();
const tagIdCache = new Map<string, number>();
let persistenceChain: Promise<void> = Promise.resolve();

async function resolveGenreIds(names: string[]): Promise<number[]> {
  const clean = Array.from(new Set(names.map((n) => n.trim()).filter(Boolean)));
  if (clean.length === 0) return [];

  const missing = clean.filter((n) => !genreIdCache.has(n.toLowerCase()));
  if (missing.length > 0) {
    for (const name of missing) {
      const slug = slugifyRealm(name);
      if (!slug) continue;
      await db
        .insert(animeGenres)
        .values({ name, slug })
        .onConflictDoNothing();
    }
    const rows = await db.select().from(animeGenres);
    for (const r of rows) {
      genreIdCache.set(r.name.toLowerCase(), r.id);
      genreIdCache.set(r.slug, r.id);
    }
  }

  return clean
    .map((n) => genreIdCache.get(n.toLowerCase()) || genreIdCache.get(slugifyRealm(n)))
    .filter((id): id is number => typeof id === 'number');
}

async function resolveTagIds(tags: { name: string; rank: number }[]): Promise<{ tagId: number; rank: number }[]> {
  const clean = tags.filter((t) => t.name && t.name.trim());
  if (clean.length === 0) return [];

  const missing = clean.filter((t) => !tagIdCache.has(t.name.toLowerCase()));
  if (missing.length > 0) {
    for (const t of missing) {
      const slug = slugifyRealm(t.name);
      if (!slug) continue;
      await db
        .insert(animeTags)
        .values({ name: t.name.trim(), slug })
        .onConflictDoNothing();
    }
    const rows = await db.select().from(animeTags);
    for (const r of rows) {
      tagIdCache.set(r.name.toLowerCase(), r.id);
      tagIdCache.set(r.slug, r.id);
    }
  }

  const seen = new Set<number>();
  const out: { tagId: number; rank: number }[] = [];
  for (const t of clean) {
    const id = tagIdCache.get(t.name.toLowerCase()) || tagIdCache.get(slugifyRealm(t.name));
    if (typeof id === 'number' && !seen.has(id)) {
      seen.add(id);
      out.push({ tagId: id, rank: t.rank || 0 });
    }
  }
  return out;
}

export function enqueueCatalogPersistence(records: RealmsAnimeRecord[]): void {
  const deduped = deduplicateAnimeRecords(records);
  if (deduped.length === 0) return;

  persistenceChain = persistenceChain
    .then(async () => {
      for (const rec of deduped) {
        try {
          const [saved] = await db
            .insert(animeCatalog)
            .values({
              canonicalId: rec.canonicalId,
              malId: rec.malId,
              anilistId: rec.anilistId,
              provider: rec.provider,
              providerId: rec.providerId,
              slug: rec.slug,
              titleEnglish: rec.englishTitle,
              titleRomaji: rec.romajiTitle,
              titleNative: rec.nativeTitle,
              normalizedTitle: normalizeAnimeTitle(`${rec.title} ${rec.romajiTitle}`),
              synonyms: rec.synonyms,
              synopsis: rec.synopsis,
              coverImageUrl: rec.imageUrl,
              bannerImageUrl: rec.bannerUrl,
              releaseYear: rec.year,
              season: rec.season,
              format: rec.rawFormat,
              episodes: rec.episodes,
              durationMins: rec.durationMins,
              averageScore: rec.averageScore100,
              scoreSource: rec.scoreSource,
              popularity: rec.popularity,
              trending: rec.trending,
              favourites: rec.favourites,
              status: rec.rawStatus,
              startDate: rec.startDate,
              endDate: rec.endDate,
              studios: rec.studios,
              streamingLinks: rec.streaming.map((s) => ({
                name: s.name,
                url: s.url,
                language: s.language || null,
                type: 'STREAMING',
              })),
              trailerUrl: rec.trailerUrl,
              providerUrl: rec.providerUrl,
              primaryCategory: rec.primaryCategory,
              isAdult: false,
              lastSyncedAt: new Date(),
            })
            .onConflictDoUpdate({
              target: animeCatalog.canonicalId,
              set: {
                anilistId: sql`COALESCE(EXCLUDED.anilist_id, ${animeCatalog.anilistId})`,
                malId: sql`COALESCE(EXCLUDED.mal_id, ${animeCatalog.malId})`,
                titleEnglish: sql`COALESCE(EXCLUDED.title_english, ${animeCatalog.titleEnglish})`,
                titleNative: sql`COALESCE(EXCLUDED.title_native, ${animeCatalog.titleNative})`,
                synopsis: sql`CASE WHEN LENGTH(EXCLUDED.synopsis) > 20 THEN EXCLUDED.synopsis ELSE ${animeCatalog.synopsis} END`,
                coverImageUrl: rec.imageUrl,
                bannerImageUrl: sql`COALESCE(EXCLUDED.banner_image_url, ${animeCatalog.bannerImageUrl})`,
                releaseYear: sql`COALESCE(EXCLUDED.release_year, ${animeCatalog.releaseYear})`,
                format: sql`COALESCE(EXCLUDED.format, ${animeCatalog.format})`,
                episodes: sql`COALESCE(EXCLUDED.episodes, ${animeCatalog.episodes})`,
                durationMins: sql`COALESCE(EXCLUDED.duration_mins, ${animeCatalog.durationMins})`,
                averageScore: sql`COALESCE(EXCLUDED.average_score, ${animeCatalog.averageScore})`,
                popularity: sql`GREATEST(EXCLUDED.popularity, ${animeCatalog.popularity})`,
                trending: rec.trending,
                favourites: sql`GREATEST(EXCLUDED.favourites, ${animeCatalog.favourites})`,
                status: sql`COALESCE(EXCLUDED.status, ${animeCatalog.status})`,
                studios: rec.studios.length > 0 ? rec.studios : sql`${animeCatalog.studios}`,
                streamingLinks:
                  rec.streaming.length > 0
                    ? rec.streaming.map((s) => ({
                        name: s.name,
                        url: s.url,
                        language: s.language || null,
                        type: 'STREAMING',
                      }))
                    : sql`${animeCatalog.streamingLinks}`,
                trailerUrl: sql`COALESCE(EXCLUDED.trailer_url, ${animeCatalog.trailerUrl})`,
                providerUrl: sql`COALESCE(EXCLUDED.provider_url, ${animeCatalog.providerUrl})`,
                primaryCategory: rec.primaryCategory,
                lastSyncedAt: new Date(),
              },
            })
            .returning({ id: animeCatalog.id });

          if (!saved?.id) continue;

          const gIds = await resolveGenreIds(rec.genres);
          if (gIds.length > 0) {
            await db
              .insert(animeCatalogGenres)
              .values(gIds.map((genreId) => ({ animeId: saved.id, genreId })))
              .onConflictDoNothing();
          }

          const tEntries = await resolveTagIds(rec.tags);
          if (tEntries.length > 0) {
            await db
              .insert(animeCatalogTags)
              .values(
                tEntries.map((te) => ({
                  animeId: saved.id,
                  tagId: te.tagId,
                  rank: te.rank,
                }))
              )
              .onConflictDoNothing();
          }
        } catch {
          // Individual record conflict/constraint errors must never halt batch sync
        }
      }
    })
    .catch(() => {});
}

// ============================================================================
// NORMALIZED POSTGRESQL FALLBACK & SEARCH ENGINE
// ============================================================================

async function hydrateCatalogRows(rows: (typeof animeCatalog.$inferSelect)[]): Promise<RealmsAnimeRecord[]> {
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [genreLinks, tagLinks] = await Promise.all([
    db
      .select({
        animeId: animeCatalogGenres.animeId,
        name: animeGenres.name,
      })
      .from(animeCatalogGenres)
      .innerJoin(animeGenres, eq(animeCatalogGenres.genreId, animeGenres.id))
      .where(inArray(animeCatalogGenres.animeId, ids)),
    db
      .select({
        animeId: animeCatalogTags.animeId,
        name: animeTags.name,
        rank: animeCatalogTags.rank,
      })
      .from(animeCatalogTags)
      .innerJoin(animeTags, eq(animeCatalogTags.tagId, animeTags.id))
      .where(inArray(animeCatalogTags.animeId, ids)),
  ]);

  const gMap = new Map<number, string[]>();
  for (const gl of genreLinks) {
    const arr = gMap.get(gl.animeId) || [];
    arr.push(gl.name);
    gMap.set(gl.animeId, arr);
  }

  const tMap = new Map<number, { name: string; rank: number }[]>();
  for (const tl of tagLinks) {
    const arr = tMap.get(tl.animeId) || [];
    arr.push({ name: tl.name, rank: tl.rank });
    tMap.set(tl.animeId, arr);
  }

  return rows.map((row) =>
    mapCatalogRowToRecord(row, gMap.get(row.id) || [], tMap.get(row.id) || [])
  );
}

export async function queryPostgresCatalog(params: {
  q?: string;
  genreName?: string;
  tagName?: string;
  primaryCategory?: string;
  excludeCanonicalIds?: number[];
  year?: number;
  format?: string;
  status?: string;
  minScore100?: number;
  maxPopularity?: number;
  minPopularity?: number;
  sort?: string;
  page?: number;
  perPage?: number;
}): Promise<{ items: RealmsAnimeRecord[]; total: number }> {
  const page = Math.max(1, params.page || 1);
  const perPage = Math.min(50, Math.max(1, params.perPage || 24));
  const offset = (page - 1) * perPage;

  const conditions: any[] = [eq(animeCatalog.isAdult, false)];

  if (params.primaryCategory) {
    conditions.push(eq(animeCatalog.primaryCategory, params.primaryCategory));
  }

  if (params.excludeCanonicalIds && params.excludeCanonicalIds.length > 0) {
    const safeExclude = params.excludeCanonicalIds.slice(0, 600);
    conditions.push(notInArray(animeCatalog.canonicalId, safeExclude));
  }

  if (params.q && params.q.trim()) {
    const qClean = params.q.trim();
    const norm = normalizeAnimeTitle(qClean);
    conditions.push(
      or(
        ilike(animeCatalog.titleEnglish, `%${qClean}%`),
        ilike(animeCatalog.titleRomaji, `%${qClean}%`),
        ilike(animeCatalog.titleNative, `%${qClean}%`),
        norm ? ilike(animeCatalog.normalizedTitle, `%${norm}%`) : undefined,
        sql`EXISTS (SELECT 1 FROM jsonb_array_elements_text(${animeCatalog.synonyms}) AS syn WHERE syn ILIKE ${'%' + qClean + '%'})`
      )
    );
  }

  if (params.genreName) {
    const gSlug = slugifyRealm(params.genreName);
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${animeCatalogGenres} acg
        INNER JOIN ${animeGenres} ag ON ag.id = acg.genre_id
        WHERE acg.anime_id = ${animeCatalog.id}
          AND (ag.slug = ${gSlug} OR LOWER(ag.name) = ${params.genreName.toLowerCase()})
      )`
    );
  }

  if (params.tagName) {
    const tSlug = slugifyRealm(params.tagName);
    conditions.push(
      sql`EXISTS (
        SELECT 1 FROM ${animeCatalogTags} act
        INNER JOIN ${animeTags} at ON at.id = act.tag_id
        WHERE act.anime_id = ${animeCatalog.id}
          AND (at.slug = ${tSlug} OR LOWER(at.name) = ${params.tagName.toLowerCase()})
      )`
    );
  }

  if (params.year && params.year > 1950) {
    conditions.push(eq(animeCatalog.releaseYear, params.year));
  }
  if (params.format) {
    conditions.push(eq(animeCatalog.format, params.format));
  }
  if (params.status) {
    conditions.push(eq(animeCatalog.status, params.status));
  }
  if (params.minScore100 && params.minScore100 > 0) {
    conditions.push(gte(animeCatalog.averageScore, params.minScore100));
  }
  if (params.minPopularity && params.minPopularity > 0) {
    conditions.push(gte(animeCatalog.popularity, params.minPopularity));
  }
  if (params.maxPopularity && params.maxPopularity > 0) {
    conditions.push(sql`${animeCatalog.popularity} <= ${params.maxPopularity}`);
  }

  const whereClause = and(...conditions);

  let orderByClause: any[] = [desc(animeCatalog.popularity), desc(animeCatalog.averageScore)];
  switch (params.sort) {
    case 'rating':
      orderByClause = [sql`${animeCatalog.averageScore} DESC NULLS LAST`, desc(animeCatalog.popularity)];
      break;
    case 'newest':
      orderByClause = [
        sql`${animeCatalog.releaseYear} DESC NULLS LAST`,
        sql`${animeCatalog.startDate} DESC NULLS LAST`,
        desc(animeCatalog.popularity),
      ];
      break;
    case 'oldest':
      orderByClause = [
        sql`${animeCatalog.releaseYear} ASC NULLS LAST`,
        sql`${animeCatalog.startDate} ASC NULLS LAST`,
      ];
      break;
    case 'title':
    case 'title_asc':
      orderByClause = [
        asc(sql`COALESCE(${animeCatalog.titleEnglish}, ${animeCatalog.titleRomaji})`),
      ];
      break;
    case 'trending':
      orderByClause = [desc(animeCatalog.trending), desc(animeCatalog.popularity)];
      break;
    default:
      orderByClause = [desc(animeCatalog.popularity), sql`${animeCatalog.averageScore} DESC NULLS LAST`];
  }

  const [countRes, rows] = await Promise.all([
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(animeCatalog)
      .where(whereClause),
    db
      .select()
      .from(animeCatalog)
      .where(whereClause)
      .orderBy(...orderByClause)
      .limit(perPage)
      .offset(offset),
  ]);

  const items = await hydrateCatalogRows(rows);
  return {
    items,
    total: Number(countRes[0]?.cnt || 0),
  };
}

// ============================================================================
// REALMS SECTION BATCHING & PAGINATED CATALOG ENGINE (PARTS 3, 4, 5, 6, 13, 15)
// ============================================================================

function getTodayFuzzyInt(): number {
  const now = new Date();
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, '0');
  const d = String(now.getUTCDate()).padStart(2, '0');
  return Number(`${y}${m}${d}`);
}

function buildAniListSectionArgs(def: RealmSectionDefinition, perPage = 16, page = 1): string {
  const args: string[] = ['type: ANIME', 'isAdult: false'];

  if (def.anilistGenre) {
    args.push(`genre: ${JSON.stringify(def.anilistGenre)}`);
    args.push('sort: [POPULARITY_DESC, SCORE_DESC]');
  } else if (def.anilistTag) {
    args.push(`tag: ${JSON.stringify(def.anilistTag)}`);
    args.push('sort: [POPULARITY_DESC, SCORE_DESC]');
  } else if (def.collectionRule === 'recently_released') {
    args.push('status_in: [RELEASING, FINISHED]');
    args.push(`startDate_lesser: ${getTodayFuzzyInt()}`);
    args.push('startDate_greater: 20230101');
    args.push('sort: [START_DATE_DESC, POPULARITY_DESC]');
  } else if (def.collectionRule === 'trending') {
    args.push('sort: [TRENDING_DESC, POPULARITY_DESC]');
  } else if (def.collectionRule === 'top_rated') {
    args.push('averageScore_greater: 80');
    args.push('popularity_greater: 10000');
    args.push('sort: [SCORE_DESC, POPULARITY_DESC]');
  } else if (def.collectionRule === 'airing') {
    args.push('status: RELEASING');
    args.push('sort: [POPULARITY_DESC, TRENDING_DESC]');
  } else if (def.collectionRule === 'upcoming') {
    args.push('status: NOT_YET_RELEASED');
    args.push('sort: [POPULARITY_DESC]');
  } else if (def.collectionRule === 'hidden_gems') {
    args.push('averageScore_greater: 77');
    args.push('popularity_greater: 3500');
    args.push('popularity_lesser: 48000');
    args.push('sort: [SCORE_DESC, POPULARITY_DESC]');
  } else if (def.collectionRule === 'award_winning') {
    args.push('averageScore_greater: 84');
    args.push('popularity_greater: 85000');
    args.push('sort: [SCORE_DESC, FAVOURITES_DESC]');
  } else {
    args.push('sort: [POPULARITY_DESC]');
  }

  return `Page(page: ${page}, perPage: ${perPage}) { pageInfo { total hasNextPage } media(${args.join(', ')}) { ${ANILIST_MEDIA_FIELDS} } }`;
}

function doesRecordMatchHomepageCategory(
  rec: RealmsAnimeRecord,
  def: RealmSectionDefinition,
  seenCanonicalIds: Set<number>
): boolean {
  if (!rec || seenCanonicalIds.has(rec.canonicalId)) return false;
  if (PRIMARY_CATEGORY_SLUGS_SET.has(def.slug)) {
    return rec.primaryCategorySlug === def.slug;
  }
  return true;
}

export async function fetchRealmsRowsBatch(
  slugs: string[],
  perPage = 16,
  options?: {
    homepageMode?: boolean;
    excludeIds?: Set<number>;
  }
): Promise<
  Record<
    string,
    {
      definition: RealmSectionDefinition;
      items: RealmsAnimeRecord[];
      total: number | null;
      source: string;
    }
  >
> {
  const defs = slugs
    .map((s) => resolveRealmDefinition(s))
    .filter((d): d is RealmSectionDefinition => Boolean(d))
    .slice(0, 10);

  const result: Record<
    string,
    {
      definition: RealmSectionDefinition;
      items: RealmsAnimeRecord[];
      total: number | null;
      source: string;
    }
  > = {};

  if (defs.length === 0) return result;

  const homepageMode = Boolean(options?.homepageMode);
  const seenCanonicalIds = options?.excludeIds || new Set<number>();
  const candidatePerPage = homepageMode ? 50 : perPage;

  const awardDef = defs.find((d) => d.collectionRule === 'award_winning');
  const queryParts = defs.map(
    (def, idx) => `sec_${idx}: ${buildAniListSectionArgs(def, candidatePerPage, 1)}`
  );
  const batchedQuery = `query RealmsBatch { ${queryParts.join('\n')} }`;

  const [alData, jikanAwardRes] = await Promise.all([
    queryAniListCached(batchedQuery, {}, 20 * 60 * 1000),
    awardDef
      ? queryJikanCached(
          `/anime?genres=46&order_by=score&sort=desc&limit=${Math.min(25, candidatePerPage)}&sfw=true`
        )
      : Promise.resolve(null),
  ]);

  const toPersist: RealmsAnimeRecord[] = [];

  for (let i = 0; i < defs.length; i++) {
    const def = defs[i];
    const pageBlock = alData?.[`sec_${i}`];
    let rawItems: RealmsAnimeRecord[] = Array.isArray(pageBlock?.media)
      ? (pageBlock.media
          .map(mapAniListMediaToRecord)
          .filter(Boolean) as RealmsAnimeRecord[])
      : [];
    let hasNextPage = Boolean(pageBlock?.pageInfo?.hasNextPage);
    let total: number | null =
      typeof pageBlock?.pageInfo?.total === 'number' ? pageBlock.pageInfo.total : null;
    let source = 'anilist';

    if (def.collectionRule === 'award_winning' && Array.isArray(jikanAwardRes?.data)) {
      const jkItems = jikanAwardRes.data
        .map(mapJikanToRecord)
        .filter(Boolean) as RealmsAnimeRecord[];
      if (jkItems.length > 0) {
        rawItems = deduplicateAnimeRecords([...jkItems, ...rawItems]);
        total = jikanAwardRes.pagination?.items?.total ?? total;
        source = 'jikan+anilist';
      }
    }

    if (rawItems.length > 0) {
      toPersist.push(...rawItems);
    }

    let selected: RealmsAnimeRecord[] = [];

    if (homepageMode) {
      selected = deduplicateAnimeRecords(rawItems).filter((rec) =>
        doesRecordMatchHomepageCategory(rec, def, seenCanonicalIds)
      );

      // Fetch deeper pages when primary-category filtering + global deduplication leaves fewer than needed unique titles
      let extraPage = 2;
      while (selected.length < Math.min(perPage, 10) && hasNextPage && extraPage <= 3) {
        const extraQuery = `query RealmsExtraPage { extra: ${buildAniListSectionArgs(def, 50, extraPage)} }`;
        const extraRes = await queryAniListCached(extraQuery, {}, 20 * 60 * 1000);
        const extraBlock = extraRes?.extra;
        const extraItems: RealmsAnimeRecord[] = Array.isArray(extraBlock?.media)
          ? (extraBlock.media
              .map(mapAniListMediaToRecord)
              .filter(Boolean) as RealmsAnimeRecord[])
          : [];
        hasNextPage = Boolean(extraBlock?.pageInfo?.hasNextPage);
        if (extraItems.length > 0) {
          toPersist.push(...extraItems);
          const merged = deduplicateAnimeRecords([...selected, ...extraItems]);
          selected = merged.filter((rec) =>
            doesRecordMatchHomepageCategory(rec, def, seenCanonicalIds)
          );
        } else {
          break;
        }
        extraPage++;
      }

      if (selected.length < Math.min(perPage, 8)) {
        const pgFallback = await queryPostgresCatalog({
          primaryCategory: PRIMARY_CATEGORY_SLUGS_SET.has(def.slug) ? def.title : undefined,
          genreName: !PRIMARY_CATEGORY_SLUGS_SET.has(def.slug) ? def.anilistGenre : undefined,
          tagName: !PRIMARY_CATEGORY_SLUGS_SET.has(def.slug) ? def.anilistTag : undefined,
          excludeCanonicalIds: Array.from(seenCanonicalIds),
          status:
            def.collectionRule === 'airing'
              ? 'RELEASING'
              : def.collectionRule === 'upcoming'
                ? 'NOT_YET_RELEASED'
                : undefined,
          minScore100:
            def.collectionRule === 'top_rated'
              ? 80
              : def.collectionRule === 'hidden_gems'
                ? 78
                : undefined,
          sort:
            def.collectionRule === 'top_rated' || def.collectionRule === 'hidden_gems'
              ? 'rating'
              : def.collectionRule === 'recently_released'
                ? 'newest'
                : def.collectionRule === 'trending'
                  ? 'trending'
                  : 'popularity',
          perPage: perPage * 2,
        });
        if (pgFallback.items.length > 0) {
          selected = deduplicateAnimeRecords([...selected, ...pgFallback.items]).filter((rec) =>
            doesRecordMatchHomepageCategory(rec, def, seenCanonicalIds)
          );
          if (rawItems.length === 0) {
            source = 'postgres_cache';
            total = pgFallback.total > 0 ? pgFallback.total : total;
          }
        }
      }

      selected = selected.slice(0, perPage);
      for (const item of selected) {
        seenCanonicalIds.add(item.canonicalId);
      }
    } else {
      if (rawItems.length === 0) {
        const pgFallback = await queryPostgresCatalog({
          genreName: def.anilistGenre,
          tagName: def.anilistTag,
          status:
            def.collectionRule === 'airing'
              ? 'RELEASING'
              : def.collectionRule === 'upcoming'
                ? 'NOT_YET_RELEASED'
                : undefined,
          minScore100:
            def.collectionRule === 'top_rated'
              ? 80
              : def.collectionRule === 'hidden_gems'
                ? 78
                : undefined,
          sort:
            def.collectionRule === 'top_rated' || def.collectionRule === 'hidden_gems'
              ? 'rating'
              : def.collectionRule === 'recently_released'
                ? 'newest'
                : def.collectionRule === 'trending'
                  ? 'trending'
                  : 'popularity',
          perPage,
        });
        rawItems = pgFallback.items;
        total = pgFallback.total > 0 ? pgFallback.total : null;
        source = 'postgres_cache';
      }
      selected = deduplicateAnimeRecords(rawItems).slice(0, perPage);
    }

    result[def.slug] = {
      definition: def,
      items: selected,
      total,
      source,
    };
  }

  if (toPersist.length > 0) {
    enqueueCatalogPersistence(toPersist);
  }

  return result;
}

export async function getRealmsHomePayload() {
  const initialSlugs = REALMS_CATEGORY_SECTIONS.slice(0, 6).map((s) => s.slug);
  const remainingCategorySections = REALMS_CATEGORY_SECTIONS.slice(6);
  const excludeIds = new Set<number>();

  const featuredQuery = `
    query RealmsFeaturedHero {
      trendingTop: Page(page: 1, perPage: 10) {
        media(type: ANIME, isAdult: false, status_in: [RELEASING, FINISHED], sort: [TRENDING_DESC, POPULARITY_DESC]) {
          ${ANILIST_MEDIA_FIELDS}
        }
      }
    }
  `;

  const [heroData, initialRowsMap] = await Promise.all([
    queryAniListCached(featuredQuery, {}, 15 * 60 * 1000),
    fetchRealmsRowsBatch(initialSlugs, 16, { homepageMode: true, excludeIds }),
  ]);

  let spotlightCandidates: RealmsAnimeRecord[] = Array.isArray(heroData?.trendingTop?.media)
    ? (heroData.trendingTop.media
        .map(mapAniListMediaToRecord)
        .filter(Boolean) as RealmsAnimeRecord[])
    : [];

  if (spotlightCandidates.length > 0) {
    enqueueCatalogPersistence(spotlightCandidates);
  } else {
    const pgHero = await queryPostgresCatalog({ sort: 'popularity', perPage: 6 });
    spotlightCandidates = pgHero.items;
  }

  const featured =
    spotlightCandidates.find(
      (c) => Boolean(c.bannerUrl) && c.score !== null && c.synopsis.length > 40
    ) ||
    spotlightCandidates.find((c) => Boolean(c.bannerUrl) && c.synopsis.length > 40) ||
    spotlightCandidates[0] ||
    null;

  const initialRows = initialSlugs
    .map((slug) => initialRowsMap[slug])
    .filter((row) => row && row.items.length > 0);

  return {
    featured,
    featuredPool: spotlightCandidates.slice(0, 6),
    initialRows,
    displayedIds: Array.from(excludeIds),
    deferredCategorySections: remainingCategorySections,
    discoveryCollections: REALMS_DISCOVERY_COLLECTIONS,
    allGenres: ALL_ANIME_GENRES,
  };
}

// ============================================================================
// DEDICATED GENRE / COLLECTION CATALOG WITH SORT, FILTERS & PAGINATION (PART 6)
// ============================================================================

function mapSortToAniList(sort?: string): string[] {
  switch (sort) {
    case 'rating':
      return ['SCORE_DESC', 'POPULARITY_DESC'];
    case 'newest':
      return ['START_DATE_DESC', 'POPULARITY_DESC'];
    case 'oldest':
      return ['START_DATE', 'POPULARITY_DESC'];
    case 'title':
    case 'title_asc':
      return ['TITLE_ENGLISH', 'TITLE_ROMAJI'];
    case 'trending':
      return ['TRENDING_DESC', 'POPULARITY_DESC'];
    case 'popularity':
    default:
      return ['POPULARITY_DESC', 'SCORE_DESC'];
  }
}

export async function getRealmGenreCatalogPage(params: {
  slugOrName: string;
  page?: number;
  perPage?: number;
  sort?: string;
  year?: number;
  format?: string;
  status?: string;
  minScore?: number; // 1..10 or 10..100
  tag?: string;
}): Promise<PaginatedRealmsResult | null> {
  const realm = resolveRealmDefinition(params.slugOrName);
  if (!realm) return null;

  const page = Math.max(1, Number(params.page || 1));
  const perPage = Math.min(48, Math.max(6, Number(params.perPage || 24)));
  const sort = params.sort || 'popularity';
  const year = params.year && params.year > 1950 ? Number(params.year) : undefined;
  const format = params.format ? String(params.format).toUpperCase() : undefined;
  const status = params.status ? String(params.status).toUpperCase() : undefined;
  const rawMin = params.minScore ? Number(params.minScore) : undefined;
  const minScore100 =
    rawMin && rawMin > 0
      ? rawMin <= 10
        ? Math.round(rawMin * 10)
        : Math.round(rawMin)
      : undefined;
  const customTag = params.tag ? String(params.tag).trim() : undefined;

  // Special case: Award-winning without AniList-specific overrides uses Jikan Award Winning (genre 46)
  if (
    realm.collectionRule === 'award_winning' &&
    !customTag &&
    !format &&
    !status &&
    !year &&
    !minScore100 &&
    sort === 'popularity'
  ) {
    const jkRes = await queryJikanCached(
      `/anime?genres=46&page=${page}&limit=${Math.min(25, perPage)}&order_by=members&sort=desc&sfw=true`
    );
    if (Array.isArray(jkRes?.data) && jkRes.data.length > 0) {
      const items = deduplicateAnimeRecords(
        jkRes.data.map(mapJikanToRecord).filter(Boolean) as RealmsAnimeRecord[]
      );
      enqueueCatalogPersistence(items);
      return {
        realm,
        items,
        pageInfo: {
          currentPage: page,
          perPage,
          hasNextPage: Boolean(jkRes.pagination?.has_next_page),
          total:
            typeof jkRes.pagination?.items?.total === 'number'
              ? jkRes.pagination.items.total
              : null,
          totalEstablished: typeof jkRes.pagination?.items?.total === 'number',
          source: 'jikan',
        },
      };
    }
  }

  const variables: Record<string, any> = {
    page,
    perPage,
    sort: mapSortToAniList(
      sort === 'popularity' && realm.collectionRule === 'top_rated'
        ? 'rating'
        : sort === 'popularity' && realm.collectionRule === 'recently_released'
          ? 'newest'
          : sort === 'popularity' && realm.collectionRule === 'trending'
            ? 'trending'
            : sort
    ),
  };

  if (realm.anilistGenre) variables.genre = realm.anilistGenre;
  if (customTag) {
    variables.tag = customTag;
  } else if (realm.anilistTag) {
    variables.tag = realm.anilistTag;
  }
  if (year) variables.seasonYear = year;
  if (format) variables.format = format;

  if (status) {
    variables.status = status;
  } else if (realm.collectionRule === 'airing') {
    variables.status = 'RELEASING';
  } else if (realm.collectionRule === 'upcoming') {
    variables.status = 'NOT_YET_RELEASED';
  }

  if (realm.collectionRule === 'recently_released' && !status && !year) {
    variables.statusIn = ['RELEASING', 'FINISHED'];
    variables.startDateLesser = getTodayFuzzyInt();
    variables.startDateGreater = 20220101;
  }

  if (minScore100) {
    variables.minScore = Math.max(1, minScore100 - 1);
  } else if (realm.collectionRule === 'hidden_gems') {
    variables.minScore = 77;
    variables.popGreater = 3500;
    variables.popLesser = 48000;
  } else if (realm.collectionRule === 'award_winning') {
    variables.minScore = 83;
    variables.popGreater = 60000;
  } else if (realm.collectionRule === 'top_rated') {
    variables.minScore = 79;
    variables.popGreater = 5000;
  }

  const gql = `
    query RealmCatalogPage(
      $page: Int
      $perPage: Int
      $sort: [MediaSort]
      $genre: String
      $tag: String
      $seasonYear: Int
      $format: MediaFormat
      $status: MediaStatus
      $statusIn: [MediaStatus]
      $minScore: Int
      $popGreater: Int
      $popLesser: Int
      $startDateLesser: FuzzyDateInt
      $startDateGreater: FuzzyDateInt
    ) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          currentPage
          hasNextPage
          perPage
        }
        media(
          type: ANIME
          isAdult: false
          sort: $sort
          genre: $genre
          tag: $tag
          seasonYear: $seasonYear
          format: $format
          status: $status
          status_in: $statusIn
          averageScore_greater: $minScore
          popularity_greater: $popGreater
          popularity_lesser: $popLesser
          startDate_lesser: $startDateLesser
          startDate_greater: $startDateGreater
        ) {
          ${ANILIST_MEDIA_FIELDS}
        }
      }
    }
  `;

  const alData = await queryAniListCached(gql, variables, 15 * 60 * 1000);
  if (alData?.Page && Array.isArray(alData.Page.media)) {
    const items = deduplicateAnimeRecords(
      alData.Page.media.map(mapAniListMediaToRecord).filter(Boolean) as RealmsAnimeRecord[]
    );
    if (items.length > 0) {
      enqueueCatalogPersistence(items);
    }
    const pInfo = alData.Page.pageInfo || {};
    // Note: AniList `pageInfo.total` caps at 5000 when >5000 results exist unless exact; only mark established when < 5000
    const rawTotal = typeof pInfo.total === 'number' ? pInfo.total : null;
    const isExactTotal = rawTotal !== null && rawTotal < 5000;

    return {
      realm,
      items,
      pageInfo: {
        currentPage: page,
        perPage,
        hasNextPage: Boolean(pInfo.hasNextPage),
        total: rawTotal,
        totalEstablished: isExactTotal,
        source: 'anilist',
      },
    };
  }

  // Fallback to normalized PostgreSQL catalog
  const pgRes = await queryPostgresCatalog({
    genreName: realm.anilistGenre,
    tagName: customTag || realm.anilistTag,
    year,
    format,
    status: variables.status,
    minScore100: variables.minScore,
    minPopularity: variables.popGreater,
    maxPopularity: variables.popLesser,
    sort,
    page,
    perPage,
  });

  return {
    realm,
    items: pgRes.items,
    pageInfo: {
      currentPage: page,
      perPage,
      hasNextPage: page * perPage < pgRes.total,
      total: pgRes.total,
      totalEstablished: true,
      source: 'postgres_cache',
    },
  };
}

// ============================================================================
// SERVER-BACKED SEARCH ENGINE ACROSS TITLES, SYNONYMS, GENRES & FILTERS (PART 13)
// ============================================================================

export async function searchRealmsCatalog(params: {
  q?: string;
  genre?: string;
  year?: number;
  format?: string;
  status?: string;
  minScore?: number;
  sort?: string;
  page?: number;
  perPage?: number;
}): Promise<PaginatedRealmsResult> {
  const q = (params.q || '').trim();
  const page = Math.max(1, Number(params.page || 1));
  const perPage = Math.min(48, Math.max(6, Number(params.perPage || 24)));
  const year = params.year && params.year > 1950 ? Number(params.year) : undefined;
  const format = params.format ? String(params.format).toUpperCase() : undefined;
  const status = params.status ? String(params.status).toUpperCase() : undefined;
  const rawMin = params.minScore ? Number(params.minScore) : undefined;
  const minScore100 =
    rawMin && rawMin > 0
      ? rawMin <= 10
        ? Math.round(rawMin * 10)
        : Math.round(rawMin)
      : undefined;
  const sort = params.sort || (q ? 'search_match' : 'popularity');

  const resolvedGenre = params.genre ? resolveRealmDefinition(params.genre) : null;

  const variables: Record<string, any> = {
    page,
    perPage,
    search: q || undefined,
    genre: resolvedGenre?.anilistGenre || undefined,
    tag: !resolvedGenre?.anilistGenre ? resolvedGenre?.anilistTag || undefined : undefined,
    seasonYear: year,
    format: format || undefined,
    status: status || undefined,
    minScore: minScore100 ? Math.max(1, minScore100 - 1) : undefined,
    sort:
      sort === 'search_match' && q
        ? ['SEARCH_MATCH', 'POPULARITY_DESC']
        : mapSortToAniList(sort),
  };

  const gql = `
    query RealmsSearch(
      $page: Int
      $perPage: Int
      $search: String
      $genre: String
      $tag: String
      $seasonYear: Int
      $format: MediaFormat
      $status: MediaStatus
      $minScore: Int
      $sort: [MediaSort]
    ) {
      Page(page: $page, perPage: $perPage) {
        pageInfo {
          total
          currentPage
          hasNextPage
        }
        media(
          type: ANIME
          isAdult: false
          search: $search
          genre: $genre
          tag: $tag
          seasonYear: $seasonYear
          format: $format
          status: $status
          averageScore_greater: $minScore
          sort: $sort
        ) {
          ${ANILIST_MEDIA_FIELDS}
        }
      }
    }
  `;

  const alData = await queryAniListCached(gql, variables, 10 * 60 * 1000);
  if (alData?.Page && Array.isArray(alData.Page.media)) {
    const items = deduplicateAnimeRecords(
      alData.Page.media.map(mapAniListMediaToRecord).filter(Boolean) as RealmsAnimeRecord[]
    );
    if (items.length > 0) {
      enqueueCatalogPersistence(items);
    }
    const pInfo = alData.Page.pageInfo || {};
    const rawTotal = typeof pInfo.total === 'number' ? pInfo.total : null;
    return {
      items,
      pageInfo: {
        currentPage: page,
        perPage,
        hasNextPage: Boolean(pInfo.hasNextPage),
        total: rawTotal,
        totalEstablished: rawTotal !== null && rawTotal < 5000,
        source: 'anilist',
      },
    };
  }

  const pgRes = await queryPostgresCatalog({
    q,
    genreName: resolvedGenre?.anilistGenre || (params.genre && !resolvedGenre ? params.genre : undefined),
    tagName: resolvedGenre?.anilistTag,
    year,
    format,
    status,
    minScore100,
    sort: sort === 'search_match' ? 'popularity' : sort,
    page,
    perPage,
  });

  return {
    items: pgRes.items,
    pageInfo: {
      currentPage: page,
      perPage,
      hasNextPage: page * perPage < pgRes.total,
      total: pgRes.total,
      totalEstablished: true,
      source: 'postgres_cache',
    },
  };
}

// ============================================================================
// COMPLETE ANIME DETAIL RESOLUTION (PART 11 & PART 12)
// ============================================================================

export async function getRealmsAnimeDetail(idParam: number) {
  const isSyntheticAniListId = idParam >= SYNTHETIC_ID_OFFSET;
  const anilistLookupId = isSyntheticAniListId ? idParam - SYNTHETIC_ID_OFFSET : undefined;
  const malLookupId = !isSyntheticAniListId ? idParam : undefined;

  const detailGql = `
    query RealmsAnimeDetail($id: Int, $idMal: Int) {
      Media(id: $id, idMal: $idMal, type: ANIME, isAdult: false) {
        ${ANILIST_MEDIA_FIELDS}
        characters(sort: [ROLE, RELEVANCE, ID], perPage: 12) {
          edges {
            role
            node {
              id
              name { full }
              image { large }
            }
            voiceActors(language: JAPANESE, sort: [RELEVANCE, ID]) {
              id
              name { full }
            }
          }
        }
        staff(sort: [RELEVANCE, ID], perPage: 6) {
          edges {
            role
            node {
              id
              name { full }
              image { large }
            }
          }
        }
        relations {
          edges {
            relationType(version: 2)
            node {
              id
              idMal
              type
              isAdult
              title { english romaji native }
              format
              status
              seasonYear
              episodes
              averageScore
              coverImage { extraLarge large }
              bannerImage
              genres
            }
          }
        }
        recommendations(sort: [RATING_DESC], perPage: 8) {
          nodes {
            mediaRecommendation {
              ${ANILIST_MEDIA_FIELDS}
            }
          }
        }
      }
    }
  `;

  const [alDetailRes, jkFullRes, jkEpsRes] = await Promise.all([
    queryAniListCached(
      detailGql,
      anilistLookupId ? { id: anilistLookupId } : { idMal: malLookupId },
      25 * 60 * 1000
    ),
    malLookupId ? queryJikanCached(`/anime/${malLookupId}/full`) : Promise.resolve(null),
    malLookupId ? queryJikanCached(`/anime/${malLookupId}/episodes`) : Promise.resolve(null),
  ]);

  let anime: RealmsAnimeRecord | null = null;
  const alMedia = alDetailRes?.Media;
  if (alMedia) {
    anime = mapAniListMediaToRecord(alMedia);
  }
  const jkRecord = jkFullRes?.data ? mapJikanToRecord(jkFullRes.data) : null;

  if (anime && jkRecord) {
    // Merge verified Jikan streaming links if AniList missed any
    const combinedStreaming = classifyStreamingLinks(
      [
        ...(Array.isArray(alMedia?.externalLinks) ? alMedia.externalLinks : []),
        ...(Array.isArray(jkFullRes?.data?.streaming)
          ? jkFullRes.data.streaming.map((s: any) => ({
              name: s.name,
              url: s.url,
              type: 'STREAMING',
            }))
          : []),
      ],
      anime.providerUrl
    );
    anime = {
      ...anime,
      malId: anime.malId || jkRecord.malId,
      streaming: combinedStreaming.verifiedOptions,
      streamingAvailability: combinedStreaming,
      trailerUrl: anime.trailerUrl || jkRecord.trailerUrl,
      trailerEmbedUrl: anime.trailerEmbedUrl || jkRecord.trailerEmbedUrl,
      episodes: anime.episodes || jkRecord.episodes,
      durationMins: anime.durationMins || jkRecord.durationMins,
    };
  } else if (!anime && jkRecord) {
    anime = jkRecord;
  }

  // Fallback to normalized PostgreSQL catalog if upstream APIs failed
  if (!anime) {
    const [cachedRow] = await db
      .select()
      .from(animeCatalog)
      .where(
        or(
          eq(animeCatalog.canonicalId, idParam),
          malLookupId ? eq(animeCatalog.malId, malLookupId) : undefined,
          anilistLookupId ? eq(animeCatalog.anilistId, anilistLookupId) : undefined
        )
      )
      .limit(1);

    if (cachedRow) {
      const hydrated = await hydrateCatalogRows([cachedRow]);
      anime = hydrated[0] || null;
    }
  }

  // Final seed fallback if ID is in VERIFIED_ANIME_CATALOG
  if (!anime && malLookupId) {
    const seed = VERIFIED_ANIME_CATALOG.find((a) => a.malId === malLookupId);
    if (seed) {
      const providerUrl = `https://myanimelist.net/anime/${seed.malId}`;
      const streamInfo = classifyStreamingLinks(
        seed.streaming.map((s) => ({ name: s.name, url: s.url, type: 'STREAMING' })),
        providerUrl
      );
      const seedPrimary = resolvePrimaryAnimeCategory({
        malId: seed.malId,
        title: seed.englishTitle || seed.title,
        englishTitle: seed.englishTitle || null,
        romajiTitle: seed.title,
        genres: seed.genres,
        synopsis: seed.synopsis,
      });
      anime = {
        canonicalId: seed.malId,
        malId: seed.malId,
        anilistId: null,
        provider: 'verified_seed',
        providerId: String(seed.malId),
        slug: slugifyRealm(seed.title),
        title: seed.englishTitle || seed.title,
        englishTitle: seed.englishTitle || null,
        romajiTitle: seed.title,
        nativeTitle: null,
        synonyms: [],
        synopsis: seed.synopsis,
        imageUrl: seed.imageUrl,
        bannerUrl: seed.bannerUrl || null,
        year: seed.year || null,
        season: null,
        format: 'TV Series',
        rawFormat: 'TV',
        episodes: seed.episodes || null,
        durationMins: null,
        formatLabel: seed.episodes ? `TV Series · ${seed.episodes} episodes` : 'TV Series',
        seasonsLabel: seed.episodes ? `TV Series · ${seed.episodes} episodes` : 'TV Series',
        score: seed.score || null,
        averageScore100: seed.score ? Math.round(seed.score * 10) : null,
        scoreSource: 'MyAnimeList',
        popularity: 100000,
        trending: 0,
        favourites: 0,
        status: seed.status || null,
        rawStatus: seed.status === 'Currently Airing' ? 'RELEASING' : 'FINISHED',
        startDate: seed.year ? String(seed.year) : null,
        endDate: null,
        genres: seed.genres,
        tags: [],
        primaryCategory: seedPrimary,
        primaryCategorySlug: slugifyRealm(seedPrimary),
        studios: seed.studios,
        streaming: streamInfo.verifiedOptions,
        streamingAvailability: streamInfo,
        trailerUrl: seed.trailerUrl || null,
        trailerEmbedUrl: null,
        providerUrl,
        lastSyncedAt: new Date().toISOString(),
      };
    }
  }

  if (!anime) return null;

  enqueueCatalogPersistence([anime]);

  const characters = Array.isArray(alMedia?.characters?.edges)
    ? alMedia.characters.edges.slice(0, 10).map((edge: any) => ({
        id: edge.node?.id || 0,
        name: edge.node?.name?.full || 'Unknown',
        role: edge.role ? edge.role.charAt(0) + edge.role.slice(1).toLowerCase() : 'Supporting',
        imageUrl: edge.node?.image?.large || '',
        voiceActor: edge.voiceActors?.[0]?.name?.full || null,
      }))
    : [];

  const staff = Array.isArray(alMedia?.staff?.edges)
    ? alMedia.staff.edges.slice(0, 6).map((edge: any) => ({
        id: edge.node?.id || 0,
        name: edge.node?.name?.full || 'Unknown',
        positions: edge.role ? [edge.role] : [],
        imageUrl: edge.node?.image?.large || '',
      }))
    : [];

  const episodes = Array.isArray(jkEpsRes?.data)
    ? jkEpsRes.data.slice(0, 36).map((e: any) => ({
        number: e.mal_id,
        title: e.title || `Episode ${e.mal_id}`,
        aired: e.aired ? new Date(e.aired).toLocaleDateString() : null,
        score: typeof e.score === 'number' ? e.score : null,
      }))
    : [];

  const relations: (RealmsAnimeRecord & { relationType?: string })[] = [];
  if (Array.isArray(alMedia?.relations?.edges)) {
    for (const edge of alMedia.relations.edges) {
      if (edge?.node?.type !== 'ANIME' || edge?.node?.isAdult) continue;
      const mapped = mapAniListMediaToRecord(edge.node);
      if (mapped && mapped.canonicalId !== anime.canonicalId) {
        relations.push({
          ...mapped,
          relationType: edge.relationType
            ? String(edge.relationType).replace(/_/g, ' ')
            : 'RELATED',
        });
      }
    }
  }

  const recNodes: RealmsAnimeRecord[] = Array.isArray(alMedia?.recommendations?.nodes)
    ? (alMedia.recommendations.nodes
        .map((n: any) => mapAniListMediaToRecord(n?.mediaRecommendation))
        .filter(Boolean) as RealmsAnimeRecord[])
    : [];

  const related = deduplicateAnimeRecords([...relations, ...recNodes])
    .filter((r) => r.canonicalId !== anime!.canonicalId)
    .slice(0, 12);

  if (related.length > 0) {
    enqueueCatalogPersistence(related);
  }

  return {
    anime,
    characters,
    staff,
    episodes,
    relations: relations.slice(0, 8),
    related,
  };
}

// ============================================================================
// ANIME REVIEWS & PRIVATE RECENTLY VIEWED (PART 11, 14, 15)
// ============================================================================

export async function listReviewsForAnime(animeCanonicalId: number, viewerUid?: string) {
  let excludedUids: string[] = [];
  if (viewerUid) {
    const blocks = await db
      .select()
      .from(blockedUsers)
      .where(
        or(eq(blockedUsers.blockerUid, viewerUid), eq(blockedUsers.blockedUid, viewerUid))
      );
    excludedUids = blocks.map((b) =>
      b.blockerUid === viewerUid ? b.blockedUid : b.blockerUid
    );
  }

  const rows = await db
    .select({
      review: animeReviews,
      username: users.username,
      role: users.role,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(animeReviews)
    .innerJoin(users, eq(animeReviews.authorUid, users.uid))
    .innerJoin(profiles, eq(animeReviews.authorUid, profiles.userUid))
    .where(eq(animeReviews.animeMalId, animeCanonicalId))
    .orderBy(desc(animeReviews.createdAt))
    .limit(30);

  const visible = rows
    .filter((r) => !excludedUids.includes(r.review.authorUid))
    .map((r) => ({
      ...r.review,
      author: {
        uid: r.review.authorUid,
        username: r.username,
        role: r.role,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl,
      },
    }));

  const rated = visible.filter((r) => typeof r.rating === 'number' && r.rating > 0);
  const kageAverageScore =
    rated.length > 0
      ? Math.round((rated.reduce((acc, r) => acc + (r.rating || 0), 0) / rated.length) * 10) / 10
      : null;

  return {
    reviews: visible,
    kageReviewCount: visible.length,
    kageRatedCount: rated.length,
    kageAverageScore,
  };
}

export async function recordRecentlyViewedAnime(userUid: string, anime: RealmsAnimeRecord) {
  if (!userUid || !anime?.canonicalId || !anime.imageUrl) return;
  try {
    await db
      .insert(userRecentlyViewed)
      .values({
        userUid,
        animeCanonicalId: anime.canonicalId,
        animeTitle: anime.title,
        animeImageUrl: anime.imageUrl,
        releaseYear: anime.year,
        averageScore: anime.averageScore100,
        scoreSource: anime.scoreSource,
        format: anime.rawFormat,
        episodes: anime.episodes,
        viewedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userRecentlyViewed.userUid, userRecentlyViewed.animeCanonicalId],
        set: {
          animeTitle: anime.title,
          animeImageUrl: anime.imageUrl,
          releaseYear: anime.year,
          averageScore: anime.averageScore100,
          scoreSource: anime.scoreSource,
          format: anime.rawFormat,
          episodes: anime.episodes,
          viewedAt: new Date(),
        },
      });
  } catch {
    // Non-blocking history update
  }
}

export async function listRecentlyViewedAnime(userUid: string, limit = 14) {
  if (!userUid) return [];
  const rows = await db
    .select()
    .from(userRecentlyViewed)
    .where(eq(userRecentlyViewed.userUid, userUid))
    .orderBy(desc(userRecentlyViewed.viewedAt))
    .limit(limit);

  return rows.map((r) => {
    const humanFmt = humanizeFormat(r.format);
    const score =
      typeof r.averageScore === 'number' && r.averageScore > 0
        ? Math.round((r.averageScore / 10) * 10) / 10
        : null;
    return {
      canonicalId: r.animeCanonicalId,
      malId: r.animeCanonicalId < SYNTHETIC_ID_OFFSET ? r.animeCanonicalId : null,
      title: r.animeTitle,
      imageUrl: r.animeImageUrl,
      year: r.releaseYear,
      score,
      scoreSource: (r.scoreSource === 'MyAnimeList' ? 'MyAnimeList' : 'AniList') as
        | 'AniList'
        | 'MyAnimeList',
      format: humanFmt,
      episodes: r.episodes,
      formatLabel: makeFormatSummary(humanFmt, r.episodes, null, null),
      viewedAt: r.viewedAt.toISOString(),
    };
  });
}

// ============================================================================
// HONEST 7-METRIC CATALOG REPORTING & STARTUP WARM-SYNC (PART 17)
// ============================================================================

export async function getRealmsCatalogStats() {
  const [
    totalRowsRes,
    validPosterRes,
    validSynopsisRes,
    genreCountRes,
    tagCountRes,
    verifiedStreamingRes,
    perGenreBreakdown,
  ] = await Promise.all([
    db.select({ cnt: sql<number>`count(*)::int` }).from(animeCatalog),
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(animeCatalog)
      .where(sql`LENGTH(${animeCatalog.coverImageUrl}) > 10`),
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(animeCatalog)
      .where(
        and(
          sql`LENGTH(${animeCatalog.synopsis}) > 30`,
          sql`${animeCatalog.synopsis} NOT LIKE 'Official synopsis has not%'`
        )
      ),
    db.select({ cnt: sql<number>`count(*)::int` }).from(animeGenres),
    db.select({ cnt: sql<number>`count(*)::int` }).from(animeTags),
    db
      .select({ cnt: sql<number>`count(*)::int` })
      .from(animeCatalog)
      .where(sql`jsonb_array_length(${animeCatalog.streamingLinks}) > 0`),
    db
      .select({
        genre: animeGenres.name,
        slug: animeGenres.slug,
        count: sql<number>`count(${animeCatalogGenres.animeId})::int`,
      })
      .from(animeGenres)
      .leftJoin(animeCatalogGenres, eq(animeGenres.id, animeCatalogGenres.genreId))
      .groupBy(animeGenres.id, animeGenres.name, animeGenres.slug)
      .orderBy(desc(sql`count(${animeCatalogGenres.animeId})`)),
  ]);

  // Query live upstream AniList catalog breadth honestly (via high-page binary/pageInfo probe)
  const providerProbe = await queryAniListCached(
    `query ProviderCountProbe {
      p400: Page(page: 400, perPage: 50) { pageInfo { hasNextPage } media(type: ANIME, isAdult: false) { id } }
      p350: Page(page: 350, perPage: 50) { pageInfo { hasNextPage } media(type: ANIME, isAdult: false) { id } }
    }`,
    {},
    60 * 60 * 1000
  );

  let upstreamAccessibleNote =
    'Connected live to AniList GraphQL v2 (primary) + Jikan v4 / MyAnimeList (secondary). Standard non-adult anime industry catalogs contain ~19,000–28,000 distinct released/upcoming anime entries; KAGE PostgreSQL schema (indexed normalized tables) supports 100,000+ records without structural changes.';
  if (providerProbe?.p400?.media?.length > 0) {
    upstreamAccessibleNote =
      'Verified live access to 20,000+ non-adult anime records via AniList GraphQL pagination (page 400 x 50 confirmed active) + Jikan v4.';
  } else if (providerProbe?.p350?.media?.length > 0) {
    upstreamAccessibleNote =
      'Verified live access to 17,500+ non-adult anime records via AniList GraphQL pagination (page 350 x 50 confirmed active) + Jikan v4.';
  }

  return {
    primaryProvider: 'AniList GraphQL API v2 (https://graphql.anilist.co)',
    secondaryProvider: 'Jikan REST API v4 / MyAnimeList (https://api.jikan.moe/v4)',
    upstreamAccessibleSummary: upstreamAccessibleNote,
    localDatabaseRecordCount: Number(totalRowsRes[0]?.cnt || 0),
    validPosterRecordCount: Number(validPosterRes[0]?.cnt || 0),
    validSynopsisRecordCount: Number(validSynopsisRes[0]?.cnt || 0),
    normalizedGenresInDbCount: Number(genreCountRes[0]?.cnt || 0),
    normalizedTagsInDbCount: Number(tagCountRes[0]?.cnt || 0),
    configuredRealmsSectionsCount: REALMS_CATEGORY_SECTIONS.length,
    configuredDiscoveryCollectionsCount: REALMS_DISCOVERY_COLLECTIONS.length,
    totalSupportedRealmsRoutesCount: ALL_REALMS_SECTIONS.length,
    verifiedStreamingTitlesCount: Number(verifiedStreamingRes[0]?.cnt || 0),
    perGenreDbCounts: perGenreBreakdown,
    allGenreNames: ALL_GENRE_NAMES,
  };
}

let bootSyncStarted = false;

export async function warmUpRealmsCatalogInBackground(): Promise<void> {
  if (bootSyncStarted) return;
  bootSyncStarted = true;

  // 1. Seed cleaned VERIFIED_ANIME_CATALOG records so local DB is never empty even before network calls finish
  const seedRecords: RealmsAnimeRecord[] = VERIFIED_ANIME_CATALOG.map((seed) => {
    const providerUrl = `https://myanimelist.net/anime/${seed.malId}`;
    const streamInfo = classifyStreamingLinks(
      seed.streaming.map((s) => ({ name: s.name, url: s.url, type: 'STREAMING' })),
      providerUrl
    );
    const seedPrimary = resolvePrimaryAnimeCategory({
      malId: seed.malId,
      title: seed.englishTitle || seed.title,
      englishTitle: seed.englishTitle || null,
      romajiTitle: seed.title,
      genres: seed.genres,
      synopsis: seed.synopsis,
    });
    return {
      canonicalId: seed.malId,
      malId: seed.malId,
      anilistId: null,
      provider: 'verified_seed',
      providerId: String(seed.malId),
      slug: slugifyRealm(seed.title),
      title: seed.englishTitle || seed.title,
      englishTitle: seed.englishTitle || null,
      romajiTitle: seed.title,
      nativeTitle: null,
      synonyms: [],
      synopsis: seed.synopsis,
      imageUrl: seed.imageUrl,
      bannerUrl: seed.bannerUrl || null,
      year: seed.year || null,
      season: null,
      format: 'TV Series',
      rawFormat: 'TV',
      episodes: seed.episodes || null,
      durationMins: null,
      formatLabel: seed.episodes ? `TV Series · ${seed.episodes} episodes` : 'TV Series',
      seasonsLabel: seed.episodes ? `TV Series · ${seed.episodes} episodes` : 'TV Series',
      score: seed.score || null,
      averageScore100: seed.score ? Math.round(seed.score * 10) : null,
      scoreSource: 'MyAnimeList',
      popularity: 75000,
      trending: 0,
      favourites: 0,
      status: seed.status || null,
      rawStatus: seed.status === 'Currently Airing' ? 'RELEASING' : 'FINISHED',
      startDate: seed.year ? String(seed.year) : null,
      endDate: null,
      genres: seed.genres,
      tags: [],
      primaryCategory: seedPrimary,
      primaryCategorySlug: slugifyRealm(seedPrimary),
      studios: seed.studios,
      streaming: streamInfo.verifiedOptions,
      streamingAvailability: streamInfo,
      trailerUrl: seed.trailerUrl || null,
      trailerEmbedUrl: null,
      providerUrl,
      lastSyncedAt: new Date().toISOString(),
    };
  });
  enqueueCatalogPersistence(seedRecords);

  // 2. Politely warm up popular AniList pages + Realms rows in the background without blocking server boot
  setTimeout(async () => {
    try {
      await getRealmsHomePayload();
      const restSlugs = REALMS_CATEGORY_SECTIONS.slice(6).map((s) => s.slug);
      for (let i = 0; i < restSlugs.length; i += 7) {
        await fetchRealmsRowsBatch(restSlugs.slice(i, i + 7), 16);
      }
      await fetchRealmsRowsBatch(
        REALMS_DISCOVERY_COLLECTIONS.map((c) => c.slug),
        16
      );
      // Sync 4 pages x 50 = 200 most popular anime into normalized PostgreSQL tables
      for (let p = 1; p <= 4; p++) {
        const pageRes = await queryAniListCached(
          `query WarmCatalogPage($page: Int) {
            Page(page: $page, perPage: 50) {
              media(type: ANIME, isAdult: false, sort: [POPULARITY_DESC]) {
                ${ANILIST_MEDIA_FIELDS}
              }
            }
          }`,
          { page: p },
          60 * 60 * 1000
        );
        if (Array.isArray(pageRes?.Page?.media)) {
          const mapped = pageRes.Page.media
            .map(mapAniListMediaToRecord)
            .filter(Boolean) as RealmsAnimeRecord[];
          enqueueCatalogPersistence(mapped);
        }
      }
    } catch {
      // Background warm-up never crashes server
    }
  }, 400);
}
