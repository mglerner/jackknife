import { clamp } from "../core/vec";

// =============================================================================
// "Bottom-of-wheel" steering control. Encodes the universal instructor mantra:
// "move the BOTTOM of the wheel the way you want the trailer to go."
//
// Input u in [-1, 1]:  +1 = bottom of the wheel pushed to the RIGHT, meaning the
// driver wants the trailer's tail to go to the vehicle's RIGHT (world -y).
//
// In REVERSE this maps to a positive front-wheel steer angle (delta > 0), which
// the canonical EOM turns into tail-to-the-right motion. The joint input->physics
// test pins this so the mapping and the physics can never silently drift apart.
// =============================================================================

/** Map normalized bottom-of-wheel drag to a target front-wheel steer angle (rad). */
export function steerFromBottomWheel(u: number, maxSteer: number): number {
  return clamp(u, -1, 1) * maxSteer;
}

/** Normalized horizontal drag from a pointer X relative to a widget's center. */
export function normalizeDrag(pointerX: number, centerX: number, halfWidth: number): number {
  return clamp((pointerX - centerX) / halfWidth, -1, 1);
}

export interface BottomWheelOptions {
  onChange: (u: number) => void;
  /** Keep the angle when the finger lifts (default true). False = self-centering. */
  holdOnRelease?: boolean;
}

/**
 * Thin DOM binder: drag the widget left/right to steer. Pure mapping lives in
 * `normalizeDrag` / `steerFromBottomWheel`; this only wires pointer events and
 * publishes a CSS var `--wheel-u` for the visual.
 */
export function attachBottomWheel(el: HTMLElement, opts: BottomWheelOptions): () => void {
  const hold = opts.holdOnRelease ?? true;
  let active = false;

  const apply = (clientX: number): void => {
    const r = el.getBoundingClientRect();
    const u = normalizeDrag(clientX, r.left + r.width / 2, r.width / 2);
    el.style.setProperty("--wheel-u", String(u));
    opts.onChange(u);
  };

  const down = (e: PointerEvent): void => {
    active = true;
    el.setPointerCapture(e.pointerId);
    apply(e.clientX);
    e.preventDefault();
  };
  const move = (e: PointerEvent): void => {
    if (!active) return;
    apply(e.clientX);
    e.preventDefault();
  };
  const end = (e: PointerEvent): void => {
    active = false;
    try {
      el.releasePointerCapture(e.pointerId);
    } catch {
      /* pointer already released */
    }
    if (!hold) {
      el.style.setProperty("--wheel-u", "0");
      opts.onChange(0);
    }
  };

  el.addEventListener("pointerdown", down);
  el.addEventListener("pointermove", move);
  el.addEventListener("pointerup", end);
  el.addEventListener("pointercancel", end);
  return () => {
    el.removeEventListener("pointerdown", down);
    el.removeEventListener("pointermove", move);
    el.removeEventListener("pointerup", end);
    el.removeEventListener("pointercancel", end);
  };
}
