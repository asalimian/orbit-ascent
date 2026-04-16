// ═══════════════════════════════════════════════
// BODY RENDERERS
// ═══════════════════════════════════════════════
// Each function draws in its own local frame.
// The caller is responsible for ctx.save/translate/rotate/restore
// to place the body in screen space.
//
// Spacecraft local frame (draw-space):
//   Origin: capsule nose tip
//   +Y: toward engine (down-screen before world rotation) — Y-flipped from physics frame
//   +X: right
//
// Planet / Moon local frame:
//   Origin: body center
//   Angles measured from +Y axis (radially up = launch-site direction)
//   Body self-rotation applied by caller via ctx.rotate(BODY_ROTATION_ANGLE)
// ═══════════════════════════════════════════════

import {
  ATMOSPHERE_HEIGHT,
  CAPSULE_MASS,
  MOON_CRATERS,
  MOON_RADIUS,
  PLANET_RADIUS,
  SATELLITE_RADIUS,
  TANK_SIZES,
} from "./constants.ts";
import type {
  DrawSpacecraftOpts,
  LiveStage,
  StageConfig,
  TankSizeKey,
} from "./types.ts";

// ── Spacecraft geometry helpers ──────────────────

/** Total height of remaining rocket stack (nose to nozzle tip), in meters. */
export function spacecraftTotalHeight(
  stagesArr: StageConfig[],
  currentStage: number,
): number {
  const capH = 15, engH = 8;
  let h = capH;
  for (let i = currentStage; i < stagesArr.length; i++) {
    h += TANK_SIZES[stagesArr[i].tankSize].height * 0.3 + engH;
  }
  return h;
}

/**
 * Distance from nose (draw-space origin) to center of mass, in pixels.
 * (+Y toward engine). Callers use this to pivot rotation around CoM.
 */
export function spacecraftComOffset(
  stagesArr: StageConfig[],
  currentStage: number,
  pxPerMeter: number,
): number {
  const s = pxPerMeter;
  const engH = 8 * s;
  const capH = 15 * s;

  let scanY = capH;
  const stageOffsets: { topY: number; tankH: number; engH: number }[] = [];
  for (let i = stagesArr.length - 1; i >= currentStage; i--) {
    const tank = TANK_SIZES[stagesArr[i].tankSize];
    const tankH = tank.height * 0.3 * s;
    stageOffsets[i] = { topY: scanY, tankH, engH };
    scanY += tankH + engH;
  }

  let comY = 0, comMass = 0;
  comY += (capH / 2) * CAPSULE_MASS;
  comMass += CAPSULE_MASS;

  for (let i = stagesArr.length - 1; i >= currentStage; i--) {
    const stage = stagesArr[i] as LiveStage;
    const { topY, tankH } = stageOffsets[i];
    const stageCenter = topY + (tankH + engH) / 2;
    const stageMass = stage.dryMass + stage.fuel;
    comY += stageCenter * stageMass;
    comMass += stageMass;
  }

  return comY / comMass;
}

// ── Pure geometry helpers (no canvas) ────────────

/** A positioned jet plume: origin + unit direction in draw-space. */
export interface RcsJet {
  x: number;
  y: number;
  dx: number; // unit vector
  dy: number;
}

/**
 * X position of each engine nozzle center for a stage, in draw-space pixels.
 * Engines are spread evenly across the tank width.
 * `engW` is the width of a single engine bell (pixels); defaults to `4 * pxPerMeter`.
 * Returns an array of length `engines`, left-to-right.
 */
export function engineXPositions(
  engines: number,
  tankW: number, // pixels
  engW: number, // pixels — width of one engine bell
): number[] {
  const gap = engines > 1 ? (tankW - engines * engW) / (engines - 1) : 0;
  const startX = -((engines * engW + (engines - 1) * gap) / 2);
  const positions: number[] = [];
  for (let e = 0; e < engines; e++) {
    positions.push(startX + e * (engW + gap) + engW / 2);
  }
  return positions;
}

/**
 * Y coordinate of the nozzle exit for a given stage in draw-space pixels.
 * `topY` is the top edge of the tank; `tankH` and `engH` are in pixels.
 */
export function nozzleY(topY: number, tankH: number, engH: number): number {
  return topY + tankH + engH;
}

/**
 * RCS jet origins and directions for the current rcsActive state,
 * in spacecraft draw-space pixels (nose origin, +Y toward engine).
 *
 * Jets fire from the face *opposite* to the desired thrust direction
 * (reaction principle). Rotate jets fire near the nose and near the bottom.
 */
export function rcsJetPositions(
  forward: number, // -1 | 0 | 1
  right: number, // -1 | 0 | 1
  rotate: number, // -1 | 0 | 1
  capH: number, // pixels — capsule height
  bottomY: number, // pixels — Y of the bottom attachment point
  topHalfW: number, // pixels — half-width at nose (capsule shoulder)
  bottomHalfW: number, // pixels — half-width at bottom (current stage)
): RcsJet[] {
  const noseY_ = 0;
  const jets: RcsJet[] = [];

  if (forward !== 0) {
    // Thrusting forward (+Y) → jets fire from bottom face downward (+dy)
    // Thrusting backward (-Y) → jets fire from nose face upward (-dy)
    const faceY = forward > 0 ? bottomY : noseY_;
    const halfW = forward > 0 ? bottomHalfW : topHalfW;
    const plumeY = forward > 0 ? 1 : -1;
    for (const side of [-1, 1] as const) {
      jets.push({ x: side * halfW, y: faceY, dx: 0, dy: plumeY });
    }
  }
  if (right !== 0) {
    // Thrusting right (+X) → jets fire from left face (-dx)
    const sideX = -right;
    for (
      const [y, hw] of [[bottomY, bottomHalfW], [noseY_, topHalfW]] as [
        number,
        number,
      ][]
    ) {
      jets.push({ x: sideX * hw, y, dx: sideX, dy: 0 });
    }
  }
  if (rotate !== 0) {
    // Torque couple: each jet fires outward from the side it's mounted on.
    // CW (+1): nose jet on left (-x) fires left (-dx), tail jet on right (+x) fires right (+dx)
    // CCW (-1): nose jet on right (+x) fires right (+dx), tail jet on left (-x) fires left (-dx)
    jets.push({ x: -rotate * topHalfW, y: noseY_, dx: -rotate, dy: 0 });
    jets.push({ x: rotate * bottomHalfW, y: bottomY, dx: rotate, dy: 0 });
  }

  return jets;
}

/**
 * Landing gear geometry for one side in draw-space pixels.
 * Returns the foot tip position and leg/strut attach points.
 * `side` is -1 (left) or +1 (right).
 */
export interface GearGeometry {
  legAttach: { x: number; y: number };
  strutAttach: { x: number; y: number };
  footTip: { x: number; y: number };
  footPadHalfW: number;
}

export function landingGearGeometry(
  side: -1 | 1,
  tankW: number, // pixels — width of the bottom stage tank
  nozzleYVal: number, // pixels — Y of the nozzle exit
  engH: number, // pixels
  pxPerMeter: number,
  gearAnimation: number, // 0=retracted, 1=deployed
): GearGeometry {
  const s = pxPerMeter;
  const ga = gearAnimation;
  const legSpread = tankW / 2 + 8 * s * ga;
  const legDrop = nozzleYVal - engH * 0.3 * (1 - ga);
  const legAttachY = nozzleYVal - engH + 2 * s;
  const strutAttachY = legAttachY - 8 * s;
  const footPadHalfW = 1.5 * s;

  return {
    legAttach: { x: side * tankW / 2, y: legAttachY },
    strutAttach: { x: side * tankW / 2, y: strutAttachY },
    footTip: { x: side * legSpread, y: legDrop },
    footPadHalfW,
  };
}

// ── drawSpacecraft ───────────────────────────────

/**
 * Draws the full spacecraft in the spacecraft local frame.
 * Origin: capsule nose tip. +Y toward engine (down-screen).
 * Used by both the VAB staging preview and the flight screen.
 */
export function drawSpacecraft(
  ctx: CanvasRenderingContext2D,
  stagesArr: StageConfig[],
  pxPerMeter: number,
  opts: DrawSpacecraftOpts = {},
): void {
  const {
    currentStage = 0,
    ghostAlpha = 1,
    fuelFractions = null,
    gearAnimation = 1,
    throttle = 0,
    flightState = "staging",
    time = 0,
    chuteState = "none",
    chuteAngle = 0,
    showLabel = false,
    rcsActive = null,
    contrailAngle = 0,
    contrailIntensity = 0,
    mach = 0,
  } = opts;

  const s = pxPerMeter;
  const engH = 8 * s;

  const topTank = TANK_SIZES[stagesArr[stagesArr.length - 1].tankSize];
  const capW = topTank.width * s;
  const capH = 15 * s;

  // stageData[i].topY = Y of the top edge of that stage
  const stageData: {
    topY: number;
    tankH: number;
    tankW: number;
    engH: number;
  }[] = [];
  let scanY = capH;
  for (let i = stagesArr.length - 1; i >= currentStage; i--) {
    const tank = TANK_SIZES[stagesArr[i].tankSize];
    const tankH = tank.height * 0.3 * s;
    const tankW = tank.width * s;
    stageData[i] = { topY: scanY, tankH, tankW, engH };
    scanY += tankH + engH;
  }

  ctx.globalAlpha = ghostAlpha;

  // ── Parachute ──
  if (chuteState !== "none") {
    // Lines extend down to capsule shoulder so they always appear connected
    // even when the chute swings on its angle.
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
      ctx.quadraticCurveTo(
        -chuteW / 2 + sway,
        chuteTop - chuteH * 0.2,
        sway,
        chuteTop,
      );
      ctx.quadraticCurveTo(
        chuteW / 2 + sway,
        chuteTop - chuteH * 0.2,
        chuteW / 2,
        chuteTop + chuteH,
      );
      ctx.stroke();

      ctx.strokeStyle = "rgba(255,255,255,0.4)";
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
        ctx.quadraticCurveTo(
          tx + tflap,
          streamTop + streamH * 1.3,
          tx + tflap * 2,
          streamTop + streamH * 1.6,
        );
        ctx.stroke();
      }
    }
    ctx.restore(); // un-rotate chute
  }

  // ── Contrails + shockwave (draw-space, rotates with craft) ──
  if (contrailIntensity > 0.01 || mach > 1) {
    // Trail direction in draw-space from contrailAngle (angle from draw-space -Y axis).
    const trailDX = Math.sin(contrailAngle);
    const trailDY = -Math.cos(contrailAngle);

    const currentTank = currentStage < stagesArr.length
      ? TANK_SIZES[stagesArr[currentStage].tankSize]
      : null;
    const halfW = currentTank ? (currentTank.width / 2) * s : 8 * s;
    // Contrail origins at the sides of the current stage top
    const originY = currentTank ? stageData[currentStage]?.topY ?? capH : capH;

    if (contrailIntensity > 0.01) {
      const contrailLen = mach * 20 * s;
      for (const side of [-1, 1]) {
        // Origin at sides of the rocket body (perpendicular to craft Y axis = along X)
        const ox = side * halfW;
        const oy = originY;
        const grad = ctx.createLinearGradient(
          ox,
          oy,
          ox + trailDX * contrailLen,
          oy + trailDY * contrailLen,
        );
        grad.addColorStop(
          0,
          `rgba(255,255,255,${(contrailIntensity * 0.5).toFixed(3)})`,
        );
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ox, oy);
        ctx.lineTo(ox + trailDX * contrailLen, oy + trailDY * contrailLen);
        ctx.stroke();
      }
    }

    // Shockwave cone — tip at capsule nose (draw-space origin)
    if (mach > 1) {
      const shockIntensity = Math.min(1, (mach - 1) / 2);
      const halfAngle = Math.asin(1 / mach);
      const coneLen = mach * 30 * s;
      const wingAngle = Math.PI / 2 - halfAngle;
      const cosW = Math.cos(wingAngle), sinW = Math.sin(wingAngle);

      for (const side of [-1, 1]) {
        const wx = side === 1
          ? trailDX * cosW - trailDY * sinW
          : trailDX * cosW + trailDY * sinW;
        const wy = side === 1
          ? trailDX * sinW + trailDY * cosW
          : -trailDX * sinW + trailDY * cosW;
        const grad = ctx.createLinearGradient(0, 0, wx * coneLen, wy * coneLen);
        grad.addColorStop(
          0,
          `rgba(255,255,255,${(shockIntensity * 0.6).toFixed(3)})`,
        );
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

  // ── Capsule ──
  ctx.strokeStyle = "#fff";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-capW / 2, capH);
  ctx.lineTo(-capW / 3, 0);
  ctx.lineTo(capW / 3, 0);
  ctx.lineTo(capW / 2, capH);
  ctx.closePath();
    ctx.fillStyle = "#000"; 
  ctx.fill()
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(0, capH * 0.37, 2.5 * s, 0, Math.PI * 2);
  ctx.fillStyle = "#000"; 
  ctx.fill()
  ctx.stroke();

  // ── Stages ──
  for (let i = stagesArr.length - 1; i >= currentStage; i--) {
    const stage = stagesArr[i] as LiveStage;
    const { topY, tankH, tankW } = stageData[i];
    const nozzleY = topY + tankH + engH;
    const isActive = i === currentStage;

    // Interstage fairing
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

    // Tank
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

    // Fuel level
    const fuelFrac = fuelFractions
      ? fuelFractions[i]
      : (stage.fuel != null ? stage.fuel / stage.maxFuel : 1);
    if (fuelFrac > 0 && fuelFrac < 1) {
      ctx.strokeStyle = "rgba(255,255,255,0.5)";
      ctx.setLineDash([3, 3]);
      const fuelY = topY + tankH * (1 - fuelFrac);
      ctx.beginPath();
      ctx.moveTo(-tankW / 2 + 1, fuelY);
      ctx.lineTo(tankW / 2 - 1, fuelY);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Decoupler ring
    ctx.strokeStyle = "#fff";
    ctx.strokeRect(-tankW / 2 - 3, topY - 2, tankW + 6, 3);

    // Engines — use engineXPositions helper
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

      if (
        isActive && throttle > 0 && stage.fuel > 0 &&
        flightState !== "prelaunch"
      ) {
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

    // Landing gear (bottom stage only) — use landingGearGeometry helper
    if (stage.hasLandingGear && i === currentStage) {
      ctx.lineWidth = 1;
      for (const side of [-1, 1] as const) {
        const g = landingGearGeometry(
          side,
          tankW,
          nozzleY,
          engH,
          s,
          gearAnimation,
        );
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

  // ── RCS jets (spacecraft frame) — use rcsJetPositions helper ──
  if (rcsActive && (rcsActive.forward || rcsActive.right || rcsActive.rotate)) {
    const capsuleOnly = currentStage >= stagesArr.length;
    const capW2 = capsuleOnly
      ? 16 * s
      : TANK_SIZES[stagesArr[stagesArr.length - 1].tankSize].width * s;
    const topHalfW = capW2 / 3;
    const bottomHalfW = capsuleOnly
      ? capW2 / 2
      : TANK_SIZES[stagesArr[currentStage].tankSize].width * s / 2;
    const bottomY = capsuleOnly ? capH - 3 * s : scanY - 8 * s;

    const jets = rcsJetPositions(
      rcsActive.forward,
      rcsActive.right,
      rcsActive.rotate,
      capH,
      bottomY,
      topHalfW,
      bottomHalfW,
    );

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

// ── drawPlanet ───────────────────────────────────

interface DrawPlanetOpts {
  worldAngle: number;
  pxPerMeter: number;
  W: number;
  H: number;
  simX?: number;
  simY?: number;
  forcePad?: boolean;
}

export function drawPlanet(
  ctx: CanvasRenderingContext2D,
  opts: DrawPlanetOpts,
): void {
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

  const altAbovePad = opts.simX !== undefined && opts.simY !== undefined
    ? Math.sqrt(opts.simX ** 2 + opts.simY ** 2) - PLANET_RADIUS
    : Infinity;

  if (altAbovePad < 2000 || opts.forcePad) {
    const padR = PLANET_RADIUS * s;
    ctx.strokeStyle = "#fff";
    ctx.lineWidth = 1;
    ctx.strokeRect(-20 * s, -padR, 40 * s, 1 * s);
  }
}

// ── drawMoon ─────────────────────────────────────

interface DrawMoonOpts {
  craftAngleFromMoon: number;
  pxPerMeter: number;
  W: number;
  H: number;
  moonAltFromSurface: number;
  simTime: number;
}

export function drawMoon(
  ctx: CanvasRenderingContext2D,
  opts: DrawMoonOpts,
): void {
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

// ── drawSatellite ────────────────────────────────

export function drawSatellite(
  ctx: CanvasRenderingContext2D,
  pxPerMeter: number,
): void {
  const satelliteScreenR = SATELLITE_RADIUS * pxPerMeter;
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

  // Body
  ctx.beginPath();
  ctx.rect(-25, -60, 50, 120);
  ctx.fill();
  ctx.stroke();

  // Antenna
  ctx.beginPath();
  ctx.arc(0, 60, 20, 0, Math.PI, false);
  ctx.fill();
  ctx.stroke();
}

// ── drawDebrisPiece ──────────────────────────────

export function drawDebrisPiece(
  ctx: CanvasRenderingContext2D,
  d: { size: number; life: number },
): void {
  ctx.strokeStyle = `rgba(255, 255, 255, ${Math.min(1, d.life / 2)})`;
  ctx.lineWidth = 1;
  ctx.strokeRect(-d.size / 2, -d.size / 2, d.size, d.size);
}

// ── drawJettisonedStage ──────────────────────────

export function drawJettisonedStage(
  ctx: CanvasRenderingContext2D,
  j: { tankSize: TankSizeKey; engines: number },
  pxPerMeter: number,
): void {
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
