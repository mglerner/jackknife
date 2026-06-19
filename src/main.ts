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
import { DEFAULT_DIFFICULTY, DIFFICULTIES } from "./difficulty/difficulty";
import { steerFromBottomWheel } from "./input/bottomWheel";
import { createRenderer3d, type ViewMode } from "./render3d/renderer";
import { isTrailerInTarget } from "./scoring/types";
import { defaultScorer } from "./scoring/defaultScorer";
import { createHud } from "./ui/hud";
import { createControls } from "./ui/controls";
import { coachingMessage } from "./ui/coach";
import { applyManeuverAt, maneuverDuration, type Maneuver } from "./game/autopilot";
import { SOLUTIONS } from "./game/solutions";
import { createSfx } from "./audio/sfx";
import { recordBest, loadProgress } from "./game/persistence";

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
const initDiff = DIFFICULTIES[params.get("difficulty") ?? ""] ?? DEFAULT_DIFFICULTY;
const initScenario = SCENARIOS[params.get("scenario") ?? ""] ?? DEFAULT_SCENARIO;
let game = createGame(initRig, initScenario, initDiff);
let view: ViewMode = "topdown";
let mirrors = initDiff.mirrorsDefault;
let debug = false;
let won = false;
let demoActive = false;
let demoT = 0;
let demoAcc = 0;
let solution: Maneuver | undefined = SOLUTIONS[`${game.rig.id}/${game.scenario.id}`];

const renderer3d = createRenderer3d(canvas, game);

const hud = createHud(app);
hud.setBest(loadProgress().bestScores[game.scenario.id]);

function restart(): void {
  game = resetGame(game);
  won = false;
  demoActive = false;
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
    view = view === "topdown" ? "backupcam" : "topdown";
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
    demoActive = true;
    demoT = 0;
    demoAcc = 0;
  },
});
controls.setDemoEnabled(solution !== undefined);
controls.setWheelRatio(wheelDegPerU(game));

/** Degrees the on-screen wheel rotates at full lock (u=1): the rig's real steering
 *  ratio in realistic modes, a compact sweep for the super-beginner mode. */
function wheelDegPerU(g: typeof game): number {
  if (!g.difficulty.realisticWheel) return 140;
  const maxSteerDeg = (g.rig.maxSteer * 180) / Math.PI;
  return maxSteerDeg * (g.rig.steeringRatio ?? 16);
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
  game = createGame(rig, scenario, diff);
  renderer3d.rebuild(game);
  // Verified demo solutions are keyed by rig + scenario; Demo enables only when one exists.
  solution = SOLUTIONS[`${rig.id}/${game.scenario.id}`];
  controls.setDemoEnabled(solution !== undefined);
  controls.setWheelRatio(wheelDegPerU(game));
  mirrors = diff.mirrorsDefault;
  won = false;
  demoActive = false;
  banner.hidden = true;
}

function renderMenu(): void {
  const btns = (items: { id: string; label: string }[], attr: string, curId: string): string =>
    items
      .map(
        (it) =>
          `<button data-${attr}="${it.id}" class="${it.id === curId ? "sel" : ""}">${it.label}</button>`,
      )
      .join("");
  menu.innerHTML =
    '<div class="menu-card">' +
    '<div class="menu-title">Garage</div>' +
    '<div class="menu-label">Vehicle and trailer</div>' +
    `<div class="menu-row">${btns(Object.values(RIGS), "rig", game.rig.id)}</div>` +
    '<div class="menu-label">Difficulty</div>' +
    `<div class="menu-row">${btns(Object.values(DIFFICULTIES), "diff", game.difficulty.id)}</div>` +
    '<div class="menu-label">Location</div>' +
    `<div class="menu-row">${btns(Object.values(SCENARIOS), "scenario", game.scenario.id)}</div>` +
    '<button id="menu-close">Done</button>' +
    "</div>";
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
  (menu.querySelector("#menu-close") as HTMLElement).addEventListener("pointerdown", () => {
    menu.hidden = true;
  });
}
// Tap outside the card to dismiss (so the menu can never trap input).
menu.addEventListener("pointerdown", (e) => {
  if (e.target === menu) menu.hidden = true;
});
menuBtn.addEventListener("pointerdown", () => {
  renderMenu();
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
  "<li><b>View</b>: switch top-down or backup camera. <b>Mirrors</b> toggles the mirror strip.</li>" +
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
    const prevBest = loadProgress().bestScores[game.scenario.id];
    const best = recordBest(game.scenario.id, score).bestScores[game.scenario.id];
    const isNewBest = prevBest === undefined || score > prevBest;
    hud.setBest(best);
    const stars = score >= 90 ? 3 : score >= 72 ? 2 : 1;
    banner.innerHTML =
      '<div class="title">Parked!</div>' +
      `<div class="stars">${"★".repeat(stars)}${"☆".repeat(3 - stars)}</div>` +
      `<div class="score">Score ${score}</div>` +
      `<div class="best">${isNewBest ? "New best!" : `Best ${best}`}</div>` +
      `<div class="sub">${result.summary}</div>` +
      '<div class="row">' +
      '<button id="look">Keep looking</button>' +
      '<button id="again">Try again</button>' +
      "</div>";
    banner.hidden = false;
    // Use pointerdown (fires immediately on touch) so the first tap always lands;
    // a plain click was being dropped on the first press after a demo.
    (banner.querySelector("#again") as HTMLElement).addEventListener("pointerdown", restart);
    // Dismiss the banner but keep the parked scene, so you can free-look / switch views.
    (banner.querySelector("#look") as HTMLElement).addEventListener("pointerdown", () => {
      banner.hidden = true;
    });
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
  } else if (demoActive && solution) {
    // Fixed-timestep playback so it reproduces the verified solution exactly
    // (the reverse direction is unstable, so variable dt would drift).
    const fixed = 1 / 60;
    const dur = maneuverDuration(solution);
    demoAcc += dt;
    while (demoAcc >= fixed) {
      demoAcc -= fixed;
      if (demoT > dur) {
        game = setThrottle(game, 0);
        demoActive = false;
        break;
      }
      game = applyManeuverAt(game, solution, demoT);
      game = advance(game, fixed);
      demoT += fixed;
    }
  } else if (!won) {
    game = advance(game, dt);
  }

  // During the Demo, rotate the on-screen wheel to match the autopilot's steering
  // so you can see how much wheel the maneuver uses.
  if (demoActive) controls.setWheelVisual(game.delta / game.rig.maxSteer);

  renderer3d.render(game, view, {
    mirrors,
    showGhost: game.difficulty.showGhost,
    showGuides: game.difficulty.showGuideLines,
  });

  hud.update(game, debug);
  const d = derive(game.physics, game.rig, { v: commandedSpeed(game), delta: game.delta });
  // Coaching is an aid: Expert (showCoaching false) hides it, but the Demo always
  // narrates.
  const showCoach = demoActive || game.difficulty.showCoaching;
  coach.hidden = !showCoach;
  if (showCoach) {
    coach.textContent = demoActive
      ? "Demo: easing back and steering toward the driveway. Watch the trailer follow the wheel."
      : coachingMessage(game, d);
  }
  pull.hidden = !(d.jackknifeState === "recoverable" || d.jackknifeState === "contact");
  contact.hidden = !game.session.collidingNow;

  checkWin();

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
