// src/constants.ts
var PLANET_RADIUS = 6e3;
var G = 6674e-14;
var SURFACE_G = 9.81;
var PLANET_MASS = SURFACE_G * PLANET_RADIUS * PLANET_RADIUS / G;
var MU = G * PLANET_MASS;
var ATMOSPHERE_HEIGHT = 2e3;
var SPEED_OF_SOUND = 340;
var ORBIT_TARGET = 8e4;
function getPlanetTerrainHeight(angle) {
  const a = ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  const launchTaper = Math.min(1, Math.max(0, (Math.abs(a) - 0.15) / 0.2));
  const h = 220 * Math.sin(a * 3 + 1.1) + 180 * Math.sin(a * 7 + 2.3) + 90 * Math.sin(a * 13 + 0.7) + 60 * Math.sin(a * 23 + 3.9);
  return Math.max(0, h) * launchTaper;
}
var MOON_CRATERS = [
  {
    angle: 0.6,
    depth: 180,
    radius: 0.18
  },
  {
    angle: 1.8,
    depth: 120,
    radius: 0.12
  },
  {
    angle: -0.9,
    depth: 200,
    radius: 0.22
  },
  {
    angle: 2.7,
    depth: 90,
    radius: 0.1
  },
  {
    angle: -2.2,
    depth: 150,
    radius: 0.16
  }
];
function getMoonTerrainHeight(angle) {
  let h = 0;
  for (const c of MOON_CRATERS) {
    const da = Math.abs(((angle - c.angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
    if (da < c.radius * 2.5) {
      const t = da / c.radius;
      h += t < 1 ? -c.depth * (1 - t * t) : c.depth * 0.4 * Math.exp(-(t - 1) * 4);
    }
  }
  return h;
}
var SATELLITE_RADIUS = 15;
var SATELLITE_ORBIT_RADIUS = PLANET_RADIUS + ATMOSPHERE_HEIGHT + 2e3;
var SATELLITE_ORBIT_PERIOD = 2 * Math.PI * Math.sqrt(SATELLITE_ORBIT_RADIUS ** 3 / MU);
var SATELLITE_ANGULAR_VEL = -(2 * Math.PI / SATELLITE_ORBIT_PERIOD);
var SATELLITE_COLLISION_RADIUS = 80;
var SATELLITE_MASS = 500;
var SATELLITE_EXPLODE_SPEED = 150;
var LAGRANGE_CAPTURE_RADIUS = 1500;
var MOON_RADIUS = 1500;
var MOON_ORBIT_RADIUS = 3e4;
var MOON_SURFACE_G = 1.6;
var MOON_MASS = MOON_SURFACE_G * MOON_RADIUS * MOON_RADIUS / G;
var MOON_MU = G * MOON_MASS;
var MOON_ORBIT_PERIOD = 2 * Math.PI * Math.sqrt(MOON_ORBIT_RADIUS ** 3 / MU);
var MOON_ANGULAR_VEL = -(2 * Math.PI / MOON_ORBIT_PERIOD);
function getLagrangePoints(time) {
  const moonAngle = MOON_ANGULAR_VEL * time;
  const mu = MOON_MASS / (PLANET_MASS + MOON_MASS);
  const r = MOON_ORBIT_RADIUS;
  const cbrtMu3 = Math.cbrt(mu / 3);
  const ux = Math.cos(moonAngle), uy = Math.sin(moonAngle);
  const l4Angle = moonAngle + Math.PI / 3;
  const l5Angle = moonAngle - Math.PI / 3;
  return {
    L1: {
      x: r * (1 - cbrtMu3) * ux,
      y: r * (1 - cbrtMu3) * uy
    },
    L2: {
      x: r * (1 + cbrtMu3) * ux,
      y: r * (1 + cbrtMu3) * uy
    },
    L3: {
      x: -r * (1 + 5 / 12 * mu) * ux,
      y: -r * (1 + 5 / 12 * mu) * uy
    },
    L4: {
      x: r * Math.cos(l4Angle),
      y: r * Math.sin(l4Angle)
    },
    L5: {
      x: r * Math.cos(l5Angle),
      y: r * Math.sin(l5Angle)
    }
  };
}
function getMoonPos(time) {
  const angle = MOON_ANGULAR_VEL * time;
  return {
    x: MOON_ORBIT_RADIUS * Math.cos(angle),
    y: MOON_ORBIT_RADIUS * Math.sin(angle)
  };
}
function getSatellitePos(time) {
  const angle = SATELLITE_ANGULAR_VEL * time;
  return {
    x: SATELLITE_ORBIT_RADIUS * Math.cos(angle),
    y: SATELLITE_ORBIT_RADIUS * Math.sin(angle)
  };
}
var PLANET_ROTATION_ANGLE = 0;
var MOON_ROTATION_ANGLE = 0;
var ENGINE_THRUST = 2e5;
var ENGINE_MASS = 500;
var ENGINE_ISP = 320;
var EXHAUST_VEL = ENGINE_ISP * SURFACE_G;
var TANK_SIZES = {
  S: {
    fuel: 2e3,
    dryMass: 200,
    label: "Small",
    height: 30,
    width: 16,
    maxEngines: 2
  },
  M: {
    fuel: 5e3,
    dryMass: 400,
    label: "Medium",
    height: 50,
    width: 20,
    maxEngines: 3
  },
  L: {
    fuel: 12e3,
    dryMass: 800,
    label: "Large",
    height: 75,
    width: 24,
    maxEngines: 4
  },
  XL: {
    fuel: 25e3,
    dryMass: 1400,
    label: "Extra-L",
    height: 100,
    width: 28,
    maxEngines: 5
  }
};
var CAPSULE_MASS = 800;
var PARACHUTE_CD = 1.5;
var PARACHUTE_AREA = 80;
var LANDING_SPEED_LIMIT = 10;
var GEAR_LANDING_SPEED_LIMIT = 20;
var LANDING_GEAR_MASS = 150;

// src/bodies.ts
function spacecraftTotalHeight(stagesArr, currentStage) {
  const capH = 15, engH = 8;
  let h = capH;
  for (let i = currentStage; i < stagesArr.length; i++) {
    h += TANK_SIZES[stagesArr[i].tankSize].height * 0.3 + engH;
  }
  return h;
}
function spacecraftComOffset(stagesArr, currentStage, pxPerMeter) {
  const s = pxPerMeter;
  const engH = 8 * s;
  const capH = 15 * s;
  let scanY = capH;
  const stageOffsets = [];
  for (let i = stagesArr.length - 1; i >= currentStage; i--) {
    const tank = TANK_SIZES[stagesArr[i].tankSize];
    const tankH = tank.height * 0.3 * s;
    stageOffsets[i] = {
      topY: scanY,
      tankH,
      engH
    };
    scanY += tankH + engH;
  }
  let comY = 0, comMass = 0;
  comY += capH / 2 * CAPSULE_MASS;
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
function engineXPositions(engines, tankW, engW) {
  const gap = engines > 1 ? (tankW - engines * engW) / (engines - 1) : 0;
  const startX = -((engines * engW + (engines - 1) * gap) / 2);
  const positions = [];
  for (let e = 0; e < engines; e++) {
    positions.push(startX + e * (engW + gap) + engW / 2);
  }
  return positions;
}
function rcsJetPositions(forward, right, rotate, capH, bottomY, topHalfW, bottomHalfW) {
  const noseY_ = 0;
  const jets = [];
  if (forward !== 0) {
    const faceY = forward > 0 ? bottomY : noseY_;
    const halfW = forward > 0 ? bottomHalfW : topHalfW;
    const plumeY = forward > 0 ? 1 : -1;
    for (const side of [
      -1,
      1
    ]) {
      jets.push({
        x: side * halfW,
        y: faceY,
        dx: 0,
        dy: plumeY
      });
    }
  }
  if (right !== 0) {
    const sideX = -right;
    for (const [y, hw] of [
      [
        bottomY,
        bottomHalfW
      ],
      [
        noseY_,
        topHalfW
      ]
    ]) {
      jets.push({
        x: sideX * hw,
        y,
        dx: sideX,
        dy: 0
      });
    }
  }
  if (rotate !== 0) {
    jets.push({
      x: -rotate * topHalfW,
      y: noseY_,
      dx: -rotate,
      dy: 0
    });
    jets.push({
      x: rotate * bottomHalfW,
      y: bottomY,
      dx: rotate,
      dy: 0
    });
  }
  return jets;
}
function landingGearGeometry(side, tankW, nozzleYVal, engH, pxPerMeter, gearAnimation) {
  const s = pxPerMeter;
  const ga = gearAnimation;
  const legSpread = tankW / 2 + 8 * s * ga;
  const legDrop = nozzleYVal - engH * 0.3 * (1 - ga);
  const legAttachY = nozzleYVal - engH + 2 * s;
  const strutAttachY = legAttachY - 8 * s;
  const footPadHalfW = 1.5 * s;
  return {
    legAttach: {
      x: side * tankW / 2,
      y: legAttachY
    },
    strutAttach: {
      x: side * tankW / 2,
      y: strutAttachY
    },
    footTip: {
      x: side * legSpread,
      y: legDrop
    },
    footPadHalfW
  };
}
function drawSpacecraft(ctx, stagesArr, pxPerMeter, opts = {}) {
  const { currentStage = 0, ghostAlpha = 1, fuelFractions = null, gearAnimation = 1, throttle = 0, flightState = "staging", time = 0, chuteState = "none", chuteAngle = 0, showLabel = false, rcsActive = null, contrailAngle = 0, contrailIntensity = 0, mach = 0 } = opts;
  const s = pxPerMeter;
  const engH = 8 * s;
  const topTank = TANK_SIZES[stagesArr[stagesArr.length - 1].tankSize];
  const capW = topTank.width * s;
  const capH = 15 * s;
  const stageData = [];
  let scanY = capH;
  for (let i = stagesArr.length - 1; i >= currentStage; i--) {
    const tank = TANK_SIZES[stagesArr[i].tankSize];
    const tankH = tank.height * 0.3 * s;
    const tankW = tank.width * s;
    stageData[i] = {
      topY: scanY,
      tankH,
      tankW,
      engH
    };
    scanY += tankH + engH;
  }
  ctx.globalAlpha = ghostAlpha;
  if (chuteState !== "none") {
    const lineBase = capH * 0.5;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.save();
    ctx.rotate(chuteAngle);
    if (chuteState === "collapsed") {
      const bundleW = capW * 0.4;
      const bundleY = -3 * s;
      ctx.beginPath();
      ctx.moveTo(-bundleW / 2, bundleY);
      ctx.lineTo(bundleW / 2, bundleY);
      ctx.stroke();
      ctx.strokeStyle = "rgba(255,255,255,0.4)";
      ctx.beginPath();
      ctx.moveTo(-capW / 4, lineBase);
      ctx.lineTo(-bundleW / 3, bundleY);
      ctx.moveTo(capW / 4, lineBase);
      ctx.lineTo(bundleW / 3, bundleY);
      ctx.moveTo(0, lineBase);
      ctx.lineTo(0, bundleY);
      ctx.stroke();
    } else if (chuteState === "inflated") {
      const chuteW = 30 * s;
      const chuteH = 20 * s;
      const chuteTop = -(chuteH + 12 * s);
      const sway = Math.sin(time * 2) * 1.5 * s;
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
      ctx.beginPath();
      ctx.moveTo(-chuteW / 2, chuteTop + chuteH);
      ctx.quadraticCurveTo(-chuteW / 2 + sway, chuteTop - chuteH * 0.2, sway, chuteTop);
      ctx.quadraticCurveTo(chuteW / 2 + sway, chuteTop - chuteH * 0.2, chuteW / 2, chuteTop + chuteH);
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
      const streamTop = -(streamH + 6 * s);
      const flap = Math.sin(time * 8) * 2 * s;
      ctx.beginPath();
      ctx.moveTo(0, lineBase);
      ctx.lineTo(0, streamTop + streamH);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(-streamW / 2, streamTop + streamH);
      ctx.lineTo(-streamW / 2 + flap, streamTop);
      ctx.lineTo(streamW / 2 + flap, streamTop);
      ctx.lineTo(streamW / 2, streamTop + streamH);
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
    ctx.restore();
  }
  if (contrailIntensity > 0.01 || mach > 1) {
    const trailDX = Math.sin(contrailAngle);
    const trailDY = -Math.cos(contrailAngle);
    const currentTank = currentStage < stagesArr.length ? TANK_SIZES[stagesArr[currentStage].tankSize] : null;
    const halfW = currentTank ? currentTank.width / 2 * s : 8 * s;
    const originY = currentTank ? stageData[currentStage]?.topY ?? capH : capH;
    if (contrailIntensity > 0.01) {
      const contrailLen = mach * 20 * s;
      for (const side of [
        -1,
        1
      ]) {
        const ox = side * halfW;
        const oy = originY;
        const grad = ctx.createLinearGradient(ox, oy, ox + trailDX * contrailLen, oy + trailDY * contrailLen);
        grad.addColorStop(0, `rgba(255,255,255,${(contrailIntensity * 0.5).toFixed(3)})`);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + trailDX * contrailLen, oy + trailDY * contrailLen);
        ctx.stroke();
      }
    }
    if (mach > 1) {
      const shockIntensity = Math.min(1, (mach - 1) / 2);
      const halfAngle = Math.asin(1 / mach);
      const coneLen = mach * 30 * s;
      const wingAngle = Math.PI / 2 - halfAngle;
      const cosW = Math.cos(wingAngle), sinW = Math.sin(wingAngle);
      for (const side of [
        -1,
        1
      ]) {
        const wx = side === 1 ? trailDX * cosW - trailDY * sinW : trailDX * cosW + trailDY * sinW;
        const wy = side === 1 ? trailDX * sinW + trailDY * cosW : -trailDX * sinW + trailDY * cosW;
        const grad = ctx.createLinearGradient(0, 0, wx * coneLen, wy * coneLen);
        grad.addColorStop(0, `rgba(255,255,255,${(shockIntensity * 0.6).toFixed(3)})`);
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(wx * coneLen, wy * coneLen);
        ctx.stroke();
      }
    }
  }
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-capW / 2, capH);
  ctx.lineTo(-capW / 3, 0);
  ctx.lineTo(capW / 3, 0);
  ctx.lineTo(capW / 2, capH);
  ctx.closePath();
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, capH * 0.37, 2.5 * s, 0, Math.PI * 2);
  ctx.fillStyle = "#000";
  ctx.fill();
  ctx.stroke();
  for (let i = stagesArr.length - 1; i >= currentStage; i--) {
    const stage = stagesArr[i];
    const { topY, tankH, tankW } = stageData[i];
    const nozzleY = topY + tankH + engH;
    const isActive = i === currentStage;
    if (i + 1 < stagesArr.length) {
      const aboveW = stageData[i + 1].tankW;
      ctx.beginPath();
      ctx.moveTo(-tankW / 2, topY);
      ctx.lineTo(-aboveW / 2, topY - engH);
      ctx.lineTo(aboveW / 2, topY - engH);
      ctx.lineTo(tankW / 2, topY);
      ctx.closePath();
      ctx.fillStyle = "#000";
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(-tankW / 2, topY, tankW, tankH);
    if (showLabel) {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = `${Math.max(8, 10 * s)}px "Share Tech Mono"`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(stage.tankSize, 0, topY + tankH / 2);
      ctx.restore();
    }
    const fuelFrac = fuelFractions ? fuelFractions[i] : stage.fuel != null ? stage.fuel / stage.maxFuel : 1;
    if (fuelFrac > 0 && fuelFrac < 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.setLineDash([
        3,
        3
      ]);
      const fuelY = topY + tankH * (1 - fuelFrac);
      ctx.beginPath();
      ctx.moveTo(-tankW / 2 + 1, fuelY);
      ctx.lineTo(tankW / 2 - 1, fuelY);
      ctx.stroke();
      ctx.setLineDash([]);
    }
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(-tankW / 2 - 3, topY - 2, tankW + 6, 3);
    const engW = 4 * s;
    const centers = engineXPositions(stage.engines, tankW, engW);
    for (const cx of centers) {
      const ex = cx - engW / 2;
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(ex, topY + tankH);
      ctx.lineTo(ex - 2, nozzleY);
      ctx.lineTo(ex + engW + 2, nozzleY);
      ctx.lineTo(ex + engW, topY + tankH);
      ctx.closePath();
      ctx.stroke();
      if (isActive && throttle > 0 && stage.fuel > 0 && flightState !== "prelaunch") {
        const glowLen = (15 + Math.random() * 15) * throttle * s;
        ctx.strokeStyle = `rgba(255,255,255,${0.5 + throttle * 0.5})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(ex - 2, nozzleY);
        ctx.lineTo(cx, nozzleY + glowLen);
        ctx.lineTo(ex + engW + 2, nozzleY);
        ctx.stroke();
      }
    }
    if (stage.hasLandingGear && i === currentStage) {
      ctx.lineWidth = 1;
      for (const side of [
        -1,
        1
      ]) {
        const g = landingGearGeometry(side, tankW, nozzleY, engH, s, gearAnimation);
        ctx.strokeStyle = "#fff";
        ctx.beginPath();
        ctx.moveTo(g.legAttach.x, g.legAttach.y);
        ctx.lineTo(g.footTip.x, g.footTip.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(g.footTip.x - g.footPadHalfW, g.footTip.y);
        ctx.lineTo(g.footTip.x + g.footPadHalfW, g.footTip.y);
        ctx.stroke();
        ctx.strokeStyle = "rgba(255,255,255,0.5)";
        ctx.beginPath();
        ctx.moveTo(g.strutAttach.x, g.strutAttach.y);
        ctx.lineTo(g.footTip.x, g.footTip.y);
        ctx.stroke();
      }
    }
  }
  if (rcsActive && (rcsActive.forward || rcsActive.right || rcsActive.rotate)) {
    const capsuleOnly = currentStage >= stagesArr.length;
    const capW2 = capsuleOnly ? 16 * s : TANK_SIZES[stagesArr[stagesArr.length - 1].tankSize].width * s;
    const topHalfW = capW2 / 3;
    const bottomHalfW = capsuleOnly ? capW2 / 2 : TANK_SIZES[stagesArr[currentStage].tankSize].width * s / 2;
    const bottomY = capsuleOnly ? capH - 3 * s : scanY - 8 * s;
    const jets = rcsJetPositions(rcsActive.forward, rcsActive.right, rcsActive.rotate, capH, bottomY, topHalfW, bottomHalfW);
    for (const j of jets) {
      const len = (4 + Math.random() * 4) * s;
      const half = 1 * s;
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
function drawPlanet(ctx, opts) {
  const { pxPerMeter: s } = opts;
  const planetScreenR = PLANET_RADIUS * s;
  ctx.fillStyle = "#000";
  ctx.beginPath();
  ctx.arc(0, 0, planetScreenR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, planetScreenR, 0, Math.PI * 2);
  ctx.stroke();
  const altAbovePad = opts.simX !== void 0 && opts.simY !== void 0 ? Math.sqrt(opts.simX ** 2 + opts.simY ** 2) - PLANET_RADIUS : Infinity;
  if (altAbovePad < 2e3 || opts.forcePad) {
    const padR = PLANET_RADIUS * s;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(-20 * s, -padR, 40 * s, 1 * s);
  }
}
function drawMoon(ctx, opts) {
  const { pxPerMeter: s } = opts;
  const moonScreenR = MOON_RADIUS * s;
  if (moonScreenR < 0.5) return;
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
    for (const c of MOON_CRATERS) {
      const cx = Math.sin(c.angle) * moonScreenR * 0.35;
      const cy = -Math.cos(c.angle) * moonScreenR * 0.35;
      const cr = c.radius * moonScreenR * 0.6;
      ctx.beginPath();
      ctx.arc(cx, cy, cr, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
}
function drawSatellite(ctx, pxPerMeter) {
  const satelliteScreenR = SATELLITE_RADIUS * pxPerMeter;
  if (satelliteScreenR < 0.5) return;
  const satScale = satelliteScreenR * 2 / 120;
  ctx.scale(satScale, satScale);
  ctx.fillStyle = "#000";
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1 / satScale;
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
  ctx.beginPath();
  ctx.rect(-25, -60, 50, 120);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, 60, 20, 0, Math.PI, false);
  ctx.fill();
  ctx.stroke();
}
function drawDebrisPiece(ctx, d) {
  ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, d.life / 2)})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(-d.size / 2, -d.size / 2, d.size, d.size);
}
function drawJettisonedStage(ctx, j, pxPerMeter) {
  const s = pxPerMeter;
  const tank = TANK_SIZES[j.tankSize];
  const tankW = tank.width * s;
  const tankH = tank.height * 0.3 * s;
  const eH = 8 * s;
  const totalH = tankH + eH;
  ctx.strokeRect(-tankW / 2, -totalH / 2, tankW, tankH);
  const engW = 4 * s;
  const totalEngW = j.engines * (engW + 2) - 2;
  let jex = -totalEngW / 2;
  for (let e = 0; e < j.engines; e++) {
    ctx.beginPath();
    ctx.moveTo(jex, -totalH / 2 + tankH);
    ctx.lineTo(jex - 2, totalH / 2);
    ctx.lineTo(jex + engW + 2, totalH / 2);
    ctx.lineTo(jex + engW, -totalH / 2 + tankH);
    ctx.closePath();
    ctx.stroke();
    jex += engW + 2;
  }
}

// src/staging.ts
var stages = [];
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
  const max = TANK_SIZES[s.tankSize].maxEngines;
  s.engines = Math.max(1, Math.min(max, s.engines + delta));
  recomputeStage(s);
  renderStageList();
  updatePreview();
}
function setStageTank(i, size) {
  const s = stages[i];
  s.tankSize = size;
  s.engines = Math.min(s.engines, TANK_SIZES[size].maxEngines);
  recomputeStage(s);
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
    fuel: 0,
    maxFuel: 0,
    dryMass: 0,
    thrust: 0
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
var dragFromIndex = null;
function renderStageList() {
  const el = document.getElementById("stage-list");
  el.innerHTML = "";
  for (let ri = stages.length - 1; ri >= 0; ri--) {
    const i = ri;
    const s = stages[i];
    const div = document.createElement("div");
    div.className = "stage-item";
    div.draggable = true;
    div.dataset.index = String(i);
    const tankBtns = [
      "S",
      "M",
      "L",
      "XL"
    ].map((sz) => `<button class="tank-option${s.tankSize === sz ? " active" : ""}" onclick="setStageTank(${i}, '${sz}')">${sz}</button>`).join("");
    div.innerHTML = `
      <div class="stage-header">
        <span class="drag-handle">\u283F</span>
        <span class="stage-num">${i + 1}</span>
        <button class="remove-btn" onclick="removeStage(${i})">\u2715</button>
      </div>
      <div class="stage-info">
        <div class="config-row">
          <label>Fuel Tank</label>
          <div class="tank-options">${tankBtns}</div>
        </div>
        <div class="config-row">
          <label>Engines</label>
          <div class="controls">
            <button class="btn-sm" onclick="adjustStageEngines(${i}, -1)">\u2212</button>
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
        <div class="stage-stats"></div>
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
      el.querySelectorAll(".stage-item").forEach((d) => d.classList.remove("drag-over"));
    });
    div.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      el.querySelectorAll(".stage-item").forEach((d) => d.classList.remove("drag-over"));
      if (dragFromIndex !== null && dragFromIndex !== i) {
        div.classList.add("drag-over");
      }
    });
    div.addEventListener("dragleave", () => div.classList.remove("drag-over"));
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
  let totalMass = CAPSULE_MASS;
  stages.forEach((s) => totalMass += s.totalMass);
  let dv = 0;
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i];
    let mAbove = CAPSULE_MASS;
    for (let j = i + 1; j < stages.length; j++) {
      mAbove += stages[j].totalMass;
    }
    const m0 = mAbove + s.totalMass;
    const m1 = mAbove + s.dryMass;
    const stageDv = EXHAUST_VEL * Math.log(m0 / m1);
    const tw = s.thrust / (m0 * SURFACE_G);
    dv += stageDv;
    const card = el.querySelector(`.stage-item[data-index="${i}"] .stage-stats`);
    if (card) {
      const dryMass = s.totalMass + mAbove;
      card.innerHTML = `
        <span class="stat">Fuel:</span> <span class="val">${s.fuel} kg</span>
        <span class="stat">Dry Mass:</span> <span class="val">${dryMass.toLocaleString()} kg</span>
        <span class="stat">\u0394v:</span> <span class="val">${Math.round(stageDv).toLocaleString()} m/s</span>
        <span class="stat">T/W:</span> <span class="val">${tw.toFixed(2)}</span>
      `;
    }
  }
  document.getElementById("total-mass").textContent = totalMass.toLocaleString() + " kg";
  document.getElementById("total-dv").textContent = Math.round(dv).toLocaleString() + " m/s";
  document.getElementById("total-stages").textContent = String(stages.length);
}
var prevCanvas = document.getElementById("staging-preview");
var prevCtx = prevCanvas.getContext("2d");
function updatePreview() {
  const W = prevCanvas.width, H = prevCanvas.height;
  prevCtx.clearRect(0, 0, W, H);
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
  let stackH = 15;
  stages.forEach((st) => {
    stackH += TANK_SIZES[st.tankSize].height * 0.3 + 8;
  });
  const s = H * 0.5 / stackH;
  const totalH = stackH * s;
  prevCtx.save();
  prevCtx.translate(W / 2, (H - totalH) / 2);
  drawSpacecraft(prevCtx, stages, s, {
    currentStage: 0,
    showLabel: true
  });
  prevCtx.restore();
}

// src/state.ts
var sim = null;
function setSim(s) {
  sim = s;
}
var keys = {};
var _viewMode = "spacecraft";
function getViewMode() {
  return _viewMode;
}
function setViewMode(v) {
  _viewMode = v;
}
var _paused = false;
function getPaused() {
  return _paused;
}
function setPaused(v) {
  _paused = v;
}
function togglePausedState() {
  _paused = !_paused;
  return _paused;
}
var _zoomLevel = 1;
function getZoomLevel() {
  return _zoomLevel;
}
function setZoomLevel(v) {
  _zoomLevel = Math.max(0.1, Math.min(20, v));
}
var SIM_SPEEDS = [
  1,
  2,
  10,
  20,
  50
];
var _simSpeed = 1;
function getSimSpeed() {
  return _simSpeed;
}
function setSimSpeed(v) {
  _simSpeed = v;
}
var _zoomIndicatorTimer = 0;
function getZoomIndicatorTimer() {
  return _zoomIndicatorTimer;
}
function setZoomIndicatorTimer(v) {
  _zoomIndicatorTimer = v;
}
var animFrame = null;
function setAnimFrame(v) {
  animFrame = v;
}
var savedStages = [];
function setSavedStages(s) {
  savedStages = s;
}

// src/simulation.ts
var flightCanvas = document.getElementById("flight-canvas");
var flightCtx = flightCanvas.getContext("2d");
var minimapCanvas = document.getElementById("minimap-canvas");
var minimapCtx = minimapCanvas.getContext("2d");
var orientationCanvas = document.getElementById("orientation-canvas");
var orientationCtx = orientationCanvas.getContext("2d");
var _render = null;
function setRenderFn(fn) {
  _render = fn;
}
var _resizeCanvas = null;
function setResizeCanvasFn(fn) {
  _resizeCanvas = fn;
}
function startFlight() {
  if (stages.length === 0) return;
  document.getElementById("staging-screen").style.display = "none";
  document.getElementById("flight-screen").style.display = "block";
  _resizeCanvas?.();
  setPaused(false);
  setZoomLevel(1);
  document.getElementById("pause-overlay").classList.remove("show");
  document.getElementById("sim-speed-indicator").style.display = "none";
  setSavedStages(stages.map((s) => ({
    ...s
  })));
  const flightStages = stages.map((s) => ({
    ...s,
    fuel: s.fuel,
    maxFuel: s.fuel
  }));
  const nozzleOffset_m = spacecraftTotalHeight(flightStages, 0) - spacecraftComOffset(flightStages, 0, 1);
  const padY = PLANET_RADIUS + nozzleOffset_m;
  const newSim = {
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
    rcsActive: {
      forward: 0,
      right: 0,
      rotate: 0
    },
    debris: [],
    jettisoned: [],
    satellite: {
      x: SATELLITE_ORBIT_RADIUS,
      y: 0,
      vx: 0,
      vy: -Math.sqrt(MU / SATELLITE_ORBIT_RADIUS),
      alive: true,
      rot: 0,
      rotV: 0
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
      lagrangeL5: false
    }
  };
  setSim(newSim);
  renderHUDStages();
  lastTime = performance.now();
  loop();
}
var lastTime = 0;
function loop() {
  const s = sim;
  const now = performance.now();
  const rawDt = (now - lastTime) / 1e3;
  lastTime = now;
  const dt = Math.min(rawDt, 0.05);
  if (!s.ended && !getPaused()) {
    const speed = getSimSpeed();
    const subDt = dt * speed / speed;
    for (let i = 0; i < speed && !s.ended; i++) updateSim(subDt);
  }
  const zit = getZoomIndicatorTimer();
  if (zit > 0) {
    setZoomIndicatorTimer(zit - rawDt);
    if (zit - rawDt <= 0) {
      document.getElementById("zoom-indicator").classList.remove("show");
    }
  }
  _render?.();
  setAnimFrame(requestAnimationFrame(loop));
}
function updateSim(dt) {
  const s = sim;
  if (s.onMoon && s.flightState === "landed") {
    s.time += dt;
    const moon2 = getMoonPos(s.time);
    const moonTerrainR2 = MOON_RADIUS + getMoonTerrainHeight(s.moonLandAngle);
    s.x = moon2.x + Math.sin(s.moonLandAngle) * moonTerrainR2;
    s.y = moon2.y + Math.cos(s.moonLandAngle) * moonTerrainR2;
    s.vx = -MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL * Math.sin(MOON_ANGULAR_VEL * s.time);
    s.vy = MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL * Math.cos(MOON_ANGULAR_VEL * s.time);
    updateHUD();
    return;
  }
  const dist = Math.sqrt(s.x * s.x + s.y * s.y);
  const alt = dist - PLANET_RADIUS;
  const gMag = MU / (dist * dist);
  let gx = -gMag * (s.x / dist);
  let gy = -gMag * (s.y / dist);
  const moon = getMoonPos(s.time);
  const mdx = s.x - moon.x, mdy = s.y - moon.y;
  const moonDist = Math.sqrt(mdx * mdx + mdy * mdy);
  const moonGMag = MOON_MU / (moonDist * moonDist);
  gx -= moonGMag * (mdx / moonDist);
  gy -= moonGMag * (mdy / moonDist);
  let dragFactor = 0;
  if (alt < ATMOSPHERE_HEIGHT && alt >= 0) {
    const airDensity = 1.2 * Math.exp(-alt / 8500);
    const spd2 = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    const cd = s.flightState === "landing" ? PARACHUTE_CD : 0.3;
    const area = s.flightState === "landing" ? PARACHUTE_AREA : 4;
    dragFactor = 0.5 * airDensity * spd2 * cd * area;
  }
  let thrustX = 0, thrustY = 0;
  let totalMass = CAPSULE_MASS;
  for (let i = s.currentStage; i < s.stages.length; i++) {
    totalMass += s.stages[i].dryMass + s.stages[i].fuel;
  }
  if (s.flightState === "staging" && s.currentStage < s.stages.length && s.throttle > 0) {
    const stage = s.stages[s.currentStage];
    if (stage.fuel > 0) {
      const thrustMag = stage.thrust * s.throttle;
      const tdx = Math.sin(s.angle);
      const tdy = Math.cos(s.angle);
      thrustX = tdx * thrustMag / totalMass;
      thrustY = tdy * thrustMag / totalMass;
      const fuelRate = thrustMag / EXHAUST_VEL;
      stage.fuel = Math.max(0, stage.fuel - fuelRate * dt);
      if (alt < ATMOSPHERE_HEIGHT && Math.random() < 0.6) {
        let comOff = 0, comM = 0, scan = 0;
        for (let ci = s.currentStage; ci < s.stages.length; ci++) {
          const ct = TANK_SIZES[s.stages[ci].tankSize];
          const stH = ct.height * 0.3 + 8;
          comOff += (scan - stH / 2) * (s.stages[ci].dryMass + s.stages[ci].fuel);
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
            size: 2 + Math.random() * 3
          });
        }
      }
    }
  }
  const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  let dragX = 0, dragY = 0;
  if (spd > 0 && dragFactor > 0) {
    dragX = -dragFactor * s.vx / totalMass;
    dragY = -dragFactor * s.vy / totalMass;
  }
  s.vx += (gx + thrustX + dragX) * dt;
  s.vy += (gy + thrustY + dragY) * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
  if (s.flightState === "landing") {
    const spd2 = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (spd2 > 1) {
      const retrogradeWorld = Math.atan2(-s.vx, -s.vy);
      let err = retrogradeWorld - s.angle;
      while (err > Math.PI) err -= 2 * Math.PI;
      while (err < -Math.PI) err += 2 * Math.PI;
      const airDensity = 1.2 * Math.exp(-alt / 8500);
      const dynPressure = 0.5 * airDensity * spd2 * spd2;
      const torqueStrength = 0.4 + dynPressure / totalMass * 0.1;
      s.angularVel += Math.sin(err) * torqueStrength * dt * 60;
    }
    if (keys["ArrowLeft"] || keys["KeyQ"]) s.angularVel -= 3 * dt;
    if (keys["ArrowRight"] || keys["KeyE"]) s.angularVel += 3 * dt;
    s.angularVel *= 0.96;
    s.angle += s.angularVel * dt;
  } else if (s.flightState === "staging" || s.flightState === "freefall") {
    if (keys["ArrowLeft"] || keys["KeyQ"]) s.angularVel -= 3 * dt;
    if (keys["ArrowRight"] || keys["KeyE"]) s.angularVel += 3 * dt;
    s.angularVel *= 0.95;
    s.angle += s.angularVel * dt;
  }
  if (s.flightState === "staging" || s.flightState === "freefall" || s.flightState === "landing") {
    const cosR = Math.cos(s.angle);
    const sinR = Math.sin(s.angle);
    const axisX = sinR, axisY = cosR;
    const rightX = cosR, rightY = -sinR;
    const rcsThrustAcc = 2;
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
    const rcsDir = keys["ArrowLeft"] || keys["KeyQ"] ? -1 : keys["ArrowRight"] || keys["KeyE"] ? 1 : 0;
    s.rcsActive = {
      forward: rcsForward,
      right: rcsRight,
      rotate: rcsDir
    };
  } else {
    s.rcsActive = {
      forward: 0,
      right: 0,
      rotate: 0
    };
  }
  if (s.flightState === "prelaunch" || s.flightState === "staging") {
    if (keys["ShiftLeft"] || keys["ArrowUp"]) {
      s.throttle = Math.min(1, s.throttle + 1.5 * dt);
    }
    if (keys["ArrowDown"] || keys["ControlLeft"]) {
      s.throttle = Math.max(0, s.throttle - 1.5 * dt);
    }
  }
  s.time += dt;
  s.particles.forEach((p) => {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.life -= dt;
  });
  s.particles = s.particles.filter((p) => p.life > 0);
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
          j.vx -= j.vx / jSpeed * jDrag * dt;
          j.vy -= j.vy / jSpeed * jDrag * dt;
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
        sat.vx -= sat.vx / satSpeed * drag / SATELLITE_MASS * dt;
        sat.vy -= sat.vy / satSpeed * drag / SATELLITE_MASS * dt;
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
          s.vx -= impulse / totalMass * nx;
          s.vy -= impulse / totalMass * ny;
          sat.vx += impulse / SATELLITE_MASS * nx;
          sat.vy += impulse / SATELLITE_MASS * ny;
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
  const newAlt = Math.sqrt(s.x * s.x + s.y * s.y) - PLANET_RADIUS;
  s.maxAlt = Math.max(s.maxAlt, newAlt);
  s.maxVel = Math.max(s.maxVel, spd);
  const terrainH = getPlanetTerrainHeight(0);
  const totalHeight_m = spacecraftTotalHeight(s.stages, s.currentStage);
  const comOffset_m = spacecraftComOffset(s.stages, s.currentStage, 1);
  const nozzleOffset_m = totalHeight_m - comOffset_m;
  const nozzleAlt = newAlt - terrainH - nozzleOffset_m;
  if (nozzleAlt <= 0 && s.flightState !== "prelaunch") {
    const nx = s.x / dist, ny = s.y / dist;
    const radialSpeed = s.vx * nx + s.vy * ny;
    const speedLimit = s.gearDeployed ? GEAR_LANDING_SPEED_LIMIT : LANDING_SPEED_LIMIT;
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
      for (const side of [
        -1,
        1
      ]) {
        const foot = {
          wx: s.x - axisX * nozzleOffset_m + side * rightX * legSpread_m,
          wy: s.y - axisY * nozzleOffset_m + side * rightY * legSpread_m
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
        const jNorm = -(1 + RESTITUTION) * footVn / (1 / totalMassGear + rCrossN * rCrossN / I);
        if (jNorm > 0) {
          s.vx += jNorm * nx / totalMassGear;
          s.vy += jNorm * ny / totalMassGear;
          s.angularVel -= rCrossN * jNorm / I;
          s.vx -= s.vx * 0.95;
          s.vy -= s.vy * 0.95;
        }
        s.x += nx * -footAlt * 0.95;
        s.y += ny * -footAlt * 0.95;
      }
    }
  }
  const moonAngleOnSurface = Math.atan2(mdx, mdy);
  const moonTerrainH = getMoonTerrainHeight(moonAngleOnSurface);
  const moonTerrainR = MOON_RADIUS + moonTerrainH;
  const moonNozzleOffset_m = spacecraftTotalHeight(s.stages, s.currentStage) - spacecraftComOffset(s.stages, s.currentStage, 1);
  const moonAlt = moonDist - moonTerrainR - moonNozzleOffset_m;
  if (moonAlt <= 0 && s.flightState !== "prelaunch") {
    const mnx = mdx / moonDist, mny = mdy / moonDist;
    const moonVx = -MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL * Math.sin(MOON_ANGULAR_VEL * s.time);
    const moonVy = MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL * Math.cos(MOON_ANGULAR_VEL * s.time);
    const relVx = s.vx - moonVx, relVy = s.vy - moonVy;
    const radialSpeed = relVx * mnx + relVy * mny;
    const moonSpeedLimit = s.gearDeployed ? GEAR_LANDING_SPEED_LIMIT : LANDING_SPEED_LIMIT;
    if (radialSpeed < -moonSpeedLimit) {
      s.crashed = true;
      endFlight(false);
    } else {
      s.x = moon.x + mnx * (moonTerrainR + moonNozzleOffset_m);
      s.y = moon.y + mny * (moonTerrainR + moonNozzleOffset_m);
      const tanVx = relVx - radialSpeed * mnx, tanVy = relVy - radialSpeed * mny;
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
          showNotification("On the moon \u2014 press SPACE to launch");
        }
      }
    }
  }
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
      const moonVx = -MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL * Math.sin(MOON_ANGULAR_VEL * s.time);
      const moonVy = MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL * Math.cos(MOON_ANGULAR_VEL * s.time);
      const RESTITUTION_MOON = 0.05, FRICTION_MU_MOON = 0.6;
      for (const side of [
        -1,
        1
      ]) {
        const foot = {
          wx: s.x - axisX * moonNozzleOffset_m + side * rightX * legSpread_m,
          wy: s.y - axisY * moonNozzleOffset_m + side * rightY * legSpread_m
        };
        const fdx = foot.wx - moon.x, fdy = foot.wy - moon.y;
        const footMoonDist = Math.sqrt(fdx * fdx + fdy * fdy);
        const footMoonTerrainH = getMoonTerrainHeight(Math.atan2(fdx, fdy));
        const footMoonAlt = footMoonDist - MOON_RADIUS - footMoonTerrainH;
        if (footMoonAlt >= 0) continue;
        const nx = fdx / footMoonDist, ny = fdy / footMoonDist;
        const tx = -ny, ty = nx;
        const rx = foot.wx - s.x, ry = foot.wy - s.y;
        const footVx = s.vx - moonVx - s.angularVel * ry;
        const footVy = s.vy - moonVy + s.angularVel * rx;
        const footVn = footVx * nx + footVy * ny;
        const footVt = footVx * tx + footVy * ty;
        const rCrossN = rx * ny - ry * nx;
        const rCrossT = rx * ty - ry * tx;
        const jNorm = -(1 + RESTITUTION_MOON) * footVn / (1 / totalMassGearMoon + rCrossN * rCrossN / I_moon);
        if (jNorm > 0) {
          s.vx += jNorm * nx / totalMassGearMoon;
          s.vy += jNorm * ny / totalMassGearMoon;
          s.angularVel -= rCrossN * jNorm / I_moon;
          const jFricUnclamped = -footVt / (1 / totalMassGearMoon + rCrossT * rCrossT / I_moon);
          const jFric = Math.max(-FRICTION_MU_MOON * jNorm, Math.min(FRICTION_MU_MOON * jNorm, jFricUnclamped));
          s.vx += jFric * tx / totalMassGearMoon;
          s.vy += jFric * ty / totalMassGearMoon;
          s.angularVel -= rCrossT * jFric / I_moon;
        }
        s.x += nx * -footMoonAlt;
        s.y += ny * -footMoonAlt;
      }
    }
  }
  const orb = computeOrbitalElements(s.x, s.y, s.vx, s.vy);
  if (orb.pe > ATMOSPHERE_HEIGHT && orb.ap > ATMOSPHERE_HEIGHT && !s.achievements.orbitAchieved) {
    s.achievements.orbitAchieved = true;
    showNotification("Orbit achieved!");
  }
  if (!s.achievements.lunarOrbit) {
    const moonVxOr = -MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL * Math.sin(MOON_ANGULAR_VEL * s.time);
    const moonVyOr = MOON_ORBIT_RADIUS * MOON_ANGULAR_VEL * Math.cos(MOON_ANGULAR_VEL * s.time);
    const moonRelVx = s.vx - moonVxOr, moonRelVy = s.vy - moonVyOr;
    const moonOrbR = Math.sqrt((s.x - moon.x) ** 2 + (s.y - moon.y) ** 2);
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
  const gearTarget = s.gearDeployed ? 1 : 0;
  s.gearAnimation += (gearTarget - s.gearAnimation) * Math.min(1, 5 * dt);
  if (s.notifTimer > 0) {
    s.notifTimer -= dt;
    if (s.notifTimer <= 0) {
      document.getElementById("notification").classList.remove("show");
    }
  }
  updateHUD();
}
function computeOrbitalElements(x, y, vx, vy) {
  const r = Math.sqrt(x * x + y * y);
  const v = Math.sqrt(vx * vx + vy * vy);
  const E = 0.5 * v * v - MU / r;
  if (E >= 0) {
    return {
      ap: Infinity,
      pe: r - PLANET_RADIUS,
      sma: Infinity,
      ecc: 2
    };
  }
  const a = -MU / (2 * E);
  const h = x * vy - y * vx;
  const ecc = Math.sqrt(1 + 2 * E * h * h / (MU * MU));
  return {
    ap: a * (1 + ecc) - PLANET_RADIUS,
    pe: a * (1 - ecc) - PLANET_RADIUS,
    sma: a,
    ecc,
    h
  };
}
function activateNextStage() {
  const s = sim;
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
      engines: jetStage.engines
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
        size: 2 + Math.random() * 2
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
      showNotification("All stages jettisoned \u2014 SPACE for chute");
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
      showNotification("Leaving moon \u2014 deploy chute near Earth");
    }
    renderHUDStages();
  }
}
function toggleLandingGear() {
  const s = sim;
  if (s.flightState !== "staging" && s.flightState !== "freefall" && s.flightState !== "prelaunch") return;
  if (s.currentStage >= s.stages.length) return;
  if (!s.stages[s.currentStage].hasLandingGear) {
    showNotification("No landing gear on this stage");
    return;
  }
  s.gearDeployed = !s.gearDeployed;
  showNotification(s.gearDeployed ? "Landing gear deployed" : "Landing gear retracted");
  renderHUDStages();
}
function showNotification(text) {
  const s = sim;
  s.notification = text;
  s.notifTimer = 2.5;
  const el = document.getElementById("notification");
  el.textContent = text;
  el.classList.add("show");
}
function showAchievement(text) {
  const delay = sim.notifTimer > 0 ? sim.notifTimer * 1e3 + 100 : 0;
  setTimeout(() => {
    if (sim && !sim.ended) showNotification("Achievement: " + text);
  }, delay);
}
function spawnSatelliteDebris(x, y, vx, vy, count) {
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const spd = 20 + Math.random() * 120;
    sim.debris.push({
      x: x + (Math.random() - 0.5) * 20,
      y: y + (Math.random() - 0.5) * 20,
      vx: vx + Math.cos(angle) * spd,
      vy: vy + Math.sin(angle) * spd,
      rot: Math.random() * Math.PI * 2,
      rotV: (Math.random() - 0.5) * 4,
      life: 15 + Math.random() * 15,
      size: 2 + Math.random() * 5
    });
  }
}
function endFlight(success) {
  const s = sim;
  s.ended = true;
  const overlay = document.getElementById("end-overlay");
  const title = document.getElementById("end-title");
  const subtitle = document.getElementById("end-subtitle");
  const stats = document.getElementById("end-stats");
  if (!success) {
    title.textContent = "Impact!";
    title.style.color = "var(--danger)";
    subtitle.textContent = "Your spacecraft hit the surface too hard. Deploy the parachute earlier or reduce speed before landing!";
  } else if (s.achievements.returnToEarth) {
    title.textContent = "Mission Complete!";
    title.style.color = "var(--success)";
    subtitle.textContent = "You landed on the Moon and returned safely to Earth!";
  } else if (s.achievements.moonLanding) {
    title.textContent = "Safe Landing";
    title.style.color = "var(--success)";
    subtitle.textContent = "You landed on the Moon but didn't make it home. So close!";
  } else if (s.achievements.orbitAchieved) {
    title.textContent = "Safe Return";
    title.style.color = "var(--success)";
    subtitle.textContent = "Splashdown! You achieved orbit and returned safely to Earth.";
  } else {
    title.textContent = "Safe Landing";
    title.style.color = "var(--fuel-color)";
    subtitle.textContent = s.stages.some((st) => st.fuel > 0) ? "Your capsule landed safely, but never reached orbit." : "Your capsule landed safely, but never reached orbit. Add more stages!";
  }
  const achLabels = [
    [
      "orbitAchieved",
      "Orbit"
    ],
    [
      "lunarOrbit",
      "Lunar Orbit"
    ],
    [
      "moonLanding",
      "Moon Landing"
    ],
    [
      "moonLiftoff",
      "Moon Liftoff"
    ],
    [
      "returnToEarth",
      "Return to Earth"
    ],
    [
      "lagrangeL1",
      "L1"
    ],
    [
      "lagrangeL2",
      "L2"
    ],
    [
      "lagrangeL3",
      "L3"
    ],
    [
      "lagrangeL4",
      "L4"
    ],
    [
      "lagrangeL5",
      "L5"
    ]
  ];
  const achHTML = achLabels.map(([key, label]) => `<div class="stat-item"><div class="lbl">${label}</div><div class="val" style="font-size:18px">${s.achievements[key] ? "\u2713" : "\u2014"}</div></div>`).join("");
  stats.innerHTML = `
    <div class="stat-item"><div class="lbl">Max Altitude</div><div class="val">${formatDist(s.maxAlt)}</div></div>
    <div class="stat-item"><div class="lbl">Max Velocity</div><div class="val">${Math.round(s.maxVel)} m/s</div></div>
    <div class="stat-item"><div class="lbl">Flight Time</div><div class="val">${formatTime(s.time)}</div></div>
    <div class="stat-item"><div class="lbl">Stages Used</div><div class="val">${s.currentStage + 1} / ${s.stages.length}</div></div>
    ${achHTML}
  `;
  overlay.classList.add("show");
}
function togglePause() {
  if (sim?.ended) return;
  const nowPaused = togglePausedState();
  const overlay = document.getElementById("pause-overlay");
  if (nowPaused) {
    overlay.classList.add("show");
  } else {
    overlay.classList.remove("show");
    lastTime = performance.now();
  }
}
function restartMission() {
  document.getElementById("pause-overlay").classList.remove("show");
  document.getElementById("end-overlay").classList.remove("show");
  setPaused(false);
  if (animFrame !== null) cancelAnimationFrame(animFrame);
  stages.splice(0, stages.length, ...savedStages.map((s) => ({
    ...s
  })));
  startFlight();
}
function returnToStaging() {
  document.getElementById("pause-overlay").classList.remove("show");
  document.getElementById("end-overlay").classList.remove("show");
  setPaused(false);
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
  if (animFrame !== null) cancelAnimationFrame(animFrame);
  setSim(null);
}
function renderHUDStages() {
  const s = sim;
  const el = document.getElementById("hud-stages");
  el.innerHTML = "";
  for (let i = s.stages.length - 1; i >= 0; i--) {
    const st = s.stages[i];
    const pct = st.maxFuel > 0 ? st.fuel / st.maxFuel * 100 : 0;
    let cls = "stage-hud-item";
    if (i === s.currentStage && s.flightState === "staging") cls += " active";
    if (i < s.currentStage) cls += " spent";
    const div = document.createElement("div");
    div.className = cls;
    div.innerHTML = `
      <span class="stage-label">${i + 1}</span>
      <div class="fuel-bar-bg"><div class="fuel-bar ${pct < 20 ? "low" : ""}" style="width:${pct}%"></div></div>
      <span class="fuel-pct">${Math.round(pct)}%</span>
    `;
    el.appendChild(div);
  }
  const chutDiv = document.createElement("div");
  const isLanding = s.flightState === "landing" || s.flightState === "landed";
  chutDiv.className = "stage-hud-item" + (isLanding ? " active" : "");
  chutDiv.innerHTML = `
    <span class="stage-label" style="font-size:13px;">\u2602</span>
    <div class="fuel-bar-bg"><div class="fuel-bar" style="width:${isLanding ? 100 : 0}%;background:var(--success);"></div></div>
    <span class="fuel-pct" style="font-size:9px;">${isLanding ? "OPEN" : "RDY"}</span>
  `;
  el.appendChild(chutDiv);
  if (s.currentStage < s.stages.length && s.stages[s.currentStage].hasLandingGear) {
    const gearDiv = document.createElement("div");
    gearDiv.className = "stage-hud-item" + (s.gearDeployed ? " active" : "");
    gearDiv.innerHTML = `
      <span class="stage-label" style="font-size:11px;">\u22A5</span>
      <div class="fuel-bar-bg"><div class="fuel-bar" style="width:${s.gearDeployed ? 100 : 0}%;background:var(--success);"></div></div>
      <span class="fuel-pct" style="font-size:9px;">${s.gearDeployed ? "DOWN" : "UP"}</span>
    `;
    el.appendChild(gearDiv);
  }
}
function updateHUD() {
  const s = sim;
  const dist = Math.sqrt(s.x * s.x + s.y * s.y);
  const alt = dist - PLANET_RADIUS;
  const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
  const nx = s.x / dist, ny = s.y / dist;
  const verticalSpeed = s.vx * nx + s.vy * ny;
  const tanVx = s.vx - verticalSpeed * nx, tanVy = s.vy - verticalSpeed * ny;
  const horizontalSpeed = Math.sqrt(tanVx * tanVx + tanVy * tanVy);
  document.getElementById("hud-alt").textContent = formatDist(alt);
  document.getElementById("hud-vv").textContent = (verticalSpeed >= 0 ? "+" : "") + Math.round(verticalSpeed);
  document.getElementById("hud-vh").textContent = String(Math.round(horizontalSpeed));
  const orb = computeOrbitalElements(s.x, s.y, s.vx, s.vy);
  document.getElementById("hud-ap").textContent = orb.ap === Infinity ? "\u221E" : (orb.ap / 1e3).toFixed(1);
  document.getElementById("hud-pe").textContent = orb.pe < -PLANET_RADIUS ? "Sub" : (orb.pe / 1e3).toFixed(1);
  document.getElementById("hud-time").textContent = formatTime(s.time);
  const machEl = document.getElementById("hud-mach");
  if (alt < ATMOSPHERE_HEIGHT && alt >= 0) {
    machEl.textContent = (spd / SPEED_OF_SOUND).toFixed(2);
  } else {
    machEl.textContent = "\u2014";
  }
  document.getElementById("throttle-fill").style.height = s.throttle * 100 + "%";
  document.getElementById("throttle-pct").textContent = Math.round(s.throttle * 100) + "%";
  const altMax = 2e5;
  const altPct = alt <= 0 ? 0 : Math.min(1, Math.log(1 + alt) / Math.log(1 + altMax));
  const atmoPct = Math.log(1 + ATMOSPHERE_HEIGHT) / Math.log(1 + altMax);
  const orbitPct = Math.log(1 + ORBIT_TARGET) / Math.log(1 + altMax);
  document.getElementById("altimeter-fill").style.height = altPct * 100 + "%";
  document.getElementById("altimeter-needle").style.bottom = altPct * 100 + "%";
  document.getElementById("altimeter-atmo").style.bottom = atmoPct * 100 + "%";
  document.getElementById("altimeter-orbit").style.bottom = orbitPct * 100 + "%";
  document.getElementById("altimeter-value").textContent = formatDist(alt);
  s.stages.forEach((st, i) => {
    const bars = document.querySelectorAll(".stage-hud-item");
    if (!bars[i]) return;
    const pct = st.maxFuel > 0 ? st.fuel / st.maxFuel * 100 : 0;
    const bar = bars[i].querySelector(".fuel-bar");
    const pctEl = bars[i].querySelector(".fuel-pct");
    if (bar) {
      bar.style.width = pct + "%";
      bar.className = "fuel-bar" + (pct < 20 ? " low" : "");
    }
    if (pctEl) pctEl.textContent = Math.round(pct) + "%";
    bars[i].className = "stage-hud-item" + (i === s.currentStage ? " active" : "") + (i < s.currentStage ? " spent" : "");
  });
  document.getElementById("view-mode").textContent = getViewMode() === "spacecraft" ? "Spacecraft View" : "Orbital View";
}
function formatDist(m) {
  return Math.abs(m) > 1e4 ? (m / 1e3).toFixed(1) + " km" : Math.round(m) + " m";
}
function formatTime(t) {
  const m = Math.floor(t / 60), sec = Math.floor(t % 60);
  return m + ":" + (sec < 10 ? "0" : "") + sec;
}

// src/renderer.ts
function resizeCanvas() {
  flightCanvas.width = window.innerWidth;
  flightCanvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
function render() {
  if (getViewMode() === "spacecraft") {
    renderSpacecraftView();
    renderMinimap();
  } else {
    renderOrbitalView();
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
  function drawVector(wx, wy, len, color, label, dashed) {
    const sx = wx, sy = -wy;
    const mag = Math.sqrt(sx * sx + sy * sy);
    if (mag < 1e-10) return;
    const nx = sx / mag, ny = sy / mag;
    const ex = cx + nx * len, ey = cy + ny * len;
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    if (dashed) ctx.setLineDash([
      3,
      3
    ]);
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
  drawVector(-upX, -upY, gravLen, "rgba(255,255,255,0.45)", "G\u2641", false);
  const moon = getMoonPos(sim.time);
  const mdx = moon.x - sim.x, mdy = moon.y - sim.y;
  const moonDist = Math.sqrt(mdx * mdx + mdy * mdy);
  const moonGravMag = MOON_MU / (moonDist * moonDist);
  const planetGravMag = MU / (dist * dist);
  const moonRelScale = Math.min(0.8, Math.max(0.15, moonGravMag / planetGravMag));
  drawVector(mdx / moonDist, mdy / moonDist, radius * 0.55 * moonRelScale, "rgba(255,255,255,0.35)", "G\u263D", true);
  const spd = Math.sqrt(sim.vx * sim.vx + sim.vy * sim.vy);
  if (spd > 0.1) {
    drawVector(sim.vx / spd, sim.vy / spd, radius * 0.75, "rgba(255,255,255,0.9)", "V", false);
  }
  const thrX = Math.sin(sim.angle);
  const thrY = Math.cos(sim.angle);
  drawVector(thrX, thrY, radius * 0.65, "#fff", "\u2191", false);
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(cx, cy, 2.5, 0, Math.PI * 2);
  ctx.fill();
}
function renderSpacecraftView(ctx = flightCtx, W = flightCanvas.width, H = flightCanvas.height, pip = false) {
  ctx.clearRect(0, 0, W, H);
  if (!sim) return;
  const s = sim;
  const dist = Math.sqrt(s.x * s.x + s.y * s.y);
  const alt = dist - PLANET_RADIUS;
  const camScale = (alt < 500 ? 3 : alt < 5e3 ? 2 : alt < 5e4 ? 1 : 0.5) * (pip ? 1 : getZoomLevel());
  const pxPerMeter = camScale;
  const worldAngle = Math.atan2(s.x, s.y);
  const atmoPct = alt >= 0 && alt < ATMOSPHERE_HEIGHT ? 1 - alt / ATMOSPHERE_HEIGHT : 0;
  ctx.save();
  ctx.translate(W / 2, H / 2);
  drawStars(ctx, W, H, s.time, s.x, s.y, atmoPct);
  ctx.save();
  ctx.translate(-s.x * pxPerMeter, s.y * pxPerMeter);
  ctx.rotate(PLANET_ROTATION_ANGLE);
  drawPlanet(ctx, {
    worldAngle,
    pxPerMeter,
    W,
    H,
    simX: s.x,
    simY: s.y
  });
  ctx.restore();
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
    simTime: s.time
  });
  ctx.restore();
  const sat = s.satellite;
  if (sat.alive) {
    const satelliteScreenX = (sat.x - s.x) * pxPerMeter;
    const satelliteScreenY = -(sat.y - s.y) * pxPerMeter;
    const satAlt = Math.sqrt(sat.x * sat.x + sat.y * sat.y) - PLANET_RADIUS;
    if (satAlt < ATMOSPHERE_HEIGHT && satAlt >= 0) {
      const satSpeed = Math.sqrt(sat.vx * sat.vx + sat.vy * sat.vy);
      const atmoPct2 = 1 - satAlt / ATMOSPHERE_HEIGHT;
      const flameIntensity = Math.min(1, satSpeed / 4e3) * atmoPct2;
      if (flameIntensity > 0.01) {
        const tvx = -sat.vx / satSpeed, tvy = sat.vy / satSpeed;
        const flameLen = flameIntensity * 120 * pxPerMeter;
        const flameW = flameIntensity * 20 * pxPerMeter;
        ctx.save();
        ctx.translate(satelliteScreenX, satelliteScreenY);
        const grad = ctx.createLinearGradient(0, 0, tvx * flameLen, tvy * flameLen);
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
        for (const side of [
          -1,
          1
        ]) {
          const jitter = (0.6 + 0.4 * Math.sin(s.time * 18 + side * 3.7)) * flameIntensity;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(tvx * flameLen * 0.7 + px * side * flameW * 1.5, tvy * flameLen * 0.7 + py * side * flameW * 1.5);
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
  s.debris.forEach((d) => {
    ctx.save();
    ctx.translate((d.x - s.x) * pxPerMeter, -(d.y - s.y) * pxPerMeter);
    ctx.rotate(d.rot);
    drawDebrisPiece(ctx, d);
    ctx.restore();
  });
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
  const rot = s.angle;
  const comOffset = spacecraftComOffset(s.stages, s.currentStage, pxPerMeter);
  const chuteDeployed = s.flightState === "landing" || s.flightState === "landed";
  let chuteState = "none";
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
  const contrailIntensity = alt < ATMOSPHERE_HEIGHT && alt >= 0 && spd > 50 ? Math.min(1, contrailDynPressure / 15e3) : 0;
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
    chuteAngle,
    rcsActive: s.rcsActive,
    contrailAngle: chuteAngle,
    contrailIntensity,
    mach: contrailIntensity > 0.01 || contrailMach > 1 ? contrailMach : 0
  });
  ctx.restore();
  ctx.restore();
  if (atmoPct > 0 && !pip) {
    const grad = ctx.createRadialGradient(W / 2, H / 2, H * 0.2, W / 2, H / 2, H * 0.85);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(1, `rgba(255,255,255,${(atmoPct * 0.18).toFixed(3)})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);
  }
}
function renderOrbitalView() {
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
  const orbIntercepts = drawOrbitPath(ctx, sim.x, sim.y, sim.vx, sim.vy, scale, "rgba(255,255,255,0.5)");
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
  ctx.strokeStyle = "rgba(255,255,255,0.3)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, (PLANET_RADIUS + ATMOSPHERE_HEIGHT) * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = 1;
  ctx.setLineDash([
    5,
    5
  ]);
  ctx.beginPath();
  ctx.arc(0, 0, (PLANET_RADIUS + ORBIT_TARGET) * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (sim.satellite.alive) {
    ctx.strokeStyle = "rgba(255,255,255,0.2)";
    ctx.lineWidth = 1;
    ctx.setLineDash([
      2,
      6
    ]);
    ctx.beginPath();
    ctx.arc(0, 0, SATELLITE_ORBIT_RADIUS * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.15)";
  ctx.lineWidth = 1;
  ctx.setLineDash([
    4,
    4
  ]);
  ctx.beginPath();
  ctx.arc(0, 0, MOON_ORBIT_RADIUS * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
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
  const lagrangePoints = getLagrangePoints(sim.time);
  for (const [name, point] of Object.entries(lagrangePoints)) {
    const lx = point.x * scale, ly = -point.y * scale;
    const achieved = sim.achievements["lagrange" + name];
    ctx.strokeStyle = achieved ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)";
    ctx.fillStyle = achieved ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.25)";
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
function drawOrbitPath(ctx, x, y, vx, vy, scale, color) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  let ox = x, oy = y, ovx = vx, ovy = vy;
  const dt = 5;
  let predTime = sim ? sim.time : 0;
  let angleAccum = 0;
  let moonIntercept = null;
  let satIntercept = null;
  let prevDistToMoonOrbit = null;
  let prevDistToSatOrbit = null;
  ctx.moveTo(ox * scale, -oy * scale);
  for (let i = 0; i < 2e3; i++) {
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
      if (prevDistToMoonOrbit !== null && dtm < prevDistToMoonOrbit && dtm < MOON_ORBIT_RADIUS * 0.08) {
        moonIntercept = getMoonPos(predTime);
      }
      prevDistToMoonOrbit = dtm;
    }
    if (!satIntercept && sim?.satellite.alive) {
      const dts = Math.abs(d - SATELLITE_ORBIT_RADIUS);
      if (prevDistToSatOrbit !== null && dts < prevDistToSatOrbit && dts < SATELLITE_ORBIT_RADIUS * 0.04) {
        satIntercept = getSatellitePos(predTime);
      }
      prevDistToSatOrbit = dts;
    }
  }
  ctx.stroke();
  return {
    moonIntercept,
    satIntercept
  };
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
  const mmIntercepts = drawOrbitPath(ctx, sim.x, sim.y, sim.vx, sim.vy, scale, "rgba(255,255,255,0.35)");
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
  ctx.setLineDash([
    3,
    3
  ]);
  ctx.beginPath();
  ctx.arc(0, 0, (PLANET_RADIUS + ORBIT_TARGET) * scale, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  if (sim.satellite.alive) {
    ctx.strokeStyle = "rgba(255,255,255,0.15)";
    ctx.setLineDash([
      1,
      4
    ]);
    ctx.beginPath();
    ctx.arc(0, 0, SATELLITE_ORBIT_RADIUS * scale, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.strokeStyle = "rgba(255,255,255,0.1)";
  ctx.setLineDash([
    2,
    2
  ]);
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
    const achieved = sim.achievements["lagrange" + name];
    ctx.strokeStyle = achieved ? "rgba(255,255,255,0.7)" : "rgba(255,255,255,0.2)";
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
function drawInterceptMarkers(ctx, intercepts, scale) {
  if (intercepts.moonIntercept) {
    const { x, y } = intercepts.moonIntercept;
    const r = Math.max(MOON_RADIUS * scale, 3);
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([
      3,
      3
    ]);
    ctx.beginPath();
    ctx.arc(x * scale, -y * scale, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  if (intercepts.satIntercept) {
    const { x, y } = intercepts.satIntercept;
    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([
      3,
      3
    ]);
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
var starPositions = null;
function drawStars(ctx, W, H, time, ox = 0, oy = 0, atmoPct = 0) {
  if (!starPositions) {
    starPositions = [
      {
        x: 0,
        y: 2e3,
        s: 0.5,
        b: 1
      }
    ];
    for (let i = 0; i < 200; i++) {
      starPositions.push({
        x: (Math.random() - 0.5) * 3e3,
        y: (Math.random() - 0.5) * 3e3,
        s: Math.random() * 1.5 + 0.5,
        b: Math.random() * 0.5 + 0.5
      });
    }
  }
  const parallax = 5e-4;
  const offX = ox * parallax, offY = oy * parallax;
  const wrapW = 3e3, wrapH = 3e3;
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
setRenderFn(render);
setResizeCanvasFn(resizeCanvas);

// src/input.ts
function buildZoomText() {
  const sp = getSimSpeed();
  let text = "ZOOM " + getZoomLevel().toFixed(1) + "x";
  if (sp > 1) text += "  \xB7  " + sp + "x SPEED";
  return text;
}
function showSimSpeedIndicator() {
  const indicator = document.getElementById("zoom-indicator");
  if (indicator) {
    indicator.textContent = buildZoomText();
    indicator.classList.add("show");
  }
  setZoomIndicatorTimer(1.5);
  const sp = getSimSpeed();
  const speedEl = document.getElementById("sim-speed-indicator");
  if (speedEl) {
    if (sp > 1) {
      speedEl.textContent = "\u25BA\u25BA " + sp + "x";
      speedEl.style.display = "block";
    } else {
      speedEl.style.display = "none";
    }
  }
}
window.addEventListener("keydown", (e) => {
  keys[e.code] = true;
  if (e.code === "Escape") {
    e.preventDefault();
    if (sim && !sim.ended) togglePause();
    return;
  }
  if (getPaused()) return;
  if (e.code === "Space") {
    e.preventDefault();
    if (sim && !sim.ended) activateNextStage();
  }
  if (e.code === "KeyM") {
    e.preventDefault();
    const next = getViewMode() === "spacecraft" ? "orbital" : "spacecraft";
    setViewMode(next);
    const label = document.querySelector(".minimap-label");
    if (label) {
      label.textContent = next === "spacecraft" ? "Orbital Map" : "Spacecraft";
    }
  }
  if (e.code === "KeyG") {
    e.preventDefault();
    if (sim && !sim.ended) toggleLandingGear();
  }
  if (e.code === "NumpadAdd" || e.code === "Equal") {
    e.preventDefault();
    if (sim && !sim.ended && !getPaused()) {
      const idx = SIM_SPEEDS.indexOf(getSimSpeed());
      if (idx < SIM_SPEEDS.length - 1) setSimSpeed(SIM_SPEEDS[idx + 1]);
      showSimSpeedIndicator();
    }
  }
  if (e.code === "NumpadSubtract" || e.code === "Minus") {
    e.preventDefault();
    if (sim && !sim.ended && !getPaused()) {
      const idx = SIM_SPEEDS.indexOf(getSimSpeed());
      if (idx > 0) setSimSpeed(SIM_SPEEDS[idx - 1]);
      showSimSpeedIndicator();
    }
  }
  if ([
    "Space",
    "ArrowUp",
    "ArrowDown",
    "ArrowLeft",
    "ArrowRight",
    "KeyW",
    "KeyA",
    "KeyS",
    "KeyD"
  ].includes(e.code)) {
    e.preventDefault();
  }
});
window.addEventListener("keyup", (e) => {
  keys[e.code] = false;
});
window.addEventListener("wheel", (e) => {
  if (!sim || sim.ended) return;
  e.preventDefault();
  const zoomSpeed = 0.1;
  if (e.deltaY < 0) {
    const before = getZoomLevel();
    setZoomLevel(before * (1 + zoomSpeed));
    if (getZoomLevel() === before && getViewMode() === "orbital") {
      setZoomLevel(2 / before);
      setViewMode("spacecraft");
    }
  } else {
    const before = getZoomLevel();
    setZoomLevel(before / (1 + zoomSpeed));
    if (getZoomLevel() === before && getViewMode() === "spacecraft") {
      setZoomLevel(2 / before);
      setViewMode("orbital");
    }
  }
  const indicator = document.getElementById("zoom-indicator");
  if (indicator) {
    indicator.textContent = buildZoomText();
    indicator.classList.add("show");
  }
  setZoomIndicatorTimer(1.5);
}, {
  passive: false
});

// src/main.ts
window.addStage = addStage;
window.removeStage = removeStage;
window.adjustStageEngines = adjustStageEngines;
window.setStageTank = setStageTank;
window.setStageGear = setStageGear;
window.startFlight = startFlight;
window.restartMission = restartMission;
window.returnToStaging = returnToStaging;
window.showCredits = showCredits;
window.hideCredits = hideCredits;
window.togglePause = togglePause;
addStage();
renderStageList();
updatePreview();
