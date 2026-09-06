import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HOLES,
  GROUP_HOLES,
  HOLE_MAP,
  autoPlace,
  validateLayout,
  extractBoard,
  parseCircuit,
  resistorBands,
  capacitorCode,
  emptyLayout,
  translatePart,
  endpointHole,
  rotatePart,
  assemblyList,
  type Circuit,
} from '../lib/breadboard/model.ts';
import { EXAMPLES } from '../lib/breadboard/circuits.ts';
void test('830 holes form 126 terminal strips and eight independent split rail segments', () => {
  assert.equal(HOLES.length, 830);
  assert.equal(GROUP_HOLES.size, 134);
  const g = extractBoard(EXAMPLES[0].circuit, emptyLayout()).holeToNet;
  assert.equal(g.get('12-A'), g.get('12-E'));
  assert.notEqual(g.get('12-E'), g.get('12-F'));
  assert.equal(g.get('1-T+'), g.get('25-T+'));
  assert.notEqual(g.get('25-T+'), g.get('26-T+'));
  assert.equal(g.get('26-T+'), g.get('50-T+'));
  assert.ok(
    Math.abs(HOLE_MAP.get('12-E')!.y - HOLE_MAP.get('12-F')!.y - 7.62) < 1e-10,
  );
});
for (const e of EXAMPLES)
  void test(`${e.id}: deterministic auto placement round-trips to the target terminal partition`, () => {
    const c = parseCircuit(e.circuit),
      l = autoPlace(c);
    assert.deepEqual(l, autoPlace(c));
    const result = validateLayout(c, l);
    assert.equal(result.valid, true, JSON.stringify(result.issues));
    assert.equal(Object.keys(l.parts).length, c.components.length);
    assert.ok(assemblyList(c, l).includes('match the target netlist'));
  });
void test('wrongly moved component identifies the affected pin without trusting its target net label', () => {
  const c = EXAMPLES[0].circuit,
    l = autoPlace(c);
  l.parts.R1 = translatePart(l.parts.R1, 2.54, 0);
  const v = validateLayout(c, l);
  assert.equal(v.valid, false);
  assert.ok(v.issues.some((i) => i.ref === 'R1' && i.pin === '1'));
  const before = extractBoard(c, autoPlace(c));
  assert.notEqual(
    v.netlist.find((p) => p.ref === 'R1')!.pins['1'],
    before.netlist.find((p) => p.ref === 'R1')!.pins['1'],
  );
});
void test('removing a split power rail bridge reports the unpowered right half', () => {
  const c = EXAMPLES[0].circuit,
    l = autoPlace(c);
  const index = l.wires.findIndex((w) => {
    const a = HOLE_MAP.get(endpointHole(w.a, l)),
      b = HOLE_MAP.get(endpointHole(w.b, l));
    return a?.row === 'T+' && b?.row === 'T+' && a.group !== b.group;
  });
  assert.ok(index >= 0);
  l.wires.splice(index, 1);
  const v = validateLayout(c, l);
  assert.equal(v.valid, false);
  assert.ok(v.issues.some((i) => i.kind === 'rail' && i.expected === 'VCC'));
});
void test('a manual jumper detects a short between unlike target nets; R/C bodies are not conductors', () => {
  const c = EXAMPLES[3].circuit,
    l = autoPlace(c),
    g = extractBoard(c, l);
  assert.notEqual(g.netlist[0].pins['1'], g.netlist[0].pins['2']);
  l.wires.push({
    id: 'MANUAL',
    a: { hole: '6-E' },
    b: { hole: '12-E' },
    color: 'black',
  });
  const v = validateLayout(c, l);
  assert.ok(v.issues.some((i) => i.kind === 'wrong' || i.kind === 'short'));
});
void test('collisions, deletion, out-of-board placement and DIP rotation are rejected', () => {
  const c = EXAMPLES[0].circuit,
    l = autoPlace(c);
  delete l.parts.R1;
  assert.ok(
    validateLayout(c, l).issues.some(
      (i) => i.ref === 'R1' && i.kind === 'missing',
    ),
  );
  const next = autoPlace(c);
  next.parts.R1.pins['1'] = next.parts.R2.pins['1'];
  assert.ok(validateLayout(c, next).issues.some((i) => i.kind === 'collision'));
  const rotated = autoPlace(c);
  rotated.parts.U1 = rotatePart(rotated.parts.U1);
  assert.ok(
    validateLayout(c, rotated).issues.some(
      (i) => i.ref === 'U1' && i.kind === 'footprint',
    ),
  );
});
void test('four-band colors and ceramic marking codes are computed from values', () => {
  assert.deepEqual(resistorBands(11000, 0.01).digits, [1, 1]);
  assert.equal(resistorBands(11000, 0.01).exponent, 3);
  assert.deepEqual(resistorBands(11000, 0.01).colors, [
    '#764a34',
    '#764a34',
    '#e58832',
    '#764a34',
  ]);
  assert.deepEqual(resistorBands(4.7, 0.05).digits, [4, 7]);
  assert.equal(resistorBands(4.7).exponent, -1);
  assert.equal(resistorBands(1e6).exponent, 5);
  assert.equal(capacitorCode(100e-9), '104');
  assert.equal(capacitorCode(22e-12), '220');
  assert.equal(capacitorCode(4.7e-6), '475');
  assert.equal(capacitorCode(22e-9), '223');
  assert.throws(() => resistorBands(1001));
  assert.throws(() => resistorBands(-1));
});
void test('all requested part types and wire target aliases use the same electrical model', () => {
  const c: Circuit = {
    title: 'RLC support fixture',
    nets: ['IN', 'A', 'OUT', 'VCC', 'GND'],
    power: { rails: ['VCC', 'GND'], vcc: 9, vee: 0 },
    components: [
      {
        ref: 'L1',
        type: 'inductor',
        value: 0.01,
        unit: 'H',
        pins: ['IN', 'A'],
      },
      {
        ref: 'C1',
        type: 'capacitor_electrolytic',
        value: 4.7e-6,
        unit: 'F',
        pins: ['VCC', 'GND'],
      },
      {
        ref: 'C2',
        type: 'capacitor_film',
        value: 100e-9,
        unit: 'F',
        pins: ['OUT', 'GND'],
      },
      { ref: 'J1', type: 'wire', pins: ['A', 'OUT'] },
    ],
  };
  assert.equal(validateLayout(c, autoPlace(c)).valid, true);
  assert.throws(() =>
    parseCircuit({
      ...c,
      components: [{ ...c.components[0], pins: ['MISSING', 'GND'] }],
    }),
  );
});
void test('C2 ground pin placed on B reports both expected GND and the wrong B connection', () => {
  const c = EXAMPLES[0].circuit,
    l = autoPlace(c);
  l.parts.C2.pins['2'] = '18-E';
  const issue = validateLayout(c, l).issues.find(
    (i) => i.ref === 'C2' && i.pin === '2' && i.kind === 'wrong',
  );
  assert.equal(issue?.expected, 'GND');
  assert.ok(issue?.actual?.includes('B'));
});
void test('jumper endpoints follow translated parts without changing the shared physical board', () => {
  const c = EXAMPLES[0].circuit,
    l = autoPlace(c),
    before = JSON.stringify(HOLES),
    w = l.wires.find((w) => w.b.attach?.ref === 'C2')!;
  assert.ok(w);
  const h = endpointHole(w.b, l);
  l.parts.C2 = translatePart(l.parts.C2, 2.54, 0);
  const moved = endpointHole(w.b, l);
  assert.notEqual(h, moved);
  assert.equal(HOLE_MAP.get(moved)!.col - HOLE_MAP.get(h)!.col, 1);
  assert.equal(JSON.stringify(HOLES), before);
});
void test('DIP footprint rejects skipped columns even if pins stay in E/F', () => {
  const c = EXAMPLES[0].circuit,
    l = autoPlace(c);
  l.parts.U1.pins['2'] = '40-E';
  assert.ok(validateLayout(c, l).issues.some((i) => i.kind === 'footprint'));
});
void test('out of range netlists are rejected before reaching the renderer', () => {
  const c = EXAMPLES[0].circuit;
  assert.throws(() => parseCircuit({ ...c, nets: [...c.nets, '__proto__'] }));
  assert.throws(() =>
    parseCircuit({
      ...c,
      nets: [...c.nets, ...Array.from({ length: 10 }, (_, i) => 'EXTRA' + i)],
    }),
  );
  assert.throws(() =>
    parseCircuit({
      ...c,
      components: c.components.map((p, i) =>
        i ? p : { ...p, unit: { bad: 1 } },
      ),
    }),
  );
});
