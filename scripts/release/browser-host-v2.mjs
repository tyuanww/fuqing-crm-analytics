/** Explicit archived browser v2 inputs. No browser/service launch or remote access. */
import assert from 'node:assert/strict';
import { dirname, join } from 'node:path';
import { mkdtemp, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { insideArtifact } from './service-artifact-evidence.mjs';
import { serviceDigest as hash } from './service-compatibility.mjs';
import { checkedSet } from './runtime-host-evidence.mjs';
import { checkReviewedControllerSources, checkArchivedControllerInstall, TERMINAL_CONTROLLER_REVIEWED } from './terminal-host-evidence.mjs';

export const BROWSER_HOST_V2_SCHEMA = 'dsh-browser-host-evidence/v2';
export const CURRENT_BROWSER_RESULT = 'browser-result';
export const CURRENT_BROWSER_RUNNER_SHA = '7a74101a608953e6d8d37f46c019aff40a8370125dc6c9f263ec956fc06482d4';
const CODE = 'PLUGIN_HOST_BROWSER_', exec = promisify(execFile);
const decode = bytes => JSON.parse(bytes.toString('utf8'));
const exact = (value, keys, code) => {
  assert.ok(value && typeof value === 'object' && !Array.isArray(value), CODE + code);
  assert.deepEqual(Object.keys(value).sort(), [...keys].sort(), CODE + code);
};
export async function readBrowserV2Inputs({ envelope, reference, directory, candidate }) {
  const input = await reference(envelope.inputs), controller = await reference(envelope.controller);
  exact(input, ['schema_version','scope','candidate_digest','controller_reviewed_commit','release_ready','files'], 'INPUT');
  assert.equal(input.schema_version, 'owned-current-candidate-browser-input/v1', CODE + 'INPUT');
  assert.equal(input.scope, 'synthetic-browser-only', CODE + 'INPUT');
  assert.equal(input.release_ready, false, CODE + 'UNPROVEN');
  assert.equal(input.candidate_digest, candidate.candidate_digest, CODE + 'CANDIDATE');
  assert.equal(input.controller_reviewed_commit, TERMINAL_CONTROLLER_REVIEWED, CODE + 'CONTROLLER');
  const inputRoot = join(directory, dirname(envelope.inputs.name));
  const content = await checkedSet(inputRoot, input.files, 160 * 1024 * 1024, 600);
  assert.equal(hash(content.get('controller/sources.json')), envelope.controller.sha256, CODE + 'CONTROLLER');
  assert.ok(content.has('controller/repo/scripts/dsh-b0/first-purchase-browser.probe.mjs'), CODE + 'PROBE_REQUIRED');
  await checkReviewedControllerSources(controller, content);
  const records = await checkedSet(join(directory, dirname(envelope.inventory.name)), await reference(envelope.inventory), 16 * 1024 * 1024);
  const required = name => { assert.ok(records.has(name), CODE + 'REQUIRED'); return records.get(name); };
  assert.equal(hash(required('input-seal.json')), envelope.inputs.sha256, CODE + 'INPUT_BINDING');
  assert.equal(hash(required('controller/sources.json')), envelope.controller.sha256, CODE + 'CONTROLLER');
  for (const [name, bytes] of records) if (content.has(name)) assert.deepEqual(bytes, content.get(name), CODE + 'ARCHIVED_INPUT');
  const payload = new Map([...content].filter(([p]) => p.startsWith('payload/')).map(([p,b]) => [p.slice(8),b]));
  assert.ok(!payload.has('input-v5.json'), CODE + 'DERIVED_INPUT');
  payload.set('input-v5.json', required('payload/input-v5.json'));
  const platform = decode(payload.get('platform-receipt.json'));
  assert.equal(platform.schema_version, 'source-http-target-observation/v2', CODE + 'SERVICE_SCHEMA');
  assert.equal(platform.candidate_digest, candidate.candidate_digest, CODE + 'CANDIDATE');
  assert.equal(platform.source_sha, candidate.service_compatibility.binding.source_sha, CODE + 'SERVICE_SOURCE');
  return { input, content, payload, payloadRoot:join(inputRoot,'payload'), records };
}

// These expected input hashes are checked against the archived observations. The
// original font/launcher bytes were not retrieved, so this is not a new execution.
export function expectedBrowserFontInputs(prefix) {
  return {
    'browser-fonts/fonts.conf': Buffer.from('<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "urn:fontconfig:fonts.dtd"><fontconfig><dir>/usr/share/fonts</dir><dir>' + prefix + '/browser-fonts/root/usr/share/fonts/opentype/noto</dir><cachedir>' + prefix + '/browser-fonts/cache</cachedir><match target="pattern"><test name="lang" compare="contains"><string>zh</string></test><edit name="family" mode="prepend"><string>Noto Sans CJK SC</string></edit></match></fontconfig>\n'),
    'browser-launch-r3.sh': Buffer.from('#!/bin/sh\nexport LD_LIBRARY_PATH=' + prefix + '/browser-libs/root/usr/lib/x86_64-linux-gnu\nexport FONTCONFIG_FILE=' + prefix + '/browser-fonts/fonts.conf\nexec ' + prefix + '/browser/chrome-linux64/chrome "$@"\n'),
  };
}
async function checkResultArchive({ envelope, directory, records, collection }) {
  exact(envelope.result_archive, ['name','sha256'], 'REFERENCE');
  const bytes = await insideArtifact(directory, envelope.result_archive.name, 4 * 1024 * 1024);
  assert.equal(hash(bytes), envelope.result_archive.sha256, CODE + 'RESULT_ARCHIVE');
  assert.equal(hash(bytes), collection.sha256, CODE + 'COLLECTION');
  assert.equal(bytes.length, collection.bytes, CODE + 'COLLECTION');
  assert.equal(collection.files, records.size + 1, CODE + 'COLLECTION');
  const root = await mkdtemp(join(tmpdir(), 'browser-observation-'));
  try {
    const archive = join(root, 'results.tar.gz'), output = join(root, 'unpacked');
    await writeFile(archive, bytes, {mode:0o600,flag:'wx'});
    await exec('python3', [join(import.meta.dirname,'secure-unpack.py'), archive, output,
      '--max-entries','500','--max-bytes','16777216'], {cwd:root,timeout:30000,maxBuffer:262144});
    const names = [];
    async function walk(path, prefix = '') {
      for (const row of await readdir(path, {withFileTypes:true})) {
        const name = prefix + row.name;
        if (row.isDirectory()) await walk(join(path,row.name),name+'/'); else names.push(name);
      }
    }
    await walk(output);
    assert.deepEqual(names.sort(), [...records.keys(),'results-inventory.json'].sort(), CODE + 'RESULT_INVENTORY');
    assert.equal(hash(await readFile(join(output,'results-inventory.json'))), envelope.inventory.sha256, CODE + 'RESULT_INVENTORY');
    for (const [name, content] of records) assert.deepEqual(await readFile(join(output,name)), content, CODE + 'RESULT_INVENTORY');
  } finally { await rm(root, {recursive:true,force:true}); }
}
export async function checkBrowserV2Completion({ envelope, reference, directory, records, content, payload, prefix, runtime, receipt }) {
  const data = name => { assert.ok(records.has(name), CODE + 'REQUIRED'); return decode(records.get(name)); };
  const runner = records.get('run.py');
  assert.ok(runner?.toString('utf8').startsWith("P='" + prefix + "'\n"), CODE + 'RUNNER_ROOT');
  const normalized = Buffer.from("P='OWNED_ROOT'\n" + runner.toString('utf8').split('\n').slice(1).join('\n'));
  assert.equal(hash(normalized), CURRENT_BROWSER_RUNNER_SHA, CODE + 'RUNNER');
  assert.deepEqual(data(CURRENT_BROWSER_RESULT + '/browser-preflight.stdout'), receipt.browser, CODE + 'BROWSER');
  checkArchivedControllerInstall({data,payload,prefix,resultDir:CURRENT_BROWSER_RESULT});
  for (const name of ['browser-preflight.stderr','controller-install.stderr'])
    assert.equal(records.get(CURRENT_BROWSER_RESULT + '/' + name)?.length, 0, CODE + 'INSTALL');
  const cleanup = data('cleanup-check.json');
  assert.deepEqual(cleanup, {production_listener_pid_snapshot_unchanged:true,current_unchanged:true,test_ports_closed:true,
    owned_processes_alive:[],runtime_sha256:runtime.artifact.sha256,sealed_files_unchanged:content.size}, CODE + 'CLEANUP');
  async function toolResult(ref) {
    const row = await reference(ref); exact(row, ['exit_code','stdout','stderr'], 'COMPLETION');
    assert.equal(row.exit_code, 0, CODE + 'COMPLETION'); assert.equal(row.stderr, '', CODE + 'COMPLETION');
    assert.equal(typeof row.stdout, 'string', CODE + 'COMPLETION'); return JSON.parse(row.stdout);
  }
  const collection = await toolResult(envelope.collection);
  exact(collection, ['cleanup','files','bytes','sha256'], 'COLLECTION');
  assert.deepEqual(collection.cleanup, cleanup, CODE + 'COLLECTION');
  await checkResultArchive({envelope,directory,records,collection});
  exact(envelope.completion_script, ['name','sha256'], 'REFERENCE');
  const cleanupBytes = await insideArtifact(directory, envelope.completion_script.name, 65536);
  assert.equal(hash(cleanupBytes), envelope.completion_script.sha256, CODE + 'COMPLETION_SCRIPT');
  assert.ok(cleanupBytes.toString('utf8').startsWith("P='"+prefix+"'\nARCHIVE_SHA='"+collection.sha256+"'\n"), CODE + 'COMPLETION_ROOT');
  const cleanupNormalized = "P='OWNED_ROOT'\nARCHIVE_SHA='RESULT_ARCHIVE'\n"+cleanupBytes.toString('utf8').split('\n').slice(2).join('\n');
  assert.equal(hash(cleanupNormalized), 'da098e44cdf772a39ec5534c151b2efead65520604373bacdb39918c67e0465b', CODE + 'COMPLETION_SCRIPT');
  const removed = await toolResult(envelope.completion);
  assert.deepEqual(removed, {owned_directory_removed:true,production_unchanged:true,evidence_retrieved_and_verified:true}, CODE + 'COMPLETION');
  const libraries = data('browser-library-receipt.json');
  assert.deepEqual(libraries.packages, [
    {package:'libnspr4',version:'2:4.35-1.1build1',sha256:'e579e72d091f6c7a13f5a756c31065b15aae5b81840d61b069355aa2283c07b4',method:'download-and-extract-only'},
    {package:'libnss3',version:'2:3.98-1ubuntu0.2',sha256:'4254f11d782dfb970e78113519a59d440112ed43c4b56f709da0aef81da8651a',method:'download-and-extract-only'},
  ], CODE + 'BROWSER_LIBRARIES');
  assert.equal(libraries.launcher_sha256, hash('#!/bin/sh\nexport LD_LIBRARY_PATH='+prefix+'/browser-libs/root/usr/lib/x86_64-linux-gnu\nexec '+prefix+'/browser/chrome-linux64/chrome "$@"\n'), CODE + 'BROWSER_LIBRARIES');
}
