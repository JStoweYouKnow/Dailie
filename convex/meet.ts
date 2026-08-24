"use node";

import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import {
  GOOGLE_SCOPES,
  entriesToSegments,
  googleTokenForUser,
  hasScope,
  meetConferences,
  meetParticipantName,
  meetSpaceCode,
  meetTranscriptEntries,
  meetTranscripts,
  segmentsToTranscript,
} from "../lib/googleWorkspace.js";
import { summarizeTranscript } from "../lib/summarize.js";

/**
 * Conferences our own organisation hosted.
 *
 * Meet hands over transcript entries already attributed to the person who spoke them
 * and already timed, so this route needs neither transcription nor the speaker-guessing
 * pass the in-app recorder relies on — the work is joining entries to participants, and
 * the conference to the meeting already on the board.
 *
 * Two limits are worth knowing before reading anything below. Meet deletes transcript
 * entries 30 days after the conference, so a run left broken for a month loses that
 * month permanently. And artifacts belong to the organisation that hosted the call —
 * externally-hosted meetings will return nothing here, which is what convex/driveNotes.ts
 * covers instead.
 */

/** This route's slice of the shared sync state. */
const MEET_STATE = "meetSync";

// Each conference costs a page of entries, a lookup per speaker, and a model call.
const MAX_CONFERENCES_PER_RUN = 10;

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

function fallbackTitle(startedAt: number) {
  const when = new Date(startedAt).toISOString().slice(0, 10);
  return `Meet call — ${when}`;
}

async function syncAll(ctx: ActionCtx): Promise<SyncSummary> {
  const summary: SyncSummary = { accounts: 0, filed: 0, skipped: 0, tasks: 0, errors: [] };

  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    summary.errors.push(
      "CLERK_SECRET_KEY is not set on this Convex deployment, so no Google token can be read."
    );
    return summary;
  }

  const accounts = await ctx.runQuery(internal.syncState.accountsFor, { stateKey: MEET_STATE });
  if (accounts.length === 0) {
    console.log(
      "Meet transcripts: no account to read. Add the address under Sync Email → which account is this from, " +
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
      if (scopes?.length && !hasScope(scopes, GOOGLE_SCOPES.meet)) {
        throw new Error("Meet access has not been granted for this account yet.");
      }

      const conferences = await meetConferences(token, {
        since: account.lastRunAt ?? undefined,
        max: MAX_CONFERENCES_PER_RUN,
      });

      // One participant speaks across many entries, and often across conferences.
      const speakers = new Map<string, string>();
      const speakerFor = (participant: string) => speakers.get(participant) ?? "";

      for (const conference of conferences) {
        const externalId = `meet-${conference.id}`;

        // Ask before spending entry pages and a model call on it.
        if (await ctx.runQuery(internal.calls.isFiled, { externalId })) {
          summary.skipped += 1;
          continue;
        }

        const transcripts = await meetTranscripts(token, conference.name);
        if (transcripts.length === 0) {
          // Nobody turned transcription on. There is nothing to capture, and saying so
          // every run would drown the log — it is the common case, not a fault.
          summary.skipped += 1;
          continue;
        }

        const entries = await meetTranscriptEntries(token, transcripts[0].name);
        if (entries.length === 0) {
          summary.skipped += 1;
          continue;
        }

        for (const entry of entries) {
          const participant = String(entry.participant || "");
          if (!participant || speakers.has(participant)) continue;
          speakers.set(participant, await meetParticipantName(token, participant));
        }

        const segments = entriesToSegments(entries, conference.startedAt, speakerFor);
        const transcript = segmentsToTranscript(segments);
        if (!transcript) {
          summary.skipped += 1;
          continue;
        }

        const spoke = [...new Set(segments.map((s) => s.speaker).filter(Boolean))];
        const { summary: written, followUps, error: summaryError } = await summarizeTranscript({
          transcript,
          participants: spoke,
          referenceDate: new Date(conference.startedAt).toISOString().slice(0, 10),
        });
        // A model that will not answer costs the summary, never the transcript.
        if (summaryError && !summary.errors.some((e) => e.includes("Summary"))) {
          summary.errors.push(`Summary unavailable: ${summaryError}`);
        }

        const result = await ctx.runMutation(internal.calls.ingestCall, {
          externalId,
          source: "meeting",
          title: fallbackTitle(conference.startedAt),
          startedAt: conference.startedAt,
          durationSec: Math.max(0, Math.round((conference.endedAt - conference.startedAt) / 1000)),
          transcript,
          summary: written,
          participants: spoke.map((name) => ({ name })),
          segments,
          nextSteps: followUps,
          // The space's join code is how the board's own meeting is found. A space we
          // cannot read leaves the call unlinked rather than wrongly linked.
          meetingCode: await meetSpaceCode(token, conference.space),
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
        stateKey: MEET_STATE,
        clerkId: account.clerkId,
        ranAt,
        added: filedHere,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      summary.errors.push(`${account.email}: ${message}`);
      await ctx.runMutation(internal.syncState.recordRun, {
        stateKey: MEET_STATE,
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
export const syncTranscripts = internalAction({
  args: {},
  returns: summaryValidator,
  handler: async (ctx): Promise<SyncSummary> => await syncAll(ctx),
});

/** The same run, on demand, so a newly granted account does not wait out the interval. */
export const syncTranscriptsNow = action({
  args: {},
  returns: summaryValidator,
  handler: async (ctx): Promise<SyncSummary> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Not signed in.");
    return await syncAll(ctx);
  },
});
