import { test } from "node:test";
import assert from "node:assert/strict";
import { createDraftUploadTracker, flushDraftCleanups } from "../src/lib/files.js";

const CLEANUP_KEY = "dailie-draft-file-cleanup-v1";

function file(id, path = `documents/${id}.pdf`) {
  return { id, filePath: path };
}

function tracker() {
  const removed = [];
  const drafts = createDraftUploadTracker((f) => { removed.push(f.id); });
  return { drafts, removed };
}

test("discard deletes uncommitted uploads", () => {
  const { drafts, removed } = tracker();
  assert.equal(drafts.keep(file("a")), true);
  drafts.discard();
  assert.deepEqual(removed, ["a"]);
});

test("markSaved then discard leaves committed files", () => {
  const { drafts, removed } = tracker();
  assert.equal(drafts.keep(file("a")), true);
  drafts.markSaved();
  drafts.discard();
  assert.deepEqual(removed, []);
});

test("keep after discard deletes a late-completing upload", () => {
  const { drafts, removed } = tracker();
  drafts.discard();
  assert.equal(drafts.keep(file("late")), false);
  assert.deepEqual(removed, ["late"]);
});

test("keep after save+discard still deletes a file that was never committed", () => {
  const { drafts, removed } = tracker();
  drafts.keep(file("saved"));
  drafts.markSaved();
  drafts.discard();
  assert.equal(drafts.keep(file("late")), false);
  assert.deepEqual(removed, ["late"]);
});

test("drop removes a draft immediately and discard does not delete it again", () => {
  const { drafts, removed } = tracker();
  const a = file("a");
  drafts.keep(a);
  drafts.drop(a);
  drafts.discard();
  assert.deepEqual(removed, ["a"]);
});

function mockLocalStorage() {
  const store = new Map();
  const previous = globalThis.localStorage;
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, String(v)); },
    removeItem: (k) => { store.delete(k); },
  };
  return {
    store,
    restore() {
      if (previous === undefined) delete globalThis.localStorage;
      else globalThis.localStorage = previous;
    },
  };
}

test("failed discard keeps a retryable cleanup record", async () => {
  const storage = mockLocalStorage();
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    return new Response(JSON.stringify({ error: "store failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const drafts = createDraftUploadTracker();
    drafts.keep(file("a"));
    drafts.discard();
    assert.equal(fetchCalls, 1);
    const queued = JSON.parse(storage.store.get(CLEANUP_KEY) || "[]");
    assert.equal(queued.length, 1);
    assert.equal(queued[0].filePath, "documents/a.pdf");
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(JSON.parse(storage.store.get(CLEANUP_KEY) || "[]").length, 1);
  } finally {
    globalThis.fetch = originalFetch;
    storage.restore();
  }
});

test("flushDraftCleanups drops a retry record after a successful delete", async () => {
  const storage = mockLocalStorage();
  const originalFetch = globalThis.fetch;
  storage.store.set(CLEANUP_KEY, JSON.stringify([{ id: "a", filePath: "documents/a.pdf" }]));
  globalThis.fetch = async () => new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  try {
    await flushDraftCleanups();
    assert.deepEqual(JSON.parse(storage.store.get(CLEANUP_KEY) || "[]"), []);
  } finally {
    globalThis.fetch = originalFetch;
    storage.restore();
  }
});
