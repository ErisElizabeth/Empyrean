/*
  EMPYREAN SKIN MODULE

  Owns the full mesh-import pipeline:
    - GLTF loading
    - Static preview (render-then-adjust workflow)
    - Generated skin weights (rig-then-deform workflow)
    - Sync of puppet joints to generated bones every frame
    - Import presentation (opacity, wireframe, visibility)
    - Dispose helpers

  Context injection:
    main.js calls initSkin({ state, rigTuning, updateGuiDisplays, ... }) once
    before any other skin function runs. All module functions then close over
    _ctx instead of importing directly from main.js, which avoids circular
    imports.

  Import rule:
    This module imports THREE, GLTFLoader, and disposeObjectTree from world.js.
    It does not import from main.js or rig.js.
*/

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { disposeObjectTree } from "./world.js";

export const DEFAULT_IMPORTED_MESH_PATH = "assets/Sigewynn.glb";

const gltfLoader = new GLTFLoader();

// _ctx is set by initSkin() before any other export is called.
let _ctx = null;

export function initSkin({
  state,
  rigTuning,
  updateGuiDisplays,
  onAfterImportedMeshRigged,
}) {
  _ctx = {
    state,
    rigTuning,
    updateGuiDisplays,
    onAfterImportedMeshRigged,
  };

  // Diagnostic-only: exposes a console function for inspecting skin weight
  // assignment. Read-only; safe to remove later by deleting this assignment
  // and the dumpSkinDiagnostic function at the bottom of this module.
  if (typeof window !== "undefined") {
    window.empyreanDumpSkin = dumpSkinDiagnostic;
  }
}

// =============================================================
// PATH RESOLUTION
// =============================================================

export function getActiveMeshPath() {
  /*
    Returns the best available path for loading a mesh.

    Priority:
      1. state.meshBlobUrl — session-only blob:// from the file browser.
         Revoked on clear or new file selection.
      2. rigTuning.importedMeshPath — typed or saved relative path.
         Works across sessions and can be exported.
      3. DEFAULT_IMPORTED_MESH_PATH — built-in fallback.
  */
  return (
    _ctx.state.meshBlobUrl ||
    _ctx.rigTuning.importedMeshPath ||
    DEFAULT_IMPORTED_MESH_PATH
  );
}

// =============================================================
// HIGH-LEVEL WORKFLOW HELPERS
// =============================================================

export function renderDefaultImportedMesh() {
  /*
    Step 1 of the render-adjust-rig workflow:
      load and display the mesh as a static preview.

    The preview is not skinned yet. It lets you move pivots and bind-pose
    rotations while visually comparing the skeleton to the model.
  */
  loadImportedMeshPreviewFromPath(getActiveMeshPath());
  _ctx.updateGuiDisplays();
}

export function loadDefaultImportedMesh() {
  /*
    Convenience shortcut: load the default mesh and rig it immediately.

    Useful when the current pivot setup is already good and you do not need
    the separate preview stage.
  */
  loadImportedMeshFromPath(getActiveMeshPath());
  _ctx.updateGuiDisplays();
}

export function rerigImportedMesh() {
  // Re-runs the current mesh through the generated skin-weight pipeline.
  // Use after changing offsets, rotations, scale, or import orientation.
  if (!_ctx.state.importedSkin) {
    return;
  }

  loadImportedMeshFromPath(getActiveMeshPath());
}

export function rigCurrentImportedMesh() {
  /*
    Step 2 of the render-adjust-rig workflow:
      if a preview GLTF is already loaded, reuse that exact loaded data and rig
      it. Otherwise, load from rigTuning.importedMeshPath.

    Reusing the preview avoids needing the user to type the path again.
  */
  const state = _ctx.state;

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

  loadImportedMeshFromPath(getActiveMeshPath());
}

export function refreshImportedMeshReference() {
  /*
    Called when import sliders change.

    If the mesh is currently only a preview, refresh the preview.
    If it is already rigged, refresh the rigged version.
  */
  const { state, rigTuning } = _ctx;

  if (state.importedPreview) {
    loadImportedMeshPreviewFromPath(rigTuning.importedMeshPath);
    return;
  }

  if (state.importedSkin) {
    loadImportedMeshFromPath(rigTuning.importedMeshPath);
  }
}

// =============================================================
// CLEAR AND DISPOSE
// =============================================================

export function clearImportedMesh() {
  // Removes both preview and rigged mesh from the scene. The skeleton remains.
  disposeImportedPreview();
  disposeImportedSkin();
  // Revoke the blob URL if one was created by the file browser. Without this,
  // the browser holds the file data in memory for the rest of the session.
  const state = _ctx.state;

  if (state.meshBlobUrl) {
    URL.revokeObjectURL(state.meshBlobUrl);
    state.meshBlobUrl = null;
  }

  state.importedMeshStatus = "mesh cleared";
  console.info("Cleared imported Empyrean mesh.");
}

export function disposeImportedPreview() {
  // Safely removes the static imported preview and disposes its GPU resources
  // so repeated imports do not leak geometry, materials, or textures.
  const state = _ctx.state;

  if (!state.importedPreview?.group) {
    state.importedPreview = null;
    return;
  }

  state.importedPreview.group.parent?.remove(state.importedPreview.group);
  disposeObjectTree(state.importedPreview.group);
  state.importedPreview = null;
}

export function disposeImportedSkin() {
  // Safely removes the generated SkinnedMesh version of the import.
  const state = _ctx.state;

  if (!state.importedSkin?.group) {
    state.importedSkin = null;
    return;
  }

  state.importedSkin.group.parent?.remove(state.importedSkin.group);
  disposeObjectTree(state.importedSkin.group);
  state.importedSkin = null;
}

// =============================================================
// LOADING
// =============================================================

export function loadImportedMeshPreviewFromPath(path = DEFAULT_IMPORTED_MESH_PATH) {
  /*
    Asynchronously loads a GLB/GLTF and renders it as a static reference.

    gltfLoader.load() callbacks:
      success  = renderImportedMeshPreview()
      progress = undefined
      error    = status + console error
  */
  if (!path) {
    return;
  }

  _ctx.state.importedMeshStatus = `rendering ${path}`;

  gltfLoader.load(
    path,
    (gltf) => {
      try {
        renderImportedMeshPreview(gltf, path);
        _ctx.state.importedMeshStatus = `rendered ${path}`;
        console.info("Rendered Empyrean mesh preview.", {
          path,
          meshes: _ctx.state.importedPreview.meshes.length,
          mode: "static reference mesh",
        });
      } catch (error) {
        _ctx.state.importedMeshStatus = "mesh render failed";
        console.error("Could not render imported mesh preview.", error);
      }
    },
    undefined,
    (error) => {
      _ctx.state.importedMeshStatus = "mesh load failed";
      console.error(`Could not load imported mesh preview from ${path}.`, error);
    },
  );
}

export function loadImportedMeshFromPath(path = DEFAULT_IMPORTED_MESH_PATH) {
  /*
    Loads a GLB/GLTF and immediately converts it into a generated SkinnedMesh.

    This is the one-click path. The more careful workflow is:
      1 render mesh → adjust pivots/sliders → 2 rig rendered mesh
  */
  if (!path) {
    return;
  }

  _ctx.state.importedMeshStatus = `loading ${path}`;

  gltfLoader.load(
    path,
    (gltf) => {
      try {
        rigImportedMeshFromGltfClone(gltf, path);
        _ctx.state.importedMeshStatus = `loaded ${path}`;
        console.info("Imported and rigged Empyrean mesh.", {
          path,
          meshes: _ctx.state.importedSkin.meshes.length,
          bindMode: "generated position weights",
        });
      } catch (error) {
        _ctx.state.importedMeshStatus = "mesh rig failed";
        console.error("Could not rig imported mesh.", error);
      }
    },
    undefined,
    (error) => {
      _ctx.state.importedMeshStatus = "mesh load failed";
      console.error(`Could not load imported mesh from ${path}.`, error);
    },
  );
}

// =============================================================
// INTERNAL — MESH CREATION
// =============================================================

function renderImportedMeshPreview(gltf, path) {
  // Clears any previous import, builds a static preview group, and attaches it
  // to the skeleton root so root alignment controls affect both rig and mesh.
  const state = _ctx.state;

  disposeImportedPreview();
  disposeImportedSkin();

  state.importedPreview = createPreviewMeshFromGltf(gltf, path);
  state.skeleton.root.add(state.importedPreview.group);
  applyImportedMeshPresentation();
}

function rigImportedMeshFromGltfClone(gltf, path) {
  /*
    Converts loaded GLTF data into the rigged skin version.

    The resulting state.importedSkin contains:
      group        = root group attached to the skeleton root
      meshes       = one or more THREE.SkinnedMesh objects
      boneBindings = maps from puppet joint names to generated bones
      path         = source asset path
  */
  const state = _ctx.state;

  disposeImportedPreview();
  disposeImportedSkin();

  state.importedSkin = createRiggedSkinFromGltf(gltf, path);
  state.skeleton.root.add(state.importedSkin.group);
  syncImportedSkinToPuppet();
  applyImportedMeshPresentation();
  notifyImportedMeshRigged(path);
}

function notifyImportedMeshRigged(path) {
  /*
    Reports the exact moment a mesh has finished binding to the generated
    skeleton.

    Why skin.js owns this call:
      There are several rigging doorways now:
        - "2 rig mesh" reuses an already-rendered preview synchronously.
        - "quick rig" loads a GLB asynchronously, then rigs it.
        - "re-rig" regenerates an existing skin.

      main.js needs one reliable completion signal for all of those routes so it
      can restore the temporary T/A-pose arm bind rotations back to gameplay
      rest. Putting the callback here means every successful rig path gets the
      same cleanup instead of relying on each GUI button to remember it.
  */
  _ctx.onAfterImportedMeshRigged?.({
    path,
    meshes: _ctx.state.importedSkin?.meshes?.length || 0,
  });
}

function createPreviewMeshFromGltf(gltf, path) {
  /*
    Creates a non-rigged preview mesh.

    Uses the same geometry preparation as the rigged version:
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

  return { group, gltf, meshes, path };
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

    const skinnedMesh = new THREE.SkinnedMesh(meshInfo.geometry, meshInfo.material);
    const skeleton    = new THREE.Skeleton(boneRig.bones);

    skinnedMesh.name = `${meshInfo.name || "imported-mesh"}-generated-skin`;
    skinnedMesh.frustumCulled = false;
    skinnedMesh.add(boneRig.rootBone);
    skinnedMesh.bind(skeleton);

    group.add(skinnedMesh);
    skinMeshes.push(skinnedMesh);
    boneBindings.push(boneRig.bonesByJointKey);
  });

  return { group, meshes: skinMeshes, boneBindings, path };
}

function collectImportableMeshes(root) {
  /*
    Finds every Mesh under the loaded GLTF scene.

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
      combinedBox  = bounding box around every prepared mesh part
      center       = geometric center of combinedBox
      rawHeight    = combinedBox.max.y - combinedBox.min.y
      targetHeight = skeleton height target from getImportedMeshTargetHeight()
      autoFitScale = targetHeight / rawHeight when auto-fit is on, otherwise 1
      finalScale   = autoFitScale * importedMeshScale slider
  */
  const { rigTuning } = _ctx;
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

  const center      = combinedBox.getCenter(new THREE.Vector3());
  const rawHeight   = Math.max(0.001, combinedBox.max.y - combinedBox.min.y);
  const autoFitScale = rigTuning.importedMeshAutoFit
    ? getImportedMeshTargetHeight() / rawHeight
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

      Centers the model in X/Z and places the lowest point at floor height
      before scaling and offsetting.
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

    Falls back to a neutral gray MeshStandardMaterial if nothing is present.
  */
  const { rigTuning } = _ctx;
  const material = Array.isArray(sourceMaterial)
    ? sourceMaterial.map((entry) => entry.clone())
    : sourceMaterial?.clone?.() ||
      new THREE.MeshStandardMaterial({ color: "#cfcfcf" });

  getMaterialList(material).forEach((entry) => {
    entry.side        = THREE.DoubleSide;
    entry.transparent = true;
    entry.opacity     = rigTuning.importedMeshOpacity;
    entry.wireframe   = rigTuning.importedMeshWireframe;
    entry.needsUpdate = true;
  });

  return material;
}

function getMaterialList(material) {
  // Imported meshes may have one material or an array. Normalizes both to array.
  return Array.isArray(material) ? material : [material];
}

function getImportedMeshTargetHeight() {
  // headY is the top skeleton pivot; the wire head extends slightly above it.
  return Math.max(1, _ctx.rigTuning.headY + 0.42);
}

// =============================================================
// INTERNAL — BIND POSITION AND BONE HIERARCHY
// =============================================================

function getBindPositionsByJointKey() {
  /*
    Computes bind-pose world positions for every puppet joint.

    Done manually instead of asking Three.js for current world positions
    because animation may already be changing the live joints. Skin weights
    should be based on the neutral bind pose, not the current animated pose.

    Formula for each child:
      worldPosition    = parentWorldPosition +
                         localBindPosition rotated by parentWorldQuaternion
      worldQuaternion  = parentWorldQuaternion * localBindQuaternion
  */
  const { skeleton } = _ctx.state;
  const jointToKey = new Map(
    Object.entries(skeleton.joints).map(([key, joint]) => [joint, key]),
  );
  const bindPositions = {};

  function visit(joint, parentPosition, parentQuaternion) {
    const key = jointToKey.get(joint);
    const localPosition =
      joint.userData.bindLocalPosition || joint.position || new THREE.Vector3();
    const localQuaternion =
      joint.userData.bindLocalQuaternion || joint.quaternion || new THREE.Quaternion();
    const worldBindPosition = parentPosition
      .clone()
      .add(localPosition.clone().applyQuaternion(parentQuaternion));
    const worldBindQuaternion = parentQuaternion.clone().multiply(localQuaternion);

    if (key) {
      bindPositions[key] = worldBindPosition;
    }

    joint.children.forEach((child) => {
      if (child.userData.isPuppetJoint) {
        visit(child, worldBindPosition, worldBindQuaternion);
      }
    });
  }

  visit(skeleton.joints.root, new THREE.Vector3(), new THREE.Quaternion());
  return bindPositions;
}

function createSkinBoneHierarchy() {
  /*
    Creates a real THREE.Bone hierarchy that mirrors the puppet joint hierarchy.

    SkinnedMesh expects Bone objects in a Skeleton. Keeping generated bones
    separate lets the workshop controls stay as readable THREE.Group pivots
    while the mesh deformation system gets what Three.js expects.

    Returned maps:
      bonesByJointKey     = joint name -> generated Bone object
      boneIndexByJointKey = joint name -> index used by skinIndex attribute
  */
  const { skeleton } = _ctx.state;
  const jointToKey = new Map(
    Object.entries(skeleton.joints).map(([key, joint]) => [joint, key]),
  );
  const bones = [];
  const bonesByJointKey = {};
  const boneIndexByJointKey = {};

  function cloneJointAsBone(joint) {
    const key  = jointToKey.get(joint);
    const bone = new THREE.Bone();

    bone.name = `${key || joint.name}-generated-bone`;
    bone.position.copy(joint.userData.bindLocalPosition || joint.position);
    bone.quaternion.copy(joint.userData.bindLocalQuaternion || joint.quaternion);
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

  const rootBone = cloneJointAsBone(skeleton.joints.root);

  return { rootBone, bones, bonesByJointKey, boneIndexByJointKey };
}

function addGeneratedSkinWeights(geometry, bindPositions, boneIndexByJointKey) {
  /*
    Adds skinIndex and skinWeight attributes to geometry.

    For every vertex:
      1. chooseSkinInfluences() decides up to four puppet joints that should
         affect that vertex.
      2. skinIndex stores the numeric bone indices.
      3. skinWeight stores how strongly each bone affects the vertex.

    Three.js expects four slots per vertex; unused slots get a fallback joint
    and zero weight.
  */
  const positionAttribute = geometry.attributes.position;
  const skinIndices  = [];
  const skinWeights  = [];
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

  geometry.setAttribute("skinIndex",  new THREE.Uint16BufferAttribute(skinIndices, 4));
  geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
}

// =============================================================
// INTERNAL — SKIN WEIGHT SELECTION
// =============================================================

function chooseSkinInfluences(vertex, bindPositions) {
  /*
    Chooses candidate joints for one vertex using rough anatomical regions.

    Intentionally approximate — generated rigging, not hand-painted.

    Decision tree (order matters):
      - vertex outside torso at arm height -> shoulder/elbow/wrist/palm
      - vertex at/above neck               -> head and neck
      - vertex below pelvis, off-center    -> hip/knee/ankle/foot
      - everything else                    -> pelvis/spine/chest/neck

    Why the arm branch runs first:
      G53 drag-to-match-mesh can lift the shoulder joint above the neck joint
      (Sigewynn-style tall-shoulder rigs). When that happens, some elbow mesh
      vertices end up at y >= neckY. If the head/neck branch is checked first
      with no X bound, those elbow vertices get bound to head/neck and never
      follow the arm — the visible result is a stretching band between the
      shoulder cap (correctly arm-bound) and the wrist (correctly arm-bound).
      Putting the arm branch first means "clearly far out from centerline at
      arm height" wins over "above neckY," which is the right call for an
      anatomical rig. Typical head/hair/ear vertices stay close to centerline
      so they fail outsideTorso and correctly fall through to head/neck.

    Chosen candidates are then weighted by inverse-square distance.
  */
  const pelvisY   = bindPositions.pelvis.y;
  const neckY     = bindPositions.neck.y;
  const shoulderY = Math.max(bindPositions.leftShoulder.y, bindPositions.rightShoulder.y);
  const wristY    = Math.min(bindPositions.leftWrist.y,    bindPositions.rightWrist.y);
  const shoulderX = Math.max(
    Math.abs(bindPositions.leftShoulder.x),
    Math.abs(bindPositions.rightShoulder.x),
  );
  const hipX = Math.max(
    Math.abs(bindPositions.leftHip.x),
    Math.abs(bindPositions.rightHip.x),
  );

  const absX         = Math.abs(vertex.x);
  const outsideTorso = absX > Math.max(hipX + 0.12, shoulderX * 0.58);
  const inArmHeight  = vertex.y > wristY - 0.3 && vertex.y < shoulderY + 0.5;
  const inLegHeight  = vertex.y <= pelvisY + 0.16;

  if (outsideTorso && inArmHeight) {
    const sideName = chooseNearestBindSide(vertex, bindPositions, "Shoulder");

    return weightedNearestJoints(
      vertex,
      [`${sideName}Shoulder`, `${sideName}Elbow`, `${sideName}Wrist`, `${sideName}Palm`],
      bindPositions,
    );
  }

  if (vertex.y >= neckY) {
    return weightedNearestJoints(vertex, ["head", "neck"], bindPositions);
  }

  if (inLegHeight && absX > hipX * 0.35) {
    const sideName = chooseNearestBindSide(vertex, bindPositions, "Hip");

    return weightedNearestJoints(
      vertex,
      [`${sideName}Hip`, `${sideName}Knee`, `${sideName}Ankle`, `${sideName}Foot`],
      bindPositions,
    );
  }

  return weightedNearestJoints(
    vertex,
    ["pelvis", "spineBase", "chest", "neck"],
    bindPositions,
  );
}

function chooseNearestBindSide(vertex, bindPositions, referenceJointSuffix) {
  /*
    Chooses "left" or "right" from the CURRENT bind-pose joint locations.

    OLD ASSUMPTION:
      sideName = vertex.x < 0 ? "left" : "right"

    That was simple, but it assumed the left-named skeleton joints were always
    on negative X and the right-named skeleton joints were always on positive X.
    A whole-body 180 degree Y bind rotation breaks that assumption:

      rotateY(PI) turns X into -X

    so the left shoulder can physically land on the positive-X side of the
    model while still being named "leftShoulder".

    NEW FORMULA:
      leftDistance  = abs(vertex.x - leftReference.x)
      rightDistance = abs(vertex.x - rightReference.x)
      sideName      = leftDistance <= rightDistance ? "left" : "right"

    where:
      vertex.x         = the prepared mesh vertex's X coordinate
      leftReference.x  = the bind-pose X coordinate of leftShoulder/leftHip
      rightReference.x = the bind-pose X coordinate of rightShoulder/rightHip

    Result:
      Skin weights follow the visible bind-pose skeleton side, even if the user
      rotates the body 180 degrees while aligning a backwards-facing GLB.
  */
  const leftReference = bindPositions[`left${referenceJointSuffix}`];
  const rightReference = bindPositions[`right${referenceJointSuffix}`];

  if (!leftReference || !rightReference) {
    // Defensive fallback for incomplete experimental rigs.
    return vertex.x < 0 ? "left" : "right";
  }

  const leftDistance = Math.abs(vertex.x - leftReference.x);
  const rightDistance = Math.abs(vertex.x - rightReference.x);

  return leftDistance <= rightDistance ? "left" : "right";
}

function weightedNearestJoints(vertex, jointKeys, bindPositions) {
  /*
    Calculates inverse-square distance weights.

    Formula:
      rawWeight        = 1 / distance^2
      normalizedWeight = rawWeight / sum(all rawWeights)

    Nearby joints dominate strongly; farther joints contribute a little.
    That creates smoother bends than simply picking one nearest joint.
  */
  const weighted = jointKeys
    .filter((key) => bindPositions[key])
    .map((key) => ({
      key,
      rawWeight: 1 / Math.pow(Math.max(0.0001, vertex.distanceTo(bindPositions[key])), 2),
    }))
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

// =============================================================
// FRAME SYNC AND PRESENTATION
// =============================================================

export function syncImportedSkinToPuppet() {
  /*
    Every animation frame, copies current puppet joint transforms onto the
    generated bones with matching joint keys.

    Puppet joint:  human-readable control object, animated by main.js
    Generated bone: deformation object used by THREE.SkinnedMesh

    This bridge is what makes the imported mesh move with the workshop skeleton.
  */
  const { state } = _ctx;

  if (!state.importedSkin) {
    return;
  }

  state.importedSkin.boneBindings.forEach((bonesByJointKey) => {
    Object.entries(bonesByJointKey).forEach(([key, bone]) => {
      const joint = state.skeleton.joints[key];

      if (!joint || key === "root") {
        bone.position.copy(joint?.userData.bindLocalPosition || new THREE.Vector3());
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

export function applyImportedMeshPresentation() {
  // Applies display-only settings — visible, opacity, wireframe — to both the
  // static preview and the rigged skin whenever a slider changes.
  const { state, rigTuning } = _ctx;
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
        material.opacity     = rigTuning.importedMeshOpacity;
        material.wireframe   = rigTuning.importedMeshWireframe;
        material.needsUpdate = true;
      });
    });
  });
}

// =============================================================
// DIAGNOSTIC (console-only, read-only)
// =============================================================

function dumpSkinDiagnostic() {
  /*
    Read-only diagnostic for skin weight assignment debugging.

    Call from the DevTools console as:
      empyreanDumpSkin()

    Sections printed:
      1. bindRotationOffsets for arm-chain joints
         - tells you whether T-preset (shoulder z = +/-1.57) is currently set
      2. bindPositions (world space) for arm-chain joints
         - tells you the layout the skin algorithm "sees" at rigging time
      3. Per-mesh left-arm vertex weight samples bucketed by X position
         - for each region from torso centerline out to the hand, shows the
           single mesh vertex closest to that reference X (at shoulder height)
           and its four skinning influences with weights
         - a vertex whose dominant bone does NOT match the region label is
           the smoking gun for "stays in T"

    Does not mutate state. Safe to call anytime.
  */
  if (!_ctx) {
    console.warn("[skin diagnostic] skin module not initialized yet");
    return;
  }

  const { state, rigTuning } = _ctx;

  console.group("%c[skin diagnostic]", "color:#7cf;font-weight:bold");

  // ----- 1. bind rotation offsets -----
  const armKeys = [
    "leftClavicle", "leftShoulder", "leftElbow", "leftWrist", "leftPalm",
    "rightClavicle", "rightShoulder", "rightElbow", "rightWrist", "rightPalm",
  ];
  const bindRot = armKeys.reduce((acc, key) => {
    const r = rigTuning?.bindRotationOffsets?.[key];
    if (r) acc[key] = { x: +r.x.toFixed(3), y: +r.y.toFixed(3), z: +r.z.toFixed(3) };
    return acc;
  }, {});
  console.group("1. bindRotationOffsets (arm chain)");
  console.table(bindRot);
  console.log("   T-preset signature: shoulder z ~ +/-1.57 (left=-1.57, right=+1.57)");
  console.groupEnd();

  if (!state.skeleton) {
    console.warn("no skeleton present yet");
    console.groupEnd();
    return;
  }

  // ----- 2. live bindPositions -----
  const bindPositions = getBindPositionsByJointKey();
  const positionKeys = [...armKeys, "chest", "spineBase", "pelvis", "neck"];
  const bindPosTable = positionKeys.reduce((acc, key) => {
    const p = bindPositions[key];
    if (p) acc[key] = { x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3) };
    return acc;
  }, {});
  console.group("2. bindPositions (world space, computed live)");
  console.table(bindPosTable);
  console.log(
    "   At T-pose preset, leftElbow.x should be roughly leftShoulder.x - upperArmLength",
  );
  console.groupEnd();

  // ----- 3. vertex weight samples -----
  if (!state.importedSkin) {
    console.log("3. no rigged mesh present - run '2 rig mesh' or 'quick rig' first");
    console.groupEnd();
    return;
  }

  const lS = bindPositions.leftShoulder;
  const lE = bindPositions.leftElbow;
  const lW = bindPositions.leftWrist;
  const lP = bindPositions.leftPalm;
  const shoulderY = lS.y;
  // Body's neutral facing correction (-PI yaw) can put the named "left" joints
  // on +X. Detect which sign the left side actually lives on so the side filter
  // matches the named-side semantics rather than world-axis sign.
  const leftSign = lS.x >= 0 ? 1 : -1;

  const refs = [
    { label: "centerline (torso)", x: 0 },
    { label: "shoulder/torso mid", x: lS.x * 0.5 },
    { label: "shoulder",           x: lS.x },
    { label: "shoulder-elbow mid", x: (lS.x + lE.x) / 2 },
    { label: "elbow",              x: lE.x },
    { label: "elbow-wrist mid",    x: (lE.x + lW.x) / 2 },
    { label: "wrist",              x: lW.x },
    { label: "palm/hand",          x: lP.x },
  ];
  console.log(
    `   left-arm side detected on ${leftSign > 0 ? "+X" : "-X"} (leftShoulder.x = ${lS.x.toFixed(3)})`,
  );

  state.importedSkin.meshes.forEach((skinnedMesh, meshIndex) => {
    const geometry = skinnedMesh.geometry;
    const positions = geometry.attributes.position;
    const skinIndices = geometry.attributes.skinIndex;
    const skinWeights = geometry.attributes.skinWeight;

    if (!positions || !skinIndices || !skinWeights) {
      console.log(`mesh ${meshIndex}: missing position/skin attributes`);
      return;
    }

    const bones = skinnedMesh.skeleton.bones;
    const boneName = (idx) =>
      (bones[idx]?.name || `?${idx}`).replace(/-generated-bone$/, "");

    const closest = refs.map((r) => ({
      label: r.label,
      refX: +r.x.toFixed(2),
      bestDx: Infinity,
      best: null,
      bones: null,
    }));
    const vertex = new THREE.Vector3();

    for (let i = 0; i < positions.count; i++) {
      vertex.fromBufferAttribute(positions, i);
      // Keep vertices on the left-arm side (or near centerline). leftSign
      // accounts for the body-yaw flip — left can live on +X or -X.
      if (vertex.x * leftSign < -0.05) continue;
      if (Math.abs(vertex.y - shoulderY) > 0.15) continue; // shoulder-height band

      closest.forEach((c) => {
        const dx = Math.abs(vertex.x - c.refX);
        if (dx < c.bestDx) {
          c.bestDx = dx;
          c.best = {
            idx: i,
            x: +vertex.x.toFixed(2),
            y: +vertex.y.toFixed(2),
            z: +vertex.z.toFixed(2),
          };
          c.bones = [
            `${boneName(skinIndices.getX(i))}=${skinWeights.getX(i).toFixed(2)}`,
            `${boneName(skinIndices.getY(i))}=${skinWeights.getY(i).toFixed(2)}`,
            `${boneName(skinIndices.getZ(i))}=${skinWeights.getZ(i).toFixed(2)}`,
            `${boneName(skinIndices.getW(i))}=${skinWeights.getW(i).toFixed(2)}`,
          ];
        }
      });
    }

    const table = closest.reduce((acc, c) => {
      if (!c.best) {
        acc[c.label] = { refX: c.refX, vx: "-", vy: "-", vz: "-", bone1: "(no vertex)" };
      } else {
        acc[c.label] = {
          refX: c.refX,
          vx: c.best.x,
          vy: c.best.y,
          vz: c.best.z,
          bone1: c.bones[0],
          bone2: c.bones[1],
          bone3: c.bones[2],
          bone4: c.bones[3],
        };
      }
      return acc;
    }, {});

    console.group(
      `3. mesh ${meshIndex}: left-arm vertex weight samples (y ~ ${shoulderY.toFixed(2)})`,
    );
    console.table(table);
    console.log(
      "   Read each row: bone1..bone4 are the 4 skin influences with weights summing to ~1.",
    );
    console.log(
      "   Red flag: a vertex in the 'elbow' or 'forearm' band whose dominant bone is chest/spineBase/pelvis/neck.",
    );
    console.groupEnd();
  });

  console.groupEnd();
}
