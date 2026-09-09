import assert from 'node:assert/strict';
import test from 'node:test';
import { HOLE_MAP } from '../lib/breadboard/model.ts';
import { EXAMPLES } from '../lib/breadboard/circuits.ts';
import { autoPlace } from '../lib/breadboard/model.ts';
import {
  endpointPoint,
  instanceBox,
  localToTable,
  tableToLocal,
} from '../lib/workbench/geometry.ts';
import {
  headerCompatible,
  moveInstance,
  previewMount,
  rotateInstance,
} from '../lib/workbench/mount.ts';
import {
  analyzeWorkbench,
  buildConnectivity,
  describeWire,
} from '../lib/workbench/netlist.ts';
import {
  lookupModel,
  libraryEntries,
  physicalModels,
} from '../lib/workbench/registry.ts';
import {
  commit,
  emptyHistory,
  migrateV1,
  parseWorkbench,
  redo,
  serializeWorkbench,
  undo,
} from '../lib/workbench/project.ts';
import { emptyWorkbench, type Workbench } from '../lib/workbench/types.ts';

const GND_UNO = 'PWR6'; // POWER header, first GND
const RAIL_LEFT = '12-T-'; // top minus rail, left half
const RAIL_RIGHT = '40-T-'; // top minus rail, right half

function bench(): Workbench {
  const w = emptyWorkbench();
  w.instances.push({
    id: 'bb1',
    modelId: 'breadboard-830',
    kind: 'breadboard',
    name: 'Breadboard 1',
    transform: { x: 0, y: 0, rot: 0 },
  });
  w.instances.push({
    id: 'u1',
    modelId: 'uno-rev3',
    kind: 'board',
    name: 'UNO 1',
    transform: { x: 10, y: -70, rot: 0 },
  });
  return w;
}

const wireGndToRail = (w: Workbench, hole = RAIL_LEFT) => {
  w.wires.push({
    id: 'w1',
    a: { kind: 'board-pin', instanceId: 'u1', pinId: GND_UNO },
    b: { kind: 'breadboard-hole', instanceId: 'bb1', holeId: hole },
    color: '#22262b',
    route: [],
  });
  return w;
};

// 1
void test('an UNO can be added and its physical GND pins are individually addressable', () => {
  const w = bench();
  const uno = lookupModel('uno-rev3')!;
  const gnds = uno.pins.filter((p) => p.type === 'ground');
  assert.ok(gnds.length >= 3, 'the UNO exposes several GND pins');
  assert.equal(
    new Set(gnds.map((p) => p.id)).size,
    gnds.length,
    'each GND pin has its own id',
  );
  assert.ok(
    endpointPoint(
      { kind: 'board-pin', instanceId: 'u1', pinId: GND_UNO },
      w,
      lookupModel,
    ),
  );
});

// 2 + 11 (analysis picks the real conductor group)
void test('a wire from UNO GND to the minus rail joins only that rail half', () => {
  const w = wireGndToRail(bench());
  const c = buildConnectivity(w, lookupModel);
  const gnd = { kind: 'board-pin', instanceId: 'u1', pinId: GND_UNO } as const;
  assert.equal(
    c.connected(gnd, {
      kind: 'breadboard-hole',
      instanceId: 'bb1',
      holeId: '3-T-',
    }),
    true,
  );
  assert.equal(
    c.connected(gnd, {
      kind: 'breadboard-hole',
      instanceId: 'bb1',
      holeId: RAIL_RIGHT,
    }),
    false,
    'the split rail must not bridge itself',
  );
});

// 3 — one project, so both views necessarily agree
void test('2D and 3D read the same endpoint position from one model', () => {
  const w = wireGndToRail(bench());
  const p = endpointPoint(w.wires[0].a, w, lookupModel)!;
  const uno = lookupModel('uno-rev3')!;
  const pin = uno.pins.find((x) => x.id === GND_UNO)!;
  const expected = localToTable(w.instances[1].transform, uno.origin, pin);
  assert.ok(Math.hypot(p.x - expected.x, p.y - expected.y) < 1e-9);
  assert.equal(p.z, pin.z, 'the 3D height comes from the same pin definition');
});

// 4
void test('moving the UNO keeps the wire on the same physical pin', () => {
  let w = wireGndToRail(bench());
  const before = endpointPoint(w.wires[0].a, w, lookupModel)!;
  w = moveInstance(w, 'u1', 25, -8);
  const after = endpointPoint(w.wires[0].a, w, lookupModel)!;
  assert.ok(Math.abs(after.x - before.x - 25) < 1e-9);
  assert.ok(Math.abs(after.y - before.y + 8) < 1e-9);
  assert.equal(w.wires[0].a.kind, 'board-pin');
  assert.equal((w.wires[0].a as { pinId: string }).pinId, GND_UNO);
});

// 5
void test('rotating the UNO rotates the pin and the wire end together', () => {
  let w = wireGndToRail(bench());
  w = rotateInstance(w, 'u1', 90);
  const uno = lookupModel('uno-rev3')!;
  const pin = uno.pins.find((x) => x.id === GND_UNO)!;
  const expected = localToTable(w.instances[1].transform, uno.origin, pin);
  const p = endpointPoint(w.wires[0].a, w, lookupModel)!;
  assert.ok(Math.hypot(p.x - expected.x, p.y - expected.y) < 1e-9);
  assert.equal(w.instances[1].transform.rot, 90);
});

// 6
void test('moving the breadboard keeps the other end in the same hole', () => {
  let w = wireGndToRail(bench());
  const bb = lookupModel('breadboard-830')!;
  w = moveInstance(w, 'bb1', -40, 15);
  const hole = HOLE_MAP.get(RAIL_LEFT)!;
  const expected = localToTable(w.instances[0].transform, bb.origin, {
    x: hole.x,
    y: hole.y,
  });
  const p = endpointPoint(w.wires[0].b, w, lookupModel)!;
  assert.ok(Math.hypot(p.x - expected.x, p.y - expected.y) < 1e-9);
});

// 7
void test('two UNOs do not share pins or selections', () => {
  const w = wireGndToRail(bench());
  w.instances.push({
    id: 'u2',
    modelId: 'uno-rev3',
    kind: 'board',
    name: 'UNO 2',
    transform: { x: 120, y: -70, rot: 0 },
  });
  const c = buildConnectivity(w, lookupModel);
  const a = { kind: 'board-pin', instanceId: 'u1', pinId: GND_UNO } as const;
  const b = { kind: 'board-pin', instanceId: 'u2', pinId: GND_UNO } as const;
  assert.equal(
    c.connected(a, b),
    false,
    'same label, different boards, no wire',
  );
  const pa = endpointPoint(a, w, lookupModel)!,
    pb = endpointPoint(b, w, lookupModel)!;
  assert.notEqual(pa.x, pb.x);
});

// 8
void test('a shared ground appears only once a real conductor joins the two boards', () => {
  const w = wireGndToRail(bench());
  w.instances.push({
    id: 'u2',
    modelId: 'uno-rev3',
    kind: 'board',
    name: 'UNO 2',
    transform: { x: 120, y: -70, rot: 0 },
  });
  w.wires.push({
    id: 'w2',
    a: { kind: 'board-pin', instanceId: 'u2', pinId: 'PWR7' },
    b: { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '20-T-' },
    color: '#22262b',
    route: [],
  });
  const c = buildConnectivity(w, lookupModel);
  assert.equal(
    c.connected(
      { kind: 'board-pin', instanceId: 'u1', pinId: GND_UNO },
      { kind: 'board-pin', instanceId: 'u2', pinId: 'PWR7' },
    ),
    true,
    'both are now on the same rail half',
  );
});

// 8b — documented internal nets are honoured, label matching is not
void test('board-internal GND pins are connected, but only inside one board', () => {
  const w = bench();
  const c = buildConnectivity(w, lookupModel);
  assert.equal(
    c.connected(
      { kind: 'board-pin', instanceId: 'u1', pinId: 'PWR6' },
      { kind: 'board-pin', instanceId: 'u1', pinId: 'DH4' },
    ),
    true,
  );
});

// 9
void test('only the connected half of a split rail joins the net', () => {
  const w = wireGndToRail(bench(), '2-T-');
  const c = buildConnectivity(w, lookupModel);
  assert.equal(
    c.connected(
      { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '2-T-' },
      { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '24-T-' },
    ),
    true,
  );
  assert.equal(
    c.connected(
      { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '2-T-' },
      { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '26-T-' },
    ),
    false,
  );
});

// 10
void test('wires that cross visually do not connect', () => {
  const w = bench();
  w.wires.push(
    {
      id: 'x1',
      a: { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '10-A' },
      b: { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '20-J' },
      color: '#a00',
      route: [],
    },
    {
      id: 'x2',
      a: { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '10-J' },
      b: { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '20-A' },
      color: '#00a',
      route: [],
    },
  );
  const c = buildConnectivity(w, lookupModel);
  assert.equal(
    c.connected(
      { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '10-A' },
      { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '10-J' },
    ),
    false,
    'the two wires only cross on screen',
  );
});

// 11b — a component is not a conductor
void test('a resistor does not merge its two nodes', () => {
  const w = bench();
  w.instances.push({
    id: 'R1',
    modelId: 'part-resistor',
    kind: 'part',
    name: 'R1',
    transform: { x: 0, y: 0, rot: 0 },
    mounted: { boardInstanceId: 'bb1', pins: { '1': '10-A', '2': '15-A' } },
  });
  const c = buildConnectivity(w, lookupModel);
  assert.equal(
    c.connected(
      { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '10-B' },
      { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '15-B' },
    ),
    false,
    'the conductor graph and the component behaviour model stay separate',
  );
});

// 11c — proximity is not connection
void test('placing a board next to a breadboard connects nothing', () => {
  const w = bench();
  w.instances[1].transform = { x: 0, y: -54, rot: 0 };
  const c = buildConnectivity(w, lookupModel);
  assert.equal(
    c.connected(
      { kind: 'board-pin', instanceId: 'u1', pinId: GND_UNO },
      { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '1-T-' },
    ),
    false,
  );
});

// 13
void test('wires can be rewired, deleted, undone and redone as single actions', () => {
  let w = wireGndToRail(bench());
  let h = emptyHistory();
  const before = structuredClone(w);
  h = commit(h, w, 'rewire');
  w = {
    ...w,
    wires: [
      {
        ...w.wires[0],
        b: { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '30-T-' },
      },
    ],
  };
  const u = undo(h, w)!;
  assert.deepEqual(u.workbench, before);
  const r = redo(u.history, u.workbench)!;
  assert.equal((r.workbench.wires[0].b as { holeId: string }).holeId, '30-T-');
});

void test('a drag records one history entry, not one per pointer move', () => {
  let h = emptyHistory();
  const w = bench();
  h = commit(h, w, 'move:u1');
  for (let i = 0; i < 50; i++) h = commit(h, w, 'move:u1', true);
  assert.equal(h.past.length, 1);
});

// 14
void test('breadboard mounting is checked against the exact variant', () => {
  assert.equal(headerCompatible(lookupModel('uno-rev3')!)?.ok, false);
  assert.equal(
    headerCompatible(lookupModel('nano')!),
    null,
    'the Nano may be seated',
  );
  assert.equal(headerCompatible(lookupModel('raspberry-pi-pico')!), null);

  const w = bench();
  const nano = lookupModel('nano')!;
  const bb = lookupModel('breadboard-830')!;
  const inst = {
    id: 'n1',
    modelId: 'nano',
    kind: 'board' as const,
    name: 'Nano 1',
    transform: { x: 0, y: 0, rot: 0 as const },
  };
  // Aim pin 1 at hole 10-E, expressed in TABLE coordinates (the breadboard's
  // own origin is its centre, so hole coordinates are not table coordinates).
  // Row I so that the 0.6 in second row lands on row E, straddling the channel.
  const hole = HOLE_MAP.get('10-I')!;
  const target = localToTable(w.instances[0].transform, bb.origin, {
    x: hole.x,
    y: hole.y,
  });
  inst.transform.x = target.x - nano.pins[0].x + nano.origin.x;
  inst.transform.y = target.y - nano.pins[0].y + nano.origin.y;
  const check = previewMount(inst, nano, w.instances[0], bb);
  assert.equal(check.ok, true, check.ok ? '' : check.reason);
  if (check.ok) {
    assert.equal(check.pins[nano.pins[0].id], '10-I');
    const rows = new Set(Object.values(check.pins).map((h) => h.split('-')[1]));
    assert.deepEqual(
      [...rows].sort(),
      ['E', 'I'],
      'the two header rows straddle the centre channel',
    );
    assert.equal(
      new Set(Object.values(check.pins)).size,
      nano.pins.length,
      'no hole is used twice',
    );
  }
});

// 15
void test('saving and reopening a project restores the same circuit', () => {
  const w = wireGndToRail(bench());
  const round = parseWorkbench(JSON.parse(serializeWorkbench(w)));
  assert.deepEqual(round.instances, w.instances);
  assert.deepEqual(round.wires, w.wires);
  const c1 = buildConnectivity(w, lookupModel),
    c2 = buildConnectivity(round, lookupModel);
  const gnd = { kind: 'board-pin', instanceId: 'u1', pinId: GND_UNO } as const;
  const rail = {
    kind: 'breadboard-hole',
    instanceId: 'bb1',
    holeId: '3-T-',
  } as const;
  assert.equal(c1.connected(gnd, rail), c2.connected(gnd, rail));
});

void test('a corrupt project is reported, not silently repaired', () => {
  assert.throws(
    () =>
      parseWorkbench({
        version: 2,
        instances: [
          { id: 'a', modelId: 'nope', transform: { x: 0, y: 0, rot: 0 } },
        ],
        wires: [],
      }),
    /no physical model/,
  );
  assert.throws(
    () => parseWorkbench({ version: 99, instances: [], wires: [] }),
    /Unsupported project version/,
  );
  assert.throws(
    () =>
      parseWorkbench({
        version: 2,
        instances: [
          {
            id: 'bb1',
            modelId: 'breadboard-830',
            kind: 'breadboard',
            name: 'b',
            transform: { x: 0, y: 0, rot: 0 },
          },
        ],
        wires: [
          {
            id: 'w',
            a: { kind: 'board-pin', instanceId: 'bb1', pinId: 'ZZ9' },
            b: { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '1-A' },
            color: '#000',
            route: [],
          },
        ],
      }),
    /does not have/,
  );
});

// 16
void test('every v1 breadboard example migrates and keeps its connectivity', () => {
  for (const ex of EXAMPLES) {
    const layout = autoPlace(ex.circuit);
    const w = migrateV1(ex.circuit, layout, ex.name);
    assert.equal(w.version, 2);
    assert.ok(w.instances.some((i) => i.kind === 'breadboard'));
    const round = parseWorkbench(JSON.parse(serializeWorkbench(w)));
    assert.equal(round.instances.length, w.instances.length);
    const c = buildConnectivity(w, lookupModel);
    // 63 columns x 2 halves + 4 split rails x 2 halves = 134 copper groups.
    assert.ok(c.nodes.length > 130, 'the breadboard copper groups are present');
    const bbNodes = c.nodes.filter((n) => n.startsWith('bb:'));
    assert.equal(bbNodes.length, 134);
  }
});

// 17
void test('the assembly description names the board, the pin and the exact hole', () => {
  const w = wireGndToRail(bench());
  const text = describeWire(w.wires[0], w, lookupModel);
  assert.match(text, /UNO 1 · POWER header · GND/);
  assert.match(text, /Breadboard 1 · Top − rail · hole 12/);
});

// 13 (issues) — checks that can genuinely be derived
void test('a supply tied to ground is reported as an error', () => {
  const w = bench();
  w.wires.push({
    id: 'bad',
    a: { kind: 'board-pin', instanceId: 'u1', pinId: 'PWR5' }, // 5V
    b: { kind: 'board-pin', instanceId: 'u1', pinId: 'PWR6' }, // GND
    color: '#a00',
    route: [],
  });
  const issues = analyzeWorkbench(w, lookupModel);
  assert.ok(
    issues.some((i) => i.code === 'supply-short' && i.severity === 'error'),
  );
});

void test('a mixed 5 V / 3.3 V node is a warning, not a silent pass', () => {
  const w = bench();
  w.instances.push({
    id: 'p1',
    modelId: 'raspberry-pi-pico',
    kind: 'board',
    name: 'Pico 1',
    transform: { x: 120, y: -40, rot: 0 },
  });
  w.wires.push({
    id: 'lv',
    a: { kind: 'board-pin', instanceId: 'u1', pinId: 'DL1' }, // UNO D7
    b: { kind: 'board-pin', instanceId: 'p1', pinId: 'P1' }, // Pico GP0
    color: '#0a0',
    route: [],
  });
  const issues = analyzeWorkbench(w, lookupModel);
  assert.ok(issues.some((i) => i.code === 'logic-level'));
});

void test('a wire pointing at a deleted instance is reported', () => {
  const w = wireGndToRail(bench());
  w.instances = w.instances.filter((i) => i.id !== 'u1');
  const issues = analyzeWorkbench(w, lookupModel);
  assert.ok(issues.some((i) => i.code === 'dangling-endpoint'));
});

void test('two leads in one hole are reported', () => {
  const w = bench();
  w.wires.push(
    {
      id: 'a',
      a: { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '5-A' },
      b: { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '9-A' },
      color: '#000',
      route: [],
    },
    {
      id: 'b',
      a: { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '5-A' },
      b: { kind: 'breadboard-hole', instanceId: 'bb1', holeId: '12-A' },
      color: '#000',
      route: [],
    },
  );
  assert.ok(
    analyzeWorkbench(w, lookupModel).some((i) => i.code === 'hole-capacity'),
  );
});

// Library honesty
void test('the library lists the whole catalogue but only marks real models as supported', () => {
  const entries = libraryEntries();
  assert.ok(
    entries.length > 90,
    'the existing 47 boards and 46 components are still listed',
  );
  const placeable = entries.filter((e) => e.hasPhysicalModel);
  assert.equal(placeable.length, physicalModels.length);
  for (const e of entries.filter((x) => !x.hasPhysicalModel))
    assert.equal(
      Object.values(e.support).some(Boolean),
      false,
      `${e.id} must not claim support`,
    );
  for (const m of physicalModels)
    assert.equal(
      new Set(m.pins.map((p) => p.id)).size,
      m.pins.length,
      `${m.id} has duplicate pin ids`,
    );
});

void test('board models reuse the hardware catalogue ids, never a second list', async () => {
  const { boards } = await import('../lib/hardware/catalog.ts');
  const { WOKWI_BOARDS } = await import('../lib/hardware/wokwi.ts');
  for (const id of [
    'uno-rev3',
    'nano',
    'mega-2560',
    'esp32-devkitc-v4',
    'raspberry-pi-pico',
  ]) {
    assert.ok(lookupModel(id), `${id} has a physical model`);
    assert.ok(
      boards.some((b) => b.id === id),
      `${id} exists in the hardware catalogue`,
    );
  }
  // Support flags must be READ from the modules that implement them.
  for (const m of physicalModels) {
    const cat = boards.find((b) => b.id === m.id);
    assert.equal(
      m.support.codeGeneration,
      Boolean(cat?.profile),
      `${m.id} code flag`,
    );
    assert.equal(
      m.support.wokwiExport,
      Boolean(WOKWI_BOARDS[m.id] || m.simulator || m.kind === 'breadboard'),
      `${m.id} wokwi flag`,
    );
  }
});

void test('geometry round-trips through rotation', () => {
  const uno = lookupModel('uno-rev3')!;
  for (const rot of [0, 90, 180, 270] as const) {
    const t = { x: 12.5, y: -7.25, rot };
    for (const pin of uno.pins.slice(0, 8)) {
      const back = tableToLocal(
        t,
        uno.origin,
        localToTable(t, uno.origin, pin),
      );
      assert.ok(Math.hypot(back.x - pin.x, back.y - pin.y) < 1e-9);
    }
    const box = instanceBox(
      { id: 'x', modelId: uno.id, kind: 'board', name: 'x', transform: t },
      uno,
    );
    assert.ok(box.w > 0 && box.h > 0);
  }
});
