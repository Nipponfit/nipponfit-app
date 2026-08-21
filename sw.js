/* Nippon Fit — service worker.
   Makes the app installable and usable with a poor signal.

   Network first: you always get the newest version when there is a
   connection, and the last one that worked when there is not. */

const CACHE = "nipponfit-v2-9";

const ASSETS = [
  "./", "./index.html", "./styles.css", "./manifest.json",
  "./js/app.js", "./js/db.js", "./js/ui.js", "./js/reference.js", "./js/jotform.js",
  "./js/screens/account.js", "./js/screens/child.js", "./js/screens/attendance.js",
  "./js/screens/instructor-pay.js", "./js/screens/payouts.js", "./js/screens/fees.js",
  "./js/screens/students.js", "./js/screens/dashboard.js", "./js/screens/grading.js",
  "./js/screens/attendance-report.js", "./js/screens/timetable.js",
  "./logo.png", "./seal.png",
  "./js/screens/medals.js", "./js/screens/people.js", "./js/screens/notices.js",
  "./icon-192.png", "./icon-512.png", "./maskable-512.png",
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then((c) => Promise.allSettled(ASSETS.map((a) => c.add(a))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;

  const url = new URL(e.request.url);
  // Never cache the database or the settings file.
  if (url.hostname.endsWith("supabase.co") || url.pathname.endsWith("config.js")) return;

  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match("./index.html")))
  );
});

/* Fee reminders pushed to the phone. The database raises the reminder;
   this displays it even when the app is closed. */
self.addEventListener("push", (e) => {
  let data = { title: "Nippon Fit", body: "You have a new notice." };
  try { data = { ...data, ...e.data.json() }; } catch {}
  e.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: "./icon-192.png",
      badge: "./icon-192.png",
    })
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  e.waitUntil(clients.openWindow("./"));
});
