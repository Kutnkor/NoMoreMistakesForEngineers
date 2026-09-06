// Static production preview. Serves clean exported routes without a hosting account.
import { createServer } from 'node:http';
import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};
export async function createPreviewServer(directory) {
  const root = await realpath(directory);
  return createServer((request, response) => {
    async function serve() {
      if (!['GET', 'HEAD'].includes(request.method)) {
        response.writeHead(405, { Allow: 'GET, HEAD' });
        response.end();
        return;
      }
      let pathname;
      try {
        pathname = decodeURIComponent(
          new URL(request.url, 'http://localhost').pathname,
        );
      } catch {
        response.writeHead(400).end('Invalid path');
        return;
      }
      if (
        pathname.includes('\0') ||
        pathname.includes('\\') ||
        pathname
          .split('/')
          .some((part) => part === '..' || part.startsWith('.'))
      ) {
        response.writeHead(403).end('Forbidden');
        return;
      }
      const base = resolve(root, '.' + pathname);
      const candidates = pathname.endsWith('/')
        ? [resolve(base, 'index.html'), base + '.html']
        : [
            base,
            ...(extname(base)
              ? []
              : [base + '.html', resolve(base, 'index.html')]),
          ];
      for (const candidate of candidates) {
        let file;
        try {
          file = await realpath(candidate);
          if (!file.startsWith(root + sep) || !(await stat(file)).isFile())
            continue;
        } catch {
          continue;
        }
        response.writeHead(200, {
          'Content-Type': types[extname(file)] || 'application/octet-stream',
          'X-Content-Type-Options': 'nosniff',
        });
        response.end(
          request.method === 'HEAD' ? undefined : await readFile(file),
        );
        return;
      }
      response
        .writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' })
        .end('Not found');
    }
    void serve().catch(() => {
      if (!response.headersSent) response.writeHead(500);
      response.end('Preview error');
    });
  });
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    const server = await createPreviewServer(resolve('dist/client'));
    const port = Number(process.env.PORT || 4173);
    if (!Number.isInteger(port) || port < 1 || port > 65535)
      throw Error('PORT must be an integer from 1 to 65535.');
    server.on('error', (error) => {
      console.error(error.message);
      process.exitCode = 1;
    });
    server.listen(port, '127.0.0.1', () =>
      console.log(`Production preview: http://127.0.0.1:${port}`),
    );
  } catch (error) {
    console.error(
      `Cannot start preview. Run pnpm build first. ${error.message}`,
    );
    process.exitCode = 1;
  }
}
