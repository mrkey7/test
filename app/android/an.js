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

  let gestureEnabled = true;
  let gestureConfig = {};

  async function loadAndroidMenuGesture() {
    try {
      const response = await fetch('../global/rules.json');
      if (!response.ok) return;
      const config = await response.json();
      gestureConfig = config.gesture || {};
      const saved = localStorage.getItem('istighosah-gesture-enabled');
      gestureEnabled = saved === null
        ? gestureConfig.default !== false
        : saved === 'true';

      // GoogleSearch=false menonaktifkan seleksi teks pada halaman Android.
      if (config.GoogleSearch === false) {
        document.documentElement.style.userSelect = 'none';
        document.documentElement.style.webkitUserSelect = 'none';
        document.documentElement.style.webkitTouchCallout = 'none';
        document.addEventListener('selectstart', event => event.preventDefault());
      }
    } catch (error) {
      console.warn('Konfigurasi gesture Android tidak dapat dimuat.', error);
    }

    document.documentElement.style.touchAction = 'pan-y';
    document.body.style.touchAction = 'pan-y';
  }

  function setupAndroidGestureToggle(menuPanel) {
    if (menuPanel.querySelector('[data-setting-id="gesture"]')) return;

    const group = document.createElement('label');
    group.className = 'settings-toggle';
    group.dataset.settingId = 'gesture';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = gestureEnabled;
    input.setAttribute('aria-label', 'Gesture');

    const text = document.createElement('span');
    text.textContent = 'Gesture';
    group.append(input, text);
    menuPanel.insertBefore(group, menuPanel.firstChild);

    input.addEventListener('change', () => {
      gestureEnabled = input.checked;
      localStorage.setItem('istighosah-gesture-enabled', String(gestureEnabled));
    });

    menuPanel.addEventListener('click', event => {
      const reset = event.target.closest('[data-setting-id="resetSetting"]');
      if (!reset) return;
      localStorage.removeItem('istighosah-gesture-enabled');
      gestureEnabled = gestureConfig.default !== false;
      input.checked = gestureEnabled;
    }, true);
  }


  function setupAndroidViewToggle(menuPanel) {
    if (window.parent === window || typeof window.parent.exitAndroidView !== 'function') return;
    if (menuPanel.querySelector('[data-setting-id="androidView"]')) return;

    const group = document.createElement('label');
    group.className = 'settings-toggle';
    group.dataset.settingId = 'androidView';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = true;
    input.setAttribute('aria-label', 'Android View');

    const text = document.createElement('span');
    text.textContent = 'Android View';
    group.append(input, text);
    menuPanel.insertBefore(group, menuPanel.firstChild);

    input.addEventListener('change', () => {
      if (!input.checked) {
        closeWholeMenu();
        window.parent.exitAndroidView();
      }
    });
  }

  function setupAndroidInstall(menuPanel) {
    if (menuPanel.querySelector('[data-setting-id="android-install"]')) return;

    const item = document.createElement('div');
    item.className = 'settings-action';
    item.dataset.settingId = 'android-install';

    const installed = window.top.matchMedia('(display-mode: standalone)').matches
      || window.matchMedia('(display-mode: standalone)').matches
      || navigator.standalone === true;
    if (installed) return;

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-action__button';
    button.textContent = 'Install Aplikasi';
    item.appendChild(button);

    button.addEventListener('click', () => {
      closeWholeMenu();

      if (window.parent !== window && typeof window.parent.triggerPwaInstall === 'function') {
        window.parent.triggerPwaInstall();
      }
    });

    // Tempatkan sebagai item menu utama, sebelum halaman submenu yang tersembunyi.
    const firstPage = menuPanel.querySelector(':scope > .android-settings-page');
    menuPanel.insertBefore(item, firstPage || null);
  }

  function setupAndroidHelp(menuPanel) {
    if (menuPanel.querySelector('[data-setting-id="android-help"]')) return;

    const item = document.createElement('div');
    item.className = 'settings-action';
    item.dataset.settingId = 'android-help';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-action__button';
    button.textContent = 'Help';
    item.appendChild(button);

    const page = document.createElement('div');
    page.className = 'android-settings-page android-help-page';
    page.hidden = true;

    function closePage() {
      page.hidden = true;
      page.replaceChildren();
      menuPanel.classList.remove('android-settings-page-open');
    }
    menuPanel.closeAndroidHelpPage = closePage;

    button.addEventListener('click', () => {
      page.replaceChildren();

      const heading = document.createElement('div');
      heading.className = 'android-settings-page-heading';
      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'android-settings-page-back';
      back.textContent = '‹';
      back.setAttribute('aria-label', 'Kembali ke menu');
      const title = document.createElement('span');
      title.textContent = 'Panduan Penggunaan';
      heading.append(back, title);

      const content = document.createElement('div');
      content.className = 'android-help-content';
      const sections = [
        ['Gesture', [
          'Tap 2 kali cepat (jeda maksimal 300 ms): membuka menu.',
          'Tap 2 kali perlahan (jeda lebih dari 300 ms hingga 900 ms): mengaktifkan atau menonaktifkan Tatweel.',
          'Swipe kiri: memperkecil ukuran teks.',
          'Swipe kanan: memperbesar ukuran teks.'
        ]],
        ['Menu', [
          'Ketuk ikon menu untuk membuka atau menutup menu secara manual.',
          'Pilih Gesture untuk mengaktifkan atau menonaktifkan seluruh gesture.',
          'Gunakan Help untuk membuka panduan ini.',
          'Reset mengembalikan pengaturan ke nilai bawaan.'
        ]]
      ];

      sections.forEach(([name, lines]) => {
        const section = document.createElement('section');
        const h = document.createElement('h4');
        h.textContent = name;
        const list = document.createElement('ul');
        lines.forEach(line => {
          const li = document.createElement('li');
          li.textContent = line;
          list.appendChild(li);
        });
        section.append(h, list);
        content.appendChild(section);
      });

      page.append(heading, content);
      page.hidden = false;
      menuPanel.classList.add('android-settings-page-open');
      back.addEventListener('click', closePage);
    });

    const gestureItem = menuPanel.querySelector('[data-setting-id="gesture"]');
    if (gestureItem?.nextSibling) menuPanel.insertBefore(item, gestureItem.nextSibling);
    else menuPanel.insertBefore(item, menuPanel.firstChild);
    menuPanel.appendChild(page);
  }

  async function init() {
    await loadAndroidMenuGesture();
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
    menuPanel.classList.add('settings-panel--pc'); // Kloning tampilan menu PC pada Android.
    await window.IstighosahSettings.init({
      panel: menuPanel,
      readings: target
    });
    setupAndroidSettingsPages(menuPanel);
    setupAndroidGestureToggle(menuPanel);
    setupAndroidHelp(menuPanel);
    setupAndroidInstall(menuPanel);
    setupAndroidViewToggle(menuPanel);
  }

  const trigger = document.querySelector('.menu-trigger');
  const panel = document.querySelector('#menu-panel');

  // Android: hanya submenu Font/Tema dipindahkan ke panel kedua.
  function setupAndroidSettingsPages(menuPanel) {
    const fontGroup = menuPanel.querySelector('[data-setting-id="jenisHuruf"]');
    const themeGroup = menuPanel.querySelector('[data-setting-id="tema"]');
    if (!fontGroup || !themeGroup) return;

    const combinedGroup = document.createElement('div');
    combinedGroup.className = 'settings-choice settings-choice--cascade';
    combinedGroup.dataset.settingId = 'tema-font';

    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'settings-choice__trigger';
    trigger.textContent = 'Tema & Font  ›';
    trigger.setAttribute('aria-haspopup', 'true');
    trigger.setAttribute('aria-label', 'Tema & Font');
    combinedGroup.appendChild(trigger);

    menuPanel.insertBefore(combinedGroup, fontGroup);
    fontGroup.hidden = true;
    themeGroup.hidden = true;

    const page = document.createElement('div');
    page.className = 'android-settings-page';
    page.hidden = true;
    menuPanel.appendChild(page);

    function closePage() {
      page.hidden = true;
      page.replaceChildren();
      menuPanel.classList.remove('android-settings-page-open');
    }
    menuPanel.closeAndroidSettingsPage = closePage;

    trigger.addEventListener('click', event => {
      event.preventDefault();
      page.replaceChildren();

      const heading = document.createElement('div');
      heading.className = 'android-settings-page-heading';

      const back = document.createElement('button');
      back.type = 'button';
      back.className = 'android-settings-page-back';
      back.textContent = '‹';
      back.setAttribute('aria-label', 'Kembali ke pengaturan');

      const title = document.createElement('span');
      title.textContent = 'Tema & Font';
      heading.append(back, title);
      page.appendChild(heading);

      [
        { title: 'Font', group: fontGroup },
        { title: 'Tema', group: themeGroup }
      ].forEach(section => {
        const sectionTitle = document.createElement('div');
        sectionTitle.className = 'android-settings-section-title';
        sectionTitle.textContent = section.title;
        const submenu = section.group.querySelector('.settings-choice__submenu');
        if (submenu) {
          const clone = submenu.cloneNode(true);
          clone.querySelectorAll('.settings-choice__item').forEach((item, index) => {
            const original = submenu.querySelectorAll('.settings-choice__item')[index];
            item.addEventListener('click', event => {
              event.preventDefault();
              event.stopPropagation();

              const select = section.group.querySelector('select');
              if (select && item.dataset.optionId) {
                select.value = item.dataset.optionId;
                select.dispatchEvent(new Event('change', { bubbles: true }));
              }
              closePage();
            });
          });
          page.append(sectionTitle, clone);
        }
      });

      page.hidden = false;
      menuPanel.classList.add('android-settings-page-open');
      back.addEventListener('click', closePage);
    });
  }

  function openMenu() {
    panel.hidden = false;
    trigger.setAttribute('aria-expanded', 'true');
  }

  function closeWholeMenu() {
    panel.closeAndroidSettingsPage?.();
    panel.closeAndroidHelpPage?.();
    panel.hidden = true;
    trigger.setAttribute('aria-expanded', 'false');
  }

  trigger.addEventListener('click', () => {
    panel.hidden = !panel.hidden;
    trigger.setAttribute('aria-expanded', String(!panel.hidden));
  });

  // Gesture Android: double-tap cepat membuka menu, double-tap perlahan mengubah Tatweel, swipe mengubah ukuran teks.
  let touchStart = null;
  let tapCount = 0;
  let firstTapTime = 0;
  let tapTimer = null;
  let skipOutsideClickUntil = 0;
  let dismissedByPointer = false;
  let gesturePopupTimer = null;

  function showGesturePopup(message) {
    let popup = document.getElementById('android-gesture-popup');
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'android-gesture-popup';
      popup.className = 'android-gesture-popup';
      Object.assign(popup.style, {
        position: 'fixed',
        top: '50%',
        left: '50%',
        right: 'auto',
        bottom: 'auto',
        transform: 'translate(-50%, -50%)',
        zIndex: '99999'
      });
      popup.setAttribute('role', 'status');
      popup.setAttribute('aria-live', 'polite');
      document.body.appendChild(popup);
    }
    popup.textContent = message;
    popup.classList.add('is-visible');
    if (gesturePopupTimer) clearTimeout(gesturePopupTimer);
    gesturePopupTimer = setTimeout(() => popup.classList.remove('is-visible'), 1100);
  }

  function resetTapSequence() {
    tapCount = 0;
    firstTapTime = 0;
    if (tapTimer) clearTimeout(tapTimer);
    tapTimer = null;
  }

  function toggleTatweelByGesture() {
    const input = panel.querySelector('[data-setting-id="tatweel"] input[type="checkbox"]');
    if (!input) return;
    input.checked = !input.checked;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    showGesturePopup(`Tatweel ${input.checked ? 'On' : 'Off'}`);
  }

  function changeFontSizeByGesture(direction) {
    const input = panel.querySelector('[data-setting-id="ukuranHuruf"] input[type="range"]');
    if (!input) return;
    const step = Number(input.step) || 1;
    const min = Number(input.min);
    const max = Number(input.max);
    const current = Number(input.value);
    const next = Math.min(max, Math.max(min, current + direction * step * 2));
    if (next !== current) {
      input.value = String(next);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    const currentValue = Number(input.value);
    showGesturePopup(`${currentValue}%`);
  }

  document.addEventListener('pointerdown', event => {
    if (panel.hidden) return;
    const target = event.target instanceof Element ? event.target : event.target.parentElement;
    if (!target?.closest('.menu-panel, .menu-trigger')) {
      dismissedByPointer = event.pointerType === 'touch';
      closeWholeMenu();
      resetTapSequence();
      touchStart = null;
    }
  }, true);

  document.addEventListener('touchstart', event => {
    if (!gestureEnabled || event.touches.length !== 1) {
      touchStart = null;
      return;
    }
    const target = event.target instanceof Element ? event.target : event.target.parentElement;
    if (!panel.hidden || target?.closest('.menu-panel, .menu-trigger')) {
      touchStart = null;
      return;
    }
    const touch = event.touches[0];
    touchStart = { x: touch.clientX, y: touch.clientY, time: Date.now() };
  }, { passive: true });

  document.addEventListener('touchmove', event => {
    if (!gestureEnabled || !touchStart || event.touches.length !== 1) return;
    const touch = event.touches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    if (Math.abs(dx) > 18 && Math.abs(dx) > Math.abs(dy) * 1.2) {
      event.preventDefault();
    }
  }, { passive: false });

  document.addEventListener('touchend', event => {
    if (dismissedByPointer) {
      dismissedByPointer = false;
      touchStart = null;
      resetTapSequence();
      return;
    }
    if (event.changedTouches.length !== 1) {
      touchStart = null;
      return;
    }

    const target = event.target instanceof Element ? event.target : event.target.parentElement;
    const insideMenu = target?.closest('.menu-panel, .menu-trigger');

    if (!panel.hidden && !insideMenu) {
      closeWholeMenu();
      touchStart = null;
      resetTapSequence();
      return;
    }
    if (insideMenu) {
      touchStart = null;
      resetTapSequence();
      return;
    }
    if (!gestureEnabled || !touchStart) return;

    const touch = event.changedTouches[0];
    const dx = touch.clientX - touchStart.x;
    const dy = touch.clientY - touchStart.y;
    const duration = Date.now() - touchStart.time;
    touchStart = null;

    const horizontalSwipe = Math.abs(dx) >= 65
      && Math.abs(dy) <= Math.max(50, Math.abs(dx) * 0.6)
      && duration >= 50 && duration <= 700;

    if (horizontalSwipe) {
      resetTapSequence();
      changeFontSizeByGesture(dx < 0 ? -1 : 1);
      event.preventDefault();
      return;
    }

    if (Math.hypot(dx, dy) > 24 || duration > 350) return;

    const now = Date.now();

    if (tapCount === 0) {
      tapCount = 1;
      firstTapTime = now;

      // Beri kesempatan untuk tap kedua.
      tapTimer = setTimeout(resetTapSequence, 900);
      return;
    }

    const interval = now - firstTapTime;
    resetTapSequence();

    if (interval <= 300) {
      // Dua tap cepat: buka menu.
      openMenu();
      skipOutsideClickUntil = Date.now() + 600;
    } else if (interval <= 900) {
      // Dua tap perlahan: aktif/nonaktifkan Tatweel.
      toggleTatweelByGesture();
    }

    event.preventDefault();
  }, { passive: false });

  document.addEventListener('touchcancel', () => {
    touchStart = null;
    resetTapSequence();
  }, { passive: true });

  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : event.target.parentElement;
    if (!panel.hidden && !target?.closest('.menu-panel, .menu-trigger')) {
      if (Date.now() < skipOutsideClickUntil) {
        skipOutsideClickUntil = 0;
        return;
      }
      closeWholeMenu();
    }
  });

  init().catch(error => {
    console.error(error);
    document.getElementById('naskah').textContent = 'Naskah gagal dimuat. Periksa berkas Global/aset/naskah.json.';
  });
})();
