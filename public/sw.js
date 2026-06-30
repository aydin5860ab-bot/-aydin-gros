const CACHE = 'aydin-gros-v6';
const OFFLINE_ASSETS = [
  '/pos-mobile.html',
  '/mobile.html',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js',
  'https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js',
];

// Install — cache offline shell
self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(OFFLINE_ASSETS)).then(() => self.skipWaiting())
  );
});

// Activate — remove old caches
self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(k => k !== CACHE).map(k => caches.delete(k))
    )).then(() => self.clients.claim())
  );
});

// Fetch — network first, cache fallback
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);

  // API calls: network only (offline sales handled via IndexedDB)
  if (url.pathname.startsWith('/api/')) return;

  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res && res.status === 200 && e.request.method === 'GET') {
          const clone = res.clone();
          caches.open(CACHE).then(c => c.put(e.request, clone));
        }
        return res;
      })
      .catch(() => caches.match(e.request))
  );
});

// Background sync for offline sales
self.addEventListener('sync', e => {
  if (e.tag === 'sync-pending-sales') {
    e.waitUntil(syncPendingSales());
  }
});

async function syncPendingSales() {
  // Handled by the client-side JS in pos-mobile.html
  const clients = await self.clients.matchAll();
  clients.forEach(c => c.postMessage({ type: 'SYNC_SALES' }));
}
