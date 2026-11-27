import * as THREE from '../../node_modules/three/build/three.module.js';

export function fishContact(body, scale) {
  const half = body.half.map((extent)=>extent*scale+.024);
  return {
    half, radius:Math.hypot(...half), shift:body.center*scale,
    center:new THREE.Vector3(), bounds:new THREE.Vector3(), axes:Array.from({length:3},()=>new THREE.Vector3()),
  };
}

const matrix = new THREE.Matrix4();

export function poseFishContact(contact, position, angles) {
  matrix.makeRotationFromEuler(angles);
  let x=0, y=0, z=0;
  for (let i=0; i<3; i++) {
    const axis=contact.axes[i].setFromMatrixColumn(matrix,i);
    const half=contact.half[i];
    x+=Math.abs(axis.x)*half;
    y+=Math.abs(axis.y)*half;
    z+=Math.abs(axis.z)*half;
  }
  contact.bounds.set(x,y,z);
  contact.center.copy(position).addScaledVector(contact.axes[0],contact.shift);
}

const difference = new THREE.Vector3();
const cross = new THREE.Vector3();

function separates(a, b, axis) {
  let extent=0;
  for (let i=0; i<3; i++) {
    extent+=a.half[i]*Math.abs(axis.dot(a.axes[i])) + b.half[i]*Math.abs(axis.dot(b.axes[i]));
  }
  return Math.abs(difference.dot(axis)) > extent;
}

export function fishContactsOverlap(a,b) {
  const range=a.radius+b.radius;
  difference.subVectors(b.center,a.center);
  if (difference.lengthSq() > range*range) return false;
  for (let i=0; i<3; i++) {
    if (separates(a,b,a.axes[i]) || separates(a,b,b.axes[i])) return false;
  }
  for (const axis of a.axes) {
    for (const other of b.axes) {
      cross.crossVectors(axis,other);
      if (cross.lengthSq() > 1e-8 && separates(a,b,cross)) return false;
    }
  }
  return true;
}
