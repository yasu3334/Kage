import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  Bookmark,
  Check,
  Edit3,
  Eye,
  Film,
  Flag,
  Heart,
  Image as ImageIcon,
  Loader2,
  MessageCircle,
  Mic,
  Pin,
  Plus,
  Quote,
  Radio,
  Repeat2,
  Send,
  Share2,
  Smile,
  Star,
  Trash2,
  Video,
  X,
} from 'lucide-react';
import { apiFetch } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { KageImage } from '../components/KageImage';
import { OwnerBadge } from '../components/KageBrand';
import { AnimeStickerPicker, KageStickerGraphic } from '../components/AnimeStickerPicker';
import { ReportModal } from '../components/ReportModal';
import { KageDrawer, KageModal } from '../components/KageModal';
import { kageSound } from '../lib/soundEngine';
import { PRESET_BANNERS } from '../lib/assets';
import { ALL_GENRE_NAMES } from '../lib/genres';
import { formatCompactNumber } from '../lib/formatters';

interface PollOptionItem {
  id: string;
  label?: string;
  text?: string;
  votes: number;
}

interface QuotedPostPreview {
  id: number;
  deleted?: boolean;
  message?: string;
  title?: string;
  content?: string;
  mediaUrl?: string | null;
  mediaType?: string | null;
  posterUrl?: string | null;
  animeTitle?: string | null;
  createdAt?: string;
  author?: {
    uid: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    role?: string;
    isAiDemo?: boolean;
  };
}

interface PulsePost {
  id: number;
  title: string;
  content: string;
  kind: string;
  isAiGenerated?: boolean;
  mediaType?: 'none' | 'image' | 'video' | string;
  mediaUrl?: string | null;
  posterUrl?: string | null;
  animeMalId?: number | null;
  animeTitle?: string | null;
  genreTags: string[];
  rating?: number | null;
  pollQuestion?: string | null;
  pollOptions?: PollOptionItem[];
  viewerPollVote?: string | null;
  quotedPost?: QuotedPostPreview | null;
  repostedBy?: {
    uid: string;
    username: string;
    displayName: string;
  } | null;
  likeCount: number;
  demoLikeCount?: number;
  commentCount: number;
  demoCommentCount?: number;
  repostCount: number;
  demoRepostCount?: number;
  shareCount?: number;
  demoShareCount?: number;
  quoteCount?: number;
  viewCount?: number | null;
  isPinned: boolean;
  editedAt?: string | null;
  createdAt: string;
  author: {
    uid: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    role?: string;
    isAiDemo?: boolean;
  };
  community?: {
    id: number;
    name: string;
    slug: string;
    privacyMode?: string;
  } | null;
  viewerLiked: boolean;
  viewerBookmarked: boolean;
  viewerReposted: boolean;
}

interface ThreadComment {
  id: number;
  discussionId: number;
  parentCommentId: number | null;
  content: string;
  stickerId?: string | null;
  isAiGenerated?: boolean;
  likeCount: number;
  demoLikeCount?: number;
  viewerLiked?: boolean;
  editedAt?: string | null;
  createdAt: string;
  author: {
    uid: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    role?: string;
    isAiDemo?: boolean;
  };
}

const GENRE_OPTIONS = ALL_GENRE_NAMES;

function formatRelativeTime(iso?: string): string {
  if (!iso) return '';
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.max(1, Math.floor(diffMs / 60000));
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d`;
  return new Date(iso).toLocaleDateString();
}

function renderPulseRichText(
  text: string,
  onSelectHashtag?: (tag: string) => void
): React.ReactNode {
  if (!text) return null;
  const parts = text.split(/(@[a-zA-Z0-9_.-]{3,24}|#[a-zA-Z0-9_]{2,32})/g);
  return parts.map((part, idx) => {
    if (part.startsWith('@') && part.length >= 4) {
      const handle = part.slice(1);
      return (
        <Link
          key={idx}
          to={`/profile/${handle}`}
          onClick={(e) => e.stopPropagation()}
          className="text-[#C0263D] hover:underline font-medium"
        >
          {part}
        </Link>
      );
    }
    if (part.startsWith('#') && part.length >= 3) {
      const clean = part.slice(1).toLowerCase();
      return (
        <button
          key={idx}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onSelectHashtag?.(clean);
          }}
          className="text-[#6D28D9] hover:underline font-medium cursor-pointer"
        >
          {part}
        </button>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

const PulseVideoPlayer: React.FC<{
  postId: number;
  src: string;
  poster?: string | null;
  onViewRecorded?: (newCount: number) => void;
}> = ({ postId, src, poster, onViewRecorded }) => {
  const qualifiedSentRef = useRef(false);
  const playSentRef = useRef(false);

  const handlePlay = () => {
    if (playSentRef.current) return;
    playSentRef.current = true;
    apiFetch(`/api/discussions/${postId}/video-view`, {
      method: 'POST',
      body: JSON.stringify({ eventType: 'play' }),
    }).catch(() => {});
  };

  const handleTimeUpdate = (e: React.SyntheticEvent<HTMLVideoElement>) => {
    if (qualifiedSentRef.current) return;
    const vid = e.currentTarget;
    if (vid.currentTime >= 3 || (vid.duration > 0 && vid.duration < 3 && vid.currentTime >= vid.duration * 0.8)) {
      qualifiedSentRef.current = true;
      apiFetch<{ viewCount?: number }>(`/api/discussions/${postId}/video-view`, {
        method: 'POST',
        body: JSON.stringify({ watchedSeconds: Math.max(3, Math.round(vid.currentTime)) }),
      })
        .then((res) => {
          if (typeof res?.viewCount === 'number') {
            onViewRecorded?.(res.viewCount);
          }
        })
        .catch(() => {});
    }
  };

  return (
    <video
      src={src}
      poster={poster || undefined}
      controls
      playsInline
      preload="metadata"
      onClick={(e) => e.stopPropagation()}
      onPlay={handlePlay}
      onTimeUpdate={handleTimeUpdate}
      className="w-full max-h-[460px] bg-black object-contain"
    />
  );
};

export const PulsePage: React.FC = () => {
  const { user, profile, bumpTasteRevision } = useAuth();
  const navigate = useNavigate();
  const { postId: routePostId } = useParams<{ postId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const [feedTab, setFeedTab] = useState<'for_you' | 'following' | 'latest' | 'saved'>('for_you');
  const [hashtagFilter, setHashtagFilter] = useState<string>(searchParams.get('hashtag') || '');
  const [posts, setPosts] = useState<PulsePost[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState('');

  // Composer modal state (also supports Quote Repost via quoteTarget)
  const [composerOpen, setComposerOpen] = useState(false);
  const [quoteTarget, setQuoteTarget] = useState<PulsePost | null>(null);
  const [postKind, setPostKind] = useState<'pulse' | 'discussion' | 'review'>('pulse');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['Action']);
  const [animeQuery, setAnimeQuery] = useState('');
  const [animeMatches, setAnimeMatches] = useState<any[]>([]);
  const [pickedAnime, setPickedAnime] = useState<{ malId: number; title: string } | null>(null);
  const [mediaType, setMediaType] = useState<'none' | 'image' | 'video'>('none');
  const [imageDataUrl, setImageDataUrl] = useState('');
  const [videoDataUrl, setVideoDataUrl] = useState('');
  const [mediaPresetKey, setMediaPresetKey] = useState('');
  const [enablePoll, setEnablePoll] = useState(false);
  const [pollQuestion, setPollQuestion] = useState('');
  const [pollOptions, setPollOptions] = useState<string[]>(['', '']);
  const [rating, setRating] = useState<number>(9);
  const [publishing, setPublishing] = useState(false);
  const [composerError, setComposerError] = useState('');

  // @Mention autocomplete in composer
  const [mentionSuggestions, setMentionSuggestions] = useState<any[]>([]);

  // Repost menu popover per post
  const [repostMenuPostId, setRepostMenuPostId] = useState<number | null>(null);

  // Edit post inline state
  const [editingPostId, setEditingPostId] = useState<number | null>(null);
  const [editPostTitle, setEditPostTitle] = useState('');
  const [editPostContent, setEditPostContent] = useState('');

  // Thread drawer state
  const initialThreadId = routePostId
    ? Number(routePostId)
    : searchParams.get('discussion')
      ? Number(searchParams.get('discussion'))
      : null;

  const [activeThreadId, setActiveThreadId] = useState<number | null>(
    initialThreadId && !Number.isNaN(initialThreadId) ? initialThreadId : null
  );
  const [threadDetail, setThreadDetail] = useState<
    | (PulsePost & {
        comments: ThreadComment[];
        totalTopLevelComments?: number;
        commentsHasMore?: boolean;
        nextCommentOffset?: number;
      })
    | null
  >(null);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadingMoreComments, setLoadingMoreComments] = useState(false);
  const [commentText, setCommentText] = useState('');
  const [commentStickerOpen, setCommentStickerOpen] = useState(false);
  const [recentCommentStickers, setRecentCommentStickers] = useState<string[]>([]);
  const [replyToComment, setReplyToComment] = useState<ThreadComment | null>(null);
  const [postingComment, setPostingComment] = useState(false);

  // Edit / delete comment states
  const [editingCommentId, setEditingCommentId] = useState<number | null>(null);
  const [editingCommentText, setEditingCommentText] = useState('');

  // Share toast & report modal
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [heartPopId, setHeartPopId] = useState<number | null>(null);
  const [heartBurstId, setHeartBurstId] = useState<number | null>(null);
  const lastTapRef = React.useRef<{ postId: number; at: number }>({ postId: 0, at: 0 });
  const [reportTarget, setReportTarget] = useState<{
    type: 'discussion' | 'comment';
    id: number;
    label: string;
  } | null>(null);

  const loadFeed = useCallback(
    async (offsetNum = 0, append = false) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      setError('');
      try {
        const params = new URLSearchParams({
          feedTab,
          limit: '25',
          offset: String(offsetNum),
        });
        if (hashtagFilter) params.set('hashtag', hashtagFilter);
        const res = await apiFetch<{ items: PulsePost[]; hasMore?: boolean }>(
          `/api/discussions?${params.toString()}`
        );
        const incoming = res.items || [];
        setPosts((prev) => (append ? [...prev, ...incoming] : incoming));
        setHasMore(Boolean(res.hasMore));
      } catch (err: any) {
        setError(err.message || 'Unable to load PULSE feed.');
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [feedTab, hashtagFilter]
  );

  useEffect(() => {
    loadFeed(0, false);
  }, [loadFeed]);

  // Sync URL route param /pulse/:postId or ?discussion=ID
  useEffect(() => {
    const qId = routePostId || searchParams.get('discussion');
    if (qId && !Number.isNaN(Number(qId))) {
      setActiveThreadId(Number(qId));
    }
  }, [routePostId, searchParams]);

  const loadThread = useCallback(
    async (discussionId: number, commentOffset = 0, append = false) => {
      if (append) {
        setLoadingMoreComments(true);
      } else {
        setLoadingThread(true);
      }
      try {
        const res = await apiFetch<{
          discussion: PulsePost & {
            comments: ThreadComment[];
            totalTopLevelComments?: number;
            commentsHasMore?: boolean;
            nextCommentOffset?: number;
          };
        }>(
          `/api/discussions/${discussionId}?commentLimit=80&commentOffset=${commentOffset}`
        );
        if (append && res.discussion) {
          setThreadDetail((prev) => {
            if (!prev) return res.discussion;
            const seen = new Set(prev.comments.map((c) => c.id));
            const merged = [
              ...prev.comments,
              ...(res.discussion.comments || []).filter((c) => !seen.has(c.id)),
            ];
            return {
              ...res.discussion,
              comments: merged,
            };
          });
        } else {
          setThreadDetail(res.discussion);
        }
      } catch {
        if (!append) setThreadDetail(null);
      } finally {
        setLoadingThread(false);
        setLoadingMoreComments(false);
      }
    },
    []
  );

  useEffect(() => {
    if (activeThreadId) {
      loadThread(activeThreadId);
    } else {
      setThreadDetail(null);
    }
  }, [activeThreadId, loadThread]);

  // Search anime tag inside composer
  useEffect(() => {
    if (!composerOpen || animeQuery.trim().length < 2) {
      setAnimeMatches([]);
      return;
    }
    const timer = setTimeout(() => {
      apiFetch<{ items: any[] }>(`/api/anime/search?q=${encodeURIComponent(animeQuery.trim())}`)
        .then((res) => setAnimeMatches((res.items || []).slice(0, 5)))
        .catch(() => setAnimeMatches([]));
    }, 250);
    return () => clearTimeout(timer);
  }, [animeQuery, composerOpen]);

  // Live @mention lookup inside composer
  useEffect(() => {
    if (!composerOpen || !user) {
      setMentionSuggestions([]);
      return;
    }
    const match = content.match(/(?:^|\s)@([a-zA-Z0-9_.-]{2,20})$/);
    if (!match) {
      setMentionSuggestions([]);
      return;
    }
    const handleFragment = match[1];
    const timer = setTimeout(() => {
      apiFetch<{ items: any[] }>(`/api/users/search?q=${encodeURIComponent(handleFragment)}`)
        .then((res) => setMentionSuggestions((res.items || []).slice(0, 5)))
        .catch(() => setMentionSuggestions([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [content, composerOpen, user]);

  const resetComposer = () => {
    setTitle('');
    setContent('');
    setMediaType('none');
    setImageDataUrl('');
    setVideoDataUrl('');
    setMediaPresetKey('');
    setPickedAnime(null);
    setAnimeQuery('');
    setEnablePoll(false);
    setPollQuestion('');
    setPollOptions(['', '']);
    setQuoteTarget(null);
    setComposerError('');
  };

  const openFreshComposer = (
    quote?: PulsePost | null,
    presetMode?: 'poll' | 'review' | 'media'
  ) => {
    if (!user) {
      navigate('/auth/login');
      return;
    }
    resetComposer();
    if (quote) setQuoteTarget(quote);
    if (presetMode === 'poll') {
      setPostKind('pulse');
      setEnablePoll(true);
    } else if (presetMode === 'review') {
      setPostKind('review');
    } else {
      setPostKind('pulse');
    }
    setComposerOpen(true);
  };

  const handleToggleGenre = (g: string) => {
    setSelectedGenres((prev) =>
      prev.includes(g) ? prev.filter((item) => item !== g) : [...prev.slice(0, 4), g]
    );
  };

  const handleImageFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 8 * 1024 * 1024) {
      setComposerError('Image must be 8 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        const maxDim = 1280;
        let { width, height } = img;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = Math.round((height * maxDim) / width);
            width = maxDim;
          } else {
            width = Math.round((width * maxDim) / height);
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, width, height);
          setImageDataUrl(canvas.toDataURL('image/jpeg', 0.85));
          setVideoDataUrl('');
          setMediaPresetKey('');
          setMediaType('image');
          setComposerError('');
          kageSound.play('pulse_upload_done');
        }
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleVideoFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > 16 * 1024 * 1024) {
      setComposerError('Video clip must be 16 MB or smaller.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setVideoDataUrl(String(reader.result || ''));
      setImageDataUrl('');
      setMediaPresetKey('');
      setMediaType('video');
      setComposerError('');
      kageSound.play('pulse_upload_done');
    };
    reader.readAsDataURL(file);
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate('/auth/login');
      return;
    }
    const cleanPollOpts = enablePoll
      ? pollOptions.map((o) => o.trim()).filter(Boolean)
      : [];

    if (enablePoll && cleanPollOpts.length < 2) {
      setComposerError('Add at least 2 poll options.');
      return;
    }

    if (
      !title.trim() &&
      !content.trim() &&
      !imageDataUrl &&
      !videoDataUrl &&
      !mediaPresetKey &&
      cleanPollOpts.length === 0 &&
      !quoteTarget
    ) {
      setComposerError('Write a post, attach media, or add a poll before publishing.');
      return;
    }

    setPublishing(true);
    setComposerError('');
    try {
      await apiFetch('/api/discussions', {
        method: 'POST',
        body: JSON.stringify({
          kind: postKind,
          title: title.trim() || content.trim().slice(0, 72) || (pollQuestion.trim() || 'Pulse Post'),
          content: content.trim() || title.trim(),
          genreTags: selectedGenres,
          animeMalId: pickedAnime?.malId || null,
          animeTitle: pickedAnime?.title || null,
          mediaType: videoDataUrl
            ? 'video'
            : imageDataUrl || mediaPresetKey
              ? 'image'
              : 'none',
          imageDataUrl: imageDataUrl || null,
          videoDataUrl: videoDataUrl || null,
          mediaUrl: mediaPresetKey || null,
          quoteOfPostId: quoteTarget?.id || null,
          pollQuestion: enablePoll ? pollQuestion.trim() || content.trim().slice(0, 120) : null,
          pollOptions: enablePoll ? cleanPollOpts : null,
          rating: postKind === 'review' ? rating : null,
        }),
      });
      kageSound.play('pulse_publish_success');
      resetComposer();
      setComposerOpen(false);
      bumpTasteRevision();
      await loadFeed(0, false);
    } catch (err: any) {
      setComposerError(err.message || 'Failed to publish post.');
    } finally {
      setPublishing(false);
    }
  };

  const triggerDoubleTapLike = (post: PulsePost) => {
    if (!user) {
      navigate('/auth/login');
      return;
    }
    setHeartBurstId(post.id);
    window.setTimeout(() => {
      setHeartBurstId((prev) => (prev === post.id ? null : prev));
    }, 640);
    if (!post.viewerLiked) {
      void handleReaction(post.id, 'like');
    } else {
      setHeartPopId(post.id);
      window.setTimeout(() => {
        setHeartPopId((prev) => (prev === post.id ? null : prev));
      }, 240);
    }
  };

  const handleTouchCheckDoubleTap = (post: PulsePost) => {
    const now = Date.now();
    if (lastTapRef.current.postId === post.id && now - lastTapRef.current.at < 290) {
      lastTapRef.current = { postId: 0, at: 0 };
      triggerDoubleTapLike(post);
      return true;
    }
    lastTapRef.current = { postId: post.id, at: now };
    return false;
  };

  const handleReaction = async (
    postId: number,
    reactionType: 'like' | 'bookmark' | 'repost'
  ) => {
    if (!user) {
      navigate('/auth/login');
      return;
    }
    setRepostMenuPostId(null);

    if (reactionType === 'like') {
      kageSound.play('pulse_like');
      setHeartPopId(postId);
      window.setTimeout(() => {
        setHeartPopId((prev) => (prev === postId ? null : prev));
      }, 240);
    } else if (reactionType === 'repost') {
      kageSound.play('pulse_repost');
    } else if (reactionType === 'bookmark') {
      kageSound.play('ui_bookmark');
    }

    setPosts((prev) =>
      prev.map((p) => {
        if (p.id !== postId) return p;
        if (reactionType === 'like') {
          const next = !p.viewerLiked;
          return {
            ...p,
            viewerLiked: next,
            likeCount: Math.max(0, p.likeCount + (next ? 1 : -1)),
          };
        }
        if (reactionType === 'repost') {
          const next = !p.viewerReposted;
          return {
            ...p,
            viewerReposted: next,
            repostCount: Math.max(0, p.repostCount + (next ? 1 : -1)),
          };
        }
        return { ...p, viewerBookmarked: !p.viewerBookmarked };
      })
    );

    try {
      if (reactionType === 'repost') {
        const res = await apiFetch<{ reposted: boolean; repostCount: number }>(
          `/api/discussions/${postId}/repost`,
          { method: 'POST' }
        );
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, viewerReposted: res.reposted, repostCount: res.repostCount }
              : p
          )
        );
      } else if (reactionType === 'bookmark') {
        const res = await apiFetch<{ saved: boolean }>(`/api/discussions/${postId}/save`, {
          method: 'POST',
        });
        setPosts((prev) =>
          prev.map((p) => (p.id === postId ? { ...p, viewerBookmarked: res.saved } : p))
        );
      } else {
        const res = await apiFetch('/api/reactions', {
          method: 'POST',
          body: JSON.stringify({
            targetType: 'discussion',
            targetId: postId,
            reactionType: 'like',
          }),
        });
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId ? { ...p, likeCount: res.likeCount ?? p.likeCount } : p
          )
        );
      }
      bumpTasteRevision();
    } catch {
      loadFeed(0, false);
    }
  };

  const handleVotePoll = async (postId: number, optionId: string) => {
    if (!user) {
      navigate('/auth/login');
      return;
    }
    try {
      const res = await apiFetch<{ pollOptions: PollOptionItem[]; viewerPollVote: string }>(
        `/api/discussions/${postId}/poll-vote`,
        {
          method: 'POST',
          body: JSON.stringify({ optionId }),
        }
      );
      setPosts((prev) =>
        prev.map((p) =>
          p.id === postId
            ? {
                ...p,
                pollOptions: res.pollOptions,
                viewerPollVote: res.viewerPollVote,
              }
            : p
        )
      );
      if (threadDetail?.id === postId) {
        setThreadDetail((prev) =>
          prev
            ? {
                ...prev,
                pollOptions: res.pollOptions,
                viewerPollVote: res.viewerPollVote,
              }
            : null
        );
      }
    } catch (err: any) {
      setError(err.message || 'Poll vote failed.');
    }
  };

  const handleSaveEditPost = async (postId: number) => {
    if (!editPostContent.trim() && !editPostTitle.trim()) return;
    try {
      await apiFetch(`/api/discussions/${postId}`, {
        method: 'PUT',
        body: JSON.stringify({
          title: editPostTitle.trim() || editPostContent.trim().slice(0, 72),
          content: editPostContent.trim(),
        }),
      });
      setEditingPostId(null);
      await loadFeed(0, false);
      if (activeThreadId === postId) {
        await loadThread(postId);
      }
    } catch (err: any) {
      setError(err.message || 'Could not edit post.');
    }
  };

  const handleSharePost = async (postId: number) => {
    const shareUrl = `${window.location.origin}/pulse/${postId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopiedId(postId);
      setTimeout(() => setCopiedId((prev) => (prev === postId ? null : prev)), 2200);
    } catch {
      // ignore
    }
  };

  const handleDeletePost = async (postId: number) => {
    try {
      await apiFetch(`/api/discussions/${postId}`, { method: 'DELETE' });
      setConfirmDeleteId(null);
      if (activeThreadId === postId) {
        closeThread();
      }
      await loadFeed(0, false);
    } catch (err: any) {
      setError(err.message || 'Could not delete post.');
    }
  };

  const handleTogglePin = async (postId: number, currentlyPinned: boolean) => {
    try {
      await apiFetch(`/api/discussions/${postId}/moderate`, {
        method: 'POST',
        body: JSON.stringify({ action: currentlyPinned ? 'unpin' : 'pin' }),
      });
      await loadFeed(0, false);
    } catch (err: any) {
      setError(err.message || 'Could not update pin state.');
    }
  };

  const dispatchComment = async (opts?: { stickerId?: string }) => {
    if (!user) {
      navigate('/auth/login');
      return;
    }
    if (!activeThreadId) return;
    const text = commentText.trim();
    const stickerId = opts?.stickerId || null;
    if (!text && !stickerId) return;

    setPostingComment(true);
    try {
      await apiFetch(`/api/discussions/${activeThreadId}/comments`, {
        method: 'POST',
        body: JSON.stringify({
          content: stickerId ? text : text,
          stickerId,
          parentCommentId: replyToComment?.id || null,
        }),
      });
      if (stickerId) {
        setCommentStickerOpen(false);
        setRecentCommentStickers((prev) =>
          [stickerId, ...prev.filter((s) => s !== stickerId)].slice(0, 8)
        );
      }
      kageSound.play('pulse_comment');
      setCommentText('');
      setReplyToComment(null);
      await loadThread(activeThreadId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === activeThreadId ? { ...p, commentCount: p.commentCount + 1 } : p
        )
      );
    } catch (err: any) {
      setError(err.message || 'Could not post comment.');
    } finally {
      setPostingComment(false);
    }
  };

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    await dispatchComment();
  };

  const handleLikeComment = async (commentId: number) => {
    if (!user || !activeThreadId) {
      navigate('/auth/login');
      return;
    }
    try {
      await apiFetch('/api/reactions', {
        method: 'POST',
        body: JSON.stringify({
          targetType: 'comment',
          targetId: commentId,
          reactionType: 'like',
        }),
      });
      await loadThread(activeThreadId);
    } catch {
      // ignore
    }
  };

  const handleSaveCommentEdit = async (commentId: number) => {
    if (!activeThreadId || !editingCommentText.trim()) return;
    try {
      await apiFetch(`/api/comments/${commentId}`, {
        method: 'PUT',
        body: JSON.stringify({ content: editingCommentText.trim() }),
      });
      setEditingCommentId(null);
      setEditingCommentText('');
      await loadThread(activeThreadId);
    } catch (err: any) {
      setError(err.message || 'Could not edit comment.');
    }
  };

  const handleDeleteComment = async (commentId: number) => {
    if (!activeThreadId) return;
    try {
      await apiFetch(`/api/comments/${commentId}`, { method: 'DELETE' });
      await loadThread(activeThreadId);
      setPosts((prev) =>
        prev.map((p) =>
          p.id === activeThreadId
            ? { ...p, commentCount: Math.max(0, p.commentCount - 1) }
            : p
        )
      );
    } catch (err: any) {
      setError(err.message || 'Could not delete comment.');
    }
  };

  const openThread = (postId: number) => {
    setActiveThreadId(postId);
    setSearchParams({ discussion: String(postId) });
  };

  const closeThread = () => {
    setActiveThreadId(null);
    setReplyToComment(null);
    setCommentStickerOpen(false);
    if (routePostId) {
      navigate('/pulse', { replace: true });
    } else {
      setSearchParams({});
    }
  };

  const selectHashtag = (tag: string) => {
    setHashtagFilter(tag);
  };

  const topLevelComments = (threadDetail?.comments || []).filter((c) => !c.parentCommentId);
  const repliesByParent = new Map<number, ThreadComment[]>();
  for (const c of threadDetail?.comments || []) {
    if (c.parentCommentId) {
      const arr = repliesByParent.get(c.parentCommentId) || [];
      arr.push(c);
      repliesByParent.set(c.parentCommentId, arr);
    }
  }

  const renderPollBlock = (post: PulsePost) => {
    if (!Array.isArray(post.pollOptions) || post.pollOptions.length < 2) return null;
    const totalVotes = post.pollOptions.reduce((acc, o) => acc + (o.votes || 0), 0);
    const maxVotes = Math.max(0, ...post.pollOptions.map((o) => o.votes || 0));
    const hasVoted = Boolean(post.viewerPollVote);
    return (
      <div
        onClick={(e) => e.stopPropagation()}
        className="p-3.5 rounded-xl bg-[#09080B] border border-white/10 space-y-2.5"
      >
        {post.pollQuestion && post.pollQuestion !== post.title && (
          <p className="text-xs sm:text-sm font-semibold text-[#F5F1F2]">{post.pollQuestion}</p>
        )}
        <div className="space-y-2">
          {post.pollOptions.map((opt) => {
            const pct = totalVotes === 0 ? 0 : Math.round(((opt.votes || 0) / totalVotes) * 100);
            const selected = post.viewerPollVote === opt.id;
            const isLeader = hasVoted && maxVotes > 0 && (opt.votes || 0) === maxVotes;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleVotePoll(post.id, opt.id)}
                className={`relative w-full min-h-[40px] px-3 py-2 rounded-lg border overflow-hidden text-left text-xs kage-press cursor-pointer ${
                  selected
                    ? 'border-[#C0263D] bg-[#C0263D]/10 text-[#F5F1F2]'
                    : isLeader
                      ? 'border-[#6D28D9]/55 bg-[#141116] text-[#F5F1F2]'
                      : 'border-white/10 bg-[#141116] text-[#F5F1F2] hover:border-white/25'
                }`}
              >
                <div
                  className={`absolute inset-y-0 left-0 transition-all duration-300 pointer-events-none ${
                    selected ? 'bg-[#C0263D]/25' : 'bg-[#6D28D9]/22'
                  }`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative z-10 flex items-center justify-between gap-2">
                  <span className="font-medium flex items-center gap-1.5">
                    {selected && <Check className="w-3.5 h-3.5 text-[#C0263D]" />}
                    {opt.label || opt.text}
                  </span>
                  <span className="font-mono-num text-[11px] text-[#A7A0AA]">
                    {pct}% ({formatCompactNumber(opt.votes)})
                  </span>
                </div>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-[#A7A0AA] font-mono-num">
          {formatCompactNumber(totalVotes)} {totalVotes === 1 ? 'vote' : 'votes'} · Tap an option to
          vote
        </p>
      </div>
    );
  };

  const renderQuotedEmbed = (quoted?: QuotedPostPreview | null) => {
    if (!quoted) return null;
    if (quoted.deleted) {
      return (
        <div className="p-3 rounded-xl bg-[#09080B]/70 border border-white/8 text-xs italic text-[#A7A0AA]">
          {quoted.message || 'Original post is no longer available.'}
        </div>
      );
    }
    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          openThread(quoted.id);
        }}
        className="p-3.5 rounded-xl bg-[#09080B] border border-white/10 hover:border-[#6D28D9]/50 space-y-2 cursor-pointer transition-colors"
      >
        {quoted.author && (
          <div className="flex items-center gap-2 text-xs">
            <div className="w-5 h-5 rounded-full overflow-hidden bg-[#141116]">
              <KageImage
                src={quoted.author.avatarUrl}
                alt={quoted.author.displayName}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="font-semibold text-[#F5F1F2]">{quoted.author.displayName}</span>
            <OwnerBadge role={quoted.author.role} size="xs" />
            <span className="text-[#A7A0AA]">@{quoted.author.username}</span>
          </div>
        )}
        {quoted.title && quoted.title !== quoted.content && (
          <p className="text-xs font-bold text-[#F5F1F2] line-clamp-1">{quoted.title}</p>
        )}
        {quoted.content && (
          <p className="text-xs text-[#A7A0AA] line-clamp-3">{quoted.content}</p>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 pt-1">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wider text-[#F5F1F2]">
            PULSE
          </h1>
          <p className="text-xs sm:text-sm text-[#A7A0AA] mt-0.5">
            Where anime fans become a fandom.
          </p>
        </div>

        <button
          type="button"
          onClick={() => openFreshComposer(null)}
          className="min-h-[42px] px-4 py-2 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs sm:text-sm font-semibold flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <span>Create Post</span>
          <Plus className="w-4 h-4" />
        </button>
      </div>

      {/* Segmented Feed Tabs: For You | Following | Latest | Saved */}
      <div className="p-1 rounded-xl bg-[#141116] border border-white/8 flex items-center gap-1 overflow-x-auto no-scrollbar">
        {(
          [
            { id: 'for_you', label: 'For You' },
            { id: 'following', label: 'Following' },
            { id: 'latest', label: 'Latest' },
            ...(user ? [{ id: 'saved' as const, label: 'Saved' }] : []),
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFeedTab(tab.id)}
            className={`flex-1 min-h-[38px] px-3 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              feedTab === tab.id
                ? 'bg-[#1F1A24] text-[#F5F1F2] shadow-sm'
                : 'text-[#A7A0AA] hover:text-[#F5F1F2]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Inline Quick Composer Trigger with 1-Tap Mode Launchers */}
      <div
        onClick={() => openFreshComposer(null)}
        className="p-3 rounded-2xl bg-[#141116] border border-white/10 hover:border-white/20 flex items-center gap-3 cursor-pointer transition-colors"
      >
        <div className="w-9 h-9 rounded-full overflow-hidden bg-[#09080B] border border-white/12 shrink-0">
          <KageImage
            src={profile?.avatarUrl || 'asset:avatar_default'}
            alt={profile?.displayName || 'Hunter'}
            className="w-full h-full object-cover"
          />
        </div>
        <input
          type="text"
          readOnly
          placeholder="Share a hot take, anime review, clip, or poll..."
          className="flex-1 bg-transparent text-xs sm:text-sm text-[#F5F1F2] placeholder-[#A7A0AA] focus:outline-none cursor-pointer"
        />
        <div className="flex items-center gap-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          <button
            type="button"
            onClick={() => openFreshComposer(null, 'media')}
            title="Share Image or Clip"
            aria-label="Share image or video clip"
            className="min-h-[36px] px-2.5 rounded-lg hover:bg-[#1C1720] text-[#A7A0AA] hover:text-[#C0263D] inline-flex items-center gap-1 text-xs font-medium kage-press cursor-pointer"
          >
            <ImageIcon className="w-4 h-4" />
            <span className="hidden sm:inline">Media</span>
          </button>
          <button
            type="button"
            onClick={() => openFreshComposer(null, 'poll')}
            title="Create Poll"
            aria-label="Create poll"
            className="min-h-[36px] px-2.5 rounded-lg hover:bg-[#1C1720] text-[#A7A0AA] hover:text-[#6D28D9] inline-flex items-center gap-1 text-xs font-medium kage-press cursor-pointer"
          >
            <BarChart3 className="w-4 h-4" />
            <span className="hidden sm:inline">Poll</span>
          </button>
          <button
            type="button"
            onClick={() => openFreshComposer(null, 'review')}
            title="Write Anime Review"
            aria-label="Write anime review"
            className="min-h-[36px] px-2.5 rounded-lg hover:bg-[#1C1720] text-[#A7A0AA] hover:text-amber-400 inline-flex items-center gap-1 text-xs font-medium kage-press cursor-pointer"
          >
            <Star className="w-4 h-4" />
            <span className="hidden sm:inline">Review</span>
          </button>
        </div>
      </div>

      {/* Active Hashtag Filter */}
      {hashtagFilter && (
        <div className="flex items-center justify-between px-3.5 py-2 rounded-xl bg-[#141116] border border-[#6D28D9]/40 text-xs">
          <span className="text-[#F5F1F2]">
            Filtering by hashtag <span className="font-bold text-[#6D28D9]">#{hashtagFilter}</span>
          </span>
          <button
            type="button"
            onClick={() => setHashtagFilter('')}
            className="text-[#A7A0AA] hover:text-white cursor-pointer"
          >
            Clear
          </button>
        </div>
      )}

      {error && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
          {error}
        </div>
      )}

      {/* Feed Stream */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, idx) => (
            <div
              key={idx}
              className="h-60 rounded-2xl bg-[#141116] border border-white/6 animate-pulse"
            />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="p-8 rounded-2xl bg-[#141116] border border-white/8 text-center space-y-3">
          <p className="text-base font-semibold text-[#F5F1F2]">
            {feedTab === 'following'
              ? 'No posts from hunters you follow yet'
              : feedTab === 'saved'
                ? 'No saved posts yet'
                : 'Be the first to ignite PULSE'}
          </p>
          <p className="text-xs text-[#A7A0AA] max-w-md mx-auto">
            {feedTab === 'following'
              ? 'Follow fellow anime fans from Guilds, Profiles, or Latest posts to curate your Following stream.'
              : feedTab === 'saved'
                ? 'Bookmark theories, anime edits, and polls to revisit them anytime.'
                : 'Share an episode reaction, anime edit clip, poll, or review.'}
          </p>
          <button
            type="button"
            onClick={() =>
              feedTab === 'following' || feedTab === 'saved'
                ? setFeedTab('latest')
                : openFreshComposer(null)
            }
            className="min-h-[42px] px-5 py-2 rounded-xl bg-[#C0263D] text-white text-xs font-semibold cursor-pointer"
          >
            {feedTab === 'following' || feedTab === 'saved'
              ? 'Explore Latest Posts'
              : 'Create First Post'}
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => {
            const isAuthor = user?.uid === post.author.uid;
            const isGlobalAdmin = user?.role === 'owner' || user?.role === 'admin';
            const canDelete = isAuthor || isGlobalAdmin;
            const isOwnerPost = post.author.role === 'owner';
            const isVideoPost = post.mediaType === 'video' && post.mediaUrl;

            return (
              <article
                key={`${post.id}_${post.repostedBy?.uid || 'orig'}`}
                className={`relative rounded-2xl bg-[#141116] border overflow-hidden transition-colors ${
                  isOwnerPost || post.isPinned
                    ? 'border-amber-400/40 hover:border-amber-400/65'
                    : 'border-white/8 hover:border-white/15'
                }`}
              >
                {/* Double-Tap Heart Burst Overlay */}
                {heartBurstId === post.id && (
                  <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center">
                    <div className="w-20 h-20 rounded-full bg-[#09080B]/65 backdrop-blur-sm flex items-center justify-center shadow-2xl kage-heart-burst">
                      <Heart className="w-11 h-11 text-[#C0263D] fill-[#C0263D]" />
                    </div>
                  </div>
                )}

                <div className="p-4 sm:p-5 space-y-3">
                  {post.repostedBy && (
                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                      <Repeat2 className="w-3.5 h-3.5" />
                      <Link
                        to={`/profile/${post.repostedBy.username}`}
                        className="hover:underline"
                      >
                        {post.repostedBy.displayName} reposted
                      </Link>
                    </div>
                  )}

                  {post.isPinned && (
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-amber-300">
                      <Pin className="w-3.5 h-3.5 text-amber-400" />
                      <span>
                        {isOwnerPost ? 'Pinned Official Owner Proclamation' : 'Pinned Thread'}
                      </span>
                    </div>
                  )}

                  {/* Author & Meta Row */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <Link
                        to={`/profile/${post.author.username}`}
                        className={`w-10 h-10 rounded-full overflow-hidden shrink-0 bg-[#09080B] ${
                          isOwnerPost
                            ? 'border-2 border-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.28)]'
                            : 'border border-white/15'
                        }`}
                      >
                        <KageImage
                          src={post.author.avatarUrl}
                          alt={post.author.displayName}
                          className="w-full h-full object-cover"
                        />
                      </Link>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Link
                            to={`/profile/${post.author.username}`}
                            className="text-sm font-bold text-[#F5F1F2] hover:text-[#C0263D] truncate"
                          >
                            {post.author.displayName}
                          </Link>
                          <OwnerBadge role={post.author.role} size="xs" />
                          <span className="text-xs text-[#A7A0AA] truncate">
                            @{post.author.username} · {formatRelativeTime(post.createdAt)}
                            {post.editedAt ? ' · edited' : ''}
                          </span>
                        </div>
                        <div className="text-[11px] text-[#A7A0AA] flex items-center gap-1.5 flex-wrap mt-0.5">
                          {post.community && (
                            <Link
                              to={`/guilds/${post.community.slug}`}
                              className="text-[#6D28D9] hover:underline font-medium"
                            >
                              {post.community.name}
                            </Link>
                          )}
                          {post.community && post.animeTitle && <span>·</span>}
                          {post.animeTitle && post.animeMalId && (
                            <Link
                              to={`/anime/${post.animeMalId}`}
                              className="text-[#C0263D] hover:underline font-medium"
                            >
                              {post.animeTitle}
                            </Link>
                          )}
                          {post.genreTags?.length > 0 && (
                            <span>
                              {(post.community || post.animeTitle) && '· '}
                              {post.genreTags.slice(0, 3).join(' · ')}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {post.rating && (
                        <span className="font-mono-num text-xs text-amber-400 flex items-center gap-1 mr-1">
                          <Star className="w-3.5 h-3.5 fill-amber-400" />
                          {post.rating}/10
                        </span>
                      )}
                      {isGlobalAdmin && (
                        <button
                          type="button"
                          onClick={() => handleTogglePin(post.id, post.isPinned)}
                          className={`min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg cursor-pointer ${
                            post.isPinned
                              ? 'text-amber-400 hover:text-amber-300'
                              : 'text-[#A7A0AA] hover:text-amber-400'
                          }`}
                          title={post.isPinned ? 'Unpin from PULSE' : 'Pin to top of PULSE'}
                        >
                          <Pin className="w-4 h-4" />
                        </button>
                      )}
                      {isAuthor && editingPostId !== post.id && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingPostId(post.id);
                            setEditPostTitle(post.title);
                            setEditPostContent(post.content);
                          }}
                          className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#A7A0AA] hover:text-white cursor-pointer"
                          aria-label="Edit post"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                      )}
                      {canDelete ? (
                        confirmDeleteId === post.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDeletePost(post.id)}
                              className="min-h-[34px] px-2.5 rounded-lg bg-rose-600 text-white text-[11px] font-semibold cursor-pointer"
                            >
                              Delete
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="min-h-[34px] px-2 rounded-lg bg-[#09080B] text-[#A7A0AA] text-[11px] cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(post.id)}
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#A7A0AA] hover:text-rose-400 cursor-pointer"
                            aria-label="Delete post"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )
                      ) : (
                        user && (
                          <button
                            type="button"
                            onClick={() =>
                              setReportTarget({
                                type: 'discussion',
                                id: post.id,
                                label: `post by @${post.author.username}`,
                              })
                            }
                            className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg text-[#A7A0AA] hover:text-[#C0263D] cursor-pointer"
                            aria-label="Report post"
                          >
                            <Flag className="w-3.5 h-3.5" />
                          </button>
                        )
                      )}
                    </div>
                  </div>

                  {/* Body Copy or Inline Edit */}
                  {editingPostId === post.id ? (
                    <div className="space-y-2.5 pt-1">
                      <input
                        type="text"
                        value={editPostTitle}
                        onChange={(e) => setEditPostTitle(e.target.value)}
                        className="w-full min-h-[38px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-sm text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
                      />
                      <textarea
                        rows={3}
                        value={editPostContent}
                        onChange={(e) => setEditPostContent(e.target.value)}
                        className="w-full rounded-xl bg-[#09080B] border border-white/12 p-3 text-sm text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setEditingPostId(null)}
                          className="min-h-[34px] px-3 rounded-lg bg-[#09080B] text-xs text-[#A7A0AA] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveEditPost(post.id)}
                          className="min-h-[34px] px-4 rounded-lg bg-[#C0263D] text-xs font-semibold text-white cursor-pointer"
                        >
                          Save Changes
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      onClick={() => {
                        if (!handleTouchCheckDoubleTap(post)) {
                          openThread(post.id);
                        }
                      }}
                      onDoubleClick={(e) => {
                        e.stopPropagation();
                        triggerDoubleTapLike(post);
                      }}
                      className="space-y-2 cursor-pointer"
                    >
                      {post.title && post.title !== post.content && (
                        <h2 className="text-base font-bold text-[#F5F1F2] leading-snug">
                          {post.title}
                        </h2>
                      )}
                      {post.content && (
                        <p className="text-sm text-[#F5F1F2]/90 whitespace-pre-line leading-relaxed">
                          {renderPulseRichText(post.content, selectHashtag)}
                        </p>
                      )}
                      {renderPollBlock(post)}
                      {renderQuotedEmbed(post.quotedPost)}
                    </div>
                  )}
                </div>

                {/* Post Media (Video or Image) */}
                {isVideoPost ? (
                  <div className="w-full bg-black border-y border-white/6">
                    <PulseVideoPlayer
                      postId={post.id}
                      src={post.mediaUrl!}
                      poster={post.posterUrl}
                      onViewRecorded={(newCount) =>
                        setPosts((prev) =>
                          prev.map((p) => (p.id === post.id ? { ...p, viewCount: newCount } : p))
                        )
                      }
                    />
                  </div>
                ) : post.mediaUrl ? (
                  <div
                    onClick={() => {
                      if (!handleTouchCheckDoubleTap(post)) {
                        openThread(post.id);
                      }
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      triggerDoubleTapLike(post);
                    }}
                    className="w-full max-h-[420px] overflow-hidden bg-[#09080B] border-y border-white/6 cursor-pointer select-none"
                  >
                    <KageImage
                      src={post.mediaUrl}
                      alt={post.title}
                      className="w-full max-h-[420px] object-cover"
                    />
                  </div>
                ) : null}

                {/* Action Bar — Like, Comment, Repost / Quote, Views, Share, Bookmark */}
                <div className="px-4 py-2.5 border-t border-white/6 flex items-center justify-between text-xs text-[#A7A0AA]">
                  <div className="flex items-center gap-4 sm:gap-6">
                    <button
                      type="button"
                      onClick={() => handleReaction(post.id, 'like')}
                      className={`min-h-[38px] flex items-center gap-1.5 kage-press cursor-pointer ${
                        post.viewerLiked ? 'text-[#C0263D] font-semibold' : 'hover:text-[#F5F1F2]'
                      }`}
                    >
                      <Heart
                        className={`w-4 h-4 ${post.viewerLiked ? 'fill-[#C0263D]' : ''} ${
                          heartPopId === post.id ? 'kage-heart-pop' : ''
                        }`}
                      />
                      <span className="font-mono-num">{formatCompactNumber(post.likeCount)}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => openThread(post.id)}
                      className="min-h-[38px] flex items-center gap-1.5 hover:text-[#F5F1F2] transition-colors cursor-pointer"
                    >
                      <MessageCircle className="w-4 h-4" />
                      <span className="font-mono-num">
                        {formatCompactNumber(post.commentCount)}
                      </span>
                    </button>

                    {/* Repost vs Quote Repost Popover */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() =>
                          setRepostMenuPostId((prev) => (prev === post.id ? null : post.id))
                        }
                        className={`min-h-[38px] flex items-center gap-1.5 transition-colors cursor-pointer ${
                          post.viewerReposted
                            ? 'text-emerald-400 font-semibold'
                            : 'hover:text-[#F5F1F2]'
                        }`}
                      >
                        <Repeat2 className="w-4 h-4" />
                        <span className="font-mono-num">
                          {formatCompactNumber((post.repostCount || 0) + (post.quoteCount || 0))}
                        </span>
                      </button>

                      {repostMenuPostId === post.id && (
                        <div className="absolute bottom-10 left-0 z-30 w-44 rounded-xl bg-[#09080B] border border-white/15 shadow-xl p-1.5 space-y-1">
                          <button
                            type="button"
                            onClick={() => handleReaction(post.id, 'repost')}
                            className="w-full px-3 py-2 rounded-lg hover:bg-[#141116] flex items-center gap-2 text-xs text-[#F5F1F2] cursor-pointer"
                          >
                            <Repeat2 className="w-3.5 h-3.5 text-emerald-400" />
                            <span>{post.viewerReposted ? 'Undo Repost' : 'Repost'}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setRepostMenuPostId(null);
                              openFreshComposer(post);
                            }}
                            className="w-full px-3 py-2 rounded-lg hover:bg-[#141116] flex items-center gap-2 text-xs text-[#F5F1F2] cursor-pointer"
                          >
                            <Quote className="w-3.5 h-3.5 text-[#6D28D9]" />
                            <span>Quote Post</span>
                          </button>
                        </div>
                      )}
                    </div>

                    {isVideoPost && typeof post.viewCount === 'number' && (
                      <span className="inline-flex items-center gap-1 text-[#A7A0AA] font-mono-num">
                        <Eye className="w-3.5 h-3.5" />
                        <span>{formatCompactNumber(post.viewCount)}</span>
                      </span>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleSharePost(post.id)}
                      className="min-h-[38px] px-2 flex items-center gap-1 hover:text-[#F5F1F2] transition-colors cursor-pointer"
                      aria-label="Copy link"
                    >
                      {copiedId === post.id ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-400" />
                          <span className="text-[11px] text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <Share2 className="w-4 h-4" />
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleReaction(post.id, 'bookmark')}
                      className={`min-h-[38px] px-2 flex items-center transition-colors cursor-pointer ${
                        post.viewerBookmarked ? 'text-[#6D28D9]' : 'hover:text-[#F5F1F2]'
                      }`}
                      aria-label="Bookmark post"
                    >
                      <Bookmark
                        className={`w-4 h-4 ${post.viewerBookmarked ? 'fill-[#6D28D9]' : ''}`}
                      />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={() => loadFeed(posts.length, true)}
                disabled={loadingMore}
                className="min-h-[42px] px-6 rounded-xl bg-[#141116] border border-white/12 text-xs font-semibold text-[#F5F1F2] hover:border-[#C0263D] inline-flex items-center gap-2 cursor-pointer"
              >
                {loadingMore && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{loadingMore ? 'Loading...' : 'Load More Posts'}</span>
              </button>
            </div>
          )}
        </div>
      )}

      {/* Create / Quote Post Modal — Portaled to document.body so it always centers on screen */}
      <KageModal
        isOpen={composerOpen}
        onClose={() => setComposerOpen(false)}
        title={quoteTarget ? 'Quote Post on PULSE' : 'Create PULSE Post'}
        maxWidthClass="max-w-lg"
        tallForm
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setComposerOpen(false)}
              className="min-h-[44px] px-4 rounded-xl bg-[#09080B] border border-white/10 text-xs font-medium text-[#A7A0AA] hover:text-white cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="pulse-composer-form"
              disabled={publishing}
              className="min-h-[44px] px-6 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] disabled:opacity-50 text-xs font-semibold text-white cursor-pointer"
            >
              {publishing ? 'Publishing...' : 'Publish to PULSE'}
            </button>
          </div>
        }
      >
        <form id="pulse-composer-form" onSubmit={handleCreatePost} className="space-y-4">
              {/* Post Mode */}
              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'pulse', label: 'Fandom Pulse' },
                    { id: 'discussion', label: 'Theory / Thread' },
                    { id: 'review', label: 'Anime Review' },
                  ] as const
                ).map((k) => (
                  <button
                    key={k.id}
                    type="button"
                    onClick={() => setPostKind(k.id)}
                    className={`min-h-[38px] px-2 rounded-xl text-xs font-semibold border transition-colors whitespace-nowrap cursor-pointer ${
                      postKind === k.id
                        ? 'bg-[#C0263D] border-[#C0263D] text-white'
                        : 'bg-[#09080B] border-white/10 text-[#A7A0AA] hover:text-white'
                    }`}
                  >
                    {k.label}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                  Headline (optional)
                </label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Why Zenitsu's 7th Form changed everything..."
                  className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/10 px-3.5 text-sm text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
                />
              </div>

              <div className="relative">
                <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                  Your Post (@mention hunters or add #hashtags)
                </label>
                <textarea
                  rows={4}
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Post about your favourite anime..."
                  className="w-full rounded-xl bg-[#09080B] border border-white/10 p-3.5 text-sm text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
                />
                {mentionSuggestions.length > 0 && (
                  <div className="mt-1 rounded-xl bg-[#09080B] border border-white/12 divide-y divide-white/6 max-h-36 overflow-y-auto">
                    {mentionSuggestions.map((u) => (
                      <button
                        key={u.uid}
                        type="button"
                        onClick={() => {
                          setContent((prev) =>
                            prev.replace(/@([a-zA-Z0-9_.-]{2,20})$/, `@${u.username} `)
                          );
                          setMentionSuggestions([]);
                        }}
                        className="w-full px-3 py-2 text-left text-xs text-[#F5F1F2] hover:bg-[#141116] flex items-center justify-between cursor-pointer"
                      >
                        <span className="font-semibold">{u.displayName}</span>
                        <span className="text-[#A7A0AA]">@{u.username}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {quoteTarget && (
                <div className="p-3 rounded-xl bg-[#09080B] border border-[#6D28D9]/40 space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-[#A7A0AA]">
                    <span>Quoting @{quoteTarget.author.username}</span>
                    <button
                      type="button"
                      onClick={() => setQuoteTarget(null)}
                      className="text-rose-400 cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                  <p className="text-xs text-[#F5F1F2] line-clamp-2">{quoteTarget.content}</p>
                </div>
              )}

              {postKind === 'review' && (
                <div>
                  <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                    Rating: <span className="text-amber-400 font-mono-num">{rating}/10</span>
                  </label>
                  <input
                    type="range"
                    min={1}
                    max={10}
                    value={rating}
                    onChange={(e) => setRating(Number(e.target.value))}
                    className="w-full accent-[#C0263D]"
                  />
                </div>
              )}

              {/* Interactive Poll Builder */}
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={() => setEnablePoll((v) => !v)}
                  className={`min-h-[36px] px-3 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer ${
                    enablePoll
                      ? 'border-[#6D28D9] bg-[#6D28D9]/20 text-white'
                      : 'border-white/10 bg-[#09080B] text-[#A7A0AA]'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  <span>{enablePoll ? 'Poll Attached' : 'Add Poll'}</span>
                </button>

                {enablePoll && (
                  <div className="p-3 rounded-xl bg-[#09080B] border border-white/10 space-y-2">
                    <input
                      type="text"
                      value={pollQuestion}
                      onChange={(e) => setPollQuestion(e.target.value)}
                      placeholder="Poll question (optional if written above)..."
                      className="w-full min-h-[36px] rounded-lg bg-[#141116] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                    />
                    {pollOptions.map((opt, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          type="text"
                          value={opt}
                          onChange={(e) =>
                            setPollOptions((prev) =>
                              prev.map((item, i) => (i === idx ? e.target.value : item))
                            )
                          }
                          placeholder={`Option ${idx + 1}`}
                          className="flex-1 min-h-[36px] rounded-lg bg-[#141116] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                        />
                        {pollOptions.length > 2 && (
                          <button
                            type="button"
                            onClick={() =>
                              setPollOptions((prev) => prev.filter((_, i) => i !== idx))
                            }
                            className="text-xs text-rose-400 cursor-pointer"
                          >
                            Remove
                          </button>
                        )}
                      </div>
                    ))}
                    {pollOptions.length < 4 && (
                      <button
                        type="button"
                        onClick={() => setPollOptions((prev) => [...prev, ''])}
                        className="text-xs text-[#6D28D9] font-semibold hover:underline cursor-pointer"
                      >
                        + Add Option
                      </button>
                    )}
                  </div>
                )}
              </div>

              {/* Optional Anime Tag */}
              <div>
                <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                  Link Anime (optional)
                </label>
                {pickedAnime ? (
                  <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#09080B] border border-[#6D28D9]/45 text-xs">
                    <span className="font-semibold text-[#F5F1F2]">{pickedAnime.title}</span>
                    <button
                      type="button"
                      onClick={() => setPickedAnime(null)}
                      className="text-[#A7A0AA] hover:text-white cursor-pointer"
                    >
                      Clear
                    </button>
                  </div>
                ) : (
                  <div className="relative">
                    <input
                      type="text"
                      value={animeQuery}
                      onChange={(e) => setAnimeQuery(e.target.value)}
                      placeholder="Search anime title..."
                      className="w-full min-h-[38px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2] focus:outline-none focus:border-[#6D28D9]"
                    />
                    {animeMatches.length > 0 && (
                      <div className="mt-1 rounded-xl bg-[#09080B] border border-white/12 divide-y divide-white/6 max-h-40 overflow-y-auto">
                        {animeMatches.map((a) => (
                          <button
                            key={a.malId}
                            type="button"
                            onClick={() => {
                              setPickedAnime({ malId: a.malId, title: a.title });
                              setAnimeMatches([]);
                              setAnimeQuery('');
                            }}
                            className="w-full px-3 py-2 text-left text-xs text-[#F5F1F2] hover:bg-[#141116] flex items-center justify-between cursor-pointer"
                          >
                            <span className="truncate">{a.title}</span>
                            <span className="text-[10px] text-[#A7A0AA] shrink-0">
                              {a.year || ''}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Genre Checkboxes */}
              <div>
                <label className="block text-xs font-medium text-[#A7A0AA] mb-1.5">
                  Realm Tags
                </label>
                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-1">
                  {GENRE_OPTIONS.map((g) => {
                    const active = selectedGenres.includes(g);
                    return (
                      <button
                        key={g}
                        type="button"
                        onClick={() => handleToggleGenre(g)}
                        className={`px-2.5 py-1 rounded-lg text-xs border transition-colors cursor-pointer ${
                          active
                            ? 'bg-[#6D28D9]/25 border-[#6D28D9] text-[#F5F1F2]'
                            : 'bg-[#09080B] border-white/10 text-[#A7A0AA]'
                        }`}
                      >
                        {g}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Image or Video Upload + Presets */}
              <div className="space-y-2">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <span className="text-xs font-medium text-[#A7A0AA]">Attach Media</span>
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center gap-1.5 text-xs text-[#C0263D] font-semibold cursor-pointer hover:underline">
                      <ImageIcon className="w-3.5 h-3.5" />
                      <span>Upload Image</span>
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleImageFileUpload}
                        className="hidden"
                      />
                    </label>
                    <label className="inline-flex items-center gap-1.5 text-xs text-[#6D28D9] font-semibold cursor-pointer hover:underline">
                      <Film className="w-3.5 h-3.5" />
                      <span>Upload Video</span>
                      <input
                        type="file"
                        accept="video/mp4,video/webm,video/quicktime"
                        onChange={handleVideoFileUpload}
                        className="hidden"
                      />
                    </label>
                  </div>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                  {PRESET_BANNERS.map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => {
                        const next = mediaPresetKey === b.key ? '' : b.key;
                        setMediaPresetKey(next);
                        setImageDataUrl('');
                        setVideoDataUrl('');
                        setMediaType(next ? 'image' : 'none');
                      }}
                      className={`px-2.5 py-1 rounded-lg text-[11px] border whitespace-nowrap shrink-0 cursor-pointer ${
                        mediaPresetKey === b.key
                          ? 'border-[#C0263D] bg-[#C0263D]/20 text-white'
                          : 'border-white/10 bg-[#09080B] text-[#A7A0AA]'
                      }`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>

                {(imageDataUrl || mediaPresetKey) && (
                  <div className="relative h-28 rounded-xl overflow-hidden border border-white/10">
                    <KageImage
                      src={imageDataUrl || mediaPresetKey}
                      alt="Preview"
                      className="w-full h-full object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setImageDataUrl('');
                        setMediaPresetKey('');
                        setMediaType('none');
                      }}
                      className="absolute top-2 right-2 px-2 py-1 rounded bg-black/75 text-[11px] text-white cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                )}

                {videoDataUrl && (
                  <div className="relative rounded-xl overflow-hidden border border-white/10 bg-black">
                    <video src={videoDataUrl} controls className="max-h-40 w-full object-contain" />
                    <button
                      type="button"
                      onClick={() => {
                        setVideoDataUrl('');
                        setMediaType('none');
                      }}
                      className="absolute top-2 right-2 px-2 py-1 rounded bg-black/75 text-[11px] text-white cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>

                {composerError && <p className="text-xs text-rose-400">{composerError}</p>}
        </form>
      </KageModal>

      {/* Nested Discussion & Comments Drawer — Portaled & Scroll-Locked via KageDrawer */}
      <KageDrawer
        isOpen={activeThreadId !== null}
        onClose={closeThread}
        title="Thread & Replies"
        maxWidthClass="max-w-xl"
        footer={
          <form
            onSubmit={handleAddComment}
            className="relative p-3 border-t border-white/10 bg-[#141116] space-y-2 shrink-0"
          >
            {commentStickerOpen && (
              <div className="absolute bottom-16 left-3 z-40">
                <AnimeStickerPicker
                  isOpen={commentStickerOpen}
                  onClose={() => setCommentStickerOpen(false)}
                  recentIds={recentCommentStickers}
                  align="left"
                  onSelectSticker={(stickerId) => {
                    dispatchComment({ stickerId });
                  }}
                />
              </div>
            )}

            {replyToComment && (
              <div className="flex items-center justify-between text-[11px] text-[#A7A0AA] px-1">
                <span>Replying to @{replyToComment.author.username}</span>
                <button
                  type="button"
                  onClick={() => setReplyToComment(null)}
                  className="text-[#C0263D] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setCommentStickerOpen((v) => !v)}
                aria-label="Choose anime sticker"
                className={`min-h-[42px] min-w-[40px] rounded-xl border flex items-center justify-center cursor-pointer ${
                  commentStickerOpen
                    ? 'bg-[#C0263D]/20 border-[#C0263D] text-white'
                    : 'bg-[#09080B] border-white/10 text-[#A7A0AA] hover:text-white'
                }`}
              >
                <Smile className="w-4 h-4" />
              </button>
              <input
                type="text"
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder={user ? 'Write a reply...' : 'Sign in to reply...'}
                className="flex-1 min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 px-3.5 text-xs sm:text-sm text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
              />
              <button
                type="submit"
                disabled={postingComment || !commentText.trim()}
                className="min-h-[42px] px-4 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send</span>
              </button>
            </div>
          </form>
        }
      >
              {loadingThread ? (
                <div className="space-y-3">
                  <div className="h-28 rounded-xl bg-[#141116] animate-pulse" />
                  <div className="h-20 rounded-xl bg-[#141116] animate-pulse" />
                </div>
              ) : !threadDetail ? (
                <p className="text-sm text-[#A7A0AA] text-center py-8">
                  This discussion is no longer available.
                </p>
              ) : (
                <>
                  {/* Root Post */}
                  <div className="p-4 rounded-2xl bg-[#141116] border border-white/10 space-y-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-full overflow-hidden bg-[#09080B]">
                        <KageImage
                          src={threadDetail.author.avatarUrl}
                          alt={threadDetail.author.displayName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Link
                            to={`/profile/${threadDetail.author.username}`}
                            className="text-sm font-bold text-[#F5F1F2] hover:underline"
                          >
                            {threadDetail.author.displayName}
                          </Link>
                          <OwnerBadge role={threadDetail.author.role} size="xs" />
                        </div>
                        <p className="text-xs text-[#A7A0AA]">
                          @{threadDetail.author.username} ·{' '}
                          {formatRelativeTime(threadDetail.createdAt)}
                        </p>
                      </div>
                    </div>
                    {threadDetail.title && threadDetail.title !== threadDetail.content && (
                      <h4 className="text-base font-bold text-[#F5F1F2]">{threadDetail.title}</h4>
                    )}
                    <p className="text-sm text-[#F5F1F2]/90 whitespace-pre-line">
                      {renderPulseRichText(threadDetail.content, selectHashtag)}
                    </p>
                    {renderPollBlock(threadDetail)}
                    {renderQuotedEmbed(threadDetail.quotedPost)}
                    {threadDetail.mediaType === 'video' && threadDetail.mediaUrl ? (
                      <div className="rounded-xl overflow-hidden bg-black">
                        <PulseVideoPlayer
                          postId={threadDetail.id}
                          src={threadDetail.mediaUrl}
                          poster={threadDetail.posterUrl}
                        />
                      </div>
                    ) : threadDetail.mediaUrl ? (
                      <div className="rounded-xl overflow-hidden max-h-72">
                        <KageImage
                          src={threadDetail.mediaUrl}
                          alt={threadDetail.title}
                          className="w-full h-full object-cover"
                        />
                      </div>
                    ) : null}
                  </div>

                  {/* Comments List */}
                  <div className="space-y-3">
                    <h4 className="text-xs font-semibold tracking-wider text-[#A7A0AA] font-mono-num">
                      Replies (
                      {formatCompactNumber(
                        threadDetail.commentCount || threadDetail.comments.length || 0
                      )}
                      )
                    </h4>

                    {topLevelComments.length === 0 ? (
                      <p className="text-xs text-[#A7A0AA] py-4 text-center">
                        No comments yet. Reply with thoughts or an anime sticker below.
                      </p>
                    ) : (
                      topLevelComments.map((c) => {
                        const replies = repliesByParent.get(c.id) || [];
                        const isCommentAuthor = user?.uid === c.author.uid;
                        const canDeleteComment =
                          isCommentAuthor ||
                          user?.uid === threadDetail.author.uid ||
                          user?.role === 'owner' ||
                          user?.role === 'admin';
                        const isStickerPlaceholder =
                          c.stickerId && c.content?.startsWith('[Sticker:');

                        return (
                          <div
                            key={c.id}
                            className="p-3.5 rounded-xl bg-[#141116] border border-white/8 space-y-2.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <Link
                                to={`/profile/${c.author.username}`}
                                className="flex items-center gap-2 flex-wrap"
                              >
                                <div className="w-7 h-7 rounded-full overflow-hidden bg-[#09080B]">
                                  <KageImage
                                    src={c.author.avatarUrl}
                                    alt={c.author.displayName}
                                    className="w-full h-full object-cover"
                                  />
                                </div>
                                <span className="text-xs font-semibold text-[#F5F1F2]">
                                  {c.author.displayName}
                                </span>
                                <OwnerBadge role={c.author.role} size="xs" />
                                <span className="text-[11px] text-[#A7A0AA]">
                                  @{c.author.username} · {formatRelativeTime(c.createdAt)}
                                  {c.editedAt ? ' · edited' : ''}
                                </span>
                              </Link>
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleLikeComment(c.id)}
                                  className={`text-[11px] flex items-center gap-1 cursor-pointer ${
                                    c.viewerLiked ? 'text-[#C0263D]' : 'text-[#A7A0AA] hover:text-white'
                                  }`}
                                >
                                  <Heart className={`w-3 h-3 ${c.viewerLiked ? 'fill-[#C0263D]' : ''}`} />
                                  <span className="font-mono-num">
                                    {formatCompactNumber(c.likeCount || 0)}
                                  </span>
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setReplyToComment(c)}
                                  className="text-[11px] text-[#6D28D9] hover:underline font-medium cursor-pointer"
                                >
                                  Reply
                                </button>
                                {isCommentAuthor && !isStickerPlaceholder && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCommentId(c.id);
                                      setEditingCommentText(c.content);
                                    }}
                                    className="text-[#A7A0AA] hover:text-white cursor-pointer"
                                    title="Edit comment"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                )}
                                {canDeleteComment && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteComment(c.id)}
                                    className="text-[#A7A0AA] hover:text-rose-400 cursor-pointer"
                                    title="Delete comment"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                                {user && !isCommentAuthor && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setReportTarget({
                                        type: 'comment',
                                        id: c.id,
                                        label: `comment by @${c.author.username}`,
                                      })
                                    }
                                    className="text-[#A7A0AA] hover:text-[#C0263D] cursor-pointer"
                                    aria-label="Report comment"
                                  >
                                    <Flag className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {editingCommentId === c.id ? (
                              <div className="space-y-2">
                                <input
                                  type="text"
                                  value={editingCommentText}
                                  onChange={(e) => setEditingCommentText(e.target.value)}
                                  className="w-full min-h-[36px] rounded-lg bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2]"
                                />
                                <div className="flex justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setEditingCommentId(null)}
                                    className="px-2.5 py-1 text-xs text-[#A7A0AA] cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSaveCommentEdit(c.id)}
                                    className="px-3 py-1 rounded-lg bg-[#C0263D] text-xs font-semibold text-white cursor-pointer"
                                  >
                                    Save
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {c.stickerId && (
                                  <KageStickerGraphic stickerId={c.stickerId} size={84} />
                                )}
                                {c.content && !isStickerPlaceholder && (
                                  <p className="text-xs sm:text-sm text-[#F5F1F2]/90 whitespace-pre-line">
                                    {renderPulseRichText(c.content, selectHashtag)}
                                  </p>
                                )}
                              </div>
                            )}

                            {replies.length > 0 && (
                              <div className="pl-4 border-l border-[#6D28D9]/40 space-y-2 pt-1">
                                {replies.map((rep) => {
                                  const repStickerOnly =
                                    rep.stickerId && rep.content?.startsWith('[Sticker:');
                                  return (
                                    <div
                                      key={rep.id}
                                      className="p-2.5 rounded-lg bg-[#09080B] space-y-1.5"
                                    >
                                      <div className="flex items-center justify-between gap-2 text-[11px]">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                          <Link
                                            to={`/profile/${rep.author.username}`}
                                            className="font-semibold text-[#F5F1F2] hover:underline"
                                          >
                                            {rep.author.displayName}
                                          </Link>
                                          <OwnerBadge role={rep.author.role} size="xs" />
                                          <span className="text-[#A7A0AA]">
                                            @{rep.author.username} ·{' '}
                                            {formatRelativeTime(rep.createdAt)}
                                          </span>
                                        </div>
                                        {(user?.uid === rep.author.uid ||
                                          user?.role === 'owner' ||
                                          user?.role === 'admin') && (
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteComment(rep.id)}
                                            className="text-[#A7A0AA] hover:text-rose-400 cursor-pointer"
                                          >
                                            <Trash2 className="w-3 h-3" />
                                          </button>
                                        )}
                                      </div>
                                      {rep.stickerId && (
                                        <KageStickerGraphic stickerId={rep.stickerId} size={72} />
                                      )}
                                      {rep.content && !repStickerOnly && (
                                        <p className="text-xs text-[#F5F1F2]/85">
                                          {renderPulseRichText(rep.content, selectHashtag)}
                                        </p>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}

                    {threadDetail.commentsHasMore && activeThreadId && (
                      <div className="pt-2 flex justify-center">
                        <button
                          type="button"
                          disabled={loadingMoreComments}
                          onClick={() =>
                            loadThread(
                              activeThreadId,
                              threadDetail.nextCommentOffset ?? topLevelComments.length,
                              true
                            )
                          }
                          className="min-h-[40px] px-5 rounded-xl bg-[#141116] border border-white/12 hover:border-[#C0263D] text-xs font-semibold text-[#F5F1F2] inline-flex items-center gap-2 cursor-pointer"
                        >
                          {loadingMoreComments && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                          <span>
                            {loadingMoreComments
                              ? 'Loading More Replies...'
                              : 'Load More Replies'}
                          </span>
                        </button>
                      </div>
                    )}
                  </div>
                </>
              )}
      </KageDrawer>

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
