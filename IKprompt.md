Observed symptom
When the character rotates in place (changing yaw via keyboard or mouse) without moving forward, the feet slide across the floor like a turntable instead of lifting and stepping.
Likely cause
updateLocomotion in movementEngine.js forces a fallback to relaxToBindPose and updateIdleMotion when linear speed is zero. In-place angular rotation updates the root's yaw but does not trigger the stride phase needed to actively lift and plant the feet through solveLegIK.  
Why this happens in quaternion/rig terms
The current procedural foot targets are generated relative to the hip and root using a phase oscillator (getPhaseFromTime). Because the feet are children of the root in the rig hierarchy, rotating the root simply sweeps them through world space. Without a procedural phase trigger linked to the angular delta, no vertical lift (footLift) or positional offset (footZ) is layered over the base bindLocalQuaternion.  
What not to change
Do not rewrite the existing solveLegIK or getLegStrideValues functions; they are mathematically sound for linear travel.  
Do not change how the root rotation is strictly applied in main.js.  
Do not attempt a full analytical two-bone IK solver right now; stick to the current math-driven "puppet readable" targets.
Do not adjust any parameters governing the forward run cycle, ensuring the galloping run problem is isolated and not inadvertently worsened by idle-state changes.
Minimal fix strategy
Input/Control Issue: In main.js, ensure controlState.turnVelocity is passed into the state object consumed by updateLocomotion.  
Animation Math Issue: Inside updateLocomotion, bypass the relaxToBindPose early return if turnVelocity exceeds a small threshold. Introduce an in-place turn phase that increments based on this angular velocity.  
Rig Hierarchy Issue: Create two independent footAnchor variables (storing Vector3 world positions) in the state to track exactly where the feet are currently planted on the terrain.
Reset/Bind-Pose Issue: When turning in place, use the turn phase to alternate which foot is pinned to its anchor. For the pinned foot, calculate an offset vector from its expected parent-local position to the world anchor, convert it to root-local space, and layer it via dampJointPositionFromBind.
For the stepping foot, layer a vertical sine-wave offset to simulate the step over the bindLocalPosition.  
Test procedure
Stand idle and press 'A' or 'D' to turn in place.
Verify that one foot remains pinned to its world-space anchor while the other lifts and steps into the new facing direction.
Move forward to ensure standard walk/run locomotion seamlessly overrides the in-place anchors without snapping.
Rollback condition
If the foot anchors drift away from the root center during rapid mouse-look direction changes, or if the transition from in-place stepping to forward motion abruptly stretches the leg IK targets, disable the anchor logic and fall back to the sliding turntable turn until the phase blending can be corrected.
