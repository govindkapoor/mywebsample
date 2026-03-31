document.documentElement.classList.add("js");

const form = document.getElementById("subscribe-form");
const email = document.getElementById("email");
const button = document.getElementById("subscribe-button");
const note = document.getElementById("form-note");
const starfield = document.getElementById("starfield");
const sceneTitle = document.getElementById("scene-title");
const audioToggle = document.getElementById("audio-toggle");
const audioState = document.getElementById("audio-state");
const motionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
const sceneSections = Array.from(document.querySelectorAll(".scene-section"));

const scenePresets = {
  home: { cameraX: -1.6, cameraY: 1.2, dolly: -2, roll: -0.7, worldX: 0, worldY: 0, worldZ: 0 },
  stories: { cameraX: -0.6, cameraY: 0.5, dolly: -10, roll: -0.3, worldX: -4, worldY: -2, worldZ: -8 },
  issue: { cameraX: 0.8, cameraY: 0.2, dolly: -14, roll: 0.4, worldX: 6, worldY: -4, worldZ: -14 },
  lab: { cameraX: 1.4, cameraY: -0.4, dolly: -18, roll: 0.9, worldX: 9, worldY: -8, worldZ: -22 },
  subscribe: { cameraX: 0.2, cameraY: -0.2, dolly: -6, roll: 0.1, worldX: 2, worldY: -3, worldZ: -6 }
};

let pointerX = window.innerWidth * 0.5;
let pointerY = window.innerHeight * 0.5;
let pointerCameraX = 0;
let pointerCameraY = 0;
let sceneCameraX = 0;
let sceneCameraY = 0;
let sceneDolly = 0;
let sceneRoll = 0;
let worldX = 0;
let worldY = 0;
let worldZ = 0;
let audioContext = null;
let analyserNode = null;
let frequencyData = null;
let microphoneStream = null;
let audioFrameId = null;
let audioMode = "idle";
let smoothedAudioLevel = 0;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function lerp(start, end, amount) {
  return start + (end - start) * amount;
}

function setAudioState(message) {
  if (audioState) {
    audioState.textContent = message;
  }
}

function applyAudioLevel(level) {
  const intensity = motionQuery.matches ? level * 0.35 : level;
  document.documentElement.style.setProperty("--audio-level", intensity.toFixed(3));
  document.documentElement.style.setProperty("--audio-boost", `${(1 + intensity * 0.1).toFixed(3)}`);
}

function stopAudioEngine() {
  if (audioFrameId) {
    cancelAnimationFrame(audioFrameId);
    audioFrameId = null;
  }

  if (microphoneStream) {
    microphoneStream.getTracks().forEach((track) => track.stop());
    microphoneStream = null;
  }

  if (audioContext) {
    audioContext.close();
    audioContext = null;
  }

  analyserNode = null;
  frequencyData = null;
  smoothedAudioLevel = 0;
  audioMode = "idle";
  applyAudioLevel(0);

  if (audioToggle) {
    audioToggle.textContent = "Enable Audio Pulse";
  }

  setAudioState("Idle");
}

function runDemoPulse() {
  audioMode = "demo";
  if (audioToggle) {
    audioToggle.textContent = "Disable Audio Pulse";
  }
  setAudioState("Demo pulse mode");

  function frame(time) {
    const beat = 0.5 + 0.5 * Math.sin(time * 0.0042);
    const layer = 0.5 + 0.5 * Math.sin(time * 0.0117 + 1.2);
    const level = clamp(beat * 0.65 + layer * 0.35, 0, 1);

    applyAudioLevel(level);
    audioFrameId = requestAnimationFrame(frame);
  }

  audioFrameId = requestAnimationFrame(frame);
}

async function startMicrophonePulse() {
  if (!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia)) {
    runDemoPulse();
    setAudioState("Mic unavailable, demo mode");
    return;
  }

  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) {
    runDemoPulse();
    setAudioState("Audio API unavailable, demo mode");
    return;
  }

  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  });

  audioContext = new AudioContextClass();
  analyserNode = audioContext.createAnalyser();
  analyserNode.fftSize = 256;
  analyserNode.smoothingTimeConstant = 0.82;
  frequencyData = new Uint8Array(analyserNode.frequencyBinCount);
  microphoneStream = stream;

  const source = audioContext.createMediaStreamSource(stream);
  source.connect(analyserNode);

  audioMode = "mic";
  if (audioToggle) {
    audioToggle.textContent = "Disable Audio Pulse";
  }
  setAudioState("Microphone reactive");

  function frame() {
    if (!analyserNode || !frequencyData) {
      return;
    }

    analyserNode.getByteFrequencyData(frequencyData);

    let sum = 0;
    for (let index = 0; index < frequencyData.length; index += 1) {
      sum += frequencyData[index];
    }

    const average = sum / (frequencyData.length * 255);
    const boosted = clamp((average - 0.05) * 2.2, 0, 1);
    smoothedAudioLevel = lerp(smoothedAudioLevel, boosted, 0.18);

    applyAudioLevel(smoothedAudioLevel);
    audioFrameId = requestAnimationFrame(frame);
  }

  audioFrameId = requestAnimationFrame(frame);
}

async function toggleAudioPulse() {
  if (audioMode !== "idle") {
    stopAudioEngine();
    return;
  }

  setAudioState("Requesting microphone...");
  try {
    await startMicrophonePulse();
  } catch (_error) {
    runDemoPulse();
    setAudioState("Mic blocked, demo mode");
  }
}

function applySceneTransform() {
  const documentElement = document.documentElement;

  documentElement.style.setProperty("--camera-x", `${(sceneCameraX + pointerCameraX).toFixed(2)}deg`);
  documentElement.style.setProperty("--camera-y", `${(sceneCameraY + pointerCameraY).toFixed(2)}deg`);
  documentElement.style.setProperty("--hero-dolly", `${sceneDolly.toFixed(2)}px`);
  documentElement.style.setProperty("--hero-roll", `${sceneRoll.toFixed(2)}deg`);
  documentElement.style.setProperty("--world-x", `${worldX.toFixed(2)}px`);
  documentElement.style.setProperty("--world-y", `${worldY.toFixed(2)}px`);
  documentElement.style.setProperty("--world-z", `${worldZ.toFixed(2)}px`);
}

function updateScrollProgress() {
  const documentElement = document.documentElement;
  const maxScroll = Math.max(documentElement.scrollHeight - window.innerHeight, 1);
  const progress = Math.min(Math.max((window.scrollY / maxScroll) * 100, 0), 100);

  documentElement.style.setProperty("--scroll-progress", progress.toFixed(2));
}

function updateSceneChapter() {
  if (sceneSections.length === 0) {
    return;
  }

  const viewportCenter = window.innerHeight * 0.5;
  let activeIndex = 0;
  let smallestDistance = Number.POSITIVE_INFINITY;

  sceneSections.forEach((section, index) => {
    const bounds = section.getBoundingClientRect();
    const center = bounds.top + bounds.height * 0.5;
    const distance = Math.abs(center - viewportCenter);

    if (distance < smallestDistance) {
      smallestDistance = distance;
      activeIndex = index;
    }
  });

  sceneSections.forEach((section, index) => {
    section.classList.toggle("is-active-scene", index === activeIndex);
  });

  const activeSection = sceneSections[activeIndex];
  const nextSection = sceneSections[Math.min(activeIndex + 1, sceneSections.length - 1)];
  const activeBounds = activeSection.getBoundingClientRect();
  const blend = clamp((window.innerHeight * 0.52 - activeBounds.top) / Math.max(activeBounds.height, 1), 0, 1);
  const sceneProgress = ((activeIndex + blend) / Math.max(sceneSections.length - 1, 1)) * 100;

  const activePreset = scenePresets[activeSection.id] ?? scenePresets.home;
  const nextPreset = scenePresets[nextSection.id] ?? activePreset;

  sceneCameraX = lerp(activePreset.cameraX, nextPreset.cameraX, blend);
  sceneCameraY = lerp(activePreset.cameraY, nextPreset.cameraY, blend);
  sceneDolly = lerp(activePreset.dolly, nextPreset.dolly, blend);
  sceneRoll = lerp(activePreset.roll, nextPreset.roll, blend);
  worldX = lerp(activePreset.worldX, nextPreset.worldX, blend);
  worldY = lerp(activePreset.worldY, nextPreset.worldY, blend);
  worldZ = lerp(activePreset.worldZ, nextPreset.worldZ, blend);

  document.documentElement.style.setProperty("--scene-progress", `${sceneProgress.toFixed(2)}%`);
  if (sceneTitle) {
    sceneTitle.textContent = activeSection.dataset.scene ?? "Approach";
  }

  applySceneTransform();
}

if (audioToggle) {
  audioToggle.addEventListener("click", () => {
    toggleAudioPulse();
  });
}

const revealTargets = [
  document.querySelector(".topbar"),
  document.querySelector(".hero-copy"),
  document.querySelector(".hero-panel"),
  ...document.querySelectorAll(".story-card"),
  document.querySelector(".section.split"),
  document.querySelector(".lab"),
  document.querySelector(".subscribe"),
  document.querySelector(".footer")
].filter(Boolean);

const tiltTargets = [
  document.querySelector(".hero-copy"),
  document.querySelector(".hero-panel"),
  ...document.querySelectorAll(".story-card"),
  ...document.querySelectorAll(".issue-list-item"),
  document.querySelector(".holo-stage"),
  ...document.querySelectorAll(".lab-notes article"),
  document.querySelector(".subscribe")
].filter(Boolean);

function initStarfield() {
  if (!starfield || motionQuery.matches) {
    return;
  }

  const context = starfield.getContext("2d");
  if (!context) {
    return;
  }

  const particles = [];
  let width = 0;
  let height = 0;
  let dpr = 1;

  function resizeStarfield() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    width = window.innerWidth;
    height = window.innerHeight;

    starfield.width = Math.floor(width * dpr);
    starfield.height = Math.floor(height * dpr);
    starfield.style.width = `${width}px`;
    starfield.style.height = `${height}px`;
    context.setTransform(dpr, 0, 0, dpr, 0, 0);

    const density = Math.max(60, Math.floor((width * height) / 18000));
    particles.length = 0;

    for (let index = 0; index < density; index += 1) {
      particles.push({
        x: Math.random() * width,
        y: Math.random() * height,
        z: Math.random() * 1 + 0.2,
        size: Math.random() * 1.8 + 0.6,
        speed: Math.random() * 0.35 + 0.08
      });
    }
  }

  function frame() {
    const parallaxX = (pointerX / width - 0.5) * 24;
    const parallaxY = (pointerY / height - 0.5) * 24;

    context.clearRect(0, 0, width, height);
    context.fillStyle = "rgba(220, 232, 255, 0.65)";

    particles.forEach((particle) => {
      particle.y -= particle.speed * particle.z;
      if (particle.y < -8) {
        particle.y = height + 8;
        particle.x = Math.random() * width;
      }

      const px = particle.x + parallaxX * particle.z;
      const py = particle.y + parallaxY * particle.z;

      context.beginPath();
      context.arc(px, py, particle.size * particle.z, 0, Math.PI * 2);
      context.fill();
    });

    requestAnimationFrame(frame);
  }

  window.addEventListener("resize", resizeStarfield);
  resizeStarfield();
  requestAnimationFrame(frame);
}

initStarfield();

revealTargets.forEach((target, index) => {
  target.classList.add("revealable");
  target.style.transitionDelay = `${index * 85}ms`;
});

function setVisible(target) {
  target.classList.add("is-visible");
}

if (motionQuery.matches) {
  revealTargets.forEach(setVisible);
  updateScrollProgress();
  updateSceneChapter();
} else {
  const revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          setVisible(entry.target);
          revealObserver.unobserve(entry.target);
        }
      });
    },
    {
      threshold: 0.18,
      rootMargin: "0px 0px -8% 0px"
    }
  );

  revealTargets.forEach((target) => revealObserver.observe(target));

  window.addEventListener("pointermove", (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;

    const cursorX = (event.clientX / window.innerWidth) * 100;
    const cursorY = (event.clientY / window.innerHeight) * 100;
    const sceneTiltX = (cursorX - 50) * 0.18;
    const sceneTiltY = (cursorY - 50) * -0.14;
    pointerCameraX = (cursorX - 50) * 0.12;
    pointerCameraY = (50 - cursorY) * 0.08;

    document.documentElement.style.setProperty("--cursor-x", `${cursorX}%`);
    document.documentElement.style.setProperty("--cursor-y", `${cursorY}%`);
    document.documentElement.style.setProperty("--scene-tilt-x", `${sceneTiltX.toFixed(2)}deg`);
    document.documentElement.style.setProperty("--scene-tilt-y", `${sceneTiltY.toFixed(2)}deg`);
    applySceneTransform();
  });

  window.addEventListener(
    "scroll",
    () => {
      updateScrollProgress();
      updateSceneChapter();
    },
    { passive: true }
  );

  window.addEventListener("resize", updateSceneChapter);
  updateScrollProgress();
  updateSceneChapter();

  tiltTargets.forEach((target) => {
    target.addEventListener("pointermove", (event) => {
      const bounds = target.getBoundingClientRect();
      const offsetX = (event.clientX - bounds.left) / bounds.width;
      const offsetY = (event.clientY - bounds.top) / bounds.height;
      const tiltX = (offsetX - 0.5) * 12;
      const tiltY = (0.5 - offsetY) * 10;

      target.style.setProperty("--tilt-x", `${tiltX.toFixed(2)}deg`);
      target.style.setProperty("--tilt-y", `${tiltY.toFixed(2)}deg`);
      target.style.setProperty("--glow-x", `${(offsetX * 100).toFixed(2)}%`);
      target.style.setProperty("--glow-y", `${(offsetY * 100).toFixed(2)}%`);
      target.style.setProperty("--reveal-y", "0px");
    });

    target.addEventListener("pointerenter", () => {
      target.style.setProperty("--lift", "-8px");
    });

    target.addEventListener("pointerleave", () => {
      target.style.setProperty("--tilt-x", "0deg");
      target.style.setProperty("--tilt-y", "0deg");
      target.style.setProperty("--glow-x", "50%");
      target.style.setProperty("--glow-y", "18%");
      target.style.setProperty("--lift", "0px");
    });
  });
}

window.addEventListener("beforeunload", () => {
  if (audioMode !== "idle") {
    stopAudioEngine();
  }
});

form.addEventListener("submit", (event) => {
  event.preventDefault();

  if (!email.checkValidity()) {
    email.reportValidity();
    return;
  }

  button.textContent = "You're on the list";
  note.textContent = "Thanks. You’ll get the next editorial dispatch.";
  note.classList.add("visible");
  form.reset();
});