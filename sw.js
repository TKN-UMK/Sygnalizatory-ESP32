const CACHE_NAME = 'sygnalizatory-v70';

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
  './icons/favicon.png',
  
  './lib/media/1x1.gif',
  './lib/media/click.mp3',
  './lib/media/delete-icon.svg',
  './lib/media/delete.mp3',
  './lib/media/disconnect.mp3',
  './lib/media/dropdown-arrow.svg',
  './lib/media/foldout-icon.svg',
  './lib/media/handclosed.cur',
  './lib/media/handdelete.cur',
  './lib/media/handopen.cur',
  './lib/media/pilcrow.png',
  './lib/media/quote0.png',
  './lib/media/quote1.png',
  './lib/media/resize-handle.svg',
  './lib/media/sprites.png',
  './lib/media/sprites.svg'
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
    caches.match(event.request, { 
      ignoreSearch: true 
    }).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(event.request).catch((err) => {
        console.warn('Brak sieci i brak pliku w cache dla:', event.request.url);
        return new Response('', { status: 404, statusText: 'Offline Network Error' });
      });
    })
  );
});