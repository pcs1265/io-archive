const canvas = document.querySelector("#artworkCanvas");
const ctx = canvas.getContext("2d");
const densityInput = document.querySelector("#density");
const densityValue = document.querySelector("#densityValue");
const soundToggle = document.querySelector("#soundToggle");
const soundIcon = document.querySelector("#soundIcon");
const panel = document.querySelector(".panel");
const panelToggle = document.querySelector("#panelToggle");
const panelDetails = document.querySelector("#panelDetails");
const backgroundCanvas = document.createElement("canvas");
const backgroundCtx = backgroundCanvas.getContext("2d");

const LETTERS = ["R", "A", "I", "N"];
const COLORS = ["#c6f1ff", "#91d9f0", "#d7ebf1", "#70bed9"];
const BASE_WIDTH = 1440;
const EMERGENCY_MAX_GLYPHS = 2000;
const EMERGENCY_MAX_RIPPLES = 500;
const EMERGENCY_MAX_DROPS = 1200;
const FIXED_TIME_STEP = 1 / 60;
const MAX_FRAME_DELTA = 0.1;
const SOUND_FADE_TIME = 0.4;

const sound = {
  context: null,
  enabled: false,
  masterGain: null,
  limiter: null,
  buffer: null,
  impactOffsets: [],
  loading: null,
  reverb: null,
};

const state = {
  width: 0,
  height: 0,
  pixelRatio: 1,
  groundY: 0,
  glyphs: [],
  ripples: [],
  drops: [],
  spawnTimer: 0,
  densityMultiplier: 1,
  lastTime: 0,
  accumulatedTime: 0,
  reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
};

const random = (min, max) => min + Math.random() * (max - min);
const choose = (items) => items[Math.floor(Math.random() * items.length)];
const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function widthDensity() {
  return clamp(state.width / BASE_WIDTH, 0.45, 1.8);
}

function effectiveDensity() {
  return widthDensity() * state.densityMultiplier;
}

function minImpactDepth() {
  return clamp(state.height * 0.008, 4, 8);
}

function maxImpactDepth() {
  return clamp(state.height * 0.065, 28, 56);
}

function randomImpactDepth(x) {
  const minDepth = minImpactDepth();
  const maxDepth = maxImpactDepth();
  const surfaceVariation = Math.sin(x * 0.012) * 3;
  return clamp(
    random(minDepth, maxDepth) + surfaceVariation,
    minDepth,
    maxDepth,
  );
}

function resize() {
  const oldWidth = state.width || window.innerWidth;
  const oldHeight = state.height || window.innerHeight;
  const rect = canvas.getBoundingClientRect();

  state.pixelRatio = Math.min(window.devicePixelRatio || 1, state.reducedMotion ? 1 : 1.5);
  state.width = rect.width || window.innerWidth;
  state.height = rect.height || window.innerHeight;
  state.groundY = state.height * 0.86;

  canvas.width = Math.floor(state.width * state.pixelRatio);
  canvas.height = Math.floor(state.height * state.pixelRatio);
  ctx.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);

  const scaleX = state.width / oldWidth;
  const scaleY = state.height / oldHeight;
  state.glyphs.forEach((glyph) => {
    glyph.x *= scaleX;
    glyph.y *= scaleY;
    glyph.impactDepth = clamp(
      glyph.impactDepth * scaleY,
      minImpactDepth(),
      maxImpactDepth(),
    );
  });

  buildBackground();
}

function buildBackground() {
  backgroundCanvas.width = Math.floor(state.width * state.pixelRatio);
  backgroundCanvas.height = Math.floor(state.height * state.pixelRatio);
  backgroundCtx.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);

  const sky = backgroundCtx.createLinearGradient(0, 0, 0, state.height);
  sky.addColorStop(0, "#010508");
  sky.addColorStop(0.38, "#041019");
  sky.addColorStop(0.72, "#081c26");
  sky.addColorStop(1, "#0c2933");
  backgroundCtx.fillStyle = sky;
  backgroundCtx.fillRect(0, 0, state.width, state.height);

  const ground = backgroundCtx.createLinearGradient(0, state.groundY - 70, 0, state.height);
  ground.addColorStop(0, "rgba(9, 28, 37, 0)");
  ground.addColorStop(0.56, "rgba(17, 48, 60, 0.44)");
  ground.addColorStop(1, "rgba(2, 10, 14, 0.88)");
  backgroundCtx.fillStyle = ground;
  backgroundCtx.fillRect(
    0,
    state.groundY - 70,
    state.width,
    state.height - state.groundY + 70,
  );
}

function makeGlyph({
  letter = choose(LETTERS),
  x = random(20, state.width - 20),
  y = random(-100, -30),
  vx = random(-12, 12),
  vy = random(370, 500),
  size = random(20, 42),
  generation = 0,
  impactDepth = randomImpactDepth(x),
  rotation = random(-0.18, 0.18),
  spin = random(-0.3, 0.3),
  life = Infinity,
} = {}) {
  return {
    letter,
    x,
    y,
    vx,
    vy,
    size: Math.round(size),
    generation,
    impactDepth,
    rotation,
    spin,
    life,
    maxLife: life,
    color: choose(COLORS),
    weight: generation === 0 ? 800 : 700,
  };
}

function spawnLetters(count = 1) {
  for (let index = 0; index < count; index += 1) {
    state.glyphs.push(makeGlyph());
  }
}

function addRipple(x, y, strength = 1) {
  state.ripples.push({
    x,
    y,
    radius: 4,
    alpha: 0.42 * strength,
    speed: random(65, 95),
  });
  const limit = EMERGENCY_MAX_RIPPLES;
  if (state.ripples.length > limit) {
    state.ripples.splice(0, state.ripples.length - limit);
  }
}

function addDrops(x, y, color) {
  const count = state.reducedMotion ? 2 : 5;
  for (let index = 0; index < count; index += 1) {
    state.drops.push({
      x,
      y,
      vx: random(-52, 52),
      vy: random(-115, -35),
      life: random(0.3, 0.65),
      surfaceY: y,
      color,
    });
  }
  const limit = EMERGENCY_MAX_DROPS;
  if (state.drops.length > limit) {
    state.drops.splice(0, state.drops.length - limit);
  }
}

function detectImpactOffsets(buffer) {
  const samples = buffer.getChannelData(0);
  const sampleRate = buffer.sampleRate;
  const hopSize = Math.max(64, Math.floor(sampleRate * 0.004));
  const envelopeLength = Math.floor(samples.length / hopSize);
  const envelope = new Float32Array(envelopeLength);

  for (let index = 0; index < envelopeLength; index += 1) {
    let peak = 0;
    const start = index * hopSize;
    const end = Math.min(samples.length, start + hopSize);
    for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
      peak = Math.max(peak, Math.abs(samples[sampleIndex]));
    }
    envelope[index] = peak;
  }

  const prefix = new Float32Array(envelopeLength + 1);
  for (let index = 0; index < envelopeLength; index += 1) {
    prefix[index + 1] = prefix[index] + envelope[index];
  }

  const candidates = [];
  const neighborhood = 30;
  for (let index = neighborhood; index < envelopeLength - neighborhood; index += 1) {
    if (
      envelope[index] < envelope[index - 1]
      || envelope[index] < envelope[index + 1]
    ) {
      continue;
    }

    const surroundingSum = (
      prefix[index + neighborhood]
      - prefix[index - neighborhood]
      - envelope[index]
    );
    const baseline = surroundingSum / (neighborhood * 2 - 1);
    const contrast = envelope[index] / (baseline + 0.002);
    candidates.push({
      index,
      score: Math.max(0, envelope[index] - baseline) * contrast,
    });
  }

  const minimumSpacing = Math.ceil(0.14 * sampleRate / hopSize);
  const selected = [];
  candidates
    .sort((a, b) => b.score - a.score)
    .some((candidate) => {
      const isSeparate = selected.every(
        (index) => Math.abs(index - candidate.index) >= minimumSpacing,
      );
      if (isSeparate) {
        selected.push(candidate.index);
      }
      return selected.length >= 160;
    });

  return selected.map((index) => index * hopSize / sampleRate);
}

function createReverb(audioContext) {
  const preDelay = audioContext.createDelay(0.1);
  const convolver = audioContext.createConvolver();
  const toneFilter = audioContext.createBiquadFilter();
  const wetGain = audioContext.createGain();
  const duration = 2;
  const length = Math.floor(audioContext.sampleRate * duration);
  const impulse = audioContext.createBuffer(2, length, audioContext.sampleRate);

  for (let channel = 0; channel < impulse.numberOfChannels; channel += 1) {
    const data = impulse.getChannelData(channel);
    for (let index = 0; index < length; index += 1) {
      const progress = index / length;
      const decay = Math.pow(1 - progress, 1.7);
      data[index] = random(-1, 1) * decay;
    }
  }

  preDelay.delayTime.value = 0.04;
  convolver.buffer = impulse;
  toneFilter.type = "lowpass";
  toneFilter.frequency.value = 6200;
  toneFilter.Q.value = 0.45;
  wetGain.gain.value = 1.4;
  preDelay
    .connect(convolver)
    .connect(toneFilter)
    .connect(wetGain)
    .connect(sound.masterGain);
  return preDelay;
}

async function enableSound() {
  if (!sound.context) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) {
      return;
    }
    sound.context = new AudioContext();
    sound.masterGain = sound.context.createGain();
    sound.limiter = sound.context.createDynamicsCompressor();
    sound.masterGain.gain.value = 0.0001;
    sound.limiter.threshold.value = -6;
    sound.limiter.knee.value = 3;
    sound.limiter.ratio.value = 12;
    sound.limiter.attack.value = 0.002;
    sound.limiter.release.value = 0.12;
    sound.masterGain.connect(sound.limiter).connect(sound.context.destination);
    sound.reverb = createReverb(sound.context);
  }

  if (sound.context.state === "suspended") {
    await sound.context.resume();
  }

  if (!sound.buffer && !sound.loading) {
    sound.loading = fetch("rain-puddle.mp3")
      .then((response) => {
        if (!response.ok) {
          throw new Error(`Unable to load rain audio: ${response.status}`);
        }
        return response.arrayBuffer();
      })
      .then((audioData) => sound.context.decodeAudioData(audioData))
      .then((buffer) => {
        sound.buffer = buffer;
        sound.impactOffsets = detectImpactOffsets(buffer);
      })
      .catch(() => {
        sound.loading = null;
      });
  }
}

async function toggleSound() {
  if (!sound.enabled) {
    await enableSound();
    if (!sound.context || !sound.masterGain) {
      return;
    }

    sound.enabled = true;
    const now = sound.context.currentTime;
    sound.masterGain.gain.cancelScheduledValues(now);
    sound.masterGain.gain.setTargetAtTime(1, now, SOUND_FADE_TIME);
    soundToggle.setAttribute("aria-pressed", "true");
    soundToggle.setAttribute("aria-label", "Turn sound off");
    soundToggle.title = "Sound on";
    soundIcon.textContent = "🔊";
    return;
  }

  sound.enabled = false;
  const now = sound.context.currentTime;
  sound.masterGain.gain.cancelScheduledValues(now);
  sound.masterGain.gain.setTargetAtTime(0.0001, now, SOUND_FADE_TIME);
  soundToggle.setAttribute("aria-pressed", "false");
  soundToggle.setAttribute("aria-label", "Turn sound on");
  soundToggle.title = "Sound off";
  soundIcon.textContent = "🔇";
}

function playImpactSound(x, size, impactSpeed) {
  const audioContext = sound.context;
  if (
    !sound.enabled
    ||
    !audioContext
    || audioContext.state !== "running"
    || !sound.buffer
    || sound.impactOffsets.length === 0
  ) {
    return;
  }

  const now = audioContext.currentTime;
  const source = audioContext.createBufferSource();
  const highpass = audioContext.createBiquadFilter();
  const lowpass = audioContext.createBiquadFilter();
  const gain = audioContext.createGain();
  const dryGain = audioContext.createGain();
  const reverbSend = audioContext.createGain();
  const panner = typeof audioContext.createStereoPanner === "function"
    ? audioContext.createStereoPanner()
    : null;
  const grainDuration = clamp(
    0.08 + size * 0.002 + random(-0.012, 0.018),
    0.1,
    0.18,
  );
  const impactOffset = choose(sound.impactOffsets);
  const offset = clamp(
    impactOffset - random(0.006, 0.012),
    0,
    sound.buffer.duration - grainDuration,
  );
  const playbackRate = clamp(
    1.5 - size * 0.009 + random(-0.1, 0.12),
    1.02,
    1.45,
  );
  const peakGain = clamp(
    0.19 + size * 0.004 + impactSpeed * 0.0002 + random(-0.05, 0.05),
    0.78,
    1.08,
  ) * 3;
  const highpassFrequency = clamp(
    1120 - size * 18 + random(-240, 240),
    260,
    1250,
  );
  const reverbAmount = clamp(
    0.65 + size * 0.012 + random(-0.16, 0.16),
    0.6,
    1.3,
  );
  source.buffer = sound.buffer;
  source.playbackRate.setValueAtTime(playbackRate, now);
  highpass.type = "highpass";
  highpass.frequency.setValueAtTime(highpassFrequency, now);
  highpass.Q.setValueAtTime(0.7, now);
  lowpass.type = "lowpass";
  lowpass.frequency.setValueAtTime(random(5200, 9800), now);
  lowpass.Q.setValueAtTime(0.5, now);
  dryGain.gain.setValueAtTime(0.5, now);
  reverbSend.gain.setValueAtTime(reverbAmount, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(peakGain, now + 0.0015);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + grainDuration);

  if (panner) {
    panner.pan.setValueAtTime(
      clamp((x / state.width) * 2 - 1, -0.85, 0.85),
      now,
    );
    source.connect(highpass).connect(lowpass).connect(gain).connect(panner);
    panner.connect(dryGain).connect(sound.masterGain);
    panner.connect(reverbSend).connect(sound.reverb);
  } else {
    source.connect(highpass).connect(lowpass).connect(gain);
    gain.connect(dryGain).connect(sound.masterGain);
    gain.connect(reverbSend).connect(sound.reverb);
  }

  source.start(now, offset, grainDuration);
  source.stop(now + grainDuration + 0.01);
}

function fracture(glyph) {
  const impactX = glyph.x;
  const impactY = state.groundY + glyph.impactDepth;
  addRipple(impactX, impactY, 1);
  addDrops(impactX, impactY, glyph.color);
  playImpactSound(impactX, glyph.size, Math.abs(glyph.vy));

  const childSize = Math.max(8, glyph.size * 0.4);
  LETTERS.forEach((letter, index) => {
    const direction = (index - 1.5) / 1.5;
    state.glyphs.push(makeGlyph({
      letter,
      x: impactX + direction * 5,
      y: impactY - childSize * 0.4,
      vx: direction * random(95, 165) + random(-16, 16),
      vy: -random(115, 185) * (1 - Math.abs(direction) * 0.18),
      size: childSize * random(0.9, 1.1),
      generation: 1,
      impactDepth: clamp(
        glyph.impactDepth + random(-6, 8),
        minImpactDepth(),
        maxImpactDepth(),
      ),
      rotation: glyph.rotation,
      spin: direction * random(3.2, 5.8),
      life: random(0.9, 1.45),
    }));
  });
}

function update(dt) {
  const rainGravity = state.reducedMotion ? 60 : 105;
  const splashGravity = state.reducedMotion ? 230 : 360;
  const nextGlyphs = [];
  const density = effectiveDensity();
  const maxGlyphs = EMERGENCY_MAX_GLYPHS;

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    if (state.glyphs.length < maxGlyphs * 0.86) {
      spawnLetters(Math.random() < 0.76 ? 2 : 1);
    }
    state.spawnTimer = state.reducedMotion
      ? random(0.65, 0.95) / density
      : random(0.09, 0.2) / density;
  }

  for (const glyph of state.glyphs) {
    const gravity = glyph.generation === 0 ? rainGravity : splashGravity;
    glyph.vy += gravity * dt;
    glyph.x += glyph.vx * dt;
    glyph.y += glyph.vy * dt;
    glyph.rotation += glyph.spin * dt;

    if (Number.isFinite(glyph.life)) {
      glyph.life -= dt;
    }

    if (glyph.x < -60) glyph.x = state.width + 50;
    if (glyph.x > state.width + 60) glyph.x = -50;

    const baseline = state.groundY + glyph.impactDepth;
    if (glyph.y >= baseline && glyph.vy > 0) {
      if (glyph.generation === 0 && state.glyphs.length < maxGlyphs - 4) {
        fracture(glyph);
      } else {
        addRipple(glyph.x, baseline, 0.45);
        addDrops(glyph.x, baseline, glyph.color);
      }
      continue;
    }

    if (glyph.life > 0 && glyph.y < state.height + 100) {
      nextGlyphs.push(glyph);
    }
  }

  state.glyphs = nextGlyphs.slice(-maxGlyphs);

  state.ripples = state.ripples.filter((ripple) => {
    ripple.radius += ripple.speed * dt;
    ripple.alpha -= dt * 0.5;
    return ripple.alpha > 0;
  });

  state.drops = state.drops.filter((drop) => {
    drop.vy += splashGravity * 0.72 * dt;
    drop.x += drop.vx * dt;
    drop.y += drop.vy * dt;
    drop.life -= dt;
    return drop.life > 0 && drop.y < drop.surfaceY + 4;
  });
}

function drawBackground() {
  ctx.clearRect(0, 0, state.width, state.height);
  ctx.drawImage(backgroundCanvas, 0, 0, state.width, state.height);
}

function drawGlyph(glyph) {
  const alpha = Number.isFinite(glyph.life)
    ? Math.min(1, glyph.life / Math.min(glyph.maxLife, 0.8))
    : 1;
  const font = `${glyph.weight} ${glyph.size}px Nunito, sans-serif`;

  ctx.save();
  ctx.translate(glyph.x, glyph.y);
  ctx.rotate(glyph.rotation);
  ctx.font = font;
  ctx.textAlign = "center";
  ctx.textBaseline = "alphabetic";

  ctx.globalAlpha = alpha * (glyph.generation === 0 ? 0.94 : 0.82);
  ctx.fillStyle = glyph.color;
  ctx.fillText(glyph.letter, 0, 0);
  ctx.restore();
}

function drawEffects() {
  ctx.save();
  ctx.beginPath();
  ctx.rect(
    0,
    state.groundY,
    state.width,
    state.height - state.groundY,
  );
  ctx.clip();

  for (const ripple of state.ripples) {
    const depthRatio = clamp(
      (ripple.y - state.groundY) / maxImpactDepth(),
      0,
      1,
    );
    const verticalScale = 0.09 + depthRatio * 0.055;
    ctx.beginPath();
    ctx.ellipse(
      ripple.x,
      ripple.y,
      ripple.radius,
      ripple.radius * verticalScale,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fillStyle = `rgba(123, 195, 219, ${ripple.alpha * 0.07})`;
    ctx.fill();
    ctx.strokeStyle = `rgba(160, 226, 246, ${ripple.alpha})`;
    ctx.lineWidth = 0.8 + depthRatio * 0.45;
    ctx.stroke();
  }
  ctx.restore();

  for (const drop of state.drops) {
    ctx.beginPath();
    ctx.arc(drop.x, drop.y, 1.2, 0, Math.PI * 2);
    ctx.fillStyle = drop.color;
    ctx.globalAlpha = Math.min(1, drop.life * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function render(time = 0) {
  if (state.lastTime === 0) {
    state.lastTime = time;
  }

  const frameDelta = Math.min(
    (time - state.lastTime) / 1000 || 0,
    MAX_FRAME_DELTA,
  );
  state.lastTime = time;
  state.accumulatedTime = Math.min(
    state.accumulatedTime + frameDelta,
    MAX_FRAME_DELTA,
  );

  while (state.accumulatedTime >= FIXED_TIME_STEP) {
    update(FIXED_TIME_STEP);
    state.accumulatedTime -= FIXED_TIME_STEP;
  }

  drawBackground();
  state.glyphs.forEach(drawGlyph);
  drawEffects();

  requestAnimationFrame(render);
}

window.addEventListener("resize", resize);
densityInput.addEventListener("input", () => {
  state.densityMultiplier = Number(densityInput.value) / 100;
  densityValue.value = `${densityInput.value}%`;
});
soundToggle.addEventListener("click", toggleSound);

const mobilePanelQuery = window.matchMedia("(max-width: 760px)");

function setPanelCollapsed(collapsed) {
  panel.classList.toggle("is-collapsed", collapsed);
  panelToggle.setAttribute("aria-expanded", String(!collapsed));
  panelToggle.setAttribute(
    "aria-label",
    collapsed ? "Show artwork controls" : "Hide artwork controls",
  );
  panelDetails.setAttribute("aria-hidden", String(collapsed));
  panelDetails.inert = collapsed;
}

function syncPanelForViewport(event) {
  setPanelCollapsed(event.matches);
}

panelToggle.addEventListener("click", () => {
  setPanelCollapsed(!panel.classList.contains("is-collapsed"));
});

if (typeof mobilePanelQuery.addEventListener === "function") {
  mobilePanelQuery.addEventListener("change", syncPanelForViewport);
} else {
  mobilePanelQuery.addListener(syncPanelForViewport);
}
syncPanelForViewport(mobilePanelQuery);

resize();
const initialGlyphCount = Math.round(24 * effectiveDensity());
for (let index = 0; index < initialGlyphCount; index += 1) {
  state.glyphs.push(makeGlyph({
    y: random(-state.height * 0.9, state.groundY - 110),
    vy: random(390, 540),
  }));
}
requestAnimationFrame(render);
