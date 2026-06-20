/**
 * Optimizer for demo solutions. Hill-climbing + random restarts over each
 * segment's steer/seconds, using evaluateManeuver as the oracle. Run with:
 *   npx vite-node scripts/solve.ts
 * This file lives under scripts/ (outside tsconfig include) so it does not
 * affect `tsc --noEmit` of the app.
 */
import { evaluateManeuver, type Maneuver, type ManeuverResult } from "../src/game/autopilot";
import { SOLUTIONS } from "../src/game/solutions";
import { SCENARIOS } from "../src/scenarios/scenarios";
import { RIGS } from "../src/rigs/rigs";
import { BEGINNER } from "../src/difficulty/difficulty";
import { computeCriticalGamma } from "../src/core/jackknife";

const clamp = (x: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, x));

const SCENARIO_IDS = [
  "apron-to-loading-dock",
  "driveway-straight-start",
  "street-to-gate-narrow",
  "flanked-loading-dock",
  "parallel-park-curb",
  "lcorner-backin-90",
  "driveway-downhill",
  "blindside-backin",
  "driveway-uphill",
  "s-curve-alley",
  "garage-straight",
  "angled-spot",
  "long-chute",
];

const TARGET_RIGS = ["ioniq5-utility", "odyssey-dual", "tractor-ag"];

function cost(rigId: string, scenarioId: string, m: Maneuver): { c: number; r: ManeuverResult; crit: number } {
  const rig = RIGS[rigId];
  const scenario = SCENARIOS[scenarioId];
  const crit = computeCriticalGamma(rig);
  if (m.some((s) => s.gear === "forward")) {
    return { c: 1e9, r: { parked: false, lateral: 0, longitudinal: 0, heading: 0, usesForward: true, wallContacts: 0, maxAbsGamma: 0 }, crit };
  }
  const r = evaluateManeuver(rig, scenario, BEGINNER, m);
  let c = 0;
  // Final pose error: lateral & longitudinal weighted, heading too.
  c += 6 * Math.abs(r.lateral) + 6 * Math.abs(r.longitudinal) + 4 * Math.abs(r.heading);
  if (!r.parked) c += 50;
  if (r.maxAbsGamma >= crit) c += 200 * (1 + (r.maxAbsGamma - crit));
  c += 100 * r.wallContacts;
  // small duration penalty to prefer compact solutions
  const dur = m.reduce((t, s) => t + s.seconds, 0);
  c += 0.05 * dur;
  return { c, r, crit };
}

function accepted(rigId: string, scenarioId: string, m: Maneuver): { ok: boolean; r: ManeuverResult; crit: number } {
  const { r, crit } = cost(rigId, scenarioId, m);
  const ok = r.parked && r.maxAbsGamma < crit && r.wallContacts === 0 && !r.usesForward;
  return { ok, r, crit };
}

function mutate(m: Maneuver, scale: number): Maneuver {
  return m.map((s) => {
    if (Math.random() < 0.6) {
      const steer = clamp(s.steer + (Math.random() * 2 - 1) * scale, -1, 1);
      const seconds = Math.max(0.1, s.seconds + (Math.random() * 2 - 1) * scale * 2);
      return { gear: "reverse" as const, steer, seconds };
    }
    return { gear: "reverse" as const, steer: s.steer, seconds: s.seconds };
  });
}

function hillClimb(rigId: string, scenarioId: string, seed: Maneuver, iters: number): { best: Maneuver; bestC: number } {
  let best = seed.map((s) => ({ gear: "reverse" as const, steer: s.steer, seconds: s.seconds }));
  let bestC = cost(rigId, scenarioId, best).c;
  let scale = 0.4;
  for (let i = 0; i < iters; i++) {
    const cand = mutate(best, scale);
    const c = cost(rigId, scenarioId, cand).c;
    if (c < bestC) {
      best = cand;
      bestC = c;
    } else if (i % 200 === 199) {
      scale = Math.max(0.03, scale * 0.85); // anneal
    }
  }
  return { best, bestC };
}

function randomSeed(nSeg: number, baseDur: number): Maneuver {
  const m: Maneuver = [];
  for (let i = 0; i < nSeg; i++) {
    m.push({ gear: "reverse", steer: Math.random() * 2 - 1, seconds: 0.3 + Math.random() * baseDur });
  }
  return m;
}

const results: Record<string, Maneuver> = {};
const skipped: string[] = [];

for (const rigId of TARGET_RIGS) {
  for (const scenarioId of SCENARIO_IDS) {
    const seedKey = `odyssey-utility/${scenarioId}`;
    const seed = SOLUTIONS[seedKey];
    if (!seed) {
      console.log(`NO SEED for ${seedKey}`);
      continue;
    }
    let best: Maneuver | null = null;
    let bestC = Infinity;

    // Candidate starting points: the odyssey-utility seed, plus random restarts
    // with varying segment counts.
    const starts: Maneuver[] = [seed.map((s) => ({ gear: "reverse" as const, steer: s.steer, seconds: s.seconds }))];
    const baseDur = seed.reduce((t, s) => t + s.seconds, 0) / Math.max(1, seed.length);
    for (let r = 0; r < 8; r++) {
      const nSeg = 2 + (r % 5);
      starts.push(randomSeed(nSeg, baseDur));
    }
    // also a couple of seed-perturbed restarts
    for (let r = 0; r < 4; r++) starts.push(mutate(seed.map((s) => ({ gear: "reverse" as const, steer: s.steer, seconds: s.seconds })), 0.5));

    for (const start of starts) {
      const { best: b, bestC: bc } = hillClimb(rigId, scenarioId, start, 2500);
      if (bc < bestC) {
        bestC = bc;
        best = b;
      }
      // Early stop if we have a comfortably accepted solution.
      if (best && accepted(rigId, scenarioId, best).ok && bestC < 1) break;
    }

    const key = `${rigId}/${scenarioId}`;
    if (best && accepted(rigId, scenarioId, best).ok) {
      const { r, crit } = cost(rigId, scenarioId, best);
      console.log(`ACCEPT ${key}  cost=${bestC.toFixed(3)} maxGamma=${r.maxAbsGamma.toFixed(4)} crit=${crit.toFixed(4)} lat=${r.lateral.toFixed(3)} lon=${r.longitudinal.toFixed(3)} head=${r.heading.toFixed(3)} segs=${best.length}`);
      results[key] = best;
    } else {
      const info = best ? cost(rigId, scenarioId, best) : null;
      console.log(`SKIP   ${key}  bestCost=${bestC.toFixed(3)}` + (info ? ` parked=${info.r.parked} maxGamma=${info.r.maxAbsGamma.toFixed(4)} crit=${info.crit.toFixed(4)} wall=${info.r.wallContacts}` : ""));
      skipped.push(key);
    }
  }
}

import { writeFileSync } from "node:fs";
writeFileSync(new URL("./solved.json", import.meta.url), JSON.stringify(results, null, 2));
console.log(`\nAccepted: ${Object.keys(results).length}, Skipped: ${skipped.length}`);
console.log(`Skipped keys: ${skipped.join(", ")}`);
console.log(`Wrote scripts/solved.json`);
