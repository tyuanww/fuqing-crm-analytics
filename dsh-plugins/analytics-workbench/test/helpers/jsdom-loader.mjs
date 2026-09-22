import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(here, '../../../..');

const candidates = [
  process.env.B0_BUILD_UPSTREAM,
  join(repoRoot, '.context/dsh-b0/upstream'),
  '/Users/hutou/Desktop/ai-engineering/历史项目/fuqin-date/fuqing-crm-analytics/.context/dsh-b0/upstream',
].filter(Boolean);

export function loadJsdom() {
  for (const root of candidates) {
    const pkg = join(root, 'node_modules/jsdom/package.json');
    if (!existsSync(pkg)) continue;
    const loaded = createRequire(pkg)('jsdom');
    return loaded.JSDOM;
  }
  throw new Error('JSDOM_MISSING');
}

export function repoCheckDir() {
  return join(repoRoot, '.context/checks/validation-rollout');
}

export function writeCheckReport(name, data) {
  const dir = repoCheckDir();
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, name), `${JSON.stringify(data, null, 2)}\n`);
  return join(dir, name);
}
