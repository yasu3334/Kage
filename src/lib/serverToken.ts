import crypto from 'crypto';

export const OWNER_EMAIL = 'yaseenahmd1107@gmail.com';
export const OWNER_PASSWORD = 'YAS33N AHM9D';
export const OWNER_UID = 'owner_yaseen';
export const OWNER_USERNAME = 'yaseen';
export const OWNER_DISPLAY_NAME = 'Yaseen Ahmad';
export const OWNER_BIO =
  'Founder & Sovereign Owner of KAGE — Architect of The Anime Universe. Forging the realm where every anime fan becomes a fandom.';

const TOKEN_PREFIX = 'kage_srv.';

function getSigningSecret(): string {
  return (
    process.env.KAGE_SESSION_SECRET ||
    process.env.DATABASE_URL ||
    'kage-sovereign-anime-universe-secret-v1'
  );
}

export interface ServerSessionClaims {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
  role?: string;
  sid?: string;
  iat: number;
  exp: number;
}

export function signServerToken(claims: {
  uid: string;
  email: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
  role?: string;
  sid?: string;
}): string {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload: ServerSessionClaims = {
    uid: claims.uid,
    email: claims.email,
    name: claims.name,
    picture: claims.picture,
    email_verified: claims.email_verified ?? true,
    role: claims.role || 'user',
    sid: claims.sid,
    iat: nowSec,
    exp: nowSec + 60 * 60 * 24 * 14, // 14 days
  };

  const payloadB64 = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');

  return `${TOKEN_PREFIX}${payloadB64}.${sig}`;
}

export function verifyServerToken(token: string): ServerSessionClaims | null {
  if (!token || !token.startsWith(TOKEN_PREFIX)) return null;
  const rest = token.slice(TOKEN_PREFIX.length);
  const dotIdx = rest.indexOf('.');
  if (dotIdx <= 0) return null;

  const payloadB64 = rest.slice(0, dotIdx);
  const sig = rest.slice(dotIdx + 1);
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(payloadB64)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payloadB64, 'base64url').toString('utf8')
    ) as ServerSessionClaims;
    if (!parsed.uid || !parsed.exp) return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt:${salt}:${derived}`;
}

export function verifyPasswordScrypt(password: string, stored: string): boolean {
  if (!stored || !stored.startsWith('scrypt:')) return false;
  const parts = stored.split(':');
  if (parts.length !== 3) return false;
  const [, salt, hashHex] = parts;
  const derived = crypto.scryptSync(password, salt, 64);
  const expected = Buffer.from(hashHex, 'hex');
  if (derived.length !== expected.length) return false;
  return crypto.timingSafeEqual(derived, expected);
}

export function signMediaAccessToken(params: {
  assetId: number;
  conversationId: number;
  viewerUid: string;
  ttlSeconds?: number;
}): string {
  const exp = Math.floor(Date.now() / 1000) + (params.ttlSeconds || 60 * 60 * 12);
  const body = Buffer.from(
    JSON.stringify({
      a: params.assetId,
      c: params.conversationId,
      u: params.viewerUid,
      e: exp,
    }),
    'utf8'
  ).toString('base64url');
  const sig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(`media:${body}`)
    .digest('base64url');
  return `${body}.${sig}`;
}

export function verifyMediaAccessToken(
  token: string | undefined | null,
  expectedAssetId: number
): { assetId: number; conversationId: number; viewerUid: string } | null {
  if (!token || typeof token !== 'string') return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expectedSig = crypto
    .createHmac('sha256', getSigningSecret())
    .update(`media:${body}`)
    .digest('base64url');
  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }
  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (
      parsed.a !== expectedAssetId ||
      !parsed.u ||
      !parsed.c ||
      parsed.e < Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return {
      assetId: Number(parsed.a),
      conversationId: Number(parsed.c),
      viewerUid: String(parsed.u),
    };
  } catch {
    return null;
  }
}

