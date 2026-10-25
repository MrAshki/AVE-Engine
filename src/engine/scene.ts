import * as THREE from 'three';
import { QualityController, type QualityMode, type QualityTier } from './quality';

export type RenderStats = {
  fps: number | null;
  width: number;
  height: number;
  mode: QualityMode;
  tier: QualityTier;
  api: string;
  diagnostic: string;
};

export class VisualEngine {
  readonly quality = new QualityController();
  private readonly canvas: HTMLCanvasElement;
  private readonly host: HTMLElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(36, 1, 0.1, 120);
  private readonly sculpture = new THREE.Group();
  private readonly core: THREE.Mesh;
  private readonly shell: THREE.Mesh;
  private readonly stars: THREE.Points;
  private readonly keyLight: THREE.PointLight;
  private readonly onStats: (stats: RenderStats) => void;
  private readonly reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  private resizeObserver: ResizeObserver;
  private frameHandle = 0;
  private previousFrame = 0;
  private measureSince = 0;
  private frameCount = 0;
  private lastFPS: number | null = null;
  private pageHidden = false;
  private externallyPaused = false;
  private pointerX = 0;
  private pointerY = 0;
  private scrolling = 0;
  private disposed = false;

  constructor(canvas: HTMLCanvasElement, host: HTMLElement, onStats: (stats: RenderStats) => void) {
    this.canvas = canvas;
    this.host = host;
    this.onStats = onStats;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.45;
    this.renderer.setClearColor(0x000000, 0);
    this.camera.position.set(0, 0, 8.7);
    this.scene.add(this.sculpture);

    this.core = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.18, 2),
      new THREE.MeshPhysicalMaterial({ color: 0x182f49, metalness: 0.74, roughness: 0.22, flatShading: true, clearcoat: 0.85, clearcoatRoughness: 0.22 }),
    );
    this.sculpture.add(this.core);

    const inner = new THREE.Mesh(
      new THREE.IcosahedronGeometry(1.21, 3),
      new THREE.MeshBasicMaterial({ color: 0x9eceff, transparent: true, opacity: 0.13, wireframe: true, depthWrite: false }),
    );
    this.shell = inner;
    this.sculpture.add(inner);

    const ringMat = new THREE.MeshStandardMaterial({ color: 0x88b6f5, metalness: 0.82, roughness: 0.24, emissive: 0x224566, emissiveIntensity: 0.25 });
    const createRing = (radius: number, theta: number, phi: number, tube: number) => {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, tube, 8, 140), ringMat);
      ring.rotation.set(theta, phi, 0);
      this.sculpture.add(ring);
      return ring;
    };
    createRing(1.76, 0.43, 0.62, 0.013);
    createRing(1.9, 1.2, -0.48, 0.009);
    createRing(2.13, 0.25, 1.2, 0.006);

    const beadMat = new THREE.MeshBasicMaterial({ color: 0xe5f7ff });
    for (const [x, y, z, scale] of [
      [1.2, 1.29, 0.42, 0.044], [-1.43, -0.8, -0.62, 0.029], [0.37, -1.65, 0.6, 0.032],
    ]) {
      const bead = new THREE.Mesh(new THREE.SphereGeometry(scale, 12, 8), beadMat);
      bead.position.set(x, y, z);
      this.sculpture.add(bead);
    }

    this.keyLight = new THREE.PointLight(0x9fd8ff, 55, 18, 1.6);
    this.keyLight.position.set(-3.5, 3.4, 5.1);
    this.scene.add(this.keyLight);
    const rimLight = new THREE.PointLight(0x7371e8, 90, 16, 1.6);
    rimLight.position.set(3, -2, 1.3);
    this.scene.add(rimLight);
    this.scene.add(new THREE.AmbientLight(0x7483a9, 1.4));

    const positions = new Float32Array(900 * 3);
    let seed = 43125;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
    for (let i = 0; i < 900; i++) {
      const index = i * 3;
      positions[index] = (random() - 0.5) * 14;
      positions[index + 1] = (random() - 0.5) * 10;
      positions[index + 2] = (random() - 0.5) * 6 - 2;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.stars = new THREE.Points(geometry, new THREE.PointsMaterial({ color: 0x9abfe6, size: 0.018, transparent: true, opacity: 0.62, depthWrite: false }));
    this.scene.add(this.stars);

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(host);
    this.applyQuality();
    this.resize();
    this.host.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('scroll', this.onScroll, { passive: true });
    document.addEventListener('visibilitychange', this.onVisibility);
    this.reducedMotion.addEventListener('change', this.onMotionChange);
    this.onVisibility();
  }

  setMode(mode: QualityMode): void {
    this.quality.setMode(mode);
    this.applyQuality();
    this.emitStats();
    this.requestRender();
  }

  setBenchmarkActive(active: boolean): void {
    this.externallyPaused = active;
    if (active) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = 0;
    } else {
      this.resume();
    }
  }

  private onPointerMove = (event: PointerEvent) => {
    const rect = this.host.getBoundingClientRect();
    this.pointerX = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    this.pointerY = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
  };
  private onScroll = () => {
    this.scrolling = Math.min(1, Math.max(0, window.scrollY / Math.max(1, window.innerHeight)));
    if (this.reducedMotion.matches) this.requestRender();
  };
  private onVisibility = () => {
    this.pageHidden = document.hidden;
    if (this.pageHidden) {
      cancelAnimationFrame(this.frameHandle);
      this.frameHandle = 0;
    } else this.resume();
  };
  private onMotionChange = () => {
    cancelAnimationFrame(this.frameHandle);
    this.frameHandle = 0;
    this.resume();
  };

  private resume(): void {
    if (this.disposed || this.pageHidden || this.externallyPaused) return;
    this.previousFrame = 0;
    this.measureSince = performance.now();
    this.frameCount = 0;
    if (this.reducedMotion.matches) {
      this.lastFPS = null;
      this.renderStatic();
      this.emitStats();
    } else if (!this.frameHandle) {
      this.frameHandle = requestAnimationFrame(this.frame);
    }
  }

  private requestRender(): void {
    if (this.reducedMotion.matches && !this.pageHidden && !this.externallyPaused) this.renderStatic();
  }

  private applyQuality(): void {
    const tier = this.quality.currentTier;
    const settings = this.quality.settings;
    this.stars.geometry.setDrawRange(0, settings.particles);
    this.shell.visible = tier !== 'eco';
    this.keyLight.intensity = tier === 'eco' ? 34 : 55;
    this.resize();
  }

  private resize(): void {
    if (this.disposed) return;
    const width = Math.max(1, Math.round(this.host.clientWidth));
    const height = Math.max(1, Math.round(this.host.clientHeight));
    const ratio = Math.min(window.devicePixelRatio || 1, this.quality.settings.dprCap);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(width, height, false);
    this.emitStats();
    this.requestRender();
  }

  private renderStatic(): void {
    this.sculpture.rotation.set(-0.12, 0.22 + this.scrolling * 0.35, 0.16);
    this.renderer.render(this.scene, this.camera);
  }

  private frame = (now: number): void => {
    this.frameHandle = 0;
    if (this.disposed || this.pageHidden || this.externallyPaused || this.reducedMotion.matches) return;
    const delta = this.previousFrame ? Math.min(0.05, (now - this.previousFrame) / 1000) : 0;
    this.previousFrame = now;
    const elapsed = now / 1000;
    const smooth = 1 - Math.exp(-3 * delta);
    this.sculpture.rotation.y += ((0.22 + elapsed * 0.13 + this.pointerX * 0.24 + this.scrolling * 0.35) - this.sculpture.rotation.y) * smooth;
    this.sculpture.rotation.x += ((-0.12 + Math.sin(elapsed * 0.4) * 0.1 - this.pointerY * 0.13) - this.sculpture.rotation.x) * smooth;
    this.sculpture.rotation.z = Math.sin(elapsed * 0.2) * 0.12;
    this.core.rotation.y += delta * 0.045;
    this.shell.rotation.x -= delta * 0.08;
    this.renderer.render(this.scene, this.camera);

    this.frameCount++;
    const measurementPeriod = now - this.measureSince;
    if (measurementPeriod >= 1500) {
      const fps = (1000 * this.frameCount) / measurementPeriod;
      this.lastFPS = Math.round(fps);
      this.frameCount = 0;
      this.measureSince = now;
      if (this.quality.observeFPS(fps, now)) this.applyQuality();
      this.emitStats();
    }
    this.frameHandle = requestAnimationFrame(this.frame);
  };

  private emitStats(): void {
    this.onStats({
      fps: this.lastFPS,
      width: this.canvas.width,
      height: this.canvas.height,
      mode: this.quality.currentMode,
      tier: this.quality.currentTier,
      api: 'WEBGL2',
      diagnostic: this.quality.currentDiagnostic,
    });
  }

  dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameHandle);
    this.resizeObserver.disconnect();
    this.host.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('scroll', this.onScroll);
    document.removeEventListener('visibilitychange', this.onVisibility);
    this.reducedMotion.removeEventListener('change', this.onMotionChange);
    this.scene.traverse((object) => {
      if (object instanceof THREE.Mesh || object instanceof THREE.Points) {
        object.geometry.dispose();
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        for (const material of materials) material.dispose();
      }
    });
    this.renderer.dispose();
  }
}
