import 'dotenv/config';
import crypto from 'crypto';
import express from 'express';
import http from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import { adminAuth } from './src/lib/firebase-admin.ts';
import { signServerToken } from './src/lib/serverToken.ts';
import { optionalAuth, requireAdminOrOwner, requireAuth } from './src/middleware/auth.ts';
import type { AuthRequest } from './src/middleware/auth.ts';
import {
  adminDeleteClash,
  adminDeleteGuild,
  adminResolveReport,
  adminSetUserRole,
  authenticateWithGoogleIdentity,
  broadcastOwnerAnnouncement,
  changeServerPassword,
  checkUsernameAvailability,
  createNotification,
  createVoiceRoomRecord,
  deleteAccountPermanently,
  deleteOrPinDiscussion,
  ensureOwnerAndSeedData,
  gatherUserTasteSignals,
  getAdminDashboardOverview,
  getFullUserBundle,
  getOrCreateAccount,
  getPublicProfileByUsernameOrUid,
  getVoiceRoomDetail,
  listActiveVoiceRooms,
  listBlockedUsers,
  listCommunities,
  listDiscussions,
  listNotificationsForUser,
  listUserAnimeAndGenreState,
  loginWithServerCredentials,
  markNotificationsRead,
  moderateVoiceRoom,
  recordUserSession,
  registerWithServerCredentials,
  removeUserAnimeEntry,
  removeVoiceParticipant,
  resolveLoginIdentifier,
  revokeUserSessions,
  searchExactPeopleForUnifiedSearch,
  searchUsersDirectory,
  submitContentReport,
  toggleBlockUser,
  toggleFollowUser,
  toggleReactionOnTarget,
  updateSettingsForUser,
  updateUserProfileAndUsername,
  upsertUserAnimeEntry,
  upsertUserGenreRating,
  upsertVoiceParticipant,
} from './src/db/repository.ts';
import {
  computePersonalizedRecommendations,
  getAllGenreRealms,
  getHomeDiscoveryCatalog,
} from './src/server/animeCatalog.ts';
import {
  fetchRealmsRowsBatch,
  getRealmGenreCatalogPage,
  getRealmsAnimeDetail,
  getRealmsCatalogStats,
  getRealmsHomePayload,
  listRecentlyViewedAnime,
  listReviewsForAnime,
  recordRecentlyViewedAnime,
  searchRealmsCatalog,
  warmUpRealmsCatalogInBackground,
} from './src/server/realmsCatalog.ts';
import {
  HttpError,
  createUserAnimeReview,
  deleteUserAnimeReview,
  recordQualifiedVideoView,
  recordVideoPlayStart,
  toggleSavePostForUser,
  updateUserAnimeReview,
} from './src/db/profileSystemRepo.ts';
import {
  clearSplashIntroVideo,
  getActiveSplashVideoConfig,
  handleStreamMediaAsset,
  uploadSplashIntroVideo,
  uploadValidatedMediaAsset,
} from './src/server/mediaAccess.ts';
import { searchAnimeCharacters } from './src/server/characterCatalogue.ts';
import {
  createFullClash,
  editOrCancelClash,
  getClashDetailById,
  getGlobalClashAndCommunityLeaderboard,
  listClashesPaginated,
  listEligibleDuelRewardsForActor,
  respondToClashInvitation,
  submitClashMediaEntry,
  sweepClashLifecycles,
  voteInClash,
  voteInClashRewardPoll,
} from './src/db/clashSystemRepo.ts';
import {
  addPulseCommentWithStickers,
  createPulseOrGuildPost,
  deletePulseComment,
  deletePulseOrGuildPost,
  editPulseComment,
  editPulseOrGuildPost,
  getPulsePostById,
  listPulseFeed,
  togglePulsePureRepost,
  voteOnDiscussionPoll,
} from './src/db/pulseSystemRepo.ts';
import {
  archiveOrDeleteGuildByOwner,
  createFullGuild,
  getGuildDetailWithContext,
  handleGuildMembershipAction,
  listGuildAuditLogs,
  listGuildsDiscovery,
  listPendingGuildInvitationsForUser,
  manageGuildMemberAction,
  respondToDirectGuildInvitation,
  reviewJoinRequest,
  sendDirectGuildInvitation,
  transferGuildOwnership,
  updateGuildSettings,
} from './src/db/guildSystemRepo.ts';
import {
  deleteOwnConversationMessage,
  editOwnConversationMessage,
  getConversationMessagesPaginated,
  listInboxConversationsForViewer,
  markMessageDeliveredByRecipient,
  respondToConversationRequest,
  sendRichMessageInConversation,
  startOrOpenConversation,
  updateConversationPreferences,
} from './src/db/inboxSystemRepo.ts';
import {
  createStandaloneVoiceRoom,
  deleteVoiceRoomMessage,
  getVoiceRoomFullDetail,
  joinVoiceRoomSession,
  leaveVoiceRoomSession,
  listStandaloneVoiceRooms,
  listVoiceRoomMessages,
  moderateVoiceRoomParticipant,
  requestToSpeakInVoiceRoom,
  respondToVoiceSpeakRequest,
  sendVoiceRoomMessage,
  stepDownVoiceSpeakerToAudience,
  switchVoiceRoomMediaMode,
  toggleVoiceRoomCamera,
  toggleVoiceRoomMessageReaction,
  toggleVoiceRoomMute,
  updateVoiceRoomSettings,
} from './src/db/voiceSystemRepo.ts';
import {
  createCommunityChatRoom,
  createCommunityEvent,
  deleteCommunityChatMessage,
  deleteCommunityChatRoom,
  listCommunityChatMessages,
  listCommunityChatRooms,
  listCommunityEvents,
  sendCommunityChatMessage,
  toggleCommunityChatReaction,
  toggleCommunityEventRsvp,
} from './src/db/communityChatRepo.ts';
import { realtimeHub } from './src/server/wsHub.ts';
import { renderDemoAvatarSvg, renderDemoBannerSvg } from './src/server/demoAvatarRenderer.ts';
import {
  ensureAiCommunitySeededOnStartup,
  getAiCommunityAdminOverview,
  listProfileConnectionsPaginated,
  triggerAiCommunitySeedingJob,
  updateAiCommunityConfigAndSync,
  upgradeCommunityRealismAndEngagement,
} from './src/db/aiCommunityRepo.ts';
import {
  getChapterPagesForReader,
  getMangaDetailById,
  getMangaRelationsForAnime,
  isAllowedInkverseProxyHost,
  searchMangaCatalog,
  syncTrendingMangaCatalog,
} from './src/server/inkverseCatalog.ts';
import {
  adminListInkverseModeration,
  adminUpdateInkverseModeration,
  createCreatorMangaSeries,
  createMangaReview,
  deleteCreatorMangaOrChapter,
  deleteMangaReview,
  getInkverseDashboard,
  getInkverseSearchSuggestions,
  getUserMangaEntry,
  getUserMangaLibraryList,
  incrementMangaReadCount,
  listCreatorUploadedManga,
  listMangaBookmarks,
  listMangaReviews,
  removeUserMangaEntry,
  toggleMangaPageBookmark,
  uploadCreatorMangaChapter,
  upsertMangaReadingProgress,
  upsertUserMangaEntry,
} from './src/db/inkverseRepo.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const rateLimitBuckets = new Map<string, { count: number; resetAt: number }>();
function checkRateLimit(bucketKey: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  if (rateLimitBuckets.size > 5000) {
    for (const [k, v] of rateLimitBuckets.entries()) {
      if (v.resetAt <= now) rateLimitBuckets.delete(k);
    }
  }
  const cur = rateLimitBuckets.get(bucketKey);
  if (!cur || cur.resetAt <= now) {
    rateLimitBuckets.set(bucketKey, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (cur.count >= maxRequests) return false;
  cur.count += 1;
  return true;
}

function sendRouteError(res: express.Response, err: any, fallbackMessage: string, defaultStatus = 400) {
  const status =
    err instanceof HttpError
      ? err.status
      : typeof err?.status === 'number'
        ? err.status
        : err?.message?.startsWith('Forbidden')
          ? 403
          : defaultStatus;
  res.status(status).json({ error: err?.message || fallbackMessage });
}

async function bootstrapDatabaseInBackground() {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await ensureOwnerAndSeedData();
      await ensureAiCommunitySeededOnStartup();
      warmUpRealmsCatalogInBackground().catch(() => {});
      syncTrendingMangaCatalog().catch(() => {});
      return;
    } catch (err: any) {
      const waitMs = Math.min(12000, attempt * 2500);
      console.warn(
        `[KAGE Startup] Database bootstrap attempt ${attempt}/${maxAttempts} deferred (${err?.message || err}); retrying in ${waitMs}ms...`
      );
      await new Promise((r) => setTimeout(r, waitMs));
    }
  }
}

async function startServer() {
  const app = express();
  const server = http.createServer(app);

  // Background Clash lifecycle sweep (activates scheduled clashes, expires overdue invites/entries, finalizes completed duels)
  const clashSweepTimer = setInterval(() => {
    sweepClashLifecycles().catch((e) => console.warn('Clash sweep warning:', e));
  }, 30_000);
  clashSweepTimer.unref?.();

  // Attach real-time WebSocket & WebRTC signaling hub on /ws
  realtimeHub.attach(server);

  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (
      origin &&
      (origin.endsWith('.github.io') ||
        origin.includes('localhost') ||
        origin.includes('127.0.0.1') ||
        origin.endsWith('.run.app'))
    ) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '48mb' }));

  // Fast health probe (never blocks on cold database wake-up)
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'kage-anime-universe', ts: Date.now() });
  });

  // Procedural original anime-inspired SVG avatars & banners for 10,000 AI demo personas
  app.get('/api/demo-avatar/:seed', (req, res) => {
    const rendered = renderDemoAvatarSvg(req.params.seed);
    if (req.headers['if-none-match'] === rendered.etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('ETag', rendered.etag);
    res.send(rendered.svg);
  });

  app.get('/api/demo-banner/:seed', (req, res) => {
    const rendered = renderDemoBannerSvg(req.params.seed);
    if (req.headers['if-none-match'] === rendered.etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Type', 'image/svg+xml; charset=utf-8');
    res.setHeader('Cache-Control', 'public, max-age=604800, immutable');
    res.setHeader('ETag', rendered.etag);
    res.send(rendered.svg);
  });

  // --- AUTHORIZED SPLASH INTRO VIDEO CONFIGURATION & STREAMING ---
  app.get('/api/splash-config', async (_req, res) => {
    try {
      const config = await getActiveSplashVideoConfig();
      res.setHeader('Cache-Control', 'no-cache');
      res.json({ splash: config });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load splash video configuration.', 500);
    }
  });

  app.post('/api/splash-config/upload', requireAdminOrOwner, async (req: AuthRequest, res) => {
    try {
      const { dataUrl, durationSec, width, height } = req.body || {};
      const config = await uploadSplashIntroVideo(req.user!.uid, {
        dataUrl: String(dataUrl || ''),
        durationSec: durationSec ? Number(durationSec) : null,
        width: width ? Number(width) : null,
        height: height ? Number(height) : null,
      });
      res.status(201).json({ splash: config });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to upload authorized splash video.');
    }
  });

  app.delete('/api/splash-config', requireAdminOrOwner, async (_req: AuthRequest, res) => {
    try {
      const config = await clearSplashIntroVideo();
      res.json({ splash: config });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to clear splash video.');
    }
  });

  // --- MEDIA STREAMING, UPLOAD & CHARACTER CATALOGUE ---
  app.get('/api/media/:id', optionalAuth, async (req: AuthRequest, res) => {
    try {
      await handleStreamMediaAsset(req, res);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to stream media.', 500);
    }
  });

  app.post('/api/media/upload', requireAuth, async (req: AuthRequest, res) => {
    const uid = req.user!.uid;
    if (!checkRateLimit(`upload:${uid}`, 30, 60_000)) {
      res.status(429).json({ error: 'Too many uploads. Please wait a moment and try again.' });
      return;
    }
    try {
      const {
        dataUrl,
        mediaType,
        purpose,
        visibility,
        conversationId,
        communityId,
        clashId,
        durationSec,
        width,
        height,
      } = req.body || {};
      const uploaded = await uploadValidatedMediaAsset(uid, {
        dataUrl: String(dataUrl || ''),
        mediaType: mediaType === 'video' ? 'video' : mediaType === 'avatar' ? 'avatar' : 'image',
        purpose: purpose || 'post_image',
        visibility: visibility || 'public',
        conversationId: conversationId ? Number(conversationId) : null,
        communityId: communityId ? Number(communityId) : null,
        clashId: clashId ? Number(clashId) : null,
        durationSec: durationSec ? Number(durationSec) : null,
        clientWidth: width ? Number(width) : null,
        clientHeight: height ? Number(height) : null,
      });
      res.status(201).json({ media: uploaded });
    } catch (err: any) {
      sendRouteError(res, err, 'Media upload failed.');
    }
  });

  app.get('/api/characters', optionalAuth, async (req, res) => {
    try {
      const q = String(req.query.q || '');
      const items = await searchAnimeCharacters(q);
      res.json({ items });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to search character catalogue.', 500);
    }
  });

  app.get('/api/users/search', requireAuth, async (req: AuthRequest, res) => {
    try {
      const q = String(req.query.q || '');
      const items = await searchUsersDirectory(q, req.user!.uid);
      const onlineSet = new Set(realtimeHub.getOnlineUserUids());
      const mapped = items.map((u) => ({ ...u, isOnline: onlineSet.has(u.uid) }));
      res.json({
        items: mapped,
        users: mapped,
      });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to search hunters.', 500);
    }
  });

  // --- HEALTH ---
  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok' });
  });

  // --- AUTH & SESSIONS ---
  app.post('/api/auth/check-username', async (req, res) => {
    try {
      const username = String(req.body?.username || '');
      const result = await checkUsernameAvailability(username);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Could not verify username.' });
    }
  });

  app.post('/api/auth/resolve-identifier', async (req, res) => {
    try {
      const identifier = String(req.body?.identifier || '');
      if (!identifier.trim()) {
        res.status(400).json({ error: 'Enter your email or username.' });
        return;
      }
      const email = await resolveLoginIdentifier(identifier);
      if (!email) {
        res.status(404).json({ error: 'No KAGE account found with that username.' });
        return;
      }
      res.json({ email });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to resolve identifier.' });
    }
  });

  app.post('/api/auth/server-login', async (req, res) => {
    try {
      const identifier = String(req.body?.identifier || '');
      const password = String(req.body?.password || '');
      const result = await loginWithServerCredentials({
        identifier,
        password,
        userAgent: String(req.headers['user-agent'] || ''),
      });
      res.json(result);
    } catch (err: any) {
      res.status(401).json({ error: err.message || 'Invalid credentials.' });
    }
  });

  app.post('/api/auth/server-signup', async (req, res) => {
    try {
      const name = String(req.body?.name || req.body?.displayName || '');
      const username = String(req.body?.username || '');
      const email = String(req.body?.email || '');
      const password = String(req.body?.password || '');
      const favouriteCharacter = req.body?.favouriteCharacter
        ? String(req.body.favouriteCharacter)
        : undefined;
      const result = await registerWithServerCredentials({
        name,
        displayName: name,
        username,
        email,
        password,
        favouriteCharacter,
        userAgent: String(req.headers['user-agent'] || ''),
      });
      res.status(201).json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Sign-up failed.' });
    }
  });

  app.post('/api/auth/change-password', requireAuth, async (req: AuthRequest, res) => {
    try {
      const currentPassword = String(req.body?.currentPassword || '');
      const newPassword = String(req.body?.newPassword || '');
      const result = await changeServerPassword(req.user!.uid, currentPassword, newPassword);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Password update failed.' });
    }
  });

  app.post('/api/auth/google', async (req, res) => {
    try {
      const googleAccessToken = String(req.body?.googleAccessToken || '').trim();
      const googleIdToken = String(req.body?.googleIdToken || '').trim();
      const firebaseIdToken = String(req.body?.firebaseIdToken || '').trim();
      const preferredUsername = req.body?.username
        ? String(req.body.username).trim()
        : undefined;
      const clientDisplayName = req.body?.displayName
        ? String(req.body.displayName).trim()
        : undefined;

      let verifiedSub = '';
      let verifiedEmail = '';
      let verifiedName = clientDisplayName;
      let verifiedPicture: string | undefined;
      let verifiedEmailFlag = true;

      if (googleAccessToken) {
        const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${googleAccessToken}` },
        });
        if (!userInfoRes.ok) {
          res.status(401).json({ error: 'Invalid or expired Google OAuth token.' });
          return;
        }
        const info = (await userInfoRes.json()) as {
          sub?: string;
          email?: string;
          email_verified?: boolean;
          name?: string;
          picture?: string;
        };
        if (!info.sub || !info.email) {
          res.status(401).json({ error: 'Google profile is missing required email identity.' });
          return;
        }
        verifiedSub = info.sub;
        verifiedEmail = info.email;
        verifiedName = verifiedName || info.name;
        verifiedPicture = info.picture;
        verifiedEmailFlag = info.email_verified !== false;
      } else if (googleIdToken) {
        const tokenInfoRes = await fetch(
          `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(googleIdToken)}`
        );
        if (!tokenInfoRes.ok) {
          res.status(401).json({ error: 'Invalid or expired Google ID token.' });
          return;
        }
        const info = (await tokenInfoRes.json()) as {
          sub?: string;
          email?: string;
          email_verified?: string | boolean;
          name?: string;
          picture?: string;
          aud?: string;
        };
        const expectedProjectPrefix = `${firebaseConfig.messagingSenderId || ''}-`;
        if (
          info.aud &&
          firebaseConfig.oAuthClientId &&
          info.aud !== firebaseConfig.oAuthClientId &&
          (!expectedProjectPrefix || !info.aud.startsWith(expectedProjectPrefix))
        ) {
          res.status(401).json({ error: 'Google ID token audience mismatch.' });
          return;
        }
        if (!info.sub || !info.email) {
          res.status(401).json({ error: 'Google ID token is missing email identity.' });
          return;
        }
        verifiedSub = info.sub;
        verifiedEmail = info.email;
        verifiedName = verifiedName || info.name;
        verifiedPicture = info.picture;
        verifiedEmailFlag = info.email_verified !== 'false' && info.email_verified !== false;
      } else if (firebaseIdToken) {
        const decoded = await adminAuth.verifyIdToken(firebaseIdToken);
        if (!decoded.uid || !decoded.email) {
          res.status(401).json({ error: 'Firebase token is missing email identity.' });
          return;
        }
        verifiedSub = decoded.uid;
        verifiedEmail = decoded.email;
        verifiedName = verifiedName || decoded.name;
        verifiedPicture = decoded.picture;
        verifiedEmailFlag = Boolean(decoded.email_verified);
      } else {
        res.status(400).json({ error: 'Google authentication token is required.' });
        return;
      }

      const result = await authenticateWithGoogleIdentity({
        googleSub: verifiedSub,
        email: verifiedEmail,
        displayName: verifiedName,
        avatarUrl: verifiedPicture,
        emailVerified: verifiedEmailFlag,
        preferredUsername,
        userAgent: String(req.headers['user-agent'] || ''),
      });

      res.json(result);
    } catch (err: any) {
      res.status(401).json({ error: err.message || 'Google sign-in failed.' });
    }
  });

  app.post('/api/auth/sync', requireAuth, async (req: AuthRequest, res) => {
    try {
      const decoded = req.user!;
      const preferredUsername = req.body?.username
        ? String(req.body.username).trim()
        : undefined;
      const displayName = req.body?.displayName
        ? String(req.body.displayName).trim()
        : decoded.name || undefined;

      if (preferredUsername) {
        const check = await checkUsernameAvailability(preferredUsername, decoded.uid);
        if (!check.available) {
          res.status(400).json({ error: check.reason });
          return;
        }
      }

      const bundle = await getOrCreateAccount({
        uid: decoded.uid,
        email: decoded.email || `${decoded.uid}@kage.local`,
        preferredUsername,
        displayName,
        avatarUrl: decoded.picture || undefined,
        emailVerified: Boolean(decoded.email_verified),
      });

      if (!bundle) {
        res.status(500).json({ error: 'Account sync failed.' });
        return;
      }

      const sessionId =
        decoded.sid ||
        `${bundle.user.uid}:${Date.now()}:${crypto.randomBytes(6).toString('hex')}`;
      await recordUserSession(
        bundle.user.uid,
        sessionId,
        String(req.headers['user-agent'] || '')
      );

      const token = signServerToken({
        uid: bundle.user.uid,
        email: bundle.user.email,
        name: bundle.profile?.displayName || bundle.user.username,
        picture: bundle.profile?.avatarUrl,
        email_verified: bundle.user.emailVerified,
        role: bundle.user.role,
        sid: sessionId,
      });

      res.json({ token, ...bundle });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Account sync failed.' });
    }
  });

  app.post('/api/auth/logout', requireAuth, async (req: AuthRequest, res) => {
    try {
      await revokeUserSessions(req.user!.uid);
      try {
        await adminAuth.revokeRefreshTokens(req.user!.uid);
      } catch {
        // Ignore if admin token revocation is restricted in dev sandbox
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Logout failed.' });
    }
  });

  app.get('/api/me', requireAuth, async (req: AuthRequest, res) => {
    try {
      const existing = await getFullUserBundle(req.user!.uid);
      if (existing) {
        res.json(existing);
        return;
      }
      const created = await getOrCreateAccount({
        uid: req.user!.uid,
        email: req.user!.email || `${req.user!.uid}@kage.local`,
        displayName: req.user!.name || undefined,
        avatarUrl: req.user!.picture || undefined,
        emailVerified: Boolean(req.user!.email_verified),
      });
      res.json(created);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load session.' });
    }
  });

  // --- KAGE REALMS DISCOVERY PLATFORM ENDPOINTS ---
  app.get('/api/realms/home', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const [realmsData, highlights, topGuilds, recentlyViewed] = await Promise.all([
        getRealmsHomePayload(),
        listDiscussions({ sort: 'popular', limit: 4, viewerUid: req.user?.uid }),
        listCommunities({ sort: 'popular', viewerUid: req.user?.uid }),
        req.user?.uid ? listRecentlyViewedAnime(req.user.uid, 12) : Promise.resolve([]),
      ]);
      res.json({
        ...realmsData,
        recentlyViewed,
        communityHighlights: highlights,
        featuredGuilds: topGuilds.slice(0, 3),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load Realms feed.' });
    }
  });

  app.get('/api/realms/rows', optionalAuth, async (req, res) => {
    try {
      const rawSlugs = String(req.query.slugs || '')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      const perPage = req.query.perPage ? Number(req.query.perPage) : 16;
      const homepageMode =
        req.query.homepage === '1' ||
        req.query.homepage === 'true';
      const excludeIdsRaw = String(req.query.excludeIds || '')
        .split(',')
        .map((id) => Number(id.trim()))
        .filter((id) => Number.isFinite(id) && id > 0);
      const excludeIds =
        excludeIdsRaw.length > 0 ? new Set<number>(excludeIdsRaw) : undefined;

      const rowsMap = await fetchRealmsRowsBatch(rawSlugs, perPage, {
        homepageMode,
        excludeIds,
      });
      const rows = rawSlugs
        .map((slug) => rowsMap[slug] || Object.values(rowsMap).find((r) => r.definition.slug === slug))
        .filter(Boolean);
      res.json({ rows });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load Realms carousel rows.' });
    }
  });

  app.get('/api/realms/genre/:slug', optionalAuth, async (req, res) => {
    try {
      const result = await getRealmGenreCatalogPage({
        slugOrName: req.params.slug,
        page: req.query.page ? Number(req.query.page) : 1,
        perPage: req.query.perPage ? Number(req.query.perPage) : 24,
        sort: req.query.sort ? String(req.query.sort) : 'popularity',
        year: req.query.year ? Number(req.query.year) : undefined,
        format: req.query.format ? String(req.query.format) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        minScore: req.query.minScore ? Number(req.query.minScore) : undefined,
        tag: req.query.tag ? String(req.query.tag) : undefined,
      });

      if (!result) {
        res.status(404).json({ error: `Genre or collection "${req.params.slug}" was not found.` });
        return;
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load genre catalog.' });
    }
  });

  app.get('/api/realms/search', optionalAuth, async (req, res) => {
    try {
      const result = await searchRealmsCatalog({
        q: req.query.q ? String(req.query.q) : '',
        genre: req.query.genre ? String(req.query.genre) : '',
        year: req.query.year ? Number(req.query.year) : undefined,
        format: req.query.format ? String(req.query.format) : undefined,
        status: req.query.status ? String(req.query.status) : undefined,
        minScore: req.query.minScore ? Number(req.query.minScore) : undefined,
        sort: req.query.sort ? String(req.query.sort) : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        perPage: req.query.perPage ? Number(req.query.perPage) : 24,
      });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Realms search failed.' });
    }
  });

  app.get('/api/realms/stats', optionalAuth, async (_req, res) => {
    try {
      const stats = await getRealmsCatalogStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to compute catalog stats.' });
    }
  });

  app.get('/api/me/recently-viewed', requireAuth, async (req: AuthRequest, res) => {
    try {
      const items = await listRecentlyViewedAnime(req.user!.uid, 20);
      res.json({ items });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load recently viewed anime.' });
    }
  });

  // --- ANIME DISCOVERY & DYNAMIC RECOMMENDATION ENGINE (LEGACY + COMPAT) ---
  app.get('/api/anime/home', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const [catalog, highlights, topGuilds] = await Promise.all([
        getHomeDiscoveryCatalog(),
        listDiscussions({ sort: 'popular', limit: 4, viewerUid: req.user?.uid }),
        listCommunities({ sort: 'popular', viewerUid: req.user?.uid }),
      ]);
      res.json({
        ...catalog,
        communityHighlights: highlights,
        featuredGuilds: topGuilds.slice(0, 3),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load discovery feed.' });
    }
  });

  app.get('/api/anime/genres', optionalAuth, async (_req, res) => {
    try {
      const [genres, stats] = await Promise.all([getAllGenreRealms(), getRealmsCatalogStats()]);
      const dbCountBySlug = new Map<string, number>();
      for (const row of stats.perGenreDbCounts) {
        dbCountBySlug.set(row.slug, row.count);
      }
      const items = genres.map((g) => ({
        ...g,
        animeCount: dbCountBySlug.get(g.slug) || 0,
      }));
      res.json({ genres: items, items });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load anime genres.' });
    }
  });

  app.get('/api/anime/search', optionalAuth, async (req, res) => {
    try {
      const filter = String(req.query.filter || '').trim();
      const result = await searchRealmsCatalog({
        q: String(req.query.q || ''),
        genre: String(req.query.genre || ''),
        status: filter === 'upcoming' ? 'NOT_YET_RELEASED' : undefined,
        year: req.query.year ? Number(req.query.year) : undefined,
        format: req.query.format ? String(req.query.format) : undefined,
        page: req.query.page ? Number(req.query.page) : 1,
        perPage: req.query.perPage ? Number(req.query.perPage) : 24,
      });
      res.json({
        items: result.items.map((item) => ({ ...item, malId: item.canonicalId })),
        pageInfo: result.pageInfo,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Anime search failed.' });
    }
  });

  app.get('/api/anime/:malId', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const rawParam = String(req.params.malId || '').trim();
      const parsedId = rawParam.startsWith('al-')
        ? 10_000_000 + Number(rawParam.slice(3))
        : Number(rawParam);

      if (Number.isNaN(parsedId) || parsedId <= 0) {
        res.status(400).json({ error: 'Invalid anime ID.' });
        return;
      }

      const [detail, animeDiscussions, relatedGuilds, viewerState, reviewBundle] =
        await Promise.all([
          getRealmsAnimeDetail(parsedId),
          listDiscussions({ animeMalId: parsedId, limit: 20, viewerUid: req.user?.uid }),
          listCommunities({ animeMalId: parsedId, viewerUid: req.user?.uid }),
          req.user?.uid ? listUserAnimeAndGenreState(req.user.uid) : Promise.resolve(null),
          listReviewsForAnime(parsedId, req.user?.uid),
        ]);

      if (!detail) {
        res.status(404).json({ error: 'Anime not found.' });
        return;
      }

      const canonicalId = detail.anime.canonicalId;
      if (req.user?.uid) {
        recordRecentlyViewedAnime(req.user.uid, detail.anime).catch(() => {});
      }

      const mangaRelations = await getMangaRelationsForAnime(
        canonicalId,
        detail.anime.malId,
        detail.anime.title
      ).catch(() => []);

      const viewerEntry =
        viewerState?.entries.find(
          (e) =>
            e.animeMalId === canonicalId ||
            (detail.anime.malId && e.animeMalId === detail.anime.malId)
        ) || null;

      res.json({
        ...detail,
        anime: {
          ...detail.anime,
          malId: canonicalId,
          rawMalId: detail.anime.malId,
        },
        discussions: animeDiscussions,
        guilds: relatedGuilds,
        reviews: reviewBundle.reviews,
        kageReviewCount: reviewBundle.kageReviewCount,
        kageAverageScore: reviewBundle.kageAverageScore,
        mangaRelations,
        viewerEntry,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load anime details.' });
    }
  });

  app.get('/api/anime/:malId/manga', optionalAuth, async (req, res) => {
    try {
      const rawParam = String(req.params.malId || '').trim();
      const parsedId = rawParam.startsWith('al-')
        ? 10_000_000 + Number(rawParam.slice(3))
        : Number(rawParam);
      if (Number.isNaN(parsedId) || parsedId <= 0) {
        res.status(400).json({ error: 'Invalid anime ID.' });
        return;
      }
      const relations = await getMangaRelationsForAnime(parsedId, parsedId);
      res.json({ items: relations });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load related manga.', 500);
    }
  });

  app.get('/api/anime/:malId/reviews', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.malId);
      if (Number.isNaN(id)) {
        res.status(400).json({ error: 'Invalid anime ID.' });
        return;
      }
      const bundle = await listReviewsForAnime(id, req.user?.uid);
      res.json(bundle);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load reviews.' });
    }
  });

  app.post('/api/anime/:malId/reviews', requireAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.malId);
      const created = await createUserAnimeReview(req.user!.uid, {
        animeMalId: id,
        animeTitle: String(req.body?.animeTitle || ''),
        animeImageUrl: req.body?.animeImageUrl ? String(req.body.animeImageUrl) : undefined,
        rating: req.body?.rating !== undefined ? req.body.rating : null,
        title: req.body?.title ? String(req.body.title) : undefined,
        content: String(req.body?.content || ''),
        containsSpoilers: Boolean(req.body?.containsSpoilers),
      });
      res.status(201).json({ review: created });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message || 'Failed to publish review.' });
    }
  });

  app.put('/api/reviews/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const updated = await updateUserAnimeReview(
        req.user!.uid,
        Number(req.params.id),
        req.body || {}
      );
      res.json({ review: updated });
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message || 'Failed to update review.' });
    }
  });

  app.delete('/api/reviews/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await deleteUserAnimeReview(req.user!.uid, Number(req.params.id));
      res.json(result);
    } catch (err: any) {
      res.status(err.status || 400).json({ error: err.message || 'Failed to delete review.' });
    }
  });

  app.get('/api/recommendations', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const targetUid = String(req.query.uid || req.user?.uid || '');
      if (!targetUid) {
        const result = await computePersonalizedRecommendations({
          animeEntries: [],
          genreRatings: [],
          favoriteGenres: [],
          joinedGuilds: [],
          authoredPosts: [],
          interactedGenres: [],
        });
        res.json(result);
        return;
      }
      const signals = await gatherUserTasteSignals(targetUid);
      const result = await computePersonalizedRecommendations(signals);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to compute recommendations.' });
    }
  });

  app.get('/api/me/taste', requireAuth, async (req: AuthRequest, res) => {
    try {
      const state = await listUserAnimeAndGenreState(req.user!.uid);
      res.json(state);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load taste profile.' });
    }
  });

  app.post('/api/me/anime', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { animeMalId, animeTitle, animeImageUrl, genres, status, score, episodesWatched } =
        req.body || {};
      if (!animeMalId || !animeTitle) {
        res.status(400).json({ error: 'Anime ID and title are required.' });
        return;
      }
      const entry = await upsertUserAnimeEntry(req.user!.uid, {
        animeMalId: Number(animeMalId),
        animeTitle: String(animeTitle),
        animeImageUrl: String(animeImageUrl || 'asset:shadow_monarch'),
        genres: Array.isArray(genres) ? genres : [],
        status: String(status || 'plan_to_watch'),
        score: score !== undefined && score !== null ? Number(score) : null,
        episodesWatched: Number(episodesWatched || 0),
      });
      res.json({ entry });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to save anime entry.' });
    }
  });

  app.delete('/api/me/anime/:malId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await removeUserAnimeEntry(req.user!.uid, Number(req.params.malId));
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to remove anime entry.' });
    }
  });

  app.post('/api/me/genre-rating', requireAuth, async (req: AuthRequest, res) => {
    try {
      const genre = String(req.body?.genre || '').trim();
      const rating = Number(req.body?.rating);
      if (!genre || Number.isNaN(rating)) {
        res.status(400).json({ error: 'Valid genre and rating (1-10) are required.' });
        return;
      }
      const saved = await upsertUserGenreRating(req.user!.uid, genre, rating);
      res.json({ genreRating: saved });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to rate genre.' });
    }
  });

  // --- PROFILES & SOCIAL ---
  app.get('/api/profiles/:identifier', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const data = await getPublicProfileByUsernameOrUid(
        req.params.identifier,
        req.user?.uid
      );
      if (!data) {
        res.status(404).json({ error: 'Profile not found.' });
        return;
      }
      res.json({
        ...data,
        isOnline: realtimeHub.getOnlineUserUids().includes(data.user.uid),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load profile.' });
    }
  });

  app.get('/api/profiles/:identifier/connections', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const type = req.query.type === 'following' ? 'following' : 'followers';
      const result = await listProfileConnectionsPaginated({
        identifier: req.params.identifier,
        type,
        q: req.query.q ? String(req.query.q) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 30,
        offset: req.query.offset ? Number(req.query.offset) : 0,
        viewerUid: req.user?.uid,
      });
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load profile connections.', 500);
    }
  });

  app.put('/api/me/profile', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { avatarUrl } = req.body || {};
      if (typeof avatarUrl === 'string' && avatarUrl.startsWith('data:image/')) {
        if (avatarUrl.length > 2_500_000) {
          res.status(400).json({ error: 'Avatar image must be under 1.8 MB.' });
          return;
        }
      }
      const updated = await updateUserProfileAndUsername(req.user!.uid, req.body || {});
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to update profile.' });
    }
  });

  app.post('/api/users/:targetUid/follow', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await toggleFollowUser(req.user!.uid, req.params.targetUid);
      realtimeHub.sendToUser(req.params.targetUid, { type: 'notification:new' });
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Follow action failed.' });
    }
  });

  app.post('/api/users/:targetUid/block', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await toggleBlockUser(req.user!.uid, req.params.targetUid);
      res.json(result);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Block action failed.' });
    }
  });

  app.get('/api/me/blocked', requireAuth, async (req: AuthRequest, res) => {
    try {
      const list = await listBlockedUsers(req.user!.uid);
      res.json({ blocked: list });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load blocked users.' });
    }
  });

  // --- COMMUNITIES / GUILDS ---
  app.get('/api/communities', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const result = await listGuildsDiscovery({
        q: String(req.query.q || ''),
        category: req.query.category ? String(req.query.category) : undefined,
        genre: req.query.genre ? String(req.query.genre) : undefined,
        privacyMode: req.query.privacyMode ? String(req.query.privacyMode) : undefined,
        joinedOnly: req.query.joined === 'true' || req.query.joined === '1',
        sort: String(req.query.sort || 'popular'),
        animeMalId: req.query.animeMalId ? Number(req.query.animeMalId) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 30,
        offset: req.query.offset ? Number(req.query.offset) : 0,
        viewerUid: req.user?.uid,
      });
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load guilds.', 500);
    }
  });

  app.post('/api/communities', requireAuth, async (req: AuthRequest, res) => {
    if (!checkRateLimit(`guild:create:${req.user!.uid}`, 10, 60_000)) {
      res.status(429).json({ error: 'Slow down before creating another guild.' });
      return;
    }
    try {
      const created = await createFullGuild(req.user!.uid, req.body || {});
      res.status(201).json({ community: created });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to forge guild.');
    }
  });

  app.get('/api/me/guild-invites', requireAuth, async (req: AuthRequest, res) => {
    try {
      const invites = await listPendingGuildInvitationsForUser(req.user!.uid);
      res.json({ invites });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load guild invitations.', 500);
    }
  });

  app.post('/api/guild-invites/:inviteId/respond', requireAuth, async (req: AuthRequest, res) => {
    try {
      const action =
        req.body?.action === 'decline'
          ? 'decline'
          : req.body?.action === 'revoke'
            ? 'revoke'
            : 'accept';
      const result = await respondToDirectGuildInvitation(
        req.user!.uid,
        Number(req.params.inviteId),
        action
      );
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to respond to guild invitation.');
    }
  });

  app.get('/api/communities/:slugOrId', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const guild = await getGuildDetailWithContext(req.params.slugOrId, req.user?.uid);
      if (!guild) {
        res.status(404).json({ error: 'Guild not found.' });
        return;
      }
      let discussionsList: any[] = [];
      let discussionsHasMore = false;
      if (guild.canViewContent) {
        const feed = await listPulseFeed({
          communityId: guild.id,
          sort: String(req.query.sort || 'newest'),
          limit: req.query.limit ? Number(req.query.limit) : 25,
          offset: req.query.offset ? Number(req.query.offset) : 0,
          viewerUid: req.user?.uid,
        });
        discussionsList = feed.items;
        discussionsHasMore = feed.hasMore;
      }

      const memberUids = Array.isArray(guild.members) ? guild.members.map((m: any) => m.uid) : [];
      const onlineSet = new Set(realtimeHub.getOnlineUserUids());
      const onlineCount = realtimeHub.getCommunityOnlineCount(guild.id, memberUids);
      const hydratedChatRooms = Array.isArray(guild.chatRooms)
        ? guild.chatRooms.map((rm: any) => ({
            ...rm,
            onlineCount: realtimeHub.getChatRoomOnlineCount(guild.id, rm.slug),
          }))
        : [];
      const hydratedMembers = Array.isArray(guild.members)
        ? guild.members.map((m: any) => ({
            ...m,
            isOnline: onlineSet.has(m.uid),
          }))
        : [];

      res.json({
        guild: {
          ...guild,
          onlineCount,
          chatRooms: hydratedChatRooms,
          members: hydratedMembers,
        },
        discussions: discussionsList,
        discussionsHasMore,
      });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load guild.', 500);
    }
  });

  app.put('/api/communities/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const updated = await updateGuildSettings(req.user!.uid, Number(req.params.id), req.body || {});
      res.json({ guild: updated });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to update guild settings.');
    }
  });

  app.post('/api/communities/:id/archive', requireAuth, async (req: AuthRequest, res) => {
    try {
      const action =
        req.body?.action === 'delete'
          ? 'delete'
          : req.body?.action === 'unarchive'
            ? 'unarchive'
            : 'archive';
      const result = await archiveOrDeleteGuildByOwner(req.user!.uid, Number(req.params.id), action);
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to update guild archive status.');
    }
  });

  app.post('/api/communities/:id/membership', requireAuth, async (req: AuthRequest, res) => {
    try {
      const communityId = Number(req.params.id);
      const action =
        req.body?.action === 'leave'
          ? 'leave'
          : req.body?.action === 'cancel_request'
            ? 'cancel_request'
            : 'join';
      const result = await handleGuildMembershipAction(communityId, req.user!.uid, {
        action,
        note: req.body?.note,
      });
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Guild membership action failed.');
    }
  });

  app.post(
    '/api/communities/:id/requests/:requestId',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const decision = req.body?.decision === 'reject' ? 'reject' : 'approve';
        const result = await reviewJoinRequest(
          req.user!.uid,
          Number(req.params.id),
          Number(req.params.requestId),
          decision
        );
        res.json(result);
      } catch (err: any) {
        sendRouteError(res, err, 'Failed to review join request.');
      }
    }
  );

  app.post('/api/communities/:id/invites', requireAuth, async (req: AuthRequest, res) => {
    try {
      const invite = await sendDirectGuildInvitation(
        req.user!.uid,
        Number(req.params.id),
        req.body || {}
      );
      if (invite?.inviteeUid) {
        realtimeHub.sendToUser(invite.inviteeUid, { type: 'notification:new' });
      }
      res.status(201).json({ invite });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to send guild invitation.');
    }
  });

  app.post('/api/communities/:id/members/manage', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await manageGuildMemberAction(
        req.user!.uid,
        Number(req.params.id),
        req.body || {}
      );
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Guild member action failed.');
    }
  });

  app.post(
    '/api/communities/:id/transfer-ownership',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const newOwnerUid = String(req.body?.newOwnerUid || '');
        const result = await transferGuildOwnership(
          req.user!.uid,
          Number(req.params.id),
          newOwnerUid
        );
        if (newOwnerUid) {
          realtimeHub.sendToUser(newOwnerUid, { type: 'notification:new' });
        }
        res.json(result);
      } catch (err: any) {
        sendRouteError(res, err, 'Failed to transfer guild ownership.');
      }
    }
  );

  app.get('/api/communities/:id/audit-logs', requireAuth, async (req: AuthRequest, res) => {
    try {
      const logs = await listGuildAuditLogs(req.user!.uid, Number(req.params.id));
      res.json({ logs });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load moderation logs.');
    }
  });

  // --- COMMUNITY REAL-TIME CHAT ROOMS & EVENTS ---
  app.get('/api/communities/:id/chat-rooms', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const cid = Number(req.params.id);
      const rooms = await listCommunityChatRooms(cid, req.user?.uid);
      res.json({
        rooms: rooms.map((r) => ({
          ...r,
          onlineCount: realtimeHub.getChatRoomOnlineCount(cid, r.slug),
        })),
      });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load community chat rooms.');
    }
  });

  app.post('/api/communities/:id/chat-rooms', requireAuth, async (req: AuthRequest, res) => {
    try {
      const cid = Number(req.params.id);
      const room = await createCommunityChatRoom(req.user!.uid, cid, req.body || {});
      res.status(201).json({ room: { ...room, onlineCount: 0, messageCount: 0 } });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to create chat room.');
    }
  });

  app.delete('/api/communities/:id/chat-rooms/:roomId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await deleteCommunityChatRoom(
        req.user!.uid,
        Number(req.params.id),
        Number(req.params.roomId)
      );
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to archive chat room.');
    }
  });

  app.get(
    '/api/communities/:id/chat-rooms/:roomSlug/messages',
    optionalAuth,
    async (req: AuthRequest, res) => {
      try {
        const cid = Number(req.params.id);
        const roomSlug = String(req.params.roomSlug || '');
        const bundle = await listCommunityChatMessages(
          cid,
          roomSlug,
          req.user?.uid,
          req.query.limit ? Number(req.query.limit) : 80
        );
        res.json({
          ...bundle,
          onlineCount: realtimeHub.getChatRoomOnlineCount(cid, roomSlug),
        });
      } catch (err: any) {
        sendRouteError(res, err, 'Failed to load chat room messages.');
      }
    }
  );

  app.post(
    '/api/communities/:id/chat-rooms/:roomSlug/messages',
    requireAuth,
    async (req: AuthRequest, res) => {
      if (!checkRateLimit(`comm_chat:${req.user!.uid}`, 45, 60_000)) {
        res.status(429).json({ error: 'Sending messages too fast. Please wait a moment.' });
        return;
      }
      try {
        const cid = Number(req.params.id);
        const roomSlug = String(req.params.roomSlug || '');
        const result = await sendCommunityChatMessage(
          req.user!.uid,
          cid,
          roomSlug,
          req.body || {}
        );
        realtimeHub.broadcastToCommunityRoom(cid, roomSlug, {
          type: 'community_room:message',
          communityId: cid,
          roomSlug,
          message: result.message,
        });
        for (const tUid of result.mentionedUids) {
          realtimeHub.sendToUser(tUid, { type: 'notification:new' });
        }
        res.status(201).json({ message: result.message });
      } catch (err: any) {
        sendRouteError(res, err, 'Failed to send chat message.');
      }
    }
  );

  app.post(
    '/api/communities/:id/chat-messages/:msgId/react',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const cid = Number(req.params.id);
        const result = await toggleCommunityChatReaction(
          req.user!.uid,
          cid,
          Number(req.params.msgId),
          String(req.body?.emoji || '🔥')
        );
        const roomSlug = String(req.body?.roomSlug || '');
        if (roomSlug) {
          realtimeHub.broadcastToCommunityRoom(cid, roomSlug, {
            type: 'community_room:reaction',
            communityId: cid,
            roomSlug,
            messageId: result.messageId,
            reactionsJson: result.reactionsJson,
          });
        }
        res.json(result);
      } catch (err: any) {
        sendRouteError(res, err, 'Reaction failed.');
      }
    }
  );

  app.delete(
    '/api/communities/:id/chat-messages/:msgId',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const cid = Number(req.params.id);
        const result = await deleteCommunityChatMessage(
          req.user!.uid,
          cid,
          Number(req.params.msgId)
        );
        const roomSlug = String(req.query.roomSlug || req.body?.roomSlug || '');
        if (roomSlug) {
          realtimeHub.broadcastToCommunityRoom(cid, roomSlug, {
            type: 'community_room:deleted',
            communityId: cid,
            roomSlug,
            messageId: result.messageId,
          });
        }
        res.json(result);
      } catch (err: any) {
        sendRouteError(res, err, 'Failed to delete message.');
      }
    }
  );

  app.get('/api/communities/:id/events', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const events = await listCommunityEvents(Number(req.params.id), req.user?.uid);
      res.json({ events });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load community events.');
    }
  });

  app.post('/api/communities/:id/events', requireAuth, async (req: AuthRequest, res) => {
    try {
      const event = await createCommunityEvent(
        req.user!.uid,
        Number(req.params.id),
        req.body || {}
      );
      res.status(201).json({ event });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to schedule community event.');
    }
  });

  app.post(
    '/api/communities/:id/events/:eventId/rsvp',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const result = await toggleCommunityEventRsvp(
          req.user!.uid,
          Number(req.params.id),
          Number(req.params.eventId)
        );
        res.json(result);
      } catch (err: any) {
        sendRouteError(res, err, 'Failed to update event RSVP.');
      }
    }
  );

  // --- DISCUSSIONS, PULSE FEED, COMMENTS, POLLS, REPOSTS & REACTIONS ---
  app.get('/api/discussions', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const result = await listPulseFeed({
        communityId: req.query.communityId ? Number(req.query.communityId) : undefined,
        animeMalId: req.query.animeMalId ? Number(req.query.animeMalId) : undefined,
        kind: req.query.kind ? String(req.query.kind) : undefined,
        feedTab: req.query.feedTab ? String(req.query.feedTab) : undefined,
        sort: req.query.sort ? String(req.query.sort) : undefined,
        q: req.query.q ? String(req.query.q) : undefined,
        hashtag: req.query.hashtag ? String(req.query.hashtag) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 25,
        offset: req.query.offset ? Number(req.query.offset) : 0,
        viewerUid: req.user?.uid,
      });
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load discussions.', 500);
    }
  });

  app.post('/api/discussions', requireAuth, async (req: AuthRequest, res) => {
    if (!checkRateLimit(`pulse:post:${req.user!.uid}`, 20, 60_000)) {
      res.status(429).json({ error: 'Posting rate limit reached. Wait a moment before posting again.' });
      return;
    }
    try {
      const created = await createPulseOrGuildPost(req.user!.uid, req.body || {});
      if (req.user!.role === 'owner' || req.user!.role === 'admin') {
        void upgradeCommunityRealismAndEngagement();
      }
      res.status(201).json({ discussion: created });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to publish post.');
    }
  });

  app.get('/api/discussions/:id', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const commentLimit = req.query.commentLimit ? Number(req.query.commentLimit) : 80;
      const commentOffset = req.query.commentOffset ? Number(req.query.commentOffset) : 0;
      const thread = await getPulsePostById(
        Number(req.params.id),
        req.user?.uid,
        commentLimit,
        commentOffset
      );
      if (!thread) {
        res.status(404).json({ error: 'Discussion not found.' });
        return;
      }
      res.json({ discussion: thread });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load discussion.', 500);
    }
  });

  app.put('/api/discussions/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const updated = await editPulseOrGuildPost(
        req.user!.uid,
        Number(req.params.id),
        req.body || {}
      );
      res.json({ discussion: updated });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to edit post.');
    }
  });

  app.delete('/api/discussions/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await deletePulseOrGuildPost(req.user!.uid, Number(req.params.id));
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to delete post.');
    }
  });

  app.post('/api/discussions/:id/repost', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await togglePulsePureRepost(req.user!.uid, Number(req.params.id));
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Repost failed.');
    }
  });

  app.post('/api/discussions/:id/poll-vote', requireAuth, async (req: AuthRequest, res) => {
    try {
      const optionId = String(req.body?.optionId || '');
      const result = await voteOnDiscussionPoll(req.user!.uid, Number(req.params.id), optionId);
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Poll vote failed.');
    }
  });

  app.post('/api/discussions/:id/save', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await toggleSavePostForUser(req.user!.uid, Number(req.params.id));
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to update saved post.');
    }
  });

  app.post('/api/discussions/:id/video-view', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const postId = Number(req.params.id);
      const viewerKey =
        req.user?.uid ||
        String(req.body?.sessionKey || req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'anon').slice(
          0,
          100
        );
      if (req.body?.eventType === 'play') {
        const result = await recordVideoPlayStart({
          postId,
          viewerKey,
          viewerUid: req.user?.uid,
        });
        res.json(result);
        return;
      }
      const result = await recordQualifiedVideoView({
        postId,
        viewerKey,
        viewerUid: req.user?.uid,
        watchedSeconds: Number(req.body?.watchedSeconds || 0),
      });
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Video playback event failed.');
    }
  });

  app.post('/api/discussions/:id/moderate', requireAuth, async (req: AuthRequest, res) => {
    try {
      const action = req.body?.action;
      if (!['delete', 'pin', 'unpin'].includes(action)) {
        res.status(400).json({ error: 'Invalid moderation action.' });
        return;
      }
      if (action === 'delete') {
        const deleted = await deletePulseOrGuildPost(req.user!.uid, Number(req.params.id));
        res.json(deleted);
        return;
      }
      const result = await deleteOrPinDiscussion(
        req.user!.uid,
        Number(req.params.id),
        action
      );
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Moderation failed.', 403);
    }
  });

  app.post('/api/discussions/:id/comments', requireAuth, async (req: AuthRequest, res) => {
    if (!checkRateLimit(`pulse:comment:${req.user!.uid}`, 35, 60_000)) {
      res.status(429).json({ error: 'Commenting too quickly. Please wait a moment.' });
      return;
    }
    try {
      const created = await addPulseCommentWithStickers(
        req.user!.uid,
        Number(req.params.id),
        {
          content: req.body?.content ? String(req.body.content) : '',
          stickerId: req.body?.stickerId ? String(req.body.stickerId) : null,
          parentCommentId: req.body?.parentCommentId ? Number(req.body.parentCommentId) : null,
        }
      );
      res.status(201).json({ comment: created });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to add comment.');
    }
  });

  app.put('/api/comments/:commentId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const updated = await editPulseComment(
        req.user!.uid,
        Number(req.params.commentId),
        req.body || {}
      );
      res.json({ comment: updated });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to edit comment.');
    }
  });

  app.delete('/api/comments/:commentId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const result = await deletePulseComment(req.user!.uid, Number(req.params.commentId));
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to delete comment.');
    }
  });

  app.post('/api/reactions', requireAuth, async (req: AuthRequest, res) => {
    try {
      const targetType = req.body?.targetType === 'comment' ? 'comment' : 'discussion';
      const targetId = Number(req.body?.targetId);
      const reactionType = ['like', 'bookmark', 'repost'].includes(req.body?.reactionType)
        ? req.body.reactionType
        : 'like';

      if (targetType === 'discussion' && reactionType === 'repost') {
        const rp = await togglePulsePureRepost(req.user!.uid, targetId);
        res.json({ active: rp.reposted, repostCount: rp.repostCount });
        return;
      }

      if (targetType === 'discussion' && reactionType === 'bookmark') {
        const sv = await toggleSavePostForUser(req.user!.uid, targetId);
        res.json({ active: sv.saved, saved: sv.saved });
        return;
      }

      const result = await toggleReactionOnTarget(
        req.user!.uid,
        targetType,
        targetId,
        reactionType
      );
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Reaction failed.');
    }
  });

  // --- STANDALONE VOICE & VIDEO ROOMS (KAGE LIVE, STRICT 12-SEAT STAGE) ---
  app.get('/api/voice-rooms', optionalAuth, async (req, res) => {
    try {
      const items = await listStandaloneVoiceRooms({
        q: req.query.q ? String(req.query.q) : undefined,
        category: req.query.category ? String(req.query.category) : undefined,
        communityId: req.query.communityId ? Number(req.query.communityId) : undefined,
      });
      res.json({ items });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load voice rooms.', 500);
    }
  });

  app.post('/api/voice-rooms', requireAuth, async (req: AuthRequest, res) => {
    if (!checkRateLimit(`voice:create:${req.user!.uid}`, 12, 60_000)) {
      res.status(429).json({ error: 'Creating rooms too quickly. Please wait a moment.' });
      return;
    }
    try {
      const room = await createStandaloneVoiceRoom(req.user!.uid, req.body || {});
      realtimeHub.broadcastAll({ type: 'voice:room-created', room });
      res.status(201).json({ room });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to create voice room.');
    }
  });

  app.get('/api/voice-rooms/:id', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const roomId = Number(req.params.id);
      const [room, messages] = await Promise.all([
        getVoiceRoomFullDetail(roomId, req.user?.uid),
        listVoiceRoomMessages(roomId, req.user?.uid, 80),
      ]);
      if (!room) {
        res.status(404).json({ error: 'Voice room not found.' });
        return;
      }
      res.json({ room, messages });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load voice room.', 500);
    }
  });

  app.post('/api/voice-rooms/:id/join', requireAuth, async (req: AuthRequest, res) => {
    try {
      const roomId = Number(req.params.id);
      const requestedRole =
        req.body?.role === 'speaker' ||
        req.body?.role === 'host' ||
        req.body?.role === 'co_host'
          ? req.body.role
          : 'listener';
      const isMuted = req.body?.isMuted !== undefined ? Boolean(req.body.isMuted) : undefined;
      const room = await joinVoiceRoomSession(roomId, req.user!.uid, {
        requestedRole,
        isMuted,
      });
      realtimeHub.broadcastToRoom(roomId, {
        type: 'voice:room-updated',
        roomId,
        room,
      });
      realtimeHub.broadcastAll({
        type: 'voice:room-summary',
        roomId,
        participantCount: room?.participantCount || 0,
        speakerCount: room?.speakerCount || 0,
        listenerCount: room?.listenerCount || 0,
      });
      res.json({ room });
    } catch (err: any) {
      sendRouteError(res, err, 'Unable to join voice room.');
    }
  });

  app.post('/api/voice-rooms/:id/leave', requireAuth, async (req: AuthRequest, res) => {
    try {
      const roomId = Number(req.params.id);
      const room = await leaveVoiceRoomSession(roomId, req.user!.uid);
      realtimeHub.disconnectUserFromVoiceRoom(req.user!.uid, roomId);
      realtimeHub.broadcastToRoom(roomId, {
        type: 'voice:user-left',
        roomId,
        uid: req.user!.uid,
        room,
      });
      realtimeHub.broadcastAll({
        type: 'voice:room-summary',
        roomId,
        participantCount: room?.participantCount || 0,
        speakerCount: room?.speakerCount || 0,
        listenerCount: room?.listenerCount || 0,
      });
      res.json({ ok: true, room });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to leave room.');
    }
  });

  app.post('/api/voice-rooms/:id/mute', requireAuth, async (req: AuthRequest, res) => {
    try {
      const roomId = Number(req.params.id);
      const room = await toggleVoiceRoomMute(roomId, req.user!.uid, Boolean(req.body?.isMuted));
      realtimeHub.broadcastToRoom(roomId, {
        type: 'voice:room-updated',
        roomId,
        room,
      });
      res.json({ room });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to toggle microphone.');
    }
  });

  app.post('/api/voice-rooms/:id/camera', requireAuth, async (req: AuthRequest, res) => {
    try {
      const roomId = Number(req.params.id);
      const isCameraOn = Boolean(req.body?.isCameraOn);
      const room = await toggleVoiceRoomCamera(roomId, req.user!.uid, isCameraOn);
      realtimeHub.broadcastToRoom(roomId, {
        type: 'voice:room-updated',
        roomId,
        room,
      });
      realtimeHub.broadcastToRoom(roomId, {
        type: 'voice:camera-changed',
        roomId,
        uid: req.user!.uid,
        isCameraOn,
      });
      res.json({ room });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to toggle camera.');
    }
  });

  const handleSpeakRequestRoute = async (req: AuthRequest, res: express.Response) => {
    try {
      const roomId = Number(req.params.id);
      const action = req.body?.action === 'cancel' ? 'cancel' : 'request';
      const room = await requestToSpeakInVoiceRoom(roomId, req.user!.uid, action);
      realtimeHub.broadcastToRoom(roomId, {
        type: 'voice:room-updated',
        roomId,
        room,
      });
      res.json({ room, requests: room?.speakRequests || [] });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to update speaker request.');
    }
  };
  app.post('/api/voice-rooms/:id/speak-request', requireAuth, handleSpeakRequestRoute);
  app.post('/api/voice-rooms/:id/request-speak', requireAuth, handleSpeakRequestRoute);

  const handleResolveSpeakRequestRoute = async (req: AuthRequest, res: express.Response) => {
    try {
      const roomId = Number(req.params.id);
      const reqId = Number(req.params.reqId);
      const rawDecision = req.body?.decision || req.body?.action;
      const decision = rawDecision === 'reject' ? 'reject' : 'approve';
      const result = await respondToVoiceSpeakRequest(
        req.user!.uid,
        roomId,
        reqId,
        decision
      );
      realtimeHub.broadcastToRoom(roomId, {
        type: 'voice:room-updated',
        roomId,
        room: result.room,
      });
      realtimeHub.broadcastAll({
        type: 'voice:room-summary',
        roomId,
        participantCount: result.room?.participantCount || 0,
        speakerCount: result.room?.speakerCount || 0,
        listenerCount: result.room?.listenerCount || 0,
      });
      if (result.targetUid) {
        realtimeHub.sendToUser(result.targetUid, {
          type: 'voice:speak-request-resolved',
          roomId,
          targetUid: result.targetUid,
          decision: result.decision,
          room: result.room,
        });
        if (result.decision === 'approve') {
          realtimeHub.sendToUser(result.targetUid, { type: 'notification:new' });
        }
      }
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to respond to speaker request.');
    }
  };
  app.post('/api/voice-rooms/:id/speak-requests/:reqId/respond', requireAuth, handleResolveSpeakRequestRoute);
  app.post('/api/voice-rooms/:id/speak-requests/:reqId/resolve', requireAuth, handleResolveSpeakRequestRoute);
  app.post('/api/voice-rooms/:id/requests/:reqId/resolve', requireAuth, handleResolveSpeakRequestRoute);

  app.post('/api/voice-rooms/:id/step-down', requireAuth, async (req: AuthRequest, res) => {
    try {
      const roomId = Number(req.params.id);
      const room = await stepDownVoiceSpeakerToAudience(roomId, req.user!.uid);
      realtimeHub.broadcastToRoom(roomId, {
        type: 'voice:room-updated',
        roomId,
        room,
      });
      realtimeHub.broadcastAll({
        type: 'voice:room-summary',
        roomId,
        participantCount: room?.participantCount || 0,
        speakerCount: room?.speakerCount || 0,
        listenerCount: room?.listenerCount || 0,
      });
      res.json({ room });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to return to audience.');
    }
  });

  app.post('/api/voice-rooms/:id/media-mode', requireAuth, async (req: AuthRequest, res) => {
    try {
      const roomId = Number(req.params.id);
      const mediaMode = req.body?.mediaMode === 'video' ? 'video' : 'voice';
      const result = await switchVoiceRoomMediaMode(req.user!.uid, roomId, mediaMode);
      const recentMessages = await listVoiceRoomMessages(roomId, req.user!.uid, 5);
      const sysMsg = recentMessages[recentMessages.length - 1] || null;

      realtimeHub.broadcastToRoom(roomId, {
        type: 'voice:media-mode-changed',
        roomId,
        mediaMode: result.mediaMode,
        room: result.room,
      });
      realtimeHub.broadcastToRoom(roomId, {
        type: 'voice:room-updated',
        roomId,
        room: result.room,
      });
      if (sysMsg) {
        realtimeHub.broadcastToRoom(roomId, {
          type: 'voice:chat-message',
          roomId,
          message: sysMsg,
        });
      }
      realtimeHub.broadcastAll({
        type: 'voice:room-summary',
        roomId,
        mediaMode: result.mediaMode,
        participantCount: result.room?.participantCount || 0,
      });
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to switch room media mode.');
    }
  });

  const handleVoiceSettingsUpdate = async (req: AuthRequest, res: express.Response) => {
    try {
      const roomId = Number(req.params.id);
      const room = await updateVoiceRoomSettings(req.user!.uid, roomId, req.body || {});
      realtimeHub.broadcastToRoom(roomId, {
        type: 'voice:room-updated',
        roomId,
        room,
      });
      res.json({ room });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to update voice room settings.');
    }
  };
  app.patch('/api/voice-rooms/:id', requireAuth, handleVoiceSettingsUpdate);
  app.put('/api/voice-rooms/:id', requireAuth, handleVoiceSettingsUpdate);

  app.post('/api/voice-rooms/:id/end', requireAuth, async (req: AuthRequest, res) => {
    try {
      const roomId = Number(req.params.id);
      const result = await moderateVoiceRoomParticipant(req.user!.uid, roomId, {
        action: 'end_room',
      });
      realtimeHub.disconnectAllFromVoiceRoom(roomId, {
        type: 'voice:room-ended',
        roomId,
      });
      realtimeHub.broadcastAll({
        type: 'voice:room-ended',
        roomId,
      });
      realtimeHub.broadcastAll({
        type: 'voice:room-summary',
        roomId,
        ended: true,
        participantCount: 0,
      });
      res.json({ ok: true, result });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to end voice room.', 403);
    }
  });

  app.post('/api/voice-rooms/:id/moderate', requireAuth, async (req: AuthRequest, res) => {
    try {
      const roomId = Number(req.params.id);
      const { action, targetUid, newRole, reason } = req.body || {};
      const result = await moderateVoiceRoomParticipant(req.user!.uid, roomId, {
        action,
        targetUid,
        newRole,
        reason,
      });

      if ((action === 'kick' || action === 'ban') && targetUid) {
        realtimeHub.disconnectUserFromVoiceRoom(targetUid, roomId, {
          type: 'voice:kicked',
          roomId,
          banned: action === 'ban',
          reason: reason || (action === 'ban' ? 'Banned by host' : 'Removed from room'),
        });
      }

      if ((result as any)?.closed) {
        realtimeHub.disconnectAllFromVoiceRoom(roomId, {
          type: 'voice:room-ended',
          roomId,
        });
        realtimeHub.broadcastAll({
          type: 'voice:room-ended',
          roomId,
        });
        realtimeHub.broadcastAll({
          type: 'voice:room-summary',
          roomId,
          ended: true,
          participantCount: 0,
        });
        res.json({ result });
        return;
      }

      realtimeHub.broadcastToRoom(roomId, {
        type: 'voice:room-updated',
        roomId,
        room: result,
      });
      realtimeHub.broadcastAll({
        type: 'voice:room-summary',
        roomId,
        participantCount: (result as any)?.participantCount || 0,
        speakerCount: (result as any)?.speakerCount || 0,
        listenerCount: (result as any)?.listenerCount || 0,
      });
      res.json({ result, room: result });
    } catch (err: any) {
      sendRouteError(res, err, 'Voice moderation failed.', 403);
    }
  });

  app.get('/api/voice-rooms/:id/messages', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const roomId = Number(req.params.id);
      const messages = await listVoiceRoomMessages(
        roomId,
        req.user?.uid,
        req.query.limit ? Number(req.query.limit) : 80
      );
      res.json({ items: messages, messages });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load room chat messages.');
    }
  });

  app.post('/api/voice-rooms/:id/messages', requireAuth, async (req: AuthRequest, res) => {
    if (!checkRateLimit(`voice:chat:${req.user!.uid}`, 45, 60_000)) {
      res.status(429).json({ error: 'Sending messages too fast. Please wait a moment.' });
      return;
    }
    try {
      const roomId = Number(req.params.id);
      const result = await sendVoiceRoomMessage(roomId, req.user!.uid, req.body || {});
      realtimeHub.broadcastToRoom(roomId, {
        type: 'voice:chat-message',
        roomId,
        message: result.message,
      });
      for (const mentionedUid of result.mentionedUids) {
        realtimeHub.sendToUser(mentionedUid, {
          type: 'voice:mention',
          roomId,
          roomTitle: result.roomTitle,
          senderUsername: result.message?.sender?.username || 'hunter',
          preview: result.message?.content || '',
          message: result.message,
        });
        realtimeHub.sendToUser(mentionedUid, { type: 'notification:new' });
      }
      res.status(201).json({ message: result.message, mentionedUids: result.mentionedUids });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to send chat message.');
    }
  });

  app.post(
    '/api/voice-rooms/:id/messages/:msgId/react',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const roomId = Number(req.params.id);
        const msgId = Number(req.params.msgId);
        const result = await toggleVoiceRoomMessageReaction(
          roomId,
          msgId,
          req.user!.uid,
          String(req.body?.emoji || '🔥')
        );
        realtimeHub.broadcastToRoom(roomId, {
          type: 'voice:chat-reaction',
          roomId,
          messageId: result.messageId,
          reactions: result.reactions,
          reactionsJson: result.reactionsJson,
        });
        res.json(result);
      } catch (err: any) {
        sendRouteError(res, err, 'Failed to react to message.');
      }
    }
  );

  app.delete(
    '/api/voice-rooms/:id/messages/:msgId',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const roomId = Number(req.params.id);
        const msgId = Number(req.params.msgId);
        const result = await deleteVoiceRoomMessage(roomId, msgId, req.user!.uid);
        realtimeHub.broadcastToRoom(roomId, {
          type: 'voice:chat-deleted',
          roomId,
          messageId: result.messageId,
        });
        res.json(result);
      } catch (err: any) {
        sendRouteError(res, err, 'Failed to delete message.');
      }
    }
  );

  app.post('/api/voice-rooms/:id/invite', requireAuth, async (req: AuthRequest, res) => {
    try {
      const roomId = Number(req.params.id);
      const targetUid = String(req.body?.targetUid || '');
      const room = await getVoiceRoomFullDetail(roomId, req.user!.uid);
      if (!room || !targetUid) {
        res.status(400).json({ error: 'Room and invited user are required.' });
        return;
      }
      const me = await getFullUserBundle(req.user!.uid);
      await createNotification({
        recipientUid: targetUid,
        actorUid: req.user!.uid,
        type: 'voice_invite',
        title: `${me?.profile?.displayName || 'A hunter'} invited you to ${room.title}`,
        body: 'Join live voice room in KAGE LIVE',
        linkUrl: `/voice/${roomId}`,
      });
      realtimeHub.sendToUser(targetUid, { type: 'notification:new' });
      res.json({ ok: true });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to send invite.');
    }
  });

  app.get('/api/leaderboard', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const limit = req.query.limit ? Number(req.query.limit) : 30;
      const data = await getGlobalClashAndCommunityLeaderboard({
        limit,
        viewerUid: req.user?.uid,
      });
      res.json(data);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load global leaderboard.', 500);
    }
  });

  // --- CLASHES (USER DUEL, COMMUNITY DUEL WITH REWARDS, SOLO CHARACTER) ---
  app.get('/api/clashes', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const result = await listClashesPaginated({
        tab: req.query.tab ? String(req.query.tab) : 'all',
        q: req.query.q ? String(req.query.q) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 20,
        offset: req.query.offset ? Number(req.query.offset) : 0,
        viewerUid: req.user?.uid,
      });
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load clashes.', 500);
    }
  });

  app.get('/api/clashes/eligible-rewards', requireAuth, async (req: AuthRequest, res) => {
    try {
      const communityId = req.query.communityId ? Number(req.query.communityId) : null;
      const rewards = await listEligibleDuelRewardsForActor(req.user!.uid, communityId);
      res.json(rewards);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load eligible duel rewards.', 500);
    }
  });

  app.get('/api/clashes/:id', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const clash = await getClashDetailById(Number(req.params.id), req.user?.uid);
      if (!clash) {
        res.status(404).json({ error: 'Clash not found.' });
        return;
      }
      res.json({ clash });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load clash detail.', 500);
    }
  });

  app.post('/api/clashes', requireAuth, async (req: AuthRequest, res) => {
    if (!checkRateLimit(`clash:create:${req.user!.uid}`, 15, 60_000)) {
      res.status(429).json({ error: 'Creating clashes too rapidly. Please wait a moment.' });
      return;
    }
    try {
      const clash = await createFullClash(req.user!.uid, req.body || {});
      if (clash?.opponentUid) {
        realtimeHub.sendToUser(clash.opponentUid, { type: 'notification:new' });
      }
      realtimeHub.broadcastAll({ type: 'clash:created', clashId: clash?.id });
      res.status(201).json({ clash });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to create clash.');
    }
  });

  app.post('/api/clashes/:id/respond', requireAuth, async (req: AuthRequest, res) => {
    try {
      const action = req.body?.action === 'decline' ? 'decline' : 'accept';
      const updated = await respondToClashInvitation(req.user!.uid, Number(req.params.id), {
        action,
        stakedRewards: Array.isArray(req.body?.stakedRewards) ? req.body.stakedRewards : undefined,
      });
      if (updated?.challengerUid) {
        realtimeHub.sendToUser(updated.challengerUid, { type: 'notification:new' });
      }
      realtimeHub.broadcastAll({ type: 'clash:updated', clash: updated });
      res.json({ clash: updated });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to respond to Clash invitation.');
    }
  });

  app.post('/api/clashes/:id/entries', requireAuth, async (req: AuthRequest, res) => {
    if (!checkRateLimit(`clash:entry:${req.user!.uid}`, 12, 60_000)) {
      res.status(429).json({ error: 'Too many entry uploads. Please wait a moment.' });
      return;
    }
    try {
      const updated = await submitClashMediaEntry(
        req.user!.uid,
        Number(req.params.id),
        req.body || {}
      );
      realtimeHub.broadcastAll({ type: 'clash:updated', clash: updated });
      res.status(201).json({ clash: updated });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to submit Clash edit entry.');
    }
  });

  app.post('/api/clashes/:id/vote', requireAuth, async (req: AuthRequest, res) => {
    if (!checkRateLimit(`clash:vote:${req.user!.uid}`, 45, 60_000)) {
      res.status(429).json({ error: 'Voting too fast. Please slow down.' });
      return;
    }
    try {
      const side = req.body?.side === 'right' ? 'right' : 'left';
      const updated = await voteInClash(req.user!.uid, Number(req.params.id), side);
      realtimeHub.broadcastAll({
        type: 'clash:updated',
        clash: {
          id: updated?.id,
          leftVotes: updated?.leftVotes,
          rightVotes: updated?.rightVotes,
          totalVotes: updated?.totalVotes,
          leftPercent: updated?.leftPercent,
          rightPercent: updated?.rightPercent,
          status: updated?.status,
        },
      });
      res.json({ clash: updated });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to record vote.');
    }
  });

  app.post('/api/clashes/:id/reward-vote', requireAuth, async (req: AuthRequest, res) => {
    try {
      const clashRewardId = Number(req.body?.clashRewardId);
      const updated = await voteInClashRewardPoll(
        req.user!.uid,
        Number(req.params.id),
        clashRewardId
      );
      realtimeHub.broadcastAll({ type: 'clash:updated', clash: updated });
      res.json({ clash: updated });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to vote in reward poll.');
    }
  });

  app.patch('/api/clashes/:id', requireAuth, async (req: AuthRequest, res) => {
    try {
      const updated = await editOrCancelClash(
        req.user!.uid,
        Number(req.params.id),
        req.body || {}
      );
      realtimeHub.broadcastAll({ type: 'clash:updated', clash: updated });
      res.json({ clash: updated });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to update Clash.');
    }
  });

  // --- NOTIFICATIONS ---
  app.get('/api/notifications', requireAuth, async (req: AuthRequest, res) => {
    try {
      const items = await listNotificationsForUser(req.user!.uid);
      res.json({ items });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to load notifications.' });
    }
  });

  app.post('/api/notifications/read', requireAuth, async (req: AuthRequest, res) => {
    try {
      const notificationId = req.body?.notificationId
        ? Number(req.body.notificationId)
        : undefined;
      const result = await markNotificationsRead(req.user!.uid, notificationId);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to mark notifications read.' });
    }
  });

  // --- INBOX / DIRECT & SQUAD MESSAGES ---
  app.get('/api/inbox', requireAuth, async (req: AuthRequest, res) => {
    try {
      const rawFolder = String(req.query.folder || 'all');
      const folder = ['active', 'requests', 'archived', 'all'].includes(rawFolder)
        ? (rawFolder as 'active' | 'requests' | 'archived' | 'all')
        : 'all';
      const [inboxData, activeHunters] = await Promise.all([
        listInboxConversationsForViewer(req.user!.uid, folder),
        searchUsersDirectory(String(req.query.q || ''), req.user!.uid),
      ]);
      const onlineSet = new Set(realtimeHub.getOnlineUserUids());
      res.json({
        conversations: inboxData.conversations.map((c) => ({
          ...c,
          peerOnline: c.peerUid ? onlineSet.has(c.peerUid) : false,
        })),
        counts: inboxData.counts,
        hunters: activeHunters.map((h) => ({ ...h, isOnline: onlineSet.has(h.uid) })),
      });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load inbox.', 500);
    }
  });

  app.post('/api/inbox', requireAuth, async (req: AuthRequest, res) => {
    try {
      const targetUids = Array.isArray(req.body?.targetUids) ? req.body.targetUids : [];
      const conv = await startOrOpenConversation(
        req.user!.uid,
        targetUids,
        req.body?.title
      );
      res.status(201).json({ conversation: conv });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to start conversation.');
    }
  });

  app.post('/api/inbox/:id/request', requireAuth, async (req: AuthRequest, res) => {
    try {
      const action = req.body?.action === 'decline' ? 'decline' : 'accept';
      const result = await respondToConversationRequest(
        req.user!.uid,
        Number(req.params.id),
        action
      );
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to respond to message request.');
    }
  });

  app.patch('/api/inbox/:id/preferences', requireAuth, async (req: AuthRequest, res) => {
    try {
      const updated = await updateConversationPreferences(
        req.user!.uid,
        Number(req.params.id),
        req.body || {}
      );
      res.json({ preferences: updated });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to update conversation preferences.');
    }
  });

  app.get('/api/inbox/:id/messages', requireAuth, async (req: AuthRequest, res) => {
    try {
      const convId = Number(req.params.id);
      const result = await getConversationMessagesPaginated(req.user!.uid, convId, {
        beforeId: req.query.beforeId ? Number(req.query.beforeId) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 45,
      });

      if (result.newlyReadIds.length > 0) {
        const readAtIso = new Date().toISOString();
        for (const pUid of result.peerUids) {
          realtimeHub.sendToUser(pUid, {
            type: 'inbox:read',
            conversationId: convId,
            readerUid: req.user!.uid,
            messageIds: result.newlyReadIds,
            readAt: readAtIso,
          });
        }
      }

      res.json({
        messages: result.messages,
        hasMoreOlder: result.hasMoreOlder,
        requestStatus: result.requestStatus,
      });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load messages.', 403);
    }
  });

  app.post('/api/inbox/:id/messages', requireAuth, async (req: AuthRequest, res) => {
    if (!checkRateLimit(`inbox:send:${req.user!.uid}`, 45, 60_000)) {
      res.status(429).json({ error: 'Sending messages too quickly. Please wait a moment.' });
      return;
    }
    try {
      const convId = Number(req.params.id);
      const sent = await sendRichMessageInConversation(req.user!.uid, convId, req.body || {});

      if (!sent.deduplicated) {
        const onlineSet = new Set(realtimeHub.getOnlineUserUids());
        for (const rec of sent.recipientPayloads) {
          realtimeHub.sendToUser(rec.uid, {
            type: 'inbox:message',
            conversationId: convId,
            message: rec.message,
            requestStatus: rec.requestStatus,
          });
          if (!rec.isMuted) {
            realtimeHub.sendToUser(rec.uid, { type: 'notification:new' });
          }
          if (onlineSet.has(rec.uid)) {
            markMessageDeliveredByRecipient(rec.uid, convId, sent.message.id)
              .then((deliv) => {
                if (deliv) {
                  realtimeHub.sendToUser(req.user!.uid, {
                    type: 'inbox:delivered',
                    conversationId: convId,
                    messageId: sent.message.id,
                    deliveredAt: deliv.deliveredAt,
                  });
                }
              })
              .catch(() => {});
          }
        }
      }

      res.status(201).json({ message: sent.message, deduplicated: sent.deduplicated });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to send message.');
    }
  });

  app.post('/api/inbox/:id/delivered', requireAuth, async (req: AuthRequest, res) => {
    try {
      const convId = Number(req.params.id);
      const messageId = Number(req.body?.messageId);
      const updated = await markMessageDeliveredByRecipient(req.user!.uid, convId, messageId);
      if (updated) {
        realtimeHub.sendToUser(updated.senderUid, {
          type: 'inbox:delivered',
          conversationId: convId,
          messageId: updated.id,
          deliveredAt: updated.deliveredAt,
        });
      }
      res.json({ ok: true, deliveredAt: updated?.deliveredAt || null });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to acknowledge delivery.');
    }
  });

  app.patch(
    '/api/inbox/:id/messages/:messageId',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const convId = Number(req.params.id);
        const msgId = Number(req.params.messageId);
        const result = await editOwnConversationMessage(
          req.user!.uid,
          convId,
          msgId,
          String(req.body?.content || '')
        );
        for (const rUid of result.recipientUids) {
          realtimeHub.sendToUser(rUid, {
            type: 'inbox:message-edited',
            conversationId: convId,
            messageId: msgId,
            content: result.message.content,
            editedAt: result.message.editedAt,
          });
        }
        res.json({ message: result.message });
      } catch (err: any) {
        sendRouteError(res, err, 'Failed to edit message.');
      }
    }
  );

  app.delete(
    '/api/inbox/:id/messages/:messageId',
    requireAuth,
    async (req: AuthRequest, res) => {
      try {
        const convId = Number(req.params.id);
        const msgId = Number(req.params.messageId);
        const result = await deleteOwnConversationMessage(req.user!.uid, convId, msgId);
        for (const rUid of result.recipientUids) {
          realtimeHub.sendToUser(rUid, {
            type: 'inbox:message-deleted',
            conversationId: convId,
            messageId: msgId,
          });
        }
        res.json(result);
      } catch (err: any) {
        sendRouteError(res, err, 'Failed to delete message.');
      }
    }
  );

  // --- SETTINGS, REPORTS & UNIFIED SEARCH (ANIME + EXACT @USERNAME / USER ID PEOPLE) ---
  app.put('/api/me/settings', requireAuth, async (req: AuthRequest, res) => {
    try {
      const updated = await updateSettingsForUser(req.user!.uid, req.body || {});
      res.json(updated);
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to save settings.' });
    }
  });

  app.delete('/api/me/account', requireAuth, async (req: AuthRequest, res) => {
    try {
      const uid = req.user!.uid;
      await deleteAccountPermanently(uid);
      try {
        await adminAuth.deleteUser(uid);
      } catch {
        // Client SDK also calls user.delete() when recent login allows
      }
      res.json({ deleted: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message || 'Failed to delete account.' });
    }
  });

  app.post('/api/reports', requireAuth, async (req: AuthRequest, res) => {
    try {
      const { targetType, targetId, reason, details } = req.body || {};
      if (!targetType || !targetId || !reason) {
        res.status(400).json({ error: 'Reason and target are required.' });
        return;
      }
      const report = await submitContentReport(req.user!.uid, {
        targetType: String(targetType),
        targetId: String(targetId),
        reason: String(reason),
        details: details ? String(details) : '',
      });
      res.status(201).json({ report });
    } catch (err: any) {
      res.status(400).json({ error: err.message || 'Failed to submit report.' });
    }
  });

  app.get('/api/search', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const q = String(req.query.q || '').trim();
      const genre = String(req.query.genre || '').trim();
      const filter = String(req.query.filter || '').trim();
      const year = req.query.year ? Number(req.query.year) : undefined;
      const format = req.query.format ? String(req.query.format).trim() : undefined;
      const status =
        filter === 'upcoming'
          ? 'NOT_YET_RELEASED'
          : req.query.status
            ? String(req.query.status).trim()
            : undefined;
      const minScore = req.query.minScore ? Number(req.query.minScore) : undefined;
      const sort = req.query.sort ? String(req.query.sort).trim() : undefined;
      const page = req.query.page ? Number(req.query.page) : 1;
      const hasAnimeFilters = Boolean(genre || filter || year || format || status || minScore);

      // 1. Accurate People lookup (exact @username or unique KAGE ID / UID — never fuzzy-matches anime titles)
      const peopleResult = q
        ? await searchExactPeopleForUnifiedSearch(q, req.user?.uid)
        : { people: [], isExplicitPersonQuery: false, queryKind: 'empty' as const };

      // 2. Partial Anime-Title search — skipped when query is an explicit @username or unique User ID
      //    so usernames and user IDs are never confused with anime titles.
      const shouldSearchAnime =
        !peopleResult.isExplicitPersonQuery && Boolean(q || hasAnimeFilters);

      const [animeRes, mangaRes, guildsRes, postsRes, rooms] = await Promise.all([
        shouldSearchAnime
          ? searchRealmsCatalog({
              q,
              genre,
              year,
              format,
              status,
              minScore,
              sort,
              page,
              perPage: 24,
            })
          : Promise.resolve({
              items: [],
              pageInfo: {
                currentPage: 1,
                perPage: 24,
                hasNextPage: false,
                total: 0,
              },
            }),
        shouldSearchAnime
          ? searchMangaCatalog({
              q,
              genre,
              year,
              status,
              minRating: minScore,
              sort: sort === 'rating' ? 'rating' : sort === 'title' ? 'alphabetical' : 'popularity',
              page,
              perPage: 16,
            }).catch(() => ({
              items: [],
              pageInfo: { currentPage: 1, perPage: 16, hasNextPage: false, total: 0 },
            }))
          : Promise.resolve({
              items: [],
              pageInfo: {
                currentPage: 1,
                perPage: 16,
                hasNextPage: false,
                total: 0,
              },
            }),
        q && !peopleResult.isExplicitPersonQuery
          ? listGuildsDiscovery({ q, limit: 12, viewerUid: req.user?.uid })
          : Promise.resolve({ items: [] }),
        q && !peopleResult.isExplicitPersonQuery
          ? listPulseFeed({ q, limit: 12, viewerUid: req.user?.uid })
          : Promise.resolve({ items: [] }),
        q && !peopleResult.isExplicitPersonQuery ? listActiveVoiceRooms(q) : Promise.resolve([]),
      ]);

      const onlineSet = new Set(realtimeHub.getOnlineUserUids());
      const peopleWithPresence = peopleResult.people.map((person) => ({
        ...person,
        isOnline: onlineSet.has(person.uid),
      }));

      res.json({
        queryKind: peopleResult.queryKind,
        isExplicitPersonQuery: peopleResult.isExplicitPersonQuery,
        anime: animeRes.items.map((item) => ({ ...item, malId: item.canonicalId })),
        animePageInfo: animeRes.pageInfo,
        manga: mangaRes.items,
        mangaPageInfo: mangaRes.pageInfo,
        people: peopleWithPresence,
        users: peopleWithPresence,
        communities: guildsRes.items,
        discussions: postsRes.items,
        voiceRooms: rooms,
      });
    } catch (err: any) {
      sendRouteError(res, err, 'Search failed.', 500);
    }
  });

  // --- SOVEREIGN OWNER & ADMIN CONTROL PANEL ---
  app.get(
    '/api/admin/overview',
    requireAuth,
    requireAdminOrOwner,
    async (_req: AuthRequest, res) => {
      try {
        const overview = await getAdminDashboardOverview(realtimeHub.getOnlineUserUids());
        res.json(overview);
      } catch (err: any) {
        res.status(500).json({ error: err.message || 'Failed to load admin overview.' });
      }
    }
  );

  app.post(
    '/api/admin/announce',
    requireAuth,
    requireAdminOrOwner,
    async (req: AuthRequest, res) => {
      try {
        const title = String(req.body?.title || '').trim();
        const body = String(req.body?.body || '').trim();
        const linkUrl = req.body?.linkUrl ? String(req.body.linkUrl).trim() : undefined;
        const pinToPulse = Boolean(req.body?.pinToPulse);
        const mediaUrl = req.body?.mediaUrl ? String(req.body.mediaUrl).trim() : null;

        const result = await broadcastOwnerAnnouncement(req.user!.uid, {
          title,
          body,
          linkUrl,
          pinToPulse,
          mediaUrl,
        });
        if (pinToPulse) {
          void upgradeCommunityRealismAndEngagement();
        }

        realtimeHub.broadcastAll({
          type: 'notification:new',
          announcement: {
            title,
            body,
            linkUrl: result.linkUrl,
            actorName: 'Yaseen Ahmad · Owner of KAGE',
          },
        });

        if (pinToPulse) {
          void upgradeCommunityRealismAndEngagement();
        }
        res.status(201).json(result);
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to broadcast announcement.' });
      }
    }
  );

  app.post(
    '/api/admin/users/:uid/role',
    requireAuth,
    requireAdminOrOwner,
    async (req: AuthRequest, res) => {
      try {
        const newRole = req.body?.role;
        if (!['owner', 'admin', 'moderator', 'user'].includes(newRole)) {
          res.status(400).json({ error: 'Invalid role specified.' });
          return;
        }
        const updated = await adminSetUserRole(req.user!.uid, req.params.uid, newRole);
        res.json(updated);
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to update user role.' });
      }
    }
  );

  app.delete(
    '/api/admin/users/:uid',
    requireAuth,
    requireAdminOrOwner,
    async (req: AuthRequest, res) => {
      try {
        const result = await deleteAccountPermanently(req.params.uid);
        res.json(result);
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to delete user.' });
      }
    }
  );

  app.delete(
    '/api/admin/communities/:id',
    requireAuth,
    requireAdminOrOwner,
    async (req: AuthRequest, res) => {
      try {
        const result = await adminDeleteGuild(Number(req.params.id));
        res.json(result);
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to delete guild.' });
      }
    }
  );

  app.delete(
    '/api/admin/clashes/:id',
    requireAuth,
    requireAdminOrOwner,
    async (req: AuthRequest, res) => {
      try {
        const result = await adminDeleteClash(Number(req.params.id));
        res.json(result);
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to delete clash.' });
      }
    }
  );

  app.post(
    '/api/admin/reports/:id/resolve',
    requireAuth,
    requireAdminOrOwner,
    async (req: AuthRequest, res) => {
      try {
        const status = req.body?.status === 'dismissed' ? 'dismissed' : 'resolved';
        const report = await adminResolveReport(Number(req.params.id), status);
        res.json({ report });
      } catch (err: any) {
        res.status(400).json({ error: err.message || 'Failed to update report.' });
      }
    }
  );

  // --- SOVEREIGN ADMIN: 10,000 AI DEMO COMMUNITY & SHOWCASE CONTROLS ---
  app.get(
    '/api/admin/ai-community',
    requireAuth,
    requireAdminOrOwner,
    async (_req: AuthRequest, res) => {
      try {
        const data = await getAiCommunityAdminOverview();
        res.json(data);
      } catch (err: any) {
        sendRouteError(res, err, 'Failed to load AI community overview.', 500);
      }
    }
  );

  app.put(
    '/api/admin/ai-community/config',
    requireAuth,
    requireAdminOrOwner,
    async (req: AuthRequest, res) => {
      try {
        const updated = await updateAiCommunityConfigAndSync(req.body || {});
        res.json(updated);
      } catch (err: any) {
        sendRouteError(res, err, 'Failed to update AI community configuration.');
      }
    }
  );

  app.post(
    '/api/admin/ai-community/seed',
    requireAuth,
    requireAdminOrOwner,
    async (req: AuthRequest, res) => {
      try {
        const result = await triggerAiCommunitySeedingJob({
          forceReseed: Boolean(req.body?.forceReseed),
          generateGeminiThreads: Boolean(req.body?.generateGeminiThreads),
          jobType: req.body?.generateGeminiThreads ? 'gemini_enrichment' : 'admin_sync',
        });
      res.status(202).json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to trigger AI community seeding job.', 500);
    }
  });

  // --- KAGE INKVERSE MANGA PLATFORM ENDPOINTS ---
  app.get('/api/inkverse/dashboard', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const payload = await getInkverseDashboard(req.user?.uid);
      res.json(payload);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load INKVERSE dashboard.', 500);
    }
  });

  app.get('/api/inkverse/browse', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const colorRaw = String(req.query.color || '').toLowerCase();
      const color: 'color' | 'bw' | '' =
        colorRaw === 'color' ? 'color' : colorRaw === 'bw' ? 'bw' : '';
      const sortRaw = String(req.query.sort || 'popularity').toLowerCase();
      const sort =
        sortRaw === 'rating' ||
        sortRaw === 'updated' ||
        sortRaw === 'newest' ||
        sortRaw === 'alphabetical' ||
        sortRaw === 'trending'
          ? sortRaw
          : 'popularity';

      const inAppOnly =
        req.query.inAppOnly === '1' || req.query.inAppOnly === 'true';
      const originalsOnly =
        req.query.originalsOnly === '1' || req.query.originalsOnly === 'true';
      const isAdmin =
        req.user?.role === 'owner' || req.user?.role === 'admin';

      const result = await searchMangaCatalog({
        q: req.query.q ? String(req.query.q) : '',
        genre: req.query.genre ? String(req.query.genre) : '',
        status: req.query.status ? String(req.query.status) : '',
        year: req.query.year ? Number(req.query.year) : undefined,
        minRating: req.query.minRating ? Number(req.query.minRating) : undefined,
        color,
        language: req.query.language ? String(req.query.language) : '',
        inAppOnly,
        originalsOnly,
        viewerUid: req.user?.uid,
        isAdmin,
        sort,
        page: req.query.page ? Number(req.query.page) : 1,
        perPage: req.query.perPage ? Number(req.query.perPage) : 20,
      });
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to browse INKVERSE manga library.', 500);
    }
  });

  app.get('/api/inkverse/suggestions', optionalAuth, async (req, res) => {
    try {
      const q = String(req.query.q || '');
      const result = await getInkverseSearchSuggestions(q);
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load search suggestions.', 500);
    }
  });

  app.get('/api/inkverse/manga/:id', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const id = Number(req.params.id);
      if (Number.isNaN(id) || id <= 0) {
        res.status(400).json({ error: 'Invalid manga ID.' });
        return;
      }

      const isAdmin = req.user?.role === 'owner' || req.user?.role === 'admin';
      const detail = await getMangaDetailById(id, req.user?.uid, isAdmin);
      if (!detail) {
        res.status(404).json({ error: 'Manga not found.' });
        return;
      }

      const [reviewBundle, viewerState, bookmarks] = await Promise.all([
        listMangaReviews(detail.manga.id, req.user?.uid),
        req.user?.uid ? getUserMangaEntry(req.user.uid, detail.manga.id) : Promise.resolve(null),
        req.user?.uid ? listMangaBookmarks(req.user.uid, detail.manga.id) : Promise.resolve([]),
      ]);

      res.json({
        ...detail,
        reviews: reviewBundle.reviews,
        kageReviewCount: reviewBundle.kageReviewCount,
        kageAverageScore: reviewBundle.kageAverageScore,
        viewerEntry: viewerState?.entry || null,
        viewerHistory: viewerState?.history || null,
        viewerBookmarks: bookmarks,
      });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load manga details.', 500);
    }
  });

  app.get('/api/inkverse/chapters/:chapterId/pages', optionalAuth, async (req: AuthRequest, res) => {
    try {
      const chapterId = Number(req.params.chapterId);
      if (Number.isNaN(chapterId) || chapterId <= 0) {
        res.status(400).json({ error: 'Invalid chapter ID.' });
        return;
      }

      const isAdmin = req.user?.role === 'owner' || req.user?.role === 'admin';
      const data = await getChapterPagesForReader(chapterId, req.user?.uid, isAdmin);
      if (!data) {
        res.status(404).json({ error: 'Chapter not found.' });
        return;
      }

      const updatedReadCount = await incrementMangaReadCount(data.manga.id).catch(
        () => data.manga.readCount
      );

      const bookmarks = req.user?.uid
        ? await listMangaBookmarks(req.user.uid, data.manga.id)
        : [];

      res.json({
        ...data,
        manga: { ...data.manga, readCount: updatedReadCount },
        bookmarks: bookmarks.filter((b) => b.chapterId === chapterId),
      });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load chapter pages.', 500);
    }
  });

  app.get('/api/inkverse/image-proxy', async (req, res) => {
    const rawUrl = String(req.query.url || '').trim();
    if (!rawUrl || !(await isAllowedInkverseProxyHost(rawUrl))) {
      res.status(403).json({ error: 'Disallowed image source host.' });
      return;
    }

    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      const upstream = await fetch(rawUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'KAGE-Inkverse/1.0',
          Referer: 'https://mangadex.org/',
        },
      });
      clearTimeout(timer);

      if (!upstream.ok) {
        res.status(upstream.status).end();
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'image/jpeg';
      if (!contentType.startsWith('image/')) {
        res.status(400).json({ error: 'Upstream response is not an image.' });
        return;
      }

      const buf = Buffer.from(await upstream.arrayBuffer());
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=86400');
      res.send(buf);
    } catch {
      res.status(502).end();
    }
  });

  app.get('/api/inkverse/my-manga', requireAuth, async (req: AuthRequest, res) => {
    try {
      const tab = String(req.query.tab || 'all');
      const result = await getUserMangaLibraryList(req.user!.uid, tab);
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load your manga library.', 500);
    }
  });

  app.post('/api/inkverse/my-manga', requireAuth, async (req: AuthRequest, res) => {
    try {
      const mangaId = Number(req.body?.mangaId);
      if (!mangaId || Number.isNaN(mangaId)) {
        res.status(400).json({ error: 'Valid mangaId is required.' });
        return;
      }
      const entry = await upsertUserMangaEntry(req.user!.uid, {
        mangaId,
        status: req.body?.status,
        isBookmarked: req.body?.isBookmarked,
        personalScore: req.body?.personalScore,
      });
      res.json({ entry });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to update manga library.');
    }
  });

  app.delete('/api/inkverse/my-manga/:mangaId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const mangaId = Number(req.params.mangaId);
      const result = await removeUserMangaEntry(req.user!.uid, mangaId);
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to remove manga from library.');
    }
  });

  app.post('/api/inkverse/progress', requireAuth, async (req: AuthRequest, res) => {
    try {
      const mangaId = Number(req.body?.mangaId);
      const chapterId = req.body?.chapterId ? Number(req.body.chapterId) : null;
      const pageNumber = Number(req.body?.pageNumber || 1);
      const totalPages = Number(req.body?.totalPages || 1);
      const readingMode = req.body?.readingMode ? String(req.body.readingMode) : 'vertical';

      if (!mangaId || Number.isNaN(mangaId)) {
        res.status(400).json({ error: 'Valid mangaId is required.' });
        return;
      }

      const saved = await upsertMangaReadingProgress(req.user!.uid, {
        mangaId,
        chapterId,
        pageNumber,
        totalPages,
        readingMode,
      });
      res.json(saved);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to save reading progress.');
    }
  });

  app.get('/api/inkverse/bookmarks', requireAuth, async (req: AuthRequest, res) => {
    try {
      const mangaId = req.query.mangaId ? Number(req.query.mangaId) : undefined;
      const items = await listMangaBookmarks(req.user!.uid, mangaId);
      res.json({ items });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load bookmarks.', 500);
    }
  });

  app.post('/api/inkverse/bookmarks', requireAuth, async (req: AuthRequest, res) => {
    try {
      const mangaId = Number(req.body?.mangaId);
      const chapterId = Number(req.body?.chapterId);
      const pageNumber = Number(req.body?.pageNumber || 1);
      const chapterNumber = String(req.body?.chapterNumber || '1');
      if (!mangaId || !chapterId) {
        res.status(400).json({ error: 'mangaId and chapterId are required.' });
        return;
      }
      const result = await toggleMangaPageBookmark(req.user!.uid, {
        mangaId,
        chapterId,
        chapterNumber,
        pageNumber,
        note: req.body?.note ? String(req.body.note) : '',
      });
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to toggle page bookmark.');
    }
  });

  app.post('/api/inkverse/manga/:id/reviews', requireAuth, async (req: AuthRequest, res) => {
    try {
      const mangaId = Number(req.params.id);
      const created = await createMangaReview(req.user!.uid, mangaId, {
        rating: req.body?.rating !== undefined ? req.body.rating : null,
        title: req.body?.title ? String(req.body.title) : undefined,
        content: String(req.body?.content || ''),
        containsSpoilers: Boolean(req.body?.containsSpoilers),
      });
      res.status(201).json({ review: created });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to publish manga review.');
    }
  });

  app.delete('/api/inkverse/reviews/:reviewId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const reviewId = Number(req.params.reviewId);
      const result = await deleteMangaReview(req.user!.uid, reviewId);
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to delete review.');
    }
  });

  // --- INKVERSE CREATOR STUDIO & ADMIN MODERATION ---
  app.get('/api/inkverse/studio/my-uploads', requireAuth, async (req: AuthRequest, res) => {
    try {
      const isAdmin = req.user!.role === 'owner' || req.user!.role === 'admin';
      const items = await listCreatorUploadedManga(req.user!.uid, isAdmin);
      res.json({ items });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to load creator uploads.', 500);
    }
  });

  app.post('/api/inkverse/studio/manga', requireAuth, async (req: AuthRequest, res) => {
    try {
      const isPrivileged = req.user!.role === 'owner' || req.user!.role === 'admin';
      if (!isPrivileged && !checkRateLimit(`manga_series:${req.user!.uid}`, 5, 3_600_000)) {
        res.status(429).json({
          error: 'Upload limit reached: maximum 5 new manga series per hour. Try again shortly.',
        });
        return;
      }

      const body = req.body || {};
      const manga = await createCreatorMangaSeries(req.user!.uid, req.user!.role || 'user', {
        title: String(body.title || ''),
        altTitles: Array.isArray(body.altTitles) ? body.altTitles : [],
        synopsis: String(body.synopsis || ''),
        authorName: body.authorName ? String(body.authorName) : undefined,
        artistName: body.artistName ? String(body.artistName) : undefined,
        format: body.format ? String(body.format) : 'MANGA',
        status: body.status ? String(body.status) : 'RELEASING',
        releaseYear: body.releaseYear ? Number(body.releaseYear) : null,
        isColor: Boolean(body.isColor),
        originalLanguage: body.originalLanguage ? String(body.originalLanguage) : 'en',
        genres: Array.isArray(body.genres) ? body.genres : [],
        coverDataUrl: String(body.coverDataUrl || ''),
        rightsDeclared: Boolean(body.rightsDeclared),
      });

      res.status(201).json({ manga });
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to publish manga series.');
    }
  });

  app.post('/api/inkverse/studio/manga/:mangaId/chapters', requireAuth, async (req: AuthRequest, res) => {
    try {
      const mangaId = Number(req.params.mangaId);
      if (!mangaId || Number.isNaN(mangaId)) {
        res.status(400).json({ error: 'Valid mangaId is required.' });
        return;
      }

      const isPrivileged = req.user!.role === 'owner' || req.user!.role === 'admin';
      if (!isPrivileged && !checkRateLimit(`manga_chapter:${req.user!.uid}`, 20, 3_600_000)) {
        res.status(429).json({
          error: 'Upload limit reached: maximum 20 chapters per hour. Try again shortly.',
        });
        return;
      }

      const body = req.body || {};
      const result = await uploadCreatorMangaChapter(
        req.user!.uid,
        req.user!.role || 'user',
        mangaId,
        {
          chapterNumber: String(body.chapterNumber || ''),
          volumeNumber: body.volumeNumber ? String(body.volumeNumber) : null,
          title: body.title ? String(body.title) : '',
          language: body.language ? String(body.language) : 'en',
          isColor: body.isColor !== undefined ? Boolean(body.isColor) : undefined,
          rightsDeclared: Boolean(body.rightsDeclared),
          pagesDataUrls: Array.isArray(body.pagesDataUrls) ? body.pagesDataUrls : [],
        }
      );

      res.status(201).json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to publish manga chapter.');
    }
  });

  app.delete('/api/inkverse/studio/manga/:mangaId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const mangaId = Number(req.params.mangaId);
      const result = await deleteCreatorMangaOrChapter(
        req.user!.uid,
        req.user!.role || 'user',
        'manga',
        mangaId
      );
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to delete manga series.');
    }
  });

  app.delete('/api/inkverse/studio/chapters/:chapterId', requireAuth, async (req: AuthRequest, res) => {
    try {
      const chapterId = Number(req.params.chapterId);
      const result = await deleteCreatorMangaOrChapter(
        req.user!.uid,
        req.user!.role || 'user',
        'chapter',
        chapterId
      );
      res.json(result);
    } catch (err: any) {
      sendRouteError(res, err, 'Failed to delete chapter.');
    }
  });

  app.get(
    '/api/admin/inkverse/moderation',
    requireAuth,
    requireAdminOrOwner,
    async (req: AuthRequest, res) => {
      try {
        const statusFilter = req.query.status ? String(req.query.status) : 'all';
        const data = await adminListInkverseModeration(statusFilter);
        res.json(data);
      } catch (err: any) {
        sendRouteError(res, err, 'Failed to load INKVERSE moderation queue.', 500);
      }
    }
  );

  app.patch(
    '/api/admin/inkverse/moderation',
    requireAuth,
    requireAdminOrOwner,
    async (req: AuthRequest, res) => {
      try {
        const type = req.body?.type === 'chapter' ? 'chapter' : 'manga';
        const id = Number(req.body?.id);
        const statusRaw = String(req.body?.status || 'approved');
        const status =
          statusRaw === 'rejected'
            ? 'rejected'
            : statusRaw === 'pending_review'
              ? 'pending_review'
              : 'approved';
        const note = req.body?.note ? String(req.body.note) : '';
        if (!id || Number.isNaN(id)) {
          res.status(400).json({ error: 'Valid id is required.' });
          return;
        }
        const result = await adminUpdateInkverseModeration({ type, id, status, note });
        res.json(result);
      } catch (err: any) {
        sendRouteError(res, err, 'Failed to update INKVERSE moderation status.');
      }
    }
  );

  // --- VITE / STATIC FRONTEND ---
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: false,
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const portFlagIdx = process.argv.indexOf('--port');
  const cliPort =
    portFlagIdx !== -1 && process.argv[portFlagIdx + 1]
      ? Number(process.argv[portFlagIdx + 1])
      : NaN;
  const PORT =
    Number.isFinite(cliPort) && cliPort > 0 ? cliPort : Number(process.env.PORT || 3000);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`KAGE server running on http://0.0.0.0:${PORT}`);
    bootstrapDatabaseInBackground().catch((e) =>
      console.error('[KAGE Startup] Fatal background bootstrap error:', e)
    );
  });
}

startServer().catch((err) => {
  console.error('Failed to start KAGE server:', err);
  process.exit(1);
});
