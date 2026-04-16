// ═══════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════

// ── Coordinate frame branded types ──────────────
//
// These prevent accidentally mixing vectors from different frames.
// A WorldVec cannot be passed where a DrawVec is expected.
//
// World frame:    origin at planet center, +Y up, meters
// Draw frame:     origin at spacecraft nose, +Y toward engine (canvas), pixels
// Canvas frame:   origin at top-left, +Y down, pixels

declare const __brand: unique symbol;
type Brand<T, B extends string> = T & { [__brand]: B };

export type WorldVec = Brand<{ x: number; y: number }, "world">;
export type DrawVec = Brand<{ x: number; y: number }, "draw">;
export type CanvasVec = Brand<{ x: number; y: number }, "canvas">;

export function worldVec(x: number, y: number): WorldVec {
  return { x, y } as WorldVec;
}
export function drawVec(x: number, y: number): DrawVec {
  return { x, y } as DrawVec;
}
export function canvasVec(x: number, y: number): CanvasVec {
  return { x, y } as CanvasVec;
}

// ── Tank / engine config ─────────────────────────

export interface TankSize {
  fuel: number; // kg of propellant
  dryMass: number; // kg
  label: string;
  height: number; // meters (visual)
  width: number; // meters (visual)
  maxEngines: number;
}

export type TankSizeKey = "S" | "M" | "L" | "XL";

// ── Stage config (VAB) ───────────────────────────

export interface StageConfig {
  tankSize: TankSizeKey;
  engines: number;
  hasLandingGear: boolean;
  // Computed fields (set by recomputeStage)
  fuel: number;
  maxFuel: number;
  dryMass: number;
  thrust: number;
}

// ── Live stage (in flight) ───────────────────────

export interface LiveStage extends StageConfig {
  maxFuel: number;
}

// ── Particle ─────────────────────────────────────

export interface Particle {
  x: number; // world meters
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
}

// ── Debris ───────────────────────────────────────

export interface Debris {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  rotV: number;
  size: number;
  life: number;
}

// ── Jettisoned stage ─────────────────────────────

export interface JettisonedStage {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rot: number;
  rotV: number;
  life: number;
  tankSize: TankSizeKey;
  engines: number;
}

// ── Satellite state ──────────────────────────────

export interface SatelliteState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  alive: boolean;
  rot: number;
  rotV: number;
}

// ── Achievements ─────────────────────────────────

export interface Achievements {
  orbitAchieved: boolean;
  lunarOrbit: boolean;
  moonLanding: boolean;
  moonLiftoff: boolean;
  returnToEarth: boolean;
  lagrangeL1: boolean;
  lagrangeL2: boolean;
  lagrangeL3: boolean;
  lagrangeL4: boolean;
  lagrangeL5: boolean;
}

// ── RCS active state ─────────────────────────────

export interface RcsActive {
  forward: number; // -1, 0, +1
  right: number; // -1, 0, +1
  rotate: number; // -1, 0, +1
}

// ── Flight state ─────────────────────────────────

export type FlightState =
  | "prelaunch"
  | "staging"
  | "freefall"
  | "landing"
  | "landed";

export type ChuteState = "none" | "inflated" | "squidding" | "collapsed";

export type ViewMode = "spacecraft" | "orbital";

// ── Sim state (mutable, owned by state.ts) ───────
// Plain mutable object — touched every frame, getters/setters would be noisy.

export interface SimState {
  // Position & velocity (world frame, meters)
  x: number;
  y: number;
  vx: number;
  vy: number;
  // Orientation
  angle: number; // radians relative to radial-out; 0 = pointing away from planet
  angularVel: number; // rad/s, CW-positive
  // Flight
  throttle: number; // 0–1
  flightState: FlightState;
  stages: LiveStage[];
  currentStage: number;
  // Effects
  particles: Particle[];
  rcsActive: RcsActive;
  debris: Debris[];
  jettisoned: JettisonedStage[];
  // Satellite
  satellite: SatelliteState;
  // Landing gear
  gearDeployed: boolean;
  gearAnimation: number; // 0=retracted, 1=deployed
  // Moon landing
  onMoon: boolean;
  moonLandAngle: number;
  // Tracking
  time: number;
  maxAlt: number;
  maxVel: number;
  ended: boolean;
  crashed: boolean;
  // UI
  notification: string;
  notifTimer: number;
  achievements: Achievements;
}

// ── Lagrange point ───────────────────────────────

export interface LagrangePoint {
  x: number; // world meters
  y: number;
}

export interface LagrangePoints {
  L1: LagrangePoint;
  L2: LagrangePoint;
  L3: LagrangePoint;
  L4: LagrangePoint;
  L5: LagrangePoint;
}

// ── Orbital elements ─────────────────────────────

export interface OrbitalElements {
  apoapsis: number; // meters above surface
  periapsis: number;
  period: number; // seconds
}

// ── Draw opts for drawSpacecraft ─────────────────

export interface DrawSpacecraftOpts {
  currentStage?: number;
  ghostAlpha?: number;
  fuelFractions?: number[] | null;
  gearAnimation?: number;
  throttle?: number;
  flightState?: FlightState;
  time?: number;
  chuteState?: ChuteState;
  chuteAngle?: number;
  showLabel?: boolean;
  rcsActive?: RcsActive | null;
  /** Angle from craft -Y axis (nose) to retrograde direction, in draw-space radians. */
  contrailAngle?: number;
  /** 0–1 intensity based on dynamic pressure. */
  contrailIntensity?: number;
  /** Current Mach number (for shockwave cone). */
  mach?: number;
}
