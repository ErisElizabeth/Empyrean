/*
  EMPYREAN SWORD / WEAPON WORKHOLDING MODULE
  ===============================================================

  This module owns the right-hand weapon as a *workpiece*:

    - default sword setup numbers
    - GUI/sanitizer travel limits
    - sword-only preset packages and localStorage storage
    - GLB loading and disposal
    - imported sword normalization
    - grip-anchor math
    - rightPalm attachment and detachment during skeleton rebuilds

  It deliberately does NOT own:

    - keyboard input
    - combat hit decisions
    - enemy health
    - arm pose selection
    - draw/thrust/parry/swing animation state machines

  Machining analogy:
    main.js says "put the tool in the spindle" and "run this move."
    sword.js describes the tool holder, the offsets, the fixture zero, and how
    the imported GLB sits in that holder.

  Why this matters for future sword moves:
    Draws, thrusts, parries, and swings need reliable coordinate numbers. The
    "where is the grip?", "which point is held by the palm?", "what axis is the
    blade length?", and "what is local vs. world space?" questions all belong
    here, not scattered through player movement code.
*/

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { normalizePuppetRigName } from "./puppetShop.js";

export const SWORD_TWEAKS = {
  /*
    Built-in fallback setup for assets/plainSword.glb.

    These are not necessarily the *live* values. Live tuning lives in
    rigTuning, can be moved by the GUI, and can be saved as a full rig or as a
    sword-only preset. SWORD_TWEAKS is the factory setup and reset target.

    Coordinate reminder for wrapper placement:
      localPosition = rightPalm-local position of the sword wrapper group
      localRotation = rightPalm-local Euler rotation of the sword wrapper group

    In practice:
      - The GLB model is normalized so its chosen grip point sits at wrapper
        local origin (0,0,0).
      - The wrapper is parented to rightPalm.
      - These localPosition/localRotation values then act like the hand's final
        fixture offset.
  */
  assetPath: "assets/plainSword.glb",
  targetLength: 2.13,

  /*
    Long-axis grip scalar.

    Formula:
      gripCoordinate = box.min[longAxis] + box.size[longAxis] * gripFromLowerEnd

    where:
      longAxis          = x/y/z dimension with the largest local bounding box
      box.min[longAxis] = low end of sword on that axis
      box.size[axis]    = full sword length along that axis

    Values outside 0..1 are allowed by SWORD_OFFSET_LIMITS because sometimes a
    GLB's modeled "handle" sits outside the simple bounding-box region we want
    to treat as the gripped point.
  */
  gripFromLowerEnd: 1.0,

  /*
    Cross-axis grip trim.

    gripFromLowerEnd still owns the longest blade axis for compatibility with
    existing presets. gripTrim owns the other axes and starts at center.

    Formula before the long-axis overwrite:
      gripPoint.x = box.min.x + box.size.x * gripTrim.x
      gripPoint.y = box.min.y + box.size.y * gripTrim.y
      gripPoint.z = box.min.z + box.size.z * gripTrim.z

    If the hand looks like it is holding the flat side of the handle, adjust
    the trim axis that corresponds to that cross-section. If you need a clean
    thrust later, this is the place that makes "the palm owns the hilt" true.
  */
  gripTrim: [0.5, 0.5, 0.5],

  localPosition: [-0.91, 0.8, 0.635],
  localRotation: [1.2, -3.14159, 0.325],

  // These remain gameplay timing/hit-test defaults. main.js consumes them
  // when it starts a swing and asks combat_updated.js whether the swing hit.
  swingDurationMs: 520,
  hitRange: 1.55,
  hitArcRadians: Math.PI * 0.78,
};

export const SWORD_OFFSET_LIMITS = {
  /*
    One shared source of truth for GUI sliders, save sanitizing, and model
    normalization. If the menu allows a value, the sanitizer and math should
    accept the same range.
  */
  targetLength: { min: 0.05, max: 8, step: 0.01 },
  gripFromLowerEnd: { min: -1, max: 2, step: 0.01 },
  gripTrim: { min: -1, max: 2, step: 0.01 },
  localPosition: { min: -3, max: 3, step: 0.005 },
  localRotation: { min: -Math.PI * 2, max: Math.PI * 2, step: 0.005 },
};

export const SWORD_PRESET_LIBRARY_KEY = "empyrean.swordPreset.library.v1";
export const SWORD_PRESET_PACKAGE_KIND = "empyrean.swordPreset.package";
export const SWORD_PRESET_PACKAGE_SCHEMA = 1;
export const DEFAULT_SWORD_PRESET_NAME = "plainSword current";

export const SWORD_PRESET_KEYS = [
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
];

export const LEGACY_SWORD_DEFAULT_TUNING = {
  /*
    0.1.36-era plainSword defaults. These can still exist in older browser
    localStorage saves. main.js uses this exact set to migrate untouched old
    sword defaults forward without destroying hand-tuned saved offsets.
  */
  assetPath: "assets/plainSword.glb",
  targetLength: 1.02,
  gripFromLowerEnd: 0.14,
  offsetX: 0.025,
  offsetY: -0.015,
  offsetZ: 0.025,
  pitch: -Math.PI * 0.5,
  yaw: 0,
  roll: Math.PI * 0.04,
};

export function createSwordRuntimeState() {
  /*
    Runtime-only sword asset state.

    This object is intentionally not saved. Saved data should describe how to
    recreate/position the sword, not include live Three.js objects.
  */
  return {
    group: null,
    model: null,
    loading: false,
    loaded: false,
    loadedAssetPath: "",
  };
}

export function createSwordPresetState() {
  /*
    Runtime-only text box state for the Sword Offsets GUI.
    The actual library is stored separately in localStorage.
  */
  return {
    name: DEFAULT_SWORD_PRESET_NAME,
  };
}

export function makeDefaultSwordRigTuning() {
  /*
    The sword slice of makeDefaultRigTuning().

    Keeping this here means main.js no longer has to know how many sword keys
    exist. Future weapon states can expand this object without hunting through
    the full rig defaults.
  */
  return {
    swordAssetPath: SWORD_TWEAKS.assetPath,
    swordTargetLength: SWORD_TWEAKS.targetLength,
    swordGripFromLowerEnd: SWORD_TWEAKS.gripFromLowerEnd,
    swordGripX: SWORD_TWEAKS.gripTrim[0],
    swordGripY: SWORD_TWEAKS.gripTrim[1],
    swordGripZ: SWORD_TWEAKS.gripTrim[2],
    swordOffsetX: SWORD_TWEAKS.localPosition[0],
    swordOffsetY: SWORD_TWEAKS.localPosition[1],
    swordOffsetZ: SWORD_TWEAKS.localPosition[2],
    swordPitch: SWORD_TWEAKS.localRotation[0],
    swordYaw: SWORD_TWEAKS.localRotation[1],
    swordRoll: SWORD_TWEAKS.localRotation[2],
  };
}

function numbersNearlyEqual(a, b, epsilon = 0.0001) {
  return Math.abs(a - b) <= epsilon;
}

export function isLegacySwordDefaultTuning(values) {
  /*
    True only for untouched old built-in sword values.

    This is deliberately narrow. If the user moved even one sword value, that
    setup is treated as hand-tuned and is not migrated.
  */
  const legacy = LEGACY_SWORD_DEFAULT_TUNING;
  const assetMatches =
    !values.swordAssetPath ||
    values.swordAssetPath.trim() === legacy.assetPath;

  return (
    assetMatches &&
    numbersNearlyEqual(values.swordTargetLength, legacy.targetLength) &&
    numbersNearlyEqual(
      values.swordGripFromLowerEnd,
      legacy.gripFromLowerEnd,
    ) &&
    numbersNearlyEqual(values.swordOffsetX, legacy.offsetX) &&
    numbersNearlyEqual(values.swordOffsetY, legacy.offsetY) &&
    numbersNearlyEqual(values.swordOffsetZ, legacy.offsetZ) &&
    numbersNearlyEqual(values.swordPitch, legacy.pitch) &&
    numbersNearlyEqual(values.swordYaw, legacy.yaw) &&
    numbersNearlyEqual(values.swordRoll, legacy.roll)
  );
}

export function sanitizeSwordPresetValues(
  candidate = {},
  defaults = makeDefaultSwordRigTuning(),
) {
  /*
    Clean only the weapon setup fields.

    This function is used by:
      - full rig tuning sanitizing in main.js
      - sword-only preset save/load
      - pasted/console sword JSON experiments

    That keeps weapon limits consistent across every path.
  */
  const clean = {};

  clean.swordAssetPath =
    typeof candidate.swordAssetPath === "string" &&
    candidate.swordAssetPath.trim()
      ? candidate.swordAssetPath.trim()
      : defaults.swordAssetPath;

  const numericOrDefault = (key, fallback) => {
    const value = Number(candidate[key]);
    return Number.isFinite(value) ? value : fallback;
  };

  clean.swordTargetLength = THREE.MathUtils.clamp(
    numericOrDefault("swordTargetLength", defaults.swordTargetLength),
    SWORD_OFFSET_LIMITS.targetLength.min,
    SWORD_OFFSET_LIMITS.targetLength.max,
  );

  clean.swordGripFromLowerEnd = THREE.MathUtils.clamp(
    numericOrDefault(
      "swordGripFromLowerEnd",
      defaults.swordGripFromLowerEnd,
    ),
    SWORD_OFFSET_LIMITS.gripFromLowerEnd.min,
    SWORD_OFFSET_LIMITS.gripFromLowerEnd.max,
  );

  ["swordGripX", "swordGripY", "swordGripZ"].forEach((key) => {
    clean[key] = THREE.MathUtils.clamp(
      numericOrDefault(key, defaults[key] ?? 0.5),
      SWORD_OFFSET_LIMITS.gripTrim.min,
      SWORD_OFFSET_LIMITS.gripTrim.max,
    );
  });

  ["swordOffsetX", "swordOffsetY", "swordOffsetZ"].forEach((key) => {
    clean[key] = THREE.MathUtils.clamp(
      numericOrDefault(key, defaults[key]),
      SWORD_OFFSET_LIMITS.localPosition.min,
      SWORD_OFFSET_LIMITS.localPosition.max,
    );
  });

  ["swordPitch", "swordYaw", "swordRoll"].forEach((key) => {
    clean[key] = THREE.MathUtils.clamp(
      numericOrDefault(key, defaults[key]),
      SWORD_OFFSET_LIMITS.localRotation.min,
      SWORD_OFFSET_LIMITS.localRotation.max,
    );
  });

  return clean;
}

export function getSwordAssetPath(rigTuning) {
  return rigTuning.swordAssetPath?.trim() || SWORD_TWEAKS.assetPath;
}

export function getSwordPresetValues(source = {}) {
  return sanitizeSwordPresetValues(
    SWORD_PRESET_KEYS.reduce((values, key) => {
      values[key] = source[key];
      return values;
    }, {}),
  );
}

export function createSwordPresetPackage({
  appVersion,
  presetName = DEFAULT_SWORD_PRESET_NAME,
  rigTuning,
}) {
  /*
    Portable sword setup package.

    values is the authoritative import shape because it maps 1:1 to rigTuning.
    weapon is the readable future-facing shape for multiple weapon states.
  */
  const name = normalizePuppetRigName(presetName, DEFAULT_SWORD_PRESET_NAME);
  const savedAt = new Date().toISOString();
  const values = getSwordPresetValues(rigTuning);

  return {
    kind: SWORD_PRESET_PACKAGE_KIND,
    schema: SWORD_PRESET_PACKAGE_SCHEMA,
    version: appVersion,
    savedAt,
    metadata: {
      name,
      role: "weapon workholding preset",
    },
    values,
    weapon: {
      assetPath: values.swordAssetPath,
      targetLength: values.swordTargetLength,
      gripFromLowerEnd: values.swordGripFromLowerEnd,
      gripTrim: {
        x: values.swordGripX,
        y: values.swordGripY,
        z: values.swordGripZ,
      },
      localPosition: {
        x: values.swordOffsetX,
        y: values.swordOffsetY,
        z: values.swordOffsetZ,
      },
      localRotation: {
        x: values.swordPitch,
        y: values.swordYaw,
        z: values.swordRoll,
      },
    },
  };
}

export function extractSwordPresetValues(payload) {
  if (payload?.values) {
    return payload.values;
  }

  if (payload?.weapon) {
    const weapon = payload.weapon;
    return {
      swordAssetPath: weapon.assetPath,
      swordTargetLength: weapon.targetLength,
      swordGripFromLowerEnd: weapon.gripFromLowerEnd,
      swordGripX: weapon.gripTrim?.x,
      swordGripY: weapon.gripTrim?.y,
      swordGripZ: weapon.gripTrim?.z,
      swordOffsetX: weapon.localPosition?.x,
      swordOffsetY: weapon.localPosition?.y,
      swordOffsetZ: weapon.localPosition?.z,
      swordPitch: weapon.localRotation?.x,
      swordYaw: weapon.localRotation?.y,
      swordRoll: weapon.localRotation?.z,
    };
  }

  return payload;
}

export function readSwordPresetLibrary(storage = window.localStorage) {
  try {
    const text = storage.getItem(SWORD_PRESET_LIBRARY_KEY);
    if (!text) {
      return { schema: SWORD_PRESET_PACKAGE_SCHEMA, presets: {} };
    }
    const parsed = JSON.parse(text);
    return {
      schema: parsed.schema || SWORD_PRESET_PACKAGE_SCHEMA,
      presets:
        parsed.presets && typeof parsed.presets === "object"
          ? parsed.presets
          : {},
    };
  } catch (error) {
    console.warn("[sword] could not read sword preset library.", error);
    return { schema: SWORD_PRESET_PACKAGE_SCHEMA, presets: {} };
  }
}

export function writeSwordPresetLibrary(
  library,
  storage = window.localStorage,
) {
  storage.setItem(
    SWORD_PRESET_LIBRARY_KEY,
    JSON.stringify(
      {
        schema: SWORD_PRESET_PACKAGE_SCHEMA,
        presets: library.presets || {},
      },
      null,
      2,
    ),
  );
}

export function getSwordPresetLibraryNames(storage = window.localStorage) {
  return Object.keys(readSwordPresetLibrary(storage).presets).sort((a, b) =>
    a.localeCompare(b),
  );
}

function getSwordLocalBoundingBox(swordRoot) {
  /*
    Measure the sword in swordRoot-local coordinates.

    Why not Box3().setFromObject(swordRoot)?
      setFromObject measures in world space. Once the sword is parented to the
      palm, world-space measurement includes hand rotation. That would make
      repeated grip/length tuning depend on the current arm pose and create
      drift.

    Formula:
      rootInverse   = inverse(swordRoot.matrixWorld)
      localMatrix   = rootInverse * child.matrixWorld
      childLocalBox = child.geometry.boundingBox transformed by localMatrix

    Result:
      A bounding box in swordRoot local coordinates, independent of where the
      hand/player/camera currently are.
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
    Store the GLB scene root's authored transform once.

    Every time the user changes length/grip, normalizeSwordModel() resets to
    this import transform, then recomputes from scratch. That is the equivalent
    of returning to fixture zero before touching off again: no cumulative
    scale/position error.
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
    Tiny readability lift for dark weapon materials.

    This does not replace authored textures. It only ensures very dark blades
    remain visible against Empyrean's dark rooms while we are tuning.
  */
  mesh.frustumCulled = false;

  getSwordMaterialList(mesh.material).forEach((material) => {
    material.side = THREE.DoubleSide;

    if (material.emissive) {
      material.emissive.set("#1f1f1f");
      material.emissiveIntensity = Math.max(
        material.emissiveIntensity || 0,
        0.12,
      );
    }

    if ("envMapIntensity" in material) {
      material.envMapIntensity = Math.max(material.envMapIntensity || 0, 0.7);
    }

    material.needsUpdate = true;
  });
}

export function normalizeSwordModel(swordRoot, rigTuning) {
  /*
    Normalize arbitrary sword GLBs into Empyrean scene units.

    SCALE FORMULA:
      scale = targetLength / longestBoundingBoxSide

    where:
      targetLength            = rigTuning.swordTargetLength
      longestBoundingBoxSide  = max(box.size.x, box.size.y, box.size.z)

    GRIP POINT FORMULA:
      gripPoint.x = box.min.x + box.size.x * swordGripX
      gripPoint.y = box.min.y + box.size.y * swordGripY
      gripPoint.z = box.min.z + box.size.z * swordGripZ

    Then preserve old behavior by overwriting the longest blade axis:
      gripPoint[longestAxis] =
        box.min[longestAxis] + box.size[longestAxis] * swordGripFromLowerEnd

    PLACEMENT FORMULA:
      gripOffset = (gripPoint * swordRoot.scale) rotated by swordRoot.quaternion
      swordRoot.position = basePosition - gripOffset

    Meaning:
      The selected grip point lands exactly at the wrapper group's origin.
      Since the wrapper group is attached to rightPalm, rightPalm holds that
      point. This is the coordinate foundation future draw/thrust/parry/swing
      states should build on.
  */
  rememberSwordImportTransform(swordRoot);
  resetSwordToImportTransform(swordRoot);
  swordRoot.updateMatrixWorld(true);

  const sourceBox = getSwordLocalBoundingBox(swordRoot);

  if (!sourceBox) {
    console.warn(
      "[sword] could not find sword mesh bounds; leaving scale unchanged",
    );
    return;
  }

  const sourceSize = sourceBox.getSize(new THREE.Vector3());
  const longestSide = Math.max(sourceSize.x, sourceSize.y, sourceSize.z);

  if (!Number.isFinite(longestSide) || longestSide <= 0.0001) {
    console.warn(
      "[sword] could not measure sword asset; leaving scale unchanged",
    );
    return;
  }

  const tuning = sanitizeSwordPresetValues(rigTuning);
  const scale = tuning.swordTargetLength / longestSide;
  const basePosition = swordRoot.position.clone();
  const longestAxis =
    sourceSize.x >= sourceSize.y && sourceSize.x >= sourceSize.z
      ? "x"
      : sourceSize.y >= sourceSize.z
        ? "y"
        : "z";

  const gripPoint = new THREE.Vector3(
    sourceBox.min.x + sourceSize.x * tuning.swordGripX,
    sourceBox.min.y + sourceSize.y * tuning.swordGripY,
    sourceBox.min.z + sourceSize.z * tuning.swordGripZ,
  );
  gripPoint[longestAxis] =
    sourceBox.min[longestAxis] +
    sourceSize[longestAxis] * tuning.swordGripFromLowerEnd;

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

export function createSwordController({
  appVersion,
  rigTuning,
  runtime,
  presetState,
  getRightPalm,
  isWeaponEquipped,
  disposeObjectTree,
  updateGuiDisplays = () => {},
  storage = window.localStorage,
  clipboard = navigator.clipboard,
}) {
  /*
    Small controller object used by main.js.

    This keeps main.js call sites readable (`swordController.syncAttachment()`)
    while letting all weapon setup math live here.
  */

  function syncAttachment() {
    /*
      Parent the sword wrapper to the current rightPalm joint.

      Parent/child transform reminder:
        swordGroup.position and swordGroup.rotation are rightPalm-local values.
        If rightPalm moves during idle, walk, draw, thrust, parry, or swing, the
        sword follows automatically because it is a child.
    */
    const swordGroup = runtime.group;
    const rightPalm = getRightPalm();

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
    swordGroup.visible = Boolean(isWeaponEquipped());
  }

  function hide() {
    if (runtime.group) {
      runtime.group.visible = false;
    }
  }

  function refreshOffsetPresentation() {
    if (runtime.model) {
      normalizeSwordModel(runtime.model, rigTuning);
    }
    syncAttachment();
  }

  function disposeAsset() {
    const swordGroup = runtime.group;

    if (swordGroup) {
      swordGroup.parent?.remove(swordGroup);
      disposeObjectTree(swordGroup);
    }

    runtime.group = null;
    runtime.model = null;
    runtime.loading = false;
    runtime.loaded = false;
    runtime.loadedAssetPath = "";
  }

  function loadIfNeeded() {
    const assetPath = getSwordAssetPath(rigTuning);

    if (runtime.loaded && runtime.loadedAssetPath === assetPath) {
      return;
    }

    if (runtime.loaded && runtime.loadedAssetPath !== assetPath) {
      disposeAsset();
    }

    if (runtime.loading) {
      return;
    }

    runtime.loading = true;

    const loader = new GLTFLoader();
    loader.load(
      assetPath,
      (gltf) => {
        const swordGroup = new THREE.Group();
        swordGroup.name = "right-hand-sword";

        const swordRoot = gltf.scene;
        swordRoot.name = "right-hand-sword-model";
        normalizeSwordModel(swordRoot, rigTuning);
        swordGroup.add(swordRoot);

        runtime.group = swordGroup;
        runtime.model = swordRoot;
        runtime.loaded = true;
        runtime.loading = false;
        runtime.loadedAssetPath = assetPath;

        syncAttachment();
        console.info("[sword] loaded", assetPath);
      },
      undefined,
      (error) => {
        runtime.loading = false;
        console.error("[sword] failed to load", assetPath, error);
      },
    );
  }

  function reloadAsset() {
    disposeAsset();
    loadIfNeeded();
    updateGuiDisplays();
  }

  function resetOffsets() {
    Object.assign(rigTuning, makeDefaultSwordRigTuning());

    if (runtime.loadedAssetPath !== getSwordAssetPath(rigTuning)) {
      reloadAsset();
    } else {
      refreshOffsetPresentation();
    }

    updateGuiDisplays();
  }

  function detachFromSkeleton() {
    /*
      Protect the loaded sword during skeleton rebuilds.
      main.js disposes the old skeleton tree; removing the sword first keeps
      the weapon GLB alive so it can attach to the fresh rightPalm.
    */
    runtime.group?.parent?.remove(runtime.group);
  }

  function applyPresetValues(values) {
    const previousPath = getSwordAssetPath(rigTuning);
    Object.assign(rigTuning, sanitizeSwordPresetValues(values));

    if (previousPath !== getSwordAssetPath(rigTuning)) {
      reloadAsset();
    } else {
      refreshOffsetPresentation();
    }

    updateGuiDisplays();
  }

  function savePresetToBrowser() {
    const preset = createSwordPresetPackage({
      appVersion,
      presetName: presetState.name,
      rigTuning,
    });
    const library = readSwordPresetLibrary(storage);
    library.presets[preset.metadata.name] = preset;
    writeSwordPresetLibrary(library, storage);
    presetState.name = preset.metadata.name;
    updateGuiDisplays();
    console.info("[sword] saved preset.", preset);
  }

  function loadPresetFromBrowser() {
    const name = normalizePuppetRigName(
      presetState.name,
      DEFAULT_SWORD_PRESET_NAME,
    );
    const library = readSwordPresetLibrary(storage);
    const preset = library.presets[name];

    if (!preset) {
      console.warn(
        `[sword] preset '${name}' not found. Available presets: ${
          getSwordPresetLibraryNames(storage).join(", ") || "(none)"
        }`,
      );
      return;
    }

    presetState.name = name;
    applyPresetValues(extractSwordPresetValues(preset));
    console.info("[sword] loaded preset.", preset);
  }

  function deletePresetFromBrowser() {
    const name = normalizePuppetRigName(
      presetState.name,
      DEFAULT_SWORD_PRESET_NAME,
    );
    const library = readSwordPresetLibrary(storage);

    if (!library.presets[name]) {
      console.warn(`[sword] preset '${name}' not found; nothing deleted.`);
      return;
    }

    delete library.presets[name];
    writeSwordPresetLibrary(library, storage);
    console.info(`[sword] deleted preset '${name}'.`);
  }

  function listPresetsToConsole() {
    const names = getSwordPresetLibraryNames(storage);
    console.info(
      `[sword] saved presets: ${names.join(", ") || "(none)"}`,
      readSwordPresetLibrary(storage).presets,
    );
  }

  function copyPresetJson() {
    const preset = createSwordPresetPackage({
      appVersion,
      presetName: presetState.name,
      rigTuning,
    });
    const text = JSON.stringify(preset, null, 2);
    console.info("[sword] preset JSON:", preset);
    clipboard?.writeText?.(text).catch(() => null);
  }

  return {
    syncAttachment,
    hide,
    refreshOffsetPresentation,
    disposeAsset,
    reloadAsset,
    resetOffsets,
    loadIfNeeded,
    detachFromSkeleton,
    applyPresetValues,
    savePresetToBrowser,
    loadPresetFromBrowser,
    deletePresetFromBrowser,
    listPresetsToConsole,
    copyPresetJson,
  };
}
