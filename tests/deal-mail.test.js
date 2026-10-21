import { test } from "node:test";
import assert from "node:assert/strict";
import {
  dealForThread,
  threadsDueForDealCheck,
  dealChangesFromEmail,
  applyDealPatch,
  supersededSuggestion,
  dealContextForPrompt,
} from "../src/lib/dealMail.js";
import { canReadRecord, canWriteRecord, canReadCollection } from "../src/lib/houseAccess.js";
import { decodeGmailBody, messageBodyText, stripQuotedReply, gmailThreadText } from "../lib/googleWorkspace.js";

const NOW = Date.parse("2026-10-13T12:00:00Z");
const DAY = 24 * 60 * 60 * 1000;
const PIPELINE = [
  { key: "lead", label: "Lead" },
  { key: "negotiating", label: "Negotiating" },
  { key: "signed", label: "Signed" },
];

const settings = { emailAccounts: [{ address: "v@matriarch-studios.com" }] };

function mail(id, fields = {}) {
  return {
    id: `gmail-${id}`,
    threadId: "t1",
    account: "v@matriarch-studios.com",
    from: "dana@a24.com",
    to: ["v@matriarch-studios.com"],
    subject: "Obsidian Echo terms",
    snippet: "",
    sentAt: NOW - DAY,
    projectId: null,
    companyId: null,
    ...fields,
  };
}

const project = (id, fields = {}) => ({ id, title: id, pipelineStage: "negotiating", recordType: "film", ...fields });

test("a thread follows the deal one of its messages was filed on", () => {
  const data = { settings, projects: [project("p1"), project("p2")], emails: [] };
  const thread = [mail("a"), mail("b", { projectId: "p2" })];
  assert.deepEqual(dealForThread(thread, data), { projectId: "p2", via: "linked" });
});

test("the deal's contact email beats a company that has several deals", () => {
  const data = {
    settings,
    projects: [project("p1", { companyId: "c1", contactEmail: "Dana@A24.com" }), project("p2", { companyId: "c1" })],
  };
  assert.deepEqual(dealForThread([mail("a", { companyId: "c1" })], data), { projectId: "p1", via: "contact" });
});

test("a company with two open deals is ambiguous, and an ambiguous thread is left alone", () => {
  const data = { settings, projects: [project("p1", { companyId: "c1" }), project("p2", { companyId: "c1" })] };
  assert.equal(dealForThread([mail("a", { companyId: "c1" })], data), null);
});

test("closed deals and our own addresses never decide a match", () => {
  const data = {
    settings,
    projects: [project("p1", { companyId: "c1" }), project("p2", { companyId: "c1", pipelineStage: "lost" })],
    companies: [{ id: "c9", domain: "matriarch-studios.com" }],
  };
  assert.deepEqual(dealForThread([mail("a", { companyId: "c1" })], data), { projectId: "p1", via: "company" });
  const internal = [mail("b", { from: "kim@matriarch-studios.com" })];
  assert.equal(dealForThread(internal, data), null);
});

test("people on a deal match by any of their addresses", () => {
  const data = {
    settings,
    projects: [project("p1")],
    people: [{ id: "x", email: "other@a24.com", altEmails: ["dana@a24.com"], projectIds: ["p1"] }],
  };
  assert.deepEqual(dealForThread([mail("a")], data), { projectId: "p1", via: "person" });
});

test("only recent, unchecked Gmail threads on a deal are due, newest first", () => {
  const data = {
    settings,
    projects: [project("p1", { contactEmail: "dana@a24.com" })],
    emails: [
      mail("a", { threadId: "t1", sentAt: NOW - 2 * DAY }),
      mail("b", { threadId: "t2", sentAt: NOW - DAY }),
      mail("c", { threadId: "t3", sentAt: NOW - DAY, dealCheckedAt: NOW }),
      mail("d", { threadId: "t4", sentAt: NOW - 30 * DAY }),
      { ...mail("e", { threadId: "pasted" }), id: "em-1" },
    ],
  };
  const due = threadsDueForDealCheck(data, { since: NOW - 14 * DAY });
  assert.deepEqual(due.map((t) => t.threadId), ["t2", "t1"]);
  assert.equal(due[0].latestEmailId, "gmail-b");
  assert.equal(threadsDueForDealCheck({ ...data, settings: { ...settings, dealsFromEmail: false } }, { since: 0 }).length, 0);
});

const reading = (fields = {}) => ({
  relevant: true, summary: "Dana agreed terms.", nextStep: "", stage: "", stageReason: "", dates: [], tasks: [], ...fields,
});
const thread = { threadId: "t1", latestEmailId: "gmail-b", latestAt: NOW - DAY, subject: "Terms", emailIds: ["gmail-a", "gmail-b"] };

test("an irrelevant thread changes nothing", () => {
  assert.equal(dealChangesFromEmail(project("p1"), reading({ relevant: false }), { thread, now: NOW }), null);
});

test("next step, last contact and dates land on the deal; a stage move is only suggested", () => {
  const p = project("p1", {
    nextStep: "Chase Dana",
    dates: [{ id: "d1", label: "Signing", date: Date.parse("2026-10-20T12:00:00") }],
  });
  const out = dealChangesFromEmail(p, reading({
    nextStep: "Send revised deal memo",
    stage: "signed",
    stageReason: "Dana: 'we're good to sign'",
    dates: [
      { label: "signing", date: "2026-10-22" },
      { label: "Delivery", date: "2027-03-01" },
      { label: "Bad", date: "next week" },
    ],
  }), { pipeline: PIPELINE, thread, now: NOW });

  assert.equal(out.patch.nextStep, "Send revised deal memo");
  assert.equal(out.patch.lastContactAt, NOW - DAY);
  assert.equal(out.patch.pipelineStage, undefined);
  assert.equal(out.patch.dates.length, 2);
  assert.equal(out.patch.dates[0].id, "d1");
  assert.equal(new Date(out.patch.dates[0].date).getDate(), 22);
  assert.deepEqual(out.update.stageSuggestion && out.update.stageSuggestion.to, "signed");
  assert.equal(out.update.stageSuggestion.status, "pending");
  assert.ok(out.notes.includes("Next step (from email): Send revised deal memo"));
  assert.ok(out.notes.some((n) => n.startsWith("Moved date from email: Signing")));
});

test("a stage the pipeline does not have, or the current one, is never suggested", () => {
  const p = project("p1");
  assert.equal(dealChangesFromEmail(p, reading({ stage: "greenlit" }), { pipeline: PIPELINE, thread, now: NOW }).update.stageSuggestion, null);
  assert.equal(dealChangesFromEmail(p, reading({ stage: "negotiating" }), { pipeline: PIPELINE, thread, now: NOW }).update.stageSuggestion, null);
});

test("follow-up tasks are house-only, skip what is already open, and go to the mailbox owner", () => {
  const out = dealChangesFromEmail(project("p1"), reading({
    tasks: [
      { text: "Send the deal memo", owner: "", dueDate: "2026-10-15" },
      { text: "Book the table read", owner: "Marcus Vance", dueDate: "" },
      { text: "Call legal", owner: "", dueDate: "" },
    ],
  }), {
    thread,
    now: NOW,
    ownerId: "u-1",
    team: [{ id: "u-1", name: "V" }, { id: "u-2", name: "Marcus Vance" }],
    tasks: [{ id: "x", projectId: "p1", status: "todo", title: "Call legal re: chain of title" }],
  });
  assert.deepEqual(out.tasks.map((t) => t.title), ["Send the deal memo", "Book the table read"]);
  assert.ok(out.tasks.every((t) => t.houseOnly === true && t.source === "email" && t.projectId === "p1"));
  assert.deepEqual(out.tasks[0].assigneeIds, ["u-1"]);
  assert.deepEqual(out.tasks[1].assigneeIds, ["u-2"]);
  assert.ok(out.tasks[0].dueDate);
  assert.deepEqual(out.update.applied.taskIds, out.tasks.map((t) => t.id));
  // The deal's own log, which contractors can read, says how many — not what.
  assert.ok(out.notes.includes("2 follow-up tasks added from email"));
  assert.ok(!out.notes.some((n) => n.includes("deal memo")));
});

test("the patched deal carries each change on its activity log", () => {
  const p = project("p1", { history: [{ id: "h0", date: 1, note: "Created" }] });
  const changes = dealChangesFromEmail(p, reading({ nextStep: "Sign" }), { thread, now: NOW });
  const next = applyDealPatch(p, changes, { now: NOW, newId: (i) => `h${i + 1}` });
  assert.equal(next.nextStep, "Sign");
  assert.equal(next.history.length, 2);
  assert.equal(next.history[1].note, "Next step (from email): Sign");
  assert.equal(next.updatedAt, NOW);
});

test("a newer suggestion supersedes a pending one, and leaves decided ones alone", () => {
  const pending = { id: "u1", stageSuggestion: { to: "signed", status: "pending" } };
  assert.equal(supersededSuggestion(pending).stageSuggestion.status, "superseded");
  const accepted = { id: "u2", stageSuggestion: { to: "signed", status: "accepted" } };
  assert.equal(supersededSuggestion(accepted), accepted);
});

test("the prompt context lists the pipeline and only the deal's open tasks", () => {
  const ctx = dealContextForPrompt(project("p1", { nextStep: "x" }), {
    pipeline: PIPELINE,
    tasks: [
      { projectId: "p1", status: "todo", title: "Open" },
      { projectId: "p1", status: "done", title: "Done" },
      { projectId: "p2", status: "todo", title: "Other deal" },
    ],
  });
  assert.equal(ctx.stage, "Negotiating");
  assert.deepEqual(ctx.openTasks, ["Open"]);
  assert.equal(ctx.stages.length, 3);
});

test("house-only records stay out of a contractor's view and reach", () => {
  const secret = { id: "t", houseOnly: true };
  assert.equal(canReadRecord("tasks", secret, { isHouse: false }), false);
  assert.equal(canReadRecord("tasks", secret, { isHouse: true }), true);
  assert.equal(canReadRecord("tasks", { id: "t" }, { isHouse: false }), true);
  assert.equal(canReadCollection("dealUpdates", { isHouse: false }), false);
  assert.equal(canWriteRecord("tasks", { prior: secret, next: { id: "t" } }, { isHouse: false }), false);
  assert.equal(canWriteRecord("tasks", { prior: null, next: secret }, { isHouse: false }), false);
  assert.equal(canWriteRecord("tasks", { prior: secret, next: null }, { isHouse: true }), true);
});

const b64url = (text) => Buffer.from(text, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

test("Gmail bodies decode, prefer plain text, and lose the quoted history", () => {
  assert.equal(decodeGmailBody(b64url("Café — ok")), "Café — ok");
  const payload = {
    mimeType: "multipart/alternative",
    parts: [
      { mimeType: "text/html", body: { data: b64url("<p>HTML</p>") } },
      { mimeType: "text/plain", body: { data: b64url("Plain") } },
    ],
  };
  assert.equal(messageBodyText(payload), "Plain");
  assert.equal(messageBodyText({ mimeType: "text/html", body: { data: b64url("<p>Hi&amp;bye</p><br>x") } }).trim(), "Hi&bye\n\nx");
  const reply = "Sounds good, let's sign Friday.\n\nOn Mon, Oct 12, 2026 at 9:00 AM Dana <dana@a24.com> wrote:\n> Are we good?";
  assert.equal(stripQuotedReply(reply), "Sounds good, let's sign Friday.");
});

test("a thread is read in order with each message trimmed to what it adds", async () => {
  const fetchImpl = async (url) => {
    assert.ok(url.includes("/threads/t%201?format=full"));
    return {
      ok: true,
      json: async () => ({
        messages: [{
          internalDate: String(NOW),
          snippet: "snip",
          payload: {
            headers: [{ name: "From", value: "Dana <dana@a24.com>" }, { name: "Subject", value: "Terms" }],
            mimeType: "text/plain",
            body: { data: b64url("Yes.\n> old") },
          },
        }],
      }),
    };
  };
  const messages = await gmailThreadText("tok", "t 1", { fetchImpl });
  assert.deepEqual(messages, [{ from: "Dana <dana@a24.com>", sentAt: NOW, subject: "Terms", text: "Yes." }]);
});
