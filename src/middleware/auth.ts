import type { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../lib/firebase-admin.ts';
import { verifyServerToken } from '../lib/serverToken.ts';
import { db } from '../db/index.ts';
import { sessions, users } from '../db/schema.ts';
import { eq } from 'drizzle-orm';

export interface AuthUserClaims {
  uid: string;
  email?: string;
  name?: string;
  picture?: string;
  email_verified?: boolean;
  iat?: number;
  role?: string;
  sid?: string;
}

export interface AuthRequest extends Request {
  user?: AuthUserClaims;
}

const SESSION_CACHE_TTL_MS = 15_000;
const MAX_SESSION_CACHE = 500;
const verifiedTokenCache = new Map<
  string,
  { claims: AuthUserClaims; expiresAt: number }
>();

export function invalidateAuthCacheForUser(uid: string) {
  for (const [k, v] of verifiedTokenCache.entries()) {
    if (v.claims.uid === uid) verifiedTokenCache.delete(k);
  }
}

export function clearAllAuthCache() {
  verifiedTokenCache.clear();
}

function putVerifiedCache(cacheKey: string, claims: AuthUserClaims) {
  if (verifiedTokenCache.size >= MAX_SESSION_CACHE) {
    const oldest = verifiedTokenCache.keys().next().value;
    if (oldest !== undefined) verifiedTokenCache.delete(oldest);
  }
  verifiedTokenCache.set(cacheKey, {
    claims,
    expiresAt: Date.now() + SESSION_CACHE_TTL_MS,
  });
}

export async function verifyAnyAuthToken(token: string): Promise<AuthUserClaims> {
  const srvClaims = verifyServerToken(token);
  if (srvClaims) {
    const cacheKey = `srv:${srvClaims.sid || srvClaims.uid}:${token.slice(-16)}`;
    const cached = verifiedTokenCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.claims;
    }

    if (srvClaims.sid) {
      const [sess] = await db
        .select({ revokedAt: sessions.revokedAt })
        .from(sessions)
        .where(eq(sessions.sessionId, srvClaims.sid))
        .limit(1);
      if (!sess || sess.revokedAt !== null) {
        verifiedTokenCache.delete(cacheKey);
        throw new Error('Session has been signed out or revoked.');
      }
    }
    const [existingUser] = await db
      .select({ uid: users.uid, role: users.role })
      .from(users)
      .where(eq(users.uid, srvClaims.uid))
      .limit(1);
    if (!existingUser) {
      verifiedTokenCache.delete(cacheKey);
      throw new Error('Account no longer exists.');
    }
    const resolved: AuthUserClaims = {
      ...srvClaims,
      role: existingUser.role,
    };
    putVerifiedCache(cacheKey, resolved);
    return resolved;
  }
  const decoded = await adminAuth.verifyIdToken(token);
  return {
    uid: decoded.uid,
    email: decoded.email,
    name: decoded.name,
    picture: decoded.picture,
    email_verified: decoded.email_verified,
    iat: decoded.iat,
  };
}

export const requireAuth = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required. Please sign in to KAGE.' });
    return;
  }

  const token = authHeader.slice('Bearer '.length).trim();
  try {
    const claims = await verifyAnyAuthToken(token);
    req.user = claims;
    next();
  } catch (error) {
    console.error('Error verifying auth token:', error);
    res.status(401).json({ error: 'Invalid or expired session. Please sign in again.' });
  }
};

export const optionalAuth = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    try {
      const claims = await verifyAnyAuthToken(token);
      req.user = claims;
    } catch {
      // Proceed as anonymous visitor
    }
  }
  next();
};

export const requireAdminOrOwner = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  if (!req.user?.uid) {
    res.status(401).json({ error: 'Authentication required.' });
    return;
  }
  try {
    const [row] = await db
      .select({ role: users.role, email: users.email })
      .from(users)
      .where(eq(users.uid, req.user.uid))
      .limit(1);

    if (!row || (row.role !== 'owner' && row.role !== 'admin')) {
      res.status(403).json({
        error: 'Forbidden: Only the KAGE Owner or Administrators can access this realm.',
      });
      return;
    }
    req.user.role = row.role;
    next();
  } catch (error) {
    console.error('Admin verification failed:', error);
    res.status(500).json({ error: 'Unable to verify owner permissions.' });
  }
};
