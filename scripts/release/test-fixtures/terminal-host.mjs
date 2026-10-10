/** Verifier-only fixture: no Host, service, model or wheel is executed. */
import { cp, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { createRuntimeHostFixture, inventory, put, setJSON } from './runtime-host.mjs';
import { parse, json } from './service-artifacts.mjs';
import { bindSourceFixtureCandidate, refreshSourceInput } from './source-target.mjs';
import { verifyPluginService } from '../plugin-service-evidence.mjs';
import { readState } from '../state.mjs';
import { readGitInput } from '../../crm-calibration/package-service.mjs';
import { serviceDigest as hash } from '../service-compatibility.mjs';
import { RUNTIME_HOST_TEST_ROOT as OLD } from '../runtime-host-evidence.mjs';
import { TERMINAL_HOST_SCHEMA, TERMINAL_CONTROLLER_BASE, TERMINAL_CONTROLLER_REVIEWED, TERMINAL_REQUIRED_CODE } from '../terminal-host-evidence.mjs';
import { TERMINAL_TEST_ROOT as T } from '../terminal-recovery-records.mjs';
const ROOT = join(import.meta.dirname, '../../..');
export async function refreshTerminalInventory(root) {
  const dir = join(root,'terminal-evidence');
  await setJSON(dir,'results/inventory.json',await inventory(join(dir,'results'),['inventory.json']));
  const e = await parse(join(dir,'envelope.json')); e.inventory.sha256 = hash(await readFile(join(dir,'results/inventory.json')));
  await json(join(dir,'envelope.json'),e);
}
export async function createTerminalHostFixture(root) {
  await createRuntimeHostFixture(root);
  const candidate = await bindSourceFixtureCandidate(root, TERMINAL_CONTROLLER_BASE);
  await cp(join(root,'candidate/candidate.json'),join(root,'target-input/candidate.json'));
  const input = await parse(join(root,'target-input/input.json'));
  input.schema_version='synthetic-source-http-target-input/v2'; input.candidate_digest=candidate.candidate_digest;
  await json(join(root,'target-input/input.json'),input);
  for(const name of await readdir(join(root,'target-result'))) if(name.endsWith('.json')) {
    const path=join(root,'target-result',name),row=await parse(path);
    if(Object.hasOwn(row,'candidate_digest')) row.candidate_digest=candidate.candidate_digest;
    if(name==='receipt.json') row.schema_version='source-http-target-observation/v2';
    await json(path,row);
  }
  await refreshSourceInput(root);
  await verifyPluginService({candidatePath:join(root,'candidate/candidate.json'),statePath:join(root,'state.json'),
    evidencePath:join(root,'pair/receipt.json'),targetEvidencePath:join(root,'target-result/receipt.json'),targetInputPath:join(root,'target-input/input.json')});
  const parent=(await readState(join(root,'state.json'))).journal.at(-1);
  const dir=join(root,'terminal-evidence'),transfer=join(dir,'transfer'),results=join(dir,'results'),old=join(root,'evidence');
  await mkdir(transfer,{recursive:true});await mkdir(results);
  await cp(join(old,'runtime.tar.zst'),join(dir,'runtime.tar.zst'));
  const payload=join(transfer,'payload');await cp(join(old,'payload'),payload,{recursive:true});
  for(const name of ['input-seal.json','input-v5.json','platform-receipt.json']) await rm(join(payload,name));
  await cp(join(root,'candidate'),join(payload,'candidate'),{recursive:true});
  const sourceReceipt=await parse(join(root,'target-result/receipt.json'));
  await setJSON(results,'payload/platform-receipt.json',sourceReceipt);
  const manifest={schema_version:'dsh-first-purchase-host-artifacts/v5'},prefix='/tmp/owned-fp-terminal-fixture';
  for(const [key,name] of Object.entries({candidate:'candidate/candidate.json',crm_pack:'crm/plugin-pack.json',service_evidence:'pair/receipt.json',
    kernel_receipt:'query/receipt.json',runtime_manifest:'runtime-manifest.json',platform_receipt:'platform-receipt.json'})) {
    manifest[key+'_path']=prefix+'/payload/'+name;
    manifest[key+'_sha256']=hash(await readFile(key==='platform_receipt'?join(results,'payload',name):join(payload,name)));
  }
  manifest.runtime_archive_path=prefix+'/runtime.tar.zst';await setJSON(results,'payload/input-v5.json',manifest);
  const ns=['backend','backend/contracts','backend/semantic','backend/services','backend/services/analytics','backend/services/analytics/first_purchase','backend/tests'].map(p=>p+'/__init__.py');
  const controller={base_commit:TERMINAL_CONTROLLER_BASE,scope:'explicit-test-controller-with-local-v2-verifier-repair',files:{}};
  for(const name of [...new Set([...TERMINAL_REQUIRED_CODE,...ns])]) {
    const source=ns.includes(name)?'scripts/crm-calibration/service-namespace.py':name;
    const bytes=await readGitInput(ROOT,TERMINAL_CONTROLLER_REVIEWED,source);
    controller.files[name]={source,sha256:hash(bytes)}; await put(transfer,'controller/repo/'+name,bytes);
  }
  await setJSON(transfer,'controller/sources.json',controller);
  const wheels=sourceReceipt.artifacts.query.wheels;
  await setJSON(payload,'controller.json',{dependencies:Object.fromEntries(Object.entries(wheels).map(([name,row])=>[name,row.version]))});
  const seal={scope:'synthetic-terminal-only',release_ready:false,files:await inventory(transfer)};
  await setJSON(transfer,'input-seal.json',seal);await setJSON(results,'input-seal.json',seal);
  await setJSON(results,'controller/sources.json',controller);
  await put(results,'run.py',await readFile(join(ROOT,'scripts/release/test-fixtures/terminal-target-20261007.py.txt')));
  await cp(join(old,'results',OLD),join(results,T),{recursive:true});
  const packages=await parse(join(results,T,'plugin-artifacts/packages.json'));
  packages.candidate_digest=candidate.candidate_digest;packages.input_sha256=hash(await readFile(join(results,'payload/input-v5.json')));
  packages.packages.workbench.source_sha=candidate.source_sha;packages.platform_wheel_evidence_sha256=manifest.platform_receipt_sha256;
  const http=await parse(join(results,T,'official-host/http-observations.json'));
  http.artifacts=packages;http.candidate_digest=candidate.candidate_digest;
  http.admission='official commands/execute HTTP; browser rendering NOT_RUN';
  http.observations.push({stage:'official-native-command',command:'/first-purchase',kind:'success'},
    {stage:'official-host-restarted',pid:1002,generation:3},{stage:'same-save-intent-after-independent-service-restart',status:'PASS'});
  await setJSON(results,T+'/plugin-artifacts/packages.json',packages);await setJSON(results,T+'/official-host/http-observations.json',http);
  const session=(id,preset,types,assistant)=>({id,preset,count:types.length,digest:'a'.repeat(64),prefix_digest:'a'.repeat(64),assistant,
    events:types.map((type,seq)=>({seq,type}))});
  const before=session('session-first-purchase','owned-first-purchase',['turn/start','request/header'],['synthetic fixture']);
  const after=session(before.id,before.preset,['turn/start','request/header','step/end','turn/end','session/end-seed'],before.assistant);
  await setJSON(results,T+'/official-host/recovery-observations.json',{schema_version:'first-purchase-owned-recovery/v1',
    candidate_digest:candidate.candidate_digest,expected_business_recovery:'FAILED_SLOT_RELEASED',upstream_sha:http.upstream_sha,artifacts:packages,
    observations:[{stage:'current-candidate-inflight-crash',status:'PASS',killed_pid:1001,resumed_pid:1002,signal:'SIGKILL',committed:before,recovered:after,crm_relogin_required:true},
      {stage:'native-fallback-after-inflight-crash',status:'PASS',recovered:session('session-first-purchase-recovered-native','owned-native',['turn/start','assistant/message','turn/end'],['SYNTHETIC_CRASH_RECOVERY_OK'])}],
    cleanup_ok:true,package_integrity:'PASS',production_activation:'NOT_RUN',release_ready:false});
  await setJSON(results,T+'/interrupted-run.json',{schema_version:'analytics-run-first-purchase-path/v1',run_id:'run_'+'1'.repeat(32),
    version:4,last_sequence:4,created_at:'2026-10-07T00:00:00Z',updated_at:'2026-10-07T00:00:01Z',deadline:'2026-10-07T00:02:00Z',limitations:['synthetic verifier fixture'],
    status:'FAILED',phase:'FINALIZING',source_kind:'CHAT',source_ref:'conv_'+'2'.repeat(32),conversation_id:'conv_'+'2'.repeat(32),
    parent_run_id:null,result:null,evidence_digest:null,primary_result_ref:null,evidence_refs:[],answer_mode:'DETERMINISTIC_TOOL',
    diagnostics:{attempt_id:'attempt_'+'3'.repeat(32),profile_version:'b0-run-resource/v1',profile_hash:'a'.repeat(64),
      runtime_status:'EXITED',execution_active:false,error_code:'EXECUTION_UNKNOWN',dispatch_attempts:1,tool_steps_used:0}});
  const save=await parse(join(results,T,'save-owner/service-processes/processes.json'));
  for(const row of save)row.candidate_digest=candidate.candidate_digest;
  await setJSON(results,T+'/save-owner/service-processes/processes.json',save);
  const sourceInput=await parse(join(root,'target-input/input.json'));
  await setJSON(results,'source/input/input.json',sourceInput);
  await setJSON(results,'cleanup-check.json',{production_listener_pid_snapshot_unchanged:true,current_unchanged:true,test_ports_closed:true,
    owned_processes_alive:[],runtime_sha256:packages.runtime.artifact.sha256,sealed_files_unchanged:Object.keys(seal.files).length,
    source_input_files_unchanged:Object.keys(sourceInput.files).length});
  await setJSON(results,'host-result/controller-install.stdout',{python:prefix+'/host-result/venv/bin/python',mode:'offline-hashed-wheel-install',wheels});
  await put(results,'host-result/controller-install.stderr','');await put(results,'host-result/pytest.stderr','');
  await put(results,'host-result/pytest.stdout','verifier-only fixture; no execution evidence\n1 passed\n');
  await setJSON(results,'host-result/receipt.json',{schema_version:'first-purchase-terminal-target/v1',status:'PASS',exit_code:0,seconds:80,
    candidate_digest:candidate.candidate_digest,plugin_source:candidate.source_sha,service_source:candidate.service_compatibility.binding.source_sha,
    platform:sourceReceipt.platform,runtime_sha256:packages.runtime.artifact.sha256,production_identity:'NOT_RUN',supply_chain:'NOT_VERIFIED',activation:'NOT_RUN',release_ready:false});
  await setJSON(results,'inventory.json',await inventory(results));
  const ref=async name=>({name,sha256:hash(await readFile(join(dir,name)))});
  await setJSON(dir,'envelope.json',{schema_version:TERMINAL_HOST_SCHEMA,inputs:await ref('transfer/input-seal.json'),controller:await ref('transfer/controller/sources.json'),
    inventory:await ref('results/inventory.json'),runtime_archive:await ref('runtime.tar.zst'),service_target_event:{seq:parent.seq,digest:parent.digest}});
}
