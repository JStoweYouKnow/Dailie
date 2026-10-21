import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEAL_STALL_DAYS,
  archiveReasonFor,
  archiveChange,
  restoreChange,
  dealsReadyToArchive,
  isArchivedProject,
  isLostOrPassedDeal,
} from "../src/lib/model.js";
import { isOpenDeal } from "../src/lib/dealMail.js";
import { DAY } from "../src/lib/format.js";

const NOW = Date.parse("2026-10-21T12:00:00Z");
const pipelines = {
  service: [
    { key: "pitch", label: "In Pitch" },
    { key: "delivered", label: "Delivered" },
    { key: "lost", label: "Lost / Passed" },
  ],
  original: [
    { key: "pitch", label: "In Pitch" },
    { key: "dead", label: "Passed on" },
  ],
};

const deal = (fields) => ({ id: "p", recordType: "service", pipelineStage: "pitch", updatedAt: NOW - DAY, ...fields });

test("lost and passed deals are ready to archive, including a renamed column", () => {
  assert.equal(archiveReasonFor(deal({ pipelineStage: "lost" }), { pipelines, now: NOW }), "lost");
  assert.equal(isLostOrPassedDeal(deal({ recordType: "original", pipelineStage: "dead" }), pipelines), true);
  assert.equal(archiveReasonFor(deal({ recordType: "original", pipelineStage: "dead" }), { pipelines, now: NOW }), "lost");
});

test("a quiet open deal is stalled, and a recently touched one is not", () => {
  const quiet = deal({ updatedAt: NOW - (DEAL_STALL_DAYS + 1) * DAY });
  assert.equal(archiveReasonFor(quiet, { pipelines, now: NOW }), "stalled");
  const recentMail = deal({
    updatedAt: NOW - 90 * DAY,
    lastContactAt: NOW - 2 * DAY,
  });
  assert.equal(archiveReasonFor(recentMail, { pipelines, now: NOW }), null);
});

test("delivered work is not stalled, and an archived deal is not offered again", () => {
  const done = deal({ pipelineStage: "delivered", updatedAt: NOW - 400 * DAY });
  assert.equal(archiveReasonFor(done, { pipelines, now: NOW }), null);
  const already = deal({ pipelineStage: "lost", archivedAt: NOW - DAY });
  assert.equal(isArchivedProject(already), true);
  assert.equal(archiveReasonFor(already, { pipelines, now: NOW }), null);
  assert.equal(isOpenDeal(already), false);
});

test("archiving records why, and restoring clears it", () => {
  const lost = archiveChange(deal({ pipelineStage: "lost" }), { pipelines, now: NOW });
  assert.deepEqual(lost.patch, { archivedAt: NOW, archiveReason: "lost" });
  assert.equal(lost.note, "Archived — lost / passed");

  const stalled = archiveChange(deal({ updatedAt: NOW - 90 * DAY }), { pipelines, now: NOW });
  assert.equal(stalled.patch.archiveReason, "stalled");
  assert.equal(stalled.note, "Archived — stalled");

  const manual = archiveChange(deal({ updatedAt: NOW }), { pipelines, now: NOW });
  assert.equal(manual.patch.archiveReason, "manual");

  assert.deepEqual(restoreChange().patch, { archivedAt: null, archiveReason: null });
});

test("only the stalled and lost deals are in the bulk set", () => {
  const projects = [
    deal({ id: "lost", pipelineStage: "lost", updatedAt: NOW }),
    deal({ id: "quiet", updatedAt: NOW - 90 * DAY }),
    deal({ id: "live", updatedAt: NOW }),
    deal({ id: "done", pipelineStage: "delivered", updatedAt: NOW - 90 * DAY }),
  ];
  assert.deepEqual(dealsReadyToArchive(projects, { pipelines, now: NOW }).map((p) => p.id), ["lost", "quiet"]);
});
