/** Hermetic verifier inputs, not evidence of a Host/model/service execution. */
import { cp, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServiceArtifactFixture, json, parse } from './service-artifacts.mjs';
import { createSourceTargetFixture } from './source-target.mjs';
import { verifyPluginService } from '../plugin-service-evidence.mjs';
import { readState } from '../state.mjs';
import { readGitInput } from '../../crm-calibration/package-service.mjs';
import { serviceDigest as hash } from '../service-compatibility.mjs';
import { DSH_SDK_VERSION, DSH_UPSTREAM_SHA } from '../toolchain.mjs';
import { RUNTIME_HOST_SOURCE, RUNTIME_HOST_REQUIRED_CODE, RUNTIME_HOST_TEST_ROOT as T } from '../runtime-host-evidence.mjs';
const ROOT = fileURLToPath(new URL('../../..', import.meta.url)), exec = promisify(execFile);
export async function put(root, name, bytes) { const p=join(root,name); await mkdir(dirname(p),{recursive:true}); await writeFile(p,bytes); }
export async function setJSON(root,name,value) { await put(root,name,JSON.stringify(value,null,2)+'\n'); }
export async function inventory(root, exclude=[]) {
  const result={};
  async function walk(dir,prefix='') { for(const row of await readdir(dir,{withFileTypes:true})){
    const name=prefix+row.name;if(exclude.includes(name))continue;
    if(row.isDirectory())await walk(join(dir,row.name),name+'/');
    else {const b=await readFile(join(dir,row.name));result[name]={bytes:b.length,sha256:hash(b)};}
  }} await walk(root);return result;
}
export async function refreshInventory(root) {
  const inv=join(root,'evidence/results/inventory.json');await json(inv,await inventory(dirname(inv),['inventory.json']));
  const path=join(root,'evidence/envelope.json'),envelope=await parse(path);envelope.inventory.sha256=hash(await readFile(inv));await json(path,envelope);
}
export async function createRuntimeHostFixture(root) {
  await createServiceArtifactFixture(root,{sourceRevision:RUNTIME_HOST_SOURCE,pluginName:'@shine-mage/dsh-analytics-workbench-b0'});
  await createSourceTargetFixture(root,RUNTIME_HOST_SOURCE);
  await verifyPluginService({candidatePath:join(root,'candidate/candidate.json'),evidencePath:join(root,'pair/receipt.json'),statePath:join(root,'state.json'),
    targetEvidencePath:join(root,'target-result/receipt.json'),targetInputPath:join(root,'target-input/input.json')});
  const candidate=await parse(join(root,'candidate/candidate.json')),parent=(await readState(join(root,'state.json'))).journal.at(-1);
  const evidence=join(root,'evidence'),payload=join(evidence,'payload'),controller=join(evidence,'controller'),results=join(evidence,'results');
  await mkdir(payload,{recursive:true});await mkdir(controller);await mkdir(results);
  for(const name of ['candidate','pair'])await cp(join(root,name),join(payload,name),{recursive:true});
  await cp(join(root,'target-input/query'),join(payload,'query'),{recursive:true});
  await cp(join(root,'target-input/query/archive.tar.zst'),join(payload,'query/kernel.tar.zst'));
  await cp(join(root,'target-input/query-wheels'),join(payload,'query-wheels'),{recursive:true});
  await cp(join(root,'target-result/receipt.json'),join(payload,'platform-receipt.json'));
  const query=await parse(join(payload,'query/receipt.json')),pair=await parse(join(payload,'pair/receipt.json'));
  const workbench=await parse(join(payload,'candidate/plugin-pack.json'));
  const stage=join(root,'plugin-unpacked');
  await exec('python3',[join(ROOT,'scripts/release/secure-unpack.py'),join(payload,'candidate',candidate.pack.name),stage]);
  const workbenchFiles=Object.fromEntries(Object.entries(await inventory(join(stage,'package'))).map(([p,v])=>[p,v.sha256]));
  const crmStage=join(root,'crm-stage');
  await setJSON(crmStage,'package/package.json',{name:'@shine-mage/dsh-crm-knowledge',version:'0.1.0'});
  await put(crmStage,'package/lib/index.js','// verifier-only fixture\nexport {};\n');
  const crmName='crm-fixture.tgz';await mkdir(join(payload,'crm'));
  await exec('tar',['-czf',join(payload,'crm',crmName),'-C',crmStage,'package'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const crmArchive=await readFile(join(payload,'crm',crmName));
  const crmFiles=Object.fromEntries(Object.entries(await inventory(join(crmStage,'package'))).map(([p,v])=>[p,v.sha256]));
  const crm={...workbench,package_name:'@shine-mage/dsh-crm-knowledge',package_version:'0.1.0',entries:Object.keys(crmFiles),
    tarball:{name:crmName,bytes:crmArchive.length,sha256:hash(crmArchive)}};
  await json(join(payload,'crm/plugin-pack.json'),crm);
  const runtimeBytes=Buffer.from('synthetic verifier-only archive; never installed');
  await put(evidence,'runtime.tar.zst',runtimeBytes);
  const artifact={name:`shinemage-dsh-upstream-runtime-${DSH_UPSTREAM_SHA}.tar.zst`,role:'upstream-runtime-bundle',upstream_sha:DSH_UPSTREAM_SHA,bytes:runtimeBytes.length,sha256:hash(runtimeBytes)};
  await json(join(payload,'runtime-manifest.json'),{schema_version:'release-manifest/v1',dsh_upstream_sha:DSH_UPSTREAM_SHA,upstream_runtime:artifact});
  const prefix='/tmp/owned-fp-runtime-fixture',input={schema_version:'dsh-first-purchase-host-artifacts/v5'};
  for(const [key,path] of Object.entries({candidate:'candidate/candidate.json',crm_pack:'crm/plugin-pack.json',service_evidence:'pair/receipt.json',kernel_receipt:'query/receipt.json',runtime_manifest:'runtime-manifest.json',platform_receipt:'platform-receipt.json'})){
    input[key+'_path']=prefix+'/payload/'+path;input[key+'_sha256']=hash(await readFile(join(payload,path)));
  }input.runtime_archive_path=prefix+'/runtime.tar.zst';await json(join(payload,'input-v5.json'),input);
  const namespaces=['backend','backend/contracts','backend/semantic','backend/services','backend/services/analytics','backend/services/analytics/first_purchase','backend/tests'];
  const mapping=[];
  for(const path of RUNTIME_HOST_REQUIRED_CODE)await put(controller,'repo/'+path,await readGitInput(ROOT,RUNTIME_HOST_SOURCE,path));
  for(const path of namespaces){const name=path+'/__init__.py',source='scripts/crm-calibration/service-namespace.py',bytes=await readGitInput(ROOT,RUNTIME_HOST_SOURCE,source);
    await put(controller,'repo/'+name,bytes);mapping.push({path:'repo/'+name,source,sha256:hash(bytes),original_sha256:hash(await readGitInput(ROOT,RUNTIME_HOST_SOURCE,name))});}
  await json(join(controller,'namespace-inputs.json'),mapping);
  const inputSeal={schema_version:'owned-first-purchase-host-transfer/v1',scope:'synthetic-only',release_ready:false,files:await inventory(payload)};
  await json(join(payload,'input-seal.json'),inputSeal);
  const ref=async name=>({name,sha256:hash(await readFile(join(evidence,name)))});
  const inputs=await ref('payload/input-seal.json');
  const ctrlSeal={schema_version:'owned-first-purchase-host-controller/v1',scope:'synthetic-test-controller-only',base_seal_sha256:inputs.sha256,files:await inventory(controller)};
  await json(join(controller,'input-seal.json'),ctrlSeal);const ctrl=await ref('controller/input-seal.json');
  const platform=(await parse(join(payload,'platform-receipt.json'))).platform;
  const target=await parse(join(payload,'platform-receipt.json'));
  const packages={schema_version:'dsh-first-purchase-host-artifacts-observed/v1',scope:'target-runtime-artifacts-with-query-source-http',input_sha256:hash(await readFile(join(payload,'input-v5.json'))),
    candidate_digest:candidate.candidate_digest,upstream_sha:DSH_UPSTREAM_SHA,
    packages:{workbench:{...workbench,installed_files:workbenchFiles},crm:{...crm,installed_files:crmFiles}},
    service_runtime:'independent-offline-saved-analysis-artifact',
    service:{archive_sha256:pair.artifacts.candidate.sha256,manifest_sha256:pair.artifacts.candidate.manifest_sha256,source_sha:candidate.source_sha,evidence_sha256:input.service_evidence_sha256,
      runtime_mode:'offline-hashed-wheel-install',wheels:target.artifacts.save.wheels,service_runtime:'independent-offline-saved-analysis-artifact',query_runtime:'independent-offline-query-artifact',release_ready:false,source_contract:'first-purchase-frozen-source/v1'},
    kernel:{...query,receipt_sha256:input.kernel_receipt_sha256,runtime_mode:'offline-hashed-wheel-install',source_contract:'first-purchase-frozen-source/v1',installed_wheels:target.artifacts.query.wheels},
    runtime:{artifact,release_manifest_sha256:input.runtime_manifest_sha256,installed_tree:{sha256:'a'.repeat(64),entries:1,bytes:42},platform:{system:'Linux',machine:'x86_64',node:'24.21.0'},scope:'isolated-runtime-artifact',supply_chain:'NOT_VERIFIED',release_ready:false},
    platform_wheel_evidence_sha256:input.platform_receipt_sha256,activation:'NOT_RUN',release_ready:false};
  await setJSON(results,T+'/plugin-artifacts/packages.json',packages);
  const pass=stage=>({stage,status:'PASS'}),command=(name,kind)=>({stage:'official-native-command',command:name,kind});
  const observations=[{stage:'official-host-loaded',pid:1000,generation:1},pass('missing-cookie-rejected'),pass('foreign-origin-rejected'),{stage:'missing-csrf-header-rejected',outcome:'CONNECTION_CLOSED'},
    pass('cookie-origin-csrf-and-login-bootstrap'),command('/first-purchase','error'),command('/first-purchase','success'),pass('official-query-summary-settled'),pass('official-fetch-save-ack-loss-reconcile-replay'),
    pass('same-save-intent-after-independent-service-restart'),pass('same-save-intent-after-independent-service-restart'),command('/first-purchase-status','success'),command('/first-purchase','success'),
    command('/first-purchase-cancel','error'),command('/first-purchase-cancel','success'),{stage:'official-host-restarted',pid:1001,generation:2},pass('durable-session-and-cookie-reused-crm-relogin-required'),
    command('/first-purchase-status','error'),command('/first-purchase-status','success'),pass('native-session-without-business-tools')];
  await setJSON(results,T+'/official-host/http-observations.json',{upstream_sha:DSH_UPSTREAM_SHA,observations,cleanup_ok:true,browser:'NOT_RUN',candidate_digest:candidate.candidate_digest,artifacts:packages,package_integrity:'PASS'});
  await setJSON(results,T+'/source-boundary.json',{scope:'artifact-official-host-query-source-http',source_contract:'first-purchase-frozen-source/v1',save_run_store_argument:null,query_worker_count:1,analysis_count:1,source_mode:'explicit-loopback-http',release_ready:false});
  const imports={'backend':'backend/__init__.py'};
  await setJSON(results,T+'/kernel-processes/processes.json',[2000,2001,2002].map((pid,i)=>({status:'KERNEL_SOCKET_BOUND',source_contract:'first-purchase-frozen-source/v1',pid,port:4335,manifest_sha256:query.manifest_sha256,source_sha:candidate.source_sha,imports,release_ready:false,exit_code:0,forced_kill:false,cleanup_ok:true,
    stopped:{status:'KERNEL_STOPPED',pid,imports,workers:i===0?[{event:'worker:spawned',pid:3000},{event:'worker:exited',pid:3000,exit_code:0}]:[],active_workers:0,integrity:'PASS'}})));
  await setJSON(results,T+'/save-owner/service-processes/processes.json',[4000,4001].map(pid=>({status:'SERVICE_SOCKET_BOUND',source_contract:'first-purchase-frozen-source/v1',query_runtime:'independent-offline-query-artifact',pid,port:4400,candidate_digest:candidate.candidate_digest,manifest_sha256:pair.artifacts.candidate.manifest_sha256,imports,
    scope:'saved-analysis-artifact-only',sqlite_scope:'saved-analysis-only',sqlite_files:['analyses/first_purchase_analyses.sqlite3'],release_ready:false,process_exited:true,forced_kill:false,cleanup_ok:true,exit_code:-15,openapi:'MATCHED',query_offline_replay:'PASS',restart_same_analysis:true,same_intent_replay:'PASS'})));
  await setJSON(results,'cleanup-verified.json',{stage:'OWNED_PROCESSES_EXITED',pids:[1000,1001,2000,2001,2002,3000,4000,4001],ports_closed:[4335,4336,4337,4400],base_input_files_unchanged:Object.keys(inputSeal.files).length,controller_files_unchanged:Object.keys(ctrlSeal.files).length,runtime_unchanged:true,production_listeners_unchanged:true});
  const ports=[6677,18090,18092,18093,18094].map(p=>`LISTEN 127.0.0.1:${p} fixture-pid`).join('\n');
  await setJSON(results,'protected-before.json',{ports});await setJSON(results,'protected-after-r2.json',{ports,unchanged:true});
  await setJSON(results,'host-r2/receipt.json',{schema_version:'dsh-first-purchase-runtime-host-observation/v1',scope:'actual-wsl2-synthetic-runtime-and-service-artifacts',status:'PASS',exit_code:0,seconds:80,platform,
    runtime_sha256:artifact.sha256,input_seal_sha256:inputs.sha256,controller_seal_sha256:ctrl.sha256,browser:'NOT_RUN',cross_version_recovery:'NOT_RUN',supply_chain:'NOT_VERIFIED',activation:'NOT_RUN',release_ready:false});
  await put(results,'host-r2/pytest.stdout','verifier-only fixture, not execution evidence\n1 passed\n');await put(results,'host-r2/pytest.stderr','');
  await json(join(results,'inventory.json'),await inventory(results));
  await json(join(evidence,'envelope.json'),{schema_version:'dsh-runtime-host-evidence/v1',inputs,controller:ctrl,inventory:await ref('results/inventory.json'),runtime_archive:await ref('runtime.tar.zst'),service_target_event:{seq:parent.seq,digest:parent.digest}});
}
