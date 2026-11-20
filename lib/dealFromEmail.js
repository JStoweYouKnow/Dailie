import { generateText, Output } from "ai";
import { z } from "zod";
import { DEFAULT_SUMMARY_MODEL, ISO_DATE } from "./summarize.js";

/**
 * Reads an email thread against the deal it belongs to and says what changed.
 *
 * The model only reports; src/lib/dealMail.js decides what of that report may touch
 * the deal, so a confident-sounding reply can never move a stage by itself.
 */

const readingSchema = z.object({
  relevant: z.boolean(),
  summary: z.string(),
  nextStep: z.string(),
  stage: z.string(),
  stageReason: z.string(),
  dates: z.array(z.object({ label: z.string(), date: z.string() })),
  tasks: z.array(z.object({ text: z.string(), owner: z.string(), dueDate: z.string() })),
});

const EMPTY = { relevant: false, summary: "", nextStep: "", stage: "", stageReason: "", dates: [], tasks: [] };

function messagesText(messages) {
  return messages
    .map((m) => {
      const when = m.sentAt ? new Date(m.sentAt).toISOString().slice(0, 16).replace("T", " ") : "";
      return `--- ${m.from || "Unknown"}${when ? ` · ${when}` : ""}${m.subject ? ` · ${m.subject}` : ""}\n${m.text || ""}`;
    })
    .join("\n\n");
}

export function buildDealEmailPrompt({ deal, messages, team = [], ourAddress = "", referenceDate }) {
  const stages = deal.stages.map((s) => `${s.key} (${s.label})`).join(", ");
  const dates = deal.dates.length ? deal.dates.map((d) => `${d.label}: ${d.date}`).join("; ") : "none";
  const tasks = deal.openTasks.length ? deal.openTasks.map((t) => `- ${t}`).join("\n") : "none";
  return `You keep a film/TV production company's deal tracker up to date from its email.
Today's date is ${referenceDate}. Our mailbox is ${ourAddress || "unknown"}; our team: ${team.join(", ") || "unknown"}.

THE DEAL
Title: ${deal.title}${deal.company ? `\nCounterparty: ${deal.company}` : ""}
Current stage: ${deal.stage}
Pipeline stages (key (label)): ${stages}
Current next step: ${deal.nextStep || "none"}
Key dates already tracked: ${dates}
Open tasks already tracked:
${tasks}

Read the thread below and return:
- relevant: true only if the thread is actually about this deal. A thread with the same
  company about something else is not relevant.
- summary: one or two plain sentences on what this exchange changed or established.
- nextStep: the single next action on the deal as of the latest message, phrased as an
  imperative ("Send revised deal memo to Dana"). Return "" if the thread does not make
  one clear, or if it is the same as the current next step.
- stage: a pipeline stage key, only when the thread clearly shows the deal has moved
  there (an offer made, terms agreed, contract signed, a pass). Otherwise "".
- stageReason: one short sentence quoting or paraphrasing the evidence for stage. "" if no stage.
- dates: concrete dated milestones or scheduled events agreed in the thread (signing,
  delivery, start of shoot, a call, pitch meeting, table read). label is a short name;
  date is YYYY-MM-DD. Resolve relative dates against the message they appear in. Skip
  dates already tracked with the same day. Prefer a meeting-like label when the date is
  a scheduled conversation (e.g. "Pitch call", "Zoom with Dana").
- tasks: actions our side committed to or was asked to do. text is an imperative task;
  owner is a team member's name only if the thread names them, else ""; dueDate is
  YYYY-MM-DD only if a deadline is stated, else "". Skip anything already in the open tasks.

Rules:
- Use only what is in the thread. Never invent names, amounts, dates or commitments.
- Pleasantries and newsletters change nothing: return empty fields. A clearly scheduled
  meeting or call still belongs in dates even if little else changed.
- If relevant is false, every other field is empty.

THREAD
${messagesText(messages)}`;
}

export function buildOpportunityEmailPrompt({ opportunity, messages, team = [], ourAddress = "", referenceDate }) {
  const existing = opportunity
    ? `EXISTING CONVERSATION
Title: ${opportunity.title}${opportunity.company ? `\nCompany: ${opportunity.company}` : ""}
Status: ${opportunity.status}
Current next step: ${opportunity.nextStep || "none"}
Summary on file: ${opportunity.summary || "none"}
Recent notes:
${(opportunity.recentNotes || []).length ? opportunity.recentNotes.map((n) => `- ${n}`).join("\n") : "none"}`
    : `No existing conversation is on file. If this thread is a real commercial conversation
(not a newsletter, receipt, or personal note), treat it as a new opportunity.`;

  return `You keep a film/TV production company's early conversations (opportunities) current from email.
Today's date is ${referenceDate}. Our mailbox is ${ourAddress || "unknown"}; our team: ${team.join(", ") || "unknown"}.

${existing}

Read the thread below and return the same shape as a deal reading:
- relevant: true only if this is a business conversation worth tracking (a possible deal,
  partnership, pitch, or ongoing commercial exchange). Newsletters, receipts, travel,
  and personal mail are not relevant.
- summary: one or two plain sentences on what this exchange established.
- nextStep: the single next action, imperative form, or "".
- stage: always "" for opportunities (they are not on a deal pipeline yet).
- stageReason: always "".
- dates: scheduled calls/meetings/pitches with YYYY-MM-DD dates. Use meeting-like labels.
- tasks: always [] for opportunities (tasks attach to deals).

Rules:
- Use only what is in the thread. Never invent commitments.
- If relevant is false, every other field is empty.

THREAD
${messagesText(messages)}`;
}

/**
 * Never throws: a failed read leaves the deal as it was and reports why.
 *
 * @param {{ deal: ReturnType<typeof import("../src/lib/dealMail.js").dealContextForPrompt>,
 *   messages: Array<{ from: string, sentAt: number, subject?: string, text: string }>,
 *   team?: string[], ourAddress?: string, referenceDate?: string, model?: string }} input
 */
export async function readDealEmail({ deal, messages, team = [], ourAddress = "", referenceDate, model = DEFAULT_SUMMARY_MODEL }) {
  if (!deal || !messages || !messages.some((m) => String(m.text || "").trim())) return { ...EMPTY };
  const date = ISO_DATE.test(String(referenceDate || "")) ? String(referenceDate) : new Date().toISOString().slice(0, 10);
  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: readingSchema }),
      prompt: buildDealEmailPrompt({ deal, messages, team, ourAddress, referenceDate: date }),
    });
    if (!output.relevant) return { ...EMPTY };
    return {
      relevant: true,
      summary: String(output.summary || "").trim(),
      nextStep: String(output.nextStep || "").trim(),
      stage: String(output.stage || "").trim(),
      stageReason: String(output.stageReason || "").trim(),
      dates: (output.dates || [])
        .map((d) => ({ label: String(d.label || "").trim(), date: String(d.date || "").trim() }))
        .filter((d) => d.label && ISO_DATE.test(d.date)),
      tasks: (output.tasks || [])
        .map((t) => ({
          text: String(t.text || "").trim(),
          owner: String(t.owner || "").trim(),
          dueDate: ISO_DATE.test(String(t.dueDate || "").trim()) ? String(t.dueDate).trim() : "",
        }))
        .filter((t) => t.text),
    };
  } catch (err) {
    return { ...EMPTY, error: (err && err.message) || "Reading the thread failed." };
  }
}

/**
 * Same reading shape as a deal, but for an unmatched commercial thread / opportunity.
 * Never throws.
 */
export async function readOpportunityEmail({
  opportunity = null,
  messages,
  team = [],
  ourAddress = "",
  referenceDate,
  model = DEFAULT_SUMMARY_MODEL,
}) {
  if (!messages || !messages.some((m) => String(m.text || "").trim())) return { ...EMPTY };
  const date = ISO_DATE.test(String(referenceDate || "")) ? String(referenceDate) : new Date().toISOString().slice(0, 10);
  try {
    const { output } = await generateText({
      model,
      output: Output.object({ schema: readingSchema }),
      prompt: buildOpportunityEmailPrompt({ opportunity, messages, team, ourAddress, referenceDate: date }),
    });
    if (!output.relevant) return { ...EMPTY };
    return {
      relevant: true,
      summary: String(output.summary || "").trim(),
      nextStep: String(output.nextStep || "").trim(),
      stage: "",
      stageReason: "",
      dates: (output.dates || [])
        .map((d) => ({ label: String(d.label || "").trim(), date: String(d.date || "").trim() }))
        .filter((d) => d.label && ISO_DATE.test(d.date)),
      tasks: [],
    };
  } catch (err) {
    return { ...EMPTY, error: (err && err.message) || "Reading the thread failed." };
  }
}
