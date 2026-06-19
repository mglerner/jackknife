import { derive } from "../core/physics";
import { commandedSpeed } from "../game/loop";
import type { GameState } from "../game/state";
import { trailerTargetError } from "../scoring/types";

export interface Hud {
  update(gs: GameState, debug: boolean): void;
  /** Set the best-score readout (undefined hides it). Called when it changes. */
  setBest(score: number | undefined): void;
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
    '<div class="readout" data-steer></div>' +
    '<div class="hud-best" data-best></div>' +
    '<div class="debug" data-debug hidden></div>';
  parent.appendChild(el);

  const jk = el.querySelector("[data-jk]") as HTMLElement;
  const err = el.querySelector("[data-err]") as HTMLElement;
  const steer = el.querySelector("[data-steer]") as HTMLElement;
  const bestEl = el.querySelector("[data-best]") as HTMLElement;
  const dbg = el.querySelector("[data-debug]") as HTMLElement;

  return {
    setBest(score) {
      // Always present (placeholder when none) so the panel height stays constant.
      bestEl.textContent = score === undefined ? "No best yet" : `Best ${score}`;
    },
    update(gs, debug) {
      const d = derive(gs.physics, gs.rig, { v: commandedSpeed(gs), delta: gs.delta });
      jk.textContent = `Trailer: ${JK_LABEL[d.jackknifeState]}`;
      jk.style.color = JK_COLOR[d.jackknifeState];

      const e = trailerTargetError(gs);
      err.textContent = `offset ${e.lateral.toFixed(2)} m, heading ${deg(e.heading).toFixed(0)}°`;

      // Real road-wheel angle and the equivalent steering-wheel turns, so the
      // numbers map to what you'd actually do in the car.
      const dlt = deg(gs.delta);
      const adlt = Math.abs(dlt);
      const turns = (adlt * (gs.rig.steeringRatio ?? 16)) / 360;
      const dir = adlt < 0.5 ? "" : dlt > 0 ? " L" : " R";
      steer.textContent = `tires ${adlt.toFixed(0)}°${dir} · wheel ${turns.toFixed(1)} turns`;

      dbg.hidden = !debug;
      if (debug) {
        // A CSS grid (see styles) aligns the columns; Unicode Greek for the symbols.
        const cell = (k: string, v: string): string =>
          `<span class="k">${k}</span><span class="v">${v}</span>`;
        dbg.innerHTML =
          cell("γ", `${deg(d.gamma).toFixed(1)}°`) +
          cell("γ̇", d.gammaDot.toFixed(3)) +
          cell("δ", `${deg(gs.delta).toFixed(1)}°`) +
          cell("v", `${commandedSpeed(gs).toFixed(2)} m/s`) +
          cell("γc", `${deg(d.criticalGamma).toFixed(1)}°`) +
          cell("γmax", `${deg(d.hardLimitGamma).toFixed(1)}°`);
      }
    },
  };
}
