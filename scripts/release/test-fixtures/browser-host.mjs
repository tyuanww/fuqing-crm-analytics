/** Parser-only records. No browser, runtime or service is executed by this fixture. */
import { cp, readFile, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { createRuntimeHostFixture, inventory, put, setJSON } from './runtime-host.mjs';
import { parse, json } from './service-artifacts.mjs';
import { serviceDigest as hash } from '../service-compatibility.mjs';
import { verifyPluginHost } from '../plugin-host-evidence.mjs';
import { readState } from '../state.mjs';
import { RUNTIME_HOST_TEST_ROOT as OLD, RUNTIME_HOST_SOURCE } from '../runtime-host-evidence.mjs';
import { BROWSER_TEST_ROOT as T, BROWSER_ROWS } from '../browser-host-evidence.mjs';
const ROOT = join(import.meta.dirname, '../../..');
export async function refreshBrowserInventory(root) {
  const dir = join(root,'browser-evidence'), index = join(dir,'results/inventory.json');
  await json(index, await inventory(dirname(index),['inventory.json']));
  const envelope = await parse(join(dir,'envelope.json'));envelope.inventory.sha256=hash(await readFile(index));
  await json(join(dir,'envelope.json'),envelope);
}
export async function createBrowserHostFixture(root) {
  await createRuntimeHostFixture(root);
  await verifyPluginHost({candidatePath:join(root,'candidate/candidate.json'),evidencePath:join(root,'evidence/envelope.json'),statePath:join(root,'state.json')});
  const parent=(await readState(join(root,'state.json'))).journal.at(-1), old=join(root,'evidence');
  const dir=join(root,'browser-evidence'), inputRoot=join(dir,'transfer'), controller=join(dir,'controller'),results=join(dir,'results');
  await mkdir(inputRoot,{recursive:true});await mkdir(results);
  await cp(join(old,'payload'),join(inputRoot,'payload'),{recursive:true});
  await cp(join(old,'controller'),controller,{recursive:true});await cp(join(old,'runtime.tar.zst'),join(dir,'runtime.tar.zst'));
  const input=await parse(join(inputRoot,'payload/input-v5.json')),prefix='/tmp/owned-fp-browser-fixture';
  for(const [k,v] of Object.entries(input))if(k.endsWith('_path'))input[k]=v.replace('/tmp/owned-fp-runtime-fixture',prefix);
  await json(join(inputRoot,'payload/input-v5.json'),input);
  for(const name of ['playwright','playwright-core'])await setJSON(inputRoot,`browser-driver/node_modules/${name}/package.json`,{name,version:'1.62.1'});
  const inputSeal={schema_version:'owned-first-purchase-browser-inputs/v1',scope:'synthetic-only',runtime_sha256:parent.observation.runtime_sha256,
    browser_version:'151.0.7922.34',playwright_version:'1.62.1',controller_source:RUNTIME_HOST_SOURCE,
    controller_override:['scripts/dsh-b0/first-purchase-browser.probe.mjs'],files:await inventory(inputRoot),release_ready:false};
  await json(join(inputRoot,'input-seal.json'),inputSeal);
  await put(controller,'repo/scripts/dsh-b0/first-purchase-browser.probe.mjs',await readFile(join(ROOT,'scripts/dsh-b0/first-purchase-browser.probe.mjs')));
  const ctrl={schema_version:'owned-browser-controller/v1',base_input_sha256:hash(await readFile(join(inputRoot,'input-seal.json'))),files:await inventory(controller,['input-seal.json'])};
  await json(join(controller,'input-seal.json'),ctrl);
  const http=await parse(join(old,'results',OLD,'official-host/http-observations.json'));
  http.observations=http.observations.slice(0,5);http.admission='official native composer slash command in Chrome';
  http.artifacts.input_sha256=hash(await readFile(join(inputRoot,'payload/input-v5.json')));
  const browser={rows:BROWSER_ROWS,errors:[],driver:'Chrome headless',browser_version:'151.0.7922.34',platform:'linux',locale:'zh-CN'};
  http.browser={ok:true,browser:'Chrome headless',browser_version:browser.browser_version,platform:'linux',locale:'zh-CN',rows:BROWSER_ROWS};
  await setJSON(results,T+'/official-host/http-observations.json',http);await setJSON(results,T+'/official-host/browser-observations.json',browser);
  for(const name of ['source-boundary.json','kernel-processes/processes.json','save-owner/service-processes/processes.json'])
    await put(results,T+'/'+name,await readFile(join(old,'results',OLD,name)));
  const save=await parse(join(results,T,'save-owner/service-processes/processes.json'));
  save[1].query_offline_replay='NOT_RUN';save[1].same_intent_replay='NOT_RUN_BROWSER_MODE';await json(join(results,T,'save-owner/service-processes/processes.json'),save);
  // Intentionally only a PNG header for attachment-shape validation, never a real screenshot.
  const png=Buffer.alloc(32);Buffer.from('89504e470d0a1a0a','hex').copy(png);png.write('IHDR',12);png.writeUInt32BE(1280,16);png.writeUInt32BE(900,20);
  for(const name of ['browser-saved.png','browser-native.png'])await put(results,T+'/official-host/'+name,png);
  const font={status:'PASS',package:{package:'fonts-noto-cjk',version:'1:20230817+repack1-3',bytes:61229778,sha256:'7d64b985f6fe128c99eae5610d5c047338e572bdcfb2bb09736be01b824a7f6c'},
    method:'download-and-extract-only',system_install:'NOT_RUN',fc_match:'Noto Sans CJK SC: '+prefix+'/browser-fonts/root/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc',files:{}};
  for (const file of ['NotoSansCJK-Bold.ttc','NotoSerifCJK-Regular.ttc','NotoSerifCJK-Bold.ttc','NotoSansCJK-Regular.ttc'])
    font.files['browser-fonts/root/usr/share/fonts/opentype/noto/'+file]={bytes:42,sha256:'a'.repeat(64)};
  for (const name of ['browser-fonts/fonts.conf','browser-launch-r3.sh']) {
    const bytes=Buffer.from('synthetic parser fixture only, never executed');await put(results,name,bytes);
    font.files[name]={bytes:bytes.length,sha256:hash(bytes)};
  }
  await setJSON(results,'chrome.zip.download.json',{exit_code:0,stderr:'',source:'https://cdn.playwright.dev/builds/cft/151.0.7922.34/linux64/chrome-linux64.zip',
    sha256:'ae8736ac28bc69278551500f219fc749575648263c43ec5990749eff43b9fcf8',bytes:193282658});
  await setJSON(results,'browser-library-receipt.json',{status:'PASS',system_install:'NOT_RUN',missing_libraries:[]});
  await setJSON(results,'browser-font-receipt.json',font);
  await setJSON(results,'cleanup-check-r3.json',{font_input_files_unchanged:6,status:'PASS',sealed_files_unchanged:Object.keys(inputSeal.files).length,
    controller_r2_files_unchanged:Object.keys(ctrl.files).length,runtime_unchanged:true,protected_listeners_unchanged:true,test_ports_closed:true,processes_with_owned_cwd_or_executable:[],release_ready:false});
  await setJSON(results,'browser-r3/receipt.json',{schema_version:'dsh-first-purchase-browser-observation/v1',status:'PASS',exit_code:0,seconds:80,
    scope:'actual-wsl2-synthetic-runtime-artifacts-browser',platform:(await parse(join(old,'results/host-r2/receipt.json'))).platform,
    controller_sha256:hash(await readFile(join(controller,'input-seal.json'))),input_sha256:ctrl.base_input_sha256,runtime_sha256:parent.observation.runtime_sha256,
    browser:{version:browser.browser_version,platform:'linux',uid:65534,scope:'target-browser-readiness-only'},font_receipt_sha256:hash(await readFile(join(results,'browser-font-receipt.json'))),
    playwright_version:'1.62.1',headless:true,mobile:'NOT_RUN',accessibility:'NOT_RUN',cross_version_recovery:'NOT_RUN',production_identity:'NOT_RUN',supply_chain:'NOT_VERIFIED',activation:'NOT_RUN',release_ready:false});
  await put(results,'browser-r3/pytest.stdout','synthetic parser fixture only\n1 passed\n');await put(results,'browser-r3/pytest.stderr','');
  await setJSON(dir,'completion.json',{status:'PASS',owned_root:prefix,owned_root_removed:true,production_listeners_unchanged:true,test_ports_closed:true,evidence_sha256:'a'.repeat(64),system_install:'NOT_RUN',production_activation:'NOT_RUN'});
  await json(join(results,'inventory.json'),await inventory(results));
  const ref=async name=>({name,sha256:hash(await readFile(join(dir,name)))});
  await json(join(dir,'envelope.json'),{schema_version:'dsh-browser-host-evidence/v1',inputs:await ref('transfer/input-seal.json'),controller:await ref('controller/input-seal.json'),
    inventory:await ref('results/inventory.json'),completion:await ref('completion.json'),runtime_archive:await ref('runtime.tar.zst'),runtime_host_event:{seq:parent.seq,digest:parent.digest}});
}
