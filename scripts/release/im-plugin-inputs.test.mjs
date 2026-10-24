import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { validateImPluginInputs, verifyImPluginInputs } from './im-plugin-inputs.mjs';

const exec = promisify(execFile);
const inspector = fileURLToPath(new URL('./inspect-im-plugin-archive.py', import.meta.url));

function sha(buffer, algorithm, encoding = 'hex') {
  return createHash(algorithm).update(buffer).digest(encoding);
}

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'im-plugin-inputs-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const inputDir = join(root, 'inputs');
  await mkdir(inputDir, { recursive: true });
  const inputs = [];
  for (const [file, packageName, version, commit] of [
    ['dsh-im.tar.gz', '@xmanrui/dsh-im', '5.2.0', 'a'.repeat(40)],
    ['dsh-plugin-hub.tar.gz', 'dsh-plugin', '2.0.5', 'b'.repeat(40)],
  ]) {
    const sourceName = `source-${packageName.replaceAll(/[@/]/g, '-')}-${commit}`;
    const source = join(root, sourceName);
    await mkdir(source);
    await writeFile(join(source, 'package.json'), `${JSON.stringify({ name: packageName, version })}\n`);
    const archive = join(inputDir, file);
    await exec('tar', ['-czf', archive, '-C', root, sourceName], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    const bytes = await readFile(archive);
    const repository = packageName === 'dsh-plugin' ? 'https://github.com/dshplugin/dsh-plugin-hub' : 'https://github.com/xmanrui/dsh-im';
    inputs.push({
      package: packageName,
      version,
      repository,
      commit,
      source_url: `${repository.replace('https://github.com/', 'https://codeload.github.com/')}/tar.gz/${commit}`,
      tarball: file,
      bytes: bytes.length,
      sha256: sha(bytes, 'sha256'),
      integrity: `sha512-${sha(bytes, 'sha512', 'base64')}`,
    });
  }
  const lock = {
    schema_version: 'shinemage-im-plugin-inputs/v1',
    release_ready: false,
    runtime: { dsh: '0.2.1-rc.3', cordis: '4.0.5' },
    inputs,
  };
  const lockPath = join(root, 'lock.json');
  await writeFile(lockPath, `${JSON.stringify(lock, null, 2)}\n`);
  return { root, inputDir, lockPath, lock };
}

async function rewriteFirstArchive(f, style) {
  const input = f.lock.inputs[0];
  const archive = join(f.inputDir, input.tarball);
  const root = `source-${input.package.replaceAll(/[@/]/g, '-')}-${input.commit}`;
  const script = `import io, json, sys, tarfile
archive, root, name, version, style = sys.argv[1:]
payload = (json.dumps({"name": name, "version": version}) + "\\n").encode()
names = [f"{root}/./package.json"] if style == "dot" else [f"{root}/package.json"] * 2
with tarfile.open(archive, "w:gz") as source:
    for member_name in names:
        member = tarfile.TarInfo(member_name)
        member.size = len(payload)
        member.mode = 0o600
        source.addfile(member, io.BytesIO(payload))
`;
  await exec('python3', ['-c', script, archive, root, input.package, input.version, style]);
  const bytes = await readFile(archive);
  input.bytes = bytes.length;
  input.sha256 = sha(bytes, 'sha256');
  input.integrity = `sha512-${sha(bytes, 'sha512', 'base64')}`;
  await writeFile(f.lockPath, `${JSON.stringify(f.lock)}\n`);
}

async function inspectMembers(t, members, { commit = 'a'.repeat(40), args = [] } = {}) {
  const root = await mkdtemp(join(tmpdir(), 'im-plugin-inspector-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const archive = join(root, 'input.tar.gz');
  const script = `import io, json, sys, tarfile
archive, members = sys.argv[1], json.loads(sys.argv[2])
with tarfile.open(archive, "w:gz") as target:
    for value in members:
        member = tarfile.TarInfo(value["name"])
        if value.get("type") == "dir":
            member.type = tarfile.DIRTYPE
            target.addfile(member)
        elif value.get("type") == "symlink":
            member.type = tarfile.SYMTYPE
            member.linkname = value.get("linkname", "target")
            target.addfile(member)
        else:
            payload = value.get("data", "").encode()
            member.size = len(payload)
            target.addfile(member, io.BytesIO(payload))
`;
  await exec('python3', ['-c', script, archive, JSON.stringify(members)]);
  return exec('python3', ['-I', '-B', inspector, archive, commit, ...args], { encoding: 'utf8' });
}

test('pinned IM inputs verify exact bytes and package identity without claiming release readiness', async t => {
  const f = await fixture(t);
  const receipt = await verifyImPluginInputs({ lockPath: f.lockPath, inputDir: f.inputDir });
  assert.equal(receipt.status, 'PASS');
  assert.equal(receipt.release_ready, false);
  assert.deepEqual(receipt.packages.map(row => [row.package, row.version]), [
    ['@xmanrui/dsh-im', '5.2.0'],
    ['dsh-plugin', '2.0.5'],
  ]);
});

test('IM input verification rejects digest drift before package admission', async t => {
  const f = await fixture(t);
  f.lock.inputs[0].sha256 = '0'.repeat(64);
  await writeFile(f.lockPath, `${JSON.stringify(f.lock)}\n`);
  await assert.rejects(verifyImPluginInputs({ lockPath: f.lockPath, inputDir: f.inputDir }), /IM_INPUT_SHA256_MISMATCH/);
});

test('IM input lock rejects release claims and duplicate packages', async t => {
  const f = await fixture(t);
  f.lock.release_ready = true;
  assert.throws(() => validateImPluginInputs(f.lock), /IM_INPUT_RELEASE_BOUNDARY/);
  f.lock.release_ready = false;
  f.lock.inputs[1].package = f.lock.inputs[0].package;
  assert.throws(() => validateImPluginInputs(f.lock), /IM_INPUT_REPOSITORY|IM_INPUT_DUPLICATE|IM_INPUT_PACKAGES/);
});

test('IM archive inspector rejects normalized dot segments and duplicate members', async t => {
  for (const style of ['dot', 'duplicate']) {
    const f = await fixture(t);
    await rewriteFirstArchive(f, style);
    await assert.rejects(
      verifyImPluginInputs({ lockPath: f.lockPath, inputDir: f.inputDir }),
      /IM_ARCHIVE_(?:PATH_INVALID|DUPLICATE_PATH)/,
    );
  }
});

// Value: protects=IM archive admission fails closed on root, commit, member type, limits and package corruption; fails_when=any corresponding inspector guard is removed; why_new=existing tests cover only path normalization and duplicates; seam=none; no_claim=live archive authenticity (synthetic tar fixtures; byte lock checked elsewhere)
test('IM archive inspector rejects root, commit, link, limit and package violations', async t => {
  const commit = 'a'.repeat(40);
  const root = `fixture-${commit}`;
  const packageMember = { name: `${root}/package.json`, data: JSON.stringify({ name: 'fixture', version: '1.0.0' }) };
  const cases = [
    {
      name: 'root',
      members: [{ name: `${root}/`, type: 'dir' }, packageMember, { name: `other-${commit}/file.txt`, data: 'x' }],
      error: /IM_ARCHIVE_ROOT_INVALID/,
    },
    {
      name: 'commit',
      members: [{ name: `${root}/`, type: 'dir' }, packageMember],
      commit: 'b'.repeat(40),
      error: /IM_ARCHIVE_COMMIT_MISMATCH/,
    },
    {
      name: 'link',
      members: [{ name: `${root}/`, type: 'dir' }, packageMember, { name: `${root}/linked`, type: 'symlink' }],
      error: /IM_ARCHIVE_LINK_OR_DEVICE/,
    },
    {
      name: 'entries',
      members: [{ name: `${root}/`, type: 'dir' }, packageMember],
      args: ['--max-entries', '1'],
      error: /IM_ARCHIVE_ENTRY_LIMIT/,
    },
    {
      name: 'bytes',
      members: [{ name: `${root}/`, type: 'dir' }, packageMember, { name: `${root}/padding.bin`, data: 'x'.repeat(2048) }],
      args: ['--max-bytes', '1024'],
      error: /IM_ARCHIVE_SIZE_LIMIT/,
    },
    {
      name: 'missing package',
      members: [{ name: `${root}/`, type: 'dir' }, { name: `${root}/file.txt`, data: 'x' }],
      error: /IM_ARCHIVE_PACKAGE_MISSING/,
    },
    {
      name: 'invalid package',
      members: [{ name: `${root}/`, type: 'dir' }, { name: `${root}/package.json`, data: '{' }],
      error: /IM_ARCHIVE_PACKAGE_INVALID/,
    },
  ];
  for (const item of cases) {
    await assert.rejects(
      inspectMembers(t, item.members, { commit: item.commit ?? commit, args: item.args ?? [] }),
      error => item.error.test(error.stderr),
      item.name,
    );
  }
});

test('checked-in IM input lock pins the live runtime while remaining non-release', async () => {
  const lock = JSON.parse(await readFile(
    new URL('../../config/dsh-im-plugin-inputs.v1.json', import.meta.url),
    'utf8',
  ));
  validateImPluginInputs(lock);
  assert.equal(lock.release_ready, false);
  assert.deepEqual(lock.inputs.map(input => [input.package, input.version, input.commit]), [
    ['@xmanrui/dsh-im', '5.2.0', '0b9cbc24b60a9218820a10ed1f9c8fe913aa23c5'],
    ['dsh-plugin', '2.0.5', 'dfd56ec530b217f1ee7675f470b3a5ff780a2e85'],
  ]);
});
