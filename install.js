(function () {
  const appFrame = document.getElementById('app-frame');
  let deferredInstallPrompt = null;
  let installInProgress = false;

  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    deferredInstallPrompt = event;
  });

  function sendInstallStatus(status) {
    appFrame.contentWindow.postMessage(
      { type: 'ISTIGHOSAH_PWA_INSTALL_RESULT', status },
      window.location.origin
    );
  }

  window.addEventListener('appinstalled', () => {
    if (!installInProgress) return;
    installInProgress = false;
    sendInstallStatus('installed');
  });

  // Dipanggil langsung oleh tombol di iframe agar konteks klik pengguna tetap terjaga.
  window.triggerPwaInstall = () => {
    if (!deferredInstallPrompt || installInProgress) {
      sendInstallStatus('unavailable');
      return;
    }

    const promptEvent = deferredInstallPrompt;
    deferredInstallPrompt = null;
    installInProgress = true;
    sendInstallStatus('installing');

    try {
      const promptPromise = promptEvent.prompt();
      promptEvent.userChoice.then(choice => {
        if (choice?.outcome === 'dismissed') {
          // Pengguna menutup prompt; tidak perlu menampilkan notifikasi di belakang dialog.
          installInProgress = false;
        }
        // Untuk accepted, tunggu event appinstalled sebagai konfirmasi selesai.
      }).catch(error => {
        installInProgress = false;
        sendInstallStatus('unavailable');
        console.warn('Hasil instalasi tidak dapat dibaca:', error);
      });
      Promise.resolve(promptPromise).catch(error => {
        installInProgress = false;
        sendInstallStatus('unavailable');
        console.warn('Prompt instalasi gagal:', error);
      });
    } catch (error) {
      installInProgress = false;
      sendInstallStatus('unavailable');
      console.warn('Prompt instalasi gagal:', error);
    }
  };
})();
