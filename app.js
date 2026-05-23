const artworks = [
  {
    title: "Night Survey",
    path: "night-survey/",
    description: "An interactive sketch that grows constellation graphs from click or touch input.",
    accent: "#253a48"
  },
  {
    title: "Night Survey",
    path: "night-survey/",
    description: "An interactive sketch that grows constellation graphs from click or touch input.",
    accent: "#253a48"
  },
  {
    title: "Night Survey",
    path: "night-survey/",
    description: "An interactive sketch that grows constellation graphs from click or touch input.",
    accent: "#253a48"
  },
  {
    title: "Night Survey",
    path: "night-survey/",
    description: "An interactive sketch that grows constellation graphs from click or touch input.",
    accent: "#253a48"
  },
  {
    title: "Night Survey",
    path: "night-survey/",
    description: "An interactive sketch that grows constellation graphs from click or touch input.",
    accent: "#253a48"
  },
  {
    title: "Night Survey",
    path: "night-survey/",
    description: "An interactive sketch that grows constellation graphs from click or touch input.",
    accent: "#253a48"
  },
  {
    title: "Night Survey",
    path: "night-survey/",
    description: "An interactive sketch that grows constellation graphs from click or touch input.",
    accent: "#253a48"
  },
  {
    title: "Night Survey",
    path: "night-survey/",
    description: "An interactive sketch that grows constellation graphs from click or touch input.",
    accent: "#253a48"
  },
  {
    title: "Night Survey",
    path: "night-survey/",
    description: "An interactive sketch that grows constellation graphs from click or touch input.",
    accent: "#253a48"
  },
  {
    title: "Night Survey",
    path: "night-survey/",
    description: "An interactive sketch that grows constellation graphs from click or touch input.",
    accent: "#253a48"
  },
];

const archive = document.querySelector("#archive");
let selectedIndex = 0;
let rotation = 0;
let snapFrame = 0;
let renderFrame = 0;
let snapTimer = 0;
let interactionTimer = 0;
let dragStartX = 0;
let dragStartRotation = 0;
let didDrag = false;
let pressedIndex = -1;
let cardWidth = 220;
let spread = 120;
let isMobileLayout = false;

if (artworks.length === 0) {
  archive.innerHTML = `
    <div class="empty">
      Add an artwork folder, then register it in the artworks array in app.js.
    </div>
  `;
} else {
  archive.replaceChildren(
    ...artworks.map((artwork) => {
      const link = document.createElement("a");
      link.className = "piece";
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

      if (artwork.image) {
        const image = document.createElement("img");
        image.src = artwork.image;
        image.alt = "";
        image.loading = "lazy";
        image.draggable = false;
        link.querySelector(".piece-preview").append(image);
      }

      link.querySelector(".piece-title").textContent = artwork.title;
      link.querySelector(".piece-meta").textContent = artwork.description;
      link.querySelector(".piece-path").textContent = artwork.path;
      return link;
    })
  );

  const pieces = [...archive.querySelectorAll(".piece")];
  const count = pieces.length;

  const clampIndex = (value) => Math.min(Math.max(value, 0), count - 1);
  const applyEdgeResistance = (value) => {
    if (value < 0) {
      return value * 0.28;
    }

    if (value > count - 1) {
      return count - 1 + (value - (count - 1)) * 0.28;
    }

    return value;
  };

  const getOffset = (index) => {
    return index - rotation;
  };

  const updateMeasurements = () => {
    cardWidth = pieces[0]?.offsetWidth || cardWidth;
    isMobileLayout = window.matchMedia("(max-width: 680px)").matches;
    spread = isMobileLayout
      ? Math.min(cardWidth * 0.62, Math.max(cardWidth * 0.42, archive.clientHeight * 0.13))
      : Math.min(cardWidth * 0.68, Math.max(cardWidth * 0.48, archive.clientWidth * 0.17));
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
      const visible = distance <= 3;

      if (!visible) {
        piece.classList.toggle("is-selected", false);
        piece.tabIndex = -1;
        piece.style.setProperty("--opacity", 0);
        piece.style.pointerEvents = "none";
        piece.style.visibility = "hidden";
        return;
      }

      const x = isMobileLayout
        ? 0
        : offset * spread;
      const y = isMobileLayout
        ? offset * spread
        : Math.pow(distance, 1.42) * 38;
      const rotate = isMobileLayout ? 0 : offset * 9;
      const scale = Math.max(0.64, 1.12 - distance * 0.15);
      const baseOpacity = Math.max(0.18, 1 - distance * 0.22);
      const edgeFade = distance > 2.4 ? Math.max(0, (3 - distance) / 0.6) : 1;
      const opacity = baseOpacity * edgeFade;

      piece.style.visibility = "visible";
      piece.classList.toggle("is-selected", index === selectedIndex);
      piece.tabIndex = index === selectedIndex ? 0 : -1;
      piece.style.setProperty("--x", `${x}px`);
      piece.style.setProperty("--y", `${y}px`);
      piece.style.setProperty("--rotate", `${rotate}deg`);
      piece.style.setProperty("--scale", scale);
      piece.style.setProperty("--opacity", opacity);
      piece.style.setProperty("--z", index === selectedIndex
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

  const beginInteraction = () => {
    clearTimeout(interactionTimer);
    archive.classList.add("is-interacting");
  };

  const endInteractionSoon = () => {
    clearTimeout(interactionTimer);
    interactionTimer = window.setTimeout(() => {
      archive.classList.remove("is-interacting");
    }, 180);
  };

  const snapTo = (index) => {
    cancelAnimationFrame(snapFrame);
    cancelAnimationFrame(renderFrame);
    renderFrame = 0;

    const start = rotation;
    const target = start + shortestDelta(start, index);
    const duration = 300;
    const startedAt = performance.now();

    const tick = (now) => {
      const progress = Math.min((now - startedAt) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);

      rotation = start + (target - start) * eased;
      render();

      if (progress < 1) {
        snapFrame = requestAnimationFrame(tick);
        return;
      }

      rotation = clampIndex(Math.round(target));
      render();
      endInteractionSoon();
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
      cancelAnimationFrame(snapFrame);
      clearTimeout(snapTimer);

      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY)
        ? event.deltaX
        : event.deltaY;

      rotation = applyEdgeResistance(rotation + delta / 260);
      scheduleRender();
      snapTimer = window.setTimeout(snapToNearest, 130);
    },
    { passive: false }
  );

  archive.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    beginInteraction();
    cancelAnimationFrame(snapFrame);
    clearTimeout(snapTimer);
    archive.classList.add("is-dragging");
    archive.setPointerCapture(event.pointerId);
    dragStartX = isMobileLayout ? event.clientY : event.clientX;
    dragStartRotation = rotation;
    didDrag = false;
    pressedIndex = pieces.indexOf(event.target.closest(".piece"));
  });

  archive.addEventListener("pointermove", (event) => {
    if (!archive.hasPointerCapture(event.pointerId)) {
      return;
    }

    const distance = isMobileLayout
      ? event.clientY - dragStartX
      : event.clientX - dragStartX;

    didDrag ||= Math.abs(distance) > 6;
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
}
