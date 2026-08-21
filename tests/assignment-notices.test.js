import { test } from "node:test";
import assert from "node:assert/strict";
import { assignmentNotices, unreadFor, normalizeData } from "../src/lib/model.js";

const ACTOR = "u-actor";
const OTHER = "u-other";

test("naming someone on a task notifies them", () => {
  const before = { id: "t1", title: "Lock the cut", assigneeIds: [] };
  const after = { ...before, assigneeIds: [OTHER] };
  const n = assignmentNotices("tasks", before, after, ACTOR);
  assert.equal(n.length, 1);
  assert.equal(n[0].userId, OTHER);
  assert.equal(n[0].actorId, ACTOR);
  assert.equal(n[0].recordType, "task");
  assert.equal(n[0].role, "assignee");
  assert.equal(n[0].title, "Lock the cut");
  assert.equal(n[0].readAt, null);
});

test("assigning yourself notifies nobody", () => {
  const before = { id: "t1", assigneeIds: [] };
  const after = { ...before, assigneeIds: [ACTOR] };
  assert.deepEqual(assignmentNotices("tasks", before, after, ACTOR), []);
});

test("someone already on the record is not notified again", () => {
  const before = { id: "t1", assigneeIds: [OTHER] };
  const after = { ...before, assigneeIds: [OTHER], title: "Renamed" };
  assert.deepEqual(assignmentNotices("tasks", before, after, ACTOR), []);
});

test("only the newly added person is notified", () => {
  const before = { id: "t1", assigneeIds: ["u-1"] };
  const after = { ...before, assigneeIds: ["u-1", "u-2"] };
  const n = assignmentNotices("tasks", before, after, ACTOR);
  assert.deepEqual(n.map((x) => x.userId), ["u-2"]);
});

test("removing someone notifies nobody", () => {
  const before = { id: "t1", assigneeIds: ["u-1", "u-2"] };
  const after = { ...before, assigneeIds: ["u-1"] };
  assert.deepEqual(assignmentNotices("tasks", before, after, ACTOR), []);
});

test("a brand new task notifies the people put on it", () => {
  const created = { id: "t9", title: "New", assigneeIds: [OTHER, ACTOR] };
  const n = assignmentNotices("tasks", null, created, ACTOR);
  assert.deepEqual(n.map((x) => x.userId), [OTHER]);
});

test("project owners and project team are told apart", () => {
  const before = { id: "p1", name: "", title: "Obsidian Echo", ownerIds: [], teamIds: [] };
  const owner = assignmentNotices("projects", before, { ...before, ownerIds: ["u-2"] }, ACTOR);
  assert.equal(owner[0].role, "owner");
  assert.equal(owner[0].recordType, "project");
  const crew = assignmentNotices("projects", before, { ...before, teamIds: ["u-3"] }, ACTOR);
  assert.equal(crew[0].role, "team");
});

test("collections without assignment fields raise nothing", () => {
  const before = { id: "c1", title: "NDA" };
  assert.deepEqual(assignmentNotices("contracts", before, { ...before, title: "NDA v2" }, ACTOR), []);
  // Notices are themselves records; writing one must not cascade.
  assert.deepEqual(assignmentNotices("notifications", null, { id: "n1", userId: OTHER }, ACTOR), []);
});

test("unreadFor returns only my unread, newest first", () => {
  const data = normalizeData({
    notifications: [
      { id: "n1", userId: OTHER, title: "old", createdAt: 100, readAt: null },
      { id: "n2", userId: OTHER, title: "new", createdAt: 300, readAt: null },
      { id: "n3", userId: OTHER, title: "seen", createdAt: 200, readAt: 250 },
      { id: "n4", userId: "someone-else", title: "theirs", createdAt: 400, readAt: null },
    ],
  });
  assert.deepEqual(unreadFor(data, OTHER).map((n) => n.title), ["new", "old"]);
  assert.deepEqual(unreadFor(data, null), []);
});

test("normalize fills defaults and survives a round trip", () => {
  const data = normalizeData({ notifications: [{ userId: "u-1" }] });
  const n = data.notifications[0];
  assert.ok(n.id);
  assert.equal(n.kind, "assignment");
  assert.equal(n.readAt, null);
  assert.ok(n.createdAt > 0);
  assert.deepEqual(normalizeData(data).notifications.map((x) => x.id), [n.id]);
});
