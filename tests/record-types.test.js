import { test } from "node:test";
import assert from "node:assert/strict";
import { RECORD_TYPES, DEFAULT_PIPELINES, normalizeData } from "../src/lib/model.js";

test("Training / Consultancy is a record type with its own pipeline", () => {
  const type = RECORD_TYPES.find((t) => t.key === "training");
  assert.ok(type);
  assert.equal(type.label, "Training / Consultancy");
  assert.ok(Array.isArray(DEFAULT_PIPELINES.training));
  assert.ok(DEFAULT_PIPELINES.training.length > 0);
});

test("normalize fills a missing training pipeline without wiping existing ones", () => {
  const data = normalizeData({
    pipelines: {
      service: [{ key: "custom", label: "Custom", color: "#000" }],
    },
  });
  assert.equal(data.pipelines.service[0].key, "custom");
  assert.deepEqual(
    data.pipelines.training.map((s) => s.key),
    DEFAULT_PIPELINES.training.map((s) => s.key)
  );
});

test("Events Production is a record type with its own pipeline", () => {
  const type = RECORD_TYPES.find((t) => t.key === "eventsProduction");
  assert.ok(type);
  assert.equal(type.label, "Events Production");
  assert.ok(Array.isArray(DEFAULT_PIPELINES.eventsProduction));
  assert.ok(DEFAULT_PIPELINES.eventsProduction.length > 0);
});

test("normalize fills a missing events production pipeline without wiping existing ones", () => {
  const data = normalizeData({
    pipelines: {
      original: [{ key: "custom", label: "Custom", color: "#000" }],
    },
  });
  assert.equal(data.pipelines.original[0].key, "custom");
  assert.deepEqual(
    data.pipelines.eventsProduction.map((s) => s.key),
    DEFAULT_PIPELINES.eventsProduction.map((s) => s.key)
  );
});
