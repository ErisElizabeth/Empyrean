import * as THREE from "three";
import GUI from "lil-gui";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { ENCOUNTER_DEFINITIONS } from "./encounters.js";
// Combat encounter prototype: wires /empyrean_dice (d20 roll) and the
// /enemyAI tiered-decision idea into the existing /Empyrean world.
import {
  attemptCombatSwordHit,
  initCombatEncounter,
  setCombatDifficulty,
  setCombatRiggingVisibilitySuppressed,
  updateCombatEncounter,
} from "./combat_updated.js";
import {
  COMBAT_STANCE_NAMES,
  combineMassPoints,
  evaluateCombatBalance,
  getCombatStanceProfile,
} from "./combatPhysics.js";
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

const APP_VERSION = "0.1.40-alpha";
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

const SWORD_TWEAKS = {
  /*
    Right-hand sword prototype.

    The sword is a GLB authored outside this project, so its source units and
    axis orientation may not match Empyrean. The loader below measures the
    imported model's bounding box, scales its longest side to targetLength, and
    then attaches it to the rightPalm joint.

    Tuning workflow:
      1. Adjust targetLength if the sword feels too large/small.
      2. Adjust localPosition to move the handle relative to the palm.
      3. Adjust localRotation if the blade points the wrong way.

    localRotation values are radians:
      Math.PI * 0.5 = 90 degrees
      Math.PI       = 180 degrees
  */
  assetPath: "assets/plainSword.glb",
  targetLength: 1.02,
  /*
    gripFromLowerEnd is used by normalizeSwordModel().

    Formula:
      gripCoordinate = box.min[longAxis] + box.size[longAxis] * gripFromLowerEnd

    where:
      box.min[longAxis]       = low end of the sword along its longest axis
      box.size[longAxis]      = full length of the sword along that axis
      gripFromLowerEnd = 0.14 = put the hand origin 14% up from that low end

    Why:
      A sword held from its geometric center looks floaty. A sword held near the
      hilt behaves more like a real prop. If a future sword imports upside down,
      this one number is the first place to tune before changing arm animation.
  */
  gripFromLowerEnd: 0.14,
  localPosition: [0.025, -0.015, 0.025],
  localRotation: [-Math.PI * 0.5, 0, Math.PI * 0.04],
  swingDurationMs: 520,
  hitRange: 1.55,
  hitArcRadians: Math.PI * 0.78,
};

const DEV_PROBE_TWEAKS = {
  /*
    TEMP / DEV MODE coordinate probe.

    Purpose:
      Put one small movable marker near the rig, then read/copy exact numbers
      for attachment offsets, sword grips, hit arcs, and animation poses.

    Parenting choice:
      The probe is parented to state.skeleton.root. That means:

        devProbe.position = rig-local / player-relative coordinates

      It still has a world position, but the local numbers are the useful
      "attach this object relative to the player" measurements.

    Axis reminder:
      X = left/right
      Y = height
      Z = forward/back in the rig's local space
  */
  color: "#ffec99",
  radius: 0.055,
  min: -6,
  max: 6,
  step: 0.005,
  keyboardStep: 0.025,
};

const G53_RIGGING_HOME = {
  /*
    TEMP / DEV PRECISION RIGGING MODE home point.

    "G53-style" here borrows the machining idea of a known machine coordinate
    home. When the mode is active, the rig is put at a predictable position and
    yaw so pivot edits can be made without idle/walk motion drifting the target.

    Pass 1 scope:
      - enter/exit with F2
      - save/restore gameplay state
      - home the rig/player
      - freeze idle/walk drift
      - turn on mouse joint editing

    Later passes can add wall fading, strict axis locks, and richer tool UI.
  */
  position: new THREE.Vector3(0, 0, 0),
  yaw: 0,
  visibility: {
    /*
      Phase 2 visibility fixture.

      Walls/ceilings become invisible enough that the mesh and pivots are easy
      to inspect. Floors stay barely visible as a reference plane. Trees, ghost
      spheres, and Jupiter are hidden because they are useful for gameplay mood
      but not for precision rig setup.
    */
    floorOpacity: 0.06,
    wallOpacity: 0,
    ceilingOpacity: 0,
    treeOpacity: 0,
    hideGhostSpheres: true,
    hideJupiter: true,
  },
};

const RIG_BASE_BODY_YAW = -Math.PI;
const RIG_BASE_KNEE_YAW = -Math.PI;
const FACING_MIGRATION_EPSILON = 0.01;
/*
  Neutral facing correction.

  The rig originally treated local +Z as the visible puppet's front. From the
  camera/foot direction, that made the labels read mirrored: the joint named
  rightPalm was mechanically correct, but visually/anatomically it landed on
  what reads as the left hand.

  Instead of chasing this through sword attachment, arm poses, skin weighting,
  and combat code, the body joint now owns a 180 degree base bind yaw:

    base body yaw = -PI radians
    GUI body Y bind-rotation value = 0

  In machining terms: we moved the fixture zero. The correction is baked into
  the base rest pose, so a visible bind-pose slider value of 0 means "correct
  anatomical facing" from here on.

  V0.1.39 note:
    The upper body correction fixed the hand labels, but the feet still read
    backwards. Knees now use the same fixture-zero trick. A -PI base yaw on each
    knee flips the shin/ankle/foot chain without changing hips, root movement,
    collision, camera, or G53 machine home.
*/

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
/*
  Make the scene container programmatically focusable.

  A local mesh import opens the browser's native file picker through a temporary
  <input type="file">. After that picker closes, browser focus can remain in UI
  plumbing instead of returning neatly to the 3D scene. A tabindex of -1 keeps
  the scene out of normal tab order, but lets code call sceneContainer.focus()
  after file selection so keyboard shortcuts are routed back to the workshop.
*/
sceneContainer.tabIndex = -1;
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
const ARM_RUNTIME_BIND_ROTATION_JOINTS = [
  /*
    Mesh rigging sometimes needs a modeling pose, such as a T-pose, so the
    generated skin weights line up with the imported GLB. Gameplay needs a
    different neutral pose: arms relaxed at the sides so "down", walk swing,
    combat guard, and sword swing all start from a useful baseline.

    These are the bind-rotation sliders we are allowed to zero after the skin
    has been bound. The generated SkinnedMesh keeps the T-pose bind matrices it
    was created with, while the live puppet can return to gameplay arms.
  */
  "leftClavicle",
  "leftShoulder",
  "leftElbow",
  "leftWrist",
  "leftPalm",
  "rightClavicle",
  "rightShoulder",
  "rightElbow",
  "rightWrist",
  "rightPalm",
];
const MOUSE_EDIT_JOINTS = [...JOINT_ORDER];
const RIG_TUNING_KEYS = [
  /*
    Only these properties are saved/exported/imported. This protects the app
    from old localStorage blobs or pasted JSON adding unexpected properties to
    rigTuning.
  */
  "labEnabled",
  "skeletonVisible",
  "skeletonOpacity",
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
  "combatDifficulty",
  "swordAssetPath",
  "swordTargetLength",
  "swordGripFromLowerEnd",
  "swordOffsetX",
  "swordOffsetY",
  "swordOffsetZ",
  "swordPitch",
  "swordYaw",
  "swordRoll",
  "devProbeVisible",
  "devProbeX",
  "devProbeY",
  "devProbeZ",
  "devProbeStep",
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
  "g53AllowX",
  "g53AllowY",
  "g53AllowZ",
  "g53PreserveChildPoints",
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
  g53RiggingMode: {
    /*
      TEMP / DEV PRECISION RIGGING MODE runtime state.

      This is intentionally NOT part of rigTuning/localStorage. The mode is a
      temporary workholding fixture: enter it, do precise edits, then leave it.
      The pivot edits themselves still save through the existing rigTuning
      system; only the temporary "machine state" lives here.
    */
    active: false,
    status: "OFF",
    saved: null,
    visibilityFixture: [],
    readoutControllers: [],
  },
  devProbe: {
    /*
      TEMP / DEV MODE marker state.

      group:
        A tiny sphere named devProbe. It is parented to the skeleton root so its
        local position is automatically rig-relative.

      readout:
        Plain strings shown in the GUI. The numbers are refreshed by
        updateDevProbeReadout().

      drag fields:
        Mouse dragging uses the same camera-facing plane idea as joint editing,
        but writes to devProbeX/Y/Z instead of changing skeleton pivots.
    */
    group: null,
    mesh: null,
    raycaster: new THREE.Raycaster(),
    dragPlane: new THREE.Plane(),
    dragStartWorld: new THREE.Vector3(),
    dragCurrentWorld: new THREE.Vector3(),
    dragStartLocal: new THREE.Vector3(),
    dragStartRootLocal: new THREE.Vector3(),
    dragCurrentRootLocal: new THREE.Vector3(),
    dragging: false,
    readout: {
      world: "{ x: 0, y: 0, z: 0 }",
      rigLocal: "{ x: 0, y: 0, z: 0 }",
    },
    readoutControllers: [],
  },
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
  /*
    Walk arm counter-swing is runtime animation bookkeeping, not saved tuning.

    BUG HISTORY:
      This used to be created lazily only after walking or loading saved tuning.
      Pressing F2 before any movement entered G53 mode, then freezeG53RiggingPose()
      tried to write state.walkArmSwing.left/right and crashed the animation loop.
      Initializing it here makes the cold-start path valid.
  */
  walkArmSwing: { left: 0, right: 0 },
  lastVisibilityKey: "",
  sword: {
    /*
      Runtime sword object.

      group:
        The normalized GLB wrapper that eventually becomes a child of
        rightPalm. It is kept out of the disposable skeleton tree when the rig
        rebuilds, so slider changes do not accidentally destroy the loaded GLB.

      loading:
        Prevents repeated GLTFLoader requests if the user taps 1 several times
        while the sword asset is still coming in.

      loaded:
        Tells the equip flow whether it can attach immediately or needs to wait
        for the loader callback.
    */
    group: null,
    model: null,
    loading: false,
    loaded: false,
    loadedAssetPath: "",
  },
  combatBalance: {
    /*
      Runtime balance estimate from combatPhysics.js.

      This is not saved. It is a live diagnostic/mechanics value updated while
      a combat stance is active. Future passes can expose this in the GUI or use
      it for stagger/recovery decisions.
    */
    stance: COMBAT_STANCE_NAMES.NONE,
    supportBox: null,
    centerOfMass: { x: 0, y: 0, z: 0 },
    stability: { margin: 0, normalized: 0, overbalanced: false },
    criticalTipAngle: 0,
  },
  /*
    Temporary arm-rest snapshot for rigging start poses.

    When a T/A-pose is applied for mesh fitting, the arm bind-rotation sliders
    are changed so the skeleton matches the model's authored pose. Gameplay
    still needs the pre-rig relaxed arm rest afterward. This snapshot stores
    that relaxed arm rest until the mesh is bound and the puppet can return to
    it.
  */
  runtimeArmBindRotationBackup: null,
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
  combatStance: COMBAT_STANCE_NAMES.NONE,
  // Sword state is input/animation state only. The GLB object itself lives in
  // state.sword because it is a runtime asset, not a saved rig dimension.
  weaponEquipped: false,
  swordSwingStart: 0,
  swordSwingUntil: 0,
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
  preservedDescendantRootLocals: [],
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
setCombatDifficulty(rigTuning.combatDifficulty);

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
    skeletonOpacity: 0.7,
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
    combatDifficulty: "EASY",
    swordAssetPath: SWORD_TWEAKS.assetPath,
    swordTargetLength: SWORD_TWEAKS.targetLength,
    swordGripFromLowerEnd: SWORD_TWEAKS.gripFromLowerEnd,
    swordOffsetX: SWORD_TWEAKS.localPosition[0],
    swordOffsetY: SWORD_TWEAKS.localPosition[1],
    swordOffsetZ: SWORD_TWEAKS.localPosition[2],
    swordPitch: SWORD_TWEAKS.localRotation[0],
    swordYaw: SWORD_TWEAKS.localRotation[1],
    swordRoll: SWORD_TWEAKS.localRotation[2],
    devProbeVisible: false,
    devProbeX: 0.25,
    devProbeY: 1.1,
    devProbeZ: -0.4,
    devProbeStep: DEV_PROBE_TWEAKS.keyboardStep,
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
    g53AllowX: true,
    g53AllowY: true,
    g53AllowZ: true,
    g53PreserveChildPoints: true,
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
  if (clean.importedMeshPath === "Sigewynn.glb") {
    /*
      The local file picker stores only the chosen filename while the page is
      live because the actual file data is held in state.meshBlobUrl. After a
      refresh that blob is gone. Since Sigewynn.glb now lives in /assets, a bare
      saved filename can be safely upgraded to the reusable project path.
    */
    clean.importedMeshPath = DEFAULT_IMPORTED_MESH_PATH;
  }
  clean.combatDifficulty = ["EASY", "MEDIUM", "HARD"].includes(
    clean.combatDifficulty,
  )
    ? clean.combatDifficulty
    : defaults.combatDifficulty;
  clean.swordAssetPath =
    typeof clean.swordAssetPath === "string" && clean.swordAssetPath.trim()
      ? clean.swordAssetPath.trim()
      : defaults.swordAssetPath;
  clean.swordTargetLength = Number.isFinite(clean.swordTargetLength)
    ? THREE.MathUtils.clamp(clean.swordTargetLength, 0.05, 4)
    : defaults.swordTargetLength;
  clean.swordGripFromLowerEnd = Number.isFinite(clean.swordGripFromLowerEnd)
    ? THREE.MathUtils.clamp(clean.swordGripFromLowerEnd, 0, 1)
    : defaults.swordGripFromLowerEnd;
  [
    "swordOffsetX",
    "swordOffsetY",
    "swordOffsetZ",
    "swordPitch",
    "swordYaw",
    "swordRoll",
  ].forEach((key) => {
    clean[key] = Number.isFinite(clean[key]) ? clean[key] : defaults[key];
  });

  if (
    Math.abs(clean.swordPitch - Math.PI * 0.5) < 0.000001 &&
    Math.abs(clean.swordYaw) < 0.000001 &&
    Math.abs(clean.swordRoll - Math.PI * 0.04) < 0.000001
  ) {
    /*
      0.1.35's first Sword Offsets defaults aimed plainSword.glb sideways into
      the right edge of the screen. If an older save contains exactly that
      default rotation, migrate it to the corrected default so the sword is
      visible immediately after refresh. Hand-tuned non-default rotations are
      left alone.
    */
    clean.swordPitch = defaults.swordPitch;
    clean.swordYaw = defaults.swordYaw;
    clean.swordRoll = defaults.swordRoll;
  }
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
    const sourceY = Number.isFinite(source?.y)
      ? source.y
      : defaults[jointName].y;
    const isNeutralFacingJoint =
      jointName === "body" ||
      jointName === "leftKnee" ||
      jointName === "rightKnee";
    const migratedFacingY =
      isNeutralFacingJoint &&
      Math.abs(Math.abs(sourceY) - Math.PI) < FACING_MIGRATION_EPSILON
        ? defaults[jointName].y
        : sourceY;

    /*
      V0.1.38 / V0.1.39 facing migration:

      Before the neutral body-facing correction, the quick manual fix was to
      type body bind-rotation Y = -3.14159 in the GUI. That worked visually, but
      it made "correct facing" look like a non-zero setup error.

      V0.1.39 applies the same fixture-zero idea to leftKnee and rightKnee so
      the shin/ankle/foot chain points the readable way while the sliders still
      say zero.

      Now the base quaternions already own those -PI yaw corrections. If an old
      browser save or imported rig package still contains one of these Y values
      near +/-PI, treating it as an additional offset would double-apply the
      correction. So a near-PI yaw on body/leftKnee/rightKnee is interpreted as
      "this was the old manual facing fix" and migrated back to slider zero.
    */
    offsets[jointName] = {
      x: Number.isFinite(source?.x) ? source.x : defaults[jointName].x,
      y: migratedFacingY,
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
  state.runtimeArmBindRotationBackup = null;
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
  state.runtimeArmBindRotationBackup = null;
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
    detachSwordFromSkeleton();
    detachDevProbeFromSkeleton();
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
    opacity: rigTuning.skeletonOpacity,
    color: GUIDE_COLOR,
  });
  updateAxisMarkerAttachment();
  applyVisibility();
  selectMouseJointEditJoint(rigTuning.mouseJointEditJoint);
  syncSwordAttachment();
  syncDevProbeAttachment();
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
        The joint's ORIGINAL rotation from createSkeleton(). Most joints start
        at identity (no rotation). The body joint gets one deliberate exception:
        applyNeutralBodyFacingCorrection() bakes in a 180 degree yaw so the
        puppet's anatomical left/right agrees with the visible foot direction.
        The knee joints get the same style of correction through
        applyNeutralKneeFacingCorrection() so the lower legs/feet face the
        readable way while the GUI bind-rotation sliders still read zero.

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

function applyNeutralBodyFacingCorrection(bodyJoint) {
  /*
    Makes the 180-degree body facing correction the rig's neutral zero.

    Why body, not root:
      root is the player/collider/world anchor. Movement, camera, G53 home,
      encounter range checks, and devProbe coordinates all use the root as the
      stable machine coordinate system.

      body is the visible puppet carrier under that root. Rotating body changes
      which way the skeleton's feet/chest/arms face without moving the player
      anchor or rewriting room navigation.

    "Call it zero" mechanics:
      1. Set body.rotation.y to RIG_BASE_BODY_YAW.
      2. Copy that quaternion into baseBindLocalQuaternion.
      3. Copy it into bindLocalQuaternion.
      4. Leave bindLocalEuler at 0,0,0.

    applyBindRotationOffsets() later does:

      bindLocalQuaternion = baseBindLocalQuaternion * offsetQuaternion

    So when the GUI slider offset is zero, the corrected facing is still active.
  */
  bodyJoint.rotation.y = RIG_BASE_BODY_YAW;
  bodyJoint.userData.baseBindLocalQuaternion.copy(bodyJoint.quaternion);
  bodyJoint.userData.bindLocalQuaternion.copy(bodyJoint.quaternion);
  bodyJoint.userData.bindLocalEuler.set(0, 0, 0);
}

function applyNeutralKneeFacingCorrection(kneeJoint, sideName) {
  /*
    Makes each knee's lower-leg direction correction part of neutral zero.

    What this affects:
      knee -> ankle -> foot

    What this does NOT affect:
      pelvis, hip, upper-leg placement, root movement, collision, camera, or
      sword attachment.

    Why knee:
      The thigh line is just hip-to-knee. The readable "which way is the foot
      pointing?" cue lives below the knee, because the foot marker is a child of
      the ankle and the ankle inherits the knee's rotation. Rotating the knee
      around Y by -PI flips the shin/ankle/foot chain while keeping the knee
      point itself in place.

    "Call it zero" is identical to the body correction:

      base knee yaw = -PI radians
      GUI knee Y bind-rotation value = 0

    sideName is only here for debugging/readability; both knees get the same
    neutral yaw.
  */
  kneeJoint.rotation.y = RIG_BASE_KNEE_YAW;
  kneeJoint.userData.baseBindLocalQuaternion.copy(kneeJoint.quaternion);
  kneeJoint.userData.bindLocalQuaternion.copy(kneeJoint.quaternion);
  kneeJoint.userData.bindLocalEuler.set(0, 0, 0);
  kneeJoint.userData.neutralFacingCorrection = `${sideName} knee yaw`;
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
  applyNeutralBodyFacingCorrection(joints.body);
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
  applyNeutralKneeFacingCorrection(joints[`${prefix}Knee`], sideName);
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
  let skeletonOpacity = THREE.MathUtils.clamp(options.opacity ?? 1, 0, 1);
  const applyObjectOpacity = (object, baseOpacity = object.userData.debugBaseOpacity ?? 1) => {
    /*
      Skeleton opacity is a multiplier, not a replacement.

      Example:
        marker base opacity = 0.70
        skeletonOpacity     = 0.25
        final marker opacity = 0.70 * 0.25 = 0.175

      This preserves special cases such as the body-root line, which has a very
      low base opacity, while still letting the whole guide layer fade together.
    */
    object.userData.debugBaseOpacity = baseOpacity;

    const materials = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];

    materials.forEach((material) => {
      material.transparent = true;
      material.opacity = baseOpacity * skeletonOpacity;
      material.needsUpdate = true;
    });
  };
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
    applyObjectOpacity(marker, 0.7);

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
    applyObjectOpacity(label, 1);
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
      applyObjectOpacity(line, 0.65);

      if (joint.name === "body-root" && child.name === "pelvis") {
        // The body-root-to-pelvis line is visually useful but can become a
        // bright vertical distraction, so it is made almost transparent.
        line.material = line.material.clone();
        applyObjectOpacity(line, 0.05);
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
    setOpacity(opacity) {
      skeletonOpacity = THREE.MathUtils.clamp(opacity, 0, 1);
      objects.forEach((object) => applyObjectOpacity(object));
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
          applyObjectOpacity(marker, 0.3);
          return;
        }

        const selected = marker.userData.jointKey === jointKey;
        marker.material.color.set(selected ? "#ffec99" : color);
        applyObjectOpacity(marker, selected ? 1 : 0.7);
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

function setJointPointOffsetFromLocalPosition(jointName, desiredLocal) {
  /*
    Writes one joint's desired parent-local position back into the existing
    Joint Point Offset data structure.

    This is the single-joint version of applyJointPointOffsets().

    FORMULA:
      offset = desiredLocal - baseBindLocalPosition

    where:
      desiredLocal          = the joint position we want in its PARENT space
      baseBindLocalPosition = the original local position created by
                              createSkeleton()
      offset                = the saved slider/drag value in rigTuning

    Why this helper exists:
      Mouse dragging usually changes one selected joint. G53 "hold child points"
      also changes descendant offsets to compensate for parent movement. Having
      one helper keeps both writes identical, clamped to the same range, and easy
      to reason about.
  */
  const joint = state.skeleton?.joints[jointName];

  if (!joint?.userData?.baseBindLocalPosition) {
    return false;
  }

  const base = joint.userData.baseBindLocalPosition;
  const offset = getJointPointOffset(jointName);

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

  joint.userData.bindLocalPosition.copy(base);
  joint.userData.bindLocalPosition.add(
    new THREE.Vector3(offset.x, offset.y, offset.z),
  );
  joint.position.copy(joint.userData.bindLocalPosition);

  return true;
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

  state.runtimeArmBindRotationBackup = null;

  BIND_ROTATION_JOINTS.forEach((jointName) => {
    Object.assign(getBindRotationOffset(jointName), defaults[jointName]);
  });

  rerigImportedMeshAfterBindPoseChange();
  updateGuiDisplays();
}

function cloneArmBindRotationOffsets() {
  /*
    Copies the current arm bind-rotation slider values into plain JSON data.

    We do not keep references to the live rigTuning objects because the T/A-pose
    start presets overwrite those same objects. A clone preserves the relaxed
    arm rest exactly as it was before the temporary rigging pose took over.
  */
  return ARM_RUNTIME_BIND_ROTATION_JOINTS.reduce((snapshot, jointName) => {
    const offset = getBindRotationOffset(jointName);

    snapshot[jointName] = {
      x: offset.x,
      y: offset.y,
      z: offset.z,
    };

    return snapshot;
  }, {});
}

function captureRuntimeArmBindRotations(reason) {
  /*
    Saves the current relaxed/gameplay arm rest before a mesh-fitting start pose
    changes the arm bind sliders.

    Important guard:
      If a backup already exists, do not overwrite it. That prevents a second
      click on "apply start pose" from saving the T-pose as the new relaxed
      pose. The first snapshot is the one we want to return to.
  */
  if (state.runtimeArmBindRotationBackup) {
    return;
  }

  state.runtimeArmBindRotationBackup = {
    reason,
    rotations: cloneArmBindRotationOffsets(),
  };
  console.info(`[rig] captured relaxed arm bind rotations before ${reason}`);
}

function clearArmControlStateForRelaxedPose() {
  /*
    Restoring bind rotations alone is not enough if a gameplay arm command is
    still active.

    Example:
      If rightArm is "up", zeroing the bind sliders correctly returns the arm
      rest to relaxed, but the next animation frame immediately adds the "up"
      pose delta and the arm goes over the head. That made the old button feel
      like it was causing the raise, even though the active command was doing it.

    This helper explicitly returns arm controls to relaxed idle and hides the
    sword prop so the next frame does not re-raise the arms.
  */
  controlState.waveUntil = 0;
  controlState.wasWaving = false;
  controlState.leftArm = "down";
  controlState.rightArm = "down";
  controlState.combatStance = COMBAT_STANCE_NAMES.NONE;
  controlState.weaponEquipped = false;
  controlState.swordSwingStart = 0;
  controlState.swordSwingUntil = 0;

  if (state.sword.group) {
    state.sword.group.visible = false;
  }
}

function restoreRuntimeArmBindRotations() {
  /*
    Returns only the arm bind-rotation sliders to the relaxed gameplay rest.

    This is intentionally narrower than resetBindRotationOffsets():
      - It does NOT change pivot point offsets.
      - It does NOT change body, neck, head, hip, or leg bind rotations.
      - It only restores the arm chain listed in ARM_RUNTIME_BIND_ROTATION_JOINTS.

    Why this exists:
      Mesh binding and gameplay animation use the same visible puppet, but they
      need different meanings for "rest":

        mesh binding rest = the modeling pose used to calculate skin weights
        gameplay rest     = the pose animation deltas are added on top of

      A T-pose is excellent for binding a T-posed GLB like Sigewynn.glb. If we
      leave the shoulder bind sliders at +/- PI/2 afterward, then "arm down",
      "combat", and "swing" all get added to T-arms. The result is the exact
      stuck-at-T behavior you saw.

    Restore source:
      1. If applyRigMeshTPosePreset() or applyFemaleMeshAPosePreset() captured
         the pre-rig relaxed arms, restore that exact snapshot.
      2. If there is no snapshot, fall back to zero arm bind rotations because
         the fresh Empyrean skeleton's relaxed arm rest is zero.

    Three.js already captured the generated skin's bind matrices when
    skinnedMesh.bind(skeleton) ran, so after binding we can safely return the
    live puppet arms to the relaxed gameplay rest and let the skin deform from
    its stored modeling-pose bind into the animated pose.
  */
  const defaults = makeDefaultBindRotationOffsets();
  const backup = state.runtimeArmBindRotationBackup;
  const restoreSource = backup?.rotations || defaults;

  ARM_RUNTIME_BIND_ROTATION_JOINTS.forEach((jointName) => {
    Object.assign(
      getBindRotationOffset(jointName),
      restoreSource[jointName] || defaults[jointName],
    );
  });

  state.runtimeArmBindRotationBackup = null;
  clearArmControlStateForRelaxedPose();
  updateBindRotationPose();
  syncSwordAttachment();
  updateGuiDisplays();
  console.info(
    `[rig] restored arm bind rotations to relaxed gameplay rest${
      backup ? ` from ${backup.reason} snapshot` : " from defaults"
    }`,
  );
}

function applyFemaleMeshAPosePreset() {
  /*
    femaleMesh.glb is modeled with the arms already lifted away from the torso.
    This preset turns the Empyrean skeleton into a gentle A-pose so the shoulder,
    elbow, wrist, and hand pivots sit much closer to the imported mesh before
    generated skin weights are calculated.
  */
  captureRuntimeArmBindRotations("A-pose start pose");

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
  captureRuntimeArmBindRotations("T-pose start pose");

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
    state.runtimeArmBindRotationBackup = null;
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

function updateG53RiggingStatus(text) {
  state.g53RiggingMode.status = text;
  state.g53RiggingMode.readoutControllers.forEach((controller) =>
    controller.updateDisplay(),
  );
}

function getG53WorldOpacityForRole(role) {
  /*
    Phase 2 visibility rules.

    Role tags come from world.js:
      floor   = leave a faint reference plane
      wall    = hide room/outside walls
      ceiling = hide ceilings
      tree    = hide low-poly tree meshes

    Unknown roles are left alone. This prevents the fixture from touching the
    imported mesh, skeleton tools, devProbe, combat visuals, or future objects
    that have not opted into G53 visibility behavior.
  */
  if (role === "floor") {
    return G53_RIGGING_HOME.visibility.floorOpacity;
  }

  if (role === "wall") {
    return G53_RIGGING_HOME.visibility.wallOpacity;
  }

  if (role === "ceiling") {
    return G53_RIGGING_HOME.visibility.ceilingOpacity;
  }

  if (role === "tree") {
    return G53_RIGGING_HOME.visibility.treeOpacity;
  }

  return null;
}

function rememberG53ObjectVisibility(
  object,
  capturedMaterials = new Set(),
) {
  /*
    Stores the exact values we change so exitG53VisibilityFixture() can restore
    them without guessing. This includes object.visible and per-material opacity.
  */
  const materials = Array.isArray(object.material)
    ? object.material
    : object.material
      ? [object.material]
      : [];

  const entry = {
    object,
    visible: object.visible,
    materials: materials
      .filter((material) => {
        if (capturedMaterials.has(material.uuid)) {
          return false;
        }

        capturedMaterials.add(material.uuid);
        return true;
      })
      .map((material) => ({
        material,
        transparent: material.transparent,
        opacity: material.opacity,
        depthWrite: material.depthWrite,
      })),
  };

  state.g53RiggingMode.visibilityFixture.push(entry);
  return entry;
}

function setObjectMaterialOpacity(object, opacity) {
  const materials = Array.isArray(object.material)
    ? object.material
    : object.material
      ? [object.material]
      : [];

  materials.forEach((material) => {
    material.transparent = true;
    material.opacity = opacity;
    material.depthWrite = opacity >= 0.99;
    material.needsUpdate = true;
  });
}

function applyG53VisibilityFixture() {
  /*
    Phase 2: make the scene behave like a setup fixture.

    We do NOT delete, rebuild, or disable collision. We only change rendering
    state on selected world visuals:
      - walls and ceilings go to opacity 0
      - floors stay faint as reference planes
      - trees, ghost spheres, and Jupiter hide

    Because the original values are recorded first, exit restores the world to
    exactly the opacity/visibility it had before G53 mode entered.
  */
  restoreG53VisibilityFixture();
  const capturedMaterials = new Set();

  explorationWorld.group.traverse((object) => {
    const role = object.userData?.g53VisibilityRole;
    const opacity = getG53WorldOpacityForRole(role);

    if (opacity === null || !object.material) {
      return;
    }

    rememberG53ObjectVisibility(object, capturedMaterials);
    object.visible = true;
    setObjectMaterialOpacity(object, opacity);
  });

  if (G53_RIGGING_HOME.visibility.hideGhostSpheres) {
    ghostSpheres.forEach((sphere) => {
      rememberG53ObjectVisibility(sphere.group, capturedMaterials);
      sphere.group.visible = false;
    });
  }

  if (G53_RIGGING_HOME.visibility.hideJupiter && jupiter) {
    rememberG53ObjectVisibility(jupiter, capturedMaterials);
    jupiter.visible = false;
  }

  setCombatRiggingVisibilitySuppressed(true);
}

function restoreG53VisibilityFixture() {
  /*
    Restores all rendering state captured by applyG53VisibilityFixture().

    This function is safe to call even if no fixture is active. That lets enter
    mode clean up a previous half-applied fixture before applying a new one.
  */
  state.g53RiggingMode.visibilityFixture.forEach((entry) => {
    entry.object.visible = entry.visible;
    entry.materials.forEach((snapshot) => {
      snapshot.material.transparent = snapshot.transparent;
      snapshot.material.opacity = snapshot.opacity;
      snapshot.material.depthWrite = snapshot.depthWrite;
      snapshot.material.needsUpdate = true;
    });
  });

  state.g53RiggingMode.visibilityFixture = [];
  setCombatRiggingVisibilitySuppressed(false);
}

function ensureWalkArmSwingState() {
  /*
    Guarantees the walk-arm-swing runtime object exists.

    This is deliberately small and defensive. Normal startup now initializes
    state.walkArmSwing, but this helper protects any future reset/import path
    that might accidentally clear it.

    Formula:
      walkArmSwing = { left: 0, right: 0 } when missing

    where:
      left/right = shoulder counter-swing offsets written by updateWalkMotion()
  */
  if (!state.walkArmSwing) {
    state.walkArmSwing = { left: 0, right: 0 };
  }

  if (!Number.isFinite(state.walkArmSwing.left)) {
    state.walkArmSwing.left = 0;
  }

  if (!Number.isFinite(state.walkArmSwing.right)) {
    state.walkArmSwing.right = 0;
  }

  return state.walkArmSwing;
}

function resetWalkArmSwingState() {
  const walkArmSwing = ensureWalkArmSwingState();

  walkArmSwing.left = 0;
  walkArmSwing.right = 0;
}

function makeG53RiggingSnapshot() {
  /*
    Captures the temporary gameplay/view state that G53 mode is allowed to
    change. It deliberately does NOT copy joint point offsets, bind rotations,
    mesh settings, or imported skin data. Those are the workpiece, not the
    temporary fixture.
  */
  return {
    control: {
      position: controlState.position.clone(),
      yaw: controlState.yaw,
      walkPhase: controlState.walkPhase,
      isWalking: Boolean(controlState.isWalking),
      cameraYaw: controlState.cameraYaw,
      cameraDistance: controlState.cameraDistance,
      cameraHeight: controlState.cameraHeight,
      waveUntil: controlState.waveUntil,
      wasWaving: Boolean(controlState.wasWaving),
      leftArm: controlState.leftArm,
      rightArm: controlState.rightArm,
      combatStance: controlState.combatStance,
      weaponEquipped: Boolean(controlState.weaponEquipped),
      swordSwingStart: controlState.swordSwingStart,
      swordSwingUntil: controlState.swordSwingUntil,
      jump: { ...controlState.jump },
    },
    rig: {
      labEnabled: rigTuning.labEnabled,
      skeletonVisible: rigTuning.skeletonVisible,
      showJointLabels: rigTuning.showJointLabels,
      showAxisMarker: rigTuning.showAxisMarker,
      showRigCollider: rigTuning.showRigCollider,
      skeletonOpacity: rigTuning.skeletonOpacity,
      mouseJointEditMode: rigTuning.mouseJointEditMode,
      idleMotion: rigTuning.idleMotion,
      walkPreview: rigTuning.walkPreview,
    },
  };
}

function restoreG53RiggingSnapshot(saved) {
  /*
    Restores the gameplay/view state saved by makeG53RiggingSnapshot().

    Keeping this as a helper matters because G53 now has two restore paths:
      1. normal exit with F2
      2. failed/partial enter recovery

    Both paths should restore the exact same fields.
  */
  if (!saved) {
    return;
  }

  controlState.keys.clear();
  controlState.position.copy(saved.control.position);
  controlState.yaw = saved.control.yaw;
  controlState.walkPhase = saved.control.walkPhase;
  controlState.isWalking = saved.control.isWalking;
  controlState.cameraYaw = saved.control.cameraYaw;
  controlState.cameraDistance = saved.control.cameraDistance;
  controlState.cameraHeight = saved.control.cameraHeight;
  controlState.waveUntil = saved.control.waveUntil;
  controlState.wasWaving = saved.control.wasWaving;
  controlState.leftArm = saved.control.leftArm;
  controlState.rightArm = saved.control.rightArm;
  controlState.combatStance =
    saved.control.combatStance || COMBAT_STANCE_NAMES.NONE;
  controlState.weaponEquipped = saved.control.weaponEquipped;
  controlState.swordSwingStart = saved.control.swordSwingStart;
  controlState.swordSwingUntil = saved.control.swordSwingUntil;
  Object.assign(controlState.jump, saved.control.jump);

  Object.assign(rigTuning, saved.rig);
  resetWalkArmSwingState();
}

function enterG53RiggingMode() {
  /*
    TEMP / DEV PRECISION RIGGING MODE: enter machine-home fixture.

    Machining analogy:
      - Save the current "program state".
      - Go to a known machine-home reference.
      - Lock out motion noise.
      - Turn on the measuring/editing tools.

    What gets frozen in Pass 1:
      - player movement and yaw are held at home in updateKeyboardMotion()
      - idle motion is turned off
      - walk preview is turned off
      - jump offset is reset

    What stays active:
      - camera orbit/zoom/height
      - mesh preview/rig controls
      - mouse joint point editing
  */
  if (state.g53RiggingMode.active) {
    return;
  }

  const saved = makeG53RiggingSnapshot();

  try {
    state.g53RiggingMode.saved = saved;
    state.g53RiggingMode.active = true;
    updateG53RiggingStatus("ENTERING - HOME X0 Z0 YAW0");

    controlState.keys.clear();
    controlState.position.copy(G53_RIGGING_HOME.position);
    controlState.yaw = G53_RIGGING_HOME.yaw;
    controlState.walkPhase = 0;
    controlState.isWalking = false;
    controlState.waveUntil = 0;
    controlState.wasWaving = false;
  controlState.leftArm = "down";
  controlState.rightArm = "down";
  controlState.combatStance = COMBAT_STANCE_NAMES.NONE;
  resetCombatBalanceEstimate();
  controlState.swordSwingStart = 0;
  controlState.swordSwingUntil = 0;
    resetWalkArmSwingState();
    Object.assign(controlState.jump, {
      phase: "grounded",
      elapsed: 0,
      offsetY: 0,
      velocityY: 0,
    });

    if (controlState.weaponEquipped) {
      controlState.weaponEquipped = false;
      state.sword.group && (state.sword.group.visible = false);
    }

    rigTuning.idleMotion = false;
    rigTuning.walkPreview = false;
    rigTuning.labEnabled = true;
    rigTuning.skeletonVisible = true;
    rigTuning.showAxisMarker = true;
    rigTuning.showRigCollider = true;
    rigTuning.mouseJointEditMode = true;

    resetSkeletonToBindPose();
    syncSkeletonRoot();
    if (state.skeleton?.root) {
      state.skeleton.root.rotation.y = controlState.yaw;
      state.skeleton.root.updateMatrixWorld(true);
    }

    selectMouseJointEditJoint(rigTuning.mouseJointEditJoint);
    applyVisibility();
    applyG53VisibilityFixture();
    updateGuiDisplays();
    updateG53RiggingStatus("ACTIVE - HOME X0 Z0 YAW0 - WORLD FADED");
    console.info("[G53] rigging mode active: home position and mouse point edit enabled");
  } catch (error) {
    /*
      If any setup step fails, G53 must not remain half-entered. A partial enter
      is worse than a clean refusal because active=true freezes movement and the
      pose loop, but the visibility fixture/status may not be applied.
    */
    console.error("[G53] failed to enter rigging mode; restoring saved state", error);
    state.g53RiggingMode.active = false;
    state.g53RiggingMode.saved = null;
    restoreG53VisibilityFixture();
    restoreG53RiggingSnapshot(saved);
    resetSkeletonToBindPose();
    syncSkeletonRoot();
    if (state.skeleton?.root) {
      state.skeleton.root.rotation.y = controlState.yaw;
      state.skeleton.root.updateMatrixWorld(true);
    }
    syncSwordAttachment();
    selectMouseJointEditJoint(rigTuning.mouseJointEditJoint);
    applyVisibility();
    updateGuiDisplays();
    updateG53RiggingStatus("OFF - ENTER FAILED");
  }
}

function exitG53RiggingMode() {
  /*
    TEMP / DEV PRECISION RIGGING MODE: leave machine-home fixture.

    This restores gameplay/view state, but it does not undo pivot edits. If you
    moved a joint point during rigging mode, that remains your new tuned value.
  */
  if (!state.g53RiggingMode.active) {
    return;
  }

  const saved = state.g53RiggingMode.saved;

  state.g53RiggingMode.active = false;
  state.g53RiggingMode.saved = null;
  restoreG53VisibilityFixture();
  restoreG53RiggingSnapshot(saved);

  resetSkeletonToBindPose();
  syncSkeletonRoot();
  if (state.skeleton?.root) {
    state.skeleton.root.rotation.y = controlState.yaw;
    state.skeleton.root.updateMatrixWorld(true);
  }

  syncSwordAttachment();
  selectMouseJointEditJoint(rigTuning.mouseJointEditJoint);
  applyVisibility();
  updateGuiDisplays();
  updateG53RiggingStatus("OFF");
  console.info("[G53] rigging mode restored gameplay/view state");
}

function toggleG53RiggingMode() {
  if (state.g53RiggingMode.active) {
    exitG53RiggingMode();
  } else {
    enterG53RiggingMode();
  }
}

function rigCurrentImportedMeshAndExitG53() {
  /*
    GUI wrapper for Mesh > 2 rig mesh.

    In the G53 workflow, the usual sequence is:
      preview mesh -> F2 home rigging mode -> tune pivots -> 2 rig mesh -> return

    If a preview is already loaded, rigging is synchronous and we can restore
    gameplay immediately afterward. If no preview exists, skin.js starts an
    asynchronous GLB load; in that fallback case G53 mode stays active and the
    user can press F2 after the load/rig finishes.
  */
  const canRestoreImmediately = Boolean(state.importedPreview?.gltf);

  rigCurrentImportedMesh();

  if (canRestoreImmediately) {
    restoreRuntimeArmBindRotations();
  }

  if (state.g53RiggingMode.active && canRestoreImmediately) {
    exitG53RiggingMode();
  } else if (state.g53RiggingMode.active) {
    updateG53RiggingStatus("ACTIVE - async mesh load; press F2 after rigging");
  }
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
      G53 Rigging Mode  â€” temporary machine-home setup for pivot editing
      Save              â€” browser save/load and JSON export
      World Debug       â€” collision and encounter zone overlays
      Combat            â€” sword buttons and enemy difficulty
      Sword Offsets     â€” live sword path, scale, grip, position, rotation

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
    (e.g. assets/Sigewynn.glb) if the file is already in the project folder.
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
            /*
              Hand keyboard focus back to the scene after the OS file picker.

              Without this, function-key shortcuts can be swallowed by the
              browser/GUI focus state after choosing a new local mesh. The
              capture-phase F2 handler below is the main safety net; this focus
              restore makes the rest of the workshop feel normal too.
            */
            requestAnimationFrame(() => {
              window.focus();
              sceneContainer.focus({ preventScroll: true });
            });
          });
          input.click();
        },
      },
      "openFile",
    )
    .name("open fileâ€¦");

  /*
    PATH FIELD â€” fallback for typing a relative path like "assets/Sigewynn.glb"
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
  meshFolder
    .add({ fn: restoreRuntimeArmBindRotations }, "fn")
    .name("restore gameplay arms");
  meshFolder.add({ fn: renderDefaultImportedMesh }, "fn").name("1  preview");
  meshFolder.add({ fn: rigCurrentImportedMeshAndExitG53 }, "fn").name("2  rig mesh");
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
  addGuiController(labFolder, rigTuning, "skeletonOpacity", 0, 1, 0.01)
    .name("guide opacity")
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

  // ==============================================================
  // TEMP / DEV PRECISION RIGGING MODE: G53-style machine home
  // F2 homes the rig, hides measuring clutter, and enables precise pivot edits.
  // ==============================================================
  const g53Folder = state.gui.addFolder("G53 Rigging Mode");
  state.guiFolders.g53RiggingMode = g53Folder;
  state.g53RiggingMode.readoutControllers.push(
    g53Folder.add(state.g53RiggingMode, "status").name("status"),
  );
  g53Folder.add({ fn: enterG53RiggingMode }, "fn").name("enter / home");
  g53Folder.add({ fn: exitG53RiggingMode }, "fn").name("exit / restore");
  g53Folder.add({ fn: toggleG53RiggingMode }, "fn").name("F2 toggle");
  addGuiController(g53Folder, rigTuning, "g53AllowX").name("allow X");
  addGuiController(g53Folder, rigTuning, "g53AllowY").name("allow Y");
  addGuiController(g53Folder, rigTuning, "g53AllowZ").name("allow Z");
  addGuiController(g53Folder, rigTuning, "g53PreserveChildPoints").name(
    "hold child points",
  );
  g53Folder.close();

  // ==============================================================
  // TEMP / DEV MODE: devProbe
  // A movable measuring point for finding rig-local coordinates.
  // ==============================================================
  const devProbeFolder = state.gui.addFolder("TEMP Dev Probe");
  state.guiFolders.devProbe = devProbeFolder;
  addGuiController(devProbeFolder, rigTuning, "devProbeVisible")
    .name("visible")
    .onChange(syncDevProbeAttachment);
  addGuiController(
    devProbeFolder,
    rigTuning,
    "devProbeX",
    DEV_PROBE_TWEAKS.min,
    DEV_PROBE_TWEAKS.max,
    DEV_PROBE_TWEAKS.step,
  )
    .name("local X")
    .onChange(applyDevProbePosition);
  addGuiController(
    devProbeFolder,
    rigTuning,
    "devProbeY",
    DEV_PROBE_TWEAKS.min,
    DEV_PROBE_TWEAKS.max,
    DEV_PROBE_TWEAKS.step,
  )
    .name("local Y")
    .onChange(applyDevProbePosition);
  addGuiController(
    devProbeFolder,
    rigTuning,
    "devProbeZ",
    DEV_PROBE_TWEAKS.min,
    DEV_PROBE_TWEAKS.max,
    DEV_PROBE_TWEAKS.step,
  )
    .name("local Z")
    .onChange(applyDevProbePosition);
  addGuiController(devProbeFolder, rigTuning, "devProbeStep", 0.001, 0.25, 0.001)
    .name("key step");
  state.devProbe.readoutControllers.push(
    devProbeFolder.add(state.devProbe.readout, "world").name("world"),
    devProbeFolder.add(state.devProbe.readout, "rigLocal").name("rig local"),
  );
  devProbeFolder.add({ fn: logDevProbeValues }, "fn").name("log values");
  devProbeFolder.add({ fn: copyDevProbeRigLocal }, "fn").name("copy rig local");
  devProbeFolder.close();

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

  // ==============================================================
  // COMBAT
  // Sword controls mirror the keyboard shortcuts so you can test from the GUI.
  // Difficulty is saved with rig tuning and is pushed into combat_updated.js.
  // ==============================================================
  const combatFolder = state.gui.addFolder("Combat");
  state.guiFolders.combat = combatFolder;
  addGuiController(combatFolder, rigTuning, "combatDifficulty", [
    "EASY",
    "MEDIUM",
    "HARD",
  ])
    .name("difficulty")
    .onChange(setCombatDifficulty);
  combatFolder.add({ fn: equipSword }, "fn").name("equip sword");
  combatFolder.add({ fn: despawnSword }, "fn").name("stow sword");
  combatFolder.add({ fn: startSwordSwing }, "fn").name("swing");
  combatFolder.close();

  // ==============================================================
  // SWORD OFFSETS
  // Live workholding controls for whatever sword GLB is currently used.
  // These are saved/exported in rigTuning, just like mesh transform sliders.
  // ==============================================================
  const swordFolder = state.gui.addFolder("Sword Offsets");
  state.guiFolders.swordOffsets = swordFolder;
  addGuiController(swordFolder, rigTuning, "swordAssetPath")
    .name("asset path")
    .onFinishChange(reloadSwordAsset);
  addGuiController(swordFolder, rigTuning, "swordTargetLength", 0.05, 4, 0.01)
    .name("length / scale")
    .onChange(refreshSwordOffsetPresentation);
  addGuiController(swordFolder, rigTuning, "swordGripFromLowerEnd", 0, 1, 0.01)
    .name("grip point")
    .onChange(refreshSwordOffsetPresentation);
  addGuiController(swordFolder, rigTuning, "swordOffsetX", -1, 1, 0.005)
    .name("pos X")
    .onChange(syncSwordAttachment);
  addGuiController(swordFolder, rigTuning, "swordOffsetY", -1, 1, 0.005)
    .name("pos Y")
    .onChange(syncSwordAttachment);
  addGuiController(swordFolder, rigTuning, "swordOffsetZ", -1, 1, 0.005)
    .name("pos Z")
    .onChange(syncSwordAttachment);
  addGuiController(swordFolder, rigTuning, "swordPitch", -Math.PI, Math.PI, 0.005)
    .name("pitch X")
    .onChange(syncSwordAttachment);
  addGuiController(swordFolder, rigTuning, "swordYaw", -Math.PI, Math.PI, 0.005)
    .name("yaw Y")
    .onChange(syncSwordAttachment);
  addGuiController(swordFolder, rigTuning, "swordRoll", -Math.PI, Math.PI, 0.005)
    .name("roll Z")
    .onChange(syncSwordAttachment);
  swordFolder.add({ fn: reloadSwordAsset }, "fn").name("reload sword");
  swordFolder.add({ fn: resetSwordOffsets }, "fn").name("reset sword offsets");
  swordFolder.close();
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
  state.debugView?.setOpacity(rigTuning.skeletonOpacity);
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
  // Combat encounter tick: state machine handles trigger/start/roll/active/hiding/end.
  // It is a no-op while phase === "idle" and nothing is in the trigger.
  // Sword swings are one-shot calls from handleKeyDown(); the frame tick owns
  // continuous enemy movement, health-bar visibility, hiding, and audio fades.
  updateCombatEncounter(delta);

  updateJumpPhysics(delta);
  updateSkeleton(delta, elapsed, currentTime);
  syncImportedSkinToPuppet();
  updateDevProbeReadout();
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
  const machineHomeActive = state.g53RiggingMode.active;
  const moveInput = machineHomeActive
    ? 0
    : (keys.has("KeyW") ? 1 : 0) + (keys.has("KeyS") ? -1 : 0);
  const turnInput = machineHomeActive
    ? 0
    : (keys.has("KeyA") ? 1 : 0) + (keys.has("KeyD") ? -1 : 0);
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
  if (machineHomeActive) {
    /*
      G53 rigging mode keeps the rig at machine home. Camera controls above
      remain live, but player movement/yaw do not move the workpiece.
    */
    controlState.position.copy(G53_RIGGING_HOME.position);
    controlState.yaw = G53_RIGGING_HOME.yaw;
  }
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

  if (state.g53RiggingMode.active) {
    freezeG53RiggingPose();
    return;
  }

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

  if (controlState.weaponEquipped && !controlState.isWalking) {
    updateCombatStancePose(delta);
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

function freezeG53RiggingPose() {
  /*
    G53 RIGGING MODE POSE FREEZE.

    WHY THIS EXISTS:
      G53 is a measuring/fixture mode. While placing pivots against a mesh, the
      rig should behave like a stable layout jig, not like a living animated
      puppet.

    The earlier G53 pass turned off idle motion and walk preview, but the arm
    controller still ran every frame. Even the "down" arm pose is animated:

      shoulder target includes arm trail
      elbow target eases toward a relaxed bend
      wrist/palm target includes hand float

    Because updateControlledArms() uses damping, those joints visibly "settled"
    after every mouse drag. It looked like moving any pivot affected both arms,
    with the effect growing down the chain from shoulder -> elbow -> hand.

    FREEZE RULE:
      While G53 is active, do not run any pose solvers:
        - no idle breathing
        - no walk/leg relaxation
        - no arm trail/control poses
        - no jump pose overlay

    FORMULA:
      liveJointTransform = bindPoseTransform

    where:
      bindPoseTransform = the current saved pivot offsets + bind rotations

    This still shows every pivot edit immediately because the bind pose is
    rebuilt from rigTuning before this function runs. It simply prevents
    animation layers from adding motion on top of those rigging edits.
  */
  controlState.isWalking = false;
  controlState.waveUntil = 0;
  controlState.wasWaving = false;
  controlState.swordSwingStart = 0;
  controlState.swordSwingUntil = 0;
  resetWalkArmSwingState();

  Object.assign(controlState.jump, {
    phase: "grounded",
    elapsed: 0,
    offsetY: 0,
    velocityY: 0,
  });

  resetSkeletonToBindPose();
  syncSkeletonRoot();
  state.skeleton.root.rotation.y = G53_RIGGING_HOME.yaw;
  state.skeleton.root.updateMatrixWorld(true);
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

function equipSword() {
  /*
    Equips the right-hand sword and moves the puppet into Low Guard.

    Important separation:
      - This function owns the visible sword asset and arm pose.
      - combat_updated.js owns enemy hit points, hiding, and victory.
      - combatPhysics.js owns the balance math for what Low Guard means.

    If the GLB has not loaded yet, the stance still changes immediately. The
    loader callback calls syncSwordAttachment() when the asset arrives.
  */
  controlState.weaponEquipped = true;
  controlState.combatStance = COMBAT_STANCE_NAMES.LOW_GUARD;
  controlState.leftArm = "lowGuard";
  controlState.rightArm = "lowGuard";

  loadSwordIfNeeded();
  syncSwordAttachment();
}

function despawnSword() {
  /*
    Stows the sword and returns the arm toggles to idle.

    We keep the loaded GLB in memory after it is first loaded. Hiding/re-showing
    an existing object is much cheaper than loading assets every time 1 is
    pressed.
  */
  controlState.weaponEquipped = false;
  controlState.swordSwingStart = 0;
  controlState.swordSwingUntil = 0;
  controlState.leftArm = "down";
  controlState.rightArm = "down";
  controlState.combatStance = COMBAT_STANCE_NAMES.NONE;
  resetCombatBalanceEstimate();

  if (state.sword.group) {
    state.sword.group.visible = false;
  }
}

function startSwordSwing() {
  /*
    Starts one sword swing and asks the combat module whether it connected.

    The visual swing lasts SWORD_TWEAKS.swingDurationMs. The hit test happens at
    the start of the swing for now because the enemy encounter is still a simple
    prototype with one range/arc check, not frame-perfect weapon collision.

    Player strike point:
      x = controlState.position.x + rootOffsetX
      z = controlState.position.z + rootOffsetZ

    Forward attack arc:
      yaw is the same yaw used by movement/camera facing.
  */
  if (!controlState.weaponEquipped) {
    equipSword();
  }

  const now = performance.now();

  if (now < controlState.swordSwingUntil) {
    return;
  }

  controlState.swordSwingStart = now;
  controlState.swordSwingUntil = now + SWORD_TWEAKS.swingDurationMs;
  controlState.rightArm = "swing";

  const result = attemptCombatSwordHit({
    x: controlState.position.x + rigTuning.rootOffsetX,
    z: controlState.position.z + rigTuning.rootOffsetZ,
    yaw: controlState.yaw,
    range: SWORD_TWEAKS.hitRange,
    arcRadians: SWORD_TWEAKS.hitArcRadians,
  });

  console.info("[sword] swing result", result);
}

function getSwordAssetPath() {
  /*
    Returns the currently requested sword asset path.

    The path now lives in rigTuning so you can change it from the GUI and save
    it with the rest of the workshop setup. SWORD_TWEAKS remains the built-in
    default, not the only source of truth.
  */
  return rigTuning.swordAssetPath?.trim() || SWORD_TWEAKS.assetPath;
}

function refreshSwordOffsetPresentation() {
  /*
    Applies live Sword Offsets GUI values to the already-loaded prop.

    This is the sword equivalent of mesh transform sliders:
      - length/grip changes re-normalize the imported GLB model,
      - X/Y/Z and pitch/yaw/roll change the wrapper held by rightPalm.

    It is safe to call before the sword is loaded. In that case sync does
    nothing; the loader will apply the same values when the asset arrives.
  */
  if (state.sword.model) {
    normalizeSwordModel(state.sword.model);
  }

  syncSwordAttachment();
}

function disposeSwordAsset() {
  /*
    Removes the current sword GLB from memory so a different path can be loaded.

    This is intentionally separate from despawnSword():
      despawnSword() hides the weapon but keeps the asset ready.
      disposeSwordAsset() throws away the current asset because the workpiece
      changed and the next equip/reload should load from swordAssetPath.
  */
  const swordGroup = state.sword.group;

  if (swordGroup) {
    swordGroup.parent?.remove(swordGroup);
    disposeObjectTree(swordGroup);
  }

  state.sword.group = null;
  state.sword.model = null;
  state.sword.loading = false;
  state.sword.loaded = false;
  state.sword.loadedAssetPath = "";
}

function reloadSwordAsset() {
  /*
    GUI helper for changing to another sword GLB.

    It disposes the old prop, then asks the normal loader path to load the
    current swordAssetPath. If the player is already in combat stance, the new
    sword appears in the same hand automatically after it loads.
  */
  disposeSwordAsset();
  loadSwordIfNeeded();
  updateGuiDisplays();
}

function resetSwordOffsets() {
  /*
    Restores the GUI-controlled sword numbers to their default values.

    This does not touch enemy health, combat difficulty, arm pose, or mesh
    rigging. It only resets the sword workholding setup.
  */
  Object.assign(rigTuning, {
    swordAssetPath: SWORD_TWEAKS.assetPath,
    swordTargetLength: SWORD_TWEAKS.targetLength,
    swordGripFromLowerEnd: SWORD_TWEAKS.gripFromLowerEnd,
    swordOffsetX: SWORD_TWEAKS.localPosition[0],
    swordOffsetY: SWORD_TWEAKS.localPosition[1],
    swordOffsetZ: SWORD_TWEAKS.localPosition[2],
    swordPitch: SWORD_TWEAKS.localRotation[0],
    swordYaw: SWORD_TWEAKS.localRotation[1],
    swordRoll: SWORD_TWEAKS.localRotation[2],
  });

  if (state.sword.loadedAssetPath !== getSwordAssetPath()) {
    reloadSwordAsset();
  } else {
    refreshSwordOffsetPresentation();
  }

  updateGuiDisplays();
}

function loadSwordIfNeeded() {
  /*
    Loads the configured sword GLB once.

    GLTFLoader gives us a scene graph, not a single Mesh. We wrap the imported
    scene in our own group so all future placement happens on the wrapper and
    the GLB's internal mesh hierarchy can remain untouched.
  */
  const assetPath = getSwordAssetPath();

  if (state.sword.loaded && state.sword.loadedAssetPath === assetPath) {
    return;
  }

  if (state.sword.loaded && state.sword.loadedAssetPath !== assetPath) {
    disposeSwordAsset();
  }

  if (state.sword.loading) {
    return;
  }

  state.sword.loading = true;

  const loader = new GLTFLoader();
  loader.load(
    assetPath,
    (gltf) => {
      const swordGroup = new THREE.Group();
      swordGroup.name = "right-hand-sword";

      const swordRoot = gltf.scene;
      swordRoot.name = "right-hand-sword-model";
      normalizeSwordModel(swordRoot);
      swordGroup.add(swordRoot);

      state.sword.group = swordGroup;
      state.sword.model = swordRoot;
      state.sword.loaded = true;
      state.sword.loading = false;
      state.sword.loadedAssetPath = assetPath;

      syncSwordAttachment();
      console.info("[sword] loaded", assetPath);
    },
    undefined,
    (error) => {
      state.sword.loading = false;
      console.error("[sword] failed to load", assetPath, error);
    },
  );
}

function getSwordLocalBoundingBox(swordRoot) {
  /*
    Measures the sword in swordRoot-local coordinates.

    Why not Box3().setFromObject(swordRoot)?
      setFromObject measures in world space. Once the sword is parented to the
      palm, world-space measurement includes the hand's rotation, which can make
      repeated scale/grip tuning drift. This helper converts each mesh's bounds
      back into swordRoot local space before unioning them.

    Formula:
      localMatrix = inverse(swordRoot.matrixWorld) * child.matrixWorld
      childLocalBox = child.geometry.boundingBox transformed by localMatrix
  */
  swordRoot.updateMatrixWorld(true);

  const rootInverse = swordRoot.matrixWorld.clone().invert();
  const box = new THREE.Box3();
  let foundMesh = false;

  swordRoot.traverse((child) => {
    if (!child.isMesh || !child.geometry) {
      return;
    }

    child.geometry.computeBoundingBox();

    if (!child.geometry.boundingBox) {
      return;
    }

    const childBox = child.geometry.boundingBox.clone();
    const localMatrix = rootInverse.clone().multiply(child.matrixWorld);

    childBox.applyMatrix4(localMatrix);
    box.union(childBox);
    foundMesh = true;
  });

  return foundMesh ? box : null;
}

function rememberSwordImportTransform(swordRoot) {
  /*
    Stores the GLB scene root's authored transform the first time we normalize.

    GUI tuning can call normalizeSwordModel() many times. Resetting to this
    stored import transform before every measurement prevents scale and grip
    changes from accumulating like repeated machine offsets.
  */
  if (swordRoot.userData.baseSwordTransform) {
    return;
  }

  swordRoot.userData.baseSwordTransform = {
    position: swordRoot.position.clone(),
    quaternion: swordRoot.quaternion.clone(),
    scale: swordRoot.scale.clone(),
  };
}

function resetSwordToImportTransform(swordRoot) {
  const base = swordRoot.userData.baseSwordTransform;

  if (!base) {
    return;
  }

  swordRoot.position.copy(base.position);
  swordRoot.quaternion.copy(base.quaternion);
  swordRoot.scale.copy(base.scale);
}

function getSwordMaterialList(material) {
  return Array.isArray(material) ? material : [material].filter(Boolean);
}

function polishSwordMeshForVisibility(mesh) {
  /*
    Keeps imported swords visible in Empyrean's dark world.

    Some GLBs import with very dark PBR textures. They can be technically
    present but almost invisible against the black/green rooms. This does not
    replace the authored material; it only adds a tiny emissive lift and renders
    both sides so thin blade faces do not disappear at shallow camera angles.
  */
  mesh.frustumCulled = false;

  getSwordMaterialList(mesh.material).forEach((material) => {
    material.side = THREE.DoubleSide;

    if (material.emissive) {
      material.emissive.set("#1f1f1f");
      material.emissiveIntensity = Math.max(material.emissiveIntensity || 0, 0.12);
    }

    if ("envMapIntensity" in material) {
      material.envMapIntensity = Math.max(material.envMapIntensity || 0, 0.7);
    }

    material.needsUpdate = true;
  });
}

function normalizeSwordModel(swordRoot) {
  /*
    Fits an arbitrary sword GLB into Empyrean scene units.

    Formula:
      scale = targetLength / longestBoundingBoxSide

    Where:
      targetLength = rigTuning.swordTargetLength, in Three.js units
      longestBoundingBoxSide = max(width, height, depth) from the GLB bounds

    After scaling, we move the model so the wrapper group's origin sits near a
    grip point instead of the dead center of the sword. That origin is what
    rightPalm holds. The Sword Offsets X/Y/Z sliders then act like a small
    handle-placement shim.
  */
  rememberSwordImportTransform(swordRoot);
  resetSwordToImportTransform(swordRoot);
  swordRoot.updateMatrixWorld(true);

  const sourceBox = getSwordLocalBoundingBox(swordRoot);

  if (!sourceBox) {
    console.warn("[sword] could not find sword mesh bounds; leaving scale unchanged");
    return;
  }

  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const longestSide = Math.max(sourceSize.x, sourceSize.y, sourceSize.z);

  if (!Number.isFinite(longestSide) || longestSide <= 0.0001) {
    console.warn("[sword] could not measure sword asset; leaving scale unchanged");
    return;
  }

  const targetLength = THREE.MathUtils.clamp(rigTuning.swordTargetLength, 0.05, 4);
  const gripFromLowerEnd = THREE.MathUtils.clamp(
    rigTuning.swordGripFromLowerEnd,
    0,
    1,
  );
  const scale = targetLength / longestSide;
  const basePosition = swordRoot.position.clone();
  const longestAxis =
    sourceSize.x >= sourceSize.y && sourceSize.x >= sourceSize.z
      ? "x"
      : sourceSize.y >= sourceSize.z
        ? "y"
        : "z";
  const gripPoint = sourceBox.getCenter(new THREE.Vector3());

  /*
    Grip-point math:
      gripPoint[axis] = sourceBox.min[axis] + sourceSize[axis] * gripFromLowerEnd

    where:
      axis = whichever local box dimension is longest after scaling

    This is a practical prop heuristic. We do not know how every GLB author
    oriented their sword, but the longest box dimension is almost always blade
    length. Setting the wrapper origin close to one end makes the palm hold the
    hilt area instead of the center of the blade.

    Placement math:
      gripOffset = gripPoint * swordRoot.scale, then rotated by swordRoot.quaternion
      swordRoot.position = basePosition - gripOffset

    This means the chosen grip point lands at the wrapper group's origin. The
    wrapper is what gets attached to rightPalm. We intentionally calculate from
    sourceBox, not from a remeasured "fitted" box, because this function can run
    many times while sliders move. Starting from the saved import transform each
    time prevents cumulative scale/offset drift.
  */
  gripPoint[longestAxis] =
    sourceBox.min[longestAxis] + sourceSize[longestAxis] * gripFromLowerEnd;

  swordRoot.scale.multiplyScalar(scale);

  const gripOffset = gripPoint
    .clone()
    .multiply(swordRoot.scale)
    .applyQuaternion(swordRoot.quaternion);

  swordRoot.position.copy(basePosition).sub(gripOffset);
  swordRoot.updateMatrixWorld(true);

  swordRoot.traverse((child) => {
    if (child.isMesh) {
      polishSwordMeshForVisibility(child);
    }
  });
}

function syncSwordAttachment() {
  /*
    Parents the loaded sword to the current rightPalm joint.

    Why this exists:
      buildSkeletonWorkshop() destroys and recreates the skeleton when rig
      dimensions change. A child object would be disposed with the old skeleton
      unless we detach it first and reattach it to the new rightPalm here.
  */
  const swordGroup = state.sword.group;
  const rightPalm = state.skeleton?.joints?.rightPalm;

  if (!swordGroup || !rightPalm) {
    return;
  }

  if (swordGroup.parent !== rightPalm) {
    swordGroup.parent?.remove(swordGroup);
    rightPalm.add(swordGroup);
  }

  swordGroup.position.set(
    rigTuning.swordOffsetX,
    rigTuning.swordOffsetY,
    rigTuning.swordOffsetZ,
  );
  swordGroup.rotation.set(
    rigTuning.swordPitch,
    rigTuning.swordYaw,
    rigTuning.swordRoll,
  );
  swordGroup.visible = controlState.weaponEquipped;
}

function detachSwordFromSkeleton() {
  /*
    Protects the loaded sword during a skeleton rebuild.

    Removing the sword from its parent before disposeObjectTree(state.skeleton)
    means the object is not disposed with the old rightPalm. The next rebuild
    calls syncSwordAttachment() to attach it to the fresh rightPalm.
  */
  const swordGroup = state.sword.group;

  if (!swordGroup) {
    return;
  }

  swordGroup.parent?.remove(swordGroup);
}

function syncDevProbeAttachment() {
  /*
    TEMP / DEV MODE: creates and attaches the coordinate probe.

    The probe is intentionally separate from gameplay systems. It does not take
    part in collision, combat, skinning, or saving mesh weights. It is only a
    visible coordinate measuring point.

    Why parent it to state.skeleton.root?
      If a child is parented to the rig root, then child.position is already in
      the rig's local coordinate space. That is exactly the kind of number you
      need when tuning a sword offset or a hit-arc anchor.
  */
  if (!state.skeleton?.root) {
    return;
  }

  if (!state.devProbe.group) {
    buildDevProbe();
  }

  if (state.devProbe.group.parent !== state.skeleton.root) {
    state.devProbe.group.parent?.remove(state.devProbe.group);
    state.skeleton.root.add(state.devProbe.group);
  }

  applyDevProbePosition();
}

function buildDevProbe() {
  /*
    Builds one small visible sphere named devProbe.

    depthTest is false so the marker can be seen through the mesh/rig while you
    are using it as a measuring tool. renderOrder keeps it visually on top of
    most debug helpers.
  */
  const group = new THREE.Group();
  group.name = "devProbe";

  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(DEV_PROBE_TWEAKS.radius, 16, 12),
    new THREE.MeshBasicMaterial({
      color: DEV_PROBE_TWEAKS.color,
      transparent: true,
      opacity: 0.95,
      depthTest: false,
    }),
  );

  mesh.name = "devProbe-visible-sphere";
  mesh.renderOrder = 40;
  group.add(mesh);

  const axes = new THREE.AxesHelper(DEV_PROBE_TWEAKS.radius * 4);
  axes.name = "devProbe-mini-axes";
  axes.renderOrder = 41;
  group.add(axes);

  state.devProbe.group = group;
  state.devProbe.mesh = mesh;
}

function applyDevProbePosition() {
  /*
    Writes rigTuning.devProbeX/Y/Z into the visible marker.

    Since devProbe is parented to skeleton.root:
      group.position.x = local X relative to rig root
      group.position.y = local Y relative to rig root
      group.position.z = local Z relative to rig root
  */
  if (!state.devProbe.group) {
    return;
  }

  state.devProbe.group.position.set(
    rigTuning.devProbeX,
    rigTuning.devProbeY,
    rigTuning.devProbeZ,
  );
  state.devProbe.group.visible = Boolean(rigTuning.devProbeVisible);
  updateDevProbeReadout();
}

function detachDevProbeFromSkeleton() {
  /*
    Protects the probe during skeleton rebuilds.

    Sliders can rebuild the whole skeleton hierarchy. If the probe stayed inside
    the old root, disposeObjectTree(state.skeleton.root) would dispose it too.
    Detaching first keeps the probe object alive; syncDevProbeAttachment() then
    attaches it to the fresh root.
  */
  state.devProbe.group?.parent?.remove(state.devProbe.group);
}

function toggleDevProbe() {
  // Y key convenience toggle.
  rigTuning.devProbeVisible = !rigTuning.devProbeVisible;
  syncDevProbeAttachment();
  updateGuiDisplays();
  logDevProbeValues();
}

function moveDevProbeLocal(dx = 0, dy = 0, dz = 0) {
  /*
    Keyboard movement moves the probe in RIG-LOCAL space.

    local += delta

    Where:
      local = { devProbeX, devProbeY, devProbeZ }
      delta = small keyboard step on one or more axes
  */
  rigTuning.devProbeX = THREE.MathUtils.clamp(
    rigTuning.devProbeX + dx,
    DEV_PROBE_TWEAKS.min,
    DEV_PROBE_TWEAKS.max,
  );
  rigTuning.devProbeY = THREE.MathUtils.clamp(
    rigTuning.devProbeY + dy,
    DEV_PROBE_TWEAKS.min,
    DEV_PROBE_TWEAKS.max,
  );
  rigTuning.devProbeZ = THREE.MathUtils.clamp(
    rigTuning.devProbeZ + dz,
    DEV_PROBE_TWEAKS.min,
    DEV_PROBE_TWEAKS.max,
  );

  applyDevProbePosition();
  updateGuiDisplays();
}

function handleDevProbeKeyboard(event) {
  /*
    TEMP / DEV MODE keyboard nudges.

    Hold Shift so these controls do not steal normal gameplay keys:
      Shift + J/L = local X left/right
      Shift + U/O = local Y up/down
      Shift + I/K = local Z forward/back

    In this rig, local +Z is "forward" because movement uses:
      forward = (sin(yaw), 0, cos(yaw))

    At yaw = 0, forward is +Z.
  */
  if (!rigTuning.devProbeVisible || !event.shiftKey) {
    return false;
  }

  const step = event.ctrlKey
    ? rigTuning.devProbeStep * 4
    : event.altKey
      ? rigTuning.devProbeStep * 0.25
      : rigTuning.devProbeStep;

  if (event.code === "KeyJ") {
    moveDevProbeLocal(-step, 0, 0);
  } else if (event.code === "KeyL") {
    moveDevProbeLocal(step, 0, 0);
  } else if (event.code === "KeyU") {
    moveDevProbeLocal(0, step, 0);
  } else if (event.code === "KeyO") {
    moveDevProbeLocal(0, -step, 0);
  } else if (event.code === "KeyI") {
    moveDevProbeLocal(0, 0, step);
  } else if (event.code === "KeyK") {
    moveDevProbeLocal(0, 0, -step);
  } else {
    return false;
  }

  event.preventDefault();
  logDevProbeValues();
  return true;
}

function getDevProbeVectors() {
  /*
    Returns both coordinate spaces for the same point.

    The important Three.js conversion is:

      rigLocalPoint = skeletonRoot.worldToLocal(worldPoint.clone())

    Meaning:
      worldPoint is the absolute scene coordinate.
      skeletonRoot.worldToLocal(...) converts that absolute point into the
      coordinate space of the rig/player root.

    Because devProbe is already parented to skeletonRoot, devProbe.position and
    rigLocalPoint should match. We still do the explicit worldToLocal conversion
    here because it is the reusable formula for future tools.
  */
  const world = new THREE.Vector3();
  const rigLocal = new THREE.Vector3();

  if (!state.devProbe.group || !state.skeleton?.root) {
    return { world, rigLocal };
  }

  state.skeleton.root.updateMatrixWorld(true);
  state.devProbe.group.getWorldPosition(world);
  rigLocal.copy(world);
  state.skeleton.root.worldToLocal(rigLocal);

  return { world, rigLocal };
}

function roundDevProbeValue(value) {
  // Keeps copied coordinates readable without throwing away useful precision.
  return Math.round(value * 1000) / 1000;
}

function formatDevProbeVector(vector) {
  return `{ x: ${roundDevProbeValue(vector.x)}, y: ${roundDevProbeValue(
    vector.y,
  )}, z: ${roundDevProbeValue(vector.z)} }`;
}

function updateDevProbeReadout() {
  if (!state.devProbe.group) {
    return;
  }

  const { world, rigLocal } = getDevProbeVectors();

  state.devProbe.readout.world = formatDevProbeVector(world);
  state.devProbe.readout.rigLocal = formatDevProbeVector(rigLocal);
  state.devProbe.readoutControllers.forEach((controller) =>
    controller.updateDisplay(),
  );
}

function logDevProbeValues() {
  const { world, rigLocal } = getDevProbeVectors();

  console.info("[devProbe] world", {
    x: roundDevProbeValue(world.x),
    y: roundDevProbeValue(world.y),
    z: roundDevProbeValue(world.z),
  });
  console.info("[devProbe] rig local", {
    x: roundDevProbeValue(rigLocal.x),
    y: roundDevProbeValue(rigLocal.y),
    z: roundDevProbeValue(rigLocal.z),
  });
}

async function copyDevProbeRigLocal() {
  /*
    Copies the rig-local coordinate string.

    Clipboard writes generally require a user gesture. A lil-gui button click is
    a user gesture, so this should work in Live Server. If the browser blocks it,
    the value is still logged to the console.
  */
  const { rigLocal } = getDevProbeVectors();
  const text = formatDevProbeVector(rigLocal);

  console.info("[devProbe] copy rig local", text);

  try {
    await navigator.clipboard?.writeText(text);
  } catch (error) {
    console.warn("[devProbe] clipboard write blocked; value logged instead", error);
  }
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
  const walkArmSwing = ensureWalkArmSwingState();

  walkArmSwing.left = -leftSwing * 0.22 * amplitude;
  walkArmSwing.right = -rightSwing * 0.22 * amplitude;

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
  resetWalkArmSwingState();
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

function getReadySwordArmPose() {
  /*
    Returns the non-swing arm pose that should hold the sword.

    This tiny resolver keeps the sword flow from hard-coding "combat" in
    multiple places. When we add high guard, thrust prep, shield guard, or
    stance-dependent idle holds later, this is the switchboard that decides
    which named arm pose is the current ready pose.
  */
  if (controlState.combatStance === COMBAT_STANCE_NAMES.LOW_GUARD) {
    return "lowGuard";
  }

  return "combat";
}

function makeSideScaledVector(target = {}, side = 1) {
  /*
    Converts a stance-profile vector into a plain x/y/z offset.

    The combat stance profiles in combatPhysics.js use two kinds of fields:

      x      = same value for left and right
      xSide  = mirrored value, multiplied by side

    where:
      side = -1 for left
      side = +1 for right

    Example:
      { xSide: 0.05, y: 0, z: 0.02 }

    becomes:
      left  = { x: -0.05, y: 0, z: 0.02 }
      right = { x:  0.05, y: 0, z: 0.02 }

    This lets one Low Guard profile describe both legs without duplicating the
    same numbers twice.
  */
  return {
    x: (target.x ?? 0) + (target.xSide ?? 0) * side,
    y: (target.y ?? 0) + (target.ySide ?? 0) * side,
    z: (target.z ?? 0) + (target.zSide ?? 0) * side,
  };
}

function makeSideScaledEuler(target = {}, side = 1) {
  /*
    Same idea as makeSideScaledVector(), but returned as a Three.js Euler.

    Stance profiles stay plain data in combatPhysics.js. main.js turns that
    data into the Three.js-specific rotation object only at the animation edge.
  */
  const v = makeSideScaledVector(target, side);
  return new THREE.Euler(v.x, v.y, v.z);
}

function getJointRootLocalPosition(joint) {
  /*
    Measures a joint in rig-local coordinates.

    Formula:

      rootLocalPoint = skeletonRoot.worldToLocal(jointWorldPoint)

    where:
      jointWorldPoint = joint.getWorldPosition(...)
      skeletonRoot    = state.skeleton.root

    Why this matters:
      The math module does not know about Three.js parent chains. It needs all
      numbers in one shared coordinate system. Root-local is perfect for this:
      x = left/right from the player, y = height, z = forward/back from player.
  */
  const root = state.skeleton?.root;

  if (!root || !joint) {
    return new THREE.Vector3();
  }

  const worldPoint = new THREE.Vector3();
  joint.getWorldPosition(worldPoint);
  return root.worldToLocal(worldPoint);
}

function getJointLocalOffsetAsRootLocalPosition(joint, offset = {}) {
  /*
    Converts a point near a joint into rig-local coordinates.

    Used for the sword center of mass:

      1. Start with an offset in rightPalm-local space.
      2. localToWorld() moves that point through the palm/wrist/elbow/shoulder
         hierarchy into the scene.
      3. root.worldToLocal() brings it back into player/root coordinates.

    That means the sword CoM follows the actual arm pose instead of pretending
    the hand is never rotated.
  */
  const root = state.skeleton?.root;

  if (!root || !joint) {
    return new THREE.Vector3();
  }

  const localPoint = new THREE.Vector3(
    offset.x ?? 0,
    offset.y ?? 0,
    offset.z ?? 0,
  );
  const worldPoint = joint.localToWorld(localPoint);
  return root.worldToLocal(worldPoint);
}

function estimateBodyCenterOfMassRootLocal() {
  /*
    Estimates body center of mass from major skeleton landmarks.

    Formula:

      bodyCoM = sum(m_i * p_i) / sum(m_i)

    where:
      p_i = pelvis/chest/head positions in rig-local coordinates
      m_i = simple scene-unit mass weights

    These are not anatomical lab values. They are stable animation weights:
      pelvis = 45%  lower mass carrier
      chest  = 42%  torso mass carrier
      head   = 13%  visible upper mass

    The useful part is not perfect biology. The useful part is that stance
    changes, sword offsets, and later strike poses can all speak the same
    center-of-mass language.
  */
  const joints = state.skeleton?.joints;

  if (!joints) {
    return { x: 0, y: 0, z: 0, totalMass: 0 };
  }

  return combineMassPoints([
    { mass: 0.45, position: getJointRootLocalPosition(joints.pelvis) },
    { mass: 0.42, position: getJointRootLocalPosition(joints.chest) },
    { mass: 0.13, position: getJointRootLocalPosition(joints.head) },
  ]);
}

function resetCombatBalanceEstimate() {
  /*
    Clears the live balance readout when no combat stance is active.

    Nothing in gameplay depends on this value yet. Keeping it clean now makes
    future GUI/debug readouts easier because stale Low Guard numbers will not
    hang around after the sword is stowed.
  */
  state.combatBalance = {
    stance: COMBAT_STANCE_NAMES.NONE,
    supportBox: null,
    centerOfMass: { x: 0, y: 0, z: 0 },
    stability: { margin: 0, normalized: 0, overbalanced: false },
    criticalTipAngle: 0,
  };
}

function updateCombatBalanceEstimate(profile) {
  /*
    Runs the document math against the live puppet pose.

    All positions passed to combatPhysics.js are in root-local coordinates:

      leftFoot/rightFoot = base of support contact anchors
      bodyCom            = weighted average of pelvis/chest/head
      swordCom           = right palm plus the stance profile's sword offset

    combatPhysics.js then calculates:
      supportBox       = simplified floor footprint around both feet
      centerOfMass     = (bodyMass * bodyCom + swordMass * swordCom) /
                         (bodyMass + swordMass)
      stability.margin = distance from projected CoM to nearest support edge
      criticalTipAngle = atan(edgeDistance / centerOfMassY)

    This is a live diagnostic today. Later it can drive stumble checks, guard
    recovery, enemy knockback, or "this swing is overextended" feedback.
  */
  const root = state.skeleton?.root;
  const joints = state.skeleton?.joints;

  if (!root || !joints || !profile) {
    resetCombatBalanceEstimate();
    return;
  }

  root.updateMatrixWorld(true);

  const bodyCom = estimateBodyCenterOfMassRootLocal();
  const swordCom = getJointLocalOffsetAsRootLocalPosition(
    joints.rightPalm,
    profile.swordComOffsetFromRightPalm,
  );
  const balance = evaluateCombatBalance({
    leftFoot: getJointRootLocalPosition(joints.leftFoot),
    rightFoot: getJointRootLocalPosition(joints.rightFoot),
    bodyCom,
    swordCom,
    bodyMass: profile.bodyMass,
    swordMass: profile.swordMass,
    footHalfWidth: profile.footHalfWidth,
    footHalfDepth: profile.footHalfDepth,
  });

  state.combatBalance = {
    stance: profile.name,
    supportBox: balance.supportBox,
    centerOfMass: balance.centerOfMass,
    stability: balance.stability,
    criticalTipAngle: balance.criticalTipAngle,
  };
}

function updateCombatStancePose(delta) {
  /*
    Applies the active full-body combat stance from combatPhysics.js.

    This function is the bridge between:

      combatPhysics.js = named stance profile and balance formulas
      main.js          = actual Three.js joints that need to move

    Low Guard now comes from the profile instead of hard-coded numbers in this
    function. That means future stances can be added as data:

      profile.pose.bodyOffset
      profile.pose.pelvisRotation
      profile.pose.leg.hipOffset
      profile.pose.leg.kneeRotation
      etc.

    The arms are still handled by getControlledArmPoseTargets() because hand
    poses need their own swing/wave/weapon timing logic.
  */
  const profile = getCombatStanceProfile(controlState.combatStance);

  if (!profile?.pose) {
    resetCombatBalanceEstimate();
    return;
  }

  if (controlState.jump.phase !== "grounded") {
    return;
  }

  const joints = state.skeleton.joints;
  const pose = profile.pose;
  const legPose = pose.leg || {};

  dampJointPositionFromBind(
    joints.body,
    pose.bodyOffset || { x: 0, y: 0, z: 0 },
    delta,
    rigTuning.damping * 0.82,
  );
  dampJointRotation(
    joints.pelvis,
    makeSideScaledEuler(pose.pelvisRotation),
    delta,
    rigTuning.damping * 0.78,
  );
  dampJointRotation(
    joints.chest,
    makeSideScaledEuler(pose.chestRotation),
    delta,
    rigTuning.damping * 0.76,
  );
  dampJointRotation(
    joints.head,
    makeSideScaledEuler(pose.headRotation),
    delta,
    rigTuning.damping * 0.7,
  );

  ["left", "right"].forEach((sideName) => {
    const side = sideName === "left" ? -1 : 1;
    const hip = joints[`${sideName}Hip`];
    const knee = joints[`${sideName}Knee`];
    const ankle = joints[`${sideName}Ankle`];
    const foot = joints[`${sideName}Foot`];

    /*
      Position offsets widen the stance and sink the knee/ankle line.

      Rotation offsets create the visual bend. The side-scaled profile fields
      mirror the same stance to both legs while preserving left/right symmetry.
    */
    dampJointPositionFromBind(
      hip,
      makeSideScaledVector(legPose.hipOffset, side),
      delta,
      rigTuning.damping * 0.8,
    );
    dampJointPositionFromBind(
      knee,
      makeSideScaledVector(legPose.kneeOffset, side),
      delta,
      rigTuning.damping * 0.8,
    );
    dampJointPositionFromBind(
      ankle,
      makeSideScaledVector(legPose.ankleOffset, side),
      delta,
      rigTuning.damping * 0.8,
    );
    dampJointPositionFromBind(
      foot,
      makeSideScaledVector(legPose.footOffset, side),
      delta,
      rigTuning.damping * 0.8,
    );

    dampJointRotation(
      hip,
      makeSideScaledEuler(legPose.hipRotation, side),
      delta,
      rigTuning.damping * 0.78,
    );
    dampJointRotation(
      knee,
      makeSideScaledEuler(legPose.kneeRotation, side),
      delta,
      rigTuning.damping * 0.78,
    );
    dampJointRotation(
      ankle,
      makeSideScaledEuler(legPose.ankleRotation, side),
      delta,
      rigTuning.damping * 0.78,
    );
    dampJointRotation(
      foot,
      makeSideScaledEuler(legPose.footRotation, side),
      delta,
      rigTuning.damping * 0.78,
    );
  });

  updateCombatBalanceEstimate(profile);
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
    A sword swing overrides the right arm for only the swing window, then drops
    back to the combat stance if the weapon is still equipped.
  */
  const isWaving = currentTime < controlState.waveUntil;
  const swordSwinging =
    controlState.weaponEquipped && currentTime < controlState.swordSwingUntil;

  if (
    controlState.weaponEquipped &&
    !swordSwinging &&
    controlState.rightArm === "swing"
  ) {
    controlState.rightArm = getReadySwordArmPose();
  }

  const leftState = isWaving ? "wave" : controlState.leftArm;
  let rightState = controlState.rightArm;

  if (isWaving) {
    rightState = "wave";
  }

  if (swordSwinging) {
    rightState = "swing";
  }

  updateControlledArm("left", -1, leftState, delta, currentTime);
  updateControlledArm("right", 1, rightState, delta, currentTime);
}

function getControlledArmPoseTargets(sideName, side, pose, currentTime) {
  /*
    Returns target rotations for one controlled arm pose.

    This is the "stance and swing library" starting point.

    To add a future stance:
      1. Pick a pose name, such as "guardHigh" or "thrust".
      2. Add another else-if block below.
      3. Return target Euler rotations for shoulder, elbow, wrist, and palm.
      4. Set controlState.leftArm or controlState.rightArm to that pose name.

    The updater below handles damping and joint lookup. Keeping the math here
    makes it much easier to reason about what a pose actually means.

    Poses:
      down = relaxed idle trail  (default while standing or walking)
      half = both hands half high
      up   = selected arm high
      wave = temporary waving pose with wrist/palm oscillation
      lowGuard = sword drawn, blade/hand carried low and grounded
      combat = right hand forward, ready to hold a weapon
      swing  = timed sword attack pose

    side mirrors the pose across the body:
      left  side = -1
      right side = +1

    Returned target meaning:
      shoulder/elbow/wrist/palm are animation deltas, not absolute rotations.
      dampJointRotation() adds each delta on top of that joint's bind pose.
  */
  const time = currentTime * 0.001;
  const trail = Math.sin(time * 0.72 - 1.1) * rigTuning.armTrailAmplitude;
  const handFloat =
    Math.sin(time * 0.9 - 1.65) * rigTuning.armTrailAmplitude * 0.45;
  const wave = pose === "wave" ? Math.sin(time * 9) * 0.45 : 0;
  const swingProgress = THREE.MathUtils.clamp(
    (currentTime - controlState.swordSwingStart) / SWORD_TWEAKS.swingDurationMs,
    0,
    1,
  );
  const swingSweep = physicsSmoothstep(0, 1, swingProgress);
  const swingAccent = Math.sin(swingProgress * Math.PI);

  /*
    Read the current walk arm swing for this side.
    state.walkArmSwing is written each frame by updateWalkMotion() when
    the walk preview or active movement is running. It is zero otherwise.
  */
  const walkSwing = state.walkArmSwing?.[sideName] ?? 0;

  /*
    Default "down" pose: arm hangs with a slow independent trail oscillation.
    walkSwing is added to the shoulder X to create natural gait counter-swing.
    The trail's X contribution (trail * 0.12) still blends in. During walking,
    the trail amplitude is typically small so it only adds subtle variation on
    top of the gait swing.
  */
  let shoulder = new THREE.Euler(trail * 0.12 + walkSwing, 0, side * 0.16);
  let elbow = new THREE.Euler(0.08, 0, side * 0.08);
  let wrist = new THREE.Euler(handFloat * 0.08, 0, -side * handFloat * 0.26);
  let palm = new THREE.Euler(0, 0, side * 0.04);

  if (pose === "up") {
    shoulder = new THREE.Euler(-0.2, 0, side * 2.2);
    elbow = new THREE.Euler(0.16, 0, side * 0.22);
  } else if (pose === "half") {
    shoulder = new THREE.Euler(-0.08, 0, side * 1.12);
    elbow = new THREE.Euler(0.18, 0, side * 0.2);
  } else if (pose === "wave") {
    shoulder = new THREE.Euler(-0.12, 0, side * 1.85);
    elbow = new THREE.Euler(0.18, 0, side * (0.25 + wave));
    wrist = new THREE.Euler(0.1, 0, side * wave * 0.8);
    palm = new THREE.Euler(0.08, 0, side * wave * 0.65);
  } else if (pose === "lowGuard") {
    /*
      Low Guard arm pose:
        The body/legs lower and widen through updateCombatStancePose().
        The arms here keep the hands down near the lower torso so the drawn
        sword reads as carried, ready, and stable instead of held high.

      Right arm:
        The weapon hand sits forward and low. The elbow stays bent so a swing
        can launch from the guard without snapping out of a straight arm.

      Left arm:
        The off hand comes slightly forward for balance. It does not grab the
        sword yet, but it gives the pose a deliberate two-sided guard.
    */
    if (sideName === "right") {
      shoulder = new THREE.Euler(0.1, side * 0.08, side * 0.58);
      elbow = new THREE.Euler(0.72, -side * 0.05, side * 0.14);
      wrist = new THREE.Euler(0.28, side * 0.04, -side * 0.18);
      palm = new THREE.Euler(0.04, 0, side * 0.08);
    } else {
      shoulder = new THREE.Euler(-0.02, side * 0.04, side * 0.68);
      elbow = new THREE.Euler(0.52, -side * 0.02, side * 0.12);
      wrist = new THREE.Euler(0.16, 0, -side * 0.1);
      palm = new THREE.Euler(0.04, 0, side * 0.06);
    }
  } else if (pose === "combat") {
    /*
      Sword guard pose:
        shoulder brings the weapon side forward and away from the ribs,
        elbow bends enough to keep the hand in front of the torso,
        wrist/palm align the grip so the blade can read as held, not pasted on.

      This is deliberately named "combat" for backward compatibility with the
      existing Digit1 input and GUI buttons. Future named stances can live next
      to this block without changing the key handling.
    */
    shoulder = new THREE.Euler(-0.48, side * 0.16, side * 0.96);
    elbow = new THREE.Euler(0.58, -side * 0.04, side * 0.2);
    wrist = new THREE.Euler(-0.24, side * 0.06, -side * 0.28);
    palm = new THREE.Euler(0.1, 0, side * 0.14);
  } else if (pose === "swing") {
    /*
      Sword swing pose:
        swingProgress = elapsedSwingTime / swingDuration
        swingSweep    = smoothstep(0, 1, swingProgress)
        swingAccent   = sin(progress * PI)

      swingSweep carries the arm from ready pose into follow-through.
      swingAccent adds a middle-of-swing snap without changing the start/end.
    */
    shoulder = new THREE.Euler(
      -0.7 + swingSweep * 0.86,
      side * (0.16 - swingSweep * 0.42),
      side * (1.08 - swingSweep * 0.86),
    );
    elbow = new THREE.Euler(
      0.48 + swingAccent * 0.46,
      -side * 0.03,
      side * (0.22 - swingSweep * 0.2),
    );
    wrist = new THREE.Euler(
      -0.34 + swingSweep * 0.62,
      side * 0.04,
      -side * (0.3 + swingAccent * 0.42),
    );
    palm = new THREE.Euler(
      0.16 + swingAccent * 0.22,
      0,
      side * (0.18 - swingSweep * 0.62),
    );
  }

  return { shoulder, elbow, wrist, palm };
}

function updateControlledArm(sideName, side, pose, delta, currentTime) {
  /*
    Applies one controlled arm pose.

    getControlledArmPoseTargets() decides what the named pose should look like.
    This function only finds the live joints and damps them toward those target
    rotations, which keeps pose design separate from frame-by-frame plumbing.

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
  const targets = getControlledArmPoseTargets(
    sideName,
    side,
    pose,
    currentTime,
  );

  dampJointRotation(shoulder, targets.shoulder, delta, rigTuning.damping);
  dampJointRotation(elbow, targets.elbow, delta, rigTuning.damping);
  dampJointRotation(wrist, targets.wrist, delta, rigTuning.damping);
  dampJointRotation(palm, targets.palm, delta, rigTuning.damping);
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

function handleDevProbePointerDown(event) {
  /*
    TEMP / DEV MODE mouse drag start for devProbe.

    This is deliberately separate from handleJointEditPointerDown():
      - joint dragging edits skeleton pivot data
      - probe dragging edits only devProbeX/Y/Z

    Both systems use the same Three.js idea:
      1. raycast from the camera through the mouse
      2. find the clicked object
      3. create a camera-facing drag plane
      4. convert dragged world points into the desired local space
  */
  if (
    event.defaultPrevented ||
    !rigTuning.devProbeVisible ||
    !state.devProbe.mesh ||
    !state.skeleton?.root
  ) {
    return;
  }

  state.devProbe.raycaster.setFromCamera(getScenePointer(event), camera);
  const intersections = state.devProbe.raycaster.intersectObject(
    state.devProbe.mesh,
    false,
  );

  if (!intersections.length) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation?.();
  sceneContainer.setPointerCapture?.(event.pointerId);

  state.skeleton.root.updateMatrixWorld(true);
  state.devProbe.group.getWorldPosition(state.devProbe.dragStartWorld);
  state.devProbe.dragStartLocal.copy(state.devProbe.group.position);

  const cameraNormal = new THREE.Vector3();
  camera.getWorldDirection(cameraNormal).normalize();
  state.devProbe.dragPlane.setFromNormalAndCoplanarPoint(
    cameraNormal,
    state.devProbe.dragStartWorld,
  );

  state.devProbe.raycaster.ray.intersectPlane(
    state.devProbe.dragPlane,
    state.devProbe.dragCurrentWorld,
  );

  state.devProbe.dragStartRootLocal.copy(state.devProbe.dragCurrentWorld);
  state.skeleton.root.worldToLocal(state.devProbe.dragStartRootLocal);
  state.devProbe.dragging = true;
}

function handleDevProbePointerMove(event) {
  /*
    Drags devProbe along the camera-facing plane.

    Formula:
      currentRootLocal = root.worldToLocal(currentWorldPoint)
      localDelta       = currentRootLocal - dragStartRootLocal
      desiredLocal     = dragStartLocal + localDelta

    desiredLocal is then stored in rigTuning.devProbeX/Y/Z so GUI sliders,
    keyboard movement, copy/log, and mouse drag all share the same source data.
  */
  if (!state.devProbe.dragging || !state.skeleton?.root) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation?.();
  state.devProbe.raycaster.setFromCamera(getScenePointer(event), camera);

  const hit = state.devProbe.raycaster.ray.intersectPlane(
    state.devProbe.dragPlane,
    state.devProbe.dragCurrentWorld,
  );

  if (!hit) {
    return;
  }

  state.devProbe.dragCurrentRootLocal.copy(state.devProbe.dragCurrentWorld);
  state.skeleton.root.worldToLocal(state.devProbe.dragCurrentRootLocal);

  const localDelta = state.devProbe.dragCurrentRootLocal
    .clone()
    .sub(state.devProbe.dragStartRootLocal);
  const desiredLocal = state.devProbe.dragStartLocal.clone().add(localDelta);

  rigTuning.devProbeX = THREE.MathUtils.clamp(
    desiredLocal.x,
    DEV_PROBE_TWEAKS.min,
    DEV_PROBE_TWEAKS.max,
  );
  rigTuning.devProbeY = THREE.MathUtils.clamp(
    desiredLocal.y,
    DEV_PROBE_TWEAKS.min,
    DEV_PROBE_TWEAKS.max,
  );
  rigTuning.devProbeZ = THREE.MathUtils.clamp(
    desiredLocal.z,
    DEV_PROBE_TWEAKS.min,
    DEV_PROBE_TWEAKS.max,
  );

  applyDevProbePosition();
  updateGuiDisplays();
}

function handleDevProbePointerUp(event) {
  if (!state.devProbe.dragging) {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation?.();
  state.devProbe.dragging = false;
  sceneContainer.releasePointerCapture?.(event.pointerId);
  logDevProbeValues();
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
  if (event.defaultPrevented) {
    return;
  }

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
    G53 "hold child points" records descendant positions before the selected
    joint starts moving. During pointermove, those descendants can then be
    written back to the same rig-local locations by changing their local offsets.

    This makes pivot placement feel like moving independent layout points while
    still storing the final result in the real parent-child skeleton.
  */
  state.skeleton.root.updateMatrixWorld(true);
  mouseJointEditor.preservedDescendantRootLocals =
    captureG53PreservedDescendantRootLocals(joint);

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

function applyG53AxisLocksToDesiredLocal(desiredLocal, dragStartLocal) {
  /*
    TEMP / DEV PRECISION RIGGING: G53 axis locks.

    WHY THIS EXISTS:
      In a 3D scene viewed through a 2D screen, a mouse drag can accidentally
      introduce movement on an axis that is hard to see from the current camera
      angle. That is especially annoying during rigging, because a tiny unseen
      Z drift can spoil a carefully placed X/Y joint.

    WHEN IT RUNS:
      Only while G53 machine-home rigging mode is active. Outside G53 mode,
      mouse point editing behaves exactly like it did before this feature.

    FORMULA:
      finalAxis = allowAxis ? desiredAxis : dragStartAxis

      where:
        desiredAxis   = the local coordinate produced by the mouse drag
        dragStartAxis = the local coordinate the joint had when the click began
        allowAxis     = the checkbox value in G53 Rigging Mode

    EXAMPLE:
      If "allow X" is on and "allow Y/Z" are off, the pointer may still move
      across the screen freely, but only desiredLocal.x is allowed to change.
      desiredLocal.y and desiredLocal.z are restored to their drag-start values
      before offsets are calculated.

    MUTATION NOTE:
      This function intentionally edits desiredLocal in place. The caller then
      uses that one corrected vector to calculate saved joint offsets.
  */
  if (!state.g53RiggingMode.active) {
    return desiredLocal;
  }

  if (!rigTuning.g53AllowX) {
    desiredLocal.x = dragStartLocal.x;
  }

  if (!rigTuning.g53AllowY) {
    desiredLocal.y = dragStartLocal.y;
  }

  if (!rigTuning.g53AllowZ) {
    desiredLocal.z = dragStartLocal.z;
  }

  return desiredLocal;
}

function captureG53PreservedDescendantRootLocals(selectedJoint) {
  /*
    Captures where the selected joint's descendants are at drag start, measured
    in skeleton-root local space.

    This is only used when:
      - G53 rigging mode is active
      - "hold child points" is enabled

    WHY ROOT-LOCAL SPACE:
      World space includes the player's current scene position and yaw. Root-local
      space strips that away and gives us "coordinates on the workpiece," which
      is the machinist-friendly coordinate system for rigging.

    WHAT GETS STORED:
      [
        { jointKey: "leftElbow", rootLocal: Vector3, depth: 1 },
        { jointKey: "leftWrist", rootLocal: Vector3, depth: 2 },
        ...
      ]

    Descendants are sorted parent-first so compensation is stable:
      shoulder compensation runs before elbow compensation,
      elbow compensation runs before wrist compensation,
      and so on.
  */
  if (!state.g53RiggingMode.active || !rigTuning.g53PreserveChildPoints) {
    return [];
  }

  const root = state.skeleton?.root;

  if (!selectedJoint || !root) {
    return [];
  }

  const jointKeyByObject = new Map(
    Object.entries(state.skeleton.joints).map(([key, joint]) => [joint, key]),
  );
  const preserved = [];
  const worldPosition = new THREE.Vector3();

  function visitDescendant(joint, depth) {
    if (!joint.userData.isPuppetJoint) {
      return;
    }

    const jointKey = jointKeyByObject.get(joint);

    if (jointKey && JOINT_ORDER.includes(jointKey)) {
      joint.getWorldPosition(worldPosition);
      preserved.push({
        jointKey,
        rootLocal: root.worldToLocal(worldPosition.clone()),
        depth,
      });
    }

    joint.children.forEach((child) => {
      visitDescendant(child, depth + 1);
    });
  }

  selectedJoint.children.forEach((child) => {
    visitDescendant(child, 1);
  });

  return preserved.sort((a, b) => a.depth - b.depth);
}

function applyG53PreservedDescendantRootLocals() {
  /*
    Keeps child points visually fixed while their parent point is dragged.

    THE PROBLEM THIS SOLVES:
      In a normal skeleton, moving a parent joint carries every child joint. That
      is exactly what we want during animation, but it feels too rigid during
      mesh fitting. When placing pivots, you often want to move the shoulder
      socket without dragging the elbow/wrist points you already placed.

    THE IDEA:
      During pointerdown, capture each descendant's root-local coordinate.
      During pointermove, after the selected parent joint moves, convert each
      captured root-local coordinate back into the descendant's CURRENT parent
      space and save that as a new local offset.

    FORMULA FOR EACH PRESERVED DESCENDANT:
      desiredWorld       = skeletonRoot.localToWorld(savedRootLocal)
      desiredParentLocal = descendant.parent.worldToLocal(desiredWorld)
      offset             = desiredParentLocal - baseBindLocalPosition

    The hierarchy is still real. We are not deleting parent-child relationships.
    We are simply recalculating child local positions so the final bind pose
    matches the geometry you placed on screen.
  */
  if (
    !state.g53RiggingMode.active ||
    !rigTuning.g53PreserveChildPoints ||
    !mouseJointEditor.preservedDescendantRootLocals.length
  ) {
    return;
  }

  const root = state.skeleton?.root;

  if (!root) {
    return;
  }

  mouseJointEditor.preservedDescendantRootLocals.forEach(
    ({ jointKey, rootLocal }) => {
      const joint = state.skeleton.joints[jointKey];

      if (!joint?.parent) {
        return;
      }

      const desiredParentLocal = root.localToWorld(rootLocal.clone());

      joint.parent.worldToLocal(desiredParentLocal);
      setJointPointOffsetFromLocalPosition(jointKey, desiredParentLocal);

      /*
        Update immediately because later descendants may use this joint as their
        parent. Example: after preserving the elbow, the wrist conversion needs
        the elbow's fresh matrixWorld.
      */
      root.updateMatrixWorld(true);
    },
  );

  state.debugView?.refreshBones?.();
  updateAxisMarkerAttachment();
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

  if (
    event.defaultPrevented ||
    !mouseJointEditor.dragging ||
    !mouseJointEditor.selectedJointKey
  ) {
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
    G53 axis locks happen before offset math. That means the locked coordinate
    never gets saved into rigTuning in the first place; the prevented movement is
    not merely hidden on screen.
  */
  applyG53AxisLocksToDesiredLocal(
    desiredLocal,
    mouseJointEditor.dragStartLocal,
  );

  setJointPointOffsetFromLocalPosition(
    mouseJointEditor.selectedJointKey,
    desiredLocal,
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
  applyG53PreservedDescendantRootLocals();
  state.skeleton.root.updateMatrixWorld(true);

  syncImportedSkinToPuppet();
  updateGuiDisplays();
}

function handleJointEditPointerUp(event) {
  if (!mouseJointEditor.dragging) {
    return;
  }

  mouseJointEditor.dragging = false;
  mouseJointEditor.preservedDescendantRootLocals = [];
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

function handleG53HotkeyCapture(event) {
  /*
    Capture-phase safety net for F2.

    WHY THIS EXISTS:
      The normal handleKeyDown() listener runs during the bubbling phase. That is
      fine while the canvas has focus, but after using the file picker or certain
      lil-gui controls, the focused UI element/browser layer may intercept
      function keys before the bubbling listener receives them.

    F2 is important enough to treat like an emergency machine-home switch:
      - catch it early in the capture phase
      - prevent browser/default UI behavior
      - stop it from reaching the bubbling handleKeyDown() and toggling twice

    This function ONLY handles F2. Regular movement, combat, devProbe, and other
    keys still go through the existing handleKeyDown() path.
  */
  if (event.code !== "F2") {
    return;
  }

  event.preventDefault();
  event.stopImmediatePropagation();

  if (!event.repeat) {
    toggleG53RiggingMode();
  }
}

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
      1     = equip sword and enter combat stance
      2     = despawn sword and return arms to idle
      Enter = sword swing / combat hit attempt
      F2    = toggle G53 machine-home rigging mode
      Y     = toggle TEMP devProbe marker
      Shift + J/L = move devProbe local X
      Shift + U/O = move devProbe local Y
      Shift + I/K = move devProbe local Z
  */
  if (event.code === "F2") {
    event.preventDefault();

    if (!event.repeat) {
      toggleG53RiggingMode();
    }

    return;
  }

  if (handleDevProbeKeyboard(event)) {
    return;
  }

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
  } else if (event.code === "Digit1") {
    equipSword();
  } else if (event.code === "Digit2") {
    despawnSword();
  } else if (event.code === "Enter" || event.code === "NumpadEnter") {
    startSwordSwing();
  } else if (event.code === "KeyY") {
    toggleDevProbe();
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

window.addEventListener("keydown", handleG53HotkeyCapture, { capture: true });
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("resize", resizeRendererToContainer);
sceneContainer.addEventListener("wheel", handleWheelZoom, { passive: false });
sceneContainer.addEventListener("pointerdown", handleDevProbePointerDown);
sceneContainer.addEventListener("pointermove", handleDevProbePointerMove);
sceneContainer.addEventListener("pointerup", handleDevProbePointerUp);
sceneContainer.addEventListener("pointercancel", handleDevProbePointerUp);
sceneContainer.addEventListener("pointerdown", handleJointEditPointerDown);
sceneContainer.addEventListener("pointermove", handleJointEditPointerMove);
sceneContainer.addEventListener("pointerup", handleJointEditPointerUp);
sceneContainer.addEventListener("pointercancel", handleJointEditPointerUp);

requestAnimationFrame(animate);
