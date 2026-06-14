/*
  EMPYREAN COMBAT ENCOUNTER MODULE
  ===============================================================

  PURPOSE
  -------
  Multi-encounter combat orchestrator. Owns the trigger cylinders, the visible
  d20, the banner, the session state machine, and the public API. Per-enemy
  state and behavior live in enemy.js.

    - exports: initCombatEncounter, updateCombatEncounter,
      setCombatDifficulty, setCombatRiggingVisibilitySuppressed,
      attemptCombatSwordHit
    - main.js calls init once and update each frame.

  CURRENT MULTI-ENCOUNTER SHAPE
  -----------------------------
  Three layers of state:

    SESSION (singleton, in this file)
      idle / active / ending

    ORACLE PRESENTATION (singleton, in this file)
      delayed HUD/d20 replay of a roll that already affected gameplay

    PER-ENEMY (one per trigger zone, owned by enemy.js)
      idle / active / hiding / dying / gone

  Triggers are an array (COMBAT_CONFIG.triggers.zones). Each zone owns a
  cylinder and a pre-created enemy instance. When the rig walks into a zone:

    - if session is idle   -> cold start: roll immediately, apply evasion
                              immediately, enter active combat immediately,
                              and start a delayed non-blocking HUD omen
    - if session is active -> silent spawn: hidden d20 contributes to pressure
    - if session is ending -> cancel the fade-out, return to active

  Pressure: a session-level shared "evasion tier" that ALL living enemies use.
  Recomputed as the hardest tier across all currently-rolled enemies whenever
  a roll lands or an enemy dies. BEST > MODERATE > WORST in difficulty.

  Audio refcount: each spawn calls startCombatMusic (count++); each enemy
  transition to "gone" calls stopCombatMusic (count--). Audio fade-out begins
  only when the last enemy is gone.

  COORDINATE REMINDER
  -------------------
      X = left/right across the floor
      Y = height
      Z = forward/back across the floor
*/

import * as THREE from "three";
import { createOracleD20 } from "./oracleD20.js";
import { createCombatEnemy } from "./enemy.js";

const ORACLE_ROLL_MESSAGES = [
  "",
  "You're fuct, girl.",
  "Absolute garbage.",
  "Deeply embarrassing.",
  "Just... tragic.",
  "Sit down.",
  "Oof. Hard pass.",
  "Pure mediocrity.",
  "Not dead yet.",
  "Room temperature.",
  "Aggressively basic.",
  "Barely legal.",
  "Don't brag.",
  "Lucky bastard.",
  "Look at you.",
  "Free pass.",
  "Big ego energy.",
  "Main character.",
  "Okay, flex.",
  "Pure filth.",
  "Disgusting. Flex.",
];

const ORACLE_HUD_FONT_PROBE_MESSAGE = ORACLE_ROLL_MESSAGES[3];

const ORACLE_PRESENTATION_CONFIG = {
  // Encounter starts, gameplay result applies immediately, then the HUD omen
  // appears a quarter-second later as presentation only.
  hudDelaySeconds: 0.25,
};

// ===============================================================
// CONFIG (tweak these freely — they are the only "knobs" you need)
// ===============================================================
const COMBAT_CONFIG = {
  // ─────────────────────────────────────────────────────────────
  // TRIGGER ZONES
  //
  // Each zone has:
  //   id            — debug label for console logs
  //   position      — [X, Z] of the cylinder (rig must walk in)
  //   spawnPosition — [X, Z] where this zone's enemy appears
  //
  // Add a third object to zones to add a third encounter. The architecture
  // does NOT cap at two — Step 2 sizes the runtime arrays to whatever you
  // configure here.
  //
  // Current Pass 0 placement:
  //   Cathedral replacement work needs the room/church area quiet, so the
  //   active combat triggers are parked in the south outer field.
  //
  // Previous room-area placements, kept here for easy restoration:
  //   central-room    trigger [0, 4],    enemy [0, -8]
  //   negative-x-room trigger [-22, 0],  enemy [-28, 0]
  //
  // Adjust the X/Z values to match where you actually want the encounters.
  // ─────────────────────────────────────────────────────────────
  triggers: {
    // Visual style is shared across all zones for now. Per-zone overrides
    // could be added later by reading from zone instead.
    style: {
      radius: 2.4,
      height: 2.4,
      color: 0x78c7ff,
      opacity: 0.25, // requirement #3: trigger visible at 25%
    },
    zones: [
      {
        id: "outer-southeast-field",
        position: [132, 132],
        spawnPosition: [142, 132],
      },
      {
        id: "outer-southwest-field",
        position: [-132, 132],
        spawnPosition: [-142, 132],
      },
    ],
  },

  // The enemy.glb model and the soft contact cylinder around it.
  // Read by enemy.js via the config passed to createCombatEnemy().
  enemy: {
    modelPath: "assets/enemy.glb",
    // Target Y position for the enemy's feet. Matches the floor at Y=0.
    groundY: 0,
    // Auto-fit target height in scene units. enemy.glb may be authored in an
    // arbitrary modeling scale, so we normalize its bounding-box height to
    // this value before applying the manual scale multiplier below.
    targetHeight: 1.55,
    // Extra vertical scaling tweak after auto-fit. Keep near 1.0.
    scale: 1.0,
    // If the model appears to face away from the player, set this to Math.PI.
    modelYawOffset: 0,
    // Soft contact hitbox (cylinder shown at 15% opacity, requirement #7).
    hitboxRadius: 0.78,
    hitboxHeight: 1.75,
    hitboxColor: 0xff6b6b,
    hitboxOpacity: 0.15,
    // The rig isn't fast (requirement #17). Give the player a clear contact
    // radius — using a margin so they don't have to land exactly on the
    // centerpoint.
    contactRadius: 0.95,
  },

  // Simple enemy evasion. The d20 roll selects one of these profiles.
  evasion: {
    leashRadius: 3.2,
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

  // Fade durations for the enemy's local fade-in/out clocks (independent of
  // the audio fade now — see enemy.js tick()).
  enemyFade: {
    inSeconds: 1.0,
    outSeconds: 1.0,
  },
};

// ===============================================================
// MODULE STATE
// ===============================================================
/*
  Session-level state. Per-enemy fields (group, hp, anchor, etc.) live inside
  each createCombatEnemy() instance — see enemy.js. We keep one persistent
  enemy instance per trigger zone; when a zone fires, that instance is
  spawned (placed + made visible + HP reset). When it dies, the instance
  stays alive in memory but is removed from the active `enemies` array.
*/
const combat = {
  // Set during init by the caller.
  scene: null,
  camera: null,
  controlState: null,
  rigTuning: null,
  audioManager: null,

  // Session-level Three.js objects.
  oracleD20: null,

  // Trigger zones: array of
  //   { id, position, spawnPosition, radius, cylinder, enemy }
  // where `enemy` is the persistent enemy instance for that zone.
  triggerZones: [],

  // ACTIVE enemies (subset of triggerZones[i].enemy values whose lifecycle
  // is currently active / hiding / dying). Once an enemy goes to "gone", it
  // is removed from this array and its zone re-arms.
  enemies: [],

  // Each enemy's d20 roll tier (BEST/MODERATE/WORST). Used to recompute the
  // shared `pressureTier`. Stored as a Map so removal-on-death is O(1).
  enemyRolls: null, // initialized in initCombatEncounter

  // Presentation-only oracle HUD state. Combat results are applied before this
  // starts; the d20/HUD are now an omen replay instead of a gameplay blocker.
  oraclePresentation: {
    active: false,
    elapsed: 0,
    rollValue: 0,
    started: false,
    messageShown: false,
  },

  // Shared "hardest tier" across all rolled-and-living enemies. All living
  // enemies' effective evasion tier is set to this value via recomputePressure().
  pressureTier: null,

  // DOM overlays. The banner is created lazily; the oracle HUD is defined in
  // index.html and cached here the first time combat needs to toggle it.
  banner: null,
  oracleRollHud: null,
  oracleRollHudMessage: null,
  oracleRollHudResizeListenerAttached: false,

  // TEMP / DEV: G53 rigging mode can suppress combat visuals while measuring.
  riggingVisibilitySuppressed: false,
  riggingVisibilitySnapshot: null,

  // Session state machine.
  sessionPhase: "idle", // "idle" | "active" | "ending"
  sessionElapsed: 0,
};

// ===============================================================
// PUBLIC API
// ===============================================================

export function initCombatEncounter(opts) {
  /*
    Called once from main.js after the scene/audio/rig are all set up.

    Builds one trigger cylinder and one pre-created enemy instance PER
    configured zone. Enemies are hidden until their zone fires. The GLB
    itself is still lazy-loaded on first spawn (see enemy.js loadGlbIfNeeded).
  */
  combat.scene = opts.scene;
  combat.camera = opts.camera;
  combat.controlState = opts.controlState;
  combat.rigTuning = opts.rigTuning;
  combat.audioManager = opts.audioManager;
  combat.enemyRolls = new Map();

  // Build trigger zones + their enemy instances.
  combat.triggerZones = COMBAT_CONFIG.triggers.zones.map((zoneConfig) => {
    const cylinder = buildTriggerCylinder(zoneConfig.position);
    combat.scene.add(cylinder);

    const enemy = createCombatEnemy({
      scene: combat.scene,
      modelPath: COMBAT_CONFIG.enemy.modelPath,
      config: {
        enemy: COMBAT_CONFIG.enemy,
        evasion: COMBAT_CONFIG.evasion,
        health: COMBAT_CONFIG.health,
        enemyFade: COMBAT_CONFIG.enemyFade,
      },
    });

    return {
      id: zoneConfig.id,
      position: zoneConfig.position,
      spawnPosition: zoneConfig.spawnPosition,
      radius: COMBAT_CONFIG.triggers.style.radius,
      cylinder,
      enemy,
      // Rising-edge tracker: a zone only fires on the frame the rig FIRST
      // steps into it. The rig must leave (rigInside → false) and re-enter
      // (rigInside → true) before the zone can fire again. Prevents an
      // immediate re-trigger when the player happens to be standing inside
      // the zone at the moment their enemy fully dies.
      rigInside: false,
    };
  });

  // Build the visible oracle d20. It only plays a role in the FIRST encounter
  // of each session; subsequent encounters during the same session roll
  // silently inside fireTrigger().
  combat.oracleD20 = createOracleD20({
    controlState: combat.controlState,
    rigTuning: combat.rigTuning,
    camera: combat.camera,
  });
  combat.oracleD20.hide();
  combat.scene.add(combat.oracleD20.group);

  console.info(
    "[combat] encounter wired. trigger zones:",
    combat.triggerZones.map((z) => `${z.id}@[${z.position}]`).join(", "),
  );
}

export function updateCombatEncounter(delta) {
  /*
    Called every frame from main.js's animate() loop.

    Per-frame work, in order:
      1. Check all armed trigger zones for rig entry. Fire if entered.
      2. Tick non-blocking presentation work (audio fade-in + HUD oracle).
      3. Tick every live enemy. Movement is allowed once the session is active.
      4. Sweep enemies that just hit "gone" and re-arm their zones.
      5. If no live enemies remain, transition session → ending.
      6. Show the "Press Enter to strike" banner if the rig is in range of
         any active enemy.
  */
  if (!combat.scene) return; // init not called yet

  if (combat.riggingVisibilitySuppressed) {
    applyCombatRiggingVisibilitySuppression();
    return;
  }

  const rigX = combat.controlState.position.x + combat.rigTuning.rootOffsetX;
  const rigZ = combat.controlState.position.z + combat.rigTuning.rootOffsetZ;

  combat.sessionElapsed += delta;

  // 1) Trigger zone check (rising-edge: only fires on the frame the rig
  //    first steps in; rig must leave and re-enter to re-fire).
  for (const zone of combat.triggerZones) {
    const [tx, tz] = zone.position;
    const dx = rigX - tx;
    const dz = rigZ - tz;
    const r = zone.radius;
    const wasInside = zone.rigInside;
    const isInside = dx * dx + dz * dz <= r * r;
    zone.rigInside = isInside;

    // A zone is armed when its enemy is "idle" (never spawned this session)
    // or "gone" (fully cleaned up). During active / hiding / dying, the zone
    // is locked to its current enemy.
    const enemyState = zone.enemy.getState();
    const armed = enemyState === "idle" || enemyState === "gone";

    if (isInside && !wasInside && armed) {
      fireTrigger(zone);
    }
  }

  // 2) Session-level work. Audio fade-in and the HUD oracle are now
  //    presentation systems; neither one blocks active combat.
  if (combat.sessionPhase === "active") {
    combat.audioManager?.updateCombatMusicFadeIn(delta);
  }
  tickOraclePresentation(delta);

  if (combat.sessionPhase === "ending") {
    const audioProgress =
      combat.audioManager?.updateCombatMusicFadeOut(delta) ??
      Math.min(combat.sessionElapsed, 1);
    if (audioProgress >= 1) {
      enterSession_idle();
    }
  }

  // 3) Tick every live enemy. Movement is only allowed in active.
  const movementAllowed = combat.sessionPhase === "active";
  for (const enemy of combat.enemies) {
    enemy.tick(delta, rigX, rigZ, { movement: movementAllowed });
  }

  // 4) Sweep "gone" enemies and re-arm their zones.
  cleanupGoneEnemies();

  // 5) If the session is in active but no enemies remain, transition to ending.
  //    The last cleanupGoneEnemies() above will have already called
  //    stopCombatMusic the right number of times to bring the audio refcount
  //    to zero, so the audio fade-out will tick on the next frame.
  if (combat.sessionPhase === "active" && combat.enemies.length === 0) {
    enterSession_ending();
  }

  // 6) "Press Enter to strike" prompt.
  if (combat.sessionPhase === "active") {
    for (const enemy of combat.enemies) {
      if (enemy.getState() !== "active") continue;
      const distSq = enemy.getDistanceToRigSquared(rigX, rigZ);
      const radius = enemy.getContactRadius();
      if (distSq <= radius * radius) {
        showBanner("Press Enter to strike", "#f7f0df");
        break;
      }
    }
  }
}

export function setCombatRiggingVisibilitySuppressed(suppressed = false) {
  /*
    TEMP / DEV hook for G53 machine-home rigging mode.

    Snapshots and restores visibility for every trigger cylinder, every
    enemy, and the d20. The snapshot is parallel to triggerZones so adding a
    third zone just naturally extends the snapshot array.
  */
  if (!combat.scene) {
    return;
  }

  if (suppressed) {
    if (!combat.riggingVisibilitySuppressed) {
      combat.riggingVisibilitySnapshot = {
        triggerCylinders: combat.triggerZones.map(
          (z) => z.cylinder?.visible ?? false,
        ),
        enemies: combat.triggerZones.map(
          (z) => z.enemy?.isVisible() ?? false,
        ),
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

  combat.triggerZones.forEach((z, i) => {
    if (z.cylinder) {
      z.cylinder.visible = snapshot.triggerCylinders[i] ?? false;
    }
    if (z.enemy) {
      if (snapshot.enemies[i]) {
        z.enemy.show();
      } else {
        z.enemy.hide();
      }
    }
  });

  if (combat.oracleD20) {
    combat.oracleD20.group.visible = snapshot.oracleD20;
  }
  setOracleRollHudVisible(
    combat.oraclePresentation.active && combat.oraclePresentation.started,
  );
}

function applyCombatRiggingVisibilitySuppression() {
  /*
    Hides every combat visual that can interfere with pivot/attachment
    measurement. Collision/gameplay data is not destroyed; the objects are
    just visually hidden until setCombatRiggingVisibilitySuppressed(false).
  */
  for (const zone of combat.triggerZones) {
    if (zone.cylinder) zone.cylinder.visible = false;
    zone.enemy?.hide();
  }
  combat.oracleD20?.hide();
  setOracleRollHudVisible(false);
}

export function setCombatDifficulty(difficulty = "EASY") {
  /*
    Public difficulty setter used by main.js / lil-gui.

      EASY   = 3 hits
      MEDIUM = 4 hits
      HARD   = 5 hits

    Applies to all live enemies in the current session — each clamps its
    own HP into the new max so the player doesn't get "healed" mid-fight.
    Fresh encounters always start at full HP for the new difficulty.
  */
  const normalized = String(difficulty).toUpperCase();
  const nextMax = COMBAT_CONFIG.health.hitPointsByDifficulty[normalized];

  if (!nextMax) {
    console.warn("[combat] unknown difficulty", difficulty);
    return COMBAT_CONFIG.health.difficulty;
  }

  COMBAT_CONFIG.health.difficulty = normalized;

  for (const enemy of combat.enemies) {
    if (enemy.hasHpSet()) {
      enemy.setMaxHp(nextMax);
    }
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

    Multi-enemy hit selection: walk every active enemy, pick the closest one
    that is both inside `range` AND inside the forward attack arc. If none
    qualify, show the most-informative miss banner ("Turn toward enemy" if
    any enemy was in range but out of arc; "Out of range" otherwise).
  */
  if (combat.sessionPhase !== "active") {
    return { hit: false, reason: combat.sessionPhase };
  }

  let bestEnemy = null;
  let bestDistance = Infinity;
  let sawArcMiss = false;
  let sawRangeMiss = false;

  for (const enemy of combat.enemies) {
    if (enemy.getState() !== "active") continue;
    const test = enemy.testSwordHit({ x, z, yaw, range, arcRadians });
    if (test.hit) {
      if (test.distance < bestDistance) {
        bestDistance = test.distance;
        bestEnemy = enemy;
      }
    } else if (test.reason === "arc") {
      sawArcMiss = true;
    } else if (test.reason === "range") {
      sawRangeMiss = true;
    }
  }

  if (!bestEnemy) {
    if (sawArcMiss) {
      showBanner("Turn toward enemy", "#f7f0df");
      return { hit: false, reason: "arc" };
    }
    if (sawRangeMiss) {
      showBanner("Out of range", "#f7f0df");
      return { hit: false, reason: "range" };
    }
    return { hit: false, reason: "no-enemy" };
  }

  const result = bestEnemy.applySwordHit();
  if (result.defeated) {
    bestEnemy.startDying();
    showBanner("Enemy defeated!", "#43d7c4");
    // NOTE: stopCombatMusic is called from cleanupGoneEnemies when the enemy
    // actually transitions to "gone" — pairing with the per-spawn startCombatMusic
    // call so the refcount stays consistent.
  } else {
    bestEnemy.startHiding();
    showBanner(`Hit! ${result.remainingHp}/${result.maxHp}`, "#43d7c4");
  }

  return {
    hit: true,
    remainingHp: result.remainingHp,
    maxHp: result.maxHp,
    defeated: result.defeated,
  };
}

// ===============================================================
// TRIGGER FIRING (cold start vs. silent spawn)
// ===============================================================

function rollD20Value() {
  return Math.floor(Math.random() * 20) + 1;
}

function fireTrigger(zone) {
  /*
    Called when the rig steps into an armed trigger zone. Branches on the
    current session phase:

      idle    -> cold start. Roll immediately, apply that result to the enemy,
                enter active combat immediately, then replay the result through
                the delayed HUD/oracle presentation.

      ending  -> a new encounter began while the previous session's fade-out
                was still running. Cancel the fade-out by snapping session
                back to "active" (the audio manager has its own cancel-fade-
                out path for the volume snap). The new enemy rolls silently.

      active  -> silent spawn. Roll a hidden d20, apply to this enemy, and
                recompute global pressure.

    In every branch we call audioManager.startCombatMusic() to increment the
    refcount. The audio manager itself decides whether that translates into
    audible change (cold start = yes; subsequent = no).
  */
  const yaw = combat.controlState.yaw;
  const [sx, sz] = zone.spawnPosition;
  zone.enemy.spawnAt({ x: sx, z: sz, rigYaw: yaw });
  combat.enemies.push(zone.enemy);
  zone.cylinder.visible = false;

  combat.audioManager?.startCombatMusic();

  if (combat.sessionPhase === "idle") {
    const rollValue = rollD20Value();
    applyRollToEnemy(zone.enemy, rollValue);
    combat.sessionPhase = "active";
    combat.sessionElapsed = 0;
    startOraclePresentation(rollValue);
    console.info(
      `[combat] cold start at trigger '${zone.id}' (d20=${rollValue}, pressure=${combat.pressureTier}).`,
    );
    return;
  }

  if (combat.sessionPhase === "ending") {
    // Cancel the in-flight fade-out — the audio manager has already had its
    // own cancel path triggered by startCombatMusic above, so we just need
    // to jump session state back to active and roll silently.
    combat.sessionPhase = "active";
    combat.sessionElapsed = 0;
  }

  // Silent d20: pick a value, derive tier, contribute to pressure.
  const rollValue = rollD20Value();
  applyRollToEnemy(zone.enemy, rollValue);
  console.info(
    `[combat] silent spawn at '${zone.id}' (d20=${rollValue}, pressure=${combat.pressureTier}).`,
  );
}

// ===============================================================
// SESSION STATE TRANSITIONS
// ===============================================================

function startOraclePresentation(rollValue) {
  /*
    Starts the non-blocking oracle HUD show.

    Important ownership split:
      - combat difficulty/evasion has ALREADY been applied to the enemy
      - sessionPhase is ALREADY "active"
      - this state only controls the delayed HUD/d20 replay
  */
  combat.oraclePresentation.active = true;
  combat.oraclePresentation.elapsed = 0;
  combat.oraclePresentation.rollValue = rollValue;
  combat.oraclePresentation.started = false;
  combat.oraclePresentation.messageShown = false;
  combat.oracleD20.hide();
  clearOracleRollHudMessage();
  setOracleRollHudVisible(false);
}

function tickOraclePresentation(delta) {
  const presentation = combat.oraclePresentation;
  if (!presentation.active) {
    return;
  }

  presentation.elapsed += delta;

  let oracleDelta = delta;
  if (!presentation.started) {
    if (presentation.elapsed < ORACLE_PRESENTATION_CONFIG.hudDelaySeconds) {
      return;
    }

    presentation.started = true;
    oracleDelta = Math.max(
      presentation.elapsed - ORACLE_PRESENTATION_CONFIG.hudDelaySeconds,
      0,
    );
    combat.oracleD20.startRoll({ rollValue: presentation.rollValue });
    setOracleRollHudVisible(true);
    console.info(
      `[combat] oracle HUD -> rolling (d20=${presentation.rollValue}).`,
    );
  }

  const roll = combat.oracleD20.update(oracleDelta);
  if (roll.settledThisFrame && !presentation.messageShown) {
    presentation.messageShown = true;
    setOracleRollHudMessageForRoll(roll.rollValue);
  }

  if (roll.complete) {
    finishOraclePresentation();
  }
}

function finishOraclePresentation() {
  combat.oraclePresentation.active = false;
  combat.oraclePresentation.elapsed = 0;
  combat.oraclePresentation.rollValue = 0;
  combat.oraclePresentation.started = false;
  combat.oraclePresentation.messageShown = false;
  combat.oracleD20.hide();
  setOracleRollHudVisible(false);
  console.info("[combat] oracle HUD -> complete.");
}

function cancelOraclePresentation() {
  combat.oraclePresentation.active = false;
  combat.oraclePresentation.elapsed = 0;
  combat.oraclePresentation.rollValue = 0;
  combat.oraclePresentation.started = false;
  combat.oraclePresentation.messageShown = false;
  combat.oracleD20.hide();
  setOracleRollHudVisible(false);
  clearOracleRollHudMessage();
}

function enterSession_ending() {
  /*
    All living enemies are gone. The audio refcount has already been
    decremented to zero by cleanupGoneEnemies (which called stopCombatMusic
    for each gone enemy), so the audio manager is already in fadingOut
    state. updateCombatEncounter's "ending" branch will tick the fade until
    it completes.
  */
  combat.sessionPhase = "ending";
  combat.sessionElapsed = 0;
  cancelOraclePresentation();
  console.info("[combat] session -> ending (no live enemies).");
}

function enterSession_idle() {
  /*
    Audio fade-out completed. Clean up session-level shared state. Every
    trigger zone should already be re-armed (cylinder.visible=true) from
    cleanupGoneEnemies; we re-arm again defensively in case the loop missed
    one (e.g. mid-fade-out interrupted by a manual reset).
  */
  combat.sessionPhase = "idle";
  combat.sessionElapsed = 0;
  combat.pressureTier = null;
  combat.enemyRolls.clear();
  cancelOraclePresentation();
  for (const zone of combat.triggerZones) {
    if (zone.cylinder) zone.cylinder.visible = true;
  }
  clearBanner();
  console.info("[combat] session -> idle.");
}

// ===============================================================
// ENEMY CLEANUP + PRESSURE
// ===============================================================

function cleanupGoneEnemies() {
  /*
    Sweep `combat.enemies` for anyone whose lifecycle just hit "gone". For
    each, remove from the active array, drop their roll from the pressure
    map, re-arm their trigger cylinder, and decrement the audio refcount.

    Walks the array backwards so splice() doesn't shift indices under us.
  */
  let removedAny = false;
  for (let i = combat.enemies.length - 1; i >= 0; i--) {
    const enemy = combat.enemies[i];
    if (enemy.getState() !== "gone") continue;

    combat.enemies.splice(i, 1);
    combat.enemyRolls.delete(enemy);

    // Find the zone that owns this instance (zone.enemy === enemy) and
    // re-arm its cylinder.
    const zone = combat.triggerZones.find((z) => z.enemy === enemy);
    if (zone && zone.cylinder) {
      zone.cylinder.visible = true;
    }

    // Refcount-paired with the startCombatMusic in fireTrigger().
    combat.audioManager?.stopCombatMusic();
    removedAny = true;
  }

  if (removedAny) {
    recomputePressure();
  }
}

function applyRollToEnemy(enemy, rollValue) {
  /*
    Record this enemy's individual d20 roll (as a tier) and recompute
    session-wide pressure across all currently-living rolled enemies.
  */
  const tier = computeEvasionTier(rollValue);
  combat.enemyRolls.set(enemy, tier);
  recomputePressure();
}

function recomputePressure() {
  /*
    Pressure = hardest tier across all currently-living enemies that have
    rolled. Hardest = lowest tierIndex (BEST=0 < MODERATE=1 < WORST=2).

    After the new pressure is found, push it to every living enemy via
    setEvasionTier so they all behave at the same difficulty.
  */
  let hardest = null;
  for (const [enemy, tier] of combat.enemyRolls) {
    if (!combat.enemies.includes(enemy)) continue;
    if (enemy.getState() === "gone") continue;
    if (hardest === null || tierIndex(tier) < tierIndex(hardest)) {
      hardest = tier;
    }
  }
  combat.pressureTier = hardest;

  const applied = hardest || "MODERATE";
  for (const enemy of combat.enemies) {
    enemy.setEvasionTier(applied);
  }
}

function tierIndex(tier) {
  // Smaller = harder. BEST evasion is hardest for the player.
  return { BEST: 0, MODERATE: 1, WORST: 2 }[tier] ?? 1;
}

function computeEvasionTier(rollValue) {
  /*
    Requirement #10:
      d1-d6   best evasion
      d7-d14  moderate
      d15-d20 worst
  */
  if (rollValue <= 6) return "BEST";
  if (rollValue <= 14) return "MODERATE";
  return "WORST";
}

// ===============================================================
// CONSTRUCTORS  (Three.js objects)
// ===============================================================

function buildTriggerCylinder(position) {
  /*
    A plain see-through cylinder marker at [X, Z]. CylinderGeometry's default
    axis is Y, so the rig walks around it on the XZ plane.

    Why we don't add it to worldCollision:
      The encounter system in world.js treats triggers as NON-blocking. The
      rig should walk INTO the cylinder, not bounce off it.
  */
  const [tx, tz] = position;
  const style = COMBAT_CONFIG.triggers.style;
  const geom = new THREE.CylinderGeometry(
    style.radius,
    style.radius,
    style.height,
    32,
  );
  const mat = new THREE.MeshBasicMaterial({
    color: style.color,
    transparent: true,
    opacity: style.opacity,
    depthWrite: false, // don't occlude other transparent things behind it
    side: THREE.DoubleSide,
  });
  const cyl = new THREE.Mesh(geom, mat);
  cyl.name = "combat-trigger-cylinder";
  cyl.position.set(tx, style.height / 2, tz);
  cyl.renderOrder = 4;
  return cyl;
}

// ===============================================================
// BANNER  (lightweight DOM overlay for nat 1 / nat 20 messages)
// ===============================================================
function ensureBanner() {
  if (combat.banner) return combat.banner;

  const div = document.createElement("div");
  div.id = "combat-banner";
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
  div.style.borderLeft = `8px solid ${accent}`;
  div.style.opacity = "1";
}

function clearBanner() {
  if (!combat.banner) return;
  combat.banner.style.opacity = "0";
  combat.banner.textContent = "";
}

// ===============================================================
// ORACLE ROLL HUD  (passive DOM overlay shown only during visible d20 roll)
// ===============================================================
function ensureOracleRollHud() {
  /*
    The HUD box itself lives in index.html/styles.css because it is a screen
    overlay, not a Three.js object. Combat only owns the timing: visible during
    the oracle presentation, hidden everywhere else.

    Fallback creation keeps older cached HTML from throwing if the script loads
    before the new markup is present. The CSS rules still control geometry,
    color, opacity, border, radius, and fade timing.
  */
  if (combat.oracleRollHud) {
    return combat.oracleRollHud;
  }

  let hud = document.getElementById("oracle-roll-hud");
  if (!hud) {
    hud = document.createElement("div");
    hud.id = "oracle-roll-hud";
    hud.setAttribute("aria-hidden", "true");
    document.body.appendChild(hud);
  }
  combat.oracleRollHud = hud;
  return hud;
}

function ensureOracleRollHudMessage() {
  /*
    The message element is a child of the HUD panel. CSS owns its position,
    color, opacity, and 105 mm proportional width. Combat only writes the text
    that corresponds to the d20 result.
  */
  if (combat.oracleRollHudMessage) {
    return combat.oracleRollHudMessage;
  }

  const hud = ensureOracleRollHud();
  let message = document.getElementById("oracle-roll-hud-message");
  if (!message) {
    message = document.createElement("div");
    message.id = "oracle-roll-hud-message";
    message.setAttribute("aria-hidden", "true");
    hud.appendChild(message);
  }

  combat.oracleRollHudMessage = message;
  attachOracleHudResizeCalibration();
  calibrateOracleHudMessageFont();
  document.fonts?.ready?.then(() => calibrateOracleHudMessageFont());
  return message;
}

function setOracleRollHudVisible(visible) {
  const hud = ensureOracleRollHud();
  ensureOracleRollHudMessage();
  hud.classList.toggle("is-visible", Boolean(visible));
}

function setOracleRollHudMessageForRoll(rollValue) {
  const message = ensureOracleRollHudMessage();
  const safeRoll = Math.max(1, Math.min(20, Math.trunc(rollValue || 0)));
  message.textContent = ORACLE_ROLL_MESSAGES[safeRoll] || "";
  message.dataset.rollValue = String(safeRoll);
  message.setAttribute("aria-hidden", message.textContent ? "false" : "true");
  calibrateOracleHudMessageFont();
}

function clearOracleRollHudMessage() {
  const message = ensureOracleRollHudMessage();
  message.textContent = "";
  delete message.dataset.rollValue;
  message.setAttribute("aria-hidden", "true");
}

function attachOracleHudResizeCalibration() {
  if (combat.oracleRollHudResizeListenerAttached) {
    return;
  }
  combat.oracleRollHudResizeListenerAttached = true;
  window.addEventListener("resize", () => calibrateOracleHudMessageFont(), {
    passive: true,
  });
}

function calibrateOracleHudMessageFont() {
  /*
    The request defines the longest placeholder, "Deeply embarrassing.", as
    105 mm wide in the same 698.5 mm screen frame as the HUD. CSS gives the
    message element that exact proportional width. This function measures the
    Caesar Dressing rendering at a known test size and solves the font size:

      targetWidthPx = messageElement.width
      measuredPx    = width of probe text at probeFontPx
      solvedFontPx  = probeFontPx * targetWidthPx / measuredPx

    That gives us the height/aspect ratio the font naturally wants while
    preserving the requested text width foundation.
  */
  const hud = combat.oracleRollHud;
  const message = combat.oracleRollHudMessage;
  if (!hud || !message) {
    return;
  }

  const targetWidth = message.getBoundingClientRect().width;
  if (!Number.isFinite(targetWidth) || targetWidth <= 0) {
    return;
  }

  const probe = document.createElement("span");
  probe.textContent = ORACLE_HUD_FONT_PROBE_MESSAGE;
  probe.style.cssText = [
    "position: fixed",
    "left: -9999px",
    "top: -9999px",
    "visibility: hidden",
    "white-space: nowrap",
    "font-family: 'Caesar Dressing', Georgia, serif",
    "font-weight: 400",
    "font-size: 100px",
    "letter-spacing: 0",
    "line-height: 1",
  ].join(";");

  document.body.appendChild(probe);
  const measuredWidth = probe.getBoundingClientRect().width;
  probe.remove();

  if (!Number.isFinite(measuredWidth) || measuredWidth <= 0) {
    return;
  }

  const solvedFontSize = (100 * targetWidth) / measuredWidth;
  hud.style.setProperty(
    "--hud-message-font-size",
    `${solvedFontSize.toFixed(3)}px`,
  );
}
