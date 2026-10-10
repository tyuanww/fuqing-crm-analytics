import assert from 'node:assert/strict';
import { before,after,test } from 'node:test';
import { cp,mkdtemp,readFile,rm,stat,symlink,writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyPluginHost } from './plugin-host-evidence.mjs';
import { readState } from './state.mjs';
import { serviceDigest as hash } from './service-compatibility.mjs';
import { json,parse } from './test-fixtures/service-artifacts.mjs';
import { createRuntimeHostFixture,refreshInventory } from './test-fixtures/runtime-host.mjs';
import { RUNTIME_HOST_TEST_ROOT as T } from './runtime-host-evidence.mjs';
const exec=promisify(execFile);let baseline;
before(async()=>{baseline=await mkdtemp(join(tmpdir(),'runtime-host-verifier-'));await createRuntimeHostFixture(baseline);});
after(async()=>{if(baseline)await rm(baseline,{recursive:true,force:true});});
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'runtime-host-case-'));t.after(()=>rm(root,{recursive:true,force:true}));for(const p of ['candidate','state.json','evidence'])await cp(join(baseline,p),join(root,p),{recursive:true});return {root,candidatePath:join(root,'candidate/candidate.json'),evidencePath:join(root,'evidence/envelope.json'),statePath:join(root,'state.json')};}
async function change(input,path,fn){const p=join(input.root,'evidence',path),v=await parse(p);fn(v);await json(p,v);if(path.startsWith('results/'))await refreshInventory(input.root);}
async function reject(input,code){const before=await readFile(input.statePath),time=(await stat(input.statePath)).mtimeMs;await assert.rejects(verifyPluginHost(input),new RegExp(code));assert.deepEqual(await readFile(input.statePath),before);assert.equal((await stat(input.statePath)).mtimeMs,time);}
const cli=input=>[join(import.meta.dirname,'../dsh.mjs'),'plugin','verify-host','--candidate',input.candidatePath,'--evidence',input.evidencePath,'--state-path',input.statePath];
test('archived runtime Host observation is idempotent, append-only and never production-ready',async t=>{const input=await fixture(t),candidate=await readFile(input.candidatePath),prior=await readState(input.statePath);const result=await verifyPluginHost(input);assert.equal(result.status,'WSL_SYNTHETIC_RUNTIME_HOST_OBSERVED');assert.equal(result.journal_seq,prior.journal.length+1);assert.equal(result.release_ready,false);assert.equal(result.activation,'NOT_RUN');assert.equal(result.browser,'NOT_RUN');assert.equal(result.evidence_authenticity,'UNATTESTED_OPERATOR_OBSERVATION');const bytes=await readFile(input.statePath),mtime=(await stat(input.statePath)).mtimeMs;const retry=await exec(process.execPath,cli(input));assert.deepEqual(JSON.parse(retry.stdout),result);assert.deepEqual(await readFile(input.statePath),bytes);assert.equal((await stat(input.statePath)).mtimeMs,mtime);assert.deepEqual(await readFile(input.candidatePath),candidate);assert.deepEqual((await readState(input.statePath)).journal.slice(0,-1),prior.journal);});
for(const [name,path,mutate,code] of [
 ['receipt failed','host-r2/receipt.json',r=>{r.status='FAIL';},'NOT_PASS'],
 ['release claim','host-r2/receipt.json',r=>{r.release_ready=true;},'UNPROVEN'],
 ['browser claim','host-r2/receipt.json',r=>{r.browser='PASS';},'UNPROVEN'],
 ['non-WSL platform','host-r2/receipt.json',r=>{r.platform.kernel='Darwin';},'PLATFORM'],
 ['privileged process','host-r2/receipt.json',r=>{r.platform.uid=0;},'PLATFORM'],
 ['unsealed controller','host-r2/receipt.json',r=>{r.controller_seal_sha256='a'.repeat(64);},'CONTROLLER'],
 ['other runtime','host-r2/receipt.json',r=>{r.runtime_sha256='b'.repeat(64);},'RUNTIME'],
 ['other candidate',T+'/plugin-artifacts/packages.json',r=>{r.candidate_digest='c'.repeat(64);},'CANDIDATE'],
 ['other workbench',T+'/plugin-artifacts/packages.json',r=>{r.packages.workbench.tarball.sha256='d'.repeat(64);},'PLUGIN_PACK'],
 ['Node drift',T+'/plugin-artifacts/packages.json',r=>{r.runtime.platform.node='25.0.0';},'NODE'],
 ['wrong wheel',T+'/plugin-artifacts/packages.json',r=>{r.kernel.installed_wheels.duckdb.sha256='e'.repeat(64);},'WHEELS'],
 ['missing scenario',T+'/official-host/http-observations.json',r=>{r.observations.pop();},'SCENARIOS'],
 ['skipped auth',T+'/official-host/http-observations.json',r=>{r.observations[1].status='NOT_RUN';},'SCENARIOS'],
 ['forged HTTP artifacts',T+'/official-host/http-observations.json',r=>{r.artifacts.activation='PASS';},'HTTP_PACKAGES'],
 ['duplicate analysis',T+'/source-boundary.json',r=>{r.analysis_count=2;},'SOURCE_BOUNDARY'],
 ['cross-store database',T+'/source-boundary.json',r=>{r.save_run_store_argument='/unowned/query.sqlite';},'SOURCE_BOUNDARY'],
 ['unreaped process','cleanup-verified.json',r=>{r.pids.pop();},'CLEANUP_PIDS'],
 ['open port','cleanup-verified.json',r=>{r.ports_closed.pop();},'CLEANUP_PORTS'],
 ['listener changed','protected-after-r2.json',r=>{r.ports+='other';},'LISTENERS'],
 ['worker replayed',T+'/kernel-processes/processes.json',r=>{r[1].stopped.workers=r[0].stopped.workers;},'WORKER'],
 ['import escape',T+'/save-owner/service-processes/processes.json',r=>{r[0].imports.bad='/unowned/source.py';},'IMPORTS'],
 ['old service source contract',T+'/save-owner/service-processes/processes.json',r=>{r[0].source_contract='legacy-shared-store';},'PROCESS_SOURCE_CONTRACT'],
 ['storage escape',T+'/save-owner/service-processes/processes.json',r=>{r[0].sqlite_files.push('query.sqlite');},'STORAGE'],
 ['failed offline replay',T+'/save-owner/service-processes/processes.json',r=>{r[1].query_offline_replay='FAIL';},'REPLAY'],
])test('rejects '+name+' without modifying state',async t=>{const input=await fixture(t);await change(input,'results/'+path,mutate);await reject(input,code);});
test('rejects missing or mismatched durable parent',async t=>{const input=await fixture(t);await change(input,'envelope.json',r=>{r.service_target_event.digest='e'.repeat(64);});await reject(input,'PARENT');await assert.rejects(verifyPluginHost({...input,statePath:join(input.root,'absent.json')}),/NOT_PREPARED/);await assert.rejects(readFile(join(input.root,'absent.json')),/ENOENT/);});
test('rejects bytes changed under an inventory and an extra envelope field',async t=>{const input=await fixture(t);await writeFile(join(input.root,'evidence/results/host-r2/pytest.stdout'),'changed');await reject(input,'FILE_DIGEST');const other=await fixture(t);await change(other,'envelope.json',r=>{r.release_ready=true;});await reject(other,'ENVELOPE');});
test('rejects runtime tampering, symlinks and traversal',async t=>{const input=await fixture(t);await writeFile(join(input.root,'evidence/runtime.tar.zst'),'other');await reject(input,'ARCHIVE_SIZE');const other=await fixture(t);await change(other,'envelope.json',r=>{r.inputs.name='../state.json';});await reject(other,'PATH_INVALID');const link=await fixture(t),p=join(link.root,'evidence/results/host-r2/receipt.json');await rm(p);await symlink(link.candidatePath,p);await reject(link,'SYMLINK');});
test('CLI does not expose malicious receipt values',async t=>{const input=await fixture(t),secret='do-not-log-this-synthetic-private-value';await change(input,'results/host-r2/receipt.json',r=>{r.status=secret;});await assert.rejects(exec(process.execPath,cli(input)),e=>{assert.equal(e.code,2);assert.match(e.stderr,/PLUGIN_HOST_RUNTIME_NOT_PASS/);assert.ok(!e.stderr.includes(secret));return true;});});
test('rehashing a modified executable controller cannot change its pinned source',async t=>{const input=await fixture(t),path='repo/scripts/dsh-b0/pinned-host-observer.mjs',bytes=Buffer.from('export function apply() {}');await writeFile(join(input.root,'evidence/controller',path),bytes);const seal=await parse(join(input.root,'evidence/controller/input-seal.json'));seal.files[path]={bytes:bytes.length,sha256:hash(bytes)};await json(join(input.root,'evidence/controller/input-seal.json'),seal);await change(input,'envelope.json',r=>{r.controller.sha256=hash(JSON.stringify(seal,null,2)+'\n');});await reject(input,'CONTROLLER_SOURCE');});

test('coherent installed hashes cannot replace the archived plugin bytes',async t=>{
  const input=await fixture(t);
  await change(input,'results/'+T+'/plugin-artifacts/packages.json',p=>{p.packages.crm.installed_files['lib/index.js']='f'.repeat(64);});
  const packages=await parse(join(input.root,'evidence/results',T,'plugin-artifacts/packages.json'));
  await change(input,'results/'+T+'/official-host/http-observations.json',p=>{p.artifacts=packages;});
  await reject(input,'INSTALLED_FILES');
});

test('other receipt schema and missing proof files never append an event',async t=>{
  const input=await fixture(t);await change(input,'envelope.json',p=>{p.schema_version='dsh-runtime-host-evidence/v9';});
  await reject(input,'PLUGIN_HOST_PROFILE_SCOPE_MISMATCH');
  const other=await fixture(t);await rm(join(other.root,'evidence/results/host-r2/receipt.json'));
  await reject(other,'ENOENT');
});

test('runtime FIFO fails promptly and leaves the journal unchanged',async t=>{
  const input=await fixture(t),archive=join(input.root,'evidence/runtime.tar.zst'),prior=await readFile(input.statePath);
  await rm(archive);await exec('mkfifo',[archive]);
  await assert.rejects(exec(process.execPath,cli(input),{timeout:5000}),e=>{assert.equal(e.killed,false);assert.equal(e.code,2);assert.match(e.stderr,/ARCHIVE_SIZE/);return true;});
  assert.deepEqual(await readFile(input.statePath),prior);
});

for (const summary of ['1 passed, 1 failed', '1 passed, 1 error', '1 passed, 1 skipped']) {
  test(`rejects contradictory pytest summary: ${summary}`, async t => {
    const input = await fixture(t);
    await writeFile(join(input.root, 'evidence/results/host-r2/pytest.stdout'), summary + '\n');
    await refreshInventory(input.root);
    await reject(input, 'PLUGIN_HOST_RUNTIME_PYTEST');
  });
}
