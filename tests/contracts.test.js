import { test } from "node:test";
import assert from "node:assert/strict";
import { CONTRACT_KINDS, normalizeData, resolvedContractKind } from "../src/lib/model.js";

test("Beta Tester Agreement is a contract kind of its own", () => {
  const kind = CONTRACT_KINDS.find((k) => k.key === "betaTester");
  assert.ok(kind);
  assert.equal(kind.label, "Beta Tester Agreement");
  assert.ok(CONTRACT_KINDS.find((k) => k.key === "other"));
  assert.ok(
    CONTRACT_KINDS.findIndex((k) => k.key === "betaTester")
    < CONTRACT_KINDS.findIndex((k) => k.key === "other")
  );
});

test("an Other agreement titled as a beta tester agreement is re-homed", () => {
  const data = normalizeData({
    contracts: [
      { id: "ct-beta", title: "MATRIARCH - Beta Tester Agreement", kind: "other" },
      { id: "ct-nda", title: "A24 — Mutual NDA", kind: "nda" },
      { id: "ct-empty", title: "Beta Tester NDA", kind: "" },
    ],
  });
  assert.equal(data.contracts.find((c) => c.id === "ct-beta").kind, "betaTester");
  assert.equal(data.contracts.find((c) => c.id === "ct-nda").kind, "nda");
  assert.equal(data.contracts.find((c) => c.id === "ct-empty").kind, "betaTester");
});

test("resolvedContractKind does not steal an NDA that happens to mention testing", () => {
  assert.equal(resolvedContractKind({ kind: "nda", title: "Crew NDA for beta tester shoot" }), "nda");
  assert.equal(resolvedContractKind({ kind: "deal", title: "Beta Tester Agreement" }), "deal");
});
