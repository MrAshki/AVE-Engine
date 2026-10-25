import assert from 'node:assert/strict';
import test from 'node:test';
import { average, onePercentLowFps, percentile, summarizeSamples } from '../src/benchmark/statistics.ts';

test('Statistics ignore invalid input and calculate the nearest-rank percentile', () => {
  assert.equal(average([10, 20, Number.NaN, -1]), 15);
  assert.equal(percentile([30, 10, 20], 0.95), 30);
  assert.equal(onePercentLowFps([10, 20, 40]), 25);
});

test('Benchmark summary keeps CPU and GPU measurements separate', () => {
  const result = summarizeSamples([
    { frameIntervalMs: 10, cpuSubmitMs: 1, gpuFrameMs: 4, drawCalls: 2, triangles: 100 },
    { frameIntervalMs: 20, cpuSubmitMs: 3, gpuFrameMs: null, drawCalls: 2, triangles: 100 },
  ]);
  assert.equal(result.averageFrameTimeMs, 15);
  assert.equal(result.averageCpuSubmitMs, 2);
  assert.equal(result.averageGpuFrameMs, 4);
  assert.equal(result.gpuSampleCount, 1);
  assert.equal(result.drawCalls, 2);
  assert.equal(result.triangles, 100);
});

test('Unsupported GPU timing remains null', () => {
  const result = summarizeSamples([
    { frameIntervalMs: 16, cpuSubmitMs: 1, gpuFrameMs: null, drawCalls: 1, triangles: 80 },
  ]);
  assert.equal(result.averageGpuFrameMs, null);
  assert.equal(result.p95GpuFrameMs, null);
});
