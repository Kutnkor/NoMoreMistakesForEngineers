import test from 'node:test';
import assert from 'node:assert/strict';
import { demoWorkbench, injectFault } from '../lib/workbench/examples.ts';
import { compareTarget, repairOpen } from '../lib/workbench/target.ts';
import {
  lookupModel,
  libraryEntries,
  physicalModels,
} from '../lib/workbench/registry.ts';
import {
  analyzeWorkbench,
  buildConnectivity,
} from '../lib/workbench/netlist.ts';
import {
  exportSimulation,
  generateFirmware,
  simulatorPin,
} from '../lib/workbench/simulation.ts';
import { moveInstance, rotateInstance } from '../lib/workbench/mount.ts';
import {
  followRoutes,
  removeInstance,
  tidyWires,
} from '../lib/workbench/edit.ts';
import {
  parseWorkbench,
  serializeWorkbench,
  migrateV1,
  commit,
  emptyHistory,
  undo,
} from '../lib/workbench/project.ts';
import { endpointPoint } from '../lib/workbench/geometry.ts';
import { EXAMPLES } from '../lib/breadboard/circuits.ts';
import { autoPlace } from '../lib/breadboard/model.ts';
import type { ConnectionEndpoint } from '../lib/workbench/types.ts';

void test('both complete examples have matching targets, no electrical errors and runnable project files', () => {
  for (const full of [false, true]) {
    const w = demoWorkbench(full);
    assert.deepEqual(compareTarget(w, lookupModel), []);
    assert.deepEqual(
      analyzeWorkbench(w, lookupModel).filter((i) => i.severity === 'error'),
      [],
    );
    const p = exportSimulation(w);
    const d = JSON.parse(p.files['diagram.json']);
    assert.equal(d.parts.length, w.instances.length - 1);
    assert.ok(p.files['sketch.ino'].includes('digitalWrite(9'));
    if (full) {
      assert.ok(p.files['sketch.ino'].includes('analogRead(A0)'));
      assert.ok(p.files['sketch.ino'].includes('DHT sensor_DHT1(4'));
      assert.ok(p.files['libraries.txt'].includes('Adafruit SSD1306'));
    }
    assert.deepEqual(
      parseWorkbench(JSON.parse(p.files['workbench.json'])),
      parseWorkbench(w),
    );
  }
});
void test('removing the ground jumper is detected; a repair preview fixes it and undo restores the fault', () => {
  const bad = injectFault(demoWorkbench()).workbench;
  const issue = compareTarget(bad, lookupModel).find(
    (i) => i.code === 'target-open',
  )!;
  assert.ok(issue);
  const preview = repairOpen(bad, issue, lookupModel)!;
  assert.ok(preview);
  assert.deepEqual(compareTarget(preview, lookupModel), []);
  assert.ok(compareTarget(bad, lookupModel).length);
  const h = commit(emptyHistory(), bad, 'repair');
  assert.deepEqual(undo(h, preview)?.workbench, bad);
});
void test('reference comparison distinguishes missing parts, wrong values and a shorted resistor', () => {
  const w = demoWorkbench(),
    resistor = w.instances.find((i) => i.id === 'R1')!;
  resistor.value = 1000;
  assert.ok(
    compareTarget(w, lookupModel).some((i) => i.code === 'target-value'),
  );
  w.wires.push({
    id: 'short',
    a: { kind: 'component-pin', instanceId: 'R1', pinId: '1' },
    b: { kind: 'component-pin', instanceId: 'R1', pinId: '2' },
    color: 'red',
    route: [],
  });
  assert.ok(
    compareTarget(w, lookupModel).some((i) => i.code === 'target-short'),
  );
  assert.ok(
    compareTarget(removeInstance(w, 'LED1'), lookupModel).some(
      (i) => i.code === 'target-missing',
    ),
  );
});
void test('all five analog reference circuits preserve their electrical target on migration', () => {
  for (const e of EXAMPLES) {
    const w = migrateV1(e.circuit, autoPlace(e.circuit));
    assert.deepEqual(compareTarget(w, lookupModel), [], e.id);
  }
});
void test('library product identifiers are unique and non-capacitive parts have no farad values', () => {
  const entries = libraryEntries();
  assert.equal(new Set(entries.map((e) => e.id)).size, entries.length);
  for (const i of demoWorkbench(true).instances.filter((i) =>
    ['part-led', 'part-button'].includes(i.modelId),
  ))
    assert.equal(i.value, undefined);
  for (const m of physicalModels.filter((m) => m.kind === 'board'))
    assert.ok(typeof m.logicVoltage === 'number');
});
void test('logic check uses metadata for a new 3.3 V model with an arbitrary name', () => {
  const w = demoWorkbench(),
    uno = lookupModel('uno-rev3')!;
  const extra = structuredClone(uno);
  extra.id = 'new-low-voltage';
  extra.logicVoltage = 3.3;
  w.instances.push({
    id: 'extra',
    name: 'Extra',
    kind: 'board',
    modelId: extra.id,
    transform: { x: 100, y: 100, rot: 0 },
  });
  const p = uno.pins.find((p) => p.label === 'D2')!.id;
  w.wires.push({
    id: 'logic',
    a: { kind: 'board-pin', instanceId: 'uno', pinId: p },
    b: { kind: 'board-pin', instanceId: 'extra', pinId: p },
    color: 'green',
    route: [],
  });
  assert.ok(
    analyzeWorkbench(w, (id) =>
      id === extra.id ? extra : lookupModel(id),
    ).some((i) => i.code === 'logic-level'),
  );
  extra.logicVoltage = null;
  assert.ok(
    analyzeWorkbench(w, (id) =>
      id === extra.id ? extra : lookupModel(id),
    ).some((i) => i.code === 'logic-level-unknown'),
  );
});
void test('wire routing and board movement keep electrical endpoints, bend continuity and targets', () => {
  const w = tidyWires(demoWorkbench());
  const before = structuredClone(w);
  const next = followRoutes(w, moveInstance(w, 'uno', 20, 10));
  assert.deepEqual(compareTarget(next, lookupModel), []);
  assert.notDeepEqual(next.wires[0].route, w.wires[0].route);
  assert.deepEqual(
    next.wires.map((x) => [x.a, x.b]),
    w.wires.map((x) => [x.a, x.b]),
  );
  assert.deepEqual(w, before);
});
void test('3D endpoints sit on the breadboard top rather than under it', () => {
  const w = demoWorkbench();
  const e: ConnectionEndpoint = {
    kind: 'breadboard-hole',
    instanceId: 'bb1',
    holeId: '1-T-',
  };
  assert.equal(
    endpointPoint(e, w, lookupModel)?.z,
    lookupModel('breadboard-830')!.body.t,
  );
});
void test('moving a mounted part detaches it and deleting a host keeps parts at their visible position', () => {
  const e = EXAMPLES.find((e) => e.id === 'rc')!;
  const w = migrateV1(e.circuit, autoPlace(e.circuit));
  const moved = moveInstance(w, 'R1', 10, 0);
  assert.equal(moved.instances.find((i) => i.id === 'R1')?.mounted, undefined);
  const removed = removeInstance(w, 'bb1');
  assert.ok(removed.instances.every((i) => !i.mounted));
  assert.doesNotThrow(() => parseWorkbench(removed));
});
void test('malformed geometry and lost mounts are rejected rather than silently repaired', () => {
  const w = demoWorkbench();
  w.wires[0].route = [{ x: Infinity, y: 1 }];
  assert.throws(() => parseWorkbench(w), /waypoints/);
  w.wires[0].route = [];
  w.instances[1].mounted = { boardInstanceId: 'missing', pins: {} };
  assert.throws(() => parseWorkbench(w), /mount/);
});
void test('export refuses unsupported analog parts, short circuits and missing firmware', () => {
  const e = EXAMPLES[0];
  const w = migrateV1(e.circuit, autoPlace(e.circuit));
  assert.throws(() => exportSimulation(w));
  const bad = demoWorkbench();
  const m = lookupModel('uno-rev3')!;
  bad.wires.push({
    id: 'power-short',
    a: {
      kind: 'board-pin',
      instanceId: 'uno',
      pinId: m.pins.find((p) => p.label === '5V')!.id,
    },
    b: {
      kind: 'board-pin',
      instanceId: 'uno',
      pinId: m.pins.find((p) => p.label === 'GND')!.id,
    },
    color: 'red',
    route: [],
  });
  assert.throws(() => exportSimulation(bad), /short/);
});
void test('firmware follows a moved signal wire instead of using a fixed pin number', () => {
  const w = demoWorkbench();
  const wire = w.wires.find(
    (x) => x.a.kind === 'board-pin' && x.b.instanceId === 'R1',
  )!;
  wire.a = {
    kind: 'board-pin',
    instanceId: 'uno',
    pinId: lookupModel('uno-rev3')!.pins.find((p) => p.label === 'D6')!.id,
  };
  assert.ok(generateFirmware(w).code.includes('digitalWrite(6'));
});
void test('UNO 3.3V simulator terminal uses the official spelling', () => {
  const w = demoWorkbench(),
    uno = w.instances.find((i) => i.id === 'uno')!;
  const pin = lookupModel(uno.modelId)!.pins.find((p) => p.label === '3V3')!;
  assert.equal(simulatorPin(uno, pin.id), '3.3V');
});
void test('simulation connections preserve pairwise copper connectivity', () => {
  const w = demoWorkbench(true),
    d = JSON.parse(exportSimulation(w).files['diagram.json']);
  const adjacent = new Map<string, Set<string>>();
  for (const [a, b] of d.connections) {
    if (!adjacent.has(a)) adjacent.set(a, new Set());
    if (!adjacent.has(b)) adjacent.set(b, new Set());
    adjacent.get(a)!.add(b);
    adjacent.get(b)!.add(a);
  }
  const connected = (a: string, b: string) => {
    const q = [a],
      seen = new Set(q);
    while (q.length) {
      const x = q.pop()!;
      if (x === b) return true;
      for (const y of adjacent.get(x) ?? [])
        if (!seen.has(y)) {
          seen.add(y);
          q.push(y);
        }
    }
    return false;
  };
  const c = buildConnectivity(w, lookupModel);
  const endpoints = w.instances
    .filter((i) => i.kind !== 'breadboard')
    .flatMap((i) =>
      lookupModel(i.modelId)!
        .pins.filter((p) => simulatorPin(i, p.id))
        .map((p) => ({
          e: {
            kind: i.kind === 'board' ? 'board-pin' : 'component-pin',
            instanceId: i.id,
            pinId: p.id,
          } as ConnectionEndpoint,
          s: `${i.id}:${simulatorPin(i, p.id)}`,
        })),
    );
  for (const a of endpoints)
    for (const b of endpoints)
      assert.equal(connected(a.s, b.s), c.connected(a.e, b.e), `${a.s} ${b.s}`);
});
void test('project saves preserve reference and firmware across serialization and rotation', () => {
  const w = demoWorkbench(true);
  w.firmware = generateFirmware(w).code;
  const next = rotateInstance(w, 'uno');
  assert.deepEqual(compareTarget(next, lookupModel), []);
  assert.equal(
    parseWorkbench(JSON.parse(serializeWorkbench(next))).firmware,
    w.firmware,
  );
});

void test('reducer actions are pure and a complete drag is exactly one undo step', async () => {
  const { initialSession, sessionReducer } =
    await import('../lib/workbench/session.ts');
  const start = initialSession(demoWorkbench());
  const first = sessionReducer(start, {
    type: 'edit',
    label: 'drag',
    coalesce: true,
    change: (w) => moveInstance(w, 'uno', 10, 0),
  });
  const again = sessionReducer(start, {
    type: 'edit',
    label: 'drag',
    coalesce: true,
    change: (w) => moveInstance(w, 'uno', 10, 0),
  });
  assert.deepEqual(first, again);
  assert.equal(start.history.past.length, 0);
  const second = sessionReducer(first, {
    type: 'edit',
    label: 'drag',
    coalesce: true,
    change: (w) => moveInstance(w, 'uno', 10, 0),
  });
  const done = sessionReducer(second, {
    type: 'history',
    change: (h) => ({ ...h, lastLabel: undefined }),
  });
  assert.equal(done.history.past.length, 1);
  assert.deepEqual(
    sessionReducer(done, { type: 'undo' }).workbench,
    start.workbench,
  );
});

void test('Pico analogue ground is continuous with the other on-board ground pins', () => {
  const model = lookupModel('raspberry-pi-pico')!;
  const w = {
    version: 2 as const,
    title: 'Pico',
    wires: [],
    instances: [
      {
        id: 'pico',
        name: 'Pico',
        modelId: model.id,
        kind: 'board' as const,
        transform: { x: 0, y: 0, rot: 0 as const },
      },
    ],
  };
  const c = buildConnectivity(w, lookupModel);
  assert.ok(
    c.connected(
      { kind: 'board-pin', instanceId: 'pico', pinId: 'Q8' },
      { kind: 'board-pin', instanceId: 'pico', pinId: 'P3' },
    ),
  );
  assert.equal(simulatorPin(w.instances[0], 'Q8'), 'GND.7');
});
void test('short and value repairs offer a reversible, topology-improving preview', async () => {
  const { previewTargetRepair } = await import('../lib/workbench/target.ts');
  const w = demoWorkbench();
  w.wires.push({
    id: 'bad',
    a: { kind: 'component-pin', instanceId: 'R1', pinId: '1' },
    b: { kind: 'component-pin', instanceId: 'R1', pinId: '2' },
    color: 'red',
    route: [],
  });
  const issue = compareTarget(w, lookupModel).find(
    (i) => i.code === 'target-short',
  )!;
  const p = previewTargetRepair(w, issue, lookupModel)!;
  assert.ok(p);
  assert.deepEqual(compareTarget(p.next, lookupModel), []);
  assert.equal(w.wires.length, p.next.wires.length + 1);
});

void test('moving a rotated breadboard carries mounted terminals once without changing child orientation', () => {
  const ex = EXAMPLES.find((e) => e.id === 'rc')!;
  const w = rotateInstance(migrateV1(ex.circuit, autoPlace(ex.circuit)), 'bb1');
  const e: ConnectionEndpoint = {
    kind: 'component-pin',
    instanceId: 'R1',
    pinId: '1',
  };
  const before = endpointPoint(e, w, lookupModel)!;
  const next = moveInstance(w, 'bb1', 17, -6),
    after = endpointPoint(e, next, lookupModel)!;
  assert.equal(after.x, before.x + 17);
  assert.equal(after.y, before.y - 6);
  assert.deepEqual(
    next.instances.find((i) => i.id === 'R1'),
    w.instances.find((i) => i.id === 'R1'),
  );
});
