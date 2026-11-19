// Reload Data memakai cache sementara agar cache aktif tetap aman jika proses gagal.
const RELOAD_MANIFEST_URL = new URL('__istighosah_cache__/manifest.json', self.registration.scope).href;

self.addEventListener('message', event => {
  if (event.data?.type !== 'RELOAD_DATA') return;
  const port = event.ports?.[0];
  const mode = event.data.mode === 'all' ? 'all' : 'needed';

  event.waitUntil((async () => {
    let stagingName = '';
    let activated = false;
    const controller = new AbortController();
    const reloadTimeout = setTimeout(() => controller.abort(), 170000);

    try {
      const files = await getPrecacheFiles(controller.signal);
      const previousName = await getActiveCacheName();
      const cacheKeys = await caches.keys();
      const hasPrevious = cacheKeys.includes(previousName);
      const previous = hasPrevious ? await caches.open(previousName) : null;

      let skipFolders = [];
      let skipExtensions = [];
      if (mode === 'needed') {
        const configUrl = new URL('./app/global/reload/reload.json', self.registration.scope).href;
        const response = await fetch(new Request(configUrl, {
          cache: 'no-store',
          signal: controller.signal
        }));
        if (!response.ok) throw new Error(`Konfigurasi Reload Data gagal dimuat (${response.status}).`);
        const config = await response.json();
        if (Array.isArray(config.skipFolders)) skipFolders = config.skipFolders;
        if (Array.isArray(config.skipExtensions)) skipExtensions = config.skipExtensions;
      }

      function isSkippedPath(path) {
        const normalized = String(path).split('/').filter(Boolean).join('/').toLowerCase();
        if (skipFolders.some(value => {
          const folder = String(value || '').split('/').filter(Boolean).join('/').toLowerCase();
          return folder && (normalized === folder || normalized.startsWith(folder + '/'));
        })) return true;
        return skipExtensions.some(value => {
          let extension = String(value || '').trim().toLowerCase();
          if (!extension) return false;
          if (!extension.startsWith('.')) extension = '.' + extension;
          return normalized.endsWith(extension);
        });
      }

      let oldManifest = null;
      if (previous) {
        const saved = await previous.match(RELOAD_MANIFEST_URL);
        if (saved) {
          try { oldManifest = await saved.json(); } catch {}
        }
      }

      // Jika manifest belum tersedia, pilihan incremental otomatis menjadi unduhan penuh.
      const canCompare = mode === 'needed' && previous && oldManifest && typeof oldManifest === 'object';
      stagingName = `${CACHE_PREFIX}stage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const staging = await caches.open(stagingName);

      // Salin cache lama terlebih dahulu. Cache aktif tidak pernah disentuh selama proses.
      if (previous) {
        for (const request of await previous.keys()) {
          const response = await previous.match(request);
          if (response) await staging.put(request, response);
        }
      }

      const currentUrls = new Set(files.map(file => new URL(file.path, self.registration.scope).href));
      // Singkirkan file yang sudah dihapus dari repository.
      for (const request of await staging.keys()) {
        const url = new URL(request.url);
        const isManagedFile = url.origin === self.location.origin &&
          (url.pathname === new URL('./index.html', self.registration.scope).pathname ||
           url.pathname.startsWith(new URL('./app/', self.registration.scope).pathname));
        if (isManagedFile && !currentUrls.has(request.url)) await staging.delete(request);
      }

      const total = files.length;
      let current = 0;
      let downloaded = 0;
      let ignored = 0;
      const newManifest = {};

      port?.postMessage({ progress: true, current, total, downloaded, ignored, path: '', message: 'Memeriksa perubahan file…' });

      for (const file of files) {
        const url = new URL(file.path, self.registration.scope).href;
        const cached = await staging.match(url);
        const skippedByRule = canCompare && mode === 'needed' && isSkippedPath(file.path) && cached;
        const unchanged = canCompare && oldManifest[file.path] === file.sha && cached;
        const shouldKeep = mode === 'needed' && cached && (skippedByRule || unchanged);

        if (shouldKeep) {
          ignored++;
          newManifest[file.path] = oldManifest[file.path] || file.sha;
          current++;
          port?.postMessage({
            progress: true, current, total, downloaded, ignored,
            path: file.path, status: skippedByRule ? 'Dipertahankan (aturan)' : 'Tidak berubah',
            message: 'File tetap menggunakan cache lokal.'
          });
          continue;
        }

        port?.postMessage({ progress: true, current, total, downloaded, ignored, path: file.path, message: 'Mengunduh file…' });
        const response = await fetch(new Request(url, {
          cache: 'no-store',
          signal: controller.signal
        }));
        if (!response.ok) throw new Error(`Unduhan gagal: ${file.path} (${response.status})`);
        await staging.put(url, response);
        newManifest[file.path] = file.sha;
        current++;
        downloaded++;
        port?.postMessage({
          progress: true, current, total, downloaded, ignored,
          path: file.path, status: 'Diunduh', message: 'File berhasil diperbarui.'
        });
      }

      // Manifest ditulis terakhir dan hanya di cache sementara.
      await staging.put(RELOAD_MANIFEST_URL, new Response(JSON.stringify(newManifest), {
        headers: { 'Content-Type': 'application/json; charset=utf-8' }
      }));

      for (const file of files) {
        const url = new URL(file.path, self.registration.scope).href;
        if (!(await staging.match(url))) throw new Error(`Verifikasi cache gagal: ${file.path}`);
      }

      await setActiveCacheName(stagingName);
      activated = true;

      try {
        const keys = await caches.keys();
        await Promise.all(keys
          .filter(key => key.startsWith(CACHE_PREFIX) && key !== stagingName)
          .map(key => caches.delete(key)));
      } catch (error) {
        console.warn('Cache lama belum berhasil dibersihkan:', error);
      }

      clearTimeout(reloadTimeout);
      port?.postMessage({
        ok: true, total, downloaded, ignored, mode,
        message: mode === 'all'
          ? `Berhasil mengunduh ulang ${downloaded} file.`
          : `Selesai: ${downloaded} file diunduh, ${ignored} file dipertahankan.`
      });
    } catch (error) {
      clearTimeout(reloadTimeout);
      if (stagingName && !activated) await caches.delete(stagingName);
      console.error('Reload Data gagal:', error);
      port?.postMessage({ ok: false, message: 'Reload Data gagal. Cache lama tetap digunakan.' });
    }
  })());
});
