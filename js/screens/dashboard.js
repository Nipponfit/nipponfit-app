/* =====================================================================
   DASHBOARD — the founder's overview
   ---------------------------------------------------------------------
   Two different questions, kept apart because confusing them is easy:

     EXPECTED   what the fee plans add up to. A projection.
     RECEIVED   money actually taken, by month, quarter or year.

   Received only counts from the day the app started recording payments,
   so early months will look empty. That is honest rather than wrong.
   ===================================================================== */

import * as db from "../db.js";
import { reference, feeFor, siblingsOf } from "../reference.js";
import { el, card, table, stat, money, button, section, empty } from "../ui.js";

export async function dashboardScreen() {
  return el("div", {}, section(load, render, { label: "Adding up your club…" }));
}

async function load() {
  const [students, ref, addons, attendance, history, fees, payouts, revenue] = await Promise.all([
    db.select("students"),
    reference(),
    db.select("student_addons"),
    db.select("attendance", { limit: 3000 }),
    db.select("grading_history"),
    db.select("fees_due_now").catch(() => []),
    db.select("staff_payouts").catch(() => []),
    db.select("revenue_by_period").catch(() => []),
  ]);
  return { students, ref, addons, attendance, history, fees, payouts, revenue };
}

function render({ students, ref, addons, attendance, history, fees, payouts, revenue }) {
  const active = students.filter((s) => s.active !== false);
  const training = active.filter((s) => !s.on_break);

  /* Expected income, normalised to a month so quarterly and monthly
     dojos can sit in the same column. Anyone on a break is left out. */
  const perDojo = ref.dojos.map((dojo) => {
    const mine = training.filter((s) => s.dojo_id === dojo.id);
    const monthly = mine.reduce((sum, s) => {
      const f = feeFor(
        s,
        ref,
        addons.filter((a) => a.student_id === s.id).map((a) => a.plan_id),
        { siblings: siblingsOf(s, training) }
      );
      return sum + (f.cycle === "month" ? f.total : f.total / 3);
    }, 0);
    return { dojo: dojo.name, students: mine.length, monthly: Math.round(monthly) };
  });

  const monthlyTotal = perDojo.reduce((sum, d) => sum + d.monthly, 0);
  const present = attendance.filter((a) => a.present).length;
  const attendanceRate = attendance.length ? Math.round((present / attendance.length) * 100) : null;
  const gradingIncome = history.reduce((sum, h) => sum + Number(h.fee_paid || 0), 0);
  const owedToInstructors = payouts.reduce((sum, p) => sum + Number(p.still_owed || 0), 0);
  const owedByParents = fees.reduce((sum, f) => sum + Number(f.amount || 0), 0);

  return el(
    "div",
    {},
    card(
      "Where things stand",
      "Live from your database.",
      el(
        "div",
        { class: "stats" },
        stat("Training", training.length, `${active.length - training.length} on a break`),
        stat("Expected monthly", money(monthlyTotal), "if everyone pays"),
        stat("Owed by parents", money(owedByParents), fees.length ? `${fees.length} students` : "all paid"),
        stat("Owed to instructors", money(owedToInstructors)),
        stat("Attendance", attendanceRate === null ? "—" : attendanceRate + "%",
             attendance.length ? `${attendance.length} marks` : "nothing marked yet"),
        stat("Grading fees taken", money(gradingIncome))
      )
    ),

    revenueCard(revenue),

    card(
      "Expected, by dojo",
      "Per month, with quarterly plans divided by three. Students on a break are not counted.",
      table(
        [
          { key: "dojo", label: "Dojo" },
          { key: "students", label: "Students", align: "num" },
          { key: "monthly", label: "Per month", align: "num", format: money },
        ],
        perDojo
      )
    ),

    fees.length > 0
      ? card(
          "Needs chasing",
          "Open the Fees due tab to send a reminder or a UPI link.",
          table(
            [
              { key: "student", label: "Student" },
              { key: "dojo", label: "Dojo" },
              { key: "amount", label: "Amount", align: "num", format: money },
              { key: "days_late", label: "Late by", align: "num", format: (d) => (d > 0 ? `${d} days` : "—") },
            ],
            fees.slice(0, 10)
          )
        )
      : card("Fees", null, empty("Nobody owes anything."))
  );
}

/* ------------------------------------------------------------------ */
/* Money actually received, by month, quarter or year                  */
/* ------------------------------------------------------------------ */

function revenueCard(revenue) {
  if (!revenue || revenue.length === 0) {
    return card(
      "Money received",
      null,
      empty(
        "Nothing recorded yet. From now on, every time you tick a fee as paid the amount and " +
          "the date are stored, and this fills in by month, quarter and year."
      )
    );
  }

  const body = el("div", {});
  const buttons = el("div", { style: "display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px" });

  const PERIODS = [
    ["month", "By month", (r) => r.month, (r) => r.month_name],
    ["quarter", "By quarter", (r) => r.quarter, (r) => r.quarter],
    ["year", "By year", (r) => r.year, (r) => r.year],
  ];

  function draw(key) {
    for (const b of buttons.children) b.className = b.dataset.key === key ? "btn small" : "btn small quiet";

    const [, , keyOf, labelOf] = PERIODS.find((p) => p[0] === key);

    /* Total each period, and split term fees from grading fees so you
       can see where the money came from. */
    const grouped = new Map();
    for (const row of revenue) {
      const k = keyOf(row);
      if (!grouped.has(k)) grouped.set(k, { period: labelOf(row), term: 0, grading: 0, total: 0 });
      const g = grouped.get(k);
      const amount = Number(row.amount) || 0;
      if (String(row.purpose).toLowerCase().includes("grading")) g.grading += amount;
      else g.term += amount;
      g.total += amount;
    }

    const rows = [...grouped.entries()].sort((a, b) => String(b[0]).localeCompare(String(a[0]))).map(([, v]) => v);
    const grand = rows.reduce((sum, r) => sum + r.total, 0);

    body.replaceChildren(
      table(
        [
          { key: "period", label: key === "month" ? "Month" : key === "quarter" ? "Quarter" : "Year" },
          { key: "term", label: "Term fees", align: "num", format: money },
          { key: "grading", label: "Grading fees", align: "num", format: money },
          { key: "total", label: "Total", align: "num", format: money },
        ],
        rows
      ),
      el("p", { class: "muted", style: "margin-top:10px" }, `Everything recorded so far: ${money(grand)}.`)
    );
  }

  for (const [key, label] of PERIODS) {
    const b = button(label, () => draw(key), "small quiet");
    b.dataset.key = key;
    buttons.append(b);
  }

  draw("month");

  return card(
    "Money received",
    "Actually taken, not what is owed. Term fees are recorded when you tick a fee as paid.",
    buttons,
    body
  );
}
