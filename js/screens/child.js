/* =====================================================================
   MY CHILD — what a parent sees
   ---------------------------------------------------------------------
   Belt, attendance, fees, grading and medals for their own children.
   A parent can only ever load their own children; the database decides
   that, so nothing here has to be careful about it.

   Four families share one mobile between siblings, so this handles
   more than one child with a switcher.
   ===================================================================== */

import * as db from "../db.js";
import { reference, feeFor, beltFor, siblingsOf } from "../reference.js";
import { gradingFormUrl, gradingFeeUpiLink } from "../jotform.js";
import { el, card, table, stat, money, shortDate, button, section, empty, errorBox } from "../ui.js";

const CFG = window.NIPPONFIT_CONFIG || {};

export async function childScreen() {
  return el("div", {}, section(load, render, { label: "Fetching your dojo…" }));
}

async function load() {
  const [students, ref, notices, attendance, history, medals, addons] = await Promise.all([
    db.select("students", { order: "full_name" }),
    reference(),
    db.select("my_notifications", { limit: 20 }),
    db.select("attendance", { limit: 1000 }),
    db.select("grading_history"),
    db.select("achievements"),
    db.select("student_addons"),
  ]);
  return { students, ref, notices, attendance, history, medals, addons };
}

function render(data) {
  const { notices } = data;

  /* A child who has left keeps all their history in the database, but
     their parent should not still be shown them. */
  const students = data.students.filter((s) => s.active !== false);
  data = { ...data, students };

  if (students.length === 0) {
    return card(
      "My child",
      null,
      empty("No child is linked to your number yet. Please call the dojo on " + (CFG.HELP_PHONE || "9945616005") + ".")
    );
  }

  const host = el("div", {});
  const body = el("div", {});

  // Unread notices, newest first, shown above everything
  for (const n of notices.filter((x) => !x.is_read).slice(0, 3)) {
    host.append(
      el("div", { class: "notice-banner" }, el("strong", {}, n.title), el("p", { style: "margin:4px 0 0" }, n.body))
    );
  }

  if (students.length > 1) {
    const switcher = el("div", { style: "display:flex;flex-wrap:wrap;gap:8px;margin-bottom:14px" });
    students.forEach((s, i) => {
      const b = button(
        s.full_name,
        () => {
          for (const child of switcher.children) child.className = "btn small quiet";
          b.className = "btn small";
          body.replaceChildren(childCard(s, data));
        },
        i === 0 ? "small" : "small quiet"
      );
      switcher.append(b);
    });
    host.append(switcher);
  }

  body.append(childCard(students[0], data));
  host.append(body);
  return host;
}

function childCard(student, { ref, attendance, history, medals, addons, students }) {
  const { belt, next } = beltFor(student, ref);
  const dojo = ref.dojoById[student.dojo_id];

  const myAddons = addons.filter((a) => a.student_id === student.id).map((a) => a.plan_id);
  const siblings = siblingsOf(student, students);
  const fee = feeFor(student, ref, myAddons, { siblings });

  const mine = attendance.filter((a) => a.student_id === student.id);
  const present = mine.filter((a) => a.present).length;
  const rate = mine.length ? Math.round((present / mine.length) * 100) : null;

  const myHistory = history.filter((h) => h.student_id === student.id);
  const myMedals = medals.filter((m) => m.student_id === student.id);

  return el(
    "div",
    {},
    card(
      student.full_name,
      [student.id_card, dojo?.name].filter(Boolean).join(" · "),
      el(
        "div",
        { class: "stats" },
        stat("Belt", belt ? belt.name : "Not set", belt ? belt.kyu : null),
        stat("Attendance", rate === null ? "—" : rate + "%", mine.length ? `${present} of ${mine.length} classes` : "no classes yet"),
        stat(
          "Fees",
          money(fee.total),
          fee.cycle === "month" ? "every month" : "every quarter"
        ),
        stat(
          "Status",
          student.on_break
            ? el("span", { class: "pill due" }, "on a break")
            : el("span", { class: `pill ${student.fee_state}` }, student.fee_state),
          student.on_break
            ? "not billed"
            : student.fee_due_on ? "due " + shortDate(student.fee_due_on) : null
        )
      )
    ),

    student.on_break
      ? card(
          "On a break",
          null,
          el("p", { style: "margin:0" },
             `${student.full_name} is marked as taking a break, so there is nothing to pay for now. ` +
             "Call the dojo when you would like to start again.")
        )
      : feeCard(fee, student),
    gradingCard(student, belt, next, rate),

    myHistory.length > 0 &&
      card(
        "Belt history",
        null,
        table(
          [
            { key: "graded_on", label: "Date", format: shortDate },
            { key: "to_belt_id", label: "Promoted to", format: (id) => ref.beltById[id]?.name || id },
            { key: "result", label: "Result" },
            { key: "fee_paid", label: "Fee", align: "num", format: money },
          ],
          myHistory
        )
      ),

    myMedals.length > 0 &&
      card(
        "Achievements",
        null,
        table(
          [
            { key: "on_date", label: "Date", format: shortDate },
            { key: "tournament", label: "Tournament" },
            { key: "level", label: "Level" },
            { key: "event", label: "Event" },
            { key: "medal", label: "Medal" },
          ],
          myMedals
        )
      )
  );
}

function feeCard(fee, student) {
  if (!fee.ok && !fee.isOverride) {
    return card("Fees", null, empty("No fee plan is set for this student yet. Please call the dojo."));
  }

  const rows = [...fee.lines];
  if (fee.siblingDiscount) rows.push({ label: "Brother or sister discount", amount: -fee.siblingDiscount });
  if (fee.discount) rows.push({ label: "Discount from the dojo", amount: -fee.discount });
  if (fee.gst) rows.push({ label: "GST at 18%", amount: fee.gst });
  rows.push({ label: "Total", amount: fee.total });

  return card(
    "Fees",
    fee.cycle === "month" ? "Billed monthly" : "Billed quarterly",
    table(
      [
        { key: "label", label: "Item" },
        { key: "amount", label: "Amount", align: "num", format: money },
      ],
      rows
    ),
    fee.siblingDiscount
      ? el("p", { class: "muted", style: "margin-top:10px" },
           "\u20B91,000 is taken off because more than one child from your family trains with us.")
      : null,
    student.fee_state !== "paid"
      ? el("p", { class: "muted", style: "margin-top:6px" },
           "Please pay at the dojo or by UPI. The dojo marks it paid once received.")
      : null
  );
}

function gradingCard(student, belt, next, rate) {
  if (!next || student.on_break) return null;

  const fee = Number(next.grading_fee) || 0;

  /* Not yet put forward — say why, and nothing else. */
  if (!student.grading_eligible) {
    return card(
      "Grading",
      `Next belt: ${next.name} (${next.kyu})`,
      el(
        "p",
        { class: "muted", style: "margin:0" },
        rate !== null && rate < 75
          ? `Attendance is ${rate}%. Grading opens at 75%, once the instructor puts your child forward.`
          : "Your child has not been put forward for grading yet. The instructor decides when they are ready."
      )
    );
  }

  /* Put forward — two steps, each with one thing to do. */
  const formDone = student.grading_form_done;
  const feePaid = student.grading_fee_paid;

  const step = (n, title, done, ...body) =>
    el(
      "div",
      { class: `step${done ? " done" : ""}` },
      el("div", { class: "step-mark" }, done ? "\u2713" : String(n)),
      el("div", { class: "step-body" }, el("div", { class: "step-title" }, title), ...body)
    );

  return card(
    "Grading",
    `Being graded to ${next.name} (${next.kyu})`,
    el(
      "div",
      { class: "steps" },

      step(
        1,
        formDone ? "Form received" : "Fill in the grading form",
        formDone,
        formDone
          ? el("p", { class: "muted" }, "The dojo will confirm the grading date.")
          : el(
              "div",
              {},
              el("p", { class: "muted" }, "It opens already filled in. Check the details and submit."),
              el(
                "a",
                { class: "btn small", href: gradingFormUrl(student, belt, next), target: "_blank", rel: "noopener" },
                "Open the form"
              )
            )
      ),

      step(
        2,
        feePaid ? "Grading fee paid" : `Pay the grading fee, ${money(fee)}`,
        feePaid,
        feePaid
          ? el("p", { class: "muted" }, "Thank you \u2014 nothing more to do.")
          : el(
              "div",
              {},
              el("p", { class: "muted" }, "Pay by UPI, or hand it in at the dojo."),
              gradingFeeUpiLink(student, next)
                ? el("a", { class: "btn small", href: gradingFeeUpiLink(student, next) }, `Pay ${money(fee)} by UPI`)
                : el("p", { class: "muted" }, "Please pay at the dojo.")
            )
      )
    )
  );
}
