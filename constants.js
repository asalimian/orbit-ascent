// ═══════════════════════════════════════════════
// CONSTANTS & PHYSICS
// ═══════════════════════════════════════════════
const PLANET_RADIUS = 6000;
const G = 6.674e-11;
const SURFACE_G = 9.81; // m/s²
const PLANET_MASS = SURFACE_G * PLANET_RADIUS * PLANET_RADIUS / G; // kg - tuned for Kerbin-like
const MU = G * PLANET_MASS;

const ATMOSPHERE_HEIGHT = 1000; // 70 km
const ORBIT_TARGET = 80000; // 80 km target orbit

// ── Terrain ──
// Planet mountains: sum of sines, tapered to zero near angle=0 (launch site)
function getPlanetTerrainHeight(angle) {
  // Wrap angle to [-PI, PI]
  const a = ((angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI;
  // Taper flat within ±0.15 rad of launch site so takeoff/landing zone is clear
  const launchTaper = Math.min(1, Math.max(0, (Math.abs(a) - 0.15) / 0.2));
  const h = 220 * Math.sin(a * 3 + 1.1)
          + 180 * Math.sin(a * 7 + 2.3)
          + 90  * Math.sin(a * 13 + 0.7)
          + 60  * Math.sin(a * 23 + 3.9);
  return Math.max(0, h) * launchTaper;
}

// Moon craters: fixed positions, crater profile = rim spike + central depression
const MOON_CRATERS = [
  { angle: 0.6,  depth: 180, radius: 0.18 },
  { angle: 1.8,  depth: 120, radius: 0.12 },
  { angle: -0.9, depth: 200, radius: 0.22 },
  { angle: 2.7,  depth: 90,  radius: 0.10 },
  { angle: -2.2, depth: 150, radius: 0.16 },
];
function getMoonTerrainHeight(angle) {
  let h = 0;
  for (const c of MOON_CRATERS) {
    const da = Math.abs(((angle - c.angle + Math.PI) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI) - Math.PI);
    if (da < c.radius * 2.5) {
      const t = da / c.radius;
      // Rim at t≈1, depression inside t<1
      const profile = t < 1
        ? -c.depth * (1 - t * t)          // bowl interior
        : c.depth * 0.4 * Math.exp(-(t - 1) * 4); // rim spike outside
      h += profile;
    }
  }
  return h;
}

// Satellite orbit parameters
const SATELLITE_RADIUS = 15; // meters
const SATELLITE_ORBIT_RADIUS = PLANET_RADIUS + ATMOSPHERE_HEIGHT + 10000;
const SATELLITE_ORBIT_PERIOD = 2 * Math.PI *
  Math.sqrt(
    SATELLITE_ORBIT_RADIUS * SATELLITE_ORBIT_RADIUS * SATELLITE_ORBIT_RADIUS /
      MU,
  );
const SATELLITE_ANGULAR_VEL = -(2 * Math.PI / SATELLITE_ORBIT_PERIOD);
const SATELLITE_COLLISION_RADIUS = 80; // meters — hit box around satellite
const SATELLITE_MASS = 500; // kg
const SATELLITE_EXPLODE_SPEED = 150; // m/s relative impact speed — above this it explodes

// Lagrange point parameters
const LAGRANGE_CAPTURE_RADIUS = 1500; // meters — detection zone around each point

// Moon parameters
const MOON_RADIUS = 1500; // meters
const MOON_ORBIT_RADIUS = 30000; // distance from planet center
const MOON_SURFACE_G = 1.6; // m/s² surface gravity
const MOON_MASS = MOON_SURFACE_G * MOON_RADIUS * MOON_RADIUS / G;
const MOON_MU = G * MOON_MASS;
const MOON_ORBIT_PERIOD = 2 * Math.PI *
  Math.sqrt(MOON_ORBIT_RADIUS * MOON_ORBIT_RADIUS * MOON_ORBIT_RADIUS / MU);
const MOON_ANGULAR_VEL = -(2 * Math.PI / MOON_ORBIT_PERIOD);

function getLagrangePoints(time) {
  const moonAngle = MOON_ANGULAR_VEL * time;
  const mu = MOON_MASS / (PLANET_MASS + MOON_MASS); // mass ratio
  const r = MOON_ORBIT_RADIUS;
  const cbrtMu3 = Math.cbrt(mu / 3);

  // Unit vector toward moon
  const ux = Math.cos(moonAngle), uy = Math.sin(moonAngle);

  // L4 is 60° ahead of moon in its orbit direction, L5 is 60° behind
  const l4Angle = moonAngle + Math.PI / 3;  // +60°
  const l5Angle = moonAngle - Math.PI / 3;  // -60°

  return {
    L1: { x: r * (1 - cbrtMu3) * ux,           y: r * (1 - cbrtMu3) * uy },
    L2: { x: r * (1 + cbrtMu3) * ux,           y: r * (1 + cbrtMu3) * uy },
    L3: { x: -r * (1 + 5/12 * mu) * ux,        y: -r * (1 + 5/12 * mu) * uy },
    L4: { x: r * Math.cos(l4Angle),             y: r * Math.sin(l4Angle) },
    L5: { x: r * Math.cos(l5Angle),             y: r * Math.sin(l5Angle) },
  };
}

function getMoonPos(time) {
  const angle = MOON_ANGULAR_VEL * time;
  return {
    x: MOON_ORBIT_RADIUS * Math.cos(angle),
    y: MOON_ORBIT_RADIUS * Math.sin(angle),
  };
}

function getSatellitePos(time) {
  const angle = SATELLITE_ANGULAR_VEL * time;
  return {
    x: SATELLITE_ORBIT_RADIUS * Math.cos(angle),
    y: SATELLITE_ORBIT_RADIUS * Math.sin(angle),
  };
}

// Engine & tank parameters
const ENGINE_THRUST = 200000; // 200 kN per engine
const ENGINE_MASS = 500; // kg per engine
const ENGINE_ISP = 320; // seconds (specific impulse)
const EXHAUST_VEL = ENGINE_ISP * SURFACE_G; // effective exhaust velocity

const TANK_SIZES = {
  S: { fuel: 2000, dryMass: 200, label: "Small", height: 30, width: 16 },
  M: { fuel: 5000, dryMass: 400, label: "Medium", height: 50, width: 20 },
  L: { fuel: 12000, dryMass: 800, label: "Large", height: 75, width: 24 },
  XL: { fuel: 25000, dryMass: 1400, label: "Extra-L", height: 100, width: 28 },
};

const CAPSULE_MASS = 800;
const CAPSULE_HEIGHT = 25;
const PARACHUTE_CD = 1.5; // drag coefficient for parachute
const PARACHUTE_AREA = 250; // m² - sized to give ~6 m/s terminal velocity at sea level
// Terminal vel = sqrt(2*m*g / (rho*Cd*A)) = sqrt(2*800*9.81 / (1.2*1.5*250)) ≈ 5.9 m/s
const LANDING_SPEED_LIMIT = 10; // m/s - max survivable impact speed
const GEAR_LANDING_SPEED_LIMIT = 20; // m/s - with landing gear deployed
const LANDING_GEAR_MASS = 150; // kg per landing gear set
