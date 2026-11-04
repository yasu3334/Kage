import { and, desc, eq, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { db } from './index.ts';
import {
  conversationMembers,
  conversations,
  mediaAssets,
  messages,
  profiles,
  userFollows,
  users,
  userSettings,
  type MessageAttachmentMeta,
} from './schema.ts';
import { HttpError, deleteMediaAssetById, hasBlockBetween } from './profileSystemRepo.ts';
import { createNotification } from './repository.ts';
import { getStickerById, isValidStickerId } from '../lib/kageStickers.ts';
import { signMediaUrlForViewer, uploadValidatedMediaAsset } from '../server/mediaAccess.ts';

export function computeDirectPairKey(uidA: string, uidB: string): string {
  return [uidA, uidB].sort().join(':');
}

function formatMessageForViewer(
  rawMsg: typeof messages.$inferSelect & {
    senderUsername: string;
    senderRole: string;
    senderDisplayName: string;
    senderAvatarUrl: string;
  },
  viewerUid: string,
  peerAllowsReadReceipts = true
) {
  const scope = { type: 'conversation' as const, id: rawMsg.conversationId };
  const isDeleted = Boolean(rawMsg.isDeleted);

  return {
    id: rawMsg.id,
    conversationId: rawMsg.conversationId,
    senderUid: rawMsg.senderUid,
    content: isDeleted ? 'Message deleted' : rawMsg.content,
    messageType: isDeleted ? 'text' : rawMsg.messageType,
    stickerId: isDeleted ? null : rawMsg.stickerId,
    attachmentUrl: isDeleted
      ? null
      : signMediaUrlForViewer(rawMsg.attachmentUrl, viewerUid, scope),
    attachmentPosterUrl: isDeleted
      ? null
      : signMediaUrlForViewer(rawMsg.attachmentPosterUrl, viewerUid, scope),
    attachmentType: isDeleted ? null : rawMsg.attachmentType,
    attachmentMeta: isDeleted ? null : rawMsg.attachmentMeta,
    replyToMessageId: rawMsg.replyToMessageId,
    idempotencyKey: rawMsg.idempotencyKey,
    deliveredAt: rawMsg.deliveredAt,
    readAt:
      rawMsg.senderUid === viewerUid
        ? peerAllowsReadReceipts
          ? rawMsg.readAt
          : null
        : rawMsg.readAt,
    editedAt: rawMsg.editedAt,
    deletedAt: rawMsg.deletedAt,
    isDeleted,
    createdAt: rawMsg.createdAt,
    senderUsername: rawMsg.senderUsername,
    senderRole: rawMsg.senderRole,
    senderDisplayName: rawMsg.senderDisplayName,
    senderAvatarUrl: rawMsg.senderAvatarUrl,
  };
}

export async function getUnreadInboxCountForUser(uid: string): Promise<number> {
  const memberships = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.userUid, uid),
        eq(conversationMembers.isArchived, false),
        inArray(conversationMembers.requestStatus, ['accepted', 'pending'])
      )
    );

  if (memberships.length === 0) return 0;

  let totalUnread = 0;
  for (const m of memberships) {
    if (m.markedUnread) {
      totalUnread += 1;
      continue;
    }
    const [cnt] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, m.conversationId),
          ne(messages.senderUid, uid),
          eq(messages.isDeleted, false),
          m.lastReadMessageId
            ? sql`${messages.id} > ${m.lastReadMessageId}`
            : sql`${messages.createdAt} > ${m.lastReadAt}`
        )
      );
    totalUnread += cnt?.count || 0;
  }
  return totalUnread;
}

export async function listInboxConversationsForViewer(
  uid: string,
  folder: 'active' | 'requests' | 'archived' | 'all' = 'all'
) {
  const memberships = await db
    .select()
    .from(conversationMembers)
    .where(eq(conversationMembers.userUid, uid));

  if (memberships.length === 0) {
    return {
      conversations: [],
      counts: { activeUnread: 0, requestsCount: 0, archivedCount: 0 },
    };
  }

  const convIds = memberships.map((m) => m.conversationId);

  const [convs, allMembers, latestMsgs] = await Promise.all([
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
        requestStatus: conversationMembers.requestStatus,
        lastReadAt: conversationMembers.lastReadAt,
        lastReadMessageId: conversationMembers.lastReadMessageId,
      })
      .from(conversationMembers)
      .innerJoin(users, eq(conversationMembers.userUid, users.uid))
      .innerJoin(profiles, eq(users.uid, profiles.userUid))
      .where(inArray(conversationMembers.conversationId, convIds)),
    db
      .select()
      .from(messages)
      .where(inArray(messages.conversationId, convIds))
      .orderBy(desc(messages.createdAt), desc(messages.id)),
  ]);

  let activeUnread = 0;
  let requestsCount = 0;
  let archivedCount = 0;

  const enriched = convs
    .map((c) => {
      const myMember = memberships.find((m) => m.conversationId === c.id);
      if (!myMember || myMember.requestStatus === 'declined') return null;

      const participants = allMembers.filter((m) => m.conversationId === c.id);
      const peer = participants.find((p) => p.uid !== uid) || participants[0];
      const convMsgs = latestMsgs.filter((m) => m.conversationId === c.id);
      const lastMsg = convMsgs[0] || null;

      let unreadCount = convMsgs.filter((m) => {
        if (m.senderUid === uid || m.isDeleted) return false;
        if (myMember.lastReadMessageId) return m.id > myMember.lastReadMessageId;
        return m.createdAt > myMember.lastReadAt;
      }).length;

      if (unreadCount === 0 && myMember.markedUnread) {
        unreadCount = 1;
      }

      if (myMember.isArchived) {
        archivedCount += 1;
      } else if (myMember.requestStatus === 'pending') {
        requestsCount += 1;
      } else {
        activeUnread += unreadCount;
      }

      const lastMsgPreview = lastMsg
        ? lastMsg.isDeleted
          ? 'Message deleted'
          : lastMsg.messageType === 'sticker'
            ? `Sticker · ${getStickerById(lastMsg.stickerId)?.name || 'Anime Sticker'}`
            : lastMsg.messageType === 'media'
              ? lastMsg.content ||
                (lastMsg.attachmentType === 'video' ? 'Sent a video clip' : 'Sent an image')
              : lastMsg.content
        : c.lastMessagePreview || '';

      return {
        ...c,
        requestStatus: myMember.requestStatus,
        isMuted: myMember.isMuted,
        isArchived: myMember.isArchived,
        markedUnread: myMember.markedUnread,
        peerUid: !c.isGroup ? peer?.uid || null : null,
        peerUsername: !c.isGroup ? peer?.username || null : null,
        displayTitle: c.isGroup ? c.title || 'Squad Chat' : peer?.displayName || 'Hunter',
        displayAvatar: c.isGroup
          ? c.avatarUrl || 'asset:shadow_monarch'
          : peer?.avatarUrl || '/assets/zenitsu-avatar.png',
        participants,
        lastMessage: lastMsg
          ? {
              ...lastMsg,
              content: lastMsgPreview,
              attachmentUrl: signMediaUrlForViewer(lastMsg.attachmentUrl, uid, {
                type: 'conversation',
                id: c.id,
              }),
            }
          : null,
        lastMessagePreview: lastMsgPreview,
        unreadCount,
      };
    })
    .filter(Boolean) as any[];

  const filtered = enriched.filter((item) => {
    if (folder === 'archived') return item.isArchived;
    if (folder === 'requests') return !item.isArchived && item.requestStatus === 'pending';
    if (folder === 'active') return !item.isArchived && item.requestStatus === 'accepted';
    return !item.isArchived;
  });

  return {
    conversations: filtered,
    counts: { activeUnread, requestsCount, archivedCount },
  };
}

export async function startOrOpenConversation(
  creatorUid: string,
  targetUids: string[],
  groupTitle?: string
) {
  const uniqueTargets = Array.from(
    new Set(targetUids.map((id) => String(id || '').trim()).filter((id) => id && id !== creatorUid))
  );
  if (uniqueTargets.length === 0) {
    throw new HttpError(400, 'Select at least one hunter to message.');
  }

  for (const tUid of uniqueTargets) {
    const block = await hasBlockBetween(creatorUid, tUid);
    if (block.anyBlock) {
      throw new HttpError(
        403,
        'Messaging is unavailable because a block is active between these accounts.'
      );
    }
  }

  const isGroup = uniqueTargets.length > 1 || Boolean(groupTitle?.trim());

  if (!isGroup) {
    const peerUid = uniqueTargets[0];
    const [peerUser] = await db.select().from(users).where(eq(users.uid, peerUid)).limit(1);
    if (!peerUser) {
      throw new HttpError(404, 'Target hunter was not found.');
    }

    const pairKey = computeDirectPairKey(creatorUid, peerUid);

    // Check existing conversation by directPairKey OR legacy 1:1 membership
    let [existingConv] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.directPairKey, pairKey))
      .limit(1);

    if (!existingConv) {
      const myMem = await db
        .select()
        .from(conversationMembers)
        .where(eq(conversationMembers.userUid, creatorUid));
      for (const m of myMem) {
        const [cand] = await db
          .select()
          .from(conversations)
          .where(and(eq(conversations.id, m.conversationId), eq(conversations.isGroup, false)))
          .limit(1);
        if (!cand) continue;
        const [pMem] = await db
          .select()
          .from(conversationMembers)
          .where(
            and(
              eq(conversationMembers.conversationId, cand.id),
              eq(conversationMembers.userUid, peerUid)
            )
          )
          .limit(1);
        if (pMem) {
          existingConv = cand;
          if (!cand.directPairKey) {
            await db
              .update(conversations)
              .set({ directPairKey: pairKey })
              .where(eq(conversations.id, cand.id));
          }
          break;
        }
      }
    }

    if (existingConv) {
      // Unarchive for creator and reopen if previously declined by creator
      await db
        .update(conversationMembers)
        .set({ isArchived: false, requestStatus: 'accepted' })
        .where(
          and(
            eq(conversationMembers.conversationId, existingConv.id),
            eq(conversationMembers.userUid, creatorUid)
          )
        );
      return existingConv;
    }

    // Check recipient DM privacy & message request preferences
    const [peerSettingsRows, peerFollowsCreatorRows] = await Promise.all([
      db.select().from(userSettings).where(eq(userSettings.userUid, peerUid)).limit(1),
      db
        .select({ id: userFollows.id })
        .from(userFollows)
        .where(and(eq(userFollows.followerUid, peerUid), eq(userFollows.followingUid, creatorUid)))
        .limit(1),
    ]);

    const allowDm = peerSettingsRows[0]?.allowDirectMessages || 'everyone';
    const requestMode = peerSettingsRows[0]?.messageRequestMode || 'non_followers';
    const peerFollowsCreator = Boolean(peerFollowsCreatorRows[0]);

    if (allowDm === 'nobody') {
      throw new HttpError(403, 'This hunter has turned off new direct messages.');
    }
    if (allowDm === 'followers' && !peerFollowsCreator) {
      throw new HttpError(403, 'Only hunters followed by this user can start a direct message.');
    }

    const peerRequestStatus =
      peerFollowsCreator || requestMode === 'off' ? 'accepted' : 'pending';

    const [created] = await db
      .insert(conversations)
      .values({
        creatorUid,
        directPairKey: pairKey,
        title: null,
        isGroup: false,
      })
      .onConflictDoUpdate({
        target: conversations.directPairKey,
        set: { updatedAt: new Date() },
      })
      .returning();

    await db
      .insert(conversationMembers)
      .values([
        { conversationId: created.id, userUid: creatorUid, requestStatus: 'accepted' },
        { conversationId: created.id, userUid: peerUid, requestStatus: peerRequestStatus },
      ])
      .onConflictDoNothing();

    return created;
  }

  // Group Squad Chat
  const [createdGroup] = await db
    .insert(conversations)
    .values({
      creatorUid,
      title: (groupTitle || '').trim().slice(0, 80) || 'Anime Squad',
      isGroup: true,
    })
    .returning();

  for (const mUid of [creatorUid, ...uniqueTargets]) {
    await db
      .insert(conversationMembers)
      .values({
        conversationId: createdGroup.id,
        userUid: mUid,
        requestStatus: mUid === creatorUid ? 'accepted' : 'accepted',
      })
      .onConflictDoNothing();
  }

  return createdGroup;
}

export async function respondToConversationRequest(
  actorUid: string,
  conversationId: number,
  action: 'accept' | 'decline'
) {
  const [mem] = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userUid, actorUid)
      )
    )
    .limit(1);

  if (!mem) {
    throw new HttpError(403, 'Forbidden: You are not a member of this conversation.');
  }

  const nextStatus = action === 'accept' ? 'accepted' : 'declined';
  await db
    .update(conversationMembers)
    .set({
      requestStatus: nextStatus,
      isArchived: action === 'decline' ? true : false,
      lastReadAt: new Date(),
    })
    .where(eq(conversationMembers.id, mem.id));

  return { conversationId, requestStatus: nextStatus };
}

export async function updateConversationPreferences(
  actorUid: string,
  conversationId: number,
  payload: {
    isMuted?: boolean;
    isArchived?: boolean;
    markedUnread?: boolean;
    theme?: string;
  }
) {
  const [mem] = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userUid, actorUid)
      )
    )
    .limit(1);

  if (!mem) {
    throw new HttpError(403, 'Forbidden: You are not a participant in this conversation.');
  }

  const updates: Record<string, any> = {};
  if (typeof payload.isMuted === 'boolean') updates.isMuted = payload.isMuted;
  if (typeof payload.isArchived === 'boolean') updates.isArchived = payload.isArchived;
  if (typeof payload.markedUnread === 'boolean') updates.markedUnread = payload.markedUnread;
  if (typeof payload.theme === 'string' && payload.theme.trim()) {
    updates.theme = payload.theme.trim().slice(0, 40);
  }

  const [updated] = await db
    .update(conversationMembers)
    .set(updates)
    .where(eq(conversationMembers.id, mem.id))
    .returning();

  return updated;
}

export async function getConversationMessagesPaginated(
  viewerUid: string,
  conversationId: number,
  params?: { beforeId?: number; limit?: number }
) {
  const members = await db
    .select()
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));

  const myMem = members.find((m) => m.userUid === viewerUid);
  if (!myMem) {
    throw new HttpError(403, 'Forbidden: You are not a participant in this conversation.');
  }

  const limit = Math.max(1, Math.min(80, params?.limit || 45));
  const conds: any[] = [eq(messages.conversationId, conversationId)];
  if (params?.beforeId && params.beforeId > 0) {
    conds.push(lt(messages.id, params.beforeId));
  }

  const rowsDesc = await db
    .select({
      msg: messages,
      senderUsername: users.username,
      senderRole: users.role,
      senderDisplayName: profiles.displayName,
      senderAvatarUrl: profiles.avatarUrl,
    })
    .from(messages)
    .innerJoin(users, eq(messages.senderUid, users.uid))
    .innerJoin(profiles, eq(users.uid, profiles.userUid))
    .where(and(...conds))
    .orderBy(desc(messages.id))
    .limit(limit + 1);

  const hasMoreOlder = rowsDesc.length > limit;
  const rowsAsc = rowsDesc.slice(0, limit).reverse();

  // Mark incoming messages as delivered & read
  const now = new Date();
  const [viewerSettings] = await db
    .select({ showReadReceipts: userSettings.showReadReceipts })
    .from(userSettings)
    .where(eq(userSettings.userUid, viewerUid))
    .limit(1);

  const sendPublicReceipt = viewerSettings?.showReadReceipts !== false;

  const undeliveredIds = rowsAsc
    .filter((r) => r.msg.senderUid !== viewerUid && !r.msg.deliveredAt)
    .map((r) => r.msg.id);
  const unreadIncomingIds = rowsAsc
    .filter((r) => r.msg.senderUid !== viewerUid && !r.msg.readAt)
    .map((r) => r.msg.id);

  if (undeliveredIds.length > 0) {
    await db
      .update(messages)
      .set({ deliveredAt: now })
      .where(and(inArray(messages.id, undeliveredIds), isNull(messages.deliveredAt)));
  }

  if (unreadIncomingIds.length > 0 && sendPublicReceipt) {
    await db
      .update(messages)
      .set({ readAt: now, deliveredAt: sql`COALESCE(${messages.deliveredAt}, ${now})` })
      .where(and(inArray(messages.id, unreadIncomingIds), isNull(messages.readAt)));
  }

  const latestIdInConvo = rowsAsc.length > 0 ? rowsAsc[rowsAsc.length - 1].msg.id : myMem.lastReadMessageId;
  if (!params?.beforeId) {
    await db
      .update(conversationMembers)
      .set({
        lastReadAt: now,
        lastReadMessageId: latestIdInConvo ?? myMem.lastReadMessageId,
        lastDeliveredMessageId: latestIdInConvo ?? myMem.lastDeliveredMessageId,
        markedUnread: false,
      })
      .where(eq(conversationMembers.id, myMem.id));
  }

  // Check peer read-receipt privacy
  const peerUids = members.filter((m) => m.userUid !== viewerUid).map((m) => m.userUid);
  let peerAllowsReceipts = true;
  if (peerUids.length === 1) {
    const [pSet] = await db
      .select({ showReadReceipts: userSettings.showReadReceipts })
      .from(userSettings)
      .where(eq(userSettings.userUid, peerUids[0]))
      .limit(1);
    if (pSet && pSet.showReadReceipts === false) {
      peerAllowsReceipts = false;
    }
  }

  const formatted = rowsAsc.map((r) =>
    formatMessageForViewer(
      {
        ...r.msg,
        deliveredAt:
          r.msg.senderUid !== viewerUid ? r.msg.deliveredAt || now : r.msg.deliveredAt,
        readAt:
          r.msg.senderUid !== viewerUid && sendPublicReceipt
            ? r.msg.readAt || now
            : r.msg.readAt,
        senderUsername: r.senderUsername,
        senderRole: r.senderRole,
        senderDisplayName: r.senderDisplayName,
        senderAvatarUrl: r.senderAvatarUrl,
      },
      viewerUid,
      peerAllowsReceipts
    )
  );

  return {
    messages: formatted,
    hasMoreOlder,
    requestStatus: myMem.requestStatus,
    newlyReadIds: sendPublicReceipt ? unreadIncomingIds : [],
    peerUids,
  };
}

export async function sendRichMessageInConversation(
  senderUid: string,
  conversationId: number,
  payload: {
    content?: string;
    stickerId?: string | null;
    imageDataUrl?: string | null;
    videoDataUrl?: string | null;
    posterDataUrl?: string | null;
    mediaAssetId?: number | null;
    durationSec?: number | null;
    replyToMessageId?: number | null;
    idempotencyKey?: string | null;
  }
) {
  const members = await db
    .select()
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));

  const senderMem = members.find((m) => m.userUid === senderUid);
  if (!senderMem) {
    throw new HttpError(403, 'Forbidden: You are not a participant in this conversation.');
  }

  const [conv] = await db
    .select()
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);
  if (!conv) throw new HttpError(404, 'Conversation not found.');

  const recipientMembers = members.filter((m) => m.userUid !== senderUid);
  if (!conv.isGroup && recipientMembers[0]) {
    const block = await hasBlockBetween(senderUid, recipientMembers[0].userUid);
    if (block.anyBlock) {
      throw new HttpError(403, 'Cannot send messages because a block is active.');
    }
    if (recipientMembers[0].requestStatus === 'declined') {
      throw new HttpError(403, 'This message request was declined.');
    }
  }

  const [senderInfo] = await db
    .select({
      username: users.username,
      role: users.role,
      displayName: profiles.displayName,
      avatarUrl: profiles.avatarUrl,
    })
    .from(users)
    .innerJoin(profiles, eq(users.uid, profiles.userUid))
    .where(eq(users.uid, senderUid))
    .limit(1);

  const idempotencyKey = payload.idempotencyKey
    ? String(payload.idempotencyKey).trim().slice(0, 80)
    : null;

  // Idempotency guard against duplicate retries / rapid double clicks
  if (idempotencyKey) {
    const [existing] = await db
      .select()
      .from(messages)
      .where(
        and(eq(messages.senderUid, senderUid), eq(messages.idempotencyKey, idempotencyKey))
      )
      .limit(1);
    if (existing) {
      const fullExisting = {
        ...existing,
        senderUsername: senderInfo?.username || 'hunter',
        senderRole: senderInfo?.role || 'user',
        senderDisplayName: senderInfo?.displayName || 'Hunter',
        senderAvatarUrl: senderInfo?.avatarUrl || '/assets/zenitsu-avatar.png',
      };
      return {
        message: formatMessageForViewer(fullExisting, senderUid, true),
        recipientPayloads: [],
        recipientUids: [],
        deduplicated: true,
      };
    }
  }

  const cleanContent = String(payload.content || '').trim().slice(0, 3000);
  const stickerId = payload.stickerId ? String(payload.stickerId).trim() : null;
  if (stickerId && !isValidStickerId(stickerId)) {
    throw new HttpError(400, 'Selected anime sticker is invalid.');
  }

  let messageType: 'text' | 'sticker' | 'media' = 'text';
  let attachmentUrl: string | null = null;
  let attachmentPosterUrl: string | null = null;
  let attachmentType: 'image' | 'video' | null = null;
  let attachmentMeta: MessageAttachmentMeta | null = null;

  if (payload.videoDataUrl) {
    const vid = await uploadValidatedMediaAsset(senderUid, {
      dataUrl: payload.videoDataUrl,
      mediaType: 'video',
      purpose: 'dm_video',
      visibility: 'private_conversation',
      conversationId,
      durationSec: payload.durationSec ?? null,
    });
    messageType = 'media';
    attachmentType = 'video';
    attachmentUrl = vid.url;
    attachmentMeta = {
      assetId: vid.assetId,
      width: vid.width,
      height: vid.height,
      durationSec: vid.durationSec,
      mimeType: vid.mimeType,
    };
    if (payload.posterDataUrl) {
      try {
        const poster = await uploadValidatedMediaAsset(senderUid, {
          dataUrl: payload.posterDataUrl,
          mediaType: 'image',
          purpose: 'post_poster',
          visibility: 'private_conversation',
          conversationId,
        });
        attachmentPosterUrl = poster.url;
      } catch {
        attachmentPosterUrl = null;
      }
    }
  } else if (payload.imageDataUrl) {
    const img = await uploadValidatedMediaAsset(senderUid, {
      dataUrl: payload.imageDataUrl,
      mediaType: 'image',
      purpose: 'dm_image',
      visibility: 'private_conversation',
      conversationId,
    });
    messageType = 'media';
    attachmentType = 'image';
    attachmentUrl = img.url;
    attachmentMeta = {
      assetId: img.assetId,
      width: img.width,
      height: img.height,
      mimeType: img.mimeType,
    };
  } else if (payload.mediaAssetId) {
    const [asset] = await db
      .select()
      .from(mediaAssets)
      .where(
        and(eq(mediaAssets.id, Number(payload.mediaAssetId)), eq(mediaAssets.ownerUid, senderUid))
      )
      .limit(1);
    if (!asset) throw new HttpError(400, 'Attachment media asset was not found.');
    await db
      .update(mediaAssets)
      .set({ visibility: 'private_conversation', conversationId })
      .where(eq(mediaAssets.id, asset.id));
    messageType = 'media';
    attachmentType = asset.mimeType.startsWith('video/') ? 'video' : 'image';
    attachmentUrl = `/api/media/${asset.id}`;
    attachmentMeta = {
      assetId: asset.id,
      width: asset.width,
      height: asset.height,
      durationSec: asset.durationSec,
      mimeType: asset.mimeType,
    };
  } else if (stickerId) {
    messageType = 'sticker';
  }

  if (!cleanContent && messageType === 'text') {
    throw new HttpError(400, 'Write a message, attach media, or pick an anime sticker.');
  }

  const stickerMeta = stickerId ? getStickerById(stickerId) : null;
  const previewText =
    messageType === 'sticker'
      ? `Sticker · ${stickerMeta?.name || 'Anime Sticker'}`
      : messageType === 'media'
        ? cleanContent || (attachmentType === 'video' ? 'Sent a video clip' : 'Sent an image')
        : cleanContent;

  // If sender was in 'pending' request state and replies, auto-accept the request!
  if (senderMem.requestStatus === 'pending') {
    await db
      .update(conversationMembers)
      .set({ requestStatus: 'accepted', isArchived: false })
      .where(eq(conversationMembers.id, senderMem.id));
  }

  const now = new Date();
  const [inserted] = await db
    .insert(messages)
    .values({
      conversationId,
      senderUid,
      content: cleanContent,
      messageType,
      stickerId,
      attachmentUrl,
      attachmentPosterUrl,
      attachmentType,
      attachmentMeta,
      replyToMessageId: payload.replyToMessageId ? Number(payload.replyToMessageId) : null,
      idempotencyKey,
    })
    .returning();

  await db
    .update(conversations)
    .set({
      lastMessageId: inserted.id,
      lastMessagePreview: previewText.slice(0, 140),
      lastMessageAt: now,
      updatedAt: now,
    })
    .where(eq(conversations.id, conversationId));

  await db
    .update(conversationMembers)
    .set({
      lastReadAt: now,
      lastReadMessageId: inserted.id,
      isArchived: false,
      markedUnread: false,
    })
    .where(eq(conversationMembers.id, senderMem.id));

  const baseHydrated = {
    ...inserted,
    senderUsername: senderInfo?.username || 'hunter',
    senderRole: senderInfo?.role || 'user',
    senderDisplayName: senderInfo?.displayName || 'Hunter',
    senderAvatarUrl: senderInfo?.avatarUrl || '/assets/zenitsu-avatar.png',
  };

  const recipientPayloads: { uid: string; message: any; isMuted: boolean; requestStatus: string }[] =
    [];

  for (const rMem of recipientMembers) {
    if (rMem.requestStatus === 'accepted' && rMem.isArchived) {
      await db
        .update(conversationMembers)
        .set({ isArchived: false })
        .where(eq(conversationMembers.id, rMem.id));
    }

    const msgForRecipient = formatMessageForViewer(baseHydrated, rMem.userUid, true);
    recipientPayloads.push({
      uid: rMem.userUid,
      message: msgForRecipient,
      isMuted: rMem.isMuted,
      requestStatus: rMem.requestStatus,
    });

    if (!rMem.isMuted) {
      await createNotification({
        recipientUid: rMem.userUid,
        actorUid: senderUid,
        type: rMem.requestStatus === 'pending' ? 'message_request' : 'direct_message',
        title:
          rMem.requestStatus === 'pending'
            ? `Message request from ${senderInfo?.displayName || '@' + senderInfo?.username}`
            : `New message from ${senderInfo?.displayName || '@' + senderInfo?.username}`,
        body: previewText.slice(0, 90),
        linkUrl: `/inbox/${conversationId}`,
      });
    }
  }

  return {
    message: formatMessageForViewer(baseHydrated, senderUid, true),
    recipientPayloads,
    recipientUids: recipientMembers.map((m) => m.userUid),
    deduplicated: false,
  };
}

export async function markMessageDeliveredByRecipient(
  recipientUid: string,
  conversationId: number,
  messageId: number
) {
  const [mem] = await db
    .select()
    .from(conversationMembers)
    .where(
      and(
        eq(conversationMembers.conversationId, conversationId),
        eq(conversationMembers.userUid, recipientUid)
      )
    )
    .limit(1);
  if (!mem) throw new HttpError(403, 'Forbidden.');

  const now = new Date();
  const [updated] = await db
    .update(messages)
    .set({ deliveredAt: now })
    .where(
      and(
        eq(messages.id, messageId),
        eq(messages.conversationId, conversationId),
        ne(messages.senderUid, recipientUid),
        isNull(messages.deliveredAt)
      )
    )
    .returning();

  return updated || null;
}

export async function editOwnConversationMessage(
  actorUid: string,
  conversationId: number,
  messageId: number,
  content: string
) {
  const [msg] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
    .limit(1);
  if (!msg || msg.isDeleted) {
    throw new HttpError(404, 'Message not found.');
  }
  if (msg.senderUid !== actorUid) {
    throw new HttpError(403, 'Forbidden: You can only edit messages you sent.');
  }

  const clean = String(content || '').trim().slice(0, 3000);
  if (!clean && msg.messageType === 'text') {
    throw new HttpError(400, 'Edited message cannot be empty.');
  }

  const now = new Date();
  const [updated] = await db
    .update(messages)
    .set({ content: clean, editedAt: now })
    .where(eq(messages.id, messageId))
    .returning();

  const [conv] = await db
    .select({ lastMessageId: conversations.lastMessageId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (conv?.lastMessageId === messageId) {
    await db
      .update(conversations)
      .set({ lastMessagePreview: clean.slice(0, 140), updatedAt: now })
      .where(eq(conversations.id, conversationId));
  }

  const members = await db
    .select({ userUid: conversationMembers.userUid })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));

  return {
    message: updated,
    recipientUids: members.map((m) => m.userUid).filter((u) => u !== actorUid),
  };
}

export async function deleteOwnConversationMessage(
  actorUid: string,
  conversationId: number,
  messageId: number
) {
  const [msg] = await db
    .select()
    .from(messages)
    .where(and(eq(messages.id, messageId), eq(messages.conversationId, conversationId)))
    .limit(1);
  if (!msg) throw new HttpError(404, 'Message not found.');
  if (msg.senderUid !== actorUid) {
    throw new HttpError(403, 'Forbidden: You can only delete messages you sent.');
  }

  const now = new Date();
  await db
    .update(messages)
    .set({
      isDeleted: true,
      deletedAt: now,
      content: '',
      stickerId: null,
      attachmentUrl: null,
      attachmentPosterUrl: null,
      attachmentType: null,
      attachmentMeta: null,
    })
    .where(eq(messages.id, messageId));

  if (msg.attachmentMeta?.assetId) {
    await deleteMediaAssetById(actorUid, msg.attachmentMeta.assetId);
  }

  const [conv] = await db
    .select({ lastMessageId: conversations.lastMessageId })
    .from(conversations)
    .where(eq(conversations.id, conversationId))
    .limit(1);

  if (conv?.lastMessageId === messageId) {
    await db
      .update(conversations)
      .set({ lastMessagePreview: 'Message deleted', updatedAt: now })
      .where(eq(conversations.id, conversationId));
  }

  const members = await db
    .select({ userUid: conversationMembers.userUid })
    .from(conversationMembers)
    .where(eq(conversationMembers.conversationId, conversationId));

  return {
    deleted: true,
    messageId,
    conversationId,
    recipientUids: members.map((m) => m.userUid).filter((u) => u !== actorUid),
  };
}
