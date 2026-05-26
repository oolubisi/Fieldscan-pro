const CACHE_NAME = 'fieldscan-cache-v2';

// 1. ADD CRITICAL ASSETS TO PREVENT OFFLINE UI BREAKAGE
const urlsToCache = [
  './',
  './index.html',
  './manifest.json',
  './launchericon-192x192.png',
  './launchericon-512x512.png',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap',
  'https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css'
];

self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        return cache.addAll(urlsToCache);
      })
  );
  // 2. FORCE IMMEDIATE ACTIVATION
  self.skipWaiting(); 
});

self.addEventListener('activate', event => {
  const cacheWhitelist = [CACHE_NAME];
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cacheName => {
          if (cacheWhitelist.indexOf(cacheName) === -1) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control of open clients immediately
  );
});

self.addEventListener('fetch', event => {
  // 3. THE POST REQUEST TRAP (CRITICAL)
  // Service Workers CANNOT cache POST requests. Because your app uses POST to 
  // send data to Google Apps Script, we must tell the SW to ignore them entirely.
  if (event.request.method !== 'GET') {
    return;
  }

  // 4. UPGRADE TO STALE-WHILE-REVALIDATE STRATEGY
  event.respondWith(
    caches.match(event.request).then(cachedResponse => {
      
      const fetchPromise = fetch(event.request).then(networkResponse => {
        // Only cache valid responses
        if (networkResponse && networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then(cache => {
            cache.put(event.request, responseToCache);
          });
        }
        return networkResponse;
      }).catch(err => {
        console.log("Network fetch failed, relying on cache.", err);
      });

      // Serve instantly from cache if available, but fetch the network update in the background
      return cachedResponse || fetchPromise;
    })
  );
});
