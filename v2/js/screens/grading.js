/* =====================================================================
   GRADING — founder and admin
   ---------------------------------------------------------------------
   Everyone put forward, where they are in the process, and recording a
   result. Recording a pass promotes the belt and writes the history
   entry together, so the two can never disagree.
   ===================================================================== */

import * as db from "../db.js";
import { reference, beltFor } from "../reference.js";
import { el, card, table, input, button, money, shortDate, section, toast, errorBox, empty, today } from "../ui.js";

export async function gradingScreen({ refresh }) {
  return el("div", {}, section(load, (d) => render(d, refresh), { label: "Fetching gradings…" }));
}

async function load() {
  const [students, ref, history] = await Promise.all([
    db.select("students", { order: "full_name" }),
    reference(),
    db.select("grading_history", { order: "graded_on.desc", limit: 100 }),
  ]);
  return { students, ref, history };
}

function render({ students, ref, history }, refresh) {
  const forward = students.filter((s) => s.grading_eligible && s.active !== false);

  return el(
    "div",
    {},
    card(
      "Put forward for grading",
      forward.length
        ? "Record a result and the belt is promoted at the same moment."
        : "Nobody is currently put forward. Use the Students tab to put someone forward.",
      forward.length ? el("div", {}, ...forward.map((s) => candidate(s, ref, refresh))) : empty("Nothing waiting.")
    ),

    card(
      "Recent gradings",
      null,
      table(
        [
          { key: "graded_on", label: "Date", format: shortDate },
          { key: "student_id", label: "Student", format: (id) => students.find((s) => s.id === id)?.full_name || "—" },
          { key: "to_belt_id", label: "Promoted to", format: (id) => ref.beltById[id]?.name || id },
          { key: "result", label: "Result" },
          { key: "fee_paid", label: "Fee", align: "num", format: money },
        ],
        history,
        { emptyMessage: "No gradings recorded yet." }
      )
    )
  );
}

function candidate(student, ref, refresh) {
  const { belt, next } = beltFor(student, ref);
  if (!next) return el("p", { class: "muted" }, `${student.full_name} is at the top of the kyu ladder.`);

  const when = input({ type: "date", value: today() });
  const fee = input({ type: "number", inputmode: "numeric", value: next.grading_fee ?? "" });
  const problem = el("div", {});

  const pass = button(
    `Passed — promote to ${next.name}`,
    async () => {
      pass.disabled = true;
      pass.textContent = "Recording…";
      try {
        await db.insert("grading_history", {
          student_id: student.id,
          graded_on: when.value,
          to_belt_id: next.id,
          fee_paid: fee.value === "" ? null : Number(fee.value),
          result: "Passed",
        });
        await db.update(
          "students",
          { id: student.id },
          { belt_id: next.id, grading_eligible: false, grading_form_done: false, grading_fee_paid: false }
        );
        toast(`${student.full_name} promoted to ${next.name}.`);
        refresh();
      } catch (err) {
        problem.append(errorBox(err));
        pass.disabled = false;
        pass.textContent = `Passed — promote to ${next.name}`;
      }
    },
    "small"
  );

  const fail = button(
    "Not this time",
    async () => {
      try {
        await db.insert("grading_history", {
          student_id: student.id,
          graded_on: when.value,
          to_belt_id: belt?.id || next.id,
          result: "Not passed",
        });
        await db.update("students", { id: student.id }, { grading_eligible: false, grading_form_done: false });
        toast("Recorded. The belt is unchanged.");
        refresh();
      } catch (err) {
        problem.append(errorBox(err));
      }
    },
    "small quiet"
  );

  const state = [
    student.grading_form_done ? "form received" : "waiting for form",
    student.grading_fee_paid ? "fee paid" : "fee not paid",
  ].join(" · ");

  return el(
    "div",
    { style: "padding:12px 0;border-bottom:1px solid var(--line)" },
    el("div", { style: "font-weight:600" }, student.full_name),
    el("div", { class: "muted" }, `${belt?.name || "No belt"} → ${next.name} (${next.kyu}) · ${state}`),
    el(
      "div",
      { style: "display:flex;gap:8px;flex-wrap:wrap;align-items:end;margin-top:10px" },
      el("label", { class: "field", style: "margin:0" }, el("span", { class: "field-label" }, "Date"), when),
      el("label", { class: "field", style: "margin:0" }, el("span", { class: "field-label" }, "Fee paid"), fee),
      pass,
      fail
    ),
    problem
  );
}
