"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import {
  GOOGLE_SCOPES,
  driveDocText,
  driveMeetingNotes,
  googleTokenForUser,
  hasScope,
} from "../lib/googleWorkspace.js";
import { summarizeTranscript } from "../lib/summarize.js";

/**
 * Meeting notes shared in from someone else's Workspace.
 *
 * The Meet API only reaches conferences our own organisation hosted — an outside
 * host's transcript belongs to their Workspace, not ours. What we do get is the
 * artifact itself, shared into the attendee's Drive, and reading it there needs no
 * edition, no admin and no new sign-in: just `drive.readonly` on the Google grant
 * Clerk already holds.
 *
 * What arrives is prose rather than a timestamped transcript, so these calls land
 * without segments. That is the trade for covering the calls we do not host.
 */

/** This route's slice of the shared sync state. */
const DRIVE_STATE = "driveNotesSync";

// Each doc costs a download and a model call, so a run stays deliberately small.
const MAX_DOCS_PER_RUN = 10;

type SyncSummary = {
  accounts: number;
  filed: number;
  skipped: number;
  tasks: number;
  errors: Array<string>;
};

const summaryValidator = v.object({
  accounts: v.number(),
  filed: v.number(),
  skipped: v.number(),
  tasks: v.number(),
  errors: v.array(v.string()),
});

async function syncAll(ctx: ActionCtx): Promise<SyncSummary> {
  const summary: SyncSummary = { accounts: 0, filed: 0, skipped: 0, tasks: 0, errors: [] };

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    summary.errors.push(
      "CLERK_SECRET_KEY is not set on this Convex deployment, so no Google token can be read."
    );
    return summary;
  }

  const accounts = await ctx.runQuery(internal.syncState.accountsFor, { stateKey: DRIVE_STATE });
  if (accounts.length === 0) {
    console.log(
      "Meeting notes: no account to read. Add the address under Sync Email → which account is this from, " +
        "and make sure that person has signed in with Google."
    );
    return summary;
  }

  for (const account of accounts) {
    const ranAt = Date.now();
    let filedHere = 0;
    try {
      const { token, scopes, error } = await googleTokenForUser(account.clerkId, { secretKey });
      if (error || !token) throw new Error(error || "Google returned no token.");
      // Empty scopes means Clerk did not tell us — try Google rather than refusing.
      if (scopes?.length && !hasScope(scopes, GOOGLE_SCOPES.drive)) {
        throw new Error("Drive access has not been granted for this account yet.");
      }

      const docs = await driveMeetingNotes(token, {
        since: account.lastRunAt ?? undefined,
        max: MAX_DOCS_PER_RUN,
      });

      for (const doc of docs) {
        const externalId = `gdoc-${doc.id}`;

        // Ask before spending a download and a model call on it.
        const known = await ctx.runQuery(internal.calls.isFiled, { externalId });
        if (known) {
          summary.skipped += 1;
          continue;
        }

        const text = await driveDocText(token, doc.id);
        if (!text) {
          summary.skipped += 1;
          continue;
        }

        const host = [doc.ownerName, doc.ownerEmail].find(Boolean) || "";
        const { summary: written, followUps, error: summaryError } = await summarizeTranscript({
          transcript: text,
          participants: host ? [host] : [],
          referenceDate: new Date(doc.startedAt).toISOString().slice(0, 10),
        });
        // A model that will not answer costs the summary, never the notes themselves.
        if (summaryError && !summary.errors.some((e) => e.includes("Summary"))) {
          summary.errors.push(`Summary unavailable: ${summaryError}`);
        }

        const result = await ctx.runMutation(internal.calls.ingestCall, {
          externalId,
          source: "notes",
          title: doc.title || "Shared meeting notes",
          startedAt: doc.startedAt,
          durationSec: 0,
          transcript: text,
          summary: written,
          participants: doc.ownerEmail ? [{ name: doc.ownerName, email: doc.ownerEmail }] : [],
          // A notes doc carries no timing, so there is nothing honest to put here.
          segments: [],
          nextSteps: followUps,
          meetingTitle: doc.title,
          recordedBy: account.clerkId,
        });

        if (result.filed) {
          summary.filed += 1;
          summary.tasks += result.tasks;
          filedHere += 1;
        } else {
          summary.skipped += 1;
        }
      }

      summary.accounts += 1;
      await ctx.runMutation(internal.syncState.recordRun, {
        stateKey: DRIVE_STATE,
        clerkId: account.clerkId,
        ranAt,
        added: filedHere,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${account.email}: ${message}`);
      await ctx.runMutation(internal.syncState.recordRun, {
        stateKey: DRIVE_STATE,
        clerkId: account.clerkId,
        ranAt,
        added: 0,
        error: message,
      });
    }
  }

  return summary;
}

/** The scheduled run. Registered in `crons.ts`. */
export const syncNotes = internalAction({
  args: {},
  returns: summaryValidator,
  handler: async (ctx): Promise<SyncSummary> => await syncAll(ctx),
});

/** The same run, on demand, so a newly granted account does not wait out the interval. */
export const syncNotesNow = action({
  args: {},
  returns: summaryValidator,
  handler: async (ctx): Promise<SyncSummary> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in.");
    return await syncAll(ctx);
  },
});
