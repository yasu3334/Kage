import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  blockedUsers,
  communities,
  notifications,
  profiles,
  users,
  voiceRoomBans,
  voiceRoomMembers,
  voiceRoomMessages,
  voiceRoomRequests,
  voiceRooms,
} from './schema.ts';
import { HttpError, normalizeKageUsername } from './profileSystemRepo.ts';
import { isApprovedCatalogueImageUrl } from '../server/characterCatalogue.ts';
import { uploadValidatedMediaAsset } from '../server/mediaAccess.ts';

export const MAX_VOICE_SPEAKERS = 12;

export type VoiceMemberRole = 'host' | 'co_host' | 'moderator' | 'speaker' | 'listener';

export function isStageSpeakerRole(role?: string | null): boolean {
  return (
    role === 'host' ||
    role === 'co_host' ||
    role === 'co-host' ||
    role === 'moderator' ||
    role === 'speaker'
  );
}

export function formatReactionsArray(map?: Record<string, string[]> | null) {
  if (!map || typeof map !== 'object') return [];
  return Object.entries(map)
    .filter(([, uids]) => Array.isArray(uids) && uids.length > 0)
    .map(([emoji, uids]) => ({
      emoji,
      count: uids.length,
      uids,
    }));
}

function pickLowestAvailableSeat(occupiedSeats: Iterable<number | null | undefined>, preferredSeat?: number | null): number | null {
  const taken = new Set<number>();
  for (const s of occupiedSeats) {
    if (typeof s === 'number' && s >= 1 && s <= MAX_VOICE_SPEAKERS) {
      taken.add(s);
    }
  }
  if (preferredSeat && preferredSeat >= 1 && preferredSeat <= MAX_VOICE_SPEAKERS && !taken.has(preferredSeat)) {
    return preferredSeat;
  }
  for (let seat = 1; seat <= MAX_VOICE_SPEAKERS; seat++) {
    if (!taken.has(seat)) return seat;
  }
  return null;
}

async function getVoiceActorPermissions(roomId: number, actorUid?: string) {
  const [room] = await db
    .select()
    .from(voiceRooms)
    .where(eq(voiceRooms.id, roomId))
    .limit(1);

  if (!room) {
    throw new HttpError(404, 'Voice room not found.');
  }

  if (!actorUid) {
    return {
      room,
      member: null,
      isPlatformAdmin: false,
      isHost: false,
      isCoHostOrMod: false,
      canManageStage: false,
      canManageCoHosts: false,
    };
  }

  const [[userRow], [memberRow]] = await Promise.all([
    db.select({ role: users.role }).from(users).where(eq(users.uid, actorUid)).limit(1),
    db
      .select()
      .from(voiceRoomMembers)
      .where(and(eq(voiceRoomMembers.roomId, roomId), eq(voiceRoomMembers.userUid, actorUid)))
      .limit(1),
  ]);

  const isPlatformAdmin = userRow?.role === 'owner' || userRow?.role === 'admin';
  const isHost = room.hostUid === actorUid || memberRow?.role === 'host';
  const isCoHostOrMod =
    isHost ||
    memberRow?.role === 'co_host' ||
    memberRow?.role === 'moderator' ||
    isPlatformAdmin;

  return {
    room,
    member: memberRow || null,
    isPlatformAdmin,
    isHost: isHost || isPlatformAdmin,
    isCoHostOrMod,
    canManageStage: isCoHostOrMod,
    canManageCoHosts: isHost || isPlatformAdmin,
  };
}

export async function listStandaloneVoiceRooms(params?: {
  q?: string;
  category?: string;
  communityId?: number;
}) {
  const q = params?.q?.trim() || '';
  const category = params?.category?.trim() || '';
  const conditions: any[] = [eq(voiceRooms.isActive, true)];

  if (q) {
    const p = `%${q}%`;
    conditions.push(
      or(
        ilike(voiceRooms.title, p),
        ilike(voiceRooms.topic, p),
        ilike(voiceRooms.description, p),
        ilike(voiceRooms.category, p)
      )
    );
  }
  if (category && category.toLowerCase() !== 'all') {
    conditions.push(ilike(voiceRooms.category, category));
  }
  if (params?.communityId) {
    conditions.push(eq(voiceRooms.communityId, params.communityId));
  }

  const rooms = await db
    .select({
      room: voiceRooms,
      communityName: communities.name,
      communitySlug: communities.slug,
      hostUsername: users.username,
      hostDisplayName: profiles.displayName,
      hostAvatarUrl: profiles.avatarUrl,
    })
    .from(voiceRooms)
    .leftJoin(communities, eq(voiceRooms.communityId, communities.id))
    .leftJoin(users, eq(voiceRooms.hostUid, users.uid))
    .leftJoin(profiles, eq(voiceRooms.hostUid, profiles.userUid))
    .where(and(...conditions))
    .orderBy(desc(voiceRooms.createdAt))
    .limit(60);

  if (rooms.length === 0) return [];

  const roomIds = rooms.map((r) => r.room.id);
  const members = await db
    .select({
      roomId: voiceRoomMembers.roomId,
      uid: users.uid,
      username: users.username,
      userRole: users.role,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
      role: voiceRoomMembers.role,
      seatNumber: voiceRoomMembers.seatNumber,
      isMuted: voiceRoomMembers.isMuted,
      isCameraOn: voiceRoomMembers.isCameraOn,
    })
    .from(voiceRoomMembers)
    .innerJoin(users, eq(voiceRoomMembers.userUid, users.uid))
    .innerJoin(profiles, eq(users.uid, profiles.userUid))
    .where(inArray(voiceRoomMembers.roomId, roomIds));

  return rooms.map((r) => {
    const roomParticipants = members.filter((m) => m.roomId === r.room.id);
    const speakers = roomParticipants.filter((p) => isStageSpeakerRole(p.role));
    const listeners = roomParticipants.filter((p) => !isStageSpeakerRole(p.role));
    return {
      ...r.room,
      bannerUrl: r.room.artworkUrl,
      isChatEnabled: r.room.chatEnabled,
      maxSpeakers: MAX_VOICE_SPEAKERS,
      communityName: r.communityName || null,
      communitySlug: r.communitySlug || null,
      host: r.room.hostUid
        ? {
            uid: r.room.hostUid,
            username: r.hostUsername || 'host',
            displayName: r.hostDisplayName || r.hostUsername || 'Host',
            avatarUrl: r.hostAvatarUrl || '/assets/zenitsu-avatar.png',
          }
        : null,
      speakerLimit: MAX_VOICE_SPEAKERS,
      speakerCount: speakers.length,
      listenerCount: listeners.length,
      participantCount: roomParticipants.length,
      participants: roomParticipants,
    };
  });
}

export async function getVoiceRoomFullDetail(roomId: number, viewerUid?: string) {
  if (!roomId || Number.isNaN(roomId)) return null;

  const [r] = await db
    .select({
      room: voiceRooms,
      communityName: communities.name,
      communitySlug: communities.slug,
      hostUsername: users.username,
      hostDisplayName: profiles.displayName,
      hostAvatarUrl: profiles.avatarUrl,
    })
    .from(voiceRooms)
    .leftJoin(communities, eq(voiceRooms.communityId, communities.id))
    .leftJoin(users, eq(voiceRooms.hostUid, users.uid))
    .leftJoin(profiles, eq(voiceRooms.hostUid, profiles.userUid))
    .where(eq(voiceRooms.id, roomId))
    .limit(1);

  if (!r) return null;

  const participantsRaw = await db
    .select({
      uid: users.uid,
      username: users.username,
      kageId: users.kageId,
      userRole: users.role,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
      role: voiceRoomMembers.role,
      seatNumber: voiceRoomMembers.seatNumber,
      isMuted: voiceRoomMembers.isMuted,
      isCameraOn: voiceRoomMembers.isCameraOn,
      joinedAt: voiceRoomMembers.joinedAt,
    })
    .from(voiceRoomMembers)
    .innerJoin(users, eq(voiceRoomMembers.userUid, users.uid))
    .innerJoin(profiles, eq(users.uid, profiles.userUid))
    .where(eq(voiceRoomMembers.roomId, roomId));

  // Deterministic stage seat ordering: Host first (Seat 1), then Co-Hosts, then Speakers by seatNumber
  const speakers = participantsRaw
    .filter((p) => isStageSpeakerRole(p.role))
    .sort((a, b) => {
      const rankA = a.role === 'host' ? 0 : a.role === 'co_host' ? 1 : 2;
      const rankB = b.role === 'host' ? 0 : b.role === 'co_host' ? 1 : 2;
      if (rankA !== rankB) return rankA - rankB;
      return (a.seatNumber || 99) - (b.seatNumber || 99);
    })
    .slice(0, MAX_VOICE_SPEAKERS);

  const listeners = participantsRaw
    .filter((p) => !isStageSpeakerRole(p.role))
    .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime());

  let viewerIsBanned = false;
  let viewerHasPendingSpeakRequest = false;
  let canManageStage = false;
  let canManageCoHosts = false;

  if (viewerUid) {
    const [[banRow], [myReqRow], [viewerUser]] = await Promise.all([
      db
        .select()
        .from(voiceRoomBans)
        .where(and(eq(voiceRoomBans.roomId, roomId), eq(voiceRoomBans.userUid, viewerUid)))
        .limit(1),
      db
        .select()
        .from(voiceRoomRequests)
        .where(
          and(
            eq(voiceRoomRequests.roomId, roomId),
            eq(voiceRoomRequests.userUid, viewerUid),
            eq(voiceRoomRequests.requestType, 'speak_seat'),
            eq(voiceRoomRequests.status, 'pending')
          )
        )
        .limit(1),
      db.select({ role: users.role }).from(users).where(eq(users.uid, viewerUid)).limit(1),
    ]);

    viewerIsBanned = Boolean(banRow && (!banRow.expiresAt || banRow.expiresAt > new Date()));
    viewerHasPendingSpeakRequest = Boolean(myReqRow);

    const me = participantsRaw.find((p) => p.uid === viewerUid);
    const isAdmin = viewerUser?.role === 'owner' || viewerUser?.role === 'admin';
    const isHost = r.room.hostUid === viewerUid || me?.role === 'host' || isAdmin;
    canManageCoHosts = isHost;
    canManageStage = isHost || me?.role === 'co_host' || me?.role === 'moderator';
  }

  let speakRequests: any[] = [];
  let bans: any[] = [];

  // Always load pending speak requests count; load full details when viewer can manage stage
  const rawReqs = await db
    .select({
      id: voiceRoomRequests.id,
      userUid: voiceRoomRequests.userUid,
      status: voiceRoomRequests.status,
      createdAt: voiceRoomRequests.createdAt,
      username: users.username,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(voiceRoomRequests)
    .innerJoin(users, eq(voiceRoomRequests.userUid, users.uid))
    .innerJoin(profiles, eq(users.uid, profiles.userUid))
    .where(
      and(
        eq(voiceRoomRequests.roomId, roomId),
        eq(voiceRoomRequests.requestType, 'speak_seat'),
        eq(voiceRoomRequests.status, 'pending')
      )
    )
    .orderBy(asc(voiceRoomRequests.createdAt));

  speakRequests = rawReqs;

  if (canManageStage) {
    bans = await db
      .select({
        id: voiceRoomBans.id,
        userUid: voiceRoomBans.userUid,
        reason: voiceRoomBans.reason,
        createdAt: voiceRoomBans.createdAt,
        username: users.username,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
      })
      .from(voiceRoomBans)
      .innerJoin(users, eq(voiceRoomBans.userUid, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(eq(voiceRoomBans.roomId, roomId))
      .orderBy(desc(voiceRoomBans.createdAt));
  }

  const viewerMember = viewerUid
    ? participantsRaw.find((p) => p.uid === viewerUid) || null
    : null;

  return {
    ...r.room,
    bannerUrl: r.room.artworkUrl,
    isChatEnabled: r.room.chatEnabled,
    maxSpeakers: MAX_VOICE_SPEAKERS,
    speakerLimit: MAX_VOICE_SPEAKERS,
    communityName: r.communityName || null,
    communitySlug: r.communitySlug || null,
    host: r.room.hostUid
      ? {
          uid: r.room.hostUid,
          username: r.hostUsername || 'host',
          displayName: r.hostDisplayName || r.hostUsername || 'Host',
          avatarUrl: r.hostAvatarUrl || '/assets/zenitsu-avatar.png',
        }
      : null,
    speakerCount: speakers.length,
    listenerCount: listeners.length,
    participantCount: participantsRaw.length,
    participants: [...speakers, ...listeners],
    speakers,
    listeners,
    speakRequests,
    bans,
    bannedUsers: bans,
    viewerRole: (viewerMember?.role as VoiceMemberRole | undefined) || null,
    viewerIsBanned,
    viewerBanned: viewerIsBanned,
    viewerHasPendingSpeakRequest,
    permissions: {
      canManageStage,
      canManageCoHosts,
    },
  };
}

export async function createStandaloneVoiceRoom(
  hostUid: string,
  payload: {
    title: string;
    description?: string;
    topic?: string;
    category?: string;
    artworkUrl?: string;
    avatarUrl?: string;
    bannerDataUrl?: string;
    avatarDataUrl?: string;
    communityId?: number | null;
    capacity?: number;
  }
) {
  const cleanTitle = String(payload.title || '').trim().slice(0, 70);
  if (cleanTitle.length < 2) {
    throw new HttpError(400, 'Room title must be at least 2 characters.');
  }
  const cleanDesc = String(payload.description || payload.topic || '').trim().slice(0, 400);
  const cleanCategory = String(payload.category || 'Anime Vibes').trim().slice(0, 40) || 'Anime Vibes';

  const [hostProfile] = await db
    .select({ avatarUrl: profiles.avatarUrl })
    .from(profiles)
    .where(eq(profiles.userUid, hostUid))
    .limit(1);

  let artworkUrl = '/assets/extracted/zenitsu-live-room.jpg';
  const rawBannerData =
    payload.bannerDataUrl ||
    (typeof (payload as any).bannerUrl === 'string' && (payload as any).bannerUrl.startsWith('data:image/')
      ? (payload as any).bannerUrl
      : '') ||
    (typeof payload.artworkUrl === 'string' && payload.artworkUrl.startsWith('data:image/')
      ? payload.artworkUrl
      : '');
  const rawBannerAsset =
    (typeof (payload as any).bannerUrl === 'string' && !(payload as any).bannerUrl.startsWith('data:image/')
      ? (payload as any).bannerUrl
      : '') || payload.artworkUrl;

  if (rawBannerData) {
    const up = await uploadValidatedMediaAsset(hostUid, {
      dataUrl: rawBannerData,
      mediaType: 'image',
      purpose: 'post_image',
      visibility: 'public',
    });
    artworkUrl = up.url;
  } else if (
    rawBannerAsset &&
    (rawBannerAsset.startsWith('/assets/') || isApprovedCatalogueImageUrl(rawBannerAsset))
  ) {
    artworkUrl = rawBannerAsset;
  }

  let avatarUrl = hostProfile?.avatarUrl || '/assets/zenitsu-avatar.png';
  const rawAvatarData =
    payload.avatarDataUrl ||
    (typeof payload.avatarUrl === 'string' && payload.avatarUrl.startsWith('data:image/')
      ? payload.avatarUrl
      : '');
  if (rawAvatarData) {
    const upAv = await uploadValidatedMediaAsset(hostUid, {
      dataUrl: rawAvatarData,
      mediaType: 'avatar',
      purpose: 'avatar',
      visibility: 'public',
    });
    avatarUrl = upAv.url;
  } else if (
    payload.avatarUrl &&
    !payload.avatarUrl.startsWith('data:image/') &&
    (payload.avatarUrl.startsWith('/assets/') || isApprovedCatalogueImageUrl(payload.avatarUrl))
  ) {
    avatarUrl = payload.avatarUrl;
  }

  const createdRoomId = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(voiceRooms)
      .values({
        title: cleanTitle,
        topic: cleanDesc || 'Live anime voice hangout & open stage.',
        description: cleanDesc || 'Live anime voice hangout & open stage.',
        category: cleanCategory,
        mediaMode: 'voice',
        isLocked: false,
        chatEnabled: true,
        speakerLimit: MAX_VOICE_SPEAKERS,
        avatarUrl,
        artworkUrl,
        communityId: payload.communityId ? Number(payload.communityId) : null,
        hostUid,
        capacity: Math.max(12, Math.min(250, Number(payload.capacity || 120))),
        isActive: true,
        isSeed: false,
      })
      .returning({ id: voiceRooms.id });

    // Host automatically occupies Speaker Seat 1 (camera strictly OFF by default)
    await tx
      .insert(voiceRoomMembers)
      .values({
        roomId: created.id,
        userUid: hostUid,
        role: 'host',
        seatNumber: 1,
        isMuted: false,
        isCameraOn: false,
      })
      .onConflictDoUpdate({
        target: [voiceRoomMembers.roomId, voiceRoomMembers.userUid],
        set: {
          role: 'host',
          seatNumber: 1,
          isMuted: false,
          isCameraOn: false,
        },
      });

    return created.id;
  });

  return await getVoiceRoomFullDetail(createdRoomId, hostUid);
}

export async function joinVoiceRoomSession(
  roomId: number,
  userUid: string,
  options?: {
    requestedRole?: 'speaker' | 'listener' | 'host' | 'co_host' | 'moderator';
    isMuted?: boolean;
  }
) {
  await db.transaction(async (tx) => {
    // Row-level lock on voice_rooms prevents race conditions under simultaneous joins!
    await tx.execute(sql`SELECT id FROM voice_rooms WHERE id = ${roomId} FOR UPDATE`);

    const [room] = await tx
      .select()
      .from(voiceRooms)
      .where(eq(voiceRooms.id, roomId))
      .limit(1);

    if (!room || !room.isActive) {
      throw new HttpError(404, 'This voice room has ended or is unavailable.');
    }

    // Enforce room ban list strictly on backend
    const [activeBan] = await tx
      .select()
      .from(voiceRoomBans)
      .where(and(eq(voiceRoomBans.roomId, roomId), eq(voiceRoomBans.userUid, userUid)))
      .limit(1);

    if (activeBan && (!activeBan.expiresAt || activeBan.expiresAt > new Date())) {
      throw new HttpError(403, 'You have been banned from joining this room.');
    }

    const currentMembers = await tx
      .select()
      .from(voiceRoomMembers)
      .where(eq(voiceRoomMembers.roomId, roomId));

    const existing = currentMembers.find((m) => m.userUid === userUid);
    const [userRow] = await tx
      .select({ role: users.role })
      .from(users)
      .where(eq(users.uid, userUid))
      .limit(1);
    const isAdmin = userRow?.role === 'owner' || userRow?.role === 'admin';
    const isRoomHost = room.hostUid === userUid;

    if (room.isLocked && !existing && !isRoomHost && !isAdmin) {
      throw new HttpError(403, 'This voice room is currently locked by the host.');
    }

    if (!existing && currentMembers.length >= Math.max(room.capacity, MAX_VOICE_SPEAKERS + 20)) {
      throw new HttpError(409, 'This room has reached maximum participant capacity.');
    }

    const otherStageMembers = currentMembers.filter(
      (m) => m.userUid !== userUid && isStageSpeakerRole(m.role)
    );
    const occupiedSeats = otherStageMembers.map((m) => m.seatNumber);

    let assignedRole: VoiceMemberRole = 'listener';
    let assignedSeat: number | null = null;
    let assignedMuted = true;
    const assignedCameraOn = existing ? Boolean(existing.isCameraOn && room.mediaMode === 'video') : false;

    const reqRole = options?.requestedRole || (existing?.role as VoiceMemberRole | undefined) || 'listener';

    if (isRoomHost) {
      if (otherStageMembers.length < MAX_VOICE_SPEAKERS) {
        assignedRole = 'host';
        assignedSeat = pickLowestAvailableSeat(occupiedSeats, existing?.seatNumber || 1);
        assignedMuted = options?.isMuted !== undefined ? Boolean(options.isMuted) : false;
      } else {
        assignedRole = 'listener';
        assignedSeat = null;
        assignedMuted = true;
      }
    } else if (existing && isStageSpeakerRole(existing.role) && reqRole !== 'listener') {
      // Preserve existing stage role & seat on reconnect
      assignedRole = existing.role as VoiceMemberRole;
      assignedSeat =
        existing.seatNumber || pickLowestAvailableSeat(occupiedSeats);
      assignedMuted =
        options?.isMuted !== undefined ? Boolean(options.isMuted) : existing.isMuted;
    } else if (reqRole !== 'listener') {
      // Strictly enforce the 12-speaker maximum! When all 12 seats are occupied, additional users MUST remain listeners.
      if (otherStageMembers.length < MAX_VOICE_SPEAKERS) {
        assignedRole = reqRole === 'co_host' ? 'co_host' : 'speaker';
        assignedSeat = pickLowestAvailableSeat(occupiedSeats);
        assignedMuted = options?.isMuted !== undefined ? Boolean(options.isMuted) : false;
      } else {
        assignedRole = 'listener';
        assignedSeat = null;
        assignedMuted = true;
      }
    } else {
      assignedRole = 'listener';
      assignedSeat = null;
      assignedMuted = true;
    }

    await tx
      .insert(voiceRoomMembers)
      .values({
        roomId,
        userUid,
        role: assignedRole,
        seatNumber: assignedSeat,
        isMuted: assignedMuted,
        isCameraOn: isStageSpeakerRole(assignedRole) ? assignedCameraOn : false,
      })
      .onConflictDoUpdate({
        target: [voiceRoomMembers.roomId, voiceRoomMembers.userUid],
        set: {
          role: assignedRole,
          seatNumber: assignedSeat,
          isMuted: assignedMuted,
          isCameraOn: isStageSpeakerRole(assignedRole) ? assignedCameraOn : false,
        },
      });
  });

  return await getVoiceRoomFullDetail(roomId, userUid);
}

export async function leaveVoiceRoomSession(roomId: number, userUid: string) {
  await db
    .delete(voiceRoomMembers)
    .where(and(eq(voiceRoomMembers.roomId, roomId), eq(voiceRoomMembers.userUid, userUid)));
  await db
    .delete(voiceRoomRequests)
    .where(
      and(
        eq(voiceRoomRequests.roomId, roomId),
        eq(voiceRoomRequests.userUid, userUid),
        eq(voiceRoomRequests.status, 'pending')
      )
    );
  return await getVoiceRoomFullDetail(roomId);
}

export async function toggleVoiceRoomMute(roomId: number, userUid: string, isMuted: boolean) {
  const [member] = await db
    .select()
    .from(voiceRoomMembers)
    .where(and(eq(voiceRoomMembers.roomId, roomId), eq(voiceRoomMembers.userUid, userUid)))
    .limit(1);

  if (!member) {
    throw new HttpError(404, 'Join the voice room first.');
  }
  if (!isStageSpeakerRole(member.role) && !isMuted) {
    throw new HttpError(403, 'Listeners must be approved for a speaker seat before unmuting.');
  }

  await db
    .update(voiceRoomMembers)
    .set({ isMuted: isStageSpeakerRole(member.role) ? Boolean(isMuted) : true })
    .where(and(eq(voiceRoomMembers.roomId, roomId), eq(voiceRoomMembers.userUid, userUid)));

  return await getVoiceRoomFullDetail(roomId, userUid);
}

export async function toggleVoiceRoomCamera(roomId: number, userUid: string, isCameraOn: boolean) {
  const [room] = await db
    .select()
    .from(voiceRooms)
    .where(eq(voiceRooms.id, roomId))
    .limit(1);

  if (!room || !room.isActive) {
    throw new HttpError(404, 'Voice room not found.');
  }
  if (room.mediaMode !== 'video' && isCameraOn) {
    throw new HttpError(400, 'Camera can only be enabled after the host switches to Video Room mode.');
  }

  const [member] = await db
    .select()
    .from(voiceRoomMembers)
    .where(and(eq(voiceRoomMembers.roomId, roomId), eq(voiceRoomMembers.userUid, userUid)))
    .limit(1);

  if (!member) {
    throw new HttpError(403, 'You are not an active participant in this room.');
  }
  if (!isStageSpeakerRole(member.role)) {
    throw new HttpError(
      403,
      'Listeners can watch speaker video streams without camera access. Request a speaker seat to share video.'
    );
  }

  await db
    .update(voiceRoomMembers)
    .set({ isCameraOn: Boolean(isCameraOn) })
    .where(and(eq(voiceRoomMembers.roomId, roomId), eq(voiceRoomMembers.userUid, userUid)));

  return await getVoiceRoomFullDetail(roomId, userUid);
}

export async function requestToSpeakInVoiceRoom(
  roomId: number,
  userUid: string,
  action: 'request' | 'cancel' = 'request'
) {
  const [room] = await db
    .select()
    .from(voiceRooms)
    .where(eq(voiceRooms.id, roomId))
    .limit(1);
  if (!room || !room.isActive) {
    throw new HttpError(404, 'Voice room not found.');
  }

  if (action === 'cancel') {
    await db
      .delete(voiceRoomRequests)
      .where(
        and(
          eq(voiceRoomRequests.roomId, roomId),
          eq(voiceRoomRequests.userUid, userUid),
          eq(voiceRoomRequests.requestType, 'speak_seat')
        )
      );
    return await getVoiceRoomFullDetail(roomId, userUid);
  }

  const [member] = await db
    .select()
    .from(voiceRoomMembers)
    .where(and(eq(voiceRoomMembers.roomId, roomId), eq(voiceRoomMembers.userUid, userUid)))
    .limit(1);

  if (!member) {
    throw new HttpError(400, 'Join the room as a listener before requesting a speaker seat.');
  }
  if (isStageSpeakerRole(member.role)) {
    return await getVoiceRoomFullDetail(roomId, userUid);
  }

  await db
    .insert(voiceRoomRequests)
    .values({
      roomId,
      userUid,
      requestType: 'speak_seat',
      status: 'pending',
    })
    .onConflictDoUpdate({
      target: [voiceRoomRequests.roomId, voiceRoomRequests.userUid, voiceRoomRequests.requestType],
      set: { status: 'pending', reviewedByUid: null, updatedAt: new Date() },
    });

  return await getVoiceRoomFullDetail(roomId, userUid);
}

export async function respondToVoiceSpeakRequest(
  actorUid: string,
  roomId: number,
  requestId: number,
  decision: 'approve' | 'reject'
) {
  const perms = await getVoiceActorPermissions(roomId, actorUid);
  if (!perms.canManageStage) {
    throw new HttpError(403, 'Only the Host or Co-hosts can review speaker requests.');
  }

  let targetUid = '';

  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM voice_rooms WHERE id = ${roomId} FOR UPDATE`);

    const [reqRow] = await tx
      .select()
      .from(voiceRoomRequests)
      .where(and(eq(voiceRoomRequests.id, requestId), eq(voiceRoomRequests.roomId, roomId)))
      .limit(1);

    if (!reqRow || reqRow.status !== 'pending') {
      throw new HttpError(404, 'Speaker request was already handled or cancelled.');
    }
    targetUid = reqRow.userUid;

    if (decision === 'reject') {
      await tx
        .update(voiceRoomRequests)
        .set({ status: 'rejected', reviewedByUid: actorUid, updatedAt: new Date() })
        .where(eq(voiceRoomRequests.id, requestId));
      return;
    }

    const currentMembers = await tx
      .select()
      .from(voiceRoomMembers)
      .where(eq(voiceRoomMembers.roomId, roomId));

    const stageMembers = currentMembers.filter(
      (m) => m.userUid !== targetUid && isStageSpeakerRole(m.role)
    );

    if (stageMembers.length >= MAX_VOICE_SPEAKERS) {
      throw new HttpError(
        409,
        `All ${MAX_VOICE_SPEAKERS} speaker seats are occupied. Free a seat before approving another speaker.`
      );
    }

    const freeSeat = pickLowestAvailableSeat(stageMembers.map((m) => m.seatNumber));
    if (!freeSeat) {
      throw new HttpError(409, `Maximum of ${MAX_VOICE_SPEAKERS} speakers reached.`);
    }

    await tx
      .insert(voiceRoomMembers)
      .values({
        roomId,
        userUid: targetUid,
        role: 'speaker',
        seatNumber: freeSeat,
        isMuted: false,
        isCameraOn: false,
      })
      .onConflictDoUpdate({
        target: [voiceRoomMembers.roomId, voiceRoomMembers.userUid],
        set: {
          role: 'speaker',
          seatNumber: freeSeat,
          isMuted: false,
          isCameraOn: false,
        },
      });

    await tx
      .update(voiceRoomRequests)
      .set({ status: 'approved', reviewedByUid: actorUid, updatedAt: new Date() })
      .where(eq(voiceRoomRequests.id, requestId));
  });

  if (targetUid && decision === 'approve') {
    await db.insert(notifications).values({
      recipientUid: targetUid,
      actorUid,
      type: 'voice_invite',
      title: `Your speaker request in "${perms.room.title}" was approved`,
      body: 'You are now on the live speaker stage.',
      linkUrl: `/voice/${roomId}`,
    });
  }

  return {
    room: await getVoiceRoomFullDetail(roomId, actorUid),
    targetUid,
    decision,
  };
}

export async function stepDownVoiceSpeakerToAudience(roomId: number, userUid: string) {
  const [room] = await db
    .select()
    .from(voiceRooms)
    .where(eq(voiceRooms.id, roomId))
    .limit(1);
  if (!room || !room.isActive) {
    throw new HttpError(404, 'Voice room not found.');
  }

  await db
    .update(voiceRoomMembers)
    .set({
      role: 'listener',
      seatNumber: null,
      isMuted: true,
      isCameraOn: false,
    })
    .where(and(eq(voiceRoomMembers.roomId, roomId), eq(voiceRoomMembers.userUid, userUid)));

  return await getVoiceRoomFullDetail(roomId, userUid);
}

export async function switchVoiceRoomMediaMode(
  actorUid: string,
  roomId: number,
  mediaMode: 'voice' | 'video'
) {
  const perms = await getVoiceActorPermissions(roomId, actorUid);
  if (!perms.canManageCoHosts) {
    throw new HttpError(403, 'Only the Room Host or KAGE Admin can switch between Voice and Video mode.');
  }

  const nextMode = mediaMode === 'video' ? 'video' : 'voice';

  await db.transaction(async (tx) => {
    await tx
      .update(voiceRooms)
      .set({ mediaMode: nextMode })
      .where(eq(voiceRooms.id, roomId));

    // Cameras are ALWAYS OFF by default when entering Video Mode, and turned OFF when returning to Voice Mode!
    await tx
      .update(voiceRoomMembers)
      .set({ isCameraOn: false })
      .where(eq(voiceRoomMembers.roomId, roomId));

    await tx.insert(voiceRoomMessages).values({
      roomId,
      senderUid: actorUid,
      messageType: 'system',
      content:
        nextMode === 'video'
          ? 'Room switched to Video Mode. Speakers can turn on their cameras voluntarily.'
          : 'Room switched back to Voice Mode. All cameras have been turned off.',
    });
  });

  const [latestSysMsg] = await db
    .select()
    .from(voiceRoomMessages)
    .where(eq(voiceRoomMessages.roomId, roomId))
    .orderBy(desc(voiceRoomMessages.id))
    .limit(1);

  return {
    room: await getVoiceRoomFullDetail(roomId, actorUid),
    mediaMode: nextMode,
    systemMessageId: latestSysMsg?.id || null,
  };
}

export async function updateVoiceRoomSettings(
  actorUid: string,
  roomId: number,
  payload: {
    title?: string;
    description?: string;
    topic?: string;
    category?: string;
    artworkUrl?: string;
    avatarUrl?: string;
    isLocked?: boolean;
    chatEnabled?: boolean;
  }
) {
  const perms = await getVoiceActorPermissions(roomId, actorUid);
  if (!perms.canManageStage) {
    throw new HttpError(403, 'Only the Host or Co-hosts can update room settings.');
  }

  const updates: Record<string, any> = {};
  if (typeof payload.title === 'string' && payload.title.trim().length >= 2) {
    updates.title = payload.title.trim().slice(0, 70);
  }
  if (typeof payload.description === 'string') {
    const clean = payload.description.trim().slice(0, 400);
    updates.description = clean;
    updates.topic = clean || perms.room.topic;
  } else if (typeof payload.topic === 'string') {
    const clean = payload.topic.trim().slice(0, 400);
    updates.topic = clean;
    updates.description = clean;
  }
  if (typeof payload.category === 'string' && payload.category.trim()) {
    updates.category = payload.category.trim().slice(0, 40);
  }
  if (typeof payload.artworkUrl === 'string' || typeof (payload as any).bannerUrl === 'string' || typeof (payload as any).bannerDataUrl === 'string') {
    const candidate = String((payload as any).bannerDataUrl || (payload as any).bannerUrl || payload.artworkUrl || '').trim();
    if (candidate.startsWith('data:image/')) {
      const up = await uploadValidatedMediaAsset(actorUid, {
        dataUrl: candidate,
        mediaType: 'image',
        purpose: 'post_image',
        visibility: 'public',
      });
      updates.artworkUrl = up.url;
    } else if (candidate.startsWith('/assets/') || isApprovedCatalogueImageUrl(candidate)) {
      updates.artworkUrl = candidate;
    }
  }
  if (typeof payload.avatarUrl === 'string' || typeof (payload as any).avatarDataUrl === 'string') {
    const avCandidate = String((payload as any).avatarDataUrl || payload.avatarUrl || '').trim();
    if (avCandidate.startsWith('data:image/')) {
      const upAv = await uploadValidatedMediaAsset(actorUid, {
        dataUrl: avCandidate,
        mediaType: 'avatar',
        purpose: 'avatar',
        visibility: 'public',
      });
      updates.avatarUrl = upAv.url;
    } else if (avCandidate.startsWith('/assets/') || isApprovedCatalogueImageUrl(avCandidate)) {
      updates.avatarUrl = avCandidate;
    }
  }
  if (typeof payload.isLocked === 'boolean') {
    updates.isLocked = payload.isLocked;
  }
  if (typeof payload.chatEnabled === 'boolean') {
    updates.chatEnabled = payload.chatEnabled;
  } else if (typeof (payload as any).isChatEnabled === 'boolean') {
    updates.chatEnabled = Boolean((payload as any).isChatEnabled);
  }

  if (Object.keys(updates).length > 0) {
    await db.update(voiceRooms).set(updates).where(eq(voiceRooms.id, roomId));
  }

  return await getVoiceRoomFullDetail(roomId, actorUid);
}

export async function moderateVoiceRoomParticipant(
  actorUid: string,
  roomId: number,
  payload: {
    action: string;
    targetUid?: string;
    newRole?: 'speaker' | 'listener' | 'co_host' | 'moderator';
    reason?: string;
  }
) {
  const perms = await getVoiceActorPermissions(roomId, actorUid);
  if (!perms.canManageStage) {
    throw new HttpError(403, 'Forbidden: Only Host, Co-hosts, or KAGE Admins can moderate this room.');
  }

  const { action, targetUid, newRole } = payload;

  if (action === 'close' || action === 'end_room') {
    if (!perms.canManageCoHosts) {
      throw new HttpError(403, 'Only the Room Host or KAGE Admin can end the room for everyone.');
    }
    await db.update(voiceRooms).set({ isActive: false }).where(eq(voiceRooms.id, roomId));
    await db.delete(voiceRoomMembers).where(eq(voiceRoomMembers.roomId, roomId));
    return { closed: true, roomId };
  }

  if (action === 'lock_room' || action === 'unlock_room') {
    await db
      .update(voiceRooms)
      .set({ isLocked: action === 'lock_room' })
      .where(eq(voiceRooms.id, roomId));
    return await getVoiceRoomFullDetail(roomId, actorUid);
  }

  if (action === 'disable_chat' || action === 'enable_chat') {
    await db
      .update(voiceRooms)
      .set({ chatEnabled: action === 'enable_chat' })
      .where(eq(voiceRooms.id, roomId));
    return await getVoiceRoomFullDetail(roomId, actorUid);
  }

  if (action === 'mute_all') {
    await db
      .update(voiceRoomMembers)
      .set({ isMuted: true })
      .where(
        and(
          eq(voiceRoomMembers.roomId, roomId),
          sql`${voiceRoomMembers.userUid} <> ${actorUid}`
        )
      );
    return await getVoiceRoomFullDetail(roomId, actorUid);
  }

  if (!targetUid) {
    throw new HttpError(400, 'Target participant is required for this moderation action.');
  }

  if (targetUid === perms.room.hostUid && !perms.isPlatformAdmin) {
    throw new HttpError(403, 'The Room Host cannot be moderated by co-hosts.');
  }

  // Prevent co-hosts from kicking/banning/demoting other co-hosts
  const [targetMember] = await db
    .select()
    .from(voiceRoomMembers)
    .where(and(eq(voiceRoomMembers.roomId, roomId), eq(voiceRoomMembers.userUid, targetUid)))
    .limit(1);

  if (
    !perms.canManageCoHosts &&
    (targetMember?.role === 'co_host' || targetMember?.role === 'host')
  ) {
    throw new HttpError(403, 'Only the Room Host can manage Co-hosts.');
  }

  if (action === 'kick') {
    await db
      .delete(voiceRoomMembers)
      .where(and(eq(voiceRoomMembers.roomId, roomId), eq(voiceRoomMembers.userUid, targetUid)));
    await db
      .delete(voiceRoomRequests)
      .where(and(eq(voiceRoomRequests.roomId, roomId), eq(voiceRoomRequests.userUid, targetUid)));
    return await getVoiceRoomFullDetail(roomId, actorUid);
  }

  if (action === 'ban') {
    await db
      .insert(voiceRoomBans)
      .values({
        roomId,
        userUid: targetUid,
        bannedByUid: actorUid,
        reason: String(payload.reason || 'Removed by room host').slice(0, 240),
      })
      .onConflictDoUpdate({
        target: [voiceRoomBans.roomId, voiceRoomBans.userUid],
        set: {
          bannedByUid: actorUid,
          reason: String(payload.reason || 'Removed by room host').slice(0, 240),
          expiresAt: null,
          createdAt: new Date(),
        },
      });
    await db
      .delete(voiceRoomMembers)
      .where(and(eq(voiceRoomMembers.roomId, roomId), eq(voiceRoomMembers.userUid, targetUid)));
    await db
      .delete(voiceRoomRequests)
      .where(and(eq(voiceRoomRequests.roomId, roomId), eq(voiceRoomRequests.userUid, targetUid)));
    return await getVoiceRoomFullDetail(roomId, actorUid);
  }

  if (action === 'unban') {
    await db
      .delete(voiceRoomBans)
      .where(and(eq(voiceRoomBans.roomId, roomId), eq(voiceRoomBans.userUid, targetUid)));
    return await getVoiceRoomFullDetail(roomId, actorUid);
  }

  if (action === 'force_mute' || action === 'mute') {
    await db
      .update(voiceRoomMembers)
      .set({ isMuted: true })
      .where(and(eq(voiceRoomMembers.roomId, roomId), eq(voiceRoomMembers.userUid, targetUid)));
    return await getVoiceRoomFullDetail(roomId, actorUid);
  }

  if (action === 'unforce_mute' || action === 'unmute') {
    await db
      .update(voiceRoomMembers)
      .set({ isMuted: false })
      .where(and(eq(voiceRoomMembers.roomId, roomId), eq(voiceRoomMembers.userUid, targetUid)));
    return await getVoiceRoomFullDetail(roomId, actorUid);
  }

  const effectiveRoleAction =
    action === 'move_to_audience' ||
    action === 'move_to_listeners' ||
    (action === 'set_role' && newRole === 'listener')
      ? 'to_listener'
      : action === 'promote_cohost' || (action === 'set_role' && (newRole === 'co_host' || newRole === 'moderator'))
        ? 'to_cohost'
        : action === 'demote_cohost'
          ? 'demote_cohost'
          : 'to_speaker';

  if ((effectiveRoleAction === 'to_cohost' || effectiveRoleAction === 'demote_cohost') && !perms.canManageCoHosts) {
    throw new HttpError(403, 'Only the Room Host can assign or remove Co-hosts.');
  }

  if (effectiveRoleAction === 'to_listener') {
    await db
      .update(voiceRoomMembers)
      .set({
        role: 'listener',
        seatNumber: null,
        isMuted: true,
        isCameraOn: false,
      })
      .where(and(eq(voiceRoomMembers.roomId, roomId), eq(voiceRoomMembers.userUid, targetUid)));
    return await getVoiceRoomFullDetail(roomId, actorUid);
  }

  if (effectiveRoleAction === 'demote_cohost') {
    await db
      .update(voiceRoomMembers)
      .set({ role: 'speaker' })
      .where(and(eq(voiceRoomMembers.roomId, roomId), eq(voiceRoomMembers.userUid, targetUid)));
    return await getVoiceRoomFullDetail(roomId, actorUid);
  }

  // Promoting to Speaker or Co-Host: enforce strict 12-seat stage limit under transaction lock!
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT id FROM voice_rooms WHERE id = ${roomId} FOR UPDATE`);

    const currentMembers = await tx
      .select()
      .from(voiceRoomMembers)
      .where(eq(voiceRoomMembers.roomId, roomId));

    const existing = currentMembers.find((m) => m.userUid === targetUid);
    if (!existing) {
      throw new HttpError(404, 'Participant is no longer in the room.');
    }

    const otherStage = currentMembers.filter(
      (m) => m.userUid !== targetUid && isStageSpeakerRole(m.role)
    );

    if (!isStageSpeakerRole(existing.role) && otherStage.length >= MAX_VOICE_SPEAKERS) {
      throw new HttpError(409, `All ${MAX_VOICE_SPEAKERS} speaker seats are currently occupied.`);
    }

    const seat =
      (isStageSpeakerRole(existing.role) && existing.seatNumber) ||
      pickLowestAvailableSeat(otherStage.map((m) => m.seatNumber));

    if (!seat) {
      throw new HttpError(409, `All ${MAX_VOICE_SPEAKERS} speaker seats are currently occupied.`);
    }

    await tx
      .update(voiceRoomMembers)
      .set({
        role: effectiveRoleAction === 'to_cohost' ? 'co_host' : 'speaker',
        seatNumber: seat,
        isCameraOn: existing.isCameraOn && perms.room.mediaMode === 'video',
      })
      .where(and(eq(voiceRoomMembers.roomId, roomId), eq(voiceRoomMembers.userUid, targetUid)));

    await tx
      .delete(voiceRoomRequests)
      .where(
        and(
          eq(voiceRoomRequests.roomId, roomId),
          eq(voiceRoomRequests.userUid, targetUid),
          eq(voiceRoomRequests.status, 'pending')
        )
      );
  });

  return await getVoiceRoomFullDetail(roomId, actorUid);
}

// ============================================================================
// INTEGRATED LIVE TEXT CHAT & EXACT @USERNAME MENTION ENGINE
// ============================================================================

async function hydrateVoiceMessages(
  rows: (typeof voiceRoomMessages.$inferSelect)[],
  viewerUid?: string
) {
  if (rows.length === 0) return [];

  let blockedSet = new Set<string>();
  if (viewerUid) {
    const blocks = await db
      .select()
      .from(blockedUsers)
      .where(or(eq(blockedUsers.blockerUid, viewerUid), eq(blockedUsers.blockedUid, viewerUid)));
    blockedSet = new Set(
      blocks.map((b) => (b.blockerUid === viewerUid ? b.blockedUid : b.blockerUid))
    );
  }

  const visible = rows.filter((r) => !blockedSet.has(r.senderUid));
  if (visible.length === 0) return [];

  const allUids = new Set<string>();
  const replyIds = new Set<number>();
  for (const r of visible) {
    allUids.add(r.senderUid);
    for (const mUid of r.mentionedUids || []) allUids.add(mUid);
    if (r.replyToMessageId) replyIds.add(r.replyToMessageId);
  }

  const [userRows, replyRows] = await Promise.all([
    allUids.size > 0
      ? db
          .select({
            uid: users.uid,
            username: users.username,
            role: users.role,
            displayName: profiles.displayName,
            avatarUrl: profiles.avatarUrl,
          })
          .from(users)
          .innerJoin(profiles, eq(users.uid, profiles.userUid))
          .where(inArray(users.uid, Array.from(allUids)))
      : Promise.resolve([]),
    replyIds.size > 0
      ? db
          .select({
            id: voiceRoomMessages.id,
            senderUid: voiceRoomMessages.senderUid,
            content: voiceRoomMessages.content,
            isDeleted: voiceRoomMessages.isDeleted,
          })
          .from(voiceRoomMessages)
          .where(inArray(voiceRoomMessages.id, Array.from(replyIds)))
      : Promise.resolve([]),
  ]);

  for (const rp of replyRows) {
    if (!allUids.has(rp.senderUid)) {
      allUids.add(rp.senderUid);
    }
  }

  const userMap = new Map(userRows.map((u) => [u.uid, u]));
  const replyMap = new Map(replyRows.map((rp) => [rp.id, rp]));

  return visible.map((m) => {
    const sender = userMap.get(m.senderUid);
    const replyRaw = m.replyToMessageId ? replyMap.get(m.replyToMessageId) : null;
    const replySender = replyRaw ? userMap.get(replyRaw.senderUid) : null;

    const mentionedUsers = (m.mentionedUids || [])
      .map((u) => userMap.get(u))
      .filter(Boolean)
      .map((u) => ({
        uid: u!.uid,
        username: u!.username,
        displayName: u!.displayName,
      }));

    const replyPreviewObj = replyRaw
      ? {
          id: replyRaw.id,
          content: replyRaw.isDeleted ? 'Message removed' : replyRaw.content.slice(0, 120),
          senderUsername: replySender?.username || 'hunter',
          senderDisplayName: replySender?.displayName || 'Hunter',
        }
      : null;

    const rxMap = m.isDeleted ? {} : m.reactionsJson || {};

    return {
      id: m.id,
      roomId: m.roomId,
      senderUid: m.senderUid,
      messageType: m.messageType,
      content: m.isDeleted ? 'Message removed' : m.content,
      isDeleted: m.isDeleted,
      replyToMessageId: m.replyToMessageId,
      replyToId: m.replyToMessageId,
      replyTo: replyPreviewObj,
      replyPreview: replyPreviewObj,
      mentionedUids: m.mentionedUids || [],
      mentionedUsers,
      mentions: mentionedUsers,
      reactionsJson: rxMap,
      reactions: formatReactionsArray(rxMap),
      createdAt: m.createdAt.toISOString(),
      sender: {
        uid: m.senderUid,
        username: sender?.username || 'hunter',
        displayName: sender?.displayName || 'Hunter',
        avatarUrl: sender?.avatarUrl || '/assets/zenitsu-avatar.png',
        userRole: sender?.role || 'user',
        role: sender?.role || 'user',
      },
    };
  });
}

export async function listVoiceRoomMessages(roomId: number, viewerUid?: string, limit = 80) {
  const rows = await db
    .select()
    .from(voiceRoomMessages)
    .where(and(eq(voiceRoomMessages.roomId, roomId), eq(voiceRoomMessages.isDeleted, false)))
    .orderBy(desc(voiceRoomMessages.id))
    .limit(Math.min(150, Math.max(10, limit)));

  const chronological = [...rows].reverse();
  return await hydrateVoiceMessages(chronological, viewerUid);
}

export async function sendVoiceRoomMessage(
  roomId: number,
  senderUid: string,
  payload: {
    content: string;
    replyToMessageId?: number | null;
    replyToId?: number | null;
    mentionedUids?: string[];
  }
) {
  const perms = await getVoiceActorPermissions(roomId, senderUid);
  if (!perms.room.isActive) {
    throw new HttpError(400, 'This voice room has ended.');
  }

  const [banRow] = await db
    .select()
    .from(voiceRoomBans)
    .where(and(eq(voiceRoomBans.roomId, roomId), eq(voiceRoomBans.userUid, senderUid)))
    .limit(1);
  if (banRow && (!banRow.expiresAt || banRow.expiresAt > new Date())) {
    throw new HttpError(403, 'You are banned from this voice room.');
  }

  if (!perms.room.chatEnabled && !perms.canManageStage) {
    throw new HttpError(403, 'Text chat is currently disabled by the host.');
  }

  const cleanContent = String(payload.content || '').trim().slice(0, 1000);
  if (!cleanContent) {
    throw new HttpError(400, 'Enter a message to send.');
  }

  // Extract exact @username handles from text + verify explicit mentionedUids against database `users` table
  // NEVER match by display name so similar display names never mis-tag another user!
  const handleMatches = Array.from(cleanContent.matchAll(/(?:^|\s)@([a-zA-Z0-9_.-]{3,24})\b/g)).map(
    (m) => normalizeKageUsername(m[1])
  );
  const explicitUids = Array.isArray(payload.mentionedUids)
    ? payload.mentionedUids.filter((u): u is string => typeof u === 'string' && u.length > 0)
    : [];

  const resolvedMentionUids = new Set<string>();
  const resolvedMentionUsers: { uid: string; username: string; displayName: string }[] = [];

  if (handleMatches.length > 0 || explicitUids.length > 0) {
    const conds: any[] = [];
    if (handleMatches.length > 0) {
      conds.push(inArray(users.usernameNormalized, Array.from(new Set(handleMatches))));
    }
    if (explicitUids.length > 0) {
      conds.push(inArray(users.uid, Array.from(new Set(explicitUids)).slice(0, 15)));
    }

    const matchedUsers = await db
      .select({
        uid: users.uid,
        username: users.username,
        usernameNormalized: users.usernameNormalized,
        displayName: profiles.displayName,
      })
      .from(users)
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(or(...conds));

    const handleSet = new Set(handleMatches);
    for (const mu of matchedUsers) {
      // Only include explicit UID if its exact @username ALSO appears in the message text
      const norm = mu.usernameNormalized || mu.username.toLowerCase();
      if (handleSet.has(norm)) {
        resolvedMentionUids.add(mu.uid);
        resolvedMentionUsers.push({
          uid: mu.uid,
          username: mu.username,
          displayName: mu.displayName,
        });
      }
    }
  }

  const mentionArray = Array.from(resolvedMentionUids);

  const resolvedReplyId = payload.replyToMessageId ?? payload.replyToId ?? null;

  const [inserted] = await db
    .insert(voiceRoomMessages)
    .values({
      roomId,
      senderUid,
      messageType: 'text',
      content: cleanContent,
      replyToMessageId: resolvedReplyId ? Number(resolvedReplyId) : null,
      mentionedUids: mentionArray,
      reactionsJson: {},
      isDeleted: false,
    })
    .returning();

  const hydrated = await hydrateVoiceMessages([inserted], senderUid);
  const message = hydrated[0];

  // Create persistent mention notifications for tagged users (excluding sender)
  const notifyTargetUids = mentionArray.filter((u) => u !== senderUid);
  if (notifyTargetUids.length > 0) {
    const senderName = message?.sender?.displayName || 'A hunter';
    const senderHandle = message?.sender?.username || 'hunter';
    await db.insert(notifications).values(
      notifyTargetUids.map((targetUid) => ({
        recipientUid: targetUid,
        actorUid: senderUid,
        type: 'mention',
        title: `${senderName} (@${senderHandle}) mentioned you in ${perms.room.title}`,
        body: `"${cleanContent.slice(0, 120)}"`,
        linkUrl: `/voice/${roomId}`,
        isRead: false,
      }))
    );
  }

  return {
    message,
    mentionedUids: notifyTargetUids,
    roomTitle: perms.room.title,
  };
}

export async function toggleVoiceRoomMessageReaction(
  roomId: number,
  messageId: number,
  userUid: string,
  emoji: string
) {
  const allowedEmojis = ['🔥', '❤️', '😂', '👑', '⚡', '👏'];
  const cleanEmoji = allowedEmojis.includes(emoji) ? emoji : '🔥';

  const [msg] = await db
    .select()
    .from(voiceRoomMessages)
    .where(and(eq(voiceRoomMessages.id, messageId), eq(voiceRoomMessages.roomId, roomId)))
    .limit(1);

  if (!msg || msg.isDeleted) {
    throw new HttpError(404, 'Message not found.');
  }

  const currentMap: Record<string, string[]> = { ...(msg.reactionsJson || {}) };
  const list = Array.isArray(currentMap[cleanEmoji]) ? [...currentMap[cleanEmoji]] : [];
  const idx = list.indexOf(userUid);
  if (idx >= 0) {
    list.splice(idx, 1);
  } else {
    list.push(userUid);
  }

  if (list.length === 0) {
    delete currentMap[cleanEmoji];
  } else {
    currentMap[cleanEmoji] = list;
  }

  await db
    .update(voiceRoomMessages)
    .set({ reactionsJson: currentMap })
    .where(eq(voiceRoomMessages.id, messageId));

  return {
    messageId,
    roomId,
    reactionsJson: currentMap,
    reactions: formatReactionsArray(currentMap),
  };
}

export async function deleteVoiceRoomMessage(
  roomId: number,
  messageId: number,
  actorUid: string
) {
  const perms = await getVoiceActorPermissions(roomId, actorUid);
  const [msg] = await db
    .select()
    .from(voiceRoomMessages)
    .where(and(eq(voiceRoomMessages.id, messageId), eq(voiceRoomMessages.roomId, roomId)))
    .limit(1);

  if (!msg) {
    throw new HttpError(404, 'Message not found.');
  }

  if (msg.senderUid !== actorUid && !perms.canManageStage) {
    throw new HttpError(403, 'You can only delete your own messages unless you are a room moderator.');
  }

  await db
    .update(voiceRoomMessages)
    .set({ isDeleted: true, deletedByUid: actorUid, content: '' })
    .where(eq(voiceRoomMessages.id, messageId));

  return { messageId, roomId, deleted: true };
}
