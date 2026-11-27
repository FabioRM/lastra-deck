import * as THREE from '../../node_modules/three/build/three.module.js';
import { decorationCoordinates } from './aquarium-decorations.mjs';

export function makeAquariumPreviewCamera(canvas, camera, target, decorations, width, floorAt) {
  const offset = new THREE.Spherical().setFromVector3(camera.position.clone().sub(target));
  const indices = new Map(decorations.map((object, index) => [object, index]));
  const ray = new THREE.Raycaster();
  const cursor = new THREE.Vector2();
  const projected = new THREE.Vector3();
  const ground = new THREE.Plane(new THREE.Vector3(0, 1, 0));
  const point = new THREE.Vector3();
  const box = new THREE.Box3();

  function setView({ yaw, pitch, zoom }) {
    camera.position.setFromSphericalCoords(offset.radius, offset.phi - pitch, offset.theta + yaw).add(target);
    camera.lookAt(target);
    camera.updateMatrixWorld();
    if (camera.zoom !== zoom) {
      camera.zoom = zoom;
      camera.updateProjectionMatrix();
    }
  }

  function screenPoint(clientX, clientY, frame) {
    cursor.set((clientX - frame.left) / frame.width * 2 - 1, 1 - (clientY - frame.top) / frame.height * 2);
  }

  function nearbyDecoration(frame, padding) {
    let best = padding * padding;
    let index = -1;
    for (const [candidate, object] of decorations.entries()) {
      box.setFromObject(object).getCenter(projected).project(camera);
      if (projected.z < -1 || projected.z > 1) continue;
      const dx = (cursor.x - projected.x) * frame.width / 2;
      const dy = (cursor.y - projected.y) * frame.height / 2;
      const distance = dx * dx + dy * dy;
      if (distance < best) {
        best = distance;
        index = candidate;
      }
    }
    return index;
  }

  function pick(clientX, clientY, padding) {
    const frame = canvas.getBoundingClientRect();
    if (!frame.width || !frame.height) return null;
    for (const object of decorations) object.updateWorldMatrix(true, true);
    screenPoint(clientX, clientY, frame);
    ray.setFromCamera(cursor, camera);
    const [hit] = ray.intersectObjects(decorations, true);
    let object = hit?.object;
    while (object && !indices.has(object)) object = object.parent;
    const index = object ? indices.get(object) : nearbyDecoration(frame, padding);
    if (index < 0) return null;
    const base = decorations[index].position;
    projected.copy(base).project(camera);
    // Keep the original grab point relative to the footprint, even when the user clicks a tall object.
    return { index, height: base.y, offsetX: cursor.x - projected.x, offsetY: cursor.y - projected.y };
  }

  function heightAboveSand(distance) {
    ray.ray.at(distance, point);
    return point.y - floorAt(point.x, point.z);
  }

  function intersectSand(distance) {
    const height = heightAboveSand(distance);
    if (Math.abs(height) < .001) return distance;
    const increment = Math.sign(height) * .20;
    const samples = Math.ceil(Math.min(30, 2 / -ray.ray.direction.y) / Math.abs(increment));
    let previous = distance;
    // Follow the crossing near the last placement height so shallow views can handle uneven sand.
    for (let sample = 1; sample <= samples; sample++) {
      let next = distance + increment * sample;
      if (next < 0) break;
      if (heightAboveSand(next) * height <= 0) {
        for (let refinement = 0; refinement < 9; refinement++) {
          const middle = (previous + next) / 2;
          if (heightAboveSand(middle) * height > 0) previous = middle;
          else next = middle;
        }
        return (previous + next) / 2;
      }
      previous = next;
    }
    return distance;
  }

  function placement(grab, clientX, clientY) {
    const frame = canvas.getBoundingClientRect();
    if (!frame.width || !frame.height) return null;
    screenPoint(clientX, clientY, frame);
    cursor.x -= grab.offsetX;
    cursor.y -= grab.offsetY;
    ray.setFromCamera(cursor, camera);
    if (ray.ray.direction.y > -.035) return null;
    ground.constant = -grab.height;
    const distance = ray.ray.distanceToPlane(ground);
    if (distance === null) return null;
    ray.ray.at(intersectSand(distance), point);
    const coordinates = decorationCoordinates(point.x, point.z, width);
    if (Math.abs(coordinates.x) < 100 && coordinates.depth > 0 && coordinates.depth < 100) {
      grab.height = floorAt(point.x, point.z);
    }
    return coordinates;
  }

  return { setView, pick, placement };
}
