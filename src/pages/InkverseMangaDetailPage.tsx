import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  BookOpen,
  ExternalLink,
  Eye,
  Film,
  Flag,
  Layers,
  Play,
  Star,
  Trash2,
  Upload,
  UserCheck,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { KageImage } from '../components/KageImage';
import { OwnerBadge } from '../components/KageBrand';
import { MangaPosterCard, type InkverseMangaItem } from '../components/InkverseComponents';
import { ReportModal } from '../components/ReportModal';
import { formatCompactNumber } from '../lib/formatters';

interface ChapterRow {
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
  moderationStatus?: string;
  moderationNote?: string | null;
  uploadedByUid?: string | null;
}

const LIBRARY_STATUSES = [
  { value: 'reading', label: 'Currently Reading' },
  { value: 'plan_to_read', label: 'Plan to Read' },
  { value: 'completed', label: 'Completed' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'dropped', label: 'Dropped' },
];

type DetailTab = 'about' | 'chapters' | 'related_manga' | 'related_anime' | 'reviews';

export const InkverseMangaDetailPage: React.FC = () => {
  const { mangaId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<DetailTab>('chapters');
  const [langFilter, setLangFilter] = useState<string>('en');
  const [chapterSourceFilter, setChapterSourceFilter] = useState<'all' | 'in_app' | 'external'>('all');
  const [reportOpen, setReportOpen] = useState(false);

  // Personal library & bookmark state
  const [libStatus, setLibStatus] = useState<string>('');
  const [isBookmarked, setIsBookmarked] = useState(false);
  const [savingLib, setSavingLib] = useState(false);

  // Review composer state
  const [revTitle, setRevTitle] = useState('');
  const [revBody, setRevBody] = useState('');
  const [revRating, setRevRating] = useState<number>(0);
  const [revSpoilers, setRevSpoilers] = useState(false);
  const [submittingRev, setSubmittingRev] = useState(false);
  const [revError, setRevError] = useState('');
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<number, boolean>>({});

  const loadDetail = useCallback(async () => {
    if (!mangaId) return;
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<any>(`/api/inkverse/manga/${encodeURIComponent(mangaId)}`);
      setData(res);
      if (res.viewerEntry) {
        setLibStatus(res.viewerEntry.status || '');
        setIsBookmarked(Boolean(res.viewerEntry.isBookmarked));
      } else {
        setLibStatus('');
        setIsBookmarked(false);
      }

      const chapters: ChapterRow[] = Array.isArray(res.chapters) ? res.chapters : [];
      if (chapters.length > 0 && !chapters.some((c) => c.language === 'en')) {
        setLangFilter(chapters[0].language);
      } else {
        setLangFilter('en');
      }
      const hasInApp = chapters.some((c) => !c.externalUrl && c.isAvailable);
      setChapterSourceFilter(hasInApp ? 'in_app' : 'all');
    } catch (err: any) {
      setError(err?.message || 'Unable to load manga details.');
    } finally {
      setLoading(false);
    }
  }, [mangaId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleSaveLibrary = async (nextStatus?: string, nextBookmark?: boolean) => {
    if (!data?.manga) return;
    if (!user) {
      navigate(`/auth/login?redirect=${encodeURIComponent(`/inkverse/manga/${mangaId}`)}`);
      return;
    }
    const statusToSave = nextStatus !== undefined ? nextStatus : libStatus || 'plan_to_read';
    const bookmarkToSave = nextBookmark !== undefined ? nextBookmark : isBookmarked;

    setLibStatus(statusToSave);
    setIsBookmarked(bookmarkToSave);
    setSavingLib(true);
    try {
      await apiFetch('/api/inkverse/my-manga', {
        method: 'POST',
        body: JSON.stringify({
          mangaId: data.manga.id,
          status: statusToSave,
          isBookmarked: bookmarkToSave,
        }),
      });
    } catch {
      // ignore
    } finally {
      setSavingLib(false);
    }
  };

  const handleRemoveLibrary = async () => {
    if (!user || !data?.manga) return;
    setSavingLib(true);
    try {
      await apiFetch(`/api/inkverse/my-manga/${data.manga.id}`, { method: 'DELETE' });
      setLibStatus('');
      setIsBookmarked(false);
    } catch {
      // ignore
    } finally {
      setSavingLib(false);
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate(`/auth/login?redirect=${encodeURIComponent(`/inkverse/manga/${mangaId}`)}`);
      return;
    }
    if (!data?.manga) return;
    setRevError('');
    if (revBody.trim().length < 10) {
      setRevError('Write at least 10 characters for your review.');
      return;
    }

    setSubmittingRev(true);
    try {
      await apiFetch(`/api/inkverse/manga/${data.manga.id}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          title: revTitle.trim() || `${data.manga.title} Review`,
          content: revBody.trim(),
          rating: revRating > 0 ? revRating : null,
          containsSpoilers: revSpoilers,
        }),
      });
      setRevTitle('');
      setRevBody('');
      setRevRating(0);
      setRevSpoilers(false);
      await loadDetail();
    } catch (err: any) {
      setRevError(err?.message || 'Could not publish review.');
    } finally {
      setSubmittingRev(false);
    }
  };

  const handleDeleteReview = async (reviewId: number) => {
    try {
      await apiFetch(`/api/inkverse/reviews/${reviewId}`, { method: 'DELETE' });
      await loadDetail();
    } catch {
      // ignore
    }
  };

  const chaptersList: ChapterRow[] = useMemo(
    () => (Array.isArray(data?.chapters) ? data.chapters : []),
    [data]
  );

  const chapterLanguages = useMemo(
    () => Array.from(new Set(chaptersList.map((c) => c.language))),
    [chaptersList]
  );

  const langChapters = useMemo(() => {
    if (!langFilter) return chaptersList;
    return chaptersList.filter((c) => c.language === langFilter);
  }, [chaptersList, langFilter]);

  const directChapters = useMemo(
    () => langChapters.filter((c) => !c.externalUrl && c.isAvailable),
    [langChapters]
  );

  const externalChapters = useMemo(
    () => langChapters.filter((c) => Boolean(c.externalUrl)),
    [langChapters]
  );

  const filteredChapters = useMemo(() => {
    if (chapterSourceFilter === 'in_app') return directChapters;
    if (chapterSourceFilter === 'external') return externalChapters;
    return langChapters;
  }, [chapterSourceFilter, directChapters, externalChapters, langChapters]);

  const firstReadableChapter = useMemo(() => {
    const sortedAsc = [...langChapters].sort((a, b) => a.chapterSortKey - b.chapterSortKey);
    return sortedAsc.find((c) => !c.externalUrl && c.isAvailable) || null;
  }, [langChapters]);

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-72 sm:h-96 rounded-3xl bg-[#141116] animate-pulse border border-white/8" />
        <div className="h-24 rounded-2xl bg-[#141116] animate-pulse border border-white/8" />
        <div className="h-44 rounded-2xl bg-[#141116] animate-pulse border border-white/8" />
      </div>
    );
  }

  if (error || !data?.manga) {
    return (
      <div className="p-8 sm:p-12 rounded-3xl bg-[#141116] border border-white/10 text-center space-y-4 my-4">
        <p className="text-sm font-semibold text-[#F5F1F2]">{error || 'Manga not found.'}</p>
        <Link
          to="/inkverse"
          className="inline-flex min-h-[44px] px-5 items-center rounded-xl bg-[#C0263D] text-white text-xs font-semibold"
        >
          Back to INKVERSE
        </Link>
      </div>
    );
  }

  const {
    manga,
    volumes = [],
    relatedAnime = [],
    relatedManga = [],
    reviews = [],
    kageReviewCount = 0,
    kageAverageScore = null,
    viewerHistory = null,
  } = data as {
    manga: InkverseMangaItem;
    volumes: { id: number; volumeNumber: string; title: string; chapterCount: number }[];
    relatedAnime: any[];
    relatedManga: InkverseMangaItem[];
    reviews: any[];
    kageReviewCount: number;
    kageAverageScore: number | null;
    viewerHistory: any;
  };

  const primaryReadTarget = viewerHistory?.chapterId
    ? `/inkverse/read/${manga.id}/${viewerHistory.chapterId}?page=${viewerHistory.pageNumber || 1}`
    : firstReadableChapter
      ? `/inkverse/read/${manga.id}/${firstReadableChapter.id}`
      : null;

  const altTitlesDisplay = Array.from(
    new Set(
      [
        manga.titleRomaji && manga.titleRomaji !== manga.title ? manga.titleRomaji : null,
        manga.titleNative || null,
        ...(Array.isArray(manga.altTitles) ? manga.altTitles.slice(0, 4) : []),
      ].filter((v): v is string => Boolean(v))
    )
  );

  const statusLabel =
    manga.status === 'RELEASING'
      ? 'Ongoing'
      : manga.status === 'FINISHED'
        ? 'Completed'
        : manga.status === 'HIATUS'
          ? 'On Hiatus'
          : manga.status;

  return (
    <div className="space-y-7 pb-10">
      {/* 1. Hero Header */}
      <div className="relative rounded-3xl overflow-hidden bg-[#141116] border border-white/10 min-h-[310px] sm:min-h-[380px] flex flex-col justify-between">
        <KageImage
          strictArtwork
          priority
          src={manga.bannerImageUrl || manga.coverImageUrl}
          alt={manga.title}
          fallbackLabel={manga.title}
          className="absolute inset-0 w-full h-full object-cover opacity-50 blur-[1px]"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#09080B] via-[#09080B]/75 to-black/35" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#09080B]/90 via-[#09080B]/45 to-transparent" />

        {/* Back Navigation */}
        <div className="relative z-10 p-4 sm:p-5 flex items-center justify-between">
          <button
            type="button"
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="min-h-[44px] min-w-[44px] rounded-full bg-[#09080B]/80 backdrop-blur-md border border-white/15 flex items-center justify-center text-[#F5F1F2] hover:bg-[#09080B] cursor-pointer"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          {manga.coverQuality && (
            <span className="px-2.5 py-1 rounded-lg bg-[#09080B]/80 border border-white/15 text-[11px] font-bold tracking-wider uppercase text-[#F5F1F2]">
              {manga.coverQuality} Artwork
            </span>
          )}
        </div>

        {/* Cover + Info + Primary CTAs */}
        <div className="relative z-10 p-5 sm:p-8 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div className="flex items-end gap-4 sm:gap-6 min-w-0">
            <div className="w-28 sm:w-36 aspect-[2/3] rounded-2xl overflow-hidden border border-white/20 bg-[#09080B] shrink-0 shadow-2xl">
              <KageImage
                strictArtwork
                src={manga.coverImageUrl}
                alt={manga.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="space-y-2 min-w-0">
              <h1 className="text-2xl sm:text-4xl font-bold text-[#F5F1F2] tracking-tight text-balance">
                {manga.title}{' '}
                {manga.releaseYear ? (
                  <span className="font-normal text-[#A7A0AA]">({manga.releaseYear})</span>
                ) : null}
              </h1>

              {altTitlesDisplay.length > 0 && (
                <p className="text-xs text-[#A7A0AA] line-clamp-1">
                  {altTitlesDisplay.join(' · ')}
                </p>
              )}

              {/* Author & Artist */}
              {manga.authors.length > 0 && (
                <p className="text-xs sm:text-sm text-[#F5F1F2]/90">
                  By{' '}
                  {manga.authors.map((a, idx) => (
                    <React.Fragment key={`${a.id}-${idx}`}>
                      {idx > 0 && ', '}
                      <Link
                        to={`/inkverse/browse?q=${encodeURIComponent(a.name)}`}
                        className="font-semibold hover:text-[#C0263D] underline-offset-4 hover:underline"
                      >
                        {a.name}
                      </Link>
                      <span className="text-[#A7A0AA]"> ({a.role})</span>
                    </React.Fragment>
                  ))}
                </p>
              )}

              {/* Unboxed Metadata */}
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs font-mono-num text-[#A7A0AA]">
                <span className="text-[#F5F1F2] font-semibold">{manga.format}</span>
                <span aria-hidden="true">·</span>
                <span>{statusLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{manga.isColor ? 'Full Color' : 'Black & White'}</span>
                {(chaptersList.length > 0 || manga.chaptersCount) && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      {chaptersList.length > 0
                        ? `${chaptersList.length} synced chapters`
                        : `${manga.chaptersCount} chapters`}
                    </span>
                  </>
                )}
                {manga.volumesCount && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{manga.volumesCount} volumes</span>
                  </>
                )}
              </div>

              {/* Ratings + Read Count */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono-num">
                {typeof manga.score === 'number' && manga.score > 0 && (
                  <span className="inline-flex items-center gap-1 text-[#F5F1F2] font-semibold">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span>{manga.score.toFixed(1)}/10</span>
                    <span className="text-[#A7A0AA] font-normal">({manga.scoreSource})</span>
                  </span>
                )}
                <span className="inline-flex items-center gap-1 text-[#A7A0AA]">
                  <Eye className="w-3.5 h-3.5" />
                  <span>{formatCompactNumber(manga.readCount)} reads on KAGE</span>
                </span>
                {kageAverageScore !== null && (
                  <span className="text-[#A7A0AA]">
                    · KAGE Readers: {kageAverageScore}/10 ({kageReviewCount})
                  </span>
                )}
              </div>

              {/* Genres */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#A7A0AA] pt-0.5">
                {manga.genres.map((g, idx) => (
                  <React.Fragment key={g}>
                    {idx > 0 && <span aria-hidden="true">·</span>}
                    <Link
                      to={`/inkverse/browse?genre=${encodeURIComponent(g)}`}
                      className="text-[#F5F1F2] hover:text-[#C0263D] underline-offset-4 hover:underline"
                    >
                      {g}
                    </Link>
                  </React.Fragment>
                ))}
              </div>
            </div>
          </div>

          {/* Primary Actions */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {primaryReadTarget ? (
              <Link
                to={primaryReadTarget}
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-[0_0_24px_rgba(192,38,61,0.45)] kage-press whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5 fill-white" />
                <span>
                  {viewerHistory?.chapterId
                    ? `Resume Ch. ${viewerHistory.chapterNumber}`
                    : `Start Reading Ch. ${firstReadableChapter?.chapterNumber || '1'}`}
                </span>
              </Link>
            ) : manga.externalReaderUrl ? (
              <a
                href={manga.externalReaderUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 shadow-lg kage-press whitespace-nowrap"
              >
                <BookOpen className="w-4 h-4" />
                <span>Read on Official Publisher</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </a>
            ) : null}

            <button
              type="button"
              disabled={savingLib}
              onClick={() => handleSaveLibrary(undefined, !isBookmarked)}
              className={`min-h-[44px] px-4 rounded-xl border text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors kage-press ${
                isBookmarked
                  ? 'bg-[#6D28D9]/25 border-[#6D28D9] text-violet-200'
                  : 'bg-[#09080B]/85 border-white/15 text-[#F5F1F2] hover:border-white/30'
              }`}
            >
              <Bookmark
                className={`w-4 h-4 ${isBookmarked ? 'fill-violet-300 text-violet-300' : ''}`}
              />
              <span>{isBookmarked ? 'Bookmarked' : 'Bookmark'}</span>
            </button>

            {user &&
              (manga.uploadedByUid === user.uid ||
                user.role === 'owner' ||
                user.role === 'admin') && (
                <Link
                  to={`/inkverse/studio?mangaId=${manga.id}`}
                  className="min-h-[44px] px-4 rounded-xl bg-[#09080B]/85 border border-white/15 hover:border-[#C0263D] text-xs sm:text-sm font-semibold text-[#F5F1F2] inline-flex items-center gap-2 kage-press whitespace-nowrap"
                >
                  <Upload className="w-4 h-4 text-[#C0263D]" />
                  <span>Upload Chapter</span>
                </Link>
              )}

            {user && (
              <button
                type="button"
                onClick={() => setReportOpen(true)}
                aria-label="Report manga"
                title="Report inappropriate or unauthorized content"
                className="min-h-[44px] min-w-[44px] rounded-xl bg-[#09080B]/85 border border-white/15 hover:border-rose-500/50 text-[#A7A0AA] hover:text-rose-300 inline-flex items-center justify-center cursor-pointer transition-colors"
              >
                <Flag className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Add to My Manga Library Controls */}
      <section className="p-4 sm:p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-[#F5F1F2]">
            <UserCheck className="w-4 h-4 text-[#C0263D]" />
            <span>Add to My Manga</span>
            {savingLib && <span className="text-xs font-normal text-[#A7A0AA]">(Syncing...)</span>}
          </div>

          {libStatus && (
            <button
              type="button"
              onClick={handleRemoveLibrary}
              className="text-xs text-[#A7A0AA] hover:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Remove from Library</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {LIBRARY_STATUSES.map((st) => (
            <button
              key={st.value}
              type="button"
              onClick={() => handleSaveLibrary(st.value)}
              className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer kage-press ${
                libStatus === st.value
                  ? 'bg-[#C0263D] border-[#C0263D] text-white'
                  : 'bg-[#09080B] border-white/10 text-[#A7A0AA] hover:text-[#F5F1F2]'
              }`}
            >
              {st.label}
            </button>
          ))}
        </div>
      </section>

      {/* 3. Section Tabs: Chapters / About Manga / Related Anime / Related Manga / Reviews */}
      <div className="flex items-center gap-5 overflow-x-auto border-b border-white/10 text-xs sm:text-sm no-scrollbar">
        {(
          [
            { id: 'chapters', label: `Chapters (${chaptersList.length})` },
            { id: 'about', label: 'About Manga' },
            { id: 'related_anime', label: `Related Anime (${relatedAnime.length})` },
            { id: 'related_manga', label: `Related Manga (${relatedManga.length})` },
            { id: 'reviews', label: `Reviews (${kageReviewCount})` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setActiveTab(t.id)}
            className={`min-h-[44px] pb-2 font-semibold relative whitespace-nowrap shrink-0 cursor-pointer ${
              activeTab === t.id ? 'text-[#F5F1F2]' : 'text-[#A7A0AA] hover:text-[#F5F1F2]'
            }`}
          >
            <span className="tabular-nums">{t.label}</span>
            {activeTab === t.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C0263D]" />
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'chapters' && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base sm:text-lg font-bold text-[#F5F1F2]">
                Available Chapters
              </h2>
              <p className="text-xs text-[#A7A0AA]">
                Languages available: {manga.availableLanguages.map((l) => l.toUpperCase()).join(', ')}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {directChapters.length > 0 && externalChapters.length > 0 && (
                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#141116] border border-white/10">
                  <button
                    type="button"
                    onClick={() => setChapterSourceFilter('in_app')}
                    className={`min-h-[32px] px-3 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      chapterSourceFilter === 'in_app'
                        ? 'bg-[#C0263D] text-white'
                        : 'text-[#A7A0AA] hover:text-[#F5F1F2]'
                    }`}
                  >
                    Read In-App ({directChapters.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setChapterSourceFilter('external')}
                    className={`min-h-[32px] px-3 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      chapterSourceFilter === 'external'
                        ? 'bg-[#6D28D9] text-white'
                        : 'text-[#A7A0AA] hover:text-[#F5F1F2]'
                    }`}
                  >
                    Official Links ({externalChapters.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setChapterSourceFilter('all')}
                    className={`min-h-[32px] px-3 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      chapterSourceFilter === 'all'
                        ? 'bg-white/15 text-white'
                        : 'text-[#A7A0AA] hover:text-[#F5F1F2]'
                    }`}
                  >
                    All
                  </button>
                </div>
              )}

              {chapterLanguages.length > 1 && (
                <div className="flex items-center gap-1.5">
                  {chapterLanguages.map((lang) => (
                    <button
                      key={lang}
                      type="button"
                      onClick={() => setLangFilter(lang)}
                      className={`min-h-[34px] px-3 rounded-lg text-xs font-bold uppercase cursor-pointer border ${
                        langFilter === lang
                          ? 'bg-[#6D28D9] border-[#6D28D9] text-white'
                          : 'bg-[#141116] border-white/10 text-[#A7A0AA] hover:text-white'
                      }`}
                    >
                      {lang}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {filteredChapters.length === 0 ? (
            <div className="p-6 rounded-2xl bg-[#141116] border border-white/10 space-y-3">
              <p className="text-sm font-semibold text-[#F5F1F2]">
                No direct in-app chapters synced for this title
              </p>
              <p className="text-xs text-[#A7A0AA] leading-relaxed">
                This licensed series is distributed exclusively through official publisher platforms
                and has no open scanlation chapters available via MangaDex.
              </p>
              {manga.externalReaderUrl && (
                <a
                  href={manga.externalReaderUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[42px] px-4 rounded-xl bg-[#C0263D] text-white text-xs font-semibold items-center gap-2"
                >
                  <span>Open Official Publisher Reader</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              {filteredChapters.map((ch) => {
                const isExternalOnly = Boolean(ch.externalUrl);
                const formattedDate = ch.publishedAt
                  ? new Date(ch.publishedAt).toLocaleDateString()
                  : null;

                return (
                  <div
                    key={ch.id}
                    className="p-3.5 sm:p-4 rounded-2xl bg-[#141116] border border-white/[0.08] hover:border-white/20 flex flex-wrap items-center justify-between gap-3 transition-colors"
                  >
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-bold text-[#F5F1F2] font-mono-num">
                          {ch.volumeNumber ? `Vol. ${ch.volumeNumber} · ` : ''}Ch. {ch.chapterNumber}
                        </span>
                        {ch.title && (
                          <span className="text-xs sm:text-sm text-[#F5F1F2]/85 truncate">
                            {ch.title}
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-[#A7A0AA] font-mono-num">
                        {ch.scanlationGroup}
                        {formattedDate ? ` · ${formattedDate}` : ''}
                        {!isExternalOnly && ch.pageCount > 0 ? ` · ${ch.pageCount} pages` : ''}
                        {` · ${ch.qualityTier}`}
                      </p>
                    </div>

                    {isExternalOnly && ch.externalUrl ? (
                      <a
                        href={ch.externalUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="min-h-[38px] px-4 rounded-xl bg-[#09080B] border border-white/15 hover:border-[#C0263D] text-xs font-semibold text-[#F5F1F2] inline-flex items-center gap-1.5 shrink-0"
                      >
                        <span>Official Site</span>
                        <ExternalLink className="w-3.5 h-3.5 text-[#C0263D]" />
                      </a>
                    ) : ch.isAvailable ? (
                      <Link
                        to={`/inkverse/read/${manga.id}/${ch.id}`}
                        className="min-h-[38px] px-4 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 kage-press"
                      >
                        <BookOpen className="w-3.5 h-3.5" />
                        <span>Read</span>
                      </Link>
                    ) : (
                      <span className="text-xs text-[#A7A0AA] shrink-0">Unavailable</span>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === 'about' && (
        <section className="space-y-6">
          <div className="space-y-2">
            <h2 className="text-base sm:text-lg font-bold text-[#F5F1F2]">Synopsis</h2>
            <p className="text-sm text-[#A7A0AA] leading-relaxed whitespace-pre-line max-w-4xl">
              {manga.synopsis}
            </p>
          </div>

          {Array.isArray(manga.characters) && manga.characters.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-base font-bold text-[#F5F1F2]">Featured Characters</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                {manga.characters.map((ch, i) => (
                  <div
                    key={`${ch.name}-${i}`}
                    className="p-2.5 rounded-xl bg-[#141116] border border-white/8 flex items-center gap-3"
                  >
                    <div className="w-11 h-14 rounded-lg overflow-hidden bg-[#09080B] shrink-0">
                      <KageImage
                        strictArtwork
                        src={ch.imageUrl}
                        alt={ch.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-[#F5F1F2] truncate">{ch.name}</p>
                      <p className="text-[11px] text-[#A7A0AA] truncate">{ch.role || 'Character'}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {volumes.length > 0 && (
            <div className="space-y-3">
              <h3 className="text-base font-bold text-[#F5F1F2] flex items-center gap-2">
                <Layers className="w-4 h-4 text-[#6D28D9]" />
                <span>Synced Volumes ({volumes.length})</span>
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-2.5">
                {volumes.map((v) => (
                  <div
                    key={v.id}
                    className="p-3 rounded-xl bg-[#141116] border border-white/8 space-y-0.5"
                  >
                    <p className="text-xs font-bold text-[#F5F1F2]">{v.title}</p>
                    <p className="text-[11px] text-[#A7A0AA] font-mono-num">
                      {v.chapterCount} {v.chapterCount === 1 ? 'chapter' : 'chapters'}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      )}

      {activeTab === 'related_anime' && (
        <section className="space-y-3">
          <h2 className="text-base sm:text-lg font-bold text-[#F5F1F2]">
            Connected Anime Adaptations
          </h2>
          {relatedAnime.length === 0 ? (
            <p className="text-xs text-[#A7A0AA] p-5 rounded-2xl bg-[#141116] border border-white/10">
              No verified anime adaptation relationships recorded for this manga.
            </p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {relatedAnime.map((rel: any, idx: number) => (
                <Link
                  key={`${rel.animeCanonicalId}-${idx}`}
                  to={`/anime/${rel.animeCanonicalId}`}
                  className="p-4 rounded-2xl bg-[#141116] border border-white/10 hover:border-[#6D28D9] flex items-start gap-4 transition-colors"
                >
                  <div className="w-16 aspect-[2/3] rounded-xl overflow-hidden bg-[#09080B] shrink-0">
                    <KageImage
                      strictArtwork
                      src={rel.imageUrl || manga.coverImageUrl}
                      alt={rel.animeTitle}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-[#6D28D9]">
                      {rel.relationLabel}
                    </p>
                    <p className="text-sm font-bold text-[#F5F1F2] line-clamp-1">
                      {rel.animeTitle}
                    </p>
                    {rel.continuationNote && (
                      <p className="text-xs text-[#A7A0AA] leading-relaxed">
                        {rel.continuationNote}
                      </p>
                    )}
                    <p className="text-xs font-semibold text-[#C0263D] inline-flex items-center gap-1 pt-0.5">
                      <Film className="w-3.5 h-3.5" />
                      <span>Open Anime in Realms →</span>
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'related_manga' && (
        <section className="space-y-4">
          <h2 className="text-base sm:text-lg font-bold text-[#F5F1F2]">
            Recommended &amp; Related Manga
          </h2>
          {relatedManga.length === 0 ? (
            <p className="text-xs text-[#A7A0AA]">No related manga titles available right now.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3.5 sm:gap-4">
              {relatedManga.slice(0, 5).map((item) => (
                <MangaPosterCard key={item.id} manga={item} />
              ))}
            </div>
          )}
        </section>
      )}

      {activeTab === 'reviews' && (
        <section className="space-y-4">
          <div>
            <h2 className="text-base sm:text-lg font-bold text-[#F5F1F2]">
              Reader Reviews ({kageReviewCount})
            </h2>
            <p className="text-xs text-[#A7A0AA]">
              Written by KAGE readers · Tracked separately from {manga.scoreSource} editorial scores
            </p>
          </div>

          <form
            onSubmit={handleSubmitReview}
            className="p-4 rounded-2xl bg-[#141116] border border-white/10 space-y-3"
          >
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={revTitle}
                onChange={(e) => setRevTitle(e.target.value)}
                placeholder={`Review headline for ${manga.title}...`}
                className="flex-1 min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
              />
              <select
                aria-label="Manga review rating"
                value={revRating}
                onChange={(e) => setRevRating(Number(e.target.value))}
                className="min-h-[42px] px-3 rounded-xl bg-[#09080B] border border-white/12 text-xs text-[#F5F1F2]"
              >
                <option value={0}>Optional Score</option>
                {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((r) => (
                  <option key={r} value={r}>
                    {r}/10
                  </option>
                ))}
              </select>
            </div>

            <textarea
              rows={3}
              value={revBody}
              onChange={(e) => setRevBody(e.target.value)}
              placeholder="Share your critique of the paneling, artwork, story pacing, or arcs..."
              className="w-full rounded-xl bg-[#09080B] border border-white/12 p-3 text-xs text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
            />

            {revError && <p className="text-xs text-rose-400">{revError}</p>}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-xs text-[#A7A0AA] cursor-pointer">
                <input
                  type="checkbox"
                  checked={revSpoilers}
                  onChange={(e) => setRevSpoilers(e.target.checked)}
                  className="accent-[#C0263D] w-4 h-4"
                />
                <span>Contains plot spoilers</span>
              </label>

              <button
                type="submit"
                disabled={submittingRev}
                className="min-h-[40px] px-5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
              >
                {submittingRev ? 'Publishing...' : 'Publish Review'}
              </button>
            </div>
          </form>

          {reviews.length === 0 ? (
            <p className="text-xs text-[#A7A0AA] p-4 rounded-2xl bg-[#141116] border border-white/8">
              No reviews written for {manga.title} yet. Be the first hunter to review it!
            </p>
          ) : (
            <div className="space-y-3">
              {reviews.map((rev: any) => {
                const hiddenBySpoiler = rev.containsSpoilers && !revealedSpoilers[rev.id];
                const isMine = user?.uid === rev.authorUid;
                return (
                  <div
                    key={rev.id}
                    className="p-4 rounded-2xl bg-[#141116] border border-white/8 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        to={`/profile/${rev.author?.username}`}
                        className="flex items-center gap-2 min-w-0"
                      >
                        <div className="w-7 h-7 rounded-full overflow-hidden bg-[#09080B] shrink-0">
                          <KageImage
                            src={rev.author?.avatarUrl}
                            alt={rev.author?.displayName || 'Reader'}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <span className="text-xs font-semibold text-[#F5F1F2] truncate">
                          @{rev.author?.username}
                        </span>
                        <OwnerBadge role={rev.author?.role} size="xs" />
                      </Link>

                      <div className="flex items-center gap-2.5 text-xs font-mono-num">
                        {rev.rating && (
                          <span className="inline-flex items-center gap-1 text-amber-400">
                            <Star className="w-3 h-3 fill-amber-400" />
                            <span>{rev.rating}/10</span>
                          </span>
                        )}
                        {isMine && (
                          <button
                            type="button"
                            onClick={() => handleDeleteReview(rev.id)}
                            aria-label="Delete your review"
                            className="text-[#A7A0AA] hover:text-rose-400 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>

                    <p className="text-sm font-semibold text-[#F5F1F2]">{rev.title}</p>

                    {hiddenBySpoiler ? (
                      <button
                        type="button"
                        onClick={() =>
                          setRevealedSpoilers((prev) => ({ ...prev, [rev.id]: true }))
                        }
                        className="min-h-[36px] px-3 rounded-lg bg-[#09080B] border border-white/10 text-xs text-[#A7A0AA] hover:text-[#F5F1F2] inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Eye className="w-3.5 h-3.5 text-[#C0263D]" />
                        <span>Spoiler warning · Click to reveal review</span>
                      </button>
                    ) : (
                      <p className="text-xs sm:text-sm text-[#A7A0AA] whitespace-pre-line leading-relaxed">
                        {rev.content}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {reportOpen && (
        <ReportModal
          isOpen={reportOpen}
          onClose={() => setReportOpen(false)}
          targetType="manga"
          targetId={manga.id}
          targetLabel={manga.title}
        />
      )}
    </div>
  );
};
