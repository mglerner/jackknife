import { derive } from "../core/physics";
import { commandedSpeed } from "../game/loop";
import type { GameState } from "../game/state";
import { trailerTargetError } from "../scoring/types";

export interface Hud {
  update(gs: GameState, debug: boolean): void;
}

const deg = (r: number): number => (r * 180) / Math.PI;

const JK_COLOR: Record<string, string> = {
  ok: "var(--good)",
  warn: "var(--warn)",
  recoverable: "#ff9a3c",
  contact: "var(--bad)",
};

const JK_LABEL: Record<string, string> = {
  ok: "OK",
  warn: "careful",
  recoverable: "pull forward",
  contact: "jackknifed",
};

export function createHud(parent: HTMLElement): Hud {
  const el = document.createElement("div");
  el.id = "hud";
  el.innerHTML =
    '<div class="chip" data-jk></div>' +
    '<div class="readout" data-err></div>' +
    '<pre class="debug" data-debug hidden></pre>';
  parent.appendChild(el);

  const jk = el.querySelector("[data-jk]") as HTMLElement;
  const err = el.querySelector("[data-err]") as HTMLElement;
  const dbg = el.querySelector("[data-debug]") as HTMLElement;

  return {
    update(gs, debug) {
      const d = derive(gs.physics, gs.rig, { v: commandedSpeed(gs), delta: gs.delta });
      jk.textContent = `Trailer: ${JK_LABEL[d.jackknifeState]}`;
      jk.style.color = JK_COLOR[d.jackknifeState];

      const e = trailerTargetError(gs);
      err.textContent = `offset ${e.lateral.toFixed(2)} m, heading ${deg(e.heading).toFixed(0)} deg`;

      dbg.hidden = !debug;
      if (debug) {
        dbg.textContent =
          `gamma ${deg(d.gamma).toFixed(1)}  gammaDot ${d.gammaDot.toFixed(3)}\n` +
          `delta ${deg(gs.delta).toFixed(1)}  v ${commandedSpeed(gs).toFixed(2)}\n` +
          `crit ${deg(d.criticalGamma).toFixed(1)}  hard ${deg(d.hardLimitGamma).toFixed(1)}`;
      }
    },
  };
}
