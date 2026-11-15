import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom';
import {
  Bell,
  BookOpen,
  Calendar,
  ChevronRight,
  Compass,
  Crown,
  Filter,
  Gamepad2,
  Inbox,
  LogIn,
  Megaphone,
  Menu,
  Mic,
  Radio,
  Search,
  Settings,
  Star,
  Swords,
  Trophy,
  User,
  Users,
  X,
  Zap,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../lib/api';
import { KageImage } from './KageImage';
import { KageLogo, OwnerBadge } from './KageBrand';

interface AppShellProps {
  children: React.ReactNode;
  onReplayIntro: () => void;
}

export const AppShell: React.FC<AppShellProps> = ({ children, onReplayIntro }) => {
  const {
    user,
    profile,
    unreadNotifications,
    unreadMessages,
    latestAnnouncement,
    dismissAnnouncement,
  } = useAuth();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [headerQuery, setHeaderQuery] = useState('');
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [suggestionsLoading, setSuggestionsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<{
    manga: any[];
    anime: any[];
    authors: any[];
    characters: any[];
  }>({ manga: [], anime: [], authors: [], characters: [] });
  const searchBoxRef = React.useRef<HTMLDivElement | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setSuggestionsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    const q = headerQuery.trim();
    if (q.length < 2) {
      setSuggestions({ manga: [], anime: [], authors: [], characters: [] });
      setSuggestionsLoading(false);
      return;
    }
    const controller = new AbortController();
    setSuggestionsLoading(true);
    const timer = setTimeout(() => {
      apiFetch<any>(`/api/inkverse/suggestions?q=${encodeURIComponent(q)}`, {
        signal: controller.signal,
      })
        .then((res) => {
          if (!controller.signal.aborted) {
            setSuggestions({
              manga: Array.isArray(res.manga) ? res.manga : [],
              anime: Array.isArray(res.anime) ? res.anime : [],
              authors: Array.isArray(res.authors) ? res.authors : [],
              characters: Array.isArray(res.characters) ? res.characters : [],
            });
          }
        })
        .catch(() => {})
        .finally(() => {
          if (!controller.signal.aborted) setSuggestionsLoading(false);
        });
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [headerQuery]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      window.removeEventListener('keydown', handleKey);
    };
  }, []);

  // Universal smooth mouse drag-to-scroll & Shift+Wheel horizontal scroll across every .overflow-x-auto container
  useEffect(() => {
    let activeEl: HTMLElement | null = null;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let isDraggingX = false;
    let suppressNextClick = false;

    const findHorizontalScroller = (target: EventTarget | null): HTMLElement | null => {
      let node = target instanceof HTMLElement ? target : null;
      while (node && node !== document.body) {
        if (
          (node.classList.contains('overflow-x-auto') ||
            node.classList.contains('kage-scroll-x') ||
            node.dataset.kageScrollX === 'true') &&
          node.scrollWidth > node.clientWidth + 4
        ) {
          return node;
        }
        node = node.parentElement;
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      const targetTag = (e.target as HTMLElement | null)?.tagName;
      if (targetTag === 'INPUT' || targetTag === 'TEXTAREA' || targetTag === 'SELECT') return;
      const scroller = findHorizontalScroller(e.target);
      if (!scroller) return;
      activeEl = scroller;
      startX = e.clientX;
      startY = e.clientY;
      startScrollLeft = scroller.scrollLeft;
      isDraggingX = false;
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activeEl || e.pointerType !== 'mouse') return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (!isDraggingX) {
        if (Math.abs(dx) > 7 && Math.abs(dx) > Math.abs(dy)) {
          isDraggingX = true;
          suppressNextClick = true;
          activeEl.style.scrollSnapType = 'none';
          activeEl.style.scrollBehavior = 'auto';
        } else if (Math.abs(dy) > 10) {
          activeEl = null;
          return;
        }
      }
      if (isDraggingX && activeEl) {
        e.preventDefault();
        activeEl.scrollLeft = startScrollLeft - dx;
      }
    };

    const endPointerDrag = () => {
      if (activeEl && isDraggingX) {
        activeEl.style.scrollSnapType = '';
        activeEl.style.scrollBehavior = '';
      }
      activeEl = null;
      isDraggingX = false;
      if (suppressNextClick) {
        setTimeout(() => {
          suppressNextClick = false;
        }, 60);
      }
    };

    const onClickCapture = (e: MouseEvent) => {
      if (suppressNextClick) {
        e.preventDefault();
        e.stopPropagation();
        suppressNextClick = false;
      }
    };

    const onWheel = (e: WheelEvent) => {
      if (!e.shiftKey || Math.abs(e.deltaY) === 0) return;
      const scroller = findHorizontalScroller(e.target);
      if (!scroller) return;
      e.preventDefault();
      scroller.scrollLeft += e.deltaY;
    };

    window.addEventListener('pointerdown', onPointerDown, { passive: true });
    window.addEventListener('pointermove', onPointerMove, { passive: false });
    window.addEventListener('pointerup', endPointerDrag, { passive: true });
    window.addEventListener('pointercancel', endPointerDrag, { passive: true });
    window.addEventListener('click', onClickCapture, true);
    window.addEventListener('wheel', onWheel, { passive: false });

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', endPointerDrag);
      window.removeEventListener('pointercancel', endPointerDrag);
      window.removeEventListener('click', onClickCapture, true);
      window.removeEventListener('wheel', onWheel);
    };
  }, []);

  const isAuthRoute = location.pathname.startsWith('/auth');
  if (isAuthRoute) {
    return <div className="min-h-dvh bg-[#09080B] text-[#F5F1F2]">{children}</div>;
  }

  const isOwnerOrAdmin = user?.role === 'owner' || user?.role === 'admin';

  const isRealmsSectionActive =
    location.pathname === '/' ||
    location.pathname.startsWith('/realms') ||
    location.pathname.startsWith('/category') ||
    location.pathname.startsWith('/filters') ||
    location.pathname.startsWith('/anime');

  const isGuildSectionActive =
    location.pathname.startsWith('/guilds') || location.pathname.startsWith('/voice');

  // Exact 4-tab KAGE bottom navigation: Realms | Pulse | Guilds | Clash
  const bottomTabs = [
    { to: '/', label: 'Realms', icon: Compass, activeOverride: isRealmsSectionActive },
    { to: '/pulse', label: 'Pulse', icon: Radio, activeOverride: location.pathname.startsWith('/pulse') },
    { to: '/guilds', label: 'Guilds', icon: Users, activeOverride: isGuildSectionActive },
    { to: '/clash', label: 'Clash', icon: Swords, activeOverride: location.pathname.startsWith('/clash') },
  ];

  // Sub-screens that render their own back/close header or full-bleed cover banner
  const isVoiceActiveRoom = /^\/voice\/\d+/.test(location.pathname);
  const isCommunityChatRoom = /^\/guilds\/[^/]+\/rooms\/[^/]+/.test(location.pathname);
  const isCommunityProfile =
    location.pathname.startsWith('/guilds/') && !isCommunityChatRoom;
  const isInkverseReader = /^\/inkverse\/read\//.test(location.pathname);
  const hideTopBar =
    isVoiceActiveRoom ||
    isCommunityChatRoom ||
    isCommunityProfile ||
    isInkverseReader ||
    location.pathname.startsWith('/anime/') ||
    location.pathname.startsWith('/inbox');

  // Immersive full-height chat/stage/reader routes that render their own fixed bottom bar
  const hideBottomNav =
    isVoiceActiveRoom ||
    isCommunityChatRoom ||
    isInkverseReader ||
    location.pathname.startsWith('/inbox');

  const handleHeaderSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = headerQuery.trim();
    setSuggestionsOpen(false);
    if (!q) {
      navigate(location.pathname.startsWith('/inkverse') ? '/inkverse/browse' : '/search');
      return;
    }
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

  const hasAnySuggestion =
    suggestions.manga.length > 0 ||
    suggestions.anime.length > 0 ||
    suggestions.authors.length > 0 ||
    suggestions.characters.length > 0;

  return (
    <div className="min-h-dvh bg-[#09080B] text-[#F5F1F2] flex flex-col">
      {/* Top Navigation Header: preserves KAGE identity across Mobile, Tablet & Desktop while supporting INKVERSE live multi-entity search & quick actions */}
      <header
        className={`${
          hideTopBar ? 'hidden' : 'flex'
        } sticky top-0 z-30 w-full h-14 sm:h-16 bg-[#09080B]/88 backdrop-blur-xl border-b border-white/[0.07] px-3 sm:px-6 items-center justify-between gap-3`}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-[#C0263D]/30 to-transparent"
        />
        {/* Left Side: Hamburger Menu + Mobile Search Button / Desktop KAGE Brand */}
        <div className="relative z-10 flex items-center gap-1 sm:gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#F5F1F2] hover:bg-white/[0.06] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C0263D] kage-press"
            aria-label="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => navigate('/search')}
            className="md:hidden min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#F5F1F2]/90 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C0263D] kage-press"
            aria-label="Search anime, manga, characters"
          >
            <Search className="w-5 h-5" />
          </button>

          <Link
            to="/"
            className="hidden md:inline-flex items-center whitespace-nowrap shrink-0 kage-press rounded-lg px-1 py-0.5"
            aria-label="KAGE — The Anime Universe Home"
          >
            <KageLogo size="md" showSubtitle />
          </Link>
        </div>

        {/* Center: Mobile Centered KAGE Logo */}
        <div className="md:hidden absolute inset-0 pointer-events-none flex items-center justify-center">
          <Link
            to="/"
            className="pointer-events-auto inline-flex items-center justify-center whitespace-nowrap shrink-0 kage-press rounded-lg px-1.5 py-0.5"
            aria-label="KAGE — The Anime Universe Home"
          >
            <KageLogo size="md" showSubtitle centered />
          </Link>
        </div>

        {/* Center Desktop Search Bar with Live Multi-Entity Autocomplete */}
        <div ref={searchBoxRef} className="hidden md:block relative flex-1 max-w-lg mx-auto z-20">
          <form onSubmit={handleHeaderSearchSubmit} className="relative">
            <Search className="w-4 h-4 text-[#A7A0AA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={headerQuery}
              onFocus={() => setSuggestionsOpen(true)}
              onChange={(e) => {
                setHeaderQuery(e.target.value);
                setSuggestionsOpen(true);
              }}
              placeholder="Search anime, manga, characters..."
              aria-label="Search anime, manga, characters"
              className="w-full h-10 rounded-xl bg-[#141116] border border-white/10 focus:border-[#C0263D] pl-10 pr-8 text-xs sm:text-sm text-[#F5F1F2] placeholder:text-[#A7A0AA]/75 focus:outline-none transition-colors"
            />
            {headerQuery && (
              <button
                type="button"
                onClick={() => {
                  setHeaderQuery('');
                  setSuggestions({ manga: [], anime: [], authors: [], characters: [] });
                }}
                aria-label="Clear header search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 flex items-center justify-center text-[#A7A0AA] hover:text-white cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </form>

          {suggestionsOpen && headerQuery.trim().length >= 2 && (
            <div className="absolute left-0 right-0 top-12 rounded-2xl bg-[#141116] border border-white/12 shadow-[0_20px_50px_rgba(0,0,0,0.85)] overflow-hidden z-40">
              {suggestionsLoading ? (
                <div className="p-4 text-xs text-[#A7A0AA]">Searching KAGE &amp; INKVERSE...</div>
              ) : !hasAnySuggestion ? (
                <div className="p-4 text-xs text-[#A7A0AA] flex items-center justify-between">
                  <span>No instant match. Press Enter for full search.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setSuggestionsOpen(false);
                      navigate(`/search?q=${encodeURIComponent(headerQuery.trim())}`);
                    }}
                    className="text-[#C0263D] font-semibold cursor-pointer"
                  >
                    Search All →
                  </button>
                </div>
              ) : (
                <div className="max-h-[420px] overflow-y-auto divide-y divide-white/[0.06]">
                  {suggestions.manga.length > 0 && (
                    <div className="p-2.5 space-y-1">
                      <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-[#C0263D]">
                        Manga · INKVERSE
                      </p>
                      {suggestions.manga.map((m) => (
                        <button
                          key={`m-${m.id}`}
                          type="button"
                          onClick={() => {
                            setSuggestionsOpen(false);
                            navigate(`/inkverse/manga/${m.id}`);
                          }}
                          className="w-full px-2 py-1.5 rounded-lg hover:bg-white/[0.06] flex items-center gap-2.5 text-left cursor-pointer"
                        >
                          <div className="w-8 h-11 rounded bg-[#09080B] overflow-hidden shrink-0">
                            <KageImage
                              strictArtwork
                              src={m.coverImageUrl}
                              alt={m.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-[#F5F1F2] truncate">{m.title}</p>
                            <p className="text-[11px] text-[#A7A0AA] font-mono-num">
                              {m.format}
                              {m.releaseYear ? ` · ${m.releaseYear}` : ''}
                              {m.score ? ` · ★ ${m.score}` : ''}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {suggestions.anime.length > 0 && (
                    <div className="p-2.5 space-y-1">
                      <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-[#6D28D9]">
                        Anime · Realms
                      </p>
                      {suggestions.anime.map((a) => (
                        <button
                          key={`a-${a.malId}`}
                          type="button"
                          onClick={() => {
                            setSuggestionsOpen(false);
                            navigate(`/anime/${a.malId}`);
                          }}
                          className="w-full px-2 py-1.5 rounded-lg hover:bg-white/[0.06] flex items-center gap-2.5 text-left cursor-pointer"
                        >
                          <div className="w-8 h-11 rounded bg-[#09080B] overflow-hidden shrink-0">
                            <KageImage
                              strictArtwork
                              src={a.coverImageUrl}
                              alt={a.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-[#F5F1F2] truncate">{a.title}</p>
                            <p className="text-[11px] text-[#A7A0AA] font-mono-num">
                              {a.format || 'Anime'}
                              {a.releaseYear ? ` · ${a.releaseYear}` : ''}
                            </p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}

                  {suggestions.authors.length > 0 && (
                    <div className="p-2.5 space-y-1">
                      <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-[#A7A0AA]">
                        Mangaka &amp; Authors
                      </p>
                      {suggestions.authors.map((au, idx) => (
                        <button
                          key={`au-${au.id}-${idx}`}
                          type="button"
                          onClick={() => {
                            setSuggestionsOpen(false);
                            navigate(`/inkverse/browse?q=${encodeURIComponent(au.name)}`);
                          }}
                          className="w-full px-2 py-1.5 rounded-lg hover:bg-white/[0.06] flex items-center justify-between text-left text-xs text-[#F5F1F2] cursor-pointer"
                        >
                          <span className="font-medium truncate">{au.name}</span>
                          <span className="text-[11px] text-[#A7A0AA]">Browse works →</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {suggestions.characters.length > 0 && (
                    <div className="p-2.5 space-y-1">
                      <p className="px-2 text-[10px] font-bold uppercase tracking-wider text-[#A7A0AA]">
                        Characters
                      </p>
                      {suggestions.characters.map((ch) => (
                        <button
                          key={`ch-${ch.id}`}
                          type="button"
                          onClick={() => {
                            setSuggestionsOpen(false);
                            if (ch.animeMalId) {
                              navigate(`/anime/${ch.animeMalId}`);
                            } else {
                              navigate(`/search?q=${encodeURIComponent(ch.name)}`);
                            }
                          }}
                          className="w-full px-2 py-1.5 rounded-lg hover:bg-white/[0.06] flex items-center gap-2.5 text-left cursor-pointer"
                        >
                          <div className="w-7 h-7 rounded-full bg-[#09080B] overflow-hidden shrink-0">
                            <KageImage
                              strictArtwork
                              src={ch.avatarUrl}
                              alt={ch.name}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-[#F5F1F2] truncate">{ch.name}</p>
                            <p className="text-[11px] text-[#A7A0AA] truncate">{ch.animeTitle}</p>
                          </div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Gamepad (Clash) + Crown (Top Rated) + Notification Bell + User Profile Avatar */}
        <div className="relative z-10 flex items-center gap-0.5 sm:gap-1 shrink-0">
          <button
            type="button"
            onClick={() => navigate('/clash')}
            className="hidden sm:flex min-h-[44px] min-w-[40px] items-center justify-center rounded-xl text-[#F5F1F2]/85 hover:text-[#C0263D] hover:bg-white/[0.06] transition-colors cursor-pointer kage-press"
            aria-label="Arena & Clash"
            title="KAGE Clash Arena"
          >
            <Gamepad2 className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() =>
              navigate(
                location.pathname.startsWith('/inkverse')
                  ? '/inkverse/browse?sort=rating'
                  : '/realms/genre/top-rated'
              )
            }
            className="hidden sm:flex min-h-[44px] min-w-[40px] items-center justify-center rounded-xl text-[#F5F1F2]/85 hover:text-amber-400 hover:bg-white/[0.06] transition-colors cursor-pointer kage-press"
            aria-label="Top Rated Rankings"
            title="Top Rated Rankings"
          >
            <Crown className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={() => navigate(user ? '/notifications' : '/auth/login')}
            className="relative min-h-[44px] min-w-[42px] flex items-center justify-center rounded-xl text-[#F5F1F2]/90 hover:text-white hover:bg-white/5 transition-colors cursor-pointer kage-press"
            aria-label="Notifications"
          >
            <Bell className="w-5 h-5" />
            {unreadNotifications > 0 && (
              <span className="absolute top-2 right-1.5 min-w-[16px] h-[16px] px-1 rounded-full bg-[#C0263D] text-white text-[9px] font-mono-num font-bold flex items-center justify-center">
                {unreadNotifications > 9 ? '9+' : unreadNotifications}
              </span>
            )}
          </button>

          {user && profile ? (
            <Link
              to="/profile"
              className="min-h-[44px] min-w-[42px] flex items-center justify-center rounded-xl kage-press"
              aria-label="Your profile"
            >
              <div
                className={`w-8 h-8 rounded-full overflow-hidden bg-[#141116] ${
                  user.role === 'owner'
                    ? 'border-2 border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.35)]'
                    : 'border border-white/20'
                }`}
              >
                <KageImage
                  src={profile.avatarUrl}
                  alt={profile.displayName}
                  className="w-full h-full object-cover"
                />
              </div>
            </Link>
          ) : (
            <Link
              to="/auth/welcome"
              aria-label="Sign In to KAGE"
              className="min-h-[44px] min-w-[42px] flex items-center justify-center rounded-xl kage-press"
            >
              <div className="w-8 h-8 rounded-full flex items-center justify-center bg-[#141116] border border-white/20 text-[#A7A0AA] hover:text-white transition-colors" title="Guest (Sign in)">
                <User className="w-4 h-4" />
              </div>
            </Link>
          )}
        </div>
      </header>

      {/* Live Global Sovereign Owner Announcement Banner */}
      {latestAnnouncement && (
        <div className="bg-gradient-to-r from-amber-500/15 via-[#C0263D]/20 to-[#6D28D9]/20 border-b border-amber-400/35 px-3 sm:px-6 py-2.5">
          <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => {
                const dest = latestAnnouncement.linkUrl || '/notifications';
                dismissAnnouncement();
                navigate(dest);
              }}
              className="flex items-center gap-2.5 min-w-0 text-left cursor-pointer"
            >
              <Megaphone className="w-4 h-4 text-amber-400 shrink-0" />
              <div className="min-w-0">
                <p className="text-xs font-bold text-amber-200 truncate">
                  {latestAnnouncement.title}
                </p>
                <p className="text-[11px] text-[#F5F1F2]/85 truncate">
                  {latestAnnouncement.body}
                </p>
              </div>
            </button>
            <button
              type="button"
              onClick={dismissAnnouncement}
              className="min-h-[32px] min-w-[32px] flex items-center justify-center rounded-lg text-[#A7A0AA] hover:text-white shrink-0 cursor-pointer"
              aria-label="Dismiss announcement"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Navigation Sheet — Opens from Hamburger menu across all viewports (Mobile, Tablet & Laptop) */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Navigation menu">
          <div
            className="fixed inset-0 bg-black/75 backdrop-blur-sm"
            onClick={() => setDrawerOpen(false)}
          />
          <aside className="relative z-10 w-[85vw] max-w-[324px] h-full bg-[#09080B] border-r border-white/10 flex flex-col justify-between overflow-hidden rounded-r-2xl shadow-[24px_0_64px_rgba(0,0,0,0.9)] kage-drawer-enter">
            {/* Sheet Top Header: Centered KAGE — The Anime Universe + Explicit X Close Button */}
            <div className="relative px-4 py-3.5 border-b border-white/8 flex items-center justify-center min-h-[60px] shrink-0">
              <Link
                to="/"
                onClick={() => setDrawerOpen(false)}
                className="flex items-center justify-center kage-press"
                aria-label="KAGE Home"
              >
                <KageLogo size="sm" showSubtitle centered />
              </Link>
              <button
                type="button"
                onClick={() => setDrawerOpen(false)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl text-[#A7A0AA] hover:text-[#F5F1F2] hover:bg-white/5 cursor-pointer kage-press"
                aria-label="Close navigation menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Scrollable Body: User Identity Card + Categorized Full-Width Tap Rows */}
            <div className="flex-1 overflow-y-auto px-3.5 py-3.5 space-y-5">
              {/* Account / Identity Card */}
              {user && profile ? (
                <Link
                  to="/profile"
                  onClick={() => setDrawerOpen(false)}
                  className="p-3 rounded-2xl bg-[#141116] hover:bg-[#1C1720] border border-white/10 flex items-center justify-between gap-3 transition-colors kage-press"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-11 h-11 rounded-full overflow-hidden bg-[#09080B] shrink-0 ${
                        user.role === 'owner'
                          ? 'border-2 border-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.3)]'
                          : 'border border-white/15'
                      }`}
                    >
                      <KageImage
                        src={profile.avatarUrl}
                        alt={profile.displayName}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-bold text-[#F5F1F2] truncate">
                          {profile.displayName}
                        </span>
                        <OwnerBadge role={user.role} size="xs" />
                      </div>
                      <p className="text-xs text-[#A7A0AA] truncate mt-0.5">
                        @{user.username}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#A7A0AA] shrink-0" />
                </Link>
              ) : (
                <div className="p-3.5 rounded-2xl bg-[#141116] border border-white/10 space-y-2.5">
                  <div>
                    <p className="text-sm font-bold text-[#F5F1F2]">Welcome to KAGE</p>
                    <p className="text-xs text-[#A7A0AA] mt-0.5 leading-relaxed">
                      Sign in to save your watchlist, join guilds, and speak in live rooms.
                    </p>
                  </div>
                  <Link
                    to="/auth/welcome"
                    onClick={() => setDrawerOpen(false)}
                    className="w-full min-h-[44px] px-4 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors kage-press"
                  >
                    <LogIn className="w-4 h-4" />
                    <span>Sign In / Create Account</span>
                  </Link>
                </div>
              )}

              {isOwnerOrAdmin && (
                <Link
                  to="/admin"
                  onClick={() => setDrawerOpen(false)}
                  className="w-full min-h-[52px] px-3 py-2 rounded-xl bg-gradient-to-r from-amber-500/18 via-[#C0263D]/20 to-[#141116] border border-amber-400/45 flex items-center justify-between gap-3 kage-press"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-400/40 flex items-center justify-center shrink-0">
                      <Crown className="w-4 h-4 text-amber-400 fill-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-amber-200 truncate">Admin Command</p>
                      <p className="text-[11px] text-amber-200/75 truncate">
                        Moderation, roles &amp; announcements
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-amber-300 shrink-0" />
                </Link>
              )}

              {/* Section 1: Explore & Live */}
              <div className="space-y-1">
                <p className="px-2 pb-1 text-xs font-semibold text-[#A7A0AA]">
                  Explore &amp; Live
                </p>

                <Link
                  to="/voice"
                  onClick={() => setDrawerOpen(false)}
                  className={`w-full min-h-[52px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-3 transition-colors kage-press ${
                    location.pathname.startsWith('/voice')
                      ? 'bg-[#141116] border border-white/12'
                      : 'hover:bg-[#141116]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#141116] border border-white/10 flex items-center justify-center shrink-0">
                      <Mic className="w-4 h-4 text-[#C0263D]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#F5F1F2] truncate">
                        KAGE Live Rooms
                      </p>
                      <p className="text-[11px] text-[#A7A0AA] truncate">
                        12-speaker voice &amp; video stages
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#A7A0AA]/70 shrink-0" />
                </Link>

                <Link
                  to="/inkverse"
                  onClick={() => setDrawerOpen(false)}
                  className={`w-full min-h-[54px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-3 transition-all kage-press ${
                    location.pathname.startsWith('/inkverse')
                      ? 'bg-[#141116] border border-[#C0263D]/60 shadow-[0_0_20px_rgba(192,38,61,0.22)]'
                      : 'hover:bg-[#141116] border border-transparent hover:border-[#C0263D]/25'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 border ${
                        location.pathname.startsWith('/inkverse')
                          ? 'bg-[#C0263D]/20 border-[#C0263D]/60 shadow-[0_0_12px_rgba(192,38,61,0.3)]'
                          : 'bg-[#141116] border-[#C0263D]/30'
                      }`}
                    >
                      <BookOpen className="w-4 h-4 text-[#C0263D]" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-[#F5F1F2] truncate">
                          INKVERSE
                        </p>
                        <span className="px-1.5 py-0.5 rounded bg-[#C0263D] text-white text-[9px] font-bold tracking-wider uppercase shrink-0">
                          NEW
                        </span>
                      </div>
                      <p className="text-[11px] text-[#A7A0AA] truncate">
                        Discover manga, read chapters &amp; explore stories
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    className={`w-4 h-4 shrink-0 ${
                      location.pathname.startsWith('/inkverse')
                        ? 'text-[#C0263D]'
                        : 'text-[#A7A0AA]/70'
                    }`}
                  />
                </Link>

                <Link
                  to="/leaderboard"
                  onClick={() => setDrawerOpen(false)}
                  className={`w-full min-h-[52px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-3 transition-colors kage-press ${
                    location.pathname.startsWith('/leaderboard')
                      ? 'bg-[#141116] border border-[#C0263D]/45 shadow-[0_0_18px_rgba(192,38,61,0.18)]'
                      : 'hover:bg-[#141116]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#141116] border border-amber-400/30 flex items-center justify-center shrink-0">
                      <Trophy className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#F5F1F2] truncate">
                        Global Leaderboard
                      </p>
                      <p className="text-[11px] text-[#A7A0AA] truncate">
                        Top Clash hunters &amp; guild standings
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#A7A0AA]/70 shrink-0" />
                </Link>

                <Link
                  to="/filters"
                  onClick={() => setDrawerOpen(false)}
                  className={`w-full min-h-[52px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-3 transition-colors kage-press ${
                    location.pathname.startsWith('/filters')
                      ? 'bg-[#141116] border border-white/12'
                      : 'hover:bg-[#141116]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#141116] border border-white/10 flex items-center justify-center shrink-0">
                      <Filter className="w-4 h-4 text-[#6D28D9]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#F5F1F2] truncate">
                        Anime Filters
                      </p>
                      <p className="text-[11px] text-[#A7A0AA] truncate">
                        Browse 28 genres, themes &amp; years
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#A7A0AA]/70 shrink-0" />
                </Link>

                <Link
                  to="/realms/genre/upcoming"
                  onClick={() => setDrawerOpen(false)}
                  className={`w-full min-h-[52px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-3 transition-colors kage-press ${
                    location.pathname === '/realms/genre/upcoming'
                      ? 'bg-[#141116] border border-white/12'
                      : 'hover:bg-[#141116]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#141116] border border-white/10 flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4 text-[#C0263D]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#F5F1F2] truncate">
                        Upcoming Releases
                      </p>
                      <p className="text-[11px] text-[#A7A0AA] truncate">
                        Next season &amp; announced anime
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#A7A0AA]/70 shrink-0" />
                </Link>

                <Link
                  to="/realms/genre/top-rated"
                  onClick={() => setDrawerOpen(false)}
                  className={`w-full min-h-[52px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-3 transition-colors kage-press ${
                    location.pathname === '/realms/genre/top-rated'
                      ? 'bg-[#141116] border border-white/12'
                      : 'hover:bg-[#141116]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#141116] border border-white/10 flex items-center justify-center shrink-0">
                      <Star className="w-4 h-4 text-amber-400" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#F5F1F2] truncate">
                        Top Rated Anime
                      </p>
                      <p className="text-[11px] text-[#A7A0AA] truncate">
                        Highest-scored series &amp; films
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-[#A7A0AA]/70 shrink-0" />
                </Link>
              </div>

              {/* Section 2: Messages & Activity */}
              <div className="space-y-1 pt-1 border-t border-white/8">
                <p className="px-2 pt-2 pb-1 text-xs font-semibold text-[#A7A0AA]">
                  Messages &amp; Activity
                </p>

                <Link
                  to={user ? '/inbox' : '/auth/login?redirect=%2Finbox'}
                  onClick={() => setDrawerOpen(false)}
                  className={`w-full min-h-[52px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-3 transition-colors kage-press ${
                    location.pathname.startsWith('/inbox')
                      ? 'bg-[#141116] border border-white/12'
                      : 'hover:bg-[#141116]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#141116] border border-white/10 flex items-center justify-center shrink-0">
                      <Inbox className="w-4 h-4 text-[#F5F1F2]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#F5F1F2] truncate">Inbox</p>
                      <p className="text-[11px] text-[#A7A0AA] truncate">
                        Direct messages &amp; chat requests
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {unreadMessages > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#C0263D] text-white text-[11px] font-mono-num font-bold flex items-center justify-center">
                        {unreadMessages > 99 ? '99+' : unreadMessages}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-[#A7A0AA]/70" />
                  </div>
                </Link>

                <Link
                  to={user ? '/notifications' : '/auth/login?redirect=%2Fnotifications'}
                  onClick={() => setDrawerOpen(false)}
                  className={`w-full min-h-[52px] px-2.5 py-2 rounded-xl flex items-center justify-between gap-3 transition-colors kage-press ${
                    location.pathname.startsWith('/notifications')
                      ? 'bg-[#141116] border border-white/12'
                      : 'hover:bg-[#141116]'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[#141116] border border-white/10 flex items-center justify-center shrink-0">
                      <Bell className="w-4 h-4 text-[#F5F1F2]" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-[#F5F1F2] truncate">
                        Notifications
                      </p>
                      <p className="text-[11px] text-[#A7A0AA] truncate">
                        Replies, likes &amp; guild updates
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {unreadNotifications > 0 && (
                      <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#C0263D] text-white text-[11px] font-mono-num font-bold flex items-center justify-center">
                        {unreadNotifications > 99 ? '99+' : unreadNotifications}
                      </span>
                    )}
                    <ChevronRight className="w-4 h-4 text-[#A7A0AA]/70" />
                  </div>
                </Link>
              </div>
            </div>

            {/* Pinned Sheet Footer: Settings & Replay Intro */}
            <div className="p-3 border-t border-white/8 bg-[#09080B] space-y-1 shrink-0">
              <Link
                to="/settings"
                onClick={() => setDrawerOpen(false)}
                className={`w-full min-h-[46px] px-2.5 rounded-xl flex items-center justify-between gap-3 transition-colors kage-press ${
                  location.pathname.startsWith('/settings')
                    ? 'bg-[#141116] border border-white/12 text-[#F5F1F2]'
                    : 'text-[#F5F1F2] hover:bg-[#141116]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-[#141116] border border-white/10 flex items-center justify-center">
                    <Settings className="w-4 h-4 text-[#A7A0AA]" />
                  </span>
                  <span className="text-sm font-semibold">Settings</span>
                </span>
                <ChevronRight className="w-4 h-4 text-[#A7A0AA]/70" />
              </Link>

              <button
                type="button"
                onClick={() => {
                  setDrawerOpen(false);
                  onReplayIntro();
                }}
                className="w-full min-h-[44px] px-2.5 rounded-xl hover:bg-[#141116] flex items-center justify-between gap-3 text-[#A7A0AA] hover:text-[#F5F1F2] transition-colors cursor-pointer kage-press"
              >
                <span className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-[#141116] border border-white/10 flex items-center justify-center">
                    <Zap className="w-4 h-4 text-amber-400" />
                  </span>
                  <span className="text-xs font-medium">Replay Intro</span>
                </span>
              </button>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Container (Full Symmetric Width Across Mobile, Tablet & Laptop) */}
      <div
        className={`flex-1 w-full ${
          isInkverseReader ? 'max-w-none px-0 pt-0' : 'max-w-7xl mx-auto'
        } flex ${
          isInkverseReader
            ? 'px-0 pt-0'
            : isCommunityProfile || isVoiceActiveRoom || isCommunityChatRoom
              ? 'px-0 sm:px-6 pt-0 sm:pt-3'
              : 'px-3 sm:px-6 pt-3'
        } ${hideBottomNav ? (isInkverseReader ? 'pb-0' : 'pb-6') : 'pb-24'}`}
      >
        <main key={location.pathname} className="flex-1 min-w-0 kage-page-enter">
          {children}
        </main>
      </div>

      {/* Fixed Bottom Navigation Anchor — 4 Tabs: Realms / Pulse / Guilds / Clash */}
      {!hideBottomNav && (
        <nav
          className="fixed bottom-0 left-0 right-0 z-30 bg-[#09080B]/90 backdrop-blur-xl border-t border-white/[0.08] grid grid-cols-4 items-center h-14 sm:h-16 pb-safe shadow-[0_-10px_30px_rgba(0,0,0,0.65)]"
          aria-label="Primary navigation"
        >
          {bottomTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.to === '/'}
                className={({ isActive }) => {
                  const active = tab.activeOverride || isActive;
                  return `min-h-[48px] flex flex-col items-center justify-center gap-0.5 kage-press relative whitespace-nowrap shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#C0263D] ${
                    active ? 'text-[#F5F1F2]' : 'text-[#A7A0AA] hover:text-[#D8D2DC]'
                  }`;
                }}
              >
                {({ isActive }) => {
                  const active = tab.activeOverride || isActive;
                  return (
                    <>
                      <Icon
                        className={`w-5 h-5 transition-transform duration-150 ${
                          active ? 'text-[#C0263D] -translate-y-0.5' : 'text-current'
                        }`}
                      />
                      <span
                        className={`text-[11px] font-semibold tracking-tight transition-colors ${
                          active ? 'text-[#F5F1F2]' : 'text-current'
                        }`}
                      >
                        {tab.label}
                      </span>
                      {active && (
                        <span className="absolute top-0 w-10 h-[2px] rounded-b-full bg-[#C0263D]" />
                      )}
                    </>
                  );
                }}
              </NavLink>
            );
          })}
        </nav>
      )}
    </div>
  );
};
