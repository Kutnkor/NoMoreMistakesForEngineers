import {
  analyze,
  decode,
  encode,
  partsKey,
  rng,
  robustScore,
  toleranceDraws,
  validateSpecs,
  TRAIN_DRAWS,
  type Parts,
  type Specs,
  type Analysis,
} from './circuit.ts';
import { fitGP, expectedImprovement } from './gp.ts';
export type Trial = {
  iteration: number;
  parts: Parts;
  score: number;
  bestScore: number;
  phase: 'initial' | 'learned' | 'random';
};
export type Candidate = { trial: Trial; analysis: Analysis };
export type Experiment = {
  version: string;
  specs: Specs;
  ai: Trial[];
  random: Trial[];
  candidates: Candidate[];
  baseline: Candidate;
  elapsedMs: number;
  trainingDraws: number;
  testDraws: number;
  initialPoints: number;
};
export type Update = {
  iteration: number;
  budget: number;
  ai: Trial[];
  random: Trial[];
  elapsedMs: number;
};
export type Hooks = {
  progress?: (p: Update) => void;
  yield?: () => Promise<void>;
  cancelled?: () => boolean;
};
function latinHypercube(n: number, random: () => number): number[][] {
  const x = Array.from({ length: n }, () => Array(4).fill(0) as number[]);
  for (let j = 0; j < 4; j++) {
    const p = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const k = Math.floor(random() * (i + 1));
      [p[i], p[k]] = [p[k], p[i]];
    }
    for (let i = 0; i < n; i++) x[i][j] = (p[i] + random()) / n;
  }
  return x;
}
export function propose(history: Trial[], random: () => number): Parts {
  const xs = history.map((t) => encode(t.parts)),
    ys = history.map((t) => Math.asinh(t.score)),
    gp = fitGP(xs, ys),
    best = Math.min(...ys);
  const incumbents = [...history]
    .sort((a, b) => a.score - b.score)
    .slice(0, 3)
    .map((t) => encode(t.parts));
  const seen = new Set(history.map((t) => partsKey(t.parts)));
  let chosen: Parts | null = null,
    bestEI = -Infinity;
  for (let i = 0; i < 896; i++) {
    let x: number[];
    if (i < 512) x = Array.from({ length: 4 }, () => random());
    else {
      const center = incumbents[i % incumbents.length],
        width = i < 704 ? 0.12 : 0.28;
      x = center.map((v) =>
        Math.max(
          0,
          Math.min(1, v + (random() + random() + random() - 1.5) * width),
        ),
      );
    }
    const p = decode(x);
    if (seen.has(partsKey(p))) continue;
    const prediction = gp.predict(encode(p)),
      ei = expectedImprovement(best, prediction.mean, prediction.sd);
    if (ei > bestEI) {
      bestEI = ei;
      chosen = p;
    }
  }
  // The finite E24 space is far larger than the bounded experiment budget.
  if (!chosen) {
    do {
      chosen = decode(Array.from({ length: 4 }, () => random()));
    } while (seen.has(partsKey(chosen)));
  }
  return chosen;
}
export async function runExperiment(
  specs: Specs,
  hooks: Hooks = {},
): Promise<Experiment> {
  const error = validateSpecs(specs);
  if (error) throw new Error(error);
  const start = performance.now(),
    draws = toleranceDraws(specs, TRAIN_DRAWS, (specs.seed ^ 0x1234abcd) >>> 0);
  const initial = latinHypercube(8, rng(specs.seed)),
    aiRandom = rng((specs.seed ^ 0x531fa920) >>> 0),
    baselineRandom = rng((specs.seed ^ 0x214590ab) >>> 0);
  const ai: Trial[] = [],
    random: Trial[] = [];
  function append(list: Trial[], parts: Parts, phase: Trial['phase']) {
    const score = robustScore(parts, specs, draws);
    list.push({
      iteration: list.length + 1,
      parts,
      score,
      bestScore: Math.min(score, list.at(-1)?.bestScore ?? Infinity),
      phase,
    });
  }
  for (let i = 0; i < specs.budget; i++) {
    if (hooks.cancelled?.()) throw new Error('CANCELLED');
    if (i < 8) {
      const p = decode(initial[i]);
      append(ai, p, 'initial');
      append(random, p, 'initial');
    } else {
      append(ai, propose(ai, aiRandom), 'learned');
      const seen = new Set(random.map((t) => partsKey(t.parts)));
      let p: Parts;
      do {
        p = decode(Array.from({ length: 4 }, () => baselineRandom()));
      } while (seen.has(partsKey(p)));
      append(random, p, 'random');
    }
    hooks.progress?.({
      iteration: i + 1,
      budget: specs.budget,
      ai: [...ai],
      random: [...random],
      elapsedMs: performance.now() - start,
    });
    await hooks.yield?.();
  }
  const unique = [
    ...new Map(
      [...ai]
        .sort((a, b) => a.score - b.score)
        .map((t) => [partsKey(t.parts), t]),
    ).values(),
  ].slice(0, 3);
  // Selection uses training scores only; the held-out draws never guide search.
  const candidates = unique.map((trial) => ({
    trial,
    analysis: analyze(trial.parts, specs),
  }));
  const baselineTrial = [...random].sort((a, b) => a.score - b.score)[0];
  return {
    version: '1.0.0',
    specs: { ...specs },
    ai,
    random,
    candidates,
    baseline: {
      trial: baselineTrial,
      analysis: analyze(baselineTrial.parts, specs),
    },
    elapsedMs: performance.now() - start,
    trainingDraws: TRAIN_DRAWS,
    testDraws: candidates[0].analysis.samples,
    initialPoints: 8,
  };
}
