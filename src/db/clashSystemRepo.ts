import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  characterCatalog,
  clashEntries,
  clashRewardVotes,
  clashRewards,
  clashes,
  clashVotes,
  communities,
  communityMemberships,
  communityRewards,
  mediaAssets,
  profiles,
  userRewards,
  users,
} from './schema.ts';
import { HttpError, hasBlockBetween } from './profileSystemRepo.ts';
import { createNotification } from './repository.ts';
import {
  CURATED_ANIME_CHARACTERS,
  isApprovedCatalogueImageUrl,
} from '../server/characterCatalogue.ts';
import { uploadValidatedMediaAsset } from '../server/mediaAccess.ts';

export type ClashMode = 'user_duel' | 'community_duel' | 'solo_character';
export type ClashStatus =
  | 'pending_acceptance'
  | 'declined'
  | 'scheduled'
  | 'awaiting_entries'
  | 'live'
  | 'voting_closed'
  | 'completed'
  | 'cancelled'
  | 'expired';
export type ClashTieRule = 'draw' | 'challenger_advantage' | 'sudden_death_first_vote';

const REP_ROLES = new Set(['owner', 'admin', 'moderator']);

export async function ensureStarterRewardsForAccount(userUid: string) {
  const existing = await db
    .select({ id: userRewards.id })
    .from(userRewards)
    .where(eq(userRewards.userUid, userUid))
    .limit(1);
  if (existing.length > 0) return;

  await db
    .insert(userRewards)
    .values([
      {
        userUid,
        rewardKey: 'starter_shadow_vanguard_crest',
        rewardType: 'badge',
        label: 'Shadow Vanguard Crest',
        description: 'Official KAGE Hunter emblem earned upon awakening.',
        sourceType: 'starter',
        rarity: 'rare',
        accentColor: '#C0263D',
      },
      {
        userUid,
        rewardKey: 'starter_crimson_challenger_title',
        rewardType: 'title',
        label: 'Crimson Arena Challenger',
        description: 'Stakable title proving readiness for Duel Clashes.',
        sourceType: 'starter',
        rarity: 'epic',
        accentColor: '#6D28D9',
      },
    ])
    .onConflictDoNothing();
}

export async function ensureStarterRewardsForGuild(communityId: number) {
  const existing = await db
    .select({ id: communityRewards.id })
    .from(communityRewards)
    .where(eq(communityRewards.communityId, communityId))
    .limit(1);
  if (existing.length > 0) return;

  await db
    .insert(communityRewards)
    .values([
      {
        communityId,
        levelGranted: 1,
        rewardKey: `guild_sovereign_banner_${communityId}`,
        rewardType: 'challenge_crest',
        title: 'Guild Battle Standard',
        description: 'Official Guild War crest eligible for Community Duel Clash escrow.',
      },
      {
        communityId,
        levelGranted: 2,
        rewardKey: `guild_crimson_trophy_${communityId}`,
        rewardType: 'badge',
        title: 'Crimson Realm Honor Seal',
        description: 'Awarded to victorious fandom guilds in KAGE Clash Duels.',
      },
    ])
    .onConflictDoNothing();
}

export async function listEligibleDuelRewardsForActor(
  userUid: string,
  communityId?: number | null
) {
  await ensureStarterRewardsForAccount(userUid);
  if (communityId) {
    await ensureStarterRewardsForGuild(communityId);
  }

  const myUserRewards = await db
    .select()
    .from(userRewards)
    .where(and(eq(userRewards.userUid, userUid), isNull(userRewards.escrowedInClashId)))
    .orderBy(desc(userRewards.unlockedAt));

  let guildRewards: (typeof communityRewards.$inferSelect)[] = [];
  if (communityId) {
    const [mem] = await db
      .select({ role: communityMemberships.role })
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, communityId),
          eq(communityMemberships.userUid, userUid)
        )
      )
      .limit(1);
    if (mem && REP_ROLES.has(mem.role)) {
      guildRewards = await db
        .select()
        .from(communityRewards)
        .where(
          and(
            eq(communityRewards.communityId, communityId),
            isNull(communityRewards.escrowedInClashId)
          )
        )
        .orderBy(asc(communityRewards.levelGranted));
    }
  }

  return {
    userRewards: myUserRewards,
    communityRewards: guildRewards,
  };
}

async function isGuildRepresentative(communityId: number, userUid: string): Promise<boolean> {
  const [mem] = await db
    .select({ role: communityMemberships.role })
    .from(communityMemberships)
    .where(
      and(
        eq(communityMemberships.communityId, communityId),
        eq(communityMemberships.userUid, userUid)
      )
    )
    .limit(1);
  if (mem && REP_ROLES.has(mem.role)) return true;

  const [u] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.uid, userUid))
    .limit(1);
  return u?.role === 'owner' || u?.role === 'admin';
}

async function getGuildRepUids(communityId: number): Promise<string[]> {
  const rows = await db
    .select({ userUid: communityMemberships.userUid, role: communityMemberships.role })
    .from(communityMemberships)
    .where(eq(communityMemberships.communityId, communityId));
  return rows.filter((r) => REP_ROLES.has(r.role)).map((r) => r.userUid);
}

async function releaseEscrowedClashRewards(clashId: number) {
  await db
    .update(userRewards)
    .set({ escrowedInClashId: null })
    .where(eq(userRewards.escrowedInClashId, clashId));
  await db
    .update(communityRewards)
    .set({ escrowedInClashId: null })
    .where(eq(communityRewards.escrowedInClashId, clashId));
  await db
    .update(clashRewards)
    .set({ status: 'released', resolvedAt: new Date() })
    .where(and(eq(clashRewards.clashId, clashId), eq(clashRewards.status, 'escrowed')));
}

async function escrowSelectedRewardsForClash(params: {
  clashId: number;
  actorUid: string;
  communityId: number;
  selectedRewards: { sourceKind: 'user_reward' | 'community_reward'; sourceRewardId: number }[];
}) {
  if (!params.selectedRewards.length) return;
  let stakedAny = false;

  for (const item of params.selectedRewards.slice(0, 4)) {
    if (item.sourceKind === 'user_reward') {
      const [r] = await db
        .select()
        .from(userRewards)
        .where(
          and(
            eq(userRewards.id, Number(item.sourceRewardId)),
            eq(userRewards.userUid, params.actorUid),
            isNull(userRewards.escrowedInClashId)
          )
        )
        .limit(1);
      if (!r) {
        throw new HttpError(
          400,
          'Selected user reward is invalid, unowned, or already escrowed in another Clash.'
        );
      }
      await db
        .update(userRewards)
        .set({ escrowedInClashId: params.clashId })
        .where(eq(userRewards.id, r.id));

      await db
        .insert(clashRewards)
        .values({
          clashId: params.clashId,
          sourceKind: 'user_reward',
          sourceRewardId: r.id,
          stakedByUid: params.actorUid,
          stakedByCommunityId: params.communityId,
          rewardKey: r.rewardKey,
          rewardType: r.rewardType,
          label: r.label,
          description: r.description,
          rarity: r.rarity,
          accentColor: r.accentColor,
          status: 'escrowed',
        })
        .onConflictDoNothing();
      stakedAny = true;
    } else if (item.sourceKind === 'community_reward') {
      const canRep = await isGuildRepresentative(params.communityId, params.actorUid);
      if (!canRep) {
        throw new HttpError(403, 'Only guild leaders or moderators can stake guild rewards.');
      }
      const [cr] = await db
        .select()
        .from(communityRewards)
        .where(
          and(
            eq(communityRewards.id, Number(item.sourceRewardId)),
            eq(communityRewards.communityId, params.communityId),
            isNull(communityRewards.escrowedInClashId)
          )
        )
        .limit(1);
      if (!cr) {
        throw new HttpError(
          400,
          'Selected guild reward is invalid, unowned, or already escrowed in another Clash.'
        );
      }
      await db
        .update(communityRewards)
        .set({ escrowedInClashId: params.clashId })
        .where(eq(communityRewards.id, cr.id));

      await db
        .insert(clashRewards)
        .values({
          clashId: params.clashId,
          sourceKind: 'community_reward',
          sourceRewardId: cr.id,
          stakedByUid: params.actorUid,
          stakedByCommunityId: params.communityId,
          rewardKey: cr.rewardKey,
          rewardType: cr.rewardType,
          label: cr.title,
          description: cr.description,
          rarity: 'epic',
          accentColor: '#C0263D',
          status: 'escrowed',
        })
        .onConflictDoNothing();
      stakedAny = true;
    }
  }

  if (stakedAny) {
    await db
      .update(clashes)
      .set({ hasRewards: true, updatedAt: new Date() })
      .where(eq(clashes.id, params.clashId));
  }
}

export async function finalizeClashById(clashId: number) {
  const [clash] = await db.select().from(clashes).where(eq(clashes.id, clashId)).limit(1);
  if (!clash) return null;
  if (clash.status === 'completed') return clash;

  const [leftCountRes, rightCountRes] = await Promise.all([
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(clashVotes)
      .where(and(eq(clashVotes.clashId, clashId), eq(clashVotes.side, 'left'))),
    db
      .select({ count: sql<number>`count(*)::int` })
      .from(clashVotes)
      .where(and(eq(clashVotes.clashId, clashId), eq(clashVotes.side, 'right'))),
  ]);

  const leftVotes = leftCountRes[0]?.count || 0;
  const rightVotes = rightCountRes[0]?.count || 0;

  let winnerSide: 'left' | 'right' | 'tie' = 'tie';
  if (leftVotes > rightVotes) {
    winnerSide = 'left';
  } else if (rightVotes > leftVotes) {
    winnerSide = 'right';
  } else {
    if (clash.tieRule === 'challenger_advantage') {
      winnerSide = 'left';
    } else if (clash.tieRule === 'sudden_death_first_vote' && leftVotes + rightVotes > 0) {
      const [firstVote] = await db
        .select({ side: clashVotes.side })
        .from(clashVotes)
        .where(eq(clashVotes.clashId, clashId))
        .orderBy(asc(clashVotes.createdAt), asc(clashVotes.id))
        .limit(1);
      winnerSide = firstVote?.side === 'right' ? 'right' : 'left';
    } else {
      winnerSide = 'tie';
    }
  }

  const now = new Date();
  const [updated] = await db
    .update(clashes)
    .set({
      status: 'completed',
      leftVotes,
      rightVotes,
      winnerSide,
      completedAt: now,
      updatedAt: now,
    })
    .where(and(eq(clashes.id, clashId), sql`${clashes.status} <> 'completed'`))
    .returning();

  const targetClash = updated || clash;

  // Idempotent reward resolution (only runs once when rewardsDistributedAt IS NULL)
  if (targetClash.hasRewards && !targetClash.rewardsDistributedAt) {
    const [locked] = await db
      .update(clashes)
      .set({ rewardsDistributedAt: now })
      .where(and(eq(clashes.id, clashId), isNull(clashes.rewardsDistributedAt)))
      .returning({ id: clashes.id });

    if (locked) {
      if (winnerSide === 'tie') {
        await releaseEscrowedClashRewards(clashId);
      } else {
        const winningCommunityId =
          winnerSide === 'left'
            ? targetClash.challengerCommunityId
            : targetClash.opponentCommunityId;
        let winningLeaderUid =
          winnerSide === 'left' ? targetClash.challengerUid : targetClash.acceptedByUid || targetClash.opponentUid;

        if (!winningLeaderUid && winningCommunityId) {
          const [comm] = await db
            .select({ ownerUid: communities.ownerUid })
            .from(communities)
            .where(eq(communities.id, winningCommunityId))
            .limit(1);
          winningLeaderUid = comm?.ownerUid || null;
        }

        const stakedRows = await db
          .select()
          .from(clashRewards)
          .where(and(eq(clashRewards.clashId, clashId), eq(clashRewards.status, 'escrowed')));

        for (const sr of stakedRows) {
          // Clear escrow lock
          if (sr.sourceKind === 'user_reward') {
            await db
              .update(userRewards)
              .set({ escrowedInClashId: null })
              .where(eq(userRewards.id, sr.sourceRewardId));

            if (winningLeaderUid && winningLeaderUid !== sr.stakedByUid) {
              // Transfer ownership of staked user reward to winner
              await db.delete(userRewards).where(eq(userRewards.id, sr.sourceRewardId));
              await db
                .insert(userRewards)
                .values({
                  userUid: winningLeaderUid,
                  rewardKey: `${sr.rewardKey}_won_${clashId}_${sr.id}`,
                  rewardType: sr.rewardType,
                  label: sr.label,
                  description: `${sr.description} (Won in Clash #${clashId})`,
                  sourceType: 'clash_victory',
                  rarity: sr.rarity,
                  accentColor: sr.accentColor,
                })
                .onConflictDoNothing();
            }
          } else if (sr.sourceKind === 'community_reward') {
            await db
              .update(communityRewards)
              .set({ escrowedInClashId: null })
              .where(eq(communityRewards.id, sr.sourceRewardId));

            if (winningCommunityId && winningCommunityId !== sr.stakedByCommunityId) {
              await db.delete(communityRewards).where(eq(communityRewards.id, sr.sourceRewardId));
              const maxLvlRows = await db
                .select({ maxLvl: sql<number>`coalesce(max(${communityRewards.levelGranted}), 100)::int` })
                .from(communityRewards)
                .where(eq(communityRewards.communityId, winningCommunityId));
              const nextSlot = Math.max(101, (maxLvlRows[0]?.maxLvl || 100) + 1);
              await db
                .insert(communityRewards)
                .values({
                  communityId: winningCommunityId,
                  levelGranted: nextSlot,
                  rewardKey: `${sr.rewardKey}_won_${clashId}_${sr.id}`,
                  rewardType: sr.rewardType,
                  title: sr.label,
                  description: `${sr.description} (Captured in Guild Clash #${clashId})`,
                })
                .onConflictDoNothing();
            }
          }

          await db
            .update(clashRewards)
            .set({
              status: 'awarded',
              awardedToCommunityId: winningCommunityId ?? null,
              awardedToUid: winningLeaderUid ?? null,
              resolvedAt: now,
            })
            .where(eq(clashRewards.id, sr.id));
        }
      }
    }
  }

  // Notify participants of Clash completion
  const notifyUids = new Set<string>();
  if (targetClash.creatorUid) notifyUids.add(targetClash.creatorUid);
  if (targetClash.challengerUid) notifyUids.add(targetClash.challengerUid);
  if (targetClash.opponentUid) notifyUids.add(targetClash.opponentUid);
  if (targetClash.acceptedByUid) notifyUids.add(targetClash.acceptedByUid);

  const winnerName =
    winnerSide === 'left'
      ? targetClash.leftName
      : winnerSide === 'right'
        ? targetClash.rightName
        : 'Draw';

  for (const uid of notifyUids) {
    await createNotification({
      recipientUid: uid,
      type: 'challenge',
      title: `Clash Completed: ${targetClash.title}`,
      body:
        winnerSide === 'tie'
          ? `Final score ${leftVotes} – ${rightVotes} (Draw)`
          : `${winnerName} won ${leftVotes} – ${rightVotes}!`,
      linkUrl: `/clash/${clashId}`,
    });
  }

  return await db.select().from(clashes).where(eq(clashes.id, clashId)).then((r) => r[0] || null);
}

let lastSweepTime = 0;

export async function sweepClashLifecycles(force = false) {
  const nowMs = Date.now();
  if (!force && nowMs - lastSweepTime < 5000) return;
  lastSweepTime = nowMs;

  const now = new Date(nowMs);

  // 1. Expire pending invites past inviteExpiresAt
  const expiredInvites = await db
    .select({ id: clashes.id })
    .from(clashes)
    .where(and(eq(clashes.status, 'pending_acceptance'), lte(clashes.inviteExpiresAt, now)));

  for (const row of expiredInvites) {
    await db
      .update(clashes)
      .set({ status: 'expired', updatedAt: now })
      .where(and(eq(clashes.id, row.id), eq(clashes.status, 'pending_acceptance')));
    await releaseEscrowedClashRewards(row.id);
  }

  // 2. Activate scheduled clashes whose startsAt has arrived
  await db
    .update(clashes)
    .set({ status: 'live', updatedAt: now })
    .where(and(eq(clashes.status, 'scheduled'), lte(clashes.startsAt, now)));

  // 3. Check awaiting_entries clashes past entryDeadlineAt
  const overdueEntries = await db
    .select()
    .from(clashes)
    .where(and(eq(clashes.status, 'awaiting_entries'), lte(clashes.entryDeadlineAt, now)));

  for (const c of overdueEntries) {
    const entries = await db
      .select({ side: clashEntries.side })
      .from(clashEntries)
      .where(eq(clashEntries.clashId, c.id));
    const sides = new Set(entries.map((e) => e.side));
    if (sides.has('left') && sides.has('right')) {
      const endsAt = c.endsAt && c.endsAt > now ? c.endsAt : new Date(nowMs + 48 * 3600 * 1000);
      await db
        .update(clashes)
        .set({ status: 'live', startsAt: now, endsAt, updatedAt: now })
        .where(eq(clashes.id, c.id));
    } else {
      await db
        .update(clashes)
        .set({ status: 'expired', updatedAt: now })
        .where(eq(clashes.id, c.id));
      await releaseEscrowedClashRewards(c.id);
    }
  }

  // 4. Complete live clashes whose endsAt has passed
  const dueClashes = await db
    .select({ id: clashes.id })
    .from(clashes)
    .where(and(eq(clashes.status, 'live'), lte(clashes.endsAt, now)));

  for (const row of dueClashes) {
    await finalizeClashById(row.id);
  }
}

async function resolveCatalogueCharacter(input: {
  malId?: number | null;
  characterId?: number | null;
  name?: string;
  animeTitle?: string;
  imageUrl?: string;
}) {
  if (input.characterId) {
    const [catRow] = await db
      .select()
      .from(characterCatalog)
      .where(eq(characterCatalog.id, Number(input.characterId)))
      .limit(1);
    if (catRow) {
      return {
        characterId: catRow.id,
        malId: catRow.characterMalId ?? catRow.animeMalId ?? null,
        name: catRow.canonicalName,
        animeTitle: catRow.animeTitle,
        imageUrl: catRow.avatarUrl,
      };
    }
  }

  if (input.malId) {
    const curated = CURATED_ANIME_CHARACTERS.find((c) => c.malId === Number(input.malId));
    if (curated) {
      return {
        characterId: null,
        malId: curated.malId,
        name: curated.name,
        animeTitle: curated.animeTitle,
        imageUrl: curated.imageUrl,
      };
    }
    const [catByMal] = await db
      .select()
      .from(characterCatalog)
      .where(eq(characterCatalog.characterMalId, Number(input.malId)))
      .limit(1);
    if (catByMal) {
      return {
        characterId: catByMal.id,
        malId: catByMal.characterMalId,
        name: catByMal.canonicalName,
        animeTitle: catByMal.animeTitle,
        imageUrl: catByMal.avatarUrl,
      };
    }
  }

  const rawName = String(input.name || '').trim();
  if (!rawName) {
    throw new HttpError(400, 'Select two anime characters from the KAGE character catalogue.');
  }

  const curatedByName = CURATED_ANIME_CHARACTERS.find(
    (c) => c.name.toLowerCase() === rawName.toLowerCase()
  );
  if (curatedByName) {
    return {
      characterId: null,
      malId: curatedByName.malId,
      name: curatedByName.name,
      animeTitle: curatedByName.animeTitle,
      imageUrl: curatedByName.imageUrl,
    };
  }

  const [catByName] = await db
    .select()
    .from(characterCatalog)
    .where(eq(characterCatalog.normalizedName, rawName.toLowerCase()))
    .limit(1);
  if (catByName) {
    return {
      characterId: catByName.id,
      malId: catByName.characterMalId,
      name: catByName.canonicalName,
      animeTitle: catByName.animeTitle,
      imageUrl: catByName.avatarUrl,
    };
  }

  const img = String(input.imageUrl || '').trim();
  if (img && isApprovedCatalogueImageUrl(img)) {
    return {
      characterId: null,
      malId: input.malId ? Number(input.malId) : null,
      name: rawName.slice(0, 60),
      animeTitle: String(input.animeTitle || 'Anime Character').trim().slice(0, 80),
      imageUrl: img,
    };
  }

  throw new HttpError(
    400,
    `Character "${rawName}" must be chosen from the verified KAGE anime character catalogue.`
  );
}

export async function createFullClash(
  creatorUid: string,
  payload: {
    clashMode?: ClashMode;
    title?: string;
    description?: string;
    rules?: string;
    category?: string;
    tieRule?: ClashTieRule;
    allowVoteChange?: boolean;
    durationHours?: number;
    startsAt?: string | null;
    endsAt?: string | null;
    genreTags?: string[];
    // User Duel fields
    opponentUid?: string;
    // Community Duel fields
    challengerCommunityId?: number;
    opponentCommunityId?: number;
    stakedRewards?: { sourceKind: 'user_reward' | 'community_reward'; sourceRewardId: number }[];
    // Optional immediate challenger media entry
    initialEntry?: {
      title?: string;
      caption?: string;
      mediaType: 'image' | 'video';
      dataUrl: string;
      posterDataUrl?: string;
      durationSec?: number;
    };
    // Solo Character fields
    leftCharacter?: {
      malId?: number | null;
      characterId?: number | null;
      name?: string;
      animeTitle?: string;
      imageUrl?: string;
    };
    rightCharacter?: {
      malId?: number | null;
      characterId?: number | null;
      name?: string;
      animeTitle?: string;
      imageUrl?: string;
    };
    // Legacy compatibility fields
    leftName?: string;
    leftImageUrl?: string;
    rightName?: string;
    rightImageUrl?: string;
  }
) {
  const mode: ClashMode =
    payload.clashMode === 'user_duel' || payload.clashMode === 'community_duel'
      ? payload.clashMode
      : 'solo_character';

  const tieRule: ClashTieRule =
    payload.tieRule === 'challenger_advantage' || payload.tieRule === 'sudden_death_first_vote'
      ? payload.tieRule
      : 'draw';

  const cleanDesc = String(payload.description || '').trim().slice(0, 1200);
  const cleanRules =
    String(payload.rules || '').trim().slice(0, 600) ||
    'One vote per authenticated hunter during the active voting window.';
  const durationHours = Math.max(1, Math.min(168, Number(payload.durationHours || 48)));
  const now = new Date();
  const genreTags = Array.isArray(payload.genreTags) ? payload.genreTags.slice(0, 6) : ['Action'];

  if (mode === 'solo_character') {
    if (
      payload.opponentUid ||
      payload.opponentCommunityId ||
      (Array.isArray(payload.stakedRewards) && payload.stakedRewards.length > 0)
    ) {
      throw new HttpError(
        400,
        'Solo Character Clashes do not allow opponent invitations or duel reward staking.'
      );
    }

    const leftChar = await resolveCatalogueCharacter(
      payload.leftCharacter || {
        name: payload.leftName,
        imageUrl: payload.leftImageUrl,
      }
    );
    const rightChar = await resolveCatalogueCharacter(
      payload.rightCharacter || {
        name: payload.rightName,
        imageUrl: payload.rightImageUrl,
      }
    );

    if (
      leftChar.name.trim().toLowerCase() === rightChar.name.trim().toLowerCase() ||
      (leftChar.malId && rightChar.malId && leftChar.malId === rightChar.malId)
    ) {
      throw new HttpError(400, 'Select two different anime characters for a Solo Character Clash.');
    }

    const parsedStart = payload.startsAt ? new Date(payload.startsAt) : now;
    const isScheduled = parsedStart.getTime() > now.getTime() + 60_000;
    const startsAt = isScheduled ? parsedStart : now;
    const endsAt = payload.endsAt
      ? new Date(payload.endsAt)
      : new Date(startsAt.getTime() + durationHours * 3600 * 1000);

    if (endsAt <= startsAt) {
      throw new HttpError(400, 'Voting end time must be after the start time.');
    }

    const title =
      String(payload.title || '').trim().slice(0, 120) ||
      `${leftChar.name} vs ${rightChar.name}`;

    const [created] = await db
      .insert(clashes)
      .values({
        title,
        description: cleanDesc,
        rules: cleanRules,
        category: String(payload.category || 'Character Power Matchup').trim().slice(0, 60),
        clashMode: 'solo_character',
        status: isScheduled ? 'scheduled' : 'live',
        tieRule,
        leftName: leftChar.name.toUpperCase(),
        leftSubtitle: leftChar.animeTitle || 'Character A',
        leftImageUrl: leftChar.imageUrl,
        leftCharacterId: leftChar.characterId,
        leftAnimeMalId: leftChar.malId,
        rightName: rightChar.name.toUpperCase(),
        rightSubtitle: rightChar.animeTitle || 'Character B',
        rightImageUrl: rightChar.imageUrl,
        rightCharacterId: rightChar.characterId,
        rightAnimeMalId: rightChar.malId,
        creatorUid,
        allowVoteChange: Boolean(payload.allowVoteChange),
        hasRewards: false,
        genreTags,
        startsAt,
        endsAt,
      })
      .returning();

    return await getClashDetailById(created.id, creatorUid);
  }

  if (mode === 'user_duel') {
    if (Array.isArray(payload.stakedRewards) && payload.stakedRewards.length > 0) {
      throw new HttpError(
        400,
        'Staked community rewards are reserved for Community Duel Clashes.'
      );
    }

    const opponentUid = String(payload.opponentUid || '').trim();
    if (!opponentUid || opponentUid === creatorUid) {
      throw new HttpError(400, 'Select a valid KAGE hunter to challenge.');
    }

    const block = await hasBlockBetween(creatorUid, opponentUid);
    if (block.anyBlock) {
      throw new HttpError(403, 'Cannot challenge this user due to block settings.');
    }

    const [challengerRow, opponentRow] = await Promise.all([
      db
        .select({
          uid: users.uid,
          username: users.username,
          displayName: profiles.displayName,
          avatarUrl: profiles.avatarUrl,
        })
        .from(users)
        .innerJoin(profiles, eq(users.uid, profiles.userUid))
        .where(eq(users.uid, creatorUid))
        .limit(1),
      db
        .select({
          uid: users.uid,
          username: users.username,
          displayName: profiles.displayName,
          avatarUrl: profiles.avatarUrl,
        })
        .from(users)
        .innerJoin(profiles, eq(users.uid, profiles.userUid))
        .where(eq(users.uid, opponentUid))
        .limit(1),
    ]);

    if (!challengerRow[0] || !opponentRow[0]) {
      throw new HttpError(404, 'Challenged hunter account was not found.');
    }

    const inviteExpiresAt = new Date(now.getTime() + 48 * 3600 * 1000);
    const endsAt = payload.endsAt
      ? new Date(payload.endsAt)
      : new Date(now.getTime() + (durationHours + 24) * 3600 * 1000);

    const title =
      String(payload.title || '').trim().slice(0, 120) ||
      `@${challengerRow[0].username} vs @${opponentRow[0].username} — Anime Edit Duel`;

    const [created] = await db
      .insert(clashes)
      .values({
        title,
        description: cleanDesc,
        rules: cleanRules,
        category: String(payload.category || '1v1 Anime Edit Duel').trim().slice(0, 60),
        clashMode: 'user_duel',
        status: 'pending_acceptance',
        tieRule,
        leftName: challengerRow[0].displayName.toUpperCase(),
        leftSubtitle: `@${challengerRow[0].username} · Challenger`,
        leftImageUrl: challengerRow[0].avatarUrl || '/assets/zenitsu-avatar.png',
        rightName: opponentRow[0].displayName.toUpperCase(),
        rightSubtitle: `@${opponentRow[0].username} · Invited`,
        rightImageUrl: opponentRow[0].avatarUrl || '/assets/zenitsu-avatar.png',
        challengerUid: creatorUid,
        opponentUid,
        creatorUid,
        allowVoteChange: Boolean(payload.allowVoteChange),
        hasRewards: false,
        genreTags,
        inviteExpiresAt,
        endsAt,
      })
      .returning();

    if (payload.initialEntry?.dataUrl) {
      await submitClashMediaEntry(creatorUid, created.id, payload.initialEntry);
    }

    await createNotification({
      recipientUid: opponentUid,
      actorUid: creatorUid,
      type: 'challenge',
      title: `${challengerRow[0].displayName} challenged you to a Duel Clash!`,
      body: title,
      linkUrl: `/clash/${created.id}`,
    });

    return await getClashDetailById(created.id, creatorUid);
  }

  // mode === 'community_duel'
  const challengerCommunityId = Number(payload.challengerCommunityId);
  const opponentCommunityId = Number(payload.opponentCommunityId);
  if (
    !challengerCommunityId ||
    !opponentCommunityId ||
    challengerCommunityId === opponentCommunityId
  ) {
    throw new HttpError(400, 'Select two distinct guilds for a Community Duel Clash.');
  }

  const canRepChallenger = await isGuildRepresentative(challengerCommunityId, creatorUid);
  if (!canRepChallenger) {
    throw new HttpError(
      403,
      'Only an owner, admin, or moderator of the challenging guild can initiate a Community Duel.'
    );
  }

  const [challengerGuildRows, opponentGuildRows] = await Promise.all([
    db.select().from(communities).where(eq(communities.id, challengerCommunityId)).limit(1),
    db.select().from(communities).where(eq(communities.id, opponentCommunityId)).limit(1),
  ]);

  const challengerGuild = challengerGuildRows[0];
  const opponentGuild = opponentGuildRows[0];
  if (!challengerGuild || !opponentGuild || challengerGuild.isArchived || opponentGuild.isArchived) {
    throw new HttpError(404, 'One of the selected guilds was not found or is archived.');
  }

  const inviteExpiresAt = new Date(now.getTime() + 48 * 3600 * 1000);
  const endsAt = payload.endsAt
    ? new Date(payload.endsAt)
    : new Date(now.getTime() + (durationHours + 24) * 3600 * 1000);

  const title =
    String(payload.title || '').trim().slice(0, 120) ||
    `${challengerGuild.name} vs ${opponentGuild.name}`;

  const [created] = await db
    .insert(clashes)
    .values({
      title,
      description: cleanDesc,
      rules: cleanRules,
      category: String(payload.category || 'Guild vs Guild Duel').trim().slice(0, 60),
      clashMode: 'community_duel',
      status: 'pending_acceptance',
      tieRule,
      leftName: challengerGuild.name.toUpperCase(),
      leftSubtitle: 'Challenger Guild',
      leftImageUrl: challengerGuild.artworkUrl || '/assets/extracted/guild-shadow.jpg',
      rightName: opponentGuild.name.toUpperCase(),
      rightSubtitle: 'Invited Guild',
      rightImageUrl: opponentGuild.artworkUrl || '/assets/extracted/guild-infinity.jpg',
      challengerUid: creatorUid,
      challengerCommunityId,
      opponentCommunityId,
      creatorUid,
      allowVoteChange: Boolean(payload.allowVoteChange),
      hasRewards: false,
      genreTags,
      inviteExpiresAt,
      endsAt,
    })
    .returning();

  if (Array.isArray(payload.stakedRewards) && payload.stakedRewards.length > 0) {
    try {
      await escrowSelectedRewardsForClash({
        clashId: created.id,
        actorUid: creatorUid,
        communityId: challengerCommunityId,
        selectedRewards: payload.stakedRewards,
      });
    } catch (err) {
      await releaseEscrowedClashRewards(created.id);
      await db.delete(clashes).where(eq(clashes.id, created.id));
      throw err;
    }
  }

  if (payload.initialEntry?.dataUrl) {
    await submitClashMediaEntry(creatorUid, created.id, payload.initialEntry);
  }

  const opponentReps = await getGuildRepUids(opponentCommunityId);
  for (const repUid of opponentReps) {
    if (repUid !== creatorUid) {
      await createNotification({
        recipientUid: repUid,
        actorUid: creatorUid,
        type: 'challenge',
        title: `${challengerGuild.name} challenged ${opponentGuild.name} to a Guild Clash!`,
        body: title,
        linkUrl: `/clash/${created.id}`,
      });
    }
  }

  return await getClashDetailById(created.id, creatorUid);
}

export async function respondToClashInvitation(
  actorUid: string,
  clashId: number,
  payload: {
    action: 'accept' | 'decline';
    stakedRewards?: { sourceKind: 'user_reward' | 'community_reward'; sourceRewardId: number }[];
  }
) {
  await sweepClashLifecycles();
  const [clash] = await db.select().from(clashes).where(eq(clashes.id, clashId)).limit(1);
  if (!clash) throw new HttpError(404, 'Clash not found.');

  if (clash.clashMode === 'solo_character') {
    throw new HttpError(400, 'Solo Character Clashes do not have invitations.');
  }

  if (clash.status !== 'pending_acceptance') {
    throw new HttpError(400, `This Clash invitation is already ${clash.status.replace('_', ' ')}.`);
  }

  if (clash.inviteExpiresAt && clash.inviteExpiresAt <= new Date()) {
    await db.update(clashes).set({ status: 'expired' }).where(eq(clashes.id, clashId));
    await releaseEscrowedClashRewards(clashId);
    throw new HttpError(400, 'This Clash invitation has expired.');
  }

  if (clash.clashMode === 'user_duel') {
    if (clash.opponentUid !== actorUid) {
      throw new HttpError(403, 'Forbidden: Only the invited hunter can respond to this Duel Clash.');
    }
  } else if (clash.clashMode === 'community_duel') {
    if (!clash.opponentCommunityId) {
      throw new HttpError(400, 'Invalid opponent community.');
    }
    const canAccept = await isGuildRepresentative(clash.opponentCommunityId, actorUid);
    if (!canAccept) {
      throw new HttpError(
        403,
        'Forbidden: Only an owner, admin, or moderator of the invited guild can respond.'
      );
    }
  }

  const now = new Date();
  if (payload.action === 'decline') {
    await db
      .update(clashes)
      .set({
        status: 'declined',
        declinedAt: now,
        updatedAt: now,
      })
      .where(eq(clashes.id, clashId));
    await releaseEscrowedClashRewards(clashId);

    if (clash.challengerUid) {
      await createNotification({
        recipientUid: clash.challengerUid,
        actorUid,
        type: 'challenge',
        title: `Clash Declined: ${clash.title}`,
        body: `${clash.rightName} declined the duel invitation.`,
        linkUrl: `/clash/${clashId}`,
      });
    }

    return await getClashDetailById(clashId, actorUid);
  }

  // Accept flow
  if (
    clash.clashMode === 'community_duel' &&
    clash.opponentCommunityId &&
    Array.isArray(payload.stakedRewards) &&
    payload.stakedRewards.length > 0
  ) {
    await escrowSelectedRewardsForClash({
      clashId,
      actorUid,
      communityId: clash.opponentCommunityId,
      selectedRewards: payload.stakedRewards,
    });
  }

  const existingEntries = await db
    .select({ side: clashEntries.side })
    .from(clashEntries)
    .where(eq(clashEntries.clashId, clashId));
  const sides = new Set(existingEntries.map((e) => e.side));
  const bothReady = sides.has('left') && sides.has('right');

  const entryDeadlineAt = new Date(now.getTime() + 24 * 3600 * 1000);
  const nextStatus: ClashStatus = bothReady ? 'live' : 'awaiting_entries';
  const endsAt =
    bothReady && (!clash.endsAt || clash.endsAt <= now)
      ? new Date(now.getTime() + 48 * 3600 * 1000)
      : clash.endsAt || new Date(now.getTime() + 48 * 3600 * 1000);

  await db
    .update(clashes)
    .set({
      status: nextStatus,
      acceptedByUid: actorUid,
      acceptedAt: now,
      entryDeadlineAt,
      startsAt: bothReady ? now : clash.startsAt,
      endsAt,
      rightSubtitle:
        clash.clashMode === 'community_duel'
          ? 'Accepter Guild'
          : clash.rightSubtitle.replace('Invited', 'Accepter'),
      updatedAt: now,
    })
    .where(eq(clashes.id, clashId));

  if (clash.challengerUid) {
    await createNotification({
      recipientUid: clash.challengerUid,
      actorUid,
      type: 'challenge',
      title: `Clash Accepted: ${clash.title}`,
      body: bothReady
        ? 'Both duel edits are in — live voting has begun!'
        : 'Invitation accepted! Submit your duel media edit before the deadline.',
      linkUrl: `/clash/${clashId}`,
    });
  }

  return await getClashDetailById(clashId, actorUid);
}

export async function submitClashMediaEntry(
  actorUid: string,
  clashId: number,
  payload: {
    title?: string;
    caption?: string;
    mediaType: 'image' | 'video';
    dataUrl?: string;
    mediaAssetId?: number;
    posterDataUrl?: string;
    durationSec?: number;
    width?: number;
    height?: number;
  }
) {
  await sweepClashLifecycles();
  const [clash] = await db.select().from(clashes).where(eq(clashes.id, clashId)).limit(1);
  if (!clash) throw new HttpError(404, 'Clash not found.');

  if (clash.clashMode === 'solo_character') {
    throw new HttpError(400, 'Solo Character Clashes do not accept duel edit media uploads.');
  }

  if (!['pending_acceptance', 'awaiting_entries', 'scheduled'].includes(clash.status)) {
    throw new HttpError(
      400,
      `Submissions are locked because this Clash is currently ${clash.status.replace('_', ' ')}.`
    );
  }

  if (clash.entryDeadlineAt && clash.entryDeadlineAt <= new Date()) {
    throw new HttpError(400, 'The entry submission deadline for this Clash has passed.');
  }

  // Strictly determine side from actor permissions — never trust client-supplied side!
  let side: 'left' | 'right' | null = null;
  let submittingCommunityId: number | null = null;

  if (clash.clashMode === 'user_duel') {
    if (actorUid === clash.challengerUid) {
      side = 'left';
    } else if (actorUid === clash.opponentUid) {
      if (clash.status === 'pending_acceptance') {
        throw new HttpError(400, 'Accept the Duel Clash invitation before uploading your edit.');
      }
      side = 'right';
    }
  } else if (clash.clashMode === 'community_duel') {
    const canLeft = clash.challengerCommunityId
      ? await isGuildRepresentative(clash.challengerCommunityId, actorUid)
      : false;
    const canRight = clash.opponentCommunityId
      ? await isGuildRepresentative(clash.opponentCommunityId, actorUid)
      : false;

    if (canLeft && !canRight) {
      side = 'left';
      submittingCommunityId = clash.challengerCommunityId;
    } else if (canRight && !canLeft) {
      if (clash.status === 'pending_acceptance') {
        throw new HttpError(400, 'Accept the Guild Clash invitation before uploading your edit.');
      }
      side = 'right';
      submittingCommunityId = clash.opponentCommunityId;
    } else if (canLeft && canRight) {
      // Edge case where Sovereign Owner is rep in both guilds: match challengerUid first
      if (actorUid === clash.challengerUid) {
        side = 'left';
        submittingCommunityId = clash.challengerCommunityId;
      } else {
        side = 'right';
        submittingCommunityId = clash.opponentCommunityId;
      }
    }
  }

  if (!side) {
    throw new HttpError(
      403,
      'Forbidden: Only an authorized participant or guild representative can submit an entry for their side.'
    );
  }

  const mediaType = payload.mediaType === 'video' ? 'video' : 'image';
  let mediaUrl = '';
  let posterUrl: string | null = null;
  let mediaAssetId: number | null = null;
  let mimeType = mediaType === 'video' ? 'video/mp4' : 'image/jpeg';
  let width: number | null = null;
  let height: number | null = null;
  let durationSec: number | null = null;
  let byteSize: number | null = null;

  if (payload.dataUrl) {
    const uploaded = await uploadValidatedMediaAsset(actorUid, {
      dataUrl: payload.dataUrl,
      mediaType,
      purpose: mediaType === 'video' ? 'clash_video' : 'clash_image',
      visibility: 'public',
      clashId,
      durationSec: payload.durationSec ?? null,
      clientWidth: payload.width ?? null,
      clientHeight: payload.height ?? null,
    });
    mediaUrl = uploaded.url;
    mediaAssetId = uploaded.assetId;
    mimeType = uploaded.mimeType;
    width = uploaded.width;
    height = uploaded.height;
    durationSec = uploaded.durationSec;
    byteSize = uploaded.byteSize;
  } else if (payload.mediaAssetId) {
    const [existingAsset] = await db
      .select()
      .from(mediaAssets)
      .where(and(eq(mediaAssets.id, Number(payload.mediaAssetId)), eq(mediaAssets.ownerUid, actorUid)))
      .limit(1);
    if (!existingAsset) {
      throw new HttpError(400, 'Uploaded media asset was not found or does not belong to you.');
    }
    mediaUrl = `/api/media/${existingAsset.id}`;
    mediaAssetId = existingAsset.id;
    mimeType = existingAsset.mimeType;
    width = existingAsset.width;
    height = existingAsset.height;
    durationSec = existingAsset.durationSec;
    byteSize = existingAsset.byteSize;
  } else {
    throw new HttpError(400, 'Upload a valid image or video file for your Clash edit.');
  }

  if (mediaType === 'video' && payload.posterDataUrl) {
    try {
      const poster = await uploadValidatedMediaAsset(actorUid, {
        dataUrl: payload.posterDataUrl,
        mediaType: 'image',
        purpose: 'post_poster',
        visibility: 'public',
        clashId,
      });
      posterUrl = poster.url;
    } catch {
      posterUrl = side === 'left' ? clash.leftImageUrl : clash.rightImageUrl;
    }
  } else if (mediaType === 'video') {
    posterUrl = side === 'left' ? clash.leftImageUrl : clash.rightImageUrl;
  }

  const entryTitle =
    String(payload.title || '').trim().slice(0, 100) ||
    `${side === 'left' ? clash.leftName : clash.rightName} Edit`;
  const entryCaption = String(payload.caption || '').trim().slice(0, 600);
  const now = new Date();

  await db
    .insert(clashEntries)
    .values({
      clashId,
      side,
      submittedByUid: actorUid,
      communityId: submittingCommunityId,
      title: entryTitle,
      caption: entryCaption,
      mediaType,
      mediaUrl,
      posterUrl,
      mediaAssetId,
      mimeType,
      width,
      height,
      durationSec,
      byteSize,
      submittedAt: now,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [clashEntries.clashId, clashEntries.side],
      set: {
        submittedByUid: actorUid,
        communityId: submittingCommunityId,
        title: entryTitle,
        caption: entryCaption,
        mediaType,
        mediaUrl,
        posterUrl,
        mediaAssetId,
        mimeType,
        width,
        height,
        durationSec,
        byteSize,
        updatedAt: now,
      },
    });

  // Update preview image on clash card if image or poster available
  const cardPreview = mediaType === 'image' ? mediaUrl : posterUrl;
  const sidePreviewUpdate: Record<string, any> = { updatedAt: now };
  if (cardPreview) {
    if (side === 'left') sidePreviewUpdate.leftImageUrl = cardPreview;
    else sidePreviewUpdate.rightImageUrl = cardPreview;
  }

  // Check if clash is accepted and both entries are now present -> go LIVE automatically!
  const allEntries = await db
    .select({ side: clashEntries.side })
    .from(clashEntries)
    .where(eq(clashEntries.clashId, clashId));
  const submittedSides = new Set(allEntries.map((e) => e.side));

  if (
    clash.status === 'awaiting_entries' &&
    submittedSides.has('left') &&
    submittedSides.has('right')
  ) {
    sidePreviewUpdate.status = 'live';
    sidePreviewUpdate.startsAt = now;
    if (!clash.endsAt || clash.endsAt <= now) {
      sidePreviewUpdate.endsAt = new Date(now.getTime() + 48 * 3600 * 1000);
    }

    const notifyTargets = [clash.challengerUid, clash.opponentUid, clash.acceptedByUid].filter(
      Boolean
    ) as string[];
    for (const tUid of Array.from(new Set(notifyTargets))) {
      await createNotification({
        recipientUid: tUid,
        actorUid,
        type: 'challenge',
        title: `Duel Clash is LIVE: ${clash.title}`,
        body: 'Both edits have been submitted! Community voting is now open.',
        linkUrl: `/clash/${clashId}`,
      });
    }
  }

  await db.update(clashes).set(sidePreviewUpdate).where(eq(clashes.id, clashId));

  return await getClashDetailById(clashId, actorUid);
}

export async function voteInClash(
  userUid: string,
  clashId: number,
  side: 'left' | 'right'
) {
  await sweepClashLifecycles();
  const [clash] = await db.select().from(clashes).where(eq(clashes.id, clashId)).limit(1);
  if (!clash) throw new HttpError(404, 'Clash not found.');

  if (clash.status !== 'live') {
    throw new HttpError(
      400,
      `Voting is unavailable because this Clash is ${clash.status.replace('_', ' ')}.`
    );
  }

  if (clash.endsAt && clash.endsAt <= new Date()) {
    await finalizeClashById(clashId);
    throw new HttpError(400, 'The voting window for this Clash has closed.');
  }

  const [existing] = await db
    .select()
    .from(clashVotes)
    .where(and(eq(clashVotes.clashId, clashId), eq(clashVotes.userUid, userUid)))
    .limit(1);

  if (existing) {
    if (!clash.allowVoteChange) {
      throw new HttpError(
        409,
        'You have already cast your vote in this Clash. Vote changing is disabled.'
      );
    }
    await db
      .update(clashVotes)
      .set({ side, createdAt: new Date() })
      .where(eq(clashVotes.id, existing.id));
  } else {
    try {
      await db.insert(clashVotes).values({ clashId, userUid, side });
    } catch {
      if (!clash.allowVoteChange) {
        throw new HttpError(409, 'You have already cast your vote in this Clash.');
      }
    }
  }

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

  await db
    .update(clashes)
    .set({ leftVotes, rightVotes, updatedAt: new Date() })
    .where(eq(clashes.id, clashId));

  return await getClashDetailById(clashId, userUid);
}

export async function voteInClashRewardPoll(
  userUid: string,
  clashId: number,
  clashRewardId: number
) {
  const [clash] = await db.select().from(clashes).where(eq(clashes.id, clashId)).limit(1);
  if (!clash) throw new HttpError(404, 'Clash not found.');
  if (clash.clashMode !== 'community_duel' || !clash.hasRewards) {
    throw new HttpError(400, 'Reward poll is only active on Community Duel Clashes with staked rewards.');
  }
  if (!['pending_acceptance', 'awaiting_entries', 'live'].includes(clash.status)) {
    throw new HttpError(400, 'Reward poll voting is closed.');
  }

  const [rewardRow] = await db
    .select()
    .from(clashRewards)
    .where(and(eq(clashRewards.id, clashRewardId), eq(clashRewards.clashId, clashId)))
    .limit(1);
  if (!rewardRow) throw new HttpError(404, 'Staked reward option not found.');

  await db
    .insert(clashRewardVotes)
    .values({ clashId, clashRewardId, userUid })
    .onConflictDoUpdate({
      target: [clashRewardVotes.clashId, clashRewardVotes.userUid],
      set: { clashRewardId, createdAt: new Date() },
    });

  return await getClashDetailById(clashId, userUid);
}

export async function editOrCancelClash(
  actorUid: string,
  clashId: number,
  payload: {
    action: 'edit' | 'cancel' | 'force_complete';
    title?: string;
    description?: string;
    rules?: string;
  }
) {
  const [clash] = await db.select().from(clashes).where(eq(clashes.id, clashId)).limit(1);
  if (!clash) throw new HttpError(404, 'Clash not found.');

  const [actor] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.uid, actorUid))
    .limit(1);
  const isPlatformAdmin = actor?.role === 'owner' || actor?.role === 'admin';
  const isCreator = clash.creatorUid === actorUid || clash.challengerUid === actorUid;

  if (!isCreator && !isPlatformAdmin) {
    throw new HttpError(403, 'Forbidden: Only the Clash creator or KAGE Owner can modify this Clash.');
  }

  if (payload.action === 'force_complete') {
    if (!isPlatformAdmin && !isCreator) {
      throw new HttpError(403, 'Forbidden.');
    }
    return await finalizeClashById(clashId);
  }

  if (payload.action === 'cancel') {
    if (clash.status === 'completed' || clash.status === 'cancelled') {
      throw new HttpError(400, `Cannot cancel a Clash that is already ${clash.status}.`);
    }
    if (clash.status === 'live' && clash.leftVotes + clash.rightVotes > 0 && !isPlatformAdmin) {
      throw new HttpError(
        400,
        'Cannot cancel a live Clash once hunters have cast votes. Contact moderation if needed.'
      );
    }
    await db
      .update(clashes)
      .set({ status: 'cancelled', updatedAt: new Date() })
      .where(eq(clashes.id, clashId));
    await releaseEscrowedClashRewards(clashId);
    return await getClashDetailById(clashId, actorUid);
  }

  // Edit metadata before votes lock it
  if (clash.leftVotes + clash.rightVotes > 0 && !isPlatformAdmin) {
    throw new HttpError(400, 'Clash details are locked once community voting has started.');
  }
  const updates: Record<string, any> = { updatedAt: new Date() };
  if (typeof payload.title === 'string' && payload.title.trim()) {
    updates.title = payload.title.trim().slice(0, 120);
  }
  if (typeof payload.description === 'string') {
    updates.description = payload.description.trim().slice(0, 1200);
  }
  if (typeof payload.rules === 'string' && payload.rules.trim()) {
    updates.rules = payload.rules.trim().slice(0, 600);
  }
  await db.update(clashes).set(updates).where(eq(clashes.id, clashId));
  return await getClashDetailById(clashId, actorUid);
}

async function hydrateClashRows(
  rows: (typeof clashes.$inferSelect)[],
  viewerUid?: string
) {
  if (rows.length === 0) return [];
  const clashIds = rows.map((r) => r.id);
  const creatorUids = Array.from(
    new Set(rows.map((r) => r.creatorUid || r.challengerUid).filter(Boolean) as string[])
  );
  const communityIds = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.challengerCommunityId, r.opponentCommunityId])
        .filter((id): id is number => typeof id === 'number' && id > 0)
    )
  );

  const [
    entriesRows,
    rewardsRows,
    rewardVoteRows,
    viewerVotesRows,
    viewerRepMemberships,
    creatorRows,
    guildRows,
  ] = await Promise.all([
    db
      .select({
        entry: clashEntries,
        submitterUsername: users.username,
        submitterDisplayName: profiles.displayName,
      })
      .from(clashEntries)
      .innerJoin(users, eq(clashEntries.submittedByUid, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(inArray(clashEntries.clashId, clashIds)),
    db.select().from(clashRewards).where(inArray(clashRewards.clashId, clashIds)),
    db.select().from(clashRewardVotes).where(inArray(clashRewardVotes.clashId, clashIds)),
    viewerUid
      ? db
          .select()
          .from(clashVotes)
          .where(and(eq(clashVotes.userUid, viewerUid), inArray(clashVotes.clashId, clashIds)))
      : Promise.resolve([]),
    viewerUid
      ? db
          .select({
            communityId: communityMemberships.communityId,
            role: communityMemberships.role,
          })
          .from(communityMemberships)
          .where(eq(communityMemberships.userUid, viewerUid))
      : Promise.resolve([]),
    creatorUids.length > 0
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
          .where(inArray(users.uid, creatorUids))
      : Promise.resolve([]),
    communityIds.length > 0
      ? db
          .select({
            id: communities.id,
            name: communities.name,
            slug: communities.slug,
            artworkUrl: communities.artworkUrl,
            memberCount: communities.memberCount,
          })
          .from(communities)
          .where(inArray(communities.id, communityIds))
      : Promise.resolve([]),
  ]);

  const voteMap = new Map<number, string>(viewerVotesRows.map((v) => [v.clashId, v.side]));
  const repGuildIds = new Set<number>(
    viewerRepMemberships.filter((m) => REP_ROLES.has(m.role)).map((m) => m.communityId)
  );
  const creatorMap = new Map(creatorRows.map((cr) => [cr.uid, cr]));
  const guildMap = new Map(guildRows.map((g) => [g.id, g]));

  return rows.map((c) => {
    const cEntries = entriesRows
      .filter((e) => e.entry.clashId === c.id)
      .map((e) => ({
        ...e.entry,
        submitter: {
          uid: e.entry.submittedByUid,
          username: e.submitterUsername,
          displayName: e.submitterDisplayName,
        },
      }));
    const leftEntry = cEntries.find((e) => e.side === 'left') || null;
    const rightEntry = cEntries.find((e) => e.side === 'right') || null;

    const cRewardVotes = rewardVoteRows.filter((rv) => rv.clashId === c.id);
    const cRewards = rewardsRows
      .filter((r) => r.clashId === c.id)
      .map((r) => ({
        ...r,
        voteCount: cRewardVotes.filter((rv) => rv.clashRewardId === r.id).length,
      }));
    const viewerRewardVote = viewerUid
      ? cRewardVotes.find((rv) => rv.userUid === viewerUid)?.clashRewardId || null
      : null;

    const canAcceptInvite = Boolean(
      viewerUid &&
        c.status === 'pending_acceptance' &&
        ((c.clashMode === 'user_duel' && c.opponentUid === viewerUid) ||
          (c.clashMode === 'community_duel' &&
            c.opponentCommunityId &&
            repGuildIds.has(c.opponentCommunityId)))
    );

    const editableEntryState = ['pending_acceptance', 'awaiting_entries', 'scheduled'].includes(
      c.status
    );
    const canSubmitLeftEntry = Boolean(
      viewerUid &&
        editableEntryState &&
        c.clashMode !== 'solo_character' &&
        ((c.clashMode === 'user_duel' && c.challengerUid === viewerUid) ||
          (c.clashMode === 'community_duel' &&
            c.challengerCommunityId &&
            repGuildIds.has(c.challengerCommunityId)))
    );
    const canSubmitRightEntry = Boolean(
      viewerUid &&
        ['awaiting_entries', 'scheduled'].includes(c.status) &&
        c.clashMode !== 'solo_character' &&
        ((c.clashMode === 'user_duel' && c.opponentUid === viewerUid) ||
          (c.clashMode === 'community_duel' &&
            c.opponentCommunityId &&
            repGuildIds.has(c.opponentCommunityId)))
    );

    const totalVotes = (c.leftVotes || 0) + (c.rightVotes || 0);
    const leftPercent = totalVotes > 0 ? Math.round(((c.leftVotes || 0) / totalVotes) * 100) : 50;
    const rightPercent = totalVotes > 0 ? 100 - leftPercent : 50;

    const creator = creatorMap.get(c.creatorUid || c.challengerUid || '') || null;
    const challengerGuild = c.challengerCommunityId
      ? guildMap.get(c.challengerCommunityId) || null
      : null;
    const opponentGuild = c.opponentCommunityId
      ? guildMap.get(c.opponentCommunityId) || null
      : null;

    return {
      ...c,
      totalVotes,
      leftPercent,
      rightPercent,
      viewerVote: voteMap.get(c.id) || null,
      leftEntry,
      rightEntry,
      rewards: cRewards,
      viewerRewardVote,
      canAcceptInvite,
      canSubmitLeftEntry,
      canSubmitRightEntry,
      creator,
      challengerGuild,
      opponentGuild,
      isFanOpinionPowerVote: c.clashMode === 'solo_character',
      fanVoteDisclaimer:
        c.clashMode === 'solo_character'
          ? 'Community Fan Vote: Results reflect hunter fan opinion rather than an official canon power ranking.'
          : null,
    };
  });
}

export async function getClashDetailById(clashId: number, viewerUid?: string) {
  await sweepClashLifecycles();
  const rows = await db.select().from(clashes).where(eq(clashes.id, clashId)).limit(1);
  if (rows.length === 0) return null;
  const hydrated = await hydrateClashRows(rows, viewerUid);
  return hydrated[0] || null;
}

export async function listClashesPaginated(params: {
  tab?: string; // 'all' | 'live' | 'upcoming' | 'community' | 'character' | 'completed' | 'mine'
  q?: string;
  limit?: number;
  offset?: number;
  viewerUid?: string;
}) {
  await sweepClashLifecycles();

  const limit = Math.max(1, Math.min(40, params.limit || 16));
  const offset = Math.max(0, params.offset || 0);
  const tab = (params.tab || 'all').toLowerCase();
  const conds: any[] = [];

  if (tab === 'live') {
    conds.push(eq(clashes.status, 'live'));
  } else if (tab === 'upcoming') {
    conds.push(inArray(clashes.status, ['pending_acceptance', 'scheduled', 'awaiting_entries']));
  } else if (tab === 'community') {
    conds.push(eq(clashes.clashMode, 'community_duel'));
  } else if (tab === 'character') {
    conds.push(eq(clashes.clashMode, 'solo_character'));
  } else if (tab === 'completed') {
    conds.push(inArray(clashes.status, ['completed', 'declined', 'expired', 'cancelled']));
  } else if (tab === 'mine') {
    if (!params.viewerUid) {
      return { items: [], total: 0, hasMore: false };
    }
    const myRepRows = await db
      .select({ communityId: communityMemberships.communityId, role: communityMemberships.role })
      .from(communityMemberships)
      .where(eq(communityMemberships.userUid, params.viewerUid));
    const myGuildIds = myRepRows.map((m) => m.communityId);

    const mineOr: any[] = [
      eq(clashes.creatorUid, params.viewerUid),
      eq(clashes.challengerUid, params.viewerUid),
      eq(clashes.opponentUid, params.viewerUid),
    ];
    if (myGuildIds.length > 0) {
      mineOr.push(inArray(clashes.challengerCommunityId, myGuildIds));
      mineOr.push(inArray(clashes.opponentCommunityId, myGuildIds));
    }
    conds.push(or(...mineOr));
  } else {
    // 'all' tab excludes cancelled/declined unless in mine/completed
    conds.push(
      inArray(clashes.status, [
        'live',
        'pending_acceptance',
        'awaiting_entries',
        'scheduled',
        'completed',
      ])
    );
  }

  if (params.q?.trim()) {
    const pat = `%${params.q.trim()}%`;
    conds.push(
      or(
        sql`${clashes.title} ILIKE ${pat}`,
        sql`${clashes.leftName} ILIKE ${pat}`,
        sql`${clashes.rightName} ILIKE ${pat}`
      )
    );
  }

  const whereExpr = conds.length > 0 ? and(...conds) : undefined;

  const [countRes, rows] = await Promise.all([
    db.select({ count: sql<number>`count(*)::int` }).from(clashes).where(whereExpr),
    db
      .select()
      .from(clashes)
      .where(whereExpr)
      .orderBy(
        sql`CASE WHEN ${clashes.status} = 'live' THEN 0 WHEN ${clashes.status} IN ('pending_acceptance', 'awaiting_entries', 'scheduled') THEN 1 ELSE 2 END`,
        desc(clashes.createdAt)
      )
      .limit(limit)
      .offset(offset),
  ]);

  const total = countRes[0]?.count || 0;
  const items = await hydrateClashRows(rows, params.viewerUid);

  return {
    items,
    total,
    limit,
    offset,
    hasMore: offset + rows.length < total,
  };
}

export interface LeaderboardHunterRow {
  rank: number;
  uid: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  kageId: string | null;
  role: string;
  equippedTitle: string;
  accountLevel: number;
  accountXp: number;
  wins: number;
  losses: number;
  draws: number;
  matchesPlayed: number;
  completedMatches: number;
  winRate: number;
  votesEarned: number;
  entriesSubmitted: number;
  clashesCreated: number;
  votesCast: number;
  rewardsCaptured: number;
  powerScore: number;
  isAiDemo: boolean;
}

export interface LeaderboardCommunityRow {
  rank: number;
  id: number;
  slug: string;
  name: string;
  category: string;
  artworkUrl: string;
  isVerified: boolean;
  privacyMode: string;
  communityLevel: number;
  communityXp: number;
  memberCount: number;
  discussionCount: number;
  guildWarWins: number;
  guildWarLosses: number;
  guildWarDraws: number;
  guildWarsPlayed: number;
  completedGuildWars: number;
  liveGuildWars: number;
  winRate: number;
  warVotesEarned: number;
  rewardsCaptured: number;
  powerScore: number;
}

export async function getGlobalClashAndCommunityLeaderboard(params?: {
  limit?: number;
  viewerUid?: string;
}) {
  await sweepClashLifecycles();

  const limit = Math.max(5, Math.min(50, params?.limit || 25));

  const validStatuses = [
    'live',
    'completed',
    'awaiting_entries',
    'scheduled',
    'pending_acceptance',
  ];

  const [clashRows, entryRows, voteAggRows, awardedRewardRows, communityRows] = await Promise.all([
    db
      .select({
        id: clashes.id,
        clashMode: clashes.clashMode,
        status: clashes.status,
        winnerSide: clashes.winnerSide,
        creatorUid: clashes.creatorUid,
        challengerUid: clashes.challengerUid,
        opponentUid: clashes.opponentUid,
        acceptedByUid: clashes.acceptedByUid,
        challengerCommunityId: clashes.challengerCommunityId,
        opponentCommunityId: clashes.opponentCommunityId,
        leftVotes: clashes.leftVotes,
        rightVotes: clashes.rightVotes,
      })
      .from(clashes)
      .where(inArray(clashes.status, validStatuses)),
    db
      .select({
        clashId: clashEntries.clashId,
        side: clashEntries.side,
        submittedByUid: clashEntries.submittedByUid,
        communityId: clashEntries.communityId,
      })
      .from(clashEntries),
    db
      .select({
        userUid: clashVotes.userUid,
        votesCast: sql<number>`count(*)::int`,
      })
      .from(clashVotes)
      .groupBy(clashVotes.userUid),
    db
      .select({
        awardedToUid: clashRewards.awardedToUid,
        awardedToCommunityId: clashRewards.awardedToCommunityId,
      })
      .from(clashRewards)
      .where(eq(clashRewards.status, 'awarded')),
    db
      .select({
        id: communities.id,
        slug: communities.slug,
        name: communities.name,
        category: communities.category,
        artworkUrl: communities.artworkUrl,
        isVerified: communities.isVerified,
        privacyMode: communities.privacyMode,
        communityLevel: communities.communityLevel,
        communityXp: communities.communityXp,
        memberCount: communities.memberCount,
        discussionCount: communities.discussionCount,
      })
      .from(communities)
      .where(eq(communities.isArchived, false)),
  ]);

  // Index clash entries by clashId -> side -> submitter
  const entriesByClash = new Map<number, { leftUid?: string; rightUid?: string }>();
  const entriesCountByUser = new Map<string, number>();

  for (const e of entryRows) {
    entriesCountByUser.set(e.submittedByUid, (entriesCountByUser.get(e.submittedByUid) || 0) + 1);
    const cur = entriesByClash.get(e.clashId) || {};
    if (e.side === 'left' && !cur.leftUid) cur.leftUid = e.submittedByUid;
    if (e.side === 'right' && !cur.rightUid) cur.rightUid = e.submittedByUid;
    entriesByClash.set(e.clashId, cur);
  }

  const votesCastByUser = new Map<string, number>();
  for (const v of voteAggRows) {
    votesCastByUser.set(v.userUid, v.votesCast || 0);
  }

  const userRewardsCaptured = new Map<string, number>();
  const communityRewardsCaptured = new Map<number, number>();
  for (const rw of awardedRewardRows) {
    if (rw.awardedToUid) {
      userRewardsCaptured.set(rw.awardedToUid, (userRewardsCaptured.get(rw.awardedToUid) || 0) + 1);
    }
    if (rw.awardedToCommunityId) {
      communityRewardsCaptured.set(
        rw.awardedToCommunityId,
        (communityRewardsCaptured.get(rw.awardedToCommunityId) || 0) + 1
      );
    }
  }

  interface HunterAcc {
    wins: number;
    losses: number;
    draws: number;
    matchesPlayed: number;
    completedMatches: number;
    votesEarned: number;
    entriesSubmitted: number;
    clashesCreated: number;
    votesCast: number;
    rewardsCaptured: number;
  }

  const hunterStats = new Map<string, HunterAcc>();
  const ensureHunter = (uid: string): HunterAcc => {
    let cur = hunterStats.get(uid);
    if (!cur) {
      cur = {
        wins: 0,
        losses: 0,
        draws: 0,
        matchesPlayed: 0,
        completedMatches: 0,
        votesEarned: 0,
        entriesSubmitted: entriesCountByUser.get(uid) || 0,
        clashesCreated: 0,
        votesCast: votesCastByUser.get(uid) || 0,
        rewardsCaptured: userRewardsCaptured.get(uid) || 0,
      };
      hunterStats.set(uid, cur);
    }
    return cur;
  };

  interface CommunityAcc {
    guildWarWins: number;
    guildWarLosses: number;
    guildWarDraws: number;
    guildWarsPlayed: number;
    completedGuildWars: number;
    liveGuildWars: number;
    warVotesEarned: number;
    rewardsCaptured: number;
  }

  const guildStats = new Map<number, CommunityAcc>();
  const ensureGuild = (id: number): CommunityAcc => {
    let cur = guildStats.get(id);
    if (!cur) {
      cur = {
        guildWarWins: 0,
        guildWarLosses: 0,
        guildWarDraws: 0,
        guildWarsPlayed: 0,
        completedGuildWars: 0,
        liveGuildWars: 0,
        warVotesEarned: 0,
        rewardsCaptured: communityRewardsCaptured.get(id) || 0,
      };
      guildStats.set(id, cur);
    }
    return cur;
  };

  for (const g of communityRows) {
    ensureGuild(g.id);
  }

  let liveClashes = 0;
  let completedClashes = 0;
  let totalVotesCast = 0;

  for (const c of clashRows) {
    const leftVotes = Number(c.leftVotes || 0);
    const rightVotes = Number(c.rightVotes || 0);
    totalVotesCast += leftVotes + rightVotes;
    if (c.status === 'live') liveClashes += 1;
    if (c.status === 'completed') completedClashes += 1;

    const isActiveOrCompleted = c.status === 'live' || c.status === 'completed';
    const isCompleted = c.status === 'completed';

    if (c.creatorUid) {
      const creatorAcc = ensureHunter(c.creatorUid);
      creatorAcc.clashesCreated += 1;
      if (c.clashMode === 'solo_character') {
        creatorAcc.votesEarned += leftVotes + rightVotes;
      }
    }

    if (c.clashMode === 'user_duel') {
      const entryPair = entriesByClash.get(c.id);
      const leftUid = c.challengerUid || entryPair?.leftUid || null;
      const rightUid = c.acceptedByUid || c.opponentUid || entryPair?.rightUid || null;

      if (leftUid) {
        const acc = ensureHunter(leftUid);
        acc.votesEarned += leftVotes;
        if (isActiveOrCompleted) acc.matchesPlayed += 1;
        if (isCompleted) {
          acc.completedMatches += 1;
          if (c.winnerSide === 'left') acc.wins += 1;
          else if (c.winnerSide === 'right') acc.losses += 1;
          else acc.draws += 1;
        }
      }
      if (rightUid && rightUid !== leftUid) {
        const acc = ensureHunter(rightUid);
        acc.votesEarned += rightVotes;
        if (isActiveOrCompleted) acc.matchesPlayed += 1;
        if (isCompleted) {
          acc.completedMatches += 1;
          if (c.winnerSide === 'right') acc.wins += 1;
          else if (c.winnerSide === 'left') acc.losses += 1;
          else acc.draws += 1;
        }
      }
    } else if (c.clashMode === 'community_duel') {
      const entryPair = entriesByClash.get(c.id);
      if (entryPair?.leftUid) {
        const acc = ensureHunter(entryPair.leftUid);
        acc.votesEarned += leftVotes;
        if (isActiveOrCompleted) acc.matchesPlayed += 1;
        if (isCompleted) {
          acc.completedMatches += 1;
          if (c.winnerSide === 'left') acc.wins += 1;
          else if (c.winnerSide === 'right') acc.losses += 1;
          else acc.draws += 1;
        }
      }
      if (entryPair?.rightUid && entryPair.rightUid !== entryPair?.leftUid) {
        const acc = ensureHunter(entryPair.rightUid);
        acc.votesEarned += rightVotes;
        if (isActiveOrCompleted) acc.matchesPlayed += 1;
        if (isCompleted) {
          acc.completedMatches += 1;
          if (c.winnerSide === 'right') acc.wins += 1;
          else if (c.winnerSide === 'left') acc.losses += 1;
          else acc.draws += 1;
        }
      }

      if (c.challengerCommunityId) {
        const gAcc = ensureGuild(c.challengerCommunityId);
        gAcc.warVotesEarned += leftVotes;
        if (c.status === 'live') gAcc.liveGuildWars += 1;
        if (isActiveOrCompleted) gAcc.guildWarsPlayed += 1;
        if (isCompleted) {
          gAcc.completedGuildWars += 1;
          if (c.winnerSide === 'left') gAcc.guildWarWins += 1;
          else if (c.winnerSide === 'right') gAcc.guildWarLosses += 1;
          else gAcc.guildWarDraws += 1;
        }
      }
      if (c.opponentCommunityId && c.opponentCommunityId !== c.challengerCommunityId) {
        const gAcc = ensureGuild(c.opponentCommunityId);
        gAcc.warVotesEarned += rightVotes;
        if (c.status === 'live') gAcc.liveGuildWars += 1;
        if (isActiveOrCompleted) gAcc.guildWarsPlayed += 1;
        if (isCompleted) {
          gAcc.completedGuildWars += 1;
          if (c.winnerSide === 'right') gAcc.guildWarWins += 1;
          else if (c.winnerSide === 'left') gAcc.guildWarLosses += 1;
          else gAcc.guildWarDraws += 1;
        }
      }
    }
  }

  for (const uid of entriesCountByUser.keys()) ensureHunter(uid);
  for (const uid of votesCastByUser.keys()) ensureHunter(uid);
  for (const uid of userRewardsCaptured.keys()) ensureHunter(uid);

  const participantUids = Array.from(hunterStats.keys());
  if (params?.viewerUid && !hunterStats.has(params.viewerUid)) {
    participantUids.push(params.viewerUid);
  }

  const userRows =
    participantUids.length > 0
      ? await db
          .select({
            uid: users.uid,
            username: users.username,
            kageId: users.kageId,
            role: users.role,
            accountLevel: users.accountLevel,
            accountXp: users.accountXp,
            isAiDemo: users.isAiDemo,
            displayName: profiles.displayName,
            avatarUrl: profiles.avatarUrl,
            equippedTitle: profiles.equippedTitle,
          })
          .from(users)
          .innerJoin(profiles, eq(users.uid, profiles.userUid))
          .where(inArray(users.uid, participantUids))
      : [];

  const scoredHunters = userRows
    .map((u) => {
      const acc = hunterStats.get(u.uid) || {
        wins: 0,
        losses: 0,
        draws: 0,
        matchesPlayed: 0,
        completedMatches: 0,
        votesEarned: 0,
        entriesSubmitted: 0,
        clashesCreated: 0,
        votesCast: 0,
        rewardsCaptured: 0,
      };
      const winRate =
        acc.completedMatches > 0 ? Math.round((acc.wins / acc.completedMatches) * 100) : 0;
      const hasClashActivity =
        acc.matchesPlayed > 0 ||
        acc.entriesSubmitted > 0 ||
        acc.clashesCreated > 0 ||
        acc.votesCast > 0 ||
        acc.rewardsCaptured > 0;
      const powerScore = hasClashActivity
        ? acc.wins * 300 +
          acc.draws * 100 +
          acc.votesEarned * 12 +
          acc.entriesSubmitted * 80 +
          acc.clashesCreated * 40 +
          acc.votesCast * 5 +
          acc.rewardsCaptured * 150 +
          Math.round((u.accountXp || 0) * 0.1)
        : 0;

      return {
        ...u,
        ...acc,
        winRate,
        powerScore,
        hasClashActivity,
      };
    })
    .filter((h) => h.hasClashActivity || h.uid === params?.viewerUid)
    .sort((a, b) => {
      if (b.powerScore !== a.powerScore) return b.powerScore - a.powerScore;
      if (b.wins !== a.wins) return b.wins - a.wins;
      if (b.votesEarned !== a.votesEarned) return b.votesEarned - a.votesEarned;
      return b.accountXp - a.accountXp;
    });

  const rankedHunters: LeaderboardHunterRow[] = [];
  let viewerHunterRank: LeaderboardHunterRow | null = null;
  let activeCounter = 0;

  for (const h of scoredHunters) {
    if (h.hasClashActivity) {
      activeCounter += 1;
      const row: LeaderboardHunterRow = {
        rank: activeCounter,
        uid: h.uid,
        username: h.username,
        displayName: h.displayName,
        avatarUrl: h.avatarUrl,
        kageId: h.kageId,
        role: h.role,
        equippedTitle: h.equippedTitle,
        accountLevel: h.accountLevel,
        accountXp: h.accountXp,
        wins: h.wins,
        losses: h.losses,
        draws: h.draws,
        matchesPlayed: h.matchesPlayed,
        completedMatches: h.completedMatches,
        winRate: h.winRate,
        votesEarned: h.votesEarned,
        entriesSubmitted: h.entriesSubmitted,
        clashesCreated: h.clashesCreated,
        votesCast: h.votesCast,
        rewardsCaptured: h.rewardsCaptured,
        powerScore: h.powerScore,
        isAiDemo: h.isAiDemo,
      };
      if (rankedHunters.length < limit) {
        rankedHunters.push(row);
      }
      if (params?.viewerUid && h.uid === params.viewerUid) {
        viewerHunterRank = row;
      }
    } else if (params?.viewerUid && h.uid === params.viewerUid) {
      viewerHunterRank = {
        rank: 0,
        uid: h.uid,
        username: h.username,
        displayName: h.displayName,
        avatarUrl: h.avatarUrl,
        kageId: h.kageId,
        role: h.role,
        equippedTitle: h.equippedTitle,
        accountLevel: h.accountLevel,
        accountXp: h.accountXp,
        wins: 0,
        losses: 0,
        draws: 0,
        matchesPlayed: 0,
        completedMatches: 0,
        winRate: 0,
        votesEarned: 0,
        entriesSubmitted: 0,
        clashesCreated: 0,
        votesCast: 0,
        rewardsCaptured: 0,
        powerScore: 0,
        isAiDemo: h.isAiDemo,
      };
    }
  }

  const scoredCommunities = communityRows
    .map((g) => {
      const acc = ensureGuild(g.id);
      const winRate =
        acc.completedGuildWars > 0
          ? Math.round((acc.guildWarWins / acc.completedGuildWars) * 100)
          : 0;
      const powerScore =
        acc.guildWarWins * 400 +
        acc.guildWarDraws * 120 +
        acc.warVotesEarned * 15 +
        acc.rewardsCaptured * 200 +
        (g.communityXp || 0) +
        (g.memberCount || 0) * 8 +
        (g.discussionCount || 0) * 20;

      return {
        ...g,
        ...acc,
        winRate,
        powerScore,
      };
    })
    .sort((a, b) => {
      if (b.powerScore !== a.powerScore) return b.powerScore - a.powerScore;
      if (b.guildWarWins !== a.guildWarWins) return b.guildWarWins - a.guildWarWins;
      if (b.communityXp !== a.communityXp) return b.communityXp - a.communityXp;
      return b.memberCount - a.memberCount;
    });

  const rankedCommunities: LeaderboardCommunityRow[] = scoredCommunities
    .slice(0, limit)
    .map((g, idx) => ({
      rank: idx + 1,
      id: g.id,
      slug: g.slug,
      name: g.name,
      category: g.category,
      artworkUrl: g.artworkUrl,
      isVerified: g.isVerified,
      privacyMode: g.privacyMode,
      communityLevel: g.communityLevel,
      communityXp: g.communityXp,
      memberCount: g.memberCount,
      discussionCount: g.discussionCount,
      guildWarWins: g.guildWarWins,
      guildWarLosses: g.guildWarLosses,
      guildWarDraws: g.guildWarDraws,
      guildWarsPlayed: g.guildWarsPlayed,
      completedGuildWars: g.completedGuildWars,
      liveGuildWars: g.liveGuildWars,
      winRate: g.winRate,
      warVotesEarned: g.warVotesEarned,
      rewardsCaptured: g.rewardsCaptured,
      powerScore: g.powerScore,
    }));

  return {
    summary: {
      totalClashes: clashRows.length,
      liveClashes,
      completedClashes,
      totalVotesCast,
      activeCommunities: communityRows.length,
      activeClashHunters: activeCounter,
    },
    hunters: rankedHunters,
    communities: rankedCommunities,
    viewerHunterRank,
    generatedAt: new Date().toISOString(),
  };
}

