import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import {
  DEFAULT_SPECS,
  REFERENCE,
  decode,
  rng,
  toleranceDraws,
  partsKey,
  type Parts,
} from '../lib/circuit.ts';
import {
  finiteTransfer,
  idealTransfer,
  finiteGain,
  finiteMetrics,
  finiteScore,
  DEFAULT_OPAMP,
  type Complex,
  type OpAmp,
} from '../lib/lab/realistic.ts';
import { runBudgetExperiment } from '../lib/lab/adaptive.ts';
import {
  FAULT_LABELS,
  makeFaultSample,
  predictFault,
  type FaultModel,
} from '../lib/lab/faults.ts';

const add = (a: Complex, b: Complex): Complex => [a[0] + b[0], a[1] + b[1]];
const mul = (a: Complex, b: Complex): Complex => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];
const neg = (a: Complex): Complex => [-a[0], -a[1]];
const div = (a: Complex, b: Complex): Complex => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
// Independent KCL equations in the two passive nodes and the follower output.
function mna(p: Parts, hz: number, op: OpAmp): Complex {
  const w = 2 * Math.PI * hz,
    g1 = 1 / p.r1,
    g2 = 1 / p.r2,
    A0 = 10 ** (op.a0Db / 20),
    A = div([A0, 0], [1, (hz * A0) / op.gbwHz]);
  const a: Complex[][] = [
    [
      [g1 + g2, w * p.c1],
      [-g2, 0],
      [0, -w * p.c1],
      [g1, 0],
    ],
    [
      [-g2, 0],
      [g2, w * p.c2],
      [0, 0],
      [0, 0],
    ],
    [[0, 0], neg(A), add([1, 0], A), [0, 0]],
  ];
  for (let i = 0; i < 3; i++) {
    let pivot = i;
    for (let j = i + 1; j < 3; j++)
      if (Math.hypot(...a[j][i]) > Math.hypot(...a[pivot][i])) pivot = j;
    [a[i], a[pivot]] = [a[pivot], a[i]];
    const d = a[i][i];
    for (let k = i; k < 4; k++) a[i][k] = div(a[i][k], d);
    for (let j = 0; j < 3; j++)
      if (j !== i) {
        const f = a[j][i];
        for (let k = i; k < 4; k++)
          a[j][k] = add(a[j][k], neg(mul(f, a[i][k])));
      }
  }
  return a[2][3];
}
await test('finite op-amp transfer agrees with independent complex KCL at 800 operating points', () => {
  const r = rng(52026);
  for (let i = 0; i < 80; i++) {
    const p = decode(Array.from({ length: 4 }, () => r())),
      op = { a0Db: 40 + 100 * r(), gbwHz: 10 ** (4 + 5 * r()) };
    for (let j = 0; j < 10; j++) {
      const f = 10 ** (-1 + j),
        a = finiteTransfer(p, f, op),
        b = mna(p, f, op);
      assert.ok(
        Math.hypot(a[0] - b[0], a[1] - b[1]) <
          2e-9 * Math.max(1, Math.hypot(...b)),
        JSON.stringify({ p, op, f, a, b }),
      );
    }
  }
});
await test('finite model has correct DC gain, ideal limit and all-band extrema', () => {
  const dc = finiteTransfer(REFERENCE, 0, { a0Db: 40, gbwHz: 1e4 });
  assert.ok(Math.abs(dc[0] - 100 / 101) < 1e-15);
  for (const hz of [1, 100, 1000, 10000]) {
    const a = finiteTransfer(REFERENCE, hz, { a0Db: 140, gbwHz: 1e9 }),
      b = idealTransfer(REFERENCE, hz);
    assert.ok(Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-5);
  }
  const r = rng(1006);
  for (let i = 0; i < 35; i++) {
    const p = decode(Array.from({ length: 4 }, () => r())),
      op = { a0Db: 40 + 100 * r(), gbwHz: 10 ** (4 + 5 * r()) },
      s = { ...DEFAULT_SPECS, passHz: 100, stopHz: 500 };
    const m = finiteMetrics(p, s, op);
    for (let j = 0; j < 2000; j++) {
      const f = 10 ** (-2 + (11 * j) / 1999),
        g = finiteGain(p, f, op);
      if (f <= s.passHz) assert.ok(Math.abs(g) <= m.passDeviation + 1e-8);
      if (f >= s.stopHz) assert.ok(-g >= m.stopAttenuation - 1e-8);
    }
  }
});
await test('adaptive, GP and random searches charge actual draws, share starts and freeze full winners', async () => {
  const e = await runBudgetExperiment(DEFAULT_SPECS, DEFAULT_OPAMP, 768);
  const draws = toleranceDraws(
    DEFAULT_SPECS,
    48,
    (DEFAULT_SPECS.seed ^ 0x1234abcd) >>> 0,
  );
  assert.equal(e.testCost, 3072);
  for (const m of e.methods) {
    assert.equal(m.spent, 768);
    assert.equal(
      m.history.reduce((s, r) => s + r.cost, 0),
      768,
    );
    assert.deepEqual(
      m.history.slice(0, 8).map((x) => x.parts),
      e.methods[0].history.slice(0, 8).map((x) => x.parts),
    );
    const screened = new Set<string>();
    for (const h of m.history) {
      assert.equal(
        h.cost,
        h.operation === 'screen' ? 8 : h.operation === 'promote' ? 40 : 48,
      );
      if (h.operation === 'screen') screened.add(partsKey(h.parts));
      if (h.operation === 'promote') assert.ok(screened.has(partsKey(h.parts)));
      assert.equal(
        h.score,
        finiteScore(
          h.parts,
          DEFAULT_SPECS,
          DEFAULT_OPAMP,
          draws.slice(0, h.fidelity),
        ),
      );
    }
    const full = m.history.filter((x) => x.fidelity === 48);
    assert.equal(m.trainingScore, Math.min(...full.map((x) => x.score)));
    assert.ok(full.some((x) => partsKey(x.parts) === partsKey(m.winner)));
    assert.equal(m.audit.samples, 1024);
  }
  const repeated = await runBudgetExperiment(DEFAULT_SPECS, DEFAULT_OPAMP, 768);
  assert.deepEqual(
    e.methods.map((x) => x.history),
    repeated.methods.map((x) => x.history),
  );
  await assert.rejects(() =>
    runBudgetExperiment(DEFAULT_SPECS, { a0Db: NaN, gbwHz: 1e6 }, 768),
  );
});
await test('frozen classifier matches independent NumPy inference and recorded artifact hash', () => {
  const bytes = readFileSync(
    new URL('../public/models/fault-mlp.json', import.meta.url),
  );
  const model = JSON.parse(bytes.toString()) as FaultModel,
    report = JSON.parse(
      readFileSync(
        new URL('../research/fault-model-report.json', import.meta.url),
        'utf8',
      ),
    );
  assert.equal(
    createHash('sha256').update(bytes).digest('hex'),
    report.modelSha256,
  );
  const fixture = report.parityFixture;
  const predicted = predictFault(model, fixture.features);
  for (const [i, label] of FAULT_LABELS.entries())
    assert.ok(
      Math.abs(
        predicted.scores.find((x) => x.label === label)!.score -
          fixture.scores[i],
      ) < 1e-12,
    );
  assert.equal(report.designOverlap, 0);
  assert.equal(
    report.confusionMatrix.flat().reduce((s: number, x: number) => s + x, 0),
    1200,
  );
  for (const fault of FAULT_LABELS) {
    const a = makeFaultSample(REFERENCE, fault, 32);
    assert.deepEqual(a, makeFaultSample(REFERENCE, fault, 32));
    assert.equal(a.features.length, 24);
    assert.ok(a.features.every(Number.isFinite));
  }
  assert.throws(() => predictFault(model, [NaN]));
});
