/* =====================================================================
   MY SESSIONS & PAY — what an instructor sees
   ---------------------------------------------------------------------
   Every class they have taught, how many students came, what it paid,
   and the month's total. Their own rows only — the database enforces
   that, not this screen.
   ===================================================================== */

import * as db from "../db.js";
import { el, card, table, stat, money, shortDate, section, empty } from "../ui.js";

export async function instructorPayScreen() {
  return el("div", {}, section(load, render, { label: "Working out your sessions…" }));
}

async function load() {
  const [months, byDojo, sessions] = await Promise.all([
    db.select("my_pay_by_month"),
    db.select("my_pay_by_dojo"),
    db.select("my_teaching", { limit: 200 }),
  ]);
  return { months, byDojo, sessions };
}

function render({ months, byDojo, sessions }) {
  if (sessions.length === 0) {
    return card(
      "My sessions and pay",
      null,
      empty(
        "Nothing recorded yet. A class counts the moment you mark attendance for it — there is no separate button to press."
      )
    );
  }

  const thisMonth = months[0];
  const owedAll = months.reduce((sum, m) => sum + Number(m.still_owed || 0), 0);

  return el(
    "div",
    {},
    thisMonth &&
      card(
        thisMonth.month_name,
        "Your current month",
        el(
          "div",
          { class: "stats" },
          stat("Sessions taught", thisMonth.sessions_taught),
          stat("Earned", money(thisMonth.total_earned)),
          stat("Still owed", money(thisMonth.still_owed), owedAll > Number(thisMonth.still_owed || 0) ? `${money(owedAll)} owed in total` : null)
        )
      ),

    byDojo.length > 0 &&
      card(
        "By dojo",
        "Your rate can differ from one dojo to another.",
        table(
          [
            { key: "month", label: "Month" },
            { key: "dojo", label: "Dojo" },
            { key: "sessions_taught", label: "Classes", align: "num" },
            { key: "rate_per_session", label: "Rate", align: "num", format: money },
            { key: "total_earned", label: "Earned", align: "num", format: money },
          ],
          byDojo
        )
      ),

    card(
      "Every class you have taught",
      "Newest first.",
      table(
        [
          { key: "on_date", label: "Date", format: shortDate },
          { key: "dojo", label: "Dojo" },
          { key: "class_name", label: "Class" },
          { key: "students_present", label: "Present", align: "num" },
          { key: "pay_for_this_class", label: "Pay", align: "num", format: money },
          {
            key: "paid_out",
            label: "Status",
            format: (paid, row) =>
              el("span", { class: `pill ${paid ? "paid" : "due"}` }, paid ? `Paid ${shortDate(row.paid_on)}` : "Not yet paid"),
          },
        ],
        sessions
      )
    ),

    el(
      "p",
      { class: "muted" },
      "Pay is worked out at the rate set for you at that dojo on the day you taught. Changing a rate later never changes what you have already earned."
    )
  );
}
