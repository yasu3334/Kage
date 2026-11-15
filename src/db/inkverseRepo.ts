import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  animeCatalog,
  characterCatalog,
  mangaAuthors,
  mangaBookmarks,
  mangaCatalog,
  mangaCatalogAuthors,
  mangaChapters,
  mangaImages,
  mangaReadingHistory,
  mangaReviews,
  profiles,
  userMangaLibrary,
  users,
} from './schema.ts';
import {
  classifyResolutionLabel,
  getCategoryArtworkCounts,
  getReadableInAppMangaList,
  getTrendingMangaList,
  hydrateMangaSummaries,
  linkMangaAuthors,
  linkMangaGenres,
  normalizeText,
  parseChapterSortKey,
  recomputeMangaInAppStats,
  type InkverseMangaSummary,
} from '../server/inkverseCatalog.ts';
import { slugifyRealm } from '../lib/genres.ts';
import { validateMangaTextSafety } from '../server/mediaValidator.ts';
import { uploadValidatedMediaAsset } from '../server/mediaAccess.ts';
import { HttpError } from './profileSystemRepo.ts';

const VALID_LIBRARY_STATUSES = [
  'reading',
  'completed',
  'plan_to_read',
  'on_hold',
  'dropped',
] as const;

export type MangaLibraryStatus = (typeof VALID_LIBRARY_STATUSES)[number];

export interface InkverseContinueReadingItem {
  manga: InkverseMangaSummary;
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

export async function getInkverseDashboard(viewerUid?: string) {
  const [trending, readableInApp, categoryCounts] = await Promise.all([
    getTrendingMangaList(10),
    getReadableInAppMangaList(10),
    getCategoryArtworkCounts(),
  ]);

  let continueReading: InkverseContinueReadingItem | null = null;
  let myMangaSummary: Record<string, number> | null = null;

  if (viewerUid) {
    const [latestHist] = await db
      .select()
      .from(mangaReadingHistory)
      .where(eq(mangaReadingHistory.userUid, viewerUid))
      .orderBy(desc(mangaReadingHistory.lastReadAt))
      .limit(1);

    if (latestHist) {
      const [mangaRow] = await db
        .select()
        .from(mangaCatalog)
        .where(eq(mangaCatalog.id, latestHist.mangaId))
        .limit(1);

      if (mangaRow) {
        const [summaries, [libEntry], [previewImg]] = await Promise.all([
          hydrateMangaSummaries([mangaRow]),
          db
            .select()
            .from(userMangaLibrary)
            .where(
              and(
                eq(userMangaLibrary.userUid, viewerUid),
                eq(userMangaLibrary.mangaId, mangaRow.id)
              )
            )
            .limit(1),
          latestHist.chapterId
            ? db
                .select({ imageUrl: mangaImages.imageUrl })
                .from(mangaImages)
                .where(eq(mangaImages.chapterId, latestHist.chapterId))
                .orderBy(mangaImages.pageNumber)
                .limit(1)
            : Promise.resolve([]),
        ]);

        if (summaries[0]) {
          continueReading = {
            manga: summaries[0],
            chapterId: latestHist.chapterId,
            chapterNumber: latestHist.chapterNumber,
            chapterTitle: latestHist.chapterTitle,
            pageNumber: latestHist.pageNumber,
            totalPages: latestHist.totalPages,
            progressPercent: latestHist.progressPercent,
            readingMode: latestHist.readingMode,
            previewImageUrl: previewImg?.imageUrl || null,
            isBookmarked: Boolean(libEntry?.isBookmarked),
            lastReadAt: latestHist.lastReadAt.toISOString(),
          };
        }
      }
    }

    const libRows = await db
      .select({
        status: userMangaLibrary.status,
        isBookmarked: userMangaLibrary.isBookmarked,
      })
      .from(userMangaLibrary)
      .where(eq(userMangaLibrary.userUid, viewerUid));

    myMangaSummary = {
      reading: libRows.filter((r) => r.status === 'reading').length,
      completed: libRows.filter((r) => r.status === 'completed').length,
      plan_to_read: libRows.filter((r) => r.status === 'plan_to_read').length,
      on_hold: libRows.filter((r) => r.status === 'on_hold').length,
      dropped: libRows.filter((r) => r.status === 'dropped').length,
      bookmarked: libRows.filter((r) => r.isBookmarked).length,
    };
  }

  return {
    trending,
    readableInApp,
    continueReading,
    categoryCounts,
    myMangaSummary,
  };
}

export async function incrementMangaReadCount(mangaId: number): Promise<number> {
  const [updated] = await db
    .update(mangaCatalog)
    .set({
      readCount: sql`${mangaCatalog.readCount} + 1`,
    })
    .where(eq(mangaCatalog.id, mangaId))
    .returning({ readCount: mangaCatalog.readCount });
  return updated?.readCount ?? 0;
}

export async function upsertMangaReadingProgress(
  viewerUid: string,
  payload: {
    mangaId: number;
    chapterId: number | null;
    pageNumber: number;
    totalPages: number;
    readingMode?: string;
  }
) {
  const [mangaRow] = await db
    .select()
    .from(mangaCatalog)
    .where(eq(mangaCatalog.id, payload.mangaId))
    .limit(1);
  if (!mangaRow) {
    throw new Error('Manga record not found.');
  }

  let chapterNumber = mangaRow.latestChapterNumber || '1';
  let chapterTitle = '';
  if (payload.chapterId) {
    const [ch] = await db
      .select()
      .from(mangaChapters)
      .where(eq(mangaChapters.id, payload.chapterId))
      .limit(1);
    if (ch) {
      chapterNumber = ch.chapterNumber;
      chapterTitle = ch.title;
    }
  }

  const totalPages = Math.max(1, Number(payload.totalPages || 1));
  const pageNumber = Math.min(totalPages, Math.max(1, Number(payload.pageNumber || 1)));
  const progressPercent = Math.min(100, Math.max(1, Math.round((pageNumber / totalPages) * 100)));
  const mode = payload.readingMode === 'page' ? 'page' : 'vertical';
  const now = new Date();

  const [historyRow] = await db
    .insert(mangaReadingHistory)
    .values({
      userUid: viewerUid,
      mangaId: payload.mangaId,
      chapterId: payload.chapterId,
      chapterNumber,
      chapterTitle,
      pageNumber,
      totalPages,
      progressPercent,
      readingMode: mode,
      lastReadAt: now,
    })
    .onConflictDoUpdate({
      target: [mangaReadingHistory.userUid, mangaReadingHistory.mangaId],
      set: {
        chapterId: payload.chapterId,
        chapterNumber,
        chapterTitle,
        pageNumber,
        totalPages,
        progressPercent,
        readingMode: mode,
        lastReadAt: now,
      },
    })
    .returning();

  const [existingLib] = await db
    .select()
    .from(userMangaLibrary)
    .where(
      and(eq(userMangaLibrary.userUid, viewerUid), eq(userMangaLibrary.mangaId, payload.mangaId))
    )
    .limit(1);

  const nextStatus =
    existingLib?.status === 'completed' ? 'completed' : 'reading';

  const [libraryEntry] = await db
    .insert(userMangaLibrary)
    .values({
      userUid: viewerUid,
      mangaId: payload.mangaId,
      status: nextStatus,
      isBookmarked: existingLib?.isBookmarked ?? false,
      currentChapterId: payload.chapterId,
      currentChapterNumber: chapterNumber,
      currentPage: pageNumber,
      totalPages,
      progressPercent,
      lastReadAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userMangaLibrary.userUid, userMangaLibrary.mangaId],
      set: {
        status: nextStatus,
        currentChapterId: payload.chapterId,
        currentChapterNumber: chapterNumber,
        currentPage: pageNumber,
        totalPages,
        progressPercent,
        lastReadAt: now,
        updatedAt: now,
      },
    })
    .returning();

  return { history: historyRow, libraryEntry };
}

export async function getUserMangaEntry(viewerUid: string, mangaId: number) {
  const [entry] = await db
    .select()
    .from(userMangaLibrary)
    .where(and(eq(userMangaLibrary.userUid, viewerUid), eq(userMangaLibrary.mangaId, mangaId)))
    .limit(1);

  const [history] = await db
    .select()
    .from(mangaReadingHistory)
    .where(
      and(eq(mangaReadingHistory.userUid, viewerUid), eq(mangaReadingHistory.mangaId, mangaId))
    )
    .limit(1);

  return { entry: entry || null, history: history || null };
}

export async function upsertUserMangaEntry(
  viewerUid: string,
  payload: {
    mangaId: number;
    status?: string;
    isBookmarked?: boolean;
    personalScore?: number | null;
  }
) {
  const [mangaRow] = await db
    .select()
    .from(mangaCatalog)
    .where(eq(mangaCatalog.id, payload.mangaId))
    .limit(1);
  if (!mangaRow) {
    throw new Error('Manga not found.');
  }

  const [existing] = await db
    .select()
    .from(userMangaLibrary)
    .where(and(eq(userMangaLibrary.userUid, viewerUid), eq(userMangaLibrary.mangaId, payload.mangaId)))
    .limit(1);

  const status: MangaLibraryStatus =
    payload.status && (VALID_LIBRARY_STATUSES as readonly string[]).includes(payload.status)
      ? (payload.status as MangaLibraryStatus)
      : (existing?.status as MangaLibraryStatus) || 'plan_to_read';

  const isBookmarked =
    payload.isBookmarked !== undefined
      ? Boolean(payload.isBookmarked)
      : existing?.isBookmarked ?? false;

  const personalScore =
    payload.personalScore !== undefined
      ? payload.personalScore !== null
        ? Math.min(10, Math.max(1, Math.round(Number(payload.personalScore))))
        : null
      : existing?.personalScore ?? null;

  const now = new Date();
  const [saved] = await db
    .insert(userMangaLibrary)
    .values({
      userUid: viewerUid,
      mangaId: payload.mangaId,
      status,
      isBookmarked,
      personalScore,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [userMangaLibrary.userUid, userMangaLibrary.mangaId],
      set: {
        status,
        isBookmarked,
        personalScore,
        updatedAt: now,
      },
    })
    .returning();

  return saved;
}

export async function removeUserMangaEntry(viewerUid: string, mangaId: number) {
  await db
    .delete(userMangaLibrary)
    .where(and(eq(userMangaLibrary.userUid, viewerUid), eq(userMangaLibrary.mangaId, mangaId)));
  return { deleted: true };
}

export async function getUserMangaLibraryList(viewerUid: string, filterTab = 'all') {
  const rows = await db
    .select()
    .from(userMangaLibrary)
    .where(eq(userMangaLibrary.userUid, viewerUid))
    .orderBy(desc(sql`COALESCE(${userMangaLibrary.lastReadAt}, ${userMangaLibrary.updatedAt})`));

  const counts = {
    all: rows.length,
    reading: rows.filter((r) => r.status === 'reading').length,
    completed: rows.filter((r) => r.status === 'completed').length,
    plan_to_read: rows.filter((r) => r.status === 'plan_to_read').length,
    on_hold: rows.filter((r) => r.status === 'on_hold').length,
    dropped: rows.filter((r) => r.status === 'dropped').length,
    bookmarked: rows.filter((r) => r.isBookmarked).length,
  };

  const filtered = rows.filter((r) => {
    if (filterTab === 'bookmarked') return r.isBookmarked;
    if ((VALID_LIBRARY_STATUSES as readonly string[]).includes(filterTab)) {
      return r.status === filterTab;
    }
    return true;
  });

  if (filtered.length === 0) {
    return { items: [], counts };
  }

  const mangaIds = filtered.map((r) => r.mangaId);
  const mangaRows = await db
    .select()
    .from(mangaCatalog)
    .where(inArray(mangaCatalog.id, mangaIds));

  const summaries = await hydrateMangaSummaries(mangaRows);
  const byId = new Map(summaries.map((m) => [m.id, m]));

  const items = filtered
    .map((entry) => {
      const manga = byId.get(entry.mangaId);
      if (!manga) return null;
      return {
        id: entry.id,
        mangaId: entry.mangaId,
        status: entry.status,
        isBookmarked: entry.isBookmarked,
        currentChapterId: entry.currentChapterId,
        currentChapterNumber: entry.currentChapterNumber,
        currentPage: entry.currentPage,
        totalPages: entry.totalPages,
        progressPercent: entry.progressPercent,
        personalScore: entry.personalScore,
        addedAt: entry.addedAt.toISOString(),
        lastReadAt: entry.lastReadAt ? entry.lastReadAt.toISOString() : null,
        updatedAt: entry.updatedAt.toISOString(),
        manga,
      };
    })
    .filter((v): v is NonNullable<typeof v> => Boolean(v));

  return { items, counts };
}

export async function toggleMangaPageBookmark(
  viewerUid: string,
  payload: {
    mangaId: number;
    chapterId: number;
    chapterNumber: string;
    pageNumber: number;
    note?: string;
  }
) {
  const [existing] = await db
    .select()
    .from(mangaBookmarks)
    .where(
      and(
        eq(mangaBookmarks.userUid, viewerUid),
        eq(mangaBookmarks.chapterId, payload.chapterId),
        eq(mangaBookmarks.pageNumber, payload.pageNumber)
      )
    )
    .limit(1);

  if (existing) {
    await db.delete(mangaBookmarks).where(eq(mangaBookmarks.id, existing.id));
    return { bookmarked: false, bookmark: null };
  }

  const [created] = await db
    .insert(mangaBookmarks)
    .values({
      userUid: viewerUid,
      mangaId: payload.mangaId,
      chapterId: payload.chapterId,
      chapterNumber: payload.chapterNumber,
      pageNumber: payload.pageNumber,
      note: (payload.note || '').trim().slice(0, 200),
    })
    .returning();

  // Also flag manga as bookmarked in userMangaLibrary so it surfaces in Bookmarked tab
  await upsertUserMangaEntry(viewerUid, {
    mangaId: payload.mangaId,
    isBookmarked: true,
  });

  return { bookmarked: true, bookmark: created };
}

export async function listMangaBookmarks(viewerUid: string, mangaId?: number) {
  const cond = mangaId
    ? and(eq(mangaBookmarks.userUid, viewerUid), eq(mangaBookmarks.mangaId, mangaId))
    : eq(mangaBookmarks.userUid, viewerUid);

  const rows = await db
    .select()
    .from(mangaBookmarks)
    .where(cond)
    .orderBy(desc(mangaBookmarks.createdAt))
    .limit(50);

  return rows;
}

export async function listMangaReviews(mangaId: number, _viewerUid?: string) {
  const rows = await db
    .select({
      review: mangaReviews,
      authorUid: users.uid,
      username: users.username,
      role: users.role,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(mangaReviews)
    .innerJoin(users, eq(mangaReviews.authorUid, users.uid))
    .leftJoin(profiles, eq(users.uid, profiles.userUid))
    .where(eq(mangaReviews.mangaId, mangaId))
    .orderBy(desc(mangaReviews.createdAt))
    .limit(40);

  const rated = rows.filter((r) => typeof r.review.rating === 'number' && r.review.rating > 0);
  const kageAverageScore =
    rated.length > 0
      ? Number(
          (
            rated.reduce((sum, r) => sum + Number(r.review.rating || 0), 0) / rated.length
          ).toFixed(1)
        )
      : null;

  return {
    reviews: rows.map((r) => ({
      id: r.review.id,
      mangaId: r.review.mangaId,
      authorUid: r.review.authorUid,
      rating: r.review.rating,
      title: r.review.title,
      content: r.review.content,
      containsSpoilers: r.review.containsSpoilers,
      createdAt: r.review.createdAt.toISOString(),
      author: {
        uid: r.authorUid,
        username: r.username,
        role: r.role,
        displayName: r.displayName || r.username,
        avatarUrl: r.avatarUrl || 'asset:avatar_default',
      },
    })),
    kageReviewCount: rows.length,
    kageAverageScore,
  };
}

export async function createMangaReview(
  viewerUid: string,
  mangaId: number,
  payload: {
    rating?: number | null;
    title?: string;
    content: string;
    containsSpoilers?: boolean;
  }
) {
  const content = (payload.content || '').trim();
  if (content.length < 10) {
    throw new Error('Write at least 10 characters for your review.');
  }

  const [mangaRow] = await db
    .select()
    .from(mangaCatalog)
    .where(eq(mangaCatalog.id, mangaId))
    .limit(1);
  if (!mangaRow) {
    throw new Error('Manga not found.');
  }

  const rating =
    payload.rating !== undefined && payload.rating !== null && Number(payload.rating) > 0
      ? Math.min(10, Math.max(1, Math.round(Number(payload.rating))))
      : null;

  const title =
    (payload.title || '').trim() ||
    `${mangaRow.titleEnglish || mangaRow.titleRomaji} Review`;

  const [created] = await db
    .insert(mangaReviews)
    .values({
      authorUid: viewerUid,
      mangaId,
      rating,
      title,
      content,
      containsSpoilers: Boolean(payload.containsSpoilers),
    })
    .returning();

  return created;
}

export async function deleteMangaReview(viewerUid: string, reviewId: number) {
  const [rev] = await db
    .select()
    .from(mangaReviews)
    .where(eq(mangaReviews.id, reviewId))
    .limit(1);
  if (!rev) {
    throw new Error('Review not found.');
  }
  if (rev.authorUid !== viewerUid) {
    throw new Error('Forbidden: You can only delete your own review.');
  }
  await db.delete(mangaReviews).where(eq(mangaReviews.id, reviewId));
  return { deleted: true };
}

export async function getInkverseSearchSuggestions(q: string) {
  const trimmed = q.trim();
  if (trimmed.length < 2) {
    return { manga: [], anime: [], authors: [], characters: [] };
  }
  const likePattern = `%${trimmed}%`;

  const [mangaRows, animeRows, authorRows, charRows] = await Promise.all([
    db
      .select({
        id: mangaCatalog.id,
        canonicalId: mangaCatalog.canonicalId,
        titleEnglish: mangaCatalog.titleEnglish,
        titleRomaji: mangaCatalog.titleRomaji,
        coverImageUrl: mangaCatalog.coverImageUrl,
        format: mangaCatalog.format,
        releaseYear: mangaCatalog.releaseYear,
        averageScore: mangaCatalog.averageScore,
      })
      .from(mangaCatalog)
      .where(
        and(
          eq(mangaCatalog.isAdult, false),
          or(
            ilike(mangaCatalog.titleEnglish, likePattern),
            ilike(mangaCatalog.titleRomaji, likePattern),
            sql`${mangaCatalog.altTitles}::text ILIKE ${likePattern}`,
            sql`${mangaCatalog.charactersJson}::text ILIKE ${likePattern}`
          )
        )
      )
      .orderBy(desc(mangaCatalog.popularity))
      .limit(5),

    db
      .select({
        canonicalId: animeCatalog.canonicalId,
        titleEnglish: animeCatalog.titleEnglish,
        titleRomaji: animeCatalog.titleRomaji,
        coverImageUrl: animeCatalog.coverImageUrl,
        format: animeCatalog.format,
        releaseYear: animeCatalog.releaseYear,
      })
      .from(animeCatalog)
      .where(
        and(
          eq(animeCatalog.isAdult, false),
          or(
            ilike(animeCatalog.titleEnglish, likePattern),
            ilike(animeCatalog.titleRomaji, likePattern)
          )
        )
      )
      .orderBy(desc(animeCatalog.popularity))
      .limit(4),

    db
      .select({
        id: mangaAuthors.id,
        name: mangaAuthors.name,
        mangaId: mangaCatalogAuthors.mangaId,
      })
      .from(mangaAuthors)
      .leftJoin(mangaCatalogAuthors, eq(mangaAuthors.id, mangaCatalogAuthors.authorId))
      .where(ilike(mangaAuthors.name, likePattern))
      .limit(4),

    db
      .select({
        id: characterCatalog.id,
        name: characterCatalog.canonicalName,
        animeTitle: characterCatalog.animeTitle,
        animeMalId: characterCatalog.animeMalId,
        avatarUrl: characterCatalog.avatarUrl,
      })
      .from(characterCatalog)
      .where(
        and(
          eq(characterCatalog.isHidden, false),
          or(
            ilike(characterCatalog.canonicalName, likePattern),
            ilike(characterCatalog.animeTitle, likePattern)
          )
        )
      )
      .limit(4),
  ]);

  return {
    manga: mangaRows.map((m) => ({
      id: m.id,
      canonicalId: m.canonicalId,
      title: m.titleEnglish || m.titleRomaji,
      coverImageUrl: m.coverImageUrl,
      format: m.format,
      releaseYear: m.releaseYear,
      score:
        typeof m.averageScore === 'number' && m.averageScore > 0
          ? Number((m.averageScore / 10).toFixed(1))
          : null,
    })),
    anime: animeRows.map((a) => ({
      malId: a.canonicalId,
      title: a.titleEnglish || a.titleRomaji,
      coverImageUrl: a.coverImageUrl,
      format: a.format,
      releaseYear: a.releaseYear,
    })),
    authors: authorRows.map((a) => ({
      id: a.id,
      name: a.name,
      mangaId: a.mangaId,
    })),
    characters: charRows,
  };
}

// --- CREATOR MANGA UPLOAD STUDIO & SAFETY MODERATION ---

export async function createCreatorMangaSeries(
  actorUid: string,
  actorRole: string,
  payload: {
    title: string;
    altTitles?: string[];
    synopsis: string;
    authorName?: string;
    artistName?: string;
    format?: string;
    status?: string;
    releaseYear?: number | null;
    isColor?: boolean;
    originalLanguage?: string;
    genres?: string[];
    coverDataUrl: string;
    rightsDeclared: boolean;
  }
) {
  if (!payload.rightsDeclared) {
    throw new HttpError(
      400,
      'You must confirm original authorship or distribution rights and accept KAGE safety policies.'
    );
  }

  const title = (payload.title || '').trim();
  const synopsis = (payload.synopsis || '').trim();
  if (title.length < 2 || title.length > 120) {
    throw new HttpError(400, 'Series title must be between 2 and 120 characters.');
  }
  if (synopsis.length < 15 || synopsis.length > 4000) {
    throw new HttpError(400, 'Synopsis must be between 15 and 4000 characters.');
  }

  const altTitles = Array.isArray(payload.altTitles)
    ? payload.altTitles.map((s) => String(s || '').trim()).filter(Boolean).slice(0, 6)
    : [];

  const [creatorUser] = await db
    .select({ username: users.username, displayName: profiles.displayName })
    .from(users)
    .leftJoin(profiles, eq(users.uid, profiles.userUid))
    .where(eq(users.uid, actorUid))
    .limit(1);

  const authorName =
    (payload.authorName || '').trim() ||
    creatorUser?.displayName ||
    creatorUser?.username ||
    'KAGE Creator';
  const artistName = (payload.artistName || '').trim() || authorName;

  validateMangaTextSafety({
    title: [title, ...altTitles].join(' '),
    synopsis,
    authorName: `${authorName} ${artistName}`,
  });

  if (!payload.coverDataUrl) {
    throw new HttpError(400, 'Vertical manga cover image (PNG, JPEG, or WebP) is required.');
  }

  const uploadedCover = await uploadValidatedMediaAsset(actorUid, {
    dataUrl: payload.coverDataUrl,
    mediaType: 'image',
    purpose: 'manga_cover',
    visibility: 'public',
  });

  const coverQuality = classifyResolutionLabel(uploadedCover.width, uploadedCover.height);
  const validFormats = ['MANGA', 'MANHWA', 'MANHUA', 'ONE_SHOT', 'WEBTOON'];
  const format = validFormats.includes(String(payload.format || '').toUpperCase())
    ? String(payload.format).toUpperCase()
    : 'MANGA';
  const validStatuses = ['RELEASING', 'FINISHED', 'HIATUS'];
  const status = validStatuses.includes(String(payload.status || '').toUpperCase())
    ? String(payload.status).toUpperCase()
    : 'RELEASING';
  const origLang = String(payload.originalLanguage || 'en')
    .toLowerCase()
    .slice(0, 8);
  const releaseYear =
    payload.releaseYear && Number(payload.releaseYear) >= 1960 && Number(payload.releaseYear) <= 2030
      ? Number(payload.releaseYear)
      : new Date().getFullYear();

  const uniqueRand = Math.floor(100_000 + Math.random() * 8_800_000);
  const canonicalId = 40_000_000 + uniqueRand;
  const slug = `${slugifyRealm(title)}-${canonicalId}`;

  const isPrivileged = actorRole === 'owner' || actorRole === 'admin';
  const moderationStatus = 'approved';
  const moderationNote = isPrivileged
    ? 'Verified & published by KAGE Sovereign Admin.'
    : 'Automated artwork safety, resolution, and rights checks passed.';

  const [created] = await db
    .insert(mangaCatalog)
    .values({
      canonicalId,
      provider: 'kage_creator',
      providerId: `kage_${actorUid.slice(0, 12)}_${Date.now()}`,
      slug,
      titleEnglish: title,
      titleRomaji: title,
      normalizedTitle: normalizeText(`${title} ${altTitles.join(' ')} ${authorName}`),
      altTitles,
      synopsis,
      coverImageUrl: uploadedCover.url,
      coverQuality,
      coverWidth: uploadedCover.width,
      coverHeight: uploadedCover.height,
      format,
      status,
      releaseYear,
      chaptersCount: 0,
      averageScore: null,
      scoreSource: 'KAGE Creator',
      popularity: 100,
      trending: 50,
      readCount: 0,
      isColor: Boolean(payload.isColor),
      isAdult: false,
      originalLanguage: origLang || 'en',
      availableLanguages: [origLang || 'en'],
      uploadedByUid: actorUid,
      isOriginalUpload: true,
      moderationStatus,
      moderationNote,
      hasInAppChapters: false,
      inAppChapterCount: 0,
    })
    .returning();

  const genreList =
    Array.isArray(payload.genres) && payload.genres.length > 0
      ? payload.genres.map((g) => String(g).trim()).filter(Boolean).slice(0, 6)
      : ['Action'];
  await linkMangaGenres(created.id, genreList);

  const staff =
    authorName.toLowerCase() === artistName.toLowerCase()
      ? [{ name: authorName, role: 'Story & Art' }]
      : [
          { name: authorName, role: 'Story' },
          { name: artistName, role: 'Art' },
        ];
  await linkMangaAuthors(created.id, staff);

  const [summary] = await hydrateMangaSummaries([created]);
  return summary;
}

export async function uploadCreatorMangaChapter(
  actorUid: string,
  actorRole: string,
  mangaId: number,
  payload: {
    chapterNumber: string;
    volumeNumber?: string | null;
    title?: string;
    language?: string;
    isColor?: boolean;
    rightsDeclared: boolean;
    pagesDataUrls: string[];
  }
) {
  if (!payload.rightsDeclared) {
    throw new HttpError(
      400,
      'Rights & safety attestation must be accepted before publishing a chapter.'
    );
  }

  const [mangaRow] = await db
    .select()
    .from(mangaCatalog)
    .where(eq(mangaCatalog.id, mangaId))
    .limit(1);

  if (!mangaRow) {
    throw new HttpError(404, 'Manga series not found.');
  }

  const isAdmin = actorRole === 'owner' || actorRole === 'admin';
  const isOwnerOfSeries = mangaRow.uploadedByUid === actorUid;

  // Creators can add chapters to their own Creator series, or Admin/Owner can upload authorized chapters to any series
  if (!isOwnerOfSeries && !isAdmin) {
    throw new HttpError(
      403,
      'You can only publish chapters to manga series you created. Create your series in INKVERSE Studio first.'
    );
  }

  const chapterNumber = String(payload.chapterNumber || '').trim().slice(0, 24);
  if (!chapterNumber || !/^[0-9]+(\.[0-9]+)?$/.test(chapterNumber)) {
    throw new HttpError(400, 'Enter a valid chapter number (e.g., 1, 2, or 10.5).');
  }

  const chTitle = (payload.title || '').trim().slice(0, 140);
  const volumeNumber = payload.volumeNumber ? String(payload.volumeNumber).trim().slice(0, 24) : null;
  const language = String(payload.language || mangaRow.originalLanguage || 'en')
    .toLowerCase()
    .slice(0, 10);

  validateMangaTextSafety({
    title: mangaRow.titleEnglish || mangaRow.titleRomaji,
    chapterTitle: `${chapterNumber} ${chTitle}`,
  });

  const rawPages = Array.isArray(payload.pagesDataUrls) ? payload.pagesDataUrls : [];
  if (rawPages.length === 0 || rawPages.length > 50) {
    throw new HttpError(400, 'Upload between 1 and 50 manga page images per chapter.');
  }

  // Validate & upload every page safely via MediaValidator + Gemini moderation
  const uploadedPages: {
    url: string;
    width: number | null;
    height: number | null;
    qualityLabel: '4K' | 'HD' | 'Standard';
  }[] = [];

  for (let i = 0; i < rawPages.length; i++) {
    const asset = await uploadValidatedMediaAsset(actorUid, {
      dataUrl: rawPages[i],
      mediaType: 'image',
      purpose: 'manga_page',
      visibility: 'public',
    });
    const qualityLabel = classifyResolutionLabel(asset.width, asset.height);
    uploadedPages.push({
      url: asset.url,
      width: asset.width ?? null,
      height: asset.height ?? null,
      qualityLabel,
    });
  }

  // Compute genuine chapter quality tier based on lowest/median verified resolution
  const has4K = uploadedPages.every((p) => p.qualityLabel === '4K');
  const hasHD = uploadedPages.some((p) => p.qualityLabel === '4K' || p.qualityLabel === 'HD');
  const chapterQualityTier = has4K ? '4K' : hasHD ? 'HD' : 'Standard';

  const [uploaderProfile] = await db
    .select({ username: users.username, displayName: profiles.displayName })
    .from(users)
    .leftJoin(profiles, eq(users.uid, profiles.userUid))
    .where(eq(users.uid, actorUid))
    .limit(1);

  const scanlationGroup =
    uploaderProfile?.displayName || uploaderProfile?.username || 'KAGE Creator';
  const extChapterId = `kage_ch_${mangaId}_${chapterNumber}_${Date.now()}`;
  const isColor = payload.isColor !== undefined ? Boolean(payload.isColor) : mangaRow.isColor;
  const sortKey = parseChapterSortKey(chapterNumber);

  const [createdChapter] = await db
    .insert(mangaChapters)
    .values({
      mangaId: mangaRow.id,
      externalChapterId: extChapterId,
      provider: 'kage_creator',
      volumeNumber,
      chapterNumber,
      chapterSortKey: sortKey,
      title: chTitle,
      language,
      pageCount: uploadedPages.length,
      isAvailable: true,
      isColor,
      qualityTier: chapterQualityTier,
      externalUrl: null,
      scanlationGroup,
      uploadedByUid: actorUid,
      moderationStatus: 'approved',
      moderationNote: isAdmin
        ? 'Published by Sovereign Admin.'
        : 'Automated artwork safety & resolution checks passed.',
      rightsDeclared: true,
      publishedAt: new Date(),
    })
    .returning();

  for (let i = 0; i < uploadedPages.length; i++) {
    const p = uploadedPages[i];
    await db.insert(mangaImages).values({
      chapterId: createdChapter.id,
      pageNumber: i + 1,
      imageUrl: p.url,
      hdUrl: p.url,
      width: p.width,
      height: p.height,
      qualityLabel: p.qualityLabel,
      isColor,
    });
  }

  const nextLangs = Array.from(
    new Set([...(mangaRow.availableLanguages || ['en']), language])
  ).slice(0, 14);

  await db
    .update(mangaCatalog)
    .set({
      latestChapterNumber: chapterNumber,
      latestChapterAt: new Date(),
      availableLanguages: nextLangs,
      lastSyncedAt: new Date(),
    })
    .where(eq(mangaCatalog.id, mangaRow.id));

  await recomputeMangaInAppStats(mangaRow.id);

  return {
    chapter: createdChapter,
    pageCount: uploadedPages.length,
    qualityTier: chapterQualityTier,
  };
}

export async function listCreatorUploadedManga(actorUid: string, isAdmin = false) {
  const rows = await db
    .select()
    .from(mangaCatalog)
    .where(
      isAdmin
        ? eq(mangaCatalog.isOriginalUpload, true)
        : eq(mangaCatalog.uploadedByUid, actorUid)
    )
    .orderBy(desc(mangaCatalog.id))
    .limit(50);

  const summaries = await hydrateMangaSummaries(rows);
  if (summaries.length === 0) return [];

  const mangaIds = summaries.map((m) => m.id);
  const chapters = await db
    .select()
    .from(mangaChapters)
    .where(inArray(mangaChapters.mangaId, mangaIds))
    .orderBy(asc(mangaChapters.chapterSortKey), desc(mangaChapters.id));

  const chMap = new Map<number, typeof chapters>();
  for (const ch of chapters) {
    const arr = chMap.get(ch.mangaId) || [];
    arr.push(ch);
    chMap.set(ch.mangaId, arr);
  }

  return summaries.map((m) => ({
    ...m,
    chapters: (chMap.get(m.id) || []).map((c) => ({
      id: c.id,
      chapterNumber: c.chapterNumber,
      title: c.title,
      language: c.language,
      pageCount: c.pageCount,
      qualityTier: c.qualityTier,
      moderationStatus: c.moderationStatus,
      moderationNote: c.moderationNote,
      publishedAt: c.publishedAt ? c.publishedAt.toISOString() : null,
    })),
  }));
}

export async function deleteCreatorMangaOrChapter(
  actorUid: string,
  actorRole: string,
  type: 'manga' | 'chapter',
  targetId: number
) {
  const isAdmin = actorRole === 'owner' || actorRole === 'admin';

  if (type === 'manga') {
    const [row] = await db
      .select()
      .from(mangaCatalog)
      .where(eq(mangaCatalog.id, targetId))
      .limit(1);
    if (!row) throw new HttpError(404, 'Manga series not found.');
    if (!isAdmin && row.uploadedByUid !== actorUid) {
      throw new HttpError(403, 'You can only delete manga series you uploaded.');
    }
    await db.delete(mangaCatalog).where(eq(mangaCatalog.id, targetId));
    return { deleted: true, type: 'manga', id: targetId };
  }

  const [ch] = await db
    .select()
    .from(mangaChapters)
    .where(eq(mangaChapters.id, targetId))
    .limit(1);
  if (!ch) throw new HttpError(404, 'Chapter not found.');

  const [parentManga] = await db
    .select()
    .from(mangaCatalog)
    .where(eq(mangaCatalog.id, ch.mangaId))
    .limit(1);

  if (!isAdmin && ch.uploadedByUid !== actorUid && parentManga?.uploadedByUid !== actorUid) {
    throw new HttpError(403, 'You can only delete chapters you uploaded.');
  }

  await db.delete(mangaChapters).where(eq(mangaChapters.id, targetId));
  await recomputeMangaInAppStats(ch.mangaId);
  return { deleted: true, type: 'chapter', id: targetId };
}

export async function adminListInkverseModeration(statusFilter = 'all') {
  const seriesCond =
    statusFilter && statusFilter !== 'all'
      ? and(eq(mangaCatalog.isOriginalUpload, true), eq(mangaCatalog.moderationStatus, statusFilter))
      : eq(mangaCatalog.isOriginalUpload, true);

  const chapterCond =
    statusFilter && statusFilter !== 'all'
      ? and(eq(mangaChapters.provider, 'kage_creator'), eq(mangaChapters.moderationStatus, statusFilter))
      : eq(mangaChapters.provider, 'kage_creator');

  const [seriesRows, chapterRows] = await Promise.all([
    db.select().from(mangaCatalog).where(seriesCond).orderBy(desc(mangaCatalog.id)).limit(60),
    db
      .select({
        chapter: mangaChapters,
        mangaTitle: sql<string>`COALESCE(${mangaCatalog.titleEnglish}, ${mangaCatalog.titleRomaji})`,
      })
      .from(mangaChapters)
      .innerJoin(mangaCatalog, eq(mangaChapters.mangaId, mangaCatalog.id))
      .where(chapterCond)
      .orderBy(desc(mangaChapters.id))
      .limit(80),
  ]);

  const seriesSummaries = await hydrateMangaSummaries(seriesRows);

  const uploaderUids = Array.from(
    new Set([
      ...seriesRows.map((s) => s.uploadedByUid).filter((u): u is string => Boolean(u)),
      ...chapterRows.map((c) => c.chapter.uploadedByUid).filter((u): u is string => Boolean(u)),
    ])
  );

  const uploaderMap = new Map<string, { username: string; displayName: string }>();
  if (uploaderUids.length > 0) {
    const userRows = await db
      .select({ uid: users.uid, username: users.username, displayName: profiles.displayName })
      .from(users)
      .leftJoin(profiles, eq(users.uid, profiles.userUid))
      .where(inArray(users.uid, uploaderUids));
    for (const u of userRows) {
      uploaderMap.set(u.uid, { username: u.username, displayName: u.displayName || u.username });
    }
  }

  return {
    series: seriesSummaries.map((s) => ({
      ...s,
      uploader: s.uploadedByUid ? uploaderMap.get(s.uploadedByUid) || null : null,
    })),
    chapters: chapterRows.map((row) => ({
      id: row.chapter.id,
      mangaId: row.chapter.mangaId,
      mangaTitle: row.mangaTitle,
      chapterNumber: row.chapter.chapterNumber,
      title: row.chapter.title,
      language: row.chapter.language,
      pageCount: row.chapter.pageCount,
      qualityTier: row.chapter.qualityTier,
      moderationStatus: row.chapter.moderationStatus,
      moderationNote: row.chapter.moderationNote,
      rightsDeclared: row.chapter.rightsDeclared,
      publishedAt: row.chapter.publishedAt ? row.chapter.publishedAt.toISOString() : null,
      uploader: row.chapter.uploadedByUid
        ? uploaderMap.get(row.chapter.uploadedByUid) || null
        : null,
    })),
  };
}

export async function adminUpdateInkverseModeration(payload: {
  type: 'manga' | 'chapter';
  id: number;
  status: 'approved' | 'rejected' | 'pending_review';
  note?: string;
}) {
  const note = (payload.note || '').trim().slice(0, 500);
  if (payload.type === 'manga') {
    const [updated] = await db
      .update(mangaCatalog)
      .set({
        moderationStatus: payload.status,
        moderationNote: note || `Status set to ${payload.status} by Admin.`,
      })
      .where(eq(mangaCatalog.id, payload.id))
      .returning();
    if (!updated) throw new HttpError(404, 'Manga series not found.');
    return { updated };
  }

  const [updated] = await db
    .update(mangaChapters)
    .set({
      moderationStatus: payload.status,
      moderationNote: note || `Status set to ${payload.status} by Admin.`,
      isAvailable: payload.status === 'approved',
    })
    .where(eq(mangaChapters.id, payload.id))
    .returning();
  if (!updated) throw new HttpError(404, 'Chapter not found.');
  await recomputeMangaInAppStats(updated.mangaId);
  return { updated };
}

