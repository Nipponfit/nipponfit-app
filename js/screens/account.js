/* =====================================================================
   ACCOUNT — everyone gets this tab
   Change your own password, and add an email address so fee reminders
   can also reach you there.
   ===================================================================== */

import * as db from "../db.js";
import { el, card, field, input, button, errorBox, toast, phoneDigits } from "../ui.js";

export async function accountScreen({ me }) {
  return el("div", {}, whoYouAre(me), changePassword(), yourEmail(me));
}

function whoYouAre(me) {
  const rows = [
    ["Name", me.full_name || "—"],
    ["You sign in with", phoneDigits(me.phone) || me.email || "—"],
    ["Role", me.role],
    me.rank ? ["Rank", me.rank] : null,
  ].filter(Boolean);

  return card(
    "Your account",
    null,
    el(
      "div",
      { class: "table-wrap" },
      el(
        "table",
        { class: "table" },
        el("tbody", {}, ...rows.map(([k, v]) => el("tr", {}, el("th", {}, k), el("td", {}, v))))
      )
    )
  );
}

function changePassword() {
  const next = input({ type: "password", autocomplete: "new-password" });
  const again = input({ type: "password", autocomplete: "new-password" });
  const problem = el("div", {});
  const save = button("Change my password", run, "wide");

  async function run() {
    problem.replaceChildren();

    if (next.value.length < 6) {
      problem.append(errorBox(new Error("Pick a password of at least 6 characters.")));
      return;
    }
    if (next.value !== again.value) {
      problem.append(errorBox(new Error("The two passwords do not match.")));
      return;
    }

    save.disabled = true;
    save.textContent = "Saving…";
    try {
      await db.rpc("change_my_password", { p_new_password: next.value });
      next.value = "";
      again.value = "";
      toast("Password changed. Use it next time you sign in.");
    } catch (err) {
      problem.append(errorBox(err));
    }
    save.disabled = false;
    save.textContent = "Change my password";
  }

  return card(
    "Change your password",
    "If the dojo gave you a starting password, change it to something only you know.",
    field("New password", next),
    field("Type it again", again),
    problem,
    save
  );
}

function yourEmail(me) {
  const address = input({ type: "email", inputmode: "email", autocapitalize: "off", spellcheck: "false", value: me.email && !me.email.endsWith("@phone.nipponfit.com") ? me.email : "" });
  const problem = el("div", {});
  const save = button("Save my email", run);

  async function run() {
    problem.replaceChildren();
    save.disabled = true;
    save.textContent = "Saving…";
    try {
      const message = await db.rpc("set_my_email", { p_email: address.value.trim() });
      toast(typeof message === "string" ? message : "Saved.");
    } catch (err) {
      problem.append(errorBox(err));
    }
    save.disabled = false;
    save.textContent = "Save my email";
  }

  return card(
    "Your email address",
    "Optional. Add it and fee reminders can reach you by email as well as in the app. You will still sign in with your mobile number.",
    field("Email address", address),
    problem,
    save
  );
}
