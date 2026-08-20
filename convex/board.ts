import { query, mutation } from "./_generated/server";
import { v } from "convex/values";

/** Writes stay gated. Reads return null when there is no session so the client can wait. */
async function requireIdentity(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not signed in.");
  return identity;
}

const boardReturn = v.object({
  collections: v.any(),
  team: v.array(
    v.object({
      id: v.string(),
      clerkId: v.string(),
      name: v.string(),
      email: v.string(),
      role: v.string(),
      imageUrl: v.string(),
      status: v.string(),
      lastSeenAt: v.number(),
    })
  ),
  settings: v.union(v.any(), v.null()),
  pipelines: v.union(v.any(), v.null()),
});

/**
 * The whole board in one reactive read. Convex pushes an update to every open client
 * when any of it changes, which is what makes a project one person adds appear on
 * everyone else's screen without a refresh.
 */
export const get = query({
  args: {},
  returns: v.union(boardReturn, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const rows = await ctx.db.query("records").collect();
    const collections = {};
    for (const row of rows) {
      (collections[row.collection] ||= []).push(row.data);
    }

    const members = await ctx.db.query("members").collect();
    const workspace = await ctx.db.query("workspace").collect();
    const settings = workspace.find((w) => w.key === "settings");
    const pipelines = workspace.find((w) => w.key === "pipelines");

    return {
      collections,
      // The directory is the team: anyone who has signed in belongs on it.
      team: members
        .map((m) => ({
          id: m.clerkId,
          clerkId: m.clerkId,
          name: m.name || "",
          email: m.email || "",
          role: m.role || "",
          imageUrl: m.imageUrl || "",
          status: m.status,
          lastSeenAt: m.lastSeenAt,
        }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      settings: settings ? settings.value : null,
      pipelines: pipelines ? pipelines.value : null,
    };
  },
});

/** Upsert one record. The client's own uid is the key, so ids survive the move. */
export const put = mutation({
  args: { collection: v.string(), docId: v.string(), data: v.any() },
  handler: async (ctx, { collection, docId, data }) => {
    const identity = await requireIdentity(ctx);
    const existing = await ctx.db
      .query("records")
      .withIndex("by_doc", (q) => q.eq("collection", collection).eq("docId", docId))
      .unique();

    const patch = { collection, docId, data, updatedAt: Date.now(), updatedBy: identity.subject };
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("records", patch);
  },
});

export const remove = mutation({
  args: { collection: v.string(), docId: v.string() },
  handler: async (ctx, { collection, docId }) => {
    await requireIdentity(ctx);
    const existing = await ctx.db
      .query("records")
      .withIndex("by_doc", (q) => q.eq("collection", collection).eq("docId", docId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
  },
});

/** Replace a whole collection — used for reordering and other bulk edits. */
export const putMany = mutation({
  args: { collection: v.string(), records: v.array(v.any()), prune: v.optional(v.boolean()) },
  handler: async (ctx, { collection, records, prune }) => {
    const identity = await requireIdentity(ctx);
    const existing = await ctx.db
      .query("records")
      .withIndex("by_collection", (q) => q.eq("collection", collection))
      .collect();
    const byId = new Map(existing.map((r) => [r.docId, r]));
    const now = Date.now();

    let written = 0;
    for (const record of records) {
      const docId = String(record.id);
      const prior = byId.get(docId);
      if (prior) {
        byId.delete(docId);
        // Rewriting an unchanged record costs a write and risks the transaction's
        // limits for nothing. "Populate from email" re-sends every message it has
        // seen, and almost none of them differ.
        if (JSON.stringify(prior.data) === JSON.stringify(record)) continue;
        await ctx.db.patch(prior._id, { data: record, updatedAt: now, updatedBy: identity.subject });
      } else {
        await ctx.db.insert("records", { collection, docId, data: record, updatedAt: now, updatedBy: identity.subject });
      }
      written += 1;
    }
    // Anything left was removed in this edit — unless this is one chunk of a larger
    // write, where the records not in this chunk are still perfectly alive.
    let deleted = 0;
    if (prune !== false) {
      for (const orphan of byId.values()) { await ctx.db.delete(orphan._id); deleted += 1; }
    }
    return { written, deleted, unchanged: records.length - written };
  },
});

/** Removes records no longer in the collection. Pairs with chunked putMany writes. */
export const pruneCollection = mutation({
  args: { collection: v.string(), keepIds: v.array(v.string()) },
  handler: async (ctx, { collection, keepIds }) => {
    await requireIdentity(ctx);
    const keep = new Set(keepIds);
    const existing = await ctx.db
      .query("records")
      .withIndex("by_collection", (q) => q.eq("collection", collection))
      .collect();
    let deleted = 0;
    for (const row of existing) {
      if (keep.has(row.docId)) continue;
      await ctx.db.delete(row._id);
      deleted += 1;
    }
    return { deleted };
  },
});

export const setWorkspace = mutation({
  args: { key: v.string(), value: v.any() },
  handler: async (ctx, { key, value }) => {
    await requireIdentity(ctx);
    const existing = await ctx.db
      .query("workspace")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    if (existing) await ctx.db.patch(existing._id, { value, updatedAt: Date.now() });
    else await ctx.db.insert("workspace", { key, value, updatedAt: Date.now() });
  },
});

/**
 * Called on every sign-in. Re-binds by email as well as Clerk id so that moving
 * between Clerk instances, or a rebuilt account, lands on the same row rather than
 * creating a second one.
 */
export const touchMember = mutation({
  args: { name: v.string(), email: v.string(), imageUrl: v.optional(v.string()) },
  handler: async (ctx, { name, email, imageUrl }) => {
    const identity = await requireIdentity(ctx);
    const clerkId = identity.subject;
    const now = Date.now();
    const cleanEmail = (email || "").trim().toLowerCase();

    const byClerk = await ctx.db
      .query("members")
      .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
      .unique();

    const existing =
      byClerk ||
      (cleanEmail
        ? await ctx.db
            .query("members")
            .withIndex("by_email", (q) => q.eq("email", cleanEmail))
            .unique()
        : null);

    if (existing) {
      await ctx.db.patch(existing._id, {
        clerkId,
        name: name || existing.name,
        email: cleanEmail || existing.email,
        imageUrl: imageUrl || existing.imageUrl,
        status: "active",
        lastSeenAt: now,
      });
      return existing.clerkId || clerkId;
    }

    await ctx.db.insert("members", {
      clerkId,
      name: name || cleanEmail.split("@")[0] || "New member",
      email: cleanEmail,
      role: "",
      imageUrl: imageUrl || "",
      status: "active",
      firstSeenAt: now,
      lastSeenAt: now,
    });
    return clerkId;
  },
});

/**
 * Contribute records from a browser-local board into the shared one.
 *
 * Unlike `seed` this is additive and can run at any time, by anyone: a record whose
 * id is already shared is left alone rather than overwritten, so publishing your own
 * work can never clobber a colleague's edit to the same project. That makes it safe
 * for the second, third and fourth person to arrive with a board of their own.
 */
export const merge = mutation({
  args: { collections: v.any() },
  handler: async (ctx, { collections }) => {
    const identity = await requireIdentity(ctx);
    const now = Date.now();
    const added = {};
    let skipped = 0;

    for (const [collection, records] of Object.entries(collections || {})) {
      if (!Array.isArray(records)) continue;

      const existing = await ctx.db
        .query("records")
        .withIndex("by_collection", (q) => q.eq("collection", collection))
        .collect();
      const known = new Set(existing.map((r) => r.docId));

      for (const record of records) {
        if (!record || !record.id) continue;
        const docId = String(record.id);
        if (known.has(docId)) { skipped += 1; continue; }
        await ctx.db.insert("records", {
          collection,
          docId,
          data: record,
          updatedAt: now,
          updatedBy: identity.subject,
        });
        known.add(docId);
        added[collection] = (added[collection] || 0) + 1;
      }
    }

    return { added, total: Object.values(added).reduce((a, b) => a + b, 0), skipped };
  },
});

/**
 * One-time lift of a browser-local board into the shared one. Refuses if anything is
 * already there, so a second person opening the app cannot overwrite what the first
 * one uploaded.
 */
export const seed = mutation({
  args: { collections: v.any(), settings: v.any(), pipelines: v.any() },
  handler: async (ctx, { collections, settings, pipelines }) => {
    const identity = await requireIdentity(ctx);
    const already = await ctx.db.query("records").first();
    if (already) return { seeded: false, reason: "The shared board already has records." };

    const now = Date.now();
    let count = 0;
    for (const [collection, records] of Object.entries(collections || {})) {
      if (!Array.isArray(records)) continue;
      for (const record of records) {
        if (!record || !record.id) continue;
        await ctx.db.insert("records", {
          collection,
          docId: String(record.id),
          data: record,
          updatedAt: now,
          updatedBy: identity.subject,
        });
        count += 1;
      }
    }
    if (settings) await ctx.db.insert("workspace", { key: "settings", value: settings, updatedAt: now });
    if (pipelines) await ctx.db.insert("workspace", { key: "pipelines", value: pipelines, updatedAt: now });
    return { seeded: true, count };
  },
});
