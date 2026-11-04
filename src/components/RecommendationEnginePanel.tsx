import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { SlidersHorizontal, Star, Check, Plus, Compass } from 'lucide-react';
import { apiFetch } from '../lib/api';
import { ALL_GENRE_NAMES } from '../lib/genres';
import { useAuth } from '../context/AuthContext';
import { KageImage } from './KageImage';

interface RecommendedItem {
  anime: {
    malId: number;
    title: string;
    year?: number | null;
    seasonsLabel?: string | null;
    score?: number | null;
    imageUrl: string;
    genres: string[];
  };
  matchScore: number;
  reasons: string[];
  matchedGenres: string[];
}

interface TasteSummary {
  hasSignals: boolean;
  totalSignals: number;
  watchedCount: number;
  ratedGenresCount: number;
  communitySignalCount: number;
  topAffinities: { genre: string; weight: number; normalized: number }[];
}

const TUNABLE_GENRES = ALL_GENRE_NAMES;

export const RecommendationEnginePanel: React.FC<{
  targetUid?: string;
  compact?: boolean;
}> = ({ targetUid, compact = false }) => {
  const { user, tasteRevision, bumpTasteRevision } = useAuth();
  const [summary, setSummary] = useState<TasteSummary | null>(null);
  const [items, setItems] = useState<RecommendedItem[]>([]);
  const [genreRatings, setGenreRatings] = useState<Record<string, number>>({});
  const [trackedIds, setTrackedIds] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [showTuner, setShowTuner] = useState(false);
  const [showAllGenres, setShowAllGenres] = useState(false);
  const [savingGenre, setSavingGenre] = useState<string | null>(null);

  const isViewingSelf = !targetUid || (user && targetUid === user.uid);

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    try {
      const query = targetUid ? `?uid=${encodeURIComponent(targetUid)}` : '';
      const [recRes, tasteRes] = await Promise.all([
        apiFetch<{ summary: TasteSummary; recommendations: RecommendedItem[] }>(
          `/api/recommendations${query}`
        ),
        user && isViewingSelf
          ? apiFetch<{
              entries: { animeMalId: number; status: string }[];
              genreRatings: { genre: string; rating: number }[];
            }>('/api/me/taste')
          : Promise.resolve(null),
      ]);

      setSummary(recRes.summary);
      setItems(recRes.recommendations || []);

      if (tasteRes) {
        const gMap: Record<string, number> = {};
        for (const gr of tasteRes.genreRatings) gMap[gr.genre] = gr.rating;
        setGenreRatings(gMap);

        const tMap: Record<number, string> = {};
        for (const e of tasteRes.entries) tMap[e.animeMalId] = e.status;
        setTrackedIds(tMap);
      }
    } catch (err) {
      console.error('Recommendation engine error:', err);
    } finally {
      setLoading(false);
    }
  }, [targetUid, user, isViewingSelf]);

  useEffect(() => {
    loadRecommendations();
  }, [loadRecommendations, tasteRevision]);

  const handleRateGenre = async (genre: string, rating: number) => {
    if (!user) return;
    setSavingGenre(genre);
    setGenreRatings((prev) => ({ ...prev, [genre]: rating }));
    try {
      await apiFetch('/api/me/genre-rating', {
        method: 'POST',
        body: JSON.stringify({ genre, rating }),
      });
      bumpTasteRevision();
    } catch (err) {
      console.error('Genre rating failed:', err);
    } finally {
      setSavingGenre(null);
    }
  };

  const handleQuickTrack = async (
    item: RecommendedItem['anime'],
    status: 'plan_to_watch' | 'completed'
  ) => {
    if (!user) return;
    setTrackedIds((prev) => ({ ...prev, [item.malId]: status }));
    try {
      await apiFetch('/api/me/anime', {
        method: 'POST',
        body: JSON.stringify({
          animeMalId: item.malId,
          animeTitle: item.title,
          animeImageUrl: item.imageUrl,
          genres: item.genres,
          status,
          score: status === 'completed' ? 9 : null,
        }),
      });
      bumpTasteRevision();
    } catch (err) {
      console.error('Quick track failed:', err);
    }
  };

  return (
    <section className="py-4">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-[#C0263D]" />
            <h2 className="text-lg sm:text-xl font-bold text-[#F5F1F2] tracking-tight">
              {summary?.hasSignals ? 'Recommended For You' : 'Personalized Anime Discovery'}
            </h2>
          </div>
          <p className="text-xs text-[#A7A0AA] mt-0.5">
            {summary?.hasSignals
              ? `Dynamically calibrated from ${summary.watchedCount} tracked anime · ${summary.ratedGenresCount} genre ratings · ${summary.communitySignalCount} guild & post signals`
              : user
                ? 'Rate genres below, log watched anime, or join a Guild to calibrate your live KAGE recommendations.'
                : 'Sign in to unlock dynamic recommendations powered by your watched anime, rated genres, and guild activity.'}
          </p>
        </div>

        {user && isViewingSelf && (
          <button
            type="button"
            onClick={() => setShowTuner((v) => !v)}
            className="min-h-[40px] px-3.5 py-2 rounded-lg bg-[#141116] hover:bg-[#1C1720] border border-white/10 text-xs font-medium text-[#F5F1F2] flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <SlidersHorizontal className="w-3.5 h-3.5 text-[#6D28D9]" />
            <span>{showTuner ? 'Done Tuning' : 'Tune Genre Ratings'}</span>
          </button>
        )}
      </div>

      {/* Live Affinity Breakdown Bar when user has signals */}
      {summary?.hasSignals && summary.topAffinities.length > 0 && !compact && (
        <div className="mb-4 p-3.5 rounded-xl bg-[#141116] border border-white/8">
          <div className="flex items-center justify-between text-xs text-[#A7A0AA] mb-2.5">
            <span>Active Taste Profile</span>
            <span className="font-mono-num text-[#F5F1F2]">
              {summary.totalSignals} live signals
            </span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {summary.topAffinities.map((aff) => (
              <div key={aff.genre} className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-[#F5F1F2] font-medium truncate">{aff.genre}</span>
                  <span className="font-mono-num text-[#A7A0AA] text-[11px]">
                    {aff.normalized}%
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-[#C0263D] to-[#6D28D9] transition-all duration-300"
                    style={{ width: `${aff.normalized}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Interactive Genre Affinity Tuner across All 28 Genres */}
      {showTuner && user && isViewingSelf && (
        <div className="mb-4 p-4 rounded-xl bg-[#141116] border border-[#6D28D9]/35 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-semibold text-[#F5F1F2]">
              Rate All {TUNABLE_GENRES.length} Anime Genres (1–10) — Recommendations update immediately
            </p>
            <div className="flex items-center gap-3">
              {savingGenre && (
                <span className="text-[11px] text-[#A7A0AA]">Updating {savingGenre}...</span>
              )}
              <button
                type="button"
                onClick={() => setShowAllGenres((v) => !v)}
                className="text-xs font-semibold text-[#6D28D9] hover:underline cursor-pointer"
              >
                {showAllGenres ? 'Show Top 10' : `Show All ${TUNABLE_GENRES.length} Genres`}
              </button>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            {(showAllGenres ? TUNABLE_GENRES : TUNABLE_GENRES.slice(0, 10)).map((genre) => {
              const current = genreRatings[genre] || 0;
              return (
                <div
                  key={genre}
                  className="p-2.5 rounded-lg bg-[#09080B] border border-white/8 flex flex-col justify-between gap-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-[#F5F1F2]">{genre}</span>
                    <span className="font-mono-num text-xs text-[#C0263D]">
                      {current ? `${current}/10` : 'Unrated'}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    {[2, 4, 6, 8, 10].map((val) => (
                      <button
                        key={val}
                        type="button"
                        onClick={() => handleRateGenre(genre, val)}
                        className={`flex-1 min-h-[32px] rounded text-[11px] font-mono-num transition-colors cursor-pointer ${
                          current >= val
                            ? 'bg-[#C0263D] text-white font-semibold'
                            : 'bg-[#141116] text-[#A7A0AA] hover:text-[#F5F1F2]'
                        }`}
                      >
                        {val}
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recommendations Cards */}
      {loading ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {Array.from({ length: compact ? 3 : 4 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[3/4] rounded-xl bg-[#141116] animate-pulse border border-white/5"
            />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-6 rounded-xl bg-[#141116] border border-white/8 text-center text-sm text-[#A7A0AA]">
          You have tracked every title in the current discovery set. Adjust genre filters to explore more realms.
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {items.slice(0, compact ? 6 : 8).map((rec) => {
            const status = trackedIds[rec.anime.malId];
            return (
              <div
                key={rec.anime.malId}
                className="group rounded-xl bg-[#141116] border border-white/8 overflow-hidden flex flex-col justify-between hover:border-white/20 transition-colors"
              >
                <Link to={`/anime/${rec.anime.malId}`} className="block relative aspect-[3/4] overflow-hidden">
                  <KageImage
                    src={rec.anime.imageUrl}
                    alt={rec.anime.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                  />
                  <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#09080B]/95 via-[#09080B]/40 to-transparent" />
                  <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between text-[11px] font-mono-num text-[#F5F1F2]">
                    <span className="font-semibold text-[#F5F1F2] drop-shadow">
                      {rec.matchScore}% match
                    </span>
                    {rec.anime.score ? (
                      <span className="text-amber-400 inline-flex items-center gap-1 drop-shadow font-semibold">
                        <Star className="w-3 h-3 fill-amber-400" />
                        {rec.anime.score.toFixed(1)}
                      </span>
                    ) : null}
                  </div>
                </Link>

                <div className="p-3 flex-1 flex flex-col justify-between gap-2.5">
                  <div>
                    <Link
                      to={`/anime/${rec.anime.malId}`}
                      className="text-sm font-semibold text-[#F5F1F2] hover:text-[#C0263D] line-clamp-1 transition-colors"
                    >
                      {rec.anime.title}
                    </Link>
                    <p className="text-[11px] text-[#A7A0AA] mt-0.5 line-clamp-1">
                      {rec.anime.genres.slice(0, 3).join(' · ')}
                    </p>
                    {rec.reasons[0] && (
                      <p className="text-[11px] text-[#F5F1F2]/80 mt-1.5 line-clamp-2 leading-snug">
                        {rec.reasons[0]}
                      </p>
                    )}
                  </div>

                  {user && isViewingSelf && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <button
                        type="button"
                        onClick={() => handleQuickTrack(rec.anime, 'plan_to_watch')}
                        className={`flex-1 min-h-[40px] px-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-1 transition-colors whitespace-nowrap cursor-pointer kage-press ${
                          status === 'plan_to_watch'
                            ? 'bg-[#6D28D9] text-white'
                            : 'bg-[#09080B] text-[#A7A0AA] hover:text-[#F5F1F2] border border-white/10'
                        }`}
                      >
                        {status === 'plan_to_watch' ? (
                          <Check className="w-3.5 h-3.5" />
                        ) : (
                          <Plus className="w-3.5 h-3.5" />
                        )}
                        <span>Watchlist</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleQuickTrack(rec.anime, 'completed')}
                        className="min-h-[40px] px-3 rounded-lg bg-[#09080B] hover:bg-[#C0263D] text-[#A7A0AA] hover:text-white border border-white/10 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer kage-press"
                        title="Mark watched to refine recommendations"
                      >
                        Seen
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
};
