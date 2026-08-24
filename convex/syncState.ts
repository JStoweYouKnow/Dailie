import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx } from "./_generated/server";

/**
 * Where the scheduled syncs remember what they have already read.
 *
 * Every unattended route asks the same two questions — whose accounts may I read, and
 * how far did I get last time — so they share one answer rather than each keeping a
 * near-identical copy. State is kept per route under its own key in `workspace`.
 */

const MAX_ACCOUNTS = 50;

export type AccountState = {
  ranAt?: number;
  lastRunAt?: number;
  lastAdded?: number;
  lastError?: string;
};

async function stateFor(ctx: MutationCtx, stateKey: string): Promise<Record<string, AccountState>> {
  const row = await ctx.db
    .query("workspace")
    .withIndex("by_key", (q) => q.eq("key", stateKey))
    .unique();
  return ((row?.value ?? {}) as Record<string, AccountState>) || {};
}

export const accountValidator = v.object({
  clerkId: v.string(),
  email: v.string(),
  lastRunAt: v.union(v.number(), v.null()),
});

/**
 * Whose accounts a scheduled run may read, and from when.
 *
 * Only addresses the workspace declared as its own mail accounts — the list the Sync
 * Email dialog edits. Reading someone's mail or Drive on a schedule puts it on a board
 * the whole organisation can see, so that has to be something the workspace declared
 * rather than something a single sign-in implies.
 */
export const accountsFor = internalQuery({
  args: { stateKey: v.string() },
  returns: v.array(accountValidator),
  handler: async (ctx, { stateKey }) => {
    const settingsRow = await ctx.db
      .query("workspace")
      .withIndex("by_key", (q) => q.eq("key", "settings"))
      .unique();
    const settings = (settingsRow?.value ?? {}) as { emailAccounts?: Array<{ address?: string }> };
    const declared = new Set(
      (settings.emailAccounts ?? [])
        .map((a) => String(a?.address ?? "").trim().toLowerCase())
        .filter(Boolean)
    );
    if (declared.size === 0) return [];

    const members = await ctx.db.query("members").take(MAX_ACCOUNTS);
    const row = await ctx.db
      .query("workspace")
      .withIndex("by_key", (q) => q.eq("key", stateKey))
      .unique();
    const state = ((row?.value ?? {}) as Record<string, AccountState>) || {};

    return members
      .filter((m) => m.status === "active" && !!m.clerkId && !!m.email && declared.has(m.email.toLowerCase()))
      .map((m) => ({
        clerkId: m.clerkId,
        email: m.email,
        lastRunAt: state[m.clerkId]?.lastRunAt ?? null,
      }));
  },
});

/**
 * Remembers where an account got to. A failed run deliberately leaves `lastRunAt`
 * alone, so the window it could not read is retried rather than skipped.
 */
export const recordRun = internalMutation({
  args: {
    stateKey: v.string(),
    clerkId: v.string(),
    ranAt: v.number(),
    added: v.number(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { stateKey, clerkId, ranAt, added, error }) => {
    const state = await stateFor(ctx, stateKey);
    const previous = state[clerkId] ?? {};
    const next: Record<string, AccountState> = {
      ...state,
      [clerkId]: {
        ranAt,
        lastRunAt: error ? previous.lastRunAt : ranAt,
        lastAdded: added,
        ...(error ? { lastError: error } : {}),
      },
    };

    const row = await ctx.db
      .query("workspace")
      .withIndex("by_key", (q) => q.eq("key", stateKey))
      .unique();
    if (row) await ctx.db.patch(row._id, { value: next, updatedAt: Date.now() });
    else await ctx.db.insert("workspace", { key: stateKey, value: next, updatedAt: Date.now() });
    return null;
  },
});
