/*
  EMPYREAN WORLD MODULE

  Owns:
    - World geometry (rooms, trees, outside enclosure)
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
  Player speed, camera, Jupiter, and audio stay in main.js.
*/
const WORLD_TWEAKS = {
  world: {
    roomSize: 24,
    wallThickness: 0.1,
    roomWallOpacity: 0.8,
    roomFloorOpacity: 0.95,
    roomCeilingOpacity: 0.8,
    doorWidth: 4.4,
    doorHeight: 5.1,
    outsideSize: 96,
    outsideCenterX: -12,
    outsideCenterZ: -12,
    outsideWallColor: "#131862",
    outsideFloorColor: "#7BB369",
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
};

// ---------------------------------------------------------------------------
// INTERNAL CONSTANTS
// ---------------------------------------------------------------------------
const roomSize         = WORLD_TWEAKS.world.roomSize;
const wallThickness    = WORLD_TWEAKS.world.wallThickness;
const roomWallOpacity  = WORLD_TWEAKS.world.roomWallOpacity;
const roomFloorOpacity = WORLD_TWEAKS.world.roomFloorOpacity;
const roomCeilingOpacity = WORLD_TWEAKS.world.roomCeilingOpacity;
const doorWidth        = WORLD_TWEAKS.world.doorWidth;
const doorHeight       = WORLD_TWEAKS.world.doorHeight;
const outsideSize      = WORLD_TWEAKS.world.outsideSize;
const outsideCenter    = new THREE.Vector3(
  WORLD_TWEAKS.world.outsideCenterX,
  0,
  WORLD_TWEAKS.world.outsideCenterZ,
);
const outsideWallColor   = WORLD_TWEAKS.world.outsideWallColor;
const outsideFloorColor  = WORLD_TWEAKS.world.outsideFloorColor;
const treeColliderRadius = WORLD_TWEAKS.trees.colliderRadius;
const GHOST_SPHERE_COLOR = WORLD_TWEAKS.ghostSpheres.color;

export const GUIDE_COLOR = "#e0dcdc";

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
    diffusePath, repeatX, repeatY, THREE.SRGBColorSpace,
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
  north:   cloneRoomMaterial(wallTextureMaterial,    WORLD_TWEAKS.roomColors.wall),
  south:   cloneRoomMaterial(wallTextureMaterial,    WORLD_TWEAKS.roomColors.wall),
  east:    cloneRoomMaterial(wallTextureMaterial,    WORLD_TWEAKS.roomColors.wall),
  west:    cloneRoomMaterial(wallTextureMaterial,    WORLD_TWEAKS.roomColors.wall),
  floor:   cloneRoomMaterial(floorTextureMaterial,   WORLD_TWEAKS.roomColors.floor),
  ceiling: cloneRoomMaterial(ceilingTextureMaterial, WORLD_TWEAKS.roomColors.ceiling),
};

const outsideWallMaterial = new THREE.MeshStandardMaterial({
  color: outsideWallColor,
  roughness: 0.95,
  metalness: 0,
  transparent: true,
  opacity: 0.42,
});
const outsideFloorMaterial = new THREE.MeshStandardMaterial({
  color: outsideFloorColor,
  roughness: 0.9,
  metalness: 0,
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
const treeLeafMaterial  = new THREE.MeshStandardMaterial({ color: "#457543", roughness: 0.85, metalness: 0 });
const treeTrunkMaterial = new THREE.MeshStandardMaterial({ color: "#cc9029", roughness: 0.82, metalness: 0 });

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
      negative-Z room
            |
      negative-X room -- central room -- outside to open enclosure

    Collision data is registered into worldCollision as geometry is built.
    Returns { group } so main.js can call scene.add(explorationWorld.group).
  */
  const group = new THREE.Group();
  group.name = "empyrean-three-room-exploration-world";

  worldCollision.bounds = {
    centerX: outsideCenter.x,
    centerZ: outsideCenter.z,
    halfSize: outsideSize / 2,
  };

  group.add(createOutsideEnclosure());

  [
    {
      name: "central-room",
      center: new THREE.Vector3(0, roomSize / 2, 0),
      doors: { north: true, south: true, west: true },
    },
    {
      name: "negative-x-room",
      center: new THREE.Vector3(-roomSize, roomSize / 2, 0),
      doors: { east: true },
    },
    {
      name: "negative-z-room",
      center: new THREE.Vector3(0, roomSize / 2, -roomSize),
      doors: { south: true },
    },
  ].forEach((roomConfig) => {
    group.add(createRoom(roomConfig));
  });

  buildLowPolyTrees(group);
  return { group };
}

function createOutsideEnclosure() {
  const group      = new THREE.Group();
  const half       = outsideSize / 2;
  const centerX    = outsideCenter.x;
  const centerZ    = outsideCenter.z;
  const wallHeight = roomSize;
  const wallY      = wallHeight / 2;

  const floor     = new THREE.Mesh(new THREE.BoxGeometry(outsideSize, wallThickness, outsideSize), outsideFloorMaterial);
  const ceiling   = new THREE.Mesh(new THREE.BoxGeometry(outsideSize, wallThickness, outsideSize), outsideWallMaterial.clone());
  const northWall = new THREE.Mesh(new THREE.BoxGeometry(outsideSize, wallHeight, wallThickness),  outsideWallMaterial.clone());
  const southWall = new THREE.Mesh(new THREE.BoxGeometry(outsideSize, wallHeight, wallThickness),  outsideWallMaterial.clone());
  const eastWall  = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, outsideSize),  outsideWallMaterial.clone());
  const westWall  = new THREE.Mesh(new THREE.BoxGeometry(wallThickness, wallHeight, outsideSize),  outsideWallMaterial.clone());

  floor.name   = "outside-green-floor";
  ceiling.name = "outside-blue-ceiling";
  northWall.name = "outside-north-wall";
  southWall.name = "outside-south-wall";
  eastWall.name  = "outside-east-wall";
  westWall.name  = "outside-west-wall";
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

  [floor, ceiling, northWall, southWall, eastWall, westWall].forEach((part) => group.add(part));

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
  const roomGroup   = new THREE.Group();
  const localFloorY = -roomSize / 2;
  const floor   = new THREE.Mesh(
    enableAmbientOcclusion(new THREE.BoxGeometry(roomSize, wallThickness, roomSize, 32, 1, 32)),
    roomSurfaceMaterials.floor,
  );
  const ceiling = new THREE.Mesh(
    enableAmbientOcclusion(new THREE.BoxGeometry(roomSize, wallThickness, roomSize, 32, 1, 32)),
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
  addRoomWall(roomGroup, center, "east",  doors.east);
  addRoomWall(roomGroup, center, "west",  doors.west);
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
      const mount = createTorchMount(roomGroup.name, side, index, alongOffset, y);

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
  const material   = roomSurfaceMaterials[side];
  const sideLength = hasDoor ? (roomSize - doorWidth) / 2 : roomSize;
  const sideOffset = hasDoor ? doorWidth / 2 + sideLength / 2 : 0;
  const topHeight  = roomSize - doorHeight;
  const topY       = -roomSize / 2 + doorHeight + topHeight / 2;

  if (!hasDoor) {
    addWallSegment(roomGroup, roomCenter, side, 0, 0, roomSize, roomSize, material, true);
    return;
  }

  addWallSegment(roomGroup, roomCenter, side, -sideOffset, 0, sideLength, roomSize, material, true);
  addWallSegment(roomGroup, roomCenter, side,  sideOffset, 0, sideLength, roomSize, material, true);
  addWallSegment(roomGroup, roomCenter, side,  0, topY, doorWidth, topHeight, material, false);
}

function addWallSegment(
  roomGroup, roomCenter, side,
  alongOffset, y, alongLength, height,
  material, blocksMovement,
) {
  /*
    For north/south walls: long direction is X, thickness is Z.
    For east/west walls:   long direction is Z, thickness is X.
  */
  const isNorthSouth = side === "north" || side === "south";
  const geometry = isNorthSouth
    ? new THREE.BoxGeometry(alongLength, height, wallThickness, 24, 24, 1)
    : new THREE.BoxGeometry(wallThickness, height, alongLength,  1, 24, 24);
  const mesh  = new THREE.Mesh(enableAmbientOcclusion(geometry), material);
  const local = new THREE.Vector3();

  if (side === "north") {
    local.set(alongOffset, y, -roomSize / 2);
  } else if (side === "south") {
    local.set(alongOffset, y,  roomSize / 2);
  } else if (side === "east") {
    local.set( roomSize / 2, y, alongOffset);
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
    [-42, 18],  [-34, 27],  [-22, 22],  [-8, 27],
    [9, 22],    [24, 13],   [27, -7],   [20, -24],
    [28, -38],  [8, -44],   [-12, -42], [-33, -43],
    [-48, -28], [-45, -8],  [-51, 10],  [-31, 15],
  ];

  treePositions.forEach(([x, z], index) => {
    const tree = createTreeProp(index);

    tree.position.set(x, 0, z);
    parent.add(tree);
    addSolidCircle(x, z, treeColliderRadius);
  });
}

function createTreeProp(index) {
  /*
    Creates one outside tree placeholder, then fills it with a GLB clone.

    Half the old primitive trees become live tree.glb, half become deadTree.glb.
    Alternating them keeps the outside silhouette varied without moving the
    collision circles or hand-placed positions.
  */
  const group = new THREE.Group();
  const kind = index % 2 === 0 ? "live" : "dead";

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
  const count    = WORLD_TWEAKS.ghostSpheres.count;
  const spheres  = [];
  const geometry = new THREE.SphereGeometry(1, 14, 10);

  for (let index = 0; index < count; index += 1) {
    const group        = new THREE.Group();
    const radius       = 0.055 + Math.random() * 0.12;
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
      roomSize - THREE.MathUtils.randFloat(0.4, 2.5),
      THREE.MathUtils.randFloat(minZ + 3, maxZ - 3),
    );
  }
  if (face < 0.61) {
    return new THREE.Vector3(
      minX + THREE.MathUtils.randFloat(0.5, 1.8),
      THREE.MathUtils.randFloat(4.5, roomSize - 1),
      THREE.MathUtils.randFloat(minZ + 3, maxZ - 3),
    );
  }
  if (face < 0.74) {
    return new THREE.Vector3(
      maxX - THREE.MathUtils.randFloat(0.5, 1.8),
      THREE.MathUtils.randFloat(4.5, roomSize - 1),
      THREE.MathUtils.randFloat(minZ + 3, maxZ - 3),
    );
  }
  if (face < 0.87) {
    return new THREE.Vector3(
      THREE.MathUtils.randFloat(minX + 3, maxX - 3),
      THREE.MathUtils.randFloat(4.5, roomSize - 1),
      minZ + THREE.MathUtils.randFloat(0.5, 1.8),
    );
  }
  return new THREE.Vector3(
    THREE.MathUtils.randFloat(minX + 3, maxX - 3),
    THREE.MathUtils.randFloat(4.5, roomSize - 1),
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

export function buildLighting(scene) {
  /*
    Lighting stack:
      HemisphereLight = low ambient fill, just enough to keep shapes readable
      DirectionalLight = weak global key light
      PointLight = small green character/world accent
      Room torches = warm local point lights created by addTorchLight()

    MeshBasicMaterial objects (ghost spheres, Jupiter) ignore these lights.
  */
  scene.add(new THREE.HemisphereLight("#91aa91", "#020202", 0.58));

  const keyLight = new THREE.DirectionalLight("#dff5df", 0.72);
  keyLight.position.set(-2.5, 5.5, 3.5);
  scene.add(keyLight);

  const pointLight = new THREE.PointLight("#639464", 0.35, 6.5);
  pointLight.position.set(0, 2.5, 2.2);
  scene.add(pointLight);
}

// =============================================================
// COLLISION RESOLUTION
// =============================================================

export function resolveRigRoomCollision(position, { radius, rootOffsetX, rootOffsetZ }) {
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
  const nextPosition     = position.clone().addScaledVector(direction, distance);
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

export function isControlPositionValid(position, { radius, rootOffsetX, rootOffsetZ }) {
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
  const bounds   = getOutsideBounds(radius);

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
    { axis: "x", value: expanded.minX, distance: Math.abs(point.x - expanded.minX) },
    { axis: "x", value: expanded.maxX, distance: Math.abs(expanded.maxX - point.x) },
    { axis: "z", value: expanded.minZ, distance: Math.abs(point.y - expanded.minZ) },
    { axis: "z", value: expanded.maxZ, distance: Math.abs(expanded.maxZ - point.y) },
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
  const dx          = point.x - circle.centerX;
  const dz          = point.y - circle.centerZ;
  const minDistance = circle.radius + radius;
  const distance    = Math.hypot(dx, dz);

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

export function tickEncounterSystem(runtime, footprint, worldDebugView, sceneRefs) {
  /*
    Checks the avatar footprint against every encounter trigger.

    Actions fire only when inside/outside state changes:
      outside -> inside = onEnter
      inside -> outside = onExit

    sceneRefs = { audio, jupiter, defaultJupiterColor }
      Passed by main.js so encounter actions can affect scene objects without
      this module importing from main.js.
  */
  runtime.definitions.forEach((encounter) => {
    const isInside  = isFootprintInsideEncounter(footprint, encounter);
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
  const [width, depth]     = encounter.shape?.size   || [1, 1];

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
      console.info(`[encounter:${phase}] ${encounter.id}`, action.message || "");
      break;
    case "audio":
      applyEncounterAudioAction(action, sceneRefs.audio);
      break;
    case "jupiterColor":
      applySkyObjectColor(sceneRefs.jupiter, action.color || sceneRefs.defaultJupiterColor);
      break;
    case "jupiterScale":
      sceneRefs.jupiter.scale.setScalar(Number.isFinite(action.scale) ? action.scale : 1);
      break;
    default:
      console.warn("Unknown encounter action.", { encounter, action });
      break;
  }
}

function applySkyObjectColor(skyObject, color) {
  /*
    Encounter compatibility helper.

    Older builds used one Mesh named "jupiter", so encounter color actions could
    call jupiter.material.color directly. The sky object is now a moon.glb group,
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
  if (action.src && !audio.src.endsWith(action.src)) {
    audio.pause();
    audio.src = action.src;
    audio.load();
  }

  if (Number.isFinite(action.volume)) {
    audio.volume = THREE.MathUtils.clamp(action.volume, 0, 1);
  }

  if (Number.isFinite(action.playbackRate)) {
    audio.playbackRate = THREE.MathUtils.clamp(action.playbackRate, 0.5, 4);
  }

  if (typeof action.loop === "boolean") {
    audio.loop = action.loop;
  }

  if (action.pause) {
    audio.pause();
    return;
  }

  if (action.play) {
    audio.play().catch((error) => {
      console.info("Encounter audio is waiting for user interaction.", error);
    });
  }
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
  const wallColliders       = [];
  const treeColliders       = [];
  const outsideBounds       = [];
  const encounterZones      = [];
  const encounterLabels     = [];
  const encounterObjectsById = new Map();
  const lift = WORLD_TWEAKS.worldDebug.floorLift;

  group.name = "world-debug-overlay";
  group.renderOrder = 50;

  worldCollision.solidRects.forEach((rect, index) => {
    const mesh = makeDebugRectMesh(rect, WORLD_TWEAKS.worldDebug.wallColor, 0.28, lift);
    mesh.name = `debug-wall-collider-${index + 1}`;
    wallColliders.push(mesh);
    group.add(mesh);
  });

  worldCollision.solidCircles.forEach((circle, index) => {
    const mesh = makeDebugCircleMesh(
      circle.centerX, circle.centerZ, circle.radius,
      WORLD_TWEAKS.worldDebug.treeColor, 0.34, lift + 0.012,
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
    zone.userData.baseOpacity   = zone.material.opacity;
    zone.userData.activeOpacity = Math.min(zone.material.opacity + 0.26, 0.72);
    zone.userData.encounterId   = encounter.id;
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
      wallColliders.forEach((object)   => { object.visible = options.showWallColliders; });
      treeColliders.forEach((object)   => { object.visible = options.showTreeColliders; });
      outsideBounds.forEach((object)   => { object.visible = options.showOutsideBounds; });
      encounterZones.forEach((object)  => { object.visible = options.showEncounterZones; });
      encounterLabels.forEach((object) => {
        object.visible = options.showEncounterZones && options.showEncounterLabels;
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
  const width   = Math.max(0.001, rect.maxX - rect.minX);
  const depth   = Math.max(0.001, rect.maxZ - rect.minZ);
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
  const bounds    = getOutsideBounds(playerRadius);
  const thickness = 0.09;
  const y         = WORLD_TWEAKS.worldDebug.floorLift + 0.04;
  const color     = WORLD_TWEAKS.worldDebug.boundsColor;
  const opacity   = 0.42;

  return [
    makeDebugRectMesh(
      { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.minZ - thickness / 2, maxZ: bounds.minZ + thickness / 2 },
      color, opacity, y,
    ),
    makeDebugRectMesh(
      { minX: bounds.minX, maxX: bounds.maxX, minZ: bounds.maxZ - thickness / 2, maxZ: bounds.maxZ + thickness / 2 },
      color, opacity, y,
    ),
    makeDebugRectMesh(
      { minX: bounds.minX - thickness / 2, maxX: bounds.minX + thickness / 2, minZ: bounds.minZ, maxZ: bounds.maxZ },
      color, opacity, y,
    ),
    makeDebugRectMesh(
      { minX: bounds.maxX - thickness / 2, maxX: bounds.maxX + thickness / 2, minZ: bounds.minZ, maxZ: bounds.maxZ },
      color, opacity, y,
    ),
  ];
}

function makeEncounterDebugMesh(encounter, y) {
  const color = encounter.debugColor || WORLD_TWEAKS.worldDebug.encounterColor;

  if (encounter.shape?.type === "circle") {
    const [x, z] = encounter.shape.center || [0, 0];
    return makeDebugCircleMesh(x, z, encounter.shape.radius || 1, color, 0.22, y);
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
  const materials  = new Set();

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
  const canvas  = document.createElement("canvas");
  canvas.width  = 500;
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
    new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }),
  );
  sprite.scale.set(0.34 * options.scale, 0.085 * options.scale, 1);
  return sprite;
}
