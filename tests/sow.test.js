import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SOW_SECTION_DEFS,
  DEFAULT_SOW_STUDIO_NAME,
  makeSowSection,
  normalizeSowSections,
  sowDraftFromProject,
  sowExportPayload,
  buildSowSections,
} from "../src/lib/model.js";
import { sowToPdf, sowToDocx } from "../src/lib/sowExport.js";
import { DAY } from "../src/lib/format.js";

const NOW = Date.parse("2026-10-21T12:00:00Z");

test("sowDraftFromProject pulls deal data into answers and sections", () => {
  const project = {
    id: "proj-1",
    title: "The Obsidian Echo",
    description: "Feature development and packaging.",
    companyId: "co-1",
    recordType: "service",
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
  });
  assert.equal(draft.projectId, "proj-1");
  assert.equal(draft.companyId, "co-1");
  assert.equal(draft.ownershipModel, "clientOwned");
  assert.match(draft.title, /No\. 2026-014/);
  assert.match(draft.title, /Obsidian Echo/);
  assert.equal(draft.value, "$14.5M");
  assert.equal(draft.answers.scope, "Feature development and packaging.");
  assert.equal(draft.answers.productionFee, "$14.5M");
  assert.equal(draft.milestones.length, 1);
  assert.equal(draft.sections.length, DEFAULT_SOW_SECTION_DEFS.length);
  const parties = draft.sections.find((s) => s.title === "Parties");
  assert.match(parties.body, /Matriarch Studios, LLC/);
  assert.match(parties.body, /A24/);
  assert.match(parties.body, /David Sterling/);
  const scope = draft.sections.find((s) => s.title === "Project and Scope of Work");
  assert.match(scope.body, /Feature development/);
  const fees = draft.sections.find((s) => s.title === "Budget, Fees and Payment");
  assert.match(fees.body, /\$14\.5M/);
  const timeline = draft.sections.find((s) => s.title === "Timeline, Approvals and Revisions");
  assert.match(timeline.body, /Pitch/);
});

test("sowDraftFromProject works with no deal", () => {
  const draft = sowDraftFromProject(null, { studioName: DEFAULT_SOW_STUDIO_NAME });
  assert.equal(draft.projectId, null);
  assert.equal(draft.companyId, null);
  assert.match(draft.title, /Statement of Work No\./);
  assert.equal(draft.sections.length, DEFAULT_SOW_SECTION_DEFS.length);
  assert.ok(draft.answers);
  assert.equal(draft.answers.deliverables.length, 3);
});

test("buildSowSections uses selectable answers", () => {
  const draft = sowDraftFromProject(null, {
    ownershipModel: "studioOwned",
    answers: {
      format: "feature",
      formatDetail: "90 minutes",
      productionMethod: "hybrid",
      aiTools: "custom",
      aiToolsCustom: "Runway + Midjourney",
      licenseMedia: "All media",
      deliveryMethod: "drive",
      feedbackWindow: "5",
      revisionRounds: "1",
      credit: "aMatriarch",
      portfolioUse: "restricted",
    },
  });
  const sections = buildSowSections(draft);
  const scope = sections.find((s) => s.title === "Project and Scope of Work");
  assert.match(scope.body, /Feature; 90 minutes/);
  assert.match(scope.body, /Hybrid/);
  assert.match(scope.body, /Runway \+ Midjourney/);
  const ownership = sections.find((s) => s.title === "Ownership and Rights");
  assert.match(ownership.body, /Studio-Owned Production/);
  assert.match(ownership.body, /All media/);
  const deliverables = sections.find((s) => s.title === "Final Deliverables");
  assert.match(deliverables.body, /Drive/);
  const timeline = sections.find((s) => s.title === "Timeline, Approvals and Revisions");
  assert.match(timeline.body, /Five \(5\) Business Days/);
  assert.match(timeline.body, /One \(1\) round/);
  const production = sections.find((s) => s.title === "Production Terms");
  assert.match(production.body, /A Matriarch Production/);
  assert.match(production.body, /Restricted/);
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

test("export payload rebuilds sections from answers", () => {
  const draft = sowDraftFromProject(null, {
    ownershipModel: "studioOwned",
    answers: { format: "spot", productionMethod: "aiGenerated" },
  });
  draft.answers.format = "series";
  const payload = sowExportPayload(draft);
  assert.equal(payload.ownershipLabel, "Studio-Owned Production");
  const scope = payload.sections.find((s) => s.title === "Project and Scope of Work");
  assert.match(scope.body, /Series/);
  assert.match(scope.body, /AI-generated/);
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
