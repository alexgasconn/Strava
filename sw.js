// Service Worker para Strava Dashboard PWA
const CACHE_NAME = 'strava-dashboard-v1';
const urlsToCache = [
    '/',
    '/index.html',
    '/styles/style.css',
    '/js/app/main.js',
    '/js/app/auth.js',
    '/js/app/ui.js',
    '/manifest.json',
    '/icon-sport.svg'
];

// Instalar el service worker
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('Service Worker: Cache abierto');
                // No cachear todo al instalar - solo archivos críticos
                return cache.addAll([
                    '/',
                    '/manifest.json',
                    '/icon-sport.svg'
                ]).catch(err => console.log('Error durante install:', err));
            })
    );
    self.skipWaiting();
});

// Activar el service worker
self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('Service Worker: Borrando cache antiguo:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// Strategynetwork-first: intenta red, sino cach
self.addEventListener('fetch', event => {
    // No cachear peticiones a la API de Strava
    if (event.request.url.includes('api.strava.com')) {
        return event.respondWith(
            fetch(event.request).catch(() => {
                return new Response('Sin conexión - API no disponible', {
                    status: 503,
                    statusText: 'Sin conexión'
                });
            })
        );
    }

    // Para otros recursos: network first, fallback a cache
    event.respondWith(
        fetch(event.request)
            .then(response => {
                // Si es una respuesta válida, guardar en cache
                if (response.status === 200) {
                    const responseToCache = response.clone();
                    caches.open(CACHE_NAME).then(cache => {
                        cache.put(event.request, responseToCache);
                    });
                }
                return response;
            })
            .catch(() => {
                // Si falla la red, intentar cache
                return caches.match(event.request)
                    .then(response => {
                        return response || new Response('Sin conexión', {
                            status: 503,
                            statusText: 'Sin conexión'
                        });
                    });
            })
    );
});
