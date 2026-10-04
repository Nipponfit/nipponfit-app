/* =====================================================================
   THE MESSAGES THE DOJO SENDS
   ---------------------------------------------------------------------
   One place for the wording, so the welcome a person gets is the same
   whoever adds them and whichever screen it is sent from.

   A word on "automatic": WhatsApp does not let a program send a message
   on your behalf without a paid WhatsApp Business account, a verified
   business, a dedicated number and wording Meta approved in advance.
   What these do instead is prepare the message and open WhatsApp with
   it already written to the right person — you read it and press send.
   It goes from your number, which for a welcome is the point.
   ===================================================================== */

import * as db from "./db.js";
import { el, shortDate } from "./ui.js";

const CFG = window.NIPPONFIT_CONFIG || {};

const HELP = CFG.HELP_PHONE || "9945616005";
const PASSWORD = "nkc2026";

const guideLine = (guideUrl) =>
  guideUrl
    ? "Please follow the 5-step setup guide here:\n" + guideUrl
    : "Please follow the 5-step setup guide shared below.";

/* The sign-off is the same for everyone except the line naming the
   number. A parent is told "the number registered with us" because the
   dojo may hold two for one family; a member of staff is told their
   own, because theirs is the only one. */
const signOff = (numberLine) => [
  "Login Details:",
  "",
  "- Mobile Number: " + numberLine,
  '- Password: "' + PASSWORD + '"',
  "",
  "Once you log in, please change your password by going to Account → Change Password.",
];

/* The welcome for a parent, word for word as she wrote it. */
export function welcomeMessage({ guideUrl = CFG.GUIDE_URL || "" } = {}) {
  return [
    "Hi, Welcome to Nippon Karate Club!",
    "",
    "Nippon Karate Club App is now live!",
    "",
    "You can now easily track your child's:",
    "",
    "- Belt progress",
    "- Monthly attendance",
    "- Fee status",
    "- Grading records",
    "- Medals and achievements",
    "",
    "Setting it up takes just 2 minutes, and there's no need to download anything from the App Store.",
    "",
    guideLine(guideUrl),
    "",
    ...signOff("The same 10-digit number registered with us"),
    "",
    "If you face any difficulty, feel free to call us at " + HELP + ". We'll be happy to help.",
  ].join("\n");
}

/* The welcome for staff — an admin or an instructor.

   The parent wording is all about tracking your child, which reads
   oddly for somebody who has just been given the keys to the dojo.
   Same guide, same password, different first half. */
export function staffWelcomeMessage(name, role = "admin", { guideUrl = CFG.GUIDE_URL || "", mobile = "" } = {}) {
  const first = String(name || "").trim().split(/\s+/)[0] || "there";
  const nice = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();

  const canDo =
    role === "instructor"
      ? ["- Mark attendance for your classes",
         "- See the classes you have taught and what you are owed"]
      : ["- Add students and give parents their logins",
         "- Mark attendance and see the attendance report",
         "- Record fees and send fee reminders",
         "- Manage gradings, medals and the timetable"];

  return [
    "Hi " + nice + ", welcome to Nippon Karate Club!",
    "",
    "You have been given " + (role === "instructor" ? "an instructor" : "an admin") +
      " account on the Nippon Karate Club app.",
    "",
    "You can:",
    "",
    ...canDo,
    "",
    "Setting it up takes just 2 minutes, and there's no need to download anything from the App Store.",
    "",
    guideLine(guideUrl),
    "",
    ...signOff(mobile || "the number this message came to"),
    "",
    "Any trouble at all, call " + HELP + ".",
  ].join("\n");
}

const tenDigits = (v) => {
  const d = String(v || "").replace(/\D/g, "");
  return d.length === 10 ? d : null;
};

/* A wa.me link that opens WhatsApp with the welcome already written.
   Returns null for anything that is not a ten-digit mobile, so a button
   is never offered for a number it cannot reach. */
export function welcomeLink(digits) {
  const d = tenDigits(digits);
  return d ? "https://wa.me/91" + d + "?text=" + encodeURIComponent(welcomeMessage()) : null;
}

/* The same, for an admin or an instructor. */
export function staffWelcomeLink(digits, name, role) {
  const d = tenDigits(digits);
  return d
    ? "https://wa.me/91" + d + "?text=" + encodeURIComponent(staffWelcomeMessage(name, role, { mobile: d }))
    : null;
}

/* The right wording for whoever this is, chosen by their role. */
export function welcomeLinkFor(digits, { name, role } = {}) {
  const r = String(role || "").toLowerCase();
  if (r === "instructor") return staffWelcomeLink(digits, name, "instructor");
  if (r === "admin" || r === "founder") return staffWelcomeLink(digits, name, "admin");
  return welcomeLink(digits);
}


/* The control that sends a welcome, wherever it appears.

   One button, one rule: it is offered prominently ONLY to somebody who
   has never been sent one. Anybody already welcomed shows the date and
   a quiet "Send again", because a parent who lost the message or
   changed phone still needs a way — but it should not sit there
   shouting beside fifty families who were done months ago.

   Pressing it records the date. The link is not intercepted, so
   WhatsApp still opens; the note is written in the background. */
export function welcomeControl({ digits, name, role, welcomedAt, label, refresh }) {
  const d = String(digits || "").replace(/\D/g, "");
  const link = welcomeLinkFor(d, { name, role });
  if (!link) return el("span", { class: "muted", style: "font-size:13px" }, "no mobile");

  const remember = () => {
    db.rpc("mark_welcomed", { p_phone: d })
      .then(() => { if (refresh) refresh(); })
      .catch(() => { /* the message still went; the note can wait */ });
  };

  if (!welcomedAt) {
    return el("a", {
      class: "btn small", href: link, target: "_blank", rel: "noopener", onClick: remember,
    }, label || "Send welcome");
  }

  return el(
    "span",
    { style: "white-space:nowrap" },
    el("span", { class: "muted", style: "font-size:13px" }, "welcomed " + shortDate(welcomedAt)),
    el("a", {
      class: "quiet-link", href: link, target: "_blank", rel: "noopener", onClick: remember,
      style: "margin-left:8px;font-size:13px",
    }, "Send again")
  );
}

/* digits -> when they were welcomed, built from logins_status. */
export function welcomedIndex(logins) {
  const map = new Map();
  for (const r of logins || []) {
    const d = String(r.contact || "").replace(/\D/g, "").slice(-10);
    if (d.length === 10) map.set(d, r.welcomed_at || null);
  }
  return map;
}
