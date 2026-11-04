import crypto from 'crypto';
import { and, desc, eq, gt, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  animeReviews,
  blockedUsers,
  comments,
  discussions,
  mediaAssets,
  mutedUsers,
  notifications,
  passwordResetTokens,
  profileAlertPrefs,
  profiles,
  profileVisits,
  reactions,
  restrictedUsers,
  savedPosts,
  sessions,
  userFollows,
  users,
  userSettings,
  videoViewEvents,
} from './schema.ts';
import { validateAndComputeShadowIdentity } from '../lib/shadowIdentity.ts';
import { isApprovedCatalogueImageUrl } from '../server/characterCatalogue.ts';
import {
  validateAvatarUploadPayload,
  validatePostImagePayload,
  validatePostVideoPayload,
} from '../server/mediaValidator.ts';
import { hashPasswordScrypt } from '../lib/serverToken.ts';

// Bounded in-memory cache of decoded media buffers for fast HTTP 206 Range streaming
const mediaBufferCache = new Map<
  number,
  { mimeType: string; sha256: string; buffer: Buffer; cachedAt: number }
>();
const MAX_MEDIA_CACHE_ENTRIES = 40;

function putMediaCache(id: number, mimeType: string, sha256: string, buffer: Buffer) {
  if (buffer.length > 16 * 1024 * 1024) return;
  if (mediaBufferCache.size >= MAX_MEDIA_CACHE_ENTRIES) {
    const oldestKey = mediaBufferCache.keys().next().value;
    if (oldestKey !== undefined) mediaBufferCache.delete(oldestKey);
  }
  mediaBufferCache.set(id, { mimeType, sha256, buffer, cachedAt: Date.now() });
}

export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export function normalizeKageUsername(raw: string): string {
  return raw.trim().replace(/^@+/, '').toLowerCase();
}

export async function hasBlockBetween(uidA?: string | null, uidB?: string | null): Promise<{
  aBlockedB: boolean;
  bBlockedA: boolean;
  anyBlock: boolean;
}> {
  if (!uidA || !uidB || uidA === uidB) {
    return { aBlockedB: false, bBlockedA: false, anyBlock: false };
  }
  const rows = await db
    .select()
    .from(blockedUsers)
    .where(
      or(
        and(eq(blockedUsers.blockerUid, uidA), eq(blockedUsers.blockedUid, uidB)),
        and(eq(blockedUsers.blockerUid, uidB), eq(blockedUsers.blockedUid, uidA))
      )
    );
  const aBlockedB = rows.some((r) => r.blockerUid === uidA && r.blockedUid === uidB);
  const bBlockedA = rows.some((r) => r.blockerUid === uidB && r.blockedUid === uidA);
  return { aBlockedB, bBlockedA, anyBlock: aBlockedB || bBlockedA };
}

export function sanitizePostForViewer(
  post: any,
  viewerUid?: string,
  viewAsPublic = false
) {
  const isEffectiveOwner = Boolean(viewerUid && post.authorUid === viewerUid && !viewAsPublic);
  const isVideo = post.mediaType === 'video';
  const showViews = !isVideo || post.showViewCountPublicly || isEffectiveOwner;

  return {
    ...post,
    qualifiedViewCount: isVideo ? (showViews ? post.qualifiedViewCount || 0 : null) : null,
    playCount: isEffectiveOwner ? post.playCount || 0 : undefined,
    totalWatchSeconds: isEffectiveOwner ? post.totalWatchSeconds || 0 : undefined,
  };
}

// ============================================================================
// PERSISTENT MEDIA STORAGE & AVATAR MANAGEMENT (PART 2)
// ============================================================================

export async function saveMediaAssetRecord(params: {
  ownerUid: string;
  purpose: 'avatar' | 'post_image' | 'post_video' | 'post_poster';
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationSec?: number | null;
  sha256: string;
  moderationStatus: string;
  cleanBase64: string;
}) {
  const [inserted] = await db
    .insert(mediaAssets)
    .values({
      ownerUid: params.ownerUid,
      purpose: params.purpose,
      mimeType: params.mimeType,
      byteSize: params.byteSize,
      width: params.width,
      height: params.height,
      durationSec: params.durationSec ?? null,
      sha256: params.sha256,
      moderationStatus: params.moderationStatus,
      dataBase64: params.cleanBase64,
    })
    .returning({
      id: mediaAssets.id,
      mimeType: mediaAssets.mimeType,
      byteSize: mediaAssets.byteSize,
      width: mediaAssets.width,
      height: mediaAssets.height,
      moderationStatus: mediaAssets.moderationStatus,
    });

  return {
    ...inserted,
    url: `/api/media/${inserted.id}`,
  };
}

export async function getMediaBinaryById(assetId: number) {
  const cached = mediaBufferCache.get(assetId);
  if (cached) return cached;

  const [row] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);

  if (!row) return null;

  const buffer = Buffer.from(row.dataBase64, 'base64');
  putMediaCache(assetId, row.mimeType, row.sha256, buffer);
  return {
    mimeType: row.mimeType,
    sha256: row.sha256,
    buffer,
  };
}

export async function deleteMediaAssetById(ownerUid: string, assetId?: number | null) {
  if (!assetId) return;
  mediaBufferCache.delete(assetId);
  await db
    .delete(mediaAssets)
    .where(and(eq(mediaAssets.id, assetId), eq(mediaAssets.ownerUid, ownerUid)));
}

export async function setCatalogueAnimeAvatar(
  uid: string,
  payload: {
    imageUrl: string;
    characterName?: string;
    animeTitle?: string;
    malId?: number | null;
  }
) {
  const imageUrl = String(payload.imageUrl || '').trim();
  if (!isApprovedCatalogueImageUrl(imageUrl)) {
    throw new HttpError(
      400,
      'Selected image is not from an approved KAGE anime character catalogue source.'
    );
  }

  const [existing] = await db
    .select({ avatarAssetId: profiles.avatarAssetId, favouriteCharacter: profiles.favouriteCharacter })
    .from(profiles)
    .where(eq(profiles.userUid, uid))
    .limit(1);

  if (existing?.avatarAssetId) {
    await deleteMediaAssetById(uid, existing.avatarAssetId);
  }

  const updates: Record<string, any> = {
    avatarUrl: imageUrl,
    avatarSource: 'catalogue',
    avatarAssetId: null,
    updatedAt: new Date(),
  };

  if (payload.characterName?.trim()) {
    updates.favouriteCharacter = payload.characterName.trim().slice(0, 80);
  }
  if (payload.animeTitle?.trim()) {
    updates.favouriteCharacterAnime = payload.animeTitle.trim().slice(0, 120);
  }
  if (payload.malId !== undefined) {
    updates.favouriteCharacterMalId = payload.malId ? Number(payload.malId) : null;
  }

  await db.update(profiles).set(updates).where(eq(profiles.userUid, uid));
  return { avatarUrl: imageUrl, avatarSource: 'catalogue' };
}

export async function uploadValidatedCustomAvatar(uid: string, dataUrl: string) {
  // Validate BEFORE mutating anything so rejected uploads leave previous valid avatar untouched
  let validated;
  try {
    validated = await validateAvatarUploadPayload(dataUrl);
  } catch (err: any) {
    throw new HttpError(400, err.message || 'Avatar upload validation failed.');
  }

  const [existing] = await db
    .select({ avatarAssetId: profiles.avatarAssetId })
    .from(profiles)
    .where(eq(profiles.userUid, uid))
    .limit(1);

  const saved = await saveMediaAssetRecord({
    ownerUid: uid,
    purpose: 'avatar',
    mimeType: validated.mimeType,
    byteSize: validated.byteSize,
    width: validated.width,
    height: validated.height,
    sha256: validated.sha256,
    moderationStatus: validated.moderationStatus,
    cleanBase64: validated.cleanBase64,
  });

  if (existing?.avatarAssetId && existing.avatarAssetId !== saved.id) {
    await deleteMediaAssetById(uid, existing.avatarAssetId);
  }

  await db
    .update(profiles)
    .set({
      avatarUrl: saved.url,
      avatarSource: 'custom',
      avatarAssetId: saved.id,
      updatedAt: new Date(),
    })
    .where(eq(profiles.userUid, uid));

  return {
    avatarUrl: saved.url,
    avatarSource: 'custom',
    moderationStatus: validated.moderationStatus,
    moderationNote: validated.moderationNote,
    dimensions: { width: validated.width, height: validated.height },
  };
}

export async function resetAvatarToDefault(uid: string) {
  const [existing] = await db
    .select({ avatarAssetId: profiles.avatarAssetId })
    .from(profiles)
    .where(eq(profiles.userUid, uid))
    .limit(1);

  if (existing?.avatarAssetId) {
    await deleteMediaAssetById(uid, existing.avatarAssetId);
  }

  const defaultUrl = '/assets/zenitsu-avatar.png';
  await db
    .update(profiles)
    .set({
      avatarUrl: defaultUrl,
      avatarSource: 'default',
      avatarAssetId: null,
      updatedAt: new Date(),
    })
    .where(eq(profiles.userUid, uid));

  return { avatarUrl: defaultUrl, avatarSource: 'default' };
}

// ============================================================================
// YOUR SHADOW IDENTITY (PART 3 & PART 22)
// ============================================================================

export async function saveShadowIdentityForUser(
  uid: string,
  payload: {
    qualities?: unknown;
    shadowBadgePublic?: boolean;
    favouriteCharacter?: string;
    favouriteCharacterAnime?: string;
    favouriteCharacterMalId?: number | null;
  }
) {
  const updates: Record<string, any> = { updatedAt: new Date() };

  if (payload.qualities !== undefined) {
    let computed;
    try {
      computed = validateAndComputeShadowIdentity(payload.qualities);
    } catch (err: any) {
      throw new HttpError(400, err.message || 'Invalid Shadow Identity selection.');
    }
    updates.shadowQualities = computed.qualities;
    updates.shadowLabel = computed.label;
  }

  if (typeof payload.shadowBadgePublic === 'boolean') {
    updates.shadowBadgePublic = payload.shadowBadgePublic;
  }

  if (typeof payload.favouriteCharacter === 'string') {
    updates.favouriteCharacter = payload.favouriteCharacter.trim().slice(0, 80);
  }
  if (typeof payload.favouriteCharacterAnime === 'string') {
    updates.favouriteCharacterAnime = payload.favouriteCharacterAnime.trim().slice(0, 120);
  }
  if (payload.favouriteCharacterMalId !== undefined) {
    updates.favouriteCharacterMalId = payload.favouriteCharacterMalId
      ? Number(payload.favouriteCharacterMalId)
      : null;
  }

  const [updated] = await db
    .update(profiles)
    .set(updates)
    .where(eq(profiles.userUid, uid))
    .returning();

  return updated;
}

// ============================================================================
// PROFILE VISITORS (PART 4 & PART 23)
// ============================================================================

const VISIT_DEDUP_MS = 15 * 60 * 1000; // 15-minute deduplication window

export async function recordTrustedProfileVisit(
  visitorUid: string | undefined,
  targetIdentifier: string
) {
  if (!visitorUid) {
    return { recorded: false, reason: 'anonymous_not_recorded' };
  }

  const clean = normalizeKageUsername(targetIdentifier);
  const [owner] = await db
    .select({ uid: users.uid })
    .from(users)
    .where(or(eq(users.username, clean), eq(users.uid, targetIdentifier)))
    .limit(1);

  if (!owner) {
    throw new HttpError(404, 'Profile not found.');
  }

  if (owner.uid === visitorUid) {
    return { recorded: false, reason: 'self_visit_ignored' };
  }

  const blockState = await hasBlockBetween(visitorUid, owner.uid);
  if (blockState.anyBlock) {
    return { recorded: false, reason: 'blocked_relationship' };
  }

  // Respect both visitor's and profile owner's "Profile Visit History" privacy setting
  const settingsRows = await db
    .select({
      userUid: userSettings.userUid,
      profileVisitHistory: userSettings.profileVisitHistory,
    })
    .from(userSettings)
    .where(inArray(userSettings.userUid, [visitorUid, owner.uid]));

  const visitorHist =
    settingsRows.find((s) => s.userUid === visitorUid)?.profileVisitHistory || 'record';
  const ownerHist =
    settingsRows.find((s) => s.userUid === owner.uid)?.profileVisitHistory || 'record';

  if (visitorHist === 'pause' || ownerHist === 'pause') {
    return { recorded: false, reason: 'visit_history_paused' };
  }

  const dedupCutoff = new Date(Date.now() - VISIT_DEDUP_MS);
  const [recent] = await db
    .select({ id: profileVisits.id })
    .from(profileVisits)
    .where(
      and(
        eq(profileVisits.profileOwnerUid, owner.uid),
        eq(profileVisits.visitorUid, visitorUid),
        gt(profileVisits.visitedAt, dedupCutoff)
      )
    )
    .limit(1);

  if (recent) {
    return { recorded: false, reason: 'deduplicated_recent_visit' };
  }

  await db.insert(profileVisits).values({
    profileOwnerUid: owner.uid,
    visitorUid,
  });

  return { recorded: true };
}

export async function listOwnerProfileVisitors(
  ownerUid: string,
  params: { limit?: number; offset?: number }
) {
  const limit = Math.max(1, Math.min(50, params.limit || 20));
  const offset = Math.max(0, params.offset || 0);

  const [ownerSetting] = await db
    .select({ profileVisitHistory: userSettings.profileVisitHistory })
    .from(userSettings)
    .where(eq(userSettings.userUid, ownerUid))
    .limit(1);

  const blocked = await db
    .select({
      blockerUid: blockedUsers.blockerUid,
      blockedUid: blockedUsers.blockedUid,
    })
    .from(blockedUsers)
    .where(
      or(eq(blockedUsers.blockerUid, ownerUid), eq(blockedUsers.blockedUid, ownerUid))
    );
  const excludedUids = Array.from(
    new Set(
      blocked.map((b) => (b.blockerUid === ownerUid ? b.blockedUid : b.blockerUid))
    )
  );

  const whereCond = excludedUids.length
    ? and(
        eq(profileVisits.profileOwnerUid, ownerUid),
        sql`${profileVisits.visitorUid} NOT IN (${sql.join(
          excludedUids.map((id) => sql`${id}`),
          sql`, `
        )})`
      )
    : eq(profileVisits.profileOwnerUid, ownerUid);

  const [countRes, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(profileVisits).where(whereCond),
    db
      .select({
        visitId: profileVisits.id,
        visitedAt: profileVisits.visitedAt,
        uid: users.uid,
        username: users.username,
        role: users.role,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
        shadowLabel: profiles.shadowLabel,
        shadowQualities: profiles.shadowQualities,
        shadowBadgePublic: profiles.shadowBadgePublic,
      })
      .from(profileVisits)
      .innerJoin(users, eq(profileVisits.visitorUid, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(whereCond)
      .orderBy(desc(profileVisits.visitedAt))
      .limit(limit)
      .offset(offset),
  ]);

  const total = countRes[0]?.count || 0;

  return {
    historyStatus: ownerSetting?.profileVisitHistory || 'record',
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    visitors: rows.map((r) => ({
      visitId: r.visitId,
      visitedAt: r.visitedAt,
      uid: r.uid,
      username: r.username,
      role: r.role,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      shadowLabel: r.shadowBadgePublic ? r.shadowLabel : '',
      shadowQualities: r.shadowBadgePublic ? r.shadowQualities : [],
    })),
  };
}

// ============================================================================
// FOLLOWERS, FOLLOWING, MUTE, RESTRICT & PROFILE ALERT PREFS (PARTS 5, 7, 14)
// ============================================================================

export async function listProfileConnections(params: {
  targetIdentifier: string;
  direction: 'followers' | 'following';
  viewerUid?: string;
  q?: string;
  limit?: number;
  offset?: number;
}) {
  const clean = normalizeKageUsername(params.targetIdentifier);
  const [targetUser] = await db
    .select()
    .from(users)
    .where(or(eq(users.username, clean), eq(users.uid, params.targetIdentifier)))
    .limit(1);

  if (!targetUser) throw new HttpError(404, 'Profile not found.');

  const blockState = await hasBlockBetween(params.viewerUid, targetUser.uid);
  if (blockState.anyBlock) {
    throw new HttpError(403, 'This profile is unavailable.');
  }

  const [targetProfile] = await db
    .select({ isPrivate: profiles.isPrivate })
    .from(profiles)
    .where(eq(profiles.userUid, targetUser.uid))
    .limit(1);

  const isOwner = params.viewerUid === targetUser.uid;
  let viewerFollowsTarget = false;
  if (params.viewerUid && !isOwner) {
    const [f] = await db
      .select({ id: userFollows.id })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followerUid, params.viewerUid),
          eq(userFollows.followingUid, targetUser.uid)
        )
      )
      .limit(1);
    viewerFollowsTarget = Boolean(f);
  }

  if (targetProfile?.isPrivate && !isOwner && !viewerFollowsTarget) {
    throw new HttpError(403, 'Follow this private profile to view their connections.');
  }

  const limit = Math.max(1, Math.min(50, params.limit || 20));
  const offset = Math.max(0, params.offset || 0);
  const q = (params.q || '').trim();

  const joinCol =
    params.direction === 'followers' ? userFollows.followerUid : userFollows.followingUid;
  const filterCol =
    params.direction === 'followers' ? userFollows.followingUid : userFollows.followerUid;

  const conds = [eq(filterCol, targetUser.uid)];
  if (q) {
    const pat = `%${q}%`;
    conds.push(or(ilike(users.username, pat), ilike(profiles.displayName, pat))!);
  }

  const [countRes, rows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(userFollows)
      .innerJoin(users, eq(joinCol, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(and(...conds)),
    db
      .select({
        uid: users.uid,
        username: users.username,
        role: users.role,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
        bio: profiles.bio,
        shadowLabel: profiles.shadowLabel,
        shadowBadgePublic: profiles.shadowBadgePublic,
        followedAt: userFollows.createdAt,
      })
      .from(userFollows)
      .innerJoin(users, eq(joinCol, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(and(...conds))
      .orderBy(desc(userFollows.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  let viewerFollowingSet = new Set<string>();
  if (params.viewerUid && rows.length > 0) {
    const fRows = await db
      .select({ followingUid: userFollows.followingUid })
      .from(userFollows)
      .where(
        and(
          eq(userFollows.followerUid, params.viewerUid),
          inArray(
            userFollows.followingUid,
            rows.map((r) => r.uid)
          )
        )
      );
    viewerFollowingSet = new Set(fRows.map((f) => f.followingUid));
  }

  const total = countRes[0]?.count || 0;
  return {
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
    items: rows.map((r) => ({
      uid: r.uid,
      username: r.username,
      role: r.role,
      displayName: r.displayName,
      avatarUrl: r.avatarUrl,
      bio: r.bio,
      shadowLabel: r.shadowBadgePublic ? r.shadowLabel : '',
      viewerFollows: viewerFollowingSet.has(r.uid),
      followedAt: r.followedAt,
    })),
  };
}

export async function toggleMuteUserAccount(muterUid: string, targetUid: string) {
  if (muterUid === targetUid) throw new HttpError(400, 'You cannot mute yourself.');
  const [existing] = await db
    .select()
    .from(mutedUsers)
    .where(and(eq(mutedUsers.muterUid, muterUid), eq(mutedUsers.mutedUid, targetUid)))
    .limit(1);

  if (existing) {
    await db.delete(mutedUsers).where(eq(mutedUsers.id, existing.id));
    return { muted: false };
  }
  await db
    .insert(mutedUsers)
    .values({ muterUid, mutedUid: targetUid })
    .onConflictDoNothing();
  return { muted: true };
}

export async function listMutedUsersForOwner(uid: string) {
  return await db
    .select({
      uid: users.uid,
      username: users.username,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
      mutedAt: mutedUsers.createdAt,
    })
    .from(mutedUsers)
    .innerJoin(users, eq(mutedUsers.mutedUid, users.uid))
    .innerJoin(profiles, eq(users.uid, profiles.userUid))
    .where(eq(mutedUsers.muterUid, uid))
    .orderBy(desc(mutedUsers.createdAt));
}

export async function toggleRestrictUserAccount(restricterUid: string, targetUid: string) {
  if (restricterUid === targetUid) {
    throw new HttpError(400, 'You cannot restrict yourself.');
  }
  const [existing] = await db
    .select()
    .from(restrictedUsers)
    .where(
      and(
        eq(restrictedUsers.restricterUid, restricterUid),
        eq(restrictedUsers.restrictedUid, targetUid)
      )
    )
    .limit(1);

  if (existing) {
    await db.delete(restrictedUsers).where(eq(restrictedUsers.id, existing.id));
    return { restricted: false };
  }
  await db
    .insert(restrictedUsers)
    .values({ restricterUid, restrictedUid: targetUid })
    .onConflictDoNothing();
  return { restricted: true };
}

export async function listRestrictedUsersForOwner(uid: string) {
  return await db
    .select({
      uid: users.uid,
      username: users.username,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
      restrictedAt: restrictedUsers.createdAt,
    })
    .from(restrictedUsers)
    .innerJoin(users, eq(restrictedUsers.restrictedUid, users.uid))
    .innerJoin(profiles, eq(users.uid, profiles.userUid))
    .where(eq(restrictedUsers.restricterUid, uid))
    .orderBy(desc(restrictedUsers.createdAt));
}

export async function upsertProfileAlertPreferences(
  subscriberUid: string,
  targetUid: string,
  payload: { notifyPosts?: boolean; notifyReviews?: boolean }
) {
  if (subscriberUid === targetUid) {
    throw new HttpError(400, 'Cannot set alert preferences on your own profile.');
  }
  const notifyPosts = payload.notifyPosts ?? true;
  const notifyReviews = payload.notifyReviews ?? true;

  const [saved] = await db
    .insert(profileAlertPrefs)
    .values({
      subscriberUid,
      targetUid,
      notifyPosts,
      notifyReviews,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [profileAlertPrefs.subscriberUid, profileAlertPrefs.targetUid],
      set: { notifyPosts, notifyReviews, updatedAt: new Date() },
    })
    .returning();

  return saved;
}

export async function getProfileAlertPreferences(subscriberUid: string, targetUid: string) {
  const [row] = await db
    .select()
    .from(profileAlertPrefs)
    .where(
      and(
        eq(profileAlertPrefs.subscriberUid, subscriberUid),
        eq(profileAlertPrefs.targetUid, targetUid)
      )
    )
    .limit(1);
  return row || { notifyPosts: false, notifyReviews: false };
}

// ============================================================================
// PROFILE POSTS, VIDEO PLAYBACK, QUALIFIED VIEWS, SAVED & ARCHIVE (PARTS 8, 9, 13, 24)
// ============================================================================

export async function createProfileMediaPost(
  authorUid: string,
  payload: {
    caption: string;
    title?: string;
    mediaType: 'image' | 'video';
    imageDataUrl?: string;
    videoDataUrl?: string;
    posterDataUrl?: string;
    presetMediaUrl?: string;
    mediaDurationSec?: number | null;
    animeMalId?: number | null;
    animeTitle?: string | null;
    genreTags?: string[];
    showViewCountPublicly?: boolean;
  }
) {
  const caption = String(payload.caption || '').trim().slice(0, 3000);
  if (!caption && !payload.imageDataUrl && !payload.videoDataUrl && !payload.presetMediaUrl) {
    throw new HttpError(400, 'Add a caption, image, or video to publish a post.');
  }

  const [settings] = await db
    .select({ defaultPublicVideoViews: userSettings.defaultPublicVideoViews })
    .from(userSettings)
    .where(eq(userSettings.userUid, authorUid))
    .limit(1);

  const showViews =
    typeof payload.showViewCountPublicly === 'boolean'
      ? payload.showViewCountPublicly
      : (settings?.defaultPublicVideoViews ?? true);

  let finalMediaUrl: string | null = null;
  let finalPosterUrl: string | null = null;
  const mediaType = payload.mediaType === 'video' ? 'video' : 'image';

  if (mediaType === 'video') {
    if (!payload.videoDataUrl) {
      throw new HttpError(400, 'Select an MP4 or WebM video clip to publish a video post.');
    }
    let validatedVid;
    try {
      validatedVid = validatePostVideoPayload(payload.videoDataUrl);
    } catch (err: any) {
      throw new HttpError(400, err.message || 'Video validation failed.');
    }
    const vidAsset = await saveMediaAssetRecord({
      ownerUid: authorUid,
      purpose: 'post_video',
      mimeType: validatedVid.mimeType,
      byteSize: validatedVid.byteSize,
      width: null,
      height: null,
      durationSec: payload.mediaDurationSec ? Math.round(payload.mediaDurationSec) : null,
      sha256: validatedVid.sha256,
      moderationStatus: validatedVid.moderationStatus,
      cleanBase64: validatedVid.cleanBase64,
    });
    finalMediaUrl = vidAsset.url;

    if (payload.posterDataUrl) {
      try {
        const validatedPoster = validatePostImagePayload(payload.posterDataUrl);
        const posterAsset = await saveMediaAssetRecord({
          ownerUid: authorUid,
          purpose: 'post_poster',
          mimeType: validatedPoster.mimeType,
          byteSize: validatedPoster.byteSize,
          width: validatedPoster.width,
          height: validatedPoster.height,
          sha256: validatedPoster.sha256,
          moderationStatus: validatedPoster.moderationStatus,
          cleanBase64: validatedPoster.cleanBase64,
        });
        finalPosterUrl = posterAsset.url;
      } catch {
        finalPosterUrl = '/assets/extracted/solo-hero-home.jpg';
      }
    } else {
      finalPosterUrl = '/assets/extracted/solo-hero-home.jpg';
    }
  } else {
    if (payload.imageDataUrl) {
      let validatedImg;
      try {
        validatedImg = validatePostImagePayload(payload.imageDataUrl);
      } catch (err: any) {
        throw new HttpError(400, err.message || 'Image validation failed.');
      }
      const imgAsset = await saveMediaAssetRecord({
        ownerUid: authorUid,
        purpose: 'post_image',
        mimeType: validatedImg.mimeType,
        byteSize: validatedImg.byteSize,
        width: validatedImg.width,
        height: validatedImg.height,
        sha256: validatedImg.sha256,
        moderationStatus: validatedImg.moderationStatus,
        cleanBase64: validatedImg.cleanBase64,
      });
      finalMediaUrl = imgAsset.url;
    } else if (payload.presetMediaUrl) {
      if (!isApprovedCatalogueImageUrl(payload.presetMediaUrl)) {
        throw new HttpError(400, 'Selected artwork URL is not in the approved KAGE catalogue.');
      }
      finalMediaUrl = payload.presetMediaUrl;
    } else {
      throw new HttpError(400, 'Upload an image or select anime artwork for your post.');
    }
  }

  const cleanTitle = (payload.title || '').trim().slice(0, 140) || caption.slice(0, 72) || 'KAGE Post';

  const [created] = await db
    .insert(discussions)
    .values({
      authorUid,
      kind: 'profile_post',
      title: cleanTitle,
      content: caption || cleanTitle,
      mediaUrl: finalMediaUrl,
      mediaType,
      posterUrl: finalPosterUrl,
      mediaDurationSec: payload.mediaDurationSec
        ? Math.max(1, Math.min(3600, Math.round(payload.mediaDurationSec)))
        : null,
      animeMalId: payload.animeMalId || null,
      animeTitle: payload.animeTitle || null,
      genreTags: Array.isArray(payload.genreTags) ? payload.genreTags.slice(0, 6) : [],
      showViewCountPublicly: showViews,
    })
    .returning();

  // Notify subscribers who turned on post alerts for this author
  const [authorProfile] = await db
    .select({ displayName: profiles.displayName, username: users.username })
    .from(users)
    .innerJoin(profiles, eq(users.uid, profiles.userUid))
    .where(eq(users.uid, authorUid))
    .limit(1);

  const alertSubscribers = await db
    .select({ subscriberUid: profileAlertPrefs.subscriberUid })
    .from(profileAlertPrefs)
    .where(
      and(
        eq(profileAlertPrefs.targetUid, authorUid),
        eq(profileAlertPrefs.notifyPosts, true)
      )
    );

  if (alertSubscribers.length > 0) {
    await db.insert(notifications).values(
      alertSubscribers.map((s) => ({
        recipientUid: s.subscriberUid,
        actorUid: authorUid,
        type: 'new_post',
        title: `${authorProfile?.displayName || '@' + authorProfile?.username} shared a new ${mediaType} post`,
        body: cleanTitle.slice(0, 90),
        linkUrl: `/profile/${authorProfile?.username || authorUid}?post=${created.id}`,
      }))
    );
  }

  return created;
}

export async function editOwnProfilePost(
  actorUid: string,
  postId: number,
  payload: {
    caption?: string;
    title?: string;
    showViewCountPublicly?: boolean;
  }
) {
  const [post] = await db
    .select()
    .from(discussions)
    .where(eq(discussions.id, postId))
    .limit(1);

  if (!post) throw new HttpError(404, 'Post not found.');
  if (post.authorUid !== actorUid) {
    throw new HttpError(403, 'Forbidden: You can only edit your own posts.');
  }

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (typeof payload.caption === 'string') {
    const cleanCaption = payload.caption.trim().slice(0, 3000);
    if (!cleanCaption) throw new HttpError(400, 'Post caption cannot be empty.');
    updates.content = cleanCaption;
    if (!payload.title) {
      updates.title = cleanCaption.slice(0, 72);
    }
  }
  if (typeof payload.title === 'string' && payload.title.trim()) {
    updates.title = payload.title.trim().slice(0, 140);
  }
  if (typeof payload.showViewCountPublicly === 'boolean') {
    updates.showViewCountPublicly = payload.showViewCountPublicly;
  }

  const [updated] = await db
    .update(discussions)
    .set(updates)
    .where(eq(discussions.id, postId))
    .returning();

  return updated;
}

export async function toggleArchiveOwnPost(
  actorUid: string,
  postId: number,
  archive: boolean
) {
  const [post] = await db
    .select()
    .from(discussions)
    .where(eq(discussions.id, postId))
    .limit(1);

  if (!post) throw new HttpError(404, 'Post not found.');
  if (post.authorUid !== actorUid) {
    throw new HttpError(403, 'Forbidden: Only the post owner can archive or restore this post.');
  }

  const [updated] = await db
    .update(discussions)
    .set({
      isArchived: archive,
      archivedAt: archive ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(discussions.id, postId))
    .returning();

  return updated;
}

export async function deleteOwnOrModeratedPost(actorUid: string, postId: number) {
  const [post] = await db
    .select()
    .from(discussions)
    .where(eq(discussions.id, postId))
    .limit(1);
  if (!post) throw new HttpError(404, 'Post not found.');

  const [actor] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.uid, actorUid))
    .limit(1);

  const isGlobalAdmin = actor?.role === 'owner' || actor?.role === 'admin';
  if (post.authorUid !== actorUid && !isGlobalAdmin) {
    throw new HttpError(403, 'Forbidden: You can only delete your own posts.');
  }

  await db.delete(discussions).where(eq(discussions.id, postId));

  // Clean up uploaded media assets if hosted on /api/media/:id
  for (const url of [post.mediaUrl, post.posterUrl]) {
    if (url && url.startsWith('/api/media/')) {
      const assetId = Number(url.replace('/api/media/', ''));
      if (!Number.isNaN(assetId)) {
        await deleteMediaAssetById(post.authorUid, assetId);
      }
    }
  }

  return { deleted: true };
}

export async function toggleSavePostForUser(userUid: string, postId: number) {
  const [post] = await db
    .select()
    .from(discussions)
    .where(eq(discussions.id, postId))
    .limit(1);
  if (!post) throw new HttpError(404, 'Post not found.');

  if (post.isArchived && post.authorUid !== userUid) {
    throw new HttpError(403, 'Cannot save an archived post.');
  }

  const blockState = await hasBlockBetween(userUid, post.authorUid);
  if (blockState.anyBlock) {
    throw new HttpError(403, 'Post is unavailable.');
  }

  const [existing] = await db
    .select()
    .from(savedPosts)
    .where(and(eq(savedPosts.userUid, userUid), eq(savedPosts.postId, postId)))
    .limit(1);

  if (existing) {
    await db.delete(savedPosts).where(eq(savedPosts.id, existing.id));
    return { saved: false };
  }

  await db.insert(savedPosts).values({ userUid, postId }).onConflictDoNothing();
  return { saved: true };
}

export async function listSavedPostsForOwner(
  userUid: string,
  params: { limit?: number; offset?: number }
) {
  const limit = Math.max(1, Math.min(48, params.limit || 24));
  const offset = Math.max(0, params.offset || 0);

  const rows = await db
    .select({
      savedAt: savedPosts.createdAt,
      post: discussions,
      authorUsername: users.username,
      authorDisplayName: profiles.displayName,
      authorAvatarUrl: profiles.avatarUrl,
      authorRole: users.role,
    })
    .from(savedPosts)
    .innerJoin(discussions, eq(savedPosts.postId, discussions.id))
    .innerJoin(users, eq(discussions.authorUid, users.uid))
    .innerJoin(profiles, eq(users.uid, profiles.userUid))
    .where(
      and(
        eq(savedPosts.userUid, userUid),
        or(eq(discussions.isArchived, false), eq(discussions.authorUid, userUid))
      )
    )
    .orderBy(desc(savedPosts.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((r) => ({
    ...sanitizePostForViewer(r.post, userUid, false),
    savedAt: r.savedAt,
    viewerSaved: true,
    author: {
      uid: r.post.authorUid,
      username: r.authorUsername,
      displayName: r.authorDisplayName,
      avatarUrl: r.authorAvatarUrl,
      role: r.authorRole,
    },
  }));
}

export async function listArchivedPostsForOwner(
  ownerUid: string,
  params: { limit?: number; offset?: number }
) {
  const limit = Math.max(1, Math.min(48, params.limit || 24));
  const offset = Math.max(0, params.offset || 0);

  const rows = await db
    .select()
    .from(discussions)
    .where(and(eq(discussions.authorUid, ownerUid), eq(discussions.isArchived, true)))
    .orderBy(desc(discussions.archivedAt), desc(discussions.createdAt))
    .limit(limit)
    .offset(offset);

  return rows.map((p) => sanitizePostForViewer(p, ownerUid, false));
}

// --- VIDEO PLAYS & QUALIFIED VIDEO VIEWS (PART 9 & PART 24) ---
const PLAY_START_DEDUP_MS = 30 * 1000; // 30s anti-spam on play starts
const QUALIFIED_VIEW_DEDUP_MS = 6 * 60 * 60 * 1000; // 6-hour qualified view deduplication per viewer/session

export async function recordVideoPlayStart(params: {
  postId: number;
  viewerKey: string;
  viewerUid?: string;
}) {
  const [post] = await db
    .select()
    .from(discussions)
    .where(eq(discussions.id, params.postId))
    .limit(1);

  if (!post || post.isArchived || post.mediaType !== 'video') {
    throw new HttpError(404, 'Video post not found.');
  }

  const cutoff = new Date(Date.now() - PLAY_START_DEDUP_MS);
  const [recentPlay] = await db
    .select({ id: videoViewEvents.id })
    .from(videoViewEvents)
    .where(
      and(
        eq(videoViewEvents.postId, params.postId),
        eq(videoViewEvents.viewerKey, params.viewerKey),
        eq(videoViewEvents.eventType, 'play'),
        gt(videoViewEvents.createdAt, cutoff)
      )
    )
    .limit(1);

  if (recentPlay) {
    return { countedPlay: false };
  }

  await db.insert(videoViewEvents).values({
    postId: params.postId,
    viewerKey: params.viewerKey,
    viewerUid: params.viewerUid || null,
    eventType: 'play',
    watchedSeconds: 0,
  });

  await db
    .update(discussions)
    .set({ playCount: sql`${discussions.playCount} + 1` })
    .where(eq(discussions.id, params.postId));

  return { countedPlay: true };
}

export async function recordQualifiedVideoView(params: {
  postId: number;
  viewerKey: string;
  viewerUid?: string;
  watchedSeconds: number;
}) {
  const [post] = await db
    .select()
    .from(discussions)
    .where(eq(discussions.id, params.postId))
    .limit(1);

  if (!post || post.isArchived || post.mediaType !== 'video') {
    throw new HttpError(404, 'Video post not found.');
  }

  // Documented threshold: at least 3 seconds of genuine playback (or >= 45% of clip duration for ultra-short videos < 6s)
  const minThresholdSec =
    post.mediaDurationSec && post.mediaDurationSec < 6
      ? Math.max(1, Math.floor(post.mediaDurationSec * 0.45))
      : 3;

  const watched = Math.floor(Number(params.watchedSeconds) || 0);
  if (watched < minThresholdSec) {
    return {
      counted: false,
      reason: `Playback duration (${watched}s) has not reached the ${minThresholdSec}s qualified view threshold.`,
      qualifiedViewCount:
        post.showViewCountPublicly || params.viewerUid === post.authorUid
          ? post.qualifiedViewCount
          : null,
    };
  }

  const boundedWatch = Math.min(600, watched);
  const cutoff = new Date(Date.now() - QUALIFIED_VIEW_DEDUP_MS);

  const [existingQualified] = await db
    .select({ id: videoViewEvents.id })
    .from(videoViewEvents)
    .where(
      and(
        eq(videoViewEvents.postId, params.postId),
        eq(videoViewEvents.viewerKey, params.viewerKey),
        eq(videoViewEvents.eventType, 'qualified_view'),
        gt(videoViewEvents.createdAt, cutoff)
      )
    )
    .limit(1);

  if (existingQualified) {
    return {
      counted: false,
      reason: 'deduplicated_viewer_window',
      qualifiedViewCount:
        post.showViewCountPublicly || params.viewerUid === post.authorUid
          ? post.qualifiedViewCount
          : null,
    };
  }

  await db.insert(videoViewEvents).values({
    postId: params.postId,
    viewerKey: params.viewerKey,
    viewerUid: params.viewerUid || null,
    eventType: 'qualified_view',
    watchedSeconds: boundedWatch,
  });

  const [updated] = await db
    .update(discussions)
    .set({
      qualifiedViewCount: sql`${discussions.qualifiedViewCount} + 1`,
      totalWatchSeconds: sql`${discussions.totalWatchSeconds} + ${boundedWatch}`,
    })
    .where(eq(discussions.id, params.postId))
    .returning({
      qualifiedViewCount: discussions.qualifiedViewCount,
      showViewCountPublicly: discussions.showViewCountPublicly,
      authorUid: discussions.authorUid,
    });

  const canSeeCount =
    updated.showViewCountPublicly || params.viewerUid === updated.authorUid;

  return {
    counted: true,
    qualifiedViewCount: canSeeCount ? updated.qualifiedViewCount : null,
  };
}

export async function getOwnerVideoAnalytics(ownerUid: string, postId: number) {
  const [post] = await db
    .select()
    .from(discussions)
    .where(eq(discussions.id, postId))
    .limit(1);

  if (!post) throw new HttpError(404, 'Post not found.');
  if (post.authorUid !== ownerUid) {
    throw new HttpError(403, 'Forbidden: Video analytics are private to the video owner.');
  }

  const [uniqueRes] = await db
    .select({
      uniqueViewers: sql<number>`count(distinct ${videoViewEvents.viewerKey})::int`,
    })
    .from(videoViewEvents)
    .where(
      and(
        eq(videoViewEvents.postId, postId),
        eq(videoViewEvents.eventType, 'qualified_view')
      )
    );

  const plays = Math.max(post.playCount || 0, post.qualifiedViewCount || 0);
  const avgWatchSec =
    plays > 0 ? Math.round(((post.totalWatchSeconds || 0) / plays) * 10) / 10 : 0;

  return {
    postId: post.id,
    playCount: plays,
    qualifiedViewCount: post.qualifiedViewCount || 0,
    uniqueViewers: uniqueRes?.uniqueViewers || 0,
    totalWatchSeconds: post.totalWatchSeconds || 0,
    averageWatchSeconds: avgWatchSec,
    likeCount: post.likeCount || 0,
    commentCount: post.commentCount || 0,
    showViewCountPublicly: post.showViewCountPublicly,
  };
}

// ============================================================================
// ANIME REVIEWS CRUD (PART 10.2)
// ============================================================================

export async function listProfileAnimeReviews(targetUid: string) {
  return await db
    .select()
    .from(animeReviews)
    .where(eq(animeReviews.authorUid, targetUid))
    .orderBy(desc(animeReviews.createdAt))
    .limit(50);
}

export async function createUserAnimeReview(
  authorUid: string,
  payload: {
    animeMalId: number;
    animeTitle: string;
    animeImageUrl?: string;
    rating?: number | null;
    title?: string;
    content: string;
    containsSpoilers?: boolean;
  }
) {
  const animeMalId = Number(payload.animeMalId);
  const animeTitle = String(payload.animeTitle || '').trim().slice(0, 140);
  const content = String(payload.content || '').trim().slice(0, 5000);
  if (!animeMalId || !animeTitle) {
    throw new HttpError(400, 'Select an anime title for your review.');
  }
  if (content.length < 10) {
    throw new HttpError(400, 'Review body must be at least 10 characters.');
  }

  const rating =
    payload.rating !== undefined && payload.rating !== null && payload.rating !== 0
      ? Math.max(1, Math.min(10, Math.round(Number(payload.rating))))
      : null;

  const title =
    (payload.title || '').trim().slice(0, 140) || `Review: ${animeTitle}`;

  const [created] = await db
    .insert(animeReviews)
    .values({
      authorUid,
      animeMalId,
      animeTitle,
      animeImageUrl: payload.animeImageUrl || '/assets/extracted/solo-hero-home.jpg',
      rating,
      title,
      content,
      containsSpoilers: Boolean(payload.containsSpoilers),
    })
    .returning();

  return created;
}

export async function updateUserAnimeReview(
  actorUid: string,
  reviewId: number,
  payload: {
    rating?: number | null;
    title?: string;
    content?: string;
    containsSpoilers?: boolean;
  }
) {
  const [existing] = await db
    .select()
    .from(animeReviews)
    .where(eq(animeReviews.id, reviewId))
    .limit(1);
  if (!existing) throw new HttpError(404, 'Review not found.');
  if (existing.authorUid !== actorUid) {
    throw new HttpError(403, 'Forbidden: You can only edit your own reviews.');
  }

  const updates: Record<string, any> = { updatedAt: new Date() };
  if (payload.content !== undefined) {
    const clean = String(payload.content).trim().slice(0, 5000);
    if (clean.length < 10) {
      throw new HttpError(400, 'Review body must be at least 10 characters.');
    }
    updates.content = clean;
  }
  if (payload.title !== undefined) {
    updates.title = String(payload.title).trim().slice(0, 140) || existing.title;
  }
  if (payload.rating !== undefined) {
    updates.rating =
      payload.rating !== null && Number(payload.rating) > 0
        ? Math.max(1, Math.min(10, Math.round(Number(payload.rating))))
        : null;
  }
  if (typeof payload.containsSpoilers === 'boolean') {
    updates.containsSpoilers = payload.containsSpoilers;
  }

  const [updated] = await db
    .update(animeReviews)
    .set(updates)
    .where(eq(animeReviews.id, reviewId))
    .returning();

  return updated;
}

export async function deleteUserAnimeReview(actorUid: string, reviewId: number) {
  const [existing] = await db
    .select()
    .from(animeReviews)
    .where(eq(animeReviews.id, reviewId))
    .limit(1);
  if (!existing) throw new HttpError(404, 'Review not found.');
  if (existing.authorUid !== actorUid) {
    throw new HttpError(403, 'Forbidden: You can only delete your own reviews.');
  }
  await db.delete(animeReviews).where(eq(animeReviews.id, reviewId));
  return { deleted: true };
}

// ============================================================================
// SERVER PASSWORD RESET FLOW (PART 1.2)
// ============================================================================

export async function createServerPasswordResetRequest(emailRaw: string) {
  const cleanEmail = emailRaw.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new HttpError(400, 'Enter a valid email address.');
  }

  const [userRow] = await db
    .select({ uid: users.uid, role: users.role })
    .from(users)
    .where(ilike(users.email, cleanEmail))
    .limit(1);

  // Prevent email enumeration while generating real reset token if account exists
  if (!userRow || userRow.role === 'owner') {
    return {
      ok: true,
      smtpConfigured: Boolean(process.env.SMTP_HOST),
    };
  }

  const rawToken = crypto.randomBytes(24).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  await db.insert(passwordResetTokens).values({
    userUid: userRow.uid,
    tokenHash,
    expiresAt,
  });

  return {
    ok: true,
    smtpConfigured: Boolean(process.env.SMTP_HOST),
  };
}

export async function confirmServerPasswordResetToken(
  rawToken: string,
  newPassword: string
) {
  if (!rawToken || newPassword.length < 8) {
    throw new HttpError(400, 'Valid reset token and 8+ character password are required.');
  }
  const tokenHash = crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
  const [row] = await db
    .select()
    .from(passwordResetTokens)
    .where(eq(passwordResetTokens.tokenHash, tokenHash))
    .limit(1);

  if (!row || row.usedAt || row.expiresAt < new Date()) {
    throw new HttpError(400, 'Reset token is invalid or has expired.');
  }

  const scryptHash = hashPasswordScrypt(newPassword);
  await db
    .insert(sessions)
    .values({
      userUid: row.userUid,
      sessionId: `pwd:${row.userUid}`,
      userAgent: scryptHash,
    })
    .onConflictDoUpdate({
      target: sessions.sessionId,
      set: {
        userAgent: scryptHash,
        lastActiveAt: new Date(),
        revokedAt: null,
      },
    });

  await db
    .update(passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(eq(passwordResetTokens.id, row.id));

  await db
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(sessions.userUid, row.userUid), sql`${sessions.sessionId} NOT LIKE 'pwd:%'`)
    );

  return { updated: true };
}
