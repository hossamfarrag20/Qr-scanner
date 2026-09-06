/**
 * Okland QR Switcher - Application Logic
 * Automatically scans QR codes and replaces specified domain (e.g. localhost:4200 -> okland.me)
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    searchDomain: localStorage.getItem('okland_search_domain') || 'http://localhost:4200',
    replaceDomain: localStorage.getItem('okland_replace_domain') || 'https://okland.me',
    autoRedirect: localStorage.getItem('okland_auto_redirect') === 'true',
    soundBeep: localStorage.getItem('okland_sound_beep') !== 'false',
    scanner: null,
    isCameraScanning: false,
    activeCameraId: null,
    cameras: [],
    history: JSON.parse(localStorage.getItem('okland_qr_history') || '[]'),
    currentTransformedUrl: null
  };

  // DOM Elements
  const elements = {
    // Badges & Settings Modal
    ruleBadgeBtn: document.getElementById('ruleBadgeBtn'),
    settingsModal: document.getElementById('settingsModal'),
    closeSettingsModal: document.getElementById('closeSettingsModal'),
    searchDomainInput: document.getElementById('searchDomainInput'),
    replaceDomainInput: document.getElementById('replaceDomainInput'),
    autoRedirectToggle: document.getElementById('autoRedirectToggle'),
    soundBeepToggle: document.getElementById('soundBeepToggle'),
    saveSettingsBtn: document.getElementById('saveSettingsBtn'),
    resetSettingsBtn: document.getElementById('resetSettingsBtn'),

    // Tabs
    tabCameraBtn: document.getElementById('tabCameraBtn'),
    tabUploadBtn: document.getElementById('tabUploadBtn'),
    cameraView: document.getElementById('cameraView'),
    uploadView: document.getElementById('uploadView'),

    // Camera Controls
    cameraSelect: document.getElementById('cameraSelect'),
    torchBtn: document.getElementById('torchBtn'),
    startCamBtn: document.getElementById('startCamBtn'),
    stopCamBtn: document.getElementById('stopCamBtn'),
    scannerOverlay: document.getElementById('scannerOverlay'),

    // File Upload
    dropzone: document.getElementById('dropzone'),
    qrFileInput: document.getElementById('qrFileInput'),
    browseFileBtn: document.getElementById('browseFileBtn'),
    filePreviewBox: document.getElementById('filePreviewBox'),
    uploadedImgPreview: document.getElementById('uploadedImgPreview'),
    uploadedFileName: document.getElementById('uploadedFileName'),
    clearFileBtn: document.getElementById('clearFileBtn'),

    // Results
    statusPill: document.getElementById('statusPill'),
    emptyResultState: document.getElementById('emptyResultState'),
    resultDetails: document.getElementById('resultDetails'),
    originalUrlDisplay: document.getElementById('originalUrlDisplay'),
    transformedUrlDisplay: document.getElementById('transformedUrlDisplay'),
    replacedFlag: document.getElementById('replacedFlag'),
    openLinkBtn: document.getElementById('openLinkBtn'),
    copyLinkBtn: document.getElementById('copyLinkBtn'),
    generateQrBtn: document.getElementById('generateQrBtn'),

    // Demo QR Generator
    demoQrCanvas: document.getElementById('demoQrCanvas'),
    scanDemoQrBtn: document.getElementById('scanDemoQrBtn'),
    downloadDemoQrBtn: document.getElementById('downloadDemoQrBtn'),

    // History
    historyEmpty: document.getElementById('historyEmpty'),
    historyList: document.getElementById('historyList'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),

    // QR Modal
    qrModal: document.getElementById('qrModal'),
    closeQrModal: document.getElementById('closeQrModal'),
    generatedQrContainer: document.getElementById('generatedQrContainer'),
    qrModalUrlText: document.getElementById('qrModalUrlText'),
    downloadQrBtn: document.getElementById('downloadQrBtn'),

    // Audio & Toasts
    beepAudio: document.getElementById('beepAudio'),
    toastContainer: document.getElementById('toastContainer')
  };

  // Initialize Scanner & Components
  initApp();

  function initApp() {
    updateSettingsUI();
    renderHistory();
    setupEventListeners();
    setupDemoQr();
    initHtml5Qrcode();
  }

  /* ==================== Settings & UI Rules ==================== */
  function updateSettingsUI() {
    elements.searchDomainInput.value = state.searchDomain;
    elements.replaceDomainInput.value = state.replaceDomain;
    elements.autoRedirectToggle.checked = state.autoRedirect;
    elements.soundBeepToggle.checked = state.soundBeep;

    // Update rule badge text
    const oldDisplay = state.searchDomain.replace(/^https?:\/\//, '');
    const newDisplay = state.replaceDomain.replace(/^https?:\/\//, '');
    elements.ruleBadgeBtn.querySelector('.rule-text').innerHTML = 
      `<code class="old-domain">${oldDisplay}</code> ➔ <code class="new-domain">${newDisplay}</code>`;
  }

  function saveSettings() {
    state.searchDomain = elements.searchDomainInput.value.trim() || 'http://localhost:4200';
    state.replaceDomain = elements.replaceDomainInput.value.trim() || 'https://okland.me';
    state.autoRedirect = elements.autoRedirectToggle.checked;
    state.soundBeep = elements.soundBeepToggle.checked;

    localStorage.setItem('okland_search_domain', state.searchDomain);
    localStorage.setItem('okland_replace_domain', state.replaceDomain);
    localStorage.setItem('okland_auto_redirect', state.autoRedirect);
    localStorage.setItem('okland_sound_beep', state.soundBeep);

    updateSettingsUI();
    closeModal(elements.settingsModal);
    showToast('تم حفظ الإعدادات بنجاح!', 'success');
  }

  /* ==================== Event Listeners ==================== */
  function setupEventListeners() {
    // Settings modal triggers
    elements.ruleBadgeBtn.addEventListener('click', () => openModal(elements.settingsModal));
    elements.closeSettingsModal.addEventListener('click', () => closeModal(elements.settingsModal));
    elements.saveSettingsBtn.addEventListener('click', saveSettings);
    elements.resetSettingsBtn.addEventListener('click', () => {
      elements.searchDomainInput.value = 'http://localhost:4200';
      elements.replaceDomainInput.value = 'https://okland.me';
      elements.autoRedirectToggle.checked = false;
      elements.soundBeepToggle.checked = true;
    });

    // Tab buttons
    elements.tabCameraBtn.addEventListener('click', () => switchTab('camera'));
    elements.tabUploadBtn.addEventListener('click', () => switchTab('upload'));

    // Camera actions
    elements.startCamBtn.addEventListener('click', startCamera);
    elements.stopCamBtn.addEventListener('click', stopCamera);
    elements.cameraSelect.addEventListener('change', (e) => {
      if (state.isCameraScanning) {
        stopCamera().then(() => {
          state.activeCameraId = e.target.value;
          startCamera();
        });
      } else {
        state.activeCameraId = e.target.value;
      }
    });

    // Upload & Drag Drop
    elements.browseFileBtn.addEventListener('click', () => elements.qrFileInput.click());
    elements.dropzone.addEventListener('click', (e) => {
      if (e.target !== elements.browseFileBtn && !elements.browseFileBtn.contains(e.target)) {
        elements.qrFileInput.click();
      }
    });
    elements.qrFileInput.addEventListener('change', handleFileSelect);

    ['dragenter', 'dragover'].forEach(eventName => {
      elements.dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        elements.dropzone.classList.add('dragover');
      }, false);
    });

    ['dragleave', 'drop'].forEach(eventName => {
      elements.dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        elements.dropzone.classList.remove('dragover');
      }, false);
    });

    elements.dropzone.addEventListener('drop', (e) => {
      const dt = e.dataTransfer;
      const files = dt.files;
      if (files && files.length > 0) {
        elements.qrFileInput.files = files;
        handleFileSelect();
      }
    });

    elements.clearFileBtn.addEventListener('click', resetFileUpload);

    // Results Quick Actions
    elements.copyLinkBtn.addEventListener('click', () => {
      if (state.currentTransformedUrl) {
        navigator.clipboard.writeText(state.currentTransformedUrl).then(() => {
          showToast('تم نسخ الرابط الجديد للحافظة!', 'success');
        }).catch(() => {
          showToast('تعذر النسخ التلقائي، يمكنك نسخه يدويًا', 'warning');
        });
      }
    });

    elements.generateQrBtn.addEventListener('click', () => {
      if (state.currentTransformedUrl) {
        openQrModal(state.currentTransformedUrl);
      }
    });

    elements.closeQrModal.addEventListener('click', () => closeModal(elements.qrModal));
    elements.downloadQrBtn.addEventListener('click', downloadGeneratedQr);

    // History Actions
    elements.clearHistoryBtn.addEventListener('click', clearHistory);

    // Demo Actions
    elements.scanDemoQrBtn.addEventListener('click', () => {
      const demoUrl = 'http://localhost:4200/activate-warranty/1753d501cbe9c462d1bfc905ab6927f9';
      handleScanSuccess(demoUrl);
      showToast('تم مسح الـ QR التجريبي بنجاح!', 'info');
    });

    elements.downloadDemoQrBtn.addEventListener('click', () => {
      const img = elements.demoQrCanvas.querySelector('img');
      if (img) {
        const a = document.createElement('a');
        a.href = img.src;
        a.download = 'demo-localhost-qr.png';
        a.click();
      }
    });
  }

  /* ==================== Tabs Switcher ==================== */
  function switchTab(tab) {
    if (tab === 'camera') {
      elements.tabCameraBtn.classList.add('active');
      elements.tabUploadBtn.classList.remove('active');
      elements.cameraView.style.display = 'flex';
      elements.uploadView.style.display = 'none';
    } else {
      elements.tabUploadBtn.classList.add('active');
      elements.tabCameraBtn.classList.remove('active');
      elements.uploadView.style.display = 'block';
      elements.cameraView.style.display = 'none';
      stopCamera();
    }
  }

  /* ==================== HTML5-QRCode Scanner ==================== */
  function initHtml5Qrcode() {
    state.scanner = new Html5Qrcode("qrReader");

    // Fetch cameras
    Html5Qrcode.getCameras().then(devices => {
      if (devices && devices.length) {
        state.cameras = devices;
        elements.cameraSelect.innerHTML = '';
        
        // Find back camera by label or fallback to last camera in devices array
        let backCamera = devices.find(cam => {
          const label = (cam.label || '').toLowerCase();
          return label.includes('back') || label.includes('rear') || label.includes('environment') || label.includes('خلف');
        });

        if (!backCamera && devices.length > 1) {
          // On mobile devices, rear cameras are usually at the end of the device list
          backCamera = devices[devices.length - 1];
        }

        const defaultCam = backCamera || devices[0];
        state.activeCameraId = defaultCam.id;

        devices.forEach((cam, index) => {
          const opt = document.createElement('option');
          opt.value = cam.id;
          opt.textContent = cam.label || (index === 0 ? 'الكاميرا الأمامية' : `الكاميرا الخلفية ${index}`);
          if (cam.id === defaultCam.id) {
            opt.selected = true;
          }
          elements.cameraSelect.appendChild(opt);
        });
      } else {
        elements.cameraSelect.innerHTML = '<option value="">لم يتم العثور على كاميرا</option>';
      }
    }).catch(err => {
      console.warn("Camera fetch error:", err);
      elements.cameraSelect.innerHTML = '<option value="">إذن الكاميرا غير مفعل</option>';
    });
  }

  function startCamera() {
    if (!state.scanner) return;

    // Default to facingMode environment (rear/back camera) if no specific camera selected
    const cameraConfig = state.activeCameraId 
      ? state.activeCameraId 
      : { facingMode: "environment" };

    const config = {
      fps: 20, // Faster frame rate for instant recognition
      qrbox: (viewfinderWidth, viewfinderHeight) => {
        // Dynamic scan box adapting to mobile screen
        const minEdge = Math.min(viewfinderWidth, viewfinderHeight);
        const boxSize = Math.max(Math.floor(minEdge * 0.75), 180);
        return { width: boxSize, height: boxSize };
      },
      experimentalFeatures: {
        useBarCodeDetectorIfSupported: true // Native Chrome/Android Barcode API for maximum speed
      }
    };

    state.scanner.start(
      cameraConfig,
      config,
      (decodedText) => {
        if (state.isProcessingScan) return;
        state.isProcessingScan = true;
        
        handleScanSuccess(decodedText);

        // Debounce scan calls by 2 seconds
        setTimeout(() => {
          state.isProcessingScan = false;
        }, 2000);
      },
      (errorMessage) => {
        // quiet fail on frame scan attempts
      }
    ).then(() => {
      state.isCameraScanning = true;
      elements.startCamBtn.style.display = 'none';
      elements.stopCamBtn.style.display = 'inline-flex';
      elements.scannerOverlay.style.display = 'flex';
      showToast('جاري المسح... وجه الكاميرا نحو كود الـ QR', 'info');

      // Enable torch if supported
      try {
        const videoTrack = state.scanner.getRunningTrack();
        if (videoTrack && videoTrack.getCapabilities && videoTrack.getCapabilities().torch) {
          elements.torchBtn.disabled = false;
          elements.torchBtn.onclick = () => {
            state.torchOn = !state.torchOn;
            videoTrack.applyConstraints({ advanced: [{ torch: state.torchOn }] });
            elements.torchBtn.style.color = state.torchOn ? '#fbbf24' : '#ffffff';
          };
        }
      } catch (e) {}
    }).catch(err => {
      console.error("Camera start failure:", err);
      // Fallback attempt with facingMode environment if specific camera ID failed
      if (typeof cameraConfig === 'string') {
        state.activeCameraId = null;
        startCamera();
        return;
      }
      showToast('تعذر فتح الكاميرا: ' + (err.message || err), 'warning');
    });
  }

  function stopCamera() {
    if (state.scanner && state.isCameraScanning) {
      return state.scanner.stop().then(() => {
        state.isCameraScanning = false;
        elements.startCamBtn.style.display = 'inline-flex';
        elements.stopCamBtn.style.display = 'none';
        elements.scannerOverlay.style.display = 'none';
        elements.torchBtn.disabled = true;
      }).catch(err => {
        console.warn("Stop scanner error:", err);
      });
    }
    return Promise.resolve();
  }

  /* ==================== File Scanner Handler ==================== */
  function handleFileSelect() {
    const file = elements.qrFileInput.files[0];
    if (!file) return;

    // Show image preview
    const reader = new FileReader();
    reader.onload = (e) => {
      elements.uploadedImgPreview.src = e.target.result;
      elements.uploadedFileName.textContent = file.name;
      elements.filePreviewBox.style.display = 'flex';
    };
    reader.readAsDataURL(file);

    // Scan file using Html5Qrcode
    if (state.scanner) {
      state.scanner.scanFile(file, true)
        .then(decodedText => {
          handleScanSuccess(decodedText);
          showToast('تم تحليل الـ QR من الصورة بنجاح!', 'success');
        })
        .catch(err => {
          showToast('لم يتم العثور على كود QR صالح في الصورة', 'warning');
        });
    }
  }

  function resetFileUpload() {
    elements.qrFileInput.value = '';
    elements.filePreviewBox.style.display = 'none';
    elements.uploadedImgPreview.src = '';
  }

  /* ==================== Domain Switcher Logic ==================== */
  function handleScanSuccess(scannedText) {
    // Haptic feedback / vibration on mobile
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }

    playBeepSound();

    let transformedText = scannedText;
    let isDomainReplaced = false;

    // Normalize search & replace strings
    const searchTarget = state.searchDomain.trim().toLowerCase();
    const replaceTarget = state.replaceDomain.trim();

    const searchBase = searchTarget.replace(/\/+$/, '');
    const replaceBase = replaceTarget.replace(/\/+$/, '');

    // Comprehensive replacement checks (localhost:4200, 127.0.0.1:4200, etc.)
    if (scannedText.toLowerCase().includes(searchBase)) {
      transformedText = scannedText.replace(new RegExp(searchBase, 'gi'), replaceBase);
      isDomainReplaced = true;
    } else if (scannedText.toLowerCase().includes('localhost:4200')) {
      transformedText = scannedText.replace(/https?:\/\/localhost:4200/gi, replaceBase);
      transformedText = transformedText.replace(/localhost:4200/gi, replaceBase.replace(/^https?:\/\//, ''));
      isDomainReplaced = true;
    } else if (scannedText.toLowerCase().includes('127.0.0.1:4200')) {
      transformedText = scannedText.replace(/https?:\/\/127\.0\.0\.1:4200/gi, replaceBase);
      transformedText = transformedText.replace(/127\.0\.0\.1:4200/gi, replaceBase.replace(/^https?:\/\//, ''));
      isDomainReplaced = true;
    }

    state.currentTransformedUrl = transformedText;

    // Update UI Results
    elements.emptyResultState.style.display = 'none';
    elements.resultDetails.style.display = 'flex';
    elements.statusPill.textContent = 'تم القراءة بنجاح';
    elements.statusPill.className = 'status-pill success';

    elements.originalUrlDisplay.textContent = scannedText;
    elements.transformedUrlDisplay.textContent = transformedText;

    if (isDomainReplaced) {
      elements.replacedFlag.style.display = 'inline-block';
      elements.replacedFlag.textContent = 'تم استبدال الدومين تلقائياً';
      elements.replacedFlag.className = 'badge badge-warning';
    } else {
      elements.replacedFlag.style.display = 'inline-block';
      elements.replacedFlag.textContent = 'نفس النطاق بدون استبدال';
      elements.replacedFlag.className = 'badge badge-success';
    }

    // Set href for Open Link button
    elements.openLinkBtn.href = transformedText;

    // Smooth scroll down to result card on mobile so user immediately sees the result
    elements.resultCard.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

    // Add to history
    saveToHistory(scannedText, transformedText, isDomainReplaced);

    // Auto-redirect check
    if (state.autoRedirect) {
      showToast('جاري التوجيه التلقائي للرابط الجديد...', 'info');
      setTimeout(() => {
        window.location.href = transformedText;
      }, 700);
    }
  }

  /* ==================== Demo QR Code Generator ==================== */
  function setupDemoQr() {
    const demoUrl = 'http://localhost:4200/activate-warranty/1753d501cbe9c462d1bfc905ab6927f9';
    elements.demoQrCanvas.innerHTML = '';
    new QRCode(elements.demoQrCanvas, {
      text: demoUrl,
      width: 130,
      height: 130,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });
  }

  /* ==================== History Management ==================== */
  function saveToHistory(original, transformed, isReplaced) {
    const item = {
      id: Date.now(),
      original,
      transformed,
      isReplaced,
      timestamp: new Date().toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
    };

    // Avoid duplicate at top
    if (state.history.length > 0 && state.history[0].transformed === transformed) {
      return;
    }

    state.history.unshift(item);
    if (state.history.length > 30) state.history.pop(); // max 30 items

    localStorage.setItem('okland_qr_history', JSON.stringify(state.history));
    renderHistory();
  }

  function renderHistory() {
    if (!state.history || state.history.length === 0) {
      elements.historyEmpty.style.display = 'block';
      elements.historyList.style.display = 'none';
      return;
    }

    elements.historyEmpty.style.display = 'none';
    elements.historyList.style.display = 'flex';
    elements.historyList.innerHTML = '';

    state.history.forEach(item => {
      const div = document.createElement('div');
      div.className = 'history-item';
      div.innerHTML = `
        <div class="history-info">
          <div class="history-urls">
            <span class="${item.isReplaced ? 'hist-old' : ''}">${truncateUrl(item.original)}</span>
            ${item.isReplaced ? `<i class="fa-solid fa-arrow-left-long"></i> <span class="hist-new">${truncateUrl(item.transformed)}</span>` : ''}
          </div>
          <span class="history-time">${item.timestamp}</span>
        </div>
        <div class="history-actions">
          <a href="${item.transformed}" target="_blank" class="btn btn-sm btn-outline-primary" title="فتح"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
          <button class="btn btn-sm btn-outline-secondary copy-hist-btn" data-url="${item.transformed}" title="نسخ"><i class="fa-solid fa-copy"></i></button>
          <button class="btn btn-sm btn-outline-danger delete-hist-btn" data-id="${item.id}" title="حذف"><i class="fa-solid fa-xmark"></i></button>
        </div>
      `;

      // Copy event
      div.querySelector('.copy-hist-btn').addEventListener('click', (e) => {
        const url = e.currentTarget.getAttribute('data-url');
        navigator.clipboard.writeText(url).then(() => {
          showToast('تم نسخ الرابط!', 'success');
        });
      });

      // Delete item
      div.querySelector('.delete-hist-btn').addEventListener('click', (e) => {
        const id = Number(e.currentTarget.getAttribute('data-id'));
        state.history = state.history.filter(h => h.id !== id);
        localStorage.setItem('okland_qr_history', JSON.stringify(state.history));
        renderHistory();
      });

      elements.historyList.appendChild(div);
    });
  }

  function clearHistory() {
    if (confirm('هل أنت تأكد من مسح جميع السجلات؟')) {
      state.history = [];
      localStorage.setItem('okland_qr_history', '[]');
      renderHistory();
      showToast('تم تفريغ السجل بنجاح', 'info');
    }
  }

  function truncateUrl(str, len = 35) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
  }

  /* ==================== QR Generator Modal ==================== */
  function openQrModal(url) {
    elements.generatedQrContainer.innerHTML = '';
    elements.qrModalUrlText.textContent = url;

    new QRCode(elements.generatedQrContainer, {
      text: url,
      width: 200,
      height: 200,
      colorDark: "#0f172a",
      colorLight: "#ffffff",
      correctLevel: QRCode.CorrectLevel.H
    });

    openModal(elements.qrModal);
  }

  function downloadGeneratedQr() {
    const img = elements.generatedQrContainer.querySelector('img');
    const canvas = elements.generatedQrContainer.querySelector('canvas');

    let dataUrl = null;
    if (img && img.src) dataUrl = img.src;
    else if (canvas) dataUrl = canvas.toDataURL("image/png");

    if (dataUrl) {
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'okland-qr-code.png';
      a.click();
      showToast('تم تحميل صورة الـ QR الجديدة!', 'success');
    }
  }

  /* ==================== Sound & Modals Helpers ==================== */
  function playBeepSound() {
    if (!state.soundBeep) return;
    try {
      if (elements.beepAudio) {
        elements.beepAudio.currentTime = 0;
        elements.beepAudio.play().catch(() => playWebAudioBeep());
      } else {
        playWebAudioBeep();
      }
    } catch (e) {
      playWebAudioBeep();
    }
  }

  function playWebAudioBeep() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880; // A5 tone
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  }

  function openModal(modalEl) {
    modalEl.classList.add('active');
  }

  function closeModal(modalEl) {
    modalEl.classList.remove('active');
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = 'fa-circle-info';
    if (type === 'success') icon = 'fa-circle-check';
    if (type === 'warning') icon = 'fa-triangle-exclamation';

    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
});
