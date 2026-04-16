// ═══════════════════════════════════════════════
// Tests for pure geometry helpers in bodies.ts
// ═══════════════════════════════════════════════
import { assert, assertAlmostEquals, assertEquals } from "jsr:@std/assert";
import {
  engineXPositions,
  landingGearGeometry,
  nozzleY,
  rcsJetPositions,
} from "../bodies.ts";

// ── engineXPositions ─────────────────────────────

Deno.test("engineXPositions: single engine is centered", () => {
  const [cx] = engineXPositions(1, 20, 4);
  assertAlmostEquals(cx, 0, 1e-9);
});

Deno.test("engineXPositions: two engines are symmetric about center", () => {
  const [a, b] = engineXPositions(2, 20, 4);
  assertAlmostEquals(a, -b, 1e-9);
  assert(a < 0 && b > 0, "left engine should be negative, right positive");
});

Deno.test("engineXPositions: returns correct count", () => {
  for (const n of [1, 2, 3, 4, 5]) {
    assertEquals(engineXPositions(n, 30, 4).length, n);
  }
});

Deno.test("engineXPositions: all engines fit within tank width", () => {
  const tankW = 24, engW = 4;
  for (const n of [1, 2, 3, 4]) {
    const centers = engineXPositions(n, tankW, engW);
    for (const cx of centers) {
      assert(
        cx - engW / 2 >= -tankW / 2 - 1e-9 && cx + engW / 2 <= tankW / 2 + 1e-9,
        `engine center ${cx} with width ${engW} exceeds tank bounds ±${
          tankW / 2
        }`,
      );
    }
  }
});

Deno.test("engineXPositions: engines are evenly spaced", () => {
  const centers = engineXPositions(3, 30, 4);
  const gap1 = centers[1] - centers[0];
  const gap2 = centers[2] - centers[1];
  assertAlmostEquals(gap1, gap2, 1e-9);
});

Deno.test("engineXPositions: more engines means smaller gap (same tank)", () => {
  const two = engineXPositions(2, 30, 4);
  const three = engineXPositions(3, 30, 4);
  const gap2 = two[1] - two[0];
  const gap3 = three[1] - three[0];
  assert(gap3 < gap2, "3 engines should be more tightly packed than 2");
});

// ── nozzleY ──────────────────────────────────────

Deno.test("nozzleY: equals topY + tankH + engH", () => {
  assertAlmostEquals(nozzleY(10, 30, 8), 48, 1e-9);
  assertAlmostEquals(nozzleY(0, 0, 0), 0, 1e-9);
});

// ── rcsJetPositions ──────────────────────────────

const CAPH = 15, BOTTOMY = 40, TOP_HW = 5, BOT_HW = 8;

Deno.test("rcsJetPositions: no jets when all zeros", () => {
  const jets = rcsJetPositions(0, 0, 0, CAPH, BOTTOMY, TOP_HW, BOT_HW);
  assertEquals(jets.length, 0);
});

Deno.test("rcsJetPositions: forward thrust produces 2 jets at bottom face", () => {
  const jets = rcsJetPositions(1, 0, 0, CAPH, BOTTOMY, TOP_HW, BOT_HW);
  assertEquals(jets.length, 2);
  for (const j of jets) {
    assertAlmostEquals(j.y, BOTTOMY, 1e-9);
    assertAlmostEquals(j.dx, 0, 1e-9);
    assertAlmostEquals(j.dy, 1, 1e-9); // plume fires downward (+Y)
  }
  // One jet on each side
  assert(
    jets[0].x < 0 && jets[1].x > 0,
    "forward jets should be on left and right sides",
  );
});

Deno.test("rcsJetPositions: backward thrust produces 2 jets at nose face", () => {
  const jets = rcsJetPositions(-1, 0, 0, CAPH, BOTTOMY, TOP_HW, BOT_HW);
  assertEquals(jets.length, 2);
  for (const j of jets) {
    assertAlmostEquals(j.y, 0, 1e-9); // nose (Y=0)
    assertAlmostEquals(j.dy, -1, 1e-9); // plume fires upward (-Y)
  }
});

Deno.test("rcsJetPositions: right thrust fires jets from left face", () => {
  const jets = rcsJetPositions(0, 1, 0, CAPH, BOTTOMY, TOP_HW, BOT_HW);
  assertEquals(jets.length, 2); // one at nose, one at bottom
  for (const j of jets) {
    assert(
      j.dx < 0,
      "jets should point left (negative x) when thrusting right",
    );
    assert(j.x < 0, "jets should originate on left side");
  }
});

Deno.test("rcsJetPositions: left thrust fires jets from right face", () => {
  const jets = rcsJetPositions(0, -1, 0, CAPH, BOTTOMY, TOP_HW, BOT_HW);
  assertEquals(jets.length, 2);
  for (const j of jets) {
    assert(j.dx > 0, "jets should point right when thrusting left");
    assert(j.x > 0, "jets should originate on right side");
  }
});

Deno.test("rcsJetPositions: CW rotation produces 2 jets (nose-left fires left, tail-right fires right)", () => {
  const jets = rcsJetPositions(0, 0, 1, CAPH, BOTTOMY, TOP_HW, BOT_HW);
  assertEquals(jets.length, 2);
  const noseJet = jets.find((j) => j.y === 0)!;
  const tailJet = jets.find((j) => j.y === BOTTOMY)!;
  assert(
    noseJet !== undefined && tailJet !== undefined,
    "should have one nose and one tail jet",
  );
  assert(noseJet.x < 0, "CW nose jet originates on left side");
  assert(noseJet.dx < 0, "CW nose jet fires leftward");
  assert(tailJet.x > 0, "CW tail jet originates on right side");
  assert(tailJet.dx > 0, "CW tail jet fires rightward");
});

Deno.test("rcsJetPositions: CCW rotation is full mirror of CW (x and dx both flip)", () => {
  const cw = rcsJetPositions(0, 0, 1, CAPH, BOTTOMY, TOP_HW, BOT_HW);
  const ccw = rcsJetPositions(0, 0, -1, CAPH, BOTTOMY, TOP_HW, BOT_HW);
  assertEquals(cw.length, ccw.length);
  // Match jets by Y row (nose vs tail), then check both x and dx are negated
  for (const cwJet of cw) {
    const ccwJet = ccw.find((j) => Math.abs(j.y - cwJet.y) < 1e-9)!;
    assert(ccwJet !== undefined, `no matching CCW jet at y=${cwJet.y}`);
    assertAlmostEquals(
      cwJet.x + ccwJet.x,
      0,
      1e-9,
      `x should flip: CW=${cwJet.x}, CCW=${ccwJet.x}`,
    );
    assertAlmostEquals(
      cwJet.dx + ccwJet.dx,
      0,
      1e-9,
      `dx should flip: CW=${cwJet.dx}, CCW=${ccwJet.dx}`,
    );
  }
});

Deno.test("rcsJetPositions: all jets have unit direction vectors", () => {
  const cases: [number, number, number][] = [
    [1, 0, 0],
    [-1, 0, 0],
    [0, 1, 0],
    [0, -1, 0],
    [0, 0, 1],
    [0, 0, -1],
  ];
  for (const [f, r, rot] of cases) {
    const jets = rcsJetPositions(f, r, rot, CAPH, BOTTOMY, TOP_HW, BOT_HW);
    for (const j of jets) {
      const mag = Math.sqrt(j.dx * j.dx + j.dy * j.dy);
      assertAlmostEquals(
        mag,
        1,
        1e-9,
        `direction magnitude should be 1, got ${mag}`,
      );
    }
  }
});

// ── landingGearGeometry ──────────────────────────

Deno.test("landingGearGeometry: fully deployed gear spreads foot beyond tank edge", () => {
  const g = landingGearGeometry(1, 20, 50, 8, 1, 1.0);
  assert(
    g.footTip.x > 10,
    "deployed foot should be outside tank half-width (10)",
  );
});

Deno.test("landingGearGeometry: retracted gear foot is near tank edge", () => {
  const g = landingGearGeometry(1, 20, 50, 8, 1, 0.0);
  assertAlmostEquals(g.footTip.x, 10, 1e-6); // tankW/2 + 8*s*0 = 10
});

Deno.test("landingGearGeometry: left and right sides are mirrored", () => {
  const nozzle = 50;
  const left = landingGearGeometry(-1, 20, nozzle, 8, 1, 0.7);
  const right = landingGearGeometry(1, 20, nozzle, 8, 1, 0.7);
  assertAlmostEquals(left.footTip.x, -right.footTip.x, 1e-9);
  assertAlmostEquals(left.legAttach.x, -right.legAttach.x, 1e-9);
  assertAlmostEquals(left.strutAttach.x, -right.strutAttach.x, 1e-9);
  assertAlmostEquals(left.footTip.y, right.footTip.y, 1e-9);
});

Deno.test("landingGearGeometry: foot Y is at or above nozzle tip", () => {
  for (const ga of [0, 0.5, 1.0]) {
    const g = landingGearGeometry(1, 20, 50, 8, 1, ga);
    assert(
      g.footTip.y <= 50,
      `foot should be at or above nozzle Y (50), got ${g.footTip.y}`,
    );
  }
});

Deno.test("landingGearGeometry: footPadHalfW scales with pxPerMeter", () => {
  const g1 = landingGearGeometry(1, 20, 50, 8, 1, 1.0);
  const g2 = landingGearGeometry(1, 20, 50, 8, 2, 1.0);
  assertAlmostEquals(g2.footPadHalfW, g1.footPadHalfW * 2, 1e-9);
});

Deno.test("landingGearGeometry: strutAttach is above legAttach", () => {
  const g = landingGearGeometry(1, 20, 50, 8, 1, 1.0);
  assert(
    g.strutAttach.y < g.legAttach.y,
    "strut attach should be above leg attach (smaller Y)",
  );
});
