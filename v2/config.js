/* =====================================================================
   NIPPON FIT — connection settings

   You only ever edit this one file.

   ---------------------------------------------------------------------
   THE KEY   (Settings -> API Keys)
   ---------------------------------------------------------------------
   On the "Publishable and secret API keys" tab you will see:

       Publishable key
       default   sb_publishable_xXgUL2yQNVyrmpQ7eoDRtQ_LE-0_...   [copy]

   Click the copy icon next to it, and paste it below.

   That is the one you want. Supabase renamed these recently:
   "publishable" is the new name for what used to be called the
   "anon public" key. It is safe in a web page -- Supabase says so on
   that very screen. Your data is protected by the security rules in the
   database, not by hiding this key.

   The old-style key still works if you prefer it. It is on the
   "Legacy anon, service_role API keys" tab and starts with eyJ...

   NEVER paste a SECRET key here. Those are named "sb_secret_..." on the
   new tab, or "service_role" on the legacy tab. They ignore every
   security rule you have built. If one ever ends up somewhere public,
   go straight to Settings -> API Keys and revoke it.

   ---------------------------------------------------------------------
   THE URL
   ---------------------------------------------------------------------
   Already filled in below, taken from your project address. To confirm:
   Settings -> Data API -> Project URL. It should match exactly.
   ===================================================================== */

window.NIPPONFIT_CONFIG = {

  SUPABASE_URL: "https://lriwvzshocnhcpgtdebl.supabase.co",

  SUPABASE_ANON_KEY: "sb_publishable_xXgUL2yQNVyrmpQ7eoDRtQ_LE-0_iqf",

  // The grading form parents open
  GRADING_FORM_URL: "https://form.jotform.com/251281655478061",

  // Shown to parents who need help signing in
  HELP_PHONE: "9945616005",

  // Your UPI ID, e.g. "nipponfit@okhdfcbank" or "9019550423@ybl".
  //
  // Fill this in and the Fees screen shows a one-tap payment link that
  // opens the parent's GPay or PhonePe with the exact amount already in
  // it. This costs nothing at all — no gateway, no percentage, no
  // account to open. You tick "Paid" yourself once the money arrives.
  //
  // Leave it blank and everything else still works.
  // Your other ID, 9945616005@ibl, works too — swap it in if this one
  // ever stops accepting payments.
  UPI_ID: "nipponfit@idfcbank",
};
