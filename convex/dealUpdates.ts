import { v } from "convex/values";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import {
  applyDealPatch,
  dealChangesFromEmail,
  dealContextForPrompt,
  dealForThread,
  isOpenDeal,
  opportunityChangesFromEmail,
  opportunityContextForPrompt,
  opportunityForThread,
  supersededSuggestion,
  threadCounterparties,
  threadsDueForDealCheck,
  threadsDueForOpportunityCheck,
} from "../src/lib/dealMail.js";
import { DEFAULT_PIPELINES, isOpenOpportunity } from "../src/lib/model.js";
import { isHouseMember } from "../src/lib/houseAccess.js";
import { emailDomain } from "../src/lib/format.js";

/**
 * The database half of keeping deals and opportunity conversations current from mail.
 * The reading itself — a Gmail fetch and a model call — happens in convex/dealMailSync.ts,
 * which needs Node; this side decides what is due and writes the result. The rules for
 * both live in src/lib/dealMail.js.
 */

type Row = { id: string; [key: string]: unknown };
type Pipeline = Array<{ key: string; label: string }>;

async function collection(ctx: QueryCtx | MutationCtx, name: string): Promise<Row[]> {
  const rows = await ctx.db
    .query("records")
    .withIndex("by_collection", (q) => q.eq("collection", name))
    .collect();
  return rows.map((row) => row.data as Row);
}

async function workspaceValue(ctx: QueryCtx | MutationCtx, key: string) {
  const row = await ctx.db
    .query("workspace")
    .withIndex("by_key", (q) => q.eq("key", key))
    .unique();
  return (row?.value ?? null) as Record<string, unknown> | null;
}

async function pipelineFor(ctx: QueryCtx | MutationCtx, recordType: unknown): Promise<Pipeline> {
  const stored = (await workspaceValue(ctx, "pipelines")) as Record<string, Pipeline> | null;
  const type = String(recordType || "");
  const defaults = DEFAULT_PIPELINES as Record<string, Pipeline>;
  return (stored && Array.isArray(stored[type]) && stored[type].length ? stored[type] : defaults[type]) || [];
}

/** Tasks from mail are house-only, so only house members are worth assigning them to. */
async function houseTeam(ctx: QueryCtx | MutationCtx) {
  const members = await ctx.db.query("members").take(200);
  return members
    .filter((m) => m.status === "active" && isHouseMember(m))
    .map((m) => ({ id: m.clerkId, name: m.name || "", email: String(m.email || "").toLowerCase() }));
}

async function recordRow(ctx: MutationCtx, name: string, docId: string) {
  return await ctx.db
    .query("records")
    .withIndex("by_doc", (q) => q.eq("collection", name).eq("docId", docId))
    .unique();
}

const messageValidator = v.object({
  from: v.string(),
  direction: v.string(),
  sentAt: v.number(),
  subject: v.string(),
  text: v.string(),
});

const dealValidator = v.object({
  title: v.string(),
  company: v.string(),
  stage: v.string(),
  stages: v.array(v.object({ key: v.string(), label: v.string() })),
  nextStep: v.string(),
  dates: v.array(v.object({ label: v.string(), date: v.string() })),
  openTasks: v.array(v.string()),
});

const dueValidator = v.object({
  threadId: v.string(),
  projectId: v.string(),
  latestEmailId: v.string(),
  latestAt: v.number(),
  account: v.string(),
  subject: v.string(),
  messages: v.array(messageValidator),
  deal: dealValidator,
  team: v.array(v.string()),
});

/** Threads whose newest message the deal has not been checked against. */
export const dueThreads = internalQuery({
  args: { since: v.number(), max: v.optional(v.number()) },
  returns: v.array(dueValidator),
  handler: async (ctx, { since, max }) => {
    const settings = (await workspaceValue(ctx, "settings")) ?? {};
    const [emails, projects, people, companies, tasks] = await Promise.all([
      collection(ctx, "emails"),
      collection(ctx, "projects"),
      collection(ctx, "people"),
      collection(ctx, "companies"),
      collection(ctx, "tasks"),
    ]);
    const due = threadsDueForDealCheck({ emails, projects, people, companies, settings }, { since, max });
    if (!due.length) return [];

    const team = (await houseTeam(ctx)).map((m) => m.name).filter(Boolean);
    const byId = new Map(projects.map((p) => [p.id, p]));
    const companyName = new Map(companies.map((c) => [c.id, String(c.name || "")]));

    const out = [];
    for (const thread of due) {
      const project = byId.get(thread.projectId);
      if (!project) continue;
      const pipeline = await pipelineFor(ctx, project.recordType);
      out.push({
        threadId: thread.threadId,
        projectId: thread.projectId,
        latestEmailId: thread.latestEmailId,
        latestAt: thread.latestAt,
        account: thread.account,
        subject: thread.subject,
        messages: thread.messages,
        deal: dealContextForPrompt(project, {
          pipeline,
          tasks,
          companyName: companyName.get(String(project.companyId || "")) || "",
        }),
        team,
      });
    }
    return out;
  },
});

const readingValidator = v.object({
  relevant: v.boolean(),
  summary: v.string(),
  nextStep: v.string(),
  stage: v.string(),
  stageReason: v.string(),
  dates: v.array(v.object({ label: v.string(), date: v.string() })),
  tasks: v.array(v.object({ text: v.string(), owner: v.string(), dueDate: v.string() })),
});

/**
 * Writes one thread's reading onto its deal.
 *
 * Idempotent on the thread's newest message: once that message is stamped as checked,
 * a second delivery of the same reading changes nothing. A failed model call is not
 * stamped, so the thread is tried again on the next run.
 */
export const applyReading = internalMutation({
  args: {
    threadId: v.string(),
    projectId: v.string(),
    latestEmailId: v.string(),
    account: v.string(),
    reading: readingValidator,
  },
  returns: v.object({
    applied: v.boolean(),
    tasks: v.number(),
    meetings: v.number(),
    suggestion: v.boolean(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, { threadId, projectId, latestEmailId, account, reading }) => {
    const latestRow = await recordRow(ctx, "emails", latestEmailId);
    if (!latestRow) return { applied: false, tasks: 0, meetings: 0, suggestion: false, reason: "Email no longer on the board." };
    const latest = latestRow.data as Row & { dealCheckedAt?: number; sentAt?: number; subject?: string };
    if (latest.dealCheckedAt) return { applied: false, tasks: 0, meetings: 0, suggestion: false, reason: "Already checked." };

    const now = Date.now();
    const stamp = async () => {
      await ctx.db.patch(latestRow._id, { data: { ...latest, dealCheckedAt: now }, updatedAt: now });
    };

    const projectRow = await recordRow(ctx, "projects", projectId);
    const project = projectRow?.data as Row | undefined;
    if (!projectRow || !project || !isOpenDeal(project)) {
      await stamp();
      return { applied: false, tasks: 0, meetings: 0, suggestion: false, reason: "Deal is gone or closed." };
    }

    const team = await houseTeam(ctx);
    const owner = team.find((m) => m.email === account.toLowerCase());
    const emails = (await collection(ctx, "emails")).filter((e) => e.threadId === threadId);
    const changes = dealChangesFromEmail(project, reading, {
      pipeline: await pipelineFor(ctx, project.recordType),
      team,
      tasks: await collection(ctx, "tasks"),
      meetings: await collection(ctx, "meetings"),
      ownerId: owner ? owner.id : null,
      thread: {
        threadId,
        latestEmailId,
        latestAt: Number(latest.sentAt) || now,
        subject: String(latest.subject || ""),
        emailIds: emails.map((e) => e.id),
      },
      now,
    });

    if (!changes) {
      await stamp();
      return { applied: false, tasks: 0, meetings: 0, suggestion: false, reason: "Not about this deal." };
    }

    const updatedBy = owner ? owner.id : undefined;
    const insert = async (name: string, record: { id: string }) => {
      if (await recordRow(ctx, name, record.id)) return;
      await ctx.db.insert("records", { collection: name, docId: String(record.id), data: record, updatedAt: now, updatedBy });
    };

    if (Object.keys(changes.patch).length || changes.notes.length) {
      const next = applyDealPatch(project, changes, { now, newId: (i: number) => `${changes.update.id}-h${i}` });
      await ctx.db.patch(projectRow._id, { data: next, updatedAt: now, updatedBy });
    }
    for (const task of changes.tasks) await insert("tasks", task);
    for (const meeting of changes.meetings || []) await insert("meetings", meeting);

    if (changes.update.stageSuggestion) {
      const prior = await ctx.db
        .query("records")
        .withIndex("by_collection", (q) => q.eq("collection", "dealUpdates"))
        .collect();
      for (const row of prior) {
        const data = row.data as Row & { projectId?: string; stageSuggestion?: { status?: string } | null };
        if (data.projectId !== projectId || data.stageSuggestion?.status !== "pending") continue;
        await ctx.db.patch(row._id, { data: supersededSuggestion(data), updatedAt: now });
      }
    }
    if (!(await recordRow(ctx, "dealUpdates", changes.update.id))) {
      await insert("dealUpdates", { ...changes.update, mailbox: account });
    }

    // The thread is this deal's now: file its messages so the deal's mail shows up
    // wherever the board lists it, and so the next run matches it without guessing.
    for (const email of emails) {
      const isLatest = email.id === latestEmailId;
      if (email.projectId && !isLatest) continue;
      const row = isLatest ? latestRow : await recordRow(ctx, "emails", email.id);
      if (!row) continue;
      const data = row.data as Row;
      await ctx.db.patch(row._id, {
        data: { ...data, projectId: data.projectId || projectId, ...(isLatest ? { dealCheckedAt: now } : {}) },
        updatedAt: now,
      });
    }
    if (!emails.some((e) => e.id === latestEmailId)) await stamp();

    const hasSuggestion = !!(
      changes.update.stageSuggestion
      || changes.update.applied?.suggestedNextStep
      || (changes.update.applied?.suggestedDates || []).length
    );
    return {
      applied: true,
      tasks: changes.tasks.length,
      meetings: (changes.meetings || []).length,
      suggestion: hasSuggestion,
    };
  },
});

const opportunityDueValidator = v.object({
  threadId: v.string(),
  opportunityId: v.union(v.string(), v.null()),
  via: v.string(),
  latestEmailId: v.string(),
  latestAt: v.number(),
  account: v.string(),
  subject: v.string(),
  messages: v.array(messageValidator),
  opportunity: v.union(
    v.null(),
    v.object({
      title: v.string(),
      company: v.string(),
      status: v.string(),
      nextStep: v.string(),
      summary: v.string(),
      recentNotes: v.array(v.string()),
    }),
  ),
  contactName: v.string(),
  contactEmail: v.string(),
  companyId: v.union(v.string(), v.null()),
  team: v.array(v.string()),
});

/** Unmatched commercial threads — update or create an opportunity conversation. */
export const dueOpportunityThreads = internalQuery({
  args: { since: v.number(), max: v.optional(v.number()) },
  returns: v.array(opportunityDueValidator),
  handler: async (ctx, { since, max }) => {
    const settings = (await workspaceValue(ctx, "settings")) ?? {};
    const [emails, projects, people, companies, opportunities] = await Promise.all([
      collection(ctx, "emails"),
      collection(ctx, "projects"),
      collection(ctx, "people"),
      collection(ctx, "companies"),
      collection(ctx, "opportunities"),
    ]);
    const due = threadsDueForOpportunityCheck(
      { emails, projects, people, companies, opportunities, settings },
      { since, max },
    );
    if (!due.length) return [];

    const team = (await houseTeam(ctx)).map((m) => m.name).filter(Boolean);
    const byOpp = new Map(opportunities.map((o) => [o.id, o]));
    const companyName = new Map(companies.map((c) => [c.id, String(c.name || "")]));
    const peopleByEmail = new Map(
      people.flatMap((p) => {
        const addrs = [p.email, ...(Array.isArray(p.altEmails) ? p.altEmails : [])]
          .map((a) => String(a || "").toLowerCase())
          .filter(Boolean);
        return addrs.map((a) => [a, p] as const);
      }),
    );

    const out = [];
    for (const thread of due) {
      const threadEmails = emails.filter((e) => e.threadId === thread.threadId);
      const parties = threadCounterparties(threadEmails, settings);
      const contactEmail = parties[0] || "";
      const person = contactEmail ? peopleByEmail.get(contactEmail) : null;
      let companyId: string | null = null;
      for (const e of threadEmails) {
        if (e.companyId) { companyId = String(e.companyId); break; }
      }
      if (!companyId && contactEmail) {
        const domain = emailDomain(contactEmail);
        const company = companies.find((c) => c.domain && String(c.domain).toLowerCase() === domain);
        if (company) companyId = String(company.id);
      }

      const opportunity = thread.opportunityId ? byOpp.get(thread.opportunityId) : null;
      out.push({
        threadId: thread.threadId,
        opportunityId: thread.opportunityId,
        via: thread.via,
        latestEmailId: thread.latestEmailId,
        latestAt: thread.latestAt,
        account: thread.account,
        subject: thread.subject,
        messages: thread.messages,
        opportunity: opportunity
          ? opportunityContextForPrompt(opportunity, {
            companyName: companyName.get(String(opportunity.companyId || "")) || "",
          })
          : null,
        contactName: person ? String(person.name || "") : "",
        contactEmail,
        companyId,
        team,
      });
    }
    return out;
  },
});

/**
 * Writes one unmatched thread onto an opportunity (create or soft-merge).
 * Stamps the newest message either way so the thread is not re-queued forever.
 */
export const applyOpportunityReading = internalMutation({
  args: {
    threadId: v.string(),
    opportunityId: v.union(v.string(), v.null()),
    latestEmailId: v.string(),
    account: v.string(),
    contactName: v.string(),
    contactEmail: v.string(),
    companyId: v.union(v.string(), v.null()),
    reading: readingValidator,
  },
  returns: v.object({
    applied: v.boolean(),
    created: v.boolean(),
    meetings: v.number(),
    reason: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    const { threadId, latestEmailId, account, reading } = args;
    const latestRow = await recordRow(ctx, "emails", latestEmailId);
    if (!latestRow) return { applied: false, created: false, meetings: 0, reason: "Email no longer on the board." };
    const latest = latestRow.data as Row & { dealCheckedAt?: number; sentAt?: number; subject?: string };
    if (latest.dealCheckedAt) return { applied: false, created: false, meetings: 0, reason: "Already checked." };

    const now = Date.now();
    const stamp = async () => {
      await ctx.db.patch(latestRow._id, { data: { ...latest, dealCheckedAt: now }, updatedAt: now });
    };

    // A deal may have been linked between queue and apply — never invent an opportunity then.
    const emails = (await collection(ctx, "emails")).filter((e) => e.threadId === threadId);
    const settings = (await workspaceValue(ctx, "settings")) ?? {};
    const projects = await collection(ctx, "projects");
    const people = await collection(ctx, "people");
    const companies = await collection(ctx, "companies");
    if (dealForThread(emails, { projects, people, companies, settings })) {
      await stamp();
      return { applied: false, created: false, meetings: 0, reason: "Thread now matches a deal." };
    }

    const team = await houseTeam(ctx);
    const owner = team.find((m) => m.email === account.toLowerCase());
    let opportunity: Row | null = null;
    let opportunityRow: { _id: any; data: Row } | null = null;
    if (args.opportunityId) {
      opportunityRow = await recordRow(ctx, "opportunities", args.opportunityId);
      opportunity = (opportunityRow?.data as Row) || null;
      if (!opportunity || !isOpenOpportunity(opportunity)) {
        opportunity = null;
        opportunityRow = null;
      }
    }
    if (!opportunity) {
      const match = opportunityForThread(emails, {
        opportunities: await collection(ctx, "opportunities"),
        companies,
        settings,
      });
      if (match) {
        opportunityRow = await recordRow(ctx, "opportunities", match.opportunityId);
        opportunity = (opportunityRow?.data as Row) || null;
      }
    }

    const changes = opportunityChangesFromEmail(opportunity, reading, {
      thread: {
        threadId,
        latestEmailId,
        latestAt: Number(latest.sentAt) || now,
        subject: String(latest.subject || ""),
        emailIds: emails.map((e) => e.id),
      },
      now,
      ownerId: owner ? owner.id : null,
      companyId: args.companyId,
      contactName: args.contactName,
      contactEmail: args.contactEmail,
      meetings: await collection(ctx, "meetings"),
      subjectHint: String(latest.subject || ""),
    });

    if (!changes) {
      await stamp();
      return { applied: false, created: false, meetings: 0, reason: "Not a trackable conversation." };
    }

    const updatedBy = owner ? owner.id : undefined;
    const insert = async (name: string, record: { id: string }) => {
      if (await recordRow(ctx, name, record.id)) return;
      await ctx.db.insert("records", { collection: name, docId: String(record.id), data: record, updatedAt: now, updatedBy });
    };

    if (changes.created) {
      await insert("opportunities", changes.opportunity);
    } else if (opportunityRow) {
      await ctx.db.patch(opportunityRow._id, { data: changes.opportunity, updatedAt: now, updatedBy });
    }
    for (const meeting of changes.meetings || []) await insert("meetings", meeting);

    await stamp();
    return {
      applied: true,
      created: changes.created,
      meetings: (changes.meetings || []).length,
    };
  },
});
