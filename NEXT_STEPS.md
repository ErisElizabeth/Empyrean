# Empyrean Next Steps

These are good solo tasks that do not require deep code surgery.

Pick one task per session. Run `.\checkpoint.ps1` first.

## Easiest Wins

1. Turn on collision vision

   Use `World Debug > world debug`.

   Toggle wall colliders, tree colliders, outside bounds, and encounter zones.

   Goal: understand what the invisible navigation map looks like.

1. Tune the sky moon

   Change `WORLD_TWEAKS.skyMoon.position`, `targetDiameter`, and `fallbackColor`.

   Goal: make the sky feel intentional from several camera angles.

2. Place more trees

   Add `[x, z]` pairs in `buildLowPolyTrees(parent)`.

   Goal: make the outside feel like a space to wander through, not an empty box.

3. Adjust ghost sphere density

   Change `SOLO_TWEAKS.ghostSpheres.count`.

   Goal: find the highest count that still feels smooth on your machine.

4. Tune movement feel

   Change `SOLO_TWEAKS.player.moveSpeed`.

   Goal: make walking feel calm enough for inspection but not sluggish.

5. Tune camera comfort

   Change `SOLO_TWEAKS.camera.startDistance`, `startHeight`, and `wheelMaxDistance`.

   Goal: find a default view that makes both exploration and pivot tuning comfortable.

## Good Rig Practice

1. Make three saved rig tuning snapshots

   Use `Rig Save > copy/log JSON`.

   Suggested names in your own notes:

   - neutral human-ish
   - alien-ish long neck
   - mesh fitting test

2. Practice one body region at a time

   Do not tune the whole skeleton in one pass.

   Good order:

   - pelvis and spine
   - chest and neck
   - shoulders
   - elbows and wrists
   - hips
   - knees and ankles

3. Use the axis marker

   Pick one joint in `Workshop Alignment > axis joint`.

   Rotate bind pose sliders and watch how the local axes move.

   Goal: build intuition for local rotation.

## Safe World Additions

1. Add one no-collision floating prop

   Use `WORLD_COOKBOOK.md > Add A No-Collision Decoration`.

2. Add one collision prop

   Add the visual object first.

   Then add `addSolidRect()` or `addSolidCircle()`.

3. Add one named landmark

   Example ideas:

   - a low-poly standing stone
   - a glowing marker sphere
   - a raised platform
   - a second planet

4. Add one encounter trigger

   Open `encounters.js`.

   Copy the disabled template.

   Start with a `log` action only, then add audio once the zone placement feels right.

## Things To Save For A Codex Session

These are possible, but they touch more connected systems.

1. Lasso tool for mouth and eyes

   This needs mouse picking, drawn shapes, mesh projection, saved regions, and animation binding.

2. Better skinning

   Generated weights work as a prototype. Better deformation may need hand-painted zones, helper bones, or imported skeleton support.

3. Multiplayer presence

   This needs networking, session state, identity, sync rules, and probably a server.

4. Room editor UI

   Worth doing eventually, but it is a real tool, not a tiny tweak.

5. Animation timeline

   Useful for D&D storytelling, but it should be designed carefully.

## Best Next Codex Pairing Session

My recommended next guided build:

1. Add visible collision debug mode.
2. Add a simple prop placement helper.
3. Add a small saved world config object.
4. Move tree positions, sky objects, and landmarks into that config.

Why this next:

It would let you build spaces by editing data instead of writing new geometry code each time.
