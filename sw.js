const CACHE_NAME = "xushi-app-v4-20261031";
const ASSETS = [
  "./index.html", "./styles.css", "./app.js", "./manifest.webmanifest",
  "./app-icon-180.png", "./app-icon-192.png", "./app-icon-512.png",
  "./vendor/ical.min.js",
  ...[
    "activity", "bell", "book-open", "calendar-days", "calendar-plus", "chart-pie", "check",
    "chevron-left", "chevron-right", "circle-stop", "coffee", "download", "droplets", "filter",
    "fish", "heart", "layout-dashboard", "list-todo", "menu", "moon", "pause", "pencil",
    "play", "plus", "repeat", "rotate-ccw", "save", "settings", "smile", "square",
    "timer", "trash-2", "upload", "x",
  ].map((name) => `./icons/${name}.svg`),
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(Promise.all([
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key.startsWith("xushi-app-") && key !== CACHE_NAME).map((key) => caches.delete(key)))),
    self.clients.claim(),
  ]));
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;
  if (request.mode === "navigate") {
    event.respondWith(fetch(request).catch(() => caches.match("./index.html")));
    return;
  }
  event.respondWith(caches.match(request).then((cached) => cached || fetch(request).then((response) => {
    if (response.ok) {
      const copy = response.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
    }
    return response;
  })));
});
