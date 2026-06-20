import "./styles.css";
import { derive } from "./core/physics";
import {
  createGame,
  resetGame,
  setGear,
  setTargetDelta,
  setThrottle,
} from "./game/state";
import { advance, commandedSpeed } from "./game/loop";
import { DEFAULT_RIG, RIGS } from "./rigs/rigs";
import { DEFAULT_SCENARIO, SCENARIOS } from "./scenarios/scenarios";
import { DEFAULT_DIFFICULTY, DIFFICULTIES, BEGINNER } from "./difficulty/difficulty";
import { steerFromBottomWheel } from "./input/bottomWheel";
import { createRenderer3d, type ViewMode } from "./render3d/renderer";
import { isTrailerInTarget } from "./scoring/types";
import { defaultScorer } from "./scoring/defaultScorer";
import { createHud } from "./ui/hud";
import { createControls } from "./ui/controls";
import { coachingMessage } from "./ui/coach";
import { simulateManeuverFrames, type Maneuver } from "./game/autopilot";
import { SOLUTIONS } from "./game/solutions";
import { createSfx } from "./audio/sfx";
import {
  recordBest,
  loadProgress,
  clearBestScores,
  setRealisticWheel,
  setViewMode,
  setIdealLineOn,
  setDifficulty,
} from "./game/persistence";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = "";

const canvas = document.createElement("canvas");
canvas.id = "view";
app.appendChild(canvas);

// Subtle cinematic vignette over the 3D view (pure CSS, no WebGL cost).
const vignette = document.createElement("div");
vignette.id = "vignette";
app.appendChild(vignette);
const coach = document.createElement("div");
coach.id = "coach";
app.appendChild(coach);

// Grade badge: shows the downhill grade on a sloped scenario (hidden when flat).
const slopeBadge = document.createElement("div");
slopeBadge.id = "slope-badge";
slopeBadge.hidden = true;
app.appendChild(slopeBadge);

// Shown in the camera view when a tall/enclosed load blocks the backup camera.
const camBlocked = document.createElement("div");
camBlocked.id = "cam-blocked";
camBlocked.textContent = "Camera blocked by the load. Switch View to Mirrors.";
camBlocked.hidden = true;
app.appendChild(camBlocked);

const banner = document.createElement("div");
banner.id = "banner";
banner.hidden = true;
app.appendChild(banner);

const pull = document.createElement("div");
pull.id = "pullforward";
pull.hidden = true;
pull.innerHTML =
  '<div class="pf-title">PULL FORWARD</div>' +
  '<div class="pf-sub">Ease forward to straighten the trailer</div>';
app.appendChild(pull);

const contact = document.createElement("div");
contact.id = "contact";
contact.hidden = true;
app.appendChild(contact);

// Title splash (also the first user gesture that unlocks audio). Tap to start.
const title = document.createElement("div");
title.id = "title";
title.innerHTML =
  '<div class="title-card">' +
  '<div class="title-word">JACKKNIFE</div>' +
  '<div class="title-tag">Learn to back up a trailer.</div>' +
  '<button class="title-go">Drive</button>' +
  "</div>";
app.appendChild(title);
title.addEventListener("pointerdown", () => {
  title.classList.add("hiding");
  window.setTimeout(() => {
    title.hidden = true;
  }, 360);
});

const params = new URLSearchParams(location.search);
const initRig = RIGS[params.get("rig") ?? ""] ?? DEFAULT_RIG;
// URL param wins (handy for testing); otherwise the last difficulty the player chose.
const initDiff =
  DIFFICULTIES[params.get("difficulty") ?? ""] ??
  DIFFICULTIES[loadProgress().settings.difficultyId ?? ""] ??
  DEFAULT_DIFFICULTY;
const initScenario = SCENARIOS[params.get("scenario") ?? ""] ?? DEFAULT_SCENARIO;
let game = createGame(initRig, initScenario, initDiff);
// One View control cycles these three (top-down aid, backup camera, mirrors only).
const VIEW_ORDER: ViewMode[] = ["topdown", "backupcam", "mirrors"];
const viewLabel = (v: ViewMode): string =>
  v === "topdown" ? "View: top-down" : v === "backupcam" ? "View: camera" : "View: mirrors";
let view: ViewMode = (loadProgress().settings.viewMode as ViewMode) ?? "topdown";
if (!VIEW_ORDER.includes(view)) view = "topdown";
let mirrors = initDiff.mirrorsDefault;
let debug = false;
let won = false;
let demoActive = false;
let isDemo = false; // the current attempt is a Demo playback (does not count toward best)
// On-screen wheel turns at the rig's real steering ratio (default). Off = the
// simpler compact sweep for super-beginners. Independent of backing difficulty.
let realisticWheel = loadProgress().settings.realisticWheel ?? true;
// Ideal line: trace the verified solution's trailer path. A teaching aid, default on.
let idealLineOn = loadProgress().settings.idealLine ?? true;
let demoAcc = 0;
let demoWheelU = 0; // eased on-screen wheel position during the demo (visual only)
let demoFrames: (typeof game)[] = []; // recorded verified trajectory, replayed pose-by-pose
let demoIdx = 0;
function lookupSolution(rigId: string, alias: string | undefined, scenarioId: string): Maneuver | undefined {
  return SOLUTIONS[`${rigId}/${scenarioId}`] ?? (alias ? SOLUTIONS[`${alias}/${scenarioId}`] : undefined);
}
let solution: Maneuver | undefined = lookupSolution(
  game.rig.id,
  game.rig.solutionAlias,
  game.scenario.id,
);

const renderer3d = createRenderer3d(canvas, game);

const hud = createHud(app);
hud.setBest(loadProgress().bestScores[game.scenario.id]);

function restart(): void {
  game = resetGame(game);
  won = false;
  demoActive = false;
  isDemo = false;
  banner.hidden = true;
}

const controls = createControls(app, {
  onSteer: (u) => {
    game = setTargetDelta(game, steerFromBottomWheel(u, game.rig.maxSteer));
  },
  onGear: (gear, active) => {
    game = setGear(game, gear);
    game = setThrottle(game, active ? 1 : 0);
  },
  onToggleView: () => {
    view = VIEW_ORDER[(VIEW_ORDER.indexOf(view) + 1) % VIEW_ORDER.length];
    setViewMode(view);
    controls.setViewLabel(viewLabel(view));
  },
  onToggleMirrors: () => {
    mirrors = !mirrors;
  },
  onToggleDebug: () => {
    debug = !debug;
  },
  onRestart: restart,
  onDemo: () => {
    if (!solution) return;
    restart();
    // Record the EXACT verified trajectory at Beginner (the difficulty the solutions
    // were solved for) and replay it pose-by-pose, so even the sensitive straight-
    // start maneuver reproduces exactly regardless of the player's difficulty.
    demoFrames = simulateManeuverFrames(game.rig, game.scenario, BEGINNER, solution);
    demoIdx = 0;
    demoActive = true;
    isDemo = true; // a Demo win is illustrative; it must not set the high score
    demoAcc = 0;
    demoWheelU = 0;
  },
});
controls.setDemoEnabled(solution !== undefined);
controls.setWheelRatio(wheelDegPerU(game));
controls.setViewLabel(viewLabel(view));
updateIdealLine();

/** Degrees the on-screen wheel rotates at full lock (u=1): the rig's real steering
 *  ratio in realistic modes, a compact sweep for the super-beginner mode. */
function wheelDegPerU(g: typeof game): number {
  if (!realisticWheel) return 140; // compact super-beginner sweep
  const maxSteerDeg = (g.rig.maxSteer * 180) / Math.PI;
  return maxSteerDeg * (g.rig.steeringRatio ?? 16);
}

/** Recompute the ideal-line aid: the verified solution's trailer-axle path (or hide
 *  it). Downsampled; recomputed on each rig/scenario change and when toggled. */
function updateIdealLine(): void {
  if (!idealLineOn || !solution) {
    renderer3d.setIdealLine(null);
    return;
  }
  const frames = simulateManeuverFrames(game.rig, game.scenario, BEGINNER, solution);
  const pts = frames
    .filter((_, i) => i % 3 === 0)
    .map((f) => derive(f.physics, game.rig, { v: 0, delta: 0 }).trailerAxle);
  renderer3d.setIdealLine(pts);
}

// Audio. iOS only starts the AudioContext from a user gesture, so resume on the
// first tap anywhere.
const sfx = createSfx();
const startAudio = (): void => {
  sfx.resume();
  window.removeEventListener("pointerdown", startAudio);
};
window.addEventListener("pointerdown", startAudio);
let prevWallContacts = 0;
let prevWon = false;

let cssW = 0;
let cssH = 0;
let dpr = 1;

function resize(): void {
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  const r = canvas.getBoundingClientRect();
  cssW = r.width;
  cssH = r.height;
  renderer3d.resize(cssW, cssH, dpr);
}
window.addEventListener("resize", resize);

// Pinch to zoom the top-down view.
const pinchPointers = new Map<number, { x: number; y: number }>();
let pinchDist = 0;
function currentPinchDist(): number {
  const pts = [...pinchPointers.values()];
  return pts.length === 2 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0;
}
canvas.addEventListener("pointerdown", (e) => {
  pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinchPointers.size === 2) pinchDist = currentPinchDist();
});
canvas.addEventListener("pointermove", (e) => {
  if (!pinchPointers.has(e.pointerId)) return;
  pinchPointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinchPointers.size === 2) {
    const d = currentPinchDist();
    if (pinchDist > 0 && view === "topdown") renderer3d.nudgeTopZoom(d / pinchDist);
    pinchDist = d;
  }
});
const endPinch = (e: PointerEvent): void => {
  pinchPointers.delete(e.pointerId);
  pinchDist = 0;
};
canvas.addEventListener("pointerup", endPinch);
canvas.addEventListener("pointercancel", endPinch);

// Garage menu: pick the vehicle/trailer and difficulty; rebuilds the rig live.
const menuBtn = document.createElement("button");
menuBtn.id = "garage-btn";
menuBtn.textContent = "Garage";
app.appendChild(menuBtn);
const menu = document.createElement("div");
menu.id = "menu";
menu.hidden = true;
app.appendChild(menu);

function applyChoice(rigId: string, diffId: string, scenarioId: string = game.scenario.id): void {
  const rig = RIGS[rigId] ?? DEFAULT_RIG;
  const diff = DIFFICULTIES[diffId] ?? DEFAULT_DIFFICULTY;
  const scenario = SCENARIOS[scenarioId] ?? game.scenario;
  setDifficulty(diff.id); // remember the choice across reloads
  game = createGame(rig, scenario, diff);
  renderer3d.rebuild(game);
  // Verified demo solutions are keyed by rig + scenario; Demo enables only when one exists.
  solution = lookupSolution(rig.id, rig.solutionAlias, game.scenario.id);
  controls.setDemoEnabled(solution !== undefined);
  controls.setWheelRatio(wheelDegPerU(game));
  mirrors = diff.mirrorsDefault;
  won = false;
  demoActive = false;
  isDemo = false;
  banner.hidden = true;
  updateIdealLine();
}

// Curated easy-to-hard progression: after a win, the banner suggests the next one.
const SCENARIO_ORDER = [
  "street-to-driveway-90",
  "street-to-gate-narrow",
  "garage-straight",
  "lcorner-backin-90",
  "blindside-backin",
  "apron-to-loading-dock",
  "flanked-loading-dock",
  "long-chute",
  "driveway-straight-start",
  "s-curve-alley",
  "driveway-downhill",
  "driveway-uphill",
  "angled-spot",
  "parallel-park-curb",
];

type MenuTab = "vehicle" | "scenario" | "options";
let menuTab: MenuTab = "vehicle";

// Scenario picker grouped for the tabbed Garage; short labels keep buttons compact.
const SCEN_GROUPS: { label: string; ids: string[] }[] = [
  {
    label: "Driveways",
    ids: ["street-to-driveway-90", "driveway-straight-start", "driveway-downhill", "driveway-uphill"],
  },
  { label: "Docks", ids: ["apron-to-loading-dock", "flanked-loading-dock", "long-chute"] },
  {
    label: "Tight spots",
    ids: [
      "street-to-gate-narrow",
      "parallel-park-curb",
      "lcorner-backin-90",
      "blindside-backin",
      "s-curve-alley",
      "garage-straight",
      "angled-spot",
    ],
  },
];
const SCEN_SHORT: Record<string, string> = {
  "street-to-driveway-90": "90°",
  "driveway-straight-start": "Straight",
  "driveway-downhill": "Downhill",
  "driveway-uphill": "Uphill",
  "apron-to-loading-dock": "Standard",
  "flanked-loading-dock": "Flanked",
  "long-chute": "Chute",
  "s-curve-alley": "S-curve",
  "garage-straight": "Garage",
  "angled-spot": "Angled",
  "street-to-gate-narrow": "Gate",
  "parallel-park-curb": "Parallel",
  "lcorner-backin-90": "Corner",
  "blindside-backin": "Blind side",
};

function renderMenu(animate = false): void {
  const btns = (items: { id: string; label: string }[], attr: string, curId: string): string =>
    items
      .map(
        (it) =>
          `<button data-${attr}="${it.id}" class="${it.id === curId ? "sel" : ""}">${it.label}</button>`,
      )
      .join("");
  const tab = (id: MenuTab, label: string): string =>
    `<button data-tab="${id}" class="menu-tab ${menuTab === id ? "sel" : ""}">${label}</button>`;

  let body = "";
  if (menuTab === "vehicle") {
    body =
      '<div class="menu-label">Vehicle and trailer</div>' +
      `<div class="menu-row vstack">${btns(Object.values(RIGS), "rig", game.rig.id)}</div>`;
  } else if (menuTab === "scenario") {
    body =
      '<div class="menu-label">Difficulty</div>' +
      `<div class="menu-row">${btns(Object.values(DIFFICULTIES), "diff", game.difficulty.id)}</div>` +
      SCEN_GROUPS.map(
        (g) =>
          `<div class="menu-label">${g.label}</div><div class="menu-row">` +
          g.ids
            .map(
              (id) =>
                `<button data-scenario="${id}" class="${id === game.scenario.id ? "sel" : ""}">${SCEN_SHORT[id] ?? id}</button>`,
            )
            .join("") +
          "</div>",
      ).join("");
  } else {
    body =
      '<div class="menu-label">Steering wheel</div>' +
      '<div class="menu-row">' +
      `<button data-wheel="realistic" class="${realisticWheel ? "sel" : ""}">Realistic</button>` +
      `<button data-wheel="simple" class="${!realisticWheel ? "sel" : ""}">Simple</button>` +
      "</div>" +
      '<div class="menu-label">Ideal line</div>' +
      '<div class="menu-row">' +
      `<button data-ideal="on" class="${idealLineOn ? "sel" : ""}">On</button>` +
      `<button data-ideal="off" class="${!idealLineOn ? "sel" : ""}">Off</button>` +
      "</div>" +
      '<button id="reset-best" class="menu-danger">Reset high scores</button>';
  }

  menu.innerHTML =
    `<div class="menu-card${animate ? " pop" : ""}">` +
    '<div class="menu-title">Garage</div>' +
    '<div class="menu-tabs">' +
    tab("vehicle", "Vehicle") +
    tab("scenario", "Scenario") +
    tab("options", "Options") +
    "</div>" +
    `<div class="menu-body">${body}</div>` +
    '<button id="menu-close">Done</button>' +
    "</div>";

  // Switch tabs in place (no card pop on re-render, only on open).
  menu.querySelectorAll<HTMLElement>("[data-tab]").forEach((b) =>
    b.addEventListener("pointerdown", () => {
      menuTab = (b.dataset.tab as MenuTab) ?? "vehicle";
      renderMenu();
    }),
  );
  // Picking a vehicle applies it and closes the menu (the "go" action).
  menu.querySelectorAll<HTMLElement>("[data-rig]").forEach((b) =>
    b.addEventListener("pointerdown", () => {
      applyChoice(b.dataset.rig ?? "", game.difficulty.id);
      menu.hidden = true;
    }),
  );
  // Difficulty is a modifier: apply live and keep the menu open.
  menu.querySelectorAll<HTMLElement>("[data-diff]").forEach((b) =>
    b.addEventListener("pointerdown", () => {
      applyChoice(game.rig.id, b.dataset.diff ?? "");
      renderMenu();
    }),
  );
  // Location is a modifier too: apply live and keep the menu open.
  menu.querySelectorAll<HTMLElement>("[data-scenario]").forEach((b) =>
    b.addEventListener("pointerdown", () => {
      applyChoice(game.rig.id, game.difficulty.id, b.dataset.scenario ?? "");
      renderMenu();
    }),
  );
  // Steering: realistic real-ratio wheel (default) vs the compact super-beginner
  // sweep. Independent of difficulty; persisted; applies live.
  menu.querySelectorAll<HTMLElement>("[data-wheel]").forEach((b) =>
    b.addEventListener("pointerdown", () => {
      realisticWheel = b.dataset.wheel === "realistic";
      setRealisticWheel(realisticWheel);
      controls.setWheelRatio(wheelDegPerU(game));
      renderMenu();
    }),
  );
  // Ideal line: trace the verified solution path (teaching aid). Persisted; live.
  menu.querySelectorAll<HTMLElement>("[data-ideal]").forEach((b) =>
    b.addEventListener("pointerdown", () => {
      idealLineOn = b.dataset.ideal === "on";
      setIdealLineOn(idealLineOn);
      updateIdealLine();
      renderMenu();
    }),
  );
  // Reset high scores, with a confirm tap so it is not triggered by accident.
  const resetBtn = menu.querySelector("#reset-best") as HTMLElement | null;
  if (resetBtn) {
    let resetArmed = false;
    resetBtn.addEventListener("pointerdown", () => {
      if (!resetArmed) {
        resetArmed = true;
        resetBtn.textContent = "Tap again to confirm";
        return;
      }
      clearBestScores();
      hud.setBest(undefined);
      renderMenu();
    });
  }
  (menu.querySelector("#menu-close") as HTMLElement).addEventListener("pointerdown", () => {
    menu.hidden = true;
  });
}
// Tap outside the card to dismiss (so the menu can never trap input).
menu.addEventListener("pointerdown", (e) => {
  if (e.target === menu) menu.hidden = true;
});
menuBtn.addEventListener("pointerdown", () => {
  menuTab = "vehicle";
  renderMenu(true);
  menu.hidden = false;
});

// Help / how-to-play overlay.
const helpBtn = document.createElement("button");
helpBtn.id = "help-btn";
helpBtn.textContent = "?";
app.appendChild(helpBtn);
const help = document.createElement("div");
help.id = "help";
help.hidden = true;
help.innerHTML =
  '<div class="help-card">' +
  '<div class="help-title">How to play</div>' +
  '<ul class="help-list">' +
  "<li><b>Steering wheel</b>: grab it anywhere and turn. The bottom of the wheel leads, so move it the way you want the trailer to go.</li>" +
  "<li><b>Reverse / Forward</b>: hold to drive. Back in slowly and make small inputs.</li>" +
  "<li><b>View</b>: cycle top-down, backup camera, and mirrors-only. <b>Mirrors</b> toggles the strip on the first two.</li>" +
  "<li><b>Demo</b>: watch a proven solution park it (then try it yourself).</li>" +
  "<li><b>Garage</b>: pick a vehicle and a difficulty.</li>" +
  "<li>Pinch to zoom the top-down view.</li>" +
  "</ul>" +
  '<button id="help-close">Got it</button>' +
  "</div>";
app.appendChild(help);
helpBtn.addEventListener("pointerdown", () => {
  help.hidden = false;
});
help.addEventListener("pointerdown", (e) => {
  if (e.target === help) help.hidden = true;
});
(help.querySelector("#help-close") as HTMLElement).addEventListener("pointerdown", () => {
  help.hidden = true;
});

function checkWin(): void {
  if (won) return;
  if (isTrailerInTarget(game) && Math.abs(commandedSpeed(game)) < 1e-3) {
    won = true;
    const result = defaultScorer.scoreAttempt(game);
    const score = Math.round(result.score);
    // Demo playbacks are illustrative and must NOT count toward the high score.
    let bestLine: string;
    if (isDemo) {
      const best = loadProgress().bestScores[game.scenario.id];
      bestLine = best === undefined ? "Demo run (not counted)" : `Demo run · your best ${best} stands`;
    } else {
      const prevBest = loadProgress().bestScores[game.scenario.id];
      const best = recordBest(game.scenario.id, score).bestScores[game.scenario.id];
      hud.setBest(best);
      bestLine = prevBest === undefined || score > prevBest ? "New best!" : `Best ${best}`;
    }
    const stars = score >= 90 ? 3 : score >= 72 ? 2 : 1;
    // Suggest the next scenario in the progression (real wins only).
    const oi = SCENARIO_ORDER.indexOf(game.scenario.id);
    const nextId = !isDemo && oi >= 0 && oi < SCENARIO_ORDER.length - 1 ? SCENARIO_ORDER[oi + 1] : undefined;
    const nextLabel = nextId ? SCENARIOS[nextId]?.label : undefined;
    banner.innerHTML =
      `<div class="title">${isDemo ? "Demo parked" : "Parked!"}</div>` +
      `<div class="stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div>` +
      `<div class="score">Score ${score}</div>` +
      `<div class="best">${bestLine}</div>` +
      `<div class="sub">${result.summary}</div>` +
      '<div class="row">' +
      '<button id="look">Keep looking</button>' +
      '<button id="again">Try again</button>' +
      "</div>" +
      (nextLabel ? `<button id="next-chal" class="banner-next">Next: ${nextLabel}</button>` : "");
    banner.hidden = false;
    // Use pointerdown (fires immediately on touch) so the first tap always lands;
    // a plain click was being dropped on the first press after a demo.
    (banner.querySelector("#again") as HTMLElement).addEventListener("pointerdown", restart);
    // Dismiss the banner but keep the parked scene, so you can free-look / switch views.
    (banner.querySelector("#look") as HTMLElement).addEventListener("pointerdown", () => {
      banner.hidden = true;
    });
    const nextBtn = banner.querySelector("#next-chal") as HTMLElement | null;
    if (nextBtn && nextId) {
      nextBtn.addEventListener("pointerdown", () => {
        banner.hidden = true;
        applyChoice(game.rig.id, game.difficulty.id, nextId);
      });
    }
  }
}

let last = 0;
let hitPause = 0; // brief sim freeze after an impact, for weight
function frame(t: number): void {
  if (cssW === 0) resize();
  const dt = last ? (t - last) / 1000 : 0;
  last = t;

  if (hitPause > 0) {
    hitPause -= dt; // hold the sim still for a beat on impact
  } else if (demoActive && demoFrames.length) {
    // Replay the recorded verified trajectory pose-by-pose (decoupled from live
    // physics, so sensitive open-loop maneuvers reproduce exactly).
    demoAcc += dt;
    while (demoAcc >= 1 / 60) {
      demoAcc -= 1 / 60;
      if (demoIdx >= demoFrames.length) {
        demoActive = false;
        break;
      }
      const f = demoFrames[demoIdx++];
      game = { ...game, physics: f.physics, delta: f.delta, session: f.session };
    }
  } else if (!won) {
    game = advance(game, dt);
  }

  // During the Demo, rotate the on-screen wheel to match the autopilot's steering
  // so you can see how much wheel the maneuver uses.
  if (demoActive) {
    // Ease the visible wheel toward the actual steer so it rotates watchably instead
    // of snapping (the real ratio would otherwise spin it several turns per second).
    // Visual only; the physics keeps the verified steering slew, so the path is exact.
    const targetU = game.delta / game.rig.maxSteer;
    demoWheelU += (targetU - demoWheelU) * Math.min(1, dt * 6);
    controls.setWheelVisual(demoWheelU);
  }

  renderer3d.render(game, view, {
    mirrors,
    showGhost: game.difficulty.showGhost,
    showGuides: game.difficulty.showGuideLines,
  });

  hud.update(game, debug);
  const d = derive(game.physics, game.rig, { v: commandedSpeed(game), delta: game.delta });
  // Expert's "no pulling forward unless physically necessary" rule silently vetoes
  // forward while the fold is still recoverable in reverse. Surface WHY the forward
  // input did nothing (this is rule feedback, not a hand-holding aid, so it shows
  // even in Expert where coaching is otherwise off).
  const forwardLocked =
    !game.difficulty.allowPullForwardAlways &&
    game.gear === "forward" &&
    game.throttle > 1e-4 &&
    (d.jackknifeState === "ok" || d.jackknifeState === "warn");
  // Coaching is an aid: Expert (showCoaching false) hides it, but the Demo always
  // narrates and the forward-lock feedback always shows.
  const showCoach = demoActive || game.difficulty.showCoaching || forwardLocked;
  coach.hidden = !showCoach;
  if (showCoach) {
    coach.textContent = demoActive
      ? "Demo: easing back and steering toward the driveway. Watch the trailer follow the wheel."
      : forwardLocked
        ? "Forward is locked. Straighten it in reverse; pulling forward is only for when it is folded too far to back out."
        : coachingMessage(game, d);
  }
  const grade = game.scenario.slope;
  slopeBadge.hidden = grade <= 0;
  if (grade > 0) slopeBadge.textContent = `Downhill grade ${Math.round(Math.tan(grade) * 100)}%`;
  camBlocked.hidden = !(view === "backupcam" && game.rig.loadBlocksCamera);
  pull.hidden = !(d.jackknifeState === "recoverable" || d.jackknifeState === "contact");
  contact.hidden = !game.session.collidingNow;

  // Don't evaluate a win mid-replay (the replayed poses have no throttle, so a
  // transient box pass would otherwise trip it); the final settled pose checks in.
  if (!demoActive) checkWin();

  // Audio: engine hum tracks speed, backup beep while reversing, thud on a new
  // wall contact, chime once on the win.
  const spd = Math.abs(commandedSpeed(game));
  sfx.setEngine(spd > 1e-3 ? Math.min(1, spd / 2.5) : 0);
  sfx.reverseBeep(game.gear === "reverse" && spd > 0.05);
  if (game.session.wallContacts > prevWallContacts) {
    sfx.collision();
    hitPause = 0.08; // a beat of hit-pause makes the bump land
  }
  prevWallContacts = game.session.wallContacts;
  if (won && !prevWon) {
    sfx.success();
    renderer3d.celebrate(game);
  }
  prevWon = won;

  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);
