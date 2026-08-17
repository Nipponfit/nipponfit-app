/* Nippon Fit — service worker. Makes the app installable and work offline. */
const CACHE = "nipponfit-live-v4";
const ASSETS = ["./", "./index.html", "./manifest.json",
                "./icon-192.png", "./icon-512.png", "./maskable-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network first, fall back to cache, so updates arrive but it still works offline.
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // never cache the database or the settings file
  const u = new URL(e.request.url);
  if (u.hostname.endsWith("supabase.co") || u.pathname.endsWith("config.js")) return;
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
