# Empyrean World Cookbook

Copy/paste recipes for adding simple world objects.

These recipes assume you are editing `world.js`.

Important rule:

Visual mesh first. Collision second.

Do not add collision until you can see the object in the scene.

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

## Change The Outside Size

Open `SOLO_TWEAKS.world`:

```js
outsideSize: 120,
```

After increasing the outside area, spread trees farther out by editing `treePositions`.

The outside boundary uses:

```text
center +/- outsideSize / 2
```

So if:

```text
outsideCenterX = -12
outsideSize = 96
```

Then:

```text
minX = -12 - 48 = -60
maxX = -12 + 48 = 36
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
