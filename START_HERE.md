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

Current build: `0.1.21-alpha`

The project currently has:

- a Three.js exploration world
- three connected rooms
- an outside enclosure
- Jupiter in the sky
- background audio
- loader overlay
- puppet skeleton
- mesh import and generated rigging
- Rig Mesh Mode
- World Debug collision overlays
- encounter trigger zones
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
rig.js
encounters.js
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
6. Click `2 rig rendered mesh`.
7. Test walk, jump, arms, and idle.

## Good 15-Minute Tasks

- Move Jupiter with `SOLO_TWEAKS.jupiter.position`.
- Add one tree position in `buildLowPolyTrees`.
- Add one encounter in `encounters.js`.
- Tune camera distance in `SOLO_TWEAKS.camera`.
- Turn on World Debug and screenshot the collision layout for yourself.
- Export a rig package from the GUI after a good tuning pass.

## Save These For A Longer Session

- lasso mouth/eye regions
- better mesh skinning
- multiplayer presence
- room editor UI
- animation timeline
- DM tools

Those are good ideas, just bigger than a quick solo edit.
