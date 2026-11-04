import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  BadgeCheck,
  BarChart2,
  Bookmark,
  Calendar,
  Check,
  ChevronRight,
  Eye,
  Film,
  Flag,
  Globe,
  Hash,
  Heart,
  Image as ImageIcon,
  Lock,
  Mail,
  MessageSquare,
  Mic,
  MoreHorizontal,
  Pin,
  Plus,
  Reply,
  Search,
  Send,
  Settings,
  Share2,
  Shield,
  Smile,
  Sparkles,
  Trash2,
  Upload,
  UserCheck,
  UserPlus,
  UserX,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { KageImage } from '../components/KageImage';
import { OwnerBadge } from '../components/KageBrand';
import { ReportModal } from '../components/ReportModal';
import { KageModal } from '../components/KageModal';
import { kageSound } from '../lib/soundEngine';
import { PRESET_BANNERS } from '../lib/assets';
import { ALL_GENRE_NAMES } from '../lib/genres';
import { formatCompactNumber } from '../lib/formatters';

interface GuildItem {
  id: number;
  slug: string;
  name: string;
  tagline?: string;
  description: string;
  category?: string;
  rules?: string;
  isVerified?: boolean;
  chatBannerUrl?: string;
  createdAt?: string;
  onlineCount?: number;
  privacyMode: 'public' | 'private';
  joinPolicy: 'open' | 'approval' | 'invite_only';
  isArchived?: boolean;
  artworkUrl: string;
  bannerUrl: string;
  animeMalId?: number | null;
  animeTitle?: string | null;
  genreTags: string[];
  memberCount: number;
  humanMemberCount?: number;
  demoMemberCount?: number;
  isAiDemo?: boolean;
  discussionCount: number;
  isMember: boolean;
  memberRole: string | null;
  hasPendingRequest?: boolean;
  pendingInviteId?: number | null;
}

interface PendingGuildInviteItem {
  id: number;
  communityId: number;
  note: string;
  createdAt: string;
  expiresAt?: string | null;
  guildName: string;
  guildSlug: string;
  guildArtworkUrl: string;
  inviterUsername: string;
  inviterDisplayName: string;
}

interface VoiceRoomPreview {
  id: number;
  title: string;
  topic: string;
  artworkUrl: string;
  communityName?: string | null;
  capacity: number;
  participantCount: number;
  participants: {
    uid: string;
    displayName: string;
    avatarUrl: string;
  }[];
}

interface GuildMemberRow {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  role: 'owner' | 'admin' | 'moderator' | 'member';
  isMuted?: boolean;
  mutedUntil?: string | null;
  userRole?: string;
  isAiDemo?: boolean;
  joinedAt?: string;
}

interface GuildDetail extends GuildItem {
  isBanned?: boolean;
  canViewContent: boolean;
  permissions: {
    canModerate: boolean;
    canManageRoles: boolean;
    canEditSettings: boolean;
    canManageOwnership: boolean;
  };
  pendingInvite?: {
    id: number;
    note?: string;
  } | null;
  members: GuildMemberRow[];
  joinRequests: {
    id: number;
    userUid: string;
    note: string;
    createdAt: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  }[];
  outgoingInvites: {
    id: number;
    inviteeUid: string;
    note: string;
    createdAt: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  }[];
  bannedMembers: {
    id: number;
    userUid: string;
    reason: string;
    createdAt: string;
    username: string;
    displayName: string;
    avatarUrl: string;
  }[];
  chatRooms?: CommunityChatRoomItem[];
  events?: CommunityEventItem[];
  voiceChannels?: VoiceRoomPreview[];
}

interface CommunityChatRoomItem {
  id: number;
  communityId: number;
  slug: string;
  name: string;
  description: string;
  isSpoiler: boolean;
  postingRole: 'member' | 'moderator';
  sortOrder: number;
  messageCount: number;
  onlineCount?: number;
  lastMessageAt?: string | null;
}

interface CommunityEventItem {
  id: number;
  communityId: number;
  title: string;
  description: string;
  bannerUrl: string;
  startsAt: string;
  endsAt?: string | null;
  locationLabel: string;
  goingCount: number;
  interestedCount?: number;
  viewerRsvp?: 'going' | 'interested' | null;
}

interface ModerationLogRow {
  id: number;
  actionType: string;
  reason?: string | null;
  createdAt: string;
  actorUid?: string | null;
  targetUid?: string | null;
  actorUsername?: string | null;
  actorDisplayName?: string | null;
}

const GUILD_CATEGORIES = [
  'Anime Franchise',
  'Shonen & Action',
  'Theory & Lore',
  'AMV & Anime Edits',
  'Manga Readers',
  'Watch Parties',
];

function readFileAsDataUrl(file: File, maxBytes: number): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(
        new Error(
          `File exceeds maximum size of ${Math.round(maxBytes / (1024 * 1024))} MB.`
        )
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Failed to read media file.'));
    reader.readAsDataURL(file);
  });
}

function formatGuildPolicyMeta(guild: Pick<GuildItem, 'privacyMode' | 'joinPolicy'>): string {
  const privacy = guild.privacyMode === 'private' ? 'Private' : 'Public';
  const policy =
    guild.joinPolicy === 'invite_only'
      ? 'Invite Only'
      : guild.joinPolicy === 'approval'
        ? 'Approval Required'
        : 'Open Join';
  return `${privacy} · ${policy}`;
}

export const GuildsPage: React.FC = () => {
  const { user, bumpTasteRevision, subscribeWs } = useAuth();
  const navigate = useNavigate();

  const [guilds, setGuilds] = useState<GuildItem[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [myInvites, setMyInvites] = useState<PendingGuildInviteItem[]>([]);
  const [voiceRooms, setVoiceRooms] = useState<VoiceRoomPreview[]>([]);

  const [search, setSearch] = useState('');
  const [scopeFilter, setScopeFilter] = useState<'all' | 'joined' | 'public' | 'private'>('all');
  const [genreFilter, setGenreFilter] = useState('');
  const [sort, setSort] = useState<'popular' | 'newest'>('popular');
  const [loading, setLoading] = useState(true);
  const [busyGuildId, setBusyGuildId] = useState<number | null>(null);
  const [pageFeedback, setPageFeedback] = useState('');

  // Forge Guild Modal
  const [forgeOpen, setForgeOpen] = useState(false);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState(GUILD_CATEGORIES[0]);
  const [rules, setRules] = useState(
    '1. Tag major manga and anime spoilers.\n2. Treat fellow hunters with respect.\n3. Keep discussions relevant to our guild focus.'
  );
  const [privacyMode, setPrivacyMode] = useState<'public' | 'private'>('public');
  const [joinPolicy, setJoinPolicy] = useState<'open' | 'approval' | 'invite_only'>('open');
  const [artworkUrl, setArtworkUrl] = useState('asset:shadow_monarch');
  const [iconDataUrl, setIconDataUrl] = useState('');
  const [iconFileName, setIconFileName] = useState('');
  const [bannerDataUrl, setBannerDataUrl] = useState('');
  const [bannerFileName, setBannerFileName] = useState('');
  const [genreTags, setGenreTags] = useState<string[]>(['Action']);
  const [forging, setForging] = useState(false);
  const [forgeError, setForgeError] = useState('');
  const [filtersExpanded, setFiltersExpanded] = useState(false);

  const loadData = useCallback(
    async (resetOffset = true) => {
      if (resetOffset) setLoading(true);
      else setLoadingMore(true);

      try {
        const nextOffset = resetOffset ? 0 : guilds.length;
        const params = new URLSearchParams({
          q: search.trim(),
          sort,
          limit: '24',
          offset: String(nextOffset),
        });
        if (scopeFilter === 'joined') params.set('joined', 'true');
        if (scopeFilter === 'public') params.set('privacyMode', 'public');
        if (scopeFilter === 'private') params.set('privacyMode', 'private');
        if (genreFilter) params.set('genre', genreFilter);

        const [gRes, vRes, invRes] = await Promise.all([
          apiFetch<{ items: GuildItem[]; hasMore: boolean }>(
            `/api/communities?${params.toString()}`
          ),
          resetOffset
            ? apiFetch<{ items: VoiceRoomPreview[] }>(
                `/api/voice-rooms?q=${encodeURIComponent(search.trim())}`
              )
            : Promise.resolve(null),
          user && resetOffset
            ? apiFetch<{ invites: PendingGuildInviteItem[] }>('/api/me/guild-invites').catch(
                () => ({ invites: [] })
              )
            : Promise.resolve(null),
        ]);

        if (resetOffset) {
          setGuilds(gRes.items || []);
          if (vRes) setVoiceRooms(vRes.items || []);
          if (invRes) setMyInvites(invRes.invites || []);
        } else {
          setGuilds((prev) => {
            const seen = new Set(prev.map((item) => item.id));
            const next = [...prev];
            for (const item of gRes.items || []) {
              if (!seen.has(item.id)) next.push(item);
            }
            return next;
          });
        }
        setHasMore(Boolean(gRes.hasMore));
      } catch (err) {
        console.error('Failed to load guilds:', err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [search, sort, scopeFilter, genreFilter, user, guilds.length]
  );

  useEffect(() => {
    const t = setTimeout(() => {
      loadData(true);
    }, 180);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, sort, scopeFilter, genreFilter, user?.uid]);

  // Live participant counts from WebSocket
  useEffect(() => {
    return subscribeWs((msg) => {
      if (msg.type === 'voice:room-summary' && msg.roomId) {
        setVoiceRooms((prev) =>
          prev.map((r) =>
            r.id === msg.roomId ? { ...r, participantCount: msg.participantCount } : r
          )
        );
      }
    });
  }, [subscribeWs]);

  const handleRespondDirectInvite = async (
    invite: PendingGuildInviteItem,
    action: 'accept' | 'decline'
  ) => {
    try {
      await apiFetch(`/api/guild-invites/${invite.id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      setMyInvites((prev) => prev.filter((item) => item.id !== invite.id));
      bumpTasteRevision();
      if (action === 'accept') {
        kageSound.play('guild_join');
        navigate(`/guilds/${invite.guildSlug}`);
      } else {
        await loadData(true);
      }
    } catch (err: any) {
      setPageFeedback(err.message || 'Could not respond to invitation.');
    }
  };

  const handleToggleMembership = async (guild: GuildItem) => {
    if (!user) {
      navigate('/auth/login');
      return;
    }
    setPageFeedback('');
    setBusyGuildId(guild.id);
    try {
      const action = guild.isMember
        ? 'leave'
        : guild.hasPendingRequest
          ? 'cancel_request'
          : 'join';
      const res = await apiFetch<any>(`/api/communities/${guild.id}/membership`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      if (!guild.isMember && res.isMember) {
        kageSound.play('guild_join');
      }
      setGuilds((prev) =>
        prev.map((g) =>
          g.id === guild.id
            ? {
                ...g,
                isMember: Boolean(res.isMember),
                hasPendingRequest: Boolean(res.hasPendingRequest),
                pendingInviteId: res.isMember ? null : g.pendingInviteId,
                memberCount:
                  typeof res.memberCount === 'number' ? res.memberCount : g.memberCount,
                discussionCount:
                  typeof res.discussionCount === 'number'
                    ? res.discussionCount
                    : g.discussionCount,
              }
            : g
        )
      );
      bumpTasteRevision();
    } catch (err: any) {
      setPageFeedback(err.message || 'Membership action failed.');
    } finally {
      setBusyGuildId(null);
    }
  };

  const handlePickImage = async (
    e: React.ChangeEvent<HTMLInputElement>,
    kind: 'icon' | 'banner'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setForgeError('');
    try {
      const dataUrl = await readFileAsDataUrl(file, 8 * 1024 * 1024);
      if (kind === 'icon') {
        setIconDataUrl(dataUrl);
        setIconFileName(file.name);
      } else {
        setBannerDataUrl(dataUrl);
        setBannerFileName(file.name);
      }
    } catch (err: any) {
      setForgeError(err.message || 'Failed to read image.');
    }
  };

  const handleForgeGuild = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate('/auth/login');
      return;
    }
    setForging(true);
    setForgeError('');
    try {
      const effectiveJoinPolicy =
        privacyMode === 'private' && joinPolicy === 'open' ? 'approval' : joinPolicy;
      const res = await apiFetch<{ community: GuildItem }>('/api/communities', {
        method: 'POST',
        body: JSON.stringify({
          name,
          description,
          category,
          rules,
          privacyMode,
          joinPolicy: effectiveJoinPolicy,
          artworkUrl,
          iconDataUrl: iconDataUrl || undefined,
          bannerDataUrl: bannerDataUrl || undefined,
          genreTags,
        }),
      });
      kageSound.play('guild_level_up');
      setForgeOpen(false);
      setName('');
      setDescription('');
      setIconDataUrl('');
      setIconFileName('');
      setBannerDataUrl('');
      setBannerFileName('');
      bumpTasteRevision();
      navigate(`/guilds/${res.community.slug}`);
    } catch (err: any) {
      setForgeError(err.message || 'Could not forge guild.');
    } finally {
      setForging(false);
    }
  };

  const hasActiveGuildFilter = Boolean(
    search.trim() || genreFilter || scopeFilter !== 'all' || sort !== 'popular'
  );

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <div className="flex items-start justify-between gap-3 pt-1">
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wider text-[#F5F1F2]">
              GUILDS
            </h1>
            <p className="text-xs sm:text-sm text-[#A7A0AA] mt-0.5 max-w-md">
              Connect with fans, share theories, and build your anime community.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setFiltersExpanded((v) => !v)}
              aria-label="Search and filter guilds"
              className={`min-h-[42px] min-w-[42px] px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                filtersExpanded || hasActiveGuildFilter
                  ? 'bg-[#141116] border-[#6D28D9] text-[#F5F1F2]'
                  : 'bg-[#141116] border-white/12 text-[#A7A0AA] hover:text-[#F5F1F2]'
              }`}
            >
              <Search className="w-4 h-4" />
              <span className="hidden sm:inline">Search</span>
            </button>

            <button
              type="button"
              onClick={() => (user ? setForgeOpen(true) : navigate('/auth/login'))}
              className="min-h-[42px] px-4 py-2 rounded-xl bg-[#6D28D9] hover:bg-[#7c3aed] text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Forge Guild</span>
            </button>
          </div>
        </div>

        {/* Direct Guild Invitations Banner */}
        {myInvites.length > 0 && (
          <div className="rounded-2xl bg-[#141116] border border-[#6D28D9]/45 p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold text-[#F5F1F2]">
              <Mail className="w-4 h-4 text-[#6D28D9]" />
              <span>Pending Guild Invitations ({myInvites.length})</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {myInvites.map((inv) => (
                <div
                  key={inv.id}
                  className="rounded-xl bg-[#09080B] border border-white/10 p-3 flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <KageImage
                      src={inv.guildArtworkUrl}
                      alt={inv.guildName}
                      className="w-10 h-10 rounded-lg object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <Link
                        to={`/guilds/${inv.guildSlug}`}
                        className="text-xs font-bold text-[#F5F1F2] hover:text-[#6D28D9] truncate block"
                      >
                        {inv.guildName}
                      </Link>
                      <p className="text-[11px] text-[#A7A0AA] truncate">
                        Invited by @{inv.inviterUsername}
                        {inv.note ? ` · "${inv.note}"` : ''}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleRespondDirectInvite(inv, 'decline')}
                      className="min-h-[34px] px-2.5 rounded-lg bg-[#141116] border border-white/10 text-xs text-[#A7A0AA] hover:text-white cursor-pointer"
                    >
                      Decline
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRespondDirectInvite(inv, 'accept')}
                      className="min-h-[34px] px-3 rounded-lg bg-[#6D28D9] hover:bg-[#7c3aed] text-xs font-semibold text-white cursor-pointer"
                    >
                      Accept
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collapsible Search, Scope & Sort Controls */}
        {(filtersExpanded || hasActiveGuildFilter) && (
          <div className="space-y-2.5 p-3.5 rounded-2xl bg-[#141116]/75 border border-white/10">
            <div className="flex flex-col sm:flex-row gap-2.5">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-[#A7A0AA] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search guilds or live voice rooms..."
                  className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 pl-10 pr-4 text-sm text-[#F5F1F2] focus:outline-none focus:border-[#6D28D9]"
                />
              </div>

              <select
                value={genreFilter}
                onChange={(e) => setGenreFilter(e.target.value)}
                className="min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2]"
              >
                <option value="">All Genres</option>
                {ALL_GENRE_NAMES.map((g) => (
                  <option key={g} value={g}>
                    {g}
                  </option>
                ))}
              </select>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => setSort('popular')}
                  className={`min-h-[42px] px-3.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                    sort === 'popular'
                      ? 'bg-[#141116] border-[#6D28D9] text-[#F5F1F2]'
                      : 'bg-[#09080B] border-white/10 text-[#A7A0AA]'
                  }`}
                >
                  Most Active
                </button>
                <button
                  type="button"
                  onClick={() => setSort('newest')}
                  className={`min-h-[42px] px-3.5 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                    sort === 'newest'
                      ? 'bg-[#141116] border-[#6D28D9] text-[#F5F1F2]'
                      : 'bg-[#09080B] border-white/10 text-[#A7A0AA]'
                  }`}
                >
                  Newest
                </button>
              </div>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
              {(
                [
                  { key: 'all', label: 'All Guilds' },
                  ...(user ? [{ key: 'joined', label: 'My Guilds' }] : []),
                  { key: 'public', label: 'Public' },
                  { key: 'private', label: 'Private' },
                ] as { key: 'all' | 'joined' | 'public' | 'private'; label: string }[]
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  onClick={() => setScopeFilter(f.key)}
                  className={`min-h-[34px] px-3 rounded-xl text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                    scopeFilter === f.key
                      ? 'bg-[#6D28D9] text-white'
                      : 'bg-[#09080B] border border-white/10 text-[#A7A0AA] hover:text-white'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {pageFeedback && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3.5 py-2.5 flex items-center justify-between text-xs text-rose-300">
            <span>{pageFeedback}</span>
            <button
              type="button"
              onClick={() => setPageFeedback('')}
              className="text-rose-200 hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Guild Cards List — Matching KAGE Horizontal Guild Card Layout */}
        {loading ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
            {Array.from({ length: 4 }).map((_, idx) => (
              <div key={idx} className="h-28 rounded-2xl bg-[#141116] animate-pulse" />
            ))}
          </div>
        ) : guilds.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#141116] border border-white/8 text-center space-y-2">
            <p className="text-sm font-semibold text-[#F5F1F2]">No matching Guilds found</p>
            <p className="text-xs text-[#A7A0AA]">
              Forge a new Guild to unite hunters around your favorite series.
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
              {guilds.map((guild) => {
                const isInviteOnlyBlocked =
                  !guild.isMember &&
                  !guild.pendingInviteId &&
                  guild.joinPolicy === 'invite_only';

                let ctaLabel = 'Join Guild';
                if (guild.isMember) ctaLabel = 'Enter Guild';
                else if (guild.pendingInviteId) ctaLabel = 'Accept Invite';
                else if (guild.hasPendingRequest) ctaLabel = 'Requested';
                else if (guild.joinPolicy === 'invite_only') ctaLabel = 'Invite Only';
                else if (guild.joinPolicy === 'approval' || guild.privacyMode === 'private')
                  ctaLabel = 'Request';

                return (
                  <div
                    key={guild.id}
                    className="rounded-2xl bg-[#141116] border border-white/10 p-3 sm:p-3.5 flex items-center gap-3.5 hover:border-white/20 transition-colors"
                  >
                    <Link
                      to={`/guilds/${guild.slug}`}
                      className="w-20 h-20 sm:w-24 sm:h-24 rounded-xl overflow-hidden shrink-0 bg-[#09080B] border border-white/10"
                    >
                      <KageImage
                        src={guild.artworkUrl}
                        alt={guild.name}
                        className="w-full h-full object-cover"
                      />
                    </Link>

                    <Link
                      to={`/guilds/${guild.slug}`}
                      className="flex-1 min-w-0 space-y-1 group"
                    >
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm sm:text-base font-bold tracking-wide text-[#F5F1F2] group-hover:text-white truncate">
                          {guild.name}
                        </span>
                        {guild.isVerified && (
                          <BadgeCheck className="w-4 h-4 text-[#7C3AED] fill-[#7C3AED]/20 shrink-0" />
                        )}
                        {guild.privacyMode === 'private' && (
                          <Lock className="w-3 h-3 text-[#A7A0AA] shrink-0" />
                        )}
                      </div>
                      <p className="text-xs text-[#A7A0AA] line-clamp-2 leading-snug">
                        {guild.tagline || guild.description}
                      </p>
                      <p className="text-[11px] text-[#A7A0AA] font-mono-num pt-0.5">
                        {formatCompactNumber(guild.memberCount)}{' '}
                        {guild.memberCount === 1 ? 'member' : 'members'} ·{' '}
                        {formatCompactNumber(guild.discussionCount)}{' '}
                        {guild.discussionCount === 1 ? 'discussion' : 'discussions'}
                      </p>
                    </Link>

                    <div className="shrink-0">
                      {guild.isMember ? (
                        <Link
                          to={`/guilds/${guild.slug}`}
                          className="min-h-[38px] px-3.5 rounded-xl bg-[#09080B] border border-white/15 hover:border-[#6D28D9] text-xs font-semibold text-[#F5F1F2] inline-flex items-center justify-center whitespace-nowrap transition-colors"
                        >
                          Enter Guild
                        </Link>
                      ) : (
                        <button
                          type="button"
                          disabled={busyGuildId === guild.id || isInviteOnlyBlocked}
                          onClick={() => handleToggleMembership(guild)}
                          className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                            isInviteOnlyBlocked
                              ? 'bg-[#09080B] border border-white/10 text-[#A7A0AA] opacity-60 cursor-not-allowed'
                              : guild.hasPendingRequest
                                ? 'bg-[#09080B] border border-white/15 text-[#F5F1F2] hover:border-rose-500/50 cursor-pointer'
                                : 'bg-[#C0263D] hover:bg-[#d42b44] text-white cursor-pointer'
                          }`}
                        >
                          {ctaLabel}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {hasMore && (
              <div className="flex justify-center pt-2">
                <button
                  type="button"
                  disabled={loadingMore}
                  onClick={() => loadData(false)}
                  className="min-h-[42px] px-6 rounded-xl bg-[#141116] border border-white/12 hover:border-[#6D28D9] text-xs font-semibold text-[#F5F1F2] cursor-pointer"
                >
                  {loadingMore ? 'Loading Guilds...' : 'Load More Guilds'}
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* KAGE LIVE Standalone Voice & Video Rooms Section */}
      <section className="space-y-4 pt-2 border-t border-white/8">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-xl sm:text-2xl font-bold tracking-wider text-[#F5F1F2]">
              KAGE LIVE
            </h2>
            <p className="text-xs sm:text-sm text-[#A7A0AA] mt-0.5">
              Your Anime World, Unmuted.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/voice?create=1"
              className="min-h-[38px] px-3.5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Start Room</span>
            </Link>
            <Link
              to="/voice"
              className="min-h-[38px] px-3 rounded-xl bg-[#141116] border border-white/12 text-xs font-semibold text-[#F5F1F2] hover:border-[#6D28D9] inline-flex items-center gap-1.5 whitespace-nowrap"
            >
              <span>All Rooms</span>
            </Link>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {voiceRooms.map((room: any) => {
            const activeCount = Number(room.participantCount || 0);
            return (
              <div
                key={room.id}
                onClick={() => navigate(`/voice/${room.id}`)}
                className="group/live relative rounded-2xl overflow-hidden bg-[#141116] border border-white/12 hover:border-[#C0263D]/55 min-h-[168px] flex flex-col justify-between p-4 sm:p-5 cursor-pointer kage-press"
              >
                <KageImage
                  src={room.bannerUrl || room.artworkUrl}
                  alt={room.title}
                  className="absolute inset-0 w-full h-full object-cover opacity-55 group-hover/live:scale-[1.03] transition-transform duration-200"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#09080B] via-[#09080B]/70 to-black/30" />

                <div className="relative z-10 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-semibold text-[#F5F1F2]/85">
                    {room.category || 'Anime Vibes'}
                    {room.mediaMode === 'video' ? ' · Video Room' : ''}
                  </span>
                  <span className="px-2.5 py-1 rounded-full bg-black/65 backdrop-blur-sm border border-white/12 text-[11px] font-semibold text-[#F5F1F2] inline-flex items-center gap-1.5 font-mono-num">
                    {activeCount > 0 ? (
                      <>
                        <span className="inline-flex items-end gap-0.5 h-3" aria-hidden="true">
                          <span className="w-0.5 h-3 bg-[#C0263D] rounded-full kage-eq-bar-1" />
                          <span className="w-0.5 h-3 bg-[#6D28D9] rounded-full kage-eq-bar-2" />
                          <span className="w-0.5 h-3 bg-[#C0263D] rounded-full kage-eq-bar-3" />
                        </span>
                        <span>Live {activeCount}</span>
                      </>
                    ) : (
                      <span className="text-[#A7A0AA]">Open · 0</span>
                    )}
                  </span>
                </div>

                <div className="relative z-10 flex items-end justify-between gap-3 pt-6">
                  <div className="min-w-0 space-y-2">
                    <h3 className="text-base sm:text-lg font-bold text-[#F5F1F2] group-hover/live:text-white uppercase tracking-wide line-clamp-1">
                      {room.title}
                    </h3>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center -space-x-2">
                        {(room.participants || []).slice(0, 4).map((p: any) => (
                          <div
                            key={p.uid}
                            className="w-7 h-7 rounded-full overflow-hidden border border-[#09080B] bg-[#141116]"
                            title={p.displayName}
                          >
                            <KageImage
                              src={p.avatarUrl}
                              alt={p.displayName}
                              className="w-full h-full object-cover"
                            />
                          </div>
                        ))}
                      </div>
                      {(room.participants || []).length === 0 && (
                        <span className="text-[11px] text-[#A7A0AA]">
                          Open standalone lounge · 12 speaker seats
                        </span>
                      )}
                    </div>
                  </div>

                  <Link
                    to={`/voice/${room.id}`}
                    onClick={(e) => e.stopPropagation()}
                    className="min-h-[38px] px-4 py-2 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-semibold flex items-center gap-1.5 kage-press whitespace-nowrap shrink-0"
                  >
                    <span>Enter Room</span>
                  </Link>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Forge Guild Modal */}
      <KageModal
        isOpen={forgeOpen}
        onClose={() => setForgeOpen(false)}
        title="Forge a New Guild"
        maxWidthClass="max-w-lg"
        tallForm
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setForgeOpen(false)}
              className="min-h-[44px] px-4 rounded-xl bg-[#09080B] border border-white/10 text-xs text-[#A7A0AA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="forge-guild-form"
              disabled={forging}
              className="min-h-[44px] px-5 rounded-xl bg-[#6D28D9] hover:bg-[#7c3aed] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
            >
              {forging ? 'Forging...' : 'Create Guild'}
            </button>
          </div>
        }
      >
        <form id="forge-guild-form" onSubmit={handleForgeGuild} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                    Guild Name (Unique)
                  </label>
                  <input
                    type="text"
                    required
                    minLength={3}
                    maxLength={60}
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g., CRIMSON HASHIRA CORPS"
                    className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 px-3.5 text-sm text-[#F5F1F2] focus:outline-none focus:border-[#6D28D9]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                    Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs sm:text-sm text-[#F5F1F2]"
                  >
                    {GUILD_CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                  Guild Creed &amp; Description
                </label>
                <textarea
                  rows={2}
                  required
                  minLength={10}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe what theories, series, or watch-parties your Guild hosts..."
                  className="w-full rounded-xl bg-[#09080B] border border-white/10 p-3 text-sm text-[#F5F1F2] focus:outline-none focus:border-[#6D28D9]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                    Visibility
                  </label>
                  <select
                    value={privacyMode}
                    onChange={(e) => {
                      const next = e.target.value as 'public' | 'private';
                      setPrivacyMode(next);
                      if (next === 'private' && joinPolicy === 'open') {
                        setJoinPolicy('approval');
                      }
                    }}
                    className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                  >
                    <option value="public">Public (Anyone can view feed)</option>
                    <option value="private">Private (Members-only feed &amp; roster)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                    Join Policy
                  </label>
                  <select
                    value={joinPolicy}
                    onChange={(e) =>
                      setJoinPolicy(e.target.value as 'open' | 'approval' | 'invite_only')
                    }
                    className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                  >
                    {privacyMode === 'public' && (
                      <option value="open">Open Join (Instant entry)</option>
                    )}
                    <option value="approval">Approval Required (Request to join)</option>
                    <option value="invite_only">Invite Only (Direct guild invite)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                  Guild Rules
                </label>
                <textarea
                  rows={2}
                  value={rules}
                  onChange={(e) => setRules(e.target.value)}
                  className="w-full rounded-xl bg-[#09080B] border border-white/10 p-3 text-xs text-[#F5F1F2]"
                />
              </div>

              {/* Custom Icon & Banner Upload or Preset */}
              <div className="space-y-2">
                <label className="block text-xs font-medium text-[#A7A0AA]">
                  Guild Emblem &amp; Banner
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="min-h-[40px] rounded-xl bg-[#09080B] border border-dashed border-white/20 hover:border-[#6D28D9] px-3 flex items-center gap-2 text-xs text-[#A7A0AA] cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-[#6D28D9] shrink-0" />
                    <span className="truncate">{iconFileName || 'Upload custom icon...'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={(e) => handlePickImage(e, 'icon')}
                      className="hidden"
                    />
                  </label>
                  <label className="min-h-[40px] rounded-xl bg-[#09080B] border border-dashed border-white/20 hover:border-[#6D28D9] px-3 flex items-center gap-2 text-xs text-[#A7A0AA] cursor-pointer">
                    <ImageIcon className="w-3.5 h-3.5 text-[#C0263D] shrink-0" />
                    <span className="truncate">{bannerFileName || 'Upload custom banner...'}</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      onChange={(e) => handlePickImage(e, 'banner')}
                      className="hidden"
                    />
                  </label>
                </div>

                {!iconDataUrl && (
                  <div className="grid grid-cols-2 gap-2 pt-1">
                    {PRESET_BANNERS.map((b) => (
                      <button
                        key={b.key}
                        type="button"
                        onClick={() => setArtworkUrl(b.key)}
                        className={`p-2 rounded-xl border text-left text-xs flex items-center gap-2 cursor-pointer ${
                          artworkUrl === b.key
                            ? 'border-[#6D28D9] bg-[#6D28D9]/15 text-white'
                            : 'border-white/10 bg-[#09080B] text-[#A7A0AA]'
                        }`}
                      >
                        <img
                          src={b.url}
                          alt={b.label}
                          className="w-7 h-7 rounded-lg object-cover shrink-0"
                        />
                        <span className="truncate font-medium">{b.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A7A0AA] mb-1.5">
                  Primary Genres
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1">
                  {ALL_GENRE_NAMES.map((g) => {
                    const selected = genreTags.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() =>
                          setGenreTags((prev) =>
                            prev.includes(g)
                              ? prev.filter((item) => item !== g)
                              : [...prev.slice(0, 5), g]
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs border cursor-pointer ${
                          selected
                            ? 'bg-[#6D28D9]/25 border-[#6D28D9] text-white'
                            : 'bg-[#09080B] border-white/10 text-[#A7A0AA]'
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              {forgeError && <p className="text-xs text-rose-400">{forgeError}</p>}
        </form>
      </KageModal>
    </div>
  );
};

const CHAT_ROOM_REACTIONS = ['🔥', '❤️', '😂', '👑', '⚡', '👏'];

function formatCompactCount(n?: number | null): string {
  return formatCompactNumber(n);
}

function formatCommunityPostTime(iso?: string): string {
  if (!iso) return '';
  const diffMins = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  const hrs = Math.floor(diffMins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export const GuildDetailPage: React.FC = () => {
  const { slug = '' } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user, bumpTasteRevision } = useAuth();

  const initialTabParam = searchParams.get('tab');
  const [guild, setGuild] = useState<GuildDetail | null>(null);
  const [discussions, setDiscussions] = useState<any[]>([]);
  const [sort, setSort] = useState<'newest' | 'popular'>('newest');
  const [tab, setTab] = useState<'posts' | 'rooms' | 'members' | 'events' | 'command'>(
    initialTabParam === 'rooms'
      ? 'rooms'
      : initialTabParam === 'members'
        ? 'members'
        : initialTabParam === 'events'
          ? 'events'
          : 'posts'
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionNotice, setActionNotice] = useState('');
  const [toast, setToast] = useState('');

  // Request-to-join optional note
  const [requestNote, setRequestNote] = useState('');
  const [membershipBusy, setMembershipBusy] = useState(false);
  const [composerExpanded, setComposerExpanded] = useState(false);

  // Community post composer (Text, Announcement, Media, Poll)
  const [postTitle, setPostTitle] = useState('');
  const [postBody, setPostBody] = useState('');
  const [postKind, setPostKind] = useState<'discussion' | 'announcement'>('discussion');
  const [mediaFileUrl, setMediaFileUrl] = useState('');
  const [mediaFileType, setMediaFileType] = useState<'image' | 'video' | null>(null);
  const [mediaFileName, setMediaFileName] = useState('');
  const [showPollBuilder, setShowPollBuilder] = useState(false);
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [posting, setPosting] = useState(false);

  // Create Chat Room Modal
  const [createRoomOpen, setCreateRoomOpen] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');
  const [newRoomDesc, setNewRoomDesc] = useState('');
  const [newRoomSpoiler, setNewRoomSpoiler] = useState(false);
  const [newRoomRole, setNewRoomRole] = useState<'member' | 'moderator'>('member');
  const [creatingRoom, setCreatingRoom] = useState(false);

  // Create Event Modal
  const [createEventOpen, setCreateEventOpen] = useState(false);
  const [eventTitle, setEventTitle] = useState('');
  const [eventDesc, setEventDesc] = useState('');
  const [eventStartsAt, setEventStartsAt] = useState('');
  const [eventLocation, setEventLocation] = useState('Anime Universe Voice Stage');
  const [creatingEvent, setCreatingEvent] = useState(false);

  // Member search
  const [memberFilter, setMemberFilter] = useState('');

  // Guild Command State (Invites, Settings, Ownership, Audit Logs)
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteResults, setInviteResults] = useState<any[]>([]);
  const [inviteNote, setInviteNote] = useState('');
  const [sendingInviteUid, setSendingInviteUid] = useState<string | null>(null);

  const [settingsName, setSettingsName] = useState('');
  const [settingsDesc, setSettingsDesc] = useState('');
  const [settingsRules, setSettingsRules] = useState('');
  const [settingsCategory, setSettingsCategory] = useState('');
  const [settingsPrivacy, setSettingsPrivacy] = useState<'public' | 'private'>('public');
  const [settingsJoinPolicy, setSettingsJoinPolicy] = useState<
    'open' | 'approval' | 'invite_only'
  >('open');
  const [settingsIconDataUrl, setSettingsIconDataUrl] = useState('');
  const [settingsBannerDataUrl, setSettingsBannerDataUrl] = useState('');
  const [savingSettings, setSavingSettings] = useState(false);

  const [transferTargetUid, setTransferTargetUid] = useState('');
  const [confirmDeleteStep, setConfirmDeleteStep] = useState(false);
  const [auditLogs, setAuditLogs] = useState<ModerationLogRow[]>([]);

  const [reportTarget, setReportTarget] = useState<{
    type: 'community' | 'discussion';
    id: number;
    label: string;
  } | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast((prev) => (prev === msg ? '' : prev)), 2800);
  }, []);

  const selectTab = (nextTab: 'posts' | 'rooms' | 'members' | 'events' | 'command') => {
    setTab(nextTab);
    if (nextTab === 'posts') {
      setSearchParams({}, { replace: true });
    } else {
      setSearchParams({ tab: nextTab }, { replace: true });
    }
  };

  const loadGuild = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch<{ guild: GuildDetail; discussions: any[] }>(
        `/api/communities/${encodeURIComponent(slug)}?sort=${sort}`
      );
      setGuild(res.guild);
      setDiscussions(res.discussions || []);
      if (res.guild) {
        setSettingsName(res.guild.name);
        setSettingsDesc(res.guild.description || '');
        setSettingsRules(res.guild.rules || '');
        setSettingsCategory(res.guild.category || GUILD_CATEGORIES[0]);
        setSettingsPrivacy(res.guild.privacyMode || 'public');
        setSettingsJoinPolicy(res.guild.joinPolicy || 'open');
      }
    } catch (err: any) {
      setError(err.message || 'Community not found.');
    } finally {
      setLoading(false);
    }
  }, [slug, sort]);

  useEffect(() => {
    loadGuild();
  }, [loadGuild]);

  // Load audit logs when opening Command tab
  useEffect(() => {
    if (tab !== 'command' || !guild?.permissions?.canModerate) return;
    (async () => {
      try {
        const res = await apiFetch<{ logs: ModerationLogRow[] }>(
          `/api/communities/${guild.id}/audit-logs`
        );
        setAuditLogs(res.logs || []);
      } catch {
        setAuditLogs([]);
      }
    })();
  }, [tab, guild?.id, guild?.permissions?.canModerate]);

  // Search hunters to invite in Command tab
  useEffect(() => {
    if (tab !== 'command' || !inviteQuery.trim() || !user) {
      setInviteResults([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch<{ items: any[] }>(
          `/api/users/search?q=${encodeURIComponent(inviteQuery.trim())}`
        );
        const memberUids = new Set((guild?.members || []).map((m) => m.uid));
        setInviteResults((res.items || []).filter((u) => !memberUids.has(u.uid)));
      } catch {
        setInviteResults([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [tab, inviteQuery, user, guild?.members]);

  const handleMembershipAction = async (action: 'join' | 'leave' | 'cancel_request') => {
    if (!user || !guild) {
      navigate(`/auth/login?redirect=${encodeURIComponent(`/guilds/${slug}`)}`);
      return;
    }
    setMembershipBusy(true);
    setActionNotice('');
    try {
      await apiFetch(`/api/communities/${guild.id}/membership`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          note: action === 'join' ? requestNote.trim() || undefined : undefined,
        }),
      });
      setRequestNote('');
      bumpTasteRevision();
      await loadGuild();
      showToast(action === 'join' ? `Joined ${guild.name}!` : 'Membership updated.');
    } catch (err: any) {
      setActionNotice(err.message || 'Could not update community membership.');
    } finally {
      setMembershipBusy(false);
    }
  };

  const handleRespondPendingInvite = async (action: 'accept' | 'decline') => {
    if (!guild?.pendingInvite) return;
    setMembershipBusy(true);
    setActionNotice('');
    try {
      await apiFetch(`/api/guild-invites/${guild.pendingInvite.id}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      bumpTasteRevision();
      await loadGuild();
    } catch (err: any) {
      setActionNotice(err.message || 'Failed to respond to invitation.');
    } finally {
      setMembershipBusy(false);
    }
  };

  const handleShareCommunity = async () => {
    if (!guild) return;
    const url = `${window.location.origin}/guilds/${guild.slug}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Community link copied!');
    } catch {
      showToast(url);
    }
  };

  const handleSharePost = async (postId: number) => {
    const url = `${window.location.origin}/pulse/${postId}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Post link copied!');
    } catch {
      showToast(url);
    }
  };

  const handleToggleBookmarkPost = async (postId: number) => {
    if (!user) {
      navigate(`/auth/login?redirect=${encodeURIComponent(`/guilds/${slug}`)}`);
      return;
    }
    try {
      const res = await apiFetch<{ saved: boolean }>(`/api/discussions/${postId}/save`, {
        method: 'POST',
      });
      setDiscussions((prev) =>
        prev.map((d) => (d.id === postId ? { ...d, viewerBookmarked: res.saved } : d))
      );
      showToast(res.saved ? 'Saved to bookmarks' : 'Removed from bookmarks');
    } catch {
      // ignore
    }
  };

  const handleComposerMediaPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setActionNotice('');
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      setActionNotice('Select an MP4/WebM video or JPG/PNG/WebP image.');
      return;
    }
    try {
      const dataUrl = await readFileAsDataUrl(file, isVideo ? 16 * 1024 * 1024 : 8 * 1024 * 1024);
      setMediaFileType(isVideo ? 'video' : 'image');
      setMediaFileUrl(dataUrl);
      setMediaFileName(file.name);
    } catch (err: any) {
      setActionNotice(err.message || 'Could not attach media file.');
    }
  };

  const handleCreateGuildDiscussion = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !guild) {
      navigate(`/auth/login?redirect=${encodeURIComponent(`/guilds/${slug}`)}`);
      return;
    }
    const cleanPoll = showPollBuilder
      ? pollOptions.map((o) => o.trim()).filter(Boolean)
      : [];
    if (!postTitle.trim() && !postBody.trim() && !mediaFileUrl && cleanPoll.length < 2) return;

    setPosting(true);
    setActionNotice('');
    try {
      await apiFetch('/api/discussions', {
        method: 'POST',
        body: JSON.stringify({
          communityId: guild.id,
          animeMalId: guild.animeMalId || null,
          animeTitle: guild.animeTitle || null,
          genreTags: guild.genreTags || [],
          kind: postKind,
          title: postTitle.trim() || postBody.trim().slice(0, 80) || `${guild.name} Post`,
          content: postBody.trim() || postTitle.trim(),
          mediaDataUrl: mediaFileUrl || undefined,
          mediaType: mediaFileType || undefined,
          pollOptions: cleanPoll.length >= 2 ? cleanPoll : undefined,
        }),
      });
      kageSound.play(postKind === 'announcement' ? 'guild_challenge_announce' : 'guild_new_post');
      setPostTitle('');
      setPostBody('');
      setPostKind('discussion');
      setMediaFileUrl('');
      setMediaFileType(null);
      setMediaFileName('');
      setShowPollBuilder(false);
      setPollOptions(['', '']);
      setComposerExpanded(false);
      bumpTasteRevision();
      await loadGuild();
      showToast('Post published!');
    } catch (err: any) {
      setActionNotice(err.message || 'Failed to publish post.');
    } finally {
      setPosting(false);
    }
  };

  const handleCreateChatRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guild) return;
    setCreatingRoom(true);
    setActionNotice('');
    try {
      const res = await apiFetch<{ room: CommunityChatRoomItem }>(
        `/api/communities/${guild.id}/chat-rooms`,
        {
          method: 'POST',
          body: JSON.stringify({
            name: newRoomName.trim(),
            description: newRoomDesc.trim(),
            isSpoiler: newRoomSpoiler,
            postingRole: newRoomRole,
          }),
        }
      );
      setCreateRoomOpen(false);
      setNewRoomName('');
      setNewRoomDesc('');
      setNewRoomSpoiler(false);
      setNewRoomRole('member');
      await loadGuild();
      if (res.room?.slug) {
        navigate(`/guilds/${guild.slug}/rooms/${res.room.slug}`);
      }
    } catch (err: any) {
      setActionNotice(err.message || 'Could not create chat room.');
    } finally {
      setCreatingRoom(false);
    }
  };

  const handleCreateEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guild) return;
    setCreatingEvent(true);
    setActionNotice('');
    try {
      await apiFetch(`/api/communities/${guild.id}/events`, {
        method: 'POST',
        body: JSON.stringify({
          title: eventTitle.trim(),
          description: eventDesc.trim(),
          startsAt: eventStartsAt ? new Date(eventStartsAt).toISOString() : undefined,
          locationLabel: eventLocation.trim(),
        }),
      });
      kageSound.play('guild_challenge_announce');
      setCreateEventOpen(false);
      setEventTitle('');
      setEventDesc('');
      setEventStartsAt('');
      await loadGuild();
      showToast('Community event created!');
    } catch (err: any) {
      setActionNotice(err.message || 'Could not create event.');
    } finally {
      setCreatingEvent(false);
    }
  };

  const handleRsvpEvent = async (
    eventId: number,
    status: 'going' | 'interested' | 'none'
  ) => {
    if (!user || !guild) {
      navigate(`/auth/login?redirect=${encodeURIComponent(`/guilds/${slug}?tab=events`)}`);
      return;
    }
    try {
      await apiFetch(`/api/communities/${guild.id}/events/${eventId}/rsvp`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      await loadGuild();
    } catch (err: any) {
      setActionNotice(err.message || 'Could not update RSVP.');
    }
  };

  const handleModeratePost = async (postId: number, action: 'pin' | 'unpin' | 'delete') => {
    try {
      await apiFetch(`/api/discussions/${postId}/moderate`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      await loadGuild();
    } catch (err: any) {
      setActionNotice(err.message || 'Moderation action failed.');
    }
  };

  const handleToggleLikePost = async (postId: number) => {
    if (!user) {
      navigate(`/auth/login?redirect=${encodeURIComponent(`/guilds/${slug}`)}`);
      return;
    }
    try {
      const res = await apiFetch<{ active: boolean }>('/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'discussion',
          targetId: postId,
          reactionType: 'like',
        }),
      });
      setDiscussions((prev) =>
        prev.map((d) =>
          d.id === postId
            ? {
                ...d,
                viewerLiked: res.active,
                likeCount: Math.max(0, (d.likeCount || 0) + (res.active ? 1 : -1)),
              }
            : d
        )
      );
    } catch {
      // ignore
    }
  };

  const handleVoteGuildPoll = async (postId: number, optionId: string) => {
    if (!user) {
      navigate(`/auth/login?redirect=${encodeURIComponent(`/guilds/${slug}`)}`);
      return;
    }
    try {
      const res = await apiFetch<{ pollOptions: any[]; viewerPollVote: string }>(
        `/api/discussions/${postId}/poll-vote`,
        {
          method: 'POST',
          body: JSON.stringify({ optionId }),
        }
      );
      setDiscussions((prev) =>
        prev.map((d) =>
          d.id === postId
            ? {
                ...d,
                pollOptions: res.pollOptions,
                viewerPollVote: res.viewerPollVote,
              }
            : d
        )
      );
    } catch (err: any) {
      setActionNotice(err.message || 'Poll vote failed.');
    }
  };

  // --- Guild Command Handlers ---
  const handleReviewJoinRequest = async (requestId: number, decision: 'approve' | 'reject') => {
    if (!guild) return;
    try {
      await apiFetch(`/api/communities/${guild.id}/requests/${requestId}`, {
        method: 'POST',
        body: JSON.stringify({ decision }),
      });
      await loadGuild();
    } catch (err: any) {
      setActionNotice(err.message || 'Failed to review join request.');
    }
  };

  const handleSendDirectInvite = async (inviteeUid: string) => {
    if (!guild) return;
    setSendingInviteUid(inviteeUid);
    setActionNotice('');
    try {
      await apiFetch(`/api/communities/${guild.id}/invites`, {
        method: 'POST',
        body: JSON.stringify({
          inviteeUid,
          note: inviteNote.trim() || undefined,
        }),
      });
      kageSound.play('guild_invite');
      setInviteQuery('');
      setInviteNote('');
      setInviteResults([]);
      await loadGuild();
    } catch (err: any) {
      setActionNotice(err.message || 'Could not send guild invitation.');
    } finally {
      setSendingInviteUid(null);
    }
  };

  const handleRevokeInvite = async (inviteId: number) => {
    try {
      await apiFetch(`/api/guild-invites/${inviteId}/respond`, {
        method: 'POST',
        body: JSON.stringify({ action: 'revoke' }),
      });
      await loadGuild();
    } catch (err: any) {
      setActionNotice(err.message || 'Could not revoke invitation.');
    }
  };

  const handleMemberModAction = async (
    targetUid: string,
    action: 'set_role' | 'mute' | 'unmute' | 'kick' | 'ban' | 'unban',
    extra?: { newRole?: 'admin' | 'moderator' | 'member'; durationHours?: number; reason?: string }
  ) => {
    if (!guild) return;
    setActionNotice('');
    try {
      await apiFetch(`/api/communities/${guild.id}/members/manage`, {
        method: 'POST',
        body: JSON.stringify({
          targetUid,
          action,
          ...extra,
        }),
      });
      await loadGuild();
    } catch (err: any) {
      setActionNotice(err.message || 'Member management action failed.');
    }
  };

  const handleSaveGuildSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!guild) return;
    setSavingSettings(true);
    setActionNotice('');
    try {
      await apiFetch(`/api/communities/${guild.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: settingsName,
          description: settingsDesc,
          rules: settingsRules,
          category: settingsCategory,
          privacyMode: settingsPrivacy,
          joinPolicy:
            settingsPrivacy === 'private' && settingsJoinPolicy === 'open'
              ? 'approval'
              : settingsJoinPolicy,
          iconDataUrl: settingsIconDataUrl || undefined,
          bannerDataUrl: settingsBannerDataUrl || undefined,
        }),
      });
      setSettingsIconDataUrl('');
      setSettingsBannerDataUrl('');
      await loadGuild();
      showToast('Community settings saved.');
    } catch (err: any) {
      setActionNotice(err.message || 'Failed to update settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleTransferOwnership = async () => {
    if (!guild || !transferTargetUid) return;
    setActionNotice('');
    try {
      await apiFetch(`/api/communities/${guild.id}/transfer-ownership`, {
        method: 'POST',
        body: JSON.stringify({ newOwnerUid: transferTargetUid }),
      });
      setTransferTargetUid('');
      await loadGuild();
    } catch (err: any) {
      setActionNotice(err.message || 'Ownership transfer failed.');
    }
  };

  const handleArchiveOrDelete = async (action: 'archive' | 'unarchive' | 'delete') => {
    if (!guild) return;
    try {
      await apiFetch(`/api/communities/${guild.id}/archive`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      if (action === 'delete') {
        navigate('/guilds');
      } else {
        setConfirmDeleteStep(false);
        await loadGuild();
      }
    } catch (err: any) {
      setActionNotice(err.message || 'Lifecycle action failed.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="h-60 rounded-2xl bg-[#141116] animate-pulse" />
        <div className="h-44 rounded-2xl bg-[#141116] animate-pulse" />
      </div>
    );
  }

  if (error || !guild) {
    return (
      <div className="max-w-xl mx-auto p-8 rounded-2xl bg-[#141116] border border-white/10 text-center space-y-3">
        <p className="text-sm text-rose-400">{error || 'Community not found.'}</p>
        <Link
          to="/guilds"
          className="inline-flex min-h-[42px] px-4 items-center rounded-xl bg-[#6D28D9] text-white text-xs font-semibold"
        >
          Back to Communities
        </Link>
      </div>
    );
  }

  const isMod = Boolean(guild.permissions?.canModerate);
  const canCommand = Boolean(
    guild.permissions?.canModerate ||
      guild.permissions?.canEditSettings ||
      guild.permissions?.canManageOwnership
  );
  const pendingReqCount = guild.joinRequests?.length || 0;
  const sinceYear = guild.createdAt ? new Date(guild.createdAt).getFullYear() : 2024;
  const pinnedPosts = discussions.filter((d) => d.isPinned);
  const latestPosts = discussions.filter((d) => !d.isPinned);
  const chatRooms = guild.chatRooms || [];
  const events = guild.events || [];
  const voiceChannels = guild.voiceChannels || [];

  return (
    <div className="max-w-3xl mx-auto space-y-5 -mx-3.5 sm:mx-auto -mt-3 sm:mt-0 pb-6">
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-xl bg-[#141116] border border-[#6D28D9] text-xs font-semibold text-[#F5F1F2] shadow-2xl">
          {toast}
        </div>
      )}

      {/* PREMIUM COMMUNITY PROFILE SHELL — Reference Visual Target */}
      <div className="rounded-none sm:rounded-3xl overflow-hidden bg-[#0E0C13] border-y sm:border border-white/10 shadow-[0_20px_50px_rgba(0,0,0,0.75)]">
        {/* Full-Width Cover Banner */}
        <div className="h-44 sm:h-56 relative overflow-hidden">
          <KageImage
            src={guild.bannerUrl || guild.artworkUrl}
            alt={guild.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0E0C13] via-[#0E0C13]/35 to-black/35" />

          <button
            type="button"
            onClick={() => navigate('/guilds')}
            className="absolute top-3.5 left-3.5 min-h-[40px] min-w-[40px] rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/80 cursor-pointer"
            aria-label="Back to Communities"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>

          <div className="absolute top-3.5 right-3.5 flex items-center gap-2">
            <button
              type="button"
              onClick={handleShareCommunity}
              className="min-h-[40px] min-w-[40px] rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/80 cursor-pointer"
              aria-label="Share community"
            >
              <Share2 className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                if (canCommand) {
                  selectTab('command');
                } else if (user) {
                  setReportTarget({ type: 'community', id: guild.id, label: guild.name });
                }
              }}
              className="min-h-[40px] min-w-[40px] rounded-full bg-black/55 backdrop-blur-md flex items-center justify-center text-white hover:bg-black/80 cursor-pointer"
              aria-label="Community options"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Circular Overlapping Avatar + Identity + Stats + CTA */}
        <div className="px-4 sm:px-6 pb-2 -mt-10 relative z-10 space-y-4">
          <div className="flex items-end gap-4">
            <div className="w-22 h-22 sm:w-25 sm:h-25 rounded-full p-[3px] bg-gradient-to-tr from-[#6D28D9] via-[#9333EA] to-[#C0263D] shadow-[0_0_26px_rgba(109,40,217,0.45)] shrink-0">
              <div className="w-full h-full rounded-full overflow-hidden bg-[#09080B]">
                <KageImage
                  src={guild.artworkUrl}
                  alt={guild.name}
                  className="w-full h-full object-cover"
                />
              </div>
            </div>

            <div className="min-w-0 pb-1">
              <div className="flex items-center gap-1.5">
                <h1 className="text-xl sm:text-2xl font-bold text-[#F5F1F2] truncate">
                  {guild.name}
                </h1>
                {guild.isVerified && (
                  <BadgeCheck
                    className="w-5 h-5 text-[#7C3AED] fill-[#7C3AED]/25 shrink-0"
                    aria-label="Verified Community"
                  />
                )}
              </div>
              <p className="text-xs sm:text-sm text-[#A7A0AA] truncate">@{guild.slug}</p>
              {(guild.tagline || guild.category) && (
                <p className="text-xs text-[#F5F1F2]/90 mt-1 truncate">
                  {guild.tagline || `${guild.category} · ${formatGuildPolicyMeta(guild)}`}
                </p>
              )}
            </div>
          </div>

          <p className="text-xs sm:text-sm text-[#F5F1F2]/90 leading-relaxed">
            {guild.description}
          </p>

          {/* Real Database & Live Presence Metrics Bar */}
          <div className="grid grid-cols-3 divide-x divide-white/10 py-2 text-center">
            <div>
              <p className="text-base sm:text-lg font-bold font-mono-num text-[#F5F1F2]">
                {formatCompactCount(guild.memberCount)}
              </p>
              <p className="text-[11px] text-[#A7A0AA]">Members</p>
            </div>
            <div>
              <p className="text-base sm:text-lg font-bold font-mono-num text-[#F5F1F2]">
                {formatCompactCount(guild.onlineCount ?? 0)}
              </p>
              <p className="text-[11px] text-[#A7A0AA]">Online</p>
            </div>
            <div>
              <p className="text-xs font-medium text-[#A7A0AA]">Since</p>
              <p className="text-sm sm:text-base font-bold font-mono-num text-[#F5F1F2]">
                {sinceYear}
              </p>
            </div>
          </div>

          {/* Join / Leave Community Action Row */}
          <div className="flex items-center gap-2.5">
            {guild.isBanned ? (
              <div className="flex-1 min-h-[46px] rounded-2xl bg-rose-500/15 border border-rose-500/30 text-xs font-semibold text-rose-300 flex items-center justify-center">
                Banned from Community
              </div>
            ) : guild.pendingInvite ? (
              <>
                <button
                  type="button"
                  disabled={membershipBusy}
                  onClick={() => handleRespondPendingInvite('accept')}
                  className="flex-1 min-h-[46px] rounded-2xl bg-gradient-to-r from-[#6D28D9] via-[#9333EA] to-[#E11D48] text-white text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>Accept Invitation</span>
                </button>
                <button
                  type="button"
                  disabled={membershipBusy}
                  onClick={() => handleRespondPendingInvite('decline')}
                  className="min-h-[46px] px-4 rounded-2xl bg-[#141116] border border-white/12 text-xs text-[#A7A0AA] cursor-pointer"
                >
                  Decline
                </button>
              </>
            ) : guild.isMember ? (
              guild.memberRole === 'owner' ? (
                <button
                  type="button"
                  onClick={() => selectTab('command')}
                  className="flex-1 min-h-[46px] rounded-2xl bg-[#141116] border border-[#6D28D9]/65 text-sm font-semibold text-[#F5F1F2] flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Shield className="w-4 h-4 text-[#6D28D9]" />
                  <span>Joined · Community Owner</span>
                </button>
              ) : (
                <button
                  type="button"
                  disabled={membershipBusy}
                  onClick={() => handleMembershipAction('leave')}
                  className="flex-1 min-h-[46px] rounded-2xl bg-[#141116] hover:bg-[#1C1720] border border-white/15 hover:border-rose-500/50 text-sm font-semibold text-[#F5F1F2] flex items-center justify-center gap-2 cursor-pointer transition-colors"
                >
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Joined · Leave Community</span>
                </button>
              )
            ) : guild.hasPendingRequest ? (
              <button
                type="button"
                disabled={membershipBusy}
                onClick={() => handleMembershipAction('cancel_request')}
                className="flex-1 min-h-[46px] rounded-2xl bg-[#141116] border border-amber-400/45 text-sm font-semibold text-amber-200 cursor-pointer"
              >
                Request Pending · Cancel
              </button>
            ) : guild.joinPolicy === 'invite_only' ? (
              <div className="flex-1 min-h-[46px] rounded-2xl bg-[#141116] border border-white/10 text-xs text-[#A7A0AA] flex items-center justify-center gap-1.5">
                <Lock className="w-4 h-4" />
                <span>Invite Only Community</span>
              </div>
            ) : (
              <button
                type="button"
                disabled={membershipBusy}
                onClick={() => handleMembershipAction('join')}
                className="flex-1 min-h-[46px] rounded-2xl bg-gradient-to-r from-[#6D28D9] via-[#A855F7] to-[#EC4899] hover:opacity-95 text-white text-sm font-bold flex items-center justify-center gap-2 shadow-[0_10px_28px_rgba(168,85,247,0.35)] cursor-pointer transition-opacity"
              >
                <Sparkles className="w-4 h-4" />
                <span>
                  {guild.joinPolicy === 'approval' || guild.privacyMode === 'private'
                    ? 'Request to Join'
                    : 'Join Community'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                if (canCommand) {
                  selectTab('command');
                } else {
                  handleShareCommunity();
                }
              }}
              className="min-h-[46px] min-w-[46px] rounded-2xl bg-[#141116] hover:bg-[#1C1720] border border-white/12 flex items-center justify-center text-[#F5F1F2] shrink-0 cursor-pointer"
              aria-label="Community menu"
            >
              <MoreHorizontal className="w-5 h-5" />
            </button>
          </div>

          {/* Primary Community Tabs: Posts | Chat Rooms | Members | Events (+ Command) */}
          <div className="flex items-center gap-6 border-t border-white/8 pt-1 overflow-x-auto no-scrollbar">
            {(
              [
                { key: 'posts', label: 'Posts' },
                { key: 'rooms', label: 'Chat Rooms' },
                { key: 'members', label: 'Members' },
                { key: 'events', label: 'Events' },
                ...(canCommand
                  ? [
                      {
                        key: 'command',
                        label: pendingReqCount > 0 ? `Command (${pendingReqCount})` : 'Command',
                      },
                    ]
                  : []),
              ] as { key: 'posts' | 'rooms' | 'members' | 'events' | 'command'; label: string }[]
            ).map((item) => {
              const active = tab === item.key;
              return (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => selectTab(item.key)}
                  className={`min-h-[44px] pb-2 text-sm font-semibold relative whitespace-nowrap transition-colors cursor-pointer ${
                    active ? 'text-[#F5F1F2]' : 'text-[#A7A0AA] hover:text-[#F5F1F2]'
                  }`}
                >
                  {item.label}
                  {active && (
                    <span className="absolute bottom-0 left-0 right-0 h-[2.5px] rounded-full bg-[#7C3AED]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {actionNotice && (
        <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-4 py-2.5 flex items-center justify-between text-xs text-rose-300">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{actionNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice('')}
            className="text-rose-200 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* PRIVATE COMMUNITY GATE FOR NON-MEMBERS */}
      {!guild.canViewContent ? (
        <div className="rounded-2xl bg-[#141116] border border-white/12 p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-2xl bg-[#09080B] border border-white/10 flex items-center justify-center mx-auto">
            <Lock className="w-5 h-5 text-[#C0263D]" />
          </div>
          <div className="space-y-1 max-w-md mx-auto">
            <h2 className="text-base font-bold text-[#F5F1F2]">Private Community Sanctuary</h2>
            <p className="text-xs text-[#A7A0AA] leading-relaxed">
              Posts, real-time chat rooms, and member rosters in {guild.name} are visible only to
              approved members.
            </p>
          </div>

          {!guild.isMember &&
            !guild.hasPendingRequest &&
            guild.joinPolicy !== 'invite_only' &&
            !guild.isBanned && (
              <div className="max-w-sm mx-auto space-y-2 pt-2">
                <input
                  type="text"
                  value={requestNote}
                  onChange={(e) => setRequestNote(e.target.value)}
                  placeholder="Add an optional note for moderators..."
                  className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                />
                <button
                  type="button"
                  disabled={membershipBusy}
                  onClick={() => handleMembershipAction('join')}
                  className="w-full min-h-[42px] rounded-xl bg-[#6D28D9] hover:bg-[#7c3aed] text-xs font-semibold text-white cursor-pointer"
                >
                  {membershipBusy ? 'Sending Request...' : 'Send Join Request'}
                </button>
              </div>
            )}
        </div>
      ) : (
        <>
          {/* =================================================================
              TAB 1: POSTS (Pinned Post + Composer + Latest Posts)
              ================================================================= */}
          {tab === 'posts' && (
            <div className="space-y-5">
              {/* Quick Post Trigger / Composer */}
              {guild.isMember ? (
                !composerExpanded ? (
                  <button
                    type="button"
                    onClick={() => setComposerExpanded(true)}
                    className="w-full p-3.5 rounded-2xl bg-[#141116] border border-white/10 hover:border-[#6D28D9]/55 flex items-center justify-between gap-3 text-left cursor-pointer transition-colors"
                  >
                    <span className="text-xs sm:text-sm text-[#A7A0AA]">
                      Share thoughts, theories, anime edits, or polls in {guild.name}...
                    </span>
                    <span className="px-3 py-1.5 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold shrink-0">
                      New Post
                    </span>
                  </button>
                ) : (
                  <form
                    onSubmit={handleCreateGuildDiscussion}
                    className="p-4 rounded-2xl bg-[#141116] border border-white/12 space-y-3"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={postTitle}
                        onChange={(e) => setPostTitle(e.target.value)}
                        placeholder={`Post title in ${guild.name}...`}
                        className="flex-1 min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 px-3.5 text-sm text-[#F5F1F2] focus:outline-none focus:border-[#6D28D9]"
                      />
                      {isMod && (
                        <select
                          value={postKind}
                          onChange={(e) =>
                            setPostKind(e.target.value as 'discussion' | 'announcement')
                          }
                          className="min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                        >
                          <option value="discussion">Post</option>
                          <option value="announcement">Announcement</option>
                        </select>
                      )}
                      <button
                        type="button"
                        onClick={() => setComposerExpanded(false)}
                        className="p-2 text-[#A7A0AA] hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    <textarea
                      rows={3}
                      value={postBody}
                      onChange={(e) => setPostBody(e.target.value)}
                      placeholder="Write your post..."
                      className="w-full rounded-xl bg-[#09080B] border border-white/10 p-3 text-xs sm:text-sm text-[#F5F1F2] focus:outline-none focus:border-[#6D28D9]"
                    />

                    {mediaFileName && (
                      <div className="rounded-xl bg-[#09080B] border border-white/10 px-3 py-2 flex items-center justify-between text-xs text-[#F5F1F2]">
                        <span className="truncate flex items-center gap-2">
                          {mediaFileType === 'video' ? (
                            <Film className="w-3.5 h-3.5 text-[#C0263D]" />
                          ) : (
                            <ImageIcon className="w-3.5 h-3.5 text-[#6D28D9]" />
                          )}
                          {mediaFileName}
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setMediaFileUrl('');
                            setMediaFileType(null);
                            setMediaFileName('');
                          }}
                          className="text-[#A7A0AA] hover:text-white cursor-pointer"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    )}

                    {showPollBuilder && (
                      <div className="rounded-xl bg-[#09080B] border border-white/10 p-3 space-y-2">
                        <p className="text-xs font-semibold text-[#F5F1F2]">Poll Options</p>
                        {pollOptions.map((opt, idx) => (
                          <input
                            key={idx}
                            type="text"
                            value={opt}
                            onChange={(e) =>
                              setPollOptions((prev) =>
                                prev.map((item, i) => (i === idx ? e.target.value : item))
                              )
                            }
                            placeholder={`Option ${idx + 1}`}
                            className="w-full min-h-[36px] rounded-lg bg-[#141116] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                          />
                        ))}
                        {pollOptions.length < 4 && (
                          <button
                            type="button"
                            onClick={() => setPollOptions((prev) => [...prev, ''])}
                            className="text-xs text-[#6D28D9] hover:underline cursor-pointer"
                          >
                            + Add Option
                          </button>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <label className="min-h-[38px] px-3 rounded-xl bg-[#09080B] border border-white/10 hover:border-white/25 text-xs text-[#A7A0AA] hover:text-white flex items-center gap-1.5 cursor-pointer">
                          <ImageIcon className="w-3.5 h-3.5 text-[#6D28D9]" />
                          <span>Media</span>
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif,video/mp4,video/webm"
                            onChange={handleComposerMediaPick}
                            className="hidden"
                          />
                        </label>
                        <button
                          type="button"
                          onClick={() => setShowPollBuilder((v) => !v)}
                          className={`min-h-[38px] px-3 rounded-xl border text-xs flex items-center gap-1.5 cursor-pointer ${
                            showPollBuilder
                              ? 'bg-[#6D28D9]/20 border-[#6D28D9] text-white'
                              : 'bg-[#09080B] border-white/10 text-[#A7A0AA] hover:text-white'
                          }`}
                        >
                          <BarChart2 className="w-3.5 h-3.5" />
                          <span>Poll</span>
                        </button>
                      </div>

                      <button
                        type="submit"
                        disabled={posting}
                        className="min-h-[40px] px-4 rounded-xl bg-[#6D28D9] hover:bg-[#7c3aed] disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>{posting ? 'Posting...' : 'Publish'}</span>
                      </button>
                    </div>
                  </form>
                )
              ) : null}

              {/* Pinned Post Section — Reference Layout */}
              {pinnedPosts.length > 0 && (
                <section className="space-y-2.5">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-[#A7A0AA]">
                    <Pin className="w-3.5 h-3.5 text-[#7C3AED]" />
                    <span>Pinned Post</span>
                  </div>

                  {pinnedPosts.map((d) => {
                    const canDelete = isMod || user?.uid === d.author?.uid;
                    return (
                      <div
                        key={d.id}
                        className="rounded-2xl bg-[#141116] border border-white/10 p-4 sm:p-5 space-y-3.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <Link
                            to={`/profile/${d.author.username}`}
                            className="flex items-center gap-2.5 min-w-0"
                          >
                            <div className="w-9 h-9 rounded-full overflow-hidden border border-[#7C3AED] bg-[#09080B] shrink-0">
                              <KageImage
                                src={d.author.avatarUrl || guild.artworkUrl}
                                alt={d.author.displayName}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="flex items-center gap-1.5 flex-wrap text-xs">
                              <span className="font-bold text-[#F5F1F2]">
                                {d.author.displayName}
                              </span>
                              {d.author.role === 'owner' || d.author.role === 'admin' ? (
                                <BadgeCheck className="w-4 h-4 text-[#7C3AED] fill-[#7C3AED]/20" />
                              ) : (
                                <OwnerBadge role={d.author.role} size="xs" />
                              )}
                              <span className="text-[#A7A0AA]">
                                {d.author.role === 'owner' || d.author.role === 'admin'
                                  ? 'Admin'
                                  : `@${d.author.username}`}{' '}
                                · {formatCommunityPostTime(d.createdAt)}
                              </span>
                            </div>
                          </Link>

                          <div className="flex items-center gap-1">
                            {isMod && (
                              <button
                                type="button"
                                onClick={() => handleModeratePost(d.id, 'unpin')}
                                className="p-1.5 rounded-lg text-amber-400 hover:bg-white/5 cursor-pointer"
                                title="Unpin post"
                              >
                                <Pin className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleModeratePost(d.id, 'delete')}
                                className="p-1.5 rounded-lg text-[#A7A0AA] hover:text-rose-400 cursor-pointer"
                                title="Delete post"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        <div className="flex items-start justify-between gap-4">
                          <Link to={`/pulse/${d.id}`} className="space-y-1.5 flex-1 min-w-0">
                            <h3 className="text-base sm:text-lg font-bold text-[#F5F1F2] hover:text-[#7C3AED]">
                              {d.title}
                            </h3>
                            <p className="text-xs sm:text-sm text-[#A7A0AA] whitespace-pre-line leading-relaxed">
                              {d.content}
                            </p>
                          </Link>

                          {d.mediaUrl && d.mediaType !== 'video' && (
                            <Link
                              to={`/pulse/${d.id}`}
                              className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl overflow-hidden bg-[#09080B] border border-white/10 shrink-0"
                            >
                              <KageImage
                                src={d.mediaUrl}
                                alt={d.title}
                                className="w-full h-full object-cover"
                              />
                            </Link>
                          )}
                        </div>

                        <div className="pt-1 flex items-center justify-between text-xs text-[#A7A0AA] font-mono-num">
                          <div className="flex items-center gap-5">
                            <button
                              type="button"
                              onClick={() => handleToggleLikePost(d.id)}
                              className={`inline-flex items-center gap-1.5 cursor-pointer ${
                                d.viewerLiked ? 'text-[#C0263D]' : 'hover:text-[#F5F1F2]'
                              }`}
                            >
                              <Heart
                                className={`w-4 h-4 ${d.viewerLiked ? 'fill-current' : ''}`}
                              />
                              <span>{formatCompactCount(d.likeCount || 0)}</span>
                            </button>

                            <Link
                              to={`/pulse/${d.id}`}
                              className="inline-flex items-center gap-1.5 hover:text-[#F5F1F2]"
                            >
                              <MessageSquare className="w-4 h-4" />
                              <span>{formatCompactCount(d.commentCount || 0)}</span>
                            </Link>

                            <button
                              type="button"
                              onClick={() => handleSharePost(d.id)}
                              className="inline-flex items-center gap-1.5 hover:text-[#F5F1F2] cursor-pointer"
                            >
                              <Share2 className="w-4 h-4" />
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleToggleBookmarkPost(d.id)}
                            className={`p-1 cursor-pointer ${
                              d.viewerBookmarked ? 'text-[#7C3AED]' : 'hover:text-[#F5F1F2]'
                            }`}
                            aria-label="Bookmark post"
                          >
                            <Bookmark
                              className={`w-4 h-4 ${d.viewerBookmarked ? 'fill-current' : ''}`}
                            />
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </section>
              )}

              {/* Latest Posts Section */}
              <section className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base sm:text-lg font-bold text-[#F5F1F2]">Latest Posts</h2>
                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSort('newest')}
                      className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                        sort === 'newest' ? 'bg-[#141116] text-white' : 'text-[#A7A0AA]'
                      }`}
                    >
                      Newest
                    </button>
                    <button
                      type="button"
                      onClick={() => setSort('popular')}
                      className={`px-2.5 py-1 rounded-lg font-semibold cursor-pointer ${
                        sort === 'popular' ? 'bg-[#141116] text-white' : 'text-[#A7A0AA]'
                      }`}
                    >
                      Top
                    </button>
                  </div>
                </div>

                {latestPosts.length === 0 && pinnedPosts.length === 0 ? (
                  <div className="p-8 rounded-2xl bg-[#141116] border border-white/8 text-center text-xs text-[#A7A0AA]">
                    No posts in {guild.name} yet. Publish the first community thread!
                  </div>
                ) : (
                  <div className="space-y-3">
                    {latestPosts.map((d) => {
                      const canDelete = isMod || user?.uid === d.author?.uid;
                      return (
                        <div
                          key={d.id}
                          className="p-4 rounded-2xl bg-[#141116] border border-white/8 space-y-3"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <Link
                              to={`/profile/${d.author.username}`}
                              className="flex items-center gap-2.5 min-w-0"
                            >
                              <div className="w-9 h-9 rounded-full overflow-hidden bg-[#09080B] border border-white/12 shrink-0">
                                <KageImage
                                  src={d.author.avatarUrl}
                                  alt={d.author.displayName}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div className="min-w-0 flex items-center gap-1.5 flex-wrap text-xs">
                                <span className="font-bold text-[#F5F1F2] truncate">
                                  {d.author.username || d.author.displayName}
                                </span>
                                <OwnerBadge role={d.author.role} size="xs" />
                                <span className="text-[#A7A0AA]">
                                  {formatCommunityPostTime(d.createdAt)}
                                </span>
                              </div>
                            </Link>

                            <div className="flex items-center gap-1">
                              {isMod && (
                                <button
                                  type="button"
                                  onClick={() => handleModeratePost(d.id, 'pin')}
                                  className="p-1.5 rounded-lg text-[#A7A0AA] hover:text-amber-400 cursor-pointer"
                                  title="Pin post"
                                >
                                  <Pin className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => handleModeratePost(d.id, 'delete')}
                                  className="p-1.5 rounded-lg text-[#A7A0AA] hover:text-rose-400 cursor-pointer"
                                  title="Delete post"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <Link to={`/pulse/${d.id}`} className="block space-y-1">
                            {d.title && d.title !== d.content && (
                              <h3 className="text-sm sm:text-base font-bold text-[#F5F1F2] hover:text-[#7C3AED]">
                                {d.title}
                              </h3>
                            )}
                            <p className="text-xs sm:text-sm text-[#F5F1F2]/90 whitespace-pre-line line-clamp-4 leading-relaxed">
                              {d.content}
                            </p>
                          </Link>

                          {d.mediaUrl && (
                            <div className="rounded-xl overflow-hidden bg-[#09080B] border border-white/10 max-h-96">
                              {d.mediaType === 'video' ? (
                                <video
                                  src={d.mediaUrl}
                                  poster={d.posterUrl || undefined}
                                  controls
                                  playsInline
                                  preload="metadata"
                                  className="w-full max-h-96 object-contain"
                                />
                              ) : (
                                <KageImage
                                  src={d.mediaUrl}
                                  alt={d.title}
                                  className="w-full max-h-96 object-cover"
                                />
                              )}
                            </div>
                          )}

                          {Array.isArray(d.pollOptions) && d.pollOptions.length > 0 && (
                            <div className="space-y-1.5 pt-1">
                              {d.pollOptions.map((opt: any) => {
                                const total = d.pollOptions.reduce(
                                  (acc: number, item: any) => acc + (item.votes || 0),
                                  0
                                );
                                const pct =
                                  total > 0 ? Math.round(((opt.votes || 0) / total) * 100) : 0;
                                const voted = d.viewerPollVote === opt.id;
                                return (
                                  <button
                                    key={opt.id}
                                    type="button"
                                    onClick={() => handleVoteGuildPoll(d.id, opt.id)}
                                    className={`w-full min-h-[38px] rounded-xl px-3 py-2 border text-left text-xs flex items-center justify-between gap-2 cursor-pointer ${
                                      voted
                                        ? 'bg-[#6D28D9]/20 border-[#6D28D9] text-white'
                                        : 'bg-[#09080B] border-white/10 text-[#F5F1F2] hover:border-white/25'
                                    }`}
                                  >
                                    <span className="font-medium">{opt.text || opt.label}</span>
                                    <span className="font-mono-num text-[#A7A0AA]">
                                      {pct}% ({formatCompactNumber(opt.votes || 0)})
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}

                          <div className="pt-1 flex items-center justify-between text-xs text-[#A7A0AA] font-mono-num">
                            <div className="flex items-center gap-5">
                              <button
                                type="button"
                                onClick={() => handleToggleLikePost(d.id)}
                                className={`inline-flex items-center gap-1.5 cursor-pointer ${
                                  d.viewerLiked ? 'text-[#C0263D]' : 'hover:text-[#F5F1F2]'
                                }`}
                              >
                                <Heart
                                  className={`w-4 h-4 ${d.viewerLiked ? 'fill-current' : ''}`}
                                />
                                <span>{formatCompactNumber(d.likeCount || 0)}</span>
                              </button>
                              <Link
                                to={`/pulse/${d.id}`}
                                className="inline-flex items-center gap-1.5 hover:text-[#F5F1F2]"
                              >
                                <MessageSquare className="w-4 h-4" />
                                <span>{formatCompactNumber(d.commentCount || 0)}</span>
                              </Link>
                              <button
                                type="button"
                                onClick={() => handleSharePost(d.id)}
                                className="inline-flex items-center gap-1.5 hover:text-[#F5F1F2] cursor-pointer"
                              >
                                <Share2 className="w-4 h-4" />
                              </button>
                            </div>

                            <button
                              type="button"
                              onClick={() => handleToggleBookmarkPost(d.id)}
                              className={`p-1 cursor-pointer ${
                                d.viewerBookmarked ? 'text-[#7C3AED]' : 'hover:text-[#F5F1F2]'
                              }`}
                              aria-label="Bookmark post"
                            >
                              <Bookmark
                                className={`w-4 h-4 ${d.viewerBookmarked ? 'fill-current' : ''}`}
                              />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>
          )}

          {/* =================================================================
              TAB 2: CHAT ROOMS (Screen 2 Reference — 6 Rooms + Create Room + Voice Channels)
              ================================================================= */}
          {tab === 'rooms' && (
            <div className="space-y-5">
              {/* Atmospheric Chat Banner */}
              <div className="relative h-36 sm:h-44 rounded-2xl overflow-hidden border border-white/10 bg-[#141116]">
                <KageImage
                  src={guild.chatBannerUrl || 'asset:anime_chat_banner'}
                  alt={`${guild.name} Chat Rooms`}
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-0 bg-gradient-to-r from-[#09080B]/75 via-transparent to-[#09080B]/55" />
              </div>

              {/* Chat Rooms Header + Create Room Button */}
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-xl sm:text-2xl font-bold text-[#F5F1F2]">Chat Rooms</h2>
                {isMod && (
                  <button
                    type="button"
                    onClick={() => setCreateRoomOpen(true)}
                    className="min-h-[38px] px-4 rounded-xl bg-[#141116] hover:bg-[#1C1720] border border-[#7C3AED]/70 text-xs sm:text-sm font-semibold text-[#d8b4fe] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Room</span>
                  </button>
                )}
              </div>

              {/* Real-Time Chat Room Cards (general, anime-discussion, manga-spoilers, edits-and-art, questions, announcements) */}
              <div className="space-y-2.5">
                {chatRooms.map((room) => (
                  <Link
                    key={room.id}
                    to={`/guilds/${guild.slug}/rooms/${room.slug}`}
                    className="p-3.5 sm:p-4 rounded-2xl bg-[#141116] hover:bg-[#191520] border border-white/8 hover:border-[#7C3AED]/55 flex items-center justify-between gap-3 transition-all"
                  >
                    <div className="flex items-center gap-3.5 min-w-0">
                      <div className="w-11 h-11 rounded-full bg-[#1D1829] border border-[#7C3AED]/30 flex items-center justify-center text-[#A78BFA] shrink-0">
                        <Hash className="w-5 h-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm sm:text-base font-bold text-[#F5F1F2] truncate">
                            {room.slug}
                          </span>
                          {room.isSpoiler && (
                            <span className="text-[10px] font-bold tracking-wider uppercase text-rose-400 border border-rose-500/50 px-1.5 py-0.5 rounded">
                              SPOILER
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-[#A7A0AA] truncate mt-0.5">
                          {room.description}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 text-xs font-mono-num text-[#A7A0AA]">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
                      <span>
                        {(room.onlineCount || 0) > 0
                          ? `${formatCompactCount(room.onlineCount)} online`
                          : `${formatCompactCount(room.messageCount)} msgs`}
                      </span>
                      <ChevronRight className="w-4 h-4 text-[#A7A0AA]" />
                    </div>
                  </Link>
                ))}
              </div>

              {/* Voice Channels Section */}
              <div className="pt-3 space-y-3">
                <div className="flex items-center gap-2 text-sm font-bold text-[#F5F1F2]">
                  <Mic className="w-4 h-4 text-[#7C3AED]" />
                  <span>Voice Channels</span>
                </div>

                {voiceChannels.length > 0 && (
                  <div className="rounded-2xl bg-[#141116] border border-white/8 divide-y divide-white/6 overflow-hidden">
                    {voiceChannels.map((vc) => (
                      <Link
                        key={vc.id}
                        to={`/voice/${vc.id}`}
                        className="px-4 py-3.5 hover:bg-[#1C1720] flex items-center justify-between gap-3 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Volume2 className="w-4 h-4 text-[#A7A0AA] shrink-0" />
                          <span className="text-sm font-medium text-[#F5F1F2] truncate">
                            {vc.title}
                          </span>
                        </div>
                        <span className="text-xs font-mono-num text-[#A7A0AA]">
                          {vc.participantCount}/12
                        </span>
                      </Link>
                    ))}
                  </div>
                )}

                {/* Join Voice Promo Card */}
                <div className="rounded-2xl bg-[#141116] border border-[#7C3AED]/35 p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-16 h-14 rounded-xl overflow-hidden bg-[#09080B] shrink-0">
                      <KageImage
                        src={guild.chatBannerUrl || 'asset:anime_chat_banner'}
                        alt="Join Voice"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <p className="text-xs text-[#F5F1F2]/90 leading-snug">
                      Join voice chats, make friends, and be part of something bigger!
                    </p>
                  </div>
                  <Link
                    to={voiceChannels[0] ? `/voice/${voiceChannels[0].id}` : '/voice'}
                    className="min-h-[40px] px-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-bold inline-flex items-center gap-1.5 shrink-0 transition-colors"
                  >
                    <Mic className="w-3.5 h-3.5" />
                    <span>Join Voice</span>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 3: MEMBERS
              ================================================================= */}
          {tab === 'members' && (
            <div className="space-y-4">
              <div className="relative">
                <Search className="w-4 h-4 text-[#A7A0AA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={memberFilter}
                  onChange={(e) => setMemberFilter(e.target.value)}
                  placeholder="Search community members by name or @username..."
                  className="w-full min-h-[42px] rounded-xl bg-[#141116] border border-white/10 pl-10 pr-4 text-xs sm:text-sm text-[#F5F1F2] focus:outline-none focus:border-[#6D28D9]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {guild.members
                  .filter((m) => {
                    const q = memberFilter.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      m.username.toLowerCase().includes(q) ||
                      m.displayName.toLowerCase().includes(q)
                    );
                  })
                  .map((m) => (
                    <Link
                      key={m.uid}
                      to={`/profile/${m.username}`}
                      className="p-3.5 rounded-xl bg-[#141116] border border-white/8 flex items-center justify-between hover:border-white/20"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-[#09080B] shrink-0">
                          <KageImage
                            src={m.avatarUrl}
                            alt={m.displayName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold text-[#F5F1F2] truncate">
                              {m.displayName}
                            </p>
                            <OwnerBadge role={m.userRole} size="xs" />
                          </div>
                          <p className="text-xs text-[#A7A0AA] truncate">
                            @{m.username}
                            {m.isMuted ? ' · Muted' : ''}
                          </p>
                        </div>
                      </div>
                      {m.role !== 'member' && (
                        <span className="text-[11px] font-semibold text-[#7C3AED] flex items-center gap-1 uppercase shrink-0">
                          <Shield className="w-3.5 h-3.5" />
                          {m.role}
                        </span>
                      )}
                    </Link>
                  ))}
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 4: EVENTS & COMMUNITY CHARTER
              ================================================================= */}
          {tab === 'events' && (
            <div className="space-y-5">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold text-[#F5F1F2] flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-[#7C3AED]" />
                  <span>Upcoming Community Events</span>
                </h2>
                {isMod && (
                  <button
                    type="button"
                    onClick={() => setCreateEventOpen(true)}
                    className="min-h-[38px] px-3.5 rounded-xl bg-[#6D28D9] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Create Event</span>
                  </button>
                )}
              </div>

              {events.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#141116] border border-white/8 text-center text-xs text-[#A7A0AA]">
                  No upcoming events scheduled yet.
                </div>
              ) : (
                <div className="space-y-3">
                  {events.map((ev) => (
                    <div
                      key={ev.id}
                      className="rounded-2xl bg-[#141116] border border-white/10 overflow-hidden"
                    >
                      <div className="h-28 relative">
                        <KageImage
                          src={ev.bannerUrl || guild.bannerUrl}
                          alt={ev.title}
                          className="w-full h-full object-cover opacity-70"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-[#141116] to-transparent" />
                      </div>
                      <div className="p-4 -mt-6 relative z-10 space-y-2.5">
                        <p className="text-xs font-mono-num text-[#A78BFA]">
                          {new Date(ev.startsAt).toLocaleString()} · {ev.locationLabel}
                        </p>
                        <h3 className="text-base font-bold text-[#F5F1F2]">{ev.title}</h3>
                        {ev.description && (
                          <p className="text-xs text-[#A7A0AA] leading-relaxed">{ev.description}</p>
                        )}
                        <div className="pt-2 flex items-center justify-between gap-3">
                          <span className="text-xs font-mono-num text-[#A7A0AA]">
                            {formatCompactNumber(ev.goingCount)} Going
                          </span>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() =>
                                handleRsvpEvent(
                                  ev.id,
                                  ev.viewerRsvp === 'going' ? 'none' : 'going'
                                )
                              }
                              className={`min-h-[36px] px-4 rounded-xl text-xs font-semibold cursor-pointer ${
                                ev.viewerRsvp === 'going'
                                  ? 'bg-emerald-500/20 border border-emerald-400 text-emerald-300'
                                  : 'bg-[#6D28D9] text-white'
                              }`}
                            >
                              {ev.viewerRsvp === 'going' ? 'Going ✓' : 'RSVP Going'}
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Community Rules & Charter */}
              <div className="rounded-2xl bg-[#141116] border border-white/10 p-5 space-y-2">
                <h3 className="text-sm font-bold text-[#F5F1F2]">Community Rules</h3>
                <p className="text-xs text-[#A7A0AA] whitespace-pre-line leading-relaxed">
                  {guild.rules || 'Respect spoiler tags, fellow anime fans, and moderators.'}
                </p>
              </div>
            </div>
          )}

          {/* =================================================================
              TAB 5: COMMUNITY COMMAND (MODERATION, INVITES, ROLES, SETTINGS)
              ================================================================= */}
          {tab === 'command' && canCommand && (
            <div className="space-y-6">
              {guild.permissions.canModerate && (
                <section className="rounded-2xl bg-[#141116] border border-white/10 p-5 space-y-3">
                  <h2 className="text-sm font-bold text-[#F5F1F2] flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-[#6D28D9]" />
                    <span>Pending Join Requests ({guild.joinRequests.length})</span>
                  </h2>
                  {guild.joinRequests.length === 0 ? (
                    <p className="text-xs text-[#A7A0AA]">No pending join requests right now.</p>
                  ) : (
                    <div className="space-y-2">
                      {guild.joinRequests.map((req) => (
                        <div
                          key={req.id}
                          className="rounded-xl bg-[#09080B] border border-white/10 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <KageImage
                              src={req.avatarUrl}
                              alt={req.displayName}
                              className="w-9 h-9 rounded-full object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#F5F1F2] truncate">
                                {req.displayName} (@{req.username})
                              </p>
                              {req.note && (
                                <p className="text-[11px] text-[#A7A0AA] truncate">
                                  &ldquo;{req.note}&rdquo;
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              type="button"
                              onClick={() => handleReviewJoinRequest(req.id, 'reject')}
                              className="min-h-[34px] px-3 rounded-lg bg-[#141116] border border-white/10 text-xs text-[#A7A0AA] hover:text-rose-300 cursor-pointer"
                            >
                              Decline
                            </button>
                            <button
                              type="button"
                              onClick={() => handleReviewJoinRequest(req.id, 'approve')}
                              className="min-h-[34px] px-3.5 rounded-lg bg-[#6D28D9] text-xs font-semibold text-white cursor-pointer"
                            >
                              Approve
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {guild.permissions.canModerate && (
                <section className="rounded-2xl bg-[#141116] border border-white/10 p-5 space-y-3">
                  <h2 className="text-sm font-bold text-[#F5F1F2] flex items-center gap-2">
                    <UserPlus className="w-4 h-4 text-[#C0263D]" />
                    <span>Invite Hunters Directly</span>
                  </h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <input
                      type="text"
                      value={inviteQuery}
                      onChange={(e) => setInviteQuery(e.target.value)}
                      placeholder="Search hunter by @username or KAGE ID..."
                      className="min-h-[40px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                    />
                    <input
                      type="text"
                      value={inviteNote}
                      onChange={(e) => setInviteNote(e.target.value)}
                      placeholder="Optional invitation note..."
                      className="min-h-[40px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                    />
                  </div>

                  {inviteResults.length > 0 && (
                    <div className="space-y-1.5 max-h-44 overflow-y-auto">
                      {inviteResults.slice(0, 6).map((u) => (
                        <div
                          key={u.uid}
                          className="rounded-xl bg-[#09080B] border border-white/10 p-2.5 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <KageImage
                              src={u.avatarUrl}
                              alt={u.displayName}
                              className="w-8 h-8 rounded-full object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#F5F1F2] truncate">
                                {u.displayName}
                              </p>
                              <p className="text-[11px] text-[#A7A0AA] truncate">
                                @{u.username} {u.kageId ? `· ${u.kageId}` : ''}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            disabled={sendingInviteUid === u.uid}
                            onClick={() => handleSendDirectInvite(u.uid)}
                            className="min-h-[34px] px-3 rounded-lg bg-[#6D28D9] text-xs font-semibold text-white cursor-pointer"
                          >
                            {sendingInviteUid === u.uid ? 'Sending...' : 'Send Invite'}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {guild.outgoingInvites.length > 0 && (
                    <div className="pt-2 border-t border-white/8 space-y-1.5">
                      <p className="text-xs text-[#A7A0AA]">
                        Pending Outgoing Invites ({guild.outgoingInvites.length})
                      </p>
                      {guild.outgoingInvites.map((inv) => (
                        <div
                          key={inv.id}
                          className="rounded-lg bg-[#09080B] px-3 py-2 flex items-center justify-between text-xs"
                        >
                          <span className="text-[#F5F1F2]">
                            {inv.displayName} (@{inv.username})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRevokeInvite(inv.id)}
                            className="text-rose-300 hover:underline cursor-pointer"
                          >
                            Revoke
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {guild.permissions.canModerate && (
                <section className="rounded-2xl bg-[#141116] border border-white/10 p-5 space-y-4">
                  <h2 className="text-sm font-bold text-[#F5F1F2] flex items-center gap-2">
                    <Shield className="w-4 h-4 text-[#6D28D9]" />
                    <span>Member Roles &amp; Moderation</span>
                  </h2>

                  <div className="space-y-2 max-h-80 overflow-y-auto">
                    {guild.members.map((m) => {
                      const isSelf = user?.uid === m.uid;
                      const isTargetOwner = m.role === 'owner';
                      return (
                        <div
                          key={m.uid}
                          className="rounded-xl bg-[#09080B] border border-white/10 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <KageImage
                              src={m.avatarUrl}
                              alt={m.displayName}
                              className="w-8 h-8 rounded-full object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#F5F1F2] truncate">
                                {m.displayName} (@{m.username})
                              </p>
                              <p className="text-[11px] text-[#A7A0AA] capitalize">
                                Role: {m.role} {m.isMuted ? '· Muted' : ''}
                              </p>
                            </div>
                          </div>

                          {!isSelf && !isTargetOwner && (
                            <div className="flex items-center flex-wrap gap-1.5">
                              {guild.permissions.canManageRoles && (
                                <select
                                  value={m.role}
                                  onChange={(e) =>
                                    handleMemberModAction(m.uid, 'set_role', {
                                      newRole: e.target.value as
                                        | 'admin'
                                        | 'moderator'
                                        | 'member',
                                    })
                                  }
                                  className="min-h-[32px] rounded-lg bg-[#141116] border border-white/10 px-2 text-xs text-[#F5F1F2]"
                                >
                                  <option value="member">Member</option>
                                  <option value="moderator">Moderator</option>
                                  {guild.permissions.canManageOwnership && (
                                    <option value="admin">Admin</option>
                                  )}
                                </select>
                              )}

                              <button
                                type="button"
                                onClick={() =>
                                  handleMemberModAction(
                                    m.uid,
                                    m.isMuted ? 'unmute' : 'mute',
                                    { durationHours: 24 }
                                  )
                                }
                                className="min-h-[32px] px-2.5 rounded-lg bg-[#141116] border border-white/10 text-xs text-[#A7A0AA] hover:text-amber-300 flex items-center gap-1 cursor-pointer"
                              >
                                <VolumeX className="w-3 h-3" />
                                <span>{m.isMuted ? 'Unmute' : 'Mute 24h'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleMemberModAction(m.uid, 'kick')}
                                className="min-h-[32px] px-2.5 rounded-lg bg-[#141116] border border-white/10 text-xs text-[#A7A0AA] hover:text-rose-300 cursor-pointer"
                              >
                                Kick
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  handleMemberModAction(m.uid, 'ban', {
                                    reason: 'Rule violation',
                                  })
                                }
                                className="min-h-[32px] px-2.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-xs text-rose-300 hover:bg-rose-500/25 cursor-pointer"
                              >
                                Ban
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {guild.bannedMembers.length > 0 && (
                    <div className="pt-3 border-t border-white/8 space-y-2">
                      <p className="text-xs font-semibold text-[#F5F1F2] flex items-center gap-1.5">
                        <UserX className="w-3.5 h-3.5 text-rose-400" />
                        <span>Banned Users ({guild.bannedMembers.length})</span>
                      </p>
                      {guild.bannedMembers.map((b) => (
                        <div
                          key={b.id}
                          className="rounded-lg bg-[#09080B] px-3 py-2 flex items-center justify-between text-xs"
                        >
                          <span className="text-[#A7A0AA]">
                            {b.displayName} (@{b.username})
                          </span>
                          <button
                            type="button"
                            onClick={() => handleMemberModAction(b.userUid, 'unban')}
                            className="text-emerald-400 hover:underline cursor-pointer"
                          >
                            Unban
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {guild.permissions.canEditSettings && (
                <section className="rounded-2xl bg-[#141116] border border-white/10 p-5 space-y-4">
                  <h2 className="text-sm font-bold text-[#F5F1F2]">Community Settings</h2>
                  <form onSubmit={handleSaveGuildSettings} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-[#A7A0AA] mb-1">Name</label>
                        <input
                          type="text"
                          required
                          value={settingsName}
                          onChange={(e) => setSettingsName(e.target.value)}
                          className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-[#A7A0AA] mb-1">Category</label>
                        <select
                          value={settingsCategory}
                          onChange={(e) => setSettingsCategory(e.target.value)}
                          className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                        >
                          {GUILD_CATEGORIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs text-[#A7A0AA] mb-1">Visibility</label>
                        <select
                          value={settingsPrivacy}
                          onChange={(e) => {
                            const next = e.target.value as 'public' | 'private';
                            setSettingsPrivacy(next);
                            if (next === 'private' && settingsJoinPolicy === 'open') {
                              setSettingsJoinPolicy('approval');
                            }
                          }}
                          className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                        >
                          <option value="public">Public</option>
                          <option value="private">Private</option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-xs text-[#A7A0AA] mb-1">Join Policy</label>
                        <select
                          value={settingsJoinPolicy}
                          onChange={(e) =>
                            setSettingsJoinPolicy(
                              e.target.value as 'open' | 'approval' | 'invite_only'
                            )
                          }
                          className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                        >
                          {settingsPrivacy === 'public' && <option value="open">Open</option>}
                          <option value="approval">Approval Required</option>
                          <option value="invite_only">Invite Only</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs text-[#A7A0AA] mb-1">Description</label>
                      <textarea
                        rows={2}
                        value={settingsDesc}
                        onChange={(e) => setSettingsDesc(e.target.value)}
                        className="w-full rounded-xl bg-[#09080B] border border-white/10 p-3 text-xs text-[#F5F1F2]"
                      />
                    </div>

                    <div>
                      <label className="block text-xs text-[#A7A0AA] mb-1">Rules</label>
                      <textarea
                        rows={3}
                        value={settingsRules}
                        onChange={(e) => setSettingsRules(e.target.value)}
                        className="w-full rounded-xl bg-[#09080B] border border-white/10 p-3 text-xs text-[#F5F1F2]"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label className="min-h-[38px] rounded-xl bg-[#09080B] border border-dashed border-white/20 px-3 flex items-center gap-2 text-xs text-[#A7A0AA] cursor-pointer">
                        <Upload className="w-3.5 h-3.5 text-[#6D28D9]" />
                        <span>
                          {settingsIconDataUrl ? 'New Avatar Ready' : 'Replace Community Avatar...'}
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f) setSettingsIconDataUrl(await readFileAsDataUrl(f, 8_000_000));
                          }}
                          className="hidden"
                        />
                      </label>
                      <label className="min-h-[38px] rounded-xl bg-[#09080B] border border-dashed border-white/20 px-3 flex items-center gap-2 text-xs text-[#A7A0AA] cursor-pointer">
                        <ImageIcon className="w-3.5 h-3.5 text-[#C0263D]" />
                        <span>
                          {settingsBannerDataUrl
                            ? 'New Banner Ready'
                            : 'Replace Cover Banner...'}
                        </span>
                        <input
                          type="file"
                          accept="image/jpeg,image/png,image/webp"
                          onChange={async (e) => {
                            const f = e.target.files?.[0];
                            if (f)
                              setSettingsBannerDataUrl(await readFileAsDataUrl(f, 8_000_000));
                          }}
                          className="hidden"
                        />
                      </label>
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="submit"
                        disabled={savingSettings}
                        className="min-h-[40px] px-5 rounded-xl bg-[#6D28D9] hover:bg-[#7c3aed] text-xs font-semibold text-white cursor-pointer"
                      >
                        {savingSettings ? 'Saving...' : 'Save Settings'}
                      </button>
                    </div>
                  </form>
                </section>
              )}

              {guild.permissions.canManageOwnership && (
                <section className="rounded-2xl bg-[#141116] border border-white/10 p-5 space-y-4">
                  <h2 className="text-sm font-bold text-[#F5F1F2]">
                    Ownership &amp; Lifecycle
                  </h2>

                  <div className="flex flex-col sm:flex-row gap-2">
                    <select
                      value={transferTargetUid}
                      onChange={(e) => setTransferTargetUid(e.target.value)}
                      className="flex-1 min-h-[40px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                    >
                      <option value="">Select member to transfer ownership...</option>
                      {guild.members
                        .filter((m) => m.uid !== user?.uid && m.role !== 'owner')
                        .map((m) => (
                          <option key={m.uid} value={m.uid}>
                            {m.displayName} (@{m.username})
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={!transferTargetUid}
                      onClick={handleTransferOwnership}
                      className="min-h-[40px] px-4 rounded-xl bg-[#09080B] border border-white/15 disabled:opacity-40 text-xs font-semibold text-[#F5F1F2] cursor-pointer"
                    >
                      Transfer Ownership
                    </button>
                  </div>

                  <div className="pt-3 border-t border-white/8 flex flex-wrap items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        handleArchiveOrDelete(guild.isArchived ? 'unarchive' : 'archive')
                      }
                      className="min-h-[38px] px-4 rounded-xl bg-[#09080B] border border-white/12 text-xs text-[#A7A0AA] hover:text-white cursor-pointer"
                    >
                      {guild.isArchived ? 'Unarchive Community' : 'Archive Community'}
                    </button>

                    {!confirmDeleteStep ? (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteStep(true)}
                        className="min-h-[38px] px-4 rounded-xl bg-rose-500/15 border border-rose-500/30 text-xs font-semibold text-rose-300 cursor-pointer"
                      >
                        Delete Community
                      </button>
                    ) : (
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-rose-300">Permanently delete?</span>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteStep(false)}
                          className="min-h-[36px] px-3 rounded-lg bg-[#09080B] text-xs text-[#A7A0AA] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleArchiveOrDelete('delete')}
                          className="min-h-[36px] px-3.5 rounded-lg bg-[#C0263D] text-xs font-semibold text-white cursor-pointer"
                        >
                          Confirm Delete
                        </button>
                      </div>
                    )}
                  </div>
                </section>
              )}

              {guild.permissions.canModerate && (
                <section className="rounded-2xl bg-[#141116] border border-white/10 p-5 space-y-3">
                  <h2 className="text-sm font-bold text-[#F5F1F2]">Moderation Audit Log</h2>
                  {auditLogs.length === 0 ? (
                    <p className="text-xs text-[#A7A0AA]">No moderation actions recorded yet.</p>
                  ) : (
                    <div className="space-y-1.5 max-h-56 overflow-y-auto text-xs">
                      {auditLogs.map((log) => (
                        <div
                          key={log.id}
                          className="rounded-lg bg-[#09080B] px-3 py-2 flex items-center justify-between gap-2"
                        >
                          <span className="text-[#F5F1F2]">
                            <span className="font-semibold">
                              @{log.actorUsername || 'moderator'}
                            </span>{' '}
                            · {log.actionType.replace(/_/g, ' ')}
                            {log.reason ? ` (${log.reason})` : ''}
                          </span>
                          <span className="text-[11px] text-[#A7A0AA] font-mono-num shrink-0">
                            {new Date(log.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              )}
            </div>
          )}
        </>
      )}

      {/* CREATE CHAT ROOM MODAL */}
      <KageModal
        isOpen={createRoomOpen}
        onClose={() => setCreateRoomOpen(false)}
        title="Create Chat Room"
        maxWidthClass="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateRoomOpen(false)}
              className="min-h-[42px] px-4 rounded-xl bg-[#09080B] border border-white/10 text-xs text-[#A7A0AA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-guild-room-form"
              disabled={creatingRoom}
              className="min-h-[42px] px-4 rounded-xl bg-[#6D28D9] hover:bg-[#7c3aed] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
            >
              {creatingRoom ? 'Creating...' : 'Create Room'}
            </button>
          </div>
        }
      >
        <form id="create-guild-room-form" onSubmit={handleCreateChatRoom} className="space-y-3">
          <div>
            <label className="block text-xs text-[#A7A0AA] mb-1">Room Name / Handle</label>
            <input
              type="text"
              required
              value={newRoomName}
              onChange={(e) => setNewRoomName(e.target.value)}
              placeholder="e.g., episode-watch-live"
              className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#A7A0AA] mb-1">Description</label>
            <input
              type="text"
              required
              value={newRoomDesc}
              onChange={(e) => setNewRoomDesc(e.target.value)}
              placeholder="What is discussed in this room?"
              className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
            />
          </div>
          <div className="flex items-center justify-between gap-2 flex-wrap text-xs">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={newRoomSpoiler}
                onChange={(e) => setNewRoomSpoiler(e.target.checked)}
              />
              <span>Mark as Spoiler Room</span>
            </label>
            <select
              value={newRoomRole}
              onChange={(e) => setNewRoomRole(e.target.value as 'member' | 'moderator')}
              className="rounded-lg bg-[#09080B] border border-white/12 px-2.5 py-1.5 text-xs text-[#F5F1F2]"
            >
              <option value="member">All Members Can Post</option>
              <option value="moderator">Moderators Only</option>
            </select>
          </div>
        </form>
      </KageModal>

      {/* CREATE EVENT MODAL */}
      <KageModal
        isOpen={createEventOpen}
        onClose={() => setCreateEventOpen(false)}
        title="Schedule Community Event"
        maxWidthClass="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateEventOpen(false)}
              className="min-h-[42px] px-4 rounded-xl bg-[#09080B] border border-white/10 text-xs text-[#A7A0AA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="create-guild-event-form"
              disabled={creatingEvent}
              className="min-h-[42px] px-4 rounded-xl bg-[#6D28D9] hover:bg-[#7c3aed] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
            >
              {creatingEvent ? 'Scheduling...' : 'Create Event'}
            </button>
          </div>
        }
      >
        <form id="create-guild-event-form" onSubmit={handleCreateEvent} className="space-y-3">
          <div>
            <label className="block text-xs text-[#A7A0AA] mb-1">Event Title</label>
            <input
              type="text"
              required
              value={eventTitle}
              onChange={(e) => setEventTitle(e.target.value)}
              placeholder="e.g., Weekend Anime Watch Party"
              className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#A7A0AA] mb-1">Date &amp; Time</label>
            <input
              type="datetime-local"
              value={eventStartsAt}
              onChange={(e) => setEventStartsAt(e.target.value)}
              className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#A7A0AA] mb-1">Location / Channel</label>
            <input
              type="text"
              value={eventLocation}
              onChange={(e) => setEventLocation(e.target.value)}
              className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
            />
          </div>
          <div>
            <label className="block text-xs text-[#A7A0AA] mb-1">Description</label>
            <textarea
              rows={2}
              value={eventDesc}
              onChange={(e) => setEventDesc(e.target.value)}
              className="w-full rounded-xl bg-[#09080B] border border-white/12 p-3 text-xs text-[#F5F1F2]"
            />
          </div>
        </form>
      </KageModal>

      {reportTarget && (
        <ReportModal
          isOpen={Boolean(reportTarget)}
          onClose={() => setReportTarget(null)}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          targetLabel={reportTarget.label}
        />
      )}
    </div>
  );
};

// ============================================================================
// REAL-TIME COMMUNITY CHAT ROOM PAGE (/guilds/:slug/rooms/:roomSlug)
// ============================================================================

export const CommunityChatRoomPage: React.FC = () => {
  const { slug = '', roomSlug = '' } = useParams();
  const navigate = useNavigate();
  const { user, wsConnected, sendWsMessage, subscribeWs } = useAuth();

  const [guild, setGuild] = useState<GuildDetail | null>(null);
  const [room, setRoom] = useState<CommunityChatRoomItem | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [text, setText] = useState('');
  const [mediaDataUrl, setMediaDataUrl] = useState('');
  const [replyTo, setReplyTo] = useState<any | null>(null);
  const [reactionMsgId, setReactionMsgId] = useState<number | null>(null);
  const [sending, setSending] = useState(false);
  const [joiningCommunity, setJoiningCommunity] = useState(false);
  const [revealedSpoilers, setRevealedSpoilers] = useState<Record<number, boolean>>({});
  const [typingNames, setTypingNames] = useState<Record<string, string>>({});

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const loadRoomData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const gRes = await apiFetch<{ guild: GuildDetail }>(
        `/api/communities/${encodeURIComponent(slug)}`
      );
      setGuild(gRes.guild);
      const mRes = await apiFetch<{ room: CommunityChatRoomItem; items: any[] }>(
        `/api/communities/${gRes.guild.id}/chat-rooms/${encodeURIComponent(roomSlug)}/messages?limit=80`
      );
      setRoom(mRes.room);
      setMessages(mRes.items || []);
    } catch (err: any) {
      setError(err.message || 'Chat room could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [slug, roomSlug]);

  useEffect(() => {
    loadRoomData();
  }, [loadRoomData]);

  useEffect(() => {
    if (!wsConnected || !room?.id || !guild?.id) return;
    sendWsMessage({
      type: 'community_room:join',
      communityId: guild.id,
      roomId: room.id,
    });
    return () => {
      sendWsMessage({ type: 'community_room:leave', roomId: room.id });
    };
  }, [wsConnected, room?.id, guild?.id, sendWsMessage]);

  useEffect(() => {
    return subscribeWs((msg) => {
      if (!room || Number(msg.roomId) !== room.id) return;
      if (msg.type === 'community_room:message' && msg.message) {
        setMessages((prev) =>
          prev.some((m) => m.id === msg.message.id) ? prev : [...prev, msg.message]
        );
      }
      if (msg.type === 'community_room:reaction' && msg.messageId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.messageId ? { ...m, reactions: msg.reactions || [] } : m
          )
        );
      }
      if (msg.type === 'community_room:deleted' && msg.messageId) {
        setMessages((prev) => prev.filter((m) => m.id !== msg.messageId));
      }
      if (msg.type === 'community_room:typing' && msg.uid && msg.uid !== user?.uid) {
        if (msg.isTyping) {
          setTypingNames((prev) => ({ ...prev, [msg.uid]: msg.username || 'member' }));
        } else {
          setTypingNames((prev) => {
            const next = { ...prev };
            delete next[msg.uid];
            return next;
          });
        }
      }
    });
  }, [room, subscribeWs, user?.uid]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  const handleJoinAndUnlock = async () => {
    if (!user || !guild) {
      navigate(
        `/auth/login?redirect=${encodeURIComponent(`/guilds/${slug}/rooms/${roomSlug}`)}`
      );
      return;
    }
    setJoiningCommunity(true);
    try {
      await apiFetch(`/api/communities/${guild.id}/membership`, {
        method: 'POST',
        body: JSON.stringify({ action: 'join' }),
      });
      await loadRoomData();
    } catch (err: any) {
      setError(err.message || 'Could not join community.');
    } finally {
      setJoiningCommunity(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !guild || !room) {
      navigate(
        `/auth/login?redirect=${encodeURIComponent(`/guilds/${slug}/rooms/${roomSlug}`)}`
      );
      return;
    }
    if (!text.trim() && !mediaDataUrl) return;
    setSending(true);
    try {
      const res = await apiFetch<{ message: any }>(
        `/api/communities/${guild.id}/chat-rooms/${encodeURIComponent(room.slug)}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: text.trim(),
            replyToId: replyTo?.id || null,
            mediaDataUrl: mediaDataUrl || undefined,
            mediaType: mediaDataUrl ? 'image' : 'none',
          }),
        }
      );
      kageSound.play('msg_outgoing');
      setText('');
      setMediaDataUrl('');
      setReplyTo(null);
      sendWsMessage({ type: 'community_room:typing', roomId: room.id, isTyping: false });
      if (res.message) {
        setMessages((prev) =>
          prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
        );
      }
    } catch (err: any) {
      setError(err.message || 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  const handleToggleReaction = async (messageId: number, emoji: string) => {
    if (!user || !guild || !room) return;
    setReactionMsgId(null);
    try {
      const res = await apiFetch<{ reactions: any[] }>(
        `/api/communities/${guild.id}/chat-rooms/${encodeURIComponent(room.slug)}/messages/${messageId}/react`,
        {
          method: 'POST',
          body: JSON.stringify({ emoji }),
        }
      );
      setMessages((prev) =>
        prev.map((m) => (m.id === messageId ? { ...m, reactions: res.reactions || [] } : m))
      );
    } catch {
      // ignore
    }
  };

  const handleDeleteMsg = async (messageId: number) => {
    if (!guild || !room) return;
    try {
      await apiFetch(
        `/api/communities/${guild.id}/chat-rooms/${encodeURIComponent(room.slug)}/messages/${messageId}`,
        { method: 'DELETE' }
      );
      setMessages((prev) => prev.filter((m) => m.id !== messageId));
    } catch {
      // ignore
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4">
        <div className="h-16 rounded-2xl bg-[#141116] animate-pulse" />
        <div className="h-[65dvh] rounded-2xl bg-[#141116] animate-pulse" />
      </div>
    );
  }

  if (!guild || !room) {
    return (
      <div className="max-w-lg mx-auto p-8 rounded-2xl bg-[#141116] border border-white/10 text-center space-y-3">
        <p className="text-sm text-rose-400">{error || 'Chat room not found.'}</p>
        <Link
          to={`/guilds/${slug}?tab=rooms`}
          className="inline-flex min-h-[42px] px-4 items-center rounded-xl bg-[#6D28D9] text-white text-xs font-semibold"
        >
          Back to Chat Rooms
        </Link>
      </div>
    );
  }

  const isMod = Boolean(guild.permissions?.canModerate);
  const canPost =
    guild.isMember && (room.postingRole !== 'moderator' || isMod || user?.role === 'owner');
  const activeTypers = Object.values(typingNames);

  return (
    <div className="max-w-3xl mx-auto flex flex-col -mx-3.5 sm:mx-auto -my-3 sm:my-0 h-[100dvh] lg:h-[calc(100dvh_-_6.5rem)] rounded-none sm:rounded-3xl overflow-hidden bg-[#0E0C13] sm:border border-white/10">
      {/* Room Header */}
      <div className="px-4 py-3 bg-[#141116] border-b border-white/10 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            to={`/guilds/${guild.slug}?tab=rooms`}
            className="min-h-[38px] min-w-[38px] rounded-xl bg-[#09080B] border border-white/10 flex items-center justify-center text-[#F5F1F2] hover:bg-white/5 shrink-0"
            aria-label="Back to Chat Rooms"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="w-9 h-9 rounded-full overflow-hidden border border-[#7C3AED] bg-[#09080B] shrink-0">
            <KageImage
              src={guild.artworkUrl}
              alt={guild.name}
              className="w-full h-full object-cover"
            />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <Hash className="w-4 h-4 text-[#A78BFA] shrink-0" />
              <h1 className="text-sm sm:text-base font-bold text-[#F5F1F2] truncate">
                {room.slug}
              </h1>
              {room.isSpoiler && (
                <span className="text-[10px] font-bold uppercase text-rose-400 border border-rose-500/50 px-1.5 py-0.5 rounded">
                  SPOILER
                </span>
              )}
            </div>
            <p className="text-[11px] text-[#A7A0AA] truncate">
              {guild.name} · {room.description}
            </p>
          </div>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-rose-500/15 border-b border-rose-500/30 text-xs text-rose-300 flex items-center justify-between">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            className="text-rose-200 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Message Stream */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-4 space-y-3 kage-thin-scrollbar"
      >
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center space-y-2">
            <Hash className="w-8 h-8 text-[#7C3AED]" />
            <p className="text-sm font-bold text-[#F5F1F2]">Welcome to #{room.slug}</p>
            <p className="text-xs text-[#A7A0AA] max-w-sm">{room.description}</p>
          </div>
        ) : (
          messages.map((m) => {
            const canDelete = Boolean(isMod || (user && m.senderUid === user.uid));
            const hiddenSpoiler =
              room.isSpoiler && !revealedSpoilers[m.id] && m.senderUid !== user?.uid;
            return (
              <div
                key={m.id}
                className="group rounded-2xl bg-[#141116] border border-white/8 p-3 space-y-1.5"
              >
                {m.replyPreview && (
                  <div className="pl-2.5 border-l-2 border-[#7C3AED] text-[11px] text-[#A7A0AA] truncate">
                    Replying to @{m.replyPreview.senderUsername}: {m.replyPreview.content}
                  </div>
                )}

                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2.5 min-w-0 flex-1">
                    <Link
                      to={`/profile/${m.sender.username}`}
                      className="w-8 h-8 rounded-full overflow-hidden bg-[#09080B] shrink-0 mt-0.5"
                    >
                      <KageImage
                        src={m.sender.avatarUrl}
                        alt={m.sender.displayName}
                        className="w-full h-full object-cover"
                      />
                    </Link>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap text-xs">
                        <Link
                          to={`/profile/${m.sender.username}`}
                          className="font-bold text-[#F5F1F2] hover:underline"
                        >
                          {m.sender.displayName}
                        </Link>
                        <OwnerBadge role={m.sender.role} size="xs" />
                        <span className="text-[11px] text-[#A7A0AA]">
                          @{m.sender.username} · {formatCommunityPostTime(m.createdAt)}
                        </span>
                      </div>

                      {hiddenSpoiler ? (
                        <button
                          type="button"
                          onClick={() =>
                            setRevealedSpoilers((prev) => ({ ...prev, [m.id]: true }))
                          }
                          className="mt-1 px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/35 text-xs text-rose-200 inline-flex items-center gap-1.5 cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Spoiler hidden · Tap to reveal</span>
                        </button>
                      ) : (
                        <>
                          {m.content && (
                            <p className="text-xs sm:text-sm text-[#F5F1F2]/95 break-words mt-1 leading-relaxed">
                              {m.content}
                            </p>
                          )}
                          {m.mediaUrl && (
                            <div className="mt-2 rounded-xl overflow-hidden max-w-xs border border-white/10">
                              <KageImage
                                src={m.mediaUrl}
                                alt="Attachment"
                                className="w-full max-h-64 object-cover"
                              />
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 shrink-0">
                    <button
                      type="button"
                      onClick={() =>
                        setReactionMsgId((prev) => (prev === m.id ? null : m.id))
                      }
                      className="p-1 text-[#A7A0AA] hover:text-white cursor-pointer"
                      aria-label="React"
                    >
                      <Smile className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setReplyTo(m);
                        inputRef.current?.focus();
                      }}
                      className="p-1 text-[#A7A0AA] hover:text-white cursor-pointer"
                      aria-label="Reply"
                    >
                      <Reply className="w-3.5 h-3.5" />
                    </button>
                    {canDelete && (
                      <button
                        type="button"
                        onClick={() => handleDeleteMsg(m.id)}
                        className="p-1 text-[#A7A0AA] hover:text-rose-400 cursor-pointer"
                        aria-label="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {reactionMsgId === m.id && (
                  <div className="flex items-center gap-1.5 bg-[#09080B] border border-white/12 rounded-xl px-2.5 py-1 w-fit ml-10">
                    {CHAT_ROOM_REACTIONS.map((emoji) => (
                      <button
                        key={emoji}
                        type="button"
                        onClick={() => handleToggleReaction(m.id, emoji)}
                        className="text-sm hover:scale-125 transition-transform px-1 cursor-pointer"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                )}

                {Array.isArray(m.reactions) && m.reactions.length > 0 && (
                  <div className="flex items-center flex-wrap gap-1.5 pl-10 pt-0.5">
                    {m.reactions.map((rx: any) => {
                      const mine = Boolean(user?.uid && rx.uids?.includes(user.uid));
                      return (
                        <button
                          key={rx.emoji}
                          type="button"
                          onClick={() => handleToggleReaction(m.id, rx.emoji)}
                          className={`px-2 py-0.5 rounded-lg text-[11px] inline-flex items-center gap-1 border cursor-pointer ${
                            mine
                              ? 'bg-[#6D28D9]/25 border-[#6D28D9] text-white'
                              : 'bg-[#09080B] border-white/10 text-[#A7A0AA]'
                          }`}
                        >
                          <span>{rx.emoji}</span>
                          <span className="font-mono-num">{rx.count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Composer Footer */}
      <div className="p-3 bg-[#141116] border-t border-white/10 shrink-0 space-y-2">
        {activeTypers.length > 0 && (
          <p className="text-[11px] text-[#A7A0AA]">
            @{activeTypers.slice(0, 2).join(', @')} typing...
          </p>
        )}

        {!guild.isMember ? (
          <button
            type="button"
            disabled={joiningCommunity}
            onClick={handleJoinAndUnlock}
            className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#EC4899] text-white text-xs sm:text-sm font-bold cursor-pointer"
          >
            {joiningCommunity ? 'Joining...' : `Join ${guild.name} to Chat in #${room.slug}`}
          </button>
        ) : !canPost ? (
          <div className="min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 flex items-center justify-center text-xs text-[#A7A0AA]">
            Only community moderators &amp; admins can post in #{room.slug}.
          </div>
        ) : (
          <>
            {replyTo && (
              <div className="px-3 py-1.5 rounded-xl bg-[#09080B] border border-white/10 flex items-center justify-between text-xs text-[#A7A0AA]">
                <span className="truncate">
                  Replying to <strong className="text-[#F5F1F2]">@{replyTo.sender.username}</strong>
                </span>
                <button
                  type="button"
                  onClick={() => setReplyTo(null)}
                  className="text-[#A7A0AA] hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {mediaDataUrl && (
              <div className="px-3 py-1.5 rounded-xl bg-[#09080B] border border-white/10 flex items-center justify-between text-xs text-[#F5F1F2]">
                <span>Image attached</span>
                <button
                  type="button"
                  onClick={() => setMediaDataUrl('')}
                  className="text-[#A7A0AA] hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <label className="min-h-[42px] min-w-[42px] rounded-xl bg-[#09080B] border border-white/12 flex items-center justify-center text-[#A7A0AA] hover:text-white cursor-pointer shrink-0">
                <ImageIcon className="w-4 h-4 text-[#7C3AED]" />
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/gif"
                  onChange={async (e) => {
                    const f = e.target.files?.[0];
                    if (f) {
                      try {
                        setMediaDataUrl(await readFileAsDataUrl(f, 6 * 1024 * 1024));
                      } catch (err: any) {
                        setError(err.message);
                      }
                    }
                  }}
                  className="hidden"
                />
              </label>

              <input
                ref={inputRef}
                type="text"
                value={text}
                onChange={(e) => {
                  setText(e.target.value);
                  sendWsMessage({
                    type: 'community_room:typing',
                    roomId: room.id,
                    isTyping: e.target.value.trim().length > 0,
                  });
                }}
                placeholder={`Message #${room.slug}...`}
                className="flex-1 min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3.5 text-xs sm:text-sm text-[#F5F1F2] placeholder-[#A7A0AA]/65 focus:outline-none focus:border-[#7C3AED]"
              />

              <button
                type="submit"
                disabled={sending}
                className="min-h-[42px] px-4 rounded-xl bg-[#7C3AED] hover:bg-[#6D28D9] disabled:opacity-50 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

