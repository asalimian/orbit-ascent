// ═══════════════════════════════════════════════
// FLIGHT SIMULATION
// ═══════════════════════════════════════════════
import {
  ATMOSPHERE_HEIGHT,
  CAPSULE_MASS,
  ENGINE_THRUST,
  EXHAUST_VEL,
  GEAR_LANDING_SPEED_LIMIT,
  getLagrangePoints,
  getMoonPos,
  getMoonTerrainHeight,
  getPlanetTerrainHeight,
  LAGRANGE_CAPTURE_RADIUS,
  LANDING_SPEED_LIMIT,
  MOON_ANGULAR_VEL,
  MOON_MU,
  MOON_ORBIT_RADIUS,
  MOON_RADIUS,
  MU,
  ORBIT_TARGET,
  PARACHUTE_AREA,
  PARACHUTE_CD,
  PLANET_RADIUS,
  SATELLITE_COLLISION_RADIUS,
  SATELLITE_EXPLODE_SPEED,
  SATELLITE_MASS,
  SATELLITE_ORBIT_RADIUS,
  SPEED_OF_SOUND,
  SURFACE_G,
  TANK_SIZES,
} from "./constants.ts";
import { spacecraftComOffset, spacecraftTotalHeight } from "./bodies.ts";
import { stages } from "./staging.ts";
import {
  animFrame,
  getPaused,
  getSimSpeed,
  getViewMode,
  getZoomIndicatorTimer,
  getZoomLevel,
  keys,
  savedStages,
  setAnimFrame,
  setPaused,
  setSavedStages,
  setSim,
  setZoomIndicatorTimer,
  setZoomLevel,
  sim,
  togglePausedState,
} from "./state.ts";
import type { Achievements, LiveStage, SimState } from "./types.ts";

// Canvas elements — owned by simulation, shared with renderer via exports
export const flightCanvas = document.getElementById(
  "flight-canvas",
) as HTMLCanvasElement;
export const flightCtx = flightCanvas.getContext("2d")!;
export const minimapCanvas = document.getElementById(
  "minimap-canvas",
) as HTMLCanvasElement;
export const minimapCtx = minimapCanvas.getContext("2d")!;
export const orientationCanvas = document.getElementById(
  "orientation-canvas",
) as HTMLCanvasElement;
export const orientationCtx = orientationCanvas.getContext("2d")!;

// render() — set by renderer.ts after it initialises, called each frame
let _render: (() => void) | null = null;
export function setRenderFn(fn: () => void): void {
  _render = fn;
}

// resizeCanvas() — set by renderer.ts
let _resizeCanvas: (() => void) | null = null;
export function setResizeCanvasFn(fn: () => void): void {
  _resizeCanvas = fn;
}

// ── startFlight ──────────────────────────────────

export function startFlight(): void {
  if (stages.length === 0) return;

  document.getElementById("staging-screen")!.style.display = "none";
  document.getElementById("flight-screen")!.style.display = "block";

  _resizeCanvas?.();
  setPaused(false);
  setZoomLevel(1.0);
  document.getElementById("pause-overlay")!.classList.remove("show");
  document.getElementById("sim-speed-indicator")!.style.display = "none";

  setSavedStages(stages.map((s) => ({ ...s }) as LiveStage));

  const flightStages: LiveStage[] = stages.map((s) => ({
    ...s,
    fuel: s.fuel,
    maxFuel: s.fuel,
  }));

  const nozzleOffset_m = spacecraftTotalHeight(flightStages, 0) -
    spacecraftComOffset(flightStages, 0, 1);
  const padY = PLANET_RADIUS + nozzleOffset_m;

  const newSim: SimState = {
    x: 0,
    y: padY,
    vx: 0,
    vy: 0,
    angle: 0,
    angularVel: 0,
    throttle: 0,
    flightState: "prelaunch",
    stages: flightStages,
    currentStage: 0,
    particles: [],
    rcsActive: { forward: 0, right: 0, rotate: 0 },
    debris: [],
    jettisoned: [],
    satellite: {
      x: SATELLITE_ORBIT_RADIUS,
      y: 0,
      vx: 0,
      vy: -Math.sqrt(MU / SATELLITE_ORBIT_RADIUS),
      alive: true,
      rot: 0,
      rotV: 0,
    },
    time: 0,
    maxAlt: 0,
    maxVel: 0,
    ended: false,
    crashed: false,
    onMoon: false,
    moonLandAngle: 0,
    gearDeployed: stages[0]?.hasLandingGear === true,
    gearAnimation: stages[0]?.hasLandingGear ? 1 : 0,
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
  setSim(newSim);

  renderHUDStages();
  lastTime = performance.now();
  loop();
}

let lastTime = 0;

function loop(): void {
  const s = sim!;
  const now = performance.now();
  const rawDt = (now - lastTime) / 1000;
  lastTime = now;
  const dt = Math.min(rawDt, 0.05);

  if (!s.ended && !getPaused()) {
    const speed = getSimSpeed();
    const subDt = dt * speed / speed; // speed steps
    for (let i = 0; i < speed && !s.ended; i++) updateSim(subDt);
  }

  const zit = getZoomIndicatorTimer();
  if (zit > 0) {
    setZoomIndicatorTimer(zit - rawDt);
    if (zit - rawDt <= 0) {
      document.getElementById("zoom-indicator")!.classList.remove("show");
    }
  }

  _render?.();
  setAnimFrame(requestAnimationFrame(loop));
}

// ── updateSim ────────────────────────────────────

export function updateSim(dt: number): void {
  const s = sim!;

  // Moon-locked position when landed on moon
  if (s.onMoon && s.flightState === "landed") {
    s.time += dt;
    const moon = getMoonPos(s.time);
    const moonTerrainR = MOON_RADIUS + getMoonTerrainHeight(s.moonLandAngle);
    s.x = moon.x + Math.sin(s.moonLandAngle) * moonTerrainR;
    s.y = moon.y + Math.cos(s.moonLandAngle) * moonTerrainR;
    s.vx = -MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL *
      Math.sin(MOON_ANGULAR_VEL * s.time);
    s.vy = MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL *
      Math.cos(MOON_ANGULAR_VEL * s.time);
    updateHUD();
    return;
  }

  const dist = Math.sqrt(s.x * s.x + s.y * s.y);
  const alt = dist - PLANET_RADIUS;

  // Planet gravity
  const gMag = MU / (dist * dist);
  let gx = -gMag * (s.x / dist);
  let gy = -gMag * (s.y / dist);

  // Moon gravity
  const moon = getMoonPos(s.time);
  const mdx = s.x - moon.x, mdy = s.y - moon.y;
  const moonDist = Math.sqrt(mdx * mdx + mdy * mdy);
  const moonGMag = MOON_MU / (moonDist * moonDist);
  gx -= moonGMag * (mdx / moonDist);
  gy -= moonGMag * (mdy / moonDist);

  // Atmospheric drag
  let dragFactor = 0;
  if (alt < ATMOSPHERE_HEIGHT && alt >= 0) {
    const airDensity = 1.2 * Math.exp(-alt / 8500);
    const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    const cd = s.flightState === "landing" ? PARACHUTE_CD : 0.3;
    const area = s.flightState === "landing" ? PARACHUTE_AREA : 4;
    dragFactor = 0.5 * airDensity * spd * cd * area;
  }

  // Thrust + mass
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
      const tdx = Math.sin(s.angle);
      const tdy = Math.cos(s.angle);
      thrustX = tdx * thrustMag / totalMass;
      thrustY = tdy * thrustMag / totalMass;

      const fuelRate = thrustMag / EXHAUST_VEL;
      stage.fuel = Math.max(0, stage.fuel - fuelRate * dt);

      // Exhaust particles — only in atmosphere
      if (alt < ATMOSPHERE_HEIGHT && Math.random() < 0.6) {
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

        const nozzleAlongAxis = -comOff;
        const nozzleCX = s.x - tdx * nozzleAlongAxis;
        const nozzleCY = s.y - tdy * nozzleAlongAxis;

        const rightX = tdy, rightY = -tdx;
        const tank = TANK_SIZES[stage.tankSize];
        const engW = 4;
        const n = stage.engines;
        const engGap = n > 1 ? (tank.width - n * engW) / (n - 1) : 0;
        const totalW = n * engW + (n - 1) * engGap;
        for (let e = 0; e < n; e++) {
          const offset = -totalW / 2 + e * (engW + engGap) + engW / 2;
          s.particles.push({
            x: nozzleCX + rightX * offset + (Math.random() - 0.5) * 2,
            y: nozzleCY + rightY * offset + (Math.random() - 0.5) * 2,
            vx: -tdx * (80 + Math.random() * 60) + (Math.random() - 0.5) * 20,
            vy: -tdy * (80 + Math.random() * 60) + (Math.random() - 0.5) * 20,
            life: 0.5 + Math.random() * 0.5,
            maxLife: 0.5 + Math.random() * 0.5,
            size: 2 + Math.random() * 3,
          });
        }
      }
    }
  }

  // Drag
  const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  let dragX = 0, dragY = 0;
  if (spd > 0 && dragFactor > 0) {
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
    const spd2 = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (spd2 > 1) {
      const retrogradeWorld = Math.atan2(-s.vx, -s.vy);
      let err = retrogradeWorld - s.angle;
      while (err > Math.PI) err -= 2 * Math.PI;
      while (err < -Math.PI) err += 2 * Math.PI;
      // Pendulum restoring torque: sin(err) so it's max at 90°, zero at 0° and 180°
      const airDensity = 1.2 * Math.exp(-alt / 8500);
      const dynPressure = 0.5 * airDensity * spd2 * spd2;
      const torqueStrength = 0.4 + dynPressure / totalMass * 0.1;
      s.angularVel += Math.sin(err) * torqueStrength * dt * 60;
    }
    if (keys["ArrowLeft"] || keys["KeyQ"]) s.angularVel -= 3.0 * dt;
    if (keys["ArrowRight"] || keys["KeyE"]) s.angularVel += 3.0 * dt;
    s.angularVel *= 0.96;
    s.angle += s.angularVel * dt;
  } else if (s.flightState === "staging" || s.flightState === "freefall") {
    if (keys["ArrowLeft"] || keys["KeyQ"]) s.angularVel -= 3.0 * dt;
    if (keys["ArrowRight"] || keys["KeyE"]) s.angularVel += 3.0 * dt;
    s.angularVel *= 0.95;
    s.angle += s.angularVel * dt;
  }

  // RCS
  if (
    s.flightState === "staging" || s.flightState === "freefall" ||
    s.flightState === "landing"
  ) {
    const cosR = Math.cos(s.angle);
    const sinR = Math.sin(s.angle);
    const axisX = sinR, axisY = cosR;
    const rightX = cosR, rightY = -sinR;

    const rcsThrustAcc = 2.0;
    let transX = 0, transY = 0;
    let rcsForward = 0, rcsRight = 0;
    if (keys["KeyW"]) {
      transX += axisX;
      transY += axisY;
      rcsForward = 1;
    }
    if (keys["KeyS"]) {
      transX -= axisX;
      transY -= axisY;
      rcsForward = -1;
    }
    if (keys["KeyA"]) {
      transX -= rightX;
      transY -= rightY;
      rcsRight = -1;
    }
    if (keys["KeyD"]) {
      transX += rightX;
      transY += rightY;
      rcsRight = 1;
    }
    s.vx += transX * rcsThrustAcc * dt;
    s.vy += transY * rcsThrustAcc * dt;

    const rcsDir = (keys["ArrowLeft"] || keys["KeyQ"])
      ? -1
      : (keys["ArrowRight"] || keys["KeyE"])
      ? 1
      : 0;
    s.rcsActive = { forward: rcsForward, right: rcsRight, rotate: rcsDir };
  } else {
    s.rcsActive = { forward: 0, right: 0, rotate: 0 };
  }

  // Throttle
  if (s.flightState === "prelaunch" || s.flightState === "staging") {
    if (keys["ShiftLeft"] || keys["ArrowUp"]) {
      s.throttle = Math.min(1, s.throttle + 1.5 * dt);
    }
    if (keys["ArrowDown"] || keys["ControlLeft"]) {
      s.throttle = Math.max(0, s.throttle - 1.5 * dt);
    }
  }

  s.time += dt;

  // Particles
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

  // Jettisoned stages
  s.jettisoned.forEach((j) => {
    const jd = Math.sqrt(j.x * j.x + j.y * j.y);
    const jg = MU / (jd * jd);
    j.vx -= jg * (j.x / jd) * dt;
    j.vy -= jg * (j.y / jd) * dt;
    const mp = getMoonPos(s.time);
    const mjx = j.x - mp.x, mjy = j.y - mp.y;
    const mjd = Math.sqrt(mjx * mjx + mjy * mjy);
    if (mjd > MOON_RADIUS) {
      const mg = MOON_MU / (mjd * mjd);
      j.vx -= mg * (mjx / mjd) * dt;
      j.vy -= mg * (mjy / mjd) * dt;
    }
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
    if (jd <= PLANET_RADIUS || mjd <= MOON_RADIUS) j.life = 0;
  });
  s.jettisoned = s.jettisoned.filter((j) => j.life > 0);

  // Satellite physics + collision
  const sat = s.satellite;
  if (sat.alive) {
    const sd = Math.sqrt(sat.x * sat.x + sat.y * sat.y);
    const sg = MU / (sd * sd);
    sat.vx -= sg * (sat.x / sd) * dt;
    sat.vy -= sg * (sat.y / sd) * dt;

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

    if (sd <= PLANET_RADIUS) {
      sat.alive = false;
      spawnSatelliteDebris(sat.x, sat.y, sat.vx, sat.vy, 20);
    }

    const cdx = s.x - sat.x, cdy = s.y - sat.y;
    const cdist = Math.sqrt(cdx * cdx + cdy * cdy);
    if (cdist < SATELLITE_COLLISION_RADIUS && cdist > 0) {
      const relVx = s.vx - sat.vx, relVy = s.vy - sat.vy;
      const relSpeed = Math.sqrt(relVx * relVx + relVy * relVy);
      if (relSpeed > SATELLITE_EXPLODE_SPEED) {
        sat.alive = false;
        spawnSatelliteDebris(sat.x, sat.y, sat.vx, sat.vy, 30);
        showNotification("Satellite destroyed!");
      } else if (relSpeed > 1) {
        const nx = cdx / cdist, ny = cdy / cdist;
        const relVn = relVx * nx + relVy * ny;
        if (relVn < 0) {
          const impulse = 2 * relVn / (1 / totalMass + 1 / SATELLITE_MASS);
          s.vx -= (impulse / totalMass) * nx;
          s.vy -= (impulse / totalMass) * ny;
          sat.vx += (impulse / SATELLITE_MASS) * nx;
          sat.vy += (impulse / SATELLITE_MASS) * ny;
          sat.rotV += (Math.random() - 0.5) * 0.5;
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
  s.maxVel = Math.max(s.maxVel, spd);

  // Planet ground contact
  const terrainH = getPlanetTerrainHeight(0);
  const totalHeight_m = spacecraftTotalHeight(s.stages, s.currentStage);
  const comOffset_m = spacecraftComOffset(s.stages, s.currentStage, 1);
  const nozzleOffset_m = totalHeight_m - comOffset_m;
  const nozzleAlt = newAlt - terrainH - nozzleOffset_m;

  if (nozzleAlt <= 0 && s.flightState !== "prelaunch") {
    const nx = s.x / dist, ny = s.y / dist;
    const radialSpeed = s.vx * nx + s.vy * ny;
    const speedLimit = s.gearDeployed
      ? GEAR_LANDING_SPEED_LIMIT
      : LANDING_SPEED_LIMIT;
    if (radialSpeed < -speedLimit) {
      s.crashed = true;
      endFlight(false);
    } else {
      const clampR = PLANET_RADIUS + terrainH + nozzleOffset_m;
      s.x = nx * clampR;
      s.y = ny * clampR;
      const tanVx = s.vx - radialSpeed * nx, tanVy = s.vy - radialSpeed * ny;
      s.vx = Math.max(0, radialSpeed) * nx + tanVx;
      s.vy = Math.max(0, radialSpeed) * ny + tanVy;
      if (Math.max(0, radialSpeed) === 0 && s.flightState !== "landed") {
        s.angularVel = 0;
        if (s.achievements.moonLanding) s.achievements.returnToEarth = true;
        const hasFuel = s.stages.some((st) => st.fuel > 0);
        if (!hasFuel) {
          showNotification("Touchdown!");
          endFlight(true);
        }
      }
    }
  } else if (nozzleAlt <= 0 && s.flightState === "prelaunch") {
    const nx = s.x / dist, ny = s.y / dist;
    const clampR = PLANET_RADIUS + terrainH + nozzleOffset_m;
    s.x = nx * clampR;
    s.y = ny * clampR;
    const radialSpeed = s.vx * nx + s.vy * ny;
    if (radialSpeed < 0) {
      s.vx -= radialSpeed * nx;
      s.vy -= radialSpeed * ny;
    }
  }

  // Landing gear — planet
  if (s.gearDeployed && s.flightState !== "prelaunch" && nozzleAlt < 30) {
    const bottomStage = s.stages[s.currentStage];
    if (bottomStage?.hasLandingGear) {
      const rot = s.angle;
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      const axisX = sinR, axisY = cosR;
      const rightX = cosR, rightY = -sinR;
      const tankW_m = TANK_SIZES[bottomStage.tankSize].width;
      const legSpread_m = tankW_m / 2 + 8;
      let totalMassGear = CAPSULE_MASS;
      for (let i = s.currentStage; i < s.stages.length; i++) {
        totalMassGear += s.stages[i].dryMass + s.stages[i].fuel;
      }
      const I = totalMassGear * totalHeight_m * totalHeight_m / 12;
      const RESTITUTION = 0.05, FRICTION_MU = 0.6;

      for (const side of [-1, 1] as const) {
        const foot = {
          wx: s.x - axisX * nozzleOffset_m + side * rightX * legSpread_m,
          wy: s.y - axisY * nozzleOffset_m + side * rightY * legSpread_m,
        };
        const footDist = Math.sqrt(foot.wx * foot.wx + foot.wy * foot.wy);
        const footAngle = Math.atan2(foot.wx, foot.wy);
        const footTerrainH = getPlanetTerrainHeight(footAngle);
        const footAlt = footDist - PLANET_RADIUS - footTerrainH;
        if (footAlt >= 0) continue;

        const nx = foot.wx / footDist, ny = foot.wy / footDist;
        const rx = foot.wx - s.x, ry = foot.wy - s.y;
        const footVx = s.vx - s.angularVel * ry;
        const footVy = s.vy + s.angularVel * rx;
        const footVn = footVx * nx + footVy * ny;
        const rCrossN = rx * ny - ry * nx;
        const jNorm = -(1 + RESTITUTION) * footVn /
          (1 / totalMassGear + rCrossN * rCrossN / I);
        if (jNorm > 0) {
          s.vx += (jNorm * nx) / totalMassGear;
          s.vy += (jNorm * ny) / totalMassGear;
          s.angularVel -= rCrossN * jNorm / I;
          s.vx -= s.vx * 0.95;
          s.vy -= s.vy * 0.95;
        }
        s.x += nx * (-footAlt) * 0.95;
        s.y += ny * (-footAlt) * 0.95;
      }
    }
  }

  // Moon ground contact
  const moonAngleOnSurface = Math.atan2(mdx, mdy);
  const moonTerrainH = getMoonTerrainHeight(moonAngleOnSurface);
  const moonTerrainR = MOON_RADIUS + moonTerrainH;
  const moonNozzleOffset_m = spacecraftTotalHeight(s.stages, s.currentStage) -
    spacecraftComOffset(s.stages, s.currentStage, 1);
  const moonAlt = moonDist - moonTerrainR - moonNozzleOffset_m;

  if (moonAlt <= 0 && s.flightState !== "prelaunch") {
    const mnx = mdx / moonDist, mny = mdy / moonDist;
    const moonVx = -MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL *
      Math.sin(MOON_ANGULAR_VEL * s.time);
    const moonVy = MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL *
      Math.cos(MOON_ANGULAR_VEL * s.time);
    const relVx = s.vx - moonVx, relVy = s.vy - moonVy;
    const radialSpeed = relVx * mnx + relVy * mny;
    const moonSpeedLimit = s.gearDeployed
      ? GEAR_LANDING_SPEED_LIMIT
      : LANDING_SPEED_LIMIT;
    if (radialSpeed < -moonSpeedLimit) {
      s.crashed = true;
      endFlight(false);
    } else {
      s.x = moon.x + mnx * (moonTerrainR + moonNozzleOffset_m);
      s.y = moon.y + mny * (moonTerrainR + moonNozzleOffset_m);
      const tanVx = relVx - radialSpeed * mnx,
        tanVy = relVy - radialSpeed * mny;
      s.vx = moonVx + Math.max(0, radialSpeed) * mnx + tanVx;
      s.vy = moonVy + Math.max(0, radialSpeed) * mny + tanVy;
      if (Math.max(0, radialSpeed) === 0 && s.flightState !== "landed") {
        s.angularVel = 0;
        s.onMoon = true;
        s.flightState = "landed";
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

  // Landing gear — moon
  if (s.gearDeployed && s.flightState !== "prelaunch" && moonAlt < 30) {
    const bottomStage = s.stages[s.currentStage];
    if (bottomStage?.hasLandingGear) {
      const rot = s.angle;
      const cosR = Math.cos(rot), sinR = Math.sin(rot);
      const axisX = sinR, axisY = cosR;
      const rightX = cosR, rightY = -sinR;
      const tankW_m = TANK_SIZES[bottomStage.tankSize].width;
      const legSpread_m = tankW_m / 2 + 8;
      let totalMassGearMoon = CAPSULE_MASS;
      for (let i = s.currentStage; i < s.stages.length; i++) {
        totalMassGearMoon += s.stages[i].dryMass + s.stages[i].fuel;
      }
      const I_moon = totalMassGearMoon * totalHeight_m * totalHeight_m / 12;
      const moonVx = -MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL *
        Math.sin(MOON_ANGULAR_VEL * s.time);
      const moonVy = MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL *
        Math.cos(MOON_ANGULAR_VEL * s.time);
      const RESTITUTION_MOON = 0.05, FRICTION_MU_MOON = 0.6;

      for (const side of [-1, 1] as const) {
        const foot = {
          wx: s.x - axisX * moonNozzleOffset_m + side * rightX * legSpread_m,
          wy: s.y - axisY * moonNozzleOffset_m + side * rightY * legSpread_m,
        };
        const fdx = foot.wx - moon.x, fdy = foot.wy - moon.y;
        const footMoonDist = Math.sqrt(fdx * fdx + fdy * fdy);
        const footMoonTerrainH = getMoonTerrainHeight(Math.atan2(fdx, fdy));
        const footMoonAlt = footMoonDist - MOON_RADIUS - footMoonTerrainH;
        if (footMoonAlt >= 0) continue;

        const nx = fdx / footMoonDist, ny = fdy / footMoonDist;
        const tx = -ny, ty = nx;
        const rx = foot.wx - s.x, ry = foot.wy - s.y;
        const footVx = (s.vx - moonVx) - s.angularVel * ry;
        const footVy = (s.vy - moonVy) + s.angularVel * rx;
        const footVn = footVx * nx + footVy * ny;
        const footVt = footVx * tx + footVy * ty;
        const rCrossN = rx * ny - ry * nx;
        const rCrossT = rx * ty - ry * tx;
        const jNorm = -(1 + RESTITUTION_MOON) * footVn /
          (1 / totalMassGearMoon + rCrossN * rCrossN / I_moon);
        if (jNorm > 0) {
          s.vx += (jNorm * nx) / totalMassGearMoon;
          s.vy += (jNorm * ny) / totalMassGearMoon;
          s.angularVel -= rCrossN * jNorm / I_moon;
          const jFricUnclamped = -footVt /
            (1 / totalMassGearMoon + rCrossT * rCrossT / I_moon);
          const jFric = Math.max(
            -FRICTION_MU_MOON * jNorm,
            Math.min(FRICTION_MU_MOON * jNorm, jFricUnclamped),
          );
          s.vx += (jFric * tx) / totalMassGearMoon;
          s.vy += (jFric * ty) / totalMassGearMoon;
          s.angularVel -= rCrossT * jFric / I_moon;
        }
        s.x += nx * (-footMoonAlt);
        s.y += ny * (-footMoonAlt);
      }
    }
  }

  // Orbit achievements
  const orb = computeOrbitalElements(s.x, s.y, s.vx, s.vy);
  if (
    orb.pe > ATMOSPHERE_HEIGHT && orb.ap > ATMOSPHERE_HEIGHT &&
    !s.achievements.orbitAchieved
  ) {
    s.achievements.orbitAchieved = true;
    showNotification("Orbit achieved!");
  }

  if (!s.achievements.lunarOrbit) {
    const moonVxOr = -MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL *
      Math.sin(MOON_ANGULAR_VEL * s.time);
    const moonVyOr = MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL *
      Math.cos(MOON_ANGULAR_VEL * s.time);
    const moonRelVx = s.vx - moonVxOr, moonRelVy = s.vy - moonVyOr;
    const moonOrbR = Math.sqrt((s.x - moon.x) ** 2 + (s.y - moon.y) ** 2);
    const moonRelV2 = moonRelVx ** 2 + moonRelVy ** 2;
    const moonOrbEnergy = 0.5 * moonRelV2 - MOON_MU / moonOrbR;
    if (moonOrbEnergy < 0) {
      const moonSMA = -MOON_MU / (2 * moonOrbEnergy);
      const moonH = (s.x - moon.x) * moonRelVy - (s.y - moon.y) * moonRelVx;
      const moonEcc = Math.sqrt(
        Math.max(
          0,
          1 + 2 * moonOrbEnergy * moonH * moonH / (MOON_MU * MOON_MU),
        ),
      );
      const moonPe = moonSMA * (1 - moonEcc) - MOON_RADIUS;
      if (moonPe > 0) {
        s.achievements.lunarOrbit = true;
        showAchievement("Lunar Orbit!");
      }
    }
  }

  // Lagrange detection
  const lp = getLagrangePoints(s.time);
  for (
    const [key, point] of Object.entries(lp) as [
      keyof typeof lp,
      { x: number; y: number },
    ][]
  ) {
    const achKey = ("lagrange" + key) as keyof Achievements;
    if (!s.achievements[achKey]) {
      const dx = s.x - point.x, dy = s.y - point.y;
      if (
        dx * dx + dy * dy < LAGRANGE_CAPTURE_RADIUS * LAGRANGE_CAPTURE_RADIUS
      ) {
        s.achievements[achKey] = true;
        showAchievement(key + " Lagrange Point!");
      }
    }
  }

  // Gear animation
  const gearTarget = s.gearDeployed ? 1 : 0;
  s.gearAnimation += (gearTarget - s.gearAnimation) * Math.min(1, 5 * dt);

  // Notification timer
  if (s.notifTimer > 0) {
    s.notifTimer -= dt;
    if (s.notifTimer <= 0) {
      document.getElementById("notification")!.classList.remove("show");
    }
  }

  updateHUD();
}

// ── computeOrbitalElements ───────────────────────

export function computeOrbitalElements(
  x: number,
  y: number,
  vx: number,
  vy: number,
): { ap: number; pe: number; sma: number; ecc: number; h?: number } {
  const r = Math.sqrt(x * x + y * y);
  const v = Math.sqrt(vx * vx + vy * vy);
  const E = 0.5 * v * v - MU / r;
  if (E >= 0) {
    return { ap: Infinity, pe: r - PLANET_RADIUS, sma: Infinity, ecc: 2 };
  }
  const a = -MU / (2 * E);
  const h = x * vy - y * vx;
  const ecc = Math.sqrt(1 + 2 * E * h * h / (MU * MU));
  return {
    ap: a * (1 + ecc) - PLANET_RADIUS,
    pe: a * (1 - ecc) - PLANET_RADIUS,
    sma: a,
    ecc,
    h,
  };
}

// ── activateNextStage ────────────────────────────

export function activateNextStage(): void {
  const s = sim!;
  if (s.flightState === "prelaunch") {
    if (s.throttle <= 0) return;
    s.flightState = "staging";
    showNotification("Liftoff!");
    renderHUDStages();
  } else if (s.flightState === "staging") {
    const dist = Math.sqrt(s.x * s.x + s.y * s.y);
    const upX = s.x / dist, upY = s.y / dist;
    const jetStage = s.stages[s.currentStage];
    s.jettisoned.push({
      x: s.x - upX * 5,
      y: s.y - upY * 5,
      vx: s.vx - upX * (3 + Math.random() * 5) + (Math.random() - 0.5) * 2,
      vy: s.vy - upY * (3 + Math.random() * 5) + (Math.random() - 0.5) * 2,
      rot: s.angle,
      rotV: (Math.random() - 0.5) * 1.5,
      life: 30,
      tankSize: jetStage.tankSize,
      engines: jetStage.engines,
    });
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
    s.gearDeployed = false;
    s.gearAnimation = 0;
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
  } else if (s.flightState === "landed" && s.onMoon) {
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

// ── toggleLandingGear ────────────────────────────

export function toggleLandingGear(): void {
  const s = sim!;
  if (
    s.flightState !== "staging" && s.flightState !== "freefall" &&
    s.flightState !== "prelaunch"
  ) return;
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

// ── Notifications ────────────────────────────────

export function showNotification(text: string): void {
  const s = sim!;
  s.notification = text;
  s.notifTimer = 2.5;
  const el = document.getElementById("notification")!;
  el.textContent = text;
  el.classList.add("show");
}

export function showAchievement(text: string): void {
  const delay = sim!.notifTimer > 0 ? sim!.notifTimer * 1000 + 100 : 0;
  setTimeout(() => {
    if (sim && !sim.ended) showNotification("Achievement: " + text);
  }, delay);
}

function spawnSatelliteDebris(
  x: number,
  y: number,
  vx: number,
  vy: number,
  count: number,
): void {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = 20 + Math.random() * 120;
    sim!.debris.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 20,
      vx: vx + Math.cos(angle) * spd,
      vy: vy + Math.sin(angle) * spd,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 4,
      life: 15 + Math.random() * 15,
      size: 2 + Math.random() * 5,
    });
  }
}

// ── Flight end ───────────────────────────────────

function endFlight(success: boolean): void {
  const s = sim!;
  s.ended = true;
  const overlay = document.getElementById("end-overlay")!;
  const title = document.getElementById("end-title")!;
  const subtitle = document.getElementById("end-subtitle")!;
  const stats = document.getElementById("end-stats")!;

  if (!success) {
    title.textContent = "Impact!";
    title.style.color = "var(--danger)";
    subtitle.textContent =
      "Your spacecraft hit the surface too hard. Deploy the parachute earlier or reduce speed before landing!";
  } else if (s.achievements.returnToEarth) {
    title.textContent = "Mission Complete!";
    title.style.color = "var(--success)";
    subtitle.textContent =
      "You landed on the Moon and returned safely to Earth!";
  } else if (s.achievements.moonLanding) {
    title.textContent = "Safe Landing";
    title.style.color = "var(--success)";
    subtitle.textContent =
      "You landed on the Moon but didn't make it home. So close!";
  } else if (s.achievements.orbitAchieved) {
    title.textContent = "Safe Return";
    title.style.color = "var(--success)";
    subtitle.textContent =
      "Splashdown! You achieved orbit and returned safely to Earth.";
  } else {
    title.textContent = "Safe Landing";
    title.style.color = "var(--fuel-color)";
    subtitle.textContent = s.stages.some((st) => st.fuel > 0)
      ? "Your capsule landed safely, but never reached orbit."
      : "Your capsule landed safely, but never reached orbit. Add more stages!";
  }

  const achLabels: [keyof Achievements, string][] = [
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
    `<div class="stat-item"><div class="lbl">${label}</div><div class="val" style="font-size:18px">${
      s.achievements[key] ? "✓" : "—"
    }</div></div>`
  ).join("");

  stats.innerHTML = `
    <div class="stat-item"><div class="lbl">Max Altitude</div><div class="val">${
    formatDist(s.maxAlt)
  }</div></div>
    <div class="stat-item"><div class="lbl">Max Velocity</div><div class="val">${
    Math.round(s.maxVel)
  } m/s</div></div>
    <div class="stat-item"><div class="lbl">Flight Time</div><div class="val">${
    formatTime(s.time)
  }</div></div>
    <div class="stat-item"><div class="lbl">Stages Used</div><div class="val">${
    s.currentStage + 1
  } / ${s.stages.length}</div></div>
    ${achHTML}
  `;
  overlay.classList.add("show");
}

// ── UI actions (called from HTML onclick) ────────

export function togglePause(): void {
  if (sim?.ended) return;
  const nowPaused = togglePausedState();
  const overlay = document.getElementById("pause-overlay")!;
  if (nowPaused) {
    overlay.classList.add("show");
  } else {
    overlay.classList.remove("show");
    lastTime = performance.now();
  }
}

export function restartMission(): void {
  document.getElementById("pause-overlay")!.classList.remove("show");
  document.getElementById("end-overlay")!.classList.remove("show");
  setPaused(false);
  if (animFrame !== null) cancelAnimationFrame(animFrame);
  // Restore saved stages into the staging module's array
  stages.splice(0, stages.length, ...savedStages.map((s) => ({ ...s })));
  startFlight();
}

export function returnToStaging(): void {
  document.getElementById("pause-overlay")!.classList.remove("show");
  document.getElementById("end-overlay")!.classList.remove("show");
  setPaused(false);
  backToStaging();
}

export function showCredits(): void {
  document.getElementById("end-overlay")!.classList.remove("show");
  document.getElementById("credits-overlay")!.classList.add("show");
}

export function hideCredits(): void {
  document.getElementById("credits-overlay")!.classList.remove("show");
  document.getElementById("end-overlay")!.classList.add("show");
}

export function backToStaging(): void {
  document.getElementById("flight-screen")!.style.display = "none";
  document.getElementById("staging-screen")!.style.display = "flex";
  document.getElementById("end-overlay")!.classList.remove("show");
  if (animFrame !== null) cancelAnimationFrame(animFrame);
  setSim(null);
}

// ── HUD ──────────────────────────────────────────

export function renderHUDStages(): void {
  const s = sim!;
  const el = document.getElementById("hud-stages")!;
  el.innerHTML = "";

  for (let i = s.stages.length - 1; i >= 0; i--) {
    const st = s.stages[i];
    const pct = st.maxFuel > 0 ? (st.fuel / st.maxFuel * 100) : 0;
    let cls = "stage-hud-item";
    if (i === s.currentStage && s.flightState === "staging") cls += " active";
    if (i < s.currentStage) cls += " spent";
    const div = document.createElement("div");
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

  const chutDiv = document.createElement("div");
  const isLanding = s.flightState === "landing" || s.flightState === "landed";
  chutDiv.className = "stage-hud-item" + (isLanding ? " active" : "");
  chutDiv.innerHTML = `
    <span class="stage-label" style="font-size:13px;">☂</span>
    <div class="fuel-bar-bg"><div class="fuel-bar" style="width:${
    isLanding ? 100 : 0
  }%;background:var(--success);"></div></div>
    <span class="fuel-pct" style="font-size:9px;">${
    isLanding ? "OPEN" : "RDY"
  }</span>
  `;
  el.appendChild(chutDiv);

  if (
    s.currentStage < s.stages.length && s.stages[s.currentStage].hasLandingGear
  ) {
    const gearDiv = document.createElement("div");
    gearDiv.className = "stage-hud-item" + (s.gearDeployed ? " active" : "");
    gearDiv.innerHTML = `
      <span class="stage-label" style="font-size:11px;">⊥</span>
      <div class="fuel-bar-bg"><div class="fuel-bar" style="width:${
      s.gearDeployed ? 100 : 0
    }%;background:var(--success);"></div></div>
      <span class="fuel-pct" style="font-size:9px;">${
      s.gearDeployed ? "DOWN" : "UP"
    }</span>
    `;
    el.appendChild(gearDiv);
  }
}

function updateHUD(): void {
  const s = sim!;
  const dist = Math.sqrt(s.x * s.x + s.y * s.y);
  const alt = dist - PLANET_RADIUS;
  const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  const nx = s.x / dist, ny = s.y / dist;
  const verticalSpeed = s.vx * nx + s.vy * ny;
  const tanVx = s.vx - verticalSpeed * nx, tanVy = s.vy - verticalSpeed * ny;
  const horizontalSpeed = Math.sqrt(tanVx * tanVx + tanVy * tanVy);

  document.getElementById("hud-alt")!.textContent = formatDist(alt);
  document.getElementById("hud-vv")!.textContent =
    (verticalSpeed >= 0 ? "+" : "") + Math.round(verticalSpeed);
  document.getElementById("hud-vh")!.textContent = String(
    Math.round(horizontalSpeed),
  );

  const orb = computeOrbitalElements(s.x, s.y, s.vx, s.vy);
  document.getElementById("hud-ap")!.textContent = orb.ap === Infinity
    ? "∞"
    : (orb.ap / 1000).toFixed(1);
  document.getElementById("hud-pe")!.textContent = orb.pe < -PLANET_RADIUS
    ? "Sub"
    : (orb.pe / 1000).toFixed(1);
  document.getElementById("hud-time")!.textContent = formatTime(s.time);

  const machEl = document.getElementById("hud-mach")!;
  if (alt < ATMOSPHERE_HEIGHT && alt >= 0) {
    machEl.textContent = (spd / SPEED_OF_SOUND).toFixed(2);
  } else {
    machEl.textContent = "—";
  }

  (document.getElementById("throttle-fill")! as HTMLElement).style.height =
    (s.throttle * 100) + "%";
  document.getElementById("throttle-pct")!.textContent =
    Math.round(s.throttle * 100) + "%";

  const altMax = 200000;
  const altPct = alt <= 0
    ? 0
    : Math.min(1, Math.log(1 + alt) / Math.log(1 + altMax));
  const atmoPct = Math.log(1 + ATMOSPHERE_HEIGHT) / Math.log(1 + altMax);
  const orbitPct = Math.log(1 + ORBIT_TARGET) / Math.log(1 + altMax);
  (document.getElementById("altimeter-fill")! as HTMLElement).style.height =
    (altPct * 100) + "%";
  (document.getElementById("altimeter-needle")! as HTMLElement).style.bottom =
    (altPct * 100) + "%";
  (document.getElementById("altimeter-atmo")! as HTMLElement).style.bottom =
    (atmoPct * 100) + "%";
  (document.getElementById("altimeter-orbit")! as HTMLElement).style.bottom =
    (orbitPct * 100) + "%";
  document.getElementById("altimeter-value")!.textContent = formatDist(alt);

  s.stages.forEach((st, i) => {
    const bars = document.querySelectorAll(".stage-hud-item");
    if (!bars[i]) return;
    const pct = st.maxFuel > 0 ? (st.fuel / st.maxFuel * 100) : 0;
    const bar = bars[i].querySelector(".fuel-bar") as HTMLElement | null;
    const pctEl = bars[i].querySelector(".fuel-pct");
    if (bar) {
      bar.style.width = pct + "%";
      bar.className = "fuel-bar" + (pct < 20 ? " low" : "");
    }
    if (pctEl) pctEl.textContent = Math.round(pct) + "%";
    bars[i].className = "stage-hud-item" +
      (i === s.currentStage ? " active" : "") +
      (i < s.currentStage ? " spent" : "");
  });

  document.getElementById("view-mode")!.textContent =
    getViewMode() === "spacecraft" ? "Spacecraft View" : "Orbital View";
}

// ── Format helpers ───────────────────────────────

export function formatDist(m: number): string {
  return Math.abs(m) > 10000
    ? (m / 1000).toFixed(1) + " km"
    : Math.round(m) + " m";
}

export function formatTime(t: number): string {
  const m = Math.floor(t / 60), sec = Math.floor(t % 60);
  return m + ":" + (sec < 10 ? "0" : "") + sec;
}
