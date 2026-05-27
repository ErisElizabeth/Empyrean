/*
  EMPYREAN COMBAT ENCOUNTER MODULE
  ===============================================================

  PURPOSE
  -------
  This file wires together three separate prototypes you built on the Desktop:

    1. /Empyrean         — the explorable world + walking rig
    2. /empyrean_dice    — the d20 roll mechanic (now a physical numbered stone die)
    3. /enemyAI          — the "evaluate then act" enemy decision pattern

  It is intentionally self-contained.

    - It exports initCombatEncounter() and updateCombatEncounter() for the frame
      loop, plus setCombatDifficulty() and attemptCombatSwordHit() for the sword
      combat controls in main.js.
    - main.js calls init once, update each frame, and the sword-hit doorway only
      when Enter starts a swing.
    - Combat owns the encounter visuals (trigger cylinder, enemy mesh, health
      bar, banner) and delegates the physical d20/oracle object to oracleD20.js.
      That keeps the die reusable without letting it decide enemy or audio logic.

  ENCOUNTER FLOW (the state machine in this file)
  -----------------------------------------------
       idle
         |  rig footprint enters trigger cylinder
         v
       starting   <-- audio crossfade BG -> battle, enemy fades in (0 -> 1 opacity)
         |  audio + enemy reach target opacity
         v
       rolling    <-- d20 manifests in front of the player, tumbles slowly, and
         |          settles with the rolled numbered face aimed back toward the
         |          camera/player; nat 1 / nat 20 banner shown if applicable,
         |          enemy "evasion" tier printed.
         v
       active     <-- d20 is gone, enemy + hitbox + health bar visible;
         |          Enter calls attemptCombatSwordHit(), which checks range/arc
         |          and subtracts HP on a successful sword hit
         |
         |  non-lethal hit
         v
       hiding     <-- enemy briefly disappears, relocates, then returns to active
         ^
         |  delay finishes
         |
       active
         |
         |  HP reaches zero on a successful hit
         v
       ending     <-- audio crossfade battle -> BG, enemy fades out (1 -> 0 opacity)
         |  audio + enemy at zero
         v
       idle       <-- trigger cylinder restored, ready to fire again

  COMMENTS
  --------
  You asked for "a great deal of comments". I have leaned heavily on the WHY rather
  than the WHAT, because the WHAT is right there in the code. Comments are organized
  in this order at every block:

    - what the block is responsible for
    - why we do it this particular way
    - things to watch out for if you tweak it

  COORDINATE REMINDER (matches encounters.js)
  -------------------------------------------
      X = left/right across the floor
      Y = height
      Z = forward/back across the floor
*/

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { createOracleD20 } from "./oracleD20.js";

// ===============================================================
// CONFIG (tweak these freely — they are the only "knobs" you need)
// ===============================================================
/*
  Keeping every number you might want to tune in one place near the top of the
  file means you do not have to read the encounter logic to move the trigger or
  adjust encounter timing. The d20/oracle has its own config in oracleD20.js.
*/
const COMBAT_CONFIG = {
  // Where the trigger cylinder lives in the world (X, Z).
  // [0, 4] = 4 units forward of the spawn (press W from spawn to walk into it).
  trigger: {
    position: [0, 4],
    radius: 2.4, // half the diameter; rig walks INSIDE when distance < radius
    height: 2.4, // visible cylinder height (purely cosmetic)
    color: 0x78c7ff,
    opacity: 0.25, // requirement #3: trigger visible at 25%
  },

  // The enemy.glb model and the soft contact cylinder around it.
  enemy: {
    modelPath: "assets/enemy.glb",
    // How far in front of the rig the enemy appears at encounter start.
    // We use the rig's facing direction so the enemy is always "in front".
    spawnForwardDistance: 22.0,
    // Target Y position for the enemy's feet. Matches the floor at Y=0.
    groundY: 0,
    // Auto-fit target height in scene units. enemy.glb may be authored in an
    // arbitrary modeling scale, so we normalize its bounding-box height to this
    // value before applying the manual scale multiplier below.
    targetHeight: 1.55,
    // Extra vertical scaling tweak after auto-fit. Keep this near 1.0 unless
    // you deliberately want the enemy bigger/smaller than targetHeight.
    scale: 1.0,
    // If the model appears to face away from the player, set this to Math.PI.
    modelYawOffset: 0,
    // Soft contact hitbox (cylinder shown at 15% opacity, requirement #7).
    hitboxRadius: 0.78,
    hitboxHeight: 1.75,
    hitboxColor: 0xff6b6b,
    hitboxOpacity: 0.15,
    // The rig isn't fast (requirement #17). Give the player a clear contact radius
    // — using a margin so they don't have to land exactly on the centerpoint.
    contactRadius: 0.95,
  },

  // Simple enemy evasion. The d20 roll selects one of these profiles.
  evasion: {
    // The enemy stays near the point where it spawned so it does not wander out
    // of the encounter area or run through the whole building.
    leashRadius: 3.2,
    // It starts dodging once the player is within this many scene units.
    evadeStartDistance: 3.1,
    profiles: {
      BEST: {
        speed: 0.92,
        strafe: 0.46,
        jukeFrequency: 3.1,
        contactScale: 0.82,
      },
      MODERATE: {
        speed: 0.56,
        strafe: 0.25,
        jukeFrequency: 2.3,
        contactScale: 0.96,
      },
      WORST: {
        speed: 0.18,
        strafe: 0.08,
        jukeFrequency: 1.4,
        contactScale: 1.12,
      },
    },
  },

  health: {
    // Change this to "MEDIUM" or "HARD" when you want a tougher prototype.
    difficulty: "EASY",
    hitPointsByDifficulty: {
      EASY: 3,
      MEDIUM: 4,
      HARD: 5,
    },
    barWidth: 1.15,
    barHeight: 0.12,
    yOffset: 2.02,
    hideSeconds: 1.15,
  },

  // Fade durations for enemy + hitbox visuals.
  enemyFade: {
    inSeconds: 1.0,
    outSeconds: 1.0,
  },
};

// ===============================================================
// MODULE STATE
// ===============================================================
/*
  Everything we create lives in this single object so we can:
    - reset it cleanly on encounter end (requirement #15: no leftovers)
    - reason about state transitions in one place
    - dispose Three.js geometry/materials when we are done

  We deliberately do NOT keep references in main.js.  That file already does a lot;
  giving combat its own bag of state keeps the seam clean.
*/
const combat = {
  // Set during init by the caller. Holds references we need every frame.
  scene: null,
  controlState: null,
  rigTuning: null,
  audioManager: null,

  // Three.js objects (kept so we can show/hide and dispose).
  triggerCylinder: null,
  enemyGroup: null, // wraps the GLB so we can move + opacity-fade easily
  enemyHitbox: null,
  enemyAnchor: new THREE.Vector3(),
  enemyHealthBar: null,
  enemyHealthFill: null,
  enemyHp: 0,
  enemyMaxHp: 0,
  oracleD20: null,

  // DOM banner (created lazily; reused).
  banner: null,

  // TEMP / DEV: G53 rigging mode can suppress combat visuals while measuring.
  riggingVisibilitySuppressed: false,
  riggingVisibilitySnapshot: null,

  // State machine.
  phase: "idle", // see file header for the legal phases
  phaseElapsed: 0, // seconds since this phase began (driven by delta)

  // The enemy "evasion" tier (requirement #10). We pre-compute it once the roll
  // lands so the rest of the file can read it as a label.
  evasionTier: "",
};

// ===============================================================
// PUBLIC API
// ===============================================================

export function initCombatEncounter(opts) {
  /*
    Called once from main.js after the scene/audio/rig are all set up.

    We do NOT load the enemy GLB here.  We load it lazily the first time the
    encounter fires.  That keeps page load time identical for non-combat play and
    means we don't pay for a fetch if the rig never walks into the trigger.

    Why pass refs by parameter instead of imports?
      main.js owns the scene and rig. audioManager.js owns music/fades. Passing
      those refs in keeps this file easy to unit-test and easy to lift into
      another project.
  */
  combat.scene = opts.scene;
  combat.controlState = opts.controlState;
  combat.rigTuning = opts.rigTuning;
  combat.audioManager = opts.audioManager;

  // Build the trigger cylinder (requirement #3).
  combat.triggerCylinder = buildTriggerCylinder();
  combat.scene.add(combat.triggerCylinder);

  // We build the enemy group lazily, but pre-allocate the wrapper so we don't
  // have to handle a "first time" branch in updateCombatEncounter().  The wrapper
  // exists; the GLB inside it gets added on first trigger fire.
  combat.enemyGroup = new THREE.Group();
  combat.enemyGroup.name = "combat-enemy-group";
  combat.enemyGroup.visible = false;
  combat.scene.add(combat.enemyGroup);

  // Build the soft enemy hitbox cylinder (requirement #7).
  //
  // IMPORTANT:
  //   The hitbox is a CHILD of enemyGroup. That makes enemyGroup the single
  //   source of truth for enemy placement. If evasion moves the enemy, the GLB
  //   and the contact cylinder move together automatically.
  combat.enemyHitbox = buildEnemyHitbox();
  combat.enemyHitbox.visible = false;
  combat.enemyGroup.add(combat.enemyHitbox);

  // Health bar is also a child of enemyGroup so it follows the GLB and hitbox
  // during evasion. It is placed above the fitted target height.
  combat.enemyHealthBar = buildEnemyHealthBar();
  combat.enemyHealthBar.visible = false;
  combat.enemyGroup.add(combat.enemyHealthBar);

  // Build the floating oracle d20. The new oracleD20.js module owns the die
  // mesh, face/value map, roll quaternions, roll value, and rolling update.
  // Combat only adds its public group to the scene and consumes the result.
  combat.oracleD20 = createOracleD20({
    controlState: combat.controlState,
    rigTuning: combat.rigTuning,
  });
  combat.oracleD20.hide();
  combat.scene.add(combat.oracleD20.group);

  // Banner: lazily created the first time we need to show a nat 1 / nat 20.
  // No DOM cost until then.
  console.info(
    "[combat] encounter wired. trigger at",
    COMBAT_CONFIG.trigger.position,
  );
}

export function updateCombatEncounter(delta) {
  /*
    Called every frame from main.js's animate() loop.

    delta is seconds since the last frame (already clamped in main.js).
    We use it for:
      - audio volume ramps
      - opacity fades on the enemy and its hitbox
      - phase timers
      - the d20 label "scramble" while it tumbles

    This function is the WHOLE state machine.  Each phase does its own work
    and decides when to transition.  Transitions live in tiny helpers
    (enterPhase_xxx) so the WHAT-happens-next is easy to scan.
  */
  if (!combat.scene) return; // init not called yet

  if (combat.riggingVisibilitySuppressed) {
    /*
      G53 rigging mode is a precision setup mode. Combat trigger/hitbox visuals
      can sit right in the measuring area, so main.js asks this module to hide
      them temporarily. While suppressed, combat state is paused visually and
      does not advance until rigging mode exits.
    */
    applyCombatRiggingVisibilitySuppression();
    return;
  }

  // Where is the rig's footprint right now in world coords?
  // We add rootOffsetX/Z because main.js does the same when running encounters —
  // staying consistent means the trigger fires in the same spot the rig draws.
  const rigX = combat.controlState.position.x + combat.rigTuning.rootOffsetX;
  const rigZ = combat.controlState.position.z + combat.rigTuning.rootOffsetZ;

  combat.phaseElapsed += delta;

  switch (combat.phase) {
    case "idle":
      tickIdle(rigX, rigZ);
      break;
    case "starting":
      tickStarting(delta);
      break;
    case "rolling":
      tickRolling(delta);
      break;
    case "active":
      tickActive(delta, rigX, rigZ);
      break;
    case "hiding":
      tickHiding(delta, rigX, rigZ);
      break;
    case "ending":
      tickEnding(delta);
      break;
  }
}

export function setCombatRiggingVisibilitySuppressed(suppressed = false) {
  /*
    TEMP / DEV hook for G53 machine-home rigging mode.

    combat_updated.js owns the combat trigger cylinder, enemy hitbox, health bar,
    and d20. main.js should not reach into this module's private state directly.
    This small public switch lets G53 mode hide those visuals while preserving
    the same station boundary we use elsewhere.
  */
  if (!combat.scene) {
    return;
  }

  if (suppressed) {
    if (!combat.riggingVisibilitySuppressed) {
      combat.riggingVisibilitySnapshot = {
        triggerCylinder: combat.triggerCylinder?.visible ?? false,
        enemyGroup: combat.enemyGroup?.visible ?? false,
        enemyHitbox: combat.enemyHitbox?.visible ?? false,
        enemyHealthBar: combat.enemyHealthBar?.visible ?? false,
        oracleD20: combat.oracleD20?.group?.visible ?? false,
      };
    }

    combat.riggingVisibilitySuppressed = true;
    applyCombatRiggingVisibilitySuppression();
    return;
  }

  if (!combat.riggingVisibilitySuppressed) {
    return;
  }

  const snapshot = combat.riggingVisibilitySnapshot;
  combat.riggingVisibilitySuppressed = false;
  combat.riggingVisibilitySnapshot = null;

  if (!snapshot) {
    return;
  }

  if (combat.triggerCylinder) {
    combat.triggerCylinder.visible = snapshot.triggerCylinder;
  }
  if (combat.enemyGroup) {
    combat.enemyGroup.visible = snapshot.enemyGroup;
  }
  if (combat.enemyHitbox) {
    combat.enemyHitbox.visible = snapshot.enemyHitbox;
  }
  if (combat.enemyHealthBar) {
    combat.enemyHealthBar.visible = snapshot.enemyHealthBar;
  }
  if (combat.oracleD20) {
    combat.oracleD20.group.visible = snapshot.oracleD20;
  }
}

function applyCombatRiggingVisibilitySuppression() {
  /*
    Hides every combat visual that can interfere with pivot/attachment
    measurement. Collision/gameplay data is not destroyed; the objects are just
    visually hidden until setCombatRiggingVisibilitySuppressed(false).
  */
  if (combat.triggerCylinder) {
    combat.triggerCylinder.visible = false;
  }
  if (combat.enemyGroup) {
    combat.enemyGroup.visible = false;
  }
  if (combat.enemyHitbox) {
    combat.enemyHitbox.visible = false;
  }
  if (combat.enemyHealthBar) {
    combat.enemyHealthBar.visible = false;
  }
  if (combat.oracleD20) {
    combat.oracleD20.hide();
  }
}

export function setCombatDifficulty(difficulty = "EASY") {
  /*
    Public difficulty setter used by main.js / lil-gui.

    Legal values:
      EASY   = 3 hits
      MEDIUM = 4 hits
      HARD   = 5 hits

    The values are stored in COMBAT_CONFIG.health.hitPointsByDifficulty so the
    actual hit-point math has exactly one source of truth. If difficulty changes
    during an active fight, the current HP is clamped into the new max instead
    of being fully reset. Fresh encounters always start at full HP.
  */
  const normalized = String(difficulty).toUpperCase();
  const nextMax = COMBAT_CONFIG.health.hitPointsByDifficulty[normalized];

  if (!nextMax) {
    console.warn("[combat] unknown difficulty", difficulty);
    return COMBAT_CONFIG.health.difficulty;
  }

  COMBAT_CONFIG.health.difficulty = normalized;

  if (combat.enemyMaxHp > 0) {
    combat.enemyMaxHp = nextMax;
    combat.enemyHp = THREE.MathUtils.clamp(combat.enemyHp, 0, nextMax);
    updateHealthBar();
  }

  return COMBAT_CONFIG.health.difficulty;
}

export function attemptCombatSwordHit({
  x = 0,
  z = 0,
  yaw = 0,
  range = 1.45,
  arcRadians = Math.PI * 0.72,
} = {}) {
  /*
    Called by main.js when the player presses Enter during a sword swing.

    This function is intentionally the only gameplay doorway between the rig
    animation and the combat encounter:
      - main.js owns the sword model and arm pose.
      - combat_updated.js owns enemy state, hit points, hiding, and victory.

    Hit test:
      1. Encounter must be in active phase.
      2. Enemy center must be inside sword range.
      3. Enemy must be inside the player's forward attack arc.

    Forward vector from yaw:
      forward = (sin(yaw), cos(yaw))

    Direction to enemy:
      toEnemy = normalize(enemy - player)

    Arc test:
      dot(forward, toEnemy) >= cos(arcRadians / 2)
  */
  if (combat.phase !== "active") {
    if (combat.phase === "hiding") {
      showBanner("Find the enemy!", "#f7f0df");
    }
    return { hit: false, reason: combat.phase };
  }

  const dx = combat.enemyGroup.position.x - x;
  const dz = combat.enemyGroup.position.z - z;
  const distance = Math.hypot(dx, dz);

  if (distance > range) {
    showBanner("Out of range", "#f7f0df");
    return { hit: false, reason: "range", distance };
  }

  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const invDistance = distance > 0.0001 ? 1 / distance : 1;
  const toEnemyX = dx * invDistance;
  const toEnemyZ = dz * invDistance;
  const dot = forwardX * toEnemyX + forwardZ * toEnemyZ;
  const requiredDot = Math.cos(arcRadians * 0.5);

  if (dot < requiredDot) {
    showBanner("Turn toward enemy", "#f7f0df");
    return { hit: false, reason: "arc", dot };
  }

  applyEnemySwordHit();
  return {
    hit: true,
    remainingHp: combat.enemyHp,
    maxHp: combat.enemyMaxHp,
  };
}

// ===============================================================
// PHASE: idle
// ===============================================================
/*
  Trigger cylinder is visible at 25% opacity.  We check rig distance against
  the trigger center every frame.  When the rig steps inside, we start.
*/
function tickIdle(rigX, rigZ) {
  const [tx, tz] = COMBAT_CONFIG.trigger.position;
  const dx = rigX - tx;
  const dz = rigZ - tz;
  const distanceSquared = dx * dx + dz * dz;
  // Squared distance avoids a sqrt every frame.  Cheap, identical comparison.
  const radius = COMBAT_CONFIG.trigger.radius;

  if (distanceSquared <= radius * radius) {
    enterPhase_starting(rigX, rigZ);
  }
}

// ===============================================================
// PHASE: starting
// ===============================================================
/*
  We do four things on entry:
    1. Hide the trigger cylinder so the player isn't visually confused.
    2. Place the enemy in front of the rig and start fading it in.
    3. Begin the audio crossfade (BG down, battle up).
    4. Make the d20 invisible but ready for the next phase.

  Why hide the trigger immediately?
    Keeping it visible while combat happens would suggest "you can leave",
    and requirement #11 says contact with the enemy is the only exit.
*/
function enterPhase_starting(rigX, rigZ) {
  combat.phase = "starting";
  combat.phaseElapsed = 0;

  // 1) Hide trigger (we restore it on encounter end, requirement #14).
  combat.triggerCylinder.visible = false;

  // 2) Position enemy.  Use the rig's facing direction so the enemy appears
  //    in front of the rig regardless of which side they walked in from.
  const yaw = combat.controlState.yaw;
  const forwardX = Math.sin(yaw);
  const forwardZ = Math.cos(yaw);
  const distance = COMBAT_CONFIG.enemy.spawnForwardDistance;
  const ex = rigX + forwardX * distance;
  const ez = rigZ + forwardZ * distance;

  combat.enemyGroup.position.set(ex, COMBAT_CONFIG.enemy.groundY, ez);
  combat.enemyGroup.rotation.y =
    combat.controlState.yaw + Math.PI + COMBAT_CONFIG.enemy.modelYawOffset;
  combat.enemyAnchor.copy(combat.enemyGroup.position);
  combat.enemyHitbox.position.set(0, COMBAT_CONFIG.enemy.hitboxHeight / 2, 0);
  resetEnemyHealth();

  // Ensure the GLB has been loaded.  loadEnemyGlbIfNeeded returns a promise but
  // we don't block the state machine on it — the wrapper exists either way and
  // the fade will simply have nothing to fade on the very first frame if the
  // network is slow.  That is fine for a prototype.
  loadEnemyGlbIfNeeded();

  // Reset opacities to 0 so the fade starts from invisible.
  setEnemyOpacity(0);
  combat.enemyGroup.visible = true;
  combat.enemyHitbox.visible = true;
  combat.enemyHealthBar.visible = true;

  // 3) Start the battle audio fade.  Browsers may have blocked autoplay until the
  //    user pressed a key/clicked — but they just walked into the trigger using
  //    the keyboard, which counts as user interaction, so play() should succeed.
  //    The audio manager owns the actual Audio element and play() handling.
  combat.audioManager?.startCombatMusic();

  // 4) d20 stays hidden through this phase.
  combat.oracleD20.hide();

  console.info("[combat] encounter started.");
}

function tickStarting(delta) {
  /*
    Progress is a 0->1 value driven by phaseElapsed / fadeInSeconds.
    We use it to drive three independent ramps:
      - enemy opacity 0->1
      - battle volume 0->target
      - bg volume current->0

    All three finish at the same moment because they share `progress`.  This is
    the same "single clock" idea used by the dice prototype's rollState.
  */
  const progress =
    combat.audioManager?.updateCombatMusicFadeIn(delta) ??
    Math.min(combat.phaseElapsed, 1);

  setEnemyOpacity(progress);

  if (progress >= 1) {
    enterPhase_rolling();
  }
}

// ===============================================================
// PHASE: rolling
// ===============================================================
/*
  The roll value is still a plain d20:

    rollValue = floor(random() * 20) + 1

  The difference is visual authority. Instead of drawing a changing number onto
  a billboard, the value selects a real face on the physical d20. The animation
  then tumbles toward the quaternion that points that face back at the player.
*/
function enterPhase_rolling() {
  combat.phase = "rolling";
  combat.phaseElapsed = 0;

  const roll = combat.oracleD20.startRoll();

  // Map the roll to the "enemy evasion" tiers from requirement #10.
  // This is the /enemyAI evaluate-then-act pattern collapsed to its simplest
  // possible form: one input (the roll), one output (a tier label).
  combat.evasionTier = computeEvasionTier(roll.rollValue);

  console.info(
    `[combat] d20 rolled ${roll.rollValue} -> enemy evasion ${combat.evasionTier}`,
  );
}

function tickRolling(delta) {
  const roll = combat.oracleD20.update(delta);

  if (roll.settledThisFrame) {
    // Show nat 1 / nat 20 banner (requirement #9).  These are the only
    // gameplay-visible messages from the dice itself.
    if (roll.rollValue === 20) {
      showBanner("CRIT!", "#43d7c4");
    } else if (roll.rollValue === 1) {
      showBanner("CRIT FAIL!", "#ff6b6b");
    } else {
      // For non-crits show the evasion tier instead so the player understands
      // how the roll wired into the enemy mechanic.  This is the
      // /enemyAI "expose the reason" idea (MECHANIC.md, step 6).
      showBanner(`Enemy evasion: ${combat.evasionTier}`, "#f7f0df");
    }
  }

  if (roll.complete) {
    enterPhase_active();
  }
}

function computeEvasionTier(rollValue) {
  /*
    Requirement #10:
      d1-d6   best evasion
      d7-d14  moderate
      d15-d20 worst

    Note: "best evasion" means the enemy evades best, which the player will feel
    as the encounter being harder.  We currently surface it as a label only; if
    you later want it to actually affect contact range or enemy speed, this is
    the function to read.
  */
  if (rollValue <= 6) return "BEST";
  if (rollValue <= 14) return "MODERATE";
  return "WORST";
}

// ===============================================================
// PHASE: active
// ===============================================================
/*
  The dice are gone. The enemy, its hitbox, and its health bar are visible.
  The rig can chase the enemy, and pressing Enter during a sword swing asks
  attemptCombatSwordHit() to check range/arc and subtract HP.
*/
function enterPhase_active() {
  combat.phase = "active";
  combat.phaseElapsed = 0;
  combat.oracleD20.hide();
  combat.enemyGroup.visible = true;
  combat.enemyHitbox.visible = true;
  combat.enemyHealthBar.visible = true;
  // Don't auto-clear the banner — let it linger a moment so the player reads it.
  setTimeout(() => clearBanner(), 1500);
}

function tickActive(delta, rigX, rigZ) {
  updateEnemyEvasion(delta, rigX, rigZ);
  faceEnemyTowardRig(rigX, rigZ, delta);

  const ex = combat.enemyGroup.position.x;
  const ez = combat.enemyGroup.position.z;
  const dx = rigX - ex;
  const dz = rigZ - ez;
  const distanceSquared = dx * dx + dz * dz;
  const profile = getEvasionProfile();
  const contactRadius =
    COMBAT_CONFIG.enemy.contactRadius * profile.contactScale;

  if (distanceSquared <= contactRadius * contactRadius) {
    showBanner("Press Enter to strike", "#f7f0df");
  }
}

function resetEnemyHealth() {
  /*
    Sets hit points at encounter start.

    Difficulty map:
      EASY   = 3 hits
      MEDIUM = 4 hits
      HARD   = 5 hits

    This is intentionally config-driven instead of hard-coded in the hit logic,
    so a later GUI control only needs to edit COMBAT_CONFIG.health.difficulty.
  */
  combat.enemyMaxHp =
    COMBAT_CONFIG.health.hitPointsByDifficulty[
      COMBAT_CONFIG.health.difficulty
    ] || COMBAT_CONFIG.health.hitPointsByDifficulty.EASY;
  combat.enemyHp = combat.enemyMaxHp;
  updateHealthBar();
}

function applyEnemySwordHit() {
  combat.enemyHp = Math.max(0, combat.enemyHp - 1);
  updateHealthBar();

  if (combat.enemyHp <= 0) {
    showBanner("Enemy defeated!", "#43d7c4");
    enterPhase_ending();
    return;
  }

  showBanner(`Hit! ${combat.enemyHp}/${combat.enemyMaxHp}`, "#43d7c4");
  enterPhase_hiding();
}

function enterPhase_hiding() {
  /*
    After each successful non-lethal hit, the enemy breaks line of contact.

    The prototype version "runs and hides" by:
      1. hiding the enemy and hitbox
      2. choosing a new point on its leash circle away from the player
      3. reappearing after a short delay

    That makes the player reacquire the target before the next hit. It is
    intentionally simple and game-readable before we add pathfinding.
  */
  combat.phase = "hiding";
  combat.phaseElapsed = 0;
  combat.enemyGroup.visible = false;
  combat.enemyHitbox.visible = false;
  combat.enemyHealthBar.visible = false;
}

function tickHiding(delta, rigX, rigZ) {
  if (combat.phaseElapsed < COMBAT_CONFIG.health.hideSeconds) {
    return;
  }

  relocateEnemyForNextHit(rigX, rigZ);
  combat.enemyGroup.visible = true;
  combat.enemyHitbox.visible = true;
  combat.enemyHealthBar.visible = true;
  setEnemyOpacity(1);
  combat.phase = "active";
  combat.phaseElapsed = 0;
  showBanner("Enemy reappeared!", "#f7f0df");
}

function relocateEnemyForNextHit(rigX, rigZ) {
  /*
    Picks a new hiding spot on the leash circle.

    We bias the new point away from the player's current position:
      awayFromPlayer = normalize(anchor - player)

    Then we add a small alternating side component so repeated hits do not place
    the enemy on the exact same point every time.
  */
  const anchor = combat.enemyAnchor;
  const away = new THREE.Vector2(anchor.x - rigX, anchor.z - rigZ);

  if (away.lengthSq() <= 0.0001) {
    away.set(1, 0);
  } else {
    away.normalize();
  }

  const sideSign = combat.enemyHp % 2 === 0 ? 1 : -1;
  const side = new THREE.Vector2(-away.y, away.x).multiplyScalar(
    0.42 * sideSign,
  );
  const direction = away.add(side).normalize();
  const radius = COMBAT_CONFIG.evasion.leashRadius * 0.82;

  combat.enemyGroup.position.set(
    anchor.x + direction.x * radius,
    COMBAT_CONFIG.enemy.groundY,
    anchor.z + direction.y * radius,
  );
}

function getEvasionProfile() {
  /*
    Converts the roll result label into actual enemy behavior.

    BEST:
      Fastest dodge, more side-step, smaller capture radius.

    MODERATE:
      Middle behavior.

    WORST:
      Slow dodge, almost no side-step, larger capture radius.

    The roll still happens once. The result becomes a stable profile for the
    active phase, which keeps the mechanic readable instead of random every
    frame.
  */
  return (
    COMBAT_CONFIG.evasion.profiles[combat.evasionTier] ||
    COMBAT_CONFIG.evasion.profiles.MODERATE
  );
}

function updateEnemyEvasion(delta, rigX, rigZ) {
  /*
    Moves the whole enemyGroup, not the GLB and hitbox separately.

    The steering is deliberately primitive:
      1. If the player is close, move away from the player.
      2. Add a sideways juke so it does not look like a straight retreat.
      3. Pull back toward the spawn anchor when reaching the leash radius.

    Formula pieces:
      playerPressure = 1 - clamp(distanceToPlayer / evadeStartDistance)
      away           = normalize(enemy - player)
      tangent        = perpendicular(away) * sin(time * jukeFrequency)
      homePull       = normalize(anchor - enemy) when near/outside leash

    The enemy is intentionally slower than the player, so evasion creates a
    chase but does not make the encounter unwinnable.
  */
  const profile = getEvasionProfile();
  const position = combat.enemyGroup.position;
  const toEnemy = new THREE.Vector2(position.x - rigX, position.z - rigZ);
  const distanceToPlayer = Math.max(toEnemy.length(), 0.0001);
  const playerPressure = THREE.MathUtils.clamp(
    1 - distanceToPlayer / COMBAT_CONFIG.evasion.evadeStartDistance,
    0,
    1,
  );

  const away = toEnemy.divideScalar(distanceToPlayer);
  const tangent = new THREE.Vector2(-away.y, away.x).multiplyScalar(
    Math.sin(combat.phaseElapsed * profile.jukeFrequency) * profile.strafe,
  );
  const home = new THREE.Vector2(
    combat.enemyAnchor.x - position.x,
    combat.enemyAnchor.z - position.z,
  );
  const homeDistance = home.length();
  const homeDirection =
    homeDistance > 0.0001 ? home.clone().divideScalar(homeDistance) : home;
  const leashPressure = THREE.MathUtils.clamp(
    (homeDistance - COMBAT_CONFIG.evasion.leashRadius * 0.68) /
      (COMBAT_CONFIG.evasion.leashRadius * 0.32),
    0,
    1,
  );
  const steering = away
    .clone()
    .multiplyScalar(playerPressure)
    .add(tangent.multiplyScalar(playerPressure))
    .add(homeDirection.multiplyScalar(leashPressure * 1.8));

  if (steering.lengthSq() <= 0.000001) {
    return;
  }

  steering.normalize();
  const nextX = position.x + steering.x * profile.speed * delta;
  const nextZ = position.z + steering.y * profile.speed * delta;
  const nextFromAnchor = new THREE.Vector2(
    nextX - combat.enemyAnchor.x,
    nextZ - combat.enemyAnchor.z,
  );

  if (nextFromAnchor.length() > COMBAT_CONFIG.evasion.leashRadius) {
    nextFromAnchor.setLength(COMBAT_CONFIG.evasion.leashRadius);
    position.x = combat.enemyAnchor.x + nextFromAnchor.x;
    position.z = combat.enemyAnchor.z + nextFromAnchor.y;
  } else {
    position.x = nextX;
    position.z = nextZ;
  }

  // Keep the encounter on the playing field plane even if a future tweak tries
  // to nudge the group vertically.
  position.y = COMBAT_CONFIG.enemy.groundY;
}

function faceEnemyTowardRig(rigX, rigZ, delta) {
  /*
    Keeps the enemy visually aware of the player.

    yaw = atan2(deltaX, deltaZ)

    Three.js Y rotation turns around the vertical axis. atan2 gives the angle
    from the enemy toward the rig on the X/Z floor plane. modelYawOffset is the
    manual correction if the asset's "front" was authored facing the other way.
  */
  const dx = rigX - combat.enemyGroup.position.x;
  const dz = rigZ - combat.enemyGroup.position.z;

  if (dx * dx + dz * dz <= 0.0001) {
    return;
  }

  const targetYaw = Math.atan2(dx, dz) + COMBAT_CONFIG.enemy.modelYawOffset;
  const t = 1 - Math.pow(0.001, delta * 2.2);
  combat.enemyGroup.rotation.y = lerpAngle(
    combat.enemyGroup.rotation.y,
    targetYaw,
    t,
  );
}

function lerpAngle(current, target, t) {
  /*
    Interpolates radians along the shortest turn.

    A plain numeric lerp can spin almost a full circle when one angle is just
    below -PI and the other is just above +PI. atan2(sin, cos) wraps the
    difference into the -PI..PI range first, so the enemy turns the short way.
  */
  const wrappedDelta = Math.atan2(
    Math.sin(target - current),
    Math.cos(target - current),
  );
  return current + wrappedDelta * t;
}

// ===============================================================
// PHASE: ending
// ===============================================================
/*
  Reverse of `starting`:
    - enemy opacity 1 -> 0
    - hitbox opacity 0.15 -> 0
    - battle volume target -> 0
    - bg volume 0 -> 1

  Once those finish, we hide combat visuals, restore the trigger cylinder, and
  go back to idle (requirement #14 + #15: clean reset).
*/
function enterPhase_ending() {
  combat.phase = "ending";
  combat.phaseElapsed = 0;
  combat.audioManager?.stopCombatMusic();
  console.info("[combat] ending encounter.");
}

function tickEnding(delta) {
  const progress =
    combat.audioManager?.updateCombatMusicFadeOut(delta) ??
    Math.min(combat.phaseElapsed, 1);
  const inverse = 1 - progress;

  setEnemyOpacity(inverse);

  if (progress >= 1) {
    // Final cleanup: hide everything combat-specific and put the trigger back.
    // We do NOT dispose the GLB or geometries — keeping them in memory means the
    // next encounter starts instantly.  If you want truly aggressive cleanup you
    // could call disposeObjectTree() on the enemy group here.
    combat.enemyGroup.visible = false;
    combat.enemyHitbox.visible = false;
    combat.enemyHealthBar.visible = false;
    combat.oracleD20.hide();

    // Restore trigger cylinder so the encounter can fire again (requirement #14).
    combat.triggerCylinder.visible = true;

    combat.phase = "idle";
    combat.phaseElapsed = 0;
    clearBanner();
    console.info("[combat] world restored to pre-encounter state.");
  }
}

// ===============================================================
// CONSTRUCTORS  (Three.js objects)
// ===============================================================

function buildTriggerCylinder() {
  /*
    A plain see-through cylinder marker.  CylinderGeometry's default axis is Y,
    which is exactly what we want — the rig walks around it on the XZ plane.

    Why we don't add it to worldCollision:
      The encounter system in world.js treats triggers as NON-blocking.  The rig
      should walk INTO the cylinder, not bounce off it.
  */
  const [tx, tz] = COMBAT_CONFIG.trigger.position;
  const geom = new THREE.CylinderGeometry(
    COMBAT_CONFIG.trigger.radius,
    COMBAT_CONFIG.trigger.radius,
    COMBAT_CONFIG.trigger.height,
    32,
  );
  const mat = new THREE.MeshBasicMaterial({
    color: COMBAT_CONFIG.trigger.color,
    transparent: true,
    opacity: COMBAT_CONFIG.trigger.opacity,
    depthWrite: false, // don't occlude other transparent things behind it
    side: THREE.DoubleSide,
  });
  const cyl = new THREE.Mesh(geom, mat);
  cyl.name = "combat-trigger-cylinder";
  cyl.position.set(tx, COMBAT_CONFIG.trigger.height / 2, tz);
  cyl.renderOrder = 4;
  return cyl;
}

function buildEnemyHitbox() {
  /*
    Visible contact cylinder shown at 15% opacity (requirement #7).
    The actual "did the rig touch the enemy?" check uses contactRadius, NOT the
    visual radius — same value here, but they are separate so you can make the
    visual slightly larger for clarity without changing gameplay.
  */
  const geom = new THREE.CylinderGeometry(
    COMBAT_CONFIG.enemy.hitboxRadius,
    COMBAT_CONFIG.enemy.hitboxRadius,
    COMBAT_CONFIG.enemy.hitboxHeight,
    32,
  );
  const mat = new THREE.MeshBasicMaterial({
    color: COMBAT_CONFIG.enemy.hitboxColor,
    transparent: true,
    opacity: COMBAT_CONFIG.enemy.hitboxOpacity,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const cyl = new THREE.Mesh(geom, mat);
  cyl.name = "combat-enemy-hitbox";
  // Local position because the hitbox is parented to combat.enemyGroup.
  // enemyGroup.position is the enemy's feet-on-floor anchor at Y = groundY.
  cyl.position.set(0, COMBAT_CONFIG.enemy.hitboxHeight / 2, 0);
  cyl.renderOrder = 4;
  return cyl;
}

function buildEnemyHealthBar() {
  /*
    Creates a small in-world health bar above the enemy.

    Parent:
      combat.enemyGroup

    Local placement:
      y = targetHeight + yOffset adjustment

    The bar uses two planes:
      - background: fixed black translucent backing
      - fill: green/yellow/red rectangle scaled on X by health percentage

    Scaling note:
      PlaneGeometry scales from its center, so updateHealthBar() also shifts the
      fill's X position left as it shrinks. That makes the left edge stay fixed,
      which is how most game health bars read.
  */
  const group = new THREE.Group();
  group.name = "combat-enemy-healthbar";
  group.position.set(0, COMBAT_CONFIG.health.yOffset, 0.08);

  const background = new THREE.Mesh(
    new THREE.PlaneGeometry(
      COMBAT_CONFIG.health.barWidth,
      COMBAT_CONFIG.health.barHeight,
    ),
    new THREE.MeshBasicMaterial({
      color: 0x050505,
      transparent: true,
      opacity: 0.72,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  background.name = "combat-enemy-healthbar-background";

  const fill = new THREE.Mesh(
    new THREE.PlaneGeometry(
      COMBAT_CONFIG.health.barWidth,
      COMBAT_CONFIG.health.barHeight * 0.62,
    ),
    new THREE.MeshBasicMaterial({
      color: 0x43d7c4,
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  fill.name = "combat-enemy-healthbar-fill";
  fill.position.z = 0.01;

  group.add(background);
  group.add(fill);
  combat.enemyHealthFill = fill;
  updateHealthBar();
  return group;
}

function updateHealthBar() {
  if (!combat.enemyHealthFill || !combat.enemyMaxHp) {
    return;
  }

  const percent = THREE.MathUtils.clamp(combat.enemyHp / combat.enemyMaxHp, 0, 1);
  const fullWidth = COMBAT_CONFIG.health.barWidth;

  combat.enemyHealthFill.scale.x = Math.max(percent, 0.001);
  combat.enemyHealthFill.position.x = -fullWidth * 0.5 * (1 - percent);

  if (percent > 0.55) {
    combat.enemyHealthFill.material.color.set("#43d7c4");
  } else if (percent > 0.25) {
    combat.enemyHealthFill.material.color.set("#f7f0df");
  } else {
    combat.enemyHealthFill.material.color.set("#ff6b6b");
  }
}

// ===============================================================
// ENEMY GLB LOADER
// ===============================================================
/*
  Loaded once on first encounter.  The GLB is parented to combat.enemyGroup so
  we can fade and move it as a single object regardless of how many meshes the
  artist exported.

  Materials are forced to transparent so we can drive opacity from 0 -> 1 during
  fade-in.  Without this, opacity changes on the material would have no effect.
*/
let enemyGlbLoadStarted = false;
function loadEnemyGlbIfNeeded() {
  if (enemyGlbLoadStarted) return;
  enemyGlbLoadStarted = true;

  const loader = new GLTFLoader();
  loader.load(
    COMBAT_CONFIG.enemy.modelPath,
    (gltf) => {
      const root = gltf.scene;
      normalizeEnemyModel(root);

      // Force every material to support transparency so we can fade it in/out.
      root.traverse((node) => {
        if (node.isMesh && node.material) {
          const mats = Array.isArray(node.material)
            ? node.material
            : [node.material];
          mats.forEach((m) => {
            m.transparent = true;
            m.depthWrite = true; // depth still writes so the mesh looks solid
            m.opacity = 0; // starts invisible; fade ramps it up
          });
        }
      });

      combat.enemyGroup.add(root);
      setEnemyOpacity(getCurrentEnemyOpacity());
      console.info("[combat] enemy.glb loaded.");
    },
    undefined,
    (error) => {
      console.error("[combat] failed to load enemy.glb:", error);
    },
  );
}

function normalizeEnemyModel(root) {
  /*
    Fits enemy.glb into the Empyrean playing field.

    GLB files often arrive in whatever units/origin the modeling tool used:
      - huge or tiny scale
      - origin in the model's center instead of at its feet
      - geometry extending below Y=0

    Empyrean wants:
      - enemyGroup.position.y = ground level
      - root's lowest vertex sitting on local Y=0
      - root centered on local X/Z so the hitbox cylinder wraps it

    Math:
      originalHeight = boundingBox.max.y - boundingBox.min.y
      fitScale       = targetHeight / originalHeight
      finalScale     = fitScale * manualScale

      root.scale *= finalScale

      After scaling, compute the box again:
        root.position.x -= center.x
        root.position.z -= center.z
        root.position.y -= min.y

      Subtracting min.y lifts or lowers the mesh so its bottom touches the local
      floor. Subtracting center.x/z puts the visual center inside the hitbox.
  */
  root.updateMatrixWorld(true);
  const originalBox = new THREE.Box3().setFromObject(root);
  const originalSize = originalBox.getSize(new THREE.Vector3());
  const originalHeight = Math.max(originalSize.y, 0.0001);
  const fitScale = COMBAT_CONFIG.enemy.targetHeight / originalHeight;
  const finalScale = fitScale * COMBAT_CONFIG.enemy.scale;

  root.scale.multiplyScalar(finalScale);
  root.updateMatrixWorld(true);

  const fittedBox = new THREE.Box3().setFromObject(root);
  const fittedCenter = fittedBox.getCenter(new THREE.Vector3());

  root.position.x -= fittedCenter.x;
  root.position.z -= fittedCenter.z;
  root.position.y -= fittedBox.min.y;
  root.updateMatrixWorld(true);

  const finalBox = new THREE.Box3().setFromObject(root);
  const finalSize = finalBox.getSize(new THREE.Vector3());
  console.info("[combat] enemy.glb normalized.", {
    originalHeight: Number(originalHeight.toFixed(3)),
    finalHeight: Number(finalSize.y.toFixed(3)),
    finalScale: Number(finalScale.toFixed(4)),
  });
}

function getCurrentEnemyOpacity() {
  /*
    If enemy.glb finishes loading after the encounter has already started, this
    returns the opacity it should receive immediately instead of waiting for the
    next fade frame. This avoids the "loaded invisible forever" edge case.
  */
  if (combat.phase === "starting") {
    return (
      combat.audioManager?.getCombatFadeInProgress?.() ??
      Math.min(combat.phaseElapsed, 1)
    );
  }

  if (combat.phase === "ending") {
    return (
      1 -
      (combat.audioManager?.getCombatFadeOutProgress?.() ??
        Math.min(combat.phaseElapsed, 1))
    );
  }

  if (combat.phase === "rolling" || combat.phase === "active") {
    return 1;
  }

  return 0;
}

function setEnemyOpacity(value) {
  /*
    Sets the alpha of every mesh material in the enemy group AND the hitbox.
    We use this each frame during fades — it's cheap because it just writes a
    float; the hot path inside Three.js doesn't notice.
  */
  combat.enemyGroup.traverse((node) => {
    if (node === combat.enemyHitbox) {
      return;
    }

    if (node.isMesh && node.material) {
      const mats = Array.isArray(node.material)
        ? node.material
        : [node.material];
      mats.forEach((m) => {
        m.opacity = value;
      });
    }
  });
  // Hitbox uses the configured opacity as its peak; we scale by the fade ratio
  // so it doesn't pop in at full strength.
  combat.enemyHitbox.material.opacity =
    COMBAT_CONFIG.enemy.hitboxOpacity * value;
}

// ===============================================================
// BANNER  (lightweight DOM overlay for nat 1 / nat 20 messages)
// ===============================================================
/*
  We use a DOM element rather than a Three.js sprite for the message because:
    - it scales with the browser, not the camera distance
    - the empyrean_dice prototype already uses a CSS-animated DOM banner, so
      this keeps the look consistent
    - it's cheap to add/remove without touching the renderer

  We create it lazily so the page DOM stays clean if combat never fires.
*/
function ensureBanner() {
  if (combat.banner) return combat.banner;

  const div = document.createElement("div");
  div.id = "combat-banner";
  // Inline styles to avoid editing styles.css for a prototype.
  div.style.cssText = [
    "position: fixed",
    "top: 24px",
    "left: 50%",
    "transform: translateX(-50%)",
    "padding: 14px 28px",
    "font: 700 28px Inter, Arial, sans-serif",
    "letter-spacing: 0.04em",
    "color: #061013",
    "background: rgba(247, 240, 223, 0.92)",
    "border-radius: 14px",
    "box-shadow: 0 6px 24px rgba(0,0,0,0.35)",
    "pointer-events: none",
    "opacity: 0",
    "transition: opacity 220ms ease-out",
    "z-index: 9999",
  ].join(";");

  document.body.appendChild(div);
  combat.banner = div;
  return div;
}

function showBanner(message, accent) {
  const div = ensureBanner();
  div.textContent = message;
  // Accent color is used as a left border so we don't blow up the body color contrast.
  div.style.borderLeft = `8px solid ${accent}`;
  div.style.opacity = "1";
}

function clearBanner() {
  if (!combat.banner) return;
  combat.banner.style.opacity = "0";
  combat.banner.textContent = "";
}
