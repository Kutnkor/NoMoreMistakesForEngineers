# Circuit Forge Workbench

The workbench is the default `/breadboard` surface. A single 2D/3D toolbar edits one project. The separate **Guided analog lab** retains the existing five analog examples and their schematic tools.

## Using the workbench

1. Start with **UNO LED starter** or **UNO sensor station**, or open an empty table.
2. Add ready-to-place products from the library. The optional full catalogue also lists unavailable models explicitly.
3. Select a board to move or rotate it. Double-click its body, or use **Focus**, to inspect its pins. **Fit** returns to the full table.
4. Choose **Wire**, then click two physical terminals. Selecting a wire reveals colours, height, bend controls and **Reconnect A / B**. The same endpoints and bends are editable in 2D and 3D.
5. Use **Probe** to check whether two terminals share a conductor. This is a continuity graph, not a measurement of operating resistance or voltage.
6. Compare the table with its reference. Selecting an issue locates the object and highlights the conductor in either view. Available repairs are previewed before application and can be undone.
7. Open **Code** to generate a sketch from the actual UNO wiring or supply an Arduino-compatible sketch. **Export simulation** downloads a Wokwi project ZIP.

**Full screen** expands the editor. **Tidy wires** changes route geometry without changing electrical connectivity. All interface text is English.

## Source and state consistency

The September 8 input ZIP and the separately supplied WORKBENCH.md described different revisions. This source replaces that disagreement with one implementation and one report. Old workbench screenshots in `docs/images` are historical input images, not validation captures of this release.

The editor's reducer commits the project and undo history atomically. Moving a wire bend or board creates one undo step. The workbench remains mounted when the guided lab is opened and stops its keyboard and 3D rendering work while inactive.

The last workbench is saved on the current device under `circuit-forge-workbench-v2`. A loaded snapshot is installed before cleanup can flush, including React development Strict Mode. Import/export preserves target data, values, wires, waypoints, firmware and libraries. Corrupt imports and non-finite geometry are rejected. Another tab's save pauses local writes; the user can load the saved draft or explicitly keep this one. A JSON download remains the portable backup. This is not cloud synchronization.

## Electrical model

Breadboard copper has 126 five-hole terminal strips and eight independent half-rail segments. Crossings and proximity do not connect wires. Resistors, capacitors and other passive elements are not collapsed into conductors. Internal board connections are explicit, including the UNO's duplicated I²C terminals and Pico's analogue ground.

Logic levels come from catalogue metadata, with unknown voltage reported explicitly. Warnings cover mixed logic levels and supply-to-GPIO voltage mismatches; errors cover documented supply shorts, incompatible supply outputs, dangling endpoints and occupied holes. These checks do not know the runtime GPIO direction or whether a board is powered.

A target stores an electrical terminal partition and reference component values, independent of object position. Comparison detects disconnected target nets, joined distinct nets, missing terminals and value changes. Repair previews either add a jumper, remove an extra shorting jumper or restore a reference value only when the comparison improves. They do not synthesize arbitrary missing circuits.

The 2D pointer transform uses the SVG screen matrix, including aspect-ratio letterboxing. Both renderers use common endpoint coordinates. Breadboard connection heights are on its top surface; mounted terminals follow the host. Unmounting preserves the visible pose, including rotated hosts. Bends follow endpoint movement through weighted displacement.

## Supported physical and simulation models

- Physical boards: Arduino UNO R3, classic Nano, Mega 2560, ESP32-DevKitC V4, original Raspberry Pi Pico.
- Physical parts: resistor, ceramic/film/electrolytic capacitor, inductor, LED, button, potentiometer, DIP-8 package, 830-hole breadboard.
- New modules: Wokwi-reference SSD1306 128×64 OLED and four-pin DHT22.
- Wokwi export: the five boards, resistors, LED, button, potentiometer, OLED and DHT22. Breadboard copper is flattened into equivalent terminal connections; `workbench.json` retains the physical layout.
- A firmware ZIP currently requires one controller. Arbitrary multi-board layouts remain supported for editing, checking, JSON and assembly-guide export.
- Automatic firmware covers UNO R3 with the supported interactive modules. It follows connected signal pins, checks the required supply/ground wiring, and reads DHT22 at two-second intervals without blocking LED/button updates. Other controllers accept user-supplied Arduino-compatible sketches.
- Analogue capacitors, inductors and a generic DIP-8 package have no Wokwi behavior mapping. Export refuses unsupported elements instead of dropping them. Existing Filter AI and AI Laboratory remain available.

A support badge means a mapped model exists; it does not claim any arbitrary combination works. Module drawings are explicitly reference footprints. Pin order and voltage tolerance of real third-party breakout variants can differ. Existing mechanical offsets remain marked `community` until individually checked against manufacturer CAD; the render is not an enclosure-manufacturing drawing.

## Fault practice

**Start practice** removes a jumper from a matching reference example. Use the probe and manual wiring to restore the target, then **Check answer**. The session records elapsed time, probe readings and answer checks and can be downloaded as JSON. These are individual practice records, not a user study, model accuracy claim or physical-circuit result.

## Validation, 2026-09-09

- Local `pnpm check`: lint, TypeScript, **96 tests**, production static build and bundled-worker checks passed.
- Existing AI worker: 32 AI + 32 random evaluations, 32 progress messages, 1,024 held-out draws.
- Existing lab worker: paired 1,024-draw audit, three equal-budget searches and invalid-input handling passed.
- Wokwi CLI **0.26.1**: the LED and sensor-station project files pass diagram lint. Five additional fixtures exercise the emitted terminal names for each supported controller. No errors; the CLI emits an informational undocumented-part notice for ESP32-DevKitC V4.
- New tests cover reference partitions, open/short/value detection, repair and undo, arbitrary-name logic metadata, movement and route equivalence, mounted-host movement, strict imports, generated pin assignments and pairwise connectivity after simulator export.
- Firmware simulation execution, physical hardware testing and browser interaction/FPS benchmarking have **not** been performed for this revision. Earlier screenshots and software-rendered FPS figures are not current results.

Reproduce the local checks:

```sh
pnpm install --frozen-lockfile
pnpm check
node --experimental-strip-types scripts/workbench-export-fixtures.ts
wokwi-cli lint work/simulator-fixtures/led
wokwi-cli lint work/simulator-fixtures/station
```

A Wokwi simulation run requires the simulator and, for CLI execution, its account token. Diagram lint is a structural check and does not execute firmware.

## Sources checked

- [Arduino UNO R3: pinout, schematic and CAD links](https://docs.arduino.cc/hardware/uno-rev3/)
- [Wokwi UNO terminal definitions](https://github.com/wokwi/wokwi-elements/blob/main/src/arduino-uno-element.ts): simulator terminal `3.3V`, duplicated analogue headers and named ground terminals.
- [Espressif ESP32-DevKitC V4 guide](https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html): J2/J3 terminals and input-only pins.
- [Raspberry Pi official Pico documentation](https://github.com/raspberrypi/documentation/blob/master/documentation/asciidoc/microcontrollers/pico-series/about_pico.adoc): AGND pin 33 is also ground; Pico and Pico H share their pinout.
- [Wokwi project format](https://docs.wokwi.com/diagram-format): parts, connections and pin addressing.
- [Wokwi OLED](https://docs.wokwi.com/parts/board-ssd1306), [DHT22](https://docs.wokwi.com/parts/wokwi-dht22), [button](https://docs.wokwi.com/parts/wokwi-pushbutton), [potentiometer](https://docs.wokwi.com/parts/wokwi-potentiometer): simulator contracts.
- [Wokwi CLI lint](https://docs.wokwi.com/wokwi-ci/cli-usage): current registry validation.

## Detailed models and real firmware execution (0.7)

UNO and Mega artwork, planar outlines, mounting holes and header positions now
come from Arduino's official Rev3e Eagle files. The importer reflects Eagle's
upward Y axis once into the table's downward Y frame, retaining stable endpoint
IDs. This also corrects misplaced UNO analog/power headers and the Mega's
previously horizontal, out-of-bounds D22–D53 header. Both views use these same
positions. Package heights/materials and connector interiors are approximations,
not an official dimensioned 3D assembly or a claim of photoreal equivalence.
Other models have improved procedural geometry; their pre-existing mechanical
verification caveats still apply. Pico's 20-pin rows now fit its 51 mm outline.

The 3D renderer adds actual socket openings, plated pads, package leads following
CAD pads, can-capacitor vents, translucent LED bodies, molded breadboard openings
and contacts, component markings, metallic USB shells and studio reflections.
UNO/Mega CAD derivatives are separately licensed CC BY-SA 4.0; consult
`public/models/arduino-cad-NOTICE.md` and `THIRD_PARTY_NOTICES.md`.

Choose **UNO live inputs · run code**, open **Code & Run**, then **Run sketch**.
The sketch controls LED PWM from the potentiometer and overrides it when the
button is pressed. The same runtime brightness appears in 2D and 3D. Serial
monitor input is sent with a newline. Stop terminates the worker; a new run
starts fresh. Circuit/code edits abort pending compilation and invalidate a run;
view/camera changes do not. The simulated time counter is CPU time, which may
advance slower than wall time on a slow device.

Runtime boundary: exactly one UNO R3 or classic ATmega328P Nano, LEDs each with
one 150 Ω–1 MΩ series resistor, ground-switched INPUT_PULLUP buttons, and pots
between 5 V/GND with wipers on A0–A5. AVR8js executes compiled instructions,
timers, ADC, UART and session-local EEPROM in a dedicated worker. PWM brightness
integrates pin transitions across each frame. LED intensity uses a nominal red
LED approximation and is not a SPICE diode/current result. General resistor
networks, analog filters, OLED/DHT22 and ESP32/Pico/Mega firmware execution are
not modeled by this local runtime; unsupported configurations are rejected with
an actionable message and retain their existing Wokwi export where supported.

Run sends the current sketch to **https://hexi.wokwi.com/build**, the online
compiler in the official AVR8js demo. This is a third-party dependency with no
availability guarantee. The UI discloses transmission before Run. Source is not
sent on edits or autosaves. External libraries are not installed by this UI;
Arduino IDE **Export Compiled Binary** for Arduino UNO can be loaded through
**Load HEX** and executes locally, subject to the same peripheral limitations.
An explicit compiler error, cancellation or timeout is displayed; there is no
fake successful run when compilation fails.

Validation: 102 source tests, including compiled blink/Serial, ADC-to-PWM,
button/serial input, active-low wiring, broken connections, invalid HEX and CAD
coordinate regressions. The emitted production AVR worker is separately tested
with the actual binary and interactive inputs. Browser pointer/WebGL rendering
and physical hardware were not exercised in this validation pass.

Sources checked 2026-09-09:
- https://docs.arduino.cc/hardware/uno-rev3/
- https://docs.arduino.cc/hardware/mega-2560/
- https://docs.espressif.com/projects/esp-dev-kits/en/latest/esp32/esp32-devkitc/user_guide.html
- https://github.com/wokwi/avr8js
- https://github.com/wokwi/avr8js/blob/main/demo/src/compile.ts
- https://github.com/wokwi/avr8js/blob/main/demo/src/execute.ts


## Navigation and accessories (0.8)

The 3D camera and editing gestures now have separate ownership. A capture-phase
handler consumes actual component/wire edits before OrbitControls can start a
camera gesture. Empty-space dragging pans. Space-drag pans over components;
right-drag or a modifier-drag orbits. Explicit Edit parts / Pan view / Orbit view
buttons make each mode available without a mouse shortcut. In Trackpad mode,
two-finger scrolling pans and Ctrl-marked pinch zooms. Mouse mode uses the wheel
for zoom. Fit (F), Top (T), zoom buttons and double-click focus are available.
Keyboard shortcuts apply while the canvas has focus. The view survives 2D/3D
switches; loading a preset fits the new circuit. Touch navigation is available
through Pan view / Orbit view; no touch-device interaction test is claimed.

Fit uses both the vertical field of view and the viewport aspect ratio rather
than a fixed camera distance. Part and wire-bend drags intersect the ray with
the starting hit's horizontal plane, retaining raised wire height instead of
jumping to the table. A four-pixel threshold separates selection from dragging.
Pointer release, cancellation and lost capture finish one undo transaction.
Body picking uses inexpensive proxies instead of walking every CAD mesh.

Added 12 accessories: HC-SR04, standard micro servo, MPU6050 reference breakout,
I²C LCD1602, PIR, LDR module, analog joystick, KY-040 encoder, passive piezo,
DS18B20, 4×4 membrane keypad and WS2812 pixel. They can be placed and wired in
both views and exported to Wokwi with a user sketch. Each selected accessory
shows a connection guide and primary-source links. The LCD export explicitly
sets `pins: i2c` and `i2cAddress: 0x27`; its terminals are not interchangeable
with the default parallel LCD. Keypad rows/columns are passive contacts, not
power inputs. Buzzer pin 1 is negative and pin 2 positive.

The outlines, package heights and terminal positions of these new reference
models are illustrative, not fabrication drawings or exact vendor assemblies.
Generic modules with variant-dependent supply requirements retain unknown
voltage metadata. Servo, sonar and NeoPixel guides explain power/level issues.
Local AVR peripheral execution remains limited to the previously documented
LED/button/potentiometer set; new accessories run in Wokwi after export.
Automatic firmware generation refuses unsupported accessories instead of
silently omitting them. Three preset projects contain matching sketches:
UNO distance sensor, UNO servo sweep and UNO I²C LCD. The ideal simulator servo
supply connection is not a recommendation to power physical motors from USB.

Validation: 109 source tests, including actual Three.js camera projection over
five aspect ratios and two view directions, raised-plane drag coordinates,
OrbitControls pan/zoom behavior, invisible proxy picking, all 12 accessory
round-trips, runtime scope rejection and example electrical connectivity.
Wokwi CLI 0.26.1 refreshed its official definitions, then accepted all 22 diagram
fixtures: five examples, five controller pin contracts and 12 accessory pin
contracts. This validates terminal names/configuration, not firmware execution
or real hardware. No browser pointer/visual QA was performed in this pass.
Reproduce with `pnpm check`, then generate fixtures using
`node --experimental-strip-types scripts/workbench-export-fixtures.ts` and run
`wokwi-cli lint` on each generated directory.

Sources checked on 2026-09-09 are recorded per model in
`lib/workbench/models/accessories.ts`. They include the official Wokwi part
contracts and these manufacturer guides:
- [Arduino servo motors](https://docs.arduino.cc/learn/electronics/servo-motors/)
- [Adafruit HC-SR04 pinouts](https://learn.adafruit.com/ultrasonic-sonar-distance-sensors/pinouts)
- [Adafruit NeoPixel best practices](https://learn.adafruit.com/adafruit-neopixel-uberguide/best-practices)
