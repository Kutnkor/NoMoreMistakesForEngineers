import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PerspectiveCamera,
  Vector3,
  Ray,
  Mesh,
  BoxGeometry,
  Raycaster,
  Vector2,
} from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  fitCamera,
  intersectDragPlane,
  pointerIntent,
} from '../lib/workbench/navigation.ts';
import { accessoryModels } from '../lib/workbench/models/accessories.ts';
import {
  ACCESSORY_EXAMPLES,
  accessoryWorkbench,
} from '../lib/workbench/accessory-examples.ts';
import {
  exportSimulation,
  generateFirmware,
} from '../lib/workbench/simulation.ts';
import { lookupModel } from '../lib/workbench/registry.ts';
import { analyzeWorkbench } from '../lib/workbench/netlist.ts';
import { compareTarget } from '../lib/workbench/target.ts';
import { parseWorkbench } from '../lib/workbench/project.ts';
import { runtimeCircuit } from '../lib/workbench/runtime/circuit.ts';

void test('fit keeps all corners in landscape, portrait and narrow split panes, including top view', () => {
  for (const aspect of [0.35, 0.6, 1, 1.8, 3])
    for (const direction of [
      new Vector3(0.65, 1, 0.8),
      new Vector3(0, 1, 0.016),
    ]) {
      const camera = new PerspectiveCamera(40, aspect, 0.1, 6000);
      const b = { x: -130, y: -40, w: 460, h: 180 };
      fitCamera(camera, b, direction);
      for (const x of [b.x, b.x + b.w])
        for (const z of [b.y, b.y + b.h])
          for (const y of [0, 30]) {
            const ndc = new Vector3(x, y, z).project(camera);
            assert.ok(
              Math.abs(ndc.x) < 0.9 &&
                Math.abs(ndc.y) < 0.9 &&
                Math.abs(ndc.z) < 1,
              JSON.stringify({ aspect, ndc }),
            );
          }
    }
});

void test('dragging a raised wire keeps its pointer anchor on the same plane', () => {
  const camera = new PerspectiveCamera(40, 1.6, 0.1, 6000);
  camera.position.set(110, 150, 200);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const anchor = new Vector3(15, 37, 25),
    target = new Vector3(27, 37, 14),
    caster = new Raycaster();
  for (const p of [anchor, target]) {
    const projected = p.clone().project(camera);
    caster.setFromCamera(new Vector2(projected.x, projected.y), camera);
    assert.ok(intersectDragPlane(caster.ray, 37)!.distanceTo(p) < 1e-9);
  }
  assert.equal(
    intersectDragPlane(
      new Ray(new Vector3(0, 37, 0), new Vector3(1, 0, 0)),
      37,
    ),
    null,
  );
});

void test('navigation override remains available over a component in edit mode', () => {
  assert.equal(pointerIntent('edit', 0, false, false), 'edit');
  assert.equal(pointerIntent('edit', 0, true, false), 'pan');
  assert.equal(pointerIntent('edit', 1, false, false), 'pan');
  assert.equal(pointerIntent('edit', 2, false, false), 'orbit');
  assert.equal(pointerIntent('edit', 0, false, true), 'orbit');
  assert.equal(pointerIntent('pan', 0, false, false), 'pan');
  assert.equal(pointerIntent('orbit', 0, false, false), 'orbit');
});

void test('cheap invisible body proxies are still raycastable without detailed CAD traversal', () => {
  const proxy = new Mesh(new BoxGeometry(68, 1.6, 53));
  proxy.visible = false;
  proxy.updateMatrixWorld();
  const ray = new Raycaster(new Vector3(0, 100, 0), new Vector3(0, -1, 0));
  assert.ok(ray.intersectObject(proxy).length > 0);
  proxy.geometry.dispose();
});

void test('real OrbitControls pan preserves orientation and zoom buttons use the intended direction', () => {
  // A minimal event surface is enough; no WebGL or browser is required.
  class Surface extends EventTarget {
    style = {};
    clientWidth = 1000;
    clientHeight = 625;
    ownerDocument = this;
    getRootNode() {
      return this;
    }
  }
  const camera = new PerspectiveCamera(40, 1.6, 0.1, 6000);
  camera.position.set(100, 150, 180);
  const controls = new OrbitControls(
    camera,
    new Surface() as unknown as HTMLElement,
  );
  controls.enableDamping = false;
  const offset = camera.position.clone().sub(controls.target),
    before = controls.target.clone();
  controls.pan(-35, 20);
  assert.ok(controls.target.distanceTo(before) > 1);
  assert.ok(
    camera.position.clone().sub(controls.target).distanceTo(offset) < 1e-9,
  );
  const distance = camera.position.distanceTo(controls.target);
  controls.dollyIn(0.8);
  assert.ok(camera.position.distanceTo(controls.target) < distance);
  controls.dollyOut(0.8);
  assert.ok(
    Math.abs(camera.position.distanceTo(controls.target) - distance) < 1e-9,
  );
  controls.dispose();
});

void test('all 12 accessories round-trip with documented mappings and no implicit local emulation', () => {
  assert.equal(accessoryModels.length, 12);
  for (const m of accessoryModels) {
    const w = accessoryWorkbench('sonar');
    w.wires = [];
    w.instances = w.instances.filter((i) => i.kind === 'board');
    w.instances.push({
      id: 'accessory',
      name: m.name,
      kind: m.kind,
      modelId: m.id,
      transform: { x: 0, y: 0, rot: 0 },
    });
    assert.ok(m.connectionGuide && m.sources.length);
    assert.equal(m.verification.mechanical, 'unverified');
    assert.ok(m.pins.every((p) => m.simulator?.pins[p.id]));
    assert.doesNotThrow(() => parseWorkbench(w));
    assert.throws(() => runtimeCircuit(w), /peripheral models/);
    assert.equal(generateFirmware(w).code, '');
    const d = JSON.parse(exportSimulation(w).files['diagram.json']);
    assert.equal(
      d.parts.find((p: { id: string }) => p.id === 'accessory').type,
      m.simulator!.type,
    );
  }
});

void test('LCD export selects I2C terminals and all three examples have valid wiring and firmware', () => {
  for (const ex of ACCESSORY_EXAMPLES) {
    const w = accessoryWorkbench(ex.id);
    assert.deepEqual(compareTarget(w, lookupModel), []);
    assert.deepEqual(
      analyzeWorkbench(w, lookupModel).filter((i) => i.severity === 'error'),
      [],
    );
    const files = exportSimulation(w).files;
    assert.ok(files['sketch.ino'].includes('void loop()'));
    if (ex.id === 'lcd') {
      const lcd = JSON.parse(files['diagram.json']).parts.find(
        (p: { id: string }) => p.id === 'module',
      );
      assert.deepEqual(lcd.attrs, { pins: 'i2c', i2cAddress: '0x27' });
      assert.equal(files['libraries.txt'], 'LiquidCrystal I2C\n');
    }
  }
});
