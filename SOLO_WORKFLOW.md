# Empyrean Solo Workflow

This is the "help me keep building when Codex is not here" guide.

The goal is not to explain every line of code. The goal is to help you make safe, useful changes without needing to re-derive the whole project each time.

## First Rule: Make Checkpoints

Before any meaningful experiment, run:

```powershell
.\checkpoint.ps1
```

That script copies the whole `Empyrean` folder to your Desktop with a timestamp.

Use it before:

- changing rig dimensions
- moving many joint pivots
- adding a new world object
- adding new imported assets
- editing collision logic
- experimenting with animation math

If an experiment breaks the scene, you can open the checkpoint folder and compare the last known good version.

## Normal Run Loop

1. Open `C:\Users\S. Jones\Desktop\Empyrean` in VS Code.
2. Start Live Server on `index.html`.
3. Keep the browser console open.
4. Edit one small thing.
5. Save.
6. Refresh.
7. If it worked, keep going.
8. If it broke, undo that small thing.

Small changes are the secret weapon. Big mystery edits create big mystery bugs.

## Where Things Live

Main app logic:

```text
main.js
```

Page shell and import map:

```text
index.html
```

Fullscreen canvas, loader overlay, GUI styling:

```text
styles.css
```

Images, GLB meshes, audio, texture maps:

```text
assets/
```

Project overview and version notes:

```text
README.md
```

Copy/paste world-building recipes:

```text
WORLD_COOKBOOK.md
```

Encounter trigger guide:

```text
ENCOUNTERS.md
```

Low-guidance next tasks:

```text
NEXT_STEPS.md
```

## The Safest Place To Tweak

Open `main.js` and look near the top for:

```js
const SOLO_TWEAKS = {
```

That object is the friendly control panel inside the code.

Good solo edits there:

- make the outside area bigger
- change wall colors
- change floor color
- change ghost sphere count
- move the sky moon
- resize the sky moon
- change camera starting distance
- change movement speed
- change the tree collider radius

After changing values in `SOLO_TWEAKS`, refresh Live Server.

## What Not To Edit First

Avoid these unless you are intentionally doing a code session:

- generated skin weight functions
- collision resolver internals
- skeleton hierarchy parent/child calls
- render loop order
- GLTF loading callback structure

Those areas are commented, but they are more connected. A tiny change there can affect several systems.

## Mental Model Of The App

Empyrean currently has four layers:

1. World geometry
   - Rooms, outside enclosure, trees, sky moon, ghost spheres.

2. Collision map
   - Invisible top-down rectangles and circles that block the rig.

3. Puppet skeleton
   - THREE.Group pivots arranged like bones.

4. Imported mesh skin
   - A GLB can be fitted to the puppet, then driven by generated Three.js bones.

The key idea:

Visible geometry and collision are separate.

A wall mesh makes the wall visible.

A collision rectangle makes the wall block movement.

A tree mesh makes a tree visible.

A collision circle makes the tree block movement.

## Rig Tuning Solo Loop

Use this when you are matching a mesh to the skeleton.

1. Run a checkpoint.
2. Click `Mesh Import / Export > 1 render mesh`.
3. Turn on joint labels if they help.
4. Use `Rig Dimensions` for large body proportions.
5. Use `Joint Point Offsets` for exact pivot placement.
6. Use `Bind Pose Rotations` if the mesh is modeled in an A-pose or odd rest pose.
7. Click `Mesh Import / Export > 2 rig rendered mesh`.
8. Test idle, walk, jump, and arms.
9. Save tuning if it is good.

## World Building Solo Loop

Use this when adding places to explore.

1. Run a checkpoint.
2. Add visual object.
3. Refresh and confirm it appears.
4. Add collision only if the avatar should bump into it.
5. Test walking around it from several angles.
6. Add a short comment saying what the object is for.
7. Add a note to README if it becomes part of the build.

## Encounter Building Solo Loop

Use this when you want an area to do something as the avatar enters or leaves.

1. Run a checkpoint.
2. Open `encounters.js`.
3. Copy the disabled template.
4. Give the copy a unique `id`.
5. Start with only a `log` action.
6. Turn on `World Debug > world debug`.
7. Turn on `World Debug > encounter zones`.
8. Walk into the zone and confirm it highlights.
9. Add audio or sky-moon actions only after the shape feels right.

Encounters are triggers, not walls. If you want the avatar blocked, add a real collider in `main.js`.

## If The Screen Goes Black

Check these first:

1. Browser console error line number.
2. Did you forget a comma inside `SOLO_TWEAKS`?
3. Did you leave a bracket or parenthesis open?
4. Did an asset path typo happen?
5. Did Live Server cache the old file? Hard refresh.

Then run:

```powershell
node --check main.js
```

If `node --check` reports a line number, go there first. It catches syntax errors before the browser tries to run the app.

## If The Rig Disappears

Likely causes:

- `labEnabled` or visibility toggles are off.
- `rootOffsetY` moved it above or below the camera.
- camera distance/height changed too much.
- a mesh opacity setting is too low.
- imported mesh path failed and the preview was cleared.

Recovery:

1. Press `R` to toggle the skeleton lab.
2. Press `L` to toggle labels.
3. Use GUI `Rig Save > reset defaults` if needed.
4. Reload a saved tuning only after you know the scene itself is working.

## If Movement Gets Weird

Check:

- `SOLO_TWEAKS.player.moveSpeed`
- `SOLO_TWEAKS.player.collisionMargin`
- `Motion > collider radius`
- tree positions and tree collider radius
- doorWidth if the rig catches on door frames

Movement is simple by design:

- try full movement
- if blocked, try X-only
- then try Z-only

That is what creates the slide-along-wall feel.

## If Audio Does Not Play

That is probably browser autoplay protection.

Click or press a key in the page and refresh. The code catches autoplay failures so they do not look like scary project errors.

## Good Solo Session Shape

Use one session for one goal:

- "Tonight I am placing trees."
- "Tonight I am tuning the walk."
- "Tonight I am moving the sky moon and sky objects."
- "Tonight I am fitting the mesh shoulders."

That keeps your checkpoints meaningful.
