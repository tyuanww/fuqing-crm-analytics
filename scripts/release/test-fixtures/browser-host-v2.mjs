/** Verifier-only fixture. No remote path, browser, service or runner is executed. */
import { cp, mkdir, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createTerminalHostFixture } from './terminal-host.mjs';
import { inventory, put, setJSON } from './runtime-host.mjs';
import { parse, json } from './service-artifacts.mjs';
import { verifyPluginHost } from '../plugin-host-evidence.mjs';
import { readState } from '../state.mjs';
import { serviceDigest as hash } from '../service-compatibility.mjs';
import { readGitInput } from '../../crm-calibration/package-service.mjs';
import { TERMINAL_CONTROLLER_REVIEWED } from '../terminal-host-evidence.mjs';
import { BROWSER_ROWS } from '../browser-host-evidence.mjs';
import { TERMINAL_TEST_ROOT as OLD } from '../terminal-recovery-records.mjs';
const ROOT = join(import.meta.dirname,'../../..'), exec = promisify(execFile);
export const V2_TEST_ROOT = 'browser-result/tests/test_official_host_crm_query_s0';
const PREFIX = '/tmp/owned-fp-browser-cku4mhx5';
export async function refreshBrowserV2(root) {
  const dir=join(root,'browser-v2'),results=join(dir,'results');
  await setJSON(results,'results-inventory.json',await inventory(results,['results-inventory.json']));
  await rm(join(dir,'results.tar.gz'),{force:true});
  await exec('python3',['-c',"import pathlib,sys,tarfile\np=pathlib.Path(sys.argv[1])\nwith tarfile.open(sys.argv[2],'w:gz') as t:\n for f in sorted(p.rglob('*')):\n  if f.is_file():t.add(f,arcname=str(f.relative_to(p)),recursive=False)",results,join(dir,'results.tar.gz')],{cwd:root,timeout:30000});
  const bytes=await readFile(join(dir,'results.tar.gz')),index=await parse(join(results,'results-inventory.json'));
  const collection={cleanup:await parse(join(results,'cleanup-check.json')),files:Object.keys(index).length+1,bytes:bytes.length,sha256:hash(bytes)};
  await setJSON(dir,'collection.json',{exit_code:0,stdout:JSON.stringify(collection)+'\n',stderr:''});
  const source=await readFile(join(import.meta.dirname,'current-browser-cleanup.py.txt'),'utf8');
  await put(dir,'completion.py.txt',source.replace(/^ARCHIVE_SHA='[^']+'/m,"ARCHIVE_SHA='"+collection.sha256+"'"));
  const envelope=await parse(join(dir,'envelope.json'));
  for(const [key,name] of Object.entries({inventory:'results/results-inventory.json',result_archive:'results.tar.gz',collection:'collection.json',completion_script:'completion.py.txt'}))
    envelope[key]={name,sha256:hash(await readFile(join(dir,name)))};
  await json(join(dir,'envelope.json'),envelope);
}
export async function createBrowserV2Fixture(root) {
  await createTerminalHostFixture(root);
  await verifyPluginHost({candidatePath:join(root,'candidate/candidate.json'),statePath:join(root,'state.json'),evidencePath:join(root,'terminal-evidence/envelope.json')});
  const parent=(await readState(join(root,'state.json'))).journal.at(-1),candidate=await parse(join(root,'candidate/candidate.json'));
  const old=join(root,'terminal-evidence'),dir=join(root,'browser-v2'),transfer=join(dir,'transfer'),results=join(dir,'results'),T=V2_TEST_ROOT;
  await mkdir(dir);await cp(join(old,'transfer'),transfer,{recursive:true});await mkdir(results);
  await cp(join(old,'runtime.tar.zst'),join(dir,'runtime.tar.zst'));
  await rm(join(transfer,'input-seal.json'));
  await cp(join(old,'results/payload/platform-receipt.json'),join(transfer,'payload/platform-receipt.json'));
  const manifest=await parse(join(old,'results/payload/input-v5.json'));
  for(const [k,v] of Object.entries(manifest))if(k.endsWith('_path'))manifest[k]=v.replace('/tmp/owned-fp-terminal-fixture',PREFIX);
  await setJSON(results,'payload/input-v5.json',manifest);
  await cp(join(old,'results',OLD),join(results,T),{recursive:true});
  const controller=await parse(join(transfer,'controller/sources.json')),probe='scripts/dsh-b0/first-purchase-browser.probe.mjs';
  const source=await readGitInput(ROOT,TERMINAL_CONTROLLER_REVIEWED,probe);controller.files[probe]={source:probe,sha256:hash(source)};
  await put(transfer,'controller/repo/'+probe,source);await setJSON(transfer,'controller/sources.json',controller);
  for(const name of ['playwright','playwright-core'])await setJSON(transfer,'browser-driver/node_modules/'+name+'/package.json',{name,version:'1.62.1'});
  const seal={schema_version:'owned-current-candidate-browser-input/v1',scope:'synthetic-browser-only',candidate_digest:candidate.candidate_digest,
    controller_reviewed_commit:TERMINAL_CONTROLLER_REVIEWED,release_ready:false,files:await inventory(transfer)};
  await setJSON(transfer,'input-seal.json',seal);await setJSON(results,'input-seal.json',seal);await setJSON(results,'controller/sources.json',controller);
  await put(results,'run.py',await readFile(join(import.meta.dirname,'current-browser-runner.py.txt')));
  const packages=await parse(join(results,T,'plugin-artifacts/packages.json'));packages.input_sha256=hash(await readFile(join(results,'payload/input-v5.json')));
  await setJSON(results,T+'/plugin-artifacts/packages.json',packages);
  const http=await parse(join(results,T,'official-host/http-observations.json'));http.artifacts=packages;http.observations=http.observations.slice(0,5);
  http.admission='official native composer slash command in Chrome';http.browser={ok:true,browser:'Chrome headless',browser_version:'151.0.7922.34',platform:'linux',locale:'zh-CN',rows:BROWSER_ROWS};
  await setJSON(results,T+'/official-host/http-observations.json',http);
  await setJSON(results,T+'/official-host/browser-observations.json',{rows:BROWSER_ROWS,errors:[],driver:'Chrome headless',browser_version:'151.0.7922.34',platform:'linux',locale:'zh-CN'});
  const save=await parse(join(results,T,'save-owner/service-processes/processes.json'));save[1].query_offline_replay='NOT_RUN';save[1].same_intent_replay='NOT_RUN_BROWSER_MODE';await setJSON(results,T+'/save-owner/service-processes/processes.json',save);
  const png=Buffer.alloc(32);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.write('IHDR',12);png.writeUInt32BE(1280,16);png.writeUInt32BE(900,20);
  for(const name of ['browser-saved.png','browser-native.png'])await put(results,T+'/official-host/'+name,png);
  const environment=await parse(join(import.meta.dirname,'current-browser-environment.json'));
  for(const [name,data] of Object.entries(environment))await setJSON(results,name+'.json',data);
  await setJSON(results,'chrome.zip.download.json',{exit_code:0,stderr:'',source:'https://cdn.playwright.dev/builds/cft/151.0.7922.34/linux64/chrome-linux64.zip',sha256:'ae8736ac28bc69278551500f219fc749575648263c43ec5990749eff43b9fcf8',bytes:193282658});
  const install=await parse(join(old,'results/host-result/controller-install.stdout'));install.python=PREFIX+'/browser-result/venv/bin/python';await setJSON(results,'browser-result/controller-install.stdout',install);
  for(const name of ['controller-install.stderr','browser-preflight.stderr','pytest.stderr'])await put(results,'browser-result/'+name,'');
  await put(results,'browser-result/pytest.stdout','verifier-only fixture, no browser execution\n1 passed\n');
  const browser={version:'151.0.7922.34',platform:'linux',uid:65534,scope:'target-browser-readiness-only'};
  await setJSON(results,'browser-result/browser-preflight.stdout',browser);
  await setJSON(results,'browser-result/receipt.json',{schema_version:'dsh-current-candidate-browser-observation/v1',candidate_digest:candidate.candidate_digest,
    plugin_source:candidate.source_sha,service_source:candidate.service_compatibility.binding.source_sha,status:'PASS',exit_code:0,seconds:80,
    scope:'actual-wsl2-synthetic-runtime-artifacts-browser',platform:parent.observation.platform,controller_sha256:hash(await readFile(join(transfer,'controller/sources.json'))),
    input_sha256:hash(await readFile(join(transfer,'input-seal.json'))),runtime_sha256:parent.observation.runtime_sha256,browser,
    font_receipt_sha256:hash(await readFile(join(results,'browser-font-receipt.json'))),playwright_version:'1.62.1',headless:true,
    mobile:'NOT_RUN',accessibility:'NOT_RUN',cross_version_recovery:'NOT_RUN',production_identity:'NOT_RUN',supply_chain:'NOT_VERIFIED',activation:'NOT_RUN',release_ready:false});
  await setJSON(results,'cleanup-check.json',{production_listener_pid_snapshot_unchanged:true,current_unchanged:true,test_ports_closed:true,
    owned_processes_alive:[],runtime_sha256:parent.observation.runtime_sha256,sealed_files_unchanged:Object.keys(seal.files).length});
  await setJSON(dir,'completion.json',{exit_code:0,stdout:JSON.stringify({owned_directory_removed:true,production_unchanged:true,evidence_retrieved_and_verified:true})+'\n',stderr:''});
  const ref=async name=>({name,sha256:hash(await readFile(join(dir,name)))});
  await setJSON(dir,'envelope.json',{schema_version:'dsh-browser-host-evidence/v2',inputs:await ref('transfer/input-seal.json'),controller:await ref('transfer/controller/sources.json'),
    runtime_archive:await ref('runtime.tar.zst'),completion:await ref('completion.json'),terminal_host_event:{seq:parent.seq,digest:parent.digest}});
  await refreshBrowserV2(root);
}
