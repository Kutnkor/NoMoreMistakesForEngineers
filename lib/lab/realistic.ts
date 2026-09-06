import {
  coefficients,
  metrics,
  PART_KEYS,
  perturb,
  toleranceDraws,
  wilson,
  type Parts,
  type Specs,
} from '../circuit.ts';

export type OpAmp = { a0Db: number; gbwHz: number };
export const DEFAULT_OPAMP: OpAmp = { a0Db: 100, gbwHz: 10e6 };
export type Complex = [number, number];
export type LabMetrics = {
  passDeviation: number;
  stopAttenuation: number;
  meets: boolean;
  extremaHz: number[];
};
export function checkModel(p: Parts, op: OpAmp) {
  if (PART_KEYS.some((k) => !Number.isFinite(p[k]) || p[k] <= 0))
    throw Error('R and C values must be positive and finite.');
  if (
    p.r1 < 0.1 ||
    p.r2 < 0.1 ||
    p.r1 > 1e9 ||
    p.r2 > 1e9 ||
    p.c1 < 1e-15 ||
    p.c2 < 1e-15 ||
    p.c1 > 0.01 ||
    p.c2 > 0.01
  )
    throw Error('Model range: R 0.1 Ω–1 GΩ; C 1 fF–10 mF.');
  if (
    !Number.isFinite(op.a0Db) ||
    op.a0Db < 40 ||
    op.a0Db > 140 ||
    !Number.isFinite(op.gbwHz) ||
    op.gbwHz < 1e4 ||
    op.gbwHz > 1e9
  )
    throw Error('Op-amp gain must be 40–140 dB and GBW must be 10 kHz–1 GHz.');
}
// The follower has infinite input and zero output impedance, and one open-loop pole.
// Normalize by A0 to avoid large intermediate coefficients; numerator becomes 1.
export function finiteCoefficients(p: Parts, op: OpAmp) {
  const a0 = 10 ** (op.a0Db / 20),
    inv = 1 / a0,
    t = 1 / (2 * Math.PI * op.gbwHz);
  const { a, b } = coefficients(p),
    k = p.r1 * p.c1;
  return [
    1 + inv,
    (1 + inv) * a + t + inv * k,
    (1 + inv) * b + t * (a + k),
    t * b,
  ] as const;
}
export function finiteTransfer(
  p: Parts,
  hz: number,
  op: OpAmp = DEFAULT_OPAMP,
): Complex {
  const [d0, d1, d2, d3] = finiteCoefficients(p, op),
    w = 2 * Math.PI * hz;
  const re = d0 - d2 * w * w,
    im = w * (d1 - d3 * w * w),
    den = re * re + im * im;
  return [re / den, -im / den];
}
export function finiteGain(p: Parts, hz: number, op: OpAmp = DEFAULT_OPAMP) {
  const [re, im] = finiteTransfer(p, hz, op);
  return 20 * Math.log10(Math.hypot(re, im));
}
export function idealTransfer(p: Parts, hz: number): Complex {
  const { a, b } = coefficients(p),
    w = 2 * Math.PI * hz,
    re = 1 - b * w * w,
    im = a * w,
    den = re * re + im * im;
  return [re / den, -im / den];
}
// All extrema of |H(jw)| come from a quadratic in x=w². Scale x by 1/b
// and use the stable quadratic formula so narrow resonances are not grid-dependent.
export function finiteExtrema(p: Parts, op: OpAmp): number[] {
  const [d0, d1, d2, d3] = finiteCoefficients(p, op),
    scale = 1 / coefficients(p).b;
  const a = 3 * d3 * d3 * scale * scale * scale,
    b = 2 * (d2 * d2 - 2 * d1 * d3) * scale * scale,
    c = (d1 * d1 - 2 * d0 * d2) * scale;
  const norm = Math.max(Math.abs(a), Math.abs(b), Math.abs(c)),
    aa = a / norm,
    bb = b / norm,
    cc = c / norm;
  if (Math.abs(aa) < 1e-18)
    return bb !== 0 && -cc / bb > 0
      ? [Math.sqrt((-cc / bb) * scale) / (2 * Math.PI)]
      : [];
  const discriminant = bb * bb - 4 * aa * cc;
  if (discriminant < 0) return [];
  const q = -0.5 * (bb + (bb >= 0 ? 1 : -1) * Math.sqrt(discriminant));
  const roots = q === 0 ? [-bb / (2 * aa)] : [q / aa, cc / q];
  return [
    ...new Set(
      roots
        .filter((x) => Number.isFinite(x) && x > 0)
        .map((x) => Math.sqrt(x * scale) / (2 * Math.PI)),
    ),
  ].sort((a, b) => a - b);
}
export function finiteMetrics(
  p: Parts,
  s: Specs,
  op: OpAmp = DEFAULT_OPAMP,
): LabMetrics {
  const extremaHz = finiteExtrema(p, op);
  const pass = [0, s.passHz, ...extremaHz.filter((f) => f < s.passHz)];
  const stop = [s.stopHz, ...extremaHz.filter((f) => f > s.stopHz)];
  const passDeviation = Math.max(
    ...pass.map((f) => Math.abs(finiteGain(p, f, op))),
  );
  const stopAttenuation = -Math.max(...stop.map((f) => finiteGain(p, f, op)));
  return {
    passDeviation,
    stopAttenuation,
    meets:
      passDeviation <= s.rippleDb + 1e-10 &&
      stopAttenuation >= s.stopDb - 1e-10,
    extremaHz,
  };
}
export function finiteScores(p: Parts, s: Specs, op: OpAmp, draws: number[][]) {
  return draws.map((d) => {
    const m = finiteMetrics(perturb(p, d), s, op);
    return Math.max(
      m.passDeviation / s.rippleDb - 1,
      1 - m.stopAttenuation / s.stopDb,
    );
  });
}
export function scoreOf(values: number[]) {
  if (!values.length) throw Error('At least one tolerance draw is required.');
  return [...values].sort((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1];
}
export function finiteScore(p: Parts, s: Specs, op: OpAmp, draws: number[][]) {
  return scoreOf(finiteScores(p, s, op, draws));
}
export function finiteAudit(
  p: Parts,
  s: Specs,
  op: OpAmp,
  count = 1024,
  seed = (s.seed ^ 0x7f4a7c15) >>> 0,
) {
  const draws = toleranceDraws(s, count, seed);
  const rows = draws.map((d) => {
    const v = perturb(p, d);
    return { ideal: metrics(v, s), finite: finiteMetrics(v, s, op) };
  });
  const idealPassed = rows.filter((r) => r.ideal.meets).length,
    passed = rows.filter((r) => r.finite.meets).length;
  const falsePass = rows.filter((r) => r.ideal.meets && !r.finite.meets).length;
  return {
    samples: count,
    passed,
    yieldPct: (100 * passed) / count,
    yieldCI: wilson(passed, count),
    idealPassed,
    idealYieldPct: (100 * idealPassed) / count,
    falsePass,
    falsePassPct: (100 * falsePass) / count,
    conditionalFalsePassPct: idealPassed
      ? (100 * falsePass) / idealPassed
      : null,
    nominal: finiteMetrics(p, s, op),
    idealNominal: metrics(p, s),
  };
}
export function finiteNetlist(p: Parts, s: Specs, op: OpAmp): string {
  const a0 = 10 ** (op.a0Db / 20),
    tau = a0 / (2 * Math.PI * op.gbwHz);
  return `* CIRCUIT FORGE: finite one-pole unity Sallen-Key, SI units\n* A0=${op.a0Db} dB, GBW=${op.gbwHz} Hz. Linear AC, no clipping/noise/slew.\nVin in 0 AC 1\nR1 in a ${p.r1}\nR2 a b ${p.r2}\nC1 a out ${p.c1}\nC2 b 0 ${p.c2}\nEol drive 0 b out ${a0}\nRp drive pole 1\nCp pole 0 ${tau}\nEbuffer out 0 pole 0 1\n.ac dec 120 ${s.passHz / 20} ${s.stopHz * 20}\n.print ac vdb(out) vp(out)\n.end\n`;
}
export function modelCurve(
  p: Parts,
  op: OpAmp,
  lo: number,
  hi: number,
  n = 220,
) {
  return Array.from({ length: n }, (_, i) => {
    const hz = lo * (hi / lo) ** (i / (n - 1)),
      a = idealTransfer(p, hz),
      b = finiteTransfer(p, hz, op);
    return {
      hz,
      ideal: 20 * Math.log10(Math.hypot(...a)),
      finite: 20 * Math.log10(Math.hypot(...b)),
      phase: (Math.atan2(b[1], b[0]) * 180) / Math.PI,
    };
  });
}
