import fs from 'node:fs';
import path from 'node:path';
import { decode, partsKey, rng } from '../lib/circuit.ts';
import { FAULT_LABELS, makeFaultSample } from '../lib/lab/faults.ts';
const dir = process.argv[2];
if (!dir) throw Error('Pass an output directory');
fs.mkdirSync(dir, { recursive: true });
const random = rng(20260905),
  seen = new Set<string>();
const datasets: Record<string, unknown> = {};
for (const [split, count, reps] of [
  ['train', 800, 2],
  ['val', 200, 1],
  ['test', 200, 1],
] as const) {
  const rows: { group: string; x: number[]; y: number }[] = [],
    groups: string[] = [];
  for (let i = 0; i < count; i++) {
    let p;
    do {
      p = decode(Array.from({ length: 4 }, () => random()));
    } while (seen.has(partsKey(p)));
    const group = partsKey(p);
    seen.add(group);
    groups.push(group);
    const op = { a0Db: 80 + 40 * random(), gbwHz: 10 ** (5 + 3 * random()) };
    for (const [y, label] of FAULT_LABELS.entries())
      for (let j = 0; j < reps; j++)
        rows.push({
          group,
          x: makeFaultSample(p, label, Math.floor(random() * 0x7fffffff), op)
            .features,
          y,
        });
  }
  datasets[split] = { groups, rows };
  console.log(split, groups.length, 'distinct designs', rows.length, 'samples');
}
fs.writeFileSync(
  path.join(dir, 'fault-data.json'),
  JSON.stringify({
    version: 'fault-data-1.0',
    seed: 20260905,
    labels: FAULT_LABELS,
    domain: {
      rOhm: [1000, 100000],
      cF: [1e-9, 1e-7],
      a0Db: [80, 120],
      gbwHz: [1e5, 1e8],
    },
    noise: {
      rTolerancePct: 1,
      cTolerancePct: 5,
      magnitudeSdDb: 0.15,
      phaseSdDeg: 1,
    },
    faults: {
      driftFactor: [
        [0.35, 0.7],
        [1.4, 2],
      ],
      c1OpenFarads: 1e-15,
      r1OpenOhm: 1e9,
      r2ShortOhm: 0.1,
    },
    datasets,
  }),
);
