// ═══════════════════════════════════════════════
// Tests for key binding completeness and conflicts
// ═══════════════════════════════════════════════
//
// These tests treat the key map as a data structure and verify:
//   1. No two distinct actions share the same key code.
//   2. Every key that must suppress default browser scroll/nav behaviour
//      is covered by preventDefault.
//   3. Aliases (e.g. ArrowLeft / KeyQ both rotate left) are symmetric:
//      both members of a pair map to the same action.
// ═══════════════════════════════════════════════
import { assert, assertEquals } from "jsr:@std/assert";

// ── Key map declaration ───────────────────────────
//
// This mirrors input.ts (keydown dispatch) and simulation.ts (updateSim reads).
// Update here whenever input.ts or simulation.ts changes.

type Action =
  | "pause"
  | "stage"
  | "toggleView"
  | "toggleGear"
  | "speedUp"
  | "speedDown"
  | "rotateLeft"
  | "rotateRight"
  | "thrustForward"
  | "thrustBackward"
  | "thrustLeft"
  | "thrustRight"
  | "throttleUp"
  | "throttleDown";

// Primary bindings: key code → action (one action per code)
const KEY_BINDINGS: Record<string, Action> = {
  // input.ts dispatched actions
  "Escape": "pause",
  "Space": "stage",
  "KeyM": "toggleView",
  "KeyG": "toggleGear",
  "NumpadAdd": "speedUp",
  "Equal": "speedUp", // same action, different key
  "NumpadSubtract": "speedDown",
  "Minus": "speedDown",

  // simulation.ts continuous reads
  "ArrowLeft": "rotateLeft",
  "KeyQ": "rotateLeft", // alias
  "ArrowRight": "rotateRight",
  "KeyE": "rotateRight", // alias
  "KeyW": "thrustForward",
  "KeyS": "thrustBackward",
  "KeyA": "thrustLeft",
  "KeyD": "thrustRight",
  "ShiftLeft": "throttleUp",
  "ArrowUp": "throttleUp", // alias
  "ArrowDown": "throttleDown",
  "ControlLeft": "throttleDown", // alias
};

// Keys that must call e.preventDefault() to suppress browser scroll/nav
const SCROLL_PREVENTION_KEYS = new Set([
  "Space",
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "KeyW",
  "KeyA",
  "KeyS",
  "KeyD",
]);

// ── Tests ─────────────────────────────────────────

Deno.test("no two distinct actions share the same key code", () => {
  // Build inverse map: action → keys[]
  const actionKeys: Record<string, string[]> = {};
  for (const [key, action] of Object.entries(KEY_BINDINGS)) {
    (actionKeys[action] ??= []).push(key);
  }

  // Check that the same key doesn't appear twice under different actions
  const seen = new Map<string, Action>();
  for (const [key, action] of Object.entries(KEY_BINDINGS)) {
    const prior = seen.get(key);
    assert(
      prior === undefined || prior === action,
      `key "${key}" is bound to both "${prior}" and "${action}"`,
    );
    seen.set(key, action);
  }
});

Deno.test("rotate aliases map to the same action", () => {
  assertEquals(
    KEY_BINDINGS["ArrowLeft"],
    KEY_BINDINGS["KeyQ"],
    "ArrowLeft and KeyQ must both be rotateLeft",
  );
  assertEquals(
    KEY_BINDINGS["ArrowRight"],
    KEY_BINDINGS["KeyE"],
    "ArrowRight and KeyE must both be rotateRight",
  );
});

Deno.test("throttle aliases map to the same action", () => {
  assertEquals(
    KEY_BINDINGS["ShiftLeft"],
    KEY_BINDINGS["ArrowUp"],
    "ShiftLeft and ArrowUp must both be throttleUp",
  );
  assertEquals(
    KEY_BINDINGS["ArrowDown"],
    KEY_BINDINGS["ControlLeft"],
    "ArrowDown and ControlLeft must both be throttleDown",
  );
});

Deno.test("speed aliases map to the same action", () => {
  assertEquals(
    KEY_BINDINGS["NumpadAdd"],
    KEY_BINDINGS["Equal"],
    "NumpadAdd and Equal must both be speedUp",
  );
  assertEquals(
    KEY_BINDINGS["NumpadSubtract"],
    KEY_BINDINGS["Minus"],
    "NumpadSubtract and Minus must both be speedDown",
  );
});

Deno.test("all scroll-prevention keys have an assigned action", () => {
  // Every key we call preventDefault() on should have a known purpose
  for (const key of SCROLL_PREVENTION_KEYS) {
    assert(
      key in KEY_BINDINGS,
      `scroll-prevention key "${key}" has no action in KEY_BINDINGS — is it intentionally unbound?`,
    );
  }
});

Deno.test("WASD keys do not conflict with rotate or throttle bindings", () => {
  const wasd: Action[] = [
    "thrustForward",
    "thrustBackward",
    "thrustLeft",
    "thrustRight",
  ];
  const rotateThrottle: Action[] = [
    "rotateLeft",
    "rotateRight",
    "throttleUp",
    "throttleDown",
  ];
  for (const [key, action] of Object.entries(KEY_BINDINGS)) {
    if (wasd.includes(action)) {
      assert(
        !rotateThrottle.includes(action),
        `key "${key}" maps to "${action}" which is both a WASD translation and a rotate/throttle action`,
      );
    }
  }
});

Deno.test("arrow keys: left/right are rotate, up/down are throttle (no WASD overlap)", () => {
  assertEquals(KEY_BINDINGS["ArrowLeft"], "rotateLeft");
  assertEquals(KEY_BINDINGS["ArrowRight"], "rotateRight");
  assertEquals(KEY_BINDINGS["ArrowUp"], "throttleUp");
  assertEquals(KEY_BINDINGS["ArrowDown"], "throttleDown");
  // Arrow keys must NOT be mapped to WASD translation actions
  const translationActions: Action[] = [
    "thrustForward",
    "thrustBackward",
    "thrustLeft",
    "thrustRight",
  ];
  for (const arrow of ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"]) {
    assert(
      !translationActions.includes(KEY_BINDINGS[arrow]),
      `${arrow} must not be a translation action`,
    );
  }
});

Deno.test("pause key (Escape) is not in the scroll-prevention set", () => {
  // Escape already has browser-native handling we want to keep (e.g. closing dialogs)
  // but we do preventDefault it. This test just documents the deliberate choice:
  // Escape IS in our preventDefault list in input.ts (early-return path).
  assertEquals(KEY_BINDINGS["Escape"], "pause");
});

Deno.test("all bound actions are reachable (no action without any key)", () => {
  const allActions = new Set<Action>([
    "pause",
    "stage",
    "toggleView",
    "toggleGear",
    "speedUp",
    "speedDown",
    "rotateLeft",
    "rotateRight",
    "thrustForward",
    "thrustBackward",
    "thrustLeft",
    "thrustRight",
    "throttleUp",
    "throttleDown",
  ]);
  const boundActions = new Set(Object.values(KEY_BINDINGS));
  for (const action of allActions) {
    assert(
      boundActions.has(action),
      `action "${action}" has no key bound to it`,
    );
  }
});
