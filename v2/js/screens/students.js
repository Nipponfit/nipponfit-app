/* =====================================================================
   STUDENTS — founder and admin
   ---------------------------------------------------------------------
   The full list, with search, and a panel per student for the things
   you actually change day to day: fee status, and putting someone
   forward for grading.
   ===================================================================== */

import * as db from "../db.js";
import { reference, feeFor, beltFor, siblingsOf } from "../reference.js";
import { el, card, table, input, button, money, shortDate, section, toast, errorBox, empty, phoneDigits } from "../ui.js";

export async function studentsScreen({ refresh }) {
  return el("div", {}, section(load, (data) => render(data, refresh), { label: "Fetching students…" }));
}

async function load() {
  const [students, ref, addons] = await Promise.all([
    db.select("students", { order: "full_name" }),
    reference(),
    db.select("student_addons"),
  ]);
  return { students, ref, addons };
}

function render({ students, ref, addons }, refresh) {
  const search = input({ placeholder: "Search by name, ID card or mobile", autocapitalize: "off" });
  const results = el("div", {});
  const detail = el("div", {});

  const active = students.filter((s) => s.active !== false);

  /* Former students stay in the database so their history survives.
     They are hidden until you ask for them. */
  const showFormer = el("input", { type: "checkbox" });
  const formerCount = students.length - active.length;

  function draw() {
    const q = search.value.trim().toLowerCase();
    const pool = showFormer.checked ? students : active;
    const shown = q
      ? pool.filter(
          (s) =>
            s.full_name?.toLowerCase().includes(q) ||
            s.id_card?.toLowerCase().includes(q) ||
            phoneDigits(s.parent_phone).includes(q) ||
            phoneDigits(s.parent2_phone).includes(q)
        )
      : pool;

    results.replaceChildren(
      el("p", { class: "muted" }, `${shown.length} of ${pool.length} students`),
      table(
        [
          {
            key: "full_name",
            label: "Student",
            format: (name, row) =>
              el("a", { href: "#", onClick: (e) => { e.preventDefault(); detail.replaceChildren(studentPanel(row, ref, addons, active, refresh)); detail.scrollIntoView({ behavior: "smooth", block: "start" }); } }, name),
          },
          { key: "id_card", label: "ID card" },
          { key: "dojo_id", label: "Dojo", format: (id) => ref.dojoById[id]?.name },
          { key: "belt_id", label: "Belt", format: (id) => ref.beltById[id]?.name },
          {
            key: "fee_state",
            label: "Status",
            format: (state, row) =>
              row.active === false
                ? el("span", { class: "pill" }, "left")
                : row.on_break
                ? el("span", { class: "pill due" }, "on a break")
                : el("span", { class: `pill ${state}` }, state),
          },
          { key: "fee_due_on", label: "Due", format: (v) => (v ? shortDate(v) : "—") },
        ],
        shown,
        { emptyMessage: "Nobody matches that search." }
      )
    );
  }

  search.addEventListener("input", draw);
  showFormer.addEventListener("change", draw);
  draw();

  return el(
    "div",
    {},
    detail,
    card(
      "Students",
      null,
      el("div", { class: "field" }, search),
      formerCount > 0
        ? el(
            "label",
            { style: "display:flex;gap:8px;align-items:center;margin-bottom:12px;font-size:13px" },
            showFormer,
            `Also show ${formerCount} former student${formerCount === 1 ? "" : "s"}`
          )
        : null,
      results
    )
  );
}

function studentPanel(student, ref, addons, allStudents, refresh) {
  const { belt, next } = beltFor(student, ref);
  const dojo = ref.dojoById[student.dojo_id];
  const siblings = siblingsOf(student, allStudents);
  const fee = feeFor(
    student,
    ref,
    addons.filter((a) => a.student_id === student.id).map((a) => a.plan_id),
    { siblings }
  );
  const problem = el("div", {});

  const status =
    student.active === false ? "No longer a student"
    : student.on_break ? "On a break — not billed"
    : "Training";

  const facts = [
    ["Status", status],
    ["ID card", student.id_card],
    ["Dojo", dojo?.name],
    ["Belt", belt ? `${belt.name} (${belt.kyu})` : "Not set"],
    ["Plan", fee.label],
    ["Fee", `${money(fee.total)} ${fee.cycle === "month" ? "monthly" : "quarterly"}${fee.gstApplies ? " incl. GST" : ""}`],
    siblings >= 2 ? ["Family", `${siblings} children training \u2014 \u20B91,000 off each`] : null,
    fee.discount ? ["Extra discount", money(fee.discount) + " off"] : null,
    fee.isOverride ? ["Fee set by hand", money(fee.total)] : null,
    ["Guardian", student.guardian_name],
    ["Parent mobile", phoneDigits(student.parent_phone)],
    ["Second mobile", phoneDigits(student.parent2_phone)],
    ["Date of birth", student.date_of_birth ? shortDate(student.date_of_birth) : null],
    ["Blood group", student.blood_group],
    ["Joined", student.joined_on ? shortDate(student.joined_on) : null],
    ["Fee due", student.fee_due_on ? shortDate(student.fee_due_on) : null],
  ].filter(([, v]) => v);

  async function change(changes, message) {
    problem.replaceChildren();
    try {
      await db.update("students", { id: student.id }, changes);
      toast(message);
      refresh();
    } catch (err) {
      problem.append(errorBox(err));
    }
  }

  const feeButtons = el(
    "div",
    { style: "display:flex;gap:8px;flex-wrap:wrap;margin-top:10px" },
    ...["paid", "due", "overdue"].map((state) =>
      button(
        state === "paid" ? "Mark paid" : state === "due" ? "Mark due" : "Mark overdue",
        () => change({ fee_state: state }, `${student.full_name} marked ${state}.`),
        student.fee_state === state ? "small" : "small quiet"
      )
    )
  );

  const gradingBlock = next
    ? el(
        "div",
        { style: "margin-top:14px" },
        el("p", { class: "muted" }, `Next belt: ${next.name} (${next.kyu})${next.grading_fee ? ` · fee ${money(next.grading_fee)}` : ""}`),
        student.grading_eligible
          ? el(
              "div",
              {},
              el(
                "p",
                {},
                "Put forward. The parent's form button is unlocked" +
                  (student.grading_form_done ? " and their form has been received." : " and we are waiting for their form.")
              ),
              el(
                "div",
                { style: "display:flex;gap:8px;flex-wrap:wrap" },
                !student.grading_form_done
                  ? button("Form received", () => change({ grading_form_done: true }, "Form marked received."), "small")
                  : null,
                student.grading_form_done && !student.grading_fee_paid
                  ? button("Grading fee paid", () => change({ grading_fee_paid: true }, "Grading fee marked paid."), "small")
                  : null,
                button("Withdraw from grading", () => change({ grading_eligible: false, grading_form_done: false, grading_fee_paid: false }, "Withdrawn."), "small quiet")
              )
            )
          : button(
              "Put forward for grading",
              () => change({ grading_eligible: true }, `${student.full_name} put forward. The parent can now open the form.`),
              "small"
            )
      )
    : el("p", { class: "muted", style: "margin-top:14px" }, "Already at the top of the kyu ladder. Dan grading is not set up yet.");

  return card(
    student.full_name,
    student.notes || null,
    el(
      "div",
      { class: "table-wrap" },
      el("table", { class: "table" }, el("tbody", {}, ...facts.map(([k, v]) => el("tr", {}, el("th", {}, k), el("td", {}, v)))))
    ),
    el("h3", { style: "font-size:14px;margin:18px 0 0" }, "Fees"),
    feeButtons,
    el("h3", { style: "font-size:14px;margin:18px 0 0" }, "Next payment"),
    dueDateEditor(student, change),
    el("h3", { style: "font-size:14px;margin:18px 0 0" }, "Change this student's fee"),
    feeEditor(student, fee, change),
    el("h3", { style: "font-size:14px;margin:18px 0 0" }, "Is this student training?"),
    statusEditor(student, change),
    el("h3", { style: "font-size:14px;margin:18px 0 0" }, "Grading"),
    gradingBlock,
    problem
  );
}


/* Let the founder or admin change one student's fee: either take money
   off their normal fee, or set an exact amount that replaces it.
   The sibling discount is worked out automatically and is not touched
   by either of these. */
function feeEditor(student, fee, change) {
  const discount = input({
    type: "number", inputmode: "numeric", min: "0",
    value: student.fee_discount || "", placeholder: "0",
  });
  const exact = input({
    type: "number", inputmode: "numeric", min: "0",
    value: student.fee_override ?? "", placeholder: "leave empty for normal pricing",
  });

  const save = button("Save this fee", async () => {
    save.disabled = true;
    save.textContent = "Saving…";
    await change(
      {
        fee_discount: Number(discount.value) || 0,
        fee_override: exact.value === "" ? null : Number(exact.value),
      },
      `${student.full_name}'s fee updated.`
    );
    save.disabled = false;
    save.textContent = "Save this fee";
  }, "small");

  return el(
    "div",
    { style: "margin-top:8px" },
    el("p", { class: "muted" },
       "They currently pay " + money(fee.total) + " " +
       (fee.cycle === "month" ? "a month" : "a quarter") + "."),
    el("label", { class: "field" },
       el("span", { class: "field-label" }, "Take off (\u20B9)"), discount),
    el("label", { class: "field" },
       el("span", { class: "field-label" }, "Or charge exactly (\u20B9)"), exact),
    el("p", { class: "muted", style: "margin:-6px 0 10px" },
       "An exact amount replaces the plan, every discount and GST. Leave it empty unless you mean it."),
    save
  );
}


/* When their next payment is due. This is the date the fee reminder on
   the 10th and the "days late" figure both work from. */
function dueDateEditor(student, change) {
  const when = input({ type: "date", value: student.fee_due_on ? String(student.fee_due_on).slice(0, 10) : "" });

  const save = button("Save this date", async () => {
    save.disabled = true;
    save.textContent = "Saving…";
    await change(
      { fee_due_on: when.value === "" ? null : when.value },
      when.value ? "Next payment date saved." : "Next payment date cleared."
    );
    save.disabled = false;
    save.textContent = "Save this date";
  }, "small");

  return el(
    "div",
    { style: "margin-top:8px" },
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Next payment due"), when),
    el("p", { class: "muted", style: "margin:-6px 0 10px" },
       "Leave it empty if there is no date set. Nobody on a break is chased, whatever this says."),
    save
  );
}

/* Training, taking a break, or gone. A break stops the fee reminders
   without losing anything; leaving keeps all their history but takes
   them off the roster. Neither ever deletes a record. */
function statusEditor(student, change) {
  const current =
    student.active === false ? "left" : student.on_break ? "break" : "training";

  const choose = (label, key, changes) =>
    button(label, () => change(changes, `${student.full_name}: ${label.toLowerCase()}.`),
           current === key ? "small" : "small quiet");

  return el(
    "div",
    { style: "margin-top:8px" },
    el(
      "div",
      { style: "display:flex;gap:8px;flex-wrap:wrap" },
      choose("Training", "training", { active: true, on_break: false }),
      choose("On a break", "break", { active: true, on_break: true }),
      choose("Left the club", "left", { active: false, on_break: false })
    ),
    el("p", { class: "muted", style: "margin-top:10px" },
       "A student on a break keeps their place and their history, but is not billed and not chased for fees. " +
       "A student who has left disappears from the roster; nothing is deleted, and you can bring them back here at any time.")
  );
}
