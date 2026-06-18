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
- **Physics:** realistic off-axle kinematic model, difficulty-scaled, **no rear-axle slip**. Derived
  from first principles (nonholonomic bicycle model) and cross-checked by independent derivation.
  - `carHeadingDot = (v/W)·tan(delta)`  (θc rate)
  - `trailerHeadingDot = −(v/D)·sin(gamma) − (L/D)·cos(gamma)·carHeadingDot`  (θt rate)
  - `gammaDot = trailerHeadingDot − carHeadingDot`
    `       = −(v/D)·sin(gamma) − (v/W)·(1 + (L/D)·cos(gamma))·tan(delta)`
    where `gamma = trailerHeading − carHeading`, reverse ⇒ `v<0`.
  - **Sign of the `sin(gamma)` term is `−`** (trailer-following term): with `delta=0`, forward
    (`v>0`) makes `gamma` decay (trailer self-centers — stable) and reverse (`v<0`) makes `gamma`
    grow (jackknife — unstable). A `+` here would make the trailer diverge going *forward*, which is
    impossible; the forward-self-centering unit test pins this.
  - Three constants per rig: `W` (tow wheelbase), `L` (hitch offset), `D` (trailer wheelbase; dual-axle
    ⇒ effective midpoint `D_eff`; ag ⇒ larger `L`).
  - **State vector** = `{ x, y, carHeading, trailerHeading }` (car rear-axle pose + trailer heading);
    `gamma` is **derived, never stored** — keeping both headings makes drawing both bodies + hitch
    trivial. **Semi-implicit Euler** at fixed physics dt (~1/120 s): per substep update headings from
    start-of-step `carHeadingDot`, then advance `x,y` with `v·cos(carHeading), v·sin(carHeading)`;
    clamp `|gamma|` at `hardLimitGamma` (~75°) as hard contact. Euler at 120 Hz is provably adequate
    (dynamics timescale `D/|v| ≈ 2–4 s` ≫ dt); RK4 is unjustified.
- **Jackknife:** `criticalGamma` = largest articulation angle from which full opposite lock can still
  null growth in reverse; beyond it recovery is impossible (forward gear physically necessary). Setting
  `gammaDot=0` at `delta=±δ_max` and factoring out `v` gives the **v-independent** condition
  `sin(γ)/D = (tan(δ_max)/W)·(1 + (L/D)·cos(γ))`, solved by **bisection** on `(0, hardLimitGamma)`
  (verify sign-change bracket; select recovery-relevant root), geometry-only, cached per rig. Plus hard
  contact limit (~75°). `classify` → `ok → warn → recoverable → contact`. **Expert rule:** forward gear
  allowed only when state is `recoverable`/`contact` (i.e. pulling forward is physically necessary).
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

**Canonical convention block (verbatim atop `physics.ts`, the single source of truth):** world `+x`
= car forward, `+y` = car left, angles CCW; `carHeading`/`trailerHeading` absolute, `gamma =
trailerHeading − carHeading`; `delta` positive = left turn (CCW); `v` = car rear-axle speed, reverse ⇒
`v<0`; the three EOM lines above are the only copy — input/render reference them, never re-derive.

**Physics API:** `step(state, rig, input) -> newState` (pure); `derive(state, rig, limits) ->
PhysicsDerived` exposes trailer pose, `gammaDot`, `criticalGamma`, `hardLimitGamma`, `jackknifeState`
for overlays/coaching. `predictTailPath(state, rig, input, horizon)` reuses `step` over a fixed horizon
(~2–3 s) holding **current `delta` and `v`** constant, sampling the trailer tail each substep.

**Three views from one world state, no 3D:** one `drawWorldInto(ctx, camera, world, opts)` primitive.
Mirrors/backup-cam are the *same* draw with a clipped, flipped/offset camera + a cheap linear depth
scale; fisheye/perspective are cut-able polish, not real projection.

**Slope (scenario 3):** add a one-line gravity roll term to commanded `v`; no new state. Off until needed.

## Phase 1 — Core one-shot

Odyssey + single-axle utility trailer (W≈3.0, L≈1.1, D≈1.8), 90° street→driveway back-in, all 3 views,
bottom-of-wheel control, ghost overlay, default scorer, Beginner difficulty.

Each step lists its acceptance check (✓). Step 4 is a hard gate — do not render before it is green.

1. Scaffold Vite vanilla-ts + Vitest; `"dev": "vite --host"`; viewport meta + `touch-action:none`.
   ✓ `npm run dev` serves a Network URL; `npm test` runs.
2. `core/vec.ts`, `core/types.ts` (`State`, `Rig`, `Input`, `PhysicsDerived`). ✓ compiles.
3. `core/physics.ts` with the canonical convention block, `step()` (semi-implicit, corrected EOM),
   `derive()`. ✓ exists, typed.
4. **Unit tests (correctness gate — write and pass before any rendering):**
   - straight reverse (`delta=0, gamma=0`) holds `gamma=0` (fixed point);
   - **forward (`v>0`), `delta=0`, `gamma>0` ⇒ `gamma` shrinks** (pins the corrected `−` sign; fails the old `+`);
   - **reverse (`v<0`), `delta=0`, `gamma>0` ⇒ `gamma` grows** (jackknife instability);
   - **steer sign:** reverse + chosen `delta` sign swings the tail the documented way (pins delta↔world);
   - `criticalGamma ∈ (0, hardLimitGamma)`, v-independent; just below it full counter-steer gives `gammaDot<0`, just above `>0`;
   - numeric regression: one fixed `(state,input)` → expected `newState` snapshot.
   ✓ all green.
5. `core/jackknife.ts` (`computeCriticalGamma` bisection, `classify`) + tests. ✓ green.
6. `core/predict.ts` (`predictTailPath`) + straight-reverse ⇒ straight ghost test. ✓ green.
7. Data: one rig (W≈3.0, L≈1.1, D≈1.8, `δ_max`, dims, `loadBlocksCamera`, `hardLimitGamma≈75°`), the
   90° scenario, Beginner difficulty config. ✓ typed data, no logic.
8. `game/loop.ts` fixed-timestep accumulator (physics ~120 Hz, render at rAF), `state.ts`,
   `session.ts`, `persistence.ts` (localStorage). ✓ loop steps physics deterministically.
9. `input/bottomWheel.ts` — pure mapping + DOM binder + **joint input→physics test** (bottom-of-wheel
   toward a side ⇒ that `delta` sign ⇒ tail toward that side, so mapping and EOM can't drift). ✓ green.
10. Render: `camera.ts`, `drawWorld.ts` (`drawWorldInto`), top-down, mirrors, backup-cam, overlays
    (ghost + jackknife state). ✓ car+trailer+target render and articulate on-screen.
11. `scoring/defaultScorer.ts` behind `Scorer` interface (only default wired). ✓ produces a score.
12. Wire `main.ts` (view toggle, difficulty select, restart, HUD, coaching from `PhysicsDerived`,
    hidden debug overlay); phone play-test via Vite Network URL. ✓ drivable on iPhone Safari.

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

1. **Sign conventions** (highest risk) — one canonical convention block atop `physics.ts` is the sole
   source of truth; pin every sign in unit tests (esp. forward-self-centering and the joint
   input→physics test) *before* any rendering. The corrected `−(v/D)·sin(gamma)` is load-bearing here.
2. **Feel tuning** (steer-rate cap, physics dt, nominal speed, ghost horizon) — keep all knobs in
   `difficulty.ts` data; fixed-timestep for framerate independence; hidden debug overlay shows live
   `gamma / gammaDot / delta / carHeading / trailerHeading`.
3. **Mirror / backup-cam fake** — get top-down correct first; mirrors are the same `drawWorldInto` with
   a flipped/clipped camera; cut fisheye if it doesn't read. No WebGL/3D. Zero physics coupling.

## Lean guardrails

No ECS/scene-graph/state lib; plain modules + one `GameState`. No physics engine. Collisions = cheap
point-in-rect / circle-distance against rig corners, scored as events (no response). Scoring stays a
single interface until a second mode exists.
