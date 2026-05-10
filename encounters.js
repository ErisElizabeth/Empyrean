/*
  EMPYREAN ENCOUNTERS MODULE

  This file is intentionally data-first.

  Goal:
    Let you place "encounter zones" in the world without digging through the
    movement, collision, or animation systems in main.js.

  What an encounter is:
    A non-blocking trigger area. The avatar can walk through it. When the
    avatar's floor footprint enters or exits the trigger area, actions fire.

  What an encounter is not:
    It is not a wall collider. It does not stop movement. Blocking collision
    still lives in worldCollision inside main.js.

  Coordinate reminder:
    X = left/right across the floor
    Y = height
    Z = forward/back across the floor

  Encounter shapes only use X and Z because they sit on the floor like invisible
  tabletop trigger templates.

  Shape formulas:

    circle:
      inside when distance from avatar footprint to center <= radius

    rect:
      inside when:
        minX <= avatarX <= maxX
        minZ <= avatarZ <= maxZ

  Safe solo workflow:
    1. Run .\checkpoint.ps1
    2. Copy one encounter object below.
    3. Give it a unique id.
    4. Place the shape.
    5. Set enabled: true.
    6. Turn on World Debug > encounter zones in the GUI.
    7. Walk into it and watch the console/audio/Jupiter changes.
*/

export const ENCOUNTER_DEFINITIONS = [
  {
    /*
      Example 1:
        A soft Jupiter-themed audio zone outside.

      Why circle:
        Planet/moon/sky-focus zones usually feel natural as circles.
    */
    id: "jupiter-audio-field",
    label: "Jupiter audio field",
    enabled: true,
    debugColor: "#f0c36a",
    shape: {
      type: "circle",
      center: [0, -20],
      radius: 9,
    },
    onEnter: [
      {
        type: "log",
        message: "Entered Jupiter audio field.",
      },
      {
        /*
          Audio action:
            volume       = 0..1
            playbackRate = 0.5..4 is usually safe, but subtle is better
            play         = true asks the browser to play/resume the track

          Browser note:
            If autoplay is blocked, the main app catches that gracefully.
        */
        type: "audio",
        volume: 0.55,
        playbackRate: 0.92,
        play: true,
      },
      {
        // "jupiterColor" changes the material tint on the Jupiter sphere.
        type: "jupiterColor",
        color: "#f7d894",
      },
    ],
    onExit: [
      {
        type: "log",
        message: "Exited Jupiter audio field.",
      },
      {
        type: "audio",
        volume: 1,
        playbackRate: 1,
      },
      {
        type: "jupiterColor",
        color: "#7a7979",
      },
    ],
  },

  {
    /*
      Example 2:
        A rectangular "threshold" just outside the south doorway.

      Why rectangle:
        Doorways, hallways, room tiles, and region boundaries are usually easier
        to think about as rectangles.
    */
    id: "outside-threshold",
    label: "Outside threshold",
    enabled: true,
    debugColor: "#7bb369",
    shape: {
      type: "rect",
      center: [0, 15],
      size: [9, 5],
    },
    onEnter: [
      {
        type: "log",
        message: "Crossed the outside threshold.",
      },
      {
        type: "audio",
        volume: 0.82,
        playbackRate: 1.02,
      },
    ],
    onExit: [
      {
        type: "audio",
        volume: 1,
        playbackRate: 1,
      },
    ],
  },

  {
    /*
      Disabled template:
        Copy this object, paste it below, change id/label/shape/actions, then
        set enabled to true.

      This is kept disabled so it does nothing until you intentionally use it.
    */
    id: "template-circle-encounter",
    label: "Template circle",
    enabled: false,
    debugColor: "#78c7ff",
    shape: {
      type: "circle",
      center: [-24, 0],
      radius: 4,
    },
    onEnter: [
      {
        type: "log",
        message: "Entered template circle.",
      },
    ],
    onExit: [
      {
        type: "log",
        message: "Exited template circle.",
      },
    ],
  },
];
