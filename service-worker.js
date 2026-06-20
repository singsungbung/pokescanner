const CACHE = 'm1s-scanner-v9';
const ASSETS = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './data/cards.js',
  './data/prices.js',
  './data/visual-index.js',
  './assets/icon.svg',
  './manifest.webmanifest'
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
});
self.addEventListener('fetch', event => {
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request)));
});
