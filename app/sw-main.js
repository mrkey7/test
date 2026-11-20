// Update marker: remove recovery navigation fallback
const CACHE_NAME = 'istighosah-static-v23';
const CACHE_PREFIX = 'istighosah-static-';
const META_CACHE = 'istighosah-cache-meta-v1';
const ACTIVE_CACHE_KEY = new URL('__istighosah_cache__/active', self.registration?.scope || self.location.href).href;

const GITHUB_TREE_URL = 'https://api.github.com/repos/mrkey7/test-istighosyah/git/trees/main?recursive=1';

// Daftar cache diambil dari seluruh file dalam app/ dan index.html di root.
async function getPrecacheFiles(signal) {
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

  const files = data.tree
    .filter(item => item.type === 'blob' && (
      item.path.startsWith('app/') || item.path === 'index.html'
    ))
    .map(item => ({ path: item.path, sha: item.sha }));

  if (!files.some(file => file.path === 'index.html') ||
      !files.some(file => file.path.startsWith('app/')) ||
      files.some(file => !file.sha)) {
    throw new Error('Daftar file app/ atau index.html tidak lengkap.');
  }

  return files;
}

async function getPrecacheUrls(signal) {
  return (await getPrecacheFiles(signal)).map(file => file.path);
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

    // Navigasi ke alamat utama dapat berupa "/" sementara file yang diprecache
    // bernama "index.html". Sajikan index.html dari cache untuk alamat root saja.
    if (request.mode === 'navigate') {
      const scopeUrl = new URL(self.registration.scope);
      const isRootNavigation =
        url.pathname.replace(/\/$/, '') === scopeUrl.pathname.replace(/\/$/, '');
      if (isRootNavigation) {
        const indexUrl = new URL('./index.html', self.registration.scope).href;
        const cachedIndex = await cache.match(indexUrl);
        if (cachedIndex) return cachedIndex;
      }
    }

    return new Response('Data tidak ditemukan di cache.', {
      status: 504,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  })());
});

// Modul khusus Reload Data.
importScripts('./app/global/reload/sw-reload.js');
