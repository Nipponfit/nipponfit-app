/* =====================================================================
   MARK ATTENDANCE
   ---------------------------------------------------------------------
   One tick per child: ticked is here, unticked is not. Everyone in the
   class is saved either way, so the attendance percentage is a true
   figure rather than a count of whoever happened to be tapped.

   Instructors read students from the `roster` view, which holds only
   id, name, belt and dojo. Phone numbers and fees are not in it, so
   nothing private can appear here however this screen is written.

   Marking attendance is also the record that the instructor took the
   class: a trigger in the database writes their pay line from it.
   ===================================================================== */

import * as db from "../db.js";
import { reference } from "../reference.js";
import { el, card, button, fill, section, toast, errorBox, empty, today, shortDate } from "../ui.js";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function attendanceScreen({ me }) {
  return el("div", {}, section(load, (data) => render(data, me), { label: "Fetching the roster…" }));
}

async function load() {
  const [ref, roster, holidays, extras, addons] = await Promise.all([
    reference(),
    db.select("roster", { order: "full_name" }),
    db.select("session_holidays").catch(() => []),
    db.select("one_off_sessions").catch(() => []),
    db.select("student_addons").catch(() => []),
  ]);
  return { ref, roster: roster.filter((s) => s.active !== false), holidays, extras, addons };
}

function render({ ref, roster, holidays, extras, addons }, me) {
  if (ref.dojos.length === 0) return card("Mark attendance", null, empty("No dojos are set up yet."));

  const mySessions = ref.sessions.filter((s) => s.instructor_id === me.id);
  const startDojo = mySessions[0]?.dojo_id || ref.dojos[0].id;

  const dojoPicker = el("select", { class: "input" },
    ...ref.dojos.map((d) => el("option", { value: d.id, selected: d.id === startDojo }, d.name)));
  const datePicker = el("input", { class: "input", type: "date", value: today() });
  const classPicker = el("select", { class: "input" });

  const notice = el("div", {});
  const list = el("div", {});
  const problem = el("div", {});
  const summary = el("p", { class: "muted" });

  /* studentId -> checkbox */
  const ticks = new Map();

  function chosenClass() {
    const value = classPicker.value;
    if (!value) return { sessionId: null, oneOffId: null };
    return value.startsWith("extra:")
      ? { sessionId: null, oneOffId: value.slice(6) }
      : { sessionId: value, oneOffId: null };
  }

  function refreshClasses() {
    const dojoId = dojoPicker.value;
    const date = datePicker.value;
    const weekday = WEEKDAYS[new Date(date + "T00:00:00").getDay()];

    const weekly = ref.sessions
      .filter((s) => s.dojo_id === dojoId && s.active !== false && s.weekday === weekday)
      /* A class that had not started yet was never taught, so it does
         not belong in the register for that day. */
      .filter((s) => !s.starts_on || String(s.starts_on).slice(0, 10) <= date)
      .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)))
      .map((s) => el("option", { value: s.id }, `${s.label || "Class"} · ${s.start_time}–${s.end_time}`));

    const extraToday = extras
      .filter((o) => o.dojo_id === dojoId && String(o.on_date).slice(0, 10) === date)
      .map((o) => el("option", { value: "extra:" + o.id },
                     `Extra class · ${o.start_time}–${o.end_time}${o.reason ? " · " + o.reason : ""}`));

    const options = [...weekly, ...extraToday];
    classPicker.replaceChildren(
      ...(options.length ? options : [el("option", { value: "" }, `No class timetabled on a ${weekday}`)])
    );
    refreshList();
  }

  /* Is this class off? Either the whole dojo that day, or this class. */
  function holidayFor() {
    const dojoId = dojoPicker.value;
    const date = datePicker.value;
    const { sessionId } = chosenClass();
    return holidays.find(
      (h) =>
        h.dojo_id === dojoId &&
        String(h.on_date).slice(0, 10) === date &&
        (h.session_id === null || h.session_id === sessionId)
    );
  }

  function updateSummary() {
    const total = ticks.size;
    const here = [...ticks.values()].filter((c) => c.checked).length;
    summary.textContent = total ? `${here} of ${total} here` : "";
  }

  async function refreshList() {
    const dojoId = dojoPicker.value;
    const date = datePicker.value;
    const { sessionId, oneOffId } = chosenClass();

    notice.replaceChildren();
    const off = holidayFor();
    if (off) {
      notice.append(
        el("div", { class: "notice-banner" },
           el("strong", {}, "This class is cancelled"),
           el("p", { style: "margin:4px 0 0" },
              (off.reason || "Holiday") + " — there is nothing to mark."))
      );
      list.replaceChildren();
      summary.textContent = "";
      save.disabled = true;
      return;
    }
    save.disabled = false;

    /* Who belongs on THIS register, on THIS date.

       Everyone at the dojo, except:

         joined       a child who joined in June is not on a January
                      register at all
         on a break   only for the dates they were actually away, so
                      the months before a break stay markable
         Elite Squad  a class tied to a plan is only for the children
                      who bought that plan

       Nobody is filtered by how many sessions a week they take. Their
       percentage is judged against what their plan buys them, not
       against every class the dojo runs — so a child on 2 a week who
       comes twice is 100%, and appearing on a register they skipped
       costs them nothing. */
    const chosen = ref.sessions.find((s) => s.id === sessionId);
    const onlyForPlan = chosen?.plan_id || null;
    const boughtIt = new Set(
      addons.filter((a) => a.plan_id === onlyForPlan).map((a) => a.student_id)
    );

    const away = (s) =>
      s.break_from &&
      String(s.break_from).slice(0, 10) <= date &&
      (!s.break_to || String(s.break_to).slice(0, 10) >= date);

    const students = roster.filter(
      (s) =>
        s.dojo_id === dojoId &&
        !away(s) &&
        (!s.joined_on || String(s.joined_on).slice(0, 10) <= date) &&
        (!onlyForPlan || boughtIt.has(s.id))
    );

    const notYet = roster.filter(
      (s) => s.dojo_id === dojoId && s.joined_on && String(s.joined_on).slice(0, 10) > date
    ).length;

    const eliteNote = onlyForPlan
      ? `Only the ${students.length} ${students.length === 1 ? "child" : "children"} who take this class.`
      : null;

    if (students.length === 0) {
      list.replaceChildren(
        empty(
          notYet
            ? `Nobody had joined this dojo by ${shortDate(date)}. ${notYet} joined later.`
            : "No students at this dojo yet."
        )
      );
      summary.textContent = "";
      return;
    }

    list.replaceChildren(el("p", { class: "muted" }, "Loading…"));
    ticks.clear();

    let existing = [];
    try {
      existing = await db.select("attendance", { eq: { on_date: date, dojo_id: dojoId } });
    } catch (err) {
      list.replaceChildren(errorBox(err));
      return;
    }

    const already = new Map(
      existing
        .filter((a) => (a.session_id || null) === sessionId && (a.one_off_id || null) === oneOffId)
        .map((a) => [a.student_id, a])
    );

    const rows = students.map((student) => {
      const previous = already.get(student.id);
      const box = el("input", {
        type: "checkbox",
        class: "tick",
        checked: previous ? previous.present === true : false,
      });
      box.addEventListener("change", updateSummary);
      ticks.set(student.id, box);

      const belt = ref.beltById[student.belt_id];

      return el(
        "label",
        { class: "tick-row" },
        box,
        el(
          "span",
          { class: "tick-body" },
          el("span", { class: "tick-name" }, student.full_name),
          el("span", { class: "muted" }, [student.id_card, belt?.name].filter(Boolean).join(" · "))
        )
      );
    });

    fill(
      list,
      ...rows,
      notYet
        ? el("p", { class: "muted", style: "margin-top:10px" },
             `${notYet} more ${notYet === 1 ? "child has" : "children have"} joined this dojo since ` +
             `${shortDate(date)}. They appear on registers from their own joining date.`)
        : null,
      eliteNote ? el("p", { class: "muted", style: "margin-top:6px" }, eliteNote) : null
    );
    updateSummary();
  }

  const tickAll = button("Tick everyone", () => {
    for (const box of ticks.values()) box.checked = true;
    updateSummary();
  }, "small quiet");

  const clearAll = button("Clear all", () => {
    for (const box of ticks.values()) box.checked = false;
    updateSummary();
  }, "small quiet");

  const save = button("Save attendance", doSave, "wide");

  async function doSave() {
    problem.replaceChildren();
    if (ticks.size === 0) {
      problem.append(errorBox(new Error("There is nobody to mark.")));
      return;
    }

    save.disabled = true;
    save.textContent = "Saving…";

    const dojoId = dojoPicker.value;
    const date = datePicker.value;
    const { sessionId, oneOffId } = chosenClass();

    try {
      const existing = await db.select("attendance", { eq: { on_date: date, dojo_id: dojoId } });
      const already = new Map(
        existing
          .filter((a) => (a.session_id || null) === sessionId && (a.one_off_id || null) === oneOffId)
          .map((a) => [a.student_id, a])
      );

      const toInsert = [];
      for (const [studentId, box] of ticks) {
        const present = box.checked;
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
            one_off_id: oneOffId,
            on_date: date,
            present,
            // This is what records who taught the class, and is what the
            // instructor's pay line is written from.
            marked_by: me.id,
          });
        }
      }

      if (toInsert.length) await db.insert("attendance", toInsert);

      const here = [...ticks.values()].filter((c) => c.checked).length;
      toast(`Saved — ${here} of ${ticks.size} here on ${shortDate(date)}.`);
      refreshList();
    } catch (err) {
      problem.append(errorBox(err));
    }

    save.disabled = false;
    save.textContent = "Save attendance";
  }

  dojoPicker.addEventListener("change", refreshClasses);
  datePicker.addEventListener("change", refreshClasses);
  classPicker.addEventListener("change", refreshList);
  refreshClasses();

  return el(
    "div",
    {},
    card(
      "Mark attendance",
      "Tick the children who are here. Marking a class also records that you taught it.",
      el("label", { class: "field" }, el("span", { class: "field-label" }, "Dojo"), dojoPicker),
      el("label", { class: "field" }, el("span", { class: "field-label" }, "Date"), datePicker),
      el("label", { class: "field" }, el("span", { class: "field-label" }, "Class"), classPicker)
    ),
    notice,
    card(
      "Who is here",
      null,
      el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:6px" }, tickAll, clearAll),
      summary,
      list,
      problem,
      save
    )
  );
}
