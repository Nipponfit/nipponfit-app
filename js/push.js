/* =====================================================================
   NIPPON FIT — registering a phone for reminders
   ---------------------------------------------------------------------
   The browser hands out a "subscription" — an address it will accept
   notifications at, plus two keys. We keep those against the parent, and
   the Edge Function uses them on the 10th.

   No third party is involved and nothing is charged. The phone talks to
   its own maker's service (Google for Android, Apple for iPhone), which
   is free and built in.
   ===================================================================== */

import * as db from "./db.js";

/* Web push needs the key as raw bytes, not text. */
function keyToBytes(base64url) {
  const padded = (base64url + "=".repeat((4 - (base64url.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

const bytesToBase64 = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)));

/* Can this phone receive notifications at all?

   iPhones can, but only from 16.4 onwards AND only once the app has
   been added to the home screen — in Safari itself it is not offered.
   Saying so plainly saves a parent hunting for a button that cannot
   appear. */
export function pushSupport() {
  if (!("serviceWorker" in navigator) || !("PushManager" in window)) {
    const iOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
    const installed = window.matchMedia("(display-mode: standalone)").matches ||
      window.navigator.standalone === true;
    if (iOS && !installed) {
      return {
        ok: false,
        why: "On an iPhone, reminders work once the app is added to the home screen. " +
             "Tap Share, then Add to Home Screen, open it from there, and this will appear.",
      };
    }
    return { ok: false, why: "This browser cannot receive notifications." };
  }
  if (Notification.permission === "denied") {
    return {
      ok: false,
      why: "Notifications are blocked for this site. Allow them in your browser settings, then come back.",
    };
  }
  return { ok: true };
}

/* Is this particular phone already registered? */
export async function currentSubscription() {
  if (!("serviceWorker" in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

/* Ask permission, subscribe, and tell the database. */
export async function subscribe() {
  const support = pushSupport();
  if (!support.ok) throw new Error(support.why);

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    throw new Error("Reminders were not allowed. Nothing has changed.");
  }

  const rows = await db.select("app_settings", { eq: { key: "vapid_public_key" } });
  const key = rows?.[0]?.value;
  if (!key) {
    throw new Error("Reminders are not switched on for the club yet. Tell the dojo.");
  }

  const reg = await navigator.serviceWorker.ready;
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyToBytes(key),
    }));

  const raw = sub.toJSON();
  const message = await db.rpc("save_my_push_subscription", {
    p_endpoint: sub.endpoint,
    p_p256dh: raw.keys.p256dh,
    p_auth: raw.keys.auth,
    p_device: navigator.userAgent.slice(0, 120),
  });

  return typeof message === "string" ? message : "This phone will now receive reminders.";
}

/* Stop reminders on this phone. */
export async function unsubscribe() {
  const sub = await currentSubscription();
  if (!sub) return "This phone was not receiving reminders.";

  await db.rpc("forget_my_push_subscription", { p_endpoint: sub.endpoint });
  await sub.unsubscribe();
  return "This phone will no longer receive reminders.";
}
