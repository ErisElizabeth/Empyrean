import * as THREE from "three";
import GUI from "lil-gui";
import { ENCOUNTER_DEFINITIONS } from "./encounters.js";
// Combat encounter prototype: wires /empyrean_dice (d20 roll) and the
// /enemyAI tiered-decision idea into the existing /Empyrean world.
import { initCombatEncounter, updateCombatEncounter } from "./combat_updated.js";
import {
  clamp01 as physicsClamp01,
  cycle01 as physicsCycle01,
  getJumpGravityValue,
  getJumpLaunchVelocityValue,
  getJumpPoseWeightValues,
  getLegStrideValues as getPhysicsLegStrideValues,
  getPelvisWalkValues as getPhysicsPelvisWalkValues,
  smoothstep as physicsSmoothstep,
  updateJumpState,
} from "./physics.js";
import {
  DEFAULT_RIG_DIMENSIONS,
  DEFAULT_RIG_HEIGHT,
  RIG_DIMENSION_CONTROLS,
  getRigStats,
} from "./rig.js";
import {
  GUIDE_COLOR,
  buildExplorationWorld,
  buildGhostSpheres,
  buildLighting,
  createEncounterRuntime,
  createWorldDebugView,
  disposeObjectTree,
  getEncounterCenter,
  getEncounterRect,
  isControlPositionValid,
  makeLabelSprite,
  moveRigWithCollision,
  resolveRigRoomCollision,
  tickEncounterSystem,
  updateGhostSphereMotion,
  worldCollision,
} from "./world.js";
import {
  DEFAULT_IMPORTED_MESH_PATH,
  applyImportedMeshPresentation,
  clearImportedMesh,
  disposeImportedPreview,
  disposeImportedSkin,
  getActiveMeshPath,
  initSkin,
  loadDefaultImportedMesh,
  loadImportedMeshFromPath,
  loadImportedMeshPreviewFromPath,
  refreshImportedMeshReference,
  rerigImportedMesh,
  renderDefaultImportedMesh,
  rigCurrentImportedMesh,
  syncImportedSkinToPuppet,
} from "./skin.js";

const APP_VERSION = "0.1.21-alpha";
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

// Extra padding around the visible collider so the rig does not rub wall faces.
const rigCollisionMargin = SOLO_TWEAKS.player.collisionMargin;

const sceneContainer = document.getElementById("scene-container");
const STORAGE_KEY = "empyrean.puppetWorkshop.rigTuning.v1";
const WALL_COLOR = "#131111";

// Slider ranges. These are intentionally broad because the rig lab should be
// able to accommodate strange proportions, not only "normal" humanoids.
const ROOT_ALIGNMENT_RANGE = { min: -6, max: 6, step: 0.005 };
const JOINT_POINT_OFFSET_RANGE = { min: -4, max: 4, step: 0.005 };
const BIND_ROTATION_RANGE = { min: -Math.PI, max: Math.PI, step: 0.005 };
const AXIS_MARKER_SCALE_RANGE = { min: 0.03, max: 3, step: 0.01 };

const rigStats = getRigStats(DEFAULT_RIG_DIMENSIONS);

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
  "walkHipSway",
  "walkHipBob",
  "walkHipTilt",
  "walkHipTwist",
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
const explorationWorld = buildExplorationWorld();
scene.add(explorationWorld.group);
const ghostSpheres = buildGhostSpheres();
ghostSpheres.forEach((sphere) => scene.add(sphere.group));

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

const rigHeightDisk = buildRigHeightDisk();
scene.add(rigHeightDisk);

// ======================================================
// WORLD / ROOM / OUTSIDE HELPERS
// ======================================================

function buildRigHeightDisk() {
  /*
    Creates a 5% opacity wireframe disk at the current program rig height.

    Purpose:
      A visual "height gauge" for the default body proportions.

    Current source:
      rig.js exports DEFAULT_RIG_HEIGHT and getRigStats().

    Disk placement:
      Y = DEFAULT_RIG_DIMENSIONS.headY

    Geometry note:
      CircleGeometry is born in the XY plane. Rotating it around X by PI / 2
      lays it flat in the XZ plane, like a horizontal inspection gauge.
  */
  const geometry = new THREE.CircleGeometry(2.2, 64);
  const material = new THREE.MeshBasicMaterial({
    color: GUIDE_COLOR,
    wireframe: true,
    transparent: true,
    opacity: 0.05,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const disk = new THREE.Mesh(geometry, material);

  disk.name = "default-rig-height-wire-disk";
  disk.position.set(0, DEFAULT_RIG_DIMENSIONS.headY, 0);
  disk.rotation.x = Math.PI / 2;
  disk.renderOrder = 8;
  return disk;
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
  /*
    meshBlobUrl holds the object URL created when a user browses for a local
    file using the "open fileâ€¦" button. It is separate from
    rigTuning.importedMeshPath because:
      - The blob URL is a session-only memory reference. It cannot be saved or
        shared, and it must be revoked when a new file replaces it.
      - importedMeshPath shows the human-readable filename or asset path.
    getActiveMeshPath() combines both: blob URL takes priority, typed path is
    the fallback, and DEFAULT_IMPORTED_MESH_PATH is the last resort.
  */
  meshBlobUrl: null,
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
state.worldDebugView = createWorldDebugView(
  state.encounterRuntime,
  rigTuning.colliderRadius + rigCollisionMargin,
);
scene.add(state.worldDebugView.group);
applyWorldDebugVisibility();

/*
  COMBAT ENCOUNTER INIT
    - Adds the 25% opacity trigger cylinder to the scene.
    - Preloads battle.mp3 (kept silent until the player walks into the trigger).
    - The enemy.glb itself is loaded lazily on first trigger fire so page load
      stays fast for non-combat sessions.
  All future combat updates happen via updateCombatEncounter() inside animate().
*/
initCombatEncounter({
  scene,
  controlState,
  rigTuning,
  backgroundAudio: myAudio,
});

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
    walkHipSway: 0.075,
    walkHipBob: 0.026,
    walkHipTilt: 0.055,
    walkHipTwist: 0.045,
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
  state.walkArmSwing = { left: 0, right: 0 };
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
    joints along with it automatically via Three.js's scene-graph parenting.

    WHY THREE.Group, NOT THREE.Bone?
      Three.js Bones are built for SkinnedMesh and come with extra constraints.
      Using plain Groups here keeps the puppet joints simple and inspectable â€”
      you can attach debug markers, labels, and bone lines to them without
      fighting the bone system. The actual Three.js Bone objects used for mesh
      skinning are created separately and just copy their transforms from these
      puppet joints every frame.

    THE PARENT-CHILD RELATIONSHIP IN THREE.JS:
      When you call parent.add(child), the child's .position, .rotation, and
      .scale are interpreted in the PARENT'S local space. If the parent moves
      or rotates, the child moves and rotates with it automatically. This is
      the scene graph. It is why:
        - Rotating the chest carries the neck, head, and both arms.
        - Moving the pelvis carries both legs.
        - Moving the body joint carries everything.

      You never need to manually update child positions when a parent moves â€”
      Three.js handles that through the matrix hierarchy.

    userData FIELDS (the rig's "ground truth" for every joint's rest pose):

      baseBindLocalPosition:
        The joint's ORIGINAL position from createSkeleton(). Never changes after
        creation. This is the zero-reference for slider offsets.

      bindLocalPosition:
        base + offset. What the joint's position should be when at rest.
        Updated by applyJointPointOffsets() whenever a slider or drag changes an
        offset. resetSkeletonToBindPose() copies this back to joint.position.

      baseBindLocalQuaternion:
        The joint's ORIGINAL rotation from createSkeleton(). All joints start
        at identity (no rotation), so this is typically (0,0,0,1).

      bindLocalQuaternion:
        base rotation multiplied by any bind-pose rotation offsets. Updated by
        applyBindRotationOffsets(). Animation functions then add motion ON TOP of
        this rotation, so the aligned rest pose is always the neutral reference.

      bindLocalEuler:
        The Euler-angle version of the bind rotation offset. Stored separately
        because dampJointRotation() adds animation deltas in Euler space.

      bindLocalScale:
        Neutral scale (1,1,1). Kept in userData so resetSkeletonToBindPose()
        can restore it without hard-coding the value.
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
  controlState.position.copy(
    resolveRigRoomCollision(controlState.position, {
      radius: rigTuning.colliderRadius + rigCollisionMargin,
      rootOffsetX: rigTuning.rootOffsetX,
      rootOffsetZ: rigTuning.rootOffsetZ,
    }),
  );
  rebuildWorldDebugView();
  applyVisibility();
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
    const headRadius = markerRadius * 3.2;
    const headLength = markerRadius * 4.8;

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
      /*
        Re-syncs every visible debug bone line to the live child joint position.

        Important detail:
          The marker sphere is a child of the joint, so it follows automatically.
          The bone guide line is different: it is a BufferGeometry attached to
          the parent joint, and its second vertex stores a COPY of child.position.

        Formula:
          line vertex 0 = parent local origin = (0, 0, 0)
          line vertex 1 = child local position = child.position

        That means any system that changes joint.position after the line is
        created must call refreshBones(). Pivot sliders call it immediately.
        The live walk cycle must also call it every frame, because knee/ankle/
        foot positions are animated for readability. Without this, the marker
        moves correctly but the line endpoint appears to detach and dance near
        the joint.
      */
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
  state.worldDebugView = createWorldDebugView(
    state.encounterRuntime,
    rigTuning.colliderRadius + rigCollisionMargin,
  );
  scene.add(state.worldDebugView.group);
  applyWorldDebugVisibility();
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
                              â€” never changes after creation
      offset                = the value from the Joint Point Offset sliders
                              (or from a mouse drag, which writes the same value)

    After this function runs:
      - bindLocalPosition is the "desired rest position" for the joint
      - joint.position is set to that value immediately so the skeleton visually
        updates as soon as a slider or drag changes an offset

    WHY offset-from-base instead of storing an absolute position?
      An absolute position would make export/import fragile â€” if the base
      skeleton proportions change, a saved position that was once correct would
      place the joint in the wrong spot. Storing the offset relative to the
      base means:
        - Zero offset = the original proportion from createSkeleton()
        - Reset = just zero all offsets, nothing else needs to change
        - Export = a small portable delta that survives proportion changes

    NOTE: After this function changes joint.position, matrixWorld is NOT updated
    automatically. If you need worldToLocal() or getWorldPosition() to reflect
    these changes immediately (e.g., during a drag event), call:
      state.skeleton.root.updateMatrixWorld(true)
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

  console.info(
    "Rig Mesh Mode: custom start pose is reserved for a future pass.",
  );
}

function resetSkeletonToBindPose() {
  /*
    Resets every puppet joint to its current bind pose.

    "Bind pose" here means the stored rest values in userData:
      bindLocalPosition   â€” base position + slider offsets
      bindLocalQuaternion â€” base rotation + bind-pose rotation sliders
      bindLocalScale      â€” always (1,1,1) unless deliberately changed

    WHAT THIS DOES NOT DO:
      It does NOT erase slider offsets or bind rotations. Those live in
      rigTuning and userData. This function only copies the already-computed
      bind values back into the live joint transform so the skeleton "stands
      at rest."

    WHEN IT IS CALLED:
      - After applyJointPointOffsets() â€” so the new pivot positions take effect
      - After applyBindRotationOffsets() â€” so the new rest pose takes effect
      - In handleJointEditPointerMove â€” at the end of every drag step to
        establish a clean base that the next animation frame can layer motion on

    Animation functions (walk, idle, jump) then run AFTER this reset and add
    their motion deltas on top of the bind pose. The reset ensures the previous
    frame's animation does not accumulate into the next one.

    NOTE: As with applyJointPointOffsets(), changing joint.position here does
    NOT update matrixWorld. Call updateMatrixWorld(true) on the root if you
    need world-space accuracy immediately after this call.
  */
  Object.values(state.skeleton.joints).forEach((joint) => {
    joint.position.copy(joint.userData.bindLocalPosition);
    joint.quaternion.copy(joint.userData.bindLocalQuaternion);
    joint.scale.copy(joint.userData.bindLocalScale);
  });
}

function buildGui() {
  /*
    GUI panel structure (top to bottom):

      Mesh              â€” file browser, workflow steps, appearance, transform
      Rig Dimensions    â€” body proportions (sliders)
      Pivot Offsets     â€” per-joint XYZ position nudges
      Bind Pose         â€” per-joint rest-pose rotations for mesh alignment
      Motion            â€” idle, walk, jump, damping, presets
      Skeleton Lab      â€” debug markers, labels, collider ring
      Workshop          â€” root alignment, mouse point editing, axis marker
      Save              â€” browser save/load and JSON export
      World Debug       â€” collision and encounter zone overlays

    All folders except Mesh start closed so the panel is not overwhelming on
    first open. Click a folder header to expand it.
  */
  state.gui = new GUI({ title: "Empyrean Puppet Workshop" });
  state.guiFolders = {};

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // MESH
  // Everything you need to load, align, and rig a character mesh in one place.
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const meshFolder = state.gui.addFolder("Mesh");
  state.guiFolders.mesh = meshFolder;

  /*
    FILE BROWSER BUTTON
    Opens the operating system's native file picker filtered to .glb and .gltf.
    Selecting a file:
      1. Creates a temporary blob URL (session-only â€” not saved with the rig).
      2. Stores the filename in the "path" field for reference.
      3. Automatically loads a static preview so you can see the mesh right away.

    You can also type a relative path directly in the "path" field below
    (e.g. assets/femaleMesh.glb) if the file is already in the project folder.
  */
  meshFolder
    .add(
      {
        openFile() {
          const input = document.createElement("input");
          input.type = "file";
          input.accept = ".glb,.gltf";
          // Keep the element invisible but in the DOM long enough for the
          // browser to recognise the user gesture and open the file picker.
          input.style.cssText =
            "position:fixed;opacity:0;pointer-events:none;width:0;height:0";
          document.body.appendChild(input);
          input.addEventListener("change", () => {
            document.body.removeChild(input);
            const file = input.files[0];
            if (!file) return;
            // Release the previous blob before creating a new one so the
            // browser can free the previous file's memory.
            if (state.meshBlobUrl) URL.revokeObjectURL(state.meshBlobUrl);
            state.meshBlobUrl = URL.createObjectURL(file);
            rigTuning.importedMeshPath = file.name;
            updateGuiDisplays();
            // Auto-preview on pick so you see the mesh immediately.
            loadImportedMeshPreviewFromPath(state.meshBlobUrl);
          });
          input.click();
        },
      },
      "openFile",
    )
    .name("open fileâ€¦");

  /*
    PATH FIELD â€” fallback for typing a relative path like "assets/femaleMesh.glb"
    or for re-loading a path that was exported with the rig package.
    When the file browser is used, this shows the chosen filename.
  */
  addGuiController(meshFolder, rigTuning, "importedMeshPath").name("path");

  // â”€â”€ WORKFLOW â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  /*
    Standard two-step workflow:
      1 Â· preview  â€” loads the mesh as a static visual reference.
                     Drag skeleton pivots to match it without skinning yet.
      2 Â· rig      â€” generates skin weights from the current pivot positions
                     and drives the mesh from the skeleton.

    quick rig skips preview and rigs immediately. Useful when pivots are already
    tuned and you just want to test the motion on the mesh.
  */
  addGuiController(meshFolder, rigTuning, "rigMeshStartPose", {
    "keep current pose": "current",
    "A pose": "aPose",
    "T pose": "tPose",
  }).name("start pose");
  meshFolder
    .add({ fn: applyRigMeshStartPose }, "fn")
    .name("apply start pose");
  meshFolder.add({ fn: renderDefaultImportedMesh }, "fn").name("1  preview");
  meshFolder.add({ fn: rigCurrentImportedMesh }, "fn").name("2  rig mesh");
  meshFolder.add({ fn: loadDefaultImportedMesh }, "fn").name("quick rig");
  meshFolder.add({ fn: rerigImportedMesh }, "fn").name("re-rig");
  meshFolder.add({ fn: clearImportedMesh }, "fn").name("clear mesh");

  // â”€â”€ APPEARANCE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Controls how the mesh looks while you are placing pivots.
  const appearanceFolder = meshFolder.addFolder("Appearance");
  addGuiController(appearanceFolder, rigTuning, "importedMeshVisible")
    .name("visible")
    .onChange(applyImportedMeshPresentation);
  addGuiController(
    appearanceFolder,
    rigTuning,
    "importedMeshOpacity",
    0.05,
    1,
    0.01,
  )
    .name("opacity")
    .onChange(applyImportedMeshPresentation);
  addGuiController(appearanceFolder, rigTuning, "importedMeshWireframe")
    .name("wireframe")
    .onChange(applyImportedMeshPresentation);
  appearanceFolder.close();

  // â”€â”€ TRANSFORM â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Fine-tune the mesh position, scale, and orientation relative to the skeleton.
  const transformFolder = meshFolder.addFolder("Transform");
  addGuiController(transformFolder, rigTuning, "importedMeshAutoFit")
    .name("auto fit")
    .onChange(refreshImportedMeshReference);
  addGuiController(
    transformFolder,
    rigTuning,
    "importedMeshScale",
    0.05,
    4,
    0.01,
  )
    .name("scale")
    .onFinishChange(refreshImportedMeshReference);
  addGuiController(transformFolder, rigTuning, "importedMeshOffsetX", -4, 4, 0.01)
    .name("offset X")
    .onFinishChange(refreshImportedMeshReference);
  addGuiController(transformFolder, rigTuning, "importedMeshOffsetY", -4, 4, 0.01)
    .name("offset Y")
    .onFinishChange(refreshImportedMeshReference);
  addGuiController(transformFolder, rigTuning, "importedMeshOffsetZ", -4, 4, 0.01)
    .name("offset Z")
    .onFinishChange(refreshImportedMeshReference);
  addGuiController(
    transformFolder,
    rigTuning,
    "importedMeshRotationX",
    -Math.PI,
    Math.PI,
    0.01,
  )
    .name("rot X")
    .onFinishChange(refreshImportedMeshReference);
  addGuiController(
    transformFolder,
    rigTuning,
    "importedMeshRotationY",
    -Math.PI,
    Math.PI,
    0.01,
  )
    .name("rot Y")
    .onFinishChange(refreshImportedMeshReference);
  addGuiController(
    transformFolder,
    rigTuning,
    "importedMeshRotationZ",
    -Math.PI,
    Math.PI,
    0.01,
  )
    .name("rot Z")
    .onFinishChange(refreshImportedMeshReference);
  transformFolder.close();

  // â”€â”€ RIG PACKAGE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // Export/import both rig tuning and mesh binding settings as a JSON bundle.
  meshFolder
    .add({ fn: exportRigPackageToConsole }, "fn")
    .name("export rig package");
  meshFolder
    .add({ fn: importRigPackageFromPrompt }, "fn")
    .name("import rig package");

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // RIG DIMENSIONS
  // Changes here rebuild the skeleton hierarchy from scratch. Drag slowly â€”
  // each slider fires rebuildSkeletonWorkshop on release.
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const dimensionFolder = state.gui.addFolder("Rig Dimensions");
  state.guiFolders.dimensions = dimensionFolder;
  RIG_DIMENSION_CONTROLS.forEach(([key, min, max, step]) => {
    addGuiController(dimensionFolder, rigTuning, key, min, max, step)
      .name(key)
      .onFinishChange(rebuildSkeletonWorkshop);
  });
  dimensionFolder.close();

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // PIVOT OFFSETS  +  BIND POSE
  // buildJointPointControls and buildBindRotationControls each create their own
  // top-level folder. The "reset bind pose" button lives in the Bind Pose folder
  // instead of a separate one-button folder.
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  state.guiFolders.jointPointControls = buildJointPointControls(state.gui);
  state.guiFolders.bindRotationControls = buildBindRotationControls(state.gui);
  state.guiFolders.bindRotationControls
    .add({ fn: resetSkeletonToBindPose }, "fn")
    .name("reset bind pose");

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // MOTION
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
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
  addGuiController(motionFolder, rigTuning, "breathingAmplitude", 0, 0.09, 0.001).name(
    "breathing",
  );
  addGuiController(motionFolder, rigTuning, "headDriftAmplitude", 0, 0.28, 0.001).name(
    "head drift",
  );
  addGuiController(motionFolder, rigTuning, "torsoSwayAmplitude", 0, 0.16, 0.001).name(
    "torso sway",
  );
  addGuiController(motionFolder, rigTuning, "armTrailAmplitude", 0, 0.36, 0.001).name(
    "arm trail",
  );
  addGuiController(motionFolder, rigTuning, "damping", 1.2, 10, 0.01).name("damping");
  addGuiController(motionFolder, rigTuning, "walkAmplitude", 0, 1.4, 0.01).name(
    "walk amplitude",
  );
  addGuiController(
    motionFolder,
    rigTuning,
    "walkHipSway",
    -0.18,
    0.18,
    0.001,
  ).name("hip sway");
  addGuiController(motionFolder, rigTuning, "walkHipBob", 0, 0.09, 0.001).name(
    "hip bob",
  );
  addGuiController(
    motionFolder,
    rigTuning,
    "walkHipTilt",
    -0.16,
    0.16,
    0.001,
  ).name("hip tilt");
  addGuiController(
    motionFolder,
    rigTuning,
    "walkHipTwist",
    -0.16,
    0.16,
    0.001,
  ).name("hip twist");
  addGuiController(motionFolder, rigTuning, "jumpHeight", 0.05, 2.5, 0.01).name(
    "jump height",
  );
  addGuiController(motionFolder, rigTuning, "jumpDuration", 0.28, 1.8, 0.01).name(
    "jump duration",
  );
  addGuiController(motionFolder, rigTuning, "jumpGravityScale", 0.35, 2.4, 0.01).name(
    "gravity feel",
  );
  addGuiController(motionFolder, rigTuning, "jumpCrouchDepth", 0, 0.45, 0.005).name(
    "jump crouch",
  );
  addGuiController(motionFolder, rigTuning, "colliderRadius", 0.08, 1.4, 0.01)
    .name("collider radius")
    .onChange(updateRigColliderVisual);
  motionFolder.add({ fn: startJump }, "fn").name("test jump");
  addGuiController(motionFolder, rigTuning, "phaseOffset", -Math.PI, Math.PI, 0.01).name(
    "phase offset",
  );
  motionFolder.close();

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // SKELETON LAB
  // Toggle debug helpers: joint pivot spheres, bone lines, labels, collider ring.
  // R key also toggles the lab. L key toggles joint labels.
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const labFolder = state.gui.addFolder("Skeleton Lab");
  state.guiFolders.visibility = labFolder;
  addGuiController(labFolder, rigTuning, "labEnabled")
    .name("lab on / off")
    .onChange(applyVisibility);
  addGuiController(labFolder, rigTuning, "skeletonVisible")
    .name("show pivots")
    .onChange(applyVisibility);
  addGuiController(labFolder, rigTuning, "showJointLabels")
    .name("joint labels")
    .onChange(applyVisibility);
  addGuiController(labFolder, rigTuning, "showAxisMarker")
    .name("axis marker")
    .onChange(applyVisibility);
  addGuiController(labFolder, rigTuning, "showRigCollider")
    .name("rig collider")
    .onChange(applyVisibility);
  labFolder.close();

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // WORKSHOP
  // Root alignment offsets, mouse-drag joint editing, label and axis controls.
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const alignmentFolder = state.gui.addFolder("Workshop");
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
  addGuiController(alignmentFolder, rigTuning, "axisMarkerJoint", AXIS_MARKER_JOINTS)
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
  addGuiController(alignmentFolder, rigTuning, "mouseJointEditJoint", MOUSE_EDIT_JOINTS)
    .name("selected point")
    .onChange(selectMouseJointEditJoint);
  alignmentFolder.close();

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // SAVE
  // Browser save/load and JSON export. Tuning is auto-loaded on page refresh.
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const saveFolder = state.gui.addFolder("Save");
  state.guiFolders.save = saveFolder;
  saveFolder.add({ fn: saveRigTuningToBrowser }, "fn").name("save tuning");
  saveFolder.add({ fn: loadRigTuningFromBrowser }, "fn").name("load saved");
  saveFolder.add({ fn: resetRigTuningToDefaults }, "fn").name("reset defaults");
  saveFolder.add({ fn: exportRigTuningToConsole }, "fn").name("copy / log JSON");
  saveFolder.add({ fn: clearSavedRigTuning }, "fn").name("clear saved");
  saveFolder.close();

  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // WORLD DEBUG
  // Draws invisible collision shapes and encounter zones so you can see where
  // things are without guessing. Does not affect gameplay or physics.
  // â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const worldDebugFolder = state.gui.addFolder("World Debug");
  state.guiFolders.worldDebug = worldDebugFolder;
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
  if (rigTuning.encounterSystemEnabled && state.encounterRuntime) {
    tickEncounterSystem(
      state.encounterRuntime,
      new THREE.Vector2(
        controlState.position.x + rigTuning.rootOffsetX,
        controlState.position.z + rigTuning.rootOffsetZ,
      ),
      state.worldDebugView,
      { audio: myAudio, jupiter, defaultJupiterColor: SOLO_TWEAKS.jupiter.color },
    );
  }
  // Combat encounter tick: state machine handles trigger/start/roll/contact/end.
  // It is a no-op while phase === "idle" and nothing is in the trigger.
  updateCombatEncounter(delta);

  updateJumpPhysics(delta);
  updateSkeleton(delta, elapsed, currentTime);
  syncImportedSkinToPuppet();
  updateGhostSphereMotion(ghostSpheres, elapsed);
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
  controlState.cameraYaw +=
    orbitInput * delta * SOLO_TWEAKS.camera.keyboardOrbitSpeed;
  controlState.cameraDistance = THREE.MathUtils.clamp(
    controlState.cameraDistance +
      zoomInput * delta * SOLO_TWEAKS.camera.keyboardZoomSpeed,
    SOLO_TWEAKS.camera.minDistance,
    SOLO_TWEAKS.camera.maxDistance,
  );
  controlState.cameraHeight = THREE.MathUtils.clamp(
    controlState.cameraHeight +
      heightInput * delta * SOLO_TWEAKS.camera.keyboardHeightSpeed,
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
    controlState.position.copy(
      moveRigWithCollision(
        controlState.position,
        direction,
        moveInput * delta * SOLO_TWEAKS.player.moveSpeed,
        {
          radius: rigTuning.colliderRadius + rigCollisionMargin,
          rootOffsetX: rigTuning.rootOffsetX,
          rootOffsetZ: rigTuning.rootOffsetZ,
        },
      ),
    );
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
    });
  } else {
    relaxLegs(delta);
  }

  updateControlledArms(delta, currentTime);
  updateJumpPose(delta);

  /*
    The debug skeleton needs one final visual sync after all animation layers.

    Joint markers are normal children of their joints, so Three.js moves them
    automatically. Bone guide lines are custom BufferGeometry segments whose
    end vertex stores a copied child.position. Since the walk cycle animates
    knee/ankle/foot positions every frame, the copied vertex must be refreshed
    here or the femur/shin/foot lines will visually detach from their markers.
  */
  state.debugView?.refreshBones?.();
}

function syncSkeletonRoot() {
  /*
    Converts player control position into actual skeleton root position.

    rootOffsetX/Y/Z are workshop alignment offsets. jump.offsetY is added on top
    of rootOffsetY so jumping does not permanently change the saved alignment.
  */
  controlState.position.copy(
    resolveRigRoomCollision(controlState.position, {
      radius: rigTuning.colliderRadius + rigCollisionMargin,
      rootOffsetX: rigTuning.rootOffsetX,
      rootOffsetZ: rigTuning.rootOffsetZ,
    }),
  );
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

function startJump() {
  /*
    Begins a jump only if grounded.

    This only kicks off the "crouch" phase. The actual transition from crouch
    to air (and setting the launch velocity) is handled automatically by
    updateJumpState() in physics.js once jump.elapsed >= jump.crouchDuration.

    The crouch phase gives the pose time to compress before physics launches
    the root upward. Without it, the jump starts too abruptly.

    There used to be a separate launchJump() function here that manually set
    phase = "air" and velocityY. It became dead code once updateJumpState()
    took over the full state machine and was removed to reduce clutter.
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

function updateJumpPhysics(delta) {
  updateJumpState(controlState.jump, rigTuning, delta);
}

function getJumpPoseWeights() {
  return getJumpPoseWeightValues(controlState.jump);
}

function getLegStrideValues(phase) {
  return getPhysicsLegStrideValues(phase);
}

function getPelvisWalkValues(phase, options) {
  return getPhysicsPelvisWalkValues(phase, options);
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
  const pelvisWalk = getPelvisWalkValues(phase, {
    amplitude,
    swayAmount: rigTuning.walkHipSway,
    bobAmount: rigTuning.walkHipBob,
    tiltAmount: rigTuning.walkHipTilt,
    twistAmount: rigTuning.walkHipTwist,
  });

  /*
    pelvisWalk.bobY is built from abs(sin(phase * 2)), so it rises twice per
    left+right cycle. That matches footfalls: left plant, right plant.
  */
  const bodyBob = pelvisWalk.bobY * 0.65;
  const chestCounterSway =
    -pelvisWalk.tiltZ * 0.62 + Math.sin(phase * 2 - 0.55) * 0.012 * amplitude;
  const headStabilizer =
    pelvisWalk.twistY * 0.45 + Math.sin(phase * 2 - 1.1) * 0.01 * amplitude;
  /*
    PELVIS CARRIER MOTION:
      The hip sockets are children of the pelvis, so the clean way to make the
      walk show weight transfer is to move/rotate the pelvis itself.

      getPelvisWalkValues() returns:
        swayX  = side-to-side hip travel over the planted foot
        bobY   = vertical rise once per footfall
        tiltZ  = side lean around the forward axis
        twistY = waist twist around the vertical axis

      This is intentionally applied to joints.pelvis, not leftHip/rightHip.
      Moving the individual hip sockets would tug the femur endpoints around
      independently. Moving the pelvis carries both hip sockets together, which
      is closer to a real body and keeps the joint hierarchy honest.
  */
  const headCounterY = -bodyBob * 0.35;
  dampJointPositionFromBind(
    joints.body,
    {
      x: 0,
      y: bodyBob,
      z: 0,
    },
    delta,
    rigTuning.damping * 0.95,
  );
  dampJointRotation(
    joints.pelvis,
    new THREE.Euler(0, pelvisWalk.twistY, pelvisWalk.tiltZ),
    delta,
  );
  dampJointRotation(
    joints.chest,
    new THREE.Euler(
      0.02 * amplitude,
      -pelvisWalk.twistY * 0.65,
      chestCounterSway,
    ),
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
      x: pelvisWalk.swayX,
      y: pelvisWalk.bobY,
      z: 0,
    },
    delta,
    rigTuning.damping * 0.8,
  );

  dampJointPositionFromBind(
    joints.head,
    {
      x: -pelvisWalk.swayX * 0.25,
      y: headCounterY,
      z: 0,
    },
    delta,
    rigTuning.damping * 0.55,
  );
  /*
    ARM COUNTER-SWING:
      In a natural bipedal walk, each arm swings in the OPPOSITE direction to
      the leg on the same side. When the left leg steps forward, the left arm
      swings backward (and vice versa). This prevents the walk from looking like
      a march where both limbs on a side move together.

      The swing direction is simply negated:
        left arm target  = -leftSwing  (backward when left leg is forward)
        right arm target = -rightSwing

      The actual swing rotation is applied inside updateControlledArm() when the
      arm is in the default "down" pose. We store it here so the arm controller
      can read it without needing to know anything about the walk phase or
      amplitude.

      Amplitude is multiplied in here so the arm swing scales with walkAmplitude
      the same way leg swing does. The 0.22 factor is about 65% of the leg swing
      amplitude â€” arms swing somewhat less dramatically than legs in most gaits.
  */
  if (!state.walkArmSwing) {
    state.walkArmSwing = { left: 0, right: 0 };
  }

  state.walkArmSwing.left = -leftSwing * 0.22 * amplitude;
  state.walkArmSwing.right = -rightSwing * 0.22 * amplitude;

  updateLegWalk("left", -1, phase, delta, amplitude);
  updateLegWalk("right", 1, phase + Math.PI, delta, amplitude);
}

function updateLegWalk(sideName, side, phase, delta, amplitude) {
  /*
    Animates one leg.

    sideName = "left" or "right"
    side     = -1 for left, +1 for right
    phase    = phase offset for this leg

    This combines joint rotations with small joint-position offsets. The offsets
    are not physically perfect inverse kinematics, but they give readable foot
    lift, knee drift, toe push, and planted-foot behavior.
  */
  const stride = getLegStrideValues(phase);
  const joints = state.skeleton.joints;
  const hip = joints[`${sideName}Hip`];
  const knee = joints[`${sideName}Knee`];
  const ankle = joints[`${sideName}Ankle`];
  const foot = joints[`${sideName}Foot`];
  const kneeLift = stride.footLift;
  const toePush = stride.pushOff;
  const footPlant = stride.plant;

  /*
    Forward/back foot travel.

    The older pass used:
      footTravel = sin(phase) * 0.1

    That technically moved the leg, but the visible foot path felt boxed in:
    the foot had only a tiny forward/back slot, and the lift happened inside
    that slot. The new value comes from getLegStrideValues() in physics.js:

      footTravel = normalizedFootZ * strideLength * amplitude

    where:
      normalizedFootZ = -0.5..0.5
      strideLength    = 0.34 scene units
      amplitude       = the GUI walk amplitude slider

    This creates a clearer planted drift backward and a smoother lifted return
    forward, while leaving the arm counter-swing math alone.
  */
  const strideSwing = stride.strideSwing;
  const footTravel = stride.footZ * 0.34 * amplitude;

  // This makes the knee drift slightly outward during lift, which reads better
  // than perfectly straight hinge motion, especially on the wire skeleton.
  const readableKneeBend = side * kneeLift * 0.09 + strideSwing * 0.018;
  const readableAnkleBend = -side * kneeLift * 0.064 - strideSwing * 0.014;
  dampJointPositionFromBind(
    knee,
    {
      x: readableKneeBend,
      y: kneeLift * 0.075,
      z: footTravel * 0.62,
    },
    delta,
  );

  dampJointPositionFromBind(
    ankle,
    {
      x: readableAnkleBend,
      y: kneeLift * 0.11 - footPlant * 0.006,
      z: footTravel,
    },
    delta,
  );

  dampJointPositionFromBind(
    foot,
    {
      x: -readableAnkleBend * 0.5,
      y: kneeLift * 0.07 + toePush * 0.018 - footPlant * 0.004,
      z: footTravel * 1.08 + toePush * 0.055,
    },
    delta,
  );

  dampJointRotation(
    hip,
    new THREE.Euler(
      strideSwing * 0.32 * amplitude,
      side * 0.025 * amplitude,
      side * 0.06 * amplitude,
    ),
    delta,
  );

  dampJointRotation(
    knee,
    new THREE.Euler(
      0.04 + kneeLift * 0.52 + Math.max(0, -strideSwing) * 0.08 * amplitude,
      0,
      side * kneeLift * 0.07,
    ),
    delta,
  );

  dampJointRotation(
    ankle,
    new THREE.Euler(
      -strideSwing * 0.1 * amplitude + toePush * 0.3 - footPlant * 0.06,
      side * 0.015 * amplitude,
      0,
    ),
    delta,
  );

  dampJointRotation(
    foot,
    new THREE.Euler(
      toePush * 0.32 - footPlant * 0.09 - kneeLift * 0.02,
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

    We also clear walkArmSwing here so the arms ease back to idle trail
    instead of holding the last walk swing value indefinitely after stopping.
    The damp in updateControlledArm will smoothly interpolate from whatever
    swing was last set toward the now-zero target over the next few frames.
  */
  if (state.walkArmSwing) {
    state.walkArmSwing.left = 0;
    state.walkArmSwing.right = 0;
  }
  const joints = state.skeleton.joints;

  /*
    The walk cycle moves the body carrier and pelvis carrier, not only the legs.
    When walking stops, ease those local position offsets back to bind so the
    rig does not freeze with one hip still shifted over a planted foot.

    Rotations are left to idle motion when idle is enabled. The important thing
    here is to clear the position offsets introduced by walk bob/sway.
  */
  dampJointPositionFromBind(
    joints.body,
    { x: 0, y: 0, z: 0 },
    delta,
    rigTuning.damping * 0.9,
  );
  dampJointPositionFromBind(
    joints.pelvis,
    { x: 0, y: 0, z: 0 },
    delta,
    rigTuning.damping * 0.82,
  );
  dampJointPositionFromBind(
    joints.head,
    { x: 0, y: 0, z: 0 },
    delta,
    rigTuning.damping * 0.62,
  );

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

    THE SEPARATION BETWEEN ROOT AND POSE:
      Two things happen during a jump:

      1. ROOT MOVEMENT (in syncSkeletonRoot):
           root.position.y += jump.offsetY
         This lifts the entire skeleton â€” every joint â€” upward.
         It is driven by real physics: launch velocity, gravity, arc.

      2. POSE SHAPE (this function):
         Body, legs, and arms change shape to look like a jump.
         These are LOCAL position and rotation offsets within the skeleton.
         They do not move the root â€” they deform the pose around it.

    This function only handles the pose shape.

    THE BUG THAT WAS HERE:
      The original line was:
        joints.body.position.y -= crouchDrop;

      That uses -=, which SUBTRACTS from the current value every frame.
      On the first frame of the crouch phase, crouchDrop might be 0.009.
        body.y = 0 - 0.009 = -0.009
      Next frame, crouchDrop is 0.018.
        body.y = -0.009 - 0.018 = -0.027
      ... and so on. Each frame adds MORE negative offset.

      By the time the physics launched the root upward (adding jump.offsetY
      to the world position), the body joint had accumulated such a large
      downward offset in the root's local space that the two effects cancelled.
      The root rose; the body stayed near the floor. The debug sphere for the
      body-root joint appeared stuck at ground level.

    THE FIX:
      joints.body.position.y = joints.body.userData.bindLocalPosition.y - crouchDrop;

      This is a SET, not an accumulation. Each frame it computes:
        body.y = bind_y - current_crouchDrop
      where bind_y = 0 (the body joint's neutral local position).

      When crouchDrop is 0 (air phase), body.y = 0 = neutral. Root carries height.
      When crouchDrop ramps up (crouch/landing), body.y becomes negative cleanly.
      When the jump ends, crouchDrop reaches 0 and body.y returns to bind.
      No accumulation. No drift. No fighting the root physics.
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
    Set body Y to bind position offset by the current crouchDrop.
    During air phase, crouchDrop = 0, so body sits at its bind Y (neutral).
    During crouch and landing, crouchDrop > 0, pressing body downward within
    the root's local space to simulate compression.

    WHY bindLocalPosition.y INSTEAD OF JUST 0:
      If a slider or drag ever moves the body joint's pivot, bindLocalPosition.y
      would hold that offset. Using it here means the jump pose respects any
      customized body offset instead of hard-coding floor-level as the neutral.
  */
  joints.body.position.y =
    joints.body.userData.bindLocalPosition.y - crouchDrop;

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
      down = relaxed idle trail  (default while standing or walking)
      half = both hands half high
      up   = selected arm high
      wave = temporary waving pose with wrist/palm oscillation

    side mirrors the pose across the body:
      left  side = -1
      right side = +1

    ARM COUNTER-SWING DURING WALK:
      When the puppet is walking, updateWalkMotion() stores the current arm
      swing values in state.walkArmSwing.left and state.walkArmSwing.right.
      In the "down" pose (hanging at rest), we blend that swing into the
      shoulder's forward/back rotation (X axis). This gives a natural gait
      where each arm swings opposite to the leg on the same side.

      The swing only affects "down" pose â€” it would look wrong to counter-swing
      while the arm is raised (up/half/wave) since those poses already dominate
      the shoulder rotation with a deliberate override.

      When not walking, walkArmSwing values are zero (updateWalkMotion is not
      called), so the idle trail is unaffected.
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

  /*
    Read the current walk arm swing for this side.
    state.walkArmSwing is written each frame by updateWalkMotion() when
    the walk preview or active movement is running. It is zero otherwise.
  */
  const walkSwing = state.walkArmSwing?.[sideName] ?? 0;

  /*
    Default "down" pose: arm hangs with a slow independent trail oscillation.
    walkSwing is added to the shoulder X to create natural gait counter-swing.
    The trail's X contribution (trail * 0.12) still blends in â€” during walking,
    the trail amplitude is typically small so it only adds subtle variation on
    top of the gait swing.
  */
  let shoulderTarget = new THREE.Euler(
    trail * 0.12 + walkSwing,
    0,
    side * 0.16,
  );
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
  mouseJointEditor.pointer.y = -(
    ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2 -
    1
  );

  return mouseJointEditor.pointer;
}

function handleJointEditPointerDown(event) {
  /*
    Starts a joint-point drag.

    This function runs when the user presses the mouse button. Its job is to
    record the "start state" that handleJointEditPointerMove will use as a
    reference while the cursor moves.

    THREE CONDITIONS must all be true before a drag can start:
      1. mouseJointEditMode is on (the user toggled the mode in the GUI)
      2. The skeleton lab is visible (joints must be rendered to be clickable)
      3. There are selectable markers in the scene to hit-test against

    HOW THE DRAG PLANE WORKS:
      We do not use a full 3D transform gizmo (those are complex to implement and
      read). Instead, we create a flat invisible plane that:
        - faces the camera (its normal points toward the camera)
        - passes through the clicked joint's world position

      During pointermove, we shoot a ray from the camera through the cursor and
      intersect it with this plane. That intersection point is the new "desired
      world position" for the joint. Converting it to the parent's local space
      gives us the offset to store.

      The result feels like "sliding the joint along a wall facing you," which
      is intuitive even without a full gizmo.

    WHY WE CAPTURE THE POINTER:
      setPointerCapture() tells the browser to keep sending pointer events to this
      element even if the cursor leaves it. Without this, dragging fast outside
      the canvas would silently end the drag mid-gesture.

    REFERENCE POINTS RECORDED HERE:
      dragStartWorld        = joint's world position at click time
      dragStartLocal        = joint's bind-local position at click time (the slider values)
      dragStartParentLocal  = the click point in the PARENT's local space
                              (used in pointermove to calculate the delta correctly)

    NOTE: worldToLocal() here uses the current matrixWorld, which is fresh because
    the render loop just ran before the user clicked. See handleJointEditPointerMove
    for the explanation of why later events need an explicit updateMatrixWorld().
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

  /*
    Hit-test only the visible, editable joint markers. The `false` argument means
    do not recurse into children â€” each marker is a flat mesh and we only want
    the marker itself, not anything it might contain.
  */
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

  /*
    Record the joint's world position at click time. This becomes the coplanar
    point for the drag plane so the plane passes exactly through the joint.
  */
  joint.getWorldPosition(mouseJointEditor.dragStartWorld);

  /*
    Record the joint's current bind-local position (base + offset). This is
    the value we'll be adjusting during the drag.
  */
  mouseJointEditor.dragStartLocal.copy(joint.userData.bindLocalPosition);

  /*
    Build the camera-facing drag plane.

    getWorldDirection() returns a unit vector pointing OUT of the camera lens.
    Setting that as the plane's normal makes the plane face the camera.
    The coplanar point anchors the plane at the joint's world position so the
    intersection point stays at the same depth as the joint.
  */
  const cameraNormal = new THREE.Vector3();
  camera.getWorldDirection(cameraNormal).normalize();
  mouseJointEditor.dragPlane.setFromNormalAndCoplanarPoint(
    cameraNormal,
    mouseJointEditor.dragStartWorld,
  );

  /*
    Do an immediate first intersection to get the exact click point on the plane
    (not the marker surface â€” the plane is coplanar with the joint, but the
    marker is a sphere that protrudes from it, so they differ slightly).

    Converting this to parent-local space gives dragStartParentLocal â€” the
    reference origin for the delta calculation in pointermove.
  */
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
  /*
    THE BUG THAT WAS HERE â€” and why it broke parent-child relationships:

    Every joint in the skeleton is a THREE.Group. Three.js stores two separate
    transforms on every object:

      1. LOCAL matrix  â€” position/rotation/scale relative to the PARENT.
                         Updated immediately whenever you set .position or .quaternion.

      2. WORLD matrix  â€” the accumulated transform from the scene root all the way
                         down to this object. This is what converts a local point
                         into an actual position in 3D space.

    IMPORTANT: Three.js does NOT update the world matrix automatically every time
    you change a position. It only updates world matrices in two moments:
      a) renderer.render() â€” the render loop calls scene.updateMatrixWorld() at
                             the start of every frame.
      b) An explicit call to object.updateMatrixWorld(true).

    The drag handler calls these functions on every pointermove event:
      applyJointPointOffsets()  â€” changes joint.position for ALL joints
      resetSkeletonToBindPose() â€” also changes joint.position for ALL joints
      syncSkeletonRoot()        â€” moves the root joint to the player position

    After those calls, every joint's LOCAL transform is up to date.
    But their WORLD matrices are now STALE â€” they still reflect positions from
    before this event fired.

    Then the handler calls:
      joint.parent.worldToLocal(someWorldPoint)

    worldToLocal() inverts joint.parent.matrixWorld to map a world-space point into
    parent-local space. If matrixWorld is stale, this conversion is wrong â€” the
    parent's actual current position in the world is not accounted for. This is
    exactly what "parent-child relationships are not being followed" means: the
    parent has moved, but worldToLocal() doesn't know that yet.

    At normal speeds this is invisible because the render loop runs between events
    and refreshes all matrices. But at high mouse speeds, multiple pointermove
    events fire within the same animation frame â€” so the second event arrives before
    renderer.render() has had a chance to update matrixWorld.

    THE FIX:
    After applying position changes, explicitly call:
      state.skeleton.root.updateMatrixWorld(true)

    The argument `true` means "update this node AND all its children." This
    propagates fresh world matrices through the entire skeleton hierarchy so the
    next worldToLocal() call gets accurate results regardless of how many events
    have fired since the last render.
  */

  if (!mouseJointEditor.dragging || !mouseJointEditor.selectedJointKey) {
    return;
  }

  const joint = state.skeleton.joints[mouseJointEditor.selectedJointKey];

  if (!joint?.parent) {
    return;
  }

  event.preventDefault();
  mouseJointEditor.raycaster.setFromCamera(getScenePointer(event), camera);

  /*
    Intersect the mouse ray with the camera-facing drag plane.

    The drag plane was set up in handleJointEditPointerDown: it is a flat surface
    facing the camera, passing through the joint's world position at click time.
    Intersecting with it converts the current 2D mouse position into a 3D world
    position on that plane.
  */
  const hit = mouseJointEditor.raycaster.ray.intersectPlane(
    mouseJointEditor.dragPlane,
    mouseJointEditor.dragCurrentWorld,
  );

  if (!hit) {
    return;
  }

  /*
    Convert the new world hit point to the PARENT joint's local space.

    Why the parent's local space?
      Joint positions are stored relative to their parent (that's how Three.js
      scene graphs work). If we stored the joint's world position directly, moving
      or rotating a parent would silently break every child's stored position.

      By working in parent-local space, we store a position that is meaningful
      relative to the parent joint regardless of where the parent is in the world.

    WHY THIS CALL NEEDS A FRESH WORLD MATRIX:
      joint.parent.worldToLocal() internally inverts joint.parent.matrixWorld.
      If the skeleton's positions were just changed by applyJointPointOffsets() or
      syncSkeletonRoot() earlier this same event, matrixWorld is out of date.
      state.skeleton.root.updateMatrixWorld(true) at the end of this function
      ensures the NEXT call here has a fresh matrix.
  */
  joint.parent.worldToLocal(
    mouseJointEditor.dragCurrentParentLocal.copy(
      mouseJointEditor.dragCurrentWorld,
    ),
  );

  /*
    Calculate how far the cursor has moved from the drag start, in parent-local
    space. Adding that delta to the original bind position gives the desired new
    local position for this joint.

    Working with the delta (current - start) rather than the raw current position
    lets us anchor the drag to where the user clicked on the marker, not where the
    marker's origin is. Without this, the joint would jump to the cursor on the
    first move event.
  */
  const localDelta = mouseJointEditor.dragCurrentParentLocal
    .clone()
    .sub(mouseJointEditor.dragStartParentLocal);
  const desiredLocal = mouseJointEditor.dragStartLocal.clone().add(localDelta);

  /*
    Offsets are stored relative to the BASE bind position, not absolute local
    positions. This means:
      offset = desiredLocal - baseBindLocalPosition

    Keeping offsets separate from the base position makes it easy to reset to
    defaults (zero the offset) or export/import rig tuning snapshots.
  */
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

  /*
    THE FIX: refresh world matrices immediately after changing joint positions.

    applyJointPointOffsets(), resetSkeletonToBindPose(), and syncSkeletonRoot()
    have all just modified local transforms in the skeleton hierarchy. Those
    changes update each joint's LOCAL matrix immediately, but THREE.js does not
    cascade those changes into world matrices until renderer.render() runs.

    If another pointermove event arrives before the next render (common at high
    mouse speeds), joint.parent.worldToLocal() above will use the OLD matrixWorld
    and calculate the wrong parent-local position â€” making the joint drift or jump
    instead of tracking the cursor smoothly.

    updateMatrixWorld(true) walks the entire tree starting from the skeleton root
    and rebuilds every node's matrixWorld from its current local transform and
    its parent's matrixWorld. After this call, worldToLocal() on any joint in this
    skeleton will return correct results for the rest of this event cycle.
  */
  state.skeleton.root.updateMatrixWorld(true);

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

buildLighting(scene);
initSkin({ state, rigTuning, updateGuiDisplays });
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
