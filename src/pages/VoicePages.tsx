import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ArrowDownCircle,
  ArrowLeft,
  Check,
  ChevronRight,
  Crown,
  Flag,
  Hand,
  Headphones,
  Lock,
  MessageSquare,
  MessageSquareOff,
  Mic,
  MicOff,
  MoreHorizontal,
  PhoneOff,
  Plus,
  Radio,
  Reply,
  Search,
  Send,
  Settings,
  Share2,
  Shield,
  Smile,
  Trash2,
  Unlock,
  Upload,
  UserCheck,
  UserMinus,
  UserPlus,
  UserX,
  Users,
  Video,
  VideoOff,
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
import { SpeakerLiveWaveform } from '../components/SpeakerLiveWaveform';
import { kageSound } from '../lib/soundEngine';
import { PRESET_BANNERS } from '../lib/assets';

export interface VoiceParticipant {
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  userRole?: string;
  role: 'host' | 'co_host' | 'co-host' | 'moderator' | 'speaker' | 'listener';
  seatNumber?: number | null;
  isMuted: boolean;
  isForceMuted?: boolean;
  isCameraOn?: boolean;
  joinedAt?: string;
}

export interface SpeakRequestItem {
  id: number;
  roomId: number;
  userUid: string;
  status: string;
  createdAt: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

export interface BannedVoiceUser {
  id: number;
  userUid: string;
  reason: string;
  createdAt: string;
  username: string;
  displayName: string;
  avatarUrl: string;
}

export interface VoiceChatReactionSummary {
  emoji: string;
  count: number;
  uids: string[];
}

export interface VoiceChatMessageItem {
  id: number;
  roomId: number;
  senderUid: string;
  content: string;
  replyToId: number | null;
  replyPreview?: {
    id: number;
    content: string;
    senderUsername: string;
    senderDisplayName: string;
  } | null;
  mentions: { uid: string; username: string; displayName: string }[];
  reactions: VoiceChatReactionSummary[];
  createdAt: string;
  sender: {
    uid: string;
    username: string;
    displayName: string;
    avatarUrl: string;
    role?: string;
  };
}

export interface VoiceRoomDetail {
  id: number;
  title: string;
  topic: string;
  category: string;
  artworkUrl: string;
  bannerUrl: string;
  avatarUrl: string;
  communityId?: number | null;
  communityName?: string | null;
  hostUid?: string | null;
  mediaMode: 'voice' | 'video';
  maxSpeakers: number;
  capacity: number;
  isLocked: boolean;
  isChatEnabled: boolean;
  isActive: boolean;
  participantCount: number;
  speakerCount: number;
  listenerCount: number;
  participants: VoiceParticipant[];
  speakRequests?: SpeakRequestItem[];
  bannedUsers?: BannedVoiceUser[];
  viewerRole?: string | null;
  viewerBanned?: boolean;
}

const VOICE_CATEGORIES = [
  'All',
  'Anime Vibes',
  'Episode Watch Party',
  'Manga Spoilers',
  'Powerscaling & Debate',
  'Chill & Music',
  'Gaming',
];

const QUICK_REACTIONS = ['🔥', '❤️', '😂', '👑', '⚡', '👏'];

function isSpeakerStageRole(role?: string | null): boolean {
  return (
    role === 'host' ||
    role === 'co_host' ||
    role === 'co-host' ||
    role === 'moderator' ||
    role === 'speaker'
  );
}

function isHostOrCoHostRole(role?: string | null): boolean {
  return (
    role === 'host' ||
    role === 'co_host' ||
    role === 'co-host' ||
    role === 'moderator'
  );
}

function formatRoleLabel(role: string): string {
  if (role === 'host') return 'Host';
  if (role === 'co_host' || role === 'co-host' || role === 'moderator') return 'Co-Host';
  if (role === 'speaker') return 'Speaker';
  return 'Listener';
}

function getIceServers(): RTCIceServer[] {
  const servers: RTCIceServer[] = [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ];
  const turnUrl = (import.meta as any).env?.VITE_TURN_URL;
  const turnUsername = (import.meta as any).env?.VITE_TURN_USERNAME;
  const turnCredential = (import.meta as any).env?.VITE_TURN_CREDENTIAL;
  if (turnUrl) {
    servers.push({
      urls: turnUrl,
      username: turnUsername || undefined,
      credential: turnCredential || undefined,
    });
  }
  return servers;
}

function readImageDataUrl(file: File, maxBytes = 6 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.size > maxBytes) {
      reject(new Error('Image exceeds 6 MB maximum size.'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Could not read selected image.'));
    reader.readAsDataURL(file);
  });
}

function renderVoiceChatRichText(
  content: string,
  mentions: { uid: string; username: string; displayName: string }[]
): React.ReactNode {
  if (!content) return null;
  const knownByLower = new Map<string, string>();
  for (const m of mentions || []) {
    if (m.username) knownByLower.set(m.username.toLowerCase(), m.username);
  }
  const tokens = content.split(/(@[a-zA-Z0-9_.-]{2,24})/g);
  return tokens.map((tok, i) => {
    if (tok.startsWith('@') && tok.length >= 3) {
      const rawHandle = tok.slice(1);
      const resolvedHandle = knownByLower.get(rawHandle.toLowerCase()) || rawHandle;
      return (
        <Link
          key={i}
          to={`/profile/${resolvedHandle}`}
          className="inline-flex items-center px-1 rounded bg-[#6D28D9]/25 text-[#d8b4fe] hover:text-white font-semibold transition-colors"
        >
          @{resolvedHandle}
        </Link>
      );
    }
    return <React.Fragment key={i}>{tok}</React.Fragment>;
  });
}

const RemoteMediaTile: React.FC<{
  stream: MediaStream;
  participant?: VoiceParticipant;
  isSpeaking?: boolean;
  audioMuted?: boolean;
}> = ({ stream, participant, isSpeaking, audioMuted = false }) => {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const hasVideo =
    Boolean(participant?.isCameraOn) &&
    stream.getVideoTracks().some((t) => t.readyState === 'live');

  useEffect(() => {
    if (videoRef.current && hasVideo) {
      videoRef.current.srcObject = stream;
      videoRef.current.play().catch(() => {});
    }
    if (audioRef.current) {
      audioRef.current.srcObject = stream;
      audioRef.current.muted = audioMuted;
      audioRef.current.play().catch(() => {});
    }
  }, [stream, hasVideo, audioMuted]);

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline muted={audioMuted} className="hidden" />
      {hasVideo && participant && (
        <div
          className={`relative aspect-video rounded-2xl overflow-hidden bg-[#09080B] border-2 transition-all ${
            isSpeaking
              ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.35)]'
              : 'border-[#6D28D9]/60'
          }`}
        >
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/85 via-black/40 to-transparent flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-white truncate flex items-center gap-1">
              {participant.role === 'host' && (
                <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" aria-label="Host" />
              )}
              {participant.displayName || participant.username}
            </span>
            {participant.isMuted ? (
              <MicOff className="w-3.5 h-3.5 text-rose-400 shrink-0" />
            ) : (
              <Mic className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )}
          </div>
        </div>
      )}
    </>
  );
};

// ============================================================================
// STANDALONE VOICE & VIDEO ROOMS DIRECTORY (/voice)
// ============================================================================

export const VoiceRoomsPage: React.FC = () => {
  const { user, subscribeWs } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [rooms, setRooms] = useState<VoiceRoomDetail[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [loading, setLoading] = useState(true);

  // Create Standalone Voice Room Modal
  const [createOpen, setCreateOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      if (user) {
        setCreateOpen(true);
      } else {
        navigate('/auth/login?redirect=%2Fvoice%3Fcreate%3D1');
      }
      const next = new URLSearchParams(searchParams);
      next.delete('create');
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams, user, navigate]);
  const [title, setTitle] = useState('');
  const [topic, setTopic] = useState('');
  const [category, setCategory] = useState('Anime Vibes');
  const [bannerPreset, setBannerPreset] = useState('asset:anime_universe_banner');
  const [bannerUpload, setBannerUpload] = useState('');
  const [avatarUpload, setAvatarUpload] = useState('');
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const loadRooms = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      if (selectedCategory !== 'All') params.set('category', selectedCategory);
      const res = await apiFetch<{ items: VoiceRoomDetail[] }>(
        `/api/voice-rooms?${params.toString()}`
      );
      setRooms(res.items || []);
    } catch (err) {
      console.error('Failed to load voice rooms:', err);
    } finally {
      setLoading(false);
    }
  }, [search, selectedCategory]);

  useEffect(() => {
    const t = setTimeout(() => loadRooms(), 180);
    return () => clearTimeout(t);
  }, [loadRooms]);

  useEffect(() => {
    return subscribeWs((msg) => {
      if (msg.type === 'voice:room-created' && msg.room) {
        setRooms((prev) =>
          prev.some((r) => r.id === msg.room.id) ? prev : [msg.room, ...prev]
        );
        return;
      }
      if (msg.type === 'voice:room-ended' && msg.roomId) {
        setRooms((prev) => prev.filter((r) => r.id !== Number(msg.roomId)));
        return;
      }
      if (msg.type === 'voice:room-summary' && msg.roomId) {
        if (msg.ended) {
          setRooms((prev) => prev.filter((r) => r.id !== Number(msg.roomId)));
          return;
        }
        setRooms((prev) =>
          prev.map((r) =>
            r.id === Number(msg.roomId)
              ? {
                  ...r,
                  participantCount: msg.participantCount ?? r.participantCount,
                  speakerCount: msg.speakerCount ?? r.speakerCount,
                  mediaMode: msg.mediaMode || r.mediaMode,
                }
              : r
          )
        );
      }
    });
  }, [subscribeWs]);

  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate('/auth/login?redirect=%2Fvoice');
      return;
    }
    setCreating(true);
    setError('');
    try {
      const presetObj = PRESET_BANNERS.find((b) => b.key === bannerPreset);
      const selectedCoverUrl = presetObj?.url || '/assets/extracted/zenitsu-live-room.jpg';
      const res = await apiFetch<{ room: VoiceRoomDetail }>('/api/voice-rooms', {
        method: 'POST',
        body: JSON.stringify({
          title: title.trim(),
          topic: topic.trim(),
          description: topic.trim(),
          category,
          bannerDataUrl: bannerUpload || undefined,
          avatarDataUrl: avatarUpload || undefined,
          artworkUrl: bannerUpload ? undefined : selectedCoverUrl,
          mediaMode: 'voice',
        }),
      });
      setCreateOpen(false);
      navigate(`/voice/${res.room.id}`);
    } catch (err: any) {
      setError(err.message || 'Could not start voice room.');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-1">
        <div className="flex items-start gap-2.5">
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="min-h-[42px] min-w-[42px] -ml-2 flex items-center justify-center rounded-xl text-[#F5F1F2] hover:bg-white/5 cursor-pointer shrink-0"
            aria-label="Go back"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-wider text-[#F5F1F2]">
              KAGE LIVE ROOMS
            </h1>
            <p className="text-xs sm:text-sm text-[#A7A0AA] mt-0.5">
              Standalone social anime lounges · Up to 12 live speakers, unlimited listeners, live chat &amp; video stage.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => (user ? setCreateOpen(true) : navigate('/auth/login?redirect=%2Fvoice'))}
          className="min-h-[44px] px-4 py-2 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#C0263D] hover:opacity-95 text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer shadow-[0_8px_24px_rgba(109,40,217,0.3)]"
        >
          <Plus className="w-4 h-4" />
          <span>Start Voice Room</span>
        </button>
      </div>

      {/* Search & Category Filter */}
      <div className="space-y-3">
        <div className="relative">
          <Search className="w-4 h-4 text-[#A7A0AA] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search live voice & video rooms by title, topic, or anime..."
            className="w-full min-h-[44px] rounded-xl bg-[#141116] border border-white/10 pl-10 pr-4 text-sm text-[#F5F1F2] focus:outline-none focus:border-[#6D28D9]"
          />
        </div>

        <div className="flex flex-nowrap items-center gap-2 overflow-x-auto no-scrollbar pb-0.5">
          {VOICE_CATEGORIES.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                type="button"
                onClick={() => setSelectedCategory(cat)}
                className={`min-h-[36px] px-3.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#6D28D9] text-white'
                    : 'bg-[#141116] border border-white/10 text-[#A7A0AA] hover:text-[#F5F1F2]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-52 rounded-2xl bg-[#141116] animate-pulse border border-white/8" />
          ))}
        </div>
      ) : rooms.length === 0 ? (
        <div className="p-9 rounded-2xl bg-[#141116] border border-white/10 text-center space-y-3">
          <Radio className="w-8 h-8 text-[#6D28D9] mx-auto" />
          <p className="text-sm font-semibold text-[#F5F1F2]">No active rooms match right now</p>
          <p className="text-xs text-[#A7A0AA] max-w-md mx-auto">
            Launch your own standalone 12-speaker Voice Room and invite anyone across KAGE.
          </p>
          <button
            type="button"
            onClick={() => (user ? setCreateOpen(true) : navigate('/auth/login?redirect=%2Fvoice'))}
            className="min-h-[42px] px-5 rounded-xl bg-[#C0263D] text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Start Voice Room</span>
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {rooms.map((room) => {
            const speakers = (room.participants || []).filter((p) => isSpeakerStageRole(p.role));
            return (
              <Link
                key={room.id}
                to={`/voice/${room.id}`}
                className="group relative rounded-2xl overflow-hidden bg-[#141116] border border-white/12 hover:border-[#6D28D9]/70 transition-all flex flex-col justify-between min-h-[215px]"
              >
                <div className="h-24 relative overflow-hidden">
                  <KageImage
                    src={room.bannerUrl || room.artworkUrl}
                    alt={room.title}
                    className="w-full h-full object-cover opacity-70 group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#141116] via-[#141116]/45 to-black/30" />
                  <div className="absolute top-3 right-3 flex items-center gap-2 text-[11px] font-mono-num text-[#F5F1F2] bg-[#09080B]/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-white/10">
                    {room.mediaMode === 'video' ? (
                      <Video className="w-3.5 h-3.5 text-[#6D28D9]" />
                    ) : (
                      <Mic className="w-3.5 h-3.5 text-emerald-400" />
                    )}
                    <span>
                      {room.mediaMode === 'video' ? 'Video Stage' : 'Voice Room'} ·{' '}
                      {room.participantCount || 0} Online
                    </span>
                  </div>
                </div>

                <div className="px-4 pb-4 -mt-7 relative z-10 flex-1 flex flex-col justify-between gap-3">
                  <div className="flex items-end gap-3">
                    <div className="w-14 h-14 rounded-full overflow-hidden border-2 border-[#6D28D9] bg-[#09080B] shrink-0 shadow-lg">
                      <KageImage
                        src={room.avatarUrl || room.artworkUrl}
                        alt={room.title}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="min-w-0 pb-0.5">
                      <h2 className="text-base sm:text-lg font-bold text-[#F5F1F2] truncate">
                        {room.title}
                      </h2>
                      <p className="text-xs text-[#A7A0AA] truncate">
                        {room.category || 'Anime Vibes'} · {room.speakerCount ?? speakers.length}/12
                        Speakers
                      </p>
                    </div>
                  </div>

                  {room.topic && (
                    <p className="text-xs text-[#A7A0AA] line-clamp-2 leading-relaxed">
                      {room.topic}
                    </p>
                  )}

                  <div className="flex items-center justify-between gap-3 pt-1 border-t border-white/8">
                    <div className="flex items-center -space-x-2">
                      {(room.participants || []).slice(0, 5).map((p) => (
                        <div
                          key={p.uid}
                          className="w-7 h-7 rounded-full overflow-hidden border-2 border-[#141116] bg-[#09080B]"
                          title={p.displayName}
                        >
                          <KageImage
                            src={p.avatarUrl}
                            alt={p.displayName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      ))}
                      {(room.participants || []).length === 0 && (
                        <span className="text-[11px] text-[#A7A0AA]">Open stage · 12 seats ready</span>
                      )}
                    </div>

                    <span className="min-h-[36px] px-4 rounded-xl bg-[#C0263D] group-hover:bg-[#d42b44] text-white text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-colors">
                      <span>Join Room</span>
                      <ChevronRight className="w-3.5 h-3.5" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Start Standalone Voice Room Modal */}
      <KageModal
        isOpen={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Start Standalone Voice Room"
        subtitle="You will take Speaker Seat 1 as Host. Up to 12 speakers + unlimited listeners."
        maxWidthClass="max-w-lg"
        tallForm
        footer={
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={() => setCreateOpen(false)}
              className="min-h-[42px] px-4 rounded-xl bg-[#09080B] border border-white/10 text-xs text-[#A7A0AA] cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="voice-create-room-form"
              disabled={creating}
              className="min-h-[42px] px-5 rounded-xl bg-gradient-to-r from-[#6D28D9] to-[#C0263D] text-xs font-semibold text-white cursor-pointer disabled:opacity-50"
            >
              {creating ? 'Starting...' : 'Launch Voice Room'}
            </button>
          </div>
        }
      >
        <form id="voice-create-room-form" onSubmit={handleCreateRoom} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-[#A7A0AA] mb-1">Room Title</label>
                <input
                  type="text"
                  required
                  minLength={2}
                  maxLength={90}
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g., Anime Vibes · Top 10 Arcs Debate"
                  className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3.5 text-sm text-[#F5F1F2] focus:outline-none focus:border-[#6D28D9]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A7A0AA] mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-sm text-[#F5F1F2]"
                >
                  {VOICE_CATEGORIES.filter((c) => c !== 'All').map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-[#A7A0AA] mb-1">
                  Description &amp; Topic
                </label>
                <textarea
                  rows={2}
                  maxLength={320}
                  value={topic}
                  onChange={(e) => setTopic(e.target.value)}
                  placeholder="What are hunters talking about in this room?"
                  className="w-full rounded-xl bg-[#09080B] border border-white/12 p-3 text-sm text-[#F5F1F2] focus:outline-none focus:border-[#6D28D9]"
                />
              </div>

              <div className="space-y-2">
                <label className="block text-xs font-medium text-[#A7A0AA]">
                  Room Cover &amp; Avatar
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="min-h-[40px] rounded-xl bg-[#09080B] border border-dashed border-white/20 hover:border-[#6D28D9] px-3 flex items-center gap-2 text-xs text-[#A7A0AA] cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-[#6D28D9] shrink-0" />
                    <span className="truncate">
                      {avatarUpload ? 'Custom Avatar Selected' : 'Upload Room Avatar...'}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          try {
                            setAvatarUpload(await readImageDataUrl(f));
                          } catch (err: any) {
                            setError(err.message);
                          }
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                  <label className="min-h-[40px] rounded-xl bg-[#09080B] border border-dashed border-white/20 hover:border-[#C0263D] px-3 flex items-center gap-2 text-xs text-[#A7A0AA] cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-[#C0263D] shrink-0" />
                    <span className="truncate">
                      {bannerUpload ? 'Custom Banner Selected' : 'Upload Cover Banner...'}
                    </span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          try {
                            setBannerUpload(await readImageDataUrl(f));
                          } catch (err: any) {
                            setError(err.message);
                          }
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  {PRESET_BANNERS.slice(0, 4).map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setBannerPreset(b.key)}
                      className={`p-2 rounded-xl border text-left text-xs flex items-center gap-2 cursor-pointer ${
                        bannerPreset === b.key && !bannerUpload
                          ? 'border-[#6D28D9] bg-[#6D28D9]/15 text-white'
                          : 'border-white/10 bg-[#09080B] text-[#A7A0AA]'
                      }`}
                    >
                      <img
                        src={b.url}
                        alt={b.label}
                        className="w-7 h-7 rounded-full object-cover shrink-0"
                      />
                      <span className="truncate font-medium">{b.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {error && <p className="text-xs text-rose-400">{error}</p>}
        </form>
      </KageModal>
    </div>
  );
};

// ============================================================================
// ACTIVE STANDALONE VOICE & VIDEO ROOM (/voice/:id)
// ============================================================================

export const VoiceRoomActivePage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const roomId = Number(id || 0);
  const navigate = useNavigate();
  const { user, profile, wsConnected, sendWsMessage, subscribeWs } = useAuth();

  const [room, setRoom] = useState<VoiceRoomDetail | null>(null);
  const [messages, setMessages] = useState<VoiceChatMessageItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [mentionBanner, setMentionBanner] = useState<{
    senderUsername: string;
    preview: string;
  } | null>(null);

  // Speaking pulse state per uid
  const [speakingMap, setSpeakingMap] = useState<Record<string, boolean>>({});
  const [typingUsers, setTypingUsers] = useState<Record<string, string>>({});

  // Selected participant popover & modals
  const [selectedParticipant, setSelectedParticipant] = useState<VoiceParticipant | null>(null);
  const [listenersModalOpen, setListenersModalOpen] = useState(false);
  const [listenerSearch, setListenerSearch] = useState('');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmVideoSwitch, setConfirmVideoSwitch] = useState<'video' | 'voice' | null>(null);
  const [confirmEndRoom, setConfirmEndRoom] = useState(false);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteQuery, setInviteQuery] = useState('');
  const [inviteResults, setInviteResults] = useState<any[]>([]);
  const [reportTarget, setReportTarget] = useState<{
    type: 'user' | 'voice_room' | 'message';
    id: string | number;
    label: string;
  } | null>(null);
  const [audioOutputMuted, setAudioOutputMuted] = useState(false);

  // Settings form state
  const [editTitle, setEditTitle] = useState('');
  const [editTopic, setEditTopic] = useState('');
  const [editCategory, setEditCategory] = useState('Anime Vibes');
  const [savingSettings, setSavingSettings] = useState(false);

  // Integrated Live Chat state + @username autocomplete
  const [chatInput, setChatInput] = useState('');
  const [sendingChat, setSendingChat] = useState(false);
  const [replyTo, setReplyTo] = useState<VoiceChatMessageItem | null>(null);
  const [reactionPickerMsgId, setReactionPickerMsgId] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [externalMentionMatches, setExternalMentionMatches] = useState<any[]>([]);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const chatInputRef = useRef<HTMLInputElement | null>(null);

  // WebRTC Audio + Video refs
  const localStreamRef = useRef<MediaStream | null>(null);
  const localVideoPreviewRef = useRef<HTMLVideoElement | null>(null);
  const peersRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const makingOfferRef = useRef<Map<string, boolean>>(new Map());
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const audioAnalyserCleanupRef = useRef<(() => void) | null>(null);
  const waveformAudioCtxRef = useRef<AudioContext | null>(null);
  const peerAnalysersRef = useRef<
    Map<
      string,
      {
        analyser: AnalyserNode;
        source: MediaStreamAudioSourceNode;
        stream: MediaStream;
        dataArray: Uint8Array<ArrayBuffer>;
      }
    >
  >(new Map());
  const joinedRef = useRef(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((prev) => (prev === msg ? '' : prev));
    }, 3200);
  }, []);

  const [editBannerUrl, setEditBannerUrl] = useState('');
  const [editAvatarUrl, setEditAvatarUrl] = useState('');

  const syncSettingsFields = useCallback((r: VoiceRoomDetail) => {
    setEditTitle(r.title || '');
    setEditTopic(r.topic || '');
    setEditCategory(r.category || 'Anime Vibes');
    setEditBannerUrl(r.bannerUrl || r.artworkUrl || '');
    setEditAvatarUrl(r.avatarUrl || '');
  }, []);

  const fetchRoomAndMessages = useCallback(async () => {
    if (!roomId) return;
    setLoading(true);
    setError('');
    try {
      const [roomRes, msgRes] = await Promise.all([
        apiFetch<{ room: VoiceRoomDetail; messages?: VoiceChatMessageItem[] }>(
          `/api/voice-rooms/${roomId}`
        ),
        apiFetch<{ items?: VoiceChatMessageItem[]; messages?: VoiceChatMessageItem[] }>(
          `/api/voice-rooms/${roomId}/messages?limit=80`
        ).catch(() => ({ items: [], messages: [] })),
      ]);
      setRoom(roomRes.room);
      syncSettingsFields(roomRes.room);
      setMessages(msgRes.items || msgRes.messages || roomRes.messages || []);
    } catch (err: any) {
      setError(err.message || 'Voice room could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, [roomId, syncSettingsFields]);

  useEffect(() => {
    fetchRoomAndMessages();
  }, [fetchRoomAndMessages]);

  // Auto-join room when authenticated (Host -> Seat 1, others -> Listener)
  useEffect(() => {
    if (!roomId || !user || !room || room.viewerBanned || !room.isActive) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch<{ room: VoiceRoomDetail }>(
          `/api/voice-rooms/${roomId}/join`,
          { method: 'POST', body: JSON.stringify({}) }
        );
        if (!cancelled && res.room) {
          joinedRef.current = true;
          setRoom(res.room);
        }
      } catch (err: any) {
        if (!cancelled) {
          showToast(err.message || 'Unable to join room.');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [roomId, user?.uid, room?.id, showToast]);

  // Join WebSocket signaling channel whenever wsConnected is ready
  useEffect(() => {
    if (!wsConnected || !user || !roomId) return;
    sendWsMessage({ type: 'voice:join', roomId });
  }, [wsConnected, user, roomId, sendWsMessage]);

  // Clean up local media, peer connections & speaker waveform analysers
  const cleanupAllMedia = useCallback(() => {
    if (audioAnalyserCleanupRef.current) {
      audioAnalyserCleanupRef.current();
      audioAnalyserCleanupRef.current = null;
    }
    for (const [, entry] of peerAnalysersRef.current) {
      try {
        entry.source.disconnect();
        entry.analyser.disconnect();
      } catch {
        // ignore audio graph disconnect errors
      }
    }
    peerAnalysersRef.current.clear();
    if (waveformAudioCtxRef.current) {
      waveformAudioCtxRef.current.close().catch(() => {});
      waveformAudioCtxRef.current = null;
    }
    if (localStreamRef.current) {
      for (const track of localStreamRef.current.getTracks()) {
        track.stop();
      }
      localStreamRef.current = null;
    }
    for (const [, pc] of peersRef.current) {
      try {
        pc.close();
      } catch {
        // ignore
      }
    }
    peersRef.current.clear();
    setRemoteStreams({});
  }, []);

  // Leave room on unmount
  useEffect(() => {
    return () => {
      cleanupAllMedia();
      if (joinedRef.current && roomId) {
        sendWsMessage({ type: 'voice:leave', roomId });
        apiFetch(`/api/voice-rooms/${roomId}/leave`, { method: 'POST' }).catch(() => {});
      }
    };
  }, [cleanupAllMedia, roomId, sendWsMessage]);

  // Polite-peer WebRTC connection factory
  const ensurePeerConnection = useCallback(
    (peerUid: string): RTCPeerConnection => {
      const existing = peersRef.current.get(peerUid);
      if (existing) return existing;

      const pc = new RTCPeerConnection({ iceServers: getIceServers() });
      peersRef.current.set(peerUid, pc);

      if (localStreamRef.current) {
        for (const track of localStreamRef.current.getTracks()) {
          pc.addTrack(track, localStreamRef.current);
        }
      }

      pc.onicecandidate = (ev) => {
        if (ev.candidate) {
          sendWsMessage({
            type: 'voice:signal',
            roomId,
            targetUid: peerUid,
            toUid: peerUid,
            signalData: { candidate: ev.candidate },
            signal: { candidate: ev.candidate },
          });
        }
      };

      pc.onnegotiationneeded = async () => {
        try {
          makingOfferRef.current.set(peerUid, true);
          await pc.setLocalDescription();
          if (pc.localDescription) {
            sendWsMessage({
              type: 'voice:signal',
              roomId,
              targetUid: peerUid,
              toUid: peerUid,
              signalData: { description: pc.localDescription },
              signal: { description: pc.localDescription },
            });
          }
        } catch {
          // ignore transient glare
        } finally {
          makingOfferRef.current.set(peerUid, false);
        }
      };

      pc.ontrack = (ev) => {
        const stream = ev.streams?.[0] || new MediaStream([ev.track]);
        setRemoteStreams((prev) => ({ ...prev, [peerUid]: stream }));
      };

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
          peersRef.current.delete(peerUid);
          setRemoteStreams((prev) => {
            const next = { ...prev };
            delete next[peerUid];
            return next;
          });
        }
      };

      return pc;
    },
    [roomId, sendWsMessage]
  );

  // Sync local audio/video tracks to all active PeerConnections
  const syncTracksToPeers = useCallback(() => {
    const stream = localStreamRef.current;
    for (const [, pc] of peersRef.current) {
      const senders = pc.getSenders();
      if (!stream) {
        for (const s of senders) {
          try {
            pc.removeTrack(s);
          } catch {
            // ignore
          }
        }
        continue;
      }
      for (const track of stream.getTracks()) {
        const existing = senders.find((s) => s.track?.kind === track.kind);
        if (existing) {
          existing.replaceTrack(track).catch(() => {});
        } else {
          pc.addTrack(track, stream);
        }
      }
    }
  }, []);

  // Register a local or remote MediaStream in the shared AudioContext Analyser registry for D3 waveforms
  const registerStreamWaveformAnalyser = useCallback((uid: string, stream: MediaStream) => {
    try {
      if (!stream || stream.getAudioTracks().length === 0) return;
      const existing = peerAnalysersRef.current.get(uid);
      if (existing && existing.stream === stream) return;

      if (existing) {
        try {
          existing.source.disconnect();
          existing.analyser.disconnect();
        } catch {
          // ignore
        }
        peerAnalysersRef.current.delete(uid);
      }

      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      if (!waveformAudioCtxRef.current || waveformAudioCtxRef.current.state === 'closed') {
        waveformAudioCtxRef.current = new Ctx();
      }
      const ctx = waveformAudioCtxRef.current;
      if (ctx.state === 'suspended') {
        ctx.resume().catch(() => {});
      }

      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 128;
      analyser.smoothingTimeConstant = 0.72;
      source.connect(analyser);

      const dataArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      peerAnalysersRef.current.set(uid, { analyser, source, stream, dataArray });
    } catch {
      // Ignore analyser attachment errors on restricted browsers
    }
  }, []);

  // Live frequency-bin sampler consumed by each speaker's SpeakerLiveWaveform (D3)
  const getSpeakerFrequencyData = useCallback((uid: string): Uint8Array | null => {
    const entry = peerAnalysersRef.current.get(uid);
    if (!entry) return null;
    const track = entry.stream.getAudioTracks()[0];
    if (!track || track.readyState !== 'live' || !track.enabled) return null;
    if (waveformAudioCtxRef.current?.state === 'suspended') {
      waveformAudioCtxRef.current.resume().catch(() => {});
    }
    entry.analyser.getByteFrequencyData(entry.dataArray);
    return entry.dataArray;
  }, []);

  // Keep remote peer streams synchronized with the D3 waveform AudioContext analyser registry
  useEffect(() => {
    const activeUids = new Set(Object.keys(remoteStreams));
    for (const [uid, stream] of Object.entries(remoteStreams)) {
      registerStreamWaveformAnalyser(uid, stream);
    }
    for (const [uid, entry] of peerAnalysersRef.current) {
      if (uid !== user?.uid && !activeUids.has(uid)) {
        try {
          entry.source.disconnect();
          entry.analyser.disconnect();
        } catch {
          // ignore
        }
        peerAnalysersRef.current.delete(uid);
      }
    }
  }, [registerStreamWaveformAnalyser, remoteStreams, user?.uid]);

  // Attach Web Audio AnalyserNode to detect real speaking activity & feed local D3 waveform
  const startAudioSpeakingDetector = useCallback(
    (stream: MediaStream) => {
      if (audioAnalyserCleanupRef.current) {
        audioAnalyserCleanupRef.current();
        audioAnalyserCleanupRef.current = null;
      }
      try {
        if (!user) return;
        registerStreamWaveformAnalyser(user.uid, stream);
        let lastSent = false;

        const interval = window.setInterval(() => {
          const audioTrack = stream.getAudioTracks()[0];
          const data = getSpeakerFrequencyData(user.uid);
          if (!audioTrack || !audioTrack.enabled || !data) {
            if (lastSent) {
              lastSent = false;
              setSpeakingMap((prev) => ({ ...prev, [user.uid]: false }));
              sendWsMessage({ type: 'voice:speaking', roomId, speaking: false, isSpeaking: false });
            }
            return;
          }
          let sum = 0;
          for (let i = 0; i < data.length; i++) sum += data[i];
          const avg = sum / data.length;
          const active = avg > 15;
          if (active !== lastSent) {
            lastSent = active;
            setSpeakingMap((prev) => ({ ...prev, [user.uid]: active }));
            sendWsMessage({ type: 'voice:speaking', roomId, speaking: active, isSpeaking: active });
          }
        }, 180);

        audioAnalyserCleanupRef.current = () => {
          clearInterval(interval);
        };
      } catch {
        // Ignore audio analyser failures on restricted devices
      }
    },
    [getSpeakerFrequencyData, registerStreamWaveformAnalyser, roomId, sendWsMessage, user]
  );

  // Subscribe to all real-time Voice/Video Room WebSocket events
  useEffect(() => {
    return subscribeWs(async (msg) => {
      const msgRoomId = Number(msg.roomId || msg.room?.id || 0);
      if (msgRoomId && msgRoomId !== roomId) return;

      if (
        (msg.type === 'voice:room-updated' ||
          msg.type === 'voice:state' ||
          msg.type === 'voice:joined' ||
          msg.type === 'voice:peer-joined' ||
          msg.type === 'voice:user-left' ||
          msg.type === 'voice:media-mode-changed') &&
        msg.room
      ) {
        setRoom((prev) => {
          const nextRoom = msg.room as VoiceRoomDetail;
          if (user) {
            const me = (nextRoom.participants || []).find((p) => p.uid === user.uid);
            if (!me || !isSpeakerStageRole(me.role)) {
              if (localStreamRef.current) {
                for (const t of localStreamRef.current.getTracks()) t.stop();
                localStreamRef.current = null;
                syncTracksToPeers();
              }
            } else {
              if (me.isMuted && localStreamRef.current) {
                for (const t of localStreamRef.current.getAudioTracks()) t.enabled = false;
              }
              if ((!me.isCameraOn || nextRoom.mediaMode === 'voice') && localStreamRef.current) {
                for (const vt of localStreamRef.current.getVideoTracks()) {
                  vt.stop();
                  localStreamRef.current.removeTrack(vt);
                }
                syncTracksToPeers();
              }
            }
          }
          return {
            ...prev,
            ...nextRoom,
            speakRequests: nextRoom.speakRequests ?? prev?.speakRequests ?? [],
            bannedUsers: nextRoom.bannedUsers ?? (nextRoom as any).bans ?? prev?.bannedUsers ?? [],
          };
        });
      }

      if (msg.type === 'voice:joined' && Array.isArray(msg.peers) && user) {
        for (const pUid of msg.peers) {
          if (pUid && pUid !== user.uid) {
            ensurePeerConnection(String(pUid));
          }
        }
      }

      if (msg.type === 'voice:requests' && Array.isArray(msg.requests)) {
        setRoom((prev) => (prev ? { ...prev, speakRequests: msg.requests } : prev));
      }

      if (
        msg.type === 'voice:speak-request-resolved' ||
        msg.type === 'voice:speak_request_resolved'
      ) {
        if (!msg.targetUid || msg.targetUid === user?.uid) {
          if (msg.room) setRoom(msg.room);
          showToast(
            msg.decision === 'approve'
              ? 'You are now on the Speaker Stage! Tap Mic to unmute.'
              : 'Your request to speak was declined.'
          );
        }
      }

      if (msg.type === 'voice:media-mode-changed' || msg.type === 'voice:media-mode') {
        if (msg.mediaMode === 'video') {
          showToast('Room switched to Video Mode. Cameras remain off until enabled.');
        } else {
          showToast('Room switched back to Voice Mode.');
        }
      }

      if (msg.type === 'voice:speaking' && msg.uid) {
        const spk = Boolean(msg.speaking ?? msg.isSpeaking);
        setSpeakingMap((prev) => ({ ...prev, [msg.uid]: spk }));
      }

      const joinedPeerUid = msg.peerUid || msg.uid;
      if (msg.type === 'voice:peer-joined' && joinedPeerUid && user && joinedPeerUid !== user.uid) {
        const pc = ensurePeerConnection(joinedPeerUid);
        if (localStreamRef.current && user.uid < joinedPeerUid) {
          try {
            await pc.setLocalDescription();
            if (pc.localDescription) {
              sendWsMessage({
                type: 'voice:signal',
                roomId,
                targetUid: joinedPeerUid,
                toUid: joinedPeerUid,
                signalData: { description: pc.localDescription },
                signal: { description: pc.localDescription },
              });
            }
          } catch {
            // ignore
          }
        }
      }

      if ((msg.type === 'voice:user-left' || msg.type === 'voice:peer-left') && msg.uid) {
        const pc = peersRef.current.get(msg.uid);
        if (pc) {
          pc.close();
          peersRef.current.delete(msg.uid);
        }
        setRemoteStreams((prev) => {
          const next = { ...prev };
          delete next[msg.uid];
          return next;
        });
      }

      const incomingSignal = msg.signalData || msg.signal;
      if (msg.type === 'voice:signal' && msg.fromUid && incomingSignal && user) {
        const peerUid = String(msg.fromUid);
        const pc = ensurePeerConnection(peerUid);
        const polite = user.uid > peerUid;
        try {
          if (incomingSignal.description) {
            const desc = incomingSignal.description as RTCSessionDescriptionInit;
            const offerCollision =
              desc.type === 'offer' &&
              (makingOfferRef.current.get(peerUid) || pc.signalingState !== 'stable');
            if (offerCollision && !polite) return;
            await pc.setRemoteDescription(desc);
            if (desc.type === 'offer') {
              await pc.setLocalDescription();
              if (pc.localDescription) {
                sendWsMessage({
                  type: 'voice:signal',
                  roomId,
                  targetUid: peerUid,
                  toUid: peerUid,
                  signalData: { description: pc.localDescription },
                  signal: { description: pc.localDescription },
                });
              }
            }
          } else if (incomingSignal.candidate) {
            await pc.addIceCandidate(incomingSignal.candidate).catch(() => {});
          }
        } catch {
          // ignore transient signaling race
        }
      }

      if (
        (msg.type === 'voice:chat-message' || msg.type === 'voice:chat_message') &&
        msg.message
      ) {
        setMessages((prev) => {
          if (prev.some((m) => m.id === msg.message.id)) return prev;
          return [...prev, msg.message];
        });
      }

      if (
        (msg.type === 'voice:chat-reaction' || msg.type === 'voice:chat_reaction') &&
        msg.messageId
      ) {
        setMessages((prev) =>
          prev.map((m) =>
            m.id === msg.messageId ? { ...m, reactions: msg.reactions || [] } : m
          )
        );
      }

      if (
        (msg.type === 'voice:chat-deleted' || msg.type === 'voice:chat_deleted') &&
        msg.messageId
      ) {
        setMessages((prev) => prev.filter((m) => m.id !== msg.messageId));
      }

      if (msg.type === 'voice:typing' && msg.uid && msg.uid !== user?.uid) {
        if (msg.isTyping) {
          setTypingUsers((prev) => ({
            ...prev,
            [msg.uid]: msg.username || msg.displayName || 'hunter',
          }));
        } else {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[msg.uid];
            return next;
          });
        }
      }

      if (msg.type === 'voice:mention' && Number(msg.roomId) === roomId) {
        setMentionBanner({
          senderUsername: msg.senderUsername || msg.message?.sender?.username || 'hunter',
          preview: msg.preview || msg.message?.content || '',
        });
        setTimeout(() => setMentionBanner(null), 5000);
      }

      if (msg.type === 'voice:kicked') {
        cleanupAllMedia();
        joinedRef.current = false;
        navigate('/voice');
      }

      if (msg.type === 'voice:room-ended' || msg.type === 'voice:ended') {
        cleanupAllMedia();
        joinedRef.current = false;
        showToast('Host has ended this Voice Room.');
        setTimeout(() => navigate('/voice'), 1100);
      }
    });
  }, [
    cleanupAllMedia,
    ensurePeerConnection,
    navigate,
    roomId,
    sendWsMessage,
    showToast,
    subscribeWs,
    syncTracksToPeers,
    user,
  ]);

  // Auto-scroll live chat container on new message
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Attach local camera preview whenever camera is active
  const viewerParticipant = useMemo(() => {
    if (!room || !user) return null;
    return (room.participants || []).find((p) => p.uid === user.uid) || null;
  }, [room, user]);

  useEffect(() => {
    if (localVideoPreviewRef.current && localStreamRef.current && viewerParticipant?.isCameraOn) {
      localVideoPreviewRef.current.srcObject = localStreamRef.current;
      localVideoPreviewRef.current.play().catch(() => {});
    }
  }, [viewerParticipant?.isCameraOn]);

  // External @username search fallback when typing @handle in chat
  useEffect(() => {
    if (mentionQuery === null || mentionQuery.length < 1) {
      setExternalMentionMatches([]);
      return;
    }
    const t = setTimeout(() => {
      apiFetch<{ items: any[] }>(`/api/users/search?q=${encodeURIComponent(mentionQuery)}`)
        .then((res) => setExternalMentionMatches((res.items || []).slice(0, 5)))
        .catch(() => setExternalMentionMatches([]));
    }, 180);
    return () => clearTimeout(t);
  }, [mentionQuery]);

  // Invite Hunter search modal
  useEffect(() => {
    if (!inviteOpen || !inviteQuery.trim()) {
      setInviteResults([]);
      return;
    }
    const t = setTimeout(() => {
      apiFetch<{ items: any[] }>(`/api/users/search?q=${encodeURIComponent(inviteQuery.trim())}`)
        .then((res) => setInviteResults((res.items || []).slice(0, 8)))
        .catch(() => setInviteResults([]));
    }, 200);
    return () => clearTimeout(t);
  }, [inviteOpen, inviteQuery]);

  // Toggle Microphone (Speakers / Co-hosts / Host only)
  const handleToggleMute = async () => {
    if (!user || !room) {
      navigate(`/auth/login?redirect=${encodeURIComponent(`/voice/${roomId}`)}`);
      return;
    }
    if (!viewerParticipant || !isSpeakerStageRole(viewerParticipant.role)) {
      showToast('Request a speaker seat first to turn on your microphone.');
      return;
    }
    if (viewerParticipant.isForceMuted && viewerParticipant.isMuted) {
      showToast('You have been muted by the Host or Co-Host.');
      return;
    }

    const nextMuted = !viewerParticipant.isMuted;

    if (!nextMuted) {
      try {
        if (!localStreamRef.current || localStreamRef.current.getAudioTracks().length === 0) {
          const micStream = await navigator.mediaDevices.getUserMedia({
            audio: { echoCancellation: true, noiseSuppression: true },
          });
          if (localStreamRef.current) {
            for (const track of micStream.getAudioTracks()) {
              localStreamRef.current.addTrack(track);
            }
          } else {
            localStreamRef.current = micStream;
          }
          startAudioSpeakingDetector(localStreamRef.current);
          syncTracksToPeers();
          for (const p of room.participants || []) {
            if (p.uid !== user.uid) ensurePeerConnection(p.uid);
          }
        } else {
          for (const t of localStreamRef.current.getAudioTracks()) t.enabled = true;
        }
      } catch {
        showToast('Microphone access denied or unavailable on this device.');
        return;
      }
    } else if (localStreamRef.current) {
      for (const t of localStreamRef.current.getAudioTracks()) t.enabled = false;
      setSpeakingMap((prev) => ({ ...prev, [user.uid]: false }));
      sendWsMessage({ type: 'voice:speaking', roomId, isSpeaking: false });
    }

    try {
      const res = await apiFetch<{ room: VoiceRoomDetail }>(
        `/api/voice-rooms/${roomId}/mute`,
        {
          method: 'POST',
          body: JSON.stringify({ isMuted: nextMuted }),
        }
      );
      if (res.room) setRoom(res.room);
      kageSound.play(nextMuted ? 'voice_mic_off' : 'voice_mic_on');
      sendWsMessage({ type: 'voice:mute', roomId, isMuted: nextMuted });
    } catch (err: any) {
      showToast(err.message || 'Could not update microphone state.');
    }
  };

  // Toggle Camera (Only when room.mediaMode === 'video' AND viewer is on Speaker Stage)
  const handleToggleCamera = async () => {
    if (!user || !room || !viewerParticipant) return;
    if (room.mediaMode !== 'video') {
      showToast('Host must switch the room to Video Mode first.');
      return;
    }
    if (!isSpeakerStageRole(viewerParticipant.role)) {
      showToast('Only active speakers on stage can turn on cameras.');
      return;
    }

    const nextCam = !viewerParticipant.isCameraOn;
    if (nextCam) {
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 360 } },
        });
        if (!localStreamRef.current) {
          localStreamRef.current = camStream;
        } else {
          for (const vt of localStreamRef.current.getVideoTracks()) {
            vt.stop();
            localStreamRef.current.removeTrack(vt);
          }
          for (const vt of camStream.getVideoTracks()) {
            localStreamRef.current.addTrack(vt);
          }
        }
        syncTracksToPeers();
        for (const p of room.participants || []) {
          if (p.uid !== user.uid) ensurePeerConnection(p.uid);
        }
      } catch {
        showToast('Camera permission denied or no camera available.');
        return;
      }
    } else if (localStreamRef.current) {
      for (const vt of localStreamRef.current.getVideoTracks()) {
        vt.stop();
        localStreamRef.current.removeTrack(vt);
      }
      syncTracksToPeers();
    }

    try {
      const res = await apiFetch<{ room: VoiceRoomDetail }>(
        `/api/voice-rooms/${roomId}/camera`,
        {
          method: 'POST',
          body: JSON.stringify({ isCameraOn: nextCam }),
        }
      );
      if (res.room) setRoom(res.room);
      kageSound.play(nextCam ? 'voice_cam_on' : 'voice_cam_off');
      sendWsMessage({ type: 'voice:camera', roomId, isCameraOn: nextCam });
    } catch (err: any) {
      showToast(err.message || 'Could not toggle camera.');
    }
  };

  const handleRequestSpeak = async (cancel = false) => {
    if (!user) {
      navigate(`/auth/login?redirect=${encodeURIComponent(`/voice/${roomId}`)}`);
      return;
    }
    try {
      const res = await apiFetch<{ room?: VoiceRoomDetail; requests?: SpeakRequestItem[] }>(
        `/api/voice-rooms/${roomId}/speak-request`,
        {
          method: 'POST',
          body: JSON.stringify({ action: cancel ? 'cancel' : 'request' }),
        }
      );
      if (res.room) {
        setRoom(res.room);
      } else if (res.requests) {
        setRoom((prev) => (prev ? { ...prev, speakRequests: res.requests || [] } : prev));
      }
      if (!cancel) {
        kageSound.play('voice_speaker_request');
      }
      showToast(cancel ? 'Speak request cancelled.' : 'Request sent to Host & Co-Hosts.');
    } catch (err: any) {
      showToast(err.message || 'Could not request speaker seat.');
    }
  };

  const handleResolveSpeakRequest = async (
    requestId: number,
    decision: 'approve' | 'reject'
  ) => {
    try {
      const res = await apiFetch<{ room: VoiceRoomDetail }>(
        `/api/voice-rooms/${roomId}/speak-requests/${requestId}/respond`,
        {
          method: 'POST',
          body: JSON.stringify({ decision }),
        }
      );
      if (res.room) setRoom(res.room);
      if (decision === 'approve') {
        kageSound.play('voice_speaker_approved');
      }
    } catch (err: any) {
      showToast(err.message || 'Could not resolve speaker request.');
    }
  };

  const handleStepDown = async () => {
    try {
      cleanupAllMedia();
      const res = await apiFetch<{ room: VoiceRoomDetail }>(
        `/api/voice-rooms/${roomId}/step-down`,
        { method: 'POST' }
      );
      if (res.room) setRoom(res.room);
      setSelectedParticipant(null);
      showToast('Returned to listener audience.');
    } catch (err: any) {
      showToast(err.message || 'Could not step down.');
    }
  };

  const handleModerate = async (
    action: string,
    targetUid?: string,
    reason?: string
  ) => {
    try {
      const res = await apiFetch<{ room: VoiceRoomDetail }>(
        `/api/voice-rooms/${roomId}/moderate`,
        {
          method: 'POST',
          body: JSON.stringify({ action, targetUid, reason }),
        }
      );
      if (res.room) setRoom(res.room);
      setSelectedParticipant(null);
      showToast('Moderation updated.');
    } catch (err: any) {
      showToast(err.message || 'Moderation action failed.');
    }
  };

  const handleConvertMediaMode = async (nextMode: 'voice' | 'video') => {
    try {
      if (nextMode === 'voice' && localStreamRef.current) {
        for (const vt of localStreamRef.current.getVideoTracks()) {
          vt.stop();
          localStreamRef.current.removeTrack(vt);
        }
        syncTracksToPeers();
      }
      const res = await apiFetch<{ room: VoiceRoomDetail }>(
        `/api/voice-rooms/${roomId}/media-mode`,
        {
          method: 'POST',
          body: JSON.stringify({ mediaMode: nextMode }),
        }
      );
      if (res.room) setRoom(res.room);
      kageSound.play('voice_host_announce');
      setConfirmVideoSwitch(null);
      setSettingsOpen(false);
    } catch (err: any) {
      showToast(err.message || 'Could not switch room mode.');
    }
  };

  const handleSaveRoomSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!room) return;
    setSavingSettings(true);
    try {
      const res = await apiFetch<{ room: VoiceRoomDetail }>(
        `/api/voice-rooms/${roomId}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            title: editTitle.trim(),
            topic: editTopic.trim(),
            description: editTopic.trim(),
            category: editCategory,
            artworkUrl: editBannerUrl || undefined,
            avatarUrl: editAvatarUrl || undefined,
          }),
        }
      );
      if (res.room) setRoom(res.room);
      setSettingsOpen(false);
      showToast('Room settings saved.');
    } catch (err: any) {
      showToast(err.message || 'Failed to update settings.');
    } finally {
      setSavingSettings(false);
    }
  };

  const handleEndRoom = async () => {
    try {
      cleanupAllMedia();
      joinedRef.current = false;
      await apiFetch(`/api/voice-rooms/${roomId}/end`, { method: 'POST' });
      navigate('/voice');
    } catch (err: any) {
      showToast(err.message || 'Failed to end room.');
    }
  };

  const handleLeaveRoom = async () => {
    cleanupAllMedia();
    joinedRef.current = false;
    sendWsMessage({ type: 'voice:leave', roomId });
    await apiFetch(`/api/voice-rooms/${roomId}/leave`, { method: 'POST' }).catch(() => {});
    navigate('/voice');
  };

  const handleShareRoom = async () => {
    const shareUrl = `${window.location.origin}/voice/${roomId}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast('Room link copied to clipboard!');
    } catch {
      showToast(shareUrl);
    }
  };

  // Chat Input & Exact @username Autocomplete
  const handleChatChange = (val: string) => {
    setChatInput(val);
    sendWsMessage({ type: 'voice:typing', roomId, isTyping: val.trim().length > 0 });
    const match = val.match(/(?:^|\s)@([a-zA-Z0-9_.-]{0,24})$/);
    if (match) {
      setMentionQuery(match[1]);
    } else {
      setMentionQuery(null);
    }
  };

  const mentionCandidates = useMemo(() => {
    if (mentionQuery === null || !room) return [];
    const q = mentionQuery.toLowerCase();
    const roomMatches = (room.participants || []).filter(
      (p) =>
        p.uid !== user?.uid &&
        (p.username.toLowerCase().includes(q) || p.displayName.toLowerCase().includes(q))
    );
    const seen = new Set(roomMatches.map((p) => p.uid));
    const combined: { uid: string; username: string; displayName: string; avatarUrl: string }[] =
      roomMatches.map((p) => ({
        uid: p.uid,
        username: p.username,
        displayName: p.displayName,
        avatarUrl: p.avatarUrl,
      }));
    for (const ext of externalMentionMatches) {
      if (ext.uid !== user?.uid && !seen.has(ext.uid)) {
        seen.add(ext.uid);
        combined.push({
          uid: ext.uid,
          username: ext.username,
          displayName: ext.displayName,
          avatarUrl: ext.avatarUrl,
        });
      }
    }
    return combined.slice(0, 6);
  }, [mentionQuery, room, externalMentionMatches, user?.uid]);

  const insertMentionHandle = (username: string) => {
    setChatInput((prev) => prev.replace(/(?:^|\s)@[a-zA-Z0-9_.-]{0,24}$/, (m) => {
      const prefix = m.startsWith(' ') ? ' ' : '';
      return `${prefix}@${username} `;
    }));
    setMentionQuery(null);
    chatInputRef.current?.focus();
  };

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) {
      navigate(`/auth/login?redirect=${encodeURIComponent(`/voice/${roomId}`)}`);
      return;
    }
    const text = chatInput.trim();
    if (!text) return;
    setSendingChat(true);
    try {
      const res = await apiFetch<{ message: VoiceChatMessageItem }>(
        `/api/voice-rooms/${roomId}/messages`,
        {
          method: 'POST',
          body: JSON.stringify({
            content: text,
            replyToId: replyTo?.id || null,
          }),
        }
      );
      setChatInput('');
      setReplyTo(null);
      setMentionQuery(null);
      sendWsMessage({ type: 'voice:typing', roomId, isTyping: false });
      if (res.message) {
        setMessages((prev) =>
          prev.some((m) => m.id === res.message.id) ? prev : [...prev, res.message]
        );
      }
    } catch (err: any) {
      showToast(err.message || 'Could not send message.');
    } finally {
      setSendingChat(false);
    }
  };

  const handleReactMessage = async (msgId: number, emoji: string) => {
    if (!user) return;
    setReactionPickerMsgId(null);
    try {
      const res = await apiFetch<{ reactions: VoiceChatReactionSummary[] }>(
        `/api/voice-rooms/${roomId}/messages/${msgId}/react`,
        {
          method: 'POST',
          body: JSON.stringify({ emoji }),
        }
      );
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, reactions: res.reactions || [] } : m))
      );
    } catch {
      // ignore
    }
  };

  const handleDeleteMessage = async (msgId: number) => {
    try {
      await apiFetch(`/api/voice-rooms/${roomId}/messages/${msgId}`, { method: 'DELETE' });
      setMessages((prev) => prev.filter((m) => m.id !== msgId));
    } catch (err: any) {
      showToast(err.message || 'Could not delete message.');
    }
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto space-y-4 py-2">
        <div className="h-36 rounded-2xl bg-[#141116] animate-pulse border border-white/8" />
        <div className="h-72 rounded-2xl bg-[#141116] animate-pulse border border-white/8" />
      </div>
    );
  }

  if (error || !room || room.viewerBanned) {
    return (
      <div className="max-w-lg mx-auto p-8 rounded-2xl bg-[#141116] border border-white/12 text-center space-y-4 my-6">
        <AlertCircle className="w-8 h-8 text-[#C0263D] mx-auto" />
        <h2 className="text-base font-bold text-[#F5F1F2]">
          {room?.viewerBanned ? 'Banned from This Voice Room' : 'Voice Room Unavailable'}
        </h2>
        <p className="text-xs text-[#A7A0AA]">
          {room?.viewerBanned
            ? 'The Host or Co-Host has restricted your access to this room.'
            : error || 'This voice room has ended or does not exist.'}
        </p>
        <Link
          to="/voice"
          className="inline-flex min-h-[42px] px-5 items-center rounded-xl bg-[#6D28D9] text-white text-xs font-semibold"
        >
          Browse Live Voice Rooms
        </Link>
      </div>
    );
  }

  const viewerRole = viewerParticipant?.role || room.viewerRole || null;
  const isViewerHost =
    viewerRole === 'host' ||
    (user && room.hostUid === user.uid) ||
    user?.role === 'owner';
  const isViewerMod = Boolean(isViewerHost || isHostOrCoHostRole(viewerRole));
  const isViewerSpeaker = Boolean(viewerParticipant && isSpeakerStageRole(viewerParticipant.role));

  // Build strict 12-seat Speaker Grid (Seats 1..12)
  const activeSpeakers = (room.participants || []).filter((p) => isSpeakerStageRole(p.role));
  const listeners = (room.participants || []).filter((p) => !isSpeakerStageRole(p.role));

  const seatsGrid: (VoiceParticipant | null)[] = Array.from({ length: 12 }, () => null);
  const unassignedSpeakers: VoiceParticipant[] = [];
  for (const sp of activeSpeakers) {
    const idx = Number(sp.seatNumber || 0) - 1;
    if (idx >= 0 && idx < 12 && !seatsGrid[idx]) {
      seatsGrid[idx] = sp;
    } else {
      unassignedSpeakers.push(sp);
    }
  }
  for (const sp of unassignedSpeakers) {
    const emptyIdx = seatsGrid.findIndex((s) => s === null);
    if (emptyIdx !== -1) seatsGrid[emptyIdx] = sp;
  }

  const viewerPendingRequest = (room.speakRequests || []).find(
    (r) => r.userUid === user?.uid && r.status === 'pending'
  );
  const activeTypingNames = Object.values(typingUsers);

  return (
    <div className="max-w-3xl mx-auto space-y-4 -mx-3.5 sm:mx-auto -mt-3 sm:mt-0 pb-24">
      {/* Hidden audio renderers for remote WebRTC streams when in voice mode */}
      {room.mediaMode === 'voice' &&
        Object.entries(remoteStreams).map(([uid, stream]) => (
          <RemoteMediaTile
            key={uid}
            stream={stream}
            participant={(room.participants || []).find((p) => p.uid === uid)}
            audioMuted={audioOutputMuted}
          />
        ))}

      {/* Toast & @Mention Notifications */}
      {toast && (
        <div className="fixed top-6 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 rounded-xl bg-[#141116] border border-[#6D28D9] text-xs font-semibold text-[#F5F1F2] shadow-2xl">
          {toast}
        </div>
      )}

      {mentionBanner && (
        <div className="mx-3.5 sm:mx-0 rounded-xl bg-[#6D28D9]/20 border border-[#6D28D9] px-4 py-2.5 flex items-center justify-between gap-3 text-xs text-[#F5F1F2]">
          <span>
            <strong className="text-white">@{mentionBanner.senderUsername}</strong> mentioned you:{' '}
            {mentionBanner.preview}
          </span>
          <button
            type="button"
            onClick={() => setMentionBanner(null)}
            className="text-[#A7A0AA] hover:text-white cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* MAIN VOICE & VIDEO ROOM SHELL — Reference Target Design (IMG_20261028_171642.png) */}
      <div className="rounded-none sm:rounded-3xl overflow-hidden bg-[#09080B] sm:bg-[#0D0B12] sm:border border-white/10 shadow-[0_24px_60px_rgba(0,0,0,0.75)]">
        {/* Sleek Room Cover Banner + Header Bar */}
        <div className="relative overflow-hidden border-b border-white/8">
          <KageImage
            src={room.bannerUrl || room.artworkUrl}
            alt={room.title}
            className="absolute inset-0 w-full h-full object-cover opacity-25 pointer-events-none"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#09080B]/70 via-[#09080B]/88 to-[#09080B] pointer-events-none" />

          <div className="relative z-10 px-4 sm:px-6 pt-4 pb-3.5 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <button
                type="button"
                onClick={handleLeaveRoom}
                className="min-h-[40px] min-w-[40px] -ml-1 rounded-full hover:bg-white/10 flex items-center justify-center text-[#F5F1F2] shrink-0 cursor-pointer transition-colors"
                aria-label="Leave voice room"
              >
                <X className="w-5 h-5" />
              </button>

              <div className="w-11 h-11 sm:w-13 sm:h-13 rounded-full p-[2px] bg-gradient-to-tr from-[#6D28D9] to-[#C0263D] shrink-0 shadow-[0_0_18px_rgba(109,40,217,0.4)]">
                <div className="w-full h-full rounded-full overflow-hidden bg-[#09080B]">
                  <KageImage
                    src={room.avatarUrl || room.artworkUrl}
                    alt={room.title}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="text-base sm:text-lg font-bold text-[#F5F1F2] truncate">
                    {room.title}
                  </h1>
                  {room.isLocked && <Lock className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                </div>
                <p className="text-xs text-[#A7A0AA] truncate mt-0.5">
                  {room.category || 'Anime Vibes'} · {room.participantCount || 0} Online
                  {wsConnected ? '' : ' · Reconnecting'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setInviteOpen(true)}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-[#141116]/90 hover:bg-[#1C1720] border border-white/10 flex items-center justify-center text-[#F5F1F2] cursor-pointer"
                aria-label="Invite hunters"
                title="Invite Hunters"
              >
                <UserPlus className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={handleShareRoom}
                className="min-h-[38px] min-w-[38px] rounded-xl bg-[#141116]/90 hover:bg-[#1C1720] border border-white/10 flex items-center justify-center text-[#F5F1F2] cursor-pointer"
                aria-label="Share room"
                title="Copy Room Link"
              >
                <Share2 className="w-4 h-4" />
              </button>
              {isViewerMod && (
                <button
                  type="button"
                  onClick={() => setSettingsOpen(true)}
                  className="min-h-[38px] min-w-[38px] rounded-xl bg-[#141116]/90 hover:bg-[#1C1720] border border-[#6D28D9]/50 flex items-center justify-center text-[#F5F1F2] cursor-pointer"
                  aria-label="Room settings"
                  title="Room Settings & Switch to Video Room"
                >
                  <Settings className="w-4 h-4 text-[#6D28D9]" />
                </button>
              )}
              {user && (
                <button
                  type="button"
                  onClick={() =>
                    setReportTarget({ type: 'voice_room', id: room.id, label: room.title })
                  }
                  className="hidden sm:flex min-h-[38px] min-w-[38px] rounded-xl bg-[#141116]/90 hover:bg-[#1C1720] border border-white/10 items-center justify-center text-[#A7A0AA] hover:text-white cursor-pointer"
                  aria-label="Report room"
                >
                  <Flag className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>

          {room.topic && (
            <p className="relative z-10 px-4 sm:px-6 pb-3 text-xs text-[#A7A0AA] line-clamp-2 leading-relaxed">
              {room.topic}
            </p>
          )}
        </div>

        <div className="px-4 sm:px-6 py-4 space-y-6">
          {/* LIVE VIDEO MODE STAGE (Converted seamlessly from Voice Room without changing roomId) */}
          {room.mediaMode === 'video' && (
            <div className="space-y-3">
              <div className="rounded-xl bg-gradient-to-r from-[#6D28D9]/20 via-[#C0263D]/15 to-[#141116] border border-[#6D28D9]/45 px-3.5 py-2.5 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-xs text-[#F5F1F2]">
                  <Video className="w-4 h-4 text-[#6D28D9] shrink-0" />
                  <span>
                    <strong>Video Room Active</strong> · Speakers can turn cameras on voluntarily;
                    listeners watch live.
                  </span>
                </div>
                {isViewerHost && (
                  <button
                    type="button"
                    onClick={() => setConfirmVideoSwitch('voice')}
                    className="text-xs font-semibold text-[#C0263D] hover:underline shrink-0 cursor-pointer"
                  >
                    Switch to Voice
                  </button>
                )}
              </div>

              {(viewerParticipant?.isCameraOn ||
                activeSpeakers.some((s) => s.isCameraOn && remoteStreams[s.uid])) && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {viewerParticipant?.isCameraOn && (
                    <div
                      className={`relative aspect-video rounded-2xl overflow-hidden bg-[#09080B] border-2 ${
                        speakingMap[viewerParticipant.uid]
                          ? 'border-emerald-400 shadow-[0_0_20px_rgba(52,211,153,0.35)]'
                          : 'border-[#6D28D9]'
                      }`}
                    >
                      <video
                        ref={localVideoPreviewRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover scale-x-[-1]"
                      />
                      <div className="absolute inset-x-0 bottom-0 p-2.5 bg-gradient-to-t from-black/85 to-transparent flex items-center justify-between text-xs text-white">
                        <span className="font-semibold inline-flex items-center gap-1.5">
                          {viewerParticipant.role === 'host' && (
                            <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" aria-label="Host" />
                          )}
                          <span>{viewerParticipant.displayName} (You)</span>
                        </span>
                        {viewerParticipant.isMuted ? (
                          <MicOff className="w-3.5 h-3.5 text-rose-400" />
                        ) : (
                          <Mic className="w-3.5 h-3.5 text-emerald-400" />
                        )}
                      </div>
                    </div>
                  )}

                  {Object.entries(remoteStreams).map(([uid, stream]) => (
                    <RemoteMediaTile
                      key={uid}
                      stream={stream}
                      participant={(room.participants || []).find((p) => p.uid === uid)}
                      isSpeaking={Boolean(speakingMap[uid])}
                      audioMuted={audioOutputMuted}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* PENDING SPEAK REQUESTS QUEUE FOR HOST & CO-HOSTS */}
          {isViewerMod && (room.speakRequests || []).length > 0 && (
            <div className="rounded-2xl bg-[#141116] border border-[#6D28D9]/45 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-[#F5F1F2]">
                <span className="flex items-center gap-1.5">
                  <Hand className="w-4 h-4 text-amber-400" />
                  <span>Speaker Requests ({(room.speakRequests || []).length})</span>
                </span>
                <span className="text-[#A7A0AA] font-mono-num">
                  {activeSpeakers.length}/12 seats filled
                </span>
              </div>
              <div className="space-y-2">
                {(room.speakRequests || []).map((req) => (
                  <div
                    key={req.id}
                    className="rounded-xl bg-[#09080B] border border-white/10 p-2.5 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <KageImage
                        src={req.avatarUrl}
                        alt={req.displayName}
                        className="w-8 h-8 rounded-full object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#F5F1F2] truncate">
                          {req.displayName}
                        </p>
                        <p className="text-[11px] text-[#A7A0AA] truncate">@{req.username}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleResolveSpeakRequest(req.id, 'reject')}
                        className="min-h-[34px] px-3 rounded-lg bg-[#141116] border border-white/10 text-xs text-[#A7A0AA] hover:text-rose-300 cursor-pointer"
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        disabled={activeSpeakers.length >= 12}
                        onClick={() => handleResolveSpeakRequest(req.id, 'approve')}
                        className="min-h-[34px] px-3.5 rounded-lg bg-[#6D28D9] hover:bg-[#7c3aed] disabled:opacity-45 text-xs font-semibold text-white cursor-pointer"
                      >
                        Approve
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 12-SPEAKER STAGE GRID — STRICT MAXIMUM 12 SEATS */}
          <section aria-label="Speakers Stage" className="space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base sm:text-lg font-bold text-[#F5F1F2]">
                Speakers ({activeSpeakers.length})
              </h2>

              {isViewerMod ? (
                <button
                  type="button"
                  onClick={() => handleModerate('mute_all')}
                  className="min-h-[36px] px-3.5 rounded-full bg-[#141116] hover:bg-[#1C1720] border border-white/15 text-xs font-semibold text-[#F5F1F2] inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <MicOff className="w-3.5 h-3.5 text-[#A7A0AA]" />
                  <span>Mute All</span>
                </button>
              ) : (
                <span className="text-xs font-mono-num text-[#A7A0AA]">
                  {activeSpeakers.length}/12 Max Seats
                </span>
              )}
            </div>

            <div className="grid grid-cols-4 gap-x-2.5 sm:gap-x-4 gap-y-4 sm:gap-y-5">
              {seatsGrid.map((speaker, idx) => {
                const seatNum = idx + 1;
                if (!speaker) {
                  return (
                    <button
                      key={`empty-seat-${seatNum}`}
                      type="button"
                      onClick={() => {
                        if (!user) {
                          navigate(
                            `/auth/login?redirect=${encodeURIComponent(`/voice/${roomId}`)}`
                          );
                          return;
                        }
                        if (isViewerSpeaker) {
                          showToast(`You are already on stage.`);
                          return;
                        }
                        if (!viewerPendingRequest) {
                          handleRequestSpeak(false);
                        }
                      }}
                      className="group flex flex-col items-center text-center cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D28D9] min-w-0 rounded-2xl px-1.5 py-2.5 bg-[#141116]/25 border border-dashed border-white/10 hover:border-[#6D28D9]/55 hover:bg-[#141116]/55 transition-colors"
                    >
                      <div className="w-14 h-14 sm:w-18 sm:h-18 rounded-full border border-dashed border-white/15 group-hover:border-[#6D28D9]/70 bg-[#09080B]/60 flex items-center justify-center transition-colors">
                        <Plus className="w-4 h-4 text-[#A7A0AA]/60 group-hover:text-[#6D28D9]" />
                      </div>
                      <span className="text-[11px] sm:text-xs font-medium text-[#A7A0AA]/75 mt-1.5 truncate max-w-full">
                        Seat {seatNum}
                      </span>
                      <span className="text-[10px] sm:text-[11px] text-[#A7A0AA]/45 leading-tight">
                        Open
                      </span>
                      <div className="w-full max-w-[84px] h-6 mt-1 flex items-center justify-center" aria-hidden="true">
                        <span className="w-10 h-px bg-white/8" />
                      </div>
                    </button>
                  );
                }

                const isSpeaking = Boolean(speakingMap[speaker.uid]) && !speaker.isMuted;
                const isHost = speaker.role === 'host';
                return (
                  <button
                    key={speaker.uid}
                    type="button"
                    onClick={() => setSelectedParticipant(speaker)}
                    className={`flex flex-col items-center text-center group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6D28D9] min-w-0 rounded-2xl px-1.5 py-2.5 transition-colors border ${
                      isSpeaking
                        ? 'bg-emerald-500/[0.06] border-emerald-400/30'
                        : 'bg-[#141116]/45 border-white/[0.05] hover:bg-[#141116]/80 hover:border-white/12'
                    }`}
                  >
                    <div className="relative">
                      <div
                        className={`w-14 h-14 sm:w-18 sm:h-18 rounded-full p-[2px] bg-gradient-to-tr from-[#6D28D9] via-[#9333EA] to-[#C0263D] transition-all ${
                          isSpeaking
                            ? 'ring-3 ring-emerald-400/55 shadow-[0_0_20px_rgba(52,211,153,0.45)] scale-[1.03]'
                            : ''
                        }`}
                      >
                        <div className="w-full h-full rounded-full overflow-hidden bg-[#09080B]">
                          <KageImage
                            src={speaker.avatarUrl}
                            alt={speaker.displayName}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      </div>

                      {/* Bottom-right Mic Status Badge */}
                      <span
                        className={`absolute -bottom-0.5 -right-0.5 w-5 h-5 sm:w-6 sm:h-6 rounded-full border-2 border-[#09080B] flex items-center justify-center ${
                          speaker.isMuted
                            ? 'bg-[#1C1720] text-[#A7A0AA]'
                            : isSpeaking
                              ? 'bg-emerald-500 text-[#09080B]'
                              : 'bg-[#09080B] text-emerald-400'
                        }`}
                      >
                        {speaker.isMuted ? (
                          <MicOff className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        ) : (
                          <Mic className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                        )}
                      </span>

                      {room.mediaMode === 'video' && speaker.isCameraOn && (
                        <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-[#6D28D9] border-2 border-[#09080B] text-white flex items-center justify-center">
                          <Video className="w-2.5 h-2.5" />
                        </span>
                      )}
                    </div>

                    <div className="mt-1.5 max-w-full flex items-center justify-center gap-1 px-0.5">
                      {isHost && (
                        <Crown className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" aria-label="Host" />
                      )}
                      <span className="text-[11px] sm:text-xs font-semibold text-[#F5F1F2] truncate">
                        {speaker.username || speaker.displayName}
                      </span>
                    </div>
                    <span className="text-[10px] sm:text-[11px] text-[#A7A0AA] leading-tight">
                      {formatRoleLabel(speaker.role)}
                    </span>

                    {/* Live Real-Time D3 Voice Waveform */}
                    <SpeakerLiveWaveform
                      uid={speaker.uid}
                      isSpeaking={isSpeaking}
                      isMuted={speaker.isMuted}
                      isHost={isHost}
                      getFrequencyData={getSpeakerFrequencyData}
                      className="mt-1"
                    />
                  </button>
                );
              })}
            </div>
          </section>

          {/* LISTENERS SECTION */}
          <section aria-label="Listeners" className="pt-4 border-t border-white/8 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-base sm:text-lg font-bold text-[#F5F1F2]">
                Listeners ({listeners.length})
              </h2>
              <button
                type="button"
                onClick={() => setListenersModalOpen(true)}
                className="text-xs font-semibold text-[#A7A0AA] hover:text-[#F5F1F2] inline-flex items-center gap-0.5 cursor-pointer"
              >
                <span>View All</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {listeners.length === 0 ? (
              <p className="text-xs text-[#A7A0AA]">
                No listeners in the audience yet — share this room link to invite hunters!
              </p>
            ) : (
              <div className="flex flex-nowrap items-start gap-4 overflow-x-auto no-scrollbar pb-1">
                {listeners.slice(0, 14).map((listener) => (
                  <button
                    key={listener.uid}
                    type="button"
                    onClick={() => setSelectedParticipant(listener)}
                    className="flex flex-col items-center text-center shrink-0 w-16 cursor-pointer"
                  >
                    <div className="relative w-13 h-13 rounded-full overflow-hidden border border-white/18 bg-[#141116]">
                      <KageImage
                        src={listener.avatarUrl}
                        alt={listener.displayName}
                        className="w-full h-full object-cover"
                      />
                      <span className="absolute bottom-0.5 right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 border border-[#0D0B12]" />
                    </div>
                    <span className="text-[11px] text-[#F5F1F2]/90 truncate w-full mt-1.5">
                      {listener.username || listener.displayName}
                    </span>
                  </button>
                ))}
                {listeners.length > 5 && (
                  <button
                    type="button"
                    onClick={() => setListenersModalOpen(true)}
                    className="w-12 h-12 rounded-full bg-[#141116] border border-white/12 flex items-center justify-center text-[#A7A0AA] hover:text-white shrink-0 mt-0.5 cursor-pointer"
                    aria-label="View all listeners"
                  >
                    <MoreHorizontal className="w-5 h-5" />
                  </button>
                )}
              </div>
            )}
          </section>

          {/* INTEGRATED REAL-TIME TEXT CHAT + EXACT @USERNAME MENTION SYSTEM */}
          <section
            aria-label="Room Live Chat"
            className="pt-4 border-t border-white/8 space-y-3"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-[#6D28D9]" />
                <h2 className="text-sm sm:text-base font-bold text-[#F5F1F2]">Live Room Chat</h2>
              </div>
              {!room.isChatEnabled && (
                <span className="text-[11px] text-amber-300 flex items-center gap-1">
                  <MessageSquareOff className="w-3.5 h-3.5" />
                  <span>Host muted listener chat</span>
                </span>
              )}
            </div>

            <div
              ref={chatScrollRef}
              className="h-64 sm:h-72 overflow-y-auto rounded-2xl bg-[#09080B] border border-white/8 p-3 space-y-2.5 kage-thin-scrollbar"
            >
              {messages.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center px-4">
                  <p className="text-xs text-[#A7A0AA]">
                    Say hello or tag someone with <span className="text-[#F5F1F2]">@username</span>{' '}
                    to start the conversation!
                  </p>
                </div>
              ) : (
                messages.map((m) => {
                  const mentionedMe =
                    Boolean(user?.uid) &&
                    (m.mentions || []).some((mt) => mt.uid === user?.uid);
                  const canDelete = Boolean(
                    isViewerMod || (user && m.senderUid === user.uid)
                  );
                  return (
                    <div
                      key={m.id}
                      className={`group rounded-xl p-2.5 transition-colors ${
                        mentionedMe
                          ? 'bg-[#6D28D9]/15 border border-[#6D28D9]/45'
                          : 'bg-[#141116]/85 border border-white/6'
                      }`}
                    >
                      {m.replyPreview && (
                        <div className="mb-1.5 pl-2 border-l-2 border-[#6D28D9] text-[11px] text-[#A7A0AA] truncate">
                          Replying to @{m.replyPreview.senderUsername}: {m.replyPreview.content}
                        </div>
                      )}

                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <Link
                            to={`/profile/${m.sender.username}`}
                            className="w-7 h-7 rounded-full overflow-hidden bg-[#09080B] shrink-0 mt-0.5"
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
                                @{m.sender.username}
                              </span>
                              {m.createdAt && (
                                <span className="text-[10px] font-mono-num text-[#A7A0AA]/75">
                                  ·{' '}
                                  {new Date(m.createdAt).toLocaleTimeString([], {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </span>
                              )}
                            </div>
                            <p className="text-xs sm:text-sm text-[#F5F1F2]/95 break-words mt-0.5 leading-relaxed">
                              {renderVoiceChatRichText(m.content, m.mentions || [])}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity shrink-0">
                          <button
                            type="button"
                            onClick={() =>
                              setReactionPickerMsgId((prev) => (prev === m.id ? null : m.id))
                            }
                            className="p-1 rounded text-[#A7A0AA] hover:text-white cursor-pointer"
                            aria-label="React"
                          >
                            <Smile className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setReplyTo(m);
                              chatInputRef.current?.focus();
                            }}
                            className="p-1 rounded text-[#A7A0AA] hover:text-white cursor-pointer"
                            aria-label="Reply"
                          >
                            <Reply className="w-3.5 h-3.5" />
                          </button>
                          {user && m.senderUid !== user.uid && (
                            <button
                              type="button"
                              onClick={() =>
                                setReportTarget({
                                  type: 'message',
                                  id: m.id,
                                  label: `@${m.sender.username}: ${m.content.slice(0, 48)}`,
                                })
                              }
                              className="p-1 rounded text-[#A7A0AA] hover:text-amber-300 cursor-pointer"
                              aria-label="Report message"
                              title="Report message"
                            >
                              <Flag className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              type="button"
                              onClick={() => handleDeleteMessage(m.id)}
                              className="p-1 rounded text-[#A7A0AA] hover:text-rose-400 cursor-pointer"
                              aria-label="Delete message"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {reactionPickerMsgId === m.id && (
                        <div className="mt-2 flex items-center gap-1.5 bg-[#09080B] border border-white/12 rounded-xl px-2.5 py-1 w-fit">
                          {QUICK_REACTIONS.map((emoji) => (
                            <button
                              key={emoji}
                              type="button"
                              onClick={() => handleReactMessage(m.id, emoji)}
                              className="text-sm hover:scale-125 transition-transform px-1 cursor-pointer"
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}

                      {Array.isArray(m.reactions) && m.reactions.length > 0 && (
                        <div className="mt-1.5 flex items-center flex-wrap gap-1.5 pl-9">
                          {m.reactions.map((rx) => {
                            const mine = Boolean(user?.uid && rx.uids.includes(user.uid));
                            return (
                              <button
                                key={rx.emoji}
                                type="button"
                                onClick={() => handleReactMessage(m.id, rx.emoji)}
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

            {activeTypingNames.length > 0 && (
              <p className="text-[11px] text-[#A7A0AA] px-1">
                @{activeTypingNames.slice(0, 2).join(', @')} typing...
              </p>
            )}

            {/* Chat Composer with @username Autocomplete */}
            <div className="relative">
              {mentionCandidates.length > 0 && (
                <div className="absolute bottom-full left-0 right-0 mb-2 rounded-2xl bg-[#141116] border border-[#6D28D9]/55 shadow-2xl overflow-hidden z-30">
                  <div className="px-3 py-1.5 text-[11px] font-semibold text-[#A7A0AA] border-b border-white/8">
                    Mention Participant (@username)
                  </div>
                  {mentionCandidates.map((cand) => (
                    <button
                      key={cand.uid}
                      type="button"
                      onClick={() => insertMentionHandle(cand.username)}
                      className="w-full px-3 py-2 hover:bg-[#1C1720] flex items-center gap-2.5 text-left cursor-pointer"
                    >
                      <KageImage
                        src={cand.avatarUrl}
                        alt={cand.displayName}
                        className="w-7 h-7 rounded-full object-cover shrink-0"
                      />
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-[#F5F1F2] truncate">
                          {cand.displayName}
                        </p>
                        <p className="text-[11px] text-[#A7A0AA] truncate">@{cand.username}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}

              {replyTo && (
                <div className="mb-2 px-3 py-1.5 rounded-xl bg-[#141116] border border-white/10 flex items-center justify-between text-xs text-[#A7A0AA]">
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

              <form onSubmit={handleSendChat} className="flex items-center gap-2">
                <input
                  ref={chatInputRef}
                  type="text"
                  disabled={!room.isChatEnabled && !isViewerMod}
                  value={chatInput}
                  onChange={(e) => handleChatChange(e.target.value)}
                  placeholder={
                    !user
                      ? 'Sign in to chat and @mention hunters...'
                      : !room.isChatEnabled && !isViewerMod
                        ? 'Chat is currently disabled by Host'
                        : 'Message room or @mention a hunter...'
                  }
                  className="flex-1 min-h-[44px] rounded-xl bg-[#09080B] border border-white/12 px-3.5 text-xs sm:text-sm text-[#F5F1F2] placeholder-[#A7A0AA]/65 focus:outline-none focus:border-[#6D28D9] disabled:opacity-50"
                />
                <button
                  type="submit"
                  disabled={sendingChat || (!room.isChatEnabled && !isViewerMod)}
                  className="min-h-[44px] px-4 rounded-xl bg-[#6D28D9] hover:bg-[#7c3aed] disabled:opacity-45 text-white text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span className="hidden sm:inline">Send</span>
                </button>
              </form>
            </div>
          </section>
        </div>
      </div>

      {/* FLOATING VOICE & VIDEO ACTION BAR */}
      <div className="fixed bottom-3 lg:bottom-4 left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:w-full sm:max-w-xl z-30 rounded-2xl bg-[#141116]/95 backdrop-blur-md border border-white/15 px-3 py-2.5 shadow-[0_16px_40px_rgba(0,0,0,0.85)] flex items-center justify-between gap-2">
        {!user ? (
          <Link
            to={`/auth/login?redirect=${encodeURIComponent(`/voice/${roomId}`)}`}
            className="flex-1 min-h-[42px] rounded-xl bg-[#C0263D] text-white text-xs sm:text-sm font-semibold flex items-center justify-center gap-2"
          >
            <Mic className="w-4 h-4" />
            <span>Sign In to Join Voice Stage</span>
          </Link>
        ) : isViewerSpeaker ? (
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleToggleMute}
              className={`min-h-[42px] px-3.5 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                viewerParticipant?.isMuted
                  ? 'bg-[#09080B] border border-white/15 text-[#F5F1F2] hover:border-[#6D28D9]'
                  : 'bg-emerald-500/20 border border-emerald-400/60 text-emerald-300'
              }`}
            >
              {viewerParticipant?.isMuted ? (
                <>
                  <MicOff className="w-4 h-4 text-rose-400" />
                  <span>Unmute</span>
                </>
              ) : (
                <>
                  <Mic className="w-4 h-4 text-emerald-400" />
                  <span>Live Mic</span>
                </>
              )}
            </button>

            {room.mediaMode === 'video' && (
              <button
                type="button"
                onClick={handleToggleCamera}
                className={`min-h-[42px] px-3 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors ${
                  viewerParticipant?.isCameraOn
                    ? 'bg-[#6D28D9] text-white'
                    : 'bg-[#09080B] border border-white/15 text-[#F5F1F2]'
                }`}
              >
                {viewerParticipant?.isCameraOn ? (
                  <>
                    <Video className="w-4 h-4" />
                    <span className="hidden sm:inline">Camera On</span>
                  </>
                ) : (
                  <>
                    <VideoOff className="w-4 h-4 text-[#A7A0AA]" />
                    <span className="hidden sm:inline">Camera Off</span>
                  </>
                )}
              </button>
            )}

            <button
              type="button"
              onClick={() => setAudioOutputMuted((v) => !v)}
              className={`min-h-[42px] min-w-[42px] px-2.5 rounded-xl border text-xs inline-flex items-center justify-center cursor-pointer transition-colors ${
                audioOutputMuted
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  : 'bg-[#09080B] border-white/12 text-[#F5F1F2]'
              }`}
              aria-label={audioOutputMuted ? 'Unmute room audio output' : 'Mute room audio output'}
              title={audioOutputMuted ? 'Room Audio Muted (Click to Unmute)' : 'Room Audio Output On'}
            >
              {audioOutputMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>

            {viewerParticipant?.role !== 'host' && (
              <button
                type="button"
                onClick={handleStepDown}
                className="min-h-[42px] px-3 rounded-xl bg-[#09080B] border border-white/12 text-xs text-[#A7A0AA] hover:text-white inline-flex items-center gap-1.5 cursor-pointer"
                title="Return to audience"
              >
                <ArrowDownCircle className="w-4 h-4" />
                <span className="hidden sm:inline">Audience</span>
              </button>
            )}
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {viewerPendingRequest ? (
              <button
                type="button"
                onClick={() => handleRequestSpeak(true)}
                className="min-h-[42px] px-3.5 rounded-xl bg-amber-500/15 border border-amber-400/45 text-xs font-semibold text-amber-200 inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Hand className="w-4 h-4" />
                <span>Pending · Cancel</span>
              </button>
            ) : (
              <button
                type="button"
                disabled={activeSpeakers.length >= 12}
                onClick={() => handleRequestSpeak(false)}
                className="min-h-[42px] px-3.5 rounded-xl bg-[#6D28D9] hover:bg-[#7c3aed] disabled:opacity-45 text-xs font-semibold text-white inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Hand className="w-4 h-4" />
                <span>
                  {activeSpeakers.length >= 12 ? '12/12 Full' : 'Request to Speak'}
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setAudioOutputMuted((v) => !v)}
              className={`min-h-[42px] min-w-[42px] px-2.5 rounded-xl border text-xs inline-flex items-center justify-center cursor-pointer transition-colors ${
                audioOutputMuted
                  ? 'bg-rose-500/15 border-rose-500/40 text-rose-300'
                  : 'bg-[#09080B] border-white/12 text-[#F5F1F2]'
              }`}
              aria-label={audioOutputMuted ? 'Unmute room audio output' : 'Mute room audio output'}
              title={audioOutputMuted ? 'Room Audio Muted (Click to Unmute)' : 'Room Audio Output On'}
            >
              {audioOutputMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
            </button>
          </div>
        )}

        <button
          type="button"
          onClick={handleLeaveRoom}
          className="min-h-[42px] px-3.5 sm:px-4 rounded-xl bg-[#C0263D] hover:bg-[#d42b44] text-white text-xs font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
        >
          <PhoneOff className="w-4 h-4" />
          <span>Leave</span>
        </button>
      </div>

      {/* PARTICIPANT PROFILE & MODERATION POPOVER */}
      {selectedParticipant && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[#141116] border border-white/15 p-5 space-y-4 text-[#F5F1F2]">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <KageImage
                  src={selectedParticipant.avatarUrl}
                  alt={selectedParticipant.displayName}
                  className="w-13 h-13 rounded-full object-cover border-2 border-[#6D28D9] shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-sm font-bold truncate flex items-center gap-1.5">
                    {selectedParticipant.role === 'host' && (
                      <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400 shrink-0" aria-label="Host" />
                    )}
                    <span>{selectedParticipant.displayName}</span>
                    <OwnerBadge role={selectedParticipant.userRole} size="xs" />
                  </p>
                  <p className="text-xs text-[#A7A0AA] truncate">
                    @{selectedParticipant.username} · {formatRoleLabel(selectedParticipant.role)}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedParticipant(null)}
                className="p-1.5 rounded-lg text-[#A7A0AA] hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Link
                to={`/profile/${selectedParticipant.username}`}
                onClick={() => setSelectedParticipant(null)}
                className="min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 text-xs font-semibold flex items-center justify-center hover:border-[#6D28D9]"
              >
                View Profile
              </Link>
              <button
                type="button"
                onClick={() => {
                  const u = selectedParticipant.username;
                  setSelectedParticipant(null);
                  setChatInput((prev) => `${prev ? `${prev} ` : ''}@${u} `);
                  chatInputRef.current?.focus();
                }}
                className="min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 text-xs font-semibold hover:border-[#6D28D9] cursor-pointer"
              >
                @Mention
              </button>
            </div>

            {user?.uid === selectedParticipant.uid &&
              isSpeakerStageRole(selectedParticipant.role) &&
              selectedParticipant.role !== 'host' && (
                <button
                  type="button"
                  onClick={handleStepDown}
                  className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 text-xs font-semibold text-[#A7A0AA] hover:text-white cursor-pointer"
                >
                  Step Down to Audience
                </button>
              )}

            {/* Host / Co-Host Moderation Actions */}
            {isViewerMod &&
              selectedParticipant.uid !== user?.uid &&
              selectedParticipant.role !== 'host' && (
                <div className="pt-3 border-t border-white/10 space-y-2">
                  <p className="text-[11px] font-semibold text-[#A7A0AA]">Stage &amp; Moderation</p>

                  {isSpeakerStageRole(selectedParticipant.role) ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          handleModerate(
                            selectedParticipant.isForceMuted ? 'unforce_mute' : 'force_mute',
                            selectedParticipant.uid
                          )
                        }
                        className="min-h-[38px] px-3 rounded-xl bg-[#09080B] border border-white/12 text-xs font-semibold hover:border-amber-400 cursor-pointer"
                      >
                        {selectedParticipant.isForceMuted ? 'Allow Unmute' : 'Force Mute'}
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          handleModerate('move_to_listeners', selectedParticipant.uid)
                        }
                        className="min-h-[38px] px-3 rounded-xl bg-[#09080B] border border-white/12 text-xs font-semibold hover:border-[#6D28D9] cursor-pointer"
                      >
                        Move to Audience
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      disabled={activeSpeakers.length >= 12}
                      onClick={() => handleModerate('invite_to_speak', selectedParticipant.uid)}
                      className="w-full min-h-[38px] rounded-xl bg-[#6D28D9] disabled:opacity-45 text-xs font-semibold text-white cursor-pointer"
                    >
                      {activeSpeakers.length >= 12
                        ? 'Speaker Stage Full (12/12)'
                        : 'Move to Speaker Stage'}
                    </button>
                  )}

                  {isViewerHost && (
                    <button
                      type="button"
                      onClick={() =>
                        handleModerate(
                          selectedParticipant.role === 'co_host' ||
                            selectedParticipant.role === 'co-host'
                            ? 'demote_cohost'
                            : 'promote_cohost',
                          selectedParticipant.uid
                        )
                      }
                      className="w-full min-h-[38px] rounded-xl bg-[#09080B] border border-[#6D28D9]/45 text-xs font-semibold text-[#F5F1F2] cursor-pointer"
                    >
                      {selectedParticipant.role === 'co_host' ||
                      selectedParticipant.role === 'co-host'
                        ? 'Remove Co-Host Role'
                        : 'Assign Co-Host (Requires Speaker Seat)'}
                    </button>
                  )}

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => handleModerate('kick', selectedParticipant.uid)}
                      className="min-h-[38px] rounded-xl bg-[#09080B] border border-rose-500/35 text-xs font-semibold text-rose-300 cursor-pointer"
                    >
                      Kick User
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        handleModerate('ban', selectedParticipant.uid, 'Banned by room host')
                      }
                      className="min-h-[38px] rounded-xl bg-rose-500/20 border border-rose-500/50 text-xs font-semibold text-rose-200 cursor-pointer"
                    >
                      Ban from Room
                    </button>
                  </div>
                </div>
              )}
          </div>
        </div>
      )}

      {/* VIEW ALL LISTENERS & PARTICIPANTS MODAL */}
      <KageModal
        isOpen={listenersModalOpen}
        onClose={() => setListenersModalOpen(false)}
        title={`Room Participants (${room.participantCount || 0})`}
        maxWidthClass="max-w-md"
      >
        <div className="space-y-3">
          <input
            type="text"
            value={listenerSearch}
            onChange={(e) => setListenerSearch(e.target.value)}
            placeholder="Filter participants by name or @username..."
            className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
          />
          <div className="space-y-2">
            {(room.participants || [])
              .filter((p) => {
                const q = listenerSearch.trim().toLowerCase();
                if (!q) return true;
                return (
                  p.username.toLowerCase().includes(q) ||
                  p.displayName.toLowerCase().includes(q)
                );
              })
              .map((p) => (
                <button
                  key={p.uid}
                  type="button"
                  onClick={() => {
                    setListenersModalOpen(false);
                    setSelectedParticipant(p);
                  }}
                  className="w-full p-2.5 rounded-xl bg-[#09080B] hover:bg-[#1C1720] border border-white/8 flex items-center justify-between text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <KageImage
                      src={p.avatarUrl}
                      alt={p.displayName}
                      className="w-9 h-9 rounded-full object-cover shrink-0"
                    />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#F5F1F2] truncate inline-flex items-center gap-1">
                        {p.role === 'host' && (
                          <Crown className="w-3 h-3 text-amber-400 fill-amber-400 shrink-0" aria-label="Host" />
                        )}
                        <span>{p.displayName}</span>
                      </p>
                      <p className="text-[11px] text-[#A7A0AA] truncate">@{p.username}</p>
                    </div>
                  </div>
                  <span className="text-[11px] font-semibold text-[#6D28D9]">
                    {formatRoleLabel(p.role)}
                  </span>
                </button>
              ))}
          </div>
        </div>
      </KageModal>

      {/* INVITE HUNTERS MODAL */}
      <KageModal
        isOpen={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite Hunters to Room"
        maxWidthClass="max-w-md"
      >
        <div className="space-y-3">
          <input
            type="text"
            value={inviteQuery}
            onChange={(e) => setInviteQuery(e.target.value)}
            placeholder="Search hunter by @username or KAGE ID..."
            className="w-full min-h-[42px] rounded-xl bg-[#09080B] border border-white/12 px-3.5 text-xs text-[#F5F1F2]"
          />
          <div className="space-y-2">
            {inviteResults.map((u) => (
              <div
                key={u.uid}
                className="p-2.5 rounded-xl bg-[#09080B] border border-white/10 flex items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <KageImage
                    src={u.avatarUrl}
                    alt={u.displayName}
                    className="w-8 h-8 rounded-full object-cover shrink-0"
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-[#F5F1F2] truncate">
                      {u.displayName}
                    </p>
                    <p className="text-[11px] text-[#A7A0AA] truncate">@{u.username}</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await apiFetch(`/api/voice-rooms/${roomId}/invite`, {
                        method: 'POST',
                        body: JSON.stringify({ targetUid: u.uid }),
                      });
                      showToast(`Invited @${u.username} to this room!`);
                    } catch {
                      await handleShareRoom();
                    }
                    setInviteOpen(false);
                  }}
                  className="min-h-[34px] px-3 rounded-lg bg-[#6D28D9] hover:bg-[#7c3aed] text-xs font-semibold text-white cursor-pointer"
                >
                  Send Invite
                </button>
              </div>
            ))}
          </div>
        </div>
      </KageModal>

      {/* HOST SETTINGS + CONVERT VOICE <-> VIDEO ROOM MODAL */}
      <KageModal
        isOpen={Boolean(settingsOpen && isViewerMod)}
        onClose={() => {
          setSettingsOpen(false);
          setConfirmVideoSwitch(null);
          setConfirmEndRoom(false);
        }}
        title="Room Controls & Settings"
        maxWidthClass="max-w-lg"
        tallForm
      >
        <div className="space-y-5">

            {/* CONVERT VOICE ROOM <-> VIDEO ROOM (HOST EXCLUSIVE) */}
            {isViewerHost && (
              <div className="rounded-2xl bg-gradient-to-r from-[#6D28D9]/20 via-[#C0263D]/15 to-[#09080B] border border-[#6D28D9]/50 p-4 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-[#F5F1F2] flex items-center gap-2">
                      <Video className="w-4 h-4 text-[#6D28D9]" />
                      <span>
                        {room.mediaMode === 'voice'
                          ? 'Switch to Video Room'
                          : 'Switch back to Voice Room'}
                      </span>
                    </p>
                    <p className="text-xs text-[#A7A0AA] mt-0.5">
                      Preserves room ID, all participants, 12 speaker seats, roles, and live chat.
                      Cameras stay OFF by default until speakers turn them on.
                    </p>
                  </div>
                </div>

                {confirmVideoSwitch ? (
                  <div className="rounded-xl bg-[#09080B] border border-white/15 p-3 space-y-2.5">
                    <p className="text-xs text-[#F5F1F2]">
                      {confirmVideoSwitch === 'video'
                        ? 'Confirm converting this live Voice Room into a Video Room? Nobody’s camera will turn on automatically.'
                        : 'Switch back to audio-only Voice Room? Active speaker cameras will turn off cleanly.'}
                    </p>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmVideoSwitch(null)}
                        className="min-h-[36px] px-3 rounded-lg bg-[#141116] text-xs text-[#A7A0AA] cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => handleConvertMediaMode(confirmVideoSwitch)}
                        className="min-h-[36px] px-4 rounded-lg bg-[#6D28D9] text-xs font-semibold text-white cursor-pointer"
                      >
                        Confirm Switch
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setConfirmVideoSwitch(room.mediaMode === 'voice' ? 'video' : 'voice')
                    }
                    className="min-h-[40px] px-4 rounded-xl bg-[#6D28D9] hover:bg-[#7c3aed] text-xs font-semibold text-white cursor-pointer"
                  >
                    {room.mediaMode === 'voice'
                      ? 'Switch to Video Room'
                      : 'Switch back to Voice Room'}
                  </button>
                )}
              </div>
            )}

            {/* Quick Moderation Toggles */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => handleModerate(room.isLocked ? 'unlock_room' : 'lock_room')}
                className="min-h-[42px] px-3.5 rounded-xl bg-[#09080B] border border-white/12 text-xs font-semibold flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  {room.isLocked ? (
                    <Unlock className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <Lock className="w-4 h-4 text-amber-400" />
                  )}
                  <span>{room.isLocked ? 'Unlock Room' : 'Lock Room'}</span>
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  handleModerate(room.isChatEnabled ? 'disable_chat' : 'enable_chat')
                }
                className="min-h-[42px] px-3.5 rounded-xl bg-[#09080B] border border-white/12 text-xs font-semibold flex items-center justify-between cursor-pointer"
              >
                <span className="flex items-center gap-2">
                  {room.isChatEnabled ? (
                    <MessageSquareOff className="w-4 h-4 text-rose-400" />
                  ) : (
                    <MessageSquare className="w-4 h-4 text-emerald-400" />
                  )}
                  <span>{room.isChatEnabled ? 'Disable Listener Chat' : 'Enable Chat'}</span>
                </span>
              </button>
            </div>

            {/* Edit Room Details */}
            <form onSubmit={handleSaveRoomSettings} className="space-y-3 pt-2 border-t border-white/10">
              <div>
                <label className="block text-xs text-[#A7A0AA] mb-1">Room Title</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                />
              </div>
              <div>
                <label className="block text-xs text-[#A7A0AA] mb-1">Category</label>
                <select
                  value={editCategory}
                  onChange={(e) => setEditCategory(e.target.value)}
                  className="w-full min-h-[40px] rounded-xl bg-[#09080B] border border-white/12 px-3 text-xs text-[#F5F1F2]"
                >
                  {VOICE_CATEGORIES.filter((c) => c !== 'All').map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs text-[#A7A0AA] mb-1">Description</label>
                <textarea
                  rows={2}
                  value={editTopic}
                  onChange={(e) => setEditTopic(e.target.value)}
                  className="w-full rounded-xl bg-[#09080B] border border-white/12 p-3 text-xs text-[#F5F1F2]"
                />
              </div>
              <div className="space-y-2">
                <label className="block text-xs text-[#A7A0AA]">Room Cover &amp; Avatar</label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="min-h-[38px] rounded-xl bg-[#09080B] border border-dashed border-white/15 hover:border-[#6D28D9] px-3 flex items-center gap-2 text-xs text-[#A7A0AA] cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-[#6D28D9] shrink-0" />
                    <span className="truncate">Upload Avatar...</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          try {
                            setEditAvatarUrl(await readImageDataUrl(f));
                          } catch (err: any) {
                            showToast(err.message);
                          }
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                  <label className="min-h-[38px] rounded-xl bg-[#09080B] border border-dashed border-white/15 hover:border-[#C0263D] px-3 flex items-center gap-2 text-xs text-[#A7A0AA] cursor-pointer">
                    <Upload className="w-3.5 h-3.5 text-[#C0263D] shrink-0" />
                    <span className="truncate">Upload Cover...</span>
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={async (e) => {
                        const f = e.target.files?.[0];
                        if (f) {
                          try {
                            setEditBannerUrl(await readImageDataUrl(f));
                          } catch (err: any) {
                            showToast(err.message);
                          }
                        }
                      }}
                      className="hidden"
                    />
                  </label>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {PRESET_BANNERS.slice(0, 4).map((b) => (
                    <button
                      key={b.key}
                      type="button"
                      onClick={() => setEditBannerUrl(b.url)}
                      className={`p-1.5 rounded-lg border text-left text-[11px] flex items-center gap-2 cursor-pointer ${
                        editBannerUrl === b.url
                          ? 'border-[#6D28D9] bg-[#6D28D9]/15 text-white'
                          : 'border-white/10 bg-[#09080B] text-[#A7A0AA]'
                      }`}
                    >
                      <img src={b.url} alt={b.label} className="w-6 h-6 rounded-full object-cover shrink-0" />
                      <span className="truncate">{b.label}</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={savingSettings}
                  className="min-h-[38px] px-4 rounded-xl bg-[#6D28D9] text-xs font-semibold text-white cursor-pointer"
                >
                  {savingSettings ? 'Saving...' : 'Save Room Info'}
                </button>
              </div>
            </form>

            {/* Banned Users List */}
            {Array.isArray(room.bannedUsers) && room.bannedUsers.length > 0 && (
              <div className="pt-3 border-t border-white/10 space-y-2">
                <p className="text-xs font-bold text-[#F5F1F2]">
                  Banned Users ({room.bannedUsers.length})
                </p>
                {room.bannedUsers.map((b) => (
                  <div
                    key={b.userUid}
                    className="rounded-xl bg-[#09080B] px-3 py-2 flex items-center justify-between text-xs"
                  >
                    <span>
                      {b.displayName} (@{b.username})
                    </span>
                    <button
                      type="button"
                      onClick={() => handleModerate('unban', b.userUid)}
                      className="text-emerald-400 font-semibold hover:underline cursor-pointer"
                    >
                      Unban
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* End Room */}
            {isViewerHost && (
              <div className="pt-3 border-t border-white/10 flex items-center justify-between">
                {!confirmEndRoom ? (
                  <button
                    type="button"
                    onClick={() => setConfirmEndRoom(true)}
                    className="min-h-[40px] px-4 rounded-xl bg-rose-500/15 border border-rose-500/40 text-xs font-semibold text-rose-300 cursor-pointer"
                  >
                    End Room for Everyone
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-rose-300">Close room now?</span>
                    <button
                      type="button"
                      onClick={() => setConfirmEndRoom(false)}
                      className="min-h-[36px] px-3 rounded-lg bg-[#09080B] text-xs text-[#A7A0AA] cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleEndRoom}
                      className="min-h-[36px] px-3.5 rounded-lg bg-[#C0263D] text-xs font-semibold text-white cursor-pointer"
                    >
                      End Room
                    </button>
                  </div>
                )}
              </div>
            )}
        </div>
      </KageModal>

      {reportTarget && (
        <ReportModal
          isOpen={Boolean(reportTarget)}
          onClose={() => setReportTarget(null)}
          targetType={reportTarget.type as any}
          targetId={reportTarget.id as any}
          targetLabel={reportTarget.label}
        />
      )}
    </div>
  );
};
