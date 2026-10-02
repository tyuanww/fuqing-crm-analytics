#!/usr/bin/env node

/**
 * Synthetic host used by host-feasibility.mjs.
 *
 * It deliberately models the conservative boundary used by the release plan:
 * a plugin is loaded at process start, in-process unload is not promised, and
 * a hung or crashed plugin is recovered by replacing the host process.  This
 * file never reads a repository or operator home and only serves loopback.
 */
import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import process from 'node:process';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) args.set(process.argv[index], process.argv[index + 1]);
const profilePath = args.get('--profile');
const walPath = args.get('--wal');
const mode = args.get('--mode') ?? 'native-only';
const requestedPort = Number(args.get('--port') ?? 0);
if (!profilePath || !walPath || !['plugin', 'native-only', 'hang', 'crash'].includes(mode)) {
  console.error('HOST_FIXTURE_ARGS_INVALID');
  process.exit(2);
}

const profile = JSON.parse(await readFile(profilePath, 'utf8'));
const profileDigest = createHash('sha256').update(JSON.stringify(profile)).digest('hex');
let closed = false;

async function appendWal(event, fields = {}) {
  await appendFile(walPath, `${JSON.stringify({ schema_version: 'dsh-host-wal/v1', at: new Date().toISOString(), event, ...fields })}\n`, { mode: 0o600 });
}

const server = createServer(async (request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1');
  if (request.method === 'GET' && url.pathname === '/health') {
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'OK', mode, profile_digest: profileDigest, native: true, plugin: mode === 'plugin' }));
    return;
  }
  if (request.method === 'GET' && url.pathname === '/native-loop') {
    await appendWal('native-loop', { generation: profile.generation });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'OK', native: true, profile_digest: profileDigest }));
    return;
  }
  if (request.method === 'GET' && url.pathname === '/plugin') {
    if (mode === 'hang') return;
    if (mode === 'crash') {
      process.kill(process.pid, 'SIGKILL');
      return;
    }
    if (mode !== 'plugin') {
      response.writeHead(404, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ status: 'NOT_AVAILABLE', reason: 'PLUGIN_DISABLED' }));
      return;
    }
    await appendWal('plugin-loop', { generation: profile.generation });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'OK', plugin: true, profile_digest: profileDigest }));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/plugin/unload') {
    response.writeHead(409, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ status: 'HOST_RESTART_REQUIRED', reason: 'IN_PROCESS_UNLOAD_NOT_PROMISED' }));
    return;
  }
  if (request.method === 'POST' && url.pathname === '/shutdown') {
    response.writeHead(200).end();
    setImmediate(() => void close());
    return;
  }
  response.writeHead(404).end();
});

async function close() {
  if (closed) return;
  closed = true;
  await new Promise(resolve => server.close(resolve));
}
process.once('SIGTERM', () => void close().finally(() => process.exit(0)));
process.once('SIGINT', () => void close().finally(() => process.exit(0)));
server.listen(requestedPort, '127.0.0.1', () => {
  const address = server.address();
  console.log(`HOST_READY ${address.port} ${profileDigest}`);
});
