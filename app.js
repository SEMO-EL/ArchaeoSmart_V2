/* ArchaeoSmart — app.js */
'use strict';

// ─── State ───────────────────────────────────────────────────────────────────
let artifacts = [];
let currentArtifact = null;

// Drawing
let drawCtx, drawCanvas;
let fsCtx, fsCanvas;
let isDrawing = false;
let lastX = 0, lastY = 0;

// Map
let map = null;
let mapMarkers = [];

// Voice
let mediaRecorder = null;
let audioChunks = [];
let audioBlob = null;
let voiceRecording = false;

// Speech recognition
let recognition = null;

// QR Scanner
let html5QrCode = null;

// PWA
let deferredPrompt = null;

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  loadArtifacts();
  setupNav();
  setupBackground();
  setupDrawCanvas();
  setupDate();
  updateStats();
  setupPWA();
  registerServiceWorker();
  createToast();
});

function setupDate() {
  const d = document.getElementById('fDate');
  if (d) d.value = new Date().toISOString().split('T')[0];
}

// ─── Background Floating Icons ─────────────────────────────────────────────
function setupBackground() {
  const icons = ['💀','🦷','🦴','⚱','🏺','🪨','🔍','📜','⛏','🧪'];
  const bg = document.getElementById('bgLayer');
  for (let i = 0; i < 20; i++) {
    const el = document.createElement('div');
    el.className = 'bg-icon';
    el.textContent = icons[Math.floor(Math.random() * icons.length)];
    el.style.left = Math.random() * 100 + '%';
    el.style.animationDuration = (12 + Math.random() * 20) + 's';
    el.style.animationDelay = -(Math.random() * 30) + 's';
    el.style.fontSize = (1.2 + Math.random() * 1.5) + 'rem';
    bg.appendChild(el);
  }
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function setupNav() {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      goToScreen(btn.dataset.screen);
    });
  });
}

function goToScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.screen === name);
  });
  const s = document.getElementById('screen-' + name);
  if (s) s.classList.add('active');

  if (name === 'map') initMap();
  if (name === 'database') renderArtifacts();
  if (name === 'scan') startScanner();
  if (name !== 'scan') stopScanner();
}

// ─── LocalStorage ─────────────────────────────────────────────────────────────
function loadArtifacts() {
  try {
    const raw = localStorage.getItem('archaeosmart_artifacts');
    artifacts = raw ? JSON.parse(raw) : [];
  } catch (e) {
    artifacts = [];
  }
}

function saveArtifacts() {
  localStorage.setItem('archaeosmart_artifacts', JSON.stringify(artifacts));
}

// ─── Stats ────────────────────────────────────────────────────────────────────
function updateStats() {
  const total = artifacts.length;
  const sites = new Set(artifacts.map(a => a.site).filter(Boolean)).size;
  const gps = artifacts.filter(a => a.lat && a.lng).length;

  document.getElementById('statTotal').textContent = total;
  document.getElementById('statSites').textContent = sites;
  document.getElementById('statGPS').textContent = gps;
  document.getElementById('dbCount').textContent = `${total} artifact${total !== 1 ? 's' : ''} recorded`;
}

// ─── GPS ─────────────────────────────────────────────────────────────────────
function captureGPS() {
  const btn = document.getElementById('gpsBtn');
  const status = document.getElementById('gpsStatus');
  if (!navigator.geolocation) {
    status.textContent = 'Geolocation not supported on this device.';
    return;
  }
  btn.textContent = '⌛ Acquiring…';
  btn.disabled = true;
  navigator.geolocation.getCurrentPosition(
    pos => {
      document.getElementById('fLat').value = pos.coords.latitude.toFixed(6);
      document.getElementById('fLng').value = pos.coords.longitude.toFixed(6);
      status.textContent = `✓ GPS acquired (±${Math.round(pos.coords.accuracy)}m accuracy)`;
      btn.textContent = '📍 Update GPS';
      btn.disabled = false;
    },
    err => {
      status.textContent = `GPS error: ${err.message}`;
      btn.textContent = '📍 Get GPS';
      btn.disabled = false;
    },
    { enableHighAccuracy: true, timeout: 15000 }
  );
}

// ─── Photo ────────────────────────────────────────────────────────────────────
function handlePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    const img = document.createElement('img');
    img.src = e.target.result;
    const preview = document.getElementById('photoPreview');
    preview.innerHTML = '';
    preview.appendChild(img);
  };
  reader.readAsDataURL(file);
}

// ─── Voice Recording ─────────────────────────────────────────────────────────
function toggleVoiceRecord() {
  const btn = document.getElementById('voiceRecordBtn');
  const status = document.getElementById('voiceStatus');

  if (!voiceRecording) {
    navigator.mediaDevices.getUserMedia({ audio: true })
      .then(stream => {
        audioChunks = [];
        mediaRecorder = new MediaRecorder(stream);
        mediaRecorder.ondataavailable = e => audioChunks.push(e.data);
        mediaRecorder.onstop = () => {
          audioBlob = new Blob(audioChunks, { type: 'audio/webm' });
          const url = URL.createObjectURL(audioBlob);
          const playback = document.getElementById('voicePlayback');
          playback.src = url;
          playback.style.display = 'block';
          stream.getTracks().forEach(t => t.stop());
        };
        mediaRecorder.start();
        voiceRecording = true;
        btn.textContent = '⏹ Stop Recording';
        btn.classList.add('recording');
        status.textContent = '🔴 Recording…';
      })
      .catch(err => {
        status.textContent = 'Microphone access denied.';
      });
  } else {
    mediaRecorder.stop();
    voiceRecording = false;
    btn.textContent = '🎙 Start Recording';
    btn.classList.remove('recording');
    status.textContent = '✓ Recording saved';
  }
}

// ─── Speech-to-Text ──────────────────────────────────────────────────────────
function startSTT() {
  const status = document.getElementById('voiceStatus');
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SpeechRec) {
    status.textContent = 'Speech recognition not supported in this browser.';
    return;
  }
  recognition = new SpeechRec();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = 'en-US';
  recognition.onresult = e => {
    const txt = Array.from(e.results).map(r => r[0].transcript).join(' ');
    document.getElementById('fVoiceText').value = txt;
  };
  recognition.onerror = () => { status.textContent = 'Speech recognition error.'; };
  recognition.onend = () => { status.textContent = '✓ Speech-to-text complete'; };
  recognition.start();
  status.textContent = '🎤 Listening… speak now';

  // auto-stop after 10s
  setTimeout(() => { if (recognition) recognition.stop(); }, 10000);
}

// ─── Drawing Canvas ───────────────────────────────────────────────────────────
function setupDrawCanvas() {
  drawCanvas = document.getElementById('drawCanvas');
  if (!drawCanvas) return;
  drawCtx = drawCanvas.getContext('2d');
  resizeCanvas(drawCanvas);
  addDrawEvents(drawCanvas, drawCtx, false);

  window.addEventListener('resize', () => {
    const img = drawCanvas.toDataURL();
    resizeCanvas(drawCanvas);
    const i = new Image();
    i.onload = () => drawCtx.drawImage(i, 0, 0);
    i.src = img;
  });
}

function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);
}

function addDrawEvents(canvas, ctx, isFS) {
  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const touch = e.touches ? e.touches[0] : e;
    return {
      x: (touch.clientX - rect.left),
      y: (touch.clientY - rect.top)
    };
  };

  const getSettings = () => {
    if (isFS) {
      return {
        color: document.getElementById('fsBrushColor').value,
        size: parseInt(document.getElementById('fsBrushSize').value),
        opacity: parseFloat(document.getElementById('fsBrushOpacity').value)
      };
    }
    return {
      color: document.getElementById('brushColor').value,
      size: parseInt(document.getElementById('brushSize').value),
      opacity: parseFloat(document.getElementById('brushOpacity').value)
    };
  };

  const startDraw = (e) => {
    e.preventDefault();
    isDrawing = true;
    const pos = getPos(e);
    lastX = pos.x;
    lastY = pos.y;
  };

  const draw = (e) => {
    if (!isDrawing) return;
    e.preventDefault();
    const pos = getPos(e);
    const s = getSettings();
    ctx.beginPath();
    ctx.moveTo(lastX, lastY);
    ctx.lineTo(pos.x, pos.y);
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size;
    ctx.globalAlpha = s.opacity;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();
    lastX = pos.x;
    lastY = pos.y;
  };

  const stopDraw = () => { isDrawing = false; ctx.globalAlpha = 1; };

  canvas.addEventListener('mousedown', startDraw);
  canvas.addEventListener('mousemove', draw);
  canvas.addEventListener('mouseup', stopDraw);
  canvas.addEventListener('mouseleave', stopDraw);
  canvas.addEventListener('touchstart', startDraw, { passive: false });
  canvas.addEventListener('touchmove', draw, { passive: false });
  canvas.addEventListener('touchend', stopDraw);
}

function clearCanvas() {
  if (!drawCtx) return;
  drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
}

// ─── Fullscreen Drawing ──────────────────────────────────────────────────────
function openFullscreenDraw() {
  const fs = document.getElementById('fullscreenDraw');
  fs.style.display = 'flex';
  fsCanvas = document.getElementById('fsCanvas');

  // Size canvas
  const toolbar = fs.querySelector('.fs-toolbar');
  const h = window.innerHeight - toolbar.offsetHeight;
  fsCanvas.style.height = h + 'px';
  fsCanvas.style.width = '100%';
  fsCanvas.width = window.innerWidth * (window.devicePixelRatio || 1);
  fsCanvas.height = h * (window.devicePixelRatio || 1);

  fsCtx = fsCanvas.getContext('2d');
  fsCtx.scale(window.devicePixelRatio || 1, window.devicePixelRatio || 1);

  // Copy current drawing in
  const existing = drawCanvas.toDataURL();
  if (existing) {
    const img = new Image();
    img.onload = () => {
      fsCtx.drawImage(img, 0, 0, window.innerWidth, h);
    };
    img.src = existing;
  }

  addDrawEvents(fsCanvas, fsCtx, true);
}

function clearFSCanvas() {
  if (!fsCtx) return;
  fsCtx.clearRect(0, 0, fsCanvas.width, fsCanvas.height);
}

function closeFSDraw() {
  const fs = document.getElementById('fullscreenDraw');
  // Copy back to small canvas
  const img = new Image();
  img.onload = () => {
    const rect = drawCanvas.getBoundingClientRect();
    drawCtx.clearRect(0, 0, rect.width, rect.height);
    drawCtx.drawImage(img, 0, 0, rect.width, rect.height);
  };
  img.src = fsCanvas.toDataURL();
  fs.style.display = 'none';
}

// ─── Save Artifact ────────────────────────────────────────────────────────────
function saveArtifact() {
  const site = document.getElementById('fSite').value.trim();
  const type = document.getElementById('fType').value;
  const depth = document.getElementById('fDepth').value;
  const date = document.getElementById('fDate').value;
  const lat = document.getElementById('fLat').value;
  const lng = document.getElementById('fLng').value;
  const notes = document.getElementById('fNotes').value.trim();
  const voiceText = document.getElementById('fVoiceText').value.trim();

  if (!site && !type) {
    showToast('Add at least a site or artifact type');
    return;
  }

  const photoImg = document.querySelector('#photoPreview img');
  const photo = photoImg ? photoImg.src : null;
  const drawing = drawCanvas ? drawCanvas.toDataURL() : null;

  let voiceData = null;
  if (audioBlob) {
    const reader = new FileReader();
    reader.onload = e => {
      voiceData = e.target.result;
      finishSave(site, type, depth, date, lat, lng, notes, voiceText, photo, drawing, voiceData);
    };
    reader.readAsDataURL(audioBlob);
  } else {
    finishSave(site, type, depth, date, lat, lng, notes, voiceText, photo, drawing, null);
  }
}

function finishSave(site, type, depth, date, lat, lng, notes, voiceText, photo, drawing, voiceData) {
  const artifact = {
    id: 'ART-' + Date.now(),
    site, type, depth, date, lat, lng, notes, voiceText, photo, drawing, voiceData,
    created: new Date().toISOString()
  };

  artifacts.unshift(artifact);
  saveArtifacts();
  updateStats();
  resetForm();
  showToast('⚱ Artifact recorded successfully');
  goToScreen('home');
}

function resetForm() {
  document.getElementById('fSite').value = '';
  document.getElementById('fType').value = '';
  document.getElementById('fDepth').value = '';
  document.getElementById('fLat').value = '';
  document.getElementById('fLng').value = '';
  document.getElementById('fNotes').value = '';
  document.getElementById('fVoiceText').value = '';
  document.getElementById('gpsStatus').textContent = '';
  document.getElementById('voiceStatus').textContent = '';
  document.getElementById('photoPreview').innerHTML = '';
  document.getElementById('voicePlayback').style.display = 'none';
  if (drawCtx) drawCtx.clearRect(0, 0, drawCanvas.width, drawCanvas.height);
  audioBlob = null;
  setupDate();
}

// ─── Database / Rendering ─────────────────────────────────────────────────────
const typeIcons = {
  'Ceramic / Pottery': '🏺',
  'Lithic / Stone Tool': '🪨',
  'Bone / Faunal': '🦴',
  'Metal Object': '⚙',
  'Glass': '💠',
  'Organic Material': '🌿',
  'Architectural': '🧱',
  'Coin / Currency': '🪙',
  'Inscription': '📜',
  'Figurine': '🗿',
  'Other': '❓',
};

function getIcon(type) {
  return typeIcons[type] || '⚱';
}

function renderArtifacts(query = '') {
  const list = document.getElementById('artifactList');
  const q = query.toLowerCase();
  const filtered = artifacts.filter(a =>
    !q ||
    a.id?.toLowerCase().includes(q) ||
    a.site?.toLowerCase().includes(q) ||
    a.type?.toLowerCase().includes(q) ||
    a.notes?.toLowerCase().includes(q)
  );

  if (!filtered.length) {
    list.innerHTML = `<div style="text-align:center;color:var(--text-dim);padding:32px;font-style:italic">
      ${artifacts.length === 0 ? 'No artifacts recorded yet.' : 'No matching artifacts.'}
    </div>`;
    return;
  }

  list.innerHTML = filtered.map(a => `
    <div class="artifact-card" onclick="openDetail('${a.id}')">
      <div class="artifact-card-icon">${getIcon(a.type)}</div>
      <div class="artifact-card-info">
        <div class="artifact-card-id">${a.id}</div>
        <div class="artifact-card-type">${a.type || 'Unknown type'}</div>
        <div class="artifact-card-site">${a.site || 'Unknown site'}${a.depth ? ' · ' + a.depth + 'cm' : ''}${a.date ? ' · ' + a.date : ''}</div>
      </div>
      <div class="artifact-card-badges">
        ${a.lat ? '<span class="badge">📍</span>' : ''}
        ${a.photo ? '<span class="badge">📷</span>' : ''}
        ${a.voiceData ? '<span class="badge">🎙</span>' : ''}
        ${a.drawing ? '<span class="badge">✏</span>' : ''}
      </div>
    </div>
  `).join('');

  document.getElementById('dbCount').textContent = `${filtered.length} of ${artifacts.length} artifact${artifacts.length !== 1 ? 's' : ''}`;
}

function filterArtifacts(q) {
  renderArtifacts(q);
}

// ─── Artifact Detail Modal ────────────────────────────────────────────────────
function openDetail(id) {
  const a = artifacts.find(x => x.id === id);
  if (!a) return;
  currentArtifact = a;

  const modal = document.getElementById('detailModal');
  const content = document.getElementById('detailContent');

  content.innerHTML = `
    <div class="detail-header">
      <div class="detail-id">${a.id}</div>
      <div class="detail-type">${getIcon(a.type)} ${a.type || 'Unknown Type'}</div>
      <div class="detail-site">${a.site || 'Unknown site'}</div>
    </div>
    <div class="detail-fields">
      ${a.depth ? `<div class="detail-field"><div class="detail-field-label">Depth</div><div class="detail-field-value">${a.depth} cm</div></div>` : ''}
      ${a.date ? `<div class="detail-field"><div class="detail-field-label">Date</div><div class="detail-field-value">${a.date}</div></div>` : ''}
      ${a.lat && a.lng ? `<div class="detail-field"><div class="detail-field-label">GPS</div><div class="detail-field-value">${a.lat}, ${a.lng}</div></div>` : ''}
      ${a.notes ? `<div class="detail-field"><div class="detail-field-label">Field Notes</div><div class="detail-field-value">${a.notes}</div></div>` : ''}
      ${a.voiceText ? `<div class="detail-field"><div class="detail-field-label">Voice Notes (STT)</div><div class="detail-field-value">${a.voiceText}</div></div>` : ''}
      ${a.voiceData ? `<div class="detail-field"><div class="detail-field-label">Voice Recording</div><audio controls src="${a.voiceData}" style="width:100%"></audio></div>` : ''}
      ${a.photo ? `<div class="detail-field"><div class="detail-field-label">Photo</div><img class="detail-img" src="${a.photo}" alt="Artifact photo"></div>` : ''}
      ${a.drawing ? `<div class="detail-field"><div class="detail-field-label">Drawing</div><img class="detail-drawing" src="${a.drawing}" alt="Artifact sketch"></div>` : ''}
    </div>
    <div class="detail-field" style="margin-top:16px">
      <div class="detail-field-label">QR Code</div>
      <div id="qrDisplay"></div>
    </div>
    <div class="detail-actions">
      <button class="icon-btn small" onclick="deleteArtifact('${a.id}')">🗑 Delete</button>
    </div>
  `;

  modal.style.display = 'block';

  // Generate QR
  setTimeout(() => {
    const qrEl = document.getElementById('qrDisplay');
    if (qrEl && window.QRCode) {
      new QRCode(qrEl, {
        text: a.id,
        width: 160,
        height: 160,
        colorDark: '#1a1207',
        colorLight: '#f5edd6',
      });
    }
  }, 50);
}

function closeModal() {
  document.getElementById('detailModal').style.display = 'none';
  currentArtifact = null;
}

function deleteArtifact(id) {
  if (!confirm('Delete this artifact record? This cannot be undone.')) return;
  artifacts = artifacts.filter(a => a.id !== id);
  saveArtifacts();
  updateStats();
  closeModal();
  renderArtifacts(document.getElementById('searchInput').value);
  showToast('Artifact deleted');
}

// ─── Map ──────────────────────────────────────────────────────────────────────
function initMap() {
  const container = document.getElementById('mapContainer');
  if (!container) return;

  if (!map) {
    map = L.map('mapContainer', { zoomControl: true }).setView([30, 0], 2);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19
    }).addTo(map);
  }

  // Clear existing markers
  mapMarkers.forEach(m => map.removeLayer(m));
  mapMarkers = [];

  const geo = artifacts.filter(a => a.lat && a.lng);

  if (geo.length) {
    geo.forEach((a, i) => {
      const lat = parseFloat(a.lat) + (Math.random() - 0.5) * 0.00005 * (i % 5);
      const lng = parseFloat(a.lng) + (Math.random() - 0.5) * 0.00005 * (i % 5);
      const icon = L.divIcon({
        className: '',
        html: `<div style="background:#c9a84c;border:2px solid #1a1207;border-radius:50%;width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-size:14px;cursor:pointer;box-shadow:0 2px 8px rgba(0,0,0,0.5)">${getIcon(a.type)}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      const marker = L.marker([lat, lng], { icon })
        .addTo(map)
        .bindPopup(`<strong>${a.id}</strong><br>${a.type || 'Unknown'}<br><em>${a.site || ''}</em><br><a onclick="openDetail('${a.id}');closeMap()" href="#" style="color:var(--gold)">View Details →</a>`);
      mapMarkers.push(marker);
    });
    const bounds = L.latLngBounds(geo.map(a => [parseFloat(a.lat), parseFloat(a.lng)]));
    map.fitBounds(bounds.pad(0.3));
  }

  setTimeout(() => map.invalidateSize(), 100);
}

// ─── QR Scanner ───────────────────────────────────────────────────────────────
function startScanner() {
  const result = document.getElementById('scanResult');
  result.innerHTML = '<em style="color:var(--text-dim)">Initializing scanner…</em>';

  if (html5QrCode) return;

  html5QrCode = new Html5Qrcode('qrReader');
  html5QrCode.start(
    { facingMode: 'environment' },
    { fps: 10, qrbox: { width: 250, height: 250 } },
    decoded => {
      result.innerHTML = `<strong style="color:var(--gold)">Scanned: ${decoded}</strong>`;
      const found = artifacts.find(a => a.id === decoded);
      if (found) {
        setTimeout(() => { openDetail(found.id); }, 300);
      } else {
        result.innerHTML += `<br><em style="color:var(--text-muted)">No artifact found with this ID.</em>`;
      }
    },
    err => {}
  ).catch(err => {
    result.innerHTML = `<span style="color:var(--text-muted)">Camera unavailable: ${err}</span>`;
    html5QrCode = null;
  });
}

function stopScanner() {
  if (html5QrCode) {
    html5QrCode.stop().then(() => {
      html5QrCode = null;
    }).catch(() => { html5QrCode = null; });
  }
}

// ─── CSV Export ───────────────────────────────────────────────────────────────
function exportCSV() {
  if (!artifacts.length) { showToast('No artifacts to export'); return; }
  const headers = ['ID', 'Site', 'Type', 'Depth (cm)', 'Date', 'Latitude', 'Longitude', 'Notes', 'Voice Notes', 'Created'];
  const rows = artifacts.map(a => [
    a.id, a.site, a.type, a.depth, a.date, a.lat, a.lng,
    (a.notes || '').replace(/"/g, '""'),
    (a.voiceText || '').replace(/"/g, '""'),
    a.created
  ].map(v => `"${v || ''}"`).join(','));
  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ArchaeoSmart_Export_${new Date().toISOString().split('T')[0]}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  showToast('CSV exported');
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function createToast() {
  const t = document.createElement('div');
  t.id = 'toast';
  document.body.appendChild(t);
}

function showToast(msg) {
  const t = document.getElementById('toast');
  if (!t) return;
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ─── PWA ──────────────────────────────────────────────────────────────────────
function setupPWA() {
  window.addEventListener('beforeinstallprompt', e => {
    e.preventDefault();
    deferredPrompt = e;
    const btn = document.getElementById('installBtn');
    if (btn) btn.style.display = 'block';
  });

  document.getElementById('installBtn')?.addEventListener('click', () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(() => {
      deferredPrompt = null;
      document.getElementById('installBtn').style.display = 'none';
    });
  });
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

// Close modal on background click
document.getElementById('detailModal')?.addEventListener('click', e => {
  if (e.target === document.getElementById('detailModal')) closeModal();
});
