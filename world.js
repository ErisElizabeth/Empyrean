/*
  EMPYREAN WORLD MODULE

  Owns:
    - World geometry (rooms, trees, outside enclosure)
    - World atmosphere palettes (scene background, fog, outside colors, lights)
    - Sky moon focal object
    - Ghost sphere setup and motion
    - Scene lighting
    - Collision data (worldCollision) and collision resolution
    - Encounter runtime and trigger system
    - World debug overlay
    - Shared utilities: disposeObjectTree, makeLabelSprite

  Import rule:
    This module imports Three.js and the official GLTFLoader for static world
    props such as torch.glb. It does not import from main.js, rig.js, physics.js,
    or encounters.js. Call sites in main.js pass runtime values
    (encounterRuntime, playerRadius, sceneRefs) as parameters instead.
*/

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

// =============================================================
// WORLD TWEAK ZONE
// =============================================================
/*
  World-specific tuning that previously lived in main.js SOLO_TWEAKS.
  Player speed and camera stay in main.js. Audio is routed through
  audioManager.js and passed in as a scene reference for encounter actions.
*/

const WORLD_TWEAKS = {
  atmosphere: {
    /*
      World atmosphere palettes.

      This stays in world.js for now so sky, fog, outside enclosure color, and
      world lighting do not split across CSS, main.js, and world.js.

      Future day/night/weather path:
        - add palettes such as day, overcast, raining, sunny, foggy
        - interpolate between palette values over time
        - keep main.js responsible only for deciding *when* the world changes
        - keep world.js responsible for *what colors/lights that means*

      Current palette:
        "night" is the existing Empyrean look, just gathered into one place.
    */
    defaultPalette: "night",
    /*
      Early day/night sky modes.

      These are deliberately smaller than full atmosphere palettes. They control
      only the things that must change when the player taps `G` right now:

        - visible sky / renderer clear color
        - fog color/density
        - hemisphere fill color/intensity
        - directional sun visibility/intensity
        - central accent PointLight visibility/intensity

      They do NOT change grass/floor color, room material opacity, torch
      behavior, moon tuning, or audio. The outside wall/ceiling shell is allowed
      to change because it is currently acting as the visible sky shell.
    */
    skyModes: {
      night: {
        /*
          Night sky color.

          This intentionally matches outsideShellColor below. The outside
          enclosure is still a real mesh, while scene.background is the infinite
          clear color behind it. If those two colors differ, camera angles can
          show a visible black-to-purple boundary where the background peeks
          around the shell. Matching them makes the night sky read as one field.
        */
        skyColor: "#131862",
        fogColor: "#131862",
        fogDensity: 0.018,
        outsideShellColor: "#131862",
        outsideShellOpacity: 1,
        hemisphereSkyColor: "#91aa91",
        hemisphereGroundColor: "#a41a1a",
        hemisphereIntensity: 0.12,
        sunLightColor: "#FFF9D2",
        sunLightIntensity: 0,
        localAccentColor: "#639464",
        localAccentIntensity: 0.35,
      },
      day: {
        /*
          Desaturated day pass.

          Source color was #C9EBFF. For the harsher, less cheerful
          "apocalyptic daylight" look, this color was converted to HSL and its
          saturation was multiplied by 0.8:

            #C9EBFF -> HSL saturation 100% -> 80% -> #CEEAFA

          Same lightness, same general hue, less clean postcard-blue.
        */
        skyColor: "#CEEAFA",
        /*
          The old night fog is very dark. Keeping that fog during a bright sky
          test makes unlit surfaces look muddy blue/gray and exaggerates any
          remaining local light patches. Day mode uses a pale, low-density fog
          so the sky switch is not fighting the night atmosphere.
        */
        fogColor: "#CEEAFA",
        fogDensity: 0,
        /*
          The outside "ceiling/walls" are the visible sky shell for this rough
          draft enclosure. They need to read as the sky color directly, not as
          a semi-transparent blue material blended over the sky background.
        */
        outsideShellColor: "#CEEAFA",
        outsideShellOpacity: 1,
        /*
          Day fill is intentionally brighter than night fill.

          DirectionalLight gives the sun a direction and a highlight. It still
          cannot brighten every surface normal at once, especially the underside
          of ceilings. HemisphereLight is the broad, non-fussy fill that keeps
          ceilings and non-facing walls readable.
        */
        hemisphereSkyColor: "#CEEAFA",
        hemisphereGroundColor: "#DBE5CB",
        hemisphereIntensity: 0.62,
        sunLightColor: "#FBF6D6",
        sunLightIntensity: 1.15,
        /*
          Diagnostic lighting isolation:

          central-green-accent-light is a nearby PointLight. A PointLight has a
          finite distance and decay, so it can create exactly the shrinking,
          player-near bright patch we are trying to identify. Day mode disables
          it first while leaving room torches alone for the next diagnostic step
          if needed.
        */
        localAccentColor: "#639464",
        localAccentIntensity: 0,
      },
    },
    palettes: {
      night: {
        sceneBackground: "#131862",
        fogColor: "#131862",
        fogDensity: 0.018,
        rendererClearColor: "#131862",
        rendererClearAlpha: 1,
        outsideWallColor: "#131862",
        outsideFloorColor: "#7BB369",
        hemisphereSkyColor: "#91aa91",
        hemisphereGroundColor: "#a41a1a",
        hemisphereIntensity: 0.12,
        moonLightColor: "#d2f5d2",
        moonLightIntensity: 2.18,
        moonPointLightIntensity: 20.25,
        localAccentColor: "#639464",
        localAccentIntensity: 0.35,
      },
    },
  },
  skyMoon: {
    /*
      Replaces the old procedural planet sphere with moon.glb.

      These values preserve the current visual behavior exactly. The sky object
      is a world/environment prop now, so the config lives beside trees, torches,
      rooms, and ghost spheres instead of in main.js.
    */
    assetPath: "assets/moon.glb",
    targetDiameter: 15,
    position: [0, 7.5, 30],
    fallbackColor: 0x7a7979,
    /*
      Visual moon shell/glow.

      This is separate from actual scene lighting. The moon mesh should read as
      luminous on screen even before considering the DirectionalLight it anchors.

      The visible GLB keeps its surface detail as a mostly opaque shell. A
      slightly smaller self-lit sphere sits inside that shell and creates the
      glow. This avoids the "ping pong ball" look caused by making every GLB
      surface fully emissive.
    */
    surfaceOpacity: 0.9,
    innerGlowDiameter: 14.75,
    innerGlowOpacity: 0.46,
  },
  lighting: {
    /*
      Moonlit outside lighting.

      These are still Three.js scene-light intensities, not true photometric lux.
      Direction/fixture values for the moonlight rig.

      Color and intensity values now live in WORLD_TWEAKS.atmosphere.palettes
      because those need to change together during future day/night/weather
      transitions.

      Future day/night cycle note:
        The moon directional light is tied to skyMoon's world position in
        syncMoonLights(). If a future sky cycle moves the moon group
        across the sky, the light source direction follows automatically.
    */
    moonLightTarget: [0, 7.5, 7.5],
    /*
      Visual moon-shell point light.

      This is not the directional "world moonlight." It is a local helper light
      used to make the visible moon shell read consistently from the dark,
      church-facing side.

      It is still derived from the visible skyMoon group:

        base position = skyMoon.getWorldPosition()
        bias direction = moonLightTarget - base position
        final position = base position + bias direction * offsetTowardTarget

      Why the bias exists:
        A PointLight exactly at the center of a sphere mostly lights the
        inward-facing surface. The small target-facing offset places it just in
        front of the moon shell, aimed toward the playable/church side, without
        creating an independent moon position that can drift away.
    */
    moonPointLightDistance: 0,
    moonPointLightDecay: 1.6,
    moonPointLightOffsetTowardTarget: 0,
    /*
      Daylight fixture.

      The sun is intentionally diagonal, not directly above the world.

      A straight-down light at [0, 36, 0] would light floors well, but it would
      not light the visible underside of ceilings because their normals face
      downward. A diagonal source creates directionality, while the day
      HemisphereLight fill handles ceilings and non-facing walls.
    */
    sunLightPosition: [40, 36, 30],
    sunLightTarget: [0, 0, 0],
    localAccentDistance: 6.5,
    localAccentPosition: [0, 2.5, 2.2],
  },
  world: {
    roomSize: 24,
    wallThickness: 0.1,
    roomWallOpacity: 0.8,
    roomFloorOpacity: 0.95,
    roomCeilingOpacity: 0.8,
    doorWidth: 4.4,
    doorHeight: 5.1,
    /*
      Outside enclosure scale.

      The church shell made the old outside box feel too close to the building,
      so the outside world now uses the gameplay/CAD fixture zero as its center:

        outsideCenterX = 0
        outsideCenterZ = 0

      Horizontal expansion:
        old outsideSize = 96
        new outsideSize = 96 * 4 = 384

      Vertical expansion:
        old outside wall height = roomSize = 24
        new outsideHeight = 24 * 1.5 = 36

      This changes only the outside floor/walls/ceiling, movement bounds, debug
      outside-bounds overlay, and ghost-sphere spawn range. It does not scale or
      move the rooms or church shell, so the matched church door stays matched.
    */
    outsideSize: 384,
    outsideHeight: 36,
    outsideCenterX: 0,
    outsideCenterZ: 0,
  },
  churchShell: {
    /*
      churchRough.glb is the authored architectural wrapper for the four-room
      block.

      Tinkercad exports millimeters as meters inside GLB files. The raw mesh
      dimensions inspect as roughly 0.048 x 0.048 x 0.050, even though the model
      was built from the room-block millimeter dimensions. Scaling by 1000 makes:

        0.04882 exported units * 1000 = 48.82 Empyrean scene units

      That puts the shell in the same unit language as roomSize = 24.

      Do not normalize or center this asset here. The model origin was authored
      deliberately so CAD X0/Y0 maps to gameplay X0/Z0. The GLB already contains
      a parent rotation from the Tinkercad exporter that maps:

        model X -> gameplay X
        model Y -> gameplay -Z
        model Z -> gameplay Y

      In other words: load, scale, place at origin. Let the model's own fixture
      zero do the alignment work.
    */
    assetPath: "assets/churchRough.glb",
    sceneUnitScale: 1000,
    position: [0, 0, 0],
  },
  cave: {
    /*
      cave.glb uses the same Tinkercad export path as churchRough.glb.

      That means:
        - the GLB contains a parent matrix that maps CAD X/Y floor work into
          Three.js X/Z floor work.
        - millimeter dimensions are stored as meter-sized GLB units.
        - a 1000x scale returns the asset to Empyrean scene units.

      Placement:
        The moon was moved to [0, 27, -90]. The cave starts in the same general
        northern area at [20, 0, -90]. Because the authored zero is meaningful,
        this loader does not center or normalize the cave. It uses the model's
        own fixture zero, just like the church shell.

      Collision:
        Rough-draft world building uses simple top-down proxy rectangles instead
        of true triangle mesh collision. These three rectangles approximate the
        cave's back and side rock mass while leaving the south/front side open
        for approach. Future Eris can replace this with better cave-specific
        colliders when the layout is less provisional.
    */
    assetPath: "assets/cave.glb",
    sceneUnitScale: 1000,
    position: [20, 0, -90],
    proxyColliders: [
      { center: [36, -88.5], size: [32, 3] },
      { center: [22, -74], size: [4, 28] },
      { center: [50, -74], size: [4, 28] },
    ],
  },
  roomColors: {
    /*
      Room surfaces are intentionally dull gray. The stone texture provides the
      detail; the color tint keeps the rooms from becoming loud or cartoony.
    */
    wall: 0x8a8a82,
    floor: 0x777871,
    ceiling: 0x74766f,
  },
  roomTextures: {
    floorDiffuse: "assets/stoneFloorDiff.jpg",
    floorDisplacement: "assets/stoneFloorDisp.png",
    wallDiffuse: "assets/stoneWallDiff.jpg",
    wallDisplacement: "assets/StoneWallDisp.png",
  },
  torches: {
    assetPath: "assets/torch.glb",
    perWall: 2,
    height: 1.45,
    wallInset: 0.34,
    heightAboveFloor: 2.85,
    alongOffset: 7.2,
    lightColor: "#ffb06a",
    lightIntensity: 0.42,
    lightDistance: 7.2,
    lightDecay: 2,
  },
  ghostSpheres: {
    count: 170,
    color: "#7f827f",
  },
  worldDebug: {
    wallColor: "#ff5d73",
    treeColor: "#ffd166",
    boundsColor: "#78c7ff",
    encounterColor: "#e0dcdc",
    floorLift: 0.045,
  },
  trees: {
    colliderRadius: 1.15,
    liveAssetPath: "assets/tree.glb",
    deadAssetPath: "assets/deadTree.glb",
    targetHeight: 5.2,
    deadTargetHeight: 5.0,
  },
  landmarks: {
    /*
      Rough-draft outside scatter.

      These are small visual "moving toward something" marks in the expanded
      outside world. The placement is random-looking but deterministic:

        same seed + same kind list + same zones = same world every reload

      That gives the vibe of random world dressing without making screenshots,
      collision debugging, or future tuning shift under your feet.

      Avoidance rules are intentionally conservative:
        - stay away from the church shell
        - stay away from the cave prop
        - stay away from room/cave/tree colliders already registered in
          worldCollision
        - stay away from previously placed landmark colliders

      Non-tree props are normalized to a target height of 1.5 scene units, which
      is the "1.5 px" request translated into Empyrean's current scene-unit
      language. Extra tree props reuse the same heights as the existing trees.
    */
    seed: 77123,
    placementMargin: 14,
    clearance: 5,
    churchAvoidRect: { minX: -56, maxX: 32, minZ: -56, maxZ: 32 },
    caveAvoidRect: { minX: 8, maxX: 66, minZ: -104, maxZ: -44 },
    zones: [
      { center: [12, -112], halfSize: [72, 48] },
      { center: [92, -62], halfSize: [64, 88] },
      { center: [-108, -72], halfSize: [62, 88] },
      { center: [0, 106], halfSize: [112, 56] },
      { center: [-132, 102], halfSize: [42, 54] },
      { center: [136, 104], halfSize: [44, 56] },
    ],
    kinds: [
      "liveTree",
      "rock1",
      "deadTree",
      "rock2",
      "campfire",
      "skull",
      "rock1",
      "liveTree",
      "deadTree",
      "rock2",
      "rock1",
      "campfire",
      "deadTree",
      "rock2",
      "liveTree",
      "skull",
      "rock1",
      "rock2",
      "campfire",
      "deadTree",
      "liveTree",
      "rock1",
      "rock2",
      "skull",
      "deadTree",
      "campfire",
      "rock1",
      "liveTree",
      "rock2",
      "deadTree",
      "rock1",
      "skull",
      "liveTree",
      "rock2",
      "campfire",
      "deadTree",
      "rock1",
      "rock2",
      "liveTree",
      "skull",
      "deadTree",
      "rock1",
    ],
    assets: {
      liveTree: {
        treeKind: "live",
        colliderRadius: 1.15,
      },
      deadTree: {
        treeKind: "dead",
        colliderRadius: 1.15,
      },
      campfire: {
        assetPath: "assets/campfire.glb",
        targetHeight: 1.5,
        colliderRadius: 0.85,
      },
      skull: {
        assetPath: "assets/skull.glb",
        targetHeight: 1.5,
        colliderRadius: 0.65,
      },
      rock1: {
        assetPath: "assets/rock1.glb",
        targetHeight: 1.5,
        colliderRadius: 1.05,
      },
      rock2: {
        assetPath: "assets/rock2.glb",
        targetHeight: 1.5,
        colliderRadius: 0.95,
      },
    },
  },
};

// ---------------------------------------------------------------------------
// INTERNAL CONSTANTS
// ---------------------------------------------------------------------------
const roomSize = WORLD_TWEAKS.world.roomSize;
const wallThickness = WORLD_TWEAKS.world.wallThickness;
const roomWallOpacity = WORLD_TWEAKS.world.roomWallOpacity;
const roomFloorOpacity = WORLD_TWEAKS.world.roomFloorOpacity;
const roomCeilingOpacity = WORLD_TWEAKS.world.roomCeilingOpacity;
const doorWidth = WORLD_TWEAKS.world.doorWidth;
const doorHeight = WORLD_TWEAKS.world.doorHeight;
const outsideSize = WORLD_TWEAKS.world.outsideSize;
const outsideHeight = WORLD_TWEAKS.world.outsideHeight;
const outsideCenter = new THREE.Vector3(
  WORLD_TWEAKS.world.outsideCenterX,
  0,
  WORLD_TWEAKS.world.outsideCenterZ,
);
const treeColliderRadius = WORLD_TWEAKS.trees.colliderRadius;
const GHOST_SPHERE_COLOR = WORLD_TWEAKS.ghostSpheres.color;

export const GUIDE_COLOR = "#e0dcdc";

export function getWorldAtmospherePalette(
  name = WORLD_TWEAKS.atmosphere.defaultPalette,
) {
  /*
    Returns a complete atmosphere palette.

    The fallback keeps future experiments forgiving: if main.js asks for a
    palette that does not exist yet, the world stays on the known-good night
    palette instead of crashing during startup.
  */
  return (
    WORLD_TWEAKS.atmosphere.palettes[name] ||
    WORLD_TWEAKS.atmosphere.palettes[WORLD_TWEAKS.atmosphere.defaultPalette]
  );
}

const defaultAtmospherePalette = getWorldAtmospherePalette();

function getWorldSkyMode(name = WORLD_TWEAKS.atmosphere.defaultPalette) {
  /*
    Returns the small day/night sky-mode record used by the `G` key prototype.

    This is intentionally separate from getWorldAtmospherePalette():

      atmosphere palette = full world look
      sky mode           = current day/night proof controls

    That lets us make the sky/sun mechanic useful now without accidentally
    recoloring grass, fog, rooms, torches, or moon tuning.
  */
  return (
    WORLD_TWEAKS.atmosphere.skyModes[name] ||
    WORLD_TWEAKS.atmosphere.skyModes[WORLD_TWEAKS.atmosphere.defaultPalette]
  );
}

export function applyWorldSkyColor(
  scene,
  renderer,
  skyName = WORLD_TWEAKS.atmosphere.defaultPalette,
) {
  /*
    Applies only the visible sky/clear color.

    This is the lightweight bridge between the current `G` key prototype and a
    future full day/night/weather system.

    Important distinction:
      applyWorldAtmosphere() = full palette write
      applyWorldSkyColor()   = sky background + renderer clear color only

    Formula:
      mode  = skyModes[skyName] or skyModes.night
      color = mode.skyColor

    where:
      scene.background controls the visible Three.js sky/backdrop.
      renderer.clearColor is the color WebGL clears to before each frame.

    This helper still writes only color. applyWorldSkyMode() is the fuller
    day/night helper that also writes fog and lights.
  */
  const mode = getWorldSkyMode(skyName);
  const color = mode.skyColor;

  if (scene) {
    scene.background = new THREE.Color(color);
  }

  renderer?.setClearColor?.(color, 1);
  return color;
}

export function applyWorldSkyMode(
  scene,
  renderer,
  { lightingRig = null, skyName = WORLD_TWEAKS.atmosphere.defaultPalette } = {},
) {
  /*
    Applies the current day/night sky mode.

    This is still much smaller than a full weather system. It exists because
    simply turning off the moon left the world lit only by small PointLights,
    which created a shrinking flashlight-like bright spot on nearby surfaces.

    What this writes:
      scene.background / renderer clear color
      fog color and density
      outside shell color and opacity
      HemisphereLight fill color and intensity
      sun DirectionalLight color, intensity, visibility, position, target
      central accent PointLight intensity/visibility

    What this deliberately does not write:
      outside floor color
      moon light intensities
      torch lights
      audio

    Formula:
      sky mode = skyModes[skyName] or skyModes.night

    For day:
      directional sun = warm, directional shape light
      hemisphere fill = broad readability light for ceilings and back-facing walls
      central accent = disabled so we can test whether it caused the shrinking
                       near-player light patch
  */
  const mode = getWorldSkyMode(skyName);

  applyWorldSkyColor(scene, renderer, skyName);

  if (scene) {
    scene.fog = new THREE.FogExp2(mode.fogColor, mode.fogDensity);
  }

  outsideWallMaterial.color.set(mode.outsideShellColor);
  outsideWallMaterial.opacity = mode.outsideShellOpacity;
  outsideWallMaterial.transparent = mode.outsideShellOpacity < 0.99;
  outsideWallMaterial.depthWrite = mode.outsideShellOpacity >= 0.99;
  outsideWallMaterial.needsUpdate = true;

  if (lightingRig?.hemisphereLight) {
    lightingRig.hemisphereLight.color.set(mode.hemisphereSkyColor);
    lightingRig.hemisphereLight.groundColor.set(mode.hemisphereGroundColor);
    lightingRig.hemisphereLight.intensity = mode.hemisphereIntensity;
  }

  if (lightingRig?.sunLight) {
    lightingRig.sunLight.color.set(mode.sunLightColor);
    lightingRig.sunLight.intensity = mode.sunLightIntensity;
    lightingRig.sunLight.visible = mode.sunLightIntensity > 0;
    lightingRig.sunLight.position.set(
      ...WORLD_TWEAKS.lighting.sunLightPosition,
    );
    lightingRig.sunLight.updateMatrixWorld(true);
  }

  if (lightingRig?.sunLightTarget) {
    lightingRig.sunLightTarget.position.set(
      ...WORLD_TWEAKS.lighting.sunLightTarget,
    );
    lightingRig.sunLightTarget.updateMatrixWorld(true);
  }

  if (lightingRig?.pointLight) {
    lightingRig.pointLight.color.set(mode.localAccentColor);
    lightingRig.pointLight.intensity = mode.localAccentIntensity;
    lightingRig.pointLight.visible = mode.localAccentIntensity > 0;
  }

  return mode;
}

export function getDefaultSkyMoonColor() {
  return WORLD_TWEAKS.skyMoon.fallbackColor;
}

// ---------------------------------------------------------------------------
// TEXTURE HELPERS
// ---------------------------------------------------------------------------
const textureLoader = new THREE.TextureLoader();
const gltfLoader = new GLTFLoader();
let torchPrototype = null;
let torchIsLoading = false;
const pendingTorchMounts = [];
const treeAssetState = {
  /*
    GLB tree cache.

    The outside forest still uses the same simple circular colliders as before,
    but the visible meshes now come from tree.glb and deadTree.glb. Each asset
    is loaded once, normalized to a predictable height, then cloned into the
    individual tree placeholders.
  */
  live: { prototype: null, loading: false, pending: [] },
  dead: { prototype: null, loading: false, pending: [] },
};
const landmarkAssetState = {};
const moonLightWorldPosition = new THREE.Vector3();
const moonPointLightDirection = new THREE.Vector3();

// =============================================================
// SKY MOON
// =============================================================

export function buildSkyMoon() {
  /*
    Builds the moon/sky focal point as a world-owned object.

    The group is available immediately with a fallback sphere so the scene has
    the same visible sky focal point while moon.glb is loading. Once moon.glb
    arrives, the fallback hides and the normalized GLB takes over.
  */
  const group = new THREE.Group();
  const fallback = new THREE.Mesh(
    new THREE.SphereGeometry(WORLD_TWEAKS.skyMoon.targetDiameter * 0.5, 24, 14),
    new THREE.MeshBasicMaterial({
      color: defaultAtmospherePalette.moonLightColor,
      toneMapped: false,
    }),
  );

  group.name = "sky-moon";
  group.userData.g53VisibilityRole = "sky";
  group.userData.fallback = fallback;
  group.position.set(...WORLD_TWEAKS.skyMoon.position);
  group.add(fallback);
  group.add(createSkyMoonInnerGlowSphere());

  gltfLoader.load(
    WORLD_TWEAKS.skyMoon.assetPath,
    (gltf) => {
      const moon = gltf.scene;

      moon.name = "sky-moon-model";
      normalizeSkyMoonModel(moon);
      fallback.visible = false;
      group.add(moon);
      console.info("[sky] moon loaded", WORLD_TWEAKS.skyMoon.assetPath);
    },
    undefined,
    (error) => {
      console.warn(
        "[sky] failed to load moon.glb; using fallback sphere",
        error,
      );
    },
  );

  return group;
}

function normalizeSkyMoonModel(model) {
  /*
    Fits moon.glb to the requested sky size.

    Formula:
      scale = targetDiameter / max(measuredWidth, measuredHeight, measuredDepth)

    The model is then centered on the sky group origin. The sky group's position
    handles the final world placement.
  */
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const maxAxis = Math.max(size.x, size.y, size.z);

  if (maxAxis <= 0.0001) {
    return;
  }

  model.scale.multiplyScalar(WORLD_TWEAKS.skyMoon.targetDiameter / maxAxis);
  model.updateMatrixWorld(true);

  const fittedBox = new THREE.Box3().setFromObject(model);
  const center = fittedBox.getCenter(new THREE.Vector3());

  model.position.sub(center);
  model.traverse((child) => {
    child.userData.g53VisibilityRole = "sky";

    if (child.isMesh) {
      child.frustumCulled = false;
      child.material = prepareSkyMoonSurfaceMaterial(child.material);
      child.renderOrder = 3;
    }
  });
}

function createSkyMoonInnerGlowSphere() {
  /*
    Creates the separate glow core inside the visible moon shell.

    The moon group remains the positional authority. This sphere is centered at
    local [0, 0, 0] inside that same group and never participates in moonlight
    direction math.

    Formula:
      radius = innerGlowDiameter / 2
      radius = 14.75 / 2 = 7.375
  */
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(
      WORLD_TWEAKS.skyMoon.innerGlowDiameter * 0.5,
      32,
      18,
    ),
    new THREE.MeshBasicMaterial({
      color: defaultAtmospherePalette.moonLightColor,
      transparent: true,
      opacity: WORLD_TWEAKS.skyMoon.innerGlowOpacity,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      toneMapped: false,
    }),
  );

  glow.name = "sky-moon-inner-glow";
  glow.userData.g53VisibilityRole = "sky";
  glow.renderOrder = 2;
  return glow;
}

function prepareSkyMoonSurfaceMaterial(sourceMaterial) {
  /*
    Keeps moon.glb as the detailed visible surface.

    This replaces the earlier "let scene lights shade the moon shell" approach.
    A lit material such as MeshStandardMaterial creates a terminator line on a
    sphere: one hemisphere faces the light, the other hemisphere falls into
    shadow. That is physically reasonable, but it is wrong for our visible sky
    moon because the moon itself should read as luminous.

    The fix is to use MeshBasicMaterial for the visible shell while keeping the
    imported moon texture map. MeshBasicMaterial ignores all scene lights, so:

      - the embedded moon texture still provides crater/detail information
      - the shell no longer gets a hard light/dark terminator
      - moonLight can continue lighting the world without also shading the moon

    Why build a new material:
      GLTFLoader gave us a physically lit GLB material. Cloning that material
      would preserve the same lighting behavior. Instead, we copy only the
      presentation data we want, especially the texture map and color tint.

    Formula:
      shellOpacity = WORLD_TWEAKS.skyMoon.surfaceOpacity
      shellOpacity = 0.9
  */
  if (Array.isArray(sourceMaterial)) {
    return sourceMaterial.map((material) =>
      prepareSkyMoonSurfaceMaterial(material),
    );
  }

  const source = sourceMaterial || null;

  if (source) {
    /*
      Presentation-only moon shell:

        map       = source.map keeps the embedded moon JPEG from moon.glb
        color     = source.color keeps the GLB base-color factor/tint
        opacity   = transparent shell opacity so the inner glow can still read
        toneMapped = false keeps the moon from being dimmed by tone mapping

      We deliberately do not copy roughness, metalness, normal lighting, or
      emissive settings. Those belong to lit PBR materials, and the whole point
      here is to avoid scene-light shading on the visible moon shell.
    */
    const material = new THREE.MeshBasicMaterial({
      name: `${source.name || "moon"}-self-lit-detail-shell`,
      map: source.map || null,
      alphaMap: source.alphaMap || null,
      color:
        source.color?.clone?.() ||
        new THREE.Color(WORLD_TWEAKS.skyMoon.fallbackColor),
      transparent: true,
      opacity: WORLD_TWEAKS.skyMoon.surfaceOpacity,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });

    material.needsUpdate = true;
    return material;
  }

  const material = new THREE.MeshBasicMaterial({
    name: "moon-detail-shell",
    color: WORLD_TWEAKS.skyMoon.fallbackColor,
    transparent: true,
    opacity: WORLD_TWEAKS.skyMoon.surfaceOpacity,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
  });

  material.needsUpdate = true;
  return material;
}

function loadRepeatedTexture(path, repeatX, repeatY, colorSpace = null) {
  /*
    Loads one texture file and configures it to tile.

    colorSpace is only set for color textures (diffuse/albedo).
    Data textures like normal maps stay in their default linear space.
  */
  const texture = textureLoader.load(path);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  if (colorSpace) {
    texture.colorSpace = colorSpace;
  }
  return texture;
}

function loadStoneSurfaceMaterial({
  diffusePath,
  displacementPath,
  repeatX = 4,
  repeatY = 4,
  color = 0xffffff,
  opacity = 1,
  displacementScale = 0.018,
}) {
  /*
    Builds a stone surface material from the specific room assets.

    diffusePath:
      Color texture. Loaded in sRGB space because it is meant to be seen.

    displacementPath:
      Height texture. Loaded as linear data because it modifies geometry.

    color:
      Multiplies the diffuse texture. This is how the rooms become dull gray
      while still preserving the texture detail.

    opacity:
      Room walls are now intentionally more solid at 80%. Floors are nearly
      opaque so the stone reads underfoot.
  */
  const diffuse = loadRepeatedTexture(
    diffusePath,
    repeatX,
    repeatY,
    THREE.SRGBColorSpace,
  );
  const displacement = loadRepeatedTexture(displacementPath, repeatX, repeatY);

  return new THREE.MeshStandardMaterial({
    color,
    map: diffuse,
    displacementMap: displacement,
    displacementScale,
    roughness: 0.9,
    metalness: 0,
    transparent: true,
    opacity,
  });
}

function cloneRoomMaterial(baseMaterial, color) {
  // Each wall gets a clone so changing one material never affects siblings.
  const material = baseMaterial.clone();
  material.color = new THREE.Color(color);
  return material;
}

function enableAmbientOcclusion(geometry) {
  // Three.js reads aoMap from uv2; BoxGeometry only creates uv by default.
  if (geometry.attributes.uv && !geometry.attributes.uv2) {
    geometry.setAttribute(
      "uv2",
      new THREE.BufferAttribute(geometry.attributes.uv.array, 2),
    );
  }
  return geometry;
}

// ---------------------------------------------------------------------------
// MATERIALS
// ---------------------------------------------------------------------------
const wallTextureMaterial = loadStoneSurfaceMaterial({
  diffusePath: WORLD_TWEAKS.roomTextures.wallDiffuse,
  displacementPath: WORLD_TWEAKS.roomTextures.wallDisplacement,
  repeatX: 5,
  repeatY: 4,
  color: WORLD_TWEAKS.roomColors.wall,
  opacity: roomWallOpacity,
  displacementScale: 0.018,
});
const floorTextureMaterial = loadStoneSurfaceMaterial({
  diffusePath: WORLD_TWEAKS.roomTextures.floorDiffuse,
  displacementPath: WORLD_TWEAKS.roomTextures.floorDisplacement,
  repeatX: 8,
  repeatY: 8,
  color: WORLD_TWEAKS.roomColors.floor,
  opacity: roomFloorOpacity,
  displacementScale: 0.012,
});
const ceilingTextureMaterial = loadStoneSurfaceMaterial({
  /*
    There is no separate ceiling texture yet, so the ceiling borrows the wall
    stone. It keeps the rooms cohesive without touching the outside enclosure.
  */
  diffusePath: WORLD_TWEAKS.roomTextures.wallDiffuse,
  displacementPath: WORLD_TWEAKS.roomTextures.wallDisplacement,
  repeatX: 5,
  repeatY: 4,
  color: WORLD_TWEAKS.roomColors.ceiling,
  opacity: roomCeilingOpacity,
  displacementScale: 0.01,
});

const roomSurfaceMaterials = {
  north: cloneRoomMaterial(wallTextureMaterial, WORLD_TWEAKS.roomColors.wall),
  south: cloneRoomMaterial(wallTextureMaterial, WORLD_TWEAKS.roomColors.wall),
  east: cloneRoomMaterial(wallTextureMaterial, WORLD_TWEAKS.roomColors.wall),
  west: cloneRoomMaterial(wallTextureMaterial, WORLD_TWEAKS.roomColors.wall),
  floor: cloneRoomMaterial(floorTextureMaterial, WORLD_TWEAKS.roomColors.floor),
  ceiling: cloneRoomMaterial(
    ceilingTextureMaterial,
    WORLD_TWEAKS.roomColors.ceiling,
  ),
};

const outsideWallMaterial = new THREE.MeshBasicMaterial({
  /*
    Outside wall/ceiling sky shell.

    This material intentionally ignores scene lighting.

    Bug history:
      When this was MeshStandardMaterial, each outside wall/ceiling face shaded
      differently depending on sun/hemi direction and camera angle. That made
      one "sky shell" read as several dull blue surfaces. Because this shell is
      currently standing in for sky/background at the outside bounds, it should
      present one stable color instead of behaving like lit architecture.

    Important flags:
      side: DoubleSide keeps the shell visible/occluding from either side while
        the camera is allowed to orbit beyond the player movement bounds.
      fog: false prevents night/day fog from creating another distance-based
        blue blend on the shell itself.
      toneMapped: false keeps #CEEAFA and #131862 closer to their authored
        values instead of being pushed around by renderer tone mapping.
  */
  color: defaultAtmospherePalette.outsideWallColor,
  side: THREE.DoubleSide,
  transparent: false,
  opacity: 1,
  depthWrite: true,
  fog: false,
  toneMapped: false,
});
const outsideFloorMaterial = new THREE.MeshStandardMaterial({
  color: defaultAtmospherePalette.outsideFloorColor,
  roughness: 0.9,
  metalness: 0,
  side: THREE.DoubleSide,
  fog: false,
});
const ghostSphereMaterial = new THREE.MeshBasicMaterial({
  // MeshBasicMaterial ignores lights — ghost spheres read as self-lit shapes.
  color: GHOST_SPHERE_COLOR,
  wireframe: true,
  transparent: true,
  opacity: 0.55,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const ghostGlowMaterial = new THREE.MeshBasicMaterial({
  // Larger, very transparent sphere gives cheap fake bloom without post-processing.
  color: GHOST_SPHERE_COLOR,
  transparent: true,
  opacity: 0.035,
  depthWrite: false,
  blending: THREE.AdditiveBlending,
});
const treeLeafMaterial = new THREE.MeshStandardMaterial({
  color: "#457543",
  roughness: 0.85,
  metalness: 0,
});
const treeTrunkMaterial = new THREE.MeshStandardMaterial({
  color: "#cc9029",
  roughness: 0.82,
  metalness: 0,
});

// =============================================================
// COLLISION DATA
// =============================================================
export const worldCollision = {
  /*
    Collision is stored separately from visual meshes.

    bounds:       Outside box that keeps the player inside the explorable area.
    solidRects:   Axis-aligned wall rectangles in top-down X/Z space.
    solidCircles: Circular obstacles (trees).
  */
  bounds: null,
  solidRects: [],
  solidCircles: [],
};

// =============================================================
// WORLD BUILDING
// =============================================================

export function buildExplorationWorld() {
  /*
    Creates the complete explorable space.

    Layout from above:
      negative-X/negative-Z room -- negative-Z room
                 |                      |
           negative-X room -------- central room -- outside to open enclosure

    Coordinate convention:
      - central room center is X0, Z0.
      - negative X means "west" in this file.
      - negative Z means "north" in this file.
      - the northwest room sits at X -roomSize, Z -roomSize.

    The northwest room connects to the existing rooms through its east and
    south walls. The matching openings are the west wall of the negative-Z room
    and the north wall of the negative-X room. Those paired doors keep the
    collision rectangles and visible wall openings aligned on both sides.

    Collision data is registered into worldCollision as geometry is built.
    Returns { group } so main.js can call scene.add(explorationWorld.group).
  */
  const group = new THREE.Group();
  group.name = "empyrean-four-room-exploration-world";

  worldCollision.bounds = {
    centerX: outsideCenter.x,
    centerZ: outsideCenter.z,
    halfSize: outsideSize / 2,
  };

  group.add(createOutsideEnclosure());
  group.add(createChurchShell());
  group.add(createCaveProp());
  addCaveProxyColliders();

  [
    {
      name: "central-room",
      center: new THREE.Vector3(0, roomSize / 2, 0),
      doors: { north: true, south: true, west: true },
    },
    {
      name: "negative-x-room",
      center: new THREE.Vector3(-roomSize, roomSize / 2, 0),
      doors: { north: true, east: true },
    },
    {
      name: "negative-z-room",
      center: new THREE.Vector3(0, roomSize / 2, -roomSize),
      doors: { south: true, west: true },
    },
    {
      name: "negative-x-negative-z-room",
      center: new THREE.Vector3(-roomSize, roomSize / 2, -roomSize),
      doors: { south: true, east: true },
    },
  ].forEach((roomConfig) => {
    group.add(createRoom(roomConfig));
  });

  buildLowPolyTrees(group);
  buildLandmarkScatter(group);
  return { group };
}

function createCaveProp() {
  /*
    Creates a world-owned visual cave prop.

    This follows the same fixture-zero rule as createChurchShell():
      1. create a stable placeholder group immediately
      2. load the GLB asynchronously
      3. apply the known 1000x Tinkercad scale
      4. do not center, normalize, or rotate the asset in code

    The authored cave origin is allowed to mean "place this specific CAD point at
    gameplay X20/Z-90." That keeps Blender/Tinkercad/CAD placement predictable.
  */
  const group = new THREE.Group();

  group.name = "cave-rough-prop";
  group.userData.g53VisibilityRole = "wall";
  group.position.set(...WORLD_TWEAKS.cave.position);

  gltfLoader.load(
    WORLD_TWEAKS.cave.assetPath,
    (gltf) => {
      const cave = gltf.scene;

      cave.name = "cave-rough-model";
      cave.scale.setScalar(WORLD_TWEAKS.cave.sceneUnitScale);
      prepareCaveModel(cave);
      group.add(cave);
      logCaveBounds(group);
    },
    undefined,
    (error) => {
      console.warn(
        "[world] failed to load cave.glb; cave proxy colliders remain active",
        error,
      );
    },
  );

  return group;
}

function prepareCaveModel(model) {
  /*
    Tags cave meshes as world architecture.

    G53 rigging mode only fades objects whose actual mesh materials carry a
    g53VisibilityRole. The placeholder group is useful for placement, but child
    meshes need the role too so they hide/fade with the rest of the environment.
  */
  model.traverse((child) => {
    child.userData.g53VisibilityRole = "wall";

    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = true;
    }
  });
}

function addCaveProxyColliders() {
  /*
    Registers rough top-down blockers for cave.glb.

    Why not use the cave mesh directly yet:
      Empyrean movement currently resolves a circular player footprint against
      rectangles and circles. That system is simple, stable, and visible in the
      World Debug overlay. True mesh/triangle collision would be a new physics
      subsystem, so this draft pass uses three rectangle "no-walk" zones:

        back wall + left rock side + right rock side

    The front/south side is intentionally left open so the player can approach
    the mouth of the cave.
  */
  WORLD_TWEAKS.cave.proxyColliders.forEach((collider) => {
    const [centerX, centerZ] = collider.center;
    const [width, depth] = collider.size;

    addSolidRect(centerX, centerZ, width, depth);
  });
}

function logCaveBounds(group) {
  /*
    Console-only placement check.

    If the cave feels offset in the scene, this readout gives the actual
    post-scale world bounds so the fixture zero or proxy colliders can be tuned
    with hard numbers instead of guessing by eye.
  */
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());

  console.info("[world] cave loaded", {
    assetPath: WORLD_TWEAKS.cave.assetPath,
    min: {
      x: Number(box.min.x.toFixed(3)),
      y: Number(box.min.y.toFixed(3)),
      z: Number(box.min.z.toFixed(3)),
    },
    max: {
      x: Number(box.max.x.toFixed(3)),
      y: Number(box.max.y.toFixed(3)),
      z: Number(box.max.z.toFixed(3)),
    },
    size: {
      x: Number(size.x.toFixed(3)),
      y: Number(size.y.toFixed(3)),
      z: Number(size.z.toFixed(3)),
    },
  });
}

function createChurchShell() {
  /*
    Creates an immediately available placeholder for the authored church shell.

    Why a placeholder group:
      GLB loading is asynchronous. buildExplorationWorld() must return a complete
      world group right away so startup can continue. The placeholder lets the
      scene graph keep a stable world-owned object while churchRough.glb loads in
      the background.

    Collision note:
      This is visual architecture only for this pass. The existing procedural
      rooms still own wall collision, door openings, outside bounds, and debug
      overlays. That keeps gameplay behavior unchanged while we test whether the
      shell model aligns with the current room block.
  */
  const group = new THREE.Group();

  group.name = "church-rough-shell";
  group.userData.g53VisibilityRole = "wall";
  group.position.set(...WORLD_TWEAKS.churchShell.position);

  gltfLoader.load(
    WORLD_TWEAKS.churchShell.assetPath,
    (gltf) => {
      const shell = gltf.scene;

      shell.name = "church-rough-shell-model";
      shell.scale.setScalar(WORLD_TWEAKS.churchShell.sceneUnitScale);
      prepareChurchShellModel(shell);
      group.add(shell);
      logChurchShellBounds(group);
    },
    undefined,
    (error) => {
      console.warn(
        "[world] failed to load churchRough.glb; procedural rooms remain active",
        error,
      );
    },
  );

  return group;
}

function prepareChurchShellModel(model) {
  /*
    Marks the loaded shell as world architecture.

    G53 rigging mode fades/hides world clutter by reading g53VisibilityRole on
    actual mesh objects. The placeholder group has no material of its own, so
    each child mesh also receives the "wall" role.
  */
  model.traverse((child) => {
    child.userData.g53VisibilityRole = "wall";

    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = true;
    }
  });
}

function logChurchShellBounds(group) {
  /*
    Development alignment readout.

    This prints the shell's fitted world-space envelope after the 1000x scale is
    applied. It is intentionally console-only: useful while checking that the
    CAD fixture zero matched gameplay X0/Z0, but it does not affect gameplay.
  */
  group.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(group);
  const size = box.getSize(new THREE.Vector3());

  console.info("[world] church shell loaded", {
    assetPath: WORLD_TWEAKS.churchShell.assetPath,
    min: {
      x: Number(box.min.x.toFixed(3)),
      y: Number(box.min.y.toFixed(3)),
      z: Number(box.min.z.toFixed(3)),
    },
    max: {
      x: Number(box.max.x.toFixed(3)),
      y: Number(box.max.y.toFixed(3)),
      z: Number(box.max.z.toFixed(3)),
    },
    size: {
      x: Number(size.x.toFixed(3)),
      y: Number(size.y.toFixed(3)),
      z: Number(size.z.toFixed(3)),
    },
  });
}

function createOutsideEnclosure() {
  const group = new THREE.Group();
  const half = outsideSize / 2;
  const centerX = outsideCenter.x;
  const centerZ = outsideCenter.z;
  const wallHeight = outsideHeight;
  const wallY = wallHeight / 2;

  const floor = new THREE.Mesh(
    new THREE.BoxGeometry(outsideSize, wallThickness, outsideSize),
    outsideFloorMaterial,
  );
  const ceiling = new THREE.Mesh(
    new THREE.BoxGeometry(outsideSize, wallThickness, outsideSize),
    outsideWallMaterial,
  );
  const northWall = new THREE.Mesh(
    new THREE.BoxGeometry(outsideSize, wallHeight, wallThickness),
    outsideWallMaterial,
  );
  const southWall = new THREE.Mesh(
    new THREE.BoxGeometry(outsideSize, wallHeight, wallThickness),
    outsideWallMaterial,
  );
  const eastWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, wallHeight, outsideSize),
    outsideWallMaterial,
  );
  const westWall = new THREE.Mesh(
    new THREE.BoxGeometry(wallThickness, wallHeight, outsideSize),
    outsideWallMaterial,
  );

  floor.name = "outside-green-floor";
  ceiling.name = "outside-blue-ceiling";
  northWall.name = "outside-north-wall";
  southWall.name = "outside-south-wall";
  eastWall.name = "outside-east-wall";
  westWall.name = "outside-west-wall";
  floor.userData.g53VisibilityRole = "floor";
  ceiling.userData.g53VisibilityRole = "ceiling";
  [northWall, southWall, eastWall, westWall].forEach((wall) => {
    wall.userData.g53VisibilityRole = "wall";
  });
  floor.position.set(centerX, -wallThickness / 2, centerZ);
  ceiling.position.set(centerX, wallHeight + wallThickness / 2, centerZ);
  northWall.position.set(centerX, wallY, centerZ - half);
  southWall.position.set(centerX, wallY, centerZ + half);
  eastWall.position.set(centerX + half, wallY, centerZ);
  westWall.position.set(centerX - half, wallY, centerZ);

  [floor, ceiling, northWall, southWall, eastWall, westWall].forEach((part) =>
    group.add(part),
  );

  addSolidRect(centerX, centerZ - half, outsideSize, wallThickness);
  addSolidRect(centerX, centerZ + half, outsideSize, wallThickness);
  addSolidRect(centerX + half, centerZ, wallThickness, outsideSize);
  addSolidRect(centerX - half, centerZ, wallThickness, outsideSize);

  return group;
}

function createRoom({ name, center, doors = {} }) {
  /*
    center.y is roomSize / 2, which places the local floor at world Y = 0:
      world floor Y = center.y + localFloorY = roomSize / 2 + (-roomSize / 2) = 0
  */
  const roomGroup = new THREE.Group();
  const localFloorY = -roomSize / 2;
  const floor = new THREE.Mesh(
    enableAmbientOcclusion(
      new THREE.BoxGeometry(roomSize, wallThickness, roomSize, 32, 1, 32),
    ),
    roomSurfaceMaterials.floor,
  );
  const ceiling = new THREE.Mesh(
    enableAmbientOcclusion(
      new THREE.BoxGeometry(roomSize, wallThickness, roomSize, 32, 1, 32),
    ),
    roomSurfaceMaterials.ceiling,
  );

  roomGroup.name = name;
  roomGroup.position.copy(center);
  floor.name = `${name}-floor`;
  ceiling.name = `${name}-ceiling`;
  floor.userData.g53VisibilityRole = "floor";
  ceiling.userData.g53VisibilityRole = "ceiling";
  floor.position.set(0, localFloorY, 0);
  ceiling.position.set(0, roomSize / 2, 0);
  roomGroup.add(floor, ceiling);

  addRoomWall(roomGroup, center, "north", doors.north);
  addRoomWall(roomGroup, center, "south", doors.south);
  addRoomWall(roomGroup, center, "east", doors.east);
  addRoomWall(roomGroup, center, "west", doors.west);
  addRoomTorches(roomGroup);

  return roomGroup;
}

function addRoomTorches(roomGroup) {
  /*
    Adds two torch mounts to each inside wall of one room.

    Important:
      Torches are visual props and light sources only. They do not add collision
      rectangles. The player should not get snagged on decoration while moving
      through doors and around the workshop.

    Coordinate convention:
      Room groups are centered at roomSize / 2 in world Y. Local floor Y is
      -roomSize / 2, so:

        localTorchY = -roomSize / 2 + heightAboveFloor

      Each mount's local +Z points out from the wall toward the room interior.
      The GLB clone is parented under that mount, and the point light lives in
      the same local space so the torch acts as its own dim light source.
  */
  const y = -roomSize / 2 + WORLD_TWEAKS.torches.heightAboveFloor;
  const offset = WORLD_TWEAKS.torches.alongOffset;

  ["north", "south", "east", "west"].forEach((side) => {
    [-offset, offset].forEach((alongOffset, index) => {
      const mount = createTorchMount(
        roomGroup.name,
        side,
        index,
        alongOffset,
        y,
      );

      roomGroup.add(mount);
      attachTorchModelWhenReady(mount);
    });
  });
}

function createTorchMount(roomName, side, index, alongOffset, y) {
  /*
    Builds the empty mount immediately, then the GLB loader fills in the torch
    model asynchronously.

    The point light is created now so rooms still get their warm torch lighting
    even if the GLB takes a moment to arrive.
  */
  const mount = new THREE.Group();
  const inset = WORLD_TWEAKS.torches.wallInset;

  mount.name = `${roomName}-${side}-torch-${index + 1}`;
  mount.userData.g53VisibilityRole = "wall";

  if (side === "north") {
    mount.position.set(alongOffset, y, -roomSize / 2 + inset);
    mount.rotation.y = 0;
  } else if (side === "south") {
    mount.position.set(alongOffset, y, roomSize / 2 - inset);
    mount.rotation.y = Math.PI;
  } else if (side === "east") {
    mount.position.set(roomSize / 2 - inset, y, alongOffset);
    mount.rotation.y = -Math.PI / 2;
  } else {
    mount.position.set(-roomSize / 2 + inset, y, alongOffset);
    mount.rotation.y = Math.PI / 2;
  }

  addTorchLight(mount);
  return mount;
}

function addTorchLight(mount) {
  /*
    The torch is the room's local light source.

    This is intentionally dim. There are many torches, so a small point light
    on each reads warmer without washing the stone walls flat.
  */
  const flame = new THREE.PointLight(
    WORLD_TWEAKS.torches.lightColor,
    WORLD_TWEAKS.torches.lightIntensity,
    WORLD_TWEAKS.torches.lightDistance,
    WORLD_TWEAKS.torches.lightDecay,
  );
  const glow = new THREE.Mesh(
    new THREE.SphereGeometry(0.34, 12, 8),
    new THREE.MeshBasicMaterial({
      color: WORLD_TWEAKS.torches.lightColor,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  const flameCore = new THREE.Mesh(
    new THREE.SphereGeometry(0.13, 10, 8),
    new THREE.MeshBasicMaterial({
      color: "#ffd29a",
      transparent: true,
      opacity: 0.95,
      depthWrite: false,
    }),
  );
  const bracket = new THREE.Mesh(
    new THREE.CylinderGeometry(0.035, 0.045, 0.55, 8),
    new THREE.MeshStandardMaterial({
      color: "#2b2925",
      roughness: 0.85,
      metalness: 0.25,
    }),
  );

  flame.name = `${mount.name}-warm-point-light`;
  glow.name = `${mount.name}-flame-glow`;
  flameCore.name = `${mount.name}-flame-core`;
  bracket.name = `${mount.name}-primitive-bracket`;
  glow.userData.g53VisibilityRole = "wall";
  flameCore.userData.g53VisibilityRole = "wall";
  bracket.userData.g53VisibilityRole = "wall";
  flame.position.set(0, 0.08, 0.22);
  glow.position.copy(flame.position);
  flameCore.position.copy(flame.position);
  bracket.position.set(0, -0.16, 0.08);
  bracket.rotation.x = Math.PI * 0.36;
  mount.add(bracket, flame, glow, flameCore);
}

function attachTorchModelWhenReady(mount) {
  /*
    Loads torch.glb once, then clones it for every wall mount.

    Why the queue:
      createRoom() runs synchronously during startup. GLB loading is async. Each
      mount registers itself here; when the prototype arrives, every pending
      mount receives a normalized clone.
  */
  if (torchPrototype) {
    mount.add(cloneTorchModel(mount.name));
    return;
  }

  pendingTorchMounts.push(mount);

  if (torchIsLoading) {
    return;
  }

  torchIsLoading = true;
  gltfLoader.load(
    WORLD_TWEAKS.torches.assetPath,
    (gltf) => {
      torchPrototype = gltf.scene;
      torchPrototype.name = "torch-prototype";
      normalizeTorchPrototype(torchPrototype);
      pendingTorchMounts.splice(0).forEach((pendingMount) => {
        pendingMount.add(cloneTorchModel(pendingMount.name));
      });
      torchIsLoading = false;
    },
    undefined,
    (error) => {
      console.warn("[world] failed to load torch.glb", error);
      torchIsLoading = false;
    },
  );
}

function normalizeTorchPrototype(model) {
  /*
    Fits an arbitrary torch GLB to a predictable workshop size.

    Formula:
      scale = targetHeight / measuredHeight

    After scaling, the model's bounding-box center is moved to the mount origin.
    That makes every clone easy to place: the mount position is the torch center,
    not some unknown authoring origin from Blender or another tool.
  */
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  if (size.y <= 0.0001) {
    return;
  }

  model.scale.multiplyScalar(WORLD_TWEAKS.torches.height / size.y);
  model.updateMatrixWorld(true);

  const fittedBox = new THREE.Box3().setFromObject(model);
  const center = fittedBox.getCenter(new THREE.Vector3());

  model.position.sub(center);
  model.traverse((child) => {
    child.userData.g53VisibilityRole = "wall";

    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = false;
    }
  });
}

function cloneTorchModel(namePrefix) {
  const clone = torchPrototype.clone(true);

  clone.name = `${namePrefix}-model`;
  clone.traverse((child) => {
    child.userData.g53VisibilityRole = "wall";
  });
  return clone;
}

function addRoomWall(roomGroup, roomCenter, side, hasDoor = false) {
  /*
    Door math:
      sideLength = (roomSize - doorWidth) / 2

    That leaves: sideLength + doorWidth + sideLength = roomSize total.
  */
  const material = roomSurfaceMaterials[side];
  const sideLength = hasDoor ? (roomSize - doorWidth) / 2 : roomSize;
  const sideOffset = hasDoor ? doorWidth / 2 + sideLength / 2 : 0;
  const topHeight = roomSize - doorHeight;
  const topY = -roomSize / 2 + doorHeight + topHeight / 2;

  if (!hasDoor) {
    addWallSegment(
      roomGroup,
      roomCenter,
      side,
      0,
      0,
      roomSize,
      roomSize,
      material,
      true,
    );
    return;
  }

  addWallSegment(
    roomGroup,
    roomCenter,
    side,
    -sideOffset,
    0,
    sideLength,
    roomSize,
    material,
    true,
  );
  addWallSegment(
    roomGroup,
    roomCenter,
    side,
    sideOffset,
    0,
    sideLength,
    roomSize,
    material,
    true,
  );
  addWallSegment(
    roomGroup,
    roomCenter,
    side,
    0,
    topY,
    doorWidth,
    topHeight,
    material,
    false,
  );
}

function addWallSegment(
  roomGroup,
  roomCenter,
  side,
  alongOffset,
  y,
  alongLength,
  height,
  material,
  blocksMovement,
) {
  /*
    For north/south walls: long direction is X, thickness is Z.
    For east/west walls:   long direction is Z, thickness is X.
  */
  const isNorthSouth = side === "north" || side === "south";
  const geometry = isNorthSouth
    ? new THREE.BoxGeometry(alongLength, height, wallThickness, 24, 24, 1)
    : new THREE.BoxGeometry(wallThickness, height, alongLength, 1, 24, 24);
  const mesh = new THREE.Mesh(enableAmbientOcclusion(geometry), material);
  const local = new THREE.Vector3();

  if (side === "north") {
    local.set(alongOffset, y, -roomSize / 2);
  } else if (side === "south") {
    local.set(alongOffset, y, roomSize / 2);
  } else if (side === "east") {
    local.set(roomSize / 2, y, alongOffset);
  } else {
    local.set(-roomSize / 2, y, alongOffset);
  }

  mesh.position.copy(local);
  mesh.name = `${roomGroup.name}-${side}-wall-segment`;
  mesh.userData.g53VisibilityRole = "wall";
  mesh.material.transparent = true;
  mesh.material.opacity = roomWallOpacity;
  roomGroup.add(mesh);

  if (blocksMovement) {
    addSolidRect(
      roomCenter.x + local.x,
      roomCenter.z + local.z,
      isNorthSouth ? alongLength : wallThickness,
      isNorthSouth ? wallThickness : alongLength,
    );
  }
}

function addSolidRect(centerX, centerZ, width, depth) {
  worldCollision.solidRects.push({
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minZ: centerZ - depth / 2,
    maxZ: centerZ + depth / 2,
  });
}

function addSolidCircle(centerX, centerZ, radius) {
  worldCollision.solidCircles.push({ centerX, centerZ, radius });
}

function buildLowPolyTrees(parent) {
  const treePositions = [
    [-42, 18],
    [-34, 27],
    [-22, 22],
    [-8, 27],
    [9, 22],
    [24, 13],
    [27, -7],
    [20, -24],
    [28, -38],
    [8, -44],
    [-12, -42],
    [-33, -43],
    [-48, -28],
    [-45, -8],
    [-51, 10],
    [-31, 15],
  ];

  treePositions.forEach(([x, z], index) => {
    const tree = createTreeProp(index);

    tree.position.set(x, 0, z);
    parent.add(tree);
    addSolidCircle(x, z, treeColliderRadius);
  });
}

function createTreeProp(index, forcedKind = null) {
  /*
    Creates one outside tree placeholder, then fills it with a GLB clone.

    Half the old primitive trees become live tree.glb, half become deadTree.glb.
    Alternating them keeps the outside silhouette varied without moving the
    collision circles or hand-placed positions.

    forcedKind is used by the landmark scatter so it can choose a live/dead tree
    from its seeded kind list instead of relying on index parity.
  */
  const group = new THREE.Group();
  const kind = forcedKind || (index % 2 === 0 ? "live" : "dead");

  group.name = `${kind}-glb-tree-${index + 1}`;
  group.userData.g53VisibilityRole = "tree";
  group.rotation.y = index * 0.37;
  attachTreeModelWhenReady(group, kind);
  return group;
}

function getTreeAssetConfig(kind) {
  if (kind === "dead") {
    return {
      path: WORLD_TWEAKS.trees.deadAssetPath,
      targetHeight: WORLD_TWEAKS.trees.deadTargetHeight,
      state: treeAssetState.dead,
    };
  }

  return {
    path: WORLD_TWEAKS.trees.liveAssetPath,
    targetHeight: WORLD_TWEAKS.trees.targetHeight,
    state: treeAssetState.live,
  };
}

function attachTreeModelWhenReady(mount, kind) {
  /*
    Same pattern as torches:
      1. Create all placeholders immediately.
      2. Load each GLB once.
      3. Clone the normalized prototype into every waiting placeholder.

    The tree placeholders are what G53 hides and what the world owns. The model
    clone is only the visible art inside that stable placeholder.
  */
  const config = getTreeAssetConfig(kind);

  if (config.state.prototype) {
    mount.add(cloneTreeModel(config.state.prototype, mount.name));
    return;
  }

  config.state.pending.push(mount);

  if (config.state.loading) {
    return;
  }

  config.state.loading = true;
  gltfLoader.load(
    config.path,
    (gltf) => {
      const prototype = gltf.scene;

      prototype.name = `${kind}-tree-prototype`;
      normalizeTreePrototype(prototype, config.targetHeight);
      config.state.prototype = prototype;
      config.state.pending.splice(0).forEach((pendingMount) => {
        pendingMount.add(cloneTreeModel(prototype, pendingMount.name));
      });
      config.state.loading = false;
    },
    undefined,
    (error) => {
      console.warn(`[world] failed to load ${config.path}`, error);
      config.state.loading = false;
    },
  );
}

function normalizeTreePrototype(model, targetHeight) {
  /*
    Fits the imported tree to a predictable outside-world height.

    Formula:
      scale = targetHeight / measuredHeight

    Then the model is shifted so:
      - its X/Z center sits on the placeholder origin
      - its bottom sits on local Y = 0

    That lets the old tree position list continue to mean "tree trunk sits here
    on the ground", just with better art.
  */
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  if (size.y <= 0.0001) {
    return;
  }

  model.scale.multiplyScalar(targetHeight / size.y);
  model.updateMatrixWorld(true);

  const fittedBox = new THREE.Box3().setFromObject(model);
  const center = fittedBox.getCenter(new THREE.Vector3());

  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= fittedBox.min.y;
  model.traverse((child) => {
    child.userData.g53VisibilityRole = "tree";

    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = true;
    }
  });
}

function cloneTreeModel(prototype, namePrefix) {
  const clone = prototype.clone(true);

  clone.name = `${namePrefix}-model`;
  clone.traverse((child) => {
    child.userData.g53VisibilityRole = "tree";
  });
  return clone;
}

function buildLandmarkScatter(parent) {
  /*
    Places small outside-world landmarks.

    This is deliberately not a full procedural terrain system. It is a stable
    scatter pass for rough world-building:

      - seeded random numbers make the result repeatable
      - zones keep props in broad regions instead of pure noise everywhere
      - isLandmarkPlacementClear() rejects positions near existing collision,
        the church shell, the cave, and already-placed landmarks

    The result should feel like "something is out there" while staying easy to
    rip apart when the real map design starts to firm up.
  */
  const rng = createSeededRandom(WORLD_TWEAKS.landmarks.seed);
  const placed = [];

  WORLD_TWEAKS.landmarks.kinds.forEach((kind, index) => {
    const config = WORLD_TWEAKS.landmarks.assets[kind];

    if (!config) {
      console.warn(`[world] unknown landmark kind: ${kind}`);
      return;
    }

    const placement = findLandmarkPlacement(kind, index, config, rng, placed);

    if (!placement) {
      console.warn(`[world] could not place landmark ${kind} ${index + 1}`);
      return;
    }

    const prop = createLandmarkProp(kind, index, rng);

    prop.position.set(placement.x, 0, placement.z);
    prop.rotation.y = placement.yaw;
    parent.add(prop);
    addSolidCircle(placement.x, placement.z, config.colliderRadius);
    placed.push({
      x: placement.x,
      z: placement.z,
      radius: config.colliderRadius,
    });
  });
}

function findLandmarkPlacement(kind, index, config, rng, placed) {
  /*
    Rejection-sampling placement.

    Formula:
      candidateRadius = propColliderRadius + clearance

    A candidate is accepted only if that expanded radius is:
      - inside the outside bounds
      - outside worldCollision's existing rectangles/circles
      - outside the hand-authored church/cave avoid rectangles
      - outside previously accepted landmark circles

    That expanded-radius test gives every prop breathing room, not just raw
    collision clearance.
  */
  const attempts = 160;

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const zone = pickLandmarkZone(index, attempt, rng);
    const [x, z] = randomPointInLandmarkZone(zone, rng);
    const candidateRadius =
      config.colliderRadius + WORLD_TWEAKS.landmarks.clearance;

    if (isLandmarkPlacementClear(x, z, candidateRadius, placed)) {
      return {
        x,
        z,
        yaw: rng() * Math.PI * 2,
      };
    }
  }

  return null;
}

function pickLandmarkZone(index, attempt, rng) {
  /*
    The first attempt walks through zones evenly so every region gets some love.
    Later attempts add randomness if a zone is too crowded or blocked.
  */
  const zones = WORLD_TWEAKS.landmarks.zones;
  const zoneIndex =
    attempt === 0 ? index % zones.length : Math.floor(rng() * zones.length);

  return zones[zoneIndex];
}

function randomPointInLandmarkZone(zone, rng) {
  const halfOutside = outsideSize / 2;
  const margin = WORLD_TWEAKS.landmarks.placementMargin;
  const minWorldX = outsideCenter.x - halfOutside + margin;
  const maxWorldX = outsideCenter.x + halfOutside - margin;
  const minWorldZ = outsideCenter.z - halfOutside + margin;
  const maxWorldZ = outsideCenter.z + halfOutside - margin;
  const minX = Math.max(minWorldX, zone.center[0] - zone.halfSize[0]);
  const maxX = Math.min(maxWorldX, zone.center[0] + zone.halfSize[0]);
  const minZ = Math.max(minWorldZ, zone.center[1] - zone.halfSize[1]);
  const maxZ = Math.min(maxWorldZ, zone.center[1] + zone.halfSize[1]);

  return [
    THREE.MathUtils.lerp(minX, maxX, rng()),
    THREE.MathUtils.lerp(minZ, maxZ, rng()),
  ];
}

function isLandmarkPlacementClear(x, z, radius, placed) {
  if (
    isCircleNearAvoidRect(
      x,
      z,
      radius,
      WORLD_TWEAKS.landmarks.churchAvoidRect,
    ) ||
    isCircleNearAvoidRect(x, z, radius, WORLD_TWEAKS.landmarks.caveAvoidRect)
  ) {
    return false;
  }

  if (!isFootprintValid(new THREE.Vector2(x, z), radius)) {
    return false;
  }

  return !placed.some(
    (other) => Math.hypot(x - other.x, z - other.z) < radius + other.radius,
  );
}

function isCircleNearAvoidRect(x, z, radius, rect) {
  return (
    x > rect.minX - radius &&
    x < rect.maxX + radius &&
    z > rect.minZ - radius &&
    z < rect.maxZ + radius
  );
}

function createLandmarkProp(kind, index, rng) {
  const config = WORLD_TWEAKS.landmarks.assets[kind];

  if (config.treeKind) {
    const tree = createTreeProp(index + 1000, config.treeKind);

    tree.name = `landmark-${config.treeKind}-tree-${index + 1}`;
    return tree;
  }

  const group = new THREE.Group();

  group.name = `landmark-${kind}-${index + 1}`;
  group.userData.g53VisibilityRole = "tree";
  group.rotation.y = rng() * Math.PI * 2;
  attachLandmarkModelWhenReady(group, kind);
  return group;
}

function getLandmarkAssetConfig(kind) {
  const config = WORLD_TWEAKS.landmarks.assets[kind];

  if (!landmarkAssetState[kind]) {
    landmarkAssetState[kind] = { prototype: null, loading: false, pending: [] };
  }

  return {
    ...config,
    state: landmarkAssetState[kind],
  };
}

function attachLandmarkModelWhenReady(mount, kind) {
  /*
    Same async cache pattern as torches and trees.

    Each landmark GLB loads once, gets normalized once, then clones into every
    placeholder that asked for that kind.
  */
  const config = getLandmarkAssetConfig(kind);

  if (config.state.prototype) {
    mount.add(cloneLandmarkModel(config.state.prototype, mount.name));
    return;
  }

  config.state.pending.push(mount);

  if (config.state.loading) {
    return;
  }

  config.state.loading = true;
  gltfLoader.load(
    config.assetPath,
    (gltf) => {
      const prototype = gltf.scene;

      prototype.name = `${kind}-landmark-prototype`;
      normalizeLandmarkPrototype(prototype, config.targetHeight);
      config.state.prototype = prototype;
      config.state.pending.splice(0).forEach((pendingMount) => {
        pendingMount.add(cloneLandmarkModel(prototype, pendingMount.name));
      });
      config.state.loading = false;
    },
    undefined,
    (error) => {
      console.warn(
        `[world] failed to load landmark ${config.assetPath}`,
        error,
      );
      config.state.loading = false;
    },
  );
}

function normalizeLandmarkPrototype(model, targetHeight) {
  /*
    Fits small landmark GLBs to a consistent height.

    Formula:
      scale = targetHeight / measuredHeight

    After scaling, the model is shifted so its bottom sits on local Y = 0 and
    its X/Z center sits on the placeholder origin. Unlike the church/cave, these
    props are not fixture-zero architecture; they are small decorative pieces, so
    centering them makes random placement predictable.
  */
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());

  if (size.y <= 0.0001) {
    return;
  }

  model.scale.multiplyScalar(targetHeight / size.y);
  model.updateMatrixWorld(true);

  const fittedBox = new THREE.Box3().setFromObject(model);
  const center = fittedBox.getCenter(new THREE.Vector3());

  model.position.x -= center.x;
  model.position.z -= center.z;
  model.position.y -= fittedBox.min.y;
  model.traverse((child) => {
    child.userData.g53VisibilityRole = "tree";

    if (child.isMesh) {
      child.castShadow = false;
      child.receiveShadow = true;
    }
  });
}

function cloneLandmarkModel(prototype, namePrefix) {
  const clone = prototype.clone(true);

  clone.name = `${namePrefix}-model`;
  clone.traverse((child) => {
    child.userData.g53VisibilityRole = "tree";
  });
  return clone;
}

function createSeededRandom(seed) {
  /*
    Mulberry32-style seeded RNG.

    Returns a function with Math.random()-like output in [0, 1), but stable for
    the same integer seed. Useful for world dressing because it looks random
    without becoming different every page refresh.
  */
  let value = seed >>> 0;

  return function seededRandom() {
    value += 0x6d2b79f5;
    let mixed = value;

    mixed = Math.imul(mixed ^ (mixed >>> 15), mixed | 1);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

// =============================================================
// GHOST SPHERES
// =============================================================

export function buildGhostSpheres() {
  /*
    Creates floating wireframe ghost spheres.

    Each visible sphere is two meshes at one position:
      1. wireframe sphere
      2. larger, very transparent glow sphere

    Returns an array of motion records. The caller adds sphere.group to the
    scene — this function does not touch the scene.
  */
  const count = WORLD_TWEAKS.ghostSpheres.count;
  const spheres = [];
  const geometry = new THREE.SphereGeometry(1, 14, 10);

  for (let index = 0; index < count; index += 1) {
    const group = new THREE.Group();
    const radius = 0.055 + Math.random() * 0.12;
    const basePosition = makeGhostSpherePosition();
    const wire = new THREE.Mesh(geometry, ghostSphereMaterial.clone());
    const glow = new THREE.Mesh(geometry, ghostGlowMaterial.clone());

    wire.scale.setScalar(radius);
    wire.material.opacity = 0.34 + Math.random() * 0.28;
    glow.scale.setScalar(radius * 2.15);
    glow.material.opacity = 0.018 + Math.random() * 0.04;

    group.position.copy(basePosition);
    group.add(glow, wire);

    spheres.push({
      group,
      basePosition,
      drift: new THREE.Vector3(
        (Math.random() - 0.5) * 0.7,
        (Math.random() - 0.5) * 0.5,
        (Math.random() - 0.5) * 0.7,
      ),
      phase: Math.random() * Math.PI * 2,
      speed: 0.2 + Math.random() * 0.55,
      spin: new THREE.Vector3(
        Math.random() * 0.25,
        Math.random() * 0.35,
        Math.random() * 0.2,
      ),
    });
  }

  return spheres;
}

function makeGhostSpherePosition() {
  /*
    Picks a starting position hugging the ceiling or one of the four outside walls.

    face ranges:
      < 0.48  ceiling
      < 0.61  west wall
      < 0.74  east wall
      < 0.87  north wall
      else    south wall
  */
  const half = outsideSize / 2;
  const face = Math.random();
  const minX = outsideCenter.x - half;
  const maxX = outsideCenter.x + half;
  const minZ = outsideCenter.z - half;
  const maxZ = outsideCenter.z + half;

  if (face < 0.48) {
    return new THREE.Vector3(
      THREE.MathUtils.randFloat(minX + 3, maxX - 3),
      outsideHeight - THREE.MathUtils.randFloat(0.4, 2.5),
      THREE.MathUtils.randFloat(minZ + 3, maxZ - 3),
    );
  }
  if (face < 0.61) {
    return new THREE.Vector3(
      minX + THREE.MathUtils.randFloat(0.5, 1.8),
      THREE.MathUtils.randFloat(4.5, outsideHeight - 1),
      THREE.MathUtils.randFloat(minZ + 3, maxZ - 3),
    );
  }
  if (face < 0.74) {
    return new THREE.Vector3(
      maxX - THREE.MathUtils.randFloat(0.5, 1.8),
      THREE.MathUtils.randFloat(4.5, outsideHeight - 1),
      THREE.MathUtils.randFloat(minZ + 3, maxZ - 3),
    );
  }
  if (face < 0.87) {
    return new THREE.Vector3(
      THREE.MathUtils.randFloat(minX + 3, maxX - 3),
      THREE.MathUtils.randFloat(4.5, outsideHeight - 1),
      minZ + THREE.MathUtils.randFloat(0.5, 1.8),
    );
  }
  return new THREE.Vector3(
    THREE.MathUtils.randFloat(minX + 3, maxX - 3),
    THREE.MathUtils.randFloat(4.5, outsideHeight - 1),
    maxZ - THREE.MathUtils.randFloat(0.5, 1.8),
  );
}

export function updateGhostSphereMotion(spheres, elapsed) {
  /*
    Animates ghost spheres.

    Formula:
      offset          = sin(elapsed * speed + phase)
      currentPosition = basePosition + drift * offset
  */
  spheres.forEach((sphere) => {
    const offset = Math.sin(elapsed * sphere.speed + sphere.phase);
    sphere.group.position.set(
      sphere.basePosition.x + sphere.drift.x * offset,
      sphere.basePosition.y + sphere.drift.y * offset,
      sphere.basePosition.z + sphere.drift.z * offset,
    );
    sphere.group.rotation.x += sphere.spin.x * 0.01;
    sphere.group.rotation.y += sphere.spin.y * 0.01;
    sphere.group.rotation.z += sphere.spin.z * 0.01;
  });
}

// =============================================================
// LIGHTING
// =============================================================

export function applyWorldAtmosphere(
  scene,
  renderer,
  {
    lightingRig = null,
    paletteName = WORLD_TWEAKS.atmosphere.defaultPalette,
  } = {},
) {
  /*
    Applies one named world-atmosphere palette.

    Ownership boundary:
      world.js owns the meaning of "night", "day", "foggy", "overcast", etc.
      main.js may choose which palette is active, but it should not know which
      exact colors/intensities make that palette.

    Current pass:
      This applies the existing night look with no visual redesign.

    Future timed-cycle path:
      A later function can interpolate between two palettes and call the same
      write targets below every frame:

        scene background/fog
        renderer clear color
        outside wall/floor materials
        HemisphereLight colors/intensity
        moon/sun/world light colors and intensities

    Why scene + renderer are passed in:
      world.js must not import from main.js. main.js creates the scene/renderer,
      then hands them to the world module so world-owned atmosphere can configure
      them without creating a circular dependency.
  */
  const palette = getWorldAtmospherePalette(paletteName);

  if (scene) {
    scene.background = new THREE.Color(palette.sceneBackground);
    scene.fog = new THREE.FogExp2(palette.fogColor, palette.fogDensity);
  }

  renderer?.setClearColor?.(
    palette.rendererClearColor || palette.sceneBackground,
    palette.rendererClearAlpha ?? 1,
  );

  outsideWallMaterial.color.set(palette.outsideWallColor);
  outsideWallMaterial.needsUpdate = true;
  outsideFloorMaterial.color.set(palette.outsideFloorColor);
  outsideFloorMaterial.needsUpdate = true;

  if (lightingRig?.hemisphereLight) {
    lightingRig.hemisphereLight.color.set(palette.hemisphereSkyColor);
    lightingRig.hemisphereLight.groundColor.set(palette.hemisphereGroundColor);
    lightingRig.hemisphereLight.intensity = palette.hemisphereIntensity;
  }

  if (lightingRig?.moonLight) {
    lightingRig.moonLight.color.set(palette.moonLightColor);
    lightingRig.moonLight.intensity = palette.moonLightIntensity;
  }

  if (lightingRig?.moonPointLight) {
    lightingRig.moonPointLight.color.set(palette.moonLightColor);
    lightingRig.moonPointLight.intensity = palette.moonPointLightIntensity;
  }

  if (lightingRig?.pointLight) {
    lightingRig.pointLight.color.set(palette.localAccentColor);
    lightingRig.pointLight.intensity = palette.localAccentIntensity;
  }

  return palette;
}

export function buildLighting(scene, { skyMoon = null } = {}) {
  /*
    Lighting stack:
      HemisphereLight = low ambient moonlit fill, just enough to keep shapes readable
      DirectionalLight = moon-aligned key light tied to skyMoon's world position
      Sun DirectionalLight = warm day key light used when `G` switches to day
      Moon PointLight = local moon-shell helper tied to skyMoon's world position
      PointLight = small green character/world accent
      Room torches = warm local point lights created by addTorchLight()

    MeshBasicMaterial objects ignore these lights. Ghost spheres are intentionally
    self-lit wireframes, and the sky moon gets a detailed transparent shell plus
    a separate inner self-lit glow sphere.

    Returns a small lighting rig instead of just mutating the scene. main.js
    calls rig.update() every frame so the moon light keeps following skyMoon if
    a future day/night cycle animates the moon across the sky.
  */
  const atmosphere = getWorldAtmospherePalette();
  const hemisphereLight = new THREE.HemisphereLight(
    atmosphere.hemisphereSkyColor,
    atmosphere.hemisphereGroundColor,
    atmosphere.hemisphereIntensity,
  );
  hemisphereLight.name = "moonlit-hemisphere-fill";
  scene.add(hemisphereLight);

  const moonDirectionalLight = new THREE.DirectionalLight(
    atmosphere.moonLightColor,
    atmosphere.moonLightIntensity,
  );
  moonDirectionalLight.name = "sky-moon-directional-light";
  moonDirectionalLight.target.name = "sky-moon-light-target";
  scene.add(moonDirectionalLight);
  scene.add(moonDirectionalLight.target);

  const skyMode = getWorldSkyMode();
  const sunDirectionalLight = new THREE.DirectionalLight(
    skyMode.sunLightColor,
    skyMode.sunLightIntensity,
  );
  sunDirectionalLight.name = "day-sun-directional-light";
  sunDirectionalLight.target.name = "day-sun-light-target";
  sunDirectionalLight.position.set(...WORLD_TWEAKS.lighting.sunLightPosition);
  sunDirectionalLight.target.position.set(
    ...WORLD_TWEAKS.lighting.sunLightTarget,
  );
  sunDirectionalLight.visible = skyMode.sunLightIntensity > 0;
  scene.add(sunDirectionalLight);
  scene.add(sunDirectionalLight.target);

  const moonPointLight = new THREE.PointLight(
    atmosphere.moonLightColor,
    atmosphere.moonPointLightIntensity,
    WORLD_TWEAKS.lighting.moonPointLightDistance,
    WORLD_TWEAKS.lighting.moonPointLightDecay,
  );
  moonPointLight.name = "sky-moon-shell-point-light";
  scene.add(moonPointLight);

  const pointLight = new THREE.PointLight(
    atmosphere.localAccentColor,
    atmosphere.localAccentIntensity,
    WORLD_TWEAKS.lighting.localAccentDistance,
  );
  pointLight.name = "central-green-accent-light";
  pointLight.position.set(...WORLD_TWEAKS.lighting.localAccentPosition);
  scene.add(pointLight);

  const lightingRig = {
    hemisphereLight,
    moonLight: moonDirectionalLight,
    moonLightTarget: moonDirectionalLight.target,
    sunLight: sunDirectionalLight,
    sunLightTarget: sunDirectionalLight.target,
    moonPointLight,
    pointLight,
    update() {
      syncMoonLights(moonDirectionalLight, moonPointLight, skyMoon);
    },
  };

  lightingRig.update();
  return lightingRig;
}

function syncMoonLights(moonDirectionalLight, moonPointLight, skyMoon) {
  /*
    Single source of truth for moonlight placement.

    Source:
      The visible skyMoon object's actual world position.

    Target:
      WORLD_TWEAKS.lighting.moonLightTarget.

    DirectionalLight does not shine outward from a bulb the way PointLight does.
    Its position and target define a direction:

      lightDirection = moonDirectionalLight.target.position - moonDirectionalLight.position

    In plain terms:
      - moonDirectionalLight.position follows skyMoon's world position.
      - moonDirectionalLight.target stays at the configured aim point.
      - the resulting light appears to come from the visible moon.
      - moonPointLight is also derived from skyMoon's world position, then nudged
        toward the target only to illuminate the visible moon shell from the
        gameplay/church side.

    getWorldPosition() is deliberate. If a future sky-cycle parents the moon
    under an orbit rig, or moves a larger sky group instead of skyMoon directly,
    this still reads the actual rendered moon position.
  */
  moonDirectionalLight.target.position.set(
    ...WORLD_TWEAKS.lighting.moonLightTarget,
  );
  moonDirectionalLight.target.updateMatrixWorld(true);

  if (!skyMoon) {
    /*
      Defensive fallback only.

      Normal gameplay passes the visible skyMoon group. If a test ever calls
      buildLighting(scene) without it, use the same visible-moon config position
      rather than inventing a separate moonlight-only coordinate.
    */
    moonDirectionalLight.position.set(...WORLD_TWEAKS.skyMoon.position);
    moonDirectionalLight.updateMatrixWorld(true);
    syncMoonShellPointLight(moonPointLight, moonDirectionalLight.position);
    return;
  }

  skyMoon.updateMatrixWorld(true);
  skyMoon.getWorldPosition(moonLightWorldPosition);
  moonDirectionalLight.position.copy(moonLightWorldPosition);
  moonDirectionalLight.updateMatrixWorld(true);
  syncMoonShellPointLight(moonPointLight, moonLightWorldPosition);
}

function syncMoonShellPointLight(moonPointLight, moonWorldPosition) {
  /*
    Positions the local moon-shell PointLight.

    The light is not allowed to own its own moon coordinate. It starts from the
    same moonWorldPosition used by the directional light, then optionally moves
    a short distance toward moonLightTarget.

    Formula:
      target     = WORLD_TWEAKS.lighting.moonLightTarget
      direction  = normalize(target - moonWorldPosition)
      pointLight = moonWorldPosition + direction * moonPointLightOffsetTowardTarget

    If offset is 0, the light sits exactly at the visible moon's world position.
  */
  if (!moonPointLight) return;

  moonPointLight.position.copy(moonWorldPosition);

  const offset = WORLD_TWEAKS.lighting.moonPointLightOffsetTowardTarget;
  if (Math.abs(offset) > 0.0001) {
    moonPointLightDirection
      .set(...WORLD_TWEAKS.lighting.moonLightTarget)
      .sub(moonWorldPosition);

    if (moonPointLightDirection.lengthSq() > 0.0001) {
      moonPointLightDirection.normalize();
      moonPointLight.position.addScaledVector(moonPointLightDirection, offset);
    }
  }

  moonPointLight.updateMatrixWorld(true);
}

// =============================================================
// COLLISION RESOLUTION
// =============================================================

export function resolveRigRoomCollision(
  position,
  { radius, rootOffsetX, rootOffsetZ },
) {
  /*
    Pure function: converts a proposed control position into a legal one.

    Steps:
      1. Shift position by rootOffset to get world footprint X/Z.
      2. Push footprint out of all obstacles.
      3. Shift back to control-space.
  */
  const footprint = new THREE.Vector2(
    position.x + rootOffsetX,
    position.z + rootOffsetZ,
  );
  const resolved = resolveFootprintAgainstWorld(footprint, radius);
  return new THREE.Vector3(
    resolved.x - rootOffsetX,
    position.y,
    resolved.y - rootOffsetZ,
  );
}

export function moveRigWithCollision(position, direction, distance, params) {
  /*
    Pure function: returns the new position after moving with sliding collision.

    First try the full diagonal move. If blocked, try X and Z axes separately.
    That gives simple slide-along-wall behavior without a physics engine.
  */
  const nextPosition = position.clone().addScaledVector(direction, distance);
  const resolvedPosition = resolveRigRoomCollision(nextPosition, params);

  if (isControlPositionValid(resolvedPosition, params)) {
    return resolvedPosition;
  }

  const xOnly = resolveRigRoomCollision(
    new THREE.Vector3(nextPosition.x, position.y, position.z),
    params,
  );
  const zOnly = resolveRigRoomCollision(
    new THREE.Vector3(position.x, position.y, nextPosition.z),
    params,
  );

  const result = position.clone();
  if (isControlPositionValid(xOnly, params)) result.copy(xOnly);
  if (isControlPositionValid(zOnly, params)) result.copy(zOnly);
  return result;
}

export function isControlPositionValid(
  position,
  { radius, rootOffsetX, rootOffsetZ },
) {
  const footprint = new THREE.Vector2(
    position.x + rootOffsetX,
    position.z + rootOffsetZ,
  );
  return isFootprintValid(footprint, radius);
}

function resolveFootprintAgainstWorld(footprint, radius) {
  /*
    Pushes a 2D circular footprint out of all obstacles.

    Three iterations settle most multi-obstacle cases without a physics engine.
  */
  const resolved = footprint.clone();
  const bounds = getOutsideBounds(radius);

  resolved.x = THREE.MathUtils.clamp(resolved.x, bounds.minX, bounds.maxX);
  resolved.y = THREE.MathUtils.clamp(resolved.y, bounds.minZ, bounds.maxZ);

  for (let iteration = 0; iteration < 3; iteration += 1) {
    worldCollision.solidRects.forEach((rect) => {
      pushFootprintOutOfRect(resolved, rect, radius);
    });
    worldCollision.solidCircles.forEach((circle) => {
      pushFootprintOutOfCircle(resolved, circle, radius);
    });
    resolved.x = THREE.MathUtils.clamp(resolved.x, bounds.minX, bounds.maxX);
    resolved.y = THREE.MathUtils.clamp(resolved.y, bounds.minZ, bounds.maxZ);
  }

  return resolved;
}

function getOutsideBounds(radius) {
  // Returns legal min/max X/Z for the collider center (edge stays inside boundary).
  const halfUsable = worldCollision.bounds.halfSize - wallThickness - radius;
  return {
    minX: worldCollision.bounds.centerX - halfUsable,
    maxX: worldCollision.bounds.centerX + halfUsable,
    minZ: worldCollision.bounds.centerZ - halfUsable,
    maxZ: worldCollision.bounds.centerZ + halfUsable,
  };
}

function isFootprintValid(footprint, radius) {
  const bounds = getOutsideBounds(radius);

  if (
    footprint.x < bounds.minX ||
    footprint.x > bounds.maxX ||
    footprint.y < bounds.minZ ||
    footprint.y > bounds.maxZ
  ) {
    return false;
  }

  const intersectsRect = worldCollision.solidRects.some(
    (rect) =>
      footprint.x > rect.minX - radius &&
      footprint.x < rect.maxX + radius &&
      footprint.y > rect.minZ - radius &&
      footprint.y < rect.maxZ + radius,
  );

  if (intersectsRect) return false;

  return !worldCollision.solidCircles.some(
    (circle) =>
      Math.hypot(footprint.x - circle.centerX, footprint.y - circle.centerZ) <
      circle.radius + radius,
  );
}

function pushFootprintOutOfRect(point, rect, radius) {
  /*
    Circle-vs-AABB resolver.

    Expands the rectangle by the circle radius and treats the circle center as
    a point. If the point is inside the expanded rect, move it to the nearest edge.
  */
  const expanded = {
    minX: rect.minX - radius,
    maxX: rect.maxX + radius,
    minZ: rect.minZ - radius,
    maxZ: rect.maxZ + radius,
  };

  if (
    point.x < expanded.minX ||
    point.x > expanded.maxX ||
    point.y < expanded.minZ ||
    point.y > expanded.maxZ
  ) {
    return;
  }

  const distances = [
    {
      axis: "x",
      value: expanded.minX,
      distance: Math.abs(point.x - expanded.minX),
    },
    {
      axis: "x",
      value: expanded.maxX,
      distance: Math.abs(expanded.maxX - point.x),
    },
    {
      axis: "z",
      value: expanded.minZ,
      distance: Math.abs(point.y - expanded.minZ),
    },
    {
      axis: "z",
      value: expanded.maxZ,
      distance: Math.abs(expanded.maxZ - point.y),
    },
  ].sort((a, b) => a.distance - b.distance);

  const nearest = distances[0];
  if (nearest.axis === "x") {
    point.x = nearest.value;
  } else {
    point.y = nearest.value;
  }
}

function pushFootprintOutOfCircle(point, circle, radius) {
  /*
    Circle-vs-circle resolver for trees.

    If center-to-center distance is too small, push the player footprint
    outward along the center-to-center direction until the circles just touch.
  */
  const dx = point.x - circle.centerX;
  const dz = point.y - circle.centerZ;
  const minDistance = circle.radius + radius;
  const distance = Math.hypot(dx, dz);

  if (distance >= minDistance) return;

  if (distance < 0.0001) {
    point.x = circle.centerX + minDistance;
    return;
  }

  point.x = circle.centerX + (dx / distance) * minDistance;
  point.y = circle.centerZ + (dz / distance) * minDistance;
}

// =============================================================
// ENCOUNTER SYSTEM
// =============================================================

export function createEncounterRuntime(definitions) {
  /*
    Converts the raw encounter definitions into runtime state.

    Disabled encounters are filtered out so they do not trigger actions or
    draw debug zones.
  */
  return {
    definitions: definitions.filter((encounter) => encounter.enabled !== false),
    activeIds: new Set(),
  };
}

export function tickEncounterSystem(
  runtime,
  footprint,
  worldDebugView,
  sceneRefs,
) {
  /*
    Checks the avatar footprint against every encounter trigger.

    Actions fire only when inside/outside state changes:
      outside -> inside = onEnter
      inside -> outside = onExit

    sceneRefs = { audio, skyMoon, defaultSkyMoonColor }
      Passed by main.js so encounter actions can affect scene objects without
      this module importing from main.js.
  */
  runtime.definitions.forEach((encounter) => {
    const isInside = isFootprintInsideEncounter(footprint, encounter);
    const wasInside = runtime.activeIds.has(encounter.id);

    if (isInside && !wasInside) {
      runtime.activeIds.add(encounter.id);
      runEncounterActions(encounter.onEnter, encounter, "enter", sceneRefs);
    } else if (!isInside && wasInside) {
      runtime.activeIds.delete(encounter.id);
      runEncounterActions(encounter.onExit, encounter, "exit", sceneRefs);
    }
  });

  worldDebugView?.syncEncounterActivity?.(runtime.activeIds);
}

function isFootprintInsideEncounter(footprint, encounter) {
  if (encounter.shape?.type === "circle") {
    const [centerX, centerZ] = encounter.shape.center || [0, 0];
    const radius = encounter.shape.radius || 1;
    return Math.hypot(footprint.x - centerX, footprint.y - centerZ) <= radius;
  }

  if (encounter.shape?.type === "rect") {
    const rect = getEncounterRect(encounter);
    return (
      footprint.x >= rect.minX &&
      footprint.x <= rect.maxX &&
      footprint.y >= rect.minZ &&
      footprint.y <= rect.maxZ
    );
  }

  return false;
}

export function getEncounterRect(encounter) {
  /*
    Normalizes a rectangle encounter into min/max form.

    Preferred form in encounters.js:
      center: [x, z]
      size: [width, depth]

    Alternate form:
      min: [minX, minZ]
      max: [maxX, maxZ]
  */
  if (encounter.shape?.min && encounter.shape?.max) {
    return {
      minX: encounter.shape.min[0],
      maxX: encounter.shape.max[0],
      minZ: encounter.shape.min[1],
      maxZ: encounter.shape.max[1],
    };
  }

  const [centerX, centerZ] = encounter.shape?.center || [0, 0];
  const [width, depth] = encounter.shape?.size || [1, 1];

  return {
    minX: centerX - width / 2,
    maxX: centerX + width / 2,
    minZ: centerZ - depth / 2,
    maxZ: centerZ + depth / 2,
  };
}

export function getEncounterCenter(encounter) {
  // Returns the center of an encounter in X/Z as a Vector2. Used for debug labels.
  if (encounter.shape?.type === "circle") {
    const [x, z] = encounter.shape.center || [0, 0];
    return new THREE.Vector2(x, z);
  }

  const rect = getEncounterRect(encounter);
  return new THREE.Vector2(
    (rect.minX + rect.maxX) / 2,
    (rect.minZ + rect.maxZ) / 2,
  );
}

function runEncounterActions(actions = [], encounter, phase, sceneRefs) {
  actions.forEach((action) => {
    applyEncounterAction(action, encounter, phase, sceneRefs);
  });
}

function applyEncounterAction(action, encounter, phase, sceneRefs) {
  /*
    Dispatch table for encounter actions.

    To add a new action type:
      1. Add a case here.
      2. Document the action shape in encounters.js.
  */
  switch (action.type) {
    case "log":
      console.info(
        `[encounter:${phase}] ${encounter.id}`,
        action.message || "",
      );
      break;
    case "audio":
      applyEncounterAudioAction(action, sceneRefs.audio);
      break;
    case "skyMoonColor":
    case "jupiterColor":
      applySkyObjectColor(
        sceneRefs.skyMoon || sceneRefs.jupiter,
        action.color ||
          sceneRefs.defaultSkyMoonColor ||
          sceneRefs.defaultJupiterColor,
      );
      break;
    case "skyMoonScale":
    case "jupiterScale":
      (sceneRefs.skyMoon || sceneRefs.jupiter)?.scale.setScalar(
        Number.isFinite(action.scale) ? action.scale : 1,
      );
      break;
    default:
      console.warn("Unknown encounter action.", { encounter, action });
      break;
  }
}

function applySkyObjectColor(skyObject, color) {
  /*
    Encounter compatibility helper.

    Older builds used one single-mesh sky object, so encounter color actions
    could call material.color directly. The sky object is now a moon.glb group,
    which may contain several meshes. This helper applies the same tint to every
    material under the group, while still supporting the old single-mesh path.
  */
  if (!skyObject) {
    return;
  }

  const nextColor = new THREE.Color(color);

  skyObject.traverse?.((child) => {
    const materials = Array.isArray(child.material)
      ? child.material
      : child.material
        ? [child.material]
        : [];

    materials.forEach((material) => {
      if (material.color) {
        material.color.copy(nextColor);
        material.needsUpdate = true;
      }
    });
  });

  if (skyObject.material?.color) {
    skyObject.material.color.copy(nextColor);
    skyObject.material.needsUpdate = true;
  }
}

function applyEncounterAudioAction(action, audio) {
  audio?.applyEncounterAudioAction?.(action);
}

// =============================================================
// WORLD DEBUG VIEW
// =============================================================

export function createWorldDebugView(encounterRuntime, playerRadius) {
  /*
    Builds the optional collision-vision overlay.

    Shows:
      - wall/outside solid rectangles
      - tree circular colliders
      - outside movement bounds
      - encounter trigger zones and labels

    These debug meshes do not participate in collision.
  */
  const group = new THREE.Group();
  const wallColliders = [];
  const treeColliders = [];
  const outsideBounds = [];
  const encounterZones = [];
  const encounterLabels = [];
  const encounterObjectsById = new Map();
  const lift = WORLD_TWEAKS.worldDebug.floorLift;

  group.name = "world-debug-overlay";
  group.renderOrder = 50;

  worldCollision.solidRects.forEach((rect, index) => {
    const mesh = makeDebugRectMesh(
      rect,
      WORLD_TWEAKS.worldDebug.wallColor,
      0.28,
      lift,
    );
    mesh.name = `debug-wall-collider-${index + 1}`;
    wallColliders.push(mesh);
    group.add(mesh);
  });

  worldCollision.solidCircles.forEach((circle, index) => {
    const mesh = makeDebugCircleMesh(
      circle.centerX,
      circle.centerZ,
      circle.radius,
      WORLD_TWEAKS.worldDebug.treeColor,
      0.34,
      lift + 0.012,
    );
    mesh.name = `debug-tree-collider-${index + 1}`;
    treeColliders.push(mesh);
    group.add(mesh);
  });

  makeDebugBoundsMeshes(playerRadius).forEach((mesh) => {
    outsideBounds.push(mesh);
    group.add(mesh);
  });

  encounterRuntime.definitions.forEach((encounter) => {
    const zone = makeEncounterDebugMesh(encounter, lift + 0.024);
    if (!zone) return;

    zone.name = `debug-encounter-zone-${encounter.id}`;
    zone.userData.baseOpacity = zone.material.opacity;
    zone.userData.activeOpacity = Math.min(zone.material.opacity + 0.26, 0.72);
    zone.userData.encounterId = encounter.id;
    encounterZones.push(zone);
    encounterObjectsById.set(encounter.id, zone);
    group.add(zone);

    const label = makeLabelSprite(encounter.label || encounter.id, {
      color: encounter.debugColor || WORLD_TWEAKS.worldDebug.encounterColor,
      scale: 0.72,
    });
    const center = getEncounterCenter(encounter);

    label.name = `debug-encounter-label-${encounter.id}`;
    label.position.set(center.x, 0.48, center.y);
    label.renderOrder = 60;
    encounterLabels.push(label);
    group.add(label);
  });

  return {
    group,
    encounterObjectsById,
    setVisible(options) {
      /*
        Category visibility is separate from master visibility.

        showWorldDebug = false hides everything.
        showWorldDebug = true + showTreeColliders = false shows everything
        except tree circles.
      */
      group.visible = options.showWorldDebug;
      wallColliders.forEach((object) => {
        object.visible = options.showWallColliders;
      });
      treeColliders.forEach((object) => {
        object.visible = options.showTreeColliders;
      });
      outsideBounds.forEach((object) => {
        object.visible = options.showOutsideBounds;
      });
      encounterZones.forEach((object) => {
        object.visible = options.showEncounterZones;
      });
      encounterLabels.forEach((object) => {
        object.visible =
          options.showEncounterZones && options.showEncounterLabels;
      });
    },
    syncEncounterActivity(activeIds) {
      // Highlights active encounter zones so you can see exactly when triggers fire.
      encounterObjectsById.forEach((object, id) => {
        object.material.opacity = activeIds.has(id)
          ? object.userData.activeOpacity
          : object.userData.baseOpacity;
        object.material.needsUpdate = true;
      });
    },
  };
}

function makeDebugRectMesh(rect, color, opacity, y) {
  const width = Math.max(0.001, rect.maxX - rect.minX);
  const depth = Math.max(0.001, rect.maxZ - rect.minZ);
  const centerX = (rect.minX + rect.maxX) / 2;
  const centerZ = (rect.minZ + rect.maxZ) / 2;
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(width, 0.035, depth),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      depthWrite: false,
      depthTest: false,
    }),
  );
  mesh.position.set(centerX, y, centerZ);
  mesh.renderOrder = 50;
  return mesh;
}

function makeDebugCircleMesh(centerX, centerZ, radius, color, opacity, y) {
  // CylinderGeometry is already in the right orientation for a floor footprint.
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, 0.04, 48, 1, true),
    new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity,
      wireframe: true,
      depthWrite: false,
      depthTest: false,
    }),
  );
  mesh.position.set(centerX, y, centerZ);
  mesh.renderOrder = 51;
  return mesh;
}

function makeDebugBoundsMeshes(playerRadius) {
  /*
    Draws the legal movement boundary as four thin rectangles.

    This is different from the outside wall colliders:
      wall colliders = the actual blocking wall rectangles
      bounds         = the clamped legal area for the avatar footprint center
  */
  const bounds = getOutsideBounds(playerRadius);
  const thickness = 0.09;
  const y = WORLD_TWEAKS.worldDebug.floorLift + 0.04;
  const color = WORLD_TWEAKS.worldDebug.boundsColor;
  const opacity = 0.42;

  return [
    makeDebugRectMesh(
      {
        minX: bounds.minX,
        maxX: bounds.maxX,
        minZ: bounds.minZ - thickness / 2,
        maxZ: bounds.minZ + thickness / 2,
      },
      color,
      opacity,
      y,
    ),
    makeDebugRectMesh(
      {
        minX: bounds.minX,
        maxX: bounds.maxX,
        minZ: bounds.maxZ - thickness / 2,
        maxZ: bounds.maxZ + thickness / 2,
      },
      color,
      opacity,
      y,
    ),
    makeDebugRectMesh(
      {
        minX: bounds.minX - thickness / 2,
        maxX: bounds.minX + thickness / 2,
        minZ: bounds.minZ,
        maxZ: bounds.maxZ,
      },
      color,
      opacity,
      y,
    ),
    makeDebugRectMesh(
      {
        minX: bounds.maxX - thickness / 2,
        maxX: bounds.maxX + thickness / 2,
        minZ: bounds.minZ,
        maxZ: bounds.maxZ,
      },
      color,
      opacity,
      y,
    ),
  ];
}

function makeEncounterDebugMesh(encounter, y) {
  const color = encounter.debugColor || WORLD_TWEAKS.worldDebug.encounterColor;

  if (encounter.shape?.type === "circle") {
    const [x, z] = encounter.shape.center || [0, 0];
    return makeDebugCircleMesh(
      x,
      z,
      encounter.shape.radius || 1,
      color,
      0.22,
      y,
    );
  }

  if (encounter.shape?.type === "rect") {
    return makeDebugRectMesh(getEncounterRect(encounter), color, 0.18, y);
  }

  console.warn("Unknown encounter debug shape.", encounter);
  return null;
}

// =============================================================
// UTILITIES
// =============================================================

export function disposeObjectTree(root) {
  /*
    Disposes GPU resources under a scene object.

    Removing from the scene is not enough — geometry, textures, and materials
    can remain allocated on the GPU. This walks the tree and disposes unique
    resources once.
  */
  const geometries = new Set();
  const materials = new Set();

  root.traverse((object) => {
    if (object.geometry && !geometries.has(object.geometry)) {
      geometries.add(object.geometry);
      object.geometry.dispose();
    }

    const objectMaterials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    objectMaterials.forEach((material) => {
      if (!material || materials.has(material)) return;
      materials.add(material);
      material.map?.dispose?.();
      material.dispose();
    });
  });
}

export function makeLabelSprite(text, options = {}) {
  /*
    Creates a 2D canvas label as a Three.js Sprite.

    Sprites always face the camera, so joint names remain readable while orbiting.
  */
  const canvas = document.createElement("canvas");
  canvas.width = 500;
  canvas.height = 80;

  const context = canvas.getContext("2d");
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(0, 0, 0, 0.55)";
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = options.color || GUIDE_COLOR;
  context.strokeRect(1, 1, canvas.width - 2, canvas.height - 2);
  context.fillStyle = options.color || GUIDE_COLOR;
  context.font = "70px monospace";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(text, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthTest: false,
    }),
  );
  sprite.scale.set(0.34 * options.scale, 0.085 * options.scale, 1);
  return sprite;
}
