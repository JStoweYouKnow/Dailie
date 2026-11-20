import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_SOW_SECTION_DEFS,
  DEFAULT_SOW_STUDIO_NAME,
  DEFAULT_SOW_TITLE,
  makeSowSection,
  normalizeSowSections,
  sowDraftFromProject,
  sowExportPayload,
  buildSowSections,
} from "../src/lib/model.js";
import { sowToPdf, sowToDocx } from "../src/lib/sowExport.js";
import { DAY } from "../src/lib/format.js";

const NOW = Date.parse("2026-10-21T12:00:00Z");

test("sowDraftFromProject pulls deal data into the official labeled SOW", () => {
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
  assert.equal(draft.title, DEFAULT_SOW_TITLE);
  assert.equal(draft.projectTitle, "The Obsidian Echo");
  assert.equal(draft.value, "$14.5M");
  assert.equal(draft.answers.feeAmount, "$14.5M");
  assert.match(draft.answers.clientReps, /David Sterling/);
  assert.equal(draft.sections.length, DEFAULT_SOW_SECTION_DEFS.length);
  const projectSection = draft.sections.find((s) => s.title === "Project");
  assert.match(projectSection.body, /Obsidian Echo/);
  const fees = draft.sections.find((s) => s.title === "Fee & Payment Schedule");
  assert.match(fees.body, /\$14\.5M/);
  const reps = draft.sections.find((s) => s.title === "Representatives");
  assert.match(reps.body, /David Sterling/);
  const deliverables = draft.sections.find((s) => s.title === "Deliverables / Delivery Dates & Approvals");
  assert.match(deliverables.body, /Pitch/);
});

test("sowDraftFromProject works with no deal", () => {
  const draft = sowDraftFromProject(null, { studioName: DEFAULT_SOW_STUDIO_NAME });
  assert.equal(draft.projectId, null);
  assert.equal(draft.companyId, null);
  assert.equal(draft.title, DEFAULT_SOW_TITLE);
  assert.equal(draft.sections.length, DEFAULT_SOW_SECTION_DEFS.length);
  assert.ok(draft.answers);
  assert.equal(draft.answers.deliverables.length, 3);
  assert.ok(draft.sections.some((s) => s.title === "Kill Fee"));
  assert.ok(draft.sections.some((s) => s.title === "Governing Law & Dispute Resolution"));
});

test("buildSowSections uses ownership and deliverable answers", () => {
  const draft = sowDraftFromProject(null, {
    ownershipModel: "studioOwned",
    answers: {
      clientEntityDetail: "a Singapore private limited company, operating as PixVerse",
      clientShortName: "PixVerse",
      deliverables: [
        { id: "a", name: "Short film up to 5 minutes", dueDate: "December 15, 2026", specs: "" },
        { id: "b", name: "Behind-the-scenes piece", dueDate: "December 18, 2026", specs: "60-90 seconds" },
      ],
      feedbackWindow: "2",
      revisionRounds: "1",
      feeAmount: "$12,000",
      depositPct: "75",
      finalPct: "25",
      credit: "aMatriarch",
      creditExtra: '"A PixVerse Original"',
      licenseTerritory: "worldwide",
      licenseTerm: "3 years from first public release",
    },
  });
  draft.clientName = "AIVORA PTE. LTD.";
  draft.projectTitle = "PixVerse Original Short Film";
  const sections = buildSowSections(draft);
  const project = sections.find((s) => s.title === "Project");
  assert.match(project.body, /PixVerse Original Short Film/);
  const deliverables = sections.find((s) => s.title === "Deliverables / Delivery Dates & Approvals");
  assert.match(deliverables.body, /\(1\) Short film/);
  assert.match(deliverables.body, /December 15, 2026/);
  assert.match(deliverables.body, /two \(2\) business days/);
  assert.match(deliverables.body, /one \(1\) set of revisions/);
  const fees = sections.find((s) => s.title === "Fee & Payment Schedule");
  assert.match(fees.body, /\$12,000/);
  assert.match(fees.body, /75%/);
  const rights = sections.find((s) => s.title === "Rights");
  assert.match(rights.body, /Matriarch owns the Project/);
  assert.match(rights.body, /worldwide/);
  const credit = sections.find((s) => s.title === "Credit");
  assert.match(credit.body, /A Matriarch Production/);
  assert.match(credit.body, /PixVerse Original/);
  const payload = sowExportPayload({ ...draft, sections, sectionsCustomized: false });
  assert.match(payload.clientParty, /AIVORA PTE\. LTD\./);
  assert.match(payload.clientParty, /PixVerse/);
  assert.match(payload.studioParty, /Matriarch Studios, LLC/);
});

test("sections can be added and removed through normalize helpers", () => {
  const base = normalizeSowSections([
    makeSowSection({ title: "Effective Date", body: "A" }),
    makeSowSection({ title: "Project", body: "B" }),
  ]);
  const withExtra = normalizeSowSections([...base, makeSowSection({ title: "Risks", body: "C" })]);
  assert.equal(withExtra.length, 3);
  const removed = normalizeSowSections(withExtra.filter((s) => s.title !== "Project"));
  assert.equal(removed.length, 2);
  assert.deepEqual(removed.map((s) => s.title), ["Effective Date", "Risks"]);
});

test("export payload keeps customized sections and otherwise rebuilds from answers", () => {
  const draft = sowDraftFromProject(null, {
    ownershipModel: "studioOwned",
    answers: { feeAmount: "$10,000", depositPct: "50" },
  });
  draft.answers.feeAmount = "$20,000";
  const rebuilt = sowExportPayload(draft);
  const fees = rebuilt.sections.find((s) => s.title === "Fee & Payment Schedule");
  assert.match(fees.body, /\$20,000/);

  draft.sections = [
    makeSowSection({ title: "Custom Only", body: "Kept as edited." }),
  ];
  draft.sectionsCustomized = true;
  const customized = sowExportPayload(draft);
  assert.equal(customized.sections.length, 1);
  assert.equal(customized.sections[0].title, "Custom Only");
  assert.match(customized.sections[0].body, /Kept as edited/);
});

test("PDF export uses labeled official sections", () => {
  const draft = sowDraftFromProject({
    id: "p1",
    title: "Test Deal",
    description: "Do the work.",
    budget: "$10,000",
  }, { company: { name: "Client Co" } });
  const pdf = sowToPdf(draft);
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.match(pdf, /Statement of Work/);
  assert.match(pdf, /Test Deal/);
  assert.match(pdf, /Fee & Payment Schedule/);
  assert.match(pdf, /Kill Fee/);
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
