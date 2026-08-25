/* =====================================================================
   INSTRUCTOR PAY — the founder's and admin's payouts screen
   ---------------------------------------------------------------------
   What each instructor has earned, per month and per dojo, and a button
   to record a month as paid.
   ===================================================================== */

import * as db from "../db.js";
import { el, card, table, stat, money, button, input, fill, shortDate, section, toast, errorBox, empty, phoneDigits } from "../ui.js";

export async function payoutsScreen({ refresh }) {
  return el("div", {}, section(load, (data) => render(data, refresh), { label: "Adding up instructor pay…" }));
}

async function load() {
  const [rows, rates, instructors, dojos, taught] = await Promise.all([
    db.select("staff_payouts"),
    db.select("instructor_rates"),
    // The founder teaches at Dravid, so she belongs in this list as
    // much as any instructor. Admins do not teach, so they are left out.
    db.select("profiles", {
      columns: "id, full_name, phone, rank, role",
      filter: { role: "in.(instructor,founder)" },
    }),
    db.select("dojos", { order: "name" }),
    db.select("taught_sessions", { order: "on_date.desc", limit: 1000 }),
  ]);
  return { rows, rates, instructors, dojos, taught };
}

function render({ rows, instructors, dojos, taught }, refresh) {
  if (rows.length === 0) {
    return el(
      "div",
      {},
      card(
        "Instructor pay",
        null,
        empty(
          "Nothing recorded yet. A class is counted when an instructor marks attendance for it, so this fills in as they use the app."
        )
      ),
      recordClass(instructors, dojos, refresh)
    );
  }

  const owed = rows.reduce((sum, r) => sum + Number(r.still_owed || 0), 0);
  const earned = rows.reduce((sum, r) => sum + Number(r.earned || 0), 0);
  const sessions = rows.reduce((sum, r) => sum + Number(r.sessions || 0), 0);

  /* Group by instructor and month so each month can be settled in one go */
  const groups = new Map();
  for (const r of rows) {
    const key = `${r.instructor}||${r.month}`;
    if (!groups.has(key)) groups.set(key, { instructor: r.instructor, phone: r.phone, month: r.month, rows: [], owed: 0 });
    const g = groups.get(key);
    g.rows.push(r);
    g.owed += Number(r.still_owed || 0);
  }

  return el(
    "div",
    {},
    card(
      "Instructor pay",
      "Across every dojo and month recorded.",
      el(
        "div",
        { class: "stats" },
        stat("Classes taught", sessions),
        stat("Total earned", money(earned)),
        stat("Still to pay", money(owed))
      )
    ),

    recordClass(instructors, dojos, refresh),

    everyClass(taught, instructors, dojos, refresh),

    ...[...groups.values()].map((g) => monthCard(g, refresh)),

    card(
      "Rates",
      "The rate each instructor is on. Set an override with set_rate() in the SQL editor until this screen can edit it.",
      table(
        [
          { key: "full_name", label: "Instructor" },
          { key: "phone", label: "Mobile", format: phoneDigits },
          { key: "rank", label: "Rank" },
        ],
        instructors.filter((i) => i.role === "instructor")
      )
    )
  );
}

function monthCard(group, refresh) {
  const problem = el("div", {});

  const settle = button(
    `Mark ${group.month} paid`,
    async () => {
      settle.disabled = true;
      settle.textContent = "Recording…";
      try {
        const month = new Date(group.month + " 1").toISOString().slice(0, 7);
        const result = await db.rpc("mark_paid", {
          p_instructor_phone: phoneDigits(group.phone),
          p_month: month,
        });
        toast(typeof result === "string" ? result : "Recorded.");
        refresh();
      } catch (err) {
        problem.append(errorBox(err));
        settle.disabled = false;
        settle.textContent = `Mark ${group.month} paid`;
      }
    },
    "small"
  );

  return card(
    `${group.instructor} — ${group.month}`,
    group.owed > 0 ? `${money(group.owed)} still to pay` : "Fully paid",
    table(
      [
        { key: "dojo", label: "Dojo" },
        { key: "sessions", label: "Classes", align: "num" },
        { key: "rate", label: "Rate", align: "num", format: money },
        { key: "earned", label: "Earned", align: "num", format: money },
        { key: "still_owed", label: "Owed", align: "num", format: money },
      ],
      group.rows
    ),
    problem,
    group.owed > 0 ? settle : null
  );
}


/* Record a class an instructor took, dojo by dojo and date by date.
   Normally this happens by itself when they mark attendance — this is
   for the times it did not, or for a correction. The pay is worked out
   from their rate at that dojo. */
function recordClass(instructors, dojos, refresh) {
  if (instructors.length === 0 || dojos.length === 0) return null;

  const who = el("select", { class: "input" },
    ...instructors.map((i) =>
      el("option", { value: phoneDigits(i.phone) },
         i.full_name + (i.role === "founder" ? " (you)" : ""))));
  const where = el("select", { class: "input" },
    ...dojos.filter((d) => d.active !== false).map((d) => el("option", { value: d.name }, d.name)));
  const when = input({ type: "date", value: new Date().toISOString().slice(0, 10) });
  const problem = el("div", {});

  const go = button("Record this class", async () => {
    problem.replaceChildren();
    go.disabled = true;
    go.textContent = "Recording…";
    try {
      const message = await db.rpc("record_taught_session", {
        p_instructor_phone: who.value,
        p_dojo_name: where.value,
        p_on_date: when.value,
      });
      toast(typeof message === "string" ? message : "Recorded.");
      refresh();
    } catch (err) {
      problem.append(errorBox(err));
    }
    go.disabled = false;
    go.textContent = "Record this class";
  }, "wide");

  return card(
    "Record a class an instructor taught",
    "Only needed when a class was not marked in the app. The pay comes from their rate at that dojo.",
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Instructor"), who),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Dojo"), where),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Date"), when),
    problem,
    go
  );
}


/* Every class recorded, date by date.

   The totals above answer "what do I owe"; this answers "which classes
   were those" — and lets a wrong one be removed. A class already paid
   out cannot be removed, because the money has gone. */
function everyClass(taught, instructors, dojos, refresh) {
  if (!taught || taught.length === 0) return null;

  const who = Object.fromEntries(instructors.map((p) => [p.id, p.full_name]));
  const where = Object.fromEntries(dojos.map((d) => [d.id, d.name]));
  const problem = el("div", {});

  const pick = el("select", { class: "input" },
    el("option", { value: "" }, "Everyone"),
    ...instructors.map((p) => el("option", { value: p.id }, p.full_name)));

  const body = el("div", {});

  function draw() {
    const shown = pick.value ? taught.filter((t) => t.instructor_id === pick.value) : taught;

    const removeAll = pick.value
      ? button(
          `Remove all ${shown.filter((t) => !t.paid_out).length} unpaid classes for ${who[pick.value]}`,
          async () => {
            const unpaid = shown.filter((t) => !t.paid_out);
            if (!unpaid.length) return;
            if (!confirm(
              `Remove ${unpaid.length} recorded classes for ${who[pick.value]}?\n\n` +
              "Their attendance is not touched — only the pay lines. " +
              "Classes already paid out are kept."
            )) return;
            problem.replaceChildren();
            try {
              for (const t of unpaid) await db.rpc("remove_taught_session", { p_id: t.id });
              toast(`${unpaid.length} classes removed.`);
              refresh();
            } catch (err) {
              problem.append(errorBox(err));
            }
          },
          "small quiet"
        )
      : null;

    fill(
      body,
      el("p", { class: "muted" }, `${shown.length} recorded ${shown.length === 1 ? "class" : "classes"}`),
      removeAll,
      table(
        [
          { key: "on_date", label: "Date", format: shortDate },
          { key: "instructor_id", label: "Instructor", format: (id) => who[id] || "—" },
          { key: "dojo_id", label: "Dojo", format: (id) => where[id] || "—" },
          { key: "rate_applied", label: "Pay", align: "num", format: money },
          { key: "source", label: "How", format: (v) => (v === "auto" ? "from attendance" : "by hand") },
          {
            key: "paid_out",
            label: "",
            format: (paid, row) =>
              paid
                ? el("span", { class: "pill paid" }, "paid")
                : button("Remove", async () => {
                    if (!confirm(
                      `Remove the ${where[row.dojo_id]} class on ${shortDate(row.on_date)}` +
                      ` for ${who[row.instructor_id]}?\n\nAttendance is not touched.`
                    )) return;
                    problem.replaceChildren();
                    try {
                      await db.rpc("remove_taught_session", { p_id: row.id });
                      toast("Removed.");
                      refresh();
                    } catch (err) {
                      problem.append(errorBox(err));
                    }
                  }, "small quiet"),
          },
        ],
        shown.slice(0, 200)
      ),
      shown.length > 200
        ? el("p", { class: "muted" }, `Showing the most recent 200 of ${shown.length}.`)
        : null
    );
  }

  pick.addEventListener("change", draw);
  draw();

  return card(
    "Every class recorded",
    "Which classes the totals above are made of. Remove any that should not be there — attendance is never touched.",
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Whose"), pick),
    body,
    problem
  );
}
