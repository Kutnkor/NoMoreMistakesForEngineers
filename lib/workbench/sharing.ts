import { parseWorkbench, serializeWorkbench } from './project.ts';
import type { Workbench } from './types.ts';
const LIMIT = 250000,
  URL_LIMIT = 24000;
export async function encodeProject(w: Workbench): Promise<string> {
  const raw = new TextEncoder().encode(serializeWorkbench(w));
  if (raw.length > LIMIT)
    throw Error(
      'This project is too large for a share link. Export JSON instead.',
    );
  const bytes = new Uint8Array(
    await new Response(
      new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate')),
    ).arrayBuffer(),
  );
  const encoded = btoa(
    Array.from(bytes, (b) => String.fromCharCode(b)).join(''),
  )
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
  if (encoded.length > URL_LIMIT)
    throw Error(
      'This project is too large for a share link. Export JSON instead.',
    );
  return 'cf1=' + encoded;
}
export async function decodeProject(hash: string): Promise<Workbench> {
  const value = hash.replace(/^#/, '');
  if (!/^cf1=[\w-]+$/.test(value) || value.length > URL_LIMIT + 4)
    throw Error('Invalid or oversized project link.');
  const bytes = Uint8Array.from(
    atob(value.slice(4).replaceAll('-', '+').replaceAll('_', '/')),
    (c) => c.charCodeAt(0),
  );
  const reader = new Blob([bytes])
    .stream()
    .pipeThrough(new DecompressionStream('deflate'))
    .getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      size += r.value.length;
      if (size > LIMIT) {
        await reader.cancel();
        throw Error('Shared project exceeds the decoded size limit.');
      }
      chunks.push(r.value);
    }
  } finally {
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) {
    result.set(c, at);
    at += c.length;
  }
  return parseWorkbench(JSON.parse(new TextDecoder().decode(result)));
}
