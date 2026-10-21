"use node";

import { v } from "convex/values";
import { api, internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { googleTokenForUser, gmailThreadText } from "../lib/googleWorkspace.js";
import { readDealEmail } from "../lib/dealFromEmail.js";
import { DEAL_MAIL_LOOKBACK_DAYS, MAX_DEAL_THREADS_PER_RUN } from "../src/lib/dealMail.js";

/**
 * Reads new mail on each deal and keeps the deal current from it.
 *
 * Gmail sync stores only a snippet of each message, which is rarely enough to tell a
 * next step from a pleasantry — so the thread is read in full here, from the mailbox
 * it arrived in, when that mailbox's owner has consented to unattended reads. Without
 * consent the stored snippets are all the model sees.
 */

const DAY = 24 * 60 * 60 * 1000;

type RunSummary = { threads: number; updated: number; tasks: number; suggestions: number; errors: string[] };

const summaryValidator = v.object({
  threads: v.number(),
  updated: v.number(),
  tasks: v.number(),
  suggestions: v.number(),
  errors: v.array(v.string()),
});

async function runAll(ctx: ActionCtx): Promise<RunSummary> {
  const summary: RunSummary = { threads: 0, updated: 0, tasks: 0, suggestions: 0, errors: [] };
  const now = Date.now();
  const due = await ctx.runQuery(internal.dealUpdates.dueThreads, {
    since: now - DEAL_MAIL_LOOKBACK_DAYS * DAY,
    max: MAX_DEAL_THREADS_PER_RUN,
  });
  if (!due.length) return summary;

  const secretKey = process.env.CLERK_SECRET_KEY;
  const accounts = await ctx.runQuery(internal.syncState.accountsFor, { stateKey: "gmailSync" });
  const clerkIdFor = new Map(accounts.map((a) => [a.email.toLowerCase(), a.clerkId]));
  const tokens = new Map<string, string | null>();
  const tokenFor = async (mailbox: string) => {
    const clerkId = clerkIdFor.get(mailbox);
    if (!clerkId || !secretKey) return null;
    if (!tokens.has(clerkId)) {
      const { token } = await googleTokenForUser(clerkId, { secretKey });
      tokens.set(clerkId, token || null);
    }
    return tokens.get(clerkId) ?? null;
  };

  const referenceDate = new Date(now).toISOString().slice(0, 10);
  for (const thread of due) {
    summary.threads += 1;
    let messages = thread.messages;
    try {
      const token = await tokenFor(thread.account);
      if (token) {
        const full = await gmailThreadText(token, thread.threadId);
        if (full.some((m) => m.text.trim())) messages = full.map((m) => ({ ...m, direction: "" }));
      }
    } catch (err) {
      // A thread Gmail will not hand over is still worth reading from its snippets.
      console.warn(`Deal mail: full thread unavailable for ${thread.threadId}:`, err instanceof Error ? err.message : err);
    }

    const reading = await readDealEmail({
      deal: thread.deal,
      messages,
      team: thread.team,
      ourAddress: thread.account,
      referenceDate,
    });
    if (reading.error) {
      // Not stamped as checked, so the next run tries this thread again.
      if (!summary.errors.some((e) => e.startsWith("Model"))) summary.errors.push(`Model unavailable: ${reading.error}`);
      continue;
    }

    const { error: _ignored, ...cleanReading } = reading as typeof reading & { error?: string };
    const result = await ctx.runMutation(internal.dealUpdates.applyReading, {
      threadId: thread.threadId,
      projectId: thread.projectId,
      latestEmailId: thread.latestEmailId,
      account: thread.account,
      reading: cleanReading,
    });
    if (result.applied) {
      summary.updated += 1;
      summary.tasks += result.tasks;
      if (result.suggestion) summary.suggestions += 1;
    }
  }
  if (summary.updated || summary.errors.length) console.log("Deal mail:", JSON.stringify(summary));
  return summary;
}

/** The scheduled run. Registered in `crons.ts`, and kicked after a Gmail sync adds mail. */
export const run = internalAction({
  args: {},
  returns: summaryValidator,
  handler: async (ctx): Promise<RunSummary> => await runAll(ctx),
});

/** On demand from the board, for a studio account that does not want to wait. */
export const runNow = action({
  args: {},
  returns: summaryValidator,
  handler: async (ctx): Promise<RunSummary> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in.");
    const access = await ctx.runQuery(api.board.viewerAccess, {});
    if (!access.allow || !access.isHouse) {
      throw new Error("Only a studio account can update deals from email.");
    }
    return await runAll(ctx);
  },
});
