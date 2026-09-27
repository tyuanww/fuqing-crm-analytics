import { createServer } from 'node:http';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runBackpressure } from './backpressure.mjs';
import { runCompatibilityMatrix } from './compat-check.mjs';

export async function runLocalVerification() {
  const compatibilityRoot = await mkdtemp(join(tmpdir(), 'dsh-verify-compat-'));
  let server;
  try {
    const fixture = join(compatibilityRoot, 'synthetic-session.json');
    await writeFile(fixture, JSON.stringify({ schema: 'rc1-fixture', session_id: 'synthetic-session', runtime: { draft: 'fixture' }, wal_offset: 0 }));
    const compatibility = await runCompatibilityMatrix(compatibilityRoot, { runtimeRunner: async root => {
      const current = JSON.parse(await readFile(join(root, 'synthetic-session.json'), 'utf8'));
      current.schema = 'rc2-fixture';
      current.runtime.draft = 'fixture-updated';
      current.wal_offset += 1;
      await writeFile(join(root, 'synthetic-session.json'), JSON.stringify(current));
      const roundTrip = JSON.parse(await readFile(join(root, 'synthetic-session.json'), 'utf8'));
      return {
        status: roundTrip.schema === 'rc2-fixture' && roundTrip.runtime.draft === 'fixture-updated' && roundTrip.wal_offset === 1 ? 'PASS' : 'FAIL',
        fixture: root,
        scope: 'synthetic-json-only',
        real_duckdb: 'NOT_RUN',
        wsl2: 'NOT_RUN',
      };
    } });

    server = createServer((request, response) => {
      if (request.url !== '/health') { response.writeHead(404); response.end(); return; }
      response.writeHead(200, { 'content-type': 'text/plain' });
      response.end('ok');
    });
    await new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(0, '127.0.0.1', resolve);
    });
    const url = `http://127.0.0.1:${server.address().port}/health`;
    const backpressure = await runBackpressure({
      requests: 100,
      concurrency: 10,
      synthetic: true,
      evidenceScope: 'synthetic-loopback-http',
      task: async () => ({ status: (await fetch(url)).status }),
    });
    if (!backpressure.results.every(result => result.status === 200)) backpressure.status = 'FAIL';
    return { compatibility, backpressure };
  } finally {
    if (server) await new Promise(resolve => server.close(resolve));
    await rm(compatibilityRoot, { recursive: true, force: true });
  }
}
