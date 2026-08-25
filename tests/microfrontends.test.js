import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const config = JSON.parse(
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "microfrontends.json"), "utf8")
);

function pathsFor(app) {
  return (config.applications[app].routing || []).flatMap((group) => group.paths);
}

test("the group is dailie plus interface — a third project is billed", () => {
  assert.deepEqual(Object.keys(config.applications).sort(), ["dailie", "interface"]);
  assert.equal("routing" in config.applications.dailie, false);
  assert.deepEqual(pathsFor("interface"), ["/production", "/production/:path*"]);
});

test("child apps do not claim /api — that stays on Dailie", () => {
  const claimed = pathsFor("interface");
  assert.equal(claimed.some((path) => path === "/api" || path.startsWith("/api/") || path.startsWith("/api:")), false);
});
