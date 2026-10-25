# AVE — Adaptive Visual Engine (Performance Lab 0.2)

A lightweight proof of concept for crisp vector interfaces, real-time 3D, responsive motion, and device-aware rendering.

## Scope

- HTML/CSS/SVG UI remains sharp independently of 3D canvas resolution.
- Three.js WebGL2 scene with interactive procedural geometry (no external assets).
- Auto/High/Balanced/Eco render modes; Auto uses crude frame-rate-based hysteresis, not a validated device benchmark.
- Isolated Light, Medium, and Heavy benchmark workloads built with deterministic procedural geometry and `InstancedMesh`.
- Live frame interval, CPU submission, asynchronous GPU timing, draw calls, triangles, canvas dimensions, DPR, and active configuration.
- Repeatable single-preset and High/Balanced/Eco comparison runs with JSON and CSV export.
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
npm test
npm run build
npm run preview
```

## Benchmark methodology

1. Select a deterministic workload and a quality preset.
2. Warm up that configuration for 5 seconds. Warm-up frames are not included in the result.
3. Collect animation-frame, CPU submission, renderer-count, and available GPU timer samples for 20 seconds.
4. Report average FPS, average and P95 frame time, approximate 1% low FPS, CPU submission time, GPU frame time, draw calls, and triangles.
5. Use **Compare presets** to run High, Balanced, and Eco in sequence with the same workload.
6. Export completed results as JSON or CSV. The export includes the browser user agent, GPU renderer string when exposed, canvas resolution, device and effective DPR, workload configuration, and UTC timestamp.

The Hero and benchmark use separate scenes and renderers. AVE pauses the Hero during an active benchmark so it does not add render work to the sample. The workload geometry, transforms, and colors use fixed seeds. Workload levels increase submitted triangle work, not the number of JavaScript scene objects.

### Metric definitions

- **Frame time:** interval between consecutive `requestAnimationFrame` callbacks.
- **Average FPS:** 1,000 divided by average frame time. Refresh rate can cap this value.
- **P95 frame time:** nearest-rank 95th percentile of collected frame intervals.
- **Approximate 1% low FPS:** 1,000 divided by the average of the slowest 1% of frame intervals.
- **CPU submission:** CPU time spent in the Three.js `renderer.render` call. It is not GPU execution time.
- **GPU frame time:** asynchronous `EXT_disjoint_timer_query_webgl2` result. AVE rejects disjoint, invalid, and unavailable results and shows `N/A` when the extension is unsupported.
- **Draw calls and triangles:** values from `WebGLRenderer.info.render` for the submitted frame.

## Architecture

- `src/main.ts` — UI behavior, controls, fallback
- `src/engine/quality.ts` — three presets and automated hysteresis
- `src/engine/scene.ts` — Three.js scene, event handling, adaptive DPR and FPS measurements
- `src/benchmark/engine.ts` — isolated benchmark renderer, workload lifecycle, and live instrumentation
- `src/benchmark/gpu-timer.ts` — asynchronous WebGL2 timer-query management
- `src/benchmark/runner.ts` — fixed warm-up, sampling, and preset-comparison lifecycle
- `src/benchmark/statistics.ts` — benchmark summary calculations
- `src/benchmark/workloads.ts` — bounded seeded procedural workloads
- `src/style.css` — responsive interface design
- `src/lab.css` — Performance Lab controls, metrics, and results layout

## Important limitations

- This is not a 4K-quality guarantee or benchmark result.
- FPS is a sampled animation-loop rate; it does **not** measure GPU frame time.
- Browser scheduling, thermal state, power policy, other tabs, and display refresh rate can affect results.
- GPU timer queries are not available in all browsers or privacy configurations. Unsupported GPU metrics are `N/A`.
- CPU submission time measures JavaScript-side renderer submission only. It does not include completed GPU execution.
- The 1% low is approximate, especially on short runs or low-refresh displays.
- Auto mode keeps the original simple FPS thresholds and cooldown. It reports its decisions but is not a validated automatic optimizer.
- Adaptive DPR can create blurrier 3D content on retina screens while the HTML/SVG interface remains sharp.
- There is no real product model, Lottie, Rive, glTF optimization, WebGPU, automatic asset compiler, or post-processing yet.
- Shadow option is a reserved preset capability and is not used in the current scene.

## Scope boundary

This phase uses only procedural Three.js geometry. It does not include external 3D assets, video, new visual frameworks, or automatic optimization claims.
