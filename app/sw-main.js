const CACHE_NAME = 'istighosah-static-v22';
const CACHE_PREFIX = 'istighosah-static-';
const META_CACHE = 'istighosah-cache-meta-v1';
const ACTIVE_CACHE_KEY = new URL('__istighosah_cache__/active', self.registration?.scope || self.location.href).href;

const GITHUB_TREE_URL = 'https://api.github.com/repos/mrkey7/test/git/trees/main?recursive=1';

// Daftar cache diambil dari seluruh file dalam app/ dan index.html di root.
async function getPrecacheUrls(signal) {
  const response = await fetch(GITHUB_TREE_URL, {
    cache: 'no-store',
    signal
  });
  if (!response.ok) {
    throw new Error(`Gagal mengambil daftar file GitHub (${response.status}).`);
  }

  const data = await response.json();
  if (data.truncated || !Array.isArray(data.tree)) {
    throw new Error('Daftar file GitHub tidak lengkap.');
  }

  const paths = data.tree
    .filter(item => item.type === 'blob' && (
      item.path.startsWith('app/') || item.path === 'index.html'
    ))
    .map(item => item.path);

  if (!paths.includes('index.html') || !paths.some(path => path.startsWith('app/'))) {
    throw new Error('Daftar file app/ atau index.html tidak ditemukan.');
  }

  return paths;
}

async function getActiveCacheName() {
  const meta = await caches.open(META_CACHE);
  const saved = await meta.match(ACTIVE_CACHE_KEY);
  if (saved) {
    const name = (await saved.text()).trim();
    if (name && (await caches.keys()).includes(name)) return name;
  }
  return CACHE_NAME;
}

async function setActiveCacheName(name) {
  const meta = await caches.open(META_CACHE);
  await meta.put(ACTIVE_CACHE_KEY, new Response(name));
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    // Instalasi pertama perlu mengisi cache awal. Pembaruan Service Worker
    // tidak boleh memperbarui atau menghapus data yang sudah tersimpan.
    const keys = await caches.keys();
    const hasExistingData = keys.some(key => key.startsWith(CACHE_PREFIX));
    if (!hasExistingData) {
      const urls = await getPrecacheUrls();
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(urls);
    }
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    // Cache lama dipertahankan. Penghapusan hanya dilakukan setelah Reload Data sukses.
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Operasi normal selalu cache-first dan tidak pernah menghubungi jaringan.
  event.respondWith((async () => {
    const cacheName = await getActiveCacheName();
    const cache = await caches.open(cacheName);
    const cached = await cache.match(request);
    if (cached) return cached;

    if (request.mode === 'navigate') {
      const home = new URL('./index.html', self.registration.scope).href;
      const fallback = await cache.match(home);
      if (fallback) return fallback;
    }

    return new Response('Data tidak ditemukan di cache. Silakan lakukan Reload Data saat online.', {
      status: 504,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  })());
});

// Modul khusus Reload Data.
importScripts('./global/reload/sw-reload.js');
