import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  FilePlus2,
  ImagePlus,
  Loader2,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { KageImage } from '../components/KageImage';
import { InkverseSubnav, type InkverseMangaItem } from '../components/InkverseComponents';

interface StudioChapterSummary {
  id: number;
  chapterNumber: string;
  title: string;
  language: string;
  pageCount: number;
  qualityTier: string;
  moderationStatus: string;
  moderationNote?: string | null;
  publishedAt?: string | null;
}

interface StudioSeriesItem extends InkverseMangaItem {
  chapters: StudioChapterSummary[];
}

interface QueuedPageItem {
  id: string;
  fileName: string;
  dataUrl: string;
  width: number;
  height: number;
  qualityLabel: '4K' | 'HD' | 'Standard';
}

const STUDIO_GENRES = [
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
];

const LANGUAGE_CHOICES = [
  { value: 'en', label: 'English (EN)' },
  { value: 'ja', label: 'Japanese (JA)' },
  { value: 'ko', label: 'Korean (KO)' },
  { value: 'zh', label: 'Chinese (ZH)' },
  { value: 'es', label: 'Spanish (ES)' },
  { value: 'fr', label: 'French (FR)' },
];

type StudioTab = 'create_series' | 'upload_chapter' | 'my_uploads';

function classifyDim(width: number, height: number): '4K' | 'HD' | 'Standard' {
  const maxDim = Math.max(width, height);
  if (maxDim >= 2160) return '4K';
  if (maxDim >= 1000) return 'HD';
  return 'Standard';
}

function readImageFile(file: File): Promise<{
  dataUrl: string;
  width: number;
  height: number;
}> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const img = new Image();
      img.onload = () => {
        resolve({
          dataUrl,
          width: img.naturalWidth || 0,
          height: img.naturalHeight || 0,
        });
      };
      img.onerror = () => reject(new Error(`Unable to decode image "${file.name}".`));
      img.src = dataUrl;
    };
    reader.onerror = () => reject(new Error(`Failed to read file "${file.name}".`));
    reader.readAsDataURL(file);
  });
}

export const InkverseUploadStudioPage: React.FC = () => {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialMangaId = searchParams.get('mangaId') || '';

  const [activeTab, setActiveTab] = useState<StudioTab>(
    initialMangaId ? 'upload_chapter' : 'create_series'
  );
  const [mySeries, setMySeries] = useState<StudioSeriesItem[]>([]);
  const [loadingSeries, setLoadingSeries] = useState(false);

  // Create New Series form state
  const [title, setTitle] = useState('');
  const [altTitlesRaw, setAltTitlesRaw] = useState('');
  const [format, setFormat] = useState<'MANGA' | 'MANHWA' | 'MANHUA' | 'WEBTOON' | 'ONE_SHOT'>(
    'MANGA'
  );
  const [status, setStatus] = useState<'RELEASING' | 'FINISHED' | 'HIATUS'>('RELEASING');
  const [releaseYear, setReleaseYear] = useState<string>(String(new Date().getFullYear()));
  const [authorName, setAuthorName] = useState('');
  const [artistName, setArtistName] = useState('');
  const [originalLanguage, setOriginalLanguage] = useState('en');
  const [isColor, setIsColor] = useState(false);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['Action', 'Fantasy']);
  const [synopsis, setSynopsis] = useState('');
  const [coverPreview, setCoverPreview] = useState<{
    dataUrl: string;
    width: number;
    height: number;
    fileName: string;
    qualityLabel: '4K' | 'HD' | 'Standard';
  } | null>(null);
  const [seriesRightsAccepted, setSeriesRightsAccepted] = useState(false);
  const [creatingSeries, setCreatingSeries] = useState(false);
  const [seriesError, setSeriesError] = useState('');
  const [seriesSuccess, setSeriesSuccess] = useState<InkverseMangaItem | null>(null);

  // Upload Chapter form state
  const [targetMangaId, setTargetMangaId] = useState<string>(initialMangaId);
  const [chapterNumber, setChapterNumber] = useState('1');
  const [volumeNumber, setVolumeNumber] = useState('');
  const [chapterTitle, setChapterTitle] = useState('');
  const [chapterLanguage, setChapterLanguage] = useState('en');
  const [chapterIsColor, setChapterIsColor] = useState(false);
  const [queuedPages, setQueuedPages] = useState<QueuedPageItem[]>([]);
  const [chapterRightsAccepted, setChapterRightsAccepted] = useState(false);
  const [uploadingChapter, setUploadingChapter] = useState(false);
  const [chapterError, setChapterError] = useState('');
  const [publishedChapterResult, setPublishedChapterResult] = useState<{
    mangaId: number;
    chapterId: number;
    chapterNumber: string;
    pageCount: number;
    qualityTier: string;
  } | null>(null);

  const [deletingKey, setDeletingKey] = useState<string | null>(null);

  const loadMyUploads = useCallback(async () => {
    if (!user) return;
    setLoadingSeries(true);
    try {
      const res = await apiFetch<{ items: StudioSeriesItem[] }>('/api/inkverse/studio/my-uploads');
      const items = Array.isArray(res.items) ? res.items : [];
      setMySeries(items);
      if (!targetMangaId && items.length > 0) {
        setTargetMangaId(String(items[0].id));
      }
    } catch {
      // keep existing
    } finally {
      setLoadingSeries(false);
    }
  }, [user, targetMangaId]);

  useEffect(() => {
    loadMyUploads();
  }, [loadMyUploads]);

  useEffect(() => {
    if (initialMangaId) {
      setTargetMangaId(initialMangaId);
      setActiveTab('upload_chapter');
    }
  }, [initialMangaId]);

  const handleCoverPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setSeriesError('');
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setSeriesError('Cover image must be PNG, JPEG, or WebP.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      setSeriesError('Cover image must be 10 MB or smaller.');
      return;
    }
    try {
      const decoded = await readImageFile(file);
      if (decoded.width < 200 || decoded.height < 280) {
        setSeriesError('Cover artwork must be at least 200×280 pixels.');
        return;
      }
      setCoverPreview({
        dataUrl: decoded.dataUrl,
        width: decoded.width,
        height: decoded.height,
        fileName: file.name,
        qualityLabel: classifyDim(decoded.width, decoded.height),
      });
    } catch (err: any) {
      setSeriesError(err?.message || 'Unable to process selected cover image.');
    }
  };

  const handlePagesPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (files.length === 0) return;
    setChapterError('');

    const availableSlots = 50 - queuedPages.length;
    if (availableSlots <= 0) {
      setChapterError('Maximum 50 pages per chapter upload.');
      return;
    }

    const filesToRead = files.slice(0, availableSlots);
    const nextItems: QueuedPageItem[] = [];
    for (let i = 0; i < filesToRead.length; i++) {
      const file = filesToRead[i];
      if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
        setChapterError(`Skipped "${file.name}": only PNG, JPEG, or WebP manga pages are supported.`);
        continue;
      }
      if (file.size > 12 * 1024 * 1024) {
        setChapterError(`Skipped "${file.name}": page exceeds 12 MB limit.`);
        continue;
      }
      try {
        const decoded = await readImageFile(file);
        if (decoded.width < 250 || decoded.height < 250) {
          setChapterError(`Skipped "${file.name}": manga page must be at least 250×250 pixels.`);
          continue;
        }
        nextItems.push({
          id: `${Date.now()}-${i}-${Math.random().toString(36).slice(2, 7)}`,
          fileName: file.name,
          dataUrl: decoded.dataUrl,
          width: decoded.width,
          height: decoded.height,
          qualityLabel: classifyDim(decoded.width, decoded.height),
        });
      } catch {
        // skip unreadable file
      }
    }

    if (nextItems.length > 0) {
      setQueuedPages((prev) => [...prev, ...nextItems]);
    }
  };

  const moveQueuedPage = (idx: number, dir: -1 | 1) => {
    setQueuedPages((prev) => {
      const next = [...prev];
      const target = idx + dir;
      if (target < 0 || target >= next.length) return prev;
      [next[idx], next[target]] = [next[target], next[idx]];
      return next;
    });
  };

  const removeQueuedPage = (id: string) => {
    setQueuedPages((prev) => prev.filter((p) => p.id !== id));
  };

  const toggleGenre = (g: string) => {
    setSelectedGenres((prev) =>
      prev.includes(g) ? prev.filter((item) => item !== g) : prev.length < 6 ? [...prev, g] : prev
    );
  };

  const handleCreateSeries = async (e: React.FormEvent) => {
    e.preventDefault();
    setSeriesError('');
    setSeriesSuccess(null);

    if (title.trim().length < 2) {
      setSeriesError('Enter a series title (at least 2 characters).');
      return;
    }
    if (synopsis.trim().length < 15) {
      setSeriesError('Write a synopsis of at least 15 characters.');
      return;
    }
    if (!coverPreview) {
      setSeriesError('Upload a vertical cover artwork image (PNG, JPEG, or WebP).');
      return;
    }
    if (!seriesRightsAccepted) {
      setSeriesError('Confirm your authorship/rights & KAGE safety policy agreement.');
      return;
    }

    setCreatingSeries(true);
    try {
      const altTitles = altTitlesRaw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const res = await apiFetch<{ manga: InkverseMangaItem }>('/api/inkverse/studio/manga', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          altTitles,
          synopsis: synopsis.trim(),
          authorName: authorName.trim() || undefined,
          artistName: artistName.trim() || undefined,
          format,
          status,
          releaseYear: releaseYear ? Number(releaseYear) : null,
          isColor,
          originalLanguage,
          genres: selectedGenres.length > 0 ? selectedGenres : ['Action'],
          coverDataUrl: coverPreview.dataUrl,
          rightsDeclared: seriesRightsAccepted,
        }),
      });

      setSeriesSuccess(res.manga);
      setTargetMangaId(String(res.manga.id));
      setTitle('');
      setAltTitlesRaw('');
      setSynopsis('');
      setCoverPreview(null);
      setSeriesRightsAccepted(false);
      await loadMyUploads();
      setActiveTab('upload_chapter');
    } catch (err: any) {
      setSeriesError(err?.message || 'Failed to publish manga series.');
    } finally {
      setCreatingSeries(false);
    }
  };

  const handlePublishChapter = async (e: React.FormEvent) => {
    e.preventDefault();
    setChapterError('');
    setPublishedChapterResult(null);

    const parsedMangaId = Number(targetMangaId);
    if (!parsedMangaId || Number.isNaN(parsedMangaId)) {
      setChapterError('Select or create a manga series first.');
      return;
    }
    if (!/^[0-9]+(\.[0-9]+)?$/.test(chapterNumber.trim())) {
      setChapterError('Enter a valid numeric chapter number (e.g., 1, 2, or 10.5).');
      return;
    }
    if (queuedPages.length === 0) {
      setChapterError('Add at least 1 manga page image before publishing.');
      return;
    }
    if (!chapterRightsAccepted) {
      setChapterError('Confirm your rights & safety policy attestation before publishing.');
      return;
    }

    setUploadingChapter(true);
    try {
      const res = await apiFetch<{
        chapter: { id: number; chapterNumber: string };
        pageCount: number;
        qualityTier: string;
      }>(`/api/inkverse/studio/manga/${parsedMangaId}/chapters`, {
        method: 'POST',
        body: JSON.stringify({
          chapterNumber: chapterNumber.trim(),
          volumeNumber: volumeNumber.trim() || null,
          title: chapterTitle.trim(),
          language: chapterLanguage,
          isColor: chapterIsColor,
          rightsDeclared: chapterRightsAccepted,
          pagesDataUrls: queuedPages.map((p) => p.dataUrl),
        }),
      });

      setPublishedChapterResult({
        mangaId: parsedMangaId,
        chapterId: res.chapter.id,
        chapterNumber: res.chapter.chapterNumber,
        pageCount: res.pageCount,
        qualityTier: res.qualityTier,
      });
      setQueuedPages([]);
      setChapterTitle('');
      setChapterNumber((prev) => String((Number(prev) || 1) + 1));
      setChapterRightsAccepted(false);
      await loadMyUploads();
    } catch (err: any) {
      setChapterError(err?.message || 'Failed to upload chapter pages.');
    } finally {
      setUploadingChapter(false);
    }
  };

  const handleDeleteSeries = async (mangaId: number) => {
    setDeletingKey(`manga:${mangaId}`);
    try {
      await apiFetch(`/api/inkverse/studio/manga/${mangaId}`, { method: 'DELETE' });
      await loadMyUploads();
    } catch {
      // ignore
    } finally {
      setDeletingKey(null);
    }
  };

  const handleDeleteChapter = async (chapterId: number) => {
    setDeletingKey(`ch:${chapterId}`);
    try {
      await apiFetch(`/api/inkverse/studio/chapters/${chapterId}`, { method: 'DELETE' });
      await loadMyUploads();
    } catch {
      // ignore
    } finally {
      setDeletingKey(null);
    }
  };

  if (authLoading) {
    return (
      <div className="py-12 flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-[#C0263D]" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="space-y-6 pb-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-[#F5F1F2]">INKVERSE Creator Studio</h1>
            <p className="text-xs text-[#A7A0AA]">
              Publish original manga, webtoons, and chapters readable directly inside KAGE
            </p>
          </div>
          <InkverseSubnav active="studio" />
        </div>

        <div className="p-8 sm:p-10 rounded-3xl bg-[#141116] border border-white/10 text-center space-y-4">
          <Upload className="w-10 h-10 text-[#C0263D] mx-auto" />
          <h2 className="text-lg font-bold text-[#F5F1F2]">Sign In to Publish Original Manga</h2>
          <p className="text-xs sm:text-sm text-[#A7A0AA] max-w-md mx-auto leading-relaxed">
            Create your original series, upload high-resolution chapter pages, and let every hunter
            read directly inside the KAGE INKVERSE Reader.
          </p>
          <button
            type="button"
            onClick={() => navigate('/auth/login?redirect=/inkverse/studio')}
            className="min-h-[44px] px-6 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs sm:text-sm font-bold cursor-pointer"
          >
            Sign In to KAGE Studio
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#F5F1F2] tracking-tight">
            INKVERSE Creator Studio
          </h1>
          <p className="text-xs text-[#A7A0AA]">
            Publish safe, authorized manga &amp; webtoon chapters with built-in AI &amp; format screening
          </p>
        </div>
        <InkverseSubnav active="studio" />
      </div>

      {/* Studio Policy Notice */}
      <div className="p-4 rounded-2xl bg-[#141116] border border-white/10 flex items-start gap-3">
        <ShieldCheck className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
        <div className="text-xs text-[#A7A0AA] leading-relaxed space-y-0.5">
          <p className="font-semibold text-[#F5F1F2]">
            KAGE Creator Safety &amp; Authenticity Standard
          </p>
          <p>
            Every cover and manga page is verified for format integrity, genuine HD/4K resolution,
            and zero NSFW, hate, or pirated publisher content. Uploads are immediately playable in
            the KAGE Reader.
          </p>
        </div>
      </div>

      {/* Mode Switch Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={() => setActiveTab('create_series')}
          className={`min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 border cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'create_series'
              ? 'bg-[#C0263D] border-[#C0263D] text-white'
              : 'bg-[#141116] border-white/10 text-[#A7A0AA] hover:text-[#F5F1F2]'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          <span>1. Create Series</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('upload_chapter')}
          className={`min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 border cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'upload_chapter'
              ? 'bg-[#C0263D] border-[#C0263D] text-white'
              : 'bg-[#141116] border-white/10 text-[#A7A0AA] hover:text-[#F5F1F2]'
          }`}
        >
          <FilePlus2 className="w-4 h-4" />
          <span>2. Upload Chapter Pages</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('my_uploads')}
          className={`min-h-[42px] px-4 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-2 border cursor-pointer whitespace-nowrap shrink-0 transition-colors ${
            activeTab === 'my_uploads'
              ? 'bg-[#6D28D9] border-[#6D28D9] text-white'
              : 'bg-[#141116] border-white/10 text-[#A7A0AA] hover:text-[#F5F1F2]'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span className="tabular-nums">My Uploads ({mySeries.length})</span>
        </button>
      </div>

      {/* TAB 1: CREATE SERIES */}
      {activeTab === 'create_series' && (
        <form
          onSubmit={handleCreateSeries}
          className="p-5 sm:p-6 rounded-2xl bg-[#141116] border border-white/10 space-y-5"
        >
          {seriesSuccess && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/35 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Published series <strong>{seriesSuccess.title}</strong>! Upload Chapter 1 below.
                </span>
              </div>
              <Link
                to={`/inkverse/manga/${seriesSuccess.id}`}
                className="text-xs font-semibold text-white underline shrink-0"
              >
                View Series
              </Link>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Left: Cover Uploader */}
            <div className="lg:col-span-4 space-y-3">
              <label className="block text-xs font-semibold text-[#F5F1F2]">
                Vertical Series Cover *
              </label>
              <label className="block rounded-2xl border-2 border-dashed border-white/15 hover:border-[#C0263D] bg-[#09080B] overflow-hidden aspect-[2/3] relative cursor-pointer transition-colors">
                {coverPreview ? (
                  <>
                    <img
                      src={coverPreview.dataUrl}
                      alt="Cover preview"
                      className="w-full h-full object-cover"
                    />
                    <span className="absolute top-2.5 left-2.5 px-2 py-0.5 rounded-md bg-[#09080B]/85 border border-white/20 text-[10px] font-bold text-[#F5F1F2] tabular-nums">
                      {coverPreview.qualityLabel} · {coverPreview.width}×{coverPreview.height}
                    </span>
                    <span className="absolute bottom-2.5 inset-x-2.5 py-1.5 rounded-lg bg-[#09080B]/85 text-center text-xs font-semibold text-[#F5F1F2]">
                      Replace Cover Image
                    </span>
                  </>
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center p-5 text-center gap-2.5 text-[#A7A0AA]">
                    <ImagePlus className="w-8 h-8 text-[#C0263D]" />
                    <p className="text-xs font-semibold text-[#F5F1F2]">Select Vertical Cover</p>
                    <p className="text-[11px] leading-relaxed">
                      PNG, JPEG, or WebP · Min 200×280 · Up to 10 MB
                    </p>
                  </div>
                )}
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={handleCoverPick}
                  className="hidden"
                />
              </label>
            </div>

            {/* Right: Series Metadata */}
            <div className="lg:col-span-8 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-[#F5F1F2]">Series Title *</span>
                  <input
                    type="text"
                    required
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g., Crimson Eclipse Chronicle"
                    className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs sm:text-sm text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-[#F5F1F2]">
                    Alternative Titles (comma-separated)
                  </span>
                  <input
                    type="text"
                    value={altTitlesRaw}
                    onChange={(e) => setAltTitlesRaw(e.target.value)}
                    placeholder="Optional Japanese/Romaji titles"
                    className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs sm:text-sm text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-[#F5F1F2]">Format</span>
                  <select
                    value={format}
                    onChange={(e) => setFormat(e.target.value as any)}
                    className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                  >
                    <option value="MANGA">Manga</option>
                    <option value="WEBTOON">Webtoon</option>
                    <option value="MANHWA">Manhwa</option>
                    <option value="MANHUA">Manhua</option>
                    <option value="ONE_SHOT">One-Shot</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-[#F5F1F2]">Status</span>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                  >
                    <option value="RELEASING">Ongoing</option>
                    <option value="FINISHED">Completed</option>
                    <option value="HIATUS">On Hiatus</option>
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-[#F5F1F2]">Language</span>
                  <select
                    value={originalLanguage}
                    onChange={(e) => setOriginalLanguage(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                  >
                    {LANGUAGE_CHOICES.map((l) => (
                      <option key={l.value} value={l.value}>
                        {l.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-[#F5F1F2]">Release Year</span>
                  <input
                    type="number"
                    min={1960}
                    max={2030}
                    value={releaseYear}
                    onChange={(e) => setReleaseYear(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-[#F5F1F2]">Story Author</span>
                  <input
                    type="text"
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder={profile?.displayName || user.username}
                    className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                  />
                </label>

                <label className="block space-y-1">
                  <span className="text-xs font-semibold text-[#F5F1F2]">Illustrator / Artist</span>
                  <input
                    type="text"
                    value={artistName}
                    onChange={(e) => setArtistName(e.target.value)}
                    placeholder={authorName || profile?.displayName || user.username}
                    className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                  />
                </label>
              </div>

              <div className="space-y-1.5">
                <span className="text-xs font-semibold text-[#F5F1F2] block">
                  Genres (Select up to 6)
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {STUDIO_GENRES.map((g) => {
                    const active = selectedGenres.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => toggleGenre(g)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border cursor-pointer transition-colors ${
                          active
                            ? 'bg-[#C0263D] border-[#C0263D] text-white'
                            : 'bg-[#09080B] border-white/10 text-[#A7A0AA] hover:text-white'
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="block space-y-1">
                <span className="text-xs font-semibold text-[#F5F1F2]">Synopsis *</span>
                <textarea
                  rows={4}
                  required
                  value={synopsis}
                  onChange={(e) => setSynopsis(e.target.value)}
                  placeholder="Describe the world, stakes, and premise of your manga..."
                  className="w-full rounded-xl bg-[#09080B] border border-white/12 p-3 text-xs sm:text-sm text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
                />
              </label>

              <div className="flex flex-wrap items-center gap-4 pt-1">
                <label className="inline-flex items-center gap-2 text-xs text-[#F5F1F2] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isColor}
                    onChange={(e) => setIsColor(e.target.checked)}
                    className="w-4 h-4 accent-[#6D28D9]"
                  />
                  <span>Full Color Series (Webtoon / Manhwa Style)</span>
                </label>
              </div>

              <label className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#09080B] border border-white/12 text-xs text-[#A7A0AA] cursor-pointer">
                <input
                  type="checkbox"
                  checked={seriesRightsAccepted}
                  onChange={(e) => setSeriesRightsAccepted(e.target.checked)}
                  className="w-4 h-4 accent-[#C0263D] mt-0.5 shrink-0"
                />
                <span>
                  I confirm I am the creator or hold authorized publishing rights to this artwork and
                  accept KAGE&apos;s community safety guidelines (no pirated chapters, NSFW, or hate
                  content).
                </span>
              </label>

              {seriesError && <p className="text-xs text-rose-400">{seriesError}</p>}

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={creatingSeries}
                  className="min-h-[44px] px-6 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] disabled:opacity-50 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer shadow-[0_0_24px_rgba(192,38,61,0.35)]"
                >
                  {creatingSeries ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Screening &amp; Publishing...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>Publish Series &amp; Add Chapter 1 →</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </form>
      )}

      {/* TAB 2: UPLOAD CHAPTER PAGES */}
      {activeTab === 'upload_chapter' && (
        <form
          onSubmit={handlePublishChapter}
          className="p-5 sm:p-6 rounded-2xl bg-[#141116] border border-white/10 space-y-5"
        >
          {publishedChapterResult && (
            <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/35 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-xs text-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>
                  Chapter {publishedChapterResult.chapterNumber} ({publishedChapterResult.pageCount}{' '}
                  pages · {publishedChapterResult.qualityTier}) is now live inside INKVERSE!
                </span>
              </div>
              <Link
                to={`/inkverse/read/${publishedChapterResult.mangaId}/${publishedChapterResult.chapterId}`}
                className="min-h-[36px] px-4 rounded-lg bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-bold inline-flex items-center gap-1.5"
              >
                <BookOpen className="w-3.5 h-3.5" />
                <span>Open in KAGE Reader</span>
              </Link>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold text-[#F5F1F2]">Select Series *</span>
              <select
                value={targetMangaId}
                onChange={(e) => setTargetMangaId(e.target.value)}
                className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs sm:text-sm text-[#F5F1F2]"
              >
                <option value="">Choose one of your series...</option>
                {mySeries.map((s) => (
                  <option key={s.id} value={String(s.id)}>
                    {s.title} ({s.inAppChapterCount || 0} chapters)
                  </option>
                ))}
              </select>
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-[#F5F1F2]">Chapter Number *</span>
              <input
                type="text"
                required
                value={chapterNumber}
                onChange={(e) => setChapterNumber(e.target.value)}
                placeholder="1"
                className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs sm:text-sm text-[#F5F1F2]"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-[#F5F1F2]">Language</span>
              <select
                value={chapterLanguage}
                onChange={(e) => setChapterLanguage(e.target.value)}
                className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
              >
                {LANGUAGE_CHOICES.map((l) => (
                  <option key={l.value} value={l.value}>
                    {l.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-semibold text-[#F5F1F2]">
                Chapter Title (Optional)
              </span>
              <input
                type="text"
                value={chapterTitle}
                onChange={(e) => setChapterTitle(e.target.value)}
                placeholder="e.g., Awakening Beneath the Crimson Moon"
                className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs sm:text-sm text-[#F5F1F2]"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs font-semibold text-[#F5F1F2]">Volume (Optional)</span>
              <input
                type="text"
                value={volumeNumber}
                onChange={(e) => setVolumeNumber(e.target.value)}
                placeholder="1"
                className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs sm:text-sm text-[#F5F1F2]"
              />
            </label>
          </div>

          <label className="inline-flex items-center gap-2 text-xs text-[#F5F1F2] cursor-pointer">
            <input
              type="checkbox"
              checked={chapterIsColor}
              onChange={(e) => setChapterIsColor(e.target.checked)}
              className="w-4 h-4 accent-[#6D28D9]"
            />
            <span>Full Color Chapter Pages</span>
          </label>

          {/* Page Upload Picker */}
          <div className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-semibold text-[#F5F1F2] tabular-nums">
                Manga Pages ({queuedPages.length} / 50 max)
              </span>
              {queuedPages.length > 0 && (
                <button
                  type="button"
                  onClick={() => setQueuedPages([])}
                  className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer"
                >
                  Clear All Pages
                </button>
              )}
            </div>

            <label className="block p-6 rounded-2xl border-2 border-dashed border-white/15 hover:border-[#C0263D] bg-[#09080B] text-center space-y-2 cursor-pointer transition-colors">
              <Upload className="w-7 h-7 text-[#C0263D] mx-auto" />
              <p className="text-xs sm:text-sm font-semibold text-[#F5F1F2]">
                Select Manga Page Images (Multiple Files Supported)
              </p>
              <p className="text-[11px] text-[#A7A0AA]">
                PNG, JPEG, or WebP · Minimum 250×250 px · Ordered sequentially for KAGE Reader
              </p>
              <input
                type="file"
                multiple
                accept="image/png,image/jpeg,image/webp"
                onChange={handlePagesPick}
                className="hidden"
              />
            </label>

            {queuedPages.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {queuedPages.map((pg, idx) => (
                  <div
                    key={pg.id}
                    className="rounded-xl bg-[#09080B] border border-white/12 overflow-hidden flex flex-col"
                  >
                    <div className="relative aspect-[2/3] bg-black">
                      <img
                        src={pg.dataUrl}
                        alt={`Page ${idx + 1}`}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-bold text-white tabular-nums">
                        #{idx + 1}
                      </span>
                      <span className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-black/80 text-[10px] font-bold text-violet-300">
                        {pg.qualityLabel}
                      </span>
                    </div>
                    <div className="p-1.5 flex items-center justify-between gap-1 border-t border-white/10">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => moveQueuedPage(idx, -1)}
                        aria-label="Move page earlier"
                        className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 text-[#A7A0AA] cursor-pointer"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === queuedPages.length - 1}
                        onClick={() => moveQueuedPage(idx, 1)}
                        aria-label="Move page later"
                        className="p-1.5 rounded hover:bg-white/10 disabled:opacity-30 text-[#A7A0AA] cursor-pointer"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeQueuedPage(pg.id)}
                        aria-label="Remove page"
                        className="p-1.5 rounded hover:bg-rose-500/20 text-rose-400 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <label className="flex items-start gap-2.5 p-3.5 rounded-xl bg-[#09080B] border border-white/12 text-xs text-[#A7A0AA] cursor-pointer">
            <input
              type="checkbox"
              checked={chapterRightsAccepted}
              onChange={(e) => setChapterRightsAccepted(e.target.checked)}
              className="w-4 h-4 accent-[#C0263D] mt-0.5 shrink-0"
            />
            <span>
              I attest that every page in this chapter is authorized for distribution on KAGE and
              contains no unauthorized commercial scans, explicit NSFW imagery, or malicious edits.
            </span>
          </label>

          {chapterError && <p className="text-xs text-rose-400">{chapterError}</p>}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={uploadingChapter}
              className="min-h-[44px] px-6 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] disabled:opacity-50 text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer shadow-[0_0_24px_rgba(192,38,61,0.35)]"
            >
              {uploadingChapter ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validating &amp; Publishing Chapter...</span>
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4" />
                  <span>Publish Chapter to KAGE Reader</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}

      {/* TAB 3: MY UPLOADS & MODERATION STATUS */}
      {activeTab === 'my_uploads' && (
        <section className="space-y-4">
          {loadingSeries ? (
            <div className="h-44 rounded-2xl bg-[#141116] border border-white/10 animate-pulse" />
          ) : mySeries.length === 0 ? (
            <div className="p-8 rounded-2xl bg-[#141116] border border-white/10 text-center space-y-3">
              <p className="text-sm font-bold text-[#F5F1F2]">No Creator Series Published Yet</p>
              <p className="text-xs text-[#A7A0AA] max-w-md mx-auto">
                Start your first manga or webtoon series in Studio so readers can follow chapters
                directly inside INKVERSE.
              </p>
              <button
                type="button"
                onClick={() => setActiveTab('create_series')}
                className="min-h-[42px] px-5 rounded-xl bg-[#C0263D] text-white text-xs font-bold cursor-pointer"
              >
                Create Your First Series
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {mySeries.map((series) => (
                <div
                  key={series.id}
                  className="p-4 sm:p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="w-16 aspect-[2/3] rounded-xl overflow-hidden bg-[#09080B] border border-white/10 shrink-0">
                        <KageImage
                          strictArtwork
                          src={series.coverImageUrl}
                          alt={series.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0 space-y-1">
                        <Link
                          to={`/inkverse/manga/${series.id}`}
                          className="text-sm sm:text-base font-bold text-[#F5F1F2] hover:text-[#C0263D] block truncate"
                        >
                          {series.title}
                        </Link>
                        <p className="text-xs text-[#A7A0AA] font-mono-num">
                          {series.format} · {series.chapters.length} chapters · Moderation:{' '}
                          <span
                            className={
                              series.moderationStatus === 'rejected'
                                ? 'text-rose-400 font-semibold'
                                : series.moderationStatus === 'pending_review'
                                  ? 'text-amber-300 font-semibold'
                                  : 'text-emerald-400 font-semibold'
                            }
                          >
                            {(series.moderationStatus || 'approved').replace(/_/g, ' ')}
                          </span>
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setTargetMangaId(String(series.id));
                          setActiveTab('upload_chapter');
                        }}
                        className="min-h-[38px] px-3.5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <FilePlus2 className="w-3.5 h-3.5" />
                        <span>Add Chapter</span>
                      </button>

                      <button
                        type="button"
                        disabled={deletingKey === `manga:${series.id}`}
                        onClick={() => handleDeleteSeries(series.id)}
                        aria-label={`Delete ${series.title}`}
                        className="min-h-[38px] min-w-[38px] rounded-xl bg-[#09080B] border border-white/12 text-[#A7A0AA] hover:text-rose-400 inline-flex items-center justify-center cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {series.chapters.length > 0 && (
                    <div className="space-y-2 pt-3 border-t border-white/8">
                      {series.chapters.map((ch) => (
                        <div
                          key={ch.id}
                          className="p-3 rounded-xl bg-[#09080B] border border-white/8 flex flex-wrap items-center justify-between gap-2 text-xs"
                        >
                          <div className="min-w-0 space-y-0.5">
                            <p className="font-semibold text-[#F5F1F2] font-mono-num">
                              Ch. {ch.chapterNumber}
                              {ch.title ? ` — ${ch.title}` : ''}
                            </p>
                            <p className="text-[11px] text-[#A7A0AA] font-mono-num">
                              {ch.language.toUpperCase()} · {ch.pageCount} pages · {ch.qualityTier} ·{' '}
                              {ch.moderationStatus}
                              {ch.moderationNote ? ` (${ch.moderationNote})` : ''}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <Link
                              to={`/inkverse/read/${series.id}/${ch.id}`}
                              className="min-h-[34px] px-3 rounded-lg bg-[#141116] border border-white/12 hover:border-[#C0263D] text-xs font-semibold text-[#F5F1F2] inline-flex items-center gap-1.5"
                            >
                              <BookOpen className="w-3.5 h-3.5 text-[#C0263D]" />
                              <span>Read</span>
                            </Link>
                            <button
                              type="button"
                              disabled={deletingKey === `ch:${ch.id}`}
                              onClick={() => handleDeleteChapter(ch.id)}
                              aria-label={`Delete chapter ${ch.chapterNumber}`}
                              className="min-h-[34px] min-w-[34px] rounded-lg bg-[#141116] border border-white/12 text-[#A7A0AA] hover:text-rose-400 inline-flex items-center justify-center cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
