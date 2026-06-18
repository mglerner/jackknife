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
    '<div class="wheel" data-wheel><div class="wheel-face"></div><div class="wheel-mark"></div></div>' +
    '<div class="toggles">' +
    '<button data-view>View: top-down</button>' +
    '<button data-mirrors>Mirrors: on</button>' +
    '<button data-demo-run>Demo</button>' +
    '<button data-restart>Restart</button>' +
    '<button data-debug>Debug</button>' +
    "</div>";
  parent.appendChild(bar);

  const wheel = bar.querySelector("[data-wheel]") as HTMLElement;
  const detachWheel = attachBottomWheel(wheel, { onChange: h.onSteer, holdOnRelease: true });

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
  (bar.querySelector("[data-demo-run]") as HTMLElement).addEventListener("click", h.onDemo);

  return {
    detach() {
      detachWheel();
      bar.remove();
    },
  };
}
