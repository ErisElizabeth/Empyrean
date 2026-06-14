You are working in my Empyrean Three.js browser game repo.

Context:
The project currently uses `churchRough.glb` as the existing church structure. I now have a new model at:

`assets/Cathedral.glb`

I want to replace the existing `churchRough.glb` structure with `Cathedral.glb`.

Important:
This must be done as a staged workflow. Do not attempt the whole replacement in one patch. The existing structure needs to be destroyed and rebuilt like Anakin becoming Vader, but carefully. I want one pass at a time, with minimal changes per pass, so I can test after each stage.

Do not rewrite unrelated systems. Do not touch player rigging, Puppet Shop, localStorage, saved rigs, combat, NPC spawning, or unrelated world systems. This task is only about replacing the old church model with the new cathedral and adapting the surrounding scene.

Overall Goal:
Replace `churchRough.glb` with `Cathedral.glb`, reuse/adapt the existing church colliders for the new building, reposition torches/lights/details around the new building, and preserve gameplay stability.

Before editing:

1. Search the repo for every reference to `churchRough.glb`.
2. Search for the church loading code.
3. Search for the church collider definitions.
4. Search for torch placement near the church.
5. Search for any labels, triggers, spawn points, interact zones, doors, or camera assumptions tied to the church.
6. Report what files/functions are involved before making changes.
7. Propose the exact first pass before editing.

Goal:
Introduce `Cathedral.glb` as the new church visual asset while preserving existing gameplay and collision behavior.

Pass 0:
Isolate the cathedral replacement work so unrelated encounter systems do not interfere with testing.

Pre- First pass:
Move current encounter activity from the interior/current room areas before beginning the cathedral replacement.

Requirements:

- Current encounters/enemies are happening inside the existing rooms.
- These encounters have nothing to do with replacing `churchRough.glb` with `Cathedral.glb`.
- Move encounter spawn points / active encounter zones to outer portions of the world, away from the church/cathedral work area and away from the current room interiors.
- Do not rewrite the encounter system.
- Do not change enemy behavior, combat behavior, NPC behavior, or spawn logic beyond relocating or temporarily disabling the encounter locations needed to keep testing clean.
- Preserve the ability to restore or adjust encounters later.
- The goal is only to keep enemies/encounters from muddying cathedral visual/collider/torch testing.

G53 / rigging visibility rule:

- Preserve the existing G53 rule that rigging/calibration mode uses `opacity: 0` behavior for objects/clutter that should not interfere visually while rigging.
- Any new cathedral/church replacement work must not break G53 visibility behavior.
- If cathedral, colliders, torches, helpers, or world objects are visible during G53 when they should be hidden/transparent according to current G53 rules, make them obey the existing G53 opacity/visibility pattern.
- Do not rewrite G53. Reuse the existing G53 visibility/opacity rules.

Acceptance criteria for pass 0:

- Game loads without errors.
- Existing encounters no longer interfere with the rooms/church/cathedral test area.
- Encounter relocation does not break combat or spawning globally.
- G53 still behaves as expected with non-rigging clutter hidden/transparent using the existing `opacity: 0` pattern.
- No cathedral model swap has happened yet.
- No collider or torch changes have happened yet.

After pass 0:
Stop and tell me:

1. What encounter/spawn locations changed
2. What files changed
3. How to test that encounters are out of the way
4. How to test that G53 opacity/visibility rules still work
5. The proposed next pass for the cathedral visual swap

First pass:
Minimal visual swap only.

Requirements:

- Replace the loaded visual model path from `churchRough.glb` to `assets/Cathedral.glb`.
- Do not delete old collider code.
- Do not move torches yet.
- Do not rewrite the church system.
- Preserve the current church world position, rotation, and scale behavior as much as possible.
- If the cathedral imports at the wrong size/orientation, add temporary transform constants for cathedral position/rotation/scale rather than hardcoding magic numbers throughout the code.
- Add comments marking these constants as temporary calibration values.
- Keep the old church collider setup active for now even if it does not perfectly match the cathedral.
- Add a visible debug bounding box/helper around the cathedral if debug helpers already exist, or add a simple temporary helper that can be toggled off.

Acceptance criteria for first pass:

- Game loads without errors.
- `Cathedral.glb` appears where the old church was.
- Existing church colliders still prevent walking through the old church footprint.
- Torches may be visually wrong for now; that is acceptable.
- No unrelated systems regress.

After first pass:
Stop and tell me what changed, what to test, and what still needs calibration.

Goal:
Calibrate the cathedral transform so it sits correctly in the world.

Second pass:
Position/rotation/scale alignment.

Requirements:

- Adjust only the cathedral transform constants or central church transform config.
- Do not change colliders yet unless absolutely necessary.
- Align the cathedral to the intended ground plane.
- Make sure the entrance/front orientation makes sense relative to the player/world/church area.
- Preserve the current scene’s coordinate logic.
- If possible, log or expose the final cathedral transform values clearly.

Acceptance criteria for second pass:

- Cathedral sits on the ground.
- Cathedral is oriented correctly.
- Cathedral looks intentionally placed, not floating, buried, or rotated wrong.
- Existing gameplay still works.

After second pass:
Stop and tell me the final transform values and what still needs collider work.

Goal:
Reuse and adapt the existing church colliders for the new cathedral footprint.

Third pass:
Collider adaptation.

Requirements:

- Find the current church collider system.
- Reuse the same collider pattern/style rather than inventing a new collision system.
- Update collider dimensions/positions to fit the cathedral footprint.
- Use multiple simple box colliders if needed.
- Keep colliders simple and reliable. Do not create mesh-accurate collision.
- Add temporary visible collider helpers if a debug mode already exists, or add a simple toggle for collider visualization.
- Preserve any existing collision arrays/registration patterns used by the world.
- Do not allow the player to walk through the cathedral walls.
- Do not block intentional paths/entrances unless the old church did.
- If the cathedral has an entrance/door area, leave a sensible access gap if gameplay requires it.

Acceptance criteria for third pass:

- Player cannot walk through cathedral walls.
- Player can navigate around the cathedral without invisible nonsense.
- Collider helpers match the intended solid areas.
- Existing room/world collision behavior still works.
- No unrelated collision systems are broken.

After third pass:
Stop and summarize collider changes by position/size/purpose.

Goal:
Move torches and local lighting so the cathedral area looks intentional.

Fourth pass:
Torch and light relocation.

Requirements:

- Find existing torches/lights tied to the old church.
- Reposition torches to fit the cathedral architecture.
- Preserve existing torch behavior/materials/flame effects if they exist.
- Do not rewrite torch rendering.
- Keep lighting subtle and consistent with the current night/day atmosphere system.
- Make sure the cathedral is readable in night mode without looking overlit.
- Do not break the day/night `G` toggle or world atmosphere system.
- If torches are currently hardcoded, centralize their church-area positions into a small array/config if that can be done safely.

Acceptance criteria for fourth pass:

- Torches no longer float inside walls or sit in obviously wrong places.
- Cathedral reads well at night.
- Day/night atmosphere still works.
- Moon/day lighting changes from recent versions are not regressed.
- Existing torches elsewhere are not affected.

After fourth pass:
Stop and tell me which torch positions changed.

Goal:
Clean up church-specific assumptions and old rough-church leftovers.

Fifth pass:
References, labels, triggers, and cleanup.

Requirements:

- Search again for `churchRough`, `churchRough.glb`, and old church-specific names.
- Rename only where safe and useful. Do not churn names unnecessarily.
- Preserve backward compatibility if other code expects old identifiers.
- Update comments/labels from rough church to cathedral where appropriate.
- Check any triggers, labels, spawn points, camera assumptions, or interaction zones tied to the old church.
- Do not delete `churchRough.glb` yet unless I confirm. It may be archived later.
- If unused imports or old constants remain, remove only after confirming they are not referenced.

Acceptance criteria for fifth pass:

- No broken references to `churchRough.glb`.
- Cathedral is the active church/cathedral visual.
- Old rough church is not loaded.
- Gameplay still works.
- Repo remains lean and no unused heavy asset is accidentally committed.

After fifth pass:
Stop and provide a final summary of changed files and remaining optional polish.

Optional later polish:
Only after the above passes are working:

- Add cathedral-specific ambient details.
- Add better entrance framing.
- Add interior/exterior light variation.
- Add day/night material tweaks.
- Add weather/atmosphere reactions.
- Add lore hooks.
- Add a named `cathedral` object/config in `world.js`.

Hard constraints:

- Do not touch player rigging.
- Do not touch Rigging Wizard.
- Do not touch Puppet Shop.
- Do not touch saved rig persistence.
- Do not touch Codex’s previous rigging work unless reverting unrelated damage.
- Do not rewrite world atmosphere.
- Do not replace the collision system.
- Do not make broad architectural refactors.
- Do not delete the old church asset until I explicitly confirm.
- Keep each pass small enough that I can test it before continuing.

Definition of done:
The operator can load Empyrean, see `Cathedral.glb` in place of the old church, walk around it with reliable colliders, see torches/lights placed intentionally around it, and use existing gameplay/day-night systems without regression.

Work pass-by-pass. Do not proceed to the next pass until I confirm the current pass works in Live Server. At the end of each pass, give me:

1. Files changed
2. What changed
3. What I should test
4. What not to worry about yet
5. The next proposed pass
