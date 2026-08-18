/* =====================================================================
   NIPPON FIT — the app shell
   ---------------------------------------------------------------------
   Decides which of the four kinds of person is signed in, and shows them
   the right tabs. Each tab is its own file in js/screens.
   ===================================================================== */

import * as db from "./db.js";
import { el, clear, button, field, input, beltStrip, errorBox, spinner } from "./ui.js";

import { accountScreen } from "./screens/account.js";

const root = document.getElementById("root");
const CFG = window.NIPPONFIT_CONFIG || {};

/* Which tabs each kind of person gets. The first one is what they land
   on. This is the single place roles are defined. */
const TABS = {
  parent: [["child", "My child"], ["account", "Account"]],
  instructor: [["mark", "Mark attendance"], ["pay", "My sessions & pay"], ["account", "Account"]],
  admin: [
    ["students", "Students"], ["mark", "Attendance"], ["report", "Attendance report"],
    ["grading", "Grading"],
    ["medals", "Achievements"], ["fees", "Fees due"], ["payouts", "Instructor pay"],
    ["people", "People"], ["notices", "Notices"], ["account", "Account"],
  ],
  founder: [
    ["board", "Dashboard"], ["students", "Students"], ["mark", "Attendance"],
    ["report", "Attendance report"],
    ["grading", "Grading"], ["medals", "Achievements"], ["fees", "Fees due"],
    ["payouts", "Instructor pay"], ["people", "People"], ["notices", "Notices"],
    ["account", "Account"],
  ],
};

/* Screens are loaded only when first opened, so the app starts fast. */
const SCREENS = {
  account: async () => accountScreen,
  child: async () => (await import("./screens/child.js")).childScreen,
  mark: async () => (await import("./screens/attendance.js")).attendanceScreen,
  pay: async () => (await import("./screens/instructor-pay.js")).instructorPayScreen,
  payouts: async () => (await import("./screens/payouts.js")).payoutsScreen,
  fees: async () => (await import("./screens/fees.js")).feesScreen,
  students: async () => (await import("./screens/students.js")).studentsScreen,
  board: async () => (await import("./screens/dashboard.js")).dashboardScreen,
  report: async () => (await import("./screens/attendance-report.js")).attendanceReportScreen,
  grading: async () => (await import("./screens/grading.js")).gradingScreen,
  medals: async () => (await import("./screens/medals.js")).medalsScreen,
  people: async () => (await import("./screens/people.js")).peopleScreen,
  notices: async () => (await import("./screens/notices.js")).noticesScreen,
};

let me = null;

/* ------------------------------------------------------------------ */
/* Errors, shown rather than swallowed                                 */
/* ------------------------------------------------------------------ */

window.__nfShowError = (message, file, line) => {
  if (document.querySelector(".error-box.fatal")) return;
  const box = el(
    "div",
    { class: "error-box fatal", style: "position:fixed;left:12px;right:12px;bottom:12px;z-index:999" },
    el("strong", {}, "The app hit a problem"),
    el("p", {}, message || "Unknown error"),
    file && el("p", { class: "muted" }, `${file} line ${line}`),
    button("Close", (e) => e.target.closest(".error-box").remove(), "small quiet")
  );
  document.body.append(box);
};

/* ------------------------------------------------------------------ */
/* The logo                                                            */
/*                                                                     */
/* The gold mark rises in, then a shimmer sweeps across it. The shine  */
/* is masked to the shape of the logo in styles.css, so the light      */
/* touches only the letters and never the panel behind them.          */
/* ------------------------------------------------------------------ */

function brandMark({ withSeal = false } = {}) {
  return el(
    "div",
    {},
    el(
      "div",
      { class: "logo-wrap" },
      el("img", { class: "logo", src: "logo.png", alt: "NipponFit — fitness, karate, wellness", width: "300", height: "197" }),
      el("span", { class: "logo-shine", "aria-hidden": "true" })
    ),
    withSeal ? el("img", { class: "seal", src: "seal.png", alt: "Nippon Karate Club", width: "160", height: "182" }) : null
  );
}

/* ------------------------------------------------------------------ */
/* Landing                                                             */
/* ------------------------------------------------------------------ */

function landing() {
  return el(
    "div",
    { class: "screen-centre" },
    el(
      "div",
      { class: "panel" },
      beltStrip(),
      el(
        "div",
        { class: "panel-body" },
        brandMark({ withSeal: true }),
        el("div", { class: "eyebrow" }, "Dojo Manager"),
        el("h1", { class: "headline" }, "One place for the whole dojo"),
        button("Sign in", () => show(login()), "wide"),
        el(
          "div",
          { class: "dojo-strip" },
          el("span", {}, "Active Arena"),
          el("span", {}, "Dravid CSE"),
          el("span", {}, "Koramangala Club")
        )
      )
    )
  );
}

/* ------------------------------------------------------------------ */
/* Sign in                                                             */
/* ------------------------------------------------------------------ */

function login() {
  const contact = input({ name: "contact", inputmode: "tel", autocomplete: "username", autocapitalize: "off", spellcheck: "false" });
  const password = input({ name: "password", type: "password", autocomplete: "current-password" });
  const problem = el("div", {});
  const submit = button("Sign in", trySignIn, "wide");

  async function trySignIn() {
    clear(problem);
    submit.disabled = true;
    submit.textContent = "Signing in…";
    try {
      await db.signIn(contact.value.trim(), password.value);
      await boot();
    } catch (err) {
      problem.append(errorBox(err));
      submit.disabled = false;
      submit.textContent = "Sign in";
    }
  }

  const form = el(
    "form",
    { onSubmit: (e) => { e.preventDefault(); trySignIn(); } },
    field("Mobile number or email", contact),
    field("Password", password),
    problem,
    submit
  );

  return el(
    "div",
    { class: "screen-centre" },
    el(
      "div",
      { class: "panel" },
      beltStrip(),
      el(
        "div",
        { class: "panel-body" },
        brandMark(),
        el("div", { class: "eyebrow" }, "Sign in"),
        form,
        el(
          "p",
          { class: "help" },
          "Use the mobile number you gave the dojo. You can also sign in with your email if we have one for you. ",
          `Forgotten your password? Call ${CFG.HELP_PHONE || "9945616005"} and we will reset it.`
        ),
        button("Back", () => show(landing()), "quiet small")
      )
    )
  );
}

/* ------------------------------------------------------------------ */
/* The signed-in shell                                                 */
/* ------------------------------------------------------------------ */

function appShell(profile) {
  const tabs = TABS[profile.role] || TABS.parent;
  const body = el("div", { class: "content" });
  const tabBar = el("div", { class: "tabs" });

  let current = tabs[0][0];

  async function openTab(key) {
    current = key;
    for (const b of tabBar.children) b.dataset.on = b.dataset.key === key ? "1" : "0";
    clear(body).append(spinner());

    try {
      const load = SCREENS[key];
      if (!load) { clear(body).append(el("p", { class: "empty" }, "That screen is not built yet.")); return; }
      const build = await load();
      clear(body).append(await build({ me: profile, refresh: () => openTab(key) }));
    } catch (err) {
      clear(body).append(errorBox(err));
    }
  }

  for (const [key, label] of tabs) {
    tabBar.append(el("button", { class: "tab", "data-key": key, "data-on": key === current ? "1" : "0", onClick: () => openTab(key) }, label));
  }

  openTab(current);

  return el(
    "div",
    { class: "app" },
    beltStrip(),
    el(
      "div",
      { class: "topbar" },
      el(
        "div",
        {},
        el("div", { class: "topbar-name" }, profile.full_name || "Nippon Fit"),
        el("div", { class: "topbar-role" }, profile.role)
      ),
      button("Sign out", async () => { await db.signOut(); show(landing()); }, "small quiet")
    ),
    tabBar,
    body
  );
}

/* ------------------------------------------------------------------ */
/* Start up                                                            */
/* ------------------------------------------------------------------ */

function show(node) {
  clear(root).append(node);
}

async function boot() {
  if (!db.isConfigured()) {
    show(errorBox(new Error("The app is not connected to the database yet. Check config.js.")));
    return;
  }

  if (!db.signedIn()) { show(landing()); return; }

  show(el("div", { class: "screen-centre" }, spinner("Opening your dojo…")));

  try {
    me = await db.whoAmI();

    if (!me) {
      await db.signOut();
      show(el("div", { class: "screen-centre" }, el("div", { class: "panel" }, el("div", { class: "panel-body" },
        errorBox(new Error("Your account exists but has no profile yet. Please call the dojo.")),
        button("Back", () => show(landing()), "quiet")))));
      return;
    }

    if (!me.active) {
      await db.signOut();
      show(el("div", { class: "screen-centre" }, el("div", { class: "panel" }, el("div", { class: "panel-body" },
        errorBox(new Error("Your account has been switched off. Please call the dojo.")),
        button("Back", () => show(landing()), "quiet")))));
      return;
    }

    show(appShell(me));
  } catch (err) {
    show(el("div", { class: "screen-centre" }, el("div", { class: "panel" }, el("div", { class: "panel-body" },
      errorBox(err),
      button("Start again", async () => { await db.signOut(); show(landing()); }, "quiet")))));
  }
}

boot();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(() => {}));
}
