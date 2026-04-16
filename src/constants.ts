// ═══════════════════════════════════════════════
// CONSTANTS & PHYSICS
// ═══════════════════════════════════════════════
import type { LagrangePoints, TankSize, TankSizeKey } from "./types.ts";

export const PLANET_RADIUS = 6000;
export const G = 6.674e-11;
export const SURFACE_G = 9.81; // m/s²
export const PLANET_MASS = SURFACE_G * PLANET_RADIUS * PLANET_RADIUS / G;
export const MU = G * PLANET_MASS;

export const ATMOSPHERE_HEIGHT = 2000; // 70 km
export const SPEED_OF_SOUND = 340; // m/s at sea level
export const ORBIT_TARGET = 80000; // 80 km target orbit

// ── Terrain ──────────────────────────────────────

/** Planet terrain height (meters) at a given angle from the launch site (+Y axis). */
export function getPlanetTerrainHeight(angle: number): number {
  const a = ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) -
    Math.PI;
  const launchTaper = Math.min(1, Math.max(0, (Math.abs(a) - 0.15) / 0.2));
  const h = 220 * Math.sin(a * 3 + 1.1) +
    180 * Math.sin(a * 7 + 2.3) +
    90 * Math.sin(a * 13 + 0.7) +
    60 * Math.sin(a * 23 + 3.9);
  return Math.max(0, h) * launchTaper;
}

export const MOON_CRATERS: { angle: number; depth: number; radius: number }[] =
  [
    { angle: 0.6, depth: 180, radius: 0.18 },
    { angle: 1.8, depth: 120, radius: 0.12 },
    { angle: -0.9, depth: 200, radius: 0.22 },
    { angle: 2.7, depth: 90, radius: 0.10 },
    { angle: -2.2, depth: 150, radius: 0.16 },
  ];

/** Moon terrain height (meters) at a given angle. */
export function getMoonTerrainHeight(angle: number): number {
  let h = 0;
  for (const c of MOON_CRATERS) {
    const da = Math.abs(
      ((angle - c.angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) %
          (2 * Math.PI) - Math.PI,
    );
    if (da < c.radius * 2.5) {
      const t = da / c.radius;
      h += t < 1
        ? -c.depth * (1 - t * t)
        : c.depth * 0.4 * Math.exp(-(t - 1) * 4);
    }
  }
  return h;
}

// ── Satellite ────────────────────────────────────

export const SATELLITE_RADIUS = 15; // meters
export const SATELLITE_ORBIT_RADIUS = PLANET_RADIUS + ATMOSPHERE_HEIGHT + 2000;
export const SATELLITE_ORBIT_PERIOD = 2 * Math.PI *
  Math.sqrt(SATELLITE_ORBIT_RADIUS ** 3 / MU);
export const SATELLITE_ANGULAR_VEL = -(2 * Math.PI / SATELLITE_ORBIT_PERIOD);
export const SATELLITE_COLLISION_RADIUS = 80; // meters — hit box
export const SATELLITE_MASS = 500; // kg
export const SATELLITE_EXPLODE_SPEED = 150; // m/s relative impact speed

// ── Lagrange ─────────────────────────────────────

export const LAGRANGE_CAPTURE_RADIUS = 1500; // meters

// ── Moon ─────────────────────────────────────────

export const MOON_RADIUS = 1500; // meters
export const MOON_ORBIT_RADIUS = 30000; // meters from planet center
export const MOON_SURFACE_G = 1.6; // m/s²
export const MOON_MASS = MOON_SURFACE_G * MOON_RADIUS * MOON_RADIUS / G;
export const MOON_MU = G * MOON_MASS;
export const MOON_ORBIT_PERIOD = 2 * Math.PI *
  Math.sqrt(MOON_ORBIT_RADIUS ** 3 / MU);
export const MOON_ANGULAR_VEL = -(2 * Math.PI / MOON_ORBIT_PERIOD);

export function getLagrangePoints(time: number): LagrangePoints {
  const moonAngle = MOON_ANGULAR_VEL * time;
  const mu = MOON_MASS / (PLANET_MASS + MOON_MASS);
  const r = MOON_ORBIT_RADIUS;
  const cbrtMu3 = Math.cbrt(mu / 3);
  const ux = Math.cos(moonAngle), uy = Math.sin(moonAngle);
  const l4Angle = moonAngle + Math.PI / 3;
  const l5Angle = moonAngle - Math.PI / 3;
  return {
    L1: { x: r * (1 - cbrtMu3) * ux, y: r * (1 - cbrtMu3) * uy },
    L2: { x: r * (1 + cbrtMu3) * ux, y: r * (1 + cbrtMu3) * uy },
    L3: { x: -r * (1 + 5 / 12 * mu) * ux, y: -r * (1 + 5 / 12 * mu) * uy },
    L4: { x: r * Math.cos(l4Angle), y: r * Math.sin(l4Angle) },
    L5: { x: r * Math.cos(l5Angle), y: r * Math.sin(l5Angle) },
  };
}

export function getMoonPos(time: number): { x: number; y: number } {
  const angle = MOON_ANGULAR_VEL * time;
  return {
    x: MOON_ORBIT_RADIUS * Math.cos(angle),
    y: MOON_ORBIT_RADIUS * Math.sin(angle),
  };
}

export function getSatellitePos(time: number): { x: number; y: number } {
  const angle = SATELLITE_ANGULAR_VEL * time;
  return {
    x: SATELLITE_ORBIT_RADIUS * Math.cos(angle),
    y: SATELLITE_ORBIT_RADIUS * Math.sin(angle),
  };
}

// Body self-rotation angles (const 0 — plumbed for future rotation feature)
export const PLANET_ROTATION_ANGLE = 0;
export const MOON_ROTATION_ANGLE = 0;

// ── Engines & tanks ──────────────────────────────

export const ENGINE_THRUST = 200000; // 200 kN per engine
export const ENGINE_MASS = 500; // kg per engine
export const ENGINE_ISP = 320; // seconds
export const EXHAUST_VEL = ENGINE_ISP * SURFACE_G;

export const TANK_SIZES: Record<TankSizeKey, TankSize> = {
  S: {
    fuel: 2000,
    dryMass: 200,
    label: "Small",
    height: 30,
    width: 16,
    maxEngines: 2,
  },
  M: {
    fuel: 5000,
    dryMass: 400,
    label: "Medium",
    height: 50,
    width: 20,
    maxEngines: 3,
  },
  L: {
    fuel: 12000,
    dryMass: 800,
    label: "Large",
    height: 75,
    width: 24,
    maxEngines: 4,
  },
  XL: {
    fuel: 25000,
    dryMass: 1400,
    label: "Extra-L",
    height: 100,
    width: 28,
    maxEngines: 5,
  },
};

export const CAPSULE_MASS = 800; // kg
export const CAPSULE_HEIGHT = 25; // meters (visual)
export const PARACHUTE_CD = 1.5;
export const PARACHUTE_AREA = 80; // m² → ~10.4 m/s terminal velocity
export const LANDING_SPEED_LIMIT = 10; // m/s max survivable impact
export const GEAR_LANDING_SPEED_LIMIT = 20; // m/s with gear deployed
export const LANDING_GEAR_MASS = 150; // kg
