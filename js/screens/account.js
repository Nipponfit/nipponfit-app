/* =====================================================================
   ACCOUNT — everyone gets this tab
   Change your own password, and add an email address so fee reminders
   can also reach you there.
   ===================================================================== */

import * as db from "../db.js";
import { pushSupport, currentSubscription, subscribe, unsubscribe } from "../push.js";
import { el, card, field, input, button, fill, errorBox, toast, phoneDigits } from "../ui.js";

export async function accountScreen({ me }) {
  return el("div", {}, whoYouAre(me), reminders(me), changePassword(), yourEmail(me));
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


/* Reminders on this phone.

   A fee reminder is raised on the 10th and shown in the app. This makes
   the phone buzz as well, so a parent does not have to remember to look.
   It costs nothing and involves no third party. */
function reminders(me) {
  const body = el("div", {}, el("p", { class: "muted" }, "Checking this phone\u2026"));

  const support = pushSupport();

  async function draw() {
    if (!support.ok) {
      body.replaceChildren(el("p", { class: "muted" }, support.why));
      return;
    }

    const sub = await currentSubscription();
    const problem = el("div", {});

    const on = button("Send reminders to this phone", async () => {
      problem.replaceChildren();
      on.disabled = true;
      on.textContent = "Asking\u2026";
      try {
        toast(await subscribe());
        draw();
      } catch (err) {
        problem.append(errorBox(err));
        on.disabled = false;
        on.textContent = "Send reminders to this phone";
      }
    }, "wide");

    const off = button("Stop reminders on this phone", async () => {
      problem.replaceChildren();
      off.disabled = true;
      try {
        toast(await unsubscribe());
        draw();
      } catch (err) {
        problem.append(errorBox(err));
      }
      off.disabled = false;
    }, "wide quiet");

    const test = button("Send me a test now", async () => {
      problem.replaceChildren();
      test.disabled = true;
      test.textContent = "Sending\u2026";
      try {
        const message = await db.rpc("send_test_notification");
        toast(typeof message === "string" ? message : "Sent.");
      } catch (err) {
        problem.append(errorBox(err));
      }
      test.disabled = false;
      test.textContent = "Send me a test now";
    }, "small quiet");

    fill(
      body,
      el("p", { style: "margin-top:0" },
         sub
           ? "This phone is set up. You will be told when a fee is due."
           : "Turn this on and your phone will tell you when a fee is due, " +
             "even when the app is closed."),
      sub ? off : on,
      (me.role === "founder" || me.role === "admin") && sub
        ? el("div", { style: "margin-top:10px" }, test)
        : null,
      problem
    );
  }

  draw();

  return card("Reminders", "A fee reminder goes out on the 10th of each month.", body);
}
