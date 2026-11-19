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
      const urls = await getPrecacheUrls(controller.signal);
      stagingName = `${CACHE_PREFIX}stage-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      const staging = await caches.open(stagingName);
      const total = urls.length;
      let current = 0;
      let downloaded = 0;
      let ignored = 0;

      const previous = await caches.open(previousName);
      port?.postMessage({ progress: true, current, total, downloaded, ignored, path: '', message: 'Menyiapkan daftar file…' });

      for (const path of urls) {
        const url = new URL(path, self.registration.scope).href;
        const isAsset = path.includes('/aset/');

        if (isAsset) {
          port?.postMessage({ detail: true, text: `Mempertahankan cache lama: ${path}` });
          const cachedAsset = await previous.match(url);
          if (!cachedAsset) throw new Error(`Aset tidak ditemukan di cache lama: ${path}`);
          await staging.put(url, cachedAsset);
          port?.postMessage({ file: true, path, status: 'Diabaikan' });
          current++;
          ignored++;
          port?.postMessage({ progress: true, current, total, downloaded, ignored, path, status: 'Diabaikan', message: 'Cache lama dipertahankan.' });
          continue;
        }

        port?.postMessage({ progress: true, current, total, path, message: 'Mengambil data dari server…' });
        port?.postMessage({ detail: true, text: `Mengunduh: ${path}` });

        const response = await fetch(new Request(url, { cache: 'no-store', signal: controller.signal }));
        if (!response.ok) throw new Error(`Unduhan gagal: ${path} (${response.status})`);

        await staging.put(url, response);
        port?.postMessage({ file: true, path, status: 'Diunduh' });
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
