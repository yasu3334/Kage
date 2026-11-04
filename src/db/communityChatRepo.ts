import { and, asc, desc, eq, inArray, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  blockedUsers,
  communities,
  communityChatMessages,
  communityChatRooms,
  communityEventRsvps,
  communityEvents,
  notifications,
  profiles,
  users,
} from './schema.ts';
import { getGuildActorContext } from './guildSystemRepo.ts';
import { HttpError, normalizeKageUsername } from './profileSystemRepo.ts';
import { uploadValidatedMediaAsset } from '../server/mediaAccess.ts';

export const DEFAULT_COMMUNITY_CHAT_ROOMS = [
  {
    slug: 'general',
    name: 'general',
    description: 'Talk about anything anime related.',
    isSpoiler: false,
    writePermission: 'members',
    sortOrder: 1,
  },
  {
    slug: 'anime-discussion',
    name: 'anime-discussion',
    description: 'Anime discussions, theories, and thoughts.',
    isSpoiler: false,
    writePermission: 'members',
    sortOrder: 2,
  },
  {
    slug: 'manga-spoilers',
    name: 'manga-spoilers',
    description: 'Manga spoilers and latest chapters.',
    isSpoiler: true,
    writePermission: 'members',
    sortOrder: 3,
  },
  {
    slug: 'edits-and-art',
    name: 'edits-and-art',
    description: 'Share your edits, art and creations.',
    isSpoiler: false,
    writePermission: 'members',
    sortOrder: 4,
  },
  {
    slug: 'questions',
    name: 'questions',
    description: 'Ask anything anime related.',
    isSpoiler: false,
    writePermission: 'members',
    sortOrder: 5,
  },
  {
    slug: 'announcements',
    name: 'announcements',
    description: 'Official updates and news.',
    isSpoiler: false,
    writePermission: 'moderators',
    sortOrder: 6,
  },
] as const;

export async function ensureDefaultCommunityChatRooms(
  communityId: number,
  creatorUid?: string | null
) {
  const existing = await db
    .select({ slug: communityChatRooms.slug })
    .from(communityChatRooms)
    .where(eq(communityChatRooms.communityId, communityId));

  const existingSlugs = new Set(existing.map((r) => r.slug));
  const missing = DEFAULT_COMMUNITY_CHAT_ROOMS.filter((d) => !existingSlugs.has(d.slug));

  if (missing.length > 0) {
    await db
      .insert(communityChatRooms)
      .values(
        missing.map((d) => ({
          communityId,
          slug: d.slug,
          name: d.name,
          description: d.description,
          isSpoiler: d.isSpoiler,
          writePermission: d.writePermission,
          sortOrder: d.sortOrder,
          createdByUid: creatorUid || null,
        }))
      )
      .onConflictDoNothing();
  }
}

export async function listCommunityChatRooms(communityId: number, viewerUid?: string) {
  const ctx = await getGuildActorContext(communityId, viewerUid);
  if (!ctx.canViewPrivate) {
    return [];
  }

  await ensureDefaultCommunityChatRooms(communityId, ctx.guild.ownerUid);

  const rooms = await db
    .select()
    .from(communityChatRooms)
    .where(
      and(
        eq(communityChatRooms.communityId, communityId),
        eq(communityChatRooms.isArchived, false)
      )
    )
    .orderBy(asc(communityChatRooms.sortOrder), asc(communityChatRooms.id));

  if (rooms.length === 0) return [];

  const msgCounts = await db
    .select({
      roomId: communityChatMessages.roomId,
      count: sql<number>`count(*)::int`,
    })
    .from(communityChatMessages)
    .where(
      and(
        eq(communityChatMessages.communityId, communityId),
        eq(communityChatMessages.isDeleted, false)
      )
    )
    .groupBy(communityChatMessages.roomId);

  const countMap = new Map(msgCounts.map((m) => [m.roomId, m.count]));

  return rooms.map((room) => ({
    ...room,
    messageCount: countMap.get(room.id) || 0,
  }));
}

export async function createCommunityChatRoom(
  actorUid: string,
  communityId: number,
  payload: {
    name: string;
    description?: string;
    isSpoiler?: boolean;
    writePermission?: 'members' | 'moderators';
  }
) {
  const ctx = await getGuildActorContext(communityId, actorUid);
  if (!ctx.canModerate) {
    throw new HttpError(403, 'Only community moderators, admins, or owners can create chat rooms.');
  }

  const rawName = String(payload.name || '')
    .trim()
    .toLowerCase()
    .replace(/^#+/, '')
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36);

  if (rawName.length < 2) {
    throw new HttpError(400, 'Room name must be at least 2 characters.');
  }

  const [existing] = await db
    .select({ id: communityChatRooms.id })
    .from(communityChatRooms)
    .where(
      and(eq(communityChatRooms.communityId, communityId), eq(communityChatRooms.slug, rawName))
    )
    .limit(1);

  if (existing) {
    throw new HttpError(409, `A room named #${rawName} already exists in this community.`);
  }

  const [maxSortRow] = await db
    .select({ maxSort: sql<number>`COALESCE(MAX(${communityChatRooms.sortOrder}), 6)::int` })
    .from(communityChatRooms)
    .where(eq(communityChatRooms.communityId, communityId));

  const [created] = await db
    .insert(communityChatRooms)
    .values({
      communityId,
      slug: rawName,
      name: rawName,
      description: String(payload.description || 'Community chat channel.').trim().slice(0, 160),
      isSpoiler: Boolean(payload.isSpoiler),
      writePermission: payload.writePermission === 'moderators' ? 'moderators' : 'members',
      sortOrder: (maxSortRow?.maxSort || 6) + 1,
      createdByUid: actorUid,
    })
    .returning();

  return created;
}

export async function deleteCommunityChatRoom(
  actorUid: string,
  communityId: number,
  roomId: number
) {
  const ctx = await getGuildActorContext(communityId, actorUid);
  if (!ctx.canEditSettings) {
    throw new HttpError(403, 'Only community admins or owners can delete chat rooms.');
  }

  await db
    .update(communityChatRooms)
    .set({ isArchived: true })
    .where(
      and(eq(communityChatRooms.id, roomId), eq(communityChatRooms.communityId, communityId))
    );

  return { archived: true };
}

async function hydrateCommunityChatMessages(
  rows: (typeof communityChatMessages.$inferSelect)[],
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

  const uids = new Set<string>();
  const replyIds = new Set<number>();
  for (const r of visible) {
    uids.add(r.senderUid);
    if (r.replyToMessageId) replyIds.add(r.replyToMessageId);
  }

  const [userRows, replyRows] = await Promise.all([
    db
      .select({
        uid: users.uid,
        username: users.username,
        role: users.role,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
      })
      .from(users)
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(inArray(users.uid, Array.from(uids))),
    replyIds.size > 0
      ? db
          .select({
            id: communityChatMessages.id,
            senderUid: communityChatMessages.senderUid,
            content: communityChatMessages.content,
            isDeleted: communityChatMessages.isDeleted,
          })
          .from(communityChatMessages)
          .where(inArray(communityChatMessages.id, Array.from(replyIds)))
      : Promise.resolve([]),
  ]);

  const userMap = new Map(userRows.map((u) => [u.uid, u]));
  const replyMap = new Map(replyRows.map((rp) => [rp.id, rp]));

  return visible.map((m) => {
    const sender = userMap.get(m.senderUid);
    const replyRaw = m.replyToMessageId ? replyMap.get(m.replyToMessageId) : null;
    const replySender = replyRaw ? userMap.get(replyRaw.senderUid) : null;
    return {
      id: m.id,
      roomId: m.roomId,
      communityId: m.communityId,
      senderUid: m.senderUid,
      content: m.isDeleted ? 'Message removed' : m.content,
      mediaUrl: m.isDeleted ? null : m.mediaUrl,
      mediaType: m.isDeleted ? 'none' : m.mediaType,
      posterUrl: m.posterUrl,
      isSpoiler: m.isSpoiler,
      isDeleted: m.isDeleted,
      replyToMessageId: m.replyToMessageId,
      replyTo: replyRaw
        ? {
            id: replyRaw.id,
            content: replyRaw.isDeleted ? 'Message removed' : replyRaw.content.slice(0, 120),
            senderUsername: replySender?.username || 'hunter',
            senderDisplayName: replySender?.displayName || 'Hunter',
          }
        : null,
      mentionedUids: m.mentionedUids || [],
      reactionsJson: m.isDeleted ? {} : m.reactionsJson || {},
      createdAt: m.createdAt.toISOString(),
      sender: {
        uid: m.senderUid,
        username: sender?.username || 'hunter',
        displayName: sender?.displayName || 'Hunter',
        avatarUrl: sender?.avatarUrl || '/assets/zenitsu-avatar.png',
        userRole: sender?.role || 'user',
      },
    };
  });
}

export async function listCommunityChatMessages(
  communityId: number,
  roomSlug: string,
  viewerUid?: string,
  limit = 80
) {
  const ctx = await getGuildActorContext(communityId, viewerUid);
  if (!ctx.canViewPrivate) {
    throw new HttpError(403, 'Join this private community to view chat rooms.');
  }

  await ensureDefaultCommunityChatRooms(communityId, ctx.guild.ownerUid);

  const [room] = await db
    .select()
    .from(communityChatRooms)
    .where(
      and(
        eq(communityChatRooms.communityId, communityId),
        eq(communityChatRooms.slug, roomSlug),
        eq(communityChatRooms.isArchived, false)
      )
    )
    .limit(1);

  if (!room) {
    throw new HttpError(404, 'Chat room not found.');
  }

  const rows = await db
    .select()
    .from(communityChatMessages)
    .where(eq(communityChatMessages.roomId, room.id))
    .orderBy(desc(communityChatMessages.id))
    .limit(Math.min(150, Math.max(10, limit)));

  const messages = await hydrateCommunityChatMessages([...rows].reverse(), viewerUid);
  return {
    room,
    messages,
    canWrite:
      room.writePermission === 'moderators'
        ? ctx.canModerate
        : Boolean(ctx.membership || ctx.isPlatformAdmin || ctx.guild.privacyMode === 'public'),
  };
}

export async function sendCommunityChatMessage(
  senderUid: string,
  communityId: number,
  roomSlug: string,
  payload: {
    content?: string;
    imageDataUrl?: string;
    mediaUrl?: string;
    isSpoiler?: boolean;
    replyToMessageId?: number | null;
  }
) {
  const ctx = await getGuildActorContext(communityId, senderUid);
  if (ctx.isBanned) {
    throw new HttpError(403, 'You are banned from this community.');
  }
  if (ctx.membership?.isMuted && (!ctx.membership.mutedUntil || ctx.membership.mutedUntil > new Date())) {
    throw new HttpError(403, 'You are currently muted in this community.');
  }
  if (!ctx.membership && !ctx.isPlatformAdmin) {
    throw new HttpError(403, 'Join the community first to chat in its rooms.');
  }

  const [room] = await db
    .select()
    .from(communityChatRooms)
    .where(
      and(
        eq(communityChatRooms.communityId, communityId),
        eq(communityChatRooms.slug, roomSlug),
        eq(communityChatRooms.isArchived, false)
      )
    )
    .limit(1);

  if (!room) {
    throw new HttpError(404, 'Chat room not found.');
  }

  if (room.writePermission === 'moderators' && !ctx.canModerate) {
    throw new HttpError(403, 'Only moderators and admins can post in #announcements.');
  }

  const cleanContent = String(payload.content || '').trim().slice(0, 1500);
  let mediaUrl: string | null = null;
  let mediaType: 'none' | 'image' = 'none';

  if (payload.imageDataUrl) {
    const up = await uploadValidatedMediaAsset(senderUid, {
      dataUrl: payload.imageDataUrl,
      mediaType: 'image',
      purpose: 'guild_media',
      visibility: ctx.guild.privacyMode === 'private' ? 'private_guild' : 'public',
      communityId,
    });
    mediaUrl = up.url;
    mediaType = 'image';
  } else if (payload.mediaUrl && payload.mediaUrl.startsWith('/api/media/')) {
    mediaUrl = payload.mediaUrl;
    mediaType = 'image';
  }

  if (!cleanContent && !mediaUrl) {
    throw new HttpError(400, 'Enter a message or attach media.');
  }

  const handleMatches = Array.from(cleanContent.matchAll(/(?:^|\s)@([a-zA-Z0-9_.-]{3,24})\b/g)).map(
    (m) => normalizeKageUsername(m[1])
  );
  let mentionUids: string[] = [];
  if (handleMatches.length > 0) {
    const matched = await db
      .select({ uid: users.uid })
      .from(users)
      .where(inArray(users.usernameNormalized, Array.from(new Set(handleMatches))));
    mentionUids = matched.map((u) => u.uid);
  }

  const [inserted] = await db
    .insert(communityChatMessages)
    .values({
      roomId: room.id,
      communityId,
      senderUid,
      content: cleanContent,
      mediaUrl,
      mediaType,
      isSpoiler: Boolean(payload.isSpoiler || room.isSpoiler),
      replyToMessageId: payload.replyToMessageId ? Number(payload.replyToMessageId) : null,
      mentionedUids: mentionUids,
      reactionsJson: {},
      isDeleted: false,
    })
    .returning();

  await db
    .update(communityChatRooms)
    .set({ lastMessageAt: new Date() })
    .where(eq(communityChatRooms.id, room.id));

  const hydrated = await hydrateCommunityChatMessages([inserted], senderUid);
  const message = hydrated[0];

  const notifyTargets = mentionUids.filter((u) => u !== senderUid);
  if (notifyTargets.length > 0) {
    await db.insert(notifications).values(
      notifyTargets.map((tUid) => ({
        recipientUid: tUid,
        actorUid: senderUid,
        type: 'mention',
        title: `${message?.sender?.displayName || 'A hunter'} mentioned you in #${room.name}`,
        body: `"${cleanContent.slice(0, 110)}"`,
        linkUrl: `/guilds/${ctx.guild.slug}/rooms/${room.slug}`,
        isRead: false,
      }))
    );
  }

  return { room, message, mentionedUids: notifyTargets };
}

export async function toggleCommunityChatReaction(
  actorUid: string,
  communityId: number,
  messageId: number,
  emoji: string
) {
  const allowed = ['🔥', '❤️', '😂', '👑', '⚡', '👏'];
  const cleanEmoji = allowed.includes(emoji) ? emoji : '🔥';

  const [msg] = await db
    .select()
    .from(communityChatMessages)
    .where(
      and(
        eq(communityChatMessages.id, messageId),
        eq(communityChatMessages.communityId, communityId)
      )
    )
    .limit(1);

  if (!msg || msg.isDeleted) {
    throw new HttpError(404, 'Message not found.');
  }

  const map: Record<string, string[]> = { ...(msg.reactionsJson || {}) };
  const arr = Array.isArray(map[cleanEmoji]) ? [...map[cleanEmoji]] : [];
  const idx = arr.indexOf(actorUid);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(actorUid);

  if (arr.length === 0) delete map[cleanEmoji];
  else map[cleanEmoji] = arr;

  await db
    .update(communityChatMessages)
    .set({ reactionsJson: map })
    .where(eq(communityChatMessages.id, messageId));

  return { messageId, roomId: msg.roomId, reactionsJson: map };
}

export async function deleteCommunityChatMessage(
  actorUid: string,
  communityId: number,
  messageId: number
) {
  const ctx = await getGuildActorContext(communityId, actorUid);
  const [msg] = await db
    .select()
    .from(communityChatMessages)
    .where(
      and(
        eq(communityChatMessages.id, messageId),
        eq(communityChatMessages.communityId, communityId)
      )
    )
    .limit(1);

  if (!msg) {
    throw new HttpError(404, 'Message not found.');
  }
  if (msg.senderUid !== actorUid && !ctx.canModerate) {
    throw new HttpError(403, 'You can only delete your own messages.');
  }

  await db
    .update(communityChatMessages)
    .set({ isDeleted: true, content: '', mediaUrl: null, mediaType: 'none' })
    .where(eq(communityChatMessages.id, messageId));

  return { messageId, roomId: msg.roomId, deleted: true };
}

// ============================================================================
// COMMUNITY EVENTS & RSVPS
// ============================================================================

export async function listCommunityEvents(communityId: number, viewerUid?: string) {
  const events = await db
    .select({
      event: communityEvents,
      creatorUsername: users.username,
      creatorDisplayName: profiles.displayName,
    })
    .from(communityEvents)
    .leftJoin(users, eq(communityEvents.creatorUid, users.uid))
    .leftJoin(profiles, eq(communityEvents.creatorUid, profiles.userUid))
    .where(eq(communityEvents.communityId, communityId))
    .orderBy(asc(communityEvents.startsAt))
    .limit(30);

  let myRsvps = new Set<number>();
  if (viewerUid && events.length > 0) {
    const rsvps = await db
      .select({ eventId: communityEventRsvps.eventId })
      .from(communityEventRsvps)
      .where(
        and(
          eq(communityEventRsvps.userUid, viewerUid),
          inArray(
            communityEventRsvps.eventId,
            events.map((e) => e.event.id)
          )
        )
      );
    myRsvps = new Set(rsvps.map((r) => r.eventId));
  }

  return events.map((e) => ({
    ...e.event,
    startsAt: e.event.startsAt.toISOString(),
    endsAt: e.event.endsAt ? e.event.endsAt.toISOString() : null,
    createdAt: e.event.createdAt.toISOString(),
    creatorUsername: e.creatorUsername || 'kage',
    creatorDisplayName: e.creatorDisplayName || 'Community Host',
    viewerGoing: myRsvps.has(e.event.id),
  }));
}

export async function createCommunityEvent(
  actorUid: string,
  communityId: number,
  payload: {
    title: string;
    description?: string;
    eventType?: string;
    startsAt: string;
    locationLabel?: string;
    voiceRoomId?: number | null;
  }
) {
  const ctx = await getGuildActorContext(communityId, actorUid);
  if (!ctx.canModerate) {
    throw new HttpError(403, 'Only moderators, admins, or owners can schedule community events.');
  }

  const cleanTitle = String(payload.title || '').trim().slice(0, 100);
  if (cleanTitle.length < 3) {
    throw new HttpError(400, 'Event title must be at least 3 characters.');
  }
  const parsedDate = new Date(payload.startsAt);
  if (Number.isNaN(parsedDate.getTime())) {
    throw new HttpError(400, 'Provide a valid event date and time.');
  }

  const [created] = await db
    .insert(communityEvents)
    .values({
      communityId,
      creatorUid: actorUid,
      title: cleanTitle,
      description: String(payload.description || '').trim().slice(0, 600),
      eventType: String(payload.eventType || 'watch_party').slice(0, 30),
      startsAt: parsedDate,
      locationLabel: String(payload.locationLabel || 'Anime Universe Stage').trim().slice(0, 80),
      voiceRoomId: payload.voiceRoomId ? Number(payload.voiceRoomId) : null,
      rsvpCount: 1,
    })
    .returning();

  await db
    .insert(communityEventRsvps)
    .values({ eventId: created.id, userUid: actorUid, status: 'going' })
    .onConflictDoNothing();

  return created;
}

export async function toggleCommunityEventRsvp(
  actorUid: string,
  communityId: number,
  eventId: number
) {
  const [ev] = await db
    .select()
    .from(communityEvents)
    .where(and(eq(communityEvents.id, eventId), eq(communityEvents.communityId, communityId)))
    .limit(1);

  if (!ev) {
    throw new HttpError(404, 'Event not found.');
  }

  const [existing] = await db
    .select()
    .from(communityEventRsvps)
    .where(
      and(eq(communityEventRsvps.eventId, eventId), eq(communityEventRsvps.userUid, actorUid))
    )
    .limit(1);

  let going = false;
  if (existing) {
    await db.delete(communityEventRsvps).where(eq(communityEventRsvps.id, existing.id));
    going = false;
  } else {
    await db.insert(communityEventRsvps).values({
      eventId,
      userUid: actorUid,
      status: 'going',
    });
    going = true;
  }

  const [cnt] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(communityEventRsvps)
    .where(eq(communityEventRsvps.eventId, eventId));

  const rsvpCount = cnt?.c || 0;
  await db
    .update(communityEvents)
    .set({ rsvpCount })
    .where(eq(communityEvents.id, eventId));

  return { eventId, going, rsvpCount };
}
