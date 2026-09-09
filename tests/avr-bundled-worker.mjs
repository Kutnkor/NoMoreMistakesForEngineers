import { Worker } from 'node:worker_threads';
import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import assert from 'node:assert/strict';
const root = 'dist/client/_next/static';
const asset = (await readdir(root)).find((f) => /^worker-.*\.js$/.test(f));
assert.ok(asset, 'AVR production worker was emitted');
const url = pathToFileURL(resolve(root, asset)).href;
const bootstrap = `import {parentPort} from 'node:worker_threads';globalThis.onmessage=null;globalThis.postMessage=m=>parentPort.postMessage(m);await import(${JSON.stringify(url)});parentPort.on('message',data=>globalThis.onmessage({data}));parentPort.postMessage({type:'ready'});`;
const worker = new Worker(
  new URL('data:text/javascript,' + encodeURIComponent(bootstrap)),
);
const hex = await readFile('tests/fixtures/avr/inputs.hex', 'utf8');
try {
  await new Promise((res, rej) => {
    const timeout = setTimeout(() => rej(Error('AVR worker timed out')), 15000);
    let stage = 0;
    worker.on('error', (e) => {
      clearTimeout(timeout);
      rej(e);
    });
    worker.on('message', (m) => {
      try {
        if (m.type === 'ready')
          worker.postMessage({
            type: 'start',
            hex,
            circuit: {
              boardId: 'uno',
              leds: [{ id: 'LED1', pin: 9, activeLow: false, resistance: 330 }],
              buttons: [{ id: 'B', pin: 2 }],
              pots: [{ id: 'P', channel: 0, reverse: false }],
            },
            inputs: { buttons: { B: false }, pots: { P: 0.25 } },
          });
        else if (m.type === 'error') throw Error(m.message);
        else if (
          m.type === 'frame' &&
          stage === 0 &&
          m.frame.milliseconds > 100
        ) {
          assert.match(m.frame.serial, /256,0/);
          assert.ok(Math.abs(m.frame.leds.LED1 - 0.25) < 0.08);
          stage = 1;
          worker.postMessage({
            type: 'inputs',
            inputs: { buttons: { B: true }, pots: { P: 0.75 } },
          });
          worker.postMessage({ type: 'serial', text: 'Q' });
        } else if (
          m.type === 'frame' &&
          stage === 1 &&
          m.frame.milliseconds > 300
        ) {
          assert.match(m.frame.serial, /768,1/);
          assert.match(m.frame.serial, /echo:Q/);
          assert.equal(m.frame.leds.LED1, 1);
          worker.postMessage({ type: 'stop' });
          clearTimeout(timeout);
          res();
        }
      } catch (e) {
        clearTimeout(timeout);
        rej(e);
      }
    });
  });
  console.log(
    'Production AVR worker passed: compiled C++, ADC, PWM, button changes and serial RX/TX.',
  );
} finally {
  await worker.terminate();
}
