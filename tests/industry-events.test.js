import { test } from "node:test";
import assert from "node:assert/strict";
import {
  INDUSTRY_EVENTS,
  INDUSTRY_EVENT_KINDS,
  nextIndustryWindow,
  isIndustryEventSoon,
  plannedIndustryEvent,
  planIndustryEvent,
  industryEventsMatching,
  industryEventsUpcoming,
} from "../src/lib/industryEvents.js";
import { normalizeData } from "../src/lib/model.js";

const SEP_3_2026 = Date.UTC(2026, 8, 3, 17, 0, 0); // 3 Sep 2026

function byId(id) {
  return INDUSTRY_EVENTS.find((e) => e.id === id);
}

test("the circuit includes the staples we named", () => {
  const ids = INDUSTRY_EVENTS.map((e) => e.id);
  assert.ok(ids.includes("cannes"));
  assert.ok(ids.includes("tiff"));
  assert.ok(ids.includes("sundance"));
  assert.ok(ids.includes("hpa-retreat"));
  assert.ok(ids.includes("hpa-awards"));
  assert.equal(INDUSTRY_EVENT_KINDS.length, 4);
});

test("every staple has a kind, typical window, location and link", () => {
  const kinds = new Set(INDUSTRY_EVENT_KINDS.map((k) => k.key));
  for (const event of INDUSTRY_EVENTS) {
    assert.ok(event.id && event.name && event.short, event.id);
    assert.ok(kinds.has(event.kind), `${event.id} kind`);
    assert.ok(event.month >= 1 && event.month <= 12, event.id);
    assert.ok(event.typical, event.id);
    assert.ok(event.location, event.id);
    assert.ok(event.why, event.id);
    assert.match(event.url, /^https:\/\//);
  }
  const unique = new Set(INDUSTRY_EVENTS.map((e) => e.id));
  assert.equal(unique.size, INDUSTRY_EVENTS.length);
});

test("next window rolls past editions into the following year", () => {
  const tiff = nextIndustryWindow(byId("tiff"), SEP_3_2026);
  assert.equal(tiff.year, 2026);
  assert.equal(tiff.label, "Sep 2026");

  const cannes = nextIndustryWindow(byId("cannes"), SEP_3_2026);
  assert.equal(cannes.year, 2027);
  assert.equal(cannes.label, "May 2027");

  const sundance = nextIndustryWindow(byId("sundance"), SEP_3_2026);
  assert.equal(sundance.year, 2027);

  const hpaAwards = nextIndustryWindow(byId("hpa-awards"), SEP_3_2026);
  assert.equal(hpaAwards.year, 2026);
});

test("soon flags dates inside the next six weeks", () => {
  assert.equal(isIndustryEventSoon(byId("tiff"), SEP_3_2026), true);
  assert.equal(isIndustryEventSoon(byId("sundance"), SEP_3_2026), false);
  assert.equal(isIndustryEventSoon(byId("ibc"), SEP_3_2026), true);
});

test("upcoming sort puts the next edition first", () => {
  const order = industryEventsUpcoming(SEP_3_2026).map((e) => e.id);
  assert.ok(order.indexOf("tiff") < order.indexOf("mipcom"));
  assert.ok(order.indexOf("tiff") < order.indexOf("cannes"));
  assert.ok(order.indexOf("sundance") > order.indexOf("afm"));
});

test("search matches short names and cities", () => {
  assert.equal(industryEventsMatching("cannes")[0].id, "cannes");
  assert.ok(industryEventsMatching("hpa").some((e) => e.id === "hpa-retreat"));
  assert.ok(industryEventsMatching("park city").some((e) => e.id === "sundance"));
  assert.equal(industryEventsMatching("").length, INDUSTRY_EVENTS.length);
});

test("plan for copies the staple onto the board as attending", () => {
  const planned = planIndustryEvent(byId("cannes"), SEP_3_2026);
  assert.equal(planned.name, "Cannes 2027");
  assert.equal(planned.kind, "attending");
  assert.equal(planned.status, "invited");
  assert.equal(planned.industryEventId, "cannes");
  assert.equal(planned.location, "Cannes");
  assert.match(planned.notes, /Typical window: mid-May/);
  assert.equal(planned.date, nextIndustryWindow(byId("cannes"), SEP_3_2026).ts);
});

test("plannedIndustryEvent ignores declined, done, and stale dates", () => {
  const events = [
    { industryEventId: "tiff", status: "declined", date: SEP_3_2026 + 86400000 },
    { industryEventId: "tiff", status: "invited", date: SEP_3_2026 + 86400000, id: "keep" },
  ];
  assert.equal(plannedIndustryEvent(events, "tiff", SEP_3_2026).id, "keep");
  assert.equal(plannedIndustryEvent([{ industryEventId: "tiff", status: "done", date: SEP_3_2026 }], "tiff", SEP_3_2026), null);
});

test("normalize keeps an industryEventId on events", () => {
  const data = normalizeData({
    events: [{ name: "Cannes 2027", industryEventId: "cannes" }],
  });
  assert.equal(data.events[0].industryEventId, "cannes");
  const blank = normalizeData({ events: [{ name: "A panel" }] });
  assert.equal(blank.events[0].industryEventId, null);
});
