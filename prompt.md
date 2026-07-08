When turning via the 'A'/'D' keys or mouse-look, the character's entire skeleton root rotates instantly and rigidly. There is no organic weight shift, banking, or spinal anticipation.

Turn inputs directly modify controlState.yaw, which is immediately applied to the root's Y-rotation. Currently, the movement engine calculates hipYaw and shoulderYaw based solely on the forward movement gait phase (Math.sin(phase)). It tracks linear speed for phase timing, but it does not track angular velocity (turn rate).

In biological motion, turning isn't driven from the floor up; it usually starts top-down. The eyes/head turn to look at the target, the chest twists to follow, and if the body is moving forward, it banks (rolls on the Z-axis) into the curve to counteract centrifugal force. Because your solver lacks an angular velocity delta, it cannot generate these anticipatory or stabilizing quaternion offsets.

Do not attempt procedural in-place stepping (IK foot repositioning) yet. That is a much heavier lift. Start with upper-body twisting and banking.

We can fix this by calculating a smoothed angular velocity and layering it as an additive rotation delta onto the spine and head.

Track Turn Velocity: In main.js, calculate the difference between the current frame's yaw and the previous frame's yaw. Smooth this value using an exponential decay (just like your runBlendWeight damping) and store it in controlState.turnVelocity.

Pass to Solver: Ensure state.turnVelocity is passed down into updateLocomotion and updateIdleMotion.

Generate Offset Quaternions: In movementEngine.js, map this turnVelocity to specific joint behaviors:

Head/Neck: Add Y-axis rotation (yaw) into the turn so the character "looks" where they are going.

Chest: Add a smaller Y-axis rotation (yaw) for torso twist.

Body/Pelvis: Add a Z-axis rotation (roll) proportional to runBlendWeight. This makes the character bank into the turn while running, but stay mostly upright while walking or idle.

Layer the Rotations: Multiply these new turn quaternions against the existing qChestYaw, qHipYaw, and qLean before calling setJointQuaternionFromBind.
