import { test } from "node:test";
import assert from "node:assert/strict";
import { SEED_DATA, projectPitchSuggestions } from "../src/lib/model.js";
import {
  hasLocalContent,
  isSeedRecordId,
  pendingLocalContribution,
  toRecordsPayload,
  withoutSeedRecords,
} from "../src/lib/sharedBoard.js";

test("canned demo ids are recognised as seed", () => {
  assert.equal(isSeedRecordId("proj-1"), true);
  assert.equal(isSeedRecordId("co-1"), true);
  assert.equal(isSeedRecordId("mtjbuxq9eti0b4"), false);
  assert.equal(isSeedRecordId(""), false);
});

test("a board that is only the canned demo is not worth sharing", () => {
  assert.equal(hasLocalContent(SEED_DATA), false);
  assert.equal(pendingLocalContribution(SEED_DATA, {}), null);
});

test("a real record on top of the demo is offered, the demo is not", () => {
  const local = {
    ...SEED_DATA,
    projects: [
      ...SEED_DATA.projects,
      { id: "proj-real", title: "Keynote smoke test" },
    ],
  };
  const pending = pendingLocalContribution(local, {});
  assert.equal(pending.total, 1);
  assert.equal(pending.counts.projects, 1);
  const payload = toRecordsPayload(withoutSeedRecords(local));
  assert.equal(payload.collections.projects.some((p) => p.id === "proj-1"), false);
  assert.equal(payload.collections.projects.some((p) => p.id === "proj-real"), true);
});

test("a demo row already on the shared board is not offered again", () => {
  const local = {
    projects: [{ id: "proj-real", title: "Keynote smoke test" }, { id: "proj-1", title: "The Obsidian Echo" }],
  };
  const pending = pendingLocalContribution(local, {
    projects: [{ id: "proj-real", title: "Keynote smoke test" }],
  });
  assert.equal(pending, null);
});

test("a buyer we already pitched is not suggested again, an untouched mandate is", () => {
  const project = SEED_DATA.projects.find((p) => p.id === "proj-1");
  const packages = SEED_DATA.slate.filter((s) => s.projectId === "proj-1");
  const ideas = projectPitchSuggestions(SEED_DATA.mandates, project, packages, SEED_DATA.pitches);
  // man-2 (Netflix) is already on pit-1 for this project, so it must not come back.
  assert.equal(ideas.some(({ mandate }) => mandate.id === "man-2"), false);
  // Dropping that pitch puts it back in play, with a reason drawn from the mandate.
  const fresh = projectPitchSuggestions(SEED_DATA.mandates, project, packages, []);
  const netflix = fresh.find(({ mandate }) => mandate.id === "man-2");
  assert.ok(netflix, "an unpitched mandate that overlaps the IP should be suggested");
  assert.match(netflix.reason, /Fits their mandate/);
});

test("a company pitched without a mandate link still suppresses that company's mandate", () => {
  const project = SEED_DATA.projects.find((p) => p.id === "proj-1");
  const packages = SEED_DATA.slate.filter((s) => s.projectId === "proj-1");
  const loose = [{ id: "pit-x", projectId: "proj-1", companyId: "co-3", mandateId: null }];
  const ideas = projectPitchSuggestions(SEED_DATA.mandates, project, packages, loose);
  assert.equal(ideas.some(({ mandate }) => mandate.companyId === "co-3"), false);
});

test("pitches on another project do not filter this one's suggestions", () => {
  const project = { id: "proj-other", title: "Premium psychological sci-fi thriller with a female lead" };
  const other = [{ id: "pit-y", projectId: "proj-1", companyId: "co-3", mandateId: "man-2" }];
  const ideas = projectPitchSuggestions(SEED_DATA.mandates, project, [], other);
  assert.equal(ideas.some(({ mandate }) => mandate.id === "man-2"), true);
});
