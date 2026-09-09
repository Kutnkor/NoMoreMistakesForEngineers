import { lookupModel } from './registry.ts';
import { captureTarget } from './target.ts';
import type { ConnectionEndpoint, Workbench } from './types.ts';
import { defaultValue } from './models/parts.ts';

export function demoWorkbench(full = false): Workbench {
  const w: Workbench = {
    version: 2,
    title: full ? 'UNO sensor station' : 'UNO LED starter',
    instances: [],
    wires: [],
  };
  const add = (
    id: string,
    modelId: string,
    x: number,
    y: number,
    value?: number,
  ) => {
    const m = lookupModel(modelId)!;
    w.instances.push({
      id,
      modelId,
      kind: m.kind,
      name: id === 'uno' ? 'Arduino UNO' : id,
      transform: { x, y, rot: 0 },
      ...defaultValue(modelId),
      ...(value ? { value } : {}),
    });
  };
  add('bb1', 'breadboard-830', 0, 0);
  add('uno', 'uno-rev3', -45, 85);
  add('R1', 'part-resistor', 30, 66, 330);
  add('LED1', 'part-led', 65, 65);
  const pin = (id: string, label: string): ConnectionEndpoint => {
    const i = w.instances.find((x) => x.id === id)!;
    const pins = lookupModel(i.modelId)!.pins;
    const p =
      pins.find((p) => p.label === label) ?? pins.find((p) => p.id === label);
    if (!p) throw Error(`Missing pin ${id}.${label}`);
    return {
      kind: i.kind === 'board' ? 'board-pin' : 'component-pin',
      instanceId: id,
      pinId: p.id,
    };
  };
  const hole = (id: string): ConnectionEndpoint => ({
    kind: 'breadboard-hole',
    instanceId: 'bb1',
    holeId: id,
  });
  const wire = (
    a: ConnectionEndpoint,
    b: ConnectionEndpoint,
    color = '#0d9488',
  ) => w.wires.push({ id: `w${w.wires.length + 1}`, a, b, color, route: [] });
  wire(pin('uno', 'GND'), hole('1-T-'), '#25354a');
  wire(hole('2-T-'), pin('LED1', '2'), '#25354a');
  wire(pin('uno', 'D9'), pin('R1', '1'));
  wire(pin('R1', '2'), pin('LED1', '1'), '#dc4545');
  if (full) {
    add('POT1', 'part-potentiometer', 45, -55);
    add('BUTTON1', 'part-button', 75, -50);
    add('OLED1', 'module-ssd1306', 115, -25);
    add('DHT1', 'module-dht22', 115, 35);
    add('R2', 'part-resistor', 90, 65, 10000);
    wire(pin('uno', '5V'), hole('1-T+'), '#dc4545');
    for (const [id, p, n] of [
      ['POT1', '1', 2],
      ['OLED1', 'VCC', 3],
      ['DHT1', 'VCC', 4],
      ['R2', '1', 5],
    ] as const)
      wire(hole(`${n}-T+`), pin(id, p), '#dc4545');
    for (const [id, p, n] of [
      ['POT1', '3', 3],
      ['BUTTON1', '2', 4],
      ['OLED1', 'GND', 5],
      ['DHT1', 'GND', 6],
    ] as const)
      wire(hole(`${n}-T-`), pin(id, p), '#25354a');
    wire(pin('uno', 'A0'), pin('POT1', '2'));
    wire(pin('uno', 'D2'), pin('BUTTON1', '1'));
    wire(pin('uno', 'A4'), pin('OLED1', 'SDA'), '#4169c1');
    wire(pin('uno', 'A5'), pin('OLED1', 'SCL'), '#a15ad1');
    wire(pin('uno', 'D4'), pin('DHT1', 'SDA'));
    wire(pin('R2', '2'), pin('DHT1', 'SDA'));
  }
  return captureTarget(w, lookupModel);
}

export function injectFault(
  w: Workbench,
  index = 0,
): { workbench: Workbench; removedWireId: string } {
  if (!w.wires.length || !w.target)
    throw Error('Load a reference example with wires first.');
  const wire = w.wires[index % w.wires.length];
  return {
    workbench: { ...w, wires: w.wires.filter((x) => x.id !== wire.id) },
    removedWireId: wire.id,
  };
}

/** Small, runnable circuit with no unsupported sensor/display peripherals. */
export function interactiveWorkbench(): Workbench {
  const w = demoWorkbench(true);
  const keep = new Set(['bb1', 'uno', 'R1', 'LED1', 'POT1', 'BUTTON1']);
  w.instances = w.instances.filter((i) => keep.has(i.id));
  w.wires = w.wires.filter(
    (c) => keep.has(c.a.instanceId) && keep.has(c.b.instanceId),
  );
  w.title = 'UNO live inputs';
  w.firmware = `// Turn the potentiometer to dim the LED. Press the button for full brightness.
void setup() {
  pinMode(9, OUTPUT);
  pinMode(2, INPUT_PULLUP);
  Serial.begin(115200);
}
void loop() {
  int sensor = analogRead(A0);
  bool pressed = digitalRead(2) == LOW;
  analogWrite(9, pressed ? 255 : sensor / 4);
  Serial.print("A0: "); Serial.print(sensor);
  Serial.print(" | Button: "); Serial.println(pressed ? "pressed" : "released");
  delay(50);
}
`;
  w.libraries = '';
  return captureTarget(w, lookupModel);
}
