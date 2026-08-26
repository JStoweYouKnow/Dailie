import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeData, makeSlatePackage, SLATE_STATUSES } from "../src/lib/model.js";
import { isSharedCollection } from "../src/lib/sharedBoard.js";
import { isAllowedContentType } from "../lib/allowedUploads.js";

test("slate is a shared collection with ready-to-send statuses", () => {
  assert.equal(isSharedCollection("slate"), true);
  assert.deepEqual(SLATE_STATUSES.map((s) => s.key), ["draft", "ready", "sent"]);
});

test("normalize fills an empty slate and keeps a stored package", () => {
  const empty = normalizeData({});
  assert.deepEqual(empty.slate, []);

  const data = normalizeData({
    slate: [{ id: "slate-1", title: "Echo", logline: "A voice in the trench.", projectId: "proj-1" }],
  });
  const pkg = data.slate[0];
  assert.equal(pkg.title, "Echo");
  assert.equal(pkg.logline, "A voice in the trench.");
  assert.equal(pkg.status, "draft");
  assert.equal(pkg.synopsis, "");
  assert.deepEqual(pkg.attachments, []);
});

test("makeSlatePackage defaults a draft package", () => {
  const pkg = makeSlatePackage({ title: "Neon Horizon", projectId: "proj-3" });
  assert.equal(pkg.status, "draft");
  assert.equal(pkg.projectId, "proj-3");
  assert.ok(pkg.id);
});

test("pitch decks in PowerPoint are an allowed upload", () => {
  assert.equal(isAllowedContentType("application/vnd.openxmlformats-officedocument.presentationml.presentation"), true);
  assert.equal(isAllowedContentType("video/mp4"), true);
});
