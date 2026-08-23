import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  action,
  internalAction,
  internalMutation,
  internalQuery,
  type ActionCtx,
  type MutationCtx,
} from "./_generated/server";
import {
  GOOGLE_SCOPES,
  gmailMessages,
  googleTokenForUser,
  hasScope,
} from "../lib/googleWorkspace.js";
import { deriveDirectoryFromEmails } from "../src/lib/model.js";
import { isHouseEmail } from "../src/lib/houseAccess.js";

/**
 * Scheduled Gmail capture.
 *
 * The manual sync needs someone to open the app and press a button, because it is the
 * browser that holds the session. Nothing else about it does: Clerk will hand over a
 * member's Google token for their user id alone, so the same read can run here on a
 * cron while everyone is logged out — see `crons.ts`.
 *
 * The run is: one query for who to sync → Gmail, per mailbox → one mutation that
 * files the mail and the directory it implies. Each mailbox is independent, so one
 * revoked Google connection cannot stop the rest.
 */

/** Where each mailbox's last run is remembered, in the `workspace` table. */
const SYNC_STATE_KEY = "gmailSync";

const MAX_MAILBOXES = 50;

type SyncSummary = {
  mailboxes: number;
  added: number;
  companies: number;
  people: number;
  errors: Array<string>;
};

const summaryValidator = v.object({
  mailboxes: v.number(),
  added: v.number(),
  companies: v.number(),
  people: v.number(),
  errors: v.array(v.string()),
});

type MailboxState = { lastRunAt?: number; lastError?: string; lastAdded?: number; ranAt?: number };

async function syncState(ctx: MutationCtx): Promise<Record<string, MailboxState>> {
  const row = await ctx.db
    .query("workspace")
    .withIndex("by_key", (q) => q.eq("key", SYNC_STATE_KEY))
    .unique();
  return ((row?.value ?? {}) as Record<string, MailboxState>) || {};
}

/**
 * Who to sync, and how far back each one needs reading.
 *
 * Only the addresses listed in settings as the workspace's own mail accounts — the
 * list the Sync Email dialog already edits. Reading a mailbox on a schedule puts its
 * subjects and participants on a board the whole organisation can see, so that has to
 * be something the workspace declared rather than something a single sign-in implies.
 * To capture every member's mail instead, drop the `declared` filter below.
 */
export const mailboxes = internalQuery({
  args: {},
  returns: v.array(
    v.object({
      clerkId: v.string(),
      email: v.string(),
      lastRunAt: v.union(v.number(), v.null()),
    })
  ),
  handler: async (ctx) => {
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

    const members = await ctx.db.query("members").take(MAX_MAILBOXES);
    const row = await ctx.db
      .query("workspace")
      .withIndex("by_key", (q) => q.eq("key", SYNC_STATE_KEY))
      .unique();
    const state = ((row?.value ?? {}) as Record<string, MailboxState>) || {};

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
 * Files a mailbox's messages, plus the companies and people they imply.
 *
 * Gmail's message id is the record id, so a message already on the board is skipped
 * by an indexed lookup rather than by re-reading the mail that is already there —
 * which is what keeps a run cheap once the first 60 days have landed.
 */
export const ingest = internalMutation({
  args: {
    clerkId: v.string(),
    mailbox: v.string(),
    emails: v.array(v.any()),
  },
  returns: v.object({ added: v.number(), companies: v.number(), people: v.number() }),
  handler: async (ctx, { clerkId, mailbox, emails }) => {
    const fresh: Array<Record<string, unknown>> = [];
    for (const email of emails) {
      const docId = String((email as { id?: unknown })?.id ?? "");
      if (!docId) continue;
      const existing = await ctx.db
        .query("records")
        .withIndex("by_doc", (q) => q.eq("collection", "emails").eq("docId", docId))
        .unique();
      if (!existing) fresh.push(email);
    }
    if (fresh.length === 0) return { added: 0, companies: 0, people: 0 };

    // The whole board is already read in one go by `board.get`, so reading two of its
    // collections here is not a new bound on how large it can grow.
    const read = async (collection: string) => {
      const rows = await ctx.db
        .query("records")
        .withIndex("by_collection", (q) => q.eq("collection", collection))
        .collect();
      return rows.map((r) => r.data);
    };
    const companies = await read("companies");
    const people = await read("people");

    const settingsRow = await ctx.db
      .query("workspace")
      .withIndex("by_key", (q) => q.eq("key", "settings"))
      .unique();
    const settings = (settingsRow?.value ?? {}) as Record<string, unknown>;
    const accounts = Array.isArray(settings.emailAccounts) ? settings.emailAccounts : [];

    const derived = deriveDirectoryFromEmails({
      emails: fresh,
      companies,
      people,
      settings: {
        ...settings,
        // Without the synced mailbox counted as ours, its own domain reads as a
        // counterparty and the run invents a company for the team itself.
        emailAccounts: [...accounts, { id: `acct-${mailbox}`, address: mailbox, label: mailbox }],
        currentUserId: settings.currentUserId ?? null,
      },
    });

    const now = Date.now();
    const file = async (collection: string, record: { id: string }) => {
      await ctx.db.insert("records", {
        collection,
        docId: String(record.id),
        data: record,
        updatedAt: now,
        // Attributed to whoever's mailbox it came from, not to a nameless job.
        updatedBy: clerkId,
      });
    };
    for (const company of derived.newCompanies) await file("companies", company);
    for (const person of derived.newPeople) await file("people", person);
    for (const email of derived.emails) await file("emails", email);

    return {
      added: derived.emails.length,
      companies: derived.newCompanies.length,
      people: derived.newPeople.length,
    };
  },
});

/**
 * Remembers where a mailbox got to. A failed run deliberately leaves `lastRunAt`
 * alone, so the window it could not read is retried rather than skipped.
 */
export const recordRun = internalMutation({
  args: {
    clerkId: v.string(),
    ranAt: v.number(),
    added: v.number(),
    error: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, { clerkId, ranAt, added, error }) => {
    const state = await syncState(ctx);
    const previous = state[clerkId] ?? {};
    const next: Record<string, MailboxState> = {
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
      .withIndex("by_key", (q) => q.eq("key", SYNC_STATE_KEY))
      .unique();
    if (row) await ctx.db.patch(row._id, { value: next, updatedAt: Date.now() });
    else await ctx.db.insert("workspace", { key: SYNC_STATE_KEY, value: next, updatedAt: Date.now() });
    return null;
  },
});

async function syncAll(ctx: ActionCtx): Promise<SyncSummary> {
  const summary: SyncSummary = { mailboxes: 0, added: 0, companies: 0, people: 0, errors: [] };

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    summary.errors.push(
      "CLERK_SECRET_KEY is not set on this Convex deployment, so no Google token can be read. " +
        "Set it with `npx convex env set CLERK_SECRET_KEY …`."
    );
    return summary;
  }

  const boxes = await ctx.runQuery(internal.gmail.mailboxes, {});
  if (boxes.length === 0) {
    // Not a failure: nobody has declared a mailbox for the workspace to read yet.
    console.log(
      "Gmail sync: no mailbox to read. Add the address under Sync Email → which account is this from, " +
        "and make sure that person has signed in with Google."
    );
    return summary;
  }

  for (const box of boxes) {
    const ranAt = Date.now();
    try {
      const { token, scopes, error } = await googleTokenForUser(box.clerkId, { secretKey });
      if (error || !token) throw new Error(error || "Google returned no token.");
      // Empty scopes means Clerk did not tell us — try Google rather than refusing.
      if (scopes?.length && !hasScope(scopes, GOOGLE_SCOPES.gmail)) {
        throw new Error("Gmail access has not been granted for this account yet.");
      }

      const emails = await gmailMessages(token, box.email, { since: box.lastRunAt ?? undefined });
      const result = await ctx.runMutation(internal.gmail.ingest, {
        clerkId: box.clerkId,
        mailbox: box.email,
        emails,
      });

      summary.mailboxes += 1;
      summary.added += result.added;
      summary.companies += result.companies;
      summary.people += result.people;
      await ctx.runMutation(internal.gmail.recordRun, { clerkId: box.clerkId, ranAt, added: result.added });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${box.email}: ${message}`);
      await ctx.runMutation(internal.gmail.recordRun, { clerkId: box.clerkId, ranAt, added: 0, error: message });
    }
  }

  return summary;
}

/** The scheduled run. Registered in `crons.ts`. */
export const syncMailboxes = internalAction({
  args: {},
  returns: summaryValidator,
  handler: async (ctx): Promise<SyncSummary> => await syncAll(ctx),
});

/**
 * The same run, on demand. The board is shared, so any signed-in member may ask for
 * it — this exists so a new mailbox does not have to wait out the cron interval.
 */
export const syncNow = action({
  args: {},
  returns: summaryValidator,
  handler: async (ctx): Promise<SyncSummary> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in.");
    if (!isHouseEmail(identity.email)) {
      throw new Error("Only a studio account can run mailbox sync.");
    }
    return await syncAll(ctx);
  },
});
