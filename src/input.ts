// ═══════════════════════════════════════════════
// INPUT
// ═══════════════════════════════════════════════
import {
  getPaused,
  getSimSpeed,
  getViewMode,
  getZoomLevel,
  keys,
  setSimSpeed,
  setViewMode,
  setZoomIndicatorTimer,
  setZoomLevel,
  sim,
  SIM_SPEEDS,
} from "./state.ts";
import {
  activateNextStage,
  toggleLandingGear,
  togglePause,
} from "./simulation.ts";

function buildZoomText(): string {
  const sp = getSimSpeed();
  let text = "ZOOM " + getZoomLevel().toFixed(1) + "x";
  if (sp > 1) text += "  ·  " + sp + "x SPEED";
  return text;
}

function showSimSpeedIndicator(): void {
  const indicator = document.getElementById("zoom-indicator");
  if (indicator) {
    indicator.textContent = buildZoomText();
    indicator.classList.add("show");
  }
  setZoomIndicatorTimer(1.5);

  const sp = getSimSpeed();
  const speedEl = document.getElementById("sim-speed-indicator");
  if (speedEl) {
    if (sp > 1) {
      speedEl.textContent = "\u25BA\u25BA " + sp + "x";
      speedEl.style.display = "block";
    } else {
      speedEl.style.display = "none";
    }
  }
}

window.addEventListener("keydown", (e) => {
  keys[e.code] = true;

  // Escape - toggle pause
  if (e.code === "Escape") {
    e.preventDefault();
    if (sim && !sim.ended) togglePause();
    return;
  }

  // Block game inputs when paused
  if (getPaused()) return;

  if (e.code === "Space") {
    e.preventDefault();
    if (sim && !sim.ended) activateNextStage();
  }

  if (e.code === "KeyM") {
    e.preventDefault();
    const next = getViewMode() === "spacecraft" ? "orbital" : "spacecraft";
    setViewMode(next);
    const label = document.querySelector(".minimap-label");
    if (label) {
      label.textContent = next === "spacecraft" ? "Orbital Map" : "Spacecraft";
    }
  }

  if (e.code === "KeyG") {
    e.preventDefault();
    if (sim && !sim.ended) toggleLandingGear();
  }

  if (e.code === "NumpadAdd" || e.code === "Equal") {
    e.preventDefault();
    if (sim && !sim.ended && !getPaused()) {
      const idx = (SIM_SPEEDS as readonly number[]).indexOf(getSimSpeed());
      if (idx < SIM_SPEEDS.length - 1) setSimSpeed(SIM_SPEEDS[idx + 1]);
      showSimSpeedIndicator();
    }
  }

  if (e.code === "NumpadSubtract" || e.code === "Minus") {
    e.preventDefault();
    if (sim && !sim.ended && !getPaused()) {
      const idx = (SIM_SPEEDS as readonly number[]).indexOf(getSimSpeed());
      if (idx > 0) setSimSpeed(SIM_SPEEDS[idx - 1]);
      showSimSpeedIndicator();
    }
  }

  // Prevent scroll
  if (
    [
      "Space",
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
    ].includes(e.code)
  ) {
    e.preventDefault();
  }
});

window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});

// Mouse wheel zoom
window.addEventListener("wheel", (e) => {
  if (!sim || sim.ended) return;
  e.preventDefault();

  const zoomSpeed = 0.1;
  if (e.deltaY < 0) {
    const before = getZoomLevel();
    setZoomLevel(before * (1 + zoomSpeed));
    // Switch to spacecraft view if already at maximum zoom and still scrolling in
    if (getZoomLevel() === before && getViewMode() === "orbital") {
      setZoomLevel(2 / before);
      setViewMode("spacecraft");
    }
  } else {
    const before = getZoomLevel();
    setZoomLevel(before / (1 + zoomSpeed));
    // Switch to orbital view if already at minimum zoom and still scrolling out
    if (getZoomLevel() === before && getViewMode() === "spacecraft") {
      setZoomLevel(2 / before);
      setViewMode("orbital");
    }
  }

  const indicator = document.getElementById("zoom-indicator");
  if (indicator) {
    indicator.textContent = buildZoomText();
    indicator.classList.add("show");
  }
  setZoomIndicatorTimer(1.5);
}, { passive: false });
