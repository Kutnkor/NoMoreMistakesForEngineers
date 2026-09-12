import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { CircuitAVR } from '../lib/workbench/runtime/avr.ts';
import { runtimeCircuit } from '../lib/workbench/runtime/circuit.ts';
import { accessoryWorkbench } from '../lib/workbench/accessory-examples.ts';
import { demoWorkbench, injectFault } from '../lib/workbench/examples.ts';
import { encodeProject, decodeProject } from '../lib/workbench/sharing.ts';
import { serializeWorkbench, migrateV1 } from '../lib/workbench/project.ts';
import {
  diagnoseSignals,
  inspectConnections,
} from '../lib/workbench/diagnosis.ts';
import { previewTargetRepair } from '../lib/workbench/target.ts';
import { lookupModel } from '../lib/workbench/registry.ts';
import { EXAMPLES } from '../lib/breadboard/circuits.ts';
import { autoPlace } from '../lib/breadboard/model.ts';
import { compilerIssues } from '../lib/workbench/compiler.ts';
const hex = (name: string) =>
  readFileSync(new URL(`./fixtures/avr/${name}.hex`, import.meta.url), 'utf8');
const model = JSON.parse(
  readFileSync(
    new URL('../public/models/fault-mlp.json', import.meta.url),
    'utf8',
  ),
);
const analog = () => {
  const e = EXAMPLES.find((e) => e.id === 'sk-lp')!;
  return migrateV1(e.circuit, autoPlace(e.circuit));
};
void test('Compiled pulseIn and Servo code responds to distance; echo pulse and servo period use simulated time', () => {
  const avr = new CircuitAVR(
    hex('distance-servo'),
    runtimeCircuit(accessoryWorkbench('distance-servo')),
  );
  avr.step(8000000);
  let f = avr.frame();
  assert.ok(Math.abs(f.servos!.servo - 90) < 1);
  assert.match(f.serial, /99\.\d+ cm/);
  const echoes = f.traces!.filter((e) => e.pin === 2),
    rise = echoes.findIndex((e) => e.value === 1);
  assert.ok(Math.abs(echoes[rise + 1].at - echoes[rise].at - 5.8) < 0.001);
  const servoRises = f.traces!.filter((e) => e.pin === 9 && e.value === 1);
  assert.ok(Math.abs(servoRises[2].at - servoRises[1].at - 20) < 0.1);
  avr.setInputs({ buttons: {}, pots: {}, distances: { module: 10 } });
  avr.step(8000000);
  f = avr.frame();
  assert.ok(f.servos!.servo < 1);
  assert.match(f.serial, /9\.\d+ cm/);
  assert.ok(f.duties!.every((d) => d >= 0 && d <= 1));
});
void test('Compiled Wire sketch writes both LCD rows and changes the seconds counter', () => {
  const avr = new CircuitAVR(
    hex('lcd'),
    runtimeCircuit(accessoryWorkbench('lcd')),
  );
  avr.step(8000000);
  let f = avr.frame();
  assert.equal(f.displays!.module.rows[0].trim(), 'CIRCUIT FORGE');
  assert.equal(f.displays!.module.rows[1].trim(), 'Seconds: 0');
  assert.equal(f.displays!.module.backlight, true);
  avr.step(16000000);
  f = avr.frame();
  assert.equal(f.displays!.module.rows[1].trim(), 'Seconds: 1');
});
void test('Local peripheral execution rejects disconnected power, conflicting pins and incorrect I2C wiring', () => {
  for (const id of ['distance-servo', 'lcd', 'sonar', 'servo']) {
    const w = accessoryWorkbench(id);
    assert.doesNotThrow(() => runtimeCircuit(w));
    w.wires.shift();
    assert.throws(() => runtimeCircuit(w), /5 V and common GND/);
  }
  const w = accessoryWorkbench('lcd');
  w.wires.find((w) => w.b.kind === 'component-pin' && w.b.pinId === 'SDA')!.a =
    {
      kind: 'board-pin',
      instanceId: 'uno',
      pinId: lookupModel('uno-rev3')!.pins.find((p) => p.label === 'D8')!.id,
    };
  assert.throws(() => runtimeCircuit(w), /A4.*A5/);
});
void test('Project links preserve Unicode, code, description, layout and wiring and reject malformed or oversized inputs', async () => {
  const w = accessoryWorkbench('distance-servo');
  w.title = 'Ölçüm — 距離';
  w.lesson = 'My distance experiment';
  const restored = await decodeProject('#' + (await encodeProject(w)));
  assert.deepEqual(
    JSON.parse(serializeWorkbench(restored)),
    JSON.parse(serializeWorkbench(w)),
  );
  await assert.rejects(decodeProject('#cf1=broken'));
  await assert.rejects(decodeProject('cf1=' + 'a'.repeat(24001)), /oversized/);
  const bomb =
    'cf1=' + deflateSync(Buffer.from(' '.repeat(250001))).toString('base64url');
  await assert.rejects(decodeProject(bomb), /size limit/);
});
void test('Fault AI handles a supported capacitor drift, abstains outside its domain and previews a reversible repair', () => {
  const w = analog();
  assert.equal(diagnoseSignals(w, model).prediction!.predicted, 'healthy');
  w.instances.find((i) => i.id === 'C1')!.value! *= 0.6;
  assert.equal(diagnoseSignals(w, model).prediction!.predicted, 'c1-drift');
  const issue = inspectConnections(w).find((i) => i.code === 'target-value')!,
    repair = previewTargetRepair(w, issue, lookupModel)!;
  assert.equal(
    diagnoseSignals(repair.next, model).prediction!.predicted,
    'healthy',
  );
  assert.notEqual(
    w.instances.find((i) => i.id === 'C1')!.value,
    repair.next.instances.find((i) => i.id === 'C1')!.value,
  );
  w.wires.shift();
  assert.equal(diagnoseSignals(w, model).prediction, null);
  assert.equal(diagnoseSignals(demoWorkbench(), model).prediction, null);
  const broken = injectFault(demoWorkbench()).workbench;
  assert.ok(inspectConnections(broken).some((i) => i.code === 'target-open'));
});
void test('Compiler diagnostics retain source lines, columns and severity', () => {
  assert.deepEqual(
    compilerIssues(
      "/build/sketch.ino:7:3: error: 'motor' was not declared in this scope\n/build/sketch.ino:10: warning: unused variable",
    ),
    [
      {
        line: 7,
        column: 3,
        severity: 'error',
        message: "'motor' was not declared in this scope",
      },
      { line: 10, column: 1, severity: 'warning', message: 'unused variable' },
    ],
  );
});
