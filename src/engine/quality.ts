export type QualityTier = 'high' | 'balanced' | 'eco';
export type QualityMode = QualityTier | 'auto';

export type QualitySettings = {
  dprCap: number;
  particles: number;
  shadowEnabled: boolean;
};

export type QualityChange = {
  from: QualityTier;
  to: QualityTier;
  fps: number;
  reason: string;
  timestamp: number;
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
  private diagnostic = 'Auto starts at Balanced and waits for stable frame-rate samples.';

  get currentMode(): QualityMode { return this.mode; }
  get currentTier(): QualityTier { return this.tier; }
  get settings(): QualitySettings { return QUALITY_SETTINGS[this.tier]; }
  get currentDiagnostic(): string { return this.diagnostic; }

  setMode(mode: QualityMode, now = performance.now()): boolean {
    const previous = this.tier;
    this.mode = mode;
    this.lowSamples = 0;
    this.highSamples = 0;
    this.lastChange = now;
    this.tier = mode === 'auto' ? 'balanced' : mode;
    this.diagnostic = mode === 'auto'
      ? 'Auto starts at Balanced and waits 6 seconds before it can change tiers.'
      : `Manual ${mode} mode selected. Auto adjustments are off.`;
    return previous !== this.tier;
  }

  observeFPS(fps: number, now: number): QualityChange | null {
    if (this.mode !== 'auto') return null;
    if (fps < 1 || !Number.isFinite(fps)) {
      this.diagnostic = 'Auto ignored an invalid frame-rate sample.';
      return null;
    }
    const cooldownRemaining = 6000 - (now - this.lastChange);
    if (cooldownRemaining > 0) {
      this.diagnostic = `Auto is stabilizing for ${Math.ceil(cooldownRemaining / 1000)} more seconds.`;
      return null;
    }
    if (fps < 43) {
      this.lowSamples++;
      this.highSamples = 0;
      this.diagnostic = `Auto detected a low frame rate (${this.lowSamples}/3 samples below 43 FPS).`;
    } else if (fps > 57) {
      this.highSamples++;
      this.lowSamples = 0;
      this.diagnostic = `Auto detected headroom (${this.highSamples}/5 samples above 57 FPS).`;
    } else {
      this.lowSamples = 0;
      this.highSamples = 0;
      this.diagnostic = 'Auto is holding the current tier inside the 43–57 FPS band.';
    }
    if (this.lowSamples >= 3) {
      const next = this.tier === 'high' ? 'balanced' : 'eco';
      this.lowSamples = 0;
      if (next === this.tier) {
        this.diagnostic = 'Auto cannot reduce quality below Eco.';
        return null;
      }
      const from = this.tier;
      this.tier = next;
      this.lastChange = now;
      const reason = `Auto changed from ${from} to ${next} after 3 samples below 43 FPS.`;
      this.diagnostic = reason;
      return { from, to: next, fps, reason, timestamp: now };
    }
    if (this.highSamples >= 5) {
      const next = this.tier === 'eco' ? 'balanced' : 'high';
      this.highSamples = 0;
      if (next === this.tier) {
        this.diagnostic = 'Auto cannot increase quality above High.';
        return null;
      }
      const from = this.tier;
      this.tier = next;
      this.lastChange = now;
      const reason = `Auto changed from ${from} to ${next} after 5 samples above 57 FPS.`;
      this.diagnostic = reason;
      return { from, to: next, fps, reason, timestamp: now };
    }
    return null;
  }
}
