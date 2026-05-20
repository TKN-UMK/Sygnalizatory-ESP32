const CACHE_NAME = 'sygnalizatory-v65';

const FILES_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './script.js',
  './toolbox.xml',
  './manifest.json',
  
  './lib/blockly.js',
  './lib/pl.js',
  './lib/javascript_compressed.js',
  
  './icons/bt_connected.png',
  './icons/bt_disconnected.png',
  './icons/fullscreen.png',
  './icons/menu.png',
  './icons/run.png',
  './icons/stop.png',
  './icons/favicon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('Zapisywanie struktury folderów do cache...');
      return cache.addAll(FILES_TO_CACHE);
    })
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});