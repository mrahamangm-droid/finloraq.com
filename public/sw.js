// Finloraq service worker — deliberately minimal.
//
// This app is behind login and shows real financial data, so the SW does
// NOT cache anything dynamic: no API responses, no authenticated HTML
// pages. Caching those would risk showing one signed-in user's stale (or
// worse, another user's) data on a shared device, and accounting data
// that's wrong because it's stale is worse than an app that's briefly
// unreachable. The only jobs here are:
//   1. Make the app installable (PWA install requires a registered SW
//      with a fetch handler on most platforms).
//   2. Precache a tiny app-shell (icons + one offline page) so a failed
//      *navigation* while offline shows a friendly page instead of the
//      browser's default error screen.
// Every other request — pages, API calls, everything — goes straight to
// the network, exactly as if there were no service worker at all.

const CACHE_VERSION = "v1";
const SHELL_CACHE = `finloraq-shell-${CACHE_VERSION}`;
const PRECACHE_URLS = ["/offline.html", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== SHELL_CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only ever intervene for top-level page loads, and only to provide an
  // offline fallback when the network is unreachable. Everything else
  // (API calls, JS/CSS chunks, images, etc.) is untouched pass-through.
  if (request.mode !== "navigate") return;

  event.respondWith(
    fetch(request).catch(() => caches.match("/offline.html").then((res) => res || Response.error()))
  );
});
