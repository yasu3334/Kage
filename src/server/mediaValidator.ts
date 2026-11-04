import crypto from 'crypto';
import { GoogleGenAI } from '@google/genai';

export interface ValidatedMediaResult {
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sha256: string;
  cleanBase64: string;
  moderationStatus: 'verified_ai' | 'pending_review';
  moderationNote?: string;
}

function parseDataUrl(input: string): { declaredMime: string; buffer: Buffer; cleanBase64: string } {
  const trimmed = input.trim();
  const match = /^data:([a-zA-Z0-9.+/-]+);base64,([A-Za-z0-9+/=\s]+)$/.exec(trimmed);
  if (!match) {
    throw new Error('Invalid media format. Expected a base64-encoded image or video file.');
  }
  const declaredMime = match[1].toLowerCase();
  const cleanBase64 = match[2].replace(/\s+/g, '');
  if (!cleanBase64 || cleanBase64.length < 32) {
    throw new Error('Uploaded file is empty or corrupted.');
  }
  const buffer = Buffer.from(cleanBase64, 'base64');
  if (buffer.length === 0) {
    throw new Error('Uploaded file could not be decoded.');
  }
  return { declaredMime, buffer, cleanBase64 };
}

function detectImageMagicAndDimensions(buf: Buffer): {
  mimeType: 'image/png' | 'image/jpeg' | 'image/webp';
  width: number;
  height: number;
} {
  if (buf.length < 24) {
    throw new Error('File is too small to be a valid image.');
  }

  // Reject SVG / XML / HTML / script payloads disguised with an image extension
  const headAscii = buf.subarray(0, Math.min(256, buf.length)).toString('utf8').trimStart().toLowerCase();
  if (
    headAscii.startsWith('<svg') ||
    headAscii.startsWith('<!doctype') ||
    headAscii.startsWith('<html') ||
    headAscii.startsWith('<?xml') ||
    headAscii.includes('<script')
  ) {
    throw new Error('SVG, HTML, and script files are rejected for security.');
  }

  // 1. PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR at bytes 12..16 ("IHDR"), width at 16..20, height at 20..24
  if (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  ) {
    const ihdr = buf.subarray(12, 16).toString('ascii');
    if (ihdr !== 'IHDR') {
      throw new Error('Corrupted PNG header (missing IHDR chunk).');
    }
    const width = buf.readUInt32BE(16);
    const height = buf.readUInt32BE(20);
    return { mimeType: 'image/png', width, height };
  }

  // 2. JPEG: FF D8 FF ... scan markers for SOF0..SOF3 / SOF5..SOF15
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) {
    let offset = 2;
    while (offset + 9 < buf.length) {
      if (buf[offset] !== 0xff) {
        offset++;
        continue;
      }
      const marker = buf[offset + 1];
      if (marker === 0xff) {
        offset++;
        continue;
      }
      if (marker === 0xd8 || marker === 0xd9 || (marker >= 0xd0 && marker <= 0xd7)) {
        offset += 2;
        continue;
      }
      const segLength = buf.readUInt16BE(offset + 2);
      if (segLength < 2 || offset + 2 + segLength > buf.length) {
        break;
      }
      const isSof =
        (marker >= 0xc0 && marker <= 0xc3) ||
        (marker >= 0xc5 && marker <= 0xc7) ||
        (marker >= 0xc9 && marker <= 0xcb) ||
        (marker >= 0xcd && marker <= 0xcf);
      if (isSof && offset + 9 <= buf.length) {
        const height = buf.readUInt16BE(offset + 5);
        const width = buf.readUInt16BE(offset + 7);
        return { mimeType: 'image/jpeg', width, height };
      }
      offset += 2 + segLength;
    }
    throw new Error('Corrupted JPEG file (could not read image dimensions).');
  }

  // 3. WebP: "RIFF" .... "WEBP"
  if (
    buf.subarray(0, 4).toString('ascii') === 'RIFF' &&
    buf.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    const chunkType = buf.subarray(12, 16).toString('ascii');
    if (chunkType === 'VP8X' && buf.length >= 30) {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { mimeType: 'image/webp', width, height };
    }
    if (chunkType === 'VP8 ' && buf.length >= 30) {
      const width = buf.readUInt16LE(26) & 0x3fff;
      const height = buf.readUInt16LE(28) & 0x3fff;
      return { mimeType: 'image/webp', width, height };
    }
    if (chunkType === 'VP8L' && buf.length >= 25) {
      const bits = buf.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return { mimeType: 'image/webp', width, height };
    }
    throw new Error('Unsupported or corrupted WebP header.');
  }

  throw new Error(
    'Unsupported file contents. Only valid PNG, JPEG, or WebP images are accepted.'
  );
}

function detectVideoMagic(buf: Buffer): { mimeType: 'video/mp4' | 'video/webm' } {
  if (buf.length < 32) {
    throw new Error('Video file is too small or corrupted.');
  }
  // MP4 / ISO Base Media File Format: bytes 4..8 === 'ftyp'
  const boxType = buf.subarray(4, 8).toString('ascii');
  if (boxType === 'ftyp') {
    return { mimeType: 'video/mp4' };
  }
  // WebM / Matroska EBML header: 1A 45 DF A3
  if (buf[0] === 0x1a && buf[1] === 0x45 && buf[2] === 0xdf && buf[3] === 0xa3) {
    return { mimeType: 'video/webm' };
  }
  throw new Error(
    'Unsupported video container. Upload an MP4 (H.264/AAC) or WebM video clip.'
  );
}

export function isGeminiModerationConfigured(): boolean {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  return Boolean(key && key !== 'MY_GEMINI_API_KEY' && key.length > 15);
}

async function classifyAnimeAvatarIfConfigured(
  mimeType: string,
  cleanBase64: string
): Promise<{
  checked: boolean;
  approved: boolean;
  reason?: string;
}> {
  if (!isGeminiModerationConfigured()) {
    return { checked: false, approved: true };
  }

  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: [
        {
          inlineData: {
            mimeType,
            data: cleanBase64,
          },
        },
        {
          text: 'Inspect this uploaded profile avatar for an anime community platform. Respond ONLY in strict JSON: {"isSafe": boolean, "isAnimeOrIllustrated": boolean, "confidence": "high"|"medium"|"low", "reason": "short explanation"}. Mark isSafe=false if explicit/NSFW/gore. Mark isAnimeOrIllustrated=true for anime, manga, manhwa, game/illustrated art, or stylized avatars, and false ONLY if it is clearly a real-world photograph of a real person or random non-art object with high confidence.',
        },
      ],
    });

    const rawText = (response.text || '').trim();
    const jsonMatch = /\{[\s\S]*\}/.exec(rawText);
    if (!jsonMatch) {
      return { checked: false, approved: true };
    }
    const parsed = JSON.parse(jsonMatch[0]);
    if (parsed.isSafe === false) {
      return {
        checked: true,
        approved: false,
        reason: 'Upload rejected: Image did not pass KAGE community safety moderation.',
      };
    }
    if (parsed.isAnimeOrIllustrated === false && parsed.confidence === 'high') {
      return {
        checked: true,
        approved: false,
        reason:
          'Upload rejected: KAGE avatars represent anime, manga, or illustrated characters rather than real-world photos.',
      };
    }
    return { checked: true, approved: true };
  } catch {
    // Honest handling when external API errors or quota is unavailable
    return { checked: false, approved: true };
  }
}

export async function validateAvatarUploadPayload(
  dataUrl: string
): Promise<ValidatedMediaResult> {
  const { buffer, cleanBase64 } = parseDataUrl(dataUrl);

  const MAX_AVATAR_BYTES = 5 * 1024 * 1024; // 5 MB
  const MIN_AVATAR_BYTES = 400; // Reject 1x1 pixels / empty stubs
  if (buffer.length < MIN_AVATAR_BYTES) {
    throw new Error('Avatar image file is too small. Choose a clear anime character portrait (at least 128x128 px).');
  }
  if (buffer.length > MAX_AVATAR_BYTES) {
    throw new Error('Avatar file exceeds the 5 MB limit.');
  }

  const { mimeType, width, height } = detectImageMagicAndDimensions(buffer);

  if (width < 128 || height < 128) {
    throw new Error(
      `Avatar dimensions (${width}x${height}px) are too small. Minimum size is 128x128 pixels.`
    );
  }
  if (width > 4096 || height > 4096) {
    throw new Error(
      `Avatar dimensions (${width}x${height}px) exceed the 4096x4096 pixel maximum.`
    );
  }
  const ratio = width / height;
  if (ratio < 0.3 || ratio > 3.3) {
    throw new Error('Avatar aspect ratio is too extreme. Use a portrait or square character image.');
  }

  const moderation = await classifyAnimeAvatarIfConfigured(mimeType, cleanBase64);
  if (!moderation.approved) {
    throw new Error(moderation.reason || 'Avatar upload was rejected by character validation.');
  }

  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');

  return {
    mimeType,
    byteSize: buffer.length,
    width,
    height,
    sha256,
    cleanBase64,
    moderationStatus: moderation.checked ? 'verified_ai' : 'pending_review',
    moderationNote: moderation.checked
      ? 'Verified anime/illustrated avatar.'
      : 'Binary & dimension checks passed; queued under standard community review workflow.',
  };
}

export function validatePostImagePayload(dataUrl: string): ValidatedMediaResult {
  const { buffer, cleanBase64 } = parseDataUrl(dataUrl);
  const MAX_IMAGE_BYTES = 8 * 1024 * 1024; // 8 MB
  if (buffer.length < 300) {
    throw new Error('Image file is too small or corrupted.');
  }
  if (buffer.length > MAX_IMAGE_BYTES) {
    throw new Error('Post image exceeds the 8 MB limit.');
  }
  const { mimeType, width, height } = detectImageMagicAndDimensions(buffer);
  if (width < 96 || height < 96) {
    throw new Error(`Image dimensions (${width}x${height}px) are too small (minimum 96x96px).`);
  }
  if (width > 6000 || height > 6000) {
    throw new Error('Image dimensions exceed 6000x6000 pixels.');
  }
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    mimeType,
    byteSize: buffer.length,
    width,
    height,
    sha256,
    cleanBase64,
    moderationStatus: 'pending_review',
  };
}

export function validatePostVideoPayload(dataUrl: string): ValidatedMediaResult {
  const { buffer, cleanBase64 } = parseDataUrl(dataUrl);
  const MAX_VIDEO_BYTES = 15 * 1024 * 1024; // 15 MB
  if (buffer.length < 512) {
    throw new Error('Video file is empty or corrupted.');
  }
  if (buffer.length > MAX_VIDEO_BYTES) {
    throw new Error('Video clip exceeds the 15 MB upload limit.');
  }
  const { mimeType } = detectVideoMagic(buffer);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    mimeType,
    byteSize: buffer.length,
    width: null,
    height: null,
    sha256,
    cleanBase64,
    moderationStatus: 'pending_review',
  };
}

export function validateSplashVideoPayload(dataUrl: string): ValidatedMediaResult {
  const { buffer, cleanBase64 } = parseDataUrl(dataUrl);
  const MAX_SPLASH_VIDEO_BYTES = 32 * 1024 * 1024; // 32 MB for high-bitrate 15-20s 1080p/4K clip
  if (buffer.length < 1024) {
    throw new Error('Authorized video file is empty or corrupted.');
  }
  if (buffer.length > MAX_SPLASH_VIDEO_BYTES) {
    throw new Error(
      'Splash video exceeds the 32 MB upload limit. Trim the clip to 15–20 seconds in MP4 (H.264) or WebM format.'
    );
  }
  const { mimeType } = detectVideoMagic(buffer);
  const sha256 = crypto.createHash('sha256').update(buffer).digest('hex');
  return {
    mimeType,
    byteSize: buffer.length,
    width: null,
    height: null,
    sha256,
    cleanBase64,
    moderationStatus: 'verified_ai',
  };
}

