// ═══════════════════════════════════════════════
// SHARED MUTABLE STATE
// ═══════════════════════════════════════════════
//
// Hybrid approach:
//   - UI state (viewMode, paused, zoomLevel, simSpeed, zoomIndicatorTimer)
//     → getters/setters so mutation sites are explicit and searchable
//   - sim, keys
//     → plain exported mutable objects (touched every frame — setters add noise)
//
import type { SimState, ViewMode } from "./types.ts";

// ── sim ──────────────────────────────────────────
// Null until startFlight() initialises it.
// Mutated directly by simulation.ts every frame.
export let sim: SimState | null = null;
export function setSim(s: SimState | null): void {
  sim = s;
}

// ── keys ─────────────────────────────────────────
// Populated by input.ts keydown/keyup handlers.
// Read by simulation.ts every frame.
export const keys: Record<string, boolean> = {};

// ── viewMode ─────────────────────────────────────
let _viewMode: ViewMode = "spacecraft";
export function getViewMode(): ViewMode {
  return _viewMode;
}
export function setViewMode(v: ViewMode): void {
  _viewMode = v;
}

// ── paused ───────────────────────────────────────
let _paused = false;
export function getPaused(): boolean {
  return _paused;
}
export function setPaused(v: boolean): void {
  _paused = v;
}
export function togglePausedState(): boolean {
  _paused = !_paused;
  return _paused;
}

// ── zoomLevel ────────────────────────────────────
let _zoomLevel = 1.0;
export function getZoomLevel(): number {
  return _zoomLevel;
}
export function setZoomLevel(v: number): void {
  _zoomLevel = Math.max(0.1, Math.min(20, v));
}

// ── simSpeed ─────────────────────────────────────
export const SIM_SPEEDS = [1, 2, 10, 20, 50] as const;
export type SimSpeedValue = typeof SIM_SPEEDS[number];

let _simSpeed: SimSpeedValue = 1;
export function getSimSpeed(): SimSpeedValue {
  return _simSpeed;
}
export function setSimSpeed(v: SimSpeedValue): void {
  _simSpeed = v;
}

// ── zoomIndicatorTimer ───────────────────────────
let _zoomIndicatorTimer = 0;
export function getZoomIndicatorTimer(): number {
  return _zoomIndicatorTimer;
}
export function setZoomIndicatorTimer(v: number): void {
  _zoomIndicatorTimer = v;
}

// ── animFrame handle ─────────────────────────────
export let animFrame: number | null = null;
export function setAnimFrame(v: number | null): void {
  animFrame = v;
}

// ── savedStages (session-only restart data) ──────
// Not a getter/setter — only read/written by simulation.ts at start/restart.
import type { LiveStage } from "./types.ts";
export let savedStages: LiveStage[] = [];
export function setSavedStages(s: LiveStage[]): void {
  savedStages = s;
}
