import * as THREE from "three";

export function isWalkableTerrainHit(hit) {
  if (!hit?.face || hit.object?.userData?.walkable !== true) {
    return false;
  }

  const normalMatrix = new THREE.Matrix3().getNormalMatrix(
    hit.object.matrixWorld,
  );
  const worldNormal = hit.face.normal
    .clone()
    .applyMatrix3(normalMatrix)
    .normalize();
  const minWalkableNormalY = hit.object.userData.minWalkableNormalY ?? 0.5;

  return worldNormal.y >= minWalkableNormalY;
}
