# TrailerGame — Implementation Plan

## Context

Michael wants a mobile-web game that genuinely teaches him to back up a trailer (a real skill he's
practicing), not a quiz. It must model real trailer dynamics (counter-steering, jackknife), support
three rig types (car + single-axle "2-wheel" trailer, car + dual-axle "4-wheel" trailer, ag tractor +
ag trailer), let him pick between a Honda Odyssey and a Hyundai Ioniq 5, and run well in Safari on an
iPhone 17 Pro. Difficulty ramps from beginner (guides/overlays/forgiving) to expert (no aids, true
physics, and "no pulling forward unless the physics actually require it").

Research (cited, web) confirmed the design: the leading real teaching apps use a **top-down** view;
the universal instructor mantra is **"hand at the bottom of the wheel — move it the way you want the
trailer to go"**; the #1 training-wheels feature is a **predicted-path ghost overlay**; and a single
**off-axle one-trailer kinematic model** covers all three rigs by changing three constants. No
game/physics engine is needed (a rigid-body engine would be *less* correct at parking speed).

## Confirmed decisions

- **Tech:** Vanilla **TypeScript + HTML5 Canvas 2D**, Vite + Vitest. No framework, no game/physics
  engine, no backend. Client-side only; progress in `localStorage`.
- **Views (all three, switchable):** top-down (primary), mirror strip (rear + L/R), backup-camera
  view (usable only when trailer load is low/open; blocked when tall/enclosed — a per-rig/scenario flag).
- **Steering:** "bottom-of-wheel" control — dragging the bottom toward a side swings the trailer tail
  toward that side. Maps to front-wheel steer angle.
- **Physics:** realistic off-axle kinematic model, difficulty-scaled, **no rear-axle slip**.
  - `alphaDot = (v/W)·tan(delta)`
  - `gammaDot = (v/D)·sin(gamma) − (v/W)·(1 + (L/D)·cos(gamma))·tan(delta)` where `gamma = trailerHeading − carHeading`, reverse ⇒ `v<0`. Euler integration per substep.
  - Three constants per rig: `W` (tow wheelbase), `L` (hitch offset), `D` (trailer wheelbase; dual-axle ⇒ effective midpoint `D_eff`; ag ⇒ larger `L`).
- **Jackknife:** compute critical hitch angle (geometry-only, cached per rig) + hard contact limit
  (~75°). `ok → warn → recoverable → contact`. **Expert rule:** forward gear allowed only when state is
  `recoverable`/`contact` (i.e. pulling forward is physically necessary).
- **Scoring:** default = **accuracy + efficiency** (final lateral offset + heading error to target box;
  bonus for fewer correction-stops / shorter path; graduated penalties, not instant-fail). Behind a
  `Scorer` interface so relaxed-sandbox and CDL-style pass/fail drop in later with no rework.
- **Build approach:** **skeleton-first as a clean one-shot of a tight core**, then cheap data-driven
  expansion.

## Architecture

`src/core/*` is **pure** (no DOM/canvas/window) and is the only Vitest target; everything depends on
core, never the reverse.

```
src/
  core/    vec.ts, types.ts, physics.ts (step, derive), jackknife.ts (critical angle), predict.ts (ghost path)
  rigs/    types.ts, rigs.ts            # Rig = data: W,L,D,maxSteer,dims,loadBlocksCamera,hardLimitGamma,axleConfig
  scenarios/ types.ts, scenarios.ts     # Scenario = data: start pose,target box,obstacles,surface,slope,mirror/cam flags
  scoring/ types.ts (Scorer iface), defaultScorer.ts
  difficulty/ types.ts, difficulty.ts   # tunable feel knobs live here as data
  game/    state.ts, loop.ts (fixed-timestep accumulator), session.ts, persistence.ts
  input/   bottomWheel.ts               # pure pointer->steer mapping + thin DOM binder
  render/  camera.ts, drawWorld.ts, viewTopDown.ts, viewMirrors.ts, viewBackupCam.ts, overlays.ts
  ui/      hud.ts, controls.ts, coach.ts
  main.ts, styles.css
test/      physics.test.ts, jackknife.test.ts, bottomWheel.test.ts, scoring.test.ts
```

**Physics API:** `step(state, rig, input) -> newState` (pure); `derive(state, rig, limits) ->
PhysicsDerived` exposes trailer pose, `gammaDot`, `criticalGamma`, `hardLimitGamma`, `jackknifeState`
for overlays/coaching. `predictTailPath(...)` reuses `step` to draw the ghost.

**Three views from one world state, no 3D:** one `drawWorldInto(ctx, camera, world, opts)` primitive.
Mirrors/backup-cam are the *same* draw with a clipped, flipped/offset camera + a cheap linear depth
scale; fisheye/perspective are cut-able polish, not real projection.

**Slope (scenario 3):** add a one-line gravity roll term to commanded `v`; no new state. Off until needed.

## Phase 1 — Core one-shot

Odyssey + single-axle utility trailer (W≈3.0, L≈1.1, D≈1.8), 90° street→driveway back-in, all 3 views,
bottom-of-wheel control, ghost overlay, default scorer, Beginner difficulty.

1. Scaffold Vite vanilla-ts; `"dev": "vite --host"`; add Vitest; viewport meta + `touch-action:none`.
2. `core/types.ts`, `core/vec.ts`, `core/physics.ts` (`step`, `derive`).
3. `core/jackknife.ts` (`computeCriticalGamma` via bisection, `classify`).
4. **Unit tests (correctness gate):** straight reverse keeps `gamma=0`; `gamma=0,delta=0` is a fixed
   point; **steer-right-in-reverse swings tail the expected way (pins the sign convention)**; gamma
   growth steps `ok→warn→recoverable→contact`; `criticalGamma` in `(0, hardLimit)` and v-independent;
   forward motion reduces `|gamma|`.
5. `core/predict.ts` (+ straight-reverse ⇒ straight ghost test).
6. Data: one rig, the 90° scenario, Beginner difficulty config.
7. `game/loop.ts` fixed-timestep (physics ~120 Hz, render at rAF), `state.ts`, `session.ts`, `persistence.ts`.
8. `input/bottomWheel.ts` — pure mapping (unit-tested: bottom-right ⇒ tail-right-in-reverse) + DOM binder.
9. Render: `camera.ts`, `drawWorld.ts`, top-down, mirrors, backup-cam, overlays.
10. UI: view toggle, difficulty select, restart, HUD, coaching hints from `PhysicsDerived`.
11. `scoring/defaultScorer.ts` behind `Scorer` interface (only default wired).
12. Wire `main.ts`; play-test on phone.

**Verification:** `npm test` green (physics correctness) + manual phone play-test via the Vite
`Network:` URL on the iPhone over Wi-Fi. A hidden debug overlay (live `gamma/gammaDot/delta`) aids feel tuning.

## Expansion phases (cheap, mostly data)

- **P2 Difficulty tiers:** Intermediate/Expert configs; fade overlays with stored skill; enforce
  no-pull-forward-unless-`recoverable` (already plumbed).
- **P3 Rigs:** dual-axle (`D_eff` midpoint) and ag tractor+implement (larger `L`) as data rows.
- **P4 Scenarios:** driveway→lawn (L/R via a mirror param), steep hill→loading dock (enable slope +
  parameterized corridor width), angled back-in. All data.
- **P5 Scoring modes:** `sandboxScorer`, `cdlScorer` behind the existing interface.

## Riskiest parts (expect iteration here)

1. **Feel tuning** (steer-rate cap, timestep, nominal speed) — keep all knobs in `difficulty.ts` data;
   fixed-timestep for framerate independence; debug overlay.
2. **Mirror / backup-cam fake** — get top-down correct first; mirrors are the same draw with a
   flipped/clipped camera; cut fisheye if it doesn't read. No WebGL/3D.
3. **Sign conventions** — pin in unit tests *before* rendering; document the frame/heading/delta/gamma
   convention in a comment block atop `physics.ts`.

## Lean guardrails

No ECS/scene-graph/state lib; plain modules + one `GameState`. No physics engine. Collisions = cheap
point-in-rect / circle-distance against rig corners, scored as events (no response). Scoring stays a
single interface until a second mode exists.
