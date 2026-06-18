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

/** Wheel travel (radians) that corresponds to full steering lock. */
const MAX_WHEEL_ROT = (140 * Math.PI) / 180;

/**
 * Thin DOM binder: grab the wheel ANYWHERE (top, bottom, or side) and rotate it
 * like a real steering wheel. Accumulated rotation maps to u, so grabbing the top
 * and pushing right steers opposite to grabbing the bottom and pushing right (as a
 * real wheel does), while "the bottom leads the trailer" still holds. Pure mapping
 * stays in `steerFromBottomWheel`; this only tracks angular drag and publishes the
 * CSS var `--wheel-u` for the visual.
 */
export function attachBottomWheel(el: HTMLElement, opts: BottomWheelOptions): () => void {
  const hold = opts.holdOnRelease ?? true;
  let active = false;
  let lastAngle = 0;
  let rot = 0; // accumulated wheel rotation (screen radians; CSS positive = clockwise)

  const angleAt = (clientX: number, clientY: number): number => {
    const r = el.getBoundingClientRect();
    return Math.atan2(clientY - (r.top + r.height / 2), clientX - (r.left + r.width / 2));
  };

  const publish = (): void => {
    rot = clamp(rot, -MAX_WHEEL_ROT, MAX_WHEEL_ROT);
    // Pushing the bottom to the right is a negative screen rotation; read it as u>0.
    const u = clamp(-rot / MAX_WHEEL_ROT, -1, 1);
    el.style.setProperty("--wheel-u", String(u));
    opts.onChange(u);
  };

  const down = (e: PointerEvent): void => {
    active = true;
    el.setPointerCapture(e.pointerId);
    lastAngle = angleAt(e.clientX, e.clientY);
    e.preventDefault();
  };
  const move = (e: PointerEvent): void => {
    if (!active) return;
    const a = angleAt(e.clientX, e.clientY);
    let da = a - lastAngle;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da <= -Math.PI) da += 2 * Math.PI;
    rot += da;
    lastAngle = a;
    publish();
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
      rot = 0;
      publish();
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
