# CIRCUIT FORGE — Breadboard Lab v5

September 5, 2026. `/breadboard` can receive selected R/C values from Filter AI. This module is a physical connectivity editor, not a new AI model or an analog frequency solver. The AI design and research engines remain in `/filter` and `/lab`.

## Electrical model

- 63 columns × 10 signal holes, plus 4 rails × 50 holes: 830 holes in total.
- A–E and F–J form two independent copper groups in each column. Opposing E/F holes are 7.62 mm apart; normal spacing is 2.54 mm.
- EACH of the four power rails is split in the middle: 126 signal groups + 8 rail segments = 134 base nodes. The original request's total of 126+4 conflicted with this split-rail definition, so the implementation uses 134.
- TL072 top view: pins 1–4 on one side, 8–5 opposite; the DIP-8 straddles the channel. A 90-degree rotation does not fit the channel and produces an error. A reversed 180-degree placement is checked for the correct column order and E/F orientation.
- Resistors, capacitors, inductors, and op-amps are not treated as direct shorts. Union-find merges only physical copper groups, jumper ends, and `wire` components.
- The component-pin partition extracted from this physical graph is compared with a separate target graph. Target net labels do not create physical connections. NC pins remain independent of one another.
- VCC/GND/VEE left-hand entries, right-hand continuity checkpoints, and IN/OUT ports are fixed. A right-hand checkpoint is not a second power input. A missing center bridge produces an error for the corresponding rail.

## Placement and interaction

The deterministic placer first positions DIP-8 packages, then signal distribution columns and passive leads spaced 3–12 holes apart. Each hole accommodates one lead/jumper end, and each group retains a free hole for routing. Passive body spans are selected to avoid overlap on the same row. Groups are then joined with jumpers; automatic placement is accepted only after independent validation.

The 2D SVG and Three.js 0.185.1 scene share the same millimeter coordinates and layout data. In 3D, 830 holes use InstancedMesh and text uses one texture atlas. The 2D hole layer is memoized. During dragging, only the moving model and its attached jumper endpoints update. On release, the component snaps to the grid and the netlist is reconstructed. The shadow map refreshes after layout changes. On slow renderers, drag resolution adapts and full resolution returns on release. Fast GPUs retain full detail.

Resistor bands are calculated from two significant digits, a multiplier, and tolerance. Values that cannot be represented exactly with four bands display their value instead of invented, rounded bands. Ceramic/film capacitor codes are calculated in picofarads. Electrolytic pin 1 is positive and pin 2 is negative, with the stripe on the negative side. The DIP-8 notch and pin-1 dot match the top view.

The learning flow includes an empty board, component tray, step hint, and “Apply this step” button. R rotates, Delete/Backspace removes, and Ctrl/Cmd+Z undoes. Select two empty holes to draw a manual jumper. Highlighting works in both directions between schematic and board components; net highlighting shows holes and wires in the same electrical group. Editing history is limited to 80 steps.

## Recorded validation

The GitHub preparation included 50 tests: 49 domain tests and one standalone static-server test. Sixteen tests cover the breadboard model. Five examples—Sallen–Key LP/HP, MFB BP, passive RC, and a fourth-order cascade—produced the same connectivity partition as their schematics after deterministic placement. Separate negative tests cover C2.2 incorrectly connected to B, disconnected rails, shorts, hole collisions, deletion, and invalid DIP footprints.

`tests/breadboard-browser.mjs` uses real pointer movements. The recorded browser run used Chromium 151.0.7922.34, a 1280×1000 viewport, and DPR 1. 3D dragging measured 119 FPS on Apple M4 / ANGLE Metal. This is a short interaction measurement on one machine, not a guarantee of 60 FPS on all devices. A GPU-disabled SwiftShader run showed 33–47 FPS during development; software rendering and GPU results must not be conflated. The historical record is in `breadboard-browser-validation.json`.

Browser checks cover 2D/3D pointer dragging, incorrect-pin detection, attached jumpers, identical coordinates across views, bidirectional highlighting, manual shorts, completion through 15 hints, PNG download, and no page overflow at 390 px in dark mode. Additional desktop checks covered R/Delete/Ctrl+Z, camera reset, and both PNG outputs. During GitHub preparation, unhandled test-registration promises and application lint findings were corrected. `pnpm lint` covers the app, domain code, hooks, scripts, and tests; the third-party `components/ui/` template layer is excluded from lint but included in TypeScript checks. The earlier hosted version's repository-wide lint result is distinct from the GitHub preparation.

Five assembly guides were converted to PDF with Chromium's print engine. pypdf verified one page each, and Poppler PNG renders were inspected for text, connection lists, and board views. Guides can be previewed in the interface, printed/saved as PDF, and downloaded as standalone HTML. These are recorded checks from the original release, not a claim that browser tests were rerun during every later text update.

## Reproduce

```sh
pnpm test
pnpm typecheck
pnpm build
pnpm test:bundle
# Use a separately installed Playwright package; on macOS the GPU option uses Metal.
CF_TEST_GPU=1 node tests/breadboard-browser.mjs /absolute/test-output-directory
```

Playwright is not an application runtime dependency. `PLAYWRIGHT_MODULE` can select an installed Playwright package, `PLAYWRIGHT_BROWSERS_PATH` the test browser, and `BASE_URL` a localhost application URL. The test uses a separate empty browser profile, not the user's normal session.

## Scope

Imported netlists support up to 32 components and 20 defined nets. Placement supports at most four DIP-8 packages and designs that fit within the allocated signal distribution columns. Oversized circuits produce an explicit error. This is not a general-purpose PCB router. Matching connectivity does not prove operation at every frequency or on physical hardware. In particular, the example's unused TL072 channel is kept NC; physical use requires appropriate termination and supply bypassing. No physical assembly was performed.

JSON import reads a circuit definition; placement remains in session memory. Netlist/layout exports include validation records. Bridges must physically connect both rail halves. Rail splitting can differ on real manufacturers' breadboards, so verify the actual layout separately.

## Primary sources

- [TI TL072 datasheet](https://www.ti.com/lit/ds/symlink/tl072.pdf)
- [TI Sallen–Key low-pass](https://www.ti.com/tool/CIRCUIT060054)
- [TI Sallen–Key high-pass](https://www.ti.com/tool/CIRCUIT060053)
- [TI MFB band-pass design resources](https://www.ti.com/tool/CIRCUIT060055)
- [Three.js InstancedMesh](https://threejs.org/docs/#api/en/objects/InstancedMesh)
- [Three.js OrbitControls](https://threejs.org/docs/#examples/en/controls/OrbitControls)
- [Playwright pointer API](https://playwright.dev/docs/api/class-mouse)
- [Chromium headless GPU requirements](https://chromium.googlesource.com/chromium/src/+/HEAD/docs/gpu/using-gpu-hardware-in-headless-chrome.md)
