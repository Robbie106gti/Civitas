import * as THREE from 'three';

/**
 * BWSB stores triangle soup (3 floats per corner). Merged BoxGeometry is indexed;
 * expand before bake / after merge so decode does not stitch unrelated vertices.
 */
export function positionsFromBufferGeometry(geometry: THREE.BufferGeometry): Float32Array {
  const expanded = geometry.index != null ? geometry.toNonIndexed() : geometry;
  const posAttr = expanded.getAttribute('position');
  const positions = new Float32Array(posAttr.count * 3);
  positions.set(posAttr.array as Float32Array);
  if (expanded !== geometry) expanded.dispose();
  return positions;
}
