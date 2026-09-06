import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_SPECS,
  REFERENCE,
  analyze,
  cornerDraws,
  decode,
  encode,
  gainDb,
  metrics,
  perturb,
  rng,
  robustScore,
  roundE24,
  spiceNetlist,
  toleranceDraws,
  validateSpecs,
  TRAIN_DRAWS,
  type Parts,
} from '../lib/circuit.ts';
import { expectedImprovement, fitGP } from '../lib/gp.ts';
import { runExperiment } from '../lib/optimizer.ts';
const close = (a: number, b: number, tol = 1e-7) =>
  assert.ok(Math.abs(a - b) < tol, `${a} != ${b}`);
type C = [number, number];
const add = (a: C, b: C): C => [a[0] + b[0], a[1] + b[1]];
const sub = (a: C, b: C): C => [a[0] - b[0], a[1] - b[1]];
const mul = (a: C, b: C): C => [
  a[0] * b[0] - a[1] * b[1],
  a[0] * b[1] + a[1] * b[0],
];
const div = (a: C, b: C): C => {
  const d = b[0] * b[0] + b[1] * b[1];
  return [(a[0] * b[0] + a[1] * b[1]) / d, (a[1] * b[0] - a[0] * b[1]) / d];
};
// Independent complex nodal solver. Does not use coefficients() or gainDb().
function nodalGain(p: Parts, f: number): number {
  const yc1: C = [0, 2 * Math.PI * f * p.c1],
    yc2: C = [0, 2 * Math.PI * f * p.c2];
  const m: C[][] = [
    [
      add([1 / p.r1 + 1 / p.r2, 0], yc1),
      [-1 / p.r2, 0],
      sub([0, 0], yc1),
      [1 / p.r1, 0],
    ],
    [[-1 / p.r2, 0], add([1 / p.r2, 0], yc2), [0, 0], [0, 0]],
    [
      [0, 0],
      [-1, 0],
      [1, 0],
      [0, 0],
    ],
  ];
  for (let k = 0; k < 3; k++) {
    let pivot = k;
    for (let i = k + 1; i < 3; i++)
      if (Math.hypot(...m[i][k]) > Math.hypot(...m[pivot][k])) pivot = i;
    [m[k], m[pivot]] = [m[pivot], m[k]];
    const d = m[k][k];
    for (let j = k; j < 4; j++) m[k][j] = div(m[k][j], d);
    for (let i = 0; i < 3; i++)
      if (i !== k) {
        const c = m[i][k];
        for (let j = k; j < 4; j++) m[i][j] = sub(m[i][j], mul(c, m[k][j]));
      }
  }
  return 20 * Math.log10(Math.hypot(...m[2][3]));
}
await test('AC transfer agrees with independent complex nodal analysis across 80 circuits', () => {
  const r = rng(1042);
  for (let i = 0; i < 80; i++) {
    const p = decode(Array.from({ length: 4 }, () => r())),
      f = 10 ** (1 + 5 * r());
    close(gainDb(p, f), nodalGain(p, f), 1e-7);
  }
});
await test('Butterworth fixture, natural frequency and capacitor labeling', () => {
  const p = { r1: 10000, r2: 10000, c1: 15e-9, c2: 7.5e-9 },
    m = metrics(p, DEFAULT_SPECS);
  close(m.f0, 1500.527193595177, 1e-6);
  close(m.q, Math.SQRT1_2);
  close(gainDb(p, 1000), -0.781860824, 1e-8);
  close(gainDb(p, 5000), -20.944130587, 1e-8);
  assert.equal(m.meets, true);
  const c = cornerDraws(DEFAULT_SPECS).map((d) =>
    metrics(perturb(p, d), DEFAULT_SPECS),
  );
  close(Math.max(...c.map((v) => v.passDeviation)), 1.137362119, 1e-8);
  assert.ok(c.some((v) => !v.meets));
});
await test('reference circuit and corner metrics match independent fixtures', () => {
  const a = analyze(REFERENCE, DEFAULT_SPECS, 128, false);
  close(a.nominal.passDeviation, 0.290924315, 1e-8);
  close(a.nominal.stopAttenuation, 21.406091803, 1e-8);
  close(a.cornerPass, 0.486513201, 1e-8);
  close(a.cornerStop, 20.324155894, 1e-8);
  assert.equal(a.cornerYield, 100);
});
await test('equal RC natural frequency is not universally -3dB', () => {
  const p = { r1: 10000, r2: 10000, c1: 10e-9, c2: 10e-9 },
    m = metrics(p, DEFAULT_SPECS);
  close(m.q, 0.5);
  close(gainDb(p, m.f0), -6.020599913, 1e-8);
});
await test('DC, impedance scaling and asymptotic roll-off', () => {
  close(gainDb(REFERENCE, 0), 0);
  const p = {
    r1: REFERENCE.r1 * 10,
    r2: REFERENCE.r2 * 10,
    c1: REFERENCE.c1 / 10,
    c2: REFERENCE.c2 / 10,
  };
  for (const f of [1, 1000, 5000, 1e5])
    close(gainDb(p, f), gainDb(REFERENCE, f));
  close(gainDb(REFERENCE, 1e8) - gainDb(REFERENCE, 1e7), -40, 1e-5);
});
await test('continuous-band checks detect a hidden resonance missed by endpoint-only check', () => {
  const p = { r1: 1000, r2: 1000, c1: 100e-9, c2: 1e-9 },
    s = { ...DEFAULT_SPECS, passHz: 30000, stopHz: 100000, rippleDb: 10 };
  assert.ok(Math.abs(gainDb(p, s.passHz)) < s.rippleDb);
  assert.ok(metrics(p, s).passDeviation > s.rippleDb);
  assert.equal(metrics(p, s).meets, false);
});
await test('exact extrema bound dense frequency scans', () => {
  const r = rng(90);
  for (let j = 0; j < 12; j++) {
    const p = decode(Array.from({ length: 4 }, () => r())),
      m = metrics(p, DEFAULT_SPECS);
    for (let i = 1; i < 2500; i++) {
      const f = 10 ** (-1 + (i / 2499) * 7),
        g = gainDb(p, f);
      if (f <= DEFAULT_SPECS.passHz)
        assert.ok(Math.abs(g) <= m.passDeviation + 1e-7);
      if (f >= DEFAULT_SPECS.stopHz) assert.ok(-g >= m.stopAttenuation - 1e-7);
    }
  }
});
await test('seeded tolerances are independent of held-out test stream and honor bounds', () => {
  const a = toleranceDraws(DEFAULT_SPECS, TRAIN_DRAWS, (42 ^ 0x1234abcd) >>> 0),
    b = toleranceDraws(DEFAULT_SPECS, TRAIN_DRAWS, (42 ^ 0x7f4a7c15) >>> 0);
  assert.notDeepEqual(a, b);
  assert.deepEqual(
    a,
    toleranceDraws(DEFAULT_SPECS, TRAIN_DRAWS, (42 ^ 0x1234abcd) >>> 0),
  );
  for (const d of a)
    for (let j = 0; j < 4; j++)
      assert.ok(Math.abs(d[j] - 1) <= (j < 2 ? 0.01 : 0.05));
});
await test('zero tolerances collapse Monte Carlo band to nominal', () => {
  const a = analyze(REFERENCE, { ...DEFAULT_SPECS, rTol: 0, cTol: 0 }, 64);
  assert.equal(a.yieldPct, 100);
  for (const p of a.curve) {
    close(p.low, p.nominal);
    close(p.high, p.nominal);
  }
});
await test('nearest-rank robust percentile has advertised empirical coverage', () => {
  const r = rng(332),
    d = toleranceDraws(DEFAULT_SPECS, 48, 239);
  for (let i = 0; i < 80; i++) {
    const p = decode(Array.from({ length: 4 }, () => r()));
    if (robustScore(p, DEFAULT_SPECS, d) < 0) {
      assert.ok(
        d.filter((v) => metrics(perturb(p, v), DEFAULT_SPECS).meets).length /
          48 >=
          0.95,
      );
    }
  }
});
await test('E24 values stay in declared bounds and encode/decode round-trip', () => {
  close(roundE24(8162), 8200);
  const r = rng(99);
  for (let i = 0; i < 100; i++) {
    const p = decode(Array.from({ length: 4 }, () => r()));
    assert.deepEqual(decode(encode(p)), p);
    assert.ok(p.r1 >= 1000 && p.r1 <= 100000 && p.c1 >= 1e-9 && p.c1 <= 1e-7);
  }
});
await test('GP interpolates observations and has finite nonnegative uncertainty', () => {
  const xs = [
      [0, 0, 0, 0],
      [0.5, 0.5, 0.5, 0.5],
      [1, 1, 1, 1],
    ],
    ys = [1, -1, 2],
    g = fitGP(xs, ys);
  for (let i = 0; i < xs.length; i++) {
    const p = g.predict(xs[i]);
    close(p.mean, ys[i], 1e-5);
    assert.ok(p.sd >= 0 && p.sd < 0.01);
  }
  assert.ok(g.predict([0.2, 0.8, 0.1, 0.9]).sd > 0.1);
  assert.equal(expectedImprovement(0, 0, 0), 0);
  assert.ok(expectedImprovement(0, -1, 0.1) > expectedImprovement(0, 1, 0.1));
});
await test('invalid and impossible targets have explicit behavior', async () => {
  assert.ok(validateSpecs({ ...DEFAULT_SPECS, passHz: NaN }));
  assert.ok(validateSpecs({ ...DEFAULT_SPECS, stopHz: 500 }));
  assert.ok(validateSpecs({ ...DEFAULT_SPECS, seed: 2.5 }));
  await assert.rejects(() => runExperiment({ ...DEFAULT_SPECS, budget: 0 }));
  const impossible = { ...DEFAULT_SPECS, stopHz: 1001, stopDb: 80, budget: 32 };
  const result = await runExperiment(impossible);
  assert.equal(result.candidates[0].analysis.nominal.meets, false);
  assert.equal(result.candidates[0].analysis.yieldPct, 0);
});
await test('optimizer is reproducible, uses shared initial trials and equal evaluation budgets', async () => {
  const s = { ...DEFAULT_SPECS, budget: 32 },
    a = await runExperiment(s),
    b = await runExperiment(s);
  assert.deepEqual(a.ai, b.ai);
  assert.deepEqual(a.random, b.random);
  assert.deepEqual(a.candidates, b.candidates);
  assert.equal(a.ai.length, s.budget);
  assert.equal(a.random.length, s.budget);
  assert.deepEqual(a.ai.slice(0, 8), a.random.slice(0, 8));
  for (const list of [a.ai, a.random])
    for (let i = 1; i < list.length; i++)
      assert.ok(list[i].bestScore <= list[i - 1].bestScore);
  assert.ok(a.ai.slice(8).every((t) => t.phase === 'learned'));
  assert.ok(a.random.slice(8).every((t) => t.phase === 'random'));
});
await test('SPICE netlist matches capacitor topology and includes physical values', () => {
  const net = spiceNetlist(REFERENCE, DEFAULT_SPECS);
  assert.match(net, /C1 a out/);
  assert.match(net, /C2 b 0/);
  assert.match(net, /Ebuf out 0 b 0 1/);
  assert.match(net, /R1 in a 8\.200000000e\+3/);
});
