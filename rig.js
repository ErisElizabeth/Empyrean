import * as THREE from "three";

/*
  EMPYREAN RIG MODULE

  This module owns the default body proportions, rig-dimension slider rows, and
  the creation of the workshop rig's joint hierarchy, debug bone lines, and
  joint labels.

  Current rig stats:
    DEFAULT_RIG_HEIGHT = 4.46 scene units
    headY              = 4.0586
    neckY              = 3.7464
    chestY             = 3.2500
    torsoY             = 2.7300
    pelvisY            = 2.2300
    shoulderX          = 0.4500
    hipX               = 0.4014
    upperArmLength     = 0.7582
    forearmLength      = 0.6601
    thighLength        = 1.0927
    shinLength         = 1.0927

  Total overall height note:
    The default control height is 4.46 scene units. The visible/debug head can
    extend a little above the head pivot depending on marker or mesh shape, but
    this number is the current program height used for rig proportions.
*/

const DEFAULT_GUIDE_COLOR = "#e0dcdc";
const RIG_BASE_BODY_YAW = -Math.PI;
const RIG_BASE_KNEE_YAW = -Math.PI;
const HEAD_MARKER_BASE_SCALE = new THREE.Vector3(6, 9, 9);

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

export const DEFAULT_RIG_HEIGHT = 4.46;

export const DEFAULT_RIG_DIMENSIONS = {
  headY: DEFAULT_RIG_HEIGHT * 0.91,
  neckY: DEFAULT_RIG_HEIGHT * 0.84,
  chestY: DEFAULT_RIG_HEIGHT * 0.7287,
  torsoY: DEFAULT_RIG_HEIGHT * 0.6121,
  pelvisY: DEFAULT_RIG_HEIGHT * 0.5,

  shoulderX: DEFAULT_RIG_HEIGHT * 0.1009,
  hipX: DEFAULT_RIG_HEIGHT * 0.09,

  upperArmLength: DEFAULT_RIG_HEIGHT * 0.17,
  forearmLength: DEFAULT_RIG_HEIGHT * 0.148,

  thighLength: DEFAULT_RIG_HEIGHT * 0.245,
  shinLength: DEFAULT_RIG_HEIGHT * 0.245,
};

export const RIG_DIMENSION_CONTROLS = [
  /*
    Format:
      [propertyName, min, max, step]

    These ranges stay deliberately permissive so the puppet can match stylized
    meshes, long necks, strange limb lengths, and non-human proportions.
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

export const HEAD_MARKER_SIZE_RANGE = { min: 0.1, max: 3, step: 0.01 };

export function createRig({
  scene,
  dimensions = {},
  debugOptions = {},
  configureSkeleton,
  beforeDebugView,
} = {}) {
  const resolvedDimensions = resolveRigDimensions(dimensions);
  const skeleton = createSkeleton(resolvedDimensions);

  skeleton.root.name = "empyrean-puppet-skeleton";

  if (typeof configureSkeleton === "function") {
    configureSkeleton(skeleton);
  }

  scene?.add?.(skeleton.root);

  if (typeof beforeDebugView === "function") {
    beforeDebugView(skeleton);
  }

  const debugView = createDebugView(skeleton, debugOptions);
  const groups = {
    root: skeleton.root,
    body: skeleton.joints.body,
  };

  return Object.assign(skeleton, {
    bones: debugView.bones,
    labels: debugView.labels,
    groups,
    dimensions: resolvedDimensions,
    debugView,
  });
}

export function createSkeleton(dimensions = {}) {
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
  const d = resolveRigDimensions(dimensions);
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

  return { root: joints.root, joints, dimensions: d };
}

function resolveRigDimensions(dimensions = {}) {
  return { ...DEFAULT_RIG_DIMENSIONS, ...dimensions };
}

function createJoint(name, position = [0, 0, 0]) {
  /*
    Creates one puppet joint.

    A joint is a THREE.Group, not a Mesh. It has no visible geometry by itself.
    Its job is to be a transform/pivot that can rotate, move, and carry child
    joints along with it automatically via Three.js's scene-graph parenting.

    WHY THREE.Group, NOT THREE.Bone?
      Three.js Bones are built for SkinnedMesh and come with extra constraints.
      Using plain Groups here keeps the puppet joints simple and inspectable —
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

      You never need to manually update child positions when a parent moves —
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
        for GUI/debug readability. Runtime animation now layers deltas onto
        bindLocalQuaternion so invisible fixture-zero corrections like the knee
        -PI yaw cannot be accidentally erased by pose solvers.

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
  const color = options.color || DEFAULT_GUIDE_COLOR;
  const markerRadius = options.markerRadius || 0.035;
  const initialHeadMarkerSize = THREE.MathUtils.clamp(
    options.headMarkerSize ?? 1,
    HEAD_MARKER_SIZE_RANGE.min,
    HEAD_MARKER_SIZE_RANGE.max,
  );
  const labelScale = options.labelScale || 1;
  const editableJointKeys =
    options.editableJointKeys ||
    Object.keys(skeleton.joints).filter((jointKey) => jointKey !== "root");
  const createLabelSprite = options.makeLabelSprite || makeFallbackLabelSprite;
  const objects = [];
  const labels = [];
  const boneLines = [];
  const selectableMarkers = [];
  let headMarker = null;
  let skeletonOpacity = THREE.MathUtils.clamp(options.opacity ?? 1, 0, 1);
  const applyObjectOpacity = (
    object,
    baseOpacity = object.userData.debugBaseOpacity ?? 1,
  ) => {
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
    marker.userData.isJointEditHandle = editableJointKeys.includes(jointKey);
    applyObjectOpacity(marker, 0.7);

    if (joint.name === "head") {
      headMarker = marker;
      marker.scale
        .copy(HEAD_MARKER_BASE_SCALE)
        .multiplyScalar(initialHeadMarkerSize);
    }

    joint.add(marker);
    objects.push(marker);
    selectableMarkers.push(marker);

    const label = createLabelSprite(joint.name, { color, scale: labelScale });
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
    objects,
    labels,
    bones: boneLines,
    boneLines,
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
    setHeadMarkerSize(size) {
      if (!headMarker) {
        return;
      }

      const safeSize = THREE.MathUtils.clamp(
        Number.isFinite(size) ? size : 1,
        HEAD_MARKER_SIZE_RANGE.min,
        HEAD_MARKER_SIZE_RANGE.max,
      );
      headMarker.scale.copy(HEAD_MARKER_BASE_SCALE).multiplyScalar(safeSize);
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

function makeFallbackLabelSprite(text, options = {}) {
  /*
    Creates a 2D canvas label as a Three.js Sprite.

    This mirrors the shared world label helper so createRig({ scene }) can work
    from rig.js alone. main.js still passes the existing label factory to keep
    the workshop path on the exact same rendering helper it already used.
  */
  const canvas = document.createElement("canvas");
  canvas.width = 500;
  canvas.height = 80;

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(0, 0, 0, 0.55)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = options.color || DEFAULT_GUIDE_COLOR;
  context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  context.fillStyle = options.color || DEFAULT_GUIDE_COLOR;
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
