import { BenchmarkEngine } from './benchmark/engine';
import { downloadResults } from './benchmark/export';
import { BenchmarkRunner, SAMPLE_DURATION_MS, WARMUP_DURATION_MS, type BenchmarkPlan, type RunnerProgress } from './benchmark/runner';
import { summarizeSamples } from './benchmark/statistics';
import type { BenchmarkResult, LiveBenchmarkStats, WorkloadLevel } from './benchmark/types';
import { WORKLOADS } from './benchmark/workloads';
import { VisualEngine, type RenderStats } from './engine/scene';
import type { QualityMode } from './engine/quality';

const heroCanvas = document.querySelector<HTMLCanvasElement>('#scene-canvas');
const heroHost = document.querySelector<HTMLElement>('#visual-viewport');
const tierLabel = document.querySelector<HTMLElement>('#active-tier');
const heroButtons = document.querySelectorAll<HTMLButtonElement>('.mode-button');
const warning = document.querySelector<HTMLElement>('#metrics-warning');

function renderHeroStats(stats: RenderStats): void {
  if (tierLabel) tierLabel.textContent = stats.tier.toUpperCase();
}

function setHeroModeUI(mode: QualityMode): void {
  heroButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

const supportsWebGL2 = (() => {
  try { return Boolean(document.createElement('canvas').getContext('webgl2')); }
  catch { return false; }
})();

let heroEngine: VisualEngine | null = null;
if (heroCanvas && heroHost && supportsWebGL2) {
  try {
    heroEngine = new VisualEngine(heroCanvas, heroHost, renderHeroStats);
    heroHost.classList.add('scene-ready');
  } catch (error) {
    console.error('AVE Hero renderer initialization failed:', error);
  }
}

if (!heroEngine) {
  if (warning) warning.textContent = 'WebGL2 is unavailable. The vector interface remains operational, but benchmarks cannot run.';
  if (tierLabel) tierLabel.textContent = 'STATIC';
  heroButtons.forEach((button) => { button.disabled = true; });
}

heroButtons.forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode as QualityMode | undefined;
    if (!mode || !heroEngine) return;
    heroEngine.setMode(mode);
    setHeroModeUI(mode);
  });
});

const benchmarkCanvas = document.querySelector<HTMLCanvasElement>('#benchmark-canvas');
const benchmarkHost = document.querySelector<HTMLElement>('#benchmark-viewport');
const workloadSelect = document.querySelector<HTMLSelectElement>('#workload-select');
const qualitySelect = document.querySelector<HTMLSelectElement>('#benchmark-quality-select');
const startButton = document.querySelector<HTMLButtonElement>('#benchmark-start');
const compareButton = document.querySelector<HTMLButtonElement>('#benchmark-compare');
const stopButton = document.querySelector<HTMLButtonElement>('#benchmark-stop');
const exportJsonButton = document.querySelector<HTMLButtonElement>('#export-json');
const exportCsvButton = document.querySelector<HTMLButtonElement>('#export-csv');
const progress = document.querySelector<HTMLProgressElement>('#benchmark-progress');
const phaseLabel = document.querySelector<HTMLElement>('#benchmark-phase');
const countdownLabel = document.querySelector<HTMLElement>('#benchmark-countdown');
const autoDiagnosticLabel = document.querySelector<HTMLElement>('#auto-diagnostic');
const sceneLabel = document.querySelector<HTMLElement>('#benchmark-scene-label');
const resultsBody = document.querySelector<HTMLTableSectionElement>('#results-body');
const fpsLabel = document.querySelector<HTMLElement>('#metric-fps');
const frameLabel = document.querySelector<HTMLElement>('#metric-frame');
const cpuLabel = document.querySelector<HTMLElement>('#metric-cpu');
const gpuLabel = document.querySelector<HTMLElement>('#metric-gpu');
const gpuNote = document.querySelector<HTMLElement>('#metric-gpu-note');
const drawLabel = document.querySelector<HTMLElement>('#metric-draws');
const trianglesLabel = document.querySelector<HTMLElement>('#metric-triangles');
const resolutionLabel = document.querySelector<HTMLElement>('#metric-resolution');
const dprLabel = document.querySelector<HTMLElement>('#metric-dpr');
const metricTierLabel = document.querySelector<HTMLElement>('#metric-tier');
const workloadLabel = document.querySelector<HTMLElement>('#metric-workload');

const results: BenchmarkResult[] = [];
let labEngine: BenchmarkEngine | null = null;
let runner: BenchmarkRunner | null = null;
let selectedQualityBeforeRun: QualityMode = 'balanced';
let activeDiagnostics: string[] = [];

function formatNumber(value: number | null, digits = 1): string {
  return value === null || !Number.isFinite(value) ? 'N/A' : value.toFixed(digits);
}

function renderLiveStats(stats: LiveBenchmarkStats): void {
  if (fpsLabel) fpsLabel.textContent = formatNumber(stats.fps, 0);
  if (frameLabel) frameLabel.textContent = `${formatNumber(stats.frameIntervalMs)} MS`;
  if (cpuLabel) cpuLabel.textContent = `${formatNumber(stats.cpuSubmitMs, 2)} MS`;
  if (gpuLabel) gpuLabel.textContent = stats.gpuTimerSupported
    ? (stats.gpuFrameMs === null ? 'PENDING' : `${formatNumber(stats.gpuFrameMs, 2)} MS`)
    : 'N/A';
  if (gpuNote) gpuNote.textContent = stats.gpuTimerSupported
    ? `ASYNC TIMER / ${stats.pendingGpuQueries} PENDING`
    : 'EXTENSION UNSUPPORTED';
  if (drawLabel) drawLabel.textContent = stats.drawCalls.toLocaleString();
  if (trianglesLabel) trianglesLabel.textContent = stats.triangles.toLocaleString();
  if (resolutionLabel) resolutionLabel.textContent = `${stats.canvasWidth} × ${stats.canvasHeight}`;
  if (dprLabel) dprLabel.textContent = `BUFFER / ${stats.effectiveDpr.toFixed(2)}× DPR`;
  if (metricTierLabel) metricTierLabel.textContent = stats.qualityTier.toUpperCase();
  if (workloadLabel) workloadLabel.textContent = `${stats.workload.toUpperCase()} / ${stats.qualityMode.toUpperCase()} MODE`;
}

function setControlsRunning(running: boolean): void {
  if (workloadSelect) workloadSelect.disabled = running;
  if (qualitySelect) qualitySelect.disabled = running;
  if (startButton) startButton.disabled = running;
  if (compareButton) compareButton.disabled = running;
  if (stopButton) stopButton.disabled = !running;
}

function updateProgress(state: RunnerProgress): void {
  if (!progress || !phaseLabel || !countdownLabel) return;
  if (state.phase === 'idle' || !state.plan) {
    progress.value = 0;
    phaseLabel.textContent = 'READY';
    countdownLabel.textContent = '25.0 S PER PRESET';
    return;
  }
  progress.value = state.durationMs > 0 ? state.elapsedMs / state.durationMs : 0;
  const remaining = Math.max(0, state.durationMs - state.elapsedMs) / 1000;
  const run = state.planCount > 1 ? ` ${state.planIndex + 1}/${state.planCount}` : '';
  phaseLabel.textContent = `${state.phase === 'warmup' ? 'WARM-UP' : 'SAMPLING'}${run} / ${state.plan.qualityMode.toUpperCase()}`;
  countdownLabel.textContent = `${remaining.toFixed(1)} S`;
}

function renderResults(): void {
  if (!resultsBody) return;
  resultsBody.replaceChildren();
  if (results.length === 0) {
    const row = resultsBody.insertRow();
    row.className = 'empty-result';
    const cell = row.insertCell();
    cell.colSpan = 10;
    cell.textContent = 'NO COMPLETED RUNS IN THIS SESSION';
  } else {
    for (const result of results) {
      const row = resultsBody.insertRow();
      const gpu = result.metrics.averageGpuFrameMs === null ? 'N/A' : `${formatNumber(result.metrics.averageGpuFrameMs, 2)} ms`;
      const values = [
        result.qualityMode === 'auto' ? `Auto → ${result.finalQualityTier}` : result.qualityMode,
        result.workload,
        formatNumber(result.metrics.averageFps),
        `${formatNumber(result.metrics.averageFrameTimeMs)} ms`,
        `${formatNumber(result.metrics.p95FrameTimeMs)} ms`,
        `${formatNumber(result.metrics.onePercentLowFps)} FPS`,
        `${formatNumber(result.metrics.averageCpuSubmitMs, 2)} ms`,
        gpu,
        result.metrics.drawCalls.toLocaleString(),
        result.metrics.triangles.toLocaleString(),
      ];
      for (const value of values) row.insertCell().textContent = value.toUpperCase();
    }
  }
  const hasResults = results.length > 0;
  if (exportJsonButton) exportJsonButton.disabled = !hasResults;
  if (exportCsvButton) exportCsvButton.disabled = !hasResults;
}

function deactivateBenchmark(message: string): void {
  labEngine?.setBenchmarkActive(false);
  heroEngine?.setBenchmarkActive(false);
  setControlsRunning(false);
  if (qualitySelect && labEngine) {
    qualitySelect.value = selectedQualityBeforeRun;
    labEngine.setQualityMode(selectedQualityBeforeRun);
  }
  if (warning) warning.textContent = message;
}

function startPlans(plans: BenchmarkPlan[]): void {
  if (!runner || !labEngine || runner.isActive) return;
  selectedQualityBeforeRun = (qualitySelect?.value ?? 'balanced') as QualityMode;
  setControlsRunning(true);
  heroEngine?.setBenchmarkActive(true);
  labEngine.setBenchmarkActive(true);
  if (warning) warning.textContent = 'Benchmark active. Keep this tab visible and avoid other work until sampling is complete.';
  runner.start(plans);
}

if (benchmarkCanvas && benchmarkHost && supportsWebGL2) {
  try {
    labEngine = new BenchmarkEngine(
      benchmarkCanvas,
      benchmarkHost,
      renderLiveStats,
      (message) => {
        if (autoDiagnosticLabel) autoDiagnosticLabel.textContent = message;
        if (runner?.isActive && !activeDiagnostics.includes(message)) activeDiagnostics.push(message);
      },
    );
    labEngine.setQualityMode((qualitySelect?.value ?? 'balanced') as QualityMode);

    runner = new BenchmarkRunner({
      onPlanStart: (plan) => {
        activeDiagnostics = [];
        labEngine?.setWorkload(plan.workload);
        labEngine?.setQualityMode(plan.qualityMode);
        if (qualitySelect) qualitySelect.value = plan.qualityMode;
      },
      onSamplingStart: () => labEngine?.resetMeasurementQueries(),
      onProgress: updateProgress,
      onPlanComplete: (plan, samples) => {
        if (!labEngine || samples.length === 0) return;
        const environment = labEngine.getEnvironment();
        results.push({
          schemaVersion: 1,
          id: `${Date.now()}-${plan.workload}-${plan.qualityMode}`,
          timestamp: new Date().toISOString(),
          workload: plan.workload,
          workloadConfig: labEngine.currentWorkloadConfig,
          qualityMode: plan.qualityMode,
          finalQualityTier: labEngine.quality.currentTier,
          warmupDurationMs: WARMUP_DURATION_MS,
          sampleDurationMs: SAMPLE_DURATION_MS,
          sampleCount: samples.length,
          environment,
          metrics: summarizeSamples(samples),
          autoDiagnostics: [...activeDiagnostics],
        });
        renderResults();
      },
      onRunComplete: () => deactivateBenchmark('Benchmark complete. Results are ready for comparison or export.'),
    });
    labEngine.setFrameObserver((sample, timestamp) => runner?.ingest(sample, timestamp));
  } catch (error) {
    console.error('AVE benchmark renderer initialization failed:', error);
    if (warning) warning.textContent = 'The benchmark renderer could not start. The Hero remains operational.';
  }
}

if (!labEngine) {
  [workloadSelect, qualitySelect, startButton, compareButton, stopButton].forEach((control) => {
    if (control) control.disabled = true;
  });
  if (gpuLabel) gpuLabel.textContent = 'N/A';
  if (gpuNote) gpuNote.textContent = 'WEBGL2 UNAVAILABLE';
}

workloadSelect?.addEventListener('change', () => {
  const workload = workloadSelect.value as WorkloadLevel;
  labEngine?.setWorkload(workload);
  const config = WORKLOADS[workload];
  if (sceneLabel) sceneLabel.textContent = `${config.label.toUpperCase()} / ${config.instanceCount.toLocaleString()} INSTANCES`;
});

qualitySelect?.addEventListener('change', () => labEngine?.setQualityMode(qualitySelect.value as QualityMode));

startButton?.addEventListener('click', () => {
  const workload = (workloadSelect?.value ?? 'medium') as WorkloadLevel;
  const qualityMode = (qualitySelect?.value ?? 'balanced') as QualityMode;
  startPlans([{ workload, qualityMode }]);
});

compareButton?.addEventListener('click', () => {
  const workload = (workloadSelect?.value ?? 'medium') as WorkloadLevel;
  startPlans(['high', 'balanced', 'eco'].map((qualityMode) => ({ workload, qualityMode } as BenchmarkPlan)));
});

stopButton?.addEventListener('click', () => {
  runner?.stop();
  deactivateBenchmark('Benchmark stopped. Partial samples were discarded.');
});

exportJsonButton?.addEventListener('click', () => downloadResults(results, 'json'));
exportCsvButton?.addEventListener('click', () => downloadResults(results, 'csv'));

window.addEventListener('pagehide', () => {
  runner?.stop();
  labEngine?.dispose();
  heroEngine?.dispose();
}, { once: true });
