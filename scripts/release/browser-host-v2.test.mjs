import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { cp, mkdtemp, readFile, rm, stat, writeFile, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { verifyPluginHost } from './plugin-host-evidence.mjs';
import { readState } from './state.mjs';
import { serviceDigest as hash } from './service-compatibility.mjs';
import { parse, json } from './test-fixtures/service-artifacts.mjs';
import { createBrowserV2Fixture, refreshBrowserV2, V2_TEST_ROOT as T } from './test-fixtures/browser-host-v2.mjs';
const exec=promisify(execFile);let baseline;
before(async()=>{baseline=await mkdtemp(join(tmpdir(),'browser-v2-baseline-'));await createBrowserV2Fixture(baseline);});
after(async()=>{if(baseline)await rm(baseline,{recursive:true,force:true});});
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'browser-v2-case-'));t.after(()=>rm(root,{recursive:true,force:true}));
  for(const name of ['candidate','state.json','browser-v2'])await cp(join(baseline,name),join(root,name),{recursive:true});
  return {root,candidatePath:join(root,'candidate/candidate.json'),evidencePath:join(root,'browser-v2/envelope.json'),statePath:join(root,'state.json')};
}
async function change(input,name,fn) {
  const path=join(input.root,'browser-v2',name),value=await parse(path);fn(value);await json(path,value);
  if(name.startsWith('results/'))await refreshBrowserV2(input.root);
}
async function reject(input,code) {
  const bytes=await readFile(input.statePath),mtime=(await stat(input.statePath)).mtimeMs,pack=await readFile(input.candidatePath);
  await assert.rejects(verifyPluginHost(input),new RegExp(code));
  assert.deepEqual(await readFile(input.statePath),bytes);assert.equal((await stat(input.statePath)).mtimeMs,mtime);assert.deepEqual(await readFile(input.candidatePath),pack);
}
const cli=input=>[join(import.meta.dirname,'../dsh.mjs'),'plugin','verify-host','--candidate',input.candidatePath,'--evidence',input.evidencePath,'--state-path',input.statePath];
test('v2 appends browser observation after terminal parent with independent sources and idempotent CLI retry',async t=>{
  const input=await fixture(t),before=await readState(input.statePath),candidate=await parse(input.candidatePath);
  assert.notEqual(candidate.source_sha,candidate.service_compatibility.binding.source_sha);
  const result=await verifyPluginHost(input);assert.equal(result.status,'WSL_SYNTHETIC_BROWSER_HOST_OBSERVED');assert.equal(result.scenario_count,5);assert.equal(result.release_ready,false);
  const state=await readState(input.statePath);assert.deepEqual(state.journal.slice(0,-1),before.journal);
  assert.deepEqual(state.journal.at(-1).terminal_host_event,{seq:before.journal.at(-1).seq,digest:before.journal.at(-1).digest});
  assert.equal(state.journal.at(-1).runtime_host_event,undefined);
  const bytes=await readFile(input.statePath),mtime=(await stat(input.statePath)).mtimeMs;assert.deepEqual(JSON.parse((await exec(process.execPath,cli(input))).stdout),result);
  assert.deepEqual(await readFile(input.statePath),bytes);assert.equal((await stat(input.statePath)).mtimeMs,mtime);
});
for(const [name,path,mutate,code] of [
 ['failed receipt','browser-result/receipt.json',r=>{r.status='FAIL';},'NOT_PASS'],
 ['release escalation','browser-result/receipt.json',r=>{r.release_ready=true;},'UNPROVEN'],
 ['wrong plugin SHA','browser-result/receipt.json',r=>{r.plugin_source=r.service_source;},'PLUGIN_SOURCE'],
 ['wrong service SHA','browser-result/receipt.json',r=>{r.service_source=r.plugin_source;},'SERVICE_SOURCE'],
 ['wrong candidate','browser-result/receipt.json',r=>{r.candidate_digest='b'.repeat(64);},'CANDIDATE'],
 ['extra receipt field','browser-result/receipt.json',r=>{r.signature='trusted';},'RECEIPT'],
 ['old raw receipt schema','browser-result/receipt.json',r=>{r.schema_version='dsh-first-purchase-browser-observation/v1';},'RECEIPT'],
 ['root user','browser-result/receipt.json',r=>{r.platform.uid=0;},'PLATFORM'],
 ['other runtime','browser-result/receipt.json',r=>{r.runtime_sha256='f'.repeat(64);},'RUNTIME'],
 ['missing scenario',T+'/official-host/browser-observations.json',r=>{r.rows.pop();},'SCENARIOS'],
 ['page error',T+'/official-host/browser-observations.json',r=>{r.errors=['synthetic error'];},'SCENARIOS'],
 ['extra HTTP field',T+'/official-host/http-observations.json',r=>{r.production=true;},'HTTP'],
 ['auth bypass',T+'/official-host/http-observations.json',r=>{r.observations[1].status='SKIP';},'AUTH_SCENARIOS'],
 ['cross-source process',T+'/kernel-processes/processes.json',r=>{r[0].source_sha='3ffbd2a2e5a6c3179aecec09c63522ff1bb2d268';},'PROCESS_SOURCE'],
 ['second analysis',T+'/source-boundary.json',r=>{r.analysis_count=2;},'SOURCE_BOUNDARY'],
 ['shared run store',T+'/source-boundary.json',r=>{r.save_run_store_argument='/srv/real-store';},'SOURCE_BOUNDARY'],
 ['process still alive','cleanup-check.json',r=>{r.owned_processes_alive=[42];},'CLEANUP'],
 ['production pointer changed','cleanup-check.json',r=>{r.current_unchanged=false;},'CLEANUP'],
 ['input changed','cleanup-check.json',r=>{r.sealed_files_unchanged--;},'CLEANUP'],
 ['library system install','browser-library-receipt.json',r=>{r.system_install='PASS';},'BROWSER_LIBRARIES'],
 ['library substitution','browser-library-receipt.json',r=>{r.packages[0].sha256='a'.repeat(64);},'BROWSER_LIBRARIES'],
 ['wrong controller python','browser-result/controller-install.stdout',r=>{r.python='/srv/production/python';},'INSTALL'],
 ['wrong controller wheel','browser-result/controller-install.stdout',r=>{Object.values(r.wheels)[0].sha256='e'.repeat(64);},'WHEEL'],
 ['wrong installed packages',T+'/plugin-artifacts/packages.json',r=>{r.packages.workbench.source_sha='b'.repeat(40);},'PACKAGES'],
])test('v2 rejects '+name+' even after rebuilding the evidence inventory/archive',async t=>{
 const input=await fixture(t);await change(input,'results/'+path,mutate);await reject(input,code);
});
test('v2 rejects a service event, unrelated digest and the legacy parent key',async t=>{
 for(const [wrongSeq,digest] of [[true,null],[false,'f'.repeat(64)]]) {
  const input=await fixture(t);await change(input,'envelope.json',r=>{if(wrongSeq)r.terminal_host_event.seq=1;if(digest)r.terminal_host_event.digest=digest;});await reject(input,'PARENT');
 }
 const input=await fixture(t);await change(input,'envelope.json',r=>{r.runtime_host_event=r.terminal_host_event;delete r.terminal_host_event;});await reject(input,'ENVELOPE');
});
test('v1 cannot silently consume a v2 envelope',async t=>{const input=await fixture(t);await change(input,'envelope.json',r=>{r.schema_version='dsh-browser-host-evidence/v1';});await reject(input,'ENVELOPE');});
test('missing state does not create a journal',async t=>{
 const input=await fixture(t);input.statePath=join(input.root,'absent.json');await assert.rejects(verifyPluginHost(input));await assert.rejects(readFile(input.statePath),/ENOENT/);
});
test('rehashed replacement runner is rejected',async t=>{
 const input=await fixture(t);await writeFile(join(input.root,'browser-v2/results/run.py'),"P='/tmp/owned-fp-browser-cku4mhx5'\n# skip execution\n");await refreshBrowserV2(input.root);await reject(input,'RUNNER');
});
test('rehashed replacement controller is rejected',async t=>{
 const input=await fixture(t),dir=join(input.root,'browser-v2'),name='controller/repo/scripts/dsh-b0/first-purchase-browser.probe.mjs',bytes=Buffer.from('export {};');
 await writeFile(join(dir,'transfer',name),bytes);
 const controller=await parse(join(dir,'transfer/controller/sources.json'));controller.files[name.slice(16)].sha256=hash(bytes);await json(join(dir,'transfer/controller/sources.json'),controller);
 const seal=await parse(join(dir,'transfer/input-seal.json'));
 for(const key of [name,'controller/sources.json']){const b=await readFile(join(dir,'transfer',key));seal.files[key]={bytes:b.length,sha256:hash(b)};}
 await json(join(dir,'transfer/input-seal.json'),seal);
 await change(input,'envelope.json',r=>{r.inputs.sha256=hash(JSON.stringify(seal,null,2)+'\n');r.controller.sha256=hash(JSON.stringify(controller,null,2)+'\n');});await reject(input,'CONTROLLER_SOURCE');
});
test('unrelated completion script and false cleanup acknowledgement fail closed',async t=>{
 const input=await fixture(t),path=join(input.root,'browser-v2/completion.py.txt');await writeFile(path,(await readFile(path,'utf8')).replace('cku4mhx5','unrelated'));
 const replaced=await readFile(path);await change(input,'envelope.json',r=>{r.completion_script.sha256=hash(replaced);});await reject(input,'COMPLETION_ROOT');
 const other=await fixture(t);await change(other,'completion.json',r=>{r.stdout=JSON.stringify({owned_directory_removed:false,production_unchanged:true,evidence_retrieved_and_verified:true});});
 const b=await readFile(join(other.root,'browser-v2/completion.json'));await change(other,'envelope.json',r=>{r.completion.sha256=hash(b);});await reject(other,'COMPLETION');
});
test('rehashed font input drift is rejected',async t=>{
 const input=await fixture(t);await change(input,'results/browser-font-receipt.json',r=>{r.files['browser-fonts/fonts.conf'].sha256='c'.repeat(64);});
 const bytes=await readFile(join(input.root,'browser-v2/results/browser-font-receipt.json'));await change(input,'results/browser-result/receipt.json',r=>{r.font_receipt_sha256=hash(bytes);});await reject(input,'FONT_FILE');
});
for(const summary of ['1 passed, 1 failed','1 passed, 1 skipped','1 passed, 1 error'])test('rejects contradictory pytest: '+summary,async t=>{
 const input=await fixture(t);await writeFile(join(input.root,'browser-v2/results/browser-result/pytest.stdout'),summary+'\n');await refreshBrowserV2(input.root);await reject(input,'PYTEST');
});
test('archive tampering and a correctly hashed but unrelated archive are rejected',async t=>{
 const input=await fixture(t);await writeFile(join(input.root,'browser-v2/results.tar.gz'),'tampered');await reject(input,'RESULT_ARCHIVE');
 const other=await fixture(t);await writeFile(join(other.root,'browser-v2/results/browser-result/pytest.stdout'),'1 passed, 1 failed\n');
 const index=await parse(join(other.root,'browser-v2/results/results-inventory.json')),name='browser-result/pytest.stdout',b=await readFile(join(other.root,'browser-v2/results',name));index[name]={bytes:b.length,sha256:hash(b)};
 await json(join(other.root,'browser-v2/results/results-inventory.json'),index);await change(other,'envelope.json',r=>{r.inventory.sha256=hash(JSON.stringify(index,null,2)+'\n');});await reject(other,'RESULT_INVENTORY');
});
test('path traversal, missing inventory record and symlink never alter state',async t=>{
 const input=await fixture(t);await change(input,'envelope.json',r=>{r.result_archive.name='../state.json';});await reject(input,'PATH_INVALID');
 const other=await fixture(t);await rm(join(other.root,'browser-v2/results/browser-result/receipt.json'));await refreshBrowserV2(other.root);await reject(other,'REQUIRED');
 const link=await fixture(t),path=join(link.root,'browser-v2/results/run.py');await rm(path);await symlink(link.candidatePath,path);await reject(link,'SYMLINK');
});
test('CLI failure redacts untrusted values and exits 2',async t=>{
 const input=await fixture(t),secret='do-not-print-synthetic-secret';await change(input,'results/browser-result/receipt.json',r=>{r.status=secret;});
 const before=await readFile(input.statePath);await assert.rejects(exec(process.execPath,cli(input)),e=>{assert.equal(e.code,2);assert.match(e.stderr,/NOT_PASS/);assert.ok(!e.stderr.includes(secret));return true;});assert.deepEqual(await readFile(input.statePath),before);
});
