/*
  EMPYREAN PUPPET SHOP MODULE

  This file is the first architecture boundary between:

    GAMEPLAY:
      movement, collisions, combat, camera, encounters, world rendering

    PUPPET SHOP:
      rig identity, rig packages, reusable skeleton tuning, mesh binding notes,
      posture/motion settings, and local rig library storage

  Machining analogy:
    main.js is still the machine running the part.
    puppetShop.js is the labeled setup cart beside the machine.

  A "complete rig package" is not only a mesh path. It is the full setup that
  makes a mesh behave as a puppet:

    - body dimensions
    - joint point offsets
    - bind-pose rotations
    - mesh transform settings
    - motion profile sliders
    - sword/dev attachment offsets
    - notes and identity fields

  The package stores the complete rigTuning object as the source of truth. The
  extra skeleton/motion/attachment sections duplicate important fields in a more
  readable shape so future NPC/enemy systems can inspect the package without
  needing to know every GUI key.

  This module is deliberately pure browser/data code:
    - no Three.js imports
    - no scene objects
    - no GUI objects
    - no animation frame side effects
*/

export const PUPPET_SHOP_LIBRARY_KEY =
  "empyrean.puppetShop.rigLibrary.v1";
export const PUPPET_RIG_PACKAGE_KIND = "empyrean.puppetRig.package";
export const PUPPET_RIG_PACKAGE_SCHEMA = 1;

function cloneJson(value) {
  /*
    Makes a plain JSON-safe deep copy.

    Formula:
      clone = JSON.parse(JSON.stringify(value))

    where:
      value must be a data object, not a Three.js object.

    This protects exported packages from later live GUI edits mutating the saved
    object by reference.
  */
  return JSON.parse(JSON.stringify(value ?? {}));
}

export function normalizePuppetRigName(name, fallback = "current rig") {
  /*
    Produces a stable library key from user-entered text.

    Formula:
      normalized = trim(name)
      if normalized is empty, use fallback

    The original capitalization is preserved because the name is user-facing.
  */
  const trimmed = typeof name === "string" ? name.trim() : "";
  const fallbackText =
    typeof fallback === "string" && fallback.trim()
      ? fallback.trim()
      : "current rig";

  return trimmed || fallbackText;
}

function makePackageId(name, timestamp) {
  /*
    Creates a readable id instead of a random opaque value.

    Formula:
      id = lower(name) + "-" + timestampWithoutPunctuation

    This id is not a security token. It is just a stable label for logs and
    future asset manifests.
  */
  const namePart = normalizePuppetRigName(name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const timePart = timestamp.replace(/[^0-9]/g, "");

  return `${namePart || "rig"}-${timePart}`;
}

function pickFields(source, keys) {
  return keys.reduce((picked, key) => {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      picked[key] = source[key];
    }
    return picked;
  }, {});
}

export function createPuppetRigPackage({
  appVersion,
  rigName,
  notes = "",
  rigTuning,
  importedMesh = {},
  role = "reusable puppet rig",
}) {
  /*
    Builds a complete rig package.

    Formula:
      package = metadata + completeRigTuning + readableIndexes

    where:
      completeRigTuning = the full saved GUI/workshop tuning object
      readableIndexes   = duplicated subsets for future gameplay systems

    Why duplicate some values?
      For humans and future code. The complete rigTuning block is the authority,
      but a future NPC loader should be able to ask "what is the posture bias?"
      or "what mesh path is this rig meant for?" without knowing every slider.
  */
  const exportedAt = new Date().toISOString();
  const name = normalizePuppetRigName(rigName);
  const tuning = cloneJson(rigTuning);
  const mesh = cloneJson(importedMesh);

  return {
    kind: PUPPET_RIG_PACKAGE_KIND,
    schema: PUPPET_RIG_PACKAGE_SCHEMA,
    version: appVersion,
    exportedAt,
    metadata: {
      id: makePackageId(name, exportedAt),
      name,
      role,
      notes: typeof notes === "string" ? notes : "",
    },
    /*
      This is the source of truth. Importing a package applies this object after
      main.js sanitizes it against the current supported rig keys.
    */
    rigTuning: tuning,
    /*
      Readable skeleton snapshot:
        dimensions describe body proportions
        jointPointOffsets describe pivot placement
        bindRotationOffsets describe rest-pose orientation corrections

      These are duplicated from rigTuning for clarity and future NPC reuse.
    */
    skeleton: {
      dimensions: pickFields(tuning, [
        "totalHeight",
        "headHeight",
        "neckLength",
        "torsoLength",
        "pelvisWidth",
        "shoulderWidth",
        "upperArmLength",
        "forearmLength",
        "handLength",
        "upperLegLength",
        "lowerLegLength",
        "footLength",
      ]),
      jointPointOffsets: cloneJson(tuning.jointPointOffsets),
      bindRotationOffsets: cloneJson(tuning.bindRotationOffsets),
    },
    /*
      Motion/personality snapshot:
        This is where the "almost-human wrongness" becomes reusable. Two actors
        can share the same skeleton but feel different by changing breathing,
        shoulder twist, idle drift, run stride, and other bias values.
    */
    motionProfile: pickFields(tuning, [
      "presetName",
      "idleMotion",
      "motionSpeed",
      "breathingAmplitude",
      "headDriftAmplitude",
      "torsoSwayAmplitude",
      "armTrailAmplitude",
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
    ]),
    attachments: pickFields(tuning, [
      "swordAssetPath",
      "swordTargetLength",
      "swordGripFromLowerEnd",
      "swordOffsetX",
      "swordOffsetY",
      "swordOffsetZ",
      "swordPitch",
      "swordYaw",
      "swordRoll",
      "devProbeX",
      "devProbeY",
      "devProbeZ",
    ]),
    importedMesh: {
      path: mesh.path || tuning.importedMeshPath || "",
      status: mesh.status || "unknown",
      stage: mesh.stage || "not loaded",
      bindMode: mesh.bindMode || "unbound",
    },
  };
}

export function serializePuppetRigPackage(packagePayload) {
  return JSON.stringify(packagePayload, null, 2);
}

export function parsePuppetRigPackageText(text) {
  /*
    Accepts a pasted package string and returns a parsed object.

    Kept here so every import path uses the same JSON parse error behavior.
  */
  return JSON.parse(text);
}

export function extractRigTuningFromPackage(payload) {
  /*
    Backward-compatible package reader.

    Accepted shapes:
      new package:  payload.rigTuning
      old export:   payload.values
      raw tuning:   payload

    The caller still sanitizes the returned tuning against current supported
    keys, because main.js owns the exact rigTuning schema.
  */
  return payload?.rigTuning || payload?.values || payload;
}

function readPuppetRigLibrary(storage) {
  /*
    Reads the browser rig library.

    Storage shape:
      {
        schema: 1,
        savedAt: ISO string,
        rigs: {
          "Rig Name": completeRigPackage
        }
      }

    If anything is missing/corrupt, return an empty library instead of throwing.
  */
  try {
    const raw = storage?.getItem?.(PUPPET_SHOP_LIBRARY_KEY);

    if (!raw) {
      return { schema: PUPPET_RIG_PACKAGE_SCHEMA, savedAt: "", rigs: {} };
    }

    const parsed = JSON.parse(raw);
    const rigs =
      parsed && typeof parsed.rigs === "object" && parsed.rigs
        ? parsed.rigs
        : {};

    return {
      schema: parsed.schema || PUPPET_RIG_PACKAGE_SCHEMA,
      savedAt: parsed.savedAt || "",
      rigs,
    };
  } catch (error) {
    console.warn("[puppetShop] Could not read rig library.", error);
    return { schema: PUPPET_RIG_PACKAGE_SCHEMA, savedAt: "", rigs: {} };
  }
}

function writePuppetRigLibrary(storage, library) {
  const payload = {
    schema: PUPPET_RIG_PACKAGE_SCHEMA,
    savedAt: new Date().toISOString(),
    rigs: library.rigs || {},
  };

  storage?.setItem?.(PUPPET_SHOP_LIBRARY_KEY, JSON.stringify(payload, null, 2));
  return payload;
}

export function getPuppetRigLibraryNames(storage) {
  return Object.keys(readPuppetRigLibrary(storage).rigs).sort((a, b) =>
    a.localeCompare(b),
  );
}

export function savePuppetRigPackageToLibrary(storage, packagePayload) {
  /*
    Saves or replaces a rig package by its metadata.name.

    This is intentionally an overwrite operation. The GUI uses human-readable
    names as slots, like "Sigewynn player" or "enemy crooked shoulders".
  */
  const library = readPuppetRigLibrary(storage);
  const name = normalizePuppetRigName(
    packagePayload?.metadata?.name || packagePayload?.rigTuning?.puppetRigName,
  );
  const packageCopy = cloneJson(packagePayload);

  packageCopy.metadata = {
    ...(packageCopy.metadata || {}),
    name,
    updatedAt: new Date().toISOString(),
  };
  library.rigs[name] = packageCopy;
  writePuppetRigLibrary(storage, library);

  return packageCopy;
}

export function loadPuppetRigPackageFromLibrary(storage, name) {
  const library = readPuppetRigLibrary(storage);
  const key = normalizePuppetRigName(name, "");

  return key && library.rigs[key] ? cloneJson(library.rigs[key]) : null;
}

export function deletePuppetRigPackageFromLibrary(storage, name) {
  const library = readPuppetRigLibrary(storage);
  const key = normalizePuppetRigName(name, "");

  if (!key || !library.rigs[key]) {
    return false;
  }

  delete library.rigs[key];
  writePuppetRigLibrary(storage, library);
  return true;
}

export function summarizePuppetRigPackage(packagePayload) {
  /*
    Short human-readable summary for GUI status and console logs.
  */
  const name = normalizePuppetRigName(packagePayload?.metadata?.name);
  const meshPath =
    packagePayload?.importedMesh?.path ||
    packagePayload?.rigTuning?.importedMeshPath ||
    "no mesh path";
  const stage = packagePayload?.importedMesh?.stage || "unknown stage";
  const motion = packagePayload?.motionProfile?.presetName || "custom";

  return `${name} | mesh: ${meshPath} | ${stage} | motion: ${motion}`;
}
