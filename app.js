const artworks = [
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
const INACTIVE_SCALE = 0.44;
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
  spreadRatio: 0.34,
  minSpreadRatio: 0.22,
  viewportSpreadRatio: 0.08
};

let selectedIndex = 0;
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
let dockLift = 140;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const clampIndex = (value) => clamp(value, 0, artworks.length - 1);

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

  const getOffset = (index) => {
    return index - rotation;
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

    spread = Math.min(
      cardWidth * DOCK.spreadRatio,
      Math.max(
        cardWidth * DOCK.minSpreadRatio,
        archive.clientWidth * DOCK.viewportSpreadRatio
      )
    );
  };

  const shortestDelta = (from, to) => {
    return clampIndex(to) - from;
  };

  const render = () => {
    renderFrame = 0;
    selectedIndex = clampIndex(Math.round(rotation));

    pieces.forEach((piece, index) => {
      const offset = getOffset(index);
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

      const x = offset * spread;
      const isSelected = index === selectedIndex;
      const y = isSelected ? -dockLift : 0;
      const rotate = offset * 5;
      const scale = isSelected
        ? SELECTED_SCALE
        : Math.max(0.3, INACTIVE_SCALE - distance * INACTIVE_SCALE_FALLOFF);
      const baseOpacity = isSelected ? 1 : Math.max(0.42, 0.76 - distance * 0.08);
      const edgeFade = distance > EDGE_FADE_START
        ? Math.max(0, (VISIBLE_DISTANCE - distance) / 0.8)
        : 1;
      const opacity = baseOpacity * edgeFade;

      piece.style.visibility = "visible";
      piece.classList.toggle("is-selected", isSelected);
      piece.tabIndex = isSelected ? 0 : -1;
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
    const target = start + shortestDelta(start, index);
    const startedAt = performance.now();

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
      pieces[selectedIndex].focus({ preventScroll: true });
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
    rotation = applyEdgeResistance(dragStartRotation - distance / spread);
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
