import { RATE_LIMIT_BUCKETS } from "./rateLimitBuckets.js";

const buckets = new Map();

function tooMany() {
  return {
    error: Response.json(
      { error: "Too many requests. Wait a minute and try again." },
      { status: 429 }
    ),
  };
}

/**
 * In-memory window for tests and when Convex is unreachable.
 * Isolates do not share this map.
 */
export function rateLimitMemory({ key, limit, windowMs }) {
  const now = Date.now();
  const recent = (buckets.get(key) || []).filter((t) => now - t < windowMs);
  if (recent.length >= limit) return tooMany();
  recent.push(now);
  buckets.set(key, recent);
  return {};
}

function bearerToken(request) {
  const header = request && request.headers && request.headers.get("authorization");
  return String(header || "").replace(/^Bearer\s+/i, "").trim();
}

async function consumeShared({ bucket, request }) {
  const spec = RATE_LIMIT_BUCKETS[bucket];
  if (!spec) return null;
  const convexUrl = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL || "";
  const token = bearerToken(request);
  if (!convexUrl || !token) return null;

  try {
    const { ConvexHttpClient } = await import("convex/browser");
    const { api } = await import("../convex/_generated/api.js");
    const client = new ConvexHttpClient(convexUrl);
    client.setAuth(token);
    const result = await client.mutation(api.rateLimit.consume, { bucket });
    if (result && result.ok === false) return tooMany();
    if (result && result.ok === true) return {};
  } catch (err) {
    return null;
  }
  return null;
}

/**
 * Shared Convex window when a session token is present, else this isolate.
 * `bucket` must be a key in RATE_LIMIT_BUCKETS.
 */
export async function rateLimit({ bucket, key, limit, windowMs, request }) {
  const spec = RATE_LIMIT_BUCKETS[bucket] || { limit, windowMs };
  const memoryKey = key || `${bucket}:anon`;
  const shared = await consumeShared({ bucket, request });
  if (shared) return shared;
  return rateLimitMemory({
    key: memoryKey,
    limit: spec.limit ?? limit,
    windowMs: spec.windowMs ?? windowMs,
  });
}
