// ═══════════════════════════════════════════════
// BODY RENDERERS
// ═══════════════════════════════════════════════
// Each function draws in its own local frame.
// The caller is responsible for ctx.save/translate/rotate/restore
// to place the body in screen space.
//
// Spacecraft local frame (draw-space):
//   Origin: capsule nose tip
//   +Y: toward engine (down-screen before world rotation)
//   +X: right
//   Note: this is Y-flipped relative to the physics Spacecraft frame
//   (where +Y is toward capsule). The inversion is the standard
//   canvas convention; world-space callers negate Y when projecting.
//
// Planet / Moon local frame:
//   Origin: body center
//   Angles measured from +Y axis (radially up = launch-site direction)
//   Body self-rotation applied by caller via ctx.rotate(BODY_ROTATION_ANGLE)
// ═══════════════════════════════════════════════

// ── Spacecraft ──────────────────────────────────

// Returns the total height of the remaining rocket stack in meters
// (nose to nozzle tip), independent of scale.
function spacecraftTotalHeight(stagesArr, currentStage) {
  const capH = 15, engH = 8;
  let h = capH;
  for (let i = currentStage; i < stagesArr.length; i++) {
    h += TANK_SIZES[stagesArr[i].tankSize].height * 0.3 + engH;
  }
  return h;
}

// Returns the Y offset from the nose (in draw-space, +Y toward engine)
// to the center of mass, given the remaining stages.
// Used by callers that want to rotate around the CoM.
function spacecraftComOffset(stagesArr, currentStage, pxPerMeter) {
  const s = pxPerMeter;
  const engH = 8 * s;

  // Compute capsule dimensions
  const topTank = TANK_SIZES[stagesArr[stagesArr.length - 1].tankSize];
  const capH = 15 * s;

  // First pass: compute total height of remaining stack from nose
  // In draw-space, nose is at Y=0, then capsule body spans [0, capH],
  // then stages extend further down.
  let scanY = capH; // Y of bottom of capsule = top of first stage
  const stageOffsets = []; // Y of bottom of each stage's engine nozzle (= baseY in old frame)
  for (let i = stagesArr.length - 1; i >= currentStage; i--) {
    const tank = TANK_SIZES[stagesArr[i].tankSize];
    const tankH = tank.height * 0.3 * s;
    stageOffsets[i] = { topY: scanY, tankH, engH };
    scanY += tankH + engH;
  }

  // Second pass: compute CoM
  let comY = 0, comMass = 0;

  // Capsule: center at capH/2
  comY += (capH / 2) * CAPSULE_MASS;
  comMass += CAPSULE_MASS;

  for (let i = stagesArr.length - 1; i >= currentStage; i--) {
    const stage = stagesArr[i];
    const { topY, tankH } = stageOffsets[i];
    const stageCenter = topY + (tankH + engH) / 2;
    const stageMass = stage.dryMass + stage.fuel;
    comY += stageCenter * stageMass;
    comMass += stageMass;
  }

  return comY / comMass;
}

// Draws the full spacecraft in the Spacecraft local frame.
// Origin: capsule nose tip. +Y toward engine (down-screen).
// Works for both the VAB staging preview and the flight screen.
//
// opts: { currentStage, ghostAlpha, fuelFractions, gearAnimation,
//         throttle, flightState, time, chuteState, showLabel }
// chuteState: 'none' | 'inflated' | 'squidding' | 'collapsed'
function drawSpacecraft(ctx, stagesArr, pxPerMeter, opts = {}) {
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
    rcsActive     = null,
  } = opts;

  const s = pxPerMeter;
  const engH = 8 * s;

  // Capsule dimensions
  const topTank = TANK_SIZES[stagesArr[stagesArr.length - 1].tankSize];
  const capW = topTank.width * s;
  const capH = 15 * s;

  // In draw-space: nose at Y=0, capsule base at Y=capH,
  // stages stack downward from there.
  // stageData[i].topY = Y of the top edge of that stage (below capsule or prior stage).
  const stageData = [];
  let scanY = capH;
  for (let i = stagesArr.length - 1; i >= currentStage; i--) {
    const tank = TANK_SIZES[stagesArr[i].tankSize];
    const tankH = tank.height * 0.3 * s;
    const tankW = tank.width * s;
    stageData[i] = { topY: scanY, tankH, tankW, engH };
    scanY += tankH + engH;
  }
  // scanY is now the Y of the bottom of the lowest nozzle

  ctx.globalAlpha = ghostAlpha;

  // ── Parachute (above nose, so negative Y) ──
  if (chuteState !== "none") {
    const lineBase = 0; // nose tip
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;

    if (chuteState === "collapsed") {
      const bundleW = capW * 0.4;
      const bundleY = -3 * s; // above nose
      ctx.beginPath();
      ctx.moveTo(-bundleW / 2, bundleY);
      ctx.lineTo( bundleW / 2, bundleY);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.moveTo(-capW / 4, lineBase); ctx.lineTo(-bundleW / 3, bundleY);
      ctx.moveTo( capW / 4, lineBase); ctx.lineTo( bundleW / 3, bundleY);
      ctx.moveTo(0, lineBase);         ctx.lineTo(0, bundleY);
      ctx.stroke();

    } else if (chuteState === "inflated") {
      const chuteW = 30 * s;
      const chuteH = 20 * s;
      const chuteTop = -(chuteH + 12 * s); // above nose
      const sway = Math.sin(time * 2) * 1.5 * s;

      ctx.beginPath();
      ctx.moveTo(-capW / 4, lineBase); ctx.lineTo(-chuteW / 2, chuteTop + chuteH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo( capW / 4, lineBase); ctx.lineTo( chuteW / 2, chuteTop + chuteH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, lineBase); ctx.lineTo(0, chuteTop + chuteH);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-chuteW / 2, chuteTop + chuteH);
      ctx.quadraticCurveTo(-chuteW / 2 + sway, chuteTop - chuteH * 0.2, sway, chuteTop);
      ctx.quadraticCurveTo( chuteW / 2 + sway, chuteTop - chuteH * 0.2, chuteW / 2, chuteTop + chuteH);
      ctx.stroke();

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
      const streamW = 4 * s;
      const streamH = 28 * s;
      const streamTop = -(streamH + 6 * s); // above nose
      const flap = Math.sin(time * 8) * 2 * s;

      ctx.beginPath();
      ctx.moveTo(0, lineBase);
      ctx.lineTo(0, streamTop + streamH);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-streamW / 2, streamTop + streamH);
      ctx.lineTo(-streamW / 2 + flap, streamTop);
      ctx.lineTo( streamW / 2 + flap, streamTop);
      ctx.lineTo( streamW / 2, streamTop + streamH);
      ctx.stroke();

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

  // ── Capsule ──
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-capW / 2, capH);       // bottom-left
  ctx.lineTo(-capW / 3, 0);          // nose-left
  ctx.lineTo( capW / 3, 0);          // nose-right
  ctx.lineTo( capW / 2, capH);       // bottom-right
  ctx.closePath();
  ctx.stroke();
  // Capsule window
  ctx.beginPath();
  ctx.arc(0, capH * 0.37, 2.5 * s, 0, Math.PI * 2);
  ctx.stroke();

  // ── Stages (top-down so fairings occlude nozzles below) ──
  for (let i = stagesArr.length - 1; i >= currentStage; i--) {
    const stage = stagesArr[i];
    const { topY, tankH, tankW } = stageData[i];
    const nozzleY = topY + tankH + engH; // Y of nozzle exit
    const isActive = i === currentStage;

    // Interstage fairing (between this stage and the one above)
    if (i + 1 < stagesArr.length) {
      const aboveW = stageData[i + 1].tankW;
      ctx.beginPath();
      ctx.moveTo(-tankW  / 2, topY);
      ctx.lineTo(-aboveW / 2, topY - engH);
      ctx.lineTo( aboveW / 2, topY - engH);
      ctx.lineTo( tankW  / 2, topY);
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
    ctx.strokeRect(-tankW / 2, topY, tankW, tankH);

    // Tank size label (staging preview only)
    if (showLabel) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `${Math.max(8, 10 * s)}px "Share Tech Mono"`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(stage.tankSize, 0, topY + tankH / 2);
      ctx.restore();
    }

    // Fuel level line
    const fuelFrac = fuelFractions
      ? fuelFractions[i]
      : (stage.fuel != null ? stage.fuel / stage.maxFuel : 1);
    if (fuelFrac > 0 && fuelFrac < 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.setLineDash([3, 3]);
      const fuelY = topY + tankH * (1 - fuelFrac);
      ctx.beginPath();
      ctx.moveTo(-tankW / 2 + 1, fuelY);
      ctx.lineTo( tankW / 2 - 1, fuelY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Decoupler ring (at top of stage, between tank and fairing)
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(-tankW / 2 - 3, topY - 2, tankW + 6, 3);

    // Engines — spaced evenly across the tank width
    const engW  = 4 * s;
    const engGap = stage.engines > 1
      ? (tankW - stage.engines * (engW*1.1)) / (stage.engines - 1)
      : 0;
    let ex = -((stage.engines * engW + (stage.engines - 1) * engGap) / 2);
    for (let e = 0; e < stage.engines; e++) {
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ex,             topY + tankH);          // top of engine
      ctx.lineTo(ex - 2,         nozzleY);               // nozzle left
      ctx.lineTo(ex + engW + 2,  nozzleY);               // nozzle right
      ctx.lineTo(ex + engW,      topY + tankH);          // top of engine
      ctx.closePath();
      ctx.stroke();

      // Engine flame
      if (isActive && throttle > 0 && stage.fuel > 0 && flightState !== "prelaunch") {
        const glowLen = (15 + Math.random() * 15) * throttle * s;
        ctx.strokeStyle = `rgba(255,255,255,${0.5 + throttle * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ex - 2,        nozzleY);
        ctx.lineTo(ex + engW / 2, nozzleY + glowLen);
        ctx.lineTo(ex + engW + 2, nozzleY);
        ctx.stroke();
      }

      ex += engW + engGap;
    }

    // Landing gear (bottom stage only)
    if (stage.hasLandingGear && i === currentStage) {
      const ga = gearAnimation;
      const legSpread  = tankW / 2 + 8 * s * ga;
      // Gear drops below nozzle; positive Y = downward in draw-space
      const legDrop    = nozzleY - (engH * 0.3 ) * (1-ga) ;
      const legAttachY = topY + tankH + 2 * s; // near bottom of tank
      const strutAttachY = legAttachY - 8 * s;
      const footPadW   = 3 * s;

      ctx.lineWidth = 1;
      for (const side of [-1, 1]) {
        ctx.strokeStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(side * tankW / 2, legAttachY);
        ctx.lineTo(side * legSpread, legDrop);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(side * legSpread - footPadW / 2, legDrop);
        ctx.lineTo(side * legSpread + footPadW / 2, legDrop);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.beginPath();
        ctx.moveTo(side * tankW / 2, strutAttachY);
        ctx.lineTo(side * legSpread, legDrop);
        ctx.stroke();
      }
    }
  }

  // ── RCS jets (drawn in spacecraft frame) ──
  if (rcsActive && (rcsActive.forward || rcsActive.right || rcsActive.rotate)) {
    const capsuleOnly = currentStage >= stagesArr.length;
    const capW        = capsuleOnly ? 16 * s : TANK_SIZES[stagesArr[stagesArr.length - 1].tankSize].width * s;
    const topHalfW    = capW / 3;
    const bottomHalfW = capsuleOnly
      ? capW / 2
      : TANK_SIZES[stagesArr[currentStage].tankSize].width * s / 2;

    // Nose Y and bottom Y in draw-space
    const noseY   = 0;  // just below nose tip
    const bottomY = capsuleOnly ? capH  : scanY - 8 * s; // capsule base or just above nozzle exit

    // Each jet: { x, y, dx, dy } — dx/dy is direction the plume extends (away from rocket)
    const jets = [];
    const { forward, right, rotate } = rcsActive;

    if (forward !== 0) {
      // Forward (W) fires aft jets; backward (S) fires fore jets
      const faceY  = forward > 0 ? bottomY : noseY;
      const halfW  = forward > 0 ? bottomHalfW : topHalfW;
      const plumeY = forward > 0 ? 1 : -1; // plume points away from face
      for (const side of [-1, 1]) {
        jets.push({ x: side * halfW, y: faceY, dx: 0, dy: plumeY });
      }
    }
    if (right !== 0) {
      // Thrust right (D) fires left jets; thrust left (A) fires right jets
      const sideX = -right; // plume exits opposite to thrust
      for (const [y, hw] of [[bottomY, bottomHalfW], [noseY, topHalfW]]) {
        jets.push({ x: sideX * hw, y, dx: sideX, dy: 0 });
      }
    }
    if (rotate !== 0) {
      // CW rotation (+1): nose jet fires left (−X), bottom jet fires right (+X)
      jets.push({ x: -topHalfW*rotate,    y: noseY,   dx: -rotate, dy: 0 });
      jets.push({ x:  bottomHalfW*rotate, y: bottomY, dx:  rotate, dy: 0 });
    }

    for (const j of jets) {
      const len  = (4 + Math.random() * 4) * s;
      const half = 1 * s; // half-width of triangle base, perpendicular to jet direction
      // Perpendicular to jet direction (dx, dy) is (-dy, dx)
      const px = -j.dy * half, py = j.dx * half;
      ctx.strokeStyle = `rgba(255,255,255,${0.5 + Math.random() * 0.4})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(j.x + px, j.y + py);
      ctx.lineTo(j.x + j.dx * len, j.y + j.dy * len);
      ctx.lineTo(j.x - px, j.y - py);
      ctx.stroke();
    }
  }

  ctx.globalAlpha = 1;
}

// ── Planet ──────────────────────────────────────

// Draws the planet surface in the planet's local frame.
// Origin: planet center. Angles measured from +Y axis (launch site = angle 0).
// Planet self-rotation applied by caller via ctx.rotate(PLANET_ROTATION_ANGLE).
//
// opts: { worldAngle, pxPerMeter, W, H }
//   worldAngle: angle (from +Y) of the spacecraft as seen from the planet center.
//               Used to determine which arc of terrain to draw.
function drawPlanet(ctx, opts) {
  const { worldAngle, pxPerMeter, W, H } = opts;
  const s = pxPerMeter;

  const angularHalfWidth = (W / s) / PLANET_RADIUS + 0.3;
  const planetScreenR = PLANET_RADIUS * s;
  const terrainSteps = Math.ceil(angularHalfWidth * 2 * planetScreenR / 4) + 2;
  const terrainPoints = [];

  for (let i = 0; i <= terrainSteps; i++) {
    const t = i / terrainSteps;
    const ang = worldAngle + (t * 2 - 1) * angularHalfWidth;
    const r = (PLANET_RADIUS + getPlanetTerrainHeight(ang)) * s;
    // Planet local → screen: angle 0 = +Y axis → sin(ang) for X, -cos(ang) for Y (canvas Y down)
    const sx = Math.sin(ang) * r;
    const sy = -Math.cos(ang) * r;
    terrainPoints.push([sx, sy]);
  }

  // Surface fill (occludes stars)
  const farY = H * 3;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.moveTo(terrainPoints[0][0], terrainPoints[0][1]);
  for (const [tx, ty] of terrainPoints) ctx.lineTo(tx, ty);
  ctx.lineTo(0, farY); // sweep through planet center
  ctx.closePath();
  ctx.fill();

  // Terrain line
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(terrainPoints[0][0], terrainPoints[0][1]);
  for (const [tx, ty] of terrainPoints) ctx.lineTo(tx, ty);
  ctx.stroke();

  // Surface detail ticks
  const tickAngleSpacing = 50 / PLANET_RADIUS;
  const firstTickAngle = Math.ceil((worldAngle - angularHalfWidth) / tickAngleSpacing) * tickAngleSpacing;
  for (let ang = firstTickAngle; ang <= worldAngle + angularHalfWidth; ang += tickAngleSpacing) {
    const tickIdx = Math.round(ang / tickAngleSpacing);
    const tickLen = (tickIdx % 5 === 0 ? 40 : 20);
    const th = getPlanetTerrainHeight(ang);
    const rOuter = (PLANET_RADIUS + th) * s;
    const rInner = rOuter - tickLen;
    const sinA = Math.sin(ang), cosA = Math.cos(ang);
    ctx.beginPath();
    ctx.moveTo(sinA * rOuter, -cosA * rOuter);
    ctx.lineTo(sinA * rInner, -cosA * rInner);
    ctx.stroke();
  }

  // Launch pad (at planet angle 0 = launch site)
  const altAbovePad = Math.sqrt(
    (opts.simX !== undefined ? opts.simX * opts.simX : 0) +
    (opts.simY !== undefined ? opts.simY * opts.simY : 0)
  ) - PLANET_RADIUS;
  if (altAbovePad < 2000 || opts.forcePad) {
    const padTerrainH = getPlanetTerrainHeight(0);
    const padR = (PLANET_RADIUS + padTerrainH) * s;
    // Angle 0: sin(0)=0, -cos(0)=-1 → point at (0, -padR) in planet local frame
    const padSX = 0;
    const padSY = -padR;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(padSX - 20 * s, padSY , 40 * s, 1 * s);
    // Tower (left of pad)
    //ctx.beginPath();
    //ctx.moveTo(padSX - 12 * s, padSY);
    //ctx.lineTo(padSX - 12 * s, padSY - 27 * s);
    //ctx.stroke();
    //ctx.beginPath();
    //ctx.moveTo(padSX - 12 * s, padSY - 20 * s);
    //ctx.lineTo(padSX - 7 * s,  padSY - 13 * s);
    //ctx.stroke();
  }
}

// ── Moon ─────────────────────────────────────────

// Draws the moon in the moon's local frame.
// Origin: moon center. Angles measured from +Y axis (toward spacecraft when above).
// Moon self-rotation applied by caller via ctx.rotate(MOON_ROTATION_ANGLE).
//
// opts: { craftAngleFromMoon, pxPerMeter, W, H, moonAltFromSurface, simTime }
//   craftAngleFromMoon: angle (from +Y) of the spacecraft as seen from moon center.
function drawMoon(ctx, opts) {
  const { craftAngleFromMoon, pxPerMeter, W, H, moonAltFromSurface, simTime } = opts;
  const s = pxPerMeter;
  const moonScreenR = MOON_RADIUS * s;
  if (moonScreenR < 0.5) return;

  if (moonAltFromSurface < MOON_RADIUS * 2 && moonScreenR > 30) {
    // Close: draw terrain arc
    const moonAngularHalfWidth = (W / s) / MOON_RADIUS + 0.3;
    const mSteps = Math.ceil(moonAngularHalfWidth * 2 * moonScreenR / 4) + 2;
    const mPoints = [];
    for (let i = 0; i <= mSteps; i++) {
      const t = i / mSteps;
      const ang = craftAngleFromMoon + (t * 2 - 1) * moonAngularHalfWidth;
      const r = (MOON_RADIUS + getMoonTerrainHeight(ang)) * s;
      mPoints.push([Math.sin(ang) * r, -Math.cos(ang) * r]);
    }

    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.moveTo(mPoints[0][0], mPoints[0][1]);
    for (const [tx, ty] of mPoints) ctx.lineTo(tx, ty);
    ctx.lineTo(0, H * 3);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(mPoints[0][0], mPoints[0][1]);
    for (const [tx, ty] of mPoints) ctx.lineTo(tx, ty);
    ctx.stroke();
  } else {
    // Far: circle with crater decorations
    ctx.fillStyle = "#000";
    ctx.beginPath();
    ctx.arc(0, 0, moonScreenR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, 0, moonScreenR, 0, Math.PI * 2);
    ctx.stroke();

    if (moonScreenR > 5) {
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      MOON_CRATERS.forEach(c => {
        const cx = Math.sin(c.angle) * moonScreenR * 0.35;
        const cy = -Math.cos(c.angle) * moonScreenR * 0.35;
        const cr = c.radius * moonScreenR * 0.6;
        ctx.beginPath();
        ctx.arc(cx, cy, cr, 0, Math.PI * 2);
        ctx.stroke();
      });
    }
  }
}

// ── Satellite ────────────────────────────────────

// Draws the satellite body in the satellite's local frame.
// Origin: satellite center. Rotation applied by caller via ctx.rotate(sat.rot).
// Reentry flame is drawn in world space by the caller before calling this.
//
// opts: { pxPerMeter }
function drawSatellite(ctx, opts) {
  const { pxPerMeter } = opts;
  const s = pxPerMeter;
  const satelliteScreenR = SATELLITE_RADIUS * s;
  if (satelliteScreenR < 0.5) return;

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
    ctx.moveTo(i, -30); ctx.lineTo(i, 30);
  }
  ctx.moveTo(-145, 0); ctx.lineTo(-25, 0);
  ctx.stroke();

  // Solar panels right
  ctx.beginPath();
  ctx.rect(25, -30, 120, 60);
  ctx.fill();
  ctx.stroke();
  for (let i = 45; i < 145; i += 20) {
    ctx.moveTo(i, -30); ctx.lineTo(i, 30);
  }
  ctx.moveTo(25, 0); ctx.lineTo(145, 0);
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
}

// ── Debris ───────────────────────────────────────

// Draws a single debris piece at its local frame origin.
// Caller: ctx.save → translate → rotate → drawDebrisPiece → restore
function drawDebrisPiece(ctx, d) {
  ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, d.life / 2)})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(-d.size / 2, -d.size / 2, d.size, d.size);
}

// ── Jettisoned stage ─────────────────────────────

// Draws a jettisoned stage tumbling away.
// Caller: ctx.save → translate → rotate → drawJettisonedStage → restore
function drawJettisonedStage(ctx, j, pxPerMeter) {
  const s = pxPerMeter;
  const tank = TANK_SIZES[j.tankSize];
  const tankW = tank.width * s;
  const tankH = tank.height * 0.3 * s;
  const engH = 8 * s;
  // Draw centered on origin (tumbling stages use their CoM as pivot)
  const totalH = tankH + engH;
  ctx.strokeRect(-tankW / 2, -totalH / 2, tankW, tankH);
  const engW = 4 * s;
  const totalEngW = j.engines * (engW + 2) - 2;
  let jex = -totalEngW / 2;
  for (let e = 0; e < j.engines; e++) {
    ctx.beginPath();
    ctx.moveTo(jex,            -totalH / 2 + tankH);
    ctx.lineTo(jex - 2,         totalH / 2);
    ctx.lineTo(jex + engW + 2,  totalH / 2);
    ctx.lineTo(jex + engW,     -totalH / 2 + tankH);
    ctx.closePath();
    ctx.stroke();
    jex += engW + 2;
  }
}
