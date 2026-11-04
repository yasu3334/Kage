import type { Request, Response, NextFunction } from 'express';
import type { AuthRequest } from '../middleware/auth.ts';

interface Bucket {
  timestamps: number[];
}

export function createRateLimiter(options: {
  windowMs: number;
  max: number;
  message: string;
}) {
  const buckets = new Map<string, Bucket>();

  // Periodic cleanup to keep memory bounded
  setInterval(() => {
    const cutoff = Date.now() - options.windowMs;
    for (const [key, bucket] of buckets.entries()) {
      bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);
      if (bucket.timestamps.length === 0) buckets.delete(key);
    }
  }, Math.max(30_000, options.windowMs)).unref?.();

  return (req: Request, res: Response, next: NextFunction) => {
    const authReq = req as AuthRequest;
    const ip =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket.remoteAddress ||
      'local';
    const key = authReq.user?.uid ? `uid:${authReq.user.uid}` : `ip:${ip}`;
    const now = Date.now();
    const cutoff = now - options.windowMs;

    const bucket = buckets.get(key) || { timestamps: [] };
    bucket.timestamps = bucket.timestamps.filter((t) => t > cutoff);

    if (bucket.timestamps.length >= options.max) {
      res.status(429).json({ error: options.message });
      return;
    }

    bucket.timestamps.push(now);
    buckets.set(key, bucket);
    next();
  };
}
