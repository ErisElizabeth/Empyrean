/*
  EMPYREAN COMBAT PHYSICS

  This module is intentionally pure math:
    - no Three.js imports
    - no scene objects
    - no GUI
    - no animation frame side effects

  main.js owns the puppet and visuals. This file owns the readable formulas
  behind combat balance:
    - base of support
    - combined center of mass
    - stability margin
    - tipping angle

  The goal is not full rigid-body simulation. The goal is a small, explainable
  physics vocabulary that stance, guard, strike, and stagger code can share.
*/

const EPSILON = 0.000001;

export const COMBAT_STANCE_NAMES = Object.freeze({
  NONE: "none",
  LOW_GUARD: "lowGuard",
});

export const COMBAT_STANCE_PROFILES = Object.freeze({
  [COMBAT_STANCE_NAMES.LOW_GUARD]: Object.freeze({
    /*
      Low / deep guard.

      Design intent:
        Lower the center of mass, widen the support base, and keep the sword
        low enough that the avatar feels grounded and difficult to overbalance.

      These numbers are not "real kilograms" or "real meters." They are stable
      scene-unit coefficients. Keep them readable and tuneable.
    */
    name: COMBAT_STANCE_NAMES.LOW_GUARD,
    label: "Low Guard",
    bodyMass: 1,
    swordMass: 0.16,
    footHalfWidth: 0.12,
    footHalfDepth: 0.18,
    swordComOffsetFromRightPalm: { x: 0.02, y: -0.22, z: 0.08 },
    pose: Object.freeze({
      bodyOffset: { x: 0, y: -0.074, z: -0.024 },
      pelvisRotation: { x: 0.035, y: -0.07, z: 0.018 },
      chestRotation: { x: -0.085, y: 0.085, z: -0.018 },
      headRotation: { x: -0.024, y: 0.035, z: 0.006 },
      leg: Object.freeze({
        hipOffset: { xSide: 0.012, y: -0.006, z: 0 },
        kneeOffset: { xSide: 0.026, y: -0.018, z: 0.025 },
        ankleOffset: { xSide: 0.042, y: 0, z: 0.018 },
        footOffset: { xSide: 0.055, y: 0, z: 0.052 },
        hipRotation: { x: 0.11, ySide: 0.018, zSide: 0.07 },
        kneeRotation: { x: 0.31, y: 0, zSide: 0.025 },
        ankleRotation: { x: -0.095, ySide: 0.012, z: 0 },
        footRotation: { x: -0.035, y: 0, zSide: -0.018 },
      }),
    }),
  }),
});

export function getCombatStanceProfile(name) {
  return COMBAT_STANCE_PROFILES[name] || null;
}

export function combineMassPoints(points) {
  /*
    Combined center of mass formula:

      CoM = sum(m_i * p_i) / sum(m_i)

    where:
      m_i = mass of item i
      p_i = position of item i, with x/y/z components

    For the first combat pass, "body" and "sword" are enough. Later, this can
    take shield, backpack, carried object, or monster-grab points without
    changing the formula.
  */
  let totalMass = 0;
  let x = 0;
  let y = 0;
  let z = 0;

  points.forEach((point) => {
    const mass = Number.isFinite(point?.mass) ? point.mass : 0;

    if (mass <= 0 || !point?.position) {
      return;
    }

    totalMass += mass;
    x += mass * (point.position.x || 0);
    y += mass * (point.position.y || 0);
    z += mass * (point.position.z || 0);
  });

  if (totalMass <= EPSILON) {
    return { x: 0, y: 0, z: 0, totalMass: 0 };
  }

  return {
    x: x / totalMass,
    y: y / totalMass,
    z: z / totalMass,
    totalMass,
  };
}

export function getSupportBoxFromFeet(leftFoot, rightFoot, options = {}) {
  /*
    Base of support, simplified as a floor-aligned box.

    The strict biomechanics version is a polygon around every contact point on
    both feet. For a game rig, a box is more than enough for readable decisions:

      minX = min(leftFoot.x, rightFoot.x) - footHalfWidth
      maxX = max(leftFoot.x, rightFoot.x) + footHalfWidth
      minZ = min(leftFoot.z, rightFoot.z) - footHalfDepth
      maxZ = max(leftFoot.z, rightFoot.z) + footHalfDepth

    X is side-to-side support. Z is forward/back support.
  */
  const footHalfWidth = options.footHalfWidth ?? 0.1;
  const footHalfDepth = options.footHalfDepth ?? 0.16;
  const minX = Math.min(leftFoot.x, rightFoot.x) - footHalfWidth;
  const maxX = Math.max(leftFoot.x, rightFoot.x) + footHalfWidth;
  const minZ = Math.min(leftFoot.z, rightFoot.z) - footHalfDepth;
  const maxZ = Math.max(leftFoot.z, rightFoot.z) + footHalfDepth;

  return {
    minX,
    maxX,
    minZ,
    maxZ,
    width: maxX - minX,
    depth: maxZ - minZ,
    centerX: (minX + maxX) * 0.5,
    centerZ: (minZ + maxZ) * 0.5,
  };
}

export function getStabilityMargin(centerOfMass, supportBox) {
  /*
    Stability margin is distance from projected CoM to the nearest support edge.

    In one axis, the document formula is:

      stable if xLeft <= xCoM <= xRight

    In floor-space, we check both X and Z:

      leftDistance  = xCoM - minX
      rightDistance = maxX - xCoM
      backDistance  = zCoM - minZ
      frontDistance = maxZ - zCoM

      margin = min(all four distances)

    margin < 0 means the projected CoM has left the base of support.
  */
  const leftDistance = centerOfMass.x - supportBox.minX;
  const rightDistance = supportBox.maxX - centerOfMass.x;
  const backDistance = centerOfMass.z - supportBox.minZ;
  const frontDistance = supportBox.maxZ - centerOfMass.z;
  const margin = Math.min(
    leftDistance,
    rightDistance,
    backDistance,
    frontDistance,
  );
  const reference = Math.max(
    EPSILON,
    Math.min(supportBox.width, supportBox.depth) * 0.5,
  );

  return {
    leftDistance,
    rightDistance,
    backDistance,
    frontDistance,
    margin,
    normalized: margin / reference,
    overbalanced: margin < 0,
  };
}

export function getCriticalTipAngle(edgeDistance, centerOfMassY) {
  /*
    Critical tipping angle:

      thetaCrit = atan(edgeDistance / yCoM)

    where:
      edgeDistance = floor distance from projected CoM to the relevant edge
      yCoM         = center of mass height above the floor

    Lower yCoM makes the ratio larger, which increases thetaCrit. That is why
    a low/deep guard is harder to overbalance than a high guard.
  */
  return Math.atan(edgeDistance / Math.max(EPSILON, centerOfMassY));
}

export function evaluateCombatBalance({
  leftFoot,
  rightFoot,
  bodyCom,
  swordCom,
  bodyMass = 1,
  swordMass = 0.16,
  footHalfWidth = 0.1,
  footHalfDepth = 0.16,
}) {
  /*
    One-stop combat balance evaluation.

    Inputs are all in the same rig-local coordinate space. main.js converts
    Three.js world positions into root-local numbers before calling this.
  */
  const supportBox = getSupportBoxFromFeet(leftFoot, rightFoot, {
    footHalfWidth,
    footHalfDepth,
  });
  const centerOfMass = combineMassPoints([
    { mass: bodyMass, position: bodyCom },
    { mass: swordMass, position: swordCom },
  ]);
  const stability = getStabilityMargin(centerOfMass, supportBox);
  const criticalTipAngle = getCriticalTipAngle(
    stability.margin,
    centerOfMass.y,
  );

  return {
    supportBox,
    centerOfMass,
    stability,
    criticalTipAngle,
  };
}
