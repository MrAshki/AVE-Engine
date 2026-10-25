import type { QualityMode, QualityTier } from '../engine/quality';

export type WorkloadLevel = 'light' | 'medium' | 'heavy';

export type WorkloadConfig = {
  level: WorkloadLevel;
  label: string;
  description: string;
  seed: number;
  instanceCount: number;
  geometry: 'icosahedron' | 'torus-knot';
  radialSegments: number;
  tubularSegments: number;
};

export type FrameSample = {
  frameIntervalMs: number;
  cpuSubmitMs: number;
  gpuFrameMs: number | null;
  drawCalls: number;
  triangles: number;
};

export type LiveBenchmarkStats = FrameSample & {
  fps: number;
  canvasWidth: number;
  canvasHeight: number;
  effectiveDpr: number;
  qualityMode: QualityMode;
  qualityTier: QualityTier;
  workload: WorkloadLevel;
  gpuTimerSupported: boolean;
  pendingGpuQueries: number;
};

export type BenchmarkMetrics = {
  averageFps: number;
  averageFrameTimeMs: number;
  p95FrameTimeMs: number;
  onePercentLowFps: number;
  averageCpuSubmitMs: number;
  p95CpuSubmitMs: number;
  averageGpuFrameMs: number | null;
  p95GpuFrameMs: number | null;
  gpuSampleCount: number;
  drawCalls: number;
  triangles: number;
};

export type BenchmarkEnvironment = {
  browser: string;
  renderer: string;
  graphicsApi: 'WebGL2';
  canvasWidth: number;
  canvasHeight: number;
  devicePixelRatio: number;
  effectiveDpr: number;
  gpuTimerSupported: boolean;
};

export type BenchmarkResult = {
  schemaVersion: 1;
  id: string;
  timestamp: string;
  workload: WorkloadLevel;
  workloadConfig: WorkloadConfig;
  qualityMode: QualityMode;
  finalQualityTier: QualityTier;
  warmupDurationMs: number;
  sampleDurationMs: number;
  sampleCount: number;
  environment: BenchmarkEnvironment;
  metrics: BenchmarkMetrics;
  autoDiagnostics: string[];
};
