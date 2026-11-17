import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_DEAL_MEMO_SECTION_DEFS,
  DEFAULT_SOW_STUDIO_NAME,
  dealMemoDraftFrom,
  dealMemoExportPayload,
  buildDealMemoSections,
} from "../src/lib/model.js";
import { dealMemoToPdf, dealMemoToDocx } from "../src/lib/dealMemoExport.js";
import { DAY } from "../src/lib/format.js";

const NOW = Date.parse("2026-10-21T12:00:00Z");

test("dealMemoDraftFrom prefills from talent assignment and deal", () => {
  const talent = {
    id: "tal-1",
    name: "Ines Okafor",
    email: "ines@example.com",
    phone: "+1 555 0100",
    agent: "CAA",
    location: "Los Angeles",
    disciplines: ["Editor"],
    rateAmount: "1450",
    rateUnit: "day",
    currency: "USD",
    ndaContractId: "c-nda",
    assignments: [{
      id: "as-1",
      projectId: "proj-1",
      role: "Editor — assembly",
      startDate: NOW,
      endDate: NOW + 30 * DAY,
      allocation: 50,
      notes: "Assembly cut through fine cut.",
    }],
  };
  const project = {
    id: "proj-1",
    title: "The Obsidian Echo",
    companyId: "co-1",
    stage: "postproduction",
  };
  const draft = dealMemoDraftFrom({
    talent,
    project,
    studioName: DEFAULT_SOW_STUDIO_NAME,
    memoNumber: "DM-12",
  });
  assert.equal(draft.talentId, "tal-1");
  assert.equal(draft.projectId, "proj-1");
  assert.match(draft.title, /DM-12/);
  assert.match(draft.title, /Ines Okafor/);
  assert.match(draft.title, /Obsidian Echo/);
  assert.equal(draft.answers.role, "Editor — assembly");
  assert.equal(draft.answers.phase, "postproduction");
  assert.equal(draft.answers.engagementType, "post");
  assert.equal(draft.answers.rateAmount, "1450");
  assert.equal(draft.answers.allocation, "50");
  assert.equal(draft.answers.confidentiality, "existingNda");
  assert.match(draft.answers.scope, /Assembly cut/);
  assert.equal(draft.sections.length, DEFAULT_DEAL_MEMO_SECTION_DEFS.length);
  const parties = draft.sections.find((s) => s.title === "Parties");
  assert.match(parties.body, /Ines Okafor/);
  assert.match(parties.body, /CAA/);
  const compensation = draft.sections.find((s) => s.title === "Compensation");
  assert.match(compensation.body, /1450/);
});

test("dealMemoDraftFrom works with talent only", () => {
  const draft = dealMemoDraftFrom({
    talent: {
      id: "tal-2",
      name: "Sam Rivera",
      disciplines: ["Director of Photography"],
      rateAmount: "2200",
      rateUnit: "day",
    },
  });
  assert.equal(draft.projectId, null);
  assert.equal(draft.answers.role, "Director of Photography");
  assert.equal(draft.answers.engagementType, "production");
  assert.match(draft.title, /Sam Rivera/);
});

test("buildDealMemoSections uses selectable answers", () => {
  const draft = dealMemoDraftFrom({
    talent: { id: "t1", name: "Ava Chen", disciplines: ["Composer"] },
    project: { id: "p1", title: "Neon Horizon" },
    answers: {
      engagementType: "post",
      phase: "postproduction",
      exclusivity: "project",
      paymentSchedule: "halfHalf",
      credit: "aMatriarch",
      portfolioUse: "restricted",
      unionStatus: "sagAftra",
      deliverables: "Final score stems",
    },
  });
  const sections = buildDealMemoSections(draft);
  const engagement = sections.find((s) => s.title === "Engagement");
  assert.match(engagement.body, /Post-production talent/);
  assert.match(engagement.body, /Exclusive for this Project/);
  const compensation = sections.find((s) => s.title === "Compensation");
  assert.match(compensation.body, /50% start \/ 50% wrap/);
  const credit = sections.find((s) => s.title === "Credit & Portfolio");
  assert.match(credit.body, /A Matriarch Production/);
  assert.match(credit.body, /Restricted/);
  const scope = sections.find((s) => s.title === "Services & Scope");
  assert.match(scope.body, /Final score stems/);
});

test("export payload rebuilds sections from answers", () => {
  const draft = dealMemoDraftFrom({
    talent: { id: "t1", name: "Ava Chen", rateAmount: "900", rateUnit: "day" },
  });
  draft.answers.role = "Colourist";
  draft.answers.paymentSchedule = "onWrap";
  const payload = dealMemoExportPayload(draft);
  assert.equal(payload.role, "Colourist");
  const engagement = payload.sections.find((s) => s.title === "Engagement");
  assert.match(engagement.body, /Colourist/);
  const compensation = payload.sections.find((s) => s.title === "Compensation");
  assert.match(compensation.body, /On wrap/);
});

test("PDF export starts with a PDF header", () => {
  const draft = dealMemoDraftFrom({
    talent: { id: "t1", name: "Test Talent", rateAmount: "1000", rateUnit: "day" },
    project: { id: "p1", title: "Test Deal" },
  });
  const pdf = dealMemoToPdf(draft);
  assert.ok(pdf.startsWith("%PDF-1.4"));
  assert.match(pdf, /Test Talent/);
  assert.match(pdf, /Engagement/);
});

test("Word export is a ZIP archive", async () => {
  const draft = dealMemoExportPayload(dealMemoDraftFrom({
    talent: { id: "t1", name: "Test Talent" },
    project: { id: "p1", title: "Test Deal" },
  }));
  const blob = await dealMemoToDocx(draft);
  const buf = Buffer.from(await blob.arrayBuffer());
  assert.equal(buf.slice(0, 2).toString(), "PK");
  assert.ok(buf.length > 1000);
});
