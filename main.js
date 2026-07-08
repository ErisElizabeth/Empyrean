import * as THREE from "three";
import GUI from "lil-gui";
import { ENCOUNTER_DEFINITIONS } from "./encounters.js";
import { createEmpyreanAudioManager } from "./audioManager.js";
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
  getPelvisRunValues as getPhysicsPelvisRunValues,
  getPelvisWalkValues as getPhysicsPelvisWalkValues,
  getRunStrideValues as getPhysicsRunStrideValues,
  smoothstep as physicsSmoothstep,
  updateJumpState,
} from "./physics.js";
import {
  getMoonHemisphereFromLatitude,
  getMoonPhase,
} from "./moonPhase.js?v=0.2.14-alpha";
import {
  DEFAULT_RIG_DIMENSIONS,
  HEAD_MARKER_SIZE_RANGE,
  RIG_DIMENSION_CONTROLS,
  createRig,
  createSkeleton,
} from "./rig.js";
import {
  createPuppetRigPackage,
  deletePuppetRigPackageFromLibrary,
  extractRigTuningFromPackage,
  getPuppetRigLibrarySnapshot,
  getPuppetRigLibraryNames,
  importPuppetRigLibrarySnapshot,
  loadPuppetRigPackageFromLibrary,
  normalizePuppetRigName,
  parsePuppetRigPackageText,
  savePuppetRigPackageToLibrary,
  serializePuppetRigPackage,
  summarizePuppetRigPackage,
} from "./puppetShop.js";
import {
  GUIDE_COLOR,
  applySkyMoonPhasePresentation,
  applyWorldAtmosphere,
  buildExplorationWorld,
  buildGhostSpheres,
  buildLighting,
  buildSkyMoon,
  createWorldSkyCycleController,
  createEncounterRuntime,
  createWorldDebugView,
  disposeObjectTree,
  getEncounterCenter,
  getEncounterRect,
  getDefaultSkyMoonColor,
  isControlPositionValid,
  makeLabelSprite,
  moveRigWithCollision,
  resolveRigRoomCollision,
  tickEncounterSystem,
  updateGhostSphereMotion,
  updateSkyMoonCameraAnchor,
  worldCollision,
  worldTerrain,
} from "./world.js?v=0.2.14-alpha";
import { updateLocomotion } from "./movementEngine.js?v=0.2.14-alpha";
import { isWalkableTerrainHit } from "./terrain.js?v=0.2.14-alpha";
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
  bindRiggedSkinFromPath,
  syncSkinToSkeleton,
} from "./skin.js?v=0.2.14-alpha";
import {
  EntityRole,
  createPlayerEntity,
  createEntityFactories,
} from "./entity.js";
import {
  createKeyboardController,
  createStaticController,
} from "./entityControllers.js";
import {
  SWORD_OFFSET_LIMITS,
  SWORD_TWEAKS,
  createSwordController,
  createSwordPresetState,
  createSwordRuntimeState,
  isLegacySwordDefaultTuning,
  makeDefaultSwordRigTuning,
  sanitizeSwordPresetValues,
} from "./sword.js";

const APP_VERSION = "0.2.14-alpha";
const THREE_VERSION_PIN = "0.164.1";

//=============================================================
// SOLO TWEAK ZONE
//=============================================================
/*
  This is the "I have twenty minutes and want to safely experiment" section.

  Most player/camera/audio values a solo builder is likely to change are grouped
  here so you do not have to hunt through the entire file. World atmosphere
  colors now live in world.js, because sky/fog/grass/light palettes need to
  evolve together for the future day/night/weather system.

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
    moveSpeed: 1.9375,

    // runSpeed is used while holding Shift and moving forward.
    // It is paired with runPhaseSpeed below so the feet cycle faster when the
    // player crosses the room faster.
    runSpeed: 3.375,

    // walkPhaseSpeed is how quickly the leg cycle advances while walking.
    walkPhaseSpeed: 8.0,

    // runPhaseSpeed is how quickly the leg cycle advances while running.
    // Higher values mean faster turnover: more steps per second.
    runPhaseSpeed: 12.25,

    // Run blend damping: high values give a snappy athletic shift into sprint
    // while still avoiding a one-frame pose cliff.
    runBlendRiseDamping: 20,
    runBlendFallDamping: 14,

    // Turn anticipation/banking reads smoothed yaw velocity rather than raw
    // key/mouse input so mouse-look spikes do not snap the upper body.
    turnVelocityDamping: 18,
    maxTurnVelocity: Math.PI * 1.85,
    turnHeadYaw: 0.24,
    turnNeckYaw: 0.14,
    turnChestYaw: 0.09,
    turnBankRoll: 0.13,

    // Terrain height is sampled after X/Z collision accepts a move.
    maxStepUp: 0.35,
    terrainDropSpeed: 7.0,
  },

  camera: {
    startDistance: 6.6,
    startHeight: 2.6,
    /*
      The far clip must stay beyond every part of the physical sky enclosure.

      Current worst-case sight line:
        outside diagonal = sqrt(384^2 + 384^2 + 75^2) ~= 548.2
        max camera orbit = 30
        required far clip ~= 578.2

      640 leaves modest headroom without using an unnecessarily huge depth
      range. The old value of 160 came from the smaller 96-unit world. After the
      outside enclosure grew to 384 units, walls beyond 160 were clipped and
      exposed the flat scene.background behind the three-color gradient shell.
    */
    farClip: 640,
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

    // Lurch damping for the "return to behind" behavior after the player starts
    // walking/running. Higher = catches up faster. Tuned so the camera takes
    // ~0.6s to noticeably recenter, not so fast it feels like a snap.
    lurchDamping: 1.5,

    // RMB-held mouse controls (gated by controlState.mouseLookActive).
    // Sensitivity is per-pixel of pointer movement.
    mouseTurnSensitivity: 0.003, // player yaw (mirrors A/D direction)
    mousePitchSensitivity: 0.002, // camera pitch (look up/down)
    mouseInvertY: false, // false: forward = look up at sky
    maxPitch: Math.PI / 3, // ~60deg; prevents flipping over the top

    // RMB-held mouse wheel orbits instead of zooming.
    wheelOrbitSpeed: 0.45,
  },

  audio: {
    // Browsers often block autoplay until the user interacts with the page.
    // The play() call below catches that gracefully so the console stays clean.
    backgroundPath: "assets/ambient.ogg",
    loop: true,
    autoplay: true,
  },
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

    Current scope:
      - entered directly by the Rigging Wizard/F2 wrapper or by manual GUI button
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
      spheres, and the sky moon are hidden because they are useful for gameplay mood
      but not for precision rig setup.
    */
    floorOpacity: 0.06,
    wallOpacity: 0,
    ceilingOpacity: 0,
    treeOpacity: 0,
    hideGhostSpheres: true,
    hideSkyMoon: true,
  },
};

const FACING_MIGRATION_EPSILON = 0.01;
// Tolerance for migrating older saved rig packages with pre-fixture-zero yaw.

//=============================================================
// LOADER OVERLAY LOGIC BEGIN
// NOTE:
// This project used "workshop" first and "lab" later.
// For now, "lab" in this loader means the visible Empyrean Puppet Workshop UI.
//=============================================================

const loaderOverlay = document.getElementById("loader-overlay");
const TITLE_CARD_MIN_VISIBLE_MS = 1600;
const TITLE_CARD_SETTLE_FRAMES = 18;
const TITLE_CARD_FADE_MS = 750;
const titleCardStartedAt = performance.now();
let titleCardIsActive = Boolean(loaderOverlay);
let skyCycleSuspendedByDocument = document.hidden;

function finishTitleCardStartup() {
  /*
    Production sky-cycle datum:

      cycle time zero = title card fully faded

    The scene always initializes at night, but the first 120-second hold should
    belong to visible gameplay, not be partially consumed behind EMPYREAN.
  */
  if (!titleCardIsActive) {
    return;
  }

  titleCardIsActive = false;
  requestMoonHemisphereFromBrowser();
  const snapshot = skyCycleController?.getSnapshot();
  console.info(
    `[sky] title card complete; production cycle clock started at ${Math.round(snapshot?.phaseElapsed || 0)}ms`,
  );
}

function revealWorkshop() {
  /*
    The title card is the curtain.

    It should stay up long enough that the viewer can tell the app is loading,
    and long enough that first-frame rig corrections happen behind it. The
    minimum time gives the EMPYREAN gradient animation room to breathe. The
    settle-frame countdown below gives Three.js several rendered frames to apply
    matrix updates, bind pose corrections, debug bone refresh, and any damped
    startup alignment before the scene is revealed.
  */
  const elapsed = performance.now() - titleCardStartedAt;
  const remaining = Math.max(0, TITLE_CARD_MIN_VISIBLE_MS - elapsed);

  setTimeout(() => {
    if (!loaderOverlay) {
      finishTitleCardStartup();
      return;
    }

    loaderOverlay.setAttribute("aria-busy", "false");
    loaderOverlay.classList.add("loader-hidden");
    setTimeout(finishTitleCardStartup, TITLE_CARD_FADE_MS);
  }, remaining);
}

function waitForTitleCardSettleFrames(framesRemaining) {
  if (framesRemaining <= 0) {
    revealWorkshop();
    return;
  }

  requestAnimationFrame(() => {
    waitForTitleCardSettleFrames(framesRemaining - 1);
  });
}

function initWorkshopLoader() {
  try {
    /*
      Important:
        This function is called at the END of startup, after the world, skeleton,
        GUI, event listeners, and first animation request have been created.

      Earlier versions called it near the top of main.js. That made the overlay
      disappear before the first bind-pose leg corrections were visually done,
      so the user saw the lower legs rotate after the title card ended. Now the
      title card waits for a short stack of animation frames before fading.
    */
    loaderOverlay?.setAttribute("aria-busy", "true");
    waitForTitleCardSettleFrames(TITLE_CARD_SETTLE_FRAMES);
  } catch (err) {
    console.error("Workshop initialization failed", err);
    revealWorkshop();
  }
}

//=============================================================
// LOADER OVERLAY LOGIC END
//=============================================================
//initLab();

//=============================================================
// AUDIO MANAGER
//=============================================================
/*
  audioManager.js owns the actual browser Audio elements now.

  main.js still decides the startup track path from SOLO_TWEAKS, but it no
  longer directly creates or fades audio. Combat and encounter zones call the
  manager through clean functions instead of mutating Audio elements.
*/
const empyreanAudio = createEmpyreanAudioManager({
  ambientPath: SOLO_TWEAKS.audio.backgroundPath,
  ambientLoop: SOLO_TWEAKS.audio.loop,
  autoplay: SOLO_TWEAKS.audio.autoplay,
});

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
const PROJECT_DEFAULT_PLAYER_RIG_PATH = "assets/rigs/player.default.rig.json";

// Slider ranges. These are intentionally broad because the rig lab should be
// able to accommodate strange proportions, not only "normal" humanoids.
const ROOT_ALIGNMENT_RANGE = { min: -6, max: 6, step: 0.005 };
const JOINT_POINT_OFFSET_RANGE = { min: -4, max: 4, step: 0.005 };
const BIND_ROTATION_RANGE = { min: -Math.PI, max: Math.PI, step: 0.005 };
const AXIS_MARKER_SCALE_RANGE = { min: 0.03, max: 3, step: 0.01 };

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
    generated skin weights line up with the imported GLB. These are the arm
    joints whose bind/reference rotations may hold that modeling pose.

    Important ownership rule:
      - Do not erase these automatically when rigging exits.
      - Visible gameplay poses compensate for them when needed.

    That lets the calibrated skeleton keep its T/A reference while the player
    can still visibly drop into relaxed, guard, run, or swing poses.
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
  "headMarkerSize",
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
  "swordGripX",
  "swordGripY",
  "swordGripZ",
  "swordOffsetX",
  "swordOffsetY",
  "swordOffsetZ",
  "swordPitch",
  "swordYaw",
  "swordRoll",
  "puppetRigName",
  "puppetRigNotes",
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
  "runAmplitude",
  "runStrideLength",
  "runFootLift",
  "runBounce",
  "runForwardLean",
  "runArmPump",
  "runHipTwist",
  "runShoulderTwist",
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

const camera = new THREE.PerspectiveCamera(
  42,
  sceneContainer.clientWidth / sceneContainer.clientHeight,
  0.1,
  SOLO_TWEAKS.camera.farClip,
);
const explorationWorld = buildExplorationWorld();
scene.add(explorationWorld.group);
const ghostSpheres = buildGhostSpheres();
ghostSpheres.forEach((sphere) => scene.add(sphere.group));

//-------------------------------------------------------------
//-------------------------------------------------------------
// WORLD-OWNED SKY FOCAL POINT
const skyMoon = buildSkyMoon();
scene.add(skyMoon);
let worldLighting = null;
let skyCycleController = null;

const MOON_PHASE_REFRESH_MS = 60 * 60 * 1000;
const MOON_GEOLOCATION_OPTIONS = Object.freeze({
  enableHighAccuracy: false,
  timeout: 8000,
  maximumAge: 24 * 60 * 60 * 1000,
});
const lunarRuntime = {
  hemisphere: "northern",
  current: null,
  lastRefreshUtcMs: 0,
  refreshTimerId: null,
  locationRequested: false,
};

function refreshMoonPhasePresentation(currentDate = new Date()) {
  const moonState = getMoonPhase(currentDate, lunarRuntime.hemisphere);

  lunarRuntime.current = moonState;
  lunarRuntime.lastRefreshUtcMs = Date.now();
  applySkyMoonPhasePresentation(skyMoon, moonState);
  return moonState;
}

function refreshMoonPhaseIfStale() {
  if (Date.now() - lunarRuntime.lastRefreshUtcMs >= MOON_PHASE_REFRESH_MS) {
    refreshMoonPhasePresentation();
  }
}

function requestMoonHemisphereFromBrowser() {
  /*
    Privacy boundary:
      - request low-accuracy cached location at most once per page lifetime
      - read latitude only long enough to derive its sign
      - retain only "northern" or "southern"
      - never retain, log, serialize, or display coordinates
  */
  if (lunarRuntime.locationRequested) {
    return;
  }

  lunarRuntime.locationRequested = true;

  if (!navigator.geolocation) {
    console.info("[moon] geolocation unavailable; northern fallback retained");
    return;
  }

  try {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = position?.coords?.latitude;

        if (!Number.isFinite(latitude)) {
          console.info(
            "[moon] geolocation returned no usable latitude; northern fallback retained",
          );
          return;
      }

      lunarRuntime.hemisphere = getMoonHemisphereFromLatitude(latitude);
      refreshMoonPhasePresentation();
        console.info(
          `[moon] ${lunarRuntime.hemisphere} presentation selected from browser geolocation`,
        );
      },
      (error) => {
        console.info(
          `[moon] geolocation unavailable (${error?.code ?? "unknown"}); northern fallback retained`,
        );
      },
      MOON_GEOLOCATION_OPTIONS,
    );
  } catch {
    console.info(
      "[moon] geolocation request blocked; northern fallback retained",
    );
  }
}

function initMoonPhaseRuntime() {
  const initialState = refreshMoonPhasePresentation();

  lunarRuntime.refreshTimerId = window.setInterval(
    refreshMoonPhasePresentation,
    MOON_PHASE_REFRESH_MS,
  );

  if (!titleCardIsActive) {
    requestMoonHemisphereFromBrowser();
  }

  console.info(
    `[moon] ${initialState.phaseName}; ${Math.round(initialState.illumination * 100)}% illuminated; northern fallback active`,
  );
}

const rigHeightDisk = buildRigHeightDisk();
scene.add(rigHeightDisk);

// ======================================================
// WORLD / ROOM / OUTSIDE HELPERS
// ======================================================

function buildRigHeightDisk() {
  /*
    Creates a 5% opacity wireframe disk at the live rig's head-pivot height.

    Purpose:
      A visual height gauge while changing base proportions or calibration
      offsets. updateRigHeightDisk() moves it to the current head pivot instead
      of leaving it permanently at the hardcoded default height.

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

  disk.name = "live-rig-height-wire-disk";
  disk.position.set(0, DEFAULT_RIG_DIMENSIONS.headY, 0);
  disk.rotation.x = Math.PI / 2;
  disk.renderOrder = 8;
  return disk;
}

function updateRigHeightDisk() {
  /*
    Keeps the height gauge aligned with the current calibrated head pivot.

    Base dimension controls establish the authored joint chain. Joint Point
    Offsets can then move any link in that chain. Reading the final head point
    in root-local space includes both layers without confusing world movement,
    player yaw, or root alignment with body height.
  */
  const root = state.skeleton?.root;
  const head = state.skeleton?.joints?.head;

  if (!root || !head) {
    rigHeightDisk.position.y = rigTuning?.headY ?? DEFAULT_RIG_DIMENSIONS.headY;
    return;
  }

  root.updateMatrixWorld(true);
  const headWorld = head.getWorldPosition(new THREE.Vector3());
  const headRootLocal = root.worldToLocal(headWorld);
  rigHeightDisk.position.y = headRootLocal.y;
}

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(sceneContainer.clientWidth, sceneContainer.clientHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
sceneContainer.appendChild(renderer.domElement);
applyWorldAtmosphere(scene, renderer);

const clock = new THREE.Clock();
/*
  Core player rig persistence rule:
    startup begins from the hardcoded defaults, then tries to apply the real
    project-owned default package at PROJECT_DEFAULT_PLAYER_RIG_PATH.

  Browser localStorage is still useful as a scratchpad, but it is no longer the
  silent source of truth for the player rig on page load.
*/
const rigTuning = sanitizeRigTuning(makeDefaultRigTuning());

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
  puppetShop: {
    /*
      Puppet Shop is the rig/library side of the project.

      Gameplay asks "where is the player and what are they doing?"
      Puppet Shop asks "what reusable skeleton/mesh/motion setup is this?"

      status is GUI-facing text only. Important rigs should live as JSON files
      in the project. Browser localStorage remains a temporary shelf through
      puppetShop.js, not the only copy.
    */
    status: "startup will load project default rig",
    readoutControllers: [],
  },
  riggingWizard: {
    /*
      Guided wrapper around the existing rigging pipeline.

      This object does not own skinning, G53, saved packages, or NPC spawning.
      It only tracks the operator-facing step/readouts so F2 can open a
      machinist-friendly flow instead of making the user remember every folder.
    */
    active: false,
    step: "idle",
    status: "F2 opens the Rigging Wizard.",
    meshPath: "",
    persistence: "",
    selectedFileName: "",
    readoutControllers: [],
  },
  importedPreview: null,
  importedSkin: null,
  importedMeshStatus: "no mesh loaded",
  /*
    meshBlobUrl holds the object URL created when a user browses for a local
    file using the "open file…" button. It is separate from
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
  sword: createSwordRuntimeState(),
  swordPreset: createSwordPresetState(),
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
    Temporary arm-rest snapshot for older rigging start-pose workflows.

    v0.1.51 split two ideas that used to be tangled:
      rig calibration = pivot points and bind/reference rotations
      visible pose    = the live gameplay arm shape layered on top

    We keep this snapshot for manual recovery tools, but normal G53 exit no
    longer restores it automatically. A T/A bind reference can remain as part
    of calibration while visible gameplay arms are relaxed by animation deltas.
  */
  runtimeArmBindRotationBackup: null,
  /*
    Set by the "2 rig mesh" workflow while G53 is active.

    Some rigging paths are synchronous because a preview is already loaded; some
    are asynchronous because GLTFLoader still has to fetch the mesh. Rather than
    guessing which path we are on, skin.js now tells us when binding actually
    finishes. This flag lets that completion callback know whether it should
    leave G53 mode after committing calibration and relaxing the visible arms.
  */
  exitG53AfterImportedMeshRig: false,
  /*
    Read-only mirror of the world-owned sky-cycle controller.

    world.js owns phase timing, gradient colors, fog, and light interpolation.
    main.js mirrors only the values needed to hide/show moon-owned scene objects
    and to let G53 temporarily suppress presentation without resetting the sky.
  */
  skyCycle: {
    phase: "holdStable",
    stableState: "night",
    targetState: "night",
    dayBlend: 0,
    nightInfluence: 1,
    transitionSource: "startup",
  },
};

await loadProjectDefaultPlayerRig();

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
  groundY: 0,
  walkPhase: 0,
  isWalking: false,
  isRunning: false,
  runBlendWeight: 0,
  turnVelocity: 0,
  turnVelocitySampleYaw: 0,
  actualMoveSpeed: 0,
  cameraYaw: 0,
  cameraDistance: SOLO_TWEAKS.camera.startDistance,
  cameraHeight: SOLO_TWEAKS.camera.startHeight,
  // cameraPitch: third-person camera tilt. 0 = horizontal orbit (legacy
  // behavior), positive = camera above target / looking down, negative =
  // camera below target / looking up at sky. Clamped to +/-maxPitch.
  cameraPitch: 0,
  // mouseLookActive: set true while right mouse button is held in the scene.
  // Gates pointer-driven yaw/pitch input AND switches scroll wheel from zoom
  // to orbit. Reset on RMB release, pointer cancel, or pointer leaving the
  // scene container.
  mouseLookActive: false,
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

const swordController = createSwordController({
  appVersion: APP_VERSION,
  rigTuning,
  runtime: state.sword,
  presetState: state.swordPreset,
  getRightPalm: () => state.skeleton?.joints?.rightPalm,
  isWeaponEquipped: () => controlState.weaponEquipped,
  disposeObjectTree,
  updateGuiDisplays,
});

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
const terrainRaycaster = new THREE.Raycaster();
const terrainRayDown = new THREE.Vector3(0, -1, 0);

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
  camera,
  controlState,
  rigTuning,
  audioManager: empyreanAudio,
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
    headMarkerSize: 1,
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
    ...makeDefaultSwordRigTuning(),
    puppetRigName: "Sigewynn player rig",
    puppetRigNotes: "Reusable player/NPC skeleton package.",
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
    runAmplitude: 1,
    runStrideLength: 0.58,
    runFootLift: 0.18,
    runBounce: 0.085,
    runForwardLean: 0.12,
    runArmPump: 0.72,
    runHipTwist: 0.14,
    runShoulderTwist: 0.18,
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
    Reads browser localStorage as an explicit scratchpad action.

    Important:
      Page startup no longer calls this function automatically. The default
      player rig should come from PROJECT_DEFAULT_PLAYER_RIG_PATH so clearing
      browser data cannot destroy the canonical player setup.

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

async function loadProjectDefaultPlayerRig() {
  /*
    Loads the player rig from a real project JSON file before the skeleton is
    created.

    Formula:
      startupRig = sanitize(defaults + package.rigTuning + rig.js dimensions)

    where:
      defaults          = current hardcoded safety net
      package.rigTuning = project-owned player.default.rig.json data
      rig.js dimensions = authoritative project-default base proportions

    Ownership rule:
      The project default player uses DEFAULT_RIG_DIMENSIONS from rig.js for
      its stock skeleton. The JSON still owns persistent calibration offsets,
      bind rotations, mesh setup, motion settings, and attachments. Explicitly
      loading another saved rig package still uses that package's own dimensions
      through applyPuppetRigPackage(); this override is startup-only.

    The function does not rebuild the skeleton because it runs before the first
    buildSkeletonWorkshop() call. It only prepares rigTuning so the first build
    already uses the file-backed player setup.
  */
  try {
    const response = await fetch(
      `${PROJECT_DEFAULT_PLAYER_RIG_PATH}?v=${APP_VERSION}`,
      { cache: "no-store" },
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    const payload = await response.json();
    const values = extractRigTuningFromPackage(payload);
    const packageName = normalizePuppetRigName(
      payload?.metadata?.name || values?.puppetRigName,
      rigTuning.puppetRigName,
    );

    assignRigTuningValues(
      sanitizeRigTuning({
        ...makeDefaultRigTuning(),
        ...values,
        ...DEFAULT_RIG_DIMENSIONS,
        puppetRigName: packageName,
      }),
    );

    state.puppetShop.status = `loaded project default ${summarizePuppetRigPackage(payload)}`;
    console.info(
      `[puppetShop] loaded project default rig from ${PROJECT_DEFAULT_PLAYER_RIG_PATH}`,
      payload,
    );
    return payload;
  } catch (error) {
    state.puppetShop.status = `project default rig missing; using hardcoded defaults (${PROJECT_DEFAULT_PLAYER_RIG_PATH})`;
    console.warn(
      `[puppetShop] Could not load ${PROJECT_DEFAULT_PLAYER_RIG_PATH}. ` +
        "Using hardcoded defaults; save/export a new player rig package as soon as possible.",
      error,
    );
    return null;
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

  clean.headMarkerSize = THREE.MathUtils.clamp(
    Number.isFinite(clean.headMarkerSize)
      ? clean.headMarkerSize
      : defaults.headMarkerSize,
    HEAD_MARKER_SIZE_RANGE.min,
    HEAD_MARKER_SIZE_RANGE.max,
  );

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
  Object.assign(clean, sanitizeSwordPresetValues(clean, defaults));

  if (isLegacySwordDefaultTuning(clean)) {
    Object.assign(clean, {
      swordAssetPath: defaults.swordAssetPath,
      swordTargetLength: defaults.swordTargetLength,
      swordGripFromLowerEnd: defaults.swordGripFromLowerEnd,
      swordGripX: defaults.swordGripX,
      swordGripY: defaults.swordGripY,
      swordGripZ: defaults.swordGripZ,
      swordOffsetX: defaults.swordOffsetX,
      swordOffsetY: defaults.swordOffsetY,
      swordOffsetZ: defaults.swordOffsetZ,
      swordPitch: defaults.swordPitch,
      swordYaw: defaults.swordYaw,
      swordRoll: defaults.swordRoll,
    });
    console.info(
      "[sword] migrated legacy default offsets to current defaults.",
    );
  }
  clean.puppetRigName = normalizePuppetRigName(
    clean.puppetRigName,
    defaults.puppetRigName,
  );
  clean.puppetRigNotes =
    typeof clean.puppetRigNotes === "string"
      ? clean.puppetRigNotes
      : defaults.puppetRigNotes;

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
  // The mesh is loaded as a fully rigged skin (not a static preview) because
  // the saved tuning represents a completed rigging setup, and the user's
  // expectation is that "load saved" restores the rigged player end-to-end.
  assignRigTuningValues(loadSavedRigTuning(makeDefaultRigTuning()));
  state.runtimeArmBindRotationBackup = null;
  state.walkPhase = 0;
  state.walkArmSwing = { left: 0, right: 0 };
  rebuildSkeletonWorkshop();
  if (rigTuning.importedMeshPath) {
    loadImportedMeshFromPath(rigTuning.importedMeshPath);
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
  state.walkArmSwing = { left: 0, right: 0 };
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

  state.skeleton = createRig({
    scene,
    dimensions: {
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
    },
    debugOptions: {
      markerRadius: 0.035,
      headMarkerSize: rigTuning.headMarkerSize,
      labelScale: rigTuning.labelScale,
      opacity: rigTuning.skeletonOpacity,
      color: GUIDE_COLOR,
      editableJointKeys: MOUSE_EDIT_JOINTS,
      makeLabelSprite,
    },
    configureSkeleton(skeleton) {
      state.skeleton = skeleton;
      applyJointPointOffsets();
      applyBindRotationOffsets();
    },
    beforeDebugView(skeleton) {
      state.rigCollider = createRigColliderVisual();
      skeleton.root.add(state.rigCollider);
    },
  });
  state.debugView = state.skeleton.debugView;
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

function makeSafeJsonFileName(label, fallback = "empyrean-rig") {
  /*
    Browser downloads need a simple filename, not a human sentence with spaces
    and punctuation. This keeps exported rigs easy to find and copy into
    assets/rigs later.
  */
  const base =
    (typeof label === "string" ? label : "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || fallback;

  return `${base}.json`;
}

function downloadJsonFile(fileName, payload) {
  /*
    Downloads a real JSON file through the browser.

    This is intentionally separate from localStorage. localStorage is a browser
    scratch shelf; this is the "put the setup sheet in the project folder or a
    backup drive" path.
  */
  const text =
    typeof payload === "string" ? payload : JSON.stringify(payload, null, 2);
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();

  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadPuppetRigPackageFile(packagePayload, prefix = "rig") {
  const name = normalizePuppetRigName(
    packagePayload?.metadata?.name || packagePayload?.rigTuning?.puppetRigName,
    prefix,
  );
  const fileName = makeSafeJsonFileName(`${prefix}-${name}`, prefix);

  downloadJsonFile(fileName, packagePayload);
  return fileName;
}

function exportRigPackageToConsole() {
  /*
    Exports the current workshop state as a complete puppet rig package.

    This is not a file download. It logs the object to the console and attempts
    to copy the JSON to the clipboard for easy saving elsewhere.
  */
  const payload = makeCurrentPuppetRigPackage();
  const text = serializePuppetRigPackage(payload);

  console.info("Empyrean rig package export:", payload);
  navigator.clipboard?.writeText?.(text).catch(() => null);
  updatePuppetShopStatus(`copied ${summarizePuppetRigPackage(payload)}`);
}

function exportCurrentRigPackageToFile() {
  const payload = makeCurrentPuppetRigPackage();
  const fileName = downloadPuppetRigPackageFile(payload, "current-rig");

  updatePuppetShopStatus(`downloaded ${fileName}`);
  console.info("[puppetShop] downloaded current rig package", payload);
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
    const payload = parsePuppetRigPackageText(text);

    applyPuppetRigPackage(payload);
    console.info("Imported Empyrean rig package.", payload);
  } catch (error) {
    console.error("Could not import Empyrean rig package JSON.", error);
    updatePuppetShopStatus("import failed - see console");
  }
}

function exportSelectedPuppetRigToFile() {
  /*
    Exports the named library slot if it exists. If the slot has not been saved
    to the temporary browser library yet, export the current live workshop
    package instead so the button still gives the user a real backup file.
  */
  const name = normalizePuppetRigName(rigTuning.puppetRigName);
  const saved = loadPuppetRigPackageFromLibrary(window.localStorage, name);
  const payload = saved || makeCurrentPuppetRigPackage();
  const fileName = downloadPuppetRigPackageFile(payload, "selected-rig");

  updatePuppetShopStatus(
    saved
      ? `downloaded ${fileName}`
      : `downloaded current rig as ${fileName}; no saved slot named ${name}`,
  );
  console.info("[puppetShop] downloaded selected rig package", payload);
}

function exportPuppetRigLibraryToFile() {
  const library = getPuppetRigLibrarySnapshot(window.localStorage);
  const fileName = `empyrean-rig-library-${new Date()
    .toISOString()
    .slice(0, 10)}.json`;

  downloadJsonFile(fileName, library);
  updatePuppetShopStatus(
    `downloaded ${Object.keys(library.rigs || {}).length} rig(s) to ${fileName}`,
  );
  console.info("[puppetShop] downloaded rig library", library);
}

function importPuppetRigLibraryFromFile() {
  /*
    Imports a real JSON backup into the temporary browser library.

    The chosen file can be either:
      - an exported rig library
      - a single rig package

    It merges into localStorage instead of replacing the current shelf.
  */
  const input = document.createElement("input");

  input.type = "file";
  input.accept = ".json,application/json";
  input.addEventListener(
    "change",
    async () => {
      const file = input.files?.[0];

      if (!file) {
        return;
      }

      try {
        const payload = JSON.parse(await file.text());
        const library = importPuppetRigLibrarySnapshot(
          window.localStorage,
          payload,
          { merge: true },
        );
        const names = Object.keys(library.rigs || {});

        updatePuppetShopStatus(
          `imported ${names.length} rig(s) into browser library`,
        );
        console.info("[puppetShop] imported rig library backup", library);
      } catch (error) {
        updatePuppetShopStatus("rig library import failed - see console");
        console.error("[puppetShop] rig library import failed", error);
      }
    },
    { once: true },
  );
  input.click();
}

function getImportedMeshPackageSnapshot() {
  /*
    Captures the mesh-binding side of the puppet package.

    The actual GLB bytes are not stored. A reusable package stores:
      path      = where the GLB should be loaded from
      stage     = whether the current scene has it previewed or rigged
      bindMode  = how the mesh was bound to the skeleton

    This keeps packages lightweight and portable while still telling future
    NPC/enemy builders what mesh this rig was designed around.
  */
  return {
    path: rigTuning.importedMeshPath,
    status: state.importedMeshStatus,
    stage: state.importedSkin
      ? "rigged"
      : state.importedPreview
        ? "rendered reference"
        : "not loaded",
    bindMode: state.importedSkin ? "generated position weights" : "unbound",
  };
}

function makeCurrentPuppetRigPackage() {
  /*
    Creates the reusable puppet package for the current workshop state.

    This is the one approved packaging path. Save-to-library, copy-to-clipboard,
    and old Mesh > export rig package all call this so they cannot drift apart.
  */
  return createPuppetRigPackage({
    appVersion: APP_VERSION,
    rigName: rigTuning.puppetRigName,
    notes: rigTuning.puppetRigNotes,
    rigTuning: getSavableRigTuning(),
    importedMesh: getImportedMeshPackageSnapshot(),
  });
}

function applyPuppetRigPackage(payload) {
  /*
    Applies a complete puppet rig package to the live workshop.

    Separation rule:
      puppetShop.js understands package shape and storage.
      main.js understands how to apply sanitized rigTuning to live Three.js
      joints, GUI sliders, imported mesh preview, sword attachment, and skin.

    Import sequence:
      1. Extract the rig tuning from new/old package shapes.
      2. Sanitize against the current supported rig keys.
      3. Assign values in place so lil-gui controllers remain valid.
      4. Rebuild the skeleton.
      5. Reload the referenced mesh preview if there is a path.
  */
  const values = extractRigTuningFromPackage(payload);
  const packageName = normalizePuppetRigName(
    payload?.metadata?.name || values?.puppetRigName,
    rigTuning.puppetRigName,
  );

  assignRigTuningValues(
    sanitizeRigTuning({
      ...rigTuning,
      ...values,
      puppetRigName: packageName,
    }),
  );
  state.runtimeArmBindRotationBackup = null;
  state.walkPhase = 0;
  state.walkArmSwing = { left: 0, right: 0 };
  rebuildSkeletonWorkshop();
  commitRigCalibration();
  applyRelaxedVisiblePose();

  if (rigTuning.importedMeshPath) {
    /*
      Load the mesh as a fully rigged skin, not a static preview.

      Historical context: this used to call loadImportedMeshPreviewFromPath,
      which displayed the raw GLB at its modeling pose without binding to the
      skeleton. The visible result was a T-pose mesh that translated with the
      skeleton root but did not deform with arm/leg animation -- "floating
      Sigewynn impending doom" per a 2026-05-29 bug report.

      The save captures a complete rigged setup. The load should restore
      that setup, including the rigged skin. Use loadImportedMeshFromPath so
      the mesh comes back skinned and animation-driven.
    */
    loadImportedMeshFromPath(rigTuning.importedMeshPath);
  }

  updatePuppetShopStatus(`loaded ${summarizePuppetRigPackage(payload)}`);
  updateGuiDisplays();
}

function updatePuppetShopStatus(message) {
  state.puppetShop.status = message;
  state.puppetShop.readoutControllers.forEach((controller) =>
    controller.updateDisplay(),
  );
}

function saveCurrentPuppetRigToLibrary() {
  /*
    Saves the current setup as a named reusable rig.

    This is the payoff path for NPCs/enemies:
      tune one skeleton carefully,
      save it by name,
      load it later as a base for another actor.

    Persistence rule:
      localStorage is only the fast browser shelf. Every named save also
      downloads a real JSON backup so important rigs can leave the browser.
  */
  const payload = makeCurrentPuppetRigPackage();
  const saved = savePuppetRigPackageToLibrary(window.localStorage, payload);
  const fileName = downloadPuppetRigPackageFile(saved, "saved-rig");

  updatePuppetShopStatus(
    `saved ${summarizePuppetRigPackage(saved)}; downloaded ${fileName}`,
  );
  console.info("[puppetShop] saved rig package", saved);
}

function loadNamedPuppetRigFromLibrary() {
  const name = normalizePuppetRigName(rigTuning.puppetRigName);
  const payload = loadPuppetRigPackageFromLibrary(window.localStorage, name);

  if (!payload) {
    updatePuppetShopStatus(`no saved rig named ${name}`);
    console.warn("[puppetShop] no rig found in library", name);
    return;
  }

  applyPuppetRigPackage(payload);
  console.info("[puppetShop] loaded rig package", payload);
}

function deleteNamedPuppetRigFromLibrary() {
  const name = normalizePuppetRigName(rigTuning.puppetRigName);
  const deleted = deletePuppetRigPackageFromLibrary(window.localStorage, name);

  updatePuppetShopStatus(
    deleted ? `deleted ${name}` : `no saved rig named ${name}`,
  );
}

function listPuppetRigLibrary() {
  const names = getPuppetRigLibraryNames(window.localStorage);

  updatePuppetShopStatus(
    names.length ? `library: ${names.join(", ")}` : "library is empty",
  );
  console.info("[puppetShop] saved rig names", names);
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

function handleWorldDebugGuiChange() {
  /*
    lil-gui checkboxes can retain keyboard focus after a click. World Debug is
    often toggled while actively walking/testing, so hand focus back to the
    scene after the visual overlay state changes.
  */
  applyWorldDebugVisibility();
  restoreSceneKeyboardFocus();
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
                              — never changes after creation
      offset                = the value from the Joint Point Offset sliders
                              (or from a mouse drag, which writes the same value)

    After this function runs:
      - bindLocalPosition is the "desired rest position" for the joint
      - joint.position is set to that value immediately so the skeleton visually
        updates as soon as a slider or drag changes an offset

    WHY offset-from-base instead of storing an absolute position?
      An absolute position would make export/import fragile — if the base
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
  applyJointPointOffsetsTo(state.skeleton, rigTuning);
  state.debugView?.refreshBones?.();
  updateAxisMarkerAttachment();
  updateRigHeightDisk();
}

function applyJointPointOffsetsTo(skeleton, tuning) {
  /*
    Parameterized version of applyJointPointOffsets used by the entity layer.

    Same math, but operates on the passed-in skeleton + tuning instead of the
    globals. This lets entity.js spawn NPCs/enemies with their own skeletons
    and apply each entity's own jointPointOffsets without disturbing the
    player skeleton or rigTuning.

    Does NOT call state.debugView.refreshBones or updateAxisMarkerAttachment;
    those touch player-specific helpers and would be wrong for non-player
    skeletons.
  */
  if (!skeleton?.joints || !tuning?.jointPointOffsets) {
    return;
  }
  JOINT_ORDER.forEach((jointName) => {
    const joint = skeleton.joints[jointName];
    if (!joint || !joint.userData?.baseBindLocalPosition) {
      return;
    }
    const offset = tuning.jointPointOffsets[jointName] || { x: 0, y: 0, z: 0 };
    joint.userData.bindLocalPosition.copy(joint.userData.baseBindLocalPosition);
    joint.userData.bindLocalPosition.add(
      new THREE.Vector3(offset.x, offset.y, offset.z),
    );
    joint.position.copy(joint.userData.bindLocalPosition);
  });
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
  applyBindRotationOffsetsTo(state.skeleton, rigTuning);
}

function applyBindRotationOffsetsTo(skeleton, tuning) {
  /*
    Parameterized version used by the entity layer. Same math as
    applyBindRotationOffsets but on the given skeleton + tuning so each entity
    can have its own rest-pose calibration.
  */
  if (!skeleton?.joints || !tuning?.bindRotationOffsets) {
    return;
  }
  BIND_ROTATION_JOINTS.forEach((jointName) => {
    const joint = skeleton.joints[jointName];
    if (!joint) {
      return;
    }
    const offset = tuning.bindRotationOffsets[jointName] || {
      x: 0,
      y: 0,
      z: 0,
    };
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

function commitRigCalibration() {
  /*
    Commits the current rig calibration without restoring defaults.

    This is the explicit ownership boundary between "fitting the rig" and
    "posing the puppet":

      rig calibration data:
        rigTuning.jointPointOffsets  = saved pivot/control-point adjustments
        rigTuning.bindRotationOffsets = saved bind/reference orientation setup

      visible pose data:
        controlState.leftArm/rightArm and the animation pose targets

    FORMULAS:
      bindLocalPosition   = baseBindLocalPosition + jointPointOffset
      bindLocalQuaternion = baseBindLocalQuaternion * bindRotationOffset
      liveTransform       = current bind transform, ready for animation deltas

    where:
      baseBind...         = the authored skeleton from createSkeleton()
      jointPointOffset    = the values you tuned with sliders or mouse drag
      bindRotationOffset  = the T/A/current reference rotations for mesh fit

    What this deliberately does NOT do:
      - It does not call resetJointPointOffsets().
      - It does not call resetBindRotationOffsets().
      - It does not restore old/default joint positions.
      - It does not decide whether arms look relaxed, raised, or in guard.

    G53 exit calls this first so your adjusted pivot points remain the new
    calibrated skeleton. Then applyRelaxedVisiblePose() handles only the visible
    gameplay arm pose on top of that calibrated setup.
  */
  applyJointPointOffsets();
  applyBindRotationOffsets();
  resetSkeletonToBindPose();
  syncSkeletonRoot();

  if (state.skeleton?.root) {
    state.skeleton.root.rotation.y = controlState.yaw;
    state.skeleton.root.updateMatrixWorld(true);
  }

  syncImportedSkinToPuppet();
  state.debugView?.refreshBones?.();
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

function makeRelaxedArmBindRotationOffsets() {
  /*
    Canonical gameplay arm-bind rest.

    Important distinction:
      This is NOT the visible idle animation pose. It is the neutral arm bind
      rotation table that the visible pose is layered on top of.

    The actual relaxed visible arm shape lives in getControlledArmPoseTargets()
    under pose === "down". These zero bind rotations mean:

      bind/reference arm rotation = neutral authored arm chain
      gameplay "down" delta       = slight shoulder drop/outward angle,
                                    small elbow bend, relaxed wrist/palm

    Returning fresh objects matters. We never hand callers shared nested objects,
    so applying T-pose cannot mutate the canonical relaxed data by reference.
  */
  return ARM_RUNTIME_BIND_ROTATION_JOINTS.reduce((snapshot, jointName) => {
    snapshot[jointName] = { x: 0, y: 0, z: 0 };
    return snapshot;
  }, {});
}

function armRotationTableLooksLikeRiggingReference(rotations) {
  /*
    Checks a rotation table, not the live rig.

    Why:
      The bug we are hunting can happen before values reach the visible skeleton:
      a "relaxed" backup can accidentally contain the T/A shoulder rotations.
      If that polluted backup is later restored, the code _looks_ like it is
      restoring relaxed arms while actually restoring T-pose data.

    Current built-in reference poses:
      T-pose shoulder Z = +/-1.5708
      A-pose shoulder Z = +/-1.08
      relaxed bind Z    = 0

    Threshold 0.65 catches the built-in T/A setup poses while leaving tiny hand
    tuning alone.
  */
  const leftShoulder = rotations?.leftShoulder;
  const rightShoulder = rotations?.rightShoulder;
  const liftedThreshold = 0.65;

  return (
    Math.abs(leftShoulder?.z || 0) > liftedThreshold ||
    Math.abs(rightShoulder?.z || 0) > liftedThreshold
  );
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

  const capturedRotations = cloneArmBindRotationOffsets();
  const capturedLooksLikeRiggingReference =
    armRotationTableLooksLikeRiggingReference(capturedRotations);

  state.runtimeArmBindRotationBackup = {
    reason,
    rotations: capturedLooksLikeRiggingReference
      ? makeRelaxedArmBindRotationOffsets()
      : capturedRotations,
    repairedFromRiggingReference: capturedLooksLikeRiggingReference,
  };
  console.info(
    `[rig] captured relaxed arm bind rotations before ${reason}${
      capturedLooksLikeRiggingReference
        ? " (captured pose looked like T/A; using canonical relaxed arm bind)"
        : ""
    }`,
  );
}

function armBindPoseLooksLikeRiggingReference() {
  /*
    Detects whether the current arm bind/reference table is a T/A-style mesh
    fitting pose.

    We keep this deliberately narrow by looking only at the shoulder Z bind
    rotations. In the current rig, T-pose uses about +/-PI/2 at the shoulders
    and A-pose uses roughly +/-1.08. Normal relaxed arms are near zero.

    This is not a restore-defaults trigger anymore. It is only a safety check
    for getVisibleArmPoseDelta(), which needs to know when a visible gameplay
    target should compensate for a lifted bind/reference arm.
  */
  return armRotationTableLooksLikeRiggingReference(
    rigTuning.bindRotationOffsets,
  );
}

function getVisibleArmPoseDelta(jointName, visibleTargetEuler) {
  /*
    Converts a visible gameplay arm target into the animation delta that should
    be layered onto the current calibrated bind/reference pose.

    This is the missing conceptual layer from the T-pose bug.

    Before v0.1.51, the code assumed:

      finalArm = bindArm * visibleTarget

    That works only when bindArm is already the relaxed/down arm reference. It
    fails when bindArm is a useful rigging reference, such as T-pose or A-pose,
    because "down" gets added to raised arms and the player stays raised.

    What we want when the bind reference is T/A:

      finalArm = authoredBaseArm * visibleTarget

    but dampJointRotation() always evaluates:

      finalArm = authoredBaseArm * bindReference * returnedDelta

    Solve for returnedDelta:

      authoredBaseArm * bindReference * returnedDelta
        = authoredBaseArm * visibleTarget

      returnedDelta = inverse(bindReference) * visibleTarget

    where:
      bindReference = getBindRotationOffset(jointName) as a quaternion
      visibleTarget = the named pose target from getControlledArmPoseTargets()

    We only apply this correction when the arm bind table looks like one of the
    deliberate rigging reference poses. Small hand/shoulder tuning values remain
    part of the normal calibrated bind pose.
  */
  if (
    !ARM_RUNTIME_BIND_ROTATION_JOINTS.includes(jointName) ||
    !armBindPoseLooksLikeRiggingReference()
  ) {
    return visibleTargetEuler;
  }

  const bindOffset = getBindRotationOffset(jointName);

  if (
    Math.abs(bindOffset.x) < 0.000001 &&
    Math.abs(bindOffset.y) < 0.000001 &&
    Math.abs(bindOffset.z) < 0.000001
  ) {
    return visibleTargetEuler;
  }

  const bindReferenceQuaternion = new THREE.Quaternion().setFromEuler(
    new THREE.Euler(bindOffset.x, bindOffset.y, bindOffset.z),
  );
  const visibleTargetQuaternion = new THREE.Quaternion().setFromEuler(
    visibleTargetEuler,
  );
  const correctedDeltaQuaternion = bindReferenceQuaternion
    .clone()
    .invert()
    .multiply(visibleTargetQuaternion);

  return new THREE.Euler().setFromQuaternion(correctedDeltaQuaternion);
}

function clearArmControlStateForRelaxedPose() {
  /*
    Applying a relaxed visible pose is not enough if a gameplay arm command is
    still active.

    Example:
      If rightArm is "up", the immediate relaxed pose lowers the arm for one
      frame, but the next animation frame immediately adds the "up" pose delta
      and the arm goes over the head.

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

  swordController.hide();
}

function setJointRotationFromBindDelta(joint, targetEuler) {
  /*
    Immediate version of dampJointRotation().

    dampJointRotation() eases toward a target over several frames. That is good
    for ordinary animation, but bad for leaving rigging mode: the player should
    not flash in T-pose for a few frames and then slowly discover her arms.

    Formula is the same as dampJointRotation(), just without slerp:

      finalQuaternion = bindLocalQuaternion * deltaQuaternion

    where:
      bindLocalQuaternion = current rest/bind orientation
      deltaQuaternion     = visible gameplay pose offset, such as "down"
  */
  if (!joint) {
    return;
  }

  const bindQuaternion =
    joint.userData.bindLocalQuaternion || new THREE.Quaternion();
  const deltaQuaternion = new THREE.Quaternion().setFromEuler(targetEuler);
  joint.quaternion.copy(bindQuaternion.clone().multiply(deltaQuaternion));
}

function applyImmediateControlledArmPose(sideName, side, pose, currentTime) {
  /*
    Applies one named arm pose immediately using the same pose library as normal
    animation. This keeps relaxed idle, walk/run, low guard, combat, and swing
    using the same vocabulary instead of introducing a second arm-pose system.
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

  setJointRotationFromBindDelta(
    shoulder,
    getVisibleArmPoseDelta(`${sideName}Shoulder`, targets.shoulder),
  );
  setJointRotationFromBindDelta(
    elbow,
    getVisibleArmPoseDelta(`${sideName}Elbow`, targets.elbow),
  );
  setJointRotationFromBindDelta(
    wrist,
    getVisibleArmPoseDelta(`${sideName}Wrist`, targets.wrist),
  );
  setJointRotationFromBindDelta(
    palm,
    getVisibleArmPoseDelta(`${sideName}Palm`, targets.palm),
  );
}

function applyRelaxedVisiblePose() {
  /*
    Visible gameplay rest pose.

    This is the separation the project needs:

      T/A pose = rigging/reference/bind setup for imported meshes
      down     = normal visible player pose after rigging exits

    Calling this does not delete the T/A rig calibration. It only returns the
    live puppet controls and visible arm rotations to the ordinary relaxed
    player state once rigging is complete.
  */
  clearArmControlStateForRelaxedPose();
  resetWalkArmSwingState();

  const now = performance.now();
  applyImmediateControlledArmPose("left", -1, "down", now);
  applyImmediateControlledArmPose("right", 1, "down", now);

  syncImportedSkinToPuppet();
  state.debugView?.refreshBones?.();
}

function applyRelaxedIdlePose() {
  /*
    Backward-compatible name for older notes/calls. The newer name is clearer:
    "visible pose" means shoulder/elbow/wrist rotations only; it does not reset
    the calibrated joint/control point positions.
  */
  applyRelaxedVisiblePose();
}

function restoreRuntimeArmBindRotations() {
  /*
    Manual recovery tool for arm bind/reference rotations.

    Normal rigging exit no longer calls this function. It intentionally changes
    bindRotationOffsets, so it belongs in the calibration layer, not in the
    ordinary "leave rigging and lower the visible arms" path.

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
         a valid pre-rig relaxed-arm table, restore that exact snapshot.
      2. If the snapshot itself looks like T/A rigging data, reject it and
         reconstruct the relaxed arm bind table from canonical hardcoded zeros.
      3. If there is no snapshot, fall back to that canonical relaxed arm table.

    Three.js already captured the generated skin's bind matrices when
    skinnedMesh.bind(skeleton) ran, so after binding we can safely return the
    live puppet arms to the relaxed gameplay rest and let the skin deform from
    its stored modeling-pose bind into the animated pose.
  */
  const backup = state.runtimeArmBindRotationBackup;
  const backupLooksLikeRiggingReference =
    backup?.rotations &&
    armRotationTableLooksLikeRiggingReference(backup.rotations);
  const relaxedArmBindRotations = makeRelaxedArmBindRotationOffsets();
  const restoreSource =
    backup?.rotations && !backupLooksLikeRiggingReference
      ? backup.rotations
      : relaxedArmBindRotations;

  ARM_RUNTIME_BIND_ROTATION_JOINTS.forEach((jointName) => {
    Object.assign(
      getBindRotationOffset(jointName),
      restoreSource[jointName] || relaxedArmBindRotations[jointName],
    );
  });

  state.runtimeArmBindRotationBackup = null;
  updateBindRotationPose();
  applyRelaxedVisiblePose();
  syncSwordAttachment();
  updateGuiDisplays();
  console.info(
    `[rig] restored arm bind rotations to relaxed gameplay rest${
      backup && !backupLooksLikeRiggingReference
        ? ` from ${backup.reason} snapshot`
        : " from canonical relaxed defaults"
    }`,
  );
}

function handleImportedMeshRigged(details = {}) {
  /*
    Single completion hook for every successful mesh-rigging route.

    The old restore lived only in the "2 rig mesh" GUI wrapper. That meant any
    route that finished somewhere else, especially async quick-rig loading, could
    bind the mesh in a T/A start pose and then leave the live puppet there. The
    result was the classic "the mesh rigged, but gameplay arms are stuck in T"
    failure.

    New v0.1.51 rule:
      1. skin.js rigs the mesh.
      2. skin.js calls this hook.
      3. If this rig was launched from G53, leave G53 through the same commit
         path as F2.
      4. Do not restore default pivots or erase T/A bind-reference rotations.
      5. Apply relaxed visible arm rotations on top of the calibrated skeleton.

    This keeps T/A available as calibration/reference data while preventing T/A
    from becoming the visible default player pose after normal gameplay resumes.
  */
  const hadTemporaryArmPose = Boolean(state.runtimeArmBindRotationBackup);
  const shouldExitG53 =
    state.exitG53AfterImportedMeshRig && state.g53RiggingMode.active;
  const shouldRelaxVisibleGameplayArms =
    hadTemporaryArmPose || armBindPoseLooksLikeRiggingReference();

  if (shouldExitG53) {
    exitG53RiggingMode();
  } else if (shouldRelaxVisibleGameplayArms) {
    commitRigCalibration();
    applyRelaxedVisiblePose();
  }

  state.runtimeArmBindRotationBackup = null;
  state.exitG53AfterImportedMeshRig = false;
  if (state.player) {
    state.player.skin = state.importedSkin;
  }

  console.info("[rig] imported mesh rigging complete", {
    path: details.path || getActiveMeshPath(),
    meshes: details.meshes || state.importedSkin?.meshes?.length || 0,
    relaxedVisibleGameplayArms: shouldRelaxVisibleGameplayArms,
    preservedRigCalibration: true,
  });

  if (state.riggingWizard.active) {
    setRiggingWizardStep(
      "test",
      "Rigged mesh is bound. Test idle/walk/run/jump/sword, then save.",
    );
  }
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
      bindLocalPosition   — base position + slider offsets
      bindLocalQuaternion — base rotation + bind-pose rotation sliders
      bindLocalScale      — always (1,1,1) unless deliberately changed

    WHAT THIS DOES NOT DO:
      It does NOT erase slider offsets or bind rotations. Those live in
      rigTuning and userData. This function only copies the already-computed
      bind values back into the live joint transform so the skeleton "stands
      at rest."

    WHEN IT IS CALLED:
      - After applyJointPointOffsets() — so the new pivot positions take effect
      - After applyBindRotationOffsets() — so the new rest pose takes effect
      - In handleJointEditPointerMove — at the end of every drag step to
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

function rememberG53ObjectVisibility(object, capturedMaterials = new Set()) {
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
      - trees, ghost spheres, and the sky moon hide

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

  if (G53_RIGGING_HOME.visibility.hideSkyMoon && skyMoon) {
    rememberG53ObjectVisibility(skyMoon, capturedMaterials);
    skyMoon.visible = false;
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
      isRunning: Boolean(controlState.isRunning),
      runBlendWeight: controlState.runBlendWeight,
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
  resetTurnVelocityState();
  controlState.walkPhase = saved.control.walkPhase;
  controlState.isWalking = saved.control.isWalking;
  controlState.isRunning = Boolean(saved.control.isRunning);
  controlState.runBlendWeight = THREE.MathUtils.clamp(
    Number.isFinite(saved.control.runBlendWeight)
      ? saved.control.runBlendWeight
      : controlState.isRunning
        ? 1
        : 0,
    0,
    1,
  );
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
    controlState.isRunning = false;
    controlState.runBlendWeight = 0;
    resetTurnVelocityState();
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
      swordController.hide();
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
    const skySnapshot = skyCycleController?.getSnapshot();
    console.info(
      "[G53] rigging mode active: home position and mouse point edit enabled",
    );
    console.info(
      `[sky] cycle paused by G53 at ${Math.round(skySnapshot?.phaseElapsed || 0)}/${Math.round(skySnapshot?.phaseDuration || 0)}ms`,
    );
  } catch (error) {
    /*
      If any setup step fails, G53 must not remain half-entered. A partial enter
      is worse than a clean refusal because active=true freezes movement and the
      pose loop, but the visibility fixture/status may not be applied.
    */
    console.error(
      "[G53] failed to enter rigging mode; restoring saved state",
      error,
    );
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

    This restores gameplay/view state, but it does not undo pivot edits.

    Exit ownership order:
      1. restore the temporary game/camera fixture
      2. commit the current rig calibration
      3. apply the relaxed visible arm pose
      4. resume normal animation updates

    "Commit calibration" means the joint/control point locations and bind
    reference rotations you tuned during rigging remain in rigTuning and in the
    live bind transforms. It does not mean "restore defaults."
  */
  if (!state.g53RiggingMode.active) {
    return;
  }

  const saved = state.g53RiggingMode.saved;

  state.g53RiggingMode.active = false;
  state.g53RiggingMode.saved = null;
  restoreG53VisibilityFixture();
  restoreG53RiggingSnapshot(saved);

  commitRigCalibration();
  applyRelaxedVisiblePose();
  state.runtimeArmBindRotationBackup = null;

  syncSwordAttachment();
  selectMouseJointEditJoint(rigTuning.mouseJointEditJoint);
  applyVisibility();
  refreshSkyCyclePresentation();
  updateGuiDisplays();
  updateG53RiggingStatus("OFF");
  const skySnapshot = skyCycleController?.getSnapshot();
  console.info(
    "[G53] rigging mode committed calibration and restored visible gameplay pose",
  );
  console.info(
    `[sky] cycle resumed after G53 at ${Math.round(skySnapshot?.phaseElapsed || 0)}/${Math.round(skySnapshot?.phaseDuration || 0)}ms`,
  );
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

    skin.js now reports the exact moment the mesh is actually bound. That gives
    us one clean finish point for both cases:
      - preview already loaded: completion happens synchronously
      - no preview: completion happens later in the GLTFLoader callback
  */
  state.exitG53AfterImportedMeshRig = Boolean(state.g53RiggingMode.active);
  rigCurrentImportedMesh();

  if (state.g53RiggingMode.active && state.exitG53AfterImportedMeshRig) {
    updateG53RiggingStatus("ACTIVE - rigging mesh; will exit after bind");
  }
}

function normalizeAssetMeshPath(fileName = "") {
  /*
    Browser file inputs do not reveal the real folder path. For reusable rigs,
    the most useful saved path is the project-relative asset path we expect
    future reloads/NPCs/enemies to use.

    Formula:
      savedPath = "assets/" + selectedFileName

    where selectedFileName is the name reported by the browser file picker.
  */
  const cleanName = String(fileName).replace(/^.*[\\/]/, "");
  return cleanName ? `assets/${cleanName}` : "";
}

function isPersistentAssetMeshPath(path = rigTuning.importedMeshPath) {
  return /^assets[\\/].+\.(glb|gltf)$/i.test(String(path || "").trim());
}

function getRiggingWizardPersistenceMessage() {
  if (!state.meshBlobUrl && isPersistentAssetMeshPath()) {
    return "OK: package will reload from project assets path.";
  }

  if (state.meshBlobUrl && isPersistentAssetMeshPath()) {
    return "Warning: preview uses a session file; save stores this assets path.";
  }

  if (state.meshBlobUrl) {
    return "Warning: session-only mesh. Set assets/name.glb before saving.";
  }

  return "Warning: mesh path should be assets/name.glb for NPC/enemy reuse.";
}

function updateRiggingWizardReadouts() {
  const wizard = state.riggingWizard;
  wizard.meshPath = rigTuning.importedMeshPath || "(no mesh path)";
  wizard.persistence = getRiggingWizardPersistenceMessage();
  wizard.readoutControllers.forEach((controller) => controller.updateDisplay());
}

function setRiggingWizardStep(step, status) {
  state.riggingWizard.step = step;
  state.riggingWizard.status = status;
  updateRiggingWizardReadouts();
}

function openUsefulRiggingFolders() {
  state.guiFolders.riggingWizard?.open?.();
  state.guiFolders.mesh?.open?.();
  state.guiFolders.dimensions?.open?.();
  state.guiFolders.jointPointControls?.open?.();
  state.guiFolders.g53RiggingMode?.open?.();
}

function restoreSceneFocusAfterFilePicker() {
  /*
    Hand keyboard focus back to the scene after the OS file picker.

    Without this, function-key shortcuts can be swallowed by the browser/GUI
    focus state after choosing a new local mesh. The capture-phase F2 handler is
    still the main safety net; this just makes the rest of the workshop normal.
  */
  restoreSceneKeyboardFocus();
}

function restoreSceneKeyboardFocus() {
  /*
    Returns keyboard ownership to the 3D scene.

    Why this exists:
      Browser UI and lil-gui controls can keep focus after a checkbox/button is
      clicked. When that happens, pointer/mouse commands can still work while
      movement keys never reach handleKeyDown(), so controlState.keys never gets
      the fresh KeyW/KeyA/etc. entry it needs.

    The helper focuses immediately because this usually runs inside a trusted
    user gesture, then repeats on the next animation frame in case the browser
    applies its own focus update after the current event handler finishes.
  */
  const focusScene = () => {
    window.focus();
    sceneContainer.focus({ preventScroll: true });
  };

  focusScene();
  requestAnimationFrame(focusScene);
}

function openImportedMeshFilePicker({
  source = "mesh",
  preferAssetsPath = false,
} = {}) {
  /*
    Shared GLB picker for the old Mesh button and the new Rigging Wizard.

    The file picker itself produces a temporary blob URL so the browser can read
    the selected local file immediately. For wizard saves, we also store a
    project-relative assets path because local blob URLs cannot be reused by
    saved NPC/enemy rig packages.
  */
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".glb,.gltf";
  input.style.cssText =
    "position:fixed;opacity:0;pointer-events:none;width:0;height:0";
  document.body.appendChild(input);
  input.addEventListener("change", () => {
    document.body.removeChild(input);
    const file = input.files[0];
    if (!file) {
      if (source === "wizard") {
        setRiggingWizardStep("select mesh", "Mesh selection canceled.");
      }
      return;
    }

    if (state.meshBlobUrl) URL.revokeObjectURL(state.meshBlobUrl);
    state.meshBlobUrl = URL.createObjectURL(file);
    state.riggingWizard.selectedFileName = file.name;
    rigTuning.importedMeshPath = preferAssetsPath
      ? normalizeAssetMeshPath(file.name)
      : file.name;

    updateGuiDisplays();
    loadImportedMeshPreviewFromPath(state.meshBlobUrl);

    if (source === "wizard") {
      setRiggingWizardStep(
        "base pose",
        `Previewing ${file.name}. Choose A, T, or Current base pose.`,
      );
      openUsefulRiggingFolders();
    } else {
      updateRiggingWizardReadouts();
    }

    restoreSceneFocusAfterFilePicker();
  });
  input.click();
}

function openRiggingWizardFilePicker() {
  openImportedMeshFilePicker({
    source: "wizard",
    preferAssetsPath: true,
  });
}

function previewRiggingWizardAssetsPath() {
  /*
    Loads the typed/saved path directly from the project, instead of using the
    session blob URL. This is the quickest way to prove that a saved NPC/enemy
    package will be able to reload the mesh later.
  */
  if (!rigTuning.importedMeshPath) {
    setRiggingWizardStep("select mesh", "Enter an assets/name.glb path first.");
    return;
  }

  if (state.meshBlobUrl) {
    URL.revokeObjectURL(state.meshBlobUrl);
    state.meshBlobUrl = null;
  }

  loadImportedMeshPreviewFromPath(rigTuning.importedMeshPath);
  setRiggingWizardStep(
    "base pose",
    `Previewing persistent path ${rigTuning.importedMeshPath}.`,
  );
}

function startRiggingWizard({ openPicker = true } = {}) {
  state.riggingWizard.active = true;
  openUsefulRiggingFolders();

  if (!state.g53RiggingMode.active) {
    enterG53RiggingMode();
  } else {
    resetSkeletonToBindPose();
    syncSkeletonRoot();
    state.skeleton?.root?.updateMatrixWorld(true);
  }

  setRiggingWizardStep(
    "select mesh",
    "G53 active. Select a GLB or preview an assets path.",
  );

  if (openPicker) {
    openRiggingWizardFilePicker();
  }
}

function cancelRiggingWizard() {
  state.riggingWizard.active = false;
  if (state.g53RiggingMode.active) {
    exitG53RiggingMode();
  }
  setRiggingWizardStep("idle", "Rigging Wizard closed.");
}

function toggleRiggingWizardHotkey() {
  if (state.riggingWizard.active) {
    cancelRiggingWizard();
    return;
  }

  startRiggingWizard({ openPicker: true });
}

function applyRiggingWizardBasePose() {
  applyRigMeshStartPose();
  setRiggingWizardStep(
    "align",
    "Base pose applied. Align joint points, then click Rig.",
  );
  openUsefulRiggingFolders();
}

function enterRiggingWizardAlignStep() {
  if (!state.g53RiggingMode.active) {
    enterG53RiggingMode();
  }
  rigTuning.mouseJointEditMode = true;
  rigTuning.labEnabled = true;
  rigTuning.skeletonVisible = true;
  applyVisibility();
  updateGuiDisplays();
  setRiggingWizardStep(
    "align",
    "Align pivots with mouse/sliders, then click Rig.",
  );
}

function riggingWizardRigMesh() {
  if (
    !state.importedPreview &&
    !state.meshBlobUrl &&
    !rigTuning.importedMeshPath
  ) {
    setRiggingWizardStep("select mesh", "No mesh selected yet.");
    return;
  }

  setRiggingWizardStep(
    "rigging",
    "Generating skin weights with existing rig engine.",
  );
  rigCurrentImportedMeshAndExitG53();
}

function setRiggingWizardTestIdle() {
  rigTuning.idleMotion = true;
  rigTuning.walkPreview = false;
  controlState.keys.clear();
  controlState.isWalking = false;
  controlState.isRunning = false;
  controlState.runBlendWeight = 0;
  resetTurnVelocityState();
  applyRelaxedVisiblePose();
  updateGuiDisplays();
  setRiggingWizardStep("test", "Idle test active.");
}

function holdRiggingWizardMovementTest({ run = false } = {}) {
  if (state.g53RiggingMode.active) {
    setRiggingWizardStep(
      "align",
      "Rig first; movement tests run after G53 exits.",
    );
    return;
  }

  controlState.keys.add("KeyW");
  if (run) {
    controlState.keys.add("ShiftLeft");
  } else {
    controlState.keys.delete("ShiftLeft");
    controlState.keys.delete("ShiftRight");
  }

  setRiggingWizardStep(
    "test",
    run ? "Run test for 1 second." : "Walk test for 1 second.",
  );
  window.setTimeout(() => {
    controlState.keys.delete("KeyW");
    controlState.keys.delete("ShiftLeft");
    controlState.keys.delete("ShiftRight");
  }, 1000);
}

function riggingWizardSaveRig() {
  commitRigCalibration();
  saveCurrentPuppetRigToLibrary();

  const status = isPersistentAssetMeshPath()
    ? `Saved ${rigTuning.puppetRigName}.`
    : `Saved ${rigTuning.puppetRigName}, but mesh path should be assets/name.glb.`;
  setRiggingWizardStep("saved", status);
}

function buildGui() {
  /*
    GUI panel structure (top to bottom):

      Mesh              — file browser, workflow steps, appearance, transform
      Puppet Shop       — named reusable rig packages and local rig library
      Base Rig Proportions — stock skeleton dimensions (sliders)
      Pivot Offsets     — per-joint XYZ position nudges
      Bind Pose         — per-joint rest-pose rotations for mesh alignment
      Motion            — idle, walk, jump, damping, presets
      Skeleton Lab      — debug markers, labels, collider ring
      Workshop          — root alignment, mouse point editing, axis marker
      G53 Rigging Mode  — temporary machine-home setup for pivot editing
      Save              — browser save/load and JSON export
      World Debug       — collision and encounter zone overlays
      Combat            — sword buttons and enemy difficulty
      Sword Offsets     — live sword path, scale, grip, position, rotation

    All folders except Mesh start closed so the panel is not overwhelming on
    first open. Click a folder header to expand it.
  */
  /*
    GUI title signals that the workshop is a dev tool, not the gameplay.
    The "(editing: Player)" suffix names the current edit target. When edit-
    target switching lands in Step 4 of the entity refactor, this label will
    update to reflect whichever entity the workshop is currently authoring.
  */
  state.gui = new GUI({ title: "Empyrean Puppet Workshop (editing: Player)" });
  state.guiFolders = {};

  // ─────────────────────────────────────────────────────────────────────────────
  // MESH
  // Everything you need to load, align, and rig a character mesh in one place.
  // ─────────────────────────────────────────────────────────────────────────────
  const meshFolder = state.gui.addFolder("Mesh");
  state.guiFolders.mesh = meshFolder;

  /*
    FILE BROWSER BUTTON
    Opens the operating system's native file picker filtered to .glb and .gltf.
    Selecting a file:
      1. Creates a temporary blob URL (session-only — not saved with the rig).
      2. Stores the filename in the "path" field for reference.
      3. Automatically loads a static preview so you can see the mesh right away.

    You can also type a relative path directly in the "path" field below
    (e.g. assets/Sigewynn.glb) if the file is already in the project folder.
  */
  meshFolder
    .add(
      {
        openFile() {
          openImportedMeshFilePicker({ source: "mesh" });
        },
      },
      "openFile",
    )
    .name("open file…");

  /*
    PATH FIELD — fallback for typing a relative path like "assets/Sigewynn.glb"
    or for re-loading a path that was exported with the rig package.
    When the file browser is used, this shows the chosen filename.
  */
  addGuiController(meshFolder, rigTuning, "importedMeshPath").name("path");

  // ── WORKFLOW ─────────────────────────────────────────────────────────────────
  /*
    Standard two-step workflow:
      1 · preview  — loads the mesh as a static visual reference.
                     Drag skeleton pivots to match it without skinning yet.
      2 · rig      — generates skin weights from the current pivot positions
                     and drives the mesh from the skeleton.

    quick rig skips preview and rigs immediately. Useful when pivots are already
    tuned and you just want to test the motion on the mesh.
  */
  addGuiController(meshFolder, rigTuning, "rigMeshStartPose", {
    "keep current pose": "current",
    "A pose": "aPose",
    "T pose": "tPose",
  }).name("start pose");
  meshFolder.add({ fn: applyRigMeshStartPose }, "fn").name("apply start pose");
  meshFolder
    .add({ fn: applyRelaxedVisiblePose }, "fn")
    .name("relax visible arms");
  meshFolder.add({ fn: renderDefaultImportedMesh }, "fn").name("1  preview");
  meshFolder
    .add({ fn: rigCurrentImportedMeshAndExitG53 }, "fn")
    .name("2  rig mesh");
  meshFolder.add({ fn: loadDefaultImportedMesh }, "fn").name("quick rig");
  meshFolder.add({ fn: rerigImportedMesh }, "fn").name("re-rig");
  meshFolder.add({ fn: clearImportedMesh }, "fn").name("clear mesh");

  // =============================================================
  // RIGGING WIZARD
  // Guided operator flow that wraps the existing Mesh/G53/Puppet Shop tools.
  // =============================================================
  const wizardFolder = state.gui.addFolder("Rigging Wizard");
  state.guiFolders.riggingWizard = wizardFolder;
  state.riggingWizard.readoutControllers.push(
    wizardFolder.add(state.riggingWizard, "step").name("step"),
    wizardFolder.add(state.riggingWizard, "status").name("status"),
    wizardFolder.add(state.riggingWizard, "meshPath").name("mesh path"),
    wizardFolder.add(state.riggingWizard, "persistence").name("save check"),
  );
  wizardFolder.add({ fn: startRiggingWizard }, "fn").name("F2 start wizard");
  wizardFolder
    .add({ fn: openRiggingWizardFilePicker }, "fn")
    .name("1 choose GLB");
  wizardFolder
    .add({ fn: previewRiggingWizardAssetsPath }, "fn")
    .name("1b preview assets path");
  addGuiController(wizardFolder, rigTuning, "rigMeshStartPose", {
    Current: "current",
    "A Pose": "aPose",
    "T Pose": "tPose",
  })
    .name("2 base pose")
    .onChange(applyRiggingWizardBasePose);
  wizardFolder
    .add({ fn: enterRiggingWizardAlignStep }, "fn")
    .name("3 align points");
  wizardFolder.add({ fn: riggingWizardRigMesh }, "fn").name("4 rig");
  const wizardTestFolder = wizardFolder.addFolder("5 test");
  wizardTestFolder.add({ fn: setRiggingWizardTestIdle }, "fn").name("idle");
  wizardTestFolder
    .add({ fn: () => holdRiggingWizardMovementTest({ run: false }) }, "fn")
    .name("walk 1 sec");
  wizardTestFolder
    .add({ fn: () => holdRiggingWizardMovementTest({ run: true }) }, "fn")
    .name("run 1 sec");
  wizardTestFolder.add({ fn: startJump }, "fn").name("jump");
  wizardTestFolder.add({ fn: equipSword }, "fn").name("draw sword");
  wizardTestFolder.add({ fn: startSwordSwing }, "fn").name("swing");
  wizardTestFolder.add({ fn: despawnSword }, "fn").name("stow sword");
  wizardTestFolder.close();
  wizardFolder.add({ fn: riggingWizardSaveRig }, "fn").name("6 save named rig");
  wizardFolder.add({ fn: cancelRiggingWizard }, "fn").name("close wizard");
  updateRiggingWizardReadouts();
  wizardFolder.close();

  // ── APPEARANCE ────────────────────────────────────────────────────────────────
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

  // ── TRANSFORM ─────────────────────────────────────────────────────────────────
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
  addGuiController(
    transformFolder,
    rigTuning,
    "importedMeshOffsetX",
    -4,
    4,
    0.01,
  )
    .name("offset X")
    .onFinishChange(refreshImportedMeshReference);
  addGuiController(
    transformFolder,
    rigTuning,
    "importedMeshOffsetY",
    -4,
    4,
    0.01,
  )
    .name("offset Y")
    .onFinishChange(refreshImportedMeshReference);
  addGuiController(
    transformFolder,
    rigTuning,
    "importedMeshOffsetZ",
    -4,
    4,
    0.01,
  )
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

  // ── RIG PACKAGE ───────────────────────────────────────────────────────────────
  // Export/import both rig tuning and mesh binding settings as a JSON bundle.
  meshFolder
    .add({ fn: exportRigPackageToConsole }, "fn")
    .name("export rig package");
  meshFolder
    .add({ fn: exportCurrentRigPackageToFile }, "fn")
    .name("download rig package");
  meshFolder
    .add({ fn: importRigPackageFromPrompt }, "fn")
    .name("import rig package");

  // =============================================================
  // PUPPET SHOP
  // Rig identity and reusable complete rig packages.
  // =============================================================
  const puppetShopFolder = state.gui.addFolder("Puppet Shop");
  state.guiFolders.puppetShop = puppetShopFolder;
  /*
    The Mesh folder is still the workbench for the currently visible GLB.
    Puppet Shop is the library shelf:
      - give the rig a name
      - save it as a reusable skeleton package
      - load it later for an NPC, enemy, or alternate player body

    The saved package includes the same complete rigTuning object the live
    puppet uses, plus readable metadata for future gameplay systems.
  */
  addGuiController(puppetShopFolder, rigTuning, "puppetRigName").name(
    "rig name",
  );
  addGuiController(puppetShopFolder, rigTuning, "puppetRigNotes").name("notes");
  state.puppetShop.readoutControllers.push(
    puppetShopFolder.add(state.puppetShop, "status").name("status"),
  );
  puppetShopFolder
    .add({ fn: saveCurrentPuppetRigToLibrary }, "fn")
    .name("save named rig + file");
  puppetShopFolder
    .add({ fn: loadNamedPuppetRigFromLibrary }, "fn")
    .name("load named rig");
  puppetShopFolder
    .add({ fn: deleteNamedPuppetRigFromLibrary }, "fn")
    .name("delete named rig");
  puppetShopFolder.add({ fn: listPuppetRigLibrary }, "fn").name("list rigs");
  puppetShopFolder
    .add({ fn: exportSelectedPuppetRigToFile }, "fn")
    .name("export selected rig");
  puppetShopFolder
    .add({ fn: exportPuppetRigLibraryToFile }, "fn")
    .name("export rig library");
  puppetShopFolder
    .add({ fn: importPuppetRigLibraryFromFile }, "fn")
    .name("import rig library");
  puppetShopFolder
    .add({ fn: exportRigPackageToConsole }, "fn")
    .name("copy complete rig");
  puppetShopFolder
    .add({ fn: importRigPackageFromPrompt }, "fn")
    .name("paste complete rig");
  puppetShopFolder.close();

  // ─────────────────────────────────────────────────────────────────────────────
  // BASE RIG PROPORTIONS
  // Changes here rebuild the skeleton hierarchy from scratch. Drag slowly —
  // each slider fires rebuildSkeletonWorkshop on release.
  // ─────────────────────────────────────────────────────────────────────────────
  const dimensionFolder = state.gui.addFolder("Base Rig Proportions");
  state.guiFolders.dimensions = dimensionFolder;
  RIG_DIMENSION_CONTROLS.forEach(([key, min, max, step]) => {
    addGuiController(dimensionFolder, rigTuning, key, min, max, step)
      .name(key)
      .onFinishChange(rebuildSkeletonWorkshop);
  });
  dimensionFolder.close();

  // ─────────────────────────────────────────────────────────────────────────────
  // PIVOT OFFSETS  +  BIND POSE
  // buildJointPointControls and buildBindRotationControls each create their own
  // top-level folder. The "reset bind pose" button lives in the Bind Pose folder
  // instead of a separate one-button folder.
  // ─────────────────────────────────────────────────────────────────────────────
  state.guiFolders.jointPointControls = buildJointPointControls(state.gui);
  state.guiFolders.bindRotationControls = buildBindRotationControls(state.gui);
  state.guiFolders.bindRotationControls
    .add({ fn: resetSkeletonToBindPose }, "fn")
    .name("reset bind pose");

  // ─────────────────────────────────────────────────────────────────────────────
  // MOTION
  // ─────────────────────────────────────────────────────────────────────────────
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
  addGuiController(motionFolder, rigTuning, "runAmplitude", 0, 1.5, 0.01).name(
    "run amplitude",
  );
  addGuiController(
    motionFolder,
    rigTuning,
    "runStrideLength",
    0.18,
    1.1,
    0.005,
  ).name("run stride");
  addGuiController(
    motionFolder,
    rigTuning,
    "runFootLift",
    0.04,
    0.5,
    0.005,
  ).name("run foot lift");
  addGuiController(motionFolder, rigTuning, "runBounce", 0, 0.22, 0.001).name(
    "run bounce",
  );
  addGuiController(
    motionFolder,
    rigTuning,
    "runForwardLean",
    0,
    0.26,
    0.001,
  ).name("run lean");
  addGuiController(motionFolder, rigTuning, "runArmPump", 0, 1.2, 0.005).name(
    "run arm pump",
  );
  addGuiController(motionFolder, rigTuning, "runHipTwist", 0, 0.32, 0.001).name(
    "run hip twist",
  );
  addGuiController(
    motionFolder,
    rigTuning,
    "runShoulderTwist",
    0,
    0.38,
    0.001,
  ).name("run shoulder twist");
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
  motionFolder.add({ fn: startJump }, "fn").name("test jump");
  addGuiController(
    motionFolder,
    rigTuning,
    "phaseOffset",
    -Math.PI,
    Math.PI,
    0.01,
  ).name("phase offset");
  motionFolder.close();

  // ─────────────────────────────────────────────────────────────────────────────
  // SKELETON LAB
  // Toggle debug helpers: joint pivot spheres, bone lines, labels, collider ring.
  // R key also toggles the lab. L key toggles joint labels.
  // ─────────────────────────────────────────────────────────────────────────────
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
  addGuiController(
    labFolder,
    rigTuning,
    "headMarkerSize",
    HEAD_MARKER_SIZE_RANGE.min,
    HEAD_MARKER_SIZE_RANGE.max,
    HEAD_MARKER_SIZE_RANGE.step,
  )
    .name("head marker size")
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

  // ─────────────────────────────────────────────────────────────────────────────
  // WORKSHOP
  // Root alignment offsets, mouse-drag joint editing, label and axis controls.
  // ─────────────────────────────────────────────────────────────────────────────
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
  alignmentFolder.close();

  // ==============================================================
  // TEMP / DEV PRECISION RIGGING MODE: G53-style machine home
  // Manual G53 controls. F2 now opens the guided Rigging Wizard wrapper.
  // ==============================================================
  const g53Folder = state.gui.addFolder("G53 Rigging Mode");
  state.guiFolders.g53RiggingMode = g53Folder;
  state.g53RiggingMode.readoutControllers.push(
    g53Folder.add(state.g53RiggingMode, "status").name("status"),
  );
  g53Folder.add({ fn: enterG53RiggingMode }, "fn").name("enter / home");
  g53Folder.add({ fn: exitG53RiggingMode }, "fn").name("exit / restore");
  g53Folder.add({ fn: toggleG53RiggingMode }, "fn").name("manual toggle");
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
  addGuiController(
    devProbeFolder,
    rigTuning,
    "devProbeStep",
    0.001,
    0.25,
    0.001,
  ).name("key step");
  state.devProbe.readoutControllers.push(
    devProbeFolder.add(state.devProbe.readout, "world").name("world"),
    devProbeFolder.add(state.devProbe.readout, "rigLocal").name("rig local"),
  );
  devProbeFolder.add({ fn: logDevProbeValues }, "fn").name("log values");
  devProbeFolder.add({ fn: copyDevProbeRigLocal }, "fn").name("copy rig local");
  devProbeFolder.close();

  // ─────────────────────────────────────────────────────────────────────────────
  // SAVE
  // Browser scratch save/load for quick experiments. The project default player
  // rig is loaded from assets/rigs/player.default.rig.json instead.
  // ─────────────────────────────────────────────────────────────────────────────
  const saveFolder = state.gui.addFolder("Save");
  state.guiFolders.save = saveFolder;
  saveFolder
    .add({ fn: saveRigTuningToBrowser }, "fn")
    .name("save scratch tuning");
  saveFolder
    .add({ fn: loadRigTuningFromBrowser }, "fn")
    .name("load scratch tuning");
  saveFolder.add({ fn: resetRigTuningToDefaults }, "fn").name("reset defaults");
  saveFolder
    .add({ fn: exportRigTuningToConsole }, "fn")
    .name("copy / log JSON");
  saveFolder.add({ fn: clearSavedRigTuning }, "fn").name("clear scratch");
  saveFolder.close();

  // ─────────────────────────────────────────────────────────────────────────────
  // WORLD DEBUG
  // Draws invisible collision shapes and encounter zones so you can see where
  // things are without guessing. Does not affect gameplay or physics.
  // ─────────────────────────────────────────────────────────────────────────────
  const worldDebugFolder = state.gui.addFolder("World Debug");
  state.guiFolders.worldDebug = worldDebugFolder;
  addGuiController(worldDebugFolder, rigTuning, "showWorldDebug")
    .name("world debug")
    .onChange(handleWorldDebugGuiChange);
  addGuiController(worldDebugFolder, rigTuning, "showWallColliders")
    .name("wall colliders")
    .onChange(handleWorldDebugGuiChange);
  addGuiController(worldDebugFolder, rigTuning, "showTreeColliders")
    .name("tree colliders")
    .onChange(handleWorldDebugGuiChange);
  addGuiController(worldDebugFolder, rigTuning, "showOutsideBounds")
    .name("outside bounds")
    .onChange(handleWorldDebugGuiChange);
  addGuiController(worldDebugFolder, rigTuning, "showEncounterZones")
    .name("encounter zones")
    .onChange(handleWorldDebugGuiChange);
  addGuiController(worldDebugFolder, rigTuning, "showEncounterLabels")
    .name("encounter labels")
    .onChange(handleWorldDebugGuiChange);
  addGuiController(worldDebugFolder, rigTuning, "encounterSystemEnabled")
    .name("encounters active")
    .onChange(() => {
      if (!rigTuning.encounterSystemEnabled) {
        state.encounterRuntime?.activeIds.clear();
        state.worldDebugView?.syncEncounterActivity?.(new Set());
      }
      restoreSceneKeyboardFocus();
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
  addGuiController(
    swordFolder,
    rigTuning,
    "swordTargetLength",
    SWORD_OFFSET_LIMITS.targetLength.min,
    SWORD_OFFSET_LIMITS.targetLength.max,
    SWORD_OFFSET_LIMITS.targetLength.step,
  )
    .name("length / scale")
    .onChange(refreshSwordOffsetPresentation);
  addGuiController(
    swordFolder,
    rigTuning,
    "swordGripFromLowerEnd",
    SWORD_OFFSET_LIMITS.gripFromLowerEnd.min,
    SWORD_OFFSET_LIMITS.gripFromLowerEnd.max,
    SWORD_OFFSET_LIMITS.gripFromLowerEnd.step,
  )
    .name("grip point")
    .onChange(refreshSwordOffsetPresentation);
  addGuiController(
    swordFolder,
    rigTuning,
    "swordGripX",
    SWORD_OFFSET_LIMITS.gripTrim.min,
    SWORD_OFFSET_LIMITS.gripTrim.max,
    SWORD_OFFSET_LIMITS.gripTrim.step,
  )
    .name("grip trim X")
    .onChange(refreshSwordOffsetPresentation);
  addGuiController(
    swordFolder,
    rigTuning,
    "swordGripY",
    SWORD_OFFSET_LIMITS.gripTrim.min,
    SWORD_OFFSET_LIMITS.gripTrim.max,
    SWORD_OFFSET_LIMITS.gripTrim.step,
  )
    .name("grip trim Y")
    .onChange(refreshSwordOffsetPresentation);
  addGuiController(
    swordFolder,
    rigTuning,
    "swordGripZ",
    SWORD_OFFSET_LIMITS.gripTrim.min,
    SWORD_OFFSET_LIMITS.gripTrim.max,
    SWORD_OFFSET_LIMITS.gripTrim.step,
  )
    .name("grip trim Z")
    .onChange(refreshSwordOffsetPresentation);
  addGuiController(
    swordFolder,
    rigTuning,
    "swordOffsetX",
    SWORD_OFFSET_LIMITS.localPosition.min,
    SWORD_OFFSET_LIMITS.localPosition.max,
    SWORD_OFFSET_LIMITS.localPosition.step,
  )
    .name("pos X")
    .onChange(syncSwordAttachment);
  addGuiController(
    swordFolder,
    rigTuning,
    "swordOffsetY",
    SWORD_OFFSET_LIMITS.localPosition.min,
    SWORD_OFFSET_LIMITS.localPosition.max,
    SWORD_OFFSET_LIMITS.localPosition.step,
  )
    .name("pos Y")
    .onChange(syncSwordAttachment);
  addGuiController(
    swordFolder,
    rigTuning,
    "swordOffsetZ",
    SWORD_OFFSET_LIMITS.localPosition.min,
    SWORD_OFFSET_LIMITS.localPosition.max,
    SWORD_OFFSET_LIMITS.localPosition.step,
  )
    .name("pos Z")
    .onChange(syncSwordAttachment);
  addGuiController(
    swordFolder,
    rigTuning,
    "swordPitch",
    SWORD_OFFSET_LIMITS.localRotation.min,
    SWORD_OFFSET_LIMITS.localRotation.max,
    SWORD_OFFSET_LIMITS.localRotation.step,
  )
    .name("pitch X")
    .onChange(syncSwordAttachment);
  addGuiController(
    swordFolder,
    rigTuning,
    "swordYaw",
    SWORD_OFFSET_LIMITS.localRotation.min,
    SWORD_OFFSET_LIMITS.localRotation.max,
    SWORD_OFFSET_LIMITS.localRotation.step,
  )
    .name("yaw Y")
    .onChange(syncSwordAttachment);
  addGuiController(
    swordFolder,
    rigTuning,
    "swordRoll",
    SWORD_OFFSET_LIMITS.localRotation.min,
    SWORD_OFFSET_LIMITS.localRotation.max,
    SWORD_OFFSET_LIMITS.localRotation.step,
  )
    .name("roll Z")
    .onChange(syncSwordAttachment);
  addGuiController(swordFolder, state.swordPreset, "name").name("preset name");
  swordFolder.add({ fn: saveSwordPresetToBrowser }, "fn").name("save preset");
  swordFolder.add({ fn: loadSwordPresetFromBrowser }, "fn").name("load preset");
  swordFolder
    .add({ fn: deleteSwordPresetFromBrowser }, "fn")
    .name("delete preset");
  swordFolder.add({ fn: listSwordPresetsToConsole }, "fn").name("list presets");
  swordFolder.add({ fn: copySwordPresetJson }, "fn").name("copy preset JSON");
  swordFolder.add({ fn: reloadSwordAsset }, "fn").name("reload sword");
  swordFolder.add({ fn: resetSwordOffsets }, "fn").name("reset sword offsets");
  swordFolder.close();
}

function buildJointPointControls(parentFolder) {
  /*
    Creates X/Y/Z sliders for every pivot point.

    These are calibration deltas layered on top of Base Rig Proportions. They
    move joint connection points before animation and are the main controls for
    fitting one finalized base skeleton to a specific imported mesh.
  */
  const folder = parentFolder.addFolder("Mesh Calibration Offsets");
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
  state.debugView?.setHeadMarkerSize(rigTuning.headMarkerSize);
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
      {
        audio: empyreanAudio,
        skyMoon,
        defaultSkyMoonColor: getDefaultSkyMoonColor(),
      },
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
  /*
    Per-entity animation pass (Step 3a). Iterates spawned non-player entities
    and runs their idle motion + skin sync. The player is excluded here
    because updateSkeleton + syncImportedSkinToPuppet above already drove it;
    routing the player through both paths would double-apply idle motion and
    show as drift jitter.

    Scope this step: idle breathing + head drift only. Walk/run/combat/jump
    for non-player entities lands in Step 3b.
  */
  if (state.entities && state.entities.length > 1) {
    for (let i = 0; i < state.entities.length; i += 1) {
      const entity = state.entities[i];
      if (!entity || entity === state.player) {
        continue;
      }
      entityFactories.update(entity, delta, elapsed);
    }
  }
  updateDevProbeReadout();
  if (
    skyCycleController &&
    !titleCardIsActive &&
    !skyCycleSuspendedByDocument &&
    !state.g53RiggingMode.active
  ) {
    /*
      delta is seconds; the world controller's documented timing is in
      milliseconds, so one conversion keeps all phase constants readable.

      Production pause gates:
        titleCardIsActive            -> first hold begins after EMPYREAN fades
        skyCycleSuspendedByDocument  -> hidden-tab wall time is discarded
        g53RiggingMode.active        -> calibration cannot consume sky time

      Exiting any gate continues from the exact visible transition frame.
    */
    skyCycleController.update(delta * 1000);
  }
  applySkyCycleObjectVisibility();
  updateGhostSphereMotion(ghostSpheres, elapsed);
  worldLighting?.update?.();
  updateCamera(delta);
  updateSkyMoonCameraAnchor(skyMoon, camera);
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

function updateKeyboardMotion(delta, currentTime) {
  /*
    Reads keyboard state and converts it into movement/camera inputs.

    Movement controls:
      W/S = forward/back along the avatar's facing direction
      A/D = turn avatar left/right
      Shift + W = run forward

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
  const wantsRun =
    !machineHomeActive &&
    moveInput > 0 &&
    (keys.has("ShiftLeft") || keys.has("ShiftRight"));
  const runBlendTarget = wantsRun ? 1 : 0;
  const runBlendDamping =
    runBlendTarget > controlState.runBlendWeight
      ? SOLO_TWEAKS.player.runBlendRiseDamping
      : SOLO_TWEAKS.player.runBlendFallDamping;
  const runBlendT =
    1 - Math.pow(0.001, (delta * Math.max(0.001, runBlendDamping)) / 8);

  controlState.runBlendWeight = THREE.MathUtils.lerp(
    controlState.runBlendWeight,
    runBlendTarget,
    runBlendT,
  );

  const runBlendWeight = THREE.MathUtils.clamp(controlState.runBlendWeight, 0, 1);
  const movementSpeed = THREE.MathUtils.lerp(
    SOLO_TWEAKS.player.moveSpeed,
    SOLO_TWEAKS.player.runSpeed,
    runBlendWeight,
  );
  const phaseSpeed = THREE.MathUtils.lerp(
    SOLO_TWEAKS.player.walkPhaseSpeed,
    SOLO_TWEAKS.player.runPhaseSpeed,
    runBlendWeight,
  );
  const attemptedDistance = Math.abs(moveInput) * delta * movementSpeed;
  const animationMoveThreshold = Math.max(0.002, attemptedDistance * 0.08);
  let acceptedDistance = 0;

  controlState.yaw += turnInput * delta * 2.2;
  controlState.actualMoveSpeed = 0;
  controlState.cameraYaw +=
    orbitInput * delta * SOLO_TWEAKS.camera.keyboardOrbitSpeed;

  /*
    Lurch back to behind when the player is moving and not actively orbiting.

    Why "and not actively orbiting": if the player is holding an arrow key to
    pan, the damping would fight that input. We only pull cameraYaw back to
    zero when the player isn't asking the camera to be anywhere else.

    The formula is the same exponential-decay-toward-target shape used by
    dampJointRotation, just applied to a scalar:
      t = 1 - 0.001^(delta * lurchDamping / 4)
      cameraYaw *= (1 - t)
  */
  if (moveInput !== 0 && orbitInput === 0) {
    const t =
      1 - Math.pow(0.001, (delta * SOLO_TWEAKS.camera.lurchDamping) / 4);
    controlState.cameraYaw *= 1 - t;
  }

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
    const before = controlState.position.clone();
    const resolved = moveRigWithCollision(
      controlState.position,
      direction,
      moveInput * delta * movementSpeed,
      {
        radius: rigTuning.colliderRadius + rigCollisionMargin,
        rootOffsetX: rigTuning.rootOffsetX,
        rootOffsetZ: rigTuning.rootOffsetZ,
      },
    );
    const terrainHeight = getControlTerrainHeight(
      resolved,
      controlState.groundY,
    );
    const stepUp =
      terrainHeight === null ? 0 : terrainHeight - controlState.groundY;

    if (terrainHeight === null || stepUp <= SOLO_TWEAKS.player.maxStepUp) {
      controlState.position.copy(resolved);
      acceptedDistance = controlState.position.distanceTo(before);
    }

    /*
      phaseSpeed is the animation equivalent of spindle RPM:
        walking uses walkPhaseSpeed
        running uses runPhaseSpeed

      Keeping movementSpeed and phaseSpeed paired is what prevents the feet
      from looking like they are sliding independently of body travel.
    */
    if (acceptedDistance > animationMoveThreshold) {
      const phaseScale =
        attemptedDistance > 0
          ? THREE.MathUtils.clamp(acceptedDistance / attemptedDistance, 0, 1)
          : 0;
      controlState.walkPhase += delta * phaseSpeed * phaseScale;
    }
  }

  controlState.isWalking = acceptedDistance > animationMoveThreshold;
  controlState.isRunning = controlState.isWalking && runBlendWeight > 0.5;
  controlState.actualMoveSpeed = controlState.isWalking
    ? acceptedDistance / Math.max(delta, 0.0001)
    : 0;
  if (machineHomeActive) {
    /*
      G53 rigging mode keeps the rig at machine home. Camera controls above
      remain live, but player movement/yaw do not move the workpiece.
    */
    controlState.position.copy(G53_RIGGING_HOME.position);
    controlState.yaw = G53_RIGGING_HOME.yaw;
    controlState.isRunning = false;
    controlState.runBlendWeight = 0;
    resetTurnVelocityState();
  } else {
    updateTurnVelocity(delta);
  }
  state.skeleton.root.rotation.y = controlState.yaw;

  if (currentTime > controlState.waveUntil && controlState.wasWaving) {
    controlState.wasWaving = false;
  }
}

function updateTurnVelocity(delta) {
  /*
    Tracks yaw rate as an animation signal.

    Keyboard and mouse-look both write controlState.yaw, sometimes between
    animation frames. Sampling the wrapped yaw delta here turns all of those
    inputs into one smoothed angular velocity for body anticipation/banking.
  */
  if (delta <= 0) {
    controlState.turnVelocitySampleYaw = controlState.yaw;
    return;
  }

  const yawDelta = wrapAngleDelta(
    controlState.yaw - controlState.turnVelocitySampleYaw,
  );
  const rawTurnVelocity = yawDelta / Math.max(delta, 0.0001);
  const targetTurnVelocity = THREE.MathUtils.clamp(
    rawTurnVelocity,
    -SOLO_TWEAKS.player.maxTurnVelocity,
    SOLO_TWEAKS.player.maxTurnVelocity,
  );
  const t =
    1 -
    Math.pow(
      0.001,
      (delta * Math.max(0.001, SOLO_TWEAKS.player.turnVelocityDamping)) / 8,
    );

  controlState.turnVelocity = THREE.MathUtils.lerp(
    controlState.turnVelocity,
    targetTurnVelocity,
    t,
  );
  controlState.turnVelocitySampleYaw = controlState.yaw;
}

function resetTurnVelocityState() {
  controlState.turnVelocity = 0;
  controlState.turnVelocitySampleYaw = controlState.yaw;
}

function wrapAngleDelta(angle) {
  return Math.atan2(Math.sin(angle), Math.cos(angle));
}

function getPlayerTurnPoseState(speed = controlState.actualMoveSpeed) {
  const maxTurnVelocity = Math.max(0.001, SOLO_TWEAKS.player.maxTurnVelocity);
  const turnSignal = THREE.MathUtils.clamp(
    controlState.turnVelocity / maxTurnVelocity,
    -1,
    1,
  );
  const speedWeight = THREE.MathUtils.clamp(
    speed / Math.max(0.001, SOLO_TWEAKS.player.runSpeed),
    0,
    1,
  );
  const bankWeight =
    speedWeight *
    THREE.MathUtils.lerp(0.12, 1, controlState.runBlendWeight || 0);
  const bankRoll = -turnSignal * SOLO_TWEAKS.player.turnBankRoll * bankWeight;

  return {
    headYaw: turnSignal * SOLO_TWEAKS.player.turnHeadYaw,
    neckYaw: turnSignal * SOLO_TWEAKS.player.turnNeckYaw,
    chestYaw: turnSignal * SOLO_TWEAKS.player.turnChestYaw,
    bodyRoll: bankRoll * 0.65,
    pelvisRoll: bankRoll,
  };
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

  syncSkeletonRoot(delta);

  if (state.g53RiggingMode.active) {
    freezeG53RiggingPose();
    return;
  }

  if (rigTuning.idleMotion) {
    updateIdleMotion(delta, elapsed);
  }

  if (rigTuning.walkPreview || controlState.isWalking) {
    updateQuaternionLocomotion(delta, elapsed);
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
  if (rigTuning.labEnabled && rigTuning.skeletonVisible) {
    state.debugView?.refreshBones?.();
  }
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
  controlState.isRunning = false;
  controlState.runBlendWeight = 0;
  resetTurnVelocityState();
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

function syncSkeletonRoot(delta = 0) {
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
  updateControlGroundY(delta);
  state.skeleton.root.position.copy(controlState.position);
  state.skeleton.root.position.x += rigTuning.rootOffsetX;
  state.skeleton.root.position.y +=
    rigTuning.rootOffsetY + controlState.groundY + controlState.jump.offsetY;
  state.skeleton.root.position.z += rigTuning.rootOffsetZ;
}

function updateControlGroundY(delta = 0) {
  const terrainHeight = getControlTerrainHeight(
    controlState.position,
    controlState.groundY,
  );

  if (terrainHeight === null) {
    return;
  }

  if (terrainHeight >= controlState.groundY || delta <= 0) {
    controlState.groundY = terrainHeight;
    return;
  }

  controlState.groundY = Math.max(
    terrainHeight,
    controlState.groundY - SOLO_TWEAKS.player.terrainDropSpeed * delta,
  );
}

function getControlTerrainHeight(position, referenceY = 0) {
  return getTerrainHeightAtWorldXZ(
    position.x + rigTuning.rootOffsetX,
    position.z + rigTuning.rootOffsetZ,
    referenceY,
  );
}

function getTerrainHeightAtWorldXZ(x, z, referenceY = 0) {
  if (!worldTerrain.meshes.length) {
    return null;
  }

  terrainRaycaster.set(
    new THREE.Vector3(x, referenceY + 10, z),
    terrainRayDown,
  );
  const hits = terrainRaycaster.intersectObjects(worldTerrain.meshes, true);
  const walkableHit = hits.find(isWalkableTerrainHit);

  return walkableHit ? walkableHit.point.y : null;
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
    adds it on top of the joint's bind rotation.

    IMPORTANT:
      Do not build the final target from bindLocalEuler alone.

      body, leftKnee, and rightKnee have invisible "fixture zero" corrections:
        body base yaw = -PI
        knee base yaw = -PI
        GUI bind-rotation slider = 0

      bindLocalEuler stores only the visible GUI offset. It intentionally stays
      at 0 for those fixture corrections. If animation targets were calculated
      as:

        finalEuler = bindLocalEuler + targetEuler

      then any pose solver would erase the baked knee/body base quaternion and
      ease the lower legs back toward the old orientation. That is the source of
      the "legs revert after rigging / after title card" creature moment.

    Correct formula:
      targetQuaternion = bindLocalQuaternion * deltaQuaternion

    where:
      bindLocalQuaternion = base fixture correction + GUI bind-pose offset
      deltaQuaternion     = active animation delta from targetEuler

    This keeps the neutral-zero correction alive while still allowing walk, run,
    idle, jump, and combat poses to layer on top of the rigged rest pose.

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
  const bindQuaternion =
    joint.userData.bindLocalQuaternion || new THREE.Quaternion();
  const deltaQuaternion = new THREE.Quaternion().setFromEuler(targetEuler);
  const targetQuaternion = bindQuaternion.clone().multiply(deltaQuaternion);

  joint.quaternion.slerp(targetQuaternion, t);
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

    This wrapper preserves the player call site. Per-entity NPCs/enemies use
    updateIdleMotionTo directly with their own (skeleton, tuning).
  */
  updateIdleMotionTo(
    state.skeleton,
    rigTuning,
    delta,
    elapsed,
    getPlayerTurnPoseState(0),
  );
}

function updateIdleMotionTo(skeleton, tuning, delta, elapsed, turnPose = null) {
  /*
    Parameterized version of updateIdleMotion used by the entity layer.
    Same math, but operates on the given skeleton + tuning so each spawned
    NPC/enemy can breathe and drift on its own time base (motionSpeed +
    phaseOffset) without sharing state with the player.

    Defensive: if the skeleton is missing required joints (mid-rebuild,
    incomplete entity, etc.), this no-ops silently rather than throwing.
  */
  if (!skeleton?.joints || !tuning) {
    return;
  }
  const joints = skeleton.joints;
  if (
    !joints.spineBase ||
    !joints.chest ||
    !joints.pelvis ||
    !joints.neck ||
    !joints.head
  ) {
    return;
  }

  const time = elapsed * tuning.motionSpeed + tuning.phaseOffset;
  const breathing = Math.sin(time * 1.5) * tuning.breathingAmplitude;
  const headLead = Math.sin(time * 0.58) * tuning.headDriftAmplitude;
  const headNod =
    Math.sin(time * 0.43 + 1.4) * tuning.headDriftAmplitude * 0.34;
  const torsoSway = Math.sin(time * 0.72 + 0.25) * tuning.torsoSwayAmplitude;
  const delayedTorso =
    Math.sin(time * 0.72 - 0.48) * tuning.torsoSwayAmplitude * 0.55;
  const turnChestYaw = turnPose?.chestYaw ?? 0;
  const turnNeckYaw = turnPose?.neckYaw ?? 0;
  const turnHeadYaw = turnPose?.headYaw ?? 0;

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
    tuning.damping,
  );
  dampJointRotation(
    joints.spineBase,
    new THREE.Euler(breathing * 0.75, 0, delayedTorso * 0.55),
    delta,
    tuning.damping,
  );
  dampJointRotation(
    joints.chest,
    new THREE.Euler(breathing * 0.45, headLead * 0.16 + turnChestYaw, torsoSway),
    delta,
    tuning.damping,
  );
  dampJointRotation(
    joints.neck,
    new THREE.Euler(
      headNod * 0.45,
      headLead * 0.38 + turnNeckYaw,
      -torsoSway * 0.62,
    ),
    delta,
    tuning.damping * 0.92,
  );
  dampJointRotation(
    joints.head,
    new THREE.Euler(headNod, headLead + turnHeadYaw, -torsoSway * 0.32),
    delta,
    tuning.damping * 0.82,
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

  swordController.hide();
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

function saveSwordPresetToBrowser() {
  swordController.savePresetToBrowser();
}

function loadSwordPresetFromBrowser() {
  swordController.loadPresetFromBrowser();
}

function deleteSwordPresetFromBrowser() {
  swordController.deletePresetFromBrowser();
}

function listSwordPresetsToConsole() {
  swordController.listPresetsToConsole();
}

function copySwordPresetJson() {
  swordController.copyPresetJson();
}

/*
  Sword bridge functions.

  main.js still calls these names from GUI controls, skeleton rebuilds, and
  combat input. The actual weapon asset/workholding implementation now lives in
  sword.js; these wrappers keep existing call sites stable during the module
  split.
*/
function refreshSwordOffsetPresentation() {
  swordController.refreshOffsetPresentation();
}

function disposeSwordAsset() {
  swordController.disposeAsset();
}

function reloadSwordAsset() {
  swordController.reloadAsset();
}

function resetSwordOffsets() {
  swordController.resetOffsets();
}

function loadSwordIfNeeded() {
  swordController.loadIfNeeded();
}

function detachSwordFromSkeleton() {
  swordController.detachFromSkeleton();
}

function syncSwordAttachment() {
  swordController.syncAttachment();
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
    console.warn(
      "[devProbe] clipboard write blocked; value logged instead",
      error,
    );
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

function getRunStrideValues(phase) {
  return getPhysicsRunStrideValues(phase);
}

function getPelvisWalkValues(phase, options) {
  return getPhysicsPelvisWalkValues(phase, options);
}

function getPelvisRunValues(phase, options) {
  return getPhysicsPelvisRunValues(phase, options);
}

function updateQuaternionLocomotion(delta, elapsed) {
  const isPreview = rigTuning.walkPreview && !controlState.isWalking;
  let phase = controlState.walkPhase;
  let speed = controlState.actualMoveSpeed;
  let isRunning = controlState.isRunning;
  let runBlendWeight = controlState.runBlendWeight;

  if (isPreview) {
    state.walkPhase +=
      delta * SOLO_TWEAKS.player.walkPhaseSpeed * rigTuning.motionSpeed;
    phase = state.walkPhase;
    speed = SOLO_TWEAKS.player.moveSpeed;
    isRunning = false;
    runBlendWeight = 0;
  }

  const turnPose = isPreview ? null : getPlayerTurnPoseState(speed);

  updateLocomotion(
    state.skeleton,
    {
      elapsed,
      phase,
      speed,
      maxSpeed: SOLO_TWEAKS.player.runSpeed,
      isWalking: controlState.isWalking || isPreview,
      walkPreview: isPreview,
      isRunning,
      runBlendWeight,
      turnPose,
      walkFrequency: 1.5,
      runFrequency: 2.5,
      walkStrideLength: 0.8,
      runStrideLength: 2.0,
      walkBounce: 0.05,
      runBounce: 0.15,
      relaxDamping: rigTuning.damping,
      idleMotion: false,
      applyArmPose: false,
      walkArmSwing: ensureWalkArmSwingState(),
      groundY: controlState.groundY,
      maxFootStepUp: SOLO_TWEAKS.player.maxStepUp,
    },
    worldTerrain.meshes,
    delta,
  );
}

function updateWalkMotion(delta, elapsed, options = {}) {
  /*
    Applies whole-body and leg motion for walking.

    If options.mode === "run", this delegates to updateRunMotion(). Keeping the
    old function name avoids rewriting every call site while letting the running
    gait use its own formulas and comments.

    There are two phase sources:
      - controlState.walkPhase when the user is actually moving
      - state.walkPhase when the GUI "walk preview" is playing in place

    The left and right legs are offset by PI radians, meaning when one leg is in
    swing, the other is in stance.
  */
  if (options.mode === "run") {
    updateRunMotion(delta, elapsed, options);
    return;
  }

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
      amplitude — arms swing somewhat less dramatically than legs in most gaits.
  */
  const walkArmSwing = ensureWalkArmSwingState();

  walkArmSwing.left = -leftSwing * 0.22 * amplitude;
  walkArmSwing.right = -rightSwing * 0.22 * amplitude;

  updateLegWalk("left", -1, phase, delta, amplitude);
  updateLegWalk("right", 1, phase + Math.PI, delta, amplitude);
}

function updateRunMotion(delta, elapsed, options = {}) {
  /*
    Applies the first full running cycle.

    The walk cycle is a grounded gait:
      at least one foot is meant to be in contact.

    The run cycle is a flight gait:
      the body gets a stronger vertical pulse, the torso leans forward, and the
      arms pump with bent elbows. The formulas come from runCycle.md and the
      pure math lives in physics.js.

    Coordinate convention used here:
      - Z offsets move feet forward/back relative to the puppet.
      - X offsets move joints left/right.
      - Y offsets lift joints upward.
      - negative X rotation on torso/chest reads as forward lean in the current
        rig pose convention.
  */
  const joints = state.skeleton.joints;
  const usesExternalPhase = Number.isFinite(options.phase);

  if (!usesExternalPhase) {
    state.walkPhase +=
      delta * SOLO_TWEAKS.player.runPhaseSpeed * rigTuning.motionSpeed;
  }

  const sourcePhase = usesExternalPhase ? options.phase : state.walkPhase;
  const phase = sourcePhase + rigTuning.phaseOffset;
  const amplitude = rigTuning.runAmplitude * (options.blend ?? 1);
  /*
    speedRatio is v / vMax for the lean formula. Right now the only active run
    speed is SOLO_TWEAKS.player.runSpeed, so this normally resolves to 1. The
    Math.max form keeps the formula ready for future jog/sprint tiers without
    changing getPelvisRunValues().
  */
  const speedRatio = THREE.MathUtils.clamp(
    SOLO_TWEAKS.player.runSpeed /
      Math.max(SOLO_TWEAKS.player.runSpeed, SOLO_TWEAKS.player.moveSpeed),
    0,
    1,
  );
  const pelvisRun = getPelvisRunValues(phase, {
    amplitude,
    /*
      Running is narrower side-to-side than walking but twists more. The walk
      hip sliders remain useful as broad "how much body sway" controls, while
      the run-specific sliders below control the spring and twist.
    */
    swayAmount: rigTuning.walkHipSway * 0.58,
    bounceAmount: rigTuning.runBounce,
    tiltAmount: rigTuning.walkHipTilt * 1.08,
    hipTwistAmount: rigTuning.runHipTwist,
    shoulderTwistAmount: rigTuning.runShoulderTwist,
    leanAmount: rigTuning.runForwardLean,
    speedRatio,
  });

  /*
    Body lift:
      pelvisRun.bobY is the main run-cycle bounce. The body gets most of it;
      the pelvis gets the full value. That split keeps the whole rig rising
      without making the head bob like a metronome.
  */
  const bodyBob = pelvisRun.bobY * 0.62;
  const headCounterY = -pelvisRun.bobY * 0.24;
  const runLean = pelvisRun.leanX;

  dampJointPositionFromBind(
    joints.body,
    {
      x: pelvisRun.swayX * 0.14,
      y: bodyBob,
      z: -pelvisRun.flightSignal * 0.018 * amplitude,
    },
    delta,
    rigTuning.damping * 0.95,
  );
  dampJointPositionFromBind(
    joints.pelvis,
    {
      x: pelvisRun.swayX,
      y: pelvisRun.bobY,
      z: 0,
    },
    delta,
    rigTuning.damping * 0.82,
  );
  dampJointPositionFromBind(
    joints.head,
    {
      x: -pelvisRun.swayX * 0.18,
      y: headCounterY,
      z: pelvisRun.flightSignal * 0.012 * amplitude,
    },
    delta,
    rigTuning.damping * 0.62,
  );

  /*
    Forward lean and counter-twist:
      theta = theta_base + (v / v_max) * theta_lean

    theta_base is the bind pose, so runLean is only the added lean. The hips and
    shoulders twist opposite each other so the run feels athletic instead of
    like a rigid board sliding forward.
  */
  dampJointRotation(
    joints.pelvis,
    new THREE.Euler(runLean * 0.24, pelvisRun.hipTwistY, pelvisRun.tiltZ),
    delta,
    rigTuning.damping * 0.86,
  );
  dampJointRotation(
    joints.chest,
    new THREE.Euler(runLean, pelvisRun.shoulderTwistY, -pelvisRun.tiltZ * 0.36),
    delta,
    rigTuning.damping * 0.9,
  );
  dampJointRotation(
    joints.head,
    new THREE.Euler(
      -runLean * 0.12,
      -pelvisRun.shoulderTwistY * 0.24,
      pelvisRun.tiltZ * 0.16,
    ),
    delta,
    rigTuning.damping * 0.72,
  );

  /*
    Running arm pump:
      theta_shoulder(t) = A_shoulder * sin(phase + phi)

    Empyrean stores these shoulder values in state.walkArmSwing for historical
    reasons: updateControlledArm() already reads that object when the arms are
    in the default "down" pose. The run branch in getControlledArmPoseTargets()
    changes the elbow/wrist shapes while reusing the same data pipe.

      left arm  = -sin(leftLegPhase)  * runArmPump
      right arm = -sin(rightLegPhase) * runArmPump

    The negative sign makes each arm oppose the same-side leg.
  */
  const walkArmSwing = ensureWalkArmSwingState();
  walkArmSwing.left = -Math.sin(phase) * rigTuning.runArmPump * amplitude;
  walkArmSwing.right =
    -Math.sin(phase + Math.PI) * rigTuning.runArmPump * amplitude;

  updateLegRun("left", -1, phase, delta, amplitude);
  updateLegRun("right", 1, phase + Math.PI, delta, amplitude);
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

function updateLegRun(sideName, side, phase, delta, amplitude) {
  /*
    Animates one leg for running.

    sideName = "left" or "right"
    side     = -1 for left, +1 for right
    phase    = this leg's phase; the right leg is called with phase + PI

    Formula anchor from runCycle.md:
      x_foot(t) = v * t - strideLength * cos(2 * PI * f * t)

    In this rig:
      phase = 2 * PI * f * t
      footZ = -cos(phase) * runStrideLength * 0.5 * amplitude

    where:
      runStrideLength = full visual front-to-back stride span in scene units
      0.5             = converts -1..1 signal into half-span displacement

    The positions are still "puppet readable" rather than perfect IK. They move
    knee/ankle/foot markers enough that the skeleton and attached mesh show the
    intended run without solving a full inverse-kinematics chain yet.
  */
  const stride = getRunStrideValues(phase);
  const joints = state.skeleton.joints;
  const hip = joints[`${sideName}Hip`];
  const knee = joints[`${sideName}Knee`];
  const ankle = joints[`${sideName}Ankle`];
  const foot = joints[`${sideName}Foot`];
  const strideHalfSpan = rigTuning.runStrideLength * 0.5;
  const footTravel = stride.footZ * strideHalfSpan * amplitude;
  const footLift = stride.footLift * rigTuning.runFootLift * amplitude;
  const kneeDrive = stride.kneeDrive;
  const toePush = stride.pushOff;
  const plant = stride.plant;
  const backPush = stride.backPush;

  dampJointPositionFromBind(
    knee,
    {
      x: side * (footLift * 0.38 + stride.strideSwing * 0.012),
      y: footLift * 0.58,
      z: footTravel * 0.5,
    },
    delta,
    rigTuning.damping * 0.92,
  );

  dampJointPositionFromBind(
    ankle,
    {
      x: -side * (footLift * 0.18 + stride.strideSwing * 0.012),
      y: footLift * 0.96 - plant * 0.008,
      z: footTravel * 0.92,
    },
    delta,
    rigTuning.damping * 0.94,
  );

  dampJointPositionFromBind(
    foot,
    {
      x: -side * footLift * 0.06,
      y: footLift * 0.62 + toePush * 0.026 - plant * 0.006,
      z: footTravel + toePush * 0.065,
    },
    delta,
    rigTuning.damping * 0.96,
  );

  dampJointRotation(
    hip,
    new THREE.Euler(
      stride.strideSwing * 0.52 * amplitude - backPush * 0.08,
      side * 0.04 * amplitude,
      side * 0.08 * amplitude,
    ),
    delta,
    rigTuning.damping * 0.9,
  );

  dampJointRotation(
    knee,
    new THREE.Euler(
      0.08 + kneeDrive * 0.86 + backPush * 0.12,
      0,
      side * stride.footLift * 0.08,
    ),
    delta,
    rigTuning.damping * 0.92,
  );

  dampJointRotation(
    ankle,
    new THREE.Euler(
      -stride.strideSwing * 0.18 * amplitude + toePush * 0.42 - plant * 0.08,
      side * 0.02 * amplitude,
      0,
    ),
    delta,
    rigTuning.damping * 0.94,
  );

  dampJointRotation(
    foot,
    new THREE.Euler(
      toePush * 0.5 - plant * 0.1 - stride.footLift * 0.045,
      0,
      -side * 0.03 * amplitude,
    ),
    delta,
    rigTuning.damping * 0.96,
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
  dampJointRotation(
    joints.body,
    new THREE.Euler(0, 0, 0),
    delta,
    rigTuning.damping * 0.9,
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
         This lifts the entire skeleton — every joint — upward.
         It is driven by real physics: launch velocity, gravity, arc.

      2. POSE SHAPE (this function):
         Body, legs, and arms change shape to look like a jump.
         These are LOCAL position and rotation offsets within the skeleton.
         They do not move the root — they deform the pose around it.

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
      getVisibleArmPoseDelta(
        `${sideName}Shoulder`,
        new THREE.Euler(-0.08, 0, side * (0.18 + armFloat)),
      ),
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
  const runBlendWeight =
    pose === "down"
      ? THREE.MathUtils.clamp(controlState.runBlendWeight || 0, 0, 1)
      : 0;

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

  if (runBlendWeight > 0.001) {
    /*
      Running "down" arm pose:
        The arm is still in the default controllable pose, but the shape changes
        from relaxed hanging to bent-elbow pumping.

      Shoulder formula from runCycle.md:
        theta_shoulder(t) = A_shoulder * sin(2 * PI * f * t + phi)

      updateRunMotion() already calculates that as walkSwing for this side.

      Elbow formula from runCycle.md:
        theta_elbow(t) = theta_base - A_elbow * sin(phase + phi)

      In this rig:
        theta_base is approximately 90 degrees, or PI/2 radians.
        forwardPump is max(0, -walkSwing / A), so the elbow bends more when the
        hand pumps forward toward the chest.

      Hand inward twist:
        theta_inward = A_inward * max(0, sin(phase + phi))

      That becomes inwardTwist below. It is intentionally subtle; too much hand
      twist makes the wrists look broken before we have full IK.
    */
    const pumpScale = Math.max(0.001, rigTuning.runArmPump);
    const forwardPump = physicsClamp01(-walkSwing / pumpScale);
    const inwardTwist = forwardPump * 0.14;
    const runShoulder = new THREE.Euler(
      trail * 0.04 + walkSwing,
      -side * inwardTwist * 0.35,
      side * (0.34 + forwardPump * 0.08),
    );
    const runElbow = new THREE.Euler(
      Math.PI * 0.5 + forwardPump * 0.34,
      0,
      side * (0.18 + forwardPump * 0.08),
    );
    const runWrist = new THREE.Euler(
      handFloat * 0.025 + forwardPump * 0.06,
      side * inwardTwist,
      -side * (0.11 + inwardTwist),
    );
    const runPalm = new THREE.Euler(0.02, side * inwardTwist * 0.55, side * 0.08);
    const blendEuler = (from, to) =>
      new THREE.Euler(
        THREE.MathUtils.lerp(from.x, to.x, runBlendWeight),
        THREE.MathUtils.lerp(from.y, to.y, runBlendWeight),
        THREE.MathUtils.lerp(from.z, to.z, runBlendWeight),
      );

    shoulder = blendEuler(shoulder, runShoulder);
    elbow = blendEuler(elbow, runElbow);
    wrist = blendEuler(wrist, runWrist);
    palm = blendEuler(palm, runPalm);
  } else if (pose === "up") {
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

      The swing only affects "down" pose — it would look wrong to counter-swing
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

  dampJointRotation(
    shoulder,
    getVisibleArmPoseDelta(`${sideName}Shoulder`, targets.shoulder),
    delta,
    rigTuning.damping,
  );
  dampJointRotation(
    elbow,
    getVisibleArmPoseDelta(`${sideName}Elbow`, targets.elbow),
    delta,
    rigTuning.damping,
  );
  dampJointRotation(
    wrist,
    getVisibleArmPoseDelta(`${sideName}Wrist`, targets.wrist),
    delta,
    rigTuning.damping,
  );
  dampJointRotation(
    palm,
    getVisibleArmPoseDelta(`${sideName}Palm`, targets.palm),
    delta,
    rigTuning.damping,
  );
}

function updateCamera(delta) {
  /*
    Third-person follow camera.

    target:
      skeleton root plus a small Y offset so the camera looks toward the upper
      body, not the feet.

    yaw:
      avatar yaw + extra camera orbit yaw + PI
      The +PI puts the camera behind the player. Before the rework this term
      was absent and the camera sat in front of the player, which made sense
      for the puppet rigging origin of this project but not for gameplay.

    pitch:
      controlState.cameraPitch, applied as a vertical orbit (latitude).
      pitch = 0   -> horizontal orbit (legacy)
      pitch > 0   -> camera higher, looks down at target (ground in view)
      pitch < 0   -> camera lower, looks up at target (sky in view)

    offset (polar coords around target):
      x = sin(yaw) * cos(pitch) * distance
      y = cameraHeight + sin(pitch) * distance
      z = cos(yaw) * cos(pitch) * distance

    The camera lerps to the desired position for smooth following.
  */
  const target = state.skeleton.root.position
    .clone()
    .add(new THREE.Vector3(0, 1.65, 0));
  const yaw = controlState.yaw + controlState.cameraYaw + Math.PI;
  const pitch = controlState.cameraPitch;
  const dist = controlState.cameraDistance;
  const offset = new THREE.Vector3(
    Math.sin(yaw) * Math.cos(pitch) * dist,
    controlState.cameraHeight + Math.sin(pitch) * dist,
    Math.cos(yaw) * Math.cos(pitch) * dist,
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
    do not recurse into children — each marker is a flat mesh and we only want
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
    (not the marker surface — the plane is coplanar with the joint, but the
    marker is a sphere that protrudes from it, so they differ slightly).

    Converting this to parent-local space gives dragStartParentLocal — the
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
    THE BUG THAT WAS HERE — and why it broke parent-child relationships:

    Every joint in the skeleton is a THREE.Group. Three.js stores two separate
    transforms on every object:

      1. LOCAL matrix  — position/rotation/scale relative to the PARENT.
                         Updated immediately whenever you set .position or .quaternion.

      2. WORLD matrix  — the accumulated transform from the scene root all the way
                         down to this object. This is what converts a local point
                         into an actual position in 3D space.

    IMPORTANT: Three.js does NOT update the world matrix automatically every time
    you change a position. It only updates world matrices in two moments:
      a) renderer.render() — the render loop calls scene.updateMatrixWorld() at
                             the start of every frame.
      b) An explicit call to object.updateMatrixWorld(true).

    The drag handler calls these functions on every pointermove event:
      applyJointPointOffsets()  — changes joint.position for ALL joints
      resetSkeletonToBindPose() — also changes joint.position for ALL joints
      syncSkeletonRoot()        — moves the root joint to the player position

    After those calls, every joint's LOCAL transform is up to date.
    But their WORLD matrices are now STALE — they still reflect positions from
    before this event fired.

    Then the handler calls:
      joint.parent.worldToLocal(someWorldPoint)

    worldToLocal() inverts joint.parent.matrixWorld to map a world-space point into
    parent-local space. If matrixWorld is stale, this conversion is wrong — the
    parent's actual current position in the world is not accounted for. This is
    exactly what "parent-child relationships are not being followed" means: the
    parent has moved, but worldToLocal() doesn't know that yet.

    At normal speeds this is invisible because the render loop runs between events
    and refreshes all matrices. But at high mouse speeds, multiple pointermove
    events fire within the same animation frame — so the second event arrives before
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
    and calculate the wrong parent-local position — making the joint drift or jump
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

function isAnyDevModeActive() {
  /*
    Union check used to gate gameplay mouse input (LMB sword, RMB mouse-look).

    Returns true if any rigging/dev tool currently owns the pointer or would
    be disrupted by gameplay input. Adding a new dev mode? Add it here so the
    sword does not swing while you place pivots and the camera does not whip
    around while you drag the dev probe.
  */
  return (
    state.g53RiggingMode.active ||
    rigTuning.mouseJointEditMode ||
    rigTuning.devProbeVisible ||
    state.devProbe.dragging ||
    mouseJointEditor.dragging
  );
}

function handleScenePointerFocus() {
  /*
    A plain canvas click should recover keyboard movement after the user has
    interacted with browser/UI controls. This listener is attached in capture
    phase so it runs before gameplay/dev pointer handlers decide whether the
    click swings, drags, edits, or does nothing.
  */
  restoreSceneKeyboardFocus();
}

function handleGameplayPointerDown(event) {
  /*
    Routes gameplay mouse buttons:

      RMB (button === 2):
        Enters mouse-look mode. While active:
          - pointer movement turns the player (yaw) and pitches the camera
          - mouse wheel orbits instead of zooming
        Suppressed in any dev mode (G53, joint edit, dev probe).
        The browser context menu is suppressed by a separate contextmenu handler
        so dragging right does not pop a system menu over the scene.

      LMB (button === 0):
        Triggers a sword swing. startSwordSwing() already auto-equips if the
        sword is stowed, so a fresh-loaded player can click once to equip and
        the first swing fires on that same click. Suppressed in dev modes so
        a rigging session does not accidentally produce swings.

    Other buttons are ignored. This handler is additive to the existing dev
    handlers; they all run on the same pointerdown event but each guards its
    own preconditions.
  */
  if (isAnyDevModeActive()) {
    return;
  }

  if (event.button === 2) {
    event.preventDefault();
    sceneContainer.setPointerCapture?.(event.pointerId);
    /*
      Pointer Lock hides the OS cursor and "pins" it in place for the duration
      of RMB. The browser keeps reporting movementX/Y deltas in pointermove
      events, so the camera still pans, but the cursor never drifts off the
      scene container or hits a screen edge. Released in pointerup/cancel.

      requestPointerLock can return a Promise in modern browsers; we don't
      await it because failure is non-fatal (the camera still pans, just with
      a moving cursor that can drift).
    */
    sceneContainer.requestPointerLock?.();
    controlState.mouseLookActive = true;
    return;
  }

  if (event.button === 0) {
    startSwordSwing();
  }
}

function handleGameplayMouseDownBackup(event) {
  /*
    Backup LMB-swing handler that uses the legacy `mousedown` event instead of
    `pointerdown`. Exists because of a Pointer-Lock-plus-Pointer-Capture quirk
    in current browsers:

    When RMB engages mouse-look, two things activate together:
      1. sceneContainer.setPointerCapture(pointerId)
      2. sceneContainer.requestPointerLock()
    For a mouse, all buttons share one pointerId. With that pointer captured
    AND locked, browsers (Chrome at least) frequently do not deliver the
    `pointerdown(button=0)` event for LMB while RMB is still held. The
    Enter-key swing path keeps working because keydown is a totally separate
    pipeline; LMB looks like it's "tied to RMB" because pointerdown is the
    one path that fails.

    mousedown is the legacy event that pointer events were supposed to
    supersede. It comes from a separate event pipeline and still fires
    reliably for the second button in the captured+locked case.

    Gating rule:
      - Only fires when mouseLookActive is true (i.e., RMB is held).
        Without this gate, this would double-fire alongside the working
        pointerdown handler in the no-RMB case.
      - Skips when any dev mode is active, for the same reason the pointer
        handler does.
      - startSwordSwing() already debounces via controlState.swordSwingUntil,
        so even if both handlers fired in the same frame, only one swing
        would actually trigger.
  */
  if (!controlState.mouseLookActive) {
    return;
  }
  if (isAnyDevModeActive()) {
    return;
  }
  if (event.button === 0) {
    startSwordSwing();
  }
}

function handleGameplayPointerMove(event) {
  /*
    Applies mouse-look deltas while RMB is held.

    Sources:
      event.movementX, event.movementY = pointer delta since the previous
      pointermove event, in pixels. Browsers provide this without the page
      having to track its own previous coords.

    Axes:
      dx (horizontal) -> turn the PLAYER (controlState.yaw). Mirrors A/D
        keys: positive dx (mouse moved right) -> turn right -> yaw decreases.
      dy (vertical)   -> pitch the CAMERA (controlState.cameraPitch).
        Default mouseInvertY=false means forward (dy<0) makes pitch decrease,
        which puts the camera lower and tilts the view up at the sky.
        Setting mouseInvertY=true flips this so forward looks down.

    Pitch is clamped to +/- maxPitch to prevent the camera flipping over the
    top of the player.
  */
  if (!controlState.mouseLookActive) {
    return;
  }
  if (isAnyDevModeActive()) {
    return;
  }

  const dx = event.movementX || 0;
  const dy = event.movementY || 0;

  controlState.yaw -= dx * SOLO_TWEAKS.camera.mouseTurnSensitivity;

  const pitchSign = SOLO_TWEAKS.camera.mouseInvertY ? -1 : 1;
  controlState.cameraPitch = THREE.MathUtils.clamp(
    controlState.cameraPitch +
      dy * SOLO_TWEAKS.camera.mousePitchSensitivity * pitchSign,
    -SOLO_TWEAKS.camera.maxPitch,
    SOLO_TWEAKS.camera.maxPitch,
  );
}

function handleGameplayPointerUp(event) {
  /*
    Exits mouse-look mode when RMB is released. Pointer capture is released so
    the scene container stops swallowing other events. Pointer lock is also
    released so the OS cursor reappears. Also fires on pointercancel/leave via
    the same listener wiring below, so a stuck mouseLookActive state does not
    survive an interrupted gesture.
  */
  if (event.button !== 2) {
    return;
  }
  if (!controlState.mouseLookActive) {
    return;
  }
  controlState.mouseLookActive = false;
  sceneContainer.releasePointerCapture?.(event.pointerId);
  if (document.pointerLockElement === sceneContainer) {
    document.exitPointerLock?.();
  }
}

function handleGameplayPointerCancel(event) {
  /*
    Defensive: if the OS interrupts a gesture (alt-tab, focus loss, etc.),
    clear the mouse-look flag and release pointer lock so it does not survive
    into the next session.
  */
  if (!controlState.mouseLookActive) {
    return;
  }
  controlState.mouseLookActive = false;
  sceneContainer.releasePointerCapture?.(event.pointerId);
  if (document.pointerLockElement === sceneContainer) {
    document.exitPointerLock?.();
  }
}

function handlePointerLockChange() {
  /*
    Pointer lock can be lost without our pointerup handler firing � most
    commonly when the user presses Esc to escape lock, or when the browser
    revokes it due to focus loss. If that happens while RMB is still believed
    to be held, clear mouseLookActive so the next pointermove does not whip
    the camera around as soon as the OS cursor reappears.
  */
  if (
    document.pointerLockElement !== sceneContainer &&
    controlState.mouseLookActive
  ) {
    controlState.mouseLookActive = false;
  }
}

function handleSceneContextMenu(event) {
  /*
    Suppresses the browser's right-click context menu inside the 3D scene so
    holding RMB to mouse-look does not pop a menu over the gameplay view.
    The dev GUI (lil-gui) is outside the scene container, so its right-click
    behavior is unaffected.
  */
  event.preventDefault();
}

function handleWheelZoom(event) {
  event.preventDefault();

  /*
    Mouse wheels report pixel, line, or page deltas depending on the device.
    This normalizes the value enough that a wheel notch and a trackpad gesture
    both feel like camera dolly movement instead of a wild teleport.

    Dual mode:
      default       -> wheel adjusts cameraDistance (zoom)
      RMB held      -> wheel adjusts cameraYaw (orbit)
    This lets the player keep zoom on the wheel for general use while making
    fine orbit adjustments a "hold RMB and scroll" gesture during aim/look.
  */
  const modeScale =
    event.deltaMode === 1 ? 0.08 : event.deltaMode === 2 ? 0.35 : 0.0035;
  const wheelAmount = event.deltaY * modeScale;

  if (controlState.mouseLookActive) {
    controlState.cameraYaw += wheelAmount * SOLO_TWEAKS.camera.wheelOrbitSpeed;
    return;
  }

  controlState.cameraDistance = THREE.MathUtils.clamp(
    controlState.cameraDistance + wheelAmount,
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

    F2 is important enough to treat like an emergency rigging switch:
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
    toggleRiggingWizardHotkey();
  }
}

function handleKeyUp(event) {
  // Key state is stored as a set so multiple keys can be held at the same time.
  controlState.keys.delete(event.code);
}

function handleWindowBlur() {
  /*
    Clears all held-key state and any active mouse-look when the window loses
    focus.

    Why this exists:
      controlState.keys is a Set populated by keydown and emptied by keyup.
      If a key is held when the window loses focus (Alt+Tab, browser tab
      switch, OS modal, dev tools, etc.), the matching keyup may never reach
      our listener and the key stays "stuck" in the Set forever.

      Symptom in practice: hold W to walk, switch focus to dev tools mid-walk,
      switch back � the player keeps walking with no key held. Pressing W
      again restores normal behavior because the next keyup fires.

      Confirming clue: Shift can still enter/exit the run cycle while in the
      stuck state, because Shift was pressed/released entirely AFTER focus
      returned to the window. Only the pre-blur key (W) is stuck.

    Fix:
      Clear the entire held-key Set on window blur. Also drop mouseLookActive
      and release pointer lock if RMB was being held during the focus loss,
      so the next session starts clean.
  */
  controlState.keys.clear();
  resetTurnVelocityState();
  if (controlState.mouseLookActive) {
    controlState.mouseLookActive = false;
    if (document.pointerLockElement === sceneContainer) {
      document.exitPointerLock?.();
    }
  }
}

function handleSkyCycleStateChange(snapshot) {
  /* Keeps main.js's small visibility mirror synchronized with world.js. */
  Object.assign(state.skyCycle, snapshot);
}

function handleDocumentVisibilityChange() {
  /*
    Explicit tab suspension policy for the production sky cycle.

    Browsers pause or heavily throttle requestAnimationFrame in hidden tabs.
    Relying on that alone makes elapsed sky time browser-dependent. Empyrean
    instead pauses cycle time while hidden and resumes from the same frame.

    clock.getDelta() is called only to discard the hidden wall-time interval.
    Without this reset, the first visible frame would receive a very large raw
    delta (later capped, but still semantically the wrong source of time).
  */
  skyCycleSuspendedByDocument = document.hidden;
  clock.getDelta();
  const snapshot = skyCycleController?.getSnapshot();
  const phaseTime = `${Math.round(snapshot?.phaseElapsed || 0)}/${Math.round(snapshot?.phaseDuration || 0)}ms`;

  if (skyCycleSuspendedByDocument) {
    console.info(`[sky] cycle paused: browser tab hidden at ${phaseTime}`);
    return;
  }

  refreshMoonPhaseIfStale();
  refreshSkyCyclePresentation();
  console.info(`[sky] cycle resumed: browser tab visible at ${phaseTime}`);
}

function applySkyCycleObjectVisibility() {
  /*
    Applies only main-owned scene-object visibility.

    Gradient, fog, light intensities, lensflares, moon material opacity, and
    ghost material opacity are already crossfaded by world.js. These group/light
    visibility checks happen only at effectively-zero opacity/intensity, where
    hiding the objects saves rendering work without creating a visible snap.

    G53 note:
      Machine-home rigging mode owns temporary world visibility. If G53 is
      active, keep the moon, ghost spheres, and their lights hidden. The sky
      controller itself is paused by animate(), so rigging cannot consume or
      overwrite an in-progress transition.
  */
  const nightVisible = state.skyCycle.nightInfluence > 0.001;
  const visibleInGameplay = nightVisible && !state.g53RiggingMode.active;

  skyMoon.visible = visibleInGameplay;

  ghostSpheres.forEach((sphere) => {
    sphere.group.visible = visibleInGameplay;
  });

  if (worldLighting?.moonLight) {
    worldLighting.moonLight.visible =
      visibleInGameplay && worldLighting.moonLight.intensity > 0.001;
  }

  if (worldLighting?.moonPointLight) {
    worldLighting.moonPointLight.visible =
      visibleInGameplay && worldLighting.moonPointLight.intensity > 0.001;
  }
}

function refreshSkyCyclePresentation() {
  /* Reapply the paused/current sky frame after G53 or startup setup. */
  skyCycleController?.applyCurrent();
  applySkyCycleObjectVisibility();
}

function toggleMoonSystem() {
  const snapshot = skyCycleController?.toggleTarget();

  if (!snapshot) {
    return;
  }

  handleSkyCycleStateChange(snapshot);
  applySkyCycleObjectVisibility();
  console.info(
    `[sky] G requested ${snapshot.targetState}; transition restarted from current colors`,
  );
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
      G     = transition toward the opposite day/night target
      Space = jump
      1     = equip sword and enter combat stance
      2     = despawn sword and return arms to idle
      Enter = sword swing / combat hit attempt   (backup; LMB also works)
      F2    = open/close Rigging Wizard, which wraps G53 rigging mode
      Y     = toggle TEMP devProbe marker
      Shift + J/L = move devProbe local X
      Shift + U/O = move devProbe local Y
      Shift + I/K = move devProbe local Z

    Mouse bindings (handled separately in handleGameplayPointerDown/Move/Up):
      LMB           = swing sword; equips first if not yet equipped
      RMB hold      = engage mouse-look:
                        drag horizontal -> turn player (same as A/D)
                        drag vertical   -> pitch camera (forward = look up)
                        scroll wheel    -> orbit instead of zoom
      wheel (no RMB)= zoom camera (same as before)
      All gated by isAnyDevModeActive(); none fire during G53/joint-edit/probe.
  */
  if (event.code === "F2") {
    event.preventDefault();

    if (!event.repeat) {
      toggleRiggingWizardHotkey();
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
  } else if (event.code === "KeyG") {
    toggleMoonSystem();
  } else if (event.code === "Space") {
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

function settleStartupPoseBehindTitleCard() {
  /*
    Forces the initial skeleton pose into its final bind/setup position before
    the title card fades out.

    Why this exists:
      The body and knee facing corrections are stored as base bind rotations.
      They are mathematically correct immediately, but the debug skeleton,
      camera, and imported-skin mirror can still need one startup pass to sync
      their world matrices and guide lines.

    Formula:
      visibleStartPose = bindPose + relaxedArmDelta + rootPosition + rootYaw

    where:
      bindPose        = saved joint point offsets + saved bind rotations
      relaxedArmDelta = getControlledArmPoseTargets(..., "down", ...)
      rootPosition    = player/control position
      rootYaw         = current player facing

    Running this before requestAnimationFrame(animate) means the first visible
    gameplay frame already has the corrected leg orientation AND the player is
    not visually left in the rigging/reference arm pose.
  */
  if (!state.skeleton?.root) {
    return;
  }

  commitRigCalibration();
  applyRelaxedVisiblePose();
  state.skeleton.root.updateMatrixWorld(true);
  state.debugView?.refreshBones?.();
  syncImportedSkinToPuppet();
}

console.info(
  `Empyrean ${APP_VERSION} running on Three.js ${THREE_VERSION_PIN}.`,
);
console.info(
  "This is a development build. Expect bugs and incomplete features! Report issues on GitHub.",
);

worldLighting = buildLighting(scene, { skyMoon });
applyWorldAtmosphere(scene, renderer, { lightingRig: worldLighting });
skyCycleController = createWorldSkyCycleController(scene, renderer, {
  lightingRig: worldLighting,
  skyMoon,
  ghostSpheres,
  onStateChange: handleSkyCycleStateChange,
});
refreshSkyCyclePresentation();
initMoonPhaseRuntime();
initSkin({
  state,
  rigTuning,
  updateGuiDisplays,
  onAfterImportedMeshRigged: handleImportedMeshRigged,
});
buildSkeletonWorkshop();
if (rigTuning.importedMeshPath) {
  /*
    Startup mirrors the package-load path:
      JSON file supplies rigTuning before buildSkeletonWorkshop()
      skin.js then binds the referenced GLB to the newly built skeleton.

    This keeps the default player rig file meaningful as a complete rig package,
    not only a set of sliders.
  */
  loadImportedMeshFromPath(rigTuning.importedMeshPath);
}

/*
  Entity layer setup. The puppet workshop's skeleton + controlState are now
  also accessible as state.player (the player entity). NPCs/enemies spawn into
  state.entities via window.empyreanSpawnNPC / SpawnEnemy at the console.

  Important: state.skeleton, state.importedSkin, and controlState are still
  used by the 470+ existing references in main.js. The entity wrapper does not
  rename or replace them. state.player.skeleton === state.skeleton, etc.

  Phase deferred: skin.js currently binds the player mesh to state.skeleton via
  initSkin's _ctx. Non-player entities spawn as skeleton-only debug visuals
  this session; mesh binding lands in Step 2.5 when skin.js gets parameterized.
*/
state.player = createPlayerEntity({
  skeleton: state.skeleton,
  skin: state.importedSkin,
  controlState,
  rigTuning,
});
state.player.controller = createKeyboardController(controlState);
state.entities = [state.player];

const entityFactories = createEntityFactories({
  scene,
  createSkeleton,
  applyJointPointOffsetsTo,
  applyBindRotationOffsetsTo,
  bindRiggedSkinFromPath,
  updateIdleMotionTo,
  syncSkinToSkeleton,
});

window.empyreanSpawnNPC = async function spawnNPCFromConsole(
  rigName,
  x = 0,
  z = 0,
  yaw = 0,
) {
  /*
    Console-callable entity spawn. Looks up a saved rig package from the
    puppet shop library by name and spawns an NPC at (x, y=0, z) with the
    given yaw.

    Async because mesh loading is async. In modern DevTools consoles you can
    await it directly:
      await empyreanSpawnNPC("Sigewynn player rig", 2, 0, Math.PI)

    If you don't await, you'll get back a Promise; the entity still spawns
    and appears in state.entities once the mesh resolves.

    Returns the spawned entity.
  */
  const pkg = loadPuppetRigPackageFromLibrary(window.localStorage, rigName);
  if (!pkg) {
    console.warn(
      `[entity] no saved rig named '${rigName}'. ` +
        `Available rigs: ${getPuppetRigLibraryNames(window.localStorage).join(", ") || "(none)"}`,
    );
    return null;
  }
  const npc = await entityFactories.spawnNPC({
    rigPackage: pkg,
    position: { x, y: 0, z },
    yaw,
  });
  npc.controller = createStaticController();
  state.entities.push(npc);
  console.info(
    `[entity] spawned NPC '${rigName}' at (${x}, ${z}) yaw=${yaw.toFixed(2)}`,
    { id: npc.id, hasMesh: Boolean(npc.skin) },
  );
  return npc;
};

window.empyreanSpawnEnemy = async function spawnEnemyFromConsole(
  rigName,
  x = 0,
  z = 0,
  yaw = 0,
) {
  const pkg = loadPuppetRigPackageFromLibrary(window.localStorage, rigName);
  if (!pkg) {
    console.warn(`[entity] no saved rig named '${rigName}'`);
    return null;
  }
  const enemy = await entityFactories.spawnEnemy({
    rigPackage: pkg,
    position: { x, y: 0, z },
    yaw,
  });
  enemy.controller = createStaticController();
  state.entities.push(enemy);
  console.info(`[entity] spawned enemy '${rigName}' at (${x}, ${z})`, {
    id: enemy.id,
    hasMesh: Boolean(enemy.skin),
  });
  return enemy;
};

window.empyreanListEntities = function listEntitiesFromConsole() {
  /*
    Quick console summary of currently spawned entities.
  */
  console.table(
    state.entities.map((e, i) => ({
      i,
      id: e.id,
      role: e.role,
      controller: e.controller?.type || e.controller || "(none)",
      x: e.skeleton?.root?.position?.x?.toFixed(2),
      y: e.skeleton?.root?.position?.y?.toFixed(2),
      z: e.skeleton?.root?.position?.z?.toFixed(2),
      hasMesh: Boolean(e.skin),
    })),
  );
  return state.entities;
};

buildGui();
resizeRendererToContainer();
settleStartupPoseBehindTitleCard();

window.addEventListener("keydown", handleG53HotkeyCapture, { capture: true });
window.addEventListener("keydown", handleKeyDown);
window.addEventListener("keyup", handleKeyUp);
window.addEventListener("blur", handleWindowBlur);
window.addEventListener("resize", resizeRendererToContainer);
document.addEventListener("visibilitychange", handleDocumentVisibilityChange);
sceneContainer.addEventListener("wheel", handleWheelZoom, { passive: false });
sceneContainer.addEventListener("pointerdown", handleScenePointerFocus, {
  capture: true,
});
sceneContainer.addEventListener("pointerdown", handleDevProbePointerDown);
sceneContainer.addEventListener("pointermove", handleDevProbePointerMove);
sceneContainer.addEventListener("pointerup", handleDevProbePointerUp);
sceneContainer.addEventListener("pointercancel", handleDevProbePointerUp);
sceneContainer.addEventListener("pointerdown", handleJointEditPointerDown);
sceneContainer.addEventListener("pointermove", handleJointEditPointerMove);
sceneContainer.addEventListener("pointerup", handleJointEditPointerUp);
sceneContainer.addEventListener("pointercancel", handleJointEditPointerUp);
sceneContainer.addEventListener("pointerdown", handleGameplayPointerDown);
sceneContainer.addEventListener("pointermove", handleGameplayPointerMove);
sceneContainer.addEventListener("pointerup", handleGameplayPointerUp);
sceneContainer.addEventListener("pointercancel", handleGameplayPointerCancel);
sceneContainer.addEventListener("pointerleave", handleGameplayPointerCancel);
sceneContainer.addEventListener("mousedown", handleGameplayMouseDownBackup);
sceneContainer.addEventListener("contextmenu", handleSceneContextMenu);
document.addEventListener("pointerlockchange", handlePointerLockChange);

requestAnimationFrame(animate);
initWorkshopLoader();
