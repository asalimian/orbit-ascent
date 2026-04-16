// ═══════════════════════════════════════════════
// ENTRY POINT
// ═══════════════════════════════════════════════
// Import order mirrors the original script load order:
// constants → staging → bodies → simulation → renderer → input

import "./constants.ts";
import {
  addStage,
  adjustStageEngines,
  removeStage,
  renderStageList,
  setStageGear,
  setStageTank,
  updatePreview,
} from "./staging.ts";
import "./bodies.ts";
import {
  hideCredits,
  restartMission,
  returnToStaging,
  showCredits,
  startFlight,
  togglePause,
} from "./simulation.ts";
import "./renderer.ts";
import "./input.ts";

// Expose functions called from HTML onclick attributes
declare const window: Window & {
  addStage: typeof addStage;
  removeStage: typeof removeStage;
  adjustStageEngines: typeof adjustStageEngines;
  setStageTank: typeof setStageTank;
  setStageGear: typeof setStageGear;
  startFlight: typeof startFlight;
  restartMission: typeof restartMission;
  returnToStaging: typeof returnToStaging;
  showCredits: typeof showCredits;
  hideCredits: typeof hideCredits;
  togglePause: typeof togglePause;
};

window.addStage = addStage;
window.removeStage = removeStage;
window.adjustStageEngines = adjustStageEngines;
window.setStageTank = setStageTank;
window.setStageGear = setStageGear;
window.startFlight = startFlight;
window.restartMission = restartMission;
window.returnToStaging = returnToStaging;
window.showCredits = showCredits;
window.hideCredits = hideCredits;
window.togglePause = togglePause;

// Initialise with one stage
addStage();
renderStageList();
updatePreview();
