import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
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
  private readonly environmentTarget: THREE.WebGLRenderTarget;
  private readonly orbitControls: OrbitControls;
  private readonly resizeObserver: ResizeObserver;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private workloadObject: THREE.Object3D;
  private carModel: THREE.Group | null = null;
  private carLoadPromise: Promise<THREE.Group> | null = null;
  private workload: WorkloadLevel = 'medium';
  private resolutionScale = 1;
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
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const roomEnvironment = new RoomEnvironment();
    this.environmentTarget = pmremGenerator.fromScene(roomEnvironment, 0.04);
    this.scene.environment = this.environmentTarget.texture;
    roomEnvironment.dispose();
    pmremGenerator.dispose();
    this.timer = new GpuTimer(this.renderer.getContext() as WebGL2RenderingContext);
    this.camera.position.set(0, 0, 10.5);
    this.orbitControls = new OrbitControls(this.camera, canvas);
    this.orbitControls.enabled = false;
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.065;
    this.orbitControls.enablePan = false;
    this.orbitControls.minDistance = 3.5;
    this.orbitControls.maxDistance = 16;
    this.orbitControls.target.set(0, 0, 0);
    this.orbitControls.addEventListener('change', this.onControlsChange);
    this.scene.add(this.stage);
    this.scene.add(new THREE.HemisphereLight(0xbadfff, 0x111728, 1.55));
    const key = new THREE.DirectionalLight(0xaed9ff, 3.2);
    key.position.set(-4, 5, 7);
    this.scene.add(key);
    const rim = new THREE.PointLight(0x6c70ff, 42, 28, 1.6);
    rim.position.set(4, -2, 4);
    this.scene.add(rim);

    this.workloadObject = createWorkload(WORKLOADS[this.workload]);
    this.stage.add(this.workloadObject);
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
  get currentResolutionScale(): number { return this.resolutionScale; }

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

  async setWorkload(level: WorkloadLevel): Promise<void> {
    if (level === this.workload || !WORKLOADS[level]) return;
    this.timer.reset();
    const nextObject = level === 'car-concept'
      ? await this.loadCarModel()
      : createWorkload(WORKLOADS[level]);
    if (this.disposed) {
      if (nextObject instanceof THREE.InstancedMesh) this.disposeMesh(nextObject);
      return;
    }
    if (this.workloadObject === this.carModel) {
      this.workloadObject.visible = false;
    } else if (this.workloadObject instanceof THREE.InstancedMesh) {
      this.stage.remove(this.workloadObject);
      this.disposeMesh(this.workloadObject);
    }

    this.workload = level;
    this.workloadObject = nextObject;
    this.workloadObject.visible = true;
    if (!this.workloadObject.parent) this.stage.add(this.workloadObject);
    this.stage.rotation.set(0, 0, 0);
    this.orbitControls.enabled = level === 'car-concept';
    this.camera.position.set(level === 'car-concept' ? 6.2 : 0, level === 'car-concept' ? 3.1 : 0, level === 'car-concept' ? 7.8 : 10.5);
    this.orbitControls.target.set(0, 0, 0);
    this.orbitControls.update();
    this.renderOnce(performance.now());
  }

  setResolutionScale(scale: number): void {
    this.resolutionScale = Math.min(1, Math.max(0.5, scale));
    this.timer.reset();
    this.resize();
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
      renderScale: this.resolutionScale,
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

  private onControlsChange = () => {
    if (this.reducedMotion.matches && !this.active) this.renderOnce(performance.now());
  };

  private resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, Math.round(this.host.clientWidth));
    const height = Math.max(1, Math.round(this.host.clientHeight));
    const cap = QUALITY_SETTINGS[this.quality.currentTier].dprCap;
    const ratio = Math.min(window.devicePixelRatio || 1, cap) * this.resolutionScale;
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
        renderScale: this.resolutionScale,
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
    if (this.workload === 'car-concept') {
      this.stage.rotation.set(0, 0, 0);
      if (!this.reducedMotion.matches || this.active) this.orbitControls.update();
    } else {
      this.stage.rotation.y = elapsed * 0.16;
      this.stage.rotation.x = Math.sin(elapsed * 0.23) * 0.12;
      this.workloadObject.rotation.z = elapsed * 0.035;
    }
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

  private loadCarModel(): Promise<THREE.Group> {
    if (this.carModel) return Promise.resolve(this.carModel);
    if (this.carLoadPromise) return this.carLoadPromise;
    const assetUrl = WORKLOADS['car-concept'].assetUrl;
    if (!assetUrl) return Promise.reject(new Error('The Car Concept asset URL is missing.'));
    this.carLoadPromise = new GLTFLoader().loadAsync(assetUrl).then((gltf) => {
      const root = gltf.scene;
      const bounds = new THREE.Box3().setFromObject(root);
      const size = bounds.getSize(new THREE.Vector3());
      const center = bounds.getCenter(new THREE.Vector3());
      const largestDimension = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(largestDimension) || largestDimension <= 0) throw new Error('The Car Concept model has invalid bounds.');
      const scale = 5.2 / largestDimension;
      root.scale.setScalar(scale);
      root.position.copy(center).multiplyScalar(-scale);
      root.updateMatrixWorld(true);
      root.name = 'car-concept-baseline';
      this.carModel = root;
      return root;
    }).catch((error: unknown) => {
      this.carLoadPromise = null;
      throw error;
    });
    return this.carLoadPromise;
  }

  private disposeMesh(mesh: THREE.Mesh): void {
    mesh.geometry.dispose();
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value instanceof THREE.Texture) value.dispose();
      }
      material.dispose();
    }
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.animationFrame);
    this.resizeObserver.disconnect();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.reducedMotion.removeEventListener('change', this.onMotionChange);
    this.orbitControls.removeEventListener('change', this.onControlsChange);
    this.orbitControls.dispose();
    this.timer.dispose();
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        this.disposeMesh(object);
      }
    });
    this.environmentTarget.dispose();
    this.renderer.dispose();
  }
}
