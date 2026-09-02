import { mutation } from "./_generated/server";
import { v } from "convex/values";
import { RATE_LIMIT_BUCKETS } from "../lib/rateLimitBuckets.js";

const bucketValidator = v.union(
  v.literal("files"),
  v.literal("blob-upload"),
  v.literal("transcribe"),
  v.literal("send-email"),
  v.literal("draft-email"),
  v.literal("google-sync")
);

/**
 * Shared hourly windows for Vercel /api routes. Limits live here, not in the
 * caller, so a crafted Convex client cannot raise its own cap.
 */
export const consume = mutation({
  args: { bucket: bucketValidator },
  returns: v.object({ ok: v.boolean() }),
  handler: async (ctx, { bucket }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not authenticated");

    const spec = RATE_LIMIT_BUCKETS[bucket];
    const now = Date.now();
    const key = `${bucket}:${identity.subject}`;
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();

    const hits = ((existing && existing.hits) || []).filter((t) => now - t < spec.windowMs);
    if (hits.length >= spec.limit) return { ok: false };
    hits.push(now);

    if (existing) await ctx.db.patch(existing._id, { hits });
    else await ctx.db.insert("rateLimits", { key, hits });
    return { ok: true };
  },
});
