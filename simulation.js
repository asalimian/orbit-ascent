// ═══════════════════════════════════════════════
// FLIGHT SIMULATION
// ═══════════════════════════════════════════════
const flightCanvas = document.getElementById("flight-canvas");
const flightCtx = flightCanvas.getContext("2d");
const minimapCanvas = document.getElementById("minimap-canvas");
const minimapCtx = minimapCanvas.getContext("2d");
const orientationCanvas = document.getElementById("orientation-canvas");
const orientationCtx = orientationCanvas.getContext("2d");

let sim = null;
let keys = {};
let animFrame = null;
let viewMode = "spacecraft"; // or 'orbital'
let paused = false;
let zoomLevel = 1.0;
let zoomIndicatorTimer = 0;
let simSpeed = 1;
const SIM_SPEEDS = [1, 2, 10];

// Saved stages for restart
let savedStages = [];

function startFlight() {
  if (stages.length === 0) return;

  document.getElementById("staging-screen").style.display = "none";
  document.getElementById("flight-screen").style.display = "block";

  resizeCanvas();
  paused = false;
  zoomLevel = 1.0;
  simSpeed = 1;
  document.getElementById("pause-overlay").classList.remove("show");
  document.getElementById("sim-speed-indicator").style.display = "none";

  // Save stages for restart
  savedStages = stages.map((s) => ({ ...s }));

  // Initialize simulation
  const flightStages = stages.map((s) => ({
    ...s,
    fuel: s.fuel,
    maxFuel: s.fuel,
  }));

  // Place CoM so the nozzle tip sits exactly at grade (PLANET_RADIUS).
  // nozzleOffset_m = distance from CoM to nozzle tip.
  // CoM must be that far above the surface.
  const nozzleOffset_m = spacecraftTotalHeight(flightStages, 0)
    - spacecraftComOffset(flightStages, 0, 1);
  const padY = PLANET_RADIUS + nozzleOffset_m;

  sim = {
    // Position: x, y relative to planet center (planet center at 0,0)
    // CoM starts at padY so the nozzle tip sits exactly at grade.
    x: 0,
    y: padY,
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
    rcsActive: { forward: 0, right: 0, rotate: 0 },
    debris: [],
    jettisoned: [], // spent stages that continue on ballistic trajectories
    satellite: {
      x: SATELLITE_ORBIT_RADIUS,
      y: 0,
      vx: 0,
      vy: -Math.sqrt(MU / SATELLITE_ORBIT_RADIUS), // circular orbit velocity (clockwise)
      alive: true,
      rot: 0,
      rotV: 0,
    },
    time: 0,
    maxAlt: 0,
    maxVel: 0,
    ended: false,
    orbitAchieved: false,
    onMoon: false,
    moonLandAngle: 0, // angle from moon center at landing (moon-relative frame)
    crashed: false,
    gearDeployed: stages[0]?.hasLandingGear === true,
    gearAnimation: stages[0]?.hasLandingGear ? 1 : 0, // 0 = retracted, 1 = deployed (animated)
    notification: "",
    notifTimer: 0,
    achievements: {
      orbitAchieved: false,
      lunarOrbit: false,
      moonLanding: false,
      moonLiftoff: false,
      returnToEarth: false,
      lagrangeL1: false,
      lagrangeL2: false,
      lagrangeL3: false,
      lagrangeL4: false,
      lagrangeL5: false,
    },
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
    const steps = simSpeed;
    const subDt = dt * simSpeed / steps;
    for (let i = 0; i < steps && !sim.ended; i++) updateSim(subDt);
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

  // When landed on the moon, lock position/velocity to the moon surface and skip all physics
  if (s.onMoon && s.flightState === "landed") {
    s.time += dt;
    const moon = getMoonPos(s.time);
    const moonTerrainR = MOON_RADIUS + getMoonTerrainHeight(s.moonLandAngle);
    s.x = moon.x + Math.sin(s.moonLandAngle) * moonTerrainR;
    s.y = moon.y + Math.cos(s.moonLandAngle) * moonTerrainR;
    // Match moon's orbital velocity exactly
    s.vx = -MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL * Math.sin(MOON_ANGULAR_VEL * s.time);
    s.vy =  MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL * Math.cos(MOON_ANGULAR_VEL * s.time);
    updateHUD();
    return;
  }

  // Altitude
  const dist = Math.sqrt(s.x * s.x + s.y * s.y);
  const alt = dist - PLANET_RADIUS;

  // Gravity (planet)
  const gMag = MU / (dist * dist);
  let gx = -gMag * (s.x / dist);
  let gy = -gMag * (s.y / dist);

  // Moon gravity
  const moon = getMoonPos(s.time);
  const mdx = s.x - moon.x;
  const mdy = s.y - moon.y;
  const moonDist = Math.sqrt(mdx * mdx + mdy * mdy);
  const moonGMag = MOON_MU / (moonDist * moonDist);
  gx -= moonGMag * (mdx / moonDist);
  gy -= moonGMag * (mdy / moonDist);

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

      // Particles — spawn at nozzle exit in spacecraft reference frame
      if (Math.random() < 0.6) {
        // Compute CoM offset from nozzle base in rocket-local units
        // (same units as rendering: tank.height*0.3 + engH=8 per stage, capH=15)
        let comOff = 0, comM = 0, scan = 0;
        for (let ci = s.currentStage; ci < s.stages.length; ci++) {
          const ct = TANK_SIZES[s.stages[ci].tankSize];
          const stH = ct.height * 0.3 + 8;
          comOff += (scan - stH / 2) *
            (s.stages[ci].dryMass + s.stages[ci].fuel);
          comM += s.stages[ci].dryMass + s.stages[ci].fuel;
          scan -= stH;
        }
        comOff += (scan - 7.5) * CAPSULE_MASS;
        comM += CAPSULE_MASS;
        comOff /= comM;
        // comOff is negative (CoM is above nozzle base in local coords)

        // Nozzle base is at local (0, 0), CoM at local (0, comOff)
        // In spacecraft frame, nozzle is at (0, -comOff) relative to CoM
        // Transform to world: rotate by angle around rocket's radial axis
        // Rocket axis: up = (upX, upY), right = (upY, -upX)
        // Local Y points along rocket axis (thrust dir), so nozzle is at -comOff along axis
        const nozzleAlongAxis = -comOff; // positive = below CoM = opposite thrust
        const nozzleX = s.x - tdx * nozzleAlongAxis;
        const nozzleY = s.y - tdy * nozzleAlongAxis;

        s.particles.push({
          x: nozzleX + (Math.random() - 0.5) * 2,
          y: nozzleY + (Math.random() - 0.5) * 2,
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
    if (keys["ArrowLeft"] || keys["KeyQ"]) s.angularVel -= 3.0 * dt;
    if (keys["ArrowRight"] || keys["KeyE"]) s.angularVel += 3.0 * dt;
    s.angularVel *= 0.95; // damping
    s.angle += s.angularVel * dt;

  }

  // RCS — translation (WASD) and rotation (←→) particle spawning
  // Both use the same rocket extents so jets are placed correctly.
  if (s.flightState === "staging" || s.flightState === "freefall" || s.flightState === "landing") {
    const wAngle = Math.atan2(s.x, s.y);
    const cosR = Math.cos(s.angle + wAngle);
    const sinR = Math.sin(s.angle + wAngle);
    const axisX = sinR,  axisY = cosR;   // along rocket toward capsule (up)
    const rightX = cosR, rightY = -sinR; // perpendicular right

    // Translation inputs
    const rcsThrustAcc = 2.0; // m/s²
    let transX = 0, transY = 0;
    let rcsForward = 0, rcsRight = 0;
    if (keys["KeyW"]) { transX += axisX;  transY += axisY;  rcsForward =  1; }
    if (keys["KeyS"]) { transX -= axisX;  transY -= axisY;  rcsForward = -1; }
    if (keys["KeyA"]) { transX -= rightX; transY -= rightY; rcsRight   = -1; }
    if (keys["KeyD"]) { transX += rightX; transY += rightY; rcsRight   =  1; }
    s.vx += transX * rcsThrustAcc * dt;
    s.vy += transY * rcsThrustAcc * dt;

    // Rotation input (only in staging/freefall — landing uses auto-orient)
    const rcsDir = (s.flightState !== "landing") &&
      ((keys["ArrowLeft"] || keys["KeyQ"]) ? -1 : (keys["ArrowRight"] || keys["KeyE"]) ? 1 : 0);

    // Store active RCS state for drawSpacecraft to animate in spacecraft frame
    s.rcsActive = { forward: rcsForward, right: rcsRight, rotate: rcsDir || 0 };
  } else {
    s.rcsActive = { forward: 0, right: 0, rotate: 0 };
  }

  // Throttle (allowed in prelaunch and staging only)
  if (s.flightState === "prelaunch" || s.flightState === "staging") {
    if (keys["ShiftLeft"] || keys["ArrowUp"]) {
      s.throttle = Math.min(1, s.throttle + 1.5 * dt);
    }
    if (keys["ArrowDown"] || keys["ControlLeft"]) {
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

  // Jettisoned stages — full physics (gravity + ground collision)
  s.jettisoned.forEach((j) => {
    const jd = Math.sqrt(j.x * j.x + j.y * j.y);
    const jg = MU / (jd * jd);
    j.vx -= jg * (j.x / jd) * dt;
    j.vy -= jg * (j.y / jd) * dt;
    // Moon gravity
    const mp = getMoonPos(s.time);
    const mjx = j.x - mp.x, mjy = j.y - mp.y;
    const mjd = Math.sqrt(mjx * mjx + mjy * mjy);
    if (mjd > MOON_RADIUS) {
      const mg = MOON_MU / (mjd * mjd);
      j.vx -= mg * (mjx / mjd) * dt;
      j.vy -= mg * (mjy / mjd) * dt;
    }
    // Atmospheric drag on jettisoned stages
    if (jd < PLANET_RADIUS + ATMOSPHERE_HEIGHT) {
      const jAlt = jd - PLANET_RADIUS;
      if (jAlt > 0) {
        const jDensity = 1.2 * Math.exp(-jAlt / 8500);
        const jSpeed = Math.sqrt(j.vx * j.vx + j.vy * j.vy);
        if (jSpeed > 0) {
          const jDrag = 0.5 * jDensity * jSpeed * 0.3 * 4;
          j.vx -= (j.vx / jSpeed) * jDrag * dt;
          j.vy -= (j.vy / jSpeed) * jDrag * dt;
        }
      }
    }
    j.x += j.vx * dt;
    j.y += j.vy * dt;
    j.rot += j.rotV * dt;
    j.life -= dt;
    // Ground collision — remove on impact
    if (jd <= PLANET_RADIUS || mjd <= MOON_RADIUS) {
      j.life = 0;
    }
  });
  s.jettisoned = s.jettisoned.filter((j) => j.life > 0);

  // Satellite physics + collision
  const sat = s.satellite;
  if (sat.alive) {
    // Gravity (planet only — moon effect negligible for LEO sat)
    const sd = Math.sqrt(sat.x * sat.x + sat.y * sat.y);
    const sg = MU / (sd * sd);
    sat.vx -= sg * (sat.x / sd) * dt;
    sat.vy -= sg * (sat.y / sd) * dt;

    // Atmospheric drag
    const satAlt = sd - PLANET_RADIUS;
    if (satAlt < ATMOSPHERE_HEIGHT && satAlt >= 0) {
      const airDensity = 1.2 * Math.exp(-satAlt / 8500);
      const satSpeed = Math.sqrt(sat.vx * sat.vx + sat.vy * sat.vy);
      if (satSpeed > 0) {
        const drag = 0.5 * airDensity * satSpeed * 0.3 * 4;
        sat.vx -= (sat.vx / satSpeed) * drag / SATELLITE_MASS * dt;
        sat.vy -= (sat.vy / satSpeed) * drag / SATELLITE_MASS * dt;
      }
    }

    sat.x += sat.vx * dt;
    sat.y += sat.vy * dt;
    sat.rot += sat.rotV * dt;

    // Crash into planet surface
    if (sd <= PLANET_RADIUS) {
      sat.alive = false;
      spawnSatelliteDebris(sat.x, sat.y, sat.vx, sat.vy, 20);
    }

    // Collision with spacecraft
    const cdx = s.x - sat.x, cdy = s.y - sat.y;
    const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
    if (cdist < SATELLITE_COLLISION_RADIUS && cdist > 0) {
      const relVx = s.vx - sat.vx, relVy = s.vy - sat.vy;
      const relSpeed = Math.sqrt(relVx * relVx + relVy * relVy);

      if (relSpeed > SATELLITE_EXPLODE_SPEED) {
        // Too hard — satellite explodes
        sat.alive = false;
        spawnSatelliteDebris(sat.x, sat.y, sat.vx, sat.vy, 30);
        showNotification("Satellite destroyed!");
      } else if (relSpeed > 1) {
        // Elastic-ish collision — exchange momentum along contact normal
        const nx = cdx / cdist, ny = cdy / cdist;
        const relVn = relVx * nx + relVy * ny; // relative speed along normal
        if (relVn < 0) { // only if approaching
          const craftMass = totalMass;
          const impulse = 2 * relVn / (1 / craftMass + 1 / SATELLITE_MASS);
          s.vx -= (impulse / craftMass) * nx;
          s.vy -= (impulse / craftMass) * ny;
          sat.vx += (impulse / SATELLITE_MASS) * nx;
          sat.vy += (impulse / SATELLITE_MASS) * ny;
          sat.rotV += (Math.random() - 0.5) * 0.5; // gentle tumble on nudge
          // Separate to avoid sticking
          const overlap = SATELLITE_COLLISION_RADIUS - cdist;
          s.x += nx * overlap * 0.5;
          s.y += ny * overlap * 0.5;
          sat.x -= nx * overlap * 0.5;
          sat.y -= ny * overlap * 0.5;
        }
      }
    }
  }

  // Stats
  const newAlt = Math.sqrt(s.x * s.x + s.y * s.y) - PLANET_RADIUS;
  s.maxAlt = Math.max(s.maxAlt, newAlt);
  s.maxVel = Math.max(s.maxVel, speed);

  // Ground contact check — compare the lowest point of the rocket (nozzle tip)
  // against the terrain surface, not the CoM.
  // comOffset_m: distance from nose to CoM (meters).
  // totalHeight_m: distance from nose to nozzle tip (meters).
  // nozzleOffset_m: distance from CoM to nozzle tip (= totalHeight_m - comOffset_m).
  const worldAngleNow = 0; // planet rotation not yet implemented
  const terrainH = getPlanetTerrainHeight(worldAngleNow);
  const totalHeight_m = spacecraftTotalHeight(s.stages, s.currentStage);
  const comOffset_m = spacecraftComOffset(s.stages, s.currentStage, 1);
  const nozzleOffset_m = totalHeight_m - comOffset_m; // CoM → nozzle tip
  // Alt of nozzle tip above terrain:
  const nozzleAlt = newAlt - terrainH - nozzleOffset_m;
  if (nozzleAlt <= 0 && s.flightState !== "prelaunch") {
    const nx = s.x / dist;
    const ny = s.y / dist;
    const radialSpeed = s.vx * nx + s.vy * ny; // positive = moving away from planet

    const effectiveSpeedLimit = s.gearDeployed
      ? GEAR_LANDING_SPEED_LIMIT
      : LANDING_SPEED_LIMIT;
    if (radialSpeed < -effectiveSpeedLimit) {
      // Too fast - crash!
      s.crashed = true;
      endFlight(false);
    } else {
      // Clamp CoM so nozzle tip sits exactly on terrain
      const clampR = PLANET_RADIUS + terrainH + nozzleOffset_m;
      s.x = nx * clampR;
      s.y = ny * clampR;
      const clampedRadial = Math.max(0, radialSpeed);
      const tanVx = s.vx - radialSpeed * nx;
      const tanVy = s.vy - radialSpeed * ny;
      s.vx = clampedRadial * nx + tanVx;
      s.vy = clampedRadial * ny + tanVy;

      if (clampedRadial === 0 && s.flightState !== "landed") {
        s.angularVel = 0;
        if (s.achievements.moonLanding) {
          s.achievements.returnToEarth = true;
        }
        const hasFuel = sim.stages.some((s) => s.fuel > 0);
        if (!hasFuel) {
          showNotification("Touchdown!");
          endFlight(true);
        }
      }
    }
  } else if (nozzleAlt <= 0 && s.flightState === "prelaunch") {
    // Pre-launch: clamp nozzle to surface, allow radial velocity to build for liftoff
    const nx = s.x / dist;
    const ny = s.y / dist;
    const clampR = PLANET_RADIUS + terrainH + nozzleOffset_m;
    s.x = nx * clampR;
    s.y = ny * clampR;
    const radialSpeed = s.vx * nx + s.vy * ny;
    if (radialSpeed < 0) {
      s.vx -= radialSpeed * nx;
      s.vy -= radialSpeed * ny;
    }
  }

  // Landing gear foot contact — applies torque when one leg touches before the other.
  // Only active when gear is deployed and craft is near the ground.
  if (s.gearDeployed && s.flightState !== "prelaunch" && nozzleAlt < 30) {
    const bottomStage = s.stages[s.currentStage];
    if (bottomStage && bottomStage.hasLandingGear) {
      // Rocket axes in world space
      const rot = s.angle + Math.atan2(s.x, s.y);
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      // "up" along rocket (nose direction) in world = (sinR, cosR)
      const axisX = sinR, axisY = cosR;
      // "right" perpendicular = (cosR, -sinR)
      const rightX = cosR, rightY = -sinR;

      // Foot positions in world space (pxPerMeter=1 → meters)
      const tankW_m = TANK_SIZES[bottomStage.tankSize].width;
      const legSpread_m = tankW_m / 2 + 8;
      // Feet are at nozzleOffset_m below CoM along rocket axis, ± legSpread_m laterally
      const feetAlongAxis = nozzleOffset_m; // distance from CoM toward engine
      const feet = [
        { // left foot
          wx: s.x - axisX * feetAlongAxis - rightX * legSpread_m,
          wy: s.y - axisY * feetAlongAxis - rightY * legSpread_m,
        },
        { // right foot
          wx: s.x - axisX * feetAlongAxis + rightX * legSpread_m,
          wy: s.y - axisY * feetAlongAxis + rightY * legSpread_m,
        },
      ];

      // Total mass and moment of inertia (rod approximation)
      let totalMassGear = CAPSULE_MASS;
      for (let i = s.currentStage; i < s.stages.length; i++) {
        totalMassGear += s.stages[i].dryMass + s.stages[i].fuel;
      }
      const I = totalMassGear * totalHeight_m * totalHeight_m / 12;

      const RESTITUTION = 0.05; // nearly inelastic
      const FRICTION_MU = 0.6;  // Coulomb friction coefficient
      for (const foot of feet) {
        const footDist = Math.sqrt(foot.wx * foot.wx + foot.wy * foot.wy);
        const footAngle = Math.atan2(foot.wx, foot.wy); // angle from planet +Y axis
        const footTerrainH = getPlanetTerrainHeight(footAngle);
        const footAlt = footDist - PLANET_RADIUS - footTerrainH;
        if (footAlt >= 0) continue; // not in ground

        // Surface normal at foot (radially outward from planet center)
        const nx = foot.wx / footDist;
        const ny = foot.wy / footDist;
        // Tangent (90° CCW from normal)
        const tx = -ny, ty = nx;

        // Vector from CoM to foot
        const rx = foot.wx - s.x;
        const ry = foot.wy - s.y;

        // Velocity of foot = CoM velocity + angularVel × r
        const footVx = s.vx - s.angularVel * ry;
        const footVy = s.vy + s.angularVel * rx;
        const footVn = footVx * nx + footVy * ny; // normal speed (negative = into ground)
        

        // r × n and r × t (2D scalar cross products)
        const rCrossN = rx * ny - ry * nx;
        const rCrossT = rx * ty - ry * tx;

        // Normal impulse
        const jNorm = -(1 + RESTITUTION) * footVn / (1 / totalMassGear + rCrossN * rCrossN / I);
        if (jNorm > 0) {
          s.vx += (jNorm * nx) / totalMassGear;
          s.vy += (jNorm * ny) / totalMassGear;
          s.angularVel -= rCrossN * jNorm / I;

          
          s.vx -= s.vx*.95;
          s.vy -= s.vy*.95;
        }

        // Full positional correction — terrain is static so rocket absorbs it all
        const penetration = -footAlt;
        s.x += nx * penetration*0.95;
        s.y += ny * penetration*0.95;
      }
    }
  }

  // Moon ground contact check
  const moonAngleOnSurface = Math.atan2(mdx, mdy); // angle from moon center
  const moonTerrainH = getMoonTerrainHeight(moonAngleOnSurface);
  const moonTerrainR = MOON_RADIUS + moonTerrainH;
  const moonNozzleOffset_m = spacecraftTotalHeight(s.stages, s.currentStage)
    - spacecraftComOffset(s.stages, s.currentStage, 1);
  const moonAlt = moonDist - moonTerrainR - moonNozzleOffset_m;
  if (moonAlt <= 0 && s.flightState !== "prelaunch") {
    const mnx = mdx / moonDist;
    const mny = mdy / moonDist;
    // Radial speed relative to moon (account for moon's orbital velocity)
    const moonVx = -MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL *
      Math.sin(MOON_ANGULAR_VEL * s.time);
    const moonVy = MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL *
      Math.cos(MOON_ANGULAR_VEL * s.time);
    const relVx = s.vx - moonVx;
    const relVy = s.vy - moonVy;
    const radialSpeed = relVx * mnx + relVy * mny;

    const moonSpeedLimit = s.gearDeployed
      ? GEAR_LANDING_SPEED_LIMIT
      : LANDING_SPEED_LIMIT;
    if (radialSpeed < -moonSpeedLimit) {
      s.crashed = true;
      endFlight(false);
    } else {
      // Clamp CoM so nozzle tip sits exactly on moon terrain
      s.x = moon.x + mnx * (moonTerrainR + moonNozzleOffset_m);
      s.y = moon.y + mny * (moonTerrainR + moonNozzleOffset_m);
      const clampedRadial = Math.max(0, radialSpeed);
      const tanVx = relVx - radialSpeed * mnx;
      const tanVy = relVy - radialSpeed * mny;
      s.vx = moonVx + clampedRadial * mnx + tanVx;
      s.vy = moonVy + clampedRadial * mny + tanVy;

      if (clampedRadial === 0 && s.flightState !== "landed") {
        s.angularVel = 0;
        s.onMoon = true;
        s.flightState = "landed";
        // Store the moon-relative angle so we can lock position each frame
        s.moonLandAngle = Math.atan2(mdx, mdy);
        if (!s.achievements.moonLanding) {
          s.achievements.moonLanding = true;
          showAchievement("Moon Landing!");
        } else {
          showNotification("On the moon — press SPACE to launch");
        }
      }
    }
  }

  // Landing gear foot contact on moon — same torque logic as planet
  if (s.gearDeployed && s.flightState !== "prelaunch" && moonAlt < 30) {
    const bottomStage = s.stages[s.currentStage];
    if (bottomStage && bottomStage.hasLandingGear) {
      const rot = s.angle + Math.atan2(s.x, s.y);
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      const axisX = sinR, axisY = cosR;
      const rightX = cosR, rightY = -sinR;

      const tankW_m = TANK_SIZES[bottomStage.tankSize].width;
      const legSpread_m = tankW_m / 2 + 8;
      const moonFeetAlongAxis = moonNozzleOffset_m;
      const moonFeet = [
        { wx: s.x - axisX * moonFeetAlongAxis - rightX * legSpread_m,
          wy: s.y - axisY * moonFeetAlongAxis - rightY * legSpread_m },
        { wx: s.x - axisX * moonFeetAlongAxis + rightX * legSpread_m,
          wy: s.y - axisY * moonFeetAlongAxis + rightY * legSpread_m },
      ];

      let totalMassGearMoon = CAPSULE_MASS;
      for (let i = s.currentStage; i < s.stages.length; i++) {
        totalMassGearMoon += s.stages[i].dryMass + s.stages[i].fuel;
      }
      const I_moon = totalMassGearMoon * totalHeight_m * totalHeight_m / 12;

      const moonVx = -MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL * Math.sin(MOON_ANGULAR_VEL * s.time);
      const moonVy =  MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL * Math.cos(MOON_ANGULAR_VEL * s.time);

      const RESTITUTION_MOON = 0.05;
      const FRICTION_MU_MOON = 0.6;
      for (const foot of moonFeet) {
        const fdx = foot.wx - moon.x;
        const fdy = foot.wy - moon.y;
        const footMoonDist = Math.sqrt(fdx * fdx + fdy * fdy);
        const footMoonTerrainH = getMoonTerrainHeight(Math.atan2(fdx, fdy));
        const footMoonAlt = footMoonDist - MOON_RADIUS - footMoonTerrainH;
        if (footMoonAlt >= 0) continue;

        // Normal: radially outward from moon center
        const nx = fdx / footMoonDist;
        const ny = fdy / footMoonDist;
        const tx = -ny, ty = nx;

        const rx = foot.wx - s.x;
        const ry = foot.wy - s.y;

        // Velocity of foot relative to moon surface
        const footVx = (s.vx - moonVx) - s.angularVel * ry;
        const footVy = (s.vy - moonVy) + s.angularVel * rx;
        const footVn = footVx * nx + footVy * ny;
        const footVt = footVx * tx + footVy * ty;

        const rCrossN = rx * ny - ry * nx;
        const rCrossT = rx * ty - ry * tx;

        const jNorm = -(1 + RESTITUTION_MOON) * footVn / (1 / totalMassGearMoon + rCrossN * rCrossN / I_moon);
        if (jNorm > 0) {
          s.vx += (jNorm * nx) / totalMassGearMoon;
          s.vy += (jNorm * ny) / totalMassGearMoon;
          s.angularVel -= rCrossN * jNorm / I_moon;

          const jFricUnclamped = -footVt / (1 / totalMassGearMoon + rCrossT * rCrossT / I_moon);
          const jFric = Math.max(-FRICTION_MU_MOON * jNorm, Math.min(FRICTION_MU_MOON * jNorm, jFricUnclamped));
          s.vx += (jFric * tx) / totalMassGearMoon;
          s.vy += (jFric * ty) / totalMassGearMoon;
          s.angularVel -= rCrossT * jFric / I_moon;
        }

        const penetration = -footMoonAlt;
        s.x += nx * penetration;
        s.y += ny * penetration;
      }
    }
  }

  // Orbit checks
  const orb = computeOrbitalElements(s.x, s.y, s.vx, s.vy);
  if (orb.pe > ATMOSPHERE_HEIGHT && orb.ap > ATMOSPHERE_HEIGHT && !s.orbitAchieved) {
    s.orbitAchieved = true;
    s.achievements.orbitAchieved = true;
    showNotification("Orbit achieved!");
  }

  // Lunar orbit: check if craft is on a closed orbit around the moon
  if (!s.achievements.lunarOrbit) {
    const moonOrb = computeOrbitalElements(
      s.x - moon.x, s.y - moon.y,
      s.vx - (-MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL * Math.sin(MOON_ANGULAR_VEL * s.time)),
      s.vy - (MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL * Math.cos(MOON_ANGULAR_VEL * s.time)),
    );
    // pe > 0 (above moon surface) and orbit energy negative (closed), using moon MU
    const moonOrbR = Math.sqrt((s.x - moon.x) ** 2 + (s.y - moon.y) ** 2);
    const moonRelVx = s.vx - (-MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL * Math.sin(MOON_ANGULAR_VEL * s.time));
    const moonRelVy = s.vy - (MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL * Math.cos(MOON_ANGULAR_VEL * s.time));
    const moonRelV2 = moonRelVx ** 2 + moonRelVy ** 2;
    const moonOrbEnergy = 0.5 * moonRelV2 - MOON_MU / moonOrbR;
    if (moonOrbEnergy < 0) {
      const moonSMA = -MOON_MU / (2 * moonOrbEnergy);
      const moonH = (s.x - moon.x) * moonRelVy - (s.y - moon.y) * moonRelVx;
      const moonEcc = Math.sqrt(Math.max(0, 1 + 2 * moonOrbEnergy * moonH * moonH / (MOON_MU * MOON_MU)));
      const moonPe = moonSMA * (1 - moonEcc) - MOON_RADIUS;
      if (moonPe > 0) {
        s.achievements.lunarOrbit = true;
        showAchievement("Lunar Orbit!");
      }
    }
  }

  // Lagrange point detection
  const lp = getLagrangePoints(s.time);
  for (const [key, point] of Object.entries(lp)) {
    const achKey = "lagrange" + key;
    if (!s.achievements[achKey]) {
      const dx = s.x - point.x, dy = s.y - point.y;
      if (dx * dx + dy * dy < LAGRANGE_CAPTURE_RADIUS * LAGRANGE_CAPTURE_RADIUS) {
        s.achievements[achKey] = true;
        showAchievement(key + " Lagrange Point!");
      }
    }
  }

  // Animate landing gear
  const gearTarget = s.gearDeployed ? 1 : 0;
  s.gearAnimation += (gearTarget - s.gearAnimation) * Math.min(1, 5 * dt);

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
    // Jettison current stage — create a full jettisoned stage object
    const dist = Math.sqrt(s.x * s.x + s.y * s.y);
    const upX = s.x / dist;
    const upY = s.y / dist;
    const jetStage = s.stages[s.currentStage];
    s.jettisoned.push({
      x: s.x - upX * 5,
      y: s.y - upY * 5,
      vx: s.vx - upX * (3 + Math.random() * 5) + (Math.random() - 0.5) * 2,
      vy: s.vy - upY * (3 + Math.random() * 5) + (Math.random() - 0.5) * 2,
      rot: s.angle + Math.atan2(s.x, s.y),
      rotV: (Math.random() - 0.5) * 1.5,
      life: 30,
      tankSize: jetStage.tankSize,
      engines: jetStage.engines,
      hasLandingGear: jetStage.hasLandingGear,
    });
    // Small separation debris particles
    for (let i = 0; i < 3; i++) {
      s.debris.push({
        x: s.x - upX * 8 + (Math.random() - 0.5) * 6,
        y: s.y - upY * 8 + (Math.random() - 0.5) * 6,
        vx: s.vx - upX * (8 + Math.random() * 10) + (Math.random() - 0.5) * 10,
        vy: s.vy - upY * (8 + Math.random() * 10) + (Math.random() - 0.5) * 10,
        rot: 0,
        rotV: (Math.random() - 0.5) * 5,
        life: 2,
        size: 2 + Math.random() * 2,
      });
    }
    s.currentStage++;
    s.throttle = 0;
    // Reset gear — new active stage starts with gear retracted
    s.gearDeployed = false;
    s.gearAnimation = 0;
    if (s.currentStage < s.stages.length) {
      showNotification("Stage " + (s.currentStage + 1) + " ignition");
    } else {
      s.flightState = "freefall";
      s.gearDeployed = false;
      s.gearAnimation = 0;
      showNotification("All stages jettisoned — SPACE for chute");
    }
    renderHUDStages();
  } else if (s.flightState === "freefall") {
    s.flightState = "landing";
    s.throttle = 0;
    showNotification("Parachute deployed!");
    renderHUDStages();
  } else if (s.flightState === "landed" && s.onMoon) {
    // Liftoff from moon — re-enter staging if stages remain, else freefall
    s.onMoon = false;
    if (!s.achievements.moonLiftoff) {
      s.achievements.moonLiftoff = true;
      showAchievement("Moon Liftoff!");
    }
    if (s.currentStage < s.stages.length) {
      s.flightState = "staging";
      showNotification("Launching from moon!");
    } else {
      s.flightState = "freefall";
      showNotification("Leaving moon — deploy chute near Earth");
    }
    renderHUDStages();
  }
}

function toggleLandingGear() {
  const s = sim;
  if (
    s.flightState !== "staging" && s.flightState !== "freefall" &&
    s.flightState !== "prelaunch"
  ) return;
  // Only the active (current) stage's gear can be toggled
  if (s.currentStage >= s.stages.length) return;
  if (!s.stages[s.currentStage].hasLandingGear) {
    showNotification("No landing gear on this stage");
    return;
  }
  s.gearDeployed = !s.gearDeployed;
  showNotification(
    s.gearDeployed ? "Landing gear deployed" : "Landing gear retracted",
  );
  renderHUDStages();
}

function showNotification(text) {
  sim.notification = text;
  sim.notifTimer = 2.5;
  const el = document.getElementById("notification");
  el.textContent = text;
  el.classList.add("show");
}

function showAchievement(text) {
  // Queue after any current notification clears
  const delay = sim.notifTimer > 0 ? sim.notifTimer * 1000 + 100 : 0;
  setTimeout(() => {
    if (sim && !sim.ended) showNotification("Achievement: " + text);
  }, delay);
}

function spawnSatelliteDebris(x, y, vx, vy, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = 20 + Math.random() * 120;
    sim.debris.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 20,
      vx: vx + Math.cos(angle) * speed,
      vy: vy + Math.sin(angle) * speed,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 4,
      life: 15 + Math.random() * 15,
      size: 2 + Math.random() * 5,
    });
  }
}

function endFlight(success) {
  sim.ended = true;
  const overlay = document.getElementById("end-overlay");
  const title = document.getElementById("end-title");
  const subtitle = document.getElementById("end-subtitle");
  const stats = document.getElementById("end-stats");

  if (!success) {
    title.textContent = "Impact!";
    title.style.color = "var(--danger)";
    subtitle.textContent =
      "Your spacecraft hit the surface too hard. Deploy the parachute earlier or reduce speed before landing!";
  } else if (sim.achievements.returnToEarth) {
    title.textContent = "Mission Complete!";
    title.style.color = "var(--success)";
    subtitle.textContent = "You landed on the Moon and returned safely to Earth!";
  } else if (sim.achievements.moonLanding) {
    title.textContent = "Safe Landing";
    title.style.color = "var(--success)";
    subtitle.textContent = "You landed on the Moon but didn't make it home. So close!";
  } else if (sim.orbitAchieved) {
    title.textContent = "Safe Return";
    title.style.color = "var(--success)";
    subtitle.textContent = "Splashdown! You achieved orbit and returned safely to Earth.";
  } else {
    title.textContent = "Safe Landing";
    title.style.color = "var(--fuel-color)";
    const hasFuel = sim.stages.some((s) => s.fuel > 0);
    subtitle.textContent = hasFuel
      ? "Your capsule landed safely, but never reached orbit."
      : "Your capsule landed safely, but never reached orbit. Add more stages!";
  }

  // Achievements row
  const ach = sim.achievements;
  const achLabels = [
    ["orbitAchieved", "Orbit"],
    ["lunarOrbit", "Lunar Orbit"],
    ["moonLanding", "Moon Landing"],
    ["moonLiftoff", "Moon Liftoff"],
    ["returnToEarth", "Return to Earth"],
    ["lagrangeL1", "L1"],
    ["lagrangeL2", "L2"],
    ["lagrangeL3", "L3"],
    ["lagrangeL4", "L4"],
    ["lagrangeL5", "L5"],
  ];
  const achHTML = achLabels.map(([key, label]) =>
    `<div class="stat-item"><div class="lbl">${label}</div><div class="val" style="font-size:18px">${ach[key] ? "✓" : "—"}</div></div>`
  ).join("");

  stats.innerHTML = `
    <div class="stat-item"><div class="lbl">Max Altitude</div><div class="val">${formatDist(sim.maxAlt)}</div></div>
    <div class="stat-item"><div class="lbl">Max Velocity</div><div class="val">${Math.round(sim.maxVel)} m/s</div></div>
    <div class="stat-item"><div class="lbl">Flight Time</div><div class="val">${formatTime(sim.time)}</div></div>
    <div class="stat-item"><div class="lbl">Stages Used</div><div class="val">${sim.currentStage + 1} / ${sim.stages.length}</div></div>
    ${achHTML}
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

function showCredits() {
  document.getElementById("end-overlay").classList.remove("show");
  document.getElementById("credits-overlay").classList.add("show");
}

function hideCredits() {
  document.getElementById("credits-overlay").classList.remove("show");
  document.getElementById("end-overlay").classList.add("show");
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

  // Landing gear entry (only for active stage)
  const activeStageHasGear = sim.currentStage < sim.stages.length &&
    sim.stages[sim.currentStage].hasLandingGear;
  if (activeStageHasGear) {
    const gearDiv = document.createElement("div");
    let gearCls = "stage-hud-item";
    if (sim.gearDeployed) gearCls += " active";
    gearDiv.className = gearCls;
    gearDiv.innerHTML = `
      <span class="stage-label" style="font-size:11px;">⊥</span>
      <div class="fuel-bar-bg"><div class="fuel-bar" style="width:${
      sim.gearDeployed ? 100 : 0
    }%;background:var(--success);"></div></div>
      <span class="fuel-pct" style="font-size:9px;">${
      sim.gearDeployed ? "DOWN" : "UP"
    }</span>
    `;
    el.appendChild(gearDiv);
  }
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
  const altPct = alt <= 0
    ? 0
    : Math.min(1, Math.log(1 + alt) / Math.log(1 + altMax));
  const atmoPct = Math.log(1 + ATMOSPHERE_HEIGHT) / Math.log(1 + altMax);
  const orbitPct = Math.log(1 + ORBIT_TARGET) / Math.log(1 + altMax);
  document.getElementById("altimeter-fill").style.height = (altPct * 100) + "%";
  document.getElementById("altimeter-needle").style.bottom = (altPct * 100) +
    "%";
  document.getElementById("altimeter-atmo").style.bottom = (atmoPct * 100) +
    "%";
  document.getElementById("altimeter-orbit").style.bottom = (orbitPct * 100) +
    "%";
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
