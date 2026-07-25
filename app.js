const artworks = [
  {
    title: "Letterain",
    path: "letterain/",
    description: "Falling letters fracture into R, A, I, and N when they strike the ground.",
    accent: "#071923"
  },
  {
    title: "Auroral Vines",
    path: "auroral-vines/",
    description: "Bioluminescent hanging vines glow and swing under touch.",
    thumb: "auroral-vines/thumb.jpg",
    accent: "#082922"
  },
  {
    title: "Night Survey",
    path: "night-survey/",
    description: "An interactive sketch that grows constellation graphs from click or touch input.",
    thumb: "night-survey/thumb.jpg",
    accent: "#050817"
  },
];

const archive = document.querySelector("#archive");
const root = document.documentElement;
const CARD_ASPECT_RATIO = 1.58;
const SELECTED_SCALE = 1.08;
const DENSE_INACTIVE_SCALE = 0.44;
const SPARSE_INACTIVE_SCALE = 0.52;
const INACTIVE_SCALE_FALLOFF = 0.018;
const VISIBLE_DISTANCE = 5;
const EDGE_FADE_START = 4.2;
const EDGE_RESISTANCE = 0.28;
const SNAP_DURATION = 300;
const SNAP_DELAY = 130;
const WHEEL_SENSITIVITY = 260;
const DRAG_THRESHOLD = 6;
const ENTRANCE_STAGGER = 38;
const DOCK = {
  widthRatio: 0.7,
  estimatedLiftRatio: 0.11,
  liftRatio: 0.14,
  minWidth: 165,
  maxWidth: 420,
  denseSpreadRatio: 0.34,
  sparseSpreadRatio: 0.66,
  denseMinSpreadRatio: 0.22,
  sparseMinSpreadRatio: 0.46,
  denseViewportSpreadRatio: 0.08,
  sparseViewportSpreadRatio: 0.15,
  denseAtCount: 6
};

let selectedIndex = 0;
let highlightedIndex = 0;
let rotation = 0;
let snapFrame = 0;
let renderFrame = 0;
let snapTimer = 0;
let activationTimer = 0;
let dragStartX = 0;
let dragStartRotation = 0;
let didDrag = false;
let pressedIndex = -1;
let cardWidth = 220;
let spread = 120;
let outerSpread = 72;
let dragSpread = 96;
let dockLift = 140;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const clampIndex = (value) => clamp(value, 0, artworks.length - 1);
const lerp = (from, to, amount) => from + (to - from) * amount;

const createArtworkCard = (artwork) => {
  const link = document.createElement("a");
  link.className = "piece is-entering";
  link.href = artwork.path;
  link.draggable = false;
  link.style.setProperty("--accent", artwork.accent || "#243b3f");
  link.innerHTML = `
    <div class="piece-preview" aria-hidden="true"></div>
    <div class="piece-body">
      <div>
        <h2 class="piece-title"></h2>
        <p class="piece-meta"></p>
      </div>
      <span class="piece-path"></span>
    </div>
  `;

  const thumb = artwork.thumb || artwork.image;

  if (thumb) {
    const image = document.createElement("img");
    image.src = thumb;
    image.alt = "";
    image.loading = "lazy";
    image.draggable = false;
    link.querySelector(".piece-preview").append(image);
  }

  link.querySelector(".piece-title").textContent = artwork.title;
  link.querySelector(".piece-meta").textContent = artwork.description;
  link.querySelector(".piece-path").textContent = artwork.path;
  return link;
};

if (artworks.length === 0) {
  archive.innerHTML = `
    <div class="empty">
      Add an artwork folder, then register it in the artworks array in app.js.
    </div>
  `;
} else {
  archive.replaceChildren(...artworks.map(createArtworkCard));

  const pieces = [...archive.querySelectorAll(".piece")];
  const count = pieces.length;

  const applyEdgeResistance = (value) => {
    if (value < 0) {
      return value * EDGE_RESISTANCE;
    }

    if (value > count - 1) {
      return count - 1 + (value - (count - 1)) * EDGE_RESISTANCE;
    }

    return value;
  };

  const getSparseFactor = () => {
    if (count <= 2) {
      return 1;
    }

    if (count >= DOCK.denseAtCount) {
      return 0;
    }

    return (DOCK.denseAtCount - count) / (DOCK.denseAtCount - 2);
  };

  const getSpread = (sparseFactor) => {
    const spreadRatio = lerp(DOCK.denseSpreadRatio, DOCK.sparseSpreadRatio, sparseFactor);
    const minSpreadRatio = lerp(DOCK.denseMinSpreadRatio, DOCK.sparseMinSpreadRatio, sparseFactor);
    const viewportSpreadRatio = lerp(
      DOCK.denseViewportSpreadRatio,
      DOCK.sparseViewportSpreadRatio,
      sparseFactor
    );

    return Math.min(
      cardWidth * spreadRatio,
      Math.max(
        cardWidth * minSpreadRatio,
        archive.clientWidth * viewportSpreadRatio
      )
    );
  };

  const getOffsetX = (offset) => {
    const distance = Math.abs(offset);
    const direction = Math.sign(offset);

    if (distance <= 1) {
      const easedDistance = distance * distance * (3 - 2 * distance);
      return direction * (
        outerSpread * distance +
        (spread - outerSpread) * easedDistance
      );
    }

    return direction * (spread + (distance - 1) * outerSpread);
  };

  const updateMeasurements = () => {
    const bottomGap = clamp(archive.clientHeight * 0.04, 18, 42);
    const widthLimit = archive.clientWidth * DOCK.widthRatio;
    const estimatedLift = archive.clientHeight * DOCK.estimatedLiftRatio;
    const heightLimit =
      (archive.clientHeight - bottomGap - estimatedLift - 18) /
      (CARD_ASPECT_RATIO * SELECTED_SCALE);

    cardWidth = Math.round(clamp(
      Math.min(widthLimit, heightLimit),
      DOCK.minWidth,
      DOCK.maxWidth
    ));
    root.style.setProperty("--card-width", `${cardWidth}px`);

    const activeHeight = cardWidth * CARD_ASPECT_RATIO * SELECTED_SCALE;
    const availableLift = Math.max(
      0,
      archive.clientHeight - bottomGap - activeHeight - 18
    );
    dockLift = Math.round(Math.min(
      archive.clientHeight * DOCK.liftRatio,
      Math.max(Math.min(44, availableLift), availableLift * 0.72)
    ));

    spread = getSpread(1);
    outerSpread = getSpread(getSparseFactor());
    dragSpread = lerp(outerSpread, spread, 0.5);
  };

  const render = () => {
    renderFrame = 0;
    selectedIndex = clampIndex(Math.round(rotation));
    const sparseFactor = getSparseFactor();
    const inactiveScale = lerp(DENSE_INACTIVE_SCALE, SPARSE_INACTIVE_SCALE, sparseFactor);
    const inactiveOpacityFloor = lerp(0.42, 0.52, sparseFactor);
    const inactiveOpacityBase = lerp(0.76, 0.84, sparseFactor);

    pieces.forEach((piece, index) => {
      const offset = index - rotation;
      const distance = Math.abs(offset);
      const visible = distance <= VISIBLE_DISTANCE;

      if (!visible) {
        piece.classList.toggle("is-selected", false);
        piece.tabIndex = -1;
        piece.style.setProperty("--opacity", 0);
        piece.style.pointerEvents = "none";
        piece.style.visibility = "hidden";
        return;
      }

      const x = getOffsetX(offset);
      const isSelected = index === selectedIndex;
      const isHighlighted = index === highlightedIndex;
      const y = isSelected ? -dockLift : 0;
      const rotate = offset * 5;
      const scale = isSelected
        ? SELECTED_SCALE
        : Math.max(0.3, inactiveScale - distance * INACTIVE_SCALE_FALLOFF);
      const baseOpacity = isSelected ? 1 : Math.max(inactiveOpacityFloor, inactiveOpacityBase - distance * 0.08);
      const edgeFade = distance > EDGE_FADE_START
        ? Math.max(0, (VISIBLE_DISTANCE - distance) / 0.8)
        : 1;
      const opacity = baseOpacity * edgeFade;

      piece.style.visibility = "visible";
      piece.classList.toggle("is-selected", isHighlighted);
      piece.tabIndex = isHighlighted ? 0 : -1;
      piece.style.setProperty("--x", `${x}px`);
      piece.style.setProperty("--y", `${y}px`);
      piece.style.setProperty("--rotate", `${rotate}deg`);
      piece.style.setProperty("--scale", scale);
      piece.style.setProperty("--opacity", opacity);
      piece.style.setProperty("--z", isSelected
        ? 100
        : 80 - Math.round(distance * 10));
      piece.style.pointerEvents = "auto";
    });
  };

  const scheduleRender = () => {
    if (renderFrame) {
      return;
    }

    renderFrame = requestAnimationFrame(render);
  };

  const beginActivation = () => {
    clearTimeout(activationTimer);
    archive.classList.add("is-activating");
  };

  const endActivationSoon = () => {
    clearTimeout(activationTimer);
    activationTimer = window.setTimeout(() => {
      archive.classList.remove("is-activating");
    }, SNAP_DURATION);
  };

  const snapTo = (index) => {
    beginActivation();
    cancelAnimationFrame(snapFrame);
    cancelAnimationFrame(renderFrame);
    renderFrame = 0;

    const start = rotation;
    const targetIndex = clampIndex(index);
    const target = targetIndex;
    const startedAt = performance.now();
    highlightedIndex = targetIndex;
    pieces[highlightedIndex].focus({ preventScroll: true });

    const tick = (now) => {
      const progress = Math.min((now - startedAt) / SNAP_DURATION, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      rotation = start + (target - start) * eased;
      render();

      if (progress < 1) {
        snapFrame = requestAnimationFrame(tick);
        return;
      }

      rotation = clampIndex(Math.round(target));
      render();
      endActivationSoon();
    };

    snapFrame = requestAnimationFrame(tick);
  };

  const snapToNearest = () => {
    snapTo(Math.round(rotation));
  };

  pieces.forEach((piece, index) => {
    piece.addEventListener("click", (event) => {
      if (didDrag) {
        event.preventDefault();
        didDrag = false;
        return;
      }

      if (index === selectedIndex) {
        return;
      }

      event.preventDefault();
      snapTo(index);
    });
  });

  archive.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      beginActivation();
      cancelAnimationFrame(snapFrame);
      clearTimeout(snapTimer);

      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;

      rotation = applyEdgeResistance(rotation + delta / WHEEL_SENSITIVITY);
      scheduleRender();
      snapTimer = window.setTimeout(snapToNearest, SNAP_DELAY);
    },
    { passive: false }
  );

  archive.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    cancelAnimationFrame(snapFrame);
    clearTimeout(snapTimer);
    archive.classList.add("is-dragging");
    archive.setPointerCapture(event.pointerId);
    dragStartX = event.clientX;
    dragStartRotation = rotation;
    didDrag = false;
    pressedIndex = pieces.indexOf(event.target.closest(".piece"));
  });

  archive.addEventListener("pointermove", (event) => {
    if (!archive.hasPointerCapture(event.pointerId)) {
      return;
    }

    const distance = event.clientX - dragStartX;

    didDrag ||= Math.abs(distance) > DRAG_THRESHOLD;
    rotation = applyEdgeResistance(dragStartRotation - distance / dragSpread);
    scheduleRender();
  });

  const finishDrag = (event) => {
    if (!archive.hasPointerCapture(event.pointerId)) {
      return;
    }

    archive.releasePointerCapture(event.pointerId);
    archive.classList.remove("is-dragging");

    if (!didDrag && pressedIndex === selectedIndex) {
      window.location.href = pieces[pressedIndex].href;
    } else if (!didDrag && pressedIndex >= 0) {
      snapTo(pressedIndex);
    } else {
      clearTimeout(snapTimer);
      snapToNearest();
    }

    pressedIndex = -1;
  };

  archive.addEventListener("pointerup", finishDrag);
  archive.addEventListener("pointercancel", finishDrag);

  archive.addEventListener("keydown", (event) => {
    if (event.key === "ArrowRight") {
      event.preventDefault();
      snapTo(selectedIndex + 1);
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      snapTo(selectedIndex - 1);
    }
  });

  window.addEventListener("resize", () => {
    updateMeasurements();
    scheduleRender();
  });
  updateMeasurements();
  render();

  requestAnimationFrame(() => {
    pieces.forEach((piece, index) => {
      window.setTimeout(() => {
        piece.classList.remove("is-entering");
      }, index * ENTRANCE_STAGGER);
    });
  });
}
