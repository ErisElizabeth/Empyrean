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

  STEP 2 — MULTI-ENCOUNTER SHAPE (current rollout)
  ------------------------------------------------
  Two layers of state:

    SESSION (singleton, in this file)
      idle / starting / rolling / active / ending

    PER-ENEMY (one per trigger zone, owned by enemy.js)
      idle / spawning / active / hiding / dying / gone

  Triggers are an array (COMBAT_CONFIG.triggers.zones). Each zone owns a
  cylinder and a pre-created enemy instance. When the rig walks into a zone:

    - if session is idle    → cold start: visible d20 will run after audio fades in
    - if session is active  → silent spawn: hidden d20 contributes to pressure
    - if session is rolling → silent spawn while the first d20 is still settling
    - if session is starting→ silent spawn during audio fade-in
    - if session is ending  → cancel the fade-out, return to active

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
  // Default placements:
  //   central-room    trigger at [0,4] (rig walks forward from spawn into it)
  //                   enemy spawns at [0,-8] (north end of central room)
  //   negative-x-room trigger at [-22,0] (player walks west through door)
  //                   enemy spawns at [-28,0] (further west, into the room)
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
      { id: "central-room",    position: [0, 4],    spawnPosition: [0, -8] },
      { id: "negative-x-room", position: [-22, 0],  spawnPosition: [-28, 0] },
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
  // is currently spawning / active / hiding / dying). Once an enemy goes to
  // "gone", it is removed from this array and its zone re-arms.
  enemies: [],

  // Each enemy's d20 roll tier (BEST/MODERATE/WORST). Used to recompute the
  // shared `pressureTier`. Stored as a Map so removal-on-death is O(1).
  enemyRolls: null, // initialized in initCombatEncounter

  // The first enemy of a cold-started session — the one whose roll the
  // VISIBLE d20 represents. Cleared when the visible roll lands. Subsequent
  // enemies during the same session roll silently in fireTrigger().
  coldStartEnemy: null,

  // Shared "hardest tier" across all rolled-and-living enemies. All living
  // enemies' effective evasion tier is set to this value via recomputePressure().
  pressureTier: null,

  // DOM banner (created lazily; reused).
  banner: null,

  // TEMP / DEV: G53 rigging mode can suppress combat visuals while measuring.
  riggingVisibilitySuppressed: false,
  riggingVisibilitySnapshot: null,

  // Session state machine.
  sessionPhase: "idle", // "idle" | "starting" | "rolling" | "active" | "ending"
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
      2. Tick session-level work (audio fades, visible d20).
      3. Tick every live enemy. Movement is allowed only during session "active".
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
    // or "gone" (fully cleaned up). During spawning / active / hiding /
    // dying, the zone is locked to its current enemy.
    const enemyState = zone.enemy.getState();
    const armed = enemyState === "idle" || enemyState === "gone";

    if (isInside && !wasInside && armed) {
      fireTrigger(zone);
    }
  }

  // 2) Session-level work.
  if (combat.sessionPhase === "starting") {
    const audioProgress =
      combat.audioManager?.updateCombatMusicFadeIn(delta) ??
      Math.min(combat.sessionElapsed, 1);
    if (audioProgress >= 1) {
      enterSession_rolling();
    }
  } else if (combat.sessionPhase === "rolling") {
    const roll = combat.oracleD20.update(delta);
    if (roll.settledThisFrame) {
      // Banner: nat 1 / nat 20 / tier label.
      if (roll.rollValue === 20) {
        showBanner("CRIT!", "#43d7c4");
      } else if (roll.rollValue === 1) {
        showBanner("CRIT FAIL!", "#ff6b6b");
      } else {
        const tier = computeEvasionTier(roll.rollValue);
        showBanner(`Enemy evasion: ${tier}`, "#f7f0df");
      }
    }
    if (roll.complete) {
      // Apply the visible roll to the cold-start enemy, then recompute
      // pressure across everyone alive (including any silent spawns that
      // happened during fade-in/rolling).
      if (combat.coldStartEnemy) {
        applyRollToEnemy(combat.coldStartEnemy, roll.rollValue);
        combat.coldStartEnemy = null;
      }
      enterSession_active();
    }
  } else if (combat.sessionPhase === "ending") {
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

function fireTrigger(zone) {
  /*
    Called when the rig steps into an armed trigger zone. Branches on the
    current session phase:

      idle    — cold start. Move session to "starting", play the audio fade-
                in, prepare the visible d20 to roll after the fade. Tag this
                enemy as coldStartEnemy so the visible roll lands on it.

      ending  — a new encounter began while the previous session's fade-out
                was still running. Cancel the fade-out by snapping session
                back to "active" (the audio manager has its own cancel-fade-
                out path for the volume snap). The new enemy rolls silently.

      starting / rolling / active — silent spawn. Roll a hidden d20, apply
                to this enemy, recompute global pressure.

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
    combat.sessionPhase = "starting";
    combat.sessionElapsed = 0;
    combat.coldStartEnemy = zone.enemy;
    combat.oracleD20.hide(); // ensure hidden until enterSession_rolling
    console.info(`[combat] cold start at trigger '${zone.id}'.`);
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
  const rollValue = Math.floor(Math.random() * 20) + 1;
  applyRollToEnemy(zone.enemy, rollValue);
  console.info(
    `[combat] silent spawn at '${zone.id}' (d20=${rollValue}, pressure=${combat.pressureTier}).`,
  );
}

// ===============================================================
// SESSION STATE TRANSITIONS
// ===============================================================

function enterSession_rolling() {
  /*
    Audio fade-in just completed. Make the d20 visible and start its roll.
    The roll's tier will be applied to combat.coldStartEnemy when it lands
    (see updateCombatEncounter's "rolling" branch).
  */
  combat.sessionPhase = "rolling";
  combat.sessionElapsed = 0;
  combat.oracleD20.startRoll();
  console.info("[combat] session -> rolling (visible d20).");
}

function enterSession_active() {
  /*
    Visible d20 just settled. Hide the die, clear the banner after a moment
    so the player can read it, and let combat run.
  */
  combat.sessionPhase = "active";
  combat.sessionElapsed = 0;
  combat.oracleD20.hide();
  setTimeout(() => clearBanner(), 1500);
  console.info("[combat] session -> active.");
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
  combat.coldStartEnemy = null;
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
