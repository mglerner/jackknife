# Overnight autonomous plan (Jackknife)

Started 2026-06-18 ~21:36, working until ~06:00. Stylized game-quality visuals
(Art of Rally / Crossy Road vibe). Commit frequently, keep tests + typecheck green.

## Done tonight
- Sound effects wired in (engine hum tracks speed, backup beep, collision thud, win chime).
- Particle juice: wheel dust + exhaust puffs (pooled THREE.Points).
- Best-score persistence (localStorage) shown on the win banner.
- Pinch to zoom the top-down view.
- Stylized world: gradient sky dome, vibrant palette, rounded trees, flower beds,
  rocks, lamp post, softer prettier shadows.
- Garage menu: pick among 4 rigs and 3 difficulty tiers; rebuilds the rig live.
- Three new rig models: Ioniq 5 crossover, compact tractor + grain wagon, tandem
  utility trailer. Odyssey unchanged.
- Rounder nose (stylized). More contextual coaching copy.
- ?rig= / ?difficulty= deep-link startup params.

## Remaining (rough priority)
- [ ] Title / intro splash (game feel).
- [ ] More juice: camera ease on speed, tiny shake on contact.
- [ ] Polish the Ioniq model (a bit plain).
- [ ] More scenarios (driveway-to-lawn, loading dock) with verified solutions.
      NOTE: needs world.ts to render per-scenario environments + a solver pass; bigger.
- [ ] Realistic straight-start scenario (closed-loop demo). Hard; defer to with-user.

## Guardrails
- src/core/* pure. Keep `npx tsc --noEmit` and `npx vitest run` green before commits.
- Don't break test/solvable.test.ts. No em/en dashes in user-facing text.
