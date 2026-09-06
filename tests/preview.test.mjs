import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPreviewServer } from '../scripts/serve.mjs';

await test('standalone preview serves exported routes and limits file access to the build directory', async (t) => {
  const temp = await mkdtemp(join(tmpdir(), 'circuit-preview-'));
  const root = join(temp, 'build');
  await mkdir(root);
  await writeFile(join(root, 'index.html'), '<h1>Home</h1>');
  await writeFile(join(root, 'breadboard.html'), '<h1>Breadboard</h1>');
  await writeFile(join(root, 'worker.js'), 'self.onmessage = () => {};');
  await writeFile(join(temp, 'private.txt'), 'outside');
  await symlink(join(temp, 'private.txt'), join(root, 'escape.txt'));
  const server = await createPreviewServer(root);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(async () => {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    await rm(temp, { recursive: true });
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const route of [
    '/breadboard',
    '/breadboard/',
    '/breadboard?example=1',
  ]) {
    const result = await fetch(base + route);
    assert.equal(result.status, 200, route);
    assert.equal(await result.text(), '<h1>Breadboard</h1>');
  }
  assert.equal(await (await fetch(base)).text(), '<h1>Home</h1>');
  assert.match(
    (await fetch(base + '/worker.js')).headers.get('content-type'),
    /javascript/,
  );
  assert.equal((await fetch(base + '/missing')).status, 404);
  assert.equal((await fetch(base + '/escape.txt')).status, 404);
  assert.equal((await fetch(base + '/%2e%2e%2fprivate.txt')).status, 403);
  assert.equal((await fetch(base + '/.env')).status, 403);
  assert.equal((await fetch(base + '/%ZZ')).status, 400);
  assert.equal((await fetch(base, { method: 'POST' })).status, 405);
  const head = await fetch(base + '/breadboard', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});
