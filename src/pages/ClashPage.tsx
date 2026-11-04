import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Check,
  Clock,
  Edit3,
  Eye,
  Film,
  Flag,
  Image as ImageIcon,
  Lock,
  Play,
  Plus,
  Search,
  Share2,
  Shield,
  Shuffle,
  Swords,
  Trash2,
  Trophy,
  Upload,
  Users,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { KageImage } from '../components/KageImage';
import { ReportModal } from '../components/ReportModal';
import { KageModal } from '../components/KageModal';
import { kageSound } from '../lib/soundEngine';
import { ALL_GENRE_NAMES } from '../lib/genres';
import { formatCompactNumber } from '../lib/formatters';

type ClashMode = 'user_duel' | 'community_duel' | 'solo_character';
type ClashTab = 'all' | 'live' | 'upcoming' | 'community' | 'character' | 'completed' | 'mine';
type ClashTieRule = 'draw' | 'challenger_advantage' | 'sudden_death_first_vote';

interface ClashEntryItem {
  id: number;
  clashId: number;
  side: 'left' | 'right';
  submittedByUid: string;
  communityId?: number | null;
  title: string;
  caption: string;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  posterUrl?: string | null;
  durationSec?: number | null;
  submittedAt: string;
  submitter: {
    uid: string;
    username: string;
    displayName: string;
  };
}

interface ClashRewardItem {
  id: number;
  clashId: number;
  sourceKind: 'user_reward' | 'community_reward';
  sourceRewardId: number;
  stakedByUid: string;
  stakedByCommunityId?: number | null;
  rewardKey: string;
  rewardType: string;
  label: string;
  description: string;
  rarity: string;
  accentColor: string;
  status: 'escrowed' | 'awarded' | 'released';
  awardedToUid?: string | null;
  awardedToCommunityId?: number | null;
  voteCount: number;
}

interface ClashItem {
  id: number;
  title: string;
  description: string;
  rules: string;
  category: string;
  clashMode: ClashMode;
  status: string;
  tieRule: ClashTieRule;
  leftName: string;
  leftSubtitle: string;
  leftImageUrl: string;
  rightName: string;
  rightSubtitle: string;
  rightImageUrl: string;
  leftVotes: number;
  rightVotes: number;
  totalVotes: number;
  leftPercent: number;
  rightPercent: number;
  challengerUid?: string | null;
  opponentUid?: string | null;
  challengerCommunityId?: number | null;
  opponentCommunityId?: number | null;
  creatorUid?: string | null;
  allowVoteChange: boolean;
  hasRewards: boolean;
  winnerSide?: 'left' | 'right' | 'draw' | null;
  genreTags: string[];
  startsAt?: string | null;
  endsAt?: string | null;
  entryDeadlineAt?: string | null;
  inviteExpiresAt?: string | null;
  viewerVote: 'left' | 'right' | null;
  leftEntry: ClashEntryItem | null;
  rightEntry: ClashEntryItem | null;
  rewards: ClashRewardItem[];
  viewerRewardVote: number | null;
  canAcceptInvite: boolean;
  canSubmitLeftEntry: boolean;
  canSubmitRightEntry: boolean;
  isFanOpinionPowerVote: boolean;
  fanVoteDisclaimer?: string | null;
}

interface CatalogueCharacterOption {
  malId: number;
  characterId?: number | null;
  name: string;
  animeTitle: string;
  imageUrl: string;
}

interface HunterSearchOption {
  uid: string;
  username: string;
  kageId?: string | null;
  displayName: string;
  avatarUrl: string;
}

interface GuildOption {
  id: number;
  slug: string;
  name: string;
  artworkUrl: string;
  isMember: boolean;
  memberRole: string | null;
}

interface EligibleRewardsResponse {
  userRewards: {
    id: number;
    label: string;
    description: string;
    rarity: string;
    rewardType: string;
  }[];
  communityRewards: {
    id: number;
    title: string;
    description: string;
    rewardType: string;
  }[];
}

const CLASH_TABS: { key: ClashTab; label: string }[] = [
  { key: 'all', label: 'All Battles' },
  { key: 'live', label: 'Live' },
  { key: 'upcoming', label: 'Pending & Scheduled' },
  { key: 'community', label: 'Guild Clashes' },
  { key: 'character', label: 'Character Clashes' },
  { key: 'completed', label: 'Completed' },
  { key: 'mine', label: 'My Clashes' },
];

const CLASH_CATEGORIES: Record<ClashMode, string[]> = {
  solo_character: [
    'Character Power Matchup',
    'Who Wins at Peak Form?',
    'Best Character Arc',
    'Strongest Domain / Technique',
  ],
  user_duel: [
    '1v1 Anime Edit Duel',
    'AMV / Motion Edit Battle',
    'Manga Coloring / Fanart Duel',
    'Best Scene Breakdown Duel',
  ],
  community_duel: [
    'Guild vs Guild Edit War',
    'Franchise Supremacy Duel',
    'Opening & OST Showdown',
    'Lore & Strategy Clash',
  ],
};

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
    reader.onerror = () => reject(new Error('Failed to read selected media file.'));
    reader.readAsDataURL(file);
  });
}

function formatTimeRemaining(iso?: string | null): string {
  if (!iso) return '';
  const diff = new Date(iso).getTime() - Date.now();
  if (diff <= 0) return 'Ended';
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h left`;
  }
  if (hours > 0) return `${hours}h ${mins}m left`;
  return `${Math.max(1, mins)}m left`;
}

function formatStatusLabel(status: string): string {
  switch (status) {
    case 'live':
      return 'Live Voting';
    case 'pending_acceptance':
      return 'Awaiting Acceptance';
    case 'awaiting_entries':
      return 'Awaiting Duel Edits';
    case 'scheduled':
      return 'Scheduled';
    case 'completed':
      return 'Completed';
    case 'declined':
      return 'Declined';
    case 'cancelled':
      return 'Cancelled';
    case 'expired':
      return 'Expired';
    default:
      return status.replace(/_/g, ' ');
  }
}

function formatModeLabel(mode: ClashMode): string {
  if (mode === 'community_duel') return 'Guild Duel';
  if (mode === 'user_duel') return '1v1 Hunter Duel';
  return 'Solo Character Clash';
}

export const ClashPage: React.FC = () => {
  const { clashId: routeClashId } = useParams<{ clashId?: string }>();
  const { user, subscribeWs, bumpTasteRevision } = useAuth();
  const navigate = useNavigate();

  const [activeTab, setActiveTab] = useState<ClashTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [clashes, setClashes] = useState<ClashItem[]>([]);
  const [focusedClash, setFocusedClash] = useState<ClashItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [actionError, setActionError] = useState<{ clashId: number; message: string } | null>(
    null
  );
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [votingId, setVotingId] = useState<number | null>(null);
  const [justVoted, setJustVoted] = useState<{ clashId: number; side: 'left' | 'right' } | null>(
    null
  );
  const [rewardVotingId, setRewardVotingId] = useState<number | null>(null);

  // Fullscreen "View Edit" Media Viewer Modal
  const [viewerMedia, setViewerMedia] = useState<{
    clashTitle: string;
    sideLabel: string;
    contenderName: string;
    mediaType: 'image' | 'video';
    mediaUrl: string;
    posterUrl?: string | null;
    entryTitle?: string;
    caption?: string;
    submitterUsername?: string;
    submitterDisplayName?: string;
  } | null>(null);

  // Per-Side Upload Edit Modal
  const [entryModalClash, setEntryModalClash] = useState<{
    clash: ClashItem;
    side: 'left' | 'right';
  } | null>(null);
  const [entryTitle, setEntryTitle] = useState('');
  const [entryCaption, setEntryCaption] = useState('');
  const [entryMediaType, setEntryMediaType] = useState<'image' | 'video'>('video');
  const [entryDataUrl, setEntryDataUrl] = useState('');
  const [entryFileName, setEntryFileName] = useState('');
  const [submittingEntry, setSubmittingEntry] = useState(false);
  const [entryError, setEntryError] = useState('');

  // Invite Response Modal (especially for Guild Duel counter-staking)
  const [acceptModalClash, setAcceptModalClash] = useState<ClashItem | null>(null);
  const [acceptEligibleRewards, setAcceptEligibleRewards] =
    useState<EligibleRewardsResponse | null>(null);
  const [acceptStakedRewards, setAcceptStakedRewards] = useState<
    { sourceKind: 'user_reward' | 'community_reward'; sourceRewardId: number }[]
  >([]);
  const [respondingId, setRespondingId] = useState<number | null>(null);

  // Edit Clash Metadata Modal
  const [editingClash, setEditingClash] = useState<ClashItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editRules, setEditRules] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Report Modal
  const [reportTarget, setReportTarget] = useState<{ id: number; label: string } | null>(null);

  // Create Clash Modal State
  const [createOpen, setCreateOpen] = useState(false);
  const [createMode, setCreateMode] = useState<ClashMode>('solo_character');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rules, setRules] = useState(
    'One vote per authenticated hunter during the active voting window.'
  );
  const [category, setCategory] = useState(CLASH_CATEGORIES.solo_character[0]);
  const [durationHours, setDurationHours] = useState(48);
  const [tieRule, setTieRule] = useState<ClashTieRule>('draw');
  const [allowVoteChange, setAllowVoteChange] = useState(false);
  const [genreTags, setGenreTags] = useState<string[]>(['Action']);

  // Solo Character Pickers
  const [leftCharQuery, setLeftCharQuery] = useState('');
  const [leftCharResults, setLeftCharResults] = useState<CatalogueCharacterOption[]>([]);
  const [selectedLeftChar, setSelectedLeftChar] = useState<CatalogueCharacterOption | null>(null);

  const [rightCharQuery, setRightCharQuery] = useState('');
  const [rightCharResults, setRightCharResults] = useState<CatalogueCharacterOption[]>([]);
  const [selectedRightChar, setSelectedRightChar] = useState<CatalogueCharacterOption | null>(
    null
  );

  // 1v1 User Duel Picker
  const [hunterQuery, setHunterQuery] = useState('');
  const [hunterResults, setHunterResults] = useState<HunterSearchOption[]>([]);
  const [selectedOpponent, setSelectedOpponent] = useState<HunterSearchOption | null>(null);

  // Guild Duel Pickers & Staked Rewards
  const [allGuilds, setAllGuilds] = useState<GuildOption[]>([]);
  const [challengerGuildId, setChallengerGuildId] = useState<number | ''>('');
  const [opponentGuildId, setOpponentGuildId] = useState<number | ''>('');
  const [eligibleRewards, setEligibleRewards] = useState<EligibleRewardsResponse | null>(null);
  const [stakedRewards, setStakedRewards] = useState<
    { sourceKind: 'user_reward' | 'community_reward'; sourceRewardId: number }[]
  >([]);

  // Optional Initial Duel Edit on Creation
  const [initialMediaType, setInitialMediaType] = useState<'image' | 'video'>('video');
  const [initialDataUrl, setInitialDataUrl] = useState('');
  const [initialFileName, setInitialFileName] = useState('');
  const [initialEntryTitle, setInitialEntryTitle] = useState('');

  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const syncClashIntoState = useCallback((updated: ClashItem) => {
    setClashes((prev) => {
      const exists = prev.some((c) => c.id === updated.id);
      if (!exists) return prev;
      return prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c));
    });
    setFocusedClash((prev) => (prev && prev.id === updated.id ? { ...prev, ...updated } : prev));
  }, []);

  const loadClashes = useCallback(
    async (resetOffset = true) => {
      if (resetOffset) setLoading(true);
      else setLoadingMore(true);

      try {
        const nextOffset = resetOffset ? 0 : clashes.length;
        const params = new URLSearchParams({
          tab: activeTab,
          limit: '16',
          offset: String(nextOffset),
        });
        if (searchQuery.trim()) {
          params.set('q', searchQuery.trim());
        }
        const res = await apiFetch<{ items: ClashItem[]; hasMore: boolean }>(
          `/api/clashes?${params.toString()}`
        );
        if (resetOffset) {
          setClashes(res.items || []);
        } else {
          setClashes((prev) => {
            const seen = new Set(prev.map((item) => item.id));
            const merged = [...prev];
            for (const item of res.items || []) {
              if (!seen.has(item.id)) merged.push(item);
            }
            return merged;
          });
        }
        setHasMore(Boolean(res.hasMore));
      } catch (err) {
        console.error('Failed to load clashes:', err);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [activeTab, searchQuery, clashes.length]
  );

  // Load list when tab or search changes
  useEffect(() => {
    const timer = setTimeout(() => {
      loadClashes(true);
    }, 180);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, searchQuery, user?.uid]);

  // Load focused Clash when visiting /clash/:clashId
  useEffect(() => {
    if (!routeClashId) {
      setFocusedClash(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ clash: ClashItem }>(
          `/api/clashes/${encodeURIComponent(routeClashId)}`
        );
        if (!cancelled) setFocusedClash(res.clash || null);
      } catch {
        if (!cancelled) setFocusedClash(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [routeClashId, user?.uid]);

  // Close fullscreen media viewer on Escape key
  useEffect(() => {
    if (!viewerMedia) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setViewerMedia(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [viewerMedia]);

  // Real-time WebSocket updates
  useEffect(() => {
    return subscribeWs((msg) => {
      if (msg.type === 'clash:updated' && msg.clash?.id) {
        setClashes((prev) =>
          prev.map((c) => {
            if (c.id !== msg.clash.id) return c;
            const leftVotes = msg.clash.leftVotes ?? c.leftVotes;
            const rightVotes = msg.clash.rightVotes ?? c.rightVotes;
            const totalVotes = leftVotes + rightVotes;
            const leftPercent =
              totalVotes === 0 ? 50 : Math.round((leftVotes / totalVotes) * 100);
            return {
              ...c,
              ...msg.clash,
              leftVotes,
              rightVotes,
              totalVotes,
              leftPercent,
              rightPercent: totalVotes === 0 ? 50 : 100 - leftPercent,
              // Preserve viewer-specific flags when broadcast is public
              viewerVote: c.viewerVote,
              viewerRewardVote: c.viewerRewardVote,
              canAcceptInvite:
                msg.clash.status && msg.clash.status !== 'pending_acceptance'
                  ? false
                  : c.canAcceptInvite,
            };
          })
        );
        setFocusedClash((prev) => {
          if (!prev || prev.id !== msg.clash.id) return prev;
          const leftVotes = msg.clash.leftVotes ?? prev.leftVotes;
          const rightVotes = msg.clash.rightVotes ?? prev.rightVotes;
          const totalVotes = leftVotes + rightVotes;
          const leftPercent =
            totalVotes === 0 ? 50 : Math.round((leftVotes / totalVotes) * 100);
          return {
            ...prev,
            ...msg.clash,
            leftVotes,
            rightVotes,
            totalVotes,
            leftPercent,
            rightPercent: totalVotes === 0 ? 50 : 100 - leftPercent,
            viewerVote: prev.viewerVote,
            viewerRewardVote: prev.viewerRewardVote,
          };
        });
      } else if (msg.type === 'clash:created') {
        loadClashes(true);
      }
    });
  }, [subscribeWs, loadClashes]);

  // Character search for Solo Character mode
  useEffect(() => {
    if (!createOpen || createMode !== 'solo_character') return;
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch<{ items: CatalogueCharacterOption[] }>(
          `/api/characters?q=${encodeURIComponent(leftCharQuery.trim())}`
        );
        setLeftCharResults(res.items || []);
      } catch {
        setLeftCharResults([]);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [createOpen, createMode, leftCharQuery]);

  useEffect(() => {
    if (!createOpen || createMode !== 'solo_character') return;
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch<{ items: CatalogueCharacterOption[] }>(
          `/api/characters?q=${encodeURIComponent(rightCharQuery.trim())}`
        );
        setRightCharResults(res.items || []);
      } catch {
        setRightCharResults([]);
      }
    }, 180);
    return () => clearTimeout(t);
  }, [createOpen, createMode, rightCharQuery]);

  // Hunter search for 1v1 User Duel mode
  useEffect(() => {
    if (!createOpen || createMode !== 'user_duel' || !user) return;
    const t = setTimeout(async () => {
      try {
        const res = await apiFetch<{ items: HunterSearchOption[] }>(
          `/api/users/search?q=${encodeURIComponent(hunterQuery.trim())}`
        );
        setHunterResults((res.items || []).filter((u) => u.uid !== user.uid));
      } catch {
        setHunterResults([]);
      }
    }, 200);
    return () => clearTimeout(t);
  }, [createOpen, createMode, hunterQuery, user]);

  // Guild list & eligible rewards for Community Duel mode
  useEffect(() => {
    if (!createOpen || createMode !== 'community_duel' || !user) return;
    (async () => {
      try {
        const res = await apiFetch<{ items: GuildOption[] }>('/api/communities?limit=50');
        const items = res.items || [];
        setAllGuilds(items);
        const myRepGuilds = items.filter(
          (g) =>
            (g.memberRole && ['owner', 'admin', 'moderator'].includes(g.memberRole)) ||
            user.role === 'owner' ||
            user.role === 'admin'
        );
        if (myRepGuilds.length > 0 && !challengerGuildId) {
          setChallengerGuildId(myRepGuilds[0].id);
        }
      } catch {
        setAllGuilds([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen, createMode, user]);

  useEffect(() => {
    if (!createOpen || createMode !== 'community_duel' || !user || !challengerGuildId) {
      setEligibleRewards(null);
      return;
    }
    (async () => {
      try {
        const res = await apiFetch<EligibleRewardsResponse>(
          `/api/clashes/eligible-rewards?communityId=${challengerGuildId}`
        );
        setEligibleRewards(res);
      } catch {
        setEligibleRewards(null);
      }
    })();
  }, [createOpen, createMode, user, challengerGuildId]);

  const myRepresentativeGuilds = useMemo(() => {
    if (!user) return [];
    return allGuilds.filter(
      (g) =>
        (g.memberRole && ['owner', 'admin', 'moderator'].includes(g.memberRole)) ||
        user.role === 'owner' ||
        user.role === 'admin'
    );
  }, [allGuilds, user]);

  const handleModeSwitch = (nextMode: ClashMode) => {
    setCreateMode(nextMode);
    setCategory(CLASH_CATEGORIES[nextMode][0]);
    setCreateError('');
    setStakedRewards([]);
  };

  const toggleRewardSelection = (
    list: { sourceKind: 'user_reward' | 'community_reward'; sourceRewardId: number }[],
    setter: React.Dispatch<
      React.SetStateAction<
        { sourceKind: 'user_reward' | 'community_reward'; sourceRewardId: number }[]
      >
    >,
    sourceKind: 'user_reward' | 'community_reward',
    sourceRewardId: number
  ) => {
    const exists = list.some(
      (r) => r.sourceKind === sourceKind && r.sourceRewardId === sourceRewardId
    );
    if (exists) {
      setter(
        list.filter(
          (r) => !(r.sourceKind === sourceKind && r.sourceRewardId === sourceRewardId)
        )
      );
    } else if (list.length < 4) {
      setter([...list, { sourceKind, sourceRewardId }]);
    }
  };

  const handleVote = async (clash: ClashItem, side: 'left' | 'right') => {
    if (!user) {
      navigate('/auth/login');
      return;
    }
    setActionError(null);
    setVotingId(clash.id);
    try {
      const res = await apiFetch<{ clash: ClashItem }>(`/api/clashes/${clash.id}/vote`, {
        method: 'POST',
        body: JSON.stringify({ side }),
      });
      if (res.clash) {
        syncClashIntoState(res.clash);
      }
      kageSound.play('clash_vote');
      setJustVoted({ clashId: clash.id, side });
      window.setTimeout(() => {
        setJustVoted((prev) => (prev?.clashId === clash.id ? null : prev));
      }, 280);
      bumpTasteRevision();
    } catch (err: any) {
      setActionError({
        clashId: clash.id,
        message: err.message || 'Unable to cast vote right now.',
      });
    } finally {
      setVotingId(null);
    }
  };

  const handleRewardPollVote = async (clashId: number, clashRewardId: number) => {
    if (!user) {
      navigate('/auth/login');
      return;
    }
    setActionError(null);
    setRewardVotingId(clashRewardId);
    try {
      const res = await apiFetch<{ clash: ClashItem }>(
        `/api/clashes/${clashId}/reward-vote`,
        {
          method: 'POST',
          body: JSON.stringify({ clashRewardId }),
        }
      );
      if (res.clash) {
        syncClashIntoState(res.clash);
      }
      kageSound.play('clash_reward_unlocked');
    } catch (err: any) {
      setActionError({
        clashId,
        message: err.message || 'Unable to vote in reward poll.',
      });
    } finally {
      setRewardVotingId(null);
    }
  };

  const openAcceptInviteModal = async (clash: ClashItem) => {
    if (clash.clashMode === 'community_duel' && clash.opponentCommunityId) {
      setAcceptModalClash(clash);
      setAcceptStakedRewards([]);
      try {
        const res = await apiFetch<EligibleRewardsResponse>(
          `/api/clashes/eligible-rewards?communityId=${clash.opponentCommunityId}`
        );
        setAcceptEligibleRewards(res);
      } catch {
        setAcceptEligibleRewards(null);
      }
      return;
    }
    await handleRespondInvite(clash.id, 'accept');
  };

  const handleRespondInvite = async (
    clashId: number,
    action: 'accept' | 'decline',
    counterRewards?: { sourceKind: 'user_reward' | 'community_reward'; sourceRewardId: number }[]
  ) => {
    setRespondingId(clashId);
    setActionError(null);
    try {
      const res = await apiFetch<{ clash: ClashItem }>(`/api/clashes/${clashId}/respond`, {
        method: 'POST',
        body: JSON.stringify({
          action,
          stakedRewards: counterRewards && counterRewards.length > 0 ? counterRewards : undefined,
        }),
      });
      if (res.clash) {
        syncClashIntoState(res.clash);
      }
      if (action === 'accept') {
        kageSound.play(res.clash?.status === 'live' ? 'clash_battle_start' : 'clash_accepted');
      }
      setAcceptModalClash(null);
    } catch (err: any) {
      setActionError({
        clashId,
        message: err.message || `Failed to ${action} Clash invitation.`,
      });
    } finally {
      setRespondingId(null);
    }
  };

  const handleOpenUploadEntry = (clash: ClashItem, side: 'left' | 'right') => {
    const existing = side === 'left' ? clash.leftEntry : clash.rightEntry;
    setEntryModalClash({ clash, side });
    setEntryTitle(existing?.title || '');
    setEntryCaption(existing?.caption || '');
    setEntryMediaType(existing?.mediaType || 'video');
    setEntryDataUrl('');
    setEntryFileName('');
    setEntryError('');
  };

  const handleEntryFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setEntryError('');
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      setEntryError('Select a valid MP4/WebM video or PNG/JPG/WebP image.');
      return;
    }
    try {
      const maxBytes = isVideo ? 16 * 1024 * 1024 : 8 * 1024 * 1024;
      const dataUrl = await readFileAsDataUrl(file, maxBytes);
      setEntryMediaType(isVideo ? 'video' : 'image');
      setEntryDataUrl(dataUrl);
      setEntryFileName(file.name);
      kageSound.play('pulse_upload_done');
    } catch (err: any) {
      setEntryError(err.message || 'Could not read media file.');
    }
  };

  const handleSubmitEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!entryModalClash) return;
    if (!entryDataUrl) {
      setEntryError('Select an image or video edit file to upload.');
      return;
    }
    setSubmittingEntry(true);
    setEntryError('');
    try {
      const res = await apiFetch<{ clash: ClashItem }>(
        `/api/clashes/${entryModalClash.clash.id}/entries`,
        {
          method: 'POST',
          body: JSON.stringify({
            title: entryTitle.trim() || undefined,
            caption: entryCaption.trim() || undefined,
            mediaType: entryMediaType,
            dataUrl: entryDataUrl,
          }),
        }
      );
      if (res.clash) {
        syncClashIntoState(res.clash);
      }
      kageSound.play(res.clash?.status === 'live' ? 'clash_battle_start' : 'pulse_upload_done');
      setEntryModalClash(null);
    } catch (err: any) {
      setEntryError(err.message || 'Failed to upload Clash edit.');
    } finally {
      setSubmittingEntry(false);
    }
  };

  const handleInitialFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setCreateError('');
    const isVideo = file.type.startsWith('video/');
    const isImage = file.type.startsWith('image/');
    if (!isVideo && !isImage) {
      setCreateError('Select a valid MP4/WebM video or PNG/JPG/WebP image.');
      return;
    }
    try {
      const maxBytes = isVideo ? 16 * 1024 * 1024 : 8 * 1024 * 1024;
      const dataUrl = await readFileAsDataUrl(file, maxBytes);
      setInitialMediaType(isVideo ? 'video' : 'image');
      setInitialDataUrl(dataUrl);
      setInitialFileName(file.name);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to load media file.');
    }
  };

  const handleCreateClash = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate('/auth/login');
      return;
    }

    setCreateError('');
    if (createMode === 'solo_character') {
      if (!selectedLeftChar || !selectedRightChar) {
        setCreateError('Select two verified anime characters from the catalogue.');
        return;
      }
      if (selectedLeftChar.malId === selectedRightChar.malId) {
        setCreateError('Choose two different characters for a Solo Character Clash.');
        return;
      }
    } else if (createMode === 'user_duel') {
      if (!selectedOpponent) {
        setCreateError('Search and select a KAGE hunter to challenge.');
        return;
      }
    } else if (createMode === 'community_duel') {
      if (!challengerGuildId || !opponentGuildId) {
        setCreateError('Select both your Challenger Guild and an Opponent Guild.');
        return;
      }
      if (challengerGuildId === opponentGuildId) {
        setCreateError('Challenger and Opponent guilds must be different.');
        return;
      }
    }

    setCreating(true);
    try {
      const payload: Record<string, any> = {
        clashMode: createMode,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        rules: rules.trim() || undefined,
        category,
        durationHours,
        tieRule,
        allowVoteChange,
        genreTags,
      };

      if (createMode === 'solo_character' && selectedLeftChar && selectedRightChar) {
        payload.leftCharacter = selectedLeftChar;
        payload.rightCharacter = selectedRightChar;
      } else if (createMode === 'user_duel' && selectedOpponent) {
        payload.opponentUid = selectedOpponent.uid;
        if (initialDataUrl) {
          payload.initialEntry = {
            title: initialEntryTitle.trim() || undefined,
            mediaType: initialMediaType,
            dataUrl: initialDataUrl,
          };
        }
      } else if (createMode === 'community_duel') {
        payload.challengerCommunityId = Number(challengerGuildId);
        payload.opponentCommunityId = Number(opponentGuildId);
        if (stakedRewards.length > 0) {
          payload.stakedRewards = stakedRewards;
        }
        if (initialDataUrl) {
          payload.initialEntry = {
            title: initialEntryTitle.trim() || undefined,
            mediaType: initialMediaType,
            dataUrl: initialDataUrl,
          };
        }
      }

      const res = await apiFetch<{ clash: ClashItem }>('/api/clashes', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      kageSound.play(createMode === 'solo_character' ? 'clash_battle_start' : 'clash_created');
      setCreateOpen(false);
      setTitle('');
      setDescription('');
      setSelectedLeftChar(null);
      setSelectedRightChar(null);
      setSelectedOpponent(null);
      setInitialDataUrl('');
      setInitialFileName('');
      setInitialEntryTitle('');
      setStakedRewards([]);
      bumpTasteRevision();
      await loadClashes(true);
      if (res.clash?.id && createMode !== 'solo_character') {
        setActiveTab('mine');
      }
    } catch (err: any) {
      setCreateError(err.message || 'Could not create Clash.');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenEditMetadata = (clash: ClashItem) => {
    setEditingClash(clash);
    setEditTitle(clash.title);
    setEditDescription(clash.description || '');
    setEditRules(clash.rules || '');
  };

  const handleSaveClashEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClash) return;
    setSavingEdit(true);
    try {
      const res = await apiFetch<{ clash: ClashItem }>(`/api/clashes/${editingClash.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          action: 'edit',
          title: editTitle,
          description: editDescription,
          rules: editRules,
        }),
      });
      if (res.clash) syncClashIntoState(res.clash);
      setEditingClash(null);
    } catch (err: any) {
      setActionError({
        clashId: editingClash.id,
        message: err.message || 'Failed to update Clash details.',
      });
      setEditingClash(null);
    } finally {
      setSavingEdit(false);
    }
  };

  const handleCancelClash = async (clashId: number) => {
    setActionError(null);
    try {
      const res = await apiFetch<{ clash: ClashItem }>(`/api/clashes/${clashId}`, {
        method: 'PATCH',
        body: JSON.stringify({ action: 'cancel' }),
      });
      if (res.clash) syncClashIntoState(res.clash);
    } catch (err: any) {
      setActionError({
        clashId,
        message: err.message || 'Cannot cancel this Clash.',
      });
    }
  };

  const handleAdminDeleteClash = async (clashId: number) => {
    try {
      await apiFetch(`/api/admin/clashes/${clashId}`, { method: 'DELETE' });
      setClashes((prev) => prev.filter((c) => c.id !== clashId));
      if (focusedClash?.id === clashId) {
        navigate('/clash');
      }
    } catch (err: any) {
      setActionError({
        clashId,
        message: err.message || 'Delete Clash failed.',
      });
    }
  };

  const handleCopyShareLink = async (clashId: number) => {
    const shareUrl = `${window.location.origin}/clash/${clashId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedId(clashId);
      setTimeout(() => setCopiedId((prev) => (prev === clashId ? null : prev)), 2000);
    } catch {
      navigate(`/clash/${clashId}`);
    }
  };

  const renderClashCard = (clash: ClashItem, isFocusedView = false) => {
    const totalVotes = (clash.leftVotes || 0) + (clash.rightVotes || 0);
    const leftPct = totalVotes === 0 ? 50 : Math.round(((clash.leftVotes || 0) / totalVotes) * 100);
    const rightPct = totalVotes === 0 ? 50 : 100 - leftPct;
    const isLive = clash.status === 'live';
    const isCompleted = clash.status === 'completed';
    const isCreatorOrAdmin =
      Boolean(user) &&
      (user?.uid === clash.creatorUid ||
        user?.uid === clash.challengerUid ||
        user?.role === 'owner' ||
        user?.role === 'admin');
    const canModifyBeforeVotes =
      isCreatorOrAdmin &&
      totalVotes === 0 &&
      !['completed', 'cancelled', 'declined', 'expired'].includes(clash.status);

    const cardError = actionError?.clashId === clash.id ? actionError.message : '';

    return (
      <article
        key={clash.id}
        className={`rounded-2xl bg-[#141116] border overflow-hidden p-4 sm:p-5 space-y-4 transition-colors ${
          isFocusedView ? 'border-[#C0263D]/60' : 'border-white/12 hover:border-white/20'
        }`}
      >
        {/* Top Metadata Bar — Clean Unboxed Typography with Separators */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center flex-wrap gap-1.5 text-xs text-[#A7A0AA]">
              <span className="font-semibold text-[#F5F1F2]">{formatModeLabel(clash.clashMode)}</span>
              <span aria-hidden="true">·</span>
              <span>{clash.category}</span>
              <span aria-hidden="true">·</span>
              <span
                className={
                  isLive
                    ? 'text-[#C0263D] font-semibold'
                    : isCompleted
                      ? 'text-emerald-400 font-medium'
                      : 'text-amber-300 font-medium'
                }
              >
                {formatStatusLabel(clash.status)}
              </span>
              {clash.endsAt && isLive && (
                <>
                  <span aria-hidden="true">·</span>
                  <span className="inline-flex items-center gap-1 font-mono-num">
                    <Clock className="w-3 h-3" />
                    {formatTimeRemaining(clash.endsAt)}
                  </span>
                </>
              )}
            </div>
            <Link
              to={`/clash/${clash.id}`}
              className="block text-sm sm:text-base font-bold text-[#F5F1F2] hover:text-[#C0263D] transition-colors line-clamp-1"
            >
              {clash.title}
            </Link>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <span className="text-xs font-mono-num text-[#A7A0AA] mr-1">
              {formatCompactNumber(totalVotes)} {totalVotes === 1 ? 'vote' : 'votes'}
            </span>

            <button
              type="button"
              onClick={() => handleCopyShareLink(clash.id)}
              className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-[#A7A0AA] hover:text-[#F5F1F2] hover:bg-white/5 cursor-pointer"
              title="Copy Clash Link"
            >
              {copiedId === clash.id ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Share2 className="w-3.5 h-3.5" />
              )}
            </button>

            {canModifyBeforeVotes && (
              <>
                <button
                  type="button"
                  onClick={() => handleOpenEditMetadata(clash)}
                  className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-[#A7A0AA] hover:text-[#F5F1F2] hover:bg-white/5 cursor-pointer"
                  title="Edit Clash Details"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleCancelClash(clash.id)}
                  className="min-h-[36px] px-2.5 rounded-lg text-xs text-rose-300 hover:bg-rose-500/10 cursor-pointer"
                  title="Cancel Clash"
                >
                  Cancel
                </button>
              </>
            )}

            {user && (
              <button
                type="button"
                onClick={() => setReportTarget({ id: clash.id, label: clash.title })}
                className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-[#A7A0AA] hover:text-[#F5F1F2] hover:bg-white/5 cursor-pointer"
                title="Report Clash"
              >
                <Flag className="w-3.5 h-3.5" />
              </button>
            )}

            {(user?.role === 'owner' || user?.role === 'admin') && (
              <button
                type="button"
                onClick={() => handleAdminDeleteClash(clash.id)}
                className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-[#A7A0AA] hover:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
                title="Remove Clash (Owner/Admin)"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {clash.description && (
          <p className="text-xs text-[#A7A0AA] leading-relaxed line-clamp-2">
            {clash.description}
          </p>
        )}

        {/* Invitation Response Banner for Invited Hunter or Invited Guild Representative */}
        {clash.canAcceptInvite && (
          <div className="rounded-xl bg-[#09080B] border border-[#6D28D9]/45 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="space-y-0.5">
              <p className="text-xs font-semibold text-[#F5F1F2]">
                {clash.clashMode === 'community_duel'
                  ? 'Your Guild has been challenged to a Community Duel!'
                  : 'You have been challenged to a 1v1 Duel Clash!'}
              </p>
              <p className="text-[11px] text-[#A7A0AA]">
                Accept to unlock edit uploads and open community voting.
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                disabled={respondingId === clash.id}
                onClick={() => handleRespondInvite(clash.id, 'decline')}
                className="min-h-[38px] px-3.5 rounded-xl bg-[#141116] border border-white/12 text-xs font-medium text-[#A7A0AA] hover:text-white cursor-pointer"
              >
                Decline
              </button>
              <button
                type="button"
                disabled={respondingId === clash.id}
                onClick={() => openAcceptInviteModal(clash)}
                className="min-h-[38px] px-4 rounded-xl bg-[#6D28D9] hover:bg-[#7c3aed] text-xs font-semibold text-white cursor-pointer"
              >
                {respondingId === clash.id ? 'Processing...' : 'Accept Challenge'}
              </button>
            </div>
          </div>
        )}

        {/* Winner / Resolution Banner */}
        {isCompleted && (
          <div className="rounded-xl bg-[#09080B] border border-white/10 px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 text-[#F5F1F2] font-semibold">
              <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                {clash.winnerSide === 'left'
                  ? `Victor: ${clash.leftName}`
                  : clash.winnerSide === 'right'
                    ? `Victor: ${clash.rightName}`
                    : 'Official Result: Draw'}
              </span>
            </div>
            <span className="text-[#A7A0AA] font-mono-num">
              {formatCompactNumber(clash.leftVotes)} – {formatCompactNumber(clash.rightVotes)}
            </span>
          </div>
        )}

        {/* Split 2-Column VS Arena */}
        <div className="relative grid grid-cols-2 gap-2.5 sm:gap-3">
          {/* Left Side */}
          <div
            onClick={() => {
              if (isLive && votingId !== clash.id) {
                void handleVote(clash, 'left');
              }
            }}
            className={`group/left relative rounded-xl overflow-hidden aspect-[4/5] sm:aspect-[4/4] border transition-all duration-150 bg-[#09080B] ${
              isLive ? 'cursor-pointer' : ''
            } ${
              clash.viewerVote === 'left'
                ? 'border-[#C0263D] ring-1 ring-[#C0263D] shadow-[0_0_20px_rgba(192,38,61,0.22)]'
                : isCompleted && clash.winnerSide === 'left'
                  ? 'border-amber-400/70'
                  : 'border-white/10 hover:border-[#C0263D]/50'
            }`}
          >
            {clash.leftEntry?.mediaType === 'video' ? (
              <video
                src={clash.leftEntry.mediaUrl}
                poster={clash.leftEntry.posterUrl || clash.leftImageUrl}
                muted
                playsInline
                preload="metadata"
                className="w-full h-full object-cover group-hover/left:scale-[1.03] transition-transform duration-200"
              />
            ) : (
              <KageImage
                src={clash.leftEntry?.mediaUrl || clash.leftImageUrl}
                alt={clash.leftName}
                className="w-full h-full object-cover group-hover/left:scale-[1.03] transition-transform duration-200"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#09080B] via-[#09080B]/40 to-black/20" />

            {/* Top Action Buttons on Left Contender: View Edit & Upload Edit */}
            <div
              className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1.5 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              {clash.leftEntry ? (
                <button
                  type="button"
                  onClick={() =>
                    setViewerMedia({
                      clashTitle: clash.title,
                      sideLabel: 'Challenger Edit',
                      contenderName: clash.leftName,
                      mediaType: clash.leftEntry!.mediaType,
                      mediaUrl: clash.leftEntry!.mediaUrl,
                      posterUrl: clash.leftEntry!.posterUrl || clash.leftImageUrl,
                      entryTitle: clash.leftEntry!.title,
                      caption: clash.leftEntry!.caption,
                      submitterUsername: clash.leftEntry!.submitter.username,
                      submitterDisplayName: clash.leftEntry!.submitter.displayName,
                    })
                  }
                  className="min-h-[34px] px-2.5 rounded-lg bg-[#09080B]/90 hover:bg-[#C0263D] border border-white/15 text-[11px] font-semibold text-[#F5F1F2] flex items-center gap-1.5 kage-press cursor-pointer"
                >
                  {clash.leftEntry.mediaType === 'video' ? (
                    <Play className="w-3 h-3 fill-current" />
                  ) : (
                    <Eye className="w-3 h-3" />
                  )}
                  <span>View Edit</span>
                </button>
              ) : clash.clashMode !== 'solo_character' ? (
                <span className="text-[11px] text-[#A7A0AA] bg-[#09080B]/80 px-2 py-1 rounded-md">
                  No edit yet
                </span>
              ) : (
                <span />
              )}

              {clash.canSubmitLeftEntry && (
                <button
                  type="button"
                  onClick={() => handleOpenUploadEntry(clash, 'left')}
                  className="min-h-[34px] px-2.5 rounded-lg bg-[#C0263D] hover:bg-[#d42b44] text-[11px] font-semibold text-white flex items-center gap-1 kage-press cursor-pointer"
                >
                  <Upload className="w-3 h-3" />
                  <span>{clash.leftEntry ? 'Replace' : 'Upload Edit'}</span>
                </button>
              )}
            </div>

            <div className="absolute inset-x-0 bottom-0 p-3 space-y-2">
              <div>
                <p className="text-[11px] text-[#C0263D] font-semibold truncate">
                  {clash.leftSubtitle || 'Challenger'}
                </p>
                <h3 className="text-xs sm:text-sm font-bold text-[#F5F1F2] line-clamp-1 uppercase">
                  {clash.leftName}
                </h3>
              </div>
              <button
                type="button"
                disabled={!isLive || votingId === clash.id}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleVote(clash, 'left');
                }}
                className={`w-full min-h-[40px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 kage-press ${
                  justVoted?.clashId === clash.id && justVoted.side === 'left'
                    ? 'kage-heart-pop'
                    : ''
                } ${
                  !isLive
                    ? 'bg-[#09080B]/70 text-[#A7A0AA] border border-white/10 cursor-not-allowed'
                    : clash.viewerVote === 'left'
                      ? 'bg-[#C0263D] text-white cursor-pointer'
                      : 'bg-[#09080B]/85 hover:bg-[#C0263D] text-[#F5F1F2] border border-white/15 cursor-pointer'
                }`}
              >
                {clash.viewerVote === 'left' && <Check className="w-3.5 h-3.5" />}
                <span>
                  {clash.viewerVote === 'left'
                    ? 'Voted'
                    : isLive
                      ? 'Vote Left'
                      : formatStatusLabel(clash.status)}
                </span>
              </button>
            </div>
          </div>

          {/* Center VS Emblem */}
          <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-10 w-11 h-11 rounded-full bg-[#09080B] border-2 border-[#C0263D] ring-2 ring-[#6D28D9]/45 flex items-center justify-center shadow-[0_0_22px_rgba(192,38,61,0.45)] pointer-events-none">
            <span className="font-display text-xs font-bold tracking-wider text-[#F5F1F2]">VS</span>
          </div>

          {/* Right Side */}
          <div
            onClick={() => {
              if (isLive && votingId !== clash.id) {
                void handleVote(clash, 'right');
              }
            }}
            className={`group/right relative rounded-xl overflow-hidden aspect-[4/5] sm:aspect-[4/4] border transition-all duration-150 bg-[#09080B] ${
              isLive ? 'cursor-pointer' : ''
            } ${
              clash.viewerVote === 'right'
                ? 'border-[#6D28D9] ring-1 ring-[#6D28D9] shadow-[0_0_20px_rgba(109,40,217,0.25)]'
                : isCompleted && clash.winnerSide === 'right'
                  ? 'border-amber-400/70'
                  : 'border-white/10 hover:border-[#6D28D9]/55'
            }`}
          >
            {clash.rightEntry?.mediaType === 'video' ? (
              <video
                src={clash.rightEntry.mediaUrl}
                poster={clash.rightEntry.posterUrl || clash.rightImageUrl}
                muted
                playsInline
                preload="metadata"
                className="w-full h-full object-cover group-hover/right:scale-[1.03] transition-transform duration-200"
              />
            ) : (
              <KageImage
                src={clash.rightEntry?.mediaUrl || clash.rightImageUrl}
                alt={clash.rightName}
                className="w-full h-full object-cover group-hover/right:scale-[1.03] transition-transform duration-200"
              />
            )}
            <div className="absolute inset-0 bg-gradient-to-t from-[#09080B] via-[#09080B]/40 to-black/20" />

            {/* Top Action Buttons on Right Contender: View Edit & Upload Edit */}
            <div
              className="absolute top-2.5 left-2.5 right-2.5 flex items-center justify-between gap-1.5 z-10"
              onClick={(e) => e.stopPropagation()}
            >
              {clash.canSubmitRightEntry ? (
                <button
                  type="button"
                  onClick={() => handleOpenUploadEntry(clash, 'right')}
                  className="min-h-[34px] px-2.5 rounded-lg bg-[#6D28D9] hover:bg-[#7c3aed] text-[11px] font-semibold text-white flex items-center gap-1 kage-press cursor-pointer"
                >
                  <Upload className="w-3 h-3" />
                  <span>{clash.rightEntry ? 'Replace' : 'Upload Edit'}</span>
                </button>
              ) : (
                <span />
              )}

              {clash.rightEntry ? (
                <button
                  type="button"
                  onClick={() =>
                    setViewerMedia({
                      clashTitle: clash.title,
                      sideLabel: 'Contender Edit',
                      contenderName: clash.rightName,
                      mediaType: clash.rightEntry!.mediaType,
                      mediaUrl: clash.rightEntry!.mediaUrl,
                      posterUrl: clash.rightEntry!.posterUrl || clash.rightImageUrl,
                      entryTitle: clash.rightEntry!.title,
                      caption: clash.rightEntry!.caption,
                      submitterUsername: clash.rightEntry!.submitter.username,
                      submitterDisplayName: clash.rightEntry!.submitter.displayName,
                    })
                  }
                  className="min-h-[34px] px-2.5 rounded-lg bg-[#09080B]/90 hover:bg-[#6D28D9] border border-white/15 text-[11px] font-semibold text-[#F5F1F2] flex items-center gap-1.5 kage-press cursor-pointer"
                >
                  {clash.rightEntry.mediaType === 'video' ? (
                    <Play className="w-3 h-3 fill-current" />
                  ) : (
                    <Eye className="w-3 h-3" />
                  )}
                  <span>View Edit</span>
                </button>
              ) : clash.clashMode !== 'solo_character' ? (
                <span className="text-[11px] text-[#A7A0AA] bg-[#09080B]/80 px-2 py-1 rounded-md">
                  No edit yet
                </span>
              ) : null}
            </div>

            <div className="absolute inset-x-0 bottom-0 p-3 space-y-2 text-right">
              <div>
                <p className="text-[11px] text-[#6D28D9] font-semibold truncate">
                  {clash.rightSubtitle || 'Contender'}
                </p>
                <h3 className="text-xs sm:text-sm font-bold text-[#F5F1F2] line-clamp-1 uppercase">
                  {clash.rightName}
                </h3>
              </div>
              <button
                type="button"
                disabled={!isLive || votingId === clash.id}
                onClick={(e) => {
                  e.stopPropagation();
                  void handleVote(clash, 'right');
                }}
                className={`w-full min-h-[40px] rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 kage-press ${
                  justVoted?.clashId === clash.id && justVoted.side === 'right'
                    ? 'kage-heart-pop'
                    : ''
                } ${
                  !isLive
                    ? 'bg-[#09080B]/70 text-[#A7A0AA] border border-white/10 cursor-not-allowed'
                    : clash.viewerVote === 'right'
                      ? 'bg-[#6D28D9] text-white cursor-pointer'
                      : 'bg-[#09080B]/85 hover:bg-[#6D28D9] text-[#F5F1F2] border border-white/15 cursor-pointer'
                }`}
              >
                {clash.viewerVote === 'right' && <Check className="w-3.5 h-3.5" />}
                <span>
                  {clash.viewerVote === 'right'
                    ? 'Voted'
                    : isLive
                      ? 'Vote Right'
                      : formatStatusLabel(clash.status)}
                </span>
              </button>
            </div>
          </div>
        </div>

        {/* Live Tug-Of-War Meter */}
        <div className="space-y-1.5 pt-0.5">
          <div className="flex items-center justify-between text-xs font-mono-num">
            <span className="text-[#C0263D] font-bold">
              {leftPct}% ({formatCompactNumber(clash.leftVotes)})
            </span>
            {totalVotes > 0 && leftPct !== rightPct && (
              <span className="text-[11px] text-[#A7A0AA] font-sans">
                {leftPct > rightPct ? `${clash.leftName} leads` : `${clash.rightName} leads`}
              </span>
            )}
            <span className="text-[#6D28D9] font-bold">
              ({formatCompactNumber(clash.rightVotes)}) {rightPct}%
            </span>
          </div>
          <div className="h-2.5 rounded-full bg-[#09080B] overflow-hidden flex border border-white/8">
            <div
              className="h-full bg-[#C0263D] transition-all duration-300"
              style={{ width: `${leftPct}%` }}
            />
            <div
              className="h-full bg-[#6D28D9] transition-all duration-300"
              style={{ width: `${rightPct}%` }}
            />
          </div>
        </div>

        {/* Solo Character Fan-Opinion Disclaimer */}
        {clash.isFanOpinionPowerVote && clash.fanVoteDisclaimer && (
          <p className="text-[11px] text-[#A7A0AA] pt-1 border-t border-white/8">
            {clash.fanVoteDisclaimer}
          </p>
        )}

        {/* Community Duel Escrowed Rewards & Reward Poll */}
        {clash.clashMode === 'community_duel' && clash.hasRewards && clash.rewards.length > 0 && (
          <div className="pt-3 border-t border-white/8 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-[#F5F1F2] flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-[#C0263D]" />
                <span>Escrowed Guild War Rewards ({clash.rewards.length})</span>
              </span>
              <span className="text-[11px] text-[#A7A0AA]">
                Vote for the prize claimed by the victor
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {clash.rewards.map((rw) => {
                const isVoted = clash.viewerRewardVote === rw.id;
                const pollOpen = ['pending_acceptance', 'awaiting_entries', 'live'].includes(
                  clash.status
                );
                return (
                  <div
                    key={rw.id}
                    className="rounded-xl bg-[#09080B] border border-white/10 p-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#F5F1F2] truncate">{rw.label}</p>
                      <p className="text-[11px] text-[#A7A0AA] truncate">
                        {rw.status === 'awarded'
                          ? 'Awarded to Victor'
                          : rw.status === 'released'
                            ? 'Released from Escrow'
                            : `Escrowed · ${rw.voteCount} ${rw.voteCount === 1 ? 'vote' : 'votes'}`}
                      </p>
                    </div>
                    {pollOpen && (
                      <button
                        type="button"
                        disabled={rewardVotingId === rw.id}
                        onClick={() => handleRewardPollVote(clash.id, rw.id)}
                        className={`min-h-[32px] px-2.5 rounded-lg text-[11px] font-semibold shrink-0 transition-colors cursor-pointer ${
                          isVoted
                            ? 'bg-[#6D28D9] text-white'
                            : 'bg-[#141116] border border-white/12 text-[#A7A0AA] hover:text-white'
                        }`}
                      >
                        {isVoted ? 'Backed' : 'Back Prize'}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Inline Error Feedback (e.g. 409 Duplicate Vote) */}
        {cardError && (
          <div className="rounded-xl bg-rose-500/10 border border-rose-500/30 px-3 py-2 flex items-center justify-between gap-2 text-xs text-rose-300">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{cardError}</span>
            </div>
            <button
              type="button"
              onClick={() => setActionError(null)}
              className="text-rose-200 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </article>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wider text-[#F5F1F2]">
            CLASH
          </h1>
          <p className="text-xs sm:text-sm text-[#A7A0AA] mt-0.5">
            Every Vote Sparks a War — 1v1 Hunter Duels, Guild Wars &amp; Character Showdowns.
          </p>
        </div>

        <button
          type="button"
          onClick={() => (user ? setCreateOpen(true) : navigate('/auth/login'))}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Challenge</span>
        </button>
      </div>

      {/* Focused Deep-Linked Clash View (/clash/:clashId) */}
      {routeClashId && focusedClash && (
        <section className="space-y-3 pb-4 border-b border-white/10">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate('/clash')}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#A7A0AA] hover:text-[#F5F1F2] cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>All Clash Battles</span>
            </button>
            <span className="text-xs text-[#A7A0AA] font-mono-num">Clash #{focusedClash.id}</span>
          </div>
          {renderClashCard(focusedClash, true)}
        </section>
      )}

      {/* Search & Mode Tabs */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[#A7A0AA] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search Clash matchups, hunters, guilds, or characters..."
            className="w-full min-h-[44px] rounded-xl bg-[#141116] border border-white/10 pl-10 pr-4 text-sm text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {CLASH_TABS.map((t) => {
            const active = activeTab === t.key;
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => setActiveTab(t.key)}
                className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap kage-press cursor-pointer ${
                  active
                    ? 'bg-[#C0263D] text-white'
                    : 'bg-[#141116] border border-white/10 text-[#A7A0AA] hover:text-[#F5F1F2]'
                }`}
              >
                {t.label}
              </button>
            );
          })}
          {clashes.length > 1 && (
            <button
              type="button"
              onClick={() => {
                const livePool = clashes.filter((c) => c.status === 'live');
                const pool = livePool.length > 0 ? livePool : clashes;
                const picked = pool[Math.floor(Math.random() * pool.length)];
                if (picked) navigate(`/clash/${picked.id}`);
              }}
              className="min-h-[38px] px-3.5 rounded-xl bg-[#141116] hover:bg-[#1C1720] border border-[#6D28D9]/45 text-xs font-semibold text-[#F5F1F2] inline-flex items-center gap-1.5 whitespace-nowrap kage-press cursor-pointer ml-auto"
            >
              <Shuffle className="w-3.5 h-3.5 text-[#6D28D9]" />
              <span>Random Battle</span>
            </button>
          )}
        </div>
      </div>

      {/* Clash Arena Cards */}
      {loading ? (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-80 rounded-2xl bg-[#141116] animate-pulse" />
          ))}
        </div>
      ) : clashes.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#141116] border border-white/8 text-center space-y-3">
          <Swords className="w-8 h-8 text-[#C0263D] mx-auto" />
          <p className="text-sm font-semibold text-[#F5F1F2]">
            No Clash battles found in this view
          </p>
          <p className="text-xs text-[#A7A0AA] max-w-md mx-auto">
            Start a Solo Character Clash, challenge another hunter to a 1v1 Anime Edit Duel, or
            launch a Guild War with escrowed rewards.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {clashes.map((clash) => renderClashCard(clash))}
          </div>

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                disabled={loadingMore}
                onClick={() => loadClashes(false)}
                className="min-h-[42px] px-6 rounded-xl bg-[#141116] border border-white/12 hover:border-[#C0263D] text-xs font-semibold text-[#F5F1F2] cursor-pointer"
              >
                {loadingMore ? 'Loading Battles...' : 'Load More Clashes'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Fullscreen "View Edit" Media Viewer Modal */}
      {viewerMedia && (
        <div
          className="fixed inset-0 z-50 bg-black/92 backdrop-blur-md flex items-center justify-center p-4"
          onClick={() => setViewerMedia(null)}
        >
          <div
            className="w-full max-w-4xl rounded-2xl bg-[#141116] border border-white/15 overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/10">
              <div className="min-w-0">
                <p className="text-xs text-[#A7A0AA] truncate">
                  {viewerMedia.sideLabel} · {viewerMedia.contenderName}
                </p>
                <h3 className="text-sm sm:text-base font-bold text-[#F5F1F2] truncate">
                  {viewerMedia.entryTitle || viewerMedia.clashTitle}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setViewerMedia(null)}
                className="min-h-[40px] min-w-[40px] rounded-xl bg-[#09080B] border border-white/10 flex items-center justify-center text-[#A7A0AA] hover:text-white cursor-pointer"
                aria-label="Close media viewer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-black flex items-center justify-center max-h-[72vh] overflow-hidden">
              {viewerMedia.mediaType === 'video' ? (
                <video
                  src={viewerMedia.mediaUrl}
                  poster={viewerMedia.posterUrl || undefined}
                  controls
                  autoPlay
                  playsInline
                  className="max-h-[72vh] w-full object-contain"
                />
              ) : (
                <KageImage
                  src={viewerMedia.mediaUrl}
                  alt={viewerMedia.contenderName}
                  className="max-h-[72vh] w-auto object-contain"
                />
              )}
            </div>

            {(viewerMedia.caption || viewerMedia.submitterUsername) && (
              <div className="px-4 py-3 border-t border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                <p className="text-[#F5F1F2]">{viewerMedia.caption || 'Official Clash Entry'}</p>
                {viewerMedia.submitterUsername && (
                  <Link
                    to={`/profile/${viewerMedia.submitterUsername}`}
                    onClick={() => setViewerMedia(null)}
                    className="text-[#A7A0AA] hover:text-[#F5F1F2] shrink-0"
                  >
                    Submitted by {viewerMedia.submitterDisplayName} (@
                    {viewerMedia.submitterUsername})
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Per-Side Upload Edit Modal */}
      <KageModal
        isOpen={Boolean(entryModalClash)}
        onClose={() => setEntryModalClash(null)}
        title="Upload Duel Edit"
        subtitle={
          entryModalClash
            ? entryModalClash.side === 'left'
              ? entryModalClash.clash.leftName
              : entryModalClash.clash.rightName
            : undefined
        }
        maxWidthClass="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEntryModalClash(null)}
              className="min-h-[42px] px-4 rounded-xl bg-[#09080B] border border-white/10 text-xs text-[#A7A0AA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="clash-entry-upload-form"
              disabled={submittingEntry}
              className="min-h-[42px] px-5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
            >
              {submittingEntry ? 'Uploading...' : 'Submit Edit'}
            </button>
          </div>
        }
      >
        <form id="clash-entry-upload-form" onSubmit={handleSubmitEntry} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
              Edit Title
            </label>
            <input
              type="text"
              value={entryTitle}
              onChange={(e) => setEntryTitle(e.target.value)}
              placeholder="e.g., Shadow Monarch 4K Flow Edit"
              className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 px-3.5 text-sm text-[#F5F1F2]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
              Caption / Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={entryCaption}
              onChange={(e) => setEntryCaption(e.target.value)}
              placeholder="Audio track, software used, or edit breakdown..."
              className="w-full rounded-xl bg-[#09080B] border border-white/10 p-3 text-xs sm:text-sm text-[#F5F1F2]"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-[#A7A0AA] mb-1.5">
              Media File (MP4/WebM Video up to 16 MB or Image up to 8 MB)
            </label>
            <label className="flex items-center justify-center gap-2 min-h-[52px] rounded-xl bg-[#09080B] border border-dashed border-white/20 hover:border-[#C0263D] px-4 py-3 text-xs text-[#F5F1F2] cursor-pointer">
              {entryMediaType === 'video' ? (
                <Film className="w-4 h-4 text-[#C0263D]" />
              ) : (
                <ImageIcon className="w-4 h-4 text-[#6D28D9]" />
              )}
              <span className="truncate">
                {entryFileName || 'Choose video edit or artwork file...'}
              </span>
              <input
                type="file"
                accept="video/mp4,video/webm,image/jpeg,image/png,image/webp,image/gif"
                onChange={handleEntryFilePick}
                className="hidden"
              />
            </label>
          </div>

          {entryError && <p className="text-xs text-rose-400">{entryError}</p>}
        </form>
      </KageModal>

      {/* Community Duel Accept & Optional Counter-Stake Modal */}
      <KageModal
        isOpen={Boolean(acceptModalClash)}
        onClose={() => setAcceptModalClash(null)}
        title="Accept Guild Clash"
        subtitle={acceptModalClash?.title}
        maxWidthClass="max-w-md"
        footer={
          acceptModalClash ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAcceptModalClash(null)}
                className="min-h-[42px] px-4 rounded-xl bg-[#09080B] border border-white/10 text-xs text-[#A7A0AA] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={respondingId === acceptModalClash.id}
                onClick={() =>
                  handleRespondInvite(acceptModalClash.id, 'accept', acceptStakedRewards)
                }
                className="min-h-[42px] px-5 rounded-xl bg-[#6D28D9] hover:bg-[#7c3aed] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
              >
                {respondingId === acceptModalClash.id ? 'Accepting...' : 'Confirm & Accept'}
              </button>
            </div>
          ) : undefined
        }
      >
        <div className="space-y-3">
          <p className="text-xs text-[#A7A0AA]">
            Optionally stake Guild or Personal rewards into escrow for this Guild War. All
            escrowed prizes are awarded to the winning side upon completion.
          </p>

          {acceptEligibleRewards && (
            <div className="space-y-2">
              {acceptEligibleRewards.communityRewards.map((cr) => {
                const checked = acceptStakedRewards.some(
                  (r) => r.sourceKind === 'community_reward' && r.sourceRewardId === cr.id
                );
                return (
                  <button
                    key={`cr-${cr.id}`}
                    type="button"
                    onClick={() =>
                      toggleRewardSelection(
                        acceptStakedRewards,
                        setAcceptStakedRewards,
                        'community_reward',
                        cr.id
                      )
                    }
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 cursor-pointer ${
                      checked
                        ? 'bg-[#6D28D9]/20 border-[#6D28D9] text-white'
                        : 'bg-[#09080B] border-white/10 text-[#A7A0AA]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#F5F1F2] truncate">
                        {cr.title}
                      </p>
                      <p className="text-[11px] truncate">Guild Crest · {cr.description}</p>
                    </div>
                    {checked && <Check className="w-4 h-4 text-[#6D28D9] shrink-0" />}
                  </button>
                );
              })}

              {acceptEligibleRewards.userRewards.map((ur) => {
                const checked = acceptStakedRewards.some(
                  (r) => r.sourceKind === 'user_reward' && r.sourceRewardId === ur.id
                );
                return (
                  <button
                    key={`ur-${ur.id}`}
                    type="button"
                    onClick={() =>
                      toggleRewardSelection(
                        acceptStakedRewards,
                        setAcceptStakedRewards,
                        'user_reward',
                        ur.id
                      )
                    }
                    className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between gap-2 cursor-pointer ${
                      checked
                        ? 'bg-[#C0263D]/20 border-[#C0263D] text-white'
                        : 'bg-[#09080B] border-white/10 text-[#A7A0AA]'
                    }`}
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#F5F1F2] truncate">
                        {ur.label}
                      </p>
                      <p className="text-[11px] truncate">Personal · {ur.description}</p>
                    </div>
                    {checked && <Check className="w-4 h-4 text-[#C0263D] shrink-0" />}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </KageModal>

      {/* Edit Clash Metadata Modal */}
      <KageModal
        isOpen={Boolean(editingClash)}
        onClose={() => setEditingClash(null)}
        title="Edit Clash Details"
        maxWidthClass="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setEditingClash(null)}
              className="min-h-[42px] px-4 rounded-xl bg-[#09080B] border border-white/10 text-xs text-[#A7A0AA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="clash-edit-details-form"
              disabled={savingEdit}
              className="min-h-[42px] px-5 rounded-xl bg-[#C0263D] text-xs font-semibold text-white cursor-pointer"
            >
              {savingEdit ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        }
      >
        <form id="clash-edit-details-form" onSubmit={handleSaveClashEdit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[#A7A0AA] mb-1">Title</label>
            <input
              type="text"
              required
              value={editTitle}
              onChange={(e) => setEditTitle(e.target.value)}
              className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-sm text-[#F5F1F2]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
              Description
            </label>
            <textarea
              rows={2}
              value={editDescription}
              onChange={(e) => setEditDescription(e.target.value)}
              className="w-full rounded-xl bg-[#09080B] border border-white/10 p-3 text-xs sm:text-sm text-[#F5F1F2]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-[#A7A0AA] mb-1">Rules</label>
            <textarea
              rows={2}
              value={editRules}
              onChange={(e) => setEditRules(e.target.value)}
              className="w-full rounded-xl bg-[#09080B] border border-white/10 p-3 text-xs sm:text-sm text-[#F5F1F2]"
            />
          </div>
        </form>
      </KageModal>

      {/* Create Clash Modal — Supports Solo Character, 1v1 Hunter Duel, and Guild Duel */}
      <KageModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Launch a CLASH"
        subtitle="Choose a battle mode and summon the community to vote."
        maxWidthClass="max-w-xl"
        tallForm
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="min-h-[44px] px-4 rounded-xl bg-[#09080B] border border-white/10 text-xs text-[#A7A0AA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="launch-clash-form"
              disabled={
                creating ||
                (createMode === 'community_duel' && myRepresentativeGuilds.length === 0)
              }
              className="min-h-[44px] px-5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
            >
              {creating
                ? 'Launching...'
                : createMode === 'solo_character'
                  ? 'Start Character Clash'
                  : 'Send Challenge'}
            </button>
          </div>
        }
      >
        <form id="launch-clash-form" onSubmit={handleCreateClash} className="space-y-4">
              {/* Mode Selector */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => handleModeSwitch('solo_character')}
                  className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    createMode === 'solo_character'
                      ? 'bg-[#C0263D]/15 border-[#C0263D] text-white'
                      : 'bg-[#09080B] border-white/10 text-[#A7A0AA]'
                  }`}
                >
                  <Swords className="w-4 h-4 mb-1 text-[#C0263D]" />
                  <p className="text-xs font-bold">Character Clash</p>
                  <p className="text-[10px] text-[#A7A0AA] line-clamp-1">
                    Instant fan vote
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleModeSwitch('user_duel')}
                  className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    createMode === 'user_duel'
                      ? 'bg-[#C0263D]/15 border-[#C0263D] text-white'
                      : 'bg-[#09080B] border-white/10 text-[#A7A0AA]'
                  }`}
                >
                  <Users className="w-4 h-4 mb-1 text-[#C0263D]" />
                  <p className="text-xs font-bold">1v1 Hunter Duel</p>
                  <p className="text-[10px] text-[#A7A0AA] line-clamp-1">
                    Invite &amp; upload edits
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => handleModeSwitch('community_duel')}
                  className={`p-2.5 rounded-xl border text-left transition-colors cursor-pointer ${
                    createMode === 'community_duel'
                      ? 'bg-[#6D28D9]/20 border-[#6D28D9] text-white'
                      : 'bg-[#09080B] border-white/10 text-[#A7A0AA]'
                  }`}
                >
                  <Shield className="w-4 h-4 mb-1 text-[#6D28D9]" />
                  <p className="text-xs font-bold">Guild Duel</p>
                  <p className="text-[10px] text-[#A7A0AA] line-clamp-1">
                    Guild war + rewards
                  </p>
                </button>
              </div>

              {/* Mode-Specific Contender Configuration */}
              {createMode === 'solo_character' && (
                <div className="space-y-3 rounded-xl bg-[#09080B] border border-white/10 p-3.5">
                  <p className="text-[11px] text-[#A7A0AA]">
                    Community Fan Vote: Solo Character Clashes go live immediately with verified
                    catalogue characters and carry no staked duel rewards.
                  </p>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Left Character */}
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-[#C0263D]">
                        Left Character
                      </label>
                      {selectedLeftChar ? (
                        <div className="p-2 rounded-xl bg-[#141116] border border-[#C0263D] flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <KageImage
                              src={selectedLeftChar.imageUrl}
                              alt={selectedLeftChar.name}
                              className="w-9 h-9 rounded-lg object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#F5F1F2] truncate">
                                {selectedLeftChar.name}
                              </p>
                              <p className="text-[10px] text-[#A7A0AA] truncate">
                                {selectedLeftChar.animeTitle}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedLeftChar(null)}
                            className="p-1 text-[#A7A0AA] hover:text-white cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={leftCharQuery}
                            onChange={(e) => setLeftCharQuery(e.target.value)}
                            placeholder="Search character (e.g., Gojo, Jin-Woo)..."
                            className="w-full min-h-[38px] rounded-xl bg-[#141116] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                          />
                          <div className="max-h-36 overflow-y-auto space-y-1">
                            {leftCharResults.slice(0, 8).map((ch) => (
                              <button
                                key={`l-${ch.malId}-${ch.name}`}
                                type="button"
                                onClick={() => setSelectedLeftChar(ch)}
                                className="w-full p-1.5 rounded-lg hover:bg-white/5 flex items-center gap-2 text-left cursor-pointer"
                              >
                                <KageImage
                                  src={ch.imageUrl}
                                  alt={ch.name}
                                  className="w-7 h-7 rounded object-cover shrink-0"
                                />
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-[#F5F1F2] truncate">
                                    {ch.name}
                                  </p>
                                  <p className="text-[10px] text-[#A7A0AA] truncate">
                                    {ch.animeTitle}
                                  </p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Right Character */}
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-[#6D28D9]">
                        Right Character
                      </label>
                      {selectedRightChar ? (
                        <div className="p-2 rounded-xl bg-[#141116] border border-[#6D28D9] flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <KageImage
                              src={selectedRightChar.imageUrl}
                              alt={selectedRightChar.name}
                              className="w-9 h-9 rounded-lg object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#F5F1F2] truncate">
                                {selectedRightChar.name}
                              </p>
                              <p className="text-[10px] text-[#A7A0AA] truncate">
                                {selectedRightChar.animeTitle}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setSelectedRightChar(null)}
                            className="p-1 text-[#A7A0AA] hover:text-white cursor-pointer"
                          >
                            <X className="w-4 h-4" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <input
                            type="text"
                            value={rightCharQuery}
                            onChange={(e) => setRightCharQuery(e.target.value)}
                            placeholder="Search opponent character..."
                            className="w-full min-h-[38px] rounded-xl bg-[#141116] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                          />
                          <div className="max-h-36 overflow-y-auto space-y-1">
                            {rightCharResults.slice(0, 8).map((ch) => (
                              <button
                                key={`r-${ch.malId}-${ch.name}`}
                                type="button"
                                onClick={() => setSelectedRightChar(ch)}
                                className="w-full p-1.5 rounded-lg hover:bg-white/5 flex items-center gap-2 text-left cursor-pointer"
                              >
                                <KageImage
                                  src={ch.imageUrl}
                                  alt={ch.name}
                                  className="w-7 h-7 rounded object-cover shrink-0"
                                />
                                <div className="min-w-0">
                                  <p className="text-xs font-medium text-[#F5F1F2] truncate">
                                    {ch.name}
                                  </p>
                                  <p className="text-[10px] text-[#A7A0AA] truncate">
                                    {ch.animeTitle}
                                  </p>
                                </div>
                              </button>
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {createMode === 'user_duel' && (
                <div className="space-y-3 rounded-xl bg-[#09080B] border border-white/10 p-3.5">
                  <label className="block text-xs font-semibold text-[#F5F1F2]">
                    Challenge Hunter (@username or KAGE ID)
                  </label>
                  {selectedOpponent ? (
                    <div className="p-2.5 rounded-xl bg-[#141116] border border-[#C0263D] flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <KageImage
                          src={selectedOpponent.avatarUrl}
                          alt={selectedOpponent.displayName}
                          className="w-9 h-9 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#F5F1F2] truncate">
                            {selectedOpponent.displayName}
                          </p>
                          <p className="text-[11px] text-[#A7A0AA] truncate">
                            @{selectedOpponent.username}
                            {selectedOpponent.kageId ? ` · ${selectedOpponent.kageId}` : ''}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedOpponent(null)}
                        className="p-1 text-[#A7A0AA] hover:text-white cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={hunterQuery}
                        onChange={(e) => setHunterQuery(e.target.value)}
                        placeholder="Search by @username, name, or KAGE ID..."
                        className="w-full min-h-[40px] rounded-xl bg-[#141116] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                      />
                      <div className="max-h-36 overflow-y-auto space-y-1">
                        {hunterResults.slice(0, 6).map((h) => (
                          <button
                            key={h.uid}
                            type="button"
                            onClick={() => setSelectedOpponent(h)}
                            className="w-full p-2 rounded-lg hover:bg-white/5 flex items-center gap-2.5 text-left cursor-pointer"
                          >
                            <KageImage
                              src={h.avatarUrl}
                              alt={h.displayName}
                              className="w-8 h-8 rounded-full object-cover shrink-0"
                            />
                            <div className="min-w-0">
                              <p className="text-xs font-semibold text-[#F5F1F2] truncate">
                                {h.displayName}
                              </p>
                              <p className="text-[11px] text-[#A7A0AA] truncate">
                                @{h.username} {h.kageId ? `· ${h.kageId}` : ''}
                              </p>
                            </div>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}

              {createMode === 'community_duel' && (
                <div className="space-y-3 rounded-xl bg-[#09080B] border border-white/10 p-3.5">
                  {myRepresentativeGuilds.length === 0 ? (
                    <div className="text-xs text-amber-300 flex items-center gap-2">
                      <Lock className="w-4 h-4 shrink-0" />
                      <span>
                        You must be an Owner, Admin, or Moderator of a Guild to initiate a
                        Community Duel. Forge a Guild first on the Guilds page!
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-[#C0263D] mb-1">
                            Your Challenger Guild
                          </label>
                          <select
                            value={challengerGuildId}
                            onChange={(e) =>
                              setChallengerGuildId(e.target.value ? Number(e.target.value) : '')
                            }
                            className="w-full min-h-[40px] rounded-xl bg-[#141116] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                          >
                            <option value="">Select your Guild...</option>
                            {myRepresentativeGuilds.map((g) => (
                              <option key={g.id} value={g.id}>
                                {g.name}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-xs font-medium text-[#6D28D9] mb-1">
                            Opponent Guild
                          </label>
                          <select
                            value={opponentGuildId}
                            onChange={(e) =>
                              setOpponentGuildId(e.target.value ? Number(e.target.value) : '')
                            }
                            className="w-full min-h-[40px] rounded-xl bg-[#141116] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                          >
                            <option value="">Select rival Guild...</option>
                            {allGuilds
                              .filter((g) => g.id !== Number(challengerGuildId))
                              .map((g) => (
                                <option key={g.id} value={g.id}>
                                  {g.name}
                                </option>
                              ))}
                          </select>
                        </div>
                      </div>

                      {/* Staked Rewards Escrow Selector */}
                      {eligibleRewards && (
                        <div className="space-y-1.5 pt-2 border-t border-white/8">
                          <label className="block text-xs font-semibold text-[#F5F1F2]">
                            Stake Rewards into Escrow (Optional · Max 4)
                          </label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-36 overflow-y-auto">
                            {eligibleRewards.communityRewards.map((cr) => {
                              const selected = stakedRewards.some(
                                (r) =>
                                  r.sourceKind === 'community_reward' &&
                                  r.sourceRewardId === cr.id
                              );
                              return (
                                <button
                                  key={`c-${cr.id}`}
                                  type="button"
                                  onClick={() =>
                                    toggleRewardSelection(
                                      stakedRewards,
                                      setStakedRewards,
                                      'community_reward',
                                      cr.id
                                    )
                                  }
                                  className={`p-2 rounded-lg border text-left text-xs flex items-center justify-between gap-2 cursor-pointer ${
                                    selected
                                      ? 'bg-[#6D28D9]/20 border-[#6D28D9] text-white'
                                      : 'bg-[#141116] border-white/10 text-[#A7A0AA]'
                                  }`}
                                >
                                  <span className="truncate">{cr.title}</span>
                                  {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                                </button>
                              );
                            })}
                            {eligibleRewards.userRewards.map((ur) => {
                              const selected = stakedRewards.some(
                                (r) =>
                                  r.sourceKind === 'user_reward' && r.sourceRewardId === ur.id
                              );
                              return (
                                <button
                                  key={`u-${ur.id}`}
                                  type="button"
                                  onClick={() =>
                                    toggleRewardSelection(
                                      stakedRewards,
                                      setStakedRewards,
                                      'user_reward',
                                      ur.id
                                    )
                                  }
                                  className={`p-2 rounded-lg border text-left text-xs flex items-center justify-between gap-2 cursor-pointer ${
                                    selected
                                      ? 'bg-[#C0263D]/20 border-[#C0263D] text-white'
                                      : 'bg-[#141116] border-white/10 text-[#A7A0AA]'
                                  }`}
                                >
                                  <span className="truncate">{ur.label}</span>
                                  {selected && <Check className="w-3.5 h-3.5 shrink-0" />}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Optional Initial Duel Edit Upload for User/Community Duels */}
              {createMode !== 'solo_character' && (
                <div className="rounded-xl bg-[#09080B] border border-white/10 p-3.5 space-y-2">
                  <label className="block text-xs font-semibold text-[#F5F1F2]">
                    Attach Your Challenger Edit Now (Optional — or upload after acceptance)
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      type="text"
                      value={initialEntryTitle}
                      onChange={(e) => setInitialEntryTitle(e.target.value)}
                      placeholder="Edit title (optional)..."
                      className="min-h-[38px] rounded-xl bg-[#141116] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                    />
                    <label className="min-h-[38px] rounded-xl bg-[#141116] border border-dashed border-white/20 hover:border-[#C0263D] px-3 flex items-center gap-2 text-xs text-[#A7A0AA] cursor-pointer">
                      <Upload className="w-3.5 h-3.5 text-[#C0263D] shrink-0" />
                      <span className="truncate">
                        {initialFileName || 'Upload video or image...'}
                      </span>
                      <input
                        type="file"
                        accept="video/mp4,video/webm,image/jpeg,image/png,image/webp"
                        onChange={handleInitialFilePick}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
              )}

              {/* Common Matchup Metadata */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                    Battle Category
                  </label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                  >
                    {CLASH_CATEGORIES[createMode].map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                    Custom Clash Title (Optional)
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Auto-generated if left blank"
                    className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                    Voting Window Duration
                  </label>
                  <select
                    value={durationHours}
                    onChange={(e) => setDurationHours(Number(e.target.value))}
                    className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                  >
                    <option value={24}>24 Hours</option>
                    <option value={48}>48 Hours</option>
                    <option value={72}>72 Hours (3 Days)</option>
                    <option value={168}>7 Days</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                    Tie-Breaking Rule
                  </label>
                  <select
                    value={tieRule}
                    onChange={(e) => setTieRule(e.target.value as ClashTieRule)}
                    className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                  >
                    <option value="draw">Declare Official Draw</option>
                    <option value="challenger_advantage">Challenger Advantage</option>
                    <option value="sudden_death_first_vote">Earliest Lead Tie-Break</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                  Matchup Context &amp; Rules
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Describe battle conditions, verse equalization, or edit criteria..."
                  className="w-full rounded-xl bg-[#09080B] border border-white/10 p-3 text-xs text-[#F5F1F2]"
                />
              </div>

              <label className="flex items-center gap-2 text-xs text-[#A7A0AA] cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowVoteChange}
                  onChange={(e) => setAllowVoteChange(e.target.checked)}
                  className="rounded border-white/20 bg-[#09080B]"
                />
                <span>Allow hunters to change their vote while the Clash is live</span>
              </label>

              <div>
                <label className="block text-xs font-medium text-[#A7A0AA] mb-1.5">
                  Genre Tags
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-1">
                  {ALL_GENRE_NAMES.map((g) => {
                    const active = genreTags.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() =>
                          setGenreTags((prev) =>
                            prev.includes(g)
                              ? prev.filter((item) => item !== g)
                              : [...prev.slice(0, 4), g]
                          )
                        }
                        className={`px-2.5 py-1 rounded-lg text-xs border cursor-pointer ${
                          active
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

              {createError && <p className="text-xs text-rose-400">{createError}</p>}
        </form>
      </KageModal>

      {reportTarget && (
        <ReportModal
          isOpen={Boolean(reportTarget)}
          onClose={() => setReportTarget(null)}
          targetType="clash"
          targetId={reportTarget.id}
          targetLabel={reportTarget.label}
        />
      )}
    </div>
  );
};
