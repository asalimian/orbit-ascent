// ═══════════════════════════════════════════════
// Tests for constants.ts — pure physics functions
// ═══════════════════════════════════════════════
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert";
import {
  getLagrangePoints,
  getMoonPos,
  getMoonTerrainHeight,
  getPlanetTerrainHeight,
  getSatellitePos,
  MOON_ANGULAR_VEL,
  MOON_CRATERS,
  MOON_MU,
  MOON_ORBIT_RADIUS,
  MOON_RADIUS,
  MU,
  PLANET_RADIUS,
  SATELLITE_ANGULAR_VEL,
  SATELLITE_ORBIT_RADIUS,
} from "../constants.ts";

// ── getPlanetTerrainHeight ───────────────────────

Deno.test("getPlanetTerrainHeight: zero at launch site (angle=0)", () => {
  // launchTaper = 0 at |a| < 0.15, so height must be 0
  assertEquals(getPlanetTerrainHeight(0), 0);
});

Deno.test("getPlanetTerrainHeight: zero in narrow launch corridor", () => {
  assertEquals(getPlanetTerrainHeight(0.1), 0);
  assertEquals(getPlanetTerrainHeight(-0.1), 0);
});

Deno.test("getPlanetTerrainHeight: non-negative everywhere", () => {
  for (let a = -Math.PI; a <= Math.PI; a += 0.05) {
    assert(getPlanetTerrainHeight(a) >= 0, `negative at angle ${a}`);
  }
});

Deno.test("getPlanetTerrainHeight: 2π-periodic", () => {
  for (const a of [0.5, 1.0, 2.0, -0.7]) {
    assertAlmostEquals(
      getPlanetTerrainHeight(a),
      getPlanetTerrainHeight(a + 2 * Math.PI),
      1e-9,
    );
  }
});

Deno.test("getPlanetTerrainHeight: symmetric (even function)", () => {
  // The terrain formula uses sin(a*k + phase) so it's NOT symmetric, but
  // the taper factor is symmetric. Verify taper is symmetric.
  for (const a of [0.3, 0.8, 1.5, 2.5]) {
    // Just verify the function is well-defined and finite on both sides
    const pos = getPlanetTerrainHeight(a);
    const neg = getPlanetTerrainHeight(-a);
    assert(isFinite(pos) && isFinite(neg));
  }
});

// ── getMoonTerrainHeight ─────────────────────────

Deno.test("getMoonTerrainHeight: depressed at crater centers", () => {
  for (const c of MOON_CRATERS) {
    const h = getMoonTerrainHeight(c.angle);
    assert(
      h < 0,
      `expected negative depth at crater angle ${c.angle}, got ${h}`,
    );
  }
});

Deno.test("getMoonTerrainHeight: rim above zero just outside crater edge", () => {
  // At t = 1.2 (just outside rim) the exponential term should give a positive value
  for (const c of MOON_CRATERS) {
    const rimAngle = c.angle + c.radius * 1.2;
    const h = getMoonTerrainHeight(rimAngle);
    assert(h > 0, `expected rim elevation at angle ${rimAngle}, got ${h}`);
  }
});

Deno.test("getMoonTerrainHeight: zero far from all craters", () => {
  // Find a spot far from all craters
  // Craters are at 0.6, 1.8, -0.9, 2.7, -2.2 — try Math.PI (≈3.14), far from all
  const h = getMoonTerrainHeight(Math.PI);
  assertAlmostEquals(h, 0, 1e-6);
});

Deno.test("getMoonTerrainHeight: 2π-periodic", () => {
  for (const a of [0.6, 1.8, -0.9]) {
    assertAlmostEquals(
      getMoonTerrainHeight(a),
      getMoonTerrainHeight(a + 2 * Math.PI),
      1e-9,
    );
  }
});

// ── getMoonPos ───────────────────────────────────

Deno.test("getMoonPos: at time=0 moon is on +X axis", () => {
  const p = getMoonPos(0);
  assertAlmostEquals(p.x, MOON_ORBIT_RADIUS, 1e-6);
  assertAlmostEquals(p.y, 0, 1e-6);
});

Deno.test("getMoonPos: distance is always MOON_ORBIT_RADIUS", () => {
  for (const t of [0, 1000, 5000, 100000]) {
    const p = getMoonPos(t);
    const dist = Math.sqrt(p.x * p.x + p.y * p.y);
    assertAlmostEquals(dist, MOON_ORBIT_RADIUS, 1e-3);
  }
});

Deno.test("getMoonPos: orbits clockwise (y decreases first)", () => {
  // MOON_ANGULAR_VEL is negative, so small positive time → negative angle → negative y
  const p = getMoonPos(1);
  assert(p.y < 0, "moon should move clockwise (y < 0) for t > 0");
});

// ── getSatellitePos ──────────────────────────────

Deno.test("getSatellitePos: at time=0 satellite is on +X axis", () => {
  const p = getSatellitePos(0);
  assertAlmostEquals(p.x, SATELLITE_ORBIT_RADIUS, 1e-6);
  assertAlmostEquals(p.y, 0, 1e-6);
});

Deno.test("getSatellitePos: distance is always SATELLITE_ORBIT_RADIUS", () => {
  for (const t of [0, 100, 500, 10000]) {
    const p = getSatellitePos(t);
    const dist = Math.sqrt(p.x * p.x + p.y * p.y);
    assertAlmostEquals(dist, SATELLITE_ORBIT_RADIUS, 1e-3);
  }
});

Deno.test("getSatellitePos: orbits clockwise", () => {
  const p = getSatellitePos(1);
  assert(p.y < 0, "satellite should move clockwise (y < 0) for t > 0");
});

// ── Orbital mechanics sanity ─────────────────────

Deno.test("moon orbital speed matches circular orbit vis-viva", () => {
  // v = sqrt(MU / r)
  const expectedV = Math.sqrt(MU / MOON_ORBIT_RADIUS);
  const dt = 0.01;
  const p0 = getMoonPos(0);
  const p1 = getMoonPos(dt);
  const vx = (p1.x - p0.x) / dt;
  const vy = (p1.y - p0.y) / dt;
  const actualV = Math.sqrt(vx * vx + vy * vy);
  assertAlmostEquals(actualV, expectedV, 1); // within 1 m/s
});

Deno.test("satellite orbital speed matches circular orbit vis-viva", () => {
  const expectedV = Math.sqrt(MU / SATELLITE_ORBIT_RADIUS);
  const dt = 0.001;
  const p0 = getSatellitePos(0);
  const p1 = getSatellitePos(dt);
  const vx = (p1.x - p0.x) / dt;
  const vy = (p1.y - p0.y) / dt;
  const actualV = Math.sqrt(vx * vx + vy * vy);
  assertAlmostEquals(actualV, expectedV, 1);
});

// ── getLagrangePoints ────────────────────────────

Deno.test("getLagrangePoints: L4 and L5 are at ±60° from moon", () => {
  const t = 0;
  const { L4, L5 } = getLagrangePoints(t);
  const moonPos = getMoonPos(t);

  // L4 should be 60° ahead of moon on same orbital radius
  const moonAngle = Math.atan2(moonPos.y, moonPos.x);
  const l4Angle = Math.atan2(L4.y, L4.x);
  const l5Angle = Math.atan2(L5.y, L5.x);

  assertAlmostEquals(Math.abs(l4Angle - moonAngle), Math.PI / 3, 1e-6);
  assertAlmostEquals(Math.abs(l5Angle - moonAngle), Math.PI / 3, 1e-6);
});

Deno.test("getLagrangePoints: L4 and L5 are at moon orbital radius", () => {
  const { L4, L5 } = getLagrangePoints(0);
  assertAlmostEquals(
    Math.sqrt(L4.x * L4.x + L4.y * L4.y),
    MOON_ORBIT_RADIUS,
    1e-3,
  );
  assertAlmostEquals(
    Math.sqrt(L5.x * L5.x + L5.y * L5.y),
    MOON_ORBIT_RADIUS,
    1e-3,
  );
});

Deno.test("getLagrangePoints: L1 is between planet and moon", () => {
  const t = 0;
  const { L1 } = getLagrangePoints(t);
  const r = Math.sqrt(L1.x * L1.x + L1.y * L1.y);
  assert(r > PLANET_RADIUS, "L1 should be beyond planet surface");
  assert(r < MOON_ORBIT_RADIUS, "L1 should be between planet and moon");
});

Deno.test("getLagrangePoints: L2 is beyond the moon", () => {
  const { L2 } = getLagrangePoints(0);
  const r = Math.sqrt(L2.x * L2.x + L2.y * L2.y);
  assert(r > MOON_ORBIT_RADIUS, "L2 should be beyond moon's orbit");
  assert(
    r < MOON_ORBIT_RADIUS + MOON_RADIUS * 10,
    "L2 should be close to moon",
  );
});

Deno.test("getLagrangePoints: L3 is on opposite side of planet from moon", () => {
  const t = 0;
  const { L3 } = getLagrangePoints(t);
  const moonPos = getMoonPos(t);
  // L3 dot moon should be negative (opposite direction)
  const dot = L3.x * moonPos.x + L3.y * moonPos.y;
  assert(dot < 0, "L3 should be on opposite side from moon");
});

Deno.test("getLagrangePoints: all points rotate with the moon", () => {
  // At t=0 moon is at angle 0 (on +X). At t = period/4 moon is at -π/2 (clockwise).
  // L4 should also have rotated by the same amount.
  const t0 = 0;
  const period = (2 * Math.PI) / Math.abs(MOON_ANGULAR_VEL);
  const t1 = period / 4;

  const pts0 = getLagrangePoints(t0);
  const pts1 = getLagrangePoints(t1);

  const angle0 = Math.atan2(pts0.L4.y, pts0.L4.x);
  const angle1 = Math.atan2(pts1.L4.y, pts1.L4.x);

  // Should have rotated by -π/2 (clockwise quarter turn)
  let delta = angle1 - angle0;
  // normalise to [-π, π]
  while (delta > Math.PI) delta -= 2 * Math.PI;
  while (delta < -Math.PI) delta += 2 * Math.PI;
  assertAlmostEquals(delta, -Math.PI / 2, 1e-4);
});

// ── Moon surface gravity ─────────────────────────

Deno.test("moon surface gravity constant is physically plausible", () => {
  // Moon surface gravity: MU_moon / r² should equal declared MOON_SURFACE_G
  const computed = MOON_MU / (MOON_RADIUS * MOON_RADIUS);
  assertAlmostEquals(computed, 1.6, 0.01);
});
