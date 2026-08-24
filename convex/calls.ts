import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import { makeCall, tasksForCall, meetingNoteForCall } from "../src/lib/model.js";

/**
 * Filing a call that nobody was present to record.
 *
 * Every unattended capture route — a Meet transcript, a Zoom VTT, a shared notes doc —
 * ends here, so a call reaches the board with the same tasks and the same meeting
 * back-link it would have got from the in-app recorder. The rules themselves live in
 * src/lib/model.js, shared with that recorder rather than reimplemented.
 */

/**
 * A call the browser recorded and one a platform hands over afterwards are the same
 * conversation, and so are two platforms describing the same meeting. Whichever lands
 * first keeps the meeting: an in-app recording carries audio, video and human-checked
 * next steps that no import can replace, and duplicating a call is worse than missing
 * a second copy of one.
 */
async function alreadyRecorded(ctx: MutationCtx, meetingId: string | null) {
  if (!meetingId) return false;
  const calls = await ctx.db
    .query("records")
    .withIndex("by_collection", (q) => q.eq("collection", "calls"))
    .collect();
  return calls.some((row) => (row.data as { meetingId?: string })?.meetingId === meetingId);
}

/** The board meeting a conference belongs to, found through the join link it stores. */
async function meetingForCode(ctx: MutationCtx, meetingCode: string) {
  const code = meetingCode.trim().toLowerCase();
  if (!code) return null;
  const meetings = await ctx.db
    .query("records")
    .withIndex("by_collection", (q) => q.eq("collection", "meetings"))
    .collect();
  const hit = meetings.find((row) => {
    const link = String((row.data as { meetingLink?: string })?.meetingLink ?? "").toLowerCase();
    return !!link && link.includes(code);
  });
  return hit ? (hit.data as { id: string; title?: string; notes?: string }) : null;
}

/**
 * Whether a call has been filed already.
 *
 * Cheap enough to ask before doing the expensive part — a shared notes doc costs a
 * download and a model call to turn into a summary, and neither is worth spending on
 * something the board already has.
 */
export const isFiled = internalQuery({
  args: { externalId: v.string() },
  returns: v.boolean(),
  handler: async (ctx: QueryCtx, { externalId }) => {
    const existing = await ctx.db
      .query("records")
      .withIndex("by_doc", (q) => q.eq("collection", "calls").eq("docId", externalId))
      .unique();
    return !!existing;
  },
});

/**
 * The meeting a shared notes doc belongs to.
 *
 * A doc shared in from another organisation carries no join link, so the match is by
 * name and day instead. It stays deliberately strict — an unlinked call on the board
 * is a small loss, while one hung off the wrong meeting is a wrong record.
 */
async function meetingForTitle(ctx: MutationCtx, title: string, startedAt: number) {
  const normalize = (value: unknown) =>
    String(value ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const want = normalize(title);
  if (want.length < 4) return null;

  const meetings = await ctx.db
    .query("records")
    .withIndex("by_collection", (q) => q.eq("collection", "meetings"))
    .collect();

  const DAY = 24 * 60 * 60 * 1000;
  const hit = meetings.find((row) => {
    const meeting = row.data as { title?: string; date?: number };
    const have = normalize(meeting?.title);
    if (!have) return false;
    if (Math.abs(Number(meeting?.date ?? 0) - startedAt) > DAY) return false;
    return have === want || have.includes(want) || want.includes(have);
  });
  return hit ? (hit.data as { id: string; title?: string; notes?: string }) : null;
}

export const ingestCall = internalMutation({
  args: {
    // Stable id from the source platform — `meet-{conferenceRecord}`, `zoom-{uuid}`.
    // It becomes the call's own id, so a redelivered webhook or a re-read transcript
    // cannot produce a second record.
    externalId: v.string(),
    source: v.string(),
    title: v.string(),
    startedAt: v.number(),
    durationSec: v.number(),
    transcript: v.string(),
    summary: v.string(),
    participants: v.array(v.any()),
    segments: v.array(
      v.object({ start: v.number(), end: v.number(), text: v.string(), speaker: v.string() })
    ),
    nextSteps: v.array(v.object({ text: v.string(), owner: v.string(), dueDate: v.string() })),
    // Either the platform's join code, to be matched against the board's meetings, or
    // a meeting id the caller already resolved.
    meetingCode: v.optional(v.string()),
    // For sources with no join code — matched by name and day instead.
    meetingTitle: v.optional(v.string()),
    meetingId: v.optional(v.string()),
    recordedBy: v.optional(v.string()),
  },
  returns: v.object({
    filed: v.boolean(),
    callId: v.union(v.string(), v.null()),
    tasks: v.number(),
    meetingId: v.union(v.string(), v.null()),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("records")
      .withIndex("by_doc", (q) => q.eq("collection", "calls").eq("docId", args.externalId))
      .unique();
    if (existing) {
      return { filed: false, callId: args.externalId, tasks: 0, meetingId: null, reason: "Already filed." };
    }

    let meeting = null;
    if (!args.meetingId) {
      if (args.meetingCode) meeting = await meetingForCode(ctx, args.meetingCode);
      if (!meeting && args.meetingTitle) {
        meeting = await meetingForTitle(ctx, args.meetingTitle, args.startedAt);
      }
    }
    const meetingId = args.meetingId ?? (meeting ? meeting.id : null);

    if (await alreadyRecorded(ctx, meetingId)) {
      return { filed: false, callId: null, tasks: 0, meetingId, reason: "That meeting already has a call on the board." };
    }

    const members = await ctx.db.query("members").take(200);
    const team = members.map((m) => ({ id: m.clerkId, name: m.name || "" }));

    const call = makeCall({
      id: args.externalId,
      // A conference knows when it happened but not what it was called. When it lands
      // on a meeting the board already has, that meeting's name is the real one.
      title: meeting?.title || args.title || "Call",
      startedAt: args.startedAt,
      durationSec: args.durationSec,
      source: args.source,
      participants: args.participants,
      segments: args.segments,
      transcript: args.transcript,
      summary: args.summary,
      nextSteps: args.nextSteps,
      meetingId,
      recordedBy: args.recordedBy ?? null,
      imported: true,
    });

    const now = Date.now();
    const file = async (collection: string, record: { id: string }) => {
      await ctx.db.insert("records", {
        collection,
        docId: String(record.id),
        data: record,
        updatedAt: now,
        updatedBy: args.recordedBy ?? undefined,
      });
    };

    await file("calls", call);

    const tasks = tasksForCall(call, { team, currentUserId: args.recordedBy ?? null });
    for (const task of tasks) await file("tasks", task);

    // Hang the call off its meeting, the way the recorder does when it knows one.
    if (meetingId) {
      const row = await ctx.db
        .query("records")
        .withIndex("by_doc", (q) => q.eq("collection", "meetings").eq("docId", meetingId))
        .unique();
      if (row) {
        await ctx.db.patch(row._id, {
          data: { ...(row.data as Record<string, unknown>), ...meetingNoteForCall(row.data as { notes?: string }, call) },
          updatedAt: now,
        });
      }
    }

    return { filed: true, callId: call.id, tasks: tasks.length, meetingId };
  },
});
