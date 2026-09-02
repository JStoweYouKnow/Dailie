import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  isHouseEmail,
  lockSharedSettings,
  memberBindPlan,
  PUBLIC_WORKSPACE_KEYS,
  redactSettingsForViewer,
  canWriteCollection,
  workspaceAccess,
  pendingClerkId,
} from "../src/lib/houseAccess.js";
import { redactRecordBlobUrls } from "../src/lib/blobUrls.js";
import { isSharedCollection, isSeedRecordId } from "../src/lib/sharedBoard.js";

/** Writes stay gated. Reads return null when there is no session so the client can wait. */
async function requireIdentity(ctx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Not signed in.");
  return identity;
}

function assertSharedCollection(collection: string) {
  if (!isSharedCollection(collection)) {
    throw new Error(`Unknown collection "${collection}".`);
  }
}

/** Convex documents cannot contain `undefined`; drop those keys before writing. */
function asConvexData(value) {
  return JSON.parse(JSON.stringify(value ?? null));
}

function assertCanWriteCollection(identity, collection: string) {
  if (!canWriteCollection(collection, { isHouse: isHouseEmail(identity.email) })) {
    throw new Error("Only a studio account can edit this part of the board.");
  }
}

async function memberByClerk(ctx, clerkId: string) {
  return await ctx.db
    .query("members")
    .withIndex("by_clerk", (q) => q.eq("clerkId", clerkId))
    .unique();
}

async function memberByEmail(ctx, identity) {
  const email = String(identity.email || "").trim().toLowerCase();
  if (!email) return null;
  return await ctx.db
    .query("members")
    .withIndex("by_email", (q) => q.eq("email", email))
    .unique();
}

async function accessFor(ctx, identity) {
  const byClerk = await memberByClerk(ctx, identity.subject);
  const byEmail = byClerk ? null : await memberByEmail(ctx, identity);
  return workspaceAccess({
    clerkId: identity.subject,
    isHouse: isHouseEmail(identity.email),
    emailVerified: identity.emailVerified,
    byClerk,
    byEmail,
  });
}

/** Signed in and already in the workspace (or a verified house email). */
async function requireMember(ctx) {
  const identity = await requireIdentity(ctx);
  const access = await accessFor(ctx, identity);
  if (!access.allow) throw new Error(access.reason || "This workspace is invite-only.");
  return identity;
}

function requireHouse(identity) {
  if (!isHouseEmail(identity.email)) {
    throw new Error("Only a studio account can do that.");
  }
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

const deniedReturn = v.object({
  denied: v.literal(true),
  reason: v.string(),
});

/**
 * The whole board in one reactive read. Convex pushes an update to every open client
 * when any of it changes, which is what makes a project one person adds appear on
 * everyone else's screen without a refresh.
 */
export const get = query({
  args: {},
  returns: v.union(boardReturn, deniedReturn, v.null()),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;

    const access = await accessFor(ctx, identity);
    if (!access.allow) {
      return { denied: true as const, reason: access.reason || "This workspace is invite-only." };
    }

    const rows = await ctx.db.query("records").collect();
    const collections = {};
    for (const row of rows) {
      (collections[row.collection] ||= []).push(redactRecordBlobUrls(row.data));
    }

    const members = await ctx.db.query("members").collect();
    const workspace = await ctx.db.query("workspace").collect();
    const settings = workspace.find((w) => w.key === "settings");
    const pipelines = workspace.find((w) => w.key === "pipelines");

    return {
      collections,
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
      settings: settings
        ? redactSettingsForViewer(settings.value, { isHouse: isHouseEmail(identity.email) })
        : null,
      pipelines: pipelines ? pipelines.value : null,
    };
  },
});

/** Upsert one record. The client's own uid is the key, so ids survive the move. */
export const put = mutation({
  args: { collection: v.string(), docId: v.string(), data: v.any() },
  returns: v.null(),
  handler: async (ctx, { collection, docId, data }) => {
    const identity = await requireMember(ctx);
    assertSharedCollection(collection);
    assertCanWriteCollection(identity, collection);
    const existing = await ctx.db
      .query("records")
      .withIndex("by_doc", (q) => q.eq("collection", collection).eq("docId", docId))
      .unique();

    const patch = { collection, docId, data: asConvexData(data), updatedAt: Date.now(), updatedBy: identity.subject };
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("records", patch);
    return null;
  },
});

export const remove = mutation({
  args: { collection: v.string(), docId: v.string() },
  returns: v.null(),
  handler: async (ctx, { collection, docId }) => {
    const identity = await requireMember(ctx);
    assertSharedCollection(collection);
    assertCanWriteCollection(identity, collection);
    const existing = await ctx.db
      .query("records")
      .withIndex("by_doc", (q) => q.eq("collection", collection).eq("docId", docId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

/** Replace a whole collection — used for reordering and other bulk edits. */
export const putMany = mutation({
  args: { collection: v.string(), records: v.array(v.any()), prune: v.optional(v.boolean()) },
  returns: v.object({ written: v.number(), deleted: v.number(), unchanged: v.number() }),
  handler: async (ctx, { collection, records, prune }) => {
    const identity = await requireMember(ctx);
    assertSharedCollection(collection);
    assertCanWriteCollection(identity, collection);
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
        const payload = asConvexData(record);
        if (JSON.stringify(prior.data) === JSON.stringify(payload)) continue;
        await ctx.db.patch(prior._id, { data: payload, updatedAt: now, updatedBy: identity.subject });
      } else {
        await ctx.db.insert("records", { collection, docId, data: asConvexData(record), updatedAt: now, updatedBy: identity.subject });
      }
      written += 1;
    }
    // Anything left was removed in this edit — unless this is one chunk of a larger
    // write, where the records not in this chunk are still perfectly alive.
    let deleted = 0;
    if (prune !== false && isHouseEmail(identity.email)) {
      for (const orphan of byId.values()) { await ctx.db.delete(orphan._id); deleted += 1; }
    }
    return { written, deleted, unchanged: records.length - written };
  },
});

/** Removes records no longer in the collection. Pairs with chunked putMany writes. */
export const pruneCollection = mutation({
  args: { collection: v.string(), keepIds: v.array(v.string()) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { collection, keepIds }) => {
    const identity = await requireMember(ctx);
    assertSharedCollection(collection);
    assertCanWriteCollection(identity, collection);
    if (!isHouseEmail(identity.email)) return { deleted: 0 };
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
  returns: v.null(),
  handler: async (ctx, { key, value }) => {
    const identity = await requireMember(ctx);
    if (!PUBLIC_WORKSPACE_KEYS.includes(key)) {
      throw new Error("Unknown workspace key.");
    }
    const existing = await ctx.db
      .query("workspace")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const prior = existing && existing.value && typeof existing.value === "object" ? existing.value : {};
    const next = key === "settings"
      ? lockSharedSettings(value, {
          isHouse: isHouseEmail(identity.email),
          prior,
        })
      : value;
    if (existing) await ctx.db.patch(existing._id, { value: next, updatedAt: Date.now() });
    else await ctx.db.insert("workspace", { key, value: next, updatedAt: Date.now() });
    return null;
  },
});

/**
 * Called on every sign-in. Matches the session's Clerk id first. A verified
 * email may attach to a row that has no clerkId yet; it must not take over a
 * row that already belongs to someone else. Unknown non-house accounts are refused.
 */
export const touchMember = mutation({
  args: { name: v.string(), email: v.string(), imageUrl: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, { name, email, imageUrl }) => {
    const identity = await requireIdentity(ctx);
    const clerkId = identity.subject;
    const now = Date.now();
    const identityEmail = String(identity.email || "").trim().toLowerCase();
    const claimed = String(email || "").trim().toLowerCase();
    if (claimed && identityEmail && claimed !== identityEmail) {
      throw new Error("Email does not match your signed-in account.");
    }
    const emailVerified = identity.emailVerified;

    const byClerk = await memberByClerk(ctx, clerkId);
    const byEmail = !byClerk ? await memberByEmail(ctx, identity) : null;

    const plan = memberBindPlan({
      clerkId,
      identityEmail,
      emailVerified,
      byClerk,
      byEmail,
      isHouse: isHouseEmail(identity.email),
    });

    if (plan.action === "refuse") {
      throw new Error(plan.reason || "This workspace is invite-only.");
    }

    if (plan.action === "update" && plan.target) {
      await ctx.db.patch(plan.target._id, {
        clerkId,
        name: name || plan.target.name,
        email: plan.claimEmail ? identityEmail || plan.target.email : plan.target.email,
        imageUrl: imageUrl || plan.target.imageUrl,
        status: "active",
        lastSeenAt: now,
      });
      return clerkId;
    }

    await ctx.db.insert("members", {
      clerkId,
      name: name || (plan.claimEmail && identityEmail ? identityEmail.split("@")[0] : "") || "New member",
      email: plan.claimEmail ? identityEmail : "",
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
 * House-only: put a contractor on the directory so their next verified sign-in
 * can bind to this row instead of being refused.
 */
export const inviteMember = mutation({
  args: { name: v.string(), email: v.string() },
  returns: v.object({ clerkId: v.string() }),
  handler: async (ctx, { name, email }) => {
    const identity = await requireMember(ctx);
    requireHouse(identity);
    const address = String(email || "").trim().toLowerCase();
    const label = String(name || "").trim() || (address.includes("@") ? address.split("@")[0] : "");
    if (!address.includes("@") || !address.split("@")[1]) {
      throw new Error("Enter an email address to invite.");
    }
    if (!label) throw new Error("Enter a name to invite.");

    const existing = await ctx.db
      .query("members")
      .withIndex("by_email", (q) => q.eq("email", address))
      .unique();
    if (existing) {
      throw new Error("That email is already on the team.");
    }

    const clerkId = pendingClerkId(address);
    const now = Date.now();
    await ctx.db.insert("members", {
      clerkId,
      name: label,
      email: address,
      role: "",
      imageUrl: "",
      status: "invited",
      firstSeenAt: now,
      lastSeenAt: now,
    });
    return { clerkId };
  },
});

/** House-only: drop a directory row. Does not delete the caller's own row. */
export const removeMember = mutation({
  args: { clerkId: v.string() },
  returns: v.null(),
  handler: async (ctx, { clerkId }) => {
    const identity = await requireMember(ctx);
    requireHouse(identity);
    if (!clerkId || clerkId === identity.subject) {
      throw new Error("You cannot remove yourself.");
    }
    const existing = await memberByClerk(ctx, clerkId);
    if (existing) await ctx.db.delete(existing._id);
    return null;
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
  returns: v.object({
    added: v.any(),
    total: v.number(),
    skipped: v.number(),
  }),
  handler: async (ctx, { collections }) => {
    const identity = await requireMember(ctx);
    const now = Date.now();
    const added = {};
    let skipped = 0;
    const house = isHouseEmail(identity.email);

    for (const [collection, records] of Object.entries(collections || {})) {
      if (!isSharedCollection(collection) || !Array.isArray(records)) continue;
      if (!canWriteCollection(collection, { isHouse: house })) continue;

      const existing = await ctx.db
        .query("records")
        .withIndex("by_collection", (q) => q.eq("collection", collection))
        .collect();
      const known = new Set(existing.map((r) => r.docId));

      for (const record of records) {
        if (!record || !record.id) continue;
        if (isSeedRecordId(record.id)) { skipped += 1; continue; }
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

    return { added, total: Object.values(added).reduce((a: number, b: number) => a + b, 0), skipped };
  },
});

/**
 * One-time lift of a browser-local board into the shared one. Refuses if anything is
 * already there, so a second person opening the app cannot overwrite what the first
 * one uploaded. Only a studio account may seed, so a contractor cannot plant the board.
 */
export const seed = mutation({
  args: { collections: v.any(), settings: v.any(), pipelines: v.any() },
  returns: v.object({
    seeded: v.boolean(),
    reason: v.optional(v.string()),
    count: v.optional(v.number()),
  }),
  handler: async (ctx, { collections, settings, pipelines }) => {
    const identity = await requireMember(ctx);
    if (!isHouseEmail(identity.email)) {
      return { seeded: false, reason: "Only a studio account can create the shared board." };
    }
    const already = await ctx.db.query("records").first();
    if (already) return { seeded: false, reason: "The shared board already has records." };

    const now = Date.now();
    let count = 0;
    for (const [collection, records] of Object.entries(collections || {})) {
      if (!isSharedCollection(collection) || !Array.isArray(records)) continue;
      for (const record of records) {
        if (!record || !record.id) continue;
        if (isSeedRecordId(record.id)) continue;
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
    if (!count) return { seeded: false, reason: "Nothing to seed besides sample data." };
    if (settings) {
      const seeded = lockSharedSettings(settings, {
        isHouse: true,
        prior: settings,
      });
      await ctx.db.insert("workspace", { key: "settings", value: seeded, updatedAt: now });
    }
    if (pipelines) await ctx.db.insert("workspace", { key: "pipelines", value: pipelines, updatedAt: now });
    return { seeded: true, count };
  },
});
