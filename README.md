# Empyrean Puppet Workshop

Clean skeleton workshop extracted from the avatar STL project.

## Version

- Empyrean build: `0.1.21-alpha`
- Three.js: `0.164.1`
- lil-gui: `0.19`

## What This Is

This project began as a clean skeleton workshop and is now becoming the exploration/rigging lab for Empyrean:

- three connected Three.js rooms plus an outside enclosure
- full puppet skeleton
- joint markers and labels
- local axis marker
- low-poly tree colliders outside
- floating ghostly wireframe spheres
- wide proportion sliders
- per-joint X/Y/Z point offsets
- per-joint bind-pose rotation controls
- idle and walk preview motion
- jump physics and crouch/landing pose response
- simple rig footprint collision against the room walls
- GLB import with generated skin weights for the Empyrean puppet skeleton
- separate render, adjust, rig workflow for imported meshes
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
- combat encounter prototype with enemy GLB, battle audio, dice roll, hitbox, and evasion

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
                      battle.mp3 crossfade, d20 roll, and simple evasion

physics.js          ← the math reference binder
                      pure formulas only — jump gravity, launch velocity,
                      jump state machine, pose weights, walk phase shaping,
                      smoothstep, clamp. No scene objects, no GUI, just math.
                      main.js calls these like looking up a formula in a book.

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
    ├── imports from physics.js (jump + walk math)
    ├── imports from rig.js     (body dimensions)
    └── imports from encounters.js (trigger zone definitions)

world.js
    └── imports from three only

skin.js
    ├── imports from three
    └── imports disposeObjectTree from world.js

physics.js
    └── no imports (pure math)

rig.js
    └── no imports (pure data)

encounters.js
    └── no imports (pure data)
```

The rule: nothing imports from main.js. main.js is the only thing that pulls everything together. If world.js or skin.js needed something from main.js, that would be a circular dependency — like a parts station trying to call the floor supervisor to ask for a part the floor supervisor asked the parts station to make in the first place. Instead, main.js passes what each station needs as a parameter when it calls them.

Combat follows the same station rule. `main.js` imports `combat_updated.js`, calls `initCombatEncounter()` once during startup, and calls `updateCombatEncounter(delta)` once per animation frame. `combat_updated.js` owns its own trigger, enemy GLB fitting, hitbox, d20, battle audio, and evasion state.

### Where to Make Common Changes

| You want to change... | Go to... |
|---|---|
| Movement speed, camera feel, colors, audio | `SOLO_TWEAKS` near the top of `main.js` |
| Room size, wall colors, ghost sphere count | `WORLD_TWEAKS` near the top of `world.js` |
| Default body proportions | `DEFAULT_RIG_DIMENSIONS` in `rig.js` |
| Trigger zones (enter/exit events) | `encounters.js` |
| Enemy combat prototype | `combat_updated.js` |
| Jump feel (gravity, height, duration) | `rigTuning` values in the GUI, or `getJumpGravityValue` in `physics.js` |
| Walk cycle timing | `walkPhaseSpeed` in `SOLO_TWEAKS`, walk amplitude sliders in GUI |

---

## Change Notes

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
- `A` / `D`: turn.
- `Arrow Left` / `Arrow Right`: orbit camera.
- `Arrow Up` / `Arrow Down`: zoom camera.
- `Page Up` / `Page Down`: raise/lower camera.
- `Z`: toggle left arm up.
- `X`: toggle right arm up.
- `H`: toggle both hands half high.
- `J`: jump.
- `Space`: wave both arms.
- `R`: toggle skeleton lab.
- `L`: toggle joint labels.

## Notes

Tuning saves in browser `localStorage` under:

```text
empyrean.puppetWorkshop.rigTuning.v1
```

Use `Rig Save > copy/log JSON` to copy a portable tuning snapshot into the console/clipboard.

Use `Mesh Import / Export > 1 render mesh` to load `assets/femaleMesh.glb` as a static reference. After placing pivots, use `Mesh Import / Export > 2 rig rendered mesh` to generate skin weights and drive the GLB from the visible Empyrean puppet rig. `export rig package` copies/logs both the rig tuning and imported mesh binding settings.

Use `Bind Pose Rotations > female GLB A-pose` before or after loading the mesh to rotate the rest pose closer to the GLB's arms-out modeling pose. The bind-pose rotation sliders are in radians and are saved/exported with the rest of the rig tuning.

New mesh workflow:

1. `Mesh Import / Export > 1 render mesh`
2. Adjust `Rig Dimensions`, `Joint Point Offsets`, and `Bind Pose Rotations` while the mesh is only a static reference.
3. `Mesh Import / Export > 2 rig rendered mesh`

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

The loading overlay remains in `index.html` and is still revealed by the loader logic in `main.js`.

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

The page shell is `index.html`. It loads Three.js and lil-gui through the import map, keeps your loading overlay in place, and starts `main.js` as a JavaScript module. The overlay is hidden by the loader helper near the top of `main.js` after the browser has had a moment to draw the scene.

Collision is separate from visible geometry. Wall and door blocking shapes are stored as top-down rectangles in `worldCollision.solidRects`. Trees are stored as circles in `worldCollision.solidCircles`. The avatar has a circular floor footprint. Movement tries the intended step, resolves it against rectangles/circles, then falls back to X-only and Z-only movement for simple wall sliding.

The skeleton is a hierarchy of `THREE.Group` objects. Each group is a pivot point. Parent joints carry child joints, so moving the pelvis carries the legs, moving the chest carries the neck/head/arms, and so on. Debug markers, labels, and bone lines are attached to those joints so they follow the skeleton automatically.

Rig tuning is saved in `rigTuning`. The important idea is that sliders, mouse point editing, save/load, and export/import all talk to the same data. Mouse dragging a joint marker updates `Joint Point Offsets`; it does not invent a second hidden rig system.

Imported meshes use a generated skin. The GLB is loaded, centered, scaled, optionally rotated, and then given generated `skinIndex` and `skinWeight` attributes. Empyrean creates real `THREE.Bone` objects that mirror the visible puppet joints. Every frame, the generated bones copy the puppet joint transforms, which is how the imported mesh follows the workshop skeleton.

Rig Mesh Mode is a GUI organization layer. It does not replace the rigging functions. It groups the render, start-pose, rig, rerig, clear, export, and import actions into one focused folder and hides duplicate manual folders while active.

World Debug is also visual only. It draws the invisible collision and encounter shapes so you can place things by sight. Turning it on does not change movement or collision.

Encounters live in `encounters.js`. They are non-blocking trigger zones, either circles or rectangles. When the avatar footprint enters or exits one, `world.js` runs the listed actions, such as changing audio, logging a message, or changing Jupiter's tint/scale.

The safest solo rhythm is:

1. Run `.\checkpoint.ps1`.
2. Make one small change.
3. Run `.\verify.ps1`.
4. Check it in Live Server.
5. Keep going only if that change behaved.

## Physics And Rig Modules

`physics.js` is the body-mechanics subroutine file. It currently owns pure formulas for jump gravity, jump launch velocity, jump state updates, jump pose weights, walk-cycle phase shaping, `smoothstep`, `cycle01`, and `clamp01`.

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
