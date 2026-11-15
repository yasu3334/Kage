import { relations } from 'drizzle-orm';
import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

export const users = pgTable(
  'users',
  {
    uid: text('uid').primaryKey(), // Firebase Auth UID or server session UID
    kageId: text('kage_id'), // Permanent KAGE-00000001 identifier
    email: text('email').notNull().unique(),
    username: text('username').notNull().unique(), // Preserves chosen casing (e.g. ThunderSoul)
    usernameNormalized: text('username_normalized'), // Lowercase canonical uniqueness key
    role: text('role').notNull().default('user'), // 'owner' | 'admin' | 'moderator' | 'user'
    accountXp: integer('account_xp').notNull().default(0),
    accountLevel: integer('account_level').notNull().default(1),
    usernameChangedAt: timestamp('username_changed_at'),
    emailVerified: boolean('email_verified').notNull().default(false),
    isSeed: boolean('is_seed').notNull().default(false),
    isAiDemo: boolean('is_ai_demo').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_users_username').on(t.username),
    uniqueIndex('uniq_users_username_normalized').on(t.usernameNormalized),
    uniqueIndex('uniq_users_kage_id').on(t.kageId),
    index('idx_users_email').on(t.email),
    index('idx_users_ai_demo').on(t.isAiDemo, t.createdAt),
  ]
);

export const aiDemoProfiles = pgTable(
  'ai_demo_profiles',
  {
    userUid: text('user_uid')
      .primaryKey()
      .references(() => users.uid, { onDelete: 'cascade' }),
    personaArchetype: text('persona_archetype').notNull().default('Lore Theorist'),
    writingStyle: text('writing_style').notNull().default('analytical'),
    favoriteAnime: text('favorite_anime').notNull().default(''),
    favoriteAnimeMalId: integer('favorite_anime_mal_id'),
    favoriteCharacter: text('favorite_character').notNull().default(''),
    interests: jsonb('interests').$type<string[]>().notNull().default([]),
    isCommunityMember: boolean('is_community_member').notNull().default(false),
    disclosureLabel: text('disclosure_label')
      .notNull()
      .default('AI-Generated Demo Account · Simulated KAGE Community Persona'),
    activityCadence: text('activity_cadence').notNull().default('normal'),
    seedBatch: text('seed_batch').notNull().default('launch_v1'),
    lastSimulatedAt: timestamp('last_simulated_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_ai_demo_comm_member').on(t.isCommunityMember),
    index('idx_ai_demo_archetype').on(t.personaArchetype),
  ]
);

export const kageIdLedger = pgTable(
  'kage_id_ledger',
  {
    seq: serial('seq').primaryKey(),
    userUid: text('user_uid').notNull(),
    kageId: text('kage_id'),
    issuedAt: timestamp('issued_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_kage_id_ledger_uid').on(t.userUid),
    uniqueIndex('uniq_kage_id_ledger_code').on(t.kageId),
  ]
);

export const profiles = pgTable('profiles', {
  userUid: text('user_uid')
    .primaryKey()
    .references(() => users.uid, { onDelete: 'cascade' }),
  displayName: text('display_name').notNull(),
  bio: text('bio').notNull().default(''),
  avatarUrl: text('avatar_url').notNull().default('asset:avatar_default'),
  avatarSource: text('avatar_source').notNull().default('default'), // 'default' | 'catalogue' | 'custom'
  avatarAssetId: integer('avatar_asset_id'),
  bannerUrl: text('banner_url').notNull().default('asset:shadow_monarch'),
  selectedCharacterId: integer('selected_character_id'),
  favouriteCharacter: text('favourite_character').notNull().default(''),
  favouriteCharacterAnime: text('favourite_character_anime').notNull().default(''),
  favouriteCharacterMalId: integer('favourite_character_mal_id'),
  characterReason: text('character_reason').notNull().default(''),
  equippedTitle: text('equipped_title').notNull().default(''),
  equippedFrame: text('equipped_frame').notNull().default('default'),
  equippedTheme: text('equipped_theme').notNull().default('shadow_default'),
  favoriteStickers: jsonb('favorite_stickers').$type<string[]>().notNull().default([]),
  recentStickers: jsonb('recent_stickers').$type<string[]>().notNull().default([]),
  shadowQualities: jsonb('shadow_qualities').$type<string[]>().notNull().default([]),
  shadowLabel: text('shadow_label').notNull().default(''),
  shadowBadgePublic: boolean('shadow_badge_public').notNull().default(true),
  favoriteGenres: jsonb('favorite_genres').$type<string[]>().notNull().default([]),
  isPrivate: boolean('is_private').notNull().default(false),
  showActivity: boolean('show_activity').notNull().default(true),
  showWatchlist: boolean('show_watchlist').notNull().default(true),
  commentPermission: text('comment_permission').notNull().default('everyone'), // 'everyone' | 'followers' | 'nobody'
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    sessionId: text('session_id').notNull().unique(),
    userAgent: text('user_agent').default(''),
    revokedAt: timestamp('revoked_at'),
    lastActiveAt: timestamp('last_active_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_sessions_user').on(t.userUid)]
);

export const userFollows = pgTable(
  'user_follows',
  {
    id: serial('id').primaryKey(),
    followerUid: text('follower_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    followingUid: text('following_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    isSimulated: boolean('is_simulated').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_user_follow').on(t.followerUid, t.followingUid),
    index('idx_follows_following').on(t.followingUid),
    index('idx_follows_follower').on(t.followerUid),
    index('idx_follows_following_sim').on(t.followingUid, t.isSimulated),
    index('idx_follows_follower_sim').on(t.followerUid, t.isSimulated),
  ]
);

export const blockedUsers = pgTable(
  'blocked_users',
  {
    id: serial('id').primaryKey(),
    blockerUid: text('blocker_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    blockedUid: text('blocked_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_blocked_user').on(t.blockerUid, t.blockedUid),
    index('idx_blocked_target').on(t.blockedUid),
  ]
);

export const mutedUsers = pgTable(
  'muted_users',
  {
    id: serial('id').primaryKey(),
    muterUid: text('muter_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    mutedUid: text('muted_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('uniq_muted_user').on(t.muterUid, t.mutedUid)]
);

export const restrictedUsers = pgTable(
  'restricted_users',
  {
    id: serial('id').primaryKey(),
    restricterUid: text('restricter_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    restrictedUid: text('restricted_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('uniq_restricted_user').on(t.restricterUid, t.restrictedUid)]
);

export const profileAlertPrefs = pgTable(
  'profile_alert_prefs',
  {
    id: serial('id').primaryKey(),
    subscriberUid: text('subscriber_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    targetUid: text('target_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    notifyPosts: boolean('notify_posts').notNull().default(true),
    notifyReviews: boolean('notify_reviews').notNull().default(true),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('uniq_profile_alert_pref').on(t.subscriberUid, t.targetUid)]
);

export const profileVisits = pgTable(
  'profile_visits',
  {
    id: serial('id').primaryKey(),
    profileOwnerUid: text('profile_owner_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    visitorUid: text('visitor_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    visitedAt: timestamp('visited_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_profile_visits_owner_time').on(t.profileOwnerUid, t.visitedAt),
    index('idx_profile_visits_dedup').on(t.profileOwnerUid, t.visitorUid, t.visitedAt),
  ]
);

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: serial('id').primaryKey(),
    ownerUid: text('owner_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    purpose: text('purpose').notNull(), // 'avatar' | 'post_image' | 'post_video' | 'post_poster' | 'dm_image' | 'dm_video' | 'guild_media' | 'clash_image' | 'clash_video'
    visibility: text('visibility').notNull().default('public'), // 'public' | 'authenticated' | 'private_conversation' | 'private_guild' | 'clash_entry'
    conversationId: integer('conversation_id'),
    communityId: integer('community_id'),
    clashId: integer('clash_id'),
    mimeType: text('mime_type').notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationSec: integer('duration_sec'),
    sha256: text('sha256').notNull(),
    moderationStatus: text('moderation_status').notNull().default('verified'),
    dataBase64: text('data_base64').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_media_assets_owner').on(t.ownerUid),
    index('idx_media_assets_conv').on(t.conversationId),
    index('idx_media_assets_comm').on(t.communityId),
    index('idx_media_assets_clash').on(t.clashId),
  ]
);

export const communities = pgTable(
  'communities',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    nameNormalized: text('name_normalized'),
    description: text('description').notNull(),
    category: text('category').notNull().default('Anime Franchise'),
    rules: text('rules')
      .notNull()
      .default('Respect spoiler tags, fellow hunters, and guild moderators.'),
    privacyMode: text('privacy_mode').notNull().default('public'), // 'public' | 'approval' | 'private'
    joinPolicy: text('join_policy').notNull().default('open'), // 'open' | 'approval' | 'invite_only'
    artworkUrl: text('artwork_url').notNull(),
    bannerUrl: text('banner_url'),
    chatBannerUrl: text('chat_banner_url'),
    tagline: text('tagline').notNull().default(''),
    isVerified: boolean('is_verified').notNull().default(false),
    animeMalId: integer('anime_mal_id'),
    animeTitle: text('anime_title'),
    genreTags: jsonb('genre_tags').$type<string[]>().notNull().default([]),
    ownerUid: text('owner_uid').references(() => users.uid, { onDelete: 'set null' }),
    communityXp: integer('community_xp').notNull().default(0),
    communityLevel: integer('community_level').notNull().default(1),
    equippedTheme: text('equipped_theme').notNull().default('crimson_gate'),
    roomSlots: integer('room_slots').notNull().default(2),
    isArchived: boolean('is_archived').notNull().default(false),
    isSeed: boolean('is_seed').notNull().default(false),
    isAiDemo: boolean('is_ai_demo').notNull().default(false),
    memberCount: integer('member_count').notNull().default(0),
    humanMemberCount: integer('human_member_count').notNull().default(0),
    demoMemberCount: integer('demo_member_count').notNull().default(0),
    discussionCount: integer('discussion_count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_communities_anime').on(t.animeMalId),
    index('idx_communities_level').on(t.communityLevel),
    index('idx_communities_created').on(t.createdAt),
    uniqueIndex('uniq_communities_name_norm').on(t.nameNormalized),
  ]
);

export const communityMemberships = pgTable(
  'community_memberships',
  {
    id: serial('id').primaryKey(),
    communityId: integer('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    role: text('role').notNull().default('member'), // 'owner' | 'admin' | 'moderator' | 'member'
    isMuted: boolean('is_muted').notNull().default(false),
    mutedUntil: timestamp('muted_until'),
    isSimulated: boolean('is_simulated').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_community_membership').on(t.communityId, t.userUid),
    index('idx_membership_user').on(t.userUid),
    index('idx_membership_comm_role').on(t.communityId, t.role),
    index('idx_membership_comm_sim').on(t.communityId, t.isSimulated),
  ]
);

export interface PulseMediaItem {
  url: string;
  posterUrl?: string | null;
  mediaType: 'image' | 'video';
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  assetId?: number | null;
}

export interface PulseCharacterTag {
  id?: number | null;
  malId?: number | null;
  name: string;
  animeTitle?: string | null;
  avatarUrl?: string | null;
}

export interface DiscussionPollOption {
  id: string;
  text: string;
  votes: number;
}

export const discussions = pgTable(
  'discussions',
  {
    id: serial('id').primaryKey(),
    authorUid: text('author_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    communityId: integer('community_id').references(() => communities.id, {
      onDelete: 'cascade',
    }),
    animeMalId: integer('anime_mal_id'),
    animeTitle: text('anime_title'),
    characterTag: jsonb('character_tag').$type<PulseCharacterTag | null>(),
    genreTags: jsonb('genre_tags').$type<string[]>().notNull().default([]),
    hashtags: jsonb('hashtags').$type<string[]>().notNull().default([]),
    mentionedUids: jsonb('mentioned_uids').$type<string[]>().notNull().default([]),
    quoteOfPostId: integer('quote_of_post_id'),
    repostOfPostId: integer('repost_of_post_id'),
    kind: text('kind').notNull().default('discussion'), // 'discussion' | 'pulse' | 'review' | 'profile_post' | 'announcement'
    isAnnouncement: boolean('is_announcement').notNull().default(false),
    title: text('title').notNull(),
    content: text('content').notNull(),
    mediaUrl: text('media_url'),
    mediaType: text('media_type').notNull().default('image'), // 'none' | 'image' | 'video' | 'carousel'
    mediaItems: jsonb('media_items').$type<PulseMediaItem[]>().notNull().default([]),
    posterUrl: text('poster_url'),
    mediaDurationSec: integer('media_duration_sec'),
    pollQuestion: text('poll_question'),
    pollOptions: jsonb('poll_options').$type<DiscussionPollOption[] | null>(),
    rating: integer('rating'),
    isPinned: boolean('is_pinned').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    archivedAt: timestamp('archived_at'),
    editedAt: timestamp('edited_at'),
    moderationNotice: text('moderation_notice'),
    isSeed: boolean('is_seed').notNull().default(false),
    isAiGenerated: boolean('is_ai_generated').notNull().default(false),
    likeCount: integer('like_count').notNull().default(0),
    demoLikeCount: integer('demo_like_count').notNull().default(0),
    commentCount: integer('comment_count').notNull().default(0),
    demoCommentCount: integer('demo_comment_count').notNull().default(0),
    repostCount: integer('repost_count').notNull().default(0),
    demoRepostCount: integer('demo_repost_count').notNull().default(0),
    shareCount: integer('share_count').notNull().default(0),
    demoShareCount: integer('demo_share_count').notNull().default(0),
    bookmarkCount: integer('bookmark_count').notNull().default(0),
    playCount: integer('play_count').notNull().default(0),
    qualifiedViewCount: integer('qualified_view_count').notNull().default(0),
    totalWatchSeconds: integer('total_watch_seconds').notNull().default(0),
    showViewCountPublicly: boolean('show_view_count_publicly').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_discussions_community').on(t.communityId),
    index('idx_discussions_anime').on(t.animeMalId),
    index('idx_discussions_author').on(t.authorUid),
    index('idx_discussions_created').on(t.createdAt),
    index('idx_discussions_archived').on(t.authorUid, t.isArchived),
    index('idx_discussions_quote').on(t.quoteOfPostId),
    index('idx_discussions_repost_of').on(t.repostOfPostId),
    index('idx_discussions_feed').on(t.isArchived, t.isPinned, t.createdAt),
    index('idx_discussions_ai_gen').on(t.isAiGenerated, t.createdAt),
  ]
);

export const communityPosts = pgTable(
  'community_posts',
  {
    id: serial('id').primaryKey(),
    communityId: integer('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    discussionId: integer('discussion_id')
      .notNull()
      .references(() => discussions.id, { onDelete: 'cascade' }),
    authorUid: text('author_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    topicType: text('topic_type').notNull().default('discussion'), // 'discussion' | 'character_debate' | 'episode_reaction' | 'fan_theory' | 'recommendation' | 'poll' | 'artwork' | 'announcement'
    isAiGenerated: boolean('is_ai_generated').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_community_post_disc').on(t.discussionId),
    index('idx_community_posts_comm_time').on(t.communityId, t.createdAt),
    index('idx_community_posts_author').on(t.authorUid, t.createdAt),
  ]
);

export const discussionPollVotes = pgTable(
  'discussion_poll_votes',
  {
    id: serial('id').primaryKey(),
    discussionId: integer('discussion_id')
      .notNull()
      .references(() => discussions.id, { onDelete: 'cascade' }),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    optionId: text('option_id').notNull(),
    isSimulated: boolean('is_simulated').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_discussion_poll_vote').on(t.discussionId, t.userUid),
    index('idx_discussion_poll_votes_disc').on(t.discussionId),
  ]
);

export const pulseReposts = pgTable(
  'pulse_reposts',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    postId: integer('post_id')
      .notNull()
      .references(() => discussions.id, { onDelete: 'cascade' }),
    isSimulated: boolean('is_simulated').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_pulse_repost').on(t.userUid, t.postId),
    index('idx_pulse_reposts_user_time').on(t.userUid, t.createdAt),
    index('idx_pulse_reposts_post').on(t.postId),
    index('idx_pulse_reposts_post_sim').on(t.postId, t.isSimulated),
  ]
);

export const postShares = pgTable(
  'post_shares',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .notNull()
      .references(() => discussions.id, { onDelete: 'cascade' }),
    userUid: text('user_uid').references(() => users.uid, { onDelete: 'cascade' }),
    shareChannel: text('share_channel').notNull().default('copy_link'), // 'copy_link' | 'direct_message' | 'community' | 'external'
    isSimulated: boolean('is_simulated').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_post_shares_post_sim').on(t.postId, t.isSimulated),
    index('idx_post_shares_user_time').on(t.userUid, t.createdAt),
    uniqueIndex('uniq_post_share_user_sim').on(t.postId, t.userUid, t.isSimulated),
  ]
);

export const savedPosts = pgTable(
  'saved_posts',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    postId: integer('post_id')
      .notNull()
      .references(() => discussions.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_saved_post').on(t.userUid, t.postId),
    index('idx_saved_posts_user').on(t.userUid, t.createdAt),
  ]
);

export const videoViewEvents = pgTable(
  'video_view_events',
  {
    id: serial('id').primaryKey(),
    postId: integer('post_id')
      .notNull()
      .references(() => discussions.id, { onDelete: 'cascade' }),
    viewerKey: text('viewer_key').notNull(),
    viewerUid: text('viewer_uid').references(() => users.uid, { onDelete: 'set null' }),
    eventType: text('event_type').notNull(), // 'play' | 'qualified_view'
    watchedSeconds: integer('watched_seconds').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_video_views_post_viewer').on(t.postId, t.viewerKey, t.eventType, t.createdAt),
    index('idx_video_views_post').on(t.postId, t.eventType),
  ]
);

export const animeReviews = pgTable(
  'anime_reviews',
  {
    id: serial('id').primaryKey(),
    authorUid: text('author_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    animeMalId: integer('anime_mal_id').notNull(),
    animeTitle: text('anime_title').notNull(),
    animeImageUrl: text('anime_image_url').notNull(),
    rating: integer('rating'), // optional 1..10
    title: text('title').notNull(),
    content: text('content').notNull(),
    containsSpoilers: boolean('contains_spoilers').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_anime_reviews_author').on(t.authorUid, t.createdAt),
    index('idx_anime_reviews_anime').on(t.animeMalId),
  ]
);

export const passwordResetTokens = pgTable(
  'password_reset_tokens',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at').notNull(),
    usedAt: timestamp('used_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_pwd_reset_user').on(t.userUid)]
);

export const comments = pgTable(
  'comments',
  {
    id: serial('id').primaryKey(),
    discussionId: integer('discussion_id')
      .notNull()
      .references(() => discussions.id, { onDelete: 'cascade' }),
    authorUid: text('author_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    parentCommentId: integer('parent_comment_id'),
    content: text('content').notNull(),
    stickerId: text('sticker_id'),
    mentionedUids: jsonb('mentioned_uids').$type<string[]>().notNull().default([]),
    isRestrictedShadow: boolean('is_restricted_shadow').notNull().default(false),
    isDeleted: boolean('is_deleted').notNull().default(false),
    editedAt: timestamp('edited_at'),
    isAiGenerated: boolean('is_ai_generated').notNull().default(false),
    likeCount: integer('like_count').notNull().default(0),
    demoLikeCount: integer('demo_like_count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_comments_discussion').on(t.discussionId),
    index('idx_comments_author').on(t.authorUid),
    index('idx_comments_disc_parent_time').on(t.discussionId, t.parentCommentId, t.createdAt),
    index('idx_comments_disc_sim').on(t.discussionId, t.isAiGenerated),
  ]
);

export const reactions = pgTable(
  'reactions',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(), // 'discussion' | 'comment'
    targetId: integer('target_id').notNull(),
    reactionType: text('reaction_type').notNull().default('like'), // 'like' | 'bookmark' | 'repost'
    isSimulated: boolean('is_simulated').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_reaction').on(t.userUid, t.targetType, t.targetId, t.reactionType),
    index('idx_reactions_target').on(t.targetType, t.targetId),
    index('idx_reactions_target_sim').on(t.targetType, t.targetId, t.reactionType, t.isSimulated),
  ]
);

export const voiceRooms = pgTable(
  'voice_rooms',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    topic: text('topic').notNull(),
    description: text('description').notNull().default(''),
    category: text('category').notNull().default('Anime Vibes'),
    rules: text('rules')
      .notNull()
      .default('Respect speakers, tag spoilers, and honour moderator guidance.'),
    language: text('language').notNull().default('English'),
    roomType: text('room_type').notNull().default('casual'), // 'casual' | 'debate' | 'trivia' | 'event' | 'watch_party'
    mediaMode: text('media_mode').notNull().default('voice'), // 'voice' | 'video'
    joinMode: text('join_mode').notNull().default('open'), // 'open' | 'approval' | 'invite_only'
    isLocked: boolean('is_locked').notNull().default(false),
    chatEnabled: boolean('chat_enabled').notNull().default(true),
    speakerLimit: integer('speaker_limit').notNull().default(12),
    avatarUrl: text('avatar_url').notNull().default('/assets/zenitsu-avatar.png'),
    artworkUrl: text('artwork_url').notNull().default('asset:thunder'),
    communityId: integer('community_id').references(() => communities.id, {
      onDelete: 'set null',
    }),
    animeMalId: integer('anime_mal_id'),
    genreTags: jsonb('genre_tags').$type<string[]>().notNull().default([]),
    hostUid: text('host_uid').references(() => users.uid, { onDelete: 'set null' }),
    capacity: integer('capacity').notNull().default(60),
    isActive: boolean('is_active').notNull().default(true),
    isSeed: boolean('is_seed').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_voice_rooms_active').on(t.isActive),
    index('idx_voice_rooms_community').on(t.communityId),
  ]
);

export const voiceRoomMembers = pgTable(
  'voice_room_members',
  {
    id: serial('id').primaryKey(),
    roomId: integer('room_id')
      .notNull()
      .references(() => voiceRooms.id, { onDelete: 'cascade' }),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    role: text('role').notNull().default('listener'), // 'host' | 'co_host' | 'moderator' | 'speaker' | 'listener'
    seatNumber: integer('seat_number'),
    isMuted: boolean('is_muted').notNull().default(true),
    isCameraOn: boolean('is_camera_on').notNull().default(false),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_voice_room_member').on(t.roomId, t.userUid),
    index('idx_voice_members_room').on(t.roomId),
  ]
);

export const voiceRoomMessages = pgTable(
  'voice_room_messages',
  {
    id: serial('id').primaryKey(),
    roomId: integer('room_id')
      .notNull()
      .references(() => voiceRooms.id, { onDelete: 'cascade' }),
    senderUid: text('sender_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    messageType: text('message_type').notNull().default('text'), // 'text' | 'system'
    replyToMessageId: integer('reply_to_message_id'),
    mentionedUids: jsonb('mentioned_uids').$type<string[]>().notNull().default([]),
    reactionsJson: jsonb('reactions_json')
      .$type<Record<string, string[]>>()
      .notNull()
      .default({}),
    isDeleted: boolean('is_deleted').notNull().default(false),
    deletedByUid: text('deleted_by_uid'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_voice_room_messages_room').on(t.roomId, t.createdAt),
    index('idx_voice_room_messages_room_id').on(t.roomId, t.id),
  ]
);

export const clashes = pgTable(
  'clashes',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    rules: text('rules')
      .notNull()
      .default('One vote per authenticated hunter during the active voting window.'),
    category: text('category').notNull().default('Who Can Win Fight?'),
    clashMode: text('clash_mode').notNull().default('solo_character'), // 'user_duel' | 'community_duel' | 'solo_character'
    status: text('status').notNull().default('live'), // 'pending_acceptance' | 'declined' | 'scheduled' | 'awaiting_entries' | 'live' | 'voting_closed' | 'completed' | 'cancelled' | 'expired'
    tieRule: text('tie_rule').notNull().default('draw'), // 'draw' | 'challenger_advantage' | 'sudden_death_first_vote'
    visibility: text('visibility').notNull().default('public'), // 'public' | 'members_only' | 'hidden_mod'
    leftName: text('left_name').notNull(),
    leftSubtitle: text('left_subtitle').notNull().default('Challenger'),
    leftImageUrl: text('left_image_url').notNull(),
    leftAnimeMalId: integer('left_anime_mal_id'),
    leftCharacterId: integer('left_character_id'),
    rightName: text('right_name').notNull(),
    rightSubtitle: text('right_subtitle').notNull().default('Accepter'),
    rightImageUrl: text('right_image_url').notNull(),
    rightAnimeMalId: integer('right_anime_mal_id'),
    rightCharacterId: integer('right_character_id'),
    challengerUid: text('challenger_uid').references(() => users.uid, { onDelete: 'set null' }),
    opponentUid: text('opponent_uid').references(() => users.uid, { onDelete: 'set null' }),
    challengerCommunityId: integer('challenger_community_id').references(() => communities.id, {
      onDelete: 'set null',
    }),
    opponentCommunityId: integer('opponent_community_id').references(() => communities.id, {
      onDelete: 'set null',
    }),
    acceptedByUid: text('accepted_by_uid').references(() => users.uid, { onDelete: 'set null' }),
    genreTags: jsonb('genre_tags').$type<string[]>().notNull().default([]),
    creatorUid: text('creator_uid').references(() => users.uid, { onDelete: 'set null' }),
    leftVotes: integer('left_votes').notNull().default(0),
    rightVotes: integer('right_votes').notNull().default(0),
    allowVoteChange: boolean('allow_vote_change').notNull().default(false),
    hasRewards: boolean('has_rewards').notNull().default(false),
    winnerSide: text('winner_side'), // 'left' | 'right' | 'tie' | null
    inviteExpiresAt: timestamp('invite_expires_at'),
    entryDeadlineAt: timestamp('entry_deadline_at'),
    startsAt: timestamp('starts_at'),
    endsAt: timestamp('ends_at'),
    acceptedAt: timestamp('accepted_at'),
    declinedAt: timestamp('declined_at'),
    completedAt: timestamp('completed_at'),
    rewardsDistributedAt: timestamp('rewards_distributed_at'),
    isSeed: boolean('is_seed').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_clashes_mode_status').on(t.clashMode, t.status, t.createdAt),
    index('idx_clashes_status_ends').on(t.status, t.endsAt),
    index('idx_clashes_challenger_uid').on(t.challengerUid),
    index('idx_clashes_opponent_uid').on(t.opponentUid),
    index('idx_clashes_challenger_comm').on(t.challengerCommunityId),
    index('idx_clashes_opponent_comm').on(t.opponentCommunityId),
  ]
);

export const clashVotes = pgTable(
  'clash_votes',
  {
    id: serial('id').primaryKey(),
    clashId: integer('clash_id')
      .notNull()
      .references(() => clashes.id, { onDelete: 'cascade' }),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    side: text('side').notNull(), // 'left' | 'right'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_clash_vote').on(t.clashId, t.userUid),
    index('idx_clash_votes_clash_side').on(t.clashId, t.side),
  ]
);

export const clashEntries = pgTable(
  'clash_entries',
  {
    id: serial('id').primaryKey(),
    clashId: integer('clash_id')
      .notNull()
      .references(() => clashes.id, { onDelete: 'cascade' }),
    side: text('side').notNull(), // 'left' | 'right'
    submittedByUid: text('submitted_by_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    communityId: integer('community_id').references(() => communities.id, {
      onDelete: 'set null',
    }),
    title: text('title').notNull().default(''),
    caption: text('caption').notNull().default(''),
    mediaType: text('media_type').notNull(), // 'image' | 'video'
    mediaUrl: text('media_url').notNull(),
    posterUrl: text('poster_url'),
    mediaAssetId: integer('media_asset_id'),
    mimeType: text('mime_type').notNull(),
    width: integer('width'),
    height: integer('height'),
    durationSec: integer('duration_sec'),
    byteSize: integer('byte_size'),
    submittedAt: timestamp('submitted_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_clash_entry_side').on(t.clashId, t.side),
    index('idx_clash_entries_clash').on(t.clashId),
  ]
);

export const clashRewards = pgTable(
  'clash_rewards',
  {
    id: serial('id').primaryKey(),
    clashId: integer('clash_id')
      .notNull()
      .references(() => clashes.id, { onDelete: 'cascade' }),
    sourceKind: text('source_kind').notNull(), // 'user_reward' | 'community_reward'
    sourceRewardId: integer('source_reward_id').notNull(),
    stakedByUid: text('staked_by_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    stakedByCommunityId: integer('staked_by_community_id').references(() => communities.id, {
      onDelete: 'set null',
    }),
    rewardKey: text('reward_key').notNull(),
    rewardType: text('reward_type').notNull(),
    label: text('label').notNull(),
    description: text('description').notNull().default(''),
    rarity: text('rarity').notNull().default('rare'),
    accentColor: text('accent_color').notNull().default('#C0263D'),
    status: text('status').notNull().default('escrowed'), // 'escrowed' | 'awarded' | 'released'
    awardedToCommunityId: integer('awarded_to_community_id').references(() => communities.id, {
      onDelete: 'set null',
    }),
    awardedToUid: text('awarded_to_uid').references(() => users.uid, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at'),
  },
  (t) => [
    index('idx_clash_rewards_clash').on(t.clashId),
    uniqueIndex('uniq_clash_staked_reward').on(t.clashId, t.sourceKind, t.sourceRewardId),
  ]
);

export const clashRewardVotes = pgTable(
  'clash_reward_votes',
  {
    id: serial('id').primaryKey(),
    clashId: integer('clash_id')
      .notNull()
      .references(() => clashes.id, { onDelete: 'cascade' }),
    clashRewardId: integer('clash_reward_id')
      .notNull()
      .references(() => clashRewards.id, { onDelete: 'cascade' }),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_clash_reward_vote').on(t.clashId, t.userUid),
    index('idx_clash_reward_votes_reward').on(t.clashRewardId),
  ]
);

export const userAnimeEntries = pgTable(
  'user_anime_entries',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    animeMalId: integer('anime_mal_id').notNull(),
    animeTitle: text('anime_title').notNull(),
    animeImageUrl: text('anime_image_url').notNull(),
    genres: jsonb('genres').$type<string[]>().notNull().default([]),
    status: text('status').notNull().default('plan_to_watch'), // 'watching' | 'completed' | 'plan_to_watch' | 'on_hold' | 'dropped' | 'favorited'
    score: integer('score'), // 1..10
    episodesWatched: integer('episodes_watched').notNull().default(0),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_user_anime').on(t.userUid, t.animeMalId),
    index('idx_user_anime_user').on(t.userUid),
  ]
);

export const userGenreRatings = pgTable(
  'user_genre_ratings',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    genre: text('genre').notNull(),
    rating: integer('rating').notNull(), // 1..10
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_user_genre_rating').on(t.userUid, t.genre),
    index('idx_user_genre_user').on(t.userUid),
  ]
);

export const conversations = pgTable(
  'conversations',
  {
    id: serial('id').primaryKey(),
    creatorUid: text('creator_uid').references(() => users.uid, { onDelete: 'set null' }),
    directPairKey: text('direct_pair_key'),
    title: text('title'),
    isGroup: boolean('is_group').notNull().default(false),
    avatarUrl: text('avatar_url'),
    theme: text('theme').notNull().default('shadow_default'),
    lastMessageId: integer('last_message_id'),
    lastMessagePreview: text('last_message_preview').default(''),
    lastMessageAt: timestamp('last_message_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_conversations_updated').on(t.updatedAt),
    uniqueIndex('uniq_conversations_direct_pair').on(t.directPairKey),
  ]
);

export const conversationMembers = pgTable(
  'conversation_members',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    requestStatus: text('request_status').notNull().default('accepted'), // 'accepted' | 'pending' | 'declined'
    isMuted: boolean('is_muted').notNull().default(false),
    isArchived: boolean('is_archived').notNull().default(false),
    markedUnread: boolean('marked_unread').notNull().default(false),
    lastReadMessageId: integer('last_read_message_id'),
    lastDeliveredMessageId: integer('last_delivered_message_id'),
    theme: text('theme'),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
    lastReadAt: timestamp('last_read_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_conversation_member').on(t.conversationId, t.userUid),
    index('idx_conv_members_user').on(t.userUid, t.isArchived, t.requestStatus),
  ]
);

export interface MessageAttachmentMeta {
  assetId?: number;
  width?: number | null;
  height?: number | null;
  durationSec?: number | null;
  mimeType?: string;
}

export const messages = pgTable(
  'messages',
  {
    id: serial('id').primaryKey(),
    conversationId: integer('conversation_id')
      .notNull()
      .references(() => conversations.id, { onDelete: 'cascade' }),
    senderUid: text('sender_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    content: text('content').notNull(),
    messageType: text('message_type').notNull().default('text'), // 'text' | 'sticker' | 'gift' | 'media' | 'post_share'
    stickerId: text('sticker_id'),
    giftId: text('gift_id'),
    attachmentUrl: text('attachment_url'),
    attachmentPosterUrl: text('attachment_poster_url'),
    attachmentType: text('attachment_type'), // 'image' | 'video' | null
    attachmentMeta: jsonb('attachment_meta').$type<MessageAttachmentMeta | null>(),
    sharedPostId: integer('shared_post_id'),
    replyToMessageId: integer('reply_to_message_id'),
    idempotencyKey: text('idempotency_key'),
    reactionsJson: jsonb('reactions_json')
      .$type<Record<string, string[]>>()
      .notNull()
      .default({}),
    deliveredAt: timestamp('delivered_at'),
    readAt: timestamp('read_at'),
    editedAt: timestamp('edited_at'),
    deletedAt: timestamp('deleted_at'),
    isDeleted: boolean('is_deleted').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_messages_conv').on(t.conversationId, t.createdAt),
    index('idx_messages_conv_id').on(t.conversationId, t.id),
    uniqueIndex('uniq_messages_idempotency').on(t.senderUid, t.idempotencyKey),
  ]
);

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    recipientUid: text('recipient_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    actorUid: text('actor_uid').references(() => users.uid, { onDelete: 'set null' }),
    type: text('type').notNull(), // 'comment' | 'reply' | 'reaction' | 'follow' | 'mention' | 'repost' | 'quote_repost' | 'direct_message' | 'message_request' | 'guild_activity' | 'voice_invite' | 'challenge' | 'announcement' | 'new_post' | 'system'
    category: text('category').notNull().default('social'), // 'social' | 'messages' | 'communities' | 'challenges' | 'system'
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    groupKey: text('group_key'),
    thumbnailUrl: text('thumbnail_url'),
    title: text('title').notNull(),
    body: text('body').default(''),
    linkUrl: text('link_url').default('/'),
    isRead: boolean('is_read').notNull().default(false),
    isDismissed: boolean('is_dismissed').notNull().default(false),
    isSimulated: boolean('is_simulated').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_notifications_recipient').on(t.recipientUid, t.createdAt),
    index('idx_notifications_inbox_filter').on(
      t.recipientUid,
      t.isDismissed,
      t.isRead,
      t.category,
      t.createdAt
    ),
  ]
);

export const userSettings = pgTable('user_settings', {
  userUid: text('user_uid')
    .primaryKey()
    .references(() => users.uid, { onDelete: 'cascade' }),
  emailNotifications: boolean('email_notifications').notNull().default(true),
  marketingEmails: boolean('marketing_emails').notNull().default(false),
  notifyFollows: boolean('notify_follows').notNull().default(true),
  notifyComments: boolean('notify_comments').notNull().default(true),
  notifyReactions: boolean('notify_reactions').notNull().default(true),
  notifyMentions: boolean('notify_mentions').notNull().default(true),
  notifyReposts: boolean('notify_reposts').notNull().default(true),
  notifyMessages: boolean('notify_messages').notNull().default(true),
  notifyGuilds: boolean('notify_guilds').notNull().default(true),
  notifyCommunity: boolean('notify_community').notNull().default(true),
  notifyChallenges: boolean('notify_challenges').notNull().default(true),
  notifyVoiceInvites: boolean('notify_voice_invites').notNull().default(true),
  notifySystem: boolean('notify_system').notNull().default(true),
  allowDirectMessages: text('allow_direct_messages').notNull().default('everyone'), // 'everyone' | 'followers' | 'nobody'
  messageRequestMode: text('message_request_mode').notNull().default('non_followers'), // 'non_followers' | 'off'
  showOnlineStatus: boolean('show_online_status').notNull().default(true),
  showReadReceipts: boolean('show_read_receipts').notNull().default(true),
  pulseFeedTab: text('pulse_feed_tab').notNull().default('for_you'),
  profileVisitHistory: text('profile_visit_history').notNull().default('record'), // 'record' | 'pause'
  defaultPublicVideoViews: boolean('default_public_video_views').notNull().default(true),
  discoverableInSearch: boolean('discoverable_in_search').notNull().default(true),
  themeAccent: text('theme_accent').notNull().default('crimson'), // 'crimson' | 'violet' | 'gold'
  highContrast: boolean('high_contrast').notNull().default(false),
  largerText: boolean('larger_text').notNull().default(false),
  reducedMotion: boolean('reduced_motion').notNull().default(false),
  skipIntroAlways: boolean('skip_intro_always').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const reports = pgTable(
  'reports',
  {
    id: serial('id').primaryKey(),
    reporterUid: text('reporter_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    targetType: text('target_type').notNull(), // 'discussion' | 'post' | 'comment' | 'community' | 'user' | 'voice_room'
    targetId: text('target_id').notNull(),
    reason: text('reason').notNull(),
    details: text('details').default(''),
    status: text('status').notNull().default('open'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_reports_status').on(t.status)]
);

export const animeCatalog = pgTable(
  'anime_catalog',
  {
    id: serial('id').primaryKey(),
    canonicalId: integer('canonical_id').notNull().unique(),
    malId: integer('mal_id'),
    anilistId: integer('anilist_id'),
    provider: text('provider').notNull().default('anilist'), // 'anilist' | 'jikan' | 'verified_seed'
    providerId: text('provider_id').notNull(),
    slug: text('slug').notNull(),
    titleEnglish: text('title_english'),
    titleRomaji: text('title_romaji').notNull(),
    titleNative: text('title_native'),
    normalizedTitle: text('normalized_title').notNull(),
    synonyms: jsonb('synonyms').$type<string[]>().notNull().default([]),
    synopsis: text('synopsis').notNull().default(''),
    coverImageUrl: text('cover_image_url').notNull(),
    bannerImageUrl: text('banner_image_url'),
    releaseYear: integer('release_year'),
    season: text('season'),
    format: text('format'), // 'TV' | 'TV_SHORT' | 'MOVIE' | 'OVA' | 'ONA' | 'SPECIAL' | 'MUSIC'
    episodes: integer('episodes'),
    durationMins: integer('duration_mins'),
    averageScore: integer('average_score'), // 0..100 integer scale (e.g. 85 => 8.5/10)
    scoreSource: text('score_source').notNull().default('AniList'), // 'AniList' | 'MyAnimeList'
    popularity: integer('popularity').notNull().default(0),
    trending: integer('trending').notNull().default(0),
    favourites: integer('favourites').notNull().default(0),
    status: text('status'), // 'RELEASING' | 'FINISHED' | 'NOT_YET_RELEASED' | 'CANCELLED' | 'HIATUS'
    startDate: text('start_date'),
    endDate: text('end_date'),
    studios: jsonb('studios').$type<string[]>().notNull().default([]),
    streamingLinks: jsonb('streaming_links')
      .$type<
        {
          name: string;
          url: string;
          language?: string | null;
          type?: string | null;
        }[]
      >()
      .notNull()
      .default([]),
    trailerUrl: text('trailer_url'),
    providerUrl: text('provider_url'),
    primaryCategory: text('primary_category'),
    isAdult: boolean('is_adult').notNull().default(false),
    lastSyncedAt: timestamp('last_synced_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_anime_catalog_provider').on(t.provider, t.providerId),
    index('idx_anime_catalog_mal').on(t.malId),
    index('idx_anime_catalog_anilist').on(t.anilistId),
    index('idx_anime_catalog_norm_title').on(t.normalizedTitle),
    index('idx_anime_catalog_primary_cat').on(t.primaryCategory),
    index('idx_anime_catalog_year').on(t.releaseYear),
    index('idx_anime_catalog_format').on(t.format),
    index('idx_anime_catalog_status').on(t.status),
    index('idx_anime_catalog_popularity').on(t.popularity),
    index('idx_anime_catalog_score').on(t.averageScore),
    index('idx_anime_catalog_trending').on(t.trending),
  ]
);

export const animeGenres = pgTable('anime_genres', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
});

export const animeCatalogGenres = pgTable(
  'anime_catalog_genres',
  {
    id: serial('id').primaryKey(),
    animeId: integer('anime_id')
      .notNull()
      .references(() => animeCatalog.id, { onDelete: 'cascade' }),
    genreId: integer('genre_id')
      .notNull()
      .references(() => animeGenres.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('uniq_anime_catalog_genre').on(t.animeId, t.genreId),
    index('idx_anime_cat_genre_lookup').on(t.genreId, t.animeId),
  ]
);

export const animeTags = pgTable('anime_tags', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
});

export const animeCatalogTags = pgTable(
  'anime_catalog_tags',
  {
    id: serial('id').primaryKey(),
    animeId: integer('anime_id')
      .notNull()
      .references(() => animeCatalog.id, { onDelete: 'cascade' }),
    tagId: integer('tag_id')
      .notNull()
      .references(() => animeTags.id, { onDelete: 'cascade' }),
    rank: integer('rank').notNull().default(0),
  },
  (t) => [
    uniqueIndex('uniq_anime_catalog_tag').on(t.animeId, t.tagId),
    index('idx_anime_cat_tag_lookup').on(t.tagId, t.animeId),
  ]
);

export const userRecentlyViewed = pgTable(
  'user_recently_viewed',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    animeCanonicalId: integer('anime_canonical_id').notNull(),
    animeTitle: text('anime_title').notNull(),
    animeImageUrl: text('anime_image_url').notNull(),
    releaseYear: integer('release_year'),
    averageScore: integer('average_score'),
    scoreSource: text('score_source').default('AniList'),
    format: text('format'),
    episodes: integer('episodes'),
    viewedAt: timestamp('viewed_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_user_recently_viewed').on(t.userUid, t.animeCanonicalId),
    index('idx_user_recently_viewed_time').on(t.userUid, t.viewedAt),
  ]
);

export const characterCatalog = pgTable(
  'character_catalog',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    canonicalName: text('canonical_name').notNull(),
    normalizedName: text('normalized_name').notNull(),
    nativeName: text('native_name'),
    aliases: jsonb('aliases').$type<string[]>().notNull().default([]),
    animeTitle: text('anime_title').notNull(),
    normalizedAnime: text('normalized_anime').notNull(),
    animeMalId: integer('anime_mal_id'),
    characterMalId: integer('character_mal_id'),
    anilistCharacterId: integer('anilist_character_id'),
    provider: text('provider').notNull().default('curated'), // 'curated' | 'anilist' | 'jikan' | 'admin'
    avatarUrl: text('avatar_url').notNull(),
    bannerUrl: text('banner_url'),
    roleLabel: text('role_label').notNull().default('Main'), // 'Protagonist' | 'Main' | 'Antagonist' | 'Mentor' | 'Rival' | 'Supporting'
    faction: text('faction').notNull().default(''),
    elementOrStyle: text('element_or_style').notNull().default(''),
    archetypeTags: jsonb('archetype_tags').$type<string[]>().notNull().default([]),
    genres: jsonb('genres').$type<string[]>().notNull().default([]),
    abilities: jsonb('abilities').$type<string[]>().notNull().default([]),
    canonicalForms: jsonb('canonical_forms').$type<string[]>().notNull().default([]),
    canonicalLore: text('canonical_lore').notNull().default(''),
    attribution: text('attribution').notNull().default('AniList / MyAnimeList'),
    imageLicenseNote: text('image_license_note')
      .notNull()
      .default('Catalog reference portrait with source attribution'),
    recordStatus: text('record_status').notNull().default('active'), // 'active' | 'pending_review' | 'unavailable'
    kageMasteryBranches: jsonb('kage_mastery_branches')
      .$type<
        {
          slug: string;
          name: string;
          description: string;
          titles: string[];
          emblemColor: string;
        }[]
      >()
      .notNull()
      .default([]),
    isFeatured: boolean('is_featured').notNull().default(false),
    isHidden: boolean('is_hidden').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_char_catalog_norm_name').on(t.normalizedName),
    index('idx_char_catalog_norm_anime').on(t.normalizedAnime),
    index('idx_char_catalog_mal').on(t.characterMalId),
    index('idx_char_catalog_anilist').on(t.anilistCharacterId),
    index('idx_char_catalog_featured').on(t.isFeatured),
  ]
);

export const userCharacterHistory = pgTable(
  'user_character_history',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    characterId: integer('character_id')
      .notNull()
      .references(() => characterCatalog.id, { onDelete: 'cascade' }),
    actionType: text('action_type').notNull().default('selected'), // 'viewed' | 'selected'
    interactedAt: timestamp('interacted_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_user_char_history').on(t.userUid, t.characterId, t.actionType),
    index('idx_user_char_history_time').on(t.userUid, t.interactedAt),
  ]
);

export const userCharacterMastery = pgTable(
  'user_character_mastery',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    characterId: integer('character_id')
      .notNull()
      .references(() => characterCatalog.id, { onDelete: 'cascade' }),
    masteryXp: integer('mastery_xp').notNull().default(0),
    masteryLevel: integer('mastery_level').notNull().default(1),
    activeBranchSlug: text('active_branch_slug').notNull().default('vanguard'),
    unlockedMilestones: jsonb('unlocked_milestones').$type<string[]>().notNull().default([]),
    selectionCount: integer('selection_count').notNull().default(1),
    lastSelectedAt: timestamp('last_selected_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_user_char_mastery').on(t.userUid, t.characterId),
    index('idx_user_char_mastery_user').on(t.userUid),
  ]
);

export const xpTransactions = pgTable(
  'xp_transactions',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    characterId: integer('character_id'),
    communityId: integer('community_id'),
    actionType: text('action_type').notNull(),
    accountXpDelta: integer('account_xp_delta').notNull().default(0),
    masteryXpDelta: integer('mastery_xp_delta').notNull().default(0),
    communityXpDelta: integer('community_xp_delta').notNull().default(0),
    idempotencyKey: text('idempotency_key').unique(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    reversedAt: timestamp('reversed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_xp_tx_user_action').on(t.userUid, t.actionType, t.createdAt),
    index('idx_xp_tx_community').on(t.communityId, t.createdAt),
  ]
);

export const userRewards = pgTable(
  'user_rewards',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    rewardKey: text('reward_key').notNull(),
    rewardType: text('reward_type').notNull(), // 'title' | 'frame' | 'theme' | 'badge' | 'sticker_pack'
    label: text('label').notNull(),
    description: text('description').notNull().default(''),
    sourceType: text('source_type').notNull().default('account_level'), // 'starter' | 'account_level' | 'character_mastery' | 'community_level' | 'challenge' | 'clash_victory'
    rarity: text('rarity').notNull().default('common'), // 'common' | 'rare' | 'epic' | 'mythic'
    accentColor: text('accent_color').notNull().default('#C0263D'),
    escrowedInClashId: integer('escrowed_in_clash_id'),
    unlockedAt: timestamp('unlocked_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_user_reward_key').on(t.userUid, t.rewardKey),
    index('idx_user_rewards_user').on(t.userUid, t.rewardType),
    index('idx_user_rewards_escrow').on(t.escrowedInClashId),
  ]
);

export const communityRewards = pgTable(
  'community_rewards',
  {
    id: serial('id').primaryKey(),
    communityId: integer('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    levelGranted: integer('level_granted').notNull(),
    rewardKey: text('reward_key').notNull(),
    rewardType: text('reward_type').notNull(), // 'theme' | 'banner' | 'badge' | 'sticker_pack' | 'voice_theme' | 'room_slot' | 'challenge_crest'
    title: text('title').notNull(),
    description: text('description').notNull(),
    escrowedInClashId: integer('escrowed_in_clash_id'),
    unlockedAt: timestamp('unlocked_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_community_level_reward').on(t.communityId, t.levelGranted),
    index('idx_community_rewards_comm').on(t.communityId),
    index('idx_community_rewards_escrow').on(t.escrowedInClashId),
  ]
);

export const communityJoinRequests = pgTable(
  'community_join_requests',
  {
    id: serial('id').primaryKey(),
    communityId: integer('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    note: text('note').notNull().default(''),
    status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
    reviewedByUid: text('reviewed_by_uid').references(() => users.uid, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    reviewedAt: timestamp('reviewed_at'),
  },
  (t) => [
    uniqueIndex('uniq_community_join_req').on(t.communityId, t.userUid),
    index('idx_community_join_req_status').on(t.communityId, t.status),
  ]
);

export const guildInvitations = pgTable(
  'guild_invitations',
  {
    id: serial('id').primaryKey(),
    communityId: integer('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    inviterUid: text('inviter_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    inviteeUid: text('invitee_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    note: text('note').notNull().default(''),
    status: text('status').notNull().default('pending'), // 'pending' | 'accepted' | 'declined' | 'revoked' | 'expired'
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    respondedAt: timestamp('responded_at'),
  },
  (t) => [
    index('idx_guild_invites_comm').on(t.communityId, t.status),
    index('idx_guild_invites_invitee').on(t.inviteeUid, t.status),
  ]
);

export const guildBans = pgTable(
  'guild_bans',
  {
    id: serial('id').primaryKey(),
    communityId: integer('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    bannedByUid: text('banned_by_uid').references(() => users.uid, {
      onDelete: 'set null',
    }),
    reason: text('reason').notNull().default(''),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_guild_ban').on(t.communityId, t.userUid),
    index('idx_guild_bans_comm').on(t.communityId),
  ]
);

export const communityModerationLogs = pgTable(
  'community_moderation_logs',
  {
    id: serial('id').primaryKey(),
    communityId: integer('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    actorUid: text('actor_uid').references(() => users.uid, { onDelete: 'set null' }),
    targetUid: text('target_uid').references(() => users.uid, { onDelete: 'cascade' }),
    actionType: text('action_type').notNull(), // 'warn' | 'mute' | 'unmute' | 'ban' | 'unban' | 'kick' | 'remove_post' | 'approve_join' | 'reject_join' | 'promote_mod' | 'promote_admin' | 'demote_member' | 'transfer_ownership' | 'edit_settings'
    reason: text('reason').notNull().default(''),
    expiresAt: timestamp('expires_at'),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_comm_mod_logs_comm').on(t.communityId, t.createdAt),
    index('idx_comm_mod_logs_target').on(t.communityId, t.targetUid, t.actionType),
  ]
);

export const communityChallenges = pgTable(
  'community_challenges',
  {
    id: serial('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    challengeType: text('challenge_type').notNull().default('discussion_surge'), // 'discussion_surge' | 'character_spotlight' | 'trivia_clash' | 'watch_rally'
    rules: text('rules').notNull(),
    status: text('status').notNull().default('active'), // 'upcoming' | 'active' | 'completed'
    startsAt: timestamp('starts_at').notNull(),
    endsAt: timestamp('ends_at').notNull(),
    winnerCommunityId: integer('winner_community_id').references(() => communities.id, {
      onDelete: 'set null',
    }),
    rewardTitle: text('reward_title').notNull().default('Realm Sovereign Guild'),
    rewardBadge: text('reward_badge').notNull().default('sovereign_crest'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_comm_challenges_status').on(t.status, t.endsAt)]
);

export const communityChallengeEntries = pgTable(
  'community_challenge_entries',
  {
    id: serial('id').primaryKey(),
    challengeId: integer('challenge_id')
      .notNull()
      .references(() => communityChallenges.id, { onDelete: 'cascade' }),
    communityId: integer('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    score: integer('score').notNull().default(0),
    participantCount: integer('participant_count').notNull().default(0),
    qualifiedActions: integer('qualified_actions').notNull().default(0),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_challenge_community').on(t.challengeId, t.communityId),
    index('idx_challenge_entries_score').on(t.challengeId, t.score),
  ]
);

export const roomMessages = pgTable(
  'room_messages',
  {
    id: serial('id').primaryKey(),
    channelType: text('channel_type').notNull(), // 'guild' | 'voice' | 'watch'
    channelId: integer('channel_id').notNull(),
    senderUid: text('sender_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    recipientUid: text('recipient_uid').references(() => users.uid, {
      onDelete: 'set null',
    }),
    content: text('content').notNull().default(''),
    messageType: text('message_type').notNull().default('text'), // 'text' | 'sticker' | 'gift' | 'system'
    stickerId: text('sticker_id'),
    giftId: text('gift_id'),
    reactionsJson: jsonb('reactions_json')
      .$type<Record<string, string[]>>()
      .notNull()
      .default({}),
    isDeleted: boolean('is_deleted').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_room_messages_channel').on(t.channelType, t.channelId, t.createdAt)]
);

export const giftTransactions = pgTable(
  'gift_transactions',
  {
    id: serial('id').primaryKey(),
    senderUid: text('sender_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    recipientUid: text('recipient_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    giftId: text('gift_id').notNull(),
    giftName: text('gift_name').notNull(),
    contextType: text('context_type').notNull(), // 'inbox' | 'guild' | 'voice' | 'watch' | 'profile'
    contextId: integer('context_id'),
    message: text('message').notNull().default(''),
    idempotencyKey: text('idempotency_key').notNull().unique(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_gift_tx_recipient').on(t.recipientUid, t.createdAt),
    index('idx_gift_tx_sender').on(t.senderUid, t.createdAt),
  ]
);

export const voiceRoomRequests = pgTable(
  'voice_room_requests',
  {
    id: serial('id').primaryKey(),
    roomId: integer('room_id')
      .notNull()
      .references(() => voiceRooms.id, { onDelete: 'cascade' }),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    requestType: text('request_type').notNull().default('join_room'), // 'join_room' | 'speak_seat' | 'invite'
    status: text('status').notNull().default('pending'), // 'pending' | 'approved' | 'rejected'
    reviewedByUid: text('reviewed_by_uid').references(() => users.uid, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_voice_room_request').on(t.roomId, t.userUid, t.requestType),
    index('idx_voice_room_req_status').on(t.roomId, t.status),
  ]
);

export const voiceRoomBans = pgTable(
  'voice_room_bans',
  {
    id: serial('id').primaryKey(),
    roomId: integer('room_id')
      .notNull()
      .references(() => voiceRooms.id, { onDelete: 'cascade' }),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    bannedByUid: text('banned_by_uid').references(() => users.uid, {
      onDelete: 'set null',
    }),
    reason: text('reason').notNull().default(''),
    expiresAt: timestamp('expires_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [uniqueIndex('uniq_voice_room_ban').on(t.roomId, t.userUid)]
);

export const watchChambers = pgTable(
  'watch_chambers',
  {
    id: serial('id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    animeTitle: text('anime_title').notNull(),
    animeMalId: integer('anime_mal_id'),
    posterUrl: text('poster_url').notNull().default('asset:shadow_monarch'),
    mode: text('mode').notNull().default('youtube_embed'), // 'youtube_embed' | 'external_official'
    youtubeVideoId: text('youtube_video_id'),
    externalPlatformName: text('external_platform_name'),
    externalOfficialUrl: text('external_official_url'),
    episodeNumber: integer('episode_number').notNull().default(1),
    hostUid: text('host_uid').references(() => users.uid, { onDelete: 'set null' }),
    communityId: integer('community_id').references(() => communities.id, {
      onDelete: 'set null',
    }),
    linkedVoiceRoomId: integer('linked_voice_room_id').references(() => voiceRooms.id, {
      onDelete: 'set null',
    }),
    privacyMode: text('privacy_mode').notNull().default('open'), // 'open' | 'approval' | 'guild_only'
    capacity: integer('capacity').notNull().default(30),
    sessionStatus: text('session_status').notNull().default('live'), // 'scheduled' | 'live' | 'ended'
    scheduledAt: timestamp('scheduled_at'),
    playbackState: text('playback_state').notNull().default('paused'), // 'paused' | 'playing'
    currentTimestampSec: integer('current_timestamp_sec').notNull().default(0),
    stateUpdatedAt: timestamp('state_updated_at').defaultNow().notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_watch_chambers_active').on(t.isActive, t.createdAt),
    index('idx_watch_chambers_community').on(t.communityId),
  ]
);

export const watchChamberMembers = pgTable(
  'watch_chamber_members',
  {
    id: serial('id').primaryKey(),
    chamberId: integer('chamber_id')
      .notNull()
      .references(() => watchChambers.id, { onDelete: 'cascade' }),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    role: text('role').notNull().default('viewer'), // 'host' | 'moderator' | 'viewer'
    status: text('status').notNull().default('joined'), // 'joined' | 'pending' | 'kicked'
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_watch_chamber_member').on(t.chamberId, t.userUid),
    index('idx_watch_chamber_members_room').on(t.chamberId, t.status),
  ]
);

export const communityChatRooms = pgTable(
  'community_chat_rooms',
  {
    id: serial('id').primaryKey(),
    communityId: integer('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    slug: text('slug').notNull(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    isSpoiler: boolean('is_spoiler').notNull().default(false),
    writePermission: text('write_permission').notNull().default('members'), // 'members' | 'moderators'
    sortOrder: integer('sort_order').notNull().default(0),
    isArchived: boolean('is_archived').notNull().default(false),
    lastMessageAt: timestamp('last_message_at'),
    createdByUid: text('created_by_uid').references(() => users.uid, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_community_chat_room_slug').on(t.communityId, t.slug),
    index('idx_community_chat_rooms_comm').on(t.communityId, t.sortOrder),
  ]
);

export const communityChatMessages = pgTable(
  'community_chat_messages',
  {
    id: serial('id').primaryKey(),
    roomId: integer('room_id')
      .notNull()
      .references(() => communityChatRooms.id, { onDelete: 'cascade' }),
    communityId: integer('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    senderUid: text('sender_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    content: text('content').notNull().default(''),
    mediaUrl: text('media_url'),
    mediaType: text('media_type').notNull().default('none'), // 'none' | 'image' | 'video'
    posterUrl: text('poster_url'),
    isSpoiler: boolean('is_spoiler').notNull().default(false),
    replyToMessageId: integer('reply_to_message_id'),
    mentionedUids: jsonb('mentioned_uids').$type<string[]>().notNull().default([]),
    reactionsJson: jsonb('reactions_json')
      .$type<Record<string, string[]>>()
      .notNull()
      .default({}),
    isDeleted: boolean('is_deleted').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_comm_chat_messages_room').on(t.roomId, t.createdAt),
    index('idx_comm_chat_messages_comm').on(t.communityId, t.createdAt),
  ]
);

export const communityEvents = pgTable(
  'community_events',
  {
    id: serial('id').primaryKey(),
    communityId: integer('community_id')
      .notNull()
      .references(() => communities.id, { onDelete: 'cascade' }),
    creatorUid: text('creator_uid').references(() => users.uid, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description').notNull().default(''),
    eventType: text('event_type').notNull().default('watch_party'), // 'watch_party' | 'discussion' | 'manga_release' | 'tournament' | 'voice_hangout'
    coverUrl: text('cover_url'),
    voiceRoomId: integer('voice_room_id').references(() => voiceRooms.id, {
      onDelete: 'set null',
    }),
    startsAt: timestamp('starts_at').notNull(),
    endsAt: timestamp('ends_at'),
    locationLabel: text('location_label').notNull().default('KAGE Live Stage'),
    rsvpCount: integer('rsvp_count').notNull().default(0),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [index('idx_community_events_comm_start').on(t.communityId, t.startsAt)]
);

export const communityEventRsvps = pgTable(
  'community_event_rsvps',
  {
    id: serial('id').primaryKey(),
    eventId: integer('event_id')
      .notNull()
      .references(() => communityEvents.id, { onDelete: 'cascade' }),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    status: text('status').notNull().default('going'), // 'going' | 'interested'
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_community_event_rsvp').on(t.eventId, t.userUid),
    index('idx_community_event_rsvps_event').on(t.eventId),
  ]
);

export const userActivityHistory = pgTable(
  'user_activity_history',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    activityType: text('activity_type').notNull(), // 'post_created' | 'community_thread' | 'comment_posted' | 'reply_posted' | 'post_liked' | 'post_reposted' | 'post_shared' | 'community_joined' | 'poll_voted'
    entityType: text('entity_type').notNull().default('discussion'),
    entityId: text('entity_id').notNull(),
    communityId: integer('community_id').references(() => communities.id, {
      onDelete: 'set null',
    }),
    summary: text('summary').notNull(),
    linkUrl: text('link_url').notNull().default('/pulse'),
    isSimulated: boolean('is_simulated').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_activity_history_user_time').on(t.userUid, t.createdAt),
    index('idx_activity_history_sim').on(t.isSimulated, t.createdAt),
  ]
);

export const aiCommunityConfig = pgTable('ai_community_config', {
  id: integer('id').primaryKey().default(1),
  aiActivityEnabled: boolean('ai_activity_enabled').notNull().default(true),
  targetDemoProfiles: integer('target_demo_profiles').notNull().default(10000),
  targetCommunityMembers: integer('target_community_members').notNull().default(5000),
  ownerDemoAudienceEnabled: boolean('owner_demo_audience_enabled').notNull().default(true),
  showcasePostId: integer('showcase_post_id'),
  targetOwnerFollowers: integer('target_owner_followers').notNull().default(10000),
  targetShowcaseLikes: integer('target_showcase_likes').notNull().default(2000),
  targetShowcaseReposts: integer('target_showcase_reposts').notNull().default(1000),
  targetShowcaseComments: integer('target_showcase_comments').notNull().default(5000),
  targetShowcaseShares: integer('target_showcase_shares').notNull().default(650),
  autoSeededInitial: boolean('auto_seeded_initial').notNull().default(false),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export const aiSeedingJobs = pgTable(
  'ai_seeding_jobs',
  {
    id: serial('id').primaryKey(),
    jobType: text('job_type').notNull(),
    status: text('status').notNull().default('running'), // 'running' | 'completed' | 'failed'
    progressPercent: integer('progress_percent').notNull().default(0),
    stepLabel: text('step_label').notNull().default('Initializing...'),
    detailsJson: jsonb('details_json').$type<Record<string, unknown>>().notNull().default({}),
    errorMessage: text('error_message'),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    completedAt: timestamp('completed_at'),
  },
  (t) => [index('idx_ai_seeding_jobs_started').on(t.startedAt)]
);

// ============================================================================
// KAGE — INKVERSE MANGA CATALOG, CHAPTERS, RELATIONS & USER LIBRARY TABLES
// ============================================================================

export const mangaCatalog = pgTable(
  'manga_catalog',
  {
    id: serial('id').primaryKey(),
    canonicalId: integer('canonical_id').notNull().unique(),
    anilistId: integer('anilist_id'),
    malId: integer('mal_id'),
    mangadexId: text('mangadex_id'),
    provider: text('provider').notNull().default('anilist'), // 'anilist' | 'mangadex' | 'jikan'
    providerId: text('provider_id').notNull(),
    slug: text('slug').notNull(),
    titleEnglish: text('title_english'),
    titleRomaji: text('title_romaji').notNull(),
    titleNative: text('title_native'),
    normalizedTitle: text('normalized_title').notNull(),
    altTitles: jsonb('alt_titles').$type<string[]>().notNull().default([]),
    synopsis: text('synopsis').notNull().default(''),
    coverImageUrl: text('cover_image_url').notNull(),
    coverQuality: text('cover_quality').notNull().default('Standard'), // '4K' | 'HD' | 'Standard' (never fabricated)
    coverWidth: integer('cover_width'),
    coverHeight: integer('cover_height'),
    bannerImageUrl: text('banner_image_url'),
    format: text('format').notNull().default('MANGA'), // 'MANGA' | 'MANHWA' | 'MANHUA' | 'ONE_SHOT' | 'NOVEL'
    status: text('status').notNull().default('RELEASING'), // 'RELEASING' | 'FINISHED' | 'HIATUS' | 'CANCELLED' | 'NOT_YET_RELEASED'
    releaseYear: integer('release_year'),
    volumesCount: integer('volumes_count'),
    chaptersCount: integer('chapters_count'),
    averageScore: integer('average_score'), // 0..100 scale from verified provider (null when unknown)
    scoreSource: text('score_source').notNull().default('AniList'),
    popularity: integer('popularity').notNull().default(0),
    trending: integer('trending').notNull().default(0),
    readCount: integer('read_count').notNull().default(0), // Real KAGE internal reader opens
    isColor: boolean('is_color').notNull().default(false),
    originalLanguage: text('original_language').notNull().default('ja'), // 'ja' | 'ko' | 'zh' | 'en'
    availableLanguages: jsonb('available_languages').$type<string[]>().notNull().default(['en']),
    latestChapterNumber: text('latest_chapter_number'),
    latestChapterAt: timestamp('latest_chapter_at'),
    externalReaderUrl: text('external_reader_url'),
    providerUrl: text('provider_url'),
    charactersJson: jsonb('characters_json')
      .$type<{ id?: number | null; name: string; role?: string; imageUrl?: string | null }[]>()
      .notNull()
      .default([]),
    isAdult: boolean('is_adult').notNull().default(false),
    uploadedByUid: text('uploaded_by_uid').references(() => users.uid, { onDelete: 'set null' }),
    isOriginalUpload: boolean('is_original_upload').notNull().default(false),
    moderationStatus: text('moderation_status').notNull().default('approved'), // 'approved' | 'pending_review' | 'rejected'
    moderationNote: text('moderation_note'),
    hasInAppChapters: boolean('has_in_app_chapters').notNull().default(false),
    inAppChapterCount: integer('in_app_chapter_count').notNull().default(0),
    lastSyncedAt: timestamp('last_synced_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_manga_catalog_provider').on(t.provider, t.providerId),
    index('idx_manga_catalog_anilist').on(t.anilistId),
    index('idx_manga_catalog_mal').on(t.malId),
    index('idx_manga_catalog_mangadex').on(t.mangadexId),
    index('idx_manga_catalog_norm_title').on(t.normalizedTitle),
    index('idx_manga_catalog_status').on(t.status),
    index('idx_manga_catalog_year').on(t.releaseYear),
    index('idx_manga_catalog_popularity').on(t.popularity),
    index('idx_manga_catalog_trending').on(t.trending),
    index('idx_manga_catalog_score').on(t.averageScore),
    index('idx_manga_catalog_read_count').on(t.readCount),
    index('idx_manga_catalog_inapp_mod').on(t.moderationStatus, t.hasInAppChapters),
    index('idx_manga_catalog_uploader').on(t.uploadedByUid),
  ]
);

export const mangaAuthors = pgTable(
  'manga_authors',
  {
    id: serial('id').primaryKey(),
    name: text('name').notNull(),
    normalizedName: text('normalized_name').notNull().unique(),
    nativeName: text('native_name'),
    imageUrl: text('image_url'),
    providerId: text('provider_id'),
  },
  (t) => [index('idx_manga_authors_name').on(t.normalizedName)]
);

export const mangaCatalogAuthors = pgTable(
  'manga_catalog_authors',
  {
    id: serial('id').primaryKey(),
    mangaId: integer('manga_id')
      .notNull()
      .references(() => mangaCatalog.id, { onDelete: 'cascade' }),
    authorId: integer('author_id')
      .notNull()
      .references(() => mangaAuthors.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('Story & Art'), // 'Story' | 'Art' | 'Story & Art'
  },
  (t) => [
    uniqueIndex('uniq_manga_catalog_author').on(t.mangaId, t.authorId, t.role),
    index('idx_manga_cat_author_lookup').on(t.authorId, t.mangaId),
  ]
);

export const mangaGenres = pgTable('manga_genres', {
  id: serial('id').primaryKey(),
  name: text('name').notNull().unique(),
  slug: text('slug').notNull().unique(),
});

export const mangaCatalogGenres = pgTable(
  'manga_catalog_genres',
  {
    id: serial('id').primaryKey(),
    mangaId: integer('manga_id')
      .notNull()
      .references(() => mangaCatalog.id, { onDelete: 'cascade' }),
    genreId: integer('genre_id')
      .notNull()
      .references(() => mangaGenres.id, { onDelete: 'cascade' }),
  },
  (t) => [
    uniqueIndex('uniq_manga_catalog_genre').on(t.mangaId, t.genreId),
    index('idx_manga_cat_genre_lookup').on(t.genreId, t.mangaId),
  ]
);

export const mangaVolumes = pgTable(
  'manga_volumes',
  {
    id: serial('id').primaryKey(),
    mangaId: integer('manga_id')
      .notNull()
      .references(() => mangaCatalog.id, { onDelete: 'cascade' }),
    volumeNumber: text('volume_number').notNull(),
    title: text('title').notNull().default(''),
    chapterCount: integer('chapter_count').notNull().default(0),
    coverImageUrl: text('cover_image_url'),
  },
  (t) => [uniqueIndex('uniq_manga_volume').on(t.mangaId, t.volumeNumber)]
);

export const mangaChapters = pgTable(
  'manga_chapters',
  {
    id: serial('id').primaryKey(),
    mangaId: integer('manga_id')
      .notNull()
      .references(() => mangaCatalog.id, { onDelete: 'cascade' }),
    externalChapterId: text('external_chapter_id').notNull().unique(),
    provider: text('provider').notNull().default('mangadex'), // 'mangadex' | 'official_external'
    volumeNumber: text('volume_number'),
    chapterNumber: text('chapter_number').notNull(),
    chapterSortKey: integer('chapter_sort_key').notNull().default(0), // Math.round(num * 100) for clean integer sorting
    title: text('title').notNull().default(''),
    language: text('language').notNull().default('en'),
    pageCount: integer('page_count').notNull().default(0),
    isAvailable: boolean('is_available').notNull().default(false),
    isColor: boolean('is_color').notNull().default(false),
    qualityTier: text('quality_tier').notNull().default('Unavailable'), // '4K' | 'HD' | 'Standard' | 'External' | 'Unavailable'
    externalUrl: text('external_url'),
    scanlationGroup: text('scanlation_group').notNull().default(''),
    uploadedByUid: text('uploaded_by_uid').references(() => users.uid, { onDelete: 'set null' }),
    moderationStatus: text('moderation_status').notNull().default('approved'), // 'approved' | 'pending_review' | 'rejected'
    moderationNote: text('moderation_note'),
    rightsDeclared: boolean('rights_declared').notNull().default(false),
    publishedAt: timestamp('published_at'),
    cachedAt: timestamp('cached_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_manga_chapters_manga_sort').on(t.mangaId, t.language, t.chapterSortKey),
    index('idx_manga_chapters_published').on(t.mangaId, t.publishedAt),
    index('idx_manga_chapters_mod_avail').on(t.moderationStatus, t.isAvailable),
  ]
);

export const mangaImages = pgTable(
  'manga_images',
  {
    id: serial('id').primaryKey(),
    chapterId: integer('chapter_id')
      .notNull()
      .references(() => mangaChapters.id, { onDelete: 'cascade' }),
    pageNumber: integer('page_number').notNull(),
    imageUrl: text('image_url').notNull(),
    hdUrl: text('hd_url'),
    width: integer('width'),
    height: integer('height'),
    qualityLabel: text('quality_label').notNull().default('Standard'), // '4K' | 'HD' | 'Standard'
    isColor: boolean('is_color').notNull().default(false),
  },
  (t) => [uniqueIndex('uniq_manga_image_page').on(t.chapterId, t.pageNumber)]
);

export const animeMangaRelations = pgTable(
  'anime_manga_relations',
  {
    id: serial('id').primaryKey(),
    animeCanonicalId: integer('anime_canonical_id').notNull(),
    animeMalId: integer('anime_mal_id'),
    animeTitle: text('anime_title').notNull(),
    mangaId: integer('manga_id')
      .notNull()
      .references(() => mangaCatalog.id, { onDelete: 'cascade' }),
    relationType: text('relation_type').notNull().default('ORIGINAL_MANGA'), // 'ORIGINAL_MANGA' | 'ADAPTATION' | 'SPIN_OFF' | 'SEQUEL' | 'PREQUEL' | 'SIDE_STORY'
    relationLabel: text('relation_label').notNull().default('Original Manga'),
    continuationNote: text('continuation_note').notNull().default(''),
    isVerified: boolean('is_verified').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_anime_manga_relation').on(t.animeCanonicalId, t.mangaId, t.relationType),
    index('idx_anime_manga_rel_anime_canon').on(t.animeCanonicalId),
    index('idx_anime_manga_rel_anime_mal').on(t.animeMalId),
    index('idx_anime_manga_rel_manga').on(t.mangaId),
  ]
);

export const userMangaLibrary = pgTable(
  'user_manga_library',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    mangaId: integer('manga_id')
      .notNull()
      .references(() => mangaCatalog.id, { onDelete: 'cascade' }),
    status: text('status').notNull().default('plan_to_read'), // 'reading' | 'completed' | 'plan_to_read' | 'on_hold' | 'dropped'
    isBookmarked: boolean('is_bookmarked').notNull().default(false),
    currentChapterId: integer('current_chapter_id'),
    currentChapterNumber: text('current_chapter_number'),
    currentPage: integer('current_page').notNull().default(1),
    totalPages: integer('total_pages').notNull().default(1),
    progressPercent: integer('progress_percent').notNull().default(0),
    personalScore: integer('personal_score'),
    addedAt: timestamp('added_at').defaultNow().notNull(),
    lastReadAt: timestamp('last_read_at'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_user_manga_library').on(t.userUid, t.mangaId),
    index('idx_user_manga_lib_user_status').on(t.userUid, t.status, t.updatedAt),
    index('idx_user_manga_lib_bookmark').on(t.userUid, t.isBookmarked),
  ]
);

export const mangaReadingHistory = pgTable(
  'manga_reading_history',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    mangaId: integer('manga_id')
      .notNull()
      .references(() => mangaCatalog.id, { onDelete: 'cascade' }),
    chapterId: integer('chapter_id').references(() => mangaChapters.id, { onDelete: 'set null' }),
    chapterNumber: text('chapter_number').notNull().default('1'),
    chapterTitle: text('chapter_title').notNull().default(''),
    pageNumber: integer('page_number').notNull().default(1),
    totalPages: integer('total_pages').notNull().default(1),
    progressPercent: integer('progress_percent').notNull().default(0),
    readingMode: text('reading_mode').notNull().default('vertical'), // 'vertical' | 'page'
    lastReadAt: timestamp('last_read_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_manga_reading_history').on(t.userUid, t.mangaId),
    index('idx_manga_reading_hist_user_time').on(t.userUid, t.lastReadAt),
  ]
);

export const mangaBookmarks = pgTable(
  'manga_bookmarks',
  {
    id: serial('id').primaryKey(),
    userUid: text('user_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    mangaId: integer('manga_id')
      .notNull()
      .references(() => mangaCatalog.id, { onDelete: 'cascade' }),
    chapterId: integer('chapter_id')
      .notNull()
      .references(() => mangaChapters.id, { onDelete: 'cascade' }),
    chapterNumber: text('chapter_number').notNull().default('1'),
    pageNumber: integer('page_number').notNull().default(1),
    note: text('note').notNull().default(''),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('uniq_manga_page_bookmark').on(t.userUid, t.chapterId, t.pageNumber),
    index('idx_manga_bookmarks_user').on(t.userUid, t.createdAt),
  ]
);

export const mangaReviews = pgTable(
  'manga_reviews',
  {
    id: serial('id').primaryKey(),
    authorUid: text('author_uid')
      .notNull()
      .references(() => users.uid, { onDelete: 'cascade' }),
    mangaId: integer('manga_id')
      .notNull()
      .references(() => mangaCatalog.id, { onDelete: 'cascade' }),
    rating: integer('rating'), // 1..10 optional
    title: text('title').notNull(),
    content: text('content').notNull(),
    containsSpoilers: boolean('contains_spoilers').notNull().default(false),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (t) => [
    index('idx_manga_reviews_author').on(t.authorUid, t.createdAt),
    index('idx_manga_reviews_manga').on(t.mangaId, t.createdAt),
  ]
);

export const usersRelations = relations(users, ({ one, many }) => ({
  profile: one(profiles, { fields: [users.uid], references: [profiles.userUid] }),
  aiDemoProfile: one(aiDemoProfiles, {
    fields: [users.uid],
    references: [aiDemoProfiles.userUid],
  }),
  settings: one(userSettings, { fields: [users.uid], references: [userSettings.userUid] }),
  discussions: many(discussions),
  comments: many(comments),
  memberships: many(communityMemberships),
  animeEntries: many(userAnimeEntries),
  genreRatings: many(userGenreRatings),
  reviews: many(animeReviews),
  savedPosts: many(savedPosts),
  recentlyViewed: many(userRecentlyViewed),
  characterMastery: many(userCharacterMastery),
  rewards: many(userRewards),
  activityHistory: many(userActivityHistory),
  mangaLibrary: many(userMangaLibrary),
  mangaHistory: many(mangaReadingHistory),
  mangaBookmarks: many(mangaBookmarks),
  mangaReviews: many(mangaReviews),
}));
