import * as THREE from 'three';
import { QUALITY_SETTINGS, QualityController, type QualityMode } from '../engine/quality';
import { GpuTimer } from './gpu-timer';
import type { BenchmarkEnvironment, FrameSample, LiveBenchmarkStats, WorkloadConfig, WorkloadLevel } from './types';
import { createWorkload, WORKLOADS } from './workloads';

type FrameObserver = (sample: FrameSample, timestamp: number) => void;

export class BenchmarkEngine {
  readonly quality = new QualityController();
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(42, 1, 0.1, 80);
  private readonly stage = new THREE.Group();
  private readonly timer: GpuTimer;
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private workloadMesh: THREE.InstancedMesh;
  private workload: WorkloadLevel = 'medium';
  private frameObserver: FrameObserver | null = null;
  private animationFrame = 0;
  private previousFrame = 0;
  private frameCount = 0;
  private fpsMeasureStart = 0;
  private active = false;
  private disposed = false;
  private lastLiveUpdate = 0;
  private lastAutoDiagnostic = this.quality.currentDiagnostic;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly host: HTMLElement,
    private readonly onLiveStats: (stats: LiveBenchmarkStats) => void,
    private readonly onDiagnostic: (message: string) => void,
  ) {
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: false,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.setClearColor(0x090e15, 1);
    this.timer = new GpuTimer(this.renderer.getContext() as WebGL2RenderingContext);
    this.camera.position.set(0, 0, 10.5);
    this.scene.add(this.stage);
    this.scene.add(new THREE.HemisphereLight(0xbadfff, 0x111728, 1.55));
    const key = new THREE.DirectionalLight(0xaed9ff, 3.2);
    key.position.set(-4, 5, 7);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x6c70ff, 42, 28, 1.6);
    rim.position.set(4, -2, 4);
    this.scene.add(rim);

    this.workloadMesh = createWorkload(WORKLOADS[this.workload]);
    this.stage.add(this.workloadMesh);
    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    document.addEventListener('visibilitychange', this.onVisibilityChange);
    this.reducedMotion.addEventListener('change', this.onMotionChange);
    this.resize();
    this.renderOnce(performance.now());
    this.resume();
  }

  get currentWorkload(): WorkloadLevel { return this.workload; }
  get currentWorkloadConfig(): WorkloadConfig { return { ...WORKLOADS[this.workload] }; }
  get gpuTimerSupported(): boolean { return this.timer.supported; }
  get currentDiagnostic(): string { return this.quality.currentDiagnostic; }

  setFrameObserver(observer: FrameObserver | null): void { this.frameObserver = observer; }

  resetMeasurementQueries(): void { this.timer.reset(); }

  setBenchmarkActive(active: boolean): void {
    this.active = active;
    this.previousFrame = 0;
    this.frameCount = 0;
    this.fpsMeasureStart = performance.now();
    if (!active) this.timer.reset();
    this.resume();
  }

  setWorkload(level: WorkloadLevel): void {
    if (level === this.workload || !WORKLOADS[level]) return;
    this.timer.reset();
    this.stage.remove(this.workloadMesh);
    this.workloadMesh.geometry.dispose();
    const materials = Array.isArray(this.workloadMesh.material) ? this.workloadMesh.material : [this.workloadMesh.material];
    for (const material of materials) material.dispose();
    this.workload = level;
    this.workloadMesh = createWorkload(WORKLOADS[level]);
    this.stage.add(this.workloadMesh);
    this.renderOnce(performance.now());
  }

  setQualityMode(mode: QualityMode): void {
    this.timer.reset();
    this.quality.setMode(mode);
    this.lastAutoDiagnostic = this.quality.currentDiagnostic;
    this.onDiagnostic(this.lastAutoDiagnostic);
    this.resize();
    this.renderOnce(performance.now());
  }

  getEnvironment(): BenchmarkEnvironment {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info') as { UNMASKED_RENDERER_WEBGL: number } | null;
    const renderer = debugInfo
      ? String(gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL))
      : String(gl.getParameter(gl.RENDERER));
    const clientWidth = Math.max(1, this.canvas.clientWidth);
    return {
      browser: navigator.userAgent,
      renderer,
      graphicsApi: 'WebGL2',
      canvasWidth: this.canvas.width,
      canvasHeight: this.canvas.height,
      devicePixelRatio: window.devicePixelRatio || 1,
      effectiveDpr: this.canvas.width / clientWidth,
      gpuTimerSupported: this.timer.supported,
    };
  }

  private onVisibilityChange = () => {
    if (document.hidden) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = 0;
      this.timer.reset();
    } else {
      this.previousFrame = 0;
      this.resume();
    }
  };

  private onMotionChange = () => {
    cancelAnimationFrame(this.animationFrame);
    this.animationFrame = 0;
    this.resume();
  };

  private resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, Math.round(this.host.clientWidth));
    const height = Math.max(1, Math.round(this.host.clientHeight));
    const cap = QUALITY_SETTINGS[this.quality.currentTier].dprCap;
    const ratio = Math.min(window.devicePixelRatio || 1, cap);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
  }

  private resume(): void {
    if (this.disposed || document.hidden) return;
    if (this.reducedMotion.matches && !this.active) {
      this.renderOnce(performance.now());
      return;
    }
    if (!this.animationFrame) this.animationFrame = requestAnimationFrame(this.frame);
  }

  private frame = (now: number): void => {
    this.animationFrame = 0;
    if (this.disposed || document.hidden) return;
    const frameIntervalMs = this.previousFrame > 0 ? now - this.previousFrame : 0;
    this.previousFrame = now;
    const sample = this.renderOnce(now, frameIntervalMs);

    if (this.active && frameIntervalMs > 0) this.frameObserver?.(sample, now);
    this.updateAutoQuality(now, frameIntervalMs);
    if (now - this.lastLiveUpdate >= 250 && frameIntervalMs > 0) {
      this.lastLiveUpdate = now;
      this.onLiveStats({
        ...sample,
        fps: 1000 / frameIntervalMs,
        canvasWidth: this.canvas.width,
        canvasHeight: this.canvas.height,
        effectiveDpr: this.canvas.width / Math.max(1, this.canvas.clientWidth),
        qualityMode: this.quality.currentMode,
        qualityTier: this.quality.currentTier,
        workload: this.workload,
        gpuTimerSupported: this.timer.supported,
        pendingGpuQueries: this.timer.pendingCount,
      });
    }
    this.resume();
  };

  private renderOnce(now: number, frameIntervalMs = 0): FrameSample {
    const elapsed = now / 1000;
    this.stage.rotation.y = elapsed * 0.16;
    this.stage.rotation.x = Math.sin(elapsed * 0.23) * 0.12;
    this.workloadMesh.rotation.z = elapsed * 0.035;
    this.timer.begin();
    const cpuStart = performance.now();
    this.renderer.render(this.scene, this.camera);
    const cpuSubmitMs = performance.now() - cpuStart;
    this.timer.end();
    const gpuFrameMs = this.timer.poll();
    return {
      frameIntervalMs,
      cpuSubmitMs,
      gpuFrameMs,
      drawCalls: this.renderer.info.render.calls,
      triangles: this.renderer.info.render.triangles,
    };
  }

  private updateAutoQuality(now: number, frameIntervalMs: number): void {
    if (this.quality.currentMode !== 'auto' || frameIntervalMs <= 0) return;
    if (this.fpsMeasureStart === 0) this.fpsMeasureStart = now;
    this.frameCount++;
    const period = now - this.fpsMeasureStart;
    if (period < 1500) return;
    const fps = (this.frameCount * 1000) / period;
    const change = this.quality.observeFPS(fps, now);
    this.frameCount = 0;
    this.fpsMeasureStart = now;
    if (change) this.resize();
    if (this.quality.currentDiagnostic !== this.lastAutoDiagnostic) {
      this.lastAutoDiagnostic = this.quality.currentDiagnostic;
      this.onDiagnostic(this.lastAutoDiagnostic);
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.reducedMotion.removeEventListener('change', this.onMotionChange);
    this.timer.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this.renderer.dispose();
  }
}
