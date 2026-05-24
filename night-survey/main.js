const canvas = document.querySelector("#graphCanvas");
const ctx = canvas.getContext("2d");

const state = {
  width: 0,
  height: 0,
  pixelRatio: 1,
  points: [],
  edges: [],
  constellations: [],
  pulses: [],
  pointer: null,
  growth: null,
  lastVibrationTime: -Infinity,
  lastTime: 0,
};

const MIN_POINT_GAP = 14;
const POSITION_CANDIDATES = 28;
const GROWTH_INTERVAL = 20;
const BFS_REACH_SCALE = 0.42;
const BASE_POINT_COUNT = 700;
const BASE_REACH = 150;
const BASE_AREA = 1440 * 900;
const MAX_PIXEL_RATIO = 4;
const MAX_BRANCHES_PER_POINT = 2;
const OUTWARD_STEP = 6;
const DISCOVERY_KEEP_RATE = 0.68;
const MAX_CONSTELLATION_POINTS = 50;
const LINE_DRAW_DURATION = 20;
const STAR_LINE_GAP = 7;
const DISCOVERY_SHINE_ENERGY = 1.35;
const DISCOVERY_VIBRATION_MS = 5;
const DISCOVERY_VIBRATION_INTERVAL = 300;
const ARCHIVE_FADE_DURATION = 7000;
const ARCHIVE_SETTLE_DURATION = 1000;
const GROWTH_RELEASE_FADE_DURATION = 300;

function resize() {
  state.pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const rect = canvas.getBoundingClientRect();
  state.width = rect.width || window.innerWidth;
  state.height = rect.height || window.innerHeight;

  canvas.width = Math.ceil(state.width * state.pixelRatio);
  canvas.height = Math.ceil(state.height * state.pixelRatio);
  ctx.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);

  seedPoints();
}

function seedPoints() {
  const count = getPointCount();
  const margin = Math.min(state.width, state.height) * 0.06;
  state.points = [];

  for (let index = 0; index < count; index += 1) {
    const radius = 1.1 + Math.random() * 1.9;
    const position = findOpenPosition(radius, margin);

    state.points.push({
      id: index,
      x: position.x,
      y: position.y,
      radius,
      energy: 0,
      active: false,
    });
  }

  state.edges = [];
  state.constellations = [];
  state.pulses = [];
  state.growth = null;
}

function getPointCount() {
  const areaScale = (state.width * state.height) / BASE_AREA;

  return clamp(Math.round(BASE_POINT_COUNT * areaScale), 220, 1200);
}

function getReach() {
  const pointCount = Math.max(state.points.length || getPointCount(), 1);
  const currentSpacing = Math.sqrt((state.width * state.height) / pointCount);
  const baseSpacing = Math.sqrt(BASE_AREA / BASE_POINT_COUNT);

  return clamp(BASE_REACH * (currentSpacing / baseSpacing), 96, 220);
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function findOpenPosition(radius, margin) {
  const width = Math.max(1, state.width - margin * 2);
  const height = Math.max(1, state.height - margin * 2);
  let bestCandidate = null;
  let bestScore = -Infinity;

  for (let attempt = 0; attempt < POSITION_CANDIDATES; attempt += 1) {
    const candidate = {
      x: margin + Math.random() * width,
      y: margin + Math.random() * height,
    };
    const score = getSpacingScore(candidate, radius);

    if (score > bestScore) {
      bestCandidate = candidate;
      bestScore = score;
    }
  }

  return bestCandidate;
}

function getSpacingScore(candidate, radius) {
  if (state.points.length === 0) {
    return Infinity;
  }

  return state.points.reduce((nearestGap, point) => {
    const requiredGap = radius + point.radius + MIN_POINT_GAP;
    const actualGap = distance(candidate, point) - requiredGap;

    return Math.min(nearestGap, actualGap);
  }, Infinity);
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const source = event.touches?.[0] || event.changedTouches?.[0] || event;

  return {
    x: source.clientX - rect.left,
    y: source.clientY - rect.top,
  };
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function nearestPoints(origin, limit, maxDistance) {
  return state.points
    .map((point) => ({ point, dist: distance(origin, point) }))
    .filter((item) => item.dist <= maxDistance)
    .sort((a, b) => a.dist - b.dist)
    .slice(0, limit)
    .map((item) => item.point);
}

function startGraphGrowth(position) {
  const origin = nearestPoints(position, 1, Infinity)[0];

  if (!origin) {
    return;
  }

  archiveCurrentConstellation();
  origin.energy = 1;
  state.points.forEach((point) => {
    point.active = false;
  });
  origin.active = true;
  state.growth = {
    active: true,
    origin,
    connected: new Set([origin.id]),
    discovered: new Set([origin.id]),
    queue: [origin],
    pendingEdges: [],
    edgeKeys: new Set(),
    elapsed: 0,
    releaseElapsed: 0,
  };
  state.pulses.push({
    x: origin.x,
    y: origin.y,
    radius: 0,
    alpha: 1,
  });
}

function archiveCurrentConstellation() {
  const activePoints = state.points
    .filter((point) => point.active)
    .map((point) => {
      const visual = getPointVisual(point);

      return {
        x: point.x,
        y: point.y,
        radius: visual.radius,
        archiveRadius: point.radius * 0.8,
        alpha: visual.alpha,
        haloAlpha: visual.haloAlpha,
        haloRadius: visual.haloRadius,
      };
    });
  const edges = state.edges.map((edge) => {
    const visual = getEdgeVisual(edge);

    return {
      from: { x: edge.from.x, y: edge.from.y },
      to: { x: edge.to.x, y: edge.to.y },
      progress: visual.progress,
      alpha: visual.alpha,
      lineWidth: visual.lineWidth,
    };
  }).filter((edge) => edge.progress > 0);

  if (activePoints.length === 0 && edges.length === 0) {
    return;
  }

  state.constellations.push({
    age: 0,
    life: ARCHIVE_FADE_DURATION,
    points: activePoints,
    edges,
  });
  state.edges = [];
}

function stopGraphGrowth() {
  if (state.growth?.active) {
    state.growth.active = false;
    state.growth.releaseElapsed = 0;
  }
}

function edgeKey(from, to) {
  return from.id < to.id ? `${from.id}:${to.id}` : `${to.id}:${from.id}`;
}

function createEdge(from, to, length, order = 0, life = 12000) {
  return {
    from,
    to,
    length,
    age: 0,
    delay: order * 18,
    life: life + Math.random() * 1800,
  };
}

function growGraph(delta) {
  const growth = state.growth;

  if (!growth?.active) {
    return;
  }

  growth.elapsed += delta;

  while (growth.elapsed >= GROWTH_INTERVAL) {
    growth.elapsed -= GROWTH_INTERVAL;
    addGrowthStep(growth);
  }
}

function addGrowthStep(growth) {
  if (growth.connected.size >= MAX_CONSTELLATION_POINTS) {
    growth.active = false;
    return;
  }

  const reach = getReach() * BFS_REACH_SCALE;
  const next = getNextBfsEdge(growth, reach);

  if (!next) {
    if (hasUnrevealedGrowthEdges()) {
      return;
    }

    growth.active = false;
    return;
  }

  const key = edgeKey(next.from, next.to);
  if (
    growth.edgeKeys.has(key) ||
    growth.connected.has(next.to.id) ||
    wouldCrossExistingEdge(next.from, next.to)
  ) {
    return;
  }

  growth.edgeKeys.add(key);
  growth.connected.add(next.to.id);

  next.from.energy = Math.max(next.from.energy, 0.3);
  const edge = createEdge(next.from, next.to, next.dist, 0, 60000);
  edge.revealTo = next.to;
  edge.revealed = false;
  state.edges.push(edge);
  state.edges = state.edges.slice(-1800);
}

function getNextBfsEdge(growth, reach) {
  while (growth.pendingEdges.length > 0 || growth.queue.length > 0) {
    if (growth.pendingEdges.length > 0) {
      return growth.pendingEdges.shift();
    }

    const from = growth.queue.shift();
    const neighbors = getBfsNeighbors(from, growth, reach);

    const selected = chooseNaturalNeighbors(neighbors, MAX_BRANCHES_PER_POINT);

    selected.forEach((next) => {
      growth.discovered.add(next.point.id);
      growth.pendingEdges.push({
        from,
        to: next.point,
        dist: next.dist,
      });
    });
  }

  return null;
}

function hasUnrevealedGrowthEdges() {
  return state.edges.some((edge) => edge.revealTo && !edge.revealed);
}

function getBfsNeighbors(from, growth, reach) {
  const fromRadius = distance(growth.origin, from);

  return state.points
    .map((point) => ({
      point,
      dist: distance(from, point),
      originDist: distance(growth.origin, point),
    }))
    .filter(
      (item) =>
        item.point.id !== from.id &&
        !growth.discovered.has(item.point.id) &&
        item.dist <= reach &&
        item.originDist > fromRadius + OUTWARD_STEP &&
        !wouldCrossExistingEdge(from, item.point),
    )
    .sort((a, b) => a.originDist - b.originDist || a.dist - b.dist);
}

function wouldCrossExistingEdge(from, to) {
  return state.edges.some((edge) => {
    if (sharesEndpoint(from, to, edge)) {
      return false;
    }

    return segmentsIntersect(from, to, edge.from, edge.to);
  });
}

function sharesEndpoint(from, to, edge) {
  return (
    edge.from.id === from.id ||
    edge.from.id === to.id ||
    edge.to.id === from.id ||
    edge.to.id === to.id
  );
}

function segmentsIntersect(a, b, c, d) {
  const abC = direction(a, b, c);
  const abD = direction(a, b, d);
  const cdA = direction(c, d, a);
  const cdB = direction(c, d, b);

  if (abC === 0 && pointOnSegment(a, b, c)) {
    return true;
  }

  if (abD === 0 && pointOnSegment(a, b, d)) {
    return true;
  }

  if (cdA === 0 && pointOnSegment(c, d, a)) {
    return true;
  }

  if (cdB === 0 && pointOnSegment(c, d, b)) {
    return true;
  }

  return abC !== abD && cdA !== cdB;
}

function direction(a, b, c) {
  const cross = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  const epsilon = 0.0001;

  if (Math.abs(cross) <= epsilon) {
    return 0;
  }

  return cross > 0 ? 1 : -1;
}

function pointOnSegment(a, b, point) {
  const epsilon = 0.0001;

  return (
    point.x >= Math.min(a.x, b.x) - epsilon &&
    point.x <= Math.max(a.x, b.x) + epsilon &&
    point.y >= Math.min(a.y, b.y) - epsilon &&
    point.y <= Math.max(a.y, b.y) + epsilon
  );
}

function chooseNaturalNeighbors(neighbors, limit) {
  if (neighbors.length === 0) {
    return [];
  }

  const selected = [];
  const pool = neighbors.slice(0, Math.min(neighbors.length, 7));

  for (let index = 0; index < pool.length && selected.length < limit; index += 1) {
    const candidate = pool[index];
    const isPrimary = index === 0;
    const keepChance = isPrimary ? 1 : DISCOVERY_KEEP_RATE * (1 - index * 0.08);

    if (Math.random() <= keepChance) {
      selected.push(candidate);
    }
  }

  return selected;
}

function updatePoints() {
  state.points.forEach((point) => {
    point.energy *= 0.982;
  });
}

function update(delta) {
  updatePoints();
  growGraph(delta);

  if (state.growth && !state.growth.active) {
    state.growth.releaseElapsed += delta;
  }

  state.constellations = state.constellations
    .map((constellation) => ({ ...constellation, age: constellation.age + delta }))
    .filter((constellation) => constellation.age < constellation.life);

  state.edges = state.edges
    .map((edge) => ({ ...edge, age: edge.age + delta }))
    .filter((edge) => edge.age < edge.life + edge.delay);
  revealReachedPoints();

  state.pulses = state.pulses
    .map((pulse) => ({
      ...pulse,
      radius: pulse.radius + delta * 0.28,
      alpha: pulse.alpha * 0.965,
    }))
    .filter((pulse) => pulse.alpha > 0.025);
}

function revealReachedPoints() {
  state.edges.forEach((edge) => {
    if (!edge.revealTo || edge.revealed || edge.age - edge.delay < LINE_DRAW_DURATION) {
      return;
    }

    edge.revealed = true;
    edge.revealTo.active = true;
    edge.revealTo.energy = DISCOVERY_SHINE_ENERGY;
    vibrateOnDiscovery();

    if (state.growth?.active) {
      state.growth.queue.push(edge.revealTo);
    }
  });
}

function vibrateOnDiscovery() {
  if (!navigator.vibrate) {
    return;
  }

  const now = performance.now();
  const diff = now - state.lastVibrationTime;
  if (diff < DISCOVERY_VIBRATION_INTERVAL * (Math.random())) {
    return;
  }

  state.lastVibrationTime = now;
  navigator.vibrate(DISCOVERY_VIBRATION_MS);
}

function drawBackground() {
  ctx.clearRect(0, 0, state.width, state.height);

  const gradient = ctx.createRadialGradient(
    state.width * 0.54,
    state.height * 0.38,
    0,
    state.width * 0.54,
    state.height * 0.38,
    Math.max(state.width, state.height) * 0.75,
  );
  gradient.addColorStop(0, "rgba(38, 52, 104, 0.28)");
  gradient.addColorStop(0.44, "rgba(8, 14, 34, 0.36)");
  gradient.addColorStop(1, "rgba(2, 4, 13, 0.2)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, state.width, state.height);

}

function drawEdges() {
  ctx.lineCap = "round";

  drawArchivedConstellations();

  state.edges.forEach((edge) => {
    const visual = getEdgeVisual(edge);

    if (visual.progress <= 0) {
      return;
    }

    const segment = insetLineSegment(edge.from, edge.to, visual.progress);

    if (!segment) {
      return;
    }

    ctx.beginPath();
    ctx.moveTo(segment.fromX, segment.fromY);
    ctx.lineTo(segment.toX, segment.toY);
    ctx.strokeStyle = `rgba(178, 201, 255, ${visual.alpha})`;
    ctx.lineWidth = visual.lineWidth;
    ctx.stroke();

  });
}

function drawArchivedConstellations() {
  state.constellations.forEach((constellation) => {
    const fade = Math.max(1 - constellation.age / constellation.life, 0);
    const settle = easeOutCubic(clamp(constellation.age / ARCHIVE_SETTLE_DURATION, 0, 1));

    constellation.edges.forEach((edge) => {
      const segment = insetLineSegment(edge.from, edge.to, edge.progress);

      if (!segment) {
        return;
      }

      ctx.beginPath();
      ctx.moveTo(segment.fromX, segment.fromY);
      ctx.lineTo(segment.toX, segment.toY);
      ctx.strokeStyle = `rgba(178, 201, 255, ${lerp(edge.alpha, 0.16, settle) * fade})`;
      ctx.lineWidth = lerp(edge.lineWidth, 0.55, settle);
      ctx.stroke();
    });

    constellation.points.forEach((point) => {
      const alpha = lerp(point.alpha, 0.34, settle) * fade;
      const radius = lerp(point.radius, point.archiveRadius, settle);
      const haloAlpha = point.haloAlpha * Math.max(1 - settle, 0) * fade;

      ctx.beginPath();
      ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(244, 247, 255, ${alpha})`;
      ctx.fill();

      if (haloAlpha > 0.001) {
        ctx.beginPath();
        ctx.arc(point.x, point.y, point.haloRadius, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(178, 201, 255, ${haloAlpha})`;
        ctx.fill();
      }
    });
  });
}

function getEdgeVisual(edge) {
  const activeAge = edge.age - edge.delay;

  if (activeAge <= 0) {
    return {
      progress: 0,
      alpha: 0,
      lineWidth: 0.55,
    };
  }

  const appear = Math.min(activeAge / 420, 1);
  const fade = Math.max(1 - activeAge / edge.life, 0);
  const strength = appear * fade;

  return {
    progress: Math.min(activeAge / LINE_DRAW_DURATION, 1),
    alpha: 0.1 + strength * 0.34,
    lineWidth: 0.55 + strength * 0.7,
  };
}

function getPointVisual(point) {
  const alpha = Math.min(0.66 + point.energy * 0.22, 1);
  const radius = point.radius * 0.82 + point.energy * 0.45;

  return {
    alpha,
    radius,
    haloAlpha: point.energy > 0.2 ? point.energy * 0.035 : 0,
    haloRadius: radius * 3.4,
  };
}

function lerp(from, to, amount) {
  return from + (to - from) * amount;
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function insetLineSegment(from, to, progress = 1) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  const gap = Math.min(STAR_LINE_GAP, length * 0.32);

  if (length <= gap * 2) {
    return null;
  }

  const nx = dx / length;
  const ny = dy / length;
  const drawn = (length - gap * 2) * progress;

  return {
    fromX: from.x + nx * gap,
    fromY: from.y + ny * gap,
    toX: from.x + nx * (gap + drawn),
    toY: from.y + ny * (gap + drawn),
  };
}

function drawPoints() {
  state.points.forEach((point) => {
    if (!point.active) {
      return;
    }

    const visual = getPointVisual(point);

    ctx.beginPath();
    ctx.arc(point.x, point.y, visual.radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(244, 247, 255, ${visual.alpha})`;
    ctx.fill();

    if (visual.haloAlpha > 0) {
      ctx.beginPath();
      ctx.arc(point.x, point.y, visual.haloRadius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(178, 201, 255, ${visual.haloAlpha})`;
      ctx.fill();
    }
  });

  if (state.growth) {
    const origin = state.growth.origin;
    const release = getGrowthRelease();
    const pulse = 1 + Math.sin(performance.now() * 0.01) * 0.18 * release;
    const alpha = lerp(0.28, 0.72, release);

    ctx.beginPath();
    ctx.arc(origin.x, origin.y, 7 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(247, 217, 141, ${alpha})`;
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }
}

function getGrowthRelease() {
  if (!state.growth) {
    return 0;
  }

  if (state.growth.active) {
    return 1;
  }

  return Math.max(1 - state.growth.releaseElapsed / GROWTH_RELEASE_FADE_DURATION, 0);
}

function drawPulses() {
  state.pulses.forEach((pulse) => {
    ctx.beginPath();
    ctx.arc(pulse.x, pulse.y, pulse.radius, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(247, 217, 141, ${pulse.alpha * 0.24})`;
    ctx.lineWidth = 1;
    ctx.stroke();
  });
}

function drawPointerHint() {
  if (!state.pointer) {
    return;
  }

  const release = getGrowthRelease();

  if (state.growth && release > 0) {
    const origin = state.growth.origin;

    ctx.beginPath();
    ctx.moveTo(state.pointer.x, state.pointer.y);
    ctx.lineTo(origin.x, origin.y);
    ctx.strokeStyle = `rgba(217, 226, 255, ${0.2 * release})`;
    ctx.lineWidth = 0.7;
    ctx.stroke();
  }

  ctx.beginPath();
  ctx.arc(state.pointer.x, state.pointer.y, 4, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(247, 217, 141, 0.46)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function render(time = 0) {
  const delta = Math.min(time - state.lastTime || 16.67, 34);
  state.lastTime = time;

  update(delta);
  drawBackground();
  drawEdges();
  drawPulses();
  drawPointerHint();
  drawPoints();

  requestAnimationFrame(render);
}

canvas.addEventListener("pointermove", (event) => {
  state.pointer = pointerPosition(event);
});

canvas.addEventListener("pointerleave", () => {
  state.pointer = null;
});

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  startGraphGrowth(pointerPosition(event));
});

canvas.addEventListener("pointerup", (event) => {
  stopGraphGrowth();
  canvas.releasePointerCapture(event.pointerId);
});

canvas.addEventListener("pointercancel", () => {
  stopGraphGrowth();
});

window.addEventListener("resize", resize);

resize();
requestAnimationFrame(render);
