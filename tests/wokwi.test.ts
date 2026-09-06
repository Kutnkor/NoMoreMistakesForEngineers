import test from 'node:test';
import assert from 'node:assert/strict';
import { boards, components } from '../lib/hardware/catalog.ts';
import { planHardware } from '../lib/hardware/planner.ts';
import {
  createWokwiProject,
  wokwiSupport,
  WOKWI_BOARDS,
  WOKWI_PARTS,
} from '../lib/hardware/wokwi.ts';
import { generateSketch } from '../lib/hardware/sketch.ts';
import { zipTextFiles, crc32 } from '../lib/zip.ts';
import { spawnSync } from 'node:child_process';
const plan = (b: string, ids: string[]) =>
  planHardware(
    boards.find((x) => x.id === b)!,
    components,
    ids.map((componentId, i) => ({ id: 'm' + i, componentId })),
  );
await test('all supported board/module pairs export or explicitly reject incompatible plans', () => {
  for (const b of Object.keys(WOKWI_BOARDS))
    for (const id of Object.keys(WOKWI_PARTS)) {
      const p = plan(b, [id]);
      if (!p.canGenerate) {
        assert.equal(wokwiSupport(p).supported, false);
        assert.throws(() => createWokwiProject(p));
        continue;
      }
      const e = createWokwiProject(p);
      assert.equal(e.diagram.version, 1);
      assert.equal(e.diagram.parts[0].type, WOKWI_BOARDS[b].type);
      assert.ok(
        e.diagram.connections.every(
          (c) => !c[0].includes('undefined') && !c[1].includes('undefined'),
        ),
      );
    }
  assert.equal(
    wokwiSupport(plan('uno-r4-minima', ['led-red'])).supported,
    false,
  );
  assert.throws(() =>
    createWokwiProject(plan('uno-rev3', ['bme280-adafruit'])),
  );
});
await test('simulation preserves LED resistors, button contacts, sensor pullups and OLED reset distinction', () => {
  const e = createWokwiProject(
    plan('uno-rev3', [
      'led-red',
      'pot-10k',
      'pushbutton',
      'ssd1306-adafruit-128x64',
    ]),
  );
  assert.ok(
    e.diagram.parts.some(
      (p) => p.type === 'wokwi-resistor' && p.attrs.value === '1000',
    ),
  );
  assert.ok(e.diagram.connections.some((c) => c.includes('part3:1.l')));
  assert.ok(e.diagram.connections.some((c) => c.includes('part3:2.l')));
  assert.match(
    e.files['sketch.ino'],
    /Adafruit_SSD1306 cf_m3\(128, 64, &Wire, -1\)/,
  );
  assert.match(
    generateSketch(plan('uno-rev3', ['ssd1306-adafruit-128x64'])),
    /&Wire, cf_m0_RESET/,
  );
  for (const id of ['dht22', 'ds18b20'])
    assert.ok(
      createWokwiProject(plan('uno-rev3', [id])).diagram.parts.some(
        (p) => p.attrs.value === '4700',
      ),
    );
  assert.equal(
    createWokwiProject(plan('uno-rev3', ['led-rgb-cc'])).diagram.parts.filter(
      (p) => p.type === 'wokwi-resistor',
    ).length,
    3,
  );
});
await test('ESP32 uses ADC1 pins including VP/VN and Pico configures the assigned I2C bus', () => {
  const e = createWokwiProject(
    plan('esp32-devkitc-v4', Array(4).fill('pot-10k')),
  );
  for (const pin of ['34', '35', 'VP', 'VN'])
    assert.ok(
      e.diagram.connections.some((c) => c.includes('board:' + pin)),
      pin,
    );
  const pico = createWokwiProject(
    plan('raspberry-pi-pico', ['ssd1306-adafruit-128x64']),
  );
  assert.match(pico.files['sketch.ino'], /Wire.setSDA\(4\)/);
  assert.match(pico.files['sketch.ino'], /Wire.setSCL\(5\)/);
  assert.equal(
    plan('raspberry-pi-pico', ['hcsr04-5v-sparkfun']).canGenerate,
    false,
  );
});
await test('project ZIP is interoperable with Python zipfile including UTF-8 and CRCs', () => {
  const files = {
    ...createWokwiProject(plan('uno-rev3', ['led-red', 'pot-10k'])).files,
    'turkce.txt': 'Wiring, measurement, and light.',
  };
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const result = spawnSync(
    'python3',
    [
      '-c',
      'import io,json,sys,zipfile; z=zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())); assert z.testzip() is None; print(json.dumps({n:z.read(n).decode("utf-8") for n in z.namelist()},ensure_ascii=False))',
    ],
    { input: zipTextFiles(files), encoding: 'utf8' },
  );
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), files);
  assert.throws(() => zipTextFiles({ '../escape.txt': 'bad' }));
});
