const CACHE_VERSION = 'bee-workers-v1';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const PAGES_CACHE = `${CACHE_VERSION}-pages`;
const IMAGES_CACHE = `${CACHE_VERSION}-images`;
const PRECACHE_URLS = ['/', '/offline', '/manifest.webmanifest'];

importScripts('https://storage.googleapis.com/workbox-cdn/releases/7.0.0/workbox-sw.js');

self.addEventListener('install', event => {
  event.waitUntil(caches.open(PAGES_CACHE).then(cache => cache.addAll(PRECACHE_URLS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => !key.startsWith(CACHE_VERSION)).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});

const navigationHandler = async ({ request }) => {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) { const cache = await caches.open(PAGES_CACHE); cache.put(request, networkResponse.clone()); }
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request, { ignoreSearch: true });
    if (cachedResponse) return cachedResponse;
    return caches.match('/offline');
  }
};

workbox.routing.registerRoute(new workbox.routing.NavigationRoute(navigationHandler));

workbox.routing.registerRoute(
  ({ request }) => request.destination === 'script' || request.destination === 'style' || request.destination === 'font',
  new workbox.strategies.CacheFirst({ cacheName: STATIC_CACHE, plugins: [new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }), new workbox.expiration.ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 })] })
);

workbox.routing.registerRoute(
  ({ request }) => request.destination === 'image',
  new workbox.strategies.CacheFirst({ cacheName: IMAGES_CACHE, plugins: [new workbox.cacheableResponse.CacheableResponsePlugin({ statuses: [0, 200] }), new workbox.expiration.ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 })] })
);

const applicationQueue = new workbox.backgroundSync.Queue('applications', { maxRetentionTime: 24 * 60 });

self.addEventListener('message', event => {
  if (event.data?.type === 'QUEUE_APPLICATION') {
    const payload = event.data.payload;
    const request = new Request('/api/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), credentials: 'include' });
    applicationQueue.pushRequest({ request });
    self.registration.sync.register('apply-to-shift');
  }
});

self.addEventListener('sync', event => {
  if (event.tag === 'apply-to-shift') event.waitUntil(applicationQueue.replayRequests());
});

self.addEventListener('push', event => {
  let data = { title: 'Bee Workers', body: 'Tienes una nueva notificación.', url: '/' };
  if (event.data) { try { data = { ...data, ...event.data.json() }; } catch (error) { data.body = event.data.text(); } }
  const options = { body: data.body, icon: '/icons/icon-192.png', badge: '/icons/icon-192.png', data: { url: data.url || '/' }, vibrate: [100, 50, 100], tag: data.tag || 'bee-workers-notification', renotify: Boolean(data.tag) };
  event.waitUntil(self.registration.showNotification(data.title, options));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const urlToOpen = event.notification.data?.url || '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(clientList => {
    for (const client of clientList) { if (client.url.includes(urlToOpen) && 'focus' in client) return client.focus(); }
    if (clients.openWindow) return clients.openWindow(urlToOpen);
  }));
});
