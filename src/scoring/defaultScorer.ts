import { derive } from "../core/physics";
import type { GameState } from "../game/state";
import type { ScoreResult, Scorer } from "./types";
import { isTrailerInTarget, trailerTargetError } from "./types";

const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x);

// Weights (a clean attempt tops out near 100). Stopping to reassess is good
// technique, so it is NOT penalized; inefficiency shows up as path length and
// pull-ups instead.
const W_LATERAL = 45; // accuracy: lateral offset to target
const W_HEADING = 35; // accuracy: heading match to target
const W_PATH = 20; // efficiency: short path
const P_GAMMA = 25; // graduated penalty for nearing/passing criticalGamma
const P_PULLFWD = 6; // per pull-up, capped

/**
 * Accuracy + efficiency scorer. Never instant-fails: a sloppy run still returns
 * a number, just a low one. `passed` reflects only whether the trailer ended up
 * inside the target box within difficulty tolerances.
 */
export const defaultScorer: Scorer = {
  scoreAttempt(gs: GameState): ScoreResult {
    const e = trailerTargetError(gs);
    const { posTolerance, headingTolerance } = gs.difficulty;
    const session = gs.session;

    // --- Accuracy: linear falloff from perfect (1) to at-tolerance (0). ---
    const latFrac = clamp01(1 - Math.abs(e.lateral) / posTolerance);
    const headFrac = clamp01(1 - Math.abs(e.heading) / headingTolerance);
    const lateralPts = W_LATERAL * latFrac;
    const headingPts = W_HEADING * headFrac;

    // --- Efficiency: shorter path. ---
    // Reference path: a straight shot from start to target as a cheap baseline.
    const refLen = Math.hypot(
      gs.scenario.target.x - gs.scenario.start.x,
      gs.scenario.target.y - gs.scenario.start.y,
    );
    const ratio = session.pathLength / Math.max(refLen, 1e-3);
    // No penalty up to 1.5x the straight-line distance; falls off beyond.
    const pathPts = W_PATH * clamp01(1 - Math.max(0, ratio - 1.5) / 1.5);

    // --- Graduated jackknife penalty from worst articulation reached. ---
    const d = derive(gs.physics, gs.rig, { v: 0, delta: 0 });
    const crit = d.criticalGamma;
    const hard = d.hardLimitGamma;
    const g = session.maxAbsGamma;
    let gammaPenalty: number;
    if (g <= 0.5 * crit) {
      gammaPenalty = 0; // comfortably safe
    } else if (g <= crit) {
      // Approaching critical: ramp 0 -> half penalty.
      gammaPenalty = P_GAMMA * 0.5 * ((g - 0.5 * crit) / (0.5 * crit));
    } else {
      // Past critical (recovery impossible / contact): ramp half -> full.
      const over = clamp01((g - crit) / Math.max(hard - crit, 1e-3));
      gammaPenalty = P_GAMMA * (0.5 + 0.5 * over);
    }

    const pullPenalty = Math.min(P_PULLFWD * session.pullForwards, 15);

    const breakdown: Record<string, number> = {
      lateral: lateralPts,
      heading: headingPts,
      path: pathPts,
      gammaPenalty: -gammaPenalty,
      pullForwardPenalty: -pullPenalty,
    };

    const raw = lateralPts + headingPts + pathPts - gammaPenalty - pullPenalty;
    const score = Math.max(0, Math.round(raw * 10) / 10);
    const passed = isTrailerInTarget(gs);

    const pullStr = session.pullForwards === 1 ? "1 pull-up" : `${session.pullForwards} pull-ups`;
    const summary = passed
      ? `Parked it, score ${score}. Lateral off by ${Math.abs(e.lateral).toFixed(2)} m, heading off by ${degStr(e.heading)}, ${pullStr}.`
      : `Missed the box, score ${score}. Lateral off by ${Math.abs(e.lateral).toFixed(2)} m, heading off by ${degStr(e.heading)}.`;

    return { score, passed, breakdown, summary };
  },
};

function degStr(rad: number): string {
  return `${Math.abs((rad * 180) / Math.PI).toFixed(0)} deg`;
}
