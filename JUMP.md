jump: {

&#x20; active: false,

&#x20; startTime: 0,

&#x20; duration: 900,

&#x20; height: 0.85,

},





const controlState = {

&#x20; keys: new Set(),

&#x20; yaw: 0,

&#x20; position: new THREE.Vector3(0, 0, 0),

&#x20; walkPhase: 0,

&#x20; cameraYaw: 0,

&#x20; cameraDistance: 6.6,

&#x20; cameraHeight: 2.6,

&#x20; waveUntil: 0,

&#x20; leftArm: "down",

&#x20; rightArm: "down",



&#x20; jump: {

&#x20;   active: false,

&#x20;   startTime: 0,

&#x20;   duration: 900,

&#x20;   height: 0.85,

&#x20; },

};



} else if (event.code === "KeyJ") {

&#x20; startJump();

}

function startJump() {

&#x20; if (controlState.jump.active) {

&#x20;   return;

&#x20; }



&#x20; controlState.jump.active = true;

&#x20; controlState.jump.startTime = performance.now();

}





function clamp01(value) {

&#x20; return THREE.MathUtils.clamp(value, 0, 1);

}



function easeOutCubic(t) {

&#x20; return 1 - Math.pow(1 - t, 3);

}



function easeInCubic(t) {

&#x20; return t \* t \* t;

}



function updateJumpMotion(delta, currentTime) {

&#x20; const jump = controlState.jump;



&#x20; if (!jump.active) {

&#x20;   return;

&#x20; }



&#x20; const joints = state.skeleton.joints;

&#x20; const elapsed = currentTime - jump.startTime;

&#x20; const t = clamp01(elapsed / jump.duration);



&#x20; // Phases:

&#x20; // 0.00–0.22 crouch

&#x20; // 0.22–0.72 air

&#x20; // 0.72–1.00 landing/recover

&#x20; const crouchPhase = 1 - smoothstep(0.0, 0.22, t);

&#x20; const airPhase = smoothstep(0.18, 0.72, t) \* (1 - smoothstep(0.72, 1.0, t));

&#x20; const landingPhase = smoothstep(0.72, 0.86, t) \* (1 - smoothstep(0.86, 1.0, t));



&#x20; // Parabolic airtime: up then down.

&#x20; const arc = Math.sin(airPhase \* Math.PI) \* jump.height;



&#x20; // Body root rises, but crouch/landing dip it downward.

&#x20; const crouchDrop = crouchPhase \* 0.18;

&#x20; const landingDrop = landingPhase \* 0.14;



&#x20; joints.body.position.y =

&#x20;   joints.body.userData.bindLocalPosition.y + arc - crouchDrop - landingDrop;



&#x20; // Legs compress during crouch and landing.

&#x20; const compression = crouchPhase + landingPhase;



&#x20; dampJointRotation(

&#x20;   joints.leftHip,

&#x20;   new THREE.Euler(-0.22 \* compression, 0, 0.04),

&#x20;   delta,

&#x20;   rigTuning.damping \* 1.2,

&#x20; );



&#x20; dampJointRotation(

&#x20;   joints.rightHip,

&#x20;   new THREE.Euler(-0.22 \* compression, 0, -0.04),

&#x20;   delta,

&#x20;   rigTuning.damping \* 1.2,

&#x20; );



&#x20; dampJointRotation(

&#x20;   joints.leftKnee,

&#x20;   new THREE.Euler(0.55 \* compression, 0, 0),

&#x20;   delta,

&#x20;   rigTuning.damping \* 1.2,

&#x20; );



&#x20; dampJointRotation(

&#x20;   joints.rightKnee,

&#x20;   new THREE.Euler(0.55 \* compression, 0, 0),

&#x20;   delta,

&#x20;   rigTuning.damping \* 1.2,

&#x20; );



&#x20; dampJointRotation(

&#x20;   joints.leftAnkle,

&#x20;   new THREE.Euler(-0.22 \* compression, 0, 0),

&#x20;   delta,

&#x20;   rigTuning.damping \* 1.2,

&#x20; );



&#x20; dampJointRotation(

&#x20;   joints.rightAnkle,

&#x20;   new THREE.Euler(-0.22 \* compression, 0, 0),

&#x20;   delta,

&#x20;   rigTuning.damping \* 1.2,

&#x20; );



&#x20; // Arms trail upward during airtime, then settle.

&#x20; const armFloat = airPhase \* 0.55 - landingPhase \* 0.25;



&#x20; dampJointRotation(

&#x20;   joints.leftShoulder,

&#x20;   new THREE.Euler(-0.08, 0, -0.18 - armFloat),

&#x20;   delta,

&#x20;   rigTuning.damping \* 0.7,

&#x20; );



&#x20; dampJointRotation(

&#x20;   joints.rightShoulder,

&#x20;   new THREE.Euler(-0.08, 0, 0.18 + armFloat),

&#x20;   delta,

&#x20;   rigTuning.damping \* 0.7,

&#x20; );



&#x20; // Head stays composed — alien grace.

&#x20; dampJointRotation(

&#x20;   joints.head,

&#x20;   new THREE.Euler(-0.04 \* compression, 0, 0),

&#x20;   delta,

&#x20;   rigTuning.damping \* 0.55,

&#x20; );



&#x20; if (t >= 1) {

&#x20;   jump.active = false;

&#x20;   resetSkeletonToBindPose();

&#x20; }

}









updateJumpMotion(delta, currentTime);







