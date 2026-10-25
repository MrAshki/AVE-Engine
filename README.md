# AVE — Adaptive Visual Engine (MVP 0.1)

A lightweight proof of concept for crisp vector interfaces, real-time 3D, responsive motion, and device-aware rendering.

## Scope

- HTML/CSS/SVG UI remains sharp independently of 3D canvas resolution.
- Three.js WebGL2 scene with interactive procedural geometry (no external assets).
- Auto/High/Balanced/Eco render modes; Auto uses crude frame-rate-based hysteresis, not a validated device benchmark.
- Live FPS, canvas pixel dimensions, active quality tier, and renderer label.
- Reduced-motion support: pauses continuous rendering and static fallback.
- Visibility-aware animation and WebGL2 fallback.
- Static build (`dist/`), no API or GPU server required.

## Requirements

Node.js 20.19+ or 22.12+ (recent active LTS recommended), npm. GPU and browser that support WebGL2 for 3D. Other browsers show a CSS fallback.

## Run

```bash
npm install
npm run dev
```

Open the local URL Vite prints (normally `http://127.0.0.1:5173`).

## Verify

```bash
npm run typecheck
npm run build
npm run preview
```

## Architecture

- `src/main.ts` — UI behavior, controls, fallback
- `src/engine/quality.ts` — three presets and automated hysteresis
- `src/engine/scene.ts` — Three.js scene, event handling, adaptive DPR and FPS measurements
- `src/style.css` — responsive interface design

## Important limitations

- This is not a 4K-quality guarantee or benchmark result.
- FPS is a sampled animation-loop rate; it does **not** measure GPU frame time.
- Adaptive DPR can create blurrier 3D content on retina screens while the HTML/SVG interface remains sharp.
- There is no real product model, Lottie, Rive, glTF optimization, WebGPU, automatic asset compiler, or post-processing yet.
- Shadow option is a reserved preset capability and is not used in the current scene.

## Next experiment

Swap procedural geometry for a real GLB model. Record controlled network size, first meaningful paint, FPS, GPU workload, and perceived sharpness in High/Balanced/Eco across multiple devices.
