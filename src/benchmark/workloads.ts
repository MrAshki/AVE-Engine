import * as THREE from 'three';
import type { WorkloadConfig, WorkloadLevel } from './types';

export const MAX_BENCHMARK_INSTANCES = 1600;

export const WORKLOADS: Record<WorkloadLevel, WorkloadConfig> = {
  light: {
    level: 'light', label: 'Light', description: '160 low-detail instances', seed: 1103,
    instanceCount: 160, geometry: 'icosahedron', radialSegments: 1, tubularSegments: 0,
  },
  medium: {
    level: 'medium', label: 'Medium', description: '640 moderate-detail instances', seed: 2909,
    instanceCount: 640, geometry: 'torus-knot', radialSegments: 72, tubularSegments: 8,
  },
  heavy: {
    level: 'heavy', label: 'Heavy', description: '1,400 high-detail instances', seed: 4721,
    instanceCount: 1400, geometry: 'torus-knot', radialSegments: 120, tubularSegments: 12,
  },
};

function seededRandom(seedValue: number): () => number {
  let seed = seedValue >>> 0;
  return () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

export function createWorkload(config: WorkloadConfig): THREE.InstancedMesh {
  const count = Math.min(MAX_BENCHMARK_INSTANCES, Math.max(1, config.instanceCount));
  const geometry = config.geometry === 'icosahedron'
    ? new THREE.IcosahedronGeometry(0.17, config.radialSegments)
    : new THREE.TorusKnotGeometry(0.13, 0.042, config.radialSegments, config.tubularSegments, 2, 3);
  const material = new THREE.MeshStandardMaterial({
    color: 0x9bcfff,
    roughness: 0.38,
    metalness: 0.54,
    vertexColors: true,
  });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  const random = seededRandom(config.seed);
  const transform = new THREE.Object3D();
  const color = new THREE.Color();

  for (let index = 0; index < count; index++) {
    const radius = 1.4 + Math.pow(random(), 0.7) * 4.8;
    const angle = random() * Math.PI * 2;
    const depth = (random() - 0.5) * 3.8;
    transform.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius * 0.64, depth);
    transform.rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    const scale = 0.58 + random() * 0.82;
    transform.scale.setScalar(scale);
    transform.updateMatrix();
    mesh.setMatrixAt(index, transform.matrix);
    color.setHSL(0.55 + random() * 0.08, 0.46, 0.48 + random() * 0.28);
    mesh.setColorAt(index, color);
  }

  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  mesh.name = `benchmark-${config.level}`;
  return mesh;
}
