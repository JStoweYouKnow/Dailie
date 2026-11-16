import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SOW_SECTION_DEFS,
  makeSowSection,
  normalizeSowSections,
  sowDraftFromProject,
  sowExportPayload,
} from "../src/lib/model.js";
import { sowToPdf, sowToDocx } from "../src/lib/sowExport.js";
import { DAY } from "../src/lib/format.js";

const NOW = Date.parse("2026-10-21T12:00:00Z");

test("sowDraftFromProject prefills parties, scope, fees, and timeline from a deal", () => {
  const project = {
    id: "proj-1",
    title: "The Obsidian Echo",
    description: "Feature development and packaging.",
    companyId: "co-1",
    contactName: "David Sterling",
    contactEmail: "d.sterling@a24.com",
    budget: "$14.5M",
    startDate: NOW,
    endDate: NOW + 90 * DAY,
    dates: [{ id: "d1", label: "Pitch", date: NOW + 14 * DAY }],
  };
  const draft = sowDraftFromProject(project, {
    company: { id: "co-1", name: "A24" },
    studioName: "Matriarch Studios",
  });
  assert.equal(draft.projectId, "proj-1");
  assert.equal(draft.companyId, "co-1");
  assert.match(draft.title, /Obsidian Echo/);
  assert.equal(draft.value, "$14.5M");
  assert.equal(draft.sections.length, DEFAULT_SOW_SECTION_DEFS.length);
  const parties = draft.sections.find((s) => s.title === "Parties");
  assert.match(parties.body, /Matriarch Studios/);
  assert.match(parties.body, /A24/);
  assert.match(parties.body, /David Sterling/);
  const scope = draft.sections.find((s) => s.title === "Scope of Work");
  assert.match(scope.body, /Feature development/);
  const fees = draft.sections.find((s) => s.title === "Fees & Payment");
  assert.match(fees.body, /\$14\.5M/);
  const timeline = draft.sections.find((s) => s.title === "Timeline & Milestones");
  assert.match(timeline.body, /Pitch/);
});

test("sowDraftFromProject works with no deal", () => {
  const draft = sowDraftFromProject(null, { studioName: "Matriarch Studios" });
  assert.equal(draft.projectId, null);
  assert.equal(draft.companyId, null);
  assert.equal(draft.title, "Statement of Work");
  assert.equal(draft.sections.length, DEFAULT_SOW_SECTION_DEFS.length);
});

test("sections can be added and removed through normalize helpers", () => {
  const base = normalizeSowSections([
    makeSowSection({ title: "Parties", body: "A" }),
    makeSowSection({ title: "Scope of Work", body: "B" }),
  ]);
  const withExtra = normalizeSowSections([...base, makeSowSection({ title: "Risks", body: "C" })]);
  assert.equal(withExtra.length, 3);
  const removed = normalizeSowSections(withExtra.filter((s) => s.title !== "Scope of Work"));
  assert.equal(removed.length, 2);
  assert.deepEqual(removed.map((s) => s.title), ["Parties", "Risks"]);
});

test("PDF export starts with a PDF header", () => {
  const draft = sowDraftFromProject({
    id: "p1",
    title: "Test Deal",
    description: "Do the work.",
    budget: "$10,000",
  }, { company: { name: "Client Co" } });
  const pdf = sowToPdf(draft);
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.match(pdf, /Test Deal/);
  assert.match(pdf, /Scope of Work/);
});

test("Word export is a ZIP archive", async () => {
  const draft = sowExportPayload(sowDraftFromProject({
    id: "p1",
    title: "Test Deal",
    description: "Do the work.\nSecond line.",
  }, { company: { name: "Client Co" } }));
  const blob = await sowToDocx(draft);
  const buf = Buffer.from(await blob.arrayBuffer());
  assert.equal(buf.slice(0, 2).toString(), "PK");
  assert.ok(buf.length > 1000);
});
