/**
 * Keeping a deal current from the mail about it.
 *
 * Gmail lands on the board on its own (convex/gmail.ts). This decides which deal a
 * thread belongs to and what a model's reading of that thread may change on it. The
 * rules live here, free of Convex, so they can be tested and so the browser and the
 * scheduled run can never disagree about them.
 *
 * Two lines are held throughout:
 * - Linking stays strict. A thread that could belong to two deals belongs to neither:
 *   an unlinked email is a small loss, while one filed on the wrong deal rewrites that
 *   deal's next step from someone else's conversation.
 * - Mail is house-only and deals are not. What lands on the deal itself is limited to
 *   the resulting next step, dates and last-contact time; the summary of the exchange
 *   and any stage suggestion live in the house-only `dealUpdates` collection, and the
 *   follow-up tasks are marked `houseOnly`.
 */
import { isArchivedProject, makeProjectDate, makeTask, normalizeProjectDates } from "./model.js";
import { emailDomain, tsFromDateInput } from "./format.js";

/** Deal stages that mean the conversation is over. A closed deal is never auto-matched. */
export const CLOSED_DEAL_STAGES = ["lost", "delivered", "released", "complete", "wrapped"];

/** How far back an unread thread is still worth reading against its deal. */
export const DEAL_MAIL_LOOKBACK_DAYS = 14;

/** Each thread costs a Gmail read and a model call. */
export const MAX_DEAL_THREADS_PER_RUN = 8;

const MAX_TASKS_PER_THREAD = 5;
const MAX_NEXT_STEP = 280;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const lower = (value) => String(value || "").trim().toLowerCase();
const normalizeTitle = (value) => lower(value).replace(/[^a-z0-9]+/g, " ").trim();

export function isOpenDeal(project) {
  return !!project && !isArchivedProject(project) && !CLOSED_DEAL_STAGES.includes(project.pipelineStage);
}

/** On by default; a workspace can switch it off in Settings. */
export function dealMailEnabled(settings) {
  return !(settings && settings.dealsFromEmail === false);
}

/**
 * Gmail messages grouped by thread, oldest first within each. Pasted mail has no Gmail
 * thread id (its `threadId` is a cleaned subject line), so only synced mail is grouped.
 */
export function emailThreads(emails) {
  const threads = new Map();
  for (const email of emails || []) {
    if (!email || !email.threadId || !String(email.id || "").startsWith("gmail-")) continue;
    const list = threads.get(email.threadId) || [];
    list.push(email);
    threads.set(email.threadId, list);
  }
  for (const list of threads.values()) list.sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
  return threads;
}

function ownAddresses(settings, extra = []) {
  return new Set([
    ...((settings && settings.emailAccounts) || []).map((a) => lower(a && a.address)),
    ...extra.map(lower),
  ].filter(Boolean));
}

/** Everyone on the thread who is not us. */
export function threadCounterparties(thread, settings) {
  const own = ownAddresses(settings, thread.map((e) => e.account));
  const ownDomains = new Set([...own].map((a) => emailDomain(a)).filter(Boolean));
  const out = new Set();
  for (const email of thread) {
    for (const address of [email.from, ...(email.to || [])]) {
      const clean = lower(address);
      if (!clean.includes("@") || own.has(clean) || ownDomains.has(emailDomain(clean))) continue;
      out.add(clean);
    }
  }
  return [...out];
}

/**
 * The deal a thread is about, or null.
 *
 * Tried from the most specific evidence to the least, stopping at the first tier that
 * names exactly one open deal. A tier that names two is ambiguous, and an ambiguous
 * thread is left alone rather than guessed at.
 *
 * @returns {{ projectId: string, via: "linked" | "contact" | "person" | "company" } | null}
 */
export function dealForThread(thread, data) {
  if (!thread || !thread.length) return null;
  const projects = (data.projects || []).filter(isOpenDeal);
  const byId = new Map(projects.map((p) => [p.id, p]));

  // Someone already filed one of these messages on a deal by hand.
  for (let i = thread.length - 1; i >= 0; i -= 1) {
    const linked = thread[i].projectId;
    if (linked) return byId.has(linked) ? { projectId: linked, via: "linked" } : null;
  }

  const parties = new Set(threadCounterparties(thread, data.settings));
  if (!parties.size) return null;

  const only = (ids, via) => {
    const unique = [...new Set(ids)].filter((id) => byId.has(id));
    if (unique.length === 1) return { projectId: unique[0], via };
    return unique.length > 1 ? "ambiguous" : null;
  };

  const tiers = [
    () => only(projects.filter((p) => parties.has(lower(p.contactEmail))).map((p) => p.id), "contact"),
    () => only(
      (data.people || [])
        .filter((person) => parties.has(lower(person.email)) || (person.altEmails || []).some((a) => parties.has(lower(a))))
        .flatMap((person) => person.projectIds || []),
      "person"
    ),
    () => {
      const companyIds = new Set(thread.map((e) => e.companyId).filter(Boolean));
      const domains = new Set([...parties].map((a) => emailDomain(a)));
      for (const company of data.companies || []) {
        if (company.domain && domains.has(lower(company.domain))) companyIds.add(company.id);
      }
      return only(projects.filter((p) => p.companyId && companyIds.has(p.companyId)).map((p) => p.id), "company");
    },
  ];

  for (const tier of tiers) {
    const hit = tier();
    if (hit === "ambiguous") return null;
    if (hit) return hit;
  }
  return null;
}

/**
 * Threads with mail the deal has not been checked against yet.
 *
 * A thread is due when its newest message is recent, has not been checked, and the
 * thread maps onto exactly one open deal. Threads that match no deal are never marked,
 * which keeps them free to match later once someone links the company to a deal.
 *
 * @param {{ emails: any[], projects: any[], people?: any[], companies?: any[], settings?: any }} data
 * @param {{ since: number, max?: number }} options
 */
export function threadsDueForDealCheck(data, { since, max = MAX_DEAL_THREADS_PER_RUN }) {
  if (!dealMailEnabled(data.settings)) return [];
  const due = [];
  for (const [threadId, thread] of emailThreads(data.emails)) {
    const latest = thread[thread.length - 1];
    if (latest.dealCheckedAt || (latest.sentAt || 0) < since) continue;
    const deal = dealForThread(thread, data);
    if (!deal) continue;
    due.push({
      threadId,
      projectId: deal.projectId,
      via: deal.via,
      latestEmailId: latest.id,
      latestAt: latest.sentAt || 0,
      account: lower(latest.account),
      subject: latest.subject || "",
      emailIds: thread.map((e) => e.id),
      messages: thread.map((e) => ({
        from: e.fromName ? `${e.fromName} <${e.from}>` : (e.from || ""),
        direction: e.direction || "",
        sentAt: e.sentAt || 0,
        subject: e.subject || "",
        text: e.body || e.snippet || "",
      })),
    });
  }
  // Newest conversations first: the run is capped, and those are the ones that matter.
  return due.sort((a, b) => b.latestAt - a.latestAt).slice(0, max);
}

/** What the model is told about the deal so it can tell news from what is already known. */
export function dealContextForPrompt(project, { pipeline = [], tasks = [], companyName = "" } = {}) {
  const stage = pipeline.find((s) => s.key === project.pipelineStage);
  return {
    title: project.title || "Untitled deal",
    company: companyName,
    stage: stage ? stage.label : project.pipelineStage || "",
    stages: pipeline.map((s) => ({ key: s.key, label: s.label })),
    nextStep: project.nextStep || "",
    dates: normalizeProjectDates(project.dates)
      .filter((d) => d.date)
      .map((d) => ({ label: d.label, date: new Date(d.date).toISOString().slice(0, 10) })),
    openTasks: tasks
      .filter((t) => t.projectId === project.id && t.status !== "done")
      .map((t) => t.title)
      .slice(0, 30),
  };
}

function sameDay(a, b) {
  return new Date(a).toISOString().slice(0, 10) === new Date(b).toISOString().slice(0, 10);
}

/**
 * Turns the model's reading of a thread into concrete changes on the deal.
 *
 * Applied straight to the deal: next step, new key dates, last contact, follow-up
 * tasks. Never applied: a stage move — that becomes a suggestion someone approves.
 * Returns null when the thread turned out not to be about this deal.
 *
 * @param {Record<string, any>} project
 * @param {{ relevant: boolean, summary: string, nextStep: string, stage: string, stageReason: string,
 *   dates: Array<{label: string, date: string}>, tasks: Array<{text: string, owner: string, dueDate: string}> }} reading
 * @param {{ pipeline?: Array<{key: string, label: string}>, team?: Array<{id: string, name?: string}>,
 *   tasks?: any[], ownerId?: string | null, thread: { threadId: string, latestEmailId: string, latestAt: number, subject?: string, emailIds?: string[] },
 *   now: number }} options
 */
export function dealChangesFromEmail(project, reading, { pipeline = [], team = [], tasks = [], ownerId = null, thread, now }) {
  if (!project || !reading || !reading.relevant) return null;

  const patch = {};
  const notes = [];

  const lastContactAt = Math.max(Number(project.lastContactAt) || 0, Number(thread.latestAt) || 0) || null;
  if (lastContactAt && lastContactAt !== project.lastContactAt) patch.lastContactAt = lastContactAt;

  const nextStep = String(reading.nextStep || "").trim().slice(0, MAX_NEXT_STEP);
  if (nextStep && normalizeTitle(nextStep) !== normalizeTitle(project.nextStep)) {
    patch.nextStep = nextStep;
    notes.push(`Next step (from email): ${nextStep}`);
  }

  // A label the deal already has is the same milestone moving; anything else is new.
  let dates = normalizeProjectDates(project.dates);
  const changedDates = [];
  for (const entry of reading.dates || []) {
    const label = String(entry.label || "").trim().slice(0, 80);
    const day = String(entry.date || "").trim();
    const ts = ISO_DATE.test(day) ? tsFromDateInput(day) : null;
    if (!label || !ts) continue;
    const existing = dates.find((d) => normalizeTitle(d.label) === normalizeTitle(label));
    if (existing) {
      if (existing.date && sameDay(existing.date, ts)) continue;
      dates = dates.map((d) => (d.id === existing.id ? { ...d, date: ts } : d));
      notes.push(`${existing.date ? "Moved" : "Set"} date from email: ${existing.label} → ${day}`);
    } else {
      dates = [...dates, makeProjectDate({ label, date: ts })];
      notes.push(`Added date from email: ${label} (${day})`);
    }
    changedDates.push({ label: existing ? existing.label : label, date: ts });
  }
  if (changedDates.length) patch.dates = dates;

  const openTitles = tasks
    .filter((t) => t.projectId === project.id && t.status !== "done")
    .map((t) => normalizeTitle(t.title));
  const newTasks = [];
  for (const step of reading.tasks || []) {
    const text = String(step.text || "").trim();
    const key = normalizeTitle(text);
    if (!key || openTitles.some((t) => t === key || t.includes(key) || key.includes(t))) continue;
    if (newTasks.length >= MAX_TASKS_PER_THREAD) break;
    const owner = String(step.owner || "").trim();
    const assignee = owner ? team.find((m) => m.name && lower(m.name) === lower(owner)) : null;
    const dueDate = ISO_DATE.test(String(step.dueDate || "").trim()) ? tsFromDateInput(step.dueDate) : null;
    newTasks.push(makeTask({
      title: text,
      assigneeIds: assignee ? [assignee.id] : (ownerId ? [ownerId] : []),
      assigneeLabel: assignee ? "" : owner,
      dueDate,
      projectId: project.id,
      source: "email",
      emailThreadId: thread.threadId,
      priority: "MEDIUM",
      // Task titles carry the substance of the mail, and mail is house-only.
      houseOnly: true,
      createdAt: now,
    }, ownerId));
    openTitles.push(key);
  }
  if (newTasks.length) {
    notes.push(`${newTasks.length} follow-up task${newTasks.length === 1 ? "" : "s"} added from email`);
  }

  const target = pipeline.find((s) => s.key === String(reading.stage || "").trim());
  const stageSuggestion = target && target.key !== project.pipelineStage
    ? {
      from: project.pipelineStage || "",
      to: target.key,
      toLabel: target.label,
      reason: String(reading.stageReason || "").trim().slice(0, 400),
      status: "pending",
    }
    : null;

  const update = {
    id: `du-${thread.threadId}-${thread.latestEmailId}`,
    projectId: project.id,
    threadId: thread.threadId,
    emailIds: thread.emailIds || [],
    latestEmailId: thread.latestEmailId,
    subject: thread.subject || "",
    emailAt: thread.latestAt || null,
    at: now,
    summary: String(reading.summary || "").trim().slice(0, 1200),
    applied: {
      nextStep: patch.nextStep || null,
      dates: changedDates,
      taskIds: newTasks.map((t) => t.id),
      lastContactAt: patch.lastContactAt || null,
    },
    stageSuggestion,
  };

  return { patch, notes, tasks: newTasks, update };
}

/** The deal row after the changes, with each change on its activity log. */
export function applyDealPatch(project, { patch, notes }, { now, newId }) {
  const history = [
    ...(project.history || []),
    ...notes.map((note, i) => ({ id: newId(i), date: now, note })),
  ];
  return { ...project, ...patch, history, updatedAt: now };
}

/** A newer suggestion replaces an older one still waiting on the same deal. */
export function supersededSuggestion(update) {
  if (!update || !update.stageSuggestion || update.stageSuggestion.status !== "pending") return update;
  return { ...update, stageSuggestion: { ...update.stageSuggestion, status: "superseded" } };
}
