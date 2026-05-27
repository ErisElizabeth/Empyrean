/*
  EMPYREAN D20 ORACLE MODULE
  ===============================================================

  This module owns the physical d20/oracle object used by combat:

    - d20 tuning/config
    - d20 runtime state
    - rough stone d20 mesh creation
    - numbered face creation and face/value mapping
    - roll start/end quaternions
    - roll value and settled state
    - per-frame roll update while combat is in its rolling phase

  It deliberately does NOT own:

    - enemy decisions
    - combat encounter phase changes
    - player sword animation
    - audio transitions
    - rig calibration or puppet workshop behavior

  Combat asks this module to start a roll, advances it once per frame, then
  consumes the roll result. The oracle knows how the die moves; combat decides
  what the result means.
*/

import * as THREE from "three";

// ===============================================================
// ORACLE CONFIG
// ===============================================================

const ORACLE_D20_CONFIG = {
  // The d20 is no longer a quick arcade spinner. It is an omen. The longer
  // timing gives it a slower, mournful roll before combat begins.
  rollSeconds: 4.2,
  postRollSeconds: 2.1,
  // Instead of floating over the enemy, the die manifests in front of the
  // player so it is prominent no matter where the enemy spawned.
  forwardDistance: 1.75,
  playerHeight: 1.88,
  // Visual size of the d20 in world units (icosahedron radius).
  size: 0.72,
  // Stone texture/material settings. The room wall textures already have the
  // right ancient gray mood, so the die reuses them as rough stone skin.
  diffusePath: "assets/stoneWallDiff.jpg",
  displacementPath: "assets/StoneWallDisp.png",
  color: 0x3f3f3f,
  edgeColor: 0x151515,
  numberColor: "#343434",
  numberShadowLight: "rgba(255, 255, 255, 0.32)",
  numberShadowDark: "rgba(0, 0, 0, 0.72)",
  roughSubdivisions: 4,
  roundedFaceAmount: 0.18,
  roughHewnAmount: 0.018,
};

// ===============================================================
// PUBLIC FACTORY
// ===============================================================

export function createOracleD20({ controlState, rigTuning } = {}) {
  /*
    Creates one self-contained oracle instance.

    The returned object exposes a tiny public API:

      group          - Three.js group to add to the scene
      startRoll()    - choose a d20 value and begin the visual roll
      update(delta)  - advance roll timing/quaternion animation
      hide()         - hide the group
      getRollValue() - read the current result

    controlState and rigTuning are references owned by combat/main. The oracle
    only reads them so it can keep the die in front of the player.
  */
  const oracle = {
    controlState,
    rigTuning,
    group: null,
    d20Mesh: null,
    d20StoneMesh: null,
    d20FacesByValue: {},
    d20NumberFaces: [],
    d20RollStartQuaternion: new THREE.Quaternion(),
    d20RollEndQuaternion: new THREE.Quaternion(),
    d20RollAxis: new THREE.Vector3(0.48, 0.75, 0.46).normalize(),
    d20RollSpinRadians: Math.PI * 10,
    rollValue: 0,
    rollHasSettled: false,
    elapsed: 0,
  };

  oracle.group = buildStoneNumberedD20Group(oracle);
  oracle.group.visible = false;

  return {
    group: oracle.group,

    setContext({
      controlState: nextControlState = oracle.controlState,
      rigTuning: nextRigTuning = oracle.rigTuning,
    } = {}) {
      oracle.controlState = nextControlState;
      oracle.rigTuning = nextRigTuning;
    },

    startRoll() {
      /*
        The actual roll value is decided up-front:

          rollValue = floor(random() * 20) + 1

        The die animation is then aimed at the physical face for that value, so
        the random number dictates the final 3D orientation instead of merely
        changing a flat label.
      */
      oracle.elapsed = 0;
      oracle.rollHasSettled = false;
      oracle.rollValue = Math.floor(Math.random() * 20) + 1;

      positionD20ForPlayer(oracle);
      oracle.group.visible = true;

      oracle.d20RollStartQuaternion.copy(makeRandomD20StartQuaternion());
      oracle.d20RollEndQuaternion.copy(
        getD20FinalQuaternion(oracle, oracle.rollValue),
      );
      oracle.d20RollAxis
        .set(
          0.32 + Math.random() * 0.42,
          0.68 + Math.random() * 0.3,
          0.24 + Math.random() * 0.46,
        )
        .normalize();
      oracle.d20RollSpinRadians =
        Math.PI * (5.2 + Math.random() * 1.2 + oracle.rollValue * 0.045);
      oracle.d20Mesh.quaternion.copy(oracle.d20RollStartQuaternion);

      return {
        rollValue: oracle.rollValue,
        rollHasSettled: oracle.rollHasSettled,
      };
    },

    update(delta) {
      /*
        The d20 is an actual numbered object now:

          rollProgress     - 0..1 across the mournful tumble duration.

          final quaternion - the exact orientation that points the rolled-number
                             face back toward the player/camera.

          decaying spin    - extra rotation multiplied on top early in the roll.
                             It fades to zero, leaving the exact final value
                             visible.
      */
      oracle.elapsed += delta;

      const total =
        ORACLE_D20_CONFIG.rollSeconds + ORACLE_D20_CONFIG.postRollSeconds;
      const rollProgress = Math.min(
        oracle.elapsed / ORACLE_D20_CONFIG.rollSeconds,
        1,
      );

      // Keep the die locked in front of the player during the whole omen. If the
      // player turns mid-roll, the end quaternion is solved again so the rolled
      // face remains readable instead of drifting off-axis.
      positionD20ForPlayer(oracle);
      oracle.d20RollEndQuaternion.copy(
        getD20FinalQuaternion(oracle, oracle.rollValue),
      );
      updateD20RollQuaternion(oracle, rollProgress);

      let settledThisFrame = false;
      if (!oracle.rollHasSettled && rollProgress >= 0.96) {
        oracle.rollHasSettled = true;
        settledThisFrame = true;
        oracle.d20Mesh.quaternion.copy(oracle.d20RollEndQuaternion);
      }

      return {
        rollValue: oracle.rollValue,
        rollHasSettled: oracle.rollHasSettled,
        settledThisFrame,
        complete: oracle.elapsed >= total,
        rollProgress,
        elapsed: oracle.elapsed,
      };
    },

    hide() {
      oracle.group.visible = false;
    },

    show() {
      oracle.group.visible = true;
    },

    getRollValue() {
      return oracle.rollValue;
    },

    isSettled() {
      return oracle.rollHasSettled;
    },
  };
}

// ===============================================================
// D20 CONSTRUCTION
// ===============================================================

function buildStoneNumberedD20Group(oracle) {
  /*
    Builds the upgraded combat die as a true 3D object:

      - one roughened/rounded icosahedron mesh for the stone body
      - one dark edge overlay so it still reads instantly as a d20
      - twenty small face-mounted number planes, one for each result

    The numbers are not a billboard floating in front of the die anymore. Each
    number belongs to an actual face. The roll animation later solves which face
    must point toward the player for the random value that was generated.
  */
  const group = new THREE.Group();
  group.name = "combat-d20";

  const dieGroup = new THREE.Group();
  dieGroup.name = "combat-d20-physical-die";

  const { geometry, faceFrames } = buildRoughD20Geometry(
    ORACLE_D20_CONFIG.size,
    ORACLE_D20_CONFIG.roughSubdivisions,
    ORACLE_D20_CONFIG.roundedFaceAmount,
    ORACLE_D20_CONFIG.roughHewnAmount,
  );

  const stoneMesh = new THREE.Mesh(geometry, makeD20StoneMaterial());
  stoneMesh.name = "combat-d20-stone-body";
  stoneMesh.castShadow = true;
  stoneMesh.receiveShadow = true;
  dieGroup.add(stoneMesh);

  // A subtle edge cage keeps the iconic twenty-sided silhouette readable after
  // the stone surface is rounded and darkened.
  const edgeGeometry = new THREE.EdgesGeometry(
    new THREE.IcosahedronGeometry(ORACLE_D20_CONFIG.size * 1.004, 0),
    12,
  );
  const edgeLines = new THREE.LineSegments(
    edgeGeometry,
    new THREE.LineBasicMaterial({
      color: ORACLE_D20_CONFIG.edgeColor,
      transparent: true,
      opacity: 0.46,
    }),
  );
  edgeLines.name = "combat-d20-dark-edge-lines";
  dieGroup.add(edgeLines);

  oracle.d20FacesByValue = {};
  oracle.d20NumberFaces = [];

  for (const face of faceFrames) {
    const numberMesh = buildD20NumberMesh(oracle, face.value, face);
    dieGroup.add(numberMesh);
    oracle.d20FacesByValue[face.value] = face;
  }

  group.add(dieGroup);

  oracle.d20Mesh = dieGroup;
  oracle.d20StoneMesh = stoneMesh;
  queueD20FontRefresh(oracle);

  return group;
}

function buildRoughD20Geometry(radius, subdivisions, roundness, roughness) {
  /*
    Formula map:

      P(u, v, w) = A*w + B*u + C*v
        where A/B/C are the three vertices of one original icosahedron face,
        u/v/w are barycentric weights, and u + v + w = 1.

      roundedP = lerp(P, normalize(P) * radius, roundness)
        where roundness = 0 keeps a flat d20 face and roundness = 1 would push
        every sampled point onto a sphere. The current value is small, so the
        die keeps its identity while the points and edges stop looking razor-cut.

      roughP = roundedP + N * noise(P) * roughness
        where N is mostly the face normal. This gives a hand-hewn stone wobble
        without changing the large-scale d20 silhouette.
  */
  const baseGeometry = new THREE.IcosahedronGeometry(radius, 0);
  const source = baseGeometry.index ? baseGeometry.toNonIndexed() : baseGeometry;
  const src = source.attributes.position;
  const positions = [];
  const normals = [];
  const uvs = [];
  const faceFrames = [];
  const steps = Math.max(1, Math.floor(subdivisions));

  for (let faceIndex = 0; faceIndex < src.count; faceIndex += 3) {
    const a = new THREE.Vector3().fromBufferAttribute(src, faceIndex);
    const b = new THREE.Vector3().fromBufferAttribute(src, faceIndex + 1);
    const c = new THREE.Vector3().fromBufferAttribute(src, faceIndex + 2);
    const center = new THREE.Vector3()
      .addVectors(a, b)
      .add(c)
      .multiplyScalar(1 / 3);
    const normal = new THREE.Vector3()
      .subVectors(b, a)
      .cross(new THREE.Vector3().subVectors(c, a))
      .normalize();

    // Ensure every face normal points outward. Some generated geometries can
    // wind triangles differently after conversion; dot(center, normal) is the
    // quick sanity check for "does this normal point away from the origin?"
    if (normal.dot(center) < 0) {
      normal.negate();
    }

    const xAxis = new THREE.Vector3().subVectors(b, a).normalize();
    const yAxis = new THREE.Vector3().crossVectors(normal, xAxis).normalize();
    const value = faceIndex / 3 + 1;

    faceFrames.push({
      value,
      center: center.clone(),
      normal: normal.clone(),
      up: yAxis.clone(),
    });

    const makePoint = (uIndex, vIndex) => {
      const u = uIndex / steps;
      const v = vIndex / steps;
      const w = 1 - u - v;
      return new THREE.Vector3()
        .copy(a)
        .multiplyScalar(w)
        .addScaledVector(b, u)
        .addScaledVector(c, v);
    };

    const pushVertex = (point) => {
      const shaped = shapeD20StonePoint(
        point,
        normal,
        radius,
        roundness,
        roughness,
      );
      const local = new THREE.Vector3().subVectors(point, center);
      const smoothNormal = shaped
        .clone()
        .normalize()
        .lerp(normal, 0.38)
        .normalize();

      positions.push(shaped.x, shaped.y, shaped.z);
      normals.push(smoothNormal.x, smoothNormal.y, smoothNormal.z);
      uvs.push(
        0.5 + local.dot(xAxis) / (radius * 1.55),
        0.5 + local.dot(yAxis) / (radius * 1.55),
      );
    };

    const pushTriangle = (p0, p1, p2) => {
      pushVertex(p0);
      pushVertex(p1);
      pushVertex(p2);
    };

    for (let u = 0; u < steps; u += 1) {
      for (let v = 0; v < steps - u; v += 1) {
        const p00 = makePoint(u, v);
        const p10 = makePoint(u + 1, v);
        const p01 = makePoint(u, v + 1);
        pushTriangle(p00, p10, p01);

        if (v < steps - u - 1) {
          const p11 = makePoint(u + 1, v + 1);
          pushTriangle(p10, p11, p01);
        }
      }
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(new Float32Array(positions), 3),
  );
  geometry.setAttribute(
    "normal",
    new THREE.BufferAttribute(new Float32Array(normals), 3),
  );
  geometry.setAttribute(
    "uv",
    new THREE.BufferAttribute(new Float32Array(uvs), 2),
  );
  geometry.computeBoundingSphere();

  return { geometry, faceFrames };
}

function shapeD20StonePoint(point, faceNormal, radius, roundness, roughness) {
  // First push interior face points gently toward the sphere of radius R. This
  // rounds the face and softens the light, while the edge overlay preserves the
  // mechanical d20 outline.
  const spherical = point.clone().normalize().multiplyScalar(radius);
  const shaped = point.clone().lerp(spherical, roundness);

  // Deterministic noise: same input position always produces the same wobble.
  // That makes the die stable frame-to-frame while still feeling hand-carved.
  const noise = deterministicStoneNoise(point) * 2 - 1;
  const roughDirection = point
    .clone()
    .normalize()
    .lerp(faceNormal, 0.52)
    .normalize();
  shaped.addScaledVector(roughDirection, noise * radius * roughness);
  return shaped;
}

function deterministicStoneNoise(point) {
  // Tiny no-library hash. sin(dot(P, constants)) gives a repeatable fractional
  // value in 0..1, good enough for stone chip variation on a small mesh.
  const raw =
    Math.sin(point.x * 41.7 + point.y * 73.1 + point.z * 19.3) * 43758.5453;
  return raw - Math.floor(raw);
}

function makeD20StoneMaterial() {
  const loader = new THREE.TextureLoader();
  const diffuse = loader.load(ORACLE_D20_CONFIG.diffusePath);
  const bump = loader.load(ORACLE_D20_CONFIG.displacementPath);

  for (const texture of [diffuse, bump]) {
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(1.6, 1.6);
  }
  diffuse.colorSpace = THREE.SRGBColorSpace;

  return new THREE.MeshStandardMaterial({
    color: ORACLE_D20_CONFIG.color,
    map: diffuse,
    bumpMap: bump,
    bumpScale: 0.034,
    roughness: 0.94,
    metalness: 0.02,
  });
}

function buildD20NumberMesh(oracle, value, face) {
  const label = createD20NumberTexture(value);
  const material = new THREE.MeshBasicMaterial({
    map: label.texture,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.FrontSide,
    toneMapped: false,
  });

  const faceSize = ORACLE_D20_CONFIG.size * (value >= 10 ? 0.46 : 0.42);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(faceSize, faceSize),
    material,
  );
  mesh.name = `combat-d20-face-number-${value}`;
  mesh.position
    .copy(face.center)
    .addScaledVector(face.normal, ORACLE_D20_CONFIG.size * 0.058);
  orientPlaneToFace(mesh, face.normal, face.up);
  mesh.renderOrder = 8;
  mesh.userData.value = value;

  oracle.d20NumberFaces.push({
    value,
    canvas: label.canvas,
    context: label.context,
    texture: label.texture,
  });

  return mesh;
}

function orientPlaneToFace(mesh, normal, up) {
  /*
    PlaneGeometry's visible front points along local +Z.

    Matrix basis columns are local X, local Y, local Z in world/object space, so:
      local Z = face normal
      local Y = a stable "up" direction on the triangular face
      local X = local Y x local Z
  */
  const zAxis = normal.clone().normalize();
  const yAxis = up.clone().projectOnPlane(zAxis).normalize();
  if (yAxis.lengthSq() < 0.0001) {
    yAxis.set(0, 1, 0).projectOnPlane(zAxis).normalize();
  }
  const xAxis = new THREE.Vector3().crossVectors(yAxis, zAxis).normalize();
  const matrix = new THREE.Matrix4().makeBasis(xAxis, yAxis, zAxis);
  mesh.quaternion.setFromRotationMatrix(matrix);
}

function createD20NumberTexture(value) {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  drawD20NumberCanvas(context, canvas, value);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.needsUpdate = true;

  return { canvas, context, texture };
}

function drawD20NumberCanvas(ctx, canvas, value) {
  /*
    Same visual language as the title card:

      font: Caesar Dressing
      fill: dark stone gray
      light shadow: down/right
      dark shadow: up/left

    Canvas text cannot use CSS background-clip, so the "engraved" feeling comes
    from drawing the same glyph three times with small opposing offsets.
  */
  const text = String(value);
  const fontSize = value >= 10 ? 122 : 148;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.translate(canvas.width / 2, canvas.height / 2);
  ctx.font = `${fontSize}px "Caesar Dressing", Georgia, serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  ctx.fillStyle = ORACLE_D20_CONFIG.numberShadowLight;
  ctx.fillText(text, 3, 4);

  ctx.fillStyle = ORACLE_D20_CONFIG.numberShadowDark;
  ctx.fillText(text, -3, -3);

  ctx.fillStyle = ORACLE_D20_CONFIG.numberColor;
  ctx.fillText(text, 0, 1);
  ctx.restore();
}

function queueD20FontRefresh(oracle) {
  // The Google font can finish after the Three.js mesh is already built. When
  // the font becomes available, repaint all twenty textures so the face numbers
  // match the EMPYREAN title card instead of sticking with the browser fallback.
  if (!document.fonts?.load) {
    return;
  }

  document.fonts
    .load('148px "Caesar Dressing"')
    .then(() => {
      for (const face of oracle.d20NumberFaces) {
        drawD20NumberCanvas(face.context, face.canvas, face.value);
        face.texture.needsUpdate = true;
      }
    })
    .catch(() => {
      // Fallback font is acceptable if the network font fails; keep gameplay
      // moving rather than turning a cosmetic problem into a combat blocker.
    });
}

// ===============================================================
// D20 POSITION AND ROLL MATH
// ===============================================================

function positionD20ForPlayer(oracle) {
  const yaw = oracle.controlState?.yaw || 0;
  const rigX =
    (oracle.controlState?.position?.x || 0) +
    (oracle.rigTuning?.rootOffsetX || 0);
  const rigZ =
    (oracle.controlState?.position?.z || 0) +
    (oracle.rigTuning?.rootOffsetZ || 0);
  const forward = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));

  oracle.group.position.set(
    rigX + forward.x * ORACLE_D20_CONFIG.forwardDistance,
    ORACLE_D20_CONFIG.playerHeight,
    rigZ + forward.z * ORACLE_D20_CONFIG.forwardDistance,
  );
}

function getD20FinalQuaternion(oracle, value) {
  /*
    Solve the final die orientation from a numbered face:

      Qface = rotation from face.normal to viewerNormal
      Qtwist = rotation around viewerNormal that makes the number upright
      Qfinal = Qtwist * Qface

    This is why the d20 can be a real object. The random roll chooses the face,
    and the quaternion math physically turns that face toward the player.
  */
  const face = oracle.d20FacesByValue[value] || oracle.d20FacesByValue[1];
  if (!face) {
    return new THREE.Quaternion();
  }

  const viewerNormal = getD20ViewerNormal(oracle);
  const faceToViewer = new THREE.Quaternion().setFromUnitVectors(
    face.normal.clone().normalize(),
    viewerNormal,
  );

  const currentUp = face.up
    .clone()
    .applyQuaternion(faceToViewer)
    .projectOnPlane(viewerNormal)
    .normalize();
  const desiredUp = new THREE.Vector3(0, 1, 0)
    .projectOnPlane(viewerNormal)
    .normalize();

  if (currentUp.lengthSq() < 0.0001 || desiredUp.lengthSq() < 0.0001) {
    return faceToViewer;
  }

  const cross = new THREE.Vector3().crossVectors(currentUp, desiredUp);
  const angle = Math.atan2(cross.dot(viewerNormal), currentUp.dot(desiredUp));
  const twist = new THREE.Quaternion().setFromAxisAngle(viewerNormal, angle);
  return twist.multiply(faceToViewer);
}

function getD20ViewerNormal(oracle) {
  // This is the die's outward-facing normal that should point back toward the
  // player. A slight upward component presents the face to the camera instead
  // of aiming it perfectly horizontal at the rig's waist.
  const yaw = oracle.controlState?.yaw || 0;
  return new THREE.Vector3(-Math.sin(yaw), 0.18, -Math.cos(yaw)).normalize();
}

function makeRandomD20StartQuaternion() {
  const axis = new THREE.Vector3(
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
    Math.random() * 2 - 1,
  ).normalize();
  const angle = Math.PI * 2 * Math.random();
  return new THREE.Quaternion().setFromAxisAngle(axis, angle);
}

function updateD20RollQuaternion(oracle, rollProgress) {
  const t = THREE.MathUtils.clamp(rollProgress, 0, 1);
  const eased = smootherStep(t);

  const base = oracle.d20RollStartQuaternion
    .clone()
    .slerp(oracle.d20RollEndQuaternion, eased);

  // As eased approaches 1, the overlay spin approaches 0. The final frame is
  // therefore exactly the solved "rolled face toward player" quaternion.
  const remaining = 1 - eased;
  const spin = new THREE.Quaternion().setFromAxisAngle(
    oracle.d20RollAxis,
    oracle.d20RollSpinRadians * remaining * remaining,
  );
  oracle.d20Mesh.quaternion.copy(spin.multiply(base));
}

function smootherStep(t) {
  // 6t^5 - 15t^4 + 10t^3. Starts and ends with zero velocity, which gives the
  // slower mournful roll a heavy stone-settling quality instead of an arcade snap.
  return t * t * t * (t * (t * 6 - 15) + 10);
}
