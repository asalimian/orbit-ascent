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
    renderMinimap();
  } else {
    renderOrbitalView();
    // PIP: render spacecraft view into the minimap canvas
    renderSpacecraftView(minimapCtx, minimapCanvas.width, minimapCanvas.height, true);
  }
  renderOrientationIndicator();
}

function renderOrientationIndicator() {
  const ctx = orientationCtx;
  const W = orientationCanvas.width, H = orientationCanvas.height;
  ctx.clearRect(0, 0, W, H);

  if (!sim) return;

  const cx = W / 2, cy = H / 2;
  const radius = W * 0.38;

  // Background circle
  ctx.strokeStyle = "#444";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius, 0, Math.PI * 2);
  ctx.stroke();

  // Faint crosshairs
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - radius, cy); ctx.lineTo(cx + radius, cy);
  ctx.moveTo(cx, cy - radius); ctx.lineTo(cx, cy + radius);
  ctx.stroke();

  // "Up" reference tick (radial-out from planet)
  const dist = Math.sqrt(sim.x * sim.x + sim.y * sim.y);
  const upX = sim.x / dist;   // world "up" direction (radial out)
  const upY = sim.y / dist;

  // Helper: draw an arrow from center along world direction (wx, wy)
  // canvas Y is flipped: screen Y = -world Y
  function drawVector(wx, wy, len, color, label, dashed) {
    // Project world direction to screen direction (flip Y)
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

    // Arrowhead
    const aw = 5, al = 8;
    const px = -ny, py = nx; // perpendicular
    ctx.beginPath();
    ctx.moveTo(ex, ey);
    ctx.lineTo(ex - nx * al + px * aw, ey - ny * al + py * aw);
    ctx.lineTo(ex - nx * al - px * aw, ey - ny * al - py * aw);
    ctx.closePath();
    ctx.fill();

    // Label
    if (label) {
      ctx.font = '9px "Share Tech Mono"';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const lx = cx + nx * (len + 12), ly = cy + ny * (len + 12);
      ctx.fillText(label, lx, ly);
    }
  }

  // ── Planet gravity vector (toward planet center = -up direction) ──
  const gravLen = radius * 0.55;
  drawVector(-upX, -upY, gravLen, "rgba(255,255,255,0.45)", "G♁", false);

  // ── Moon gravity vector ──
  const moon = getMoonPos(sim.time);
  const mdx = moon.x - sim.x, mdy = moon.y - sim.y;
  const moonDist = Math.sqrt(mdx * mdx + mdy * mdy);
  const moonGravMag = MOON_MU / (moonDist * moonDist);
  const planetGravMag = MU / (dist * dist);
  // Scale moon vector relative to planet gravity, clamped to reasonable range
  const moonRelScale = Math.min(0.8, Math.max(0.15, moonGravMag / planetGravMag));
  const moonLen = radius * 0.55 * moonRelScale;
  drawVector(mdx / moonDist, mdy / moonDist, moonLen, "rgba(255,255,255,0.35)", "G☽", true);

  // ── Velocity vector ──
  const speed = Math.sqrt(sim.vx * sim.vx + sim.vy * sim.vy);
  const velLen = radius * 0.75;
  if (speed > 0.1) {
    drawVector(sim.vx / speed, sim.vy / speed, velLen, "rgba(255,255,255,0.9)", "V", false);
  }

  // ── Spacecraft orientation ──
  // Thrust direction: rotate radial-out by sim.angle
  const cosA = Math.cos(sim.angle), sinA = Math.sin(sim.angle);
  const thrX = upX * cosA + upY * sinA;
  const thrY = upY * cosA - upX * sinA;
  const oriLen = radius * 0.65;
  drawVector(thrX, thrY, oriLen, "#fff", "↑", false);

  // Center dot
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function renderSpacecraftView(ctx, W, H, pip) {
  if (!ctx) { ctx = flightCtx; W = flightCanvas.width; H = flightCanvas.height; }
  ctx.clearRect(0, 0, W, H);

  if (!sim) return;

  const dist = Math.sqrt(sim.x * sim.x + sim.y * sim.y);
  const alt = dist - PLANET_RADIUS;

  // Camera: centered on spacecraft, no rotation
  const camScale = (alt < 500 ? 3 : alt < 5000 ? 2 : alt < 50000 ? 1 : 0.5) *
    (pip ? 1.0 : zoomLevel);
  const pxPerMeter = camScale;

  // worldAngle: angle of spacecraft position from +Y axis (used for rocket orientation)
  const worldAngle = Math.atan2(sim.x, sim.y);

  ctx.save();
  ctx.translate(W / 2, H / 2);

  // Background: stars
  drawStars(ctx, W, H, sim.time, sim.x, sim.y);

  // ── Planet: circular arc ──
  // Planet center in screen space (rocket is always at screen center = origin)
  const planetCX = -sim.x * pxPerMeter;
  const planetCY =  sim.y * pxPerMeter; // canvas Y is flipped

  // Draw terrain as a polyline of radially-displaced points around the arc
  // Only need to cover the visible angular range
  const angularHalfWidth = (W / pxPerMeter) / PLANET_RADIUS + 0.3; // radians visible
  const planetScreenR = PLANET_RADIUS * pxPerMeter;
  const terrainSteps = Math.ceil(angularHalfWidth * 2 * planetScreenR / 4) + 2;
  const terrainPoints = [];
  for (let i = 0; i <= terrainSteps; i++) {
    const t = i / terrainSteps;
    // Angle sweeps from -angularHalfWidth to +angularHalfWidth around worldAngle
    const ang = worldAngle + (t * 2 - 1) * angularHalfWidth;
    const r = (PLANET_RADIUS + getPlanetTerrainHeight(ang)) * pxPerMeter;
    // World → screen (canvas Y flipped)
    const sx = planetCX + Math.sin(ang) * r;
    const sy = planetCY - Math.cos(ang) * r;
    terrainPoints.push([sx, sy]);
  }

  // Surface fill (black to occlude stars below terrain)
  // Close the fill by extending far below screen
  const farY = H * 3;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.moveTo(terrainPoints[0][0], terrainPoints[0][1]);
  for (const [tx, ty] of terrainPoints) ctx.lineTo(tx, ty);
  // sweep back along the planet circle interior to close
  ctx.lineTo(planetCX, planetCY + farY);
  ctx.closePath();
  ctx.fill();

  // Terrain line
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(terrainPoints[0][0], terrainPoints[0][1]);
  for (const [tx, ty] of terrainPoints) ctx.lineTo(tx, ty);
  ctx.stroke();

  // Surface detail ticks — evenly spaced in angle, pointing radially inward
  const tickAngleSpacing = 50 / PLANET_RADIUS; // ~50 m arc spacing
  const firstTickAngle = Math.ceil((worldAngle - angularHalfWidth) / tickAngleSpacing) * tickAngleSpacing;
  for (let ang = firstTickAngle; ang <= worldAngle + angularHalfWidth; ang += tickAngleSpacing) {
    const tickIdx = Math.round(ang / tickAngleSpacing);
    const tickLen = (tickIdx % 5 === 0 ? 40 : 20);
    const th = getPlanetTerrainHeight(ang);
    const rOuter = (PLANET_RADIUS + th) * pxPerMeter;
    const rInner = rOuter - tickLen;
    const sinA = Math.sin(ang), cosA = Math.cos(ang);
    ctx.beginPath();
    ctx.moveTo(planetCX + sinA * rOuter, planetCY - cosA * rOuter);
    ctx.lineTo(planetCX + sinA * rInner, planetCY - cosA * rInner);
    ctx.stroke();
  }

  // Launch pad — at world angle=0 (launch site)
  if (alt < 2000) {
    const padTerrainH = getPlanetTerrainHeight(0);
    const padR = (PLANET_RADIUS + padTerrainH) * pxPerMeter;
    // Pad is at angle=0: sin(0)=0, cos(0)=1 → screen pos (planetCX, planetCY - padR)
    const padSX = planetCX;
    const padSY = planetCY - padR;
    const s = pxPerMeter;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(padSX - 10 * s, padSY - 1 * s, 20 * s, 1 * s);
    // Tower
    ctx.beginPath();
    ctx.moveTo(padSX - 12 * s, padSY);
    ctx.lineTo(padSX - 12 * s, padSY - 27 * s);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padSX - 12 * s, padSY - 20 * s);
    ctx.lineTo(padSX - 7 * s,  padSY - 13 * s);
    ctx.stroke();
  }

  // ── Moon: always circular ──
  const moonPos = getMoonPos(sim.time);
  const moonScreenX = (moonPos.x - sim.x) * pxPerMeter;
  const moonScreenY = -(moonPos.y - sim.y) * pxPerMeter;
  const moonScreenR = MOON_RADIUS * pxPerMeter;
  if (moonScreenR > 0.5) {
    const moonRelX = sim.x - moonPos.x;
    const moonRelY = sim.y - moonPos.y;
    const moonRelDist = Math.sqrt(moonRelX * moonRelX + moonRelY * moonRelY);
    const moonAltFromSurface = moonRelDist - MOON_RADIUS;

    // Moon center in screen space
    const moonCX = moonScreenX;
    const moonCY = moonScreenY;

    // craftAngleFromMoon: angle of spacecraft as seen from moon center
    const craftAngleFromMoon = Math.atan2(moonRelX, moonRelY);

    if (moonAltFromSurface < MOON_RADIUS * 2 && moonScreenR > 30) {
      // Close to moon: draw terrain as a circular arc around the moon
      const moonAngularHalfWidth = (W / pxPerMeter) / MOON_RADIUS + 0.3;
      const mArcPixels = moonAngularHalfWidth * 2 * moonScreenR;
      const mSteps = Math.ceil(mArcPixels / 4) + 2;
      const mPoints = [];
      for (let i = 0; i <= mSteps; i++) {
        const t = i / mSteps;
        const ang = craftAngleFromMoon + (t * 2 - 1) * moonAngularHalfWidth;
        const r = (MOON_RADIUS + getMoonTerrainHeight(ang)) * pxPerMeter;
        const sx = moonCX + Math.sin(ang) * r;
        const sy = moonCY - Math.cos(ang) * r;
        mPoints.push([sx, sy]);
      }

      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.moveTo(mPoints[0][0], mPoints[0][1]);
      for (const [tx, ty] of mPoints) ctx.lineTo(tx, ty);
      ctx.lineTo(moonCX, moonCY + H * 3);
      ctx.closePath();
      ctx.fill();

      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(mPoints[0][0], mPoints[0][1]);
      for (const [tx, ty] of mPoints) ctx.lineTo(tx, ty);
      ctx.stroke();
    } else {
      // Far from moon: circle with decorative craters
      ctx.fillStyle = "#000";
      ctx.beginPath();
      ctx.arc(moonScreenX, moonScreenY, moonScreenR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(moonScreenX, moonScreenY, moonScreenR, 0, Math.PI * 2);
      ctx.stroke();

      if (moonScreenR > 5) {
        ctx.strokeStyle = "rgba(255,255,255,0.4)";
        MOON_CRATERS.forEach(c => {
          // Place craters at 35% of moon radius so they stay inside the disc
          const cx = moonScreenX + Math.sin(c.angle) * moonScreenR * 0.35;
          const cy = moonScreenY - Math.cos(c.angle) * moonScreenR * 0.35;
          const cr = c.radius * moonScreenR * 0.6;
          ctx.beginPath();
          ctx.arc(cx, cy, cr, 0, Math.PI * 2);
          ctx.stroke();
        });
      }
    }
  }

  // Satellite
  const sat = sim.satellite;
  if (sat.alive) {
    const satelliteScreenX = (sat.x - sim.x) * pxPerMeter;
    const satelliteScreenY = -(sat.y - sim.y) * pxPerMeter;
    const satelliteScreenR = SATELLITE_RADIUS * pxPerMeter;

    // Reentry flame trail — drawn before body, in world-space coords
    const satAlt = Math.sqrt(sat.x * sat.x + sat.y * sat.y) - PLANET_RADIUS;
    if (satAlt < ATMOSPHERE_HEIGHT && satAlt >= 0) {
      const satSpeed = Math.sqrt(sat.vx * sat.vx + sat.vy * sat.vy);
      const atmoPct = 1 - satAlt / ATMOSPHERE_HEIGHT; // 0 at top, 1 at surface
      const flameIntensity = Math.min(1, satSpeed / 4000) * atmoPct;
      if (flameIntensity > 0.01) {
        // Flame trails opposite velocity direction
        const velLen = satSpeed > 0 ? satSpeed : 1;
        const tvx = -sat.vx / velLen, tvy = sat.vy / velLen; // screen-space trail direction (Y flipped)
        const flameLen = flameIntensity * 120 * pxPerMeter;
        const flameW = flameIntensity * 20 * pxPerMeter;

        ctx.save();
        ctx.translate(satelliteScreenX, satelliteScreenY);

        // Core bright streak
        const grad = ctx.createLinearGradient(0, 0, tvx * flameLen, tvy * flameLen);
        grad.addColorStop(0,   `rgba(255,255,255,${0.9 * flameIntensity})`);
        grad.addColorStop(0.2, `rgba(255,180,60,${0.7 * flameIntensity})`);
        grad.addColorStop(0.6, `rgba(255,80,20,${0.4 * flameIntensity})`);
        grad.addColorStop(1,   `rgba(255,40,0,0)`);

        // Draw as a tapered triangle
        const px = -tvy, py = tvx; // perpendicular
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(tvx * flameLen + px * flameW, tvy * flameLen + py * flameW);
        ctx.lineTo(tvx * flameLen - px * flameW, tvy * flameLen - py * flameW);
        ctx.closePath();
        ctx.fillStyle = grad;
        ctx.fill();

        // Flickery side streamers
        for (const side of [-1, 1]) {
          const jitter = (0.6 + 0.4 * Math.sin(sim.time * 18 + side * 3.7)) * flameIntensity;
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

    if (satelliteScreenR > 0.5) {
      ctx.save();
      ctx.translate(satelliteScreenX, satelliteScreenY);
      ctx.rotate(sat.rot);

      const satScale = (satelliteScreenR * 2) / 120;
      ctx.scale(satScale, satScale);

      ctx.fillStyle = "#000";
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1 / satScale;

      // Solar panels left
      ctx.beginPath();
      ctx.rect(-145, -30, 120, 60);
      ctx.fill();
      ctx.stroke();
      for (let i = -125; i < -25; i += 20) {
        ctx.moveTo(i, -30);
        ctx.lineTo(i, 30);
      }
      ctx.moveTo(-145, 0);
      ctx.lineTo(-25, 0);
      ctx.stroke();

      // Solar panels right
      ctx.beginPath();
      ctx.rect(25, -30, 120, 60);
      ctx.fill();
      ctx.stroke();
      for (let i = 45; i < 145; i += 20) {
        ctx.moveTo(i, -30);
        ctx.lineTo(i, 30);
      }
      ctx.moveTo(25, 0);
      ctx.lineTo(145, 0);
      ctx.stroke();

      // Main body
      ctx.beginPath();
      ctx.rect(-25, -60, 50, 120);
      ctx.fill();
      ctx.stroke();

      // Antenna dish
      ctx.beginPath();
      ctx.arc(0, 60, 20, 0, Math.PI, false);
      ctx.fill();
      ctx.stroke();

      ctx.restore();
    }
  }

  // Debris
  sim.debris.forEach((d) => {
    const dx = (d.x - sim.x) * pxPerMeter;
    const dy = -(d.y - sim.y) * pxPerMeter;
    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(d.rot);
    ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, d.life / 2)})`;
    ctx.lineWidth = 1;
    ctx.strokeRect(-d.size / 2, -d.size / 2, d.size, d.size);
    ctx.restore();
  });

  // Jettisoned stages — render as actual stage shapes
  sim.jettisoned.forEach((j) => {
    const jx = (j.x - sim.x) * pxPerMeter;
    const jy = -(j.y - sim.y) * pxPerMeter;
    const alpha = Math.min(1, j.life / 3);
    ctx.save();
    ctx.translate(jx, jy);
    ctx.rotate(j.rot);
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    const tank = TANK_SIZES[j.tankSize];
    const tankW = tank.width * pxPerMeter;
    const tankH = tank.height * 0.3 * pxPerMeter;
    const engH = 8 * pxPerMeter;
    // Tank
    ctx.strokeRect(-tankW / 2, -tankH - engH, tankW, tankH);
    // Engines
    const engW = 4 * pxPerMeter;
    const totalEngW = j.engines * (engW + 2) - 2;
    let jex = -totalEngW / 2;
    for (let e = 0; e < j.engines; e++) {
      ctx.beginPath();
      ctx.moveTo(jex, -engH);
      ctx.lineTo(jex - 2, 0);
      ctx.lineTo(jex + engW + 2, 0);
      ctx.lineTo(jex + engW, -engH);
      ctx.closePath();
      ctx.stroke();
      jex += engW + 2;
    }
    ctx.globalAlpha = 1;
    ctx.restore();
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

  // Spacecraft rotation applied below for the rocket stack only; particles are world-space.
  const rot = sim.angle + worldAngle;

  // Exhaust particles (world-space, outside rotated frame)
  sim.particles.forEach((p) => {
    const wx = (p.x - sim.x) * pxPerMeter;
    const wy = -(p.y - sim.y) * pxPerMeter;
    const a = p.life / p.maxLife;
    const r = p.size * a;
    ctx.strokeStyle = `rgba(255, 255, 255, ${a * 0.8})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(wx, wy, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  // RCS particles (world-space, outside rotated frame)
  sim.rcsParticles.forEach((p) => {
    const wx = (p.x - sim.x) * pxPerMeter;
    const wy = -(p.y - sim.y) * pxPerMeter;
    const a = p.life / p.maxLife;
    ctx.strokeStyle = `rgba(180, 220, 255, ${a * 0.9})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(wx, wy, 1.5 * a, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.save();
  ctx.translate(0, comY*0);
  ctx.rotate(rot);
  ctx.translate(0, -comY*0);

  const chuteDeployed = sim.flightState === "landing" || sim.flightState === "landed";
  let chuteState = "none";
  if (chuteDeployed) {
    if (sim.flightState === "landed") {
      chuteState = "collapsed";
    } else if (alt < ATMOSPHERE_HEIGHT) {
      chuteState = "inflated";
    } else {
      chuteState = "squidding";
    }
  }

  drawRocketStack(ctx, sim.stages, pxPerMeter, {
    currentStage: sim.currentStage,
    gearAnimation: sim.gearAnimation,
    throttle: sim.throttle,
    flightState: sim.flightState,
    time: sim.time,
    chuteState,
  });

  ctx.restore(); // un-rotate spacecraft
  ctx.restore(); // un-translate W/2, H/2
}

function renderOrbitalView() {
  const ctx = flightCtx;
  const W = flightCanvas.width, H = flightCanvas.height;
  ctx.clearRect(0, 0, W, H);

  if (!sim) return;

  // Draw at a scale where the planet and moon are visible
  const dist = Math.sqrt(sim.x * sim.x + sim.y * sim.y);
  const maxDim = Math.max(dist * 1.5, MOON_ORBIT_RADIUS + MOON_RADIUS * 2);
  const scale = Math.min(W, H) * 0.4 / maxDim * zoomLevel;

  ctx.save();
  ctx.translate(W / 2, H / 2);

  // Stars
  drawStars(ctx, W, H, sim.time * 0.1);

  // Predicted orbit (drawn first so planet/moon render on top)
  const orbIntercepts = drawOrbitPath(
    ctx,
    sim.x,
    sim.y,
    sim.vx,
    sim.vy,
    scale,
    "rgba(255, 255, 255, 0.5)",
  );

  // Planet (filled black + white outline)
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

  // Atmosphere ring
  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, (PLANET_RADIUS + ATMOSPHERE_HEIGHT) * scale, 0, Math.PI * 2);
  ctx.stroke();

  // Target orbit ring
  ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
  ctx.lineWidth = 1;
  ctx.setLineDash([5, 5]);
  ctx.beginPath();
  ctx.arc(0, 0, (PLANET_RADIUS + ORBIT_TARGET) * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Satellite orbit ring (only if alive and roughly circular)
  if (sim.satellite.alive) {
    ctx.strokeStyle = "rgba(255, 255, 255, 0.2)";
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 6]);
    ctx.beginPath();
    ctx.arc(0, 0, SATELLITE_ORBIT_RADIUS * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Moon orbit ring
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.arc(0, 0, MOON_ORBIT_RADIUS * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Moon (filled black + white outline)
  const moonPos2 = getMoonPos(sim.time);
  const moonX = moonPos2.x * scale;
  const moonY = -moonPos2.y * scale;
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
    const satX2 = sim.satellite.x * scale;
    const satY2 = -sim.satellite.y * scale;
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
    const achieved = sim.achievements["lagrange" + name];
    ctx.strokeStyle = achieved ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)";
    ctx.fillStyle   = achieved ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx - 6, ly); ctx.lineTo(lx + 6, ly);
    ctx.moveTo(lx, ly - 6); ctx.lineTo(lx, ly + 6);
    ctx.stroke();
    ctx.font = '9px "Share Tech Mono"';
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(name, lx + 8, ly);
  }

  // Spacecraft position
  const sx = sim.x * scale;
  const sy = -sim.y * scale;

  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sx, sy, 4, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.3)";
  ctx.beginPath();
  ctx.arc(sx, sy, 8, 0, Math.PI * 2);
  ctx.stroke();

  // Jettisoned stages on minimap
  sim.jettisoned.forEach((j) => {
    const alpha = Math.min(0.6, j.life / 3);
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(j.x * scale, -j.y * scale, 3, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Debris
  sim.debris.forEach((d) => {
    ctx.strokeStyle = "rgba(255,255,255,0.4)";
    ctx.beginPath();
    ctx.arc(d.x * scale, -d.y * scale, 2, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Ghost intercept markers
  drawInterceptMarkers(ctx, orbIntercepts, scale);

  ctx.restore();
}

// Returns { moonIntercept, satIntercept } — each is { x, y } in world coords at the
// predicted time when the spacecraft first crosses that body's orbital radius, or null.
function drawOrbitPath(ctx, x, y, vx, vy, scale, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();

  let ox = x, oy = y, ovx = vx, ovy = vy;
  const steps = 2000;
  const dt = 5; // seconds per step
  let predTime = sim ? sim.time : 0;
  let angleAccum = 0;

  let moonIntercept = null;
  let satIntercept = null;
  let prevDistToMoonOrbit = null;
  let prevDistToSatOrbit = null;

  ctx.moveTo(ox * scale, -oy * scale);

  for (let i = 0; i < steps; i++) {
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
    const cross = nx * oy - ny * ox;
    const dot   = nx * ox + ny * oy;
    angleAccum += Math.abs(Math.atan2(cross, dot));
    if (angleAccum > 3 * Math.PI) break;
    ctx.lineTo(ox * scale, -oy * scale);

    // Moon orbit crossing: detect when spacecraft passes through moon orbital radius
    if (!moonIntercept) {
      const distToMoonOrbit = Math.abs(d - MOON_ORBIT_RADIUS);
      if (prevDistToMoonOrbit !== null && distToMoonOrbit < prevDistToMoonOrbit && distToMoonOrbit < MOON_ORBIT_RADIUS * 0.08) {
        moonIntercept = getMoonPos(predTime);
      }
      prevDistToMoonOrbit = distToMoonOrbit;
    }

    // Satellite orbit crossing: detect when spacecraft passes through satellite orbital radius
    if (!satIntercept && sim.satellite.alive) {
      const distToSatOrbit = Math.abs(d - SATELLITE_ORBIT_RADIUS);
      if (prevDistToSatOrbit !== null && distToSatOrbit < prevDistToSatOrbit && distToSatOrbit < SATELLITE_ORBIT_RADIUS * 0.04) {
        satIntercept = getSatellitePos(predTime);
      }
      prevDistToSatOrbit = distToSatOrbit;
    }
  }
  ctx.stroke();

  return { moonIntercept, satIntercept };
}

function renderMinimap() {
  const ctx = minimapCtx;
  const W = minimapCanvas.width, H = minimapCanvas.height;
  ctx.clearRect(0, 0, W, H);

  if (!sim) return;

  const dist = Math.sqrt(sim.x * sim.x + sim.y * sim.y);
  const maxDim = Math.max(dist * 1.5, MOON_ORBIT_RADIUS + MOON_RADIUS * 2);
  const scale = W * 0.35 / maxDim;

  ctx.save();
  ctx.translate(W / 2, H / 2);

  // Orbit prediction (drawn first so planet/moon render on top)
  const mmIntercepts = drawOrbitPath(
    ctx,
    sim.x,
    sim.y,
    sim.vx,
    sim.vy,
    scale,
    "rgba(255,255,255,0.35)",
  );

  // Planet (filled black + white outline)
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

  // Atmosphere
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, (PLANET_RADIUS + ATMOSPHERE_HEIGHT) * scale, 0, Math.PI * 2);
  ctx.stroke();

  // Target orbit
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.arc(0, 0, (PLANET_RADIUS + ORBIT_TARGET) * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Satellite orbit ring (only if alive)
  if (sim.satellite.alive) {
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.setLineDash([1, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, SATELLITE_ORBIT_RADIUS * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Moon orbit
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.arc(0, 0, MOON_ORBIT_RADIUS * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);

  // Moon (filled black + white outline)
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

  // Satellite marker
  if (sim.satellite.alive) {
    const satMMx = sim.satellite.x * scale;
    const satMMy = -sim.satellite.y * scale;
    ctx.strokeStyle = "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(satMMx - 3, satMMy);
    ctx.lineTo(satMMx + 3, satMMy);
    ctx.moveTo(satMMx, satMMy - 3);
    ctx.lineTo(satMMx, satMMy + 3);
    ctx.stroke();
  }

  // Lagrange points (minimap)
  const lpMM = getLagrangePoints(sim.time);
  for (const [name, point] of Object.entries(lpMM)) {
    const lx = point.x * scale, ly = -point.y * scale;
    const achieved = sim.achievements["lagrange" + name];
    ctx.strokeStyle = achieved ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(lx - 3, ly); ctx.lineTo(lx + 3, ly);
    ctx.moveTo(lx, ly - 3); ctx.lineTo(lx, ly + 3);
    ctx.stroke();
  }

  // Spacecraft
  const sx = sim.x * scale;
  const sy = -sim.y * scale;
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(sx, sy, 3, 0, Math.PI * 2);
  ctx.stroke();

  // Jettisoned stages on minimap
  sim.jettisoned.forEach((j) => {
    const alpha = Math.min(0.5, j.life / 3);
    ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
    ctx.beginPath();
    ctx.arc(j.x * scale, -j.y * scale, 2, 0, Math.PI * 2);
    ctx.stroke();
  });

  // Ghost intercept markers
  drawInterceptMarkers(ctx, mmIntercepts, scale);

  ctx.restore();
}

function drawInterceptMarkers(ctx, intercepts, scale) {
  if (!intercepts) return;

  // Moon intercept ghost
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

  // Satellite intercept ghost
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

let starPositions = null;
function drawStars(ctx, W, H, time, ox, oy) {
  if (!starPositions) {
    starPositions = [];
    starPositions.push({
      x: 0,
      y: 2000,
      s: .5,
      b: 1,
    }); // north star for orientation
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
  const offX = (ox || 0) * parallax;
  const offY = (oy || 0) * parallax;
  const wrapW = 3000, wrapH = 3000;

  starPositions.forEach((star) => {
    const flicker = star.b + Math.sin(time * 2 + star.x) * 0.1;
    ctx.fillStyle = `rgba(255, 255, 255, ${Math.max(0, flicker)})`;
    let sx = ((star.x - offX) % wrapW + wrapW * 1.5) % wrapW - wrapW / 2;
    let sy = ((star.y + offY) % wrapH + wrapH * 1.5) % wrapH - wrapH / 2;
    ctx.fillRect(sx, sy, 1, 1);
  });
}
