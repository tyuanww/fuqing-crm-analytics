/** Old public subpaths must work with only their published JS/types present. */
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadLeafComposition } from './leaf-pack-inputs.mjs';

const runtime = await loadLeafComposition({ scope: 'geometry', types: true });
after(() => runtime.dispose());
const { ts } = runtime;
for (const name of ['funnel', 'waterfall']) {
  test(`legacy ${name} export remains usable by ESM, Node require and TypeScript`, async t => {
    const root = await mkdtemp(join(tmpdir(), 'legacy-geometry-exports-'));
    t.after(() => rm(root, { recursive: true, force: true }));
    const source = runtime.packages.get(`@shine-mage/dsh-shine-${name}`).root;
    const plugin = join(root, 'node_modules/@shine-mage', `dsh-shine-${name}`);
    await mkdir(join(plugin, 'lib'), { recursive: true });
    for (const file of ['package.json', `lib/${name}.mjs`, `lib/${name}.d.mts`]) await copyFile(join(source, file), join(plugin, file));
    const specifier = `@shine-mage/dsh-shine-${name}/${name}`;
    for (const code of [
      `const { ${name}Geometry } = require('${specifier}'); if (${name}Geometry(null) !== null) throw new Error('geometry');`,
      `const { ${name}Geometry } = await import('${specifier}'); if (${name}Geometry(null) !== null) throw new Error('geometry');`,
    ]) execFileSync(process.execPath, ['-e', code], { cwd: root, timeout: 10000, stdio: 'pipe' });
    const input = join(root, 'consumer.mts');
    await writeFile(input, `import { ${name}Geometry, type ${name[0].toUpperCase() + name.slice(1)}Geometry } from '${specifier}';
const value: ${name[0].toUpperCase() + name.slice(1)}Geometry | null = ${name}Geometry(null);
// @ts-expect-error do not degrade the published type to any
value.imaginary;`);
    const program = ts.createProgram([input], { strict: true, noEmit: true, skipLibCheck: false,
      module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2023, types: [] });
    assert.equal(ts.getPreEmitDiagnostics(program).length, 0, 'legacy declaration cannot require the domain library at runtime or as a sibling source');
  });
}
