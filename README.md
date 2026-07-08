# Empyrean

A game extracted from a clean skeleton workshop, which in turn was extracted from the avatar STL project.

## Version

- Empyrean build: `0.2.14-alpha`
- Three.js: `0.164.1`
- lil-gui: `0.19`

## What This Is

This project began as a clean skeleton workshop and is now becoming the exploration/rigging lab for Empyrean:

- four connected Three.js rooms plus an outside enclosure
- full puppet skeleton
- joint markers and labels
- local axis marker
- GLB tree and dead-tree props with existing tree colliders outside
- floating ghostly wireframe spheres
- wide proportion sliders
- per-joint X/Y/Z point offsets
- per-joint bind-pose rotation controls
- idle and walk preview motion
- Shift+W running cycle with blended walk-to-run acceleration, flight, lean, hip/shoulder counter-twist, and bent-elbow arm pump
- smoothed turn anticipation with head/neck/chest look-in and movement-scaled banking
- jump physics and crouch/landing pose response
- simple rig footprint collision against the room walls
- GLB import with generated skin weights for the Empyrean puppet skeleton
- separate render, adjust, rig workflow for imported meshes
- Puppet Shop module and GUI for named reusable complete rig packages
- project-owned default player rig package at `assets/rigs/player.default.rig.json`
- entity layer that wraps the player and supports spawned NPC/enemy rigs
- entity controller scaffold for keyboard/static/future AI control
- console helpers for spawning and listing saved-rig entities during development
- keyboard movement and arm pose controls
- mouse wheel camera zoom
- browser scratch save/load/export for tuning plus real JSON rig-package backups
- solo-builder docs and checkpoint helper
- world collision debug overlay
- data-driven encounter trigger zones
- combat d20 as a numbered rough-stone 3D object
- separate `oracleD20.js` module for the physical d20/oracle object and roll state
- passive screen-space oracle-roll HUD that fades in only during the visible d20 roll
- placeholder oracle-roll HUD result messages mapped to d20 values 1 through 20
- focused rig mesh mode
- start-here runbook and verification helper
- mouse drag joint point editing
- first physics and rig module split
- 5% opacity default-height wireframe disk
- combat encounter prototype with enemy GLB, battle audio, dice roll, hitbox, evasion, health bar, and right-hand sword attacks
- separate `audioManager.js` module for ambient drone, combat music, fades, one-shots, pause/resume, and encounter audio actions
- TEMP devProbe coordinate marker for measuring rig-relative attachment points
- skeleton guide opacity control for viewing the rigged mesh more clearly
- G53-style machine-home rigging mode shell for stable pivot tuning
- G53 visibility fixture that hides walls/ceilings/clutter while rigging
- G53 combat-visual suppression for cleaner measuring near machine home
- G53 X/Y/Z axis locks for mouse joint dragging
- G53 hold-child-points mode for independent pivot fitting
- G53 pose freeze that disables animation solvers during pivot fitting
- capture-phase F2 hotkey recovery after local mesh loading
- cold-start-safe G53 entry and failed-enter recovery
- bind-pose-aware generated skin side selection for rotated meshes
- Sigewynn default temp mesh, plainSword combat prop, post-rig visible arm relaxation, and a named arm pose resolver for easier stance/swing work
- rig calibration / visible pose split so T/A reference arms can be preserved without leaving gameplay arms raised
- saved `Sword Offsets` GUI controls for sword path, length, grip, grip trim, position, pitch, yaw, and roll
- sword-only preset library for named weapon workholding setups
- separate `sword.js` module for weapon GLB loading, grip math, attachment, presets, and future weapon-state setup
- pure combat balance math module and Low Guard stance on sword draw
- neutral body/knee facing correction so anatomical right/left and foot direction read correctly while the related Y bind-rotation sliders read zero
- Empyrean room aesthetic pass with stone floor/wall textures, with the old room walls/ceilings/torches now render-suppressed behind the cathedral shell
- four-room stone block with a northwest room at X-24/Z-24 and full block dimensions documented for outside-shell asset work
- staged `Cathedral_lowPoly2.glb` visual shell loaded in `world.js` with temporary scale/position calibration constants and a generated-UV pass for `texture_0.png`
- expanded outside enclosure at `384 x 384 x 36` scene units, centered equally around gameplay X0/Z0
- `cave.glb` rough-draft world prop near the moon with simple proxy rectangle colliders
- seeded outside landmark scatter using extra `tree.glb`, `deadTree.glb`, `campfire.glb`, `skull.glb`, `rock1.glb`, and `rock2.glb` props
- camera-facing, camera-relative `moon_2K.jpg` sky disc that remains at a constant viewing distance
- world-owned sky moon setup in `world.js`
- real-world lunar-phase presentation with continuous Three.js shadow geometry, restrained earthshine, phase-aware atmospheric flare, and automatic northern/southern orientation
- EMPYREAN stone-engraved title card with animated gradient and delayed reveal
- quaternion locomotion integration complete in `movementEngine.js`; run-cycle work is now in tuning/refinement

---

## How The Code Is Organized

Think of the project like a machine shop with a main floor and a few specialized stations. Each file is a station with a clear job. No station is supposed to call into another station's private area — they pass work back and forth through the front window only.

```
index.html          ← the building itself
                      holds the loading screen, wires up CSS,
                      and connects the import map so the browser
                      knows where to find Three.js and lil-gui

main.js             ← the floor supervisor
                      runs startup, owns the animation loop,
                      runs the GUI, handles keyboard/mouse input,
                      and calls every other station when it needs work done

world.js            ← the fixtures and layout station
                      builds all the geometry (rooms, trees, outside walls,
                      ghost spheres, sky moon, lighting), owns the collision
                      data, resolves wall/tree collisions, runs the encounter
                      system, draws the debug overlay

skin.js             ← the mesh-fitting station
                      handles everything about the imported GLB mesh:
                      loading it, previewing it, generating the skin weights
                      that let it follow the puppet skeleton, and cleaning
                      up after itself

combat_updated.js   <- the encounter prototype station
                      owns the combat trigger, enemy.glb loader/fit, hitbox,
                      simple evasion, health, hiding, sword-hit validation,
                      and the decision to ask the oracle and audio manager for
                      roll/music behavior

oracleD20.js        <- the physical d20/oracle station
                      owns the rough-stone numbered die, face/value mapping,
                      roll quaternions, roll value, settled state, and rolling
                      update. It does not decide enemy behavior or audio.

audioManager.js     <- the sound station
                      owns the ambient chapel drone, combat music, fades,
                      one-shot sounds, pause/resume behavior, and encounter
                      audio actions. Gameplay asks it for sound changes; it
                      does not decide combat or world state.

combatPhysics.js    <- the combat math station
                      pure formulas only: base of support, combined center of
                      mass, stability margin, critical tipping angle, and
                      named stance profiles such as Low Guard. No scene
                      objects, no GUI, no animation frame side effects.

sword.js            <- the weapon workholding station
                      owns plainSword defaults, sword offset limits, sword
                      preset storage, GLB loading/disposal, grip-anchor
                      normalization math, and rightPalm attachment. main.js
                      asks it to load, reload, hide, save, and reattach.

entity.js           <- the actor wrapper station
                      separates "a puppet rig" from "the player" by wrapping
                      skeletons, skins, rig tuning, role, controller, and
                      per-entity state into reusable Entity records. It can
                      spawn NPC/enemy entities from saved Puppet Shop packages.

entityControllers.js <- the intent station
                      defines the controller interface for entities. The
                      current build has keyboard and static controllers only;
                      wander, patrol, and enemy-combat controllers are named
                      future targets.

physics.js          ← the math reference binder
                      pure formulas only — jump gravity, launch velocity,
                      jump state machine, pose weights, walk/run phase shaping,
                      smoothstep, clamp. No scene objects, no GUI, just math.
                      main.js calls these like looking up a formula in a book.

moonPhase.js        <- the lunar data station
                      pure real-world date math and presentation metadata for
                      moon age, continuous phase, illumination, phase name,
                      waxing state, hemisphere, and light-side orientation.
                      No DOM, geolocation request, Three.js, or gameplay state.

puppetShop.js       <- the rig package shelf
                      pure browser/data code for complete rig packages,
                      reusable rig identity, local rig-library storage,
                      package summaries, JSON import/export compatibility.
                      No Three.js scene objects and no gameplay state.

rig.js              ← the blueprint dimension sheet
                      stores the default body measurements and the slider
                      ranges for the dimension controls. One place to look
                      up or change what "default human proportions" means
                      for this rig.

encounters.js       ← the job tickets
                      a list of named trigger zones (circles or rectangles)
                      placed around the world. Each one says what to do
                      when the avatar walks in or out. world.js reads this
                      list and runs the actions.
```

### How They Connect

```
index.html
    └── loads main.js (as a module)

main.js
    ├── imports from world.js   (build world, collision, encounters, debug)
    ├── imports from skin.js    (mesh import pipeline)
    ├── imports from physics.js (jump + walk/run math)
    ├── imports from puppetShop.js (complete rig packages + rig library)
    ├── imports from rig.js     (body dimensions)
    └── imports from encounters.js (trigger zone definitions)

world.js
    └── imports from three only

skin.js
    ├── imports from three
    └── imports disposeObjectTree from world.js

physics.js
    └── no imports (pure math)

puppetShop.js
    └── no imports (pure package/library data)

rig.js
    └── no imports (pure data)

encounters.js
    └── no imports (pure data)
```

The rule: nothing imports from main.js. main.js is the only thing that pulls everything together. If world.js or skin.js needed something from main.js, that would be a circular dependency — like a parts station trying to call the floor supervisor to ask for a part the floor supervisor asked the parts station to make in the first place. Instead, main.js passes what each station needs as a parameter when it calls them.

Entity note: the diagram above is intentionally conservative, but the active runtime now also imports `entity.js` and `entityControllers.js`. `entity.js` wraps player/NPC/enemy rigs as Entity records. `entityControllers.js` defines the controller interface and current keyboard/static controller stubs. These modules still follow the same rule: they do not import from `main.js`; `main.js` passes the skeleton, skinning, and update helpers they need.

Combat has one extra internal helper now: `combat_updated.js` imports `oracleD20.js`. The encounter controller still decides when the roll starts, what the result means for enemy evasion, and when combat changes phase. `oracleD20.js` only owns the physical die and its roll state.

Combat follows the same station rule. `main.js` imports `combat_updated.js`, calls `initCombatEncounter()` once during startup, calls `updateCombatEncounter(delta)` once per animation frame, and calls `attemptCombatSwordHit()` only when the player swings. `main.js` owns player input, arm pose selection, and the decision to swing. `sword.js` owns the sword model, grip fitting, palm attachment, offsets, and presets. `combat_updated.js` owns trigger state, enemy GLB fitting, hitbox, evasion, health, hiding, victory, and the decision to consume oracle/audio results. `oracleD20.js` owns the physical numbered d20 object and roll state. `audioManager.js` owns ambient and combat Audio elements, fades, one-shots, encounter audio actions, and pause/resume. `combatPhysics.js` owns the readable balance formulas and stance profiles, while `main.js` converts the live Three.js joint positions into the root-local numbers those formulas need.

The Entity layer is the newest boundary. `entity.js` does not replace the old player path yet; it wraps it. `state.player` points at the same skeleton, imported skin, `controlState`, and `rigTuning` that `main.js` already uses. Spawned NPC/enemy entities get their own skeleton, their own cloned rig tuning, optional mesh binding from a saved Puppet Shop package, and their own state record. `entityControllers.js` names how an entity decides what it wants to do, but only keyboard/static controllers are active right now.

Current entity-refactor status:

- Player gameplay still uses the legacy `state.skeleton` / `controlState` path.
- `state.player` is a wrapper around that existing player, not a replacement.
- `state.entities` contains the player plus any spawned NPC/enemy entities.
- Non-player entities currently run idle motion and skin sync only.
- Walk/run/combat/jump for non-player entities are future passes.
- Puppet Shop creates and saves rig packages; gameplay consumes those packages.

Development console helpers:

- `await empyreanSpawnNPC("Rig Name", x, z, yaw)` spawns a saved rig package as an NPC.
- `await empyreanSpawnEnemy("Rig Name", x, z, yaw)` spawns a saved rig package as an enemy.
- `empyreanListEntities()` prints the active entity list with role, controller, position, and mesh status.

### Where to Make Common Changes

| You want to change...                                                       | Go to...                                                                      |
| --------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Movement speed, camera feel, colors                                         | `SOLO_TWEAKS` near the top of `main.js`                                       |
| Ambient/combat audio paths, fade behavior, one-shots, pause/resume          | `audioManager.js`                                                             |
| Sword asset path, scale, grip origin/trim, hand offset, pitch/yaw/roll      | `Sword Offsets` in the GUI                                                    |
| Sword default values, swing timing, hit range                               | `SWORD_TWEAKS` in `sword.js`                                                  |
| Sword offset slider/sanitizer travel limits                                 | `SWORD_OFFSET_LIMITS` in `sword.js`                                           |
| Sword-only save/load preset behavior                                        | `Sword Offsets` GUI actions in `main.js`, implementation in `sword.js`        |
| Arm stances and sword swing rotations                                       | `getControlledArmPoseTargets()` in `main.js`                                  |
| Combat balance formulas or Low Guard body/leg stance                        | `combatPhysics.js`                                                            |
| Physical d20 look, roll timing, face numbers, result-facing quaternion math | `oracleD20.js`                                                                |
| Oracle-roll HUD screen geometry, color, border, radius, fade timing         | `#oracle-roll-hud` in `styles.css`; timing in `combat_updated.js`             |
| Neutral anatomical facing correction                                        | `RIG_BASE_BODY_YAW` near the top of `main.js`                                 |
| Quaternion locomotion and terrain foot placement                            | `movementEngine.js`                                                           |
| Complete rig package shape or local rig-library behavior                    | `puppetShop.js`                                                               |
| Spawned NPC/enemy entity wrappers and entity update scaffold                | `entity.js`                                                                   |
| Entity controller interface and keyboard/static controller stubs            | `entityControllers.js`                                                        |
| Room size, ghost sphere count, outside geometry                             | `WORLD_TWEAKS` near the top of `world.js`                                     |
| Sky/fog/grass/outside-wall/world-light atmosphere colors                    | `WORLD_TWEAKS.atmosphere.palettes` and `applyWorldAtmosphere()` in `world.js` |
| Default body proportions                                                    | `DEFAULT_RIG_DIMENSIONS` in `rig.js`                                          |
| Trigger zones (enter/exit events)                                           | `encounters.js`                                                               |
| Enemy combat prototype                                                      | `combat_updated.js`                                                           |
| Jump feel (gravity, height, duration)                                       | `rigTuning` values in the GUI, or `getJumpGravityValue` in `physics.js`       |
| Walk cycle timing                                                           | `walkPhaseSpeed` in `SOLO_TWEAKS`, walk amplitude sliders in GUI              |
| Run cycle timing/feel                                                       | `runSpeed`, `runPhaseSpeed`, and run blend damping in `SOLO_TWEAKS`; run sliders in `Motion` |
| Turn anticipation/banking                                                   | `turnVelocityDamping`, `maxTurnVelocity`, and turn pose amplitudes in `SOLO_TWEAKS` |

---

### Current Room Block Dimensions

The stone room cluster is now a `2 x 2` block:

- central room center: `X0, Z0`
- negative-X room center: `X-24, Z0`
- negative-Z room center: `X0, Z-24`
- negative-X/negative-Z room center: `X-24, Z-24`

The current `roomSize` is `24` scene units and `wallThickness` is `0.1`.

Nominal room-block envelope, ignoring surface thickness:

```text
width X  = 48
length Z = 48
height Y = 24
```

Asset-fitting envelope, including the current wall/floor/ceiling thickness:

```text
width X  = 48.1
length Z = 48.1
height Y = 24.1
min X    = -36.05
max X    =  12.05
min Z    = -36.05
max Z    =  12.05
min Y    =  -0.05
max Y    =  24.05
```

Use the nominal `48 x 48 x 24` if the outside shell should hug the intended
room cube. Use `48.1 x 48.1 x 24.1` if the shell needs to cover the visible
mesh thickness too.

---

### Current Outside World Dimensions

The outside enclosure is centered on gameplay `X0/Z0`. In CAD floor terms, this
is the same fixture-zero idea as the church shell.

```text
outside X width  = 384
outside Z length = 384
outside Y height = 36

min X = -192
max X =  192
min Z = -192
max Z =  192
min Y =   -0.05
max Y =   36.05
```

The X/Z size is `400%` of the previous `96 x 96` outside enclosure. The positive
Y height is `150%` of the previous `24` scene-unit outside wall height. Interior
rooms and the active cathedral shell are not scaled by this; they stay at the proven door
alignment.

---

## Change Notes

- `0.2.14-alpha`: Added smoothed turn-velocity tracking from wrapped `controlState.yaw` deltas so keyboard and mouse-look turns can drive pose anticipation without raw input spikes. Player idle and quaternion locomotion now layer head/neck/chest yaw into the turn and add speed/run-blend-scaled body/pelvis banking while leaving foot replanting unchanged. Cache busters and docs were updated.
- `0.2.13-alpha`: Added `controlState.runBlendWeight` for a snappy athletic walk-to-run transition that only rises while forward Shift movement is active. `updateKeyboardMotion()` now blends movement speed and phase speed instead of instantly switching them, `movementEngine.js` blends walk/run bounce, yaw, arm swing, foot target, lift, and ankle/foot pitch before IK, and the visible down-arm pump blends from relaxed arms instead of switching on `isRunning`. Cache busters and docs were updated.
- `0.2.12-alpha`: Added conservative ankle/foot pitch polish in `movementEngine.js` from existing walk/run gait phase values. The offsets are layered onto each ankle/foot `bindLocalQuaternion` and relax back to neutral through the existing bind-pose damping path. Walk/run foot target behavior from `0.2.9-alpha` through `0.2.11-alpha` is preserved. No rig hierarchy, IK rewrite, camera, collision, terrain baseline, jump, combat, or controlled-arm ownership changes were made.
- `0.2.11-alpha`: Updated run IK target generation in `movementEngine.js` to consume existing `getRunStrideValues()` data for run foot Z, swing foot lift, and knee-drive target shaping. Walk `footZ` and walk swing foot lift behavior from `0.2.9-alpha` and `0.2.10-alpha` are preserved. No ankle pitch, rig hierarchy, camera, collision, terrain baseline, jump, or controlled-arm ownership changes were made.
- `0.2.10-alpha`: Added walk-only swing foot lift in `movementEngine.js` by layering existing `getLegStrideValues().footLift` output onto the IK target after terrain floor placement. The terrain baseline, Operation 10 walk `footZ` target behavior, run gait, ankle pitch, rig hierarchy, camera, collision, jump, and controlled-arm ownership were not changed.
- `0.2.9-alpha`: Updated walk foot Z target generation in `movementEngine.js` to consume existing `getLegStrideValues().footZ` gait curve data from `physics.js`, giving the walk cycle a walk-only stance/swing phase target instead of the previous raw cosine pendulum target. Run gait, foot lift, ankle pitch, rig hierarchy, terrain baseline, camera, collision, jump, and controlled-arm ownership were not changed.
- `0.2.8-alpha`: Redistributed the default spine landmarks so `torsoY` is `DEFAULT_RIG_HEIGHT * 0.6121` (`2.7300`) and `chestY` is `DEFAULT_RIG_HEIGHT * 0.7287` (`3.2500`) for a smoother spine/lean distribution target. Total rig height remains `4.46`. No movement, physics, IK, collision, or controlled-arm ownership logic changed.
- `0.2.7-alpha`: Corrected default arm proportions so `upperArmLength` is `DEFAULT_RIG_HEIGHT * 0.17` (`0.7582`) and `forearmLength` is `DEFAULT_RIG_HEIGHT * 0.148` (`0.6601`). The upper arm is now longer than the forearm while total rig height remains `4.46` and total arm reach is preserved. No movement, physics, IK, collision, or controlled-arm ownership logic changed.
- `0.2.6-alpha`: Bumped app/cache versions after the quaternion locomotion pass. `movementEngine.js` is now the active locomotion integration point for bind-pose-aware quaternion body/leg motion and terrain foot placement, while Empyrean's controlled-arm layer remains the owner of visible arm poses. The current run cycle is functional and now in tuning/refinement, including bounce symmetry, lean sign, stop relaxation, and footfall feel.
- `0.2.5-alpha`: Patched sign error that caused the backwards lean after walk/run cycles.
- `0.2.4-alpha`: Integrated the sandbox quaternion locomotion engine with minimal Empyrean adaptation
- `0.2.3-alpha`: Added walkable test terrain.
- `0.2.2-alpha`: Removed arm wave motion from Spacebar, reassigned to jump cycle.
- `0.2.1-alpha`: Removed the unused `treeLeafMaterial` and `treeTrunkMaterial` declarations left behind by the primitive Three.js tree implementation. Active tree placement remains unchanged: `buildLowPolyTrees()` still uses the same 16 hand-placed X/Z coordinates and collision circles while `createTreeProp()` fills those placeholders with alternating `tree.glb` and `deadTree.glb` clones. Landmark-scatter trees, GLB caching/normalization, G53 tree visibility, and all gameplay behavior are unchanged.
- `0.2.0-alpha`: Completed lunar-phase Pass 7 by removing the visible moon group's fixed world-space position. `updateSkyMoonCameraAnchor()` now captures the authored startup offset as one normalized world-sky direction plus one fixed camera distance, then recalculates the moon position after every camera update with `moonPosition = cameraPosition + direction * distance`. Player movement can no longer approach the moon or enlarge its apparent diameter. The existing billboard quaternion update still keeps the texture camera-facing. The original `[0, 30, 149]` position is retained separately as the immutable directional/point moonlight anchor, so camera-relative visual motion cannot change gameplay lighting. Lunar math, phase uniforms, sky-cycle timing, `G`, G53, title startup, fog, ghost behavior, diagnostics, HUD/UI, and controls were not changed.
- `0.1.126-alpha`: Completed lunar-phase Pass 6 validation without changing lunar math, phase rendering, sky timing, gameplay lighting, UI, diagnostics, or controls. The visible moon asset is now documented as the sky-owned, camera-facing `/assets/moon_2K.jpg` disc introduced by the preceding strict asset-replacement pass; `moon.glb` remains on disk but is not the visible surface. `verify.ps1` now requires the active moon texture, and the full syntax/lunar contract verification passes. Browser validation on 2026-06-20 resolved Waxing Crescent at 29% with northern fallback, loaded `moon_2K.jpg` without shader/WebGL failure, confirmed title completion starts the production sky clock at `0ms`, confirmed `G` reaches day and returns to night without recalculating lunar state, and confirmed G53 suppresses the world moon then resumes the sky cycle at the exact paused frame. Source inspection confirms the disc copies the active camera quaternion per render and the phase terminator remains view-space, preventing viewing-angle phase drift.
- `0.1.125-alpha`: Completed lunar-phase Pass 5 by connecting the pure lunar data contract directly to the live `skyMoon` renderer. Startup immediately calculates the real-world phase with northern orientation, then requests one low-accuracy browser geolocation after the title card; only the sign of latitude is read, only `northern`/`southern` is retained, and denied, unavailable, invalid, blocked, or insecure-context requests keep the northern fallback. Coordinates are never stored, logged, serialized, or displayed. Lunar state refreshes hourly and refreshes on tab resume when stale. Live browser testing resolved 2026-06-20 as Waxing Crescent at 28%, verified permission-denied fallback, verified a temporary southern success path, and confirmed repeated `G` day/night transitions do not change lunar state. Gameplay moonlight remains independent. The temporary success-path harness was removed.
- `0.1.124-alpha`: Completed lunar-phase Pass 4 as a restrained art-direction and flare-composition pass. Shadow opacity is now `0.935`, retaining 6.5% of the textured shell/inner-glow stack as faint earthshine, while terminator softness is narrowed to `0.014` for crisp crescent and quarter readability at the moon's game-scale apparent size. `applySkyMoonPhasePresentation()` now records analytical illumination and shapes the existing moon lensflare with `lerp(0.02, 1, illumination^0.65)`: new moon keeps only a trace, quarter reaches approximately `0.6445`, and full moon restores authored flare brightness. This lunar flare factor multiplies the existing night/day fade rather than replacing it. Directional moonlight, shell-helper PointLight, gameplay visibility, and all world-light intensities remain unchanged. A temporary real-asset gallery visually verified all eight phase silhouettes, small-size readability, and new/quarter/full flare progression, then was removed.
- `0.1.123-alpha`: Completed lunar-phase Pass 3 by adding a standalone native Three.js phase-shadow layer to the existing `skyMoon` group. `applySkyMoonPhasePresentation()` now normalizes a continuous phase and northern/southern orientation into shader uniforms; view-space sphere normals form correct crescent, quarter, gibbous, full, and new-moon terminators while keeping the screen-side convention stable as the camera moves. The transparent shadow sphere preserves the embedded `moon.glb` texture, self-lit shell, additive inner glow, asynchronous fallback, parent scaling, G53 visibility, and sky-cycle opacity fade; it is excluded from encounter tint actions so the shadow remains neutral. Runtime defaults to phase `0.5` (full moon), so real-world date/geolocation data is still not connected and gameplay moonlight remains unchanged. A temporary real-asset browser gallery verified all eight canonical phases and southern mirroring, then was removed.
- `0.1.122-alpha`: Completed lunar-phase Pass 2 by adding the pure `moonPhase.js` data module and deterministic `moonPhase.test.mjs` verification. The frozen moon-state contract now returns cloned reference/current dates, moon age, normalized continuous phase, approximate illumination, phase name, waxing state, normalized northern/southern hemisphere, and derived light-side orientation. Dates before the reference epoch wrap correctly; invalid dates fail explicitly; latitude classification retains only hemisphere and defaults invalid/zero inputs to northern. No browser geolocation request, rendering change, or gameplay-lighting change is active yet. `verify.ps1` now checks both new files and runs the lunar contract tests.
- `0.1.121-alpha`: Completed lunar-phase Pass 1 as an architecture and compatibility foundation with no gameplay or rendering behavior changes. Confirmed that the existing Three.js `skyMoon` group, textured `moon.glb`, frame-driven sky controller, and centralized world presentation are compatible with a native shader-based phase shadow. Locked real-world device time as the lunar clock, browser geolocation latitude as the hemisphere source, northern orientation as the permission/error fallback, no coordinate persistence, and unchanged gameplay moonlight. Documented that later passes must preserve sky-cycle fades, encounter tint/scale actions, the detailed self-lit shell, inner glow, and flare ownership while keeping lunar state names distinct from the existing sky-cycle `phase` state.
- `0.1.120-alpha`: Productionized sky-cycle timing and pause ownership. Full timings remain `120s` night/day holds with `1s + 5s + 1s` transitions. The first hold now starts only after the title card fully fades; hidden browser tabs and active G53 calibration pause cycle time explicitly, discard suspended wall time, and resume from the exact saved phase frame. Diagnostic snapshots now include phase elapsed/duration for suspension, G53, title-startup, and repeated-`G` verification.
- `0.1.119-alpha`: Completed sky-cycle atmosphere integration. Fog, hemisphere fill, sun/moon lights, lensflare brightness, moon shell/glow opacity, and every ghost sphere's wire/glow opacity now follow the same `dayBlend` instead of snapping. Authored moon/ghost opacities and lensflare colors are stored as immutable bases so repeated cycles restore full night presentation without cumulative dimming; groups hide only after their fade reaches effectively zero, while G53 suppression remains authoritative.
- `0.1.118-alpha`: Restored the stable-day gradient to the original `sky.md` / Pass 16 colors (`#A0E7FB`, `#85E0FA`, `#78DDFA`). This corrects the unrelated Pass 17 saturation change without altering the cycle controller, transition palette, lighting interpolation, or timing.
- `0.1.117-alpha`: Applied the restrained apocalyptic treatment to stable daylight only. The day gradient keeps its authored hue/lightness but uses 20% less HSL saturation (`#A9E2F2`, `#91D9EE`, `#85D6ED`), matching the existing desaturated day atmosphere. Dawn/dusk transition colors and all cycle timing remain unchanged.
- `0.1.116-alpha`: Added the world-owned day/night cycle controller. The app starts with a 120-second night hold, crosses through the authored transition gradient over `1s + 5s + 1s`, holds day for 120 seconds, and repeats. `G` now interrupts safely from the currently visible colors, targets the opposite stable state, and restarts the same transition sequence without overlapping timers. Gradient stops, fog, hemisphere fill, sun, moon lights, and the local accent light crossfade through one `dayBlend`; G53 pauses and restores the current transition frame.
- `0.1.115-alpha`: Fixed the reappearing perspective-sensitive sky section at its clipping source. The outside world had expanded to `384 x 384 x 75`, but the camera far plane remained at `160`, allowing the flat scene background to show whenever the physical gradient enclosure was clipped. Camera far distance is now an explicit `SOLO_TWEAKS.camera.farClip` value of `640`, enough to keep the complete unlit, opaque sky shell rendered from anywhere inside the current world.
- `0.1.114-alpha`: Corrected the sky-gradient coordinate system. The shader now derives horizon-to-zenith color from camera-relative viewing elevation instead of fixed enclosure-wall height, preventing the brighter gradient region from appearing painted onto a wall and contracting as the player approaches it in either day or night mode.
- `0.1.113-alpha`: Added the first sky-gradient pass in `world.js`: the outside wall/ceiling sky shell now renders authored horizon, midpoint, and zenith colors through a world-height shader. `G` still switches immediately between static night and day gradients; the staged transition palette is present for the later timed crossfade pass, while fog, lighting, moon/sun behavior, and gameplay remain unchanged.
- `0.1.112-alpha`: Made `rig.js` authoritative for the project default player's base proportions at startup. `player.default.rig.json` continues to supply calibration, bind, mesh, motion, and attachment data; explicitly loaded reusable rig packages still retain their own saved dimensions. Synchronized the canonical JSON dimension snapshot with the current `rig.js` values.
- `0.1.111-alpha`: Clarified rig ownership in the workshop UI by renaming the base dimension and per-mesh calibration folders, added a live saved `head marker size` control under Skeleton Lab, made the height gauge follow the calibrated head pivot, and removed the unused `makeJointMarker()` / `getRigStats()` helpers.
- `0.1.110-alpha`: Added procedural Three.js Lensflare presentation objects in `world.js`: a very subtle flare attached to the visible `skyMoon` group and a stronger day-mode flare attached to the sun directional light so both effects follow future sky movement from their existing source transforms.
- `0.1.109-alpha`: Reduced night fog washout by decoupling the fog from the visible sky color: night sky remains `#131862`, while distance haze now uses darker, thinner fog (`#080A20`, density `0.006`) so distant props keep more of their material color.
- `0.1.108-alpha`: Added `restoreSceneKeyboardFocus()` and routed World Debug GUI changes plus scene pointer entry through it so lil-gui checkbox focus does not strand movement keys after toggling debug overlays.
- `0.1.107-alpha`: Pass 7 for the Cathedral replacement staged workflow: kept the legacy four-room structure and collision data but set old procedural room walls, ceilings, and torch mounts to `visible = false` behind the active cathedral shell, reducing render clutter without deleting the old construction path.
- `0.1.106-alpha`: Pass 6 for the Cathedral replacement staged workflow: added rough cathedral proxy collision using five rectangle wall blockers with a south/front opening plus eight tree-style circular column blockers, all registered through the existing `worldCollision` rectangle/circle arrays and visible through the existing World Debug overlay.
- `0.1.105-alpha`: Pass 5 for the Cathedral replacement staged workflow: scaled `assets/Cathedral_lowPoly2.glb` up from the one-room test size to `scaleMultiplier: 0.00065`, giving an approximate `55.2 x 33.5 x 43.9` scene-unit shell while keeping texture wiring, colliders, and torches untouched.
- `0.1.104-alpha`: Pass 4 for the Cathedral replacement staged workflow: switched the active shell to `assets/Cathedral_lowPoly2.glb`, applied the separate `assets/texture_0.png` through generated box-projection UVs because the GLB has no authored texture coordinates, set the new starting scale to `scaleMultiplier: 0.00027205`, and kept colliders/torches untouched.
- `0.1.103-alpha`: Pass 3 for the Cathedral replacement staged workflow: reduced the active low-poly cathedral to 25% of the previous calibration size with `scaleMultiplier: 0.012125`, lowered the centered export to `position: [0, 7.33, 0]`, and kept colliders/torches untouched while visual scale is evaluated.
- `0.1.102-alpha`: Pass 2 for the Cathedral replacement staged workflow: switched the active shell to `assets/Cathedral_lowPoly.glb`, reduced the effective shell scale with `scaleMultiplier: 0.0485`, lifted the centered export to `position: [0, 29.33, 0]`, and kept old colliders/torches untouched for visual calibration.
- `0.1.101-alpha`: Pass 1 for the Cathedral replacement staged workflow: swapped the active world-owned church shell visual path from `assets/churchRough.glb` to `assets/Cathedral.glb`, preserved the existing fixture-zero scale/position behavior, kept old room/church colliders and torches untouched, and added a temporary cathedral bounds helper for calibration.
- `0.1.100-alpha`: Pass 0 for the Cathedral replacement staged workflow: moved combat trigger/enemy spawn zones and the data-driven example encounter zones out to the outer world so room/church/cathedral testing is not muddied by active encounters. No cathedral model, collider, torch, rigging, Puppet Shop, or combat behavior rewrite yet.
- `0.1.99-alpha`: Moved the core player rig source of truth out of browser-only storage: startup now loads `assets/rigs/player.default.rig.json`, Puppet Shop named saves still use the browser shelf but also download a real `.json` backup, and new Export Selected Rig / Export Rig Library / Import Rig Library buttons make rig packages portable.
- `0.1.98-alpha`: Added a guided Rigging Wizard workflow around the existing mesh/G53/Puppet Shop pipeline: F2 now opens the wizard, starts G53 alignment, offers GLB selection, auto-applies A/T/Current base poses, routes Rig through the current skinning engine, exposes quick motion/sword test buttons, and saves named rig packages while warning about session-only mesh paths.
- `0.1.97-alpha`: Reduced active day-mode color saturation by 20% for a harsher, dustier daylight look: sky/fog/outside shell now use `#CEEAFA`, day fill uses `#DBE5CB`, and sun color uses `#FBF6D6`.
- `0.1.96-alpha`: Unified the night sky/background/fog/renderer clear color around `#131862` so the night outside shell and the true scene background no longer split into black/purple bands at camera angles.
- `0.1.95-alpha`: Converted the outside wall/ceiling sky shell from lit `MeshStandardMaterial` to opaque, double-sided, fog-free `MeshBasicMaterial` so day/night shell color is uniform instead of splitting into several light-dependent blue wall colors; the outside floor is also double-sided and fog-free for the shallow-angle floor diagnostic.
- `0.1.94-alpha`: Reclassified the day-mode artifact as a fog/material blending problem instead of a light problem: day fog is now disabled, and the outside wall/ceiling sky shell is opaque and day/night-colored through `applyWorldSkyMode()` so the green floor no longer blends into the day sky at shallow camera angles.
- `0.1.93-alpha`: Added a day-mode lighting diagnostic pass: `G` day mode now disables the central green accent PointLight and replaces the dark night fog with pale low-density day fog, while leaving room torches untouched so the remaining player-facing light patch can be isolated.
- `0.1.92-alpha`: Added day-mode lighting to the `G` toggle: a warm `#FFF9D2` diagonal sun DirectionalLight plus brighter HemisphereLight fill now replace the moonlight when the sky switches to day, keeping ceilings and non-facing walls readable.
- `0.1.91-alpha`: Added the next day/night prototype step: `G` now switches the Three.js sky/renderer clear color between the night sky and bright day `#C9EBFF`, using a world-owned `applyWorldSkyColor()` helper while leaving fog, grass, walls, and light tuning untouched.
- `0.1.90-alpha`: Expanded the `G` day/night prototype toggle so it now hides/shows the floating ghost spheres with the visible moon and moon-owned lights, while still respecting G53 rigging visibility.
- `0.1.89-alpha`: Moved world atmosphere ownership into `world.js` with a named `night` palette and `applyWorldAtmosphere()`, centralizing scene background, fog, renderer clear color, outside wall/floor colors, and world light colors/intensities for future day/night/weather transitions.
- `0.1.88-alpha`: Added pass 1 of the day/night cycle control: `G` now toggles the visible `skyMoon` group plus its moon-owned directional and shell-helper lights on/off, while leaving torches, gameplay, rigging, and world geometry untouched.
- `0.1.87-alpha`: Changed the visible `moon.glb` detail shell from a scene-lit material to a texture-preserving `MeshBasicMaterial`, so the moon keeps its crater detail but no longer receives a hard directional-light terminator from the world moonlight.
- `0.1.86-alpha`: Restored the editor-lost moon shell opacity/glow settings and the scene-owned `sky-moon-shell-point-light` sync in `world.js`, then cache-busted the app so the restored moon lighting pass definitely loads.
- `0.1.85-alpha`: Moved the experimental moon PointLight out of module scope and into the world lighting rig as `sky-moon-shell-point-light`, deriving its position from the visible `skyMoon` world position with a small target-facing bias so the church-facing moon shell can be tuned without creating a drifting hidden moon coordinate.
- `0.1.84-alpha`: Reapplied the crash-lost moon shell `THREE.DoubleSide` material repair on disk, corrected the inner glow formula comment for the current `14.75` diameter, and cache-busted the app so the saved moon rendering pass definitely loads.
- `0.1.83-alpha`: Forced the transparent `moon.glb` detail shell to render `THREE.DoubleSide` so the inner self-lit glow reads through from the church-facing side as well as the opposite side, while keeping `skyMoon` as the moonlight positional authority.
- `0.1.82-alpha`: Reworked the moon glow to preserve `moon.glb` surface detail as a mostly opaque outer shell, with a separate 14.75-diameter self-lit inner glow sphere inside the same `skyMoon` group so the moon reads luminous without becoming a flat ping-pong ball.
- `0.1.81-alpha`: Made the visible `moon.glb` read as luminous by applying cloned emissive/self-lit moon materials after load, while keeping the visible `skyMoon` group as the single positional authority for directional moonlight source and target sync.
- `0.1.80-alpha`: Centralized moonlight direction in `syncMoonDirectionalLight()` so the visible `skyMoon` world position is the light source and `WORLD_TWEAKS.lighting.moonLightTarget` is the aim point, keeping future sky/day-night movement from drifting away from the actual moon asset.
- `0.1.79-alpha`: Rebalanced outside lighting toward a moonlit target by setting the hemisphere fill to `0.12`, the directional moon key to `0.18`, and tying that directional light's position to the visible `skyMoon` world position every frame so a future day/night moon path automatically moves the light source with it.
- `0.1.78-alpha`: Added a seeded outside landmark scatter that places extra live/dead trees plus small campfire, skull, and rock props in broad outside zones while avoiding the church, cave, existing trees, outside walls, and prior landmark colliders.
- `0.1.77-alpha`: Added `assets/cave.glb` as a world-owned rough cave prop at X20/Z-90 using the same Tinkercad `1000x` fixture-zero loading path as the church shell, plus three simple top-down proxy rectangle colliders that leave the cave mouth approachable.
- `0.1.76-alpha`: Expanded the outside enclosure to `384 x 384` scene units centered on gameplay X0/Z0, raised the outside ceiling/walls to `36` scene units, moved ghost-sphere wall/ceiling spawning to the new bounds, and kept the rooms/church shell fixed so the matched door alignment stays unchanged.
- `0.1.75-alpha`: Added `assets/churchRough.glb` as a world-owned visual church shell around the four-room block, preserving the authored fixture zero, applying the required Tinkercad `1000x` millimeter-to-scene-unit scale, tagging the shell for G53 world visibility, and leaving existing procedural room collision unchanged.
- `0.1.74-alpha`: Added the fourth northwest stone room at X-24/Z-24, connected it to the negative-X and negative-Z rooms with paired wall openings, kept the existing torch/stone/collider construction path, and documented the four-room block dimensions for outside asset fitting.
- `0.1.73-alpha`: Extracted weapon workholding into `sword.js`, moving sword defaults, offset limits, preset storage, GLB loading/disposal, grip-anchor normalization math, and rightPalm attachment behind a heavily commented sword controller while keeping main.js responsible for player input, arm pose, and combat swing decisions.
- `0.1.72-alpha`: Added backward-compatible 3D sword grip trim controls (`swordGripX/Y/Z`) so the wrapper origin can be placed across the handle thickness while the existing `grip point` still controls the sword's longest blade axis; full rig saves, sword presets, and Puppet Shop attachment snapshots now carry the new trim values.
- `0.1.71-alpha`: Added a sword-only preset library under `Sword Offsets`, with preset name, save/load/delete/list/copy JSON actions, stored separately from full rig tuning so current and future weapon workholding setups can be reused without loading an entire rig.
- `0.1.70-alpha`: Widened Sword Offsets travel for `plainSword.glb` fitting, shared those limits between GUI/sanitizer/normalization, and added a narrow legacy-default migration so old saved sword offsets no longer silently override the current built-in sword setup.
- `0.1.69-alpha`: Made enemy spawn fade-in visual-only: enemies now enter active combat immediately on spawn while opacity still ramps in, so movement, prompts, and sword hits are no longer blocked by the materialization timer.
- `0.1.68-alpha`: Decoupled cold-start combat from the oracle HUD: d20 result now rolls and applies enemy pressure immediately, combat enters active state immediately, and the HUD/d20 presentation starts 0.25 seconds later as a non-blocking 3.0 second omen.
- `0.1.67-alpha`: Added placeholder oracle-roll result messages from `placeholder.md` to the HUD, centered at X88.9 mm / Y-57.15 mm, styled in Caesar Dressing with #F5F5F5 at 37% opacity, and calibrated the longest placeholder to the requested 105 mm proportional width.
- `0.1.66-alpha`: Reduced the HUD-pinned oracle d20 radius from `0.5616` to `0.4493` so the corner-to-corner silhouette sits more comfortably inside the HUD.
- `0.1.65-alpha`: Moved the real 3D oracle d20 onto the HUD center at X88.9 mm / Y-57.15 mm, aimed the settled numbered face toward the camera, and reduced the die radius by 22%.
- `0.1.64-alpha`: Extended the oracle-roll HUD right edge from X101.6 mm to X152.4 mm while keeping the original X25.4 mm left edge anchored.
- `0.1.63-alpha`: Added a passive screen-space oracle-roll HUD at the requested machinist-coordinate position, with #69966C at 45% opacity, an outside #999B9B border, 3.175 mm proportional corner radius, and 0.3 second fade in/out during the visible d20 roll only.
- `0.1.62-alpha`: Synced runtime/cache/doc build numbers, added the entity layer to README architecture notes, documented the current player-vs-entity boundary and console spawn helpers, and added `entity.js` / `entityControllers.js` to verification.
- `0.1.61-alpha`: Ability to call up additional rigs in DevTools Console successful. Simultaneous RMB/LMB bug being forced by browser is patched with `mousedown` listener.
- `0.1.60-alpha`: patched bug where player animation was lost while loading in the Puppet Shop, `Ambeht` (Service) is now an independent entity from the Puppet Workshop. Name of main character has changed.
- `0.1.59-alpha`: Bind rigging updated in Puppet Shop.
- `0.1.58-alpha`: Cordoned off player from Puppet Workshop, created `Puppet Shop`, setting up for NPC and Enemy rigging.
- `0.1.57-alpha`: repositioned camera view to 3rd person, added in mouse controls for player panning right left/looking up and down. These are only active when RMB is pressed to not interfere with dev mode. LMB now swings sword. All existing controls were preserved/
- `0.1.56-alpha`: isolated enemy into a factory `enemy.js` Added second enemy encounter. Added logic for sound and d20 behavior upon additional encounters.
- `0.1.55-alpha`: creates music module `audioManager.js` and d20 module `oracleD20.js`. Replace existing track for encounters with `combatIntro.ogg` and `combatLoop.ogg`.
- `0.1.54-alpha`: Moved the moon/sky focal object into `world.js`, renamed the active runtime handle from the old `jupiter` name to `skyMoon`, moved current encounter data to `skyMoonColor`, and kept old `jupiterColor` / `jupiterScale` action names as compatibility aliases.
- `0.1.53-alpha`: Extracted audio ownership into `audioManager.js`; main now creates one audio manager, combat delegates ambient/combat music fades to it, world encounter audio actions call it instead of mutating an Audio element, and verification now checks the audio module.
- `0.1.52-alpha`: Extracted the physical d20/oracle mechanic into `oracleD20.js`; combat now delegates die config, mesh creation, face/value mapping, roll quaternions, roll value, settled state, and rolling updates to the oracle module while keeping enemy decisions, banners, and encounter phases in `combat_updated.js`.
- `0.1.51-alpha`: Split rig calibration from visible gameplay pose: G53 now commits joint/control point offsets and bind/reference rotations, then applies relaxed/down visible arms using `inverse(bindReference) * visibleTarget` so T/A reference arms can remain calibrated without becoming the gameplay rest pose.
- `0.1.50-alpha`: Applied the visible relaxed/down arm pose during startup settle and decoupled puppet animation from debug skeleton visibility so hiding the lab guides no longer bypasses `updateControlledArms()`.
- `0.1.49-alpha`: Hardened relaxed-arm restoration against polluted T/A backups by adding canonical relaxed arm bind data, rejecting backup tables whose shoulder rotations still look like T/A rigging references, and reconstructing relaxed arm bind rotations from hardcoded zeros when needed.
- `0.1.48-alpha`: Separated the T/A rigging reference pose from the visible relaxed gameplay pose: G53 exit and mesh-rig completion now detect lifted rigging shoulders, restore/default the arm bind rotations as needed, and snap the live arms to the normal down pose before gameplay resumes.
- `0.1.47-alpha`: Restored the post-rig gameplay-arm handoff by adding a single mesh-rig completion hook in `skin.js`; T/A start poses now return to relaxed arms after synchronous preview rigging, async quick rigging, and re-rigging.
- `0.1.46-alpha`: Rebuilt the combat d20 as a true rough-stone numbered 3D object: twenty face-mounted Caesar Dressing numbers, reused room stone textures, a slower mournful roll, and quaternion targeting so the generated d20 value dictates which physical face settles toward the player.
- `0.1.45-alpha`: Fixed lower-leg orientation reverting after rigging or startup by changing `dampJointRotation()` to layer animation deltas onto the full `bindLocalQuaternion` instead of only the visible bind Euler sliders, preserving the neutral-zero knee/body fixture rotations through walk, idle, rigging exit, and title-card reveal.
- `0.1.44-alpha`: Replaced the startup spinner with an EMPYREAN Caesar Dressing stone-engraved title card, added subtle animated text/background gradients, moved loader reveal to the end of startup, and added a startup pose settle pass so leg realignment happens behind the title card.
- `0.1.43-alpha`: Added the first Puppet Shop architecture boundary with new `puppetShop.js`, named complete rig packages, local rig-library save/load/delete/list controls, package copy/paste compatibility, and docs for separating reusable puppet rigs from gameplay.
- `0.1.42-alpha`: Added a first running cycle from `runCycle.md`: hold `Shift + W` to run with faster travel/turnover, run-specific stride/foot-lift/bounce/lean sliders, pelvis flight bounce, hip/shoulder counter-twist, and bent-elbow arm pumping while preserving the existing walk cycle.
- `0.1.41-alpha`: Replaced the outside primitive trees with alternating `tree.glb` and `deadTree.glb` props while keeping the existing circular tree colliders, and replaced the old planet sphere with `moon.glb` at about half the previous visual size and 15% lower on Y.
- `0.1.40-alpha`: Applied `stoneFloorDiff.jpg`/`stoneFloorDisp.png` to room floors, `stoneWallDiff.jpg`/`StoneWallDisp.png` to room walls and ceilings, shifted room surfaces to dull gray, raised room wall opacity to 80%, added two `torch.glb` props per inside wall, and made each torch a dim warm point-light source.
- `0.1.39-alpha`: Applied the same fixture-zero facing correction to `leftKnee` and `rightKnee`, giving each knee a neutral `-PI` base yaw so the shin/ankle/foot chains face correctly while their GUI Y bind-rotation sliders remain `0`; old near-PI knee Y fixes migrate back to zero.
- `0.1.38-alpha`: Baked the 180-degree body-facing correction into the body joint's base bind pose so anatomical right/left matches the feet while the GUI bind-pose body Y value reads `0`; old saved `body Y ~= +/-PI` facing fixes now migrate back to zero.
- `0.1.37-alpha`: Added `combatPhysics.js` with base-of-support, center-of-mass, stability-margin, and tipping-angle formulas, then wired sword draw to enter a named Low Guard stance that uses the new profile for body, leg, and arm pose setup.
- `0.1.36-alpha`: Fixed sword visibility by repairing the grip-point normalization path that aborted sword loading, retuning the default sword pitch away from the screen edge, lightly boosting dark sword materials, and simplifying sword fitting so repeated length/grip slider edits recalculate from the original GLB transform without drift.
- `0.1.35-alpha`: Added a saved `Sword Offsets` GUI section so sword asset path, length/scale, grip point, position, pitch, yaw, and roll can be tuned live instead of hard-coded.
- `0.1.34-alpha`: Fixed the T-pose restore workflow by capturing the relaxed arm bind rotations before applying A/T start poses, restoring that snapshot after rigging, and clearing active arm/sword commands so `restore gameplay arms` returns to true relaxed posture.
- `0.1.33-alpha`: Switched the combat prop to `assets/plainSword.glb`, added grip-point sword normalization, made `assets/Sigewynn.glb` the default temp mesh, added post-rig gameplay arm restoration after preview rigging, separated arm stance/swing math into `getControlledArmPoseTargets()`, and added a subtle full-body combat stance.
- `0.1.32-alpha`: Fixed cold-start F2/G53 entry by initializing walk-arm swing state at startup, guarding G53 pose freeze, and adding rollback recovery if G53 setup ever fails mid-entry.
- `0.1.31-alpha`: Added a capture-phase F2 hotkey safety net and scene-focus restore after local file picker imports so G53 mode still toggles after loading a new mesh.
- `0.1.30-alpha`: Added a full G53 pose freeze so arm trail, arm damping, leg relaxation, and jump pose overlays cannot move skeleton points while rigging pivots.
- `0.1.29-alpha`: Added G53 `hold child points`, which keeps descendants visually fixed while dragging a parent pivot by recalculating descendant local offsets from saved root-local positions.
- `0.1.28-alpha`: Updated generated skin weighting so left/right arm and leg regions choose the nearest bind-pose skeleton side instead of assuming negative X is always left. This keeps side assignment stable when a 180-degree Y bind rotation flips the visible skeleton sides.
- `0.1.27-alpha`: Added G53 X/Y/Z axis locks to mouse joint dragging so unchecked axes remain fixed at their drag-start local coordinate during precision pivot tuning.
- `0.1.26-alpha`: Added combat visual suppression to G53 mode so the encounter trigger cylinder, enemy hitbox, enemy health bar, and d20 are hidden during precision rigging and restored afterward.
- `0.1.25-alpha`: Added Pass 2 of G53 rigging mode: tagged world geometry for rigging visibility, hid walls/ceilings/trees/ghost spheres/the sky focal object during G53 mode, kept floors as faint reference planes, and restored original visibility/material state on exit.
- `0.1.24-alpha`: Added Pass 1 of G53-style machine-home rigging mode: `F2` toggle, state save/restore, home position/yaw, frozen idle/walk drift, locked player movement during rigging, enabled mouse joint editing, and GUI status/buttons.
- `0.1.23-alpha`: Added the TEMP `devProbe` coordinate marker with GUI sliders, mouse drag, Shift-key nudging, world/rig-local readouts, copy/log buttons, and a Skeleton Lab guide-opacity slider.
- `0.1.22-alpha`: Added right-hand sword loading from `assets/sword.glb`, keyboard/GUI combat stance and swing controls, enemy health bar, Easy/Medium/Hard hit counts, and the hide/re-find loop after each non-lethal hit.
- `0.1.21-alpha`: Moved the active combat module to `combat_updated.js` because VS Code was refusing to save `combat.js`; `main.js` and `verify.ps1` now import/check the new file.
- `0.1.20-alpha`: Tightened the combat prototype by parenting the enemy hitbox to the enemy group, auto-fitting `enemy.glb` to a target height and floor alignment, and making the d20 evasion tier actually move the enemy during the active phase.
- `0.1.19-alpha`: Added pelvis carrier walk motion with tunable hip sway, bob, tilt, and twist sliders so the hips shift weight over the planted foot instead of riding forward like a locked block.
- `0.1.18-alpha`: Fixed animated debug bone lines so femur/shin/foot guide segments refresh from live joint positions every frame instead of visually detaching from moving knee/ankle/foot markers.
- `0.1.17-alpha`: Reworked the leg stride curve so feet drift backward while planted, lift higher during swing, and return forward on a smooth eased path instead of looking boxed into tiny abrupt steps.
- `0.1.16-alpha`: Started the body-mechanics/rig module split by moving pure jump/walk formulas into `physics.js`, default rig proportions into `rig.js`, wiring `main.js` to call those modules, and adding the faint head-pivot height disk.
- `0.1.15-alpha`: Split world geometry, collision, ghost spheres, lighting, and encounter system out of `main.js` into `world.js`. Split the full mesh import pipeline out of `main.js` into `skin.js`. Fixed a startup crash caused by the skin module not being initialized before the first skeleton build. `main.js` went from roughly 4600 lines down to roughly 3700 lines.
- `0.1.14-alpha`: Fixed stale world-matrix bug that caused parent-child relationships to break during mouse joint drags at high cursor speeds. Added arm counter-swing to the walk cycle. Added heavy source comments to the drag system, joint creation, and bind-pose functions explaining the matrix hierarchy, the bug, and the fix.
- `0.1.13-alpha`: Added `physics.js` and `rig.js`, moved pure body-mechanics formulas and default rig proportions into those modules, and added a 5% opacity wireframe disk at the current default rig height.
- `0.1.12-alpha`: Added mouse joint point editing mode for dragging visible joint markers and writing the result back into the existing Joint Point Offset sliders.
- `0.1.11-alpha`: Added `START_HERE.md` and `verify.ps1` so solo sessions have a quick return path and one-command structural checks.
- `0.1.10-alpha`: Added `Rig Mesh Mode`, a focused GUI workflow that groups mesh render/pose/rig actions, adds start-pose choices for current, A-pose, T-pose, and reserved custom, and tucks away duplicate manual mesh/bind folders while active.
- `0.1.9-alpha`: Added World Debug collision/trigger overlays and a data-driven `encounters.js` module for non-blocking trigger zones that can run actions such as audio changes, console messages, and sky-object visual changes.
- `0.1.8-alpha`: Added the solo-builder kit: `SOLO_TWEAKS` in `main.js`, `SOLO_WORKFLOW.md`, `WORLD_COOKBOOK.md`, `NEXT_STEPS.md`, and `checkpoint.ps1`.
- `0.1.7-alpha`: Added a heavy source-comment pass explaining the world builder, primitive geometry, collision map, skeleton hierarchy, saved tuning, GLB import workflow, generated skin weights, GUI controls, animation loop, walk cycle, jump routine, and camera controls.
- `0.1.6-alpha`: Added a three-room layout, door openings between rooms, an outside enclosure, recycled floating ghost spheres, low-poly tree colliders, and obstacle-aware exploration collision.
- `0.1.5-alpha`: Split mesh loading into `render mesh`, pivot adjustment, and `rig rendered mesh`, added static mesh preview support, and added mouse-wheel camera zoom.
- `0.1.4-alpha`: Added `Bind Pose Rotations`, a female GLB A-pose preset, saved rest-pose rotations, and skin binding that respects the aligned rest pose.
- `0.1.3-alpha`: Added `Mesh Import / Export`, GLB loading through `GLTFLoader`, generated position-based skin weights, live skeleton-driven `SkinnedMesh` bones, and rig package export/import.
- `0.1.2-alpha`: Applied the texture set in `assets` to the room surfaces, added a visible rig footprint collider, enabled wall collision, and added a root-based jump with crouch, air, and landing pose weights.
- `0.1.1-alpha`: Restored the missing skeleton rebuild helper used by the dimension sliders. Without that helper, the GUI could stop after its first controls and prevent the room and rig from drawing.

## Run

Open this folder with VS Code Live Server and launch `index.html`.

## Keyboard

- `W` / `S`: move forward/back.
- `Shift` + `W`: run forward.
- `A` / `D`: turn.
- `Arrow Left` / `Arrow Right`: orbit camera.
- `Arrow Up` / `Arrow Down`: zoom camera.
- `Page Up` / `Page Down`: raise/lower camera.
- `Z`: toggle left arm up.
- `X`: toggle right arm up.
- `H`: toggle both hands half high.
- `G`: request the opposite day/night target. The current visible sky crossfades through the authored transition palette (`1s` blend, `5s` twilight hold, `1s` blend), while moonlight, sunlight, fog, and fill lights follow the same transition. Pressing `G` again safely reverses from the current colors.
- `J`: jump.
- `Space`: wave both arms.
- `1`: equip `assets/plainSword.glb` in the right hand and enter combat stance.
- `2`: despawn the sword and return arms to idle.
- `Enter`: swing the sword and attempt a combat hit.
- `F2`: open/close the Rigging Wizard, which wraps G53-style machine-home rigging mode.
- `Y`: toggle the TEMP `devProbe` coordinate marker.
- `Shift` + `J` / `L`: move `devProbe` local X left/right.
- `Shift` + `U` / `O`: move `devProbe` local Y up/down.
- `Shift` + `I` / `K`: move `devProbe` local Z forward/back.
- `R`: toggle skeleton lab.
- `L`: toggle joint labels.

## TEMP Dev Probe

`devProbe` is a temporary measuring marker, not gameplay. It lives in `main.js` and is clearly marked `TEMP / DEV MODE`.

Step-by-step use:

1. Press `Y`, or open `TEMP Dev Probe > visible`.
2. Move the marker with the GUI `local X/Y/Z` sliders, mouse-drag the yellow sphere, or use the Shift-key nudges.
3. Watch `world` and `rig local` in the `TEMP Dev Probe` GUI folder.
4. Click `log values` to print both coordinate spaces to the console.
5. Click `copy rig local` to copy a value like `{ x: 0.25, y: 1.1, z: -0.4 }`.

Why the rig-local number matters:

```js
const worldPoint = new THREE.Vector3();
devProbe.getWorldPosition(worldPoint);

const rigLocalPoint = worldPoint.clone();
skeletonRoot.worldToLocal(rigLocalPoint);
```

`getWorldPosition()` gives the absolute scene coordinate. `skeletonRoot.worldToLocal()` converts that same point into the player/root coordinate system. Because `devProbe` is parented to `skeletonRoot`, its `.position` is already rig-local; the explicit conversion is included so the formula is obvious and reusable.

Use `Skeleton Lab > guide opacity` when the rigged mesh needs to be visible without the skeleton guide dominating the view.

## Rigging Wizard

This is the preferred mesh-rigging workflow. It is a guided wrapper around the
same Mesh, G53, skinning, and Puppet Shop functions that already worked.

Step-by-step:

1. Press `F2`, or open `Rigging Wizard > F2 start wizard`.
2. The wizard opens G53 alignment mode automatically.
3. Choose a `.glb` file, or type an `assets/name.glb` path and click `1b preview assets path`.
4. Pick `Current`, `A Pose`, or `T Pose`; the selected base pose applies immediately.
5. Align pivots using mouse joint editing, axis locks, and Joint Point Offset sliders.
6. Click `4 rig`.
7. Test idle, walk, run, jump, draw sword, and swing from the wizard test folder.
8. Set a rig name in `Puppet Shop`.
9. Click `6 save named rig`.

Important save rule:

The browser file picker previews a temporary session blob. Reusable NPC/enemy
packages should save a path like `assets/enemyMage.glb`. The wizard sets that
shape by default when a file is chosen, but the actual file still needs to live
in the project `assets/` folder.

## G53 Rigging Mode

This is the machine-home rigging workflow. It is a temporary setup mode, not gameplay.

Step-by-step:

1. Load a mesh preview with `Mesh > 1 preview`.
2. Open `G53 Rigging Mode > enter / home`, or use the Rigging Wizard with `F2`.
3. The rig moves to home position `X0 Z0` and `yaw 0`.
4. Idle motion and walk preview turn off.
5. Player movement/turning is locked, but camera orbit/zoom/height still works.
6. Walls, ceilings, trees, ghost spheres, and the sky moon hide.
7. Floors remain as faint reference planes.
8. Combat trigger/hitbox/d20 visuals hide.
9. Mouse joint point editing turns on.
10. Use `G53 Rigging Mode > allow X`, `allow Y`, and `allow Z` to choose which axes can move during mouse dragging.
11. Leave `G53 Rigging Mode > hold child points` enabled when you want already-placed limb points to stay put while moving their parent.
12. Adjust pivots using the existing joint tools.
13. Click `Mesh > 2 rig mesh`; if a preview is loaded, it rigs the mesh and restores gameplay state.
14. Use `G53 Rigging Mode > exit / restore`, or close the Rigging Wizard, to exit without undoing your pivot edits.

Axis lock formula:

```text
finalAxis = allowAxis ? desiredAxis : dragStartAxis
```

where:

- `desiredAxis` is the coordinate produced by the mouse drag.
- `dragStartAxis` is the coordinate the joint had when the drag began.
- `allowAxis` is the matching checkbox in `G53 Rigging Mode`.

That means if only `allow X` is checked, the pointer can move freely on the screen, but the joint only stores X-axis movement. Y and Z are restored to their drag-start values before the offset is saved.

Hold-child-points formula:

```text
desiredWorld       = skeletonRoot.localToWorld(savedRootLocal)
desiredParentLocal = descendant.parent.worldToLocal(desiredWorld)
offset             = desiredParentLocal - baseBindLocalPosition
```

where:

- `savedRootLocal` is where the descendant point was when the drag began.
- `desiredParentLocal` is the new local coordinate needed to keep that point visually fixed after its parent moved.
- `offset` is the same Joint Point Offset value used by the sliders.

This does not remove the parent-child skeleton. It uses the hierarchy to calculate new local offsets that match the point layout you placed on screen.

While G53 is active, the animation pose solvers are skipped. The rig displays:

```text
liveJointTransform = bindPoseTransform
```

where `bindPoseTransform` means the saved pivot offsets plus bind-pose rotations. This prevents the arm controller's damping/trail motion from making the shoulders, elbows, wrists, and palms drift while you are placing points.

## Notes

The default player rig loads from the project file:

```text
assets/rigs/player.default.rig.json
```

That file is the important copy. Keep it backed up or under version control.

Scratch tuning can still be saved in browser `localStorage` under:

```text
empyrean.puppetWorkshop.rigTuning.v1
```

Sword-only presets save in browser `localStorage` under:

```text
empyrean.swordPreset.library.v1
```

Use `Puppet Shop > save named rig + file` to save the named rig into the
temporary browser library and download a real `.json` backup.

Use `Puppet Shop > export selected rig` to download one rig package by name.

Use `Puppet Shop > export rig library` and `Puppet Shop > import rig library`
to move the whole browser rig shelf in or out as a JSON file.

Use `Save > copy/log JSON` to copy a portable tuning snapshot into the console/clipboard.

Use `Mesh > 1 preview` to load `assets/Sigewynn.glb` as the current default static reference. After placing pivots, use `Mesh > 2 rig mesh` to generate skin weights and drive the GLB from the visible Empyrean puppet rig. `export rig package` copies/logs both the rig tuning and imported mesh binding settings.

If a GLB is facing backward, prefer `Mesh > Transform > rot Y` for the whole-model turn. That rotates the imported geometry before weights are generated. `Bind Pose Rotations` are best used for joint rest-pose alignment, such as lifting shoulders into an A-pose or T-pose.

Use `Mesh > start pose` plus `Mesh > apply start pose` before rigging when the source mesh is modeled in A-pose or T-pose. The bind-pose rotation sliders are in radians and are saved/exported with the rest of the rig tuning.

After a preview rig, `Mesh > 2 rig mesh` commits the adjusted rig calibration and then relaxes only the visible arms. Formula:

```text
rig calibration      = joint point offsets + bind/reference rotations
generated skin bind  = mesh modeling pose at skinnedMesh.bind(skeleton)
visible arm target   = "down", "lowGuard", "swing", etc.
visible arm delta    = inverse(bindReference) * visible arm target
live puppet arms     = rig calibration + visible arm delta
```

That keeps a T-posed mesh bindable without leaving the gameplay arms stuck in T-pose and without erasing the joint/control point work you just did. The manual `Mesh > relax visible arms` button runs the same visible-pose-only relax path if you need it after an experimental binding pass. It clears active arm commands and stows the sword so an old `up`, `half`, `combat`, or `swing` state does not immediately raise the arms again.

New mesh workflow:

1. `Mesh > 1 preview`
2. Adjust `Base Rig Proportions`, `Mesh Calibration Offsets`, and `Bind Pose Rotations` while the mesh is only a static reference.
3. `Mesh > 2 rig mesh`

Use the mouse wheel over the scene to zoom the camera in and out while placing pivots.

## Solo Builder Files

- `SOLO_WORKFLOW.md`: safe solo development loop, recovery notes, where systems live, and how to work in small reversible steps.
- `START_HERE.md`: shortest return-to-project map for the next session.
- `WORLD_COOKBOOK.md`: copy/paste recipes for boxes, props, trees, colliders, sky objects, sky-moon changes, and room additions.
- `ENCOUNTERS.md`: guide for placing trigger zones and attaching actions.
- `NEXT_STEPS.md`: low-guidance next tasks that are useful without needing a full paired coding session.
- `checkpoint.ps1`: PowerShell helper that copies the whole project to a timestamped Desktop checkpoint.
- `verify.ps1`: PowerShell helper that checks required files and parses the main JavaScript modules.

Run a checkpoint before experiments:

```powershell
.\checkpoint.ps1
```

Run a quick structural check after edits:

```powershell
.\verify.ps1
```

## World Debug And Encounters

Use `World Debug` in the GUI to show invisible helper geometry:

- wall colliders
- tree colliders
- outside bounds
- encounter trigger zones
- encounter labels

Encounter trigger definitions live in:

```text
encounters.js
```

Encounters are non-blocking. They do not stop movement. They can run actions when the avatar enters or exits a circle or rectangle, such as changing audio volume/playback rate, logging a message, or changing the sky moon's tint/scale.

The title-card overlay remains in `index.html` and is revealed/hidden by the loader logic in `main.js`.

## Rig Mesh Mode

The current preferred workflow is `F2` -> `Rigging Wizard`. This older section is
kept as a reference for the lower-level mesh-binding controls.

Use `Rig Mesh Mode > rig mesh mode` in the GUI when you want the interface to focus on mesh-binding tasks.

When active, the mode gathers the main rigging actions into one folder:

- choose start pose
- apply start pose
- render mesh
- rig rendered mesh
- quick load and rig
- rerig current
- clear mesh
- export/import rig package

Start pose options:

- `keep current pose`: leaves the skeleton in the pose it already has.
- `A pose`: applies the existing female GLB A-pose preset.
- `T pose`: applies a simple arms-out T-pose preset.
- `custom later`: visible placeholder, intentionally inactive for now.

Rig Mesh Mode hides the older `Mesh Import / Export` and `Bind Pose Rotations` folders while active. It does not delete or reset anything; it only changes the visible menu layout.

## The Mouse Drag Bug — What Went Wrong And Why

### The Symptom

When dragging joint markers in mouse point edit mode, dragging at high speed caused joints to jump, drift, or ignore their parent's position in the hierarchy. The faster the mouse moved, the worse it got. At slow cursor speeds it appeared to work, which made the bug hard to spot.

### Why Three.js Has Two Separate Transforms

Every object in Three.js has two matrices:

**Local matrix** — stores position/rotation/scale relative to the parent. This updates immediately when you set `object.position` or `object.quaternion`.

**World matrix** (`matrixWorld`) — stores the accumulated transform from the scene root all the way down to this object. This is what `worldToLocal()` and `getWorldPosition()` use to convert between coordinate spaces. **Three.js does NOT update this automatically** every time you change a local transform. It only updates world matrices in two moments:

1. When `renderer.render()` is called (which calls `scene.updateMatrixWorld()` at the start of every frame).
2. When you explicitly call `object.updateMatrixWorld(true)`.

### The Chain Of Events That Broke It

Inside `handleJointEditPointerMove`, every event called:

```
applyJointPointOffsets()   ← changes joint.position for all joints
resetSkeletonToBindPose()  ← also changes joint.position for all joints
syncSkeletonRoot()         ← moves the skeleton root
```

After those calls, every joint's **local** transform was correct. But their **world matrices were stale** — they still reflected positions from before this event fired.

Then, on the **next** `pointermove` event (which could arrive before the render loop runs), the code called:

```js
joint.parent.worldToLocal(dragCurrentParentLocal);
```

`worldToLocal()` inverts `joint.parent.matrixWorld`. Because that matrix was stale, the conversion gave the wrong parent-local coordinates. The joint's calculated offset was in the wrong coordinate space — as if the parent had not moved at all. That is exactly "parent-child relationships are not being followed."

At normal cursor speeds this was invisible because `renderer.render()` ran between events and refreshed all matrices. At high mouse speeds, multiple `pointermove` events fired within the same animation frame, so the second event arrived with a stale matrix.

### The Fix

One line added after `syncSkeletonRoot()` inside `handleJointEditPointerMove`:

```js
state.skeleton.root.updateMatrixWorld(true);
```

The `true` argument means "update this node AND all its children." This walks the entire skeleton tree and rebuilds every `matrixWorld` from the current local transforms, so the next `worldToLocal()` call gets accurate results regardless of how many events have fired since the last render.

### The Lesson

`worldToLocal()`, `getWorldPosition()`, and `localToWorld()` all depend on `matrixWorld` being current. In the render loop, this is automatic. In event handlers, if you modify joint positions and then immediately need a world-space conversion, call `root.updateMatrixWorld(true)` first.

---

## Body Dimensions

The default rig is `4.46` scene units tall. All proportions are ratios of that height:

| Landmark                 | Height (scene units) | Ratio of total height |
| ------------------------ | -------------------- | --------------------- |
| Head pivot               | 4.0586               | 91%                   |
| Neck pivot               | 3.7464               | 84%                   |
| Chest pivot              | 3.2112               | 72%                   |
| Torso (spine base) pivot | 2.6760               | 60%                   |
| Pelvis pivot             | 2.2300               | 50%                   |
| Shoulder width (half)    | 0.8474               | 19%                   |
| Hip width (half)         | 0.4014               | 9%                    |
| Upper arm length         | 0.8474               | 19%                   |
| Forearm length           | 0.7582               | 17%                   |
| Thigh length             | 1.0927               | 24.5%                 |
| Shin length              | 1.0927               | 24.5%                 |

**Derived floor positions (with no offsets, root at Y=0):**

| Joint           | World Y                    |
| --------------- | -------------------------- |
| Pelvis          | 2.2300                     |
| Hip joint (L/R) | 2.2300 (hip X-offset only) |
| Knee            | 1.1373 (pelvis − thigh)    |
| Ankle           | 0.0446 (knee − shin)       |
| Foot pivot      | −0.0354 (ankle − 0.08)     |

The foot pivot sits a small amount below the floor surface. This is intentional — the foot joint is a pivot at the ankle/heel region, not the sole of the foot. When a mesh is attached, the mesh geometry extends below the pivot to the actual ground contact.

The proportions are deliberately permissive. The GUI sliders allow every dimension to be stretched well beyond realistic human ranges to accommodate stylized meshes, long-limbed creatures, or non-human characters. The defaults give a roughly realistic adult humanoid body as a starting point.

---

## Walk Cycle

The walk cycle uses a sine-wave phase to drive all motion. The left leg is offset by `PI` radians from the right leg, so they are always in opposite phases (when one swings forward, the other plants).

**Per-frame quantities computed from the phase:**

| Variable           | Formula                                               | Effect                                           |
| ------------------ | ----------------------------------------------------- | ------------------------------------------------ |
| `leftSwing`        | `sin(phase)`                                          | Left leg timing value used by arm counter-swing  |
| `rightSwing`       | `sin(phase + PI)`                                     | Right leg timing value used by arm counter-swing |
| `pelvisSide`       | `-sin(phase)`                                         | Side-to-side weight transfer signal              |
| `pelvisStep`       | `abs(sin(phase * 2))`                                 | Twice-per-cycle footfall bob signal              |
| `pelvisSwayX`      | `pelvisSide * hipSway * walkAmplitude`                | Pelvis shifts over the planted foot              |
| `pelvisBobY`       | `pelvisStep * hipBob * walkAmplitude`                 | Pelvis rises slightly once per footfall          |
| `pelvisTiltZ`      | `pelvisSide * hipTilt * walkAmplitude`                | Pelvis leans around the forward axis             |
| `pelvisTwistY`     | `pelvisSide * hipTwist * walkAmplitude`               | Pelvis twists around the vertical axis           |
| `chestCounterSway` | `-pelvisTiltZ * 0.62 + sin(phase * 2 - 0.55) * 0.012` | Chest reacts opposite to hip tilt                |
| `headStabilizer`   | `pelvisTwistY * 0.45 + sin(phase * 2 - 1.1) * 0.01`   | Head counteracts the carrier motion              |

**Gait markers per leg** (from `getStepPhase` in `physics.js`):

| Phase range | Name   | Description                               |
| ----------- | ------ | ----------------------------------------- |
| 0.0 → 0.5   | Stance | Foot planted; toe-push ramps in late      |
| 0.5 → 1.0   | Swing  | Foot off ground; knee lifts via sin curve |

The visible leg now uses `getLegStrideValues()` in `physics.js` for the foot path. The normalized forward/back value is `footZ`, where `+0.5` means the foot is reaching forward, `0` means it is under the body, and `-0.5` means it is trailing behind.

**Stride travel formula:**

```text
footTravel = footZ * 0.34 * walkAmplitude
```

During stance, `footZ` eases from `+0.5` to `-0.5`, which makes the planted foot drift backward as the body moves over it. During swing, `footZ` eases from `-0.5` back to `+0.5`, while `footLift = sin(swingProgress * PI)` raises the knee, ankle, and foot. Toe push is carried briefly into early swing, and foot plant begins slightly before stance starts, so contact does not pop at the exact phase boundary. This keeps the step primitive and readable, but it removes the tiny boxed-in feeling from the older sine-only foot travel.

The visible hip carrier uses `getPelvisWalkValues()` in `physics.js`. That function is applied to `joints.pelvis`, not to `leftHip` or `rightHip`. The pelvis carries both hip sockets as one unit, which keeps the femurs attached while giving the body the missing side-to-side weight shift. The Motion folder exposes `hip sway`, `hip bob`, `hip tilt`, and `hip twist` sliders for tuning this by eye. `hip sway`, `hip tilt`, and `hip twist` allow negative values so the direction can be flipped without changing the whole walk phase.

**Arm counter-swing** (added in v0.1.14):

Arms swing in the opposite direction to the leg on the same side. When the left leg moves forward, the left arm moves backward. This is stored in `state.walkArmSwing.left` / `.right` by `updateWalkMotion()` and blended into the shoulder target inside `updateControlledArm()` only when the arm is in the default "down" pose. Raised arm poses (up, half, wave) are not affected.

**Running cycle** (added in v0.1.42):

Hold `Shift + W` to run. Normal `W` still uses the walking cycle.

The run pass uses the math from `runCycle.md` but keeps the live joint edits inside `main.js`:

| Variable         | Formula                                                      | Effect                                               |
| ---------------- | ------------------------------------------------------------ | ---------------------------------------------------- |
| `phase`          | `2 * PI * f_run * t`                                         | One full left/right running cycle                    |
| `footZ`          | `-cos(phase)`                                                | Normalized forward/back foot travel                  |
| `footTravel`     | `footZ * runStrideLength * 0.5 * runAmplitude`               | Visible stride span in scene units                   |
| `footLift`       | `max(0, sin(phase)) ^ 0.72 * runFootLift`                    | Higher recovery lift while the leg swings forward    |
| `flightSignal`   | soft window at `0.35..0.5` and `0.85..1.0`                   | Brief airborne lift twice per cycle                  |
| `bobY`           | `springSignal * runBounce * 0.38 + flightSignal * runBounce` | Vertical body bounce without sinking below the floor |
| `leanX`          | `-(v / vMax) * runForwardLean`                               | Forward lean from the ankles/torso direction         |
| `hipTwistY`      | `sin(phase) * runHipTwist`                                   | Hip yaw                                              |
| `shoulderTwistY` | `-sin(phase) * runShoulderTwist`                             | Opposite shoulder yaw for balance                    |
| `armPump`        | `-sin(legPhase) * runArmPump`                                | Same-side arm swings opposite the same-side leg      |

The older pure formulas still live in `physics.js` as `getRunStrideValues()` and `getPelvisRunValues()` for reference and GUI-era tuning context. The active player locomotion path now runs through `movementEngine.js` via `updateLocomotion()`, which layers quaternion body/leg motion onto `bindLocalQuaternion`, raycasts against walkable terrain for foot placement, consumes walk and run gait helper data for blended foot target generation, blends walk swing lift with run swing/knee-drive lift above that floor baseline before solving IK, blends small gait-phase ankle/foot pitch offsets onto the ankle/foot bind quaternions, and layers smoothed turn-pose offsets for head/neck/chest anticipation plus speed-scaled body/pelvis banking. The bent-elbow pumping shape still lives in `getControlledArmPoseTargets()` under the `pose === "down"` path, blended by `controlState.runBlendWeight`, because Empyrean's controlled-arm layer remains the owner of visible arm poses.

Run tuning is in the `Motion` GUI folder:

- `run amplitude`: overall run animation strength.
- `run stride`: front/back distance of the feet.
- `run foot lift`: how high the recovery foot rises.
- `run bounce`: vertical spring/flight amount.
- `run lean`: maximum forward lean.
- `run arm pump`: shoulder pump size.
- `run hip twist`: pelvis yaw during the run.
- `run shoulder twist`: counter-yaw of the chest/shoulders.

---

## Mouse Joint Point Editing

Use `Workshop Alignment > mouse point edit` to turn on direct point editing.

Workflow:

1. Make sure the skeleton lab is visible.
2. Turn on `mouse point edit`.
3. Click a visible joint marker.
4. Drag it.
5. The matching `Mesh Calibration Offsets` values update.

This is intentionally a simple camera-facing drag plane, not a full transform gizmo. The sliders remain the source of truth, so saved/exported rig tuning still works.

## How This Is Put Together

Empyrean is currently built as one browser app with a few clear layers.

The page shell is `index.html`. It loads Three.js and lil-gui through the import map, keeps your loading overlay in place, loads the Caesar Dressing title font, and starts `main.js` as a JavaScript module. The overlay is now an EMPYREAN stone-engraved title card. It is hidden by the loader helper at the end of startup after the skeleton has been built, the startup pose has been settled, and several animation frames have passed behind the title card.

Collision is separate from visible geometry. Wall and door blocking shapes are stored as top-down rectangles in `worldCollision.solidRects`. Trees are stored as circles in `worldCollision.solidCircles`. The avatar has a circular floor footprint. Movement tries the intended step, resolves it against rectangles/circles, then falls back to X-only and Z-only movement for simple wall sliding.

The skeleton is a hierarchy of `THREE.Group` objects. Each group is a pivot point. Parent joints carry child joints, so moving the pelvis carries the legs, moving the chest carries the neck/head/arms, and so on. Debug markers, labels, and bone lines are attached to those joints so they follow the skeleton automatically.

Rig tuning is saved in `rigTuning`. The important idea is that sliders, mouse point editing, save/load, and export/import all talk to the same data. `Base Rig Proportions` define the stock skeleton; mouse dragging a joint marker updates `Mesh Calibration Offsets` layered on that stock skeleton. It does not invent a second hidden rig system. For the project default player, the base proportion values in `rig.js` win during startup; `assets/rigs/player.default.rig.json` supplies the persistent calibration and presentation data. Explicitly loading another reusable rig package still uses that package's saved proportions.

Imported meshes use a generated skin. The GLB is loaded, centered, scaled, optionally rotated, and then given generated `skinIndex` and `skinWeight` attributes. Empyrean creates real `THREE.Bone` objects that mirror the visible puppet joints. Every frame, the generated bones copy the puppet joint transforms, which is how the imported mesh follows the workshop skeleton.

Rig Mesh Mode is a GUI organization layer. It does not replace the rigging functions. It groups the render, start-pose, rig, rerig, clear, export, and import actions into one focused folder and hides duplicate manual folders while active.

Puppet Shop is the reusable rig layer. It does not move the player, run combat, or solve collisions. It packages the current rig as an actor-ready setup: full `rigTuning`, joint point offsets, bind rotations, mesh transform, motion sliders, sword/dev attachment offsets, name, and notes. The default player package now lives in `assets/rigs/player.default.rig.json` and loads at startup before the skeleton is built. The `Puppet Shop` GUI folder can still save complete packages into browser localStorage by name for quick work, but named saves also download real `.json` backups, and the full browser rig library can be exported/imported as a file. This is the first step toward using the same rigging skeleton for player bodies, NPCs, enemies, and deliberately "almost human" variants.

World Debug is also visual only. It draws the invisible collision and encounter shapes so you can place things by sight. Turning it on does not change movement or collision.

Encounters live in `encounters.js`. They are non-blocking trigger zones, either circles or rectangles. When the avatar footprint enters or exits one, `world.js` runs the listed actions, such as changing audio, logging a message, or changing the sky moon's tint/scale.

The safest solo rhythm is:

1. Run `.\checkpoint.ps1`.
2. Make one small change.
3. Run `.\verify.ps1`.
4. Check it in Live Server.
5. Keep going only if that change behaved.

## Physics And Rig Modules

`physics.js` is the body-mechanics subroutine file. It currently owns pure formulas for jump gravity, jump launch velocity, jump state updates, jump pose weights, walk-cycle phase shaping, run-cycle stride/flight/lean shaping, `smoothstep`, `cycle01`, and `clamp01`.

`puppetShop.js` is the puppet-rig package subroutine file. It currently owns pure data helpers for complete rig packages, package summaries, package JSON parsing/serialization, and the named browser rig library. It does not import Three.js and it does not know about combat, camera, movement, or the live scene. `main.js` still applies packages to the actual skeleton because applying a rig changes live joints, GUI sliders, mesh preview state, and skinning.

`main.js` still owns the live Three.js animation functions because those functions directly touch joints, meshes, GUI state, imported skins, and camera state. This is intentional for the first module split. The safe next pass would be moving larger animation routines only after this pure math split proves stable.

`rig.js` owns the default body proportions and rig-dimension control rows. Current default program height is `4.46` scene units. The exported rig stats document the current default pivots:

- default rig height: `4.46`
- head pivot height: `4.0586`
- neck pivot height: `3.7464`
- chest pivot height: `3.2112`
- torso pivot height: `2.6760`
- pelvis pivot height: `2.2300`

A faint 5% opacity wireframe disk now appears at the default head-pivot height as a horizontal inspection gauge.

## V0.1.15 Alpha Dev Build

This build completes the first major module split of `main.js`.

The goal was to break `main.js` out of a single giant file (roughly 4600 lines) into separate focused files, the same way a machine shop eventually moves from one person doing everything to dedicated stations for each type of work. Each new file has one clear job and only talks to other files through clean hand-off points.

### What Was Split Out

**`world.js`** — The world-building and collision station.

Before this split, `main.js` contained all the code for building the rooms, trees, outside walls, ghost spheres, lighting, collision resolution, encounter checking, and the debug overlay. That code has been moved to `world.js`. `main.js` now just calls `world.js` functions and passes them what they need instead of doing all the work itself.

**`skin.js`** — The mesh import and skin-weight station.

Before this split, `main.js` also contained all the GLB mesh loading, preview, skin weight generation, bone sync, and mesh presentation code. That code has been moved to `skin.js`. `skin.js` receives the `state`, `rigTuning`, and `updateGuiDisplays` references it needs from `main.js` at startup and then handles all mesh work from there.

### The Problem That Came Up During The Split

When a function gets moved to a new file, the old copy in the original file has to be removed. During this split, the new imports were added to `main.js` before the old local copies were deleted. JavaScript modules (the kind used here) treat an import and a local function definition with the same name as a hard error — it refuses to run the file at all. This meant the program was temporarily broken with a black screen until the old copies were cleaned out.

The fix required:

1. Updating the call sites where the moved functions now need slightly different inputs (the new versions are "pure" — they don't grab variables on their own, they take what they need as arguments).
2. Deleting the old duplicate function definitions.
3. Adding the one missing startup call (`initSkin`) that the skin module needs before anything else runs.

### Result

`main.js` went from roughly 4600 lines to roughly 3700 lines. All three files pass a clean syntax check. The program runs as before.

---

## V0.1.14 Alpha Dev Build

This build fixes the mouse drag parent-child bug and adds arm counter-swing to the walk cycle.

### The Bug Fix

Mouse joint point editing broke parent-child relationships at high cursor speeds. The root cause was a stale world matrix.

Three.js stores two separate transforms on every object: a **local matrix** (updates immediately when you set `position` or `quaternion`) and a **world matrix** (`matrixWorld`, which is only updated during `renderer.render()` or an explicit `updateMatrixWorld()` call). The drag handler was changing joint positions via `applyJointPointOffsets()` and `resetSkeletonToBindPose()`, but never refreshing the world matrices before calling `joint.parent.worldToLocal()`. At high mouse speeds, multiple `pointermove` events fired before the next render, so the second event's `worldToLocal()` used the old matrix and calculated the wrong coordinate space for the joint offset.

The fix is one line added after `syncSkeletonRoot()` in `handleJointEditPointerMove()`:

```js
state.skeleton.root.updateMatrixWorld(true);
```

This propagates updated transforms through the entire skeleton so the next `worldToLocal()` gets accurate results.

### Walk Cycle Arm Swing

The walk cycle previously animated legs, hips, chest, and head — but not arms. Arms held their idle trail pose throughout, which looked stiff during active walking.

`updateWalkMotion()` now writes arm counter-swing values to `state.walkArmSwing`. `updateControlledArm()` blends this into the shoulder target when the arm is in "down" pose. When walking stops, `relaxLegs()` resets the swing values to zero and the damp system eases the arms back to the idle trail.

### Comment Pass

Heavy source comments were added to `handleJointEditPointerDown`, `handleJointEditPointerMove`, `createJoint`, `applyJointPointOffsets`, `resetSkeletonToBindPose`, and the arm swing section of `updateWalkMotion` / `updateControlledArm` explaining the matrix hierarchy, the bug, and why each piece works the way it does.

---

## V0.1.1 Alpha Dev Build

Bare Bones Puppet Workshop

This build introduces the first full Empyrean Puppet Workshop.

The workshop is a browser-based Three.js rig tuning environment for building and adjusting a procedural puppet skeleton before applying a visible avatar skin. It includes visible joint pivots, bone lines, labels, motion presets, idle movement, walk preview controls, root alignment, per-joint pivot offsets, and browser-based tuning save/load.

The goal of this build is not visual polish. The goal is motion control.

Before Empyrean can wear a skin, the skeleton must move with presence.

- Built a standalone Three.js puppet workshop.
- Added a visible skeleton made from pivot joints, debug markers, and bone lines.
- Added labels for named joints.
- Added live GUI controls for rig dimensions and workshop alignment.
- Added per-joint offset controls for pivot tuning.
- Added motion controls for idle movement, breathing, head drift, torso sway, arm trail, damping, walk amplitude, and phase offset.
- Added motion presets: calmAlien, uncannyGrace, nervousTic, and teacherMode.
- Added local browser save/load for tuning values.
- Added JSON export for preserving or sharing rig tuning.

## V0.1.2 Alpha Dev Build

Empyrean is now pointed toward a browser-based virtual tabletop and live campaign world. The rig lab remains the character/creature workshop component: tune a skeleton first, then attach procedural or imported avatar surfaces later.

- Room texture maps now load from `assets/diffuse.jpg`, `assets/normal.jpg`, `assets/ao.jpg`, and `assets/displacement.jpg`.
- The room keeps its colored wall/floor identity while multiplying those colors through the texture maps.
- The rig has a visible circular footprint collider.
- Movement clamps the rig inside the room bounds using the collider radius.
- `J` or `Motion > test jump` triggers the jump routine.
- Jump height, duration, gravity feel, crouch depth, and collider radius are live-tunable in the GUI.

## V0.1.3 Alpha Dev Build

This build starts the import/export pipeline for avatar bodies. The current `femaleMesh.glb` has no embedded bones or animations, so Empyrean generates its own skin binding from the mesh vertex positions.

- Added `three/addons/` import-map support for `GLTFLoader`.
- Added `Mesh Import / Export` controls.
- `load and rig mesh` loads `assets/femaleMesh.glb`.
- The imported geometry is centered, scaled to the skeleton height, and offset/rotated through GUI controls.
- Empyrean generates `skinIndex` and `skinWeight` attributes for the mesh.
- Generated Three.js bones mirror the visible puppet joints every frame.
- Mesh opacity, wireframe, auto-fit, scale, offset, and rotation are tunable.
- `export rig package` and `import rig package` preserve the rig tuning plus imported mesh settings.

## V0.1.4 Alpha Dev Build

This build adds a proper rest-pose alignment layer. The imported mesh can now be matched more closely before Empyrean generates skin weights.

- Added `Bind Pose Rotations`.
- Added rotation sliders for each puppet joint.
- Added `female GLB A-pose` preset for the current `femaleMesh.glb`.
- Added `reset rotations` and `apply and rerig`.
- Motion now treats bind rotations as the neutral pose, so walk, idle, arm, and jump animation layer on top of the aligned rest pose.
- Generated skin binding now computes bind positions through the rotated hierarchy instead of using only unrotated joint offsets.

## V0.1.5 Alpha Dev Build

This build changes GLB setup into a deliberate staging process: render first, align pivots, then rig.

- Added static imported mesh preview state.
- Added `1 render mesh` to show the GLB without generating skin weights.
- Added `2 rig rendered mesh` to bind the currently rendered GLB after pivot placement.
- Kept `quick load and rig` for fast tests.
- Mesh transform sliders now update the preview while previewing, and rerig only after a mesh has already been rigged.
- Bind-pose rotation sliders no longer force a rig during preview placement.
- Added mouse-wheel camera zoom for close pivot placement.

## V0.1.6 Alpha Dev Build

This build gives the rig somewhere to explore.

- Added the original room plus two adjacent rooms in the negative X and negative Z directions.
- Added door openings between the rooms.
- Added an outside doorway from the central room.
- Added a larger outside enclosure with blue walls/ceiling `#131862` and green floor `#7BB369`.
- Recycled the ghostly glowing wireframe sphere effect from the avatar build.
- Added low-poly trees made from cone leaves `#457543` and cylinder trunks `#cc9029`.
- Added tree colliders and wall-aware movement so the rig can explore without walking through the room walls or trees.

## V0.1.7 Alpha Dev Build

This build is a code-reading build.

No intended behavior changed. The main focus was turning `main.js` into a heavily commented teaching file so the geometry, rig, imported skin, movement, and animation systems are easier to understand later.

- Added a top-level source map explaining the three major systems in `main.js`.
- Added comments for Three.js coordinate assumptions.
- Documented room, door, outside enclosure, tree, and ghost sphere construction.
- Documented the separation between visible meshes and top-down collision shapes.
- Added formulas for ghost sphere drift, root/collider conversion, rectangle and circle collision resolution, smoothing, jump gravity, jump velocity, walk phase, and camera placement.
- Documented the puppet joint hierarchy and the difference between puppet joints and generated Three.js bones.
- Documented the GLB render, adjust, rig workflow and generated skin-weight process.
- Documented the GUI folders and keyboard controls in the source.

## V0.1.8 Alpha Dev Build

This build is the solo-builder kit.

It is meant to make Empyrean easier to work on in small sessions without needing to remember where every system lives.

- Added `SOLO_TWEAKS` near the top of `main.js`.
- Wired common world, player, camera, ghost sphere, tree, sky focal object, and audio values through `SOLO_TWEAKS`.
- Added `SOLO_WORKFLOW.md`.
- Added `WORLD_COOKBOOK.md`.
- Added `NEXT_STEPS.md`.
- Added `checkpoint.ps1`.
- Updated the background audio startup so browser autoplay blocking is handled as normal behavior instead of an alarming console failure.

## V0.1.9 Alpha Dev Build

This build adds collision vision and a first encounter system.

- Added `World Debug` GUI controls.
- Added visual overlays for wall colliders.
- Added visual overlays for tree circle colliders.
- Added visual overlays for outside movement bounds.
- Added visual overlays and labels for encounter trigger zones.
- Added `encounters.js` as the editable encounter-definition module.
- Added circle and rectangle encounter support.
- Added encounter `onEnter` and `onExit` action hooks.
- Added action support for console logs, background audio changes, sky-object color changes, and sky-object scale changes.
- Added `ENCOUNTERS.md`.
- Kept the loading overlay in place.

## V0.1.10 Alpha Dev Build

This build adds a focused mesh-rigging menu mode.

- Added `Rig Mesh Mode` GUI folder.
- Added `rig mesh mode` toggle.
- Added start-pose selector with current, A-pose, T-pose, and reserved custom options.
- Added `apply start pose`.
- Grouped render mesh, rig rendered mesh, quick rig, rerig, clear, export, and import actions into the mode folder.
- Added a simple T-pose preset.
- Kept current pose as the default so existing work is not disturbed.
- Hid the older mesh import and bind-pose rotation folders while Rig Mesh Mode is active.

## V0.1.11 Alpha Dev Build

This build adds quick return-to-work helpers.

- Added `START_HERE.md`.
- Added `verify.ps1`.
- Documented the verify script in README.
- Bumped the cache-busted script URL to `0.1.11-alpha`.

## V0.1.12 Alpha Dev Build

This build adds a first mouse-edit pass for joint points.

- Added `mouse point edit` toggle under `Workshop Alignment`.
- Added selected joint dropdown for mouse editing.
- Clickable debug joint markers now select that joint point.
- Dragging a selected marker updates the same `Joint Point Offsets` used by the sliders.
- Selected joint markers highlight in a warm color.
- The implementation uses a camera-facing drag plane so it stays lightweight and understandable.

## V0.1.13 Alpha Dev Build

This build starts splitting large systems into small module files.

- Added `physics.js`.
- Added `rig.js`.
- Moved pure physics/body-mechanics formulas into `physics.js`.
- Moved default rig height, default dimensions, and rig dimension slider rows into `rig.js`.
- Kept live Three.js animation orchestration in `main.js` for stability.
- Added a 5% opacity wireframe height disk at the default head-pivot height.

## V0.1.16 Alpha Dev Build

This build updates the live project to use the first physics/rig module split.

- Bumped the app version and browser cache-buster to `0.1.16-alpha`.
- Kept `main.js` as the animation-loop owner, but routed reusable jump/walk math through `physics.js`.
- Routed the default body measurements and dimension slider rows through `rig.js`.
- Added the faint wireframe height disk at the head-pivot height, not the full raw measurement height.
- Updated `verify.ps1` so the new modules are part of the quick structural check.

## V0.1.17 Alpha Dev Build

This build makes the leg walk cycle feel less boxed-in.

- Added `getLegStrideValues()` to `physics.js`.
- Changed the visible leg foot path from a tiny sine slot to a stance/swing stride curve.
- During stance, the foot eases from forward to behind the body.
- During swing, the foot lifts and eases from behind back to forward.
- Smoothed toe push and foot plant across phase boundaries to reduce visible popping.
- Increased knee, ankle, and foot lift just enough to make the step read on the skeleton.
- Left arm counter-swing unchanged, since that part already felt good.

## V0.1.18 Alpha Dev Build

This build fixes the animated debug bone-line attachment.

- The femur, shin, and foot guide lines are `THREE.Line` objects with copied vertex positions.
- The joint markers are children of the live joints, so they followed the walk cycle automatically.
- The lines did not automatically follow animated child joint position offsets.
- `state.debugView.refreshBones()` now runs after the animation layers each frame.
- The bone-line endpoint formula remains simple: parent end is `(0, 0, 0)`, child end is `child.position`.

## V0.1.19 Alpha Dev Build

This build adds real pelvis carrier motion to the walk cycle.

- Added `getPelvisWalkValues()` to `physics.js`.
- Added Motion sliders for `hip sway`, `hip bob`, `hip tilt`, and `hip twist`.
- Applied the sway/bob/tilt/twist to `joints.pelvis`, not the separate hip sockets.
- The pelvis now shifts over the planted foot instead of riding forward as a locked block.
- Walk body/pelvis/head position offsets now ease back to bind when walking stops.

## V0.1.20 Alpha Dev Build

This build tightens the first enemy combat mechanic.

- Added the active combat module to the verification script.
- Parent the enemy hitbox to `combat.enemyGroup` so the visible cylinder follows the GLB during evasion.
- Auto-fit `enemy.glb` by bounding-box height, center it on X/Z, and place the lowest vertex on the floor.
- The d20 evasion result now changes actual behavior: best evasion moves fastest and has a smaller capture radius; worst evasion moves slowly and has a larger capture radius.
- The enemy stays leashed to its spawn anchor so it dodges without wandering out of the encounter area.

## V0.1.21 Alpha Dev Build

This build moves the active combat module away from the `combat.js` file that VS Code was refusing to save.

- Created `combat_updated.js`.
- Pointed `main.js` at `combat_updated.js`.
- Pointed `verify.ps1` at `combat_updated.js`.
- Kept the original `combat.js` file untouched so it can be removed manually after VS Code settles down.
- Kept the `0.1.20-alpha` combat fixes active in the new module.

## V0.1.22 Alpha Dev Build

This build adds the first sword-combat loop.

- Added `assets/sword.glb` loading through `GLTFLoader` in `main.js`.
- Added `SWORD_TWEAKS` near the top of `main.js` for scale, hand offset, hand rotation, swing duration, range, and attack arc.
- The sword is parented to the `rightPalm` joint, so it follows the existing skeleton and survives skeleton rebuilds by detaching before disposal and reattaching afterward.
- Added keyboard controls: `1` equips the sword/combat stance, `2` stows it, and `Enter` swings.
- Added a `Combat` GUI folder with difficulty and sword test buttons.
- Added `setCombatDifficulty()` and `attemptCombatSwordHit()` to `combat_updated.js`.
- Added enemy HP rules: Easy = 3 hits, Medium = 4 hits, Hard = 5 hits.
- Added an in-world enemy health bar that follows `enemy.glb`.
- After a non-lethal sword hit, the enemy hides, relocates, and reappears so the player has to find it before landing the next hit.
- Added `assets/sword.glb` to `verify.ps1`.

## V0.1.23 Alpha Dev Build

This build adds a temporary coordinate measuring tool and a softer skeleton-view option.

- Added `DEV_PROBE_TWEAKS` near the top of `main.js`.
- Added a small yellow sphere named `devProbe`, parented to the skeleton root.
- Added `TEMP Dev Probe` GUI controls for visibility, local X/Y/Z, keyboard step, world readout, rig-local readout, console logging, and copying rig-local coordinates.
- Added `Y` to toggle the probe.
- Added Shift-key probe nudges: `Shift+J/L` for local X, `Shift+U/O` for local Y, and `Shift+I/K` for local Z.
- Added mouse dragging for the probe using the same raycast-plus-camera-plane method as joint editing, but writing only to probe tuning values.
- Documented the Three.js conversion formula: `rigLocalPoint = skeletonRoot.worldToLocal(worldPoint.clone())`.
- Added `Skeleton Lab > guide opacity` so the debug skeleton can be faded while the rigged mesh remains visible and animated.

## V0.1.24 Alpha Dev Build

This build adds Pass 1 of G53-style machine-home rigging mode.

- Added `G53_RIGGING_HOME` near the top of `main.js`.
- Added runtime `state.g53RiggingMode` for active/off status and temporary saved gameplay state.
- Added `F2` as the enter/exit toggle.
- Entering G53 mode saves current player/camera/motion/visibility state.
- Entering G53 mode homes the rig to `X0 Z0`, `yaw 0`.
- Entering G53 mode turns off idle motion and walk preview, resets jump offset, shows the skeleton tools, and enables mouse joint point editing.
- While G53 mode is active, player movement and yaw are locked at home, but camera orbit/zoom/height still work.
- Exiting G53 mode restores the saved gameplay/view state without undoing any pivot edits.
- Added a `G53 Rigging Mode` GUI folder with status plus enter/exit/toggle buttons.
- Wrapped `Mesh > 2 rig mesh` so it restores gameplay state after rigging when G53 mode is active and a preview is loaded.
- Left X/Y/Z axis locks for later passes.

## V0.1.25 Alpha Dev Build

This build adds Pass 2 of G53-style machine-home rigging mode.

- Tagged room floors, room walls, room ceilings, outside enclosure parts, and low-poly trees in `world.js` with `userData.g53VisibilityRole`.
- Added a G53 visibility fixture in `main.js`.
- Entering G53 mode now makes walls and ceilings opacity `0`.
- Entering G53 mode hides trees, ghost spheres, and the sky focal object.
- Floors remain visible at low opacity as setup reference planes.
- Exiting G53 mode restores original object visibility, material opacity, transparency, and depth-write settings.
- The restore logic records shared materials only once so room floors/walls return to their true original opacity.

## V0.1.26 Alpha Dev Build

This build cleans up a G53 mode measuring obstruction.

- Added `setCombatRiggingVisibilitySuppressed()` to `combat_updated.js`.
- G53 mode now hides the combat trigger cylinder, enemy group, enemy hitbox, enemy health bar, and d20 while active.
- Exiting G53 mode restores the combat visuals to their previous visible state.
- `updateCombatEncounter()` pauses combat visual state changes while G53 suppression is active, so the trigger does not pop back on during rigging.

## V0.1.27 Alpha Dev Build

This build adds the precision candy: G53 axis locks for mouse joint dragging.

- Added saved rig tuning flags `g53AllowX`, `g53AllowY`, and `g53AllowZ`.
- Added `allow X`, `allow Y`, and `allow Z` checkboxes to the `G53 Rigging Mode` GUI folder.
- Added `applyG53AxisLocksToDesiredLocal()` in `main.js`.
- Axis locks only run while G53 mode is active.
- Unchecked axes are held at the joint's drag-start local coordinate before joint offsets are calculated.
- Normal non-G53 mouse joint editing is unchanged.

## V0.1.28 Alpha Dev Build

This build tightens generated skin side selection for rotated bind poses.

- Added `chooseNearestBindSide()` to `skin.js`.
- Arm vertices now choose left/right by comparing their X coordinate to the current bind-pose `leftShoulder` and `rightShoulder` positions.
- Leg vertices now choose left/right by comparing their X coordinate to the current bind-pose `leftHip` and `rightHip` positions.
- This fixes the case where a 180-degree Y bind rotation moves left-named joints to positive X and right-named joints to negative X.
- The recommended workflow is still to fix a backwards-facing GLB with `Mesh > Transform > rot Y`, then use `Bind Pose Rotations` for pose alignment.

## V0.1.29 Alpha Dev Build

This build makes G53 limb fitting less rigid.

- Added saved rig tuning flag `g53PreserveChildPoints`.
- Added `hold child points` to the `G53 Rigging Mode` GUI folder.
- Added drag-start capture of descendant root-local coordinates.
- Added compensation that recalculates descendant local offsets after a parent pivot moves.
- This lets you move a shoulder, hip, elbow, or knee without visually dragging already-placed child points away from the mesh.
- The behavior only runs in G53 mode and can be toggled off when you want normal parent-child dragging.

## V0.1.30 Alpha Dev Build

This build freezes animation pose solvers during G53 rigging mode.

- Added `freezeG53RiggingPose()` to `main.js`.
- G53 mode now skips idle breathing, walk pose, leg relaxation, arm control poses, and jump pose overlays.
- The fix targets the arm drift/settling seen during point dragging.
- The visible skeleton now holds the current bind pose while G53 is active, so moving a foot should not cause shoulder/elbow/hand markers to ease toward arm animation targets.

## V0.1.31 Alpha Dev Build

This build makes the F2 G53 hotkey survive local mesh loading.

- Added `sceneContainer.tabIndex = -1` so the scene can receive programmatic focus without entering normal tab order.
- After choosing a mesh through `Mesh > open file...`, the app now calls `window.focus()` and `sceneContainer.focus()`.
- Added `handleG53HotkeyCapture()` as a capture-phase F2 listener.
- The capture listener only handles F2, prevents browser/default function-key behavior, and stops the normal bubbling handler from toggling G53 twice.
- Regular movement, combat, devProbe, and workshop keys still use the existing keydown path.

## V0.1.32 Alpha Dev Build

This build fixes cold-start G53 entry.

- Initialized `state.walkArmSwing` during startup instead of only after movement/reset paths.
- Added `ensureWalkArmSwingState()` and `resetWalkArmSwingState()`.
- Updated G53 pose freeze, walk motion, and leg relaxation to use the same defensive walk-arm-swing helpers.
- Added `restoreG53RiggingSnapshot()` so normal exit and failed-entry recovery restore the same saved fields.
- Wrapped G53 entry in a recovery block: if setup fails, active mode is cleared, visibility is restored, saved gameplay state is restored, and status becomes `OFF - ENTER FAILED`.
- This fixes the crash where pressing `F2` before any movement froze the app because `state.walkArmSwing` did not exist yet.

## V0.1.33 Alpha Dev Build

This build starts tightening the player combat workflow.

- Switched the right-hand sword asset to `assets/plainSword.glb`.
- Added `gripFromLowerEnd` to `SWORD_TWEAKS` so sword normalization puts the wrapper origin near the hilt instead of the center of the model.
- Changed the default imported temp mesh to `assets/Sigewynn.glb`.
- Added `restoreRuntimeArmBindRotations()` and a `Mesh > restore gameplay arms` button.
- `Mesh > 2 rig mesh` now restores arm bind rotations after preview rigging, so T/A-pose mesh binding does not leave gameplay arms stuck outward.
- Split arm stance and swing math into `getControlledArmPoseTargets()` so future stances and attacks can be added in one place.
- Added a subtle full-body combat stance when the sword is equipped and the player is grounded/not walking.

## V0.1.34 Alpha Dev Build

This build fixes the T-pose-to-relaxed-arm workflow.

- Added a temporary relaxed-arm bind-rotation snapshot before applying the A-pose or T-pose rigging start pose.
- Updated `restoreRuntimeArmBindRotations()` so it restores that captured relaxed arm rest instead of blindly assuming zero rotations.
- Added a zero-rotation fallback for older sessions that have no captured snapshot.
- Cleared active arm commands, wave state, sword-equipped state, and swing timers during arm restore so gameplay does not immediately re-raise the arms after the bind restore.
- Kept the restore scoped to arms only; body, head, leg, pivot, and mesh transform tuning stay untouched.

## V0.1.35 Alpha Dev Build

This build makes sword fitting a first-class workshop task.

- Added a top-level `Sword Offsets` GUI folder.
- Moved live sword setup into saved `rigTuning` values: asset path, length/scale, grip point, X/Y/Z position, pitch, yaw, and roll.
- Added `reload sword` so a new GLB path can be loaded without editing code.
- Added `reset sword offsets` to return the sword setup to the built-in `plainSword.glb` defaults.
- Updated sword normalization so repeated length/grip tuning resets from the imported GLB transform first, preventing cumulative scale/offset drift.
- Kept `SWORD_TWEAKS` as the default/reference zone for swing duration, hit range, and fallback prop settings.

## V0.1.36 Alpha Dev Build

This build fixes the invisible sword regression.

- Fixed a runtime error in `normalizeSwordModel()` where a removed `fittedCenter` variable was still referenced.
- Simplified sword grip placement so it computes from the original local GLB bounds, applies the requested length scale, and moves the chosen grip point to the hand wrapper origin.
- Preserved the no-drift behavior for repeated `Sword Offsets` length/grip edits by resetting from the saved import transform before each normalization pass.
- Retuned the built-in `plainSword.glb` pitch from `+PI / 2` to `-PI / 2` so the default blade does not aim into the right-side GUI/screen edge.
- Added a tiny material visibility lift for imported swords so very dark blade materials remain readable in Empyrean's dark rooms.

## V0.1.37 Alpha Dev Build

This build moves the first sword-stance physics into a reusable module.

- Added `combatPhysics.js` as a pure math station for combat formulas.
- Documented base of support, combined center of mass, stability margin, and critical tipping angle directly in the module comments.
- Added a named Low Guard stance profile with body, pelvis, chest, head, leg, and sword center-of-mass parameters.
- Updated sword draw so pressing `1` equips the sword and enters Low Guard instead of the older generic combat arm pose.
- Added a `lowGuard` arm pose and made post-swing recovery return to the current ready sword pose.
- Added a live `state.combatBalance` estimate so future stagger, guard-break, or overextended-swing behavior has a clean math hook.

## V0.1.38 Alpha Dev Build

This build moves the left/right facing fix into the rig's neutral zero.

- Added `RIG_BASE_BODY_YAW = -Math.PI` as the body joint's base bind rotation.
- Kept the GUI `body` bind-rotation Y slider at `0` for the corrected facing, so the fix behaves like fixture zero instead of a visible setup offset.
- Left the root/player coordinate system alone so collision, G53 home, devProbe coordinates, and room navigation stay stable.
- Added a saved-tuning migration: old `body Y` values very close to `+PI` or `-PI` are treated as the old manual facing fix and reset to zero.
- Kept the sword attached to `rightPalm`; the correction changes which way the puppet anatomy faces instead of swapping sword code.

## V0.1.39 Alpha Dev Build

This build applies the same neutral-zero idea to the lower legs.

- Added `RIG_BASE_KNEE_YAW = -Math.PI` for both knee joints.
- Applied that yaw to `leftKnee` and `rightKnee` base bind quaternions so the ankle/foot chains flip without moving hip points.
- Kept the visible `leftKnee` and `rightKnee` Y bind-rotation sliders at `0` for the corrected leg direction.
- Extended the saved-tuning migration so old `leftKnee Y` or `rightKnee Y` values near `+PI` or `-PI` are treated as old manual facing fixes and reset to zero.
- Left the root, hips, collision, camera, and sword attachment unchanged.

## V0.1.40 Alpha Dev Build

This build gives the rooms their first dedicated Empyrean stone pass.

- Swapped room floors to `assets/stoneFloorDiff.jpg` plus `assets/stoneFloorDisp.png`.
- Swapped room walls and ceilings to `assets/stoneWallDiff.jpg` plus `assets/StoneWallDisp.png`.
- Retinted room stone to dull gray and raised room wall opacity to `0.8`.
- Added two `assets/torch.glb` mounts to each inside wall of each room.
- Added a dim warm point light and small glow marker to every torch mount.
- Reduced the global room lighting so the torches carry more of the interior mood.
- Kept the outside enclosure materials untouched.

## V0.1.41 Alpha Dev Build

This build makes the outside and sky match the darker room mood.

- Replaced the visible primitive outside trees with alternating `assets/tree.glb` and `assets/deadTree.glb` props.
- Kept the existing circular tree colliders so movement behavior does not change.
- Normalized both tree GLBs to predictable world heights before cloning them into the old tree positions.
- Replaced the old procedural planet sphere with `assets/moon.glb`.
- Set the moon to about half the old planet visual diameter and 15% lower on the Y axis.
- At that point the sky object still used the older internal planet handle; `0.1.54-alpha` later moved the moon fully into `world.js` with the active `skyMoon` handle.

## V0.1.42 Alpha Dev Build

This build adds the first usable running cycle from `runCycle.md`.

- Added `Shift + W` running while leaving normal `W` walking unchanged.
- Added `runSpeed` and `runPhaseSpeed` to `SOLO_TWEAKS.player`.
- Added pure run formulas in `physics.js`: `getRunStrideValues()` and `getPelvisRunValues()`.
- Added `updateRunMotion()` and `updateLegRun()` in `main.js`.
- Added run-specific Motion sliders for amplitude, stride, foot lift, bounce, lean, arm pump, hip twist, and shoulder twist.
- Added a bent-elbow running arm pump branch in `getControlledArmPoseTargets()`.
- Kept the old walk cycle and walk sliders intact so the two gaits can be tuned separately.

## V0.1.43 Alpha Dev Build

This build starts separating the Puppet Shop from gameplay.

- Added `puppetShop.js` as a pure package/library module with no Three.js imports.
- Added a `Puppet Shop` GUI folder for rig name, notes, status, save, load, delete, list, copy, and paste.
- Changed rig package export/import to use complete puppet rig packages from `puppetShop.js`.
- Added named local rig-library storage so a tuned skeleton can be reused later for player, NPC, or enemy bodies.
- Package payloads now include the full `rigTuning` source of truth plus readable skeleton, motion profile, attachment, and imported-mesh snapshots.
- Kept gameplay ownership in `main.js` for now: movement, camera, world collision, combat, and live skeleton application still stay there.

## V0.1.44 Alpha Dev Build

This build gives startup a proper Empyrean title card.

- Replaced the old loading spinner and `INITIALIZING RIG...` text with a centered `EMPYREAN` title.
- Loaded the Caesar Dressing font from Google Fonts with a serif fallback.
- Added the `.stone-engraved` CSS style: dark stone text, lighter stone surface, and engraved highlight/cut shadows.
- Added a slow shifting gradient inside the title letters so the title card reads as alive instead of frozen.
- Added a subtle stone-gray background gradient and low-contrast CSS grain.
- Moved the loader reveal call from early module startup to the end of setup.
- Added `settleStartupPoseBehindTitleCard()` so bind-pose leg corrections and guide-line refresh happen before the title fades.
- Increased the title-card reveal delay by frame count and minimum visible time so startup alignment happens behind the card.

## V0.1.45 Alpha Dev Build

This build fixes the lower-leg orientation regression after rigging.

- Changed `dampJointRotation()` from Euler-axis lerping to quaternion slerping.
- Animation deltas now layer onto `bindLocalQuaternion`, not just `bindLocalEuler`.
- Preserved the hidden neutral-zero corrections for `body`, `leftKnee`, and `rightKnee`.
- Fixed the lower legs/feet reverting toward the old first orientation after exiting G53 or after the title card fades.
- Kept the GUI bind-rotation sliders readable: knee/body Y can still show `0` while the base fixture correction remains active.

## V0.1.46 Alpha Dev Build

This build makes the combat d20 feel like an enemy-worthy artifact.

- Replaced the flat rolling number label with a true twenty-face d20 object.
- Added one Caesar Dressing number texture to every physical face.
- Reused the room stone diffuse/displacement textures for a dark, ancient, rough-hewn material.
- Subdivided and gently rounded the d20 faces so the vertices read worn instead of razor sharp.
- Moved the d20 to a prominent position in front of the player during the roll, independent of enemy placement.
- Slowed the roll into a heavier, mournful settle.
- Solved the final die orientation with quaternions so the random result controls which numbered face points toward the player.

## V0.1.47 Alpha Dev Build

This build fixes the post-rig arm restore regression.

- Added a mesh-rig completion callback from `skin.js` back into `main.js`.
- Moved the relaxed-arm restore to the actual moment a mesh finishes binding.
- Covered synchronous preview rigging, async quick rigging, and re-rigging with the same cleanup path.
- Kept custom manual arm bind rotations safe by restoring automatically only when an A/T start-pose snapshot exists.
- Let the guided G53 `2 rig mesh` workflow exit after the bind completion instead of guessing whether the loader was sync or async.

## V0.1.48 Alpha Dev Build

This build separates the rigging reference pose from the visible player pose.

- Kept T/A pose as a valid rigging/reference pose for imported meshes.
- Added `armBindPoseLooksLikeRiggingReference()` so lifted T/A shoulders are recognized as a rigging pose, not a normal gameplay rest.
- Added `applyRelaxedIdlePose()` to snap the visible player arms to the normal relaxed down pose after rigging.
- Updated mesh-rig completion so G53 exits first, then relaxed gameplay arms are restored.
- Updated G53 exit so canceling out of a T/A rigging pose does not leave the player visibly stuck in that pose.
- Left low guard, sword draw, walk, and run pose math in the existing arm pose library.

## V0.1.49 Alpha Dev Build

This build audits and hardens the relaxed-arm data layer.

- Confirmed the visible `"down"` gameplay pose is hardcoded in `getControlledArmPoseTargets()`.
- Confirmed the mutable arm bind table lives in `rigTuning.bindRotationOffsets`.
- Added `makeRelaxedArmBindRotationOffsets()` as the canonical relaxed arm bind data source.
- Added `armRotationTableLooksLikeRiggingReference()` to detect polluted T/A shoulder data inside a saved backup table.
- Updated `captureRuntimeArmBindRotations()` so it refuses to save T/A shoulder rotations as the relaxed backup.
- Updated `restoreRuntimeArmBindRotations()` so a polluted backup is ignored and relaxed arm bind rotations are reconstructed from canonical zeros.

## V0.1.50 Alpha Dev Build

This build fixes the visible startup arm pose layer.

- Updated `settleStartupPoseBehindTitleCard()` so startup applies `applyRelaxedIdlePose()` after the bind/root settle pass.
- Changed the startup formula from `bindPose + root` to `bindPose + relaxedArmDelta + root`.
- Confirmed the visible relaxed arm pose comes from `getControlledArmPoseTargets(..., "down", ...)`.
- Removed the animation bypass caused by `labEnabled` / `skeletonVisible`; those settings now hide debug guides without stopping the player pose solver.
- Kept the debug bone refresh conditional so hidden lab guides stay cheap.

## V0.1.51 Alpha Dev Build

This build separates rig calibration from visible gameplay pose ownership.

- Added `commitRigCalibration()` as the G53 exit checkpoint for current joint/control point offsets and bind/reference rotations.
- Added `applyRelaxedVisiblePose()` as the visible-pose-only arm relax path.
- Updated G53 exit so it commits calibration first, leaves tuned rig points intact, then applies relaxed/down arm rotations.
- Updated mesh-rig completion so T/A bind-reference rotations are preserved instead of being automatically zeroed as a fake "rest pose."
- Added `getVisibleArmPoseDelta()` so visible arm poses compensate for T/A reference arms using `returnedDelta = inverse(bindReference) * visibleTarget`.
- Changed the Mesh workflow button from `restore gameplay arms` to `relax visible arms` so it no longer implies a calibration reset.
- Updated rig package loading to apply a relaxed visible arm pose after the saved calibration is loaded.
