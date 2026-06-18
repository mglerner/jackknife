import { describe, it, expect } from "vitest";
import { rigCollision, carCorners, trailerCorners } from "../src/game/collision";
import { ODYSSEY_UTILITY } from "../src/rigs/rigs";
import { STREET_TO_DRIVEWAY_90 } from "../src/scenarios/scenarios";
import type { State } from "../src/core/types";

const rig = ODYSSEY_UTILITY;
const sc = STREET_TO_DRIVEWAY_90;

describe("collision", () => {
  it("the start pose on the street is clear", () => {
    const s: State = {
      x: sc.start.x,
      y: sc.start.y,
      carHeading: sc.start.carHeading,
      trailerHeading: sc.start.trailerHeading,
    };
    const c = rigCollision(s, rig, sc.obstacles, sc.worldBounds);
    expect(c.wall).toBe(false);
    expect(c.bounds).toBe(false);
  });

  it("a car straddling a driveway side wall reports a wall hit", () => {
    const s: State = { x: -3, y: 9, carHeading: 0, trailerHeading: 0 };
    expect(rigCollision(s, rig, sc.obstacles, sc.worldBounds).wall).toBe(true);
  });

  it("a rig outside the world reports a bounds hit", () => {
    const s: State = { x: 30, y: 0, carHeading: 0, trailerHeading: 0 };
    expect(rigCollision(s, rig, sc.obstacles, sc.worldBounds).bounds).toBe(true);
  });

  it("footprints are quadrilaterals", () => {
    const s: State = { x: 0, y: 0, carHeading: 0, trailerHeading: 0 };
    expect(carCorners(s, rig)).toHaveLength(4);
    expect(trailerCorners(s, rig)).toHaveLength(4);
  });
});
