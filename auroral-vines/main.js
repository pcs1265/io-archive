const canvas = document.querySelector("#artworkCanvas");
const ctx = canvas.getContext("2d");

const MAX_PIXEL_RATIO = 1.5;
const MIN_STRAND_SPACING = 16;
const SEGMENT_SIZE = 44;
const CONSTRAINT_ITERATIONS = 3;
const POINTER_RADIUS_RATIO = 0.085;
const GRAVITY = 0.34;
const DAMPING = 0.984;
const DEFAULT_TIMESTEP = 1000 / 60;
const MIN_TIMESTEP = 1000 / 144;
const MAX_TIMESTEP = 1000 / 30;
const MAX_FRAME_DELTA = 100;
const MAX_STEPS_PER_FRAME = 4;
const TIMESTEP_SMOOTHING = 0.08;
const GLOW_DECAY = 0.990;
const AURA_ATTACK = 0.18;
const AURA_DECAY = 0.992;
const TOUCH_HOLD_TIMEOUT = 140;

const state = {
  width: 0,
  height: 0,
  pixelRatio: 1,
  background: document.createElement("canvas"),
  strands: [],
  contacts: new Map(),
  pointer: {
    id: null,
    x: 0,
    y: 0,
    previousX: 0,
    previousY: 0,
    active: false,
    pressing: false,
    coarse: false,
    holdFrames: 0
  },
  accumulator: 0,
  lastFrameTime: 0,
  timestep: DEFAULT_TIMESTEP,
  time: 0
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function makePoint(x, y, pinned = false) {
  return {
    x,
    y,
    previousX: x,
    previousY: y,
    originX: x,
    originY: y,
    pinned,
    warmth: 0
  };
}

function canopyY(x, phase = 0) {
  const waveA = Math.sin((x / Math.max(state.width, 1)) * Math.PI * 3 + phase) * 24;
  const waveB = Math.sin((x / Math.max(state.width, 1)) * Math.PI * 9 + phase * 1.7) * 8;

  return clamp(state.height * 0.035 + waveA + waveB, 10, state.height * 0.16);
}

function createStrands() {
  const strandCount = Math.round(clamp(state.width / MIN_STRAND_SPACING, 18, 120));
  const spacing = state.width / (strandCount + 1);

  state.strands = Array.from({ length: strandCount }, (_, strandIndex) => {
    const phase = strandIndex * 0.72;
    const layer = strandIndex % 4;
    const x = spacing * (strandIndex + 1);
    const topInset = canopyY(x, phase);
    const length = clamp(
      state.height * (0.42 + layer * 0.045 + ((strandIndex * 37) % 29) / 100),
      260,
      state.height * 0.82
    );
    const segmentCount = Math.round(clamp(length / SEGMENT_SIZE, 6, 11));
    const segmentLength = length / segmentCount;
    const points = [];

    for (let index = 0; index <= segmentCount; index += 1) {
      points.push(makePoint(
        x + Math.sin(index * 0.8 + phase) * 2.5,
        topInset + index * segmentLength,
        index === 0
      ));
    }

    const branches = [];
    const branchCount = strandIndex % 3 === 0 ? 2 : 1;

    if (strandIndex % 2 === 0) {
      for (let branchIndex = 0; branchIndex < branchCount; branchIndex += 1) {
        branches.push({
          index: clamp(
            2 + ((strandIndex * 5 + branchIndex * 4) % Math.max(2, segmentCount - 2)),
            2,
            segmentCount - 1
          ),
          side: (strandIndex + branchIndex) % 2 === 0 ? -1 : 1,
          length: 12 + layer * 3 + ((strandIndex + branchIndex * 7) % 9),
          leaf: 3.4 + ((strandIndex + branchIndex * 11) % 6) * 0.36
        });
      }
    }

    const leaves = [];
    const leafCount = 2 + (strandIndex % 3);

    if (strandIndex % 3 !== 1) {
      for (let leafIndex = 0; leafIndex < leafCount; leafIndex += 1) {
        leaves.push({
          index: clamp(
            2 + ((strandIndex * 3 + leafIndex * 3) % Math.max(2, segmentCount - 2)),
            2,
            segmentCount - 1
          ),
          side: (strandIndex + leafIndex) % 2 === 0 ? -1 : 1,
          size: 4.5 + ((strandIndex + leafIndex * 5) % 7) * 0.55
        });
      }
    }

    return {
      points,
      branches,
      leaves,
      segmentLength,
      phase,
      hueShift: strandIndex / strandCount,
      layer,
      mass: 1.2 + layer * 0.22,
      aura: 0,
      auraTarget: 0,
      contactIndex: 0,
      targetContactIndex: 0
    };
  });
}

function createBackground() {
  const background = state.background;
  const backgroundCtx = background.getContext("2d");

  background.width = Math.floor(state.width * state.pixelRatio);
  background.height = Math.floor(state.height * state.pixelRatio);
  backgroundCtx.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);

  const gradient = backgroundCtx.createRadialGradient(
    state.width * 0.5,
    state.height * 0.28,
    0,
    state.width * 0.5,
    state.height * 0.28,
    Math.max(state.width, state.height) * 0.9
  );
  gradient.addColorStop(0, "#08243a");
  gradient.addColorStop(0.42, "#061421");
  gradient.addColorStop(1, "#02050a");
  backgroundCtx.fillStyle = gradient;
  backgroundCtx.fillRect(0, 0, state.width, state.height);

  const canopy = backgroundCtx.createLinearGradient(0, 0, 0, state.height * 0.34);
  canopy.addColorStop(0, "rgba(17, 78, 74, 0.78)");
  canopy.addColorStop(0.62, "rgba(6, 35, 46, 0.36)");
  canopy.addColorStop(1, "rgba(4, 10, 20, 0)");
  backgroundCtx.fillStyle = canopy;
  backgroundCtx.fillRect(0, 0, state.width, state.height * 0.36);

  backgroundCtx.globalAlpha = 0.2;
  for (let i = 0; i < 70; i += 1) {
    const x = (i * 97) % state.width;
    const y = (i * 53) % state.height;
    backgroundCtx.fillStyle = i % 3 === 0 ? "#5bf6ff" : "#b77dff";
    backgroundCtx.fillRect(x, y, 1.2, 1.2);
  }
}

function resize() {
  state.pixelRatio = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
  const rect = canvas.getBoundingClientRect();
  state.width = rect.width || window.innerWidth;
  state.height = rect.height || window.innerHeight;

  canvas.width = Math.floor(state.width * state.pixelRatio);
  canvas.height = Math.floor(state.height * state.pixelRatio);
  ctx.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
  createBackground();
  createStrands();
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();

  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top
  };
}

function contactFromEvent(event, active = true) {
  const position = pointerPosition(event);
  const previous = state.contacts.get(event.pointerId);
  const coarse = event.pointerType === "touch";

  return {
    id: event.pointerId,
    x: position.x,
    y: position.y,
    previousX: previous ? previous.x : position.x,
    previousY: previous ? previous.y : position.y,
    active,
    pressing: active,
    coarse,
    holdFrames: coarse
      ? Math.ceil(TOUCH_HOLD_TIMEOUT / state.timestep)
      : 0
  };
}

function syncPointerFromContacts(fallbackContact = null) {
  const contacts = Array.from(state.contacts.values());
  const pointer = contacts[contacts.length - 1] || fallbackContact;

  if (!pointer) {
    state.pointer.active = false;
    state.pointer.pressing = false;
    state.pointer.coarse = false;
    state.pointer.holdFrames = 0;
    state.pointer.id = null;
    return;
  }

  Object.assign(state.pointer, pointer, {
    pressing: state.contacts.size > 0 ? pointer.pressing : state.pointer.pressing
  });
}

function setPointer(event, active = true) {
  const contact = contactFromEvent(event, active);
  state.pointer.previousX = state.pointer.active ? state.pointer.x : contact.x;
  state.pointer.previousY = state.pointer.active ? state.pointer.y : contact.y;
  Object.assign(state.pointer, contact, {
    previousX: state.pointer.previousX,
    previousY: state.pointer.previousY,
    pressing: state.pointer.pressing
  });
}

function drawBackground() {
  ctx.drawImage(state.background, 0, 0, state.width, state.height);
}

function interactWithPointer(point, strand, index, pointer) {
  if (!pointer.active || !pointer.pressing) {
    return;
  }

  const baseRadius = clamp(
    Math.min(state.width, state.height) * POINTER_RADIUS_RATIO,
    42,
    96
  );
  const radius = baseRadius * 1.35;
  const dx = point.x - pointer.x;
  const dy = point.y - pointer.y;
  const distance = Math.hypot(dx, dy);

  if (distance > radius || distance === 0) {
    return;
  }

  const strength = 1 - distance / radius;
  const velocityX = pointer.x - pointer.previousX;
  const velocityY = pointer.y - pointer.previousY;

  const pressBoost = 1.7;
  const force = strength * 4.2 * pressBoost / strand.mass;

  point.x += (dx / distance) * force + velocityX * 0.24 * pressBoost / strand.mass;
  point.y += (dy / distance) * force + velocityY * 0.18 * pressBoost / strand.mass;
  point.warmth = Math.min(1, point.warmth + 0.18);
  strand.auraTarget = Math.max(strand.auraTarget, strength * 1.25);
  strand.targetContactIndex = strand.targetContactIndex
    ? strand.targetContactIndex * 0.72 + index * 0.28
    : index;
}

function simulate(stepScale = 1) {
  state.pointer.holdFrames = Math.max(0, state.pointer.holdFrames - stepScale);
  state.contacts.forEach((contact) => {
    contact.holdFrames = Math.max(0, contact.holdFrames - stepScale);
  });
  const activePointers = state.contacts.size
    ? Array.from(state.contacts.values())
    : [state.pointer];

  state.strands.forEach((strand) => {
    strand.aura += (strand.auraTarget - strand.aura) * AURA_ATTACK * stepScale;
    strand.auraTarget *= Math.pow(AURA_DECAY, stepScale);
    strand.contactIndex = strand.contactIndex
      ? strand.contactIndex * 0.88 + strand.targetContactIndex * 0.12
      : strand.targetContactIndex;

    strand.points.forEach((point, index) => {
      if (point.pinned) {
        point.x = point.originX;
        point.y = point.originY;
        return;
      }

      const damping = Math.pow(DAMPING, stepScale);
      const vx = (point.x - point.previousX) * damping;
      const vy = (point.y - point.previousY) * damping;
      point.previousX = point.x;
      point.previousY = point.y;
      point.x += vx;
      point.y += vy + GRAVITY * strand.mass * stepScale * stepScale;
      point.warmth *= Math.pow(GLOW_DECAY, stepScale);
      activePointers.forEach((pointer) => interactWithPointer(point, strand, index, pointer));
    });

    for (let iteration = 0; iteration < CONSTRAINT_ITERATIONS; iteration += 1) {
      for (let index = 1; index < strand.points.length; index += 1) {
        const a = strand.points[index - 1];
        const b = strand.points[index];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 1;
        const difference = (distance - strand.segmentLength) / distance;

        if (a.pinned) {
          b.x -= dx * difference;
          b.y -= dy * difference;
        } else {
          const offsetX = dx * difference * 0.5;
          const offsetY = dy * difference * 0.5;

          a.x += offsetX;
          a.y += offsetY;
          b.x -= offsetX;
          b.y -= offsetY;
        }
      }
    }
  });
}

function traceStrandPath(points, startIndex = 0, endIndex = points.length - 1) {
  const start = points[startIndex];

  ctx.beginPath();
  ctx.moveTo(start.x, start.y);

  for (let index = Math.max(1, startIndex + 1); index < endIndex; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    ctx.quadraticCurveTo(
      current.x,
      current.y,
      (current.x + next.x) * 0.5,
      (current.y + next.y) * 0.5
    );
  }
}

function drawStrand(strand) {
  const points = strand.points;
  let activity = 0;

  for (let index = 0; index < points.length; index += 1) {
    activity = Math.max(activity, points[index].warmth);
  }

  const layerFade = 1 - strand.layer * 0.16;
  const idleAlpha = 0.075 + strand.layer * 0.018;

  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  if (strand.aura > 0.025) {
    const center = Math.round(clamp(strand.contactIndex, 1, points.length - 2));
    const start = Math.max(0, center - 2);
    const end = Math.min(points.length - 1, center + 3);

    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    traceStrandPath(points, start, end);
    ctx.lineWidth = 8 + strand.aura * 18;
    ctx.strokeStyle = `rgba(82, 246, 255, ${strand.aura * 0.16})`;
    ctx.stroke();

    traceStrandPath(points, start, end);
    ctx.lineWidth = 2.8 + strand.aura * 5.2;
    ctx.strokeStyle = `rgba(156, 255, 214, ${strand.aura * 0.46})`;
    ctx.stroke();
    ctx.restore();
  }

  traceStrandPath(points);

  if (activity > 0.018) {
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    ctx.lineWidth = 1.6 + activity * 4.6;
    ctx.strokeStyle = `rgba(${52 + activity * 54}, ${216 + activity * 32}, ${232 + activity * 23}, ${(0.045 + activity * 0.16) * layerFade})`;
    ctx.stroke();
    ctx.restore();
  }

  ctx.lineWidth = 1.1 + strand.layer * 0.14 + activity * 1.15;
  ctx.strokeStyle = `rgba(${45 + activity * 48}, ${154 + activity * 80}, ${112 + activity * 72}, ${idleAlpha + 0.05 + activity * 0.5})`;
  ctx.stroke();

  drawAnchorBud(strand, activity, layerFade);
  drawLeaves(strand, activity, layerFade);
  drawBranches(strand, activity, layerFade);
}

function drawAnchorBud(strand, activity, layerFade) {
  const root = strand.points[0];
  const budSize = 2.2 + strand.layer * 0.35 + activity * 2.4;

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.beginPath();
  ctx.ellipse(root.x, root.y + 1, budSize * 0.8, budSize, 0, 0, Math.PI * 2);
  ctx.fillStyle = `rgba(${72 + activity * 50}, ${188 + activity * 58}, ${128 + activity * 80}, ${(0.16 + activity * 0.26) * layerFade})`;
  ctx.fill();
  ctx.restore();
}

function drawLeaves(strand, activity, layerFade) {
  if (strand.leaves.length === 0) {
    return;
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  strand.leaves.forEach((leaf) => {
    const root = strand.points[leaf.index];
    const previous = strand.points[leaf.index - 1];
    const next = strand.points[Math.min(strand.points.length - 1, leaf.index + 1)];
    const angle = Math.atan2(next.y - previous.y, next.x - previous.x);
    const leafAngle = angle + leaf.side * (0.9 + strand.layer * 0.05);

    ctx.save();
    ctx.translate(root.x, root.y);
    ctx.rotate(leafAngle);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(leaf.size * 0.45, -leaf.size * 0.5, leaf.size * 1.25, 0);
    ctx.quadraticCurveTo(leaf.size * 0.45, leaf.size * 0.52, 0, 0);
    ctx.fillStyle = `rgba(${54 + activity * 70}, ${205 + activity * 42}, ${132 + activity * 82}, ${(0.13 + activity * 0.3) * layerFade})`;
    ctx.fill();
    ctx.restore();
  });

  ctx.restore();
}

function drawBranches(strand, activity, layerFade) {
  if (strand.branches.length === 0) {
    return;
  }

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  strand.branches.forEach((branch) => {
    const root = strand.points[branch.index];
    const previous = strand.points[branch.index - 1];
    const next = strand.points[Math.min(strand.points.length - 1, branch.index + 1)];
    const angle = Math.atan2(next.y - previous.y, next.x - previous.x);
    const branchAngle = angle + branch.side * (0.72 + strand.layer * 0.08);
    const controlLength = branch.length * 0.55;
    const tipX = root.x + Math.cos(branchAngle) * branch.length;
    const tipY = root.y + Math.sin(branchAngle) * branch.length;
    const controlX = root.x + Math.cos(branchAngle - branch.side * 0.32) * controlLength;
    const controlY = root.y + Math.sin(branchAngle - branch.side * 0.32) * controlLength;

    ctx.beginPath();
    ctx.moveTo(root.x, root.y);
    ctx.quadraticCurveTo(controlX, controlY, tipX, tipY);
    ctx.lineWidth = 0.65 + activity * 0.8;
    ctx.strokeStyle = `rgba(${70 + activity * 56}, ${198 + activity * 46}, ${132 + activity * 74}, ${(0.18 + activity * 0.36) * layerFade})`;
    ctx.stroke();

    ctx.save();
    ctx.translate(tipX, tipY);
    ctx.rotate(branchAngle + branch.side * 0.9);
    ctx.beginPath();
    ctx.ellipse(0, 0, branch.leaf * 0.56, branch.leaf, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(${61 + activity * 72}, ${214 + activity * 38}, ${143 + activity * 70}, ${(0.12 + activity * 0.28) * layerFade})`;
    ctx.fill();
    ctx.restore();

    ctx.beginPath();
    ctx.arc(
      tipX + Math.cos(branchAngle + branch.side * 0.95) * branch.leaf,
      tipY + Math.sin(branchAngle + branch.side * 0.95) * branch.leaf,
      branch.leaf * 0.62,
      branch.side > 0 ? Math.PI * 0.25 : Math.PI * 0.75,
      branch.side > 0 ? Math.PI * 1.35 : Math.PI * 1.85,
      branch.side < 0
    );
    ctx.lineWidth = 0.45 + activity * 0.55;
    ctx.strokeStyle = `rgba(${104 + activity * 50}, ${240}, ${174 + activity * 56}, ${(0.12 + activity * 0.3) * layerFade})`;
    ctx.stroke();
  });

  ctx.restore();
}

function drawPointer() {
  const activePointers = state.contacts.size
    ? Array.from(state.contacts.values())
    : [state.pointer];
  const pressedPointers = activePointers.filter((pointer) => pointer.active && pointer.pressing);

  if (pressedPointers.length === 0) {
    return;
  }

  ctx.save();
  ctx.globalCompositeOperation = "lighter";

  pressedPointers.forEach((pointer) => {
    const glowRadius = 52;

    for (let ring = 4; ring >= 1; ring -= 1) {
      const amount = ring / 4;

      ctx.beginPath();
      ctx.arc(pointer.x, pointer.y, glowRadius * amount, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(94, 246, 255, ${0.018 * (1 - amount) + 0.014})`;
      ctx.fill();
    }

    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, glowRadius * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(132, 255, 211, 0.055)";
    ctx.fill();
  });
  ctx.restore();

  pressedPointers.forEach((pointer) => {
    ctx.beginPath();
    ctx.arc(pointer.x, pointer.y, 18, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(244, 239, 229, 0.28)";
    ctx.lineWidth = 1;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  });
}

function updateTimestep(frameDelta) {
  if (frameDelta <= 0 || frameDelta >= MAX_FRAME_DELTA) {
    return;
  }

  const measuredTimestep = clamp(frameDelta, MIN_TIMESTEP, MAX_TIMESTEP);
  state.timestep += (measuredTimestep - state.timestep) * TIMESTEP_SMOOTHING;
}

function render(time = 0) {
  state.time = time;
  if (!state.lastFrameTime) {
    state.lastFrameTime = time;
  }

  const frameDelta = Math.min(time - state.lastFrameTime, MAX_FRAME_DELTA);
  state.lastFrameTime = time;
  updateTimestep(frameDelta);
  state.accumulator += frameDelta;

  let steps = 0;
  while (state.accumulator >= state.timestep && steps < MAX_STEPS_PER_FRAME) {
    simulate(1);
    state.accumulator -= state.timestep;
    steps += 1;
  }

  if (steps === MAX_STEPS_PER_FRAME) {
    state.accumulator = 0;
  }

  drawBackground();
  state.strands.forEach(drawStrand);
  drawPointer();
  requestAnimationFrame(render);
}

canvas.addEventListener("pointermove", (event) => {
  if (state.contacts.has(event.pointerId)) {
    state.contacts.set(event.pointerId, contactFromEvent(event));
    syncPointerFromContacts();
    return;
  }

  setPointer(event);
});

canvas.addEventListener("pointerleave", (event) => {
  if (state.contacts.has(event.pointerId)) {
    return;
  }

  state.pointer.active = false;
  state.pointer.pressing = false;
  state.pointer.coarse = false;
  state.pointer.holdFrames = 0;
});

canvas.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  canvas.setPointerCapture(event.pointerId);
  state.contacts.set(event.pointerId, contactFromEvent(event));
  state.pointer.pressing = true;
  syncPointerFromContacts();
});

canvas.addEventListener("pointerup", (event) => {
  if (canvas.hasPointerCapture(event.pointerId)) {
    canvas.releasePointerCapture(event.pointerId);
  }

  const endedContact = contactFromEvent(event, false);
  state.contacts.delete(event.pointerId);
  syncPointerFromContacts(endedContact);
  state.pointer.pressing = state.contacts.size > 0;
});

canvas.addEventListener("pointercancel", (event) => {
  state.contacts.delete(event.pointerId);
  syncPointerFromContacts();

  if (state.contacts.size === 0) {
    state.pointer.active = false;
    state.pointer.pressing = false;
    state.pointer.coarse = false;
    state.pointer.holdFrames = 0;
  }
});

window.addEventListener("resize", resize);

resize();
requestAnimationFrame(render);
