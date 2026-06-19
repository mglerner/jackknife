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
- Title / intro splash (JACKKNIFE, tap to start; also unlocks audio).
- Collision camera shake.
- Ioniq 5 polish (two-tone clearcoat, pixel lights, sunroof, aero wheels).
- Backup-camera reversing guide lines (distance bands behind the trailer).

## Done (cont.)
- Cinematic vignette; eased top-down camera follow; title button pulse.
- Win-screen gold star rating + banner pop-in; best score on the HUD.
- Ambient world life: gentle tree sway + breathing lamp glow (world.userData.tick).
- Garage menu card pop-in.

## Done (cont. 2)
- Help / how-to-play overlay (? button).
- Tactile button press feedback; frosted-glass backdrop blur on overlays.
- QA: all 4 rigs verified in-game; garage + help overlays render great; demo banner + stars good.

## Remaining (optional, low-risk; game is in great shape)
- [ ] Cargo variety / careful trailer stylization (isolated rig.ts builders only).
- [ ] Warm evening lighting variant (ONLY if guaranteed no wash-out).
- [ ] Possibly retire or gate the "Model: real" glTF toggle (shows a generic van for
      every rig now that the procedural models are good) - leave for the user to decide.
- [ ] Optional warm "evening" lighting variant (world.ts + renderer; verify no wash-out).
- [ ] More scenarios (driveway-to-lawn, loading dock) with verified solutions.
      NOTE: needs world.ts per-scenario environments + a solver pass; bigger.
- [ ] Realistic straight-start scenario (closed-loop demo). Hard; defer to with-user.

## Guardrails
- src/core/* pure. Keep `npx tsc --noEmit` and `npx vitest run` green before commits.
- Don't break test/solvable.test.ts. No em/en dashes in user-facing text.
