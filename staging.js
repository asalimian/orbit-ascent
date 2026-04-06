// ═══════════════════════════════════════════════
// STAGING STATE
// ═══════════════════════════════════════════════
let stages = []; // array of { engines, tankSize, fuel, dryMass, totalMass }

function recomputeStage(s) {
  const tank = TANK_SIZES[s.tankSize];
  const gearMass = s.hasLandingGear ? LANDING_GEAR_MASS : 0;
  s.fuel = tank.fuel;
  s.maxFuel = tank.fuel;
  s.dryMass = tank.dryMass + s.engines * ENGINE_MASS + gearMass;
  s.totalMass = tank.fuel + s.dryMass;
  s.thrust = s.engines * ENGINE_THRUST;
}

function adjustStageEngines(i, delta) {
  const s = stages[i];
  s.engines = Math.max(1, Math.min(5, s.engines + delta));
  recomputeStage(s);
  renderStageList();
  updatePreview();
}

function setStageTank(i, size) {
  stages[i].tankSize = size;
  recomputeStage(stages[i]);
  renderStageList();
  updatePreview();
}

function setStageGear(i, on) {
  stages[i].hasLandingGear = on;
  recomputeStage(stages[i]);
  renderStageList();
  updatePreview();
}

function addStage() {
  const s = {
    engines: 1,
    tankSize: "S",
    hasLandingGear: false,
  };
  recomputeStage(s);
  stages.unshift(s);
  renderStageList();
  updatePreview();
}

function removeStage(i) {
  stages.splice(i, 1);
  renderStageList();
  updatePreview();
}

let dragFromIndex = null;

function renderStageList() {
  const el = document.getElementById("stage-list");
  el.innerHTML = "";
  for (let ri = stages.length - 1; ri >= 0; ri--) {
    const i = ri;
    const s = stages[i];
    const div = document.createElement("div");
    div.className = "stage-item";
    div.draggable = true;
    div.dataset.index = i;
    const tankBtns = ["S", "M", "L", "XL"].map((sz) =>
      `<button class="tank-option${s.tankSize === sz ? " active" : ""}" onclick="setStageTank(${i}, '${sz}')">${sz}</button>`
    ).join("");
    div.innerHTML = `
      <div class="stage-header">
        <span class="drag-handle">⠿</span>
        <span class="stage-num">${i + 1}</span>
        <button class="remove-btn" onclick="removeStage(${i})">✕</button>
      </div>
      <div class="stage-info">
        <div class="config-row">
          <label>Fuel Tank</label>
          <div class="tank-options">${tankBtns}</div>
        </div>
        <div class="config-row">
          <label>Engines</label>
          <div class="controls">
            <button class="btn-sm" onclick="adjustStageEngines(${i}, -1)">−</button>
            <span>${s.engines}</span>
            <button class="btn-sm" onclick="adjustStageEngines(${i}, 1)">+</button>
          </div>
        </div>
        <div class="config-row">
          <label>Landing Gear</label>
          <div class="tank-options">
            <button class="tank-option${!s.hasLandingGear ? " active" : ""}" onclick="setStageGear(${i}, false)">OFF</button>
            <button class="tank-option${s.hasLandingGear ? " active" : ""}" onclick="setStageGear(${i}, true)">ON</button>
          </div>
        </div>
        <div class="stage-stats">
          <span class="stat">Fuel:</span> <span class="val">${s.fuel} kg</span> &nbsp;
          <span class="stat">Mass:</span> <span class="val">${s.totalMass} kg</span>
        </div>
      </div>
    `;
    div.addEventListener("dragstart", (e) => {
      dragFromIndex = i;
      div.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    div.addEventListener("dragend", () => {
      div.classList.remove("dragging");
      dragFromIndex = null;
      el.querySelectorAll(".stage-item").forEach((d) =>
        d.classList.remove("drag-over")
      );
    });
    div.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.querySelectorAll(".stage-item").forEach((d) =>
        d.classList.remove("drag-over")
      );
      if (dragFromIndex !== null && dragFromIndex !== i) {
        div.classList.add("drag-over");
      }
    });
    div.addEventListener("dragleave", () => {
      div.classList.remove("drag-over");
    });
    div.addEventListener("drop", (e) => {
      e.preventDefault();
      if (dragFromIndex !== null && dragFromIndex !== i) {
        const moved = stages.splice(dragFromIndex, 1)[0];
        stages.splice(i, 0, moved);
        renderStageList();
        updatePreview();
      }
    });
    el.appendChild(div);
  }

  // Compute totals and per-stage stats
  let totalMass = CAPSULE_MASS;
  stages.forEach((s) => totalMass += s.totalMass);

  let dv = 0;
  // Per-stage: payload, Δv, T/W
  const stageStats = [];
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    let mAbove = CAPSULE_MASS;
    for (let j = i + 1; j < stages.length; j++) mAbove += stages[j].totalMass;
    const m0 = mAbove + s.totalMass; // wet mass at ignition
    const m1 = mAbove + s.dryMass;  // dry mass at burnout
    const stageDv = EXHAUST_VEL * Math.log(m0 / m1);
    const tw = s.thrust / (m0 * SURFACE_G);
    dv += stageDv;
    stageStats[i] = { payload: mAbove, dv: stageDv, tw };
  }

  // Inject per-stage stats into already-rendered stage cards
  for (let i = 0; i < stages.length; i++) {
    const card = el.querySelector(`.stage-item[data-index="${i}"] .stage-stats`);
    if (!card) continue;
    const { payload, dv: sdv, tw } = stageStats[i];
    const dryMass = stages[i].totalMass+payload;
    card.innerHTML = `
      <span class="stat">Fuel:</span> <span class="val">${stages[i].fuel} kg</span>      
      <span class="stat">Dry Mass:</span> <span class="val">${dryMass.toLocaleString()} kg</span>
      <span class="stat">Δv:</span> <span class="val">${Math.round(sdv).toLocaleString()} m/s</span>
      <span class="stat">T/W:</span> <span class="val">${tw.toFixed(2)}</span>
    `;
  }

  document.getElementById("total-mass").textContent =
    totalMass.toLocaleString() + " kg";
  document.getElementById("total-dv").textContent =
    Math.round(dv).toLocaleString() + " m/s";
  document.getElementById("total-stages").textContent = stages.length;
}

// ── Staging preview canvas ──
const prevCanvas = document.getElementById("staging-preview");
const prevCtx = prevCanvas.getContext("2d");

function updatePreview() {
  const W = prevCanvas.width, H = prevCanvas.height;
  prevCtx.clearRect(0, 0, W, H);

  // Draw grid
  prevCtx.strokeStyle = "rgba(255,255,255,0.08)";
  prevCtx.lineWidth = 1;
  for (let x = 0; x < W; x += 20) {
    prevCtx.beginPath();
    prevCtx.moveTo(x, 0);
    prevCtx.lineTo(x, H);
    prevCtx.stroke();
  }
  for (let y = 0; y < H; y += 20) {
    prevCtx.beginPath();
    prevCtx.moveTo(0, y);
    prevCtx.lineTo(W, y);
    prevCtx.stroke();
  }

  if (stages.length === 0) return;

  let stackH = 15; // capsule
  stages.forEach((st) => {
    const t = TANK_SIZES[st.tankSize];
    stackH += t.height * 0.3 + 8;
  });
  const s = (H * 0.50) / stackH;
  const totalH = stackH * s;

  // drawSpacecraft origin = capsule nose. Place nose at top of the stack region.
  prevCtx.save();
  prevCtx.translate(W / 2, (H-totalH)/2);
  drawSpacecraft(prevCtx, stages, s, { currentStage: 0, showLabel: true });
  prevCtx.restore();
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Init with a default first stage — deferred until all scripts are loaded
// so that drawSpacecraft (defined in bodies.js) is available for the preview.
window.addEventListener("load", () => addStage());
