(() => {
  
	
	
	const STORAGE_KEY = 'istighosah-pengaturan-v1';
  const CONFIG_URL = '../global/rules.json';

  function clamp(value, minimum, maksimum) {
    return Math.min(maksimum, Math.max(minimum, value));
  }

  function readSavedSettings(config) {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return {
        jarakBlok: Number.isFinite(saved.gap)
          ? clamp(saved.gap, config.jarakBlok.minimum, config.jarakBlok.maksimum)
          : config.jarakBlok.default,
        ukuranHuruf: Number.isFinite(saved.fontScale)
          ? clamp(saved.fontScale, config.ukuranHuruf.minimum, config.ukuranHuruf.maksimum)
          : config.ukuranHuruf.default,
        jarakBaris: Number.isFinite(saved.lineSpacing)
          ? clamp(saved.lineSpacing, config.jarakBaris.minimum, config.jarakBaris.maksimum)
          : config.jarakBaris.default,
        harakat: typeof saved.harakat === 'boolean' ? saved.harakat : config.harakat.default,
        jenisHuruf: config.jenisHuruf.daftar.some(font => font.id === saved.jenisHuruf)
          ? saved.jenisHuruf : config.jenisHuruf.default,
        tebal: typeof saved.tebal === 'boolean' ? saved.tebal : config.tebal.default,
        tema: config.tema.daftar.some(item => item.id === saved.tema)
          ? saved.tema : config.tema.default,
        selangSeling: typeof saved.selangSeling === 'boolean'
          ? saved.selangSeling : config.selangSeling.default
      };
    } catch {
      return {
        jarakBlok: config.jarakBlok.default,
        ukuranHuruf: config.ukuranHuruf.default,
        jarakBaris: config.jarakBaris.default,
        harakat: config.harakat.default,
        jenisHuruf: config.jenisHuruf.default,
        tebal: config.tebal.default,
        tema: config.tema.default,
        selangSeling: config.selangSeling.default
      };
    }
  }

  function writeSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        gap: settings.jarakBlok,
        fontScale: settings.ukuranHuruf,
        lineSpacing: settings.jarakBaris,
        harakat: settings.harakat,
        jenisHuruf: settings.jenisHuruf,
        tebal: settings.tebal,
        tema: settings.tema,
        selangSeling: settings.selangSeling
      }));
    } catch (error) {
      console.warn('Pengaturan tidak dapat disimpan:', error);
    }
  }

  function createControl(panel, title, config, value, suffix, settingId) {
    const group = document.createElement('div');
    group.className = 'settings-control';
    if (settingId) group.dataset.settingId = settingId;

    const heading = document.createElement('div');
    heading.className = 'settings-control__heading';

    const label = document.createElement('label');
    label.textContent = title;

    const output = document.createElement('output');
    output.textContent = `${value}${suffix}`;

    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(config.minimum);
    input.max = String(config.maksimum);
    input.step = String(config.langkah);
    input.value = String(value);
    input.setAttribute('aria-label', title);

    heading.append(label, output);
    group.append(heading, input);
    panel.appendChild(group);

    return { input, output };
  }

  function createToggle(panel, title, checked, settingId) {
    const group = document.createElement('label');
    group.className = 'settings-toggle';
    if (settingId) group.dataset.settingId = settingId;
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = checked;
    const text = document.createElement('span');
    text.textContent = title;
    group.append(input, text);
    panel.appendChild(group);
    return input;
  }

  function createSelect(panel, title, options, value, settingId) {
    const group = document.createElement('div');
    group.className = 'settings-control settings-choice';
    if (settingId) group.dataset.settingId = settingId;
    const label = document.createElement('label');
    label.className = 'settings-choice__label';
    label.textContent = title;
    const select = document.createElement('select');
    select.className = 'settings-select';
    select.setAttribute('aria-label', title);
    options.forEach(option => {
      const item = document.createElement('option');
      item.value = option.id;
      item.textContent = option.nama;
      select.appendChild(item);
    });
    select.value = value;

    if (panel.classList.contains('settings-panel--pc')) {
      const trigger = document.createElement('button');
      trigger.type = 'button';
      trigger.className = 'settings-choice__trigger';
      trigger.textContent = `${title}  ›`;
      trigger.setAttribute('aria-haspopup', 'true');
      trigger.setAttribute('aria-label', title);
      const submenu = document.createElement('div');
      submenu.className = 'settings-choice__submenu';
      submenu.setAttribute('role', 'menu');
      options.forEach(option => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'settings-choice__item';
        item.textContent = option.nama;
        item.dataset.optionId = option.id;
        item.setAttribute('role', 'menuitemradio');
        item.setAttribute('aria-checked', String(option.id === value));
        item.addEventListener('click', () => {
          select.value = option.id;
          select.dispatchEvent(new Event('change', { bubbles: true }));
        });
        submenu.appendChild(item);
      });
      select.addEventListener('change', () => {
        submenu.querySelectorAll('.settings-choice__item').forEach(node => {
          node.setAttribute('aria-checked', String(node.dataset.optionId === select.value));
        });
      });
      group.classList.add('settings-choice--cascade');
      group.append(label, trigger, submenu, select);
    } else {
      group.append(label, select);
    }
    panel.appendChild(group);
    return select;
  }

  function hapusHarakat(text) {
    return text.replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g, '');
  }

  // Posisi Tatweel hanya pada sambungan huruf yang sah.
  function getTatweelPositions(word) {
    const segmenter = typeof Intl.Segmenter === 'function'
      ? new Intl.Segmenter('ar', { granularity: 'grapheme' })
      : null;
    const units = segmenter
      ? Array.from(segmenter.segment(word), item => item.segment)
      : Array.from(word);
    const arabicLetter = /[\u0621-\u063A\u0641-\u064A\u066E-\u06D3\u0750-\u077F\u08A0-\u08FF]/;
    const rightJoiningOnly = new Set(Array.from(
      'اآأإٱٲٳٵدذڈډڊڋڌڍڎڏڐرڑړڔڕږڗزژڙৱؤوۄۅۆۇۈۉۊ'
    ));
    const alif = new Set(Array.from('اآأإٱٲٳٵ'));
    const nonJoining = new Set(['ء', 'ٔ', 'ٕ']);
    const bases = units.map(unit => Array.from(unit).find(ch => arabicLetter.test(ch)) || null);
    const positions = [];

    for (let i = 0; i < units.length - 1; i++) {
      const left = bases[i];
      const right = bases[i + 1];
      if (!left || !right) continue;
      if (!rightJoiningOnly.has(left) && !nonJoining.has(left)
          && !nonJoining.has(right) && !alif.has(right)) positions.push(i + 1);
    }
    return { units, positions };
  }

  function applyTatweelToParagraph(element, text) {
    const fragment = document.createDocumentFragment();
    const words = [];
    const parts = text.match(/\s+|[^\s]+/gu) || [text];

    for (const part of parts) {
      if (/^\s+$/u.test(part)) {
        fragment.appendChild(document.createTextNode(part));
        continue;
      }

      const span = document.createElement('span');
      span.textContent = part;
      // Kata harus tetap utuh agar posisi baris dapat diukur dengan pasti.
      span.style.whiteSpace = 'nowrap';
      fragment.appendChild(span);

      const data = getTatweelPositions(part);
      words.push({
        span,
        units: data.units,
        positions: data.positions,
        counts: Array(data.positions.length).fill(0),
        blocked: Array(data.positions.length).fill(false)
      });
    }

    element.replaceChildren(fragment);
    const paragraph = element.closest('.reading-text');
    if (!paragraph || !words.length) return;

    // Ambil posisi kata dari hasil render browser yang sebenarnya.
    const lines = new Map();
    for (const word of words) {
      const rects = word.span.getClientRects();
      if (!rects.length) continue;
      const rect = rects[0];
      const key = Math.round(rect.top);
      if (!lines.has(key)) lines.set(key, []);
      lines.get(key).push(word);
    }

    const lineGroups = Array.from(lines.values());
    if (lineGroups.length < 2) return;

    const paragraphRect = paragraph.getBoundingClientRect();
    const innerLeft = paragraphRect.left + paragraph.clientLeft;
    const innerRight = innerLeft + paragraph.clientWidth;

    function renderWord(word) {
      let result = '';
      for (let index = 0; index < word.units.length; index++) {
        result += word.units[index];
        const slot = word.positions.indexOf(index + 1);
        if (slot !== -1 && word.counts[slot]) {
          result += '\u0640'.repeat(word.counts[slot]);
        }
      }
      return result;
    }

    function lineStillFits(lineWords, baselineTops) {
      // Memeriksa posisi aktual setiap kata setelah satu percobaan Tatweel.
      // Jika satu kata pindah baris atau melewati batas paragraf, percobaan ditolak.
      for (let index = 0; index < lineWords.length; index++) {
        const rects = lineWords[index].span.getClientRects();
        if (rects.length !== 1) return false;

        const rect = rects[0];
        if (Math.abs(rect.top - baselineTops[index]) > 2) return false;
        if (rect.left < innerLeft - 1 || rect.right > innerRight + 1) return false;
      }
      return true;
    }

    // Baris terakhir tidak dipanjangkan. Setiap percobaan di baris lain
    // langsung diuji pada DOM; daftar baris tidak diasumsikan tetap setelahnya.
    for (const lineWords of lineGroups.slice(0, -1)) {
      const baselineTops = lineWords.map(word => word.span.getBoundingClientRect().top);
      if (!lineStillFits(lineWords, baselineTops)) continue;

      let rounds = 0;
      while (rounds < 200) {
        rounds++;
        let activeSlot = false;
        let accepted = false;

        for (const word of lineWords) {
          for (let slot = 0; slot < word.positions.length; slot++) {
            if (word.blocked[slot]) continue;
            activeSlot = true;

            word.counts[slot]++;
            word.span.textContent = renderWord(word);

            if (lineStillFits(lineWords, baselineTops)) {
              accepted = true;
            } else {
              word.counts[slot]--;
              word.span.textContent = renderWord(word);
              word.blocked[slot] = true;
            }
          }
        }

        if (!activeSlot || !accepted) break;
      }
    }
  }

  function hasMultipleLines(element) {
    const range = document.createRange();
    range.selectNodeContents(element);
    const rects = range.getClientRects();
    const tops = new Set(Array.from(rects, rect => Math.round(rect.top)));
    return tops.size > 1;
  }
  
	function addStyles() {
		if (document.getElementById('istighosah-settings-style')) return;

		const style = document.createElement('style');
		style.id = 'istighosah-settings-style';

		const fontPath = '../global/aset/font/';
		const fonts = [
			['Traditional Arabic', 'TraditionalArabic'],
			['Noto Naskh Arabic', 'NotoNaskhArabic'],
			['Amiri', 'Amiri'],
			['Noto Sans Arabic', 'NotoSansArabic'],
			['Noto Kufi Arabic', 'NotoKufiArabic']
		];

		style.textContent = `
			${fonts.map(([family, filename]) =>
				[400, 700].map(weight => `
					@font-face {
						font-family: '${family}';
						src: url('${fontPath}${filename}-${weight === 400 ? 'Regular' : 'Bold'}.woff2') format('woff2');
						font-display: swap;
						font-weight: ${weight};
					}
				`).join('')
			).join('')}

			.settings-toggle {
				display: flex;
				align-items: center;
				gap: 10px;
				min-height: 44px;
				padding: 6px 14px;
				color: var(--menu-fg, #222222);
				font: 14px Arial, sans-serif;
				cursor: pointer;
			}
			.settings-toggle input { width: 18px; height: 18px; margin: 0; accent-color: var(--control-accent, #2457c5); }
			.settings-control {
				padding: 9px 14px 11px;
				color: var(--menu-fg, #222222);
				font: 14px Arial, sans-serif;
			}
			.settings-control__heading {
				display: flex;
				justify-content: space-between;
				align-items: center;
				gap: 12px;
				margin-bottom: 7px;
			}
			.settings-control output {
				min-width: 42px;
				text-align: right;
				color: var(--menu-muted, #555555);
				font-variant-numeric: tabular-nums;
			}
			.settings-action { padding: 7px 14px; }
			.settings-action__button { width: 100%; min-height: 34px; padding: 6px 10px; border: 1px solid var(--menu-border, #cccccc); border-radius: 4px; background: var(--menu-bg, #ffffff); color: var(--menu-fg, #222222); font: 14px Arial, sans-serif; cursor: pointer; }
			.settings-advanced-toggle { border-bottom: 1px solid var(--menu-border, #cccccc); }
			.settings-action[hidden], [data-setting-id][hidden] { display: none !important; }
			.settings-select { width: 100%; min-height: 34px; padding: 4px 8px; border: 1px solid var(--menu-border, #cccccc); border-radius: 4px; background: var(--menu-bg, #ffffff); color: var(--menu-fg, #222222); font: 14px Arial, sans-serif; }
			.settings-control input[type="range"] {
				display: block;
				width: 100%;
				min-height: 28px;
				margin: 0;
				accent-color: var(--control-accent, #2457c5);
				cursor: pointer;
				touch-action: pan-y;
			}
			@media (max-width: 700px) {
				.settings-action { padding: 8px 16px; }
				.settings-action__button { min-height: 46px; font-size: 16px; }
				.settings-toggle { min-height: 52px; padding: 8px 16px; font-size: 16px; gap: 12px; }
				.settings-toggle input { width: 22px; height: 22px; flex: 0 0 22px; }
				.settings-control { padding: 12px 16px 14px; font-size: 16px; }
				.settings-control__heading { margin-bottom: 9px; }
				.settings-control input[type="range"] { min-height: 36px; }
				.settings-select { min-height: 48px; padding: 8px 10px; font-size: 16px; }
			}
		`;
		
		document.head.appendChild(style);
	}

	
  function createAction(panel, title, settingId, onClick) {
    const group = document.createElement('div');
    group.className = 'settings-action';
    group.dataset.settingId = settingId;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'settings-action__button';
    button.textContent = title;
    button.addEventListener('click', onClick);
    group.appendChild(button);
    panel.appendChild(group);
    return button;
  }

  function showDialog(message, confirmMode = false, variant = '') {
    return new Promise(resolve => {
      document.getElementById('istighosah-dialog')?.remove();

      if (!document.getElementById('istighosah-dialog-style')) {
        const style = document.createElement('style');
        style.id = 'istighosah-dialog-style';
        style.textContent = `
          #istighosah-dialog {
            position: fixed; inset: 0; z-index: 100000;
            display: grid; place-items: center; padding: 20px;
            background: rgba(12, 18, 30, .52);
            backdrop-filter: blur(9px);
            -webkit-backdrop-filter: blur(9px);
          }
          #istighosah-dialog .dialog-card {
            width: min(100%, 390px); padding: 22px 22px 17px;
            border: 1px solid rgba(120,130,150,.22); border-radius: 16px;
            background: var(--menu-bg, #fff); color: var(--menu-fg, #222);
            box-shadow: 0 18px 55px rgba(0,0,0,.25);
            animation: istighosah-dialog-in .16s ease-out;
          }
          #istighosah-dialog .dialog-message {
            margin: 0; font: 15px/1.55 Arial, sans-serif;
            white-space: pre-line;
          }
          #istighosah-dialog .dialog-actions {
            display: flex; justify-content: flex-end; gap: 9px; margin-top: 22px;
          }
          #istighosah-dialog button {
            min-width: 76px; min-height: 38px; padding: 7px 15px;
            border: 1px solid var(--menu-border, #ccc); border-radius: 9px;
            background: transparent; color: inherit; font: 14px Arial, sans-serif;
            cursor: pointer;
          }
          #istighosah-dialog button.dialog-primary {
            border-color: var(--control-accent, #2457c5);
            background: var(--control-accent, #2457c5); color: #fff;
          }
          #istighosah-dialog.dialog-offline .dialog-card {
            border: 1px solid #ef4444;
            border-left: 6px solid #dc2626;
            background: #fef2f2;
            color: #991b1b;
          }
          #istighosah-dialog.dialog-offline .dialog-message {
            color: #991b1b;
            font-weight: 700;
          }
          #istighosah-dialog.dialog-offline button.dialog-primary {
            border-color: #dc2626; background: #dc2626; color: #fff;
          }
          @keyframes istighosah-dialog-in {
            from { opacity: 0; transform: translateY(7px) scale(.98); }
            to { opacity: 1; transform: none; }
          }
          @media (prefers-reduced-motion: reduce) {
            #istighosah-dialog .dialog-card { animation: none; }
          }
        `;
        document.head.appendChild(style);
      }

      const overlay = document.createElement('div');
      overlay.id = 'istighosah-dialog';
      if (variant === 'offline') overlay.classList.add('dialog-offline');
      overlay.innerHTML = `
        <section class="dialog-card" role="dialog" aria-modal="true">
          <p class="dialog-message"></p>
          <div class="dialog-actions">
            <button type="button" class="dialog-primary" data-result="true">${confirmMode ? 'Lanjutkan' : 'OK'}</button>
          </div>
        </section>`;
      overlay.querySelector('.dialog-message').textContent = message;

      const finish = value => {
        overlay.remove();
        resolve(value);
      };
      overlay.querySelectorAll('button').forEach(button => {
        button.addEventListener('click', () => finish(button.dataset.result === 'true'));
      });
      overlay.addEventListener('click', event => {
        if (event.target === overlay) finish(!confirmMode);
      });
      document.body.appendChild(overlay);
      overlay.querySelector('.dialog-primary').focus();
    });
  }

  function showNotice(message, variant = '') {
    return showDialog(message, false, variant);
  }

  async function init({ panel, readings }) {
    if (!panel || !readings || panel.dataset.settingsReady === 'true') return;

    const response = await fetch(CONFIG_URL);
    if (!response.ok) throw new Error(`Konfigurasi pengaturan gagal dimuat (${response.status})`);
    const config = await response.json();

    const pagePadding = config.padding || {};
    const frame = document.querySelector('.frame');
    if (frame) {
      for (const side of ['top', 'right', 'left']) {
        const value = Number(pagePadding[side]);
        if (Number.isFinite(value) && value >= 0) {
          frame.style[`padding${side[0].toUpperCase()}${side.slice(1)}`] = `${value}px`;
        }
      }
    }

    addStyles();
    const settingInfo = config.settingInfo || {};
    const applyInfo = (element, id) => {
      const info = settingInfo[id];
      if (!info) return;
      element.dataset.tooltip = `${info.nama ? info.nama + ' — ' : ''}${info.keterangan || ''}`.trim();
      element.setAttribute('aria-label', element.dataset.tooltip);
    };

    const saved = readSavedSettings(config);

    // Susunan menu utama mengikuti urutan yang ditetapkan.
    const harakatToggle = createToggle(panel, 'Harakat', saved.harakat, 'harakat');
    const selangSelingToggle = createToggle(panel, 'Variasi', saved.selangSeling, 'selangSeling');
    const tatweelToggle = createToggle(panel, 'Tatwil', config.tatweel.aktif, 'tatweel');
    const boldToggle = createToggle(panel, 'Tebal', saved.tebal, 'tebal');
    const fontSelect = createSelect(panel, 'Font', config.jenisHuruf.daftar, saved.jenisHuruf, 'jenisHuruf');
    const themeSelect = createSelect(panel, 'Tema', config.tema.daftar, saved.tema, 'tema');
    const fontControl = createControl(
      panel, 'Ukuran', config.ukuranHuruf, saved.ukuranHuruf, '%', 'ukuranHuruf'
    );

    // Advanced selalu tampil sebagai submenu, seperti Font dan Tema.
    const advancedGroup = document.createElement('div');
    advancedGroup.className = 'settings-choice settings-choice--cascade settings-advanced';
    const advancedTrigger = document.createElement('button');
    advancedTrigger.type = 'button';
    advancedTrigger.className = 'settings-choice__trigger';
    advancedTrigger.textContent = 'Advanced  ›';
    advancedTrigger.setAttribute('aria-haspopup', 'true');
    advancedTrigger.setAttribute('aria-label', 'Advanced');
    const advancedSubmenu = document.createElement('div');
    advancedSubmenu.className = 'settings-choice__submenu settings-advanced-submenu';
    advancedSubmenu.setAttribute('role', 'menu');
    advancedGroup.append(advancedTrigger, advancedSubmenu);
    panel.appendChild(advancedGroup);

    const lineGapControl = createControl(
      panel, 'Jarak Baris', config.jarakBaris, saved.jarakBaris, '', 'jarakBaris'
    );
    const gapControl = createControl(
      panel, 'Jarak Bagian', config.jarakBlok, saved.jarakBlok, ' px', 'jarakBlok'
    );
    advancedSubmenu.append(lineGapControl.input.parentElement, gapControl.input.parentElement);

    const resetButton = createAction(panel, 'Reset Setting', 'resetSetting', resetDefaults);
    const reloadButton = createAction(panel, 'Reload Data', 'reloadData', reloadData);
    advancedSubmenu.append(resetButton.parentElement, reloadButton.parentElement);

    panel.querySelectorAll('[data-setting-id]').forEach(element => applyInfo(element, element.dataset.settingId));

    let jarakBlok = saved.jarakBlok;
    let ukuranHuruf = saved.ukuranHuruf;
    let tatweelAktif = config.tatweel.aktif;
    let jarakBaris = saved.jarakBaris;
    let harakat = saved.harakat;
    let jenisHuruf = saved.jenisHuruf;
    let tebal = saved.tebal;
    let tema = saved.tema;
    let selangSeling = saved.selangSeling;

    function applyTheme() {
      document.documentElement.dataset.theme = tema;
      document.documentElement.dataset.selangSeling = selangSeling ? 'true' : 'false';
      const colors = { klasik: '#f2e4b8', terang: '#f5f7fb', gelap: '#151a22' };
      const themeColor = document.querySelector('meta[name="theme-color"]');
      if (themeColor) themeColor.setAttribute('content', colors[tema] || colors.klasik);
    }
    function ukurTinggiBarisAlami(line) {
      const computed = getComputedStyle(line);
      const probe = document.createElement('span');
      probe.textContent = line.textContent || '\u0645';

      Object.assign(probe.style, {
        position: 'fixed',
        left: '-100000px',
        top: '0',
        display: 'inline-block',
        width: 'max-content',
        maxWidth: 'none',
        whiteSpace: 'nowrap',
        visibility: 'hidden',
        pointerEvents: 'none',
        margin: '0',
        padding: '0',
        border: '0',
        lineHeight: 'normal',
        fontFamily: computed.fontFamily,
        fontSize: computed.fontSize,
        fontWeight: computed.fontWeight,
        fontStyle: computed.fontStyle,
        fontVariant: computed.fontVariant,
        fontStretch: computed.fontStretch,
        letterSpacing: computed.letterSpacing,
        wordSpacing: computed.wordSpacing,
        direction: computed.direction,
        writingMode: computed.writingMode,
        fontKerning: computed.fontKerning,
        fontFeatureSettings: computed.fontFeatureSettings,
        fontVariationSettings: computed.fontVariationSettings
      });

      (document.body || document.documentElement).appendChild(probe);
      const tinggi = probe.getBoundingClientRect().height;
      probe.remove();
      return tinggi;
    }
    const teksAsli = new Map();
    readings.querySelectorAll('.reading-content').forEach(el => teksAsli.set(el, el.textContent));

    function applyFontScale() {
      const lines = readings.querySelectorAll('.reading-text');
      lines.forEach(line => { line.style.fontSize = ''; });
      lines.forEach(line => {
        const baseSize = parseFloat(getComputedStyle(line).fontSize);
        line.style.fontSize = `${baseSize * ukuranHuruf / 100}px`;
      });
    }

    let tatweelScheduleId = 0;

    function applyTatweelStyles() {
      readings.querySelectorAll('.reading-text').forEach(line => {
        line.style.textAlign = 'right';
        line.style.textAlignLast = 'right';
        line.style.fontFamily = config.jenisHuruf.daftar.find(font => font.id === jenisHuruf).keluarga;
        line.style.fontWeight = tebal ? '700' : '400';
      });
    }

    function applyTatweelContent() {
      teksAsli.forEach((teks, el) => {
        const sumber = harakat ? teks : hapusHarakat(teks);
        if (tatweelAktif) applyTatweelToParagraph(el, sumber);
        else el.textContent = sumber;
      });
    }

    // Pemicu manual tetap langsung; perubahan tipografi memakai scheduleTatweel().
    function applyTatweel() {
      tatweelScheduleId++;
      applyTatweelStyles();
      applyTatweelContent();
    }

    function scheduleTatweel() {
      applyTatweelStyles();
      const scheduleId = ++tatweelScheduleId;
      const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));

      (async () => {
        // Beri browser kesempatan menerapkan ukuran/font sebelum mengukur baris.
        await nextFrame();
        if (document.fonts?.ready) await document.fonts.ready;
        await nextFrame();
        await nextFrame();

        // Abaikan perhitungan lama jika ada perubahan baru selama proses menunggu.
        if (scheduleId !== tatweelScheduleId) return;
        applyLineSpacing();
        await nextFrame();
        if (scheduleId !== tatweelScheduleId) return;
        applyTatweelContent();
      })();
    }

    function applyLineSpacing() {
      readings.querySelectorAll('.reading-text').forEach(line => {
        // Nilai nol mengembalikan line-height alami yang ditentukan font.
        const fontConfig = config.jenisHuruf.daftar.find(font => font.id === jenisHuruf);
        const jarakDasar = Number(fontConfig?.jarakBaris) || 0;
        const penyesuaian = jarakDasar + jarakBaris;
        if (penyesuaian === 0) {
          line.style.lineHeight = '';
          return;
        }

        const ukuran = parseFloat(getComputedStyle(line).fontSize) || 1;
        const tinggiAlami = ukurTinggiBarisAlami(line);
        const tinggiManual = Math.max(ukuran * 0.8, tinggiAlami + penyesuaian * ukuran);
        line.style.lineHeight = `${tinggiManual}px`;
      });
    }

    function applyGap() {
      const temaGelap = document.documentElement.dataset.theme === 'gelap';
      const lines = [...readings.querySelectorAll('.reading-text')];

      lines.forEach((line, index) => {
        if (temaGelap) {
          // Pada tema gelap, ruang jarak menjadi bagian dari blok sebelumnya.
          // Dengan begitu warna selang-seling tidak disela warna latar halaman.
          line.style.marginBottom = '0';
          line.style.paddingBottom = index < lines.length - 1 ? `${jarakBlok}px` : '';
        } else {
          line.style.paddingBottom = '';
          line.style.marginBottom = `${jarakBlok}px`;
        }
      });
    }

    function save() {
      writeSettings({ jarakBlok, ukuranHuruf, jarakBaris, harakat, jenisHuruf, tebal, tema, selangSeling });
    }

    function showHomeTransition() {
      const overlay = document.createElement('div');
      overlay.className = 'istighosah-home-transition';
      overlay.innerHTML = '<img alt="" src="../global/aset/logo.png">';
      if (!document.getElementById('istighosah-home-transition-style')) {
        const style = document.createElement('style');
        style.id = 'istighosah-home-transition-style';
        style.textContent = `
          .istighosah-home-transition {
            position:fixed; inset:0; z-index:100001; display:grid; place-items:center;
            background:rgba(12,18,30,.52); backdrop-filter:blur(9px);
            -webkit-backdrop-filter:blur(9px); overflow:hidden;
          }
          .istighosah-home-transition img {
            width:min(34vw,150px); max-height:30vh; object-fit:contain;
            animation:istighosah-logo-zoom .85s cubic-bezier(.2,.75,.25,1) forwards;
          }
          @keyframes istighosah-logo-zoom {
            0% { opacity:0; transform:scale(.55); }
            22% { opacity:1; transform:scale(1); }
            100% { opacity:0; transform:scale(18); }
          }
          @media(prefers-reduced-motion:reduce) {
            .istighosah-home-transition img { animation-duration:.15s; }
          }
        `;
        document.head.appendChild(style);
      }
      document.body.appendChild(overlay);
      setTimeout(() => location.reload(), 850);
    }

    async function resetDefaults() {
      if (!await showDialog('Reset Setting akan mengembalikan seluruh pengaturan ke nilai bawaan. Lanjutkan?', true)) return;
      jarakBlok = config.jarakBlok.default;
      ukuranHuruf = config.ukuranHuruf.default;
      jarakBaris = config.jarakBaris.default;
      harakat = config.harakat.default;
      jenisHuruf = config.jenisHuruf.default;
      tebal = config.tebal.default;
      tema = config.tema.default;
      selangSeling = config.selangSeling.default;
      tatweelAktif = config.tatweel.aktif;

      gapControl.input.value = String(jarakBlok);
      gapControl.output.textContent = `${jarakBlok} px`;
      fontControl.input.value = String(ukuranHuruf);
      fontControl.output.textContent = `${ukuranHuruf}%`;
      lineGapControl.input.value = String(jarakBaris);
      lineGapControl.output.textContent = jarakBaris.toFixed(2);
      boldToggle.checked = tebal;
      harakatToggle.checked = harakat;
      tatweelToggle.checked = tatweelAktif;
      selangSelingToggle.checked = selangSeling;
      fontSelect.value = jenisHuruf;
      themeSelect.value = tema;
      applyTheme();
      applyGap();
      applyFontScale();
      scheduleTatweel();
      save();
      showHomeTransition();
    }

    function showReloadProgress() {
      document.getElementById('istighosah-dialog')?.remove();

      const overlay = document.createElement('div');
      overlay.id = 'istighosah-dialog';
      overlay.innerHTML = `
        <section class="dialog-card reload-progress-card" role="dialog" aria-modal="true" aria-live="polite">
          <p class="dialog-message reload-progress-title">Reload Data sedang berlangsung</p>
          <div class="reload-progress-track"><div class="reload-progress-fill"></div></div>
          <div class="reload-progress-meta"><strong class="reload-progress-status">0%</strong></div>
          <button type="button" class="dialog-primary reload-return" disabled>Kembali ke halaman utama</button>
        </section>`;

      if (!document.getElementById('istighosah-reload-progress-style')) {
        const style = document.createElement('style');
        style.id = 'istighosah-reload-progress-style';
        style.textContent = `
          #istighosah-dialog .reload-progress-card { width:min(100%,390px); }
          #istighosah-dialog .reload-progress-title { margin:0; font-weight:700; text-align:center; }
          #istighosah-dialog .reload-progress-track { height:9px; margin-top:22px; border-radius:99px; overflow:hidden; background:var(--menu-border,#ddd); }
          #istighosah-dialog .reload-progress-fill { width:0; height:100%; border-radius:inherit; background:var(--control-accent,#2457c5); transition:width .2s ease; }
          #istighosah-dialog .reload-progress-meta { display:flex; justify-content:center; margin-top:10px; color:var(--menu-fg,#222); font:700 13px Arial,sans-serif; }
          #istighosah-dialog .reload-return { display:block; width:100%; margin-top:22px; }
          #istighosah-dialog .reload-return:disabled { opacity:.45; cursor:default; }
        `;
        document.head.appendChild(style);
      }

      document.body.appendChild(overlay);
      const button = overlay.querySelector('.reload-return');
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

      const progress = showReloadProgress();
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
        clearTimeout(timeout);
        progress.finish(Boolean(data.ok));
        channel.port1.close();
      };

      worker.postMessage({ type: 'RELOAD_DATA' }, [channel.port2]);
    }

    
    gapControl.input.addEventListener('input', () => {
      jarakBlok = Number(gapControl.input.value);
      gapControl.output.textContent = `${jarakBlok} px`;
      applyGap();
      save();
    });

    lineGapControl.input.addEventListener('input', () => {
      jarakBaris = Number(lineGapControl.input.value);
      lineGapControl.output.textContent = `${jarakBaris > 0 ? '+' : ''}${jarakBaris.toFixed(2)}`;
      applyLineSpacing();
      save();
    });

    tatweelToggle.addEventListener('change', () => {
      tatweelAktif = tatweelToggle.checked;
      applyTatweel();
    });

    selangSelingToggle.addEventListener('change', () => {
      selangSeling = selangSelingToggle.checked;
      applyTheme();
      save();
    });

    themeSelect.addEventListener('change', () => {
      tema = themeSelect.value;
      applyTheme();
      applyGap();
      save();
    });

    fontControl.input.addEventListener('input', () => {
      ukuranHuruf = Number(fontControl.input.value);
      fontControl.output.textContent = `${ukuranHuruf}%`;
      applyFontScale();
      scheduleTatweel();
      save();
    });

    harakatToggle.addEventListener('change', () => {
      harakat = harakatToggle.checked;
      applyTatweel();
      save();
    });

    fontSelect.addEventListener('change', () => {
      jenisHuruf = fontSelect.value;
      scheduleTatweel();
      save();
    });

    boldToggle.addEventListener('change', () => {
      tebal = boldToggle.checked;
      scheduleTatweel();
      save();
    });

    applyTheme();
    applyGap();
    if (ukuranHuruf !== 100) applyFontScale();
    scheduleTatweel();

    window.addEventListener('resize', () => {
      if (ukuranHuruf !== 100) applyFontScale();
      scheduleTatweel();
    }, { passive: true });

    panel.dataset.settingsReady = 'true';
  }

  window.IstighosahSettings = {
    init: options => init(options).catch(error => {
      console.error('Pengaturan gagal diinisialisasi:', error);
    })
  };
})();
