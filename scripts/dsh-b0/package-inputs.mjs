/** Public fixed-package input check; the old source-wide binder is explicit legacy. */
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readDomainComposition } from './domain-package-inputs.mjs';
const owned = await mkdtemp(join(tmpdir(), 'domain-public-inputs-'));
try {
  const result = await readDomainComposition({ archivePath: process.env.DOMAIN_AUTHOR_CI_ARCHIVE,
    packageInputs: process.argv[2] ?? process.env.DSH_PACKAGE_INPUTS,
    pageInputsPath: process.env.CRM_COMPOSITION_PAGE_INPUTS, python: process.env.FQ_B0_PYTHON, output: join(owned, 'published') });
  console.log(JSON.stringify({ scope: 'actual-formal-consumer-inputs', source: result.evidence.source_sha,
    packages: result.lockSource.packages, private_source_execution: 'NOT_RUN_AUTHOR_OWNED', release_ready: false }));
} finally { await rm(owned, { recursive: true, force: true }); }
