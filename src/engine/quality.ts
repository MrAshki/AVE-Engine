export type QualityTier = 'high' | 'balanced' | 'eco';
export type QualityMode = QualityTier | 'auto';

export type QualitySettings = {
  dprCap: number;
  particles: number;
  shadowEnabled: boolean;
};

export const QUALITY_SETTINGS: Record<QualityTier, QualitySettings> = {
  high: { dprCap: 2, particles: 900, shadowEnabled: true },
  balanced: { dprCap: 1.35, particles: 500, shadowEnabled: false },
  eco: { dprCap: 1, particles: 180, shadowEnabled: false },
};

export class QualityController {
  private mode: QualityMode = 'auto';
  private tier: QualityTier = 'balanced';
  private lowSamples = 0;
  private highSamples = 0;
  private lastChange = performance.now();

  get currentMode(): QualityMode { return this.mode; }
  get currentTier(): QualityTier { return this.tier; }
  get settings(): QualitySettings { return QUALITY_SETTINGS[this.tier]; }

  setMode(mode: QualityMode): boolean {
    const previous = this.tier;
    this.mode = mode;
    this.lowSamples = 0;
    this.highSamples = 0;
    this.lastChange = performance.now();
    this.tier = mode === 'auto' ? 'balanced' : mode;
    return previous !== this.tier;
  }

  observeFPS(fps: number, now: number): boolean {
    if (this.mode !== 'auto' || now - this.lastChange < 6000 || fps < 1) return false;
    if (fps < 43) {
      this.lowSamples++;
      this.highSamples = 0;
    } else if (fps > 57) {
      this.highSamples++;
      this.lowSamples = 0;
    } else {
      this.lowSamples = 0;
      this.highSamples = 0;
    }
    if (this.lowSamples >= 3) {
      const next = this.tier === 'high' ? 'balanced' : 'eco';
      this.lowSamples = 0;
      if (next === this.tier) return false;
      this.tier = next;
      this.lastChange = now;
      return true;
    }
    if (this.highSamples >= 5) {
      const next = this.tier === 'eco' ? 'balanced' : 'high';
      this.highSamples = 0;
      if (next === this.tier) return false;
      this.tier = next;
      this.lastChange = now;
      return true;
    }
    return false;
  }
}
