/* Clock Hub v3.0 — Service Worker (offline-first) */
var CACHE_NAME = "clockhub-v3";
var PRECACHE = [
  "./index.html",
  "./style.css",
  "./main.js",
  "./manifest.json"
];

self.addEventListener("install", function (e) {
  e.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) { return cache.addAll(PRECACHE); })
  );
  self.skipWaiting();
});

self.addEventListener("activate", function (e) {
  e.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.filter(function (k) { return k !== CACHE_NAME; }).map(function (k) { return caches.delete(k); }));
    })
  );
  self.clients.claim();
});

self.addEventListener("fetch", function (e) {
  e.respondWith(
    caches.match(e.request).then(function (cached) {
      if (cached) return cached;
      return fetch(e.request).then(function (res) {
        if (!res || res.status !== 200 || res.type !== "basic") return res;
        var clone = res.clone();
        caches.open(CACHE_NAME).then(function (c) { c.put(e.request, clone); });
        return res;
      }).catch(function () { return cached; });
    })
  );
});
