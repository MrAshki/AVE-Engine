import type { BenchmarkMetrics, FrameSample } from './types';

function finiteValues(values: readonly number[]): number[] {
  return values.filter((value) => Number.isFinite(value) && value >= 0);
}

export function average(values: readonly number[]): number {
  const valid = finiteValues(values);
  if (valid.length === 0) return 0;
  return valid.reduce((sum, value) => sum + value, 0) / valid.length;
}

export function percentile(values: readonly number[], percentileValue: number): number {
  const valid = finiteValues(values).sort((left, right) => left - right);
  if (valid.length === 0) return 0;
  const bounded = Math.min(1, Math.max(0, percentileValue));
  const index = Math.min(valid.length - 1, Math.ceil(bounded * valid.length) - 1);
  return valid[Math.max(0, index)] ?? 0;
}

export function onePercentLowFps(frameIntervalsMs: readonly number[]): number {
  const valid = finiteValues(frameIntervalsMs).filter((value) => value > 0).sort((left, right) => right - left);
  if (valid.length === 0) return 0;
  const worstCount = Math.max(1, Math.ceil(valid.length * 0.01));
  const worstAverage = average(valid.slice(0, worstCount));
  return worstAverage > 0 ? 1000 / worstAverage : 0;
}

export function summarizeSamples(samples: readonly FrameSample[]): BenchmarkMetrics {
  const frameIntervals = samples.map((sample) => sample.frameIntervalMs).filter((value) => value > 0);
  const cpuTimes = samples.map((sample) => sample.cpuSubmitMs);
  const gpuTimes = samples
    .map((sample) => sample.gpuFrameMs)
    .filter((value): value is number => value !== null && Number.isFinite(value) && value >= 0);
  const averageFrameTimeMs = average(frameIntervals);

  return {
    averageFps: averageFrameTimeMs > 0 ? 1000 / averageFrameTimeMs : 0,
    averageFrameTimeMs,
    p95FrameTimeMs: percentile(frameIntervals, 0.95),
    onePercentLowFps: onePercentLowFps(frameIntervals),
    averageCpuSubmitMs: average(cpuTimes),
    p95CpuSubmitMs: percentile(cpuTimes, 0.95),
    averageGpuFrameMs: gpuTimes.length > 0 ? average(gpuTimes) : null,
    p95GpuFrameMs: gpuTimes.length > 0 ? percentile(gpuTimes, 0.95) : null,
    gpuSampleCount: gpuTimes.length,
    drawCalls: Math.max(0, ...samples.map((sample) => sample.drawCalls)),
    triangles: Math.max(0, ...samples.map((sample) => sample.triangles)),
  };
}
