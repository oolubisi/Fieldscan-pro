const CACHE_NAME = "fieldscan-v5";
const ASSETS = ["./", "./index.html", "./style.css", "./app.bundle.js", "./manifest.json"];
self.addEventListener("install", e => e.waitUntil(caches.open(CACHE_NAME).then(c => c.addAll(ASSETS))));
self.addEventListener("activate", e => e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => k !== CACHE_NAME && caches.delete(k))))));
self.addEventListener("fetch", e => {
  if (e.request.method !== "GET") return;
  if (e.request.mode === "navigate") { e.respondWith(fetch(e.request).catch(() => caches.match("./index.html"))); return; }
  e.respondWith(caches.match(e.request).then(r => r || fetch(e.request).then(res => { caches.open(CACHE_NAME).then(c => c.put(e.request, res.clone())); return res; })));
});
