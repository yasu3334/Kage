import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  Ban,
  Camera,
  Check,
  Crown,
  Edit3,
  Flag,
  Loader2,
  Lock,
  MessageCircle,
  Search,
  Share2,
  Star,
  Trash2,
  UserCheck,
  UserPlus,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { KageImage } from '../components/KageImage';
import { OwnerBadge } from '../components/KageBrand';
import { RecommendationEnginePanel } from '../components/RecommendationEnginePanel';
import { ReportModal } from '../components/ReportModal';
import { KageModal } from '../components/KageModal';
import { PRESET_AVATARS } from '../lib/assets';
import { ALL_GENRE_NAMES } from '../lib/genres';
import { formatCompactNumber } from '../lib/formatters';

const GENRE_CHOICES = ALL_GENRE_NAMES;

interface ProfileConnectionItem {
  uid: string;
  kageId?: string | null;
  username: string;
  role?: string;
  isAiDemo?: boolean;
  displayName: string;
  avatarUrl: string;
  bio?: string;
  shadowLabel?: string;
  favouriteCharacter?: string;
  favouriteCharacterAnime?: string;
  followedAt?: string;
  viewerFollowing?: boolean;
}

export const ProfilePage: React.FC = () => {
  const { username: routeUsername } = useParams();
  const navigate = useNavigate();
  const { user, refreshMe, bumpTasteRevision } = useAuth();

  const targetIdentifier = routeUsername || user?.username || '';

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<
    'posts' | 'recommendations' | 'watchlist' | 'guilds' | 'comments' | 'activity'
  >('posts');
  const [copiedProfile, setCopiedProfile] = useState(false);

  // Edit Profile Modal
  const [editOpen, setEditOpen] = useState(false);
  const [editUsername, setEditUsername] = useState('');
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editBio, setEditBio] = useState('');
  const [editAvatar, setEditAvatar] = useState('');
  const [editGenres, setEditGenres] = useState<string[]>([]);
  const [editPrivate, setEditPrivate] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState('');

  // Paginated Followers / Followings Modal
  const [connectionsModalType, setConnectionsModalType] = useState<'followers' | 'following' | null>(
    null
  );
  const [connectionsQuery, setConnectionsQuery] = useState('');
  const [connectionsItems, setConnectionsItems] = useState<ProfileConnectionItem[]>([]);
  const [connectionsTotal, setConnectionsTotal] = useState(0);
  const [connectionsHasMore, setConnectionsHasMore] = useState(false);
  const [connectionsLoading, setConnectionsLoading] = useState(false);
  const [connectionsLoadingMore, setConnectionsLoadingMore] = useState(false);

  const [reportOpen, setReportOpen] = useState(false);

  const loadProfile = useCallback(async () => {
    if (!targetIdentifier) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await apiFetch(`/api/profiles/${encodeURIComponent(targetIdentifier)}`);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Could not load profile.');
    } finally {
      setLoading(false);
    }
  }, [targetIdentifier]);

  useEffect(() => {
    setConnectionsModalType(null);
    loadProfile();
  }, [loadProfile]);

  const fetchConnections = useCallback(
    async (
      connType: 'followers' | 'following',
      offsetNum = 0,
      append = false,
      searchText = ''
    ) => {
      if (!data?.user?.username) return;
      if (append) setConnectionsLoadingMore(true);
      else setConnectionsLoading(true);
      try {
        const params = new URLSearchParams({
          type: connType,
          limit: '30',
          offset: String(offsetNum),
        });
        if (searchText.trim()) {
          params.set('q', searchText.trim());
        }
        const res = await apiFetch<{
          items: ProfileConnectionItem[];
          total: number;
          demoCount: number;
          humanCount: number;
          hasMore: boolean;
        }>(
          `/api/profiles/${encodeURIComponent(data.user.username)}/connections?${params.toString()}`
        );
        setConnectionsItems((prev) => (append ? [...prev, ...(res.items || [])] : res.items || []));
        setConnectionsTotal(res.total || 0);
        setConnectionsHasMore(Boolean(res.hasMore));
      } catch {
        if (!append) {
          setConnectionsItems([]);
          setConnectionsTotal(0);
          setConnectionsHasMore(false);
        }
      } finally {
        setConnectionsLoading(false);
        setConnectionsLoadingMore(false);
      }
    },
    [data?.user?.username]
  );

  useEffect(() => {
    if (!connectionsModalType) return;
    const timer = setTimeout(() => {
      fetchConnections(connectionsModalType, 0, false, connectionsQuery);
    }, 180);
    return () => clearTimeout(timer);
  }, [connectionsModalType, connectionsQuery, fetchConnections]);

  const openConnectionsModal = (connType: 'followers' | 'following') => {
    setConnectionsQuery('');
    setConnectionsItems([]);
    setConnectionsModalType(connType);
  };

  const openEditModal = () => {
    if (!data) return;
    setEditUsername(data.user.username || '');
    setEditDisplayName(data.profile?.displayName || '');
    setEditBio(data.profile?.bio || '');
    setEditAvatar(data.profile?.avatarUrl || 'asset:avatar_default');
    setEditGenres(data.profile?.favoriteGenres || []);
    setEditPrivate(Boolean(data.profile?.isPrivate));
    setEditError('');
    setEditOpen(true);
  };

  const handleAvatarUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const size = 320;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const minSide = Math.min(img.width, img.height);
          const sx = (img.width - minSide) / 2;
          const sy = (img.height - minSide) / 2;
          ctx.drawImage(img, sx, sy, minSide, minSide, 0, 0, size, size);
          setEditAvatar(canvas.toDataURL('image/jpeg', 0.85));
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingEdit(true);
    setEditError('');
    try {
      const updated = await apiFetch('/api/me/profile', {
        method: 'PUT',
        body: JSON.stringify({
          username: editUsername.trim(),
          displayName: editDisplayName.trim(),
          bio: editBio.trim(),
          avatarUrl: editAvatar,
          favoriteGenres: editGenres,
          isPrivate: editPrivate,
        }),
      });
      await refreshMe();
      bumpTasteRevision();
      setEditOpen(false);
      if (routeUsername && updated?.user?.username && updated.user.username !== routeUsername) {
        navigate(`/profile/${updated.user.username}`, { replace: true });
      } else {
        await loadProfile();
      }
    } catch (err: any) {
      setEditError(err.message || 'Failed to save profile.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleFollowToggle = async () => {
    if (!user || !data) {
      navigate('/auth/login');
      return;
    }
    try {
      const res = await apiFetch(`/api/users/${data.user.uid}/follow`, { method: 'POST' });
      setData((prev: any) => ({
        ...prev,
        isFollowing: res.following,
        stats: {
          ...prev.stats,
          followersCount: Math.max(
            0,
            prev.stats.followersCount + (res.following ? 1 : -1)
          ),
          organicFollowersCount: Math.max(
            0,
            (prev.stats.organicFollowersCount || 0) + (res.following ? 1 : -1)
          ),
        },
      }));
    } catch (err: any) {
      setError(err.message || 'Follow action failed.');
    }
  };

  const handleBlockToggle = async () => {
    if (!user || !data) return;
    try {
      const res = await apiFetch(`/api/users/${data.user.uid}/block`, { method: 'POST' });
      setData((prev: any) => ({
        ...prev,
        isBlocked: res.blocked,
        isFollowing: res.blocked ? false : prev.isFollowing,
      }));
    } catch (err: any) {
      setError(err.message || 'Block action failed.');
    }
  };

  const handleStartDirectMessage = async () => {
    if (!user || !data) {
      navigate('/auth/login');
      return;
    }
    try {
      const res = await apiFetch('/api/inbox', {
        method: 'POST',
        body: JSON.stringify({ targetUids: [data.user.uid] }),
      });
      navigate(`/inbox?conv=${res.conversation.id}`);
    } catch (err: any) {
      setError(err.message || 'Could not start message.');
    }
  };

  const handleShareProfile = async () => {
    if (!data) return;
    const url = `${window.location.origin}/profile/${data.user.username}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedProfile(true);
      setTimeout(() => setCopiedProfile(false), 2200);
    } catch {
      // ignore
    }
  };

  const handleRemoveWatchlistItem = async (malId: number) => {
    try {
      await apiFetch(`/api/me/anime/${malId}`, { method: 'DELETE' });
      setData((prev: any) => ({
        ...prev,
        watchlist: (prev.watchlist || []).filter((item: any) => item.animeMalId !== malId),
      }));
      bumpTasteRevision();
    } catch {
      // ignore
    }
  };

  if (!targetIdentifier && !user) {
    return (
      <div className="p-8 rounded-2xl bg-[#141116] border border-white/10 text-center space-y-4">
        <h2 className="text-lg font-bold text-[#F5F1F2]">Sign in to view your Hunter Profile</h2>
        <p className="text-xs text-[#A7A0AA]">
          Track watched anime, customize your avatar, and unlock personalized KAGE recommendations.
        </p>
        <Link
          to="/auth/welcome"
          className="inline-flex min-h-[44px] px-6 items-center rounded-xl bg-[#C0263D] text-white text-xs font-semibold"
        >
          Sign In / Create Account
        </Link>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-5 max-w-4xl mx-auto">
        <div className="h-64 rounded-2xl bg-[#141116] animate-pulse" />
        <div className="h-44 rounded-2xl bg-[#141116] animate-pulse" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-8 rounded-2xl bg-[#141116] border border-white/10 text-center space-y-3">
        <p className="text-sm text-rose-400">{error || 'Hunter profile not found.'}</p>
        <Link
          to="/"
          className="inline-flex min-h-[42px] px-5 items-center rounded-xl bg-[#141116] border border-white/12 text-xs text-[#F5F1F2]"
        >
          Back to Realms
        </Link>
      </div>
    );
  }

  const favoriteAnimeName =
    data.aiDemoMeta?.favoriteAnime || data.profile?.favouriteCharacterAnime || '';
  const favoriteCharName =
    data.aiDemoMeta?.favoriteCharacter || data.profile?.favouriteCharacter || '';
  const hasBanner = Boolean(data.profile?.bannerUrl);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Centered Hunter Profile Card */}
      <div
        className={`rounded-2xl bg-[#141116] flex flex-col items-center text-center relative overflow-hidden ${
          data.user.role === 'owner'
            ? 'border border-amber-400/55 shadow-[0_0_32px_rgba(251,191,36,0.12)]'
            : 'border border-white/10'
        }`}
      >
        {/* Optional Profile Banner */}
        {hasBanner ? (
          <div className="w-full h-28 sm:h-36 relative overflow-hidden bg-[#09080B]">
            <KageImage
              src={data.profile.bannerUrl}
              alt={`${data.profile?.displayName || data.user.username} banner`}
              className="w-full h-full object-cover opacity-80"
            />
            <div className="absolute inset-0 bg-gradient-to-b from-black/25 via-transparent to-[#141116]" />
          </div>
        ) : (
          data.user.role === 'owner' && (
            <div className="absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-amber-500/15 via-[#C0263D]/10 to-transparent pointer-events-none" />
          )
        )}

        {!data.isOwner && user && (
          <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5">
            {data.user.role !== 'owner' && (
              <button
                type="button"
                onClick={handleBlockToggle}
                className="min-h-[38px] px-2.5 rounded-lg bg-[#09080B]/90 backdrop-blur-sm border border-white/12 text-[11px] text-[#A7A0AA] hover:text-rose-400 flex items-center gap-1 cursor-pointer"
                title={data.isBlocked ? 'Unblock user' : 'Block user'}
              >
                <Ban className="w-3.5 h-3.5" />
                <span>{data.isBlocked ? 'Unblock' : 'Block'}</span>
              </button>
            )}
            <button
              type="button"
              onClick={() => setReportOpen(true)}
              className="min-h-[38px] min-w-[38px] rounded-lg bg-[#09080B]/90 backdrop-blur-sm border border-white/12 flex items-center justify-center text-[#A7A0AA] hover:text-white cursor-pointer"
              aria-label="Report user"
            >
              <Flag className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        <div
          className={`w-full px-6 sm:px-8 pb-6 sm:pb-8 flex flex-col items-center ${
            hasBanner ? '-mt-12 sm:-mt-14' : 'pt-6 sm:pt-8'
          }`}
        >
          {/* Avatar with Online Presence Ring & Owner Crown Aura */}
          <div className="relative z-10">
            <div
              className={`w-24 h-24 sm:w-28 sm:h-28 rounded-full overflow-hidden bg-[#09080B] ${
                data.user.role === 'owner'
                  ? 'border-2 border-amber-400 ring-4 ring-amber-400/20 shadow-[0_0_24px_rgba(251,191,36,0.3)]'
                  : 'border-2 border-amber-400/75 ring-4 ring-[#141116]'
              }`}
            >
              <KageImage
                src={data.profile?.avatarUrl}
                alt={data.profile?.displayName || data.user.username}
                className="w-full h-full object-cover"
              />
            </div>
            {data.isOnline && (
              <span
                className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-emerald-400 border-2 border-[#141116]"
                title="Online now"
              />
            )}
          </div>

          <h1 className="relative z-10 text-xl sm:text-2xl font-bold text-[#F5F1F2] mt-3">
            {data.profile?.displayName || data.user.username}
          </h1>
          <p className="relative z-10 text-xs sm:text-sm text-[#A7A0AA]">
            @{data.user.username}
            {data.user.kageId ? (
              <span className="font-mono-num text-[#A7A0AA]/80"> · {data.user.kageId}</span>
            ) : null}
          </p>

          {data.user.role && data.user.role !== 'user' && (
            <div className="relative z-10 mt-2">
              <OwnerBadge
                role={data.user.role}
                size="md"
                showTitle={data.user.role === 'owner'}
              />
            </div>
          )}

          {data.profile?.bio && (
            <p
              className={`relative z-10 text-xs sm:text-sm max-w-lg mt-3 leading-relaxed ${
                data.user.role === 'owner'
                  ? 'text-amber-100/95 font-medium'
                  : 'text-[#F5F1F2]/85'
              }`}
            >
              &ldquo;{data.profile.bio}&rdquo;
            </p>
          )}

          {(favoriteAnimeName || favoriteCharName) && (
            <p className="relative z-10 text-xs text-[#A7A0AA] mt-2 max-w-lg">
              {favoriteAnimeName && (
                <span>
                  Favorite Anime:{' '}
                  <span className="text-[#F5F1F2] font-medium">{favoriteAnimeName}</span>
                </span>
              )}
              {favoriteAnimeName && favoriteCharName && <span> · </span>}
              {favoriteCharName && (
                <span>
                  Favorite Character:{' '}
                  <span className="text-[#F5F1F2] font-medium">{favoriteCharName}</span>
                </span>
              )}
            </p>
          )}

          {data.profile?.favoriteGenres?.length > 0 && (
            <p className="relative z-10 text-xs text-[#A7A0AA] mt-1.5 max-w-lg">
              {data.profile.favoriteGenres.join(' · ')}
            </p>
          )}

          {/* 4-Column Tabular Stats Row — Posts | Followers | Followings | Guilds */}
          <div className="relative z-10 grid grid-cols-4 gap-4 sm:gap-10 w-full max-w-md mt-6 pt-5 border-t border-white/8">
            <button
              type="button"
              onClick={() => setActiveTab('posts')}
              className="text-center hover:opacity-85 transition-opacity cursor-pointer"
            >
              <p className="font-mono-num text-base sm:text-lg font-bold text-[#F5F1F2]">
                {formatCompactNumber(data.stats.postsCount)}
              </p>
              <p className="text-[11px] text-[#A7A0AA]">Posts</p>
            </button>
            <button
              type="button"
              onClick={() => openConnectionsModal('followers')}
              className="text-center hover:opacity-85 transition-opacity cursor-pointer"
            >
              <p className="font-mono-num text-base sm:text-lg font-bold text-[#F5F1F2]">
                {formatCompactNumber(data.stats.followersCount)}
              </p>
              <p className="text-[11px] text-[#A7A0AA] hover:text-[#F5F1F2]">Followers</p>
            </button>
            <button
              type="button"
              onClick={() => openConnectionsModal('following')}
              className="text-center hover:opacity-85 transition-opacity cursor-pointer"
            >
              <p className="font-mono-num text-base sm:text-lg font-bold text-[#F5F1F2]">
                {formatCompactNumber(data.stats.followingCount)}
              </p>
              <p className="text-[11px] text-[#A7A0AA] hover:text-[#F5F1F2]">Followings</p>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('guilds')}
              className="text-center hover:opacity-85 transition-opacity cursor-pointer"
            >
              <p className="font-mono-num text-base sm:text-lg font-bold text-[#F5F1F2]">
                {formatCompactNumber(data.stats.guildsCount)}
              </p>
              <p className="text-[11px] text-[#A7A0AA]">Guilds</p>
            </button>
          </div>

          {/* Action Buttons Row */}
          <div className="relative z-10 flex flex-wrap items-center justify-center gap-3 mt-6 w-full max-w-md">
            {data.isOwner ? (
              <>
                {(user?.role === 'owner' || user?.role === 'admin') && (
                  <Link
                    to="/admin"
                    className="w-full min-h-[44px] px-4 rounded-xl bg-gradient-to-r from-amber-500/25 via-[#C0263D]/30 to-[#6D28D9]/25 hover:from-amber-500/35 hover:to-[#C0263D]/35 border border-amber-400/60 text-xs sm:text-sm font-bold text-amber-200 flex items-center justify-center gap-2 whitespace-nowrap transition-colors"
                  >
                    <Crown className="w-4 h-4 text-amber-400 fill-amber-400" />
                    <span>Open Sovereign Admin Panel</span>
                  </Link>
                )}
                <button
                  type="button"
                  onClick={openEditModal}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#09080B] hover:bg-[#1C1720] border border-white/15 text-xs sm:text-sm font-semibold text-[#F5F1F2] flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  <Edit3 className="w-4 h-4 text-[#C0263D]" />
                  <span>Edit Profile</span>
                </button>
                <button
                  type="button"
                  onClick={handleShareProfile}
                  className="flex-1 min-h-[44px] px-4 rounded-xl bg-[#09080B] hover:bg-[#1C1720] border border-white/15 text-xs sm:text-sm font-semibold text-[#F5F1F2] flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  {copiedProfile ? (
                    <>
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span className="text-emerald-400">Link Copied</span>
                    </>
                  ) : (
                    <>
                      <Share2 className="w-4 h-4 text-[#6D28D9]" />
                      <span>Share Profile</span>
                    </>
                  )}
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={handleFollowToggle}
                  className={`flex-1 min-h-[44px] px-5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer ${
                    data.isFollowing
                      ? 'bg-[#09080B] border border-white/15 text-[#F5F1F2]'
                      : 'bg-[#6D28D9] hover:bg-[#7c3aed] text-white'
                  }`}
                >
                  {data.isFollowing ? (
                    <>
                      <UserCheck className="w-4 h-4" />
                      <span>Following</span>
                    </>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Follow</span>
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={handleStartDirectMessage}
                  className="flex-1 min-h-[44px] px-5 rounded-xl bg-[#09080B] hover:bg-[#1C1720] border border-white/15 text-xs sm:text-sm font-semibold text-[#F5F1F2] flex items-center justify-center gap-2 whitespace-nowrap cursor-pointer"
                >
                  <MessageCircle className="w-4 h-4 text-[#C0263D]" />
                  <span>Message</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {!data.canViewPrivate ? (
        <div className="p-8 rounded-2xl bg-[#141116] border border-white/8 text-center space-y-2">
          <Lock className="w-7 h-7 text-[#A7A0AA] mx-auto" />
          <p className="text-sm font-semibold text-[#F5F1F2]">This Hunter Profile is Private</p>
          <p className="text-xs text-[#A7A0AA]">
            Follow @{data.user.username} to view posts, guilds, and anime lists.
          </p>
        </div>
      ) : (
        <>
          {/* Profile Content Tabs */}
          <div className="flex items-center gap-5 overflow-x-auto no-scrollbar border-b border-white/10 text-xs sm:text-sm">
            {(
              [
                { id: 'posts', label: 'POSTS' },
                { id: 'recommendations', label: 'RECOMMENDED' },
                { id: 'watchlist', label: 'WATCHLIST' },
                { id: 'guilds', label: 'GUILDS' },
                { id: 'comments', label: 'REPLIES' },
                { id: 'activity', label: 'ACTIVITY' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setActiveTab(t.id)}
                className={`min-h-[44px] pb-2.5 font-bold tracking-wider relative whitespace-nowrap shrink-0 cursor-pointer ${
                  activeTab === t.id ? 'text-[#F5F1F2]' : 'text-[#A7A0AA] hover:text-[#F5F1F2]'
                }`}
              >
                {t.label}
                {activeTab === t.id && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C0263D]" />
                )}
              </button>
            ))}
          </div>

          {/* Tab Views */}
          {activeTab === 'posts' && (
            <div className="space-y-3">
              {data.posts.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#141116] border border-white/8 text-center text-xs text-[#A7A0AA]">
                  No posts published yet.
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.posts.map((post: any) => (
                    <Link
                      key={post.id}
                      to={`/pulse?discussion=${post.id}`}
                      className="rounded-2xl bg-[#141116] border border-white/8 overflow-hidden hover:border-white/20 transition-colors flex flex-col justify-between"
                    >
                      {post.mediaUrl && (
                        <div className="h-44 overflow-hidden bg-[#09080B]">
                          <KageImage
                            src={post.mediaUrl}
                            alt={post.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="p-4 space-y-1.5">
                        <h3 className="text-sm font-bold text-[#F5F1F2] line-clamp-1">
                          {post.title}
                        </h3>
                        <p className="text-xs text-[#A7A0AA] line-clamp-2">{post.content}</p>
                        <p className="text-[11px] text-[#A7A0AA] font-mono-num pt-1">
                          {formatCompactNumber(post.likeCount)} likes ·{' '}
                          {formatCompactNumber(post.commentCount)} comments
                        </p>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'recommendations' && (
            <div className="rounded-2xl bg-[#141116]/40 border border-white/8 px-4 py-2">
              <RecommendationEnginePanel targetUid={data.user.uid} />
            </div>
          )}

          {activeTab === 'watchlist' && (
            <div className="space-y-3">
              {data.watchlist.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#141116] border border-white/8 text-center space-y-3">
                  <p className="text-sm font-semibold text-[#F5F1F2]">Watchlist is empty</p>
                  <p className="text-xs text-[#A7A0AA]">
                    Track watched or planned anime to power your personalized recommendations.
                  </p>
                  <Link
                    to="/"
                    className="inline-flex min-h-[40px] px-4 items-center rounded-xl bg-[#C0263D] text-white text-xs font-semibold"
                  >
                    Explore Anime Realms
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3.5">
                  {data.watchlist.map((entry: any) => (
                    <div
                      key={entry.id}
                      className="rounded-xl bg-[#141116] border border-white/8 overflow-hidden flex flex-col justify-between"
                    >
                      <Link
                        to={`/anime/${entry.animeMalId}`}
                        className="block relative aspect-[3/4] overflow-hidden"
                      >
                        <KageImage
                          src={entry.animeImageUrl}
                          alt={entry.animeTitle}
                          className="w-full h-full object-cover"
                        />
                        {entry.score && (
                          <span className="absolute top-2 right-2 px-1.5 py-0.5 rounded bg-black/80 text-amber-400 text-[11px] font-mono-num flex items-center gap-0.5">
                            <Star className="w-3 h-3 fill-amber-400" />
                            {entry.score}
                          </span>
                        )}
                      </Link>
                      <div className="p-2.5 flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <Link
                            to={`/anime/${entry.animeMalId}`}
                            className="text-xs font-semibold text-[#F5F1F2] line-clamp-1 hover:text-[#C0263D]"
                          >
                            {entry.animeTitle}
                          </Link>
                          <p className="text-[10px] text-[#A7A0AA] uppercase tracking-wider mt-0.5">
                            {String(entry.status).replace(/_/g, ' ')}
                          </p>
                        </div>
                        {data.isOwner && (
                          <button
                            type="button"
                            onClick={() => handleRemoveWatchlistItem(entry.animeMalId)}
                            className="min-h-[32px] min-w-[32px] flex items-center justify-center text-[#A7A0AA] hover:text-rose-400 shrink-0 cursor-pointer"
                            aria-label="Remove from list"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'guilds' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {data.joinedGuilds.length === 0 ? (
                <div className="col-span-full p-8 rounded-2xl bg-[#141116] border border-white/8 text-center text-xs text-[#A7A0AA]">
                  Not a member of any Guilds yet.
                </div>
              ) : (
                data.joinedGuilds.map((g: any) => (
                  <Link
                    key={g.id}
                    to={`/guilds/${g.slug}`}
                    className="p-3.5 rounded-xl bg-[#141116] border border-white/8 flex items-center gap-3 hover:border-[#6D28D9]"
                  >
                    <div className="w-14 h-14 rounded-xl overflow-hidden shrink-0 bg-[#09080B]">
                      <KageImage src={g.artworkUrl} alt={g.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#F5F1F2] truncate uppercase">
                        {g.name}
                      </p>
                      <p className="text-xs text-[#A7A0AA] font-mono-num">
                        {formatCompactNumber(g.memberCount)} members · {g.role}
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}

          {activeTab === 'comments' && (
            <div className="space-y-3">
              {data.comments.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#141116] border border-white/8 text-center text-xs text-[#A7A0AA]">
                  No recent discussion replies.
                </div>
              ) : (
                data.comments.map((c: any) => (
                  <Link
                    key={c.id}
                    to={`/pulse?discussion=${c.discussionId}`}
                    className="block p-4 rounded-xl bg-[#141116] border border-white/8 hover:border-white/20 space-y-1"
                  >
                    <p className="text-xs text-[#6D28D9] font-medium">
                      Replied on {c.discussionTitle}
                    </p>
                    <p className="text-sm text-[#F5F1F2]">{c.content}</p>
                  </Link>
                ))
              )}
            </div>
          )}

          {activeTab === 'activity' && (
            <div className="space-y-2.5">
              {!Array.isArray(data.activityHistory) || data.activityHistory.length === 0 ? (
                <div className="p-8 rounded-2xl bg-[#141116] border border-white/8 text-center text-xs text-[#A7A0AA]">
                  No recorded activity history yet.
                </div>
              ) : (
                data.activityHistory.map((act: any) => (
                  <div
                    key={act.id}
                    className="p-3.5 rounded-xl bg-[#141116] border border-white/8 flex items-center justify-between gap-3"
                  >
                    <div className="min-w-0 space-y-0.5">
                      <p className="text-xs sm:text-sm text-[#F5F1F2]">{act.summary}</p>
                      <p className="text-[11px] font-mono-num text-[#A7A0AA]">
                        {act.actionType.replace(/_/g, ' ').toUpperCase()} ·{' '}
                        {new Date(act.createdAt).toLocaleDateString()}
                      </p>
                    </div>
                    {act.targetType === 'discussion' && act.targetId && (
                      <Link
                        to={`/pulse?discussion=${act.targetId}`}
                        className="text-xs font-semibold text-[#C0263D] hover:underline shrink-0"
                      >
                        View
                      </Link>
                    )}
                  </div>
                ))
              )}
            </div>
          )}
        </>
      )}

      {/* Paginated Followers / Followings Directory Modal */}
      <KageModal
        isOpen={connectionsModalType !== null}
        onClose={() => setConnectionsModalType(null)}
        title={
          connectionsModalType === 'followers'
            ? `Followers (${formatCompactNumber(connectionsTotal)})`
            : `Followings (${formatCompactNumber(connectionsTotal)})`
        }
        subtitle={`@${data.user.username}`}
        maxWidthClass="max-w-lg"
        tallForm
      >
        <div className="space-y-3">
          <div className="relative">
            <Search className="w-4 h-4 text-[#A7A0AA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={connectionsQuery}
              onChange={(e) => setConnectionsQuery(e.target.value)}
              placeholder="Search by @username or display name..."
              className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 pl-10 pr-3.5 text-xs sm:text-sm text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
            />
          </div>

          {connectionsLoading ? (
            <div className="py-10 flex items-center justify-center text-xs text-[#A7A0AA] gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#C0263D]" />
              <span>Loading profiles...</span>
            </div>
          ) : connectionsItems.length === 0 ? (
            <p className="py-8 text-center text-xs text-[#A7A0AA]">No matching accounts found.</p>
          ) : (
            <div className="space-y-2">
              {connectionsItems.map((item) => (
                <Link
                  key={item.uid}
                  to={`/profile/${item.username}`}
                  onClick={() => setConnectionsModalType(null)}
                  className="p-3 rounded-xl bg-[#09080B] border border-white/8 hover:border-white/20 flex items-center justify-between gap-3 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-[#141116] border border-white/12 shrink-0">
                      <KageImage
                        src={item.avatarUrl}
                        alt={item.displayName || item.username}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs sm:text-sm font-bold text-[#F5F1F2] truncate">
                          {item.displayName || item.username}
                        </span>
                        <OwnerBadge role={item.role} size="xs" />
                      </div>
                      <p className="text-[11px] text-[#A7A0AA] truncate">
                        @{item.username}
                        {item.favouriteCharacterAnime
                          ? ` · ${item.favouriteCharacterAnime}`
                          : ''}
                      </p>
                    </div>
                  </div>
                  <span className="text-[11px] font-mono-num text-[#A7A0AA] shrink-0">
                    {item.kageId || ''}
                  </span>
                </Link>
              ))}

              {connectionsHasMore && connectionsModalType && (
                <div className="pt-2 flex justify-center">
                  <button
                    type="button"
                    disabled={connectionsLoadingMore}
                    onClick={() =>
                      fetchConnections(
                        connectionsModalType,
                        connectionsItems.length,
                        true,
                        connectionsQuery
                      )
                    }
                    className="min-h-[40px] px-5 rounded-xl bg-[#09080B] border border-white/12 hover:border-[#C0263D] text-xs font-semibold text-[#F5F1F2] inline-flex items-center gap-2 cursor-pointer"
                  >
                    {connectionsLoadingMore && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                    <span>{connectionsLoadingMore ? 'Loading...' : 'Load More'}</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </KageModal>

      {/* Edit Profile Modal — Viewport-Safe via KageModal */}
      <KageModal
        isOpen={editOpen}
        onClose={() => setEditOpen(false)}
        title="Edit Hunter Profile"
        maxWidthClass="max-w-lg"
        tallForm
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditOpen(false)}
              className="min-h-[44px] px-4 rounded-xl bg-[#09080B] border border-white/10 text-xs text-[#A7A0AA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="edit-hunter-profile-form"
              disabled={savingEdit}
              className="min-h-[44px] px-5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
            >
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        }
      >
        <form id="edit-hunter-profile-form" onSubmit={handleSaveProfile} className="space-y-4">
          {/* Avatar Picker + Upload */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full overflow-hidden border border-amber-400/70 bg-[#09080B] shrink-0">
              <KageImage src={editAvatar} alt="Avatar" className="w-full h-full object-cover" />
            </div>
            <div className="space-y-1.5">
              <label className="inline-flex min-h-[38px] px-3.5 rounded-xl bg-[#09080B] border border-white/15 text-xs font-semibold text-[#F5F1F2] items-center gap-1.5 cursor-pointer hover:border-[#C0263D]">
                <Camera className="w-3.5 h-3.5 text-[#C0263D]" />
                <span>Upload Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </label>
              <div className="flex items-center gap-1.5 flex-wrap">
                {PRESET_AVATARS.map((a) => (
                  <button
                    key={a.key}
                    type="button"
                    onClick={() => setEditAvatar(a.key)}
                    className={`w-7 h-7 rounded-full overflow-hidden border cursor-pointer ${
                      editAvatar === a.key
                        ? 'border-[#C0263D] ring-1 ring-[#C0263D]'
                        : 'border-white/15'
                    }`}
                    title={a.label}
                  >
                    <img src={a.url} alt={a.label} className="w-full h-full object-cover" />
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[#A7A0AA] mb-1">Display Name</label>
              <input
                type="text"
                required
                value={editDisplayName}
                onChange={(e) => setEditDisplayName(e.target.value)}
                className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-sm text-[#F5F1F2]"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[#A7A0AA] mb-1">Username</label>
              <input
                type="text"
                required
                value={editUsername}
                onChange={(e) => setEditUsername(e.target.value)}
                className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-sm text-[#F5F1F2]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[#A7A0AA] mb-1">Bio</label>
            <textarea
              rows={2}
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              className="w-full rounded-xl bg-[#09080B] border border-white/10 p-3 text-sm text-[#F5F1F2]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#A7A0AA] mb-1.5">
              Favorite Anime Genres — Choose from all {GENRE_CHOICES.length} genres (feeds
              Recommendation Engine)
            </label>
            <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto p-1">
              {GENRE_CHOICES.map((g) => {
                const selected = editGenres.includes(g);
                return (
                  <button
                    key={g}
                    type="button"
                    onClick={() =>
                      setEditGenres((prev) =>
                        prev.includes(g)
                          ? prev.filter((item) => item !== g)
                          : [...prev.slice(0, 15), g]
                      )
                    }
                    className={`px-2.5 py-1 rounded-lg text-xs border cursor-pointer ${
                      selected
                        ? 'bg-[#C0263D]/20 border-[#C0263D] text-white'
                        : 'bg-[#09080B] border-white/10 text-[#A7A0AA]'
                    }`}
                  >
                    {g}
                  </button>
                );
              })}
            </div>
          </div>

          <label className="flex items-center justify-between p-3 rounded-xl bg-[#09080B] border border-white/10 cursor-pointer">
            <span className="text-xs text-[#F5F1F2]">Private Profile (Followers Only)</span>
            <input
              type="checkbox"
              checked={editPrivate}
              onChange={(e) => setEditPrivate(e.target.checked)}
              className="accent-[#C0263D] w-4 h-4"
            />
          </label>

          {editError && <p className="text-xs text-rose-400">{editError}</p>}
        </form>
      </KageModal>

      <ReportModal
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        targetType="user"
        targetId={data.user.uid}
        targetLabel={`@${data.user.username}`}
      />
    </div>
  );
};
