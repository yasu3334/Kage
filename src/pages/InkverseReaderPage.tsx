import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  Maximize,
  Minimize,
  MoveHorizontal,
  MoveVertical,
  ScrollText,
  BookOpen,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';

interface ReaderPage {
  pageNumber: number;
  imageUrl: string;
  hdUrl: string | null;
  width: number | null;
  height: number | null;
  qualityLabel: '4K' | 'HD' | 'Standard';
  isColor: boolean;
}

export const InkverseReaderPage: React.FC = () => {
  const { mangaId, chapterId } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [readerData, setReaderData] = useState<any | null>(null);
  const [chapterList, setChapterList] = useState<any[]>([]);

  const [readingMode, setReadingMode] = useState<'vertical' | 'page'>('vertical');
  const [fitMode, setFitMode] = useState<'width' | 'height'>('width');
  const [zoomPercent, setZoomPercent] = useState<number>(100);
  const [useHdSource, setUseHdSource] = useState<boolean>(true);
  const [hudVisible, setHudVisible] = useState<boolean>(true);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  const initialPageFromQuery = Math.max(1, Number(searchParams.get('page') || 1));
  const [currentPage, setCurrentPage] = useState<number>(initialPageFromQuery);
  const [bookmarkedPages, setBookmarkedPages] = useState<Set<number>>(new Set());

  const pageRefs = useRef<Record<number, HTMLDivElement | null>>({});
  const rootContainerRef = useRef<HTMLDivElement | null>(null);
  const initialScrolledRef = useRef<boolean>(false);

  const loadChapter = useCallback(async () => {
    if (!chapterId || !mangaId) return;
    setLoading(true);
    setError('');
    initialScrolledRef.current = false;

    try {
      const [pagesRes, detailRes] = await Promise.all([
        apiFetch<any>(`/api/inkverse/chapters/${encodeURIComponent(chapterId)}/pages`),
        apiFetch<any>(`/api/inkverse/manga/${encodeURIComponent(mangaId)}`).catch(() => null),
      ]);
      setReaderData(pagesRes);
      if (detailRes?.chapters) {
        setChapterList(
          [...detailRes.chapters].sort((a: any, b: any) => a.chapterSortKey - b.chapterSortKey)
        );
      }

      const bms = new Set<number>(
        (Array.isArray(pagesRes.bookmarks) ? pagesRes.bookmarks : []).map(
          (b: any) => Number(b.pageNumber)
        )
      );
      setBookmarkedPages(bms);

      const qPage = Number(searchParams.get('page') || 0);
      const total = Array.isArray(pagesRes.pages) ? pagesRes.pages.length : 1;
      if (qPage > 0) {
        setCurrentPage(Math.min(Math.max(1, qPage), Math.max(1, total)));
      } else {
        setCurrentPage(1);
      }
    } catch (err: any) {
      setError(err?.message || 'Unable to load chapter pages.');
    } finally {
      setLoading(false);
    }
  }, [chapterId, mangaId, searchParams]);

  useEffect(() => {
    loadChapter();
  }, [loadChapter]);

  // Listen to fullscreen state
  useEffect(() => {
    const onFsChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const pages: ReaderPage[] = useMemo(
    () => (Array.isArray(readerData?.pages) ? readerData.pages : []),
    [readerData]
  );

  // Scroll to initial resumed page once rendered in vertical mode
  useEffect(() => {
    if (
      !loading &&
      readingMode === 'vertical' &&
      pages.length > 0 &&
      currentPage > 1 &&
      !initialScrolledRef.current
    ) {
      initialScrolledRef.current = true;
      const targetEl = pageRefs.current[currentPage];
      if (targetEl) {
        window.setTimeout(() => {
          targetEl.scrollIntoView({ behavior: 'auto', block: 'start' });
        }, 120);
      }
    }
  }, [loading, readingMode, pages.length, currentPage]);

  // Track visible page in vertical scrolling mode
  useEffect(() => {
    if (readingMode !== 'vertical' || pages.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        let bestPage = currentPage;
        let maxRatio = 0;
        for (const entry of entries) {
          if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            const pNum = Number((entry.target as HTMLElement).dataset.pageNumber || 0);
            if (pNum > 0) bestPage = pNum;
          }
        }
        if (maxRatio > 0 && bestPage !== currentPage) {
          setCurrentPage(bestPage);
        }
      },
      { threshold: [0.35, 0.65] }
    );

    for (const p of pages) {
      const node = pageRefs.current[p.pageNumber];
      if (node) observer.observe(node);
    }

    return () => observer.disconnect();
  }, [readingMode, pages, currentPage]);

  // Keyboard navigation in Page-by-Page mode
  useEffect(() => {
    if (readingMode !== 'page') return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        setCurrentPage((p) => {
          if (p < pages.length) return p + 1;
          if (readerData?.nextChapterId) {
            navigate(`/inkverse/read/${mangaId}/${readerData.nextChapterId}`);
          }
          return p;
        });
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setCurrentPage((p) => {
          if (p > 1) return p - 1;
          if (readerData?.prevChapterId) {
            navigate(`/inkverse/read/${mangaId}/${readerData.prevChapterId}`);
          }
          return p;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [readingMode, pages.length, readerData?.nextChapterId, readerData?.prevChapterId, mangaId, navigate]);

  // Automatically save reading progress to PostgreSQL
  useEffect(() => {
    if (!user || !readerData?.manga?.id || !readerData?.chapter?.id) return;
    if (readerData.isExternalRestricted) return;

    const total = Math.max(1, pages.length || readerData.chapter.pageCount || 1);
    const timer = setTimeout(() => {
      apiFetch('/api/inkverse/progress', {
        method: 'POST',
        body: JSON.stringify({
          mangaId: readerData.manga.id,
          chapterId: readerData.chapter.id,
          pageNumber: currentPage,
          totalPages: total,
          readingMode,
        }),
      }).catch(() => {});
    }, 450);

    return () => clearTimeout(timer);
  }, [user, readerData, currentPage, pages.length, readingMode]);

  const handleToggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await (rootContainerRef.current || document.documentElement).requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // ignore if fullscreen restricted in iframe
    }
  };

  const handleToggleBookmarkPage = async () => {
    if (!readerData?.manga || !readerData?.chapter) return;
    if (!user) {
      navigate(
        `/auth/login?redirect=${encodeURIComponent(
          `/inkverse/read/${mangaId}/${chapterId}?page=${currentPage}`
        )}`
      );
      return;
    }
    try {
      const res = await apiFetch<{ bookmarked: boolean }>('/api/inkverse/bookmarks', {
        method: 'POST',
        body: JSON.stringify({
          mangaId: readerData.manga.id,
          chapterId: readerData.chapter.id,
          chapterNumber: readerData.chapter.chapterNumber,
          pageNumber: currentPage,
        }),
      });
      setBookmarkedPages((prev) => {
        const next = new Set(prev);
        if (res.bookmarked) next.add(currentPage);
        else next.delete(currentPage);
        return next;
      });
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="min-h-dvh bg-[#09080B] text-[#F5F1F2] flex flex-col items-center justify-center p-6 gap-4">
        <div className="w-10 h-10 rounded-full border-2 border-[#C0263D] border-t-transparent animate-spin" />
        <p className="text-xs sm:text-sm text-[#A7A0AA]">Loading chapter artwork...</p>
      </div>
    );
  }

  if (error || !readerData) {
    return (
      <div className="min-h-dvh bg-[#09080B] text-[#F5F1F2] flex items-center justify-center p-6">
        <div className="max-w-md w-full p-6 rounded-3xl bg-[#141116] border border-white/10 text-center space-y-4">
          <p className="text-sm font-semibold text-[#F5F1F2]">{error || 'Chapter unavailable.'}</p>
          <Link
            to={mangaId ? `/inkverse/manga/${mangaId}` : '/inkverse'}
            className="inline-flex min-h-[44px] px-5 items-center rounded-xl bg-[#C0263D] text-white text-xs font-semibold"
          >
            Back to Manga Details
          </Link>
        </div>
      </div>
    );
  }

  const {
    manga,
    chapter,
    prevChapterId,
    nextChapterId,
    isExternalRestricted,
    externalUrl,
    providerNotice,
  } = readerData;

  const totalPages = Math.max(1, pages.length);
  const progressPercent = Math.min(100, Math.round((currentPage / totalPages) * 100));
  const isCurrentBookmarked = bookmarkedPages.has(currentPage);
  const currentQualityLabel = pages[currentPage - 1]?.qualityLabel || chapter.qualityTier || 'Standard';

  const sameLangChapters = chapterList.filter((c) => c.language === chapter.language);
  const selectorChapters = sameLangChapters.length > 0 ? sameLangChapters : chapterList;

  const goPrevPage = () => {
    if (currentPage > 1) {
      setCurrentPage((p) => p - 1);
    } else if (prevChapterId) {
      navigate(`/inkverse/read/${manga.id}/${prevChapterId}`);
    }
  };

  const goNextPage = () => {
    if (currentPage < pages.length) {
      setCurrentPage((p) => p + 1);
    } else if (nextChapterId) {
      navigate(`/inkverse/read/${manga.id}/${nextChapterId}`);
    }
  };

  const activePageObj = pages[currentPage - 1];

  return (
    <div
      ref={rootContainerRef}
      className="min-h-dvh bg-[#09080B] text-[#F5F1F2] flex flex-col relative select-none"
    >
      {/* Top Floating Reader Controls Bar */}
      <header
        className={`fixed top-0 inset-x-0 z-40 bg-[#09080B]/92 backdrop-blur-xl border-b border-white/10 px-3 sm:px-6 py-2.5 transition-transform duration-200 ${
          hudVisible ? 'translate-y-0' : '-translate-y-full'
        }`}
      >
        <div className="max-w-6xl mx-auto flex flex-wrap items-center justify-between gap-2.5">
          {/* Left: Back + Manga Title + Chapter Info */}
          <div className="flex items-center gap-2.5 min-w-0">
            <Link
              to={`/inkverse/manga/${manga.id}`}
              className="min-h-[40px] min-w-[40px] rounded-xl bg-[#141116] border border-white/12 flex items-center justify-center text-[#F5F1F2] hover:border-[#C0263D] shrink-0"
              aria-label="Back to manga detail"
            >
              <ArrowLeft className="w-4 h-4" />
            </Link>

            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-bold text-[#F5F1F2] truncate">{manga.title}</p>
              <p className="text-[11px] text-[#A7A0AA] font-mono-num truncate">
                Ch. {chapter.chapterNumber}
                {chapter.title ? ` · ${chapter.title}` : ''}
                {!isExternalRestricted ? ` · ${currentQualityLabel}` : ''}
              </p>
            </div>
          </div>

          {/* Right: Chapter Selector + Controls */}
          <div className="flex flex-wrap items-center gap-1.5">
            {selectorChapters.length > 0 && (
              <select
                aria-label="Select chapter"
                value={String(chapter.id)}
                onChange={(e) => navigate(`/inkverse/read/${manga.id}/${e.target.value}`)}
                className="min-h-[38px] max-w-[140px] sm:max-w-[190px] px-2.5 rounded-xl bg-[#141116] border border-white/12 text-xs text-[#F5F1F2]"
              >
                {selectorChapters.map((c) => (
                  <option key={c.id} value={String(c.id)}>
                    Ch. {c.chapterNumber}
                    {c.title ? ` — ${c.title}` : ''}
                  </option>
                ))}
              </select>
            )}

            {/* Reading Mode Toggle */}
            <button
              type="button"
              onClick={() => setReadingMode((m) => (m === 'vertical' ? 'page' : 'vertical'))}
              title={readingMode === 'vertical' ? 'Switch to Page-by-Page' : 'Switch to Vertical Scroll'}
              className="min-h-[38px] px-3 rounded-xl bg-[#141116] border border-white/12 hover:border-[#C0263D] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {readingMode === 'vertical' ? (
                <>
                  <ScrollText className="w-3.5 h-3.5 text-[#C0263D]" />
                  <span className="hidden sm:inline">Vertical</span>
                </>
              ) : (
                <>
                  <BookOpen className="w-3.5 h-3.5 text-[#6D28D9]" />
                  <span className="hidden sm:inline">Paged</span>
                </>
              )}
            </button>

            {/* Fit Width / Height */}
            <button
              type="button"
              onClick={() => setFitMode((f) => (f === 'width' ? 'height' : 'width'))}
              title={fitMode === 'width' ? 'Fit to Height' : 'Fit to Width'}
              className="min-h-[38px] min-w-[38px] px-2.5 rounded-xl bg-[#141116] border border-white/12 hover:border-white/30 text-xs inline-flex items-center justify-center gap-1 cursor-pointer"
            >
              {fitMode === 'width' ? (
                <MoveHorizontal className="w-4 h-4" />
              ) : (
                <MoveVertical className="w-4 h-4" />
              )}
              <span className="hidden lg:inline">
                {fitMode === 'width' ? 'Fit Width' : 'Fit Height'}
              </span>
            </button>

            {/* Zoom Controls */}
            <div className="hidden sm:flex items-center rounded-xl bg-[#141116] border border-white/12 overflow-hidden">
              <button
                type="button"
                onClick={() => setZoomPercent((z) => Math.max(60, z - 15))}
                aria-label="Zoom out"
                className="min-h-[38px] min-w-[34px] flex items-center justify-center hover:bg-white/5 cursor-pointer"
              >
                <ZoomOut className="w-3.5 h-3.5" />
              </button>
              <span className="px-1.5 text-[11px] font-mono-num text-[#A7A0AA]">{zoomPercent}%</span>
              <button
                type="button"
                onClick={() => setZoomPercent((z) => Math.min(180, z + 15))}
                aria-label="Zoom in"
                className="min-h-[38px] min-w-[34px] flex items-center justify-center hover:bg-white/5 cursor-pointer"
              >
                <ZoomIn className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Source Quality Toggle */}
            {!isExternalRestricted && pages.length > 0 && (
              <button
                type="button"
                onClick={() => setUseHdSource((v) => !v)}
                className={`min-h-[38px] px-2.5 rounded-xl border text-[11px] font-bold cursor-pointer ${
                  useHdSource
                    ? 'bg-[#6D28D9]/25 border-[#6D28D9] text-violet-200'
                    : 'bg-[#141116] border-white/12 text-[#A7A0AA]'
                }`}
                title="Toggle original source resolution vs data saver"
              >
                {useHdSource ? 'HD Source' : 'Data Saver'}
              </button>
            )}

            {/* Bookmark Current Page */}
            <button
              type="button"
              onClick={handleToggleBookmarkPage}
              aria-label="Bookmark current page"
              className={`min-h-[38px] min-w-[38px] px-2.5 rounded-xl border inline-flex items-center justify-center cursor-pointer ${
                isCurrentBookmarked
                  ? 'bg-[#C0263D]/25 border-[#C0263D] text-rose-200'
                  : 'bg-[#141116] border-white/12 text-[#A7A0AA] hover:text-white'
              }`}
            >
              <Bookmark
                className={`w-4 h-4 ${isCurrentBookmarked ? 'fill-[#C0263D] text-[#C0263D]' : ''}`}
              />
            </button>

            {/* Fullscreen */}
            <button
              type="button"
              onClick={handleToggleFullscreen}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
              className="min-h-[38px] min-w-[38px] rounded-xl bg-[#141116] border border-white/12 hover:border-white/30 flex items-center justify-center cursor-pointer"
            >
              {isFullscreen ? (
                <Minimize className="w-4 h-4" />
              ) : (
                <Maximize className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Reader Canvas */}
      <main className="flex-1 pt-16 pb-20 flex flex-col items-center">
        {isExternalRestricted || pages.length === 0 ? (
          <div className="my-auto max-w-lg w-full mx-4 p-6 sm:p-8 rounded-3xl bg-[#141116] border border-white/12 text-center space-y-4">
            <BookOpen className="w-10 h-10 text-[#C0263D] mx-auto" />
            <h1 className="text-lg sm:text-xl font-bold text-[#F5F1F2]">
              {isExternalRestricted
                ? 'Official Licensed Publisher Chapter'
                : 'Chapter Pages Unavailable'}
            </h1>
            <p className="text-xs sm:text-sm text-[#A7A0AA] leading-relaxed">
              {providerNotice ||
                'Pages for this chapter are restricted or unavailable on the upstream API.'}
            </p>
            <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
              {externalUrl && (
                <a
                  href={externalUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="min-h-[44px] px-5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2"
                >
                  <span>Read on Official Platform</span>
                  <ExternalLink className="w-4 h-4" />
                </a>
              )}
              <Link
                to={`/inkverse/manga/${manga.id}`}
                className="min-h-[44px] px-5 rounded-xl bg-[#09080B] border border-white/15 text-xs sm:text-sm font-semibold text-[#F5F1F2] inline-flex items-center"
              >
                Back to Chapters
              </Link>
            </div>
          </div>
        ) : readingMode === 'vertical' ? (
          <div
            onClick={() => setHudVisible((v) => !v)}
            className="w-full flex flex-col items-center gap-1 px-1 sm:px-4"
          >
            {pages.map((pg) => {
              const srcUrl = useHdSource ? pg.imageUrl : pg.hdUrl || pg.imageUrl;
              return (
                <div
                  key={pg.pageNumber}
                  data-page-number={pg.pageNumber}
                  ref={(el) => {
                    pageRefs.current[pg.pageNumber] = el;
                  }}
                  style={{
                    width: fitMode === 'width' ? `${Math.min(100, zoomPercent)}%` : 'auto',
                    maxWidth: fitMode === 'width' ? `${Math.round(860 * (zoomPercent / 100))}px` : '100%',
                  }}
                  className="relative flex justify-center bg-[#09080B]"
                >
                  <img
                    src={srcUrl}
                    alt={`${manga.title} Ch. ${chapter.chapterNumber} Page ${pg.pageNumber}`}
                    loading="lazy"
                    decoding="async"
                    style={
                      fitMode === 'height'
                        ? { maxHeight: `${Math.round(88 * (zoomPercent / 100))}dvh`, width: 'auto' }
                        : { width: '100%', height: 'auto' }
                    }
                    className="block object-contain"
                  />
                </div>
              );
            })}
          </div>
        ) : (
          /* Page-by-Page Reading Mode with Left/Center/Right Touch Zones */
          <div className="relative w-full flex-1 flex items-center justify-center px-2 py-3 min-h-[75dvh]">
            {activePageObj && (
              <div
                style={{
                  maxWidth: fitMode === 'width' ? `${Math.round(920 * (zoomPercent / 100))}px` : '100%',
                }}
                className="relative flex items-center justify-center"
              >
                <img
                  key={activePageObj.pageNumber}
                  src={
                    useHdSource
                      ? activePageObj.imageUrl
                      : activePageObj.hdUrl || activePageObj.imageUrl
                  }
                  alt={`${manga.title} Ch. ${chapter.chapterNumber} Page ${activePageObj.pageNumber}`}
                  style={
                    fitMode === 'height'
                      ? { maxHeight: `${Math.round(84 * (zoomPercent / 100))}dvh`, width: 'auto' }
                      : { width: '100%', height: 'auto' }
                  }
                  className="block object-contain rounded-lg shadow-2xl"
                />
              </div>
            )}

            {/* Touch Navigation Tap Zones */}
            <button
              type="button"
              onClick={goPrevPage}
              aria-label="Previous page"
              className="absolute inset-y-0 left-0 w-1/3 z-10 cursor-w-resize focus:outline-none"
            />
            <button
              type="button"
              onClick={() => setHudVisible((v) => !v)}
              aria-label="Toggle reader controls"
              className="absolute inset-y-0 left-1/3 w-1/3 z-10 cursor-pointer focus:outline-none"
            />
            <button
              type="button"
              onClick={goNextPage}
              aria-label="Next page"
              className="absolute inset-y-0 right-0 w-1/3 z-10 cursor-e-resize focus:outline-none"
            />
          </div>
        )}
      </main>

      {/* Bottom Chapter & Page Progress HUD */}
      <footer
        className={`fixed bottom-0 inset-x-0 z-40 bg-[#09080B]/92 backdrop-blur-xl border-t border-white/10 px-3 sm:px-6 py-2.5 transition-transform duration-200 ${
          hudVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-3">
          <button
            type="button"
            disabled={!prevChapterId}
            onClick={() => prevChapterId && navigate(`/inkverse/read/${manga.id}/${prevChapterId}`)}
            className="min-h-[40px] px-3.5 rounded-xl bg-[#141116] border border-white/12 disabled:opacity-35 hover:border-[#C0263D] text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <ChevronLeft className="w-4 h-4" />
            <span className="hidden sm:inline">Previous Chapter</span>
            <span className="sm:hidden">Prev Ch</span>
          </button>

          {!isExternalRestricted && pages.length > 0 && (
            <div className="flex-1 max-w-md flex flex-col items-center gap-1">
              <div className="w-full flex items-center justify-between text-[11px] font-mono-num text-[#A7A0AA]">
                <span>
                  Page {currentPage} / {pages.length}
                </span>
                <span className="text-[#F5F1F2] font-semibold">{progressPercent}%</span>
              </div>
              <input
                type="range"
                aria-label="Jump to page"
                min={1}
                max={pages.length}
                value={currentPage}
                onChange={(e) => {
                  const targetPage = Number(e.target.value);
                  setCurrentPage(targetPage);
                  if (readingMode === 'vertical' && pageRefs.current[targetPage]) {
                    pageRefs.current[targetPage]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                  }
                }}
                className="w-full accent-[#C0263D] cursor-pointer h-1.5"
              />
            </div>
          )}

          <button
            type="button"
            disabled={!nextChapterId}
            onClick={() => nextChapterId && navigate(`/inkverse/read/${manga.id}/${nextChapterId}`)}
            className="min-h-[40px] px-3.5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] disabled:opacity-35 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            <span className="hidden sm:inline">Next Chapter</span>
            <span className="sm:hidden">Next Ch</span>
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      </footer>
    </div>
  );
};
