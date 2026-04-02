// Self-destructing service worker: unregisters itself and clears all caches.
// Deployed as a safety net to evict any previously cached PWA content.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', async () => {
  const keys = await caches.keys();
  await Promise.all(keys.map(k => caches.delete(k)));
  const clients = await self.clients.matchAll({ type: 'window' });
  clients.forEach(c => c.navigate(c.url));
  await self.registration.unregister();
});
