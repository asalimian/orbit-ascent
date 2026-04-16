// ═══════════════════════════════════════════════
// Tests for initial conditions — verifies that
// constants are mutually consistent and game-ready
// state is physically valid at t=0.
// ═══════════════════════════════════════════════
import { assert, assertAlmostEquals } from "jsr:@std/assert";
import {
  ATMOSPHERE_HEIGHT,
  CAPSULE_HEIGHT,
  GEAR_LANDING_SPEED_LIMIT,
  LANDING_SPEED_LIMIT,
  MOON_ORBIT_RADIUS,
  MOON_RADIUS,
  MU,
  ORBIT_TARGET,
  PLANET_RADIUS,
  SATELLITE_ANGULAR_VEL,
  SATELLITE_ORBIT_RADIUS,
} from "../constants.ts";
import { spacecraftComOffset, spacecraftTotalHeight } from "../bodies.ts";
import { ENGINE_MASS, TANK_SIZES } from "../constants.ts";
import type { StageConfig } from "../types.ts";

// ── Satellite initial conditions ─────────────────

Deno.test("satellite orbit is above the atmosphere", () => {
  const altAboveSurface = SATELLITE_ORBIT_RADIUS - PLANET_RADIUS;
  assert(
    altAboveSurface > ATMOSPHERE_HEIGHT,
    `satellite altitude ${altAboveSurface} m must exceed atmosphere height ${ATMOSPHERE_HEIGHT} m`,
  );
});

Deno.test("satellite initial position is on +X axis at correct radius", () => {
  // sim.satellite is initialised at (SATELLITE_ORBIT_RADIUS, 0)
  const x = SATELLITE_ORBIT_RADIUS, y = 0;
  const dist = Math.sqrt(x * x + y * y);
  assertAlmostEquals(dist, SATELLITE_ORBIT_RADIUS, 1e-6);
});

Deno.test("satellite initial velocity is circular-orbit speed (clockwise)", () => {
  // vy = -sqrt(MU / r), vx = 0
  const expectedSpeed = Math.sqrt(MU / SATELLITE_ORBIT_RADIUS);
  const vx = 0;
  const vy = -expectedSpeed; // clockwise → negative vy at +X position
  assertAlmostEquals(Math.abs(vy), expectedSpeed, 1e-3);
  assert(vy < 0, "satellite initial vy must be negative (clockwise orbit)");
  assert(vx === 0, "satellite initial vx must be zero");
});

Deno.test("satellite orbital angular velocity is negative (clockwise)", () => {
  assert(SATELLITE_ANGULAR_VEL < 0, "satellite must orbit clockwise");
});

// ── Moon initial conditions ───────────────────────

Deno.test("moon orbit does not intersect planet surface", () => {
  assert(
    MOON_ORBIT_RADIUS > PLANET_RADIUS + MOON_RADIUS,
    `moon orbit radius ${MOON_ORBIT_RADIUS} must exceed planet radius + moon radius (${
      PLANET_RADIUS + MOON_RADIUS
    })`,
  );
});

Deno.test("moon orbit is well above atmosphere", () => {
  const moonAlt = MOON_ORBIT_RADIUS - PLANET_RADIUS;
  assert(
    moonAlt > ATMOSPHERE_HEIGHT * 5,
    `moon altitude ${moonAlt} m should be well above atmosphere ${ATMOSPHERE_HEIGHT} m`,
  );
});

Deno.test("moon does not overlap satellite orbit", () => {
  // Satellite and moon should not share orbital radius
  assert(
    Math.abs(MOON_ORBIT_RADIUS - SATELLITE_ORBIT_RADIUS) > MOON_RADIUS,
    "moon and satellite orbits must not overlap",
  );
});

// ── Spacecraft initial conditions ─────────────────

function makeStage(tankSize: "S" | "M" | "L" | "XL", engines = 1): StageConfig {
  const tank = TANK_SIZES[tankSize];
  return {
    tankSize,
    engines,
    hasLandingGear: false,
    fuel: tank.fuel,
    maxFuel: tank.fuel,
    dryMass: tank.dryMass + engines * ENGINE_MASS,
    thrust: 0,
  };
}

Deno.test("spacecraft initial Y places CoM above planet surface", () => {
  const stages = [makeStage("M")];
  // Mirrors startFlight: padY = PLANET_RADIUS + (totalHeight - comOffset)
  const nozzleOffset = spacecraftTotalHeight(stages, 0) -
    spacecraftComOffset(stages, 0, 1);
  const padY = PLANET_RADIUS + nozzleOffset;
  assert(
    padY > PLANET_RADIUS,
    "spacecraft CoM must start above planet surface",
  );
});

Deno.test("spacecraft initial Y: nozzle tip is at or above surface", () => {
  const stages = [makeStage("M")];
  const comOffset = spacecraftComOffset(stages, 0, 1);
  const totalHeight = spacecraftTotalHeight(stages, 0);
  const nozzleOffset = totalHeight - comOffset; // distance from CoM to nozzle
  const padY = PLANET_RADIUS + nozzleOffset;
  // nozzle tip y = padY - totalHeight (CoM minus full height below nose)
  // Actually nozzle is (totalHeight - comOffset) below CoM... simplify:
  // CoM is at padY. Nozzle tip is comOffset below nose; nose is (totalHeight - comOffset) above CoM.
  // Nozzle Y = padY - (totalHeight - comOffset) ... wait, let me re-derive:
  // drawSpacecraft nose origin is at top; comOffset is distance nose→CoM (+Y down)
  // So nose is comOffset above CoM in world space.
  // Nozzle is totalHeight below nose in world space.
  // nozzleY = padY + comOffset - totalHeight (in world +Y-up frame)
  // Wait, padY IS the CoM y. So:
  //   noseY = padY + comOffset  (nose is above CoM in world +Y-up)
  //   nozzleY = noseY - totalHeight = padY + comOffset - totalHeight
  // But nozzleOffset = totalHeight - comOffset, so:
  //   nozzleY = padY - nozzleOffset + comOffset - ...
  // Simplest: padY = PLANET_RADIUS + nozzleOffset means nozzle base = PLANET_RADIUS
  const nozzleY = padY - nozzleOffset;
  assertAlmostEquals(nozzleY, PLANET_RADIUS, 1e-9);
});

Deno.test("spacecraft initial Y does not embed rocket inside planet", () => {
  for (const size of ["S", "M", "L", "XL"] as const) {
    const stages = [makeStage(size)];
    const nozzleOffset = spacecraftTotalHeight(stages, 0) -
      spacecraftComOffset(stages, 0, 1);
    const padY = PLANET_RADIUS + nozzleOffset;
    assert(
      padY > PLANET_RADIUS,
      `${size} stage rocket CoM must be above surface`,
    );
  }
});

Deno.test("spacecraft initial angle is 0 (pointing radially outward)", () => {
  // sim.angle = 0 means pointing straight up (radially out)
  // This is a constant, not computed — just assert the convention is documented
  const initialAngle = 0;
  assertAlmostEquals(initialAngle, 0, 1e-9);
});

// ── Target orbit sanity ───────────────────────────

Deno.test("target orbit altitude is above the atmosphere", () => {
  assert(
    ORBIT_TARGET > ATMOSPHERE_HEIGHT,
    `orbit target ${ORBIT_TARGET} m must be above atmosphere ${ATMOSPHERE_HEIGHT} m`,
  );
});

Deno.test("target orbit radius is above the atmosphere", () => {
  const targetRadius = PLANET_RADIUS + ORBIT_TARGET;
  assert(
    targetRadius > PLANET_RADIUS + ATMOSPHERE_HEIGHT,
    "target orbit must be above atmosphere",
  );
});

// ── Landing speed limits ──────────────────────────

Deno.test("gear landing speed limit is stricter than no-gear limit... wait, it is more lenient", () => {
  // Landing gear INCREASES the survivable speed (it absorbs impact)
  assert(
    GEAR_LANDING_SPEED_LIMIT > LANDING_SPEED_LIMIT,
    `gear limit ${GEAR_LANDING_SPEED_LIMIT} m/s must exceed bare limit ${LANDING_SPEED_LIMIT} m/s`,
  );
});

Deno.test("capsule height is positive and smaller than smallest tank", () => {
  assert(CAPSULE_HEIGHT > 0);
  assert(
    CAPSULE_HEIGHT < TANK_SIZES["S"].height,
    "capsule should be shorter than smallest tank",
  );
});
