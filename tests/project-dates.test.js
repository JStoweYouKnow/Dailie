import { test } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeData, makeProjectDate, normalizeProjectDates, projectCalendarMarks, PROJECT_DATE_SUGGESTIONS,
} from "../src/lib/model.js";

test("a project can keep extra named dates besides start and delivery", () => {
  const extra = makeProjectDate({ label: "Premiere", date: 1_700_000_000_000 });
  assert.equal(extra.label, "Premiere");
  assert.equal(extra.date, 1_700_000_000_000);
  assert.ok(extra.id);

  const data = normalizeData({
    projects: [{
      id: "proj-x",
      title: "Echo",
      startDate: 1_600_000_000_000,
      endDate: 1_650_000_000_000,
      dates: [{ label: "Wrap", date: 1_640_000_000_000 }],
    }],
  });
  const project = data.projects[0];
  assert.equal(project.startDate, 1_600_000_000_000);
  assert.equal(project.endDate, 1_650_000_000_000);
  assert.equal(project.dates.length, 1);
  assert.equal(project.dates[0].label, "Wrap");
  assert.ok(project.dates[0].id);
});

test("normalize fills an empty dates list without wiping other project fields", () => {
  const data = normalizeData({
    projects: [{ id: "proj-x", title: "Echo", nextStep: "Call the agent" }],
  });
  assert.deepEqual(data.projects[0].dates, []);
  assert.equal(data.projects[0].nextStep, "Call the agent");
  assert.equal(data.projects[0].driveUrl, "");
  assert.equal(data.projects[0].externalUrl, "");
});

test("a project keeps a Drive folder and an external link", () => {
  const data = normalizeData({
    projects: [{
      id: "proj-x",
      title: "Echo",
      driveUrl: "https://drive.google.com/drive/folders/abc",
      externalUrl: "https://frame.io/reviews/echo",
    }],
  });
  assert.equal(data.projects[0].driveUrl, "https://drive.google.com/drive/folders/abc");
  assert.equal(data.projects[0].externalUrl, "https://frame.io/reviews/echo");
});

test("normalizeProjectDates drops junk and keeps a usable id and label", () => {
  const dates = normalizeProjectDates([
    { id: "keep", label: "  Festival  ", date: 1_700_000_000_000 },
    { label: "Pitch" },
    null,
  ]);
  assert.equal(dates[0].id, "keep");
  assert.equal(dates[0].label, "Festival");
  assert.equal(dates[0].date, 1_700_000_000_000);
  assert.equal(dates[1].label, "Pitch");
  assert.equal(dates[1].date, null);
  assert.ok(dates[1].id);
  assert.equal(dates.length, 2);
});

test("the calendar plots start, delivery, and extra dates", () => {
  const marks = projectCalendarMarks({
    id: "proj-1",
    title: "The Obsidian Echo",
    recordType: "original",
    startDate: 10,
    endDate: 30,
    dates: [{ id: "pd-1", label: "Premiere", date: 50 }],
  });
  assert.deepEqual(marks.map((m) => m.label), [
    "The Obsidian Echo — start",
    "The Obsidian Echo — delivery",
    "The Obsidian Echo — Premiere",
  ]);
  assert.ok(PROJECT_DATE_SUGGESTIONS.includes("Premiere"));
});
