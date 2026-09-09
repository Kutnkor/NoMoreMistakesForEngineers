import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CircuitAVR, parseHex } from '../lib/workbench/runtime/avr.ts';
import { runtimeCircuit } from '../lib/workbench/runtime/circuit.ts';
import {
  demoWorkbench,
  interactiveWorkbench,
} from '../lib/workbench/examples.ts';
import { buildConnectivity } from '../lib/workbench/netlist.ts';
import { lookupModel } from '../lib/workbench/registry.ts';
import { endpointPoint } from '../lib/workbench/geometry.ts';
import {
  serializeWorkbench,
  parseWorkbench,
} from '../lib/workbench/project.ts';
import { unoCAD } from '../lib/workbench/cad/uno-rev3e.ts';
import { megaCAD } from '../lib/workbench/cad/mega-rev3e.ts';
const hex = (name: string) =>
  readFileSync(new URL(`./fixtures/avr/${name}.hex`, import.meta.url), 'utf8');

void test('Compiled C++ drives actual GPIO timing and UART bytes', () => {
  const avr = new CircuitAVR(hex('blink'), runtimeCircuit(demoWorkbench()));
  avr.step(4000000);
  let f = avr.frame();
  assert.ok(f.leds.LED1 > 0.99);
  assert.equal(f.milliseconds, 250);
  assert.equal(f.serial, 'hello\r\n');
  avr.step(8000000);
  avr.frame();
  avr.step(2000000);
  f = avr.frame();
  assert.equal(f.leds.LED1, 0);
  avr.step(6000000);
  avr.frame();
  avr.step(1000000);
  assert.equal(avr.frame().leds.LED1, 1);
});
void test('ADC, timer PWM, button input and serial receive execute together', () => {
  const avr = new CircuitAVR(
    hex('inputs'),
    runtimeCircuit(interactiveWorkbench()),
  );
  avr.setInputs({ buttons: { BUTTON1: false }, pots: { POT1: 0.25 } });
  avr.step(1600000);
  let f = avr.frame();
  assert.match(f.serial, /256,0/);
  assert.ok(Math.abs(f.leds.LED1 - 0.25) < 0.02);
  avr.setInputs({ buttons: { BUTTON1: false }, pots: { POT1: 0.75 } });
  avr.step(1600000);
  f = avr.frame();
  assert.match(f.serial, /768,0/);
  assert.ok(Math.abs(f.leds.LED1 - 0.75) < 0.03);
  avr.setInputs({ buttons: { BUTTON1: true }, pots: { POT1: 0.75 } });
  avr.step(1600000);
  avr.frame();
  avr.step(1600000);
  f = avr.frame();
  assert.equal(f.leds.LED1, 1);
  assert.match(f.serial, /768,1/);
  avr.setInputs({ buttons: { BUTTON1: false }, pots: { POT1: 0.25 } });
  avr.step(1600000);
  avr.frame();
  avr.step(1600000);
  assert.ok(Math.abs(avr.frame().leds.LED1 - 0.25) < 0.02);
  avr.sendSerial('Q');
  avr.step(1600000);
  assert.match(avr.frame().serial, /echo:Q/);
});
void test('Runtime follows restored wiring and rejects broken circuits or unsupported peripherals', () => {
  const w = interactiveWorkbench();
  const restored = parseWorkbench(JSON.parse(serializeWorkbench(w)));
  assert.deepEqual(runtimeCircuit(restored), runtimeCircuit(w));
  const broken = demoWorkbench();
  broken.wires.shift();
  assert.throws(() => runtimeCircuit(broken), /connect the LED/);
  assert.throws(() => runtimeCircuit(demoWorkbench(true)), /peripheral models/);
  const shared = demoWorkbench();
  shared.wires.push({
    id: 'short',
    a: { kind: 'component-pin', instanceId: 'LED1', pinId: '1' },
    b: { kind: 'component-pin', instanceId: 'LED1', pinId: '2' },
    color: '#000',
    route: [],
  });
  assert.throws(() => runtimeCircuit(shared), /same net/);
});
void test('LED polarity and resistor placement are interpreted electrically', () => {
  const w = demoWorkbench();
  const uno = lookupModel('uno-rev3')!;
  const ground = w.wires[0];
  ground.a = {
    kind: 'board-pin',
    instanceId: 'uno',
    pinId: uno.pins.find((p) => p.label === '5V')!.id,
  };
  for (const wire of w.wires)
    for (const side of ['a', 'b'] as const) {
      const e = wire[side];
      if (e.instanceId === 'LED1' && e.kind === 'component-pin')
        wire[side] = { ...e, pinId: e.pinId === '1' ? '2' : '1' };
    }
  assert.equal(runtimeCircuit(w).leds[0].activeLow, true);
});
void test('HEX parser rejects truncation, checksum errors and other architectures flash sizes', () => {
  assert.equal(parseHex(hex('blink')).byteLength, 32768);
  assert.throws(
    () => parseHex(hex('blink').replace(':10', ':11')),
    /length or checksum/,
  );
  assert.throws(() => parseHex(':00000001FF'), /empty/);
  assert.throws(
    () => parseHex(hex('blink').replace(':00000001FF', '')),
    /Incomplete/,
  );
  assert.throws(
    () => parseHex(':020000040001F9\n:0100000001FE\n:00000001FF'),
    /exceeds/,
  );
});
void test('Official UNO and Mega footprints retain stable endpoint identities and correct XY', () => {
  const uno = lookupModel('uno-rev3')!,
    mega = lookupModel('mega-2560')!;
  assert.equal(uno.pins.find((p) => p.label === 'D9')!.x, 39.116);
  assert.equal(uno.pins.find((p) => p.label === 'A0')!.x, 50.8);
  assert.equal(mega.pins.find((p) => p.label === 'D22')!.x, 93.98);
  assert.equal(mega.pins.find((p) => p.label === 'D53')!.y, 43.18);
  assert.equal(mega.pins.find((p) => p.label === 'D21')!.x, 86.36);
  assert.equal(mega.pins.find((p) => p.label === 'D14')!.x, 68.58);
  const graph = buildConnectivity(demoWorkbench(), lookupModel);
  assert.ok(
    graph.connected(
      { kind: 'board-pin', instanceId: 'uno', pinId: 'PWR2' },
      { kind: 'board-pin', instanceId: 'uno', pinId: 'PWR5' },
    ),
  );
  for (const model of [uno, mega, lookupModel('raspberry-pi-pico')!])
    for (const pin of model.pins) {
      assert.ok(
        pin.x >= 0 && pin.x <= model.body.w,
        `${model.name} ${pin.label} x`,
      );
      assert.ok(pin.y >= 0 && pin.y <= model.body.h);
    }
  for (const [cad, model] of [
    [unoCAD, uno],
    [megaCAD, mega],
  ] as const) {
    assert.equal(cad.mounts.length, model.mounts!.length);
    assert.ok(cad.outline.every((p) => p.every(Number.isFinite)));
  }
  const w = demoWorkbench();
  const end = w.wires[2].a;
  const point = endpointPoint(end, w, lookupModel)!;
  const b = w.instances.find((i) => i.id === 'uno')!;
  assert.equal(point.x, b.transform.x + 39.116 - uno.origin.x);
});
