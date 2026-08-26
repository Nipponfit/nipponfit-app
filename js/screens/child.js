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
import { reference, feeFor, beltFor, siblingsOf, sessionsEntitled, sessionsPerWeek, attendancePercent } from "../reference.js";
import { gradingFormUrl, gradingFeeUpiLink } from "../jotform.js";
import { el, card, table, stat, money, shortDate, button, fill, section, empty, errorBox, localDate } from "../ui.js";

const CFG = window.NIPPONFIT_CONFIG || {};

export async function childScreen() {
  return el("div", {}, section(load, render, { label: "Fetching your dojo…" }));
}

async function load() {
  const [students, ref, notices, attendance, history, medals, addons] = await Promise.all([
    db.select("students", { order: "full_name" }),
    reference(),
    db.select("my_notifications", { limit: 20 }),
    db.selectAll("attendance"),
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

  /* Attendance is judged against what their plan buys, not against
     every class the dojo runs. A child on 2 sessions a week who comes
     twice a week is 100%.

     The headline is THIS MONTH. A single lifetime figure only ever
     drifts downwards and stops meaning anything — a child who has
     turned it around since June deserves to see June is behind them. */
  const mine = attendance.filter((a) => a.student_id === student.id);
  const perWeek = sessionsPerWeek(student, ref, myAddons);

  const months = monthsFor(student, mine);
  const thisMonth = months[months.length - 1] || null;

  const lifetimePresent = mine.filter((a) => a.present).length;
  const lifetimeEntitled = sessionsEntitled(
    student, ref, myAddons, student.joined_on || "2026-01-01", localDate()
  );

  const present = thisMonth ? thisMonth.present : 0;
  const entitled = thisMonth && thisMonth.recorded ? thisMonth.entitled : 0;
  const rate = thisMonth ? thisMonth.rate : null;

  /* The month-by-month panel, hidden until the number is tapped. */
  const breakdown = el("div", {});
  let showing = false;
  const toggleMonths = () => {
    showing = !showing;
    fill(breakdown, showing ? monthsCard(student, months, lifetimePresent, lifetimeEntitled) : null);
    if (showing) breakdown.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  function monthsFor(child, marks) {
    const out = [];
    const start = new Date((child.joined_on || "2026-01-01").slice(0, 10) + "T00:00:00");
    const now = new Date();
    const cursor = new Date(start.getFullYear(), start.getMonth(), 1);

    while (cursor <= now) {
      const key = `${cursor.getFullYear()}-${String(cursor.getMonth() + 1).padStart(2, "0")}`;
      const first = key + "-01";
      const last = localDate(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0));

      const inMonth = marks.filter((a) => String(a.on_date).slice(0, 7) === key);
      const wasPresent = inMonth.filter((a) => a.present).length;
      const wasAbsent = inMonth.filter((a) => !a.present).length;
      const owed = sessionsEntitled(child, ref, myAddons, first, last);

      /* A month with no register marked at all is not a month the child
         missed — it is a month nobody wrote down. Showing 0% there
         blames the child for the dojo's paperwork, so it shows nothing
         and says so. */
      const nothingRecorded = wasPresent + wasAbsent === 0;

      out.push({
        key,
        label: cursor.toLocaleDateString("en-IN", { month: "long", year: "numeric" }),
        present: wasPresent,
        absent: wasAbsent,
        entitled: owed,
        recorded: !nothingRecorded,
        rate: nothingRecorded ? null : attendancePercent(wasPresent, owed),
      });
      cursor.setMonth(cursor.getMonth() + 1);
    }
    return out;
  }

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
        stat(
          "Attendance this month",
          rate === null ? "—" : rate + "%",
          entitled
            ? `${present} of ${entitled} classes` + (perWeek ? ` · ${perWeek} a week` : "")
            : "nothing marked yet this month",
          months.length > 1 ? toggleMonths : null
        ),
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

    breakdown,

    student.on_break
      ? card(
          "On a break",
          null,
          el("p", { style: "margin:0" },
             `${student.full_name} is marked as taking a break, so there is nothing to pay for now. ` +
             "Call the dojo when you would like to start again.")
        )
      : feeCard(fee, student),
    gradingCard(student, belt, next, rate, present, entitled),

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
    student.fee_state === "paid"
      ? el("p", { class: "paid-note", style: "margin-top:10px" },
           "✓ Received, thank you. Nothing to pay at the moment.")
      : el(
          "div",
          { style: "margin-top:12px" },
          feeUpiLink(fee.total, student)
            ? el("a", { class: "btn", href: feeUpiLink(fee.total, student) },
                 `Pay ${money(fee.total)} by UPI`)
            : null,
          el("p", { class: "muted", style: "margin-top:8px" },
             "You can also pay at the dojo. Either way the dojo marks it received, " +
             "and this page will say so.")
        )
  );
}

/* present and entitled must be handed in. They belong to the child, not
   to this function, and reaching for them without them being passed is
   what blanked every parent's screen. */
function gradingCard(student, belt, next, rate, present, entitled) {
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
          ? `Attendance is ${rate}% — ${present} of the ${entitled} classes their plan covers. Grading opens at 75%, once the instructor puts your child forward.`
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
    `Being graded to ${next.name} (${next.kyu})` +
      (student.grading_date ? ` \u00B7 exam on ${shortDate(student.grading_date)}` : ""),
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


/* The fee, ready to pay, in the parent's own payment app.

   A UPI link costs the club nothing — no gateway, no percentage, no
   account to open. It opens GPay, PhonePe or whatever they use with the
   amount and the reference already filled in. This belongs to the
   parent: staff have no use for a button that pays a bill on somebody
   else's phone. */
function feeUpiLink(amount, student) {
  const upiId = CFG.UPI_ID;
  const rupees = Math.round(Number(amount) || 0);
  if (!upiId || rupees <= 0) return null;

  return (
    `upi://pay?pa=${encodeURIComponent(upiId)}` +
    `&pn=${encodeURIComponent("Nippon Karate Club")}` +
    `&am=${rupees}&cu=INR` +
    `&tn=${encodeURIComponent(student.id_card ? student.id_card + " fee" : student.full_name + " fee")}`
  );
}


/* Month by month, for a parent who wants to know where the number came
   from.

   "Classes" is what their fee covers that month, not every class the
   dojo ran — a child on two a week is measured against two a week.
   Came and Missed are what was actually written down, and they will not
   always add up to the classes owed: a month with no register marked
   shows neither, which is honest rather than pretending they were
   absent. */
function monthsCard(student, months, lifetimePresent, lifetimeEntitled) {
  const shown = [...months].reverse();
  const lifetime = attendancePercent(lifetimePresent, lifetimeEntitled);

  return card(
    `${student.full_name} — month by month`,
    "Tap the percentage again to close this.",
    table(
      [
        { key: "label", label: "Month" },
        { key: "present", label: "Came", align: "num", format: (v, r) => (r.recorded ? v : "—") },
        { key: "absent", label: "Missed", align: "num", format: (v, r) => (r.recorded ? v : "—") },
        { key: "entitled", label: "Classes", align: "num" },
        {
          key: "rate",
          label: "Attendance",
          align: "num",
          format: (v, row) =>
            v === null
              ? el("span", { class: "muted" }, row.recorded ? "—" : "not marked")
              : el("span", { class: `pill ${v >= 75 ? "paid" : "due"}` }, v + "%"),
        },
      ],
      shown
    ),
    el(
      "p",
      { class: "muted", style: "margin-top:12px" },
      lifetime === null
        ? "No classes recorded yet."
        : `Since joining: ${lifetimePresent} of ${lifetimeEntitled} classes, ${lifetime}% overall. ` +
          "Grading opens at 75%."
    )
  );
}
