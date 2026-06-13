/*
  EMPYREAN ENTITY CONTROLLERS

  A "controller" decides what an entity wants to do each frame. The same
  entity skeleton can be driven by:
    - keyboardController: reads main.js controlState (player)
    - staticController:   no-op, entity stays at spawn pose (NPC/enemy stubs)
    - wanderingController: future, picks random nearby points to walk to
    - patrolController:    future, walks a defined path
    - enemyCombatController: future, approaches and attacks the player

  This module is intentionally minimal in this session. The controller
  INTERFACE is what matters: a function that takes (entity, ctx, delta) and
  mutates entity.state. The actual implementations beyond keyboard + static
  are deferred until Step 3 lands per-entity animation.

  Pure: this module has no Three.js imports. Controllers operate on plain
  data fields of the entity (yaw, position, walkPhase, leftArm, rightArm).
  Anything that needs a Three.js object goes through the entity reference.
*/

export const ControllerType = {
  KEYBOARD: "keyboard",
  STATIC: "static",
  // Future:
  WANDER: "wander",
  PATROL: "patrol",
  ENEMY_COMBAT: "enemy-combat",
};

export function createKeyboardController(sharedControlState) {
  /*
    Placeholder for the player controller.

    Reason this is a stub: main.js already has the full keyboard input
    pipeline driving the global controlState. The player entity points at
    that same controlState. So "the keyboard controller" is conceptually
    "whatever main.js already does," and we don't need to reimplement it
    here yet.

    When Step 4 unifies the update loop, this controller will read the
    keyboard events and write to entity.state, replacing the global
    controlState path. For now it's an identity passthrough so the entity
    layer has a controller field to point at.
  */
  return {
    type: ControllerType.KEYBOARD,
    sharedControlState,
    update(/* entity, ctx, delta */) {
      // No-op: main.js's existing animate() and updateKeyboardMotion() still
      // drive the player. This controller exists so the entity has a typed
      // controller field; behavior follows in Step 4.
    },
  };
}

export function createStaticController() {
  /*
    Used for spawned NPCs and enemies in this session.

    "Static" means the entity does not move or pose change on its own. Its
    skeleton is at the bind/reference pose from its rigTuning. Position and
    yaw are whatever the spawn call set; the controller never changes them.

    Visible result with no skin: the entity shows as a small skeleton in the
    world (joints + debug lines). Once Step 2.5 binds meshes and Step 3
    animates, this controller becomes the "idle stance" baseline that fancier
    controllers extend.
  */
  return {
    type: ControllerType.STATIC,
    update(/* entity, ctx, delta */) {
      // No-op by design.
    },
  };
}

export function runController(controller, entity, ctx, delta) {
  /*
    Single dispatch point. Called by the future per-entity update loop in
    Step 3. Right now nothing calls it because no controllers are running
    yet; it lives here so the dispatch point is named.
  */
  if (!controller || typeof controller.update !== "function") {
    return;
  }
  controller.update(entity, ctx, delta);
}
