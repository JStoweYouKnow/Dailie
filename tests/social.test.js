import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeData, makeSocialItem, SOCIAL_KINDS, SOCIAL_STATUSES, SOCIAL_PLATFORMS } from "../src/lib/model.js";
import { isSharedCollection } from "../src/lib/sharedBoard.js";
import { datetimeInputValue, tsFromDatetimeInput } from "../src/lib/format.js";

test("social is a shared collection with post and event kinds", () => {
  assert.equal(isSharedCollection("social"), true);
  assert.deepEqual(SOCIAL_KINDS.map((k) => k.key), ["post", "event"]);
  assert.deepEqual(SOCIAL_STATUSES.map((s) => s.key), ["idea", "draft", "scheduled", "posted", "cancelled"]);
  assert.ok(SOCIAL_PLATFORMS.find((p) => p.key === "instagram"));
  assert.ok(SOCIAL_PLATFORMS.find((p) => p.key === "tiktok"));
});

test("normalize fills an empty social calendar and keeps a stored post", () => {
  const empty = normalizeData({});
  assert.deepEqual(empty.social, []);

  const data = normalizeData({
    social: [{ id: "soc-1", title: "Teaser still", copy: "Calling back.", projectId: "proj-1" }],
  });
  const item = data.social[0];
  assert.equal(item.title, "Teaser still");
  assert.equal(item.copy, "Calling back.");
  assert.equal(item.kind, "post");
  assert.equal(item.status, "idea");
  assert.equal(item.platform, "instagram");
  assert.equal(item.scheduledAt, null);
  assert.deepEqual(item.attachments, []);
});

test("makeSocialItem defaults a draft post", () => {
  const item = makeSocialItem({ title: "Live Q&A", kind: "event", platform: "youtube" });
  assert.equal(item.kind, "event");
  assert.equal(item.platform, "youtube");
  assert.equal(item.status, "idea");
  assert.ok(item.id);
});

test("datetime-local values round-trip a local timestamp", () => {
  const ts = new Date(2026, 7, 26, 9, 30).getTime();
  const value = datetimeInputValue(ts);
  assert.equal(value, "2026-08-26T09:30");
  assert.equal(tsFromDatetimeInput(value), ts);
  assert.equal(tsFromDatetimeInput(""), null);
});
