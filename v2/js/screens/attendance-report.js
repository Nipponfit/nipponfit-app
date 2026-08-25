/* =====================================================================
   ATTENDANCE REPORT — founder and admin only
   ---------------------------------------------------------------------
   Every student, month by month, across every dojo.

   75% is the threshold for being put forward for grading, so anyone
   below it is marked. That turns this from a record into the list you
   actually work from when deciding who grades next.
   ===================================================================== */

import * as db from "../db.js";
import { reference, sessionsEntitled, attendancePercent } from "../reference.js";
import { el, card, table, stat, section, empty } from "../ui.js";

const GRADING_THRESHOLD = 75;

const monthKey = (d) => String(d).slice(0, 7);
const monthName = (key) =>
  new Date(key + "-01T00:00:00").toLocaleDateString("en-IN", { month: "long", year: "numeric" });

export async function attendanceReportScreen() {
  return el("div", {}, section(load, render, { label: "Adding up attendance…" }));
}

async function load() {
  const [attendance, students, ref, addons] = await Promise.all([
    db.selectAll("attendance"),
    db.select("students", { order: "full_name" }),
    reference(),
    db.select("student_addons").catch(() => []),
  ]);
  return { attendance, students, ref, addons };
}

function render({ attendance, students, ref, addons }) {
  if (attendance.length === 0) {
    return card(
      "Attendance report",
      null,
      empty("Nothing has been marked yet. This fills in as instructors mark their classes.")
    );
  }

  const months = [...new Set(attendance.map((a) => monthKey(a.on_date)))].sort().reverse();
  const studentById = Object.fromEntries(students.map((s) => [s.id, s]));

  /* --- Picker: which month to look at --------------------------------- */
  const monthPicker = el(
    "select",
    { class: "input" },
    ...months.map((m) => el("option", { value: m }, monthName(m)))
  );
  const dojoPicker = el(
    "select",
    { class: "input" },
    el("option", { value: "" }, "All dojos"),
    ...ref.dojos.map((d) => el("option", { value: d.id }, d.name))
  );

  const detail = el("div", {});

  function drawDetail() {
    const month = monthPicker.value;
    const dojoId = dojoPicker.value;

    const inMonth = attendance.filter(
      (a) => monthKey(a.on_date) === month && (!dojoId || a.dojo_id === dojoId)
    );

    /* One row per student who had any class that month */
    const perStudent = new Map();
    for (const a of inMonth) {
      if (!perStudent.has(a.student_id)) perStudent.set(a.student_id, { held: 0, present: 0 });
      const row = perStudent.get(a.student_id);
      row.held += 1;
      if (a.present) row.present += 1;
    }

    const rows = [...perStudent.entries()]
      .map(([id, r]) => {
        const student = studentById[id];

        /* Judged against what their plan buys that month, not against
           every class the dojo held. A child on 2 sessions a week who
           came twice a week is 100%. */
        const mineAddons = addons.filter((a) => a.student_id === id).map((a) => a.plan_id);
        const first = month + "-01";
        const start = new Date(first);
        const last = new Date(start.getFullYear(), start.getMonth() + 1, 0)
          .toISOString().slice(0, 10);
        const entitled = student ? sessionsEntitled(student, ref, mineAddons, first, last) : 0;

        return {
          student: student?.full_name || "(not on the roll)",
          dojo: ref.dojoById[student?.dojo_id]?.name || "—",
          belt: ref.beltById[student?.belt_id]?.name || "—",
          held: entitled,
          present: r.present,
          missed: Math.max(0, entitled - r.present),
          rate: attendancePercent(r.present, entitled) ?? 0,
        };
      })
      .sort((a, b) => a.rate - b.rate || a.student.localeCompare(b.student));

    const below = rows.filter((r) => r.rate < GRADING_THRESHOLD);

    detail.replaceChildren(
      el(
        "p",
        { class: "muted" },
        `${rows.length} students · ${below.length} below ${GRADING_THRESHOLD}%` +
          (dojoId ? "" : " · all dojos")
      ),
      table(
        [
          { key: "student", label: "Student" },
          { key: "dojo", label: "Dojo" },
          { key: "belt", label: "Belt" },
          { key: "held", label: "Their plan", align: "num" },
          { key: "present", label: "Present", align: "num" },
          { key: "missed", label: "Missed", align: "num" },
          {
            key: "rate",
            label: "Attendance",
            align: "num",
            format: (rate) =>
              el(
                "span",
                { class: `pill ${rate >= GRADING_THRESHOLD ? "paid" : rate >= 50 ? "due" : "overdue"}` },
                rate + "%"
              ),
          },
        ],
        rows,
        { emptyMessage: "Nothing marked for that month and dojo." }
      )
    );
  }

  monthPicker.addEventListener("change", drawDetail);
  dojoPicker.addEventListener("change", drawDetail);
  drawDetail();

  return el(
    "div",
    {},
    overallCard(attendance, months),
    monthByDojoCard(attendance, months, ref, students, addons),
    card(
      "Student by student",
      `Sorted worst first. Anyone under ${GRADING_THRESHOLD}% cannot be put forward for grading yet.`,
      el("label", { class: "field" }, el("span", { class: "field-label" }, "Month"), monthPicker),
      el("label", { class: "field" }, el("span", { class: "field-label" }, "Dojo"), dojoPicker),
      detail
    )
  );
}

/* Headline numbers across everything recorded */
function overallCard(attendance, months) {
  const present = attendance.filter((a) => a.present).length;
  const rate = Math.round((present / attendance.length) * 100);
  const classDays = new Set(attendance.map((a) => `${a.on_date}|${a.dojo_id}|${a.session_id || ""}`)).size;

  return card(
    "Attendance overall",
    `${months.length} month${months.length === 1 ? "" : "s"} recorded`,
    el(
      "div",
      { class: "stats" },
      stat("Classes held", classDays),
      stat("Attendance", rate + "%", `${present} present of ${attendance.length} marks`),
      stat("Absences", attendance.length - present)
    )
  );
}

/* A row per month per dojo — the month-by-month view across all dojos */
/* The same fairness as the per-student table: a month is measured
   against what the children's plans buy that month, not against every
   mark recorded. Dividing by marks made a dojo look poor simply
   because absences were written down honestly. */
function monthByDojoCard(attendance, months, ref, students, addons) {
  const studentById = Object.fromEntries(students.map((s) => [s.id, s]));

  const entitledFor = (ids, month) => {
    const first = month + "-01";
    const start = new Date(first);
    const last = new Date(start.getFullYear(), start.getMonth() + 1, 0)
      .toISOString().slice(0, 10);
    let total = 0;
    for (const id of ids) {
      const s = studentById[id];
      if (!s) continue;
      const mineAddons = addons.filter((a) => a.student_id === id).map((a) => a.plan_id);
      total += sessionsEntitled(s, ref, mineAddons, first, last);
    }
    return total;
  };
  const rows = [];

  for (const month of months) {
    const inMonth = attendance.filter((a) => monthKey(a.on_date) === month);

    for (const dojo of ref.dojos) {
      const mine = inMonth.filter((a) => a.dojo_id === dojo.id);
      if (mine.length === 0) continue;

      const present = mine.filter((a) => a.present).length;
      const who = new Set(mine.map((a) => a.student_id));
      const entitled = entitledFor(who, month);
      rows.push({
        month: monthName(month),
        dojo: dojo.name,
        students: who.size,
        classes: entitled,
        present,
        rate: attendancePercent(present, entitled) ?? 0,
      });
    }

    /* A total line for the month, across every dojo */
    const present = inMonth.filter((a) => a.present).length;
    const whoAll = new Set(inMonth.map((a) => a.student_id));
    const entitledAll = entitledFor(whoAll, month);
    rows.push({
      month: monthName(month),
      dojo: "— all dojos —",
      students: whoAll.size,
      classes: entitledAll,
      present,
      rate: attendancePercent(present, entitledAll) ?? 0,
    });
  }

  return card(
    "Month by month, dojo by dojo",
    "Newest month first, each month ending with a line for all dojos together. " +
      "Measured against what the children's plans buy that month, not against every mark taken.",
    table(
      [
        { key: "month", label: "Month" },
        { key: "dojo", label: "Dojo" },
        { key: "students", label: "Students", align: "num" },
        { key: "classes", label: "Their plans", align: "num" },
        { key: "present", label: "Present", align: "num" },
        {
          key: "rate",
          label: "Attendance",
          align: "num",
          format: (rate) =>
            el("span", { class: `pill ${rate >= GRADING_THRESHOLD ? "paid" : rate >= 50 ? "due" : "overdue"}` }, rate + "%"),
        },
      ],
      rows
    )
  );
}
