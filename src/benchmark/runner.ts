import type { QualityMode } from '../engine/quality';
import type { FrameSample, WorkloadLevel } from './types';

export const WARMUP_DURATION_MS = 5_000;
export const SAMPLE_DURATION_MS = 20_000;

export type RunnerPhase = 'idle' | 'warmup' | 'collecting';

export type BenchmarkPlan = {
  workload: WorkloadLevel;
  qualityMode: QualityMode;
};

export type RunnerProgress = {
  phase: RunnerPhase;
  plan: BenchmarkPlan | null;
  planIndex: number;
  planCount: number;
  elapsedMs: number;
  durationMs: number;
};

type RunnerCallbacks = {
  onPlanStart: (plan: BenchmarkPlan) => void;
  onSamplingStart: (plan: BenchmarkPlan) => void;
  onProgress: (progress: RunnerProgress) => void;
  onPlanComplete: (plan: BenchmarkPlan, samples: readonly FrameSample[]) => void;
  onRunComplete: () => void;
};

export class BenchmarkRunner {
  private plans: BenchmarkPlan[] = [];
  private planIndex = 0;
  private phase: RunnerPhase = 'idle';
  private phaseStartedAt = 0;
  private samples: FrameSample[] = [];

  constructor(private readonly callbacks: RunnerCallbacks) {}

  get isActive(): boolean { return this.phase !== 'idle'; }
  get currentPhase(): RunnerPhase { return this.phase; }

  start(plans: readonly BenchmarkPlan[], now = performance.now()): void {
    if (plans.length === 0) throw new Error('A benchmark plan is required.');
    if (this.isActive) this.stop();
    this.plans = [...plans];
    this.planIndex = 0;
    this.startPlan(now);
  }

  ingest(sample: FrameSample, now: number): void {
    if (!this.isActive) return;
    const duration = this.phase === 'warmup' ? WARMUP_DURATION_MS : SAMPLE_DURATION_MS;
    const elapsed = now - this.phaseStartedAt;
    if (this.phase === 'warmup' && elapsed >= WARMUP_DURATION_MS) {
      this.phase = 'collecting';
      this.phaseStartedAt = now;
      this.samples = [];
      const plan = this.plans[this.planIndex];
      if (plan) this.callbacks.onSamplingStart(plan);
      this.emitProgress(0, SAMPLE_DURATION_MS);
      return;
    }
    if (this.phase === 'collecting') {
      this.samples.push(sample);
      if (elapsed >= SAMPLE_DURATION_MS) {
        const plan = this.plans[this.planIndex];
        if (plan) this.callbacks.onPlanComplete(plan, [...this.samples]);
        this.planIndex++;
        if (this.planIndex < this.plans.length) this.startPlan(now);
        else this.finish();
        return;
      }
    }
    this.emitProgress(Math.min(duration, elapsed), duration);
  }

  stop(): void {
    this.plans = [];
    this.samples = [];
    this.phase = 'idle';
    this.phaseStartedAt = 0;
    this.callbacks.onProgress({ phase: 'idle', plan: null, planIndex: 0, planCount: 0, elapsedMs: 0, durationMs: 0 });
  }

  private startPlan(now: number): void {
    const plan = this.plans[this.planIndex];
    if (!plan) return;
    this.phase = 'warmup';
    this.phaseStartedAt = now;
    this.samples = [];
    this.callbacks.onPlanStart(plan);
    this.emitProgress(0, WARMUP_DURATION_MS);
  }

  private finish(): void {
    this.stop();
    this.callbacks.onRunComplete();
  }

  private emitProgress(elapsedMs: number, durationMs: number): void {
    this.callbacks.onProgress({
      phase: this.phase,
      plan: this.plans[this.planIndex] ?? null,
      planIndex: this.planIndex,
      planCount: this.plans.length,
      elapsedMs,
      durationMs,
    });
  }
}
