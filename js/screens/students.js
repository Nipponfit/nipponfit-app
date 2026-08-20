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

  function draw() {
    const q = search.value.trim().toLowerCase();
    const shown = q
      ? active.filter(
          (s) =>
            s.full_name?.toLowerCase().includes(q) ||
            s.id_card?.toLowerCase().includes(q) ||
            phoneDigits(s.parent_phone).includes(q) ||
            phoneDigits(s.parent2_phone).includes(q)
        )
      : active;

    results.replaceChildren(
      el("p", { class: "muted" }, `${shown.length} of ${active.length} students`),
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
          { key: "fee_state", label: "Fees", format: (s) => el("span", { class: `pill ${s}` }, s) },
        ],
        shown,
        { emptyMessage: "Nobody matches that search." }
      )
    );
  }

  search.addEventListener("input", draw);
  draw();

  return el("div", {}, detail, card("Students", null, el("div", { class: "field" }, search), results));
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

  const facts = [
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
    el("h3", { style: "font-size:14px;margin:18px 0 0" }, "Change this student's fee"),
    feeEditor(student, fee, change),
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
