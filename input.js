// ═══════════════════════════════════════════════
// INPUT
// ═══════════════════════════════════════════════
window.addEventListener("keydown", (e) => {
  keys[e.code] = true;

  // Escape - toggle pause
  if (e.code === "Escape") {
    e.preventDefault();
    if (sim && !sim.ended) togglePause();
    return;
  }

  // Block game inputs when paused
  if (paused) return;

  if (e.code === "Space") {
    e.preventDefault();
    if (sim && !sim.ended) activateNextStage();
  }

  if (e.code === "KeyM") {
    e.preventDefault();
    viewMode = viewMode === "spacecraft" ? "orbital" : "spacecraft";
    document.querySelector(".minimap-label").textContent =
      viewMode === "spacecraft" ? "Orbital Map" : "Spacecraft";
  }

  if (e.code === "KeyG") {
    e.preventDefault();
    if (sim && !sim.ended) toggleLandingGear();
  }

  if (e.code === "NumpadAdd" || e.code === "Equal") {
    e.preventDefault();
    if (sim && !sim.ended && !paused) {
      const idx = SIM_SPEEDS.indexOf(simSpeed);
      if (idx < SIM_SPEEDS.length - 1) simSpeed = SIM_SPEEDS[idx + 1];
      showSimSpeedIndicator();
    }
  }

  if (e.code === "NumpadSubtract" || e.code === "Minus") {
    e.preventDefault();
    if (sim && !sim.ended && !paused) {
      const idx = SIM_SPEEDS.indexOf(simSpeed);
      if (idx > 0) simSpeed = SIM_SPEEDS[idx - 1];
      showSimSpeedIndicator();
    }
  }

  // Prevent scroll
  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "KeyW", "KeyA", "KeyS", "KeyD"].includes(
      e.code,
    )
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
    zoomLevel = Math.min(5.0, zoomLevel * (1 + zoomSpeed));
  } else {
    zoomLevel = Math.max(0.1, zoomLevel / (1 + zoomSpeed));
  }

  // Show zoom indicator
  const indicator = document.getElementById("zoom-indicator");
  indicator.textContent = buildZoomText();
  indicator.classList.add("show");
  zoomIndicatorTimer = 1.5;
}, { passive: false });

function buildZoomText() {
  let text = "ZOOM " + zoomLevel.toFixed(1) + "x";
  if (simSpeed > 1) text += "  ·  " + simSpeed + "x SPEED";
  return text;
}

function showSimSpeedIndicator() {
  const indicator = document.getElementById("zoom-indicator");
  indicator.textContent = buildZoomText();
  indicator.classList.add("show");
  zoomIndicatorTimer = 1.5;

  const speedEl = document.getElementById("sim-speed-indicator");
  if (simSpeed > 1) {
    speedEl.textContent = "\u25BA\u25BA " + simSpeed + "x";
    speedEl.style.display = "block";
  } else {
    speedEl.style.display = "none";
  }
}
