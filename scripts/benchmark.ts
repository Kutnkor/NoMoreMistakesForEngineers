import { writeFile, mkdir } from 'node:fs/promises';
import { runExperiment } from '../lib/optimizer.ts';
import { DEFAULT_SPECS } from '../lib/circuit.ts';
const rows: Array<{
  seed: number;
  budget: number;
  aiScore: number;
  randomScore: number;
  aiYield: number;
  randomYield: number;
  aiNominalPass: boolean;
  randomNominalPass: boolean;
  elapsedMs: number;
}> = [];
for (let seed = 0; seed < 10; seed++) {
  const r = await runExperiment({ ...DEFAULT_SPECS, seed });
  rows.push({
    seed,
    budget: r.specs.budget,
    aiScore: r.candidates[0].trial.score,
    randomScore: r.baseline.trial.score,
    aiYield: r.candidates[0].analysis.yieldPct,
    randomYield: r.baseline.analysis.yieldPct,
    aiNominalPass: r.candidates[0].analysis.nominal.meets,
    randomNominalPass: r.baseline.analysis.nominal.meets,
    elapsedMs: Math.round(r.elapsedMs),
  });
}
const mean = (key: 'aiYield' | 'randomYield') =>
  rows.reduce((s, r) => s + r[key], 0) / rows.length;
const result = {
  version: '1.0.0',
  scope:
    '10 predeclared seeds 0–9, default specs, 64 candidate evaluations per method. Simulation only; no hardware validation. No general superiority claim.',
  specs: DEFAULT_SPECS,
  seeds: rows,
  summary: {
    aiLowerTrainingScore: rows.filter((r) => r.aiScore < r.randomScore).length,
    randomLowerTrainingScore: rows.filter((r) => r.randomScore < r.aiScore)
      .length,
    ties: rows.filter((r) => r.randomScore === r.aiScore).length,
    meanAiYield: mean('aiYield'),
    meanRandomYield: mean('randomYield'),
  },
};
await mkdir('research', { recursive: true });
await writeFile(
  'research/benchmark.json',
  JSON.stringify(result, null, 2) + '\n',
);
console.log(JSON.stringify(result, null, 2));
