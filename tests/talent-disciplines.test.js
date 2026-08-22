import { test } from "node:test";
import assert from "node:assert/strict";
import {
  talentDisciplines, withTalentDisciplines, rosterDisciplines, normalizeData, DISCIPLINES,
} from "../src/lib/model.js";

test("talentDisciplines lifts a single stored string", () => {
  assert.deepEqual(talentDisciplines({ discipline: "Editor" }), ["Editor"]);
  assert.deepEqual(talentDisciplines({ discipline: "Director, Writer" }), ["Director", "Writer"]);
});

test("talentDisciplines prefers the array and drops blanks", () => {
  assert.deepEqual(
    talentDisciplines({ discipline: "Editor", disciplines: ["Director of Photography", "Editor", ""] }),
    ["Director of Photography", "Editor"]
  );
});

test("withTalentDisciplines keeps the joined field in sync", () => {
  assert.deepEqual(withTalentDisciplines(["Writer", " writer ", "Composer"]), {
    disciplines: ["Writer", "Composer"],
    discipline: "Writer, Composer",
  });
});

test("normalize fills disciplines from older roster records", () => {
  const data = normalizeData({
    talent: [{ id: "tal-1", name: "Ines", discipline: "Director of Photography" }],
  });
  const person = data.talent[0];
  assert.deepEqual(person.disciplines, ["Director of Photography"]);
  assert.equal(person.discipline, "Director of Photography");
});

test("rosterDisciplines keeps presets and appends custom labels", () => {
  const list = rosterDisciplines([
    { disciplines: ["Director", "Steadicam"] },
    { discipline: "Colourist" },
  ]);
  assert.ok(list.includes("Director"));
  assert.ok(list.includes("Steadicam"));
  assert.equal(list.filter((d) => d === "Director").length, 1);
  assert.ok(DISCIPLINES.every((d) => list.includes(d)));
});
