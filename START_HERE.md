# Start Here

This is the shortest map for coming back to Empyrean after a break.

## First Three Moves

1. Run a checkpoint:

   ```powershell
   .\checkpoint.ps1
   ```

2. Run a quick verification:

   ```powershell
   .\verify.ps1
   ```

3. Open `index.html` with VS Code Live Server.

If those three things work, the project is in a sane state.

Important rig persistence rule:

- The player default loads from `assets/rigs/player.default.rig.json`.
- Browser `localStorage` is only a scratch shelf.
- Use `Puppet Shop > save named rig + file` or `export selected rig` when a rig matters.

## Current Build

Current build: `0.1.109-alpha`

The project currently has:

- a Three.js exploration world
- four connected rooms
- an outside enclosure
- moon.glb in the sky
- moon.glb keeps its detailed shell, contains a self-lit inner glow sphere, and anchors moonlight direction
- moon-aligned directional light prepared for a future day/night sky path
- background audio
- EMPYREAN stone title card loader
- puppet skeleton
- mesh import and generated rigging
- project-owned default player rig at `assets/rigs/player.default.rig.json`
- guided Rigging Wizard opened by `F2`
- Rig Mesh Mode
- Puppet Shop named reusable rig packages
- Puppet Shop file export/import for selected rigs and whole rig libraries
- World Debug collision overlays
- encounter trigger zones
- cathedral replacement Pass 0: active encounters parked outside the room/church work area
- sword combat prototype
- actual rough-stone numbered 3D d20 for combat rolls
- post-rig T/A reference arms visibly returning to relaxed gameplay rest without resetting rig calibration
- G53 exit commits rig point calibration before applying relaxed visible arms
- relaxed-arm backups reject polluted T/A shoulder data
- startup explicitly applies visible relaxed/down arm pose
- enemy health bar and difficulty setting
- TEMP devProbe coordinate marker
- Skeleton Lab guide opacity slider
- G53-style machine-home rigging mode shell
- G53 visibility fixture for uncluttered pivot tuning
- G53 combat visual suppression
- G53 X/Y/Z axis locks for precision joint dragging
- G53 hold-child-points mode for less rigid pivot fitting
- G53 pose freeze that disables arm/jump/relaxation solvers while rigging
- capture-phase F2 hotkey recovery after local mesh loading
- cold-start-safe G53 entry and recovery
- bind-pose-aware generated skin side selection
- Sigewynn default temp mesh and plainSword combat prop
- post-rig visible arm relaxation after preview rigging
- named arm pose resolver for easier stance/swing edits
- T/A reference compensation for returning visibly relaxed without losing calibration
- Sword Offsets GUI for tuning/reloading the weapon prop without code edits
- combatPhysics.js math module for center of mass, base of support, stability margin, and tipping angle
- Low Guard stance on sword draw
- Shift+W running cycle with tunable stride, bounce, lean, and arm pump
- neutral body/knee facing correction so `rightPalm` reads as anatomical right and lower legs/feet face correctly
- stone room floors remain, while legacy room walls/ceilings/torches are render-suppressed behind the cathedral shell
- four-room stone block footprint: nominal `48 x 48 x 24` scene units, or `48.1 x 48.1 x 24.1` including the current `0.1` wall/floor/ceiling thickness
- Cathedral_lowPoly2.glb visual shell loaded around the four-room block with temporary calibration constants
- expanded outside enclosure: `384 x 384 x 36` scene units, centered on gameplay `X0/Z0`
- cave.glb rough-draft world prop at `X20/Z-90` with simple proxy rectangle colliders
- seeded outside landmark scatter using extra trees, dead trees, rocks, skulls, and campfires
- alternating tree.glb/deadTree.glb props outside
- solo workflow docs
- checkpoint and verify scripts

## Most Useful Files

Use these first:

```text
README.md
SOLO_WORKFLOW.md
WORLD_COOKBOOK.md
ENCOUNTERS.md
NEXT_STEPS.md
```

Use these when editing code:

```text
main.js
physics.js
combatPhysics.js
puppetShop.js
rig.js
encounters.js
combat_updated.js
styles.css
index.html
```

Use these scripts before and after experiments:

```text
checkpoint.ps1
verify.ps1
```

## Best Solo Task Right Now

Turn on:

```text
World Debug > world debug
World Debug > encounter zones
```

Then walk through the world and decide:

- where trees feel good
- where door triggers should live
- where audio should change
- whether the outside space is too large or too small

This gives you design information without needing to touch complicated rig code.

## Best Rig Task Right Now

Press:

```text
F2
```

Recommended flow:

1. Press `F2`; the Rigging Wizard opens and starts G53 alignment mode.
2. Choose a `.glb` file. The wizard saves an `assets/name.glb` path, so make sure reusable NPC/enemy meshes live in `assets/`.
3. Pick `Current`, `A Pose`, or `T Pose`; the wizard applies the bind/reference pose immediately.
4. Tune pivots with mouse joint editing, G53 axis locks, and Joint Point Offset sliders.
5. Click `4 rig`; preview rigging commits your pivot setup and relaxes visible gameplay arms after binding.
6. Use the wizard test buttons for idle, walk, run, jump, draw sword, and swing.
7. Set a rig name in `Puppet Shop`, then click `6 save named rig` in the wizard.

## Good 15-Minute Tasks

- Move the moon with `WORLD_TWEAKS.skyMoon.position` in `world.js`.
- Add one tree position in `buildLowPolyTrees`.
- Add one encounter in `encounters.js`.
- Tune camera distance in `SOLO_TWEAKS.camera`.
- Turn on World Debug and screenshot the collision layout for yourself.
- Export a rig package from the GUI after a good tuning pass.
- Save a named rig in `Puppet Shop` after a good pivot/motion pass.
- Open `Combat`, set difficulty, press `1`, and test whether the sword scale/hand angle feels right.
- Press `1` while standing still and check whether Low Guard reads as grounded instead of stiff.
- Hold `Shift + W` in a clear space and tune `Motion > run stride`, `run foot lift`, and `run bounce` by eye.
- Use `Sword Offsets` to tune `plainSword.glb` position, length, grip point, grip trim X/Y/Z, pitch, yaw, and roll live.
- Use `Sword Offsets > save preset` / `load preset` to preserve weapon-only setups without saving the entire rig.
- Use `Mesh > relax visible arms` if a test pose or old saved arm command leaves the arms raised after rigging.
- Press `Y`, move `devProbe`, and copy rig-local values for sword or hitbox experiments.
- Press `F2`, use the Rigging Wizard to tune a pivot at machine home, then close the wizard to confirm gameplay restores cleanly.

## Save These For A Longer Session

- lasso mouth/eye regions
- better mesh skinning
- multiplayer presence
- room editor UI
- animation timeline
- DM tools

Those are good ideas, just bigger than a quick solo edit.
