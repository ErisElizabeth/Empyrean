/*
  EMPYREAN ENTITY MODULE

  This is the first concrete decoupling of "the puppet rig" from "the player."

  Conceptual shift:
    Before this module existed, Empyrean had ONE skeleton (state.skeleton)
    that was simultaneously:
      - the gameplay player
      - the dev rigging target
      - the visible puppet
    Anything that wanted to add NPCs or enemies had to share that one skeleton
    with the player, which is impossible.

    With this module, an "Entity" is a self-contained object that owns:
      - its own skeleton hierarchy
      - its own optional skinned mesh
      - its own per-instance state (position, yaw, animation phase, etc.)
      - its own rigTuning data (a clone, not a shared reference)
      - a "role" (player, npc, enemy, workshop-scratch)
      - a "controller" reference (keyboard for player, AI for NPC/enemy, etc.)

    The puppet workshop in main.js is still the GUI/sliders/save-load tool, but
    it conceptually edits ONE designated entity (default: the player). Future
    work can let the workshop point at any entity.

  What this module does NOT do (intentional scope limits for this session):
    - per-entity animation. updateEntity is a stub.
    - mesh skinning for non-player entities. NPCs/enemies spawn as skeleton-
      only debug visuals for now. skin.js requires a small refactor before it
      can rig meshes onto non-player skeletons; that lands in Step 2.5.
    - AI controllers. createStaticController in entityControllers.js just
      keeps the entity in place. Wander/patrol/combat scripts come in Step 3+.

  Dependency injection:
    Entity creation needs main.js helpers (createSkeleton, applyJointOffsets,
    applyBindRotations) and skin.js helpers (mesh binding). Rather than
    importing them and creating circular dependencies, main.js binds them
    once at startup via createEntityFactories({...}) which returns spawnNPC
    and spawnEnemy functions with all dependencies pre-wired.

  Pure: this module imports THREE only. It does not touch main.js, rig.js,
  or skin.js directly.
*/

import * as THREE from "three";

export const EntityRole = {
  PLAYER: "player",
  NPC: "npc",
  ENEMY: "enemy",
  WORKSHOP_SCRATCH: "workshop-scratch",
};

let _entityCounter = 0;
function nextEntityId(role) {
  _entityCounter += 1;
  return `${role}-${_entityCounter}`;
}

export function createPlayerEntity({
  skeleton,
  skin = null,
  controlState,
  rigTuning,
}) {
  /*
    Wraps the existing player runtime as an Entity. Step 1.

    Does NOT create a new skeleton or skin. The skeleton, skin, and state
    references are passed in — this entity is just a named pointer to the
    same objects main.js has been using all along.

    This means none of the 470+ existing reference sites (state.skeleton.*,
    controlState.*) need to be touched. The Entity layer is purely additive
    until a later session does the rename.

    rigTuning is shared by reference for the player, because the workshop GUI
    edits the same object live. When the workshop later switches edit targets,
    that object will become a per-entity clone — not yet.
  */
  return {
    id: nextEntityId(EntityRole.PLAYER),
    role: EntityRole.PLAYER,
    skeleton,
    skin,
    state: controlState,
    rigTuning,
    controller: "keyboard",
    /*
      meta.workshopTarget marks this entity as the one the GUI currently edits.
      Future "edit target switcher" will move this flag between entities.
    */
    meta: { workshopTarget: true },
  };
}

export function createEntityFactories({
  scene,
  createSkeleton,
  applyJointPointOffsetsTo,
  applyBindRotationOffsetsTo,
  bindRiggedSkinFromPath,
  updateIdleMotionTo,
  syncSkinToSkeleton,
}) {
  /*
    Returns spawnNPC and spawnEnemy functions with main.js dependencies bound.

    Why dependency injection instead of import:
      createSkeleton, applyJointPointOffsetsTo, and applyBindRotationOffsetsTo
      live in main.js. Importing main.js from entity.js would create a circular
      dependency (main.js imports entity.js to build the player). Passing them
      as a one-time setup call avoids that.

    Each factory builds:
      1. A fresh THREE.Group root skeleton hierarchy from the package's
         dimensions.
      2. Joint point offsets applied from the package's rigTuning.
      3. Bind rotation offsets applied from the package's rigTuning.
      4. NO skin yet (Step 2.5 will rig meshes onto these skeletons).
      5. Position + yaw set on the skeleton root.
      6. Added to scene.

    Returns an Entity descriptor with role + controller + skeleton reference.
  */

  async function spawnEntityFromPackage({
    rigPackage,
    role,
    position = { x: 0, y: 0, z: 0 },
    yaw = 0,
  }) {
    /*
      Async because mesh loading via GLTFLoader is async. The skeleton is
      built and added to the scene synchronously so the caller has a usable
      entity reference immediately; the mesh attaches when the GLB resolves.
      If no mesh path is present in the package, the entity is skeleton-only
      (same behavior as Step 2 stub).
    */
    if (!rigPackage || !rigPackage.rigTuning) {
      throw new Error(
        "[entity] spawn requires a rig package with a rigTuning field",
      );
    }

    const tuning = rigPackage.rigTuning;

    // 1. Skeleton hierarchy from dimensions (passes the same field names
    //    main.js's buildSkeletonWorkshop uses).
    const skeleton = createSkeleton({
      headY: tuning.headY,
      neckY: tuning.neckY,
      chestY: tuning.chestY,
      torsoY: tuning.torsoY,
      pelvisY: tuning.pelvisY,
      shoulderX: tuning.shoulderX,
      hipX: tuning.hipX,
      upperArmLength: tuning.upperArmLength,
      forearmLength: tuning.forearmLength,
      thighLength: tuning.thighLength,
      shinLength: tuning.shinLength,
    });

    // 2 + 3. Calibration data.
    applyJointPointOffsetsTo(skeleton, tuning);
    applyBindRotationOffsetsTo(skeleton, tuning);

    // 4. Place in the world. skeleton.root must be positioned BEFORE mesh
    //    binding so the bind matrices capture the right relationship between
    //    bones and the skinned mesh's coordinate space.
    skeleton.root.position.set(position.x, position.y, position.z);
    skeleton.root.rotation.y = yaw;
    skeleton.root.name = `entity-${role}-skeleton`;
    skeleton.root.userData.entityRole = role;
    scene.add(skeleton.root);
    skeleton.root.updateMatrixWorld(true);

    const perEntityTuning = JSON.parse(JSON.stringify(tuning));

    const entity = {
      id: nextEntityId(role),
      role,
      skeleton,
      skin: null,
      state: createDefaultEntityState(position, yaw),
      rigTuning: perEntityTuning,
      controller: role === EntityRole.ENEMY ? "enemy-static" : "npc-static",
      meta: { workshopTarget: false, packageId: rigPackage.metadata?.id },
    };

    // 5. Mesh binding if the package references a mesh.
    const meshPath =
      rigPackage.importedMesh?.path || perEntityTuning.importedMeshPath;
    if (meshPath && typeof bindRiggedSkinFromPath === "function") {
      try {
        const skin = await bindRiggedSkinFromPath(
          skeleton,
          perEntityTuning,
          meshPath,
        );
        skeleton.root.add(skin.group);
        entity.skin = skin;
      } catch (error) {
        console.warn(
          `[entity] mesh bind failed for ${entity.id} (${meshPath}):`,
          error,
        );
        // Entity still exists, just skeleton-only.
      }
    }

    return entity;
  }

  function spawnNPC({ rigPackage, position, yaw }) {
    return spawnEntityFromPackage({
      rigPackage,
      role: EntityRole.NPC,
      position,
      yaw,
    });
  }

  function spawnEnemy({ rigPackage, position, yaw }) {
    return spawnEntityFromPackage({
      rigPackage,
      role: EntityRole.ENEMY,
      position,
      yaw,
    });
  }

  function update(entity, delta, elapsed) {
    /*
      Per-frame update for a single non-player entity. Step 3a scope:
        - idle motion (breathing + head drift) if entity.rigTuning.idleMotion
        - sync skin bones to skeleton joints so the mesh deforms

      Player entities are skipped: main.js's existing updateSkeleton +
      syncImportedSkinToPuppet path still drives the player. Routing the
      player through here too would double-apply idle motion.

      What this does NOT do (deferred to Step 3b+):
        - walk/run pose
        - leg relaxation
        - controlled arm poses (up/down/half/wave/swing)
        - combat stance
        - jump physics
        - skeleton root sync from controlState (NPCs have their own state)
    */
    if (!entity || entity.role === EntityRole.PLAYER) {
      return;
    }
    if (!entity.skeleton) {
      return;
    }
    if (entity.rigTuning?.idleMotion && typeof updateIdleMotionTo === "function") {
      updateIdleMotionTo(entity.skeleton, entity.rigTuning, delta, elapsed);
    }
    if (entity.skin && typeof syncSkinToSkeleton === "function") {
      syncSkinToSkeleton(entity.skin, entity.skeleton);
    }
  }

  return { spawnNPC, spawnEnemy, update };
}

function createDefaultEntityState(position, yaw) {
  /*
    Per-entity gameplay state. Modeled after the parts of main.js's
    controlState that any animated entity will need eventually. Most fields
    are placeholders for Step 3 when per-entity animation lands.

    Player entity keeps using main.js's controlState directly (see
    createPlayerEntity above). This default state is for non-player entities.
  */
  return {
    position: new THREE.Vector3(position.x, position.y, position.z),
    yaw,
    walkPhase: 0,
    isWalking: false,
    isRunning: false,
    runBlendWeight: 0,
    turnVelocity: 0,
    leftArm: "down",
    rightArm: "down",
    weaponEquipped: false,
  };
}

export function disposeEntity(entity, scene) {
  /*
    Removes an entity from the scene and lets its skeleton be garbage
    collected. Does not dispose materials/geometry (those are usually shared
    via the rig's mesh asset cache).
  */
  if (!entity?.skeleton?.root) {
    return;
  }
  scene.remove(entity.skeleton.root);
  entity.skeleton = null;
  entity.skin = null;
}

/*
  Per-entity update used to live as a top-level stub. It is now the `update`
  method returned by createEntityFactories({...}), because the update needs
  dependency-injected animation helpers (updateIdleMotionTo, syncSkinToSkeleton)
  that live in main.js / skin.js. Calling the factory's update from the animate
  loop is the supported entry point.

  Out of scope this step (deferred to Step 3b+): walk/run, combat, jump, arm
  poses. Currently the update runs idle motion and skin sync only.
*/
