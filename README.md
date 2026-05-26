# Empyrean Puppet Workshop

Clean skeleton workshop extracted from the avatar STL project.

## Version

- Empyrean build: `0.1.45-alpha`
- Three.js: `0.164.1`
- lil-gui: `0.19`

## What This Is

This project began as a clean skeleton workshop and is now becoming the exploration/rigging lab for Empyrean:

- three connected Three.js rooms plus an outside enclosure
- full puppet skeleton
- joint markers and labels
- local axis marker
- GLB tree and dead-tree props with existing tree colliders outside
- floating ghostly wireframe spheres
- wide proportion sliders
- per-joint X/Y/Z point offsets
- per-joint bind-pose rotation controls
- idle and walk preview motion
- Shift+W running cycle with flight, lean, hip/shoulder counter-twist, and bent-elbow arm pump
- jump physics and crouch/landing pose response
- simple rig footprint collision against the room walls
- GLB import with generated skin weights for the Empyrean puppet skeleton
- separate render, adjust, rig workflow for imported meshes
- Puppet Shop module and GUI for named reusable complete rig packages
- keyboard movement and arm pose controls
- mouse wheel camera zoom
- browser save/load/export for tuning
- solo-builder docs and checkpoint helper
- world collision debug overlay
- data-driven encounter trigger zones
- focused rig mesh mode
- start-here runbook and verification helper
- mouse drag joint point editing
- first physics and rig module split
- 5% opacity default-height wireframe disk
- combat encounter prototype with enemy GLB, battle audio, dice roll, hitbox, evasion, health bar, and right-hand sword attacks
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
- Sigewynn default temp mesh, plainSword combat prop, post-rig gameplay arm restore, and a named arm pose resolver for easier stance/swing work
- relaxed-arm snapshot restore so T/A rigging poses do not become permanent gameplay poses
- saved `Sword Offsets` GUI controls for sword path, length, grip, position, pitch, yaw, and roll
- pure combat balance math module and Low Guard stance on sword draw
- neutral body/knee facing correction so anatomical right/left and foot direction read correctly while the related Y bind-rotation sliders read zero
- Empyrean room aesthetic pass with stone floor/wall textures, 80% room walls, dim torch props, and warm torch light sources
- moon.glb sky focal point replacing the old Jupiter sphere
- EMPYREAN stone-engraved title card with animated gradient and delayed reveal

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
                      ghost spheres, lighting), owns the collision data,
                      resolves wall/tree collisions, runs the encounter system,
                      draws the debug overlay

skin.js             ← the mesh-fitting station
                      handles everything about the imported GLB mesh:
                      loading it, previewing it, generating the skin weights
                      that let it follow the puppet skeleton, and cleaning
                      up after itself

combat_updated.js   <- the encounter prototype station
                      owns the combat trigger, enemy.glb loader/fit, hitbox,
                      battle.mp3 crossfade, d20 roll, simple evasion,
                      health, hiding, and sword-hit validation

combatPhysics.js    <- the combat math station
                      pure formulas only: base of support, combined center of
                      mass, stability margin, critical tipping angle, and
                      named stance profiles such as Low Guard. No scene
                      objects, no GUI, no animation frame side effects.

physics.js          ← the math reference binder
                      pure formulas only — jump gravity, launch velocity,
                      jump state machine, pose weights, walk/run phase shaping,
                      smoothstep, clamp. No scene objects, no GUI, just math.
                      main.js calls these like looking up a formula in a book.

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

Combat follows the same station rule. `main.js` imports `combat_updated.js`, calls `initCombatEncounter()` once during startup, calls `updateCombatEncounter(delta)` once per animation frame, and calls `attemptCombatSwordHit()` only when the player swings. `main.js` owns the sword model and arm pose. `combat_updated.js` owns trigger state, enemy GLB fitting, hitbox, d20, battle audio, evasion, health, hiding, and victory. `combatPhysics.js` owns the readable balance formulas and stance profiles, while `main.js` converts the live Three.js joint positions into the root-local numbers those formulas need.

### Where to Make Common Changes

| You want to change... | Go to... |
|---|---|
| Movement speed, camera feel, colors, audio | `SOLO_TWEAKS` near the top of `main.js` |
| Sword asset path, scale, grip origin, hand offset, pitch/yaw/roll | `Sword Offsets` in the GUI |
| Sword default values, swing timing, hit range | `SWORD_TWEAKS` near the top of `main.js` |
| Arm stances and sword swing rotations | `getControlledArmPoseTargets()` in `main.js` |
| Combat balance formulas or Low Guard body/leg stance | `combatPhysics.js` |
| Neutral anatomical facing correction | `RIG_BASE_BODY_YAW` near the top of `main.js` |
| Complete rig package shape or local rig-library behavior | `puppetShop.js` |
| Room size, wall colors, ghost sphere count | `WORLD_TWEAKS` near the top of `world.js` |
| Default body proportions | `DEFAULT_RIG_DIMENSIONS` in `rig.js` |
| Trigger zones (enter/exit events) | `encounters.js` |
| Enemy combat prototype | `combat_updated.js` |
| Jump feel (gravity, height, duration) | `rigTuning` values in the GUI, or `getJumpGravityValue` in `physics.js` |
| Walk cycle timing | `walkPhaseSpeed` in `SOLO_TWEAKS`, walk amplitude sliders in GUI |
| Run cycle timing/feel | `runSpeed` / `runPhaseSpeed` in `SOLO_TWEAKS`, run sliders in `Motion` |

---

## Change Notes

- `0.1.45-alpha`: Fixed lower-leg orientation reverting after rigging or startup by changing `dampJointRotation()` to layer animation deltas onto the full `bindLocalQuaternion` instead of only the visible bind Euler sliders, preserving the neutral-zero knee/body fixture rotations through walk, idle, rigging exit, and title-card reveal.
- `0.1.44-alpha`: Replaced the startup spinner with an EMPYREAN Caesar Dressing stone-engraved title card, added subtle animated text/background gradients, moved loader reveal to the end of startup, and added a startup pose settle pass so leg realignment happens behind the title card.
- `0.1.43-alpha`: Added the first Puppet Shop architecture boundary with new `puppetShop.js`, named complete rig packages, local rig-library save/load/delete/list controls, package copy/paste compatibility, and docs for separating reusable puppet rigs from gameplay.
- `0.1.42-alpha`: Added a first running cycle from `runCycle.md`: hold `Shift + W` to run with faster travel/turnover, run-specific stride/foot-lift/bounce/lean sliders, pelvis flight bounce, hip/shoulder counter-twist, and bent-elbow arm pumping while preserving the existing walk cycle.
- `0.1.41-alpha`: Replaced the outside primitive trees with alternating `tree.glb` and `deadTree.glb` props while keeping the existing circular tree colliders, and replaced the old Jupiter sphere with `moon.glb` at about half the previous visual size and 15% lower on Y.
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
- `0.1.25-alpha`: Added Pass 2 of G53 rigging mode: tagged world geometry for rigging visibility, hid walls/ceilings/trees/ghost spheres/Jupiter during G53 mode, kept floors as faint reference planes, and restored original visibility/material state on exit.
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
- `0.1.9-alpha`: Added World Debug collision/trigger overlays and a data-driven `encounters.js` module for non-blocking trigger zones that can run actions such as audio changes, console messages, and Jupiter visual changes.
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
- `J`: jump.
- `Space`: wave both arms.
- `1`: equip `assets/plainSword.glb` in the right hand and enter combat stance.
- `2`: despawn the sword and return arms to idle.
- `Enter`: swing the sword and attempt a combat hit.
- `F2`: toggle G53-style machine-home rigging mode.
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

## G53 Rigging Mode

This is the machine-home rigging workflow. It is a temporary setup mode, not gameplay.

Step-by-step:

1. Load a mesh preview with `Mesh > 1 preview`.
2. Press `F2`, or open `G53 Rigging Mode > enter / home`.
3. The rig moves to home position `X0 Z0` and `yaw 0`.
4. Idle motion and walk preview turn off.
5. Player movement/turning is locked, but camera orbit/zoom/height still works.
6. Walls, ceilings, trees, ghost spheres, and Jupiter hide.
7. Floors remain as faint reference planes.
8. Combat trigger/hitbox/d20 visuals hide.
9. Mouse joint point editing turns on.
10. Use `G53 Rigging Mode > allow X`, `allow Y`, and `allow Z` to choose which axes can move during mouse dragging.
11. Leave `G53 Rigging Mode > hold child points` enabled when you want already-placed limb points to stay put while moving their parent.
12. Adjust pivots using the existing joint tools.
13. Click `Mesh > 2 rig mesh`; if a preview is loaded, it rigs the mesh and restores gameplay state.
14. Press `F2` again any time to exit/restore without undoing your pivot edits.

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

Tuning saves in browser `localStorage` under:

```text
empyrean.puppetWorkshop.rigTuning.v1
```

Use `Rig Save > copy/log JSON` to copy a portable tuning snapshot into the console/clipboard.

Use `Mesh > 1 preview` to load `assets/Sigewynn.glb` as the current default static reference. After placing pivots, use `Mesh > 2 rig mesh` to generate skin weights and drive the GLB from the visible Empyrean puppet rig. `export rig package` copies/logs both the rig tuning and imported mesh binding settings.

If a GLB is facing backward, prefer `Mesh > Transform > rot Y` for the whole-model turn. That rotates the imported geometry before weights are generated. `Bind Pose Rotations` are best used for joint rest-pose alignment, such as lifting shoulders into an A-pose or T-pose.

Use `Mesh > start pose` plus `Mesh > apply start pose` before rigging when the source mesh is modeled in A-pose or T-pose. The bind-pose rotation sliders are in radians and are saved/exported with the rest of the rig tuning.

After a preview rig, `Mesh > 2 rig mesh` automatically restores the arm bind rotations to the relaxed gameplay rest. Formula:

```text
relaxed arm rest    = arm bind rotations captured before A/T start pose
generated skin bind = mesh modeling pose at skinnedMesh.bind(skeleton)
live puppet arms    = relaxed arm rest + animation pose deltas
```

That keeps a T-posed mesh bindable without leaving the gameplay arms stuck in T-pose. The manual `Mesh > restore gameplay arms` button runs the same arm-only restore if you need it after an experimental binding pass. It also clears active arm commands and stows the sword so an old `up`, `half`, `combat`, or `swing` state does not immediately raise the arms again.

New mesh workflow:

1. `Mesh > 1 preview`
2. Adjust `Rig Dimensions`, `Joint Point Offsets`, and `Bind Pose Rotations` while the mesh is only a static reference.
3. `Mesh > 2 rig mesh`

Use the mouse wheel over the scene to zoom the camera in and out while placing pivots.

## Solo Builder Files

- `SOLO_WORKFLOW.md`: safe solo development loop, recovery notes, where systems live, and how to work in small reversible steps.
- `START_HERE.md`: shortest return-to-project map for the next session.
- `WORLD_COOKBOOK.md`: copy/paste recipes for boxes, props, trees, colliders, sky objects, Jupiter changes, and room additions.
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

Encounters are non-blocking. They do not stop movement. They can run actions when the avatar enters or exits a circle or rectangle, such as changing audio volume/playback rate, logging a message, or changing Jupiter's tint/scale.

The title-card overlay remains in `index.html` and is revealed/hidden by the loader logic in `main.js`.

## Rig Mesh Mode

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
joint.parent.worldToLocal(dragCurrentParentLocal)
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

| Landmark | Height (scene units) | Ratio of total height |
|----------|---------------------|-----------------------|
| Head pivot | 4.0586 | 91% |
| Neck pivot | 3.7464 | 84% |
| Chest pivot | 3.2112 | 72% |
| Torso (spine base) pivot | 2.6760 | 60% |
| Pelvis pivot | 2.2300 | 50% |
| Shoulder width (half) | 0.8474 | 19% |
| Hip width (half) | 0.4014 | 9% |
| Upper arm length | 0.8474 | 19% |
| Forearm length | 0.7582 | 17% |
| Thigh length | 1.0927 | 24.5% |
| Shin length | 1.0927 | 24.5% |

**Derived floor positions (with no offsets, root at Y=0):**

| Joint | World Y |
|-------|---------|
| Pelvis | 2.2300 |
| Hip joint (L/R) | 2.2300 (hip X-offset only) |
| Knee | 1.1373 (pelvis − thigh) |
| Ankle | 0.0446 (knee − shin) |
| Foot pivot | −0.0354 (ankle − 0.08) |

The foot pivot sits a small amount below the floor surface. This is intentional — the foot joint is a pivot at the ankle/heel region, not the sole of the foot. When a mesh is attached, the mesh geometry extends below the pivot to the actual ground contact.

The proportions are deliberately permissive. The GUI sliders allow every dimension to be stretched well beyond realistic human ranges to accommodate stylized meshes, long-limbed creatures, or non-human characters. The defaults give a roughly realistic adult humanoid body as a starting point.

---

## Walk Cycle

The walk cycle uses a sine-wave phase to drive all motion. The left leg is offset by `PI` radians from the right leg, so they are always in opposite phases (when one swings forward, the other plants).

**Per-frame quantities computed from the phase:**

| Variable | Formula | Effect |
|----------|---------|--------|
| `leftSwing` | `sin(phase)` | Left leg timing value used by arm counter-swing |
| `rightSwing` | `sin(phase + PI)` | Right leg timing value used by arm counter-swing |
| `pelvisSide` | `-sin(phase)` | Side-to-side weight transfer signal |
| `pelvisStep` | `abs(sin(phase * 2))` | Twice-per-cycle footfall bob signal |
| `pelvisSwayX` | `pelvisSide * hipSway * walkAmplitude` | Pelvis shifts over the planted foot |
| `pelvisBobY` | `pelvisStep * hipBob * walkAmplitude` | Pelvis rises slightly once per footfall |
| `pelvisTiltZ` | `pelvisSide * hipTilt * walkAmplitude` | Pelvis leans around the forward axis |
| `pelvisTwistY` | `pelvisSide * hipTwist * walkAmplitude` | Pelvis twists around the vertical axis |
| `chestCounterSway` | `-pelvisTiltZ * 0.62 + sin(phase * 2 - 0.55) * 0.012` | Chest reacts opposite to hip tilt |
| `headStabilizer` | `pelvisTwistY * 0.45 + sin(phase * 2 - 1.1) * 0.01` | Head counteracts the carrier motion |

**Gait markers per leg** (from `getStepPhase` in `physics.js`):

| Phase range | Name | Description |
|-------------|------|-------------|
| 0.0 → 0.5 | Stance | Foot planted; toe-push ramps in late |
| 0.5 → 1.0 | Swing | Foot off ground; knee lifts via sin curve |

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

| Variable | Formula | Effect |
|----------|---------|--------|
| `phase` | `2 * PI * f_run * t` | One full left/right running cycle |
| `footZ` | `-cos(phase)` | Normalized forward/back foot travel |
| `footTravel` | `footZ * runStrideLength * 0.5 * runAmplitude` | Visible stride span in scene units |
| `footLift` | `max(0, sin(phase)) ^ 0.72 * runFootLift` | Higher recovery lift while the leg swings forward |
| `flightSignal` | soft window at `0.35..0.5` and `0.85..1.0` | Brief airborne lift twice per cycle |
| `bobY` | `springSignal * runBounce * 0.38 + flightSignal * runBounce` | Vertical body bounce without sinking below the floor |
| `leanX` | `-(v / vMax) * runForwardLean` | Forward lean from the ankles/torso direction |
| `hipTwistY` | `sin(phase) * runHipTwist` | Hip yaw |
| `shoulderTwistY` | `-sin(phase) * runShoulderTwist` | Opposite shoulder yaw for balance |
| `armPump` | `-sin(legPhase) * runArmPump` | Same-side arm swings opposite the same-side leg |

The pure formulas live in `physics.js` as `getRunStrideValues()` and `getPelvisRunValues()`. The live puppet application lives in `main.js` as `updateRunMotion()` and `updateLegRun()`. The bent-elbow pumping shape lives in `getControlledArmPoseTargets()` under the `pose === "down" && controlState.isRunning` branch.

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
5. The matching `Joint Point Offsets` values update.

This is intentionally a simple camera-facing drag plane, not a full transform gizmo. The sliders remain the source of truth, so saved/exported rig tuning still works.

## How This Is Put Together

Empyrean is currently built as one browser app with a few clear layers.

The page shell is `index.html`. It loads Three.js and lil-gui through the import map, keeps your loading overlay in place, loads the Caesar Dressing title font, and starts `main.js` as a JavaScript module. The overlay is now an EMPYREAN stone-engraved title card. It is hidden by the loader helper at the end of startup after the skeleton has been built, the startup pose has been settled, and several animation frames have passed behind the title card.

Collision is separate from visible geometry. Wall and door blocking shapes are stored as top-down rectangles in `worldCollision.solidRects`. Trees are stored as circles in `worldCollision.solidCircles`. The avatar has a circular floor footprint. Movement tries the intended step, resolves it against rectangles/circles, then falls back to X-only and Z-only movement for simple wall sliding.

The skeleton is a hierarchy of `THREE.Group` objects. Each group is a pivot point. Parent joints carry child joints, so moving the pelvis carries the legs, moving the chest carries the neck/head/arms, and so on. Debug markers, labels, and bone lines are attached to those joints so they follow the skeleton automatically.

Rig tuning is saved in `rigTuning`. The important idea is that sliders, mouse point editing, save/load, and export/import all talk to the same data. Mouse dragging a joint marker updates `Joint Point Offsets`; it does not invent a second hidden rig system.

Imported meshes use a generated skin. The GLB is loaded, centered, scaled, optionally rotated, and then given generated `skinIndex` and `skinWeight` attributes. Empyrean creates real `THREE.Bone` objects that mirror the visible puppet joints. Every frame, the generated bones copy the puppet joint transforms, which is how the imported mesh follows the workshop skeleton.

Rig Mesh Mode is a GUI organization layer. It does not replace the rigging functions. It groups the render, start-pose, rig, rerig, clear, export, and import actions into one focused folder and hides duplicate manual folders while active.

Puppet Shop is the reusable rig layer. It does not move the player, run combat, or solve collisions. It packages the current rig as an actor-ready setup: full `rigTuning`, joint point offsets, bind rotations, mesh transform, motion sliders, sword/dev attachment offsets, name, and notes. The `Puppet Shop` GUI folder can save that complete package into browser localStorage by name, load it later, delete it, list saved rigs, or copy/paste the JSON package. This is the first step toward using the same rigging skeleton for player bodies, NPCs, enemies, and deliberately "almost human" variants.

World Debug is also visual only. It draws the invisible collision and encounter shapes so you can place things by sight. Turning it on does not change movement or collision.

Encounters live in `encounters.js`. They are non-blocking trigger zones, either circles or rectangles. When the avatar footprint enters or exits one, `world.js` runs the listed actions, such as changing audio, logging a message, or changing Jupiter's tint/scale.

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
- Wired common world, player, camera, ghost sphere, tree, Jupiter, and audio values through `SOLO_TWEAKS`.
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
- Added action support for console logs, background audio changes, Jupiter color changes, and Jupiter scale changes.
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
- Entering G53 mode hides trees, ghost spheres, and Jupiter.
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
- Replaced the old procedural Jupiter sphere with `assets/moon.glb`.
- Set the moon to about half the old Jupiter visual diameter and 15% lower on the Y axis.
- Kept the old internal `jupiter` scene-reference name so existing G53 and encounter plumbing still works.

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
