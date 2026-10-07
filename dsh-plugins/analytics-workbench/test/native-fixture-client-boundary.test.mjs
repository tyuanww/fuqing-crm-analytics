import { upstream } from './helpers/sdk-inputs.mjs';
/** Execute the pinned client's package scan against the actual test helper paths. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { join } from 'node:path';

const plugin = fileURLToPath(new URL('..', import.meta.url));
const moduleEntry = join(upstream, 'packages/client/modules/lib/index.js');
const { Context } = createRequire(moduleEntry)('@deepseek-ai/cordis');
const { ClientModuleRegistry } = await import(pathToFileURL(moduleEntry).href);

for (const helper of ['native-composition-diagnostic.mjs', 'native-composition-history.mjs']) {
  test(`${helper} cannot reactivate the business client when its host entry is disabled`, async () => {
    const ctx = new Context();
    ctx.baseUrl = pathToFileURL(`${plugin}/`).href;
    ctx.provide('loader', { *entries() {
      const parent = { tree: { ctx } };
      yield { options: { name: '@shine-mage/dsh-analytics-workbench-b0' }, disabled: true, parent };
      yield { options: { name: pathToFileURL(join(plugin, 'test/helpers', helper)).href },
        disabled: false, fiber: {}, parent };
    } });
    ctx.provide('webServer', { register: () => () => {} });
    try {
      // Uses real nearest-package resolution and composition, not a copied scanner.
      const registry = new ClientModuleRegistry(ctx);
      assert.deepEqual(registry.graph().entries, []);
      assert.equal(registry.clientPath('@shine-mage/dsh-analytics-workbench-b0'), undefined);
    } finally { ctx.fiber.dispose(); }
  });
}

test('fixture package is private and host-only; shipped business client declaration remains intact', () => {
  const fixtures = JSON.parse(readFileSync(join(plugin, 'test/helpers/package.json'), 'utf8'));
  const business = JSON.parse(readFileSync(join(plugin, 'package.json'), 'utf8'));
  assert.equal(fixtures.private, true);
  assert.equal(fixtures.name, '@shine-mage/analytics-test-helpers');
  assert.equal(fixtures.dsh, undefined);
  assert.equal(business.dsh.client.platform, 'web');
  assert.equal(business.exports['./client'], './lib/client.js');
  assert.ok(!business.files.some(path => path.startsWith('test')));
});
