import { test } from "node:test";
import assert from "node:assert/strict";
import { readDealsBoardPrefs, writeDealsBoardPrefs, DEALS_BOARD_DEFAULTS } from "../src/lib/uiPrefs.js";

const memory = new Map();

function installLocalStorage() {
  globalThis.localStorage = {
    getItem(key) { return memory.has(key) ? memory.get(key) : null; },
    setItem(key, value) { memory.set(key, String(value)); },
    removeItem(key) { memory.delete(key); },
    clear() { memory.clear(); },
  };
}

test("deal board prefs default and round-trip per user", () => {
  installLocalStorage();
  memory.clear();
  assert.deepEqual(readDealsBoardPrefs("u-1"), DEALS_BOARD_DEFAULTS);

  writeDealsBoardPrefs("u-1", {
    viewMode: "table",
    boardFilter: "lost",
    typeFilter: "service",
    priorityFilter: "HIGH",
    mineOnly: true,
    showArchive: false,
    projectColumnOrder: ["title", "budget"],
  });
  writeDealsBoardPrefs("u-2", {
    viewMode: "gallery",
    boardFilter: "active",
  });

  const one = readDealsBoardPrefs("u-1");
  assert.equal(one.viewMode, "table");
  assert.equal(one.boardFilter, "lost");
  assert.equal(one.typeFilter, "service");
  assert.equal(one.priorityFilter, "HIGH");
  assert.equal(one.mineOnly, true);
  assert.deepEqual(one.projectColumnOrder, ["title", "budget"]);

  const two = readDealsBoardPrefs("u-2");
  assert.equal(two.viewMode, "gallery");
  assert.equal(two.boardFilter, "active");
  assert.equal(two.mineOnly, false);
  assert.notEqual(one.viewMode, two.viewMode);
});

test("invalid saved values fall back to defaults", () => {
  installLocalStorage();
  memory.clear();
  memory.set("dailie-deals-board-v1:u-3", JSON.stringify({
    viewMode: "nope",
    boardFilter: "maybe",
    priorityFilter: "URGENT",
    projectColumnOrder: "bad",
  }));
  const prefs = readDealsBoardPrefs("u-3");
  assert.equal(prefs.viewMode, "pipeline");
  assert.equal(prefs.boardFilter, "active");
  assert.equal(prefs.priorityFilter, "all");
  assert.deepEqual(prefs.projectColumnOrder, []);
});
