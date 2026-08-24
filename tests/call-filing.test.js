import { test } from "node:test";
import assert from "node:assert/strict";
import { makeCall, tasksForCall, meetingNoteForCall } from "../src/lib/model.js";

const TEAM = [{ id: "u-1", name: "Elena Rostova" }, { id: "u-2", name: "Marcus Vance" }];

test("a call keeps only the next steps that say something", () => {
  const call = makeCall({
    nextSteps: [
      { id: "a", text: "  Send the deal memo  ", owner: "  Elena Rostova ", dueDate: "2026-09-01" },
      { id: "b", text: "   ", owner: "Marcus Vance" },
    ],
  });

  assert.deepEqual(call.nextSteps, [
    { id: "a", text: "Send the deal memo", owner: "Elena Rostova", dueDate: "2026-09-01" },
  ]);
});

test("participants and segments arrive in the shape the transcript view reads", () => {
  const call = makeCall({
    participants: "Elena Rostova <elena@matriarch-studios.com>, Dana",
    segments: [{ start: "3.5", end: "9", text: "We're clear on rev 3.", speaker: "Elena" }],
  });

  assert.deepEqual(call.participants.map((p) => p.name), ["Elena Rostova", "Dana"]);
  assert.equal(call.participants[0].email, "elena@matriarch-studios.com");
  assert.deepEqual(call.segments, [{ start: 3.5, end: 9, text: "We're clear on rev 3.", speaker: "Elena" }]);
});

test("a named owner on the team gets the task assigned", () => {
  const call = makeCall({
    projectId: "proj-1",
    meetingId: "m-1",
    nextSteps: [{ text: "Send the deal memo", owner: "elena rostova", dueDate: "2026-09-01" }],
  });
  const [task] = tasksForCall(call, { team: TEAM, currentUserId: "u-9" });

  assert.deepEqual(task.assigneeIds, ["u-1"]);
  assert.equal(task.assigneeLabel, "");
  assert.equal(task.projectId, "proj-1");
  assert.equal(task.meetingId, "m-1");
  assert.equal(task.callId, call.id);
  assert.equal(task.source, "call");
  assert.equal(task.priority, "HIGH");
  assert.equal(typeof task.dueDate, "number");
});

test("an owner nobody recognises stays a label, and the task lands on whoever filed it", () => {
  const call = makeCall({ nextSteps: [{ text: "Chase the clearance", owner: "Someone External" }] });
  const [task] = tasksForCall(call, { team: TEAM, currentUserId: "u-9" });

  assert.deepEqual(task.assigneeIds, ["u-9"]);
  assert.equal(task.assigneeLabel, "Someone External");
  assert.equal(task.dueDate, null);
});

test("an unattended import with nobody to file it leaves the task unassigned", () => {
  const call = makeCall({ nextSteps: [{ text: "Chase the clearance", owner: "" }] });
  const [task] = tasksForCall(call, { team: TEAM, currentUserId: null });

  assert.deepEqual(task.assigneeIds, []);
  assert.equal(task.assigneeLabel, "");
});

test("filing a call appends to the meeting rather than replacing its notes", () => {
  const call = makeCall({ id: "meet-123", title: "A24 sync", summary: "Agreed on rev 3." });
  const patch = meetingNoteForCall({ notes: "Prior context." }, call);

  assert.equal(patch.callId, "meet-123");
  assert.ok(patch.notes.startsWith("Prior context."));
  assert.ok(patch.notes.includes("A24 sync"));
  assert.ok(patch.notes.includes("Agreed on rev 3."));
});

test("with no summary the meeting note falls back to the transcript", () => {
  const call = makeCall({ title: "A24 sync", summary: "", transcript: "Raw words." });
  assert.ok(meetingNoteForCall({ notes: "" }, call).notes.includes("Raw words."));
});
