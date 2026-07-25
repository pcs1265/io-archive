const canvas = document.querySelector("#artworkCanvas");
const ctx = canvas.getContext("2d");
const backgroundCanvas = document.createElement("canvas");
const backgroundCtx = backgroundCanvas.getContext("2d");

const LETTERS = ["R", "A", "I", "N"];
const COLORS = ["#c6f1ff", "#91d9f0", "#d7ebf1", "#70bed9"];
const BASE_WIDTH = 1440;
const BASE_MAX_GLYPHS = 320;
const BASE_MAX_RIPPLES = 84;
const BASE_MAX_DROPS = 220;
const FIXED_TIME_STEP = 1 / 60;
const MAX_FRAME_DELTA = 0.1;
const GROUND_IMPACT_DEPTH = 5;

const state = {
  width: 0,
  height: 0,
  pixelRatio: 1,
  groundY: 0,
  glyphs: [],
  ripples: [],
  drops: [],
  spawnTimer: 0,
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

function glyphLimit() {
  return Math.round(BASE_MAX_GLYPHS * widthDensity());
}

function rippleLimit() {
  return Math.round(BASE_MAX_RIPPLES * widthDensity());
}

function dropLimit() {
  return Math.round(BASE_MAX_DROPS * widthDensity());
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

  backgroundCtx.beginPath();
  backgroundCtx.moveTo(0, state.groundY);
  backgroundCtx.lineTo(state.width, state.groundY);
  backgroundCtx.strokeStyle = "rgba(154, 217, 237, 0.12)";
  backgroundCtx.lineWidth = 1;
  backgroundCtx.stroke();
}

function makeGlyph({
  letter = choose(LETTERS),
  x = random(20, state.width - 20),
  y = random(-100, -30),
  vx = random(-12, 12),
  vy = random(80, 145),
  size = random(20, 42),
  generation = 0,
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

function addRipple(x, strength = 1) {
  state.ripples.push({
    x,
    y: state.groundY + GROUND_IMPACT_DEPTH,
    radius: 4,
    alpha: 0.42 * strength,
    speed: random(65, 95),
  });
  const limit = rippleLimit();
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
      color,
    });
  }
  const limit = dropLimit();
  if (state.drops.length > limit) {
    state.drops.splice(0, state.drops.length - limit);
  }
}

function fracture(glyph) {
  const impactX = glyph.x;
  const impactY = state.groundY + GROUND_IMPACT_DEPTH;
  addRipple(impactX, 1);
  addDrops(impactX, impactY, glyph.color);

  const childSize = Math.max(10, glyph.size * 0.48);
  LETTERS.forEach((letter, index) => {
    const direction = (index - 1.5) / 1.5;
    state.glyphs.push(makeGlyph({
      letter,
      x: impactX + direction * 5,
      y: impactY - childSize * 0.4,
      vx: direction * random(55, 105) + random(-12, 12),
      vy: -random(175, 285) * (1 - Math.abs(direction) * 0.12),
      size: childSize * random(0.9, 1.1),
      generation: 1,
      rotation: glyph.rotation,
      spin: direction * random(1.3, 2.7),
      life: random(2.2, 3.3),
    }));
  });
}

function update(dt) {
  const gravity = state.reducedMotion ? 235 : 340;
  const nextGlyphs = [];
  const density = widthDensity();
  const maxGlyphs = glyphLimit();

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
    glyph.vy += gravity * dt;
    glyph.x += glyph.vx * dt;
    glyph.y += glyph.vy * dt;
    glyph.rotation += glyph.spin * dt;

    if (Number.isFinite(glyph.life)) {
      glyph.life -= dt;
    }

    if (glyph.x < -60) glyph.x = state.width + 50;
    if (glyph.x > state.width + 60) glyph.x = -50;

    const baseline = state.groundY + GROUND_IMPACT_DEPTH;
    if (glyph.y >= baseline && glyph.vy > 0) {
      if (glyph.generation === 0 && state.glyphs.length < maxGlyphs - 4) {
        fracture(glyph);
      } else {
        addRipple(glyph.x, 0.45);
        addDrops(glyph.x, state.groundY, glyph.color);
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
    drop.vy += gravity * 0.72 * dt;
    drop.x += drop.vx * dt;
    drop.y += drop.vy * dt;
    drop.life -= dt;
    return drop.life > 0 && drop.y < state.groundY + 4;
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
    ctx.beginPath();
    ctx.ellipse(ripple.x, ripple.y, ripple.radius, ripple.radius * 0.12, 0, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(160, 226, 246, ${ripple.alpha})`;
    ctx.lineWidth = 1;
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

resize();
const initialGlyphCount = Math.round(24 * widthDensity());
for (let index = 0; index < initialGlyphCount; index += 1) {
  state.glyphs.push(makeGlyph({
    y: random(-state.height * 0.9, state.groundY - 110),
    vy: random(80, 160),
  }));
}
requestAnimationFrame(render);
