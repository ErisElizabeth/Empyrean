/*
  EMPYREAN COMBAT ENEMY
  ===============================================================

  One instance per spawned enemy. Owns:

    - the THREE.Group that holds the GLB, hitbox cylinder, and health bar
    - HP, max HP, evasion tier
    - GLB lazy-load and normalization
    - per-frame evasion movement and facing
    - fade-in/out opacity
    - relocate-after-hit logic

  Does NOT own:

    - the trigger cylinder (combat_updated.js)
    - the visible d20 oracle (combat_updated.js)
    - the phase state machine that times combat (combat_updated.js)
    - audio (audioManager.js)

  This file is a behavior-preserving extraction from combat_updated.js. The
  per-enemy logic is moved here verbatim; the orchestration that called it
  stays in combat_updated.js but talks to this factory's returned API.

  Why a factory function rather than a class:
    Empyrean already uses a factory pattern for createOracleD20() and the
    audio manager. Keeping the same idiom means future "add another enemy"
    work in Step 2 is just calling this factory more than once.
*/

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export function createCombatEnemy({ scene, modelPath, config }) {
  /*
    Arguments:

      scene       — the THREE.Scene to add the enemy group to.
      modelPath   — path to the enemy GLB (e.g. "assets/enemy.glb").
      config      — a REFERENCE-style subset of COMBAT_CONFIG. We hold the
                    reference, so runtime mutations (like setCombatDifficulty
                    flipping config.health.difficulty) are visible on the next
                    read. Shape:

                      {
                        enemy:    { ... },
                        evasion:  { ... },
                        health:   { ... },
                        enemyFade:{ ... },   // currently unused inside; kept
                                             // for symmetry with combat config
                      }

    Returned API: see the bottom of this function.
  */

  // ============================================================
  // PRIVATE STATE
  // ============================================================
  /*
    Everything per-enemy lives in this object so a future multi-enemy
    refactor (Step 2) just creates one factory result per enemy and each gets
    its own isolated state.
  */
  const state = {
    group: new THREE.Group(),
    hitbox: null,
    healthBar: null,
    healthFill: null,
    anchor: new THREE.Vector3(),
    hp: 0,
    maxHp: 0,
    evasionTier: "MODERATE",
    glbLoadStarted: false,
    // Local "time since this enemy became active" clock. Drives the evasion
    // juke sin(). Previously the global combat.phaseElapsed did this — moved
    // local so multiple enemies don't share one juke phase.
    localElapsed: 0,
    // Stored so a late-loading GLB can be matched to the current fade level
    // without combat_updated.js having to know about GLB loading timing.
    currentOpacity: 0,

    // Step 2 — per-enemy lifecycle. Each enemy owns its own state machine so
    // multiple enemies can be in different lifecycle states simultaneously
    // (e.g. enemy A is hiding while enemy B is being hit).
    //
    //   idle      — never spawned, or fully cleaned up.
    //   spawning  — fading in locally over enemyFade.inSeconds.
    //   active    — chasing the rig; can be hit.
    //   hiding    — briefly invisible after a non-lethal hit; auto-relocates
    //               and returns to active after health.hideSeconds.
    //   dying     — fading out locally over enemyFade.outSeconds after a
    //               lethal hit. Goes to "gone" when the fade completes.
    //   gone      — animation done; the orchestrator should remove this
    //               enemy from its array and re-arm the linked trigger.
    lifecycle: "idle",
    fadeInElapsed: 0,
    fadeOutElapsed: 0,
    hidingElapsed: 0,
  };

  state.group.name = "combat-enemy-group";
  state.group.visible = false;

  // ============================================================
  // CONSTRUCTORS
  // ============================================================

  function buildHitbox() {
    /*
      Visible contact cylinder shown at 15% opacity (requirement #7).
      Local position because the hitbox is parented to the enemy group; the
      group's position is the feet-on-floor anchor.
    */
    const geom = new THREE.CylinderGeometry(
      config.enemy.hitboxRadius,
      config.enemy.hitboxRadius,
      config.enemy.hitboxHeight,
      32,
    );
    const mat = new THREE.MeshBasicMaterial({
      color: config.enemy.hitboxColor,
      transparent: true,
      opacity: config.enemy.hitboxOpacity,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    const cyl = new THREE.Mesh(geom, mat);
    cyl.name = "combat-enemy-hitbox";
    cyl.position.set(0, config.enemy.hitboxHeight / 2, 0);
    cyl.renderOrder = 4;
    return cyl;
  }

  function buildHealthBar() {
    /*
      Two-plane health bar parented to the enemy group so it tracks during
      evasion. Background is a fixed-width black plane; fill is a colored
      plane scaled on X by percent (and X-shifted left so the left edge stays
      pinned, which reads more naturally than center-shrinking).
    */
    const group = new THREE.Group();
    group.name = "combat-enemy-healthbar";
    group.position.set(0, config.health.yOffset, 0.08);

    const background = new THREE.Mesh(
      new THREE.PlaneGeometry(
        config.health.barWidth,
        config.health.barHeight,
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
        config.health.barWidth,
        config.health.barHeight * 0.62,
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
    state.healthFill = fill;
    return group;
  }

  // Build the children now so the group can be added to the scene immediately.
  state.hitbox = buildHitbox();
  state.hitbox.visible = false;
  state.group.add(state.hitbox);

  state.healthBar = buildHealthBar();
  state.healthBar.visible = false;
  state.group.add(state.healthBar);

  scene.add(state.group);

  // ============================================================
  // INTERNAL HELPERS
  // ============================================================

  function getEvasionProfile() {
    return (
      config.evasion.profiles[state.evasionTier] ||
      config.evasion.profiles.MODERATE
    );
  }

  function updateHealthBar() {
    if (!state.healthFill || !state.maxHp) {
      return;
    }
    const percent = THREE.MathUtils.clamp(state.hp / state.maxHp, 0, 1);
    const fullWidth = config.health.barWidth;

    state.healthFill.scale.x = Math.max(percent, 0.001);
    state.healthFill.position.x = -fullWidth * 0.5 * (1 - percent);

    if (percent > 0.55) {
      state.healthFill.material.color.set("#43d7c4");
    } else if (percent > 0.25) {
      state.healthFill.material.color.set("#f7f0df");
    } else {
      state.healthFill.material.color.set("#ff6b6b");
    }
  }

  function setOpacity(value) {
    /*
      Writes alpha to every mesh material in the enemy group AND the hitbox.

      Storing currentOpacity here means a GLB that finishes loading AFTER a
      fade has already moved past zero can apply the right alpha immediately
      (see loadGlbIfNeeded's callback). Previously combat_updated.js had a
      getCurrentEnemyOpacity() helper that recomputed this from the phase
      machine; storing it eliminates that coupling.
    */
    state.currentOpacity = value;
    state.group.traverse((node) => {
      if (node === state.hitbox) return;
      if (node.isMesh && node.material) {
        const mats = Array.isArray(node.material)
          ? node.material
          : [node.material];
        mats.forEach((m) => {
          m.opacity = value;
        });
      }
    });
    // Hitbox uses its configured peak opacity scaled by the fade ratio so it
    // doesn't pop in at full strength.
    if (state.hitbox && state.hitbox.material) {
      state.hitbox.material.opacity = config.enemy.hitboxOpacity * value;
    }
  }

  function normalize(root) {
    /*
      Fits enemy.glb into the Empyrean playing field.

      GLB files arrive in whatever units/origin the modeling tool used. We
      want:
        - the enemy group's position.y = ground level
        - the model's lowest vertex sitting on local Y=0
        - the model centered on local X/Z so the hitbox cylinder wraps it
    */
    root.updateMatrixWorld(true);
    const originalBox = new THREE.Box3().setFromObject(root);
    const originalSize = originalBox.getSize(new THREE.Vector3());
    const originalHeight = Math.max(originalSize.y, 0.0001);
    const fitScale = config.enemy.targetHeight / originalHeight;
    const finalScale = fitScale * config.enemy.scale;

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
    console.info("[enemy] enemy.glb normalized.", {
      originalHeight: Number(originalHeight.toFixed(3)),
      finalHeight: Number(finalSize.y.toFixed(3)),
      finalScale: Number(finalScale.toFixed(4)),
    });
  }

  function loadGlbIfNeeded() {
    /*
      Lazy-load: we don't fetch the GLB until the enemy is first spawned.
      That keeps page load time identical for non-combat play.

      Once loaded, the materials are forced transparent so the same opacity
      driver works for both fade-in and fade-out.
    */
    if (state.glbLoadStarted) return;
    state.glbLoadStarted = true;

    const loader = new GLTFLoader();
    loader.load(
      modelPath,
      (gltf) => {
        const root = gltf.scene;
        normalize(root);
        root.traverse((node) => {
          if (node.isMesh && node.material) {
            const mats = Array.isArray(node.material)
              ? node.material
              : [node.material];
            mats.forEach((m) => {
              m.transparent = true;
              m.depthWrite = true; // depth still writes so the mesh reads solid
              m.opacity = 0;
            });
          }
        });
        state.group.add(root);
        // Match whatever opacity the fade has reached while we were loading.
        setOpacity(state.currentOpacity);
        console.info("[enemy] enemy.glb loaded.");
      },
      undefined,
      (error) => {
        console.error("[enemy] failed to load enemy.glb:", error);
      },
    );
  }

  function lerpAngle(current, target, t) {
    /*
      Interpolates radians along the shortest turn.

      A plain numeric lerp can spin almost a full circle when one angle is
      just below -PI and the other just above +PI. atan2(sin, cos) wraps the
      difference into the -PI..PI range first, so the enemy turns the short
      way around.
    */
    const wrappedDelta = Math.atan2(
      Math.sin(target - current),
      Math.cos(target - current),
    );
    return current + wrappedDelta * t;
  }

  function updateEvasion(delta, rigX, rigZ) {
    /*
      Moves the enemy group (model + hitbox + health bar all together).

      Steering pieces:
        playerPressure = 1 - clamp(distanceToPlayer / evadeStartDistance)
        away           = normalize(enemy - player)
        tangent        = perpendicular(away) * sin(localElapsed * jukeFreq)
        homePull       = normalize(anchor - enemy) when near/outside leash

      The enemy is intentionally slower than the rig, so evasion creates a
      chase but does not make the encounter unwinnable.
    */
    const profile = getEvasionProfile();
    const position = state.group.position;
    const toEnemy = new THREE.Vector2(position.x - rigX, position.z - rigZ);
    const distanceToPlayer = Math.max(toEnemy.length(), 0.0001);
    const playerPressure = THREE.MathUtils.clamp(
      1 - distanceToPlayer / config.evasion.evadeStartDistance,
      0,
      1,
    );

    const away = toEnemy.divideScalar(distanceToPlayer);
    const tangent = new THREE.Vector2(-away.y, away.x).multiplyScalar(
      Math.sin(state.localElapsed * profile.jukeFrequency) * profile.strafe,
    );
    const home = new THREE.Vector2(
      state.anchor.x - position.x,
      state.anchor.z - position.z,
    );
    const homeDistance = home.length();
    const homeDirection =
      homeDistance > 0.0001 ? home.clone().divideScalar(homeDistance) : home;
    const leashPressure = THREE.MathUtils.clamp(
      (homeDistance - config.evasion.leashRadius * 0.68) /
        (config.evasion.leashRadius * 0.32),
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
      nextX - state.anchor.x,
      nextZ - state.anchor.z,
    );

    if (nextFromAnchor.length() > config.evasion.leashRadius) {
      nextFromAnchor.setLength(config.evasion.leashRadius);
      position.x = state.anchor.x + nextFromAnchor.x;
      position.z = state.anchor.z + nextFromAnchor.y;
    } else {
      position.x = nextX;
      position.z = nextZ;
    }

    position.y = config.enemy.groundY;
  }

  function faceTowardRig(rigX, rigZ, delta) {
    /*
      Keeps the enemy visually aware of the player. Three.js Y rotation turns
      around the vertical axis; atan2 gives the floor-plane angle from the
      enemy toward the rig.
    */
    const dx = rigX - state.group.position.x;
    const dz = rigZ - state.group.position.z;
    if (dx * dx + dz * dz <= 0.0001) {
      return;
    }
    const targetYaw = Math.atan2(dx, dz) + config.enemy.modelYawOffset;
    const t = 1 - Math.pow(0.001, delta * 2.2);
    state.group.rotation.y = lerpAngle(state.group.rotation.y, targetYaw, t);
  }

  // ============================================================
  // PUBLIC API
  // ============================================================
  return {
    /*
      group is exposed read-only-by-convention. combat_updated.js uses it for
      the rigging-visibility snapshot. Do not mutate visibility on it directly
      — call show()/hide() so the hitbox and health bar stay in sync.
    */
    group: state.group,

    spawnAt({ x, z, rigYaw }) {
      /*
        Position the enemy group at (x, groundY, z) and face it back toward
        the player using rigYaw (rig's facing at trigger time). Resets HP
        from the current difficulty config so a fresh encounter always
        starts at full health. Starts fade-in opacity at 0; tick() handles
        the ramp via the local fadeInElapsed clock.

        Kicks the GLB load if it hasn't started yet — first spawn pays the
        fetch cost, subsequent spawns are instant.
      */
      state.group.position.set(x, config.enemy.groundY, z);
      state.group.rotation.y =
        rigYaw + Math.PI + config.enemy.modelYawOffset;
      state.anchor.copy(state.group.position);
      state.hitbox.position.set(0, config.enemy.hitboxHeight / 2, 0);

      state.maxHp =
        config.health.hitPointsByDifficulty[config.health.difficulty] ||
        config.health.hitPointsByDifficulty.EASY;
      state.hp = state.maxHp;
      updateHealthBar();

      setOpacity(0);
      state.group.visible = true;
      state.hitbox.visible = true;
      state.healthBar.visible = true;

      // Reset all lifecycle clocks and enter the spawning state. tick() will
      // ramp opacity up over enemyFade.inSeconds and flip to "active" when
      // the local clock completes.
      state.lifecycle = "spawning";
      state.fadeInElapsed = 0;
      state.fadeOutElapsed = 0;
      state.hidingElapsed = 0;
      state.localElapsed = 0;

      loadGlbIfNeeded();
    },

    startHiding() {
      /*
        Called by the orchestrator after a non-lethal sword hit. The enemy
        becomes invisible immediately; tick() will advance the hidingElapsed
        clock and call relocate() + return to "active" after hideSeconds.
      */
      if (state.lifecycle !== "active") return;
      state.lifecycle = "hiding";
      state.hidingElapsed = 0;
      state.group.visible = false;
      state.hitbox.visible = false;
      state.healthBar.visible = false;
    },

    startDying() {
      /*
        Called by the orchestrator after a lethal sword hit. Switches the
        enemy to the dying state; tick() will fade opacity to 0 over
        enemyFade.outSeconds and then flip the lifecycle to "gone" so the
        orchestrator can remove it from the array.
      */
      if (state.lifecycle === "dying" || state.lifecycle === "gone") return;
      state.lifecycle = "dying";
      state.fadeOutElapsed = 0;
      // The enemy stays visible during the fade — visibility flips off when
      // the fade completes inside tick().
      state.group.visible = true;
      state.hitbox.visible = true;
      state.healthBar.visible = true;
    },

    getState() {
      return state.lifecycle;
    },

    tick(delta, rigX, rigZ, { movement = true } = {}) {
      /*
        Single per-frame entry point for the orchestrator. Handles the local
        state machine; only does evasion movement when in "active" AND the
        caller passed movement=true (so the orchestrator can freeze enemies
        during the visible d20 roll without skipping fade-in advancement).
      */
      state.localElapsed += delta;

      if (state.lifecycle === "spawning") {
        state.fadeInElapsed += delta;
        const fadeInSeconds = Math.max(
          config.enemyFade?.inSeconds || 0.01,
          0.01,
        );
        const progress = THREE.MathUtils.clamp(
          state.fadeInElapsed / fadeInSeconds,
          0,
          1,
        );
        setOpacity(progress);
        if (progress >= 1) {
          state.lifecycle = "active";
          state.localElapsed = 0; // restart juke phase at active entry
        }
        return state.lifecycle;
      }

      if (state.lifecycle === "active") {
        if (movement) {
          updateEvasion(delta, rigX, rigZ);
          faceTowardRig(rigX, rigZ, delta);
        }
        return state.lifecycle;
      }

      if (state.lifecycle === "hiding") {
        state.hidingElapsed += delta;
        if (state.hidingElapsed >= config.health.hideSeconds) {
          // Reuse the existing relocate() math by inlining it here. We need
          // to keep relocate() exposed for backward compatibility, but tick()
          // owns the auto-transition now.
          const anchor = state.anchor;
          const away = new THREE.Vector2(anchor.x - rigX, anchor.z - rigZ);
          if (away.lengthSq() <= 0.0001) {
            away.set(1, 0);
          } else {
            away.normalize();
          }
          const sideSign = state.hp % 2 === 0 ? 1 : -1;
          const side = new THREE.Vector2(-away.y, away.x).multiplyScalar(
            0.42 * sideSign,
          );
          const direction = away.add(side).normalize();
          const radius = config.evasion.leashRadius * 0.82;
          state.group.position.set(
            anchor.x + direction.x * radius,
            config.enemy.groundY,
            anchor.z + direction.y * radius,
          );

          state.group.visible = true;
          state.hitbox.visible = true;
          state.healthBar.visible = true;
          setOpacity(1);
          state.lifecycle = "active";
          state.localElapsed = 0;
          state.hidingElapsed = 0;
        }
        return state.lifecycle;
      }

      if (state.lifecycle === "dying") {
        state.fadeOutElapsed += delta;
        const fadeOutSeconds = Math.max(
          config.enemyFade?.outSeconds || 0.01,
          0.01,
        );
        const progress = THREE.MathUtils.clamp(
          state.fadeOutElapsed / fadeOutSeconds,
          0,
          1,
        );
        setOpacity(1 - progress);
        if (progress >= 1) {
          state.lifecycle = "gone";
          state.group.visible = false;
          state.hitbox.visible = false;
          state.healthBar.visible = false;
        }
        return state.lifecycle;
      }

      // "idle" and "gone" — nothing to do.
      return state.lifecycle;
    },

    /*
      Visibility helpers. show/hide toggle all three (group, hitbox,
      health bar) together because they always move as a unit in the current
      design.
    */
    show() {
      state.group.visible = true;
      state.hitbox.visible = true;
      state.healthBar.visible = true;
    },
    hide() {
      state.group.visible = false;
      state.hitbox.visible = false;
      state.healthBar.visible = false;
    },
    isVisible() {
      return state.group.visible;
    },

    setOpacity,

    applySwordHit() {
      /*
        Subtract one HP. Returns enough information for the caller to decide
        whether to transition to "hiding" (non-lethal) or "ending" (defeated).
      */
      state.hp = Math.max(0, state.hp - 1);
      updateHealthBar();
      return {
        remainingHp: state.hp,
        maxHp: state.maxHp,
        defeated: state.hp <= 0,
      };
    },

    testSwordHit({ x, z, yaw, range, arcRadians }) {
      /*
        Pure geometric test — no HP changes. Returns:
          { hit: false, reason: "range" | "arc", distance, dot? }
          { hit: true, distance, dot }

        The caller decides what banner to show and whether to call
        applySwordHit() based on the result.
      */
      const dx = state.group.position.x - x;
      const dz = state.group.position.z - z;
      const distance = Math.hypot(dx, dz);

      if (distance > range) {
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
        return { hit: false, reason: "arc", distance, dot };
      }
      return { hit: true, distance, dot };
    },

    relocate(rigX, rigZ) {
      /*
        After a non-lethal hit, the enemy briefly "runs and hides" to a new
        point on its leash circle, biased away from the player and side-
        stepped slightly so repeated hits don't put it in the same spot.

        Restores visibility and snaps opacity to 1 — the previous code did
        this in the same beat, and we preserve that here.
      */
      const anchor = state.anchor;
      const away = new THREE.Vector2(anchor.x - rigX, anchor.z - rigZ);
      if (away.lengthSq() <= 0.0001) {
        away.set(1, 0);
      } else {
        away.normalize();
      }
      // Alternate the side bias by HP parity so the enemy doesn't pick the
      // exact same spot twice in a row.
      const sideSign = state.hp % 2 === 0 ? 1 : -1;
      const side = new THREE.Vector2(-away.y, away.x).multiplyScalar(
        0.42 * sideSign,
      );
      const direction = away.add(side).normalize();
      const radius = config.evasion.leashRadius * 0.82;
      state.group.position.set(
        anchor.x + direction.x * radius,
        config.enemy.groundY,
        anchor.z + direction.y * radius,
      );

      state.group.visible = true;
      state.hitbox.visible = true;
      state.healthBar.visible = true;
      setOpacity(1);
      state.localElapsed = 0;
    },

    setEvasionTier(tier) {
      state.evasionTier = tier;
    },
    getEvasionTier() {
      return state.evasionTier;
    },

    setMaxHp(value) {
      /*
        Used by setCombatDifficulty when the player flips difficulty during a
        live fight. We clamp HP into the new cap instead of resetting it, so
        the player doesn't get "healed" by switching difficulty mid-swing.
      */
      state.maxHp = value;
      state.hp = THREE.MathUtils.clamp(state.hp, 0, state.maxHp);
      updateHealthBar();
    },
    getHp() {
      return state.hp;
    },
    getMaxHp() {
      return state.maxHp;
    },
    hasHpSet() {
      return state.maxHp > 0;
    },

    getPosition() {
      return {
        x: state.group.position.x,
        y: state.group.position.y,
        z: state.group.position.z,
      };
    },

    getContactRadius() {
      /*
        Factors in the current evasion tier's contactScale so harder tiers
        give the player a smaller capture radius.
      */
      const profile = getEvasionProfile();
      return config.enemy.contactRadius * profile.contactScale;
    },

    getDistanceToRigSquared(rigX, rigZ) {
      const ex = state.group.position.x;
      const ez = state.group.position.z;
      const dx = rigX - ex;
      const dz = rigZ - ez;
      return dx * dx + dz * dz;
    },

    dispose() {
      /*
        Not used in the current single-encounter flow (we deliberately keep
        the GLB resident across encounters for instant restarts). Provided so
        Step 2's "remove a defeated enemy" path has a clean teardown when
        the game eventually wants it.
      */
      scene.remove(state.group);
      state.group.traverse((node) => {
        if (node.isMesh) {
          node.geometry?.dispose();
          if (Array.isArray(node.material)) {
            node.material.forEach((m) => m.dispose());
          } else {
            node.material?.dispose();
          }
        }
      });
    },
  };
}
