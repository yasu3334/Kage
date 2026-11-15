import { and, asc, desc, eq, ilike, inArray, ne, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  aiDemoProfiles,
  animeReviews,
  blockedUsers,
  clashes,
  clashVotes,
  comments,
  communities,
  communityChatMessages,
  communityChatRooms,
  communityEventRsvps,
  communityEvents,
  communityMemberships,
  conversationMembers,
  conversations,
  discussions,
  kageIdLedger,
  messages,
  mutedUsers,
  notifications,
  profileAlertPrefs,
  profiles,
  reactions,
  reports,
  restrictedUsers,
  savedPosts,
  sessions,
  userActivityHistory,
  userAnimeEntries,
  userFollows,
  userGenreRatings,
  users,
  userSettings,
  voiceRoomMembers,
  voiceRooms,
} from './schema.ts';
import { getAiCommunityConfig } from './aiCommunityRepo.ts';
import crypto from 'crypto';
import type { UserTasteSignals } from '../server/animeCatalog.ts';
import {
  OWNER_BIO,
  OWNER_DISPLAY_NAME,
  OWNER_EMAIL,
  OWNER_PASSWORD,
  OWNER_UID,
  OWNER_USERNAME,
  hashPasswordScrypt,
  signServerToken,
  verifyPasswordScrypt,
} from '../lib/serverToken.ts';
import { validateAndComputeShadowIdentity } from '../lib/shadowIdentity.ts';
import { CURATED_ANIME_CHARACTERS, isApprovedCatalogueImageUrl } from '../server/characterCatalogue.ts';
import {
  hasBlockBetween,
  normalizeKageUsername,
  sanitizePostForViewer,
  uploadValidatedCustomAvatar,
} from './profileSystemRepo.ts';
import { getUnreadInboxCountForUser } from './inboxSystemRepo.ts';
import {
  createStandaloneVoiceRoom,
  getVoiceRoomFullDetail,
  joinVoiceRoomSession,
  leaveVoiceRoomSession,
  listStandaloneVoiceRooms,
  moderateVoiceRoomParticipant,
} from './voiceSystemRepo.ts';
import { ensureDefaultCommunityChatRooms } from './communityChatRepo.ts';

function sanitizeDbError(context: string, error: unknown): never {
  console.error(`Database error [${context}]:`, error);
  throw new Error(`Unable to complete ${context} right now. Please try again.`, {
    cause: error,
  });
}

function slugifyUsername(base: string): string {
  const cleaned = base
    .trim()
    .replace(/^@+/, '')
    .replace(/[^a-zA-Z0-9_.-]/g, '')
    .slice(0, 24);
  return cleaned.length >= 3 ? cleaned : `hunter_${Math.floor(1000 + Math.random() * 9000)}`;
}

export async function ensureKageIdForUser(uid: string): Promise<string | null> {
  try {
    const [existing] = await db
      .select({ kageId: users.kageId })
      .from(users)
      .where(eq(users.uid, uid))
      .limit(1);
    if (existing?.kageId) return existing.kageId;

    const [existingLedger] = await db
      .select()
      .from(kageIdLedger)
      .where(eq(kageIdLedger.userUid, uid))
      .limit(1);

    let kageId = existingLedger?.kageId || null;
    if (!kageId) {
      const [inserted] = await db
        .insert(kageIdLedger)
        .values({ userUid: uid })
        .onConflictDoNothing()
        .returning({ seq: kageIdLedger.seq });

      const seq =
        inserted?.seq ??
        (
          await db
            .select({ seq: kageIdLedger.seq })
            .from(kageIdLedger)
            .where(eq(kageIdLedger.userUid, uid))
            .limit(1)
        )[0]?.seq;

      if (seq) {
        kageId = `KAGE-${String(seq).padStart(8, '0')}`;
        await db
          .update(kageIdLedger)
          .set({ kageId })
          .where(eq(kageIdLedger.userUid, uid));
      }
    }

    if (kageId) {
      await db
        .update(users)
        .set({ kageId })
        .where(eq(users.uid, uid));
    }
    return kageId;
  } catch (err) {
    console.warn('KAGE ID assignment warning:', err);
    return null;
  }
}

export async function getOrCreateAccount(params: {
  uid: string;
  email: string;
  preferredUsername?: string;
  displayName?: string;
  avatarUrl?: string;
  avatarSource?: 'default' | 'catalogue' | 'custom';
  favouriteCharacter?: string;
  favouriteCharacterAnime?: string;
  favouriteCharacterMalId?: number | null;
  shadowQualities?: string[];
  shadowLabel?: string;
  emailVerified?: boolean;
}) {
  try {
    const isOwnerIdentity =
      params.uid === OWNER_UID ||
      params.email.trim().toLowerCase() === OWNER_EMAIL.toLowerCase();

    const existing = await db
      .select()
      .from(users)
      .where(eq(users.uid, params.uid))
      .limit(1);

    if (existing.length > 0) {
      await db
        .update(users)
        .set({
          email: params.email || existing[0].email,
          usernameNormalized: existing[0].usernameNormalized || existing[0].username.toLowerCase(),
          emailVerified: isOwnerIdentity ? true : (params.emailVerified ?? existing[0].emailVerified),
          role: isOwnerIdentity ? 'owner' : existing[0].role,
          updatedAt: new Date(),
        })
        .where(eq(users.uid, params.uid));
    } else {
      let candidateUsername = slugifyUsername(
        isOwnerIdentity
          ? params.preferredUsername || OWNER_USERNAME
          : params.preferredUsername || params.email.split('@')[0] || 'kage_hunter'
      );
      const taken = await db
        .select({ uid: users.uid })
        .from(users)
        .where(sql`lower(${users.username}) = ${candidateUsername.toLowerCase()}`)
        .limit(1);
      if (taken.length > 0) {
        candidateUsername = `${candidateUsername.slice(0, 18)}_${Math.floor(100 + Math.random() * 899)}`;
      }

      await db
        .insert(users)
        .values({
          uid: params.uid,
          email: params.email.trim().toLowerCase(),
          username: candidateUsername,
          usernameNormalized: candidateUsername.toLowerCase(),
          role: isOwnerIdentity ? 'owner' : 'user',
          emailVerified: isOwnerIdentity ? true : Boolean(params.emailVerified),
          isSeed: false,
        })
        .onConflictDoUpdate({
          target: users.uid,
          set: {
            email: params.email.trim().toLowerCase(),
            role: isOwnerIdentity ? 'owner' : undefined,
            emailVerified: isOwnerIdentity ? true : Boolean(params.emailVerified),
            updatedAt: new Date(),
          },
        });
    }

    await ensureKageIdForUser(params.uid);

    const userRow = (
      await db.select().from(users).where(eq(users.uid, params.uid)).limit(1)
    )[0];

    await db
      .insert(profiles)
      .values({
        userUid: params.uid,
        displayName: isOwnerIdentity
          ? params.displayName || OWNER_DISPLAY_NAME
          : params.displayName || userRow.username,
        bio: isOwnerIdentity ? OWNER_BIO : '',
        avatarUrl: params.avatarUrl || '/assets/zenitsu-avatar.png',
        avatarSource: params.avatarSource || (params.avatarUrl ? 'catalogue' : 'default'),
        bannerUrl: '/assets/extracted/solo-hero-home.jpg',
        favouriteCharacter: params.favouriteCharacter || (isOwnerIdentity ? 'Zenitsu Agatsuma' : ''),
        favouriteCharacterAnime:
          params.favouriteCharacterAnime || (isOwnerIdentity ? 'Demon Slayer: Kimetsu no Yaiba' : ''),
        favouriteCharacterMalId: params.favouriteCharacterMalId ?? null,
        shadowQualities: params.shadowQualities || (isOwnerIdentity ? ['Leadership', 'Confidence'] : []),
        shadowLabel: params.shadowLabel || (isOwnerIdentity ? 'THE RISING MONARCH' : ''),
        shadowBadgePublic: true,
        favoriteGenres: isOwnerIdentity
          ? ['Action', 'Dark Fantasy', 'Fantasy', 'Supernatural', 'Sci-Fi', 'Cyberpunk', 'Romance']
          : [],
      })
      .onConflictDoNothing();

    await db
      .insert(userSettings)
      .values({
        userUid: params.uid,
      })
      .onConflictDoNothing();

    return await getFullUserBundle(params.uid);
  } catch (error) {
    sanitizeDbError('account synchronization', error);
  }
}

export async function checkUsernameAvailability(username: string, excludeUid?: string) {
  try {
    const normalized = normalizeKageUsername(username);
    if (!/^[a-z0-9_.-]{3,24}$/.test(normalized)) {
      return {
        available: false,
        normalized,
        reason: 'Username must be 3–24 characters using letters, numbers, _, ., or -.',
      };
    }
    const found = await db
      .select({ uid: users.uid })
      .from(users)
      .where(sql`lower(${users.username}) = ${normalized}`)
      .limit(1);
    if (found.length > 0 && found[0].uid !== excludeUid) {
      return {
        available: false,
        normalized,
        reason: 'That username is already claimed in KAGE.',
      };
    }
    return { available: true, normalized };
  } catch (error) {
    sanitizeDbError('username verification', error);
  }
}

export async function resolveLoginIdentifier(identifier: string): Promise<string | null> {
  try {
    const trimmed = identifier.trim().toLowerCase();
    if (trimmed.includes('@')) return trimmed;
    const handle = normalizeKageUsername(trimmed);
    const found = await db
      .select({ email: users.email })
      .from(users)
      .where(sql`lower(${users.username}) = ${handle}`)
      .limit(1);
    return found[0]?.email || null;
  } catch (error) {
    sanitizeDbError('account lookup', error);
  }
}

export async function recordUserSession(uid: string, sessionId: string, userAgent: string) {
  try {
    await db
      .insert(sessions)
      .values({
        userUid: uid,
        sessionId,
        userAgent: userAgent.slice(0, 250),
      })
      .onConflictDoUpdate({
        target: sessions.sessionId,
        set: { lastActiveAt: new Date(), revokedAt: null },
      });
  } catch (error) {
    sanitizeDbError('session creation', error);
  }
}

export async function revokeUserSessions(uid: string) {
  try {
    await db
      .update(sessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(sessions.userUid, uid), sql`${sessions.sessionId} NOT LIKE 'pwd:%'`));
  } catch (error) {
    sanitizeDbError('session logout', error);
  }
}

export async function getFullUserBundle(uid: string) {
  try {
    const [u] = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
    if (!u) return null;
    const [p, s, unreadNotifs, unreadMessages] = await Promise.all([
      db.select().from(profiles).where(eq(profiles.userUid, uid)).limit(1).then((r) => r[0]),
      db.select().from(userSettings).where(eq(userSettings.userUid, uid)).limit(1).then((r) => r[0]),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(notifications)
        .where(and(eq(notifications.recipientUid, uid), eq(notifications.isRead, false)))
        .then((r) => r[0]),
      getUnreadInboxCountForUser(uid).catch(() => 0),
    ]);

    return {
      user: u,
      profile: p,
      settings: s,
      unreadNotifications: unreadNotifs?.count || 0,
      unreadMessages,
    };
  } catch (error) {
    sanitizeDbError('profile retrieval', error);
  }
}

export async function getPublicProfileByUsernameOrUid(
  identifier: string,
  viewerUid?: string,
  options?: { viewAsPublic?: boolean; postsLimit?: number; postsOffset?: number }
) {
  try {
    const rawTrimmed = identifier.trim();
    const cleanHandle = normalizeKageUsername(rawTrimmed);
    const kageIdMatch = /^kage[-_]?d?0*(\d+)$/i.exec(rawTrimmed);
    const isDemoKageId = /^kage[-_]?d/i.test(rawTrimmed);
    const paddedKageId = kageIdMatch
      ? isDemoKageId
        ? `KAGE-D${kageIdMatch[1].padStart(7, '0')}`
        : `KAGE-${kageIdMatch[1].padStart(8, '0')}`
      : null;

    const lookupConds: any[] = [
      sql`lower(${users.username}) = ${cleanHandle}`,
      eq(users.uid, rawTrimmed),
      sql`upper(${users.kageId}) = ${rawTrimmed.toUpperCase()}`,
    ];
    if (paddedKageId) {
      lookupConds.push(eq(users.kageId, paddedKageId));
    }

    const [u] = await db
      .select()
      .from(users)
      .where(or(...lookupConds))
      .limit(1);
    if (!u) return null;

    const [p] = await db.select().from(profiles).where(eq(profiles.userUid, u.uid)).limit(1);
    const aiCfg = await getAiCommunityConfig();

    const actualIsOwner = Boolean(viewerUid && viewerUid === u.uid);
    const viewAsPublic = Boolean(actualIsOwner && options?.viewAsPublic);
    const effectiveIsOwner = actualIsOwner && !viewAsPublic;

    // Check block relationships in both directions
    const blockState = await hasBlockBetween(viewerUid, u.uid);
    if (blockState.bBlockedA && !actualIsOwner) {
      // Target user blocked viewer -> hide profile details & content
      return {
        user: {
          uid: u.uid,
          username: u.username,
          role: u.role,
          createdAt: u.createdAt,
        },
        profile: {
          userUid: u.uid,
          displayName: u.username,
          bio: '',
          avatarUrl: '/assets/zenitsu-avatar.png',
          avatarSource: 'default',
          bannerUrl: '/assets/extracted/solo-hero-home.jpg',
          favouriteCharacter: '',
          favouriteCharacterAnime: '',
          shadowQualities: [],
          shadowLabel: '',
          shadowBadgePublic: false,
          favoriteGenres: [],
          isPrivate: true,
          showActivity: false,
          showWatchlist: false,
          commentPermission: 'nobody',
        },
        stats: {
          postsCount: 0,
          followersCount: 0,
          followingCount: 0,
          guildsCount: 0,
          reviewsCount: 0,
        },
        isFollowing: false,
        isBlocked: false,
        isBlockedByTarget: true,
        isMuted: false,
        isRestricted: false,
        targetRestrictedViewer: false,
        alertPrefs: { notifyPosts: false, notifyReviews: false },
        isOwner: false,
        actualIsOwner: false,
        viewAsPublic: false,
        canViewPrivate: false,
        posts: [],
        postsHasMore: false,
        reviews: [],
        comments: [],
        joinedGuilds: [],
        watchlist: [],
        genreRatings: [],
      };
    }

    const postsLimit = Math.max(1, Math.min(48, options?.postsLimit || 24));
    const postsOffset = Math.max(0, options?.postsOffset || 0);

    const allowSimulatedAudience =
      aiCfg.aiActivityEnabled && (u.role !== 'owner' || aiCfg.ownerDemoAudienceEnabled);

    const [
      followersBreakdownRes,
      followingRes,
      postsCountRes,
      postsRes,
      reviewsRes,
      userComments,
      joinedGuilds,
      watchlist,
      genreRatings,
      aiDemoMetaRows,
      storedActivityRows,
    ] = await Promise.all([
      db
        .select({
          humanCount: sql<number>`count(*) FILTER (WHERE ${userFollows.isSimulated} = false)::int`,
          demoCount: sql<number>`count(*) FILTER (WHERE ${userFollows.isSimulated} = true)::int`,
        })
        .from(userFollows)
        .where(eq(userFollows.followingUid, u.uid)),
      db
        .select({
          count: sql<number>`count(*)::int`,
        })
        .from(userFollows)
        .where(
          aiCfg.aiActivityEnabled
            ? eq(userFollows.followerUid, u.uid)
            : and(eq(userFollows.followerUid, u.uid), eq(userFollows.isSimulated, false))
        ),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(discussions)
        .where(and(eq(discussions.authorUid, u.uid), eq(discussions.isArchived, false))),
      db
        .select()
        .from(discussions)
        .where(and(eq(discussions.authorUid, u.uid), eq(discussions.isArchived, false)))
        .orderBy(desc(discussions.isPinned), desc(discussions.createdAt))
        .limit(postsLimit)
        .offset(postsOffset),
      db
        .select()
        .from(animeReviews)
        .where(eq(animeReviews.authorUid, u.uid))
        .orderBy(desc(animeReviews.createdAt))
        .limit(30),
      db
        .select({
          id: comments.id,
          discussionId: comments.discussionId,
          content: comments.content,
          createdAt: comments.createdAt,
          discussionTitle: discussions.title,
        })
        .from(comments)
        .innerJoin(discussions, eq(comments.discussionId, discussions.id))
        .where(
          and(
            eq(comments.authorUid, u.uid),
            eq(discussions.isArchived, false),
            eq(comments.isRestrictedShadow, false)
          )
        )
        .orderBy(desc(comments.createdAt))
        .limit(20),
      db
        .select({
          id: communities.id,
          slug: communities.slug,
          name: communities.name,
          artworkUrl: communities.artworkUrl,
          memberCount: communities.memberCount,
          role: communityMemberships.role,
        })
        .from(communityMemberships)
        .innerJoin(communities, eq(communityMemberships.communityId, communities.id))
        .where(eq(communityMemberships.userUid, u.uid)),
      db
        .select()
        .from(userAnimeEntries)
        .where(eq(userAnimeEntries.userUid, u.uid))
        .orderBy(desc(userAnimeEntries.updatedAt)),
      db
        .select()
        .from(userGenreRatings)
        .where(eq(userGenreRatings.userUid, u.uid))
        .orderBy(desc(userGenreRatings.rating)),
      u.isAiDemo
        ? db.select().from(aiDemoProfiles).where(eq(aiDemoProfiles.userUid, u.uid)).limit(1)
        : Promise.resolve([]),
      db
        .select()
        .from(userActivityHistory)
        .where(eq(userActivityHistory.userUid, u.uid))
        .orderBy(desc(userActivityHistory.createdAt))
        .limit(25),
    ]);

    let isFollowing = false;
    let isMuted = false;
    let isRestricted = false;
    let targetRestrictedViewer = false;
    let alertPrefs = { notifyPosts: false, notifyReviews: false };

    if (viewerUid && viewerUid !== u.uid) {
      const [fRows, mRows, rRows, trRows, prefRows] = await Promise.all([
        db
          .select()
          .from(userFollows)
          .where(
            and(eq(userFollows.followerUid, viewerUid), eq(userFollows.followingUid, u.uid))
          )
          .limit(1),
        db
          .select()
          .from(mutedUsers)
          .where(and(eq(mutedUsers.muterUid, viewerUid), eq(mutedUsers.mutedUid, u.uid)))
          .limit(1),
        db
          .select()
          .from(restrictedUsers)
          .where(
            and(
              eq(restrictedUsers.restricterUid, viewerUid),
              eq(restrictedUsers.restrictedUid, u.uid)
            )
          )
          .limit(1),
        db
          .select()
          .from(restrictedUsers)
          .where(
            and(
              eq(restrictedUsers.restricterUid, u.uid),
              eq(restrictedUsers.restrictedUid, viewerUid)
            )
          )
          .limit(1),
        db
          .select()
          .from(profileAlertPrefs)
          .where(
            and(
              eq(profileAlertPrefs.subscriberUid, viewerUid),
              eq(profileAlertPrefs.targetUid, u.uid)
            )
          )
          .limit(1),
      ]);

      isFollowing = Boolean(fRows[0]);
      isMuted = Boolean(mRows[0]);
      isRestricted = Boolean(rRows[0]);
      targetRestrictedViewer = Boolean(trRows[0]);
      if (prefRows[0]) {
        alertPrefs = {
          notifyPosts: prefRows[0].notifyPosts,
          notifyReviews: prefRows[0].notifyReviews,
        };
      }
    }

    const canViewPrivate =
      !blockState.aBlockedB && (effectiveIsOwner || !p?.isPrivate || (!viewAsPublic && isFollowing));

    let savedIds = new Set<number>();
    let likedIds = new Set<number>();
    if (viewerUid && postsRes.length > 0) {
      const postIds = postsRes.map((post) => post.id);
      const [sRows, lRows] = await Promise.all([
        db
          .select({ postId: savedPosts.postId })
          .from(savedPosts)
          .where(and(eq(savedPosts.userUid, viewerUid), inArray(savedPosts.postId, postIds))),
        db
          .select({ targetId: reactions.targetId })
          .from(reactions)
          .where(
            and(
              eq(reactions.userUid, viewerUid),
              eq(reactions.targetType, 'discussion'),
              eq(reactions.reactionType, 'like'),
              inArray(reactions.targetId, postIds)
            )
          ),
      ]);
      savedIds = new Set(sRows.map((s) => s.postId));
      likedIds = new Set(lRows.map((l) => l.targetId));
    }

    const showShadowBadge = effectiveIsOwner || Boolean(p?.shadowBadgePublic);
    const sanitizedProfile = p
      ? {
          ...p,
          shadowLabel: showShadowBadge ? p.shadowLabel : '',
          shadowQualities: showShadowBadge ? p.shadowQualities : [],
        }
      : null;

    const totalPostsCount = postsCountRes[0]?.count || 0;
    const organicFollowersCount = followersBreakdownRes[0]?.humanCount || 0;
    const rawDemoFollowersCount = followersBreakdownRes[0]?.demoCount || 0;
    const visibleDemoFollowersCount = allowSimulatedAudience ? rawDemoFollowersCount : 0;
    const visibleFollowersCount = organicFollowersCount + visibleDemoFollowersCount;

    const aiDemoMeta = aiDemoMetaRows[0] || null;
    let activityHistory = storedActivityRows.map((a) => ({
      id: a.id,
      activityType: a.activityType,
      summary: a.summary,
      linkUrl: a.linkUrl,
      isSimulated: a.isSimulated,
      createdAt: a.createdAt,
    }));

    if (u.isAiDemo && activityHistory.length === 0) {
      const favAnime = p?.favouriteCharacterAnime || aiDemoMeta?.favoriteAnime || 'Solo Leveling';
      const favChar = p?.favouriteCharacter || aiDemoMeta?.favoriteCharacter || 'Sung Jin-Woo';
      const baseTime = new Date(u.createdAt).getTime();
      activityHistory = [
        {
          id: -1,
          activityType: 'watchlist_updated',
          summary: `Added ${favAnime} (${favChar}) to favorite anime realm picks`,
          linkUrl: '/',
          isSimulated: false,
          createdAt: new Date(baseTime + 3_600_000 * 6),
        },
        ...(joinedGuilds[0]
          ? [
              {
                id: -2,
                activityType: 'community_joined',
                summary: `Joined the ${joinedGuilds[0].name} anime community`,
                linkUrl: `/guilds/${joinedGuilds[0].slug}`,
                isSimulated: false,
                createdAt: new Date(baseTime + 3_600_000 * 3),
              },
            ]
          : []),
        {
          id: -3,
          activityType: 'profile_calibrated',
          summary: `Calibrated ${(p?.favoriteGenres || ['Action', 'Dark Fantasy']).slice(0, 3).join(' · ')} taste profile on KAGE`,
          linkUrl: '/pulse',
          isSimulated: false,
          createdAt: new Date(baseTime + 3_600_000),
        },
      ];
    }

    return {
      user: {
        uid: u.uid,
        kageId: u.kageId,
        username: u.username,
        role: u.role,
        isAiDemo: u.isAiDemo,
        createdAt: u.createdAt,
      },
      aiDemoMeta,
      aiDisclosure: null,
      profile: sanitizedProfile,
      stats: {
        postsCount: totalPostsCount,
        followersCount: visibleFollowersCount,
        organicFollowersCount,
        demoFollowersCount: visibleDemoFollowersCount,
        followingCount: followingRes[0]?.count || 0,
        guildsCount: joinedGuilds.length,
        reviewsCount: reviewsRes.length,
      },
      isFollowing: viewAsPublic ? false : isFollowing,
      isBlocked: blockState.aBlockedB,
      isBlockedByTarget: false,
      isMuted,
      isRestricted,
      targetRestrictedViewer,
      alertPrefs,
      isOwner: effectiveIsOwner,
      actualIsOwner,
      viewAsPublic,
      canViewPrivate,
      posts: canViewPrivate
        ? postsRes.map((post) => ({
            ...sanitizePostForViewer(post, viewerUid, viewAsPublic),
            viewerSaved: savedIds.has(post.id),
            viewerLiked: likedIds.has(post.id),
          }))
        : [],
      postsHasMore: canViewPrivate && postsOffset + postsRes.length < totalPostsCount,
      reviews: canViewPrivate ? reviewsRes : [],
      comments: canViewPrivate && (effectiveIsOwner || p?.showActivity) ? userComments : [],
      activityHistory: canViewPrivate && (effectiveIsOwner || p?.showActivity) ? activityHistory : [],
      joinedGuilds: canViewPrivate ? joinedGuilds : [],
      watchlist: canViewPrivate && (effectiveIsOwner || p?.showWatchlist) ? watchlist : [],
      genreRatings: effectiveIsOwner ? genreRatings : [],
    };
  } catch (error) {
    sanitizeDbError('user profile query', error);
  }
}

export async function updateUserProfileAndUsername(
  uid: string,
  payload: {
    username?: string;
    displayName?: string;
    bio?: string;
    avatarUrl?: string;
    bannerUrl?: string;
    favouriteCharacter?: string;
    favouriteCharacterAnime?: string;
    favouriteCharacterMalId?: number | null;
    shadowQualities?: unknown;
    shadowBadgePublic?: boolean;
    favoriteGenres?: string[];
    isPrivate?: boolean;
    showActivity?: boolean;
    showWatchlist?: boolean;
    commentPermission?: string;
  }
) {
  try {
    if (payload.username !== undefined) {
      const normalized = normalizeKageUsername(payload.username);
      const check = await checkUsernameAvailability(normalized, uid);
      if (!check.available) {
        throw new Error(check.reason || 'Username unavailable.');
      }
      await db
        .update(users)
        .set({ username: normalized, updatedAt: new Date() })
        .where(eq(users.uid, uid));
    }

    const profileUpdates: Record<string, any> = { updatedAt: new Date() };
    if (payload.displayName !== undefined) {
      profileUpdates.displayName = payload.displayName.trim().slice(0, 50) || 'Hunter';
    }
    if (payload.bio !== undefined) {
      profileUpdates.bio = payload.bio.trim().slice(0, 280);
    }
    if (payload.avatarUrl !== undefined) {
      if (payload.avatarUrl.startsWith('data:image/')) {
        const uploaded = await uploadValidatedCustomAvatar(uid, payload.avatarUrl);
        profileUpdates.avatarUrl = uploaded.avatarUrl;
        profileUpdates.avatarSource = 'custom';
      } else if (isApprovedCatalogueImageUrl(payload.avatarUrl)) {
        profileUpdates.avatarUrl = payload.avatarUrl;
        profileUpdates.avatarSource =
          payload.avatarUrl === '/assets/zenitsu-avatar.png' ? 'default' : 'catalogue';
      } else {
        throw new Error('Selected avatar URL is not from an approved anime source.');
      }
    }
    if (payload.bannerUrl !== undefined && isApprovedCatalogueImageUrl(payload.bannerUrl)) {
      profileUpdates.bannerUrl = payload.bannerUrl;
    }
    if (payload.favouriteCharacter !== undefined) {
      profileUpdates.favouriteCharacter = String(payload.favouriteCharacter).trim().slice(0, 80);
    }
    if (payload.favouriteCharacterAnime !== undefined) {
      profileUpdates.favouriteCharacterAnime = String(payload.favouriteCharacterAnime)
        .trim()
        .slice(0, 120);
    }
    if (payload.favouriteCharacterMalId !== undefined) {
      profileUpdates.favouriteCharacterMalId = payload.favouriteCharacterMalId
        ? Number(payload.favouriteCharacterMalId)
        : null;
    }
    if (payload.shadowQualities !== undefined) {
      const computed = validateAndComputeShadowIdentity(payload.shadowQualities);
      profileUpdates.shadowQualities = computed.qualities;
      profileUpdates.shadowLabel = computed.label;
    }
    if (typeof payload.shadowBadgePublic === 'boolean') {
      profileUpdates.shadowBadgePublic = payload.shadowBadgePublic;
    }
    if (Array.isArray(payload.favoriteGenres)) {
      profileUpdates.favoriteGenres = payload.favoriteGenres.slice(0, 16);
    }
    if (typeof payload.isPrivate === 'boolean') {
      profileUpdates.isPrivate = payload.isPrivate;
    }
    if (typeof payload.showActivity === 'boolean') {
      profileUpdates.showActivity = payload.showActivity;
    }
    if (typeof payload.showWatchlist === 'boolean') {
      profileUpdates.showWatchlist = payload.showWatchlist;
    }
    if (
      payload.commentPermission &&
      ['everyone', 'followers', 'nobody'].includes(payload.commentPermission)
    ) {
      profileUpdates.commentPermission = payload.commentPermission;
    }

    await db.update(profiles).set(profileUpdates).where(eq(profiles.userUid, uid));
    return await getFullUserBundle(uid);
  } catch (error: any) {
    if (
      error?.message?.includes('Username') ||
      error?.message?.includes('Shadow Identity') ||
      error?.message?.includes('Avatar') ||
      error?.message?.includes('avatar') ||
      error?.message?.includes('Upload') ||
      error?.message?.includes('Unsupported') ||
      error?.message?.includes('dimensions') ||
      error?.message?.includes('SVG')
    ) {
      throw error;
    }
    sanitizeDbError('profile update', error);
  }
}

export async function updateSettingsForUser(
  uid: string,
  updates: Partial<{
    emailNotifications: boolean;
    marketingEmails: boolean;
    notifyFollows: boolean;
    notifyComments: boolean;
    notifyReactions: boolean;
    notifyMentions: boolean;
    notifyReposts: boolean;
    notifyMessages: boolean;
    notifyChallenges: boolean;
    notifyGuilds: boolean;
    notifyCommunity: boolean;
    notifyVoiceInvites: boolean;
    allowDirectMessages: string;
    messageRequestMode: string;
    showOnlineStatus: boolean;
    showReadReceipts: boolean;
    profileVisitHistory: string;
    defaultPublicVideoViews: boolean;
    discoverableInSearch: boolean;
    themeAccent: string;
    highContrast: boolean;
    largerText: boolean;
    reducedMotion: boolean;
    skipIntroAlways: boolean;
  }>
) {
  try {
    const clean: Record<string, any> = { updatedAt: new Date() };
    const boolKeys = [
      'emailNotifications',
      'marketingEmails',
      'notifyFollows',
      'notifyComments',
      'notifyReactions',
      'notifyMentions',
      'notifyReposts',
      'notifyMessages',
      'notifyChallenges',
      'notifyGuilds',
      'notifyCommunity',
      'notifyVoiceInvites',
      'showOnlineStatus',
      'showReadReceipts',
      'defaultPublicVideoViews',
      'discoverableInSearch',
      'highContrast',
      'largerText',
      'reducedMotion',
      'skipIntroAlways',
    ] as const;

    for (const key of boolKeys) {
      if (typeof updates[key] === 'boolean') clean[key] = updates[key];
    }
    if (updates.themeAccent && ['crimson', 'violet', 'gold'].includes(updates.themeAccent)) {
      clean.themeAccent = updates.themeAccent;
    }
    if (
      updates.profileVisitHistory &&
      ['record', 'pause'].includes(updates.profileVisitHistory)
    ) {
      clean.profileVisitHistory = updates.profileVisitHistory;
    }
    if (
      updates.allowDirectMessages &&
      ['everyone', 'followers', 'nobody'].includes(updates.allowDirectMessages)
    ) {
      clean.allowDirectMessages = updates.allowDirectMessages;
    }
    if (
      updates.messageRequestMode &&
      ['non_followers', 'everyone', 'off'].includes(updates.messageRequestMode)
    ) {
      clean.messageRequestMode = updates.messageRequestMode;
    }

    await db
      .insert(userSettings)
      .values({ userUid: uid, ...clean })
      .onConflictDoUpdate({
        target: userSettings.userUid,
        set: clean,
      });

    return await getFullUserBundle(uid);
  } catch (error) {
    sanitizeDbError('settings update', error);
  }
}

export async function toggleFollowUser(followerUid: string, targetUid: string) {
  if (followerUid === targetUid) {
    throw new Error('You cannot follow yourself.');
  }
  const blockState = await hasBlockBetween(followerUid, targetUid);
  if (blockState.anyBlock) {
    throw new Error('Follow action is unavailable due to block settings.');
  }

  try {
    const [targetExists] = await db
      .select({ uid: users.uid })
      .from(users)
      .where(eq(users.uid, targetUid))
      .limit(1);
    if (!targetExists) {
      throw new Error('Target user does not exist.');
    }

    const existing = await db
      .select()
      .from(userFollows)
      .where(
        and(eq(userFollows.followerUid, followerUid), eq(userFollows.followingUid, targetUid))
      )
      .limit(1);

    let following = false;
    if (existing.length > 0) {
      await db.delete(userFollows).where(eq(userFollows.id, existing[0].id));
      following = false;
    } else {
      await db
        .insert(userFollows)
        .values({ followerUid, followingUid: targetUid })
        .onConflictDoNothing();
      following = true;

      const [actor] = await db
        .select({ displayName: profiles.displayName, username: users.username })
        .from(users)
        .innerJoin(profiles, eq(users.uid, profiles.userUid))
        .where(eq(users.uid, followerUid))
        .limit(1);

      await createNotification({
        recipientUid: targetUid,
        actorUid: followerUid,
        type: 'follow',
        title: `${actor?.displayName || 'A hunter'} started following you`,
        body: `@${actor?.username || 'hunter'}`,
        linkUrl: `/profile/${actor?.username || followerUid}`,
      });
    }

    const [followersRes, followingRes] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(userFollows)
        .where(eq(userFollows.followingUid, targetUid)),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(userFollows)
        .where(eq(userFollows.followerUid, followerUid)),
    ]);

    return {
      following,
      followersCount: followersRes[0]?.count || 0,
      viewerFollowingCount: followingRes[0]?.count || 0,
    };
  } catch (error: any) {
    if (error?.message?.includes('cannot follow') || error?.message?.includes('unavailable') || error?.message?.includes('does not exist')) {
      throw error;
    }
    sanitizeDbError('follow action', error);
  }
}

export async function toggleBlockUser(blockerUid: string, blockedUid: string) {
  if (blockerUid === blockedUid) throw new Error('Cannot block yourself.');
  try {
    const existing = await db
      .select()
      .from(blockedUsers)
      .where(and(eq(blockedUsers.blockerUid, blockerUid), eq(blockedUsers.blockedUid, blockedUid)))
      .limit(1);

    if (existing.length > 0) {
      await db.delete(blockedUsers).where(eq(blockedUsers.id, existing[0].id));
      return { blocked: false };
    } else {
      await db
        .insert(blockedUsers)
        .values({ blockerUid, blockedUid })
        .onConflictDoNothing();
      await db
        .delete(userFollows)
        .where(
          or(
            and(eq(userFollows.followerUid, blockerUid), eq(userFollows.followingUid, blockedUid)),
            and(eq(userFollows.followerUid, blockedUid), eq(userFollows.followingUid, blockerUid))
          )
        );
      await db
        .delete(profileAlertPrefs)
        .where(
          or(
            and(
              eq(profileAlertPrefs.subscriberUid, blockerUid),
              eq(profileAlertPrefs.targetUid, blockedUid)
            ),
            and(
              eq(profileAlertPrefs.subscriberUid, blockedUid),
              eq(profileAlertPrefs.targetUid, blockerUid)
            )
          )
        );
      return { blocked: true };
    }
  } catch (error) {
    sanitizeDbError('block user action', error);
  }
}

export async function listBlockedUsers(uid: string) {
  try {
    return await db
      .select({
        uid: users.uid,
        username: users.username,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
        blockedAt: blockedUsers.createdAt,
      })
      .from(blockedUsers)
      .innerJoin(users, eq(blockedUsers.blockedUid, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(eq(blockedUsers.blockerUid, uid));
  } catch (error) {
    sanitizeDbError('blocked users list', error);
  }
}

// --- COMMUNITIES / GUILDS ---
export async function listCommunities(params: {
  q?: string;
  sort?: string;
  animeMalId?: number;
  viewerUid?: string;
}) {
  try {
    const conditions = [];
    if (params.q?.trim()) {
      const pattern = `%${params.q.trim()}%`;
      conditions.push(
        or(ilike(communities.name, pattern), ilike(communities.description, pattern))
      );
    }
    if (params.animeMalId) {
      conditions.push(eq(communities.animeMalId, params.animeMalId));
    }

    const orderBy =
      params.sort === 'newest'
        ? desc(communities.createdAt)
        : desc(communities.memberCount);

    const rows = await db
      .select()
      .from(communities)
      .where(conditions.length ? and(...conditions) : undefined)
      .orderBy(orderBy)
      .limit(50);

    let memberMap = new Map<number, string>();
    if (params.viewerUid && rows.length > 0) {
      const memberships = await db
        .select()
        .from(communityMemberships)
        .where(eq(communityMemberships.userUid, params.viewerUid));
      memberMap = new Map(memberships.map((m) => [m.communityId, m.role]));
    }

    return rows.map((c) => ({
      ...c,
      isMember: memberMap.has(c.id),
      memberRole: memberMap.get(c.id) || null,
    }));
  } catch (error) {
    sanitizeDbError('communities list', error);
  }
}

export async function getCommunityBySlugOrId(slugOrId: string, viewerUid?: string) {
  try {
    const numericId = Number(slugOrId);
    const [guild] = await db
      .select()
      .from(communities)
      .where(
        !Number.isNaN(numericId)
          ? or(eq(communities.id, numericId), eq(communities.slug, slugOrId))
          : eq(communities.slug, slugOrId)
      )
      .limit(1);

    if (!guild) return null;

    const members = await db
      .select({
        uid: users.uid,
        username: users.username,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
        role: communityMemberships.role,
        userRole: users.role,
        joinedAt: communityMemberships.createdAt,
      })
      .from(communityMemberships)
      .innerJoin(users, eq(communityMemberships.userUid, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(eq(communityMemberships.communityId, guild.id))
      .limit(40);

    const viewerMembership = viewerUid
      ? members.find((m) => m.uid === viewerUid) || null
      : null;

    return {
      ...guild,
      isMember: Boolean(viewerMembership),
      memberRole: viewerMembership?.role || null,
      members,
    };
  } catch (error) {
    sanitizeDbError('community detail query', error);
  }
}

export async function createCommunity(
  ownerUid: string,
  payload: {
    name: string;
    description: string;
    artworkUrl?: string;
    animeMalId?: number | null;
    animeTitle?: string | null;
    genreTags?: string[];
  }
) {
  try {
    const cleanName = payload.name.trim().slice(0, 60);
    const cleanDesc = payload.description.trim().slice(0, 500);
    if (cleanName.length < 3) throw new Error('Guild name must be at least 3 characters.');
    if (cleanDesc.length < 10)
      throw new Error('Guild description must be at least 10 characters.');

    const baseSlug = cleanName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 42);
    const slug = `${baseSlug || 'guild'}-${Math.floor(100 + Math.random() * 900)}`;

    const [inserted] = await db
      .insert(communities)
      .values({
        slug,
        name: cleanName.toUpperCase(),
        description: cleanDesc,
        artworkUrl: payload.artworkUrl || 'asset:shadow_monarch',
        bannerUrl: payload.artworkUrl || 'asset:shadow_monarch',
        animeMalId: payload.animeMalId || null,
        animeTitle: payload.animeTitle || null,
        genreTags: Array.isArray(payload.genreTags) ? payload.genreTags.slice(0, 6) : ['Action'],
        ownerUid,
        isSeed: false,
        memberCount: 1,
        discussionCount: 0,
      })
      .returning();

    await db.insert(communityMemberships).values({
      communityId: inserted.id,
      userUid: ownerUid,
      role: 'owner',
    });

    return inserted;
  } catch (error: any) {
    if (error?.message?.includes('Guild')) throw error;
    sanitizeDbError('creating guild', error);
  }
}

export async function syncCommunityCounts(communityId: number) {
  const [mCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(communityMemberships)
    .where(eq(communityMemberships.communityId, communityId));
  const [dCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(discussions)
    .where(eq(discussions.communityId, communityId));

  await db
    .update(communities)
    .set({
      memberCount: mCount?.count || 0,
      discussionCount: dCount?.count || 0,
    })
    .where(eq(communities.id, communityId));

  return {
    memberCount: mCount?.count || 0,
    discussionCount: dCount?.count || 0,
  };
}

export async function joinOrLeaveCommunity(
  communityId: number,
  userUid: string,
  action: 'join' | 'leave'
) {
  try {
    if (action === 'join') {
      await db
        .insert(communityMemberships)
        .values({
          communityId,
          userUid,
          role: 'member',
        })
        .onConflictDoNothing();
    } else {
      await db
        .delete(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, communityId),
            eq(communityMemberships.userUid, userUid)
          )
        );
    }

    const counts = await syncCommunityCounts(communityId);
    return {
      isMember: action === 'join',
      ...counts,
    };
  } catch (error) {
    sanitizeDbError('guild membership update', error);
  }
}

// --- DISCUSSIONS & PULSE FEED ---
export async function listDiscussions(params: {
  communityId?: number;
  animeMalId?: number;
  kind?: string;
  feedTab?: string; // 'for_you' | 'following' | 'latest'
  sort?: string; // 'newest' | 'popular'
  q?: string;
  limit?: number;
  offset?: number;
  viewerUid?: string;
}) {
  try {
    const conditions = [eq(discussions.isArchived, false)];
    if (params.communityId) conditions.push(eq(discussions.communityId, params.communityId));
    if (params.animeMalId) conditions.push(eq(discussions.animeMalId, params.animeMalId));
    if (params.kind) conditions.push(eq(discussions.kind, params.kind));
    if (params.q?.trim()) {
      const p = `%${params.q.trim()}%`;
      conditions.push(or(ilike(discussions.title, p), ilike(discussions.content, p))!);
    }

    let viewerFollowingUids = new Set<string>();
    if (params.viewerUid) {
      const [blockRows, mutedRows, followRows] = await Promise.all([
        db
          .select({
            blockerUid: blockedUsers.blockerUid,
            blockedUid: blockedUsers.blockedUid,
          })
          .from(blockedUsers)
          .where(
            or(
              eq(blockedUsers.blockerUid, params.viewerUid),
              eq(blockedUsers.blockedUid, params.viewerUid)
            )
          ),
        db
          .select({ uid: mutedUsers.mutedUid })
          .from(mutedUsers)
          .where(eq(mutedUsers.muterUid, params.viewerUid)),
        db
          .select({ uid: userFollows.followingUid })
          .from(userFollows)
          .where(eq(userFollows.followerUid, params.viewerUid)),
      ]);

      viewerFollowingUids = new Set(followRows.map((f) => f.uid));

      const hiddenUids = Array.from(
        new Set([
          ...blockRows.map((b) =>
            b.blockerUid === params.viewerUid ? b.blockedUid : b.blockerUid
          ),
          ...mutedRows.map((m) => m.uid),
        ])
      );
      if (hiddenUids.length > 0) {
        conditions.push(
          sql`${discussions.authorUid} NOT IN (${sql.join(
            hiddenUids.map((id) => sql`${id}`),
            sql`, `
          )})`
        );
      }

      if (params.feedTab === 'following') {
        if (followRows.length === 0) return [];
        conditions.push(
          inArray(
            discussions.authorUid,
            followRows.map((f) => f.uid)
          )
        );
      }
    } else if (params.feedTab === 'following') {
      return [];
    }

    const orderClause =
      params.sort === 'popular' || params.feedTab === 'for_you'
        ? [desc(discussions.isPinned), desc(discussions.likeCount), desc(discussions.createdAt)]
        : [desc(discussions.isPinned), desc(discussions.createdAt)];

    const rows = await db
      .select({
        discussion: discussions,
        authorUsername: users.username,
        authorRole: users.role,
        authorDisplayName: profiles.displayName,
        authorAvatarUrl: profiles.avatarUrl,
        authorIsPrivate: profiles.isPrivate,
        communityName: communities.name,
        communitySlug: communities.slug,
      })
      .from(discussions)
      .innerJoin(users, eq(discussions.authorUid, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .leftJoin(communities, eq(discussions.communityId, communities.id))
      .where(and(...conditions))
      .orderBy(...orderClause)
      .limit(Math.min(params.limit || 25, 50))
      .offset(params.offset || 0);

    // Filter out private-account posts unless viewer is author or follower
    const visibleRows = rows.filter(
      (r) =>
        !r.authorIsPrivate ||
        r.discussion.authorUid === params.viewerUid ||
        viewerFollowingUids.has(r.discussion.authorUid)
    );

    let userReactions = new Set<string>();
    let userSaved = new Set<number>();
    if (params.viewerUid && visibleRows.length > 0) {
      const ids = visibleRows.map((r) => r.discussion.id);
      const [rRows, sRows] = await Promise.all([
        db
          .select()
          .from(reactions)
          .where(
            and(
              eq(reactions.userUid, params.viewerUid),
              eq(reactions.targetType, 'discussion'),
              inArray(reactions.targetId, ids)
            )
          ),
        db
          .select({ postId: savedPosts.postId })
          .from(savedPosts)
          .where(and(eq(savedPosts.userUid, params.viewerUid), inArray(savedPosts.postId, ids))),
      ]);
      userReactions = new Set(rRows.map((r) => `${r.targetId}:${r.reactionType}`));
      userSaved = new Set(sRows.map((s) => s.postId));
    }

    return visibleRows.map((r) => ({
      ...sanitizePostForViewer(r.discussion, params.viewerUid, false),
      author: {
        uid: r.discussion.authorUid,
        username: r.authorUsername,
        role: r.authorRole,
        displayName: r.authorDisplayName,
        avatarUrl: r.authorAvatarUrl,
      },
      community: r.communityName
        ? { id: r.discussion.communityId, name: r.communityName, slug: r.communitySlug }
        : null,
      viewerLiked: userReactions.has(`${r.discussion.id}:like`),
      viewerBookmarked:
        userSaved.has(r.discussion.id) || userReactions.has(`${r.discussion.id}:bookmark`),
      viewerSaved: userSaved.has(r.discussion.id),
      viewerReposted: userReactions.has(`${r.discussion.id}:repost`),
    }));
  } catch (error) {
    sanitizeDbError('discussions feed', error);
  }
}

export async function getDiscussionWithComments(discussionId: number, viewerUid?: string) {
  try {
    const [row] = await db
      .select({
        discussion: discussions,
        authorUsername: users.username,
        authorRole: users.role,
        authorDisplayName: profiles.displayName,
        authorAvatarUrl: profiles.avatarUrl,
        authorIsPrivate: profiles.isPrivate,
        authorCommentPerm: profiles.commentPermission,
        communityName: communities.name,
        communitySlug: communities.slug,
      })
      .from(discussions)
      .innerJoin(users, eq(discussions.authorUid, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .leftJoin(communities, eq(discussions.communityId, communities.id))
      .where(eq(discussions.id, discussionId))
      .limit(1);

    if (!row) return null;

    if (row.discussion.isArchived && row.discussion.authorUid !== viewerUid) {
      return null;
    }

    const blockState = await hasBlockBetween(viewerUid, row.discussion.authorUid);
    if (blockState.anyBlock) {
      return null;
    }

    if (row.authorIsPrivate && row.discussion.authorUid !== viewerUid) {
      if (!viewerUid) return null;
      const [follows] = await db
        .select({ id: userFollows.id })
        .from(userFollows)
        .where(
          and(
            eq(userFollows.followerUid, viewerUid),
            eq(userFollows.followingUid, row.discussion.authorUid)
          )
        )
        .limit(1);
      if (!follows) return null;
    }

    const commentRows = await db
      .select({
        comment: comments,
        authorUsername: users.username,
        authorRole: users.role,
        authorDisplayName: profiles.displayName,
        authorAvatarUrl: profiles.avatarUrl,
      })
      .from(comments)
      .innerJoin(users, eq(comments.authorUid, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(eq(comments.discussionId, discussionId))
      .orderBy(comments.createdAt);

    // Restricted user comments are visible only to the restricted commenter and the post owner
    const visibleComments = commentRows.filter(
      (c) =>
        !c.comment.isRestrictedShadow ||
        c.comment.authorUid === viewerUid ||
        row.discussion.authorUid === viewerUid
    );

    let viewerLiked = false;
    let viewerBookmarked = false;
    let viewerSaved = false;
    if (viewerUid) {
      const [rRows, sRows] = await Promise.all([
        db
          .select()
          .from(reactions)
          .where(
            and(
              eq(reactions.userUid, viewerUid),
              eq(reactions.targetType, 'discussion'),
              eq(reactions.targetId, discussionId)
            )
          ),
        db
          .select()
          .from(savedPosts)
          .where(and(eq(savedPosts.userUid, viewerUid), eq(savedPosts.postId, discussionId)))
          .limit(1),
      ]);
      viewerLiked = rRows.some((r) => r.reactionType === 'like');
      viewerSaved = Boolean(sRows[0]);
      viewerBookmarked = viewerSaved || rRows.some((r) => r.reactionType === 'bookmark');
    }

    return {
      ...sanitizePostForViewer(row.discussion, viewerUid, false),
      commentPermission: row.authorCommentPerm,
      author: {
        uid: row.discussion.authorUid,
        username: row.authorUsername,
        role: row.authorRole,
        displayName: row.authorDisplayName,
        avatarUrl: row.authorAvatarUrl,
      },
      community: row.communityName
        ? { id: row.discussion.communityId, name: row.communityName, slug: row.communitySlug }
        : null,
      viewerLiked,
      viewerBookmarked,
      viewerSaved,
      comments: visibleComments.map((c) => ({
        ...c.comment,
        author: {
          uid: c.comment.authorUid,
          username: c.authorUsername,
          role: c.authorRole,
          displayName: c.authorDisplayName,
          avatarUrl: c.authorAvatarUrl,
        },
      })),
    };
  } catch (error) {
    sanitizeDbError('discussion detail', error);
  }
}

export async function createDiscussionPost(
  authorUid: string,
  payload: {
    communityId?: number | null;
    animeMalId?: number | null;
    animeTitle?: string | null;
    genreTags?: string[];
    kind?: string;
    title: string;
    content: string;
    mediaUrl?: string | null;
    rating?: number | null;
  }
) {
  try {
    const cleanTitle = payload.title.trim().slice(0, 140);
    const cleanContent = payload.content.trim().slice(0, 4000);
    if (!cleanTitle && !cleanContent) {
      throw new Error('Post title or content is required.');
    }

    const [created] = await db
      .insert(discussions)
      .values({
        authorUid,
        communityId: payload.communityId || null,
        animeMalId: payload.animeMalId || null,
        animeTitle: payload.animeTitle || null,
        genreTags: Array.isArray(payload.genreTags) ? payload.genreTags.slice(0, 6) : [],
        kind: ['discussion', 'pulse', 'review', 'profile_post'].includes(payload.kind || '')
          ? payload.kind!
          : 'discussion',
        title: cleanTitle || cleanContent.slice(0, 80),
        content: cleanContent || cleanTitle,
        mediaUrl: payload.mediaUrl || null,
        mediaType: payload.mediaUrl ? 'image' : 'none',
        rating:
          typeof payload.rating === 'number'
            ? Math.max(1, Math.min(10, Math.round(payload.rating)))
            : null,
      })
      .returning();

    if (created.communityId) {
      await syncCommunityCounts(created.communityId);
    }

    return created;
  } catch (error: any) {
    if (error?.message?.includes('required')) throw error;
    sanitizeDbError('creating discussion', error);
  }
}

export async function deleteOrPinDiscussion(
  actorUid: string,
  discussionId: number,
  action: 'delete' | 'pin' | 'unpin'
) {
  try {
    const [disc] = await db
      .select()
      .from(discussions)
      .where(eq(discussions.id, discussionId))
      .limit(1);
    if (!disc) throw new Error('Discussion not found.');

    const [actorRow] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.uid, actorUid))
      .limit(1);
    const isGlobalAdmin = actorRow?.role === 'owner' || actorRow?.role === 'admin';

    let isModerator = isGlobalAdmin;
    if (!isModerator && disc.communityId) {
      const [m] = await db
        .select()
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, disc.communityId),
            eq(communityMemberships.userUid, actorUid)
          )
        )
        .limit(1);
      isModerator = m?.role === 'owner' || m?.role === 'moderator';
    }

    if (action === 'delete') {
      if (disc.authorUid !== actorUid && !isModerator) {
        throw new Error('Forbidden: Only the author, guild moderator, or KAGE Owner can remove this post.');
      }
      await db.delete(discussions).where(eq(discussions.id, discussionId));
      if (disc.communityId) await syncCommunityCounts(disc.communityId);
      return { deleted: true };
    } else {
      if (!isModerator) {
        throw new Error('Forbidden: Only guild moderators or the KAGE Owner can pin discussions.');
      }
      await db
        .update(discussions)
        .set({ isPinned: action === 'pin' })
        .where(eq(discussions.id, discussionId));
      return { isPinned: action === 'pin' };
    }
  } catch (error: any) {
    if (error?.message?.includes('Forbidden') || error?.message?.includes('not found')) {
      throw error;
    }
    sanitizeDbError('moderating discussion', error);
  }
}

export async function addCommentToDiscussion(
  authorUid: string,
  discussionId: number,
  content: string,
  parentCommentId?: number | null
) {
  try {
    const clean = content.trim().slice(0, 2000);
    if (!clean) throw new Error('Comment cannot be empty.');

    const [disc] = await db
      .select()
      .from(discussions)
      .where(eq(discussions.id, discussionId))
      .limit(1);
    if (!disc || (disc.isArchived && disc.authorUid !== authorUid)) {
      throw new Error('Discussion not found.');
    }

    const blockState = await hasBlockBetween(authorUid, disc.authorUid);
    if (blockState.anyBlock) {
      throw new Error('Forbidden: You cannot comment on this post.');
    }

    const [authorProf] = await db
      .select({ commentPermission: profiles.commentPermission })
      .from(profiles)
      .where(eq(profiles.userUid, disc.authorUid))
      .limit(1);

    if (disc.authorUid !== authorUid) {
      const perm = authorProf?.commentPermission || 'everyone';
      if (perm === 'nobody') {
        throw new Error('Comments are turned off by the post owner.');
      }
      if (perm === 'followers') {
        const [follows] = await db
          .select({ id: userFollows.id })
          .from(userFollows)
          .where(
            and(
              eq(userFollows.followerUid, authorUid),
              eq(userFollows.followingUid, disc.authorUid)
            )
          )
          .limit(1);
        if (!follows) {
          throw new Error('Only followers of this hunter can comment on their posts.');
        }
      }
    }

    // Check if post owner restricted this commenter
    let isRestrictedShadow = false;
    if (disc.authorUid !== authorUid) {
      const [restRow] = await db
        .select({ id: restrictedUsers.id })
        .from(restrictedUsers)
        .where(
          and(
            eq(restrictedUsers.restricterUid, disc.authorUid),
            eq(restrictedUsers.restrictedUid, authorUid)
          )
        )
        .limit(1);
      isRestrictedShadow = Boolean(restRow);
    }

    const [created] = await db
      .insert(comments)
      .values({
        discussionId,
        authorUid,
        parentCommentId: parentCommentId || null,
        content: clean,
        isRestrictedShadow,
      })
      .returning();

    const [cCount] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(eq(comments.discussionId, discussionId), eq(comments.isRestrictedShadow, false)));

    await db
      .update(discussions)
      .set({ commentCount: cCount?.count || 0, updatedAt: new Date() })
      .where(eq(discussions.id, discussionId));

    if (!isRestrictedShadow) {
      const [actor] = await db
        .select({ displayName: profiles.displayName })
        .from(profiles)
        .where(eq(profiles.userUid, authorUid))
        .limit(1);

      if (parentCommentId) {
        const [parent] = await db
          .select()
          .from(comments)
          .where(eq(comments.id, parentCommentId))
          .limit(1);
        if (parent && parent.authorUid !== authorUid) {
          await createNotification({
            recipientUid: parent.authorUid,
            actorUid: authorUid,
            type: 'reply',
            title: `${actor?.displayName || 'Someone'} replied to your comment`,
            body: `"${clean.slice(0, 90)}"`,
            linkUrl: `/pulse?discussion=${discussionId}`,
          });
        }
      } else if (disc.authorUid !== authorUid) {
        await createNotification({
          recipientUid: disc.authorUid,
          actorUid: authorUid,
          type: 'comment',
          title: `${actor?.displayName || 'Someone'} commented on your post`,
          body: `"${clean.slice(0, 90)}"`,
          linkUrl: `/pulse?discussion=${discussionId}`,
        });
      }
    }

    return created;
  } catch (error: any) {
    if (
      error?.message?.includes('Comment') ||
      error?.message?.includes('comment') ||
      error?.message?.includes('Forbidden') ||
      error?.message?.includes('not found') ||
      error?.message?.includes('followers')
    ) {
      throw error;
    }
    sanitizeDbError('posting comment', error);
  }
}

export async function toggleReactionOnTarget(
  userUid: string,
  targetType: 'discussion' | 'comment',
  targetId: number,
  reactionType: 'like' | 'bookmark' | 'repost'
) {
  try {
    if (targetType === 'discussion') {
      const [disc] = await db
        .select({ authorUid: discussions.authorUid, isArchived: discussions.isArchived })
        .from(discussions)
        .where(eq(discussions.id, targetId))
        .limit(1);
      if (!disc || (disc.isArchived && disc.authorUid !== userUid)) {
        throw new Error('Post not found.');
      }
      const blockState = await hasBlockBetween(userUid, disc.authorUid);
      if (blockState.anyBlock) {
        throw new Error('Forbidden: Cannot react to this post.');
      }
    }

    const existing = await db
      .select()
      .from(reactions)
      .where(
        and(
          eq(reactions.userUid, userUid),
          eq(reactions.targetType, targetType),
          eq(reactions.targetId, targetId),
          eq(reactions.reactionType, reactionType)
        )
      )
      .limit(1);

    let active = false;
    if (existing.length > 0) {
      await db.delete(reactions).where(eq(reactions.id, existing[0].id));
      active = false;
    } else {
      await db
        .insert(reactions)
        .values({ userUid, targetType, targetId, reactionType })
        .onConflictDoNothing();
      active = true;
    }

    if (targetType === 'discussion' && reactionType === 'bookmark') {
      if (active) {
        await db
          .insert(savedPosts)
          .values({ userUid, postId: targetId })
          .onConflictDoNothing();
      } else {
        await db
          .delete(savedPosts)
          .where(and(eq(savedPosts.userUid, userUid), eq(savedPosts.postId, targetId)));
      }
    }

    if (targetType === 'discussion') {
      const [likes, reposts] = await Promise.all([
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(reactions)
          .where(
            and(
              eq(reactions.targetType, 'discussion'),
              eq(reactions.targetId, targetId),
              eq(reactions.reactionType, 'like')
            )
          ),
        db
          .select({ count: sql<number>`count(*)::int` })
          .from(reactions)
          .where(
            and(
              eq(reactions.targetType, 'discussion'),
              eq(reactions.targetId, targetId),
              eq(reactions.reactionType, 'repost')
            )
          ),
      ]);

      await db
        .update(discussions)
        .set({
          likeCount: likes[0]?.count || 0,
          repostCount: reposts[0]?.count || 0,
        })
        .where(eq(discussions.id, targetId));

      if (active && reactionType === 'like') {
        const [disc] = await db
          .select()
          .from(discussions)
          .where(eq(discussions.id, targetId))
          .limit(1);
        if (disc && disc.authorUid !== userUid) {
          const [actor] = await db
            .select({ displayName: profiles.displayName })
            .from(profiles)
            .where(eq(profiles.userUid, userUid))
            .limit(1);
          await createNotification({
            recipientUid: disc.authorUid,
            actorUid: userUid,
            type: 'reaction',
            title: `${actor?.displayName || 'Someone'} liked your post`,
            body: `"${disc.title.slice(0, 80)}"`,
            linkUrl: `/pulse?discussion=${targetId}`,
          });
        }
      }

      return {
        active,
        likeCount: likes[0]?.count || 0,
        repostCount: reposts[0]?.count || 0,
      };
    } else {
      const [likes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reactions)
        .where(
          and(
            eq(reactions.targetType, 'comment'),
            eq(reactions.targetId, targetId),
            eq(reactions.reactionType, 'like')
          )
        );
      await db
        .update(comments)
        .set({ likeCount: likes?.count || 0 })
        .where(eq(comments.id, targetId));
      return { active, likeCount: likes?.count || 0 };
    }
  } catch (error: any) {
    if (error?.message?.includes('Forbidden') || error?.message?.includes('not found')) {
      throw error;
    }
    sanitizeDbError('reaction update', error);
  }
}

// --- VOICE ROOMS (DELEGATED TO 12-SEAT STANDALONE VOICE/VIDEO ENGINE) ---
export async function listActiveVoiceRooms(q?: string) {
  return await listStandaloneVoiceRooms({ q });
}

export async function getVoiceRoomDetail(roomId: number, viewerUid?: string) {
  return await getVoiceRoomFullDetail(roomId, viewerUid);
}

export async function createVoiceRoomRecord(
  hostUid: string,
  payload: {
    title: string;
    topic?: string;
    description?: string;
    category?: string;
    artworkUrl?: string;
    avatarUrl?: string;
    communityId?: number | null;
    capacity?: number;
  }
) {
  return await createStandaloneVoiceRoom(hostUid, payload);
}

export async function upsertVoiceParticipant(
  roomId: number,
  userUid: string,
  role: 'host' | 'co_host' | 'moderator' | 'speaker' | 'listener',
  isMuted: boolean
) {
  return await joinVoiceRoomSession(roomId, userUid, {
    requestedRole: role,
    isMuted,
  });
}

export async function removeVoiceParticipant(roomId: number, userUid: string) {
  return await leaveVoiceRoomSession(roomId, userUid);
}

export async function moderateVoiceRoom(
  actorUid: string,
  roomId: number,
  action:
    | 'close'
    | 'end_room'
    | 'kick'
    | 'ban'
    | 'unban'
    | 'set_role'
    | 'force_mute'
    | 'mute_all'
    | 'move_to_audience'
    | 'invite_to_stage'
    | 'promote_cohost'
    | 'demote_cohost',
  targetUid?: string,
  newRole?: 'speaker' | 'listener' | 'co_host' | 'moderator'
) {
  return await moderateVoiceRoomParticipant(actorUid, roomId, {
    action,
    targetUid,
    newRole,
  });
}

// --- CLASHES ---
export async function listClashes(viewerUid?: string) {
  try {
    const rows = await db.select().from(clashes).orderBy(desc(clashes.createdAt)).limit(25);
    let voteMap = new Map<number, string>();
    if (viewerUid && rows.length > 0) {
      const vRows = await db
        .select()
        .from(clashVotes)
        .where(eq(clashVotes.userUid, viewerUid));
      voteMap = new Map(vRows.map((v) => [v.clashId, v.side]));
    }
    return rows.map((c) => ({
      ...c,
      viewerVote: voteMap.get(c.id) || null,
    }));
  } catch (error) {
    sanitizeDbError('clashes list', error);
  }
}

export async function createClashChallenge(
  creatorUid: string,
  payload: {
    title: string;
    category: string;
    leftName: string;
    leftImageUrl?: string;
    rightName: string;
    rightImageUrl?: string;
    genreTags?: string[];
  }
) {
  try {
    const [created] = await db
      .insert(clashes)
      .values({
        title: payload.title.trim().slice(0, 100) || `${payload.leftName} vs ${payload.rightName}`,
        category: payload.category.trim().slice(0, 50) || 'Who Can Win Fight?',
        leftName: payload.leftName.trim().toUpperCase().slice(0, 40),
        leftSubtitle: 'Challenger',
        leftImageUrl: payload.leftImageUrl || 'asset:shadow_monarch',
        rightName: payload.rightName.trim().toUpperCase().slice(0, 40),
        rightSubtitle: 'Accepter',
        rightImageUrl: payload.rightImageUrl || 'asset:thunder',
        genreTags: payload.genreTags || ['Action'],
        creatorUid,
        leftVotes: 0,
        rightVotes: 0,
      })
      .returning();
    return created;
  } catch (error) {
    sanitizeDbError('creating clash', error);
  }
}

export async function castClashVote(
  userUid: string,
  clashId: number,
  side: 'left' | 'right'
) {
  try {
    await db
      .insert(clashVotes)
      .values({ clashId, userUid, side })
      .onConflictDoUpdate({
        target: [clashVotes.clashId, clashVotes.userUid],
        set: { side, createdAt: new Date() },
      });

    const [leftRes, rightRes] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(clashVotes)
        .where(and(eq(clashVotes.clashId, clashId), eq(clashVotes.side, 'left'))),
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(clashVotes)
        .where(and(eq(clashVotes.clashId, clashId), eq(clashVotes.side, 'right'))),
    ]);

    const leftVotes = leftRes[0]?.count || 0;
    const rightVotes = rightRes[0]?.count || 0;

    const [updated] = await db
      .update(clashes)
      .set({ leftVotes, rightVotes })
      .where(eq(clashes.id, clashId))
      .returning();

    return { ...updated, viewerVote: side };
  } catch (error) {
    sanitizeDbError('casting clash vote', error);
  }
}

// --- ANIME WATCHLIST, RATINGS & TASTE SIGNALS ---
export async function upsertUserAnimeEntry(
  userUid: string,
  payload: {
    animeMalId: number;
    animeTitle: string;
    animeImageUrl: string;
    genres: string[];
    status: string;
    score?: number | null;
    episodesWatched?: number;
  }
) {
  try {
    const validStatuses = ['watching', 'completed', 'plan_to_watch', 'on_hold', 'dropped', 'favorited'];
    const status = validStatuses.includes(payload.status) ? payload.status : 'plan_to_watch';
    const score =
      typeof payload.score === 'number' && payload.score >= 1 && payload.score <= 10
        ? Math.round(payload.score)
        : null;

    const [row] = await db
      .insert(userAnimeEntries)
      .values({
        userUid,
        animeMalId: payload.animeMalId,
        animeTitle: payload.animeTitle,
        animeImageUrl: payload.animeImageUrl,
        genres: payload.genres || [],
        status,
        score,
        episodesWatched: Math.max(0, payload.episodesWatched || 0),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userAnimeEntries.userUid, userAnimeEntries.animeMalId],
        set: {
          status,
          score,
          genres: payload.genres || [],
          episodesWatched: Math.max(0, payload.episodesWatched || 0),
          updatedAt: new Date(),
        },
      })
      .returning();

    return row;
  } catch (error) {
    sanitizeDbError('saving anime list entry', error);
  }
}

export async function removeUserAnimeEntry(userUid: string, animeMalId: number) {
  try {
    await db
      .delete(userAnimeEntries)
      .where(
        and(eq(userAnimeEntries.userUid, userUid), eq(userAnimeEntries.animeMalId, animeMalId))
      );
    return { removed: true };
  } catch (error) {
    sanitizeDbError('removing anime entry', error);
  }
}

export async function upsertUserGenreRating(
  userUid: string,
  genre: string,
  rating: number
) {
  try {
    const clamped = Math.max(1, Math.min(10, Math.round(rating)));
    const [row] = await db
      .insert(userGenreRatings)
      .values({
        userUid,
        genre: genre.trim(),
        rating: clamped,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [userGenreRatings.userUid, userGenreRatings.genre],
        set: { rating: clamped, updatedAt: new Date() },
      })
      .returning();
    return row;
  } catch (error) {
    sanitizeDbError('rating genre', error);
  }
}

export async function listUserAnimeAndGenreState(userUid: string) {
  try {
    const [entries, genreRates] = await Promise.all([
      db
        .select()
        .from(userAnimeEntries)
        .where(eq(userAnimeEntries.userUid, userUid))
        .orderBy(desc(userAnimeEntries.updatedAt)),
      db
        .select()
        .from(userGenreRatings)
        .where(eq(userGenreRatings.userUid, userUid))
        .orderBy(desc(userGenreRatings.rating)),
    ]);
    return { entries, genreRatings: genreRates };
  } catch (error) {
    sanitizeDbError('fetching user taste state', error);
  }
}

export async function gatherUserTasteSignals(userUid: string): Promise<UserTasteSignals> {
  try {
    const [
      profileRows,
      animeRows,
      genreRows,
      guildRows,
      authoredRows,
      reactedDiscussionRows,
      votedClashRows,
    ] = await Promise.all([
      db.select().from(profiles).where(eq(profiles.userUid, userUid)).limit(1),
      db.select().from(userAnimeEntries).where(eq(userAnimeEntries.userUid, userUid)),
      db.select().from(userGenreRatings).where(eq(userGenreRatings.userUid, userUid)),
      db
        .select({
          name: communities.name,
          animeMalId: communities.animeMalId,
          genreTags: communities.genreTags,
        })
        .from(communityMemberships)
        .innerJoin(communities, eq(communityMemberships.communityId, communities.id))
        .where(eq(communityMemberships.userUid, userUid)),
      db
        .select({
          animeMalId: discussions.animeMalId,
          animeTitle: discussions.animeTitle,
          genreTags: discussions.genreTags,
        })
        .from(discussions)
        .where(eq(discussions.authorUid, userUid))
        .limit(40),
      db
        .select({ genreTags: discussions.genreTags })
        .from(reactions)
        .innerJoin(discussions, eq(reactions.targetId, discussions.id))
        .where(and(eq(reactions.userUid, userUid), eq(reactions.targetType, 'discussion')))
        .limit(40),
      db
        .select({ genreTags: clashes.genreTags })
        .from(clashVotes)
        .innerJoin(clashes, eq(clashVotes.clashId, clashes.id))
        .where(eq(clashVotes.userUid, userUid))
        .limit(20),
    ]);

    const interactedGenres: string[] = [];
    for (const r of reactedDiscussionRows) {
      interactedGenres.push(...(r.genreTags || []));
    }
    for (const v of votedClashRows) {
      interactedGenres.push(...(v.genreTags || []));
    }

    return {
      animeEntries: animeRows.map((a) => ({
        animeMalId: a.animeMalId,
        animeTitle: a.animeTitle,
        genres: a.genres || [],
        status: a.status,
        score: a.score,
        episodesWatched: a.episodesWatched,
      })),
      genreRatings: genreRows.map((g) => ({ genre: g.genre, rating: g.rating })),
      favoriteGenres: profileRows[0]?.favoriteGenres || [],
      joinedGuilds: guildRows,
      authoredPosts: authoredRows,
      interactedGenres,
    };
  } catch (error) {
    sanitizeDbError('analyzing recommendation signals', error);
  }
}

// --- NOTIFICATIONS ---
export async function createNotification(params: {
  recipientUid: string;
  actorUid?: string | null;
  type: string;
  title: string;
  body?: string;
  linkUrl?: string;
}) {
  try {
    if (params.actorUid && params.type !== 'announcement') {
      const blockState = await hasBlockBetween(params.recipientUid, params.actorUid);
      if (blockState.anyBlock) return null;

      const [muted] = await db
        .select({ id: mutedUsers.id })
        .from(mutedUsers)
        .where(
          and(
            eq(mutedUsers.muterUid, params.recipientUid),
            eq(mutedUsers.mutedUid, params.actorUid)
          )
        )
        .limit(1);
      if (muted) return null;
    }

    const [settings] = await db
      .select()
      .from(userSettings)
      .where(eq(userSettings.userUid, params.recipientUid))
      .limit(1);

    if (settings) {
      if (params.type === 'follow' && !settings.notifyFollows) return null;
      if ((params.type === 'comment' || params.type === 'reply') && !settings.notifyComments)
        return null;
      if (params.type === 'reaction' && !settings.notifyReactions) return null;
      if (params.type === 'mention' && settings.notifyMentions === false) return null;
      if (
        (params.type === 'repost' || params.type === 'quote_repost') &&
        settings.notifyReposts === false
      )
        return null;
      if (
        (params.type === 'direct_message' || params.type === 'message_request') &&
        settings.notifyMessages === false
      )
        return null;
      if (params.type === 'challenge' && settings.notifyChallenges === false) return null;
      if (params.type === 'guild_activity' && !settings.notifyGuilds) return null;
      if (params.type === 'new_post' && !settings.notifyCommunity) return null;
      if (params.type === 'voice_invite' && !settings.notifyVoiceInvites) return null;
    }

    const [created] = await db
      .insert(notifications)
      .values({
        recipientUid: params.recipientUid,
        actorUid: params.actorUid || null,
        type: params.type,
        title: params.title,
        body: params.body || '',
        linkUrl: params.linkUrl || '/',
      })
      .returning();
    return created;
  } catch (error) {
    console.error('Notification insert failed:', error);
    return null;
  }
}

export async function listNotificationsForUser(uid: string) {
  try {
    const rows = await db
      .select({
        notification: notifications,
        actorUsername: users.username,
        actorRole: users.role,
        actorDisplayName: profiles.displayName,
        actorAvatarUrl: profiles.avatarUrl,
      })
      .from(notifications)
      .leftJoin(users, eq(notifications.actorUid, users.uid))
      .leftJoin(profiles, eq(users.uid, profiles.userUid))
      .where(eq(notifications.recipientUid, uid))
      .orderBy(desc(notifications.createdAt))
      .limit(50);

    return rows.map((r) => ({
      ...r.notification,
      actor: r.actorUsername
        ? {
            uid: r.notification.actorUid,
            username: r.actorUsername,
            role: r.actorRole,
            displayName: r.actorDisplayName,
            avatarUrl: r.actorAvatarUrl,
          }
        : null,
    }));
  } catch (error) {
    sanitizeDbError('notifications list', error);
  }
}

export async function markNotificationsRead(uid: string, notificationId?: number) {
  try {
    if (notificationId) {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(
          and(eq(notifications.recipientUid, uid), eq(notifications.id, notificationId))
        );
    } else {
      await db
        .update(notifications)
        .set({ isRead: true })
        .where(eq(notifications.recipientUid, uid));
    }
    return { ok: true };
  } catch (error) {
    sanitizeDbError('marking notifications read', error);
  }
}

// --- INBOX / CONVERSATIONS ---
export async function listConversationsForUser(uid: string) {
  try {
    const memberships = await db
      .select()
      .from(conversationMembers)
      .where(eq(conversationMembers.userUid, uid));
    if (memberships.length === 0) return [];

    const convIds = memberships.map((m) => m.conversationId);
    const [convs, allMembers, recentMsgs] = await Promise.all([
      db
        .select()
        .from(conversations)
        .where(inArray(conversations.id, convIds))
        .orderBy(desc(conversations.updatedAt)),
      db
        .select({
          conversationId: conversationMembers.conversationId,
          uid: users.uid,
          username: users.username,
          role: users.role,
          displayName: profiles.displayName,
          avatarUrl: profiles.avatarUrl,
        })
        .from(conversationMembers)
        .innerJoin(users, eq(conversationMembers.userUid, users.uid))
        .innerJoin(profiles, eq(users.uid, profiles.userUid))
        .where(inArray(conversationMembers.conversationId, convIds)),
      db
        .select()
        .from(messages)
        .where(inArray(messages.conversationId, convIds))
        .orderBy(desc(messages.createdAt)),
    ]);

    return convs.map((c) => {
      const myMember = memberships.find((m) => m.conversationId === c.id);
      const participants = allMembers.filter((m) => m.conversationId === c.id);
      const peer = participants.find((p) => p.uid !== uid) || participants[0];
      const convMsgs = recentMsgs.filter((m) => m.conversationId === c.id);
      const lastMsg = convMsgs[0] || null;
      const unreadCount = myMember
        ? convMsgs.filter(
            (m) => m.senderUid !== uid && m.createdAt > myMember.lastReadAt
          ).length
        : 0;

      return {
        ...c,
        displayTitle: c.isGroup ? c.title || 'Squad Chat' : peer?.displayName || 'Hunter',
        displayAvatar: c.isGroup
          ? c.avatarUrl || 'asset:shadow_monarch'
          : peer?.avatarUrl || 'asset:avatar_default',
        participants,
        lastMessage: lastMsg,
        unreadCount,
      };
    });
  } catch (error) {
    sanitizeDbError('inbox conversations', error);
  }
}

export async function startOrGetConversation(
  creatorUid: string,
  targetUids: string[],
  groupTitle?: string
) {
  try {
    const uniqueTargets = Array.from(new Set(targetUids.filter((id) => id && id !== creatorUid)));
    if (uniqueTargets.length === 0) {
      throw new Error('Select at least one hunter to message.');
    }

    const isGroup = uniqueTargets.length > 1 || Boolean(groupTitle?.trim());
    if (!isGroup) {
      const peerUid = uniqueTargets[0];
      const myConvs = await db
        .select()
        .from(conversationMembers)
        .where(eq(conversationMembers.userUid, creatorUid));
      for (const mc of myConvs) {
        const [conv] = await db
          .select()
          .from(conversations)
          .where(and(eq(conversations.id, mc.conversationId), eq(conversations.isGroup, false)))
          .limit(1);
        if (!conv) continue;
        const [peerMem] = await db
          .select()
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, conv.id),
              eq(conversationMembers.userUid, peerUid)
            )
          )
          .limit(1);
        if (peerMem) return conv;
      }
    }

    const [created] = await db
      .insert(conversations)
      .values({
        title: isGroup ? groupTitle?.trim() || 'Anime Squad' : null,
        isGroup,
      })
      .returning();

    for (const memberUid of [creatorUid, ...uniqueTargets]) {
      await db
        .insert(conversationMembers)
        .values({ conversationId: created.id, userUid: memberUid })
        .onConflictDoNothing();
    }
    return created;
  } catch (error: any) {
    if (error?.message?.includes('Select at least')) throw error;
    sanitizeDbError('starting conversation', error);
  }
}

export async function getMessagesInConversation(uid: string, conversationId: number) {
  try {
    const [mem] = await db
      .select()
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userUid, uid)
        )
      )
      .limit(1);
    if (!mem) throw new Error('Forbidden: You are not a member of this conversation.');

    await db
      .update(conversationMembers)
      .set({ lastReadAt: new Date() })
      .where(eq(conversationMembers.id, mem.id));

    return await db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderUid: messages.senderUid,
        content: messages.content,
        createdAt: messages.createdAt,
        senderUsername: users.username,
        senderRole: users.role,
        senderDisplayName: profiles.displayName,
        senderAvatarUrl: profiles.avatarUrl,
      })
      .from(messages)
      .innerJoin(users, eq(messages.senderUid, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt)
      .limit(100);
  } catch (error: any) {
    if (error?.message?.includes('Forbidden')) throw error;
    sanitizeDbError('reading messages', error);
  }
}

export async function sendMessageInConversation(
  senderUid: string,
  conversationId: number,
  content: string
) {
  try {
    const clean = content.trim().slice(0, 2000);
    if (!clean) throw new Error('Message cannot be empty.');

    const members = await db
      .select()
      .from(conversationMembers)
      .where(eq(conversationMembers.conversationId, conversationId));
    if (!members.some((m) => m.userUid === senderUid)) {
      throw new Error('Forbidden: Not in conversation.');
    }

    const [msg] = await db
      .insert(messages)
      .values({ conversationId, senderUid, content: clean })
      .returning();

    await db
      .update(conversations)
      .set({ updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));

    await db
      .update(conversationMembers)
      .set({ lastReadAt: new Date() })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userUid, senderUid)
        )
      );

    return {
      message: msg,
      recipientUids: members.map((m) => m.userUid).filter((u) => u !== senderUid),
    };
  } catch (error: any) {
    if (error?.message?.includes('Forbidden') || error?.message?.includes('empty')) throw error;
    sanitizeDbError('sending message', error);
  }
}

// --- REPORTS, SEARCH USERS & ACCOUNT DELETION ---
export async function submitContentReport(
  reporterUid: string,
  payload: { targetType: string; targetId: string; reason: string; details?: string }
) {
  try {
    const [created] = await db
      .insert(reports)
      .values({
        reporterUid,
        targetType: payload.targetType,
        targetId: String(payload.targetId),
        reason: payload.reason.trim().slice(0, 120),
        details: (payload.details || '').trim().slice(0, 1000),
      })
      .returning();
    return created;
  } catch (error) {
    sanitizeDbError('submitting report', error);
  }
}

export async function searchExactPeopleForUnifiedSearch(
  rawQuery: string,
  viewerUid?: string
): Promise<{
  people: {
    uid: string;
    kageId: string | null;
    username: string;
    role: string;
    displayName: string;
    avatarUrl: string;
    bio: string;
    shadowLabel: string;
  }[];
  isExplicitPersonQuery: boolean;
  queryKind: 'empty' | 'username' | 'user_id' | 'general';
}> {
  try {
    const trimmed = rawQuery.trim();
    if (!trimmed) {
      return { people: [], isExplicitPersonQuery: false, queryKind: 'empty' };
    }

    const isAtUsername = trimmed.startsWith('@');
    const kageIdMatch = !isAtUsername ? /^kage[-_]?d?0*(\d+)$/i.exec(trimmed) : null;
    const isDemoKageId = !isAtUsername && /^kage[-_]?d/i.test(trimmed);

    let matchCond: any = null;
    let isExplicitPersonQuery = false;
    let queryKind: 'empty' | 'username' | 'user_id' | 'general' = 'general';

    if (isAtUsername) {
      const handle = normalizeKageUsername(trimmed);
      isExplicitPersonQuery = true;
      queryKind = 'username';
      if (!handle) {
        return { people: [], isExplicitPersonQuery: true, queryKind: 'username' };
      }
      matchCond = or(
        sql`lower(${users.username}) = ${handle}`,
        eq(users.usernameNormalized, handle)
      );
    } else if (kageIdMatch) {
      isExplicitPersonQuery = true;
      queryKind = 'user_id';
      const digits = kageIdMatch[1];
      const paddedKageId = isDemoKageId
        ? `KAGE-D${digits.padStart(7, '0')}`
        : `KAGE-${digits.padStart(8, '0')}`;
      const seqNum = Number(digits);
      const idConds: any[] = [
        sql`upper(${users.kageId}) = ${trimmed.toUpperCase()}`,
        eq(users.kageId, paddedKageId),
        sql`lower(${users.uid}) = ${trimmed.toLowerCase()}`,
      ];
      if (!isDemoKageId && Number.isSafeInteger(seqNum) && seqNum > 0) {
        idConds.push(
          sql`${users.uid} IN (SELECT ${kageIdLedger.userUid} FROM ${kageIdLedger} WHERE ${kageIdLedger.seq} = ${seqNum})`
        );
      }
      matchCond = or(...idConds);
    } else if (!/\s/.test(trimmed) && trimmed.length >= 3) {
      // Exact unique UID or exact KAGE ID lookup without fuzzy matching usernames or anime titles
      matchCond = or(
        eq(users.uid, trimmed),
        sql`lower(${users.uid}) = ${trimmed.toLowerCase()}`,
        sql`upper(${users.kageId}) = ${trimmed.toUpperCase()}`
      );
    } else {
      return { people: [], isExplicitPersonQuery: false, queryKind: 'general' };
    }

    // Filter out accounts that have blocked the viewer (unless viewer is looking up themselves)
    let blockedByTargetSet = new Set<string>();
    if (viewerUid) {
      const bRows = await db
        .select({ blockerUid: blockedUsers.blockerUid })
        .from(blockedUsers)
        .where(eq(blockedUsers.blockedUid, viewerUid));
      blockedByTargetSet = new Set(bRows.map((b) => b.blockerUid));
    }

    const rows = await db
      .select({
        uid: users.uid,
        kageId: users.kageId,
        username: users.username,
        role: users.role,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
        bio: profiles.bio,
        shadowLabel: profiles.shadowLabel,
        shadowBadgePublic: profiles.shadowBadgePublic,
      })
      .from(users)
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(matchCond)
      .limit(10);

    const people = rows
      .filter((r) => r.uid === viewerUid || !blockedByTargetSet.has(r.uid))
      .map((r) => ({
        uid: r.uid,
        kageId: r.kageId,
        username: r.username,
        role: r.role,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl,
        bio: r.bio,
        shadowLabel: r.shadowBadgePublic ? r.shadowLabel : '',
      }));

    if (!isExplicitPersonQuery && people.length > 0) {
      // Matched an exact unique user UID/ID
      isExplicitPersonQuery = true;
      queryKind = 'user_id';
    }

    return { people, isExplicitPersonQuery, queryKind };
  } catch (error) {
    sanitizeDbError('searching people', error);
  }
}

export async function searchUsersDirectory(q: string, excludeUid?: string) {
  try {
    const trimmed = q.trim();
    const clean = trimmed.replace(/^@+/, '');
    const kageIdMatch = /^kage[-_]?d?0*(\d+)$/i.exec(trimmed);
    const isDemoKageId = /^kage[-_]?d/i.test(trimmed);
    const paddedKageId = kageIdMatch
      ? isDemoKageId
        ? `KAGE-D${kageIdMatch[1].padStart(7, '0')}`
        : `KAGE-${kageIdMatch[1].padStart(8, '0')}`
      : null;

    const conds: any[] = [];
    if (clean) {
      const p = `%${clean}%`;
      const orParts: any[] = [
        ilike(users.username, p),
        ilike(profiles.displayName, p),
        eq(users.uid, trimmed),
        sql`upper(${users.kageId}) = ${trimmed.toUpperCase()}`,
      ];
      if (paddedKageId) {
        orParts.push(eq(users.kageId, paddedKageId));
      }
      conds.push(or(...orParts));
    }
    if (excludeUid) {
      conds.push(ne(users.uid, excludeUid));
      const blockRows = await db
        .select({
          blockerUid: blockedUsers.blockerUid,
          blockedUid: blockedUsers.blockedUid,
        })
        .from(blockedUsers)
        .where(
          or(
            eq(blockedUsers.blockerUid, excludeUid),
            eq(blockedUsers.blockedUid, excludeUid)
          )
        );
      const blockedSet = Array.from(
        new Set(
          blockRows.map((b) =>
            b.blockerUid === excludeUid ? b.blockedUid : b.blockerUid
          )
        )
      );
      if (blockedSet.length > 0) {
        conds.push(
          sql`${users.uid} NOT IN (${sql.join(
            blockedSet.map((id) => sql`${id}`),
            sql`, `
          )})`
        );
      }
    }

    const rows = await db
      .select({
        uid: users.uid,
        kageId: users.kageId,
        username: users.username,
        role: users.role,
        isAiDemo: users.isAiDemo,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
        bio: profiles.bio,
        shadowLabel: profiles.shadowLabel,
        shadowBadgePublic: profiles.shadowBadgePublic,
        discoverable: userSettings.discoverableInSearch,
      })
      .from(users)
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .leftJoin(userSettings, eq(users.uid, userSettings.userUid))
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(
        sql`CASE WHEN ${users.role} = 'owner' THEN 0 WHEN ${users.role} = 'admin' THEN 1 ELSE 2 END`,
        asc(users.isAiDemo),
        desc(users.createdAt)
      )
      .limit(30);

    return rows
      .filter(
        (r) =>
          r.discoverable !== false ||
          r.username.toLowerCase() === clean.toLowerCase() ||
          r.kageId?.toUpperCase() === trimmed.toUpperCase() ||
          r.kageId === paddedKageId
      )
      .slice(0, 25)
      .map((r) => ({
        uid: r.uid,
        kageId: r.kageId,
        username: r.username,
        role: r.role,
        isAiDemo: r.isAiDemo,
        displayName: r.displayName,
        avatarUrl: r.avatarUrl,
        bio: r.bio,
        shadowLabel: r.shadowBadgePublic ? r.shadowLabel : '',
      }));
  } catch (error) {
    sanitizeDbError('searching users', error);
  }
}

export async function deleteAccountPermanently(uid: string) {
  if (uid === OWNER_UID) {
    throw new Error('The Sovereign Owner account cannot be deleted.');
  }
  try {
    const memberships = await db
      .select({ communityId: communityMemberships.communityId })
      .from(communityMemberships)
      .where(eq(communityMemberships.userUid, uid));

    await db.delete(users).where(eq(users.uid, uid));

    for (const m of memberships) {
      await syncCommunityCounts(m.communityId);
    }
    return { deleted: true };
  } catch (error) {
    sanitizeDbError('deleting account', error);
  }
}

// ============================================================================
// SERVER CREDENTIAL AUTHENTICATION, OWNER BOOTSTRAP & SOVEREIGN ADMIN PANEL
// ============================================================================

async function setStoredPasswordHash(uid: string, password: string) {
  const hash = hashPasswordScrypt(password);
  const pwdKey = `pwd:${uid}`;
  await db
    .insert(sessions)
    .values({
      userUid: uid,
      sessionId: pwdKey,
      userAgent: hash,
    })
    .onConflictDoUpdate({
      target: sessions.sessionId,
      set: {
        userUid: uid,
        userAgent: hash,
        lastActiveAt: new Date(),
        revokedAt: null,
      },
    });
}

async function getStoredPasswordHash(uid: string): Promise<string | null> {
  const [row] = await db
    .select({ hash: sessions.userAgent })
    .from(sessions)
    .where(eq(sessions.sessionId, `pwd:${uid}`))
    .limit(1);
  return row?.hash || null;
}

export async function ensureOwnerAndSeedData() {
  try {
    // 1. Ensure Sovereign Owner Account (yaseenahmd1107@gmail.com / YAS33N AHM9D)
    const [existingByEmail] = await db
      .select()
      .from(users)
      .where(ilike(users.email, OWNER_EMAIL))
      .limit(1);

    const ownerTargetUid = existingByEmail?.uid || OWNER_UID;

    // Free username 'yaseen' if held by a seed placeholder
    const [usernameHolder] = await db
      .select()
      .from(users)
      .where(eq(users.username, OWNER_USERNAME))
      .limit(1);
    if (usernameHolder && usernameHolder.uid !== ownerTargetUid) {
      await db
        .update(users)
        .set({ username: `${OWNER_USERNAME}_hunter` })
        .where(eq(users.uid, usernameHolder.uid));
    }

    await db
      .insert(users)
      .values({
        uid: ownerTargetUid,
        email: OWNER_EMAIL,
        username: OWNER_USERNAME,
        usernameNormalized: OWNER_USERNAME.toLowerCase(),
        role: 'owner',
        emailVerified: true,
        isSeed: false,
      })
      .onConflictDoUpdate({
        target: users.uid,
        set: {
          email: OWNER_EMAIL,
          username: OWNER_USERNAME,
          usernameNormalized: OWNER_USERNAME.toLowerCase(),
          role: 'owner',
          emailVerified: true,
          updatedAt: new Date(),
        },
      });

    await ensureKageIdForUser(ownerTargetUid);

    const [existingOwnerProfile] = await db
      .select()
      .from(profiles)
      .where(eq(profiles.userUid, ownerTargetUid))
      .limit(1);

    if (!existingOwnerProfile) {
      await db.insert(profiles).values({
        userUid: ownerTargetUid,
        displayName: OWNER_DISPLAY_NAME,
        bio: OWNER_BIO,
        avatarUrl: '/assets/zenitsu-avatar.png',
        bannerUrl: '/assets/extracted/solo-hero-home.jpg',
        favoriteGenres: [
          'Action',
          'Dark Fantasy',
          'Fantasy',
          'Supernatural',
          'Sci-Fi',
          'Cyberpunk',
          'Romance',
          'Seinen',
        ],
        isPrivate: false,
        showActivity: true,
        showWatchlist: true,
      });
    } else if (
      !existingOwnerProfile.bio ||
      existingOwnerProfile.bio === 'Exploring the Anime Universe on KAGE.'
    ) {
      await db
        .update(profiles)
        .set({
          displayName:
            existingOwnerProfile.displayName === OWNER_USERNAME
              ? OWNER_DISPLAY_NAME
              : existingOwnerProfile.displayName,
          bio: OWNER_BIO,
          avatarUrl:
            existingOwnerProfile.avatarUrl === 'asset:avatar_default'
              ? '/assets/zenitsu-avatar.png'
              : existingOwnerProfile.avatarUrl,
          bannerUrl:
            existingOwnerProfile.bannerUrl === 'asset:shadow_monarch'
              ? '/assets/extracted/solo-hero-home.jpg'
              : existingOwnerProfile.bannerUrl,
        })
        .where(eq(profiles.userUid, ownerTargetUid));
    }

    await db
      .insert(userSettings)
      .values({
        userUid: ownerTargetUid,
        themeAccent: 'gold',
      })
      .onConflictDoNothing();

    const existingOwnerHash = await getStoredPasswordHash(ownerTargetUid);
    if (!existingOwnerHash || !existingOwnerHash.startsWith('scrypt:')) {
      await setStoredPasswordHash(ownerTargetUid, OWNER_PASSWORD);
    }

    // 2. Upgrade existing seed Guilds / Voice Rooms / Clashes / PULSE artwork to exact extracted real anime assets
    await db
      .update(communities)
      .set({
        artworkUrl: '/assets/extracted/guild-shadow.jpg',
        bannerUrl: '/assets/extracted/guild-shadow.jpg',
      })
      .where(ilike(communities.name, '%SHADOW MONARCHS%'));

    await db
      .update(communities)
      .set({
        artworkUrl: '/assets/extracted/guild-infinity.jpg',
        bannerUrl: '/assets/extracted/guild-infinity.jpg',
      })
      .where(ilike(communities.name, '%INFINITY CASTLE%'));

    await db
      .update(communities)
      .set({
        artworkUrl: '/assets/extracted/guild-wings.jpg',
        bannerUrl: '/assets/extracted/guild-wings.jpg',
      })
      .where(ilike(communities.name, '%WINGS OF FREEDOM%'));

    // Ensure the 3 flagship Guilds exist if database had none
    const existingGuilds = await db.select({ id: communities.id }).from(communities).limit(3);
    if (existingGuilds.length === 0) {
      const seedGuilds = [
        {
          slug: 'shadow-monarchs',
          name: 'SHADOW MONARCHS',
          description:
            'Arise. Official Solo Leveling & Dark Fantasy hunters guild analyzing S-Rank raids, shadow extractions, and monarch lore.',
          artworkUrl: '/assets/extracted/guild-shadow.jpg',
          bannerUrl: '/assets/extracted/guild-shadow.jpg',
          animeMalId: 52299,
          animeTitle: 'Solo Leveling',
          genreTags: ['Action', 'Dark Fantasy', 'Fantasy'],
        },
        {
          slug: 'infinity-castle',
          name: 'INFINITY CASTLE',
          description:
            'Demon Slayer Corps headquarters. Breathing styles, Hashira rankings, ufotable sakuga breakdowns, and final arc hype.',
          artworkUrl: '/assets/extracted/guild-infinity.jpg',
          bannerUrl: '/assets/extracted/guild-infinity.jpg',
          animeMalId: 38000,
          animeTitle: 'Demon Slayer: Kimetsu no Yaiba',
          genreTags: ['Action', 'Supernatural', 'Historical', 'Shounen'],
        },
        {
          slug: 'wings-of-freedom',
          name: 'WINGS OF FREEDOM',
          description:
            'Dedicate your hearts. Attack on Titan & Seinen masterwork discussions, Survey Corps lore, and soundtrack appreciation.',
          artworkUrl: '/assets/extracted/guild-wings.jpg',
          bannerUrl: '/assets/extracted/guild-wings.jpg',
          animeMalId: 16498,
          animeTitle: 'Attack on Titan',
          genreTags: ['Action', 'Dark Fantasy', 'Suspense', 'Military'],
        },
      ];
      for (const g of seedGuilds) {
        const [ins] = await db
          .insert(communities)
          .values({
            ...g,
            ownerUid: ownerTargetUid,
            isSeed: true,
            memberCount: 1,
            discussionCount: 0,
          })
          .onConflictDoNothing()
          .returning();
        if (ins) {
          await db
            .insert(communityMemberships)
            .values({
              communityId: ins.id,
              userUid: ownerTargetUid,
              role: 'owner',
            })
            .onConflictDoNothing();
        }
      }
    }

    // Ensure flagship verified "Anime Universe" (@anime-universe) community exists and is provisioned with 6 Chat Rooms & Events
    const [existingAnimeUniverse] = await db
      .select()
      .from(communities)
      .where(
        or(
          eq(communities.slug, 'anime-universe'),
          eq(communities.nameNormalized, 'anime universe')
        )
      )
      .limit(1);

    let animeUniverseId = existingAnimeUniverse?.id || null;
    if (!existingAnimeUniverse) {
      const [createdAu] = await db
        .insert(communities)
        .values({
          slug: 'anime-universe',
          name: 'Anime Universe',
          nameNormalized: 'anime universe',
          tagline: 'Different Worlds · Same Passion ✨',
          description:
            'The ultimate anime community! Discuss, share, and explore everything anime. From classic to new, this is your home. ✨',
          category: 'Anime Community',
          rules:
            '1. Keep discussions respectful.\n2. Tag manga spoilers in non-spoiler rooms.\n3. Credit artists on edits and fan art.',
          privacyMode: 'public',
          joinPolicy: 'open',
          isVerified: true,
          artworkUrl: 'asset:anime_universe_crest',
          bannerUrl: 'asset:anime_universe_banner',
          chatBannerUrl: 'asset:anime_chat_banner',
          genreTags: ['Action', 'Fantasy', 'Romance', 'Sci-Fi'],
          ownerUid: ownerTargetUid,
          isSeed: true,
          memberCount: 1,
          discussionCount: 0,
        })
        .returning({ id: communities.id });
      animeUniverseId = createdAu?.id || null;
    } else {
      await db
        .update(communities)
        .set({
          name: 'Anime Universe',
          nameNormalized: 'anime universe',
          tagline: 'Different Worlds · Same Passion ✨',
          isVerified: true,
          artworkUrl: 'asset:anime_universe_crest',
          bannerUrl: 'asset:anime_universe_banner',
          chatBannerUrl: 'asset:anime_chat_banner',
        })
        .where(eq(communities.id, existingAnimeUniverse.id));
    }

    if (animeUniverseId) {
      await db
        .insert(communityMemberships)
        .values({
          communityId: animeUniverseId,
          userUid: ownerTargetUid,
          role: 'owner',
        })
        .onConflictDoNothing();

      await ensureDefaultCommunityChatRooms(animeUniverseId, ownerTargetUid);

      const existingAuPosts = await db
        .select({ id: discussions.id })
        .from(discussions)
        .where(eq(discussions.communityId, animeUniverseId))
        .limit(1);

      if (existingAuPosts.length === 0) {
        await db.insert(discussions).values({
          authorUid: ownerTargetUid,
          communityId: animeUniverseId,
          kind: 'guild',
          title: 'Welcome to Anime Universe! 👑',
          content:
            "This is a place for all anime lovers! 🌟 Feel free to share your thoughts, edits, theories, and favorite moments.\n\nLet's keep it respectful and enjoy the journey together! 💙",
          mediaUrl: 'asset:pinned_welcome_thumb',
          mediaType: 'image',
          genreTags: ['Action', 'Fantasy'],
          isPinned: true,
        });
      }

      const [generalRoom] = await db
        .select()
        .from(communityChatRooms)
        .where(
          and(
            eq(communityChatRooms.communityId, animeUniverseId),
            eq(communityChatRooms.slug, 'general')
          )
        )
        .limit(1);

      if (generalRoom) {
        const existingMsgs = await db
          .select({ id: communityChatMessages.id })
          .from(communityChatMessages)
          .where(eq(communityChatMessages.roomId, generalRoom.id))
          .limit(1);
        if (existingMsgs.length === 0) {
          await db.insert(communityChatMessages).values({
            roomId: generalRoom.id,
            communityId: animeUniverseId,
            senderUid: ownerTargetUid,
            content:
              'Welcome to #general in Anime Universe! Drop your current top 3 anime and say hey to fellow hunters.',
          });
        }
      }

      const existingEvents = await db
        .select({ id: communityEvents.id })
        .from(communityEvents)
        .where(eq(communityEvents.communityId, animeUniverseId))
        .limit(1);

      if (existingEvents.length === 0) {
        const [ev] = await db
          .insert(communityEvents)
          .values({
            communityId: animeUniverseId,
            creatorUid: ownerTargetUid,
            title: 'Seasonal Premiere Watch Party & Top Openings Tier List',
            description:
              'Live community hangout in the Voice Stage + #anime-discussion thread for seasonal premieres.',
            eventType: 'watch_party',
            startsAt: new Date(Date.now() + 48 * 3600 * 1000),
            locationLabel: 'Anime Universe Live Stage',
            rsvpCount: 1,
          })
          .returning({ id: communityEvents.id });
        if (ev) {
          await db
            .insert(communityEventRsvps)
            .values({ eventId: ev.id, userUid: ownerTargetUid, status: 'going' })
            .onConflictDoNothing();
        }
      }

      await syncCommunityCounts(animeUniverseId);
    }

    // Ensure all other communities also have their 6 default chat rooms provisioned
    const allGuildsList = await db.select({ id: communities.id }).from(communities).limit(10);
    for (const g of allGuildsList) {
      await ensureDefaultCommunityChatRooms(g.id, ownerTargetUid);
      await syncCommunityCounts(g.id);
    }

    // Ensure standalone 12-seat Voice Room exists with full cover & avatar metadata
    const activeRooms = await db
      .select()
      .from(voiceRooms)
      .where(eq(voiceRooms.isActive, true))
      .limit(3);
    if (activeRooms.length === 0) {
      await db.insert(voiceRooms).values({
        title: 'Anime Vibes Lounge',
        topic: 'Chill anime talk, top 3 debates, OSTs & manga reactions — open 12-speaker stage!',
        description:
          'Chill anime talk, top 3 debates, OSTs & manga reactions — open 12-speaker stage!',
        category: 'Anime Vibes',
        mediaMode: 'voice',
        speakerLimit: 12,
        avatarUrl: '/assets/zenitsu-avatar.png',
        artworkUrl: '/assets/extracted/zenitsu-live-room.jpg',
        hostUid: ownerTargetUid,
        capacity: 120,
        isActive: true,
        isSeed: true,
      });
    } else {
      await db
        .update(voiceRooms)
        .set({
          artworkUrl: '/assets/extracted/zenitsu-live-room.jpg',
          avatarUrl: '/assets/zenitsu-avatar.png',
          speakerLimit: 12,
          category: 'Anime Vibes',
        })
        .where(ilike(voiceRooms.title, '%DOMAIN%'));
    }

    // Ensure flagship Clash uses exact Jin-Woo vs Gojo artwork AND repair any clashes corrupted by prior un-ordered limit(2) update
    const findCharacterPortrait = (name: string): string | null => {
      const clean = name.trim().toLowerCase();
      if (!clean) return null;
      const exact = CURATED_ANIME_CHARACTERS.find((c) => c.name.toLowerCase() === clean);
      if (exact) return exact.imageUrl;
      const partial = CURATED_ANIME_CHARACTERS.find(
        (c) =>
          clean.includes(c.name.toLowerCase()) ||
          c.name.toLowerCase().includes(clean)
      );
      return partial ? partial.imageUrl : null;
    };

    const existingClashes = await db.select().from(clashes).orderBy(asc(clashes.id));
    if (existingClashes.length === 0) {
      await db.insert(clashes).values({
        title: 'Sung Jin-Woo vs Satoru Gojo',
        category: 'Who Can Win Fight?',
        leftName: 'SUNG JIN-WOO',
        leftSubtitle: 'Challenger',
        leftImageUrl: '/assets/extracted/clash-jinwoo.jpg',
        rightName: 'SATORU GOJO',
        rightSubtitle: 'Accepter',
        rightImageUrl: '/assets/extracted/clash-gojo.jpg',
        genreTags: ['Action', 'Dark Fantasy', 'Supernatural'],
        creatorUid: ownerTargetUid,
        leftVotes: 14,
        rightVotes: 12,
      });
    } else {
      for (const row of existingClashes) {
        const lName = (row.leftName || '').toLowerCase();
        const rName = (row.rightName || '').toLowerCase();
        const patch: { leftImageUrl?: string; rightImageUrl?: string } = {};

        if (lName.includes('jin-woo') || lName.includes('jinwoo')) {
          if (row.leftImageUrl !== '/assets/extracted/clash-jinwoo.jpg') {
            patch.leftImageUrl = '/assets/extracted/clash-jinwoo.jpg';
          }
        } else if (
          row.leftImageUrl === '/assets/extracted/clash-jinwoo.jpg' ||
          row.leftImageUrl === '/assets/extracted/clash-gojo.jpg'
        ) {
          const matchedLeft = findCharacterPortrait(row.leftName);
          if (matchedLeft) patch.leftImageUrl = matchedLeft;
        }

        if (rName.includes('gojo')) {
          if (row.rightImageUrl !== '/assets/extracted/clash-gojo.jpg') {
            patch.rightImageUrl = '/assets/extracted/clash-gojo.jpg';
          }
        } else if (
          row.rightImageUrl === '/assets/extracted/clash-jinwoo.jpg' ||
          row.rightImageUrl === '/assets/extracted/clash-gojo.jpg'
        ) {
          const matchedRight = findCharacterPortrait(row.rightName);
          if (matchedRight) patch.rightImageUrl = matchedRight;
        }

        if (patch.leftImageUrl || patch.rightImageUrl) {
          await db.update(clashes).set(patch).where(eq(clashes.id, row.id));
        }
      }
    }

    // Ensure Owner has a pinned Sovereign Proclamation in PULSE
    const ownerPosts = await db
      .select({ id: discussions.id })
      .from(discussions)
      .where(eq(discussions.authorUid, ownerTargetUid))
      .limit(1);

    if (ownerPosts.length === 0) {
      await db.insert(discussions).values({
        authorUid: ownerTargetUid,
        animeMalId: 52299,
        animeTitle: 'Solo Leveling',
        genreTags: ['Action', 'Dark Fantasy', 'Supernatural'],
        kind: 'pulse',
        title: 'Welcome to KAGE — The Anime Universe',
        content:
          'Welcome to KAGE. Every realm, all 28 anime genres, live WebRTC voice rooms, fandom guilds, and Clash arenas are officially open. Claim your guild, calibrate your taste engine, and make your mark.',
        mediaUrl: '/assets/extracted/pulse-hashira.jpg',
        isPinned: true,
      });
    }
  } catch (err) {
    console.error('Owner & seed bootstrap warning:', err);
  }
}

export async function loginWithServerCredentials(params: {
  identifier: string;
  password: string;
  userAgent: string;
}) {
  const cleanId = params.identifier.trim().toLowerCase();
  const cleanHandle = normalizeKageUsername(cleanId);
  const rawPassword = params.password;
  if (!cleanId || !rawPassword) {
    throw new Error('Enter your email or username and password.');
  }

  // Check if logging into Sovereign Owner account
  if (cleanId === OWNER_EMAIL.toLowerCase() || cleanHandle === OWNER_USERNAME.toLowerCase()) {
    await ensureOwnerAndSeedData();
    const [ownerRow] = await db
      .select()
      .from(users)
      .where(or(ilike(users.email, OWNER_EMAIL), eq(users.username, OWNER_USERNAME)))
      .limit(1);

    const targetUid = ownerRow?.uid || OWNER_UID;
    const storedHash = await getStoredPasswordHash(targetUid);
    const matchesOwnerMaster = rawPassword === OWNER_PASSWORD;
    const matchesStored = storedHash ? verifyPasswordScrypt(rawPassword, storedHash) : false;

    if (!matchesOwnerMaster && !matchesStored) {
      throw new Error('Incorrect email/username or password.');
    }

    const bundle = await getFullUserBundle(targetUid);
    if (!bundle) throw new Error('Unable to load Owner account.');

    const sessionId = `${bundle.user.uid}:${Date.now()}:${crypto.randomBytes(6).toString('hex')}`;
    await recordUserSession(bundle.user.uid, sessionId, params.userAgent);

    const token = signServerToken({
      uid: bundle.user.uid,
      email: bundle.user.email,
      name: bundle.profile?.displayName || OWNER_DISPLAY_NAME,
      picture: bundle.profile?.avatarUrl,
      email_verified: true,
      role: 'owner',
      sid: sessionId,
    });

    return { token, ...bundle };
  }

  // Regular user lookup by email or normalized username
  const [foundUser] = await db
    .select()
    .from(users)
    .where(
      cleanId.includes('@')
        ? ilike(users.email, cleanId)
        : sql`lower(${users.username}) = ${cleanHandle}`
    )
    .limit(1);

  if (!foundUser) {
    throw new Error('Incorrect email/username or password.');
  }

  const storedHash = await getStoredPasswordHash(foundUser.uid);
  if (!storedHash || !verifyPasswordScrypt(rawPassword, storedHash)) {
    throw new Error('Incorrect email/username or password.');
  }

  const bundle = await getFullUserBundle(foundUser.uid);
  if (!bundle) throw new Error('Account profile not found.');

  const sessionId = `${bundle.user.uid}:${Date.now()}:${crypto.randomBytes(6).toString('hex')}`;
  await recordUserSession(bundle.user.uid, sessionId, params.userAgent);

  const token = signServerToken({
    uid: bundle.user.uid,
    email: bundle.user.email,
    name: bundle.profile?.displayName || bundle.user.username,
    picture: bundle.profile?.avatarUrl,
    email_verified: bundle.user.emailVerified,
    role: bundle.user.role,
    sid: sessionId,
  });

  return { token, ...bundle };
}

export async function registerWithServerCredentials(params: {
  name?: string;
  displayName?: string;
  username: string;
  email: string;
  password: string;
  favouriteCharacter?: string;
  favouriteCharacterAnime?: string;
  favouriteCharacterMalId?: number | null;
  avatarUrl?: string;
  shadowQualities?: unknown;
  userAgent: string;
}) {
  const chosenDisplayName = String(params.name || params.displayName || '')
    .trim()
    .slice(0, 50);
  const rawUsername = params.username.trim().replace(/^@+/, '');
  const cleanUsername = normalizeKageUsername(rawUsername);
  const cleanEmail = params.email.trim().toLowerCase();
  const rawPassword = params.password;
  const favChar = String(params.favouriteCharacter || '').trim().slice(0, 80);

  if (!chosenDisplayName) {
    throw new Error('Please enter your name.');
  }
  if (!/^[a-zA-Z0-9_.-]{3,24}$/.test(rawUsername)) {
    throw new Error('Username must be 3–24 characters (letters, numbers, _, ., -).');
  }
  if (!cleanEmail.includes('@') || cleanEmail.length < 5) {
    throw new Error('Enter a valid email address.');
  }
  if (rawPassword.length < 8) {
    throw new Error('Password must be at least 8 characters.');
  }
  if (cleanEmail === OWNER_EMAIL.toLowerCase() || cleanUsername === OWNER_USERNAME.toLowerCase()) {
    throw new Error('This account belongs to the KAGE Owner. Please sign in on the Login screen.');
  }

  const computedShadow = validateAndComputeShadowIdentity(params.shadowQualities);

  const usernameCheck = await checkUsernameAvailability(cleanUsername);
  if (!usernameCheck.available) {
    throw new Error(usernameCheck.reason || 'That username is already claimed.');
  }

  const [existingEmail] = await db
    .select({ uid: users.uid })
    .from(users)
    .where(ilike(users.email, cleanEmail))
    .limit(1);
  if (existingEmail) {
    throw new Error('An account with this email already exists. Try signing in instead.');
  }

  const chosenAvatar =
    params.avatarUrl && isApprovedCatalogueImageUrl(params.avatarUrl)
      ? params.avatarUrl
      : '/assets/zenitsu-avatar.png';

  const uid = `kage_${crypto.randomUUID().replace(/-/g, '').slice(0, 20)}`;
  const bundle = await getOrCreateAccount({
    uid,
    email: cleanEmail,
    preferredUsername: rawUsername,
    displayName: chosenDisplayName,
    avatarUrl: chosenAvatar,
    avatarSource:
      chosenAvatar === '/assets/zenitsu-avatar.png' ? 'default' : 'catalogue',
    favouriteCharacter: favChar,
    favouriteCharacterAnime: String(params.favouriteCharacterAnime || '').trim().slice(0, 120),
    favouriteCharacterMalId: params.favouriteCharacterMalId ?? null,
    shadowQualities: computedShadow.qualities,
    shadowLabel: computedShadow.label,
    emailVerified: true,
  });

  if (!bundle) throw new Error('Account creation failed.');
  await setStoredPasswordHash(uid, rawPassword);

  const sessionId = `${uid}:${Date.now()}:${crypto.randomBytes(6).toString('hex')}`;
  await recordUserSession(uid, sessionId, params.userAgent);

  const token = signServerToken({
    uid: bundle.user.uid,
    email: bundle.user.email,
    name: bundle.profile?.displayName || cleanUsername,
    picture: bundle.profile?.avatarUrl,
    email_verified: true,
    role: bundle.user.role,
    sid: sessionId,
  });

  return { token, ...bundle };
}

export async function authenticateWithGoogleIdentity(params: {
  googleSub: string;
  email: string;
  displayName?: string;
  avatarUrl?: string;
  emailVerified?: boolean;
  preferredUsername?: string;
  userAgent: string;
}) {
  const cleanEmail = params.email.trim().toLowerCase();
  if (!cleanEmail || !cleanEmail.includes('@')) {
    throw new Error('Google account did not provide a valid email address.');
  }

  const candidateGoogleUid = params.googleSub.startsWith('google_')
    ? params.googleSub
    : `google_${params.googleSub}`;

  // Link seamlessly to an existing KAGE account with the same email or UID
  const [existingAccount] = await db
    .select()
    .from(users)
    .where(
      or(
        ilike(users.email, cleanEmail),
        eq(users.uid, params.googleSub),
        eq(users.uid, candidateGoogleUid)
      )
    )
    .limit(1);

  const targetUid =
    existingAccount?.uid ||
    (cleanEmail === OWNER_EMAIL.toLowerCase() ? OWNER_UID : candidateGoogleUid);

  if (cleanEmail === OWNER_EMAIL.toLowerCase()) {
    await ensureOwnerAndSeedData();
  }

  const bundle = await getOrCreateAccount({
    uid: targetUid,
    email: cleanEmail,
    preferredUsername: existingAccount ? undefined : params.preferredUsername,
    displayName: params.displayName || undefined,
    avatarUrl: params.avatarUrl || undefined,
    emailVerified: params.emailVerified ?? true,
  });

  if (!bundle) {
    throw new Error('Failed to synchronize Google account with KAGE.');
  }

  const sessionId = `${bundle.user.uid}:${Date.now()}:${crypto.randomBytes(6).toString('hex')}`;
  await recordUserSession(bundle.user.uid, sessionId, params.userAgent);

  const token = signServerToken({
    uid: bundle.user.uid,
    email: bundle.user.email,
    name: bundle.profile?.displayName || bundle.user.username,
    picture: bundle.profile?.avatarUrl,
    email_verified: true,
    role: bundle.user.role,
    sid: sessionId,
  });

  return { token, ...bundle };
}

export async function changeServerPassword(
  uid: string,
  currentPassword: string,
  newPassword: string
) {
  if (!newPassword || newPassword.length < 8) {
    throw new Error('New password must be at least 8 characters.');
  }
  const [userRow] = await db.select().from(users).where(eq(users.uid, uid)).limit(1);
  if (!userRow) throw new Error('User not found.');

  const stored = await getStoredPasswordHash(uid);
  const isOwnerMatch =
    userRow.role === 'owner' && currentPassword === OWNER_PASSWORD;
  const isStoredMatch = stored ? verifyPasswordScrypt(currentPassword, stored) : false;

  if (stored && !isOwnerMatch && !isStoredMatch) {
    throw new Error('Current password is incorrect.');
  }

  await setStoredPasswordHash(uid, newPassword);
  return { updated: true };
}

// --- SOVEREIGN ADMIN CONTROL PANEL QUERIES & ACTIONS ---
export async function getAdminDashboardOverview(onlineUserUids: string[]) {
  try {
    const onlineSet = new Set(onlineUserUids);

    const [
      allUsers,
      userTotalsRes,
      postTotalsRes,
      recentPosts,
      allGuilds,
      activeRooms,
      allClashes,
      allReports,
      commentCountRes,
      announcementRows,
    ] = await Promise.all([
      db
        .select({
          uid: users.uid,
          email: users.email,
          username: users.username,
          role: users.role,
          emailVerified: users.emailVerified,
          isSeed: users.isSeed,
          isAiDemo: users.isAiDemo,
          createdAt: users.createdAt,
          displayName: profiles.displayName,
          avatarUrl: profiles.avatarUrl,
          bio: profiles.bio,
        })
        .from(users)
        .leftJoin(profiles, eq(users.uid, profiles.userUid))
        .orderBy(
          sql`CASE WHEN ${users.role} = 'owner' THEN 0 WHEN ${users.role} = 'admin' THEN 1 WHEN ${users.role} = 'moderator' THEN 2 ELSE 3 END`,
          asc(users.isAiDemo),
          desc(users.createdAt)
        )
        .limit(100),
      db.select({
        total: sql<number>`count(*)::int`,
        human: sql<number>`count(*) FILTER (WHERE ${users.isAiDemo} = false)::int`,
        aiDemo: sql<number>`count(*) FILTER (WHERE ${users.isAiDemo} = true)::int`,
      }).from(users),
      db.select({
        total: sql<number>`count(*) FILTER (WHERE ${discussions.isArchived} = false)::int`,
      }).from(discussions),
      db
        .select({
          id: discussions.id,
          title: discussions.title,
          content: discussions.content,
          kind: discussions.kind,
          mediaUrl: discussions.mediaUrl,
          isPinned: discussions.isPinned,
          isAiGenerated: discussions.isAiGenerated,
          likeCount: discussions.likeCount,
          commentCount: discussions.commentCount,
          createdAt: discussions.createdAt,
          authorUid: discussions.authorUid,
          authorUsername: users.username,
          authorDisplayName: profiles.displayName,
          authorRole: users.role,
          authorIsAiDemo: users.isAiDemo,
        })
        .from(discussions)
        .innerJoin(users, eq(discussions.authorUid, users.uid))
        .innerJoin(profiles, eq(users.uid, profiles.userUid))
        .orderBy(desc(discussions.isPinned), desc(discussions.createdAt))
        .limit(50),
      db.select().from(communities).orderBy(desc(communities.memberCount)).limit(50),
      listActiveVoiceRooms(),
      db.select().from(clashes).orderBy(desc(clashes.createdAt)).limit(30),
      db
        .select({
          report: reports,
          reporterUsername: users.username,
        })
        .from(reports)
        .leftJoin(users, eq(reports.reporterUid, users.uid))
        .orderBy(desc(reports.createdAt))
        .limit(50),
      db.select({ count: sql<number>`count(*)::int` }).from(comments),
      db
        .select({
          title: notifications.title,
          body: notifications.body,
          linkUrl: notifications.linkUrl,
          createdAt: sql<string>`max(${notifications.createdAt})`,
          recipients: sql<number>`count(*)::int`,
        })
        .from(notifications)
        .where(eq(notifications.type, 'announcement'))
        .groupBy(notifications.title, notifications.body, notifications.linkUrl)
        .orderBy(desc(sql`max(${notifications.createdAt})`))
        .limit(15),
    ]);

    return {
      stats: {
        totalUsers: userTotalsRes[0]?.total || allUsers.length,
        humanUsers: userTotalsRes[0]?.human || 0,
        aiDemoUsers: userTotalsRes[0]?.aiDemo || 0,
        onlineUsers: onlineUserUids.length,
        totalPosts: postTotalsRes[0]?.total || recentPosts.length,
        totalComments: commentCountRes[0]?.count || 0,
        totalGuilds: allGuilds.length,
        activeVoiceRooms: activeRooms.length,
        totalClashes: allClashes.length,
        openReports: allReports.filter((r) => r.report.status === 'open').length,
        totalAnnouncements: announcementRows.length,
      },
      users: allUsers.map((u) => ({
        ...u,
        isOnline: onlineSet.has(u.uid),
      })),
      posts: recentPosts,
      guilds: allGuilds,
      voiceRooms: activeRooms,
      clashes: allClashes,
      reports: allReports.map((r) => ({
        ...r.report,
        reporterUsername: r.reporterUsername || 'unknown',
      })),
      announcements: announcementRows,
    };
  } catch (error) {
    sanitizeDbError('admin dashboard overview', error);
  }
}

export async function broadcastOwnerAnnouncement(
  actorUid: string,
  payload: {
    title: string;
    body: string;
    linkUrl?: string;
    pinToPulse?: boolean;
    mediaUrl?: string | null;
  }
) {
  const cleanTitle = payload.title.trim().slice(0, 140);
  const cleanBody = payload.body.trim().slice(0, 2000);
  if (!cleanTitle || !cleanBody) {
    throw new Error('Announcement title and message body are required.');
  }

  try {
    const allUserRows = await db
      .select({ uid: users.uid })
      .from(users)
      .where(eq(users.isAiDemo, false));
    let pinnedPost = null;
    let targetLink = (payload.linkUrl || '').trim() || '/pulse';

    if (payload.pinToPulse) {
      const [createdPost] = await db
        .insert(discussions)
        .values({
          authorUid: actorUid,
          kind: 'pulse',
          title: cleanTitle,
          content: cleanBody,
          mediaUrl: payload.mediaUrl || null,
          genreTags: ['Action'],
          isPinned: true,
        })
        .returning();
      pinnedPost = createdPost;
      if (!payload.linkUrl?.trim() && createdPost) {
        targetLink = `/pulse?discussion=${createdPost.id}`;
      }
    }

    if (allUserRows.length > 0) {
      await db.insert(notifications).values(
        allUserRows.map((u) => ({
          recipientUid: u.uid,
          actorUid,
          type: 'announcement',
          title: `👑 ${cleanTitle}`,
          body: cleanBody,
          linkUrl: targetLink,
          isRead: false,
        }))
      );
    }

    return {
      recipientCount: allUserRows.length,
      linkUrl: targetLink,
      pinnedPost,
    };
  } catch (error) {
    sanitizeDbError('broadcasting global announcement', error);
  }
}

export async function adminSetUserRole(
  actorUid: string,
  targetUid: string,
  newRole: 'owner' | 'admin' | 'moderator' | 'user'
) {
  const [targetUser] = await db.select().from(users).where(eq(users.uid, targetUid)).limit(1);
  if (!targetUser) throw new Error('Target user not found.');
  if (
    targetUser.uid === OWNER_UID ||
    targetUser.email.toLowerCase() === OWNER_EMAIL.toLowerCase()
  ) {
    if (newRole !== 'owner') {
      throw new Error('Sovereign Owner role cannot be revoked from the Founder account.');
    }
  }

  const [actorUser] = await db.select().from(users).where(eq(users.uid, actorUid)).limit(1);
  if (newRole === 'owner' && actorUser?.role !== 'owner') {
    throw new Error('Only the Sovereign Owner can grant Owner status.');
  }

  await db
    .update(users)
    .set({ role: newRole, updatedAt: new Date() })
    .where(eq(users.uid, targetUid));

  return { uid: targetUid, role: newRole };
}

export async function adminDeleteGuild(communityId: number) {
  await db.delete(communities).where(eq(communities.id, communityId));
  return { deleted: true };
}

export async function adminDeleteClash(clashId: number) {
  await db.delete(clashes).where(eq(clashes.id, clashId));
  return { deleted: true };
}

export async function adminResolveReport(reportId: number, status: 'resolved' | 'dismissed') {
  const [updated] = await db
    .update(reports)
    .set({ status })
    .where(eq(reports.id, reportId))
    .returning();
  return updated;
}
