/* ArchaeoSmart v3 — app.js */

let artifacts = JSON.parse(localStorage.getItem("artifacts")) || [];
let currentID = null;
let audioRecorder;
let audioChunks = [];
let audioData = null;
let currentBrush = 3;
let currentOpacity = 1;
let currentColor = "#3d2b1f";
let recognition = null;
let mapInstance = null;
let selectedCondition = null;
let selectedType = null;
let fieldMode = false;
let voiceCaptureRecognition = null;
let voiceParsedData = {};

/* ── TYPE CONFIG ─────────────────────────────────────────────── */
const TYPES = [
  {label:"Ceramic",  icon:"🏺"},
  {label:"Lithic",   icon:"🪨"},
  {label:"Bone",     icon:"🦴"},
  {label:"Metal",    icon:"⚙"},
  {label:"Glass",    icon:"💠"},
  {label:"Organic",  icon:"🌿"},
  {label:"Coin",     icon:"🪙"},
  {label:"Inscript.",icon:"📜"},
  {label:"Figurine", icon:"🗿"},
  {label:"Arch.",    icon:"🧱"},
  {label:"Other",    icon:"❓"},
];

/* ── INIT ────────────────────────────────────────────────────── */
window.addEventListener("DOMContentLoaded", () => {
  buildTypeGrid();
  setupBackground();
  updateHomeStats();
  checkBackupReminder();
  restoreFieldMode();
  setupPhoto();
  enableDrawing(document.getElementById("canvas"));
  enableDrawing(document.getElementById("canvasFull"));
});

function setupPhoto() {
  document.getElementById("photo").onchange = function(e) {
    if (!e.target.files[0]) return;
    let reader = new FileReader();
    reader.onload = function() {
      const img = document.getElementById("preview");
      img.src = reader.result;
      img.style.display = "block";
    };
    reader.readAsDataURL(e.target.files[0]);
  };
}

/* ── BACKGROUND ──────────────────────────────────────────────── */
function setupBackground() {
  const bgLayer = document.getElementById("bgLayer");
  if (!bgLayer) return;
  const bones = ["🦴","💀","🦷","⚱","🏺","🪨","📜","⛏"];
  for (let i = 0; i < 20; i++) {
    let el = document.createElement("div");
    el.className = "bgBone";
    el.innerText = bones[Math.floor(Math.random() * bones.length)];
    el.style.left = Math.random() * 100 + "vw";
    el.style.animationDuration = 20 + Math.random() * 30 + "s";
    el.style.animationDelay = -(Math.random() * 30) + "s";
    el.style.fontSize = 24 + Math.random() * 36 + "px";
    bgLayer.appendChild(el);
  }
}

/* ── SCREENS ─────────────────────────────────────────────────── */
function hideAll() {
  document.querySelectorAll(
    "#homeScreen,#artifactScreen,#databaseScreen,#detailScreen,#mapScreen,#scannerScreen,#statsScreen,#voiceCaptureScreen"
  ).forEach(e => e.classList.add("hidden"));
}

function showHome() {
  hideAll();
  document.getElementById("homeScreen").classList.remove("hidden");
  updateHomeStats();
  checkBackupReminder();
}

/* ── HOME STATS ──────────────────────────────────────────────── */
function updateHomeStats() {
  const today = new Date().toDateString();
  const todayCount = artifacts.filter(a => new Date(a.savedAt || 0).toDateString() === today).length;
  const sites = new Set(artifacts.map(a => a.site).filter(Boolean)).size;
  const geoCount = artifacts.filter(a => a.lat && a.lng).length;
  document.getElementById("statTotal").textContent = artifacts.length;
  document.getElementById("statSites").textContent = sites;
  document.getElementById("statToday").textContent = todayCount;
  document.getElementById("statGPS").textContent = geoCount;
}

function checkBackupReminder() {
  const bar = document.getElementById("backupBar");
  const lastExport = parseInt(localStorage.getItem("lastExportCount") || "0");
  const diff = artifacts.length - lastExport;
  if (diff >= 5) {
    document.getElementById("backupMsg").textContent = `⚠ ${diff} artifacts since last export`;
    bar.style.display = "flex";
  } else {
    bar.style.display = "none";
  }
}

/* ── TYPE GRID ───────────────────────────────────────────────── */
function buildTypeGrid() {
  const grid = document.getElementById("typeGrid");
  if (!grid) return;
  grid.innerHTML = TYPES.map(t => `
    <button class="type-btn" data-label="${t.label}" onclick="selectType('${t.label}')">
      <span>${t.icon}</span>${t.label}
    </button>
  `).join("");
}

function selectType(label) {
  selectedType = label;
  document.querySelectorAll(".type-btn").forEach(b => {
    b.classList.toggle("active", b.dataset.label === label);
  });
  document.getElementById("type").value = label;
}

/* ── CONDITION ───────────────────────────────────────────────── */
function setCondition(v) {
  selectedCondition = v;
  document.getElementById("condition").value = v;
  document.querySelectorAll(".cond-btn").forEach(b => {
    const bv = parseInt(b.dataset.v);
    b.classList.toggle("active", bv <= v);
  });
}

/* ── FIELD MODE ──────────────────────────────────────────────── */
function toggleFieldMode() {
  fieldMode = !fieldMode;
  applyFieldMode();
  localStorage.setItem("fieldMode", fieldMode ? "1" : "0");
}

function restoreFieldMode() {
  fieldMode = localStorage.getItem("fieldMode") === "1";
  applyFieldMode();
}

function applyFieldMode() {
  document.body.classList.toggle("field-mode", fieldMode);
  const btn = document.getElementById("fieldModeBtn");
  if (btn) btn.textContent = fieldMode ? "☾" : "☀";
}

/* ── NEW ARTIFACT ────────────────────────────────────────────── */
function showArtifact() {
  hideAll();
  document.getElementById("artifactScreen").classList.remove("hidden");
  currentID = Date.now();
  selectedCondition = null;
  selectedType = null;
  document.getElementById("date").innerText = new Date().toLocaleString();
  document.getElementById("qrcode").innerHTML = "";
  new QRCode(document.getElementById("qrcode"), currentID.toString());
  document.querySelectorAll(".type-btn").forEach(b => b.classList.remove("active"));
  document.querySelectorAll(".cond-btn").forEach(b => b.classList.remove("active"));
  document.getElementById("condition").value = "";
  document.getElementById("type").value = "";
  document.getElementById("preview").style.display = "none";
}

/* ── SAVE ARTIFACT ───────────────────────────────────────────── */
function saveArtifact() {
  let photo = document.getElementById("preview").src || "";
  if (photo === window.location.href) photo = "";
  let drawing = document.getElementById("canvas").toDataURL("image/png");
  let gps = document.getElementById("gps").innerText;
  let lat = null, lng = null;
  if (gps.includes(",")) {
    let p = gps.split(",");
    lat = parseFloat(p[0]);
    lng = parseFloat(p[1]);
  }
  const typeVal = selectedType || document.getElementById("type").value;
  let artifact = {
    id: currentID,
    site: document.getElementById("site").value,
    type: typeVal,
    context: document.getElementById("context").value,
    depth: document.getElementById("depth").value,
    condition: selectedCondition,
    notes: document.getElementById("notes").value,
    voice: document.getElementById("voiceText").value,
    audio: audioData,
    gps: gps,
    lat: lat,
    lng: lng,
    date: document.getElementById("date").innerText,
    photo: photo,
    drawing: drawing,
    savedAt: new Date().toISOString()
  };
  artifacts.push(artifact);
  localStorage.setItem("artifacts", JSON.stringify(artifacts));
  audioData = null;
  showToast("⚱ Artifact saved successfully");
  showHome();
}

/* ── VOICE CAPTURE (HANDS-FREE) ──────────────────────────────── */
function showVoiceCapture() {
  hideAll();
  document.getElementById("voiceCaptureScreen").classList.remove("hidden");
  document.getElementById("voiceTranscript").textContent = "";
  document.getElementById("voiceParsed").classList.add("hidden");
}

function toggleVoiceCapture() {
  const btn = document.getElementById("voiceCaptureBtn");
  const icon = document.getElementById("voiceCaptureIcon");
  const label = document.getElementById("voiceCaptureLabel");

  if (voiceCaptureRecognition) {
    voiceCaptureRecognition.stop();
    voiceCaptureRecognition = null;
    btn.classList.remove("recording");
    icon.textContent = "🎤";
    label.textContent = "Hold to Speak";
    return;
  }

  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    showToast("Speech recognition not supported in this browser");
    return;
  }

  voiceCaptureRecognition = new SR();
  voiceCaptureRecognition.lang = "en-US";
  voiceCaptureRecognition.continuous = true;
  voiceCaptureRecognition.interimResults = true;

  voiceCaptureRecognition.onresult = function(e) {
    const transcript = Array.from(e.results).map(r => r[0].transcript).join(" ");
    document.getElementById("voiceTranscript").textContent = transcript;
  };

  voiceCaptureRecognition.onend = function() {
    btn.classList.remove("recording");
    icon.textContent = "🎤";
    label.textContent = "Hold to Speak";
    const transcript = document.getElementById("voiceTranscript").textContent;
    if (transcript.trim().length > 3) parseVoiceCapture(transcript);
    voiceCaptureRecognition = null;
  };

  voiceCaptureRecognition.start();
  btn.classList.add("recording");
  icon.textContent = "⏹";
  label.textContent = "Tap to Stop";
}

function parseVoiceCapture(text) {
  const t = text.toLowerCase();
  const parsed = { rawVoice: text };

  // Site
  const siteMatch = t.match(/site\s+([a-z0-9\s]+?)(?:\s*,|\s+depth|\s+layer|\s+context|$)/);
  if (siteMatch) parsed.site = siteMatch[1].trim();

  // Type
  const typeMap = {
    "ceramic":"Ceramic / Pottery","pottery":"Ceramic / Pottery","sherd":"Ceramic / Pottery",
    "lithic":"Lithic / Stone Tool","stone":"Lithic / Stone Tool","flint":"Lithic / Stone Tool",
    "bone":"Bone / Faunal","faunal":"Bone / Faunal",
    "metal":"Metal Object","iron":"Metal Object","bronze":"Metal Object","copper":"Metal Object",
    "glass":"Glass",
    "organic":"Organic Material","wood":"Organic Material","charcoal":"Organic Material",
    "coin":"Coin / Currency","currency":"Coin / Currency",
    "inscription":"Inscription","tablet":"Inscription",
    "figurine":"Figurine","statuette":"Figurine",
    "architectural":"Architectural","brick":"Architectural","tile":"Architectural",
  };
  for (const [key, val] of Object.entries(typeMap)) {
    if (t.includes(key)) { parsed.type = val; break; }
  }

  // Depth
  const depthMatch = t.match(/(\d+)\s*(?:centimetres?|centimeters?|cm|centim)/);
  if (depthMatch) parsed.depth = depthMatch[1];

  // Condition
  const condMap = {"excellent":5,"very good":4,"good":3,"fair":2,"poor":1,"bad":1};
  for (const [key, val] of Object.entries(condMap)) {
    if (t.includes(key)) { parsed.condition = val; break; }
  }

  // Context / layer
  const layerMatch = t.match(/(?:layer|context|stratum|level)\s+([a-z0-9\s]+?)(?:\s*,|$)/);
  if (layerMatch) parsed.context = layerMatch[1].trim();

  voiceParsedData = parsed;

  // Show parsed results
  const parsedDiv = document.getElementById("voiceParsed");
  const fieldsDiv = document.getElementById("voiceParsedFields");
  const labels = {site:"Site",type:"Type",depth:"Depth (cm)",condition:"Condition",context:"Context",rawVoice:"Voice Note"};
  fieldsDiv.innerHTML = Object.entries(parsed).map(([k,v]) => `
    <div class="parsed-field">
      <span class="parsed-label">${labels[k]||k}</span>
      <span class="parsed-value">${k==="condition" ? "★".repeat(v)+"☆".repeat(5-v) : v}</span>
    </div>
  `).join("");
  parsedDiv.classList.remove("hidden");
}

function saveVoiceParsed() {
  currentID = Date.now();
  const gps = "Not recorded";
  let artifact = {
    id: currentID,
    site: voiceParsedData.site || "",
    type: voiceParsedData.type || "",
    context: voiceParsedData.context || "",
    depth: voiceParsedData.depth || "",
    condition: voiceParsedData.condition || null,
    notes: "",
    voice: voiceParsedData.rawVoice || "",
    audio: null,
    gps: gps,
    lat: null,
    lng: null,
    date: new Date().toLocaleString(),
    photo: "",
    drawing: "",
    savedAt: new Date().toISOString()
  };
  artifacts.push(artifact);
  localStorage.setItem("artifacts", JSON.stringify(artifacts));
  showToast("⚱ Voice artifact saved");
  showHome();
}

function editVoiceParsed() {
  showArtifact();
  if (voiceParsedData.site) document.getElementById("site").value = voiceParsedData.site;
  if (voiceParsedData.type) selectType(voiceParsedData.type);
  if (voiceParsedData.depth) document.getElementById("depth").value = voiceParsedData.depth;
  if (voiceParsedData.context) document.getElementById("context").value = voiceParsedData.context;
  if (voiceParsedData.condition) setCondition(voiceParsedData.condition);
  if (voiceParsedData.rawVoice) document.getElementById("voiceText").value = voiceParsedData.rawVoice;
}

/* ── DATABASE ────────────────────────────────────────────────── */
function showDatabase() {
  hideAll();
  document.getElementById("databaseScreen").classList.remove("hidden");
  renderDatabase(artifacts);
}

function renderDatabase(list) {
  let container = document.getElementById("artifactList");
  if (!list.length) {
    container.innerHTML = `<div class="empty-state">No artifacts found</div>`;
    return;
  }
  const typeIcons = {"Ceramic / Pottery":"🏺","Lithic / Stone Tool":"🪨","Bone / Faunal":"🦴","Metal Object":"⚙","Glass":"💠","Organic Material":"🌿","Coin / Currency":"🪙","Inscription":"📜","Figurine":"🗿","Architectural":"🧱"};
  container.innerHTML = list.map(a => `
    <div class="artifactCard" onclick="showDetail(${a.id})">
      <span class="card-icon">${typeIcons[a.type]||"⚱"}</span>
      <div class="card-info">
        <div class="card-type">${a.type || "Unknown type"}</div>
        <div class="card-meta">${a.site||"No site"} ${a.depth ? "· "+a.depth+"cm" : ""} ${a.context ? "· "+a.context : ""}</div>
        <div class="card-date">${a.date||""}</div>
      </div>
      <div class="card-badges">
        ${a.lat ? '<span class="badge">📍</span>' : ''}
        ${a.photo ? '<span class="badge">📷</span>' : ''}
        ${a.audio ? '<span class="badge">🎙</span>' : ''}
        ${a.condition ? '<span class="badge">★'+a.condition+'</span>' : ''}
      </div>
    </div>
  `).join("");
}

function searchArtifact() {
  const q = document.getElementById("searchID").value.toLowerCase();
  const results = artifacts.filter(a =>
    !q ||
    (a.id && a.id.toString().includes(q)) ||
    (a.site && a.site.toLowerCase().includes(q)) ||
    (a.type && a.type.toLowerCase().includes(q)) ||
    (a.context && a.context.toLowerCase().includes(q)) ||
    (a.notes && a.notes.toLowerCase().includes(q))
  );
  renderDatabase(results);
}

/* ── DETAIL ──────────────────────────────────────────────────── */
function showDetail(id) {
  hideAll();
  document.getElementById("detailScreen").classList.remove("hidden");
  let a = artifacts.find(x => x.id === id);
  const condStars = a.condition ? "★".repeat(a.condition)+"☆".repeat(5-a.condition) : "Not rated";
  document.getElementById("artifactDetail").innerHTML = `
    <div class="detailCard">
      <div class="detail-id">ID: ${a.id}</div>
      <div class="detail-type">${a.type || "Unknown type"}</div>
      <div class="detail-site">${a.site || "Unknown site"}</div>

      <div class="detail-fields">
        ${a.context ? `<div class="detail-row"><b>Context</b><span>${a.context}</span></div>` : ""}
        ${a.depth ? `<div class="detail-row"><b>Depth</b><span>${a.depth} cm</span></div>` : ""}
        ${a.condition ? `<div class="detail-row"><b>Condition</b><span class="stars">${condStars}</span></div>` : ""}
        <div class="detail-row"><b>GPS</b><span>${a.gps}</span></div>
        <div class="detail-row"><b>Date</b><span>${a.date}</span></div>
      </div>

      <h3>QR Code</h3>
      <div id="detailQR"></div>

      ${a.notes ? `<h3>Notes</h3><p class="detail-text">${a.notes}</p>` : ""}
      ${a.voice ? `<h3>Voice Notes</h3><p class="detail-text">${a.voice}</p>` : ""}
      ${a.audio ? `<h3>Voice Memo</h3><audio controls src="${a.audio}"></audio>` : ""}
      ${a.photo ? `<h3>Photo</h3><img src="${a.photo}">` : ""}
      ${a.drawing ? `<h3>Drawing</h3><img src="${a.drawing}" style="background:white">` : ""}

      <div class="detail-actions">
        <button class="secondaryBtn danger" onclick="deleteArtifact(${a.id})">🗑 Delete</button>
      </div>
    </div>
  `;
  new QRCode(document.getElementById("detailQR"), id.toString());
}

function deleteArtifact(id) {
  if (!confirm("Delete this artifact? This cannot be undone.")) return;
  artifacts = artifacts.filter(a => a.id !== id);
  localStorage.setItem("artifacts", JSON.stringify(artifacts));
  showToast("Artifact deleted");
  showDatabase();
}

/* ── STATISTICS ──────────────────────────────────────────────── */
function showStats() {
  hideAll();
  document.getElementById("statsScreen").classList.remove("hidden");
  const typeCounts = {};
  const siteCounts = {};
  artifacts.forEach(a => {
    if (a.type) typeCounts[a.type] = (typeCounts[a.type]||0)+1;
    if (a.site) siteCounts[a.site] = (siteCounts[a.site]||0)+1;
  });
  const maxType = Math.max(...Object.values(typeCounts), 1);
  const maxSite = Math.max(...Object.values(siteCounts), 1);

  document.getElementById("statsContent").innerHTML = `
    <div class="stats-card">
      <h3>By Type</h3>
      ${Object.entries(typeCounts).sort((a,b)=>b[1]-a[1]).map(([k,v]) => `
        <div class="stat-bar-row">
          <span class="stat-bar-label">${k}</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(v/maxType)*100}%"></div></div>
          <span class="stat-bar-count">${v}</span>
        </div>
      `).join("") || "<p class='empty-state'>No data yet</p>"}
    </div>
    <div class="stats-card">
      <h3>By Site</h3>
      ${Object.entries(siteCounts).sort((a,b)=>b[1]-a[1]).map(([k,v]) => `
        <div class="stat-bar-row">
          <span class="stat-bar-label">${k}</span>
          <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${(v/maxSite)*100}%"></div></div>
          <span class="stat-bar-count">${v}</span>
        </div>
      `).join("") || "<p class='empty-state'>No data yet</p>"}
    </div>
    <div class="stats-card">
      <h3>Summary</h3>
      <div class="detail-row"><b>Total artifacts</b><span>${artifacts.length}</span></div>
      <div class="detail-row"><b>Unique sites</b><span>${Object.keys(siteCounts).length}</span></div>
      <div class="detail-row"><b>With GPS</b><span>${artifacts.filter(a=>a.lat).length}</span></div>
      <div class="detail-row"><b>With photos</b><span>${artifacts.filter(a=>a.photo).length}</span></div>
      <div class="detail-row"><b>With drawings</b><span>${artifacts.filter(a=>a.drawing && a.drawing.length > 1000).length}</span></div>
      <div class="detail-row"><b>With audio</b><span>${artifacts.filter(a=>a.audio).length}</span></div>
    </div>
  `;
}

/* ── EXPORT ──────────────────────────────────────────────────── */
function exportCSV() {
  let csv = "ID,Site,Type,Context,Depth,Condition,GPS,Date,Notes\n";
  artifacts.forEach(a => {
    csv += `${a.id},"${a.site||""}","${a.type||""}","${a.context||""}","${a.depth||""}","${a.condition||""}","${a.gps||""}","${a.date||""}","${(a.notes||"").replace(/"/g,'""')}"\n`;
  });
  let blob = new Blob([csv], {type:"text/csv"});
  let link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "ArchaeoSmart_" + new Date().toISOString().split("T")[0] + ".csv";
  link.click();
  localStorage.setItem("lastExportCount", artifacts.length);
  checkBackupReminder();
  showToast("CSV exported");
}

/* ── GPS ─────────────────────────────────────────────────────── */
function getLocation() {
  const gpsField = document.getElementById("gps");
  gpsField.innerText = "Acquiring GPS…";
  if (!navigator.geolocation) { gpsField.innerText = "GPS not supported"; return; }
  navigator.geolocation.getCurrentPosition(
    function(pos) {
      gpsField.innerText = pos.coords.latitude.toFixed(6)+","+pos.coords.longitude.toFixed(6);
      showToast("📍 GPS acquired");
    },
    function(err) { gpsField.innerText = "Unable to get GPS: " + err.message; },
    {enableHighAccuracy:true, timeout:20000, maximumAge:0}
  );
}

/* ── VOICE TEXT ──────────────────────────────────────────────── */
function startDictation() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { alert("Speech recognition not supported"); return; }
  recognition = new SR();
  recognition.lang = "en-US";
  recognition.continuous = true;
  recognition.onresult = function(e) {
    document.getElementById("voiceText").value = e.results[e.results.length-1][0].transcript;
  };
  recognition.start();
  showToast("🎤 Listening…");
}

function stopDictation() {
  if (recognition) { recognition.stop(); recognition = null; showToast("Dictation stopped"); }
}

/* ── AUDIO ───────────────────────────────────────────────────── */
async function startRecording() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({audio:true});
    audioRecorder = new MediaRecorder(stream);
    audioChunks = [];
    audioRecorder.ondataavailable = e => audioChunks.push(e.data);
    audioRecorder.onstop = () => {
      const blob = new Blob(audioChunks, {type:"audio/webm"});
      const reader = new FileReader();
      reader.onloadend = () => {
        audioData = reader.result;
        document.getElementById("audioPlayback").src = audioData;
      };
      reader.readAsDataURL(blob);
    };
    audioRecorder.start();
    showToast("🎙 Recording…");
  } catch(err) { alert("Microphone permission required"); }
}

function stopRecording() {
  if (audioRecorder) { audioRecorder.stop(); showToast("Recording saved"); }
}

/* ── CANVAS ──────────────────────────────────────────────────── */
function resizeCanvas(canvas) {
  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  canvas.width = rect.width * dpr;
  canvas.height = rect.height * dpr;
  canvas.getContext("2d").scale(dpr, dpr);
}

function enableDrawing(canvas) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  resizeCanvas(canvas);
  let drawing = false;
  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches) return {x:e.touches[0].clientX-rect.left, y:e.touches[0].clientY-rect.top};
    return {x:e.clientX-rect.left, y:e.clientY-rect.top};
  }
  function start(e) { drawing=true; const p=getPos(e); ctx.beginPath(); ctx.moveTo(p.x,p.y); }
  function draw(e) {
    if (!drawing) return;
    e.preventDefault();
    const p = getPos(e);
    ctx.lineTo(p.x, p.y);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentBrush;
    ctx.globalAlpha = currentOpacity;
    ctx.lineCap = "round";
    ctx.stroke();
  }
  function stop() { drawing=false; ctx.beginPath(); }
  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", draw);
  canvas.addEventListener("mouseup", stop);
  canvas.addEventListener("touchstart", start, {passive:false});
  canvas.addEventListener("touchmove", draw, {passive:false});
  canvas.addEventListener("touchend", stop);
}

function clearCanvas() {
  const c = document.getElementById("canvas");
  c.getContext("2d").clearRect(0,0,c.width,c.height);
}

function clearCanvasFull() {
  const c = document.getElementById("canvasFull");
  c.getContext("2d").clearRect(0,0,c.width,c.height);
}

function openCanvasFullscreen() {
  const fs = document.getElementById("canvasFullscreen");
  fs.classList.remove("hidden");
  const fullCanvas = document.getElementById("canvasFull");
  const smallCanvas = document.getElementById("canvas");
  resizeCanvas(fullCanvas);
  fullCanvas.getContext("2d").drawImage(smallCanvas,0,0);
}

function closeCanvasFullscreen() {
  const fullCanvas = document.getElementById("canvasFull");
  const smallCanvas = document.getElementById("canvas");
  resizeCanvas(smallCanvas);
  smallCanvas.getContext("2d").drawImage(fullCanvas,0,0,smallCanvas.width,smallCanvas.height);
  document.getElementById("canvasFullscreen").classList.add("hidden");
}

/* ── QR SCANNER (ORIGINAL WORKING VERSION) ───────────────────── */
function startScanner() {
  hideAll();
  document.getElementById("scannerScreen").classList.remove("hidden");
  const html5QrCode = new Html5Qrcode("reader");
  html5QrCode.start(
    {facingMode:"environment"},
    {fps:10, qrbox:250},
    msg => {
      let artifact = artifacts.find(a => a.id.toString() === msg);
      if (artifact) { showDetail(artifact.id); }
      else { showToast("QR scanned — artifact not found"); }
      html5QrCode.stop();
    }
  );
}

/* ── MAP ─────────────────────────────────────────────────────── */
function showMap() {
  hideAll();
  document.getElementById("mapScreen").classList.remove("hidden");
  if (mapInstance) { mapInstance.remove(); }
  mapInstance = L.map("map").setView([31.63,-8], 6);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {maxZoom:19}).addTo(mapInstance);
  artifacts.forEach((a, i) => {
    if (!a.lat || !a.lng) return;
    let lat = a.lat+(i*0.00005);
    let lng = a.lng+(i*0.00005);
    let marker = L.marker([lat,lng]).addTo(mapInstance);
    marker.bindPopup(`<b>${a.type}</b><br>Site: ${a.site}<br>Depth: ${a.depth} cm<br><button onclick="showDetail(${a.id})">Open</button>`);
  });
}

/* ── RESIZE ──────────────────────────────────────────────────── */
window.addEventListener("resize", () => {
  const c = document.getElementById("canvasFull");
  if (c) resizeCanvas(c);
});

/* ── TOAST ───────────────────────────────────────────────────── */
function showToast(msg) {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(window._toastTimer);
  window._toastTimer = setTimeout(() => t.classList.remove("show"), 2800);
}
