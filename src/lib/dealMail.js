/**
 * Keeping a deal (or an open opportunity) current from the mail about it.
 *
 * Gmail lands on the board on its own (convex/gmail.ts). This decides which deal or
 * opportunity a thread belongs to and what a model's reading of that thread may change.
 * The rules live here, free of Convex, so they can be tested and so the browser and the
 * scheduled run can never disagree about them.
 *
 * Lines held throughout:
 * - Linking stays strict. A thread that could belong to two deals belongs to neither:
 *   an unlinked email is a small loss, while one filed on the wrong deal rewrites that
 *   deal from someone else's conversation.
 * - Existing fields are never clobbered. A next step or dated milestone already on the
 *   deal stays put; the email's version is recorded as a suggestion. New dates and an
 *   empty next step are filled in. Unmatched commercial threads create or update an
 *   opportunity conversation instead of inventing a deal.
 * - Meeting-like dates spawn meeting records so the calendar picks them up.
 * - Mail is house-only and deals are not. What lands on the deal itself is limited to
 *   missing next step, new dates and last-contact time; the summary of the exchange
 *   and any stage suggestion live in the house-only `dealUpdates` collection, and the
 *   follow-up tasks are marked `houseOnly`.
 */
import {
  isArchivedProject,
  isOpenOpportunity,
  makeOpportunity,
  makeProjectDate,
  makeTask,
  normalizeConversations,
  normalizeProjectDates,
} from "./model.js";
import { emailDomain, tsFromDateInput } from "./format.js";

/** Deal stages that mean the conversation is over. A closed deal is never auto-matched. */
export const CLOSED_DEAL_STAGES = ["lost", "delivered", "released", "complete", "wrapped"];

/** How far back an unread thread is still worth reading against its deal. */
export const DEAL_MAIL_LOOKBACK_DAYS = 14;

/** Each thread costs a Gmail read and a model call. Shared across deals and opportunities. */
export const MAX_DEAL_THREADS_PER_RUN = 8;

const MAX_TASKS_PER_THREAD = 5;
const MAX_NEXT_STEP = 280;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const MEETING_LIKE = /\b(call|meeting|zoom|teams|google\s*meet|pitch|table\s*read|screening|premiere|lunch|coffee|session|review|sync|standup|stand-up|catch[\s-]?up)\b/i;
const NEWSLETTERISH = /\bunsubscribe\b|\bnewsletter\b|\bview\s+in\s+browser\b|\bno-?reply@|\bdonotreply@/i;

const lower = (value) => String(value || "").trim().toLowerCase();
const normalizeTitle = (value) => lower(value).replace(/[^a-z0-9]+/g, " ").trim();

/** Labels that describe a calendar event rather than a deal milestone. */
export function isMeetingLikeLabel(label) {
  return MEETING_LIKE.test(String(label || ""));
}

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

function threadMessages(thread) {
  return thread.map((e) => ({
    from: e.fromName ? `${e.fromName} <${e.from}>` : (e.from || ""),
    direction: e.direction || "",
    sentAt: e.sentAt || 0,
    subject: e.subject || "",
    text: e.body || e.snippet || "",
  }));
}

function dueBase(threadId, thread, latest) {
  return {
    threadId,
    latestEmailId: latest.id,
    latestAt: latest.sentAt || 0,
    account: lower(latest.account),
    subject: latest.subject || "",
    emailIds: thread.map((e) => e.id),
    messages: threadMessages(thread),
  };
}

/**
 * Threads with mail the deal has not been checked against yet.
 *
 * A thread is due when its newest message is recent, has not been checked, and the
 * thread maps onto exactly one open deal. Threads that match no deal fall through to
 * the opportunity path instead.
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
      ...dueBase(threadId, thread, latest),
      kind: "deal",
      projectId: deal.projectId,
      via: deal.via,
    });
  }
  // Newest conversations first: the run is capped, and those are the ones that matter.
  return due.sort((a, b) => b.latestAt - a.latestAt).slice(0, max);
}

/**
 * The open opportunity a thread is about, or null.
 *
 * Same strictness as deals: exactly one match, else leave it alone (or create a new
 * opportunity when the model says the thread is commercial).
 *
 * @returns {{ opportunityId: string, via: "contact" | "company" } | null}
 */
export function opportunityForThread(thread, data) {
  if (!thread || !thread.length) return null;
  const open = (data.opportunities || []).filter(isOpenOpportunity);
  if (!open.length) return null;

  const parties = new Set(threadCounterparties(thread, data.settings));
  if (!parties.size) return null;

  const byEmail = open.filter((o) => parties.has(lower(o.contactEmail)));
  if (byEmail.length === 1) return { opportunityId: byEmail[0].id, via: "contact" };
  if (byEmail.length > 1) return null;

  const companyIds = new Set(thread.map((e) => e.companyId).filter(Boolean));
  const domains = new Set([...parties].map((a) => emailDomain(a)));
  for (const company of data.companies || []) {
    if (company.domain && domains.has(lower(company.domain))) companyIds.add(company.id);
  }
  const byCompany = open.filter((o) => o.companyId && companyIds.has(o.companyId));
  if (byCompany.length === 1) return { opportunityId: byCompany[0].id, via: "company" };
  return null;
}

/** Skip newsletters and empty internal chatter; the model still decides relevance. */
export function threadLooksCommercial(thread, settings) {
  if (!thread || !thread.length) return false;
  if (!threadCounterparties(thread, settings).length) return false;
  const latest = thread[thread.length - 1];
  const blob = `${latest.from || ""} ${latest.subject || ""} ${latest.body || latest.snippet || ""}`;
  return !NEWSLETTERISH.test(blob);
}

/**
 * Unmatched commercial threads: update an existing opportunity, or create one.
 * Deal-matched threads are excluded so a conversation is never filed twice.
 */
export function threadsDueForOpportunityCheck(data, { since, max = MAX_DEAL_THREADS_PER_RUN }) {
  if (!dealMailEnabled(data.settings)) return [];
  const due = [];
  for (const [threadId, thread] of emailThreads(data.emails)) {
    const latest = thread[thread.length - 1];
    if (latest.dealCheckedAt || (latest.sentAt || 0) < since) continue;
    if (dealForThread(thread, data)) continue;
    if (!threadLooksCommercial(thread, data.settings)) continue;
    const match = opportunityForThread(thread, data);
    due.push({
      ...dueBase(threadId, thread, latest),
      kind: "opportunity",
      opportunityId: match ? match.opportunityId : null,
      via: match ? match.via : "create",
    });
  }
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

function dayKey(ts) {
  return new Date(ts).toISOString().slice(0, 10);
}

/** Skip creating a meeting the board already has for the same deal/day/title. */
export function meetingAlreadyTracked(meetings, { title, date, projectId = null, opportunityId = null }) {
  const key = normalizeTitle(title);
  if (!key || !date) return false;
  return (meetings || []).some((m) => {
    if (!m || !m.date || !sameDay(m.date, date)) return false;
    if (normalizeTitle(m.title) !== key) return false;
    if (projectId && m.projectId === projectId) return true;
    if (opportunityId && m.opportunityId === opportunityId) return true;
    if (!projectId && !opportunityId && !m.projectId && !m.opportunityId) return true;
    return false;
  });
}

function meetingFromEmailDate({ label, date, thread, summary, projectId = null, opportunityId = null, now }) {
  const day = dayKey(date);
  return {
    id: `meet-email-${thread.threadId}-${normalizeTitle(label).replace(/\s+/g, "-").slice(0, 40) || "event"}-${day}`,
    title: label,
    date,
    attendees: "",
    notes: [
      thread.subject ? `From email: ${thread.subject}` : "From email",
      summary ? String(summary).trim().slice(0, 600) : "",
    ].filter(Boolean).join("\n"),
    projectId: projectId || null,
    opportunityId: opportunityId || null,
    followUps: [],
    source: "email",
    emailThreadId: thread.threadId,
    createdAt: now,
  };
}

/**
 * Turns the model's reading of a thread into concrete changes on the deal.
 *
 * Applied straight to the deal only when it fills a gap: an empty next step, brand-new
 * date labels, last contact, follow-up tasks. An existing next step or a date the deal
 * already tracks is never overwritten — those become suggestions on the house-only
 * update. Meeting-like dates also create meeting records. Stage moves stay suggestions.
 * Returns null when the thread turned out not to be about this deal.
 *
 * @param {Record<string, any>} project
 * @param {{ relevant: boolean, summary: string, nextStep: string, stage: string, stageReason: string,
 *   dates: Array<{label: string, date: string}>, tasks: Array<{text: string, owner: string, dueDate: string}> }} reading
 * @param {{ pipeline?: Array<{key: string, label: string}>, team?: Array<{id: string, name?: string}>,
 *   tasks?: any[], meetings?: any[], ownerId?: string | null,
 *   thread: { threadId: string, latestEmailId: string, latestAt: number, subject?: string, emailIds?: string[] },
 *   now: number }} options
 */
export function dealChangesFromEmail(project, reading, { pipeline = [], team = [], tasks = [], meetings = [], ownerId = null, thread, now }) {
  if (!project || !reading || !reading.relevant) return null;

  const patch = {};
  const notes = [];
  const summary = String(reading.summary || "").trim().slice(0, 1200);

  const lastContactAt = Math.max(Number(project.lastContactAt) || 0, Number(thread.latestAt) || 0) || null;
  if (lastContactAt && lastContactAt !== project.lastContactAt) patch.lastContactAt = lastContactAt;

  // Fill an empty next step; otherwise keep what is on the deal and surface a suggestion.
  const nextStep = String(reading.nextStep || "").trim().slice(0, MAX_NEXT_STEP);
  let appliedNextStep = null;
  let suggestedNextStep = null;
  if (nextStep && normalizeTitle(nextStep) !== normalizeTitle(project.nextStep)) {
    if (!String(project.nextStep || "").trim()) {
      patch.nextStep = nextStep;
      appliedNextStep = nextStep;
      notes.push(`Next step (from email): ${nextStep}`);
    } else {
      suggestedNextStep = nextStep;
      notes.push(`Suggested next step from email (existing kept): ${nextStep}`);
    }
  }

  // New labels are added; a label the deal already has is never moved — only suggested.
  let dates = normalizeProjectDates(project.dates);
  const addedDates = [];
  const suggestedDates = [];
  const newMeetings = [];
  const considerMeeting = (label, ts) => {
    if (!isMeetingLikeLabel(label)) return;
    if (meetingAlreadyTracked([...meetings, ...newMeetings], { title: label, date: ts, projectId: project.id })) return;
    newMeetings.push(meetingFromEmailDate({
      label, date: ts, thread, summary, projectId: project.id, now,
    }));
  };

  for (const entry of reading.dates || []) {
    const label = String(entry.label || "").trim().slice(0, 80);
    const day = String(entry.date || "").trim();
    const ts = ISO_DATE.test(day) ? tsFromDateInput(day) : null;
    if (!label || !ts) continue;
    const existing = dates.find((d) => normalizeTitle(d.label) === normalizeTitle(label));
    if (existing) {
      if (existing.date && sameDay(existing.date, ts)) {
        considerMeeting(existing.label || label, ts);
        continue;
      }
      suggestedDates.push({
        label: existing.label || label,
        date: ts,
        existingDate: existing.date || null,
        dateId: existing.id,
      });
      notes.push(`Suggested date from email (existing kept): ${existing.label} → ${day}`);
      considerMeeting(existing.label || label, ts);
    } else {
      const created = makeProjectDate({ label, date: ts });
      dates = [...dates, created];
      addedDates.push({ label, date: ts, id: created.id });
      notes.push(`Added date from email: ${label} (${day})`);
      considerMeeting(label, ts);
    }
  }
  if (addedDates.length) patch.dates = dates;
  if (newMeetings.length) {
    notes.push(`${newMeetings.length} meeting${newMeetings.length === 1 ? "" : "s"} added from email`);
  }

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
    summary,
    applied: {
      nextStep: appliedNextStep,
      suggestedNextStep,
      dates: addedDates,
      suggestedDates,
      taskIds: newTasks.map((t) => t.id),
      meetingIds: newMeetings.map((m) => m.id),
      lastContactAt: patch.lastContactAt || null,
    },
    stageSuggestion,
  };

  return { patch, notes, tasks: newTasks, meetings: newMeetings, update };
}

/**
 * Context for the opportunity-reading prompt — parallel to dealContextForPrompt.
 */
export function opportunityContextForPrompt(opportunity, { companyName = "" } = {}) {
  const conversations = normalizeConversations(opportunity && opportunity.conversations);
  return {
    title: (opportunity && opportunity.title) || "Untitled conversation",
    company: companyName,
    status: (opportunity && opportunity.status) || "talking",
    nextStep: (opportunity && opportunity.nextStep) || "",
    summary: (opportunity && opportunity.summary) || "",
    recentNotes: conversations.slice(0, 5).map((c) => c.note),
  };
}

/**
 * Creates or soft-updates an opportunity from a thread that matched no deal.
 *
 * Existing title / summary / next step are kept; missing ones are filled. A new
 * conversation note is appended when the summary is not already the latest note.
 * Meeting-like dates create meetings linked to the opportunity.
 *
 * @returns {null | { opportunity: Record<string, any>, created: boolean, meetings: any[], notes: string[] }}
 */
export function opportunityChangesFromEmail(opportunity, reading, {
  thread,
  now,
  ownerId = null,
  companyId = null,
  contactName = "",
  contactEmail = "",
  meetings = [],
  subjectHint = "",
} = {}) {
  if (!reading || !reading.relevant) return null;

  const summary = String(reading.summary || "").trim().slice(0, 1200);
  if (!summary && !String(reading.nextStep || "").trim() && !(reading.dates || []).length) return null;

  const created = !opportunity;
  const base = opportunity || makeOpportunity({
    id: `opp-email-${thread.threadId}`,
    title: String(subjectHint || thread.subject || "").replace(/^(re|fw|fwd):\s*/i, "").trim().slice(0, 120) || "Email conversation",
    summary: "",
    companyId: companyId || null,
    contactName: contactName || "",
    contactEmail: lower(contactEmail),
    ownerId: ownerId || null,
    status: "talking",
    source: "email",
    nextStep: "",
    createdAt: now,
    updatedAt: now,
    conversations: [],
  });

  const notes = [];
  let next = { ...base };
  const fill = (field, value) => {
    const incoming = String(value || "").trim();
    if (!incoming) return;
    if (!String(next[field] || "").trim()) {
      next = { ...next, [field]: incoming };
      notes.push(`Set ${field} from email`);
    }
  };

  fill("summary", summary);
  fill("contactName", contactName);
  fill("contactEmail", contactEmail);
  if (!next.companyId && companyId) {
    next = { ...next, companyId };
    notes.push("Linked company from email");
  }

  const nextStep = String(reading.nextStep || "").trim().slice(0, MAX_NEXT_STEP);
  if (nextStep) {
    if (!String(next.nextStep || "").trim()) {
      next = { ...next, nextStep };
      notes.push(`Next step (from email): ${nextStep}`);
    } else if (normalizeTitle(nextStep) !== normalizeTitle(next.nextStep)) {
      notes.push(`Suggested next step from email (existing kept): ${nextStep}`);
    }
  }

  const conversations = normalizeConversations(next.conversations);
  const latestNote = conversations[0];
  const noteText = summary || nextStep;
  if (noteText && (!latestNote || normalizeTitle(latestNote.note) !== normalizeTitle(noteText))) {
    // Always sort ahead of whatever is already logged, even if `now` is a fixed test clock.
    const entry = {
      id: `conv-${thread.threadId}-${thread.latestEmailId}`,
      at: Math.max(now, (Number(latestNote && latestNote.at) || 0) + 1),
      who: contactName || contactEmail || "",
      note: noteText.slice(0, 1200),
    };
    next = { ...next, conversations: normalizeConversations([entry, ...conversations]) };
    notes.push("Logged conversation from email");
  }

  const newMeetings = [];
  for (const entry of reading.dates || []) {
    const label = String(entry.label || "").trim().slice(0, 80);
    const day = String(entry.date || "").trim();
    const ts = ISO_DATE.test(day) ? tsFromDateInput(day) : null;
    if (!label || !ts || !isMeetingLikeLabel(label)) continue;
    if (meetingAlreadyTracked([...meetings, ...newMeetings], { title: label, date: ts, opportunityId: next.id })) continue;
    newMeetings.push(meetingFromEmailDate({
      label, date: ts, thread, summary, opportunityId: next.id, now,
    }));
  }
  if (newMeetings.length) {
    notes.push(`${newMeetings.length} meeting${newMeetings.length === 1 ? "" : "s"} added from email`);
  }

  if (!created && !notes.length && !newMeetings.length) return null;

  next = { ...next, updatedAt: now, source: next.source || "email" };
  return { opportunity: next, created, meetings: newMeetings, notes, suggestedNextStep: nextStep && String(base.nextStep || "").trim() && normalizeTitle(nextStep) !== normalizeTitle(base.nextStep) ? nextStep : null };
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
