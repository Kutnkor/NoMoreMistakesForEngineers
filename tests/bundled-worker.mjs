import { Worker } from 'node:worker_threads';
import { readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root = 'dist/client/_next/static';
const file = (await readdir(root)).find(
  (f) => f.startsWith('optimizer.worker-') && f.endsWith('.js'),
);
assert.ok(file, 'Production Web Worker asset is emitted');
const workerURL = pathToFileURL(resolve(root, file)).href;
const script = `import {parentPort} from 'node:worker_threads';globalThis.self={postMessage:m=>parentPort.postMessage(m)};await import(${JSON.stringify(workerURL)});parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({type:'ready'});`;
const w = new Worker(
  new URL('data:text/javascript,' + encodeURIComponent(script)),
);
let progress = 0;
await new Promise((res, rej) => {
  const timer = setTimeout(() => {
    w.terminate();
    rej(Error('Worker timeout'));
  }, 30000);
  w.on('error', (e) => {
    clearTimeout(timer);
    w.terminate();
    rej(e);
  });
  w.on('message', (m) => {
    if (m.type === 'ready')
      w.postMessage({
        passHz: 1000,
        stopHz: 5000,
        rippleDb: 1,
        stopDb: 20,
        rTol: 1,
        cTol: 5,
        budget: 32,
        seed: 42,
      });
    else if (m.type === 'progress') progress++;
    else if (m.type === 'complete') {
      try {
        assert.equal(m.data.ai.length, 32);
        assert.equal(m.data.random.length, 32);
        assert.equal(m.data.testDraws, 1024);
        assert.equal(progress, 32);
        console.log(
          'Production worker passed: 32 AI + 32 random evaluations, 32 progress messages, 1,024 held-out draws.',
        );
        clearTimeout(timer);
        w.terminate();
        res();
      } catch (e) {
        clearTimeout(timer);
        w.terminate();
        rej(e);
      }
    } else if (m.type === 'error') {
      clearTimeout(timer);
      w.terminate();
      rej(Error(m.message));
    }
  });
});
// Exercise the emitted laboratory worker, not only the TypeScript source.
const labFile = (await readdir(root)).find(
  (f) => f.startsWith('lab.worker-') && f.endsWith('.js'),
);
assert.ok(labFile, 'Production laboratory worker asset is emitted');
async function runLab(request) {
  const url = pathToFileURL(resolve(root, labFile)).href;
  const bootstrap = `import {parentPort} from 'node:worker_threads';globalThis.self={postMessage:m=>parentPort.postMessage(m)};await import(${JSON.stringify(url)});parentPort.on('message',data=>self.onmessage({data}));parentPort.postMessage({type:'ready'});`;
  const worker = new Worker(
    new URL('data:text/javascript,' + encodeURIComponent(bootstrap)),
  );
  return await new Promise((res, rej) => {
    const timer = setTimeout(() => {
      worker.terminate();
      rej(Error('Lab worker timeout'));
    }, 30000);
    const finish = (error, result) => {
      clearTimeout(timer);
      worker.terminate();
      if (error) rej(error);
      else res(result);
    };
    worker.on('error', (e) => finish(e));
    worker.on('message', (m) => {
      if (m.type === 'ready') worker.postMessage(request);
      else if (m.type === 'complete') finish(null, m.result);
      else if (m.type === 'error') finish(Error(m.message));
    });
  });
}
const specs = {
    passHz: 1000,
    stopHz: 5000,
    rippleDb: 1,
    stopDb: 20,
    rTol: 1,
    cTol: 5,
    budget: 64,
    seed: 42,
  },
  opAmp = { a0Db: 100, gbwHz: 1e7 },
  parts = { r1: 8200, r2: 8200, c1: 22e-9, c2: 8.2e-9 };
const audit = await runLab({ type: 'audit', specs, opAmp, parts });
assert.equal(audit.samples, 1024);
assert.ok(Number.isFinite(audit.nominal.stopAttenuation));
const experiment = await runLab({ type: 'budget', specs, opAmp, budget: 768 });
assert.equal(experiment.methods.length, 3);
for (const m of experiment.methods) {
  assert.equal(m.spent, 768);
  assert.equal(m.audit.samples, 1024);
}
await assert.rejects(() =>
  runLab({ type: 'audit', specs: { ...specs, passHz: NaN }, opAmp, parts }),
);
console.log(
  'Production lab worker passed: paired 1,024-draw audit, three equal-budget searches and invalid-input error.',
);
