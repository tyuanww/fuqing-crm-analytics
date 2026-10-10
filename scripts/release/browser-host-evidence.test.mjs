import assert from 'node:assert/strict';
import { before,after,test } from 'node:test';
import { cp,mkdtemp,readFile,rm,stat,writeFile,symlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { verifyPluginHost } from './plugin-host-evidence.mjs';
import { readState } from './state.mjs';
import { serviceDigest as hash } from './service-compatibility.mjs';
import { parse,json } from './test-fixtures/service-artifacts.mjs';
import { createBrowserHostFixture,refreshBrowserInventory } from './test-fixtures/browser-host.mjs';
import { BROWSER_TEST_ROOT as T } from './browser-host-evidence.mjs';
const exec=promisify(execFile);let baseline;
before(async()=>{baseline=await mkdtemp(join(tmpdir(),'browser-host-baseline-'));await createBrowserHostFixture(baseline);});
after(async()=>{if(baseline)await rm(baseline,{recursive:true,force:true});});
async function fixture(t){const root=await mkdtemp(join(tmpdir(),'browser-host-case-'));t.after(()=>rm(root,{recursive:true,force:true}));for(const p of ['candidate','state.json','browser-evidence'])await cp(join(baseline,p),join(root,p),{recursive:true});return {root,candidatePath:join(root,'candidate/candidate.json'),evidencePath:join(root,'browser-evidence/envelope.json'),statePath:join(root,'state.json')};}
async function change(input,path,mutate){const p=join(input.root,'browser-evidence',path),value=await parse(p);mutate(value);await json(p,value);if(path.startsWith('results/'))await refreshBrowserInventory(input.root);}
async function reject(input,code){const bytes=await readFile(input.statePath),mtime=(await stat(input.statePath)).mtimeMs;await assert.rejects(verifyPluginHost(input),new RegExp(code));assert.deepEqual(await readFile(input.statePath),bytes);assert.equal((await stat(input.statePath)).mtimeMs,mtime);}
const cli=input=>[join(import.meta.dirname,'../dsh.mjs'),'plugin','verify-host','--candidate',input.candidatePath,'--evidence',input.evidencePath,'--state-path',input.statePath];
test('browser event binds the existing HTTP parent and replays without changing candidate or state',async t=>{
  const input=await fixture(t),before=await readState(input.statePath),candidate=await readFile(input.candidatePath);const result=await verifyPluginHost(input);
  assert.equal(result.status,'WSL_SYNTHETIC_BROWSER_HOST_OBSERVED');assert.equal(result.journal_seq,before.journal.length+1);assert.equal(result.scenario_count,5);
  for(const key of ['activation','accessibility','mobile','production_identity','cross_version_recovery'])assert.equal(result[key],'NOT_RUN');
  assert.equal(result.release_ready,false);assert.equal(result.evidence_authenticity,'UNATTESTED_OPERATOR_OBSERVATION');
  const bytes=await readFile(input.statePath),mtime=(await stat(input.statePath)).mtimeMs;
  const retry=await exec(process.execPath,cli(input));assert.deepEqual(JSON.parse(retry.stdout),result);
  assert.deepEqual(await readFile(input.statePath),bytes);assert.equal((await stat(input.statePath)).mtimeMs,mtime);
  assert.deepEqual(await readFile(input.candidatePath),candidate);assert.deepEqual((await readState(input.statePath)).journal.slice(0,-1),before.journal);
});
for(const [name,path,mutate,code] of [
 ['failed receipt','browser-r3/receipt.json',r=>{r.status='FAIL';},'NOT_PASS'],
 ['release escalation','browser-r3/receipt.json',r=>{r.release_ready=true;},'UNPROVEN'],
 ['headed claim','browser-r3/receipt.json',r=>{r.headless=false;},'HEADLESS'],
 ['production identity claim','browser-r3/receipt.json',r=>{r.production_identity='PASS';},'UNPROVEN'],
 ['local platform','browser-r3/receipt.json',r=>{r.platform.kernel='Darwin';},'PLATFORM'],
 ['root browser','browser-r3/receipt.json',r=>{r.platform.uid=0;},'PLATFORM'],
 ['other runtime','browser-r3/receipt.json',r=>{r.runtime_sha256='b'.repeat(64);},'RUNTIME'],
 ['other controller','browser-r3/receipt.json',r=>{r.controller_sha256='b'.repeat(64);},'CONTROLLER'],
 ['other candidate',T+'/official-host/http-observations.json',r=>{r.candidate_digest='c'.repeat(64);},'CANDIDATE'],
 ['missing scenario',T+'/official-host/browser-observations.json',r=>{r.rows.pop();},'SCENARIOS'],
 ['page error',T+'/official-host/browser-observations.json',r=>{r.errors.push('synthetic error');},'SCENARIOS'],
 ['locale drift',T+'/official-host/browser-observations.json',r=>{r.locale='en-US';},'SCENARIOS'],
 ['browser version drift',T+'/official-host/browser-observations.json',r=>{r.browser_version='154.0.0.0';},'SCENARIOS'],
 ['skipped auth',T+'/official-host/http-observations.json',r=>{r.observations[1].status='SKIP';},'AUTH_SCENARIOS'],
 ['HTTP-only receipt',T+'/official-host/http-observations.json',r=>{r.browser='NOT_RUN';},'HTTP_BROWSER'],
 ['duplicate analysis',T+'/source-boundary.json',r=>{r.analysis_count=2;},'SOURCE_BOUNDARY'],
 ['duplicate worker',T+'/kernel-processes/processes.json',r=>{r[1].stopped.workers=r[0].stopped.workers;},'WORKER'],
 ['non-exited service',T+'/save-owner/service-processes/processes.json',r=>{r[0].process_exited=false;},'CLEANUP'],
 ['cross-store access',T+'/save-owner/service-processes/processes.json',r=>{r[0].sqlite_files.push('query.sqlite');},'STORAGE'],
 ['forged HTTP replay',T+'/save-owner/service-processes/processes.json',r=>{r[1].same_intent_replay='PASS';},'REPLAY'],
 ['unreaped processes','cleanup-check-r3.json',r=>{r.processes_with_owned_cwd_or_executable=[123];},'CLEANUP'],
 ['production listener change','cleanup-check-r3.json',r=>{r.protected_listeners_unchanged=false;},'CLEANUP'],
])test('rejects '+name+' even with a refreshed inventory',async t=>{const input=await fixture(t);await change(input,'results/'+path,mutate);await reject(input,code);});
test('wrong or absent HTTP parent cannot append an observation',async t=>{const input=await fixture(t);await change(input,'envelope.json',r=>{r.runtime_host_event.digest='d'.repeat(64);});await reject(input,'PARENT');const other=await fixture(t);await change(other,'envelope.json',r=>{r.runtime_host_event.seq-=1;});await reject(other,'PARENT');});
test('unknown schema, missing evidence and additional schema fields fail closed',async t=>{const input=await fixture(t);await change(input,'envelope.json',r=>{r.schema_version='dsh-browser-host-evidence/v99';});await reject(input,'PLUGIN_HOST_PROFILE_SCOPE_MISMATCH');const other=await fixture(t);await change(other,'envelope.json',r=>{r.activation=true;});await reject(other,'ENVELOPE');const missing=await fixture(t);await rm(join(missing.root,'browser-evidence/results/browser-r3/receipt.json'));await reject(missing,'ENOENT');});
test('tampered image, traversal and symlink cannot modify the journal',async t=>{const input=await fixture(t);await writeFile(join(input.root,'browser-evidence/results',T,'official-host/browser-saved.png'),'not png');await refreshBrowserInventory(input.root);await reject(input,'SCREENSHOT');const other=await fixture(t);await change(other,'envelope.json',r=>{r.inventory.name='../state.json';});await reject(other,'PATH_INVALID');const link=await fixture(t),path=join(link.root,'browser-evidence/results/browser-r3/receipt.json');await rm(path);await symlink(link.candidatePath,path);await reject(link,'SYMLINK');});
test('rehashing a modified probe cannot bypass its reviewed source pin',async t=>{const input=await fixture(t),name='repo/scripts/dsh-b0/first-purchase-browser.probe.mjs',bytes=Buffer.from('export {};');await writeFile(join(input.root,'browser-evidence/controller',name),bytes);const sealPath=join(input.root,'browser-evidence/controller/input-seal.json'),seal=await parse(sealPath);seal.files[name]={bytes:bytes.length,sha256:hash(bytes)};await json(sealPath,seal);await change(input,'envelope.json',r=>{r.controller.sha256=hash(JSON.stringify(seal,null,2)+'\n');});await reject(input,'CONTROLLER_SOURCE');});
test('CLI redacts malicious observation values',async t=>{const input=await fixture(t),secret='do-not-log-synthetic-browser-value';await change(input,'results/browser-r3/receipt.json',r=>{r.status=secret;});await assert.rejects(exec(process.execPath,cli(input)),e=>{assert.equal(e.code,2);assert.match(e.stderr,/PLUGIN_HOST_BROWSER_NOT_PASS/);assert.ok(!e.stderr.includes(secret));return true;});});

test('missing font files cannot pass by rehashing the receipt and inventory',async t=>{
  const input=await fixture(t);await change(input,'results/browser-font-receipt.json',r=>{r.files={};});
  const bytes=await readFile(join(input.root,'browser-evidence/results/browser-font-receipt.json'));
  await change(input,'results/browser-r3/receipt.json',r=>{r.font_receipt_sha256=hash(bytes);});await reject(input,'FONT_FILES');
});
test('unrelated cleanup cannot certify another owned directory',async t=>{
  const input=await fixture(t);await change(input,'completion.json',r=>{r.owned_root='/tmp/other';});
  const bytes=await readFile(join(input.root,'browser-evidence/completion.json'));
  await change(input,'envelope.json',r=>{r.completion.sha256=hash(bytes);});await reject(input,'COMPLETION');
});
test('changed image bytes under the original inventory are rejected',async t=>{
  const input=await fixture(t);await writeFile(join(input.root,'browser-evidence/results',T,'official-host/browser-native.png'),'tampered');await reject(input,'FILE_DIGEST');
});
for(const [name,path,mutate,code] of [
 ['other downloaded browser','chrome.zip.download.json',r=>{r.sha256='d'.repeat(64);},'BROWSER_DOWNLOAD'],
 ['system library install','browser-library-receipt.json',r=>{r.system_install='PASS';},'BROWSER_LIBRARIES'],
 ['failed pytest','browser-r3/receipt.json',r=>{r.exit_code=1;},'NOT_PASS'],
])test('rejects '+name,async t=>{const input=await fixture(t);await change(input,'results/'+path,mutate);await reject(input,code);});
