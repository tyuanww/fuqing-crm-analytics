/** Generate only the candidate consumer's HTTP types; no legacy CRM process. */
import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const deps = process.argv[2] ?? join(root, 'dsh-plugins/analytics-workbench/build-tools');
const req = createRequire(join(resolve(deps), 'package.json'));
assert.equal(req('typescript').version, '6.0.3');
assert.equal(JSON.parse(await readFile(req.resolve('openapi-typescript/package.json'))).version, '7.13.0');
const { default: openapiTS, astToString } = req('openapi-typescript');
const schema = JSON.parse(await readFile(join(root, 'backend/contracts/crm-metrics.openapi.json')));
const text = astToString(await openapiTS(schema, { alphabetize: true }));
const target = join(root, 'dsh-plugins/crm-knowledge/src/http-contract.generated.d.ts');
if (process.argv.includes('--check')) assert.equal(await readFile(target, 'utf8'), text, 'HTTP type drift');
else await writeFile(target, text);
console.log('CRM candidate HTTP types agree with OpenAPI');
