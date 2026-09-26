import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { receiveArtifact } from './artifact.mjs';
import { issueToken, consumeToken, tokenExchangeResponse } from './auth-contract.mjs';
import { installRelease, activateRelease, rollbackRelease } from './promotion.mjs';
import { beginAction, finishAction, receipt } from './action-contract.mjs';
import { verifyReviewedCommit } from './trust.mjs';
import { writeEvidence } from './evidence.mjs';
import { evaluateSli } from './operator-gate.mjs';
import { pageGuard } from './page-policy.mjs';
import { scanText } from './secret-scan.mjs';

const fixture = () => mkdtemp(join(tmpdir(), 'dsh-release-'));
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
  data=entry.get('data','').encode(); info.size=len(data); t.addfile(info,io.BytesIO(data))`, path, format, JSON.stringify(entries)]); }
async function manifest(root, archive, tag='dsh-test', payloadData={'VERSION':'0.18.0.1\n'}) {
  const bytes=Buffer.from(await readFile(archive));
  const payload=Object.entries(payloadData).map(([path, value]) => { const data=Buffer.from(value); return {path,role:'runtime-source',bytes:data.length,sha256:sha(data)}; });
  const m={schema_version:'release-manifest/v1',release_tag:tag,product_version:'0.18.0.1',source_sha:'a'.repeat(40),dsh_upstream_sha:'4'.repeat(40),archive_allowlist:Object.keys(payloadData),denylist_version:'release-denylist/v1',artifact_bytes:bytes.length,artifact_sha256:sha(bytes),payload};
  const path=join(root,'manifest.json'); await writeFile(path,JSON.stringify(m)); return path;
}

test('receiver binds archive digest and extracted payload exactly', async () => { const root=await fixture(), archive=join(root,'a.tar.gz'); tar(archive); const m=await manifest(root,archive); const out=join(root,'out'); const got=await receiveArtifact({artifact:archive,manifestPath:m,destination:out}); assert.equal(got.entries,1); });
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
test('secret scan distinguishes explicit synthetic fixtures from real assignments', () => { const live = ['live', 'token-value-1234567890'].join('-'); assert.deepEqual(scanText("TOKEN = 'test-only-synthetic-token'", 'fixture'), []); assert.deepEqual(scanText(`TOKEN = '${live}'`, 'fixture'), ['SECRET_PATTERN fixture']); });
test('zstd receiver enforces the bounded stream path', async () => { const root=await fixture(), raw=join(root,'a.tar'), archive=join(root,'a.tar.zst'); execFileSync('python3',['-c',`import tarfile,sys,io
x=tarfile.TarInfo('VERSION'); b=bytes([48,46,49,56,46,48,46,49,10]); x.size=len(b); x.mode=0o600
with tarfile.open(sys.argv[1],'w:') as t: t.addfile(x,io.BytesIO(b))`,raw]); execFileSync('/Users/hutou/homebrew/bin/zstd',['-q',raw,'-o',archive]); const m=await manifest(root,archive); const got=await receiveArtifact({artifact:archive,manifestPath:m,destination:join(root,'out')}); assert.equal(got.entries,1); });
test('runtime manifest rejects a source-only bundle without its entrypoints', async () => { const root=await fixture(), archive=join(root,'a.tar.gz'); tar(archive); const m=await manifest(root,archive); const value=JSON.parse(await readFile(m,'utf8')); value.toolchain={node:'24'}; await writeFile(m,JSON.stringify(value)); await assert.rejects(()=>receiveArtifact({artifact:archive,manifestPath:m,destination:join(root,'out')}),/RUNTIME_ENTRYPOINT_MISSING/); });
test('trust never treats an arbitrary text file as a signature', async () => { const root=await fixture(), p=join(root,'p'), s=join(root,'s'); await writeFile(p,JSON.stringify({subject_sha:'a'.repeat(40)})); await writeFile(s,'synthetic-signature'); assert.equal((await verifyReviewedCommit({sourceSha:'a'.repeat(40),reviewedSha:'a'.repeat(40),provenancePath:p,signaturePath:s})).status,'NOT_AVAILABLE'); });
test('token is one-time, origin-bound, rate-limited and session-backed', async () => { const root=await fixture(), db=join(root,'tokens.json'), token=await issueToken(db,{now:1000}); await assert.rejects(()=>consumeToken(db,token,{now:1001}),/AUTH_ORIGIN_REJECTED/); assert.equal((await consumeToken(db,token,{origin:'https://app.tyuan.chat',allowedOrigins:['https://app.tyuan.chat'],now:1001})).authenticated,true); await assert.rejects(()=>consumeToken(db,token,{origin:'https://app.tyuan.chat',allowedOrigins:['https://app.tyuan.chat'],now:1002}),/AUTH_TOKEN_REPLAY/); const fresh=await issueToken(db,{now:2000}); const response=await tokenExchangeResponse(db,fresh,{method:'POST',origin:'https://app.tyuan.chat',allowedOrigins:['https://app.tyuan.chat'],now:2001}); assert.equal(response.status,303); assert.match(response.headers['set-cookie'][0],/HttpOnly/); });
test('side-by-side install, activation and duplicate protection retain source identity', async () => { const root=await fixture(), archive=join(root,'a.tar.gz'); tar(archive); const m=await manifest(root,archive); const releaseRoot=join(root,'releases-root'); const installed=await installRelease({artifact:archive,manifestPath:m,releaseRoot,tag:'dsh-test'}); assert.equal(installed.status,'PREPARED'); const active=await activateRelease({releaseRoot,tag:'dsh-test',sourceSha:'a'.repeat(40)}); assert.equal(active.status,'ACTIVE'); await assert.rejects(()=>installRelease({artifact:archive,manifestPath:m,releaseRoot,tag:'dsh-test'}),/RELEASE_EXISTS/); });

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

test('action receipts bind actor, idempotency and unavailable capabilities', async () => { const root=await fixture(), path=join(root,'actions.json'); const first=await beginAction(path,{type:'save',idempotencyKey:'stable-action',actor:'operator-a'}); const replay=await beginAction(path,{type:'save',idempotencyKey:'stable-action',actor:'operator-a'}); assert.equal(replay.action_id,first.action_id); assert.equal(first.status,'NOT_AVAILABLE'); assert.match(first.reason,/未接通/); await finishAction(path,first.action_id,{status:'NOT_AVAILABLE',detail:'not connected'}); assert.equal((await receipt(path,first.action_id)).status,'NOT_AVAILABLE'); const other=await beginAction(path,{type:'save',idempotencyKey:'stable-action',actor:'operator-b'}); assert.notEqual(other.action_id, first.action_id); });

test('page policy rejects cross-origin, unsupported methods and missing CSRF', () => { assert.equal(pageGuard({origin:'https://evil.example',method:'GET',authenticated:true}).status,403); assert.equal(pageGuard({origin:'https://app.tyuan.chat',method:'DELETE',authenticated:true}).status,405); assert.equal(pageGuard({origin:'https://app.tyuan.chat',method:'POST',authenticated:true}).status,403); assert.equal(pageGuard({origin:'https://app.tyuan.chat',method:'POST',authenticated:true,csrfValid:true}).status,200); });
