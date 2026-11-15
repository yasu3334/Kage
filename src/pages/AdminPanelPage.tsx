import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  BookOpen,
  Check,
  Crown,
  ExternalLink,
  Flag,
  Loader2,
  Megaphone,
  MessageSquare,
  Mic,
  Pin,
  RefreshCw,
  Search,
  Send,
  ShieldAlert,
  Sliders,
  Sparkles,
  Swords,
  Trash2,
  Upload,
  Users,
  Video,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { KageImage } from '../components/KageImage';
import { OwnerBadge } from '../components/KageBrand';
import { PRESET_BANNERS } from '../lib/assets';
import {
  fetchSplashVideoConfig,
  invalidateSplashVideoCache,
  SplashVideoConfig,
} from '../lib/splashVideoStore';
import { formatCompactNumber } from '../lib/formatters';

interface AdminOverviewData {
  stats: {
    totalUsers: number;
    humanUsers?: number;
    aiDemoUsers?: number;
    onlineUsers: number;
    totalPosts: number;
    totalComments: number;
    totalGuilds: number;
    activeVoiceRooms: number;
    totalClashes: number;
    openReports: number;
    totalAnnouncements: number;
  };
  users: {
    uid: string;
    kageId?: string;
    email: string;
    username: string;
    role: string;
    emailVerified: boolean;
    isSeed: boolean;
    isAiDemo?: boolean;
    createdAt: string;
    displayName: string;
    avatarUrl: string;
    bio: string;
    isOnline: boolean;
  }[];
  posts: {
    id: number;
    title: string;
    content: string;
    kind: string;
    isAiGenerated?: boolean;
    mediaUrl?: string | null;
    isPinned: boolean;
    likeCount: number;
    commentCount: number;
    createdAt: string;
    authorUid: string;
    authorUsername: string;
    authorDisplayName: string;
    authorRole: string;
  }[];
  guilds: {
    id: number;
    slug: string;
    name: string;
    description: string;
    artworkUrl: string;
    memberCount: number;
    discussionCount: number;
  }[];
  voiceRooms: {
    id: number;
    title: string;
    topic: string;
    artworkUrl: string;
    capacity: number;
    participantCount: number;
  }[];
  clashes: {
    id: number;
    title: string;
    category: string;
    leftName: string;
    rightName: string;
    leftVotes: number;
    rightVotes: number;
  }[];
  reports: {
    id: number;
    reporterUid: string;
    reporterUsername: string;
    targetType: string;
    targetId: string;
    reason: string;
    details: string;
    status: string;
    createdAt: string;
  }[];
  announcements: {
    title: string;
    body: string;
    linkUrl: string;
    createdAt: string;
    recipients: number;
  }[];
}

interface AiCommunityOverviewResponse {
  config: {
    id: number;
    aiActivityEnabled: boolean;
    ownerDemoAudienceEnabled: boolean;
    showcasePostId: number | null;
    targetDemoProfiles: number;
    targetCommunityMembers: number;
    targetOwnerFollowers: number;
    targetShowcaseLikes: number;
    targetShowcaseReposts: number;
    targetShowcaseComments: number;
    targetShowcaseShares: number;
    lastSeededAt?: string | null;
  };
  isRunning: boolean;
  activeJobId: number | null;
  metrics: {
    humanUsers: number;
    demoUsers: number;
    standardCommunities: number;
    demoCommunities: number;
    demoCommunityMembers: number;
    humanPosts: number;
    demoPosts: number;
    humanComments: number;
    demoComments: number;
    ownerRealFollowers: number;
    ownerDemoFollowers: number;
  };
  ownerPosts: {
    id: number;
    title: string;
    kind: string;
    likeCount: number;
    demoLikeCount: number;
    commentCount: number;
    demoCommentCount: number;
    repostCount: number;
    demoRepostCount: number;
    shareCount: number;
    demoShareCount: number;
    createdAt: string;
  }[];
  recentJobs: {
    id: number;
    status: string;
    jobType: string;
    progressPercent: number;
    stepLabel: string;
    errorMessage?: string | null;
    startedAt: string;
    completedAt?: string | null;
  }[];
  samplePersonas: {
    uid: string;
    kageId?: string | null;
    username: string;
    displayName: string;
    avatarUrl: string;
    personaArchetype: string;
    favoriteAnime: string;
    favoriteCharacter: string;
    isCommunityMember: boolean;
  }[];
  geminiConfigured: boolean;
}

export const AdminPanelPage: React.FC = () => {
  const { user, refreshMe } = useAuth();
  const [data, setData] = useState<AdminOverviewData | null>(null);
  const [aiData, setAiData] = useState<AiCommunityOverviewResponse | null>(null);
  const [splashCfg, setSplashCfg] = useState<SplashVideoConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  const [activeTab, setActiveTab] = useState<
    'announce' | 'ai_community' | 'users' | 'posts' | 'realms' | 'inkverse' | 'reports'
  >('announce');

  // INKVERSE Creator Uploads Moderation Queue
  const [inkverseFilter, setInkverseFilter] = useState<'all' | 'approved' | 'pending_review' | 'rejected'>('all');
  const [inkverseQueue, setInkverseQueue] = useState<{
    series: {
      id: number;
      title: string;
      format: string;
      coverImageUrl: string;
      coverQuality: string;
      inAppChapterCount?: number;
      moderationStatus?: string;
      moderationNote?: string | null;
      uploader?: { username: string; displayName: string } | null;
    }[];
    chapters: {
      id: number;
      mangaId: number;
      mangaTitle: string;
      chapterNumber: string;
      title: string;
      language: string;
      pageCount: number;
      qualityTier: string;
      moderationStatus: string;
      moderationNote?: string | null;
      publishedAt?: string | null;
      uploader?: { username: string; displayName: string } | null;
    }[];
  } | null>(null);
  const [loadingInkverse, setLoadingInkverse] = useState(false);
  const [inkverseNotes, setInkverseNotes] = useState<Record<string, string>>({});

  // Announcement composer state
  const [annTitle, setAnnTitle] = useState('');
  const [annBody, setAnnBody] = useState('');
  const [annLink, setAnnLink] = useState('/pulse');
  const [annMedia, setAnnMedia] = useState<string>('');
  const [pinToPulse, setPinToPulse] = useState(true);
  const [broadcasting, setBroadcasting] = useState(false);

  // AI Community Config Form State
  const [cfgAiEnabled, setCfgAiEnabled] = useState(true);
  const [cfgOwnerAudienceEnabled, setCfgOwnerAudienceEnabled] = useState(true);
  const [cfgShowcasePostId, setCfgShowcasePostId] = useState<number | ''>('');
  const [cfgOwnerFollowers, setCfgOwnerFollowers] = useState(10000);
  const [cfgShowcaseLikes, setCfgShowcaseLikes] = useState(10000);
  const [cfgShowcaseReposts, setCfgShowcaseReposts] = useState(1000);
  const [cfgShowcaseComments, setCfgShowcaseComments] = useState(5000);
  const [cfgShowcaseShares, setCfgShowcaseShares] = useState(650);
  const [cfgCommunityMembers, setCfgCommunityMembers] = useState(5000);
  const [savingAiConfig, setSavingAiConfig] = useState(false);
  const [triggeringSeed, setTriggeringSeed] = useState(false);
  const [uploadingSplash, setUploadingSplash] = useState(false);

  // Filters & confirmation states
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'owner' | 'admin' | 'moderator' | 'user'>(
    'all'
  );
  const [postSearch, setPostSearch] = useState('');
  const [confirmDeleteUserUid, setConfirmDeleteUserUid] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const isAuthorized = user?.role === 'owner' || user?.role === 'admin';

  const hydrateAiConfigForm = useCallback((res: AiCommunityOverviewResponse) => {
    setAiData(res);
    if (res?.config) {
      setCfgAiEnabled(Boolean(res.config.aiActivityEnabled));
      setCfgOwnerAudienceEnabled(Boolean(res.config.ownerDemoAudienceEnabled));
      setCfgShowcasePostId(res.config.showcasePostId ?? '');
      setCfgOwnerFollowers(res.config.targetOwnerFollowers ?? 10000);
      setCfgShowcaseLikes(res.config.targetShowcaseLikes ?? 10000);
      setCfgShowcaseReposts(res.config.targetShowcaseReposts ?? 1000);
      setCfgShowcaseComments(res.config.targetShowcaseComments ?? 5000);
      setCfgShowcaseShares(res.config.targetShowcaseShares ?? 650);
      setCfgCommunityMembers(res.config.targetCommunityMembers ?? 5000);
    }
  }, []);

  const loadAiCommunity = useCallback(
    async (silent = false) => {
      if (!isAuthorized) return;
      try {
        const res = await apiFetch<AiCommunityOverviewResponse>('/api/admin/ai-community');
        if (silent) {
          setAiData(res);
        } else {
          hydrateAiConfigForm(res);
        }
      } catch (err: any) {
        if (!silent) {
          setError(err.message || 'Unable to load AI Community Engine status.');
        }
      }
    },
    [isAuthorized, hydrateAiConfigForm]
  );

  const loadOverview = useCallback(async () => {
    if (!isAuthorized) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [overviewRes, aiRes, splashRes] = await Promise.all([
        apiFetch<AdminOverviewData>('/api/admin/overview'),
        apiFetch<AiCommunityOverviewResponse>('/api/admin/ai-community').catch(() => null),
        fetchSplashVideoConfig(true).catch(() => null),
      ]);
      setData(overviewRes);
      if (aiRes) hydrateAiConfigForm(aiRes);
      if (splashRes) setSplashCfg(splashRes);
    } catch (err: any) {
      setError(err.message || 'Unable to load Sovereign Admin Console.');
    } finally {
      setLoading(false);
    }
  }, [isAuthorized, hydrateAiConfigForm]);

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  // Poll AI seeding job progress every 2.5s while a job is running
  useEffect(() => {
    if (!aiData?.isRunning || !isAuthorized) return;
    const interval = setInterval(() => {
      loadAiCommunity(true);
    }, 2500);
    return () => clearInterval(interval);
  }, [aiData?.isRunning, isAuthorized, loadAiCommunity]);

  const loadInkverseModeration = useCallback(
    async (statusFilter = inkverseFilter) => {
      if (!isAuthorized) return;
      setLoadingInkverse(true);
      try {
        const res = await apiFetch<any>(
          `/api/admin/inkverse/moderation?status=${encodeURIComponent(statusFilter)}`
        );
        setInkverseQueue(res);
      } catch {
        // ignore
      } finally {
        setLoadingInkverse(false);
      }
    },
    [isAuthorized, inkverseFilter]
  );

  useEffect(() => {
    if (activeTab === 'inkverse') {
      loadInkverseModeration(inkverseFilter);
    }
  }, [activeTab, inkverseFilter, loadInkverseModeration]);

  const showSuccess = (msg: string) => {
    setFeedback(msg);
    setTimeout(() => setFeedback((cur) => (cur === msg ? '' : cur)), 4500);
  };

  const handleModerateInkverse = async (
    type: 'manga' | 'chapter',
    id: number,
    status: 'approved' | 'rejected' | 'pending_review'
  ) => {
    const noteKey = `${type}:${id}`;
    setBusyKey(`ink:${noteKey}:${status}`);
    setError('');
    try {
      await apiFetch('/api/admin/inkverse/moderation', {
        method: 'PATCH',
        body: JSON.stringify({
          type,
          id,
          status,
          note: (inkverseNotes[noteKey] || '').trim() || undefined,
        }),
      });
      showSuccess(`Updated ${type} #${id} status to ${status.replace(/_/g, ' ')}.`);
      await loadInkverseModeration(inkverseFilter);
    } catch (err: any) {
      setError(err?.message || 'Failed to update INKVERSE moderation status.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteInkverseItem = async (type: 'manga' | 'chapter', id: number) => {
    setBusyKey(`inkdel:${type}:${id}`);
    setError('');
    try {
      const endpoint =
        type === 'manga'
          ? `/api/inkverse/studio/manga/${id}`
          : `/api/inkverse/studio/chapters/${id}`;
      await apiFetch(endpoint, { method: 'DELETE' });
      showSuccess(`Removed ${type} #${id} permanently from INKVERSE.`);
      await loadInkverseModeration(inkverseFilter);
    } catch (err: any) {
      setError(err?.message || 'Failed to delete INKVERSE item.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleSaveAiConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingAiConfig(true);
    setError('');
    try {
      const updated = await apiFetch<AiCommunityOverviewResponse>('/api/admin/ai-community/config', {
        method: 'PUT',
        body: JSON.stringify({
          aiActivityEnabled: cfgAiEnabled,
          ownerDemoAudienceEnabled: cfgOwnerAudienceEnabled,
          showcasePostId: cfgShowcasePostId === '' ? null : Number(cfgShowcasePostId),
          targetOwnerFollowers: Number(cfgOwnerFollowers),
          targetShowcaseLikes: Number(cfgShowcaseLikes),
          targetShowcaseReposts: Number(cfgShowcaseReposts),
          targetShowcaseComments: Number(cfgShowcaseComments),
          targetShowcaseShares: Number(cfgShowcaseShares),
          targetCommunityMembers: Number(cfgCommunityMembers),
        }),
      });
      hydrateAiConfigForm(updated);
      showSuccess(
        'AI Community configuration saved and simulated vs organic engagement counters synchronized.'
      );
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Failed to update AI Community configuration.');
    } finally {
      setSavingAiConfig(false);
    }
  };

  const handleTriggerAiSeed = async (useGemini: boolean) => {
    setTriggeringSeed(true);
    setError('');
    try {
      await apiFetch('/api/admin/ai-community/seed', {
        method: 'POST',
        body: JSON.stringify({ useGemini }),
      });
      showSuccess(
        useGemini
          ? 'Started background community sync + Gemini discussion generation.'
          : 'Started background 10k community verification & sync job.'
      );
      await loadAiCommunity(true);
    } catch (err: any) {
      setError(err.message || 'Could not start AI seeding job.');
    } finally {
      setTriggeringSeed(false);
    }
  };

  const handleDeveloperSplashUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 34 * 1024 * 1024) {
      setError('Authorized intro video file must be 34 MB or smaller.');
      return;
    }
    setUploadingSplash(true);
    setError('');
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = String(reader.result || '');
        const res = await apiFetch<{ splash: SplashVideoConfig }>('/api/splash-config/upload', {
          method: 'POST',
          body: JSON.stringify({ dataUrl }),
        });
        invalidateSplashVideoCache();
        setSplashCfg(res.splash);
        showSuccess('Authorized Captain Yami splash video uploaded and activated.');
      } catch (err: any) {
        setError(err.message || 'Splash video upload failed.');
      } finally {
        setUploadingSplash(false);
      }
    };
    reader.onerror = () => {
      setUploadingSplash(false);
      setError('Failed to read selected video file.');
    };
    reader.readAsDataURL(file);
  };

  const handleResetSplashVideo = async () => {
    setUploadingSplash(true);
    setError('');
    try {
      const res = await apiFetch<{ splash: SplashVideoConfig }>('/api/splash-config', {
        method: 'DELETE',
      });
      invalidateSplashVideoCache();
      setSplashCfg(res.splash);
      showSuccess('Reverted to default authorized Black Clover Captain Yami stream.');
    } catch (err: any) {
      setError(err.message || 'Could not reset splash video.');
    } finally {
      setUploadingSplash(false);
    }
  };

  const handleBroadcastAnnouncement = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!annTitle.trim() || !annBody.trim()) {
      setError('Enter both an announcement headline and message body.');
      return;
    }
    setBroadcasting(true);
    setError('');
    try {
      const res = await apiFetch<{ recipientCount: number; linkUrl: string }>(
        '/api/admin/announce',
        {
          method: 'POST',
          body: JSON.stringify({
            title: annTitle.trim(),
            body: annBody.trim(),
            linkUrl: annLink.trim() || '/pulse',
            pinToPulse,
            mediaUrl: annMedia || null,
          }),
        }
      );
      setAnnTitle('');
      setAnnBody('');
      setAnnMedia('');
      showSuccess(
        `Broadcast delivered to ${formatCompactNumber(res.recipientCount)} hunters across KAGE${
          pinToPulse ? ' and pinned on PULSE!' : '!'
        }`
      );
      await Promise.all([loadOverview(), refreshMe()]);
    } catch (err: any) {
      setError(err.message || 'Broadcast failed.');
    } finally {
      setBroadcasting(false);
    }
  };

  const handleRoleChange = async (
    targetUid: string,
    newRole: 'owner' | 'admin' | 'moderator' | 'user'
  ) => {
    setBusyKey(`role:${targetUid}`);
    setError('');
    try {
      await apiFetch(`/api/admin/users/${targetUid}/role`, {
        method: 'POST',
        body: JSON.stringify({ role: newRole }),
      });
      setData((prev) =>
        prev
          ? {
              ...prev,
              users: prev.users.map((u) => (u.uid === targetUid ? { ...u, role: newRole } : u)),
            }
          : prev
      );
      showSuccess(`Updated account role to ${newRole.toUpperCase()}.`);
    } catch (err: any) {
      setError(err.message || 'Role update failed.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteUser = async (targetUid: string) => {
    setBusyKey(`deluser:${targetUid}`);
    setError('');
    try {
      await apiFetch(`/api/admin/users/${targetUid}`, { method: 'DELETE' });
      setConfirmDeleteUserUid(null);
      showSuccess('User account permanently removed.');
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Could not remove user.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleModeratePost = async (postId: number, action: 'pin' | 'unpin' | 'delete') => {
    setBusyKey(`post:${postId}:${action}`);
    setError('');
    try {
      await apiFetch(`/api/discussions/${postId}/moderate`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      showSuccess(
        action === 'delete'
          ? 'Post deleted from KAGE.'
          : action === 'pin'
            ? 'Post pinned to top of PULSE.'
            : 'Post unpinned.'
      );
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Post moderation failed.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteGuild = async (guildId: number) => {
    setBusyKey(`guild:${guildId}`);
    setError('');
    try {
      await apiFetch(`/api/admin/communities/${guildId}`, { method: 'DELETE' });
      showSuccess('Guild removed.');
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Failed to delete guild.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleCloseVoiceRoom = async (roomId: number) => {
    setBusyKey(`room:${roomId}`);
    setError('');
    try {
      await apiFetch(`/api/voice-rooms/${roomId}/moderate`, {
        method: 'POST',
        body: JSON.stringify({ action: 'close' }),
      });
      showSuccess('Voice room closed.');
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Failed to close voice room.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleDeleteClash = async (clashId: number) => {
    setBusyKey(`clash:${clashId}`);
    setError('');
    try {
      await apiFetch(`/api/admin/clashes/${clashId}`, { method: 'DELETE' });
      showSuccess('Clash matchup deleted.');
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Failed to delete clash.');
    } finally {
      setBusyKey(null);
    }
  };

  const handleResolveReport = async (reportId: number, status: 'resolved' | 'dismissed') => {
    setBusyKey(`report:${reportId}`);
    setError('');
    try {
      await apiFetch(`/api/admin/reports/${reportId}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      showSuccess(`Report marked as ${status}.`);
      await loadOverview();
    } catch (err: any) {
      setError(err.message || 'Failed to update report.');
    } finally {
      setBusyKey(null);
    }
  };

  const filteredUsers = useMemo(() => {
    if (!data) return [];
    const q = userSearch.trim().toLowerCase();
    return data.users.filter((u) => {
      if (roleFilter !== 'all' && u.role !== roleFilter) return false;
      if (!q) return true;
      return (
        u.username.toLowerCase().includes(q) ||
        (u.displayName || '').toLowerCase().includes(q) ||
        u.email.toLowerCase().includes(q) ||
        (u.kageId || '').toLowerCase().includes(q)
      );
    });
  }, [data, userSearch, roleFilter]);

  const filteredPosts = useMemo(() => {
    if (!data) return [];
    const q = postSearch.trim().toLowerCase();
    if (!q) return data.posts;
    return data.posts.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        p.content.toLowerCase().includes(q) ||
        p.authorUsername.toLowerCase().includes(q)
    );
  }, [data, postSearch]);

  if (!isAuthorized) {
    return (
      <div className="max-w-lg mx-auto p-8 rounded-2xl bg-[#141116] border border-amber-400/35 text-center space-y-4">
        <ShieldAlert className="w-10 h-10 text-amber-400 mx-auto" />
        <h1 className="text-xl font-bold text-[#F5F1F2]">Sovereign Access Required</h1>
        <p className="text-xs text-[#A7A0AA] leading-relaxed">
          This command console is reserved exclusively for the KAGE Founder & Owner and appointed
          Administrators.
        </p>
        <div className="flex items-center justify-center gap-3 pt-2">
          <Link
            to="/"
            className="min-h-[42px] px-5 rounded-xl bg-[#09080B] border border-white/15 text-xs font-semibold text-[#F5F1F2] flex items-center"
          >
            Return to Realms
          </Link>
          <Link
            to="/auth/login"
            className="min-h-[42px] px-5 rounded-xl bg-[#C0263D] text-white text-xs font-semibold flex items-center"
          >
            Owner Sign In
          </Link>
        </div>
      </div>
    );
  }

  const activeSeedJob = aiData?.recentJobs?.[0] || null;
  const humanRecipientCount = data?.stats.humanUsers ?? data?.stats.totalUsers ?? 0;

  return (
    <div className="space-y-6">
      {/* Top Sovereign Command Header */}
      <div className="p-5 sm:p-6 rounded-2xl bg-[#141116] border border-amber-400/40 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1.5">
          <div className="flex items-center gap-2.5 flex-wrap">
            <Crown className="w-5 h-5 text-amber-400 fill-amber-400" />
            <h1 className="text-xl sm:text-2xl font-bold text-[#F5F1F2] tracking-tight">
              Sovereign Admin Command
            </h1>
            <OwnerBadge role={user?.role} size="sm" showTitle={user?.role === 'owner'} />
          </div>
          <p className="text-xs text-[#A7A0AA]">
            Full platform authority — broadcast global push notifications, govern the 10k Community
            Audience Engine, manage hunter roles, and moderate all realms.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/profile"
            className="min-h-[40px] px-3.5 rounded-xl bg-[#09080B] border border-white/12 text-xs font-semibold text-[#F5F1F2] hover:border-amber-400/50 flex items-center whitespace-nowrap"
          >
            Owner Profile
          </Link>
          <button
            type="button"
            onClick={loadOverview}
            disabled={loading}
            className="min-h-[40px] px-3.5 rounded-xl bg-[#09080B] border border-white/12 text-xs font-semibold text-[#F5F1F2] hover:border-white/25 flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh</span>
          </button>
        </div>
      </div>

      {feedback && (
        <div className="p-3.5 rounded-xl bg-emerald-500/15 border border-emerald-400/40 text-xs font-semibold text-emerald-300 flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <Check className="w-4 h-4 shrink-0" />
            <span>{feedback}</span>
          </span>
          <button
            type="button"
            onClick={() => setFeedback('')}
            className="text-emerald-200 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs text-rose-300 flex items-center justify-between gap-2">
          <span>{error}</span>
          <button
            type="button"
            onClick={() => setError('')}
            className="text-rose-200 hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Live Platform Metrics Row (Tabular Numerals) */}
      {data && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-2.5">
          {[
            {
              label: 'Total Accounts',
              val: formatCompactNumber(data.stats.totalUsers),
            },
            { label: 'Online Now', val: formatCompactNumber(data.stats.onlineUsers) },
            { label: 'Pulse Posts', val: formatCompactNumber(data.stats.totalPosts) },
            { label: 'Replies', val: formatCompactNumber(data.stats.totalComments) },
            { label: 'Guilds', val: formatCompactNumber(data.stats.totalGuilds) },
            { label: 'Voice Rooms', val: formatCompactNumber(data.stats.activeVoiceRooms) },
            { label: 'Clashes', val: formatCompactNumber(data.stats.totalClashes) },
            { label: 'Open Reports', val: formatCompactNumber(data.stats.openReports) },
          ].map((stat) => (
            <div
              key={stat.label}
              className="p-3.5 rounded-xl bg-[#141116] border border-white/8 space-y-0.5"
            >
              <p className="font-mono-num text-xl font-bold text-[#F5F1F2]">{stat.val}</p>
              <p className="text-[11px] text-[#A7A0AA] truncate">{stat.label}</p>
            </div>
          ))}
        </div>
      )}

      {/* Segmented Command Navigation */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar border-b border-white/10 pb-2">
        {(
          [
            { id: 'announce', label: 'Broadcast & Notifications', icon: Megaphone },
            {
              id: 'ai_community',
              label: `Community Audience (${formatCompactNumber(aiData?.metrics.demoUsers ?? 10000)})`,
              icon: Sparkles,
            },
            {
              id: 'users',
              label: `Hunters & Roles (${formatCompactNumber(data?.users.length ?? 0)})`,
              icon: Users,
            },
            {
              id: 'posts',
              label: `Pulse Moderation (${formatCompactNumber(data?.posts.length ?? 0)})`,
              icon: MessageSquare,
            },
            {
              id: 'realms',
              label: 'Guilds, Voice & Clash',
              icon: Swords,
            },
            {
              id: 'inkverse',
              label: 'INKVERSE Moderation',
              icon: BookOpen,
            },
            {
              id: 'reports',
              label: `Reports (${data?.stats.openReports ?? 0} Open)`,
              icon: Flag,
            },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`min-h-[40px] px-3.5 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'bg-[#C0263D] border-[#C0263D] text-white'
                  : 'bg-[#141116] border-white/10 text-[#A7A0AA] hover:text-[#F5F1F2]'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {loading && !data ? (
        <div className="space-y-4">
          <div className="h-64 rounded-2xl bg-[#141116] animate-pulse" />
          <div className="h-48 rounded-2xl bg-[#141116] animate-pulse" />
        </div>
      ) : !data ? null : (
        <>
          {/* TAB 1: GLOBAL ANNOUNCEMENT & PUSH NOTIFICATION BROADCASTER */}
          {activeTab === 'announce' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <form
                onSubmit={handleBroadcastAnnouncement}
                className="lg:col-span-7 p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-4"
              >
                <div>
                  <h2 className="text-base font-bold text-[#F5F1F2] flex items-center gap-2">
                    <Megaphone className="w-4 h-4 text-amber-400" />
                    <span>Send Global Notification & Proclamation</span>
                  </h2>
                  <p className="text-xs text-[#A7A0AA] mt-0.5">
                    Delivers an instant notification to all{' '}
                    {formatCompactNumber(humanRecipientCount)} registered hunters and flashes a live
                    announcement banner across active sessions.
                  </p>
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                    Announcement Title
                  </label>
                  <input
                    type="text"
                    required
                    value={annTitle}
                    onChange={(e) => setAnnTitle(e.target.value)}
                    placeholder="e.g., Welcome to KAGE Season Premiere Event!"
                    className="w-full min-h-[44px] rounded-xl bg-[#09080B] border border-white/12 px-3.5 text-sm text-[#F5F1F2] focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                    Notification Message
                  </label>
                  <textarea
                    rows={4}
                    required
                    value={annBody}
                    onChange={(e) => setAnnBody(e.target.value)}
                    placeholder="Write your official Owner announcement to the entire KAGE community..."
                    className="w-full rounded-xl bg-[#09080B] border border-white/12 p-3.5 text-sm text-[#F5F1F2] focus:outline-none focus:border-amber-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                      Destination Route on Click
                    </label>
                    <select
                      value={annLink}
                      onChange={(e) => setAnnLink(e.target.value)}
                      className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                    >
                      <option value="/pulse">PULSE Feed (/pulse)</option>
                      <option value="/">Home Realms (/)</option>
                      <option value="/filters">All 28 Anime Genres (/filters)</option>
                      <option value="/guilds">Guilds Directory (/guilds)</option>
                      <option value="/voice">KAGE LIVE Voice Rooms (/voice)</option>
                      <option value="/clash">Clash Arena (/clash)</option>
                      <option value="/profile/yaseen">Owner Profile (/profile/yaseen)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                      Optional Proclamation Artwork
                    </label>
                    <select
                      value={annMedia}
                      onChange={(e) => setAnnMedia(e.target.value)}
                      className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                    >
                      <option value="">No Banner Image</option>
                      {PRESET_BANNERS.map((b) => (
                        <option key={b.key} value={b.key}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="p-3.5 rounded-xl bg-[#09080B] border border-white/10 flex items-center justify-between gap-3 cursor-pointer">
                  <div>
                    <p className="text-xs font-semibold text-[#F5F1F2]">
                      Also Pin Official Proclamation to PULSE Feed
                    </p>
                    <p className="text-[11px] text-[#A7A0AA]">
                      Creates a pinned Owner thread at the top of PULSE so everyone can reply and
                      react
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={pinToPulse}
                    onChange={(e) => setPinToPulse(e.target.checked)}
                    className="accent-[#C0263D] w-4 h-4 shrink-0"
                  />
                </label>

                <button
                  type="submit"
                  disabled={broadcasting}
                  className="w-full min-h-[46px] px-5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] disabled:opacity-50 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-colors cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>
                    {broadcasting
                      ? 'Broadcasting to Hunters...'
                      : `Broadcast to All ${formatCompactNumber(humanRecipientCount)} Hunters`}
                  </span>
                </button>
              </form>

              {/* Recent Broadcast History */}
              <div className="lg:col-span-5 p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-3">
                <h3 className="text-sm font-bold text-[#F5F1F2]">Recent Global Broadcasts</h3>
                {data.announcements.length === 0 ? (
                  <p className="text-xs text-[#A7A0AA] py-8 text-center">
                    No global announcements sent yet. Use the broadcaster on the left to notify
                    every hunter in KAGE.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-[440px] overflow-y-auto pr-1">
                    {data.announcements.map((a, idx) => (
                      <div
                        key={`${a.title}-${idx}`}
                        className="p-3.5 rounded-xl bg-[#09080B] border border-amber-400/25 space-y-1.5"
                      >
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-bold text-amber-200 line-clamp-1">
                            {a.title}
                          </p>
                          <span className="text-[11px] font-mono-num text-[#A7A0AA] shrink-0">
                            {formatCompactNumber(a.recipients)} notified
                          </span>
                        </div>
                        <p className="text-xs text-[#F5F1F2]/85 line-clamp-2">{a.body}</p>
                        <div className="flex items-center justify-between text-[11px] text-[#A7A0AA] pt-1">
                          <span>{new Date(a.createdAt).toLocaleString()}</span>
                          <Link
                            to={a.linkUrl || '/pulse'}
                            className="text-[#C0263D] hover:underline inline-flex items-center gap-1"
                          >
                            <span>Open</span>
                            <ExternalLink className="w-3 h-3" />
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: 10K COMMUNITY AUDIENCE ENGINE & DEVELOPER INTRO ASSET CONTROLS */}
          {activeTab === 'ai_community' && (
            <div className="space-y-6">
              {aiData && (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
                  <div className="p-4 rounded-2xl bg-[#141116] border border-white/10 space-y-1">
                    <p className="text-xs text-[#A7A0AA]">Community Hunter Profiles</p>
                    <p className="font-mono-num text-2xl font-bold text-[#F5F1F2]">
                      {formatCompactNumber(aiData.metrics.demoUsers)}
                    </p>
                    <p className="text-[11px] font-mono-num text-[#A7A0AA]">
                      {formatCompactNumber(aiData.metrics.humanUsers)} registered signups
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#141116] border border-amber-400/30 space-y-1">
                    <p className="text-xs text-[#A7A0AA]">Owner Followers (@yaseen)</p>
                    <p className="font-mono-num text-2xl font-bold text-amber-300">
                      {formatCompactNumber(
                        aiData.metrics.ownerDemoFollowers + aiData.metrics.ownerRealFollowers
                      )}
                    </p>
                    <p className="text-[11px] font-mono-num text-[#A7A0AA]">
                      Active founder audience
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#141116] border border-white/10 space-y-1">
                    <p className="text-xs text-[#A7A0AA]">Community Threads & Replies</p>
                    <p className="font-mono-num text-2xl font-bold text-[#F5F1F2]">
                      {formatCompactNumber(
                        aiData.metrics.demoComments + aiData.metrics.humanComments
                      )}
                    </p>
                    <p className="text-[11px] font-mono-num text-[#A7A0AA]">
                      {formatCompactNumber(aiData.metrics.demoPosts + aiData.metrics.humanPosts)}{' '}
                      total threads
                    </p>
                  </div>
                  <div className="p-4 rounded-2xl bg-[#141116] border border-white/10 space-y-1">
                    <p className="text-xs text-[#A7A0AA]">Active Guild Memberships</p>
                    <p className="font-mono-num text-2xl font-bold text-[#F5F1F2]">
                      {formatCompactNumber(aiData.metrics.demoCommunityMembers)}
                    </p>
                    <p className="text-[11px] font-mono-num text-[#A7A0AA]">
                      Across {aiData.metrics.demoCommunities} anime communities
                    </p>
                  </div>
                </div>
              )}

              {/* Live Seeding Engine Status + Trigger Actions */}
              <div className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h2 className="text-base font-bold text-[#F5F1F2] flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-[#C0263D]" />
                      <span>Community Audience & Engagement Engine</span>
                    </h2>
                    <p className="text-xs text-[#A7A0AA] mt-0.5">
                      Maintains 10k anime hunter profiles, 8 active guilds, post-matched anime
                      comments, and 10k likes on Admin posts.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button
                      type="button"
                      disabled={triggeringSeed || aiData?.isRunning}
                      onClick={() => handleTriggerAiSeed(false)}
                      className="min-h-[40px] px-4 rounded-xl bg-[#09080B] hover:bg-[#1C1720] disabled:opacity-50 border border-white/15 text-xs font-semibold text-[#F5F1F2] inline-flex items-center gap-1.5 cursor-pointer"
                    >
                      {aiData?.isRunning ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin text-[#C0263D]" />
                      ) : (
                        <RefreshCw className="w-3.5 h-3.5 text-[#C0263D]" />
                      )}
                      <span>
                        {aiData?.isRunning
                          ? 'Syncing Community...'
                          : 'Sync / Repair 10k Community'}
                      </span>
                    </button>

                    <button
                      type="button"
                      disabled={triggeringSeed || aiData?.isRunning || !aiData?.geminiConfigured}
                      onClick={() => handleTriggerAiSeed(true)}
                      className="min-h-[40px] px-4 rounded-xl bg-[#6D28D9] hover:bg-[#7c3aed] disabled:opacity-50 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
                      title={
                        aiData?.geminiConfigured
                          ? 'Generate fresh context-aware anime guild discussions via Gemini'
                          : 'GEMINI_API_KEY not configured on server'
                      }
                    >
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Generate Fresh Gemini Threads</span>
                    </button>
                  </div>
                </div>

                {activeSeedJob && (
                  <div className="p-3.5 rounded-xl bg-[#09080B] border border-white/10 space-y-2">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[#F5F1F2]">
                        Job #{activeSeedJob.id} · {activeSeedJob.status.toUpperCase()} —{' '}
                        {activeSeedJob.stepLabel}
                      </span>
                      <span className="font-mono-num text-[#A7A0AA]">
                        {activeSeedJob.progressPercent}%
                      </span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-[#141116] overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-[#C0263D] to-[#6D28D9] transition-all duration-300"
                        style={{ width: `${Math.min(100, Math.max(0, activeSeedJob.progressPercent))}%` }}
                      />
                    </div>
                    {activeSeedJob.errorMessage && (
                      <p className="text-xs text-rose-400">{activeSeedJob.errorMessage}</p>
                    )}
                  </div>
                )}
              </div>

              {/* Configurable Audience & Showcase Engagement Form */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                <form
                  onSubmit={handleSaveAiConfig}
                  className="lg:col-span-7 p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-4"
                >
                  <div className="flex items-center gap-2">
                    <Sliders className="w-4 h-4 text-amber-400" />
                    <h3 className="text-sm sm:text-base font-bold text-[#F5F1F2]">
                      Community Audience & Admin Post Engagement Controls
                    </h3>
                  </div>

                  <div className="space-y-2.5">
                    <label className="p-3.5 rounded-xl bg-[#09080B] border border-white/10 flex items-center justify-between gap-3 cursor-pointer">
                      <div>
                        <p className="text-xs font-semibold text-[#F5F1F2]">
                          Enable Community Audience Activity Across KAGE
                        </p>
                        <p className="text-[11px] text-[#A7A0AA]">
                          Keeps community hunter threads, post-matched replies, likes, and followers
                          active across public feeds
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={cfgAiEnabled}
                        onChange={(e) => setCfgAiEnabled(e.target.checked)}
                        className="accent-[#C0263D] w-4 h-4 shrink-0"
                      />
                    </label>

                    <label className="p-3.5 rounded-xl bg-[#09080B] border border-white/10 flex items-center justify-between gap-3 cursor-pointer">
                      <div>
                        <p className="text-xs font-semibold text-[#F5F1F2]">
                          Enable Owner Profile (@yaseen) Audience & Admin Post Engagement
                        </p>
                        <p className="text-[11px] text-[#A7A0AA]">
                          Maintains 10k followers and 10k likes across Founder & Admin posts
                        </p>
                      </div>
                      <input
                        type="checkbox"
                        checked={cfgOwnerAudienceEnabled}
                        onChange={(e) => setCfgOwnerAudienceEnabled(e.target.checked)}
                        className="accent-[#C0263D] w-4 h-4 shrink-0"
                      />
                    </label>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                      Selected Owner Showcase Post
                    </label>
                    <select
                      value={cfgShowcasePostId}
                      onChange={(e) =>
                        setCfgShowcasePostId(e.target.value ? Number(e.target.value) : '')
                      }
                      className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                    >
                      <option value="">Auto-select pinned Owner Showcase Proclamation</option>
                      {(aiData?.ownerPosts || []).map((op) => (
                        <option key={op.id} value={op.id}>
                          #{op.id} — {op.title} ({formatCompactNumber(op.likeCount)} likes ·{' '}
                          {formatCompactNumber(op.commentCount)} replies)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] text-[#A7A0AA] mb-1">
                        Owner Followers
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={15000}
                        value={cfgOwnerFollowers}
                        onChange={(e) => setCfgOwnerFollowers(Number(e.target.value))}
                        className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs font-mono-num text-[#F5F1F2]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#A7A0AA] mb-1">
                        Admin Post Likes
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={15000}
                        value={cfgShowcaseLikes}
                        onChange={(e) => setCfgShowcaseLikes(Number(e.target.value))}
                        className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs font-mono-num text-[#F5F1F2]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#A7A0AA] mb-1">
                        Admin Post Reposts
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={15000}
                        value={cfgShowcaseReposts}
                        onChange={(e) => setCfgShowcaseReposts(Number(e.target.value))}
                        className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs font-mono-num text-[#F5F1F2]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#A7A0AA] mb-1">
                        Showcase Comments
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={10000}
                        value={cfgShowcaseComments}
                        onChange={(e) => setCfgShowcaseComments(Number(e.target.value))}
                        className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs font-mono-num text-[#F5F1F2]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#A7A0AA] mb-1">
                        Showcase Shares
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={15000}
                        value={cfgShowcaseShares}
                        onChange={(e) => setCfgShowcaseShares(Number(e.target.value))}
                        className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs font-mono-num text-[#F5F1F2]"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] text-[#A7A0AA] mb-1">
                        Guild Members
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={15000}
                        value={cfgCommunityMembers}
                        onChange={(e) => setCfgCommunityMembers(Number(e.target.value))}
                        className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs font-mono-num text-[#F5F1F2]"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={savingAiConfig}
                    className="w-full min-h-[44px] px-5 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] disabled:opacity-50 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {savingAiConfig && <Loader2 className="w-4 h-4 animate-spin" />}
                    <span>
                      {savingAiConfig
                        ? 'Synchronizing Counters...'
                        : 'Save & Sync Engagement Counters'}
                    </span>
                  </button>
                </form>

                {/* Right Column: Sample Personas + Developer Captain Yami Splash Video Asset Override */}
                <div className="lg:col-span-5 space-y-5">
                  <div className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-3">
                    <div className="flex items-center gap-2">
                      <Video className="w-4 h-4 text-[#C0263D]" />
                      <h3 className="text-sm font-bold text-[#F5F1F2]">
                        KAGE Website Intro Video Asset
                      </h3>
                    </div>
                    <p className="text-xs text-[#A7A0AA] leading-relaxed">
                      Active source:{' '}
                      <span className="text-[#F5F1F2] font-mono-num">
                        {splashCfg?.sourceType || 'bundled'}
                      </span>
                      {splashCfg?.width && splashCfg?.height
                        ? ` (${splashCfg.width}×${splashCfg.height})`
                        : ''}
                      . Serves the clean, watermark-free Full HD KAGE Zenitsu opening animation, or
                      optionally upload a custom watermark-free MP4/WebM export here.
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="min-h-[40px] px-3.5 rounded-xl bg-[#09080B] hover:bg-[#1C1720] border border-white/15 text-xs font-semibold text-[#F5F1F2] inline-flex items-center gap-1.5 cursor-pointer">
                        <Upload className="w-3.5 h-3.5 text-[#C0263D]" />
                        <span>
                          {uploadingSplash ? 'Uploading...' : 'Upload Watermark-Free MP4/WebM'}
                        </span>
                        <input
                          type="file"
                          accept="video/mp4,video/webm"
                          disabled={uploadingSplash}
                          onChange={handleDeveloperSplashUpload}
                          className="hidden"
                        />
                      </label>
                      {splashCfg?.sourceType === 'uploaded' && (
                        <button
                          type="button"
                          disabled={uploadingSplash}
                          onClick={handleResetSplashVideo}
                          className="min-h-[40px] px-3 rounded-xl bg-[#09080B] border border-white/12 text-xs text-rose-400 hover:border-rose-500/40 cursor-pointer"
                        >
                          Reset to Bundled KAGE Intro
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-3">
                    <h3 className="text-sm font-bold text-[#F5F1F2]">
                      Sample Community Hunter Profiles
                    </h3>
                    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                      {(aiData?.samplePersonas || []).map((p) => (
                        <Link
                          key={p.uid}
                          to={`/profile/${p.username}`}
                          className="p-2.5 rounded-xl bg-[#09080B] border border-white/8 hover:border-white/20 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-[#141116] shrink-0">
                              <KageImage
                                src={p.avatarUrl}
                                alt={p.displayName}
                                className="w-full h-full object-cover"
                              />
                            </div>
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#F5F1F2] truncate">
                                {p.displayName}
                              </p>
                              <p className="text-[11px] text-[#A7A0AA] truncate">
                                @{p.username} · {p.favoriteAnime}
                              </p>
                            </div>
                          </div>
                          <ExternalLink className="w-3.5 h-3.5 text-[#A7A0AA] shrink-0" />
                        </Link>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: USERS & ROLES MANAGEMENT */}
          {activeTab === 'users' && (
            <div className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="relative flex-1 max-w-md">
                  <Search className="w-4 h-4 text-[#A7A0AA] absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    placeholder="Search hunters by username, display name, KAGE ID, or email..."
                    className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 pl-10 pr-4 text-xs sm:text-sm text-[#F5F1F2] focus:outline-none focus:border-[#6D28D9]"
                  />
                </div>

                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {(['all', 'owner', 'admin', 'moderator', 'user'] as const).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => setRoleFilter(r)}
                      className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold border capitalize whitespace-nowrap cursor-pointer ${
                        roleFilter === r
                          ? 'bg-[#6D28D9] border-[#6D28D9] text-white'
                          : 'bg-[#09080B] border-white/10 text-[#A7A0AA]'
                      }`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] uppercase tracking-wider text-[#A7A0AA]">
                      <th className="py-2.5 px-3">Hunter</th>
                      <th className="py-2.5 px-3">Email / ID</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Role Authority</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/8 text-xs">
                    {filteredUsers.map((u) => {
                      const isFounder = u.uid === 'owner_yaseen';
                      return (
                        <tr key={u.uid} className="hover:bg-white/[0.02]">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2.5">
                              <div className="w-9 h-9 rounded-full overflow-hidden bg-[#09080B] shrink-0">
                                <KageImage
                                  src={u.avatarUrl}
                                  alt={u.displayName || u.username}
                                  className="w-full h-full object-cover"
                                />
                              </div>
                              <div>
                                <div className="flex items-center gap-1.5">
                                  <Link
                                    to={`/profile/${u.username}`}
                                    className="font-bold text-[#F5F1F2] hover:text-[#C0263D]"
                                  >
                                    {u.displayName || u.username}
                                  </Link>
                                  <OwnerBadge role={u.role} size="xs" />
                                </div>
                                <span className="text-[11px] text-[#A7A0AA]">@{u.username}</span>
                              </div>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-[#A7A0AA] font-mono-num">
                            <div>{u.email}</div>
                            {u.kageId && <div className="text-[10px]">{u.kageId}</div>}
                          </td>
                          <td className="py-3 px-3">
                            <span
                              className={`text-[11px] font-medium ${
                                u.isOnline ? 'text-emerald-400' : 'text-[#A7A0AA]'
                              }`}
                            >
                              {u.isOnline ? 'Online' : 'Offline'}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {isFounder ? (
                              <span className="text-xs font-bold text-amber-300">
                                Sovereign Founder
                              </span>
                            ) : (
                              <select
                                value={u.role}
                                disabled={busyKey === `role:${u.uid}`}
                                onChange={(e) =>
                                  handleRoleChange(u.uid, e.target.value as any)
                                }
                                className="min-h-[34px] rounded-lg bg-[#09080B] border border-white/15 px-2.5 text-xs text-[#F5F1F2]"
                              >
                                <option value="user">User</option>
                                <option value="moderator">Moderator</option>
                                <option value="admin">Admin</option>
                                {user?.role === 'owner' && <option value="owner">Owner</option>}
                              </select>
                            )}
                          </td>
                          <td className="py-3 px-3 text-right">
                            {!isFounder && (
                              <div className="inline-flex items-center gap-1.5">
                                {confirmDeleteUserUid === u.uid ? (
                                  <>
                                    <button
                                      type="button"
                                      disabled={busyKey === `deluser:${u.uid}`}
                                      onClick={() => handleDeleteUser(u.uid)}
                                      className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-[11px] font-semibold cursor-pointer"
                                    >
                                      Confirm Erase
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteUserUid(null)}
                                      className="px-2 py-1.5 rounded-lg bg-[#09080B] text-[#A7A0AA] text-[11px] cursor-pointer"
                                    >
                                      Cancel
                                    </button>
                                  </>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteUserUid(u.uid)}
                                    className="p-2 rounded-lg text-[#A7A0AA] hover:text-rose-400 cursor-pointer"
                                    title="Remove user account"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB 4: PULSE POSTS MODERATION */}
          {activeTab === 'posts' && (
            <div className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-4">
              <div className="relative max-w-md">
                <Search className="w-4 h-4 text-[#A7A0AA] absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={postSearch}
                  onChange={(e) => setPostSearch(e.target.value)}
                  placeholder="Search posts by headline, text, or @author..."
                  className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 pl-10 pr-4 text-xs sm:text-sm text-[#F5F1F2]"
                />
              </div>

              <div className="space-y-2.5">
                {filteredPosts.map((p) => (
                  <div
                    key={p.id}
                    className={`p-4 rounded-xl bg-[#09080B] border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      p.isPinned ? 'border-amber-400/45' : 'border-white/8'
                    }`}
                  >
                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        {p.isPinned && (
                          <span className="text-amber-300 font-semibold inline-flex items-center gap-1">
                            <Pin className="w-3 h-3" />
                            Pinned
                          </span>
                        )}
                        <span className="font-bold text-[#F5F1F2]">{p.authorDisplayName}</span>
                        <OwnerBadge role={p.authorRole} size="xs" />
                        <span className="text-[#A7A0AA]">@{p.authorUsername}</span>
                        <span className="text-[#A7A0AA] font-mono-num">
                          · {formatCompactNumber(p.likeCount)} likes ·{' '}
                          {formatCompactNumber(p.commentCount)} replies
                        </span>
                      </div>
                      <Link
                        to={`/pulse?discussion=${p.id}`}
                        className="block text-sm font-bold text-[#F5F1F2] hover:text-[#C0263D] truncate"
                      >
                        {p.title}
                      </Link>
                      <p className="text-xs text-[#A7A0AA] line-clamp-1">{p.content}</p>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleModeratePost(p.id, p.isPinned ? 'unpin' : 'pin')}
                        className={`min-h-[36px] px-3 rounded-lg border text-xs font-semibold flex items-center gap-1.5 cursor-pointer ${
                          p.isPinned
                            ? 'border-amber-400/50 text-amber-300 bg-amber-500/10'
                            : 'border-white/12 text-[#A7A0AA] hover:text-white bg-[#141116]'
                        }`}
                      >
                        <Pin className="w-3.5 h-3.5" />
                        <span>{p.isPinned ? 'Unpin' : 'Pin'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleModeratePost(p.id, 'delete')}
                        className="min-h-[36px] px-3 rounded-lg bg-[#141116] border border-white/12 hover:border-rose-500/50 text-xs font-semibold text-rose-400 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Delete</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: GUILDS, KAGE LIVE VOICE ROOMS & CLASHES */}
          {activeTab === 'realms' && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              {/* Guilds Column */}
              <div className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-3">
                <h3 className="text-sm font-bold text-[#F5F1F2] flex items-center gap-2">
                  <Users className="w-4 h-4 text-[#6D28D9]" />
                  <span>Guilds ({data.guilds.length})</span>
                </h3>
                <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                  {data.guilds.map((g) => (
                    <div
                      key={g.id}
                      className="p-3 rounded-xl bg-[#09080B] border border-white/8 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <Link
                          to={`/guilds/${g.slug}`}
                          className="text-xs font-bold text-[#F5F1F2] hover:text-[#6D28D9] uppercase block truncate"
                        >
                          {g.name}
                        </Link>
                        <p className="text-[11px] font-mono-num text-[#A7A0AA]">
                          {formatCompactNumber(g.memberCount)} members ·{' '}
                          {formatCompactNumber(g.discussionCount)} posts
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busyKey === `guild:${g.id}`}
                        onClick={() => handleDeleteGuild(g.id)}
                        className="p-2 rounded-lg text-[#A7A0AA] hover:text-rose-400 shrink-0 cursor-pointer"
                        title="Delete Guild"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Active Voice Rooms Column */}
              <div className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-3">
                <h3 className="text-sm font-bold text-[#F5F1F2] flex items-center gap-2">
                  <Mic className="w-4 h-4 text-[#C0263D]" />
                  <span>Active Voice Rooms ({data.voiceRooms.length})</span>
                </h3>
                {data.voiceRooms.length === 0 ? (
                  <p className="text-xs text-[#A7A0AA] py-6 text-center">
                    No active voice rooms right now.
                  </p>
                ) : (
                  <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                    {data.voiceRooms.map((r) => (
                      <div
                        key={r.id}
                        className="p-3 rounded-xl bg-[#09080B] border border-white/8 flex items-center justify-between gap-2"
                      >
                        <div className="min-w-0">
                          <Link
                            to={`/voice/${r.id}`}
                            className="text-xs font-bold text-[#F5F1F2] hover:text-[#C0263D] uppercase block truncate"
                          >
                            {r.title}
                          </Link>
                          <p className="text-[11px] font-mono-num text-[#A7A0AA]">
                            {r.participantCount}/{r.capacity} connected
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={busyKey === `room:${r.id}`}
                          onClick={() => handleCloseVoiceRoom(r.id)}
                          className="px-2.5 py-1.5 rounded-lg bg-[#141116] border border-white/10 text-[11px] font-semibold text-rose-400 hover:border-rose-500/50 shrink-0 cursor-pointer"
                        >
                          Close
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Clash Battles Column */}
              <div className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-3">
                <h3 className="text-sm font-bold text-[#F5F1F2] flex items-center gap-2">
                  <Swords className="w-4 h-4 text-amber-400" />
                  <span>Clash Battles ({data.clashes.length})</span>
                </h3>
                <div className="space-y-2.5 max-h-[460px] overflow-y-auto pr-1">
                  {data.clashes.map((c) => (
                    <div
                      key={c.id}
                      className="p-3 rounded-xl bg-[#09080B] border border-white/8 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-[#F5F1F2] truncate">
                          {c.leftName} vs {c.rightName}
                        </p>
                        <p className="text-[11px] font-mono-num text-[#A7A0AA]">
                          {formatCompactNumber(c.leftVotes + c.rightVotes)} total votes ·{' '}
                          {c.category}
                        </p>
                      </div>
                      <button
                        type="button"
                        disabled={busyKey === `clash:${c.id}`}
                        onClick={() => handleDeleteClash(c.id)}
                        className="p-2 rounded-lg text-[#A7A0AA] hover:text-rose-400 shrink-0 cursor-pointer"
                        title="Delete Clash"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 5B: INKVERSE CREATOR SERIES & CHAPTER MODERATION */}
          {activeTab === 'inkverse' && (
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 rounded-2xl bg-[#141116] border border-white/10">
                <div>
                  <h2 className="text-sm sm:text-base font-bold text-[#F5F1F2] flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-[#C0263D]" />
                    <span>INKVERSE Manga &amp; Chapter Safety Queue</span>
                  </h2>
                  <p className="text-xs text-[#A7A0AA] mt-0.5">
                    Review creator-uploaded series and chapters, inspect pages in Reader, or remove
                    unsafe/unauthorized uploads.
                  </p>
                </div>

                <div className="flex items-center gap-1.5 flex-wrap">
                  {(
                    [
                      { id: 'all', label: 'All Uploads' },
                      { id: 'pending_review', label: 'Pending Review' },
                      { id: 'approved', label: 'Approved' },
                      { id: 'rejected', label: 'Rejected' },
                    ] as const
                  ).map((f) => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setInkverseFilter(f.id)}
                      className={`min-h-[36px] px-3 rounded-lg text-xs font-semibold border cursor-pointer transition-colors ${
                        inkverseFilter === f.id
                          ? 'bg-[#C0263D] border-[#C0263D] text-white'
                          : 'bg-[#09080B] border-white/12 text-[#A7A0AA] hover:text-white'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => loadInkverseModeration(inkverseFilter)}
                    aria-label="Refresh INKVERSE queue"
                    className="min-h-[36px] min-w-[36px] rounded-lg bg-[#09080B] border border-white/12 text-[#A7A0AA] hover:text-white flex items-center justify-center cursor-pointer"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${loadingInkverse ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {loadingInkverse && !inkverseQueue ? (
                <div className="h-44 rounded-2xl bg-[#141116] animate-pulse" />
              ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {/* Creator Series Column */}
                  <div className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-3">
                    <h3 className="text-sm font-bold text-[#F5F1F2] font-mono-num">
                      Creator Series ({inkverseQueue?.series.length || 0})
                    </h3>
                    {!inkverseQueue || inkverseQueue.series.length === 0 ? (
                      <p className="text-xs text-[#A7A0AA] py-6 text-center">
                        No creator manga series in this filter.
                      </p>
                    ) : (
                      <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                        {inkverseQueue.series.map((s) => {
                          const noteKey = `manga:${s.id}`;
                          return (
                            <div
                              key={s.id}
                              className="p-3.5 rounded-xl bg-[#09080B] border border-white/10 space-y-2.5"
                            >
                              <div className="flex items-start gap-3">
                                <div className="w-12 aspect-[2/3] rounded-lg overflow-hidden bg-[#141116] shrink-0">
                                  <KageImage
                                    strictArtwork
                                    src={s.coverImageUrl}
                                    alt={s.title}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <div className="min-w-0 flex-1 space-y-1">
                                  <Link
                                    to={`/inkverse/manga/${s.id}`}
                                    className="text-xs sm:text-sm font-bold text-[#F5F1F2] hover:text-[#C0263D] truncate block"
                                  >
                                    {s.title}
                                  </Link>
                                  <p className="text-[11px] text-[#A7A0AA] font-mono-num">
                                    {s.format} · {s.coverQuality} · {s.inAppChapterCount || 0} chapters
                                    {s.uploader ? ` · @${s.uploader.username}` : ''}
                                  </p>
                                  <p className="text-[11px] text-[#D8D2DC]">
                                    Status:{' '}
                                    <span
                                      className={
                                        s.moderationStatus === 'rejected'
                                          ? 'text-rose-400 font-semibold'
                                          : s.moderationStatus === 'pending_review'
                                            ? 'text-amber-300 font-semibold'
                                            : 'text-emerald-400 font-semibold'
                                      }
                                    >
                                      {(s.moderationStatus || 'approved').replace(/_/g, ' ')}
                                    </span>
                                  </p>
                                </div>
                              </div>

                              <input
                                type="text"
                                value={inkverseNotes[noteKey] ?? s.moderationNote ?? ''}
                                onChange={(e) =>
                                  setInkverseNotes((prev) => ({
                                    ...prev,
                                    [noteKey]: e.target.value,
                                  }))
                                }
                                placeholder="Moderation note (optional)..."
                                className="w-full min-h-[34px] rounded-lg bg-[#141116] border border-white/10 px-2.5 text-[11px] text-[#F5F1F2]"
                              />

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  disabled={busyKey === `ink:${noteKey}:approved`}
                                  onClick={() => handleModerateInkverse('manga', s.id, 'approved')}
                                  className="min-h-[34px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={busyKey === `ink:${noteKey}:rejected`}
                                  onClick={() => handleModerateInkverse('manga', s.id, 'rejected')}
                                  className="min-h-[34px] px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer"
                                >
                                  Reject
                                </button>
                                <button
                                  type="button"
                                  disabled={busyKey === `inkdel:manga:${s.id}`}
                                  onClick={() => handleDeleteInkverseItem('manga', s.id)}
                                  className="min-h-[34px] px-3 rounded-lg bg-[#141116] border border-white/12 text-rose-400 hover:border-rose-500/50 text-xs font-semibold cursor-pointer ml-auto"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Creator Chapters Column */}
                  <div className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-3">
                    <h3 className="text-sm font-bold text-[#F5F1F2] font-mono-num">
                      Uploaded Chapters ({inkverseQueue?.chapters.length || 0})
                    </h3>
                    {!inkverseQueue || inkverseQueue.chapters.length === 0 ? (
                      <p className="text-xs text-[#A7A0AA] py-6 text-center">
                        No creator-uploaded chapters in this filter.
                      </p>
                    ) : (
                      <div className="space-y-3 max-h-[540px] overflow-y-auto pr-1">
                        {inkverseQueue.chapters.map((c) => {
                          const noteKey = `chapter:${c.id}`;
                          return (
                            <div
                              key={c.id}
                              className="p-3.5 rounded-xl bg-[#09080B] border border-white/10 space-y-2.5"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 space-y-1">
                                  <p className="text-xs sm:text-sm font-bold text-[#F5F1F2] truncate">
                                    {c.mangaTitle} — Ch. {c.chapterNumber}
                                    {c.title ? ` (${c.title})` : ''}
                                  </p>
                                  <p className="text-[11px] text-[#A7A0AA] font-mono-num">
                                    {c.pageCount} pages · {c.qualityTier} · {c.language.toUpperCase()}
                                    {c.uploader ? ` · @${c.uploader.username}` : ''}
                                  </p>
                                  <p className="text-[11px] text-[#D8D2DC]">
                                    Status:{' '}
                                    <span
                                      className={
                                        c.moderationStatus === 'rejected'
                                          ? 'text-rose-400 font-semibold'
                                          : c.moderationStatus === 'pending_review'
                                            ? 'text-amber-300 font-semibold'
                                            : 'text-emerald-400 font-semibold'
                                      }
                                    >
                                      {(c.moderationStatus || 'approved').replace(/_/g, ' ')}
                                    </span>
                                  </p>
                                </div>
                                <Link
                                  to={`/inkverse/read/${c.mangaId}/${c.id}`}
                                  className="min-h-[32px] px-2.5 rounded-lg bg-[#141116] border border-white/12 text-[11px] font-semibold text-[#F5F1F2] hover:border-[#C0263D] inline-flex items-center gap-1 shrink-0"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Inspect</span>
                                </Link>
                              </div>

                              <input
                                type="text"
                                value={inkverseNotes[noteKey] ?? c.moderationNote ?? ''}
                                onChange={(e) =>
                                  setInkverseNotes((prev) => ({
                                    ...prev,
                                    [noteKey]: e.target.value,
                                  }))
                                }
                                placeholder="Moderation note (optional)..."
                                className="w-full min-h-[34px] rounded-lg bg-[#141116] border border-white/10 px-2.5 text-[11px] text-[#F5F1F2]"
                              />

                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  disabled={busyKey === `ink:${noteKey}:approved`}
                                  onClick={() => handleModerateInkverse('chapter', c.id, 'approved')}
                                  className="min-h-[34px] px-3 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                                >
                                  Approve
                                </button>
                                <button
                                  type="button"
                                  disabled={busyKey === `ink:${noteKey}:rejected`}
                                  onClick={() => handleModerateInkverse('chapter', c.id, 'rejected')}
                                  className="min-h-[34px] px-3 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-semibold cursor-pointer"
                                >
                                  Reject
                                </button>
                                <button
                                  type="button"
                                  disabled={busyKey === `inkdel:chapter:${c.id}`}
                                  onClick={() => handleDeleteInkverseItem('chapter', c.id)}
                                  className="min-h-[34px] px-3 rounded-lg bg-[#141116] border border-white/12 text-rose-400 hover:border-rose-500/50 text-xs font-semibold cursor-pointer ml-auto"
                                >
                                  Delete
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 6: COMMUNITY CONTENT REPORTS */}
          {activeTab === 'reports' && (
            <div className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-3">
              <h3 className="text-sm font-bold text-[#F5F1F2]">Moderation Reports Queue</h3>
              {data.reports.length === 0 ? (
                <p className="text-xs text-[#A7A0AA] py-8 text-center">
                  Zero moderation reports submitted. The KAGE community is clear.
                </p>
              ) : (
                <div className="space-y-2.5">
                  {data.reports.map((rep) => (
                    <div
                      key={rep.id}
                      className="p-4 rounded-xl bg-[#09080B] border border-white/8 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          <span className="font-bold uppercase text-[#C0263D]">
                            {rep.targetType} #{rep.targetId}
                          </span>
                          <span>·</span>
                          <span className="text-[#F5F1F2] font-semibold">{rep.reason}</span>
                          <span>·</span>
                          <span className="text-[#A7A0AA]">by @{rep.reporterUsername}</span>
                        </div>
                        {rep.details && <p className="text-xs text-[#A7A0AA]">{rep.details}</p>}
                        <p className="text-[11px] font-mono-num text-[#A7A0AA]">
                          Status: {rep.status.toUpperCase()} ·{' '}
                          {new Date(rep.createdAt).toLocaleString()}
                        </p>
                      </div>

                      {rep.status === 'open' && (
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={busyKey === `report:${rep.id}`}
                            onClick={() => handleResolveReport(rep.id, 'resolved')}
                            className="min-h-[36px] px-3.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
                          >
                            Resolve
                          </button>
                          <button
                            type="button"
                            disabled={busyKey === `report:${rep.id}`}
                            onClick={() => handleResolveReport(rep.id, 'dismissed')}
                            className="min-h-[36px] px-3.5 rounded-lg bg-[#141116] border border-white/12 text-xs text-[#A7A0AA] hover:text-white cursor-pointer"
                          >
                            Dismiss
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};
