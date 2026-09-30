import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

const root = process.cwd();
const script = join(root, 'deploy/wsl/fetch-release.sh');
const tag = 'dsh-fetch-test';
const runtime = 'shinemage-dsh-upstream-runtime-477b4f420553e8a52c2fbccc464d7561b239c443.tar.zst';
const names = [
  `${tag}.tar.zst`,
  runtime,
  'pre-manifest.v1.json',
  'release-manifest.v1.json',
  'SHA256SUMS',
  'ci-evidence-index.v1.json',
];

function digest(value) { return createHash('sha256').update(value).digest('hex'); }

function runFetch(env) {
  return new Promise((resolve, reject) => {
    const child = spawn('bash', [script], { cwd: root, env });
    let stdout = ''; let stderr = '';
    child.stdout.on('data', chunk => { stdout += chunk; });
    child.stderr.on('data', chunk => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve(stdout) : reject(new Error(`fetch exit=${code}\n${stdout}\n${stderr}`)));
  });
}

test('fetch-release downloads, verifies, and reuses a synthetic immutable bundle', async () => {
  const work = await mkdtemp(join(tmpdir(), 'dsh-fetch-test-'));
  const web = join(work, 'web');
  const incoming = join(work, 'incoming');
  await mkdir(web);
  await mkdir(incoming);
  for (const name of names) await writeFile(join(web, name), `fixture:${name}\n`);
  await writeFile(join(web, 'release-manifest.v1.json'), JSON.stringify({ release_tag: tag, source_sha: 'a'.repeat(40), upstream_runtime: { name: runtime } }) + '\n');
  const assets = [];
  for (const name of names) {
    const body = await readFile(join(web, name));
    assets.push({ name, size: body.length, sha256: digest(body) });
  }
  const publication = {
    schema_version: 'release-publication/v1', status: 'PUBLISHED_VERIFIED', draft: false, immutable: true,
    release_tag: tag, source_sha: 'a'.repeat(40), reviewed_sha: 'a'.repeat(40),
    protected_ref: `refs/tags/${tag}`, ref_target_sha: 'a'.repeat(40), assets,
  };
  const publicationPath = join(incoming, 'release-publication.v1.json');
  await writeFile(publicationPath, JSON.stringify(publication) + '\n');

  const server = createServer(async (request, response) => {
    try {
      const body = await readFile(join(web, decodeURIComponent(request.url.slice(1))));
      response.writeHead(200, { 'content-length': body.length }); response.end(body);
    } catch {
      response.writeHead(404); response.end();
    }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const env = {
    ...process.env,
    RELEASE_TAG: tag,
    RELEASE_REPO: 'tyuanww/fuqing-crm-analytics',
    RELEASE_BASE_URL: `http://127.0.0.1:${port}`,
    RELEASE_PUBLICATION: publicationPath,
    RELEASE_INCOMING: incoming,
    RELEASE_RETRY_DELAY: '0',
  };
  try {
    const first = await runFetch(env);
    assert.match(first, /RELEASE_FETCH_PASS tag=dsh-fetch-test/);
    const second = await runFetch(env);
    assert.match(second, /RELEASE_FETCH_REUSED name=dsh-fetch-test\.tar\.zst/);
    const receipt = JSON.parse(await readFile(join(incoming, 'release-fetch.v1.json'), 'utf8'));
    assert.equal(receipt.status, 'FETCHED_VERIFIED');
    assert.equal(receipt.transport, 'github-release-direct');
    assert.equal(receipt.control_plane, 'tailscale-ssh');
    assert.equal(receipt.assets.length, 6);
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
});
