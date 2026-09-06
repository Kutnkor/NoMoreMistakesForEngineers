import { coefficients, PART_KEYS, rng, type Parts } from '../circuit.ts';
import {
  DEFAULT_OPAMP,
  finiteTransfer,
  type Complex,
  type OpAmp,
} from './realistic.ts';
export const FAULT_LABELS = [
  'healthy',
  'c1-drift',
  'c2-drift',
  'c1-open',
  'r1-open',
  'r2-short',
] as const;
export type Fault = (typeof FAULT_LABELS)[number];
export const FAULT_NAMES: Record<Fault, string> = {
  healthy: 'Healthy',
  'c1-drift': 'C1 value drift',
  'c2-drift': 'C2 value drift',
  'c1-open': 'C1 open circuit',
  'r1-open': 'R1 open circuit',
  'r2-short': 'R2 short circuit',
};
export const PROBE_RATIOS = [
  0.03, 0.05, 0.08, 0.13, 0.21, 0.34, 0.55, 0.9, 1.5, 2.5, 4, 7,
];
export type FaultSample = {
  parts: Parts;
  opAmp: OpAmp;
  fault: Fault;
  seed: number;
  faultFactor: number;
  features: number[];
  curve: { hz: number; nominal: number; observed: number }[];
};
export type FaultModel = {
  version: string;
  labels: Fault[];
  mean: number[];
  scale: number[];
  w1: number[][];
  b1: number[];
  w2: number[][];
  b2: number[];
  threshold: number;
  trainingDomain: { a0Db: [number, number]; gbwHz: [number, number] };
};
function gaussian(random: () => number) {
  return (
    Math.sqrt(-2 * Math.log(Math.max(random(), 1e-12))) *
    Math.cos(2 * Math.PI * random())
  );
}
const db = (z: Complex) => 20 * Math.log10(Math.max(1e-15, Math.hypot(...z)));
export function makeFaultSample(
  p: Parts,
  fault: Fault,
  seed: number,
  opAmp: OpAmp = DEFAULT_OPAMP,
): FaultSample {
  if (!FAULT_LABELS.includes(fault)) throw Error('Unknown fault class.');
  const random = rng(seed),
    v = { ...p };
  PART_KEYS.forEach(
    (k, i) => (v[k] *= 1 + (2 * random() - 1) * (i < 2 ? 0.01 : 0.05)),
  );
  const factor = random() < 0.5 ? 0.35 + 0.35 * random() : 1.4 + 0.6 * random();
  if (fault === 'c1-drift') v.c1 *= factor;
  if (fault === 'c2-drift') v.c2 *= factor;
  if (fault === 'c1-open') v.c1 = 1e-15; // 1 fF residual capacitance models the open branch.
  if (fault === 'r1-open') v.r1 = 1e9;
  if (fault === 'r2-short') v.r2 = 0.1;
  const f0 = 1 / (2 * Math.PI * Math.sqrt(coefficients(p).b));
  const features: number[] = [],
    curve: FaultSample['curve'] = [];
  for (const ratio of PROBE_RATIOS) {
    const hz = f0 * ratio,
      nom = finiteTransfer(p, hz, opAmp),
      obs = finiteTransfer(v, hz, opAmp);
    const nominal = db(nom),
      observed = db(obs) + gaussian(random) * 0.15;
    let phase =
      Math.atan2(obs[1], obs[0]) -
      Math.atan2(nom[1], nom[0]) +
      (gaussian(random) * Math.PI) / 180;
    phase = Math.atan2(Math.sin(phase), Math.cos(phase));
    features.push(
      Math.max(-80, Math.min(80, observed - nominal)) / 20,
      phase / Math.PI,
    );
    curve.push({ hz, nominal, observed });
  }
  return {
    parts: { ...p },
    opAmp: { ...opAmp },
    fault,
    seed,
    faultFactor: fault.includes('drift') ? factor : 1,
    features,
    curve,
  };
}
export function predictFault(model: FaultModel, features: number[]) {
  if (
    features.length !== 24 ||
    features.some((x) => !Number.isFinite(x)) ||
    model.mean.length !== 24 ||
    model.scale.length !== 24 ||
    model.w1.length !== 24 ||
    model.b1.length !== 32 ||
    model.w1.some((r) => r.length !== 32) ||
    model.w2.length !== 32 ||
    model.w2.some((r) => r.length !== 6) ||
    model.b2.length !== 6 ||
    model.labels.join('|') !== FAULT_LABELS.join('|')
  )
    throw Error('The fault model or measurement schema does not match.');
  const x = features.map((v, i) => (v - model.mean[i]) / model.scale[i]);
  const h = model.b1.map((b, j) =>
    Math.tanh(b + x.reduce((s, v, i) => s + v * model.w1[i][j], 0)),
  );
  const logits = model.b2.map(
      (b, j) => b + h.reduce((s, v, i) => s + v * model.w2[i][j], 0),
    ),
    max = Math.max(...logits),
    exp = logits.map((v) => Math.exp(v - max)),
    sum = exp.reduce((a, b) => a + b, 0);
  const scores = model.labels
    .map((label, i) => ({ label, score: exp[i] / sum }))
    .sort((a, b) => b.score - a.score);
  return {
    scores,
    predicted: scores[0].score >= model.threshold ? scores[0].label : null,
  };
}
