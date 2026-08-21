/* =====================================================================
   TIMETABLE — founder and admin only
   ---------------------------------------------------------------------
   The weekly classes at each dojo, plus the two things that change
   week to week:

     an extra session   a class put on outside the usual timetable
     a holiday          a class that is not happening

   Both are limited to you and your admins by the database, not by
   hiding the tab. An instructor calling the database directly still
   cannot add either.
   ===================================================================== */

import * as db from "../db.js";
import { reference, forget } from "../reference.js";
import { el, card, table, input, button, section, toast, errorBox, empty, today, shortDate } from "../ui.js";

const DAY_ORDER = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function timetableScreen({ me, refresh }) {
  return el("div", {}, section(load, (d) => render(d, me, refresh), { label: "Fetching the timetable…" }));
}

async function load() {
  const [ref, extras, holidays, instructors] = await Promise.all([
    reference({ reload: true }),
    db.select("one_off_sessions", { order: "on_date.desc", limit: 100 }),
    db.select("session_holidays", { order: "on_date.desc", limit: 100 }),
    db.select("profiles", { columns: "id, full_name, role" }),
  ]);
  return { ref, extras, holidays, instructors };
}

function render({ ref, extras, holidays, instructors }, me, refresh) {
  return el(
    "div",
    {},
    addExtraSession(ref, instructors, me, refresh),
    declareHoliday(ref, me, refresh),
    upcoming(extras, holidays, ref, refresh),
    weeklyTimetable(ref, instructors)
  );
}

/* ------------------------------------------------------------------ */
/* An extra class, on a date                                           */
/* ------------------------------------------------------------------ */

function addExtraSession(ref, instructors, me, refresh) {
  const dojo = el("select", { class: "input" },
    ...ref.dojos.map((d) => el("option", { value: d.id }, d.name)));
  const when = input({ type: "date", value: today() });
  const from = input({ type: "text", value: "6:30 PM", placeholder: "6:30 PM" });
  const until = input({ type: "text", value: "7:30 PM", placeholder: "7:30 PM" });
  const who = el("select", { class: "input" },
    el("option", { value: "" }, "Not decided yet"),
    ...instructors
      .filter((p) => p.role === "instructor" || p.role === "founder")
      .map((p) => el("option", { value: p.id }, p.full_name)));
  const why = input({ placeholder: "e.g. Extra practice before the tournament" });
  const problem = el("div", {});

  const go = button("Add this extra class", async () => {
    problem.replaceChildren();
    if (!from.value.trim() || !until.value.trim()) {
      problem.append(errorBox(new Error("Give a start and an end time.")));
      return;
    }
    go.disabled = true;
    go.textContent = "Adding…";
    try {
      await db.insert("one_off_sessions", {
        dojo_id: dojo.value,
        on_date: when.value,
        start_time: from.value.trim(),
        end_time: until.value.trim(),
        instructor_id: who.value || null,
        reason: why.value.trim() || null,
      });
      toast("Extra class added. It appears on the Attendance screen for that date.");
      why.value = "";
      refresh();
    } catch (err) {
      problem.append(errorBox(err));
    }
    go.disabled = false;
    go.textContent = "Add this extra class";
  }, "wide");

  return card(
    "Put on an extra class",
    "A one-off, outside the weekly timetable. It shows up in the class list on the Attendance screen for that date, at any of your dojos.",
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Dojo"), dojo),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Date"), when),
    el("div", { style: "display:flex;gap:10px" },
      el("label", { class: "field", style: "flex:1" }, el("span", { class: "field-label" }, "From"), from),
      el("label", { class: "field", style: "flex:1" }, el("span", { class: "field-label" }, "Until"), until)),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Instructor"), who),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Reason (optional)"), why),
    problem,
    go
  );
}

/* ------------------------------------------------------------------ */
/* A holiday — a class that is not happening                           */
/* ------------------------------------------------------------------ */

function declareHoliday(ref, me, refresh) {
  const dojo = el("select", { class: "input" },
    ...ref.dojos.map((d) => el("option", { value: d.id }, d.name)));
  const when = input({ type: "date", value: today() });
  const which = el("select", { class: "input" });
  const why = input({ placeholder: "e.g. Republic Day" });
  const problem = el("div", {});

  function refreshClasses() {
    const weekday = WEEKDAYS[new Date(when.value + "T00:00:00").getDay()];
    const classes = ref.sessions
      .filter((s) => s.dojo_id === dojo.value && s.active !== false && s.weekday === weekday)
      .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));

    which.replaceChildren(
      el("option", { value: "" }, "The whole day — every class at this dojo"),
      ...classes.map((s) => el("option", { value: s.id }, `${s.label || "Class"} · ${s.start_time}–${s.end_time}`))
    );
  }

  dojo.addEventListener("change", refreshClasses);
  when.addEventListener("change", refreshClasses);
  refreshClasses();

  const go = button("Declare this a holiday", async () => {
    problem.replaceChildren();
    go.disabled = true;
    go.textContent = "Saving…";
    try {
      await db.insert("session_holidays", {
        dojo_id: dojo.value,
        on_date: when.value,
        session_id: which.value || null,
        reason: why.value.trim() || null,
        created_by: me.id,
      });
      toast("Holiday saved. That class cannot be marked.");
      why.value = "";
      refresh();
    } catch (err) {
      problem.append(
        errorBox(
          String(err.message || "").includes("duplicate")
            ? new Error("That class is already marked as a holiday.")
            : err
        )
      );
    }
    go.disabled = false;
    go.textContent = "Declare this a holiday";
  }, "wide");

  return card(
    "Cancel a class — holiday",
    "The class disappears from the register for that date and nobody is marked absent. Leave the class as the whole day to close a dojo entirely.",
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Dojo"), dojo),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Date"), when),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Which class"), which),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Reason (optional)"), why),
    problem,
    go
  );
}

/* ------------------------------------------------------------------ */
/* What has been added, and undoing it                                 */
/* ------------------------------------------------------------------ */

function upcoming(extras, holidays, ref, refresh) {
  const remove = (tableName, id, label) =>
    button("Remove", async () => {
      if (!confirm(`Remove ${label}?`)) return;
      try {
        await db.remove(tableName, { id });
        toast("Removed.");
        refresh();
      } catch (err) {
        alert(err.message || String(err));
      }
    }, "small quiet");

  const extraRows = extras.map((o) => ({
    on_date: o.on_date,
    dojo: ref.dojoById[o.dojo_id]?.name || "—",
    detail: `${o.start_time}–${o.end_time}${o.reason ? " · " + o.reason : ""}`,
    action: remove("one_off_sessions", o.id, `the extra class on ${shortDate(o.on_date)}`),
  }));

  const holidayRows = holidays.map((h) => ({
    on_date: h.on_date,
    dojo: ref.dojoById[h.dojo_id]?.name || "—",
    detail:
      (h.session_id
        ? ref.sessions.find((s) => s.id === h.session_id)
          ? `${ref.sessions.find((s) => s.id === h.session_id).label || "Class"} only`
          : "one class"
        : "whole day") + (h.reason ? " · " + h.reason : ""),
    action: remove("session_holidays", h.id, `the holiday on ${shortDate(h.on_date)}`),
  }));

  const columns = [
    { key: "on_date", label: "Date", format: shortDate },
    { key: "dojo", label: "Dojo" },
    { key: "detail", label: "Details" },
    { key: "action", label: "" },
  ];

  return el(
    "div",
    {},
    card("Extra classes", null,
         table(columns, extraRows, { emptyMessage: "No extra classes have been added." })),
    card("Holidays", null,
         table(columns, holidayRows, { emptyMessage: "No holidays have been declared." }))
  );
}

/* ------------------------------------------------------------------ */
/* The weekly timetable, for reference                                 */
/* ------------------------------------------------------------------ */

function weeklyTimetable(ref, instructors) {
  const byId = Object.fromEntries(instructors.map((p) => [p.id, p.full_name]));

  const rows = [...ref.sessions]
    .filter((s) => s.active !== false)
    .sort(
      (a, b) =>
        (ref.dojoById[a.dojo_id]?.name || "").localeCompare(ref.dojoById[b.dojo_id]?.name || "") ||
        (DAY_ORDER[a.weekday] || 9) - (DAY_ORDER[b.weekday] || 9) ||
        String(a.start_time).localeCompare(String(b.start_time))
    )
    .map((s) => ({
      dojo: ref.dojoById[s.dojo_id]?.name || "—",
      weekday: s.weekday,
      time: `${s.start_time}–${s.end_time}`,
      klass: s.label || "Class",
      instructor: byId[s.instructor_id] || "not set",
    }));

  return card(
    "The weekly timetable",
    "The regular classes. Changing these still needs me — extra classes and holidays you can do yourself, above.",
    table(
      [
        { key: "dojo", label: "Dojo" },
        { key: "weekday", label: "Day" },
        { key: "time", label: "Time" },
        { key: "klass", label: "Class" },
        { key: "instructor", label: "Instructor" },
      ],
      rows,
      { emptyMessage: "No weekly classes are set up." }
    )
  );
}
