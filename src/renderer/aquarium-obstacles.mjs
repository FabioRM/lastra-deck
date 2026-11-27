import * as THREE from '../../node_modules/three/build/three.module.js';

const CELL = 4;
const AXES = ['x', 'y', 'z'];
const key = (x, z) => x * 65536 + z;

function entryFraction(from, to, box, radius, height, depth) {
  let near = 0, far = 1;
  for (const axis of AXES) {
    const margin = axis === 'y' ? height : axis === 'z' ? depth : radius;
    const low = box.min[axis] - margin - from[axis];
    const high = box.max[axis] + margin - from[axis];
    const delta = to[axis] - from[axis];
    if (delta === 0) {
      if (low > 0 || high < 0) return Infinity;
      continue;
    }
    const entry = delta > 0 ? low : high;
    const exit = delta > 0 ? high : low;
    near = Math.max(near, entry / delta);
    far = Math.min(far, exit / delta);
    if (near > far) return Infinity;
  }
  return near;
}

export function aquariumObstacles() {
  const grid = new Map();
  const relative = new THREE.Matrix4(), world = new THREE.Matrix4();
  const bounds = new THREE.Box3(), combined = new THREE.Box3();
  let query = 0;

  function store(bounds) {
    if (bounds.isEmpty()) return;
    const entry = { box:bounds.clone(), visited:0 };
    for (let x = Math.floor(bounds.min.x / CELL); x <= Math.floor(bounds.max.x / CELL); x++) {
      for (let z = Math.floor(bounds.min.z / CELL); z <= Math.floor(bounds.max.z / CELL); z++) {
        const index = key(x,z);
        const bucket = grid.get(index);
        if (bucket) bucket.push(entry);
        else grid.set(index,[entry]);
      }
    }
  }

  function sweep(from,to,radius,height,depth,firstOnly) {
    // Keep a small gap at shared boundaries between adjacent pieces of scenery.
    radius+=.002;
    height+=.002;
    depth+=.002;
    const id=++query;
    const top=Math.floor((Math.max(from.z,to.z)+depth)/CELL);
    const first=Math.floor((Math.min(from.z,to.z)-depth)/CELL);
    const high=Math.max(from.y,to.y)+height, low=Math.min(from.y,to.y)-height;
    let nearest=Infinity;
    for (let x=Math.floor((Math.min(from.x,to.x)-radius)/CELL); x<=Math.floor((Math.max(from.x,to.x)+radius)/CELL); x++) {
      for (let z=first; z<=top; z++) {
        const bucket=grid.get(key(x,z));
        if (!bucket) continue;
        for (const entry of bucket) {
          if (entry.visited===id || entry.box.min.y>high || entry.box.max.y<low) continue;
          entry.visited=id;
          const hit=entryFraction(from,to,entry.box,radius,height,depth);
          if (hit===Infinity) continue;
          if (firstOnly || hit===0) return hit;
          nearest=Math.min(nearest,hit);
        }
      }
    }
    return nearest;
  }

  return {
    add(mesh, clusters) {
      if (!mesh) return;
      mesh.updateWorldMatrix(true,false);
      const shape = mesh.geometry;
      if (!shape.boundingBox) shape.computeBoundingBox();
      if (!mesh.isInstancedMesh) {
        store(bounds.copy(shape.boundingBox).applyMatrix4(mesh.matrixWorld));
        return;
      }
      function instance(index) {
        mesh.getMatrixAt(index,relative);
        world.multiplyMatrices(mesh.matrixWorld,relative);
        return bounds.copy(shape.boundingBox).applyMatrix4(world);
      }
      if (clusters) {
        for (const [start,end] of clusters) {
          combined.makeEmpty();
          for (let i=start; i<end; i++) combined.union(instance(i));
          store(combined);
        }
      } else for (let i=0; i<mesh.count; i++) store(instance(i));
    },
    clear(from, to, radius, height, depth = radius) {
      return sweep(from,to,radius,height,depth,true)===Infinity;
    },
    clearance(from,to,radius,height,depth=radius) {
      const hit=sweep(from,to,radius,height,depth,false);
      return hit===Infinity ? Infinity : hit*Math.hypot(to.x-from.x,to.y-from.y,to.z-from.z);
    },
  };
}
