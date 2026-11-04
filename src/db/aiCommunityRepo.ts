import { and, asc, desc, eq, ilike, inArray, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  aiCommunityConfig,
  aiDemoProfiles,
  aiSeedingJobs,
  clashes,
  clashVotes,
  comments,
  communities,
  communityChatMessages,
  communityChatRooms,
  communityMemberships,
  communityPosts,
  discussionPollVotes,
  discussions,
  postShares,
  profiles,
  pulseReposts,
  reactions,
  userActivityHistory,
  userAnimeEntries,
  userFollows,
  users,
} from './schema.ts';
import { OWNER_UID } from '../lib/serverToken.ts';
import {
  ANIME_KNOWLEDGE_POOL,
  DEMO_COMMUNITIES_CATALOG,
  composeContextAwareComment,
  composeDeterministicCommunityThread,
  generateDeterministicDemoPersona,
  generateGeminiCommunityDiscussions,
} from '../server/aiCommunityData.ts';
import { ensureDefaultCommunityChatRooms } from './communityChatRepo.ts';
import { ensureStarterRewardsForGuild } from './clashSystemRepo.ts';

export type AiCommunityConfigRow = typeof aiCommunityConfig.$inferSelect;

let cachedConfig: AiCommunityConfigRow | null = null;
let cachedConfigExpiresAt = 0;
let activeSeedingPromise: Promise<void> | null = null;
let activeSeedingJobId: number | null = null;

export function invalidateAiCommunityConfigCache() {
  cachedConfig = null;
  cachedConfigExpiresAt = 0;
}

export async function getAiCommunityConfig(): Promise<AiCommunityConfigRow> {
  const now = Date.now();
  if (cachedConfig && now < cachedConfigExpiresAt) {
    return cachedConfig;
  }

  try {
    const [existing] = await db
      .select()
      .from(aiCommunityConfig)
      .where(eq(aiCommunityConfig.id, 1))
      .limit(1);

    if (existing) {
      cachedConfig = existing;
      cachedConfigExpiresAt = now + 3000;
      return existing;
    }

    const [created] = await db
      .insert(aiCommunityConfig)
      .values({
        id: 1,
        aiActivityEnabled: true,
        targetDemoProfiles: 10000,
        targetCommunityMembers: 5000,
        ownerDemoAudienceEnabled: true,
        targetOwnerFollowers: 10000,
        targetShowcaseLikes: 10000,
        targetShowcaseReposts: 1000,
        targetShowcaseComments: 5000,
        targetShowcaseShares: 650,
        autoSeededInitial: false,
      })
      .onConflictDoNothing()
      .returning();

    if (created) {
      cachedConfig = created;
      cachedConfigExpiresAt = now + 3000;
      return created;
    }

    const [fallback] = await db
      .select()
      .from(aiCommunityConfig)
      .where(eq(aiCommunityConfig.id, 1))
      .limit(1);
    if (fallback) {
      cachedConfig = fallback;
      cachedConfigExpiresAt = now + 3000;
      return fallback;
    }
  } catch (err) {
    console.warn('[AI Community] Config fallback used:', (err as any)?.message || err);
  }

  return {
    id: 1,
    aiActivityEnabled: true,
    targetDemoProfiles: 10000,
    targetCommunityMembers: 5000,
    ownerDemoAudienceEnabled: true,
    showcasePostId: null,
    targetOwnerFollowers: 10000,
    targetShowcaseLikes: 10000,
    targetShowcaseReposts: 1000,
    targetShowcaseComments: 5000,
    targetShowcaseShares: 650,
    autoSeededInitial: false,
    updatedAt: new Date(),
  };
}

export async function resolveOwnerAccountUid(): Promise<string> {
  const [ownerRow] = await db
    .select({ uid: users.uid })
    .from(users)
    .where(eq(users.role, 'owner'))
    .orderBy(asc(users.createdAt))
    .limit(1);
  return ownerRow?.uid || OWNER_UID;
}

async function updateSeedingJob(
  jobId: number,
  patch: Partial<{
    status: string;
    progressPercent: number;
    stepLabel: string;
    detailsJson: Record<string, unknown>;
    errorMessage: string | null;
    completedAt: Date | null;
  }>
) {
  try {
    await db.update(aiSeedingJobs).set(patch).where(eq(aiSeedingJobs.id, jobId));
  } catch (err) {
    console.warn('[AI Community] Job progress update skipped:', (err as any)?.message);
  }
}

export async function recalculateEngagementCounters() {
  invalidateAiCommunityConfigCache();
  const cfg = await getAiCommunityConfig();
  const includeAi = cfg.aiActivityEnabled;
  const includeOwnerShowcaseSim = cfg.aiActivityEnabled && cfg.ownerDemoAudienceEnabled;
  const showcaseId = cfg.showcasePostId ?? -1;

  // 1. Sync Community human, demo & visible member counts + discussion counts
  await db.execute(sql`
    WITH mem_stats AS (
      SELECT
        community_id,
        COUNT(*) FILTER (WHERE is_simulated = false)::int AS human_cnt,
        COUNT(*) FILTER (WHERE is_simulated = true)::int AS demo_cnt
      FROM community_memberships
      GROUP BY community_id
    ),
    disc_stats AS (
      SELECT
        community_id,
        COUNT(*) FILTER (
          WHERE is_archived = false
          AND (${includeAi}::boolean = true OR is_ai_generated = false)
        )::int AS disc_cnt
      FROM discussions
      WHERE community_id IS NOT NULL
      GROUP BY community_id
    )
    UPDATE communities c
    SET
      human_member_count = COALESCE(m.human_cnt, 0),
      demo_member_count = COALESCE(m.demo_cnt, 0),
      member_count = COALESCE(m.human_cnt, 0) + CASE WHEN ${includeAi}::boolean THEN COALESCE(m.demo_cnt, 0) ELSE 0 END,
      discussion_count = COALESCE(d.disc_cnt, 0),
      updated_at = NOW()
    FROM (SELECT id FROM communities) base
    LEFT JOIN mem_stats m ON m.community_id = base.id
    LEFT JOIN disc_stats d ON d.community_id = base.id
    WHERE c.id = base.id
  `);

  // 2. Sync Discussion likes, comments, reposts, shares (real + demo breakdown)
  await db.execute(sql`
    WITH like_stats AS (
      SELECT
        target_id AS post_id,
        COUNT(*) FILTER (WHERE is_simulated = false)::int AS real_likes,
        COUNT(*) FILTER (WHERE is_simulated = true)::int AS sim_likes
      FROM reactions
      WHERE target_type = 'discussion' AND reaction_type = 'like'
      GROUP BY target_id
    ),
    comm_stats AS (
      SELECT
        discussion_id AS post_id,
        COUNT(*) FILTER (WHERE is_deleted = false AND is_ai_generated = false)::int AS real_comms,
        COUNT(*) FILTER (WHERE is_deleted = false AND is_ai_generated = true)::int AS sim_comms
      FROM comments
      GROUP BY discussion_id
    ),
    rep_stats AS (
      SELECT
        post_id,
        COUNT(*) FILTER (WHERE is_simulated = false)::int AS real_reps,
        COUNT(*) FILTER (WHERE is_simulated = true)::int AS sim_reps
      FROM pulse_reposts
      GROUP BY post_id
    ),
    shr_stats AS (
      SELECT
        post_id,
        COUNT(*) FILTER (WHERE is_simulated = false)::int AS real_shrs,
        COUNT(*) FILTER (WHERE is_simulated = true)::int AS sim_shrs
      FROM post_shares
      GROUP BY post_id
    )
    UPDATE discussions d
    SET
      demo_like_count = CASE
        WHEN d.id = ${showcaseId} OR u.role IN ('owner', 'admin') THEN CASE WHEN ${includeOwnerShowcaseSim}::boolean THEN COALESCE(l.sim_likes, 0) ELSE 0 END
        ELSE CASE WHEN ${includeAi}::boolean THEN COALESCE(l.sim_likes, 0) ELSE 0 END
      END,
      like_count = COALESCE(l.real_likes, 0) + CASE
        WHEN d.id = ${showcaseId} OR u.role IN ('owner', 'admin') THEN CASE WHEN ${includeOwnerShowcaseSim}::boolean THEN COALESCE(l.sim_likes, 0) ELSE 0 END
        ELSE CASE WHEN ${includeAi}::boolean THEN COALESCE(l.sim_likes, 0) ELSE 0 END
      END,
      demo_comment_count = CASE
        WHEN d.id = ${showcaseId} OR u.role IN ('owner', 'admin') THEN CASE WHEN ${includeOwnerShowcaseSim}::boolean THEN COALESCE(cm.sim_comms, 0) ELSE 0 END
        ELSE CASE WHEN ${includeAi}::boolean THEN COALESCE(cm.sim_comms, 0) ELSE 0 END
      END,
      comment_count = COALESCE(cm.real_comms, 0) + CASE
        WHEN d.id = ${showcaseId} OR u.role IN ('owner', 'admin') THEN CASE WHEN ${includeOwnerShowcaseSim}::boolean THEN COALESCE(cm.sim_comms, 0) ELSE 0 END
        ELSE CASE WHEN ${includeAi}::boolean THEN COALESCE(cm.sim_comms, 0) ELSE 0 END
      END,
      demo_repost_count = CASE
        WHEN d.id = ${showcaseId} OR u.role IN ('owner', 'admin') THEN CASE WHEN ${includeOwnerShowcaseSim}::boolean THEN COALESCE(rp.sim_reps, 0) ELSE 0 END
        ELSE CASE WHEN ${includeAi}::boolean THEN COALESCE(rp.sim_reps, 0) ELSE 0 END
      END,
      repost_count = COALESCE(rp.real_reps, 0) + CASE
        WHEN d.id = ${showcaseId} OR u.role IN ('owner', 'admin') THEN CASE WHEN ${includeOwnerShowcaseSim}::boolean THEN COALESCE(rp.sim_reps, 0) ELSE 0 END
        ELSE CASE WHEN ${includeAi}::boolean THEN COALESCE(rp.sim_reps, 0) ELSE 0 END
      END,
      demo_share_count = CASE
        WHEN d.id = ${showcaseId} OR u.role IN ('owner', 'admin') THEN CASE WHEN ${includeOwnerShowcaseSim}::boolean THEN COALESCE(sh.sim_shrs, 0) ELSE 0 END
        ELSE CASE WHEN ${includeAi}::boolean THEN COALESCE(sh.sim_shrs, 0) ELSE 0 END
      END,
      share_count = COALESCE(sh.real_shrs, 0) + CASE
        WHEN d.id = ${showcaseId} OR u.role IN ('owner', 'admin') THEN CASE WHEN ${includeOwnerShowcaseSim}::boolean THEN COALESCE(sh.sim_shrs, 0) ELSE 0 END
        ELSE CASE WHEN ${includeAi}::boolean THEN COALESCE(sh.sim_shrs, 0) ELSE 0 END
      END
    FROM (SELECT id, author_uid FROM discussions) base
    LEFT JOIN users u ON u.uid = base.author_uid
    LEFT JOIN like_stats l ON l.post_id = base.id
    LEFT JOIN comm_stats cm ON cm.post_id = base.id
    LEFT JOIN rep_stats rp ON rp.post_id = base.id
    LEFT JOIN shr_stats sh ON sh.post_id = base.id
    WHERE d.id = base.id
  `);

  // 3. Sync Clash vote counts
  await db.execute(sql`
    WITH cv AS (
      SELECT
        clash_id,
        COUNT(*) FILTER (WHERE side = 'left')::int AS l_cnt,
        COUNT(*) FILTER (WHERE side = 'right')::int AS r_cnt
      FROM clash_votes
      GROUP BY clash_id
    )
    UPDATE clashes cl
    SET
      left_votes = COALESCE(cv.l_cnt, 0),
      right_votes = COALESCE(cv.r_cnt, 0)
    FROM (SELECT id FROM clashes) base
    LEFT JOIN cv ON cv.clash_id = base.id
    WHERE cl.id = base.id
  `);

  invalidateAiCommunityConfigCache();
}

async function ensureShowcasePostForOwner(ownerUid: string, preferredPostId?: number | null) {
  if (preferredPostId) {
    const [existingPreferred] = await db
      .select()
      .from(discussions)
      .where(and(eq(discussions.id, preferredPostId), eq(discussions.isArchived, false)))
      .limit(1);
    if (existingPreferred) return existingPreferred;
  }

  const [existingOwnerPost] = await db
    .select()
    .from(discussions)
    .where(and(eq(discussions.authorUid, ownerUid), eq(discussions.isArchived, false)))
    .orderBy(desc(discussions.isPinned), desc(discussions.createdAt))
    .limit(1);

  if (existingOwnerPost) {
    await db
      .update(aiCommunityConfig)
      .set({ showcasePostId: existingOwnerPost.id, updatedAt: new Date() })
      .where(eq(aiCommunityConfig.id, 1));
    invalidateAiCommunityConfigCache();
    return existingOwnerPost;
  }

  const [createdShowcase] = await db
    .insert(discussions)
    .values({
      authorUid: ownerUid,
      kind: 'pulse',
      isPinned: true,
      isAnnouncement: true,
      animeMalId: 52299,
      animeTitle: 'Solo Leveling',
      genreTags: ['Action', 'Dark Fantasy', 'Fantasy'],
      hashtags: ['kage', 'animeuniverse', 'sololeveling', 'blackclover'],
      title: 'Welcome to KAGE — The Anime Universe',
      content:
        'KAGE is officially live. Explore all 28 anime realms, rally inside Guilds, debate iconic matchups in Clash, and share your favorite frames on PULSE. Which anime realm are you claiming first?',
      mediaUrl: '/assets/extracted/solo-hero-home.jpg',
      mediaType: 'image',
      isSeed: false,
      isAiGenerated: false,
    })
    .returning();

  await db
    .update(aiCommunityConfig)
    .set({ showcasePostId: createdShowcase.id, updatedAt: new Date() })
    .where(eq(aiCommunityConfig.id, 1));
  invalidateAiCommunityConfigCache();
  return createdShowcase;
}

export async function triggerAiCommunitySeedingJob(options?: {
  forceReseed?: boolean;
  generateGeminiThreads?: boolean;
  jobType?: string;
}): Promise<{ started: boolean; jobId: number }> {
  if (activeSeedingPromise && activeSeedingJobId) {
    return { started: false, jobId: activeSeedingJobId };
  }

  const [jobRow] = await db
    .insert(aiSeedingJobs)
    .values({
      jobType: options?.jobType || (options?.generateGeminiThreads ? 'gemini_threads' : 'full_seed'),
      status: 'running',
      progressPercent: 2,
      stepLabel: 'Preparing community profiles & guild blueprint...',
      detailsJson: {},
    })
    .returning();

  const jobId = jobRow.id;
  activeSeedingJobId = jobId;

  activeSeedingPromise = (async () => {
    try {
      const cfg = await getAiCommunityConfig();
      const ownerUid = await resolveOwnerAccountUid();
      const targetProfiles = Math.max(100, Math.min(15000, cfg.targetDemoProfiles || 10000));

      // =========================================================================
      // STEP 1: 10,000 UNIQUE AI DEMO PERSONAS (USERS + PROFILES + AI METADATA)
      // =========================================================================
      const [demoCountRes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.isAiDemo, true));
      const existingDemoUsers = demoCountRes?.count || 0;

      if (existingDemoUsers < targetProfiles || options?.forceReseed) {
        const chunkSize = 500;
        const baseNow = Date.now();
        for (let start = 1; start <= targetProfiles; start += chunkSize) {
          const end = Math.min(targetProfiles, start + chunkSize - 1);
          const userBatch: (typeof users.$inferInsert)[] = [];
          const profileBatch: (typeof profiles.$inferInsert)[] = [];
          const aiMetaBatch: (typeof aiDemoProfiles.$inferInsert)[] = [];
          const watchlistBatch: (typeof userAnimeEntries.$inferInsert)[] = [];

          for (let i = start; i <= end; i++) {
            const p = generateDeterministicDemoPersona(i);
            const createdOffsetMs = ((i * 7919) % (45 * 24 * 3600)) * 1000;
            const createdAt = new Date(baseNow - createdOffsetMs);
            const xp = 120 + ((i * 137) % 4800);
            const level = Math.max(1, Math.min(50, Math.floor(xp / 250) + 1));

            userBatch.push({
              uid: p.uid,
              kageId: p.kageId,
              email: p.email,
              username: p.username,
              usernameNormalized: p.usernameNormalized,
              role: 'user',
              accountXp: xp,
              accountLevel: level,
              emailVerified: true,
              isSeed: true,
              isAiDemo: true,
              createdAt,
              updatedAt: createdAt,
            });

            profileBatch.push({
              userUid: p.uid,
              displayName: p.displayName,
              bio: p.bio,
              avatarUrl: p.avatarUrl,
              avatarSource: 'catalogue',
              bannerUrl: p.bannerUrl,
              favouriteCharacter: p.favoriteCharacter,
              favouriteCharacterAnime: p.favoriteAnime,
              favouriteCharacterMalId: p.favoriteAnimeMalId,
              characterReason: `Drawn to ${p.favoriteCharacter}'s resolve and narrative weight in ${p.favoriteAnime}.`,
              shadowQualities: p.shadowQualities,
              shadowLabel: p.shadowLabel,
              shadowBadgePublic: true,
              favoriteGenres: p.genres,
              isPrivate: false,
              showActivity: true,
              showWatchlist: true,
              commentPermission: 'everyone',
              updatedAt: createdAt,
            });

            aiMetaBatch.push({
              userUid: p.uid,
              personaArchetype: p.personaArchetype,
              writingStyle: p.writingStyle,
              favoriteAnime: p.favoriteAnime,
              favoriteAnimeMalId: p.favoriteAnimeMalId,
              favoriteCharacter: p.favoriteCharacter,
              interests: p.genres,
              isCommunityMember: p.isCommunityMember,
              disclosureLabel: p.disclosureLabel,
              activityCadence: p.activityCadence,
              seedBatch: 'launch_10k_v1',
              lastSimulatedAt: new Date(),
              createdAt,
            });

            if (i <= 800) {
              const secondaryAnime =
                ANIME_KNOWLEDGE_POOL[(i * 13 + 5) % ANIME_KNOWLEDGE_POOL.length];
              watchlistBatch.push({
                userUid: p.uid,
                animeMalId: p.favoriteAnimeMalId,
                animeTitle: p.favoriteAnime,
                animeImageUrl: p.favoriteAnimeImage,
                genres: p.genres,
                status: 'completed',
                score: 9 + (i % 2),
                episodesWatched: 24,
              });
              if (secondaryAnime.malId !== p.favoriteAnimeMalId) {
                watchlistBatch.push({
                  userUid: p.uid,
                  animeMalId: secondaryAnime.malId,
                  animeTitle: secondaryAnime.title,
                  animeImageUrl: secondaryAnime.imageUrl,
                  genres: secondaryAnime.genres,
                  status: i % 2 === 0 ? 'watching' : 'plan_to_watch',
                  score: i % 2 === 0 ? 9 : null,
                  episodesWatched: i % 2 === 0 ? 12 : 0,
                });
              }
            }
          }

          await db.insert(users).values(userBatch).onConflictDoNothing();
          await db.insert(profiles).values(profileBatch).onConflictDoNothing();
          await db.insert(aiDemoProfiles).values(aiMetaBatch).onConflictDoNothing();
          if (watchlistBatch.length > 0) {
            await db.insert(userAnimeEntries).values(watchlistBatch).onConflictDoNothing();
          }

          const pct = Math.min(35, Math.round((end / targetProfiles) * 35));
          await updateSeedingJob(jobId, {
            progressPercent: Math.max(4, pct),
            stepLabel: `Verified ${end.toLocaleString()} / ${targetProfiles.toLocaleString()} hunter profiles...`,
          });
        }
      } else {
        await updateSeedingJob(jobId, {
          progressPercent: 35,
          stepLabel: `Verified ${existingDemoUsers.toLocaleString()} hunter profiles...`,
        });
      }

      // =========================================================================
      // STEP 2: OWNER DEMO FOLLOWERS (10,000) & PEER SOCIAL CONNECTIONS
      // =========================================================================
      const targetFollowers = Math.max(
        0,
        Math.min(targetProfiles, cfg.targetOwnerFollowers ?? 10000)
      );
      const [ownerSimFollowRes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(userFollows)
        .where(and(eq(userFollows.followingUid, ownerUid), eq(userFollows.isSimulated, true)));
      const currentOwnerSimFollows = ownerSimFollowRes?.count || 0;

      if (currentOwnerSimFollows > targetFollowers) {
        const excess = currentOwnerSimFollows - targetFollowers;
        await db.execute(sql`
          DELETE FROM user_follows
          WHERE id IN (
            SELECT id FROM user_follows
            WHERE following_uid = ${ownerUid} AND is_simulated = true
            ORDER BY id DESC
            LIMIT ${excess}
          )
        `);
      } else if (currentOwnerSimFollows < targetFollowers) {
        const followChunk = 1000;
        for (let start = 1; start <= targetFollowers; start += followChunk) {
          const end = Math.min(targetFollowers, start + followChunk - 1);
          const rows: (typeof userFollows.$inferInsert)[] = [];
          for (let i = start; i <= end; i++) {
            const followerUid = `ai_demo_${String(i).padStart(5, '0')}`;
            if (followerUid !== ownerUid) {
              rows.push({
                followerUid,
                followingUid: ownerUid,
                isSimulated: true,
              });
            }
          }
          if (rows.length > 0) {
            await db.insert(userFollows).values(rows).onConflictDoNothing();
          }
        }
      }

      // Seed peer-to-peer follows across the first 1,200 AI demo accounts so profiles have followers & following
      const [peerFollowCountRes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(userFollows)
        .where(
          and(
            eq(userFollows.isSimulated, true),
            sql`${userFollows.followingUid} LIKE 'ai_demo_%'`
          )
        );
      if ((peerFollowCountRes?.count || 0) < 2400 && targetProfiles >= 1200) {
        const peerRows: (typeof userFollows.$inferInsert)[] = [];
        for (let i = 1; i <= 1200; i++) {
          const a = `ai_demo_${String(i).padStart(5, '0')}`;
          const b1 = `ai_demo_${String(((i * 7 + 13) % 1200) + 1).padStart(5, '0')}`;
          const b2 = `ai_demo_${String(((i * 19 + 29) % 1200) + 1).padStart(5, '0')}`;
          const b3 = `ai_demo_${String(((i * 31 + 47) % 1200) + 1).padStart(5, '0')}`;
          for (const target of [b1, b2, b3]) {
            if (target !== a) {
              peerRows.push({ followerUid: a, followingUid: target, isSimulated: true });
            }
          }
        }
        for (let s = 0; s < peerRows.length; s += 1000) {
          await db
            .insert(userFollows)
            .values(peerRows.slice(s, s + 1000))
            .onConflictDoNothing();
        }
      }

      await updateSeedingJob(jobId, {
        progressPercent: 52,
        stepLabel: `Synchronized ${targetFollowers.toLocaleString()} Owner followers & peer connections...`,
      });

      // =========================================================================
      // STEP 3: OWNER SHOWCASE POST ENGAGEMENT (2K LIKES, 1K REPOSTS, 5K COMMENTS, SHARES)
      // =========================================================================
      const showcasePost = await ensureShowcasePostForOwner(ownerUid, cfg.showcasePostId);
      const showcaseId = showcasePost.id;

      const targetLikes = Math.max(0, Math.min(targetProfiles, cfg.targetShowcaseLikes ?? 10000));
      const targetReposts = Math.max(
        0,
        Math.min(targetProfiles, cfg.targetShowcaseReposts ?? 1000)
      );
      const targetShares = Math.max(0, Math.min(targetProfiles, cfg.targetShowcaseShares ?? 650));
      const targetComments = Math.max(0, Math.min(10000, cfg.targetShowcaseComments ?? 5000));

      // 3a. Showcase Simulated Likes
      const [simLikesRes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(reactions)
        .where(
          and(
            eq(reactions.targetType, 'discussion'),
            eq(reactions.targetId, showcaseId),
            eq(reactions.reactionType, 'like'),
            eq(reactions.isSimulated, true)
          )
        );
      const curSimLikes = simLikesRes?.count || 0;
      if (curSimLikes > targetLikes) {
        const diff = curSimLikes - targetLikes;
        await db.execute(sql`
          DELETE FROM reactions
          WHERE id IN (
            SELECT id FROM reactions
            WHERE target_type = 'discussion' AND target_id = ${showcaseId} AND reaction_type = 'like' AND is_simulated = true
            ORDER BY id DESC LIMIT ${diff}
          )
        `);
      } else if (curSimLikes < targetLikes) {
        for (let s = 1; s <= targetLikes; s += 1000) {
          const e = Math.min(targetLikes, s + 999);
          const batch: (typeof reactions.$inferInsert)[] = [];
          for (let i = s; i <= e; i++) {
            batch.push({
              userUid: `ai_demo_${String(i).padStart(5, '0')}`,
              targetType: 'discussion',
              targetId: showcaseId,
              reactionType: 'like',
              isSimulated: true,
            });
          }
          await db.insert(reactions).values(batch).onConflictDoNothing();
        }
      }

      // 3b. Showcase Simulated Reposts
      const [simRepRes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(pulseReposts)
        .where(and(eq(pulseReposts.postId, showcaseId), eq(pulseReposts.isSimulated, true)));
      const curSimReps = simRepRes?.count || 0;
      if (curSimReps > targetReposts) {
        const diff = curSimReps - targetReposts;
        await db.execute(sql`
          DELETE FROM pulse_reposts
          WHERE id IN (
            SELECT id FROM pulse_reposts
            WHERE post_id = ${showcaseId} AND is_simulated = true
            ORDER BY id DESC LIMIT ${diff}
          )
        `);
      } else if (curSimReps < targetReposts) {
        const batch: (typeof pulseReposts.$inferInsert)[] = [];
        for (let i = 1; i <= targetReposts; i++) {
          const personaIdx = ((i + 400) % targetProfiles) + 1;
          batch.push({
            userUid: `ai_demo_${String(personaIdx).padStart(5, '0')}`,
            postId: showcaseId,
            isSimulated: true,
          });
        }
        for (let s = 0; s < batch.length; s += 1000) {
          await db.insert(pulseReposts).values(batch.slice(s, s + 1000)).onConflictDoNothing();
        }
      }

      // 3c. Showcase Simulated Shares
      const [simShareRes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(postShares)
        .where(and(eq(postShares.postId, showcaseId), eq(postShares.isSimulated, true)));
      const curSimShares = simShareRes?.count || 0;
      if (curSimShares > targetShares) {
        const diff = curSimShares - targetShares;
        await db.execute(sql`
          DELETE FROM post_shares
          WHERE id IN (
            SELECT id FROM post_shares
            WHERE post_id = ${showcaseId} AND is_simulated = true
            ORDER BY id DESC LIMIT ${diff}
          )
        `);
      } else if (curSimShares < targetShares) {
        const channels = ['copy_link', 'direct_message', 'community', 'external'];
        const batch: (typeof postShares.$inferInsert)[] = [];
        for (let i = 1; i <= targetShares; i++) {
          const personaIdx = ((i + 1700) % targetProfiles) + 1;
          batch.push({
            postId: showcaseId,
            userUid: `ai_demo_${String(personaIdx).padStart(5, '0')}`,
            shareChannel: channels[i % channels.length],
            isSimulated: true,
          });
        }
        for (let s = 0; s < batch.length; s += 1000) {
          await db.insert(postShares).values(batch.slice(s, s + 1000)).onConflictDoNothing();
        }
      }

      // 3d. Showcase Context-Aware Comments & Nested Replies (5,000)
      const [simCommRes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(comments)
        .where(and(eq(comments.discussionId, showcaseId), eq(comments.isAiGenerated, true)));
      const curSimComms = simCommRes?.count || 0;

      if (curSimComms > targetComments) {
        const diff = curSimComms - targetComments;
        await db.execute(sql`
          DELETE FROM comments
          WHERE id IN (
            SELECT id FROM comments
            WHERE discussion_id = ${showcaseId} AND is_ai_generated = true
            ORDER BY id DESC LIMIT ${diff}
          )
        `);
      } else if (curSimComms < targetComments) {
        const missing = targetComments - curSimComms;
        const topGoal = Math.max(1, Math.round(missing * 0.72));
        const replyGoal = Math.max(0, missing - topGoal);
        const nowMs = Date.now();

        const anchoredParents: { id: number; username: string; snippet: string }[] = [];
        const commChunk = 500;

        for (let s = 0; s < topGoal; s += commChunk) {
          const count = Math.min(commChunk, topGoal - s);
          const batch: (typeof comments.$inferInsert)[] = [];
          const metaForAnchor: { username: string; snippet: string }[] = [];

          for (let k = 0; k < count; k++) {
            const seq = curSimComms + s + k + 1;
            const personaIdx = ((seq * 7 + 19) % targetProfiles) + 1;
            const persona = generateDeterministicDemoPersona(personaIdx);
            const text = composeContextAwareComment({
              seedIndex: seq,
              persona,
              postTitle: showcasePost.title,
              postContent: showcasePost.content,
              postAnimeTitle: showcasePost.animeTitle,
              postGenres: showcasePost.genreTags || [],
              pollQuestion: showcasePost.pollQuestion,
              isOwnerShowcase: true,
            });
            const createdAt = new Date(nowMs - ((seq * 419) % (14 * 24 * 3600)) * 1000);
            const simLikes = seq <= 120 ? (seq * 11) % 48 : seq % 7;

            batch.push({
              discussionId: showcaseId,
              authorUid: persona.uid,
              parentCommentId: null,
              content: text,
              isAiGenerated: true,
              likeCount: simLikes,
              demoLikeCount: simLikes,
              createdAt,
            });
            if (anchoredParents.length + metaForAnchor.length < 300) {
              metaForAnchor.push({ username: persona.username, snippet: text.slice(0, 60) });
            }
          }

          if (anchoredParents.length < 300) {
            const inserted = await db
              .insert(comments)
              .values(batch)
              .returning({ id: comments.id });
            for (let idx = 0; idx < inserted.length && idx < metaForAnchor.length; idx++) {
              if (anchoredParents.length < 300) {
                anchoredParents.push({
                  id: inserted[idx].id,
                  username: metaForAnchor[idx].username,
                  snippet: metaForAnchor[idx].snippet,
                });
              }
            }
          } else {
            await db.insert(comments).values(batch);
          }
        }

        // If we resumed from partial comments and didn't anchor parents yet, fetch up to 150 existing top-level comments
        if (anchoredParents.length === 0 && replyGoal > 0) {
          const existingTop = await db
            .select({
              id: comments.id,
              username: users.username,
              content: comments.content,
            })
            .from(comments)
            .innerJoin(users, eq(comments.authorUid, users.uid))
            .where(
              and(
                eq(comments.discussionId, showcaseId),
                sql`${comments.parentCommentId} IS NULL`
              )
            )
            .limit(150);
          for (const row of existingTop) {
            anchoredParents.push({
              id: row.id,
              username: row.username,
              snippet: row.content.slice(0, 60),
            });
          }
        }

        if (replyGoal > 0 && anchoredParents.length > 0) {
          for (let s = 0; s < replyGoal; s += commChunk) {
            const count = Math.min(commChunk, replyGoal - s);
            const replyBatch: (typeof comments.$inferInsert)[] = [];
            for (let k = 0; k < count; k++) {
              const seq = curSimComms + topGoal + s + k + 1;
              const parent = anchoredParents[(seq * 13) % anchoredParents.length];
              const personaIdx = ((seq * 17 + 83) % targetProfiles) + 1;
              const persona = generateDeterministicDemoPersona(personaIdx);
              const replyText = composeContextAwareComment({
                seedIndex: seq,
                persona,
                postTitle: showcasePost.title,
                postContent: showcasePost.content,
                postAnimeTitle: showcasePost.animeTitle,
                postGenres: showcasePost.genreTags || [],
                isOwnerShowcase: true,
                parentAuthorUsername: parent.username,
                parentSnippet: parent.snippet,
              });
              const createdAt = new Date(nowMs - ((seq * 211) % (7 * 24 * 3600)) * 1000);
              const simLikes = seq % 9;
              replyBatch.push({
                discussionId: showcaseId,
                authorUid: persona.uid,
                parentCommentId: parent.id,
                content: replyText,
                isAiGenerated: true,
                likeCount: simLikes,
                demoLikeCount: simLikes,
                createdAt,
              });
            }
            await db.insert(comments).values(replyBatch);
          }
        }
      }

      await updateSeedingJob(jobId, {
        progressPercent: 76,
        stepLabel: 'Populated Owner Showcase engagement & context-aware comment threads...',
      });

      // =========================================================================
      // STEP 4: 8 CURATED COMMUNITIES, 5,000 MEMBERS, THREADS, POLLS & CLASH VOTES
      // =========================================================================
      const seededCommunities: {
        id: number;
        slug: string;
        name: string;
        animeTitle: string | null;
        animeMalId: number | null;
        genreTags: string[];
      }[] = [];

      for (const blueprint of DEMO_COMMUNITIES_CATALOG) {
        const [existingComm] = await db
          .select()
          .from(communities)
          .where(eq(communities.slug, blueprint.slug))
          .limit(1);

        let commRow = existingComm;
        if (!commRow) {
          const [inserted] = await db
            .insert(communities)
            .values({
              slug: blueprint.slug,
              name: blueprint.name,
              nameNormalized: blueprint.name.toLowerCase(),
              tagline: blueprint.tagline,
              description: blueprint.description,
              category: blueprint.category,
              artworkUrl: blueprint.artworkUrl,
              bannerUrl: blueprint.bannerUrl,
              animeMalId: blueprint.animeMalId,
              animeTitle: blueprint.animeTitle,
              genreTags: blueprint.genreTags,
              ownerUid,
              isVerified: true,
              isSeed: true,
              isAiDemo: true,
              privacyMode: 'public',
              joinPolicy: 'open',
            })
            .onConflictDoNothing()
            .returning();
          commRow = inserted;
        }

        if (commRow) {
          seededCommunities.push({
            id: commRow.id,
            slug: commRow.slug,
            name: commRow.name,
            animeTitle: commRow.animeTitle,
            animeMalId: commRow.animeMalId,
            genreTags: commRow.genreTags || [],
          });
          await db
            .insert(communityMemberships)
            .values({
              communityId: commRow.id,
              userUid: ownerUid,
              role: 'owner',
              isSimulated: false,
            })
            .onConflictDoNothing();
          await Promise.all([
            ensureDefaultCommunityChatRooms(commRow.id, ownerUid),
            ensureStarterRewardsForGuild(commRow.id),
          ]);

          // Seed initial lively chat messages in #general if empty
          const [generalRoom] = await db
            .select()
            .from(communityChatRooms)
            .where(
              and(
                eq(communityChatRooms.communityId, commRow.id),
                eq(communityChatRooms.slug, 'general')
              )
            )
            .limit(1);
          if (generalRoom) {
            const [msgCnt] = await db
              .select({ count: sql<number>`count(*)::int` })
              .from(communityChatMessages)
              .where(eq(communityChatMessages.roomId, generalRoom.id));
            if ((msgCnt?.count || 0) === 0) {
              const p1 = generateDeterministicDemoPersona((commRow.id * 13) % 500 + 1);
              const p2 = generateDeterministicDemoPersona((commRow.id * 29) % 500 + 2);
              const p3 = generateDeterministicDemoPersona((commRow.id * 47) % 500 + 3);
              await db.insert(communityChatMessages).values([
                {
                  roomId: generalRoom.id,
                  communityId: commRow.id,
                  senderUid: p1.uid,
                  content: `Checking into ${commRow.name}! Excited to unpack ${commRow.animeTitle || 'this season'} theories with everyone here.`,
                },
                {
                  roomId: generalRoom.id,
                  communityId: commRow.id,
                  senderUid: p2.uid,
                  content: `Welcome! Make sure to vote in the community arc poll and drop your top 3 ${commRow.genreTags?.[0] || 'anime'} picks.`,
                },
                {
                  roomId: generalRoom.id,
                  communityId: commRow.id,
                  senderUid: p3.uid,
                  content: `That latest soundtrack & storyboard breakdown thread in ${commRow.name} is an instant bookmark.`,
                },
              ]);
            }
          }
        }
      }

      // Include flagship public communities as well so the whole Guilds directory feels thriving
      const allPublicGuilds = await db
        .select({
          id: communities.id,
          slug: communities.slug,
          name: communities.name,
          animeTitle: communities.animeTitle,
          animeMalId: communities.animeMalId,
          genreTags: communities.genreTags,
        })
        .from(communities)
        .where(and(eq(communities.privacyMode, 'public'), eq(communities.isArchived, false)))
        .limit(20);

      const guildPool = allPublicGuilds.length > 0 ? allPublicGuilds : seededCommunities;
      const targetCommMembers = Math.max(
        0,
        Math.min(targetProfiles, cfg.targetCommunityMembers ?? 5000)
      );

      if (guildPool.length > 0 && targetCommMembers > 0) {
        const [existingSimMemRes] = await db
          .select({ count: sql<number>`count(distinct user_uid)::int` })
          .from(communityMemberships)
          .where(eq(communityMemberships.isSimulated, true));

        if ((existingSimMemRes?.count || 0) < targetCommMembers) {
          const memBatch: (typeof communityMemberships.$inferInsert)[] = [];
          for (let i = 1; i <= targetCommMembers; i++) {
            const uid = `ai_demo_${String(i).padStart(5, '0')}`;
            const gPrimary = guildPool[(i * 7) % guildPool.length];
            memBatch.push({
              communityId: gPrimary.id,
              userUid: uid,
              role: i <= guildPool.length * 2 ? 'moderator' : 'member',
              isSimulated: true,
            });
            if (i % 2 === 0 && guildPool.length > 1) {
              const gSecondary = guildPool[(i * 7 + 3) % guildPool.length];
              if (gSecondary.id !== gPrimary.id) {
                memBatch.push({
                  communityId: gSecondary.id,
                  userUid: uid,
                  role: 'member',
                  isSimulated: true,
                });
              }
            }
          }
          for (let s = 0; s < memBatch.length; s += 1000) {
            await db
              .insert(communityMemberships)
              .values(memBatch.slice(s, s + 1000))
              .onConflictDoNothing();
          }
        }
      }

      // Seed 64 diverse Community & PULSE threads + Polls + Replies + Likes + Activity History
      const [aiDiscCountRes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(discussions)
        .where(eq(discussions.isAiGenerated, true));
      const existingAiDiscussions = aiDiscCountRes?.count || 0;

      if (existingAiDiscussions < 56 && seededCommunities.length > 0) {
        const activityBatch: (typeof userActivityHistory.$inferInsert)[] = [];
        const reactionBatch: (typeof reactions.$inferInsert)[] = [];
        let seedCounter = 1;

        for (const comm of seededCommunities) {
          for (let t = 0; t < 8; t++) {
            const idx = seedCounter++;
            const authorPersona = generateDeterministicDemoPersona(((idx * 23) % 2500) + 1);
            const blueprint = composeDeterministicCommunityThread(idx, comm, authorPersona);
            const createdAt = new Date(Date.now() - ((idx * 3700) % (12 * 24 * 3600)) * 1000);

            // Make ~35% of threads kind = 'pulse' so PULSE feed and GUILDS feed are both vibrant
            const effectiveKind =
              blueprint.kind === 'announcement'
                ? 'announcement'
                : idx % 3 === 0
                  ? 'pulse'
                  : blueprint.kind;

            let pollOptions = blueprint.pollOptions;
            const pollVoterRecords: { userUid: string; optionId: string }[] = [];

            if (blueprint.topicType === 'poll' && Array.isArray(pollOptions) && pollOptions.length > 0) {
              const counts = pollOptions.map(() => 0);
              const totalVoters = 48 + ((idx * 17) % 64);
              for (let v = 0; v < totalVoters; v++) {
                const voterIdx = ((idx * 50 + v) % Math.min(4000, targetProfiles)) + 1;
                const optIdx = (v * 3 + idx + (v % 2 === 0 ? 0 : 1)) % pollOptions.length;
                counts[optIdx]++;
                pollVoterRecords.push({
                  userUid: `ai_demo_${String(voterIdx).padStart(5, '0')}`,
                  optionId: pollOptions[optIdx].id,
                });
              }
              pollOptions = pollOptions.map((o, oIdx) => ({
                ...o,
                votes: counts[oIdx],
              }));
            }

            const [insertedDisc] = await db
              .insert(discussions)
              .values({
                authorUid: authorPersona.uid,
                communityId: comm.id,
                animeMalId: blueprint.animeMalId,
                animeTitle: blueprint.animeTitle,
                genreTags: blueprint.genreTags,
                hashtags: blueprint.genreTags.map((g) => g.toLowerCase().replace(/\s+/g, '')),
                kind: effectiveKind,
                isAnnouncement: blueprint.isAnnouncement,
                title: blueprint.title,
                content: blueprint.content,
                mediaUrl: blueprint.mediaUrl,
                mediaType: blueprint.mediaType,
                pollQuestion: blueprint.pollQuestion,
                pollOptions,
                isSeed: true,
                isAiGenerated: true,
                createdAt,
                updatedAt: createdAt,
              })
              .returning();

            await db
              .insert(communityPosts)
              .values({
                communityId: comm.id,
                discussionId: insertedDisc.id,
                authorUid: authorPersona.uid,
                topicType: blueprint.topicType,
                isAiGenerated: true,
                createdAt,
              })
              .onConflictDoNothing();

            activityBatch.push({
              userUid: authorPersona.uid,
              activityType: 'community_thread',
              entityType: 'discussion',
              entityId: String(insertedDisc.id),
              communityId: comm.id,
              summary: `Published ${blueprint.topicType.replace(/_/g, ' ')} "${blueprint.title.slice(0, 72)}" in ${comm.name}`,
              linkUrl: `/pulse?discussion=${insertedDisc.id}`,
              isSimulated: true,
              createdAt,
            });

            if (pollVoterRecords.length > 0) {
              await db
                .insert(discussionPollVotes)
                .values(
                  pollVoterRecords.map((pv) => ({
                    discussionId: insertedDisc.id,
                    userUid: pv.userUid,
                    optionId: pv.optionId,
                    isSimulated: true,
                  }))
                )
                .onConflictDoNothing();
            }

            // Seed 24–78 simulated likes per thread
            const threadLikes = 24 + ((idx * 19) % 55);
            for (let l = 0; l < threadLikes; l++) {
              const likerIdx = ((idx * 97 + l * 3) % Math.min(4500, targetProfiles)) + 1;
              reactionBatch.push({
                userUid: `ai_demo_${String(likerIdx).padStart(5, '0')}`,
                targetType: 'discussion',
                targetId: insertedDisc.id,
                reactionType: 'like',
                isSimulated: true,
              });
            }

            // Seed 4 top-level comments + 2 nested replies per thread
            const topCommentsBatch: (typeof comments.$inferInsert)[] = [];
            const topPersonas: { username: string; snippet: string }[] = [];
            for (let c = 0; c < 4; c++) {
              const cPersona = generateDeterministicDemoPersona(
                ((idx * 41 + c * 113) % Math.min(4500, targetProfiles)) + 1
              );
              const cText = composeContextAwareComment({
                seedIndex: idx * 10 + c,
                persona: cPersona,
                postTitle: blueprint.title,
                postContent: blueprint.content,
                postAnimeTitle: blueprint.animeTitle,
                postGenres: blueprint.genreTags,
                pollQuestion: blueprint.pollQuestion,
              });
              topCommentsBatch.push({
                discussionId: insertedDisc.id,
                authorUid: cPersona.uid,
                parentCommentId: null,
                content: cText,
                isAiGenerated: true,
                likeCount: (idx + c) % 11,
                demoLikeCount: (idx + c) % 11,
                createdAt: new Date(createdAt.getTime() + (c + 1) * 600_000),
              });
              topPersonas.push({ username: cPersona.username, snippet: cText.slice(0, 56) });

              if (activityBatch.length < 1200) {
                activityBatch.push({
                  userUid: cPersona.uid,
                  activityType: 'comment_posted',
                  entityType: 'discussion',
                  entityId: String(insertedDisc.id),
                  communityId: comm.id,
                  summary: `Commented on "${blueprint.title.slice(0, 68)}"`,
                  linkUrl: `/pulse?discussion=${insertedDisc.id}`,
                  isSimulated: true,
                  createdAt: new Date(createdAt.getTime() + (c + 1) * 600_000),
                });
              }
            }

            const insertedTop = await db
              .insert(comments)
              .values(topCommentsBatch)
              .returning({ id: comments.id });

            if (insertedTop.length >= 2) {
              const nestedBatch: (typeof comments.$inferInsert)[] = [];
              for (let r = 0; r < 2; r++) {
                const rPersona = generateDeterministicDemoPersona(
                  ((idx * 71 + r * 199) % Math.min(4500, targetProfiles)) + 1
                );
                const rText = composeContextAwareComment({
                  seedIndex: idx * 20 + r,
                  persona: rPersona,
                  postTitle: blueprint.title,
                  postContent: blueprint.content,
                  postAnimeTitle: blueprint.animeTitle,
                  postGenres: blueprint.genreTags,
                  parentAuthorUsername: topPersonas[r].username,
                  parentSnippet: topPersonas[r].snippet,
                });
                nestedBatch.push({
                  discussionId: insertedDisc.id,
                  authorUid: rPersona.uid,
                  parentCommentId: insertedTop[r].id,
                  content: rText,
                  isAiGenerated: true,
                  likeCount: (idx + r) % 6,
                  demoLikeCount: (idx + r) % 6,
                  createdAt: new Date(createdAt.getTime() + (r + 5) * 700_000),
                });
              }
              await db.insert(comments).values(nestedBatch);
            }
          }
        }

        for (let s = 0; s < reactionBatch.length; s += 1000) {
          await db.insert(reactions).values(reactionBatch.slice(s, s + 1000)).onConflictDoNothing();
        }
        for (let s = 0; s < activityBatch.length; s += 500) {
          await db.insert(userActivityHistory).values(activityBatch.slice(s, s + 500));
        }
      }

      // Optional Gemini AI-enriched community discussions
      if (options?.generateGeminiThreads && seededCommunities.length > 0) {
        await updateSeedingJob(jobId, {
          progressPercent: 86,
          stepLabel: 'Generating fresh anime discussions via Gemini...',
        });
        const geminiItems = await generateGeminiCommunityDiscussions({
          communities: seededCommunities,
          count: 6,
        });
        if (geminiItems && geminiItems.length > 0) {
          for (let gIdx = 0; gIdx < geminiItems.length; gIdx++) {
            const item = geminiItems[gIdx];
            const matchedComm =
              seededCommunities.find(
                (c) => c.name.toLowerCase() === item.communityName.toLowerCase()
              ) || seededCommunities[gIdx % seededCommunities.length];
            const authorP = generateDeterministicDemoPersona(((Date.now() + gIdx * 37) % 2000) + 1);
            const r1P = generateDeterministicDemoPersona(((Date.now() + gIdx * 73 + 11) % 2000) + 1);
            const r2P = generateDeterministicDemoPersona(((Date.now() + gIdx * 109 + 29) % 2000) + 1);

            const [newDisc] = await db
              .insert(discussions)
              .values({
                authorUid: authorP.uid,
                communityId: matchedComm.id,
                animeTitle: item.animeTitle || matchedComm.animeTitle,
                animeMalId: matchedComm.animeMalId,
                genreTags: matchedComm.genreTags,
                kind: gIdx % 2 === 0 ? 'pulse' : 'discussion',
                title: item.title,
                content: item.content,
                mediaType: 'none',
                isSeed: true,
                isAiGenerated: true,
              })
              .returning();

            await db
              .insert(communityPosts)
              .values({
                communityId: matchedComm.id,
                discussionId: newDisc.id,
                authorUid: authorP.uid,
                topicType: item.topicType,
                isAiGenerated: true,
              })
              .onConflictDoNothing();

            const [c1] = await db
              .insert(comments)
              .values({
                discussionId: newDisc.id,
                authorUid: r1P.uid,
                content: item.reply1,
                isAiGenerated: true,
                likeCount: 5,
                demoLikeCount: 5,
              })
              .returning({ id: comments.id });

            await db.insert(comments).values({
              discussionId: newDisc.id,
              authorUid: r2P.uid,
              parentCommentId: c1?.id || null,
              content: `@${r1P.username} ${item.reply2}`,
              isAiGenerated: true,
              likeCount: 3,
              demoLikeCount: 3,
            });
          }
        }
      }

      // Seed simulated votes on active Clashes so Clash Battle Arena feels alive
      const liveClashes = await db
        .select({ id: clashes.id })
        .from(clashes)
        .where(eq(clashes.status, 'live'))
        .limit(10);
      if (liveClashes.length > 0) {
        const clashVoteBatch: (typeof clashVotes.$inferInsert)[] = [];
        for (let cIdx = 0; cIdx < liveClashes.length; cIdx++) {
          const cl = liveClashes[cIdx];
          const voters = 65 + ((cIdx * 29) % 80);
          for (let v = 1; v <= voters; v++) {
            const uIdx = ((cIdx * 130 + v) % Math.min(3000, targetProfiles)) + 1;
            const side = (v + cIdx) % 10 < 6 ? 'left' : 'right';
            clashVoteBatch.push({
              clashId: cl.id,
              userUid: `ai_demo_${String(uIdx).padStart(5, '0')}`,
              side,
            });
          }
        }
        if (clashVoteBatch.length > 0) {
          for (let s = 0; s < clashVoteBatch.length; s += 1000) {
            await db
              .insert(clashVotes)
              .values(clashVoteBatch.slice(s, s + 1000))
              .onConflictDoNothing();
          }
        }
      }

      await updateSeedingJob(jobId, {
        progressPercent: 93,
        stepLabel: 'Synchronizing engagement counters across profiles, guilds, posts & clashes...',
      });

      await db
        .update(aiCommunityConfig)
        .set({ autoSeededInitial: true, updatedAt: new Date() })
        .where(eq(aiCommunityConfig.id, 1));

      await upgradeCommunityRealismAndEngagement();
      await recalculateEngagementCounters();

      await updateSeedingJob(jobId, {
        status: 'completed',
        progressPercent: 100,
        stepLabel: 'Community profiles and engagement synchronized.',
        completedAt: new Date(),
      });
    } catch (error: any) {
      console.error('[AI Community Seeding Error]:', error?.message || error);
      await updateSeedingJob(jobId, {
        status: 'failed',
        stepLabel: 'Seeding encountered an error.',
        errorMessage: String(error?.message || error).slice(0, 500),
        completedAt: new Date(),
      });
    } finally {
      activeSeedingPromise = null;
      activeSeedingJobId = null;
      invalidateAiCommunityConfigCache();
    }
  })();

  return { started: true, jobId };
}

async function populateContextualCommentsForPost(params: {
  post: {
    id: number;
    title: string;
    content: string;
    animeTitle: string | null;
    genreTags: string[] | null;
    pollQuestion: string | null;
    createdAt: Date;
  };
  countToInsert: number;
  maxProfilePool: number;
  isHighTraffic?: boolean;
}) {
  const { post, countToInsert, maxProfilePool, isHighTraffic } = params;
  if (countToInsert <= 0) return;

  const topGoal = Math.max(1, Math.round(countToInsert * 0.72));
  const replyGoal = Math.max(0, countToInsert - topGoal);
  const nowMs = Date.now();
  const postCreatedMs = new Date(post.createdAt || nowMs - 86_400_000).getTime();
  const spanMs = Math.max(3_600_000, nowMs - postCreatedMs);

  const anchoredParents: { id: number; username: string }[] = [];
  const chunk = 500;

  for (let s = 0; s < topGoal; s += chunk) {
    const size = Math.min(chunk, topGoal - s);
    const batch: (typeof comments.$inferInsert)[] = [];
    const anchorUsernames: string[] = [];

    for (let k = 0; k < size; k++) {
      const seq = s + k + 1;
      const personaIdx = ((post.id * 131 + seq * 17 + 7) % maxProfilePool) + 1;
      const persona = generateDeterministicDemoPersona(personaIdx);
      const text = composeContextAwareComment({
        seedIndex: post.id * 31 + seq,
        persona,
        postTitle: post.title,
        postContent: post.content,
        postAnimeTitle: post.animeTitle,
        postGenres: post.genreTags || [],
        pollQuestion: post.pollQuestion,
      });

      const createdAt = new Date(
        Math.min(nowMs - 60_000, postCreatedMs + ((seq * 59_000 + post.id * 13_000) % spanMs))
      );
      const likes = isHighTraffic
        ? seq <= 40
          ? 28 + ((seq * 19 + post.id) % 340)
          : (seq * 7) % 29
        : seq <= 6
          ? 3 + ((seq * 11 + post.id) % 42)
          : (seq * 3 + post.id) % 9;

      batch.push({
        discussionId: post.id,
        authorUid: persona.uid,
        parentCommentId: null,
        content: text,
        isAiGenerated: true,
        likeCount: likes,
        demoLikeCount: likes,
        createdAt,
      });

      if (anchoredParents.length + anchorUsernames.length < 220) {
        anchorUsernames.push(persona.username);
      }
    }

    if (anchoredParents.length < 220) {
      const inserted = await db
        .insert(comments)
        .values(batch)
        .returning({ id: comments.id });
      for (let i = 0; i < inserted.length && i < anchorUsernames.length; i++) {
        if (anchoredParents.length < 220) {
          anchoredParents.push({ id: inserted[i].id, username: anchorUsernames[i] });
        }
      }
    } else {
      await db.insert(comments).values(batch);
    }
  }

  if (replyGoal > 0 && anchoredParents.length > 0) {
    for (let s = 0; s < replyGoal; s += chunk) {
      const size = Math.min(chunk, replyGoal - s);
      const replyBatch: (typeof comments.$inferInsert)[] = [];

      for (let k = 0; k < size; k++) {
        const seq = topGoal + s + k + 1;
        const parent = anchoredParents[(seq * 11 + post.id) % anchoredParents.length];
        const personaIdx = ((post.id * 197 + seq * 29 + 41) % maxProfilePool) + 1;
        const persona = generateDeterministicDemoPersona(personaIdx);
        const replyText = composeContextAwareComment({
          seedIndex: post.id * 53 + seq,
          persona,
          postTitle: post.title,
          postContent: post.content,
          postAnimeTitle: post.animeTitle,
          postGenres: post.genreTags || [],
          pollQuestion: post.pollQuestion,
          parentAuthorUsername: parent.username,
        });

        const createdAt = new Date(
          Math.min(nowMs - 30_000, postCreatedMs + ((seq * 71_000 + post.id * 19_000) % spanMs))
        );
        const likes = isHighTraffic ? (seq * 5) % 34 : (seq + post.id) % 8;

        replyBatch.push({
          discussionId: post.id,
          authorUid: persona.uid,
          parentCommentId: parent.id,
          content: replyText,
          isAiGenerated: true,
          likeCount: likes,
          demoLikeCount: likes,
          createdAt,
        });
      }
      await db.insert(comments).values(replyBatch);
    }
  }
}

let realismUpgradePromise: Promise<void> | null = null;

export async function upgradeCommunityRealismAndEngagement(): Promise<void> {
  if (realismUpgradePromise) return realismUpgradePromise;

  realismUpgradePromise = (async () => {
    try {
      const [demoCountRes] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
        .where(eq(users.isAiDemo, true));
      const maxProfilePool = Math.min(10000, demoCountRes?.count || 0);
      if (maxProfilePool < 100) return;

      // 1. Scrub any remaining "AI Demo" / "Simulated" labels & upgrade KAGE-D / NULL IDs to standard KAGE-00010001 IDs
      await Promise.all([
        db.execute(sql`
          UPDATE users
          SET
            kage_id = 'KAGE-' || LPAD((10000 + REPLACE(uid, 'ai_demo_', '')::int)::text, 8, '0'),
            email = username_normalized || '@hunters.kage.app'
          WHERE is_ai_demo = true
            AND uid LIKE 'ai_demo_%'
            AND (kage_id IS NULL OR kage_id LIKE 'KAGE-D%' OR email LIKE '%@demo.kage.invalid')
        `),
        db.execute(sql`
          UPDATE profiles
          SET bio = LTRIM(SUBSTRING(bio FROM POSITION(']' IN bio) + 1))
          WHERE bio ILIKE '[AI Demo%]%'
        `),
        db.execute(sql`
          UPDATE ai_demo_profiles
          SET disclosure_label = ''
          WHERE disclosure_label <> ''
        `),
        db.execute(sql`
          UPDATE discussions
          SET
            content = CASE
              WHEN content ILIKE '[AI Demo%]%' THEN LTRIM(SUBSTRING(content FROM POSITION(']' IN content) + 1))
              ELSE content
            END,
            title = CASE
              WHEN title LIKE '%Bocchi the Rock!''s Power Rules%' THEN 'Hidden Foreshadowing & Visual Callbacks in Bocchi the Rock!'
              WHEN title LIKE '%The Apothecary Diaries''s Power Rules%' THEN 'Hidden Foreshadowing & Visual Callbacks in The Apothecary Diaries'
              WHEN title LIKE '%Violet Evergarden''s Power Rules%' THEN 'Hidden Foreshadowing & Visual Callbacks in Violet Evergarden'
              WHEN title LIKE '%Battle IQ Debate:%Hitori Gotoh%' THEN REPLACE(title, 'Battle IQ Debate:', 'Arc Payoff:')
              WHEN title LIKE '%Battle IQ Debate:%Violet Evergarden%' THEN REPLACE(title, 'Battle IQ Debate:', 'Arc Payoff:')
              WHEN title LIKE '%Battle IQ Debate:%Maomao%' THEN REPLACE(title, 'Battle IQ Debate:', 'Deduction & Writing:')
              ELSE title
            END
          WHERE content ILIKE '[AI Demo%]%'
             OR title LIKE '%Bocchi the Rock!''s Power Rules%'
             OR title LIKE '%The Apothecary Diaries''s Power Rules%'
             OR title LIKE '%Violet Evergarden''s Power Rules%'
             OR title LIKE '%Battle IQ Debate:%Hitori Gotoh%'
             OR title LIKE '%Battle IQ Debate:%Violet Evergarden%'
             OR title LIKE '%Battle IQ Debate:%Maomao%'
        `),
        db.execute(sql`
          UPDATE community_chat_messages
          SET content = LTRIM(SUBSTRING(content FROM POSITION(']' IN content) + 1))
          WHERE content ILIKE '[AI Demo%]%'
        `),
        db.execute(sql`
          UPDATE user_activity_history
          SET summary = LTRIM(SUBSTRING(summary FROM POSITION(']' IN summary) + 1))
          WHERE summary ILIKE '[Simulated Demo Activity]%'
        `),
        db.execute(sql`
          UPDATE ai_community_config
          SET target_showcase_likes = 10000, updated_at = NOW()
          WHERE id = 1 AND target_showcase_likes < 10000
        `),
      ]);
      invalidateAiCommunityConfigCache();

      // Check if we already migrated comments & varied counts to realistic_v2
      const [v2Check] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(aiDemoProfiles)
        .where(eq(aiDemoProfiles.seedBatch, 'realistic_v2'));
      const alreadyV2 = (v2Check?.count || 0) > 0;

      // Fetch all active discussions + author roles + existing real likes/comments
      const allPostsRes = await db.execute(sql`
        SELECT
          d.id,
          d.author_uid,
          u.role AS author_role,
          d.title,
          d.content,
          d.anime_title,
          d.genre_tags,
          d.poll_question,
          d.created_at,
          COALESCE((
            SELECT COUNT(*)::int FROM reactions r
            WHERE r.target_type = 'discussion' AND r.target_id = d.id AND r.reaction_type = 'like' AND r.is_simulated = false
          ), 0) AS real_likes,
          COALESCE((
            SELECT COUNT(*)::int FROM reactions r
            WHERE r.target_type = 'discussion' AND r.target_id = d.id AND r.reaction_type = 'like' AND r.is_simulated = true
          ), 0) AS sim_likes,
          COALESCE((
            SELECT COUNT(*)::int FROM comments c
            WHERE c.discussion_id = d.id AND c.is_deleted = false AND c.is_ai_generated = false
          ), 0) AS real_comms,
          COALESCE((
            SELECT COUNT(*)::int FROM comments c
            WHERE c.discussion_id = d.id AND c.is_deleted = false AND c.is_ai_generated = true
          ), 0) AS sim_comms,
          COALESCE((
            SELECT COUNT(*)::int FROM pulse_reposts rp
            WHERE rp.post_id = d.id AND rp.is_simulated = true
          ), 0) AS sim_reps
        FROM discussions d
        JOIN users u ON u.uid = d.author_uid
        WHERE d.is_archived = false
        ORDER BY d.id ASC
      `);

      const allPosts: any[] = (allPostsRes as any).rows || [];
      const adminPosts = allPosts.filter(
        (p) => p.author_role === 'owner' || p.author_role === 'admin'
      );
      const regularPosts = allPosts.filter(
        (p) => p.author_role !== 'owner' && p.author_role !== 'admin'
      );

      // 2. Always guarantee every Admin/Owner post has >= 10,000 total likes (10k) & distinct reposts
      for (let aIdx = 0; aIdx < adminPosts.length; aIdx++) {
        const ap = adminPosts[aIdx];
        const postId = Number(ap.id);
        const realLikes = Number(ap.real_likes || 0);
        const curSimLikes = Number(ap.sim_likes || 0);
        const desiredSimLikes = Math.min(maxProfilePool, Math.max(0, 10000 - realLikes));

        if (curSimLikes < desiredSimLikes) {
          for (let s = 1; s <= desiredSimLikes; s += 1000) {
            const e = Math.min(desiredSimLikes, s + 999);
            const batch: (typeof reactions.$inferInsert)[] = [];
            for (let i = s; i <= e; i++) {
              batch.push({
                userUid: `ai_demo_${String(i).padStart(5, '0')}`,
                targetType: 'discussion',
                targetId: postId,
                reactionType: 'like',
                isSimulated: true,
              });
            }
            await db.insert(reactions).values(batch).onConflictDoNothing();
          }
        }

        const desiredReps = Math.min(maxProfilePool, aIdx === 0 ? 1240 : 1480 + aIdx * 170);
        const curSimReps = Number(ap.sim_reps || 0);
        if (curSimReps < desiredReps) {
          const repBatch: (typeof pulseReposts.$inferInsert)[] = [];
          for (let i = 1; i <= desiredReps; i++) {
            const uIdx = ((i + aIdx * 900 + 300) % maxProfilePool) + 1;
            repBatch.push({
              userUid: `ai_demo_${String(uIdx).padStart(5, '0')}`,
              postId,
              isSimulated: true,
            });
          }
          for (let s = 0; s < repBatch.length; s += 1000) {
            await db.insert(pulseReposts).values(repBatch.slice(s, s + 1000)).onConflictDoNothing();
          }
        }
      }

      // 3. One-time realistic_v2 rebuild: replace uniform/robotic AI comments with post-specific comments & strictly unique counts per post
      if (!alreadyV2) {
        console.log('[Community Realism] Rebuilding post-matched comments with unique counts per post...');
        await db.delete(comments).where(eq(comments.isAiGenerated, true));

        const usedCommentTotals = new Set<number>();
        const claimUniqueCount = (preferred: number): number => {
          let candidate = Math.max(4, preferred);
          while (usedCommentTotals.has(candidate)) {
            candidate += 1;
          }
          usedCommentTotals.add(candidate);
          return candidate;
        };

        // Populate Admin / Owner posts first (e.g., Post #1 -> 2,640 [2.6k], Post #3 -> 5,000 [5k])
        for (let aIdx = 0; aIdx < adminPosts.length; aIdx++) {
          const ap = adminPosts[aIdx];
          const postId = Number(ap.id);
          const realComms = Number(ap.real_comms || 0);
          const preferredTotal =
            /welcome to anime universe/i.test(String(ap.title || ''))
              ? 5000
              : /welcome to kage/i.test(String(ap.title || ''))
                ? 2640
                : 1850 + aIdx * 420;
          const uniqueTotal = claimUniqueCount(Math.max(realComms + 20, preferredTotal));
          const toInsert = Math.max(0, uniqueTotal - realComms);

          await populateContextualCommentsForPost({
            post: {
              id: postId,
              title: String(ap.title || ''),
              content: String(ap.content || ''),
              animeTitle: ap.anime_title || null,
              genreTags: Array.isArray(ap.genre_tags) ? ap.genre_tags : [],
              pollQuestion: ap.poll_question || null,
              createdAt: ap.created_at ? new Date(ap.created_at) : new Date(),
            },
            countToInsert: toInsert,
            maxProfilePool,
            isHighTraffic: true,
          });
        }

        // Populate all regular & community posts with strictly distinct comment counts + varied likes/reposts
        const newReactions: (typeof reactions.$inferInsert)[] = [];
        const newReposts: (typeof pulseReposts.$inferInsert)[] = [];

        for (let rIdx = 0; rIdx < regularPosts.length; rIdx++) {
          const rp = regularPosts[rIdx];
          const postId = Number(rp.id);
          const realComms = Number(rp.real_comms || 0);
          const titleStr = String(rp.title || '');
          const bodyStr = String(rp.content || '');
          const isShortHumanCheckin = bodyStr.trim().length < 40;

          // Choose organic, varied total comment target (with a few viral breakout threads in 1k+ range)
          let preferredComments: number;
          let targetPostLikes: number;
          let targetPostReposts: number;

          if (isShortHumanCheckin) {
            preferredComments = postId === 2 ? 11 : 7 + (rIdx % 6);
            targetPostLikes = postId === 2 ? 24 : 16 + (rIdx % 15);
            targetPostReposts = 2 + (rIdx % 3);
          } else if (rIdx === 4) {
            // Breakout Poll thread (1.4k replies, 3.4k likes)
            preferredComments = 1420;
            targetPostLikes = 3420;
            targetPostReposts = 410;
          } else if (rIdx === 14) {
            // Breakout Gojo vs Zoro debate (1.1k replies, 2.8k likes)
            preferredComments = 1150;
            targetPostLikes = 2840;
            targetPostReposts = 320;
          } else if (rIdx === 22) {
            // Breakout Black Clover keyframes thread (640 replies, 1.9k likes)
            preferredComments = 640;
            targetPostLikes = 1920;
            targetPostReposts = 215;
          } else if (rIdx === 36) {
            // Breakout Cyberpunk Edgerunners thread (430 replies, 1.5k likes)
            preferredComments = 430;
            targetPostLikes = 1540;
            targetPostReposts = 175;
          } else if (rIdx === 50) {
            // Breakout Bocchi the Rock! thread (310 replies, 1.2k likes)
            preferredComments = 310;
            targetPostLikes = 1230;
            targetPostReposts = 130;
          } else {
            // Varied natural spread across 9..215 so every post looks completely organic
            preferredComments = 9 + ((postId * 43 + rIdx * 29 + 13) % 198);
            targetPostLikes = Math.max(
              preferredComments + 18,
              34 + ((postId * 137 + rIdx * 83) % 860)
            );
            targetPostReposts = 3 + ((postId * 19 + rIdx * 7) % 68);
          }

          const uniqueTotal = claimUniqueCount(Math.max(realComms + 3, preferredComments));
          const toInsert = Math.max(0, uniqueTotal - realComms);

          await populateContextualCommentsForPost({
            post: {
              id: postId,
              title: titleStr,
              content: bodyStr,
              animeTitle: rp.anime_title || null,
              genreTags: Array.isArray(rp.genre_tags) ? rp.genre_tags : [],
              pollQuestion: rp.poll_question || null,
              createdAt: rp.created_at ? new Date(rp.created_at) : new Date(),
            },
            countToInsert: toInsert,
            maxProfilePool,
            isHighTraffic: uniqueTotal >= 300,
          });

          const curLikes = Number(rp.real_likes || 0) + Number(rp.sim_likes || 0);
          const addLikes = Math.max(0, Math.min(maxProfilePool, targetPostLikes - curLikes));
          for (let l = 0; l < addLikes; l++) {
            const uIdx = ((postId * 109 + l * 7 + 500) % maxProfilePool) + 1;
            newReactions.push({
              userUid: `ai_demo_${String(uIdx).padStart(5, '0')}`,
              targetType: 'discussion',
              targetId: postId,
              reactionType: 'like',
              isSimulated: true,
            });
          }

          const curReps = Number(rp.sim_reps || 0);
          const addReps = Math.max(0, Math.min(maxProfilePool, targetPostReposts - curReps));
          for (let r = 0; r < addReps; r++) {
            const uIdx = ((postId * 173 + r * 13 + 1200) % maxProfilePool) + 1;
            newReposts.push({
              userUid: `ai_demo_${String(uIdx).padStart(5, '0')}`,
              postId,
              isSimulated: true,
            });
          }
        }

        for (let s = 0; s < newReactions.length; s += 1000) {
          await db.insert(reactions).values(newReactions.slice(s, s + 1000)).onConflictDoNothing();
        }
        for (let s = 0; s < newReposts.length; s += 1000) {
          await db.insert(pulseReposts).values(newReposts.slice(s, s + 1000)).onConflictDoNothing();
        }

        await db
          .update(aiDemoProfiles)
          .set({ seedBatch: 'realistic_v2', lastSimulatedAt: new Date() });

        await recalculateEngagementCounters();
        console.log('[Community Realism] Upgrade to realistic_v2 completed.');
      } else {
        // Ensure any newly published Admin/Owner post also gets contextual comments if empty
        let changed = false;
        for (let aIdx = 0; aIdx < adminPosts.length; aIdx++) {
          const ap = adminPosts[aIdx];
          if (Number(ap.sim_comms || 0) === 0) {
            await populateContextualCommentsForPost({
              post: {
                id: Number(ap.id),
                title: String(ap.title || ''),
                content: String(ap.content || ''),
                animeTitle: ap.anime_title || null,
                genreTags: Array.isArray(ap.genre_tags) ? ap.genre_tags : [],
                pollQuestion: ap.poll_question || null,
                createdAt: ap.created_at ? new Date(ap.created_at) : new Date(),
              },
              countToInsert: 1840 + (Number(ap.id) % 350),
              maxProfilePool,
              isHighTraffic: true,
            });
            changed = true;
          }
        }
        if (changed) {
          await recalculateEngagementCounters();
        } else {
          // Always ensure counters reflect any newly topped-up 10k admin likes
          await recalculateEngagementCounters();
        }
      }
    } catch (err: any) {
      console.error('[Community Realism] Upgrade warning:', err?.message || err);
    } finally {
      realismUpgradePromise = null;
    }
  })();

  return realismUpgradePromise;
}

export async function ensureAiCommunitySeededOnStartup() {
  const cfg = await getAiCommunityConfig();
  const [demoCountRes] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(users)
    .where(eq(users.isAiDemo, true));

  const count = demoCountRes?.count || 0;
  if (!cfg.autoSeededInitial || count < Math.min(5000, cfg.targetDemoProfiles)) {
    console.log(
      `[Community] Triggering initial 10K community bootstrap (current: ${count})...`
    );
    await triggerAiCommunitySeedingJob({ jobType: 'initial_bootstrap' });
  } else {
    await upgradeCommunityRealismAndEngagement();
  }
}

export async function updateAiCommunityConfigAndSync(
  patch: Partial<{
    aiActivityEnabled: boolean;
    ownerDemoAudienceEnabled: boolean;
    showcasePostId: number | null;
    targetDemoProfiles: number;
    targetCommunityMembers: number;
    targetOwnerFollowers: number;
    targetShowcaseLikes: number;
    targetShowcaseReposts: number;
    targetShowcaseComments: number;
    targetShowcaseShares: number;
  }>
) {
  await getAiCommunityConfig();
  const updates: Record<string, any> = { updatedAt: new Date() };

  if (typeof patch.aiActivityEnabled === 'boolean') {
    updates.aiActivityEnabled = patch.aiActivityEnabled;
  }
  if (typeof patch.ownerDemoAudienceEnabled === 'boolean') {
    updates.ownerDemoAudienceEnabled = patch.ownerDemoAudienceEnabled;
  }
  if (patch.showcasePostId !== undefined) {
    updates.showcasePostId = patch.showcasePostId ? Number(patch.showcasePostId) : null;
  }
  if (typeof patch.targetDemoProfiles === 'number') {
    updates.targetDemoProfiles = Math.max(100, Math.min(15000, Math.floor(patch.targetDemoProfiles)));
  }
  if (typeof patch.targetCommunityMembers === 'number') {
    updates.targetCommunityMembers = Math.max(
      0,
      Math.min(15000, Math.floor(patch.targetCommunityMembers))
    );
  }
  if (typeof patch.targetOwnerFollowers === 'number') {
    updates.targetOwnerFollowers = Math.max(
      0,
      Math.min(15000, Math.floor(patch.targetOwnerFollowers))
    );
  }
  if (typeof patch.targetShowcaseLikes === 'number') {
    updates.targetShowcaseLikes = Math.max(
      0,
      Math.min(15000, Math.floor(patch.targetShowcaseLikes))
    );
  }
  if (typeof patch.targetShowcaseReposts === 'number') {
    updates.targetShowcaseReposts = Math.max(
      0,
      Math.min(15000, Math.floor(patch.targetShowcaseReposts))
    );
  }
  if (typeof patch.targetShowcaseComments === 'number') {
    updates.targetShowcaseComments = Math.max(
      0,
      Math.min(10000, Math.floor(patch.targetShowcaseComments))
    );
  }
  if (typeof patch.targetShowcaseShares === 'number') {
    updates.targetShowcaseShares = Math.max(
      0,
      Math.min(15000, Math.floor(patch.targetShowcaseShares))
    );
  }

  await db.update(aiCommunityConfig).set(updates).where(eq(aiCommunityConfig.id, 1));
  invalidateAiCommunityConfigCache();
  await recalculateEngagementCounters();
  return await getAiCommunityAdminOverview();
}

export async function getAiCommunityAdminOverview() {
  const cfg = await getAiCommunityConfig();
  const ownerUid = await resolveOwnerAccountUid();

  const [
    userCounts,
    commCounts,
    postCounts,
    commReplyCounts,
    ownerFollowerCounts,
    ownerPosts,
    recentJobs,
    samplePersonas,
  ] = await Promise.all([
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE is_ai_demo = false)::int AS human_users,
        COUNT(*) FILTER (WHERE is_ai_demo = true)::int AS demo_users
      FROM users
    `),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE is_ai_demo = false)::int AS standard_communities,
        COUNT(*) FILTER (WHERE is_ai_demo = true)::int AS demo_communities,
        (SELECT COUNT(DISTINCT user_uid)::int FROM community_memberships WHERE is_simulated = true) AS demo_community_members
      FROM communities
    `),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE is_ai_generated = false AND is_archived = false)::int AS human_posts,
        COUNT(*) FILTER (WHERE is_ai_generated = true AND is_archived = false)::int AS demo_posts
      FROM discussions
    `),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE is_ai_generated = false AND is_deleted = false)::int AS human_comments,
        COUNT(*) FILTER (WHERE is_ai_generated = true AND is_deleted = false)::int AS demo_comments
      FROM comments
    `),
    db.execute(sql`
      SELECT
        COUNT(*) FILTER (WHERE is_simulated = false)::int AS real_followers,
        COUNT(*) FILTER (WHERE is_simulated = true)::int AS demo_followers
      FROM user_follows
      WHERE following_uid = ${ownerUid}
    `),
    db
      .select({
        id: discussions.id,
        title: discussions.title,
        kind: discussions.kind,
        likeCount: discussions.likeCount,
        demoLikeCount: discussions.demoLikeCount,
        commentCount: discussions.commentCount,
        demoCommentCount: discussions.demoCommentCount,
        repostCount: discussions.repostCount,
        demoRepostCount: discussions.demoRepostCount,
        shareCount: discussions.shareCount,
        demoShareCount: discussions.demoShareCount,
        createdAt: discussions.createdAt,
      })
      .from(discussions)
      .where(and(eq(discussions.authorUid, ownerUid), eq(discussions.isArchived, false)))
      .orderBy(desc(discussions.isPinned), desc(discussions.createdAt))
      .limit(25),
    db.select().from(aiSeedingJobs).orderBy(desc(aiSeedingJobs.startedAt)).limit(6),
    db
      .select({
        uid: users.uid,
        kageId: users.kageId,
        username: users.username,
        displayName: profiles.displayName,
        avatarUrl: profiles.avatarUrl,
        personaArchetype: aiDemoProfiles.personaArchetype,
        favoriteAnime: aiDemoProfiles.favoriteAnime,
        favoriteCharacter: aiDemoProfiles.favoriteCharacter,
        isCommunityMember: aiDemoProfiles.isCommunityMember,
      })
      .from(aiDemoProfiles)
      .innerJoin(users, eq(aiDemoProfiles.userUid, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .orderBy(asc(users.uid))
      .limit(12),
  ]);

  const uRow: any = (userCounts as any).rows?.[0] || {};
  const cRow: any = (commCounts as any).rows?.[0] || {};
  const pRow: any = (postCounts as any).rows?.[0] || {};
  const cmRow: any = (commReplyCounts as any).rows?.[0] || {};
  const fRow: any = (ownerFollowerCounts as any).rows?.[0] || {};

  return {
    config: cfg,
    isRunning: Boolean(activeSeedingPromise),
    activeJobId: activeSeedingJobId,
    metrics: {
      humanUsers: Number(uRow.human_users || 0),
      demoUsers: Number(uRow.demo_users || 0),
      standardCommunities: Number(cRow.standard_communities || 0),
      demoCommunities: Number(cRow.demo_communities || 0),
      demoCommunityMembers: Number(cRow.demo_community_members || 0),
      humanPosts: Number(pRow.human_posts || 0),
      demoPosts: Number(pRow.demo_posts || 0),
      humanComments: Number(cmRow.human_comments || 0),
      demoComments: Number(cmRow.demo_comments || 0),
      ownerRealFollowers: Number(fRow.real_followers || 0),
      ownerDemoFollowers: Number(fRow.demo_followers || 0),
    },
    ownerPosts,
    recentJobs,
    samplePersonas,
    geminiConfigured: Boolean(process.env.GEMINI_API_KEY),
  };
}

export async function listProfileConnectionsPaginated(params: {
  identifier: string;
  type: 'followers' | 'following';
  q?: string;
  limit?: number;
  offset?: number;
  viewerUid?: string;
}) {
  const rawTrimmed = params.identifier.trim();
  const cleanHandle = rawTrimmed.replace(/^@+/, '').toLowerCase();
  const kageMatch = /^kage[-_]?d?0*(\d+)$/i.exec(rawTrimmed);
  const isDemoCode = /^kage[-_]?d/i.test(rawTrimmed);
  const paddedCode = kageMatch
    ? isDemoCode
      ? `KAGE-D${kageMatch[1].padStart(7, '0')}`
      : `KAGE-${kageMatch[1].padStart(8, '0')}`
    : null;

  const lookupConds: any[] = [
    sql`lower(${users.username}) = ${cleanHandle}`,
    eq(users.uid, rawTrimmed),
    sql`upper(${users.kageId}) = ${rawTrimmed.toUpperCase()}`,
  ];
  if (paddedCode) lookupConds.push(eq(users.kageId, paddedCode));

  const [targetUser] = await db
    .select({ uid: users.uid, role: users.role })
    .from(users)
    .where(or(...lookupConds))
    .limit(1);

  if (!targetUser) {
    return { items: [], total: 0, demoCount: 0, humanCount: 0, hasMore: false };
  }

  const cfg = await getAiCommunityConfig();
  const isOwnerTarget = targetUser.role === 'owner';
  const allowSimulated =
    cfg.aiActivityEnabled && (!isOwnerTarget || cfg.ownerDemoAudienceEnabled);

  const limit = Math.max(1, Math.min(60, params.limit || 30));
  const offset = Math.max(0, params.offset || 0);

  const joinCol =
    params.type === 'followers' ? userFollows.followerUid : userFollows.followingUid;
  const filterCol =
    params.type === 'followers' ? userFollows.followingUid : userFollows.followerUid;

  const conds: any[] = [eq(filterCol, targetUser.uid)];
  if (!allowSimulated) {
    conds.push(eq(userFollows.isSimulated, false));
  }
  if (params.q?.trim()) {
    const pat = `%${params.q.trim().replace(/^@+/, '')}%`;
    conds.push(or(ilike(users.username, pat), ilike(profiles.displayName, pat)));
  }

  const whereExpr = and(...conds);

  const [countsRes, rows] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        demoCount: sql<number>`count(*) FILTER (WHERE ${users.isAiDemo} = true)::int`,
        humanCount: sql<number>`count(*) FILTER (WHERE ${users.isAiDemo} = false)::int`,
      })
      .from(userFollows)
      .innerJoin(users, eq(joinCol, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(whereExpr),
    db
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
        favouriteCharacter: profiles.favouriteCharacter,
        favouriteCharacterAnime: profiles.favouriteCharacterAnime,
        followedAt: userFollows.createdAt,
      })
      .from(userFollows)
      .innerJoin(users, eq(joinCol, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(whereExpr)
      .orderBy(asc(users.isAiDemo), desc(userFollows.createdAt))
      .limit(limit)
      .offset(offset),
  ]);

  let viewerFollowingSet = new Set<string>();
  if (params.viewerUid && rows.length > 0) {
    const uids = rows.map((r) => r.uid);
    const vf = await db
      .select({ followingUid: userFollows.followingUid })
      .from(userFollows)
      .where(
        and(eq(userFollows.followerUid, params.viewerUid), inArray(userFollows.followingUid, uids))
      );
    viewerFollowingSet = new Set(vf.map((f) => f.followingUid));
  }

  const total = countsRes[0]?.total || 0;
  return {
    items: rows.map((r) => ({
      ...r,
      viewerFollowing: viewerFollowingSet.has(r.uid),
    })),
    total,
    demoCount: countsRes[0]?.demoCount || 0,
    humanCount: countsRes[0]?.humanCount || 0,
    limit,
    offset,
    hasMore: offset + rows.length < total,
  };
}
