const CACHE = 'm1s-scanner-v10';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './scanner-boot.js',
  './data/cards.js',
  './data/prices.js',
  './data/visual-index.js',
  './assets/icon.svg',
  './manifest.webmanifest'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isLiveAppScript = url.pathname.endsWith('/app.js') && !url.search;

  if (isLiveAppScript) {
    event.respondWith(
      caches.open(CACHE)
        .then(cache => cache.match('./scanner-boot.js'))
        .then(response => response || fetch('./scanner-boot.js'))
        .then(response => response.text())
        .then(bootSource => new Response(bootSource, {
          headers: { 'Content-Type': 'application/javascript; charset=utf-8' }
        }))
    );
    return;
  }

  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
