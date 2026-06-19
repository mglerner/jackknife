import { attachBottomWheel } from "../input/bottomWheel";
import type { Gear } from "../game/state";

export interface ControlHandlers {
  onSteer: (u: number) => void;
  onGear: (gear: Gear, active: boolean) => void;
  onToggleView: () => void;
  onToggleMirrors: () => void;
  onToggleDebug: () => void;
  onRestart: () => void;
  onDemo: () => void;
}

export interface Controls {
  detach(): void;
  /** Drive the wheel visual externally (u in [-1,1]); used during the Demo. */
  setWheelVisual(u: number): void;
  /** Enable/disable the Demo button (no verified solution for some rigs). */
  setDemoEnabled(on: boolean): void;
  /** Degrees the wheel visually rotates per unit of steer (u=1). Real steering
   *  ratio in realistic modes; a compact value for the super-beginner sweep. */
  setWheelRatio(degPerU: number): void;
  /** Show/hide the top-down toggle (hidden in mirrors-only "real backing" mode). */
  setViewToggleVisible(visible: boolean): void;
}

/** Build the bottom control bar: gear buttons, the bottom-of-wheel widget, toggles. */
export function createControls(parent: HTMLElement, h: ControlHandlers): Controls {
  const bar = document.createElement("div");
  bar.id = "controls";
  bar.innerHTML =
    '<div class="gears">' +
    '<button class="gear" data-rev>Reverse</button>' +
    '<button class="gear" data-fwd>Forward</button>' +
    "</div>" +
    '<div class="wheel" data-wheel>' +
    '<div class="wheel-rim"></div>' +
    '<div class="wheel-spokes"></div>' +
    '<div class="wheel-hub"></div>' +
    '<div class="wheel-mark"></div>' +
    "</div>" +
    '<div class="toggles">' +
    '<button data-view>View: top-down</button>' +
    '<button data-mirrors>Mirrors: on</button>' +
    '<button data-demo-run>Demo</button>' +
    '<button data-restart>Restart</button>' +
    '<button data-debug>Debug</button>' +
    "</div>";
  parent.appendChild(bar);

  const wheel = bar.querySelector("[data-wheel]") as HTMLElement;
  const wheelBinder = attachBottomWheel(wheel, { onChange: h.onSteer, holdOnRelease: true });

  const holdGear = (sel: string, gear: Gear): void => {
    const b = bar.querySelector(sel) as HTMLElement;
    const down = (e: PointerEvent): void => {
      b.setPointerCapture(e.pointerId);
      b.classList.add("active");
      h.onGear(gear, true);
      e.preventDefault();
    };
    const up = (e: PointerEvent): void => {
      try {
        b.releasePointerCapture(e.pointerId);
      } catch {
        /* already released */
      }
      b.classList.remove("active");
      h.onGear(gear, false);
    };
    b.addEventListener("pointerdown", down);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointercancel", up);
  };
  holdGear("[data-rev]", "reverse");
  holdGear("[data-fwd]", "forward");

  const viewBtn = bar.querySelector("[data-view]") as HTMLButtonElement;
  const mirrorsBtn = bar.querySelector("[data-mirrors]") as HTMLButtonElement;
  viewBtn.addEventListener("click", () => {
    h.onToggleView();
    viewBtn.textContent =
      viewBtn.textContent === "View: top-down" ? "View: camera" : "View: top-down";
  });
  mirrorsBtn.addEventListener("click", () => {
    h.onToggleMirrors();
    mirrorsBtn.textContent =
      mirrorsBtn.textContent === "Mirrors: on" ? "Mirrors: off" : "Mirrors: on";
  });
  (bar.querySelector("[data-restart]") as HTMLElement).addEventListener("click", h.onRestart);
  (bar.querySelector("[data-debug]") as HTMLElement).addEventListener("click", h.onToggleDebug);
  const demoBtn = bar.querySelector("[data-demo-run]") as HTMLButtonElement;
  demoBtn.addEventListener("click", h.onDemo);

  return {
    detach() {
      wheelBinder.detach();
      bar.remove();
    },
    setWheelVisual(u: number) {
      wheel.style.setProperty("--wheel-u", String(u < -1 ? -1 : u > 1 ? 1 : u));
    },
    setDemoEnabled(on: boolean) {
      demoBtn.disabled = !on;
      demoBtn.classList.toggle("is-disabled", !on);
      demoBtn.textContent = on ? "Demo" : "Demo (n/a)";
    },
    setWheelRatio(degPerU: number) {
      wheel.style.setProperty("--wheel-deg", String(degPerU));
      // Match the drag travel to the visual ratio so the wheel rotates 1:1 with the
      // thumb (full lock = the real ~1.4 turns of dragging, or a compact sweep).
      wheelBinder.setMaxRotDeg(degPerU);
    },
    setViewToggleVisible(visible: boolean) {
      viewBtn.hidden = !visible;
      if (visible) viewBtn.textContent = "View: top-down";
    },
  };
}
