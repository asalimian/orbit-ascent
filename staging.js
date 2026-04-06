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

  // Compute totals
  let totalMass = CAPSULE_MASS;
  stages.forEach((s) => totalMass += s.totalMass);

  // Compute total delta-v (from top stage to bottom)
  let dv = 0;
  let payloadAbove = CAPSULE_MASS;
  for (let i = stages.length - 1; i >= 0; i--) {
    const s = stages[i];
    // mass above this stage + this stage full
    let stagesAboveMass = payloadAbove;
    for (let j = i + 1; j < stages.length; j++) {
      stagesAboveMass += stages[j].totalMass;
    }
    // wait - stages fire bottom first (index 0 first)
    // Actually: stage 0 = bottom = fires first
    // So for stage i, payload = capsule + all stages above i
    let mAbove = CAPSULE_MASS;
    for (let j = i + 1; j < stages.length; j++) mAbove += stages[j].totalMass;
    const m0 = mAbove + s.totalMass; // wet
    const m1 = mAbove + s.dryMass; // dry
    dv += EXHAUST_VEL * Math.log(m0 / m1);
    payloadAbove = CAPSULE_MASS;
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

  prevCtx.save();
  prevCtx.translate(W / 2, H / 2 + totalH / 2);
  drawRocketStack(prevCtx, stages, s, { currentStage: 0, showLabel: true });
  prevCtx.restore();
}

// ── Unified rocket stack renderer ──
// Draws the rocket centered at ctx origin, capsule up (negative Y).
// pxPerMeter: world-to-pixel scale.
// opts: { currentStage, ghostAlpha, fuelFractions, gearAnimation,
//         throttle, flightState, time, chuteState, showLabel }
// chuteState: 'none' | 'inflated' | 'squidding' | 'collapsed'
function drawRocketStack(ctx, stagesArr, pxPerMeter, opts = {}) {
  const {
    currentStage  = 0,
    ghostAlpha    = 1,
    fuelFractions = null,
    gearAnimation = 1,
    throttle      = 0,
    flightState   = "staging",
    time          = 0,
    chuteState    = "none",
    showLabel     = false,
  } = opts;

  const s = pxPerMeter;
  const engH = 8 * s;

  // Compute per-stage heights and bottom Y positions (scanY starts at 0 = nozzle base)
  const stageData = [];
  let scanY = 0;
  for (let i = currentStage; i < stagesArr.length; i++) {
    const tank = TANK_SIZES[stagesArr[i].tankSize];
    const tankH = tank.height * 0.3 * s;
    const tankW = tank.width * s;
    stageData.push({ baseY: scanY, tankH, tankW, engH });
    scanY -= tankH + engH;
  }
  const capsuleBaseY = scanY;

  ctx.globalAlpha = ghostAlpha;

  // Capsule width comes from the top stage
  const topTank = TANK_SIZES[stagesArr[stagesArr.length - 1].tankSize];
  const capW = topTank.width * s;
  const capH = 15 * s;

  // ── Draw top-down so fairings occlude nozzles above ──

  // Capsule
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-capW / 2, capsuleBaseY);
  ctx.lineTo(-capW / 3, capsuleBaseY - capH);
  ctx.lineTo( capW / 3, capsuleBaseY - capH);
  ctx.lineTo( capW / 2, capsuleBaseY);
  ctx.closePath();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, capsuleBaseY - capH * 0.63, 2.5 * s, 0, Math.PI * 2);
  ctx.stroke();

  // Parachute
  if (chuteState !== "none") {
    const lineBase = capsuleBaseY - capH;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;

    if (chuteState === "collapsed") {
      // Flat bundle sitting on top of capsule — just a small horizontal bar and folded lines
      const bundleW = capW * 0.4;
      const bundleY = capsuleBaseY - capH - 3 * s;
      ctx.beginPath();
      ctx.moveTo(-bundleW / 2, bundleY);
      ctx.lineTo( bundleW / 2, bundleY);
      ctx.stroke();
      // Crumpled lines suggesting packed fabric
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.moveTo(-capW / 4, lineBase); ctx.lineTo(-bundleW / 3, bundleY);
      ctx.moveTo( capW / 4, lineBase); ctx.lineTo( bundleW / 3, bundleY);
      ctx.moveTo(0, lineBase);          ctx.lineTo(0, bundleY);
      ctx.stroke();

    } else if (chuteState === "inflated") {
      // Full dome — wide, round, with sway and internal ribs
      const chuteW = 30 * s;
      const chuteH = 20 * s;
      const chuteTop = capsuleBaseY - capH - chuteH - 12 * s;
      const sway = Math.sin(time * 2) * 1.5 * s;

      // Suspension lines
      ctx.beginPath();
      ctx.moveTo(-capW / 4, lineBase); ctx.lineTo(-chuteW / 2, chuteTop + chuteH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo( capW / 4, lineBase); ctx.lineTo( chuteW / 2, chuteTop + chuteH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, lineBase); ctx.lineTo(0, chuteTop + chuteH);
      ctx.stroke();

      // Canopy dome
      ctx.beginPath();
      ctx.moveTo(-chuteW / 2, chuteTop + chuteH);
      ctx.quadraticCurveTo(-chuteW / 2 + sway, chuteTop - chuteH * 0.2, sway, chuteTop);
      ctx.quadraticCurveTo( chuteW / 2 + sway, chuteTop - chuteH * 0.2, chuteW / 2, chuteTop + chuteH);
      ctx.stroke();

      // Ribs
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      for (let i = 1; i < 4; i++) {
        const t = i / 4;
        const sx = -chuteW / 2 + chuteW * t;
        ctx.beginPath();
        ctx.moveTo(sx, chuteTop + chuteH);
        ctx.quadraticCurveTo(sx + sway * (1 - t), chuteTop + chuteH * 0.2, sx + sway * 0.5, chuteTop + chuteH * 0.6);
        ctx.stroke();
      }

    } else if (chuteState === "squidding") {
      // Thin streaming streamer — narrow, tall, flapping tentacles
      const streamW = 4 * s;
      const streamH = 28 * s;
      const streamTop = capsuleBaseY - capH - streamH - 6 * s;
      const flap = Math.sin(time * 8) * 2 * s;

      // Single line up to streamer
      ctx.beginPath();
      ctx.moveTo(0, lineBase);
      ctx.lineTo(0, streamTop + streamH);
      ctx.stroke();

      // Narrow streamer body
      ctx.beginPath();
      ctx.moveTo(-streamW / 2, streamTop + streamH);
      ctx.lineTo(-streamW / 2 + flap, streamTop);
      ctx.lineTo( streamW / 2 + flap, streamTop);
      ctx.lineTo( streamW / 2, streamTop + streamH);
      ctx.stroke();

      // Flapping tentacle lines trailing off the bottom
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      for (let i = 0; i < 3; i++) {
        const tx = (i - 1) * streamW * 0.6;
        const tflap = Math.sin(time * 8 + i * 1.2) * 3 * s;
        ctx.beginPath();
        ctx.moveTo(tx, streamTop + streamH);
        ctx.quadraticCurveTo(tx + tflap, streamTop + streamH * 1.3, tx + tflap * 2, streamTop + streamH * 1.6);
        ctx.stroke();
      }
    }
  }

  // Stages top-down
  for (let i = stagesArr.length - 1; i >= currentStage; i--) {
    const stage = stagesArr[i];
    const tank = TANK_SIZES[stage.tankSize];
    const idx = i - currentStage;
    const { baseY: drawY, tankH, tankW } = stageData[idx];
    const isActive = i === currentStage;

    // Interstage fairing
    if (i + 1 < stagesArr.length) {
      const nextTank = TANK_SIZES[stagesArr[i + 1].tankSize];
      const nextTankW = nextTank.width * s;
      const topOfStage = drawY - tankH - engH;
      ctx.beginPath();
      ctx.moveTo(-tankW / 2, topOfStage);
      ctx.lineTo(-nextTankW / 2, topOfStage - engH);
      ctx.lineTo( nextTankW / 2, topOfStage - engH);
      ctx.lineTo( tankW / 2, topOfStage);
      ctx.closePath();
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // Tank
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(-tankW / 2, drawY - tankH - engH, tankW, tankH);

    // Tank size label (staging preview)
    if (showLabel) {
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `${Math.max(8, 10 * s)}px "Share Tech Mono"`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(stage.tankSize, 0, drawY - engH - tankH / 2);
    }

    // Fuel level line
    const fuelFrac = fuelFractions ? fuelFractions[i] : (stage.fuel != null ? stage.fuel / stage.maxFuel : 1);
    if (fuelFrac > 0 && fuelFrac < 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.setLineDash([3, 3]);
      const fuelY = drawY - engH - tankH * fuelFrac;
      ctx.beginPath();
      ctx.moveTo(-tankW / 2 + 1, fuelY);
      ctx.lineTo( tankW / 2 - 1, fuelY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Decoupler ring
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(-tankW / 2 - 3, drawY - tankH - engH - 2, tankW + 6, 3);

    // Engines
    const engW = 4 * s;
    const totalEngW = stage.engines * (engW + 2) - 2;
    let ex = -totalEngW / 2;
    for (let e = 0; e < stage.engines; e++) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ex,          drawY - engH);
      ctx.lineTo(ex - 2,      drawY);
      ctx.lineTo(ex + engW + 2, drawY);
      ctx.lineTo(ex + engW,   drawY - engH);
      ctx.closePath();
      ctx.stroke();

      // Engine flame
      if (isActive && throttle > 0 && stage.fuel > 0 && flightState !== "prelaunch") {
        const glowLen = (15 + Math.random() * 15) * throttle * s;
        ctx.strokeStyle = `rgba(255,255,255,${0.5 + throttle * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ex - 2,        drawY);
        ctx.lineTo(ex + engW / 2, drawY + glowLen);
        ctx.lineTo(ex + engW + 2, drawY);
        ctx.stroke();
      }

      ex += engW + 2;
    }

    // Landing gear (non-bottom stages have gear retracted/hidden in preview)
    if (stage.hasLandingGear && i === currentStage) {
      const ga = gearAnimation;
      const legSpread  = tankW / 2 + 8 * s * ga;
      const legDrop    = (engH * 0.3 + 20 * s) * (ga - 1);
      // Anchor gear near the bottom of the tank (tank bottom is at drawY - engH).
      const legAttachY   = -engH - 2 * s;
      const strutAttachY = legAttachY + 8 * s;
      const footPadW   = 3 * s;

      ctx.lineWidth = 1;
      for (const side of [-1, 1]) {
        ctx.strokeStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(side * tankW / 2, drawY + legAttachY);
        ctx.lineTo(side * legSpread, drawY + legDrop);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(side * legSpread - footPadW / 2, drawY + legDrop);
        ctx.lineTo(side * legSpread + footPadW / 2, drawY + legDrop);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.beginPath();
        ctx.moveTo(side * tankW / 2, drawY + strutAttachY);
        ctx.lineTo(side * legSpread, drawY + legDrop);
        ctx.stroke();
      }
    }
  }

  ctx.globalAlpha = 1;
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

// Init with a default first stage
addStage();
