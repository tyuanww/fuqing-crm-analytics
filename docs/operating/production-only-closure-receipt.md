# Production-only closure receipt

Machine-checked evidence for the `deletion_gate` reason
`production_only_closure_not_recorded`. It records one rehearsal of
`origin/main` with the ten P4 source trees removed: profile inputs, the
composition manifest, the pack readers, the backend/kernel imports, a
production-only install, the sealed consumer install and the release payload
all passed. It deliberately does **not** clear `remote_main_not_verified`
and does not claim a real production host.

- Tested ref: `origin/main`
- Commit: `8bb713e86277dae0b800e2d86ab6eabb88386221` (2026-11-05T21:52:56+08:00)
- Verdict: **PASS**
- Install mode: `PRODUCTION_ONLY`
- Absence boundary: S1/S2/S3/S5 delete exactly the ten plugin source trees; dsh-plugins/{contracts,plugin-kit} stay in main, query-agent stays under the S4 retention decision, and locks, manifests, profiles, packs and release scripts are retained.

## Checks

| Check | Status |
|---|---|
| `ref_materialized` | PASS |
| `plugin_sources_removed` | PASS |
| `retained_plugin_trees` | PASS |
| `profile_inputs_from_lock` | PASS |
| `composition_manifest_from_lock` | PASS |
| `business_profile_rederived` | PASS |
| `backend_source_paths` | PASS |
| `kernel_manifest_files` | PASS |
| `node_pack_reader_imports` | PASS |
| `python_backend_imports` | PASS |
| `artifact_lock_binding` | PASS |
| `sealed_packs_validated` | PASS |
| `main_production_install` | PASS |
| `release_payload_installed` | PASS |
| `consumer_pack_imports` | PASS |

## Inputs

| Input | Path / id | SHA-256 |
|---|---|---|
| lock | `config/shinemage-composition-packs.lock.json` | `81a10f70e7f4a220676cdfb0e15a4422e6ceef65988cf0406452bd965adb2842` |
| manifest | `config/shinemage-composition-pack-manifest.v1.json` | `0dc8070def4a271f4ba3e005c8bdd246076fde81551dc30a5a72d6efbc83a794` |
| artifact lock | `config/shinemage-composition-artifact.lock.json` | `5fcd381b564bc60fcf0e0f83d54f863199b262c2414b9b9f4b9e1d67a28e0493` |
| sealed artifact | `id 13417537931 / run 42035243845` | `b1fb2976c6299136224240422f5f64a701e36100ecd73ef40b234a235b358589` |

## Environment

| Field | Value |
|---|---|
| node | `v24.19.0` |
| pnpm | `11.28.2` |
| python | `3.14.8` |
| platform | `darwin` |
| arch | `arm64` |
| install_mode | `PRODUCTION_ONLY` |
| commit_date | `2026-11-05T21:52:56+08:00` |

## What this proves

- `git archive` of `8bb713e86277dae0b800e2d86ab6eabb88386221` contains no `.git` and no untracked files; the rehearsal never touched the caller's worktree.
- The ten deleted trees were removed from the temp copy with `rm -rf`; the retained `contracts`, `plugin-kit` and `query-agent` trees were asserted to survive.
- Both profile digests, the business-profile re-derivation, the source-manifest/lock binding and all nine pack manifest/pack digests were read from the locks, not from plugin source.
- The pack readers and 16 backend/kernel modules imported from the copied tree with plugin sources absent.
- `pnpm install --prod --frozen-lockfile` installed the main tree without dev dependencies; the nine sealed packs installed into a fresh consumer with peers and imported their server entrypoints.
- `prepareReleasePayload` re-installed every pack and every runtime byte matched `verifyReleasePackBinding`; `activation` stayed `NOT_RUN`.

## Reproduce

```bash
node scripts/release/production-only-closure.mjs --ref origin/main \
  --artifact <sealed-artifact.zip> --python <python3.14> \
  --receipt docs/operating/production-only-closure-receipt.md
```

The network/pnpm install stage is expected to run in CI (or on a network-
connected host). `--skip-install` exercises only the deterministic copy,
absence, lock and import checks; a committed receipt must be a full PASS.

## What remains unproven

- real production host: no host was started, no profile was activated, no business data was read
- host activation: activation stays NOT_RUN; pack bytes were installed and imported only
- company-runner M2-07 closure: this receipt does not replace the company production-only consumer closure gate
- remote main verification: the sealed artifact was downloaded from the locked run; this rehearsal does not dispatch main

<!-- production-only-closure-receipt:begin -->
```json
{
  "schema_version": "shinemage-production-only-closure-receipt/v1",
  "verdict": "PASS",
  "ref": "origin/main",
  "commit": "8bb713e86277dae0b800e2d86ab6eabb88386221",
  "tree": "4ea2c2d09fa6c7dc5e6f98093abb89557a5710fa",
  "absence": {
    "simulated_absent": [
      "analytics-workbench",
      "board-components",
      "crm-knowledge",
      "knowledge",
      "shine-board",
      "shine-brand",
      "shine-crowd-action",
      "shine-funnel",
      "shine-query",
      "shine-waterfall"
    ],
    "retained": [
      "contracts",
      "plugin-kit",
      "query-agent"
    ],
    "boundary": "S1/S2/S3/S5 delete exactly the ten plugin source trees; dsh-plugins/{contracts,plugin-kit} stay in main, query-agent stays under the S4 retention decision, and locks, manifests, profiles, packs and release scripts are retained."
  },
  "inputs": {
    "lock": {
      "path": "config/shinemage-composition-packs.lock.json",
      "sha256": "81a10f70e7f4a220676cdfb0e15a4422e6ceef65988cf0406452bd965adb2842"
    },
    "manifest": {
      "path": "config/shinemage-composition-pack-manifest.v1.json",
      "sha256": "0dc8070def4a271f4ba3e005c8bdd246076fde81551dc30a5a72d6efbc83a794"
    },
    "artifact_lock": {
      "path": "config/shinemage-composition-artifact.lock.json",
      "sha256": "5fcd381b564bc60fcf0e0f83d54f863199b262c2414b9b9f4b9e1d67a28e0493",
      "id": 13417537931,
      "run_id": 42035243845,
      "head_sha": "b29a84f3ac18ab2b499e8752fada47fbe4feed76",
      "artifact_sha256": "b1fb2976c6299136224240422f5f64a701e36100ecd73ef40b234a235b358589",
      "composition_lock_sha256": "81a10f70e7f4a220676cdfb0e15a4422e6ceef65988cf0406452bd965adb2842"
    },
    "artifact_zip_sha256": "b1fb2976c6299136224240422f5f64a701e36100ecd73ef40b234a235b358589",
    "profiles": [
      {
        "name": "crm",
        "path": "config/dsh-profile.crm-knowledge.rc3.json",
        "sha256": "9a8591fd8434b08f584529a3f4dcd5d175c54ab71d2cbe340231cfb31c9c365b"
      },
      {
        "name": "page",
        "path": "config/dsh-profile.rc3.json",
        "sha256": "4eee5436d11c43eab997f99534e4cd6b58dd69d47cf8833748b2e3d2af1d0569"
      }
    ],
    "sources": [
      {
        "id": "@shine-mage/dsh-analytics-workbench-b0",
        "directory": "analytics-workbench",
        "sha": "ae922fa3ff80c238d47bee7c8cbed1705b55f836",
        "manifest_sha256": "735092d62e77b7533435aa475c4b297913e1f3b9f832efa70f20a2eb8ca061af",
        "pack_sha256": "f83a65a48900b6b51a9b59ceb8ea6bbb0a4d456800c41499f72651d8155c7017"
      },
      {
        "id": "@shine-mage/dsh-crm-knowledge",
        "directory": "crm-knowledge",
        "sha": "86ff10b9926c4e393829ad3bccbfad43a028158f",
        "manifest_sha256": "fc760439b84a9576a34cb324b06937c11c4aa5de70286ccf831a2db1893e9cfe",
        "pack_sha256": "aede350861b4d94002fd2e1bf15630408ad0c24d578b03fc48250bb3f2d7da03"
      },
      {
        "id": "@shine-mage/dsh-knowledge",
        "directory": "knowledge",
        "sha": "902a1b41307c0c88a3b29c91294ca416bc0d00b7",
        "manifest_sha256": "6f5e1e8c3a6a6183829717dfeb5cffbace0911d5c07ad1244b1dd04b8cd60c4e",
        "pack_sha256": "69c65831b9daa55e7fa063729bf7ff8ddf1cbe83b62cfd16e5224e5181814b56"
      },
      {
        "id": "@shine-mage/dsh-shine-board",
        "directory": "shine-board",
        "sha": "97885ddfdfca8efa779c06b00e9ee61d0d05dbf9",
        "manifest_sha256": "948df5481cb287a79d2564b8d3b0481b11f53d01d231e3c0738da9986b421705",
        "pack_sha256": "a6133269183215f7bb32f40f81e7e42f65e2b0f31c9536bef7f06673215ca38c"
      },
      {
        "id": "@shine-mage/dsh-shine-crowd-action",
        "directory": "shine-crowd-action",
        "sha": "dc6f0d2c2bf18eb6d29cb1117c004b462485a0d2",
        "manifest_sha256": "c5d64539536619fa62e9144c6ed89d9ba7fa74c4b03711e7e4be6c20e2c13aa4",
        "pack_sha256": "2106f688733f304cb9bf50237f4b22f3b35e4fefdeea7d15f1efd5b296963401"
      },
      {
        "id": "@shine-mage/dsh-shine-query",
        "directory": "shine-query",
        "sha": "7202f182af696f11b6b7691fbff7f626e2ee711c",
        "manifest_sha256": "5f8734a04350ee43be1525b775657ec609c729db739833824953bdcebcc5d99c",
        "pack_sha256": "404308bfab66b329096c55fdca6432ea738eceb6bfa027fc48281a6bd4b85eb1"
      },
      {
        "id": "@shine-mage/dsh-shine-funnel",
        "directory": "shine-funnel",
        "sha": "c3dd9d3c107abe1cb7c558e9230fb4aa2b91a3c9",
        "manifest_sha256": "7bf222d844250313ad9070ac6987e9b4f006ef12482108f1a855e8420cec7c8e",
        "pack_sha256": "17494d3b28292348f7141a477b92cd0bc6a6c6c570a310e7890413981338ee94"
      },
      {
        "id": "@shine-mage/dsh-shine-waterfall",
        "directory": "shine-waterfall",
        "sha": "d5d2c6fcb4aa08fc9b57969e94bb38d269c992cd",
        "manifest_sha256": "53dd522e3bfb4dfc523f809ccd8a1e5d3f602140cb3ede5b9394e420297d6cb5",
        "pack_sha256": "aee1fa8a33669468cd92a243ed85feb78e50d5bfc7d84dc88ad58bc701d37fee"
      },
      {
        "id": "@shine-mage/dsh-shine-brand",
        "directory": "shine-brand",
        "sha": "6aa335d29d59c21034b41103ed7858b5b912aca7",
        "manifest_sha256": "5dd648753a257fbef9d96b3188d52f5338c46f01c1642c1b179a1aa5ce36d7b7",
        "pack_sha256": "47a6450505b7b9148de735481483d66a4278e59696549bdc505465a6a5fad8a8"
      }
    ],
    "domains": [
      {
        "package": "@shine-mage/board-components",
        "directory": "board-components",
        "sha": "4245aa811771f45d847bc7644234fabe5a6eee45",
        "manifest_sha256": "99989ec7207286ad37ab863236a0a87146b55aa2d12d2731325aa75018ee0265",
        "pack_sha256": "66d53381095e93f38dbaa7385780f20b677f68ca2692702cb270849f3392853e"
      }
    ]
  },
  "environment": {
    "node": "v24.19.0",
    "pnpm": "11.28.2",
    "python": "3.14.8",
    "platform": "darwin",
    "arch": "arm64",
    "install_mode": "PRODUCTION_ONLY",
    "commit_date": "2026-11-05T21:52:56+08:00"
  },
  "checks": [
    {
      "id": "ref_materialized",
      "status": "PASS"
    },
    {
      "id": "plugin_sources_removed",
      "status": "PASS"
    },
    {
      "id": "retained_plugin_trees",
      "status": "PASS"
    },
    {
      "id": "profile_inputs_from_lock",
      "status": "PASS"
    },
    {
      "id": "composition_manifest_from_lock",
      "status": "PASS"
    },
    {
      "id": "business_profile_rederived",
      "status": "PASS"
    },
    {
      "id": "backend_source_paths",
      "status": "PASS"
    },
    {
      "id": "kernel_manifest_files",
      "status": "PASS"
    },
    {
      "id": "node_pack_reader_imports",
      "status": "PASS"
    },
    {
      "id": "python_backend_imports",
      "status": "PASS"
    },
    {
      "id": "artifact_lock_binding",
      "status": "PASS"
    },
    {
      "id": "sealed_packs_validated",
      "status": "PASS"
    },
    {
      "id": "main_production_install",
      "status": "PASS"
    },
    {
      "id": "release_payload_installed",
      "status": "PASS"
    },
    {
      "id": "consumer_pack_imports",
      "status": "PASS"
    }
  ],
  "composition": {
    "lock_sha256": "81a10f70e7f4a220676cdfb0e15a4422e6ceef65988cf0406452bd965adb2842",
    "source_manifest_sha256": "0dc8070def4a271f4ba3e005c8bdd246076fde81551dc30a5a72d6efbc83a794",
    "profiles": [
      {
        "name": "crm",
        "path": "config/dsh-profile.crm-knowledge.rc3.json",
        "sha256": "9a8591fd8434b08f584529a3f4dcd5d175c54ab71d2cbe340231cfb31c9c365b"
      },
      {
        "name": "page",
        "path": "config/dsh-profile.rc3.json",
        "sha256": "4eee5436d11c43eab997f99534e4cd6b58dd69d47cf8833748b2e3d2af1d0569"
      }
    ],
    "plugins": [
      {
        "id": "@shine-mage/dsh-analytics-workbench-b0",
        "source_sha": "ae922fa3ff80c238d47bee7c8cbed1705b55f836",
        "version": "0.0.0-b0",
        "manifest_sha256": "735092d62e77b7533435aa475c4b297913e1f3b9f832efa70f20a2eb8ca061af",
        "pack_sha256": "f83a65a48900b6b51a9b59ceb8ea6bbb0a4d456800c41499f72651d8155c7017"
      },
      {
        "id": "@shine-mage/dsh-crm-knowledge",
        "source_sha": "86ff10b9926c4e393829ad3bccbfad43a028158f",
        "version": "0.0.0-crm.5",
        "manifest_sha256": "fc760439b84a9576a34cb324b06937c11c4aa5de70286ccf831a2db1893e9cfe",
        "pack_sha256": "aede350861b4d94002fd2e1bf15630408ad0c24d578b03fc48250bb3f2d7da03"
      },
      {
        "id": "@shine-mage/dsh-knowledge",
        "source_sha": "902a1b41307c0c88a3b29c91294ca416bc0d00b7",
        "version": "0.0.0-candidate.1",
        "manifest_sha256": "6f5e1e8c3a6a6183829717dfeb5cffbace0911d5c07ad1244b1dd04b8cd60c4e",
        "pack_sha256": "69c65831b9daa55e7fa063729bf7ff8ddf1cbe83b62cfd16e5224e5181814b56"
      },
      {
        "id": "@shine-mage/dsh-shine-board",
        "source_sha": "97885ddfdfca8efa779c06b00e9ee61d0d05dbf9",
        "version": "0.0.0-b0",
        "manifest_sha256": "948df5481cb287a79d2564b8d3b0481b11f53d01d231e3c0738da9986b421705",
        "pack_sha256": "a6133269183215f7bb32f40f81e7e42f65e2b0f31c9536bef7f06673215ca38c"
      },
      {
        "id": "@shine-mage/dsh-shine-crowd-action",
        "source_sha": "dc6f0d2c2bf18eb6d29cb1117c004b462485a0d2",
        "version": "0.0.0-b0",
        "manifest_sha256": "c5d64539536619fa62e9144c6ed89d9ba7fa74c4b03711e7e4be6c20e2c13aa4",
        "pack_sha256": "2106f688733f304cb9bf50237f4b22f3b35e4fefdeea7d15f1efd5b296963401"
      },
      {
        "id": "@shine-mage/dsh-shine-query",
        "source_sha": "7202f182af696f11b6b7691fbff7f626e2ee711c",
        "version": "0.0.0-b0",
        "manifest_sha256": "5f8734a04350ee43be1525b775657ec609c729db739833824953bdcebcc5d99c",
        "pack_sha256": "404308bfab66b329096c55fdca6432ea738eceb6bfa027fc48281a6bd4b85eb1"
      },
      {
        "id": "@shine-mage/dsh-shine-funnel",
        "source_sha": "c3dd9d3c107abe1cb7c558e9230fb4aa2b91a3c9",
        "version": "0.0.0-b0",
        "manifest_sha256": "7bf222d844250313ad9070ac6987e9b4f006ef12482108f1a855e8420cec7c8e",
        "pack_sha256": "17494d3b28292348f7141a477b92cd0bc6a6c6c570a310e7890413981338ee94"
      },
      {
        "id": "@shine-mage/dsh-shine-waterfall",
        "source_sha": "d5d2c6fcb4aa08fc9b57969e94bb38d269c992cd",
        "version": "0.0.0-b0",
        "manifest_sha256": "53dd522e3bfb4dfc523f809ccd8a1e5d3f602140cb3ede5b9394e420297d6cb5",
        "pack_sha256": "aee1fa8a33669468cd92a243ed85feb78e50d5bfc7d84dc88ad58bc701d37fee"
      },
      {
        "id": "@shine-mage/dsh-shine-brand",
        "source_sha": "6aa335d29d59c21034b41103ed7858b5b912aca7",
        "version": "0.0.0-b0",
        "manifest_sha256": "5dd648753a257fbef9d96b3188d52f5338c46f01c1642c1b179a1aa5ce36d7b7",
        "pack_sha256": "47a6450505b7b9148de735481483d66a4278e59696549bdc505465a6a5fad8a8"
      }
    ],
    "domains": [
      {
        "package": "@shine-mage/board-components",
        "source_sha": "4245aa811771f45d847bc7644234fabe5a6eee45",
        "manifest": "domain/board-components-pack.json",
        "manifest_sha256": "99989ec7207286ad37ab863236a0a87146b55aa2d12d2731325aa75018ee0265",
        "pack_sha256": "66d53381095e93f38dbaa7385780f20b677f68ca2692702cb270849f3392853e"
      }
    ],
    "business_profile": {
      "path": "config/dsh-profile.business.rc3.json",
      "sha256": "729774f7014e9cebc523e9bc77a9ce1ea0190d6686a02c755d1fa68e064d5f88"
    }
  },
  "release_payload": {
    "files": 1642,
    "bytes": 24193805,
    "profile_pack_snapshot": {
      "path": "shinemage-release-pack-inputs.json",
      "sha256": "b8d69e799f07ee83cab4bd192244eb5da6cae27622fb83ca8dcb154c58614dff"
    },
    "plugins": [
      {
        "id": "@shine-mage/dsh-crm-knowledge",
        "source_sha": "86ff10b9926c4e393829ad3bccbfad43a028158f",
        "version": "0.0.0-crm.5",
        "manifest_sha256": "fc760439b84a9576a34cb324b06937c11c4aa5de70286ccf831a2db1893e9cfe",
        "pack_sha256": "aede350861b4d94002fd2e1bf15630408ad0c24d578b03fc48250bb3f2d7da03"
      },
      {
        "id": "@shine-mage/dsh-knowledge",
        "source_sha": "902a1b41307c0c88a3b29c91294ca416bc0d00b7",
        "version": "0.0.0-candidate.1",
        "manifest_sha256": "6f5e1e8c3a6a6183829717dfeb5cffbace0911d5c07ad1244b1dd04b8cd60c4e",
        "pack_sha256": "69c65831b9daa55e7fa063729bf7ff8ddf1cbe83b62cfd16e5224e5181814b56"
      },
      {
        "id": "@shine-mage/dsh-analytics-workbench-b0",
        "source_sha": "ae922fa3ff80c238d47bee7c8cbed1705b55f836",
        "version": "0.0.0-b0",
        "manifest_sha256": "735092d62e77b7533435aa475c4b297913e1f3b9f832efa70f20a2eb8ca061af",
        "pack_sha256": "f83a65a48900b6b51a9b59ceb8ea6bbb0a4d456800c41499f72651d8155c7017"
      },
      {
        "id": "@shine-mage/dsh-shine-brand",
        "source_sha": "6aa335d29d59c21034b41103ed7858b5b912aca7",
        "version": "0.0.0-b0",
        "manifest_sha256": "5dd648753a257fbef9d96b3188d52f5338c46f01c1642c1b179a1aa5ce36d7b7",
        "pack_sha256": "47a6450505b7b9148de735481483d66a4278e59696549bdc505465a6a5fad8a8"
      },
      {
        "id": "@shine-mage/dsh-shine-waterfall",
        "source_sha": "d5d2c6fcb4aa08fc9b57969e94bb38d269c992cd",
        "version": "0.0.0-b0",
        "manifest_sha256": "53dd522e3bfb4dfc523f809ccd8a1e5d3f602140cb3ede5b9394e420297d6cb5",
        "pack_sha256": "aee1fa8a33669468cd92a243ed85feb78e50d5bfc7d84dc88ad58bc701d37fee"
      },
      {
        "id": "@shine-mage/dsh-shine-crowd-action",
        "source_sha": "dc6f0d2c2bf18eb6d29cb1117c004b462485a0d2",
        "version": "0.0.0-b0",
        "manifest_sha256": "c5d64539536619fa62e9144c6ed89d9ba7fa74c4b03711e7e4be6c20e2c13aa4",
        "pack_sha256": "2106f688733f304cb9bf50237f4b22f3b35e4fefdeea7d15f1efd5b296963401"
      },
      {
        "id": "@shine-mage/dsh-shine-query",
        "source_sha": "7202f182af696f11b6b7691fbff7f626e2ee711c",
        "version": "0.0.0-b0",
        "manifest_sha256": "5f8734a04350ee43be1525b775657ec609c729db739833824953bdcebcc5d99c",
        "pack_sha256": "404308bfab66b329096c55fdca6432ea738eceb6bfa027fc48281a6bd4b85eb1"
      },
      {
        "id": "@shine-mage/dsh-shine-board",
        "source_sha": "97885ddfdfca8efa779c06b00e9ee61d0d05dbf9",
        "version": "0.0.0-b0",
        "manifest_sha256": "948df5481cb287a79d2564b8d3b0481b11f53d01d231e3c0738da9986b421705",
        "pack_sha256": "a6133269183215f7bb32f40f81e7e42f65e2b0f31c9536bef7f06673215ca38c"
      },
      {
        "id": "@shine-mage/dsh-shine-funnel",
        "source_sha": "c3dd9d3c107abe1cb7c558e9230fb4aa2b91a3c9",
        "version": "0.0.0-b0",
        "manifest_sha256": "7bf222d844250313ad9070ac6987e9b4f006ef12482108f1a855e8420cec7c8e",
        "pack_sha256": "17494d3b28292348f7141a477b92cd0bc6a6c6c570a310e7890413981338ee94"
      }
    ],
    "activation": "NOT_RUN"
  },
  "consumer": {
    "packages": 9,
    "install": "PASS",
    "imports": [
      {
        "specifier": "@shine-mage/dsh-analytics-workbench-b0",
        "status": "PASS"
      },
      {
        "specifier": "@shine-mage/dsh-analytics-workbench-b0/page-tools",
        "status": "PASS"
      },
      {
        "specifier": "@shine-mage/dsh-analytics-workbench-b0/tool",
        "status": "PASS"
      },
      {
        "specifier": "@shine-mage/dsh-analytics-workbench-b0/tools",
        "status": "PASS"
      },
      {
        "specifier": "@shine-mage/dsh-crm-knowledge",
        "status": "PASS"
      },
      {
        "specifier": "@shine-mage/dsh-crm-knowledge/host",
        "status": "PASS"
      },
      {
        "specifier": "@shine-mage/dsh-knowledge",
        "status": "PASS"
      },
      {
        "specifier": "@shine-mage/dsh-knowledge/graph-tools",
        "status": "PASS"
      },
      {
        "specifier": "@shine-mage/dsh-shine-board",
        "status": "PASS"
      },
      {
        "specifier": "@shine-mage/dsh-shine-brand",
        "status": "PASS"
      },
      {
        "specifier": "@shine-mage/dsh-shine-crowd-action",
        "status": "PASS"
      },
      {
        "specifier": "@shine-mage/dsh-shine-funnel",
        "status": "PASS"
      },
      {
        "specifier": "@shine-mage/dsh-shine-funnel/funnel",
        "status": "PASS"
      },
      {
        "specifier": "@shine-mage/dsh-shine-query",
        "status": "PASS"
      },
      {
        "specifier": "@shine-mage/dsh-shine-waterfall",
        "status": "PASS"
      },
      {
        "specifier": "@shine-mage/dsh-shine-waterfall/waterfall",
        "status": "PASS"
      }
    ],
    "dev_dependencies": "excluded",
    "peer_dependencies": "installed",
    "client_bundles": "NOT_RUN_BROWSER_TARGET"
  },
  "unproven": [
    "real production host: no host was started, no profile was activated, no business data was read",
    "host activation: activation stays NOT_RUN; pack bytes were installed and imported only",
    "company-runner M2-07 closure: this receipt does not replace the company production-only consumer closure gate",
    "remote main verification: the sealed artifact was downloaded from the locked run; this rehearsal does not dispatch main"
  ]
}
```
<!-- production-only-closure-receipt:end -->
