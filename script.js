// ═══════════════════════════════════════════════
// CONSTANTS & PHYSICS
// ═══════════════════════════════════════════════
const PLANET_RADIUS = 6000; 
const G = 6.674e-11;
const SURFACE_G = 9.81; // m/s²
const PLANET_MASS = SURFACE_G * PLANET_RADIUS * PLANET_RADIUS / G; // kg - tuned for Kerbin-like
const MU = G * PLANET_MASS;

const ATMOSPHERE_HEIGHT = 1000; // 70 km
const ORBIT_TARGET = 80000; // 80 km target orbit

// Engine & tank parameters
const ENGINE_THRUST = 200000; // 200 kN per engine
const ENGINE_MASS = 500; // kg per engine
const ENGINE_ISP = 320; // seconds (specific impulse)
const EXHAUST_VEL = ENGINE_ISP * SURFACE_G; // effective exhaust velocity

const TANK_SIZES = {
  S: { fuel: 2000, dryMass: 200, label: "Small", height: 30, width: 16 },
  M: { fuel: 5000, dryMass: 400, label: "Medium", height: 50, width: 20 },
  L: { fuel: 12000, dryMass: 800, label: "Large", height: 75, width: 24 },
  XL: { fuel: 25000, dryMass: 1400, label: "Extra-L", height: 100, width: 28 },
};

const CAPSULE_MASS = 800;
const CAPSULE_HEIGHT = 25;
const PARACHUTE_CD = 1.5; // drag coefficient for parachute
const PARACHUTE_AREA = 250; // m² - sized to give ~6 m/s terminal velocity at sea level
// Terminal vel = sqrt(2*m*g / (rho*Cd*A)) = sqrt(2*800*9.81 / (1.2*1.5*250)) ≈ 5.9 m/s
const LANDING_SPEED_LIMIT = 10; // m/s - max survivable impact speed

// ═══════════════════════════════════════════════
// STAGING STATE
// ═══════════════════════════════════════════════
let stageConfig = { engines: 1, tankSize: "S" };
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

function addStage() {
  const tank = TANK_SIZES[stageConfig.tankSize];
  const eng = stageConfig.engines;
  const s = {
    engines: eng,
    tankSize: stageConfig.tankSize,
    fuel: tank.fuel,
    maxFuel: tank.fuel,
    dryMass: tank.dryMass + eng * ENGINE_MASS,
    totalMass: tank.fuel + tank.dryMass + eng * ENGINE_MASS,
    thrust: eng * ENGINE_THRUST,
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
  for (let ri = stages.length - 1; ri >= 0; ri--) { const i = ri; const s = stages[i];
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
        <span class="stat">Mass:</span> <span class="val">${s.totalMass} kg</span>
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
      el.querySelectorAll(".stage-item").forEach(d => d.classList.remove("drag-over"));
    });
    div.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.querySelectorAll(".stage-item").forEach(d => d.classList.remove("drag-over"));
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
  prevCtx.strokeStyle = "rgba(42,45,68,0.3)";
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

  // All stages + capsule preview (proposed stage shown ghosted)
  const allStages = [...stages];
  const proposed = {
    engines: stageConfig.engines,
    tankSize: stageConfig.tankSize,
    proposed: true,
  };

  // Calculate total height
  let totalH = CAPSULE_HEIGHT;
  allStages.forEach((s) =>
    totalH += TANK_SIZES[s.tankSize].height + 15 + s.engines * 3
  );
  const proposedH = TANK_SIZES[proposed.tankSize].height + 15 +
    proposed.engines * 3;
  totalH += proposedH;

  let y = H / 2 + totalH / 2;

  // Draw proposed (ghost)
  drawRocketStage(prevCtx, W / 2, y, proposed, 0.3);
  y -= TANK_SIZES[proposed.tankSize].height + 15 + proposed.engines * 3;

  // Draw existing stages bottom to top
  allStages.forEach((s, i) => {
    drawRocketStage(prevCtx, W / 2, y, s, 1.0);
    y -= TANK_SIZES[s.tankSize].height + 15 + s.engines * 3;
  });

  // Draw capsule
  drawCapsule(prevCtx, W / 2, y);
}

function drawCapsule(ctx, cx, y) {
  ctx.fillStyle = "#aab4d0";
  ctx.beginPath();
  ctx.moveTo(cx - 14, y);
  ctx.lineTo(cx - 8, y - CAPSULE_HEIGHT);
  ctx.lineTo(cx + 8, y - CAPSULE_HEIGHT);
  ctx.lineTo(cx + 14, y);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#6b7094";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Window
  ctx.fillStyle = "#00e5ff";
  ctx.beginPath();
  ctx.arc(cx, y - CAPSULE_HEIGHT + 8, 4, 0, Math.PI * 2);
  ctx.fill();
}

function drawRocketStage(ctx, cx, baseY, stage, alpha) {
  ctx.globalAlpha = alpha;
  const tank = TANK_SIZES[stage.tankSize];
  const tankH = tank.height;
  const tankW = tank.width * 1.5;
  const engW = 6;

  // Fuel tank
  ctx.fillStyle = "#3a4066";
  const tankTop = baseY - tankH - 12;
  roundRect(ctx, cx - tankW / 2, tankTop, tankW, tankH, 4);
  ctx.fill();
  ctx.strokeStyle = "#5a5f88";
  ctx.lineWidth = 1;
  roundRect(ctx, cx - tankW / 2, tankTop, tankW, tankH, 4);
  ctx.stroke();

  // Fuel fill indicator
  ctx.fillStyle = "rgba(255, 170, 0, 0.4)";
  const fillH = tankH * 0.85;
  roundRect(
    ctx,
    cx - tankW / 2 + 3,
    tankTop + tankH - fillH - 2,
    tankW - 6,
    fillH,
    2,
  );
  ctx.fill();

  // Tank label
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.font = '10px "Share Tech Mono"';
  ctx.textAlign = "center";
  ctx.fillText(stage.tankSize, cx, tankTop + tankH / 2 + 4);

  // Engines
  const totalEngW = stage.engines * (engW + 4) - 4;
  let ex = cx - totalEngW / 2;
  for (let e = 0; e < stage.engines; e++) {
    ctx.fillStyle = "#6b7094";
    ctx.beginPath();
    ctx.moveTo(ex, baseY - 10);
    ctx.lineTo(ex - 3, baseY);
    ctx.lineTo(ex + engW + 3, baseY);
    ctx.lineTo(ex + engW, baseY - 10);
    ctx.closePath();
    ctx.fill();
    // nozzle
    ctx.fillStyle = "#444a6a";
    ctx.fillRect(ex + 1, baseY - 12, engW - 2, 4);
    ex += engW + 4;
  }

  // Decoupler ring
  ctx.fillStyle = "#5a5f88";
  ctx.fillRect(cx - tankW / 2 - 3, tankTop - 2, tankW + 6, 3);

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

// ═══════════════════════════════════════════════
// FLIGHT SIMULATION
// ═══════════════════════════════════════════════
const flightCanvas = document.getElementById("flight-canvas");
const flightCtx = flightCanvas.getContext("2d");
const minimapCanvas = document.getElementById("minimap-canvas");
const minimapCtx = minimapCanvas.getContext("2d");

let sim = null;
let keys = {};
let animFrame = null;
let viewMode = "spacecraft"; // or 'orbital'
let paused = false;
let zoomLevel = 1.0;
let zoomIndicatorTimer = 0;

// Saved stages for restart
let savedStages = [];

function startFlight() {
  if (stages.length === 0) return;

  document.getElementById("staging-screen").style.display = "none";
  document.getElementById("flight-screen").style.display = "block";

  resizeCanvas();
  paused = false;
  zoomLevel = 1.0;
  document.getElementById("pause-overlay").classList.remove("show");

  // Save stages for restart
  savedStages = stages.map((s) => ({ ...s }));

  // Initialize simulation
  const flightStages = stages.map((s) => ({
    ...s,
    fuel: s.fuel,
    maxFuel: s.fuel,
  }));

  sim = {
    // Position: x, y relative to planet center (planet center at 0,0)
    // Start on surface pointing up
    x: 0,
    y: PLANET_RADIUS,
    vx: 0,
    vy: 0,
    angle: 0, // radians, 0 = pointing up (away from planet)
    angularVel: 0,
    throttle: 0,
    stages: flightStages,
    currentStage: 0,
    // flightState: 'prelaunch' | 'staging' | 'freefall' | 'landing' | 'landed'
    flightState: "prelaunch",
    particles: [],
    debris: [],
    time: 0,
    maxAlt: 0,
    maxVel: 0,
    ended: false,
    orbitAchieved: false,
    crashed: false,
    notification: "",
    notifTimer: 0,
  };

  // Build HUD stages
  renderHUDStages();

  // Start loop
  lastTime = performance.now();
  loop();
}

let lastTime = 0;

function loop() {
  const now = performance.now();
  const rawDt = (now - lastTime) / 1000;
  lastTime = now;
  const dt = Math.min(rawDt, 0.05); // cap dt

  if (!sim.ended && !paused) {
    updateSim(dt);
  }

  // Zoom indicator fade
  if (zoomIndicatorTimer > 0) {
    zoomIndicatorTimer -= rawDt;
    if (zoomIndicatorTimer <= 0) {
      document.getElementById("zoom-indicator").classList.remove("show");
    }
  }

  render();
  animFrame = requestAnimationFrame(loop);
}

function updateSim(dt) {
  const s = sim;

  // Altitude
  const dist = Math.sqrt(s.x * s.x + s.y * s.y);
  const alt = dist - PLANET_RADIUS;

  // Gravity
  const gMag = MU / (dist * dist);
  const gx = -gMag * (s.x / dist);
  const gy = -gMag * (s.y / dist);

  // Atmospheric drag
  let dragFactor = 0;
  if (alt < ATMOSPHERE_HEIGHT && alt >= 0) {
    const airDensity = 1.2 * Math.exp(-alt / 8500);
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    // Use parachute drag if deployed, otherwise normal body drag
    const cd = s.flightState === "landing" ? PARACHUTE_CD : 0.3;
    const area = s.flightState === "landing" ? PARACHUTE_AREA : 4;
    dragFactor = 0.5 * airDensity * speed * cd * area;
  }

  // Thrust
  let thrustX = 0, thrustY = 0;
  let totalMass = CAPSULE_MASS;
  for (let i = s.currentStage; i < s.stages.length; i++) {
    totalMass += s.stages[i].dryMass + s.stages[i].fuel;
  }

  if (
    s.flightState === "staging" && s.currentStage < s.stages.length &&
    s.throttle > 0
  ) {
    const stage = s.stages[s.currentStage];
    if (stage.fuel > 0) {
      const thrustMag = stage.thrust * s.throttle;
      // Thrust direction: along rocket angle, in world coordinates
      // angle = 0 means pointing radially outward from planet
      // We need to compute the "up" direction and then rotate by angle
      const upX = s.x / dist;
      const upY = s.y / dist;
      // Rotate up by sim.angle
      const cosA = Math.cos(s.angle);
      const sinA = Math.sin(s.angle);
      const dirX = upX * cosA - upY * sinA; // wait, need perpendicular
      // Actually: let's define angle=0 as radial out, positive = clockwise
      // thrust direction in world = rotate the "up" vector by angle
      // "up" = (upX, upY), "right" = perpendicular = (upY, -upX)
      const tdx = upX * cosA + upY * sinA;
      const tdy = upY * cosA - upX * sinA;
      thrustX = tdx * thrustMag / totalMass;
      thrustY = tdy * thrustMag / totalMass;

      // Fuel consumption
      const fuelRate = thrustMag / EXHAUST_VEL;
      stage.fuel = Math.max(0, stage.fuel - fuelRate * dt);

      // Particles
      if (Math.random() < 0.6) {
        s.particles.push({
          x: s.x - tdx * 15 + (Math.random() - 0.5) * 4,
          y: s.y - tdy * 15 + (Math.random() - 0.5) * 4,
          vx: -tdx * (80 + Math.random() * 60) + (Math.random() - 0.5) * 20,
          vy: -tdy * (80 + Math.random() * 60) + (Math.random() - 0.5) * 20,
          life: 0.5 + Math.random() * 0.5,
          maxLife: 0.5 + Math.random() * 0.5,
          size: 2 + Math.random() * 3,
        });
      }
    }
  }

  // Drag
  const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  let dragX = 0, dragY = 0;
  if (speed > 0 && dragFactor > 0) {
    dragX = -dragFactor * s.vx / totalMass;
    dragY = -dragFactor * s.vy / totalMass;
  }

  // Integrate
  s.vx += (gx + thrustX + dragX) * dt;
  s.vy += (gy + thrustY + dragY) * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;

  // Rotation
  if (s.flightState === "landing") {
    // Auto-orient: spring angle toward 0 (heat shield down)
    s.angularVel *= 0.9;
    s.angularVel -= s.angle * 2.0 * dt;
    s.angle += s.angularVel * dt;
  } else if (s.flightState === "staging" || s.flightState === "freefall") {
    if (keys["ArrowLeft"]) s.angularVel -= 3.0 * dt;
    if (keys["ArrowRight"]) s.angularVel += 3.0 * dt;
    s.angularVel *= 0.95; // damping
    s.angle += s.angularVel * dt;
  }

  // Throttle (allowed in prelaunch and staging only)
  if (s.flightState === "prelaunch" || s.flightState === "staging") {
    if (keys["ShiftLeft"] || keys["ShiftRight"]) {
      s.throttle = Math.min(1, s.throttle + 1.5 * dt);
    }
    if (keys["ControlLeft"] || keys["ControlRight"]) {
      s.throttle = Math.max(0, s.throttle - 1.5 * dt);
    }
  }

  // Time
  s.time += dt;

  // Update particles
  s.particles.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  });
  s.particles = s.particles.filter((p) => p.life > 0);

  // Debris
  s.debris.forEach((d) => {
    const dd = Math.sqrt(d.x * d.x + d.y * d.y);
    const dg = MU / (dd * dd);
    d.vx -= dg * (d.x / dd) * dt;
    d.vy -= dg * (d.y / dd) * dt;
    d.x += d.vx * dt;
    d.y += d.vy * dt;
    d.rot += d.rotV * dt;
    d.life -= dt;
  });
  s.debris = s.debris.filter((d) => d.life > 0);

  // Stats
  const newAlt = Math.sqrt(s.x * s.x + s.y * s.y) - PLANET_RADIUS;
  s.maxAlt = Math.max(s.maxAlt, newAlt);
  s.maxVel = Math.max(s.maxVel, speed);

  // Ground contact check - never allow going below surface
  if (newAlt <= 0 && s.flightState !== "prelaunch") {
    const nx = s.x / dist;
    const ny = s.y / dist;
    const radialSpeed = s.vx * nx + s.vy * ny; // positive = moving away from planet

    if (radialSpeed < -LANDING_SPEED_LIMIT) {
      // Too fast - crash!
      s.crashed = true;
      endFlight(false);
    } else {
      // Clamp position to surface, preserve tangential velocity
      s.x = nx * PLANET_RADIUS;
      s.y = ny * PLANET_RADIUS;
      const clampedRadial = Math.max(0, radialSpeed);
      const tanVx = s.vx - radialSpeed * nx;
      const tanVy = s.vy - radialSpeed * ny;
      s.vx = clampedRadial * nx + tanVx;
      s.vy = clampedRadial * ny + tanVy;

      if (clampedRadial === 0 && s.flightState !== "landed") {
        s.angularVel = 0;
        if (s.orbitAchieved) {
          showNotification("Touchdown! Mission complete!");
          endFlight(true);
        } else {
          s.flightState = "landed";
          showNotification("Landed — press SPACE to end mission");
        }
      }
    }
  } else if (newAlt <= 0 && s.flightState === "prelaunch") {
    // Pre-launch: clamp to surface, allow radial velocity to build for liftoff
    const nx = s.x / dist;
    const ny = s.y / dist;
    s.x = nx * PLANET_RADIUS;
    s.y = ny * PLANET_RADIUS;
    const radialSpeed = s.vx * nx + s.vy * ny;
    if (radialSpeed < 0) {
      s.vx -= radialSpeed * nx;
      s.vy -= radialSpeed * ny;
    }
  }

  // Orbit check - check apoapsis and periapsis
  const orb = computeOrbitalElements(s.x, s.y, s.vx, s.vy);
  if (
    orb.pe > ATMOSPHERE_HEIGHT && orb.ap > ATMOSPHERE_HEIGHT && !s.orbitAchieved
  ) {
    s.orbitAchieved = true;
    showNotification("Orbit achieved!");
  }

  // Notification timer
  if (s.notifTimer > 0) {
    s.notifTimer -= dt;
    if (s.notifTimer <= 0) {
      document.getElementById("notification").classList.remove("show");
    }
  }

  // Update HUD
  updateHUD();
}

function computeOrbitalElements(x, y, vx, vy) {
  const r = Math.sqrt(x * x + y * y);
  const v = Math.sqrt(vx * vx + vy * vy);
  const E = 0.5 * v * v - MU / r; // specific orbital energy

  if (E >= 0) {
    // Hyperbolic/escape - return very large values
    return { ap: Infinity, pe: r - PLANET_RADIUS, sma: Infinity, ecc: 2 };
  }

  const a = -MU / (2 * E); // semi-major axis

  // Specific angular momentum
  const h = x * vy - y * vx;

  // Eccentricity
  const ecc = Math.sqrt(1 + 2 * E * h * h / (MU * MU));

  const ap = a * (1 + ecc) - PLANET_RADIUS;
  const pe = a * (1 - ecc) - PLANET_RADIUS;

  return { ap, pe, sma: a, ecc, h };
}

function activateNextStage() {
  const s = sim;

  if (s.flightState === "prelaunch") {
    if (s.throttle <= 0) return;
    s.flightState = "staging";
    showNotification("Liftoff!");
    renderHUDStages();
  } else if (s.flightState === "staging") {
    // Jettison current stage
    const dist = Math.sqrt(s.x * s.x + s.y * s.y);
    const upX = s.x / dist;
    const upY = s.y / dist;
    for (let i = 0; i < 3; i++) {
      s.debris.push({
        x: s.x - upX * 10 + (Math.random() - 0.5) * 8,
        y: s.y - upY * 10 + (Math.random() - 0.5) * 8,
        vx: s.vx - upX * (10 + Math.random() * 20) + (Math.random() - 0.5) * 15,
        vy: s.vy - upY * (10 + Math.random() * 20) + (Math.random() - 0.5) * 15,
        rot: 0,
        rotV: (Math.random() - 0.5) * 5,
        life: 4,
        size: 3 + Math.random() * 4,
      });
    }
    s.currentStage++;
    s.throttle = 0;
    if (s.currentStage < s.stages.length) {
      showNotification("Stage " + (s.currentStage + 1) + " ignition");
    } else {
      s.flightState = "freefall";
      showNotification("All stages jettisoned — SPACE for chute");
    }
    renderHUDStages();
  } else if (s.flightState === "freefall") {
    s.flightState = "landing";
    s.throttle = 0;
    showNotification("Parachute deployed!");
    renderHUDStages();
  } else if (s.flightState === "landed") {
    endFlight(false, true);
  }
}

function showNotification(text) {
  sim.notification = text;
  sim.notifTimer = 2.5;
  const el = document.getElementById("notification");
  el.textContent = text;
  el.classList.add("show");
}

function endFlight(success, safeLanding) {
  sim.ended = true;
  const overlay = document.getElementById("end-overlay");
  const title = document.getElementById("end-title");
  const subtitle = document.getElementById("end-subtitle");
  const stats = document.getElementById("end-stats");

  if (success) {
    title.textContent = "Orbit Achieved!";
    title.style.color = "var(--success)";
    subtitle.textContent =
      "Your spacecraft has successfully reached a stable orbit. Mission complete!";
  } else if (safeLanding) {
    title.textContent = "Safe Landing";
    title.style.color = "var(--fuel-color)";
    subtitle.textContent =
      "Your capsule landed safely, but failed to reach orbit. Try adding more stages or fuel!";
  } else {
    title.textContent = "Impact!";
    title.style.color = "var(--danger)";
    subtitle.textContent =
      "Your spacecraft hit the surface too hard. Deploy the parachute earlier or reduce speed before landing!";
  }

  const orb = computeOrbitalElements(sim.x, sim.y, sim.vx, sim.vy);
  stats.innerHTML = `
    <div class="stat-item"><div class="lbl">Max Altitude</div><div class="val">${
    formatDist(sim.maxAlt)
  }</div></div>
    <div class="stat-item"><div class="lbl">Max Velocity</div><div class="val">${
    Math.round(sim.maxVel)
  } m/s</div></div>
    <div class="stat-item"><div class="lbl">Flight Time</div><div class="val">${
    formatTime(sim.time)
  }</div></div>
    <div class="stat-item"><div class="lbl">Stages Used</div><div class="val">${
    sim.currentStage + 1
  } / ${sim.stages.length}</div></div>
  `;

  overlay.classList.add("show");
}

function togglePause() {
  if (sim && sim.ended) return;
  paused = !paused;
  const overlay = document.getElementById("pause-overlay");
  if (paused) {
    overlay.classList.add("show");
  } else {
    overlay.classList.remove("show");
    lastTime = performance.now(); // reset dt so no time jump
  }
}

function restartMission() {
  document.getElementById("pause-overlay").classList.remove("show");
  document.getElementById("end-overlay").classList.remove("show");
  paused = false;
  if (animFrame) cancelAnimationFrame(animFrame);

  // Restore saved stages
  stages = savedStages.map((s) => ({ ...s }));
  startFlight();
}

function returnToStaging() {
  document.getElementById("pause-overlay").classList.remove("show");
  document.getElementById("end-overlay").classList.remove("show");
  paused = false;
  backToStaging();
}

function backToStaging() {
  document.getElementById("flight-screen").style.display = "none";
  document.getElementById("staging-screen").style.display = "flex";
  document.getElementById("end-overlay").classList.remove("show");
  if (animFrame) cancelAnimationFrame(animFrame);
  sim = null;
}

// ── HUD Updates ──
function renderHUDStages() {
  const el = document.getElementById("hud-stages");
  el.innerHTML = "";
  for (let i = sim.stages.length - 1; i >= 0; i--) {
    const s = sim.stages[i];
    const div = document.createElement("div");
    const pct = s.maxFuel > 0 ? (s.fuel / s.maxFuel * 100) : 0;
    let cls = "stage-hud-item";
    if (i === sim.currentStage && sim.flightState === "staging") {
      cls += " active";
    }
    if (i < sim.currentStage) cls += " spent";
    div.className = cls;
    div.innerHTML = `
      <span class="stage-label">${i + 1}</span>
      <div class="fuel-bar-bg"><div class="fuel-bar ${
      pct < 20 ? "low" : ""
    }" style="width:${pct}%"></div></div>
      <span class="fuel-pct">${Math.round(pct)}%</span>
    `;
    el.appendChild(div);
  }

  // Parachute entry
  const chutDiv = document.createElement("div");
  let chuteCls = "stage-hud-item";
  if (sim.flightState === "landing" || sim.flightState === "landed") {
    chuteCls += " active";
  } else if (sim.currentStage < sim.stages.length) chuteCls += "";
  chutDiv.className = chuteCls;
  chutDiv.innerHTML = `
    <span class="stage-label" style="font-size:13px;">☂</span>
    <div class="fuel-bar-bg"><div class="fuel-bar" style="width:${
    (sim.flightState === "landing" || sim.flightState === "landed") ? 100 : 0
  }%;background:var(--success);"></div></div>
    <span class="fuel-pct" style="font-size:9px;">${
    (sim.flightState === "landing" || sim.flightState === "landed")
      ? "OPEN"
      : "RDY"
  }</span>
  `;
  el.appendChild(chutDiv);
}

function updateHUD() {
  const dist = Math.sqrt(sim.x * sim.x + sim.y * sim.y);
  const alt = dist - PLANET_RADIUS;
  const speed = Math.sqrt(sim.vx * sim.vx + sim.vy * sim.vy);

  // Decompose velocity into radial (vertical) and tangential (horizontal)
  const nx = sim.x / dist;
  const ny = sim.y / dist;
  const verticalSpeed = sim.vx * nx + sim.vy * ny; // positive = up
  const tanVx = sim.vx - verticalSpeed * nx;
  const tanVy = sim.vy - verticalSpeed * ny;
  const horizontalSpeed = Math.sqrt(tanVx * tanVx + tanVy * tanVy);

  document.getElementById("hud-alt").textContent = formatDist(alt);
  document.getElementById("hud-vv").textContent =
    (verticalSpeed >= 0 ? "+" : "") + Math.round(verticalSpeed);
  document.getElementById("hud-vh").textContent = Math.round(horizontalSpeed);

  const orb = computeOrbitalElements(sim.x, sim.y, sim.vx, sim.vy);
  document.getElementById("hud-ap").textContent = orb.ap === Infinity
    ? "∞"
    : (orb.ap / 1000).toFixed(1);
  document.getElementById("hud-pe").textContent = orb.pe < -PLANET_RADIUS
    ? "Sub"
    : (orb.pe / 1000).toFixed(1);
  document.getElementById("hud-time").textContent = formatTime(sim.time);

  document.getElementById("throttle-fill").style.height = (sim.throttle * 100) +
    "%";
  document.getElementById("throttle-pct").textContent =
    Math.round(sim.throttle * 100) + "%";

  // Altimeter — logarithmic scale, max at 200 km
  const altMax = 200000;
  const altPct = alt <= 0 ? 0 : Math.min(1, Math.log(1 + alt) / Math.log(1 + altMax));
  const atmoPct = Math.log(1 + ATMOSPHERE_HEIGHT) / Math.log(1 + altMax);
  const orbitPct = Math.log(1 + ORBIT_TARGET) / Math.log(1 + altMax);
  document.getElementById("altimeter-fill").style.height = (altPct * 100) + "%";
  document.getElementById("altimeter-needle").style.bottom = (altPct * 100) + "%";
  document.getElementById("altimeter-atmo").style.bottom = (atmoPct * 100) + "%";
  document.getElementById("altimeter-orbit").style.bottom = (orbitPct * 100) + "%";
  document.getElementById("altimeter-value").textContent = formatDist(alt);

  // Update fuel bars
  sim.stages.forEach((s, i) => {
    const bars = document.querySelectorAll(".stage-hud-item");
    if (bars[i]) {
      const pct = s.maxFuel > 0 ? (s.fuel / s.maxFuel * 100) : 0;
      const bar = bars[i].querySelector(".fuel-bar");
      const pctEl = bars[i].querySelector(".fuel-pct");
      if (bar) {
        bar.style.width = pct + "%";
        bar.className = "fuel-bar" + (pct < 20 ? " low" : "");
      }
      if (pctEl) pctEl.textContent = Math.round(pct) + "%";
      bars[i].className = "stage-hud-item" +
        (i === sim.currentStage ? " active" : "") +
        (i < sim.currentStage ? " spent" : "");
    }
  });

  document.getElementById("view-mode").textContent = viewMode === "spacecraft"
    ? "Spacecraft View"
    : "Orbital View";
}

function formatDist(m) {
  if (Math.abs(m) > 10000) return (m / 1000).toFixed(1) + " km";
  return Math.round(m) + " m";
}

function formatTime(t) {
  const m = Math.floor(t / 60);
  const s = Math.floor(t % 60);
  return m + ":" + (s < 10 ? "0" : "") + s;
}

// ═══════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════
function resizeCanvas() {
  flightCanvas.width = window.innerWidth;
  flightCanvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);

function render() {
  if (viewMode === "spacecraft") {
    renderSpacecraftView();
  } else {
    renderOrbitalView();
  }
  renderMinimap();
}

function renderSpacecraftView() {
  const ctx = flightCtx;
  const W = flightCanvas.width, H = flightCanvas.height;
  ctx.clearRect(0, 0, W, H);

  if (!sim) return;

  const dist = Math.sqrt(sim.x * sim.x + sim.y * sim.y);
  const alt = dist - PLANET_RADIUS;

  // Camera: centered on spacecraft
  const camScale = (alt < 500 ? 3 : alt < 5000 ? 2 : alt < 50000 ? 1 : 0.5) *
    zoomLevel;
  const pxPerMeter = camScale;

  ctx.save();
  ctx.translate(W / 2, H / 2);

  // Planet-relative: "up" from spacecraft perspective
  const upX = sim.x / dist;
  const upY = sim.y / dist;
  const worldAngle = Math.atan2(sim.x, sim.y); // angle of position from y-axis

  // Rotate view so "up" from surface is up on screen
  ctx.rotate(worldAngle);

  // Background: stars
  drawStars(ctx, W, H, sim.time);

  // Sky gradient (atmosphere)
  if (alt < ATMOSPHERE_HEIGHT) {
    const atmosFrac = 1 - alt / ATMOSPHERE_HEIGHT;
    const blueAlpha = atmosFrac * 0.4;
    const grad = ctx.createLinearGradient(0, -H / 2, 0, H / 2);
    grad.addColorStop(0, `rgba(20, 60, 140, ${blueAlpha * 0.3})`);
    grad.addColorStop(0.5, `rgba(40, 100, 200, ${blueAlpha * 0.5})`);
    grad.addColorStop(1, `rgba(60, 130, 220, ${blueAlpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(-W, -H, W * 2, H * 2);
  }

  // Planet surface
  const surfaceY = alt * pxPerMeter;
  ctx.fillStyle = "#1a2a1a";
  ctx.fillRect(-W * 2, surfaceY, W * 4, H * 2);

  // Horizontal offset of rocket from launch site (arc distance along surface)
  const padOffsetX = -worldAngle * PLANET_RADIUS * pxPerMeter;

  // Surface detail — world-fixed ticks, visible around rocket
  ctx.strokeStyle = "#2a3a2a";
  ctx.lineWidth = 1;
  const detailSpacing = 50 * pxPerMeter;
  const screenLeft = -W;
  const screenRight = W;
  const firstTick = Math.floor((screenLeft - padOffsetX) / detailSpacing) * detailSpacing + padOffsetX;
  for (let lx = firstTick; lx <= screenRight; lx += detailSpacing) {
    const tickIdx = Math.round((lx - padOffsetX) / detailSpacing);
    const tickH = (tickIdx % 5 === 0) ? 40 : 20;
    ctx.beginPath();
    ctx.moveTo(lx, surfaceY);
    ctx.lineTo(lx, surfaceY + tickH);
    ctx.stroke();
  }

  // Launch pad — fixed at world origin, scaled with view
  if (alt < 2000) {
    const padY = surfaceY;
    const px = padOffsetX;
    const s = pxPerMeter;
    ctx.fillStyle = "#444";
    ctx.fillRect(px - 10 * s, padY - 1 * s, 20 * s, 1 * s);
    // Tower
    ctx.strokeStyle = "#666";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(px - 12 * s, padY);
    ctx.lineTo(px - 12 * s, padY - 27 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(px - 12 * s, padY - 20 * s);
    ctx.lineTo(px - 7 * s, padY - 13 * s);
    ctx.stroke();
  }

  // Debris
  sim.debris.forEach((d) => {
    const dx = (d.x - sim.x) * pxPerMeter;
    const dy = -(d.y - sim.y) * pxPerMeter;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(d.rot - worldAngle);
    ctx.fillStyle = `rgba(100, 110, 140, ${Math.min(1, d.life / 2)})`;
    ctx.fillRect(-d.size / 2, -d.size / 2, d.size, d.size);
    ctx.restore();
  });

  // Exhaust particles
  sim.particles.forEach((p) => {
    const px = (p.x - sim.x) * pxPerMeter;
    const py = -(p.y - sim.y) * pxPerMeter;
    const a = p.life / p.maxLife;
    const r = p.size * a;
    ctx.fillStyle = `rgba(255, ${Math.round(120 + 80 * a)}, ${
      Math.round(30 * a)
    }, ${a * 0.8})`;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  });

  // Spacecraft — compute center of mass in draw coords for rotation pivot
  let comY = 0, comMass = 0, comScan = 0;
  for (let i = sim.currentStage; i < sim.stages.length; i++) {
    const stage = sim.stages[i];
    const tank = TANK_SIZES[stage.tankSize];
    const tankH = tank.height * 0.3 * pxPerMeter;
    const engH = 8 * pxPerMeter;
    const stageH = tankH + engH + ((i + 1 < sim.stages.length) ? 0 : 3);
    const stageCenter = comScan - stageH / 2;
    const stageMass = stage.dryMass + stage.fuel;
    comY += stageCenter * stageMass;
    comMass += stageMass;
    comScan -= stageH;
  }
  const comCapH = 15 * pxPerMeter;
  const capsuleCenter = comScan - comCapH / 2;
  comY += capsuleCenter * CAPSULE_MASS;
  comMass += CAPSULE_MASS;
  comY /= comMass;

  ctx.save();
  ctx.translate(0, comY);
  ctx.rotate(sim.angle);
  ctx.translate(0, -comY);

  // Draw all remaining stages + capsule (bottom stage first)
  let drawY = 0;
  for (let i = sim.currentStage; i < sim.stages.length; i++) {
    const stage = sim.stages[i];
    const tank = TANK_SIZES[stage.tankSize];
    const tankH = tank.height * 0.3 * pxPerMeter;
    const tankW = tank.width * pxPerMeter;
    const engH = 8 * pxPerMeter;

    // Tank
    ctx.fillStyle = "#3a4066";
    ctx.fillRect(-tankW / 2, drawY - tankH - engH, tankW, tankH);
    ctx.strokeStyle = "#5a5f88";
    ctx.lineWidth = 1;
    ctx.strokeRect(-tankW / 2, drawY - tankH - engH, tankW, tankH);

    // Fuel level
    const fuelPct = stage.fuel / stage.maxFuel;
    ctx.fillStyle = fuelPct < 0.2
      ? "rgba(255,51,85,0.5)"
      : "rgba(255,170,0,0.4)";
    ctx.fillRect(
      -tankW / 2 + 1,
      drawY - tankH - engH + tankH * (1 - fuelPct),
      tankW - 2,
      tankH * fuelPct,
    );

    // Engines
    const engW = 4 * pxPerMeter;
    const totalEngW = stage.engines * (engW + 2) - 2;
    let ex = -totalEngW / 2;
    for (let e = 0; e < stage.engines; e++) {
      ctx.fillStyle = "#6b7094";
      ctx.beginPath();
      ctx.moveTo(ex, drawY - engH);
      ctx.lineTo(ex - 2, drawY);
      ctx.lineTo(ex + engW + 2, drawY);
      ctx.lineTo(ex + engW, drawY - engH);
      ctx.closePath();
      ctx.fill();

      // Active engine glow
      if (i === sim.currentStage && sim.throttle > 0 && stage.fuel > 0) {
        const glowLen = (15 + Math.random() * 15) * sim.throttle * pxPerMeter;
        const grad = ctx.createLinearGradient(
          ex + engW / 2,
          drawY,
          ex + engW / 2,
          drawY + glowLen,
        );
        grad.addColorStop(0, "rgba(255, 200, 50, 0.9)");
        grad.addColorStop(0.3, "rgba(255, 100, 20, 0.6)");
        grad.addColorStop(1, "rgba(255, 50, 0, 0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.moveTo(ex - 2, drawY);
        ctx.lineTo(ex + engW / 2, drawY + glowLen);
        ctx.lineTo(ex + engW + 2, drawY);
        ctx.closePath();
        ctx.fill();
      }

      ex += engW + 2;
    }

    // Interstage fairing — covers next stage's engines
    if (i + 1 < sim.stages.length) {
      const nextTank = TANK_SIZES[sim.stages[i + 1].tankSize];
      const nextTankW = nextTank.width * pxPerMeter;
      const nextEngH = 8 * pxPerMeter;
      const topOfStage = drawY - tankH - engH;
      ctx.fillStyle = "#4a4f72";
      ctx.beginPath();
      ctx.moveTo(-tankW / 2, topOfStage);
      ctx.lineTo(-nextTankW / 2, topOfStage - nextEngH);
      ctx.lineTo(nextTankW / 2, topOfStage - nextEngH);
      ctx.lineTo(tankW / 2, topOfStage);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#5a5f88";
      ctx.lineWidth = 1;
      ctx.stroke();
      drawY -= tankH + engH;
    } else {
      // Fairing between last stage and capsule
      const capW = 10 * pxPerMeter;
      const topOfStage = drawY - tankH - engH;
      ctx.fillStyle = "#4a4f72";
      ctx.beginPath();
      ctx.moveTo(-tankW / 2, topOfStage);
      ctx.lineTo(-capW / 2, topOfStage - engH);
      ctx.lineTo(capW / 2, topOfStage - engH);
      ctx.lineTo(tankW / 2, topOfStage);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#5a5f88";
      ctx.lineWidth = 1;
      ctx.stroke();
      drawY -= tankH + engH;
    }
  }

  // Capsule
  const capW = 10 * pxPerMeter;
  const capH = 15 * pxPerMeter;
  ctx.fillStyle = "#aab4d0";
  ctx.beginPath();
  ctx.moveTo(-capW / 2, drawY);
  ctx.lineTo(-capW / 3, drawY - capH);
  ctx.lineTo(capW / 3, drawY - capH);
  ctx.lineTo(capW / 2, drawY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#6b7094";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Window
  ctx.fillStyle = "#00e5ff";
  ctx.beginPath();
  ctx.arc(0, drawY - capH + 5, 2.5 * pxPerMeter, 0, Math.PI * 2);
  ctx.fill();

  // Parachute
  if (sim.flightState === "landing" || sim.flightState === "landed") {
    const chuteW = 30 * pxPerMeter;
    const chuteH = 20 * pxPerMeter;
    const chuteTop = drawY - capH - chuteH - 12 * pxPerMeter;
    const lineBase = drawY - capH;

    // Suspension lines
    ctx.strokeStyle = "rgba(200, 200, 200, 0.6)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-capW / 4, lineBase);
    ctx.lineTo(-chuteW / 2, chuteTop + chuteH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(capW / 4, lineBase);
    ctx.lineTo(chuteW / 2, chuteTop + chuteH);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(0, lineBase);
    ctx.lineTo(0, chuteTop + chuteH);
    ctx.stroke();

    // Canopy - billowing dome shape
    const sway = Math.sin(sim.time * 2) * 1.5 * pxPerMeter;
    ctx.fillStyle = "rgba(255, 100, 50, 0.85)";
    ctx.beginPath();
    ctx.moveTo(-chuteW / 2, chuteTop + chuteH);
    ctx.quadraticCurveTo(
      -chuteW / 2 + sway,
      chuteTop - chuteH * 0.2,
      0 + sway,
      chuteTop,
    );
    ctx.quadraticCurveTo(
      chuteW / 2 + sway,
      chuteTop - chuteH * 0.2,
      chuteW / 2,
      chuteTop + chuteH,
    );
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(200, 60, 30, 0.8)";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Canopy stripes
    ctx.strokeStyle = "rgba(255, 255, 255, 0.25)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i++) {
      const t = i / 4;
      const sx = -chuteW / 2 + chuteW * t;
      ctx.beginPath();
      ctx.moveTo(sx, chuteTop + chuteH);
      ctx.quadraticCurveTo(
        sx + sway * (1 - t),
        chuteTop + chuteH * 0.2,
        sx + sway * 0.5,
        chuteTop + chuteH * 0.6,
      );
      ctx.stroke();
    }
  }

  ctx.restore(); // un-rotate spacecraft angle
  ctx.restore(); // un-rotate world angle + translate
}

function renderOrbitalView() {
  const ctx = flightCtx;
  const W = flightCanvas.width, H = flightCanvas.height;
  ctx.clearRect(0, 0, W, H);

  if (!sim) return;

  // Draw at a scale where the planet is visible
  const dist = Math.sqrt(sim.x * sim.x + sim.y * sim.y);
  const maxDim = Math.max(dist * 1.5, PLANET_RADIUS * 2.5);
  const scale = Math.min(W, H) * 0.4 / maxDim * zoomLevel;

  ctx.save();
  ctx.translate(W / 2, H / 2);

  // Stars
  drawStars(ctx, W, H, sim.time * 0.1);

  // Planet
  const pr = PLANET_RADIUS * scale;
  const planetGrad = ctx.createRadialGradient(0, 0, pr * 0.7, 0, 0, pr);
  planetGrad.addColorStop(0, "#2a4a2a");
  planetGrad.addColorStop(1, "#1a2a1a");
  ctx.fillStyle = planetGrad;
  ctx.beginPath();
  ctx.arc(0, 0, pr, 0, Math.PI * 2);
  ctx.fill();

  // Atmosphere ring
  ctx.strokeStyle = "rgba(60, 130, 220, 0.3)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, (PLANET_RADIUS + ATMOSPHERE_HEIGHT) * scale, 0, Math.PI * 2);
  ctx.stroke();

  // Target orbit ring
  ctx.strokeStyle = "rgba(0, 229, 255, 0.2)";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(0, 0, (PLANET_RADIUS + ORBIT_TARGET) * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Predicted orbit
  drawOrbitPath(
    ctx,
    sim.x,
    sim.y,
    sim.vx,
    sim.vy,
    scale,
    "rgba(0, 229, 255, 0.5)",
  );

  // Spacecraft position
  const sx = sim.x * scale;
  const sy = -sim.y * scale;

  // Trail
  ctx.fillStyle = "rgba(0, 229, 255, 0.6)";
  ctx.beginPath();
  ctx.arc(sx, sy, 4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(0, 229, 255, 0.2)";
  ctx.beginPath();
  ctx.arc(sx, sy, 8, 0, Math.PI * 2);
  ctx.fill();

  // Debris
  sim.debris.forEach((d) => {
    ctx.fillStyle = "rgba(100,110,140,0.5)";
    ctx.beginPath();
    ctx.arc(d.x * scale, -d.y * scale, 2, 0, Math.PI * 2);
    ctx.fill();
  });

  ctx.restore();
}

function drawOrbitPath(ctx, x, y, vx, vy, scale, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  let ox = x, oy = y, ovx = vx, ovy = vy;
  const steps = 600;
  const dt = 5; // seconds per step

  ctx.moveTo(ox * scale, -oy * scale);

  for (let i = 0; i < steps; i++) {
    const d = Math.sqrt(ox * ox + oy * oy);
    if (d < PLANET_RADIUS * 0.95) break; // crashed
    const gMag = MU / (d * d);
    ovx -= gMag * (ox / d) * dt;
    ovy -= gMag * (oy / d) * dt;
    ox += ovx * dt;
    oy += ovy * dt;
    ctx.lineTo(ox * scale, -oy * scale);
  }
  ctx.stroke();
}

function renderMinimap() {
  const ctx = minimapCtx;
  const W = minimapCanvas.width, H = minimapCanvas.height;
  ctx.clearRect(0, 0, W, H);

  if (!sim) return;

  const dist = Math.sqrt(sim.x * sim.x + sim.y * sim.y);
  const maxDim = Math.max(dist * 1.5, PLANET_RADIUS * 2);
  const scale = W * 0.35 / maxDim;

  ctx.save();
  ctx.translate(W / 2, H / 2);

  // Planet
  const pr = PLANET_RADIUS * scale;
  ctx.fillStyle = "#1a2a1a";
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(pr, 3), 0, Math.PI * 2);
  ctx.fill();

  // Atmosphere
  ctx.strokeStyle = "rgba(60,130,220,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, (PLANET_RADIUS + ATMOSPHERE_HEIGHT) * scale, 0, Math.PI * 2);
  ctx.stroke();

  // Target orbit
  ctx.strokeStyle = "rgba(0,229,255,0.15)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(0, 0, (PLANET_RADIUS + ORBIT_TARGET) * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Orbit prediction
  drawOrbitPath(
    ctx,
    sim.x,
    sim.y,
    sim.vx,
    sim.vy,
    scale,
    "rgba(0,229,255,0.35)",
  );

  // Spacecraft
  const sx = sim.x * scale;
  const sy = -sim.y * scale;
  ctx.fillStyle = "#00e5ff";
  ctx.beginPath();
  ctx.arc(sx, sy, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

let starPositions = null;
function drawStars(ctx, W, H, time) {
  if (!starPositions) {
    starPositions = [];
    for (let i = 0; i < 200; i++) {
      starPositions.push({
        x: (Math.random() - 0.5) * 3000,
        y: (Math.random() - 0.5) * 3000,
        s: Math.random() * 1.5 + 0.5,
        b: Math.random() * 0.5 + 0.5,
      });
    }
  }

  starPositions.forEach((star) => {
    const flicker = star.b + Math.sin(time * 2 + star.x) * 0.1;
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, flicker)})`;
    ctx.beginPath();
    ctx.arc(star.x, star.y, star.s, 0, Math.PI * 2);
    ctx.fill();
  });
}

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
  }

  // Prevent scroll
  if (
    ["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(
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
  indicator.textContent = "ZOOM " + zoomLevel.toFixed(1) + "x";
  indicator.classList.add("show");
  zoomIndicatorTimer = 1.5;
}, { passive: false });
