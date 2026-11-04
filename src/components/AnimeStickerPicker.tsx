import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, Search, Sparkles, Star, X } from 'lucide-react';
import {
  KAGE_STICKER_CATEGORIES,
  KAGE_STICKERS,
  getGiftById,
  getStickerById,
  giftToDataUrl,
  stickerToDataUrl,
  type KageSticker,
} from '../lib/kageStickers';

export const KageStickerGraphic: React.FC<{
  stickerId?: string | null;
  size?: number;
  className?: string;
}> = ({ stickerId, size = 88, className = '' }) => {
  const sticker = getStickerById(stickerId);
  if (!sticker) {
    if (!stickerId) return null;
    return (
      <div
        style={{ width: size, height: size }}
        className={`inline-flex items-center justify-center rounded-2xl border border-white/10 bg-[#141116] px-2 text-center text-[10px] font-semibold text-[#A7A0AA] ${className}`}
      >
        Sticker unavailable
      </div>
    );
  }
  return (
    <img
      src={stickerToDataUrl(sticker)}
      alt={sticker.name}
      title={sticker.name}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={`select-none object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.45)] transition-transform duration-150 hover:scale-105 ${className}`}
    />
  );
};

export const KageGiftGraphic: React.FC<{
  giftId?: string | null;
  size?: number;
  className?: string;
}> = ({ giftId, size = 68, className = '' }) => {
  const gift = getGiftById(giftId);
  if (!gift) return null;
  return (
    <img
      src={giftToDataUrl(gift)}
      alt={gift.name}
      title={gift.name}
      width={size}
      height={size}
      loading="lazy"
      decoding="async"
      className={`select-none object-contain drop-shadow-[0_6px_16px_rgba(0,0,0,0.5)] ${className}`}
    />
  );
};

interface AnimeStickerPickerProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSticker: (stickerId: string) => void;
  selectedStickerId?: string | null;
  recentIds?: string[];
  favoriteIds?: string[];
  onToggleFavorite?: (stickerId: string) => void;
  title?: string;
  align?: 'left' | 'right';
}

export const AnimeStickerPicker: React.FC<AnimeStickerPickerProps> = ({
  isOpen,
  onClose,
  onSelectSticker,
  selectedStickerId,
  recentIds = [],
  favoriteIds = [],
  onToggleFavorite,
  title = 'KAGE Anime Stickers',
  align = 'right',
}) => {
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState<string>('All');
  const containerRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    setTimeout(() => searchInputRef.current?.focus(), 40);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  const favSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const filteredStickers = useMemo<KageSticker[]>(() => {
    const q = search.trim().toLowerCase();
    let base: KageSticker[] = KAGE_STICKERS;

    if (!q) {
      if (activeTab === 'Recent') {
        base = recentIds
          .map((id) => getStickerById(id))
          .filter((s): s is KageSticker => Boolean(s));
      } else if (activeTab === 'Favourites') {
        base = KAGE_STICKERS.filter((s) => favSet.has(s.id));
      } else if (activeTab !== 'All') {
        base = KAGE_STICKERS.filter((s) => s.category === activeTab);
      }
    } else {
      base = KAGE_STICKERS.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.label.toLowerCase().includes(q) ||
          s.category.toLowerCase().includes(q) ||
          s.keywords.some((k) => k.toLowerCase().includes(q))
      );
    }

    return base;
  }, [search, activeTab, recentIds, favSet]);

  if (!isOpen) return null;

  const tabs = [
    'All',
    ...(recentIds.length > 0 ? ['Recent'] : []),
    ...(favoriteIds.length > 0 ? ['Favourites'] : []),
    ...KAGE_STICKER_CATEGORIES,
  ];

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label={title}
      className={`z-40 w-[min(92vw,360px)] rounded-2xl border border-white/15 bg-[#120F16]/98 p-3 shadow-[0_20px_50px_rgba(0,0,0,0.85)] backdrop-blur-xl ${
        align === 'left' ? 'left-0' : 'right-0'
      }`}
    >
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="h-4 w-4 text-[#C0263D]" />
          <span className="text-xs font-bold tracking-wider text-[#F5F1F2] uppercase">
            {title}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close sticker picker"
          className="flex h-7 w-7 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-[#A7A0AA] transition hover:bg-white/10 hover:text-white"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-2.5">
        <Search className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-[#A7A0AA]" />
        <input
          ref={searchInputRef}
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search reactions (sakuga, nani, arise, gg...)"
          className="w-full rounded-xl border border-white/10 bg-[#09080B] py-2 pr-8 pl-8 text-xs text-[#F5F1F2] placeholder-[#A7A0AA]/60 focus:border-[#C0263D] focus:outline-none"
        />
        {search && (
          <button
            type="button"
            onClick={() => setSearch('')}
            className="absolute top-1/2 right-2.5 -translate-y-1/2 text-[#A7A0AA] hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Category Strip */}
      {!search && (
        <div className="no-scrollbar mb-2.5 flex items-center gap-1.5 overflow-x-auto pb-1">
          {tabs.map((tab) => {
            const active = activeTab === tab;
            return (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`inline-flex shrink-0 items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] font-semibold transition ${
                  active
                    ? 'border-[#C0263D] bg-[#C0263D]/20 text-white'
                    : 'border-white/10 bg-[#18141D] text-[#A7A0AA] hover:border-white/20 hover:text-white'
                }`}
              >
                {tab === 'Recent' && <Clock className="h-3 w-3" />}
                {tab === 'Favourites' && <Star className="h-3 w-3 text-amber-400" />}
                {tab}
              </button>
            );
          })}
        </div>
      )}

      {/* Grid */}
      {filteredStickers.length === 0 ? (
        <div className="flex h-44 flex-col items-center justify-center rounded-xl border border-white/5 bg-[#09080B]/70 px-4 text-center">
          <p className="text-xs font-semibold text-[#F5F1F2]">No matching anime stickers</p>
          <p className="mt-1 text-[11px] text-[#A7A0AA]">
            Try searching emotions like joy, shock, sakuga, or arise.
          </p>
        </div>
      ) : (
        <div className="grid max-h-60 grid-cols-4 gap-2 overflow-y-auto pr-0.5">
          {filteredStickers.map((sticker) => {
            const isSelected = selectedStickerId === sticker.id;
            const isFav = favSet.has(sticker.id);
            return (
              <div
                key={sticker.id}
                className={`group relative flex flex-col items-center rounded-xl border p-1.5 transition ${
                  isSelected
                    ? 'border-[#C0263D] bg-[#C0263D]/15'
                    : 'border-white/8 bg-[#18141D]/80 hover:border-white/25 hover:bg-[#1F1A26]'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectSticker(sticker.id)}
                  className="flex w-full flex-col items-center focus:outline-none"
                  title={`${sticker.name} (${sticker.category})`}
                >
                  <img
                    src={stickerToDataUrl(sticker)}
                    alt={sticker.name}
                    width={62}
                    height={62}
                    loading="lazy"
                    className="h-14 w-14 object-contain transition-transform duration-150 group-hover:scale-105"
                  />
                  <span className="mt-1 line-clamp-1 text-[9.5px] font-medium text-[#A7A0AA] group-hover:text-[#F5F1F2]">
                    {sticker.name}
                  </span>
                </button>
                {onToggleFavorite && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleFavorite(sticker.id);
                    }}
                    title={isFav ? 'Remove favourite sticker' : 'Save favourite sticker'}
                    className={`absolute top-1 right-1 flex h-5 w-5 items-center justify-center rounded-md transition ${
                      isFav
                        ? 'text-amber-400 opacity-100'
                        : 'bg-black/50 text-white/60 opacity-0 group-hover:opacity-100 hover:text-amber-300'
                    }`}
                  >
                    <Star className="h-3 w-3" fill={isFav ? 'currentColor' : 'none'} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
