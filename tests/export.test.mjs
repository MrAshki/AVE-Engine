import assert from 'node:assert/strict';
import test from 'node:test';
import { resultsToCsv } from '../src/benchmark/export.ts';

test('CSV export records the GLB baseline and selected render scale', () => {
  const csv = resultsToCsv([{
    schemaVersion: 1,
    id: 'car-baseline',
    timestamp: '2026-10-25T00:00:00.000Z',
    workload: 'car-concept',
    workloadConfig: {
      level: 'car-concept', label: 'Car Concept', description: 'Original GLB model baseline', seed: 0,
      instanceCount: 1, geometry: 'gltf', radialSegments: 0, tubularSegments: 0,
      assetUrl: '/models/CarConcept.glb',
    },
    qualityMode: 'high',
    finalQualityTier: 'high',
    warmupDurationMs: 5_000,
    sampleDurationMs: 20_000,
    sampleCount: 1,
    environment: {
      browser: 'test', renderer: 'test', graphicsApi: 'WebGL2', canvasWidth: 800, canvasHeight: 600,
      devicePixelRatio: 2, effectiveDpr: 1.5, renderScale: 0.75, gpuTimerSupported: true,
    },
    metrics: {
      averageFps: 60, averageFrameTimeMs: 16.67, p95FrameTimeMs: 17, onePercentLowFps: 55,
      averageCpuSubmitMs: 1, p95CpuSubmitMs: 2, averageGpuFrameMs: 5, p95GpuFrameMs: 6,
      gpuSampleCount: 1, drawCalls: 10, triangles: 1000,
    },
    autoDiagnostics: [],
  }]);

  assert.match(csv, /render_scale/);
  assert.match(csv, /car-concept/);
  assert.match(csv, /0\.75/);
});
