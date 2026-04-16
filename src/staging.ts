// ═══════════════════════════════════════════════
// STAGING STATE
// ═══════════════════════════════════════════════
import {
  CAPSULE_MASS,
  ENGINE_MASS,
  ENGINE_THRUST,
  EXHAUST_VEL,
  LANDING_GEAR_MASS,
  SURFACE_G,
  TANK_SIZES,
} from "./constants.ts";
import { drawSpacecraft } from "./bodies.ts";
import type { StageConfig, TankSizeKey } from "./types.ts";

// stages[0] = bottom stage (fires first). addStage() inserts at index 0 via unshift.
export let stages: StageConfig[] = [];

function recomputeStage(s: StageConfig): void {
  const tank = TANK_SIZES[s.tankSize];
  const gearMass = s.hasLandingGear ? LANDING_GEAR_MASS : 0;
  s.fuel = tank.fuel;
  s.maxFuel = tank.fuel;
  s.dryMass = tank.dryMass + s.engines * ENGINE_MASS + gearMass;
  (s as StageConfig & { totalMass: number }).totalMass = tank.fuel + s.dryMass;
  s.thrust = s.engines * ENGINE_THRUST;
}

export function adjustStageEngines(i: number, delta: number): void {
  const s = stages[i];
  const max = TANK_SIZES[s.tankSize].maxEngines;
  s.engines = Math.max(1, Math.min(max, s.engines + delta));
  recomputeStage(s);
  renderStageList();
  updatePreview();
}

export function setStageTank(i: number, size: TankSizeKey): void {
  const s = stages[i];
  s.tankSize = size;
  s.engines = Math.min(s.engines, TANK_SIZES[size].maxEngines);
  recomputeStage(s);
  renderStageList();
  updatePreview();
}

export function setStageGear(i: number, on: boolean): void {
  stages[i].hasLandingGear = on;
  recomputeStage(stages[i]);
  renderStageList();
  updatePreview();
}

export function addStage(): void {
  const s: StageConfig = {
    engines: 1,
    tankSize: "S",
    hasLandingGear: false,
    fuel: 0,
    maxFuel: 0,
    dryMass: 0,
    thrust: 0,
  };
  recomputeStage(s);
  stages.unshift(s);
  renderStageList();
  updatePreview();
}

export function removeStage(i: number): void {
  stages.splice(i, 1);
  renderStageList();
  updatePreview();
}

let dragFromIndex: number | null = null;

export function renderStageList(): void {
  const el = document.getElementById("stage-list")!;
  el.innerHTML = "";

  for (let ri = stages.length - 1; ri >= 0; ri--) {
    const i = ri;
    const s = stages[i] as StageConfig & { totalMass: number };
    const div = document.createElement("div");
    div.className = "stage-item";
    div.draggable = true;
    div.dataset.index = String(i);

    const tankBtns = (["S", "M", "L", "XL"] as TankSizeKey[]).map((sz) =>
      `<button class="tank-option${
        s.tankSize === sz ? " active" : ""
      }" onclick="setStageTank(${i}, '${sz}')">${sz}</button>`
    ).join("");

    div.innerHTML = `
      <div class="stage-header">
        <span class="drag-handle">⠿</span>
        <span class="stage-num">${i + 1}</span>
        <button class="remove-btn" onclick="removeStage(${i})">✕</button>
      </div>
      <div class="stage-info">
        <div class="config-row">
          <label>Fuel Tank</label>
          <div class="tank-options">${tankBtns}</div>
        </div>
        <div class="config-row">
          <label>Engines</label>
          <div class="controls">
            <button class="btn-sm" onclick="adjustStageEngines(${i}, -1)">−</button>
            <span>${s.engines}</span>
            <button class="btn-sm" onclick="adjustStageEngines(${i}, 1)">+</button>
          </div>
        </div>
        <div class="config-row">
          <label>Landing Gear</label>
          <div class="tank-options">
            <button class="tank-option${
      !s.hasLandingGear ? " active" : ""
    }" onclick="setStageGear(${i}, false)">OFF</button>
            <button class="tank-option${
      s.hasLandingGear ? " active" : ""
    }" onclick="setStageGear(${i}, true)">ON</button>
          </div>
        </div>
        <div class="stage-stats"></div>
      </div>
    `;

    div.addEventListener("dragstart", (e) => {
      dragFromIndex = i;
      div.classList.add("dragging");
      (e as DragEvent).dataTransfer!.effectAllowed = "move";
    });
    div.addEventListener("dragend", () => {
      div.classList.remove("dragging");
      dragFromIndex = null;
      el.querySelectorAll(".stage-item").forEach((d) =>
        d.classList.remove("drag-over")
      );
    });
    div.addEventListener("dragover", (e) => {
      e.preventDefault();
      (e as DragEvent).dataTransfer!.dropEffect = "move";
      el.querySelectorAll(".stage-item").forEach((d) =>
        d.classList.remove("drag-over")
      );
      if (dragFromIndex !== null && dragFromIndex !== i) {
        div.classList.add("drag-over");
      }
    });
    div.addEventListener("dragleave", () => div.classList.remove("drag-over"));
    div.addEventListener("drop", (e) => {
      e.preventDefault();
      if (dragFromIndex !== null && dragFromIndex !== i) {
        const moved = stages.splice(dragFromIndex, 1)[0];
        stages.splice(i, 0, moved);
        renderStageList();
        updatePreview();
      }
    });

    el.appendChild(div);
  }

  // Totals
  let totalMass = CAPSULE_MASS;
  stages.forEach((s) =>
    totalMass += (s as StageConfig & { totalMass: number }).totalMass
  );

  // Per-stage stats (payload, Δv, T/W)
  let dv = 0;
  for (let i = 0; i < stages.length; i++) {
    const s = stages[i] as StageConfig & { totalMass: number };
    let mAbove = CAPSULE_MASS;
    for (let j = i + 1; j < stages.length; j++) {
      mAbove += (stages[j] as StageConfig & { totalMass: number }).totalMass;
    }
    const m0 = mAbove + s.totalMass;
    const m1 = mAbove + s.dryMass;
    const stageDv = EXHAUST_VEL * Math.log(m0 / m1);
    const tw = s.thrust / (m0 * SURFACE_G);
    dv += stageDv;

    const card = el.querySelector(
      `.stage-item[data-index="${i}"] .stage-stats`,
    );
    if (card) {
      const dryMass = s.totalMass + mAbove;
      card.innerHTML = `
        <span class="stat">Fuel:</span> <span class="val">${s.fuel} kg</span>
        <span class="stat">Dry Mass:</span> <span class="val">${dryMass.toLocaleString()} kg</span>
        <span class="stat">Δv:</span> <span class="val">${
        Math.round(stageDv).toLocaleString()
      } m/s</span>
        <span class="stat">T/W:</span> <span class="val">${tw.toFixed(2)}</span>
      `;
    }
  }

  document.getElementById("total-mass")!.textContent =
    totalMass.toLocaleString() + " kg";
  document.getElementById("total-dv")!.textContent =
    Math.round(dv).toLocaleString() + " m/s";
  document.getElementById("total-stages")!.textContent = String(stages.length);
}

// ── Staging preview canvas ────────────────────────

const prevCanvas = document.getElementById(
  "staging-preview",
) as HTMLCanvasElement;
const prevCtx = prevCanvas.getContext("2d")!;

export function updatePreview(): void {
  const W = prevCanvas.width, H = prevCanvas.height;
  prevCtx.clearRect(0, 0, W, H);

  prevCtx.strokeStyle = "rgba(255,255,255,0.08)";
  prevCtx.lineWidth = 1;
  for (let x = 0; x < W; x += 20) {
    prevCtx.beginPath();
    prevCtx.moveTo(x, 0);
    prevCtx.lineTo(x, H);
    prevCtx.stroke();
  }
  for (let y = 0; y < H; y += 20) {
    prevCtx.beginPath();
    prevCtx.moveTo(0, y);
    prevCtx.lineTo(W, y);
    prevCtx.stroke();
  }

  if (stages.length === 0) return;

  let stackH = 15;
  stages.forEach((st) => {
    stackH += TANK_SIZES[st.tankSize].height * 0.3 + 8;
  });
  const s = (H * 0.50) / stackH;
  const totalH = stackH * s;

  prevCtx.save();
  prevCtx.translate(W / 2, (H - totalH) / 2);
  drawSpacecraft(prevCtx, stages, s, { currentStage: 0, showLabel: true });
  prevCtx.restore();
}
