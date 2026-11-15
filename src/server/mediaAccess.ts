import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import type { Response } from 'express';
import { and, desc, eq } from 'drizzle-orm';
import { db } from '../db/index.ts';
import {
  communityMemberships,
  conversationMembers,
  mediaAssets,
  users,
} from '../db/schema.ts';
import { HttpError, hasBlockBetween } from '../db/profileSystemRepo.ts';
import {
  validateAvatarUploadPayload,
  validateMangaArtworkPayload,
  validatePostImagePayload,
  validatePostVideoPayload,
  validateSplashVideoPayload,
} from './mediaValidator.ts';
import type { AuthRequest } from '../middleware/auth.ts';

function getMediaSecret(): string {
  return (
    process.env.KAGE_SESSION_SECRET ||
    process.env.DATABASE_URL ||
    'kage-sovereign-anime-universe-secret-v1'
  );
}

interface CachedAssetBinary {
  mimeType: string;
  sha256: string;
  visibility: string;
  ownerUid: string;
  conversationId: number | null;
  communityId: number | null;
  clashId: number | null;
  buffer: Buffer;
}

const binaryCache = new Map<number, CachedAssetBinary>();
const MAX_CACHE_ITEMS = 45;

function cacheMediaAsset(id: number, entry: CachedAssetBinary) {
  if (entry.buffer.length > 34 * 1024 * 1024) return;
  if (binaryCache.size >= MAX_CACHE_ITEMS) {
    const oldest = binaryCache.keys().next().value;
    if (oldest !== undefined) binaryCache.delete(oldest);
  }
  binaryCache.set(id, entry);
}

export function evictMediaCache(id: number) {
  binaryCache.delete(id);
}

export function signScopedMediaToken(params: {
  assetId: number;
  viewerUid: string;
  scopeType: 'conversation' | 'guild';
  scopeId: number;
  ttlSeconds?: number;
}): string {
  const exp = Math.floor(Date.now() / 1000) + (params.ttlSeconds || 60 * 60 * 12);
  const body = Buffer.from(
    JSON.stringify({
      a: params.assetId,
      u: params.viewerUid,
      t: params.scopeType,
      s: params.scopeId,
      e: exp,
    }),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getMediaSecret())
    .update(`kagemedia:${body}`)
    .digest('base64url');
  return `${body}.${sig}`;
}

export function verifyScopedMediaToken(
  token: string | undefined | null,
  expectedAssetId: number
): { viewerUid: string; scopeType: 'conversation' | 'guild'; scopeId: number } | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = crypto
    .createHmac('sha256', getMediaSecret())
    .update(`kagemedia:${body}`)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (
      Number(parsed.a) !== expectedAssetId ||
      !parsed.u ||
      !parsed.t ||
      !parsed.s ||
      Number(parsed.e) < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return {
      viewerUid: String(parsed.u),
      scopeType: parsed.t === 'guild' ? 'guild' : 'conversation',
      scopeId: Number(parsed.s),
    };
  } catch {
    return null;
  }
}

export function signMediaUrlForViewer(
  rawUrl: string | null | undefined,
  viewerUid: string | undefined,
  scope?: { type: 'conversation' | 'guild'; id: number }
): string | null {
  if (!rawUrl) return null;
  if (!viewerUid || !scope) return rawUrl;
  const match = /^\/api\/media\/(\d+)/.exec(rawUrl);
  if (!match) return rawUrl;
  const assetId = Number(match[1]);
  if (!assetId) return rawUrl;
  const token = signScopedMediaToken({
    assetId,
    viewerUid,
    scopeType: scope.type,
    scopeId: scope.id,
  });
  return `/api/media/${assetId}?mt=${encodeURIComponent(token)}`;
}

export async function uploadValidatedMediaAsset(
  ownerUid: string,
  params: {
    dataUrl: string;
    mediaType: 'image' | 'video' | 'avatar';
    purpose:
      | 'avatar'
      | 'post_image'
      | 'post_video'
      | 'post_poster'
      | 'dm_image'
      | 'dm_video'
      | 'guild_media'
      | 'clash_image'
      | 'clash_video'
      | 'splash_intro_video'
      | 'manga_cover'
      | 'manga_page';
    visibility?: 'public' | 'private_conversation' | 'private_guild';
    conversationId?: number | null;
    communityId?: number | null;
    clashId?: number | null;
    durationSec?: number | null;
    clientWidth?: number | null;
    clientHeight?: number | null;
  }
) {
  let validated;
  try {
    if (params.purpose === 'splash_intro_video') {
      validated = validateSplashVideoPayload(params.dataUrl);
    } else if (params.purpose === 'manga_cover') {
      validated = await validateMangaArtworkPayload(params.dataUrl, 'cover');
    } else if (params.purpose === 'manga_page') {
      validated = await validateMangaArtworkPayload(params.dataUrl, 'page');
    } else if (params.mediaType === 'avatar') {
      validated = await validateAvatarUploadPayload(params.dataUrl);
    } else if (params.mediaType === 'video') {
      validated = validatePostVideoPayload(params.dataUrl);
    } else {
      validated = validatePostImagePayload(params.dataUrl);
    }
  } catch (err: any) {
    throw new HttpError(400, err?.message || 'Media upload validation failed.');
  }

  const width =
    validated.width ??
    (params.clientWidth && params.clientWidth > 0 && params.clientWidth <= 7680
      ? Math.round(params.clientWidth)
      : null);
  const height =
    validated.height ??
    (params.clientHeight && params.clientHeight > 0 && params.clientHeight <= 4320
      ? Math.round(params.clientHeight)
      : null);
  const durationSec =
    params.durationSec && params.durationSec > 0
      ? Math.max(1, Math.min(3600, Math.round(params.durationSec)))
      : null;

  const visibility = params.visibility || 'public';

  const [inserted] = await db
    .insert(mediaAssets)
    .values({
      ownerUid,
      purpose: params.purpose,
      visibility,
      conversationId: params.conversationId ?? null,
      communityId: params.communityId ?? null,
      clashId: params.clashId ?? null,
      mimeType: validated.mimeType,
      byteSize: validated.byteSize,
      width,
      height,
      durationSec,
      sha256: validated.sha256,
      moderationStatus: validated.moderationStatus,
      dataBase64: validated.cleanBase64,
    })
    .returning({
      id: mediaAssets.id,
      mimeType: mediaAssets.mimeType,
      byteSize: mediaAssets.byteSize,
      width: mediaAssets.width,
      height: mediaAssets.height,
      durationSec: mediaAssets.durationSec,
      visibility: mediaAssets.visibility,
      moderationStatus: mediaAssets.moderationStatus,
    });

  const buffer = Buffer.from(validated.cleanBase64, 'base64');
  cacheMediaAsset(inserted.id, {
    mimeType: validated.mimeType,
    sha256: validated.sha256,
    visibility,
    ownerUid,
    conversationId: params.conversationId ?? null,
    communityId: params.communityId ?? null,
    clashId: params.clashId ?? null,
    buffer,
  });

  // Never falsely label non-UHD media as 4K (requires verified >= 3840x2160 resolution)
  const is4K = Boolean(width && height && width >= 3840 && height >= 2160);

  return {
    assetId: inserted.id,
    url: `/api/media/${inserted.id}`,
    mimeType: inserted.mimeType,
    byteSize: inserted.byteSize,
    width: inserted.width,
    height: inserted.height,
    durationSec: inserted.durationSec,
    visibility: inserted.visibility,
    is4K,
  };
}

async function loadMediaAssetWithMeta(assetId: number): Promise<CachedAssetBinary | null> {
  const cached = binaryCache.get(assetId);
  if (cached) return cached;

  const [row] = await db
    .select()
    .from(mediaAssets)
    .where(eq(mediaAssets.id, assetId))
    .limit(1);

  if (!row) return null;

  const buffer = Buffer.from(row.dataBase64, 'base64');
  const entry: CachedAssetBinary = {
    mimeType: row.mimeType,
    sha256: row.sha256,
    visibility: row.visibility || 'public',
    ownerUid: row.ownerUid,
    conversationId: row.conversationId ?? null,
    communityId: row.communityId ?? null,
    clashId: row.clashId ?? null,
    buffer,
  };
  cacheMediaAsset(assetId, entry);
  return entry;
}

async function authorizeMediaViewer(
  assetId: number,
  asset: CachedAssetBinary,
  req: AuthRequest
): Promise<boolean> {
  let effectiveUid = req.user?.uid;
  const mtRaw = req.query?.mt ? String(req.query.mt) : null;
  if (!effectiveUid && mtRaw) {
    const verified = verifyScopedMediaToken(mtRaw, assetId);
    if (verified) {
      effectiveUid = verified.viewerUid;
    }
  }

  if (asset.visibility === 'private_conversation') {
    if (!effectiveUid) return false;
    if (effectiveUid === asset.ownerUid) return true;
    if (!asset.conversationId) return false;

    const [member] = await db
      .select({ id: conversationMembers.id })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, asset.conversationId),
          eq(conversationMembers.userUid, effectiveUid)
        )
      )
      .limit(1);
    return Boolean(member);
  }

  if (asset.visibility === 'private_guild') {
    if (!effectiveUid) return false;
    if (effectiveUid === asset.ownerUid) return true;
    const [uRow] = await db
      .select({ role: users.role })
      .from(users)
      .where(eq(users.uid, effectiveUid))
      .limit(1);
    if (uRow?.role === 'owner' || uRow?.role === 'admin') return true;
    if (!asset.communityId) return false;

    const [member] = await db
      .select({ id: communityMemberships.id })
      .from(communityMemberships)
      .where(
        and(
          eq(communityMemberships.communityId, asset.communityId),
          eq(communityMemberships.userUid, effectiveUid)
        )
      )
      .limit(1);
    return Boolean(member);
  }

  // Public asset: block check if authenticated viewer
  if (effectiveUid && effectiveUid !== asset.ownerUid) {
    const block = await hasBlockBetween(effectiveUid, asset.ownerUid);
    if (block.bBlockedA) return false;
  }
  return true;
}

export async function handleStreamMediaAsset(req: AuthRequest, res: Response) {
  const assetId = Number(req.params.id);
  if (!assetId || Number.isNaN(assetId)) {
    res.status(400).json({ error: 'Invalid media asset ID.' });
    return;
  }

  const asset = await loadMediaAssetWithMeta(assetId);
  if (!asset) {
    res.status(404).json({ error: 'Media asset not found.' });
    return;
  }

  const allowed = await authorizeMediaViewer(assetId, asset, req);
  if (!allowed) {
    res.status(403).json({ error: 'Forbidden: You do not have permission to view this media.' });
    return;
  }

  const totalLength = asset.buffer.length;
  const isPrivate = asset.visibility !== 'public';

  res.setHeader('Content-Type', asset.mimeType);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'"
  );
  res.setHeader('ETag', `"${asset.sha256}"`);
  res.setHeader(
    'Cache-Control',
    isPrivate ? 'private, max-age=300, must-revalidate' : 'public, max-age=86400, immutable'
  );

  if (req.headers['if-none-match'] === `"${asset.sha256}"` && !req.headers.range) {
    res.status(304).end();
    return;
  }

  const rangeHeader = req.headers.range;
  if (rangeHeader && rangeHeader.startsWith('bytes=')) {
    const parts = rangeHeader.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : totalLength - 1;

    if (Number.isNaN(start) || Number.isNaN(end) || start < 0 || start >= totalLength || end < start) {
      res.status(416).setHeader('Content-Range', `bytes */${totalLength}`).end();
      return;
    }

    const clampedEnd = Math.min(end, totalLength - 1);
    const chunkSize = clampedEnd - start + 1;
    const chunk = asset.buffer.subarray(start, clampedEnd + 1);

    res.status(206);
    res.setHeader('Content-Range', `bytes ${start}-${clampedEnd}/${totalLength}`);
    res.setHeader('Content-Length', String(chunkSize));
    res.end(chunk);
    return;
  }

  res.status(200);
  res.setHeader('Content-Length', String(totalLength));
  res.end(asset.buffer);
}

export interface SplashVideoConfigPayload {
  configured: boolean;
  sourceType: 'bundled' | 'uploaded' | 'env' | 'stream' | 'none';
  videoUrl: string | null;
  mimeType: string | null;
  posterUrl?: string | null;
  fallbackLogoUrl?: string | null;
  assetId: number | null;
  durationSec: number | null;
  width: number | null;
  height: number | null;
  byteSize: number | null;
  updatedAt: string | null;
  fallbackVideoUrl?: string | null;
  fallbackMimeType?: string | null;
  startOffsetSec?: number | null;
}

let cachedSplashConfig: SplashVideoConfigPayload | null = null;

function resolveOptionalPublicAssetUrl(relPath: string): string | null {
  const cleanRel = relPath.startsWith('/') ? relPath.slice(1) : relPath;
  const diskPath = path.resolve(process.cwd(), `public/${cleanRel}`);
  try {
    if (fs.existsSync(diskPath)) {
      const stat = fs.statSync(diskPath);
      if (stat.isFile() && stat.size > 256) {
        return `/${cleanRel}?v=${Math.floor(stat.mtimeMs)}`;
      }
    }
  } catch {
    // ignore fs check errors
  }
  return null;
}

function findBundledAuthorizedSplashVideo(): SplashVideoConfigPayload | null {
  const baseNames = ['kage-intro', 'kage-zenitsu-intro', 'splash-intro'];

  const foundAssets: {
    relUrl: string;
    mime: string;
    size: number;
    mtimeMs: number;
    mtimeIso: string;
  }[] = [];

  for (const base of baseNames) {
    const formats: { ext: 'mp4' | 'webm'; mime: string }[] = [
      { ext: 'mp4', mime: 'video/mp4' },
      { ext: 'webm', mime: 'video/webm' },
    ];
    for (const fmt of formats) {
      const relUrl = `/assets/${base}.${fmt.ext}`;
      const diskPath = path.resolve(process.cwd(), `public/assets/${base}.${fmt.ext}`);
      try {
        if (fs.existsSync(diskPath)) {
          const stat = fs.statSync(diskPath);
          if (stat.isFile() && stat.size > 1024) {
            foundAssets.push({
              relUrl: `${relUrl}?v=${Math.floor(stat.mtimeMs)}`,
              mime: fmt.mime,
              size: stat.size,
              mtimeMs: stat.mtimeMs,
              mtimeIso: stat.mtime.toISOString(),
            });
          }
        }
      } catch {
        // ignore fs check errors
      }
    }
    if (foundAssets.length > 0) {
      break;
    }
  }

  if (foundAssets.length === 0) {
    return null;
  }

  const primary = foundAssets[0];
  const secondary = foundAssets.find((item) => item.mime !== primary.mime) || null;
  const posterUrl = resolveOptionalPublicAssetUrl('/assets/kage-intro-poster.jpg');
  const fallbackLogoUrl =
    resolveOptionalPublicAssetUrl('/assets/kage-intro-final-hd.png') || '/assets/kage-logo.png';

  return {
    configured: true,
    sourceType: 'bundled',
    videoUrl: primary.relUrl,
    mimeType: primary.mime,
    posterUrl,
    fallbackLogoUrl,
    assetId: null,
    durationSec: 11,
    width: 1920,
    height: 1080,
    byteSize: primary.size,
    updatedAt: primary.mtimeIso,
    fallbackVideoUrl: secondary ? secondary.relUrl : null,
    fallbackMimeType: secondary ? secondary.mime : null,
    startOffsetSec: 0,
  };
}

export async function getActiveSplashVideoConfig(): Promise<SplashVideoConfigPayload> {
  // 1. Return cached uploaded/env override if already resolved
  if (cachedSplashConfig) {
    return cachedSplashConfig;
  }

  const defaultPosterUrl = resolveOptionalPublicAssetUrl('/assets/kage-intro-poster.jpg');
  const defaultFallbackLogoUrl =
    resolveOptionalPublicAssetUrl('/assets/kage-intro-final-hd.png') || '/assets/kage-logo.png';

  // 2. Check database media_assets for Founder/Admin-uploaded custom splash_intro_video
  try {
    const [latest] = await db
      .select({
        id: mediaAssets.id,
        mimeType: mediaAssets.mimeType,
        byteSize: mediaAssets.byteSize,
        width: mediaAssets.width,
        height: mediaAssets.height,
        durationSec: mediaAssets.durationSec,
        sha256: mediaAssets.sha256,
        createdAt: mediaAssets.createdAt,
      })
      .from(mediaAssets)
      .where(eq(mediaAssets.purpose, 'splash_intro_video'))
      .orderBy(desc(mediaAssets.id))
      .limit(1);

    if (latest) {
      const bundledBackup = findBundledAuthorizedSplashVideo();
      cachedSplashConfig = {
        configured: true,
        sourceType: 'uploaded',
        videoUrl: `/api/media/${latest.id}?v=${latest.sha256.slice(0, 12)}`,
        mimeType: latest.mimeType,
        posterUrl: defaultPosterUrl,
        fallbackLogoUrl: defaultFallbackLogoUrl,
        assetId: latest.id,
        durationSec: latest.durationSec ?? null,
        width: latest.width ?? null,
        height: latest.height ?? null,
        byteSize: latest.byteSize,
        updatedAt: latest.createdAt ? latest.createdAt.toISOString() : null,
        fallbackVideoUrl: bundledBackup?.videoUrl ?? null,
        fallbackMimeType: bundledBackup?.mimeType ?? null,
        startOffsetSec: 0,
      };
      return cachedSplashConfig;
    }
  } catch {
    // DB still warming up; fall through to env / bundled asset
  }

  // 3. Optional environment variable URL for a developer-configured watermark-free stream
  const envUrl = (
    process.env.AUTHORIZED_SPLASH_VIDEO_URL ||
    process.env.VITE_SPLASH_VIDEO_URL ||
    ''
  ).trim();
  if (envUrl && (/^https?:\/\//i.test(envUrl) || envUrl.startsWith('/'))) {
    const isWebm = /\.webm(\?|$)/i.test(envUrl);
    const parsedStart = Number(process.env.AUTHORIZED_SPLASH_START_SEC || 0);
    cachedSplashConfig = {
      configured: true,
      sourceType: 'env',
      videoUrl: envUrl,
      mimeType: isWebm ? 'video/webm' : 'video/mp4',
      posterUrl: defaultPosterUrl,
      fallbackLogoUrl: defaultFallbackLogoUrl,
      assetId: null,
      durationSec: null,
      width: null,
      height: null,
      byteSize: null,
      updatedAt: null,
      fallbackVideoUrl: null,
      fallbackMimeType: null,
      startOffsetSec: Number.isFinite(parsedStart) && parsedStart > 0 ? parsedStart : 0,
    };
    return cachedSplashConfig;
  }

  // 4. Bundled watermark-free 1920x1080 KAGE Zenitsu intro video (/public/assets/kage-intro.mp4 & .webm)
  const bundled = findBundledAuthorizedSplashVideo();
  if (bundled) {
    return bundled;
  }

  return {
    configured: false,
    sourceType: 'none',
    videoUrl: null,
    mimeType: null,
    posterUrl: defaultPosterUrl,
    fallbackLogoUrl: defaultFallbackLogoUrl,
    assetId: null,
    durationSec: null,
    width: null,
    height: null,
    byteSize: null,
    updatedAt: null,
    fallbackVideoUrl: null,
    fallbackMimeType: null,
    startOffsetSec: 0,
  };
}

export async function uploadSplashIntroVideo(
  ownerUid: string,
  params: {
    dataUrl: string;
    durationSec?: number | null;
    width?: number | null;
    height?: number | null;
  }
): Promise<SplashVideoConfigPayload> {
  // Remove previous uploaded splash videos so only one authoritative clip is retained
  const existingRows = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.purpose, 'splash_intro_video'));

  const uploaded = await uploadValidatedMediaAsset(ownerUid, {
    dataUrl: params.dataUrl,
    mediaType: 'video',
    purpose: 'splash_intro_video',
    visibility: 'public',
    durationSec: params.durationSec ?? null,
    clientWidth: params.width ?? null,
    clientHeight: params.height ?? null,
  });

  for (const old of existingRows) {
    if (old.id !== uploaded.assetId) {
      evictMediaCache(old.id);
      await db.delete(mediaAssets).where(eq(mediaAssets.id, old.id));
    }
  }

  cachedSplashConfig = null;
  return getActiveSplashVideoConfig();
}

export async function clearSplashIntroVideo(): Promise<SplashVideoConfigPayload> {
  const existingRows = await db
    .select({ id: mediaAssets.id })
    .from(mediaAssets)
    .where(eq(mediaAssets.purpose, 'splash_intro_video'));

  for (const row of existingRows) {
    evictMediaCache(row.id);
    await db.delete(mediaAssets).where(eq(mediaAssets.id, row.id));
  }
  cachedSplashConfig = null;
  return getActiveSplashVideoConfig();
}

