const CACHE_PREFIX = 'istighosah-static-';
const META_CACHE = 'istighosah-meta-v1';
const MANIFEST_URL = new URL('./app/sw-main.json', self.registration.scope).href;
const INSTALL_CACHE_NAME = `${CACHE_PREFIX}install-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

function normalizeManifestPath(path) {
  if (typeof path !== 'string') throw new Error('Path file manifest tidak valid.');
  const normalized = path.replace(/\\/g, '/').replace(/^\/+/, '');
  if (!normalized || normalized.split('/').some(part => !part || part === '.' || part === '..')) {
    throw new Error(`Path file manifest tidak valid: ${path}`);
  }
  return normalized;
}

function validateManifest(manifest, allowEmpty = false) {
  if (!manifest || manifest.schema !== 1 || !Array.isArray(manifest.files)
    || (!allowEmpty && !manifest.files.length)) {
    throw new Error('Manifest tidak valid atau belum memiliki daftar file.');
  }
  if (manifest.exclude !== undefined && !Array.isArray(manifest.exclude)) {
    throw new Error('Daftar pengecualian manifest tidak valid.');
  }
  for (const file of manifest.files) {
    if (!file || typeof file.path !== 'string') throw new Error('Ada entri file yang tidak valid di manifest.');
    normalizeManifestPath(file.path);
  }
}

function getTargetUrl(path) {
  const normalized = normalizeManifestPath(path);
  const encodedPath = normalized.split('/').map(encodeURIComponent).join('/');
  return new URL(encodedPath, self.registration.scope).href;
}

function getRawGitHubBase(manifest) {
  if (!manifest?.repository || !manifest?.branch) return null;
  const repository = String(manifest.repository).split('/');
  if (repository.length !== 2 || repository.some(part => !part)) return null;
  return `https://raw.githubusercontent.com/${repository.map(encodeURIComponent).join('/')}/${encodeURIComponent(manifest.branch)}/`;
}

function getFileSourceUrl(file, manifest, runtimeBaseUrl = null) {
  const path = normalizeManifestPath(file.path);
  const targetUrl = getTargetUrl(path);

  if (runtimeBaseUrl) {
    return { targetUrl, sourceUrl: new URL(path.split('/').map(encodeURIComponent).join('/'), runtimeBaseUrl).href };
  }

  const scopeUrl = new URL(self.registration.scope);
  const rawBase = scopeUrl.hostname === 'mrkey7.github.io' ? getRawGitHubBase(manifest) : null;
  if (rawBase) {
    return { targetUrl, sourceUrl: new URL(path.split('/').map(encodeURIComponent).join('/'), rawBase).href };
  }

  return { targetUrl, sourceUrl: targetUrl };
}

async function getActiveCacheName() {
  const meta = await caches.open(META_CACHE);
  const response = await meta.match('active-cache');
  return response ? response.text() : INSTALL_CACHE_NAME;
}

async function fetchAndStoreFile(cache, file, manifest, runtimeBaseUrl = null) {
  const { targetUrl, sourceUrl } = getFileSourceUrl(file, manifest, runtimeBaseUrl);
  const response = await fetch(new Request(sourceUrl, {
    cache: 'no-store',
    mode: sourceUrl === targetUrl ? 'same-origin' : 'cors'
  }));
  if (!response.ok) throw new Error(`Unduhan gagal (${response.status}).`);

  const bytes = await response.clone().arrayBuffer();
  if (file.revision && manifest.source === 'github') {
    const prefix = new TextEncoder().encode(`blob ${bytes.byteLength}\0`);
    const payload = new Uint8Array(prefix.length + bytes.byteLength);
    payload.set(prefix, 0);
    payload.set(new Uint8Array(bytes), prefix.length);
    const digest = await crypto.subtle.digest('SHA-1', payload);
    const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (actual !== file.revision) throw new Error('Verifikasi GitHub gagal: isi file berbeda dari sumber.');
  } else if (file.revision && manifest.source === 'local') {
    const digest = await crypto.subtle.digest('SHA-256', bytes);
    const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    if (actual !== file.revision) throw new Error('Verifikasi SHA-256 gagal: isi file berbeda dari sumber.');
  }

  await cache.put(targetUrl, response);
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    await caches.delete(INSTALL_CACHE_NAME);
    const cache = await caches.open(INSTALL_CACHE_NAME);
    try {
      const manifestResponse = await fetch(new Request(MANIFEST_URL, { cache: 'no-store' }));
      if (!manifestResponse.ok) throw new Error(`Manifest tidak dapat dimuat (${manifestResponse.status}).`);
      const manifest = await manifestResponse.clone().json();
      validateManifest(manifest, true);

      for (const file of manifest.files) {
        await fetchAndStoreFile(cache, file, manifest);
      }

      await cache.put(MANIFEST_URL, new Response(JSON.stringify(manifest), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }));

      const meta = await caches.open(META_CACHE);
      if (manifest.files.length) {
        await meta.put('pending-cache', new Response(INSTALL_CACHE_NAME));
      } else {
        const active = await meta.match('active-cache');
        if (!active) await meta.put('pending-cache', new Response(INSTALL_CACHE_NAME));
      }
      await self.skipWaiting();
    } catch (error) {
      await caches.delete(INSTALL_CACHE_NAME);
      throw error;
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const meta = await caches.open(META_CACHE);
    const pending = await meta.match('pending-cache');
    const savedActive = await meta.match('active-cache');
    const pendingName = pending ? await pending.text() : null;
    const savedActiveName = savedActive ? await savedActive.text() : null;
    let activeName = pendingName || savedActiveName || INSTALL_CACHE_NAME;

    if (!(await caches.has(activeName))) {
      if (savedActiveName && await caches.has(savedActiveName)) {
        activeName = savedActiveName;
      } else {
        throw new Error('Cache aplikasi tidak ditemukan saat aktivasi.');
      }
    }

    await meta.put('active-cache', new Response(activeName));
    await meta.delete('pending-cache');

    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith(CACHE_PREFIX) && key !== activeName)
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
    event.respondWith((async () => {
      const cache = await caches.open(await getActiveCacheName());
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

  event.respondWith((async () => {
    const cache = await caches.open(await getActiveCacheName());
    try {
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

self.addEventListener('message', event => {
  if (event.data?.type !== 'RELOAD_DATA') return;
  const port = event.ports?.[0];

  event.waitUntil((async () => {
    let stagingName;
    let finalName;

    try {
      const manifest = event.data.manifest;
      validateManifest(manifest);

      const oldName = await getActiveCacheName();
      const oldCache = await caches.open(oldName);
      const previousResponse = await oldCache.match(MANIFEST_URL);
      const previousManifest = previousResponse
        ? await previousResponse.json().catch(() => null)
        : null;
      const previousFiles = new Map((previousManifest?.files || [])
        .map(file => [file.path, file.revision]));

      const sameManifest = Boolean(previousManifest)
        && JSON.stringify(previousManifest.exclude || previousManifest.config?.exclude || [])
          === JSON.stringify(manifest.exclude || [])
        && previousManifest.source === manifest.source
        && previousManifest.repository === manifest.repository
        && previousManifest.branch === manifest.branch
        && previousFiles.size === manifest.files.length
        && manifest.files.every(file => previousFiles.get(file.path) === file.revision)
        && (await Promise.all(manifest.files.map(async file =>
          Boolean(await oldCache.match(getTargetUrl(file.path)))
        ))).every(Boolean);

      if (sameManifest) {
        port?.postMessage({
          ok: true,
          updated: 0,
          unchanged: manifest.files.length,
          removed: 0
        });
        return;
      }

      port?.postMessage({
        type: 'progress', stage: 'download',
        message: `Menyiapkan ${manifest.files.length} file…`,
        current: 0, total: manifest.files.length
      });

      const currentUrls = new Set(manifest.files.map(file => getTargetUrl(file.path)));
      const removed = (await oldCache.keys()).filter(request =>
        request.url !== MANIFEST_URL && !currentUrls.has(request.url)
      ).length;

      const stagingId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      stagingName = `istighosah-staging-${stagingId}`;
      finalName = `${CACHE_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const staging = await caches.open(stagingName);
      let updated = 0;
      let unchanged = 0;

      let current = 0;
      for (const file of manifest.files) {
        const path = normalizeManifestPath(file.path);
        const targetUrl = getTargetUrl(path);
        const oldResponse = await oldCache.match(targetUrl);

        try {
          if (previousFiles.get(path) === file.revision && oldResponse) {
            await staging.put(targetUrl, oldResponse);
            unchanged++;
          } else {
            await fetchAndStoreFile(staging, file, manifest, manifest.baseUrl || null);
            updated++;
          }
        } catch (error) {
          throw new Error(`Gagal memproses file "${path}": ${error.message || 'kesalahan unduhan'}`);
        }

        current++;
        port?.postMessage({
          type: 'progress', stage: 'download',
          message: `Memproses ${path}`,
          current, total: manifest.files.length
        });
      }

      port?.postMessage({
        type: 'progress', stage: 'verify',
        message: 'Memverifikasi hasil unduhan…',
        current: manifest.files.length, total: manifest.files.length
      });

      const savedManifest = { ...manifest };
      delete savedManifest.baseUrl;
      await staging.put(MANIFEST_URL, new Response(JSON.stringify(savedManifest), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }));

      const finalCache = await caches.open(finalName);
      for (const request of await staging.keys()) {
        const response = await staging.match(request);
        await finalCache.put(request, response);
      }

      port?.postMessage({
        type: 'progress', stage: 'activate',
        message: 'Mengaktifkan data baru…',
        current: manifest.files.length, total: manifest.files.length
      });

      const meta = await caches.open(META_CACHE);
      await meta.put('active-cache', new Response(finalName));

      const keys = await caches.keys();
      await Promise.all(keys
        .filter(key => key.startsWith(CACHE_PREFIX) && key !== finalName)
        .map(key => caches.delete(key)));
      await caches.delete(stagingName);

      port?.postMessage({ ok: true, updated, unchanged, removed });
    } catch (error) {
      if (stagingName) await caches.delete(stagingName);
      if (finalName) {
        const meta = await caches.open(META_CACHE);
        const active = await meta.match('active-cache');
        const activeName = active ? await active.text() : null;
        if (activeName !== finalName) await caches.delete(finalName);
      }
      console.error('Reload Data gagal:', error);
      port?.postMessage({
        ok: false,
        message: error.message || 'Reload Data gagal. Cache sebelumnya tetap dipertahankan.'
      });
    }
  })());
});
