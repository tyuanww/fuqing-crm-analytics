import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, readlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { collectAllowlist, packArtifact, receiveArtifact } from './artifact.mjs';
import { issueToken, consumeToken, tokenExchangeResponse } from './auth-contract.mjs';
import { assertPublicationAssets, assertReleaseInputs, installRelease as installReleaseRaw, activateRelease as activateReleaseRaw, materializePluginPeerLinks, rollbackRelease as rollbackReleaseRaw } from './promotion.mjs';
import { beginAction, finishAction, receipt } from './action-contract.mjs';
import { verifyReviewedCommit } from './trust.mjs';
import { writeEvidence } from './evidence.mjs';
import { evaluateSli } from './operator-gate.mjs';
import { pageGuard } from './page-policy.mjs';
import { scanText } from './secret-scan.mjs';
import { releaseAssetNames, summarizePreflight, verifyPreflight, UPSTREAM_SHA } from './preflight-bundle.mjs';

const fixture = () => mkdtemp(join(tmpdir(), 'dsh-release-'));
const testStatePath = releaseRoot => join(dirname(releaseRoot), 'release-state.json');
const installRelease = options => installReleaseRaw({ ...options, statePath: options.statePath ?? testStatePath(options.releaseRoot) });
const activateRelease = options => activateReleaseRaw({ ...options, statePath: options.statePath ?? testStatePath(options.releaseRoot) });
const rollbackRelease = options => rollbackReleaseRaw({ ...options, statePath: options.statePath ?? testStatePath(options.releaseRoot) });
function sha(bytes) { return createHash('sha256').update(bytes).digest('hex'); }
function tar(path, name='VERSION', data='0.18.0.1\n') { execFileSync('python3', ['-c', `import tarfile,sys,io
x=tarfile.TarInfo(sys.argv[2]); b=sys.argv[3].encode(); x.size=len(b); x.mode=0o600
with tarfile.open(sys.argv[1],'w:gz') as t: t.addfile(x,io.BytesIO(b))`, path, name, data]); }
function archiveWithEntries(path, entries, format='w:gz') { execFileSync('python3', ['-c', `import io,json,sys,tarfile
entries=json.loads(sys.argv[3])
with tarfile.open(sys.argv[1],sys.argv[2]) as t:
 for entry in entries:
  info=tarfile.TarInfo(entry['name']); info.mode=entry.get('mode',0o600)
  if entry.get('type') == 'symlink': info.type=tarfile.SYMTYPE; info.linkname=entry.get('linkname','target'); t.addfile(info); continue
  if entry.get('type') == 'hardlink': info.type=tarfile.LNKTYPE; info.linkname=entry['linkname']; t.addfile(info); continue
  data=entry.get('data','').encode(); info.size=len(data); t.addfile(info,io.BytesIO(data))`, path, format, JSON.stringify(entries)]); }
async function manifest(root, archive, tag='dsh-test', payloadData={'VERSION':'0.18.0.1\n'}) {
  const bytes=Buffer.from(await readFile(archive));
  const payload=Object.entries(payloadData).map(([path, value]) => { const data=Buffer.from(value); return {path,role:'runtime-source',bytes:data.length,sha256:sha(data)}; });
  const m={schema_version:'release-manifest/v1',release_tag:tag,product_version:'0.18.0.1',source_sha:'a'.repeat(40),dsh_upstream_sha:'4'.repeat(40),archive_allowlist:Object.keys(payloadData),denylist_version:'release-denylist/v1',artifact_bytes:bytes.length,artifact_sha256:sha(bytes),payload};
  const path=join(root,'manifest.json'); await writeFile(path,JSON.stringify(m)); return path;
}

test('receiver binds archive digest and extracted payload exactly', async () => { const root=await fixture(), archive=join(root,'a.tar.gz'); tar(archive); const m=await manifest(root,archive); const out=join(root,'out'); const got=await receiveArtifact({artifact:archive,manifestPath:m,destination:out}); assert.equal(got.entries,1); });
test('artifact allowlist omits source maps from runtime payloads', async () => {
  const root = await fixture();
  await writeFile(join(root, 'VERSION'), '0.18.0.1\n');
  await writeFile(join(root, 'runtime.js'), 'export {};\n');
  await writeFile(join(root, 'runtime.js.map'), '{}\n');
  await mkdir(join(root, 'dsh-plugins/analytics-workbench/lib'), { recursive: true });
  await writeFile(join(root, 'dsh-plugins/analytics-workbench/lib/test-fixture.mjs'), 'test;\n');
  const allowlist = await collectAllowlist(root, { allowlist: ['VERSION', 'runtime.js', 'runtime.js.map', 'dsh-plugins/'] });
  assert.deepEqual(allowlist, ['VERSION', 'runtime.js']);
});
test('receiver fails closed on archive digest mismatch and traversal', async () => { const root=await fixture(), archive=join(root,'a.tar.gz'); tar(archive); const m=await manifest(root,archive); await writeFile(archive,Buffer.from('corrupt')); await assert.rejects(()=>receiveArtifact({artifact:archive,manifestPath:m,destination:join(root,'out')}), /ARTIFACT_DIGEST_MISMATCH/); });
test('receiver rejects non-canonical manifest paths before unpacking', async () => { const root=await fixture(), archive=join(root,'a.tar.gz'); tar(archive); const m=await manifest(root,archive); const value=JSON.parse(await readFile(m,'utf8')); value.archive_allowlist=['VERSION/.']; await writeFile(m,JSON.stringify(value)); await assert.rejects(()=>receiveArtifact({artifact:archive,manifestPath:m,destination:join(root,'out')}), /ALLOWLIST_PATH_INVALID/); });
test('receiver rejects traversal, duplicate and unsafe mode members', async () => {
  for (const [entries, expected] of [
    [[{name:'../escape',data:'x'}], /ARCHIVE_PATH_INVALID/],
    [[{name:'VERSION',data:'0.18.0.1\n'},{name:'VERSION',data:'0.18.0.1\n'}], /ARCHIVE_DUPLICATE_PATH/],
    [[{name:'VERSION',data:'0.18.0.1\n',mode:0o622}], /ARCHIVE_PERMISSION_TOO_WIDE/],
  ]) {
    const root=await fixture(), archive=join(root,'unsafe.tar.gz'); archiveWithEntries(archive,entries); const m=await manifest(root,archive); await assert.rejects(()=>receiveArtifact({artifact:archive,manifestPath:m,destination:join(root,'out')}), expected);
  }
});
test('receiver enforces expanded archive size and rejects links', async () => {
  const root=await fixture(), archive=join(root,'large.tar.gz'); archiveWithEntries(archive,[{name:'VERSION',data:'x'.repeat(2048)}]); const m=await manifest(root,archive); await assert.rejects(()=>receiveArtifact({artifact:archive,manifestPath:m,destination:join(root,'out'),maxBytes:512}), /ARCHIVE_SIZE_LIMIT/);
  const linkArchive=join(root,'link.tar.gz'); archiveWithEntries(linkArchive,[{name:'VERSION',data:'0.18.0.1\n'},{name:'link',type:'symlink',linkname:'VERSION'}]); const linkManifest=await manifest(root,linkArchive,'dsh-link',{'VERSION':'0.18.0.1\n','link':'0.18.0.1\n'}); await assert.rejects(()=>receiveArtifact({artifact:linkArchive,manifestPath:linkManifest,destination:join(root,'link-out')}), /ARCHIVE_LINK_OR_DEVICE/);
});
test('receiver scans final extracted content and deny names', async () => {
  const root=await fixture(), secretArchive=join(root,'secret.tar.gz'); const secretValue=['live','token-value-1234567890'].join('-'); const secret=`TOKEN = '${secretValue}'`; archiveWithEntries(secretArchive,[{name:'VERSION',data:'0.18.0.1\n'},{name:'config.txt',data:secret}]); const secretManifest=await manifest(root,secretArchive,'dsh-secret',{'VERSION':'0.18.0.1\n','config.txt':secret}); await assert.rejects(()=>receiveArtifact({artifact:secretArchive,manifestPath:secretManifest,destination:join(root,'secret-out')}), /SECRET_SCAN_FAILED/);
  const denyArchive=join(root,'deny.tar.gz'); archiveWithEntries(denyArchive,[{name:'VERSION',data:'0.18.0.1\n'},{name:'.env',data:'synthetic'}]); const denyManifest=await manifest(root,denyArchive,'dsh-deny',{'VERSION':'0.18.0.1\n','.env':'synthetic'}); await assert.rejects(()=>receiveArtifact({artifact:denyArchive,manifestPath:denyManifest,destination:join(root,'deny-out')}), /SECRET_SCAN_FAILED/);
});
test('secret scan distinguishes explicit synthetic fixtures from real assignments', () => {
  const live = ['live', 'token-value-1234567890'].join('-');
  const githubPat = ['ghp_', '123456789012345678901234567890'].join('');
  const accessKey = ['AKIA', '1234567890123456'].join('');
  const realSecret = ['MY_REAL_', 'SECRET_TOKEN'].join('');
  const privateHeader = ['-----BEGIN ', 'PRIVATE KEY-----'].join('');
  const privateFooter = ['-----END ', 'PRIVATE KEY-----'].join('');
  assert.deepEqual(scanText("TOKEN = 'test-only-synthetic-token'", 'fixture.test.mjs'), []);
  assert.deepEqual(scanText("TOKEN = 'test-only-synthetic-token'", 'config/runtime.env'), ['SECRET_PATTERN config/runtime.env']);
  assert.deepEqual(scanText(`TOKEN = '${live}'`, 'fixture.test.mjs'), ['SECRET_PATTERN fixture.test.mjs']);
  assert.deepEqual(scanText("token = 'x-cos-security-token'", 'sdk/base.js'), []);
  assert.deepEqual(scanText("TOKEN = '__DSH_CODE_ICON_INSTANCE__'", 'ui-primitives/lib/index.js'), []);
  assert.deepEqual(scanText("SECRET = 'AWS_SECRET_ACCESS_KEY'", 'credential-provider-env/index.js'), []);
  assert.deepEqual(scanText("TOKEN = 'AWS_CONTAINER_AUTHORIZATION_TOKEN'", 'sdk/base.js'), []);
  assert.deepEqual(scanText("TOKEN = 'x-aws-ec2-metadata-token'", 'credential-provider-imds/index.js'), []);
  assert.deepEqual(scanText("TOKEN = 'remove_authentication_token'", 'semantic-conventions/experimental_attributes.js'), []);
  assert.deepEqual(scanText("TOKEN = 'set_authentication_token'", 'semantic-conventions/experimental_attributes.js'), []);
  assert.deepEqual(scanText("refresh_token: 'impersonated-placeholder'", 'google-auth-library/impersonated.js'), []);
  assert.deepEqual(scanText(`API_KEY = '${realSecret}'`, 'config/runtime.env'), ['SECRET_PATTERN config/runtime.env']);
  assert.deepEqual(scanText(`API_KEY = '${realSecret}'`, 'node_modules/vendor.js'), ['SECRET_PATTERN node_modules/vendor.js']);
  assert.deepEqual(scanText(`TOKEN = '${githubPat}'`, 'node_modules/vendor.js', { scanAssignments: false }), ['SECRET_PATTERN node_modules/vendor.js']);
  assert.deepEqual(scanText('UAKIAU0EQCAEQQJ0ISIMA', 'generated.wasm.js'), []);
  assert.deepEqual(scanText(`const key = '${accessKey}'`, 'config/key.js'), ['SECRET_PATTERN config/key.js']);
  assert.deepEqual(scanText(`${privateHeader}`, 'sdk/import.js'), []);
  assert.deepEqual(scanText(`${privateHeader}\n${'A'.repeat(48)}\n${privateFooter}`, 'config/key.pem'), ['SECRET_PATTERN config/key.pem']);
});
test('zstd receiver enforces the bounded stream path', async () => { const root=await fixture(), raw=join(root,'a.tar'), archive=join(root,'a.tar.zst'); execFileSync('python3',['-c',`import tarfile,sys,io
x=tarfile.TarInfo('VERSION'); b=bytes([48,46,49,56,46,48,46,49,10]); x.size=len(b); x.mode=0o600
with tarfile.open(sys.argv[1],'w:') as t: t.addfile(x,io.BytesIO(b))`,raw]); execFileSync('zstd',['-q',raw,'-o',archive]); const m=await manifest(root,archive); const got=await receiveArtifact({artifact:archive,manifestPath:m,destination:join(root,'out')}); assert.equal(got.entries,1); });
test('runtime manifest rejects a source-only bundle without its entrypoints', async () => { const root=await fixture(), archive=join(root,'a.tar.gz'); tar(archive); const m=await manifest(root,archive); const value=JSON.parse(await readFile(m,'utf8')); value.toolchain={node:'24'}; await writeFile(m,JSON.stringify(value)); await assert.rejects(()=>receiveArtifact({artifact:archive,manifestPath:m,destination:join(root,'out')}),/RUNTIME_ENTRYPOINT_MISSING/); });
test('trust never treats an arbitrary text file as a signature', async () => { const root=await fixture(), p=join(root,'p'), s=join(root,'s'); await writeFile(p,JSON.stringify({subject_sha:'a'.repeat(40)})); await writeFile(s,'synthetic-signature'); assert.equal((await verifyReviewedCommit({sourceSha:'a'.repeat(40),reviewedSha:'a'.repeat(40),provenancePath:p,signaturePath:s})).status,'NOT_AVAILABLE'); });
test('promotion binds publication asset digests to local files', () => {
  const digest = 'a'.repeat(64); const publication = { assets: [{ name: 'candidate.tar.zst', sha256: digest }] };
  assert.equal(assertPublicationAssets(publication, [['candidate.tar.zst', digest]]), true);
  assert.throws(() => assertPublicationAssets(publication, [['candidate.tar.zst', 'b'.repeat(64)]]), /TRUST_ASSET_DIGEST_MISMATCH/);
  assert.throws(() => assertPublicationAssets(publication, [['release-manifest.v1.json', digest]]), /TRUST_ASSET_MISSING/);
});
test('promotion binds checksum entries and evidence index to the release tag', async () => {
  const root=await fixture(), archive=join(root,'a.tar.gz'); tar(archive); const m=await manifest(root,archive); const sums=join(root,'SHA256SUMS'); const evidence=join(root,'ci-evidence.json');
  const manifestDigest=sha(await readFile(m)); const artifactDigest=sha(await readFile(archive));
  await writeFile(sums, `${artifactDigest}  ${basename(archive)}\n${manifestDigest}  ${basename(m)}\n`);
  await writeFile(evidence, JSON.stringify({ schema_version:'ci-evidence-index/v1', release_tag:'dsh-test', entries:[{name:'fixture',status:'PARTIAL',ref:'synthetic://fixture'}] }));
  const releaseManifest=JSON.parse(await readFile(m));
  assert.equal(await assertReleaseInputs({artifact:archive,manifestPath:m,sumsPath:sums,evidenceIndexPath:evidence,tag:'dsh-test',manifest:releaseManifest}),true);
  await writeFile(sums, `${'b'.repeat(64)}  ${basename(archive)}\n${manifestDigest}  ${basename(m)}\n`);
  await assert.rejects(()=>assertReleaseInputs({artifact:archive,manifestPath:m,sumsPath:sums,evidenceIndexPath:evidence,tag:'dsh-test',manifest:releaseManifest}),/RELEASE_CHECKSUM_BINDING_MISMATCH/);
});
test('token is one-time, origin-bound, rate-limited and session-backed', async () => { const root=await fixture(), db=join(root,'tokens.json'), token=await issueToken(db,{now:1000}); await assert.rejects(()=>consumeToken(db,token,{now:1001}),/AUTH_ORIGIN_REJECTED/); assert.equal((await consumeToken(db,token,{origin:'https://app.tyuan.chat',allowedOrigins:['https://app.tyuan.chat'],now:1001})).authenticated,true); await assert.rejects(()=>consumeToken(db,token,{origin:'https://app.tyuan.chat',allowedOrigins:['https://app.tyuan.chat'],now:1002}),/AUTH_TOKEN_REPLAY/); const fresh=await issueToken(db,{now:2000}); const response=await tokenExchangeResponse(db,fresh,{method:'POST',origin:'https://app.tyuan.chat',allowedOrigins:['https://app.tyuan.chat'],now:2001}); assert.equal(response.status,303); assert.match(response.headers['set-cookie'][0],/HttpOnly/); });
test('side-by-side install, activation and duplicate protection retain source identity', async () => { const root=await fixture(), archive=join(root,'a.tar.gz'); tar(archive); const m=await manifest(root,archive); const releaseRoot=join(root,'releases-root'); const installed=await installRelease({artifact:archive,manifestPath:m,releaseRoot,tag:'dsh-test',offline:true}); assert.equal(installed.status,'PREPARED'); const active=await activateRelease({releaseRoot,tag:'dsh-test',sourceSha:'a'.repeat(40)}); assert.equal(active.status,'ACTIVE'); await assert.rejects(()=>installRelease({artifact:archive,manifestPath:m,releaseRoot,tag:'dsh-test',offline:true}),/RELEASE_EXISTS/); });
test('prepared releases materialize peer-only plugin links into the pinned runtime', async () => {
  const root = await fixture();
  const plugin = join(root, 'dsh-plugins/analytics-workbench');
  const peers = join(root, 'upstream/node_modules/.pnpm/node_modules/@deepseek-ai');
  await mkdir(plugin, { recursive: true });
  await mkdir(peers, { recursive: true });
  await writeFile(join(plugin, 'package.json'), JSON.stringify({ peerDependencies: { '@deepseek-ai/dsh-tools': '0.1.7-rc.2' } }));
  const result = await materializePluginPeerLinks(root);
  assert.equal(result.count, 1);
  const link = join(plugin, 'node_modules/@deepseek-ai');
  assert.equal(await readlink(link), '../../../upstream/node_modules/.pnpm/node_modules/@deepseek-ai');
  assert.equal(resolve(dirname(link), await readlink(link)), resolve(peers));
  assert.deepEqual(await materializePluginPeerLinks(root), result);
});
test('prepared releases refuse peer plugins when the runtime closure is missing', async () => {
  const root = await fixture();
  const plugin = join(root, 'dsh-plugins/analytics-workbench');
  await mkdir(plugin, { recursive: true });
  await writeFile(join(plugin, 'package.json'), JSON.stringify({ peerDependencies: { '@deepseek-ai/dsh-tools': '0.1.7-rc.2' } }));
  await assert.rejects(() => materializePluginPeerLinks(root), /RELEASE_RUNTIME_PEER_ROOT_MISSING/);
});
test('promotion receives and records the pinned upstream runtime bundle', async () => {
  const root = await fixture();
  const archive = join(root, 'source.tar.gz');
  tar(archive);
  const manifestPath = await manifest(root, archive);
  const runtimeTar = join(root, 'runtime.tar');
  const runtimeArchive = join(root, 'runtime.tar.zst');
  archiveWithEntries(runtimeTar, [
    { name: 'lib/bin.js', data: 'runtime-entry\n' },
    { name: 'node_modules/@deepseek-ai/dsh-base/lib/index.js', data: 'base\n' },
    { name: 'node_modules/@deepseek-ai/dsh-web-app/lib/index.js', data: 'web\n' },
    { name: 'node_modules/.pnpm/marker', data: 'closure\n' },
    { name: 'node_modules/dsh-entry', type: 'symlink', linkname: '../lib/bin.js' },
    { name: 'lib/alias.js', type: 'hardlink', linkname: 'lib/bin.js' },
  ], 'w:');
  execFileSync('zstd', ['-q', runtimeTar, '-o', runtimeArchive]);
  const runtimeBytes = (await import('node:fs/promises')).stat(runtimeArchive);
  const runtimeInfo = await runtimeBytes;
  const value = JSON.parse(await readFile(manifestPath, 'utf8'));
  value.upstream_runtime = { name: 'runtime.tar.zst', role: 'upstream-runtime-bundle', upstream_sha: value.dsh_upstream_sha, bytes: runtimeInfo.size, sha256: sha(await readFile(runtimeArchive)) };
  await writeFile(manifestPath, JSON.stringify(value));
  const releaseRoot = join(root, 'release-root');
  const installed = await installRelease({ artifact: archive, upstreamRuntimeArtifact: runtimeArchive, manifestPath, releaseRoot, tag: 'dsh-test', offline: true });
  assert.equal(installed.status, 'PREPARED');
  assert.equal(await readFile(join(installed.path, 'upstream/lib/bin.js'), 'utf8'), 'runtime-entry\n');
  assert.equal(await readFile(join(installed.path, 'upstream/node_modules/dsh-entry'), 'utf8'), 'runtime-entry\n');
  assert.equal(await readFile(join(installed.path, 'upstream/lib/alias.js'), 'utf8'), 'runtime-entry\n');
  const marker = JSON.parse(await readFile(join(installed.path, 'release-marker.json'), 'utf8'));
  assert.equal(marker.upstream_runtime.sha256, value.upstream_runtime.sha256);
  await assert.rejects(() => installRelease({ artifact: archive, manifestPath, releaseRoot: join(root, 'missing-runtime-root'), tag: 'dsh-test', offline: true }), /RELEASE_UPSTREAM_RUNTIME_REQUIRED/);
});
test('install rejects the unverified default path', async () => { const root=await fixture(), archive=join(root,'a.tar.gz'); tar(archive); const m=await manifest(root,archive); await assert.rejects(() => installRelease({artifact:archive,manifestPath:m,releaseRoot:join(root,'release-root'),tag:'dsh-test'}), /RELEASE_TRUST_INPUTS_REQUIRED/); });
test('release evidence workflow accepts a candidate descendant of main', async () => { const workflow = await readFile(join(process.cwd(), '.github/workflows/dsh-release-evidence.yml'), 'utf8'); assert.match(workflow, /git merge-base --is-ancestor origin\/main "\$REVIEWED_SHA"/); });
test('release preflight workflow permits the pinned runtime dependency fetch', async () => { const workflow = await readFile(join(process.cwd(), '.github/workflows/dsh-release-preflight.yml'), 'utf8'); const source = await readFile(join(process.cwd(), 'scripts/release/preflight.mjs'), 'utf8'); assert.match(source, /runtime-bundle\.mjs[\s\S]*--online/); assert.match(workflow, /scripts\/dsh\.mjs preflight/); });
test('preflight bundle summary binds every release asset to the manifest', async () => {
  const root = await fixture();
  const tag = 'dsh-test-preflight';
  const sourceSha = 'a'.repeat(40);
  const manifest = { schema_version: 'release-manifest/v1', release_tag: tag, product_version: '0.18.0.1', source_sha: sourceSha,
    dsh_upstream_sha: UPSTREAM_SHA, pre_manifest_sha256: '0'.repeat(64), archive_allowlist: ['VERSION'], denylist_version: 'release-denylist/v1',
    artifact_bytes: 1, artifact_sha256: '1'.repeat(64), upstream_runtime: { name: `shinemage-dsh-upstream-runtime-${UPSTREAM_SHA}.tar.zst`, role: 'upstream-runtime-bundle', upstream_sha: UPSTREAM_SHA, bytes: 1, sha256: '2'.repeat(64) }, payload: [] };
  for (const name of releaseAssetNames(tag)) await writeFile(join(root, name), name === 'release-manifest.v1.json' ? JSON.stringify(manifest) : 'x');
  const summary = await summarizePreflight(root, { tag, sourceSha });
  await writeFile(join(root, 'release-preflight.json'), JSON.stringify(summary));
  await assert.rejects(() => verifyPreflight(root, { tag, sourceSha }));
});
test('release evidence workflow hydrates and verifies the exact brand asset', async () => {
  const workflow = await readFile(join(process.cwd(), '.github/workflows/dsh-release-evidence.yml'), 'utf8');
  assert.match(workflow, /lfs:\s*false/);
  assert.match(workflow, /objects\/batch/);
  assert.match(workflow, /Authorization: Basic/);
  assert.match(workflow, /sha256sum/);
  assert.match(workflow, /brand-assets\.mjs/);
  assert.match(workflow, /preflight_run_id/);
  assert.match(workflow, /dsh-release-preflight\.yml/);
  assert.match(workflow, /Reuse the exact preflight runtime bundle/);
  assert.match(workflow, /release-preflight\.json/);
  assert.doesNotMatch(workflow, /pipeline\.mjs --prepare/);
  assert.doesNotMatch(workflow, /Build every production plugin bundle/);
});
test('release preflight builds the runtime before protected tag creation', async () => {
  const workflow = await readFile(join(process.cwd(), '.github/workflows/dsh-release-preflight.yml'), 'utf8');
  const source = await readFile(join(process.cwd(), 'scripts/release/preflight.mjs'), 'utf8');
  assert.match(workflow, /reviewed_sha/);
  assert.match(workflow, /corepack install --global pnpm@11\.7\.0/);
  assert.match(workflow, /scripts\/dsh\.mjs preflight/);
  assert.match(workflow, /dsh-rc2-preflight-/);
  assert.match(source, /runtime-bundle\.mjs/);
  assert.match(source, /--online/);
  assert.match(source, /scripts\/dsh\.mjs', 'test'/);
  assert.match(source, /requireUpstream: checkOnly/);
});
test('release preflight does not leak the read-only upstream override into prepare', async () => {
  const source = await readFile(join(process.cwd(), 'scripts/release/preflight.mjs'), 'utf8');
  const pipeline = await readFile(join(process.cwd(), 'scripts/dsh-b0/pipeline.mjs'), 'utf8');
  assert.match(source, /env\.B0_BUILD_UPSTREAM === null\) delete childEnv\.B0_BUILD_UPSTREAM/);
  assert.match(source, /stage\('prepare'[\s\S]*B0_BUILD_UPSTREAM: null[\s\S]*DSH_UPSTREAM_CHECKOUT: upstream/);
  assert.match(pipeline, /DSH_UPSTREAM_CHECKOUT \?\? process\.env\.B0_BUILD_UPSTREAM/);
});
test('release publish workflow binds the exact evidence run and protected tag', async () => {
  const workflow = await readFile(join(process.cwd(), '.github/workflows/dsh-release-publish.yml'), 'utf8');
  assert.match(workflow, /actions\/runs\/\$EVIDENCE_RUN_ID/);
  assert.match(workflow, /dsh-release-evidence\.yml/);
  assert.match(workflow, /rulesets\?per_page=100/);
  assert.match(workflow, /dsh-release-tags-immutable/);
  assert.doesNotMatch(workflow, /tags\/protection/);
  assert.match(workflow, /annotated-tag\.json/);
  assert.match(workflow, /TAG_TARGET_CHANGED_AFTER_PUBLISH/);
  assert.match(workflow, /TAG_TARGET_CHANGED_FINAL/);
  assert.match(workflow, /gh attestation verify/);
});
test('release publish workflow is idempotent and emits a verified publication sidecar', async () => {
  const workflow = await readFile(join(process.cwd(), '.github/workflows/dsh-release-publish.yml'), 'utf8');
  assert.match(workflow, /ASSET_REUSED/);
  assert.match(workflow, /ASSET_CONFLICT/);
  assert.match(workflow, /release-publication\.v1\.json/);
  assert.match(workflow, /PUBLISHED_VERIFIED/);
  assert.ok(workflow.indexOf('Publish the verified six-asset release') < workflow.indexOf('Finalize the verified publication sidecar after publishing'));
  const finalize = workflow.slice(workflow.indexOf('Finalize the verified publication sidecar after publishing'));
  assert.doesNotMatch(finalize, /gh release upload/);
});
test('runtime bundle enforces production pruning, secret scan and peer collision checks', async () => {
  const source = await readFile(join(process.cwd(), 'scripts/release/runtime-bundle.mjs'), 'utf8');
  assert.match(source, /pruneDevelopmentFiles/);
  assert.match(source, /scanRuntimeTree/);
  assert.match(source, /RUNTIME_SECRET_SCAN_FAILED/);
  assert.match(source, /RUNTIME_LINK_BROKEN/);
  assert.match(source, /MAX_TEXT_SCAN_BYTES/);
  assert.match(source, /RUNTIME_PEER_ALIAS_COLLISION/);
  assert.match(source, /\['cordis', 'cosmokit'\]/);
  assert.doesNotMatch(source, /scanAssignments:\s*!\/\(\^\|\\\/\)node_modules/);
});
test('runtime artifact allowlist carries the release evidence workflow', async () => {
  const allowlist = await collectAllowlist(process.cwd());
  assert.ok(allowlist.includes('.github/workflows/dsh-release-evidence.yml'));
});
test('packed runtime artifact contains the release evidence workflow', async () => {
  const root = await fixture();
  const workflow = join(root, '.github/workflows/dsh-release-evidence.yml');
  await mkdir(join(root, '.github/workflows'), { recursive: true });
  await writeFile(join(root, 'VERSION'), '0.18.0.2\n');
  await writeFile(workflow, 'name: evidence\n');
  await writeFile(join(root, '.github/workflows/other.yml'), 'name: other\n');
  const allowlist = await collectAllowlist(root);
  const archive = join(root, 'runtime.tar.zst');
  await packArtifact({ rootDir: root, allowlist, output: archive });
  const names = execFileSync('python3', ['-c', `import io,subprocess,sys,tarfile
raw=subprocess.run(['zstd','-q','-d','-c',sys.argv[1]],check=True,capture_output=True).stdout
print('\\n'.join(member.name for member in tarfile.open(fileobj=io.BytesIO(raw),mode='r:')))
`, archive], { encoding: 'utf8' }).trim().split('\n');
  assert.ok(names.includes('.github/workflows/dsh-release-evidence.yml'));
  assert.ok(!names.includes('.github/workflows/other.yml'));
});

test('promotion binds service owner and cannot activate for another owner', async () => {
  const root=await fixture(), archive=join(root,'a.tar.gz'); tar(archive); const m=await manifest(root,archive); const releaseRoot=join(root,'release-root');
  await installRelease({artifact:archive,manifestPath:m,releaseRoot,tag:'dsh-test',owner:'service-a',restartDependency:'service-a.service',offline:true});
  await assert.rejects(()=>activateRelease({releaseRoot,tag:'dsh-test',sourceSha:'a'.repeat(40),expectedOwner:'service-b'}),/RELEASE_OWNER_MISMATCH/);
  await assert.rejects(()=>activateRelease({releaseRoot,tag:'dsh-test',sourceSha:'a'.repeat(40),expectedOwner:'service-a',expectedRestartDependency:'service-b.service'}),/RELEASE_RESTART_DEPENDENCY_MISMATCH/);
  const activated=await activateRelease({releaseRoot,tag:'dsh-test',sourceSha:'a'.repeat(40),expectedOwner:'service-a',expectedRestartDependency:'service-a.service'});
  assert.equal(activated.status,'ACTIVE');
});

test('promotion mutations require one durable state path', async () => {
  const root = await fixture();
  const archive = join(root, 'state-required.tar.gz');
  tar(archive);
  const manifestPath = await manifest(root, archive);
  const releaseRoot = join(root, 'state-required-root');
  await assert.rejects(() => installReleaseRaw({ artifact: archive, manifestPath, releaseRoot, tag: 'dsh-test', offline: true }), /RELEASE_STATE_PATH_REQUIRED/);
  await assert.rejects(() => activateReleaseRaw({ releaseRoot, tag: 'dsh-test', sourceSha: 'a'.repeat(40) }), /RELEASE_STATE_PATH_REQUIRED/);
  await assert.rejects(() => rollbackReleaseRaw({ releaseRoot }), /RELEASE_STATE_PATH_REQUIRED/);
});

test('promotion records the previous target and rollback restores it atomically', async () => {
  const root=await fixture(), archive=join(root,'a.tar.gz'); tar(archive); const releaseRoot=join(root,'release-root');
  const oldManifest=await manifest(root,archive,'dsh-old');
  const oldManifestCopy=join(root,'old-manifest.json'); await writeFile(oldManifestCopy,await readFile(oldManifest));
  const newManifest=await manifest(root,archive,'dsh-new');
  await installRelease({artifact:archive,manifestPath:oldManifestCopy,releaseRoot,tag:'dsh-old',offline:true});
  const oldActive=await activateRelease({releaseRoot,tag:'dsh-old',sourceSha:'a'.repeat(40)});
  await installRelease({artifact:archive,manifestPath:newManifest,releaseRoot,tag:'dsh-new',offline:true});
  const newActive=await activateRelease({releaseRoot,tag:'dsh-new',sourceSha:'a'.repeat(40)});
  assert.equal(newActive.previous,oldActive.current);
  await assert.rejects(()=>rollbackRelease({releaseRoot,expectedOwner:'other-service',expectedRestartDependency:'shinemage-dsh.service'}),/RELEASE_OWNER_MISMATCH/);
  const rolledBack=await rollbackRelease({releaseRoot,expectedOwner:'shinemage-dsh',expectedRestartDependency:'shinemage-dsh.service'});
  assert.equal(rolledBack.status,'ROLLED_BACK');
  assert.equal(rolledBack.target,oldActive.current);
});

test('evidence creation is immutable and replay-safe', async () => {
  const root = await fixture(); const path = join(root, 'evidence.json');
  const first = await writeEvidence(path, { release_tag: 'dsh-test', authorization: 'secret-value' });
  const replay = await writeEvidence(path, { release_tag: 'dsh-test', authorization: 'secret-value' });
  assert.equal(first.replay, false); assert.equal(replay.replay, true);
  await assert.rejects(() => writeEvidence(path, { release_tag: 'dsh-other' }), /EVIDENCE_IMMUTABLE/);
  assert.doesNotMatch(await readFile(path, 'utf8'), /secret-value/);
});

test('SLI evidence requires a real 15-minute observation window', () => {
  const short = Array.from({ length: 10 }, (_, index) => ({ observed_at: index * 100, latency_ms: 20 }));
  assert.equal(evaluateSli(short).status, 'NOT_RUN');
  const full = Array.from({ length: 10 }, (_, index) => ({ observed_at: index === 9 ? 900_000 : index * 100, latency_ms: 20 }));
  assert.equal(evaluateSli(full).status, 'PASS');
  assert.equal(evaluateSli(full.map(({ latency_ms: _latency, ...sample }) => sample)).status, 'NOT_RUN');
});

test('action idempotency key cannot switch capability type', async () => {
  const root = await fixture(); const path = join(root, 'actions.json');
  await beginAction(path, { type: 'save', idempotencyKey: 'shared-action', actor: 'operator-a' });
  await assert.rejects(() => beginAction(path, { type: 'cancel', idempotencyKey: 'shared-action', actor: 'operator-a' }), /ACTION_IDEMPOTENCY_CONFLICT/);
});

test('action receipts bind actor, idempotency and unavailable capabilities', async () => { const root=await fixture(), path=join(root,'actions.json'); const first=await beginAction(path,{type:'save',idempotencyKey:'stable-action',actor:'operator-a'}); const replay=await beginAction(path,{type:'save',idempotencyKey:'stable-action',actor:'operator-a'}); assert.equal(replay.action_id,first.action_id); assert.equal(first.status,'NOT_AVAILABLE'); assert.match(first.reason,/未接通/); const finished=await finishAction(path,first.action_id,{status:'NOT_AVAILABLE',detail:'not connected'}); assert.equal(finished.receipt.schema_version,'action-receipt/v1'); assert.equal(finished.receipt.actor,'operator-a'); assert.equal(finished.receipt.idempotency_key,'stable-action'); assert.equal(finished.receipt.type,'save'); assert.equal((await receipt(path,first.action_id)).status,'NOT_AVAILABLE'); const other=await beginAction(path,{type:'save',idempotencyKey:'stable-action',actor:'operator-b'}); assert.notEqual(other.action_id, first.action_id); });

test('mutable action keeps one terminal receipt and refuses conflicting completion', async () => {
  const root=await fixture(), path=join(root,'actions.json');
  const action=await beginAction(path,{type:'cancel',idempotencyKey:'cancel-once',actor:'operator-a'});
  assert.equal(action.status,'PENDING');
  const done=await finishAction(path,action.action_id,{status:'CANCELED',detail:'synthetic cancel'});
  assert.equal(done.receipt.status,'CANCELED');
  const replay=await finishAction(path,action.action_id,{status:'CANCELED',detail:'synthetic replay'});
  assert.deepEqual(replay.receipt,done.receipt);
  await assert.rejects(()=>finishAction(path,action.action_id,{status:'SUCCEEDED'}),/ACTION_TERMINAL_CONFLICT/);
  assert.equal((await receipt(path,'unknown-action')).status,'UNKNOWN');
});

test('page policy rejects cross-origin, unsupported methods and absent CSRF', () => { assert.equal(pageGuard({origin:'https://evil.example',method:'GET',authenticated:true}).status,403); assert.equal(pageGuard({origin:'https://app.tyuan.chat',method:'DELETE',authenticated:true}).status,405); assert.equal(pageGuard({origin:'https://app.tyuan.chat',method:'POST',authenticated:true}).status,403); assert.equal(pageGuard({origin:'https://app.tyuan.chat',method:'POST',authenticated:true,csrfValid:true}).status,200); });
