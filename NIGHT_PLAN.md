# Overnight autonomous plan (Jackknife)

Started 2026-06-18 ~21:36, working until ~06:00. Goal: a FREAKING lot of awesome
stuff, with stylized game-quality visuals (think Art of Rally / Crossy Road: clean,
vibrant, satisfying, NOT photoreal trucking sim). Commit frequently, keep tests +
typecheck green, never leave the tree broken.

## Done tonight
- (rolling list, newest at bottom)

## Roadmap (rough priority)
1. [ ] Sound effects wired into the game (engine hum tracks speed, backup beep in
       reverse, collision thud, success chime). sfx module already exists.
2. [ ] Stylized visual pass on the WORLD: nicer gradient sky + sun, warmer/cleaner
       palette, softer shadows, subtle vignette feel, more cohesive props.
3. [ ] Juice: dust/exhaust puffs when the rig moves, a little squash/scale feedback,
       smoother camera.
4. [ ] Home / selection screen: pick vehicle, trailer, scenario, difficulty. Exposes
       the difficulty tiers and the extra rigs that already exist as data.
5. [ ] Other rig 3D models: Ioniq 5 (suv), dual-axle trailer, ag tractor. They are
       data-only right now and render as the Odyssey.
6. [ ] More scenarios (driveway-to-lawn L/R, loading dock) with verified demo
       solutions (solvable test must pass).
7. [ ] Best-score persistence in localStorage; show best on the banner.
8. [ ] Pinch / zoom for the top-down view.
9. [ ] Polish: coaching copy, HUD, title/intro, accessibility.

## Guardrails
- src/core/* stays pure (only Vitest target). Keep `npx tsc --noEmit` and
  `npx vitest run` green before every commit.
- Don't break the existing verified demo (test/solvable.test.ts).
- No em or en dashes in user-facing text.
- Commit messages end with the Co-Authored-By line.
