/*
  =========================================================
  TALK' STUDIO - 3D VOICE JOURNAL SIMULATION
  ---------------------------------------------------------
  This script controls the simulation page.

  It uses:
  - Three.js to rebuild the saved 3D prototype.
  - Raycaster to detect clicks on the 3D model buttons.
  - MediaRecorder to record real voice audio.
  - Web Speech API SpeechRecognition for live speech-to-text.
  - SpeechSynthesis for spoken system cues.
  - CanvasTexture to update the LCD screen on the 3D model.
  - localStorage to save multiple voice journal entries.

  Main interaction:
  - Microphone button starts recording after a synced countdown.
  - Microphone button again stops recording and saves the entry.
  - Play button plays or resumes the selected journal.
  - Pause button pauses playback without resetting the audio.
  - Replay button restarts the selected journal.
  - Skip button moves to the next saved journal.
  - Delete button removes the selected journal.
  - Mute button mutes playback and spoken system cues.
  =========================================================
*/

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";


/* =========================================================
   1. PROJECT STORAGE
   ---------------------------------------------------------
   The active project is loaded from localStorage. Voice
   journals are saved inside the same project object.
   ========================================================= */

const STORAGE_KEY = "talkStudioProjects";
const ACTIVE_PROJECT_KEY = "talkStudioActiveProjectId";

function loadProjectsSafely() {
  if (typeof window.loadProjects === "function") {
    return window.loadProjects();
  }

  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || [];
  } catch {
    return [];
  }
}

function saveProjectsSafely(projects) {
  if (typeof window.saveProjects === "function") {
    window.saveProjects(projects);
    return;
  }

  localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

function getActiveProjectSafely() {
  if (typeof window.getActiveProject === "function") {
    return window.getActiveProject();
  }

  const activeProjectId = localStorage.getItem(ACTIVE_PROJECT_KEY);
  const projects = loadProjectsSafely();

  return projects.find((project) => project.id === activeProjectId) || null;
}

let activeProject = getActiveProjectSafely();

if (!activeProject) {
  activeProject = {
    id: crypto.randomUUID(),
    name: "Untitled prototype",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    objects: [],
    background: "",
    voiceJournals: []
  };

  const projects = loadProjectsSafely();
  projects.unshift(activeProject);

  saveProjectsSafely(projects);
  localStorage.setItem(ACTIVE_PROJECT_KEY, activeProject.id);
}

if (!Array.isArray(activeProject.voiceJournals)) {
  activeProject.voiceJournals = [];
}

function saveActiveProject() {
  const projects = loadProjectsSafely();
  const projectIndex = projects.findIndex((project) => project.id === activeProject.id);

  if (projectIndex === -1) return;

  activeProject.updatedAt = new Date().toISOString();
  projects[projectIndex] = activeProject;

  saveProjectsSafely(projects);
}


/* =========================================================
   2. DOM REFERENCES
   ---------------------------------------------------------
   These elements show readable simulation feedback outside
   the 3D model.
   ========================================================= */

const stage = document.getElementById("simulateStage");
const statusText = document.getElementById("simulateStatus");
const mainText = document.getElementById("simulateMainText");
const transcriptText = document.getElementById("simulateTranscript");
const journalAudio = document.getElementById("journalAudio");


/* =========================================================
   3. VOICE JOURNAL STATE
   ---------------------------------------------------------
   These values track recording, playback, selected journal,
   transcript content, cue timing, and mute state.
   ========================================================= */

let selectedJournalIndex = 0;

let mediaRecorder = null;
let recordedChunks = [];
let recognition = null;

let isRecording = false;
let isMuted = false;
let isCountingDown = false;
let recognitionShouldRun = false;

let finalTranscript = "";
let interimTranscript = "";

let silencePromptTimer = null;
let silenceEndTimer = null;
let playbackCaptionTimer = null;

const SpeechRecognition =
  window.SpeechRecognition || window.webkitSpeechRecognition;

const browserCanRecord =
  Boolean(navigator.mediaDevices?.getUserMedia) && Boolean(window.MediaRecorder);

const browserCanTranscribe = Boolean(SpeechRecognition);


/* =========================================================
   4. THREE.JS SETUP
   ---------------------------------------------------------
   Three.js rebuilds the user's saved prototype and allows
   the prototype buttons to be clicked.
   ========================================================= */

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  stage.clientWidth / stage.clientHeight,
  0.1,
  100
);

camera.position.set(0, 2.2, 7);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: true
});

renderer.setSize(stage.clientWidth, stage.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;

stage.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.target.set(0, 0, 0);

scene.add(new THREE.AmbientLight(0xffffff, 0.95));

const keyLight = new THREE.DirectionalLight(0xffffff, 2.4);
keyLight.position.set(4, 7, 5);
scene.add(keyLight);

const fillLight = new THREE.DirectionalLight(0xffe4f0, 1.2);
fillLight.position.set(-4, 2.5, 3);
scene.add(fillLight);

const screenLight = new THREE.PointLight(0xffeb6b, 1.2);
screenLight.position.set(0, 1.1, 2);
scene.add(screenLight);

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

const sceneObjects = [];

let lcdCanvas = null;
let lcdContext = null;
let lcdTexture = null;


/* =========================================================
   5. MATERIAL HELPERS
   ---------------------------------------------------------
   These materials preserve the glossy visual style from the
   build workspace.
   ========================================================= */

function createBodyMaterial(colour = "#D95A00") {
  return new THREE.MeshPhysicalMaterial({
    color: colour,
    roughness: 0.16,
    metalness: 0.06,
    clearcoat: 0.85,
    clearcoatRoughness: 0.14
  });
}

function createComponentMaterial(colour = "#7897DF") {
  return new THREE.MeshPhysicalMaterial({
    color: colour,
    roughness: 0.22,
    metalness: 0.05,
    clearcoat: 0.65,
    clearcoatRoughness: 0.18
  });
}


/* =========================================================
   6. LCD TEXTURE
   ---------------------------------------------------------
   The 3D screen uses a canvas as a live texture. Whenever
   updateLCD runs, both the big HTML screen and 3D LCD update.
   ========================================================= */

function createLCDTexture() {
  lcdCanvas = document.createElement("canvas");
  lcdCanvas.width = 1024;
  lcdCanvas.height = 512;

  lcdContext = lcdCanvas.getContext("2d");

  lcdTexture = new THREE.CanvasTexture(lcdCanvas);
  lcdTexture.colorSpace = THREE.SRGBColorSpace;

  return lcdTexture;
}

function drawWrappedText(context, text, x, y, maxWidth, lineHeight, maxLines) {
  const words = String(text || "").split(" ");
  let line = "";
  let lines = 0;

  for (let index = 0; index < words.length; index += 1) {
    const testLine = `${line}${words[index]} `;
    const width = context.measureText(testLine).width;

    if (width > maxWidth && index > 0) {
      context.fillText(line.trim(), x, y);
      line = `${words[index]} `;
      y += lineHeight;
      lines += 1;

      if (lines >= maxLines - 1) break;
    } else {
      line = testLine;
    }
  }

  context.fillText(line.trim(), x, y);
}

function updateLCD(status, headline, transcript = "") {
  statusText.textContent = status;
  mainText.textContent = headline;
  transcriptText.textContent = transcript;

  if (!lcdContext || !lcdTexture) return;

  lcdContext.clearRect(0, 0, lcdCanvas.width, lcdCanvas.height);

  const gradient = lcdContext.createRadialGradient(512, 235, 24, 512, 235, 430);
  gradient.addColorStop(0, "#fff16b");
  gradient.addColorStop(0.22, "#8b801d");
  gradient.addColorStop(1, "#403c12");

  lcdContext.fillStyle = gradient;
  lcdContext.fillRect(0, 0, lcdCanvas.width, lcdCanvas.height);

  lcdContext.fillStyle = "rgba(255,255,205,0.92)";
  lcdContext.font = "900 34px Arial";
  lcdContext.textAlign = "center";
  lcdContext.fillText(String(status).toUpperCase(), 512, 82);

  lcdContext.fillStyle = "#fff9b8";
  lcdContext.font = "900 60px Arial";
  drawWrappedText(lcdContext, headline, 512, 190, 820, 66, 2);

  lcdContext.fillStyle = "rgba(255,255,215,0.92)";
  lcdContext.font = "600 34px Arial";
  drawWrappedText(lcdContext, transcript || " ", 512, 360, 820, 42, 3);

  lcdTexture.needsUpdate = true;
}


/* =========================================================
   7. MODEL REBUILDING
   ---------------------------------------------------------
   Saved workspace objects are recreated for simulation.
   ========================================================= */

function createShapeGeometry(type) {
  if (type === "sphere") return new THREE.SphereGeometry(1, 64, 64);
  if (type === "box") return new THREE.BoxGeometry(1.8, 1.2, 1.2);
  if (type === "cylinder") return new THREE.CylinderGeometry(0.75, 0.75, 1.6, 64);
  if (type === "cone") return new THREE.ConeGeometry(0.9, 1.7, 64);
  if (type === "capsule") return new THREE.CapsuleGeometry(0.55, 1.25, 12, 48);
  if (type === "torus") return new THREE.TorusGeometry(0.85, 0.22, 24, 96);

  if (type === "doodle") {
    const curve = new THREE.CatmullRomCurve3([
      new THREE.Vector3(-1.1, 0, 0),
      new THREE.Vector3(-0.45, 0.45, 0),
      new THREE.Vector3(0.15, -0.25, 0),
      new THREE.Vector3(0.85, 0.35, 0)
    ]);

    return new THREE.TubeGeometry(curve, 80, 0.08, 16, false);
  }

  return new THREE.BoxGeometry(1, 1, 1);
}

function createIconTexture(symbol) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;

  const context = canvas.getContext("2d");

  context.clearRect(0, 0, 256, 256);
  context.fillStyle = "#ffffff";
  context.font = "900 108px Arial";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(symbol, 128, 134);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  return texture;
}

function getButtonSymbol(type) {
  const symbols = {
    play: "▶",
    pause: "Ⅱ",
    skip: "▶▏",
    rewind: "↺",
    mute: "🔈",
    delete: "⌫",
    mic: "🎙"
  };

  return symbols[type] || "";
}

function createCircularIconButton(type, colour) {
  const group = new THREE.Group();

  const base = new THREE.Mesh(
    new THREE.CylinderGeometry(0.28, 0.28, 0.12, 48),
    createComponentMaterial(colour)
  );

  base.rotation.x = Math.PI / 2;

  const icon = new THREE.Mesh(
    new THREE.CircleGeometry(0.21, 48),
    new THREE.MeshBasicMaterial({
      map: createIconTexture(getButtonSymbol(type)),
      transparent: true
    })
  );

  icon.position.z = 0.07;

  group.add(base);
  group.add(icon);

  return group;
}

function createLCDScreen() {
  const group = new THREE.Group();

  const frame = new THREE.Mesh(
    new THREE.BoxGeometry(1.55, 0.72, 0.16),
    new THREE.MeshPhysicalMaterial({
      color: "#4a2a1f",
      roughness: 0.28,
      metalness: 0.08,
      clearcoat: 0.4
    })
  );

  const screen = new THREE.Mesh(
    new THREE.BoxGeometry(1.28, 0.46, 0.18),
    new THREE.MeshBasicMaterial({
      map: createLCDTexture()
    })
  );

  const reflection = new THREE.Mesh(
    new THREE.PlaneGeometry(0.55, 0.18),
    new THREE.MeshBasicMaterial({
      color: "#ffffff",
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide
    })
  );

  screen.position.z = 0.1;
  reflection.position.set(-0.25, 0.12, 0.205);
  reflection.rotation.z = -0.18;

  group.add(frame);
  group.add(screen);
  group.add(reflection);

  return group;
}

function createComponent(type, colour) {
  if (type === "screen") return createLCDScreen();
  return createCircularIconButton(type, colour);
}

function applyTransform(object, data) {
  object.position.set(data.position?.x || 0, data.position?.y || 0, data.position?.z || 0);
  object.rotation.set(data.rotation?.x || 0, data.rotation?.y || 0, data.rotation?.z || 0);
  object.scale.set(data.scale?.x || 1, data.scale?.y || 1, data.scale?.z || 1);
}

function restorePrototype() {
  if (activeProject.background) {
    stage.style.backgroundImage = `url("${activeProject.background}")`;
    stage.style.backgroundSize = "cover";
    stage.style.backgroundPosition = "center";
  }

  if (!Array.isArray(activeProject.objects) || activeProject.objects.length === 0) {
    updateLCD("No prototype", "Build a model first.", "");
    return;
  }

  activeProject.objects.forEach((data) => {
    let object = null;

    if (data.kind === "shape") {
      object = new THREE.Mesh(
        createShapeGeometry(data.type),
        createBodyMaterial(data.colour || "#D95A00")
      );
    }

    if (data.kind === "component") {
      object = createComponent(data.type, data.colour || "#7897DF");
    }

    if (!object) return;

    object.userData = {
      id: data.id || crypto.randomUUID(),
      kind: data.kind,
      type: data.type
    };

    applyTransform(object, data);

    scene.add(object);
    sceneObjects.push(object);
  });
}


/* =========================================================
   8. JOURNAL SELECTION
   ========================================================= */

function getNextJournalNumber() {
  return activeProject.voiceJournals.length + 1;
}

function getSelectedJournal() {
  return activeProject.voiceJournals[selectedJournalIndex] || null;
}

function renderSelectedJournal() {
  const journal = getSelectedJournal();

  if (!journal) {
    updateLCD("Ready", "Click the microphone to record.", "");
    journalAudio.removeAttribute("src");
    journalAudio.load();
    return;
  }

  journalAudio.src = journal.audioDataUrl;

  updateLCD(
    `Voice journaling ${selectedJournalIndex + 1} ready`,
    `Voice journaling ${selectedJournalIndex + 1} selected.`,
    journal.transcript || ""
  );
}


/* =========================================================
   9. SPOKEN CUES AND COUNTDOWN
   ---------------------------------------------------------
   Countdown timing is synced by waiting for the spoken cue to
   finish before recording begins.
   ========================================================= */

function speakCueAndWait(text) {
  return new Promise((resolve) => {
    if (isMuted || !window.speechSynthesis) {
      resolve();
      return;
    }

    window.speechSynthesis.cancel();

    const cue = new SpeechSynthesisUtterance(text);
    cue.rate = 1;
    cue.pitch = 1;
    cue.volume = 0.75;

    cue.onend = resolve;
    cue.onerror = resolve;

    window.speechSynthesis.speak(cue);
  });
}

function speakCue(text) {
  if (isMuted || !window.speechSynthesis) return;

  window.speechSynthesis.cancel();

  const cue = new SpeechSynthesisUtterance(text);
  cue.rate = 1;
  cue.pitch = 1;
  cue.volume = 0.75;

  window.speechSynthesis.speak(cue);
}

async function runCountdown(journalNumber) {
  isCountingDown = true;

  updateLCD(
    `Voice journaling ${journalNumber}`,
    "Recording starts in 3, 2, 1.",
    "Get ready."
  );

  await speakCueAndWait(`Voice journaling ${journalNumber} recording. Recording starts in 3, 2, 1.`);

  updateLCD(
    `Voice journaling ${journalNumber} recording`,
    "Start talking now.",
    "Listening..."
  );

  isCountingDown = false;
}


/* =========================================================
   10. SPEECH RECOGNITION
   ========================================================= */

function createRecognition() {
  if (!browserCanTranscribe) return null;

  const recogniser = new SpeechRecognition();

  recogniser.continuous = true;
  recogniser.interimResults = true;
  recogniser.lang = "en-GB";

  recogniser.onresult = (event) => {
    interimTranscript = "";

    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const result = event.results[index];
      const text = result[0].transcript;

      if (result.isFinal) {
        finalTranscript += `${text.trim()} `;
      } else {
        interimTranscript += text;
      }
    }

    updateLiveTranscript();
    resetSilenceTimers();
  };

  recogniser.onend = () => {
    if (!recognitionShouldRun) return;

    setTimeout(() => {
      try {
        recogniser.start();
      } catch {
        recognitionShouldRun = false;
      }
    }, 250);
  };

  recogniser.onerror = () => {
    updateLCD(
      `Voice journaling ${getNextJournalNumber()} recording`,
      "Still recording audio.",
      "Live captions may pause in this browser."
    );
  };

  return recogniser;
}

function updateLiveTranscript() {
  const journalNumber = getNextJournalNumber();
  const transcript = `${finalTranscript} ${interimTranscript}`.trim();

  updateLCD(
    `Voice journaling ${journalNumber} recording`,
    "Listening...",
    transcript || "Listening..."
  );
}


/* =========================================================
   11. SILENCE HANDLING
   ========================================================= */

function clearSilenceTimers() {
  clearTimeout(silencePromptTimer);
  clearTimeout(silenceEndTimer);
}

function resetSilenceTimers() {
  clearSilenceTimers();

  if (!isRecording || isCountingDown) return;

  silencePromptTimer = setTimeout(() => {
    updateLCD(
      `Voice journaling ${getNextJournalNumber()} recording`,
      "Are you still there?",
      finalTranscript.trim()
    );

    speakCue("Are you still there?");
  }, 3000);

  silenceEndTimer = setTimeout(() => {
    if (isRecording) {
      stopRecordingAndSave("Voice journaling ended.");
    }
  }, 6000);
}


/* =========================================================
   12. RECORDING CONTROL
   ========================================================= */

async function startRecording() {
  if (isRecording) {
    stopRecordingAndSave("Recording stopped.");
    return;
  }

  if (isCountingDown) return;

  if (!browserCanRecord) {
    updateLCD("Unavailable", "This browser cannot record audio.", "Use Chrome or Edge on localhost.");
    return;
  }

  const journalNumber = getNextJournalNumber();

  recordedChunks = [];
  finalTranscript = "";
  interimTranscript = "";

  await runCountdown(journalNumber);

  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

  mediaRecorder = new MediaRecorder(stream);

  mediaRecorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      recordedChunks.push(event.data);
    }
  };

  mediaRecorder.onstop = () => {
    stream.getTracks().forEach((track) => track.stop());

    const audioBlob = new Blob(recordedChunks, { type: "audio/webm" });
    const reader = new FileReader();

    reader.onloadend = () => {
      const audioDataUrl = reader.result;

      const newJournal = {
        id: crypto.randomUUID(),
        number: activeProject.voiceJournals.length + 1,
        audioDataUrl,
        transcript: finalTranscript.trim(),
        createdAt: new Date().toISOString()
      };

      activeProject.voiceJournals.push(newJournal);
      selectedJournalIndex = activeProject.voiceJournals.length - 1;

      saveActiveProject();

      journalAudio.src = audioDataUrl;

      updateLCD(
        `Voice journaling ${newJournal.number} recorded`,
        `Voice journaling ${newJournal.number} saved.`,
        newJournal.transcript || "No transcript captured."
      );

      speakCue(`Voice journaling ${newJournal.number} recorded.`);
    };

    reader.readAsDataURL(audioBlob);
  };

  mediaRecorder.start();

  isRecording = true;
  recognitionShouldRun = true;

  recognition = createRecognition();

  if (recognition) {
    try {
      recognition.start();
    } catch {
      recognitionShouldRun = false;
    }
  }

  resetSilenceTimers();
}

function stopRecordingAndSave(message) {
  if (!isRecording) return;

  const journalNumber = getNextJournalNumber();

  isRecording = false;
  recognitionShouldRun = false;

  clearSilenceTimers();

  if (recognition) {
    try {
      recognition.stop();
    } catch {
      recognitionShouldRun = false;
    }
  }

  updateLCD(
    `Voice journaling ${journalNumber} ending`,
    message,
    finalTranscript.trim()
  );

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }
}


/* =========================================================
   13. PLAYBACK CONTROL
   ========================================================= */

function playJournal() {
  const journal = getSelectedJournal();

  if (!journal) {
    updateLCD("No journal", "Record a journal first.", "");
    speakCue("Record a journal first.");
    return;
  }

  if (!journalAudio.src || journalAudio.src !== journal.audioDataUrl) {
    journalAudio.src = journal.audioDataUrl;
    journalAudio.load();
  }

  journalAudio.muted = isMuted;
  journalAudio.play();

  updateLCD(
    `Voice journaling ${selectedJournalIndex + 1} playing`,
    `Playing voice journaling ${selectedJournalIndex + 1}.`,
    journal.transcript || ""
  );

  startPlaybackCaptions(journal);
}

function pauseJournal() {
  journalAudio.pause();
  clearInterval(playbackCaptionTimer);

  const journal = getSelectedJournal();

  updateLCD(
    "Paused",
    "Playback paused.",
    journal?.transcript || ""
  );
}

function replayJournal() {
  const journal = getSelectedJournal();

  if (!journal) {
    updateLCD("No journal", "Record a journal first.", "");
    return;
  }

  journalAudio.currentTime = 0;
  playJournal();
}

function skipJournal() {
  if (activeProject.voiceJournals.length === 0) {
    updateLCD("No journal", "Record a journal first.", "");
    return;
  }

  selectedJournalIndex =
    (selectedJournalIndex + 1) % activeProject.voiceJournals.length;

  journalAudio.pause();
  journalAudio.currentTime = 0;

  renderSelectedJournal();
}

function deleteSelectedJournal() {
  if (isRecording) {
    stopRecordingAndSave("Recording stopped before delete.");
    return;
  }

  if (activeProject.voiceJournals.length === 0) {
    updateLCD("No journal", "Nothing to delete.", "");
    return;
  }

  const deletedNumber = selectedJournalIndex + 1;

  activeProject.voiceJournals.splice(selectedJournalIndex, 1);

  activeProject.voiceJournals = activeProject.voiceJournals.map((journal, index) => ({
    ...journal,
    number: index + 1
  }));

  if (selectedJournalIndex >= activeProject.voiceJournals.length) {
    selectedJournalIndex = Math.max(0, activeProject.voiceJournals.length - 1);
  }

  saveActiveProject();

  updateLCD("Deleted", `Voice journaling ${deletedNumber} deleted.`, "");
  renderSelectedJournal();
}

function startPlaybackCaptions(journal) {
  clearInterval(playbackCaptionTimer);

  const words = (journal.transcript || "").split(" ").filter(Boolean);

  if (words.length === 0) return;

  playbackCaptionTimer = setInterval(() => {
    if (journalAudio.paused || !journalAudio.duration) return;

    const progress = journalAudio.currentTime / journalAudio.duration;
    const wordCount = Math.max(1, Math.ceil(words.length * progress));
    const visibleText = words.slice(0, wordCount).join(" ");

    updateLCD(
      `Voice journaling ${selectedJournalIndex + 1} playing`,
      `Playing voice journaling ${selectedJournalIndex + 1}.`,
      visibleText
    );
  }, 180);
}

journalAudio.addEventListener("ended", () => {
  clearInterval(playbackCaptionTimer);

  updateLCD(
    "Finished",
    `Voice journaling ${selectedJournalIndex + 1} finished.`,
    getSelectedJournal()?.transcript || ""
  );
});


/* =========================================================
   14. ACTION ROUTER
   ========================================================= */

function runAction(type) {
  if (type === "mic") startRecording();
  if (type === "play") playJournal();
  if (type === "pause") pauseJournal();
  if (type === "skip") skipJournal();
  if (type === "rewind") replayJournal();
  if (type === "delete") deleteSelectedJournal();

  if (type === "mute") {
    isMuted = !isMuted;
    journalAudio.muted = isMuted;

    updateLCD(
      isMuted ? "Muted" : "Sound on",
      isMuted ? "Audio muted." : "Audio enabled.",
      getSelectedJournal()?.transcript || ""
    );
  }
}


/* =========================================================
   15. 3D CLICK DETECTION
   ========================================================= */

function updatePointer(event) {
  const rect = renderer.domElement.getBoundingClientRect();

  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
}

function findInteractiveRoot(object) {
  let current = object;

  while (current.parent && !current.userData.type) {
    current = current.parent;
  }

  return current;
}

renderer.domElement.addEventListener("click", (event) => {
  updatePointer(event);

  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(sceneObjects, true);

  if (hits.length === 0) return;

  const rootObject = findInteractiveRoot(hits[0].object);
  const type = rootObject.userData.type;

  runAction(type);
});


/* =========================================================
   16. SUPPORT STATUS
   ========================================================= */

function showSupportStatus() {
  if (!browserCanRecord) {
    updateLCD("Unavailable", "Voice recording is not supported.", "Use Chrome or Edge on localhost.");
    return;
  }

  if (!browserCanTranscribe) {
    updateLCD("Limited STT", "Recording works, captions may not.", "Use Chrome or Edge for live speech-to-text.");
    return;
  }

  renderSelectedJournal();
}


/* =========================================================
   17. RESPONSIVE RENDERING
   ========================================================= */

window.addEventListener("resize", () => {
  camera.aspect = stage.clientWidth / stage.clientHeight;
  camera.updateProjectionMatrix();

  renderer.setSize(stage.clientWidth, stage.clientHeight);
});


/* =========================================================
   18. RENDER LOOP
   ========================================================= */

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

restorePrototype();
showSupportStatus();
animate();