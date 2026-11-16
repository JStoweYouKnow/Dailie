import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SOW_SECTION_DEFS,
  DEFAULT_SOW_STUDIO_NAME,
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
    studioName: DEFAULT_SOW_STUDIO_NAME,
    sowNumber: "2026-014",
    ownershipModel: "clientOwned",
  });
  assert.equal(draft.projectId, "proj-1");
  assert.equal(draft.companyId, "co-1");
  assert.match(draft.title, /No\. 2026-014/);
  assert.match(draft.title, /Obsidian Echo/);
  assert.equal(draft.value, "$14.5M");
  assert.equal(draft.ownershipModel, "clientOwned");
  assert.equal(draft.preamble, undefined);
  assert.equal(draft.msaDate, undefined);
  assert.equal(draft.sections.length, DEFAULT_SOW_SECTION_DEFS.length);
  const parties = draft.sections.find((s) => s.title === "Parties");
  assert.match(parties.body, /Matriarch Studios, LLC/);
  assert.match(parties.body, /A24/);
  assert.match(parties.body, /David Sterling/);
  const scope = draft.sections.find((s) => s.title === "Project and Scope of Work");
  assert.match(scope.body, /Feature development/);
  assert.match(scope.body, /Production method/);
  const fees = draft.sections.find((s) => s.title === "Budget, Fees and Payment");
  assert.match(fees.body, /\$14\.5M/);
  assert.match(fees.body, /Total approved budget/);
  const timeline = draft.sections.find((s) => s.title === "Timeline, Approvals and Revisions");
  assert.match(timeline.body, /Pitch/);
  const ownership = draft.sections.find((s) => s.title === "Ownership and Rights");
  assert.match(ownership.body, /Client-Owned Production/);
  assert.doesNotMatch(ownership.body, /Agreement §/);
  const signatures = draft.sections.find((s) => s.title === "Signatures");
  assert.match(signatures.body, /A24/);
});

test("sowDraftFromProject works with no deal and has no MSA references", () => {
  const draft = sowDraftFromProject(null, { studioName: DEFAULT_SOW_STUDIO_NAME });
  assert.equal(draft.projectId, null);
  assert.equal(draft.companyId, null);
  assert.match(draft.title, /Statement of Work No\./);
  assert.equal(draft.sections.length, DEFAULT_SOW_SECTION_DEFS.length);
  assert.equal(draft.sections[0].title, "Parties");
  assert.equal(draft.sections[11].title, "Signatures");
  const blob = JSON.stringify(draft);
  assert.doesNotMatch(blob, /MSA|Master Production Services Agreement|Agreement §/);
});

test("sections can be added and removed through normalize helpers", () => {
  const base = normalizeSowSections([
    makeSowSection({ title: "Parties", body: "A" }),
    makeSowSection({ title: "Project and Scope of Work", body: "B" }),
  ]);
  const withExtra = normalizeSowSections([...base, makeSowSection({ title: "Risks", body: "C" })]);
  assert.equal(withExtra.length, 3);
  const removed = normalizeSowSections(withExtra.filter((s) => s.title !== "Project and Scope of Work"));
  assert.equal(removed.length, 2);
  assert.deepEqual(removed.map((s) => s.title), ["Parties", "Risks"]);
});

test("export payload includes ownership label without preamble", () => {
  const payload = sowExportPayload(sowDraftFromProject(null, {
    ownershipModel: "studioOwned",
  }));
  assert.equal(payload.ownershipLabel, "Studio-Owned Production");
  assert.equal(payload.preamble, undefined);
  assert.match(payload.studioName, /Matriarch Studios, LLC/);
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
  assert.match(pdf, /Project and Scope of Work/);
  assert.match(pdf, /Total approved budget/);
  assert.doesNotMatch(pdf, /Master Production Services Agreement/);
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
