(() => {

  function registerOfflineCache() {
    if (!window.isSecureContext || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('../../sw.js').catch(error => {
      console.warn('Cache offline tidak dapat diaktifkan:', error);
    });
  }

  registerOfflineCache();
  function fitOccasionLine(element) {
    if (!element) return;

    // Kembali ke ukuran responsif CSS sebelum menghitung kebutuhan ruang.
    element.style.removeProperty('font-size');
    const style = getComputedStyle(element);
    const baseSize = parseFloat(style.fontSize);
    const padding = parseFloat(style.paddingLeft) + parseFloat(style.paddingRight);
    const availableWidth = element.clientWidth - padding;
    if (!baseSize || availableWidth <= 0) return;

    const range = document.createRange();
    range.selectNodeContents(element);
    const naturalWidth = range.getBoundingClientRect().width;
    if (!naturalWidth) return;

    // Sisakan sedikit ruang agar pembulatan subpiksel tidak memotong teks.
    const scale = Math.min(1, Math.max(0, (availableWidth - 2) / naturalWidth));
    if (scale < 1) element.style.fontSize = `${baseSize * scale}px`;
  }

  function setupOccasionFit(element) {
    if (!element) return;

    let frameId = 0;
    const scheduleFit = () => {
      cancelAnimationFrame(frameId);
      frameId = requestAnimationFrame(() => fitOccasionLine(element));
    };

    scheduleFit();
    window.addEventListener('resize', scheduleFit, { passive: true });

    if ('ResizeObserver' in window && element.parentElement) {
      const observer = new ResizeObserver(scheduleFit);
      observer.observe(element.parentElement);
    }
  }
  function addText(parent, tag, className, text, attributes = {}) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (text !== undefined && text !== null) element.textContent = text;
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    parent.appendChild(element);
    return element;
  }

  function readingContent(reading) {
    if (reading.kind !== 'asmaul-husna') return reading.text || '';
    return [
      reading.intro,
      ...(reading.rows || []).flat(),
      reading.closing
    ].filter(Boolean).join(' ');
  }

  function toArabicDigits(value) {
    return String(value ?? '').replace(/[0-9]/g, digit => '٠١٢٣٤٥٦٧٨٩'[Number(digit)]);
  }

  function renderReading(reading, target) {
    const line = addText(target, 'p', `reading-text${reading.kind === 'asmaul-husna' ? ' reading-asma' : ''}`);
    line.dir = 'rtl';

    const number = reading.number_display || toArabicDigits(reading.number);
    if (number) addText(line, 'span', 'reading-number', `${number})`);

    addText(line, 'span', 'reading-content', readingContent(reading));

    if (reading.repeat !== undefined && reading.repeat !== null && reading.repeat !== '') {
      const repeat = toArabicDigits(reading.repeat);
      addText(line, 'span', 'reading-repeat', `(${repeat}ₓ)`);
    }
  }

  function loadSettings() {
    return new Promise((resolve, reject) => {
      if (window.IstighosahSettings) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = '../global/rules.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Pengaturan global gagal dimuat.'));
      document.head.appendChild(script);
    });
  }

  async function initMenuResponsivePC(panel) {
    if (!panel) return;

    let responsive = {};
    try {
      const response = await fetch('../global/rules.json');
      if (!response.ok) throw new Error(`Konfigurasi menu PC gagal dimuat (${response.status})`);
      const config = await response.json();
      responsive = config.menuResponsifPC || {};
    } catch (error) {
      console.warn('Konfigurasi responsif menu PC menggunakan nilai bawaan:', error);
    }

    const threshold = Number.isFinite(Number(responsive.ambangLebar))
      ? Math.max(1, Number(responsive.ambangLebar)) : 700;
    const normalScale = Number.isFinite(Number(responsive.skalaNormal))
      ? Math.max(0.1, Number(responsive.skalaNormal)) : 1;
    const narrowScale = Number.isFinite(Number(responsive.skalaSempit))
      ? Math.max(0.1, Number(responsive.skalaSempit)) : 0.5;

    const applyScale = () => {
      panel.style.zoom = String(window.innerWidth < threshold ? narrowScale : normalScale);
    };

    applyScale();
    window.addEventListener('resize', applyScale, { passive: true });
  }

  function initAndroidViewMenu(panel) {
    const frame = document.createElement('iframe');
    frame.className = 'android-view-frame';
    frame.title = 'Tampilan Android';
    frame.allow = 'fullscreen';
    frame.hidden = true;
    document.body.appendChild(frame);

    const closeMenu = () => {
      panel.hidden = true;
      document.querySelector('.menu-trigger')?.setAttribute('aria-expanded', 'false');
    };

    // Klik di dalam iframe tetap menutup menu PC, sama seperti klik di halaman PC.
    frame.addEventListener('load', () => {
      try {
        frame.contentDocument.addEventListener('pointerdown', closeMenu, true);
      } catch (error) {
        console.warn('Penutupan menu PC dari Android View tidak tersedia:', error);
      }
    });

    const item = document.createElement('div');
    item.className = 'settings-action android-view-menu-item';
    item.dataset.settingId = 'androidView';
    item.hidden = true;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-action__button';
    button.textContent = 'Android View';
    button.addEventListener('click', () => {
      const showAndroid = frame.hidden;
      if (showAndroid && !frame.src) frame.src = '../android/an.html';
      frame.hidden = !showAndroid;
      button.textContent = showAndroid ? 'PC View' : 'Android View';
      button.setAttribute('aria-label', showAndroid ? 'Kembali ke tampilan PC' : 'Tampilkan Android View');
      closeMenu();
    });

    item.appendChild(button);
    panel.appendChild(item);
  }

  async function init() {
    const response = await fetch('../global/aset/naskah.json');
    if (!response.ok) throw new Error(`Naskah gagal dimuat (${response.status})`);
    const data = await response.json();

    document.title = `${data.title} - Istighosah`;
    document.getElementById('document-title').textContent = data.title || '';
    document.getElementById('document-subtitle').textContent = data.subtitle || '';
    const occasion = document.getElementById('document-occasion');
    occasion.textContent = data.occasion || '';
    setupOccasionFit(occasion);
    document.getElementById('document-opening').alt = data.opening || 'Basmalah';

    const target = document.getElementById('naskah');
    target.replaceChildren();
    for (const reading of data.readings || []) renderReading(reading, target);

    await loadSettings();
    const menuPanel = document.querySelector('#menu-panel');
    menuPanel.classList.add('settings-panel--pc');
    await initMenuResponsivePC(menuPanel);
    await window.IstighosahSettings.init({
      panel: menuPanel,
      readings: target
    });

    initAndroidViewMenu(menuPanel);
  }

  const trigger = document.querySelector('.menu-trigger');
  const panel = document.querySelector('#menu-panel');

  trigger.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    trigger.setAttribute('aria-expanded', String(!panel.hidden));
  });

  document.addEventListener('click', event => {
    if (!event.target.closest('.menu')) {
      panel.hidden = true;
      trigger.setAttribute('aria-expanded', 'false');
    }
  });

  init().catch(error => {
    console.error(error);
    document.getElementById('naskah').textContent = 'Naskah gagal dimuat. Periksa berkas global/aset/naskah.json.';
  });
})();
