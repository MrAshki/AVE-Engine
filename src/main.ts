import { VisualEngine, type RenderStats } from './engine/scene';
import type { QualityMode } from './engine/quality';

const canvas = document.querySelector<HTMLCanvasElement>('#scene-canvas');
const host = document.querySelector<HTMLElement>('#visual-viewport');
const tierLabel = document.querySelector<HTMLElement>('#active-tier');
const fpsLabel = document.querySelector<HTMLElement>('#metric-fps');
const resolutionLabel = document.querySelector<HTMLElement>('#metric-resolution');
const metricTierLabel = document.querySelector<HTMLElement>('#metric-tier');
const apiLabel = document.querySelector<HTMLElement>('#metric-api');
const warning = document.querySelector<HTMLElement>('#metrics-warning');
const buttons = document.querySelectorAll<HTMLButtonElement>('.mode-button');

function renderStats(stats: RenderStats) {
  if (fpsLabel) fpsLabel.textContent = stats.fps === null ? '—' : String(stats.fps);
  if (resolutionLabel) resolutionLabel.textContent = `${stats.width} × ${stats.height}`;
  if (tierLabel) tierLabel.textContent = stats.tier.toUpperCase();
  if (metricTierLabel) metricTierLabel.textContent = stats.tier.toUpperCase();
  if (apiLabel) apiLabel.textContent = stats.api;
}

function setModeUI(mode: QualityMode): void {
  buttons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

let engine: VisualEngine | null = null;
const supportsWebGL2 = (() => {
  try { return Boolean(document.createElement('canvas').getContext('webgl2')); }
  catch { return false; }
})();

if (canvas && host && supportsWebGL2) {
  try {
    engine = new VisualEngine(canvas, host, renderStats);
    host.classList.add('scene-ready');
  } catch (error) {
    console.error('AVE renderer initialization failed:', error);
  }
}
if (!engine) {
  if (warning) warning.textContent = 'Live 3D is unavailable in this browser. Vector interface remains operational.';
  if (apiLabel) apiLabel.textContent = 'UNAVAILABLE';
  if (tierLabel) tierLabel.textContent = 'STATIC';
  if (metricTierLabel) metricTierLabel.textContent = 'STATIC';
  buttons.forEach(button => { button.disabled = true; });
}

buttons.forEach((button) => {
  button.addEventListener('click', () => {
    const mode = button.dataset.mode as QualityMode | undefined;
    if (!mode || !engine) return;
    engine.setMode(mode);
    setModeUI(mode);
  });
});

window.addEventListener('pagehide', () => engine?.dispose(), { once: true });
