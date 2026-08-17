/* =====================================================================
   MARK ATTENDANCE
   ---------------------------------------------------------------------
   Instructors read students from the `roster` view, which holds only id,
   name, belt and dojo. Phone numbers and fees are not in it, so nothing
   sensitive can appear here however this screen is written.

   Marking attendance is also the record that the instructor took the
   class: a trigger in the database writes their pay line from it. So
   this screen is what makes the pay screen real. There is no separate
   button to press.
   ===================================================================== */

import * as db from "../db.js";
import { reference } from "../reference.js";
import { el, card, button, section, toast, errorBox, empty, today, shortDate } from "../ui.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function attendanceScreen({ me }) {
  return el("div", {}, section(load, (data) => render(data, me), { label: "Fetching the roster…" }));
}

async function load() {
  const [ref, roster] = await Promise.all([
    reference(),
    db.select("roster", { order: "full_name" }),
  ]);
  return { ref, roster: roster.filter((s) => s.active !== false) };
}

function render({ ref, roster }, me) {
  if (ref.dojos.length === 0) return card("Mark attendance", null, empty("No dojos are set up yet."));

  /* An instructor usually teaches at one dojo — start them there. */
  const mySessions = ref.sessions.filter((s) => s.instructor_id === me.id);
  const startDojo = mySessions[0]?.dojo_id || ref.dojos[0].id;

  const dojoPicker = el("select", { class: "input" }, ...ref.dojos.map((d) => el("option", { value: d.id, selected: d.id === startDojo }, d.name)));
  const datePicker = el("input", { class: "input", type: "date", value: today() });
  const sessionPicker = el("select", { class: "input" });
  const list = el("div", {});
  const problem = el("div", {});

  const marks = new Map(); // student id -> true / false

  function refreshSessions() {
    const dojoId = dojoPicker.value;
    const weekday = WEEKDAYS[new Date(datePicker.value + "T00:00:00").getDay()];

    const options = ref.sessions
      .filter((s) => s.dojo_id === dojoId && s.active !== false && s.weekday === weekday)
      .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));

    sessionPicker.replaceChildren(
      ...(options.length
        ? options.map((s) => el("option", { value: s.id }, `${s.label || "Class"} · ${s.start_time}–${s.end_time}`))
        : [el("option", { value: "" }, `No class timetabled on a ${weekday}`)])
    );
    refreshList();
  }

  async function refreshList() {
    const dojoId = dojoPicker.value;
    const sessionId = sessionPicker.value || null;
    const date = datePicker.value;

    const students = roster.filter((s) => s.dojo_id === dojoId);
    if (students.length === 0) {
      list.replaceChildren(empty("No students at this dojo yet."));
      return;
    }

    list.replaceChildren(el("p", { class: "muted" }, "Loading who was here…"));
    marks.clear();

    let existing = [];
    try {
      existing = await db.select("attendance", { eq: { on_date: date, dojo_id: dojoId } });
    } catch (err) {
      list.replaceChildren(errorBox(err));
      return;
    }

    const already = new Map(
      existing
        .filter((a) => (a.session_id || null) === sessionId)
        .map((a) => [a.student_id, a])
    );

    const rows = students.map((student) => {
      const previous = already.get(student.id);
      if (previous) marks.set(student.id, previous.present);

      const belt = ref.beltById[student.belt_id];
      const yes = button("Present", () => set(true), previous?.present === true ? "small" : "small quiet");
      const no = button("Absent", () => set(false), previous?.present === false ? "small" : "small quiet");

      function set(present) {
        marks.set(student.id, present);
        yes.className = present ? "btn small" : "btn small quiet";
        no.className = present ? "btn small quiet" : "btn small";
      }

      return el(
        "div",
        { style: "display:flex;align-items:center;gap:10px;padding:9px 0;border-bottom:1px solid var(--line)" },
        el(
          "div",
          { style: "flex:1;min-width:0" },
          el("div", { style: "font-weight:600" }, student.full_name),
          el("div", { class: "muted" }, [student.id_card, belt?.name].filter(Boolean).join(" · "))
        ),
        yes,
        no
      );
    });

    list.replaceChildren(
      el("p", { class: "muted" }, `${students.length} students · ${already.size} already marked for this class`),
      ...rows
    );
  }

  const save = button("Save attendance", doSave, "wide");

  async function doSave() {
    problem.replaceChildren();

    if (marks.size === 0) {
      problem.append(errorBox(new Error("Mark at least one student present or absent first.")));
      return;
    }

    save.disabled = true;
    save.textContent = "Saving…";

    const dojoId = dojoPicker.value;
    const sessionId = sessionPicker.value || null;
    const date = datePicker.value;

    try {
      const existing = await db.select("attendance", { eq: { on_date: date, dojo_id: dojoId } });
      const already = new Map(
        existing.filter((a) => (a.session_id || null) === sessionId).map((a) => [a.student_id, a])
      );

      const toInsert = [];
      for (const [studentId, present] of marks) {
        const previous = already.get(studentId);
        if (previous) {
          if (previous.present !== present) {
            await db.update("attendance", { id: previous.id }, { present, marked_by: me.id });
          }
        } else {
          toInsert.push({
            student_id: studentId,
            dojo_id: dojoId,
            session_id: sessionId,
            on_date: date,
            present,
            // This is what tells the database who taught the class, and
            // is what the instructor's pay line is written from.
            marked_by: me.id,
          });
        }
      }

      if (toInsert.length) await db.insert("attendance", toInsert);

      toast(`Attendance saved for ${shortDate(date)}.`);
      refreshList();
    } catch (err) {
      problem.append(errorBox(err));
    }

    save.disabled = false;
    save.textContent = "Save attendance";
  }

  dojoPicker.addEventListener("change", refreshSessions);
  datePicker.addEventListener("change", refreshSessions);
  sessionPicker.addEventListener("change", refreshList);
  refreshSessions();

  return el(
    "div",
    {},
    card(
      "Mark attendance",
      "Marking a class also records that you taught it, which is what your pay is worked out from.",
      el("label", { class: "field" }, el("span", { class: "field-label" }, "Dojo"), dojoPicker),
      el("label", { class: "field" }, el("span", { class: "field-label" }, "Date"), datePicker),
      el("label", { class: "field" }, el("span", { class: "field-label" }, "Class"), sessionPicker)
    ),
    card("Who was here", null, list, problem, save)
  );
}
