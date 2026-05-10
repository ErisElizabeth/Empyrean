# Empyrean Puppet Workshop

Clean skeleton workshop extracted from the avatar STL project.

## Version

- Empyrean build: `0.1.12-alpha`
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

## Change Notes

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

The main world, rig, animation, import, camera, and GUI systems live in `main.js`. The top of that file has `SOLO_TWEAKS`, which is the safest first place to change colors, world size, camera feel, movement speed, Jupiter placement, audio settings, and ghost sphere count.

The visible world is primitive geometry. Rooms are boxes. Doorways are made by splitting walls into left/right blocking pieces plus a top visual header. Trees are cones plus cylinders. Jupiter is a textured sphere. The ghost spheres are wireframe sphere meshes with a second faint glow sphere around each one.

Collision is separate from visible geometry. Wall and door blocking shapes are stored as top-down rectangles in `worldCollision.solidRects`. Trees are stored as circles in `worldCollision.solidCircles`. The avatar has a circular floor footprint. Movement tries the intended step, resolves it against rectangles/circles, then falls back to X-only and Z-only movement for simple wall sliding.

The skeleton is a hierarchy of `THREE.Group` objects. Each group is a pivot point. Parent joints carry child joints, so moving the pelvis carries the legs, moving the chest carries the neck/head/arms, and so on. Debug markers, labels, and bone lines are attached to those joints so they follow the skeleton automatically.

Rig tuning is saved in `rigTuning`. The important idea is that sliders, mouse point editing, save/load, and export/import all talk to the same data. Mouse dragging a joint marker updates `Joint Point Offsets`; it does not invent a second hidden rig system.

Imported meshes use a generated skin. The GLB is loaded, centered, scaled, optionally rotated, and then given generated `skinIndex` and `skinWeight` attributes. Empyrean creates real `THREE.Bone` objects that mirror the visible puppet joints. Every frame, the generated bones copy the puppet joint transforms, which is how the imported mesh follows the workshop skeleton.

Rig Mesh Mode is a GUI organization layer. It does not replace the rigging functions. It groups the render, start-pose, rig, rerig, clear, export, and import actions into one focused folder and hides duplicate manual folders while active.

World Debug is also visual only. It draws the invisible collision and encounter shapes so you can place things by sight. Turning it on does not change movement or collision.

Encounters live in `encounters.js`. They are non-blocking trigger zones, either circles or rectangles. When the avatar footprint enters or exits one, `main.js` runs the listed actions, such as changing audio, logging a message, or changing Jupiter's tint/scale.

The safest solo rhythm is:

1. Run `.\checkpoint.ps1`.
2. Make one small change.
3. Run `.\verify.ps1`.
4. Check it in Live Server.
5. Keep going only if that change behaved.

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
