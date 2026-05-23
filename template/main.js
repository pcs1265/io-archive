const canvas = document.querySelector("#artworkCanvas");
const ctx = canvas.getContext("2d");

const state = {
  width: 0,
  height: 0,
  pixelRatio: 1,
  pointer: null,
  lastTime: 0,
};

function resize() {
  state.pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  const rect = canvas.getBoundingClientRect();
  state.width = rect.width || window.innerWidth;
  state.height = rect.height || window.innerHeight;

  canvas.width = Math.floor(state.width * state.pixelRatio);
  canvas.height = Math.floor(state.height * state.pixelRatio);
  ctx.setTransform(state.pixelRatio, 0, 0, state.pixelRatio, 0, 0);
}

function pointerPosition(event) {
  const rect = canvas.getBoundingClientRect();
  const source = event.touches?.[0] || event.changedTouches?.[0] || event;

  return {
    x: source.clientX - rect.left,
    y: source.clientY - rect.top,
  };
}

function drawBackground() {
  ctx.clearRect(0, 0, state.width, state.height);

  const gradient = ctx.createRadialGradient(
    state.width * 0.5,
    state.height * 0.42,
    0,
    state.width * 0.5,
    state.height * 0.42,
    Math.max(state.width, state.height) * 0.78,
  );
  gradient.addColorStop(0, "rgba(229, 193, 111, 0.16)");
  gradient.addColorStop(0.42, "rgba(38, 45, 58, 0.28)");
  gradient.addColorStop(1, "rgba(5, 6, 8, 0.2)");

  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, state.width, state.height);
}

function drawPlaceholder(time) {
  const centerX = state.width * 0.5;
  const centerY = state.height * 0.46;
  const count = 18;

  for (let index = 0; index < count; index += 1) {
    const angle = (index / count) * Math.PI * 2 + time * 0.00022;
    const orbit = Math.min(state.width, state.height) * (0.16 + index * 0.006);
    const x = centerX + Math.cos(angle) * orbit;
    const y = centerY + Math.sin(angle * 1.4) * orbit * 0.58;
    const radius = 1.8 + Math.sin(time * 0.002 + index) * 0.8;

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(246, 243, 234, ${0.42 + index / count * 0.34})`;
    ctx.fill();
  }

  if (!state.pointer) {
    return;
  }

  ctx.beginPath();
  ctx.arc(state.pointer.x, state.pointer.y, 18, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(229, 193, 111, 0.48)";
  ctx.lineWidth = 1;
  ctx.stroke();
}

function render(time = 0) {
  state.lastTime = time;

  drawBackground();
  drawPlaceholder(time);

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
  state.pointer = pointerPosition(event);
});

window.addEventListener("resize", resize);

resize();
requestAnimationFrame(render);
