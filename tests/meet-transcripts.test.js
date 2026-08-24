import { test } from "node:test";
import assert from "node:assert/strict";
import {
  entriesToSegments,
  meetConferences,
  meetRecordsFilter,
  meetTranscriptEntries,
  segmentsToTranscript,
} from "../lib/googleWorkspace.js";

const START = Date.parse("2026-04-15T16:00:00.000Z");

function jsonStub(routes) {
  return async (url) => {
    const hit = Object.keys(routes).find((k) => url.includes(k));
    if (!hit) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => routes[hit](url) };
  };
}

test("a later run asks only for conferences since, less an overlap", () => {
  const filter = meetRecordsFilter(START);
  const from = filter.match(/start_time>="([^"]+)"/)[1];
  assert.equal(Date.parse(from), START - 10 * 60000);
});

test("entries become offsets from the start of the conference", () => {
  const segments = entriesToSegments(
    [
      { participant: "conferenceRecords/c/participants/p1", text: "Rev 3 is cleared.", startTime: "2026-04-15T16:00:12.000Z", endTime: "2026-04-15T16:00:15.500Z" },
      { participant: "conferenceRecords/c/participants/p2", text: "Agreed.", startTime: "2026-04-15T16:01:00.000Z", endTime: "2026-04-15T16:01:02.000Z" },
    ],
    START,
    (p) => (p.endsWith("p1") ? "Dana Reeve" : "")
  );

  assert.deepEqual(segments, [
    { start: 12, end: 15.5, text: "Rev 3 is cleared.", speaker: "Dana Reeve" },
    { start: 60, end: 62, text: "Agreed.", speaker: "" },
  ]);
});

test("an entry that says nothing is not a segment", () => {
  const segments = entriesToSegments(
    [{ participant: "p", text: "   ", startTime: "2026-04-15T16:00:12.000Z", endTime: "2026-04-15T16:00:13.000Z" }],
    START
  );
  assert.deepEqual(segments, []);
});

test("an entry that joined before the conference record starts never goes negative", () => {
  const [segment] = entriesToSegments(
    [{ participant: "p", text: "Early.", startTime: "2026-04-15T15:59:50.000Z", endTime: "2026-04-15T15:59:55.000Z" }],
    START
  );
  assert.equal(segment.start, 0);
  assert.equal(segment.end, 0);
});

test("the transcript names its speakers where it knows them", () => {
  const text = segmentsToTranscript([
    { start: 0, end: 1, text: "Rev 3 is cleared.", speaker: "Dana Reeve" },
    { start: 2, end: 3, text: "Agreed.", speaker: "" },
  ]);
  assert.equal(text, "Dana Reeve: Rev 3 is cleared.\nAgreed.");
});

test("a conference still running is not collected", async () => {
  const stub = jsonStub({
    "/conferenceRecords?": () => ({
      conferenceRecords: [
        { name: "conferenceRecords/done", space: "spaces/s1", startTime: "2026-04-15T16:00:00Z", endTime: "2026-04-15T16:45:00Z" },
        { name: "conferenceRecords/live", space: "spaces/s2", startTime: "2026-04-15T17:00:00Z" },
      ],
    }),
  });

  const conferences = await meetConferences("tok", { fetchImpl: stub });
  assert.deepEqual(conferences.map((c) => c.id), ["done"]);
  assert.equal(conferences[0].space, "spaces/s1");
  assert.equal(conferences[0].startedAt, START);
});

test("a long transcript is read to the end, not just its first page", async () => {
  let calls = 0;
  const stub = async (url) => {
    calls += 1;
    const second = url.includes("pageToken=next");
    return {
      ok: true,
      json: async () =>
        second
          ? { transcriptEntries: [{ text: "b" }] }
          : { transcriptEntries: [{ text: "a" }], nextPageToken: "next" },
    };
  };

  const entries = await meetTranscriptEntries("tok", "conferenceRecords/c/transcripts/t", { fetchImpl: stub });
  assert.deepEqual(entries.map((e) => e.text), ["a", "b"]);
  assert.equal(calls, 2);
});
