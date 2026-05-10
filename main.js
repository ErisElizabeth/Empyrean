import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import GUI from "lil-gui";
import { ENCOUNTER_DEFINITIONS } from "./encounters.js";

const APP_VERSION = "0.1.12-alpha";
const THREE_VERSION_PIN = "0.164.1";

//=============================================================
// SOLO TWEAK ZONE
//=============================================================
/*
  This is the "I have twenty minutes and want to safely experiment" section.

  Most of the values a solo builder is likely to change are grouped here so you
  do not have to hunt through the entire file. The rest of main.js still uses
  named constants such as roomSize, outsideWallColor, and treeColliderRadius,
  but many of those constants are now fed by this object.

  Editing rule of thumb:
    - Change values in SOLO_TWEAKS first.
    - Refresh Live Server.
    - If something goes sideways, run checkpoint.ps1 from this folder, compare
      against the latest Desktop checkpoint, or revert just the value you edited.

  Units:
    - Distances are Three.js scene units.
    - Rotations elsewhere in this file are radians.
    - Colors may be CSS hex strings like "#131862" or numeric hex like 0x131862.
*/
const SOLO_TWEAKS = {
  world: {
    // roomSize controls width, depth, and height of each cube-like room.
    roomSize: 24,

    // wallThickness is thin because rooms are visual boundaries, not heavy
    // architectural solids. Collision uses matching thin top-down rectangles.
    wallThickness: 0.1,

    // roomTransparency keeps the puppet visible through nearby room surfaces.
    roomTransparency: 0.2,

    // Door gaps. Increase doorWidth if the circular rig collider catches edges.
    doorWidth: 4.4,
    doorHeight: 5.1,

    // The outside enclosure is a finite play box. To make a bigger yard, raise
    // outsideSize and then spread tree positions farther out.
    outsideSize: 96,
    outsideCenterX: -12,
    outsideCenterZ: -12,
    outsideWallColor: "#131862",
    outsideFloorColor: "#7BB369",
  },

  roomColors: {
    // Distinct wall colors help you keep your bearings while testing movement.
    north: 0x5d608c,
    south: 0x131a13,
    east: 0x1e856d,
    west: 0x3e0b4d,
    floor: 0xb89898,
    ceiling: 0x591a1a,
  },

  player: {
    // collisionMargin is extra padding around the visible collider circle.
    collisionMargin: 0.08,

    // moveSpeed is forward/back keyboard speed in scene units per second.
    moveSpeed: 1.55,

    // walkPhaseSpeed is how quickly the leg cycle advances while walking.
    walkPhaseSpeed: 6.4,
  },

  camera: {
    startDistance: 6.6,
    startHeight: 2.6,
    keyboardOrbitSpeed: 1.5,
    keyboardZoomSpeed: 3.2,
    keyboardHeightSpeed: 2.1,
    minDistance: 2.2,
    maxDistance: 30,
    minHeight: 0.8,
    maxHeight: 8,

    // Wheel zoom has a slightly closer max than arrow-key zoom so trackpad
    // gestures stay easy to control while placing pivots.
    wheelMaxDistance: 18,
  },

  ghostSpheres: {
    // Lower this first if the scene ever feels heavy on your machine.
    count: 170,
    color: "#7f827f",
  },

  worldDebug: {
    /*
      These colors only affect the visual debug overlay. They do not change the
      real collision logic.
    */
    wallColor: "#ff5d73",
    treeColor: "#ffd166",
    boundsColor: "#78c7ff",
    encounterColor: "#e0dcdc",

    // Debug meshes hover a hair above the floor to avoid z-fighting with the
    // floor material.
    floorLift: 0.045,
  },

  trees: {
    // This is the simple circular collision shell around each tree.
    colliderRadius: 1.15,
  },

  jupiter: {
    // This uses the texture you added in assets/Jupiter.jpg.
    texturePath: "assets/Jupiter.jpg",
    radius: 8,
    widthSegments: 32,
    heightSegments: 16,
    position: [0, 15, -20],
    color: 0x7a7979,
  },

  audio: {
    // Browsers often block autoplay until the user interacts with the page.
    // The play() call below catches that gracefully so the console stays clean.
    backgroundPath: "assets/background.mp3",
    loop: true,
    autoplay: true,
  },
};

//=============================================================
// LOADER OVERLAY LOGIC BEGIN
// NOTE:
// This project used "workshop" first and "lab" later.
// For now, "lab" in this loader means the visible Empyrean Puppet Workshop UI.
//=============================================================

const loaderOverlay = document.getElementById("loader-overlay");

function revealWorkshop() {
  setTimeout(() => {
    loaderOverlay?.classList.add("loader-hidden");
  }, 500);
}

function initWorkshopLoader() {
  try {
    // Main Three.js setup already happens elsewhere:
    // buildExplorationWorld(), buildSkeletonWorkshop(), buildGui(), animate(), etc.
    // This loader simply gives the scene a moment to draw before revealing it.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        revealWorkshop();
      });
    });
  } catch (err) {
    console.error("Workshop initialization failed", err);
    revealWorkshop();
  }
}

initWorkshopLoader();

//=============================================================
// LOADER OVERLAY LOGIC END
//=============================================================
//initLab();

//=============================================================
// BACKGROUND AUDIO
//=============================================================
/*
  This is intentionally tiny and easy to remove.

  Browser reality:
    Most browsers block autoplay until the user clicks/presses a key. When that
    happens, play() rejects its Promise. Catching the rejection prevents a scary
    red console error during normal development.
*/
const myAudio = new Audio(SOLO_TWEAKS.audio.backgroundPath);
myAudio.loop = SOLO_TWEAKS.audio.loop;
if (SOLO_TWEAKS.audio.autoplay) {
  myAudio.play().catch((error) => {
    console.info("Background audio is waiting for user interaction.", error);
  });
}

/*
  EMPYREAN PUPPET LAB

  This file currently does three big jobs:

  1. Build a small explorable Three.js world.
     - The world is made from primitive geometry: boxes for rooms/walls/floors,
       cones/cylinders for trees, and wireframe spheres for the moving "ghost"
       lights around the outside enclosure.

  2. Build and animate a puppet skeleton.
     - The puppet is not yet a full production character rig. It is a readable
       joint hierarchy made from THREE.Group objects. Each group is a pivot.
       Children inherit movement from parents, exactly like a real skeleton.

  3. Import a mesh, generate approximate skin weights, and drive that mesh from
     the puppet skeleton.
     - This is the experimental "render, adjust, rig" workflow. First you bring
       the mesh in as a static reference, then tune the joint pivots, then bind
       the mesh to generated bones that copy the puppet joints.

  Coordinate note:
  - Three.js uses Y as vertical height.
  - X is left/right across the floor.
  - Z is forward/back across the floor.
  - Most collision math only cares about X and Z, because the rig footprint is a
    circle sliding around on the floor.
*/

// ---------------------------------------------------------------------------
// WORLD SCALE AND ROOM CONSTANTS
// ---------------------------------------------------------------------------
// These values control the primitive geometry used to build the rooms and the
// outside exploration enclosure. All dimensions are in Three.js scene units.
const roomSize = SOLO_TWEAKS.world.roomSize;
const wallThickness = SOLO_TWEAKS.world.wallThickness;
const roomTransparency = SOLO_TWEAKS.world.roomTransparency;

// A tiny padding added to the visible collider radius so the rig does not rub
// directly on wall faces. If the avatar feels too far from obstacles, this is
// one of the first values to inspect.
const rigCollisionMargin = SOLO_TWEAKS.player.collisionMargin;

// Door geometry:
// - doorWidth is the horizontal gap in a wall.
// - doorHeight is how tall that passable gap is.
// The visible top header of the door is drawn, but it does not block movement.
const doorWidth = SOLO_TWEAKS.world.doorWidth;
const doorHeight = SOLO_TWEAKS.world.doorHeight;

// The outside enclosure is a large box around the rooms. It creates the feeling
// of going "outside" without needing infinite terrain or streaming chunks yet.
const outsideSize = SOLO_TWEAKS.world.outsideSize;
const outsideCenter = new THREE.Vector3(
  SOLO_TWEAKS.world.outsideCenterX,
  0,
  SOLO_TWEAKS.world.outsideCenterZ,
);
const outsideWallColor = SOLO_TWEAKS.world.outsideWallColor;
const outsideFloorColor = SOLO_TWEAKS.world.outsideFloorColor;

// Trees use circle colliders. The visual tree is a trunk plus cone leaves; this
// radius is the simple collision shell around the whole tree.
const treeColliderRadius = SOLO_TWEAKS.trees.colliderRadius;

// ---------------------------------------------------------------------------
// COLOR PALETTE
// ---------------------------------------------------------------------------
// Room colors are intentionally distinct so orientation is easy while testing.
const wallNorthColor = SOLO_TWEAKS.roomColors.north;
const wallSouthColor = SOLO_TWEAKS.roomColors.south;
const wallEastColor = SOLO_TWEAKS.roomColors.east;
const wallWestColor = SOLO_TWEAKS.roomColors.west;
const floorColor = SOLO_TWEAKS.roomColors.floor;
const ceilingColor = SOLO_TWEAKS.roomColors.ceiling;
const GHOST_SPHERE_COLOR = SOLO_TWEAKS.ghostSpheres.color;

// ---------------------------------------------------------------------------
// TEXTURE LOADING HELPERS
// ---------------------------------------------------------------------------
// The room texture set is made of diffuse, normal, ambient occlusion, and
// displacement maps. They are repeated across large surfaces so the rooms do
// not look like flat color panels.
const textureLoader = new THREE.TextureLoader();

function loadRepeatedTexture(path, repeatX, repeatY, colorSpace = null) {
  /*
    Loads one texture file and configures it to tile.

    Formula:
      texture repeat = (repeatX, repeatY)

    where:
      repeatX = number of horizontal repeats across the geometry UVs
      repeatY = number of vertical repeats across the geometry UVs

    colorSpace is only set for color textures, such as diffuse/albedo maps.
    Data textures like normal maps stay in their default linear space.
  */
  const texture = textureLoader.load(path);

  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);

  if (colorSpace) {
    texture.colorSpace = colorSpace;
  }

  return texture;
}

function loadRoomTextureSet(folder, repeatX = 4, repeatY = 4, options = {}) {
  /*
    Builds one complete MeshStandardMaterial for a room surface.

    Inputs:
      folder = folder that contains diffuse.jpg, normal.jpg, ao.jpg,
               displacement.jpg
      repeatX/repeatY = how often each texture tiles across the surface
      options.color = optional tint multiplied over the diffuse texture
      options.opacity = transparency for the final material
      options.displacementScale = how strongly the displacement map pushes
                                  vertices along their normals

    Note:
      Displacement only shows when the geometry has enough subdivisions. That is
      why room surfaces use BoxGeometry segment counts like 32 or 24.
  */
  const diffuse = loadRepeatedTexture(
    `${folder}/diffuse.jpg`,
    repeatX,
    repeatY,
    THREE.SRGBColorSpace,
  );
  const normal = loadRepeatedTexture(`${folder}/normal.jpg`, repeatX, repeatY);
  const ao = loadRepeatedTexture(`${folder}/ao.jpg`, repeatX, repeatY);
  const displacement = loadRepeatedTexture(
    `${folder}/displacement.jpg`,
    repeatX,
    repeatY,
  );

  return new THREE.MeshStandardMaterial({
    color: options.color || 0xffffff,
    map: diffuse,
    normalMap: normal,
    aoMap: ao,
    displacementMap: displacement,
    displacementScale: options.displacementScale ?? 0.018,
    roughness: 0.86,
    metalness: 0.02,
    transparent: true,
    opacity: options.opacity ?? roomTransparency,
  });
}

function cloneRoomMaterial(baseMaterial, color) {
  // Each wall gets a clone so changing one material's color/opacity never
  // accidentally changes every wall that was sharing the same base material.
  const material = baseMaterial.clone();
  material.color = new THREE.Color(color);
  return material;
}

function enableAmbientOcclusion(geometry) {
  // Three.js reads aoMap from uv2. BoxGeometry only creates uv by default, so
  // this copies the existing UV layout to uv2 and lets the baked AO texture work.
  if (geometry.attributes.uv && !geometry.attributes.uv2) {
    geometry.setAttribute(
      "uv2",
      new THREE.BufferAttribute(geometry.attributes.uv.array, 2),
    );
  }

  return geometry;
}

const wallTextureMaterial = loadRoomTextureSet("assets", 4, 2, {
  opacity: roomTransparency,
});
const floorTextureMaterial = loadRoomTextureSet("assets", 8, 8, {
  opacity: roomTransparency,
  displacementScale: 0.01,
});
const ceilingTextureMaterial = loadRoomTextureSet("assets", 4, 2, {
  opacity: roomTransparency,
  displacementScale: 0.012,
});

/*
  Each colored room surface reuses the same texture files, then multiplies the
  diffuse map by a surface color. This keeps the room readable as a tabletop
  "space" while still letting the texture show through.
*/
const roomSurfaceMaterials = {
  north: cloneRoomMaterial(wallTextureMaterial, wallNorthColor),
  south: cloneRoomMaterial(wallTextureMaterial, wallSouthColor),
  east: cloneRoomMaterial(wallTextureMaterial, wallEastColor),
  west: cloneRoomMaterial(wallTextureMaterial, wallWestColor),
  floor: cloneRoomMaterial(floorTextureMaterial, floorColor),
  ceiling: cloneRoomMaterial(ceilingTextureMaterial, ceilingColor),
};

const outsideWallMaterial = new THREE.MeshStandardMaterial({
  // Outside walls are deliberately translucent. They define the play boundary
  // while still letting the green floor, trees, and ghost spheres remain visible.
  color: outsideWallColor,
  roughness: 0.95,
  metalness: 0,
  transparent: true,
  opacity: 0.42,
});
const outsideFloorMaterial = new THREE.MeshStandardMaterial({
  color: outsideFloorColor,
  roughness: 0.9,
  metalness: 0,
});
const ghostSphereMaterial = new THREE.MeshBasicMaterial({
  // MeshBasicMaterial ignores lights. That is useful here because the ghost
  // spheres should read like self-lit wire shapes no matter where the camera is.
  color: GHOST_SPHERE_COLOR,
  wireframe: true,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const ghostGlowMaterial = new THREE.MeshBasicMaterial({
  // The glow is just a second, larger sphere with additive blending and very
  // low opacity. It is a cheap fake bloom that does not require post-processing.
  color: GHOST_SPHERE_COLOR,
  transparent: true,
  opacity: 0.035,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const treeLeafMaterial = new THREE.MeshStandardMaterial({
  color: "#457543",
  roughness: 0.85,
  metalness: 0,
});
const treeTrunkMaterial = new THREE.MeshStandardMaterial({
  color: "#cc9029",
  roughness: 0.82,
  metalness: 0,
});

const sceneContainer = document.getElementById("scene-container");
const STORAGE_KEY = "empyrean.puppetWorkshop.rigTuning.v1";
const WALL_COLOR = "#131111";
const GUIDE_COLOR = "#e0dcdc";
const DEFAULT_IMPORTED_MESH_PATH = "assets/femaleMesh.glb";

// Slider ranges. These are intentionally broad because the rig lab should be
// able to accommodate strange proportions, not only "normal" humanoids.
const ROOT_ALIGNMENT_RANGE = { min: -6, max: 6, step: 0.005 };
const JOINT_POINT_OFFSET_RANGE = { min: -4, max: 4, step: 0.005 };
const BIND_ROTATION_RANGE = { min: -Math.PI, max: Math.PI, step: 0.005 };
const AXIS_MARKER_SCALE_RANGE = { min: 0.03, max: 3, step: 0.01 };
const gltfLoader = new GLTFLoader();

const DEFAULT_RIG_HEIGHT = 4.46;

/*
  DEFAULT_RIG_DIMENSIONS

  These values describe the initial bind pose. "Bind pose" means the neutral
  reference pose used before animation.

  Vertical joints are stored as absolute heights from the floor:
    headY, neckY, chestY, torsoY, pelvisY

  Limb lengths are stored as segment lengths:
    upperArmLength, forearmLength, thighLength, shinLength

  createSkeleton() converts the absolute heights into parent-relative joint
  offsets. That is why, for example:

    neck local Y = neckY - chestY

  The neck joint is a child of the chest joint, so it only needs to know how far
  it sits above its parent, not its final world height.
*/
const DEFAULT_RIG_DIMENSIONS = {
  headY: DEFAULT_RIG_HEIGHT * 0.91,
  neckY: DEFAULT_RIG_HEIGHT * 0.84,
  chestY: DEFAULT_RIG_HEIGHT * 0.72,
  torsoY: DEFAULT_RIG_HEIGHT * 0.6,
  pelvisY: DEFAULT_RIG_HEIGHT * 0.5,

  shoulderX: DEFAULT_RIG_HEIGHT * 0.19,
  hipX: DEFAULT_RIG_HEIGHT * 0.09,

  upperArmLength: DEFAULT_RIG_HEIGHT * 0.19,
  forearmLength: DEFAULT_RIG_HEIGHT * 0.17,

  thighLength: DEFAULT_RIG_HEIGHT * 0.245,
  shinLength: DEFAULT_RIG_HEIGHT * 0.245,
};
const PRESETS = {
  /*
    Motion presets are groups of related animation tuning values. They do not
    change joint geometry. They only change how much idle movement, breathing,
    arm lag, and damping are applied.
  */
  calmAlien: {
    motionSpeed: 0.72,
    breathingAmplitude: 0.035,
    headDriftAmplitude: 0.11,
    torsoSwayAmplitude: 0.055,
    armTrailAmplitude: 0.18,
    damping: 3.1,
  },
  uncannyGrace: {
    motionSpeed: 0.55,
    breathingAmplitude: 0.028,
    headDriftAmplitude: 0.17,
    torsoSwayAmplitude: 0.08,
    armTrailAmplitude: 0.22,
    damping: 2.25,
  },
  nervousTic: {
    motionSpeed: 1.35,
    breathingAmplitude: 0.024,
    headDriftAmplitude: 0.09,
    torsoSwayAmplitude: 0.04,
    armTrailAmplitude: 0.12,
    damping: 7.8,
  },
  teacherMode: {
    motionSpeed: 0.9,
    breathingAmplitude: 0.03,
    headDriftAmplitude: 0.08,
    torsoSwayAmplitude: 0.035,
    armTrailAmplitude: 0.14,
    damping: 4.8,
  },
};

const RIG_DIMENSION_CONTROLS = [
  /*
    GUI rows for the "Rig Dimensions" folder.

    Format:
      [propertyName, min, max, step]

    The min/max values are intentionally permissive so future imported meshes
    with very long necks, odd limbs, or stylized bodies can still be matched.
  */
  ["headY", -1, 12, 0.01],
  ["neckY", -1, 11, 0.01],
  ["chestY", -1, 10, 0.01],
  ["torsoY", -1, 9, 0.01],
  ["pelvisY", -1, 8, 0.01],
  ["shoulderX", 0, 4, 0.01],
  ["hipX", 0, 3, 0.01],
  ["upperArmLength", 0.02, 6, 0.01],
  ["forearmLength", 0.02, 6, 0.01],
  ["thighLength", 0.02, 6, 0.01],
  ["shinLength", 0.02, 6, 0.01],
];

const JOINT_ORDER = [
  /*
    This order determines:
      - which joints get XYZ point-offset sliders
      - which joints get bind-pose rotation sliders
      - how saved tuning data is sanitized

    The actual parent/child hierarchy is built later in createSkeleton().
  */
  "body",
  "pelvis",
  "spineBase",
  "chest",
  "neck",
  "head",
  "leftClavicle",
  "leftShoulder",
  "leftElbow",
  "leftWrist",
  "leftPalm",
  "leftFinger1Base",
  "leftFinger2Base",
  "leftFinger3Base",
  "rightClavicle",
  "rightShoulder",
  "rightElbow",
  "rightWrist",
  "rightPalm",
  "rightFinger1Base",
  "rightFinger2Base",
  "rightFinger3Base",
  "leftHip",
  "leftKnee",
  "leftAnkle",
  "leftFoot",
  "rightHip",
  "rightKnee",
  "rightAnkle",
  "rightFoot",
];

const AXIS_MARKER_JOINTS = ["root", ...JOINT_ORDER];
const BIND_ROTATION_JOINTS = [...JOINT_ORDER];
const MOUSE_EDIT_JOINTS = [...JOINT_ORDER];
const RIG_TUNING_KEYS = [
  /*
    Only these properties are saved/exported/imported. This protects the app
    from old localStorage blobs or pasted JSON adding unexpected properties to
    rigTuning.
  */
  "labEnabled",
  "skeletonVisible",
  "showJointLabels",
  "showAxisMarker",
  "showRigCollider",
  "showWorldDebug",
  "showWallColliders",
  "showTreeColliders",
  "showOutsideBounds",
  "showEncounterZones",
  "showEncounterLabels",
  "encounterSystemEnabled",
  "rigMeshMode",
  "rigMeshStartPose",
  "importedMeshPath",
  "importedMeshVisible",
  "importedMeshOpacity",
  "importedMeshWireframe",
  "importedMeshAutoFit",
  "importedMeshScale",
  "importedMeshOffsetX",
  "importedMeshOffsetY",
  "importedMeshOffsetZ",
  "importedMeshRotationX",
  "importedMeshRotationY",
  "importedMeshRotationZ",
  "presetName",
  "idleMotion",
  "walkPreview",
  "motionSpeed",
  "breathingAmplitude",
  "headDriftAmplitude",
  "torsoSwayAmplitude",
  "armTrailAmplitude",
  "damping",
  "walkAmplitude",
  "jumpHeight",
  "jumpDuration",
  "jumpGravityScale",
  "jumpCrouchDepth",
  "colliderRadius",
  "phaseOffset",
  "rootOffsetX",
  "rootOffsetY",
  "rootOffsetZ",
  "labelScale",
  "axisMarkerJoint",
  "axisMarkerScale",
  "mouseJointEditMode",
  "mouseJointEditJoint",
  "jointPointOffsets",
  "bindRotationOffsets",
  ...Object.keys(DEFAULT_RIG_DIMENSIONS),
];

const scene = new THREE.Scene();
scene.background = new THREE.Color(WALL_COLOR);
scene.fog = new THREE.FogExp2(WALL_COLOR, 0.018);

const camera = new THREE.PerspectiveCamera(
  42,
  sceneContainer.clientWidth / sceneContainer.clientHeight,
  0.1,
  160,
);
const worldCollision = {
  /*
    Collision is stored separately from visual meshes.

    bounds:
      The outside box that keeps the player inside the explorable area.

    solidRects:
      Axis-aligned wall rectangles in top-down X/Z space.

    solidCircles:
      Circular obstacles, currently used by low-poly trees.

    This is intentionally simple. It is not a physics engine. It is a readable
    collision map for avatar exploration and rig testing.
  */
  bounds: null,
  solidRects: [],
  solidCircles: [],
};
const explorationWorld = buildExplorationWorld();
scene.add(explorationWorld.group);
const ghostSpheres = buildGhostSpheres(SOLO_TWEAKS.ghostSpheres.count);

//-------------------------------------------------------------
//-------------------------------------------------------------
// JUPITER / SKY FOCAL POINT
/*
  This is the big planet you added.

  It is intentionally not part of collision. It is a sky/world object: a visual
  anchor that sits above the exploration area. If you want to move, resize, or
  swap it, start with SOLO_TWEAKS.jupiter near the top of this file.
*/
const loader = new THREE.TextureLoader();
const jupiterTexture = loader.load(
  SOLO_TWEAKS.jupiter.texturePath,
  () => console.log("Jupiter texture loaded successfully."),
  undefined,
  (error) => console.error("Error loading Jupiter texture:", error),
);
const jupiter = new THREE.Mesh(
  new THREE.SphereGeometry(
    SOLO_TWEAKS.jupiter.radius,
    SOLO_TWEAKS.jupiter.widthSegments,
    SOLO_TWEAKS.jupiter.heightSegments,
  ),
  new THREE.MeshBasicMaterial({
    // MeshBasicMaterial is unlit, so Jupiter remains visible without needing
    // scene lights or emissive material settings.
    map: jupiterTexture,
    color: SOLO_TWEAKS.jupiter.color,
  }),
);
jupiter.name = "sky-jupiter";
scene.add(jupiter);
jupiter.position.set(...SOLO_TWEAKS.jupiter.position);

// ======================================================
// WORLD / ROOM / OUTSIDE HELPERS
// ======================================================

function buildExplorationWorld() {
  /*
    Creates the complete explorable space.

    Layout, viewed from above:

      negative Z room
            |
      negative X room -- central room -- outside door to open enclosure

    "Negative X" and "negative Z" mean their centers are shifted by -roomSize
    along that axis from the central room.

    The returned object contains a single group, but the collision information
    is registered into worldCollision as the pieces are created.
  */
  const group = new THREE.Group();

  group.name = "empyrean-three-room-exploration-world";

  // The outside boundary is the master play area. Individual room walls and
  // trees add obstacles inside this boundary.
  worldCollision.bounds = {
    centerX: outsideCenter.x,
    centerZ: outsideCenter.z,
    halfSize: outsideSize / 2,
  };

  group.add(createOutsideEnclosure());

  [
    /*
      doors:
        north/south/east/west true means that wall is split into:
          - left/bottom side blocker
          - right/top side blocker
          - visual header above the doorway

      Only the side pieces block movement. The header is visual only so the
      floor-level circular collider can pass through.
    */
    {
      name: "central-room",
      center: new THREE.Vector3(0, roomSize / 2, 0),
      doors: { north: true, south: true, west: true },
    },
    {
      name: "negative-x-room",
      center: new THREE.Vector3(-roomSize, roomSize / 2, 0),
      doors: { east: true },
    },
    {
      name: "negative-z-room",
      center: new THREE.Vector3(0, roomSize / 2, -roomSize),
      doors: { south: true },
    },
  ].forEach((roomConfig) => {
    group.add(createRoom(roomConfig));
  });

  buildLowPolyTrees(group);
  return { group };
}

function createOutsideEnclosure() {
  /*
    Builds the large "outside" box around the rooms.

    Visual pieces:
      floor   = green box, very thin in Y
      ceiling = blue/purple box, very thin in Y
      walls   = four blue/purple boundary boxes

    Collision pieces:
      four solid rectangles in X/Z top-down space. The floor and ceiling do not
      need collision because the avatar is not currently flying into them.
  */
  const group = new THREE.Group();
  const half = outsideSize / 2;
  const centerX = outsideCenter.x;
  const centerZ = outsideCenter.z;
  const wallHeight = roomSize;
  const wallY = wallHeight / 2;
  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(outsideSize, wallThickness, outsideSize),
    outsideFloorMaterial,
  );
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(outsideSize, wallThickness, outsideSize),
    outsideWallMaterial.clone(),
  );
  const northWall = new THREE.Mesh(
    new THREE.BoxGeometry(outsideSize, wallHeight, wallThickness),
    outsideWallMaterial.clone(),
  );
  const southWall = new THREE.Mesh(
    new THREE.BoxGeometry(outsideSize, wallHeight, wallThickness),
    outsideWallMaterial.clone(),
  );
  const eastWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, wallHeight, outsideSize),
    outsideWallMaterial.clone(),
  );
  const westWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, wallHeight, outsideSize),
    outsideWallMaterial.clone(),
  );

  floor.name = "outside-green-floor";
  ceiling.name = "outside-blue-ceiling";
  floor.position.set(centerX, -wallThickness / 2, centerZ);
  ceiling.position.set(centerX, wallHeight + wallThickness / 2, centerZ);
  northWall.position.set(centerX, wallY, centerZ - half);
  southWall.position.set(centerX, wallY, centerZ + half);
  eastWall.position.set(centerX + half, wallY, centerZ);
  westWall.position.set(centerX - half, wallY, centerZ);

  [floor, ceiling, northWall, southWall, eastWall, westWall].forEach((part) => {
    group.add(part);
  });

  addSolidRect(centerX, centerZ - half, outsideSize, wallThickness);
  addSolidRect(centerX, centerZ + half, outsideSize, wallThickness);
  addSolidRect(centerX + half, centerZ, wallThickness, outsideSize);
  addSolidRect(centerX - half, centerZ, wallThickness, outsideSize);

  return group;
}

function createRoom({ name, center, doors = {} }) {
  /*
    Creates one room at a world-space center point.

    Important geometry detail:
      The roomGroup is positioned at the room center. Floor, ceiling, and wall
      meshes are placed relative to that group. Collision rectangles, however,
      are stored in absolute world X/Z coordinates.

    center.y is roomSize / 2, which makes the local floor sit at world Y = 0:
      world floor Y = center.y + localFloorY
                    = roomSize / 2 + (-roomSize / 2)
                    = 0
  */
  const roomGroup = new THREE.Group();
  const localFloorY = -roomSize / 2;
  const floor = new THREE.Mesh(
    enableAmbientOcclusion(
      new THREE.BoxGeometry(roomSize, wallThickness, roomSize, 32, 1, 32),
    ),
    roomSurfaceMaterials.floor,
  );
  const ceiling = new THREE.Mesh(
    enableAmbientOcclusion(
      new THREE.BoxGeometry(roomSize, wallThickness, roomSize, 32, 1, 32),
    ),
    roomSurfaceMaterials.ceiling,
  );

  roomGroup.name = name;
  roomGroup.position.copy(center);
  floor.position.set(0, localFloorY, 0);
  ceiling.position.set(0, roomSize / 2, 0);
  roomGroup.add(floor, ceiling);

  addRoomWall(roomGroup, center, "north", doors.north);
  addRoomWall(roomGroup, center, "south", doors.south);
  addRoomWall(roomGroup, center, "east", doors.east);
  addRoomWall(roomGroup, center, "west", doors.west);

  return roomGroup;
}

function addRoomWall(roomGroup, roomCenter, side, hasDoor = false) {
  /*
    Adds one wall to a room, optionally with a doorway.

    No doorway:
      one full wall segment, blocks movement.

    With doorway:
      left/right side wall segments block movement.
      top header segment is visual only.

    Door math:
      sideLength = (roomSize - doorWidth) / 2

    Example:
      If roomSize is 24 and doorWidth is 4.4:
        sideLength = (24 - 4.4) / 2 = 9.8

      That leaves:
        9.8 wall + 4.4 door gap + 9.8 wall = 24 total width
  */
  const material = roomSurfaceMaterials[side];
  const sideLength = hasDoor ? (roomSize - doorWidth) / 2 : roomSize;
  const sideOffset = hasDoor ? doorWidth / 2 + sideLength / 2 : 0;
  const topHeight = roomSize - doorHeight;
  const topY = -roomSize / 2 + doorHeight + topHeight / 2;

  if (!hasDoor) {
    addWallSegment(
      roomGroup,
      roomCenter,
      side,
      0,
      0,
      roomSize,
      roomSize,
      material,
      true,
    );
    return;
  }

  addWallSegment(
    roomGroup,
    roomCenter,
    side,
    -sideOffset,
    0,
    sideLength,
    roomSize,
    material,
    true,
  );
  addWallSegment(
    roomGroup,
    roomCenter,
    side,
    sideOffset,
    0,
    sideLength,
    roomSize,
    material,
    true,
  );
  addWallSegment(
    roomGroup,
    roomCenter,
    side,
    0,
    topY,
    doorWidth,
    topHeight,
    material,
    false,
  );
}

function addWallSegment(
  roomGroup,
  roomCenter,
  side,
  alongOffset,
  y,
  alongLength,
  height,
  material,
  blocksMovement,
) {
  /*
    Draws one rectangular wall piece and optionally adds matching collision.

    Parameters:
      side          = north/south/east/west
      alongOffset   = offset along the wall's long direction
      y             = local Y center of the segment
      alongLength   = wall width along the long direction
      height        = wall height
      blocksMovement = whether this piece becomes a solid X/Z rectangle

    For north/south walls:
      long direction is X, thickness is Z.

    For east/west walls:
      long direction is Z, thickness is X.
  */
  const isNorthSouth = side === "north" || side === "south";
  const geometry = isNorthSouth
    ? new THREE.BoxGeometry(alongLength, height, wallThickness, 24, 24, 1)
    : new THREE.BoxGeometry(wallThickness, height, alongLength, 1, 24, 24);
  const mesh = new THREE.Mesh(enableAmbientOcclusion(geometry), material);
  const local = new THREE.Vector3();

  if (side === "north") {
    local.set(alongOffset, y, -roomSize / 2);
  } else if (side === "south") {
    local.set(alongOffset, y, roomSize / 2);
  } else if (side === "east") {
    local.set(roomSize / 2, y, alongOffset);
  } else {
    local.set(-roomSize / 2, y, alongOffset);
  }

  mesh.position.copy(local);
  mesh.material.transparent = true;
  mesh.material.opacity = roomTransparency;
  roomGroup.add(mesh);

  if (blocksMovement) {
    // The mesh is local to the room group, so add roomCenter to get the matching
    // world-space collision rectangle.
    addSolidRect(
      roomCenter.x + local.x,
      roomCenter.z + local.z,
      isNorthSouth ? alongLength : wallThickness,
      isNorthSouth ? wallThickness : alongLength,
    );
  }
}

function addSolidRect(centerX, centerZ, width, depth) {
  /*
    Registers an axis-aligned rectangular obstacle in top-down space.

    Stored form:
      minX/maxX/minZ/maxZ

    This is faster and easier to test than keeping width/depth and recomputing
    the rectangle edges every frame.
  */
  worldCollision.solidRects.push({
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minZ: centerZ - depth / 2,
    maxZ: centerZ + depth / 2,
  });
}

function addSolidCircle(centerX, centerZ, radius) {
  // Registers a circular obstacle in X/Z space. Trees use these because their
  // footprint reads better as a circle than as a square.
  worldCollision.solidCircles.push({ centerX, centerZ, radius });
}

function buildLowPolyTrees(parent) {
  /*
    Places primitive trees around the outside area.

    Each tree is:
      trunk  = CylinderGeometry, color #cc9029
      leaves = ConeGeometry, color #457543

    Each tree also gets a circular collider using treeColliderRadius.
  */
  const treePositions = [
    [-42, 18],
    [-34, 27],
    [-22, 22],
    [-8, 27],
    [9, 22],
    [24, 13],
    [27, -7],
    [20, -24],
    [28, -38],
    [8, -44],
    [-12, -42],
    [-33, -43],
    [-48, -28],
    [-45, -8],
    [-51, 10],
    [-31, 15],
  ];

  treePositions.forEach(([x, z], index) => {
    const tree = createLowPolyTree(index);
    tree.position.set(x, 0, z);
    parent.add(tree);
    addSolidCircle(x, z, treeColliderRadius);
  });
}

function createLowPolyTree(index) {
  /*
    Builds one tree as a THREE.Group so the trunk and leaves travel together if
    the tree is moved, cloned, or removed later.

    The cone has only 7 radial segments on purpose: this keeps the low-poly
    tabletop/game-piece look.
  */
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.22, 0.28, 1.35, 7),
    treeTrunkMaterial,
  );
  const leaves = new THREE.Mesh(
    new THREE.ConeGeometry(1.15, 3.2, 7),
    treeLeafMaterial,
  );

  group.name = `low-poly-tree-${index + 1}`;
  trunk.position.y = 0.675;
  leaves.position.y = 2.45;
  leaves.rotation.y = index * 0.37;
  group.add(trunk, leaves);
  return group;
}

function buildGhostSpheres(count) {
  /*
    Recycled from the avatar build: floating wireframe ghost spheres.

    Each visible sphere is actually two meshes sharing one position:
      1. a wireframe sphere
      2. a larger, very transparent glow sphere

    The function returns an array of motion records instead of only the meshes.
    updateGhostSphereMotion() uses those records every frame.
  */
  const spheres = [];
  const geometry = new THREE.SphereGeometry(1, 14, 10);

  for (let index = 0; index < count; index += 1) {
    const group = new THREE.Group();
    const radius = 0.055 + Math.random() * 0.12;
    const basePosition = makeGhostSpherePosition();
    const wire = new THREE.Mesh(geometry, ghostSphereMaterial.clone());
    const glow = new THREE.Mesh(geometry, ghostGlowMaterial.clone());

    wire.scale.setScalar(radius);
    wire.material.opacity = 0.34 + Math.random() * 0.28;
    glow.scale.setScalar(radius * 2.15);
    glow.material.opacity = 0.018 + Math.random() * 0.04;

    group.position.copy(basePosition);
    group.add(glow, wire);
    scene.add(group);

    spheres.push({
      group,
      basePosition,
      // Maximum drift away from basePosition. The actual offset is multiplied
      // by a sine wave in updateGhostSphereMotion().
      drift: new THREE.Vector3(
        (Math.random() - 0.5) * 0.7,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.7,
      ),
      // Each sphere gets a unique phase and speed so the movement does not look
      // synchronized or mechanical.
      phase: Math.random() * Math.PI * 2,
      speed: 0.2 + Math.random() * 0.55,
      spin: new THREE.Vector3(
        Math.random() * 0.25,
        Math.random() * 0.35,
        Math.random() * 0.2,
      ),
    });
  }

  return spheres;
}

function makeGhostSpherePosition() {
  /*
    Picks a starting position that hugs either:
      - the ceiling, or
      - one of the four outside walls

    face is a random selector:
      < 0.48     ceiling
      < 0.61     west wall
      < 0.74     east wall
      < 0.87     north wall
      otherwise  south wall

    The random ranges avoid the exact edges so spheres do not spawn halfway
    outside the enclosure.
  */
  const half = outsideSize / 2;
  const face = Math.random();
  const minX = outsideCenter.x - half;
  const maxX = outsideCenter.x + half;
  const minZ = outsideCenter.z - half;
  const maxZ = outsideCenter.z + half;

  if (face < 0.48) {
    return new THREE.Vector3(
      THREE.MathUtils.randFloat(minX + 3, maxX - 3),
      roomSize - THREE.MathUtils.randFloat(0.4, 2.5),
      THREE.MathUtils.randFloat(minZ + 3, maxZ - 3),
    );
  }

  if (face < 0.61) {
    return new THREE.Vector3(
      minX + THREE.MathUtils.randFloat(0.5, 1.8),
      THREE.MathUtils.randFloat(4.5, roomSize - 1),
      THREE.MathUtils.randFloat(minZ + 3, maxZ - 3),
    );
  }

  if (face < 0.74) {
    return new THREE.Vector3(
      maxX - THREE.MathUtils.randFloat(0.5, 1.8),
      THREE.MathUtils.randFloat(4.5, roomSize - 1),
      THREE.MathUtils.randFloat(minZ + 3, maxZ - 3),
    );
  }

  if (face < 0.87) {
    return new THREE.Vector3(
      THREE.MathUtils.randFloat(minX + 3, maxX - 3),
      THREE.MathUtils.randFloat(4.5, roomSize - 1),
      minZ + THREE.MathUtils.randFloat(0.5, 1.8),
    );
  }

  return new THREE.Vector3(
    THREE.MathUtils.randFloat(minX + 3, maxX - 3),
    THREE.MathUtils.randFloat(4.5, roomSize - 1),
    maxZ - THREE.MathUtils.randFloat(0.5, 1.8),
  );
}

function updateGhostSphereMotion(elapsed) {
  /*
    Animates the ghost spheres.

    Formula:
      offset = sin(elapsed * speed + phase)
      currentPosition = basePosition + drift * offset

    where:
      elapsed = seconds since page start
      speed   = individual sphere speed multiplier
      phase   = individual starting angle in radians
      drift   = maximum movement vector from the base position

    Result:
      Each sphere eases back and forth around its own home point while spinning.
  */
  ghostSpheres.forEach((sphere) => {
    const offset = Math.sin(elapsed * sphere.speed + sphere.phase);

    sphere.group.position.set(
      sphere.basePosition.x + sphere.drift.x * offset,
      sphere.basePosition.y + sphere.drift.y * offset,
      sphere.basePosition.z + sphere.drift.z * offset,
    );

    sphere.group.rotation.x += sphere.spin.x * 0.01;
    sphere.group.rotation.y += sphere.spin.y * 0.01;
    sphere.group.rotation.z += sphere.spin.z * 0.01;
  });
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
renderer.setClearColor(WALL_COLOR, 1);
renderer.outputColorSpace = THREE.SRGBColorSpace;
sceneContainer.appendChild(renderer.domElement);

const clock = new THREE.Clock();
const rigTuning = loadSavedRigTuning(makeDefaultRigTuning());

const state = {
  /*
    state stores things that are created at runtime and may be disposed/rebuilt.

    These are not saved directly. They are live Three.js objects, GUI handles,
    and animation bookkeeping values.
  */
  skeleton: null,
  debugView: null,
  worldDebugView: null,
  encounterRuntime: null,
  axisHelper: null,
  rigCollider: null,
  importedPreview: null,
  importedSkin: null,
  importedMeshStatus: "no mesh loaded",
  gui: null,
  guiControllers: [],
  guiFolders: {},
  walkPhase: 0,
  lastVisibilityKey: "",
};

const controlState = {
  /*
    controlState stores the player's active input/movement state.

    rigTuning says what the rig should generally be like.
    controlState says what the user is doing right now.
  */
  keys: new Set(),

  // yaw rotates the puppet/player. cameraYaw orbits the camera around that
  // player-facing direction.
  yaw: 0,
  position: new THREE.Vector3(0, 0, 0),
  walkPhase: 0,
  cameraYaw: 0,
  cameraDistance: SOLO_TWEAKS.camera.startDistance,
  cameraHeight: SOLO_TWEAKS.camera.startHeight,
  waveUntil: 0,
  leftArm: "down",
  rightArm: "down",
  jump: {
    /*
      Jump is modeled as a tiny state machine:

        grounded -> crouch -> air -> landing -> grounded

      offsetY is the vertical root displacement added to the skeleton root.
      velocityY is only used during the "air" phase.
    */
    phase: "grounded",
    elapsed: 0,
    offsetY: 0,
    velocityY: 0,
    crouchDuration: 0.12,
    landingDuration: 0.18,
  },
};

const mouseJointEditor = {
  /*
    Tiny pointer editing state for dragging joint pivot markers.

    The drag does not create a new kind of rig data. It writes back into the
    existing Joint Point Offset values, which keeps saving/exporting/sliders
    working exactly the same way.
  */
  raycaster: new THREE.Raycaster(),
  pointer: new THREE.Vector2(),
  dragPlane: new THREE.Plane(),
  dragStartWorld: new THREE.Vector3(),
  dragCurrentWorld: new THREE.Vector3(),
  dragStartLocal: new THREE.Vector3(),
  dragStartParentLocal: new THREE.Vector3(),
  dragCurrentParentLocal: new THREE.Vector3(),
  selectedJointKey: null,
  dragging: false,
};

/*
  Encounter and world-debug setup happens after worldCollision has been filled
  by buildExplorationWorld().

  encounterRuntime:
    Tracks which encounter trigger zones the avatar is currently inside.

  worldDebugView:
    Draws optional visual overlays for wall colliders, tree colliders, outside
    bounds, and encounter trigger zones.
*/
state.encounterRuntime = createEncounterRuntime(ENCOUNTER_DEFINITIONS);
state.worldDebugView = createWorldDebugView();
scene.add(state.worldDebugView.group);
applyWorldDebugVisibility();

function makeDefaultRigTuning() {
  /*
    Creates the complete default rig tuning object.

    These values are copied into rigTuning on first load, reset, or when saved
    data is missing a property. Anything added to RIG_TUNING_KEYS should also
    have a sensible default here.
  */
  return {
    labEnabled: true,
    skeletonVisible: true,
    showJointLabels: true,
    showAxisMarker: true,
    showRigCollider: true,
    showWorldDebug: false,
    showWallColliders: true,
    showTreeColliders: true,
    showOutsideBounds: true,
    showEncounterZones: true,
    showEncounterLabels: true,
    encounterSystemEnabled: true,
    rigMeshMode: false,
    rigMeshStartPose: "current",
    importedMeshPath: DEFAULT_IMPORTED_MESH_PATH,
    importedMeshVisible: true,
    importedMeshOpacity: 0.72,
    importedMeshWireframe: false,
    importedMeshAutoFit: true,
    importedMeshScale: 1,
    importedMeshOffsetX: 0,
    importedMeshOffsetY: 0,
    importedMeshOffsetZ: 0,
    importedMeshRotationX: 0,
    importedMeshRotationY: 0,
    importedMeshRotationZ: 0,
    presetName: "calmAlien",
    idleMotion: true,
    walkPreview: false,
    motionSpeed: PRESETS.calmAlien.motionSpeed,
    breathingAmplitude: PRESETS.calmAlien.breathingAmplitude,
    headDriftAmplitude: PRESETS.calmAlien.headDriftAmplitude,
    torsoSwayAmplitude: PRESETS.calmAlien.torsoSwayAmplitude,
    armTrailAmplitude: PRESETS.calmAlien.armTrailAmplitude,
    damping: PRESETS.calmAlien.damping,
    walkAmplitude: 1,
    jumpHeight: 0.85,
    jumpDuration: 0.9,
    jumpGravityScale: 1,
    jumpCrouchDepth: 0.18,
    colliderRadius: 0.36,
    phaseOffset: 0,
    rootOffsetX: 0,
    rootOffsetY: 0,
    rootOffsetZ: 0,
  labelScale: 1,
  axisMarkerJoint: "head",
  axisMarkerScale: 0.32,
  mouseJointEditMode: false,
  mouseJointEditJoint: "head",
  jointPointOffsets: makeDefaultJointPointOffsets(),
    bindRotationOffsets: makeDefaultBindRotationOffsets(),
    ...DEFAULT_RIG_DIMENSIONS,
  };
}

function makeDefaultJointPointOffsets() {
  // One XYZ offset object per joint. These offsets move pivot positions in the
  // bind pose and are useful when matching a skeleton to a specific mesh.
  return JOINT_ORDER.reduce((offsets, jointName) => {
    offsets[jointName] = { x: 0, y: 0, z: 0 };
    return offsets;
  }, {});
}

function makeDefaultBindRotationOffsets() {
  // One XYZ Euler rotation object per joint. These rotations are rest-pose
  // corrections, not active animation values.
  return BIND_ROTATION_JOINTS.reduce((offsets, jointName) => {
    offsets[jointName] = { x: 0, y: 0, z: 0 };
    return offsets;
  }, {});
}

function loadSavedRigTuning(defaults) {
  /*
    Reads browser localStorage.

    localStorage survives page refreshes on the same browser/profile, which is
    perfect for an experimental workshop where sliders are tuned over time.

    If the saved JSON is missing, corrupt, or old, sanitizeRigTuning() fills in
    missing keys from defaults.
  */
  try {
    const savedText = window.localStorage.getItem(STORAGE_KEY);

    if (!savedText) {
      return defaults;
    }

    const saved = JSON.parse(savedText);
    return sanitizeRigTuning({ ...defaults, ...(saved.values || saved) });
  } catch (error) {
    console.warn("Could not load Empyrean tuning.", error);
    return defaults;
  }
}

function sanitizeRigTuning(candidate) {
  /*
    Produces a clean rig tuning object from unknown input.

    This protects against:
      - old saves from previous versions
      - pasted export data with missing keys
      - bad axis marker names
      - incomplete joint offset or rotation tables
  */
  const defaults = makeDefaultRigTuning();
  const clean = RIG_TUNING_KEYS.reduce((values, key) => {
    values[key] = candidate[key] ?? defaults[key];
    return values;
  }, {});

  clean.axisMarkerJoint = AXIS_MARKER_JOINTS.includes(clean.axisMarkerJoint)
    ? clean.axisMarkerJoint
    : defaults.axisMarkerJoint;
  clean.rigMeshStartPose = ["current", "aPose", "tPose", "custom"].includes(
    clean.rigMeshStartPose,
  )
    ? clean.rigMeshStartPose
    : defaults.rigMeshStartPose;
  clean.mouseJointEditJoint = MOUSE_EDIT_JOINTS.includes(
    clean.mouseJointEditJoint,
  )
    ? clean.mouseJointEditJoint
    : defaults.mouseJointEditJoint;
  clean.jointPointOffsets = sanitizeJointPointOffsets(
    clean.jointPointOffsets,
    defaults.jointPointOffsets,
  );
  clean.bindRotationOffsets = sanitizeBindRotationOffsets(
    clean.bindRotationOffsets,
    defaults.bindRotationOffsets,
  );

  return clean;
}

function sanitizeJointPointOffsets(
  candidate,
  defaults = makeDefaultJointPointOffsets(),
) {
  /*
    Normalizes the saved joint offset table.

    For each joint, x/y/z must be finite numbers. Anything missing or invalid is
    replaced with that joint's default value.
  */
  return JOINT_ORDER.reduce((offsets, jointName) => {
    const source = candidate?.[jointName] || defaults[jointName];
    offsets[jointName] = {
      x: Number.isFinite(source?.x) ? source.x : defaults[jointName].x,
      y: Number.isFinite(source?.y) ? source.y : defaults[jointName].y,
      z: Number.isFinite(source?.z) ? source.z : defaults[jointName].z,
    };
    return offsets;
  }, {});
}

function sanitizeBindRotationOffsets(
  candidate,
  defaults = makeDefaultBindRotationOffsets(),
) {
  /*
    Same idea as sanitizeJointPointOffsets(), but for bind-pose Euler rotations.
    Values are radians because Three.js Euler rotations are in radians.
  */
  return BIND_ROTATION_JOINTS.reduce((offsets, jointName) => {
    const source = candidate?.[jointName] || defaults[jointName];
    offsets[jointName] = {
      x: Number.isFinite(source?.x) ? source.x : defaults[jointName].x,
      y: Number.isFinite(source?.y) ? source.y : defaults[jointName].y,
      z: Number.isFinite(source?.z) ? source.z : defaults[jointName].z,
    };
    return offsets;
  }, {});
}

function getSavableRigTuning() {
  // Creates a plain JSON-safe object containing only approved tuning keys.
  return RIG_TUNING_KEYS.reduce((values, key) => {
    values[key] = rigTuning[key];
    return values;
  }, {});
}

function assignRigTuningValues(nextValues) {
  /*
    Applies a complete rig tuning object while preserving object references used
    by lil-gui controllers.

    Important:
      GUI controllers point at existing objects. Replacing
      rigTuning.jointPointOffsets wholesale can leave controls pointed at stale
      objects. This function updates nested offset objects in place.
  */
  const nextOffsets = sanitizeJointPointOffsets(nextValues.jointPointOffsets);
  const nextRotations = sanitizeBindRotationOffsets(
    nextValues.bindRotationOffsets,
  );
  const currentOffsets =
    rigTuning.jointPointOffsets || makeDefaultJointPointOffsets();
  const currentRotations =
    rigTuning.bindRotationOffsets || makeDefaultBindRotationOffsets();

  Object.assign(rigTuning, {
    ...nextValues,
    jointPointOffsets: currentOffsets,
    bindRotationOffsets: currentRotations,
  });

  JOINT_ORDER.forEach((jointName) => {
    if (!currentOffsets[jointName]) {
      currentOffsets[jointName] = { x: 0, y: 0, z: 0 };
    }
    Object.assign(currentOffsets[jointName], nextOffsets[jointName]);
  });

  BIND_ROTATION_JOINTS.forEach((jointName) => {
    if (!currentRotations[jointName]) {
      currentRotations[jointName] = { x: 0, y: 0, z: 0 };
    }
    Object.assign(currentRotations[jointName], nextRotations[jointName]);
  });
}

function saveRigTuningToBrowser() {
  // Saves the current slider state to localStorage. This is the quickest
  // "keep my workshop setup" path during development.
  const payload = {
    version: APP_VERSION,
    savedAt: new Date().toISOString(),
    values: getSavableRigTuning(),
  };

  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  console.info("Saved Empyrean rig tuning.", payload);
}

function loadRigTuningFromBrowser() {
  // Reloads saved tuning, rebuilds the skeleton from it, then redraws the GUI.
  assignRigTuningValues(loadSavedRigTuning(makeDefaultRigTuning()));
  state.walkPhase = 0;
  rebuildSkeletonWorkshop();
  if (rigTuning.importedMeshPath) {
    loadImportedMeshPreviewFromPath(rigTuning.importedMeshPath);
  }
  updateGuiDisplays();
}

function resetRigTuningToDefaults() {
  // Returns the workshop to the default rig and clears any currently displayed
  // imported mesh from the scene.
  disposeImportedPreview();
  disposeImportedSkin();
  assignRigTuningValues(makeDefaultRigTuning());
  state.walkPhase = 0;
  rebuildSkeletonWorkshop();
  updateGuiDisplays();
}

function exportRigTuningToConsole() {
  // Logs a JSON blob and attempts to copy it to the clipboard. Useful for
  // preserving a rig pose outside browser localStorage.
  const payload = {
    version: APP_VERSION,
    values: getSavableRigTuning(),
  };
  const text = JSON.stringify(payload, null, 2);

  console.info("Empyrean rig tuning export:", payload);
  navigator.clipboard?.writeText?.(text).catch(() => null);
}

function clearSavedRigTuning() {
  // Removes the localStorage copy. The live rig is not changed until reload/load.
  window.localStorage.removeItem(STORAGE_KEY);
  console.info("Cleared saved Empyrean tuning.");
}

function buildRoom() {
  /*
    Legacy single-room helper from an earlier stage.

    It is left here as a reference, but the active world now comes from
    buildExplorationWorld(). The call near the bottom of the file is commented
    out on purpose.
  */
  const room = new THREE.Mesh(
    new THREE.BoxGeometry(12, 5.2, 12),
    new THREE.MeshBasicMaterial({
      color: WALL_COLOR,
      side: THREE.BackSide,
    }),
  );
  room.position.y = 2.6;
  scene.add(room);

  const grid = new THREE.GridHelper(12, 24, "#172017", "#050505");
  grid.material.transparent = true;
  grid.material.opacity = 0.3;
  grid.position.y = 0.003;
  scene.add(grid);
}

function buildLighting() {
  /*
    Lighting stack:
      HemisphereLight = soft ambient sky/ground fill
      DirectionalLight = main readable key light
      PointLight = small green character/world accent

    MeshBasicMaterial objects, such as the ghost spheres, ignore these lights.
  */
  scene.add(new THREE.HemisphereLight("#91aa91", "#020202", 1.25));

  const keyLight = new THREE.DirectionalLight("#dff5df", 2.15);
  keyLight.position.set(-2.5, 5.5, 3.5);
  scene.add(keyLight);

  const pointLight = new THREE.PointLight("#639464", 1.45, 6.5);
  pointLight.position.set(0, 2.5, 2.2);
  scene.add(pointLight);
}

function buildSkeletonWorkshop() {
  /*
    Creates or recreates the entire skeleton workshop.

    Rebuild sequence:
      1. Dispose any old skeleton/debug/imported objects.
      2. Create a fresh skeleton hierarchy from rigTuning dimensions.
      3. Apply joint point offsets.
      4. Apply bind-pose rotations.
      5. Add debug markers, labels, axis marker, and collider visual.

    This is called whenever dimensions change enough that the hierarchy itself
    should be rebuilt.
  */
  if (state.skeleton?.root) {
    scene.remove(state.skeleton.root);
    disposeObjectTree(state.skeleton.root);
    state.axisHelper = null;
    state.rigCollider = null;
    state.importedPreview = null;
    state.importedSkin = null;
  }

  state.skeleton = createSkeleton({
    headY: rigTuning.headY,
    neckY: rigTuning.neckY,
    chestY: rigTuning.chestY,
    torsoY: rigTuning.torsoY,
    pelvisY: rigTuning.pelvisY,
    shoulderX: rigTuning.shoulderX,
    hipX: rigTuning.hipX,
    upperArmLength: rigTuning.upperArmLength,
    forearmLength: rigTuning.forearmLength,
    thighLength: rigTuning.thighLength,
    shinLength: rigTuning.shinLength,
  });
  applyJointPointOffsets();
  applyBindRotationOffsets();

  state.skeleton.root.name = "empyrean-puppet-skeleton";
  scene.add(state.skeleton.root);
  state.rigCollider = createRigColliderVisual();
  state.skeleton.root.add(state.rigCollider);
  state.debugView = createDebugView(state.skeleton, {
    markerRadius: 0.035,
    labelScale: rigTuning.labelScale,
    color: GUIDE_COLOR,
  });
  updateAxisMarkerAttachment();
  applyVisibility();
  selectMouseJointEditJoint(rigTuning.mouseJointEditJoint);
}

function rebuildSkeletonWorkshop() {
  const shouldReloadPreview = Boolean(state.importedPreview);
  const shouldReloadImportedMesh = Boolean(state.importedSkin);

  // Dimension sliders change the bind-pose distances between joints. Rebuilding
  // creates a fresh hierarchy from those dimensions, then re-applies the current
  // player/root offsets so the new skeleton appears in the same workshop pose.
  buildSkeletonWorkshop();
  resetSkeletonToBindPose();
  syncSkeletonRoot();

  if (shouldReloadPreview) {
    loadImportedMeshPreviewFromPath(rigTuning.importedMeshPath);
  } else if (shouldReloadImportedMesh) {
    loadImportedMeshFromPath(rigTuning.importedMeshPath);
  }
}

function createJoint(name, position = [0, 0, 0]) {
  /*
    Creates one puppet joint.

    A joint is a THREE.Group, not a Mesh. It has no visible geometry by itself.
    Its job is to be a transform/pivot that can rotate, move, and carry child
    joints along with it.

    userData stores multiple versions of the rest pose:
      baseBindLocalPosition     = original position from createSkeleton()
      bindLocalPosition         = base position plus slider offsets
      baseBindLocalQuaternion   = original neutral rotation
      bindLocalQuaternion       = base rotation plus bind rotation sliders
      bindLocalEuler            = Euler version of the bind rotation offset
      bindLocalScale            = neutral scale
  */
  const joint = new THREE.Group();
  joint.name = name;
  joint.position.fromArray(position);
  joint.userData.isPuppetJoint = true;
  joint.userData.bindLocalPosition = joint.position.clone();
  joint.userData.baseBindLocalPosition = joint.position.clone();
  joint.userData.bindLocalQuaternion = joint.quaternion.clone();
  joint.userData.baseBindLocalQuaternion = joint.quaternion.clone();
  joint.userData.bindLocalEuler = new THREE.Euler(0, 0, 0);
  joint.userData.bindLocalScale = joint.scale.clone();
  return joint;
}

function createSkeleton(dimensions = {}) {
  /*
    Builds the parent/child hierarchy for the puppet.

    Parent chain:
      root
        body
          pelvis
            spineBase
              chest
                neck
                  head

    Arms attach to chest. Legs attach to pelvis.

    Why parent-relative positions matter:
      If the chest rotates, the neck/head and both arms follow automatically.
      If the pelvis moves, both legs follow automatically.
  */
  const d = { ...DEFAULT_RIG_DIMENSIONS, ...dimensions };
  const joints = {};

  joints.root = createJoint("rig-root");
  joints.body = createJoint("body-root");
  joints.root.add(joints.body);

  joints.pelvis = createJoint("pelvis", [0, d.pelvisY, 0]);
  joints.spineBase = createJoint("spine-base", [0, d.torsoY - d.pelvisY, 0]);
  joints.chest = createJoint("chest", [0, d.chestY - d.torsoY, 0]);
  joints.neck = createJoint("neck", [0, d.neckY - d.chestY, 0]);
  joints.head = createJoint("head", [0, d.headY - d.neckY, 0]);

  joints.body.add(joints.pelvis);
  joints.pelvis.add(joints.spineBase);
  joints.spineBase.add(joints.chest);
  joints.chest.add(joints.neck);
  joints.neck.add(joints.head);

  addArmChain(joints, "left", -1, d);
  addArmChain(joints, "right", 1, d);
  addLegChain(joints, "left", -1, d);
  addLegChain(joints, "right", 1, d);

  return { root: joints.root, joints };
}

function addArmChain(joints, sideName, side, d) {
  /*
    Adds one arm to the skeleton.

    sideName = "left" or "right"
    side     = -1 for left, +1 for right

    The side multiplier mirrors X offsets:
      shoulder X = side * shoulderX

    Fingers are currently only base pivots. They give the future hand mesh or
    debug geometry places to attach and animate.
  */
  const prefix = sideName;

  joints[`${prefix}Clavicle`] = createJoint(`${prefix}-clavicle`, [
    side * d.shoulderX * 0.55,
    0,
    0,
  ]);
  joints[`${prefix}Shoulder`] = createJoint(`${prefix}-shoulder`, [
    side * d.shoulderX * 0.45,
    0,
    0,
  ]);
  joints[`${prefix}Elbow`] = createJoint(`${prefix}-elbow`, [
    0,
    -d.upperArmLength,
    0,
  ]);
  joints[`${prefix}Wrist`] = createJoint(`${prefix}-wrist`, [
    0,
    -d.forearmLength,
    0,
  ]);
  joints[`${prefix}Palm`] = createJoint(`${prefix}-palm`, [0, -0.1, 0.04]);

  joints.chest.add(joints[`${prefix}Clavicle`]);
  joints[`${prefix}Clavicle`].add(joints[`${prefix}Shoulder`]);
  joints[`${prefix}Shoulder`].add(joints[`${prefix}Elbow`]);
  joints[`${prefix}Elbow`].add(joints[`${prefix}Wrist`]);
  joints[`${prefix}Wrist`].add(joints[`${prefix}Palm`]);

  [-1, 0, 1].forEach((fingerIndex) => {
    const key = `${prefix}Finger${fingerIndex + 2}Base`;
    joints[key] = createJoint(`${prefix}-finger-${fingerIndex + 2}-base`, [
      fingerIndex * 0.055,
      -0.08,
      0.04,
    ]);
    joints[`${prefix}Palm`].add(joints[key]);
  });
}

function addLegChain(joints, sideName, side, d) {
  /*
    Adds one leg to the skeleton.

    Like arms, the leg uses a side multiplier for left/right mirroring. Each
    child joint is positioned relative to its parent, so thighLength and
    shinLength become negative local Y offsets.
  */
  const prefix = sideName;

  joints[`${prefix}Hip`] = createJoint(`${prefix}-hip`, [side * d.hipX, 0, 0]);
  joints[`${prefix}Knee`] = createJoint(`${prefix}-knee`, [
    0,
    -d.thighLength,
    0,
  ]);
  joints[`${prefix}Ankle`] = createJoint(`${prefix}-ankle`, [
    0,
    -d.shinLength,
    0,
  ]);
  joints[`${prefix}Foot`] = createJoint(`${prefix}-foot`, [0, -0.08, 0.12]);

  joints.pelvis.add(joints[`${prefix}Hip`]);
  joints[`${prefix}Hip`].add(joints[`${prefix}Knee`]);
  joints[`${prefix}Knee`].add(joints[`${prefix}Ankle`]);
  joints[`${prefix}Ankle`].add(joints[`${prefix}Foot`]);
}

function createRigColliderVisual() {
  /*
    The rig collider is a simple floor footprint, not a full ragdoll. It marks
    the radius used when resolving movement against the room walls, which is
    enough for this workshop stage and easy to reason about while tuning.
  */
  const geometry = new THREE.CylinderGeometry(
    rigTuning.colliderRadius,
    rigTuning.colliderRadius,
    0.025,
    48,
    1,
    true,
  );
  const material = new THREE.MeshBasicMaterial({
    color: "#639464",
    transparent: true,
    opacity: 0.28,
    wireframe: true,
    depthTest: false,
  });
  const collider = new THREE.Mesh(geometry, material);

  collider.name = "rig-footprint-collider";
  collider.position.y = 0.015;
  collider.renderOrder = 18;
  return collider;
}

function updateRigColliderVisual() {
  // Rebuilds the visible circle when the colliderRadius slider changes.
  // The actual collision uses the same rigTuning.colliderRadius value.
  if (!state.rigCollider) {
    return;
  }

  state.rigCollider.geometry.dispose();
  state.rigCollider.geometry = new THREE.CylinderGeometry(
    rigTuning.colliderRadius,
    rigTuning.colliderRadius,
    0.025,
    48,
    1,
    true,
  );
  applyRoomCollision();
  rebuildWorldDebugView();
  applyVisibility();
}

function renderDefaultImportedMesh() {
  /*
    Step 1 of the render-adjust-rig workflow:
      render the mesh as a static preview.

    The preview is not skinned yet. This lets you move pivots and bind-pose
    rotations while visually comparing the skeleton to the model.
  */
  rigTuning.importedMeshPath =
    rigTuning.importedMeshPath || DEFAULT_IMPORTED_MESH_PATH;
  loadImportedMeshPreviewFromPath(rigTuning.importedMeshPath);
  updateGuiDisplays();
}

function loadDefaultImportedMesh() {
  /*
    Convenience shortcut:
      load the default mesh and rig it immediately.

    Useful when the current pivot setup is already good enough and you do not
    need the separate preview stage.
  */
  rigTuning.importedMeshPath =
    rigTuning.importedMeshPath || DEFAULT_IMPORTED_MESH_PATH;
  rigCurrentImportedMesh();
  updateGuiDisplays();
}

function rerigImportedMesh() {
  // Re-runs the current mesh through the generated skin-weight pipeline.
  // Use after changing offsets, rotations, scale, or import orientation.
  if (!state.importedSkin) {
    return;
  }

  loadImportedMeshFromPath(rigTuning.importedMeshPath);
}

function rigCurrentImportedMesh() {
  /*
    Step 2 of the render-adjust-rig workflow:
      if a preview GLTF is already loaded, reuse that exact loaded data and rig
      it. Otherwise, load from rigTuning.importedMeshPath.

    Reusing the preview avoids needing the user to type the path again.
  */
  if (state.importedPreview?.gltf) {
    const path = state.importedPreview.path;

    rigImportedMeshFromGltfClone(state.importedPreview.gltf, path);
    state.importedMeshStatus = `rigged ${path}`;
    console.info("Rigged rendered Empyrean mesh.", {
      path,
      meshes: state.importedSkin.meshes.length,
      bindMode: "generated position weights",
    });
    return;
  }

  loadImportedMeshFromPath(rigTuning.importedMeshPath);
}

function refreshImportedMeshReference() {
  /*
    Called when import sliders change.

    If the mesh is currently only a preview, refresh the preview.
    If it is already rigged, refresh the rigged version.
  */
  if (state.importedPreview) {
    loadImportedMeshPreviewFromPath(rigTuning.importedMeshPath);
    return;
  }

  if (state.importedSkin) {
    loadImportedMeshFromPath(rigTuning.importedMeshPath);
  }
}

function clearImportedMesh() {
  // Removes both preview and rigged mesh from the scene. The skeleton remains.
  disposeImportedPreview();
  disposeImportedSkin();
  state.importedMeshStatus = "mesh cleared";
  console.info("Cleared imported Empyrean mesh.");
}

function disposeImportedPreview() {
  // Safely removes the static imported preview and disposes its geometries,
  // materials, and textures so repeated imports do not leak GPU memory.
  if (!state.importedPreview?.group) {
    state.importedPreview = null;
    return;
  }

  state.importedPreview.group.parent?.remove(state.importedPreview.group);
  disposeObjectTree(state.importedPreview.group);
  state.importedPreview = null;
}

function disposeImportedSkin() {
  // Safely removes the generated SkinnedMesh version of the import.
  if (!state.importedSkin?.group) {
    state.importedSkin = null;
    return;
  }

  state.importedSkin.group.parent?.remove(state.importedSkin.group);
  disposeObjectTree(state.importedSkin.group);
  state.importedSkin = null;
}

function loadImportedMeshPreviewFromPath(path = DEFAULT_IMPORTED_MESH_PATH) {
  /*
    Asynchronously loads a GLB/GLTF and renders it as a static reference.

    gltfLoader.load() callbacks:
      success callback   = renderImportedMeshPreview()
      progress callback  = undefined for now
      error callback     = status + console error
  */
  if (!path) {
    return;
  }

  state.importedMeshStatus = `rendering ${path}`;

  gltfLoader.load(
    path,
    (gltf) => {
      try {
        renderImportedMeshPreview(gltf, path);
        state.importedMeshStatus = `rendered ${path}`;
        console.info("Rendered Empyrean mesh preview.", {
          path,
          meshes: state.importedPreview.meshes.length,
          mode: "static reference mesh",
        });
      } catch (error) {
        state.importedMeshStatus = "mesh render failed";
        console.error("Could not render imported mesh preview.", error);
      }
    },
    undefined,
    (error) => {
      state.importedMeshStatus = "mesh load failed";
      console.error(
        `Could not load imported mesh preview from ${path}.`,
        error,
      );
    },
  );
}

function renderImportedMeshPreview(gltf, path) {
  // Clears any previous import, builds a static preview group, and attaches it
  // to the skeleton root so root alignment controls affect both rig and mesh.
  disposeImportedPreview();
  disposeImportedSkin();

  state.importedPreview = createPreviewMeshFromGltf(gltf, path);
  state.skeleton.root.add(state.importedPreview.group);
  applyImportedMeshPresentation();
}

function loadImportedMeshFromPath(path = DEFAULT_IMPORTED_MESH_PATH) {
  /*
    Loads a GLB/GLTF and immediately converts it into a generated SkinnedMesh.

    This is the one-click path. The more careful workflow is:
      1 render mesh
      adjust pivots/sliders
      2 rig rendered mesh
  */
  if (!path) {
    return;
  }

  state.importedMeshStatus = `loading ${path}`;

  gltfLoader.load(
    path,
    (gltf) => {
      try {
        rigImportedMeshFromGltfClone(gltf, path);
        state.importedMeshStatus = `loaded ${path}`;
        console.info("Imported and rigged Empyrean mesh.", {
          path,
          meshes: state.importedSkin.meshes.length,
          bindMode: "generated position weights",
        });
      } catch (error) {
        state.importedMeshStatus = "mesh rig failed";
        console.error("Could not rig imported mesh.", error);
      }
    },
    undefined,
    (error) => {
      state.importedMeshStatus = "mesh load failed";
      console.error(`Could not load imported mesh from ${path}.`, error);
    },
  );
}

function rigImportedMeshFromGltfClone(gltf, path) {
  /*
    Converts loaded GLTF data into the rigged skin version.

    The resulting state.importedSkin contains:
      group          = root group added to the scene
      meshes         = one or more THREE.SkinnedMesh objects
      boneBindings   = maps from puppet joint names to generated bones
      path           = source asset path
  */
  disposeImportedPreview();
  disposeImportedSkin();

  state.importedSkin = createRiggedSkinFromGltf(gltf, path);
  state.skeleton.root.add(state.importedSkin.group);
  syncImportedSkinToPuppet();
  applyImportedMeshPresentation();
}

function createPreviewMeshFromGltf(gltf, path) {
  /*
    Creates a non-rigged preview mesh.

    This uses the same geometry preparation as the rigged version, which means:
      - import rotation sliders apply
      - auto-fit scaling applies
      - offset sliders apply

    The only thing missing is skinIndex/skinWeight attributes and bones.
  */
  const sourceMeshes = collectImportableMeshes(gltf.scene);

  if (!sourceMeshes.length) {
    throw new Error("The GLB did not contain any Mesh objects.");
  }

  const preparedMeshes = prepareImportedGeometries(sourceMeshes);
  const group = new THREE.Group();
  const meshes = preparedMeshes.map((meshInfo) => {
    const mesh = new THREE.Mesh(meshInfo.geometry, meshInfo.material);

    mesh.name = `${meshInfo.name || "imported-mesh"}-preview`;
    mesh.frustumCulled = false;
    group.add(mesh);
    return mesh;
  });

  group.name = "imported-static-avatar-preview";
  group.userData.sourcePath = path;

  return {
    group,
    gltf,
    meshes,
    path,
  };
}

function createRiggedSkinFromGltf(gltf, path) {
  /*
    Converts imported mesh geometry into generated skin.

    Process:
      1. Collect all mesh objects from the GLTF scene.
      2. Bake their world transforms into clone geometries.
      3. Apply import rotation, centering, scale, and offset.
      4. Read puppet bind positions.
      5. Clone the puppet joint hierarchy as real THREE.Bone objects.
      6. Generate skinIndex and skinWeight attributes per vertex.
      7. Create THREE.SkinnedMesh and bind it to the generated skeleton.

    Important:
      The original puppet joints remain the animator-facing controls. The
      generated bones are the mesh-facing deformation skeleton.
  */
  const sourceMeshes = collectImportableMeshes(gltf.scene);

  if (!sourceMeshes.length) {
    throw new Error("The GLB did not contain any Mesh objects.");
  }

  const preparedMeshes = prepareImportedGeometries(sourceMeshes);
  const bindPositions = getBindPositionsByJointKey();
  const skinMeshes = [];
  const boneBindings = [];
  const group = new THREE.Group();

  group.name = "imported-rigged-avatar";
  group.userData.sourcePath = path;

  preparedMeshes.forEach((meshInfo) => {
    const boneRig = createSkinBoneHierarchy();

    addGeneratedSkinWeights(
      meshInfo.geometry,
      bindPositions,
      boneRig.boneIndexByJointKey,
    );

    const skinnedMesh = new THREE.SkinnedMesh(
      meshInfo.geometry,
      meshInfo.material,
    );
    const skeleton = new THREE.Skeleton(boneRig.bones);

    skinnedMesh.name = `${meshInfo.name || "imported-mesh"}-generated-skin`;
    skinnedMesh.frustumCulled = false;
    skinnedMesh.add(boneRig.rootBone);
    skinnedMesh.bind(skeleton);

    group.add(skinnedMesh);
    skinMeshes.push(skinnedMesh);
    boneBindings.push(boneRig.bonesByJointKey);
  });

  return {
    group,
    meshes: skinMeshes,
    boneBindings,
    path,
  };
}

function collectImportableMeshes(root) {
  /*
    Finds every Mesh under the loaded GLTF scene.

    GLB files can contain nested groups, transforms, and multiple mesh parts.
    root.updateMatrixWorld(true) ensures each mesh has a correct world matrix
    before prepareImportedGeometries() bakes those transforms into geometry.
  */
  const meshes = [];

  root.updateMatrixWorld(true);
  root.traverse((object) => {
    if (object.isMesh && object.geometry) {
      meshes.push(object);
    }
  });

  return meshes;
}

function prepareImportedGeometries(sourceMeshes) {
  /*
    Prepares imported geometry for this workshop's coordinate space.

    Formula summary:

      local vertex
        -> apply original mesh.matrixWorld
        -> apply import rotation sliders
        -> compute combined bounding box
        -> translate so model is centered in X/Z and rests on Y = 0
        -> scale to target height if auto-fit is enabled
        -> apply user mesh offset sliders

    Variables:
      combinedBox = bounding box around every prepared mesh part
      center      = geometric center of combinedBox
      rawHeight   = combinedBox.max.y - combinedBox.min.y
      targetHeight = skeleton height target from getImportedMeshTargetHeight()
      autoFitScale = targetHeight / rawHeight when auto-fit is on, otherwise 1
      finalScale   = autoFitScale * importedMeshScale slider

    This is where future STL/GLB axis correction belongs. The import rotation
    sliders already rotate around X/Y/Z before fitting.
  */
  const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(
    new THREE.Euler(
      rigTuning.importedMeshRotationX,
      rigTuning.importedMeshRotationY,
      rigTuning.importedMeshRotationZ,
    ),
  );
  const prepared = sourceMeshes.map((mesh) => {
    const geometry = mesh.geometry.clone();

    geometry.applyMatrix4(mesh.matrixWorld);
    geometry.applyMatrix4(rotationMatrix);
    geometry.computeBoundingBox();

    return {
      name: mesh.name,
      geometry,
      material: cloneImportedMaterial(mesh.material),
    };
  });
  const combinedBox = prepared.reduce((box, meshInfo) => {
    box.union(meshInfo.geometry.boundingBox);
    return box;
  }, new THREE.Box3());
  const center = combinedBox.getCenter(new THREE.Vector3());
  const rawHeight = Math.max(0.001, combinedBox.max.y - combinedBox.min.y);
  const targetHeight = getImportedMeshTargetHeight();
  const autoFitScale = rigTuning.importedMeshAutoFit
    ? targetHeight / rawHeight
    : 1;
  const finalScale = autoFitScale * rigTuning.importedMeshScale;
  const offset = new THREE.Vector3(
    rigTuning.importedMeshOffsetX,
    rigTuning.importedMeshOffsetY,
    rigTuning.importedMeshOffsetZ,
  );

  prepared.forEach((meshInfo) => {
    /*
      Translation math:

        x' = x - center.x
        y' = y - combinedBox.min.y
        z' = z - center.z

      That centers the model around the skeleton in X/Z and places the lowest
      point at floor height before scaling/offsetting.
    */
    meshInfo.geometry.translate(-center.x, -combinedBox.min.y, -center.z);
    meshInfo.geometry.scale(finalScale, finalScale, finalScale);
    meshInfo.geometry.translate(offset.x, offset.y, offset.z);
    meshInfo.geometry.computeBoundingBox();
    meshInfo.geometry.computeBoundingSphere();
  });

  return prepared;
}

function cloneImportedMaterial(sourceMaterial) {
  /*
    Clones the imported material so workshop opacity/wireframe sliders do not
    mutate the original GLTF material object.

    If no material exists, a neutral gray MeshStandardMaterial is used.
  */
  const material = Array.isArray(sourceMaterial)
    ? sourceMaterial.map((entry) => entry.clone())
    : sourceMaterial?.clone?.() ||
      new THREE.MeshStandardMaterial({ color: "#cfcfcf" });

  getMaterialList(material).forEach((entry) => {
    entry.side = THREE.DoubleSide;
    entry.transparent = true;
    entry.opacity = rigTuning.importedMeshOpacity;
    entry.wireframe = rigTuning.importedMeshWireframe;
    entry.needsUpdate = true;
  });

  return material;
}

function getMaterialList(material) {
  // Imported meshes may have one material or an array of materials. This helper
  // normalizes both shapes into an array so callers can loop safely.
  return Array.isArray(material) ? material : [material];
}

function getImportedMeshTargetHeight() {
  // headY is the top skeleton pivot, and the wire head extends slightly above it.
  return Math.max(1, rigTuning.headY + 0.42);
}

function getBindPositionsByJointKey() {
  /*
    Computes bind-pose world positions for every puppet joint.

    We do this manually instead of asking Three.js for current world positions
    because animation may already be changing the live joints. Skin weights
    should be based on the neutral bind pose, not the current animated pose.

    Formula for each child:
      worldPosition = parentWorldPosition +
                      localBindPosition rotated by parentWorldQuaternion

      worldQuaternion = parentWorldQuaternion * localBindQuaternion
  */
  const jointToKey = new Map(
    Object.entries(state.skeleton.joints).map(([key, joint]) => [joint, key]),
  );
  const bindPositions = {};

  function visit(joint, parentPosition, parentQuaternion) {
    const key = jointToKey.get(joint);
    const localPosition =
      joint.userData.bindLocalPosition || joint.position || new THREE.Vector3();
    const localQuaternion =
      joint.userData.bindLocalQuaternion ||
      joint.quaternion ||
      new THREE.Quaternion();
    const worldBindPosition = parentPosition
      .clone()
      .add(localPosition.clone().applyQuaternion(parentQuaternion));
    const worldBindQuaternion = parentQuaternion
      .clone()
      .multiply(localQuaternion);

    if (key) {
      bindPositions[key] = worldBindPosition;
    }

    joint.children.forEach((child) => {
      if (child.userData.isPuppetJoint) {
        visit(child, worldBindPosition, worldBindQuaternion);
      }
    });
  }

  visit(
    state.skeleton.joints.root,
    new THREE.Vector3(),
    new THREE.Quaternion(),
  );
  return bindPositions;
}

function createSkinBoneHierarchy() {
  /*
    Creates a real THREE.Bone hierarchy that mirrors the puppet joint hierarchy.

    Why not use puppet joints as bones directly?
      SkinnedMesh expects Bone objects arranged in a Skeleton. Keeping generated
      bones separate lets the workshop controls stay as readable THREE.Group
      pivots while the mesh deformation system gets what Three.js expects.

    Returned maps:
      bonesByJointKey      = joint name -> generated Bone object
      boneIndexByJointKey  = joint name -> index used by skinIndex attribute
  */
  const jointToKey = new Map(
    Object.entries(state.skeleton.joints).map(([key, joint]) => [joint, key]),
  );
  const bones = [];
  const bonesByJointKey = {};
  const boneIndexByJointKey = {};

  function cloneJointAsBone(joint) {
    const key = jointToKey.get(joint);
    const bone = new THREE.Bone();

    bone.name = `${key || joint.name}-generated-bone`;
    bone.position.copy(joint.userData.bindLocalPosition || joint.position);
    bone.quaternion.copy(
      joint.userData.bindLocalQuaternion || joint.quaternion,
    );
    bone.scale.copy(joint.userData.bindLocalScale || joint.scale);

    if (key) {
      boneIndexByJointKey[key] = bones.length;
      bonesByJointKey[key] = bone;
    }

    bones.push(bone);

    joint.children.forEach((child) => {
      if (child.userData.isPuppetJoint) {
        bone.add(cloneJointAsBone(child));
      }
    });

    return bone;
  }

  const rootBone = cloneJointAsBone(state.skeleton.joints.root);

  return {
    rootBone,
    bones,
    bonesByJointKey,
    boneIndexByJointKey,
  };
}

function addGeneratedSkinWeights(geometry, bindPositions, boneIndexByJointKey) {
  /*
    Adds skinIndex and skinWeight attributes to geometry.

    For every vertex:
      1. chooseSkinInfluences() decides up to four puppet joints that should
         affect that vertex.
      2. skinIndex stores the numeric bone indices.
      3. skinWeight stores how strongly each bone affects the vertex.

    Three.js expects four slots per vertex, so unused slots are filled with a
    harmless fallback joint and zero weight.
  */
  const positionAttribute = geometry.attributes.position;
  const skinIndices = [];
  const skinWeights = [];
  const vertex = new THREE.Vector3();

  for (let index = 0; index < positionAttribute.count; index += 1) {
    vertex.fromBufferAttribute(positionAttribute, index);

    const influences = chooseSkinInfluences(vertex, bindPositions);

    for (let slot = 0; slot < 4; slot += 1) {
      const influence = influences[slot] || influences[influences.length - 1];

      skinIndices.push(boneIndexByJointKey[influence.key] ?? 0);
      skinWeights.push(influence.weight);
    }
  }

  geometry.setAttribute(
    "skinIndex",
    new THREE.Uint16BufferAttribute(skinIndices, 4),
  );
  geometry.setAttribute(
    "skinWeight",
    new THREE.Float32BufferAttribute(skinWeights, 4),
  );
}

function chooseSkinInfluences(vertex, bindPositions) {
  /*
    Chooses candidate joints for one vertex using rough anatomical regions.

    This is intentionally approximate. It is a generated rigging pass, not a
    hand-painted professional skin. The goal is to get useful deformation fast.

    Decision tree:
      - vertex at/above neck -> head and neck
      - vertex outside torso at arm height -> shoulder/elbow/wrist/palm
      - vertex below pelvis and away from center -> hip/knee/ankle/foot
      - everything else -> pelvis/spine/chest/neck

    The chosen candidate joints are then weighted by distance.
  */
  const pelvisY = bindPositions.pelvis.y;
  const neckY = bindPositions.neck.y;
  const shoulderY = Math.max(
    bindPositions.leftShoulder.y,
    bindPositions.rightShoulder.y,
  );
  const wristY = Math.min(
    bindPositions.leftWrist.y,
    bindPositions.rightWrist.y,
  );
  const shoulderX = Math.max(
    Math.abs(bindPositions.leftShoulder.x),
    Math.abs(bindPositions.rightShoulder.x),
  );
  const hipX = Math.max(
    Math.abs(bindPositions.leftHip.x),
    Math.abs(bindPositions.rightHip.x),
  );
  const sideName = vertex.x < 0 ? "left" : "right";
  const absX = Math.abs(vertex.x);
  const outsideTorso = absX > Math.max(hipX + 0.12, shoulderX * 0.58);
  const inArmHeight = vertex.y > wristY - 0.3 && vertex.y < shoulderY + 0.5;
  const inLegHeight = vertex.y <= pelvisY + 0.16;

  if (vertex.y >= neckY) {
    return weightedNearestJoints(vertex, ["head", "neck"], bindPositions);
  }

  if (outsideTorso && inArmHeight) {
    return weightedNearestJoints(
      vertex,
      [
        `${sideName}Shoulder`,
        `${sideName}Elbow`,
        `${sideName}Wrist`,
        `${sideName}Palm`,
      ],
      bindPositions,
    );
  }

  if (inLegHeight && absX > hipX * 0.35) {
    return weightedNearestJoints(
      vertex,
      [
        `${sideName}Hip`,
        `${sideName}Knee`,
        `${sideName}Ankle`,
        `${sideName}Foot`,
      ],
      bindPositions,
    );
  }

  return weightedNearestJoints(
    vertex,
    ["pelvis", "spineBase", "chest", "neck"],
    bindPositions,
  );
}

function weightedNearestJoints(vertex, jointKeys, bindPositions) {
  /*
    Calculates inverse-square distance weights.

    Formula:
      rawWeight = 1 / distance^2
      normalizedWeight = rawWeight / sum(all rawWeights)

    where:
      distance = distance from the vertex to a candidate bind joint

    Why inverse-square?
      Nearby joints dominate strongly, but farther joints still contribute a
      little. That creates smoother bends than simply picking one nearest joint.
  */
  const weighted = jointKeys
    .filter((key) => bindPositions[key])
    .map((key) => {
      const distance = Math.max(0.0001, vertex.distanceTo(bindPositions[key]));
      return {
        key,
        rawWeight: 1 / (distance * distance),
      };
    })
    .sort((a, b) => b.rawWeight - a.rawWeight)
    .slice(0, 4);
  const total = weighted.reduce((sum, entry) => sum + entry.rawWeight, 0) || 1;
  const normalized = weighted.map((entry) => ({
    key: entry.key,
    weight: entry.rawWeight / total,
  }));

  while (normalized.length < 4) {
    normalized.push({ key: normalized[0]?.key || "body", weight: 0 });
  }

  return normalized;
}

function syncImportedSkinToPuppet() {
  /*
    Every animation frame, copies current puppet joint transforms onto generated
    bones with matching joint keys.

    Puppet joint:
      human-readable control object, animated by this file

    Generated bone:
      deformation object used by THREE.SkinnedMesh

    This bridge is what makes the imported mesh move with the workshop skeleton.
  */
  if (!state.importedSkin) {
    return;
  }

  state.importedSkin.boneBindings.forEach((bonesByJointKey) => {
    Object.entries(bonesByJointKey).forEach(([key, bone]) => {
      const joint = state.skeleton.joints[key];

      if (!joint || key === "root") {
        bone.position.copy(
          joint?.userData.bindLocalPosition || new THREE.Vector3(),
        );
        bone.quaternion.identity();
        bone.scale.set(1, 1, 1);
        return;
      }

      bone.position.copy(joint.position);
      bone.quaternion.copy(joint.quaternion);
      bone.scale.copy(joint.scale);
    });
  });
}

function applyImportedMeshPresentation() {
  // Applies display-only mesh settings: visible, opacity, and wireframe.
  // It works for both the static preview and the rigged skin.
  const targets = [state.importedPreview, state.importedSkin].filter(Boolean);

  if (!targets.length) {
    return;
  }

  targets.forEach((target) => {
    target.group.visible = rigTuning.importedMeshVisible;
    target.meshes.forEach((mesh) => {
      mesh.visible = rigTuning.importedMeshVisible;
      getMaterialList(mesh.material).forEach((material) => {
        material.transparent = true;
        material.opacity = rigTuning.importedMeshOpacity;
        material.wireframe = rigTuning.importedMeshWireframe;
        material.needsUpdate = true;
      });
    });
  });
}

function exportRigPackageToConsole() {
  /*
    Exports the current workshop state as JSON.

    This is not a file download. It logs the object to the console and attempts
    to copy the JSON to the clipboard for easy saving elsewhere.
  */
  const payload = {
    version: APP_VERSION,
    exportedAt: new Date().toISOString(),
    rigTuning: getSavableRigTuning(),
    importedMesh: {
      path: rigTuning.importedMeshPath,
      status: state.importedMeshStatus,
      stage: state.importedSkin
        ? "rigged"
        : state.importedPreview
          ? "rendered reference"
          : "not loaded",
      bindMode: state.importedSkin ? "generated position weights" : "unbound",
    },
  };
  const text = JSON.stringify(payload, null, 2);

  console.info("Empyrean rig package export:", payload);
  navigator.clipboard?.writeText?.(text).catch(() => null);
}

function importRigPackageFromPrompt() {
  /*
    Imports a JSON rig package pasted into a prompt.

    The function accepts either:
      - the full exported payload with payload.rigTuning
      - an older shape with payload.values
      - a raw tuning object
  */
  const text = window.prompt("Paste an Empyrean rig package JSON export:");

  if (!text) {
    return;
  }

  try {
    const payload = JSON.parse(text);
    const values = payload.rigTuning || payload.values || payload;

    assignRigTuningValues(sanitizeRigTuning({ ...rigTuning, ...values }));
    state.walkPhase = 0;
    rebuildSkeletonWorkshop();

    if (rigTuning.importedMeshPath) {
      loadImportedMeshPreviewFromPath(rigTuning.importedMeshPath);
    }

    updateGuiDisplays();
    console.info("Imported Empyrean rig package.", payload);
  } catch (error) {
    console.error("Could not import Empyrean rig package JSON.", error);
  }
}

function makeJointMarker(joint, markerRadius, material) {
  /*
    Creates visible helper geometry for one joint.

    Most joints are small wire spheres. The head uses a capsule shape so it
    reads like a head volume instead of another tiny point.

    Note:
      createDebugView() currently builds its own markers directly. This helper
      is kept because it is useful for future debug-marker experiments.
  */
  if (joint.name === "head") {
    const headRadius = markerRadius * 5.2;
    const headLength = markerRadius * 7.5;

    const marker = new THREE.Mesh(
      new THREE.CapsuleGeometry(headRadius, headLength, 12, 18),
      material,
    );

    marker.name = `${joint.name}-debug-marker`;
    marker.renderOrder = 20;

    // CapsuleGeometry is already vertical along Y.
    // This makes the head read as a soft vertical pill.
    marker.scale.set(0.85, 1.25, 0.72);

    return marker;
  }

  const marker = new THREE.Mesh(
    new THREE.SphereGeometry(markerRadius, 12, 8),
    material,
  );

  marker.name = `${joint.name}-debug-marker`;
  marker.renderOrder = 20;

  return marker;
}
function createDebugView(skeleton, options = {}) {
  /*
    Builds the visible "skeleton lab" layer.

    For each puppet joint, the debug view adds:
      - a wire marker attached to the joint
      - a text label sprite attached to the joint
      - a line from the joint to each child puppet joint

    Because markers and labels are children of the joints, they automatically
    follow animation and pivot adjustments.
  */
  const color = options.color || GUIDE_COLOR;
  const markerRadius = options.markerRadius || 0.035;
  const labelScale = options.labelScale || 1;
  const objects = [];
  const labels = [];
  const boneLines = [];
  const selectableMarkers = [];
  const markerMaterial = new THREE.MeshBasicMaterial({
    color,
    wireframe: true,
    transparent: true,
    opacity: 0.7,
    depthTest: false,
  });
  const lineMaterial = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.65,

    depthTest: false,
  });

  Object.entries(skeleton.joints).forEach(([jointKey, joint]) => {
    const jointMarkerMaterial = markerMaterial.clone();
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(markerRadius, 12, 8),
      jointMarkerMaterial,
    );
    marker.name = `${joint.name}-debug-marker`;
    marker.renderOrder = 20;
    marker.userData.jointKey = jointKey;
    marker.userData.isJointEditHandle = MOUSE_EDIT_JOINTS.includes(jointKey);

    if (joint.name === "head") {
      marker.scale.set(10.5, 15.0, 12.0);
    }

    joint.add(marker);
    objects.push(marker);
    selectableMarkers.push(marker);

    const label = makeLabelSprite(joint.name, { color, scale: labelScale });
    label.name = `${joint.name}-debug-label`;
    label.position.set(0, markerRadius * 2.6, 0);
    label.renderOrder = 21;
    joint.add(label);
    labels.push(label);
    objects.push(label);

    joint.children.forEach((child) => {
      if (!child.userData.isPuppetJoint) {
        // Ignore non-joint children such as debug markers, labels, meshes, or
        // colliders. Only actual puppet joints get bone guide lines.
        return;
      }

      const geometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(0, 0, 0),
        child.position.clone(),
      ]);
      const line = new THREE.Line(geometry, lineMaterial);
      line.name = `${joint.name}-to-${child.name}-debug-bone`;
      line.renderOrder = 19;

      if (joint.name === "body-root" && child.name === "pelvis") {
        // The body-root-to-pelvis line is visually useful but can become a
        // bright vertical distraction, so it is made almost transparent.
        line.material = line.material.clone();
        line.material.opacity = 0.05;
      }

      joint.add(line);
      boneLines.push({ line, child });
      objects.push(line);
    });
  });

  return {
    selectableMarkers,
    setVisible(visible) {
      objects.forEach((object) => {
        object.visible = visible;
      });
    },
    setLabelsVisible(visible) {
      labels.forEach((label) => {
        label.visible = visible;
      });
    },
    setLabelScale(scale) {
      labels.forEach((label) => {
        label.scale.set(0.34 * scale, 0.085 * scale, 1);
      });
    },
    setSelectedJoint(jointKey) {
      /*
        Gives the currently selected mouse-edit joint a warm highlight.

        This changes only the debug marker material. It does not affect the
        actual joint, skeleton, imported mesh, or saved rig data.
      */
      selectableMarkers.forEach((marker) => {
        if (!marker.userData.isJointEditHandle) {
          marker.material.color.set(color);
          marker.material.opacity = 0.3;
          return;
        }

        const selected = marker.userData.jointKey === jointKey;
        marker.material.color.set(selected ? "#ffec99" : color);
        marker.material.opacity = selected ? 1 : 0.7;
      });
    },
    refreshBones() {
      // Called after joint point offsets move pivots. The line geometry stores
      // child.position as a vertex, so it must be refreshed when pivots move.
      boneLines.forEach(({ line, child }) => {
        const positionAttribute = line.geometry.attributes.position;
        positionAttribute.setXYZ(
          1,
          child.position.x,
          child.position.y,
          child.position.z,
        );
        positionAttribute.needsUpdate = true;
        line.geometry.computeBoundingSphere();
      });
    },
  };
}

function makeLabelSprite(text, options = {}) {
  /*
    Creates a 2D canvas label and turns it into a Three.js Sprite.

    Sprites always face the camera, which makes joint names readable while
    orbiting. The canvas is used as a texture.
  */
  const canvas = document.createElement("canvas");
  canvas.width = 500;
  canvas.height = 80;

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(0, 0, 0, 0.55)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = options.color || GUIDE_COLOR;
  context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  context.fillStyle = options.color || GUIDE_COLOR;
  context.font = "70px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.scale.set(0.34 * options.scale, 0.085 * options.scale, 1);
  return sprite;
}

function createWorldDebugView() {
  /*
    Builds the optional "collision vision" overlay.

    This is the visual counterpart to worldCollision and encounters.js.

    It shows:
      - wall/outside solid rectangles
      - tree circular colliders
      - outside movement bounds
      - encounter trigger zones
      - optional encounter labels

    Important:
      These debug meshes do not participate in collision. They are only visual
      markers that help you place world objects and triggers.
  */
  const group = new THREE.Group();
  const wallColliders = [];
  const treeColliders = [];
  const outsideBounds = [];
  const encounterZones = [];
  const encounterLabels = [];
  const encounterObjectsById = new Map();
  const lift = SOLO_TWEAKS.worldDebug.floorLift;

  group.name = "world-debug-overlay";
  group.renderOrder = 50;

  worldCollision.solidRects.forEach((rect, index) => {
    const mesh = makeDebugRectMesh(
      rect,
      SOLO_TWEAKS.worldDebug.wallColor,
      0.28,
      lift,
    );

    mesh.name = `debug-wall-collider-${index + 1}`;
    wallColliders.push(mesh);
    group.add(mesh);
  });

  worldCollision.solidCircles.forEach((circle, index) => {
    const mesh = makeDebugCircleMesh(
      circle.centerX,
      circle.centerZ,
      circle.radius,
      SOLO_TWEAKS.worldDebug.treeColor,
      0.34,
      lift + 0.012,
    );

    mesh.name = `debug-tree-collider-${index + 1}`;
    treeColliders.push(mesh);
    group.add(mesh);
  });

  makeDebugBoundsMeshes().forEach((mesh) => {
    outsideBounds.push(mesh);
    group.add(mesh);
  });

  state.encounterRuntime.definitions.forEach((encounter) => {
    const zone = makeEncounterDebugMesh(encounter, lift + 0.024);

    if (!zone) {
      return;
    }

    zone.name = `debug-encounter-zone-${encounter.id}`;
    zone.userData.baseOpacity = zone.material.opacity;
    zone.userData.activeOpacity = Math.min(zone.material.opacity + 0.26, 0.72);
    zone.userData.encounterId = encounter.id;
    encounterZones.push(zone);
    encounterObjectsById.set(encounter.id, zone);
    group.add(zone);

    const label = makeLabelSprite(encounter.label || encounter.id, {
      color: encounter.debugColor || SOLO_TWEAKS.worldDebug.encounterColor,
      scale: 0.72,
    });
    const center = getEncounterCenter(encounter);

    label.name = `debug-encounter-label-${encounter.id}`;
    label.position.set(center.x, 0.48, center.y);
    label.renderOrder = 60;
    encounterLabels.push(label);
    group.add(label);
  });

  return {
    group,
    encounterObjectsById,
    setVisible(options) {
      /*
        Master visibility is separate from category visibility.

        Example:
          showWorldDebug = false hides everything.
          showWorldDebug = true and showTreeColliders = false shows the other
          debug categories while keeping tree circles hidden.
      */
      group.visible = options.showWorldDebug;
      wallColliders.forEach((object) => {
        object.visible = options.showWallColliders;
      });
      treeColliders.forEach((object) => {
        object.visible = options.showTreeColliders;
      });
      outsideBounds.forEach((object) => {
        object.visible = options.showOutsideBounds;
      });
      encounterZones.forEach((object) => {
        object.visible = options.showEncounterZones;
      });
      encounterLabels.forEach((object) => {
        object.visible = options.showEncounterZones && options.showEncounterLabels;
      });
    },
    syncEncounterActivity(activeIds) {
      /*
        Highlight active encounter zones.

        This gives instant feedback when your avatar footprint is inside a
        trigger, which is extremely useful while placing or resizing zones.
      */
      encounterObjectsById.forEach((object, id) => {
        object.material.opacity = activeIds.has(id)
          ? object.userData.activeOpacity
          : object.userData.baseOpacity;
        object.material.needsUpdate = true;
      });
    },
  };
}

function makeDebugRectMesh(rect, color, opacity, y) {
  /*
    Creates one translucent top-down rectangle.

    Input rect shape:
      minX, maxX, minZ, maxZ

    Derived values:
      width  = maxX - minX
      depth  = maxZ - minZ
      center = average of min/max on each axis
  */
  const width = Math.max(0.001, rect.maxX - rect.minX);
  const depth = Math.max(0.001, rect.maxZ - rect.minZ);
  const centerX = (rect.minX + rect.maxX) / 2;
  const centerZ = (rect.minZ + rect.maxZ) / 2;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.035, depth),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false,
    }),
  );

  mesh.position.set(centerX, y, centerZ);
  mesh.renderOrder = 50;
  return mesh;
}

function makeDebugCircleMesh(centerX, centerZ, radius, color, opacity, y) {
  /*
    Creates one top-down circular debug marker.

    CylinderGeometry is used because a very short cylinder already lies in the
    right orientation for a floor footprint: circular in X/Z, thin in Y.
  */
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.04, 48, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      wireframe: true,
      depthWrite: false,
      depthTest: false,
    }),
  );

  mesh.position.set(centerX, y, centerZ);
  mesh.renderOrder = 51;
  return mesh;
}

function makeDebugBoundsMeshes() {
  /*
    Draws the outside movement boundary as four thin rectangles.

    This is different from the outside wall colliders:
      - wall colliders show the actual blocking wall rectangles
      - bounds show the clamped legal area for the avatar footprint center
  */
  const radius = rigTuning.colliderRadius + rigCollisionMargin;
  const bounds = getOutsideBounds(radius);
  const thickness = 0.09;
  const y = SOLO_TWEAKS.worldDebug.floorLift + 0.04;
  const color = SOLO_TWEAKS.worldDebug.boundsColor;
  const opacity = 0.42;

  return [
    makeDebugRectMesh(
      {
        minX: bounds.minX,
        maxX: bounds.maxX,
        minZ: bounds.minZ - thickness / 2,
        maxZ: bounds.minZ + thickness / 2,
      },
      color,
      opacity,
      y,
    ),
    makeDebugRectMesh(
      {
        minX: bounds.minX,
        maxX: bounds.maxX,
        minZ: bounds.maxZ - thickness / 2,
        maxZ: bounds.maxZ + thickness / 2,
      },
      color,
      opacity,
      y,
    ),
    makeDebugRectMesh(
      {
        minX: bounds.minX - thickness / 2,
        maxX: bounds.minX + thickness / 2,
        minZ: bounds.minZ,
        maxZ: bounds.maxZ,
      },
      color,
      opacity,
      y,
    ),
    makeDebugRectMesh(
      {
        minX: bounds.maxX - thickness / 2,
        maxX: bounds.maxX + thickness / 2,
        minZ: bounds.minZ,
        maxZ: bounds.maxZ,
      },
      color,
      opacity,
      y,
    ),
  ];
}

function makeEncounterDebugMesh(encounter, y) {
  /*
    Builds a visual marker for one trigger zone from encounters.js.

    Supported shapes:
      circle
      rect
  */
  const color = encounter.debugColor || SOLO_TWEAKS.worldDebug.encounterColor;

  if (encounter.shape?.type === "circle") {
    const [x, z] = encounter.shape.center || [0, 0];
    return makeDebugCircleMesh(x, z, encounter.shape.radius || 1, color, 0.22, y);
  }

  if (encounter.shape?.type === "rect") {
    const rect = getEncounterRect(encounter);
    return makeDebugRectMesh(rect, color, 0.18, y);
  }

  console.warn("Unknown encounter debug shape.", encounter);
  return null;
}

function applyWorldDebugVisibility() {
  if (!state.worldDebugView) {
    return;
  }

  state.worldDebugView.setVisible({
    showWorldDebug: rigTuning.showWorldDebug,
    showWallColliders: rigTuning.showWallColliders,
    showTreeColliders: rigTuning.showTreeColliders,
    showOutsideBounds: rigTuning.showOutsideBounds,
    showEncounterZones: rigTuning.showEncounterZones,
    showEncounterLabels: rigTuning.showEncounterLabels,
  });
}

function rebuildWorldDebugView() {
  /*
    Rebuilds the debug overlay after a setting changes the shape of a debug
    object.

    Current reason:
      colliderRadius changes the legal outside bounds, so the outside bounds
      overlay should be regenerated to match the new radius.
  */
  if (!state.worldDebugView) {
    return;
  }

  state.worldDebugView.group.parent?.remove(state.worldDebugView.group);
  disposeObjectTree(state.worldDebugView.group);
  state.worldDebugView = createWorldDebugView();
  scene.add(state.worldDebugView.group);
  applyWorldDebugVisibility();
}

function disposeObjectTree(root) {
  /*
    Disposes GPU resources under a scene object.

    Removing an object from the scene is not enough. Geometry, textures, and
    materials can remain allocated on the GPU. This helper walks the object tree
    and disposes unique resources once.
  */
  const geometries = new Set();
  const materials = new Set();

  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose();
    }

    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    objectMaterials.forEach((material) => {
      if (!material || materials.has(material)) {
        return;
      }

      materials.add(material);
      material.map?.dispose?.();
      material.dispose();
    });
  });
}

function getJointPointOffset(jointName) {
  // Ensures every joint has an offset object before the GUI or rig code edits it.
  if (!rigTuning.jointPointOffsets[jointName]) {
    rigTuning.jointPointOffsets[jointName] = { x: 0, y: 0, z: 0 };
  }

  return rigTuning.jointPointOffsets[jointName];
}

function applyJointPointOffsets() {
  /*
    Applies XYZ pivot-point offsets to the bind pose.

    Formula:
      bindLocalPosition = baseBindLocalPosition + offset

    where:
      baseBindLocalPosition = original joint position from createSkeleton()
      offset                = slider-controlled adjustment

    The live joint.position is then reset to that bind position so the debug
    rig immediately moves as sliders change.
  */
  JOINT_ORDER.forEach((jointName) => {
    const joint = state.skeleton?.joints[jointName];

    if (!joint) {
      return;
    }

    const offset = getJointPointOffset(jointName);
    joint.userData.bindLocalPosition.copy(joint.userData.baseBindLocalPosition);
    joint.userData.bindLocalPosition.add(
      new THREE.Vector3(offset.x, offset.y, offset.z),
    );
    joint.position.copy(joint.userData.bindLocalPosition);
  });

  state.debugView?.refreshBones?.();
  updateAxisMarkerAttachment();
}

function resetJointPointOffsets() {
  // Zeroes all pivot offsets and returns the skeleton to the adjusted bind pose.
  const defaults = makeDefaultJointPointOffsets();

  JOINT_ORDER.forEach((jointName) => {
    Object.assign(getJointPointOffset(jointName), defaults[jointName]);
  });

  applyJointPointOffsets();
  resetSkeletonToBindPose();
  updateGuiDisplays();
}

function getBindRotationOffset(jointName) {
  // Ensures every joint has a bind-rotation object before the GUI edits it.
  if (!rigTuning.bindRotationOffsets[jointName]) {
    rigTuning.bindRotationOffsets[jointName] = { x: 0, y: 0, z: 0 };
  }

  return rigTuning.bindRotationOffsets[jointName];
}

function applyBindRotationOffsets() {
  /*
    These are rest-pose rotations, not animation poses. They let the skeleton
    line up with an imported mesh's modeling pose before skin weights are built.

    Animation functions still pass "motion deltas" like walk swing or arm lift;
    dampJointRotation adds those deltas on top of this bind rotation.
  */
  BIND_ROTATION_JOINTS.forEach((jointName) => {
    const joint = state.skeleton?.joints[jointName];

    if (!joint) {
      return;
    }

    const offset = getBindRotationOffset(jointName);
    const offsetEuler = new THREE.Euler(offset.x, offset.y, offset.z);
    const offsetQuaternion = new THREE.Quaternion().setFromEuler(offsetEuler);

    joint.userData.bindLocalQuaternion.copy(
      joint.userData.baseBindLocalQuaternion,
    );
    joint.userData.bindLocalQuaternion.multiply(offsetQuaternion);
    joint.userData.bindLocalEuler.copy(offsetEuler);
    joint.quaternion.copy(joint.userData.bindLocalQuaternion);
  });
}

function updateBindRotationPose() {
  // Applies rest-pose rotations, returns animated joints to bind pose, then
  // updates generated bones if a skinned mesh is currently present.
  applyBindRotationOffsets();
  resetSkeletonToBindPose();
  syncImportedSkinToPuppet();
}

function rerigImportedMeshAfterBindPoseChange() {
  // Bind-pose changes alter the reference skeleton used for generated weights,
  // so the mesh should be rigged again after applying them.
  updateBindRotationPose();
  rerigImportedMesh();
}

function updateBindRotationReferencePose() {
  // Live update for sliders: show the reference pose immediately. If a rigged
  // mesh exists, regenerate its binding after slider release.
  updateBindRotationPose();

  if (state.importedSkin) {
    rerigImportedMesh();
  }
}

function resetBindRotationOffsets() {
  // Restores all bind-pose rotations to zero and rebuilds the mesh binding.
  const defaults = makeDefaultBindRotationOffsets();

  BIND_ROTATION_JOINTS.forEach((jointName) => {
    Object.assign(getBindRotationOffset(jointName), defaults[jointName]);
  });

  rerigImportedMeshAfterBindPoseChange();
  updateGuiDisplays();
}

function applyFemaleMeshAPosePreset() {
  /*
    femaleMesh.glb is modeled with the arms already lifted away from the torso.
    This preset turns the Empyrean skeleton into a gentle A-pose so the shoulder,
    elbow, wrist, and hand pivots sit much closer to the imported mesh before
    generated skin weights are calculated.
  */
  const targets = {
    leftClavicle: { x: 0, y: 0, z: -0.16 },
    leftShoulder: { x: 0.02, y: 0, z: -1.08 },
    leftElbow: { x: 0.04, y: 0, z: 0.14 },
    leftWrist: { x: 0, y: 0, z: 0.08 },
    leftPalm: { x: 0, y: 0.12, z: 0.16 },
    rightClavicle: { x: 0, y: 0, z: 0.16 },
    rightShoulder: { x: 0.02, y: 0, z: 1.08 },
    rightElbow: { x: 0.04, y: 0, z: -0.14 },
    rightWrist: { x: 0, y: 0, z: -0.08 },
    rightPalm: { x: 0, y: -0.12, z: -0.16 },
    leftHip: { x: 0, y: 0, z: -0.04 },
    rightHip: { x: 0, y: 0, z: 0.04 },
  };

  Object.entries(targets).forEach(([jointName, rotation]) => {
    Object.assign(getBindRotationOffset(jointName), rotation);
  });

  rerigImportedMeshAfterBindPoseChange();
  updateGuiDisplays();
}

function applyRigMeshTPosePreset() {
  /*
    T-pose start preset for mesh rigging.

    The skeleton's neutral authored pose has arms hanging down from the
    shoulders. A T-pose lifts the upper arms out to the sides so the shoulder,
    elbow, and wrist pivots line up with meshes modeled in a classic T stance.

    Rotation intuition:
      The upper arm points down along local -Y.
      Rotating the left shoulder around Z by -PI / 2 swings it toward -X.
      Rotating the right shoulder around Z by +PI / 2 swings it toward +X.

    This preset is intentionally simple. It is a starting pose, not a perfect
    anatomical rig solve.
  */
  const defaults = makeDefaultBindRotationOffsets();
  const targets = {
    leftClavicle: { x: 0, y: 0, z: -0.06 },
    leftShoulder: { x: 0, y: 0, z: -Math.PI / 2 },
    leftElbow: { x: 0, y: 0, z: 0 },
    leftWrist: { x: 0, y: 0, z: 0 },
    leftPalm: { x: 0, y: 0, z: 0 },
    rightClavicle: { x: 0, y: 0, z: 0.06 },
    rightShoulder: { x: 0, y: 0, z: Math.PI / 2 },
    rightElbow: { x: 0, y: 0, z: 0 },
    rightWrist: { x: 0, y: 0, z: 0 },
    rightPalm: { x: 0, y: 0, z: 0 },
  };

  BIND_ROTATION_JOINTS.forEach((jointName) => {
    Object.assign(getBindRotationOffset(jointName), defaults[jointName]);
  });

  Object.entries(targets).forEach(([jointName, rotation]) => {
    Object.assign(getBindRotationOffset(jointName), rotation);
  });

  rerigImportedMeshAfterBindPoseChange();
  updateGuiDisplays();
}

function applyRigMeshStartPose() {
  /*
    Applies the start-pose choice from Rig Mesh Mode.

    Options:
      current = leave the skeleton exactly as it is right now
      aPose   = apply the existing female GLB A-pose preset
      tPose   = apply the simple T-pose preset above
      custom  = reserved placeholder, intentionally inactive for now

    Keeping "current" as the default protects the pose you already tuned.
  */
  if (rigTuning.rigMeshStartPose === "current") {
    updateBindRotationPose();
    console.info("Rig Mesh Mode: keeping the current bind pose.");
    return;
  }

  if (rigTuning.rigMeshStartPose === "aPose") {
    applyFemaleMeshAPosePreset();
    return;
  }

  if (rigTuning.rigMeshStartPose === "tPose") {
    applyRigMeshTPosePreset();
    return;
  }

  console.info("Rig Mesh Mode: custom start pose is reserved for a future pass.");
}

function resetSkeletonToBindPose() {
  /*
    Resets every puppet joint to its current bind pose.

    This does not erase slider offsets. It uses the adjusted bind values stored
    in userData, so the tuned skeleton remains tuned.
  */
  Object.values(state.skeleton.joints).forEach((joint) => {
    joint.position.copy(joint.userData.bindLocalPosition);
    joint.quaternion.copy(joint.userData.bindLocalQuaternion);
    joint.scale.copy(joint.userData.bindLocalScale);
  });
}

function buildGui() {
  /*
    Builds the lil-gui control panel.

    Control organization:
      Debug Visibility     = show/hide lab helpers
      Rig Dimensions       = base skeleton proportions
      Workshop Alignment   = root offset, labels, axis marker
      Joint Point Offsets  = XYZ pivot adjustment for every joint
      Bind Pose Rotations  = rest-pose rotations for matching imported meshes
      Mesh Import / Export = render/rig/clear imported mesh
      Motion               = idle, walk, jump, collider controls
      Bind Pose            = quick reset
      Rig Save             = browser save/load/export
  */
  state.gui = new GUI({ title: "Empyrean Puppet Workshop" });
  state.guiFolders = {};

  const visibilityFolder = state.gui.addFolder("Debug Visibility");
  state.guiFolders.visibility = visibilityFolder;
  addGuiController(visibilityFolder, rigTuning, "labEnabled")
    .name("skeleton lab")
    .onChange(applyVisibility);
  addGuiController(visibilityFolder, rigTuning, "skeletonVisible")
    .name("show pivots")
    .onChange(applyVisibility);
  addGuiController(visibilityFolder, rigTuning, "showJointLabels")
    .name("joint labels")
    .onChange(applyVisibility);
  addGuiController(visibilityFolder, rigTuning, "showAxisMarker")
    .name("axis marker")
    .onChange(applyVisibility);
  addGuiController(visibilityFolder, rigTuning, "showRigCollider")
    .name("rig collider")
    .onChange(applyVisibility);

  const worldDebugFolder = state.gui.addFolder("World Debug");
  state.guiFolders.worldDebug = worldDebugFolder;
  /*
    World Debug is the "collision vision" panel.

    It does not change gameplay. It only shows invisible helper shapes so you
    can place rooms, trees, props, and encounter zones with confidence.
  */
  addGuiController(worldDebugFolder, rigTuning, "showWorldDebug")
    .name("world debug")
    .onChange(applyWorldDebugVisibility);
  addGuiController(worldDebugFolder, rigTuning, "showWallColliders")
    .name("wall colliders")
    .onChange(applyWorldDebugVisibility);
  addGuiController(worldDebugFolder, rigTuning, "showTreeColliders")
    .name("tree colliders")
    .onChange(applyWorldDebugVisibility);
  addGuiController(worldDebugFolder, rigTuning, "showOutsideBounds")
    .name("outside bounds")
    .onChange(applyWorldDebugVisibility);
  addGuiController(worldDebugFolder, rigTuning, "showEncounterZones")
    .name("encounter zones")
    .onChange(applyWorldDebugVisibility);
  addGuiController(worldDebugFolder, rigTuning, "showEncounterLabels")
    .name("encounter labels")
    .onChange(applyWorldDebugVisibility);
  addGuiController(worldDebugFolder, rigTuning, "encounterSystemEnabled")
    .name("encounters active")
    .onChange(() => {
      if (!rigTuning.encounterSystemEnabled) {
        state.encounterRuntime?.activeIds.clear();
        state.worldDebugView?.syncEncounterActivity?.(new Set());
      }
    });
  worldDebugFolder.close();

  const rigMeshModeFolder = state.gui.addFolder("Rig Mesh Mode");
  state.guiFolders.rigMeshMode = rigMeshModeFolder;
  /*
    Rig Mesh Mode is a guided "cockpit" for the mesh-binding workflow.

    The older Mesh Import / Export and Bind Pose Rotations folders still exist,
    but when rig mesh mode is active they are hidden so the GUI feels like it
    has shifted into a focused workflow instead of becoming a longer checklist.
  */
  addGuiController(rigMeshModeFolder, rigTuning, "rigMeshMode")
    .name("rig mesh mode")
    .onChange(applyRigMeshModeVisibility);
  addGuiController(
    rigMeshModeFolder,
    rigTuning,
    "rigMeshStartPose",
    {
      "keep current pose": "current",
      "A pose": "aPose",
      "T pose": "tPose",
      "custom later": "custom",
    },
  ).name("start pose");
  rigMeshModeFolder
    .add({ applyStartPose: applyRigMeshStartPose }, "applyStartPose")
    .name("apply start pose");
  rigMeshModeFolder
    .add({ render: renderDefaultImportedMesh }, "render")
    .name("1 render mesh");
  rigMeshModeFolder
    .add({ rig: rigCurrentImportedMesh }, "rig")
    .name("2 rig rendered mesh");
  rigMeshModeFolder
    .add({ quickRig: loadDefaultImportedMesh }, "quickRig")
    .name("quick load and rig");
  rigMeshModeFolder
    .add({ rerig: rerigImportedMesh }, "rerig")
    .name("rerig current");
  rigMeshModeFolder
    .add({ clear: clearImportedMesh }, "clear")
    .name("clear mesh");
  rigMeshModeFolder
    .add({ exportPackage: exportRigPackageToConsole }, "exportPackage")
    .name("export rig package");
  rigMeshModeFolder
    .add({ importPackage: importRigPackageFromPrompt }, "importPackage")
    .name("import rig package");

  const dimensionFolder = state.gui.addFolder("Rig Dimensions");
  state.guiFolders.dimensions = dimensionFolder;
  RIG_DIMENSION_CONTROLS.forEach(([key, min, max, step]) => {
    // Dimension changes alter parent-relative joint distances, so the hierarchy
    // is rebuilt after the user finishes dragging each slider.
    addGuiController(dimensionFolder, rigTuning, key, min, max, step)
      .name(key)
      .onFinishChange(rebuildSkeletonWorkshop);
  });

  const alignmentFolder = state.gui.addFolder("Workshop Alignment");
  state.guiFolders.alignment = alignmentFolder;
  addGuiController(
    alignmentFolder,
    rigTuning,
    "rootOffsetX",
    ROOT_ALIGNMENT_RANGE.min,
    ROOT_ALIGNMENT_RANGE.max,
    ROOT_ALIGNMENT_RANGE.step,
  ).name("root X");
  addGuiController(
    alignmentFolder,
    rigTuning,
    "rootOffsetY",
    ROOT_ALIGNMENT_RANGE.min,
    ROOT_ALIGNMENT_RANGE.max,
    ROOT_ALIGNMENT_RANGE.step,
  ).name("root Y");
  addGuiController(
    alignmentFolder,
    rigTuning,
    "rootOffsetZ",
    ROOT_ALIGNMENT_RANGE.min,
    ROOT_ALIGNMENT_RANGE.max,
    ROOT_ALIGNMENT_RANGE.step,
  ).name("root Z");
  addGuiController(alignmentFolder, rigTuning, "labelScale", 0.35, 2.2, 0.01)
    .name("label scale")
    .onChange(applyVisibility);
  addGuiController(
    alignmentFolder,
    rigTuning,
    "axisMarkerJoint",
    AXIS_MARKER_JOINTS,
  )
    .name("axis joint")
    .onChange(updateAxisMarkerAttachment);
  addGuiController(
    alignmentFolder,
    rigTuning,
    "axisMarkerScale",
    AXIS_MARKER_SCALE_RANGE.min,
    AXIS_MARKER_SCALE_RANGE.max,
    AXIS_MARKER_SCALE_RANGE.step,
  )
    .name("axis scale")
    .onChange(updateAxisMarkerAttachment);
  addGuiController(alignmentFolder, rigTuning, "mouseJointEditMode")
    .name("mouse point edit")
    .onChange(() => {
      selectMouseJointEditJoint(rigTuning.mouseJointEditJoint);
    });
  addGuiController(
    alignmentFolder,
    rigTuning,
    "mouseJointEditJoint",
    MOUSE_EDIT_JOINTS,
  )
    .name("selected point")
    .onChange(selectMouseJointEditJoint);

  state.guiFolders.jointPointControls = buildJointPointControls(state.gui);
  state.guiFolders.bindRotationControls = buildBindRotationControls(state.gui);

  const meshFolder = state.gui.addFolder("Mesh Import / Export");
  state.guiFolders.meshImport = meshFolder;
  /*
    Mesh workflow:
      1 render mesh        -> show static reference
      tune pivots/rotations
      2 rig rendered mesh  -> create generated SkinnedMesh

    quick load and rig skips the preview step.
  */
  addGuiController(meshFolder, rigTuning, "importedMeshPath").name(
    "asset path",
  );
  addGuiController(meshFolder, rigTuning, "importedMeshVisible")
    .name("mesh visible")
    .onChange(applyImportedMeshPresentation);
  addGuiController(meshFolder, rigTuning, "importedMeshOpacity", 0.05, 1, 0.01)
    .name("mesh opacity")
    .onChange(applyImportedMeshPresentation);
  addGuiController(meshFolder, rigTuning, "importedMeshWireframe")
    .name("mesh wireframe")
    .onChange(applyImportedMeshPresentation);
  addGuiController(meshFolder, rigTuning, "importedMeshAutoFit")
    .name("auto fit")
    .onChange(refreshImportedMeshReference);
  addGuiController(meshFolder, rigTuning, "importedMeshScale", 0.05, 4, 0.01)
    .name("mesh scale")
    .onFinishChange(refreshImportedMeshReference);
  addGuiController(meshFolder, rigTuning, "importedMeshOffsetX", -4, 4, 0.01)
    .name("mesh X")
    .onFinishChange(refreshImportedMeshReference);
  addGuiController(meshFolder, rigTuning, "importedMeshOffsetY", -4, 4, 0.01)
    .name("mesh Y")
    .onFinishChange(refreshImportedMeshReference);
  addGuiController(meshFolder, rigTuning, "importedMeshOffsetZ", -4, 4, 0.01)
    .name("mesh Z")
    .onFinishChange(refreshImportedMeshReference);
  addGuiController(
    meshFolder,
    rigTuning,
    "importedMeshRotationX",
    -Math.PI,
    Math.PI,
    0.01,
  )
    .name("rot X")
    .onFinishChange(refreshImportedMeshReference);
  addGuiController(
    meshFolder,
    rigTuning,
    "importedMeshRotationY",
    -Math.PI,
    Math.PI,
    0.01,
  )
    .name("rot Y")
    .onFinishChange(refreshImportedMeshReference);
  addGuiController(
    meshFolder,
    rigTuning,
    "importedMeshRotationZ",
    -Math.PI,
    Math.PI,
    0.01,
  )
    .name("rot Z")
    .onFinishChange(refreshImportedMeshReference);
  meshFolder
    .add({ render: renderDefaultImportedMesh }, "render")
    .name("1 render mesh");
  meshFolder
    .add({ rig: rigCurrentImportedMesh }, "rig")
    .name("2 rig rendered mesh");
  meshFolder
    .add({ quickRig: loadDefaultImportedMesh }, "quickRig")
    .name("quick load and rig");
  meshFolder.add({ rerig: rerigImportedMesh }, "rerig").name("rerig current");
  meshFolder.add({ clear: clearImportedMesh }, "clear").name("clear mesh");
  meshFolder
    .add({ exportPackage: exportRigPackageToConsole }, "exportPackage")
    .name("export rig package");
  meshFolder
    .add({ importPackage: importRigPackageFromPrompt }, "importPackage")
    .name("import rig package");

  const motionFolder = state.gui.addFolder("Motion");
  state.guiFolders.motion = motionFolder;
  addGuiController(motionFolder, rigTuning, "presetName", Object.keys(PRESETS))
    .name("preset")
    .onChange(applyPreset);
  addGuiController(motionFolder, rigTuning, "idleMotion")
    .name("idle motion")
    .onChange(resetSkeletonToBindPose);
  addGuiController(motionFolder, rigTuning, "walkPreview")
    .name("walk preview")
    .onChange(() => {
      state.walkPhase = 0;
      resetSkeletonToBindPose();
    });
  addGuiController(motionFolder, rigTuning, "motionSpeed", 0.1, 2.2, 0.01).name(
    "speed",
  );
  addGuiController(
    motionFolder,
    rigTuning,
    "breathingAmplitude",
    0,
    0.09,
    0.001,
  ).name("breathing");
  addGuiController(
    motionFolder,
    rigTuning,
    "headDriftAmplitude",
    0,
    0.28,
    0.001,
  ).name("head drift");
  addGuiController(
    motionFolder,
    rigTuning,
    "torsoSwayAmplitude",
    0,
    0.16,
    0.001,
  ).name("torso sway");
  addGuiController(
    motionFolder,
    rigTuning,
    "armTrailAmplitude",
    0,
    0.36,
    0.001,
  ).name("arm trail");
  addGuiController(motionFolder, rigTuning, "damping", 1.2, 10, 0.01).name(
    "damping",
  );
  addGuiController(motionFolder, rigTuning, "walkAmplitude", 0, 1.4, 0.01).name(
    "walk amplitude",
  );
  addGuiController(motionFolder, rigTuning, "jumpHeight", 0.05, 2.5, 0.01).name(
    "jump height",
  );
  addGuiController(
    motionFolder,
    rigTuning,
    "jumpDuration",
    0.28,
    1.8,
    0.01,
  ).name("jump duration");
  addGuiController(
    motionFolder,
    rigTuning,
    "jumpGravityScale",
    0.35,
    2.4,
    0.01,
  ).name("gravity feel");
  addGuiController(
    motionFolder,
    rigTuning,
    "jumpCrouchDepth",
    0,
    0.45,
    0.005,
  ).name("jump crouch");
  addGuiController(motionFolder, rigTuning, "colliderRadius", 0.08, 1.4, 0.01)
    .name("collider radius")
    .onChange(updateRigColliderVisual);
  motionFolder.add({ jump: startJump }, "jump").name("test jump");
  addGuiController(
    motionFolder,
    rigTuning,
    "phaseOffset",
    -Math.PI,
    Math.PI,
    0.01,
  ).name("phase offset");

  const bindPoseFolder = state.gui.addFolder("Bind Pose");
  state.guiFolders.bindPose = bindPoseFolder;
  bindPoseFolder
    .add({ reset: resetSkeletonToBindPose }, "reset")
    .name("reset bind pose");

  const saveFolder = state.gui.addFolder("Rig Save");
  state.guiFolders.save = saveFolder;
  saveFolder.add({ save: saveRigTuningToBrowser }, "save").name("save tuning");
  saveFolder.add({ load: loadRigTuningFromBrowser }, "load").name("load saved");
  saveFolder
    .add({ resetDefaults: resetRigTuningToDefaults }, "resetDefaults")
    .name("reset defaults");
  saveFolder
    .add({ exportJson: exportRigTuningToConsole }, "exportJson")
    .name("copy/log JSON");
  saveFolder
    .add({ clearSaved: clearSavedRigTuning }, "clearSaved")
    .name("clear saved");

  applyRigMeshModeVisibility();
}

function buildJointPointControls(parentFolder) {
  /*
    Creates X/Y/Z sliders for every pivot point.

    These sliders move the joint connection points before animation. They are
    the main "fit the skeleton to the mesh" controls.
  */
  const folder = parentFolder.addFolder("Joint Point Offsets");
  folder.close();

  JOINT_ORDER.forEach((jointName) => {
    const offset = getJointPointOffset(jointName);
    const jointFolder = folder.addFolder(jointName);
    jointFolder.close();

    ["x", "y", "z"].forEach((axis) => {
      addGuiController(
        jointFolder,
        offset,
        axis,
        JOINT_POINT_OFFSET_RANGE.min,
        JOINT_POINT_OFFSET_RANGE.max,
        JOINT_POINT_OFFSET_RANGE.step,
      )
        .name(axis)
        .onChange(applyJointPointOffsets)
        .onFinishChange(resetSkeletonToBindPose);
    });
  });

  folder
    .add({ resetOffsets: resetJointPointOffsets }, "resetOffsets")
    .name("reset point offsets");

  return folder;
}

function buildBindRotationControls(parentFolder) {
  const folder = parentFolder.addFolder("Bind Pose Rotations");
  folder.close();

  /*
    These sliders rotate the rest pose in radians. They are meant for matching a
    model's modeling pose before clicking "load and rig mesh" or "rerig current".
  */
  folder
    .add({ femaleAPose: applyFemaleMeshAPosePreset }, "femaleAPose")
    .name("female GLB A-pose");
  folder
    .add({ resetRotations: resetBindRotationOffsets }, "resetRotations")
    .name("reset rotations");
  folder
    .add({ rerig: rerigImportedMeshAfterBindPoseChange }, "rerig")
    .name("apply and rerig");

  BIND_ROTATION_JOINTS.forEach((jointName) => {
    const offset = getBindRotationOffset(jointName);
    const jointFolder = folder.addFolder(jointName);
    jointFolder.close();

    ["x", "y", "z"].forEach((axis) => {
      addGuiController(
        jointFolder,
        offset,
        axis,
        BIND_ROTATION_RANGE.min,
        BIND_ROTATION_RANGE.max,
        BIND_ROTATION_RANGE.step,
      )
        .name(`rot ${axis.toUpperCase()}`)
        .onChange(updateBindRotationPose)
        .onFinishChange(updateBindRotationReferencePose);
    });
  });

  return folder;
}

function addGuiController(folder, target, key, minOrOptions, max, step) {
  /*
    Small wrapper around lil-gui's add() so every controller is remembered in
    state.guiControllers. That lets updateGuiDisplays() refresh every visible
    control after programmatic changes.
  */
  const usesOptionList =
    Array.isArray(minOrOptions) ||
    (minOrOptions !== null && typeof minOrOptions === "object");
  const controller = usesOptionList
    ? folder.add(target, key, minOrOptions)
    : minOrOptions === undefined
      ? folder.add(target, key)
      : folder.add(target, key, minOrOptions, max, step);

  state.guiControllers.push(controller);
  return controller;
}

function updateGuiDisplays() {
  // Forces GUI controls to redraw after code changes rigTuning directly.
  state.guiControllers.forEach((controller) => controller.updateDisplay());
}

function setGuiFolderVisible(folder, visible) {
  /*
    lil-gui does not need a special workflow system here. A folder is just a DOM
    element, so display:none is enough to tuck advanced/duplicate panels away.

    This keeps the underlying controllers alive and their values intact.
  */
  if (!folder?.domElement) {
    return;
  }

  folder.domElement.style.display = visible ? "" : "none";
}

function applyRigMeshModeVisibility() {
  /*
    Rig Mesh Mode is a focused menu mode, not a different rigging engine.

    When OFF:
      The original Mesh Import / Export and Bind Pose Rotations folders stay
      visible for full manual access.

    When ON:
      Those older folders are hidden and the guided Rig Mesh Mode folder becomes
      the main place for render, pose, rig, rerig, clear, import, and export.

    The underlying functions are the same. This is intentionally a UI
    organization layer so it is low-risk and easy to undo.
  */
  const enabled = Boolean(rigTuning.rigMeshMode);

  setGuiFolderVisible(state.guiFolders.meshImport, !enabled);
  setGuiFolderVisible(state.guiFolders.bindRotationControls, !enabled);

  if (enabled) {
    state.guiFolders.rigMeshMode?.open?.();
    state.guiFolders.dimensions?.open?.();
    state.guiFolders.jointPointControls?.open?.();
    console.info("Rig Mesh Mode enabled.");
  } else {
    console.info("Rig Mesh Mode disabled; full manual folders restored.");
  }
}

function applyPreset(name) {
  // Copies one motion preset onto rigTuning. Presets intentionally affect motion
  // feel only; they do not resize the skeleton.
  if (!PRESETS[name]) {
    return;
  }

  Object.assign(rigTuning, PRESETS[name]);
  updateGuiDisplays();
}

function applyVisibility() {
  /*
    Central visibility switchboard.

    The skeleton root remains visible because imported meshes and colliders may
    be attached under it. This function controls the debug layer, labels,
    collider, axis marker, and imported mesh presentation.
  */
  if (!state.skeleton?.root) {
    return;
  }

  state.skeleton.root.visible = true;
  state.debugView?.setVisible(
    rigTuning.labEnabled && rigTuning.skeletonVisible,
  );
  state.debugView?.setLabelsVisible(
    rigTuning.labEnabled &&
      rigTuning.skeletonVisible &&
      rigTuning.showJointLabels,
  );
  state.debugView?.setLabelScale(rigTuning.labelScale);
  if (state.rigCollider) {
    state.rigCollider.visible =
      rigTuning.labEnabled &&
      rigTuning.skeletonVisible &&
      rigTuning.showRigCollider;
  }
  applyImportedMeshPresentation();
  applyWorldDebugVisibility();
  updateAxisMarkerAttachment();
}

function updateAxisMarkerAttachment() {
  /*
    Moves the AxesHelper onto the selected joint.

    The marker shows local joint axes:
      X = red
      Y = green
      Z = blue

    Because it is parented to the selected joint, it rotates with that joint and
    helps debug bind-pose rotations.
  */
  if (!state.skeleton) {
    return;
  }

  if (!state.axisHelper) {
    state.axisHelper = new THREE.AxesHelper(1);
    state.axisHelper.name = "selected-joint-axis-marker";
    state.axisHelper.renderOrder = 30;

    const materials = Array.isArray(state.axisHelper.material)
      ? state.axisHelper.material
      : [state.axisHelper.material];

    materials.forEach((material) => {
      if (!material) {
        return;
      }

      material.depthTest = false;
      material.transparent = true;
      material.opacity = 0.95;
    });
  }

  const targetJoint =
    state.skeleton.joints[rigTuning.axisMarkerJoint] ||
    state.skeleton.joints.head ||
    state.skeleton.root;

  if (state.axisHelper.parent !== targetJoint) {
    targetJoint.add(state.axisHelper);
  }

  state.axisHelper.scale.setScalar(rigTuning.axisMarkerScale);
  state.axisHelper.visible =
    rigTuning.labEnabled &&
    rigTuning.skeletonVisible &&
    rigTuning.showAxisMarker;
}

function animate(currentTime) {
  /*
    Main render loop.

    currentTime comes from requestAnimationFrame and is measured in
    milliseconds. elapsed converts that to seconds for sine/cosine animation.

    delta is capped at 0.05 seconds so a slow tab or debugger pause does not
    create a huge physics step when the page resumes.
  */
  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = currentTime * 0.001;

  updateKeyboardMotion(delta, currentTime);
  updateEncounterSystem();
  updateJumpPhysics(delta);
  updateSkeleton(delta, elapsed, currentTime);
  syncImportedSkinToPuppet();
  updateGhostSphereMotion(elapsed);
  updateCamera(delta);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updateKeyboardMotion(delta, currentTime) {
  /*
    Reads keyboard state and converts it into movement/camera inputs.

    Movement controls:
      W/S = forward/back along the avatar's facing direction
      A/D = turn avatar left/right

    Camera controls:
      Left/Right arrows = orbit camera around avatar
      Up/Down arrows    = zoom in/out
      PageUp/PageDown   = camera height

    The actual movement call goes through moveRigWithCollision() so walls and
    tree colliders can reject or slide movement.
  */
  const keys = controlState.keys;
  const moveInput = (keys.has("KeyW") ? 1 : 0) + (keys.has("KeyS") ? -1 : 0);
  const turnInput = (keys.has("KeyA") ? 1 : 0) + (keys.has("KeyD") ? -1 : 0);
  const orbitInput =
    (keys.has("ArrowLeft") ? 1 : 0) + (keys.has("ArrowRight") ? -1 : 0);
  const zoomInput =
    (keys.has("ArrowUp") ? -1 : 0) + (keys.has("ArrowDown") ? 1 : 0);
  const heightInput =
    (keys.has("PageUp") ? 1 : 0) + (keys.has("PageDown") ? -1 : 0);

  controlState.yaw += turnInput * delta * 2.2;
  controlState.cameraYaw += orbitInput * delta * SOLO_TWEAKS.camera.keyboardOrbitSpeed;
  controlState.cameraDistance = THREE.MathUtils.clamp(
    controlState.cameraDistance + zoomInput * delta * SOLO_TWEAKS.camera.keyboardZoomSpeed,
    SOLO_TWEAKS.camera.minDistance,
    SOLO_TWEAKS.camera.maxDistance,
  );
  controlState.cameraHeight = THREE.MathUtils.clamp(
    controlState.cameraHeight + heightInput * delta * SOLO_TWEAKS.camera.keyboardHeightSpeed,
    SOLO_TWEAKS.camera.minHeight,
    SOLO_TWEAKS.camera.maxHeight,
  );

  if (moveInput) {
    /*
      Facing direction from yaw:
        x = sin(yaw)
        z = cos(yaw)

      At yaw = 0, forward is +Z. Rotating yaw turns that vector around Y.
    */
    const direction = new THREE.Vector3(
      Math.sin(controlState.yaw),
      0,
      Math.cos(controlState.yaw),
    );
    moveRigWithCollision(direction, moveInput * delta * SOLO_TWEAKS.player.moveSpeed);
    controlState.walkPhase += delta * SOLO_TWEAKS.player.walkPhaseSpeed;
  }

  controlState.isWalking = Math.abs(moveInput) > 0;
  state.skeleton.root.rotation.y = controlState.yaw;

  if (currentTime > controlState.waveUntil && controlState.wasWaving) {
    controlState.wasWaving = false;
  }
}

function updateSkeleton(delta, elapsed, currentTime) {
  /*
    Applies all animation layers to the puppet.

    Order matters:
      1. sync root to player/camera/jump position
      2. idle breathing and head drift
      3. walk pose or leg relaxation
      4. keyboard arm poses/wave
      5. jump pose overlay

    Each layer uses damping so poses ease toward targets instead of snapping.
  */
  if (!state.skeleton) {
    return;
  }

  syncSkeletonRoot();

  if (!rigTuning.labEnabled || !rigTuning.skeletonVisible) {
    return;
  }

  if (rigTuning.idleMotion) {
    updateIdleMotion(delta, elapsed);
  }

  if (rigTuning.walkPreview || controlState.isWalking) {
    updateWalkMotion(delta, elapsed, {
      phase: controlState.isWalking ? controlState.walkPhase : undefined,
      blend: rigTuning.walkPreview ? 1 : 1,
    });
  } else {
    relaxLegs(delta);
  }

  updateControlledArms(delta, currentTime);
  updateJumpPose(delta);
}

function syncSkeletonRoot() {
  /*
    Converts player control position into actual skeleton root position.

    rootOffsetX/Y/Z are workshop alignment offsets. jump.offsetY is added on top
    of rootOffsetY so jumping does not permanently change the saved alignment.
  */
  applyRoomCollision();
  state.skeleton.root.position.copy(controlState.position);
  state.skeleton.root.position.x += rigTuning.rootOffsetX;
  state.skeleton.root.position.y +=
    rigTuning.rootOffsetY + controlState.jump.offsetY;
  state.skeleton.root.position.z += rigTuning.rootOffsetZ;
}
function dampJointRotation(
  joint,
  targetEuler,
  delta,
  damping = rigTuning.damping,
) {
  /*
    Smoothly rotates one joint toward a target pose.

    The targetEuler passed to this function is an animation delta. The function
    adds it on top of the joint's bind rotation:

      final target = bindLocalEuler + targetEuler

    Damping formula:
      t = 1 - 0.001^(delta * damping / 8)

    where:
      delta   = seconds since last frame
      damping = larger values move faster toward the target
      t       = interpolation amount from current rotation to target rotation
  */
  if (!joint) {
    return;
  }

  const t = 1 - Math.pow(0.001, delta * (damping / 8));
  const bindEuler = joint.userData.bindLocalEuler || new THREE.Euler(0, 0, 0);
  const targetX = bindEuler.x + targetEuler.x;
  const targetY = bindEuler.y + targetEuler.y;
  const targetZ = bindEuler.z + targetEuler.z;

  joint.rotation.x = THREE.MathUtils.lerp(joint.rotation.x, targetX, t);
  joint.rotation.y = THREE.MathUtils.lerp(joint.rotation.y, targetY, t);
  joint.rotation.z = THREE.MathUtils.lerp(joint.rotation.z, targetZ, t);
}
function dampJointPositionFromBind(
  joint,
  offset,
  delta,
  damping = rigTuning.damping,
) {
  /*
    Smoothly moves one joint toward an offset from its bind position.

    Formula per axis:
      target = bindLocalPosition + offset
      current = lerp(current, target, t)

    This is used for readable walk/jump/idle offsets without permanently moving
    the joint's actual pivot definition.
  */
  if (!joint) {
    return;
  }

  const t = 1 - Math.pow(0.001, delta * (damping / 8));

  joint.position.x = THREE.MathUtils.lerp(
    joint.position.x,
    joint.userData.bindLocalPosition.x + offset.x,
    t,
  );

  joint.position.y = THREE.MathUtils.lerp(
    joint.position.y,
    joint.userData.bindLocalPosition.y + offset.y,
    t,
  );

  joint.position.z = THREE.MathUtils.lerp(
    joint.position.z,
    joint.userData.bindLocalPosition.z + offset.z,
    t,
  );
}

function updateIdleMotion(delta, elapsed) {
  /*
    Adds subtle life to the rig while standing still.

    Important:
      Breathing is applied mostly to spineBase scale and chest height. It does
      not scale the entire avatar. This keeps feet/root placement stable while
      the torso subtly expands.

    Core formulas:
      time = elapsed * motionSpeed + phaseOffset
      breathing = sin(time * 1.5) * breathingAmplitude
      headLead  = sin(time * 0.58) * headDriftAmplitude

    Different frequencies keep the motion from feeling like one obvious loop.
  */
  const joints = state.skeleton.joints;
  const time = elapsed * rigTuning.motionSpeed + rigTuning.phaseOffset;
  const breathing = Math.sin(time * 1.5) * rigTuning.breathingAmplitude;
  const headLead = Math.sin(time * 0.58) * rigTuning.headDriftAmplitude;
  const headNod =
    Math.sin(time * 0.43 + 1.4) * rigTuning.headDriftAmplitude * 0.34;
  const torsoSway = Math.sin(time * 0.72 + 0.25) * rigTuning.torsoSwayAmplitude;
  const delayedTorso =
    Math.sin(time * 0.72 - 0.48) * rigTuning.torsoSwayAmplitude * 0.55;

  joints.spineBase.scale.set(
    1 + breathing * 0.55,
    1 + breathing * 0.12,
    1 + breathing * 0.32,
  );
  joints.chest.position.y =
    joints.chest.userData.bindLocalPosition.y + breathing * 0.18;

  dampJointRotation(
    joints.pelvis,
    new THREE.Euler(0, 0, -delayedTorso * 0.35),
    delta,
  );
  dampJointRotation(
    joints.spineBase,
    new THREE.Euler(breathing * 0.75, 0, delayedTorso * 0.55),
    delta,
  );
  dampJointRotation(
    joints.chest,
    new THREE.Euler(breathing * 0.45, headLead * 0.16, torsoSway),
    delta,
  );
  dampJointRotation(
    joints.neck,
    new THREE.Euler(headNod * 0.45, headLead * 0.38, -torsoSway * 0.62),
    delta,
    rigTuning.damping * 0.92,
  );
  dampJointRotation(
    joints.head,
    new THREE.Euler(headNod, headLead, -torsoSway * 0.32),
    delta,
    rigTuning.damping * 0.82,
  );
}

function cycle01(phase) {
  // Converts a radian phase into a repeating 0..1 cycle.
  // The double modulo pattern keeps negative phases positive.
  return (((phase / (Math.PI * 2)) % 1) + 1) % 1;
}

function smoothstep(edge0, edge1, x) {
  /*
    Smooth interpolation curve from 0 to 1.

    Formula:
      t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
      result = t * t * (3 - 2 * t)

    Unlike a straight linear ramp, smoothstep eases in and out.
  */
  const t = THREE.MathUtils.clamp((x - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function clamp01(value) {
  // Convenience wrapper for values that should stay between 0 and 1.
  return THREE.MathUtils.clamp(value, 0, 1);
}

function resolveRigRoomCollision(position) {
  /*
    Converts a proposed control position into a legal control position.

    Steps:
      1. Convert control position to world footprint X/Z.
      2. Resolve that footprint against bounds, walls, and tree circles.
      3. Convert the corrected footprint back to control position.
  */
  const footprint = getWorldFootprint(position);
  const resolvedFootprint = resolveFootprintAgainstWorld(footprint);

  return getControlPositionFromFootprint(resolvedFootprint);
}

function applyRoomCollision() {
  // Keeps the current control position legal even if a slider changes the root
  // offset or collider radius while the avatar is near an obstacle.
  controlState.position.copy(resolveRigRoomCollision(controlState.position));
}

function moveRigWithCollision(direction, distance) {
  /*
    Moves the rig with simple sliding collision.

    First try:
      full intended movement vector

    If blocked:
      try X movement alone, then Z movement alone

    That creates a basic slide-along-wall behavior while remaining easy to
    inspect and modify.
  */
  const nextPosition = controlState.position
    .clone()
    .addScaledVector(direction, distance);
  const resolvedPosition = resolveRigRoomCollision(nextPosition);

  if (isControlPositionValid(resolvedPosition)) {
    controlState.position.copy(resolvedPosition);
    return;
  }

  /*
    If the direct diagonal move hits a wall or tree, try each axis separately.
    This gives the rig a simple slide-along-walls feel without a physics engine.
  */
  const xOnly = resolveRigRoomCollision(
    new THREE.Vector3(
      nextPosition.x,
      controlState.position.y,
      controlState.position.z,
    ),
  );
  const zOnly = resolveRigRoomCollision(
    new THREE.Vector3(
      controlState.position.x,
      controlState.position.y,
      nextPosition.z,
    ),
  );

  if (isControlPositionValid(xOnly)) {
    controlState.position.copy(xOnly);
  }

  if (isControlPositionValid(zOnly)) {
    controlState.position.copy(zOnly);
  }
}

function getWorldFootprint(controlPosition) {
  /*
    The collision circle lives at the visible skeleton root position, not just
    the raw control position. Since rootOffsetX/Z can shift the skeleton inside
    the workshop, collision has to include those offsets.
  */
  return new THREE.Vector2(
    controlPosition.x + rigTuning.rootOffsetX,
    controlPosition.z + rigTuning.rootOffsetZ,
  );
}

function getControlPositionFromFootprint(footprint) {
  // Inverse of getWorldFootprint(). Converts corrected world X/Z back into the
  // stored control position.
  return new THREE.Vector3(
    footprint.x - rigTuning.rootOffsetX,
    controlState.position.y,
    footprint.y - rigTuning.rootOffsetZ,
  );
}

function resolveFootprintAgainstWorld(footprint) {
  /*
    Pushes a 2D circular footprint out of all obstacles.

    radius:
      visible collider radius + small safety margin

    Why three iterations?
      Pushing out of one obstacle can push the circle into another nearby
      obstacle. A few passes settle most simple cases without a physics engine.
  */
  const radius = rigTuning.colliderRadius + rigCollisionMargin;
  const resolved = footprint.clone();
  const bounds = getOutsideBounds(radius);

  resolved.x = THREE.MathUtils.clamp(resolved.x, bounds.minX, bounds.maxX);
  resolved.y = THREE.MathUtils.clamp(resolved.y, bounds.minZ, bounds.maxZ);

  for (let iteration = 0; iteration < 3; iteration += 1) {
    worldCollision.solidRects.forEach((rect) => {
      pushFootprintOutOfRect(resolved, rect, radius);
    });
    worldCollision.solidCircles.forEach((circle) => {
      pushFootprintOutOfCircle(resolved, circle, radius);
    });

    resolved.x = THREE.MathUtils.clamp(resolved.x, bounds.minX, bounds.maxX);
    resolved.y = THREE.MathUtils.clamp(resolved.y, bounds.minZ, bounds.maxZ);
  }

  return resolved;
}

function getOutsideBounds(radius) {
  /*
    Returns the legal min/max X/Z values for the center of the player collider.

    The radius is subtracted from the enclosure size so the edge of the circle,
    not its center, stays inside the boundary.
  */
  const halfUsable = worldCollision.bounds.halfSize - wallThickness - radius;

  return {
    minX: worldCollision.bounds.centerX - halfUsable,
    maxX: worldCollision.bounds.centerX + halfUsable,
    minZ: worldCollision.bounds.centerZ - halfUsable,
    maxZ: worldCollision.bounds.centerZ + halfUsable,
  };
}

function pushFootprintOutOfRect(point, rect, radius) {
  /*
    Circle-vs-axis-aligned-rectangle resolver.

    Instead of doing full circle/rectangle contact math, this expands the
    rectangle by the circle radius and treats the circle center as a point.

    If the point is inside the expanded rectangle, move it to the nearest edge.

    This works well for thin walls and simple tabletop obstacles.
  */
  const expanded = {
    minX: rect.minX - radius,
    maxX: rect.maxX + radius,
    minZ: rect.minZ - radius,
    maxZ: rect.maxZ + radius,
  };

  if (
    point.x < expanded.minX ||
    point.x > expanded.maxX ||
    point.y < expanded.minZ ||
    point.y > expanded.maxZ
  ) {
    return;
  }

  const distances = [
    {
      axis: "x",
      value: expanded.minX,
      distance: Math.abs(point.x - expanded.minX),
    },
    {
      axis: "x",
      value: expanded.maxX,
      distance: Math.abs(expanded.maxX - point.x),
    },
    {
      axis: "z",
      value: expanded.minZ,
      distance: Math.abs(point.y - expanded.minZ),
    },
    {
      axis: "z",
      value: expanded.maxZ,
      distance: Math.abs(expanded.maxZ - point.y),
    },
  ].sort((a, b) => a.distance - b.distance);
  const nearest = distances[0];

  if (nearest.axis === "x") {
    point.x = nearest.value;
  } else {
    point.y = nearest.value;
  }
}

function pushFootprintOutOfCircle(point, circle, radius) {
  /*
    Circle-vs-circle resolver for trees.

    Variables:
      dx, dz      = vector from obstacle center to player footprint
      minDistance = obstacle radius + player radius
      distance    = current center-to-center distance

    If distance is too small, move the player footprint outward along the
    center-to-center direction until the circles just touch.
  */
  const dx = point.x - circle.centerX;
  const dz = point.y - circle.centerZ;
  const minDistance = circle.radius + radius;
  const distance = Math.hypot(dx, dz);

  if (distance >= minDistance) {
    return;
  }

  if (distance < 0.0001) {
    point.x = circle.centerX + minDistance;
    return;
  }

  point.x = circle.centerX + (dx / distance) * minDistance;
  point.y = circle.centerZ + (dz / distance) * minDistance;
}

function isControlPositionValid(controlPosition) {
  // Tests a proposed control position after converting it to world footprint.
  const footprint = getWorldFootprint(controlPosition);
  return isFootprintValid(footprint);
}

function isFootprintValid(footprint) {
  // Boolean version of the collision check. Used by movement to decide whether
  // a resolved step is acceptable.
  const radius = rigTuning.colliderRadius + rigCollisionMargin;
  const bounds = getOutsideBounds(radius);

  if (
    footprint.x < bounds.minX ||
    footprint.x > bounds.maxX ||
    footprint.y < bounds.minZ ||
    footprint.y > bounds.maxZ
  ) {
    return false;
  }

  const intersectsRect = worldCollision.solidRects.some(
    (rect) =>
      footprint.x > rect.minX - radius &&
      footprint.x < rect.maxX + radius &&
      footprint.y > rect.minZ - radius &&
      footprint.y < rect.maxZ + radius,
  );

  if (intersectsRect) {
    return false;
  }

  return !worldCollision.solidCircles.some(
    (circle) =>
      Math.hypot(footprint.x - circle.centerX, footprint.y - circle.centerZ) <
      circle.radius + radius,
  );
}

function createEncounterRuntime(definitions) {
  /*
    Converts the raw encounter definitions from encounters.js into runtime state.

    definitions:
      The editable data list.

    activeIds:
      Set of encounter ids the avatar is currently inside.

    Disabled encounters are kept out of the runtime list so they do not trigger
    actions or draw debug zones.
  */
  return {
    definitions: definitions.filter((encounter) => encounter.enabled !== false),
    activeIds: new Set(),
  };
}

function updateEncounterSystem() {
  /*
    Checks the avatar's footprint against every encounter trigger.

    This runs once per animation frame. The logic only fires actions when the
    inside/outside state changes:

      outside -> inside = onEnter
      inside -> outside = onExit

    That keeps audio changes, console messages, and other one-shot actions from
    repeating every frame.
  */
  if (!rigTuning.encounterSystemEnabled || !state.encounterRuntime) {
    return;
  }

  const footprint = getWorldFootprint(controlState.position);

  state.encounterRuntime.definitions.forEach((encounter) => {
    const isInside = isFootprintInsideEncounter(footprint, encounter);
    const wasInside = state.encounterRuntime.activeIds.has(encounter.id);

    if (isInside && !wasInside) {
      state.encounterRuntime.activeIds.add(encounter.id);
      runEncounterActions(encounter.onEnter, encounter, "enter");
    } else if (!isInside && wasInside) {
      state.encounterRuntime.activeIds.delete(encounter.id);
      runEncounterActions(encounter.onExit, encounter, "exit");
    }
  });

  state.worldDebugView?.syncEncounterActivity?.(
    state.encounterRuntime.activeIds,
  );
}

function isFootprintInsideEncounter(footprint, encounter) {
  /*
    Tests the avatar footprint center against an encounter shape.

    For now, the avatar collider radius is not added to encounter tests. This is
    deliberate: encounter zones feel easier to place when they trigger from the
    avatar center point. If you want edge-triggering later, add collider radius
    to circle.radius or expand the rect here.
  */
  if (encounter.shape?.type === "circle") {
    const [centerX, centerZ] = encounter.shape.center || [0, 0];
    const radius = encounter.shape.radius || 1;
    return Math.hypot(footprint.x - centerX, footprint.y - centerZ) <= radius;
  }

  if (encounter.shape?.type === "rect") {
    const rect = getEncounterRect(encounter);
    return (
      footprint.x >= rect.minX &&
      footprint.x <= rect.maxX &&
      footprint.y >= rect.minZ &&
      footprint.y <= rect.maxZ
    );
  }

  return false;
}

function getEncounterRect(encounter) {
  /*
    Normalizes a rectangle encounter into min/max form.

    Preferred editable form in encounters.js:
      center: [x, z]
      size: [width, depth]

    Supported alternate form:
      min: [minX, minZ]
      max: [maxX, maxZ]
  */
  if (encounter.shape?.min && encounter.shape?.max) {
    return {
      minX: encounter.shape.min[0],
      maxX: encounter.shape.max[0],
      minZ: encounter.shape.min[1],
      maxZ: encounter.shape.max[1],
    };
  }

  const [centerX, centerZ] = encounter.shape?.center || [0, 0];
  const [width, depth] = encounter.shape?.size || [1, 1];

  return {
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minZ: centerZ - depth / 2,
    maxZ: centerZ + depth / 2,
  };
}

function getEncounterCenter(encounter) {
  /*
    Returns the center of an encounter in X/Z space as a THREE.Vector2.

    Used for debug labels.
  */
  if (encounter.shape?.type === "circle") {
    const [x, z] = encounter.shape.center || [0, 0];
    return new THREE.Vector2(x, z);
  }

  const rect = getEncounterRect(encounter);
  return new THREE.Vector2(
    (rect.minX + rect.maxX) / 2,
    (rect.minZ + rect.maxZ) / 2,
  );
}

function runEncounterActions(actions = [], encounter, phase) {
  /*
    Runs each action listed in an encounter's onEnter or onExit array.

    phase is currently "enter" or "exit". It is included in console output so
    debugging messages tell you when the transition happened.
  */
  actions.forEach((action) => {
    applyEncounterAction(action, encounter, phase);
  });
}

function applyEncounterAction(action, encounter, phase) {
  /*
    Dispatch table for encounter actions.

    To add a new action type later:
      1. Add a new case here.
      2. Document the action shape in encounters.js.
      3. Add an example to WORLD_COOKBOOK.md.
  */
  switch (action.type) {
    case "log":
      console.info(`[encounter:${phase}] ${encounter.id}`, action.message || "");
      break;
    case "audio":
      applyEncounterAudioAction(action);
      break;
    case "jupiterColor":
      jupiter.material.color.set(action.color || SOLO_TWEAKS.jupiter.color);
      break;
    case "jupiterScale":
      jupiter.scale.setScalar(Number.isFinite(action.scale) ? action.scale : 1);
      break;
    default:
      console.warn("Unknown encounter action.", { encounter, action });
      break;
  }
}

function applyEncounterAudioAction(action) {
  /*
    Applies an audio action to the current background audio object.

    Supported fields:
      src          = optional new audio file path
      volume       = 0..1
      playbackRate = rate multiplier
      loop         = true/false
      play         = true to request playback
      pause        = true to pause

    This is intentionally simple right now. A future version can add timed fades
    by storing a target volume and easing toward it in animate().
  */
  if (action.src && !myAudio.src.endsWith(action.src)) {
    myAudio.pause();
    myAudio.src = action.src;
    myAudio.load();
  }

  if (Number.isFinite(action.volume)) {
    myAudio.volume = THREE.MathUtils.clamp(action.volume, 0, 1);
  }

  if (Number.isFinite(action.playbackRate)) {
    myAudio.playbackRate = THREE.MathUtils.clamp(action.playbackRate, 0.5, 4);
  }

  if (typeof action.loop === "boolean") {
    myAudio.loop = action.loop;
  }

  if (action.pause) {
    myAudio.pause();
    return;
  }

  if (action.play) {
    myAudio.play().catch((error) => {
      console.info("Encounter audio is waiting for user interaction.", error);
    });
  }
}

function getJumpGravity() {
  /*
    For a symmetric hop:

    gravity = (8 * height) / duration^2

    where height is scene units and duration is seconds for the complete
    up-and-down arc. jumpGravityScale intentionally bends that formula for
    feel: > 1 snaps harder, < 1 floats longer.
  */
  const duration = Math.max(0.001, rigTuning.jumpDuration);
  const baseGravity = (8 * rigTuning.jumpHeight) / (duration * duration);
  return baseGravity * rigTuning.jumpGravityScale;
}

function getJumpLaunchVelocity() {
  /*
    launchVelocity = sqrt(2 * gravity * height)

    With gravityScale = 1 this is equivalent to:
    launchVelocity = (4 * height) / duration
  */
  return Math.sqrt(2 * getJumpGravity() * rigTuning.jumpHeight);
}

function startJump() {
  /*
    Begins a jump only if grounded.

    The crouch phase gives the pose time to compress before physics launches
    the root upward. Without it, the jump starts too abruptly.
  */
  const jump = controlState.jump;

  if (jump.phase !== "grounded") {
    return;
  }

  jump.phase = "crouch";
  jump.elapsed = 0;
  jump.offsetY = 0;
  jump.velocityY = 0;
}

function launchJump() {
  // Switches from crouch to air and gives the root an upward velocity.
  const jump = controlState.jump;

  jump.phase = "air";
  jump.elapsed = 0;
  jump.velocityY = getJumpLaunchVelocity();
}

function updateJumpPhysics(delta) {
  /*
    Updates the jump state machine.

    Air physics:
      velocityY = velocityY - gravity * delta
      offsetY   = offsetY + velocityY * delta

    offsetY is applied in syncSkeletonRoot(), so jump physics stays separate
    from the skeleton's saved root alignment.
  */
  const jump = controlState.jump;

  if (jump.phase === "grounded") {
    jump.offsetY = 0;
    jump.velocityY = 0;
    return;
  }

  jump.elapsed += delta;

  if (jump.phase === "crouch") {
    if (jump.elapsed >= jump.crouchDuration) {
      launchJump();
    }
    return;
  }

  if (jump.phase === "air") {
    jump.velocityY -= getJumpGravity() * delta;
    jump.offsetY += jump.velocityY * delta;

    if (jump.offsetY <= 0 && jump.velocityY < 0) {
      jump.phase = "landing";
      jump.elapsed = 0;
      jump.offsetY = 0;
      jump.velocityY = 0;
    }
    return;
  }

  if (jump.phase === "landing" && jump.elapsed >= jump.landingDuration) {
    jump.phase = "grounded";
    jump.elapsed = 0;
  }
}

function getJumpPoseWeights() {
  /*
    Converts jump state into pose-blend weights.

    Returned weights:
      crouch  = compression before takeoff
      air     = leg/arm pose while airborne
      landing = compression after returning to floor

    These are animation weights only. The vertical root motion comes from
    updateJumpPhysics().
  */
  const jump = controlState.jump;

  if (jump.phase === "crouch") {
    return {
      crouch: smoothstep(0, jump.crouchDuration, jump.elapsed),
      air: 0,
      landing: 0,
    };
  }

  if (jump.phase === "air") {
    return {
      crouch: 0,
      air: 1,
      landing: 0,
    };
  }

  if (jump.phase === "landing") {
    return {
      crouch: 0,
      air: 0,
      landing: 1 - smoothstep(0, jump.landingDuration, jump.elapsed),
    };
  }

  return { crouch: 0, air: 0, landing: 0 };
}

function getStepPhase(phase) {
  /*
    Converts a walk phase into readable gait markers.

    t is the normalized phase:
      0.00 to 0.50 = stance/contact
      0.50 to 1.00 = swing/recovery

    lift:
      sin(swingProgress * PI), so it rises from 0, peaks at 1, returns to 0

    pushOff:
      ramps up late in stance, like pushing from the toe

    plant:
      strong at the start of stance, then fades as the foot settles
  */
  const t = cycle01(phase);

  // Rough gait phases:
  // 0.00 - 0.50 = stance/contact
  // 0.50 - 1.00 = swing/recovery
  const isSwing = t >= 0.5;

  const swingProgress = isSwing ? (t - 0.5) / 0.5 : 0;
  const stanceProgress = !isSwing ? t / 0.5 : 0;

  const lift = isSwing ? Math.sin(swingProgress * Math.PI) : 0;

  const pushOff = !isSwing ? smoothstep(0.65, 1.0, stanceProgress) : 0;

  const plant = !isSwing ? 1 - smoothstep(0.0, 0.2, stanceProgress) : 0;

  return {
    t,
    isSwing,
    swingProgress,
    stanceProgress,
    lift,
    pushOff,
    plant,
  };
}

function updateWalkMotion(delta, elapsed, options = {}) {
  /*
    Applies whole-body and leg motion for walking.

    There are two phase sources:
      - controlState.walkPhase when the user is actually moving
      - state.walkPhase when the GUI "walk preview" is playing in place

    The left and right legs are offset by PI radians, meaning when one leg is in
    swing, the other is in stance.
  */
  const joints = state.skeleton.joints;
  const usesExternalPhase = Number.isFinite(options.phase);

  if (!usesExternalPhase) {
    state.walkPhase += delta * 6.4 * rigTuning.motionSpeed;
  }

  const sourcePhase = usesExternalPhase ? options.phase : state.walkPhase;
  const phase = sourcePhase + rigTuning.phaseOffset;
  const amplitude = rigTuning.walkAmplitude * (options.blend ?? 1);
  const leftSwing = Math.sin(phase) * amplitude;
  const rightSwing = Math.sin(phase + Math.PI) * amplitude;

  /*
    doubleStep runs twice per walk cycle. That is useful for body bob because
    the body rises/falls with each footstep, not only once per full left+right
    cycle.
  */
  const doubleStep = Math.sin(phase * 2);
  const bodyBob = Math.abs(doubleStep) * 0.04 * amplitude;
  const hipSway = doubleStep * 0.055 * amplitude;
  const chestCounterSway = Math.sin(phase * 2 - 0.55) * 0.04 * amplitude;
  const headStabilizer = Math.sin(phase * 2 - 1.1) * 0.025 * amplitude;
  const leftStep = getStepPhase(phase);
  const rightStep = getStepPhase(phase + Math.PI);

  const leftSupport = leftStep.isSwing ? 0 : 1;
  const rightSupport = rightStep.isSwing ? 0 : 1;

  const supportBalance = rightSupport - leftSupport;
  /*
    supportBalance:
      +1 when right foot supports
      -1 when left foot supports
       0 when both are equally treated

    This shifts the pelvis over the supporting side and keeps the walk from
    looking like the legs are moving under a locked torso.
  */
  const weightShift = supportBalance * 0.035 * amplitude;
  const headCounterY = -bodyBob * 0.35;
  joints.body.position.y = joints.body.userData.bindLocalPosition.y + bodyBob;
  dampJointRotation(
    joints.pelvis,
    new THREE.Euler(0, hipSway * 0.35, -hipSway),
    delta,
  );
  dampJointRotation(
    joints.chest,
    new THREE.Euler(0.02 * amplitude, -hipSway * 0.55, chestCounterSway),
    delta,
    rigTuning.damping * 0.9,
  );
  dampJointRotation(
    joints.head,
    new THREE.Euler(0.02 * amplitude, -headStabilizer, -chestCounterSway * 0.2),
    delta,
    rigTuning.damping * 0.72,
  );
  dampJointPositionFromBind(
    joints.pelvis,
    {
      x: weightShift,
      y: 0,
      z: 0,
    },
    delta,
    rigTuning.damping * 0.8,
  );

  dampJointPositionFromBind(
    joints.head,
    {
      x: -weightShift * 0.25,
      y: headCounterY,
      z: 0,
    },
    delta,
    rigTuning.damping * 0.55,
  );
  updateLegWalk("left", -1, leftSwing, phase, delta, amplitude);
  updateLegWalk("right", 1, rightSwing, phase + Math.PI, delta, amplitude);
}

function updateLegWalk(sideName, side, swing, phase, delta, amplitude) {
  /*
    Animates one leg.

    sideName = "left" or "right"
    side     = -1 for left, +1 for right
    swing    = sine wave value for this leg
    phase    = phase offset for this leg

    This combines joint rotations with small joint-position offsets. The offsets
    are not physically perfect inverse kinematics, but they give readable foot
    lift, knee drift, toe push, and planted-foot behavior.
  */
  const step = getStepPhase(phase);
  const joints = state.skeleton.joints;
  const hip = joints[`${sideName}Hip`];
  const knee = joints[`${sideName}Knee`];
  const ankle = joints[`${sideName}Ankle`];
  const foot = joints[`${sideName}Foot`];
  const kneeLift = step.lift;
  const toePush = step.pushOff;
  const footPlant = step.plant;

  // Forward/back foot travel.
  // Positive swing means leg forward/back depending on your current coordinate feel.
  const footTravel = swing * 0.1 * amplitude;

  // This makes the knee drift slightly outward during lift,
  // which reads better than perfectly straight hinge motion.
  const readableKneeBend = side * kneeLift * 0.075 + swing * 0.025;
  const readableAnkleBend = -side * kneeLift * 0.052 - swing * 0.018;
  dampJointPositionFromBind(
    knee,
    {
      x: readableKneeBend,
      y: kneeLift * 0.035,
      z: footTravel * 0.75,
    },
    delta,
  );

  dampJointPositionFromBind(
    ankle,
    {
      x: readableAnkleBend,
      y: kneeLift * 0.055 - footPlant * 0.01,
      z: footTravel,
    },
    delta,
  );

  dampJointPositionFromBind(
    foot,
    {
      x: -readableAnkleBend * 0.5,
      y: kneeLift * 0.025 + toePush * 0.015,
      z: footTravel * 0.45 + toePush * 0.045,
    },
    delta,
  );

  dampJointRotation(
    hip,
    new THREE.Euler(
      swing * 0.34,
      side * 0.025 * amplitude,
      side * 0.06 * amplitude,
    ),
    delta,
  );

  dampJointRotation(
    knee,
    new THREE.Euler(
      0.06 + kneeLift * 0.38 + Math.max(0, -swing) * 0.12,
      0,
      side * kneeLift * 0.06,
    ),
    delta,
  );

  dampJointRotation(
    ankle,
    new THREE.Euler(
      -swing * 0.12 + toePush * 0.24 - footPlant * 0.08,
      side * 0.015 * amplitude,
      0,
    ),
    delta,
  );

  dampJointRotation(
    foot,
    new THREE.Euler(
      toePush * 0.28 - footPlant * 0.12,
      0,
      -side * 0.025 * amplitude,
    ),
    delta,
  );
}

function relaxLegs(delta) {
  /*
    When not walking, smoothly returns all leg joints to bind pose.

    This prevents the last walk frame from freezing with one knee lifted.
  */
  const joints = state.skeleton.joints;

  ["left", "right"].forEach((sideName) => {
    ["Hip", "Knee", "Ankle", "Foot"].forEach((jointName) => {
      const joint = joints[`${sideName}${jointName}`];
      dampJointRotation(
        joint,
        new THREE.Euler(0, 0, 0),
        delta,
        rigTuning.damping * 0.88,
      );
      dampJointPositionFromBind(
        joint,
        { x: 0, y: 0, z: 0 },
        delta,
        rigTuning.damping * 0.9,
      );
    });
  });
}

function updateJumpPose(delta) {
  /*
    Adds jump pose on top of the root jump physics.

    The root carries actual vertical movement. This function only adjusts the
    skeleton shape: crouch compression, airborne leg tuck, floating arms, and
    landing absorption.
  */
  const weights = getJumpPoseWeights();
  const compression = weights.crouch + weights.landing;
  const hasJumpPose = compression > 0.001 || weights.air > 0.001;

  if (!hasJumpPose) {
    return;
  }

  const joints = state.skeleton.joints;
  const crouchDrop = compression * rigTuning.jumpCrouchDepth;
  const airLegTuck = weights.air * 0.14;
  const armFloat = weights.air * 0.55 - weights.landing * 0.25;

  /*
    Root Y carries the actual jump arc. This body offset is only the pose:
    crouch before takeoff and absorb the landing after the root returns to floor.
  */
  joints.body.position.y -= crouchDrop;

  ["left", "right"].forEach((sideName, index) => {
    const side = index === 0 ? -1 : 1;

    dampJointRotation(
      joints[`${sideName}Hip`],
      new THREE.Euler(-0.22 * compression + airLegTuck, 0, side * 0.04),
      delta,
      rigTuning.damping * 1.2,
    );
    dampJointRotation(
      joints[`${sideName}Knee`],
      new THREE.Euler(0.55 * compression + weights.air * 0.2, 0, 0),
      delta,
      rigTuning.damping * 1.2,
    );
    dampJointRotation(
      joints[`${sideName}Ankle`],
      new THREE.Euler(-0.22 * compression - weights.air * 0.08, 0, 0),
      delta,
      rigTuning.damping * 1.2,
    );
    dampJointRotation(
      joints[`${sideName}Shoulder`],
      new THREE.Euler(-0.08, 0, side * (0.18 + armFloat)),
      delta,
      rigTuning.damping * 0.7,
    );
  });

  dampJointRotation(
    joints.head,
    new THREE.Euler(-0.04 * compression, 0, 0),
    delta,
    rigTuning.damping * 0.55,
  );
}

function updateControlledArms(delta, currentTime) {
  /*
    Chooses active arm poses.

    A timed wave overrides normal left/right arm toggles until waveUntil passes.
  */
  const isWaving = currentTime < controlState.waveUntil;
  const leftState = isWaving ? "wave" : controlState.leftArm;
  const rightState = isWaving ? "wave" : controlState.rightArm;

  updateControlledArm("left", -1, leftState, delta, currentTime);
  updateControlledArm("right", 1, rightState, delta, currentTime);
}

function updateControlledArm(sideName, side, pose, delta, currentTime) {
  /*
    Applies one controlled arm pose.

    Poses:
      down = relaxed idle trail
      half = both hands half high
      up   = selected arm high
      wave = temporary waving pose with wrist/palm oscillation

    side mirrors the pose across the body:
      left  side = -1
      right side = +1
  */
  const joints = state.skeleton.joints;
  const shoulder = joints[`${sideName}Shoulder`];
  const elbow = joints[`${sideName}Elbow`];
  const wrist = joints[`${sideName}Wrist`];
  const palm = joints[`${sideName}Palm`];
  const time = currentTime * 0.001;
  const trail = Math.sin(time * 0.72 - 1.1) * rigTuning.armTrailAmplitude;
  const handFloat =
    Math.sin(time * 0.9 - 1.65) * rigTuning.armTrailAmplitude * 0.45;
  const wave = pose === "wave" ? Math.sin(time * 9) * 0.45 : 0;
  let shoulderTarget = new THREE.Euler(trail * 0.12, 0, side * 0.16);
  let elbowTarget = new THREE.Euler(0.08, 0, side * 0.08);
  let wristTarget = new THREE.Euler(
    handFloat * 0.08,
    0,
    -side * handFloat * 0.26,
  );
  let palmTarget = new THREE.Euler(0, 0, side * 0.04);

  if (pose === "up") {
    shoulderTarget = new THREE.Euler(-0.2, 0, side * 2.2);
    elbowTarget = new THREE.Euler(0.16, 0, side * 0.22);
  } else if (pose === "half") {
    shoulderTarget = new THREE.Euler(-0.08, 0, side * 1.12);
    elbowTarget = new THREE.Euler(0.18, 0, side * 0.2);
  } else if (pose === "wave") {
    shoulderTarget = new THREE.Euler(-0.12, 0, side * 1.85);
    elbowTarget = new THREE.Euler(0.18, 0, side * (0.25 + wave));
    wristTarget = new THREE.Euler(0.1, 0, side * wave * 0.8);
    palmTarget = new THREE.Euler(0.08, 0, side * wave * 0.65);
  }

  dampJointRotation(shoulder, shoulderTarget, delta, rigTuning.damping);
  dampJointRotation(elbow, elbowTarget, delta, rigTuning.damping);
  dampJointRotation(wrist, wristTarget, delta, rigTuning.damping);
  dampJointRotation(palm, palmTarget, delta, rigTuning.damping);
}

function updateCamera(delta) {
  /*
    Third-person follow camera.

    target:
      skeleton root plus a small Y offset so the camera looks toward the upper
      body, not the feet.

    yaw:
      avatar yaw + extra camera orbit yaw

    offset:
      x = sin(yaw) * distance
      z = cos(yaw) * distance
      y = cameraHeight

    The camera lerps to the desired position for smooth following.
  */
  const target = state.skeleton.root.position
    .clone()
    .add(new THREE.Vector3(0, 1.65, 0));
  const yaw = controlState.yaw + controlState.cameraYaw;
  const offset = new THREE.Vector3(
    Math.sin(yaw) * controlState.cameraDistance,
    controlState.cameraHeight,
    Math.cos(yaw) * controlState.cameraDistance,
  );
  const desiredPosition = target.clone().add(offset);

  camera.position.lerp(desiredPosition, 1 - Math.pow(0.001, delta));
  camera.lookAt(target);
}

function selectMouseJointEditJoint(jointKey = rigTuning.mouseJointEditJoint) {
  /*
    Selects the joint point that mouse editing should highlight.

    Selection can happen two ways:
      - choose a joint from the GUI dropdown
      - click a visible joint marker in the scene

    The selected joint is only a target for editing. The actual point does not
    move until a drag updates that joint's Joint Point Offset values.
  */
  if (!MOUSE_EDIT_JOINTS.includes(jointKey)) {
    jointKey = "head";
  }

  rigTuning.mouseJointEditJoint = jointKey;
  mouseJointEditor.selectedJointKey = jointKey;
  state.debugView?.setSelectedJoint?.(jointKey);
  updateGuiDisplays();
}

function getScenePointer(event) {
  /*
    Converts a browser pointer event into normalized device coordinates.

    Three.js raycasting expects:
      x = -1 at left edge, +1 at right edge
      y = +1 at top edge, -1 at bottom edge
  */
  const rect = renderer.domElement.getBoundingClientRect();

  mouseJointEditor.pointer.x =
    ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
  mouseJointEditor.pointer.y =
    -(((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 - 1);

  return mouseJointEditor.pointer;
}

function handleJointEditPointerDown(event) {
  /*
    Starts a joint-point drag if mouse point edit mode is enabled and the user
    clicked a visible debug marker.

    Drag plane:
      A camera-facing plane through the selected joint. This makes the drag feel
      like "move this point under my cursor" without needing a full transform
      gizmo yet.
  */
  if (
    !rigTuning.mouseJointEditMode ||
    !rigTuning.labEnabled ||
    !rigTuning.skeletonVisible ||
    !state.debugView?.selectableMarkers?.length
  ) {
    return;
  }

  mouseJointEditor.raycaster.setFromCamera(getScenePointer(event), camera);

  const intersections = mouseJointEditor.raycaster.intersectObjects(
    state.debugView.selectableMarkers.filter(
      (marker) => marker.visible && marker.userData.isJointEditHandle,
    ),
    false,
  );

  if (!intersections.length) {
    return;
  }

  const marker = intersections[0].object;
  const jointKey = marker.userData.jointKey;
  const joint = state.skeleton.joints[jointKey];

  if (!joint?.parent) {
    return;
  }

  event.preventDefault();
  sceneContainer.setPointerCapture?.(event.pointerId);
  selectMouseJointEditJoint(jointKey);

  joint.getWorldPosition(mouseJointEditor.dragStartWorld);
  mouseJointEditor.dragStartLocal.copy(joint.userData.bindLocalPosition);

  const cameraNormal = new THREE.Vector3();
  camera.getWorldDirection(cameraNormal).normalize();
  mouseJointEditor.dragPlane.setFromNormalAndCoplanarPoint(
    cameraNormal,
    mouseJointEditor.dragStartWorld,
  );

  mouseJointEditor.raycaster.ray.intersectPlane(
    mouseJointEditor.dragPlane,
    mouseJointEditor.dragCurrentWorld,
  );
  joint.parent.worldToLocal(
    mouseJointEditor.dragStartParentLocal.copy(
      mouseJointEditor.dragCurrentWorld,
    ),
  );

  mouseJointEditor.dragging = true;
}

function handleJointEditPointerMove(event) {
  if (!mouseJointEditor.dragging || !mouseJointEditor.selectedJointKey) {
    return;
  }

  const joint = state.skeleton.joints[mouseJointEditor.selectedJointKey];

  if (!joint?.parent) {
    return;
  }

  event.preventDefault();
  mouseJointEditor.raycaster.setFromCamera(getScenePointer(event), camera);

  const hit = mouseJointEditor.raycaster.ray.intersectPlane(
    mouseJointEditor.dragPlane,
    mouseJointEditor.dragCurrentWorld,
  );

  if (!hit) {
    return;
  }

  joint.parent.worldToLocal(
    mouseJointEditor.dragCurrentParentLocal.copy(
      mouseJointEditor.dragCurrentWorld,
    ),
  );

  const localDelta = mouseJointEditor.dragCurrentParentLocal
    .clone()
    .sub(mouseJointEditor.dragStartParentLocal);
  const desiredLocal = mouseJointEditor.dragStartLocal.clone().add(localDelta);
  const base = joint.userData.baseBindLocalPosition;
  const offset = getJointPointOffset(mouseJointEditor.selectedJointKey);

  offset.x = THREE.MathUtils.clamp(
    desiredLocal.x - base.x,
    JOINT_POINT_OFFSET_RANGE.min,
    JOINT_POINT_OFFSET_RANGE.max,
  );
  offset.y = THREE.MathUtils.clamp(
    desiredLocal.y - base.y,
    JOINT_POINT_OFFSET_RANGE.min,
    JOINT_POINT_OFFSET_RANGE.max,
  );
  offset.z = THREE.MathUtils.clamp(
    desiredLocal.z - base.z,
    JOINT_POINT_OFFSET_RANGE.min,
    JOINT_POINT_OFFSET_RANGE.max,
  );

  applyJointPointOffsets();
  resetSkeletonToBindPose();
  syncSkeletonRoot();
  syncImportedSkinToPuppet();
  updateGuiDisplays();
}

function handleJointEditPointerUp(event) {
  if (!mouseJointEditor.dragging) {
    return;
  }

  mouseJointEditor.dragging = false;
  sceneContainer.releasePointerCapture?.(event.pointerId);
}

function handleWheelZoom(event) {
  event.preventDefault();

  /*
    Mouse wheels report pixel, line, or page deltas depending on the device.
    This normalizes the value enough that a wheel notch and a trackpad gesture
    both feel like camera dolly movement instead of a wild teleport.
  */
  const modeScale =
    event.deltaMode === 1 ? 0.08 : event.deltaMode === 2 ? 0.35 : 0.0035;
  const zoomAmount = event.deltaY * modeScale;

  controlState.cameraDistance = THREE.MathUtils.clamp(
    controlState.cameraDistance + zoomAmount,
    SOLO_TWEAKS.camera.minDistance,
    SOLO_TWEAKS.camera.wheelMaxDistance,
  );
}

//function handleKeyDown(event) {

function handleKeyUp(event) {
  // Key state is stored as a set so multiple keys can be held at the same time.
  controlState.keys.delete(event.code);
}

function handleKeyDown(event) {
  /*
    Handles one-shot key actions and records held movement keys.

    Held movement keys are consumed every frame by updateKeyboardMotion().
    One-shot toggles are handled here on keydown.

    Current bindings:
      R     = toggle skeleton lab
      L     = toggle joint labels
      Z     = toggle left arm high
      X     = toggle right arm high
      H     = toggle both hands half high
      Space = wave
      J     = jump
  */
  if (event.repeat) {
    return;
  }

  controlState.keys.add(event.code);

  if (event.code === "KeyR") {
    rigTuning.labEnabled = !rigTuning.labEnabled;
    updateGuiDisplays();
    applyVisibility();
  } else if (event.code === "KeyL") {
    rigTuning.showJointLabels = !rigTuning.showJointLabels;
    updateGuiDisplays();
    applyVisibility();
  } else if (event.code === "KeyZ") {
    controlState.leftArm = controlState.leftArm === "up" ? "down" : "up";
  } else if (event.code === "KeyX") {
    controlState.rightArm = controlState.rightArm === "up" ? "down" : "up";
  } else if (event.code === "KeyH") {
    const bothHalf =
      controlState.leftArm === "half" && controlState.rightArm === "half";

    controlState.leftArm = bothHalf ? "down" : "half";
    controlState.rightArm = bothHalf ? "down" : "half";
  } else if (event.code === "Space") {
    controlState.waveUntil = performance.now() + 1200;
    controlState.wasWaving = true;
  } else if (event.code === "KeyJ") {
    startJump();
  }
}

function resizeRendererToContainer() {
  // Keeps camera projection and renderer size matched to the browser viewport.
  const width = sceneContainer.clientWidth || window.innerWidth;
  const height = sceneContainer.clientHeight || window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height, false);
}
console.info(
  `Empyrean ${APP_VERSION} running on Three.js ${THREE_VERSION_PIN}.`,
);
console.info(
  "This is a development build. Expect bugs and incomplete features! Report issues on GitHub.",
);

// buildRoom() is the old single-room helper. The active world is now created
// near the top of the file with buildExplorationWorld().
//buildRoom();
buildLighting();
buildSkeletonWorkshop();
buildGui();
resizeRendererToContainer();

window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("resize", resizeRendererToContainer);
sceneContainer.addEventListener("wheel", handleWheelZoom, { passive: false });
sceneContainer.addEventListener("pointerdown", handleJointEditPointerDown);
sceneContainer.addEventListener("pointermove", handleJointEditPointerMove);
sceneContainer.addEventListener("pointerup", handleJointEditPointerUp);
sceneContainer.addEventListener("pointercancel", handleJointEditPointerUp);

requestAnimationFrame(animate);
