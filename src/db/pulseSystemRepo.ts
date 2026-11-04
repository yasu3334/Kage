import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  blockedUsers,
  comments,
  communities,
  communityMemberships,
  discussionPollVotes,
  discussions,
  guildBans,
  mediaAssets,
  mutedUsers,
  notifications,
  profileAlertPrefs,
  profiles,
  pulseReposts,
  reactions,
  restrictedUsers,
  savedPosts,
  userFollows,
  users,
  userSettings,
  type DiscussionPollOption,
  type PulseCharacterTag,
  type PulseMediaItem,
} from './schema.ts';
import {
  HttpError,
  deleteMediaAssetById,
  hasBlockBetween,
  normalizeKageUsername,
  sanitizePostForViewer,
} from './profileSystemRepo.ts';
import { createNotification, syncCommunityCounts } from './repository.ts';
import { getAiCommunityConfig } from './aiCommunityRepo.ts';
import { isApprovedCatalogueImageUrl } from '../server/characterCatalogue.ts';
import { getStickerById, isValidStickerId } from '../lib/kageStickers.ts';
import { signMediaUrlForViewer, uploadValidatedMediaAsset } from '../server/mediaAccess.ts';

function extractHashtags(text: string): string[] {
  const matches = text.match(/#([a-zA-Z0-9_]{2,32})/g) || [];
  return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase()))).slice(0, 10);
}

async function resolveMentionedUsers(
  text: string,
  actorUid: string
): Promise<{ uid: string; username: string }[]> {
  const matches = text.match(/@([a-zA-Z0-9_.-]{3,24})/g) || [];
  const handles = Array.from(
    new Set(matches.map((m) => normalizeKageUsername(m)).filter(Boolean))
  ).slice(0, 10);
  if (handles.length === 0) return [];

  const found = await db
    .select({ uid: users.uid, username: users.username })
    .from(users)
    .where(
      sql`lower(${users.username}) IN (${sql.join(
        handles.map((h) => sql`${h}`),
        sql`, `
      )})`
    );

  const valid: { uid: string; username: string }[] = [];
  for (const row of found) {
    if (row.uid === actorUid) continue;
    const block = await hasBlockBetween(actorUid, row.uid);
    if (!block.anyBlock) {
      valid.push(row);
    }
  }
  return valid;
}

async function assertGuildPostingAllowed(communityId: number, actorUid: string) {
  const [guild] = await db
    .select()
    .from(communities)
    .where(eq(communities.id, communityId))
    .limit(1);
  if (!guild || guild.isArchived) {
    throw new HttpError(404, 'Guild not found or is archived.');
  }

  const [ban] = await db
    .select()
    .from(guildBans)
    .where(and(eq(guildBans.communityId, communityId), eq(guildBans.userUid, actorUid)))
    .limit(1);
  if (ban && (!ban.expiresAt || ban.expiresAt > new Date())) {
    throw new HttpError(403, 'You are banned from posting in this guild.');
  }

  const [mem] = await db
    .select()
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.userUid, actorUid)
      )
    )
    .limit(1);

  if (!mem) {
    throw new HttpError(403, 'Join this guild before publishing posts or comments inside it.');
  }

  if (mem.isMuted && (!mem.mutedUntil || mem.mutedUntil > new Date())) {
    throw new HttpError(403, 'You are currently muted in this guild.');
  }

  return { guild, membership: mem };
}

export async function createPulseOrGuildPost(
  authorUid: string,
  payload: {
    communityId?: number | null;
    animeMalId?: number | null;
    animeTitle?: string | null;
    characterTag?: PulseCharacterTag | null;
    genreTags?: string[];
    kind?: string;
    isAnnouncement?: boolean;
    title?: string;
    content?: string;
    mediaType?: 'none' | 'image' | 'video';
    imageDataUrl?: string | null;
    videoDataUrl?: string | null;
    posterDataUrl?: string | null;
    mediaUrl?: string | null;
    mediaAssetId?: number | null;
    mediaDurationSec?: number | null;
    quoteOfPostId?: number | null;
    pollQuestion?: string | null;
    pollOptions?: string[] | null;
    rating?: number | null;
    showViewCountPublicly?: boolean;
  }
) {
  const communityId = payload.communityId ? Number(payload.communityId) : null;
  let guildVisibility: 'public' | 'private_guild' = 'public';
  let actorGuildRole: string | null = null;

  if (communityId) {
    const check = await assertGuildPostingAllowed(communityId, authorUid);
    actorGuildRole = check.membership.role;
    if (check.guild.privacyMode === 'private') {
      guildVisibility = 'private_guild';
    }
  }

  const [actorRow] = await db
    .select({ role: users.role, username: users.username, displayName: profiles.displayName })
    .from(users)
    .innerJoin(profiles, eq(users.uid, profiles.userUid))
    .where(eq(users.uid, authorUid))
    .limit(1);

  const isGlobalAdmin = actorRow?.role === 'owner' || actorRow?.role === 'admin';
  const canAnnounce =
    isGlobalAdmin ||
    actorGuildRole === 'owner' ||
    actorGuildRole === 'admin' ||
    actorGuildRole === 'moderator';

  const isAnnouncement = Boolean(payload.isAnnouncement && canAnnounce);

  // Validate Quote Repost target if provided
  let quoteOfPostId: number | null = null;
  let quotedAuthorUid: string | null = null;
  if (payload.quoteOfPostId) {
    const qId = Number(payload.quoteOfPostId);
    const [orig] = await db.select().from(discussions).where(eq(discussions.id, qId)).limit(1);
    if (!orig || orig.isArchived) {
      throw new HttpError(404, 'The post you are quoting is no longer available.');
    }
    const block = await hasBlockBetween(authorUid, orig.authorUid);
    if (block.anyBlock) {
      throw new HttpError(403, 'You cannot quote this post.');
    }
    if (orig.communityId) {
      const [origGuild] = await db
        .select({ privacyMode: communities.privacyMode })
        .from(communities)
        .where(eq(communities.id, orig.communityId))
        .limit(1);
      if (origGuild?.privacyMode === 'private' && orig.communityId !== communityId) {
        throw new HttpError(403, 'Posts from private guilds cannot be quoted outside the guild.');
      }
    }
    quoteOfPostId = qId;
    quotedAuthorUid = orig.authorUid;
  }

  // Validate Poll if provided
  let pollQuestion: string | null = null;
  let pollOptions: DiscussionPollOption[] | null = null;
  if (payload.pollQuestion && Array.isArray(payload.pollOptions)) {
    const cleanQ = String(payload.pollQuestion).trim().slice(0, 200);
    const opts = payload.pollOptions
      .map((o) => String(o || '').trim().slice(0, 80))
      .filter(Boolean)
      .slice(0, 6);
    if (cleanQ && opts.length >= 2) {
      pollQuestion = cleanQ;
      pollOptions = opts.map((text, idx) => ({
        id: `opt_${idx + 1}`,
        text,
        votes: 0,
      }));
    } else if (cleanQ || opts.length > 0) {
      throw new HttpError(400, 'Polls require a question and at least 2 options.');
    }
  }

  // Handle Media Upload or Validated Reference
  let finalMediaType: 'none' | 'image' | 'video' = 'none';
  let finalMediaUrl: string | null = null;
  let finalPosterUrl: string | null = null;
  let finalDurationSec: number | null = null;
  const mediaItems: PulseMediaItem[] = [];

  if (payload.videoDataUrl || payload.mediaType === 'video') {
    if (payload.videoDataUrl) {
      const vid = await uploadValidatedMediaAsset(authorUid, {
        dataUrl: payload.videoDataUrl,
        mediaType: 'video',
        purpose: communityId ? 'guild_media' : 'post_video',
        visibility: guildVisibility,
        communityId,
        durationSec: payload.mediaDurationSec ?? null,
      });
      finalMediaType = 'video';
      finalMediaUrl = vid.url;
      finalDurationSec = vid.durationSec;

      if (payload.posterDataUrl) {
        try {
          const poster = await uploadValidatedMediaAsset(authorUid, {
            dataUrl: payload.posterDataUrl,
            mediaType: 'image',
            purpose: 'post_poster',
            visibility: guildVisibility,
            communityId,
          });
          finalPosterUrl = poster.url;
        } catch {
          finalPosterUrl = null;
        }
      }

      mediaItems.push({
        url: vid.url,
        posterUrl: finalPosterUrl,
        mediaType: 'video',
        width: vid.width,
        height: vid.height,
        durationSec: vid.durationSec,
        assetId: vid.assetId,
      });
    } else if (payload.mediaAssetId) {
      const [asset] = await db
        .select()
        .from(mediaAssets)
        .where(
          and(eq(mediaAssets.id, Number(payload.mediaAssetId)), eq(mediaAssets.ownerUid, authorUid))
        )
        .limit(1);
      if (!asset || !asset.mimeType.startsWith('video/')) {
        throw new HttpError(400, 'Uploaded video asset was not found.');
      }
      finalMediaType = 'video';
      finalMediaUrl = `/api/media/${asset.id}`;
      finalDurationSec = asset.durationSec;
      mediaItems.push({
        url: finalMediaUrl,
        posterUrl: null,
        mediaType: 'video',
        width: asset.width,
        height: asset.height,
        durationSec: asset.durationSec,
        assetId: asset.id,
      });
    } else {
      throw new HttpError(400, 'Upload a valid MP4 or WebM video file.');
    }
  } else if (payload.imageDataUrl) {
    const img = await uploadValidatedMediaAsset(authorUid, {
      dataUrl: payload.imageDataUrl,
      mediaType: 'image',
      purpose: communityId ? 'guild_media' : 'post_image',
      visibility: guildVisibility,
      communityId,
    });
    finalMediaType = 'image';
    finalMediaUrl = img.url;
    mediaItems.push({
      url: img.url,
      mediaType: 'image',
      width: img.width,
      height: img.height,
      assetId: img.assetId,
    });
  } else if (payload.mediaAssetId) {
    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(
        and(eq(mediaAssets.id, Number(payload.mediaAssetId)), eq(mediaAssets.ownerUid, authorUid))
      )
      .limit(1);
    if (!asset) throw new HttpError(400, 'Uploaded media asset was not found.');
    finalMediaType = asset.mimeType.startsWith('video/') ? 'video' : 'image';
    finalMediaUrl = `/api/media/${asset.id}`;
    finalDurationSec = asset.durationSec;
    mediaItems.push({
      url: finalMediaUrl,
      mediaType: finalMediaType,
      width: asset.width,
      height: asset.height,
      durationSec: asset.durationSec,
      assetId: asset.id,
    });
  } else if (payload.mediaUrl && String(payload.mediaUrl).trim()) {
    const candidate = String(payload.mediaUrl).trim();
    if (!isApprovedCatalogueImageUrl(candidate)) {
      throw new HttpError(400, 'Media URL must come from an uploaded file or approved KAGE artwork.');
    }
    finalMediaType = 'image';
    finalMediaUrl = candidate;
    mediaItems.push({ url: candidate, mediaType: 'image' });
  }

  const rawContent = String(payload.content || '').trim().slice(0, 4000);
  const rawTitle = String(payload.title || '').trim().slice(0, 140);

  if (
    !rawContent &&
    !rawTitle &&
    finalMediaType === 'none' &&
    !pollQuestion &&
    !quoteOfPostId
  ) {
    throw new HttpError(400, 'Write something or attach anime media before posting.');
  }

  const finalContent = rawContent || rawTitle || (pollQuestion ? pollQuestion : '');
  const finalTitle =
    rawTitle ||
    (rawContent ? rawContent.split('\n')[0].slice(0, 90) : pollQuestion || 'Pulse Post');

  const hashtags = extractHashtags(`${finalTitle} ${finalContent}`);
  const mentionedUsers = await resolveMentionedUsers(`${finalTitle} ${finalContent}`, authorUid);

  const [settings] = await db
    .select({ defaultPublicVideoViews: userSettings.defaultPublicVideoViews })
    .from(userSettings)
    .where(eq(userSettings.userUid, authorUid))
    .limit(1);

  const showViews =
    typeof payload.showViewCountPublicly === 'boolean'
      ? payload.showViewCountPublicly
      : (settings?.defaultPublicVideoViews ?? true);

  const kind = isAnnouncement
    ? 'announcement'
    : ['discussion', 'pulse', 'review', 'profile_post'].includes(payload.kind || '')
      ? payload.kind!
      : communityId
        ? 'discussion'
        : 'pulse';

  const [created] = await db
    .insert(discussions)
    .values({
      authorUid,
      communityId,
      animeMalId: payload.animeMalId ? Number(payload.animeMalId) : null,
      animeTitle: payload.animeTitle ? String(payload.animeTitle).trim().slice(0, 140) : null,
      characterTag: payload.characterTag || null,
      genreTags: Array.isArray(payload.genreTags) ? payload.genreTags.slice(0, 6) : [],
      hashtags,
      mentionedUids: mentionedUsers.map((m) => m.uid),
      quoteOfPostId,
      kind,
      isAnnouncement,
      title: finalTitle,
      content: finalContent,
      mediaUrl: finalMediaUrl,
      mediaType: finalMediaType,
      mediaItems,
      posterUrl: finalPosterUrl,
      mediaDurationSec: finalDurationSec,
      pollQuestion,
      pollOptions,
      rating:
        typeof payload.rating === 'number' && payload.rating >= 1 && payload.rating <= 10
          ? Math.round(payload.rating)
          : null,
      showViewCountPublicly: showViews,
    })
    .returning();

  if (communityId) {
    await syncCommunityCounts(communityId);
  }

  // Quote Repost count & notification
  if (quoteOfPostId) {
    await db
      .update(discussions)
      .set({ repostCount: sql`${discussions.repostCount} + 1` })
      .where(eq(discussions.id, quoteOfPostId));

    if (quotedAuthorUid && quotedAuthorUid !== authorUid) {
      await createNotification({
        recipientUid: quotedAuthorUid,
        actorUid: authorUid,
        type: 'quote_repost',
        title: `${actorRow?.displayName || 'A hunter'} quoted your post`,
        body: finalContent.slice(0, 90),
        linkUrl: `/pulse/${created.id}`,
      });
    }
  }

  // @username mention notifications
  for (const mUser of mentionedUsers) {
    await createNotification({
      recipientUid: mUser.uid,
      actorUid: authorUid,
      type: 'mention',
      title: `${actorRow?.displayName || '@' + actorRow?.username} mentioned you in a post`,
      body: finalContent.slice(0, 90),
      linkUrl: `/pulse/${created.id}`,
    });
  }

  // Profile post alert subscribers (only for public posts)
  if (guildVisibility === 'public') {
    const subscribers = await db
      .select({ subscriberUid: profileAlertPrefs.subscriberUid })
      .from(profileAlertPrefs)
      .where(
        and(eq(profileAlertPrefs.targetUid, authorUid), eq(profileAlertPrefs.notifyPosts, true))
      );
    if (subscribers.length > 0) {
      await db.insert(notifications).values(
        subscribers.map((s) => ({
          recipientUid: s.subscriberUid,
          actorUid: authorUid,
          type: 'new_post',
          title: `${actorRow?.displayName || '@' + actorRow?.username} published a new post`,
          body: finalTitle.slice(0, 90),
          linkUrl: `/pulse/${created.id}`,
        }))
      );
    }
  }

  return await getPulsePostById(created.id, authorUid);
}

export async function togglePulsePureRepost(userUid: string, postId: number) {
  const [post] = await db.select().from(discussions).where(eq(discussions.id, postId)).limit(1);
  if (!post || post.isArchived) {
    throw new HttpError(404, 'Post not found.');
  }

  const block = await hasBlockBetween(userUid, post.authorUid);
  if (block.anyBlock) {
    throw new HttpError(403, 'You cannot repost this post.');
  }

  if (post.communityId) {
    const [guild] = await db
      .select({ privacyMode: communities.privacyMode })
      .from(communities)
      .where(eq(communities.id, post.communityId))
      .limit(1);
    if (guild?.privacyMode === 'private') {
      throw new HttpError(403, 'Private guild posts cannot be reposted publicly.');
    }
  }

  const [existing] = await db
    .select()
    .from(pulseReposts)
    .where(and(eq(pulseReposts.userUid, userUid), eq(pulseReposts.postId, postId)))
    .limit(1);

  let reposted = false;
  if (existing) {
    await db.delete(pulseReposts).where(eq(pulseReposts.id, existing.id));
    await db
      .delete(reactions)
      .where(
        and(
          eq(reactions.userUid, userUid),
          eq(reactions.targetType, 'discussion'),
          eq(reactions.targetId, postId),
          eq(reactions.reactionType, 'repost')
        )
      );
    reposted = false;
  } else {
    await db.insert(pulseReposts).values({ userUid, postId }).onConflictDoNothing();
    await db
      .insert(reactions)
      .values({
        userUid,
        targetType: 'discussion',
        targetId: postId,
        reactionType: 'repost',
      })
      .onConflictDoNothing();
    reposted = true;
  }

  const [pureCountRes, quoteCountRes] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(pulseReposts)
      .where(eq(pulseReposts.postId, postId)),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(discussions)
      .where(and(eq(discussions.quoteOfPostId, postId), eq(discussions.isArchived, false))),
  ]);

  const repostCount = (pureCountRes[0]?.count || 0) + (quoteCountRes[0]?.count || 0);
  await db.update(discussions).set({ repostCount }).where(eq(discussions.id, postId));

  if (reposted && post.authorUid !== userUid) {
    const [actor] = await db
      .select({ displayName: profiles.displayName })
      .from(profiles)
      .where(eq(profiles.userUid, userUid))
      .limit(1);
    await createNotification({
      recipientUid: post.authorUid,
      actorUid: userUid,
      type: 'repost',
      title: `${actor?.displayName || 'A hunter'} reposted your post`,
      body: post.title.slice(0, 80),
      linkUrl: `/pulse/${postId}`,
    });
  }

  return { reposted, repostCount };
}

export async function editPulseOrGuildPost(
  actorUid: string,
  postId: number,
  payload: {
    title?: string;
    content?: string;
    animeMalId?: number | null;
    animeTitle?: string | null;
    genreTags?: string[];
  }
) {
  const [post] = await db.select().from(discussions).where(eq(discussions.id, postId)).limit(1);
  if (!post) throw new HttpError(404, 'Post not found.');
  if (post.authorUid !== actorUid) {
    throw new HttpError(403, 'Forbidden: Only the post author can edit this post.');
  }

  const now = new Date();
  const updates: Record<string, any> = { editedAt: now, updatedAt: now };

  if (typeof payload.content === 'string') {
    const clean = payload.content.trim().slice(0, 4000);
    if (!clean && post.mediaType === 'none' && !post.pollQuestion && !post.quoteOfPostId) {
      throw new HttpError(400, 'Post text cannot be empty.');
    }
    updates.content = clean;
    updates.hashtags = extractHashtags(`${payload.title || post.title} ${clean}`);
    if (!payload.title) {
      updates.title = clean.split('\n')[0].slice(0, 90) || post.title;
    }
  }
  if (typeof payload.title === 'string' && payload.title.trim()) {
    updates.title = payload.title.trim().slice(0, 140);
  }
  if (payload.animeMalId !== undefined) {
    updates.animeMalId = payload.animeMalId ? Number(payload.animeMalId) : null;
  }
  if (payload.animeTitle !== undefined) {
    updates.animeTitle = payload.animeTitle ? String(payload.animeTitle).trim().slice(0, 140) : null;
  }
  if (Array.isArray(payload.genreTags)) {
    updates.genreTags = payload.genreTags.slice(0, 6);
  }

  await db.update(discussions).set(updates).where(eq(discussions.id, postId));
  return await getPulsePostById(postId, actorUid);
}

export async function deletePulseOrGuildPost(actorUid: string, postId: number) {
  const [post] = await db.select().from(discussions).where(eq(discussions.id, postId)).limit(1);
  if (!post) throw new HttpError(404, 'Post not found.');

  const [actor] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.uid, actorUid))
    .limit(1);
  const isGlobalAdmin = actor?.role === 'owner' || actor?.role === 'admin';

  let isGuildMod = false;
  if (post.communityId) {
    const [m] = await db
      .select({ role: communityMemberships.role })
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, post.communityId),
          eq(communityMemberships.userUid, actorUid)
        )
      )
      .limit(1);
    isGuildMod = Boolean(m && ['owner', 'admin', 'moderator'].includes(m.role));
  }

  if (post.authorUid !== actorUid && !isGlobalAdmin && !isGuildMod) {
    throw new HttpError(
      403,
      'Forbidden: Only the author, guild moderator, or KAGE Owner can delete this post.'
    );
  }

  await db.delete(discussions).where(eq(discussions.id, postId));

  for (const url of [post.mediaUrl, post.posterUrl]) {
    if (url && url.startsWith('/api/media/')) {
      const idNum = Number(url.replace('/api/media/', '').split('?')[0]);
      if (idNum) await deleteMediaAssetById(post.authorUid, idNum);
    }
  }

  if (post.communityId) {
    await syncCommunityCounts(post.communityId);
  }

  if (post.quoteOfPostId) {
    await db
      .update(discussions)
      .set({ repostCount: sql`GREATEST(0, ${discussions.repostCount} - 1)` })
      .where(eq(discussions.id, post.quoteOfPostId));
  }

  return { deleted: true, postId };
}

export async function voteOnDiscussionPoll(
  userUid: string,
  discussionId: number,
  optionId: string
) {
  const [post] = await db
    .select()
    .from(discussions)
    .where(eq(discussions.id, discussionId))
    .limit(1);
  if (!post || !post.pollQuestion || !Array.isArray(post.pollOptions)) {
    throw new HttpError(404, 'Poll not found on this post.');
  }

  if (post.communityId) {
    await assertGuildPostingAllowed(post.communityId, userUid);
  }

  const validOpt = post.pollOptions.some((o) => o.id === optionId);
  if (!validOpt) {
    throw new HttpError(400, 'Invalid poll option selected.');
  }

  await db
    .insert(discussionPollVotes)
    .values({ discussionId, userUid, optionId })
    .onConflictDoUpdate({
      target: [discussionPollVotes.discussionId, discussionPollVotes.userUid],
      set: { optionId, createdAt: new Date() },
    });

  const allVotes = await db
    .select({ optionId: discussionPollVotes.optionId })
    .from(discussionPollVotes)
    .where(eq(discussionPollVotes.discussionId, discussionId));

  const updatedOptions: DiscussionPollOption[] = post.pollOptions.map((opt) => ({
    ...opt,
    votes: allVotes.filter((v) => v.optionId === opt.id).length,
  }));

  await db
    .update(discussions)
    .set({ pollOptions: updatedOptions, updatedAt: new Date() })
    .where(eq(discussions.id, discussionId));

  return {
    pollOptions: updatedOptions,
    viewerPollVote: optionId,
    totalVotes: allVotes.length,
  };
}

export async function addPulseCommentWithStickers(
  authorUid: string,
  discussionId: number,
  payload: {
    content?: string;
    stickerId?: string | null;
    parentCommentId?: number | null;
  }
) {
  const cleanContent = String(payload.content || '').trim().slice(0, 2000);
  const stickerId = payload.stickerId ? String(payload.stickerId).trim() : null;

  if (stickerId && !isValidStickerId(stickerId)) {
    throw new HttpError(400, 'Selected anime sticker is invalid.');
  }
  if (!cleanContent && !stickerId) {
    throw new HttpError(400, 'Enter a comment or choose a KAGE anime sticker.');
  }

  const [disc] = await db
    .select()
    .from(discussions)
    .where(eq(discussions.id, discussionId))
    .limit(1);
  if (!disc || (disc.isArchived && disc.authorUid !== authorUid)) {
    throw new HttpError(404, 'Post not found.');
  }

  if (disc.communityId) {
    await assertGuildPostingAllowed(disc.communityId, authorUid);
  }

  const blockState = await hasBlockBetween(authorUid, disc.authorUid);
  if (blockState.anyBlock) {
    throw new HttpError(403, 'Forbidden: You cannot comment on this post.');
  }

  const [authorProf] = await db
    .select({ commentPermission: profiles.commentPermission })
    .from(profiles)
    .where(eq(profiles.userUid, disc.authorUid))
    .limit(1);

  if (disc.authorUid !== authorUid) {
    const perm = authorProf?.commentPermission || 'everyone';
    if (perm === 'nobody') {
      throw new HttpError(403, 'Comments are turned off by the post author.');
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
        throw new HttpError(403, 'Only followers of this hunter can comment on their posts.');
      }
    }
  }

  if (payload.parentCommentId) {
    const [parent] = await db
      .select({ id: comments.id, discussionId: comments.discussionId })
      .from(comments)
      .where(eq(comments.id, Number(payload.parentCommentId)))
      .limit(1);
    if (!parent || parent.discussionId !== discussionId) {
      throw new HttpError(404, 'Parent comment not found.');
    }
  }

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

  const mentionedUsers = cleanContent
    ? await resolveMentionedUsers(cleanContent, authorUid)
    : [];

  const stickerMeta = stickerId ? getStickerById(stickerId) : null;
  const storedContent = cleanContent || (stickerMeta ? `[Sticker: ${stickerMeta.name}]` : '');

  const [created] = await db
    .insert(comments)
    .values({
      discussionId,
      authorUid,
      parentCommentId: payload.parentCommentId ? Number(payload.parentCommentId) : null,
      content: storedContent,
      stickerId,
      mentionedUids: mentionedUsers.map((m) => m.uid),
      isRestrictedShadow,
    })
    .returning();

  const [cCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(comments)
    .where(
      and(
        eq(comments.discussionId, discussionId),
        eq(comments.isRestrictedShadow, false),
        eq(comments.isDeleted, false)
      )
    );

  await db
    .update(discussions)
    .set({ commentCount: cCount?.count || 0, updatedAt: new Date() })
    .where(eq(discussions.id, discussionId));

  const [actor] = await db
    .select({
      username: users.username,
      role: users.role,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(users)
    .innerJoin(profiles, eq(users.uid, profiles.userUid))
    .where(eq(users.uid, authorUid))
    .limit(1);

  if (!isRestrictedShadow) {
    const previewBody = cleanContent
      ? `"${cleanContent.slice(0, 90)}"`
      : `Sent ${stickerMeta?.name || 'an anime sticker'}`;

    if (payload.parentCommentId) {
      const [parent] = await db
        .select()
        .from(comments)
        .where(eq(comments.id, Number(payload.parentCommentId)))
        .limit(1);
      if (parent && parent.authorUid !== authorUid) {
        await createNotification({
          recipientUid: parent.authorUid,
          actorUid: authorUid,
          type: 'reply',
          title: `${actor?.displayName || 'Someone'} replied to your comment`,
          body: previewBody,
          linkUrl: `/pulse/${discussionId}`,
        });
      }
    } else if (disc.authorUid !== authorUid) {
      await createNotification({
        recipientUid: disc.authorUid,
        actorUid: authorUid,
        type: 'comment',
        title: `${actor?.displayName || 'Someone'} commented on your post`,
        body: previewBody,
        linkUrl: `/pulse/${discussionId}`,
      });
    }

    for (const mUser of mentionedUsers) {
      await createNotification({
        recipientUid: mUser.uid,
        actorUid: authorUid,
        type: 'mention',
        title: `${actor?.displayName || 'Someone'} mentioned you in a comment`,
        body: previewBody,
        linkUrl: `/pulse/${discussionId}`,
      });
    }
  }

  return {
    ...created,
    viewerLiked: false,
    author: {
      uid: authorUid,
      username: actor?.username || 'hunter',
      role: actor?.role || 'user',
      displayName: actor?.displayName || 'Hunter',
      avatarUrl: actor?.avatarUrl || '/assets/zenitsu-avatar.png',
    },
  };
}

export async function editPulseComment(
  actorUid: string,
  commentId: number,
  payload: { content?: string; stickerId?: string | null }
) {
  const [existing] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!existing || existing.isDeleted) {
    throw new HttpError(404, 'Comment not found.');
  }
  if (existing.authorUid !== actorUid) {
    throw new HttpError(403, 'Forbidden: Only the comment author can edit this comment.');
  }

  const cleanContent =
    payload.content !== undefined ? String(payload.content).trim().slice(0, 2000) : existing.content;
  const stickerId =
    payload.stickerId !== undefined
      ? payload.stickerId
        ? String(payload.stickerId)
        : null
      : existing.stickerId;

  if (stickerId && !isValidStickerId(stickerId)) {
    throw new HttpError(400, 'Invalid anime sticker ID.');
  }
  if (!cleanContent && !stickerId) {
    throw new HttpError(400, 'Comment cannot be empty.');
  }

  const [updated] = await db
    .update(comments)
    .set({
      content: cleanContent,
      stickerId,
      editedAt: new Date(),
    })
    .where(eq(comments.id, commentId))
    .returning();

  return updated;
}

export async function deletePulseComment(actorUid: string, commentId: number) {
  const [existing] = await db
    .select()
    .from(comments)
    .where(eq(comments.id, commentId))
    .limit(1);
  if (!existing) throw new HttpError(404, 'Comment not found.');

  const [disc] = await db
    .select()
    .from(discussions)
    .where(eq(discussions.id, existing.discussionId))
    .limit(1);

  const [actor] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.uid, actorUid))
    .limit(1);
  const isGlobalAdmin = actor?.role === 'owner' || actor?.role === 'admin';

  let isGuildMod = false;
  if (disc?.communityId) {
    const [m] = await db
      .select({ role: communityMemberships.role })
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, disc.communityId),
          eq(communityMemberships.userUid, actorUid)
        )
      )
      .limit(1);
    isGuildMod = Boolean(m && ['owner', 'admin', 'moderator'].includes(m.role));
  }

  const canDelete =
    existing.authorUid === actorUid ||
    disc?.authorUid === actorUid ||
    isGlobalAdmin ||
    isGuildMod;

  if (!canDelete) {
    throw new HttpError(403, 'Forbidden: You cannot delete this comment.');
  }

  const childReplies = await db
    .select({ id: comments.id })
    .from(comments)
    .where(eq(comments.parentCommentId, commentId))
    .limit(1);

  if (childReplies.length > 0) {
    await db
      .update(comments)
      .set({
        isDeleted: true,
        content: '[Comment removed]',
        stickerId: null,
        editedAt: new Date(),
      })
      .where(eq(comments.id, commentId));
  } else {
    await db.delete(comments).where(eq(comments.id, commentId));
  }

  const [cCount] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(comments)
    .where(
      and(
        eq(comments.discussionId, existing.discussionId),
        eq(comments.isRestrictedShadow, false),
        eq(comments.isDeleted, false)
      )
    );

  await db
    .update(discussions)
    .set({ commentCount: cCount?.count || 0, updatedAt: new Date() })
    .where(eq(discussions.id, existing.discussionId));

  return { deleted: true, commentCount: cCount?.count || 0 };
}

async function hydratePostsBatch(
  rawRows: {
    discussion: typeof discussions.$inferSelect;
    authorUsername: string;
    authorRole: string;
    authorIsAiDemo?: boolean;
    authorDisplayName: string;
    authorAvatarUrl: string;
    communityName: string | null;
    communitySlug: string | null;
    communityPrivacy: string | null;
    repostedBy?: { uid: string; username: string; displayName: string; repostedAt: Date } | null;
  }[],
  viewerUid?: string
) {
  if (rawRows.length === 0) return [];

  const postIds = Array.from(new Set(rawRows.map((r) => r.discussion.id)));
  const quoteIds = Array.from(
    new Set(rawRows.map((r) => r.discussion.quoteOfPostId).filter(Boolean) as number[])
  );

  const [reactionRows, savedRows, repostRows, pollVoteRows, quotedRows] = await Promise.all([
    viewerUid
      ? db
          .select()
          .from(reactions)
          .where(
            and(
              eq(reactions.userUid, viewerUid),
              eq(reactions.targetType, 'discussion'),
              inArray(reactions.targetId, postIds)
            )
          )
      : Promise.resolve([]),
    viewerUid
      ? db
          .select({ postId: savedPosts.postId })
          .from(savedPosts)
          .where(and(eq(savedPosts.userUid, viewerUid), inArray(savedPosts.postId, postIds)))
      : Promise.resolve([]),
    viewerUid
      ? db
          .select({ postId: pulseReposts.postId })
          .from(pulseReposts)
          .where(and(eq(pulseReposts.userUid, viewerUid), inArray(pulseReposts.postId, postIds)))
      : Promise.resolve([]),
    viewerUid
      ? db
          .select()
          .from(discussionPollVotes)
          .where(
            and(
              eq(discussionPollVotes.userUid, viewerUid),
              inArray(discussionPollVotes.discussionId, postIds)
            )
          )
      : Promise.resolve([]),
    quoteIds.length > 0
      ? db
          .select({
            discussion: discussions,
            authorUsername: users.username,
            authorRole: users.role,
            authorDisplayName: profiles.displayName,
            authorAvatarUrl: profiles.avatarUrl,
          })
          .from(discussions)
          .innerJoin(users, eq(discussions.authorUid, users.uid))
          .innerJoin(profiles, eq(users.uid, profiles.userUid))
          .where(inArray(discussions.id, quoteIds))
      : Promise.resolve([]),
  ]);

  const likedSet = new Set(
    reactionRows.filter((r) => r.reactionType === 'like').map((r) => r.targetId)
  );
  const savedSet = new Set([
    ...savedRows.map((s) => s.postId),
    ...reactionRows.filter((r) => r.reactionType === 'bookmark').map((r) => r.targetId),
  ]);
  const repostedSet = new Set([
    ...repostRows.map((rp) => rp.postId),
    ...reactionRows.filter((r) => r.reactionType === 'repost').map((r) => r.targetId),
  ]);
  const pollVoteMap = new Map(pollVoteRows.map((pv) => [pv.discussionId, pv.optionId]));
  const quoteMap = new Map(quotedRows.map((q) => [q.discussion.id, q]));

  return rawRows.map((r) => {
    const d = r.discussion;
    const isPrivateGuild = r.communityPrivacy === 'private' && d.communityId;
    const mediaScope = isPrivateGuild
      ? { type: 'guild' as const, id: d.communityId! }
      : undefined;

    const signedMediaUrl = signMediaUrlForViewer(d.mediaUrl, viewerUid, mediaScope);
    const signedPosterUrl = signMediaUrlForViewer(d.posterUrl, viewerUid, mediaScope);

    let quotedPost: any = null;
    if (d.quoteOfPostId) {
      const qRow = quoteMap.get(d.quoteOfPostId);
      if (!qRow || qRow.discussion.isArchived) {
        quotedPost = {
          id: d.quoteOfPostId,
          deleted: true,
          message: 'Original post is no longer available.',
        };
      } else {
        quotedPost = {
          id: qRow.discussion.id,
          title: qRow.discussion.title,
          content: qRow.discussion.content,
          mediaUrl: qRow.discussion.mediaUrl,
          mediaType: qRow.discussion.mediaType,
          posterUrl: qRow.discussion.posterUrl,
          animeTitle: qRow.discussion.animeTitle,
          createdAt: qRow.discussion.createdAt,
          author: {
            uid: qRow.discussion.authorUid,
            username: qRow.authorUsername,
            role: qRow.authorRole,
            displayName: qRow.authorDisplayName,
            avatarUrl: qRow.authorAvatarUrl,
          },
        };
      }
    }

    const firstMedia = Array.isArray(d.mediaItems) && d.mediaItems[0] ? d.mediaItems[0] : null;
    const is4K = Boolean(
      firstMedia?.width &&
        firstMedia?.height &&
        firstMedia.width >= 3840 &&
        firstMedia.height >= 2160
    );

    return {
      ...sanitizePostForViewer(d, viewerUid, false),
      mediaUrl: signedMediaUrl,
      posterUrl: signedPosterUrl,
      is4K,
      quotedPost,
      repostedBy: r.repostedBy || null,
      viewerPollVote: pollVoteMap.get(d.id) || null,
      isAiGenerated: Boolean(d.isAiGenerated),
      demoLikeCount: d.demoLikeCount || 0,
      demoCommentCount: d.demoCommentCount || 0,
      demoRepostCount: d.demoRepostCount || 0,
      demoShareCount: d.demoShareCount || 0,
      author: {
        uid: d.authorUid,
        username: r.authorUsername,
        role: r.authorRole,
        isAiDemo: Boolean(r.authorIsAiDemo),
        displayName: r.authorDisplayName,
        avatarUrl: r.authorAvatarUrl,
      },
      community: r.communityName
        ? {
            id: d.communityId,
            name: r.communityName,
            slug: r.communitySlug,
            privacyMode: r.communityPrivacy || 'public',
          }
        : null,
      viewerLiked: likedSet.has(d.id),
      viewerBookmarked: savedSet.has(d.id),
      viewerSaved: savedSet.has(d.id),
      viewerReposted: repostedSet.has(d.id),
    };
  });
}

export async function listPulseFeed(params: {
  communityId?: number;
  animeMalId?: number;
  kind?: string;
  feedTab?: string; // 'for_you' | 'following' | 'latest' | 'saved'
  sort?: string;
  q?: string;
  hashtag?: string;
  limit?: number;
  offset?: number;
  viewerUid?: string;
}) {
  const limit = Math.max(1, Math.min(40, params.limit || 20));
  const offset = Math.max(0, params.offset || 0);

  const aiCfg = await getAiCommunityConfig();

  if (params.feedTab === 'saved') {
    if (!params.viewerUid) return { items: [], hasMore: false };
    const savedRows = await db
      .select({
        discussion: discussions,
        authorUsername: users.username,
        authorRole: users.role,
        authorIsAiDemo: users.isAiDemo,
        authorDisplayName: profiles.displayName,
        authorAvatarUrl: profiles.avatarUrl,
        communityName: communities.name,
        communitySlug: communities.slug,
        communityPrivacy: communities.privacyMode,
      })
      .from(savedPosts)
      .innerJoin(discussions, eq(savedPosts.postId, discussions.id))
      .innerJoin(users, eq(discussions.authorUid, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .leftJoin(communities, eq(discussions.communityId, communities.id))
      .where(and(eq(savedPosts.userUid, params.viewerUid), eq(discussions.isArchived, false)))
      .orderBy(desc(savedPosts.createdAt))
      .limit(limit + 1)
      .offset(offset);

    const hasMore = savedRows.length > limit;
    const slice = savedRows.slice(0, limit);
    const items = await hydratePostsBatch(slice, params.viewerUid);
    return { items, hasMore };
  }

  // Enforce private guild access if querying a specific communityId
  let viewerMemberGuildIds = new Set<number>();
  let viewerIsGlobalAdmin = false;
  let viewerFollowingUids = new Set<string>();
  let hiddenAuthorUids: string[] = [];

  if (params.viewerUid) {
    const [uRow, memRows, blockRows, mutedRows, followRows] = await Promise.all([
      db.select({ role: users.role }).from(users).where(eq(users.uid, params.viewerUid)).limit(1),
      db
        .select({ communityId: communityMemberships.communityId })
        .from(communityMemberships)
        .where(eq(communityMemberships.userUid, params.viewerUid)),
      db
        .select({ blockerUid: blockedUsers.blockerUid, blockedUid: blockedUsers.blockedUid })
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

    viewerIsGlobalAdmin = uRow[0]?.role === 'owner' || uRow[0]?.role === 'admin';
    viewerMemberGuildIds = new Set(memRows.map((m) => m.communityId));
    viewerFollowingUids = new Set(followRows.map((f) => f.uid));
    hiddenAuthorUids = Array.from(
      new Set([
        ...blockRows.map((b) =>
          b.blockerUid === params.viewerUid ? b.blockedUid : b.blockerUid
        ),
        ...mutedRows.map((m) => m.uid),
      ])
    );
  }

  if (params.communityId) {
    const [g] = await db
      .select({ privacyMode: communities.privacyMode })
      .from(communities)
      .where(eq(communities.id, params.communityId))
      .limit(1);
    if (!g) throw new HttpError(404, 'Guild not found.');
    if (
      g.privacyMode === 'private' &&
      !viewerIsGlobalAdmin &&
      !viewerMemberGuildIds.has(params.communityId)
    ) {
      throw new HttpError(403, 'Private guild posts are visible only to guild members.');
    }
  }

  const conditions: any[] = [eq(discussions.isArchived, false)];
  if (!aiCfg.aiActivityEnabled) {
    conditions.push(eq(discussions.isAiGenerated, false));
  }
  if (params.communityId) {
    conditions.push(eq(discussions.communityId, params.communityId));
  }
  if (params.animeMalId) {
    conditions.push(eq(discussions.animeMalId, params.animeMalId));
  }
  if (params.kind) {
    conditions.push(eq(discussions.kind, params.kind));
  }
  if (params.q?.trim()) {
    const pat = `%${params.q.trim()}%`;
    conditions.push(
      or(
        ilike(discussions.title, pat),
        ilike(discussions.content, pat),
        ilike(discussions.animeTitle, pat)
      )
    );
  }
  if (params.hashtag?.trim()) {
    const cleanTag = params.hashtag.trim().replace(/^#+/, '').toLowerCase();
    conditions.push(sql`${discussions.hashtags} @> ${JSON.stringify([cleanTag])}::jsonb`);
  }
  if (hiddenAuthorUids.length > 0) {
    conditions.push(
      sql`${discussions.authorUid} NOT IN (${sql.join(
        hiddenAuthorUids.map((id) => sql`${id}`),
        sql`, `
      )})`
    );
  }

  if (params.feedTab === 'following') {
    if (!params.viewerUid || viewerFollowingUids.size === 0) {
      return { items: [], hasMore: false };
    }
    conditions.push(inArray(discussions.authorUid, Array.from(viewerFollowingUids)));
  }

  const orderClause =
    params.sort === 'popular' || params.feedTab === 'for_you'
      ? [
          desc(discussions.isPinned),
          desc(discussions.isAnnouncement),
          desc(discussions.likeCount),
          desc(discussions.createdAt),
        ]
      : [
          desc(discussions.isPinned),
          desc(discussions.isAnnouncement),
          desc(discussions.createdAt),
        ];

  const rows = await db
    .select({
      discussion: discussions,
      authorUsername: users.username,
      authorRole: users.role,
      authorIsAiDemo: users.isAiDemo,
      authorDisplayName: profiles.displayName,
      authorAvatarUrl: profiles.avatarUrl,
      authorIsPrivate: profiles.isPrivate,
      communityName: communities.name,
      communitySlug: communities.slug,
      communityPrivacy: communities.privacyMode,
    })
    .from(discussions)
    .innerJoin(users, eq(discussions.authorUid, users.uid))
    .innerJoin(profiles, eq(users.uid, profiles.userUid))
    .leftJoin(communities, eq(discussions.communityId, communities.id))
    .where(and(...conditions))
    .orderBy(...orderClause)
    .limit(limit + 12)
    .offset(offset);

  const visible = rows.filter((r) => {
    // Private guild check
    if (
      r.communityPrivacy === 'private' &&
      r.discussion.communityId &&
      !viewerIsGlobalAdmin &&
      !viewerMemberGuildIds.has(r.discussion.communityId)
    ) {
      return false;
    }
    // Private profile check (outside public guilds)
    if (
      !r.discussion.communityId &&
      r.authorIsPrivate &&
      r.discussion.authorUid !== params.viewerUid &&
      !viewerFollowingUids.has(r.discussion.authorUid)
    ) {
      return false;
    }
    return true;
  });

  const hasMore = visible.length > limit;
  const pageRows = visible.slice(0, limit);
  const items = await hydratePostsBatch(pageRows, params.viewerUid);

  return { items, hasMore };
}

export async function getPulsePostById(
  discussionId: number,
  viewerUid?: string,
  commentLimit = 80,
  commentOffset = 0
) {
  const aiCfg = await getAiCommunityConfig();
  const [row] = await db
    .select({
      discussion: discussions,
      authorUsername: users.username,
      authorRole: users.role,
      authorIsAiDemo: users.isAiDemo,
      authorDisplayName: profiles.displayName,
      authorAvatarUrl: profiles.avatarUrl,
      authorIsPrivate: profiles.isPrivate,
      authorCommentPerm: profiles.commentPermission,
      communityName: communities.name,
      communitySlug: communities.slug,
      communityPrivacy: communities.privacyMode,
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

  const block = await hasBlockBetween(viewerUid, row.discussion.authorUid);
  if (block.anyBlock) {
    throw new HttpError(403, 'This post is unavailable.');
  }

  // Enforce private guild read protection
  if (row.communityPrivacy === 'private' && row.discussion.communityId) {
    if (!viewerUid) {
      throw new HttpError(403, 'Sign in and join this private guild to view its posts.');
    }
    const [mem, uRow] = await Promise.all([
      db
        .select({ id: communityMemberships.id })
        .from(communityMemberships)
        .where(
          and(
            eq(communityMemberships.communityId, row.discussion.communityId),
            eq(communityMemberships.userUid, viewerUid)
          )
        )
        .limit(1),
      db.select({ role: users.role }).from(users).where(eq(users.uid, viewerUid)).limit(1),
    ]);
    const isAdmin = uRow[0]?.role === 'owner' || uRow[0]?.role === 'admin';
    if (!mem[0] && !isAdmin) {
      throw new HttpError(403, 'Forbidden: Only members of this private guild can view its posts.');
    }
  }

  if (
    !row.discussion.communityId &&
    row.authorIsPrivate &&
    row.discussion.authorUid !== viewerUid
  ) {
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
    if (!follows) {
      throw new HttpError(403, 'Follow this private profile to view their posts.');
    }
  }

  const [hydratedPost] = await hydratePostsBatch([row], viewerUid);

  const isShowcase = aiCfg.showcasePostId === discussionId;
  const allowAiComments =
    aiCfg.aiActivityEnabled && (!isShowcase || aiCfg.ownerDemoAudienceEnabled);

  const safeLimit = Math.max(10, Math.min(160, commentLimit));
  const safeOffset = Math.max(0, commentOffset);

  const topConds: any[] = [
    eq(comments.discussionId, discussionId),
    sql`${comments.parentCommentId} IS NULL`,
  ];
  if (!allowAiComments) {
    topConds.push(eq(comments.isAiGenerated, false));
  }

  const [topCountRes, topRows] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(comments)
      .where(and(...topConds)),
    db
      .select({
        comment: comments,
        authorUsername: users.username,
        authorRole: users.role,
        authorIsAiDemo: users.isAiDemo,
        authorDisplayName: profiles.displayName,
        authorAvatarUrl: profiles.avatarUrl,
      })
      .from(comments)
      .innerJoin(users, eq(comments.authorUid, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(and(...topConds))
      .orderBy(asc(comments.isAiGenerated), desc(comments.createdAt))
      .limit(safeLimit)
      .offset(safeOffset),
  ]);

  let nestedRows: typeof topRows = [];
  if (topRows.length > 0) {
    const topIds = topRows.map((t) => t.comment.id);
    const replyConds: any[] = [
      eq(comments.discussionId, discussionId),
      inArray(comments.parentCommentId, topIds),
    ];
    if (!allowAiComments) {
      replyConds.push(eq(comments.isAiGenerated, false));
    }
    nestedRows = await db
      .select({
        comment: comments,
        authorUsername: users.username,
        authorRole: users.role,
        authorIsAiDemo: users.isAiDemo,
        authorDisplayName: profiles.displayName,
        authorAvatarUrl: profiles.avatarUrl,
      })
      .from(comments)
      .innerJoin(users, eq(comments.authorUid, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(and(...replyConds))
      .orderBy(asc(comments.createdAt))
      .limit(80);
  }

  const combinedRows = [...topRows, ...nestedRows];
  const visibleComments = combinedRows.filter(
    (c) =>
      !c.comment.isRestrictedShadow ||
      c.comment.authorUid === viewerUid ||
      row.discussion.authorUid === viewerUid
  );

  let likedCommentIds = new Set<number>();
  if (viewerUid && visibleComments.length > 0) {
    const cIds = visibleComments.map((c) => c.comment.id);
    const cLikes = await db
      .select({ targetId: reactions.targetId })
      .from(reactions)
      .where(
        and(
          eq(reactions.userUid, viewerUid),
          eq(reactions.targetType, 'comment'),
          eq(reactions.reactionType, 'like'),
          inArray(reactions.targetId, cIds)
        )
      );
    likedCommentIds = new Set(cLikes.map((l) => l.targetId));
  }

  const totalTopLevelComments = topCountRes[0]?.count || 0;

  return {
    ...hydratedPost,
    commentPermission: row.authorCommentPerm,
    totalTopLevelComments,
    commentsHasMore: safeOffset + topRows.length < totalTopLevelComments,
    nextCommentOffset: safeOffset + topRows.length,
    comments: visibleComments.map((c) => ({
      ...c.comment,
      viewerLiked: likedCommentIds.has(c.comment.id),
      author: {
        uid: c.comment.authorUid,
        username: c.authorUsername,
        role: c.authorRole,
        isAiDemo: Boolean(c.authorIsAiDemo),
        displayName: c.authorDisplayName,
        avatarUrl: c.authorAvatarUrl,
      },
    })),
  };
}
