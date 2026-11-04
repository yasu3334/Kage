import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  communities,
  communityJoinRequests,
  communityMemberships,
  communityModerationLogs,
  guildBans,
  guildInvitations,
  profiles,
  users,
} from './schema.ts';
import { HttpError, hasBlockBetween } from './profileSystemRepo.ts';
import { createNotification, syncCommunityCounts } from './repository.ts';
import { ensureStarterRewardsForGuild } from './clashSystemRepo.ts';
import {
  ensureDefaultCommunityChatRooms,
  listCommunityChatRooms,
  listCommunityEvents,
} from './communityChatRepo.ts';
import { listStandaloneVoiceRooms } from './voiceSystemRepo.ts';
import { isApprovedCatalogueImageUrl } from '../server/characterCatalogue.ts';
import { uploadValidatedMediaAsset } from '../server/mediaAccess.ts';

export type GuildRole = 'owner' | 'admin' | 'moderator' | 'member';

const ROLE_RANK: Record<string, number> = {
  owner: 4,
  admin: 3,
  moderator: 2,
  member: 1,
};

export async function getGuildActorContext(communityId: number, actorUid?: string) {
  const [guild] = await db
    .select()
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  if (!guild) {
    throw new HttpError(404, 'Guild not found.');
  }

  if (!actorUid) {
    return {
      guild,
      membership: null,
      guildRole: null as GuildRole | null,
      isPlatformAdmin: false,
      isBanned: false,
      canViewPrivate: guild.privacyMode !== 'private',
      canModerate: false,
      canManageRoles: false,
      canEditSettings: false,
      canManageOwnership: false,
    };
  }

  const [memRows, userRows, banRows] = await Promise.all([
    db
      .select()
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, communityId),
          eq(communityMemberships.userUid, actorUid)
        )
      )
      .limit(1),
    db.select({ role: users.role }).from(users).where(eq(users.uid, actorUid)).limit(1),
    db
      .select()
      .from(guildBans)
      .where(and(eq(guildBans.communityId, communityId), eq(guildBans.userUid, actorUid)))
      .limit(1),
  ]);

  const membership = memRows[0] || null;
  const guildRole = (membership?.role as GuildRole | undefined) || null;
  const isPlatformAdmin = userRows[0]?.role === 'owner' || userRows[0]?.role === 'admin';
  const activeBan =
    banRows[0] && (!banRows[0].expiresAt || banRows[0].expiresAt > new Date())
      ? banRows[0]
      : null;

  const rank = guildRole ? ROLE_RANK[guildRole] || 0 : 0;

  return {
    guild,
    membership,
    guildRole,
    isPlatformAdmin,
    isBanned: Boolean(activeBan),
    canViewPrivate: guild.privacyMode !== 'private' || Boolean(membership) || isPlatformAdmin,
    canModerate: rank >= 2 || isPlatformAdmin,
    canManageRoles: rank >= 3 || isPlatformAdmin,
    canEditSettings: rank >= 3 || isPlatformAdmin,
    canManageOwnership: guildRole === 'owner' || guild.ownerUid === actorUid || isPlatformAdmin,
  };
}

async function logModerationAction(params: {
  communityId: number;
  actorUid: string;
  targetUid?: string | null;
  actionType: string;
  reason?: string;
  expiresAt?: Date | null;
}) {
  await db.insert(communityModerationLogs).values({
    communityId: params.communityId,
    actorUid: params.actorUid,
    targetUid: params.targetUid || null,
    actionType: params.actionType,
    reason: (params.reason || '').slice(0, 400),
    expiresAt: params.expiresAt || null,
    isActive: true,
  });
}

export async function listGuildsDiscovery(params: {
  q?: string;
  category?: string;
  genre?: string;
  privacyMode?: string;
  joinedOnly?: boolean;
  animeMalId?: number;
  sort?: string; // 'popular' | 'newest'
  limit?: number;
  offset?: number;
  viewerUid?: string;
}) {
  const limit = Math.max(1, Math.min(50, params.limit || 24));
  const offset = Math.max(0, params.offset || 0);

  const conds: any[] = [eq(communities.isArchived, false)];

  if (params.q?.trim()) {
    const pat = `%${params.q.trim()}%`;
    conds.push(
      or(
        ilike(communities.name, pat),
        ilike(communities.description, pat),
        ilike(communities.animeTitle, pat)
      )
    );
  }
  if (params.category?.trim() && params.category !== 'all') {
    conds.push(eq(communities.category, params.category.trim()));
  }
  if (params.privacyMode?.trim() && params.privacyMode !== 'all') {
    conds.push(eq(communities.privacyMode, params.privacyMode.trim()));
  }
  if (params.animeMalId) {
    conds.push(eq(communities.animeMalId, params.animeMalId));
  }
  if (params.genre?.trim() && params.genre !== 'all') {
    conds.push(sql`${communities.genreTags} @> ${JSON.stringify([params.genre.trim()])}::jsonb`);
  }

  let myMemberships = new Map<number, string>();
  let myPendingRequests = new Set<number>();
  let myPendingInvites = new Map<number, number>();

  if (params.viewerUid) {
    const [mems, reqs, invs] = await Promise.all([
      db
        .select()
        .from(communityMemberships)
        .where(eq(communityMemberships.userUid, params.viewerUid)),
      db
        .select({ communityId: communityJoinRequests.communityId })
        .from(communityJoinRequests)
        .where(
          and(
            eq(communityJoinRequests.userUid, params.viewerUid),
            eq(communityJoinRequests.status, 'pending')
          )
        ),
      db
        .select({ id: guildInvitations.id, communityId: guildInvitations.communityId })
        .from(guildInvitations)
        .where(
          and(
            eq(guildInvitations.inviteeUid, params.viewerUid),
            eq(guildInvitations.status, 'pending')
          )
        ),
    ]);
    myMemberships = new Map(mems.map((m) => [m.communityId, m.role]));
    myPendingRequests = new Set(reqs.map((r) => r.communityId));
    myPendingInvites = new Map(invs.map((inv) => [inv.communityId, inv.id]));

    if (params.joinedOnly) {
      const ids = Array.from(myMemberships.keys());
      if (ids.length === 0) {
        return { items: [], total: 0, hasMore: false };
      }
      conds.push(inArray(communities.id, ids));
    }
  } else if (params.joinedOnly) {
    return { items: [], total: 0, hasMore: false };
  }

  const orderExpr =
    params.sort === 'newest'
      ? [desc(communities.createdAt)]
      : [desc(communities.isVerified), desc(communities.memberCount), desc(communities.discussionCount)];

  const whereExpr = and(...conds);
  const [countRes, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(communities).where(whereExpr),
    db
      .select()
      .from(communities)
      .where(whereExpr)
      .orderBy(...orderExpr)
      .limit(limit)
      .offset(offset),
  ]);

  const total = countRes[0]?.count || 0;

  return {
    items: rows.map((c) => ({
      ...c,
      isMember: myMemberships.has(c.id),
      memberRole: myMemberships.get(c.id) || null,
      hasPendingRequest: myPendingRequests.has(c.id),
      pendingInviteId: myPendingInvites.get(c.id) || null,
    })),
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
  };
}

export async function createFullGuild(
  ownerUid: string,
  payload: {
    name: string;
    description: string;
    category?: string;
    rules?: string;
    privacyMode?: 'public' | 'private';
    joinPolicy?: 'open' | 'approval' | 'invite_only';
    artworkUrl?: string;
    bannerUrl?: string;
    iconDataUrl?: string;
    bannerDataUrl?: string;
    animeMalId?: number | null;
    animeTitle?: string | null;
    genreTags?: string[];
  }
) {
  const cleanName = String(payload.name || '').trim().slice(0, 60);
  const cleanDesc = String(payload.description || '').trim().slice(0, 600);
  if (cleanName.length < 3) {
    throw new HttpError(400, 'Guild name must be between 3 and 60 characters.');
  }
  if (cleanDesc.length < 10) {
    throw new HttpError(400, 'Guild description must be at least 10 characters.');
  }

  const nameNormalized = cleanName.toLowerCase();
  const [duplicate] = await db
    .select({ id: communities.id })
    .from(communities)
    .where(
      or(
        eq(communities.nameNormalized, nameNormalized),
        sql`lower(trim(${communities.name})) = ${nameNormalized}`
      )
    )
    .limit(1);

  if (duplicate) {
    throw new HttpError(409, `A guild named "${cleanName}" already exists in KAGE.`);
  }

  let artworkUrl = '/assets/extracted/guild-shadow.jpg';
  if (payload.iconDataUrl) {
    const uploadedIcon = await uploadValidatedMediaAsset(ownerUid, {
      dataUrl: payload.iconDataUrl,
      mediaType: 'image',
      purpose: 'guild_media',
      visibility: 'public',
    });
    artworkUrl = uploadedIcon.url;
  } else if (payload.artworkUrl && isApprovedCatalogueImageUrl(payload.artworkUrl)) {
    artworkUrl = payload.artworkUrl;
  }

  let bannerUrl = artworkUrl;
  if (payload.bannerDataUrl) {
    const uploadedBanner = await uploadValidatedMediaAsset(ownerUid, {
      dataUrl: payload.bannerDataUrl,
      mediaType: 'image',
      purpose: 'guild_media',
      visibility: 'public',
    });
    bannerUrl = uploadedBanner.url;
  } else if (payload.bannerUrl && isApprovedCatalogueImageUrl(payload.bannerUrl)) {
    bannerUrl = payload.bannerUrl;
  }

  const privacyMode = payload.privacyMode === 'private' ? 'private' : 'public';
  let joinPolicy: 'open' | 'approval' | 'invite_only' =
    payload.joinPolicy === 'approval' || payload.joinPolicy === 'invite_only'
      ? payload.joinPolicy
      : 'open';

  if (privacyMode === 'private' && joinPolicy === 'open') {
    joinPolicy = 'approval';
  }

  const baseSlug =
    cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 42) || 'guild';

  let slug = baseSlug;
  const [slugTaken] = await db
    .select({ id: communities.id })
    .from(communities)
    .where(eq(communities.slug, slug))
    .limit(1);
  if (slugTaken) {
    slug = `${baseSlug}-${Math.floor(100 + Math.random() * 900)}`;
  }

  const rules =
    String(payload.rules || '').trim().slice(0, 1500) ||
    'Respect spoiler tags, fellow hunters, and guild moderators.';

  const [created] = await db
    .insert(communities)
    .values({
      slug,
      name: cleanName,
      nameNormalized,
      tagline: 'Different Worlds · Same Passion ✨',
      description: cleanDesc,
      category: String(payload.category || 'Anime Franchise').trim().slice(0, 60),
      rules,
      privacyMode,
      joinPolicy,
      artworkUrl,
      bannerUrl,
      chatBannerUrl: 'asset:anime_chat_banner',
      animeMalId: payload.animeMalId ? Number(payload.animeMalId) : null,
      animeTitle: payload.animeTitle ? String(payload.animeTitle).trim().slice(0, 140) : null,
      genreTags: Array.isArray(payload.genreTags) ? payload.genreTags.slice(0, 6) : ['Action'],
      ownerUid,
      isSeed: false,
      memberCount: 1,
      discussionCount: 0,
    })
    .returning();

  await db.insert(communityMemberships).values({
    communityId: created.id,
    userUid: ownerUid,
    role: 'owner',
  });

  await Promise.all([
    ensureStarterRewardsForGuild(created.id),
    ensureDefaultCommunityChatRooms(created.id, ownerUid),
  ]);

  return {
    ...created,
    isMember: true,
    memberRole: 'owner',
  };
}

export async function getGuildDetailWithContext(slugOrId: string, viewerUid?: string) {
  const numericId = Number(slugOrId);
  const [guild] = await db
    .select()
    .from(communities)
    .where(
      !Number.isNaN(numericId) && numericId > 0
        ? or(eq(communities.id, numericId), eq(communities.slug, slugOrId))
        : eq(communities.slug, slugOrId)
    )
    .limit(1);

  if (!guild) return null;

  const ctx = await getGuildActorContext(guild.id, viewerUid);

  if (guild.isArchived && !ctx.canManageOwnership) {
    throw new HttpError(404, 'This guild has been archived.');
  }

  const [pendingReqRows, pendingInvRows] = viewerUid
    ? await Promise.all([
        db
          .select()
          .from(communityJoinRequests)
          .where(
            and(
              eq(communityJoinRequests.communityId, guild.id),
              eq(communityJoinRequests.userUid, viewerUid),
              eq(communityJoinRequests.status, 'pending')
            )
          )
          .limit(1),
        db
          .select()
          .from(guildInvitations)
          .where(
            and(
              eq(guildInvitations.communityId, guild.id),
              eq(guildInvitations.inviteeUid, viewerUid),
              eq(guildInvitations.status, 'pending')
            )
          )
          .limit(1),
      ])
    : [[], []];

  let members: any[] = [];
  if (ctx.canViewPrivate) {
    members = await db
      .select({
        uid: users.uid,
        username: users.username,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
        role: communityMemberships.role,
        isMuted: communityMemberships.isMuted,
        mutedUntil: communityMemberships.mutedUntil,
        userRole: users.role,
        isAiDemo: users.isAiDemo,
        joinedAt: communityMemberships.createdAt,
      })
      .from(communityMemberships)
      .innerJoin(users, eq(communityMemberships.userUid, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(eq(communityMemberships.communityId, guild.id))
      .orderBy(
        sql`CASE WHEN ${communityMemberships.role} = 'owner' THEN 0 WHEN ${communityMemberships.role} = 'admin' THEN 1 WHEN ${communityMemberships.role} = 'moderator' THEN 2 ELSE 3 END`,
        asc(users.isAiDemo),
        communityMemberships.createdAt
      )
      .limit(120);
  }

  let joinRequests: any[] = [];
  let outgoingInvites: any[] = [];
  let bannedMembers: any[] = [];
  if (ctx.canModerate) {
    [joinRequests, outgoingInvites, bannedMembers] = await Promise.all([
      db
        .select({
          id: communityJoinRequests.id,
          userUid: communityJoinRequests.userUid,
          note: communityJoinRequests.note,
          status: communityJoinRequests.status,
          createdAt: communityJoinRequests.createdAt,
          username: users.username,
          displayName: profiles.displayName,
          avatarUrl: profiles.avatarUrl,
        })
        .from(communityJoinRequests)
        .innerJoin(users, eq(communityJoinRequests.userUid, users.uid))
        .innerJoin(profiles, eq(users.uid, profiles.userUid))
        .where(
          and(
            eq(communityJoinRequests.communityId, guild.id),
            eq(communityJoinRequests.status, 'pending')
          )
        )
        .orderBy(desc(communityJoinRequests.createdAt)),
      db
        .select({
          id: guildInvitations.id,
          inviteeUid: guildInvitations.inviteeUid,
          note: guildInvitations.note,
          status: guildInvitations.status,
          createdAt: guildInvitations.createdAt,
          username: users.username,
          displayName: profiles.displayName,
          avatarUrl: profiles.avatarUrl,
        })
        .from(guildInvitations)
        .innerJoin(users, eq(guildInvitations.inviteeUid, users.uid))
        .innerJoin(profiles, eq(users.uid, profiles.userUid))
        .where(
          and(
            eq(guildInvitations.communityId, guild.id),
            eq(guildInvitations.status, 'pending')
          )
        )
        .orderBy(desc(guildInvitations.createdAt)),
      db
        .select({
          id: guildBans.id,
          userUid: guildBans.userUid,
          reason: guildBans.reason,
          createdAt: guildBans.createdAt,
          username: users.username,
          displayName: profiles.displayName,
          avatarUrl: profiles.avatarUrl,
        })
        .from(guildBans)
        .innerJoin(users, eq(guildBans.userUid, users.uid))
        .innerJoin(profiles, eq(users.uid, profiles.userUid))
        .where(eq(guildBans.communityId, guild.id))
        .orderBy(desc(guildBans.createdAt)),
    ]);
  }

  let chatRooms: any[] = [];
  let events: any[] = [];
  let voiceChannels: any[] = [];

  if (ctx.canViewPrivate) {
    const [roomsList, eventsList, linkedVoice, globalVoice] = await Promise.all([
      listCommunityChatRooms(guild.id, viewerUid),
      listCommunityEvents(guild.id, viewerUid),
      listStandaloneVoiceRooms({ communityId: guild.id }),
      listStandaloneVoiceRooms(),
    ]);
    chatRooms = roomsList;
    events = eventsList;
    voiceChannels = linkedVoice.length > 0 ? linkedVoice : globalVoice.slice(0, 4);
  }

  return {
    ...guild,
    isMember: Boolean(ctx.membership),
    memberRole: ctx.guildRole,
    isBanned: ctx.isBanned,
    canViewContent: ctx.canViewPrivate,
    permissions: {
      canModerate: ctx.canModerate,
      canManageRoles: ctx.canManageRoles,
      canEditSettings: ctx.canEditSettings,
      canManageOwnership: ctx.canManageOwnership,
    },
    hasPendingRequest: Boolean(pendingReqRows[0]),
    pendingInvite: pendingInvRows[0] || null,
    members,
    chatRooms,
    events,
    voiceChannels,
    joinRequests,
    outgoingInvites,
    bannedMembers,
  };
}

export async function handleGuildMembershipAction(
  communityId: number,
  userUid: string,
  payload: { action: 'join' | 'leave' | 'cancel_request'; note?: string }
) {
  const ctx = await getGuildActorContext(communityId, userUid);
  const { guild } = ctx;

  if (payload.action === 'cancel_request') {
    await db
      .delete(communityJoinRequests)
      .where(
        and(
          eq(communityJoinRequests.communityId, communityId),
          eq(communityJoinRequests.userUid, userUid),
          eq(communityJoinRequests.status, 'pending')
        )
      );
    return { status: 'cancelled_request', isMember: false };
  }

  if (payload.action === 'leave') {
    if (!ctx.membership) {
      return { status: 'left', isMember: false, memberCount: guild.memberCount };
    }
    if (ctx.guildRole === 'owner' || guild.ownerUid === userUid) {
      throw new HttpError(
        400,
        'Guild owners must transfer ownership to another member or archive/delete the guild before leaving.'
      );
    }
    await db
      .delete(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, communityId),
          eq(communityMemberships.userUid, userUid)
        )
      );
    const counts = await syncCommunityCounts(communityId);
    return { status: 'left', isMember: false, ...counts };
  }

  // JOIN OR REQUEST TO JOIN
  if (ctx.isBanned) {
    throw new HttpError(403, 'You are banned from joining this guild.');
  }

  if (ctx.membership) {
    const counts = await syncCommunityCounts(communityId);
    return { status: 'joined', isMember: true, memberRole: ctx.guildRole, ...counts };
  }

  // Check if user holds an active direct invitation — valid invites grant immediate entry!
  const [invite] = await db
    .select()
    .from(guildInvitations)
    .where(
      and(
        eq(guildInvitations.communityId, communityId),
        eq(guildInvitations.inviteeUid, userUid),
        eq(guildInvitations.status, 'pending')
      )
    )
    .limit(1);

  if (invite && (!invite.expiresAt || invite.expiresAt > new Date())) {
    await db
      .update(guildInvitations)
      .set({ status: 'accepted', respondedAt: new Date() })
      .where(eq(guildInvitations.id, invite.id));
    await db
      .insert(communityMemberships)
      .values({ communityId, userUid, role: 'member' })
      .onConflictDoNothing();
    await db
      .delete(communityJoinRequests)
      .where(
        and(
          eq(communityJoinRequests.communityId, communityId),
          eq(communityJoinRequests.userUid, userUid)
        )
      );
    const counts = await syncCommunityCounts(communityId);
    return { status: 'joined', isMember: true, memberRole: 'member', ...counts };
  }

  if (guild.joinPolicy === 'invite_only') {
    throw new HttpError(403, 'This guild is invite-only. You need a direct guild invitation to join.');
  }

  if (guild.joinPolicy === 'approval' || guild.privacyMode === 'private') {
    const note = String(payload.note || '').trim().slice(0, 300);
    await db
      .insert(communityJoinRequests)
      .values({
        communityId,
        userUid,
        note,
        status: 'pending',
      })
      .onConflictDoUpdate({
        target: [communityJoinRequests.communityId, communityJoinRequests.userUid],
        set: { note, status: 'pending', createdAt: new Date(), reviewedAt: null },
      });

    // Notify guild leadership
    const leaders = await db
      .select({ userUid: communityMemberships.userUid, role: communityMemberships.role })
      .from(communityMemberships)
      .where(eq(communityMemberships.communityId, communityId));
    const [requester] = await db
      .select({ displayName: profiles.displayName, username: users.username })
      .from(users)
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(eq(users.uid, userUid))
      .limit(1);

    for (const l of leaders) {
      if (['owner', 'admin', 'moderator'].includes(l.role)) {
        await createNotification({
          recipientUid: l.userUid,
          actorUid: userUid,
          type: 'guild_activity',
          title: `${requester?.displayName || '@' + requester?.username} requested to join ${guild.name}`,
          body: note || 'Review pending join request in Guild Command.',
          linkUrl: `/guilds/${guild.slug}`,
        });
      }
    }

    return {
      status: 'pending_approval',
      isMember: false,
      hasPendingRequest: true,
      memberCount: guild.memberCount,
    };
  }

  // Open public guild: immediate join
  await db
    .insert(communityMemberships)
    .values({ communityId, userUid, role: 'member' })
    .onConflictDoNothing();
  const counts = await syncCommunityCounts(communityId);
  return { status: 'joined', isMember: true, memberRole: 'member', ...counts };
}

export async function reviewJoinRequest(
  actorUid: string,
  communityId: number,
  requestId: number,
  decision: 'approve' | 'reject'
) {
  const ctx = await getGuildActorContext(communityId, actorUid);
  if (!ctx.canModerate) {
    throw new HttpError(403, 'Forbidden: Only guild moderators or admins can review join requests.');
  }

  const [reqRow] = await db
    .select()
    .from(communityJoinRequests)
    .where(
      and(
        eq(communityJoinRequests.id, requestId),
        eq(communityJoinRequests.communityId, communityId)
      )
    )
    .limit(1);
  if (!reqRow || reqRow.status !== 'pending') {
    throw new HttpError(404, 'Pending join request not found.');
  }

  const now = new Date();
  await db
    .update(communityJoinRequests)
    .set({
      status: decision === 'approve' ? 'approved' : 'rejected',
      reviewedByUid: actorUid,
      reviewedAt: now,
    })
    .where(eq(communityJoinRequests.id, requestId));

  if (decision === 'approve') {
    await db
      .insert(communityMemberships)
      .values({ communityId, userUid: reqRow.userUid, role: 'member' })
      .onConflictDoNothing();
    await syncCommunityCounts(communityId);

    await createNotification({
      recipientUid: reqRow.userUid,
      actorUid,
      type: 'guild_activity',
      title: `Welcome to ${ctx.guild.name}!`,
      body: 'Your guild join request has been approved.',
      linkUrl: `/guilds/${ctx.guild.slug}`,
    });
  } else {
    await createNotification({
      recipientUid: reqRow.userUid,
      actorUid,
      type: 'guild_activity',
      title: `Join request update for ${ctx.guild.name}`,
      body: 'Your request to join this guild was declined.',
      linkUrl: `/guilds`,
    });
  }

  await logModerationAction({
    communityId,
    actorUid,
    targetUid: reqRow.userUid,
    actionType: decision === 'approve' ? 'approve_join' : 'reject_join',
  });

  const counts = await syncCommunityCounts(communityId);
  return { status: decision === 'approve' ? 'approved' : 'rejected', ...counts };
}

export async function sendDirectGuildInvitation(
  inviterUid: string,
  communityId: number,
  payload: { inviteeUid: string; note?: string }
) {
  const ctx = await getGuildActorContext(communityId, inviterUid);
  if (!ctx.canModerate) {
    throw new HttpError(403, 'Forbidden: Only guild moderators, admins, or owners can invite hunters.');
  }

  const inviteeUid = String(payload.inviteeUid || '').trim();
  if (!inviteeUid || inviteeUid === inviterUid) {
    throw new HttpError(400, 'Select a valid KAGE hunter to invite.');
  }

  const block = await hasBlockBetween(inviterUid, inviteeUid);
  if (block.anyBlock) {
    throw new HttpError(403, 'Cannot invite this user due to block settings.');
  }

  const [ban] = await db
    .select()
    .from(guildBans)
    .where(and(eq(guildBans.communityId, communityId), eq(guildBans.userUid, inviteeUid)))
    .limit(1);
  if (ban && (!ban.expiresAt || ban.expiresAt > new Date())) {
    throw new HttpError(400, 'This user is currently banned from the guild. Unban them first.');
  }

  const [alreadyMember] = await db
    .select({ id: communityMemberships.id })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.userUid, inviteeUid)
      )
    )
    .limit(1);
  if (alreadyMember) {
    throw new HttpError(400, 'That hunter is already a member of this guild.');
  }

  const [existingPending] = await db
    .select({ id: guildInvitations.id })
    .from(guildInvitations)
    .where(
      and(
        eq(guildInvitations.communityId, communityId),
        eq(guildInvitations.inviteeUid, inviteeUid),
        eq(guildInvitations.status, 'pending')
      )
    )
    .limit(1);
  if (existingPending) {
    throw new HttpError(409, 'A pending invitation has already been sent to this hunter.');
  }

  const expiresAt = new Date(Date.now() + 7 * 24 * 3600 * 1000);
  const note = String(payload.note || '').trim().slice(0, 240);

  const [created] = await db
    .insert(guildInvitations)
    .values({
      communityId,
      inviterUid,
      inviteeUid,
      note,
      status: 'pending',
      expiresAt,
    })
    .returning();

  const [inviter] = await db
    .select({ displayName: profiles.displayName })
    .from(profiles)
    .where(eq(profiles.userUid, inviterUid))
    .limit(1);

  await createNotification({
    recipientUid: inviteeUid,
    actorUid: inviterUid,
    type: 'guild_activity',
    title: `${inviter?.displayName || 'A guild leader'} invited you to join ${ctx.guild.name}`,
    body: note || 'Open the guild page to accept or decline your invitation.',
    linkUrl: `/guilds/${ctx.guild.slug}`,
  });

  return created;
}

export async function respondToDirectGuildInvitation(
  actorUid: string,
  invitationId: number,
  action: 'accept' | 'decline' | 'revoke'
) {
  const [inv] = await db
    .select()
    .from(guildInvitations)
    .where(eq(guildInvitations.id, invitationId))
    .limit(1);
  if (!inv) throw new HttpError(404, 'Guild invitation not found.');

  if (inv.status !== 'pending') {
    throw new HttpError(400, `This invitation is already ${inv.status}.`);
  }

  if (action === 'revoke') {
    const ctx = await getGuildActorContext(inv.communityId, actorUid);
    if (!ctx.canModerate && inv.inviterUid !== actorUid) {
      throw new HttpError(403, 'Forbidden: Only guild moderators can revoke invitations.');
    }
    await db
      .update(guildInvitations)
      .set({ status: 'revoked', respondedAt: new Date() })
      .where(eq(guildInvitations.id, invitationId));
    return { status: 'revoked' };
  }

  // Strictly recipient-only for accept/decline!
  if (inv.inviteeUid !== actorUid) {
    throw new HttpError(403, 'Forbidden: Only the invited hunter can accept or decline this invite.');
  }

  if (inv.expiresAt && inv.expiresAt <= new Date()) {
    await db
      .update(guildInvitations)
      .set({ status: 'expired', respondedAt: new Date() })
      .where(eq(guildInvitations.id, invitationId));
    throw new HttpError(400, 'This guild invitation has expired.');
  }

  if (action === 'decline') {
    await db
      .update(guildInvitations)
      .set({ status: 'declined', respondedAt: new Date() })
      .where(eq(guildInvitations.id, invitationId));
    return { status: 'declined', isMember: false };
  }

  // Check ban before accepting
  const [ban] = await db
    .select()
    .from(guildBans)
    .where(and(eq(guildBans.communityId, inv.communityId), eq(guildBans.userUid, actorUid)))
    .limit(1);
  if (ban && (!ban.expiresAt || ban.expiresAt > new Date())) {
    throw new HttpError(403, 'You are banned from this guild.');
  }

  await db
    .update(guildInvitations)
    .set({ status: 'accepted', respondedAt: new Date() })
    .where(eq(guildInvitations.id, invitationId));

  await db
    .insert(communityMemberships)
    .values({
      communityId: inv.communityId,
      userUid: actorUid,
      role: 'member',
    })
    .onConflictDoNothing();

  await db
    .delete(communityJoinRequests)
    .where(
      and(
        eq(communityJoinRequests.communityId, inv.communityId),
        eq(communityJoinRequests.userUid, actorUid)
      )
    );

  const counts = await syncCommunityCounts(inv.communityId);
  return { status: 'accepted', isMember: true, memberRole: 'member', ...counts };
}

export async function listPendingGuildInvitationsForUser(userUid: string) {
  return await db
    .select({
      id: guildInvitations.id,
      communityId: guildInvitations.communityId,
      note: guildInvitations.note,
      createdAt: guildInvitations.createdAt,
      expiresAt: guildInvitations.expiresAt,
      guildName: communities.name,
      guildSlug: communities.slug,
      guildArtworkUrl: communities.artworkUrl,
      inviterUsername: users.username,
      inviterDisplayName: profiles.displayName,
    })
    .from(guildInvitations)
    .innerJoin(communities, eq(guildInvitations.communityId, communities.id))
    .innerJoin(users, eq(guildInvitations.inviterUid, users.uid))
    .innerJoin(profiles, eq(users.uid, profiles.userUid))
    .where(
      and(eq(guildInvitations.inviteeUid, userUid), eq(guildInvitations.status, 'pending'))
    )
    .orderBy(desc(guildInvitations.createdAt));
}

export async function manageGuildMemberAction(
  actorUid: string,
  communityId: number,
  payload: {
    targetUid: string;
    action: 'set_role' | 'mute' | 'unmute' | 'kick' | 'ban' | 'unban';
    newRole?: 'admin' | 'moderator' | 'member';
    reason?: string;
    durationHours?: number;
  }
) {
  const ctx = await getGuildActorContext(communityId, actorUid);
  if (!ctx.canModerate) {
    throw new HttpError(403, 'Forbidden: Insufficient guild permissions.');
  }

  const targetUid = String(payload.targetUid || '').trim();
  if (!targetUid) throw new HttpError(400, 'Target member UID is required.');
  if (targetUid === actorUid) {
    throw new HttpError(400, 'You cannot run member moderation actions on yourself.');
  }

  if (payload.action === 'unban') {
    await db
      .delete(guildBans)
      .where(and(eq(guildBans.communityId, communityId), eq(guildBans.userUid, targetUid)));
    await logModerationAction({
      communityId,
      actorUid,
      targetUid,
      actionType: 'unban',
      reason: payload.reason,
    });
    return { unbanned: true };
  }

  const [targetMem] = await db
    .select()
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.userUid, targetUid)
      )
    )
    .limit(1);

  const actorRank = ctx.isPlatformAdmin ? 5 : ROLE_RANK[ctx.guildRole || ''] || 0;
  const targetRank = targetMem ? ROLE_RANK[targetMem.role] || 1 : 0;

  if (targetMem?.role === 'owner' || ctx.guild.ownerUid === targetUid) {
    throw new HttpError(403, 'Forbidden: The guild owner cannot be demoted, kicked, or banned.');
  }
  if (targetRank >= actorRank) {
    throw new HttpError(
      403,
      'Forbidden: You cannot moderate a guild member of equal or higher rank.'
    );
  }

  if (payload.action === 'set_role') {
    if (!targetMem) throw new HttpError(404, 'Target user is not a member of this guild.');
    const desired = payload.newRole;
    if (!desired || !['admin', 'moderator', 'member'].includes(desired)) {
      throw new HttpError(400, 'Specify a valid role (admin, moderator, or member).');
    }
    if (desired === 'admin' && actorRank < 4) {
      throw new HttpError(403, 'Only the guild owner can promote or demote guild admins.');
    }
    if (actorRank < 3) {
      throw new HttpError(403, 'Only guild owners or admins can change member roles.');
    }

    await db
      .update(communityMemberships)
      .set({ role: desired })
      .where(eq(communityMemberships.id, targetMem.id));

    await logModerationAction({
      communityId,
      actorUid,
      targetUid,
      actionType:
        desired === 'admin'
          ? 'promote_admin'
          : desired === 'moderator'
            ? 'promote_mod'
            : 'demote_member',
      reason: payload.reason,
    });

    await createNotification({
      recipientUid: targetUid,
      actorUid,
      type: 'guild_activity',
      title: `Your role in ${ctx.guild.name} is now ${desired.toUpperCase()}`,
      body: payload.reason || '',
      linkUrl: `/guilds/${ctx.guild.slug}`,
    });

    return { uid: targetUid, role: desired };
  }

  if (payload.action === 'mute' || payload.action === 'unmute') {
    if (!targetMem) throw new HttpError(404, 'Target user is not a member of this guild.');
    const muted = payload.action === 'mute';
    const mutedUntil =
      muted && payload.durationHours
        ? new Date(Date.now() + Math.max(1, payload.durationHours) * 3600 * 1000)
        : null;

    await db
      .update(communityMemberships)
      .set({ isMuted: muted, mutedUntil })
      .where(eq(communityMemberships.id, targetMem.id));

    await logModerationAction({
      communityId,
      actorUid,
      targetUid,
      actionType: muted ? 'mute' : 'unmute',
      reason: payload.reason,
      expiresAt: mutedUntil,
    });
    return { uid: targetUid, isMuted: muted, mutedUntil };
  }

  if (payload.action === 'kick') {
    await db
      .delete(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, communityId),
          eq(communityMemberships.userUid, targetUid)
        )
      );
    const counts = await syncCommunityCounts(communityId);
    await logModerationAction({
      communityId,
      actorUid,
      targetUid,
      actionType: 'kick',
      reason: payload.reason,
    });
    return { kicked: true, ...counts };
  }

  if (payload.action === 'ban') {
    const expiresAt = payload.durationHours
      ? new Date(Date.now() + Math.max(1, payload.durationHours) * 3600 * 1000)
      : null;

    await db
      .insert(guildBans)
      .values({
        communityId,
        userUid: targetUid,
        bannedByUid: actorUid,
        reason: (payload.reason || '').slice(0, 400),
        expiresAt,
      })
      .onConflictDoUpdate({
        target: [guildBans.communityId, guildBans.userUid],
        set: {
          bannedByUid: actorUid,
          reason: (payload.reason || '').slice(0, 400),
          expiresAt,
          createdAt: new Date(),
        },
      });

    await db
      .delete(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, communityId),
          eq(communityMemberships.userUid, targetUid)
        )
      );

    await db
      .delete(communityJoinRequests)
      .where(
        and(
          eq(communityJoinRequests.communityId, communityId),
          eq(communityJoinRequests.userUid, targetUid)
        )
      );

    const counts = await syncCommunityCounts(communityId);
    await logModerationAction({
      communityId,
      actorUid,
      targetUid,
      actionType: 'ban',
      reason: payload.reason,
      expiresAt,
    });
    return { banned: true, ...counts };
  }

  throw new HttpError(400, 'Unsupported guild moderation action.');
}

export async function transferGuildOwnership(
  actorUid: string,
  communityId: number,
  newOwnerUid: string
) {
  const ctx = await getGuildActorContext(communityId, actorUid);
  if (!ctx.canManageOwnership) {
    throw new HttpError(403, 'Forbidden: Only the current guild owner can transfer ownership.');
  }

  if (!newOwnerUid || newOwnerUid === actorUid) {
    throw new HttpError(400, 'Select another existing guild member to receive ownership.');
  }

  const [targetMem] = await db
    .select()
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.userUid, newOwnerUid)
      )
    )
    .limit(1);

  if (!targetMem) {
    throw new HttpError(400, 'The new owner must already be a member of this guild.');
  }

  // Demote previous owner to admin, promote target to owner, update communities.ownerUid
  await db
    .update(communityMemberships)
    .set({ role: 'admin' })
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.role, 'owner')
      )
    );

  await db
    .update(communityMemberships)
    .set({ role: 'owner' })
    .where(eq(communityMemberships.id, targetMem.id));

  await db
    .update(communities)
    .set({ ownerUid: newOwnerUid, updatedAt: new Date() })
    .where(eq(communities.id, communityId));

  await logModerationAction({
    communityId,
    actorUid,
    targetUid: newOwnerUid,
    actionType: 'transfer_ownership',
  });

  await createNotification({
    recipientUid: newOwnerUid,
    actorUid,
    type: 'guild_activity',
    title: `You are now the Owner of ${ctx.guild.name}`,
    body: 'Guild leadership has been transferred to your account.',
    linkUrl: `/guilds/${ctx.guild.slug}`,
  });

  return { transferred: true, newOwnerUid };
}

export async function updateGuildSettings(
  actorUid: string,
  communityId: number,
  payload: {
    name?: string;
    tagline?: string;
    description?: string;
    category?: string;
    rules?: string;
    privacyMode?: 'public' | 'private';
    joinPolicy?: 'open' | 'approval' | 'invite_only';
    artworkUrl?: string;
    bannerUrl?: string;
    chatBannerUrl?: string;
    iconDataUrl?: string;
    bannerDataUrl?: string;
    genreTags?: string[];
  }
) {
  const ctx = await getGuildActorContext(communityId, actorUid);
  if (!ctx.canEditSettings) {
    throw new HttpError(403, 'Forbidden: Only guild owners or admins can update guild settings.');
  }

  const updates: Record<string, any> = { updatedAt: new Date() };

  if (typeof payload.name === 'string' && payload.name.trim()) {
    const cleanName = payload.name.trim().slice(0, 60);
    if (cleanName.length < 3) {
      throw new HttpError(400, 'Guild name must be at least 3 characters.');
    }
    const norm = cleanName.toLowerCase();
    const [dup] = await db
      .select({ id: communities.id })
      .from(communities)
      .where(
        and(
          or(
            eq(communities.nameNormalized, norm),
            sql`lower(trim(${communities.name})) = ${norm}`
          ),
          sql`${communities.id} <> ${communityId}`
        )
      )
      .limit(1);
    if (dup) {
      throw new HttpError(409, `Another guild already uses the name "${cleanName}".`);
    }
    updates.name = cleanName;
    updates.nameNormalized = norm;
  }

  if (typeof payload.tagline === 'string') {
    updates.tagline = payload.tagline.trim().slice(0, 120);
  }
  if (typeof payload.chatBannerUrl === 'string' && isApprovedCatalogueImageUrl(payload.chatBannerUrl)) {
    updates.chatBannerUrl = payload.chatBannerUrl;
  }

  if (typeof payload.description === 'string') {
    const cleanDesc = payload.description.trim().slice(0, 600);
    if (cleanDesc.length < 10) {
      throw new HttpError(400, 'Guild description must be at least 10 characters.');
    }
    updates.description = cleanDesc;
  }

  if (typeof payload.category === 'string' && payload.category.trim()) {
    updates.category = payload.category.trim().slice(0, 60);
  }
  if (typeof payload.rules === 'string') {
    updates.rules = payload.rules.trim().slice(0, 1500);
  }
  if (payload.privacyMode === 'public' || payload.privacyMode === 'private') {
    updates.privacyMode = payload.privacyMode;
  }
  if (
    payload.joinPolicy === 'open' ||
    payload.joinPolicy === 'approval' ||
    payload.joinPolicy === 'invite_only'
  ) {
    updates.joinPolicy = payload.joinPolicy;
  }
  if (
    (updates.privacyMode || ctx.guild.privacyMode) === 'private' &&
    (updates.joinPolicy || ctx.guild.joinPolicy) === 'open'
  ) {
    updates.joinPolicy = 'approval';
  }

  if (payload.iconDataUrl) {
    const icon = await uploadValidatedMediaAsset(actorUid, {
      dataUrl: payload.iconDataUrl,
      mediaType: 'image',
      purpose: 'guild_media',
      visibility: 'public',
    });
    updates.artworkUrl = icon.url;
  } else if (payload.artworkUrl && isApprovedCatalogueImageUrl(payload.artworkUrl)) {
    updates.artworkUrl = payload.artworkUrl;
  }

  if (payload.bannerDataUrl) {
    const banner = await uploadValidatedMediaAsset(actorUid, {
      dataUrl: payload.bannerDataUrl,
      mediaType: 'image',
      purpose: 'guild_media',
      visibility: 'public',
    });
    updates.bannerUrl = banner.url;
  } else if (payload.bannerUrl && isApprovedCatalogueImageUrl(payload.bannerUrl)) {
    updates.bannerUrl = payload.bannerUrl;
  }

  if (Array.isArray(payload.genreTags)) {
    updates.genreTags = payload.genreTags.slice(0, 6);
  }

  const [updated] = await db
    .update(communities)
    .set(updates)
    .where(eq(communities.id, communityId))
    .returning();

  await logModerationAction({
    communityId,
    actorUid,
    actionType: 'edit_settings',
  });

  return updated;
}

export async function archiveOrDeleteGuildByOwner(
  actorUid: string,
  communityId: number,
  action: 'archive' | 'unarchive' | 'delete'
) {
  const ctx = await getGuildActorContext(communityId, actorUid);
  if (!ctx.canManageOwnership) {
    throw new HttpError(403, 'Forbidden: Only the guild owner can archive or delete this guild.');
  }

  if (action === 'delete') {
    await db.delete(communities).where(eq(communities.id, communityId));
    return { deleted: true };
  }

  const isArchived = action === 'archive';
  await db
    .update(communities)
    .set({ isArchived, updatedAt: new Date() })
    .where(eq(communities.id, communityId));
  return { isArchived };
}

export async function listGuildAuditLogs(actorUid: string, communityId: number) {
  const ctx = await getGuildActorContext(communityId, actorUid);
  if (!ctx.canModerate) {
    throw new HttpError(403, 'Forbidden: Moderation logs are visible only to guild moderators.');
  }

  return await db
    .select({
      id: communityModerationLogs.id,
      actionType: communityModerationLogs.actionType,
      reason: communityModerationLogs.reason,
      createdAt: communityModerationLogs.createdAt,
      actorUid: communityModerationLogs.actorUid,
      targetUid: communityModerationLogs.targetUid,
      actorUsername: users.username,
      actorDisplayName: profiles.displayName,
    })
    .from(communityModerationLogs)
    .leftJoin(users, eq(communityModerationLogs.actorUid, users.uid))
    .leftJoin(profiles, eq(users.uid, profiles.userUid))
    .where(eq(communityModerationLogs.communityId, communityId))
    .orderBy(desc(communityModerationLogs.createdAt))
    .limit(60);
}
