/* =====================================================================
   PEOPLE — founder and admin
   ---------------------------------------------------------------------
   Who can sign in, who cannot yet, and resetting a password when
   somebody forgets theirs. This is the screen that replaces ringing me.
   ===================================================================== */

import * as db from "../db.js";
import { el, card, table, input, button, section, toast, errorBox, empty, phoneDigits, indianMobile } from "../ui.js";

export async function peopleScreen({ refresh }) {
  return el("div", {}, section(() => db.rpc("logins_status"), (rows) => render(rows, refresh), { label: "Checking logins…" }));
}

function render(rows, refresh) {
  const withLogin = rows.filter((r) => r.has_login);
  const without = rows.filter((r) => !r.has_login);

  return el(
    "div",
    {},
    without.length > 0
      ? card(
          "No login yet",
          "These people are on the club list but cannot sign in. Give them one below.",
          table(
            [
              { key: "role", label: "Role" },
              { key: "person", label: "Name" },
              { key: "contact", label: "Mobile", format: phoneDigits },
            ],
            without
          ),
          createAll(without.length, refresh)
        )
      : card("Logins", null, empty("Everyone on the club list can sign in.")),

    addPerson(refresh),
    resetPassword(),

    card(
      `Can sign in (${withLogin.length})`,
      null,
      table(
        [
          { key: "role", label: "Role" },
          { key: "person", label: "Name" },
          { key: "contact", label: "Signs in with", format: phoneDigits },
        ],
        withLogin
      )
    )
  );
}

function createAll(count, refresh) {
  const password = input({ value: "nkc2026" });
  const problem = el("div", {});

  const go = button(
    `Create ${count} login${count === 1 ? "" : "s"}`,
    async () => {
      problem.replaceChildren();
      if (password.value.length < 6) {
        problem.append(errorBox(new Error("The starting password needs at least 6 characters.")));
        return;
      }
      go.disabled = true;
      go.textContent = "Creating…";
      try {
        const result = await db.rpc("admin_create_all_logins", { p_default_password: password.value });
        const made = Array.isArray(result) ? result.filter((r) => r.outcome === "created").length : 0;
        toast(`${made} login${made === 1 ? "" : "s"} created.`);
        refresh();
      } catch (err) {
        problem.append(errorBox(err));
      }
      go.disabled = false;
      go.textContent = `Create ${count} login${count === 1 ? "" : "s"}`;
    },
    "wide"
  );

  return el(
    "div",
    { style: "margin-top:14px" },
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Starting password for all of them"), password),
    el("p", { class: "muted" }, "They change it themselves from the Account tab once they are in."),
    problem,
    go
  );
}

/* Add somebody new — another admin, an instructor, or a parent.
   Two steps in one: they go on the club list, then they get a login.
   Only the founder and admin can reach this screen at all. */
function addPerson(refresh) {
  const name = input({ placeholder: "Their full name" });
  const phone = input({ inputmode: "tel", placeholder: "10-digit mobile number", autocapitalize: "off" });
  const role = el(
    "select",
    { class: "input" },
    el("option", { value: "admin" }, "Admin — can do everything except the Dashboard"),
    el("option", { value: "instructor" }, "Instructor — attendance and their own pay only"),
    el("option", { value: "parent" }, "Parent — their own children only")
  );
  const password = input({ value: "nkc2026", placeholder: "Starting password" });
  const problem = el("div", {});

  const add = button(
    "Add them and create their login",
    async () => {
      problem.replaceChildren();
      const checked = indianMobile(phone.value);

      if (!name.value.trim()) return problem.append(errorBox(new Error("Enter their name.")));
      if (!checked.ok) return problem.append(errorBox(new Error(checked.why)));
      const mobile = checked.digits;
      if (password.value.length < 6) return problem.append(errorBox(new Error("The password needs at least 6 characters.")));

      add.disabled = true;
      add.textContent = "Adding…";
      try {
        // 1 · put them on the club list, or correct the role if already there
        await db.upsert(
          "allowed_users",
          [{ phone: "+91" + mobile, role: role.value, full_name: name.value.trim() }],
          "phone"
        );
        // 2 · give them a login
        const message = await db.rpc("admin_create_login", { p_contact: mobile, p_password: password.value });
        toast(typeof message === "string" ? message : "Added.");
        name.value = "";
        phone.value = "";
        refresh();
      } catch (err) {
        problem.append(errorBox(err));
      }
      add.disabled = false;
      add.textContent = "Add them and create their login";
    },
    "wide"
  );

  return card(
    "Add someone new",
    "Use this to take on another admin or instructor. Tell them the starting password and ask them to change it from their Account tab.",
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Full name"), name),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Mobile number"), phone),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "What they can do"), role),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Starting password"), password),
    problem,
    add
  );
}

function resetPassword() {
  const who = input({ inputmode: "tel", placeholder: "Their mobile number", autocapitalize: "off" });
  const password = input({ placeholder: "Their new password" });
  const problem = el("div", {});

  const go = button(
    "Reset their password",
    async () => {
      problem.replaceChildren();
      if (phoneDigits(who.value).length !== 10) {
        problem.append(errorBox(new Error("Enter their 10-digit mobile number.")));
        return;
      }
      if (password.value.length < 6) {
        problem.append(errorBox(new Error("The new password needs at least 6 characters.")));
        return;
      }
      go.disabled = true;
      go.textContent = "Resetting…";
      try {
        const message = await db.rpc("admin_reset_password", {
          p_contact: phoneDigits(who.value),
          p_new_password: password.value,
        });
        toast(typeof message === "string" ? message : "Password reset.");
        who.value = "";
        password.value = "";
      } catch (err) {
        problem.append(errorBox(err));
      }
      go.disabled = false;
      go.textContent = "Reset their password";
    },
    "wide"
  );

  return card(
    "Somebody forgot their password",
    "Reset it here and tell them the new one. Ask them to change it from their Account tab afterwards.",
    el("label", { class: "field" }, el("span", { class: "field-label" }, "Their mobile number"), who),
    el("label", { class: "field" }, el("span", { class: "field-label" }, "New password"), password),
    problem,
    go
  );
}
