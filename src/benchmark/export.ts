import type { BenchmarkResult } from './types';

function escapeCsv(value: string | number | boolean | null): string {
  if (value === null) return 'N/A';
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function resultsToCsv(results: readonly BenchmarkResult[]): string {
  const columns = [
    'timestamp', 'workload', 'instances', 'quality_mode', 'final_quality_tier', 'browser', 'renderer',
    'canvas_width', 'canvas_height', 'device_pixel_ratio', 'effective_dpr', 'render_scale', 'sample_count',
    'average_fps', 'average_frame_time_ms', 'p95_frame_time_ms', 'one_percent_low_fps',
    'average_cpu_submit_ms', 'p95_cpu_submit_ms', 'average_gpu_frame_ms', 'p95_gpu_frame_ms',
    'gpu_sample_count', 'draw_calls', 'triangles',
  ];
  const rows = results.map((result) => [
    result.timestamp, result.workload, result.workloadConfig.instanceCount, result.qualityMode,
    result.finalQualityTier, result.environment.browser, result.environment.renderer,
    result.environment.canvasWidth, result.environment.canvasHeight, result.environment.devicePixelRatio,
    result.environment.effectiveDpr, result.environment.renderScale, result.sampleCount, result.metrics.averageFps,
    result.metrics.averageFrameTimeMs, result.metrics.p95FrameTimeMs, result.metrics.onePercentLowFps,
    result.metrics.averageCpuSubmitMs, result.metrics.p95CpuSubmitMs, result.metrics.averageGpuFrameMs,
    result.metrics.p95GpuFrameMs, result.metrics.gpuSampleCount, result.metrics.drawCalls, result.metrics.triangles,
  ]);
  return [columns, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');
}

export function downloadResults(results: readonly BenchmarkResult[], format: 'json' | 'csv'): void {
  const text = format === 'json' ? JSON.stringify({ schemaVersion: 1, results }, null, 2) : resultsToCsv(results);
  const blob = new Blob([text], { type: format === 'json' ? 'application/json' : 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `ave-benchmark-${new Date().toISOString().replaceAll(':', '-')}.${format}`;
  link.click();
  URL.revokeObjectURL(url);
}
