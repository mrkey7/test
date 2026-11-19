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

    frame.addEventListener('load', () => {
      try {
        frame.contentDocument.addEventListener('pointerdown', closeMenu, true);
      } catch (error) {
        console.warn('Penutupan menu PC dari Android View tidak tersedia:', error);
      }
    });

    const item = document.createElement('label');
    item.className = 'settings-toggle android-view-menu-item';
    item.dataset.settingId = 'androidView';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = false;

    const text = document.createElement('span');
    text.textContent = 'Android View';
    item.append(input, text);
    const advancedSubmenu = panel.querySelector('.settings-advanced-submenu');
    (advancedSubmenu || panel).appendChild(item);

    function setAndroidView(enabled) {
      input.checked = enabled;
      if (enabled) {
        if (!frame.src) frame.src = '../android/an.html';
        document.body.classList.add('android-view-active');
        frame.hidden = false;
        closeMenu();
      } else {
        frame.hidden = true;
        document.body.classList.remove('android-view-active');
      }
    }

    input.addEventListener('change', () => setAndroidView(input.checked));

    // Dipanggil oleh checkbox Android di dalam iframe untuk kembali ke PC.
    window.exitAndroidView = () => setAndroidView(false);
  }

  function setupPCShortcuts(panel) {
    if (panel.querySelector('.settings-shortcut')) return;

    const group = document.createElement('div');
    group.className = 'settings-choice settings-choice--cascade settings-shortcut';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'settings-choice__trigger';
    trigger.textContent = 'Shortcut  ›';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-label', 'Shortcut');

    const submenu = document.createElement('div');
    submenu.className = 'settings-choice__submenu settings-shortcut-submenu';
    submenu.setAttribute('role', 'group');

    const defaults = { menu: false, tatweel: false, font: false };
    const enabled = {};
    const controls = {};

    function addShortcut(id, title, description) {
      let saved = false;
      try { saved = localStorage.getItem(`istighosah-pc-shortcut-${id}`) === 'true'; } catch {}

      const item = document.createElement('label');
      item.className = 'settings-toggle settings-shortcut-option';
      item.style.width = '100%';
      item.style.minWidth = '230px';
      item.style.padding = '8px 12px';
      item.style.whiteSpace = 'normal';

      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = saved;
      input.setAttribute('aria-label', title);
      const text = document.createElement('span');
      text.textContent = title;
      const detail = document.createElement('small');
      detail.textContent = description;
      detail.style.display = 'block';
      detail.style.fontSize = '11px';
      detail.style.opacity = '.7';
      detail.style.marginTop = '3px';

      const words = document.createElement('span');
      words.append(text, detail);
      item.append(input, words);
      submenu.appendChild(item);

      enabled[id] = saved;
      controls[id] = input;
      input.addEventListener('change', () => {
        enabled[id] = input.checked;
        try { localStorage.setItem(`istighosah-pc-shortcut-${id}`, String(input.checked)); } catch {}
      });
    }

    addShortcut('menu', 'Menu', 'Klik dua kali cepat (≤ 300 ms)');
    addShortcut('tatweel', 'Tatwil', 'Klik dua kali dengan jeda (300–900 ms)');
    addShortcut('font', 'Ukuran Font', 'Shift + scroll mouse');

    group.append(trigger, submenu);
    const advanced = panel.querySelector('.settings-advanced');
    panel.insertBefore(group, advanced || panel.firstChild);

    let lastClick = 0;
    let clickTimer = null;
    let popupTimer = null;

    function showShortcutNotice(message) {
      let popup = document.getElementById('pc-shortcut-popup');
      if (!popup) {
        popup = document.createElement('div');
        popup.id = 'pc-shortcut-popup';
        Object.assign(popup.style, {
          position: 'fixed', left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)', zIndex: '99999',
          padding: '9px 15px', borderRadius: '8px',
          background: 'var(--menu-bg)', color: 'var(--menu-fg)',
          border: '1px solid var(--menu-border)',
          boxShadow: '0 3px 14px #0004',
          font: '600 15px Arial, sans-serif',
          pointerEvents: 'none', opacity: '0',
          transition: 'opacity .12s ease'
        });
        document.body.appendChild(popup);
      }
      popup.textContent = message;
      popup.style.opacity = '1';
      clearTimeout(popupTimer);
      popupTimer = setTimeout(() => { popup.style.opacity = '0'; }, 850);
    }

    function toggleTatweel() {
      const input = panel.querySelector('[data-setting-id="tatweel"] input[type="checkbox"]');
      if (!input) return;
      input.checked = !input.checked;
      input.dispatchEvent(new Event('change', { bubbles: true }));
      showShortcutNotice(`Tatwil ${input.checked ? 'On' : 'Off'}`);
    }

    document.addEventListener('click', event => {
      const target = event.target instanceof Element ? event.target : event.target.parentElement;
      if (!target?.closest('.frame') || target.closest('.menu')) {
        lastClick = 0;
        clearTimeout(clickTimer);
        return;
      }

      const now = Date.now();
      if (!lastClick) {
        lastClick = now;
        clearTimeout(clickTimer);
        clickTimer = setTimeout(() => { lastClick = 0; }, 900);
        return;
      }

      const elapsed = now - lastClick;
      lastClick = 0;
      clearTimeout(clickTimer);

      if (elapsed <= 300 && enabled.menu) {
        event.preventDefault();
        event.stopPropagation();
        panel.hidden = false;
        document.querySelector('.menu-trigger')?.setAttribute('aria-expanded', 'true');
      } else if (elapsed > 300 && elapsed <= 900 && enabled.tatweel) {
        event.preventDefault();
        event.stopPropagation();
        toggleTatweel();
      }
    }, true);

    document.addEventListener('dblclick', event => {
      const target = event.target instanceof Element ? event.target : event.target.parentElement;
      if (target?.closest('.frame') && !target.closest('.menu')
          && (enabled.menu || enabled.tatweel)) event.preventDefault();
    }, true);

    document.addEventListener('wheel', event => {
      if (!enabled.font || !event.shiftKey || !event.deltaY) return;
      const target = event.target instanceof Element ? event.target : event.target.parentElement;
      if (!target?.closest('.frame') || target.closest('.menu')) return;

      const input = panel.querySelector('[data-setting-id="ukuranHuruf"] input[type="range"]');
      if (!input) return;
      event.preventDefault();
      const step = Number(input.step) || 1;
      const direction = event.deltaY < 0 ? 1 : -1;
      const next = Math.min(Number(input.max), Math.max(Number(input.min),
        Number(input.value) + direction * step * 2));
      if (next !== Number(input.value)) {
        input.value = String(next);
        input.dispatchEvent(new Event('input', { bubbles: true }));
        input.dispatchEvent(new Event('change', { bubbles: true }));
      }
      showShortcutNotice(`Ukuran Font: ${input.value}%`);
    }, { capture: true, passive: false });
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

    setupPCShortcuts(menuPanel);
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
