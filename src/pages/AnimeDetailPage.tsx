import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookmarkCheck,
  BookOpen,
  Check,
  ExternalLink,
  Eye,
  Film,
  Heart,
  MessageSquare,
  Play,
  Send,
  Share2,
  Star,
  Trash2,
  Tv,
  Users,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { slugifyRealm } from '../lib/genres';
import { useAuth } from '../context/AuthContext';
import { KageImage } from '../components/KageImage';
import { OwnerBadge } from '../components/KageBrand';
import {
  HorizontalAnimeCarousel,
  StreamingModal,
  type RealmsAnimeItem,
} from '../components/RealmsComponents';

const WATCH_STATUSES = [
  { value: 'plan_to_watch', label: 'Watchlist' },
  { value: 'watching', label: 'Watching' },
  { value: 'completed', label: 'Watched' },
  { value: 'favorited', label: 'Favorite' },
  { value: 'dropped', label: 'Dropped' },
];

export const AnimeDetailPage: React.FC = () => {
  const { malId } = useParams();
  const navigate = useNavigate();
  const { user, bumpTasteRevision } = useAuth();

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedEpisode, setSelectedEpisode] = useState<number | null>(null);
  const [streamingModalOpen, setStreamingModalOpen] = useState(false);
  const [showTrailerEmbed, setShowTrailerEmbed] = useState(false);
  const [copiedShare, setCopiedShare] = useState(false);

  // Watchlist & personal rating state
  const [trackStatus, setTrackStatus] = useState<string>('');
  const [trackScore, setTrackScore] = useState<number>(0);
  const [hoverScore, setHoverScore] = useState<number | null>(null);
  const [savingTrack, setSavingTrack] = useState(false);
  const trailerSectionRef = React.useRef<HTMLElement | null>(null);

  // KAGE Anime Review composer
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewBody, setReviewBody] = useState('');
  const [reviewRating, setReviewRating] = useState<number>(0);
  const [reviewSpoilers, setReviewSpoilers] = useState(false);
  const [submittingReview, setSubmittingReview] = useState(false);
  const [reviewError, setReviewError] = useState('');
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<number, boolean>>({});

  // Anime-specific Pulse discussion composer
  const [discTitle, setDiscTitle] = useState('');
  const [discContent, setDiscContent] = useState('');
  const [postingDisc, setPostingDisc] = useState(false);

  const loadDetail = useCallback(async () => {
    if (!malId) return;
    setLoading(true);
    setError('');
    setShowTrailerEmbed(false);
    setSelectedEpisode(null);
    try {
      const res = await apiFetch(`/api/anime/${encodeURIComponent(malId)}`);
      setData(res);
      if (res.viewerEntry) {
        setTrackStatus(res.viewerEntry.status || '');
        setTrackScore(res.viewerEntry.score || 0);
      } else {
        setTrackStatus('');
        setTrackScore(0);
      }
    } catch (err: any) {
      setError(err.message || 'Could not load anime details.');
    } finally {
      setLoading(false);
    }
  }, [malId]);

  useEffect(() => {
    loadDetail();
  }, [loadDetail]);

  const handleSaveTracking = async (newStatus: string, newScore?: number) => {
    if (!user) {
      navigate('/auth/login');
      return;
    }
    if (!data?.anime) return;

    const statusToSave = newStatus || trackStatus || 'plan_to_watch';
    const scoreToSave = newScore !== undefined ? newScore : trackScore || null;

    setTrackStatus(statusToSave);
    if (newScore !== undefined) setTrackScore(newScore);
    setSavingTrack(true);
    try {
      await apiFetch('/api/me/anime', {
        method: 'POST',
        body: JSON.stringify({
          animeMalId: data.anime.malId,
          animeTitle: data.anime.title,
          animeImageUrl: data.anime.imageUrl,
          genres: data.anime.genres || [],
          status: statusToSave,
          score: scoreToSave,
        }),
      });
      bumpTasteRevision();
    } catch (err) {
      console.error('Failed to update tracking:', err);
    } finally {
      setSavingTrack(false);
    }
  };

  const handleRemoveTracking = async () => {
    if (!user || !data?.anime) return;
    setSavingTrack(true);
    try {
      await apiFetch(`/api/me/anime/${data.anime.malId}`, { method: 'DELETE' });
      setTrackStatus('');
      setTrackScore(0);
      bumpTasteRevision();
    } catch (err) {
      console.error('Failed to remove tracking:', err);
    } finally {
      setSavingTrack(false);
    }
  };

  const handleShareAnime = async () => {
    try {
      const shareUrl = window.location.href;
      if (navigator.share) {
        await navigator.share({
          title: `${data?.anime?.title || 'Anime'} on KAGE`,
          url: shareUrl,
        });
      } else if (navigator.clipboard) {
        await navigator.clipboard.writeText(shareUrl);
        setCopiedShare(true);
        setTimeout(() => setCopiedShare(false), 2200);
      }
    } catch {
      // User cancelled native share sheet or clipboard restricted
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate('/auth/login');
      return;
    }
    if (!data?.anime) return;
    setReviewError('');
    if (reviewBody.trim().length < 10) {
      setReviewError('Write at least 10 characters for your review.');
      return;
    }

    setSubmittingReview(true);
    try {
      await apiFetch(`/api/anime/${data.anime.malId}/reviews`, {
        method: 'POST',
        body: JSON.stringify({
          animeTitle: data.anime.title,
          animeImageUrl: data.anime.imageUrl,
          title: reviewTitle.trim() || `${data.anime.title} Review`,
          content: reviewBody.trim(),
          rating: reviewRating > 0 ? reviewRating : null,
          containsSpoilers: reviewSpoilers,
        }),
      });
      setReviewTitle('');
      setReviewBody('');
      setReviewRating(0);
      setReviewSpoilers(false);
      await loadDetail();
    } catch (err: any) {
      setReviewError(err.message || 'Could not publish review.');
    } finally {
      setSubmittingReview(false);
    }
  };

  const handleDeleteReview = async (reviewId: number) => {
    try {
      await apiFetch(`/api/reviews/${reviewId}`, { method: 'DELETE' });
      await loadDetail();
    } catch {
      // ignore
    }
  };

  const handlePostDiscussion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate('/auth/login');
      return;
    }
    if (!discTitle.trim() && !discContent.trim()) return;
    setPostingDisc(true);
    try {
      await apiFetch('/api/discussions', {
        method: 'POST',
        body: JSON.stringify({
          animeMalId: data.anime.malId,
          animeTitle: data.anime.title,
          genreTags: data.anime.genres || [],
          kind: 'discussion',
          title: discTitle.trim() || `Thoughts on ${data.anime.title}`,
          content: discContent.trim(),
        }),
      });
      setDiscTitle('');
      setDiscContent('');
      bumpTasteRevision();
      await loadDetail();
    } catch (err) {
      console.error('Failed to post anime discussion:', err);
    } finally {
      setPostingDisc(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6" aria-busy="true">
        <div className="h-72 sm:h-96 rounded-3xl bg-[#141116] animate-pulse border border-white/8" />
        <div className="h-28 rounded-2xl bg-[#141116] animate-pulse border border-white/8" />
        <div className="h-40 rounded-2xl bg-[#141116] animate-pulse border border-white/8" />
      </div>
    );
  }

  if (error || !data?.anime) {
    return (
      <div className="p-8 sm:p-12 rounded-2xl bg-[#141116] border border-white/10 text-center space-y-4 my-4">
        <p className="text-sm font-medium text-[#F5F1F2]">{error || 'Anime not found.'}</p>
        <p className="text-xs text-[#A7A0AA]">
          This anime ID could not be resolved from our catalog providers.
        </p>
        <Link
          to="/"
          className="inline-flex min-h-[44px] px-5 items-center rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-semibold"
        >
          Back to Realms
        </Link>
      </div>
    );
  }

  const {
    anime,
    characters = [],
    staff = [],
    episodes = [],
    related = [],
    discussions = [],
    guilds = [],
    reviews = [],
    mangaRelations = [],
    kageReviewCount = 0,
    kageAverageScore = null,
  } = data;

  const activeEp = episodes.find((e: any) => e.number === selectedEpisode);
  const verifiedStreaming: any[] =
    anime.streamingAvailability?.verifiedOptions || anime.streaming || [];
  const platformMentions: string[] = anime.streamingAvailability?.platformMentions || [];

  const alternateTitles = Array.from(
    new Set(
      [
        anime.romajiTitle && anime.romajiTitle !== anime.title ? anime.romajiTitle : null,
        anime.nativeTitle || null,
        ...(Array.isArray(anime.synonyms) ? anime.synonyms.slice(0, 3) : []),
      ].filter(Boolean)
    )
  ) as string[];

  return (
    <div className="space-y-7">
      {/* 1. Cinematic Hero Banner + Poster Lockup */}
      <div className="relative rounded-3xl overflow-hidden bg-[#141116] border border-white/10 min-h-[300px] sm:min-h-[400px] flex flex-col justify-between">
        <KageImage
          strictArtwork
          priority
          src={anime.bannerUrl || anime.imageUrl}
          alt={anime.title}
          fallbackLabel={anime.title}
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-[#09080B] via-[#09080B]/70 to-black/35" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#09080B]/85 via-[#09080B]/35 to-transparent" />

        {/* Top Action Bar */}
        <div className="relative z-10 p-4 sm:p-5 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="min-h-[44px] min-w-[44px] rounded-full bg-[#09080B]/75 backdrop-blur-md border border-white/15 flex items-center justify-center text-[#F5F1F2] hover:bg-[#09080B] cursor-pointer"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={handleShareAnime}
            className="min-h-[40px] px-3.5 rounded-full bg-[#09080B]/75 backdrop-blur-md border border-white/15 text-xs font-medium text-[#F5F1F2] hover:bg-[#09080B] inline-flex items-center gap-1.5 cursor-pointer"
          >
            {copiedShare ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400" />
                <span>Link Copied</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5" />
                <span>Share</span>
              </>
            )}
          </button>
        </div>

        {/* Bottom Poster + Verified Metadata */}
        <div className="relative z-10 p-5 sm:p-8 flex flex-col sm:flex-row sm:items-end justify-between gap-5">
          <div className="flex items-end gap-4 sm:gap-5 min-w-0">
            <div className="hidden sm:block w-28 md:w-32 aspect-[2/3] rounded-xl overflow-hidden border border-white/15 bg-[#09080B] shrink-0 shadow-xl">
              <KageImage
                strictArtwork
                src={anime.imageUrl}
                alt={anime.title}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="space-y-1.5 min-w-0">
              <h1 className="text-2xl sm:text-4xl font-bold text-[#F5F1F2] tracking-tight text-balance">
                {anime.title}{' '}
                {anime.year ? (
                  <span className="font-normal text-[#F5F1F2]/75">({anime.year})</span>
                ) : null}
              </h1>

              {alternateTitles.length > 0 && (
                <p className="text-xs text-[#A7A0AA] line-clamp-1">
                  {alternateTitles.join(' · ')}
                </p>
              )}

              {/* Unboxed Metadata Line (Format, Episodes, Duration, Status, Dates) */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs sm:text-sm text-[#A7A0AA] font-mono-num pt-0.5">
                {(anime.formatLabel || anime.seasonsLabel) && (
                  <span className="text-[#F5F1F2]">
                    {anime.formatLabel || anime.seasonsLabel}
                  </span>
                )}
                {anime.durationMins && anime.format !== 'Movie' && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{anime.durationMins} min/ep</span>
                  </>
                )}
                {anime.status && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>{anime.status}</span>
                  </>
                )}
                {anime.startDate && (
                  <>
                    <span aria-hidden="true">·</span>
                    <span>
                      Aired {anime.startDate}
                      {anime.endDate && anime.endDate !== anime.startDate
                        ? ` to ${anime.endDate}`
                        : ''}
                    </span>
                  </>
                )}
              </div>

              {/* Distinct Provider Rating vs KAGE Community Rating */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs font-mono-num pt-0.5">
                {typeof anime.score === 'number' && anime.score > 0 && (
                  <span className="inline-flex items-center gap-1 text-[#F5F1F2]">
                    <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span className="font-semibold">{anime.score.toFixed(1)}/10</span>
                    <span className="text-[#A7A0AA]">
                      ({anime.scoreSource || 'AniList'})
                    </span>
                  </span>
                )}
                <span className="text-[#A7A0AA]">
                  {kageAverageScore !== null
                    ? `· KAGE Hunters: ${kageAverageScore}/10 (${kageReviewCount} ${
                        kageReviewCount === 1 ? 'review' : 'reviews'
                      })`
                    : kageReviewCount > 0
                      ? `· ${kageReviewCount} KAGE ${kageReviewCount === 1 ? 'review' : 'reviews'}`
                      : '· No KAGE ratings yet'}
                </span>
              </div>

              {/* Studios & Interactive Genre Links */}
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#A7A0AA] pt-0.5">
                {Array.isArray(anime.genres) &&
                  anime.genres.map((g: string, idx: number) => (
                    <React.Fragment key={g}>
                      {idx > 0 && <span aria-hidden="true">·</span>}
                      <Link
                        to={`/realms/genre/${slugifyRealm(g)}`}
                        className="text-[#F5F1F2] hover:text-[#C0263D] underline-offset-4 hover:underline transition-colors"
                      >
                        {g}
                      </Link>
                    </React.Fragment>
                  ))}
                {anime.studios?.length > 0 && (
                  <>
                    <span aria-hidden="true">/</span>
                    <span>Studio: {anime.studios.join(', ')}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Primary Hero CTA */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setStreamingModalOpen(true)}
              className="min-h-[44px] px-5 py-2.5 rounded-full bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 shadow-lg kage-press whitespace-nowrap cursor-pointer"
            >
              <Play className="w-3.5 h-3.5 fill-white" />
              <span>{verifiedStreaming.length > 0 ? 'Watch Now' : 'Where to Watch'}</span>
            </button>

            {Array.isArray(mangaRelations) && mangaRelations.length > 0 && (
              <Link
                to={`/inkverse/manga/${mangaRelations[0].manga.id}`}
                className="min-h-[44px] px-4 py-2.5 rounded-full bg-[#6D28D9] hover:bg-[#7c3aed] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 shadow-lg kage-press whitespace-nowrap"
              >
                <BookOpen className="w-4 h-4" />
                <span>Read Manga</span>
              </Link>
            )}

            {anime.trailerEmbedUrl ? (
              <button
                type="button"
                onClick={() => {
                  setShowTrailerEmbed(true);
                  window.setTimeout(() => {
                    trailerSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }, 60);
                }}
                className="min-h-[44px] px-4 py-2.5 rounded-full bg-[#09080B]/80 hover:bg-[#141116] border border-white/15 text-[#F5F1F2] text-xs font-semibold inline-flex items-center gap-1.5 kage-press whitespace-nowrap cursor-pointer"
              >
                <Film className="w-4 h-4 text-[#6D28D9]" />
                <span>Trailer</span>
              </button>
            ) : anime.trailerUrl ? (
              <a
                href={anime.trailerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[44px] px-4 py-2.5 rounded-full bg-[#09080B]/80 hover:bg-[#141116] border border-white/15 text-[#F5F1F2] text-xs font-semibold inline-flex items-center gap-1.5 kage-press whitespace-nowrap"
              >
                <Film className="w-4 h-4 text-[#6D28D9]" />
                <span>Trailer</span>
              </a>
            ) : null}

            <button
              type="button"
              onClick={() =>
                handleSaveTracking(
                  trackStatus === 'favorited' ? 'plan_to_watch' : 'favorited'
                )
              }
              className={`min-h-[44px] min-w-[44px] px-3.5 rounded-full border text-xs font-semibold inline-flex items-center justify-center gap-1.5 kage-press cursor-pointer ${
                trackStatus === 'favorited'
                  ? 'bg-[#C0263D]/20 border-[#C0263D] text-rose-300'
                  : 'bg-[#09080B]/80 border-white/15 text-[#F5F1F2] hover:border-white/30'
              }`}
              aria-label="Favorite anime"
            >
              <Heart
                className={`w-4 h-4 ${
                  trackStatus === 'favorited' ? 'fill-[#C0263D] text-[#C0263D] kage-heart-pop' : ''
                }`}
              />
              <span className="hidden sm:inline">
                {trackStatus === 'favorited' ? 'Favorited' : 'Favorite'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* 2. Personal Watchlist, Status & Score Controls */}
      <div className="p-4 sm:p-5 rounded-2xl bg-[#141116] border border-white/10 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#F5F1F2]">
              <BookmarkCheck className="w-4 h-4 text-[#C0263D]" />
              <span>Your KAGE Watchlist &amp; Status</span>
              {savingTrack && <span className="text-[#A7A0AA] font-normal">(Saving...)</span>}
            </div>
            {trackStatus && (
              <button
                type="button"
                onClick={handleRemoveTracking}
                className="text-[11px] font-medium text-[#A7A0AA] hover:text-rose-400 inline-flex items-center gap-1 cursor-pointer"
              >
                <Trash2 className="w-3 h-3" />
                <span>Remove</span>
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-1.5">
            {WATCH_STATUSES.map((st) => (
              <button
                key={st.value}
                type="button"
                onClick={() => handleSaveTracking(st.value)}
                className={`min-h-[38px] px-3.5 rounded-lg text-xs font-medium kage-press whitespace-nowrap cursor-pointer ${
                  trackStatus === st.value
                    ? 'bg-[#C0263D] text-white font-semibold'
                    : 'bg-[#09080B] border border-white/10 text-[#A7A0AA] hover:text-[#F5F1F2]'
                }`}
              >
                {st.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-[#F5F1F2] flex items-center gap-1.5">
            <Star className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
            <span>
              Your Personal Score{' '}
              {(hoverScore ?? trackScore) ? `(${hoverScore ?? trackScore}/10)` : ''}
            </span>
          </p>
          <div
            className="flex flex-wrap items-center gap-1"
            onMouseLeave={() => setHoverScore(null)}
          >
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((scoreVal) => {
              const activeVal = hoverScore ?? trackScore;
              const isSelected = trackScore === scoreVal;
              const isHighlighted = activeVal >= scoreVal && activeVal > 0;
              return (
                <button
                  key={scoreVal}
                  type="button"
                  onMouseEnter={() => setHoverScore(scoreVal)}
                  onClick={() => handleSaveTracking(trackStatus || 'completed', scoreVal)}
                  className={`min-h-[36px] min-w-[32px] sm:min-w-[36px] rounded-lg text-xs font-mono-num kage-press cursor-pointer ${
                    isSelected
                      ? 'bg-[#6D28D9] text-white font-bold border border-[#6D28D9]'
                      : isHighlighted
                        ? 'bg-[#6D28D9]/25 border border-[#6D28D9]/55 text-[#F5F1F2]'
                        : 'bg-[#09080B] border border-white/10 text-[#A7A0AA] hover:text-white'
                  }`}
                >
                  {scoreVal}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Synopsis & Non-Spoiler Story Themes */}
      <section className="space-y-3">
        <h2 className="text-base font-bold text-[#F5F1F2]">Synopsis</h2>
        <p className="text-sm text-[#A7A0AA] leading-relaxed max-w-4xl whitespace-pre-line">
          {anime.synopsis}
        </p>

        {Array.isArray(anime.tags) && anime.tags.length > 0 && (
          <div className="pt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#A7A0AA]">
            <span className="text-[#F5F1F2] font-medium">Story Themes:</span>
            {anime.tags.slice(0, 10).map((t: { name: string; rank: number }, idx: number) => (
              <React.Fragment key={t.name}>
                {idx > 0 && <span aria-hidden="true">·</span>}
                <span>{t.name}</span>
              </React.Fragment>
            ))}
          </div>
        )}
      </section>

      {/* 3B. Verified Anime-to-Manga Source & Continuation Links (INKVERSE) */}
      {Array.isArray(mangaRelations) && mangaRelations.length > 0 && (
        <section className="p-4 sm:p-5 rounded-2xl bg-[#141116] border border-[#C0263D]/30 space-y-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-[#C0263D]" />
              <h2 className="text-sm sm:text-base font-bold text-[#F5F1F2]">
                Manga &amp; Source Material in INKVERSE
              </h2>
            </div>
            <Link
              to="/inkverse"
              className="text-xs font-semibold text-[#C0263D] hover:text-rose-400"
            >
              Open INKVERSE →
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {mangaRelations.map((rel: any, idx: number) => (
              <Link
                key={`${rel.manga?.id}-${idx}`}
                to={`/inkverse/manga/${rel.manga?.id}`}
                className="p-3.5 rounded-xl bg-[#09080B] border border-white/10 hover:border-[#C0263D]/60 flex items-start gap-3.5 transition-colors"
              >
                <div className="w-16 aspect-[2/3] rounded-lg overflow-hidden bg-[#141116] shrink-0">
                  <KageImage
                    strictArtwork
                    src={rel.manga?.coverImageUrl}
                    alt={rel.manga?.title || 'Manga'}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#C0263D]">
                    {rel.relationLabel}
                  </p>
                  <p className="text-sm font-bold text-[#F5F1F2] line-clamp-1">
                    {rel.manga?.title}
                  </p>
                  <p className="text-[11px] text-[#A7A0AA] font-mono-num">
                    {rel.manga?.format}
                    {rel.manga?.chaptersCount ? ` · ${rel.manga.chaptersCount} chapters` : ''}
                    {rel.manga?.score ? ` · ★ ${rel.manga.score.toFixed(1)}` : ''}
                  </p>
                  {rel.continuationNote && (
                    <p className="text-xs text-[#A7A0AA] leading-relaxed">
                      {rel.continuationNote}
                    </p>
                  )}
                  <p className="text-xs font-semibold text-[#F5F1F2] inline-flex items-center gap-1 pt-0.5">
                    <span>Read in INKVERSE →</span>
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      {/* 4. Honest Official Streaming & Official Trailer Section (Part 12) */}
      <section
        ref={trailerSectionRef}
        className="p-4 sm:p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-3.5"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Tv className="w-4 h-4 text-[#C0263D]" />
            <h2 className="text-sm sm:text-base font-bold text-[#F5F1F2]">
              Where to Watch Officially
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {anime.trailerEmbedUrl ? (
              <button
                type="button"
                onClick={() => setShowTrailerEmbed((v) => !v)}
                className="min-h-[36px] px-3 rounded-lg bg-[#09080B] border border-white/12 text-xs font-semibold text-[#F5F1F2] hover:border-[#6D28D9] inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Film className="w-3.5 h-3.5 text-[#6D28D9]" />
                <span>{showTrailerEmbed ? 'Hide Official Trailer' : 'Official Trailer'}</span>
              </button>
            ) : anime.trailerUrl ? (
              <a
                href={anime.trailerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="min-h-[36px] px-3 rounded-lg bg-[#09080B] border border-white/12 text-xs font-semibold text-[#F5F1F2] hover:border-[#6D28D9] inline-flex items-center gap-1.5"
              >
                <Film className="w-3.5 h-3.5 text-[#6D28D9]" />
                <span>Official Trailer</span>
                <ExternalLink className="w-3 h-3 text-[#A7A0AA]" />
              </a>
            ) : null}
            {anime.providerUrl && (
              <a
                href={anime.providerUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-[#A7A0AA] hover:text-[#F5F1F2] inline-flex items-center gap-1"
              >
                <span>Source Metadata</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            )}
          </div>
        </div>

        {verifiedStreaming.length > 0 ? (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2.5">
              {verifiedStreaming.map((platform: any) => (
                <a
                  key={`${platform.name}-${platform.url}`}
                  href={platform.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-4 rounded-xl bg-[#09080B] hover:bg-[#1C1720] border border-white/12 hover:border-[#C0263D]/60 text-xs font-semibold text-[#F5F1F2] inline-flex items-center gap-2 transition-colors"
                >
                  <span>Watch on {platform.name}</span>
                  <ExternalLink className="w-3.5 h-3.5 text-[#C0263D]" />
                </a>
              ))}
            </div>
            <p className="text-[11px] text-[#A7A0AA]">
              External licensed links. Regional availability and subscription requirements vary by country.
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            <p className="text-xs text-[#A7A0AA]">
              {platformMentions.length > 0
                ? `Upstream metadata mentions ${platformMentions.join(', ')}, but no verified title-specific regional link was returned.`
                : 'Verified regional streaming links were not returned by the metadata provider for this title. Check licensed distributors such as Crunchyroll, Netflix, or HIDIVE in your region.'}
            </p>
          </div>
        )}

        {showTrailerEmbed && anime.trailerEmbedUrl && (
          <div className="pt-2">
            <div className="aspect-video w-full max-w-2xl rounded-xl overflow-hidden bg-black border border-white/10">
              <iframe
                src={anime.trailerEmbedUrl}
                title={`${anime.title} Official Trailer`}
                className="w-full h-full"
                allow="accelerometer; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        )}
      </section>

      {/* 5. Verified Episode Guide */}
      {(episodes.length > 0 || anime.episodes) && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#F5F1F2]">
              Episodes{' '}
              <span className="font-mono-num text-sm font-normal text-[#A7A0AA]">
                ({episodes.length || anime.episodes})
              </span>
            </h2>
          </div>

          {episodes.length > 0 ? (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {episodes.map((ep: any) => (
                  <button
                    key={ep.number}
                    type="button"
                    onClick={() => setSelectedEpisode(ep.number)}
                    className={`min-h-[38px] px-2.5 rounded-lg text-xs font-mono-num transition-colors truncate cursor-pointer border ${
                      selectedEpisode === ep.number
                        ? 'bg-[#C0263D] border-[#C0263D] text-white font-semibold'
                        : 'bg-[#141116] border-white/10 text-[#F5F1F2] hover:border-white/25'
                    }`}
                  >
                    Ep {ep.number}
                  </button>
                ))}
              </div>
              {activeEp && (
                <div className="p-3.5 rounded-xl bg-[#141116] border border-white/10 text-xs flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <span className="font-semibold text-[#F5F1F2]">
                      Episode {activeEp.number}: {activeEp.title}
                    </span>
                    {activeEp.aired && (
                      <span className="text-[#A7A0AA] ml-2">· Aired {activeEp.aired}</span>
                    )}
                  </div>
                  <span className="text-[#A7A0AA]">
                    Stream via verified official platforms above
                  </span>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-[#A7A0AA]">
              Total verified episodes:{' '}
              <span className="font-mono-num text-[#F5F1F2]">{anime.episodes}</span>. Individual
              episode titles are not yet listed by the upstream database.
            </p>
          )}
        </section>
      )}

      {/* 6. Characters & Voice Cast */}
      {characters.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-base font-bold text-[#F5F1F2]">Characters & Voice Cast</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
            {characters.slice(0, 10).map((ch: any) => (
              <div
                key={ch.id || ch.name}
                className="p-2.5 rounded-xl bg-[#141116] border border-white/8 flex items-center gap-2.5"
              >
                <div className="w-11 h-14 rounded-lg overflow-hidden shrink-0 bg-[#09080B]">
                  <KageImage
                    strictArtwork
                    src={ch.imageUrl}
                    alt={ch.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#F5F1F2] truncate">{ch.name}</p>
                  <p className="text-[11px] text-[#A7A0AA] truncate">{ch.role}</p>
                  {ch.voiceActor && (
                    <p className="text-[10px] text-[#A7A0AA]/80 truncate">VA: {ch.voiceActor}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {staff.length > 0 && (
        <section className="space-y-2.5">
          <h2 className="text-base font-bold text-[#F5F1F2]">Key Staff</h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
            {staff.map((person: any) => (
              <div
                key={person.id || person.name}
                className="p-2.5 rounded-xl bg-[#141116] border border-white/8 flex items-center gap-2.5"
              >
                <div className="w-10 h-10 rounded-full overflow-hidden shrink-0 bg-[#09080B]">
                  <KageImage
                    strictArtwork
                    src={person.imageUrl}
                    alt={person.name}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-[#F5F1F2] truncate">{person.name}</p>
                  <p className="text-[11px] text-[#A7A0AA] truncate">
                    {Array.isArray(person.positions) ? person.positions.join(', ') : ''}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* 7. KAGE Community Anime Reviews (Distinct from Upstream Provider Score) */}
      <section className="space-y-4 pt-2 border-t border-white/8">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-bold text-[#F5F1F2]">
              KAGE Hunter Reviews ({kageReviewCount})
            </h2>
            <p className="text-xs text-[#A7A0AA]">
              Written by authenticated KAGE members · Tracked separately from {anime.scoreSource || 'AniList'} scores
            </p>
          </div>
        </div>

        <form
          onSubmit={handleSubmitReview}
          className="p-4 rounded-2xl bg-[#141116] border border-white/10 space-y-3"
        >
          <div className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={reviewTitle}
              onChange={(e) => setReviewTitle(e.target.value)}
              placeholder={`Headline for your ${anime.title} review...`}
              className="flex-1 min-h-[40px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
            />
            <select
              aria-label="Review score"
              value={reviewRating}
              onChange={(e) => setReviewRating(Number(e.target.value))}
              className="min-h-[40px] px-3 rounded-xl bg-[#09080B] border border-white/10 text-xs text-[#F5F1F2]"
            >
              <option value={0}>Optional Rating (No score)</option>
              {[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((r) => (
                <option key={r} value={r}>
                  {r}/10
                </option>
              ))}
            </select>
          </div>

          <textarea
            rows={3}
            value={reviewBody}
            onChange={(e) => setReviewBody(e.target.value)}
            placeholder="Write a thoughtful review of animation, story arcs, soundtrack, or characters..."
            className="w-full rounded-xl bg-[#09080B] border border-white/10 p-3 text-xs text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
          />

          {reviewError && <p className="text-xs text-rose-400">{reviewError}</p>}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-[#A7A0AA] cursor-pointer">
              <input
                type="checkbox"
                checked={reviewSpoilers}
                onChange={(e) => setReviewSpoilers(e.target.checked)}
                className="accent-[#C0263D] w-4 h-4"
              />
              <span>Contains plot spoilers</span>
            </label>

            <button
              type="submit"
              disabled={submittingReview}
              className="min-h-[40px] px-4 rounded-xl bg-[#6D28D9] hover:bg-[#7c3aed] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              {submittingReview ? 'Publishing...' : 'Publish Review'}
            </button>
          </div>
        </form>

        {reviews.length === 0 ? (
          <p className="text-xs text-[#A7A0AA] p-4 rounded-xl bg-[#141116] border border-white/8">
            No KAGE reviews written for {anime.title} yet. Be the first to review it!
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
                          alt={rev.author?.displayName || 'Hunter'}
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
                          className="text-[#A7A0AA] hover:text-rose-400 cursor-pointer"
                          aria-label="Delete your review"
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

      {/* 8. Related Guilds & Anime Community Discussions */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 pt-2 border-t border-white/8">
        <section className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[#F5F1F2] flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-[#C0263D]" />
              <span>Community Discussions ({discussions.length})</span>
            </h2>
          </div>

          <form
            onSubmit={handlePostDiscussion}
            className="p-4 rounded-2xl bg-[#141116] border border-white/10 space-y-2.5"
          >
            <input
              type="text"
              value={discTitle}
              onChange={(e) => setDiscTitle(e.target.value)}
              placeholder={`Start a discussion about ${anime.title}...`}
              className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
            />
            <div className="flex gap-2">
              <input
                type="text"
                value={discContent}
                onChange={(e) => setDiscContent(e.target.value)}
                placeholder="Share your theory, favorite fight, or character analysis..."
                className="flex-1 min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
              />
              <button
                type="submit"
                disabled={postingDisc}
                className="min-h-[42px] px-4 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Post</span>
              </button>
            </div>
          </form>

          {discussions.length === 0 ? (
            <p className="text-xs text-[#A7A0AA] p-4 rounded-xl bg-[#141116] border border-white/8">
              No discussions for {anime.title} yet. Start the first thread!
            </p>
          ) : (
            <div className="space-y-2.5">
              {discussions.map((d: any) => (
                <Link
                  key={d.id}
                  to={`/pulse?discussion=${d.id}`}
                  className="block p-4 rounded-xl bg-[#141116] border border-white/8 hover:border-white/20"
                >
                  <p className="text-sm font-semibold text-[#F5F1F2]">{d.title}</p>
                  <p className="text-xs text-[#A7A0AA] mt-1 line-clamp-2">{d.content}</p>
                  <p className="text-[11px] font-mono-num text-[#A7A0AA] mt-2">
                    @{d.author?.username} · {d.likeCount} likes · {d.commentCount} comments
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="space-y-3">
          <h2 className="text-base font-bold text-[#F5F1F2] flex items-center gap-2">
            <Users className="w-4 h-4 text-[#6D28D9]" />
            <span>Linked Guilds</span>
          </h2>
          {guilds.length === 0 ? (
            <div className="p-4 rounded-xl bg-[#141116] border border-white/8 space-y-2">
              <p className="text-xs text-[#A7A0AA]">
                No dedicated guild forged for this anime yet.
              </p>
              <Link
                to="/guilds"
                className="inline-flex min-h-[38px] px-3.5 items-center rounded-lg bg-[#6D28D9] text-white text-xs font-semibold"
              >
                Forge a Guild
              </Link>
            </div>
          ) : (
            <div className="space-y-2.5">
              {guilds.map((g: any) => (
                <Link
                  key={g.id}
                  to={`/guilds/${g.slug}`}
                  className="block p-3.5 rounded-xl bg-[#141116] border border-[#6D28D9]/30 hover:border-[#6D28D9]"
                >
                  <p className="text-sm font-bold text-[#F5F1F2]">{g.name}</p>
                  <p className="text-xs text-[#A7A0AA] line-clamp-2 mt-1">{g.description}</p>
                  <p className="text-[11px] font-mono-num text-[#A7A0AA] mt-1.5">
                    {g.memberCount} Members · {g.discussionCount} Discussions
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* 9. Related & Recommended Anime Carousel */}
      {related.length > 0 && (
        <div className="pt-2 border-t border-white/8">
          <HorizontalAnimeCarousel
            title="Related & Recommended Anime"
            items={related as RealmsAnimeItem[]}
            seeAllTo={
              anime.genres?.[0]
                ? `/realms/genre/${slugifyRealm(anime.genres[0])}`
                : '/search'
            }
          />
        </div>
      )}

      {streamingModalOpen && (
        <StreamingModal anime={anime} onClose={() => setStreamingModalOpen(false)} />
      )}
    </div>
  );
};
