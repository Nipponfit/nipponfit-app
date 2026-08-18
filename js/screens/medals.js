/* =====================================================================
   ACHIEVEMENTS — tournament results
   ===================================================================== */

import * as db from "../db.js";
import { el, card, table, input, button, shortDate, section, toast, errorBox, today } from "../ui.js";

const LEVELS = ["Club", "District", "State", "National", "International"];
const EVENTS = ["Kata", "Kumite", "Team Kata", "Team Kumite"];
const MEDALS = ["Gold", "Silver", "Bronze", "Participation"];

export async function medalsScreen({ refresh }) {
  return el("div", {}, section(load, (d) => render(d, refresh), { label: "Fetching achievements…" }));
}

async function load() {
  const [medals, students] = await Promise.all([
    db.select("achievements", { order: "on_date.desc", limit: 200 }),
    db.select("students", { order: "full_name" }),
  ]);
  return { medals, students };
}

function render({ medals, students }, refresh) {
  const byName = Object.fromEntries(students.map((s) => [s.id, s.full_name]));

  const counts = MEDALS.map((m) => [m, medals.filter((x) => x.medal === m).length]);

  return el(
    "div",
    {},
    card(
      "Achievements",
      counts.filter(([, n]) => n).map(([m, n]) => `${n} ${m}`).join(" · ") || null,
      table(
        [
          { key: "on_date", label: "Date", format: shortDate },
          { key: "student_id", label: "Student", format: (id) => byName[id] || "—" },
          { key: "tournament", label: "Tournament" },
          { key: "level", label: "Level" },
          { key: "event", label: "Event" },
          { key: "medal", label: "Medal" },
        ],
        medals,
        { emptyMessage: "No results recorded yet." }
      )
    ),
    addForm(students, refresh)
  );
}

function addForm(students, refresh) {
  const student = el("select", { class: "input" }, ...students.map((s) => el("option", { value: s.id }, s.full_name)));
  const tournament = input({ placeholder: "e.g. State Championship 2026" });
  const when = input({ type: "date", value: today() });
  const level = el("select", { class: "input" }, ...LEVELS.map((l) => el("option", { value: l }, l)));
  const event = el("select", { class: "input" }, ...EVENTS.map((e) => el("option", { value: e }, e)));
  const medal = el("select", { class: "input" }, ...MEDALS.map((m) => el("option", { value: m }, m)));
  const problem = el("div", {});

  const save = button(
    "Record it",
    async () => {
      problem.replaceChildren();
      if (!tournament.value.trim()) {
        problem.append(errorBox(new Error("Give the tournament a name.")));
        return;
      }
      save.disabled = true;
      try {
        await db.insert("achievements", {
          student_id: student.value,
          tournament: tournament.value.trim(),
          on_date: when.value,
          level: level.value,
          event: event.value,
          medal: medal.value,
        });
        toast("Recorded.");
        tournament.value = "";
        refresh();
      } catch (err) {
        problem.append(errorBox(err));
      }
      save.disabled = false;
    },
    "wide"
  );

  return card(
    "Record a result",
    null,
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Student"), student),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Tournament"), tournament),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Date"), when),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Level"), level),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Event"), event),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Medal"), medal),
    problem,
    save
  );
}
