(() => {
  'use strict';

  const SCRIPT_URL = new URL(document.currentScript.src, location.href);
  const MANIFEST_PATH = 'app/sw-main.json';
  const MANIFEST_URL = new URL('../../sw-main.json', SCRIPT_URL);
  const PROCESS_PAGE = new URL('./r.html', SCRIPT_URL);
  const SERVICE_WORKER_URL = new URL('../../../sw.js', SCRIPT_URL);
  const RETURN_KEY = 'istighosah-reload-return-v1';

  function normalizePath(path) {
    return String(path || '').replace(/\\/g, '/').replace(/^\/+/, '').replace(/^\.\//, '');
  }

  function normalizeExclude(value) {
    if (!Array.isArray(value)) {
      throw new Error('Properti "exclude" tidak ditemukan atau bukan array di app/sw-main.json.');
    }
    return value
      .filter(item => typeof item === 'string' && item.trim())
      .map(item => normalizePath(item.trim()));
  }

  function isExcluded(path, patterns) {
    const normalized = normalizePath(path);

    return patterns.some(raw => {
      const pattern = normalizePath(raw);
      if (!pattern) return false;
      if (pattern.endsWith('/')) return normalized.startsWith(pattern);
      if (pattern.includes('*')) {
        const escaped = pattern.split('*')
          .map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('.*');
        return new RegExp(`^${escaped}$`).test(normalized);
      }
      return normalized === pattern || normalized.startsWith(`${pattern}/`);
    });
  }

  function validatePath(path) {
    const normalized = normalizePath(path);
    if (!normalized || normalized.split('/').some(part => !part || part === '.' || part === '..')) {
      throw new Error(`Path manifest tidak valid: ${path}`);
    }
    return normalized;
  }

  function sameFiles(a, b) {
    const left = (a || []).map(file => [file.path, file.revision]);
    const right = (b || []).map(file => [file.path, file.revision]);
    return JSON.stringify(left) === JSON.stringify(right);
  }

  function makeManifest(files, source, config) {
    files.sort((a, b) => a.path.localeCompare(b.path));
    return {
      schema: 1,
      exclude: config.exclude,
      source,
      generatedAt: new Date().toISOString(),
      repository: config.repository,
      branch: config.branch,
      files
    };
  }

  function report(stage, message, current = 0, total = 0) {
    const detail = { stage, message, current, total };
    window.dispatchEvent(new CustomEvent('istighosah:reload-progress', { detail }));
  }

  async function checkInternet() {
    if (!navigator.onLine) return false;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      await fetch('https://www.google.com/generate_204', {
        mode: 'no-cors',
        cache: 'no-store',
        signal: controller.signal
      });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timeout);
    }
  }

 function isGitHubPages() {
  return location.hostname === 'mrkey7.github.io';
}

  async function readGitHubJson(url, token) {
    const response = await fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28'
      },
      cache: 'no-store'
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.message || `GitHub API gagal (${response.status})`);
      error.stage = 'github';
      throw error;
    }
    return data;
  }

  function decodeGitHubContent(content) {
    const binary = atob(content.replace(/\s/g, ''));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    return new TextDecoder().decode(bytes);
  }

  async function buildGitHubManifest() {
    report('manifest', 'Membaca konfigurasi app/sw-main.json…');
    const configResponse = await fetch(MANIFEST_URL, { cache: 'no-store' });
    if (!configResponse.ok) {
      throw new Error(`Konfigurasi sw-main.json gagal dibaca (${configResponse.status}).`);
    }

    const config = await configResponse.json();
    const repository = String(config.repository || '').trim();
    const branch = String(config.branch || '').trim();
    const exclude = normalizeExclude(config.exclude);

    if (!repository || !/^[^/]+\/[^/]+$/.test(repository)) {
      throw new Error('Properti "repository" di app/sw-main.json tidak valid.');
    }
    if (!branch) {
      throw new Error('Properti "branch" tidak ditemukan di app/sw-main.json.');
    }

    report('manifest', 'Meminta token akses GitHub…');
    const token = window.prompt(
      'Masukkan GitHub Personal Access Token dengan izin Contents: Read and write.\nToken hanya digunakan selama proses ini dan tidak disimpan.'
    );
    if (!token?.trim()) throw new Error('Pembaruan dibatalkan: token GitHub tidak diberikan.');

    const cleanToken = token.trim();
    const api = `https://api.github.com/repos/${repository}`;
    report('manifest', 'Memeriksa daftar file repository…');
    const branchData = await readGitHubJson(
      `${api}/branches/${encodeURIComponent(branch)}`,
      cleanToken
    );
    const treeSha = branchData.commit?.commit?.tree?.sha;
    if (!treeSha) throw new Error('SHA tree branch GitHub tidak ditemukan.');

    const contentUrl = `${api}/contents/${MANIFEST_PATH}?ref=${encodeURIComponent(branch)}`;
    const currentResponse = await fetch(contentUrl, {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${cleanToken}`,
        'X-GitHub-Api-Version': '2022-11-28'
      },
      cache: 'no-store'
    });

    let currentSha = null;
    let currentManifest = null;
    if (currentResponse.ok) {
      const currentFile = await currentResponse.json();
      currentSha = currentFile.sha;
      if (currentFile.content) {
        try {
          currentManifest = JSON.parse(decodeGitHubContent(currentFile.content));
        } catch {
          throw new Error('Isi app/sw-main.json di GitHub bukan JSON yang valid.');
        }
      }
    } else if (currentResponse.status !== 404) {
      const error = await currentResponse.json().catch(() => ({}));
      throw new Error(error.message || `Gagal membaca ${MANIFEST_PATH} (${currentResponse.status})`);
    }

    const treeData = await readGitHubJson(
      `${api}/git/trees/${treeSha}?recursive=1`,
      cleanToken
    );
    if (treeData.truncated) throw new Error('Daftar file repository terpotong oleh GitHub API.');

    const treeFiles = (treeData.tree || [])
      .filter(item => item.type === 'blob')
      .filter(item => !isExcluded(item.path, exclude));

    const files = treeFiles.map(item => ({
      path: normalizePath(item.path),
      revision: item.sha,
      size: item.size ?? null
    }));
    if (!files.length) throw new Error('Tidak ditemukan file setelah menerapkan daftar pengecualian.');

    const manifest = makeManifest(files, 'github', { ...config, repository, branch, exclude });
    const sameMetadata = currentManifest?.repository === repository
      && currentManifest?.branch === branch
      && currentManifest?.source === 'github';
    const sameExclude = Array.isArray(currentManifest?.exclude)
      && JSON.stringify(normalizeExclude(currentManifest.exclude)) === JSON.stringify(exclude);

    if (!(sameFiles(currentManifest?.files, manifest.files) && sameMetadata && sameExclude)) {
      report('manifest', 'Menyimpan daftar file pembaruan ke GitHub…');
      const bytes = new TextEncoder().encode(JSON.stringify(manifest, null, 2) + '\n');
      let binary = '';
      bytes.forEach(byte => { binary += String.fromCharCode(byte); });
      const body = {
        message: 'Update app/sw-main.json',
        content: btoa(binary),
        branch
      };
      if (currentSha) body.sha = currentSha;

      const writeResponse = await fetch(contentUrl.split('?')[0], {
        method: 'PUT',
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${cleanToken}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const result = await writeResponse.json().catch(() => ({}));
      if (!writeResponse.ok) {
        throw new Error(result.message || `Gagal menyimpan manifest (${writeResponse.status})`);
      }
    } else {
      manifest.generatedAt = currentManifest.generatedAt || manifest.generatedAt;
    }

    manifest.baseUrl = `https://raw.githubusercontent.com/${repository}/${encodeURIComponent(branch)}/`;
    return manifest;
  }

  async function hashFile(file) {
    const digest = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
    return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async function readLocalManifest(rootHandle) {
    try {
      const appDirectory = await rootHandle.getDirectoryHandle('app');
      const fileHandle = await appDirectory.getFileHandle('sw-main.json');
      return JSON.parse(await (await fileHandle.getFile()).text());
    } catch (error) {
      if (error.name === 'NotFoundError') return null;
      throw error;
    }
  }

  async function scanLocalDirectory(rootHandle) {
    const previousManifest = await readLocalManifest(rootHandle);
    if (!previousManifest) {
      throw new Error('app/sw-main.json tidak ditemukan di folder proyek yang dipilih.');
    }
    if (!previousManifest.repository || !previousManifest.branch) {
      throw new Error('Properti repository atau branch tidak ditemukan di app/sw-main.json.');
    }
    const exclude = normalizeExclude(previousManifest.exclude);
    const files = [];
    let count = 0;

    async function walk(directory, prefix = '') {
      for await (const [name, handle] of directory.entries()) {
        const path = prefix ? `${prefix}/${name}` : name;
        if (handle.kind === 'directory') {
          if (!isExcluded(`${path}/`, exclude)) await walk(handle, path);
        } else if (!isExcluded(path, exclude)) {
          const file = await handle.getFile();
          files.push({ path, revision: await hashFile(file), size: file.size });
          count++;
          if (count % 10 === 0) report('manifest', `Memindai file lokal (${count})â€¦`, count, 0);
        }
      }
    }

    await walk(rootHandle);
    if (!files.length) throw new Error('Tidak ditemukan file setelah menerapkan daftar pengecualian.');

    const manifest = makeManifest(files, 'local', { ...previousManifest, exclude });
    if (sameFiles(previousManifest?.files, manifest.files)) {
      manifest.generatedAt = previousManifest.generatedAt || manifest.generatedAt;
    }
    return manifest;
  }

  async function saveLocalManifest(rootHandle, manifest) {
    const appDirectory = await rootHandle.getDirectoryHandle('app');
    const fileHandle = await appDirectory.getFileHandle('sw-main.json', { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(JSON.stringify({ ...manifest, baseUrl: undefined }, null, 2) + '\n');
    await writable.close();
  }

  function getReturnUrl() {
    try {
      const requested = new URLSearchParams(location.search).get('return');
      const saved = requested || sessionStorage.getItem(RETURN_KEY);
      if (saved) {
        const url = new URL(saved, location.origin);
        if (url.origin === location.origin) return url.href;
      }
    } catch {}
    return new URL('../../pc/pc.html', SCRIPT_URL).href;
  }

  function setProcessState({ status, detail, progress, showStart, showReturn, startLabel }) {
    const el = id => document.getElementById(id);
    if (el('reload-status')) el('reload-status').textContent = status || '';
    if (el('reload-detail')) el('reload-detail').textContent = detail || '';
    if (el('reload-progress-fill')) el('reload-progress-fill').style.width = `${Math.max(0, Math.min(100, progress || 0))}%`;
    if (el('reload-progress-label')) el('reload-progress-label').textContent = `${Math.max(0, Math.min(100, progress || 0))}%`;
    if (el('reload-start')) {
      el('reload-start').hidden = !showStart;
      el('reload-start').disabled = false;
      el('reload-start').textContent = startLabel || 'Mulai Pembaruan';
    }
    if (el('reload-return')) el('reload-return').hidden = !showReturn;
  }

  async function start(options = {}) {
    const online = await checkInternet();
    if (!online) {
      const message = 'Koneksi internet tidak tersedia. Periksa koneksi Anda, kemudian coba Reload Data kembali.';
      if (typeof options.onNotice === 'function') options.onNotice(message);
      else window.alert(message);
      return false;
    }

    const accepted = window.confirm(
      'Reload Data akan mereset pengaturan ke nilai bawaan, memeriksa daftar file, lalu memperbarui data aplikasi. Lanjutkan?'
    );
    if (!accepted) return false;

    try {
      if (typeof options.onReset === 'function') options.onReset();
      sessionStorage.setItem(RETURN_KEY, location.href);
    } catch (error) {
      console.warn('Persiapan Reload Data:', error);
    }
    const processUrl = new URL(PROCESS_PAGE.href);
    processUrl.searchParams.set('return', location.href);
    location.assign(processUrl.href);
    return true;
  }

  async function runProcess() {
    const startButton = document.getElementById('reload-start');
    setProcessState({
      status: 'Menyiapkan pembaruan…',
      detail: 'Mohon tunggu. Jangan tutup halaman ini.',
      progress: 0,
      showStart: false,
      showReturn: false
    });
    if (startButton) startButton.disabled = true;

    const onProgress = event => {
      const { stage, message, current, total } = event.detail || {};
      const percent = total > 0 ? Math.round((current / total) * 100) : 0;
      const labels = {
        manifest: 'Memeriksa daftar file',
        download: 'Mengunduh data',
        verify: 'Memverifikasi data',
        activate: 'Mengaktifkan data baru'
      };
      setProcessState({
        status: labels[stage] || 'Memproses…',
        detail: message || '',
        progress: stage === 'activate' ? 95 : percent,
        showStart: false,
        showReturn: false
      });
      if (startButton) startButton.disabled = true;
    };
    window.addEventListener('istighosah:reload-progress', onProgress);

    try {
      let manifest;
      if (isGitHubPages()) {
        manifest = await buildGitHubManifest();
      } else {
        if (typeof window.showDirectoryPicker !== 'function') {
          throw new Error('Pemindaian folder lokal memerlukan Chrome atau Edge desktop. Untuk penggunaan ini, buka aplikasi melalui GitHub Pages.');
        }
        report('manifest', 'Pilih folder utama proyek…');
        const rootHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
        manifest = await scanLocalDirectory(rootHandle);
        await saveLocalManifest(rootHandle, manifest);
      }

      report('download', `Menyiapkan ${manifest.files.length} file…`, 0, manifest.files.length);
      if (!('serviceWorker' in navigator)) {
        throw new Error('Browser ini tidak mendukung Service Worker.');
      }
      let registration = await navigator.serviceWorker.getRegistration();
      if (!registration) {
        registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
      }

      let worker = navigator.serviceWorker.controller || registration.active;
      if (!worker) {
        const ready = await navigator.serviceWorker.ready;
        worker = ready.active;
      }
      if (!worker) throw new Error('Service Worker belum aktif.');

      const channel = new MessageChannel();
      let timeout;
      const result = await new Promise((resolve, reject) => {
        timeout = setTimeout(() => {
          channel.port1.close();
          reject(new Error('Proses pembaruan tidak memberikan respons. Periksa koneksi internet dan coba kembali.'));
        }, 180000);
        channel.port1.onmessage = event => {
          const data = event.data || {};
          if (data.type === 'progress') {
            const percent = data.total > 0 ? Math.round((data.current / data.total) * 100) : 0;
            const labels = {
              download: 'Mengunduh data',
              verify: 'Memverifikasi data',
              activate: 'Mengaktifkan data baru'
            };
            setProcessState({
              status: labels[data.stage] || 'Memproses…',
              detail: data.message || '',
              progress: data.stage === 'activate' ? 95 : percent,
              showStart: false,
              showReturn: false
            });
            return;
          }
          clearTimeout(timeout);
          channel.port1.close();
          if (data.ok) resolve(data);
          else reject(new Error(data.message || 'Reload Data gagal.'));
        };
        worker.postMessage({ type: 'RELOAD_DATA', manifest }, [channel.port2]);
      });

      setProcessState({
        status: 'Reload Data berhasil.',
        detail: `${result.updated} file diperbarui, ${result.unchanged} file tidak berubah, ${result.removed} file dihapus.`,
        progress: 100,
        showStart: false,
        showReturn: true
      });
      document.getElementById('reload-status')?.classList.add('is-success');
    } catch (error) {
      console.error('Reload Data gagal:', error);
      setProcessState({
        status: 'Reload Data gagal.',
        detail: error.message || 'Terjadi kesalahan yang tidak diketahui.',
        progress: 0,
        showStart: true,
        showReturn: true,
        startLabel: 'Coba Kembali'
      });
      document.getElementById('reload-status')?.classList.add('is-error');
    } finally {
      window.removeEventListener('istighosah:reload-progress', onProgress);
    }
  }

  function initProcessPage() {
    const returnButton = document.getElementById('reload-return');
    const startButton = document.getElementById('reload-start');

    if (startButton) startButton.addEventListener('click', runProcess);
    if (returnButton) returnButton.addEventListener('click', () => {
      location.assign(getReturnUrl());
    });

    runProcess();
  }

  window.IstighosahReloadData = { start, runProcess };
  if (document.body?.dataset.page === 'reload') initProcessPage();
})();

