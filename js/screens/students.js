/* =====================================================================
   STUDENTS — founder and admin
   ---------------------------------------------------------------------
   The full list, with search, and a panel per student for the things
   you actually change day to day: fee status, and putting someone
   forward for grading.
   ===================================================================== */

import * as db from "../db.js";
import { reference, feeFor, beltFor, siblingsOf } from "../reference.js";
import { el, card, table, input, button, fill, money, shortDate, section, toast, errorBox, empty, phoneDigits } from "../ui.js";

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

  const breakSpan = student.break_from
    ? shortDate(student.break_from) + (student.break_to ? " to " + shortDate(student.break_to) : " onwards")
    : null;

  const facts = [
    ["Status", status],
    breakSpan ? ["Break", breakSpan] : null,
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
    student.grading_eligible && student.grading_date
      ? ["Grading exam", shortDate(student.grading_date)] : null,
  // Some rows above are deliberately null (sibling, discount, exact fee).
  // Check the row exists BEFORE unpacking it, or null throws.
  ].filter((row) => row && row[1]);

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
              gradingDateEditor(student, change),
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
          : putForward(student, change)
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
    el("h3", { style: "font-size:14px;margin:18px 0 0" }, "Joining date"),
    joiningDateEditor(student, change),
    el("h3", { style: "font-size:14px;margin:18px 0 0" }, "Elite squad"),
    eliteToggle(student, ref, addons, refresh),
    el("h3", { style: "font-size:14px;margin:18px 0 0" }, "Next payment"),
    dueDateEditor(student, change),
    el("h3", { style: "font-size:14px;margin:18px 0 0" }, "Change this student's fee"),
    feeEditor(student, fee, change),
    el("h3", { style: "font-size:14px;margin:18px 0 0" }, "Is this student training?"),
    statusEditor(student, change),
    breakDatesEditor(student, change),
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


/* Putting a child forward, with the date of the exam. The parent sees
   the date, so they know what they are filling the form in for. */
function putForward(student, change) {
  const when = input({ type: "date" });
  const go = button("Put forward for grading", async () => {
    go.disabled = true;
    go.textContent = "Saving…";
    await change(
      { grading_eligible: true, grading_date: when.value || null },
      `${student.full_name} put forward. The parent can now open the form.`
    );
    go.disabled = false;
    go.textContent = "Put forward for grading";
  }, "small");

  return el(
    "div",
    {},
    el("label", { class: "field" },
       el("span", { class: "field-label" }, "Date of the grading exam (optional)"), when),
    go
  );
}

/* Changing the exam date after someone is already put forward. */
function gradingDateEditor(student, change) {
  const when = input({ type: "date", value: student.grading_date ? String(student.grading_date).slice(0, 10) : "" });
  const save = button("Save exam date", async () => {
    save.disabled = true;
    save.textContent = "Saving…";
    await change({ grading_date: when.value || null },
                 when.value ? "Grading exam date saved." : "Grading exam date cleared.");
    save.disabled = false;
    save.textContent = "Save exam date";
  }, "small quiet");

  return el(
    "div",
    { style: "margin-bottom:10px" },
    el("label", { class: "field" },
       el("span", { class: "field-label" }, "Date of the grading exam"), when),
    save
  );
}


/* The joining date decides the first register a child appears on, so a
   wrong one either hides them for months or collects absences for weeks
   they were not yet here. */
function joiningDateEditor(student, change) {
  const when = input({ type: "date", value: student.joined_on ? String(student.joined_on).slice(0, 10) : "" });
  const save = button("Save joining date", async () => {
    save.disabled = true;
    save.textContent = "Saving\u2026";
    await change({ joined_on: when.value || null },
                 when.value ? "Joining date saved." : "Joining date cleared.");
    save.disabled = false;
    save.textContent = "Save joining date";
  }, "small");

  return el("div", { style: "margin-top:8px" },
    el("label", { class: "field" },
       el("span", { class: "field-label" }, "First day at the dojo"), when),
    el("p", { class: "muted", style: "margin:-6px 0 10px" },
       "They appear on registers from this date onwards, and never before it."),
    save);
}

/* Dates for a break, so the months before it stay markable.

   Marking someone "on a break" without dates used to remove them from
   every register, including January when they were still training. */
function breakDatesEditor(student, change) {
  const from = input({ type: "date", value: student.break_from ? String(student.break_from).slice(0, 10) : "" });
  const to   = input({ type: "date", value: student.break_to   ? String(student.break_to).slice(0, 10)   : "" });

  const save = button("Save these dates", async () => {
    save.disabled = true;
    save.textContent = "Saving\u2026";
    const today = new Date().toISOString().slice(0, 10);
    const away = from.value && from.value <= today && (!to.value || to.value >= today);
    await change(
      { break_from: from.value || null, break_to: to.value || null, on_break: Boolean(away) },
      from.value ? "Break dates saved." : "Break cleared."
    );
    save.disabled = false;
    save.textContent = "Save these dates";
  }, "small");

  return el("div", { style: "margin-top:12px" },
    el("div", { style: "display:flex;gap:10px" },
      el("label", { class: "field", style: "flex:1" },
         el("span", { class: "field-label" }, "Break from"), from),
      el("label", { class: "field", style: "flex:1" },
         el("span", { class: "field-label" }, "Back on"), to)),
    el("p", { class: "muted", style: "margin:-6px 0 10px" },
       "Leave \u201CBack on\u201D empty if you do not know yet. Attendance before the break " +
       "can still be marked \u2014 those months really happened."),
    save);
}

/* Elite squad is the only opt-in. Everything else about how many
   classes a week a child takes comes from their fee plan, and their
   attendance percentage is judged against that.

   Only children who have opted in appear on the Elite Squad register. */
function eliteToggle(student, ref, addons, refresh) {
  const elite = ref.plans.find(
    (p) => p.dojo_id === student.dojo_id && /elite/i.test(p.label)
  );

  if (!elite) {
    return el("p", { class: "muted" }, "This dojo does not run an Elite squad.");
  }

  const isIn = addons.some((a) => a.student_id === student.id && a.plan_id === elite.id);
  const problem = el("div", {});

  const go = button(
    isIn ? "Take them out of Elite squad" : "Put them in Elite squad",
    async () => {
      problem.replaceChildren();
      go.disabled = true;
      go.textContent = "Saving\u2026";
      try {
        if (isIn) {
          await db.remove("student_addons", { student_id: student.id, plan_id: elite.id });
          toast(`${student.full_name} taken out of Elite squad.`);
        } else {
          await db.insert("student_addons", { student_id: student.id, plan_id: elite.id });
          toast(`${student.full_name} added to Elite squad.`);
        }
        refresh();
      } catch (err) {
        problem.append(errorBox(err));
      }
      go.disabled = false;
    },
    isIn ? "small quiet" : "small"
  );

  return el("div", { style: "margin-top:8px" },
    el("p", { class: "muted" },
       isIn
         ? `In the Elite squad — ${money(elite.fee)} a quarter on top of their plan, and they appear on the Elite Squad register.`
         : `Not in the Elite squad. Adding them costs ${money(elite.fee)} a quarter on top of their plan.`),
    problem,
    go);
}


/* Taking on a new student.

   The ID card number is offered for you — the next free one in the
   AC/23/014 series, worked out by the database rather than remembered.
   The parent goes on the club list at the same time, so a login can be
   made for them on the People tab straight afterwards. */
function addStudent(ref, refresh) {
  const open = el("div", {});
  const problem = el("div", {});

  const name = input({ placeholder: "Child's full name" });
  const card_no = input({ placeholder: "Fetching the next one…" });
  const guardian = input({ placeholder: "Parent or guardian name" });
  const phone = input({ inputmode: "tel", placeholder: "Parent's 10-digit mobile", autocapitalize: "off" });
  const phone2 = input({ inputmode: "tel", placeholder: "Second parent's mobile (optional)", autocapitalize: "off" });
  const email = input({ type: "email", placeholder: "Parent's email (optional)", autocapitalize: "off" });
  const dob = input({ type: "date" });
  const blood = input({ placeholder: "e.g. O+" });
  const joined = input({ type: "date", value: new Date().toISOString().slice(0, 10) });

  const dojo = el("select", { class: "input" },
    ...ref.dojos.filter((d) => d.active !== false).map((d) => el("option", { value: d.id }, d.name)));
  const plan = el("select", { class: "input" });
  const belt = el("select", { class: "input" },
    ...ref.belts.map((b) => el("option", { value: b.id, selected: b.is_start }, `${b.name} (${b.kyu})`)));

  function plansForDojo() {
    const list = ref.plans.filter((p) => p.dojo_id === dojo.value && !p.is_addon && p.active !== false);
    fill(plan, ...(list.length
      ? list.map((p) => el("option", { value: p.id }, `${p.label} — ${money(p.fee)}`))
      : [el("option", { value: "" }, "This dojo has no plans set up")]));
  }
  dojo.addEventListener("change", plansForDojo);
  plansForDojo();

  /* Ask the database for the next card number rather than guessing. */
  db.rpc("next_id_card")
    .then((n) => { if (typeof n === "string") card_no.value = n; })
    .catch(() => { card_no.placeholder = "e.g. AC/23/014-85"; });

  const save = button("Add this student", async () => {
    problem.replaceChildren();

    if (!name.value.trim()) return problem.append(errorBox("Enter the child's name."));
    if (!card_no.value.trim()) return problem.append(errorBox("Enter an ID card number."));
    if (phoneDigits(phone.value).length !== 10) {
      return problem.append(errorBox("Enter the parent's 10-digit mobile number."));
    }

    save.disabled = true;
    save.textContent = "Adding…";
    try {
      const mobile = "+91" + phoneDigits(phone.value);
      const mobile2 = phoneDigits(phone2.value).length === 10 ? "+91" + phoneDigits(phone2.value) : null;

      await db.insert("students", {
        id_card: card_no.value.trim(),
        full_name: name.value.trim().toUpperCase(),
        guardian_name: guardian.value.trim() || null,
        date_of_birth: dob.value || null,
        blood_group: blood.value.trim() || null,
        parent_phone: mobile,
        parent2_phone: mobile2,
        parent_email: email.value.trim().toLowerCase() || null,
        dojo_id: dojo.value,
        plan_id: plan.value || null,
        belt_id: belt.value,
        joined_on: joined.value || null,
      });

      /* Put the parents on the club list so logins can be made. */
      const parents = [{ phone: mobile, role: "parent", full_name: guardian.value.trim() || null }];
      if (mobile2) parents.push({ phone: mobile2, role: "parent", full_name: guardian.value.trim() || null });
      await db.upsert("allowed_users", parents, "phone").catch(() => {});

      toast(`${name.value.trim()} added. Give the parent a login on the People tab.`);
      name.value = ""; guardian.value = ""; phone.value = ""; phone2.value = "";
      email.value = ""; blood.value = ""; dob.value = "";
      refresh();
    } catch (err) {
      problem.append(
        errorBox(
          String(err.message || "").includes("duplicate")
            ? "That ID card number is already used by another student."
            : err
        )
      );
    }
    save.disabled = false;
    save.textContent = "Add this student";
  }, "wide");

  const form = el("div", { style: "display:none" },
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Child's name"), name),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "ID card number"), card_no),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Dojo"), dojo),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Fee plan"), plan),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Belt"), belt),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "First day at the dojo"), joined),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Parent or guardian"), guardian),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Parent's mobile"), phone),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Second parent's mobile"), phone2),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Parent's email"), email),
    el("div", { style: "display:flex;gap:10px" },
      el("label", { class: "field", style: "flex:1" }, el("span", { class: "field-label" }, "Date of birth"), dob),
      el("label", { class: "field", style: "flex:1" }, el("span", { class: "field-label" }, "Blood group"), blood)),
    problem,
    save);

  const toggle = button("Add a new student", () => {
    const showing = form.style.display !== "none";
    form.style.display = showing ? "none" : "block";
    toggle.textContent = showing ? "Add a new student" : "Close";
  }, "wide");

  fill(open, toggle, form);
  return card("New student", "Everything needed to enrol a child. The parent can be given a login straight afterwards.", open);
}
