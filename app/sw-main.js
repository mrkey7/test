// Update marker: reload skipExtensions diagnostics
const CACHE_NAME = 'istighosah-static-v23';
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
      // Jika dokumen aplikasi tidak tersedia, tampilkan halaman pemulihan mandiri.
      const recoveryUrl = new URL('./app/recovery/index.html', self.registration.scope).href;
      const recovery = await cache.match(recoveryUrl);
      if (recovery) {
        // Recovery hanya tampilan sementara; jangan biarkan browser menyimpan
        // respons ini sebagai dokumen navigasi di HTTP Cache.
        const headers = new Headers(recovery.headers);
        headers.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        headers.set('Pragma', 'no-cache');
        headers.set('Expires', '0');
        return new Response(recovery.body, {
          status: recovery.status,
          statusText: recovery.statusText,
          headers
        });
      }

      // Fallback darurat: tetap tampilkan tombol pemulihan jika file recovery ikut hilang.
      return new Response(`<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="theme-color" content="#111827">
<title>Pemulihan Aplikasi Istighosah</title>
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;padding:24px;background:#111827;color:#f9fafb;font:16px/1.5 Arial,sans-serif}
main{width:min(100%,440px);padding:28px;border:1px solid #374151;border-radius:16px;background:#1f2937;text-align:center;box-shadow:0 16px 48px #0005}
.symbol{font-size:42px;margin-bottom:12px}h1{font-size:21px;margin:0 0 12px}p{color:#d1d5db;margin:0 0 20px}
button{width:100%;border:0;border-radius:9px;padding:14px 18px;background:#2563eb;color:white;font-size:16px;font-weight:700;cursor:pointer}
button:disabled{opacity:.55;cursor:wait}#status{min-height:24px;margin-top:16px;font-size:13px;color:#d1d5db}
</style>
</head>
<body>
<main>
<div class="symbol">⚠️</div>
<h1>Data aplikasi tidak lengkap</h1>
<p>Aplikasi tidak dapat dibuka karena sebagian data yang diperlukan tidak tersedia. Hubungkan perangkat ke internet, lalu unduh ulang seluruh data aplikasi.</p>
<button id="reload" type="button">RELOAD DATA</button>
<div id="status" role="status" aria-live="polite">Pemulihan akan mengunduh seluruh file dan mengabaikan aturan skip.</div>
</main>
<script>
(() => {
 const button=document.getElementById('reload');
 const status=document.getElementById('status');
 button.addEventListener('click',async()=>{
  if(!navigator.onLine){status.textContent='Perangkat sedang offline. Hubungkan ke internet terlebih dahulu.';return;}
  const worker=navigator.serviceWorker?.controller;
  if(!worker){status.textContent='Service Worker belum aktif. Muat ulang halaman saat online untuk mencoba kembali.';return;}
  button.disabled=true;
  status.textContent='Menyiapkan pemulihan…';
  const channel=new MessageChannel();
  const timeout=setTimeout(()=>{button.disabled=false;status.textContent='Proses terlalu lama. Periksa koneksi lalu coba kembali.';channel.port1.close();},180000);
  channel.port1.onmessage=event=>{
   const data=event.data||{};
   if(data.progress){status.textContent='Mengunduh '+data.current+' dari '+data.total+' file…';return;}
   if(data.detail){status.textContent=data.text||'Memproses…';return;}
   clearTimeout(timeout);
   channel.port1.close();
   if(data.ok){status.textContent='Pemulihan berhasil. Membuka aplikasi…';setTimeout(()=>location.reload(),500);}
   else{button.disabled=false;status.textContent=data.message||'Pemulihan gagal. Cache lama tetap dipertahankan.';}
  };
  worker.postMessage({type:'RELOAD_DATA_FORCE'},[channel.port2]);
 });
})();
</script>
</body>
</html>`, {
        status: 200,
        headers: {
          'Content-Type': 'text/html; charset=utf-8',
          'Cache-Control': 'no-store, no-cache, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
    }

    return new Response('Data tidak ditemukan di cache. Silakan buka ulang aplikasi untuk pemulihan.', {
      status: 504,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    });
  })());
});

// Modul khusus Reload Data.
importScripts('./app/global/reload/sw-reload.js');
