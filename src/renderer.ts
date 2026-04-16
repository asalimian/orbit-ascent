// ═══════════════════════════════════════════════
// RENDERING
// ═══════════════════════════════════════════════
import {
  ATMOSPHERE_HEIGHT,
  getLagrangePoints,
  getMoonPos,
  getSatellitePos,
  MOON_MU,
  MOON_ORBIT_RADIUS,
  MOON_RADIUS,
  MOON_ROTATION_ANGLE,
  MU,
  ORBIT_TARGET,
  PLANET_RADIUS,
  PLANET_ROTATION_ANGLE,
  SATELLITE_ORBIT_RADIUS,
  SPEED_OF_SOUND,
} from "./constants.ts";
import {
  drawDebrisPiece,
  drawJettisonedStage,
  drawMoon,
  drawPlanet,
  drawSatellite,
  drawSpacecraft,
  spacecraftComOffset,
} from "./bodies.ts";
import { sim } from "./state.ts";
import { getViewMode, getZoomLevel } from "./state.ts";
import {
  flightCanvas,
  flightCtx,
  minimapCanvas,
  minimapCtx,
  orientationCanvas,
  orientationCtx,
  setRenderFn,
  setResizeCanvasFn,
} from "./simulation.ts";
import type { Achievements, ChuteState } from "./types.ts";

// ── resizeCanvas ─────────────────────────────────

function resizeCanvas(): void {
  flightCanvas.width = window.innerWidth;
  flightCanvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);

// ── render ───────────────────────────────────────

function render(): void {
  if (getViewMode() === "spacecraft") {
    renderSpacecraftView();
    renderMinimap();
  } else {
    renderOrbitalView();
    renderSpacecraftView(
      minimapCtx,
      minimapCanvas.width,
      minimapCanvas.height,
      true,
    );
  }
  renderOrientationIndicator();
}

// ── Orientation indicator ─────────────────────────

function renderOrientationIndicator(): void {
  const ctx = orientationCtx;
  const W = orientationCanvas.width, H = orientationCanvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!sim) return;

  const cx = W / 2, cy = H / 2;
  const radius = W * 0.38;

  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy);
  ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius);
  ctx.lineTo(cx, cy + radius);
  ctx.stroke();

  const dist = Math.sqrt(sim.x * sim.x + sim.y * sim.y);
  const upX = sim.x / dist, upY = sim.y / dist;

  function drawVector(
    wx: number,
    wy: number,
    len: number,
    color: string,
    label: string | null,
    dashed: boolean,
  ): void {
    const sx = wx, sy = -wy;
    const mag = Math.sqrt(sx * sx + sy * sy);
    if (mag < 1e-10) return;
    const nx = sx / mag, ny = sy / mag;
    const ex = cx + nx * len, ey = cy + ny * len;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    if (dashed) ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
    ctx.setLineDash([]);
    const aw = 5, al = 8;
    const px = -ny, py = nx;
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - nx * al + px * aw, ey - ny * al + py * aw);
    ctx.lineTo(ex - nx * al - px * aw, ey - ny * al - py * aw);
    ctx.closePath();
    ctx.fill();
    if (label) {
      ctx.font = '9px "Share Tech Mono"';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, cx + nx * (len + 12), cy + ny * (len + 12));
    }
  }

  const gravLen = radius * 0.55;
  drawVector(-upX, -upY, gravLen, "rgba(255,255,255,0.45)", "G♁", false);

  const moon = getMoonPos(sim.time);
  const mdx = moon.x - sim.x, mdy = moon.y - sim.y;
  const moonDist = Math.sqrt(mdx * mdx + mdy * mdy);
  const moonGravMag = MOON_MU / (moonDist * moonDist);
  const planetGravMag = MU / (dist * dist);
  const moonRelScale = Math.min(
    0.8,
    Math.max(0.15, moonGravMag / planetGravMag),
  );
  drawVector(
    mdx / moonDist,
    mdy / moonDist,
    radius * 0.55 * moonRelScale,
    "rgba(255,255,255,0.35)",
    "G☽",
    true,
  );

  const spd = Math.sqrt(sim.vx * sim.vx + sim.vy * sim.vy);
  if (spd > 0.1) {
    drawVector(
      sim.vx / spd,
      sim.vy / spd,
      radius * 0.75,
      "rgba(255,255,255,0.9)",
      "V",
      false,
    );
  }

  const thrX = Math.sin(sim.angle);
  const thrY = Math.cos(sim.angle);
  drawVector(thrX, thrY, radius * 0.65, "#fff", "↑", false);

  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

// ── renderSpacecraftView ──────────────────────────

function renderSpacecraftView(
  ctx: CanvasRenderingContext2D = flightCtx,
  W: number = flightCanvas.width,
  H: number = flightCanvas.height,
  pip: boolean = false,
): void {
  ctx.clearRect(0, 0, W, H);
  if (!sim) return;
  const s = sim;

  const dist = Math.sqrt(s.x * s.x + s.y * s.y);
  const alt = dist - PLANET_RADIUS;

  const camScale = (alt < 500 ? 3 : alt < 5000 ? 2 : alt < 50000 ? 1 : 0.5) *
    (pip ? 1.0 : getZoomLevel());
  const pxPerMeter = camScale;
  const worldAngle = Math.atan2(s.x, s.y);

  const atmoPct = (alt >= 0 && alt < ATMOSPHERE_HEIGHT)
    ? 1 - alt / ATMOSPHERE_HEIGHT
    : 0;

  ctx.save();
  ctx.translate(W / 2, H / 2);

  drawStars(ctx, W, H, s.time, s.x, s.y, atmoPct);

  // Planet
  ctx.save();
  ctx.translate(-s.x * pxPerMeter, s.y * pxPerMeter);
  ctx.rotate(PLANET_ROTATION_ANGLE);
  drawPlanet(ctx, { worldAngle, pxPerMeter, W, H, simX: s.x, simY: s.y });
  ctx.restore();

  // Moon
  const moonPos = getMoonPos(s.time);
  const moonScreenX = (moonPos.x - s.x) * pxPerMeter;
  const moonScreenY = -(moonPos.y - s.y) * pxPerMeter;
  const moonRelX = s.x - moonPos.x;
  const moonRelY = s.y - moonPos.y;
  const moonRelDist = Math.sqrt(moonRelX * moonRelX + moonRelY * moonRelY);
  const craftAngleFromMoon = Math.atan2(moonRelX, moonRelY);
  ctx.save();
  ctx.translate(moonScreenX, moonScreenY);
  ctx.rotate(MOON_ROTATION_ANGLE);
  drawMoon(ctx, {
    craftAngleFromMoon,
    pxPerMeter,
    W,
    H,
    moonAltFromSurface: moonRelDist - MOON_RADIUS,
    simTime: s.time,
  });
  ctx.restore();

  // Satellite
  const sat = s.satellite;
  if (sat.alive) {
    const satelliteScreenX = (sat.x - s.x) * pxPerMeter;
    const satelliteScreenY = -(sat.y - s.y) * pxPerMeter;

    const satAlt = Math.sqrt(sat.x * sat.x + sat.y * sat.y) - PLANET_RADIUS;
    if (satAlt < ATMOSPHERE_HEIGHT && satAlt >= 0) {
      const satSpeed = Math.sqrt(sat.vx * sat.vx + sat.vy * sat.vy);
      const atmoPct = 1 - satAlt / ATMOSPHERE_HEIGHT;
      const flameIntensity = Math.min(1, satSpeed / 4000) * atmoPct;
      if (flameIntensity > 0.01) {
        const tvx = -sat.vx / satSpeed, tvy = sat.vy / satSpeed;
        const flameLen = flameIntensity * 120 * pxPerMeter;
        const flameW = flameIntensity * 20 * pxPerMeter;
        ctx.save();
        ctx.translate(satelliteScreenX, satelliteScreenY);
        const grad = ctx.createLinearGradient(
          0,
          0,
          tvx * flameLen,
          tvy * flameLen,
        );
        grad.addColorStop(0, `rgba(255,255,255,${0.9 * flameIntensity})`);
        grad.addColorStop(0.2, `rgba(255,180,60,${0.7 * flameIntensity})`);
        grad.addColorStop(0.6, `rgba(255,80,20,${0.4 * flameIntensity})`);
        grad.addColorStop(1, "rgba(255,40,0,0)");
        const px = -tvy, py = tvx;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(tvx * flameLen + px * flameW, tvy * flameLen + py * flameW);
        ctx.lineTo(tvx * flameLen - px * flameW, tvy * flameLen - py * flameW);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();
        for (const side of [-1, 1] as const) {
          const jitter = (0.6 + 0.4 * Math.sin(s.time * 18 + side * 3.7)) *
            flameIntensity;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(
            tvx * flameLen * 0.7 + px * side * flameW * 1.5,
            tvy * flameLen * 0.7 + py * side * flameW * 1.5,
          );
          ctx.strokeStyle = `rgba(255,120,20,${0.35 * jitter})`;
          ctx.lineWidth = flameW * 0.4;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    ctx.save();
    ctx.translate(satelliteScreenX, satelliteScreenY);
    ctx.rotate(sat.rot);
    drawSatellite(ctx, pxPerMeter);
    ctx.restore();
  }

  // Debris
  s.debris.forEach((d) => {
    ctx.save();
    ctx.translate((d.x - s.x) * pxPerMeter, -(d.y - s.y) * pxPerMeter);
    ctx.rotate(d.rot);
    drawDebrisPiece(ctx, d);
    ctx.restore();
  });

  // Jettisoned stages
  s.jettisoned.forEach((j) => {
    ctx.save();
    ctx.translate((j.x - s.x) * pxPerMeter, -(j.y - s.y) * pxPerMeter);
    ctx.rotate(j.rot);
    ctx.globalAlpha = Math.min(1, j.life / 3);
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    drawJettisonedStage(ctx, j, pxPerMeter);
    ctx.globalAlpha = 1;
    ctx.restore();
  });

  // Exhaust particles
  s.particles.forEach((p) => {
    const wx = (p.x - s.x) * pxPerMeter;
    const wy = -(p.y - s.y) * pxPerMeter;
    const a = p.life / p.maxLife;
    ctx.strokeStyle = `rgba(255, 255, 255, ${a * 0.8})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(wx, wy, p.size * a, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Spacecraft
  const rot = s.angle;
  const comOffset = spacecraftComOffset(s.stages, s.currentStage, pxPerMeter);

  const chuteDeployed = s.flightState === "landing" ||
    s.flightState === "landed";
  let chuteState: ChuteState = "none";
  if (chuteDeployed) {
    if (s.flightState === "landed") chuteState = "collapsed";
    else if (alt < ATMOSPHERE_HEIGHT) chuteState = "inflated";
    else chuteState = "squidding";
  }

  const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  const retrogradeAngle = spd > 0.1 ? Math.atan2(-s.vx, -s.vy) : 0;
  const chuteAngle = retrogradeAngle - rot;
  
  const contrailMach = spd / SPEED_OF_SOUND;
  const contrailAirDensity = 1.2 * Math.exp(-alt / 8500);
  const contrailDynPressure = 0.5 * contrailAirDensity * spd * spd;
  const contrailIntensity = (alt < ATMOSPHERE_HEIGHT && alt >= 0 && spd > 50)
    ? Math.min(1, contrailDynPressure / 15000)
    : 0;
  
  ctx.save();
  ctx.rotate(rot);
  ctx.translate(0, -comOffset);
  drawSpacecraft(ctx, s.stages, pxPerMeter, {
    currentStage: s.currentStage,
    gearAnimation: s.gearAnimation,
    throttle: s.throttle,
    flightState: s.flightState,
    time: s.time,
    chuteState,
    chuteAngle: chuteAngle,
    rcsActive: s.rcsActive,
    contrailAngle: chuteAngle,
    contrailIntensity,
    mach: contrailIntensity > 0.01 || contrailMach > 1 ? contrailMach : 0,
  });
  ctx.restore();
  ctx.restore();

  // Atmosphere vignette — screen-space radial gradient, fades in with density
  if (atmoPct > 0 && !pip) {
    const grad = ctx.createRadialGradient(
      W / 2,
      H / 2,
      H * 0.2,
      W / 2,
      H / 2,
      H * 0.85,
    );
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(1, `rgba(255,255,255,${(atmoPct * 0.18).toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
}

// ── renderOrbitalView ────────────────────────────

function renderOrbitalView(): void {
  const ctx = flightCtx;
  const W = flightCanvas.width, H = flightCanvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!sim) return;

  const dist = Math.sqrt(sim.x * sim.x + sim.y * sim.y);
  const maxDim = Math.max(dist * 1.5, MOON_ORBIT_RADIUS + MOON_RADIUS * 2);
  const scale = Math.min(W, H) * 0.4 / maxDim * getZoomLevel();

  drawStars(ctx, W, H, sim.time * 0.1, sim.x, sim.y);

  ctx.save();
  ctx.translate(W / 2 - sim.x * scale, H / 2 + sim.y * scale);

  const orbIntercepts = drawOrbitPath(
    ctx,
    sim.x,
    sim.y,
    sim.vx,
    sim.vy,
    scale,
    "rgba(255,255,255,0.5)",
  );

  // Planet
  const pr = PLANET_RADIUS * scale;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(0, 0, pr, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, pr, 0, Math.PI * 2);
  ctx.stroke();

  // Atmosphere
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, (PLANET_RADIUS + ATMOSPHERE_HEIGHT) * scale, 0, Math.PI * 2);
  ctx.stroke();

  // Target orbit
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(0, 0, (PLANET_RADIUS + ORBIT_TARGET) * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Satellite orbit
  if (sim.satellite.alive) {
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, SATELLITE_ORBIT_RADIUS * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Moon orbit
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, MOON_ORBIT_RADIUS * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Moon
  const moonPos2 = getMoonPos(sim.time);
  const moonX = moonPos2.x * scale, moonY = -moonPos2.y * scale;
  const moonR = Math.max(MOON_RADIUS * scale, 3);
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(moonX, moonY, moonR, 0, Math.PI * 2);
  ctx.stroke();

  // Satellite marker
  if (sim.satellite.alive) {
    const satX2 = sim.satellite.x * scale, satY2 = -sim.satellite.y * scale;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(satX2 - 5, satY2);
    ctx.lineTo(satX2 + 5, satY2);
    ctx.moveTo(satX2, satY2 - 5);
    ctx.lineTo(satX2, satY2 + 5);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(satX2, satY2, 3, 0, Math.PI * 2);
    ctx.stroke();
  }

  // Lagrange points
  const lagrangePoints = getLagrangePoints(sim.time);
  for (const [name, point] of Object.entries(lagrangePoints)) {
    const lx = point.x * scale, ly = -point.y * scale;
    const achieved =
      sim.achievements[("lagrange" + name) as keyof Achievements];
    ctx.strokeStyle = achieved
      ? "rgba(255,255,255,0.8)"
      : "rgba(255,255,255,0.25)";
    ctx.fillStyle = achieved
      ? "rgba(255,255,255,0.8)"
      : "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx - 6, ly);
    ctx.lineTo(lx + 6, ly);
    ctx.moveTo(lx, ly - 6);
    ctx.lineTo(lx, ly + 6);
    ctx.stroke();
    ctx.font = '9px "Share Tech Mono"';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(name, lx + 8, ly);
  }

  // Spacecraft
  const sx = sim.x * scale, sy = -sim.y * scale;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sx, sy, 4, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.beginPath();
  ctx.arc(sx, sy, 8, 0, Math.PI * 2);
  ctx.stroke();

  sim.jettisoned.forEach((j) => {
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.6, j.life / 3)})`;
    ctx.beginPath();
    ctx.arc(j.x * scale, -j.y * scale, 3, 0, Math.PI * 2);
    ctx.stroke();
  });
  sim.debris.forEach((d) => {
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.arc(d.x * scale, -d.y * scale, 2, 0, Math.PI * 2);
    ctx.stroke();
  });

  drawInterceptMarkers(ctx, orbIntercepts, scale);
  ctx.restore();
}

// ── drawOrbitPath ────────────────────────────────

interface Intercepts {
  moonIntercept: { x: number; y: number } | null;
  satIntercept: { x: number; y: number } | null;
}

function drawOrbitPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  vx: number,
  vy: number,
  scale: number,
  color: string,
): Intercepts {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  let ox = x, oy = y, ovx = vx, ovy = vy;
  const dt = 5;
  let predTime = sim ? sim.time : 0;
  let angleAccum = 0;
  let moonIntercept: { x: number; y: number } | null = null;
  let satIntercept: { x: number; y: number } | null = null;
  let prevDistToMoonOrbit: number | null = null;
  let prevDistToSatOrbit: number | null = null;

  ctx.moveTo(ox * scale, -oy * scale);

  for (let i = 0; i < 2000; i++) {
    const d = Math.sqrt(ox * ox + oy * oy);
    if (d < PLANET_RADIUS * 0.95) break;
    const gMag = MU / (d * d);
    ovx -= gMag * (ox / d) * dt;
    ovy -= gMag * (oy / d) * dt;
    predTime += dt;
    const mp = getMoonPos(predTime);
    const mmx = ox - mp.x, mmy = oy - mp.y;
    const md = Math.sqrt(mmx * mmx + mmy * mmy);
    if (md < MOON_RADIUS * 0.95) break;
    const mgMag = MOON_MU / (md * md);
    ovx -= mgMag * (mmx / md) * dt;
    ovy -= mgMag * (mmy / md) * dt;
    const nx = ox, ny = oy;
    ox += ovx * dt;
    oy += ovy * dt;
    angleAccum += Math.abs(Math.atan2(nx * oy - ny * ox, nx * ox + ny * oy));
    if (angleAccum > 3 * Math.PI) break;
    ctx.lineTo(ox * scale, -oy * scale);

    if (!moonIntercept) {
      const dtm = Math.abs(d - MOON_ORBIT_RADIUS);
      if (
        prevDistToMoonOrbit !== null && dtm < prevDistToMoonOrbit &&
        dtm < MOON_ORBIT_RADIUS * 0.08
      ) {
        moonIntercept = getMoonPos(predTime);
      }
      prevDistToMoonOrbit = dtm;
    }
    if (!satIntercept && sim?.satellite.alive) {
      const dts = Math.abs(d - SATELLITE_ORBIT_RADIUS);
      if (
        prevDistToSatOrbit !== null && dts < prevDistToSatOrbit &&
        dts < SATELLITE_ORBIT_RADIUS * 0.04
      ) {
        satIntercept = getSatellitePos(predTime);
      }
      prevDistToSatOrbit = dts;
    }
  }
  ctx.stroke();
  return { moonIntercept, satIntercept };
}

// ── renderMinimap ────────────────────────────────

function renderMinimap(): void {
  const ctx = minimapCtx;
  const W = minimapCanvas.width, H = minimapCanvas.height;
  ctx.clearRect(0, 0, W, H);
  if (!sim) return;

  const dist = Math.sqrt(sim.x * sim.x + sim.y * sim.y);
  const maxDim = Math.max(dist * 1.5, MOON_ORBIT_RADIUS + MOON_RADIUS * 2);
  const scale = W * 0.35 / maxDim;

  ctx.save();
  ctx.translate(W / 2, H / 2);

  const mmIntercepts = drawOrbitPath(
    ctx,
    sim.x,
    sim.y,
    sim.vx,
    sim.vy,
    scale,
    "rgba(255,255,255,0.35)",
  );

  const pr = PLANET_RADIUS * scale;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(pr, 3), 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, Math.max(pr, 3), 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, (PLANET_RADIUS + ATMOSPHERE_HEIGHT) * scale, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(0, 0, (PLANET_RADIUS + ORBIT_TARGET) * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  if (sim.satellite.alive) {
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.setLineDash([1, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, SATELLITE_ORBIT_RADIUS * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.arc(0, 0, MOON_ORBIT_RADIUS * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  const mmPos = getMoonPos(sim.time);
  const mmR = Math.max(MOON_RADIUS * scale, 2);
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(mmPos.x * scale, -mmPos.y * scale, mmR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(mmPos.x * scale, -mmPos.y * scale, mmR, 0, Math.PI * 2);
  ctx.stroke();

  if (sim.satellite.alive) {
    const satMMx = sim.satellite.x * scale, satMMy = -sim.satellite.y * scale;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(satMMx - 3, satMMy);
    ctx.lineTo(satMMx + 3, satMMy);
    ctx.moveTo(satMMx, satMMy - 3);
    ctx.lineTo(satMMx, satMMy + 3);
    ctx.stroke();
  }

  const lpMM = getLagrangePoints(sim.time);
  for (const [name, point] of Object.entries(lpMM)) {
    const lx = point.x * scale, ly = -point.y * scale;
    const achieved =
      sim.achievements[("lagrange" + name) as keyof Achievements];
    ctx.strokeStyle = achieved
      ? "rgba(255,255,255,0.7)"
      : "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx - 3, ly);
    ctx.lineTo(lx + 3, ly);
    ctx.moveTo(lx, ly - 3);
    ctx.lineTo(lx, ly + 3);
    ctx.stroke();
  }

  const sx = sim.x * scale, sy = -sim.y * scale;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sx, sy, 3, 0, Math.PI * 2);
  ctx.stroke();

  sim.jettisoned.forEach((j) => {
    ctx.strokeStyle = `rgba(255,255,255,${Math.min(0.5, j.life / 3)})`;
    ctx.beginPath();
    ctx.arc(j.x * scale, -j.y * scale, 2, 0, Math.PI * 2);
    ctx.stroke();
  });

  drawInterceptMarkers(ctx, mmIntercepts, scale);
  ctx.restore();
}

// ── drawInterceptMarkers ─────────────────────────

function drawInterceptMarkers(
  ctx: CanvasRenderingContext2D,
  intercepts: Intercepts,
  scale: number,
): void {
  if (intercepts.moonIntercept) {
    const { x, y } = intercepts.moonIntercept;
    const r = Math.max(MOON_RADIUS * scale, 3);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(x * scale, -y * scale, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (intercepts.satIntercept) {
    const { x, y } = intercepts.satIntercept;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x * scale - 6, -y * scale);
    ctx.lineTo(x * scale + 6, -y * scale);
    ctx.moveTo(x * scale, -y * scale - 6);
    ctx.lineTo(x * scale, -y * scale + 6);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x * scale, -y * scale, 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

// ── drawStars ────────────────────────────────────

interface StarPos {
  x: number;
  y: number;
  s: number;
  b: number;
}
let starPositions: StarPos[] | null = null;

function drawStars(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  time: number,
  ox = 0,
  oy = 0,
  atmoPct = 0,
): void {
  if (!starPositions) {
    starPositions = [{ x: 0, y: 2000, s: 0.5, b: 1 }]; // north star
    for (let i = 0; i < 200; i++) {
      starPositions.push({
        x: (Math.random() - 0.5) * 3000,
        y: (Math.random() - 0.5) * 3000,
        s: Math.random() * 1.5 + 0.5,
        b: Math.random() * 0.5 + 0.5,
      });
    }
  }
  const parallax = 0.0005;
  const offX = ox * parallax, offY = oy * parallax;
  const wrapW = 3000, wrapH = 3000;
  const fade = 1 - atmoPct * 0.95;
  starPositions.forEach((star) => {
    const flicker = (star.b + Math.sin(time * 2 + star.x) * 0.1) * fade;
    if (flicker <= 0) return;
    ctx.fillStyle = `rgba(255,255,255,${flicker.toFixed(3)})`;
    const sx = ((star.x - offX) % wrapW + wrapW * 1.5) % wrapW - wrapW / 2;
    const sy = ((star.y + offY) % wrapH + wrapH * 1.5) % wrapH - wrapH / 2;
    ctx.fillRect(sx, sy, 1, 1);
  });
}

// Register render and resize functions with simulation
setRenderFn(render);
setResizeCanvasFn(resizeCanvas);
