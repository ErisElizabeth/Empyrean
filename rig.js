/*
  EMPYREAN RIG PROPORTIONS MODULE

  This module owns the default body proportions and rig-dimension GUI rows.

  Current rig stats:
    DEFAULT_RIG_HEIGHT = 4.46 scene units
    headY              = 4.0586
    neckY              = 3.7464
    chestY             = 3.2112
    torsoY             = 2.6760
    pelvisY            = 2.2300
    shoulderX          = 0.8474
    hipX               = 0.4014
    upperArmLength     = 0.8474
    forearmLength      = 0.7582
    thighLength        = 1.0927
    shinLength         = 1.0927

  Total overall height note:
    The default control height is 4.46 scene units. The visible/debug head can
    extend a little above the head pivot depending on marker or mesh shape, but
    this number is the current program height used for rig proportions.
*/

export const DEFAULT_RIG_HEIGHT = 4.46;

export const DEFAULT_RIG_DIMENSIONS = {
  headY: DEFAULT_RIG_HEIGHT * 0.91,
  neckY: DEFAULT_RIG_HEIGHT * 0.84,
  chestY: DEFAULT_RIG_HEIGHT * 0.72,
  torsoY: DEFAULT_RIG_HEIGHT * 0.6,
  pelvisY: DEFAULT_RIG_HEIGHT * 0.5,

  shoulderX: DEFAULT_RIG_HEIGHT * 0.19,
  hipX: DEFAULT_RIG_HEIGHT * 0.09,

  upperArmLength: DEFAULT_RIG_HEIGHT * 0.19,
  forearmLength: DEFAULT_RIG_HEIGHT * 0.17,

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

export function getRigStats(dimensions = DEFAULT_RIG_DIMENSIONS) {
  /*
    Returns a small stats object for guides, overlays, or future UI.

    overallHeight is currently the head pivot height, because that is the
    program's controlling top-of-rig measurement.
  */
  return {
    overallHeight: dimensions.headY,
    defaultRigHeight: DEFAULT_RIG_HEIGHT,
    dimensions,
  };
}
