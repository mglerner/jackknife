import type { Vec2 } from "../core/vec";

export interface TargetBox {
  x: number;
  y: number;
  heading: number; // desired final trailer heading (rad)
  halfWidth: number;
  halfLength: number;
}

export type ObstacleShape =
  | { type: "rect"; x: number; y: number; w: number; h: number; rot: number }
  | { type: "circle"; x: number; y: number; r: number }
  | { type: "segment"; a: Vec2; b: Vec2 };

export interface Obstacle {
  kind: "wall" | "curb" | "cone";
  shape: ObstacleShape;
  penalty: number; // graduated; not instant-fail in the default scorer
}

export interface WorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface Scenario {
  id: string;
  label: string;
  start: { x: number; y: number; carHeading: number; trailerHeading: number };
  target: TargetBox;
  obstacles: Obstacle[];
  surface: "asphalt" | "gravel" | "lawn";
  slope: number; // rad of downhill grade; 0 in Phase 1
  slopeDir?: number; // world heading gravity pulls toward
  mirrorsAvailable: boolean;
  cameraAvailable: boolean;
  worldBounds: WorldBounds;
  params?: Record<string, number>;
}
