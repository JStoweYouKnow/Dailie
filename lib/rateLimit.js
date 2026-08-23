const buckets = new Map();

/**
 * Best-effort per-instance window. Serverless isolates do not share memory, so
 * this is a brake on a looping tab, not a global quota.
 */
export function rateLimit({ key, limit, windowMs }) {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) {
    return {
      error: Response.json(
        { error: "Too many requests. Wait a minute and try again." },
        { status: 429 }
      ),
    };
  }
  recent.push(now);
  buckets.set(key, recent);
  return {};
}
