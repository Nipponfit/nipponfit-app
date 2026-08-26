/* =====================================================================
   FEES DUE — the founder's and admin's collection list
   ---------------------------------------------------------------------
   Who owes what, a UPI link that opens the parent's payment app with the
   amount already filled in, and a ready-made WhatsApp message.

   UPI links cost nothing at all — no gateway, no percentage, no account
   to open. The trade-off is that nothing tells the app the money
   arrived, so you tick "Paid" yourself.
   ===================================================================== */

import * as db from "../db.js";
import { el, card, table, stat, money, shortDate, button, section, toast, errorBox, empty, phoneDigits } from "../ui.js";

const CFG = window.NIPPONFIT_CONFIG || {};

export async function feesScreen({ refresh }) {
  return el("div", {}, section(() => db.select("fees_due_now"), (rows) => render(rows, refresh), { label: "Checking who owes what…" }));
}

function render(rows, refresh) {
  if (rows.length === 0) {
    return card("Fees due", null, empty("Nobody owes anything. Every student is marked paid."));
  }

  const total = rows.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const late = rows.filter((r) => Number(r.days_late) > 0);

  return el(
    "div",
    {},
    card(
      "Fees due",
      `As of ${shortDate(new Date().toISOString())}`,
      el(
        "div",
        { class: "stats" },
        stat("Students owing", rows.length),
        stat("Total due", money(total)),
        stat("Overdue", late.length, late.length ? "past their due date" : null)
      ),
      remindAll(refresh)
    ),

    card(
      "Who owes what",
      "Tap a name to open the ways to chase it.",
      table(
        [
          { key: "student", label: "Student" },
          { key: "dojo", label: "Dojo" },
          { key: "parent", label: "Parent" },
          { key: "amount", label: "Amount", align: "num", format: money },
          { key: "fee_due_on", label: "Due", format: shortDate },
          {
            key: "days_late",
            label: "Status",
            format: (days) =>
              el("span", { class: `pill ${days > 0 ? "overdue" : "due"}` }, days > 0 ? `${days} days late` : "Due"),
          },
        ],
        rows
      )
    ),

    ...rows.map((row) => chaseCard(row, refresh))
  );
}

/* Raise this month's reminders for everyone at once. They appear in each
   parent's app immediately. */
function remindAll(refresh) {
  const problem = el("div", {});
  const go = button(
    "Send this month's reminders to every parent",
    async () => {
      go.disabled = true;
      go.textContent = "Sending…";
      try {
        const result = await db.rpc("raise_fee_reminders");
        const raised = Array.isArray(result) ? result.filter((r) => r.outcome === "reminder raised").length : 0;
        toast(`${raised} reminder${raised === 1 ? "" : "s"} sent.`);
        refresh();
      } catch (err) {
        problem.append(errorBox(err));
      }
      go.disabled = false;
      go.textContent = "Send this month's reminders to every parent";
    },
    "wide"
  );
  return el("div", { style: "margin-top:14px" }, problem, go);
}

/* Everything you might do about one unpaid fee */
function chaseCard(row, refresh) {
  const problem = el("div", {});
  const amount = Math.round(Number(row.amount) || 0);
  const upiId = CFG.UPI_ID;

  const message =
    `Namaste${row.parent ? " " + row.parent : ""}, this is Nippon Karate Club. ` +
    `${row.student}'s fee of ${money(amount)} is due` +
    (row.fee_due_on ? ` by ${shortDate(row.fee_due_on)}` : "") +
    `. You can pay at the dojo or by UPI. Thank you.`;

  const actions = el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;margin-top:12px" });

  /* WhatsApp — works on every phone, costs nothing, no setup */
  actions.append(
    el(
      "a",
      {
        class: "btn small",
        href: `https://wa.me/91${phoneDigits(row.parent_phone)}?text=${encodeURIComponent(message)}`,
        target: "_blank",
        rel: "noopener",
      },
      "WhatsApp the parent"
    )
  );

  /* No UPI button here on purpose. It would open YOUR payment app to pay
     the club from your own phone, which is nobody's intention. The
     parent gets that button, on their own My child screen. */

  actions.append(
    button(
      "Copy message",
      async () => {
        try {
          await navigator.clipboard.writeText(message);
          toast("Message copied.");
        } catch {
          toast("Could not copy on this device.");
        }
      },
      "small quiet"
    )
  );

  const paid = button(
    "Mark as paid",
    async () => {
      paid.disabled = true;
      paid.textContent = "Saving…";
      try {
        await db.update("students", { id: row.student_id }, { fee_state: "paid" });
        toast(`${row.student} marked paid.`);
        refresh();
      } catch (err) {
        problem.append(errorBox(err));
        paid.disabled = false;
        paid.textContent = "Mark as paid";
      }
    },
    "small"
  );
  actions.append(paid);

  return card(
    `${row.student} — ${money(amount)}`,
    `${row.dojo || "No dojo"} · ${row.plan || "No plan set"} · parent ${phoneDigits(row.parent_phone) || "no number"}`,
    el("p", { class: "muted" }, message),
    actions,
    problem,
    !upiId
      ? el(
          "p",
          { class: "muted", style: "margin-top:10px" },
          "No UPI ID is set, so parents have no pay-by-UPI button on their own screen. " +
          "Add it to config.js as UPI_ID."
        )
      : null
  );
}
