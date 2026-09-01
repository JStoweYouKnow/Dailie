import { test } from "node:test";
import assert from "node:assert/strict";
import {
  COUNSEL_KINDS, REPRESENTATION_KINDS, LEGAL_KINDS,
  isRepresentationKind, rosterRepresentedBy, normalizeData,
} from "../src/lib/model.js";

test("agents live under Representation, not counsel", () => {
  assert.equal(COUNSEL_KINDS.some((k) => k.key === "agent"), false);
  assert.ok(REPRESENTATION_KINDS.find((k) => k.key === "agent"));
  assert.ok(REPRESENTATION_KINDS.find((k) => k.key === "manager"));
  assert.ok(LEGAL_KINDS.find((k) => k.key === "agent"));
  assert.equal(isRepresentationKind("agent"), true);
  assert.equal(isRepresentationKind("attorney"), false);
});

test("normalize keeps an existing agent on Representation", () => {
  const data = normalizeData({
    legal: [
      { id: "leg-a", kind: "agent", name: "Dana Liu", firm: "WME" },
      { id: "leg-b", kind: "attorney", name: "Ava Chen", firm: "Loeb & Loeb" },
    ],
  });
  const agent = data.legal.find((l) => l.id === "leg-a");
  const counsel = data.legal.find((l) => l.id === "leg-b");
  assert.equal(isRepresentationKind(agent.kind), true);
  assert.equal(isRepresentationKind(counsel.kind), false);
});

test("rosterRepresentedBy matches the Agent / Rep field on talent", () => {
  const talent = [
    { id: "tal-1", name: "Ines Okafor", agent: "WME — Dana Liu" },
    { id: "tal-2", name: "Ravi Chandrasekar", agent: "" },
    { id: "tal-3", name: "Marta Lindqvist", agent: "Salt Agency" },
  ];
  const dana = rosterRepresentedBy(talent, { name: "Dana Liu", firm: "WME" });
  assert.deepEqual(dana.map((t) => t.id), ["tal-1"]);
  const salt = rosterRepresentedBy(talent, { name: "Kai Salt", firm: "Salt Agency" });
  assert.deepEqual(salt.map((t) => t.id), ["tal-3"]);
  assert.deepEqual(rosterRepresentedBy(talent, { name: "", firm: "" }), []);
});
