(() => {
  async function init({ panel, createAction, showDialog, showNotice, showHomeTransition }) {
    const response = await fetch('../global/reload/reload.json');
    if (!response.ok) throw new Error(`Konfigurasi Reload Data gagal dimuat (${response.status})`);
    const config = await response.json();

    const reloadButton = createAction(panel, 'Reload Data', 'reloadData', reloadData);
    const info = config.settingInfo || {};
    if (info.nama || info.keterangan) {
      reloadButton.dataset.tooltip = `${info.nama ? info.nama + ' — ' : ''}${info.keterangan || ''}`.trim();
      reloadButton.setAttribute('aria-label', reloadButton.dataset.tooltip);
    }

    function showReloadProgress(detailed = false) {
      document.getElementById('istighosah-dialog')?.remove();

      const overlay = document.createElement('div');
      overlay.id = 'istighosah-dialog';
      overlay.innerHTML = `
        <section class="dialog-card reload-progress-card${detailed ? " reload-progress-card--detailed" : ""}" role="dialog" aria-modal="true" aria-live="polite">
          <p class="dialog-message reload-progress-title">Reload Data sedang berlangsung</p>
          <div class="reload-progress-track"><div class="reload-progress-fill"></div></div>
          <div class="reload-progress-meta"><strong class="reload-progress-status">0%</strong></div>
          <div class="reload-progress-counts"${detailed ? "" : " hidden"}>Total: 0 file · Diunduh: 0 · Diabaikan: 0</div>
          <div class="reload-progress-detail"${detailed ? " hidden" : ""} aria-live="polite">Menyiapkan proses…</div>
          <div class="reload-progress-files"${detailed ? "" : " hidden"} aria-live="polite"></div>
          <button type="button" class="dialog-primary reload-return" disabled>Kembali ke halaman utama</button>
        </section>`;

      if (!document.getElementById('istighosah-reload-progress-style')) {
        const style = document.createElement('style');
        style.id = 'istighosah-reload-progress-style';
        style.textContent = `
          #istighosah-dialog .reload-progress-card { width:min(100%,${detailed ? 680 : 390}px); }
          #istighosah-dialog:has(.reload-progress-card--detailed) {
            place-items:start center;
            overflow-y:auto;
          }
          #istighosah-dialog .reload-progress-card--detailed {
            display:flex;
            flex-direction:column;
            max-height:calc(100dvh - 40px);
          }
          #istighosah-dialog .reload-progress-title { margin:0; font-weight:700; text-align:center; }
          #istighosah-dialog .reload-progress-track { height:9px; margin-top:22px; border-radius:99px; overflow:hidden; background:var(--menu-border,#ddd); }
          #istighosah-dialog .reload-progress-fill { width:0; height:100%; border-radius:inherit; background:var(--control-accent,#2457c5); transition:width .2s ease; }
          #istighosah-dialog .reload-progress-meta { display:flex; justify-content:center; margin-top:10px; color:var(--menu-fg,#222); font:700 13px Arial,sans-serif; }
          #istighosah-dialog .reload-progress-counts { margin-top:9px; color:var(--menu-fg,#222); font:12px Arial,sans-serif; text-align:center; font-variant-numeric:tabular-nums; }
          #istighosah-dialog .reload-progress-detail { margin-top:9px; max-height:92px; overflow:auto; color:var(--menu-muted,#666); font:12px/1.5 Arial,sans-serif; overflow-wrap:anywhere; text-align:left; }
          #istighosah-dialog .reload-progress-files { display:grid; gap:5px; margin-top:10px; min-height:0; flex:1 1 auto; overflow-y:auto; overscroll-behavior:contain; padding:8px; border:1px solid var(--menu-border,#ddd); border-radius:5px; text-align:left; }
          #istighosah-dialog .reload-progress-file { display:grid; grid-template-columns:28px minmax(0,1fr) auto; align-items:start; gap:10px; font:12px/1.4 Arial,sans-serif; }\n          #istighosah-dialog .reload-progress-file-number { color:var(--menu-muted,#666); text-align:right; font-variant-numeric:tabular-nums; }
          #istighosah-dialog .reload-progress-file-name { min-width:0; overflow-wrap:anywhere; color:var(--menu-fg,#222); }
          #istighosah-dialog .reload-progress-file-status { flex:0 0 auto; color:var(--menu-muted,#666); white-space:nowrap; }
          #istighosah-dialog .reload-return { display:block; width:100%; margin-top:22px; }
          #istighosah-dialog .reload-return:disabled { opacity:.45; cursor:default; }
        `;
        document.head.appendChild(style);
      }

      document.body.appendChild(overlay);
      const button = overlay.querySelector('.reload-return');
      const fileList = overlay.querySelector('.reload-progress-files');
      button.addEventListener('click', () => {
        overlay.remove();
        showHomeTransition();
      });

      return {
        update(data) {
          const total = Number(data.total) || 0;
          const current = Number(data.current) || 0;
          const percent = total > 0 ? Math.min(100, Math.round(current / total * 100)) : 0;
          overlay.querySelector('.reload-progress-title').textContent = 'Reload Data sedang berlangsung';
          overlay.querySelector('.reload-progress-status').textContent = `${percent}%`;
          overlay.querySelector('.reload-progress-fill').style.width = `${percent}%`;
          overlay.querySelector('.reload-progress-counts').textContent =
            `Total: ${total} file · Diunduh: ${Number(data.downloaded) || 0} · Diabaikan: ${Number(data.ignored) || 0}`;
          if (detailed && data.path && data.status) {
            const row = document.createElement('div');
            row.className = 'reload-progress-file';
            const number = document.createElement('span');
            number.className = 'reload-progress-file-number';
            number.textContent = String(current);
            const name = document.createElement('span');
            name.className = 'reload-progress-file-name';
            name.textContent = data.path;
            const state = document.createElement('span');
            state.className = 'reload-progress-file-status';
            state.textContent = data.status;
            row.append(number, name, state);
            fileList.appendChild(row);
            fileList.scrollTop = fileList.scrollHeight;
          }
        },
        detail(text) {
          if (!detailed) overlay.querySelector('.reload-progress-detail').textContent = text;
        },
        file() {
          // Daftar file ditambahkan satu kali melalui update() agar nomor,
          // path, dan status selalu berada pada satu baris yang sama.
        },
        finish(ok) {
          overlay.querySelector('.reload-progress-title').textContent = ok ? 'Reload Data berhasil' : 'Reload Data gagal. Data lama tetap digunakan';
          overlay.querySelector('.reload-progress-status').textContent = ok ? '100%' : 'Gagal';
          if (ok) overlay.querySelector('.reload-progress-fill').style.width = '100%';
          button.disabled = false;
        }
      };
    }

    async function reloadData() {
      // Periksa koneksi sebelum konfirmasi dan sebelum menghubungi Service Worker.
      if (!navigator.onLine) {
        showNotice('Reload Data tidak dapat dilanjutkan karena perangkat sedang offline.', 'offline');
        return;
      }

      if (!await showDialog('Reload Data akan mengambil seluruh data dari server. Cache lama tetap aman jika proses gagal. Lanjutkan?', true)) return;

      const registration = await navigator.serviceWorker?.getRegistration('../');
      const worker = navigator.serviceWorker?.controller || registration?.active;
      if (!worker) {
        showNotice('Service Worker belum aktif. Reload Data tidak dapat dijalankan.');
        return;
      }

      const progress = showReloadProgress(config.reloadDataDetailed === true);
      const channel = new MessageChannel();
      const timeout = setTimeout(() => {
        progress.finish(false);
        channel.port1.close();
      }, 180000);

      channel.port1.onmessage = event => {
        const data = event.data || {};
        if (data.progress) {
          progress.update(data);
          return;
        }
        if (data.detail) {
          progress.detail(data.text || '');
          return;
        }
        if (data.file) {
          progress.file(data.path || '', data.status || '');
          return;
        }
        clearTimeout(timeout);
        if (data.total !== undefined) {
          progress.update({
            current: data.total,
            total: data.total,
            downloaded: data.downloaded,
            ignored: data.ignored
          });
        }
        progress.finish(Boolean(data.ok));
        channel.port1.close();
      };

      worker.postMessage({ type: 'RELOAD_DATA' }, [channel.port2]);
    }

  }

  window.IstighosahReload = { init };
})();
