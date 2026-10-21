import { test } from "node:test";
import assert from "node:assert/strict";
import {
  makeOpportunity,
  normalizeConversations,
  isOpenOpportunity,
  dealFromOpportunity,
  normalizeData,
} from "../src/lib/model.js";

test("a conversation keeps only notes that say something, newest first", () => {
  const notes = normalizeConversations([
    { id: "a", at: 10, who: " Dana ", note: "  Send the one-sheet  " },
    { id: "b", at: 20, who: "", note: "   " },
    { id: "c", at: 30, note: "They want a series, not a film." },
  ]);
  assert.deepEqual(notes.map((n) => n.id), ["c", "a"]);
  assert.equal(notes[1].who, "Dana");
  assert.equal(notes[1].note, "Send the one-sheet");
});

test("an opportunity starts as an open conversation and can be passed or become a deal", () => {
  const open = makeOpportunity({ title: "Roku shorts", conversations: [{ note: "Intro call" }] });
  assert.equal(open.status, "talking");
  assert.equal(isOpenOpportunity(open), true);
  assert.equal(open.conversations.length, 1);
  assert.equal(isOpenOpportunity({ status: "passed" }), false);
  assert.equal(isOpenOpportunity({ status: "deal" }), false);
});

test("turning an opportunity into a deal carries the conversation across", () => {
  const opportunity = makeOpportunity({
    title: "A24 finish",
    summary: "They asked about a finishing package.",
    companyId: "co-1",
    contactName: "Dana",
    contactEmail: "Dana@A24.com",
    ownerId: "u-1",
    nextStep: "Send the bid",
  });
  const deal = dealFromOpportunity(opportunity, { recordType: "service", pipelineStage: "inbound", now: 50 });
  assert.equal(deal.title, "A24 finish");
  assert.equal(deal.description, "They asked about a finishing package.");
  assert.equal(deal.companyId, "co-1");
  assert.equal(deal.contactEmail, "dana@a24.com");
  assert.deepEqual(deal.ownerIds, ["u-1"]);
  assert.equal(deal.pipelineStage, "inbound");
  assert.equal(deal.nextStep, "Send the bid");
  assert.match(deal.history[0].note, /Opened from an opportunity/);
});

test("older boards gain an empty opportunities list", () => {
  const data = normalizeData({ projects: [], team: [] });
  assert.deepEqual(data.opportunities, []);
});
