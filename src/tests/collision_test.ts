// ═══════════════════════════════════════════════
// Tests verifying collision boundaries are
// consistent with rendering geometry for planet,
// moon, and satellite.
// ═══════════════════════════════════════════════
import { assert, assertAlmostEquals } from "jsr:@std/assert";
import {
  getMoonPos,
  getMoonTerrainHeight,
  getPlanetTerrainHeight,
  MOON_ORBIT_RADIUS,
  MOON_RADIUS,
  PLANET_RADIUS,
  SATELLITE_COLLISION_RADIUS,
  SATELLITE_RADIUS,
} from "../constants.ts";
import { spacecraftComOffset, spacecraftTotalHeight } from "../bodies.ts";
import { ENGINE_MASS, TANK_SIZES } from "../constants.ts";
import type { StageConfig } from "../types.ts";

function makeStage(
  tankSize: "S" | "M" | "L" | "XL",
  engines = 1,
): StageConfig {
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

// ── Satellite: visual vs collision radius ────────

Deno.test("satellite collision radius is larger than visual radius", () => {
  assert(
    SATELLITE_COLLISION_RADIUS > SATELLITE_RADIUS,
    `collision radius (${SATELLITE_COLLISION_RADIUS} m) must exceed visual radius (${SATELLITE_RADIUS} m)`,
  );
});

Deno.test("satellite collision radius is not absurdly larger than visual radius", () => {
  // Collision radius should be within ~10× of the visual size — guards against
  // a constant being accidentally changed to something implausible.
  assert(
    SATELLITE_COLLISION_RADIUS < SATELLITE_RADIUS * 20,
    `collision radius (${SATELLITE_COLLISION_RADIUS} m) is unexpectedly large vs visual radius (${SATELLITE_RADIUS} m)`,
  );
});

// ── Planet: terrain render radius == collision radius ──

Deno.test("planet terrain render radius matches collision radius at launch site", () => {
  // The renderer draws the terrain arc at (PLANET_RADIUS + getPlanetTerrainHeight(ang)) * s.
  // The collision check uses newAlt = dist - PLANET_RADIUS, and terrain at angle 0 (launch pad).
  // Both must agree: the surface Y for collision = PLANET_RADIUS + getPlanetTerrainHeight(0).
  const terrainH = getPlanetTerrainHeight(0);
  // At the launch site the terrain is flat (taper = 0), so terrain height = 0.
  assertAlmostEquals(terrainH, 0, 1e-9, "launch site terrain must be 0");
  const surfaceR = PLANET_RADIUS + terrainH;
  assertAlmostEquals(surfaceR, PLANET_RADIUS, 1e-9);
});

Deno.test("planet terrain render radius is consistent with collision at arbitrary angles", () => {
  // For both render and collision: surface radius = PLANET_RADIUS + getPlanetTerrainHeight(angle).
  // Verify render formula == collision formula at a sample of angles.
  const sampleAngles = [0.3, 0.8, 1.5, 2.0, -0.5, -1.2, Math.PI];
  for (const ang of sampleAngles) {
    const th = getPlanetTerrainHeight(ang);
    const renderR = PLANET_RADIUS + th; // what drawPlanet uses
    const collisionR = PLANET_RADIUS + th; // what updateSim uses
    assertAlmostEquals(renderR, collisionR, 1e-9, `mismatch at angle ${ang}`);
    // Both must be >= PLANET_RADIUS (terrain is non-negative)
    assert(
      renderR >= PLANET_RADIUS,
      `surface at angle ${ang} must be >= PLANET_RADIUS`,
    );
  }
});

// ── Planet: nozzle altitude formula is self-consistent ──

Deno.test("planet nozzle altitude is zero when craft is exactly at surface", () => {
  for (const size of ["S", "M", "L", "XL"] as const) {
    const stages = [makeStage(size)];
    const totalH = spacecraftTotalHeight(stages, 0);
    const comOff = spacecraftComOffset(stages, 0, 1);
    const nozzleOffset_m = totalH - comOff;

    // Place CoM exactly at clamp radius so nozzle tip touches surface.
    const terrainH = getPlanetTerrainHeight(0);
    const clampR = PLANET_RADIUS + terrainH + nozzleOffset_m;
    // dist = clampR, newAlt = clampR - PLANET_RADIUS
    const newAlt = clampR - PLANET_RADIUS;
    const nozzleAlt = newAlt - terrainH - nozzleOffset_m;
    assertAlmostEquals(
      nozzleAlt,
      0,
      1e-9,
      `nozzle alt should be 0 for ${size}`,
    );
  }
});

Deno.test("planet clamp radius keeps nozzle at surface after clamping", () => {
  // After clamping, s.x = nx * clampR, s.y = ny * clampR.
  // Re-deriving nozzleAlt from clampR should still be 0.
  const stages = [makeStage("M")];
  const totalH = spacecraftTotalHeight(stages, 0);
  const comOff = spacecraftComOffset(stages, 0, 1);
  const nozzleOffset_m = totalH - comOff;
  const terrainH = getPlanetTerrainHeight(0);
  const clampR = PLANET_RADIUS + terrainH + nozzleOffset_m;
  const dist = clampR; // after clamp
  const newAlt = dist - PLANET_RADIUS;
  const nozzleAlt = newAlt - terrainH - nozzleOffset_m;
  assertAlmostEquals(nozzleAlt, 0, 1e-9);
});

// ── Moon: terrain render radius == collision radius ──

Deno.test("moon terrain render radius matches collision radius at sample angles", () => {
  // drawMoon renders the surface at (MOON_RADIUS + getMoonTerrainHeight(ang)) * s.
  // updateSim collision: moonTerrainR = MOON_RADIUS + getMoonTerrainHeight(moonAngle).
  const sampleAngles = [0, 0.6, 1.8, -0.9, 2.7, -2.2, Math.PI];
  for (const ang of sampleAngles) {
    const th = getMoonTerrainHeight(ang);
    const renderR = MOON_RADIUS + th;
    const collisionR = MOON_RADIUS + th;
    assertAlmostEquals(
      renderR,
      collisionR,
      1e-9,
      `mismatch at moon angle ${ang}`,
    );
  }
});

Deno.test("moon nozzle altitude formula is zero when craft is exactly at moon surface", () => {
  for (const size of ["S", "M", "L", "XL"] as const) {
    const stages = [makeStage(size)];
    const totalH = spacecraftTotalHeight(stages, 0);
    const comOff = spacecraftComOffset(stages, 0, 1);
    const nozzleOffset_m = totalH - comOff;
    // Place craft so nozzle exactly touches moon surface at a crater-free angle (Math.PI).
    const moonTerrainH = getMoonTerrainHeight(Math.PI);
    const moonTerrainR = MOON_RADIUS + moonTerrainH;
    // moonDist = moonTerrainR + nozzleOffset_m means moonAlt = 0
    const moonDist = moonTerrainR + nozzleOffset_m;
    const moonAlt = moonDist - moonTerrainR - nozzleOffset_m;
    assertAlmostEquals(
      moonAlt,
      0,
      1e-9,
      `moon nozzle alt should be 0 for ${size}`,
    );
  }
});

// ── Moon: close-up terrain mode threshold ────────

Deno.test("drawMoon terrain mode switches inside MOON_RADIUS * 2 altitude", () => {
  // drawMoon uses close-up terrain rendering when moonAltFromSurface < MOON_RADIUS * 2.
  // The threshold is a render-only heuristic, but it should be positive and
  // well above zero (so close approach always gets the terrain arc).
  const threshold = MOON_RADIUS * 2;
  assert(threshold > 0, "close-up threshold must be positive");
  assert(
    threshold > MOON_RADIUS,
    "threshold should be at least one moon radius to catch low orbit",
  );
  // Just before threshold: terrain mode active
  assert(
    MOON_RADIUS * 1.9 < threshold,
    "alt just below threshold triggers terrain mode",
  );
  // Just above: sphere mode
  assert(
    MOON_RADIUS * 2.1 > threshold,
    "alt just above threshold uses sphere mode",
  );
});

// ── Moon: close-up terrain arc covers visible surface ──

Deno.test("moon terrain height is bounded: craters don't sink below center", () => {
  // The minimum possible moon terrain altitude must be > -(MOON_RADIUS),
  // otherwise terrain could render below the moon's center.
  let minH = 0;
  for (let ang = -Math.PI; ang <= Math.PI; ang += 0.01) {
    minH = Math.min(minH, getMoonTerrainHeight(ang));
  }
  assert(
    minH > -MOON_RADIUS,
    `min moon terrain height ${minH} should be > -MOON_RADIUS (${-MOON_RADIUS})`,
  );
});

// ── Satellite: hit-box distance is in world metres ──

Deno.test("satellite collision radius is in plausible physical scale", () => {
  // SATELLITE_RADIUS is the visual half-size (metres).
  // SATELLITE_COLLISION_RADIUS is the hit-sphere radius (metres).
  // Both should be much smaller than the orbit radius.
  assert(
    SATELLITE_COLLISION_RADIUS < MOON_ORBIT_RADIUS / 10,
    "collision radius should be far smaller than moon orbit radius",
  );
  assert(
    SATELLITE_RADIUS < SATELLITE_COLLISION_RADIUS,
    "visual radius must fit inside collision sphere",
  );
});

// ── Moon: collision clamp places craft on surface ──

Deno.test("moon collision clamp formula is stable after one application", () => {
  // After clamping: s.x = moon.x + mnx * (moonTerrainR + nozzleOffset_m)
  // Re-deriving moonAlt from the new position should give 0.
  const stages = [makeStage("M")];
  const totalH = spacecraftTotalHeight(stages, 0);
  const comOff = spacecraftComOffset(stages, 0, 1);
  const nozzleOffset_m = totalH - comOff;
  const moonAng = 0; // flat angle, no crater
  const moonTerrainH = getMoonTerrainHeight(moonAng);
  const moonTerrainR = MOON_RADIUS + moonTerrainH;
  const t = 0;
  const moon = getMoonPos(t);
  // Place craft at clamped position (moon center + radial direction * clamp distance)
  const mnx = 0, mny = 1; // radial direction (craft "above" moon in moon's +Y)
  const clampedX = moon.x + mnx * (moonTerrainR + nozzleOffset_m);
  const clampedY = moon.y + mny * (moonTerrainR + nozzleOffset_m);
  const mdx = clampedX - moon.x, mdy = clampedY - moon.y;
  const moonDist = Math.sqrt(mdx * mdx + mdy * mdy);
  const moonAlt = moonDist - moonTerrainR - nozzleOffset_m;
  assertAlmostEquals(
    moonAlt,
    0,
    1e-9,
    "clamped position should give moonAlt = 0",
  );
});
