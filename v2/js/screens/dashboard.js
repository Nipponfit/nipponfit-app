/* =====================================================================
   DASHBOARD — the founder's overview
   ---------------------------------------------------------------------
   Where the club stands right now: students, expected income, who owes
   money, attendance, and what the instructors are owed.
   ===================================================================== */

import * as db from "../db.js";
import { reference, feeFor } from "../reference.js";
import { el, card, table, stat, money, section, empty } from "../ui.js";

export async function dashboardScreen() {
  return el("div", {}, section(load, render, { label: "Adding up your club…" }));
}

async function load() {
  const [students, ref, addons, attendance, history, fees, payouts] = await Promise.all([
    db.select("students"),
    reference(),
    db.select("student_addons"),
    db.select("attendance", { limit: 2000 }),
    db.select("grading_history"),
    db.select("fees_due_now").catch(() => []),
    db.select("staff_payouts").catch(() => []),
  ]);
  return { students, ref, addons, attendance, history, fees, payouts };
}

function render({ students, ref, addons, attendance, history, fees, payouts }) {
  const active = students.filter((s) => s.active !== false);

  /* Expected income, normalised to a month so quarterly and monthly
     dojos can sit in the same column. */
  const perDojo = ref.dojos.map((dojo) => {
    const mine = active.filter((s) => s.dojo_id === dojo.id);
    const monthly = mine.reduce((sum, s) => {
      const f = feeFor(s, ref, addons.filter((a) => a.student_id === s.id).map((a) => a.plan_id));
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
        stat("Students", active.length, `${ref.dojos.filter((d) => d.active).length} dojos`),
        stat("Expected monthly", money(monthlyTotal), "fees spread evenly"),
        stat("Owed by parents", money(owedByParents), fees.length ? `${fees.length} students` : "all paid"),
        stat("Owed to instructors", money(owedToInstructors)),
        stat("Attendance", attendanceRate === null ? "—" : attendanceRate + "%", attendance.length ? `${attendance.length} marks` : "nothing marked yet"),
        stat("Grading fees taken", money(gradingIncome))
      )
    ),

    card(
      "By dojo",
      "Fees shown per month, with quarterly plans divided by three.",
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
      : card("Fees", null, empty("Nobody owes anything.")),

    el(
      "p",
      { class: "muted" },
      "Expected monthly is what the fee plans add up to, not what has been collected. Compare it with what is owed above."
    )
  );
}
