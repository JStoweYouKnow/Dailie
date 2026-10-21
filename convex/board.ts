import { query, mutation } from "./_generated/server";
import { v } from "convex/values";
import {
  isHouseEmail,
  lockSharedSettings,
  memberBindPlan,
  memberDisplayFromIdentity,
  nextMemberRole,
  CONTRACTOR_ROLE,
  PUBLIC_WORKSPACE_KEYS,
  redactSettingsForViewer,
  canWriteCollection,
  canReadCollection,
  canReadRecord,
  canWriteRecord,
  pendingClerkId,
} from "../src/lib/houseAccess.js";
import { redactRecordBlobUrls } from "../src/lib/blobUrls.js";
import {
  assertPutManySize,
  MAX_BOARD_GET_PER_COLLECTION,
  MAX_MEMBERS,
  MAX_MERGE_PER_COLLECTION,
  prepareRecordWrite,
  prepareWorkspaceValue,
} from "../src/lib/boardWrite.js";
import { isSharedCollection, isSeedRecordId, SHARED_COLLECTIONS } from "../src/lib/sharedBoard.js";
import { collapseMeetings, isPersonalSyncedMeeting, redactMeeting, viewerIsIncluded } from "../src/lib/calendarPrivacy.js";
import {
  memberByClerk,
  memberByEmail,
  requireIdentity,
  requireMember,
  requireHouse,
  viewerAccessFor,
} from "./lib/access.js";

function assertSharedCollection(collection: string) {
  if (!isSharedCollection(collection)) {
    throw new Error(`Unknown collection "${collection}".`);
  }
}

function assertCanWriteCollection(isHouse: boolean, collection: string) {
  if (!canWriteCollection(collection, { isHouse })) {
    throw new Error("Only a studio account can edit this part of the board.");
  }
}

function assertCanWriteRecord(isHouse: boolean, collection: string, prior: unknown, next: unknown) {
  if (!canWriteRecord(collection, { prior, next }, { isHouse })) {
    throw new Error("Only a studio account can edit this record.");
  }
}

type PrivacyMember = { id: string; name: string; email: string };

async function privacyTeam(ctx: { db: { query: Function } }): Promise<PrivacyMember[]> {
  const members = await ctx.db.query("members").take(MAX_MEMBERS);
  return members.map((member: { clerkId: string; name?: string; email?: string }) => ({
    id: member.clerkId,
    name: member.name || "",
    email: member.email || "",
  }));
}

function canReviseMeeting(prior: unknown, identity: { subject: string; email?: string | null }, team: PrivacyMember[]) {
  if (!prior || typeof prior !== "object") return true;
  if (!isPersonalSyncedMeeting(prior)) return true;
  return viewerIsIncluded(prior, { id: identity.subject, email: identity.email || "" }, team);
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
      googleSyncConsent: v.boolean(),
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

    const access = await viewerAccessFor(ctx);
    if (!access.allow) {
      return { denied: true as const, reason: access.reason || "This workspace is invite-only." };
    }

    const house = access.isHouse;
    const collections = {};
    for (const name of SHARED_COLLECTIONS) {
      if (!canReadCollection(name, { isHouse: house })) continue;
      const rows = await ctx.db
        .query("records")
        .withIndex("by_collection", (q) => q.eq("collection", name))
        .take(MAX_BOARD_GET_PER_COLLECTION);
      collections[name] = rows
        .filter((row) => canReadRecord(name, row.data, { isHouse: house }))
        .map((row) => redactRecordBlobUrls(row.data));
    }

    const members = await ctx.db.query("members").take(MAX_MEMBERS);
    const team = members
      .map((m) => ({
        id: m.clerkId,
        clerkId: m.clerkId,
        name: m.name || "",
        email: m.email || "",
        role: m.role || "",
        imageUrl: m.imageUrl || "",
        status: m.status,
        lastSeenAt: m.lastSeenAt,
        googleSyncConsent: m.googleSyncConsent === true,
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const self = team.find((member) => member.clerkId === identity.subject);
    if (collections.meetings) {
      const viewer = { id: identity.subject, email: (self && self.email) || identity.email || "" };
      collections.meetings = collapseMeetings(collections.meetings, team)
        .map((meeting) => redactMeeting(meeting, viewer, team))
        .filter(Boolean);
    }
    const settings = await ctx.db
      .query("workspace")
      .withIndex("by_key", (q) => q.eq("key", "settings"))
      .unique();
    const pipelines = await ctx.db
      .query("workspace")
      .withIndex("by_key", (q) => q.eq("key", "pipelines"))
      .unique();

    return {
      collections,
      team,
      settings: settings
        ? redactSettingsForViewer(settings.value, { isHouse: house })
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
    const { identity, isHouse } = await requireMember(ctx);
    assertSharedCollection(collection);
    assertCanWriteCollection(isHouse, collection);
    const existing = await ctx.db
      .query("records")
      .withIndex("by_doc", (q) => q.eq("collection", collection).eq("docId", docId))
      .unique();
    assertCanWriteRecord(isHouse, collection, existing?.data, data);
    if (existing && collection === "meetings" && !canReviseMeeting(existing.data, identity, await privacyTeam(ctx))) {
      return null;
    }

    const patch = { collection, docId, data: prepareRecordWrite(data), updatedAt: Date.now(), updatedBy: identity.subject };
    if (existing) await ctx.db.patch(existing._id, patch);
    else await ctx.db.insert("records", patch);
    return null;
  },
});

export const remove = mutation({
  args: { collection: v.string(), docId: v.string() },
  returns: v.null(),
  handler: async (ctx, { collection, docId }) => {
    const { identity, isHouse } = await requireMember(ctx);
    assertSharedCollection(collection);
    assertCanWriteCollection(isHouse, collection);
    const existing = await ctx.db
      .query("records")
      .withIndex("by_doc", (q) => q.eq("collection", collection).eq("docId", docId))
      .unique();
    if (!existing) return null;
    assertCanWriteRecord(isHouse, collection, existing.data, null);
    if (collection === "meetings" && !canReviseMeeting(existing.data, identity, await privacyTeam(ctx))) {
      return null;
    }
    await ctx.db.delete(existing._id);
    return null;
  },
});

/** Replace a whole collection — used for reordering and other bulk edits. */
export const putMany = mutation({
  args: { collection: v.string(), records: v.array(v.any()), prune: v.optional(v.boolean()) },
  returns: v.object({ written: v.number(), deleted: v.number(), unchanged: v.number() }),
  handler: async (ctx, { collection, records, prune }) => {
    const { identity, isHouse } = await requireMember(ctx);
    assertSharedCollection(collection);
    assertCanWriteCollection(isHouse, collection);
    assertPutManySize(records);
    const existing = await ctx.db
      .query("records")
      .withIndex("by_collection", (q) => q.eq("collection", collection))
      .collect();
    const byId = new Map(existing.map((r) => [r.docId, r]));
    const now = Date.now();
    const team = collection === "meetings" ? await privacyTeam(ctx) : [];

    let written = 0;
    for (const record of records) {
      if (!record || typeof record !== "object" || Array.isArray(record) || record.id == null || record.id === "") {
        throw new Error("Each record needs an id.");
      }
      const docId = String(record.id);
      const prior = byId.get(docId);
      assertCanWriteRecord(isHouse, collection, prior?.data, record);
      if (prior && collection === "meetings" && !canReviseMeeting(prior.data, identity, team)) {
        byId.delete(docId);
        continue;
      }
      const payload = prepareRecordWrite(record);
      if (prior) {
        byId.delete(docId);
        // Rewriting an unchanged record costs a write and risks the transaction's
        // limits for nothing. "Populate from email" re-sends every message it has
        // seen, and almost none of them differ.
        if (JSON.stringify(prior.data) === JSON.stringify(payload)) continue;
        await ctx.db.patch(prior._id, { data: payload, updatedAt: now, updatedBy: identity.subject });
      } else {
        await ctx.db.insert("records", { collection, docId, data: payload, updatedAt: now, updatedBy: identity.subject });
      }
      written += 1;
    }
    // Anything left was removed in this edit — unless this is one chunk of a larger
    // write, where the records not in this chunk are still perfectly alive.
    let deleted = 0;
    if (prune !== false && isHouse) {
      for (const orphan of byId.values()) {
        if (collection === "meetings" && !canReviseMeeting(orphan.data, identity, team)) continue;
        await ctx.db.delete(orphan._id);
        deleted += 1;
      }
    }
    return { written, deleted, unchanged: records.length - written };
  },
});

/** Removes records no longer in the collection. Pairs with chunked putMany writes. */
export const pruneCollection = mutation({
  args: { collection: v.string(), keepIds: v.array(v.string()) },
  returns: v.object({ deleted: v.number() }),
  handler: async (ctx, { collection, keepIds }) => {
    const { identity, isHouse } = await requireMember(ctx);
    assertSharedCollection(collection);
    assertCanWriteCollection(isHouse, collection);
    if (!isHouse) return { deleted: 0 };
    const keep = new Set(keepIds);
    const existing = await ctx.db
      .query("records")
      .withIndex("by_collection", (q) => q.eq("collection", collection))
      .collect();
    const team = collection === "meetings" ? await privacyTeam(ctx) : [];
    let deleted = 0;
    for (const row of existing) {
      if (keep.has(row.docId)) continue;
      if (collection === "meetings" && !canReviseMeeting(row.data, identity, team)) continue;
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
    const { isHouse } = await requireMember(ctx);
    if (!PUBLIC_WORKSPACE_KEYS.includes(key)) {
      throw new Error("Unknown workspace key.");
    }
    if (key === "pipelines" && !isHouse) return null;
    const existing = await ctx.db
      .query("workspace")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique();
    const prior = existing && existing.value && typeof existing.value === "object" ? existing.value : {};
    const next = prepareWorkspaceValue(
      key === "settings"
        ? lockSharedSettings(value, { isHouse, prior })
        : value
    );
    if (existing && JSON.stringify(existing.value) === JSON.stringify(next)) return null;
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
  handler: async (ctx, { email }) => {
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
      const display = memberDisplayFromIdentity(identity, plan.target);
      await ctx.db.patch(plan.target._id, {
        clerkId,
        name: display.name,
        email: plan.claimEmail ? identityEmail || plan.target.email : plan.target.email,
        role: nextMemberRole({
          currentRole: plan.target.role,
          email: identityEmail || plan.target.email,
          emailVerified,
        }),
        imageUrl: display.imageUrl,
        status: "active",
        lastSeenAt: now,
      });
      return clerkId;
    }

    const display = memberDisplayFromIdentity(identity);
    await ctx.db.insert("members", {
      clerkId,
      name: display.name,
      email: plan.claimEmail ? identityEmail : "",
      role: nextMemberRole({ currentRole: "", email: identityEmail, emailVerified }),
      imageUrl: display.imageUrl,
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
    const session = await requireMember(ctx);
    requireHouse(session);
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
      role: CONTRACTOR_ROLE,
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
    const { identity, isHouse } = await requireMember(ctx);
    requireHouse({ isHouse });
    if (!clerkId || clerkId === identity.subject) {
      throw new Error("You cannot remove yourself.");
    }
    const existing = await memberByClerk(ctx, clerkId);
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

/** Whether this session may use the shared board — used by /api/files, not the UI. */
export const viewerMayAccess = query({
  args: {},
  returns: v.boolean(),
  handler: async (ctx) => {
    const access = await viewerAccessFor(ctx);
    return access.allow === true;
  },
});

/** Membership plus stored house role — used by Vercel /api routes. */
export const viewerAccess = query({
  args: {},
  returns: v.object({
    allow: v.boolean(),
    isHouse: v.boolean(),
  }),
  handler: async (ctx) => {
    const access = await viewerAccessFor(ctx);
    return { allow: access.allow, isHouse: access.isHouse };
  },
});

/** Opt in (or out) of having this account's Google mail/Drive/Meet ingested. */
export const setGoogleSyncConsent = mutation({
  args: { consent: v.boolean() },
  returns: v.null(),
  handler: async (ctx, { consent }) => {
    const { identity } = await requireMember(ctx);
    const row = await memberByClerk(ctx, identity.subject);
    if (!row) throw new Error("Not a member of this workspace.");
    await ctx.db.patch(row._id, { googleSyncConsent: consent });
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
    const { identity, isHouse } = await requireMember(ctx);
    const now = Date.now();
    const added = {};
    let skipped = 0;
    const house = isHouse;

    for (const [collection, records] of Object.entries(collections || {})) {
      if (!isSharedCollection(collection) || !Array.isArray(records)) continue;
      if (!canWriteCollection(collection, { isHouse: house })) continue;
      if (records.length > MAX_MERGE_PER_COLLECTION) {
        throw new Error(`At most ${MAX_MERGE_PER_COLLECTION} records per collection.`);
      }

      const existing = await ctx.db
        .query("records")
        .withIndex("by_collection", (q) => q.eq("collection", collection))
        .collect();
      const known = new Set(existing.map((r) => r.docId));

      for (const record of records) {
        if (!record || typeof record !== "object" || Array.isArray(record) || !record.id) continue;
        if (isSeedRecordId(record.id)) { skipped += 1; continue; }
        const docId = String(record.id);
        if (known.has(docId)) { skipped += 1; continue; }
        if (!canWriteRecord(collection, { prior: null, next: record }, { isHouse: house })) { skipped += 1; continue; }
        await ctx.db.insert("records", {
          collection,
          docId,
          data: prepareRecordWrite(record),
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
    const { identity, isHouse } = await requireMember(ctx);
    if (!isHouse) {
      return { seeded: false, reason: "Only a studio account can create the shared board." };
    }
    const already = await ctx.db.query("records").first();
    if (already) return { seeded: false, reason: "The shared board already has records." };

    const now = Date.now();
    let count = 0;
    for (const [collection, records] of Object.entries(collections || {})) {
      if (!isSharedCollection(collection) || !Array.isArray(records)) continue;
      if (records.length > MAX_MERGE_PER_COLLECTION) {
        throw new Error(`At most ${MAX_MERGE_PER_COLLECTION} records per collection.`);
      }
      for (const record of records) {
        if (!record || typeof record !== "object" || Array.isArray(record) || !record.id) continue;
        if (isSeedRecordId(record.id)) continue;
        await ctx.db.insert("records", {
          collection,
          docId: String(record.id),
          data: prepareRecordWrite(record),
          updatedAt: now,
          updatedBy: identity.subject,
        });
        count += 1;
      }
    }
    if (!count) return { seeded: false, reason: "Nothing to seed besides sample data." };
    if (settings) {
      const seeded = prepareWorkspaceValue(lockSharedSettings(settings, {
        isHouse: true,
        prior: settings,
      }));
      await ctx.db.insert("workspace", { key: "settings", value: seeded, updatedAt: now });
    }
    if (pipelines) {
      await ctx.db.insert("workspace", {
        key: "pipelines",
        value: prepareWorkspaceValue(pipelines),
        updatedAt: now,
      });
    }
    return { seeded: true, count };
  },
});
