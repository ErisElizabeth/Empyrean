import * as THREE from "three";
import {
  getLegStrideValues,
  getRunStrideValues,
} from "./physics.js?v=0.2.25-alpha";
import { isWalkableTerrainHit } from "./terrain.js?v=0.2.25-alpha";

const ZERO_TURN_POSE = Object.freeze({
  headYaw: 0,
  neckYaw: 0,
  chestYaw: 0,
  bodyRoll: 0,
  pelvisRoll: 0,
});

export function updateLocomotion(rig, state, terrainMeshes, deltaTime) {
  const speed = state.speed || 0;
  const isWalking = Boolean(state.isWalking || state.walkPreview || speed > 0);
  const turnBlendWeight = isWalking
    ? 0
    : THREE.MathUtils.clamp(
        state.turnBlendWeight ?? (state.isTurningInPlace ? 1 : 0),
        0,
        1,
      );
  const turnIntensity = isWalking
    ? 0
    : THREE.MathUtils.clamp(
        state.turnIntensity ?? (state.isTurningInPlace ? 1 : 0),
        0,
        1,
      );
  const turnMotionWeight = turnBlendWeight * turnIntensity;
  const isTurningInPlace = Boolean(turnBlendWeight > 0.001 && !isWalking);
  const turnDirection = Math.sign(state.turnVelocity || 0) || 1;
  const runBlendWeight = getRunBlendWeight(state);
  const turnPose = getTurnPose(state);
  const phase = Number.isFinite(state.phase) ? state.phase : getPhaseFromTime(state);
  const fWalk = state.walkFrequency || 1.5;
  const fRun = state.runFrequency || 2.5;
  const f = THREE.MathUtils.lerp(fWalk, fRun, runBlendWeight);
  const vMax = state.maxSpeed || 10;

  if (!isWalking && !isTurningInPlace) {
    relaxToBindPose(rig, deltaTime, state.relaxDamping || 10);
    if (state.idleMotion !== false) {
      updateIdleMotion(rig, state, deltaTime);
    }
    updateJumpPose(rig, state, deltaTime);
    return;
  }

  if (state.idleMotion !== false) {
    updateIdleMotion(rig, state, deltaTime);
  }

  const walkBounce = state.walkBounce ?? 0.05;
  const runBounce = state.runBounce ?? 0.15;
  const turnBounce = state.turnBounce ?? 0.025;
  const walkBounceY = walkBounce * Math.abs(Math.sin(phase * 0.5));
  let runBounceY = runBounce * Math.abs(Math.sin(phase));
  const cyclePhase = cycle01(phase);
  const flightLen = 0.15;
  const flightDuration = flightLen / Math.max(0.001, f);
  const gravity = 9.8;
  const launchVelocity = 0.5 * gravity * flightDuration;

  if (cyclePhase > 0.35 && cyclePhase < 0.5) {
    const flightTime = (cyclePhase - 0.35) / Math.max(0.001, f);
    const flightY =
      launchVelocity * flightTime - 0.5 * gravity * flightTime * flightTime;
    runBounceY = Math.max(runBounceY, flightY);
  } else if (cyclePhase > 0.85 && cyclePhase < 1.0) {
    const flightTime = (cyclePhase - 0.85) / Math.max(0.001, f);
    const flightY =
      launchVelocity * flightTime - 0.5 * gravity * flightTime * flightTime;
    runBounceY = Math.max(runBounceY, flightY);
  }
  const walkRunBounceY = THREE.MathUtils.lerp(
    walkBounceY,
    runBounceY,
    runBlendWeight,
  );
  const yBounce = isTurningInPlace
    ? turnMotionWeight * turnBounce * Math.abs(Math.sin(phase))
    : walkRunBounceY;

  const joints = rig.joints || {};
  const basePelvisY = joints.pelvis?.userData?.bindLocalPosition?.y ?? 0;
  if (joints.pelvis) {
    joints.pelvis.position.y = basePelvisY + yBounce;
  }

  const maxLean = state.maxLean ?? THREE.MathUtils.degToRad(8);
  const pitchLean = (speed / Math.max(0.001, vMax)) * maxLean;
  const qLean = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    -pitchLean,
  );
  const qBodyBank = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    turnPose.bodyRoll,
  );
  qLean.multiply(qBodyBank);
  setJointQuaternionFromBind(joints.body, qLean);

  const hipYawAmount = THREE.MathUtils.lerp(
    THREE.MathUtils.degToRad(5),
    THREE.MathUtils.degToRad(10),
    runBlendWeight,
  );
  const turnPelvisYaw = state.turnPelvisYaw ?? 0.11;
  const turnPelvisPulse = 0.45 + 0.55 * Math.abs(Math.sin(phase));
  const hipYaw = isTurningInPlace
    ? turnDirection * turnMotionWeight * turnPelvisYaw * turnPelvisPulse
    : hipYawAmount * Math.sin(phase);
  const qHipYaw = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    hipYaw,
  );
  const qPelvisBank = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    turnPose.pelvisRoll,
  );
  qHipYaw.multiply(qPelvisBank);
  setJointQuaternionFromBind(joints.pelvis, qHipYaw);

  const shoulderYawAmount = THREE.MathUtils.lerp(
    THREE.MathUtils.degToRad(5),
    THREE.MathUtils.degToRad(12.5),
    runBlendWeight,
  );
  const shoulderYaw = -shoulderYawAmount * Math.sin(phase);
  const qChestYaw = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    shoulderYaw + turnPose.chestYaw,
  );
  setJointQuaternionFromBind(joints.chest, qChestYaw);
  applyTurnLookPose(joints, turnPose);

  if (isWalking) {
    updateArmSwing(rig, state, "left", 0, phase, runBlendWeight);
    updateArmSwing(rig, state, "right", Math.PI, phase, runBlendWeight);
  } else if (state.walkArmSwing) {
    state.walkArmSwing.left = 0;
    state.walkArmSwing.right = 0;
  }

  getRigRoot(rig)?.updateMatrixWorld(true);

  solveLegIK(
    rig,
    state,
    terrainMeshes,
    "left",
    Math.PI,
    phase,
    runBlendWeight,
    deltaTime,
  );
  solveLegIK(
    rig,
    state,
    terrainMeshes,
    "right",
    0,
    phase,
    runBlendWeight,
    deltaTime,
  );

  updateJumpPose(rig, state, deltaTime);
}

function getPhaseFromTime(state) {
  const time = state.time || 0;
  const runBlendWeight = getRunBlendWeight(state);
  const fWalk = state.walkFrequency || 1.5;
  const fRun = state.runFrequency || 2.5;
  return 2 * Math.PI * THREE.MathUtils.lerp(fWalk, fRun, runBlendWeight) * time;
}

function getRunBlendWeight(state) {
  if (Number.isFinite(state.runBlendWeight)) {
    return THREE.MathUtils.clamp(state.runBlendWeight, 0, 1);
  }

  return state.isRunning ? 1 : 0;
}

function getTurnPose(state) {
  return state.turnPose || ZERO_TURN_POSE;
}

function cycle01(phase) {
  return (((phase / (Math.PI * 2)) % 1) + 1) % 1;
}

function getRigRoot(rig) {
  return rig.groups?.root || rig.root;
}

function setJointQuaternionFromBind(joint, deltaQuaternion) {
  if (!joint?.userData?.bindLocalQuaternion) {
    return;
  }

  joint.quaternion
    .copy(joint.userData.bindLocalQuaternion)
    .multiply(deltaQuaternion);
}

function applyTurnLookPose(joints, turnPose) {
  const qNeckTurn = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    turnPose.neckYaw,
  );
  const qHeadTurn = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    turnPose.headYaw,
  );

  setJointQuaternionFromBind(joints.neck, qNeckTurn);
  setJointQuaternionFromBind(joints.head, qHeadTurn);
}

function getMovementFrameQuaternion(rig) {
  const q = new THREE.Quaternion();
  const root = getRigRoot(rig);

  if (root) {
    root.getWorldQuaternion(q);
  }

  return q;
}

function getRootGroundY(rig, state, fallbackY) {
  if (Number.isFinite(state.groundY)) {
    return state.groundY;
  }

  const rootY = getRigRoot(rig)?.position?.y;
  const jumpOffset = Number.isFinite(state.jump?.offsetY)
    ? state.jump.offsetY
    : 0;

  return Number.isFinite(rootY) ? rootY - jumpOffset : fallbackY;
}

function updateArmSwing(rig, state, side, phaseOffset, phase, runBlendWeight) {
  const joints = rig.joints || {};
  const shoulder = side === "left" ? joints.leftShoulder : joints.rightShoulder;
  const elbow = side === "left" ? joints.leftElbow : joints.rightElbow;
  const sideName = side;
  const armSwing = Math.sin(phase + phaseOffset);
  const shoulderAmount = THREE.MathUtils.lerp(
    THREE.MathUtils.degToRad(17.5),
    THREE.MathUtils.degToRad(37.5),
    runBlendWeight,
  );
  const elbowBase = THREE.MathUtils.lerp(
    THREE.MathUtils.degToRad(20),
    THREE.MathUtils.degToRad(90),
    runBlendWeight,
  );
  const elbowAmount = THREE.MathUtils.lerp(
    THREE.MathUtils.degToRad(10),
    THREE.MathUtils.degToRad(30),
    runBlendWeight,
  );
  const inwardAmount = THREE.MathUtils.degToRad(7.5) * runBlendWeight;
  const shoulderTheta = -shoulderAmount * armSwing;
  const elbowTheta = elbowBase - elbowAmount * armSwing;
  const inwardTheta = inwardAmount * Math.max(0, armSwing);

  if (state.walkArmSwing) {
    state.walkArmSwing[sideName] = shoulderTheta;
  }

  if (state.applyArmPose === false) {
    return;
  }

  const qShoulder = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    shoulderTheta,
  );
  const zAxisRot = side === "left" ? inwardTheta : -inwardTheta;
  const qInward = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 0, 1),
    zAxisRot,
  );

  qShoulder.multiply(qInward);
  setJointQuaternionFromBind(shoulder, qShoulder);

  const qElbow = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    elbowTheta,
  );
  setJointQuaternionFromBind(elbow, qElbow);
}

function solveLegIK(
  rig,
  state,
  terrainMeshes,
  side,
  phaseOffset,
  phase,
  runBlendWeight,
  deltaTime,
) {
  const joints = rig.joints || {};
  const hip = side === "left" ? joints.leftHip : joints.rightHip;
  const knee = side === "left" ? joints.leftKnee : joints.rightKnee;
  const ankle = side === "left" ? joints.leftAnkle : joints.rightAnkle;
  const foot = side === "left" ? joints.leftFoot : joints.rightFoot;

  if (!hip || !knee || !ankle) {
    return;
  }

  const isTurningInPlace = Boolean(state.isTurningInPlace);
  const turnBlendWeight = isTurningInPlace
    ? THREE.MathUtils.clamp(state.turnBlendWeight ?? 1, 0, 1)
    : 0;
  const turnIntensity = isTurningInPlace
    ? THREE.MathUtils.clamp(state.turnIntensity ?? 1, 0, 1)
    : 0;
  const turnMotionWeight = turnBlendWeight * turnIntensity;
  const walkStrideLength = state.walkStrideLength ?? 0.8;
  const runStrideLength = state.runStrideLength ?? 2.0;
  const turnStrideLength = state.turnStrideLength ?? 0.34;
  const turnSideStep = state.turnSideStep ?? 0.12;
  const turnDirection = Math.sign(state.turnVelocity || 0) || 1;
  const thighLen = rig.dimensions?.thighLength ?? 1;
  const shinLen = rig.dimensions?.shinLength ?? 1;
  const legPhase = phase + phaseOffset;
  const walkStride = getLegStrideValues(legPhase);
  const runStride = getRunStrideValues(legPhase);
  const turnStride = getLegStrideValues(legPhase);
  const walkFootLocalZ = walkStride.footZ * walkStrideLength;
  const runFootLocalZ = runStride.footZ * runStrideLength * 0.5;
  const turnFootLocalZ =
    turnStride.footZ * turnStrideLength * turnDirection * turnMotionWeight;
  const turnFootLocalX =
    turnStride.footZ * turnSideStep * turnDirection * turnMotionWeight;
  const footLocalX = isTurningInPlace ? turnFootLocalX : 0;
  const footLocalZ = isTurningInPlace
    ? turnFootLocalZ
    : THREE.MathUtils.lerp(walkFootLocalZ, runFootLocalZ, runBlendWeight);
  const hipWorld = new THREE.Vector3();

  hip.getWorldPosition(hipWorld);
  const rootGroundY = getRootGroundY(
    rig,
    state,
    hipWorld.y - (thighLen + shinLen),
  );
  const maxFootStepUp = state.maxFootStepUp ?? 0.55;
  const movementQuat = getMovementFrameQuaternion(rig);
  const footOffsetWorld = new THREE.Vector3(
    footLocalX,
    0,
    footLocalZ,
  ).applyQuaternion(movementQuat);
  const footWorld = hipWorld.clone().add(footOffsetWorld);
  const raycaster = new THREE.Raycaster();
  const downVector = new THREE.Vector3(0, -1, 0);
  let floorY = hipWorld.y - (thighLen + shinLen);

  if (terrainMeshes && terrainMeshes.length > 0) {
    raycaster.set(
      new THREE.Vector3(footWorld.x, hipWorld.y + 1.0, footWorld.z),
      downVector,
    );
    const intersects = raycaster.intersectObjects(terrainMeshes, true);
    const walkableHit = intersects.find(
      (hit) =>
        isWalkableTerrainHit(hit) &&
        hit.point.y <= rootGroundY + maxFootStepUp,
    );

    if (walkableHit) {
      floorY = walkableHit.point.y;
    }
  }

  const ankleHeight = state.ankleHeight ?? 0.08;
  const walkFootLiftHeight = state.walkFootLiftHeight ?? 0.12;
  const runFootLiftHeight = state.runFootLiftHeight ?? 0.18;
  const runKneeDriveHeight = state.runKneeDriveHeight ?? 0.06;
  const turnFootLiftHeight = state.turnFootLiftHeight ?? 0.11;
  const walkFootLiftY = walkStride.footLift * walkFootLiftHeight;
  const runFootLiftY =
    runStride.footLift * runFootLiftHeight +
    runStride.kneeDrive * runKneeDriveHeight;
  const turnFootLiftY =
    turnStride.footLift * turnFootLiftHeight * turnMotionWeight;
  const footLiftY = isTurningInPlace
    ? turnFootLiftY
    : THREE.MathUtils.lerp(walkFootLiftY, runFootLiftY, runBlendWeight);

  const targetWorld = new THREE.Vector3(
    footWorld.x,
    floorY + ankleHeight + footLiftY,
    footWorld.z,
  );

  if (isTurningInPlace) {
    resolveTurnInPlaceFootTarget(
      state,
      side,
      turnStride,
      targetWorld,
      deltaTime,
    );
  }

  const parent = hip.parent;
  const targetLocal = targetWorld.clone();

  parent.worldToLocal(targetLocal);

  const hipPos = hip.userData.bindLocalPosition;
  const toTarget = new THREE.Vector3().subVectors(targetLocal, hipPos);
  const distance = Math.min(toTarget.length(), thighLen + shinLen - 0.001);
  const cosAngle =
    (thighLen * thighLen + shinLen * shinLen - distance * distance) /
    (2 * thighLen * shinLen);
  const internalKneeAngle = Math.acos(THREE.MathUtils.clamp(cosAngle, -1, 1));
  const kneeBend = Math.PI - internalKneeAngle;
  const qKneeOffset = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    kneeBend,
  );

  setJointQuaternionFromBind(knee, qKneeOffset);

  const bentAnkleLocal = knee.userData.bindLocalPosition
    .clone()
    .add(ankle.userData.bindLocalPosition.clone().applyQuaternion(knee.quaternion));
  const hipBindInverse = hip.userData.bindLocalQuaternion.clone().invert();
  const targetInHipBindSpace = toTarget.clone().applyQuaternion(hipBindInverse);

  if (
    bentAnkleLocal.lengthSq() <= 0.000001 ||
    targetInHipBindSpace.lengthSq() <= 0.000001
  ) {
    return;
  }

  const qHipIK = new THREE.Quaternion().setFromUnitVectors(
    bentAnkleLocal.normalize(),
    targetInHipBindSpace.normalize(),
  );

  setJointQuaternionFromBind(hip, qHipIK);
  if (isTurningInPlace) {
    applyFootPitchPolish(
      ankle,
      foot,
      turnStride,
      turnStride,
      0,
      turnMotionWeight,
    );
    applyTurnInPlaceFootYaw(
      foot,
      turnStride,
      turnDirection,
      (state.turnFootYaw ?? 0.18) * turnMotionWeight,
    );
  } else {
    applyFootPitchPolish(ankle, foot, walkStride, runStride, runBlendWeight);
  }
}

function resolveTurnInPlaceFootTarget(
  state,
  side,
  stride,
  targetWorld,
  deltaTime,
) {
  const anchors = state.turnFootAnchors;

  if (!anchors) {
    return;
  }

  if (!anchors[side]?.isVector3) {
    anchors[side] = targetWorld.clone();
    return;
  }

  const anchorBlend =
    THREE.MathUtils.clamp(state.turnBlendWeight ?? 1, 0, 1) *
    THREE.MathUtils.clamp(state.turnIntensity ?? 1, 0, 1);
  /*
    At the start of stance, refresh the planted point to the foot's current
    procedural landing target. The refresh is damped so landings can settle
    into the new target without a one-frame anchor snap. During the rest of
    stance, keep using that world anchor so root yaw does not simply sweep both
    feet like a turntable.
  */
  const refreshWindow = state.turnAnchorRefreshWindow ?? 0.14;
  const refreshAnchor =
    !stride.isSwing && Number.isFinite(stride.stanceProgress)
      ? stride.stanceProgress < refreshWindow
      : false;

  if (refreshAnchor) {
    const damping = state.turnAnchorDamping ?? 18;
    const t = 1 - Math.exp(-damping * Math.max(0, deltaTime || 0));
    anchors[side].lerp(targetWorld, THREE.MathUtils.clamp(t, 0, 1));
    targetWorld.lerp(anchors[side], anchorBlend);
    return;
  }

  if (!stride.isSwing) {
    targetWorld.lerp(anchors[side], anchorBlend);
  }
}

function applyTurnInPlaceFootYaw(foot, stride, turnDirection, maxYaw = 0.18) {
  if (!foot?.userData?.bindLocalQuaternion || !stride) {
    return;
  }

  const yawLimit = THREE.MathUtils.clamp(Math.abs(maxYaw), 0, 0.32);
  const direction = Math.sign(turnDirection || 0) || 1;
  const swingWeight = THREE.MathUtils.clamp(stride.footLift ?? 0, 0, 1);
  const plantWeight = THREE.MathUtils.clamp(stride.plant ?? 0, 0, 1);
  const pushOffWeight = THREE.MathUtils.clamp(stride.pushOff ?? 0, 0, 1);
  const yawWeight = Math.max(
    swingWeight,
    plantWeight * 0.45,
    pushOffWeight * 0.25,
  );
  const yaw = direction * yawLimit * yawWeight;

  if (Math.abs(yaw) <= 0.00001) {
    return;
  }

  const qYaw = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(0, 1, 0),
    yaw,
  );

  foot.quaternion.multiply(qYaw);
}

function applyFootPitchPolish(
  ankle,
  foot,
  walkStride,
  runStride,
  runBlendWeight,
  amplitude = 1,
) {
  if (!walkStride || !runStride) {
    return;
  }

  const poseAmplitude = THREE.MathUtils.clamp(amplitude, 0, 1);
  const walkStrideSwing = THREE.MathUtils.clamp(
    walkStride.strideSwing ?? 0,
    -1,
    1,
  );
  const walkFootLift = THREE.MathUtils.clamp(walkStride.footLift ?? 0, 0, 1);
  const walkPushOff = THREE.MathUtils.clamp(walkStride.pushOff ?? 0, 0, 1);
  const walkPlant = THREE.MathUtils.clamp(walkStride.plant ?? 0, 0, 1);
  const runStrideSwing = THREE.MathUtils.clamp(runStride.strideSwing ?? 0, -1, 1);
  const runFootLift = THREE.MathUtils.clamp(runStride.footLift ?? 0, 0, 1);
  const runPushOff = THREE.MathUtils.clamp(runStride.pushOff ?? 0, 0, 1);
  const runPlant = THREE.MathUtils.clamp(runStride.plant ?? 0, 0, 1);
  const walkAnklePitch =
    -walkStrideSwing * 0.05 + walkPushOff * 0.16 - walkPlant * 0.03;
  const runAnklePitch =
    -runStrideSwing * 0.07 + runPushOff * 0.2 - runPlant * 0.04;
  const walkFootPitch =
    walkPushOff * 0.18 - walkPlant * 0.05 - walkFootLift * 0.015;
  const runFootPitch =
    runPushOff * 0.22 - runPlant * 0.05 - runFootLift * 0.025;
  const anklePitch = THREE.MathUtils.lerp(
    walkAnklePitch,
    runAnklePitch,
    runBlendWeight,
  );
  const footPitch = THREE.MathUtils.lerp(
    walkFootPitch,
    runFootPitch,
    runBlendWeight,
  );

  applyLocalPitchFromBind(ankle, anklePitch * poseAmplitude);
  applyLocalPitchFromBind(foot, footPitch * poseAmplitude);
}

function applyLocalPitchFromBind(joint, pitch) {
  if (!joint?.userData?.bindLocalQuaternion) {
    return;
  }

  const qPitch = new THREE.Quaternion().setFromAxisAngle(
    new THREE.Vector3(1, 0, 0),
    THREE.MathUtils.clamp(pitch, -0.16, 0.24),
  );

  setJointQuaternionFromBind(joint, qPitch);
}

function updateIdleMotion(rig, state, deltaTime) {
  const joints = rig.joints || {};
  if (
    !joints.spineBase ||
    !joints.chest ||
    !joints.pelvis ||
    !joints.neck ||
    !joints.head
  ) {
    return;
  }

  const elapsed = Number.isFinite(state.elapsed) ? state.elapsed : state.time || 0;
  const motionSpeed = state.motionSpeed ?? 0.72;
  const phaseOffset = state.phaseOffset ?? 0;
  const turnPose = getTurnPose(state);
  const breathingAmplitude = state.breathingAmplitude ?? 0.035;
  const headDriftAmplitude = state.headDriftAmplitude ?? 0.11;
  const torsoSwayAmplitude = state.torsoSwayAmplitude ?? 0.055;
  const damping = state.idleDamping ?? state.relaxDamping ?? 3.1;
  const time = elapsed * motionSpeed + phaseOffset;
  const breathing = Math.sin(time * 1.5) * breathingAmplitude;
  const headLead = Math.sin(time * 0.58) * headDriftAmplitude;
  const headNod = Math.sin(time * 0.43 + 1.4) * headDriftAmplitude * 0.34;
  const torsoSway = Math.sin(time * 0.72 + 0.25) * torsoSwayAmplitude;
  const delayedTorso = Math.sin(time * 0.72 - 0.48) * torsoSwayAmplitude * 0.55;

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
    deltaTime,
    damping,
  );
  dampJointRotation(
    joints.spineBase,
    new THREE.Euler(breathing * 0.75, 0, delayedTorso * 0.55),
    deltaTime,
    damping,
  );
  dampJointRotation(
    joints.chest,
    new THREE.Euler(
      breathing * 0.45,
      headLead * 0.16 + turnPose.chestYaw,
      torsoSway,
    ),
    deltaTime,
    damping,
  );
  dampJointRotation(
    joints.neck,
    new THREE.Euler(
      headNod * 0.45,
      headLead * 0.38 + turnPose.neckYaw,
      -torsoSway * 0.62,
    ),
    deltaTime,
    damping * 0.92,
  );
  dampJointRotation(
    joints.head,
    new THREE.Euler(headNod, headLead + turnPose.headYaw, -torsoSway * 0.32),
    deltaTime,
    damping * 0.82,
  );
}

function updateJumpPose(rig, state, deltaTime) {
  const jump = state.jump;
  if (!jump) {
    return;
  }

  const joints = rig.joints || {};
  const damping = state.jumpDamping ?? state.idleDamping ?? state.relaxDamping ?? 3.1;
  const weights = getJumpPoseWeights(jump);
  const compression = weights.crouch + weights.landing;
  const hasJumpPose = compression > 0.001 || weights.air > 0.001;

  if (!hasJumpPose) {
    if (jump.phase === "grounded") {
      const t = 1 - Math.pow(0.001, deltaTime * (damping / 8));
      dampPositionToBind(joints.body, t);
    }
    return;
  }

  const crouchDrop = compression * (state.jumpCrouchDepth ?? 0.18);
  const airLegTuck = weights.air * 0.14;
  const armFloat = weights.air * 0.55 - weights.landing * 0.25;

  if (joints.body?.userData?.bindLocalPosition) {
    joints.body.position.y = joints.body.userData.bindLocalPosition.y - crouchDrop;
  }

  [
    ["left", -1],
    ["right", 1],
  ].forEach(([sideName, side]) => {
    dampJointRotation(
      joints[`${sideName}Hip`],
      new THREE.Euler(-0.22 * compression + airLegTuck, 0, side * 0.04),
      deltaTime,
      damping * 1.2,
    );
    dampJointRotation(
      joints[`${sideName}Knee`],
      new THREE.Euler(0.55 * compression + weights.air * 0.2, 0, 0),
      deltaTime,
      damping * 1.2,
    );
    dampJointRotation(
      joints[`${sideName}Ankle`],
      new THREE.Euler(-0.22 * compression - weights.air * 0.08, 0, 0),
      deltaTime,
      damping * 1.2,
    );
    dampJointRotation(
      joints[`${sideName}Shoulder`],
      new THREE.Euler(-0.08, 0, side * (0.18 + armFloat)),
      deltaTime,
      damping * 0.7,
    );
  });

  dampJointRotation(
    joints.head,
    new THREE.Euler(-0.04 * compression, 0, 0),
    deltaTime,
    damping * 0.55,
  );
}

function getJumpPoseWeights(jump) {
  if (jump.phase === "crouch") {
    return {
      crouch: smoothstep(0, jump.crouchDuration, jump.elapsed),
      air: 0,
      landing: 0,
    };
  }

  if (jump.phase === "air") {
    return { crouch: 0, air: 1, landing: 0 };
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

function smoothstep(edge0, edge1, value) {
  if (edge0 === edge1) {
    return value < edge0 ? 0 : 1;
  }

  const t = THREE.MathUtils.clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

function dampJointRotation(joint, targetEuler, deltaTime, damping) {
  if (!joint?.userData?.bindLocalQuaternion) {
    return;
  }

  const t = 1 - Math.pow(0.001, deltaTime * (damping / 8));
  const deltaQuaternion = new THREE.Quaternion().setFromEuler(targetEuler);
  const targetQuaternion = joint.userData.bindLocalQuaternion
    .clone()
    .multiply(deltaQuaternion);

  joint.quaternion.slerp(targetQuaternion, t);
}

function relaxToBindPose(rig, deltaTime, damping) {
  const t = 1 - Math.pow(0.001, deltaTime * (damping / 8));
  const joints = rig.joints || {};

  dampPositionToBind(joints.pelvis, t);
  [
    joints.body,
    joints.pelvis,
    joints.chest,
    joints.leftShoulder,
    joints.rightShoulder,
    joints.leftElbow,
    joints.rightElbow,
    joints.leftHip,
    joints.rightHip,
    joints.leftKnee,
    joints.rightKnee,
    joints.leftAnkle,
    joints.rightAnkle,
    joints.leftFoot,
    joints.rightFoot,
  ].forEach((joint) => dampQuaternionToBind(joint, t));
}

function dampPositionToBind(joint, t) {
  if (!joint?.userData?.bindLocalPosition) {
    return;
  }

  joint.position.lerp(joint.userData.bindLocalPosition, t);
}

function dampQuaternionToBind(joint, t) {
  if (!joint?.userData?.bindLocalQuaternion) {
    return;
  }

  joint.quaternion.slerp(joint.userData.bindLocalQuaternion, t);
}
