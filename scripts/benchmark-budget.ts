import { writeFileSync } from 'node:fs';
import { DEFAULT_SPECS } from '../lib/circuit.ts';
import {
  runBudgetExperiment,
  type BudgetExperiment,
} from '../lib/lab/adaptive.ts';
const conditions = [
  { name: 'sensor-100Hz', passHz: 100, stopHz: 500, gbwHz: 1e6 },
  { name: 'audio-1kHz', passHz: 1000, stopHz: 5000, gbwHz: 1e6 },
  { name: 'wideband-10kHz', passHz: 10000, stopHz: 50000, gbwHz: 1e6 },
];
// Fixed before inspecting these results. No tuning on these benchmark seeds.
const rows: (BudgetExperiment & { condition: string; seed: number })[] = [];
for (const c of conditions)
  for (let seed = 0; seed < 10; seed++) {
    const result = await runBudgetExperiment(
      { ...DEFAULT_SPECS, passHz: c.passHz, stopHz: c.stopHz, seed },
      { a0Db: 100, gbwHz: c.gbwHz },
      1536,
    );
    rows.push({ condition: c.name, seed, ...result });
    console.log(
      c.name,
      seed,
      result.methods
        .map((m) => `${m.method}: ${m.audit.yieldPct.toFixed(1)}%`)
        .join(' / '),
    );
  }
const report = {
  version: 'budget-benchmark-1.0',
  date: '2026-09-05',
  protocol:
    'Three conditions, ten predeclared seeds 0–9, 1536 AC realization evaluations per method. Common eight initial designs and 48 training draws. Each frozen winner receives 1024 held-out draws outside search cost. Single topology, finite one-pole op-amp, no physical measurements. Wall time includes method overhead and is not equalized.',
  conditions,
  summary: conditions.map((c) => ({
    condition: c.name,
    methods: ['adaptive', 'gp', 'random'].map((method) => {
      const ms = rows
        .filter((r) => r.condition === c.name)
        .map((r) => r.methods.find((m) => m.method === method)!);
      return {
        method,
        experiments: ms.length,
        meanYieldPct: ms.reduce((s, m) => s + m.audit.yieldPct, 0) / ms.length,
        successfulWinnersAt95Pct: ms.filter((m) => m.audit.yieldPct >= 95)
          .length,
        meanTrainingScore:
          ms.reduce((s, m) => s + m.trainingScore, 0) / ms.length,
        meanElapsedMs: ms.reduce((s, m) => s + m.elapsedMs, 0) / ms.length,
      };
    }),
  })),
  rows,
};
writeFileSync(
  process.argv[2] ?? 'research/budget-benchmark.json',
  JSON.stringify(report, null, 2) + '\n',
);
