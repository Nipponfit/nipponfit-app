/* =====================================================================
   THE MESSAGES THE DOJO SENDS PARENTS
   ---------------------------------------------------------------------
   One place for the wording, so the welcome a parent gets is the same
   whoever adds them and whichever screen it is sent from.

   A word on "automatic": WhatsApp does not let a program send a message
   on your behalf without a paid WhatsApp Business account, a verified
   business, a dedicated number and wording Meta approved in advance.
   What this does instead is prepare the message and open WhatsApp with
   it already written to the right parent — you read it and press send.
   It goes from your number, which for a welcome is the point.
   ===================================================================== */

const CFG = window.NIPPONFIT_CONFIG || {};

const HELP = CFG.HELP_PHONE || "9945616005";
const PASSWORD = "nkc2026";

/* The welcome, word for word. Kept here rather than buried in a screen
   so it can be changed in one place. */
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
    guideUrl
      ? `Please follow the 5-step setup guide here:\n${guideUrl}`
      : "Please follow the 5-step setup guide shared below.",
    "",
    "Login Details:",
    "",
    "- Mobile Number: The same 10-digit number registered with us",
    `- Password: "${PASSWORD}"`,
    "",
    "Once you log in, please change your password by going to Account → Change Password.",
    "",
    `If you face any difficulty, feel free to call us at ${HELP}. We'll be happy to help.`,
  ].join("\n");
}

/* A wa.me link that opens WhatsApp with the welcome already written.
   Returns null for anything that is not a ten-digit mobile, so a button
   is never offered for a number it cannot reach. */
export function welcomeLink(digits) {
  const d = String(digits || "").replace(/\D/g, "");
  if (d.length !== 10) return null;
  return `https://wa.me/91${d}?text=${encodeURIComponent(welcomeMessage())}`;
}
