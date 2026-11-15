import { and, asc, desc, eq, gte, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  animeCatalog,
  animeMangaRelations,
  mangaAuthors,
  mangaCatalog,
  mangaCatalogAuthors,
  mangaCatalogGenres,
  mangaChapters,
  mangaGenres,
  mangaImages,
  mangaVolumes,
} from '../db/schema.ts';
import { slugifyRealm } from '../lib/genres.ts';

const ANILIST_ENDPOINT = 'https://graphql.anilist.co';
const MANGADEX_BASE = 'https://api.mangadex.org';

const CANONICAL_MANGA_GENRES = [
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
  'Dark Fantasy',
  'Isekai',
  'Seinen',
  'Shounen',
  'Shoujo',
];

const CURATED_TRENDING_QUERIES = [
  { search: 'Solo Leveling', anilistId: 105398, malId: 121496, isColor: true, animeMalId: 52299, continuationNote: 'Original webtoon completed at Chapter 200 (Side Stories included); Season 2 anime adapts through Jeju Island arc.' },
  { search: 'Jujutsu Kaisen', anilistId: 101517, malId: 113138, isColor: false, animeMalId: 40748, continuationNote: 'Main manga concluded at Chapter 271; Shibuya Incident anime ends at Chapter 137.' },
  { search: 'Kimetsu no Yaiba', anilistId: 87216, malId: 96792, isColor: false, animeMalId: 38000, continuationNote: 'Complete 205-chapter series; Infinity Castle arc begins at Chapter 140.' },
  { search: 'Black Clover', anilistId: 86123, malId: 86337, isColor: false, animeMalId: 34572, continuationNote: 'Spade Kingdom Raid anime ends at Chapter 270; manga continues into the Final Saga.' },
  { search: 'Shingeki no Kyojin', anilistId: 53390, malId: 23390, isColor: false, animeMalId: 16498, continuationNote: 'Complete 139-chapter manga adapted in full by the anime series and Final Chapters.' },
  { search: 'Naruto', anilistId: 30011, malId: 11, isColor: false, animeMalId: 20, continuationNote: 'Original 700-chapter manga spanning Parts I and II.' },
  { search: 'Chainsaw Man', anilistId: 105778, malId: 116778, isColor: false, animeMalId: 44511, continuationNote: 'Public Safety Saga concludes at Chapter 97; Academy Saga starts at Chapter 98.' },
  { search: 'Berserk', anilistId: 30002, malId: 2, isColor: false, animeMalId: 33, continuationNote: 'Continue past the 1997 anime / Golden Age arc starting at Conviction & Millennium Falcon arcs.' },
  { search: 'Vagabond', anilistId: 30656, malId: 656, isColor: false, animeMalId: null, continuationNote: 'Complete published run through Chapter 327.' },
];

export interface InkverseMangaSummary {
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
  coverWidth: number | null;
  coverHeight: number | null;
  bannerImageUrl: string | null;
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
  uploadedByUid: string | null;
  isOriginalUpload: boolean;
  moderationStatus: string;
  hasInAppChapters: boolean;
  inAppChapterCount: number;
  genres: string[];
  authors: { id: number; name: string; role: string }[];
  characters: { id?: number | null; name: string; role?: string; imageUrl?: string | null }[];
}

export interface InkverseChapterSummary {
  id: number;
  mangaId: number;
  externalChapterId: string;
  provider: string;
  volumeNumber: string | null;
  chapterNumber: string;
  chapterSortKey: number;
  title: string;
  language: string;
  pageCount: number;
  isAvailable: boolean;
  isColor: boolean;
  qualityTier: string;
  externalUrl: string | null;
  scanlationGroup: string;
  publishedAt: string | null;
  uploadedByUid?: string | null;
  moderationStatus?: string;
  moderationNote?: string;
}

export interface InkverseReaderPage {
  pageNumber: number;
  imageUrl: string;
  hdUrl: string | null;
  width: number | null;
  height: number | null;
  qualityLabel: '4K' | 'HD' | 'Standard';
  isColor: boolean;
}

export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function stripHtmlTags(raw?: string | null): string {
  if (!raw) return '';
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?(p|i|b|strong|em)>/gi, '')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function classifyResolutionLabel(width?: number | null, height?: number | null): '4K' | 'HD' | 'Standard' {
  const maxDim = Math.max(width || 0, height || 0);
  if (maxDim >= 2160) return '4K';
  if (maxDim >= 1080) return 'HD';
  return 'Standard';
}

export function parseChapterSortKey(rawChapter?: string | null): number {
  const num = Number.parseFloat(String(rawChapter || '0').replace(/[^0-9.]/g, ''));
  if (!Number.isFinite(num) || Number.isNaN(num)) return 0;
  return Math.round(num * 100);
}

async function fetchJsonWithTimeout<T>(url: string, init?: RequestInit, timeoutMs = 6500): Promise<T | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        'User-Agent': 'KAGE-Inkverse/1.0 (+https://kage.anime)',
        Accept: 'application/json',
        ...(init?.headers || {}),
      },
    });
    if (!resp.ok) return null;
    return (await resp.json()) as T;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

async function ensureMangaGenresSeeded(): Promise<Map<string, number>> {
  const existing = await db.select().from(mangaGenres);
  const map = new Map<string, number>();
  for (const row of existing) {
    map.set(row.name.toLowerCase(), row.id);
    map.set(row.slug, row.id);
  }

  for (const name of CANONICAL_MANGA_GENRES) {
    const slug = slugifyRealm(name);
    if (!map.has(slug)) {
      const [inserted] = await db
        .insert(mangaGenres)
        .values({ name, slug })
        .onConflictDoNothing()
        .returning();
      if (inserted) {
        map.set(name.toLowerCase(), inserted.id);
        map.set(slug, inserted.id);
      }
    }
  }
  return map;
}

export async function linkMangaGenres(mangaDbId: number, genreNames: string[]) {
  if (!genreNames || genreNames.length === 0) return;
  const genreMap = await ensureMangaGenresSeeded();
  for (const raw of genreNames) {
    const name = raw.trim();
    if (!name) continue;
    const slug = slugifyRealm(name);
    let genreId = genreMap.get(slug) || genreMap.get(name.toLowerCase());
    if (!genreId) {
      const [created] = await db
        .insert(mangaGenres)
        .values({ name, slug })
        .onConflictDoNothing()
        .returning();
      if (created) {
        genreId = created.id;
      } else {
        const [found] = await db.select().from(mangaGenres).where(eq(mangaGenres.slug, slug)).limit(1);
        genreId = found?.id;
      }
    }
    if (genreId) {
      await db
        .insert(mangaCatalogGenres)
        .values({ mangaId: mangaDbId, genreId })
        .onConflictDoNothing();
    }
  }
}

export async function linkMangaAuthors(
  mangaDbId: number,
  staffList: { name: string; nativeName?: string | null; imageUrl?: string | null; role?: string; providerId?: string | null }[]
) {
  for (const person of staffList) {
    const cleanName = person.name.trim();
    if (!cleanName) continue;
    const normalized = normalizeText(cleanName);
    if (!normalized) continue;

    let authorId: number | undefined;
    const [existing] = await db
      .select()
      .from(mangaAuthors)
      .where(eq(mangaAuthors.normalizedName, normalized))
      .limit(1);

    if (existing) {
      authorId = existing.id;
    } else {
      const [inserted] = await db
        .insert(mangaAuthors)
        .values({
          name: cleanName,
          normalizedName: normalized,
          nativeName: person.nativeName || null,
          imageUrl: person.imageUrl || null,
          providerId: person.providerId || null,
        })
        .onConflictDoNothing()
        .returning();
      authorId = inserted?.id;
      if (!authorId) {
        const [refetch] = await db
          .select()
          .from(mangaAuthors)
          .where(eq(mangaAuthors.normalizedName, normalized))
          .limit(1);
        authorId = refetch?.id;
      }
    }

    if (authorId) {
      const role = person.role || 'Story & Art';
      await db
        .insert(mangaCatalogAuthors)
        .values({ mangaId: mangaDbId, authorId, role })
        .onConflictDoNothing();
    }
  }
}

const ANILIST_MANGA_FIELDS = `
  id
  idMal
  title { english romaji native }
  synonyms
  description(asHtml: false)
  coverImage { extraLarge large }
  bannerImage
  format
  status
  countryOfOrigin
  startDate { year }
  volumes
  chapters
  averageScore
  popularity
  trending
  genres
  isAdult
  siteUrl
  externalLinks { site url }
  staff(perPage: 6, sort: [RELEVANCE]) {
    edges {
      role
      node {
        id
        name { full native }
        image { medium }
      }
    }
  }
  characters(perPage: 8, sort: [ROLE, FAVOURITES_DESC]) {
    edges {
      role
      node {
        id
        name { full }
        image { medium }
      }
    }
  }
  relations {
    edges {
      relationType
      node {
        id
        idMal
        type
        format
        title { english romaji }
        chapters
        status
        coverImage { extraLarge large }
      }
    }
  }
`;

export async function upsertAniListMangaNode(media: any, overrides?: { isColor?: boolean; mangadexId?: string | null }): Promise<number | null> {
  if (!media || media.isAdult) return null;
  const anilistId = Number(media.id || 0);
  if (!anilistId) return null;

  const titleEnglish = media.title?.english || null;
  const titleRomaji = media.title?.romaji || titleEnglish || `Manga #${anilistId}`;
  const titleNative = media.title?.native || null;
  const displayTitle = titleEnglish || titleRomaji;
  const malId = media.idMal ? Number(media.idMal) : null;
  const canonicalId = malId || 20_000_000 + anilistId;

  const altTitles = Array.from(
    new Set(
      [titleEnglish, titleRomaji, titleNative, ...(Array.isArray(media.synonyms) ? media.synonyms : [])]
        .filter((v): v is string => Boolean(v && String(v).trim()))
        .slice(0, 10)
    )
  );

  const country = String(media.countryOfOrigin || 'JP').toUpperCase();
  const inferredFormat =
    country === 'KR'
      ? 'MANHWA'
      : country === 'CN' || country === 'TW'
        ? 'MANHUA'
        : String(media.format || 'MANGA').toUpperCase();
  const isColor =
    overrides?.isColor !== undefined
      ? overrides.isColor
      : country === 'KR' || country === 'CN';
  const origLang =
    country === 'KR' ? 'ko' : country === 'CN' || country === 'TW' ? 'zh' : 'ja';

  const officialExternal = (Array.isArray(media.externalLinks) ? media.externalLinks : []).find(
    (l: any) =>
      l?.url &&
      /mangaplus\.shueisha|viz\.com|kodansha|webtoons\.com|tapas\.io|tappytoon|pocketcomics|manga-up/i.test(
        `${l.site || ''} ${l.url}`
      )
  );

  const coverUrl =
    media.coverImage?.extraLarge || media.coverImage?.large || '/assets/extracted/filter-action.jpg';
  const bannerUrl = media.bannerImage || null;
  const slug = `${slugifyRealm(displayTitle)}-${canonicalId}`;

  const charactersJson = (media.characters?.edges || [])
    .slice(0, 8)
    .map((e: any) => ({
      id: e?.node?.id || null,
      name: e?.node?.name?.full || '',
      role: e?.role || 'Supporting',
      imageUrl: e?.node?.image?.medium || null,
    }))
    .filter((c: any) => c.name);

  const existingByAnilist = await db
    .select()
    .from(mangaCatalog)
    .where(or(eq(mangaCatalog.anilistId, anilistId), eq(mangaCatalog.canonicalId, canonicalId)))
    .limit(1);

  let mangaDbId: number;
  if (existingByAnilist.length > 0) {
    const existing = existingByAnilist[0];
    const [updated] = await db
      .update(mangaCatalog)
      .set({
        anilistId,
        malId: malId ?? existing.malId,
        mangadexId: overrides?.mangadexId ?? existing.mangadexId,
        titleEnglish: titleEnglish ?? existing.titleEnglish,
        titleRomaji,
        titleNative: titleNative ?? existing.titleNative,
        normalizedTitle: normalizeText(`${displayTitle} ${titleRomaji} ${altTitles.join(' ')}`),
        altTitles,
        synopsis: stripHtmlTags(media.description) || existing.synopsis,
        coverImageUrl: coverUrl || existing.coverImageUrl,
        bannerImageUrl: bannerUrl ?? existing.bannerImageUrl,
        format: inferredFormat,
        status: media.status || existing.status,
        releaseYear: media.startDate?.year ?? existing.releaseYear,
        volumesCount: media.volumes ?? existing.volumesCount,
        chaptersCount: media.chapters ?? existing.chaptersCount,
        averageScore: media.averageScore ?? existing.averageScore,
        popularity: Math.max(media.popularity || 0, existing.popularity),
        trending: Math.max(media.trending || 0, existing.trending),
        isColor: existing.isColor || isColor,
        originalLanguage: origLang,
        externalReaderUrl: officialExternal?.url ?? existing.externalReaderUrl,
        providerUrl: media.siteUrl ?? existing.providerUrl,
        charactersJson: charactersJson.length > 0 ? charactersJson : existing.charactersJson,
        lastSyncedAt: new Date(),
      })
      .where(eq(mangaCatalog.id, existing.id))
      .returning();
    mangaDbId = updated.id;
  } else {
    const [inserted] = await db
      .insert(mangaCatalog)
      .values({
        canonicalId,
        anilistId,
        malId,
        mangadexId: overrides?.mangadexId || null,
        provider: 'anilist',
        providerId: String(anilistId),
        slug,
        titleEnglish,
        titleRomaji,
        titleNative,
        normalizedTitle: normalizeText(`${displayTitle} ${titleRomaji} ${altTitles.join(' ')}`),
        altTitles,
        synopsis: stripHtmlTags(media.description) || 'Synopsis currently unavailable.',
        coverImageUrl: coverUrl,
        coverQuality: 'HD', // AniList extraLarge manga covers are high-res editorial covers (never claimed as 4K)
        bannerImageUrl: bannerUrl,
        format: inferredFormat,
        status: media.status || 'RELEASING',
        releaseYear: media.startDate?.year || null,
        volumesCount: media.volumes || null,
        chaptersCount: media.chapters || null,
        averageScore: typeof media.averageScore === 'number' ? media.averageScore : null,
        scoreSource: 'AniList',
        popularity: Number(media.popularity || 0),
        trending: Number(media.trending || 0),
        readCount: 0,
        isColor,
        originalLanguage: origLang,
        availableLanguages: ['en', origLang].filter((v, i, a) => a.indexOf(v) === i),
        externalReaderUrl: officialExternal?.url || null,
        providerUrl: media.siteUrl || null,
        charactersJson,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      mangaDbId = inserted.id;
    } else {
      const [refetch] = await db
        .select()
        .from(mangaCatalog)
        .where(eq(mangaCatalog.canonicalId, canonicalId))
        .limit(1);
      if (!refetch) return null;
      mangaDbId = refetch.id;
    }
  }

  // Genres
  if (Array.isArray(media.genres) && media.genres.length > 0) {
    await linkMangaGenres(mangaDbId, media.genres);
  }

  // Authors / Artists from AniList staff edges
  const staffEdges = Array.isArray(media.staff?.edges) ? media.staff.edges : [];
  const creatorStaff = staffEdges
    .filter((edge: any) => /story|art|original creator|author|illustrator/i.test(edge?.role || ''))
    .map((edge: any) => {
      const roleRaw = String(edge.role || '');
      const role =
        /story/i.test(roleRaw) && /art/i.test(roleRaw)
          ? 'Story & Art'
          : /art|illustrator/i.test(roleRaw)
            ? 'Art'
            : 'Story';
      return {
        name: edge.node?.name?.full || '',
        nativeName: edge.node?.name?.native || null,
        imageUrl: edge.node?.image?.medium || null,
        role,
        providerId: edge.node?.id ? `al_${edge.node.id}` : null,
      };
    })
    .filter((s: any) => s.name);

  if (creatorStaff.length > 0) {
    await linkMangaAuthors(mangaDbId, creatorStaff);
  }

  // Anime relations
  const relEdges = Array.isArray(media.relations?.edges) ? media.relations.edges : [];
  for (const edge of relEdges) {
    const node = edge?.node;
    if (!node || node.type !== 'ANIME') continue;
    const animeCanonicalId = node.idMal ? Number(node.idMal) : 10_000_000 + Number(node.id);
    const animeTitle = node.title?.english || node.title?.romaji || `Anime #${animeCanonicalId}`;
    const rawRel = String(edge.relationType || 'ADAPTATION');
    const relType =
      rawRel === 'ADAPTATION'
        ? 'ORIGINAL_MANGA'
        : rawRel === 'SPIN_OFF'
          ? 'SPIN_OFF'
          : rawRel === 'SEQUEL'
            ? 'SEQUEL'
            : rawRel === 'SIDE_STORY'
              ? 'SIDE_STORY'
              : 'ADAPTATION';
    const relLabel =
      relType === 'ORIGINAL_MANGA'
        ? 'Original Manga'
        : relType === 'SPIN_OFF'
          ? 'Spin-Off Manga'
          : relType === 'SEQUEL'
            ? 'Sequel Manga'
            : relType === 'SIDE_STORY'
              ? 'Side Story'
              : 'Manga Adaptation';

    await db
      .insert(animeMangaRelations)
      .values({
        animeCanonicalId,
        animeMalId: node.idMal ? Number(node.idMal) : null,
        animeTitle,
        mangaId: mangaDbId,
        relationType: relType,
        relationLabel: relLabel,
        continuationNote: '',
        isVerified: true,
      })
      .onConflictDoNothing();
  }

  return mangaDbId;
}

async function resolveMangaDexIdByTitle(title: string, malId?: number | null): Promise<{
  mangadexId: string;
  availableLanguages: string[];
  originalLanguage: string;
  coverUrl: string | null;
} | null> {
  const cleanTitle = title.trim();
  if (!cleanTitle) return null;

  const url = `${MANGADEX_BASE}/manga?title=${encodeURIComponent(cleanTitle)}&limit=5&includes[]=cover_art&contentRating[]=safe&contentRating[]=suggestive&order[followedCount]=desc`;
  const resp = await fetchJsonWithTimeout<{ data?: any[] }>(url);
  const candidates = resp?.data || [];
  if (candidates.length === 0) return null;

  const normTarget = normalizeText(cleanTitle);
  const matched =
    candidates.find((c) => malId && Number(c.attributes?.links?.mal || 0) === malId) ||
    candidates.find((c) => {
      const t = c.attributes?.title?.en || Object.values(c.attributes?.title || {})[0] || '';
      return normalizeText(String(t)) === normTarget;
    }) ||
    candidates[0];

  if (!matched?.id) return null;
  const coverRel = (matched.relationships || []).find((r: any) => r.type === 'cover_art');
  const fileName = coverRel?.attributes?.fileName;
  const coverUrl = fileName
    ? `https://uploads.mangadex.org/covers/${matched.id}/${fileName}`
    : null;

  const langs = Array.isArray(matched.attributes?.availableTranslatedLanguages)
    ? (matched.attributes.availableTranslatedLanguages.filter(Boolean) as string[])
    : ['en'];

  return {
    mangadexId: matched.id,
    availableLanguages: langs.slice(0, 12),
    originalLanguage: matched.attributes?.originalLanguage || 'ja',
    coverUrl,
  };
}

export async function syncTrendingMangaCatalog(): Promise<void> {
  try {
    // 1. Fetch curated iconic titles + top AniList trending manga in parallel
    const query = `
      query {
        trending: Page(page: 1, perPage: 16) {
          media(type: MANGA, isAdult: false, sort: [TRENDING_DESC, POPULARITY_DESC]) {
            ${ANILIST_MANGA_FIELDS}
          }
        }
        popular: Page(page: 1, perPage: 16) {
          media(type: MANGA, isAdult: false, sort: [POPULARITY_DESC]) {
            ${ANILIST_MANGA_FIELDS}
          }
        }
      }
    `;
    const res = await fetchJsonWithTimeout<{
      data?: { trending?: { media?: any[] }; popular?: { media?: any[] } };
    }>(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    }, 9000);

    const pool = [
      ...(res?.data?.trending?.media || []),
      ...(res?.data?.popular?.media || []),
    ];

    const seenAl = new Set<number>();
    for (const node of pool) {
      if (!node?.id || seenAl.has(node.id)) continue;
      seenAl.add(node.id);
      await upsertAniListMangaNode(node);
    }

    // 2. Ensure core requested iconic manga & verified anime-to-manga continuation notes exist
    for (const item of CURATED_TRENDING_QUERIES) {
      let [existing] = await db
        .select()
        .from(mangaCatalog)
        .where(
          or(
            eq(mangaCatalog.anilistId, item.anilistId),
            eq(mangaCatalog.malId, item.malId)
          )
        )
        .limit(1);

      if (!existing) {
        const singleQuery = `
          query ($id: Int) {
            Media(id: $id, type: MANGA) {
              ${ANILIST_MANGA_FIELDS}
            }
          }
        `;
        const singleRes = await fetchJsonWithTimeout<{ data?: { Media?: any } }>(
          ANILIST_ENDPOINT,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: singleQuery, variables: { id: item.anilistId } }),
          },
          6000
        );
        if (singleRes?.data?.Media) {
          const insertedId = await upsertAniListMangaNode(singleRes.data.Media, {
            isColor: item.isColor,
          });
          if (insertedId) {
            const [row] = await db.select().from(mangaCatalog).where(eq(mangaCatalog.id, insertedId)).limit(1);
            existing = row;
          }
        }
      }

      if (existing && item.animeMalId) {
        await db
          .insert(animeMangaRelations)
          .values({
            animeCanonicalId: item.animeMalId,
            animeMalId: item.animeMalId,
            animeTitle: existing.titleEnglish || existing.titleRomaji,
            mangaId: existing.id,
            relationType: 'ORIGINAL_MANGA',
            relationLabel: 'Original Manga',
            continuationNote: item.continuationNote,
            isVerified: true,
          })
          .onConflictDoNothing();

        await db
          .update(animeMangaRelations)
          .set({ continuationNote: item.continuationNote })
          .where(
            and(
              eq(animeMangaRelations.animeCanonicalId, item.animeMalId),
              eq(animeMangaRelations.mangaId, existing.id)
            )
          );
      }
    }

    // 3. Sync readable community/open-chapter MangaDex titles so the built-in Reader works directly out-of-the-box!
    await syncOpenReadableMangaDexTitles(18);

    // 4. Sync chapters for top open-readable series & recompute accurate in-app chapter counts
    const topToSync = await db
      .select()
      .from(mangaCatalog)
      .where(and(eq(mangaCatalog.isAdult, false), eq(mangaCatalog.moderationStatus, 'approved')))
      .orderBy(desc(mangaCatalog.popularity))
      .limit(18);

    for (const row of topToSync) {
      if (!row.hasInAppChapters) {
        await syncChaptersFromMangaDex(row).catch(() => {});
      }
    }
    await refreshAllMangaInAppCounts();
  } catch (err) {
    console.warn('[INKVERSE] Background catalog sync notice:', (err as Error)?.message);
  }
}

export async function syncOpenReadableMangaDexTitles(limit = 12): Promise<void> {
  const url = `${MANGADEX_BASE}/manga?limit=${limit}&includes[]=cover_art&includes[]=author&includes[]=artist&contentRating[]=safe&availableTranslatedLanguage[]=en&hasAvailableChapters=true&order[followedCount]=desc`;
  const resp = await fetchJsonWithTimeout<{ data?: any[] }>(url, undefined, 7000);
  const list = resp?.data || [];

  for (const item of list) {
    const mdId = item?.id;
    const attrs = item?.attributes;
    if (!mdId || !attrs) continue;
    const titleEn =
      attrs.title?.en ||
      attrs.title?.['ja-ro'] ||
      attrs.title?.['ko-ro'] ||
      Object.values(attrs.title || {})[0] ||
      'Untitled Manga';
    const titleStr = String(titleEn);
    const malId = attrs.links?.mal ? Number(attrs.links.mal) : null;
    const alId = attrs.links?.al ? Number(attrs.links.al) : null;

    // Check if already matched by MangaDex ID, AniList ID, or MAL ID
    const existingRows = await db
      .select()
      .from(mangaCatalog)
      .where(
        or(
          eq(mangaCatalog.mangadexId, mdId),
          ...(alId ? [eq(mangaCatalog.anilistId, alId)] : []),
          ...(malId ? [eq(mangaCatalog.malId, malId)] : [])
        )
      )
      .limit(1);

    const langs = Array.isArray(attrs.availableTranslatedLanguages)
      ? (attrs.availableTranslatedLanguages.filter(Boolean) as string[])
      : ['en'];
    const coverRel = (item.relationships || []).find((r: any) => r.type === 'cover_art');
    const coverFile = coverRel?.attributes?.fileName;
    const mdCoverUrl = coverFile ? `https://uploads.mangadex.org/covers/${mdId}/${coverFile}` : null;

    if (existingRows.length > 0) {
      const existing = existingRows[0];
      await db
        .update(mangaCatalog)
        .set({
          mangadexId: mdId,
          availableLanguages: Array.from(new Set([...(existing.availableLanguages || []), ...langs])).slice(0, 14),
          latestChapterNumber: attrs.lastChapter || existing.latestChapterNumber,
          lastSyncedAt: new Date(),
        })
        .where(eq(mangaCatalog.id, existing.id));
      continue;
    }

    // Create deterministic canonicalId outside anime range
    let hash = 0;
    for (let i = 0; i < mdId.length; i++) {
      hash = (hash * 31 + mdId.charCodeAt(i)) | 0;
    }
    const canonicalId = malId || (alId ? 20_000_000 + alId : 30_000_000 + Math.abs(hash % 9_000_000));
    const origLang = String(attrs.originalLanguage || 'ja');
    const format = origLang === 'ko' ? 'MANHWA' : origLang === 'zh' ? 'MANHUA' : 'MANGA';
    const tags = Array.isArray(attrs.tags) ? attrs.tags : [];
    const genreList: string[] = tags
      .map((t: any) => t?.attributes?.name?.en)
      .filter((n: any): n is string => Boolean(n))
      .slice(0, 6);
    const isColor =
      origLang === 'ko' ||
      tags.some((t: any) => /full color|long strip|web comic/i.test(t?.attributes?.name?.en || ''));

    const statusMap: Record<string, string> = {
      ongoing: 'RELEASING',
      completed: 'FINISHED',
      hiatus: 'HIATUS',
      cancelled: 'CANCELLED',
    };

    const altTitles = (Array.isArray(attrs.altTitles) ? attrs.altTitles : [])
      .map((obj: Record<string, string>) => Object.values(obj)[0])
      .filter((v: unknown): v is string => typeof v === 'string' && Boolean(v.trim()))
      .slice(0, 8);

    const [inserted] = await db
      .insert(mangaCatalog)
      .values({
        canonicalId,
        anilistId: alId,
        malId,
        mangadexId: mdId,
        provider: 'mangadex',
        providerId: mdId,
        slug: `${slugifyRealm(titleStr)}-${canonicalId}`,
        titleEnglish: titleStr,
        titleRomaji: titleStr,
        titleNative: null,
        normalizedTitle: normalizeText(`${titleStr} ${altTitles.join(' ')}`),
        altTitles,
        synopsis: String(attrs.description?.en || Object.values(attrs.description || {})[0] || ''),
        coverImageUrl: mdCoverUrl || '/assets/extracted/filter-action.jpg',
        coverQuality: mdCoverUrl ? 'HD' : 'Standard',
        format,
        status: statusMap[String(attrs.status || 'ongoing').toLowerCase()] || 'RELEASING',
        releaseYear: attrs.year ? Number(attrs.year) : null,
        chaptersCount: attrs.lastChapter ? Number.parseInt(String(attrs.lastChapter), 10) || null : null,
        averageScore: null, // MangaDex search doesn't embed rating without statistics call — never invent ratings!
        scoreSource: 'MangaDex',
        popularity: 4000,
        trending: 0,
        readCount: 0,
        isColor,
        originalLanguage: origLang,
        availableLanguages: langs.slice(0, 14),
        latestChapterNumber: attrs.lastChapter || null,
        providerUrl: `https://mangadex.org/title/${mdId}`,
      })
      .onConflictDoNothing()
      .returning();

    if (inserted) {
      if (genreList.length > 0) {
        await linkMangaGenres(inserted.id, genreList);
      }
      const staffList = (item.relationships || [])
        .filter((r: any) => r.type === 'author' || r.type === 'artist')
        .map((r: any) => ({
          name: r.attributes?.name || '',
          role: r.type === 'artist' ? 'Art' : 'Story',
          providerId: r.id ? `md_${r.id}` : null,
        }))
        .filter((s: any) => s.name);
      if (staffList.length > 0) {
        await linkMangaAuthors(inserted.id, staffList);
      }
    }
  }
}

export async function hydrateMangaSummaries(rows: (typeof mangaCatalog.$inferSelect)[]): Promise<InkverseMangaSummary[]> {
  if (rows.length === 0) return [];
  const mangaIds = rows.map((r) => r.id);

  const [genreLinks, authorLinks] = await Promise.all([
    db
      .select({
        mangaId: mangaCatalogGenres.mangaId,
        name: mangaGenres.name,
      })
      .from(mangaCatalogGenres)
      .innerJoin(mangaGenres, eq(mangaCatalogGenres.genreId, mangaGenres.id))
      .where(inArray(mangaCatalogGenres.mangaId, mangaIds)),
    db
      .select({
        mangaId: mangaCatalogAuthors.mangaId,
        authorId: mangaAuthors.id,
        name: mangaAuthors.name,
        role: mangaCatalogAuthors.role,
      })
      .from(mangaCatalogAuthors)
      .innerJoin(mangaAuthors, eq(mangaCatalogAuthors.authorId, mangaAuthors.id))
      .where(inArray(mangaCatalogAuthors.mangaId, mangaIds)),
  ]);

  const genresByManga = new Map<number, string[]>();
  for (const g of genreLinks) {
    const arr = genresByManga.get(g.mangaId) || [];
    arr.push(g.name);
    genresByManga.set(g.mangaId, arr);
  }

  const authorsByManga = new Map<number, { id: number; name: string; role: string }[]>();
  for (const a of authorLinks) {
    const arr = authorsByManga.get(a.mangaId) || [];
    arr.push({ id: a.authorId, name: a.name, role: a.role });
    authorsByManga.set(a.mangaId, arr);
  }

  return rows.map((r) => ({
    id: r.id,
    canonicalId: r.canonicalId,
    anilistId: r.anilistId,
    malId: r.malId,
    mangadexId: r.mangadexId,
    slug: r.slug,
    title: r.titleEnglish || r.titleRomaji,
    titleEnglish: r.titleEnglish,
    titleRomaji: r.titleRomaji,
    titleNative: r.titleNative,
    altTitles: Array.isArray(r.altTitles) ? r.altTitles : [],
    synopsis: r.synopsis,
    coverImageUrl: r.coverImageUrl,
    coverQuality: r.coverQuality,
    coverWidth: r.coverWidth,
    coverHeight: r.coverHeight,
    bannerImageUrl: r.bannerImageUrl,
    format: r.format,
    status: r.status,
    releaseYear: r.releaseYear,
    volumesCount: r.volumesCount,
    chaptersCount: r.chaptersCount,
    score: typeof r.averageScore === 'number' && r.averageScore > 0 ? Number((r.averageScore / 10).toFixed(1)) : null,
    averageScore100: r.averageScore,
    scoreSource: r.scoreSource,
    popularity: r.popularity,
    trending: r.trending,
    readCount: r.readCount,
    isColor: r.isColor,
    originalLanguage: r.originalLanguage,
    availableLanguages: Array.isArray(r.availableLanguages) ? r.availableLanguages : ['en'],
    latestChapterNumber: r.latestChapterNumber,
    latestChapterAt: r.latestChapterAt ? r.latestChapterAt.toISOString() : null,
    externalReaderUrl: r.externalReaderUrl,
    providerUrl: r.providerUrl,
    uploadedByUid: r.uploadedByUid ?? null,
    isOriginalUpload: Boolean(r.isOriginalUpload),
    moderationStatus: r.moderationStatus || 'approved',
    hasInAppChapters: Boolean(r.hasInAppChapters),
    inAppChapterCount: Number(r.inAppChapterCount || 0),
    genres: genresByManga.get(r.id) || [],
    authors: authorsByManga.get(r.id) || [],
    characters: Array.isArray(r.charactersJson) ? r.charactersJson : [],
  }));
}

export async function recomputeMangaInAppStats(mangaId: number): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mangaChapters)
    .where(
      and(
        eq(mangaChapters.mangaId, mangaId),
        eq(mangaChapters.isAvailable, true),
        eq(mangaChapters.moderationStatus, 'approved'),
        sql`${mangaChapters.externalUrl} IS NULL`
      )
    );

  const [{ totalApproved }] = await db
    .select({ totalApproved: sql<number>`count(*)::int` })
    .from(mangaChapters)
    .where(and(eq(mangaChapters.mangaId, mangaId), eq(mangaChapters.moderationStatus, 'approved')));

  const inAppCount = Number(count || 0);
  await db
    .update(mangaCatalog)
    .set({
      hasInAppChapters: inAppCount > 0,
      inAppChapterCount: inAppCount,
      chaptersCount: totalApproved > 0 ? sql`GREATEST(COALESCE(${mangaCatalog.chaptersCount}, 0), ${totalApproved})` : mangaCatalog.chaptersCount,
    })
    .where(eq(mangaCatalog.id, mangaId));

  return inAppCount;
}

export async function refreshAllMangaInAppCounts(): Promise<void> {
  const counts = await db
    .select({
      mangaId: mangaChapters.mangaId,
      inAppCount: sql<number>`count(*) FILTER (WHERE ${mangaChapters.isAvailable} = true AND ${mangaChapters.moderationStatus} = 'approved' AND ${mangaChapters.externalUrl} IS NULL)::int`,
    })
    .from(mangaChapters)
    .groupBy(mangaChapters.mangaId);

  for (const row of counts) {
    await db
      .update(mangaCatalog)
      .set({
        hasInAppChapters: row.inAppCount > 0,
        inAppChapterCount: row.inAppCount,
      })
      .where(eq(mangaCatalog.id, row.mangaId));
  }
}

export async function getTrendingMangaList(limit = 10): Promise<InkverseMangaSummary[]> {
  let rows = await db
    .select()
    .from(mangaCatalog)
    .where(and(eq(mangaCatalog.isAdult, false), eq(mangaCatalog.moderationStatus, 'approved')))
    .orderBy(desc(mangaCatalog.trending), desc(mangaCatalog.popularity))
    .limit(limit);

  if (rows.length < 5) {
    await syncTrendingMangaCatalog();
    rows = await db
      .select()
      .from(mangaCatalog)
      .where(and(eq(mangaCatalog.isAdult, false), eq(mangaCatalog.moderationStatus, 'approved')))
      .orderBy(desc(mangaCatalog.trending), desc(mangaCatalog.popularity))
      .limit(limit);
  }

  // Prioritize iconic trending titles at top if present so the 5-card dashboard row displays strong variety
  const curatedOrder = [105398, 101517, 87216, 86123, 53390];
  const curatedRows = await db
    .select()
    .from(mangaCatalog)
    .where(
      and(
        eq(mangaCatalog.isAdult, false),
        eq(mangaCatalog.moderationStatus, 'approved'),
        inArray(mangaCatalog.anilistId, curatedOrder)
      )
    );

  const prioritized: (typeof mangaCatalog.$inferSelect)[] = [];
  const seen = new Set<number>();
  for (const alId of curatedOrder) {
    const match = curatedRows.find((r) => r.anilistId === alId) || rows.find((r) => r.anilistId === alId);
    if (match && !seen.has(match.id)) {
      seen.add(match.id);
      prioritized.push(match);
    }
  }
  for (const r of rows) {
    if (!seen.has(r.id)) {
      seen.add(r.id);
      prioritized.push(r);
    }
  }

  return hydrateMangaSummaries(prioritized.slice(0, limit));
}

export async function getReadableInAppMangaList(limit = 10): Promise<InkverseMangaSummary[]> {
  await refreshAllMangaInAppCounts();
  let rows = await db
    .select()
    .from(mangaCatalog)
    .where(
      and(
        eq(mangaCatalog.isAdult, false),
        eq(mangaCatalog.moderationStatus, 'approved'),
        eq(mangaCatalog.hasInAppChapters, true)
      )
    )
    .orderBy(desc(mangaCatalog.isOriginalUpload), desc(mangaCatalog.inAppChapterCount), desc(mangaCatalog.popularity))
    .limit(limit);

  if (rows.length < 5) {
    await syncTrendingMangaCatalog();
    rows = await db
      .select()
      .from(mangaCatalog)
      .where(
        and(
          eq(mangaCatalog.isAdult, false),
          eq(mangaCatalog.moderationStatus, 'approved'),
          eq(mangaCatalog.hasInAppChapters, true)
        )
      )
      .orderBy(desc(mangaCatalog.isOriginalUpload), desc(mangaCatalog.inAppChapterCount), desc(mangaCatalog.popularity))
      .limit(limit);
  }

  return hydrateMangaSummaries(rows);
}

export interface MangaBrowseParams {
  q?: string;
  genre?: string;
  status?: string;
  year?: number;
  minRating?: number; // 0..10 scale
  color?: 'color' | 'bw' | '';
  language?: string;
  inAppOnly?: boolean;
  originalsOnly?: boolean;
  viewerUid?: string;
  isAdmin?: boolean;
  sort?: 'popularity' | 'rating' | 'updated' | 'newest' | 'alphabetical' | 'trending';
  page?: number;
  perPage?: number;
}

export async function searchMangaCatalog(params: MangaBrowseParams): Promise<{
  items: InkverseMangaSummary[];
  pageInfo: {
    currentPage: number;
    perPage: number;
    hasNextPage: boolean;
    total: number;
  };
}> {
  const page = Math.max(1, params.page || 1);
  const perPage = Math.min(48, Math.max(1, params.perPage || 20));
  const offset = (page - 1) * perPage;

  // Ensure initial catalog is hydrated on first browse
  const [{ count: totalCount }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(mangaCatalog);
  if (totalCount < 6) {
    await syncTrendingMangaCatalog();
  }

  // If user passes a text query or genre filter, also query AniList live when results might expand catalog!
  const trimmedQ = (params.q || '').trim();
  if (trimmedQ.length >= 2 && page === 1) {
    const query = `
      query ($search: String, $genre: String) {
        Page(page: 1, perPage: 12) {
          media(type: MANGA, isAdult: false, search: $search, genre: $genre, sort: [SEARCH_MATCH, POPULARITY_DESC]) {
            ${ANILIST_MANGA_FIELDS}
          }
        }
      }
    `;
    const alRes = await fetchJsonWithTimeout<{ data?: { Page?: { media?: any[] } } }>(
      ANILIST_ENDPOINT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query,
          variables: {
            search: trimmedQ || undefined,
            genre: params.genre || undefined,
          },
        }),
      },
      5500
    );
    for (const node of alRes?.data?.Page?.media || []) {
      await upsertAniListMangaNode(node);
    }
  } else if (params.genre && page === 1) {
    const genreName = params.genre.trim();
    const query = `
      query ($genre: String) {
        Page(page: 1, perPage: 12) {
          media(type: MANGA, isAdult: false, genre: $genre, sort: [POPULARITY_DESC]) {
            ${ANILIST_MANGA_FIELDS}
          }
        }
      }
    `;
    const alRes = await fetchJsonWithTimeout<{ data?: { Page?: { media?: any[] } } }>(
      ANILIST_ENDPOINT,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, variables: { genre: genreName } }),
      },
      5000
    );
    for (const node of alRes?.data?.Page?.media || []) {
      await upsertAniListMangaNode(node);
    }
  }

  const conditions: any[] = [eq(mangaCatalog.isAdult, false)];

  if (!params.isAdmin) {
    if (params.viewerUid) {
      conditions.push(
        or(
          eq(mangaCatalog.moderationStatus, 'approved'),
          eq(mangaCatalog.uploadedByUid, params.viewerUid)
        )
      );
    } else {
      conditions.push(eq(mangaCatalog.moderationStatus, 'approved'));
    }
  }

  if (params.inAppOnly) {
    await refreshAllMangaInAppCounts();
    conditions.push(eq(mangaCatalog.hasInAppChapters, true));
  }

  if (params.originalsOnly) {
    conditions.push(eq(mangaCatalog.isOriginalUpload, true));
  }

  if (trimmedQ) {
    const likePattern = `%${trimmedQ}%`;
    const matchingAuthorMangaIds = await db
      .select({ mangaId: mangaCatalogAuthors.mangaId })
      .from(mangaCatalogAuthors)
      .innerJoin(mangaAuthors, eq(mangaCatalogAuthors.authorId, mangaAuthors.id))
      .where(ilike(mangaAuthors.name, likePattern));

    const authorIds = matchingAuthorMangaIds.map((m) => m.mangaId);
    const normQ = `%${normalizeText(trimmedQ)}%`;

    conditions.push(
      or(
        ilike(mangaCatalog.titleEnglish, likePattern),
        ilike(mangaCatalog.titleRomaji, likePattern),
        ilike(mangaCatalog.normalizedTitle, normQ),
        sql`${mangaCatalog.altTitles}::text ILIKE ${likePattern}`,
        sql`${mangaCatalog.charactersJson}::text ILIKE ${likePattern}`,
        ...(authorIds.length > 0 ? [inArray(mangaCatalog.id, authorIds)] : [])
      )
    );
  }

  if (params.genre) {
    const gSlug = slugifyRealm(params.genre);
    const matchingGenreMangaIds = await db
      .select({ mangaId: mangaCatalogGenres.mangaId })
      .from(mangaCatalogGenres)
      .innerJoin(mangaGenres, eq(mangaCatalogGenres.genreId, mangaGenres.id))
      .where(or(eq(mangaGenres.slug, gSlug), ilike(mangaGenres.name, params.genre.trim())));

    const gIds = matchingGenreMangaIds.map((g) => g.mangaId);
    if (gIds.length === 0) {
      return {
        items: [],
        pageInfo: { currentPage: page, perPage, hasNextPage: false, total: 0 },
      };
    }
    conditions.push(inArray(mangaCatalog.id, gIds));
  }

  if (params.status) {
    const s = params.status.toUpperCase();
    if (s === 'ONGOING' || s === 'RELEASING') {
      conditions.push(eq(mangaCatalog.status, 'RELEASING'));
    } else if (s === 'COMPLETED' || s === 'FINISHED') {
      conditions.push(eq(mangaCatalog.status, 'FINISHED'));
    } else if (['HIATUS', 'CANCELLED', 'NOT_YET_RELEASED'].includes(s)) {
      conditions.push(eq(mangaCatalog.status, s));
    }
  }

  if (params.year && Number.isFinite(params.year)) {
    conditions.push(eq(mangaCatalog.releaseYear, params.year));
  }

  if (params.minRating && params.minRating > 0) {
    conditions.push(gte(mangaCatalog.averageScore, Math.round(params.minRating * 10)));
  }

  if (params.color === 'color') {
    conditions.push(eq(mangaCatalog.isColor, true));
  } else if (params.color === 'bw') {
    conditions.push(eq(mangaCatalog.isColor, false));
  }

  if (params.language) {
    const langCode = params.language.toLowerCase();
    conditions.push(sql`${mangaCatalog.availableLanguages}::jsonb ? ${langCode}`);
  }

  const orderClause = (() => {
    switch (params.sort) {
      case 'rating':
        return [desc(sql`COALESCE(${mangaCatalog.averageScore}, 0)`), desc(mangaCatalog.popularity)];
      case 'updated':
        return [desc(sql`COALESCE(${mangaCatalog.latestChapterAt}, ${mangaCatalog.lastSyncedAt})`), desc(mangaCatalog.popularity)];
      case 'newest':
        return [desc(sql`COALESCE(${mangaCatalog.releaseYear}, 0)`), desc(mangaCatalog.popularity)];
      case 'alphabetical':
        return [asc(sql`COALESCE(${mangaCatalog.titleEnglish}, ${mangaCatalog.titleRomaji})`)];
      case 'trending':
        return [desc(mangaCatalog.trending), desc(mangaCatalog.popularity)];
      case 'popularity':
      default:
        return [desc(mangaCatalog.popularity), desc(mangaCatalog.trending)];
    }
  })();

  const whereExpr = conditions.length === 1 ? conditions[0] : and(...conditions);

  const [countRow, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(mangaCatalog).where(whereExpr),
    db
      .select()
      .from(mangaCatalog)
      .where(whereExpr)
      .orderBy(...orderClause)
      .limit(perPage)
      .offset(offset),
  ]);

  const total = countRow[0]?.count || 0;
  const items = await hydrateMangaSummaries(rows);

  return {
    items,
    pageInfo: {
      currentPage: page,
      perPage,
      hasNextPage: offset + items.length < total,
      total,
    },
  };
}

export async function syncChaptersFromMangaDex(mangaRow: typeof mangaCatalog.$inferSelect): Promise<void> {
  let mdId = mangaRow.mangadexId;
  if (!mdId) {
    const resolved = await resolveMangaDexIdByTitle(
      mangaRow.titleEnglish || mangaRow.titleRomaji,
      mangaRow.malId
    );
    if (resolved) {
      mdId = resolved.mangadexId;
      await db
        .update(mangaCatalog)
        .set({
          mangadexId: mdId,
          availableLanguages: Array.from(
            new Set([...(mangaRow.availableLanguages || ['en']), ...resolved.availableLanguages])
          ).slice(0, 14),
        })
        .where(eq(mangaCatalog.id, mangaRow.id));
    }
  }

  if (!mdId) return;

  // Fetch BOTH ascending (from Ch. 1!) and descending (latest chapters) so users can read directly in-app from the start
  const ascUrl = `${MANGADEX_BASE}/manga/${mdId}/feed?limit=100&translatedLanguage[]=en&translatedLanguage[]=ja&translatedLanguage[]=es&translatedLanguage[]=fr&includes[]=scanlation_group&contentRating[]=safe&contentRating[]=suggestive&order[chapter]=asc`;
  const descUrl = `${MANGADEX_BASE}/manga/${mdId}/feed?limit=100&translatedLanguage[]=en&translatedLanguage[]=ja&translatedLanguage[]=es&translatedLanguage[]=fr&includes[]=scanlation_group&contentRating[]=safe&contentRating[]=suggestive&order[chapter]=desc`;
  const [ascRes, descRes] = await Promise.all([
    fetchJsonWithTimeout<{ data?: any[] }>(ascUrl, undefined, 7000),
    fetchJsonWithTimeout<{ data?: any[] }>(descUrl, undefined, 7000),
  ]);

  const seenCh = new Set<string>();
  const chapters: any[] = [];
  for (const ch of [...(descRes?.data || []), ...(ascRes?.data || [])]) {
    if (ch?.id && !seenCh.has(ch.id)) {
      seenCh.add(ch.id);
      chapters.push(ch);
    }
  }

  const volumeCounter = new Map<string, number>();
  let latestChapterNum: string | null = null;
  let latestChapterDate: Date | null = null;

  for (const ch of chapters) {
    const extId = ch?.id;
    const attrs = ch?.attributes;
    if (!extId || !attrs) continue;

    const chNumStr = String(attrs.chapter ?? attrs.volume ?? '0');
    const sortKey = parseChapterSortKey(chNumStr);
    const pages = Number(attrs.pages || 0);
    const extUrl = attrs.externalUrl ? String(attrs.externalUrl) : null;
    const isAvailable = pages > 0 && !extUrl;
    const qualityTier = extUrl ? 'External' : isAvailable ? 'HD' : 'Unavailable';

    const groupRel = (ch.relationships || []).find((r: any) => r.type === 'scanlation_group');
    const groupName = String(groupRel?.attributes?.name || (extUrl ? 'Official Publisher' : 'Creator / Community'));
    const pubDate = attrs.publishAt ? new Date(attrs.publishAt) : attrs.createdAt ? new Date(attrs.createdAt) : null;

    if (attrs.volume) {
      volumeCounter.set(String(attrs.volume), (volumeCounter.get(String(attrs.volume)) || 0) + 1);
    }
    if (!latestChapterNum && attrs.translatedLanguage === 'en') {
      latestChapterNum = chNumStr;
      latestChapterDate = pubDate;
    }

    await db
      .insert(mangaChapters)
      .values({
        mangaId: mangaRow.id,
        externalChapterId: extId,
        provider: extUrl ? 'official_external' : 'mangadex',
        volumeNumber: attrs.volume ? String(attrs.volume) : null,
        chapterNumber: chNumStr,
        chapterSortKey: sortKey,
        title: String(attrs.title || '').trim(),
        language: String(attrs.translatedLanguage || 'en'),
        pageCount: pages,
        isAvailable,
        isColor: mangaRow.isColor,
        qualityTier,
        externalUrl: extUrl,
        scanlationGroup: groupName,
        moderationStatus: 'approved',
        publishedAt: pubDate,
      })
      .onConflictDoUpdate({
        target: mangaChapters.externalChapterId,
        set: {
          pageCount: pages,
          isAvailable,
          qualityTier,
          externalUrl: extUrl,
          title: String(attrs.title || '').trim(),
          cachedAt: new Date(),
        },
      });
  }

  for (const [volNum, chCount] of volumeCounter.entries()) {
    await db
      .insert(mangaVolumes)
      .values({
        mangaId: mangaRow.id,
        volumeNumber: volNum,
        title: `Volume ${volNum}`,
        chapterCount: chCount,
      })
      .onConflictDoNothing();
  }

  if (latestChapterNum || latestChapterDate) {
    await db
      .update(mangaCatalog)
      .set({
        latestChapterNumber: latestChapterNum ?? mangaRow.latestChapterNumber,
        latestChapterAt: latestChapterDate ?? mangaRow.latestChapterAt,
      })
      .where(eq(mangaCatalog.id, mangaRow.id));
  }

  await recomputeMangaInAppStats(mangaRow.id);
}

export async function getMangaDetailById(
  idOrCanonical: number,
  viewerUid?: string,
  isAdmin = false
): Promise<{
  manga: InkverseMangaSummary;
  chapters: InkverseChapterSummary[];
  volumes: { id: number; volumeNumber: string; title: string; chapterCount: number }[];
  relatedAnime: {
    animeCanonicalId: number;
    animeMalId: number | null;
    animeTitle: string;
    relationType: string;
    relationLabel: string;
    continuationNote: string;
    imageUrl: string | null;
  }[];
  relatedManga: InkverseMangaSummary[];
} | null> {
  let [row] = await db
    .select()
    .from(mangaCatalog)
    .where(or(eq(mangaCatalog.id, idOrCanonical), eq(mangaCatalog.canonicalId, idOrCanonical)))
    .limit(1);

  if (!row) {
    // Attempt live AniList resolution if canonicalId looks like an AniList/MAL ID
    const alId = idOrCanonical >= 20_000_000 ? idOrCanonical - 20_000_000 : null;
    const malId = idOrCanonical < 20_000_000 ? idOrCanonical : null;
    const query = `
      query ($id: Int, $idMal: Int) {
        Media(id: $id, idMal: $idMal, type: MANGA) {
          ${ANILIST_MANGA_FIELDS}
        }
      }
    `;
    const res = await fetchJsonWithTimeout<{ data?: { Media?: any } }>(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables: { id: alId || undefined, idMal: malId || undefined } }),
    });
    if (res?.data?.Media) {
      const createdId = await upsertAniListMangaNode(res.data.Media);
      if (createdId) {
        [row] = await db.select().from(mangaCatalog).where(eq(mangaCatalog.id, createdId)).limit(1);
      }
    }
  }

  if (!row) return null;

  if (
    row.moderationStatus !== 'approved' &&
    !isAdmin &&
    (!viewerUid || row.uploadedByUid !== viewerUid)
  ) {
    return null;
  }

  // Hydrate chapters from MangaDex if none cached yet (skip external sync for creator originals)
  const existingChapters = await db
    .select()
    .from(mangaChapters)
    .where(eq(mangaChapters.mangaId, row.id))
    .orderBy(desc(mangaChapters.chapterSortKey), asc(mangaChapters.language));

  if (existingChapters.length === 0 && !row.isOriginalUpload) {
    await syncChaptersFromMangaDex(row);
    const [refreshedRow] = await db
      .select()
      .from(mangaCatalog)
      .where(eq(mangaCatalog.id, row.id))
      .limit(1);
    if (refreshedRow) row = refreshedRow;
  }

  const chapterVisibilityCond = isAdmin
    ? eq(mangaChapters.mangaId, row.id)
    : viewerUid
      ? and(
          eq(mangaChapters.mangaId, row.id),
          or(
            eq(mangaChapters.moderationStatus, 'approved'),
            eq(mangaChapters.uploadedByUid, viewerUid)
          )
        )
      : and(eq(mangaChapters.mangaId, row.id), eq(mangaChapters.moderationStatus, 'approved'));

  const [chapters, volumes, relRows, summaryArr] = await Promise.all([
    db
      .select()
      .from(mangaChapters)
      .where(chapterVisibilityCond)
      .orderBy(desc(mangaChapters.chapterSortKey), asc(mangaChapters.language)),
    db
      .select()
      .from(mangaVolumes)
      .where(eq(mangaVolumes.mangaId, row.id))
      .orderBy(asc(mangaVolumes.volumeNumber)),
    db
      .select()
      .from(animeMangaRelations)
      .where(eq(animeMangaRelations.mangaId, row.id)),
    hydrateMangaSummaries([row]),
  ]);

  // Enrich related anime thumbnails from anime_catalog if available
  const animeIds = relRows.map((r) => r.animeCanonicalId);
  const animeThumbs = new Map<number, string>();
  if (animeIds.length > 0) {
    const catRows = await db
      .select({ canonicalId: animeCatalog.canonicalId, imageUrl: animeCatalog.coverImageUrl })
      .from(animeCatalog)
      .where(inArray(animeCatalog.canonicalId, animeIds));
    for (const c of catRows) {
      animeThumbs.set(c.canonicalId, c.imageUrl);
    }
  }

  // Find related manga sharing same anime adaptation or overlapping genres
  const relatedMangaRows = await db
    .select()
    .from(mangaCatalog)
    .where(
      and(
        eq(mangaCatalog.isAdult, false),
        eq(mangaCatalog.moderationStatus, 'approved'),
        sql`${mangaCatalog.id} <> ${row.id}`
      )
    )
    .orderBy(desc(mangaCatalog.hasInAppChapters), desc(mangaCatalog.popularity))
    .limit(6);
  const relatedManga = await hydrateMangaSummaries(relatedMangaRows);

  return {
    manga: summaryArr[0],
    chapters: chapters.map((c) => ({
      id: c.id,
      mangaId: c.mangaId,
      externalChapterId: c.externalChapterId,
      provider: c.provider,
      volumeNumber: c.volumeNumber,
      chapterNumber: c.chapterNumber,
      chapterSortKey: c.chapterSortKey,
      title: c.title,
      language: c.language,
      pageCount: c.pageCount,
      isAvailable: c.isAvailable,
      isColor: c.isColor,
      qualityTier: c.qualityTier,
      externalUrl: c.externalUrl,
      scanlationGroup: c.scanlationGroup,
      publishedAt: c.publishedAt ? c.publishedAt.toISOString() : null,
      uploadedByUid: c.uploadedByUid ?? null,
      moderationStatus: c.moderationStatus || 'approved',
      moderationNote: c.moderationNote || '',
    })),
    volumes: volumes.map((v) => ({
      id: v.id,
      volumeNumber: v.volumeNumber,
      title: v.title,
      chapterCount: v.chapterCount,
    })),
    relatedAnime: relRows.map((r) => ({
      animeCanonicalId: r.animeCanonicalId,
      animeMalId: r.animeMalId,
      animeTitle: r.animeTitle,
      relationType: r.relationType,
      relationLabel: r.relationLabel,
      continuationNote: r.continuationNote,
      imageUrl: animeThumbs.get(r.animeCanonicalId) || null,
    })),
    relatedManga,
  };
}

export async function getChapterPagesForReader(
  chapterId: number,
  viewerUid?: string,
  isAdmin = false
): Promise<{
  chapter: InkverseChapterSummary;
  manga: InkverseMangaSummary;
  pages: InkverseReaderPage[];
  prevChapterId: number | null;
  nextChapterId: number | null;
  isExternalRestricted: boolean;
  externalUrl: string | null;
  providerNotice: string | null;
} | null> {
  const [chapter] = await db
    .select()
    .from(mangaChapters)
    .where(eq(mangaChapters.id, chapterId))
    .limit(1);
  if (!chapter) return null;

  const [mangaRow] = await db
    .select()
    .from(mangaCatalog)
    .where(eq(mangaCatalog.id, chapter.mangaId))
    .limit(1);
  if (!mangaRow) return null;

  const isOwner = Boolean(viewerUid && (chapter.uploadedByUid === viewerUid || mangaRow.uploadedByUid === viewerUid));
  if (
    (chapter.moderationStatus !== 'approved' || mangaRow.moderationStatus !== 'approved') &&
    !isAdmin &&
    !isOwner
  ) {
    return null;
  }

  // Adjacent chapters in same language (sorted ascending by chapterSortKey)
  const sameLangChapters = await db
    .select({ id: mangaChapters.id, chapterSortKey: mangaChapters.chapterSortKey })
    .from(mangaChapters)
    .where(
      and(
        eq(mangaChapters.mangaId, chapter.mangaId),
        eq(mangaChapters.language, chapter.language),
        eq(mangaChapters.moderationStatus, 'approved')
      )
    )
    .orderBy(asc(mangaChapters.chapterSortKey), asc(mangaChapters.id));

  const currentIdx = sameLangChapters.findIndex((c) => c.id === chapter.id);
  const prevChapterId = currentIdx > 0 ? sameLangChapters[currentIdx - 1].id : null;
  const nextChapterId =
    currentIdx >= 0 && currentIdx < sameLangChapters.length - 1
      ? sameLangChapters[currentIdx + 1].id
      : null;

  const [mangaSummary] = await hydrateMangaSummaries([mangaRow]);

  const chapterSummary: InkverseChapterSummary = {
    id: chapter.id,
    mangaId: chapter.mangaId,
    externalChapterId: chapter.externalChapterId,
    provider: chapter.provider,
    volumeNumber: chapter.volumeNumber,
    chapterNumber: chapter.chapterNumber,
    chapterSortKey: chapter.chapterSortKey,
    title: chapter.title,
    language: chapter.language,
    pageCount: chapter.pageCount,
    isAvailable: chapter.isAvailable,
    isColor: chapter.isColor,
    qualityTier: chapter.qualityTier,
    externalUrl: chapter.externalUrl,
    scanlationGroup: chapter.scanlationGroup,
    publishedAt: chapter.publishedAt ? chapter.publishedAt.toISOString() : null,
    uploadedByUid: chapter.uploadedByUid ?? null,
    moderationStatus: chapter.moderationStatus || 'approved',
    moderationNote: chapter.moderationNote || '',
  };

  // Respect official publisher restrictions honestly
  if (chapter.externalUrl) {
    return {
      chapter: chapterSummary,
      manga: mangaSummary,
      pages: [],
      prevChapterId,
      nextChapterId,
      isExternalRestricted: true,
      externalUrl: chapter.externalUrl,
      providerNotice: `This chapter is hosted on an official licensed publisher platform (${chapter.scanlationGroup || 'Official Reader'}). Open the licensed reader below to support the creators.`,
    };
  }

  // Check cached manga_images first (also serves Creator Original chapters stored in PostgreSQL)
  const cachedImages = await db
    .select()
    .from(mangaImages)
    .where(eq(mangaImages.chapterId, chapter.id))
    .orderBy(asc(mangaImages.pageNumber));

  if (cachedImages.length > 0) {
    return {
      chapter: chapterSummary,
      manga: mangaSummary,
      pages: cachedImages.map((img) => {
        const computedQuality =
          img.width || img.height
            ? classifyResolutionLabel(img.width, img.height)
            : (img.qualityLabel as '4K' | 'HD' | 'Standard') || 'Standard';
        return {
          pageNumber: img.pageNumber,
          imageUrl: img.imageUrl,
          hdUrl: img.hdUrl,
          width: img.width,
          height: img.height,
          qualityLabel: computedQuality,
          isColor: img.isColor,
        };
      }),
      prevChapterId,
      nextChapterId,
      isExternalRestricted: false,
      externalUrl: null,
      providerNotice: null,
    };
  }

  if (chapter.provider === 'kage_creator') {
    return {
      chapter: chapterSummary,
      manga: mangaSummary,
      pages: [],
      prevChapterId,
      nextChapterId,
      isExternalRestricted: false,
      externalUrl: null,
      providerNotice: 'No pages uploaded for this creator chapter yet.',
    };
  }

  // Fetch genuine At-Home delivery URLs from MangaDex
  const atHome = await fetchJsonWithTimeout<{
    baseUrl?: string;
    chapter?: { hash?: string; data?: string[]; dataSaver?: string[] };
  }>(`${MANGADEX_BASE}/at-home/server/${chapter.externalChapterId}`, undefined, 7000);

  if (!atHome?.baseUrl || !atHome?.chapter?.hash || !Array.isArray(atHome.chapter.data) || atHome.chapter.data.length === 0) {
    return {
      chapter: chapterSummary,
      manga: mangaSummary,
      pages: [],
      prevChapterId,
      nextChapterId,
      isExternalRestricted: false,
      externalUrl: null,
      providerNotice: 'Chapter pages are temporarily unavailable from the content provider.',
    };
  }

  const baseUrl = atHome.baseUrl.replace(/\/+$/, '');
  const hash = atHome.chapter.hash;
  const fullFiles = atHome.chapter.data;
  const saverFiles = Array.isArray(atHome.chapter.dataSaver) ? atHome.chapter.dataSaver : [];

  const pages: InkverseReaderPage[] = [];
  for (let i = 0; i < fullFiles.length; i++) {
    const file = fullFiles[i];
    const saverFile = saverFiles[i];
    const directHdUrl = `${baseUrl}/data/${hash}/${file}`;
    const directSaverUrl = saverFile ? `${baseUrl}/data-saver/${hash}/${saverFile}` : directHdUrl;
    const proxiedHd = `/api/inkverse/image-proxy?url=${encodeURIComponent(directHdUrl)}`;
    const proxiedStd = `/api/inkverse/image-proxy?url=${encodeURIComponent(directSaverUrl)}`;

    // MangaDex 'data' delivers original high-res scans cleanly without false 4K inflation
    const qualityLabel: '4K' | 'HD' | 'Standard' = 'HD';
    pages.push({
      pageNumber: i + 1,
      imageUrl: proxiedHd,
      hdUrl: proxiedStd,
      width: null,
      height: null,
      qualityLabel,
      isColor: chapter.isColor,
    });

    await db
      .insert(mangaImages)
      .values({
        chapterId: chapter.id,
        pageNumber: i + 1,
        imageUrl: proxiedHd,
        hdUrl: proxiedStd,
        width: null,
        height: null,
        qualityLabel,
        isColor: chapter.isColor,
      })
      .onConflictDoNothing();
  }

  await db
    .update(mangaChapters)
    .set({ pageCount: pages.length, isAvailable: true, qualityTier: 'HD' })
    .where(eq(mangaChapters.id, chapter.id));

  return {
    chapter: { ...chapterSummary, pageCount: pages.length, isAvailable: true, qualityTier: 'HD' },
    manga: mangaSummary,
    pages,
    prevChapterId,
    nextChapterId,
    isExternalRestricted: false,
    externalUrl: null,
    providerNotice: null,
  };
}

export async function getMangaRelationsForAnime(
  animeCanonicalId: number,
  animeMalId?: number | null,
  animeTitle?: string | null
): Promise<{
  relationType: string;
  relationLabel: string;
  continuationNote: string;
  isVerified: boolean;
  manga: InkverseMangaSummary;
}[]> {
  let rels = await db
    .select()
    .from(animeMangaRelations)
    .where(
      or(
        eq(animeMangaRelations.animeCanonicalId, animeCanonicalId),
        ...(animeMalId ? [eq(animeMangaRelations.animeMalId, animeMalId)] : [])
      )
    );

  // If no verified anime->manga links stored yet, query AniList GraphQL on demand!
  if (rels.length === 0) {
    const query = `
      query ($id: Int, $idMal: Int) {
        Media(id: $id, idMal: $idMal, type: ANIME) {
          id
          idMal
          title { english romaji }
          relations {
            edges {
              relationType
              node {
                id
                idMal
                type
              }
            }
          }
        }
      }
    `;
    const isSyntheticAl = animeCanonicalId >= 10_000_000;
    const alAnimeId = isSyntheticAl ? animeCanonicalId - 10_000_000 : undefined;
    const malAnimeId = animeMalId || (!isSyntheticAl ? animeCanonicalId : undefined);

    const res = await fetchJsonWithTimeout<{ data?: { Media?: any } }>(ANILIST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        variables: { id: alAnimeId, idMal: malAnimeId },
      }),
    }, 5500);

    const media = res?.data?.Media;
    const edges = Array.isArray(media?.relations?.edges) ? media.relations.edges : [];
    const mangaNodes = edges.filter((e: any) => e?.node?.type === 'MANGA');

    for (const edge of mangaNodes.slice(0, 4)) {
      const mId = Number(edge.node.id);
      const mQuery = `query ($id: Int) { Media(id: $id, type: MANGA) { ${ANILIST_MANGA_FIELDS} } }`;
      const mRes = await fetchJsonWithTimeout<{ data?: { Media?: any } }>(ANILIST_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: mQuery, variables: { id: mId } }),
      }, 5000);
      if (mRes?.data?.Media) {
        const mangaDbId = await upsertAniListMangaNode(mRes.data.Media);
        if (mangaDbId) {
          const rawRel = String(edge.relationType || 'SOURCE');
          const relType =
            rawRel === 'SOURCE'
              ? 'ORIGINAL_MANGA'
              : rawRel === 'SPIN_OFF'
                ? 'SPIN_OFF'
                : rawRel === 'SEQUEL'
                  ? 'SEQUEL'
                  : rawRel === 'SIDE_STORY'
                    ? 'SIDE_STORY'
                    : 'ADAPTATION';
          const relLabel =
            relType === 'ORIGINAL_MANGA'
              ? 'Original Manga'
              : relType === 'SPIN_OFF'
                ? 'Spin-Off Manga'
                : relType === 'SEQUEL'
                  ? 'Sequel Manga'
                  : relType === 'SIDE_STORY'
                    ? 'Side Story'
                    : 'Manga Adaptation';

          await db
            .insert(animeMangaRelations)
            .values({
              animeCanonicalId,
              animeMalId: malAnimeId || null,
              animeTitle: animeTitle || media?.title?.english || media?.title?.romaji || `Anime #${animeCanonicalId}`,
              mangaId: mangaDbId,
              relationType: relType,
              relationLabel: relLabel,
              continuationNote: '',
              isVerified: true,
            })
            .onConflictDoNothing();
        }
      }
    }

    rels = await db
      .select()
      .from(animeMangaRelations)
      .where(
        or(
          eq(animeMangaRelations.animeCanonicalId, animeCanonicalId),
          ...(animeMalId ? [eq(animeMangaRelations.animeMalId, animeMalId)] : [])
        )
      );
  }

  if (rels.length === 0) return [];
  const mangaIds = Array.from(new Set(rels.map((r) => r.mangaId)));
  const mangaRows = await db.select().from(mangaCatalog).where(inArray(mangaCatalog.id, mangaIds));
  const summaries = await hydrateMangaSummaries(mangaRows);
  const byId = new Map(summaries.map((m) => [m.id, m]));

  // Deduplicate by mangaId, preferring ORIGINAL_MANGA or rows with continuation notes
  const deduped = new Map<number, (typeof rels)[number]>();
  for (const r of rels) {
    const prev = deduped.get(r.mangaId);
    if (
      !prev ||
      (r.relationType === 'ORIGINAL_MANGA' && prev.relationType !== 'ORIGINAL_MANGA') ||
      (Boolean(r.continuationNote) && !prev.continuationNote)
    ) {
      deduped.set(r.mangaId, r);
    }
  }

  return Array.from(deduped.values())
    .map((r) => {
      const m = byId.get(r.mangaId);
      if (!m) return null;
      return {
        relationType: r.relationType,
        relationLabel: r.relationLabel,
        continuationNote: r.continuationNote,
        isVerified: r.isVerified,
        manga: m,
      };
    })
    .filter((v): v is NonNullable<typeof v> => Boolean(v));
}

export async function isAllowedInkverseProxyHost(targetUrl: string): Promise<boolean> {
  try {
    const parsed = new URL(targetUrl);
    if (parsed.protocol !== 'https:') return false;
    const h = parsed.hostname.toLowerCase();
    return (
      h === 'uploads.mangadex.org' ||
      h === 'mangadex.org' ||
      h.endsWith('.mangadex.network') ||
      h.endsWith('.anilist.co') ||
      h === 'cdn.myanimelist.net'
    );
  } catch {
    return false;
  }
}

export async function getCategoryArtworkCounts(): Promise<Record<string, number>> {
  const rows = await db
    .select({
      slug: mangaGenres.slug,
      count: sql<number>`count(${mangaCatalogGenres.mangaId})::int`,
    })
    .from(mangaGenres)
    .leftJoin(mangaCatalogGenres, eq(mangaGenres.id, mangaCatalogGenres.genreId))
    .groupBy(mangaGenres.slug);

  const counts: Record<string, number> = {};
  for (const r of rows) {
    counts[r.slug] = r.count;
  }
  return counts;
}
