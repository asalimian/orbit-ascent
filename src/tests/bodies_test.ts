// ═══════════════════════════════════════════════
// Tests for bodies.ts — spacecraft geometry helpers
// ═══════════════════════════════════════════════
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert";
import { spacecraftComOffset, spacecraftTotalHeight } from "../bodies.ts";
import { CAPSULE_MASS, ENGINE_MASS, TANK_SIZES } from "../constants.ts";
import type { StageConfig } from "../types.ts";

// ── Helpers ──────────────────────────────────────

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

// ── spacecraftTotalHeight ────────────────────────

Deno.test("spacecraftTotalHeight: capsule-only (no stages left)", () => {
  // currentStage >= stagesArr.length → only capsule
  const stages = [makeStage("S")];
  const h = spacecraftTotalHeight(stages, 1); // past last stage
  assertEquals(h, 15); // just capH
});

Deno.test("spacecraftTotalHeight: single stage includes tank + engine", () => {
  const stages = [makeStage("S")];
  const h = spacecraftTotalHeight(stages, 0);
  // capH=15, tankH = 30*0.3=9, engH=8
  assertAlmostEquals(h, 15 + 9 + 8, 1e-9);
});

Deno.test("spacecraftTotalHeight: two stages stack additively", () => {
  const stages = [makeStage("M"), makeStage("S")]; // S is stage 0 (bottom), M is stage 1 (top)
  const h = spacecraftTotalHeight(stages, 0);
  // capH=15 + stage1(M: 50*0.3=15 + 8) + stage0(S: 30*0.3=9 + 8)
  const expected = 15 + (15 + 8) + (9 + 8);
  assertAlmostEquals(h, expected, 1e-9);
});

Deno.test("spacecraftTotalHeight: increases with larger tank size", () => {
  const hS = spacecraftTotalHeight([makeStage("S")], 0);
  const hM = spacecraftTotalHeight([makeStage("M")], 0);
  const hL = spacecraftTotalHeight([makeStage("L")], 0);
  const hXL = spacecraftTotalHeight([makeStage("XL")], 0);
  assert(hS < hM && hM < hL && hL < hXL, "height should grow with tank size");
});

// ── spacecraftComOffset ──────────────────────────

Deno.test("spacecraftComOffset: CoM is below capsule nose (positive in draw-space)", () => {
  const stages = [makeStage("S")];
  const offset = spacecraftComOffset(stages, 0, 1);
  assert(
    offset > 0,
    "CoM offset from nose should be positive (+Y toward engine)",
  );
});

Deno.test("spacecraftComOffset: CoM is within rocket bounds", () => {
  const stages = [makeStage("M")];
  const pxPerMeter = 1;
  const offset = spacecraftComOffset(stages, 0, pxPerMeter);
  const totalH = spacecraftTotalHeight(stages, 0);
  // The capsule height in draw-space is 15*pxPerMeter; full height is totalH*pxPerMeter
  // But spacecraftComOffset already accounts for pxPerMeter internally
  assert(
    offset > 0 && offset < totalH * pxPerMeter,
    `CoM offset ${offset} should be within rocket height ${
      totalH * pxPerMeter
    }`,
  );
});

Deno.test("spacecraftComOffset: scales linearly with pxPerMeter", () => {
  const stages = [makeStage("L")];
  const o1 = spacecraftComOffset(stages, 0, 1);
  const o2 = spacecraftComOffset(stages, 0, 2);
  assertAlmostEquals(o2, o1 * 2, 1e-6);
});

Deno.test("spacecraftComOffset: CoM shifts toward capsule as fuel depletes", () => {
  const stages = [makeStage("XL")];
  const full = { ...stages[0], fuel: stages[0].maxFuel };
  const empty = { ...stages[0], fuel: 0 };
  const oFull = spacecraftComOffset([full], 0, 1);
  const oEmpty = spacecraftComOffset([empty], 0, 1);
  // With no fuel the stage is lighter so the capsule (near the nose) dominates
  // → CoM moves toward nose (smaller offset)
  assert(
    oEmpty < oFull,
    `empty stage CoM (${oEmpty}) should be closer to nose than full stage CoM (${oFull})`,
  );
});

Deno.test("spacecraftComOffset: capsule-only case returns capsule centroid", () => {
  const stages = [makeStage("S")];
  // currentStage = 1 means all stages jettisoned — only capsule remains
  const pxPerMeter = 1;
  const offset = spacecraftComOffset(stages, 1, pxPerMeter);
  // Pure capsule: comY = (capH/2)*CAPSULE_MASS / CAPSULE_MASS = capH/2 = 7.5
  assertAlmostEquals(offset, 7.5 * pxPerMeter, 1e-6);
});

Deno.test("spacecraftComOffset: more stages moves CoM further from nose", () => {
  const one = [makeStage("M")];
  const two = [makeStage("S"), makeStage("M")]; // two stages; currentStage=0
  const o1 = spacecraftComOffset(one, 0, 1);
  const o2 = spacecraftComOffset(two, 0, 1);
  assert(o2 > o1, "more stages below should push CoM further from nose");
});

// ── Stage mass sanity ────────────────────────────

Deno.test("stage dryMass includes engine mass", () => {
  const s = makeStage("S", 2);
  assertEquals(s.dryMass, TANK_SIZES["S"].dryMass + 2 * ENGINE_MASS);
});

Deno.test("stage fuel matches tank capacity", () => {
  for (const size of ["S", "M", "L", "XL"] as const) {
    const s = makeStage(size);
    assertEquals(s.fuel, TANK_SIZES[size].fuel);
    assertEquals(s.maxFuel, TANK_SIZES[size].fuel);
  }
});
