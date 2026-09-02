import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeData, makeSlatePackage, makeMandate, makePitch,
  SLATE_STATUSES, resolvedSlateStatus, mandateLabel, pitchLabel, mandateFitReason,
} from "../src/lib/model.js";
import { isSharedCollection } from "../src/lib/sharedBoard.js";
import { isAllowedContentType } from "../lib/allowedUploads.js";

test("slate, mandates and pitches are shared collections", () => {
  assert.equal(isSharedCollection("slate"), true);
  assert.equal(isSharedCollection("mandates"), true);
  assert.equal(isSharedCollection("pitches"), true);
  assert.deepEqual(SLATE_STATUSES.map((s) => s.key), ["draft", "package", "ready", "sent"]);
});

test("normalize fills empty slate, mandates and pitches", () => {
  const empty = normalizeData({});
  assert.deepEqual(empty.slate, []);
  assert.deepEqual(empty.mandates, []);
  assert.deepEqual(empty.pitches, []);

  const data = normalizeData({
    slate: [{ id: "slate-1", title: "Echo", logline: "A voice in the trench.", projectId: "proj-1" }],
    mandates: [{ id: "man-1", name: "Roku", kind: "streamer", mandate: "Family animation shorts." }],
    pitches: [{ id: "pit-1", projectId: "proj-1", name: "Roku", source: "ai" }],
  });
  const pkg = data.slate[0];
  assert.equal(pkg.title, "Echo");
  assert.equal(pkg.logline, "A voice in the trench.");
  assert.equal(pkg.status, "draft");
  assert.equal(pkg.driveUrl, "");
  assert.equal(data.mandates[0].name, "Roku");
  assert.equal(data.pitches[0].name, "Roku");
  assert.equal(data.pitches[0].source, "ai");
});

test("unlinked uploaded packages are Pitch package, not Sent", () => {
  assert.equal(resolvedSlateStatus({ projectId: null, status: "sent", attachments: [] }), "package");
  assert.equal(resolvedSlateStatus({
    projectId: null, status: "draft",
    attachments: [{ fileName: "deck.pdf" }],
  }), "package");
  assert.equal(resolvedSlateStatus({ projectId: "proj-1", status: "sent", attachments: [] }), "sent");

  const data = normalizeData({
    slate: [{ id: "slate-u", title: "Loose deck", status: "sent", attachments: [{ fileName: "one-sheet.pdf" }] }],
  });
  assert.equal(data.slate[0].status, "package");
});

test("makeSlatePackage defaults a draft package with a Drive field", () => {
  const pkg = makeSlatePackage({ title: "Neon Horizon", projectId: "proj-3" });
  assert.equal(pkg.status, "draft");
  assert.equal(pkg.projectId, "proj-3");
  assert.equal(pkg.driveUrl, "");
  assert.ok(pkg.id);
});

test("pitch labels prefer the company, then a typed name, then the mandate", () => {
  const companies = [{ id: "co-3", name: "Netflix" }];
  const mandates = [makeMandate({ id: "man-1", name: "Roku", kind: "streamer" })];
  assert.equal(pitchLabel({ companyId: "co-3", name: "Other" }, companies, mandates), "Netflix");
  assert.equal(pitchLabel({ name: "OpenArt" }, companies, mandates), "OpenArt");
  assert.equal(pitchLabel({ mandateId: "man-1" }, companies, mandates), "Roku");
  assert.equal(mandateLabel(mandates[0], companies), "Roku");
});

test("mandate fit reason needs overlapping words from the IP and the mandate", () => {
  const mandate = makeMandate({
    mandate: "Family animation and visual IP with a bright character hook",
  });
  const hit = mandateFitReason(mandate, { title: "Chomper Romp", description: "Family animation about a bright character" }, null);
  assert.match(hit, /mandate/);
  assert.equal(mandateFitReason(mandate, { title: "Obsidian Echo", description: "Deep sea thriller" }, null), null);
});

test("mandates keep uploaded files", () => {
  const made = makeMandate({ name: "Roku", attachments: [{ fileName: "brief.pdf" }] });
  assert.equal(made.attachments[0].fileName, "brief.pdf");

  const data = normalizeData({
    mandates: [{ id: "man-1", name: "Roku", attachments: [{ fileName: "brief.pdf" }] }],
  });
  assert.equal(data.mandates[0].attachments[0].fileName, "brief.pdf");

  const empty = normalizeData({ mandates: [{ id: "man-2", name: "Netflix" }] });
  assert.deepEqual(empty.mandates[0].attachments, []);
});

test("pitch decks in PowerPoint are an allowed upload", () => {
  assert.equal(isAllowedContentType("application/vnd.openxmlformats-officedocument.presentationml.presentation"), true);
  assert.equal(isAllowedContentType("video/mp4"), true);
});
