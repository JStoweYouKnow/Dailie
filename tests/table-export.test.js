import { test } from "node:test";
import assert from "node:assert/strict";
import { cellText, escapeCsvField, tableToCsv, tableToPdf, exportableColumns, exportFilename, canExportBoard, exportEmailFromSession } from "../src/lib/tableExport.js";

const columns = [
  { key: "title", label: "TASK" },
  { key: "status", label: "STATUS" },
  { key: "del", label: "" },
  { key: "due", label: "DUE" },
];

test("exportableColumns skips unlabeled action columns", () => {
  assert.deepEqual(exportableColumns(columns).map((c) => c.key), ["title", "status", "due"]);
});

test("escapeCsvField quotes commas and doubled quotes", () => {
  assert.equal(escapeCsvField("ok"), "ok");
  assert.equal(escapeCsvField("a,b"), '"a,b"');
  assert.equal(escapeCsvField('say "hi"'), '"say ""hi"""');
});

test("tableToCsv writes a BOM and one row of values", () => {
  const csv = tableToCsv(columns, [
    { title: "Cut trailer", status: "todo", dueDate: Date.UTC(2026, 7, 21, 12) },
  ]);
  assert.match(csv, /^\uFEFF/);
  assert.match(csv, /TASK,STATUS,DUE/);
  assert.match(csv, /Cut trailer,todo,/);
});

test("cellText resolves company and assignee names from context", () => {
  const ctx = {
    companyName: (id) => (id === "c1" ? "A24" : ""),
    memberName: (id) => ({ u1: "Sam", u2: "Lee" }[id] || ""),
    projectName: (id) => (id === "p1" ? "Feature" : ""),
  };
  assert.equal(cellText({ key: "company", label: "COMPANY" }, { companyId: "c1" }, ctx), "A24");
  assert.equal(cellText({ key: "assignees", label: "ASSIGNED TO" }, { assigneeIds: ["u1", "u2"] }, ctx), "Sam, Lee");
  assert.equal(cellText({ key: "project", label: "PROJECT" }, { projectId: "p1" }, ctx), "Feature");
});

test("cellText exports company and project contact fields", () => {
  const row = { contactName: "David Sterling", contactEmail: "d.sterling@a24films.com", contactPhone: "+1 (212) 555-0130" };
  assert.equal(cellText({ key: "contactName", label: "CONTACT" }, row), "David Sterling");
  assert.equal(cellText({ key: "contactEmail", label: "EMAIL" }, row), "d.sterling@a24films.com");
  assert.equal(cellText({ key: "contactPhone", label: "PHONE" }, row), "+1 (212) 555-0130");
});

test("cellText prefers column.exportValue", () => {
  assert.equal(cellText({ key: "title", label: "TASK", exportValue: () => "override" }, { title: "raw" }), "override");
});

test("tableToPdf is a PDF with the table title", () => {
  const pdf = tableToPdf("Projects", [{ key: "title", label: "PROJECT" }], [{ title: "Night Shoot" }]);
  assert.match(pdf, /^%PDF-1.4/);
  assert.match(pdf, /%%EOF/);
  assert.match(pdf, /Night Shoot/);
  assert.match(pdf, /Projects/);
});

test("exportFilename slugs the title", () => {
  const name = exportFilename("NDAs & Contracts", "csv");
  assert.match(name, /^dailie-ndas-contracts-\d{4}-\d{2}-\d{2}\.csv$/);
});

test("canExportBoard allows house domains only", () => {
  assert.equal(canExportBoard("elena@matriarch-studios.com"), true);
  assert.equal(canExportBoard("ops@thewizardofops.app"), true);
  assert.equal(canExportBoard("help@mail.matriarch-studios.com"), true);
  assert.equal(canExportBoard("guest@gmail.com"), false);
  assert.equal(canExportBoard("d.sterling@a24films.com"), false);
  assert.equal(canExportBoard(""), false);
});

test("exportEmailFromSession prefers the signed-in account when auth is on", () => {
  assert.equal(exportEmailFromSession({
    authEnabled: true,
    account: { email: "guest@gmail.com" },
    currentUser: { email: "elena@matriarch-studios.com" },
  }), "guest@gmail.com");
  assert.equal(exportEmailFromSession({
    authEnabled: true,
    account: null,
    currentUser: { email: "elena@matriarch-studios.com" },
  }), "");
  assert.equal(exportEmailFromSession({
    authEnabled: false,
    account: null,
    currentUser: { email: "elena@matriarch-studios.com" },
  }), "elena@matriarch-studios.com");
});
