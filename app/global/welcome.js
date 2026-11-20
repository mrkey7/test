(() => {
  const STYLE_ID = 'istighosah-welcome-style';
  const OVERLAY_ID = 'istighosah-welcome';

  function addStyles() {
    if (document.getElementById(STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent = `
      #${OVERLAY_ID} {
        position:fixed; inset:0; z-index:100001; display:grid; place-items:center;
        background:rgba(12,18,30,.52); backdrop-filter:blur(9px);
        -webkit-backdrop-filter:blur(9px); overflow:hidden;
      }
      #${OVERLAY_ID} img {
        width:min(34vw,150px); max-height:30vh; object-fit:contain;
        animation:istighosah-welcome-zoom var(--welcome-duration, .85s) cubic-bezier(.2,.75,.25,1) forwards;
      }
      @keyframes istighosah-welcome-zoom {
        0% { opacity:0; transform:scale(.55); }
        22% { opacity:1; transform:scale(1); }
        100% { opacity:0; transform:scale(18); }
      }
    `;
    document.head.appendChild(style);
  }

  function show(duration = 850) {
    const time = Number.isFinite(Number(duration)) ? Math.max(0, Number(duration)) : 850;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const actualTime = reducedMotion ? Math.min(time, 150) : time;

    document.getElementById(OVERLAY_ID)?.remove();
    addStyles();

    const overlay = document.createElement('div');
    overlay.id = OVERLAY_ID;
    overlay.innerHTML = '<img alt="" src="../global/aset/logo.png">';
    overlay.style.setProperty('--welcome-duration', `${actualTime}ms`);
    document.body.appendChild(overlay);

    return new Promise(resolve => {
      window.setTimeout(() => {
        overlay.remove();
        resolve();
      }, actualTime);
    });
  }

  window.IstighosahWelcome = { show };
})();
