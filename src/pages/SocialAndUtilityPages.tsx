import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  EmailAuthProvider,
  deleteUser,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth';
import {
  Archive,
  ArrowLeft,
  Bell,
  BellOff,
  Check,
  CheckCheck,
  Crown,
  Edit3,
  Film,
  Flag,
  Image as ImageIcon,
  Loader2,
  LogOut,
  Megaphone,
  MessageSquare,
  Mic,
  Music,
  Play,
  Plus,
  Search,
  Send,
  ShieldAlert,
  SlidersHorizontal,
  Smile,
  Trash2,
  Upload,
  UserCheck,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { apiFetch, getServerSessionToken } from '../lib/api';
import { useAuth } from '../context/AuthContext';
import { useSound } from '../context/SoundContext';
import { kageSound } from '../lib/soundEngine';
import { auth } from '../lib/firebase';
import { KageImage } from '../components/KageImage';
import { OwnerBadge } from '../components/KageBrand';
import { AnimePosterCard } from '../components/RealmsComponents';
import { AnimeStickerPicker, KageStickerGraphic } from '../components/AnimeStickerPicker';
import { ReportModal } from '../components/ReportModal';
import { KageModal } from '../components/KageModal';
import { ALL_GENRE_NAMES } from '../lib/genres';
import { formatCompactNumber } from '../lib/formatters';

function makeIdempotencyKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `kage_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

/* =========================================================
   1. NOTIFICATIONS PAGE
   ========================================================= */
export const NotificationsPage: React.FC = () => {
  const { user, refreshMe, subscribeWs } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [followedBackUids, setFollowedBackUids] = useState<Record<string, boolean>>({});

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await apiFetch<{ items: any[] }>('/api/notifications');
      setItems(res.items || []);
    } catch (err) {
      console.error('Failed to load notifications:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadNotifications();
  }, [loadNotifications]);

  useEffect(() => {
    return subscribeWs((msg) => {
      if (msg.type === 'notification:new') {
        loadNotifications();
      }
    });
  }, [subscribeWs, loadNotifications]);

  const handleMarkAllRead = async () => {
    try {
      await apiFetch('/api/notifications/read', { method: 'POST', body: JSON.stringify({}) });
      setItems((prev) => prev.map((n) => ({ ...n, isRead: true })));
      await refreshMe();
    } catch {
      // ignore
    }
  };

  const handleNotificationClick = async (n: any) => {
    if (!n.isRead) {
      apiFetch('/api/notifications/read', {
        method: 'POST',
        body: JSON.stringify({ notificationId: n.id }),
      })
        .then(() => refreshMe())
        .catch(() => {});
    }
    navigate(n.linkUrl || '/');
  };

  const handleFollowBack = async (e: React.MouseEvent, actorUid: string) => {
    e.stopPropagation();
    try {
      const res = await apiFetch(`/api/users/${actorUid}/follow`, { method: 'POST' });
      setFollowedBackUids((prev) => ({ ...prev, [actorUid]: res.following }));
    } catch {
      // ignore
    }
  };

  const now = Date.now();
  const todayItems = items.filter(
    (n) => now - new Date(n.createdAt).getTime() < 24 * 60 * 60 * 1000
  );
  const earlierItems = items.filter(
    (n) => now - new Date(n.createdAt).getTime() >= 24 * 60 * 60 * 1000
  );

  const renderGroup = (label: string, list: any[]) => {
    if (list.length === 0) return null;
    return (
      <div className="space-y-2.5">
        <h2 className="text-xs font-bold tracking-wider text-[#A7A0AA] px-1">{label}</h2>
        <div className="space-y-2">
          {list.map((n) => {
            const isAnnouncement = n.type === 'announcement';
            return (
              <div
                key={n.id}
                onClick={() => handleNotificationClick(n)}
                className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 cursor-pointer transition-colors ${
                  isAnnouncement
                    ? 'bg-gradient-to-r from-amber-500/15 via-[#141116] to-[#141116] border-amber-400/50 hover:border-amber-400/80'
                    : n.isRead
                      ? 'bg-[#141116]/70 border-white/6'
                      : 'bg-[#141116] border-[#6D28D9]/40'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div
                    className={`w-10 h-10 rounded-full overflow-hidden bg-[#09080B] shrink-0 ${
                      isAnnouncement ? 'border-2 border-amber-400' : 'border border-white/10'
                    }`}
                  >
                    <KageImage
                      src={n.actor?.avatarUrl || 'asset:avatar_default'}
                      alt={n.actor?.displayName || 'KAGE'}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="min-w-0">
                    {isAnnouncement && (
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Megaphone className="w-3 h-3 text-amber-400" />
                        <span className="text-[10px] font-bold tracking-wider text-amber-300">
                          Official Broadcast
                        </span>
                        <OwnerBadge role={n.actor?.role || 'owner'} size="xs" />
                      </div>
                    )}
                    <p className="text-xs sm:text-sm font-semibold text-[#F5F1F2] line-clamp-2">
                      {n.title}
                    </p>
                    {n.body && (
                      <p className="text-xs text-[#A7A0AA] line-clamp-2 mt-0.5">{n.body}</p>
                    )}
                  </div>
                </div>

                {n.type === 'follow' && n.actor?.uid && (
                  <button
                    type="button"
                    onClick={(e) => handleFollowBack(e, n.actor.uid)}
                    className="min-h-[36px] px-3.5 rounded-xl bg-[#6D28D9] hover:bg-[#7c3aed] text-white text-xs font-semibold whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {followedBackUids[n.actor.uid] ? 'Following' : 'Follow back'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  return (
    <div className="max-w-2xl mx-auto space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="min-h-[42px] min-w-[42px] -ml-2 flex items-center justify-center rounded-lg text-[#F5F1F2] hover:bg-white/5 cursor-pointer"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-xl sm:text-2xl font-bold text-[#F5F1F2]">Notifications</h1>
        </div>

        {items.some((i) => !i.isRead) && (
          <button
            type="button"
            onClick={handleMarkAllRead}
            className="min-h-[38px] px-3 rounded-xl bg-[#141116] border border-white/10 text-xs font-semibold text-[#A7A0AA] hover:text-white flex items-center gap-1.5 cursor-pointer"
          >
            <CheckCheck className="w-3.5 h-3.5 text-[#6D28D9]" />
            <span>Mark all read</span>
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-18 rounded-2xl bg-[#141116] animate-pulse" />
          ))}
        </div>
      ) : items.length === 0 ? (
        <div className="p-10 rounded-2xl bg-[#141116] border border-white/8 text-center space-y-2">
          <Bell className="w-8 h-8 text-[#6D28D9] mx-auto" />
          <p className="text-sm font-semibold text-[#F5F1F2]">All caught up</p>
          <p className="text-xs text-[#A7A0AA]">
            Replies, mentions, Clash invites, guild alerts, and KAGE LIVE invites appear here in real time.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {renderGroup('Today', todayItems)}
          {renderGroup('Earlier', earlierItems)}
        </div>
      )}
    </div>
  );
};

/* =========================================================
   2. INBOX / REAL-TIME DIRECT & SQUAD MESSAGING (IB-01..IB-13)
   ========================================================= */
export const InboxPage: React.FC = () => {
  const { user, subscribeWs, sendWsMessage, refreshMe } = useAuth();
  const navigate = useNavigate();
  const { conversationId: paramConvId } = useParams<{ conversationId?: string }>();
  const [searchParams, setSearchParams] = useSearchParams();

  const initialConvId = paramConvId
    ? Number(paramConvId)
    : searchParams.get('conv')
      ? Number(searchParams.get('conv'))
      : null;

  const [folder, setFolder] = useState<'active' | 'requests' | 'archived'>('active');
  const [counts, setCounts] = useState<{ active: number; requests: number; archived: number }>({
    active: 0,
    requests: 0,
    archived: 0,
  });
  const [conversations, setConversations] = useState<any[]>([]);
  const [hunters, setHunters] = useState<any[]>([]);
  const [filterText, setFilterText] = useState('');
  const [activeConvId, setActiveConvId] = useState<number | null>(
    initialConvId && !Number.isNaN(initialConvId) ? initialConvId : null
  );
  const [messages, setMessages] = useState<any[]>([]);
  const [hasMoreOlder, setHasMoreOlder] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [threadError, setThreadError] = useState('');
  const [msgInput, setMsgInput] = useState('');
  const [pendingMedia, setPendingMedia] = useState<{
    dataUrl: string;
    mediaType: 'image' | 'video';
    name: string;
  } | null>(null);
  const [stickerOpen, setStickerOpen] = useState(false);
  const [recentStickers, setRecentStickers] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  // Edit / delete message states
  const [editingMsgId, setEditingMsgId] = useState<number | null>(null);
  const [editingText, setEditingText] = useState('');
  const [confirmDeleteMsgId, setConfirmDeleteMsgId] = useState<number | null>(null);
  const [reportMsg, setReportMsg] = useState<{ id: number; label: string } | null>(null);

  // Live typing indicator
  const [peerTypingName, setPeerTypingName] = useState<string | null>(null);
  const lastTypingSentRef = useRef<number>(0);

  // New Squad / Chat Modal
  const [newChatOpen, setNewChatOpen] = useState(false);
  const [hunterSearch, setHunterSearch] = useState('');
  const [searchedHunters, setSearchedHunters] = useState<any[]>([]);
  const [selectedTargets, setSelectedTargets] = useState<string[]>([]);
  const [squadTitle, setSquadTitle] = useState('');
  const [chatActionError, setChatActionError] = useState('');

  // Fullscreen image preview inside DM
  const [expandedMediaUrl, setExpandedMediaUrl] = useState<string | null>(null);

  const bottomEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const nextId = paramConvId
      ? Number(paramConvId)
      : searchParams.get('conv')
        ? Number(searchParams.get('conv'))
        : null;
    if (nextId && !Number.isNaN(nextId)) {
      setActiveConvId(nextId);
    }
  }, [paramConvId, searchParams]);

  const loadInbox = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const res = await apiFetch<any>(`/api/inbox?folder=all`);
      const list = Array.isArray(res.conversations) ? res.conversations : [];
      setConversations(list);
      if (res.counts) setCounts(res.counts);
      setHunters(res.hunters || []);
    } catch (err) {
      console.error('Inbox load error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    loadInbox();
  }, [loadInbox]);

  const selectConversation = (convId: number | null) => {
    setActiveConvId(convId);
    setStickerOpen(false);
    setEditingMsgId(null);
    setThreadError('');
    if (convId) {
      setSearchParams({ conv: String(convId) }, { replace: true });
    } else {
      if (paramConvId) {
        navigate('/inbox', { replace: true });
      } else {
        setSearchParams({}, { replace: true });
      }
    }
  };

  const loadThreadMessages = useCallback(
    async (convId: number) => {
      setThreadError('');
      try {
        const res = await apiFetch<{
          messages: any[];
          hasMoreOlder: boolean;
          requestStatus: string;
        }>(`/api/inbox/${convId}/messages`);
        setMessages(res.messages || []);
        setHasMoreOlder(Boolean(res.hasMoreOlder));
        setConversations((prev) =>
          prev.map((c) => (c.id === convId ? { ...c, unreadCount: 0 } : c))
        );
        refreshMe().catch(() => {});
      } catch (err: any) {
        setMessages([]);
        setThreadError(err.message || 'You do not have access to this conversation.');
      }
    },
    [refreshMe]
  );

  useEffect(() => {
    if (activeConvId) {
      loadThreadMessages(activeConvId);
    }
  }, [activeConvId, loadThreadMessages]);

  useEffect(() => {
    bottomEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages.length, activeConvId]);

  // Search hunters inside New Chat modal
  useEffect(() => {
    if (!newChatOpen) return;
    const q = hunterSearch.trim();
    if (!q) {
      setSearchedHunters(hunters);
      return;
    }
    const timer = setTimeout(() => {
      apiFetch<{ items: any[] }>(`/api/users/search?q=${encodeURIComponent(q)}`)
        .then((res) => setSearchedHunters(res.items || []))
        .catch(() => setSearchedHunters([]));
    }, 220);
    return () => clearTimeout(timer);
  }, [hunterSearch, newChatOpen, hunters]);

  // Real-time WebSocket inbox events (message, delivered, read, edit, delete, typing)
  useEffect(() => {
    let typingTimeout: ReturnType<typeof setTimeout> | null = null;
    const unsub = subscribeWs((msg) => {
      if (msg.type === 'inbox:message' && msg.conversationId) {
        if (msg.conversationId === activeConvId) {
          setMessages((prev) => {
            if (msg.message?.id && prev.some((m) => m.id === msg.message.id)) {
              return prev;
            }
            return msg.message ? [...prev, msg.message] : prev;
          });
          loadThreadMessages(msg.conversationId);
        } else {
          if (msg.message?.id) {
            apiFetch(`/api/inbox/${msg.conversationId}/delivered`, {
              method: 'POST',
              body: JSON.stringify({ messageId: msg.message.id }),
            }).catch(() => {});
          }
          loadInbox();
        }
      }

      if (msg.type === 'inbox:delivered' && msg.conversationId === activeConvId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.messageId
              ? { ...m, deliveredAt: msg.deliveredAt || new Date().toISOString(), deliveryState: m.readAt ? 'read' : 'delivered' }
              : m
          )
        );
      }

      if (msg.type === 'inbox:read' && msg.conversationId === activeConvId) {
        const idSet = new Set<number>(Array.isArray(msg.messageIds) ? msg.messageIds : []);
        setMessages((prev) =>
          prev.map((m) =>
            idSet.has(m.id)
              ? { ...m, readAt: msg.readAt || new Date().toISOString(), deliveryState: 'read' }
              : m
          )
        );
      }

      if (msg.type === 'inbox:message-edited' && msg.conversationId === activeConvId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.messageId
              ? { ...m, content: msg.content, editedAt: msg.editedAt || new Date().toISOString() }
              : m
          )
        );
      }

      if (msg.type === 'inbox:message-deleted' && msg.conversationId === activeConvId) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.messageId
              ? {
                  ...m,
                  isDeleted: true,
                  content: '',
                  mediaUrl: null,
                  stickerId: null,
                }
              : m
          )
        );
      }

      if (
        msg.type === 'inbox:typing' &&
        msg.conversationId === activeConvId &&
        msg.uid !== user?.uid
      ) {
        if (msg.isTyping) {
          setPeerTypingName(msg.displayName || 'Hunter');
          if (typingTimeout) clearTimeout(typingTimeout);
          typingTimeout = setTimeout(() => setPeerTypingName(null), 3200);
        } else {
          setPeerTypingName(null);
        }
      }
    });

    return () => {
      if (typingTimeout) clearTimeout(typingTimeout);
      unsub();
    };
  }, [subscribeWs, activeConvId, loadThreadMessages, loadInbox, user?.uid]);

  const handleLoadOlder = async () => {
    if (!activeConvId || loadingOlder || messages.length === 0) return;
    const oldestId = messages[0]?.id;
    if (!oldestId) return;
    setLoadingOlder(true);
    try {
      const res = await apiFetch<{ messages: any[]; hasMoreOlder: boolean }>(
        `/api/inbox/${activeConvId}/messages?beforeId=${oldestId}&limit=35`
      );
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const older = (res.messages || []).filter((m) => !existingIds.has(m.id));
        return [...older, ...prev];
      });
      setHasMoreOlder(Boolean(res.hasMoreOlder));
    } catch {
      // ignore
    } finally {
      setLoadingOlder(false);
    }
  };

  const handleAttachMedia = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const isVideo = file.type.startsWith('video/');
    const maxBytes = isVideo ? 16 * 1024 * 1024 : 8 * 1024 * 1024;
    if (file.size > maxBytes) {
      setThreadError(
        isVideo ? 'Video attachment must be under 16 MB.' : 'Image attachment must be under 8 MB.'
      );
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setPendingMedia({
        dataUrl: String(reader.result || ''),
        mediaType: isVideo ? 'video' : 'image',
        name: file.name,
      });
      setThreadError('');
    };
    reader.readAsDataURL(file);
  };

  const dispatchMessage = async (opts?: { stickerId?: string }) => {
    if (!activeConvId || !user) return;
    const text = msgInput.trim();
    const stickerId = opts?.stickerId || null;
    const media = stickerId ? null : pendingMedia;

    if (!text && !stickerId && !media) return;

    const idempotencyKey = makeIdempotencyKey();
    const tempId = -Date.now();
    const optimisticMsg = {
      id: tempId,
      conversationId: activeConvId,
      senderUid: user.uid,
      senderUsername: user.username,
      senderDisplayName: user.username,
      content: stickerId ? '' : text,
      messageType: stickerId ? 'sticker' : media ? media.mediaType : 'text',
      stickerId,
      mediaUrl: media ? media.dataUrl : null,
      mediaMime: media?.mediaType === 'video' ? 'video/mp4' : media ? 'image/jpeg' : null,
      deliveryState: 'sending',
      createdAt: new Date().toISOString(),
    };

    if (!stickerId) {
      setMsgInput('');
      setPendingMedia(null);
    } else {
      setStickerOpen(false);
      setRecentStickers((prev) => [stickerId, ...prev.filter((s) => s !== stickerId)].slice(0, 8));
    }

    setSending(true);
    setThreadError('');
    setMessages((prev) => [...prev, optimisticMsg]);

    try {
      const res = await apiFetch<{ message: any }>(`/api/inbox/${activeConvId}/messages`, {
        method: 'POST',
        body: JSON.stringify({
          content: stickerId ? '' : text,
          stickerId,
          mediaDataUrl: media?.dataUrl || undefined,
          mediaType: media?.mediaType || undefined,
          idempotencyKey,
        }),
      });
      kageSound.play('msg_outgoing');
      setMessages((prev) => {
        const withoutTemp = prev.filter((m) => m.id !== tempId);
        if (withoutTemp.some((m) => m.id === res.message.id)) {
          return withoutTemp;
        }
        return [...withoutTemp, res.message];
      });
      loadInbox();
    } catch (err: any) {
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      if (!stickerId) setMsgInput(text);
      setThreadError(err.message || 'Could not send message.');
    } finally {
      setSending(false);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    await dispatchMessage();
  };

  const activeConv = conversations.find((c) => c.id === activeConvId) || null;

  const handleTypingChange = (val: string) => {
    setMsgInput(val);
    if (!activeConvId || !activeConv) return;
    const now = Date.now();
    if (now - lastTypingSentRef.current > 1800) {
      lastTypingSentRef.current = now;
      const recipientUids = (activeConv.participants || [])
        .map((p: any) => p.uid)
        .filter((uid: string) => uid && uid !== user?.uid);
      if (recipientUids.length > 0) {
        sendWsMessage({
          type: 'inbox:typing',
          conversationId: activeConvId,
          recipientUids,
          isTyping: val.trim().length > 0,
        });
      }
    }
  };

  const handleSaveEditMessage = async (msgId: number) => {
    if (!activeConvId || !editingText.trim()) return;
    try {
      const res = await apiFetch<{ message: any }>(
        `/api/inbox/${activeConvId}/messages/${msgId}`,
        {
          method: 'PATCH',
          body: JSON.stringify({ content: editingText.trim() }),
        }
      );
      setMessages((prev) => prev.map((m) => (m.id === msgId ? { ...m, ...res.message } : m)));
      setEditingMsgId(null);
      setEditingText('');
    } catch (err: any) {
      setThreadError(err.message || 'Could not edit message.');
    }
  };

  const handleDeleteMessage = async (msgId: number) => {
    if (!activeConvId) return;
    try {
      await apiFetch(`/api/inbox/${activeConvId}/messages/${msgId}`, { method: 'DELETE' });
      setMessages((prev) =>
        prev.map((m) =>
          m.id === msgId
            ? { ...m, isDeleted: true, content: '', mediaUrl: null, stickerId: null }
            : m
        )
      );
      setConfirmDeleteMsgId(null);
      loadInbox();
    } catch (err: any) {
      setThreadError(err.message || 'Could not delete message.');
    }
  };

  const handleRespondRequest = async (action: 'accept' | 'decline') => {
    if (!activeConvId) return;
    try {
      await apiFetch(`/api/inbox/${activeConvId}/request`, {
        method: 'POST',
        body: JSON.stringify({ action }),
      });
      await loadInbox();
      if (action === 'decline') {
        selectConversation(null);
      } else {
        setFolder('active');
        await loadThreadMessages(activeConvId);
      }
    } catch (err: any) {
      setThreadError(err.message || 'Failed to update message request.');
    }
  };

  const handleTogglePreference = async (patch: { isMuted?: boolean; isArchived?: boolean }) => {
    if (!activeConvId) return;
    try {
      await apiFetch(`/api/inbox/${activeConvId}/preferences`, {
        method: 'PATCH',
        body: JSON.stringify(patch),
      });
      await loadInbox();
    } catch (err: any) {
      setThreadError(err.message || 'Could not update conversation settings.');
    }
  };

  const handleStartQuickChat = async (targetUid: string) => {
    setChatActionError('');
    try {
      const res = await apiFetch('/api/inbox', {
        method: 'POST',
        body: JSON.stringify({ targetUids: [targetUid] }),
      });
      await loadInbox();
      selectConversation(res.conversation.id);
    } catch (err: any) {
      setThreadError(err.message || 'Could not open conversation.');
    }
  };

  const handleCreateSquadChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedTargets.length === 0) return;
    setChatActionError('');
    try {
      const res = await apiFetch('/api/inbox', {
        method: 'POST',
        body: JSON.stringify({
          targetUids: selectedTargets,
          title: squadTitle.trim() || undefined,
        }),
      });
      setNewChatOpen(false);
      setSelectedTargets([]);
      setSquadTitle('');
      setHunterSearch('');
      await loadInbox();
      selectConversation(res.conversation.id);
    } catch (err: any) {
      setChatActionError(err.message || 'Could not create conversation.');
    }
  };

  const visibleConversations = conversations.filter((c) => {
    const matchesSearch = String(c.displayTitle || '')
      .toLowerCase()
      .includes(filterText.trim().toLowerCase());
    if (!matchesSearch) return false;
    if (folder === 'archived') return Boolean(c.isArchived);
    if (c.isArchived) return false;
    const isIncomingPending =
      c.requestStatus === 'pending' && c.requestInitiatorUid && c.requestInitiatorUid !== user?.uid;
    if (folder === 'requests') return isIncomingPending;
    return !isIncomingPending;
  });

  const isPendingIncomingRequest =
    activeConv &&
    activeConv.requestStatus === 'pending' &&
    activeConv.requestInitiatorUid &&
    activeConv.requestInitiatorUid !== user?.uid;

  const isPendingOutgoingRequest =
    activeConv &&
    activeConv.requestStatus === 'pending' &&
    activeConv.requestInitiatorUid === user?.uid;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 min-h-[calc(100dvh-9rem)]">
      {/* Left Column: Inbox Folders, Search & Hunters */}
      <div
        className={`lg:col-span-5 space-y-4 ${
          activeConvId ? 'hidden lg:block' : 'block'
        }`}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => navigate(-1)}
              className="min-h-[42px] min-w-[42px] -ml-2 flex items-center justify-center text-[#F5F1F2] hover:bg-white/5 rounded-xl cursor-pointer"
              aria-label="Go back"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <h1 className="font-display text-xl sm:text-2xl font-bold tracking-wider text-[#F5F1F2]">
              INBOX
            </h1>
          </div>

          <button
            type="button"
            onClick={() => {
              setChatActionError('');
              setNewChatOpen(true);
            }}
            className="min-h-[38px] px-3.5 rounded-xl bg-[#6D28D9] hover:bg-[#7c3aed] text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Chat</span>
          </button>
        </div>

        {/* Folder Switcher: Active | Requests | Archived */}
        <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#141116] border border-white/8">
          {(
            [
              { id: 'active', label: 'Messages', count: counts.active },
              { id: 'requests', label: 'Requests', count: counts.requests },
              { id: 'archived', label: 'Archived', count: counts.archived },
            ] as const
          ).map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFolder(f.id)}
              className={`min-h-[34px] px-2 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                folder === f.id
                  ? 'bg-[#1C1720] text-[#F5F1F2] border border-[#6D28D9]/45'
                  : 'text-[#A7A0AA] hover:text-[#F5F1F2]'
              }`}
            >
              <span>{f.label}</span>
              {f.id === 'requests' && f.count > 0 && (
                <span className="font-mono-num text-[11px] text-[#C0263D] font-bold">
                  ({f.count})
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="w-4 h-4 text-[#A7A0AA] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={filterText}
            onChange={(e) => setFilterText(e.target.value)}
            placeholder="Filter conversations..."
            className="w-full min-h-[42px] rounded-xl bg-[#141116] border border-white/10 pl-10 pr-3 text-xs sm:text-sm text-[#F5F1F2] focus:outline-none focus:border-[#6D28D9]"
          />
        </div>

        {/* Active Hunters Strip */}
        {folder === 'active' && hunters.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-semibold text-[#A7A0AA]">Active Hunters</p>
            <div className="flex items-center gap-3 overflow-x-auto pb-1 no-scrollbar">
              {hunters.slice(0, 12).map((h) => (
                <button
                  key={h.uid}
                  type="button"
                  onClick={() => handleStartQuickChat(h.uid)}
                  className="flex flex-col items-center gap-1 shrink-0 w-18 cursor-pointer"
                >
                  <div
                    className={`relative w-12 h-12 rounded-full p-0.5 border-2 ${
                      h.role === 'owner' ? 'border-amber-400' : 'border-[#6D28D9]'
                    }`}
                  >
                    <KageImage
                      src={h.avatarUrl}
                      alt={h.displayName}
                      className="w-full h-full rounded-full object-cover"
                    />
                    {h.isOnline && (
                      <span className="absolute bottom-0 right-0 w-3 h-3 rounded-full bg-emerald-400 border-2 border-[#09080B]" />
                    )}
                  </div>
                  <span className="text-[11px] text-[#F5F1F2] truncate w-full text-center">
                    {h.displayName}
                  </span>
                  {h.role === 'owner' && <OwnerBadge role="owner" size="xs" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Conversations List */}
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-16 rounded-2xl bg-[#141116] animate-pulse" />
            ))}
          </div>
        ) : visibleConversations.length === 0 ? (
          <div className="p-8 rounded-2xl bg-[#141116] border border-white/8 text-center space-y-2">
            <MessageSquare className="w-7 h-7 text-[#6D28D9] mx-auto" />
            <p className="text-sm font-semibold text-[#F5F1F2]">
              {folder === 'requests'
                ? 'No pending message requests'
                : folder === 'archived'
                  ? 'No archived chats'
                  : 'No conversations yet'}
            </p>
            <p className="text-xs text-[#A7A0AA]">
              {folder === 'active'
                ? 'Select a hunter above or click New Chat to start a direct or squad conversation.'
                : 'Threads moved here will stay synced across all your sessions.'}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleConversations.map((c) => {
              const lastPreview = c.lastMessage?.isDeleted
                ? 'Message unsent'
                : c.lastMessage?.stickerId
                  ? 'Sent an anime sticker'
                  : c.lastMessage?.messageType === 'image'
                    ? 'Sent an image'
                    : c.lastMessage?.messageType === 'video'
                      ? 'Sent a video clip'
                      : c.lastMessage?.content || 'Say hello in KAGE...';

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectConversation(c.id)}
                  className={`w-full p-3.5 rounded-2xl border flex items-center justify-between gap-3 text-left transition-colors cursor-pointer ${
                    activeConvId === c.id
                      ? 'bg-[#141116] border-[#6D28D9]'
                      : 'bg-[#141116]/75 border-white/8 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="relative w-11 h-11 rounded-full overflow-hidden bg-[#09080B] shrink-0">
                      <KageImage
                        src={c.displayAvatar}
                        alt={c.displayTitle}
                        className="w-full h-full object-cover"
                      />
                      {c.peerOnline && (
                        <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-[#09080B]" />
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-bold text-[#F5F1F2] truncate">{c.displayTitle}</p>
                        {c.isMuted && <BellOff className="w-3 h-3 text-[#A7A0AA] shrink-0" />}
                      </div>
                      <p className="text-xs text-[#A7A0AA] truncate">{lastPreview}</p>
                    </div>
                  </div>
                  {c.unreadCount > 0 && (
                    <span className="min-w-[20px] h-5 px-1.5 rounded-full bg-[#C0263D] text-white text-[11px] font-mono-num font-bold flex items-center justify-center shrink-0">
                      {c.unreadCount}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Right Column: Active Chat Thread */}
      <div
        className={`lg:col-span-7 rounded-2xl bg-[#141116] border border-white/10 flex flex-col min-h-[500px] ${
          activeConvId ? 'flex' : 'hidden lg:flex'
        }`}
      >
        {!activeConvId ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center space-y-2">
            <MessageSquare className="w-9 h-9 text-[#A7A0AA]" />
            <p className="text-sm font-semibold text-[#F5F1F2]">Select a conversation</p>
            <p className="text-xs text-[#A7A0AA]">
              Direct messages, media, anime stickers, and read receipts sync live via WebSockets.
            </p>
          </div>
        ) : (
          <>
            {/* Thread Header */}
            <div className="h-14 px-4 border-b border-white/8 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 min-w-0">
                <button
                  type="button"
                  onClick={() => selectConversation(null)}
                  className="lg:hidden min-h-[38px] min-w-[38px] -ml-1 flex items-center justify-center text-[#F5F1F2] cursor-pointer"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>
                {activeConv?.peerUsername ? (
                  <Link
                    to={`/profile/${activeConv.peerUsername}`}
                    className="flex items-center gap-2.5 min-w-0 hover:opacity-90"
                  >
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-[#09080B] shrink-0">
                      <KageImage
                        src={activeConv.displayAvatar}
                        alt={activeConv.displayTitle}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#F5F1F2] truncate">
                        {activeConv.displayTitle}
                      </p>
                      <p className="text-[11px] text-[#A7A0AA] truncate">
                        {peerTypingName
                          ? `${peerTypingName} is typing...`
                          : `@${activeConv.peerUsername}`}
                      </p>
                    </div>
                  </Link>
                ) : (
                  <div className="min-w-0">
                    <span className="text-sm font-bold text-[#F5F1F2] block truncate">
                      {activeConv?.displayTitle || 'Conversation'}
                    </span>
                    {peerTypingName && (
                      <span className="text-[11px] text-[#6D28D9] block truncate">
                        {peerTypingName} is typing...
                      </span>
                    )}
                  </div>
                )}
              </div>

              {activeConv && (
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => handleTogglePreference({ isMuted: !activeConv.isMuted })}
                    title={activeConv.isMuted ? 'Unmute conversation' : 'Mute conversation'}
                    className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-[#A7A0AA] hover:text-white hover:bg-white/5 cursor-pointer"
                  >
                    {activeConv.isMuted ? (
                      <BellOff className="w-4 h-4 text-[#C0263D]" />
                    ) : (
                      <Bell className="w-4 h-4" />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => handleTogglePreference({ isArchived: !activeConv.isArchived })}
                    title={activeConv.isArchived ? 'Move back to Inbox' : 'Archive conversation'}
                    className="min-h-[36px] min-w-[36px] rounded-lg flex items-center justify-center text-[#A7A0AA] hover:text-white hover:bg-white/5 cursor-pointer"
                  >
                    <Archive
                      className={`w-4 h-4 ${activeConv.isArchived ? 'text-[#6D28D9]' : ''}`}
                    />
                  </button>
                </div>
              )}
            </div>

            {/* Message Request Banner */}
            {isPendingIncomingRequest && (
              <div className="px-4 py-3 bg-[#09080B] border-b border-white/10 flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs text-[#A7A0AA]">
                  <span className="font-semibold text-[#F5F1F2]">Message Request</span> · Accept to move this conversation into your Inbox and enable full chat.
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleRespondRequest('decline')}
                    className="min-h-[34px] px-3 rounded-lg bg-[#141116] border border-white/12 text-xs text-[#A7A0AA] hover:text-white cursor-pointer"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRespondRequest('accept')}
                    className="min-h-[34px] px-3.5 rounded-lg bg-[#6D28D9] hover:bg-[#7c3aed] text-xs font-semibold text-white flex items-center gap-1 cursor-pointer"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Accept</span>
                  </button>
                </div>
              </div>
            )}

            {isPendingOutgoingRequest && (
              <div className="px-4 py-2 bg-[#09080B]/70 border-b border-white/8 text-[11px] text-[#A7A0AA]">
                Message request sent. Full read receipts activate once accepted.
              </div>
            )}

            {threadError && (
              <div className="mx-4 mt-3 p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 flex items-center justify-between">
                <span>{threadError}</span>
                <button
                  type="button"
                  onClick={() => setThreadError('')}
                  className="text-rose-200 hover:text-white cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Message Stream */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 max-h-[58dvh]">
              {hasMoreOlder && (
                <div className="flex justify-center pb-2">
                  <button
                    type="button"
                    onClick={handleLoadOlder}
                    disabled={loadingOlder}
                    className="min-h-[34px] px-3.5 rounded-lg bg-[#09080B] border border-white/10 text-xs font-medium text-[#A7A0AA] hover:text-[#F5F1F2] cursor-pointer"
                  >
                    {loadingOlder ? 'Loading earlier...' : 'Load earlier messages'}
                  </button>
                </div>
              )}

              {messages.length === 0 ? (
                <p className="text-xs text-[#A7A0AA] text-center py-8">
                  Send a message, image, video clip, or KAGE anime sticker below.
                </p>
              ) : (
                messages.map((m) => {
                  const mine = m.senderUid === user?.uid;
                  const isStickerOnly = Boolean(m.stickerId) && !m.content && !m.isDeleted;

                  return (
                    <div
                      key={m.id}
                      className={`group flex flex-col ${mine ? 'items-end' : 'items-start'}`}
                    >
                      {!mine && (
                        <div className="flex items-center gap-1.5 mb-0.5 px-1">
                          <span className="text-[10px] text-[#A7A0AA]">
                            {m.senderDisplayName || `@${m.senderUsername}`}
                          </span>
                          <OwnerBadge role={m.senderRole} size="xs" />
                        </div>
                      )}

                      {m.isDeleted ? (
                        <div className="px-3.5 py-2 rounded-2xl bg-[#09080B]/70 border border-white/8 text-xs italic text-[#A7A0AA]">
                          Message unsent
                        </div>
                      ) : editingMsgId === m.id ? (
                        <div className="w-full max-w-[82%] p-2.5 rounded-2xl bg-[#09080B] border border-[#6D28D9] space-y-2">
                          <input
                            type="text"
                            value={editingText}
                            onChange={(e) => setEditingText(e.target.value)}
                            className="w-full min-h-[36px] rounded-lg bg-[#141116] border border-white/10 px-2.5 text-xs text-[#F5F1F2] focus:outline-none"
                          />
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setEditingMsgId(null)}
                              className="px-2.5 py-1 rounded-md text-[11px] text-[#A7A0AA] cursor-pointer"
                            >
                              Cancel
                            </button>
                            <button
                              type="button"
                              onClick={() => handleSaveEditMessage(m.id)}
                              className="px-3 py-1 rounded-md bg-[#6D28D9] text-[11px] font-semibold text-white cursor-pointer"
                            >
                              Save
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="max-w-[80%] space-y-1">
                          {isStickerOnly ? (
                            <KageStickerGraphic stickerId={m.stickerId} size={96} />
                          ) : (
                            <div
                              className={`px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm space-y-2 ${
                                mine
                                  ? 'bg-[#6D28D9] text-white rounded-br-sm'
                                  : 'bg-[#09080B] border border-white/10 text-[#F5F1F2] rounded-bl-sm'
                              }`}
                            >
                              {m.stickerId && (
                                <KageStickerGraphic stickerId={m.stickerId} size={84} />
                              )}

                              {m.mediaUrl &&
                                (m.messageType === 'video' ||
                                String(m.mediaMime || '').startsWith('video/') ? (
                                  <video
                                    src={m.mediaUrl}
                                    controls
                                    playsInline
                                    preload="metadata"
                                    className="max-h-64 rounded-xl bg-black w-full"
                                  />
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setExpandedMediaUrl(m.mediaUrl)}
                                    className="block rounded-xl overflow-hidden max-h-64 cursor-pointer"
                                  >
                                    <KageImage
                                      src={m.mediaUrl}
                                      alt="Attachment"
                                      className="max-h-64 w-auto object-contain rounded-xl"
                                    />
                                  </button>
                                ))}

                              {m.content && (
                                <p className="whitespace-pre-line break-words">{m.content}</p>
                              )}
                            </div>
                          )}

                          {/* Metadata & Actions Row */}
                          <div
                            className={`flex items-center gap-2 text-[10px] text-[#A7A0AA] px-1 ${
                              mine ? 'justify-end' : 'justify-start'
                            }`}
                          >
                            {m.editedAt && <span>edited</span>}
                            {mine && m.id > 0 && (
                              <span className="inline-flex items-center gap-0.5">
                                {m.readAt || m.deliveryState === 'read' ? (
                                  <>
                                    <CheckCheck className="w-3 h-3 text-emerald-400" />
                                    <span className="text-emerald-400">Read</span>
                                  </>
                                ) : m.deliveredAt || m.deliveryState === 'delivered' ? (
                                  <>
                                    <CheckCheck className="w-3 h-3" />
                                    <span>Delivered</span>
                                  </>
                                ) : (
                                  <>
                                    <Check className="w-3 h-3" />
                                    <span>Sent</span>
                                  </>
                                )}
                              </span>
                            )}
                            {mine && m.id < 0 && <span>Sending...</span>}

                            {mine && m.id > 0 && (
                              <div className="opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity flex items-center gap-1.5">
                                {m.content && !m.stickerId && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingMsgId(m.id);
                                      setEditingText(m.content);
                                    }}
                                    className="hover:text-white cursor-pointer"
                                    title="Edit message"
                                  >
                                    <Edit3 className="w-3 h-3" />
                                  </button>
                                )}
                                {confirmDeleteMsgId === m.id ? (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteMessage(m.id)}
                                    className="text-rose-400 font-semibold cursor-pointer"
                                  >
                                    Unsend?
                                  </button>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteMsgId(m.id)}
                                    className="hover:text-rose-400 cursor-pointer"
                                    title="Unsend message"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                )}
                              </div>
                            )}

                            {!mine && m.id > 0 && (
                              <button
                                type="button"
                                onClick={() =>
                                  setReportMsg({
                                    id: m.id,
                                    label: `message from @${m.senderUsername}`,
                                  })
                                }
                                className="opacity-0 group-hover:opacity-100 transition-opacity hover:text-[#C0263D] cursor-pointer"
                                title="Report message"
                              >
                                <Flag className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
              <div ref={bottomEndRef} />
            </div>

            {/* Pending Media Preview */}
            {pendingMedia && (
              <div className="px-4 py-2 border-t border-white/8 bg-[#09080B]/70 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0 text-xs text-[#F5F1F2]">
                  <ImageIcon className="w-4 h-4 text-[#6D28D9] shrink-0" />
                  <span className="truncate">{pendingMedia.name}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPendingMedia(null)}
                  className="text-xs text-rose-400 hover:underline cursor-pointer"
                >
                  Remove
                </button>
              </div>
            )}

            {/* Rich Message Composer */}
            <form
              onSubmit={handleSendMessage}
              className="relative p-3 border-t border-white/8 flex items-center gap-2"
            >
              {stickerOpen && (
                <div className="absolute bottom-16 left-3 z-40">
                  <AnimeStickerPicker
                    isOpen={stickerOpen}
                    onClose={() => setStickerOpen(false)}
                    recentIds={recentStickers}
                    align="left"
                    onSelectSticker={(stickerId) => {
                      dispatchMessage({ stickerId });
                    }}
                  />
                </div>
              )}

              <button
                type="button"
                onClick={() => setStickerOpen((v) => !v)}
                aria-label="Open anime stickers"
                className={`min-h-[42px] min-w-[40px] rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                  stickerOpen
                    ? 'bg-[#C0263D]/20 border-[#C0263D] text-white'
                    : 'bg-[#09080B] border-white/10 text-[#A7A0AA] hover:text-white'
                }`}
              >
                <Smile className="w-4 h-4" />
              </button>

              <label
                className="min-h-[42px] min-w-[40px] rounded-xl bg-[#09080B] border border-white/10 flex items-center justify-center text-[#A7A0AA] hover:text-white cursor-pointer"
                title="Attach image or video"
              >
                <ImageIcon className="w-4 h-4" />
                <input
                  type="file"
                  accept="image/*,video/mp4,video/webm"
                  onChange={handleAttachMedia}
                  className="hidden"
                />
              </label>

              <input
                type="text"
                value={msgInput}
                onChange={(e) => handleTypingChange(e.target.value)}
                placeholder={
                  isPendingIncomingRequest
                    ? 'Accept request above or reply to accept...'
                    : 'Write a message...'
                }
                className="flex-1 min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 px-3.5 text-sm text-[#F5F1F2] focus:outline-none focus:border-[#6D28D9]"
              />
              <button
                type="submit"
                disabled={sending || (!msgInput.trim() && !pendingMedia)}
                className="min-h-[42px] px-4 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] disabled:opacity-50 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Send className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
          </>
        )}
      </div>

      {/* Fullscreen DM Image Viewer */}
      {expandedMediaUrl && (
        <div
          onClick={() => setExpandedMediaUrl(null)}
          className="fixed inset-0 z-50 bg-black/90 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <button
            type="button"
            onClick={() => setExpandedMediaUrl(null)}
            className="absolute top-4 right-4 min-h-[44px] min-w-[44px] rounded-xl bg-[#141116] border border-white/15 flex items-center justify-center text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
          <img
            src={expandedMediaUrl}
            alt="Full attachment"
            onClick={(e) => e.stopPropagation()}
            className="max-h-[88dvh] max-w-[92vw] object-contain rounded-xl"
          />
        </div>
      )}

      {/* New Chat / Squad Modal */}
      <KageModal
        isOpen={newChatOpen}
        onClose={() => setNewChatOpen(false)}
        title="Start Direct or Squad Chat"
        maxWidthClass="max-w-md"
        footer={
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setNewChatOpen(false)}
              className="min-h-[42px] px-4 rounded-xl bg-[#09080B] border border-white/10 text-xs text-[#A7A0AA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="inbox-new-chat-form"
              disabled={selectedTargets.length === 0}
              className="min-h-[42px] px-5 rounded-xl bg-[#6D28D9] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
            >
              Open Chat
            </button>
          </div>
        }
      >
        <form id="inbox-new-chat-form" onSubmit={handleCreateSquadChat} className="space-y-4">
          <div className="relative">
            <Search className="w-4 h-4 text-[#A7A0AA] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={hunterSearch}
              onChange={(e) => setHunterSearch(e.target.value)}
              placeholder="Search hunters by @username, name, or KAGE ID..."
              className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/10 pl-9 pr-3 text-xs text-[#F5F1F2] focus:outline-none focus:border-[#6D28D9]"
            />
          </div>

          {selectedTargets.length > 1 && (
            <div>
              <label className="block text-xs text-[#A7A0AA] mb-1">Squad Name</label>
              <input
                type="text"
                value={squadTitle}
                onChange={(e) => setSquadTitle(e.target.value)}
                placeholder="e.g., Raid Party"
                className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2]"
              />
            </div>
          )}

          <div className="max-h-60 overflow-y-auto divide-y divide-white/8">
            {searchedHunters.length === 0 ? (
              <p className="text-xs text-[#A7A0AA] py-6 text-center">
                No matching hunters found.
              </p>
            ) : (
              searchedHunters.map((h) => {
                const checked = selectedTargets.includes(h.uid);
                return (
                  <label
                    key={h.uid}
                    className="py-2.5 flex items-center justify-between cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-[#09080B] shrink-0">
                        <KageImage
                          src={h.avatarUrl}
                          alt={h.displayName}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-semibold text-[#F5F1F2] truncate">
                            {h.displayName}
                          </p>
                          <OwnerBadge role={h.role} size="xs" />
                        </div>
                        <p className="text-[11px] text-[#A7A0AA] truncate">
                          @{h.username}
                          {h.kageId ? ` · ${h.kageId}` : ''}
                        </p>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() =>
                        setSelectedTargets((prev) =>
                          prev.includes(h.uid)
                            ? prev.filter((id) => id !== h.uid)
                            : [...prev, h.uid]
                        )
                      }
                      className="accent-[#6D28D9] w-4 h-4 shrink-0"
                    />
                  </label>
                );
              })
            )}
          </div>

          {chatActionError && <p className="text-xs text-rose-400">{chatActionError}</p>}
        </form>
      </KageModal>

      {reportMsg && (
        <ReportModal
          isOpen={Boolean(reportMsg)}
          onClose={() => setReportMsg(null)}
          targetType="message"
          targetId={reportMsg.id}
          targetLabel={reportMsg.label}
        />
      )}
    </div>
  );
};

/* =========================================================
   3. UNIFIED SEARCH PAGE — ANIME + PEOPLE (@USERNAME OR USER ID)
   ========================================================= */
export const SearchPage: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [genre, setGenre] = useState(searchParams.get('genre') || '');
  const [filter, setFilter] = useState(searchParams.get('filter') || '');
  const [year, setYear] = useState(searchParams.get('year') || '');
  const [format, setFormat] = useState(searchParams.get('format') || '');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [sort, setSort] = useState(searchParams.get('sort') || 'popularity');
  const [showAdvanced, setShowAdvanced] = useState(
    Boolean(
      searchParams.get('year') ||
        searchParams.get('format') ||
        searchParams.get('status') ||
        (searchParams.get('sort') && searchParams.get('sort') !== 'popularity')
    )
  );
  const [tab, setTab] = useState<'all' | 'anime' | 'people' | 'guilds' | 'discussions' | 'voice'>(
    'all'
  );
  const [results, setResults] = useState<{
    queryKind: string;
    isExplicitPersonQuery: boolean;
    anime: any[];
    people: any[];
    communities: any[];
    discussions: any[];
    voiceRooms: any[];
  }>({
    queryKind: 'empty',
    isExplicitPersonQuery: false,
    anime: [],
    people: [],
    communities: [],
    discussions: [],
    voiceRooms: [],
  });
  const [animePageInfo, setAnimePageInfo] = useState<{
    currentPage: number;
    hasNextPage: boolean;
    total: number | null;
    totalEstablished?: boolean;
  }>({
    currentPage: 1,
    hasNextPage: false,
    total: null,
    totalEstablished: false,
  });
  const [loading, setLoading] = useState(true);
  const [loadingMoreAnime, setLoadingMoreAnime] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);
  const activeQueryKeyRef = useRef<string>('');

  // Keep input synced if user navigates from header search box
  useEffect(() => {
    const incomingQ = searchParams.get('q') || '';
    setQuery((prev) => (prev !== incomingQ ? incomingQ : prev));
  }, [searchParams]);

  const buildFilterParams = useCallback(
    (pageNum = 1) => {
      const params = new URLSearchParams();
      if (query.trim()) params.set('q', query.trim());
      if (genre) params.set('genre', genre);
      if (filter) params.set('filter', filter);
      if (year) params.set('year', year);
      if (format) params.set('format', format);
      if (status) params.set('status', status);
      if (sort && sort !== 'popularity') params.set('sort', sort);
      if (pageNum > 1) params.set('page', String(pageNum));
      return params;
    },
    [query, genre, filter, year, format, status, sort]
  );

  useEffect(() => {
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const urlParams = buildFilterParams(1);
      const queryKey = urlParams.toString();
      activeQueryKeyRef.current = queryKey;
      setSearchParams(urlParams, { replace: true });
      setLoading(true);
      setSearchError(null);

      apiFetch<any>(`/api/search?${queryKey}`, { signal: controller.signal })
        .then((res) => {
          if (controller.signal.aborted || activeQueryKeyRef.current !== queryKey) return;
          const peopleList = Array.isArray(res.people)
            ? res.people
            : Array.isArray(res.users)
              ? res.users
              : [];
          setResults({
            queryKind: res.queryKind || 'general',
            isExplicitPersonQuery: Boolean(res.isExplicitPersonQuery),
            anime: Array.isArray(res.anime) ? res.anime : [],
            people: peopleList,
            communities: Array.isArray(res.communities) ? res.communities : [],
            discussions: Array.isArray(res.discussions) ? res.discussions : [],
            voiceRooms: Array.isArray(res.voiceRooms) ? res.voiceRooms : [],
          });
          setAnimePageInfo(
            res.animePageInfo || {
              currentPage: 1,
              hasNextPage: false,
              total: null,
              totalEstablished: false,
            }
          );
        })
        .catch((err: any) => {
          if (controller.signal.aborted || err?.name === 'AbortError') return;
          setSearchError(err?.message || 'Unable to reach search service.');
        })
        .finally(() => {
          if (!controller.signal.aborted && activeQueryKeyRef.current === queryKey) {
            setLoading(false);
          }
        });
    }, 240);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [buildFilterParams, setSearchParams, retryNonce]);

  const handleLoadMoreAnime = async () => {
    if (loadingMoreAnime || !animePageInfo.hasNextPage) return;
    const nextPage = (animePageInfo.currentPage || 1) + 1;
    const expectedKey = activeQueryKeyRef.current;
    setLoadingMoreAnime(true);
    try {
      const params = buildFilterParams(nextPage);
      const res = await apiFetch<any>(`/api/realms/search?${params.toString()}`);
      if (activeQueryKeyRef.current !== expectedKey) return;
      const incoming = Array.isArray(res.items)
        ? res.items.map((item: any) => ({ ...item, malId: item.canonicalId || item.malId }))
        : [];
      setResults((prev) => {
        const seen = new Set(prev.anime.map((a: any) => a.canonicalId || a.malId));
        const merged = [...prev.anime];
        for (const item of incoming) {
          const id = item.canonicalId || item.malId;
          if (!seen.has(id)) {
            seen.add(id);
            merged.push(item);
          }
        }
        return { ...prev, anime: merged };
      });
      setAnimePageInfo(
        res.pageInfo || {
          currentPage: nextPage,
          hasNextPage: false,
          total: null,
          totalEstablished: false,
        }
      );
    } catch {
      // keep existing items intact
    } finally {
      setLoadingMoreAnime(false);
    }
  };

  const handleResetFilters = () => {
    setQuery('');
    setGenre('');
    setFilter('');
    setYear('');
    setFormat('');
    setStatus('');
    setSort('popularity');
    setTab('all');
  };

  const hasActiveFilters = Boolean(
    query.trim() || genre || filter || year || format || status || sort !== 'popularity'
  );
  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: 38 }, (_, i) => currentYear + 1 - i);
  const quickGenres = ALL_GENRE_NAMES;

  const animeCountLabel =
    animePageInfo.total !== null && animePageInfo.total !== undefined
      ? formatCompactNumber(animePageInfo.total)
      : formatCompactNumber(results.anime.length);

  const renderPeopleSection = (showHeading = true) => (
    <section aria-label="People search results" className="space-y-3">
      {showHeading && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-[#6D28D9]" />
            <h2 className="text-sm sm:text-base font-bold text-[#F5F1F2]">People</h2>
            <span className="text-xs text-[#A7A0AA] font-mono-num">
              · {results.people.length}
            </span>
          </div>
          <span className="text-[11px] text-[#A7A0AA]">
            Exact @username or KAGE ID
          </span>
        </div>
      )}

      {results.people.length === 0 ? (
        <div className="p-5 rounded-2xl bg-[#141116] border border-white/8 text-xs text-[#A7A0AA]">
          {results.isExplicitPersonQuery ? (
            <p>
              No registered KAGE user matched{' '}
              <span className="text-[#F5F1F2] font-semibold">{query.trim()}</span>. Double-check the
              exact <span className="text-[#F5F1F2]">@username</span> (e.g.{' '}
              <span className="text-[#F5F1F2]">@yaseen</span>) or unique{' '}
              <span className="text-[#F5F1F2]">KAGE ID</span> (e.g.{' '}
              <span className="text-[#F5F1F2]">KAGE-00000001</span>).
            </p>
          ) : (
            <p>
              To find a specific person, enter their exact{' '}
              <span className="text-[#F5F1F2] font-semibold">@username</span> (such as{' '}
              <span className="text-[#F5F1F2]">@yaseen</span>) or unique{' '}
              <span className="text-[#F5F1F2] font-semibold">KAGE ID</span>.
            </p>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {results.people.map((u: any) => (
            <Link
              key={u.uid}
              to={`/profile/${u.username}`}
              className={`p-3.5 rounded-2xl bg-[#141116] border flex items-center justify-between gap-3 transition-colors ${
                u.role === 'owner'
                  ? 'border-amber-400/50 hover:border-amber-400/80'
                  : 'border-white/10 hover:border-[#6D28D9]'
              }`}
            >
              <div className="flex items-center gap-3 min-w-0">
                <div
                  className={`relative w-12 h-12 rounded-full overflow-hidden bg-[#09080B] shrink-0 ${
                    u.role === 'owner' ? 'border-2 border-amber-400' : 'border border-white/12'
                  }`}
                >
                  <KageImage
                    src={u.avatarUrl}
                    alt={u.displayName}
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-sm font-bold text-[#F5F1F2] truncate">{u.displayName}</p>
                    <OwnerBadge role={u.role} size="xs" />
                  </div>
                  <p className="text-xs text-[#A7A0AA] truncate">
                    @{u.username}
                    {u.kageId ? ` · ${u.kageId}` : ''}
                  </p>
                  {u.bio && (
                    <p className="text-[11px] text-[#A7A0AA] line-clamp-1 mt-0.5">{u.bio}</p>
                  )}
                </div>
              </div>
              <span className="text-xs font-semibold text-[#6D28D9] shrink-0">View Profile</span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );

  const renderAnimeSection = (showHeading = true) => (
    <section aria-label="Anime search results" className="space-y-4">
      {showHeading && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <h2 className="text-sm sm:text-base font-bold text-[#F5F1F2]">Anime</h2>
            <span className="text-xs text-[#A7A0AA] font-mono-num">· {animeCountLabel}</span>
          </div>
          {query.trim() && !results.isExplicitPersonQuery && (
            <span className="text-[11px] text-[#A7A0AA]">Matching anime titles</span>
          )}
        </div>
      )}

      {results.anime.length === 0 ? (
        <div className="py-10 px-4 rounded-2xl bg-[#141116] border border-white/8 text-center space-y-2.5">
          <p className="text-sm font-semibold text-[#F5F1F2]">
            {results.isExplicitPersonQuery
              ? 'Direct @username / User ID lookup active'
              : query.trim() || hasActiveFilters
                ? 'No anime matched your search criteria.'
                : 'Search for an anime title or choose a genre filter above'}
          </p>
          <p className="text-xs text-[#A7A0AA] max-w-md mx-auto">
            {results.isExplicitPersonQuery
              ? 'Remove the @ prefix or KAGE ID to search anime titles across KAGE.'
              : 'Enter any partial anime title (English, Romaji, or Japanese), or search @username / KAGE ID for registered people.'}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="min-h-[38px] px-4 rounded-lg bg-[#C0263D] text-white text-xs font-semibold cursor-pointer"
            >
              Reset Search & Filters
            </button>
          )}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5 sm:gap-4">
            {results.anime.map((a: any) => (
              <AnimePosterCard
                key={a.canonicalId || a.malId}
                anime={a}
                showSubtitle
              />
            ))}
          </div>

          {animePageInfo.hasNextPage && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={handleLoadMoreAnime}
                disabled={loadingMoreAnime}
                className="min-h-[44px] px-6 rounded-xl bg-[#141116] hover:bg-[#1C1720] border border-white/15 text-xs sm:text-sm font-semibold text-[#F5F1F2] inline-flex items-center gap-2 disabled:opacity-60 cursor-pointer transition-colors"
              >
                {loadingMoreAnime && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>{loadingMoreAnime ? 'Loading More...' : 'Load More Anime'}</span>
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );

  return (
    <div className="space-y-5">
      {/* Unified Search Box Header (Anime + People from the same input field) */}
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => navigate(-1)}
          aria-label="Go back"
          className="min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-lg text-[#F5F1F2] hover:bg-white/5 cursor-pointer"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-[#A7A0AA] absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search anime titles, @username (e.g. @yaseen), or KAGE ID..."
            aria-label="Search anime or people"
            className="w-full min-h-[46px] rounded-xl bg-[#141116] border border-white/15 pl-10 pr-9 text-sm text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search query"
              className="min-h-[36px] min-w-[36px] flex items-center justify-center absolute right-1.5 top-1/2 -translate-y-1/2 text-[#A7A0AA] hover:text-white cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          aria-expanded={showAdvanced}
          className={`min-h-[46px] px-3.5 rounded-xl border text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
            showAdvanced || year || format || status || sort !== 'popularity'
              ? 'bg-[#1C1720] border-[#C0263D] text-[#F5F1F2]'
              : 'bg-[#141116] border-white/15 text-[#A7A0AA] hover:text-[#F5F1F2]'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden sm:inline">Filters</span>
        </button>
      </div>

      {/* Quick Genre & Upcoming Filter Controls */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
        <button
          type="button"
          onClick={handleResetFilters}
          className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold border whitespace-nowrap shrink-0 cursor-pointer ${
            !hasActiveFilters
              ? 'bg-[#C0263D] border-[#C0263D] text-white'
              : 'bg-[#141116] border-white/10 text-[#A7A0AA] hover:text-[#F5F1F2]'
          }`}
        >
          All Realms
        </button>
        <button
          type="button"
          onClick={() => {
            setFilter(filter === 'upcoming' ? '' : 'upcoming');
            if (filter !== 'upcoming') setStatus('');
            setTab('anime');
          }}
          className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold border whitespace-nowrap shrink-0 cursor-pointer ${
            filter === 'upcoming'
              ? 'bg-[#6D28D9] border-[#6D28D9] text-white'
              : 'bg-[#141116] border-white/10 text-[#A7A0AA] hover:text-[#F5F1F2]'
          }`}
        >
          Upcoming
        </button>
        {quickGenres.map((g) => (
          <button
            key={g}
            type="button"
            onClick={() => {
              setGenre(genre === g ? '' : g);
              setTab('anime');
            }}
            className={`min-h-[36px] px-3.5 rounded-lg text-xs font-semibold border whitespace-nowrap shrink-0 cursor-pointer ${
              genre === g
                ? 'bg-[#C0263D] border-[#C0263D] text-white'
                : 'bg-[#141116] border-white/10 text-[#A7A0AA] hover:text-[#F5F1F2]'
            }`}
          >
            {g}
          </button>
        ))}
      </div>

      {/* Expandable Catalog Refinement Controls */}
      {showAdvanced && (
        <div className="p-4 rounded-2xl bg-[#141116] border border-white/10 grid grid-cols-2 sm:grid-cols-4 gap-3">
          <label className="space-y-1 text-xs text-[#A7A0AA]">
            <span className="font-medium text-[#F5F1F2]">Release Year</span>
            <select
              value={year}
              onChange={(e) => {
                setYear(e.target.value);
                setTab('anime');
              }}
              className="w-full min-h-[40px] rounded-lg bg-[#09080B] border border-white/12 px-2.5 text-xs text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
            >
              <option value="">Any year</option>
              {yearOptions.map((y) => (
                <option key={y} value={String(y)}>
                  {y}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1 text-xs text-[#A7A0AA]">
            <span className="font-medium text-[#F5F1F2]">Format</span>
            <select
              value={format}
              onChange={(e) => {
                setFormat(e.target.value);
                setTab('anime');
              }}
              className="w-full min-h-[40px] rounded-lg bg-[#09080B] border border-white/12 px-2.5 text-xs text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
            >
              <option value="">All formats</option>
              <option value="TV">TV Series</option>
              <option value="MOVIE">Movie</option>
              <option value="OVA">OVA</option>
              <option value="ONA">ONA</option>
              <option value="SPECIAL">Special</option>
            </select>
          </label>

          <label className="space-y-1 text-xs text-[#A7A0AA]">
            <span className="font-medium text-[#F5F1F2]">Airing Status</span>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                if (e.target.value) setFilter('');
                setTab('anime');
              }}
              className="w-full min-h-[40px] rounded-lg bg-[#09080B] border border-white/12 px-2.5 text-xs text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
            >
              <option value="">Any status</option>
              <option value="RELEASING">Currently Airing</option>
              <option value="FINISHED">Completed</option>
              <option value="NOT_YET_RELEASED">Upcoming</option>
            </select>
          </label>

          <label className="space-y-1 text-xs text-[#A7A0AA]">
            <span className="font-medium text-[#F5F1F2]">Sort By</span>
            <select
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setTab('anime');
              }}
              className="w-full min-h-[40px] rounded-lg bg-[#09080B] border border-white/12 px-2.5 text-xs text-[#F5F1F2] focus:outline-none focus:border-[#C0263D]"
            >
              <option value="popularity">Popularity</option>
              <option value="rating">Highest Rated</option>
              <option value="newest">Recently Released</option>
              <option value="oldest">Oldest Released</option>
              <option value="title">Title (A–Z)</option>
            </select>
          </label>
        </div>
      )}

      {/* Result Section Tabs */}
      <div className="flex items-center gap-5 overflow-x-auto border-b border-white/10 text-xs sm:text-sm no-scrollbar">
        {(
          [
            { id: 'all', label: 'All Results' },
            { id: 'anime', label: `Anime (${animeCountLabel})` },
            { id: 'people', label: `People (${results.people.length})` },
            { id: 'guilds', label: `Guilds (${results.communities.length})` },
            { id: 'discussions', label: `Posts (${results.discussions.length})` },
            { id: 'voice', label: `Voice (${results.voiceRooms.length})` },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`min-h-[42px] pb-2 font-semibold relative whitespace-nowrap shrink-0 cursor-pointer ${
              tab === t.id ? 'text-[#F5F1F2]' : 'text-[#A7A0AA]'
            }`}
          >
            <span className="tabular-nums">{t.label}</span>
            {tab === t.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#C0263D]" />
            )}
          </button>
        ))}
      </div>

      {searchError && (
        <div className="p-4 rounded-xl bg-[#141116] border border-rose-500/30 text-xs text-rose-300 flex items-center justify-between gap-3">
          <span>{searchError}</span>
          <button
            type="button"
            onClick={() => setRetryNonce((n) => n + 1)}
            className="px-3 py-1.5 rounded-lg bg-[#C0263D] text-white font-semibold shrink-0 cursor-pointer"
          >
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-18 rounded-2xl bg-[#141116] animate-pulse border border-white/5" />
            ))}
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5 sm:gap-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <div className="aspect-[2/3] rounded-xl bg-[#141116] animate-pulse border border-white/5" />
                <div className="h-3.5 w-3/4 rounded bg-[#141116] animate-pulse" />
              </div>
            ))}
          </div>
        </div>
      ) : (
        <>
          {tab === 'all' && (
            <div className="space-y-8">
              {results.isExplicitPersonQuery ? (
                <>
                  {renderPeopleSection(true)}
                  {renderAnimeSection(true)}
                </>
              ) : (
                <>
                  {renderAnimeSection(true)}
                  {renderPeopleSection(true)}
                </>
              )}
            </div>
          )}

          {tab === 'anime' && renderAnimeSection(false)}

          {tab === 'people' && renderPeopleSection(false)}

          {tab === 'guilds' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {results.communities.length === 0 ? (
                <p className="col-span-full text-xs text-[#A7A0AA] text-center py-8">
                  No Guilds matched your search.
                </p>
              ) : (
                results.communities.map((g: any) => (
                  <Link
                    key={g.id}
                    to={`/guilds/${g.slug}`}
                    className="p-3.5 rounded-2xl bg-[#141116] border border-white/8 flex items-center gap-3 hover:border-[#6D28D9]"
                  >
                    <div className="w-16 h-16 rounded-xl overflow-hidden bg-[#09080B] shrink-0">
                      <KageImage src={g.artworkUrl} alt={g.name} className="w-full h-full object-cover" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#F5F1F2] truncate">{g.name}</p>
                      <p className="text-xs text-[#A7A0AA] line-clamp-1">{g.description}</p>
                      <p className="text-[11px] text-[#A7A0AA] font-mono-num mt-1">
                        {formatCompactNumber(g.memberCount)} members ·{' '}
                        {formatCompactNumber(g.discussionCount)} discussions
                      </p>
                    </div>
                  </Link>
                ))
              )}
            </div>
          )}

          {tab === 'discussions' && (
            <div className="space-y-3">
              {results.discussions.length === 0 ? (
                <p className="text-xs text-[#A7A0AA] text-center py-8">
                  No discussions matched your search.
                </p>
              ) : (
                results.discussions.map((d: any) => (
                  <Link
                    key={d.id}
                    to={`/pulse/${d.id}`}
                    className="block p-4 rounded-2xl bg-[#141116] border border-white/8 hover:border-white/20 space-y-1"
                  >
                    <div className="flex items-center gap-1.5 text-xs text-[#A7A0AA] flex-wrap">
                      <span>@{d.author.username}</span>
                      <OwnerBadge role={d.author.role} size="xs" />
                      <span>·</span>
                      <span className="font-mono-num">{formatCompactNumber(d.likeCount)} likes</span>
                      <span>·</span>
                      <span className="font-mono-num">
                        {formatCompactNumber(d.commentCount)} comments
                      </span>
                    </div>
                    <h3 className="text-sm font-bold text-[#F5F1F2]">{d.title}</h3>
                    <p className="text-xs text-[#A7A0AA] line-clamp-2">{d.content}</p>
                  </Link>
                ))
              )}
            </div>
          )}

          {tab === 'voice' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {results.voiceRooms.length === 0 ? (
                <p className="col-span-full text-xs text-[#A7A0AA] text-center py-8">
                  No active voice rooms matched your search.
                </p>
              ) : (
                results.voiceRooms.map((v: any) => (
                  <Link
                    key={v.id}
                    to={`/voice/${v.id}`}
                    className="p-4 rounded-2xl bg-[#141116] border border-white/10 flex items-center justify-between gap-3 hover:border-[#C0263D]"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-[#F5F1F2] truncate">{v.title}</p>
                      <p className="text-xs text-[#A7A0AA] line-clamp-1">{v.topic}</p>
                      <p className="text-[11px] text-[#C0263D] font-mono-num mt-1">
                        {v.participantCount}/{v.capacity} connected
                      </p>
                    </div>
                    <Mic className="w-5 h-5 text-[#C0263D] shrink-0" />
                  </Link>
                ))
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

/* =========================================================
   4. SETTINGS PAGE — Account, Security, Messaging, Privacy & Accessibility
   ========================================================= */
export const SettingsPage: React.FC<{ onReplayIntro?: () => void }> = ({ onReplayIntro }) => {
  const {
    user,
    profile,
    settings,
    refreshMe,
    logout,
    resendVerificationEmail,
    requestPasswordReset,
  } = useAuth();
  const { audioPrefs, updateAudioPrefs, playSound } = useSound();
  const navigate = useNavigate();

  const [blockedUsers, setBlockedUsers] = useState<any[]>([]);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  // Password update fields
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [updatingPass, setUpdatingPass] = useState(false);

  // Account deletion confirmation
  const [confirmDeleteText, setConfirmDeleteText] = useState('');
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    apiFetch<{ blocked: any[] }>('/api/me/blocked')
      .then((res) => setBlockedUsers(res.blocked || []))
      .catch(() => {});
  }, [user]);

  const handleToggleSetting = async (key: string, value: boolean | string) => {
    if (!user) return;
    setStatusMsg('');
    setErrorMsg('');
    try {
      await apiFetch('/api/me/settings', {
        method: 'PUT',
        body: JSON.stringify({ [key]: value }),
      });
      await refreshMe();
      setStatusMsg('Settings saved.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not update setting.');
    }
  };

  const handleTogglePrivacy = async (key: string, value: boolean) => {
    if (!user) return;
    setStatusMsg('');
    setErrorMsg('');
    try {
      await apiFetch('/api/me/profile', {
        method: 'PUT',
        body: JSON.stringify({ [key]: value }),
      });
      await refreshMe();
      setStatusMsg('Privacy preferences saved.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not update privacy.');
    }
  };

  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user?.email) return;
    if (newPassword.length < 8) {
      setErrorMsg('New password must be at least 8 characters.');
      return;
    }
    setUpdatingPass(true);
    setErrorMsg('');
    setStatusMsg('');
    try {
      if (getServerSessionToken() || !auth.currentUser) {
        await apiFetch('/api/auth/change-password', {
          method: 'POST',
          body: JSON.stringify({
            currentPassword,
            newPassword,
          }),
        });
      } else {
        const cred = EmailAuthProvider.credential(user.email, currentPassword);
        await reauthenticateWithCredential(auth.currentUser, cred);
        await updatePassword(auth.currentUser, newPassword);
      }
      setCurrentPassword('');
      setNewPassword('');
      setStatusMsg('Password updated.');
    } catch (err: any) {
      setErrorMsg(
        err?.message ||
          'Could not verify current password. Check your current password and try again.'
      );
    } finally {
      setUpdatingPass(false);
    }
  };

  const handleUnblock = async (targetUid: string) => {
    try {
      await apiFetch(`/api/users/${targetUid}/block`, { method: 'POST' });
      setBlockedUsers((prev) => prev.filter((u) => u.uid !== targetUid));
    } catch {
      // ignore
    }
  };

  const handleDeleteAccount = async () => {
    if (confirmDeleteText !== 'DELETE') return;
    setDeleting(true);
    try {
      await apiFetch('/api/me/account', { method: 'DELETE' });
      if (auth.currentUser) {
        await deleteUser(auth.currentUser).catch(() => {});
      }
      await logout();
      navigate('/auth/welcome');
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete account.');
      setDeleting(false);
    }
  };

  if (!user || !settings || !profile) {
    return (
      <div className="p-8 rounded-2xl bg-[#141116] border border-white/10 text-center space-y-4">
        <p className="text-sm font-semibold text-[#F5F1F2]">
          Sign in to manage KAGE account & accessibility settings
        </p>
        <Link
          to="/auth/login"
          className="inline-flex min-h-[44px] px-5 items-center rounded-xl bg-[#C0263D] text-white text-xs font-semibold"
        >
          Sign In
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-[#F5F1F2]">Settings</h1>
          <p className="text-xs text-[#A7A0AA]">
            Manage your KAGE account, security, direct messages, notifications & accessibility
          </p>
        </div>
        <Link
          to="/profile"
          className="min-h-[40px] px-4 rounded-xl bg-[#141116] border border-white/12 text-xs font-semibold text-[#F5F1F2] flex items-center"
        >
          View Profile
        </Link>
      </div>

      {statusMsg && (
        <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300">
          {statusMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300">
          {errorMsg}
        </div>
      )}

      {/* Account & Permanent KAGE ID */}
      <section className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-3">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-[#F5F1F2]">Account</h2>
            <OwnerBadge role={user.role} size="sm" showTitle={user.role === 'owner'} />
          </div>
          {(user.role === 'owner' || user.role === 'admin') && (
            <Link
              to="/admin"
              className="min-h-[36px] px-3.5 rounded-xl bg-amber-500/20 border border-amber-400/50 text-xs font-bold text-amber-200 flex items-center gap-1.5"
            >
              <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
              <span>Open Admin Panel</span>
            </Link>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
          <div className="p-3 rounded-xl bg-[#09080B] border border-white/8">
            <span className="text-[#A7A0AA] block">Username</span>
            <span className="font-semibold text-[#F5F1F2]">@{user.username}</span>
          </div>
          <div className="p-3 rounded-xl bg-[#09080B] border border-white/8">
            <span className="text-[#A7A0AA] block">KAGE ID</span>
            <span className="font-mono-num font-semibold text-[#F5F1F2]">
              {user.kageId || user.uid}
            </span>
          </div>
          <div className="p-3 rounded-xl bg-[#09080B] border border-white/8 flex items-center justify-between gap-2">
            <div className="min-w-0">
              <span className="text-[#A7A0AA] block">Email</span>
              <span className="font-semibold text-[#F5F1F2] truncate block">{user.email}</span>
            </div>
            {!user.emailVerified && (
              <button
                type="button"
                onClick={() =>
                  resendVerificationEmail().then(() =>
                    setStatusMsg('Verification email sent.')
                  )
                }
                className="text-[#6D28D9] font-semibold hover:underline cursor-pointer shrink-0"
              >
                Verify
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Password & Security */}
      <section className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-[#F5F1F2]">Password & Security</h2>
          <button
            type="button"
            onClick={() =>
              requestPasswordReset(user.email).then(() =>
                setStatusMsg(`Password reset email sent to ${user.email}`)
              )
            }
            className="text-xs text-[#C0263D] hover:underline cursor-pointer"
          >
            Send Reset Email
          </button>
        </div>
        <form onSubmit={handleUpdatePassword} className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <input
            type="password"
            placeholder="Current password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2]"
          />
          <input
            type="password"
            placeholder="New password (8+ chars)"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="min-h-[42px] rounded-xl bg-[#09080B] border border-white/10 px-3 text-xs text-[#F5F1F2]"
          />
          <button
            type="submit"
            disabled={updatingPass || !currentPassword || !newPassword}
            className="min-h-[42px] px-4 rounded-xl bg-[#C0263D] disabled:opacity-50 text-white text-xs font-semibold cursor-pointer"
          >
            {updatingPass ? 'Updating...' : 'Update Password'}
          </button>
        </form>
      </section>

      {/* Direct Messaging & Presence */}
      <section className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-4">
        <h2 className="text-sm font-bold text-[#F5F1F2]">Direct Messages & Inbox Privacy</h2>

        <div>
          <span className="block text-xs text-[#A7A0AA] mb-2">Who can message you directly</span>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'everyone', label: 'Everyone (Non-followers go to Requests)' },
                { id: 'followers', label: 'Mutual Follows Only' },
                { id: 'none', label: 'Closed DMs' },
              ] as const
            ).map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleToggleSetting('messageRequestMode', opt.id)}
                className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                  (settings.messageRequestMode || 'everyone') === opt.id
                    ? 'border-[#6D28D9] bg-[#6D28D9]/20 text-white'
                    : 'border-white/10 bg-[#09080B] text-[#A7A0AA]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {[
            {
              key: 'allowDirectMessages',
              label: 'Allow Direct Messages',
              val: settings.allowDirectMessages !== false,
            },
            {
              key: 'showReadReceipts',
              label: 'Send Read Receipts',
              val: settings.showReadReceipts !== false,
            },
            {
              key: 'showOnlineStatus',
              label: 'Show Online Presence',
              val: settings.showOnlineStatus !== false,
            },
          ].map((item) => (
            <label
              key={item.key}
              className="p-3 rounded-xl bg-[#09080B] border border-white/8 flex items-center justify-between gap-2 text-xs text-[#F5F1F2] cursor-pointer"
            >
              <span>{item.label}</span>
              <input
                type="checkbox"
                checked={item.val}
                onChange={(e) => handleToggleSetting(item.key, e.target.checked)}
                className="accent-[#6D28D9] w-4 h-4"
              />
            </label>
          ))}
        </div>
      </section>

      {/* Sound & Audio Experience */}
      <section className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-bold text-[#F5F1F2] flex items-center gap-2">
              {audioPrefs.masterEnabled ? (
                <Volume2 className="w-4 h-4 text-[#C0263D]" />
              ) : (
                <VolumeX className="w-4 h-4 text-[#A7A0AA]" />
              )}
              <span>Sound &amp; Audio</span>
            </h2>
            <p className="text-xs text-[#A7A0AA] mt-0.5">
              Customize original KAGE sound effects, splash intro audio, live room cues &amp; ambience
            </p>
          </div>

          <button
            type="button"
            data-kage-silent="true"
            onClick={() => playSound('splash_sequence_preview', { forcePreview: true })}
            disabled={!audioPrefs.masterEnabled}
            className="min-h-[38px] px-3.5 rounded-xl bg-[#09080B] border border-white/12 hover:border-[#6D28D9] disabled:opacity-45 text-xs font-semibold text-[#F5F1F2] flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Play className="w-3.5 h-3.5 text-[#6D28D9]" />
            <span>Preview Sound</span>
          </button>
        </div>

        {/* Master Sound Override */}
        <label className="p-3.5 rounded-xl bg-[#09080B] border border-white/12 flex items-center justify-between gap-3 cursor-pointer">
          <div>
            <span className="text-xs font-bold text-[#F5F1F2] block">Master Sound</span>
            <span className="text-[11px] text-[#A7A0AA]">
              Master mute overrides all UI, splash, notification, voice room, and music audio
            </span>
          </div>
          <input
            type="checkbox"
            checked={audioPrefs.masterEnabled}
            onChange={(e) => {
              const next = e.target.checked;
              updateAudioPrefs({ masterEnabled: next });
              setStatusMsg(next ? 'Master sound enabled.' : 'All KAGE audio muted.');
            }}
            className="accent-[#C0263D] w-4 h-4 shrink-0"
          />
        </label>

        {/* Individual Sound Category Toggles */}
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 gap-2.5 transition-opacity ${
            audioPrefs.masterEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'
          }`}
        >
          {[
            {
              key: 'uiSoundsEnabled' as const,
              label: 'UI Interaction & Navigation Sounds',
              val: audioPrefs.uiSoundsEnabled,
            },
            {
              key: 'splashSoundEnabled' as const,
              label: 'Splash Intro Sound',
              val: audioPrefs.splashSoundEnabled,
            },
            {
              key: 'notificationSoundsEnabled' as const,
              label: 'Notification & Message Sounds',
              val: audioPrefs.notificationSoundsEnabled,
            },
            {
              key: 'voiceRoomSoundsEnabled' as const,
              label: 'Voice Room Sound Effects',
              val: audioPrefs.voiceRoomSoundsEnabled,
            },
            {
              key: 'bgMusicEnabled' as const,
              label: 'Background Dark-Fantasy Ambience',
              val: audioPrefs.bgMusicEnabled,
            },
          ].map((item) => (
            <label
              key={item.key}
              className="p-3 rounded-xl bg-[#09080B] border border-white/8 flex items-center justify-between gap-2 text-xs text-[#F5F1F2] cursor-pointer"
            >
              <span className="flex items-center gap-1.5">
                {item.key === 'bgMusicEnabled' && (
                  <Music className="w-3.5 h-3.5 text-[#6D28D9] shrink-0" />
                )}
                <span>{item.label}</span>
              </span>
              <input
                type="checkbox"
                checked={item.val}
                onChange={(e) => {
                  updateAudioPrefs({ [item.key]: e.target.checked });
                  setStatusMsg('Audio preferences saved.');
                }}
                className="accent-[#6D28D9] w-4 h-4 shrink-0"
              />
            </label>
          ))}
        </div>

        {/* Sound & Background Music Volume Sliders */}
        <div
          className={`grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 transition-opacity ${
            audioPrefs.masterEnabled ? 'opacity-100' : 'opacity-50 pointer-events-none'
          }`}
        >
          <div className="p-3 rounded-xl bg-[#09080B] border border-white/8 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#A7A0AA] font-medium">Sound Effects Volume</span>
              <span className="font-mono-num font-semibold text-[#F5F1F2]">
                {audioPrefs.soundVolume}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={audioPrefs.soundVolume}
              onChange={(e) => updateAudioPrefs({ soundVolume: Number(e.target.value) })}
              className="w-full accent-[#C0263D] cursor-pointer"
            />
          </div>

          <div className="p-3 rounded-xl bg-[#09080B] border border-white/8 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-[#A7A0AA] font-medium">Background Music Volume</span>
              <span className="font-mono-num font-semibold text-[#F5F1F2]">
                {audioPrefs.bgMusicVolume}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              value={audioPrefs.bgMusicVolume}
              onChange={(e) => updateAudioPrefs({ bgMusicVolume: Number(e.target.value) })}
              className="w-full accent-[#6D28D9] cursor-pointer"
            />
          </div>
        </div>
      </section>

      {/* Theme & Accessibility */}
      <section className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h2 className="text-sm font-bold text-[#F5F1F2]">Theme &amp; Accessibility</h2>
          {onReplayIntro && (
            <button
              type="button"
              onClick={onReplayIntro}
              className="min-h-[36px] px-3.5 rounded-xl bg-[#09080B] border border-white/12 hover:border-[#C0263D] text-xs font-semibold text-[#F5F1F2] flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <Zap className="w-3.5 h-3.5 text-amber-400" />
              <span>Replay Intro</span>
            </button>
          )}
        </div>

        <div>
          <span className="block text-xs text-[#A7A0AA] mb-2">Accent Color</span>
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: 'crimson', label: 'Crimson (#C0263D)' },
                { id: 'violet', label: 'Domain Violet (#6D28D9)' },
                { id: 'gold', label: 'Thunder Gold' },
              ] as const
            ).map((acc) => (
              <button
                key={acc.id}
                type="button"
                onClick={() => handleToggleSetting('themeAccent', acc.id)}
                className={`min-h-[38px] px-3.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                  settings.themeAccent === acc.id
                    ? 'border-[#C0263D] bg-[#C0263D]/15 text-white'
                    : 'border-white/10 bg-[#09080B] text-[#A7A0AA]'
                }`}
              >
                {acc.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[
            {
              key: 'reducedMotion',
              label: 'Reduced Motion (Simplify Intro & Transitions)',
              val: settings.reducedMotion,
            },
            {
              key: 'skipIntroAlways',
              label: 'Always Skip Opening Splash Intro',
              val: settings.skipIntroAlways,
            },
            {
              key: 'highContrast',
              label: 'High Contrast Borders & Text',
              val: settings.highContrast,
            },
            {
              key: 'largerText',
              label: 'Larger Reading Typography',
              val: settings.largerText,
            },
          ].map((item) => (
            <label
              key={item.key}
              className="p-3 rounded-xl bg-[#09080B] border border-white/8 flex items-center justify-between gap-2 text-xs text-[#F5F1F2] cursor-pointer"
            >
              <span>{item.label}</span>
              <input
                type="checkbox"
                checked={item.val}
                onChange={(e) => handleToggleSetting(item.key, e.target.checked)}
                className="accent-[#C0263D] w-4 h-4"
              />
            </label>
          ))}
        </div>
      </section>

      {/* Notifications & Privacy */}
      <section className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-3">
        <h2 className="text-sm font-bold text-[#F5F1F2]">Notifications & Profile Privacy</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {[
            {
              key: 'notifyComments',
              label: 'Comments & Thread Replies',
              val: settings.notifyComments,
              isProfile: false,
            },
            {
              key: 'notifyReactions',
              label: 'Likes & Post Reactions',
              val: settings.notifyReactions,
              isProfile: false,
            },
            {
              key: 'notifyMentions',
              label: '@Username Mentions',
              val: settings.notifyMentions !== false,
              isProfile: false,
            },
            {
              key: 'notifyReposts',
              label: 'Reposts & Quote Reposts',
              val: settings.notifyReposts !== false,
              isProfile: false,
            },
            {
              key: 'notifyMessages',
              label: 'Direct & Squad Message Alerts',
              val: settings.notifyMessages !== false,
              isProfile: false,
            },
            {
              key: 'notifyChallenges',
              label: 'Clash Duel Invites & Results',
              val: settings.notifyChallenges !== false,
              isProfile: false,
            },
            {
              key: 'notifyGuilds',
              label: 'Guild Invitations & Moderation',
              val: settings.notifyGuilds !== false,
              isProfile: false,
            },
            {
              key: 'notifyVoiceInvites',
              label: 'KAGE LIVE Voice Room Invites',
              val: settings.notifyVoiceInvites,
              isProfile: false,
            },
            {
              key: 'isPrivate',
              label: 'Private Hunter Profile',
              val: profile.isPrivate,
              isProfile: true,
            },
            {
              key: 'showWatchlist',
              label: 'Display Watchlist Publicly',
              val: profile.showWatchlist,
              isProfile: true,
            },
          ].map((item) => (
            <label
              key={item.key}
              className="p-3 rounded-xl bg-[#09080B] border border-white/8 flex items-center justify-between gap-2 text-xs text-[#F5F1F2] cursor-pointer"
            >
              <span>{item.label}</span>
              <input
                type="checkbox"
                checked={item.val}
                onChange={(e) =>
                  item.isProfile
                    ? handleTogglePrivacy(item.key, e.target.checked)
                    : handleToggleSetting(item.key, e.target.checked)
                }
                className="accent-[#6D28D9] w-4 h-4"
              />
            </label>
          ))}
        </div>
      </section>

      {/* Blocked Users */}
      <section className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-3">
        <h2 className="text-sm font-bold text-[#F5F1F2]">Blocked Hunters</h2>
        {blockedUsers.length === 0 ? (
          <p className="text-xs text-[#A7A0AA]">You have not blocked any accounts.</p>
        ) : (
          <div className="space-y-2">
            {blockedUsers.map((b) => (
              <div
                key={b.uid}
                className="p-3 rounded-xl bg-[#09080B] border border-white/8 flex items-center justify-between"
              >
                <span className="text-xs font-semibold text-[#F5F1F2]">
                  {b.displayName} (@{b.username})
                </span>
                <button
                  type="button"
                  onClick={() => handleUnblock(b.uid)}
                  className="px-3 py-1 rounded-lg bg-[#141116] text-xs text-[#C0263D] font-semibold cursor-pointer"
                >
                  Unblock
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Help, Legal & Session */}
      <section className="p-5 rounded-2xl bg-[#141116] border border-white/10 space-y-4">
        <div className="space-y-1 text-xs text-[#A7A0AA]">
          <p className="font-semibold text-[#F5F1F2]">Community Rules, Terms & Privacy</p>
          <p>
            KAGE links exclusively to authorized anime streaming services and official catalog metadata. Respect spoiler tags, fellow guild members, and voice room moderators.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/8">
          <button
            type="button"
            onClick={async () => {
              await logout();
              navigate('/auth/welcome');
            }}
            className="min-h-[44px] px-5 rounded-xl bg-[#09080B] border border-white/15 text-xs font-semibold text-[#F5F1F2] flex items-center gap-2 cursor-pointer"
          >
            <LogOut className="w-4 h-4 text-[#C0263D]" />
            <span>Sign Out of KAGE</span>
          </button>

          {user.role !== 'owner' && (
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={confirmDeleteText}
                onChange={(e) => setConfirmDeleteText(e.target.value)}
                placeholder='Type "DELETE" to erase'
                className="min-h-[40px] w-36 rounded-xl bg-[#09080B] border border-rose-500/30 px-3 text-xs text-[#F5F1F2]"
              />
              <button
                type="button"
                disabled={confirmDeleteText !== 'DELETE' || deleting}
                onClick={handleDeleteAccount}
                className="min-h-[40px] px-3.5 rounded-xl bg-rose-600 disabled:opacity-40 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{deleting ? 'Deleting...' : 'Delete Account'}</span>
              </button>
            </div>
          )}
        </div>
      </section>

      <div className="flex items-center justify-center gap-2 text-[11px] text-[#A7A0AA] pb-2">
        <ShieldAlert className="w-3.5 h-3.5 text-[#6D28D9]" />
        <span>KAGE · The Anime Universe</span>
      </div>
    </div>
  );
};
