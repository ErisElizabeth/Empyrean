# Empyrean World Cookbook

Copy/paste recipes for adding simple world objects.

These recipes assume you are editing `world.js`.

Important rule:

Visual mesh first. Collision second.

Do not add collision until you can see the object in the scene.

## Current Four-Room Block

The current stone rooms form a `2 x 2` block.

Room centers:

```text
central room               X  0, Z   0
negative-X room            X-24, Z   0
negative-Z room            X  0, Z -24
negative-X/negative-Z room X-24, Z -24
```

The current `roomSize` is `24` scene units. The current `wallThickness` is
`0.1` scene units.

Use these numbers when modeling an outside shell or wrapper asset:

```text
Nominal room cube:
  width X  = 48
  length Z = 48
  height Y = 24

Including visible wall/floor/ceiling thickness:
  width X  = 48.1
  length Z = 48.1
  height Y = 24.1
  min X    = -36.05
  max X    =  12.05
  min Z    = -36.05
  max Z    =  12.05
  min Y    =  -0.05
  max Y    =  24.05
```

The northwest room is at negative X and negative Z. In `world.js` naming,
negative X is the west direction and negative Z is the north direction.

## Current Cathedral Shell

`assets/Cathedral_lowPoly2.glb` is loaded by `world.js` as the active visual
shell around the four-room block. Its separate `assets/texture_0.png` is applied
in `prepareChurchShellModel()` with generated box-projection UVs because the GLB
does not include authored `TEXCOORD_0` texture coordinates.

The older `assets/churchRough.glb`, high-poly `assets/Cathedral.glb`, and first
low-poly `assets/Cathedral_lowPoly.glb` remain in the assets folder as archived
references during the staged replacement, but they are no longer the active
world shell.

Pass 6 collision is deliberately rough: five rectangle wall proxies block the
outer cathedral footprint while leaving a south/front opening, and eight circular
column proxies reuse the existing tree-style collision path. Turn on World Debug
wall/tree colliders to see them.

Pass 7 keeps the old procedural room hierarchy and collision math, but hides the
legacy room walls, ceilings, and torch mounts with `visible = false` while the
cathedral shell is active. The floor surfaces remain visible as navigable ground
reference, and the existing collider rectangles still work.

The asset was authored in millimeters, but Tinkercad GLB export stores those
numbers as meters. `WORLD_TWEAKS.churchShell.sceneUnitScale` is therefore set to
`1000`:

```text
Empyrean scene units = Tinkercad exported GLB units * 1000
```

The shell is not normalized or re-centered. Its authored fixture zero is used
directly:

```text
CAD X0 -> gameplay X0
CAD Y0 -> gameplay Z0, through Tinkercad's exported axis-conversion matrix
CAD Z  -> gameplay Y height
```

The shell is visual only. The procedural rooms still own wall collision, door
openings, outside bounds, and debug overlays.

## Current Cave Prop

`assets/cave.glb` uses the same Tinkercad fixture-zero loading path as the
church shell:

```text
position: X20, Y0, Z-90
scale: 1000
```

The inspected scaled footprint is roughly:

```text
X width  ~= 32
Z length ~= 33
Y height ~= 16
```

Current rough proxy colliders:

```text
back wall:  center X36, Z-88.5, size X32, Z3
west side:  center X22, Z-74,   size X4,  Z28
east side:  center X50, Z-74,   size X4,  Z28
```

The south/front side is left open so the player can approach the cave mouth.
This is intentionally draft-quality collision. Replace or split these rectangles
later when the cave layout becomes more important.

## Current Landmark Scatter

Outside dressing lives in `WORLD_TWEAKS.landmarks` in `world.js`.

The scatter is random-looking but seeded:

```text
seed = 77123
```

The same seed creates the same layout every refresh. Change the seed when you
want a different overall scatter.

Current landmark assets:

```text
tree.glb
deadTree.glb
campfire.glb
skull.glb
rock1.glb
rock2.glb
```

Extra trees use the same scale as the existing outside trees. Campfires, skulls,
and rocks are normalized to `1.5` scene units tall.

Placement avoids:

```text
church shell
cave prop
existing tree colliders
outside walls
previously placed landmark colliders
```

To move the scatter around, edit `WORLD_TWEAKS.landmarks.zones`. To change what
appears, edit `WORLD_TWEAKS.landmarks.kinds`. To make a prop easier or harder to
walk around, tune its `colliderRadius`.

## Where To Put New World Objects

Good places:

- Inside `buildExplorationWorld()` if the object is part of the explorable world.
- Near the sky-moon section if the object is a sky object.
- In a new helper function if the object has several pieces.

For repeated objects, use a helper function.

For one special object, a small block is fine.

## Add A Simple Box Prop

Use this for crates, pedestals, floating blocks, markers, or test props.

```js
function createBoxProp() {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(2, 1, 2),
    new THREE.MeshStandardMaterial({
      color: "#8aa0ff",
      roughness: 0.8,
      metalness: 0,
    }),
  );

  mesh.name = "box-prop";
  mesh.position.set(-8, 0.5, 12);
  return mesh;
}
```

Then add it inside `buildExplorationWorld()`:

```js
group.add(createBoxProp());
```

Why `y = 0.5`?

The box is 1 unit tall. Its center is halfway up, so the bottom rests at floor Y = 0.

Formula:

```text
centerY = height / 2
```

## Add Collision To A Box Prop

If the prop should block movement, add a matching rectangle:

```js
addSolidRect(-8, 12, 2, 2);
```

Formula:

```text
addSolidRect(centerX, centerZ, width, depth)
```

The collision rectangle is top-down only. It does not care about object height.

## Add A New Tree

Find `buildLowPolyTrees(parent)`.

Add another `[x, z]` pair to `treePositions`:

```js
[14, -31],
```

That automatically:

- creates the visible tree
- places it at X/Z
- adds a circular collider

If a tree blocks too much space, lower:

```js
SOLO_TWEAKS.trees.colliderRadius
```

## Add A No-Collision Decoration

Use this for things the avatar can walk through.

```js
function createFloatingCrystal() {
  const crystal = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.6, 0),
    new THREE.MeshStandardMaterial({
      color: "#9ad7ff",
      emissive: "#244455",
      emissiveIntensity: 0.4,
      roughness: 0.45,
    }),
  );

  crystal.name = "floating-crystal";
  crystal.position.set(6, 3.2, -18);
  return crystal;
}
```

Then:

```js
group.add(createFloatingCrystal());
```

No `addSolidRect()` or `addSolidCircle()` means no collision.

## Add A Circular Collider

Use this for trees, columns, round rocks, standing stones, or anything where a circle feels right.

```js
addSolidCircle(6, -18, 1.25);
```

Formula:

```text
addSolidCircle(centerX, centerZ, radius)
```

The avatar will be pushed away when:

```text
distance between centers < object radius + avatar radius
```

## Add An Encounter Trigger

Encounters live in:

```text
encounters.js
```

Use encounters when the avatar should walk into an area and trigger something.

Use colliders when the avatar should be blocked.

Circle encounter:

```js
{
  id: "example-circle",
  label: "Example circle",
  enabled: true,
  debugColor: "#f0c36a",
  shape: {
    type: "circle",
    center: [0, -20],
    radius: 6,
  },
  onEnter: [
    {
      type: "log",
      message: "Entered example circle.",
    },
    {
      type: "audio",
      volume: 0.6,
      playbackRate: 0.95,
      play: true,
    },
  ],
  onExit: [
    {
      type: "audio",
      volume: 1,
      playbackRate: 1,
    },
  ],
}
```

Rectangle encounter:

```js
{
  id: "example-threshold",
  label: "Example threshold",
  enabled: true,
  debugColor: "#78c7ff",
  shape: {
    type: "rect",
    center: [0, 12],
    size: [8, 3],
  },
  onEnter: [
    {
      type: "log",
      message: "Crossed the threshold.",
    },
  ],
  onExit: [
    {
      type: "log",
      message: "Left the threshold.",
    },
  ],
}
```

Turn on:

```text
World Debug > world debug
World Debug > encounter zones
```

Then walk into the zone to test it.

## Add A Planet Or Moon

Copy the sky-object pattern.

```js
const planetTexture = textureLoader.load("assets/MyPlanet.jpg");
const planet = new THREE.Mesh(
  new THREE.SphereGeometry(5, 32, 16),
  new THREE.MeshBasicMaterial({
    map: planetTexture,
    color: 0xffffff,
  }),
);

planet.name = "sky-planet";
planet.position.set(-25, 18, -35);
scene.add(planet);
```

Use `MeshBasicMaterial` for sky objects when you want them visible without caring about lights.

## Move The Moon

Open `world.js`, find `WORLD_TWEAKS.skyMoon`, and edit:

```js
position: [0, 15, -20],
```

Format:

```text
[x, y, z]
```

Raise it:

```js
position: [0, 22, -20],
```

Move it farther back:

```js
position: [0, 15, -38],
```

Make it bigger:

```js
radius: 11,
```

## Moonlight Direction

Moonlight is built in `world.js` by `buildLighting(scene, { skyMoon })`.

The visible moon has two jobs:

```text
1. look luminous on screen
2. act as the positional datum for moonlight direction
```

After `assets/moon.glb` loads, `prepareSkyMoonSurfaceMaterial()` traverses the
moon meshes and keeps them as a mostly opaque detail shell:

```js
surfaceOpacity: 0.9,
```

The detail shell uses `MeshBasicMaterial`, not `MeshStandardMaterial`:

```js
map: source.map,
transparent: true,
opacity: 0.9,
side: THREE.DoubleSide,
toneMapped: false,
```

This is deliberate. A lit sphere material creates a hard terminator where one
hemisphere faces the light and the other hemisphere falls into shadow. That is
good physics, but bad sky-moon presentation. The moon's visible shell keeps the
embedded `moon.glb` texture map for crater detail while ignoring scene lights.

The glow comes from a separate sphere inside the same `skyMoon` group:

```js
innerGlowDiameter: 14.75,
innerGlowOpacity: 0.46,
```

That inner sphere is self-lit, but it does not aim or move lights by itself. It
adds a soft luminous core while the texture-preserving shell keeps the moon
surface from flattening into a smooth ball.

The shell material is still forced to:

```js
transparent: true,
opacity: 0.9,
depthWrite: false,
side: THREE.DoubleSide,
```

`THREE.DoubleSide` was the controlled material pass for the church-facing dark
side. It keeps the shell/glow composite visible even if the imported moon mesh's
triangle winding or normals behave differently from one viewing direction.

The moon lighting rig may also have a local helper light:

```js
moonPointLightIntensity: 20.25,
moonPointLightDistance: 0,
moonPointLightDecay: 1.6,
moonPointLightOffsetTowardTarget: 0,
```

This is a `PointLight`, but it is not a separate moon position. Every frame it
starts from `skyMoon.getWorldPosition()`, then optionally moves a short distance
toward `moonLightTarget`. This does not solve visible moon-shell presentation by
itself: a point light at the center of a sphere mostly lights the inward-facing
surface, and a point light outside the shell creates a local hot spot. The
visible moon shell is therefore handled by `MeshBasicMaterial`; world moonlight
is handled by the directional light.

Tuning path:

```text
brighter visible moon shell  -> raise surfaceOpacity or tint/color in the shell material
light reaches too far        -> lower moonPointLightDistance
inner glow too visible       -> lower innerGlowOpacity or innerGlowDiameter
moon shell too solid         -> lower surfaceOpacity slightly
```

The important future-proofing rule is:

```text
visible skyMoon world position = directional moon light position
```

`main.js` calls the returned lighting rig's `update()` method every frame. That
means a future day/night cycle can move `skyMoon.position`, or parent the moon
under an orbit group, and the directional light will keep using the moon's
actual rendered world position.

`syncMoonLights()` owns the moon-light placement:
the directional light source comes from `skyMoon.getWorldPosition()`, the light
target comes from `WORLD_TWEAKS.lighting.moonLightTarget`, and the local shell
point light is derived from the same visible moon position.

Day/night cycle pass 1 lives in `main.js`. Pressing `G` toggles:

```text
skyMoon.visible
worldLighting.moonLight.visible
worldLighting.moonPointLight.visible
ghost sphere group visibility
scene sky / renderer clear color
day sun DirectionalLight
HemisphereLight fill values
day/night fog color and density
outside wall/ceiling sky-shell color and opacity
central accent PointLight intensity
```

This is deliberately not a fade yet. Future passes can fade moon material
opacity, ghost-sphere opacity, sky color, moon light intensity, hemisphere
color/intensity, and eventually a sun rig without changing the basic ownership
boundary: `world.js` owns the moon, ghost spheres, sky colors, and lights;
`main.js` owns player-facing input/state transitions.

The sky-color-only helper is `applyWorldSkyColor(scene, renderer, skyName)`.
The current `G` toggle uses the fuller helper:

```text
applyWorldSkyMode(scene, renderer, { lightingRig, skyName })
```

It writes the visible Three.js background, renderer clear color, sun light, and
HemisphereLight fill:

```text
night = #131862
day   = #CEEAFA
sun   = #FBF6D6
```

The current day colors are 20% desaturated from the earlier bright-blue pass:

```text
sky/fog/shell: #C9EBFF -> #CEEAFA
ground fill:   #DCE8C8 -> #DBE5CB
sun color:     #FFF9D2 -> #FBF6D6
```

The day sun is diagonal, not straight down, because a straight-down sun lights
floors but does not meaningfully light the visible underside of ceilings. The
sun gives direction; HemisphereLight gives broad readability for ceilings and
non-facing walls.

It deliberately does not change grass, outside floor color, torch lights, audio,
or room materials. It does change fog and the outside wall/ceiling sky shell
because those are part of the rough-draft sky presentation now.

Day mode also disables the `central-green-accent-light` PointLight. That light
is a nearby finite-distance local light, so it was a reasonable suspect for the
shrinking player-facing bright patch. The stronger diagnosis turned out to be
fog/material blending: distant floor was fogging into the day sky color, and the
outside wall/ceiling shell was semi-transparent. Day mode now uses no fog and an
opaque day-colored sky shell so the floor stays visually separate from the sky.
Torches are intentionally left alone for this pass so they can be tested
separately if another artifact remains.

The outside wall/ceiling shell now uses an unlit `MeshBasicMaterial`, not
`MeshStandardMaterial`. That matters because a sky shell should show its assigned
day/night color; it should not shade differently on north, south, east, west,
and ceiling faces based on sun direction. The shell is also double-sided so it
still renders when the camera orbits past the player movement bounds.

Night mode now uses `#131862` for both the Three.js scene background and the
outside wall/ceiling shell. Earlier builds used near-black for the infinite
background and purple-blue for the physical shell, which made a black/purple
edge appear when the camera looked across the outside bounds.

World atmosphere is now centralized in `WORLD_TWEAKS.atmosphere.palettes`.
The current palette is named `night` and owns:

```text
scene background color
fog color and density
renderer clear color
outside wall color
outside floor / grass color
hemisphere sky and ground colors
moon light color and intensity
moon shell helper intensity
local accent color and intensity
```

`main.js` calls `applyWorldAtmosphere(scene, renderer, { lightingRig })`.
That lets future day/night/weather work add palettes such as `day`, `overcast`,
`raining`, `sunny`, or `foggy` without putting sky colors back into `main.js` or
CSS.

Current outside moonlight balance:

```js
hemisphereIntensity: 0.12,
moonLightIntensity: 2.18,
moonLightTarget: [0, 7.5, 7.5],
```

These values are Three.js scene-light intensities, not real lux. They are tuned
to feel closer to a full-moon night while staying readable on screen.

## Change The Outside Size

Open `WORLD_TWEAKS.world` in `world.js`:

```js
outsideSize: 384,
outsideHeight: 36,
outsideCenterX: 0,
outsideCenterZ: 0,
```

After increasing the outside area, spread trees farther out by editing `treePositions`.

The outside boundary uses:

```text
center +/- outsideSize / 2
```

Current outside fixture:

```text
outsideCenterX = 0
outsideCenterZ = 0
outsideSize = 384
outsideHeight = 36
```

Current usable world envelope before collider-radius clamping:

```text
minX = 0 - 192 = -192
maxX = 0 + 192 =  192
minZ = 0 - 192 = -192
maxZ = 0 + 192 =  192
minY = -0.05
maxY = 36.05
```

Keep tree positions inside those values.

## Add Another Room Later

This is slightly more advanced but still doable.

Inside `buildExplorationWorld()`, add another room config:

```js
{
  name: "new-room-name",
  center: new THREE.Vector3(-roomSize, roomSize / 2, -roomSize),
  doors: { east: true, south: true },
},
```

Rules:

- `center.x` and `center.z` place the room on the floor grid.
- `center.y` should stay `roomSize / 2`.
- Door directions must line up with adjacent rooms.

If two rooms touch, both rooms need matching doors.

Example:

- Room A west door connects to Room B east door.
- Room A north door connects to Room C south door.

## Add A Wall Gap Or Door

A wall gets a doorway when its room config says:

```js
doors: { north: true }
```

Door size comes from:

```js
SOLO_TWEAKS.world.doorWidth
SOLO_TWEAKS.world.doorHeight
```

If the avatar catches on the doorway, try:

```js
doorWidth: 5.2,
```

## Performance Knobs

If the scene feels sluggish, lower these first:

```js
SOLO_TWEAKS.ghostSpheres.count
```

Then reduce geometry segments in special objects, for example:

```js
new THREE.SphereGeometry(8, 24, 12)
```

instead of:

```js
new THREE.SphereGeometry(8, 32, 16)
```

Lower segment counts mean fewer polygons.
