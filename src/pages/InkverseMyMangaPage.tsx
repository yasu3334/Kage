import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Bookmark,
  BookOpen,
  Clock,
  Library,
  LogIn,
  Play,
  Star,
  Trash2,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { KageImage } from '../components/KageImage';
import { InkverseSubnav, type InkverseMangaItem } from '../components/InkverseComponents';

interface LibraryItem {
  id: number;
  mangaId: number;
  status: string;
  isBookmarked: boolean;
  currentChapterId: number | null;
  currentChapterNumber: string | null;
  currentPage: number;
  totalPages: number;
  progressPercent: number;
  personalScore: number | null;
  addedAt: string;
  lastReadAt: string | null;
  updatedAt: string;
  manga: InkverseMangaItem;
}

const LIBRARY_TABS = [
  { id: 'all', label: 'All Manga' },
  { id: 'reading', label: 'Currently Reading' },
  { id: 'completed', label: 'Completed' },
  { id: 'plan_to_read', label: 'Plan to Read' },
  { id: 'on_hold', label: 'On Hold' },
  { id: 'dropped', label: 'Dropped' },
  { id: 'bookmarked', label: 'Bookmarked' },
] as const;

export const InkverseMyMangaPage: React.FC = () => {
  const { user, loading: authLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<string>('all');
  const [items, setItems] = useState<LibraryItem[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);

  const loadLibrary = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await apiFetch<{
        items: LibraryItem[];
        counts: Record<string, number>;
      }>(`/api/inkverse/my-manga?tab=${encodeURIComponent(activeTab)}`);
      setItems(Array.isArray(res.items) ? res.items : []);
      setCounts(res.counts || {});
    } catch (err) {
      console.error('Failed to load My Manga library:', err);
    } finally {
      setLoading(false);
    }
  }, [user, activeTab]);

  useEffect(() => {
    if (!authLoading) loadLibrary();
  }, [authLoading, loadLibrary]);

  const handleStatusChange = async (mangaId: number, status: string) => {
    try {
      await apiFetch('/api/inkverse/my-manga', {
        method: 'POST',
        body: JSON.stringify({ mangaId, status }),
      });
      await loadLibrary();
    } catch {
      // ignore
    }
  };

  const handleToggleBookmark = async (mangaId: number, currentVal: boolean) => {
    try {
      await apiFetch('/api/inkverse/my-manga', {
        method: 'POST',
        body: JSON.stringify({ mangaId, isBookmarked: !currentVal }),
      });
      await loadLibrary();
    } catch {
      // ignore
    }
  };

  const handleRemove = async (mangaId: number) => {
    try {
      await apiFetch(`/api/inkverse/my-manga/${mangaId}`, { method: 'DELETE' });
      await loadLibrary();
    } catch {
      // ignore
    }
  };

  return (
    <div className="space-y-6 pb-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-[#C0263D]/20 border border-[#C0263D]/50 flex items-center justify-center">
            <Library className="w-5 h-5 text-[#C0263D]" />
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#F5F1F2] tracking-tight">
              My Manga Library
            </h1>
            <p className="text-xs text-[#A7A0AA]">
              Synced across all devices via your KAGE Hunter profile
            </p>
          </div>
        </div>

        <InkverseSubnav active="my-manga" />
      </div>

      {!authLoading && !user ? (
        <div className="p-8 sm:p-12 rounded-3xl bg-[#141116] border border-white/10 text-center space-y-4">
          <Library className="w-10 h-10 text-[#C0263D] mx-auto" />
          <h2 className="text-lg font-bold text-[#F5F1F2]">Sign In to Sync Your Manga Library</h2>
          <p className="text-xs sm:text-sm text-[#A7A0AA] max-w-md mx-auto">
            Track Currently Reading, Completed, Plan to Read, On Hold, Dropped, and Bookmarked manga
            across every screen with automatic chapter and page resume.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <Link
              to="/auth/login?redirect=%2Finkverse%2Fmy-manga"
              className="min-h-[44px] px-6 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2"
            >
              <LogIn className="w-4 h-4" />
              <span>Sign In</span>
            </Link>
            <Link
              to="/inkverse/browse"
              className="min-h-[44px] px-5 rounded-xl bg-[#09080B] border border-white/15 text-xs sm:text-sm font-semibold text-[#F5F1F2] inline-flex items-center"
            >
              Browse Manga First
            </Link>
          </div>
        </div>
      ) : (
        <>
          {/* Category Tabs */}
          <div className="flex items-center gap-4 overflow-x-auto border-b border-white/10 text-xs sm:text-sm no-scrollbar">
            {LIBRARY_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`min-h-[44px] pb-2 font-semibold relative whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === t.id ? 'text-[#F5F1F2]' : 'text-[#A7A0AA] hover:text-[#F5F1F2]'
                }`}
              >
                <span className="tabular-nums">
                  {t.label} ({counts[t.id] ?? 0})
                </span>
                {activeTab === t.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C0263D]" />
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-36 rounded-2xl bg-[#141116] animate-pulse border border-white/8"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-10 rounded-3xl bg-[#141116] border border-white/10 text-center space-y-3">
              <BookOpen className="w-8 h-8 text-[#6D28D9] mx-auto" />
              <p className="text-sm font-bold text-[#F5F1F2]">No Manga in This Shelf Yet</p>
              <p className="text-xs text-[#A7A0AA] max-w-md mx-auto">
                Open any series in INKVERSE to bookmark it, set its reading status, or start
                reading chapters.
              </p>
              <Link
                to="/inkverse/browse"
                className="inline-flex min-h-[42px] px-5 items-center rounded-xl bg-[#C0263D] text-white text-xs font-semibold"
              >
                Explore INKVERSE Library
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((item) => {
                const readHref = item.currentChapterId
                  ? `/inkverse/read/${item.manga.id}/${item.currentChapterId}?page=${item.currentPage || 1}`
                  : `/inkverse/manga/${item.manga.id}`;

                return (
                  <div
                    key={item.id}
                    className="p-4 rounded-2xl bg-[#141116] border border-white/10 hover:border-white/20 flex gap-4 transition-colors"
                  >
                    <Link
                      to={`/inkverse/manga/${item.manga.id}`}
                      className="w-24 sm:w-28 aspect-[2/3] rounded-xl overflow-hidden bg-[#09080B] border border-white/10 shrink-0"
                    >
                      <KageImage
                        strictArtwork
                        src={item.manga.coverImageUrl}
                        alt={item.manga.title}
                        className="w-full h-full object-cover"
                      />
                    </Link>

                    <div className="min-w-0 flex-1 flex flex-col justify-between gap-2.5">
                      <div className="space-y-1">
                        <div className="flex items-start justify-between gap-2">
                          <Link
                            to={`/inkverse/manga/${item.manga.id}`}
                            className="text-sm sm:text-base font-bold text-[#F5F1F2] hover:text-[#C0263D] line-clamp-1"
                          >
                            {item.manga.title}
                          </Link>

                          <button
                            type="button"
                            onClick={() => handleToggleBookmark(item.manga.id, item.isBookmarked)}
                            aria-label="Toggle bookmark"
                            className="text-[#A7A0AA] hover:text-violet-300 shrink-0 cursor-pointer"
                          >
                            <Bookmark
                              className={`w-4 h-4 ${
                                item.isBookmarked ? 'fill-violet-400 text-violet-400' : ''
                              }`}
                            />
                          </button>
                        </div>

                        <p className="text-[11px] text-[#A7A0AA] font-mono-num">
                          {item.manga.format}
                          {item.manga.score ? ` · ★ ${item.manga.score.toFixed(1)}` : ''}
                          {item.currentChapterNumber
                            ? ` · Ch. ${item.currentChapterNumber} (${item.progressPercent}%)`
                            : ''}
                        </p>

                        {item.lastReadAt && (
                          <p className="text-[11px] text-[#A7A0AA] inline-flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            <span>Last read {new Date(item.lastReadAt).toLocaleDateString()}</span>
                          </p>
                        )}
                      </div>

                      {item.progressPercent > 0 && (
                        <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-[#C0263D] to-[#6D28D9]"
                            style={{ width: `${item.progressPercent}%` }}
                          />
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
                        <select
                          aria-label={`Reading status for ${item.manga.title}`}
                          value={item.status}
                          onChange={(e) => handleStatusChange(item.manga.id, e.target.value)}
                          className="min-h-[34px] px-2.5 rounded-lg bg-[#09080B] border border-white/12 text-xs text-[#F5F1F2]"
                        >
                          <option value="reading">Currently Reading</option>
                          <option value="completed">Completed</option>
                          <option value="plan_to_read">Plan to Read</option>
                          <option value="on_hold">On Hold</option>
                          <option value="dropped">Dropped</option>
                        </select>

                        <div className="flex items-center gap-2">
                          <Link
                            to={readHref}
                            className="min-h-[34px] px-3 rounded-lg bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-semibold inline-flex items-center gap-1.5 kage-press"
                          >
                            <Play className="w-3 h-3 fill-white" />
                            <span>{item.currentChapterId ? 'Resume' : 'Open'}</span>
                          </Link>
                          <button
                            type="button"
                            onClick={() => handleRemove(item.manga.id)}
                            aria-label="Remove from library"
                            className="min-h-[34px] min-w-[34px] rounded-lg bg-[#09080B] border border-white/10 text-[#A7A0AA] hover:text-rose-400 flex items-center justify-center cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
