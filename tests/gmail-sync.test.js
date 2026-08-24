import { test } from "node:test";
import assert from "node:assert/strict";
import { gmailQuery, gmailMessages, driveNotesQuery, parseMeetingNoteTitle } from "../lib/googleWorkspace.js";
import { deriveDirectoryFromEmails } from "../src/lib/model.js";

const MINUTE = 60000;

/** A Gmail stand-in: one list page, then metadata per message id. */
function gmailStub(messages, { onUrl } = {}) {
  return async (url) => {
    if (onUrl) onUrl(url);
    const json = url.includes("/messages?")
      ? { messages: messages.map((m) => ({ id: m.id })) }
      : messages.find((m) => url.includes(`/messages/${m.id}?`));
    if (!json) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => json };
  };
}

function message(id, headers, extra = {}) {
  return {
    id,
    threadId: `t-${id}`,
    snippet: "…",
    payload: { headers: Object.entries(headers).map(([name, value]) => ({ name, value })) },
    ...extra,
  };
}

test("a first run reads the same 60 days the manual sync always has", () => {
  assert.match(gmailQuery(undefined), /newer_than:60d/);
  assert.match(gmailQuery(0), /newer_than:60d/);
});

test("a later run asks only for what landed since, less an overlap", () => {
  const since = 1_700_000_000_000;
  const q = gmailQuery(since);
  const after = Number(q.match(/after:(\d+)/)[1]);
  assert.equal(after, Math.floor((since - 10 * MINUTE) / 1000));
  assert.ok(!q.includes("newer_than"));
});

test("messages arrive in the shape the board stores, keyed by Gmail's id", async () => {
  const stub = gmailStub([
    message("m1", {
      From: "Dana Reeve <dana@a24films.com>",
      To: "me@studio.com, Someone <other@studio.com>",
      Subject: "Deal memo",
      Date: "Mon, 4 Aug 2025 10:32:00 -0700",
    }, { internalDate: "1754328720000" }),
  ]);

  const [email] = await gmailMessages("tok", "me@studio.com", { fetchImpl: stub });

  assert.equal(email.id, "gmail-m1");
  assert.equal(email.from, "dana@a24films.com");
  assert.equal(email.fromName, "Dana Reeve");
  assert.deepEqual(email.to, ["me@studio.com", "other@studio.com"]);
  assert.equal(email.subject, "Deal memo");
  assert.equal(email.sentAt, 1754328720000);
  assert.equal(email.threadId, "t-m1");
  assert.equal(email.imported, true);
});

test("mail from the synced mailbox counts as sent, not received", async () => {
  const stub = gmailStub([
    message("m2", { From: "me@studio.com", To: "dana@a24films.com", Subject: "Re: Deal memo", Date: "Mon, 4 Aug 2025 11:00:00 -0700" }),
    message("m3", { From: "dana@a24films.com", To: "me@studio.com", Subject: "Deal memo", Date: "Mon, 4 Aug 2025 10:32:00 -0700" }),
  ]);

  const [sent, received] = await gmailMessages("tok", "ME@studio.com", { fetchImpl: stub });

  assert.equal(sent.direction, "out");
  assert.equal(sent.status, "Sent");
  assert.equal(received.direction, "in");
  assert.equal(received.status, "Received");
});

test("one unreadable message does not lose the rest of the run", async () => {
  const stub = async (url) => {
    if (url.includes("/messages?")) {
      return { ok: true, json: async () => ({ messages: [{ id: "bad" }, { id: "good" }] }) };
    }
    if (url.includes("/messages/bad?")) {
      return { ok: false, status: 500, json: async () => ({ error: { message: "boom" } }) };
    }
    return { ok: true, json: async () => message("good", { From: "dana@a24films.com", Subject: "Hi" }) };
  };

  const emails = await gmailMessages("tok", "me@studio.com", { fetchImpl: stub });
  assert.deepEqual(emails.map((e) => e.id), ["gmail-good"]);
});

test("the window is carried into the request Gmail actually receives", async () => {
  const urls = [];
  const stub = gmailStub([], { onUrl: (u) => urls.push(u) });
  await gmailMessages("tok", "me@studio.com", { since: 1_700_000_000_000, max: 25, fetchImpl: stub });

  assert.match(urls[0], /maxResults=25/);
  assert.match(decodeURIComponent(urls[0]), /after:\d+/);
});

/**
 * The scheduled ingest hands the derivation only the messages it has not stored
 * before, rather than the whole mailbox. These are the properties that makes safe.
 */
test("a partial batch still lands on the directory already on the board", () => {
  const derived = deriveDirectoryFromEmails({
    emails: [{ id: "gmail-1", from: "dana@a24films.com", fromName: "Dana Reeve", to: ["me@studio.com"], subject: "Deal memo", sentAt: 1, personId: null, companyId: null }],
    companies: [{ id: "co-1", name: "A24", domain: "a24films.com" }],
    people: [],
    settings: { emailAccounts: [{ address: "me@studio.com" }], currentUserId: null },
  });

  // The company is already known, so the batch must not invent a second one.
  assert.deepEqual(derived.newCompanies, []);
  assert.deepEqual(derived.newPeople.map((p) => [p.email, p.companyId]), [["dana@a24films.com", "co-1"]]);
  assert.equal(derived.emails[0].companyId, "co-1");
  assert.equal(derived.emails[0].personId, derived.newPeople[0].id);
  // Convex rejects undefined, so an unset owner has to come back as null.
  assert.equal(derived.newPeople[0].ownerId, null);
});

test("the synced mailbox's own domain is not read as a counterparty", () => {
  const derived = deriveDirectoryFromEmails({
    emails: [{ id: "gmail-2", from: "me@studio.com", to: ["colleague@studio.com"], subject: "Internal", sentAt: 1, personId: null, companyId: null }],
    companies: [],
    people: [],
    settings: { emailAccounts: [{ address: "me@studio.com" }], currentUserId: null },
  });

  assert.deepEqual(derived.newCompanies, []);
  assert.deepEqual(derived.newPeople, []);
});

/* ---- Drive: meeting notes shared in from another organisation ---- */

test("the notes search asks only for shared meeting docs", () => {
  const q = driveNotesQuery();
  assert.match(q, /sharedWithMe = true/);
  assert.match(q, /mimeType = 'application\/vnd\.google-apps\.document'/);
  assert.match(q, /trashed = false/);
  assert.match(q, /name contains 'Notes by Gemini' or name contains 'Transcript'/);
  assert.ok(!q.includes("modifiedTime"), "a first run has no window to continue from");
});

test("a later notes run asks only for what changed since", () => {
  const since = Date.parse("2026-04-15T12:00:00.000Z");
  const q = driveNotesQuery(since);
  const stamp = q.match(/modifiedTime > '([^']+)'/)[1];
  assert.equal(Date.parse(stamp), since - 10 * 60000);
});

test("a Gemini notes title gives up the meeting's own name and when it happened", () => {
  const parsed = parseMeetingNoteTitle("Monthly Baselane Ambassador Meeting - 2026/04/15 16:55 CDT - Notes by Gemini");
  assert.equal(parsed.title, "Monthly Baselane Ambassador Meeting");
  assert.equal(parsed.kind, "notes");
  assert.equal(new Date(parsed.startedAt).toISOString().slice(0, 10), "2026-04-15");
});

test("a title with no date leaves the caller to fall back on the file's own", () => {
  const parsed = parseMeetingNoteTitle("A24 sync - Transcript");
  assert.equal(parsed.title, "A24 sync");
  assert.equal(parsed.kind, "transcript");
  assert.equal(parsed.startedAt, null);
});

test("a name that is only a marker still yields something to call the meeting", () => {
  assert.equal(parseMeetingNoteTitle("Notes by Gemini").title, "Notes by Gemini");
  assert.equal(parseMeetingNoteTitle("").title, "");
});
