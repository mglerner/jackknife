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
import { DEFAULT_RIG } from "./rigs/rigs";
import { DEFAULT_SCENARIO } from "./scenarios/scenarios";
import { DEFAULT_DIFFICULTY } from "./difficulty/difficulty";
import { steerFromBottomWheel } from "./input/bottomWheel";
import { createRenderer3d, type ViewMode } from "./render3d/renderer";
import { isTrailerInTarget } from "./scoring/types";
import { defaultScorer } from "./scoring/defaultScorer";
import { createHud } from "./ui/hud";
import { createControls } from "./ui/controls";
import { coachingMessage } from "./ui/coach";

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = "";

const canvas = document.createElement("canvas");
canvas.id = "view";
app.appendChild(canvas);
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

let game = createGame(DEFAULT_RIG, DEFAULT_SCENARIO, DEFAULT_DIFFICULTY);
let view: ViewMode = "topdown";
let mirrors = DEFAULT_DIFFICULTY.mirrorsDefault;
let debug = false;
let won = false;

const renderer3d = createRenderer3d(canvas, game);

const hud = createHud(app);

function restart(): void {
  game = resetGame(game);
  won = false;
  banner.hidden = true;
}

createControls(app, {
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
});

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

function checkWin(): void {
  if (won) return;
  if (isTrailerInTarget(game) && Math.abs(commandedSpeed(game)) < 1e-3) {
    won = true;
    const result = defaultScorer.scoreAttempt(game);
    banner.innerHTML =
      '<div class="title">Parked!</div>' +
      `<div class="score">Score ${Math.round(result.score)}</div>` +
      `<div class="sub">${result.summary}</div>` +
      '<button id="again">Try again</button>';
    banner.hidden = false;
    (banner.querySelector("#again") as HTMLElement).addEventListener("click", restart);
  }
}

let last = 0;
function frame(t: number): void {
  if (cssW === 0) resize();
  const dt = last ? (t - last) / 1000 : 0;
  last = t;

  if (!won) game = advance(game, dt);

  renderer3d.render(game, view, {
    mirrors,
    showGhost: game.difficulty.showGhost,
    showGuides: game.difficulty.showGuideLines,
  });

  hud.update(game, debug);
  const d = derive(game.physics, game.rig, { v: commandedSpeed(game), delta: game.delta });
  coach.textContent = coachingMessage(game, d);
  pull.hidden = !(d.jackknifeState === "recoverable" || d.jackknifeState === "contact");

  checkWin();
  requestAnimationFrame(frame);
}

resize();
requestAnimationFrame(frame);
