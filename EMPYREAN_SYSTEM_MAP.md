# EMPYREAN SYSTEM MAP

5/27/2026 0500 note:
oricleD20 module and audioManager module created
Generated: 2026-05-27  
Scope: analysis-only audit. No behavior changes, no refactors, no code fixes.

This document maps the current Empyrean prototype as it exists now: a browser-based Three.js game/workshop hybrid with an active puppet rig, imported mesh skinning, dev rigging tools, a dark exploratory world, sword stance work, combat encounter logic, a d20/oracle presentation, and several older experimental systems still present.

The important architectural conclusion:

Empyrean is no longer "the puppet project." The puppet workshop is now a tool inside a larger game project. The code mostly knows this, but `main.js` still acts as the central workbench for nearly everything. The biggest cleanup goal is to preserve the good mechanics while separating:

- gameplay runtime
- puppet workshop/dev mode
- rig calibration data
- visible animation/pose data
- combat/oracle systems
- world/environment/audio systems

Map first. Surgery later.

---

## 1. Codebase Overview

### Runtime Files

| File                | Category                    | What It Does                                                                                                                                                                             | Owns                                                                                                                                               | Depends On                                                                                                                                               | Used By                                                          | Status                                                   |
| ------------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | -------------------------------------------------------- |
| `index.html`        | UI/bootstrap                | Browser entry point. Loads CSS, import map, loader/title card DOM, Three.js app container, and `main.js`.                                                                                | DOM roots: `#emp-loader`, `#scene-container`, old `#puppet-lab-container`.                                                                         | CDN import map for Three.js and lil-gui.                                                                                                                 | Browser.                                                         | KEEP, with old DOM cleanup candidates.                   |
| `styles.css`        | UI/title card               | Styles body, loader/title card, scene canvas, and lil-gui controls.                                                                                                                      | Visual shell and loader/title presentation.                                                                                                        | DOM ids/classes from `index.html`.                                                                                                                       | Browser.                                                         | KEEP.                                                    |
| `main.js`           | Core/gameplay/workshop      | Main application module. Bootstraps scene, renderer, camera, title, audio, player rig, GUI, G53, input, movement, animation, sword, combat wiring, imported mesh hooks, and update loop. | Almost all runtime state: `rigTuning`, `state`, `controlState`, skeleton creation, GUI, player movement, visible pose application, sword, startup. | Three.js, lil-gui, GLTFLoader, `world.js`, `skin.js`, `physics.js`, `rig.js`, `puppetShop.js`, `combat_updated.js`, `combatPhysics.js`, `encounters.js`. | Browser via `index.html`; every gameplay frame flows through it. | KEEP, but overgrown and fragile.                         |
| `world.js`          | World/environment/collision | Builds rooms, outside area, stone materials, torches, GLB trees, ghost spheres, lighting, collision, encounter triggers, debug overlays, dispose utilities, label sprites.               | `worldCollision`, world materials, world object creation, world debug view, encounter trigger processing.                                          | Three.js, GLTFLoader.                                                                                                                                    | `main.js`, `skin.js` for `disposeObjectTree`.                    | KEEP. Good module boundary.                              |
| `skin.js`           | Asset loading/puppet skin   | Loads GLB meshes, shows static previews, generates bones/weights, rigs imported meshes to puppet skeleton, syncs generated bones every frame, applies mesh opacity/wireframe.            | Imported mesh preview/skin pipeline.                                                                                                               | Three.js, GLTFLoader, `disposeObjectTree` from `world.js`. Gets app context by `initSkin()`.                                                             | `main.js`.                                                       | KEEP. Important but heuristic/fragile for production.    |
| `physics.js`        | Body mechanics/math         | Pure formulas for jump state, jump pose weights, stride phase, pelvis walk/run values, interpolation helpers.                                                                            | Pure math only. No Three.js objects.                                                                                                               | None.                                                                                                                                                    | `main.js`.                                                       | KEEP. Good extraction.                                   |
| `combatPhysics.js`  | Combat stance/math          | Pure math/data for low guard stance, combined center of mass, support box, stability margin, tipping angle.                                                                              | Combat stance profile and balance formulas.                                                                                                        | None.                                                                                                                                                    | `main.js`.                                                       | KEEP. Good extraction.                                   |
| `combat_updated.js` | Combat/d20/oracle           | Combat encounter state machine, trigger cylinder, enemy GLB, enemy hitbox, health bar, d20 geometry/numbers/roll, battle audio crossfade, enemy hiding/evasion.                          | Private `combat` module state.                                                                                                                     | Three.js, GLTFLoader.                                                                                                                                    | `main.js`.                                                       | KEEP, but should eventually be split and renamed.        |
| `encounters.js`     | Encounter data              | Data-driven non-blocking trigger definitions for world events.                                                                                                                           | `ENCOUNTER_DEFINITIONS`.                                                                                                                           | None.                                                                                                                                                    | `main.js` passes it to `world.js`.                               | KEEP. Uses current sky-moon action names.                |
| `rig.js`            | Rig defaults                | Default body proportions and GUI slider ranges.                                                                                                                                          | `DEFAULT_RIG_DIMENSIONS`, `DEFAULT_RIG_HEIGHT`, `RIG_DIMENSION_CONTROLS`, `getRigStats()`.                                                         | None.                                                                                                                                                    | `main.js`, `puppetShop.js` indirectly through package data.      | KEEP.                                                    |
| `puppetShop.js`     | Puppet workshop/storage     | Pure data module for creating, serializing, validating, saving, loading, listing, and deleting complete rig packages in localStorage.                                                    | Puppet package schema and local rig library.                                                                                                       | Browser `localStorage` passed by caller. No Three.js.                                                                                                    | `main.js`.                                                       | KEEP as dev/workshop support. Schema needs future split. |

### Documentation And Scripts

| File                | Category                | What It Does                                                                                  | Status                                                           |
| ------------------- | ----------------------- | --------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| `README.md`         | Project changelog/guide | Long-running build notes, version history, usage notes. Also preserves older terminology.     | KEEP. Update carefully; also contains old asset references.      |
| `START_HERE.md`     | Onboarding              | Entry notes for using the project.                                                            | KEEP.                                                            |
| `SOLO_WORKFLOW.md`  | User workflow           | Practical solo work guide.                                                                    | KEEP.                                                            |
| `NEXT_STEPS.md`     | Planning                | Current/older task list.                                                                      | KEEP, but review after this map.                                 |
| `ENCOUNTERS.md`     | Encounter cookbook      | Explains data-driven encounter zones and actions, including sky-moon actions.                 | KEEP.                                                           |
| `WORLD_COOKBOOK.md` | World editing guide     | Recipes for world objects, colliders, sky objects, room edits.                                | KEEP.                                                           |
| `JUMP.md`           | Research/reference      | Jump math notes.                                                                              | ARCHIVE/REFERENCE. Runtime now uses `physics.js`.                |
| `runCycle.md`       | Research/reference      | Run-cycle math notes.                                                                         | ARCHIVE/REFERENCE. Runtime now uses `physics.js` plus `main.js`. |
| `verify.ps1`        | Verification script     | Checks expected files/assets and likely does source sanity checks.                            | KEEP, but asset list includes old optional assets.               |
| `checkpoint.ps1`    | Utility                 | Project checkpoint/copy helper.                                                               | KEEP.                                                            |

### Assets

| Asset Group           | Files                                                                                    | Current Use                                                                                                                           | Status                                                 |
| --------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| Active character mesh | `assets/Sigewynn.glb`                                                                    | Default imported mesh via `skin.js:27`.                                                                                               | KEEP.                                                  |
| Combat enemy          | `assets/enemy.glb`                                                                       | Loaded by `combat_updated.js:97`.                                                                                                     | KEEP.                                                  |
| Active sword          | `assets/plainSword.glb`                                                                  | Expected current sword asset through `rigTuning.swordAssetPath`.                                                                      | KEEP.                                                  |
| Older sword           | `assets/sword.glb`                                                                       | Old default in docs/verify. Not current if `plainSword.glb` is set.                                                                   | ARCHIVE or DO NOT TOUCH YET.                           |
| World stone           | `stoneFloorDiff.jpg`, `stoneFloorDisp.png`, `stoneWallDiff.jpg`, `stoneWallDisp.png`     | Used by `world.js:55-58` and d20 config in `combat_updated.js:191-192`.                                                               | KEEP.                                                  |
| Older texture set     | `diffuse.jpg`, `normal.jpg`, `ao.jpg`, `displacement.jpg`, `opacity.jpg`, `specular.jpg` | Not referenced by runtime search except docs/verify for some.                                                                         | ARCHIVE/REMOVE CANDIDATE after verify update.          |
| Environment GLBs      | `tree.glb`, `deadTree.glb`, `torch.glb`, `moon.glb`                                      | Used by `world.js` and `main.js`.                                                                                                     | KEEP.                                                  |
| Audio                 | `ambient.ogg`, `battle.mp3`, possibly `background.mp3`                                   | Battle is active in combat. Ambient/background depends on current `main.js` audio setup. `background.mp3` appears old in docs/verify. | KEEP active audio, ARCHIVE old audio after confirming. |
| Old/default mesh      | `femaleMesh.glb`, `T.glb`                                                                | Older rigging test assets. Runtime default is now Sigewynn.                                                                           | ARCHIVE/REFERENCE.                                     |
| Old sky image         | `Jupiter.jpg`                                                                            | Replaced by `moon.glb`; only docs/verify references found.                                                                            | ARCHIVE/REMOVE CANDIDATE after verify update.          |

---

## 2. What Is Where And Why

### Bootstrap, DOM, And Title Card

- Lives in `index.html`, `styles.css`, and `main.js`.
- `index.html:13` loads `styles.css` with version query.
- `index.html:32-41` defines the loader and scene container.
- `main.js:322` `revealWorkshop()`, `main.js:342` `waitForTitleCardSettleFrames()`, and `main.js:353` `initWorkshopLoader()` control loader/title timing.
- `main.js:8111` `settleStartupPoseBehindTitleCard()` applies startup settle work behind the title card.

State:

- DOM: `#emp-loader`, `#emp-title`, `#scene-container`.
- App constants: `APP_VERSION` at `main.js:87`.

Update loop:

- Title settles at startup, not every frame.

Should not own:

- Rig calibration.
- Combat state.
- World geometry.

Risk note:

- Title-card timing masks rig startup adjustments. This is useful, but if rig startup work grows, it should become an explicit "startup pipeline" rather than scattered calls.

### Scene, Camera, Renderer

- Scene starts at `main.js:655`.
- Camera starts at `main.js:659`.
- Renderer starts at `main.js:808`.
- Camera motion updates in `updateCamera()` at `main.js:7256`.
- Keyboard camera orbit/zoom/height are handled in `updateKeyboardMotion()` at `main.js:4681`.
- Mouse wheel zoom enters through `handleWheelZoom()` at `main.js:7969`.

State:

- `scene`
- `camera`
- `renderer`
- `controlState.cameraYaw`
- `controlState.cameraDistance`
- `controlState.cameraHeight`

Update loop:

- `animate()` calls `updateCamera(delta)` every frame at `main.js:4676`.

Should not own:

- Rigging pose data.
- Combat/d20 placement rules beyond following player/camera needs.

Risk note:

- Camera controls remain active in G53 rigging mode, which is correct. Movement/yaw are frozen while camera controls stay live.

### Lighting

- World lighting lives in `world.js`.
- `buildLighting(scene)` is exported around `world.js:1000`.
- `main.js` calls `buildLighting(scene)` during startup.
- Torches are both visible props and point lights. Torch tuning lives in `WORLD_TWEAKS.torches` at `world.js:60-71`.

State:

- Static Three.js lights attached to scene/world groups.
- Torch clone lights live inside torch mount groups.

Update loop:

- No per-frame lighting update found.

Should not own:

- Combat audio or rig state.

### Room, World, And Environment

- Main world builder: `buildExplorationWorld()` at `world.js:310`.
- Outside enclosure: `createOutsideEnclosure()` at `world.js:357`.
- Rooms: `createRoom()` at `world.js:400`.
- Collision data: `worldCollision` at `world.js:293`.
- Movement collision: `moveRigWithCollision()` around `world.js:1046`.
- Room correction: `resolveRigRoomCollision()` around `world.js:1075`.

State:

- `worldCollision.wallRects`
- `worldCollision.treeCircles`
- outside bounds and encounter zones
- scene groups returned to `main.js`

Update loop:

- Movement uses `moveRigWithCollision()` inside `updateKeyboardMotion()`.
- Root correction uses `resolveRigRoomCollision()` inside `syncSkeletonRoot()`.

Should not own:

- Player animation.
- Rig calibration.
- Combat hit logic.

Risk note:

- Collision is world-owned, which is good. `main.js` still decides how often and with what radius to call it.

### Moon, Trees, Torches, Stone Atmosphere

- Moon now lives in `world.js`.
- `WORLD_TWEAKS.skyMoon` owns the current moon asset, size, position, and fallback color.
- Moon GLB loading/fallback is owned by `buildSkyMoon()` in `world.js`.
- Trees live in `world.js` using `treeAssetState` at `world.js:123-134`.
- Active tree assets are configured at `world.js:83-89`.
- Torch asset and lights are configured at `world.js:60-71`; loading starts around `world.js:557`.
- Stone room materials are built by `loadStoneSurfaceMaterial()` at `world.js:153`.

State:

- `skyMoon` in `main.js` is the world-owned moon/sky-object group returned by `buildSkyMoon()`.
- Tree prototypes are cached in `treeAssetState`.
- Torch prototype cached as `torchPrototype`.

Update loop:

- Moon/trees/torches are mostly static.
- G53 visibility can hide the sky object, trees, walls, and ghost spheres.

Should not own:

- Encounter gameplay, except non-blocking trigger actions can affect sky-object tint/scale through `world.js`.

Risk note:

- Old `jupiterColor` / `jupiterScale` encounter action names remain as compatibility aliases, but new encounter definitions should use `skyMoonColor` / `skyMoonScale`.

### Ghostly Wireframe Spheres

- Built by `buildGhostSpheres()` around `world.js:871`.
- Updated by `updateGhostSphereMotion()` around `world.js:975`.
- Called from `main.js:667` and `main.js:4675`.

State:

- `ghostSpheres` array in `main.js`.
- Per-sphere metadata stored on each sphere/group by `world.js`.

Update loop:

- `animate()` calls `updateGhostSphereMotion(ghostSpheres, elapsed)` every frame.

Should not own:

- Player collision.
- Combat.
- Rigging.

Status:

- KEEP. It is visual atmosphere aligned with Empyrean.

### Player And Puppet Creation

- `buildSkeletonWorkshop()` at `main.js:1501`.
- `rebuildSkeletonWorkshop()` at `main.js:1559`.
- `createJoint()` at `main.js:1577`.
- `createSkeleton()` at `main.js:1717`.
- `addArmChain()` at `main.js:1764`.
- `addLegChain()` at `main.js:1818`.
- Rig collider setup around `main.js:1848` and `main.js:1877`.
- Default dimensions live in `rig.js:26-66`.

State:

- `state.skeleton`
- `state.debugView`
- `state.rigCollider`
- `rigTuning` dimension values
- `rigTuning.jointPointOffsets`
- `rigTuning.bindRotationOffsets`

Update loop:

- `updateSkeleton()` drives the live puppet every frame.
- `syncImportedSkinToPuppet()` copies puppet transforms to generated mesh bones after skeleton update.

Should not own:

- Combat enemy state.
- World creation.
- Audio transitions.

Risk note:

- Skeleton creation is still inside `main.js`. This should eventually become its own puppet module.

### Rigging And Calibration

Rig calibration means:

- joint/control point positions
- parent/child anchor locations
- bind/reference rotations
- mesh attachment/reference pose

It should not mean:

- visible gameplay pose
- relaxed arms
- low guard
- sword swing

Current locations:

- Joint offsets:
  - `getJointPointOffset()` at `main.js:2359`
  - `applyJointPointOffsets()` at `main.js:2368`
  - `setJointPointOffsetFromLocalPosition()` at `main.js:2419`
  - `resetJointPointOffsets()` at `main.js:2475`
- Bind rotations:
  - `getBindRotationOffset()` at `main.js:2488`
  - `applyBindRotationOffsets()` at `main.js:2497`
  - `updateBindRotationPose()` at `main.js:2525`
  - `resetBindRotationOffsets()` at `main.js:2598`
- Calibration commit:
  - `commitRigCalibration()` at `main.js:2533`
- Reference/start pose:
  - `applyFemaleMeshAPosePreset()` at `main.js:3042`
  - `applyRigMeshTPosePreset()` around `main.js:3074`
  - `applyRigMeshStartPose()` at `main.js:3118`
  - `resetSkeletonToBindPose()` at `main.js:3152`

State:

- `rigTuning.jointPointOffsets`
- `rigTuning.bindRotationOffsets`
- each joint's `userData.bindLocalPosition`
- each joint's `userData.bindLocalQuaternion`
- each joint's `userData.bindLocalEuler`

Update loop:

- G53 freezes pose via `freezeG53RiggingPose()` so calibration edits are visible without animation solvers fighting them.
- Normal animation layers apply deltas on top of bind/reference transforms.

Should not own:

- Whether the player is visually relaxed, guarding, swinging, walking, or running.

Risk note:

- This is the most important conceptual split in the codebase. Keep the difference between calibration data and visible pose data sacred.

### Visible Pose And Animation States

- Relaxed visible pose:
  - `applyRelaxedVisiblePose()` at `main.js:2893`
  - compatibility alias `applyRelaxedIdlePose()` at `main.js:2917`
- Immediate arm pose:
  - `applyImmediateControlledArmPose()` at `main.js:2857`
- Arm pose targets:
  - `getControlledArmPoseTargets()` at `main.js:7000`
  - `updateControlledArm()` at `main.js:7196`
  - `updateControlledArms()` at `main.js:6965`
- Visible pose compensation:
  - `getVisibleArmPoseDelta()` at `main.js:2735`
  - `setJointRotationFromBindDelta()` around `main.js:2830`

State:

- `controlState.leftArm`
- `controlState.rightArm`
- `controlState.weaponEquipped`
- `controlState.swordSwingStart`
- `controlState.swordSwingUntil`
- `state.walkArmSwing`
- bind/reference data under `joint.userData`

Update loop:

- `updateSkeleton()` calls `updateControlledArms()` every gameplay frame.
- G53 mode returns early before arm solvers run.

Should not own:

- Rig point calibration.
- Package storage.
- Mesh loading.

Overwrite warning:

- `updateControlledArms()` will overwrite live shoulder/elbow/wrist/palm rotations each frame in gameplay. Manual arm transforms must either become a named pose target or be applied while G53/pose freezing is active.

### Idle, Walk, Run, Jump

- Pure math lives in `physics.js`.
- Scene/rig application still lives in `main.js`.
- Idle:
  - `updateIdleMotion()` at `main.js:5031`
- Jump:
  - `startJump()` at `main.js:5094`
  - `updateJumpPhysics()` at `main.js:5883`
  - `updateJumpPose()` at `main.js:6850`
  - formulas in `physics.js:60`, `physics.js:83`, `physics.js:98`, and later jump-pose helpers.
- Walk:
  - `updateWalkMotion()` at `main.js:5907`
  - `updateLegWalk()` at `main.js:6207`
  - stride helpers in `physics.js`.
- Run:
  - `updateRunMotion()` at `main.js:6054`
  - `updateLegRun()` at `main.js:6327`
  - run helpers in `physics.js`.
- Leg relaxation:
  - `relaxLegs()` at `main.js:6442`

State:

- `controlState.walkPhase`
- `controlState.isWalking`
- `controlState.isRunning`
- `controlState.jump`
- `rigTuning.walk*`, `rigTuning.run*`, `rigTuning.jump*`, `rigTuning.idleMotion`

Update loop:

- `animate()` calls `updateJumpPhysics()` before `updateSkeleton()`.
- `updateSkeleton()` applies idle, walk/run or relax, combat stance, arms, then jump pose.

Should not own:

- Rig package import/export.
- World collision rules, except movement calls collision helpers.

Overwrite warning:

- `relaxLegs()` and walk/run solvers modify leg joint positions/rotations every frame.
- `updateJumpPose()` modifies body/root-related pose components during jump.

### Sword, Low Guard, And Combat Stance

- Sword runtime lives in `main.js`.
- Sword equip/stow/swing:
  - `equipSword()` at `main.js:5121`
  - `despawnSword()` at `main.js:5142`
  - `startSwordSwing()` at `main.js:5163`
- Sword loading/normalizing/attachment:
  - sword helper region begins around `main.js:5203`
  - sword GUI folder begins at `main.js:4345`
- Combat stance application:
  - `updateCombatStancePose()` at `main.js:6722`
- Stance math:
  - `COMBAT_STANCE_NAMES` at `combatPhysics.js:23`
  - low guard profile at `combatPhysics.js:28`

State:

- `state.sword`
- `rigTuning.swordAssetPath`
- `rigTuning.swordTargetLength`
- `rigTuning.swordGripFromLowerEnd`
- `rigTuning.swordOffsetX/Y/Z`
- `rigTuning.swordPitch/Yaw/Roll`
- `controlState.weaponEquipped`
- `controlState.combatStance`
- `state.combatBalance`

Update loop:

- `updateSkeleton()` applies `updateCombatStancePose()` when weapon is equipped and player is not walking.
- Sword attachment must be synced when the right palm moves or offsets change.

Should not own:

- Enemy HP.
- d20 roll.
- Battle audio.

Risk note:

- Sword is gameplay-critical and has its own tuning. It should become its own `player/swordController.js` or `combat/sword.js` module later.

### d20 / Oracle Mechanic

- Lives in `combat_updated.js`.
- D20 config at `combat_updated.js:175-201`.
- D20 runtime state at `combat_updated.js:239-248`.
- D20 object creation begins around `combat_updated.js:1352`.
- Roll and result orientation are handled in the combat state machine.

State:

- `combat.d20Group`
- `combat.d20Mesh`
- `combat.d20FacesByValue`
- `combat.d20RollStartQuaternion`
- `combat.d20RollEndQuaternion`
- `combat.rollValue`
- `combat.rollHasSettled`

Update loop:

- `updateCombatEncounter(delta)` advances rolling phase.

Should not own:

- Player sword animation.
- Rig calibration.

Risk note:

- The d20 is important enough to become its own module later. It currently shares a large file with enemy/audio/trigger logic.

### Combat Encounter Logic

- Lives in `combat_updated.js`.
- `initCombatEncounter()` at `combat_updated.js:271`.
- `updateCombatEncounter()` at `combat_updated.js:338`.
- `attemptCombatSwordHit()` at `combat_updated.js:510`.
- `setCombatDifficulty()` at `combat_updated.js:477`.
- `setCombatRiggingVisibilitySuppressed()` at `combat_updated.js:396`.

State:

- Private `combat` object at `combat_updated.js:222`.
- `COMBAT_CONFIG` at `combat_updated.js:84`.

Update loop:

- `animate()` calls `updateCombatEncounter(delta)` every frame at `main.js:4669`.
- `attemptCombatSwordHit()` is called by key/swing event code in `main.js`.

Should not own:

- Player low guard pose.
- World encounter data outside combat.

Risk note:

- The module boundary is good: `main.js` does not reach directly into private combat internals. The file is still monolithic.

### Audio, Music, And Sound Loops

- Background audio lives in `main.js` around the early audio setup region.
- Combat battle audio lives in `combat_updated.js:291`.
- World encounter actions can modify the background audio through `tickEncounterSystem()` and action handling in `world.js`.
- Audio action docs live in `ENCOUNTERS.md`.

State:

- `myAudio` in `main.js`
- `combat.battleAudio` in `combat_updated.js`
- Encounter action payloads in `encounters.js`

Update loop:

- Combat audio fades are advanced inside `updateCombatEncounter(delta)`.
- Encounter audio actions are event-driven by entering/exiting trigger zones.

Should not own:

- Rigging or visible pose.

Risk note:

- Audio has multiple writers: main background setup, world encounter actions, and combat crossfades. This works now but needs a future audio manager so systems request audio changes rather than directly mutating audio elements.

### Debug Tools

- Skeleton lab: GUI controls at `main.js:4108`.
- World debug: GUI controls at `main.js:4291`.
- Dev probe:
  - state at `main.js:846`
  - builder at `main.js:5637`
  - readout at `main.js:5831`
  - keyboard at `main.js:5743`
- Mouse joint editing:
  - state at `main.js:1027`
  - pointer handlers at `main.js:7457`, `main.js:7788`, `main.js:7959`
- Axis marker:
  - `updateAxisMarkerAttachment()` at `main.js:4584`

Status:

- DEV ONLY.

Should not own:

- Gameplay decisions.
- Saved gameplay actor data, except dev tuning exports.

Risk note:

- Debug tools are useful and should not be deleted, but they should live behind a clean dev-mode boundary.

---

## 3. Dead Or Obsolete Material

Labels used here:

- KEEP: active and aligned.
- DEV ONLY: useful tool, not gameplay.
- ARCHIVE: possibly useful later, not active gameplay.
- REMOVE CANDIDATE: appears unused or obsolete. Do not remove in this pass.
- DO NOT TOUCH YET: dependency or recent history makes it risky.

### Keep

| Item                       | Where                                                                         | Why                                                     |
| -------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------- |
| Core Three.js app          | `main.js`, `index.html`, `styles.css`                                         | Active runtime.                                         |
| World/environment          | `world.js`                                                                    | Active rooms, collision, trees, torches, ghost spheres. |
| Imported mesh pipeline     | `skin.js`                                                                     | Active Sigewynn mesh rigging and sync.                  |
| Movement math              | `physics.js`                                                                  | Active jump/walk/run formulas.                          |
| Combat stance math         | `combatPhysics.js`                                                            | Active low guard/balance vocabulary.                    |
| Combat encounter/d20       | `combat_updated.js`                                                           | Active combat prototype.                                |
| Puppet rig package storage | `puppetShop.js`                                                               | Active dev workflow and future NPC reuse seed.          |
| Encounter data             | `encounters.js`                                                               | Active non-blocking world triggers.                     |
| Active world assets        | `moon.glb`, `tree.glb`, `deadTree.glb`, `torch.glb`, stone textures           | Runtime referenced.                                     |
| Active gameplay assets     | `Sigewynn.glb`, `enemy.glb`, `plainSword.glb`, `battle.mp3`, current ambience | Runtime referenced or user-current.                     |

### Dev Only

| Item                               | Where                                                     | Calls / Dependencies                                                                                     | What Breaks If Removed                                               | Confidence |
| ---------------------------------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- | ---------- |
| G53 rigging mode                   | `main.js:3188-3635`, GUI at `main.js:4200`                | Called by F2 capture, GUI buttons, mesh rig flow, combat visibility suppression.                         | Precision rigging workflow breaks.                                   | High.      |
| Dev probe                          | `main.js:846`, `main.js:5608-5850`, GUI at `main.js:4220` | Keyboard/mouse/GUI driven.                                                                               | Attachment coordinate measuring breaks. Gameplay unaffected.         | High.      |
| Skeleton lab/debug view            | `main.js:2124`, `main.js:4108`                            | Read by `applyVisibility()` and refreshed in update loop.                                                | Visual rig debugging lost. Gameplay mostly unaffected.               | High.      |
| World debug view                   | `world.js:1425+`, GUI at `main.js:4291`                   | Shows collision/trigger overlays.                                                                        | Collision/trigger editing becomes harder.                            | High.      |
| Mouse joint editor                 | `main.js:1027`, pointer handlers near `main.js:7457+`     | Uses joint offsets, G53 axis locks, GUI selected point.                                                  | Mouse pivot placement breaks.                                        | High.      |
| `restoreRuntimeArmBindRotations()` | `main.js:2926`                                            | No direct runtime call found by search; docs mention old button. Calls calibration reset/update helpers. | Manual arm-bind recovery unavailable. Keep while rigging stabilizes. | Medium.    |
| `applyRelaxedIdlePose()` alias     | `main.js:2917`                                            | No direct call found by search; wraps `applyRelaxedVisiblePose()`.                                       | Old console/docs name stops working.                                 | Medium.    |

### Archive

| Item               | Where                                                                                               | Calls / Dependencies                                                       | What Breaks If Removed                                           | Confidence |
| ------------------ | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- | ---------- |
| `JUMP.md`          | root                                                                                                | Documentation only.                                                        | Nothing runtime; loses math history.                             | High.      |
| `runCycle.md`      | root                                                                                                | Documentation only.                                                        | Nothing runtime; loses research notes.                           | High.      |
| `femaleMesh.glb`   | `assets/`                                                                                           | Docs/verify reference it; runtime default is now `Sigewynn.glb`.           | `verify.ps1` currently expects it; old demos break.              | Medium.    |
| `T.glb`            | `assets/`                                                                                           | No active runtime reference found in quick search.                         | Unknown old experiment only.                                     | Medium.    |
| `sword.glb`        | `assets/`                                                                                           | README/verify reference old sword; current user sword is `plainSword.glb`. | Verify fails unless updated; old saved tuning may point here.    | Medium.    |
| `Jupiter.jpg`      | `assets/`                                                                                           | README/verify only by search.                                              | Verify fails unless updated; old sky experiment lost.            | High.      |
| `background.mp3`   | `assets/`                                                                                           | README/verify; current audio may use different source.                     | Verify fails unless updated; old audio path references break.    | Medium.    |
| Older texture maps | `diffuse.jpg`, `normal.jpg`, `ao.jpg`, `displacement.jpg`, plus maybe `opacity.jpg`, `specular.jpg` | README/verify for some; active world uses stone-specific files.            | Verify/docs only unless saved material experiments rely on them. | Medium.    |

### Remove Candidate

Do not delete these now. These are candidates for a later cleanup branch after a browser smoke test.

| Item                                                     | Where              | Calls It                                                                         | It Calls                                                                                                                         | Dependency Notes                                                                                                                                                                | Likely Breakage                                                                         | Confidence                                              |
| -------------------------------------------------------- | ------------------ | -------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `makeJointMarker()`                                      | `main.js:2084`     | No call found by `rg`. Comment says `createDebugView()` builds markers directly. | Three.js geometry/material creation only.                                                                                        | Isolated helper.                                                                                                                                                                | None unless someone calls it manually from console.                                     | High.                                                   |
| `applyRigMeshModeVisibility()`                           | `main.js:4509`     | No call found by `rg`.                                                           | `setGuiFolderVisible()`, `state.guiFolders.meshImport`, `state.guiFolders.bindRotationControls`, `state.guiFolders.rigMeshMode`. | Looks like an unfinished guided UI mode. `rigMeshMode` is saved in `RIG_TUNING_KEYS` at `main.js:596` and defaulted at `main.js:1122`, but no active controller/call was found. | No current behavior likely breaks. Removing key may affect saved packages, so phase it. | High for unused function, medium for saved key cleanup. |
| `treeLeafMaterial` / `treeTrunkMaterial`                 | `world.js:287-288` | No runtime usage found by `rg`.                                                  | Nothing.                                                                                                                         | Leftover from primitive Three.js trees after GLB tree swap.                                                                                                                     | None if GLB tree path remains.                                                          | High.                                                   |
| `#puppet-lab-container`, `#puppet-source`, `#rig-canvas` | `index.html:37-39` | No JS/CSS references found by `rg`.                                              | None.                                                                                                                            | Likely leftover from 2D/video/canvas puppet lab.                                                                                                                                | Nothing current; remove only after page visual check.                                   | High.                                                   |

### Do Not Touch Yet

| Item                               | Where                                        | Why                                                                                                                                                       |
| ---------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `jupiterColor` / `jupiterScale` compatibility aliases | `world.js`, old docs/saved encounters | Old action names still map to the sky moon for backwards compatibility. New data should use `skyMoonColor` / `skyMoonScale`. |
| `combat_updated.js` filename       | root and `main.js` imports                   | Name exists because of the earlier editor save issue. It is active. Rename only when the project is stable and imports/docs update together.              |
| `rigTuning` broad package shape    | `main.js`, `puppetShop.js`                   | It mixes dev, gameplay, rig, and UI values, but saved rigs depend on it now. Split schema later.                                                          |
| `restoreRuntimeArmBindRotations()` | `main.js:2926`                               | No direct call found, but recent rigging history makes this a useful emergency tool. Keep until arm/reference/visible pose path is unquestionably stable. |
| Old assets checked by `verify.ps1` | `assets/`, `verify.ps1:89-104`               | Removing assets before updating verification will create false failures.                                                                                  |

---

## 4. Dependency Check For Suspected Obsolete Systems

### `applyRigMeshModeVisibility()` / `rigMeshMode`

Search result:

- `rigMeshMode` appears in:
  - `main.js:596` saved key
  - `main.js:1122` default value
  - `main.js:4509-4537` unused function
- No GUI control or function call was found.

Directly called:

- No.

Indirectly called through update loop:

- No.

Attached to UI controls:

- No active controller found.

Attached to keyboard input:

- No.

Attached to saved state / rig packages:

- Yes. It is part of `RIG_TUNING_KEYS`, so saved tuning/packages may include it.

Referenced by assets/DOM:

- No.

Recommendation:

- Later either finish it as a real guided mode or remove function plus saved key in a migration-aware cleanup.

### `makeJointMarker()`

Search result:

- Only definition found at `main.js:2084`.
- Comment says current debug view builds markers directly.

Directly called:

- No.

Indirectly called:

- No.

Recommendation:

- Remove candidate after one pass through debug view.

### Primitive Tree Materials

Search result:

- `treeLeafMaterial` and `treeTrunkMaterial` defined at `world.js:287-288`.
- No active usage found by search.
- Runtime tree assets are configured at `world.js:83-89` and loaded through GLB path.

Recommendation:

- Remove candidate after confirming no fallback primitive tree path still exists.

### Old Puppet Lab DOM

Search result:

- `index.html:37-39` contains `#puppet-lab-container`, `#puppet-source`, `#rig-canvas`.
- No JS/CSS references found.

Recommendation:

- Remove candidate after visual smoke test. This is likely old 2D avatar/canvas residue.

### Old Sky-Moon Action Aliases

Search result:

- Active runtime code now uses `skyMoon`.
- `world.js` keeps `jupiterColor` / `jupiterScale` as aliases for older saved encounter definitions.

Directly called:

- No active `jupiter` runtime handle should remain. Encounter ticking receives `skyMoon`.

Recommendation:

- Do not remove the aliases until old saved encounter data is known to be migrated.

### Old Assets

Search result:

- `verify.ps1:89-104` still checks `femaleMesh.glb`, `sword.glb`, `Jupiter.jpg`, `background.mp3`, and old texture maps.
- README also documents older assets.

Recommendation:

- Archive plan should include updating `verify.ps1`, README, and saved tuning assumptions together.

---

## 5. Patched / Fragile Systems

### Rig Calibration vs Visible Pose

Current behavior:

- Calibration data is stored in `jointPointOffsets`, `bindRotationOffsets`, and joint `userData.bindLocal*`.
- Visible arm poses are applied as animation deltas on top of bind/reference transforms.
- `commitRigCalibration()` preserves current rigged point/reference setup.
- `applyRelaxedVisiblePose()` lowers visible arms without resetting rigged point positions.

Why fragile:

- Old code and docs used "rest", "default", "bind", "down", and "relaxed" almost interchangeably.
- T/A modeling poses are valid rig references but invalid visible gameplay idle poses.
- `restoreRuntimeArmBindRotations()` still exists and intentionally changes bind data.

Simpler future architecture:

- `rigCalibration`: dimensions, joint points, bind/reference rotations.
- `visiblePose`: named animation targets such as down, lowGuard, swingStart, swingFollowThrough.
- `meshBindingPose`: T/A/current reference used for skin generation.
- Never store visible pose in bind offsets.

Risk:

- High. This is the most important area to protect.

### `bindRotationOffsets`

Current behavior:

- Saved in `rigTuning`.
- Driven by GUI bind-pose sliders.
- Used to build each joint's `bindLocalQuaternion`.
- Also used by start-pose presets for mesh binding.

Why fragile:

- Historically polluted by T/A pose and then mistaken for gameplay rest.
- Euler values are not enough because body/knee neutral corrections use base quaternions.

Simpler future architecture:

- Keep bind/reference rotations as calibration-only.
- Store named visible pose deltas separately.
- Use quaternions internally, expose Euler sliders only as UI.

Risk:

- High.

### `jointPointOffsets`

Current behavior:

- Saved in `rigTuning`.
- GUI and mouse/G53 edit it.
- Rebuilt into actual joint local positions.

Why fragile:

- Parent-child movement can look like unrelated joints drift if animation solvers are still active.
- Mouse edits require careful local/world conversion and descendant preservation.

Simpler future architecture:

- A `RigCalibration` object owns all pivot points.
- A `RigEditor` tool edits calibration.
- Runtime animation reads calibration but does not write it.

Risk:

- Medium/high.

### G53 Rigging Mode

Current behavior:

- F2 enters/exits machine-home rigging mode.
- Movement/yaw are frozen.
- Camera stays active.
- World/combat clutter is hidden.
- Mouse point editing and axis locks become the main workflow.
- On exit, rig calibration is committed and visible relaxed pose is applied.

Why fragile:

- It has many responsibilities: pose freeze, world visibility fixture, combat suppression, input gating, home position, axis locks, descendant preservation, exit-after-rig async flow.
- A failure in any one layer can leave the app feeling half-entered or half-exited.

Simpler future architecture:

- `g53RiggingMode.js` should own only dev-mode lifecycle.
- It should call small services:
  - `rigEditor.enterCalibrationMode()`
  - `visibilityFixture.apply()`
  - `inputMode.set("rigging")`
  - `rigEditor.commitCalibration()`
  - `visiblePose.apply("down")`

Risk:

- Medium/high. Do not rewrite casually; this mode is valuable.

### Puppet Shop Package Loading

Current behavior:

- `puppetShop.js` creates a complete package with full `rigTuning` plus readable snapshots.
- `main.js` sanitizes and applies packages through `applyPuppetRigPackage()`.

Why fragile:

- `rigTuning` contains rig data, mesh data, motion data, sword offsets, combat difficulty, debug flags, dev probe values, G53 flags, world debug flags, and UI preferences.
- Future gameplay actors should not need dev probe or world debug state.

Simpler future architecture:

- Split package into:
  - `actorRig.calibration`
  - `actorRig.mesh`
  - `actorRig.visiblePoseDefaults`
  - `actorRig.motionProfile`
  - `actorRig.attachments`
  - `workshopUi` optional/dev-only

Risk:

- Medium.

### Arm / Shoulder / Elbow Ownership

Current behavior:

- Start-pose presets can set arm bind/reference rotations.
- `getVisibleArmPoseDelta()` compensates visible targets when reference arms are in T/A.
- `updateControlledArms()` writes visible arm rotations every frame.

Why fragile:

- Arms are touched by rigging, walking/running arm swing, low guard, sword swing, relaxed pose, and startup settle.
- Manual changes are easy to overwrite unless they enter the pose target system.

Simpler future architecture:

- One visible pose state machine:
  - `idle`
  - `walk`
  - `run`
  - `lowGuard`
  - `swing`
  - `jumpOverlay`
- Each state outputs pose deltas.
- A pose compositor applies deltas over calibration.

Risk:

- High.

### Sword Offsets

Current behavior:

- Sword asset path, scale, grip point, position, pitch/yaw/roll are saved in `rigTuning`.
- Sword object lives in `state.sword`.
- Right palm attachment is synced by helper functions.

Why fragile:

- Sword is gameplay-critical but controlled from the workshop-style `rigTuning`.
- Right-hand identity depends on rig orientation and mesh reference correctness.

Simpler future architecture:

- `attachments/swordAttachment.js` owns attachment sockets and offset profiles.
- Actor rig packages can include named sockets.
- Gameplay chooses an equipped item and pose state.

Risk:

- Medium.

### d20 / Combat System

Current behavior:

- `combat_updated.js` owns trigger, enemy, health, d20, enemy hiding, battle audio, banners, and phase machine.

Why fragile:

- It is well-contained but too broad.
- D20 is thematically important enough to deserve its own identity.

Simpler future architecture:

- `combat/encounterController.js`
- `combat/enemyActor.js`
- `combat/d20Oracle.js`
- `combat/combatAudio.js`
- `combat/hitDetection.js`

Risk:

- Medium.

### Audio Transitions

Current behavior:

- Background audio is owned by `main.js`.
- Battle audio is owned by `combat_updated.js`.
- Encounter zones can mutate background audio through `world.js` action handlers.

Why fragile:

- Multiple systems can want control of the same background audio.
- Combat and encounter zones could fight over volume/playback rate/source.

Simpler future architecture:

- `audioManager.js` with channels:
  - ambient
  - music
  - combat
  - oneShot
  - zoneModifier
- Systems request transitions; audio manager owns actual elements.

Risk:

- Medium.

---

## 6. Puppet Workshop As Dev Mode

Target rule:

Puppet workshop creates, adjusts, saves, and loads rigs. Gameplay consumes finalized rig packages and animation states. Gameplay should not depend on live puppet editing tools.

### Belongs In Puppet Workshop / Dev Mode

- Mesh preview and rig workflow.
- Imported mesh transform/opacity/wireframe controls.
- Joint point offset sliders.
- Bind pose rotation sliders.
- G53 rigging mode.
- Mouse joint editor.
- Axis marker.
- Dev probe.
- Skeleton lab.
- World debug overlays.
- Rig package save/load/export/import.
- Calibration commit.
- Package inspection.

### Does Not Belong In Puppet Workshop

- Player movement controls.
- Combat difficulty and enemy state.
- Sword swing gameplay.
- d20/oracle state.
- Background/battle audio state.
- World trigger gameplay.
- Title card/runtime startup.

### Current Tangling

- `puppetShop.js` itself is clean and dev/data-only.
- `main.js` GUI mixes workshop controls and gameplay controls in one panel.
- `rigTuning` stores both workshop and gameplay values:
  - workshop: joint offsets, bind rotations, mesh transforms, devProbe, G53 flags
  - gameplay: combat difficulty, sword offsets, encounter toggle, motion profile
- Complete rig packages currently save all of `rigTuning`, so dev UI state can travel with a rig package.

### What Puppet Workshop Should Export

- Rig identity and notes.
- Mesh source path or asset id.
- Mesh presentation/reference transform needed for binding.
- Body dimensions.
- Joint point offsets.
- Bind/reference rotations.
- Named attachment sockets, especially right-hand sword socket.
- Motion/personality defaults.
- Optional visible default pose name.

### What Gameplay Should Consume

- Finalized actor rig package.
- Mesh asset id/path.
- Animation state definitions.
- Attachment sockets.
- Motion profile.

Gameplay should not consume:

- dev probe location
- G53 axis locks
- world debug visibility
- GUI folder states
- mouse edit selected joint

---

## 7. Future Organization Plan

Do not refactor all at once. These are proposed destinations.

### Core Scene / Bootstrap

Proposed files:

- `core/bootstrap.js`
- `core/scene.js`
- `core/renderLoop.js`
- `core/input.js`

Move:

- Scene/camera/renderer creation.
- Startup/title flow.
- requestAnimationFrame loop coordination.
- Window/key/pointer listener registration.

Should import:

- World builder, player controller, combat controller, audio manager.

Should not import:

- Low-level rig editor internals.

Timing:

- Near-term, after current rig behavior is stable.

### Puppet Creation

Proposed files:

- `puppet/createSkeleton.js`
- `puppet/jointDefinitions.js`
- `puppet/debugSkeletonView.js`

Move:

- `createSkeleton()`, `createJoint()`, `addArmChain()`, `addLegChain()`.
- Joint order/constants.
- Debug bone/marker construction.

Should import:

- Three.js and rig defaults.

Should not import:

- Combat, audio, world triggers.

Timing:

- Near-term.

### Rig Calibration

Proposed files:

- `puppet/rigCalibration.js`
- `puppet/bindPose.js`
- `puppet/rigStartPoses.js`

Move:

- `jointPointOffsets` helpers.
- `bindRotationOffsets` helpers.
- A/T pose preset logic.
- `commitRigCalibration()`.
- `resetSkeletonToBindPose()`.

Should import:

- Three.js math if needed.

Should not import:

- Sword/combat/audio.

Timing:

- Near-term but careful. High-value cleanup.

### Visible Poses And Animation States

Proposed files:

- `animation/visiblePoseLibrary.js`
- `animation/poseCompositor.js`
- `animation/idle.js`
- `animation/walkRun.js`
- `animation/jump.js`
- `animation/arms.js`

Move:

- `applyRelaxedVisiblePose()`.
- `getVisibleArmPoseDelta()`.
- `getControlledArmPoseTargets()`.
- Walk/run/jump application logic currently in `main.js`.

Should import:

- `physics.js`, `combatPhysics.js` stance profiles.

Should not import:

- GUI, localStorage, world debug.

Timing:

- Near-term after rig calibration split.

### Puppet Workshop / Dev Mode

Proposed files:

- `workshop/workshopGui.js`
- `workshop/g53RiggingMode.js`
- `workshop/devProbe.js`
- `workshop/mouseJointEditor.js`
- `workshop/worldDebugControls.js`

Move:

- lil-gui folders related to rigging/dev.
- G53 lifecycle.
- devProbe.
- mouse editing.
- visibility fixtures for dev mode.

Should import:

- Rig calibration service, visibility fixture helpers, skin preview functions.

Should not import:

- Combat rules, d20 rules, enemy HP.

Timing:

- Near-term. This is the architecture move that makes Empyrean a game instead of a workshop.

### Rig Storage / Package Loading

Proposed files:

- Keep `puppetShop.js`, or rename later to `rigStorage.js`.
- Add `rigPackageSchema.js`.

Move:

- Schema migrations.
- Split package shape.
- Runtime actor package loader.

Should import:

- No Three.js if possible.

Should not import:

- GUI or scene objects.

Timing:

- Later, after package fields are better understood.

### Player Control

Proposed files:

- `player/playerController.js`
- `player/cameraFollow.js`
- `player/playerInput.js`

Move:

- `controlState`.
- `updateKeyboardMotion()`.
- `syncSkeletonRoot()`.
- Camera follow/orbit.

Should import:

- World collision helpers, visible pose controller.

Should not import:

- Puppet workshop GUI.

Timing:

- Near-term.

### Combat

Proposed files:

- `combat/combatEncounter.js`
- `combat/d20Oracle.js`
- `combat/enemyController.js`
- `combat/hitDetection.js`
- `combat/swordController.js`
- `combat/combatAudio.js`

Move:

- Split `combat_updated.js`.
- Move sword attachment and swing logic out of `main.js`.
- Keep `combatPhysics.js` pure.

Timing:

- Later, after player rig and sword stance are locked down.

### World / Environment

Proposed files:

- `world/world.js` can remain.
- Later split `world/collision.js`, `world/encounterZones.js`, `world/props.js`, `world/ghostSpheres.js`.

Move:

- Only if `world.js` becomes painful. It is currently one of the healthier boundaries.

Timing:

- Later.

### Audio

Proposed file:

- `audio/audioManager.js`

Move:

- Background audio creation.
- Combat crossfades.
- Encounter audio actions.
- Volume/playback-rate/source transitions.

Timing:

- Near-term before adding more zones/music.

---

## 8. State Ownership Map

| State                                | Defined                                                            | Written By                                                                   | Read By                                                                          | Saved?                                      | Type                      | Ownership Risk                                           |
| ------------------------------------ | ------------------------------------------------------------------ | ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------- | -------------------------------------------------------- |
| `rigTuning`                          | `main.js:816`                                                      | GUI, load/save functions, package import, preset functions, rigging tools    | Almost every system in `main.js`, `skin.js` via context, combat difficulty setup | Yes, localStorage and rig packages          | Dev + gameplay mixed      | High. Too broad.                                         |
| `controlState`                       | `main.js:981`                                                      | Keyboard handlers, movement update, sword/jump functions, G53, combat stance | Camera, skeleton update, combat, world collision                                 | No                                          | Runtime gameplay          | Medium. Good concept, still too close to `main.js`.      |
| `state`                              | `main.js:818`                                                      | Startup/build functions, GUI, skin, sword, G53, dev tools                    | Most of `main.js`, `skin.js` context                                             | No                                          | Runtime object bag        | High. Convenient but broad.                              |
| `state.skeleton`                     | `main.js` skeleton build                                           | `buildSkeletonWorkshop()`, `rebuildSkeletonWorkshop()`                       | Animation, skin sync, dev tools, sword attachment                                | No                                          | Runtime puppet            | Medium. Needs module owner.                              |
| `rigTuning.jointPointOffsets`        | `main.js` defaults/sanitize                                        | GUI sliders, mouse joint editor, package import, reset                       | Skeleton creation, G53, skin binding                                             | Yes                                         | Rig calibration           | High. Must not be reset by visible pose logic.           |
| `rigTuning.bindRotationOffsets`      | `main.js` defaults/sanitize                                        | Bind GUI, A/T presets, package import, reset, manual recovery                | Bind pose update, animation base quaternions, skin binding                       | Yes                                         | Rig calibration/reference | High. T/A vs gameplay rest confusion.                    |
| Visible arm pose                     | `controlState.leftArm/rightArm`, swing fields                      | Key input, equip/stow/swing, `applyRelaxedVisiblePose()`                     | `updateControlledArms()`                                                         | No                                          | Gameplay pose             | High. Can overwrite manual live transforms.              |
| `state.runtimeArmBindRotationBackup` | `main.js:968`                                                      | Start-pose preset capture and manual recovery                                | `restoreRuntimeArmBindRotations()`, `handleImportedMeshRigged()`                 | No                                          | Temporary recovery        | Medium. Keep until rigging stabilizes.                   |
| `state.g53RiggingMode`               | `main.js:831`                                                      | enter/exit/toggle G53, status updater                                        | update loop, visibility, GUI                                                     | No                                          | Dev runtime               | Medium/high. Many responsibilities.                      |
| `state.devProbe`                     | `main.js:846`                                                      | GUI, keyboard, mouse drag                                                    | GUI readouts, scene attachment                                                   | Partly: position/visible in `rigTuning`     | Dev runtime               | Low/medium. Should be workshop-only.                     |
| Imported mesh state                  | `state.importedPreview`, `state.importedSkin`, `state.meshBlobUrl` | `skin.js`, mesh GUI, clear/load functions                                    | `main.js`, `skin.js`, update loop                                                | Mesh path/transform saved, live objects not | Runtime asset/dev         | Medium. Blob URLs cannot be saved.                       |
| Saved rig packages                   | `puppetShop.js` localStorage key                                   | Save/import/delete functions                                                 | Load/list/export functions                                                       | Yes                                         | Dev storage               | Medium. Package is too broad for gameplay actors.        |
| Sword runtime                        | `state.sword`                                                      | Sword load/equip/stow/reload helpers                                         | Attachment sync, animation, combat hit                                           | No                                          | Runtime asset             | Medium. Offsets saved elsewhere.                         |
| Sword offsets                        | `rigTuning.sword*`                                                 | GUI, reset/import/load                                                       | Sword attachment/presentation                                                    | Yes                                         | Attachment tuning         | Medium. Good for workshop, needs gameplay socket schema. |
| Combat state                         | private `combat` in `combat_updated.js:222`                        | Combat module functions                                                      | Combat module functions                                                          | No                                          | Runtime gameplay          | Low/medium. Contained but monolithic.                    |
| Combat difficulty                    | `rigTuning.combatDifficulty`, `COMBAT_CONFIG.health.difficulty`    | GUI, startup, `setCombatDifficulty()`                                        | Combat HP setup                                                                  | `rigTuning` yes                             | Gameplay setting          | Medium. Two copies must sync.                            |
| Audio state                          | `myAudio` in `main.js`, `combat.battleAudio`                       | main setup, world actions, combat fades                                      | main, world, combat                                                              | No                                          | Runtime audio             | High. Multiple writers.                                  |
| World collision                      | `worldCollision` in `world.js:293`                                 | `buildExplorationWorld()`                                                    | movement, collision debug, root sync                                             | No                                          | Runtime world             | Low. Good ownership.                                     |
| Encounter runtime                    | `state.encounterRuntime`                                           | `createEncounterRuntime()` / `tickEncounterSystem()`                         | world debug, main update                                                         | No                                          | Runtime world events      | Low/medium. Naming/docs need sky-object update.          |

---

## 9. Update Loop Map

Main loop: `animate(currentTime)` at `main.js:4636`.

Per-frame order:

| Order | Function                                      | Called From                       | Modifies                                                           | Gates                                       | Should Run In Gameplay? | Should Run In G53/Dev?                                                                  | Overwrite Risk                              |
| ----- | --------------------------------------------- | --------------------------------- | ------------------------------------------------------------------ | ------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------- |
| 1     | `updateKeyboardMotion(delta, currentTime)`    | `animate()`                       | `controlState.position`, yaw, camera values, walking/running flags | G53 freezes movement/yaw but allows camera  | Yes                     | Partly. Camera yes, movement no                                                         | Can move root unless G53 active.            |
| 2     | `tickEncounterSystem()`                       | `animate()` if encounters enabled | Encounter active ids, world debug, audio/sky actions               | `rigTuning.encounterSystemEnabled`          | Yes                     | Currently yes unless disabled; G53 world hidden does not necessarily stop trigger logic | Can modify audio/sky state.                 |
| 3     | `updateCombatEncounter(delta)`                | `animate()`                       | Combat phase, enemy, d20, healthbar, battle audio                  | Combat module suppresses visuals during G53 | Yes                     | It returns early when suppressed                                                        | Can change audio and enemy visuals.         |
| 4     | `updateJumpPhysics(delta)`                    | `animate()`                       | `controlState.jump`                                                | Jump phase                                  | Yes                     | G53 freeze resets jump to grounded                                                      | Affects root Y via later sync.              |
| 5     | `updateSkeleton(delta, elapsed, currentTime)` | `animate()`                       | Almost all live joint transforms                                   | G53 early return                            | Yes                     | In G53 only freeze/bind pose                                                            | High. Main transform writer.                |
| 6     | `syncImportedSkinToPuppet()`                  | `animate()`                       | Generated bones in imported skin                                   | No imported skin = no-op                    | Yes if mesh loaded      | Yes, follows frozen rig                                                                 | Copies current puppet transforms into skin. |
| 7     | `updateDevProbeReadout()`                     | `animate()`                       | GUI strings                                                        | Probe exists/visible                        | Optional                | Yes                                                                                     | No pose risk.                               |
| 8     | `updateGhostSphereMotion()`                   | `animate()`                       | Ghost sphere transforms/materials                                  | None                                        | Yes                     | Could be hidden by G53 visibility                                                       | No rig risk.                                |
| 9     | `updateCamera(delta)`                         | `animate()`                       | Camera transform                                                   | None                                        | Yes                     | Yes                                                                                     | No rig risk.                                |
| 10    | `renderer.render()`                           | `animate()`                       | Draws frame                                                        | None                                        | Yes                     | Yes                                                                                     | None.                                       |

### `updateSkeleton()` Internal Order

`updateSkeleton()` starts at `main.js:4793`.

| Order | Layer             | Function                             | Modifies                               | Gate                            | Notes                                                          |
| ----- | ----------------- | ------------------------------------ | -------------------------------------- | ------------------------------- | -------------------------------------------------------------- |
| 1     | Root sync         | `syncSkeletonRoot()`                 | skeleton root position                 | Always                          | Adds `rootOffset*` and jump offset to `controlState.position`. |
| 2     | G53 freeze        | `freezeG53RiggingPose()`             | live joints reset to bind pose         | `state.g53RiggingMode.active`   | Returns early. Stops all animation solvers.                    |
| 3     | Idle              | `updateIdleMotion()`                 | spine/chest/head/torso scale/rotations | `rigTuning.idleMotion`          | Breathing mostly affects torso, not whole avatar.              |
| 4     | Walk/run or relax | `updateWalkMotion()` / `relaxLegs()` | legs, pelvis, body motion              | walking or preview              | Overwrites leg live positions.                                 |
| 5     | Combat stance     | `updateCombatStancePose()`           | body/legs/arms/stance balance          | weapon equipped and not walking | Low guard layer.                                               |
| 6     | Arms              | `updateControlledArms()`             | shoulder/elbow/wrist/palm              | Always in gameplay              | Major overwrite point for visible arm transforms.              |
| 7     | Jump pose         | `updateJumpPose()`                   | crouch/air/landing overlays            | Jump phase                      | Adds jump pose on top of current animation.                    |
| 8     | Debug refresh     | `state.debugView.refreshBones()`     | debug line geometry                    | lab visible                     | Prevents bone guide detachment.                                |

### Functions That Can Overwrite Manual Poses

- `resetSkeletonToBindPose()` copies bind transforms into live joints.
- `freezeG53RiggingPose()` repeatedly resets to bind while G53 is active.
- `updateIdleMotion()` writes torso/head/chest.
- `updateWalkMotion()` / `updateRunMotion()` write body/hip/leg pose.
- `relaxLegs()` writes legs back toward bind.
- `updateCombatStancePose()` writes stance pose.
- `updateControlledArms()` writes arms every gameplay frame.
- `updateJumpPose()` writes jump overlays.
- `syncImportedSkinToPuppet()` copies whatever live puppet pose exists into the imported skin bones.

Rule of thumb:

If you manually set a live joint transform and want it to persist during gameplay, it must become either calibration data or a visible pose target. Otherwise an update layer will probably overwrite it.

---

## 10. Transform / Coordinate Warnings

### Three.js Axes

Empyrean uses normal Three.js world axes:

- X = left/right
- Y = up/down
- Z = forward/back

Player forward direction in `updateKeyboardMotion()`:

```js
x = Math.sin(yaw);
z = Math.cos(yaw);
```

At `yaw = 0`, forward is `+Z`.

### Local vs World Position

Important split:

- `controlState.position` is player floor/root world travel position.
- `rigTuning.rootOffsetX/Y/Z` are workshop alignment offsets added in `syncSkeletonRoot()`.
- `joint.position` is local to its parent joint.
- `jointPointOffsets` are local pivot offsets from bind/default joint positions.
- `devProbe` is parented to skeleton root, so its local position is rig-relative.

Warning:

- Do not paste a world position directly into a joint local offset unless it has been converted through the correct parent/root space.

### Bind Quaternion vs Euler

`dampJointRotation()` explicitly warns that `bindLocalEuler` alone is not enough.

Reason:

- Some neutral corrections are baked into `bindLocalQuaternion`, especially body/knee orientation fixes.
- If animation uses only Euler bind values, it can erase those base corrections and cause leg orientation reversion.

Rule:

- Build final animation target as:

```text
targetQuaternion = bindLocalQuaternion * deltaQuaternion
```

Do not simplify this back to Euler addition.

### T/A Pose vs Relaxed Gameplay Pose

Reference pose:

- T/A/current pose used for binding a mesh.
- Stored as calibration/reference through bind rotations and joint points.

Visible pose:

- What the player looks like during gameplay: relaxed/down, walk, run, low guard, swing.
- Applied as animation deltas over the reference.

Warning:

- A clean `bindRotationOffsets = 0` does not automatically mean the arms are visually relaxed.
- A T-pose can be correct calibration and wrong gameplay presentation at the same time.

### Left / Right Inversion

Potential confusion sources:

- Imported mesh may face the opposite direction from the rig.
- Body and knee neutral corrections use yaw rotations.
- Sword attaches to a named palm; if mesh orientation is wrong, the visual "right hand" may look like the named left or vice versa.

Rule:

- Fix facing/reference orientation first.
- Do not swap labels unless the rig's coordinate frame is proven wrong.

### Parent / Child During Joint Editing

Mouse joint editing writes local offsets. If child preservation is enabled, descendant root locals are captured and restored.

Warning:

- This is exactly where "moving one point moves another point" symptoms can appear if animation solvers are active or if preserved descendant logic is applied in the wrong space.
- G53 freeze exists to prevent pose solvers from fighting point placement.

### Skin Sync

`syncImportedSkinToPuppet()` copies puppet joint transforms into generated bones.

Warning:

- It does not decide what the pose should be. It only mirrors the current puppet pose.
- If the puppet is stuck in T-pose, the skin will faithfully follow T-pose.

### Sky Object Naming

The active sky object is the moon. Runtime code should use `skyMoon`; old `jupiterColor` / `jupiterScale` action strings are compatibility aliases only.

Warning:

- This is a naming mismatch, not dead code.
- Rename only with a compatibility pass across `main.js`, `world.js`, `encounters.js`, README, and cookbooks.

---

## 11. Recommended Next Steps

### Immediate: Documentation And Clarity

1. Add a short glossary to README:
   - rig calibration
   - bind/reference pose
   - visible pose
   - G53 rigging mode
   - actor rig package

   Why it matters:
   The recent T-pose/rest-pose debugging came from vocabulary collision.

   Risk:
   Low.

   Checks:
   No runtime check needed.

2. Mark dev-only UI folders clearly in comments/docs:
   - G53
   - Dev Probe
   - Skeleton Lab
   - World Debug
   - Joint Point Offsets
   - Bind Pose Rotations

   Why it matters:
   Prevents gameplay features from being added to workshop logic.

   Risk:
   Low.

3. Do not remove old assets yet, but create an asset inventory section:
   - active
   - archive/reference
   - remove after verify update

   Why it matters:
   Avoids breaking `verify.ps1` and old saved packages accidentally.

   Risk:
   Low.

4. Add TODO comments or doc notes for unused candidates:
   - `makeJointMarker()`
   - `applyRigMeshModeVisibility()`
   - primitive tree materials
   - old puppet lab DOM

   Why it matters:
   Lets future cleanup happen deliberately.

   Risk:
   Low.

### Immediate: Safe Technical Checks

After any future cleanup, run:

- `powershell -NoProfile -ExecutionPolicy Bypass -File .\verify.ps1`
- Browser load through Live Server.
- Smoke test:
  - title card fades
  - Sigewynn loads/rigs
  - F2 enter/exit G53
  - move a joint in G53
  - exit G53, arms visibly relax
  - walk, run, jump
  - draw sword with `1`
  - stow sword with `2`
  - swing with `Enter`
  - enter combat trigger
  - d20 rolls
  - enemy health changes
  - world collisions still hold

### Near-Term: Module Splits

1. Split puppet creation out of `main.js`.

   Move:
   - `createSkeleton()`
   - `createJoint()`
   - arm/leg chain builders
   - skeleton debug builder

   Why:
   This reduces `main.js` without changing behavior.

   Risk:
   Medium.

2. Split rig calibration from visible pose.

   Move:
   - joint point helpers
   - bind rotation helpers
   - start pose presets
   - calibration commit
   - relaxed visible pose helpers

   Why:
   This protects the most dangerous conceptual boundary.

   Risk:
   Medium/high.

3. Create a workshop/dev mode module.

   Move:
   - G53
   - devProbe
   - mouse joint editor
   - skeleton/world debug UI

   Why:
   Puppet workshop becomes a tool, not gameplay.

   Risk:
   Medium.

4. Add an audio manager.

   Move:
   - background audio
   - combat battle crossfade
   - encounter audio modifiers

   Why:
   Prevents future music/zone/combat audio conflicts.

   Risk:
   Medium.

5. Split sword from `main.js`.

   Move:
   - sword asset loading
   - sword offsets
   - hand attachment
   - swing request/hit doorway

   Why:
   Sword is now central gameplay, not a small prop.

   Risk:
   Medium.

### Later: Larger Architecture

1. Redesign rig package schema.

   Future shape:
   - `calibration`
   - `mesh`
   - `visiblePoseDefaults`
   - `motionProfile`
   - `attachments`
   - `workshopUi` optional

   Why:
   Reusable NPC/enemy rigs need clean actor data, not full GUI state.

   Risk:
   Medium/high due saved package compatibility.

2. Split `combat_updated.js`.

   Why:
   Combat works, but d20/oracle, enemy, audio, and hit detection deserve separate modules.

   Risk:
   Medium.

3. Build reusable actor rig loader.

   Why:
   Same base skeleton, different mesh/posture/breathing/trust-decay/personality is core to the Empyrean direction.

   Risk:
   High but high payoff.

4. Build a formal animation state machine.

   Why:
   Prevents walk/run/jump/guard/swing/idle from fighting through direct joint writes.

   Risk:
   High.

5. Create a real asset manifest.

   Why:
   Moves from "files in assets folder plus strings in code" to trackable game content.

   Risk:
   Medium.

---

## 12. Practical Search Index

Use these anchors when navigating the current code.

### Main Runtime

- `main.js:87` - `APP_VERSION`
- `main.js:655` - scene
- `main.js:659` - camera
- `main.js:808` - renderer
- `main.js:816` - `rigTuning`
- `main.js:818` - `state`
- `main.js:981` - `controlState`
- `main.js:1027` - mouse joint editor state
- `main.js:1501` - `buildSkeletonWorkshop()`
- `main.js:1717` - `createSkeleton()`
- `main.js:1969` - current rig package creation
- `main.js:1985` - package application
- `main.js:2533` - `commitRigCalibration()`
- `main.js:2735` - `getVisibleArmPoseDelta()`
- `main.js:2893` - `applyRelaxedVisiblePose()`
- `main.js:2996` - imported mesh rig completion hook
- `main.js:3152` - `resetSkeletonToBindPose()`
- `main.js:3458` - enter G53
- `main.js:3568` - exit G53
- `main.js:3637` - GUI construction
- `main.js:4636` - main animation loop
- `main.js:4681` - keyboard movement/camera
- `main.js:4793` - skeleton update
- `main.js:5031` - idle motion
- `main.js:5907` - walk motion
- `main.js:6054` - run motion
- `main.js:6722` - combat stance pose
- `main.js:6965` - controlled arms
- `main.js:7256` - camera update
- `main.js:8023` - keydown
- `main.js:8111` - startup pose settle behind title card

### World

- `world.js:30` - `WORLD_TWEAKS`
- `world.js:293` - `worldCollision`
- `world.js:310` - `buildExplorationWorld()`
- `world.js:871` - ghost spheres
- `world.js:1000` - lighting
- `world.js:1046` - movement collision
- `world.js:1075` - room collision resolve
- `world.js:1214+` - encounter runtime/actions
- `world.js:1425+` - world debug

### Skin

- `skin.js:27` - default imported mesh path
- `skin.js:34` - `initSkin()`
- `skin.js:74` - preview mesh
- `skin.js:86` - quick rig
- `skin.js:107` - rig current mesh
- `skin.js:572+` - generated bone/skin binding area
- `skin.js:850` - per-frame skin sync

### Combat

- `combat_updated.js:84` - combat config
- `combat_updated.js:222` - private combat state
- `combat_updated.js:271` - init combat encounter
- `combat_updated.js:338` - update combat encounter
- `combat_updated.js:396` - G53 combat visibility suppression
- `combat_updated.js:477` - difficulty setter
- `combat_updated.js:510` - sword hit doorway
- `combat_updated.js:1352+` - d20 construction/roll presentation area

### Pure Math

- `physics.js:27` - cycle helper
- `physics.js:60` - jump gravity
- `physics.js:83` - jump launch velocity
- `physics.js:98` - jump state update
- `combatPhysics.js:23` - stance names
- `combatPhysics.js:28` - low guard profile
- `combatPhysics.js:70` - combined center of mass
- `combatPhysics.js:114` - support box

---

## Final Read

The project is not broken. It is alive, and it grew honestly from experiment to game. The main risk now is not that systems do not work; it is that too many working systems still live in one place and use shared state words that used to mean one thing and now mean three.

The most important cleanup principle:

Rig calibration is the machine setup. Visible pose is the performed motion. Puppet workshop is the setup cart. Gameplay is the show.

Keep those separate, and Empyrean can keep getting larger without becoming unknowable.
