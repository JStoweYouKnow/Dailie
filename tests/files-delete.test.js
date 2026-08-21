import { test } from "node:test";
import assert from "node:assert/strict";
import { purgeAttachment, deleteFile, trashedAttachments } from "../src/lib/files.js";

function trashedRecord() {
  return {
    attachments: [{
      id: "a1",
      fileName: "nda.pdf",
      filePath: "documents/abc.pdf",
      fileUrl: "",
      fileSize: 12,
      fileType: "application/pdf",
      uploadedAt: 1,
      deletedAt: 99,
    }],
  };
}

test("deleteFile rejects when DELETE /api/files returns 500", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, opts) => {
    assert.equal(opts && opts.method, "DELETE");
    const parsed = new URL(String(url), "http://example.test");
    assert.equal(parsed.pathname, "/api/files");
    assert.equal(parsed.searchParams.get("path"), "documents/abc.pdf");
    return new Response(JSON.stringify({ error: "store failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    await assert.rejects(
      () => deleteFile({ filePath: "documents/abc.pdf" }),
      /store failed|500/
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("purgeAttachment does not permanently delete when DELETE /api/files returns 500", async () => {
  const originalFetch = globalThis.fetch;
  let deleted = false;
  globalThis.fetch = async (url, opts) => {
    assert.equal(opts && opts.method, "DELETE");
    assert.match(String(url), /\/api\/files\?path=/);
    deleted = true;
    return new Response(JSON.stringify({ error: "Could not delete the attachment." }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  };
  try {
    const record = trashedRecord();
    const item = record.attachments[0];
    const next = await purgeAttachment(record, item);
    assert.equal(deleted, true);
    assert.equal(next.length, 1);
    assert.equal(next[0].id, "a1");
    assert.equal(next[0].deletedAt, 99);
    assert.equal(trashedAttachments({ attachments: next }).length, 1);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
