/**
 * OKLAND WARRANTY SYSTEM - QR Scanner & Instant Redirect Logic
 */

document.addEventListener('DOMContentLoaded', () => {
  // Application State
  const state = {
    searchDomain: 'http://localhost:4200',
    replaceDomain: 'https://okland.me',
    scanner: null,
    mediaStream: null,
    animFrameId: null,
    barcodeDetector: null,
    isCameraScanning: false,
    activeCameraId: null,
    cameras: [],
    history: JSON.parse(localStorage.getItem('okland_qr_history') || '[]'),
    currentTransformedUrl: null,
    isProcessingScan: false,
    torchOn: false
  };

  // DOM Elements
  const elements = {
    // Tabs
    tabCameraBtn: document.getElementById('tabCameraBtn'),
    tabUploadBtn: document.getElementById('tabUploadBtn'),
    cameraView: document.getElementById('cameraView'),
    uploadView: document.getElementById('uploadView'),

    // Camera Controls & Elements
    cameraSelect: document.getElementById('cameraSelect'),
    torchBtn: document.getElementById('torchBtn'),
    startCamBtn: document.getElementById('startCamBtn'),
    stopCamBtn: document.getElementById('stopCamBtn'),
    scannerOverlay: document.getElementById('scannerOverlay'),
    cameraVideo: document.getElementById('cameraVideo'),
    scanCanvas: document.getElementById('scanCanvas'),
    qrReader: document.getElementById('qrReader'),

    // File Upload
    dropzone: document.getElementById('dropzone'),
    qrFileInput: document.getElementById('qrFileInput'),
    browseFileBtn: document.getElementById('browseFileBtn'),
    filePreviewBox: document.getElementById('filePreviewBox'),
    uploadedImgPreview: document.getElementById('uploadedImgPreview'),
    uploadedFileName: document.getElementById('uploadedFileName'),
    clearFileBtn: document.getElementById('clearFileBtn'),

    // History
    historyEmpty: document.getElementById('historyEmpty'),
    historyList: document.getElementById('historyList'),
    clearHistoryBtn: document.getElementById('clearHistoryBtn'),

    // Audio & Toasts
    beepAudio: document.getElementById('beepAudio'),
    toastContainer: document.getElementById('toastContainer')
  };

  // Native BarcodeDetector initialization for microsecond GPU speed on Android Chrome/Edge
  if ('BarcodeDetector' in window) {
    try {
      state.barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
    } catch(e) {
      state.barcodeDetector = null;
    }
  }

  // Push history state to ensure Back button returns to this scanner page instead of exiting browser
  pushHistoryState();

  // Initialize App
  initApp();

  function pushHistoryState() {
    try {
      if (window.history && window.history.pushState) {
        if (!window.history.state || !window.history.state.oklandScanner) {
          window.history.pushState({ oklandScanner: true, t: Date.now() }, document.title, window.location.href);
        }
      }
    } catch (e) {}
  }

  // Handle returning to page via browser Back button
  window.addEventListener('pageshow', (event) => {
    pushHistoryState();
    if (event.persisted || (performance && performance.getEntriesByType && performance.getEntriesByType('navigation')[0]?.type === 'back_forward')) {
      state.isProcessingScan = true;
      showToast('مرحباً بعودتك! جاهز لقراءة كود جديد', 'info');
      setTimeout(() => {
        state.isProcessingScan = false;
      }, 2500);
    }
  });

  window.addEventListener('popstate', () => {
    pushHistoryState();
  });

  function initApp() {
    renderHistory();
    setupEventListeners();
    initCameraList();

    // Auto-start camera immediately when user opens website
    setTimeout(() => {
      startCamera();
    }, 300);
  }

  /* ==================== Event Listeners ==================== */
  function setupEventListeners() {
    // Tab buttons
    elements.tabCameraBtn.addEventListener('click', () => switchTab('camera'));
    elements.tabUploadBtn.addEventListener('click', () => switchTab('upload'));

    // Camera actions
    elements.startCamBtn.addEventListener('click', startCamera);
    elements.stopCamBtn.addEventListener('click', stopCamera);
    elements.cameraSelect.addEventListener('change', (e) => {
      state.activeCameraId = e.target.value;
      if (state.isCameraScanning) {
        startCamera();
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

    // History Actions
    elements.clearHistoryBtn.addEventListener('click', clearHistory);
  }

  function closeResultModal() {
    if (elements.resultModal) {
      elements.resultModal.style.display = 'none';
    }
    setTimeout(() => {
      state.isProcessingScan = false;
    }, 500);
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

  /* ==================== Camera Enumeration ==================== */
  function initCameraList() {
    if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices().then(devices => {
        const videoDevices = devices.filter(d => d.kind === 'videoinput');
        if (videoDevices.length) {
          state.cameras = videoDevices;
          elements.cameraSelect.innerHTML = '';
          
          let backCamera = videoDevices.find(cam => {
            const label = (cam.label || '').toLowerCase();
            return label.includes('back') || label.includes('rear') || label.includes('environment') || label.includes('خلف');
          });

          if (!backCamera && videoDevices.length > 1) {
            backCamera = videoDevices[videoDevices.length - 1];
          }

          const defaultCam = backCamera || videoDevices[0];
          state.activeCameraId = defaultCam.deviceId;

          videoDevices.forEach((cam, index) => {
            const opt = document.createElement('option');
            opt.value = cam.deviceId;
            opt.textContent = cam.label || (index === 0 ? 'الكاميرا الأمامية' : `الكاميرا الخلفية ${index}`);
            if (cam.deviceId === defaultCam.deviceId) {
              opt.selected = true;
            }
            elements.cameraSelect.appendChild(opt);
          });
        } else {
          elements.cameraSelect.innerHTML = '<option value="">الكاميرا جاهزة للتفعيل</option>';
        }
      }).catch(() => {
        elements.cameraSelect.innerHTML = '<option value="">الكاميرا جاهزة للتفعيل</option>';
      });
    }

    if (window.Html5Qrcode) {
      state.scanner = new Html5Qrcode("qrReader");
    }
  }

  /* ==================== High Speed Ultra Scan Engine ==================== */
  async function startCamera() {
    await stopCamera();

    const constraints = {
      audio: false,
      video: {
        facingMode: state.activeCameraId ? undefined : { ideal: "environment" },
        deviceId: state.activeCameraId ? { exact: state.activeCameraId } : undefined,
        width: { ideal: 1280, min: 640 },
        height: { ideal: 720, min: 480 },
        frameRate: { ideal: 30, min: 15 },
        focusMode: { ideal: "continuous" }
      }
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      state.mediaStream = stream;
      elements.cameraVideo.srcObject = stream;
      elements.cameraVideo.style.display = 'block';
      elements.qrReader.style.display = 'none';

      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack && videoTrack.applyConstraints) {
        videoTrack.applyConstraints({
          advanced: [{ focusMode: "continuous" }]
        }).catch(() => {});

        if (videoTrack.getCapabilities && videoTrack.getCapabilities().torch) {
          elements.torchBtn.disabled = false;
          elements.torchBtn.onclick = () => {
            state.torchOn = !state.torchOn;
            videoTrack.applyConstraints({ advanced: [{ torch: state.torchOn }] });
            elements.torchBtn.style.color = state.torchOn ? '#ff9f1c' : '#ffffff';
          };
        }
      }

      await elements.cameraVideo.play();
      state.isCameraScanning = true;
      elements.startCamBtn.style.display = 'none';
      elements.stopCamBtn.style.display = 'inline-flex';
      elements.scannerOverlay.style.display = 'flex';

      startUltraScanLoop();

    } catch (err) {
      console.warn("Direct getUserMedia Ultra engine failed, trying fallback:", err);
      startCameraHtml5QrcodeFallback();
    }
  }

  function startUltraScanLoop() {
    const video = elements.cameraVideo;
    const canvas = elements.scanCanvas;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    async function scanFrame() {
      if (!state.isCameraScanning || !video) return;

      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        let detectedResult = null;

        // Engine A: Hardware BarcodeDetector API (Zero CPU overhead)
        if (state.barcodeDetector && !state.isProcessingScan) {
          try {
            const barcodes = await state.barcodeDetector.detect(video);
            if (barcodes && barcodes.length > 0) {
              detectedResult = barcodes[0].rawValue;
            }
          } catch (e) {}
        }

        // Engine B: Ultra-Fast Downscaled jsQR Engine with Dual Inversion Detection
        if (!detectedResult && window.jsQR && !state.isProcessingScan) {
          const videoWidth = video.videoWidth || 640;
          const videoHeight = video.videoHeight || 480;

          // Scale canvas down to max width 640px for 10x faster execution without resolution loss
          const scale = Math.min(1, 640 / videoWidth);
          canvas.width = Math.floor(videoWidth * scale);
          canvas.height = Math.floor(videoHeight * scale);

          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          
          const code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: "attemptBoth"
          });
          if (code && code.data) {
            detectedResult = code.data;
          }
        }

        if (detectedResult && !state.isProcessingScan) {
          state.isProcessingScan = true;
          handleScanSuccess(detectedResult);
          setTimeout(() => { state.isProcessingScan = false; }, 3000);
        }
      }

      if (state.isCameraScanning) {
        state.animFrameId = requestAnimationFrame(scanFrame);
      }
    }

    state.animFrameId = requestAnimationFrame(scanFrame);
  }

  function startCameraHtml5QrcodeFallback() {
    elements.cameraVideo.style.display = 'none';
    elements.qrReader.style.display = 'block';

    if (!state.scanner) {
      state.scanner = new Html5Qrcode("qrReader");
    }

    const cameraConfig = state.activeCameraId ? state.activeCameraId : { facingMode: "environment" };
    state.scanner.start(
      cameraConfig,
      { fps: 25, qrbox: { width: 250, height: 250 } },
      (decodedText) => {
        if (state.isProcessingScan) return;
        state.isProcessingScan = true;
        handleScanSuccess(decodedText);
        setTimeout(() => { state.isProcessingScan = false; }, 2000);
      },
      () => {}
    ).then(() => {
      state.isCameraScanning = true;
      elements.startCamBtn.style.display = 'none';
      elements.stopCamBtn.style.display = 'inline-flex';
      elements.scannerOverlay.style.display = 'flex';
    }).catch(err => {
      showToast('تعذر فتح الكاميرا: ' + (err.message || err), 'warning');
    });
  }

  function stopCamera() {
    if (state.animFrameId) {
      cancelAnimationFrame(state.animFrameId);
      state.animFrameId = null;
    }
    if (state.mediaStream) {
      state.mediaStream.getTracks().forEach(track => track.stop());
      state.mediaStream = null;
    }
    if (state.scanner && state.isCameraScanning) {
      state.scanner.stop().catch(() => {});
    }
    state.isCameraScanning = false;
    elements.startCamBtn.style.display = 'inline-flex';
    elements.stopCamBtn.style.display = 'none';
    elements.scannerOverlay.style.display = 'none';
    elements.torchBtn.disabled = true;
    if (elements.cameraVideo) {
      elements.cameraVideo.style.display = 'none';
    }
    return Promise.resolve();
  }

  /* ==================== File Scanner Handler ==================== */
  function handleFileSelect() {
    const file = elements.qrFileInput.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      elements.uploadedImgPreview.src = e.target.result;
      elements.uploadedFileName.textContent = file.name;
      elements.filePreviewBox.style.display = 'flex';
    };
    reader.readAsDataURL(file);

    if (state.scanner) {
      state.scanner.scanFile(file, true)
        .then(decodedText => {
          handleScanSuccess(decodedText);
          showToast('تم تحليل الـ QR بنجاح!', 'success');
        })
        .catch(() => {
          showToast('لم يتم العثور على كود QR صالح في الصورة', 'warning');
        });
    }
  }

  function resetFileUpload() {
    elements.qrFileInput.value = '';
    elements.filePreviewBox.style.display = 'none';
    elements.uploadedImgPreview.src = '';
  }

  /* ==================== Domain Switcher Logic & Direct Redirection ==================== */
  function handleScanSuccess(scannedText) {
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }

    playBeepSound();

    let transformedText = scannedText;
    let isDomainReplaced = false;

    const searchBase = 'http://localhost:4200';
    const replaceBase = 'https://okland.me';

    if (scannedText.toLowerCase().includes('localhost:4200')) {
      transformedText = scannedText.replace(/https?:\/\/localhost:4200/gi, replaceBase);
      transformedText = transformedText.replace(/localhost:4200/gi, replaceBase.replace(/^https?:\/\//, ''));
      isDomainReplaced = true;
    } else if (scannedText.toLowerCase().includes('127.0.0.1:4200')) {
      transformedText = scannedText.replace(/https?:\/\/127\.0\.0\.1:4200/gi, replaceBase);
      transformedText = transformedText.replace(/127\.0\.0\.1:4200/gi, replaceBase.replace(/^https?:\/\//, ''));
      isDomainReplaced = true;
    }

    state.currentTransformedUrl = transformedText;
    saveToHistory(scannedText, transformedText, isDomainReplaced);

    showToast('تم القراءة بنجاح! جاري فتح الرابط في تبويب جديد...', 'success');

    // Automatically open link in new tab so user can return to scanner page anytime
    const win = window.open(transformedText, '_blank');
    if (!win || win.closed || typeof win.closed === 'undefined') {
      // Fallback if popup blocker blocks _blank window
      window.location.assign(transformedText);
    } else {
      setTimeout(() => {
        state.isProcessingScan = false;
      }, 3000);
    }
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

    if (state.history.length > 0 && state.history[0].transformed === transformed) {
      return;
    }

    state.history.unshift(item);
    if (state.history.length > 30) state.history.pop();

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
            <span class="${item.isReplaced ? 'hist-old' : ''}" title="${escapeHtml(item.original)}">${truncateUrl(item.original, 28)}</span>
            ${item.isReplaced ? `<i class="fa-solid fa-arrow-left-long hist-arrow"></i> <span class="hist-new" title="${escapeHtml(item.transformed)}">${truncateUrl(item.transformed, 28)}</span>` : ''}
          </div>
          <span class="history-time">${item.timestamp}</span>
        </div>
        <div class="history-actions">
          <a href="${item.transformed}" target="_blank" rel="noopener" class="btn btn-sm btn-primary" title="فتح الرابط"><i class="fa-solid fa-arrow-up-right-from-square"></i></a>
          <button class="btn btn-sm btn-secondary copy-hist-btn" data-url="${item.transformed}" title="نسخ الرابط"><i class="fa-solid fa-copy"></i></button>
          <button class="btn btn-sm btn-outline-danger delete-hist-btn" data-id="${item.id}" title="حذف من السجل"><i class="fa-solid fa-xmark"></i></button>
        </div>
      `;

      div.querySelector('.copy-hist-btn').addEventListener('click', (e) => {
        const url = e.currentTarget.getAttribute('data-url');
        navigator.clipboard.writeText(url).then(() => {
          showToast('تم نسخ الرابط!', 'success');
        });
      });

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

  function truncateUrl(str, len = 28) {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /* ==================== Audio Helpers ==================== */
  function playBeepSound() {
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
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.1, ctx.currentTime);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  }

  function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    let icon = type === 'success' ? 'fa-circle-check' : 'fa-circle-info';
    toast.innerHTML = `<i class="fa-solid ${icon}"></i> <span>${message}</span>`;
    elements.toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  }
});
