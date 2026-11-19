const CACHE_NAME = 'istighosah-static-v22';
const CACHE_PREFIX = 'istighosah-static-';
const META_CACHE = 'istighosah-cache-meta-v1';
const ACTIVE_CACHE_KEY = new URL('__istighosah_cache__/active', self.registration?.scope || self.location.href).href;

const PRECACHE_URLS = [
  './index.html',
  './app/manifest.webmanifest',
  './app/android/an.html',
  './app/android/an.css',
  './app/android/an.js',
  './app/pc/pc.html',
  './app/pc/pc.css',
  './app/pc/pc.js',
  './app/global/rules.js',
  './app/global/rules.json',
  './app/global/aset/naskah.json',
  './app/global/aset/basmalah.png',
  './app/global/aset/hasyim-asyari.png',
  './app/global/aset/logo.png',
  './app/global/aset/hasyim-asyari-128.png',
  './app/global/aset/font/TraditionalArabic-Regular.woff2',
  './app/global/aset/font/TraditionalArabic-Bold.woff2',
  './app/global/aset/font/Amiri-Bold.woff2',
  './app/global/aset/font/Amiri-Regular.woff2',
  './app/global/aset/font/NotoNaskhArabic-Bold.woff2',
  './app/global/aset/font/NotoNaskhArabic-Regular.woff2',
  './app/global/aset/font/NotoSansArabic-Bold.woff2',
  './app/global/aset/font/NotoSansArabic-Regular.woff2',
];

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
      const cache = await caches.open(CACHE_NAME);
      await cache.addAll(PRECACHE_URLS);
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

// Reload Data mengunduh ke cache sementara. Cache aktif baru diganti setelah
// seluruh file berhasil diunduh; kegagalan hanya menghapus cache sementara.
self.addEventListener('message', event => {
  if (event.data?.type !== 'RELOAD_DATA') return;
  const port = event.ports?.[0];

  event.waitUntil((async () => {
    let stagingName = '';
    let activated = false;
    const controller = new AbortController();
    const reloadTimeout = setTimeout(() => controller.abort(), 170000);
    try {
      const previousName = await getActiveCacheName();
      stagingName = `${CACHE_PREFIX}stage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const staging = await caches.open(stagingName);
      const total = PRECACHE_URLS.length;
      let current = 0;

      for (const path of PRECACHE_URLS) {
        const url = new URL(path, self.registration.scope).href;
        port?.postMessage({ progress: true, current, total, path, message: 'Mengambil data dari server…' });

        const response = await fetch(new Request(url, { cache: 'no-store', signal: controller.signal }));
        if (!response.ok) throw new Error(`Unduhan gagal: ${path} (${response.status})`);

        await staging.put(url, response);
        current++;
        port?.postMessage({ progress: true, current, total, path, message: 'File berhasil dimuat.' });
      }

      // Pastikan seluruh daftar benar-benar tersedia sebelum mengganti cache aktif.
      for (const path of PRECACHE_URLS) {
        const url = new URL(path, self.registration.scope).href;
        if (!(await staging.match(url))) throw new Error(`Verifikasi cache gagal: ${path}`);
      }

      // Pergantian pointer adalah titik aktivasi cache baru.
      await setActiveCacheName(stagingName);
      activated = true;

      // Kegagalan membersihkan cache lama tidak boleh membatalkan cache baru.
      try {
        const keys = await caches.keys();
        await Promise.all(keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== stagingName)
          .map(key => caches.delete(key)));
      } catch (cleanupError) {
        console.warn('Cache lama belum berhasil dibersihkan:', cleanupError);
      }

      clearTimeout(reloadTimeout);
      port?.postMessage({ ok: true, message: `Berhasil memuat ${current} file.` });
    } catch (error) {
      clearTimeout(reloadTimeout);
      if (stagingName && !activated) await caches.delete(stagingName);
      console.error('Reload Data gagal:', error);
      port?.postMessage({ ok: false, message: 'Reload Data gagal. Cache lama tetap digunakan.' });
    }
  })());
});
