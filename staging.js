// ═══════════════════════════════════════════════
// STAGING STATE
// ═══════════════════════════════════════════════
let stageConfig = { engines: 1, tankSize: "S", hasLandingGear: false };
let stages = []; // array of { engines, tankSize, fuel, dryMass, totalMass }

function adjustConfig(field, delta) {
  if (field === "engines") {
    stageConfig.engines = Math.max(1, Math.min(5, stageConfig.engines + delta));
    document.getElementById("cfg-engines").textContent = stageConfig.engines;
  }
  updatePreview();
}

function selectTank(size) {
  stageConfig.tankSize = size;
  document.querySelectorAll(".tank-option").forEach((b) =>
    b.classList.toggle("active", b.dataset.size === size)
  );
  updatePreview();
}

function toggleGearConfig() {
  stageConfig.hasLandingGear = !stageConfig.hasLandingGear;
  const btn = document.getElementById("cfg-gear");
  btn.textContent = stageConfig.hasLandingGear ? "ON" : "OFF";
  btn.classList.toggle("active", stageConfig.hasLandingGear);
  updatePreview();
}

function addStage() {
  const tank = TANK_SIZES[stageConfig.tankSize];
  const eng = stageConfig.engines;
  const hasGear = stageConfig.hasLandingGear;
  const gearMass = hasGear ? LANDING_GEAR_MASS : 0;
  const s = {
    engines: eng,
    tankSize: stageConfig.tankSize,
    fuel: tank.fuel,
    maxFuel: tank.fuel,
    dryMass: tank.dryMass + eng * ENGINE_MASS + gearMass,
    totalMass: tank.fuel + tank.dryMass + eng * ENGINE_MASS + gearMass,
    thrust: eng * ENGINE_THRUST,
    hasLandingGear: hasGear,
  };
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
    div.innerHTML = `
      <span class="drag-handle">⠿</span>
      <span class="stage-num">${i + 1}</span>
      <div class="stage-info">
        <span class="stat">Engines:</span> <span class="val">${s.engines}</span> &nbsp;
        <span class="stat">Tank:</span> <span class="val">${s.tankSize}</span><br>
        <span class="stat">Fuel:</span> <span class="val">${s.fuel} kg</span> &nbsp;
        <span class="stat">Mass:</span> <span class="val">${s.totalMass} kg</span>${
      s.hasLandingGear
        ? ' &nbsp;<span class="stat">Gear:</span> <span class="val">✓</span>'
        : ""
    }
      </div>
      <button class="remove-btn" onclick="removeStage(${i})">✕</button>
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

  // All stages + capsule preview (proposed stage shown ghosted below)
  const proposed = {
    engines: stageConfig.engines,
    tankSize: stageConfig.tankSize,
    hasLandingGear: stageConfig.hasLandingGear,
    fuel: 1, maxFuel: 1,
  };
  const allStages = [proposed, ...stages]; // proposed at index 0 (bottom)

  // Choose scale so the full stack fills the canvas with padding
  // Units: pre-scale pixel units (multiply by s to get screen pixels)
  // Renderer: tankH = tank.height * 0.3 * s, engH = 8 * s, capsule = 15 * s
  let stackH = 15; // capsule
  allStages.forEach((st) => {
    const t = TANK_SIZES[st.tankSize];
    stackH += t.height * 0.3 + 8;
  });
  const s = (H * 0.50) / stackH;

  // Centre the stack: total pixel height at final scale
  const totalH = stackH * s;

  prevCtx.save();
  prevCtx.translate(W / 2, H / 2 + totalH / 2);

  // Draw full stack (proposed at index 0 = bottom) ghosted, then overdraw existing stages solid.
  // The solid redraw must be shifted up by the proposed stage's height so its capsule
  // aligns with the ghost capsule (drawRocketStack places currentStage's nozzle at y=0).
  drawRocketStack(prevCtx, allStages, s, { currentStage: 0, ghostAlpha: 0.3, showLabel: true });
  if (stages.length > 0) {
    const proposedTank = TANK_SIZES[proposed.tankSize];
    const proposedStageH = (proposedTank.height * 0.3 + 8) * s;
    prevCtx.save();
    prevCtx.translate(0, -proposedStageH);
    drawRocketStack(prevCtx, allStages, s, { currentStage: 1, showLabel: true });
    prevCtx.restore();
  }

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

    // Landing gear
    if (stage.hasLandingGear) {
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

// Init preview
updatePreview();
