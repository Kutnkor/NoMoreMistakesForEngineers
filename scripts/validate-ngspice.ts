import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';
import { DEFAULT_SPECS, REFERENCE, decode, rng } from '../lib/circuit.ts';
import { finiteNetlist, finiteTransfer } from '../lib/lab/realistic.ts';
const binary = resolve(process.argv[2]),
  out = resolve(process.argv[3]);
mkdirSync(out, { recursive: true });
const random = rng(6092026),
  cases = [];
for (let i = 0; i < 30; i++) {
  const parts =
    i === 0 ? REFERENCE : decode(Array.from({ length: 4 }, () => random()));
  const opAmp = { a0Db: 40 + 100 * random(), gbwHz: 10 ** (4 + 5 * random()) };
  const net = finiteNetlist(parts, DEFAULT_SPECS, opAmp).replace(
    /\.ac[^]*$/m,
    `.control\nset numdgt=15\nset wr_vecnames\nset wr_singlescale\nac dec 50 1 100000000\nwrdata response-${i}.txt v(out)\nquit\n.endc\n.end\n`,
  );
  const file = resolve(out, `case-${i}.cir`);
  writeFileSync(file, net);
  const log = execFileSync(binary, ['-b', file], {
    cwd: out,
    encoding: 'utf8',
  });
  writeFileSync(resolve(out, `case-${i}.log`), log);
  const rows = readFileSync(resolve(out, `response-${i}.txt`), 'utf8')
    .trim()
    .split('\n')
    .slice(1)
    .map((l) => l.trim().split(/\s+/).map(Number));
  let maxComplexError = 0,
    maxRelativeError = 0,
    maxDbError = 0;
  for (const [hz, re, im] of rows) {
    if (![hz, re, im].every(Number.isFinite))
      throw Error('Nonfinite ngspice output');
    const a = finiteTransfer(parts, hz, opAmp),
      error = Math.hypot(re - a[0], im - a[1]);
    maxComplexError = Math.max(maxComplexError, error);
    maxRelativeError = Math.max(
      maxRelativeError,
      error / Math.max(1e-30, Math.hypot(re, im)),
    );
    maxDbError = Math.max(
      maxDbError,
      Math.abs(
        20 * Math.log10(Math.hypot(re, im)) - 20 * Math.log10(Math.hypot(...a)),
      ),
    );
  }
  if (rows.length !== 401 || maxRelativeError > 1e-6)
    throw Error(
      JSON.stringify({ i, n: rows.length, maxRelativeError, maxDbError }),
    );
  cases.push({
    parts,
    opAmp,
    frequencies: rows.length,
    maxComplexError,
    maxRelativeError,
    maxDbError,
  });
}
const report = {
  version: 'finite-ngspice-1.0',
  date: '2026-09-05',
  simulator: 'ngspice 47 (KLU, macOS arm64, no OpenMP)',
  sourceArchiveSha256:
    '894e649651f1838a14095e5a5439e7d3aa63e87ede14d283173fda4fcdef675f',
  seed: 6092026,
  scope:
    '30 designs × 401 frequencies (1 Hz–100 MHz), one-pole finite op-amp unity Sallen–Key, A0 40–140 dB and GBW 10 kHz–1 GHz. Independent native ngspice AC solution compared with browser analytical transfer. No physical measurements, clipping, slew, noise, output impedance or parasitic component model.',
  points: cases.reduce((s, c) => s + c.frequencies, 0),
  maxRelativeError: Math.max(...cases.map((c) => c.maxRelativeError)),
  maxDbError: Math.max(...cases.map((c) => c.maxDbError)),
  cases,
};
writeFileSync(
  'research/ngspice-validation.json',
  JSON.stringify(report, null, 2) + '\n',
);
console.log(
  JSON.stringify({
    points: report.points,
    maxRelativeError: report.maxRelativeError,
    maxDbError: report.maxDbError,
  }),
);
