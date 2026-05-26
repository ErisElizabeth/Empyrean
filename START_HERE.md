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

## Current Build

Current build: `0.1.41-alpha`

The project currently has:

- a Three.js exploration world
- three connected rooms
- an outside enclosure
- moon.glb in the sky
- background audio
- loader overlay
- puppet skeleton
- mesh import and generated rigging
- Rig Mesh Mode
- World Debug collision overlays
- encounter trigger zones
- sword combat prototype
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
- post-rig gameplay arm restore after preview rigging
- named arm pose resolver for easier stance/swing edits
- relaxed-arm snapshot restore for returning from T/A rigging poses
- Sword Offsets GUI for tuning/reloading the weapon prop without code edits
- combatPhysics.js math module for center of mass, base of support, stability margin, and tipping angle
- Low Guard stance on sword draw
- neutral body/knee facing correction so `rightPalm` reads as anatomical right and lower legs/feet face correctly
- stone room textures and dim torch lighting for the interior rooms
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

Open:

```text
Rig Mesh Mode
```

Recommended flow:

1. Turn on `rig mesh mode`.
2. Start with `keep current pose`.
3. Click `1 render mesh`.
4. Tune pivots with `Joint Point Offsets`.
5. Try `A pose` only if the mesh shoulders need it.
6. Use `T pose` when the source mesh is modeled straight out from the shoulders.
7. Click `2 rig mesh`; preview rigging now restores the captured relaxed gameplay arms after binding.
8. Test walk, jump, arms, idle, `1` combat stance, and `Enter` sword swing.

## Good 15-Minute Tasks

- Move the moon with `SOLO_TWEAKS.skyMoon.position`.
- Add one tree position in `buildLowPolyTrees`.
- Add one encounter in `encounters.js`.
- Tune camera distance in `SOLO_TWEAKS.camera`.
- Turn on World Debug and screenshot the collision layout for yourself.
- Export a rig package from the GUI after a good tuning pass.
- Open `Combat`, set difficulty, press `1`, and test whether the sword scale/hand angle feels right.
- Press `1` while standing still and check whether Low Guard reads as grounded instead of stiff.
- Use `Sword Offsets` to tune `plainSword.glb` position, length, grip point, pitch, yaw, and roll live.
- Use `Mesh > restore gameplay arms` if a test pose or old saved arm command leaves the arms raised after rigging.
- Press `Y`, move `devProbe`, and copy rig-local values for sword or hitbox experiments.
- Press `F2`, tune a pivot at machine home, then press `F2` again to confirm gameplay restores cleanly.

## Save These For A Longer Session

- lasso mouth/eye regions
- better mesh skinning
- multiplayer presence
- room editor UI
- animation timeline
- DM tools

Those are good ideas, just bigger than a quick solo edit.
