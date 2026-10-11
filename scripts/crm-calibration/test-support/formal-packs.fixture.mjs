/** Synthetic sealed-pack inputs for contract tests; package code must never execute. */
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
const exec = promisify(execFile), hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = value => JSON.stringify(value, null, 2) + '\n';
export const specs = {
  crm: { id: '@shine-mage/dsh-crm-knowledge', exports: { '.': './lib/index.js', './host': './lib/host.js', './client': './lib/client.js' } },
  knowledge: { id: '@shine-mage/dsh-knowledge', exports: { '.': './lib/index.js', './graph-tools': './lib/graph-tools.js' } },
  page: { id: '@shine-mage/dsh-analytics-workbench-b0', exports: { './page-tools': './lib/page-tools.js', './client': './lib/client.js' } },
};
for (const name of ['brand', 'waterfall', 'crowd-action', 'query', 'board', 'funnel']) {
  specs[name] = { id: `@shine-mage/dsh-shine-${name}`, leaf: true,
    exports: { '.': './lib/index.js', './client': './lib/client.js',
      ...(['funnel', 'waterfall'].includes(name) ? { [`./${name}`]: {
        types: `./lib/${name}.d.mts`, import: `./lib/${name}.mjs`, default: `./lib/${name}.mjs`,
      } } : {}) } };
}
const exportFiles = value => typeof value === 'string' ? [value.slice(2)] : Object.values(value).flatMap(exportFiles);

export async function fixture(t, selected = ['crm', 'knowledge', 'page'], mutate = () => {}) {
  const root = await mkdtemp(join(tmpdir(), 'crm-formal-profile-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const profile = { schema_version: 'dsh-profile/v1', profile_id: 'synthetic-crm-profile',
    dsh: { sdk_version: '0.1.7-rc.2', upstream_sha: '477b4f420553e8a52c2fbccc464d7561b239c443' }, plugins: [] };
  const inputs = { schema_version: 'dsh-profile-pack-inputs/v1', profile: { path: 'profile.json' }, plugins: [] };
  for (const [index, domain] of selected.entries()) {
    const spec = specs[domain], staging = join(root, 'staging', domain), directory = join(root, 'packs', domain);
    await mkdir(join(staging, 'package/lib'), { recursive: true });
    await mkdir(directory, { recursive: true });
    const manifest = { name: spec.id, type: 'module', version: '0.0.0-fixture', exports: structuredClone(spec.exports),
      files: [...new Set(exportFiles(spec.exports))],
      peerDependencies: { '@deepseek-ai/dsh-tools': '0.1.7-rc.2', ...(domain === 'page' || spec.leaf ? {} : { '@deepseek-ai/cordis': '4.0.2' }) },
      ...(spec.leaf || domain === 'page' ? { dsh: { client: { platform: 'web', inject: [] } } } : {}),
      ...(domain === 'page' || spec.leaf ? {} : { shinemage: { plugin_domain: domain, composition_contract: 'crm-knowledge-split/v1' } }) };
    mutate(manifest, domain);
    await writeFile(join(staging, 'package/package.json'), json(manifest));
    for (const entry of new Set([...manifest.files, ...exportFiles(manifest.exports)])) {
      await mkdir(join(staging, 'package', entry, '..'), { recursive: true });
      await writeFile(join(staging, 'package', entry), 'throw new Error("synthetic profile preparation must never execute this package");\n');
    }
    const tarName = `${manifest.name.slice(1).replaceAll('/', '-')}-${manifest.version}.tgz`;
    await exec('tar', ['-czf', join(directory, tarName), '-C', staging, 'package'], { env: { ...process.env, COPYFILE_DISABLE: '1' } });
    const archive = await readFile(join(directory, tarName));
    const receipt = { schema_version: 'dsh-plugin-pack/v1', package_name: manifest.name, package_version: manifest.version,
      dsh_pin: '0.1.7-rc.2', source_sha: String(index + 1).repeat(40), source_dirty: false,
      tarball: { name: tarName, bytes: archive.length, sha256: hash(archive) },
      entries: ['package.json', ...new Set([...manifest.files, ...exportFiles(manifest.exports)])].sort(),
      activation: 'NOT_RUN', state_path: 'NOT_APPLICABLE_PLUGIN_PACK_ONLY' };
    const receiptBytes = Buffer.from(json(receipt));
    await writeFile(join(directory, 'plugin-pack.json'), receiptBytes);
    inputs.plugins.push({ id: manifest.name, manifest: `packs/${domain}/plugin-pack.json`, sha256: hash(receiptBytes) });
    profile.plugins.push({ id: manifest.name, path: `dsh-plugins/absent-${domain}`, build: 'build.mjs', enabled: true });
  }
  await rm(join(root, 'staging'), { recursive: true });
  const profileBytes = Buffer.from(json(profile));
  await writeFile(join(root, 'profile.json'), profileBytes);
  inputs.profile.sha256 = hash(profileBytes);
  const packInputs = join(root, 'inputs.json');
  await writeFile(packInputs, json(inputs));
  return { root, profile, inputs, packInputs, output: join(root, 'assets') };
}
