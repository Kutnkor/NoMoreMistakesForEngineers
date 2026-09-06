// Optional real-browser regression. Uses an isolated local app test browser.
// PLAYWRIGHT_MODULE can point to a preinstalled Playwright package.
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import * as THREE from 'three';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.BASE_URL || 'http://127.0.0.1:3000';
assert.ok(
  ['127.0.0.1', 'localhost', '::1'].includes(new URL(base).hostname),
  'This test only controls a local application',
);
const out = path.resolve(process.argv[2] || 'work/breadboard-browser');
await mkdir(out, { recursive: true });
const args =
  process.env.CF_TEST_GPU === '1'
    ? [
        '--enable-gpu',
        ...(process.platform === 'darwin' ? ['--use-angle=metal'] : []),
      ]
    : [];
const browser = await chromium.launch({ headless: true, args });
const page = await browser.newPage({
  viewport: { width: 1280, height: 1000 },
  deviceScaleFactor: 1,
});
const report = {
  browser: await browser.version(),
  launchArguments: args,
  date: new Date().toISOString(),
  checks: [],
  pdfs: [],
  errors: [],
};
page.on('pageerror', (e) => report.errors.push(String(e)));
const check = (name, data = true) => {
  report.checks.push({ name, result: data });
  console.log(name, JSON.stringify(data));
};
const btn = (name) => page.getByRole('button', { name, exact: true });
const valid = () =>
  page
    .getByRole('heading', {
      name: 'Correct — matches the schematic',
      exact: true,
    })
    .waitFor({ state: 'visible', timeout: 1500 })
    .then(
      () => true,
      () => false,
    );
async function choose(name) {
  await page.getByRole('combobox', { name: 'Breadboard circuit' }).click();
  await page.getByRole('option', { name, exact: true }).click();
}
async function auto() {
  await btn('Auto-build').click();
  assert.ok(await valid());
}
async function exportLayout() {
  const dl = page.waitForEvent('download');
  await btn('Netlist and layout JSON').click();
  const d = await dl;
  const stream = await d.createReadStream();
  const chunks = [];
  for await (const c of stream) chunks.push(c);
  return JSON.parse(Buffer.concat(chunks).toString());
}
async function drag2d(ref, delta) {
  const body = page
    .locator(
      `[data-part="${ref}"] ${ref.startsWith('C') ? 'ellipse' : 'rect:not(.bb-part-halo)'}`,
    )
    .first();
  await body.scrollIntoViewIfNeeded();
  const b = await body.boundingBox();
  const scale = await page
    .locator('.bb-board-svg')
    .evaluate((e) => e.getScreenCTM().a);
  const x = b.x + b.width / 2,
    y = b.y + b.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 30; i++) {
    await page.mouse.move(x + (delta * scale * i) / 30, y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
}
try {
  await page.goto(base + '/breadboard', { waitUntil: 'networkidle' });
  await auto();
  await page.locator('.bb-original-schematic [data-ref="R1"]').first().hover();
  assert.equal(
    await page.locator('[data-part="R1"]').getAttribute('data-active'),
    'true',
  );
  await page.locator('[data-part="C1"] ellipse').hover();
  assert.equal(
    await page.locator('.bb-original-schematic').getAttribute('data-highlight'),
    'C1',
  );
  check('bidirectional schematic and board hover');
  const before = await exportLayout();
  await drag2d('R1', 2.54);
  const after = await exportLayout();
  assert.notDeepEqual(after.layout.parts.R1.pins, before.layout.parts.R1.pins);
  assert.ok(after.issues.some((x) => x.ref === 'R1'));
  check(
    '2D pointer drag snaps and diagnoses wrong pin',
    after.layout.parts.R1.pins,
  );
  await btn('Undo').click();
  assert.ok(await valid());
  await drag2d('C2', 2.54);
  const follow = await exportLayout();
  assert.notDeepEqual(follow.layout.parts.C2.pins, before.layout.parts.C2.pins);
  check('attached jumpers follow a real 2D drag', follow.layout.parts.C2.pins);
  await btn('Undo').click();
  await btn('Empty board').click();
  for (let i = 0; i < 15; i++) {
    await btn('Hint').click();
    await btn('Apply this step').click();
  }
  assert.ok(await valid());
  check('empty board completes through 15 learning hints');
  await choose('Passive RC');
  await auto();
  await btn('Draw jumper').click();
  await page.locator('[data-hole="6-E"]').click();
  await page.locator('[data-hole="12-E"]').click();
  assert.ok(!(await valid()));
  const manual = await exportLayout();
  assert.ok(manual.layout.wires.some((w) => w.id === 'WM1'));
  check('manual hole-to-hole jumper creates a detectable short');
  await btn('Undo').click();
  assert.ok(await valid());
  await page.locator('[data-hole="6-E"]').hover();
  assert.ok((await page.locator('[data-hole][fill="#00a3aa"]').count()) >= 5);
  check('net hover highlights physical copper group');
  await btn('Select and move components').click();
  // PDF exports are rendered with the browser print engine from actual preview HTML.
  for (const [id, name] of [
    ['sk-lp', 'Sallen–Key · low-pass'],
    ['sk-hp', 'Sallen–Key · high-pass'],
    ['mfb-bp', 'MFB · band-pass'],
    ['rc', 'Passive RC'],
    ['cascade', 'Cascade · 4th order'],
  ]) {
    await choose(name);
    await auto();
    await btn('One-page guide').click();
    await page.getByRole('dialog', { name: 'Assembly guide' }).waitFor();
    const html = await page
      .locator('iframe[title="Breadboard print preview"]')
      .getAttribute('srcdoc');
    const print = await browser.newPage();
    await print.setContent(html);
    await print.locator('img').evaluate((i) => i.decode());
    await print.pdf({
      path: path.join(out, id + '.pdf'),
      preferCSSPageSize: true,
      printBackground: true,
    });
    await print.close();
    report.pdfs.push(id + '.pdf');
    await btn('Close').click();
  }
  check('five auto layouts export print-engine PDFs');
  await choose('Sallen–Key · low-pass');
  await auto();
  const pre3d = await exportLayout();
  await btn('3D').click();
  await page.locator('.bb-3d canvas').waitFor();
  await btn('Reset camera').click();
  await page.locator('.bb-3d canvas').scrollIntoViewIfNeeded();
  report.gpuRenderer = await page.locator('.bb-3d canvas').evaluate((c) => {
    const g = c.getContext('webgl2');
    const e = g.getExtension('WEBGL_debug_renderer_info');
    return g.getParameter(e.UNMASKED_RENDERER_WEBGL);
  });
  const b = await page.locator('.bb-3d canvas').boundingBox();
  // Project the known physical resistor center using the public initial camera.
  const camera = new THREE.PerspectiveCamera(38, b.width / b.height, 0.1, 1000);
  camera.position.set(13, 127, 129);
  camera.lookAt(0, 0, 0);
  camera.updateMatrixWorld();
  const pt = new THREE.Vector3(
    28.32 - 173.5 / 2,
    2.6,
    37.24 - 53.5 / 2,
  ).project(camera);
  const x = b.x + ((pt.x + 1) * b.width) / 2,
    y = b.y + ((1 - pt.y) * b.height) / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  for (let i = 1; i <= 75; i++) {
    await page.mouse.move(x + (25 * i) / 75, y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();
  const status = await page.locator('.bb-3d-status').innerText();
  const post3d = await exportLayout();
  assert.notDeepEqual(post3d.layout.parts.R1.pins, pre3d.layout.parts.R1.pins);
  assert.match(status, /son sürükleme \d+ fps/);
  check('3D pointer drag updates shared pin coordinates', {
    pins: post3d.layout.parts.R1.pins,
    status,
  });
  await btn('2D top view').click();
  const roundTrip = await exportLayout();
  assert.deepEqual(roundTrip.layout, post3d.layout);
  check('2D and 3D keep identical physical layout');
  await btn('Undo').click();
  assert.ok(await valid());
  await btn('3D').click();
  await page.locator('.bb-3d canvas').waitFor();
  await page.screenshot({ path: path.join(out, '3d.png'), fullPage: true });
  const png = page.waitForEvent('download');
  await btn('PNG').click();
  await (await png).saveAs(path.join(out, 'board-3d.png'));
  check('3D PNG export');
  await btn('2D top view').click();
  await btn('Dark theme').click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  );
  await page.screenshot({
    path: path.join(out, 'mobile-dark.png'),
    fullPage: true,
  });
  check('390px dark theme without page overflow');
  assert.deepEqual(report.errors, []);
  check('no browser page errors');
} finally {
  await writeFile(
    path.join(out, 'browser-validation.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  await browser.close();
}
