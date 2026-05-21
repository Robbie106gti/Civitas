import * as THREE from 'three';

export function clientToNdc(clientX: number, clientY: number, rect: DOMRect): THREE.Vector2 {
  const x = ((clientX - rect.left) / rect.width) * 2 - 1;
  const y = -((clientY - rect.top) / rect.height) * 2 + 1;
  return new THREE.Vector2(x, y);
}
