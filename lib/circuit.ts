// CIRCUIT FORGE v1.0 — ideal unity-gain Sallen–Key AC model, SI units.
export type Parts = { r1: number; r2: number; c1: number; c2: number };
export type Specs = {
  passHz: number;
  stopHz: number;
  rippleDb: number;
  stopDb: number;
  rTol: number;
  cTol: number;
  budget: number;
  seed: number;
};
export const DEFAULT_SPECS: Specs = {
  passHz: 1000,
  stopHz: 5000,
  rippleDb: 1,
  stopDb: 20,
  rTol: 1,
  cTol: 5,
  budget: 64,
  seed: 42,
};
export const REFERENCE: Parts = { r1: 8200, r2: 8200, c1: 22e-9, c2: 8.2e-9 };
export const BOUNDS = [
  [1e3, 1e5],
  [1e3, 1e5],
  [1e-9, 1e-7],
  [1e-9, 1e-7],
] as const;
export const PART_KEYS = ['r1', 'r2', 'c1', 'c2'] as const;
export const TRAIN_DRAWS = 48;
export const TEST_DRAWS = 1024;
export type BandMetrics = {
  passDeviation: number;
  stopAttenuation: number;
  f0: number;
  q: number;
  peakHz: number;
  peakDb: number;
  meets: boolean;
};
export type CurvePoint = {
  hz: number;
  nominal: number;
  low: number;
  high: number;
};
export type Analysis = {
  nominal: BandMetrics;
  yieldPct: number;
  yieldCI: [number, number];
  samples: number;
  passed: number;
  worstPass: number;
  worstStop: number;
  curve: CurvePoint[];
  cornerPass: number;
  cornerStop: number;
  cornerYield: number;
};

export function validateSpecs(s: Specs): string | null {
  if (Object.values(s).some((v) => !Number.isFinite(v)))
    return 'Enter a valid number in every field.';
  if (
    s.passHz < 10 ||
    s.passHz > 100000 ||
    s.stopHz <= s.passHz ||
    s.stopHz > 1e7
  )
    return 'The passband edge must be 10–100,000 Hz. The stopband edge must exceed the passband edge and be no higher than 10 MHz.';
  if (s.rippleDb < 0.05 || s.rippleDb > 6 || s.stopDb < 3 || s.stopDb > 100)
    return 'Passband deviation must be 0.05–6 dB and attenuation must be 3–100 dB.';
  if (s.rTol < 0 || s.rTol > 20 || s.cTol < 0 || s.cTol > 20)
    return 'Choose tolerances between 0% and 20%.';
  if (!Number.isInteger(s.seed) || s.seed < 0 || s.seed > 2147483647)
    return 'The experiment seed must be an integer between 0 and 2147483647.';
  if (![32, 64, 96].includes(s.budget))
    return 'The evaluation budget must be 32, 64, or 96.';
  return null;
}
export function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function quantile(values: number[], p: number): number {
  const a = [...values].sort((x, y) => x - y),
    i = (a.length - 1) * p,
    lo = Math.floor(i),
    hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
const E24 = [
  1, 1.1, 1.2, 1.3, 1.5, 1.6, 1.8, 2, 2.2, 2.4, 2.7, 3, 3.3, 3.6, 3.9, 4.3, 4.7,
  5.1, 5.6, 6.2, 6.8, 7.5, 8.2, 9.1, 10,
];
export function roundE24(value: number): number {
  const d = 10 ** Math.floor(Math.log10(value)),
    m = value / d;
  return (
    E24.reduce(
      (best, n) =>
        Math.abs(Math.log(n / m)) < Math.abs(Math.log(best / m)) ? n : best,
      1,
    ) * d
  );
}
export function decode(x: number[]): Parts {
  const values = x.map((v, i) => {
    const [lo, hi] = BOUNDS[i];
    return Math.min(
      hi,
      Math.max(lo, roundE24(lo * (hi / lo) ** Math.max(0, Math.min(1, v)))),
    );
  });
  return { r1: values[0], r2: values[1], c1: values[2], c2: values[3] };
}
export function encode(parts: Parts): number[] {
  return PART_KEYS.map(
    (k, i) =>
      Math.log(parts[k] / BOUNDS[i][0]) / Math.log(BOUNDS[i][1] / BOUNDS[i][0]),
  );
}
export function partsKey(p: Parts): string {
  return PART_KEYS.map((k) => p[k].toPrecision(8)).join('/');
}
export function coefficients(p: Parts) {
  return { a: p.c2 * (p.r1 + p.r2), b: p.r1 * p.r2 * p.c1 * p.c2 };
}
export function gainDb(p: Parts, hz: number): number {
  const { a, b } = coefficients(p),
    w = 2 * Math.PI * hz;
  return -10 * Math.log10((1 - b * w * w) ** 2 + (a * w) ** 2);
}
export function metrics(p: Parts, s: Specs): BandMetrics {
  const { a, b } = coefficients(p),
    f0 = 1 / (2 * Math.PI * Math.sqrt(b)),
    q = Math.sqrt(b) / a;
  const peakHz =
    2 * b > a * a
      ? Math.sqrt((2 * b - a * a) / (2 * b * b)) / (2 * Math.PI)
      : 0;
  const peakDb = peakHz ? gainDb(p, peakHz) : 0;
  const passDeviation = Math.max(
    Math.abs(gainDb(p, s.passHz)),
    peakHz > 0 && peakHz <= s.passHz ? peakDb : 0,
  );
  const stopAttenuation = -gainDb(p, Math.max(s.stopHz, peakHz));
  return {
    passDeviation,
    stopAttenuation,
    f0,
    q,
    peakHz,
    peakDb,
    meets:
      passDeviation <= s.rippleDb + 1e-10 &&
      stopAttenuation >= s.stopDb - 1e-10,
  };
}
export function toleranceDraws(
  s: Specs,
  count: number,
  seed: number,
): number[][] {
  const random = rng(seed);
  return Array.from({ length: count }, () =>
    PART_KEYS.map(
      (_, i) => 1 + ((2 * random() - 1) * (i < 2 ? s.rTol : s.cTol)) / 100,
    ),
  );
}
export function perturb(p: Parts, d: number[]): Parts {
  return { r1: p.r1 * d[0], r2: p.r2 * d[1], c1: p.c1 * d[2], c2: p.c2 * d[3] };
}
export function cornerDraws(s: Specs): number[][] {
  return Array.from({ length: 16 }, (_, i) =>
    PART_KEYS.map(
      (_, j) => 1 + (((i >> j) & 1 ? 1 : -1) * (j < 2 ? s.rTol : s.cTol)) / 100,
    ),
  );
}
export function robustScore(p: Parts, s: Specs, draws: number[][]): number {
  const margins = draws.map((d) => {
    const m = metrics(perturb(p, d), s);
    return Math.max(
      m.passDeviation / s.rippleDb - 1,
      1 - m.stopAttenuation / s.stopDb,
    );
  });
  // Empirical 95th percentile of the largest normalized band violation.
  // Negative values satisfy both constraints for at least 95% of training draws.
  return margins.sort((a, b) => a - b)[Math.ceil(0.95 * margins.length) - 1];
}
export function wilson(passed: number, total: number): [number, number] {
  const z = 1.959963984540054,
    p = passed / total,
    den = 1 + (z * z) / total;
  const center = (p + (z * z) / (2 * total)) / den,
    half =
      (z * Math.sqrt((p * (1 - p)) / total + (z * z) / (4 * total * total))) /
      den;
  return [
    Math.max(0, 100 * (center - half)),
    Math.min(100, 100 * (center + half)),
  ];
}
export function analyze(
  p: Parts,
  s: Specs,
  count = TEST_DRAWS,
  includeCurve = true,
): Analysis {
  const draws = toleranceDraws(s, count, (s.seed ^ 0x7f4a7c15) >>> 0),
    variations = draws.map((d) => perturb(p, d)),
    ms = variations.map((v) => metrics(v, s));
  const passed = ms.filter((m) => m.meets).length;
  const corner = cornerDraws(s).map((d) => metrics(perturb(p, d), s));
  const curve: CurvePoint[] = includeCurve
    ? Array.from({ length: 180 }, (_, i) => {
        const lo = s.passHz / 20,
          hi = s.stopHz * 20,
          hz = lo * (hi / lo) ** (i / 179),
          gains = variations.map((v) => gainDb(v, hz));
        return {
          hz,
          nominal: gainDb(p, hz),
          low: quantile(gains, 0.05),
          high: quantile(gains, 0.95),
        };
      })
    : [];
  return {
    nominal: metrics(p, s),
    yieldPct: (100 * passed) / count,
    yieldCI: wilson(passed, count),
    samples: count,
    passed,
    worstPass: Math.max(...ms.map((m) => m.passDeviation)),
    worstStop: Math.min(...ms.map((m) => m.stopAttenuation)),
    curve,
    cornerPass: Math.max(...corner.map((m) => m.passDeviation)),
    cornerStop: Math.min(...corner.map((m) => m.stopAttenuation)),
    cornerYield: (100 * corner.filter((m) => m.meets).length) / 16,
  };
}
export function formatPart(value: number, kind: 'R' | 'C'): string {
  if (kind === 'R')
    return value >= 1000
      ? `${+(value / 1000).toPrecision(3)} kΩ`
      : `${+value.toPrecision(3)} Ω`;
  return value >= 1e-6
    ? `${+(value / 1e-6).toPrecision(3)} µF`
    : value >= 1e-9
      ? `${+(value / 1e-9).toPrecision(3)} nF`
      : `${+(value / 1e-12).toPrecision(3)} pF`;
}
export function spiceNetlist(p: Parts, s: Specs): string {
  return `* CIRCUIT FORGE v1.0 — ideal unity-gain Sallen-Key\n* R1: in-a; R2: a-b; C1: a-out; C2: b-ground\n* Ideal dependent-source follower. This file must be run in SPICE separately.\n* Pass: 0..${s.passHz} Hz, absolute deviation <= ${s.rippleDb} dB\n* Stop: >= ${s.stopHz} Hz, attenuation >= ${s.stopDb} dB\nVin in 0 AC 1\nR1 in a ${p.r1.toExponential(9)}\nR2 a b ${p.r2.toExponential(9)}\nC1 a out ${p.c1.toExponential(9)}\nC2 b 0 ${p.c2.toExponential(9)}\nEbuf out 0 b 0 1\n.ac dec 100 ${s.passHz / 20} ${s.stopHz * 20}\n.print ac vdb(out) vp(out)\n.end\n`;
}
