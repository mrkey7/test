const CACHE_NAME = 'istighosah-static-v22';

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

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE_URLS);
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('istighosah-static-') && key !== CACHE_NAME)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  const isFont = /\/global\/aset\/font\/[^/]+\.woff2$/i.test(url.pathname);

  if (isFont) {
    // Font selalu dibaca dari cache agar pemilihan font juga tersedia offline.
    event.respondWith((async () => {
      const cache = await caches.open(CACHE_NAME);
      const cached = await cache.match(request);
      if (cached) return cached;
      try {
        const response = await fetch(new Request(request, { cache: 'no-store' }));
        if (response.ok) await cache.put(request, response.clone());
        return response;
      } catch {
        return new Response('Font tidak tersedia di cache.', { status: 504 });
      }
    })());
    return;
  }

  // File aplikasi memakai network-first agar pembaruan terbaru segera dipakai;
  // salinan cache menjadi cadangan ketika perangkat offline.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    try {
      // Jangan gunakan HTTP cache browser: setelah Reload Data gagal saat offline,
      // salinan HTTP cache tidak boleh membuat halaman tetap dapat dibuka.
      const response = await fetch(new Request(request, { cache: 'no-store' }));
      if (response.ok) await cache.put(request, response.clone());
      return response;
    } catch {
      const cached = await cache.match(request);
      if (cached) return cached;
      if (request.mode === 'navigate') {
        const home = new URL('./index.html', self.registration.scope).href;
        const fallback = await cache.match(home);
        if (fallback) return fallback;
      }
      return Response.error();
    }
  })());
});


// Reload Data: hapus cache lama lebih dahulu, lalu unduh semua aset langsung
// dari jaringan. Jika satu aset gagal, cache baru dibuang dan tidak ada fallback.
self.addEventListener('message', event => {
  if (event.data?.type !== 'RELOAD_DATA') return;
  const port = event.ports?.[0];
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter(key => key.startsWith('istighosah-static-'))
        .map(key => caches.delete(key)));

      const cache = await caches.open(CACHE_NAME);
      for (const path of PRECACHE_URLS) {
        const url = new URL(path, self.registration.scope).href;
        const response = await fetch(new Request(url, { cache: 'no-store' }));
        if (!response.ok) throw new Error(`Unduhan gagal: ${path} (${response.status})`);
        await cache.put(url, response);
      }
      port?.postMessage({ ok: true });
    } catch (error) {
      const keys = await caches.keys();
      await Promise.all(keys
        .filter(key => key.startsWith('istighosah-static-'))
        .map(key => caches.delete(key)));
      console.error('Reload Data gagal:', error);
      port?.postMessage({ ok: false });
    }
  })());
});
