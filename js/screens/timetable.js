/* =====================================================================
   TIMETABLE — founder and admin only
   ---------------------------------------------------------------------
   Everything about when and where classes happen, and what they cost:

     an extra session   a class put on outside the usual timetable
     a holiday          a class that is not happening
     weekly classes     the regular timetable
     dojos              name, GST, and the default instructor rate
     fee plans          what each plan costs

   All of it is limited to you and your admins by the database, not by
   hiding the tab. An instructor calling the database directly still
   cannot change any of it.
   ===================================================================== */

import * as db from "../db.js";
import { reference, forget } from "../reference.js";
import { el, card, table, input, button, fill, money, section, toast, errorBox, empty, today, shortDate } from "../ui.js";

const DAY_ORDER = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export async function timetableScreen({ me, refresh }) {
  return el("div", {}, section(load, (d) => render(d, me, refresh), { label: "Fetching the timetable…" }));
}

async function load() {
  const [ref, extras, holidays, people] = await Promise.all([
    reference({ reload: true }),
    db.select("one_off_sessions", { order: "on_date.desc", limit: 100 }),
    db.select("session_holidays", { order: "on_date.desc", limit: 100 }),
    db.select("profiles", { columns: "id, full_name, role" }),
  ]);
  return { ref, extras, holidays, people };
}

/* Every change goes through here, so a failure always lands somewhere
   visible and the cached reference data is never left stale. */
function saver(refresh) {
  return async (work, message, problem) => {
    problem.replaceChildren();
    try {
      await work();
      forget();
      toast(message);
      refresh();
    } catch (err) {
      problem.append(errorBox(err));
    }
  };
}

function render({ ref, extras, holidays, people }, me, refresh) {
  const save = saver(refresh);
  const teachers = people.filter((p) => p.role === "instructor" || p.role === "founder");

  return el(
    "div",
    {},
    addExtraSession(ref, teachers, save),
    declareHoliday(ref, me, save),
    upcoming(extras, holidays, ref, save),
    weeklyClasses(ref, teachers, save),
    dojoSettings(ref, save),
    feePlans(ref, save)
  );
}

/* ------------------------------------------------------------------ */
/* An extra class, on a date                                           */
/* ------------------------------------------------------------------ */

function addExtraSession(ref, teachers, save) {
  const dojo = el("select", { class: "input" }, ...ref.dojos.map((d) => el("option", { value: d.id }, d.name)));
  const when = input({ type: "date", value: today() });
  const from = input({ type: "text", value: "6:30 PM" });
  const until = input({ type: "text", value: "7:30 PM" });
  const who = el("select", { class: "input" },
    el("option", { value: "" }, "Not decided yet"),
    ...teachers.map((p) => el("option", { value: p.id }, p.full_name)));
  const why = input({ placeholder: "e.g. Extra practice before the tournament" });
  const problem = el("div", {});

  const go = button("Add this extra class", () => {
    if (!from.value.trim() || !until.value.trim()) {
      problem.replaceChildren(errorBox(new Error("Give a start and an end time.")));
      return;
    }
    save(
      () => db.insert("one_off_sessions", {
        dojo_id: dojo.value,
        on_date: when.value,
        start_time: from.value.trim(),
        end_time: until.value.trim(),
        instructor_id: who.value || null,
        reason: why.value.trim() || null,
      }),
      "Extra class added. It appears on the Attendance screen for that date.",
      problem
    );
  }, "wide");

  return card(
    "Put on an extra class",
    "A one-off, outside the weekly timetable, at any of your dojos.",
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
/* A holiday                                                           */
/* ------------------------------------------------------------------ */

function declareHoliday(ref, me, save) {
  const dojo = el("select", { class: "input" }, ...ref.dojos.map((d) => el("option", { value: d.id }, d.name)));
  const when = input({ type: "date", value: today() });
  const which = el("select", { class: "input" });
  const why = input({ placeholder: "e.g. Republic Day" });
  const problem = el("div", {});

  function refreshClasses() {
    const weekday = WEEKDAYS[new Date(when.value + "T00:00:00").getDay()];
    const classes = ref.sessions
      .filter((s) => s.dojo_id === dojo.value && s.active !== false && s.weekday === weekday)
      .sort((a, b) => String(a.start_time).localeCompare(String(b.start_time)));
    fill(which,
      el("option", { value: "" }, "The whole day — every class at this dojo"),
      ...classes.map((s) => el("option", { value: s.id }, `${s.label || "Class"} · ${s.start_time}–${s.end_time}`)));
  }

  dojo.addEventListener("change", refreshClasses);
  when.addEventListener("change", refreshClasses);
  refreshClasses();

  const go = button("Declare this a holiday", () => {
    save(
      () => db.insert("session_holidays", {
        dojo_id: dojo.value,
        on_date: when.value,
        session_id: which.value || null,
        reason: why.value.trim() || null,
        created_by: me.id,
      }),
      "Holiday saved. That class cannot be marked.",
      problem
    );
  }, "wide");

  return card(
    "Cancel a class — holiday",
    "The class disappears from the register for that date and nobody is marked absent.",
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

function upcoming(extras, holidays, ref, save) {
  const problem = el("div", {});
  const remove = (tableName, id, label) =>
    button("Remove", () => {
      if (!confirm(`Remove ${label}?`)) return;
      save(() => db.remove(tableName, { id }), "Removed.", problem);
    }, "small quiet");

  const columns = [
    { key: "on_date", label: "Date", format: shortDate },
    { key: "dojo", label: "Dojo" },
    { key: "detail", label: "Details" },
    { key: "action", label: "" },
  ];

  const extraRows = extras.map((o) => ({
    on_date: o.on_date,
    dojo: ref.dojoById[o.dojo_id]?.name || "—",
    detail: `${o.start_time}–${o.end_time}${o.reason ? " · " + o.reason : ""}`,
    action: remove("one_off_sessions", o.id, `the extra class on ${shortDate(o.on_date)}`),
  }));

  const holidayRows = holidays.map((h) => {
    const s = ref.sessions.find((x) => x.id === h.session_id);
    return {
      on_date: h.on_date,
      dojo: ref.dojoById[h.dojo_id]?.name || "—",
      detail: (h.session_id ? (s ? `${s.label || "Class"} only` : "one class") : "whole day") +
              (h.reason ? " · " + h.reason : ""),
      action: remove("session_holidays", h.id, `the holiday on ${shortDate(h.on_date)}`),
    };
  });

  return el("div", {},
    card("Extra classes", null, table(columns, extraRows, { emptyMessage: "No extra classes have been added." })),
    card("Holidays", null, table(columns, holidayRows, { emptyMessage: "No holidays have been declared." }), problem));
}

/* ------------------------------------------------------------------ */
/* The weekly timetable — now editable                                 */
/* ------------------------------------------------------------------ */

function weeklyClasses(ref, teachers, save) {
  const problem = el("div", {});
  const byId = Object.fromEntries(teachers.map((p) => [p.id, p.full_name]));

  const rows = [...ref.sessions]
    .filter((s) => s.active !== false)
    .sort((a, b) =>
      (ref.dojoById[a.dojo_id]?.name || "").localeCompare(ref.dojoById[b.dojo_id]?.name || "") ||
      (DAY_ORDER[a.weekday] || 9) - (DAY_ORDER[b.weekday] || 9) ||
      String(a.start_time).localeCompare(String(b.start_time)))
    .map((s) => ({
      dojo: ref.dojoById[s.dojo_id]?.name || "—",
      weekday: s.weekday,
      time: `${s.start_time}–${s.end_time}`,
      klass: s.label || "Class",
      starts: s.starts_on ? "from " + shortDate(s.starts_on) : "—",
      instructor: byId[s.instructor_id] || "not set",
      action: button("Remove", () => {
        if (!confirm(`Remove the ${s.weekday} ${s.start_time} class at ${ref.dojoById[s.dojo_id]?.name}?`)) return;
        save(() => db.remove("sessions", { id: s.id }), "Class removed.", problem);
      }, "small quiet"),
    }));

  /* Adding one */
  const dojo = el("select", { class: "input" }, ...ref.dojos.map((d) => el("option", { value: d.id }, d.name)));
  const day = el("select", { class: "input" }, ...DAYS.map((d) => el("option", { value: d }, d)));
  const from = input({ type: "text", value: "6:30 PM" });
  const until = input({ type: "text", value: "7:30 PM" });
  const label = input({ placeholder: "Leave empty for a normal class" });
  /* Leave empty for a class that has always run. Fill it in when a dojo
     opens later, so the register does not offer the class for months
     when nobody was teaching it. */
  const begins = input({ type: "date" });
  const who = el("select", { class: "input" },
    el("option", { value: "" }, "Not decided yet"),
    ...teachers.map((p) => el("option", { value: p.id }, p.full_name)));

  const add = button("Add this weekly class", () => {
    if (!from.value.trim() || !until.value.trim()) {
      problem.replaceChildren(errorBox(new Error("Give a start and an end time.")));
      return;
    }
    save(
      () => db.insert("sessions", {
        dojo_id: dojo.value,
        weekday: day.value,
        start_time: from.value.trim(),
        end_time: until.value.trim(),
        label: label.value.trim() || null,
        instructor_id: who.value || null,
        starts_on: begins.value || null,
        active: true,
      }),
      "Weekly class added.",
      problem
    );
  }, "wide");

  return card(
    "The weekly timetable",
    "The regular classes. Removing one does not touch any attendance already marked against it.",
    table(
      [
        { key: "dojo", label: "Dojo" },
        { key: "weekday", label: "Day" },
        { key: "time", label: "Time" },
        { key: "klass", label: "Class" },
        { key: "starts", label: "Runs" },
        { key: "instructor", label: "Instructor" },
        { key: "action", label: "" },
      ],
      rows,
      { emptyMessage: "No weekly classes are set up." }
    ),
    el("h3", { style: "font-size:14px;margin:20px 0 6px" }, "Add a weekly class"),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Dojo"), dojo),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Day"), day),
    el("div", { style: "display:flex;gap:10px" },
      el("label", { class: "field", style: "flex:1" }, el("span", { class: "field-label" }, "From"), from),
      el("label", { class: "field", style: "flex:1" }, el("span", { class: "field-label" }, "Until"), until)),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Class name"), label),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Instructor"), who),
    el("label", { class: "field" },
       el("span", { class: "field-label" }, "First day (leave empty if it has always run)"), begins),
    problem,
    add
  );
}

/* ------------------------------------------------------------------ */
/* Dojos                                                               */
/* ------------------------------------------------------------------ */

function dojoSettings(ref, save) {
  const problem = el("div", {});

  const rows = ref.dojos.map((d) => {
    const name = input({ value: d.name });
    const area = input({ value: d.area || "" });
    const rate = input({ type: "number", value: d.default_rate ?? 500 });
    const gst = el("select", { class: "input" },
      el("option", { value: "no", selected: !d.gst_applies }, "No GST"),
      el("option", { value: "yes", selected: d.gst_applies }, "GST at 18%"));
    const open = el("select", { class: "input" },
      el("option", { value: "yes", selected: d.active !== false }, "Running"),
      el("option", { value: "no", selected: d.active === false }, "Closed"));

    const go = button("Save", () => {
      if (!name.value.trim()) {
        problem.replaceChildren(errorBox(new Error("A dojo needs a name.")));
        return;
      }
      save(
        () => db.update("dojos", { id: d.id }, {
          name: name.value.trim(),
          area: area.value.trim() || null,
          default_rate: Number(rate.value) || 0,
          gst_applies: gst.value === "yes",
          active: open.value === "yes",
        }),
        `${name.value.trim()} saved.`,
        problem
      );
    }, "small");

    return el("div", { style: "padding:14px 0;border-bottom:1px solid var(--line)" },
      el("label", { class: "field" }, el("span", { class: "field-label" }, "Name"), name),
      el("label", { class: "field" }, el("span", { class: "field-label" }, "Area"), area),
      el("div", { style: "display:flex;gap:10px" },
        el("label", { class: "field", style: "flex:1" }, el("span", { class: "field-label" }, "GST"), gst),
        el("label", { class: "field", style: "flex:1" }, el("span", { class: "field-label" }, "Instructor rate"), rate)),
      el("label", { class: "field" }, el("span", { class: "field-label" }, "Status"), open),
      go);
  });

  return card(
    "Dojos",
    "GST is charged at Dravid only. The instructor rate here is the default; an override for one instructor still beats it.",
    ...rows,
    problem
  );
}

/* ------------------------------------------------------------------ */
/* Fee plans                                                           */
/* ------------------------------------------------------------------ */

function feePlans(ref, save) {
  const problem = el("div", {});

  const rows = ref.plans
    .slice()
    .sort((a, b) =>
      (ref.dojoById[a.dojo_id]?.name || "").localeCompare(ref.dojoById[b.dojo_id]?.name || "") ||
      String(a.label).localeCompare(String(b.label)))
    .map((p) => {
      const fee = input({ type: "number", value: p.fee });
      const perWeek = input({ type: "number", step: "0.5", min: "0",
                              value: p.sessions_per_week ?? "" });

      const go = button("Save", () => {
        save(
          () => db.update("fee_plans", { id: p.id }, {
            fee: Number(fee.value) || 0,
            sessions_per_week: perWeek.value === "" ? null : Number(perWeek.value),
          }),
          `${p.label}: ${money(Number(fee.value) || 0)}, ` +
            `${perWeek.value || "?"} classes a week.`,
          problem
        );
      }, "small");

      return {
        dojo: ref.dojoById[p.dojo_id]?.name || "—",
        label: p.label + (p.is_addon ? " (add-on)" : ""),
        cycle: p.cycle === "month" ? "monthly" : "quarterly",
        fee: el("div", { style: "display:flex;gap:8px;align-items:center" }, fee),
        perWeek: el("div", { style: "display:flex;gap:8px;align-items:center" }, perWeek, go),
      };
    });

  return card(
    "Fee plans",
    "Changing a fee changes what every student on that plan is asked for next time; it does not change anything already paid. " +
      "“Classes a week” is what attendance is judged against — a child on 2 a week who comes twice is 100%.",
    table(
      [
        { key: "dojo", label: "Dojo" },
        { key: "label", label: "Plan" },
        { key: "cycle", label: "Billed" },
        { key: "fee", label: "Fee before GST" },
        { key: "perWeek", label: "Classes a week" },
      ],
      rows,
      { emptyMessage: "No fee plans are set up." }
    ),
    problem
  );
}
