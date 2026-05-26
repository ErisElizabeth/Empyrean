/*
  EMPYREAN PHYSICS / BODY MECHANICS MODULE

  Machining analogy:
    main.js "calls a sub" here whenever it needs repeatable movement math.

  This module intentionally holds pure formulas first:
    - jump gravity
    - jump launch velocity
    - jump state updates
    - jump pose weights
    - walk-cycle phase shaping
    - pelvis carrier sway/bob/twist values
    - run-cycle stride/flight/lean values
    - smooth interpolation helpers

  Pure formula means:
    The function receives values, calculates an answer, and returns that answer.
    It does not need scene, camera, meshes, GUI, or browser state.

  Why not move every animation function here yet?
    updateWalkMotion(), updateIdleMotion(), and updateJumpPose() directly touch
    Three.js joints, imported skin, live GUI tuning, and debug state. They should
    move later as a deliberate second pass, once this smaller split proves stable.
*/

export function cycle01(phase) {
  /*
    Converts a radian phase into a repeating 0..1 cycle.

    Formula:
      cycle = (((phase / TAU) % 1) + 1) % 1

    where:
      TAU = 2 * PI

    The double modulo pattern keeps negative phases positive.
  */
  return (((phase / (Math.PI * 2)) % 1) + 1) % 1;
}

export function smoothstep(edge0, edge1, x) {
  /*
    Smooth interpolation curve from 0 to 1.

    Formula:
      t = clamp((x - edge0) / (edge1 - edge0), 0, 1)
      result = t * t * (3 - 2 * t)

    This eases in and out instead of moving in a straight linear ramp.
  */
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function clamp01(value) {
  return Math.min(1, Math.max(0, value));
}

export function getJumpGravityValue({
  jumpHeight,
  jumpDuration,
  jumpGravityScale,
}) {
  /*
    For a symmetric hop:

      gravity = (8 * height) / duration^2

    where:
      height = desired jump peak in scene units
      duration = total up-and-down time in seconds

    jumpGravityScale bends that physical-feeling value for animation taste:
      > 1 = snappier/heavier
      < 1 = floatier/lighter
  */
  const duration = Math.max(0.001, jumpDuration);
  const baseGravity = (8 * jumpHeight) / (duration * duration);
  return baseGravity * jumpGravityScale;
}

export function getJumpLaunchVelocityValue(tuning) {
  /*
    Launch speed needed to reach a target height:

      launchVelocity = sqrt(2 * gravity * height)

    With gravityScale = 1, this is equivalent to:

      launchVelocity = (4 * height) / duration
  */
  return Math.sqrt(
    2 * getJumpGravityValue(tuning) * tuning.jumpHeight,
  );
}

export function updateJumpState(jump, tuning, delta) {
  /*
    Updates the jump state machine in place.

    States:
      grounded -> crouch -> air -> landing -> grounded

    Air physics:
      velocityY = velocityY - gravity * delta
      offsetY   = offsetY + velocityY * delta

    The caller decides where offsetY gets applied in the scene.
  */
  if (jump.phase === "grounded") {
    jump.offsetY = 0;
    jump.velocityY = 0;
    return;
  }

  jump.elapsed += delta;

  if (jump.phase === "crouch") {
    if (jump.elapsed >= jump.crouchDuration) {
      jump.phase = "air";
      jump.elapsed = 0;
      jump.velocityY = getJumpLaunchVelocityValue(tuning);
    }
    return;
  }

  if (jump.phase === "air") {
    jump.velocityY -= getJumpGravityValue(tuning) * delta;
    jump.offsetY += jump.velocityY * delta;

    if (jump.offsetY <= 0 && jump.velocityY < 0) {
      jump.phase = "landing";
      jump.elapsed = 0;
      jump.offsetY = 0;
      jump.velocityY = 0;
    }
    return;
  }

  if (jump.phase === "landing" && jump.elapsed >= jump.landingDuration) {
    jump.phase = "grounded";
    jump.elapsed = 0;
  }
}

export function getJumpPoseWeightValues(jump) {
  /*
    Converts jump state into animation blend weights.

    These are pose weights only. They do not move the root upward.
  */
  if (jump.phase === "crouch") {
    return {
      crouch: smoothstep(0, jump.crouchDuration, jump.elapsed),
      air: 0,
      landing: 0,
    };
  }

  if (jump.phase === "air") {
    return {
      crouch: 0,
      air: 1,
      landing: 0,
    };
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

export function getStepPhase(phase) {
  /*
    Converts a walk phase into readable gait markers.

    t:
      0.00 to 0.50 = stance/contact
      0.50 to 1.00 = swing/recovery

    lift:
      sin(swingProgress * PI)

    pushOff:
      ramps up late in stance, like pushing from the toe

    plant:
      strong at the start of stance, then fades
  */
  const t = cycle01(phase);
  const isSwing = t >= 0.5;
  const swingProgress = isSwing ? (t - 0.5) / 0.5 : 0;
  const stanceProgress = !isSwing ? t / 0.5 : 0;
  const lift = isSwing ? Math.sin(swingProgress * Math.PI) : 0;
  const pushOff = !isSwing ? smoothstep(0.65, 1.0, stanceProgress) : 0;
  const plant = !isSwing ? 1 - smoothstep(0.0, 0.2, stanceProgress) : 0;

  return {
    t,
    isSwing,
    swingProgress,
    stanceProgress,
    lift,
    pushOff,
    plant,
  };
}

export function getLegStrideValues(phase) {
  /*
    Builds a fuller foot path for one leg.

    This sits one layer above getStepPhase():
      getStepPhase() tells us "where in the gait are we?"
      getLegStrideValues() turns that answer into a usable stride curve.

    The important part is footZ:

      During stance/contact:
        stanceZ =  0.5 - smoothstep(0, 1, stanceProgress)

        stanceProgress = 0.0  -> stanceZ =  0.5  (foot lands forward)
        stanceProgress = 0.5  -> stanceZ =  0.0  (body passes over foot)
        stanceProgress = 1.0  -> stanceZ = -0.5  (foot trails behind)

      During swing/recovery:
        swingZ = -0.5 + smoothstep(0, 1, swingProgress)

        swingProgress = 0.0  -> swingZ = -0.5  (toe leaves behind)
        swingProgress = 0.5  -> swingZ =  0.0  (foot passes under body)
        swingProgress = 1.0  -> swingZ =  0.5  (foot reaches forward)

    Why this helps:
      A plain sine wave can make the leg look trapped inside a short back/forth
      box. This curve gives the planted foot a slow rear drift and gives the
      lifted foot a clear forward recovery. smoothstep makes the velocity ease
      in/out at contact, so the step reads less abrupt.

    Toe and plant smoothing:
      getStepPhase() treats pushOff as a stance-only value and plant as an
      early-stance-only value. That is useful as a clean phase marker, but a
      visible puppet can look poppy if toe push drops from 1 to 0 exactly when
      swing starts, or if foot plant appears only after the cycle wraps.

      This helper therefore carries toePush briefly into early swing, and starts
      plant slightly before the next stance. Those overlaps make the animation
      look continuous while the underlying phase math stays simple.

    Returned ranges:
      footZ       = -0.5..0.5 normalized forward/back travel
      strideSwing = -1..1 same idea, easier for rotations
      footLift    = 0..1 lift only during the swing half of the step
      pushOff     = 0..1 smoothed toe-roll value
      plant       = 0..1 smoothed landing/contact value
  */
  const step = getStepPhase(phase);
  const stanceEase = !step.isSwing
    ? smoothstep(0, 1, step.stanceProgress)
    : 0;
  const swingEase = step.isSwing
    ? smoothstep(0, 1, step.swingProgress)
    : 0;
  const footZ = step.isSwing
    ? -0.5 + swingEase
    : 0.5 - stanceEase;
  const toePush = step.isSwing
    ? 1 - smoothstep(0, 0.18, step.swingProgress)
    : step.pushOff;
  const plant = step.isSwing
    ? smoothstep(0.82, 1, step.swingProgress)
    : step.plant;

  return {
    ...step,
    stanceEase,
    swingEase,
    footZ,
    strideSwing: footZ * 2,
    footLift: step.lift,
    pushOff: toePush,
    plant,
  };
}

export function getPelvisWalkValues(
  phase,
  {
    amplitude = 1,
    swayAmount = 0.075,
    bobAmount = 0.026,
    tiltAmount = 0.055,
    twistAmount = 0.045,
  } = {},
) {
  /*
    Calculates the "hip carrier" motion for the walk cycle.

    This is the math version of:

      hips.position.x = sin(walkPhase) * hipSwayAmount
      hips.position.y = baseHipY + abs(sin(walkPhase)) * hipBobAmount
      hips.rotation.z = sin(walkPhase) * hipTiltAmount
      hips.rotation.y = sin(walkPhase) * hipTwistAmount

    Empyrean applies this to the pelvis joint, not the individual left/right hip
    sockets. The pelvis is the carrier. The hip sockets are femur attachment
    points. Moving the pelvis lets both femurs inherit the weight shift cleanly.

    Signals:
      sideSignal = -sin(phase)

        phase = PI / 2:
          left leg is in stance and right leg is swinging.
          sideSignal = -1, so the pelvis shifts toward the left side.

        phase = 3 * PI / 2:
          right leg is in stance and left leg is swinging.
          sideSignal = +1, so the pelvis shifts toward the right side.

      stepSignal = abs(sin(phase * 2))

        This peaks twice per full left+right cycle, once per footfall. That is
        why vertical hip bob uses phase * 2 while side sway uses normal phase.

    Returned values are already multiplied by amplitude, so the caller should
    apply them directly.
  */
  const sideSignal = -Math.sin(phase);
  const stepSignal = Math.abs(Math.sin(phase * 2));
  const scaledAmplitude = Math.max(0, amplitude);

  return {
    sideSignal,
    stepSignal,
    swayX: sideSignal * swayAmount * scaledAmplitude,
    bobY: stepSignal * bobAmount * scaledAmplitude,
    tiltZ: sideSignal * tiltAmount * scaledAmplitude,
    twistY: sideSignal * twistAmount * scaledAmplitude,
  };
}

function plateauWindow01(value, start, end, feather = 0.04) {
  /*
    Builds a soft-edged on/off window inside a normalized 0..1 cycle.

    Formula:
      rise = smoothstep(start, start + feather, value)
      fall = 1 - smoothstep(end - feather, end, value)
      window = rise * fall

    where:
      value   = current phase position from cycle01(), 0..1
      start   = phase where the window begins
      end     = phase where the window ends
      feather = width of the eased edge

    Why this exists:
      runCycle.md marks flight windows as phase ranges. A hard if/else at those
      ranges would pop the body upward. This gives the same range a soft takeoff
      and landing.
  */
  const safeFeather = Math.max(0.0001, feather);
  const riseEnd = Math.min(end, start + safeFeather);
  const fallStart = Math.max(start, end - safeFeather);

  return clamp01(
    smoothstep(start, riseEnd, value) *
      (1 - smoothstep(fallStart, end, value)),
  );
}

export function getRunStrideValues(phase) {
  /*
    Builds a running foot path for ONE leg.

    The walking stride above is grounded:
      one foot plants while the other recovers.

    The running stride is springier:
      the leg reaches, drives backward, pushes off, then recovers with more knee
      lift. The caller runs this once for the left leg and once for the right
      leg with a PI phase offset.

    Main formula from runCycle.md:
      x_foot(t) = v * t - strideLength * cos(2 * PI * f * t)

    In animation code:
      phase = 2 * PI * f * t
      normalizedFootZ = -cos(phase)

    where:
      normalizedFootZ = -1..1 forward/back foot travel signal
      caller stride   = normalizedFootZ * runStrideLength * 0.5

    The actual scene stride length stays in main.js/rigTuning because it is a
    visual tuning control, but the normalized phase math lives here.
  */
  const t = cycle01(phase);
  const swingWave = Math.sin(phase);
  const swingSignal = Math.max(0, swingWave);
  const stanceSignal = Math.max(0, -swingWave);
  const normalizedFootZ = -Math.cos(phase);

  /*
    footLift:
      Running needs a stronger recovery than walking. Raising swingSignal to a
      fractional power keeps the lift broad and readable through the middle of
      the recovery instead of creating a tiny spike.

    pushOff:
      The last part of stance is where the toe drives the body forward. This is
      a narrow window near the end of the stance half of the local leg cycle.

    plant:
      Contact is strongest early in stance and near the next wrap point. It
      helps the caller damp the foot down when it should look grounded.
  */
  const footLift = Math.pow(swingSignal, 0.72);
  const kneeDrive = Math.pow(swingSignal, 0.52);
  const backPush = Math.pow(stanceSignal, 0.9);
  const pushOff = plateauWindow01(t, 0.36, 0.5, 0.055);
  const plant =
    t < 0.5
      ? 1 - smoothstep(0.02, 0.22, t)
      : smoothstep(0.84, 1, t);
  const flight = plateauWindow01(t, 0.35, 0.5, 0.045);

  return {
    t,
    footZ: normalizedFootZ,
    strideSwing: normalizedFootZ,
    footLift,
    kneeDrive,
    backPush,
    pushOff,
    plant,
    flight,
  };
}

export function getPelvisRunValues(
  phase,
  {
    amplitude = 1,
    swayAmount = 0.045,
    bounceAmount = 0.085,
    tiltAmount = 0.075,
    hipTwistAmount = 0.14,
    shoulderTwistAmount = 0.18,
    leanAmount = 0.12,
    speedRatio = 1,
  } = {},
) {
  /*
    Calculates the body carrier motion for running.

    runCycle.md formulas translated into Empyrean terms:

      y(t) = y_base + A_run * sin(2 * PI * f_run * t)

    Empyrean uses phase instead of raw time:

      phase = 2 * PI * f_run * t

    A raw sine wave goes negative half the time. Since this skeleton should not
    sink through the floor, the animation uses the sine as a spring signal and
    reinforces it during explicit flight windows:

      springSignal = max(0, sin(2 * phase))
      bobY = (springSignal * A_run * 0.38) + (flightSignal * A_run)

    The phase*2 term gives two vertical pulses per full left+right cycle.

    Forward lean from runCycle.md:

      theta = theta_base + (v / v_max) * theta_lean

    Empyrean stores theta_base as the bind pose, so this returns only:

      leanX = -speedRatio * leanAmount

    where:
      speedRatio  = v / v_max, clamped by the caller to 0..1
      leanAmount  = maximum lean angle in radians
      negative X  = forward lean for the current puppet pose convention

    Hip/shoulder twist:

      hipYaw      =  A_hip      * sin(phase)
      shoulderYaw = -A_shoulder * sin(phase)

    The opposite signs keep the torso balanced instead of moving like one rigid
    block.
  */
  const scaledAmplitude = Math.max(0, amplitude);
  const cycle = cycle01(phase);
  const sideSignal = -Math.sin(phase);
  const twistSignal = Math.sin(phase);
  const leftFlight = plateauWindow01(cycle, 0.35, 0.5, 0.045);
  const rightFlight = plateauWindow01(cycle, 0.85, 1, 0.045);
  const flightSignal = Math.max(leftFlight, rightFlight);
  const springSignal = Math.max(0, Math.sin(phase * 2));
  const safeSpeedRatio = clamp01(speedRatio);

  return {
    cycle,
    sideSignal,
    twistSignal,
    flightSignal,
    springSignal,
    swayX: sideSignal * swayAmount * scaledAmplitude,
    bobY:
      (springSignal * bounceAmount * 0.38 + flightSignal * bounceAmount) *
      scaledAmplitude,
    tiltZ: sideSignal * tiltAmount * scaledAmplitude,
    hipTwistY: twistSignal * hipTwistAmount * scaledAmplitude,
    shoulderTwistY: -twistSignal * shoulderTwistAmount * scaledAmplitude,
    leanX: -leanAmount * safeSpeedRatio * scaledAmplitude,
  };
}
