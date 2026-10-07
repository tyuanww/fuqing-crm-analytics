import assert from 'node:assert/strict';
import { before, after, test } from 'node:test';
import { cp, mkdtemp, readFile, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyPluginHost } from './plugin-host-evidence.mjs';
import { readState } from './state.mjs';
import { serviceDigest as hash } from './service-compatibility.mjs';
import { json, parse } from './test-fixtures/service-artifacts.mjs';
import { createTerminalHostFixture, refreshTerminalInventory } from './test-fixtures/terminal-host.mjs';
import { TERMINAL_TEST_ROOT as T } from './terminal-recovery-records.mjs';
const exec = promisify(execFile); let baseline;
before(async () => { baseline=await mkdtemp(join(tmpdir(),'terminal-host-verifier-')); await createTerminalHostFixture(baseline); });
after(async () => { if(baseline)await rm(baseline,{recursive:true,force:true}); });
async function fixture(t) {
  const root=await mkdtemp(join(tmpdir(),'terminal-host-case-')); t.after(()=>rm(root,{recursive:true,force:true}));
  for(const p of ['candidate','state.json','terminal-evidence'])await cp(join(baseline,p),join(root,p),{recursive:true});
  return {root,candidatePath:join(root,'candidate/candidate.json'),evidencePath:join(root,'terminal-evidence/envelope.json'),statePath:join(root,'state.json')};
}
async function change(input,path,fn) {
  const p=join(input.root,'terminal-evidence',path),v=await parse(p);fn(v);await json(p,v);
  if(path.startsWith('results/'))await refreshTerminalInventory(input.root);
}
async function reject(input,pattern) {
  const before=await readFile(input.statePath),mtime=(await stat(input.statePath)).mtimeMs,candidate=await readFile(input.candidatePath);
  await assert.rejects(verifyPluginHost(input),pattern);
  assert.deepEqual(await readFile(input.statePath),before);assert.equal((await stat(input.statePath)).mtimeMs,mtime);
  assert.deepEqual(await readFile(input.candidatePath),candidate);
}
const cli=input=>[join(import.meta.dirname,'../dsh.mjs'),'plugin','verify-host','--candidate',input.candidatePath,
  '--evidence',input.evidencePath,'--state-path',input.statePath];
test('terminal recovery appends its own event, preserves the parent and retries without writes',async t=>{
  const input=await fixture(t),prior=await readState(input.statePath),candidate=await parse(input.candidatePath);
  assert.notEqual(candidate.source_sha,candidate.service_compatibility.binding.source_sha);
  const result=await verifyPluginHost(input);
  assert.equal(result.status,'WSL_SYNTHETIC_TERMINAL_HOST_OBSERVED');assert.equal(result.release_ready,false);
  assert.equal(result.interrupted_status,'FAILED');assert.equal(result.execution_active,false);assert.equal(result.dispatch_attempts,1);
  assert.equal(result.cross_version_recovery,'NOT_RUN');assert.equal(result.browser,'NOT_RUN');
  const current=await readState(input.statePath);assert.equal(current.journal.at(-1).status,'CANDIDATE_TERMINAL_HOST_OBSERVED');
  assert.deepEqual(current.journal.slice(0,-1),prior.journal);
  const bytes=await readFile(input.statePath),mtime=(await stat(input.statePath)).mtimeMs;
  const retry=await exec(process.execPath,cli(input));assert.deepEqual(JSON.parse(retry.stdout),result);
  assert.deepEqual(await readFile(input.statePath),bytes);assert.equal((await stat(input.statePath)).mtimeMs,mtime);
});
for(const [name,path,mutate,code] of [
  ['failed receipt','host-result/receipt.json',r=>{r.status='FAIL';},'NOT_PASS'],
  ['production claim','host-result/receipt.json',r=>{r.release_ready=true;},'UNPROVEN'],
  ['wrong plugin revision','host-result/receipt.json',r=>{r.plugin_source=r.service_source;},'PLUGIN_SOURCE'],
  ['wrong service revision','host-result/receipt.json',r=>{r.service_source=r.plugin_source;},'SERVICE_SOURCE'],
  ['wrong platform','host-result/receipt.json',r=>{r.platform.uid=0;},'PLATFORM'],
  ['old UNKNOWN mode',T+'/official-host/recovery-observations.json',r=>{r.expected_business_recovery='UNKNOWN';},'TERMINAL_MODE'],
  ['claimed pass only',T+'/official-host/recovery-observations.json',r=>{r.observations=[];},'RECOVERY_SCENARIOS'],
  ['wrong crash process',T+'/official-host/recovery-observations.json',r=>{r.observations[0].killed_pid=123;},'CRASH'],
  ['no SIGKILL',T+'/official-host/recovery-observations.json',r=>{r.observations[0].signal='SIGTERM';},'CRASH'],
  ['lost committed prefix',T+'/official-host/recovery-observations.json',r=>{r.observations[0].recovered.prefix_digest='b'.repeat(64);},'PREFIX'],
  ['event changed under claimed prefix',T+'/official-host/recovery-observations.json',r=>{r.observations[0].recovered.events[0].type='step/start';},'PREFIX'],
  ['duplicate sequence',T+'/official-host/recovery-observations.json',r=>{r.observations[0].recovered.events[1].seq=0;},'SESSION_SEQUENCE'],
  ['CRM login preserved',T+'/official-host/recovery-observations.json',r=>{r.observations[0].crm_relogin_required=false;},'AUTH'],
  ['missing fallback',T+'/official-host/recovery-observations.json',r=>{r.observations[1].status='NOT_RUN';},'FALLBACK'],
  ['business tool in native fallback',T+'/official-host/recovery-observations.json',r=>{r.observations[1].recovered.events[1].type='tool/call';},'FALLBACK'],
  ['still UNKNOWN',T+'/interrupted-run.json',r=>{r.status='UNKNOWN';},'TERMINAL_STATUS'],
  ['unknown run field',T+'/interrupted-run.json',r=>{r.unknown_field=true;},'RUN'],
  ['slot not released',T+'/interrupted-run.json',r=>{r.diagnostics.execution_active=true;},'SLOT'],
  ['duplicate dispatch',T+'/interrupted-run.json',r=>{r.diagnostics.dispatch_attempts=2;},'DISPATCH'],
  ['fabricated success',T+'/interrupted-run.json',r=>{r.result={success:true};},'RUN'],
  ['duplicate analysis',T+'/source-boundary.json',r=>{r.analysis_count=2;},'SOURCE_BOUNDARY'],
  ['worker replay',T+'/kernel-processes/processes.json',r=>{r[1].stopped.workers=r[0].stopped.workers;},'WORKER'],
  ['service provenance overwritten by plugin',T+'/kernel-processes/processes.json',r=>{r[0].source_sha='3ffbd2a2e5a6c3179aecec09c63522ff1bb2d268';},'PROCESS_SOURCE'],
  ['recovery save not replayed',T+'/official-host/http-observations.json',r=>{r.observations.pop();},'HTTP_SCENARIOS'],
  ['browser scope substituted',T+'/official-host/http-observations.json',r=>{r.admission='official native composer slash command in Chrome';},'ADMISSION'],
  ['unexpected production activation','cleanup-check.json',r=>{r.current_unchanged=false;},'CLEANUP'],
  ['owned process still running','cleanup-check.json',r=>{r.owned_processes_alive=[123];},'CLEANUP'],
  ['unsafe controller install','host-result/controller-install.stdout',r=>{r.python='/srv/production/bin/python';},'INSTALL'],
])test('rejects '+name+' before any journal write',async t=>{
  const input=await fixture(t);await change(input,'results/'+path,mutate);await reject(input,new RegExp(code));
});
test('wrong parent, unexpected schema and missing prepared state fail closed',async t=>{
  const input=await fixture(t);await change(input,'envelope.json',e=>{e.service_target_event.digest='f'.repeat(64);});await reject(input,/PARENT/);
  const other=await fixture(t);await change(other,'envelope.json',e=>{e.schema_version+='-unknown';});await reject(other,/PROFILE_SCOPE_MISMATCH/);
  await assert.rejects(verifyPluginHost({...other,statePath:join(other.root,'absent.json')}));
  await assert.rejects(readFile(join(other.root,'absent.json')),/ENOENT/);
});
test('rehashed runner substitution cannot bless a different test',async t=>{
  const input=await fixture(t);await writeFile(join(input.root,'terminal-evidence/results/run.py'),'# bypass all assertions');
  await refreshTerminalInventory(input.root);await reject(input,/RUNNER/);
});
test('rehashed controller cannot replace reviewed code',async t=>{
  const input=await fixture(t),dir=join(input.root,'terminal-evidence'),name='scripts/dsh-b0/first-purchase-crm-host.probe.mjs',bytes=Buffer.from('// bypass');
  await writeFile(join(dir,'transfer/controller/repo',name),bytes);
  const controller=await parse(join(dir,'transfer/controller/sources.json'));controller.files[name].sha256=hash(bytes);
  await json(join(dir,'transfer/controller/sources.json'),controller);
  const seal=await parse(join(dir,'transfer/input-seal.json'));
  for(const path of ['controller/repo/'+name,'controller/sources.json']){const b=await readFile(join(dir,'transfer',path));seal.files[path]={bytes:b.length,sha256:hash(b)};}
  await json(join(dir,'transfer/input-seal.json'),seal);
  await change(input,'envelope.json',e=>{e.inputs.sha256=hash(JSON.stringify(seal,null,2)+'\n');e.controller.sha256=hash(JSON.stringify(controller,null,2)+'\n');});
  await reject(input,/CONTROLLER_SOURCE/);
});
test('inventory tampering, missing records and symlinks are rejected',async t=>{
  const input=await fixture(t),path=join(input.root,'terminal-evidence/results',T,'interrupted-run.json');
  await writeFile(path,'{}');await reject(input,/FILE_DIGEST/);
  const other=await fixture(t),p=join(other.root,'terminal-evidence/results',T,'interrupted-run.json');
  await rm(p);await refreshTerminalInventory(other.root);await reject(other,/REQUIRED/);
  const link=await fixture(t),q=join(link.root,'terminal-evidence/results',T,'interrupted-run.json');
  await rm(q);await symlink(link.candidatePath,q);await reject(link,/SYMLINK/);
});
for(const summary of ['1 passed, 1 failed','1 passed, 1 error','1 passed, 1 skipped'])test('rejects contradictory pytest result: '+summary,async t=>{
  const input=await fixture(t);await writeFile(join(input.root,'terminal-evidence/results/host-result/pytest.stdout'),summary+'\n');
  await refreshTerminalInventory(input.root);await reject(input,/PYTEST/);
});
test('CLI error output redacts untrusted values and exits 2',async t=>{
  const input=await fixture(t),secret='do-not-log-this-synthetic-private-value';
  await change(input,'results/host-result/receipt.json',r=>{r.status=secret;});
  const prior=await readFile(input.statePath);
  await assert.rejects(exec(process.execPath,cli(input)),e=>{assert.equal(e.code,2);assert.match(e.stderr,/NOT_PASS/);assert.ok(!e.stderr.includes(secret));return true;});
  assert.deepEqual(await readFile(input.statePath),prior);
});
