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
let scannerInstance = null;

let mainCanvasPreviewData = null;
let scrollLockY = 0;

/* interview state guards */
let viConfirmSessionId = 0;
let viAnswerSessionId = 0;

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
  enableDrawing(document.getElementById("canvas"), false);
  enableDrawing(document.getElementById("canvasFull"), true);
  setupMainCanvasPreview();
});

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
  stopScanner();
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
  stopScanner();
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
  document.getElementById("preview").src = "";
  document.getElementById("audioPlayback").src = "";
  audioData = null;
  clearCanvas();
}

/* ── SAVE ARTIFACT ───────────────────────────────────────────── */
function saveArtifact() {
  let photo = document.getElementById("preview").src || "";
  if (photo === window.location.href) photo = "";
  let drawing = mainCanvasPreviewData || "";
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

/* ── VOICE INTERVIEW ENGINE ─────────────────────────────────── */

const VI_STEPS = [
  {
    key: "site",
    icon: "◎",
    question: "What is the site name or excavation unit?",
    example: `e.g. "Site Alpha" or "Trench 3, Unit B"`,
    parse: (t) => t.trim().replace(/^(site|at|from)\s+/i, "").trim() || null
  },
  {
    key: "type",
    icon: "⚱",
    question: "What type of artifact is this?",
    example: `e.g. "ceramic", "lithic", "bone", "metal", "coin", "glass"`,
    parse: (t) => {
      const map = {
        "ceramic":"Ceramic / Pottery","pottery":"Ceramic / Pottery","sherd":"Ceramic / Pottery","pot":"Ceramic / Pottery",
        "lithic":"Lithic / Stone Tool","stone tool":"Lithic / Stone Tool","flint":"Lithic / Stone Tool","obsidian":"Lithic / Stone Tool",
        "stone":"Lithic / Stone Tool",
        "bone":"Bone / Faunal","faunal":"Bone / Faunal","animal":"Bone / Faunal",
        "metal":"Metal Object","iron":"Metal Object","bronze":"Metal Object","copper":"Metal Object","lead":"Metal Object",
        "glass":"Glass",
        "organic":"Organic Material","wood":"Organic Material","charcoal":"Organic Material","seed":"Organic Material",
        "coin":"Coin / Currency","currency":"Coin / Currency","numismatic":"Coin / Currency",
        "inscription":"Inscription","tablet":"Inscription","text":"Inscription",
        "figurine":"Figurine","statuette":"Figurine","statue":"Figurine",
        "architectural":"Architectural","brick":"Architectural","tile":"Architectural","plaster":"Architectural",
      };
      const lower = t.toLowerCase();
      for (const [k,v] of Object.entries(map)) {
        if (lower.includes(k)) return v;
      }
      return t.trim() || null;
    }
  },
  {
    key: "context",
    icon: "▦",
    question: "What is the stratigraphic context or layer?",
    example: 'e.g. "Layer 2B" or "Context 14" or say "skip" if unknown',
    parse: (t) => {
      const clean = t.toLowerCase().trim();
      if (clean === "skip" || clean === "unknown") return null;
      return t.trim() || null;
    }
  },
  {
    key: "depth",
    icon: "↓",
    question: "What is the depth in centimetres?",
    example: 'e.g. "forty five" or "45 centimetres"',
    parse: (t) => {
      let m = t.match(/(\d+(?:\.\d+)?)\s*(?:cm|centim|cent)?/i);
      if (m) return m[1];
      const words = {
        "zero":"0","one":"1","two":"2","three":"3","four":"4","five":"5","six":"6","seven":"7","eight":"8","nine":"9","ten":"10",
        "eleven":"11","twelve":"12","thirteen":"13","fourteen":"14","fifteen":"15","sixteen":"16","seventeen":"17","eighteen":"18","nineteen":"19","twenty":"20",
        "thirty":"30","forty":"40","fifty":"50","sixty":"60","seventy":"70","eighty":"80","ninety":"90","hundred":"100",
        "twenty one":"21","twenty two":"22","twenty three":"23","twenty four":"24","twenty five":"25",
        "thirty five":"35","forty five":"45","fifty five":"55","sixty five":"65"
      };
      const lower = t.toLowerCase().trim();
      if (words[lower]) return words[lower];
      for (const [w,n] of Object.entries(words)) {
        if (lower.includes(w)) return n;
      }
      return null;
    }
  },
  {
    key: "condition",
    icon: "★",
    question: "What is the condition of the artifact?",
    example: 'Say "excellent", "very good", "good", "fair", or "poor"',
    parse: (t) => {
      const lower = t.toLowerCase();
      if (lower.includes("excellent") || lower.includes("perfect")) return 5;
      if (lower.includes("very good") || lower.includes("great"))    return 4;
      if (lower.includes("good"))                                      return 3;
      if (lower.includes("fair") || lower.includes("moderate"))       return 2;
      if (lower.includes("poor") || lower.includes("bad") || lower.includes("damaged")) return 1;
      const nums = t.match(/[1-5]/);
      if (nums) return parseInt(nums[0]);
      return null;
    }
  },
  {
    key: "notes",
    icon: "📜",
    question: "Any field notes or observations?",
    example: "Describe associations, colour, size, markings, find location in trench…",
    parse: (t) => t.trim() || null
  }
];

let viState = {
  step: -1,
  answers: {},
  recognition: null,
  silenceTimer: null,
  finalTranscript: "",
  interimTranscript: "",
  listening: false,
  tts: null,
  confirmRecognition: null,
  confirmTimeout: null,
  confirmRetries: 0,
  awaitingConfirmation: false,
  _pendingHeard: "",
  _pendingParsed: null
};

/* ── interview helpers ──────────────────────────────────────── */
function viSetMainButton(icon, label, recording = false) {
  const btn = document.getElementById("voiceCaptureBtn");
  document.getElementById("voiceCaptureIcon").textContent = icon;
  document.getElementById("voiceCaptureLabel").textContent = label;
  btn.classList.toggle("recording", recording);
}

function viCancelAnswerListening() {
  viAnswerSessionId++;
  if (viState.silenceTimer) {
    clearTimeout(viState.silenceTimer);
    viState.silenceTimer = null;
  }
  if (viState.recognition) {
    try { viState.recognition.onresult = null; } catch(e){}
    try { viState.recognition.onerror = null; } catch(e){}
    try { viState.recognition.onend = null; } catch(e){}
    try { viState.recognition.stop(); } catch(e){}
    try { viState.recognition.abort(); } catch(e){}
    viState.recognition = null;
  }
  viState.listening = false;
}

function viCancelConfirmationListening() {
  viConfirmSessionId++;
  if (viState.confirmTimeout) {
    clearTimeout(viState.confirmTimeout);
    viState.confirmTimeout = null;
  }
  if (viState.confirmRecognition) {
    try { viState.confirmRecognition.onresult = null; } catch(e){}
    try { viState.confirmRecognition.onerror = null; } catch(e){}
    try { viState.confirmRecognition.onend = null; } catch(e){}
    try { viState.confirmRecognition.stop(); } catch(e){}
    try { viState.confirmRecognition.abort(); } catch(e){}
    viState.confirmRecognition = null;
  }
  viState.awaitingConfirmation = false;
  viState.confirmRetries = 0;
}

function viCancelAllListening() {
  viCancelAnswerListening();
  viCancelConfirmationListening();
}

/* ── TTS helper ──────────────────────────────────────────────── */
function viSpeak(text, onDone) {
  if (!window.speechSynthesis) { if (onDone) onDone(); return; }
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate  = 0.92;
  utt.pitch = 1.0;
  utt.volume = 1.0;
  const voices = window.speechSynthesis.getVoices();
  const pref = voices.find(v => v.lang.startsWith("en") && v.name.toLowerCase().includes("google"))
            || voices.find(v => v.lang === "en-US")
            || voices.find(v => v.lang.startsWith("en"));
  if (pref) utt.voice = pref;
  utt.onend = () => { if (onDone) onDone(); };
  utt.onerror = () => { if (onDone) onDone(); };
  viState.tts = utt;
  window.speechSynthesis.speak(utt);
}

/* ── Entry point ─────────────────────────────────────────────── */
function showVoiceCapture() {
  hideAll();
  stopScanner();
  document.getElementById("voiceCaptureScreen").classList.remove("hidden");
  viReset();
}

function viReset() {
  viCancelAllListening();
  if (window.speechSynthesis) window.speechSynthesis.cancel();

  viState.step = -1;
  viState.answers = {};
  viState.finalTranscript = "";
  viState.interimTranscript = "";
  viState.tts = null;
  viState._pendingHeard = "";
  viState._pendingParsed = null;

  voiceParsedData = {};

  document.getElementById("viProgressBar").style.width = "0%";
  document.getElementById("viStepLabel").textContent = "Ready to begin";
  document.getElementById("viQuestionIcon").textContent = "⚱";
  document.getElementById("viQuestionText").textContent = "Press Start to begin the guided recording";
  document.getElementById("viExample").textContent = "";
  document.getElementById("viTranscript").querySelector("#viInterim").textContent = "";
  document.getElementById("viHeard").style.display = "none";
  document.getElementById("viAnswers").innerHTML = "";
  document.getElementById("viActions").style.display = "none";

  viSetMainButton("▶", "Start Interview", false);
}

function viButtonPressed() {
  if (viState.step === -1) {
    viStartInterview();
  } else if (viState.listening) {
    viStopListening(true);
  } else if (viState.awaitingConfirmation) {
    viListenForConfirmation();
  } else {
    viListenForAnswer();
  }
}

/* ── Interview flow ──────────────────────────────────────────── */
function viStartInterview() {
  viState.step = 0;
  viAskStep();
}

function viAskStep() {
  viCancelAllListening();

  const step = VI_STEPS[viState.step];
  const pct  = (viState.step / VI_STEPS.length) * 100;

  document.getElementById("viProgressBar").style.width = pct + "%";
  document.getElementById("viStepLabel").textContent   = `Step ${viState.step + 1} of ${VI_STEPS.length} — ${step.key.charAt(0).toUpperCase() + step.key.slice(1)}`;
  document.getElementById("viQuestionIcon").textContent = step.icon;
  document.getElementById("viQuestionText").textContent = step.question;
  document.getElementById("viExample").textContent       = step.example;
  document.getElementById("viHeard").style.display       = "none";
  document.getElementById("viInterim").textContent       = "";

  viSetMainButton("🎤", "Waiting for answer", false);

  viSpeak(step.question, () => {
    setTimeout(() => viListenForAnswer(), 300);
  });
}

/* ── Listening for main answer ──────────────────────────────── */
function viListenForAnswer() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { showToast("Speech recognition not supported"); return; }

  viCancelAllListening();
  if (window.speechSynthesis) window.speechSynthesis.cancel();

  viState.finalTranscript   = "";
  viState.interimTranscript = "";
  viState.listening         = true;

  const sessionId = ++viAnswerSessionId;

  const r = new SR();
  r.lang             = "en-US";
  r.continuous       = true;
  r.interimResults   = true;
  r.maxAlternatives  = 3;
  viState.recognition = r;

  viSetMainButton("⏹", "Listening…", true);

  r.onresult = function(e) {
    if (sessionId !== viAnswerSessionId) return;

    let interim = "";
    let final   = viState.finalTranscript;

    for (let i = e.resultIndex; i < e.results.length; i++) {
      const res = e.results[i];
      let bestText = res[0].transcript;
      let bestConf = res[0].confidence || 0;
      for (let j = 1; j < res.length; j++) {
        if ((res[j].confidence || 0) > bestConf) {
          bestConf = res[j].confidence || 0;
          bestText = res[j].transcript;
        }
      }
      if (res.isFinal) {
        final += (final ? " " : "") + bestText;
      } else {
        interim = bestText;
      }
    }

    viState.finalTranscript   = final;
    viState.interimTranscript = interim;

    const display = (final + (interim ? " " + interim : "")).trim();
    document.getElementById("viInterim").textContent = display;

    if (viState.silenceTimer) clearTimeout(viState.silenceTimer);
    if (final) {
      viState.silenceTimer = setTimeout(() => {
        if (sessionId !== viAnswerSessionId) return;
        viStopListening(false);
      }, 1800);
    }
  };

  r.onspeechend = function() {
    if (sessionId !== viAnswerSessionId) return;
    if (viState.silenceTimer) clearTimeout(viState.silenceTimer);
    viState.silenceTimer = setTimeout(() => {
      if (sessionId !== viAnswerSessionId) return;
      viStopListening(false);
    }, 600);
  };

  r.onerror = function(e) {
    if (sessionId !== viAnswerSessionId) return;

    if (e.error === "no-speech") {
      viState.listening = false;
      try { r.stop(); } catch(err){}
      setTimeout(() => {
        if (sessionId !== viAnswerSessionId) return;
        if (viState.step >= 0 && viState.step < VI_STEPS.length) viListenForAnswer();
      }, 400);
      return;
    }

    viState.listening = false;
    viSetMainButton("🎤", "Tap to Answer", false);
    showToast("Mic error: " + e.error);
  };

  r.onend = function() {
    if (sessionId !== viAnswerSessionId) return;
    if (viState.listening) {
      try { r.start(); } catch(e) {}
    }
  };

  try { r.start(); } catch(e) { showToast("Could not start microphone"); }
}

function viStopListening(force) {
  if (viState.silenceTimer) {
    clearTimeout(viState.silenceTimer);
    viState.silenceTimer = null;
  }

  const heard = (viState.finalTranscript || viState.interimTranscript).trim();

  viCancelAnswerListening();
  viSetMainButton("🎤", "Tap to Answer", false);

  if (!heard && !force) {
    viSpeak("I didn't catch that. Please answer again.", () => {
      setTimeout(() => viListenForAnswer(), 300);
    });
    return;
  }

  viShowConfirmation(heard);
}

/* ── Confirmation ────────────────────────────────────────────── */
function viParseConfirmationCommand(text) {
  const t = text.toLowerCase().trim();

  if (
    t.includes("yes") ||
    t.includes("correct") ||
    t.includes("okay") ||
    t.includes("ok") ||
    t.includes("confirm")
  ) return "accept";

  if (
    t.includes("no") ||
    t.includes("retry") ||
    t.includes("again") ||
    t.includes("repeat")
  ) return "retry";

  if (
    t.includes("skip") ||
    t.includes("next")
  ) return "skip";

  return null;
}

function viShowConfirmation(heard) {
  const step   = VI_STEPS[viState.step];
  const parsed = step.parse(heard);

  document.getElementById("viInterim").textContent = "";
  document.getElementById("viHeardText").textContent = heard || "(nothing)";
  document.getElementById("viHeard").style.display = "block";

  viState._pendingHeard   = heard;
  viState._pendingParsed  = parsed;
  viState.confirmRetries  = 0;
  viState.awaitingConfirmation = true;

  viSetMainButton("🎙", "Say yes, no, or skip", false);

  const readback = heard
    ? `I heard: ${heard}. Say yes to confirm, no to try again, or skip.`
    : "I did not catch anything. Say no to try again, or skip.";

  viSpeak(readback, () => {
    setTimeout(() => viListenForConfirmation(), 350);
  });
}

function viListenForConfirmation() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) return;

  viCancelConfirmationListening();

  const sessionId = ++viConfirmSessionId;

  const r = new SR();
  r.lang = "en-US";
  r.continuous = false;
  r.interimResults = false;
  r.maxAlternatives = 3;
  viState.confirmRecognition = r;
  viState.awaitingConfirmation = true;

  viSetMainButton("🎙", "Say yes, no, or skip", false);

  r.onresult = function(e) {
    if (sessionId !== viConfirmSessionId) return;
    let heard = "";
    if (e.results && e.results[0] && e.results[0][0]) {
      heard = e.results[0][0].transcript || "";
    }
    const action = viParseConfirmationCommand(heard);

    if (action === "accept") {
      viAccept();
      return;
    }
    if (action === "retry") {
      viRetry();
      return;
    }
    if (action === "skip") {
      viSkip();
      return;
    }

    viHandleConfirmationMiss(sessionId);
  };

  r.onerror = function() {
    if (sessionId !== viConfirmSessionId) return;
    viHandleConfirmationMiss(sessionId);
  };

  r.onend = function() {
    // no-op; handled by timeout/result/error
  };

  viState.confirmTimeout = setTimeout(() => {
    if (sessionId !== viConfirmSessionId) return;
    try { r.stop(); } catch(e) {}
    viHandleConfirmationMiss(sessionId);
  }, 4500);

  try { r.start(); } catch(e) {}
}

function viHandleConfirmationMiss(sessionId) {
  if (sessionId !== viConfirmSessionId) return;

  if (viState.confirmTimeout) {
    clearTimeout(viState.confirmTimeout);
    viState.confirmTimeout = null;
  }

  if (viState.confirmRecognition) {
    try { viState.confirmRecognition.abort(); } catch(e){}
    viState.confirmRecognition = null;
  }

  viState.awaitingConfirmation = true;
  viState.confirmRetries++;

  if (viState.confirmRetries <= 1) {
    viSetMainButton("🎙", "Say yes, no, or skip", false);
    viSpeak("Please say yes, no, or skip.", () => {
      setTimeout(() => viListenForConfirmation(), 300);
    });
  } else {
    viSetMainButton("🎙", "Say yes, no, or skip", false);
    showToast("Say yes, no, or skip");
  }
}

function viAccept() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  viCancelConfirmationListening();

  const step   = VI_STEPS[viState.step];
  const parsed = (viState._pendingParsed !== null && viState._pendingParsed !== undefined)
    ? viState._pendingParsed
    : viState._pendingHeard;

  if (parsed !== null && parsed !== undefined) {
    viState.answers[step.key] = parsed;
    viRenderAnswers();
  }

  document.getElementById("viHeard").style.display = "none";
  viNextStep();
}

function viRetry() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  viCancelConfirmationListening();

  document.getElementById("viHeard").style.display = "none";
  viState.finalTranscript   = "";
  viState.interimTranscript = "";

  viSetMainButton("🎤", "Waiting for answer", false);

  viSpeak(VI_STEPS[viState.step].question, () => {
    setTimeout(() => viListenForAnswer(), 300);
  });
}

function viSkip() {
  if (window.speechSynthesis) window.speechSynthesis.cancel();
  viCancelConfirmationListening();

  document.getElementById("viHeard").style.display = "none";
  viNextStep();
}

function viNextStep() {
  viState.step++;
  if (viState.step >= VI_STEPS.length) {
    viFinish();
  } else {
    viAskStep();
  }
}

/* ── Render collected answers ────────────────────────────────── */
function viRenderAnswers() {
  const labels = {site:"Site",type:"Type",context:"Context",depth:"Depth (cm)",condition:"Condition",notes:"Notes"};
  const container = document.getElementById("viAnswers");
  container.innerHTML = Object.entries(viState.answers).map(([k,v]) => `
    <div class="vi-answer-row">
      <span class="vi-answer-key">${labels[k]||k}</span>
      <span class="vi-answer-val">${k==="condition" ? "★".repeat(v)+"☆".repeat(5-v) : v}</span>
    </div>
  `).join("");
}

/* ── Finish ──────────────────────────────────────────────────── */
function viFinish() {
  viCancelAllListening();

  document.getElementById("viProgressBar").style.width = "100%";
  document.getElementById("viStepLabel").textContent = "Interview complete";
  document.getElementById("viQuestionIcon").textContent = "⚱";
  document.getElementById("viQuestionText").textContent = "All fields recorded. Review below and save.";
  document.getElementById("viExample").textContent = "";
  viSetMainButton("↺", "Start Over", false);
  document.getElementById("viActions").style.display = "flex";
  document.getElementById("viActions").style.flexDirection = "column";
  document.getElementById("viActions").style.gap = "8px";

  voiceParsedData = { ...viState.answers, rawVoice: Object.entries(viState.answers).map(([k,v])=>`${k}: ${v}`).join(", ") };
  viRenderAnswers();

  viSpeak("Recording complete. You can now save the artifact or review the fields.", null);
}

/* ── Old single-shot toggle (kept for compatibility fallback) ── */
function toggleVoiceCapture() { viButtonPressed(); }

/* ── Parsed voice save/edit ──────────────────────────────────── */
function editVoiceParsed() {
  if (!voiceParsedData || Object.keys(voiceParsedData).length === 0) {
    showToast("No parsed voice data to edit");
    return;
  }

  showArtifact();

  document.getElementById("site").value = voiceParsedData.site || "";
  document.getElementById("context").value = voiceParsedData.context || "";
  document.getElementById("depth").value = voiceParsedData.depth || "";
  document.getElementById("notes").value = voiceParsedData.notes || "";
  document.getElementById("voiceText").value = voiceParsedData.rawVoice || "";

  if (voiceParsedData.type) {
    selectType(voiceParsedData.type);
  }

  if (voiceParsedData.condition) {
    setCondition(parseInt(voiceParsedData.condition, 10));
  }

  showToast("Parsed interview moved into artifact form");
}

function saveVoiceParsed() {
  if (!voiceParsedData || Object.keys(voiceParsedData).length === 0) {
    showToast("No voice interview data to save");
    return;
  }

  currentID = Date.now();

  let artifact = {
    id: currentID,
    site: voiceParsedData.site || "",
    type: voiceParsedData.type || "",
    context: voiceParsedData.context || "",
    depth: voiceParsedData.depth || "",
    condition: voiceParsedData.condition || null,
    notes: voiceParsedData.notes || "",
    voice: voiceParsedData.rawVoice || "",
    audio: null,
    gps: "Not recorded",
    lat: null,
    lng: null,
    date: new Date().toLocaleString(),
    photo: "",
    drawing: "",
    savedAt: new Date().toISOString()
  };

  artifacts.push(artifact);
  localStorage.setItem("artifacts", JSON.stringify(artifacts));
  showToast("⚱ Voice interview saved successfully");
  showHome();
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
  stopScanner();
  document.getElementById("detailScreen").classList.remove("hidden");
  let a = artifacts.find(x => x.id === id);
  if (!a) return;
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
  stopScanner();
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
      stream.getTracks().forEach(track => track.stop());
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
  const ctx = canvas.getContext("2d");
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.scale(dpr, dpr);
}

function setupMainCanvasPreview() {
  const c = document.getElementById("canvas");
  if (!c) return;
  resizeCanvas(c);
  renderMainCanvasPreview();
}

function renderMainCanvasPreview() {
  const c = document.getElementById("canvas");
  if (!c) return;

  resizeCanvas(c);
  const ctx = c.getContext("2d");
  const rect = c.getBoundingClientRect();

  ctx.clearRect(0, 0, rect.width, rect.height);

  if (mainCanvasPreviewData) {
    const img = new Image();
    img.onload = function() {
      const fit = containSize(img.width, img.height, rect.width, rect.height);
      const dx = (rect.width - fit.w) / 2;
      const dy = (rect.height - fit.h) / 2;
      ctx.drawImage(img, dx, dy, fit.w, fit.h);
    };
    img.src = mainCanvasPreviewData;
  }
}

function containSize(srcW, srcH, maxW, maxH) {
  const scale = Math.min(maxW / srcW, maxH / srcH);
  return { w: srcW * scale, h: srcH * scale };
}

function enableDrawing(canvas, allowDrawing) {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  resizeCanvas(canvas);
  let drawing = false;

  function getPos(e) {
    const rect = canvas.getBoundingClientRect();
    if (e.touches) return {x:e.touches[0].clientX-rect.left, y:e.touches[0].clientY-rect.top};
    return {x:e.clientX-rect.left, y:e.clientY-rect.top};
  }

  function start(e) {
    if (!allowDrawing) return;
    drawing = true;
    const p = getPos(e);
    ctx.beginPath();
    ctx.moveTo(p.x,p.y);
  }

  function draw(e) {
    if (!allowDrawing || !drawing) return;
    e.preventDefault();
    const p = getPos(e);
    ctx.lineTo(p.x,p.y);
    ctx.strokeStyle = currentColor;
    ctx.lineWidth = currentBrush;
    ctx.globalAlpha = currentOpacity;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  }

  function stop() {
    if (!allowDrawing) return;
    drawing = false;
    ctx.beginPath();
    ctx.globalAlpha = 1;
  }

  canvas.addEventListener("mousedown", start);
  canvas.addEventListener("mousemove", draw);
  canvas.addEventListener("mouseup", stop);
  canvas.addEventListener("mouseleave", stop);
  canvas.addEventListener("touchstart", start, {passive:false});
  canvas.addEventListener("touchmove", draw, {passive:false});
  canvas.addEventListener("touchend", stop);
}

function clearCanvas() {
  mainCanvasPreviewData = null;
  const c = document.getElementById("canvas");
  const ctx = c.getContext("2d");
  ctx.clearRect(0,0,c.width,c.height);
}

function clearCanvasFull() {
  const c = document.getElementById("canvasFull");
  c.getContext("2d").clearRect(0,0,c.width,c.height);
}

function lockBodyScroll() {
  scrollLockY = window.scrollY || window.pageYOffset;
  document.body.classList.add("no-scroll");
  document.body.style.top = `-${scrollLockY}px`;
}

function unlockBodyScroll() {
  document.body.classList.remove("no-scroll");
  document.body.style.top = "";
  window.scrollTo(0, scrollLockY);
}

function openCanvasFullscreen() {
  const fs = document.getElementById("canvasFullscreen");
  const fullCanvas = document.getElementById("canvasFull");

  lockBodyScroll();
  fs.classList.remove("hidden");

  requestAnimationFrame(() => {
    resizeCanvas(fullCanvas);
    const ctx = fullCanvas.getContext("2d");
    const rect = fullCanvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (mainCanvasPreviewData) {
      const img = new Image();
      img.onload = function() {
        const fit = containSize(img.width, img.height, rect.width, rect.height);
        const dx = (rect.width - fit.w) / 2;
        const dy = (rect.height - fit.h) / 2;
        ctx.drawImage(img, dx, dy, fit.w, fit.h);
      };
      img.src = mainCanvasPreviewData;
    }
  });
}

function closeCanvasFullscreen() {
  const fullCanvas = document.getElementById("canvasFull");

  if (fullCanvas.width > 0 && fullCanvas.height > 0) {
    mainCanvasPreviewData = fullCanvas.toDataURL("image/png");
  }

  document.getElementById("canvasFullscreen").classList.add("hidden");
  unlockBodyScroll();
  renderMainCanvasPreview();
}

/* ── QR SCANNER ──────────────────────────────────────────────── */
function startScanner() {
  hideAll();
  document.getElementById("scannerScreen").classList.remove("hidden");

  if (scannerInstance) {
    stopScanner();
  }

  scannerInstance = new Html5Qrcode("reader");
  scannerInstance.start(
    {facingMode:"environment"},
    {fps:10, qrbox:250},
    msg => {
      let artifact = artifacts.find(a => a.id.toString() === msg);
      if (artifact) { showDetail(artifact.id); }
      else { showToast("QR scanned — artifact not found"); }
      stopScanner();
    }
  ).catch(err => {
    console.error("Scanner error:", err);
    showToast("Unable to start scanner");
  });
}

function stopScanner() {
  if (scannerInstance) {
    scannerInstance.stop().catch(()=>{}).finally(() => {
      scannerInstance = null;
    });
  }
}

/* ── MAP ─────────────────────────────────────────────────────── */
function showMap() {
  hideAll();
  stopScanner();
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
  if (c && !document.getElementById("canvasFullscreen").classList.contains("hidden")) {
    resizeCanvas(c);
    const ctx = c.getContext("2d");
    const rect = c.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    if (mainCanvasPreviewData) {
      const img = new Image();
      img.onload = function() {
        const fit = containSize(img.width, img.height, rect.width, rect.height);
        const dx = (rect.width - fit.w) / 2;
        const dy = (rect.height - fit.h) / 2;
        ctx.drawImage(img, dx, dy, fit.w, fit.h);
      };
      img.src = mainCanvasPreviewData;
    }
  }
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
