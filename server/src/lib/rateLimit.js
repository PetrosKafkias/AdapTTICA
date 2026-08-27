import { fail } from "./errors.js";

// Minimal in-memory per-IP token bucket. Good enough for a single-instance
// deployment; a shared production deployment behind a load balancer should
// replace this with a shared store (e.g. Redis).
export function rateLimit({ windowMs, max }) {
  const hits = new Map();
  return (req, res, next) => {
    const now = Date.now();
    const key = req.ip;
    const entry = hits.get(key);
    if (!entry || now - entry.start > windowMs) {
      hits.set(key, { start: now, count: 1 });
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      fail(res, "rate_limited", "Too many requests. Please try again shortly.");
      return;
    }
    next();
  };
}
