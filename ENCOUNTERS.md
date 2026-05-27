# Empyrean Encounters Guide

Encounters are non-blocking trigger zones.

They let you say:

```text
When the avatar walks into this area, do something.
When the avatar leaves this area, do something else.
```

The encounter definitions live here:

```text
encounters.js
```

The runtime logic that checks the avatar position lives in:

```text
main.js
```

## What An Encounter Can Do Right Now

Current action types:

- `log`: write a message to the browser console.
- `audio`: change background audio volume, playback rate, source, loop, play, or pause.
- `skyMoonColor`: change the moon/sky focal object's material tint.
- `skyMoonScale`: resize the moon/sky focal object visually.

This is intentionally small. It gives you a working pattern without building a giant event engine too early.

## What An Encounter Does Not Do

An encounter does not block movement.

For blocking collision:

- use `addSolidRect()` for rectangular blockers
- use `addSolidCircle()` for circular blockers

Encounters are for triggers. Colliders are for walls/obstacles.

## Turn On Encounter Debug View

In the GUI:

```text
World Debug > world debug
World Debug > encounter zones
World Debug > encounter labels
```

When a trigger is active, its debug shape becomes more visible.

This lets you walk into a zone and confirm that the trigger is firing.

## Circle Encounter

Use a circle for:

- planet influence zones
- campfire areas
- sound fields
- magical auras
- proximity triggers

Example:

```js
{
  id: "campfire-music",
  label: "Campfire music",
  enabled: true,
  debugColor: "#ffb347",
  shape: {
    type: "circle",
    center: [-16, 10],
    radius: 5,
  },
  onEnter: [
    {
      type: "log",
      message: "Campfire warmth.",
    },
    {
      type: "audio",
      volume: 0.65,
      playbackRate: 0.96,
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

Circle formula:

```text
inside when distance from avatar center to encounter center <= radius
```

## Rectangle Encounter

Use a rectangle for:

- doors
- room regions
- hallway thresholds
- stage areas
- map tiles

Example:

```js
{
  id: "north-room-threshold",
  label: "North room threshold",
  enabled: true,
  debugColor: "#78c7ff",
  shape: {
    type: "rect",
    center: [0, -12],
    size: [8, 3],
  },
  onEnter: [
    {
      type: "log",
      message: "Entered the north threshold.",
    },
  ],
  onExit: [
    {
      type: "log",
      message: "Exited the north threshold.",
    },
  ],
}
```

Rectangle formula:

```text
minX = centerX - width / 2
maxX = centerX + width / 2
minZ = centerZ - depth / 2
maxZ = centerZ + depth / 2
```

The avatar is inside when:

```text
minX <= avatarX <= maxX
minZ <= avatarZ <= maxZ
```

## Audio Action

Audio actions target the current background audio object.

Example:

```js
{
  type: "audio",
  volume: 0.5,
  playbackRate: 0.9,
  play: true,
}
```

Supported fields:

- `src`: optional audio path, such as `"assets/background.mp3"`.
- `volume`: number from `0` to `1`.
- `playbackRate`: speed multiplier.
- `loop`: `true` or `false`.
- `play`: `true` asks the browser to play/resume.
- `pause`: `true` pauses.

Browser note:

Browsers often block audio until the user clicks or presses a key. That is normal. The project catches that case and logs it politely.

## Sky Moon Actions

Change moon tint:

```js
{
  type: "skyMoonColor",
  color: "#f7d894",
}
```

Change moon scale:

```js
{
  type: "skyMoonScale",
  scale: 1.2,
}
```

Reset moon scale on exit:

```js
{
  type: "skyMoonScale",
  scale: 1,
}
```

Compatibility note: older `jupiterColor` and `jupiterScale` action names still
work, but new encounter definitions should use `skyMoonColor` and
`skyMoonScale`.

## Safe Encounter Workflow

1. Run:

   ```powershell
   .\checkpoint.ps1
   ```

2. Open `encounters.js`.

3. Copy the disabled template.

4. Paste it below the template.

5. Change:

   - `id`
   - `label`
   - `enabled`
   - `shape`
   - `onEnter`
   - `onExit`

6. Turn on `World Debug`.

7. Walk into the zone.

8. Watch the console and listen for audio changes.

## Good Solo Encounter Ideas

- doorway changes music volume
- sky-moon zone lowers pitch
- tree grove changes ambience
- room threshold logs which room you entered
- campfire circle warms the color of the moon
- outside boundary zone pauses background audio

## Things To Save For Later

These are good future upgrades, but not necessary yet:

- timed audio fades
- on-stay actions
- one-shot encounters
- encounter cooldowns
- pop-up text
- DM-triggered encounters
- dice-roll triggers
- loading encounter definitions from JSON
