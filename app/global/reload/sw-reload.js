// Reload Data mengunduh ke cache sementara. Cache aktif baru diganti setelah
// seluruh file berhasil diunduh dan diverifikasi.
// Pemeriksaan skip rules hanya dilakukan di dalam proses RELOAD_DATA.
self.addEventListener('message', event => {
  if (event.data?.type !== 'RELOAD_DATA') return;
  const port = event.ports?.[0];

  event.waitUntil((async () => {
    let stagingName = '';
    let activated = false;
    const controller = new AbortController();
    const reloadTimeout = setTimeout(() => controller.abort(), 170000);

    try {
      const urls = await getPrecacheUrls(controller.signal);
      const cacheKeys = await caches.keys();
      const previousName = await getActiveCacheName();
      const hasPreviousCache = cacheKeys.includes(previousName);
      const previous = hasPreviousCache ? await caches.open(previousName) : null;

      // Konfigurasi skip dibaca dari cache lama hanya saat cache lama tersedia.
      // Jika cache lama tidak ada, semua file akan diunduh tanpa menerapkan skip.
      let skipRules = [];
      if (previous) {
        const configUrl = new URL('./global/reload/reload.json', self.registration.scope).href;
        const configResponse = await previous.match(configUrl);
        if (configResponse) {
          try {
            const config = await configResponse.json();
            if (Array.isArray(config.skipRules)) skipRules = config.skipRules;
          } catch (error) {
            console.warn('Konfigurasi skip rules tidak dapat dibaca:', error);
          }
        }
      }

      function matchesSkipRule(path) {
        const normalizedPath = String(path).replace(/^\/+/, '');
        const rules = Array.isArray(skipRules) ? skipRules : [];

        // Prioritas pertama: folder. Jika cocok, aturan lain tidak perlu diperiksa.
        const folderRule = rules.find(rule =>
          rule?.type === 'folder' &&
          (Array.isArray(rule.value) ? rule.value : [rule.value]).some(value => {
            const folder = String(value || '').replace(/^\/+|\/+$/g, '');
            return folder && (normalizedPath === folder || normalizedPath.startsWith(folder + '/'));
          })
        );
        if (folderRule) return true;

        const fileRule = rules.find(rule =>
          rule?.type === 'file' &&
          (Array.isArray(rule.value) ? rule.value : [rule.value]).some(value =>
            String(value || '').replace(/^\/+/, '') === normalizedPath
          )
        );
        if (fileRule) return true;

        const extensionRule = rules.find(rule =>
          rule?.type === 'extension' &&
          (Array.isArray(rule.value) ? rule.value : [rule.value]).some(value => {
            const extension = String(value || '').toLowerCase();
            return extension && normalizedPath.toLowerCase().endsWith(extension.startsWith('.') ? extension : '.' + extension);
          })
        );
        return Boolean(extensionRule);
      }

      stagingName = `${CACHE_PREFIX}stage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const staging = await caches.open(stagingName);
      const total = urls.length;
      let current = 0;
      let downloaded = 0;
      let ignored = 0;

      port?.postMessage({ progress: true, current, total, downloaded, ignored, path: '', message: 'Menyiapkan daftar file…' });

      for (const path of urls) {
        const url = new URL(path, self.registration.scope).href;
        const shouldSkip = hasPreviousCache && matchesSkipRule(path);

        // Skip hanya menggunakan cache lama jika file yang dimaksud benar-benar ada.
        // Cache lama yang hilang atau file yang tidak ada tetap akan diunduh.
        if (shouldSkip) {
          const cachedFile = await previous.match(url);
          if (cachedFile) {
            await staging.put(url, cachedFile);
            current++;
            ignored++;
            port?.postMessage({ progress: true, current, total, downloaded, ignored, path, status: 'Dipertahankan', message: 'Menggunakan file dari cache lama.' });
            continue;
          }
        }

        port?.postMessage({ progress: true, current, total, downloaded, ignored, path, message: 'Mengambil data dari server…' });
        port?.postMessage({ detail: true, text: `Mengunduh: ${path}` });

        const response = await fetch(new Request(url, { cache: 'no-store', signal: controller.signal }));
        if (!response.ok) throw new Error(`Unduhan gagal: ${path} (${response.status})`);

        await staging.put(url, response);
        current++;
        downloaded++;
        port?.postMessage({ progress: true, current, total, downloaded, ignored, path, status: 'Diunduh', message: 'File berhasil dimuat.' });
        port?.postMessage({ detail: true, text: `Selesai: ${path}` });
      }

      // Pastikan seluruh daftar benar-benar tersedia sebelum mengganti cache aktif.
      for (const path of urls) {
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
      port?.postMessage({
        ok: true,
        total,
        downloaded,
        ignored,
        message: `Berhasil memuat ${downloaded} file; ${ignored} file dipertahankan dari cache lama.`
      });
    } catch (error) {
      clearTimeout(reloadTimeout);
      if (stagingName && !activated) await caches.delete(stagingName);
      console.error('Reload Data gagal:', error);
      port?.postMessage({ ok: false, message: 'Reload Data gagal. Cache lama tetap digunakan.' });
    }
  })());
});
