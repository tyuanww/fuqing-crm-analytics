# Production-only closure receipt

Machine-checked evidence for the production-only closure condition
(the gate reason once labelled `production_only_closure_not_recorded`). It records one rehearsal of
`origin/main` with the ten P4 source trees removed: profile inputs, the
composition manifest, the pack readers, the backend/kernel imports, a
production-only install, the sealed consumer install and the release payload
all passed. It deliberately does **not** clear `remote_main_not_verified`
and does not claim a real production host.

- Tested ref: `HEAD`
- Commit: `e6af4ecff8cc32142fafeac2c95f535e7476e74c` (2026-11-15T10:21:02+08:00)
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
| lock | `config/shinemage-composition-packs.lock.json` | `82fdae800c582e9f55d8ab03e3529ce3e0e4973e0f5b14421a395ebe3187ade3` |
| manifest | `config/shinemage-composition-pack-manifest.v1.json` | `f952bb193af9710592631c3b8850d0c737db12328c843af75c8cbb5360d4762f` |
| artifact lock | `config/shinemage-composition-artifact.lock.json` | `eeabcc0f3ba7307d0484c682dfdb9e8e57eeb8645529224d15ddc851e61018af` |
| sealed artifact | `id 14142656552 / run 43667164993` | `9ed0741d172ecfdc69fd0a7e1ded9066fb86dfca3f9129ff7397549971c7e52d` |

## Environment

| Field | Value |
|---|---|
| node | `v24.19.0` |
| pnpm | `11.28.2` |
| python | `3.14.8` |
| platform | `darwin` |
| arch | `arm64` |
| install_mode | `PRODUCTION_ONLY` |
| commit_date | `2026-11-15T10:21:02+08:00` |

## What this proves

- `git archive` of `e6af4ecff8cc32142fafeac2c95f535e7476e74c` contains no `.git` and no untracked files; the rehearsal never touched the caller's worktree.
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
  "ref": "HEAD",
  "commit": "e6af4ecff8cc32142fafeac2c95f535e7476e74c",
  "tree": "24f5952d60aed057ad16ceb167d8b4edbfe61d22",
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
      "sha256": "82fdae800c582e9f55d8ab03e3529ce3e0e4973e0f5b14421a395ebe3187ade3"
    },
    "manifest": {
      "path": "config/shinemage-composition-pack-manifest.v1.json",
      "sha256": "f952bb193af9710592631c3b8850d0c737db12328c843af75c8cbb5360d4762f"
    },
    "artifact_lock": {
      "path": "config/shinemage-composition-artifact.lock.json",
      "sha256": "eeabcc0f3ba7307d0484c682dfdb9e8e57eeb8645529224d15ddc851e61018af",
      "id": 14142656552,
      "run_id": 43667164993,
      "head_sha": "93dae0ab0538eca6f2d3565b5f30d32f330e6d66",
      "artifact_sha256": "9ed0741d172ecfdc69fd0a7e1ded9066fb86dfca3f9129ff7397549971c7e52d",
      "composition_lock_sha256": "82fdae800c582e9f55d8ab03e3529ce3e0e4973e0f5b14421a395ebe3187ade3"
    },
    "artifact_zip_sha256": "9ed0741d172ecfdc69fd0a7e1ded9066fb86dfca3f9129ff7397549971c7e52d",
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
        "sha": "58ce1e54ff676e839ebc1d6aff9723dafc286142",
        "manifest_sha256": "1a8cc2ded52e0fc80acfdf797a3d1f4dc3243c117f922dd07627f4d7bb8250e8",
        "pack_sha256": "efead1c1ac3ac4ca5fc2f4f0f57e7e78bd346ed2e351372f8236fd5440f40e1c"
      },
      {
        "id": "@shine-mage/dsh-crm-knowledge",
        "directory": "crm-knowledge",
        "sha": "825d4d535ac6531feed9d5117686affae49496c5",
        "manifest_sha256": "967d3606bf9422ca0e16bc0587a4d0eb9d966932fbd2b84db7eb6cf4745c7821",
        "pack_sha256": "4ca494fc1beaca021bbc55c394b2e8e875ad37c8ccdc3cad966832395dda49e3"
      },
      {
        "id": "@shine-mage/dsh-knowledge",
        "directory": "knowledge",
        "sha": "62631fb00e8ec0a4a84478fcdb6fd4bba62b5f1a",
        "manifest_sha256": "14ef5f0020325cd456971d5b91a872e6bf4d5b560d598577bd0b2fb00c21e079",
        "pack_sha256": "47a56c197c5f93613b07fd8c9363cc48a5a5accd891d388d32e634f08905108e"
      },
      {
        "id": "@shine-mage/dsh-shine-board",
        "directory": "shine-board",
        "sha": "d8cc64dd453a4d74ef3a7076cc72313a5b02095b",
        "manifest_sha256": "0dc9ac849110809b2579cb37aa929333b97693270d788cbafc654d82303f0e43",
        "pack_sha256": "a6133269183215f7bb32f40f81e7e42f65e2b0f31c9536bef7f06673215ca38c"
      },
      {
        "id": "@shine-mage/dsh-shine-crowd-action",
        "directory": "shine-crowd-action",
        "sha": "0b282378ec17227f9527c3d42ad9e37d680f08ba",
        "manifest_sha256": "01bfeec9f0297aa09c48129e0d1ffc2945de83dd278d9b12cbf3c5f3f4ae0f42",
        "pack_sha256": "2106f688733f304cb9bf50237f4b22f3b35e4fefdeea7d15f1efd5b296963401"
      },
      {
        "id": "@shine-mage/dsh-shine-query",
        "directory": "shine-query",
        "sha": "1e3bebd67c25cb67899133257e3e4c63ad770a43",
        "manifest_sha256": "d6ed52af7d5135b914f89ba8d751d753665c3518ad8c7981480baca6086a6160",
        "pack_sha256": "404308bfab66b329096c55fdca6432ea738eceb6bfa027fc48281a6bd4b85eb1"
      },
      {
        "id": "@shine-mage/dsh-shine-funnel",
        "directory": "shine-funnel",
        "sha": "9ac830734b20c1fc4424b22c85068734da4d9f33",
        "manifest_sha256": "99802cc1507b452c37f1fe778170f155941b5b6108263ec8279c7ede6e160f73",
        "pack_sha256": "17494d3b28292348f7141a477b92cd0bc6a6c6c570a310e7890413981338ee94"
      },
      {
        "id": "@shine-mage/dsh-shine-waterfall",
        "directory": "shine-waterfall",
        "sha": "ec5292277122137cdf0df24dfdab0c75d15708c6",
        "manifest_sha256": "dcbd76457ea1eab14b5b05ca4c2fb521859b1c7d394590f4e6802dd9e6fcaf39",
        "pack_sha256": "aee1fa8a33669468cd92a243ed85feb78e50d5bfc7d84dc88ad58bc701d37fee"
      },
      {
        "id": "@shine-mage/dsh-shine-brand",
        "directory": "shine-brand",
        "sha": "bcc9f1cd99e588f244858b7b5769c42d435ca9a3",
        "manifest_sha256": "d331f992a7cf8c5ccc4d14dacdfba67f2fe4b14f77ca9398345d649d096645c2",
        "pack_sha256": "8eb1d8e1356989d85edd77296181d980dbf520ac577110a013b32e1f2e8a43d2"
      }
    ],
    "domains": [
      {
        "package": "@shine-mage/board-components",
        "directory": "board-components",
        "sha": "59280a250416eec23f727d4f3ffb0ca38b65794c",
        "manifest_sha256": "2f535724fa0f631869c8882b725bb9ce901a6502f8a974b1525daebe12d51f14",
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
    "commit_date": "2026-11-15T10:21:02+08:00"
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
    "lock_sha256": "82fdae800c582e9f55d8ab03e3529ce3e0e4973e0f5b14421a395ebe3187ade3",
    "source_manifest_sha256": "f952bb193af9710592631c3b8850d0c737db12328c843af75c8cbb5360d4762f",
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
        "source_sha": "58ce1e54ff676e839ebc1d6aff9723dafc286142",
        "version": "0.0.0-b0",
        "manifest_sha256": "1a8cc2ded52e0fc80acfdf797a3d1f4dc3243c117f922dd07627f4d7bb8250e8",
        "pack_sha256": "efead1c1ac3ac4ca5fc2f4f0f57e7e78bd346ed2e351372f8236fd5440f40e1c"
      },
      {
        "id": "@shine-mage/dsh-crm-knowledge",
        "source_sha": "825d4d535ac6531feed9d5117686affae49496c5",
        "version": "0.0.0-crm.5",
        "manifest_sha256": "967d3606bf9422ca0e16bc0587a4d0eb9d966932fbd2b84db7eb6cf4745c7821",
        "pack_sha256": "4ca494fc1beaca021bbc55c394b2e8e875ad37c8ccdc3cad966832395dda49e3"
      },
      {
        "id": "@shine-mage/dsh-knowledge",
        "source_sha": "62631fb00e8ec0a4a84478fcdb6fd4bba62b5f1a",
        "version": "0.0.0-candidate.1",
        "manifest_sha256": "14ef5f0020325cd456971d5b91a872e6bf4d5b560d598577bd0b2fb00c21e079",
        "pack_sha256": "47a56c197c5f93613b07fd8c9363cc48a5a5accd891d388d32e634f08905108e"
      },
      {
        "id": "@shine-mage/dsh-shine-board",
        "source_sha": "d8cc64dd453a4d74ef3a7076cc72313a5b02095b",
        "version": "0.0.0-b0",
        "manifest_sha256": "0dc9ac849110809b2579cb37aa929333b97693270d788cbafc654d82303f0e43",
        "pack_sha256": "a6133269183215f7bb32f40f81e7e42f65e2b0f31c9536bef7f06673215ca38c"
      },
      {
        "id": "@shine-mage/dsh-shine-crowd-action",
        "source_sha": "0b282378ec17227f9527c3d42ad9e37d680f08ba",
        "version": "0.0.0-b0",
        "manifest_sha256": "01bfeec9f0297aa09c48129e0d1ffc2945de83dd278d9b12cbf3c5f3f4ae0f42",
        "pack_sha256": "2106f688733f304cb9bf50237f4b22f3b35e4fefdeea7d15f1efd5b296963401"
      },
      {
        "id": "@shine-mage/dsh-shine-query",
        "source_sha": "1e3bebd67c25cb67899133257e3e4c63ad770a43",
        "version": "0.0.0-b0",
        "manifest_sha256": "d6ed52af7d5135b914f89ba8d751d753665c3518ad8c7981480baca6086a6160",
        "pack_sha256": "404308bfab66b329096c55fdca6432ea738eceb6bfa027fc48281a6bd4b85eb1"
      },
      {
        "id": "@shine-mage/dsh-shine-funnel",
        "source_sha": "9ac830734b20c1fc4424b22c85068734da4d9f33",
        "version": "0.0.0-b0",
        "manifest_sha256": "99802cc1507b452c37f1fe778170f155941b5b6108263ec8279c7ede6e160f73",
        "pack_sha256": "17494d3b28292348f7141a477b92cd0bc6a6c6c570a310e7890413981338ee94"
      },
      {
        "id": "@shine-mage/dsh-shine-waterfall",
        "source_sha": "ec5292277122137cdf0df24dfdab0c75d15708c6",
        "version": "0.0.0-b0",
        "manifest_sha256": "dcbd76457ea1eab14b5b05ca4c2fb521859b1c7d394590f4e6802dd9e6fcaf39",
        "pack_sha256": "aee1fa8a33669468cd92a243ed85feb78e50d5bfc7d84dc88ad58bc701d37fee"
      },
      {
        "id": "@shine-mage/dsh-shine-brand",
        "source_sha": "bcc9f1cd99e588f244858b7b5769c42d435ca9a3",
        "version": "0.0.0-b0",
        "manifest_sha256": "d331f992a7cf8c5ccc4d14dacdfba67f2fe4b14f77ca9398345d649d096645c2",
        "pack_sha256": "8eb1d8e1356989d85edd77296181d980dbf520ac577110a013b32e1f2e8a43d2"
      }
    ],
    "domains": [
      {
        "package": "@shine-mage/board-components",
        "source_sha": "59280a250416eec23f727d4f3ffb0ca38b65794c",
        "manifest": "domain/board-components-pack.json",
        "manifest_sha256": "2f535724fa0f631869c8882b725bb9ce901a6502f8a974b1525daebe12d51f14",
        "pack_sha256": "66d53381095e93f38dbaa7385780f20b677f68ca2692702cb270849f3392853e"
      }
    ],
    "business_profile": {
      "path": "config/dsh-profile.business.rc3.json",
      "sha256": "729774f7014e9cebc523e9bc77a9ce1ea0190d6686a02c755d1fa68e064d5f88"
    }
  },
  "release_payload": {
    "files": 1656,
    "bytes": 24413803,
    "profile_pack_snapshot": {
      "path": "shinemage-release-pack-inputs.json",
      "sha256": "23e8212441334d06934d4349ef383e475aa94d065c5694d451a01d49cd133303"
    },
    "plugins": [
      {
        "id": "@shine-mage/dsh-crm-knowledge",
        "source_sha": "825d4d535ac6531feed9d5117686affae49496c5",
        "version": "0.0.0-crm.5",
        "manifest_sha256": "967d3606bf9422ca0e16bc0587a4d0eb9d966932fbd2b84db7eb6cf4745c7821",
        "pack_sha256": "4ca494fc1beaca021bbc55c394b2e8e875ad37c8ccdc3cad966832395dda49e3"
      },
      {
        "id": "@shine-mage/dsh-knowledge",
        "source_sha": "62631fb00e8ec0a4a84478fcdb6fd4bba62b5f1a",
        "version": "0.0.0-candidate.1",
        "manifest_sha256": "14ef5f0020325cd456971d5b91a872e6bf4d5b560d598577bd0b2fb00c21e079",
        "pack_sha256": "47a56c197c5f93613b07fd8c9363cc48a5a5accd891d388d32e634f08905108e"
      },
      {
        "id": "@shine-mage/dsh-analytics-workbench-b0",
        "source_sha": "58ce1e54ff676e839ebc1d6aff9723dafc286142",
        "version": "0.0.0-b0",
        "manifest_sha256": "1a8cc2ded52e0fc80acfdf797a3d1f4dc3243c117f922dd07627f4d7bb8250e8",
        "pack_sha256": "efead1c1ac3ac4ca5fc2f4f0f57e7e78bd346ed2e351372f8236fd5440f40e1c"
      },
      {
        "id": "@shine-mage/dsh-shine-brand",
        "source_sha": "bcc9f1cd99e588f244858b7b5769c42d435ca9a3",
        "version": "0.0.0-b0",
        "manifest_sha256": "d331f992a7cf8c5ccc4d14dacdfba67f2fe4b14f77ca9398345d649d096645c2",
        "pack_sha256": "8eb1d8e1356989d85edd77296181d980dbf520ac577110a013b32e1f2e8a43d2"
      },
      {
        "id": "@shine-mage/dsh-shine-waterfall",
        "source_sha": "ec5292277122137cdf0df24dfdab0c75d15708c6",
        "version": "0.0.0-b0",
        "manifest_sha256": "dcbd76457ea1eab14b5b05ca4c2fb521859b1c7d394590f4e6802dd9e6fcaf39",
        "pack_sha256": "aee1fa8a33669468cd92a243ed85feb78e50d5bfc7d84dc88ad58bc701d37fee"
      },
      {
        "id": "@shine-mage/dsh-shine-crowd-action",
        "source_sha": "0b282378ec17227f9527c3d42ad9e37d680f08ba",
        "version": "0.0.0-b0",
        "manifest_sha256": "01bfeec9f0297aa09c48129e0d1ffc2945de83dd278d9b12cbf3c5f3f4ae0f42",
        "pack_sha256": "2106f688733f304cb9bf50237f4b22f3b35e4fefdeea7d15f1efd5b296963401"
      },
      {
        "id": "@shine-mage/dsh-shine-query",
        "source_sha": "1e3bebd67c25cb67899133257e3e4c63ad770a43",
        "version": "0.0.0-b0",
        "manifest_sha256": "d6ed52af7d5135b914f89ba8d751d753665c3518ad8c7981480baca6086a6160",
        "pack_sha256": "404308bfab66b329096c55fdca6432ea738eceb6bfa027fc48281a6bd4b85eb1"
      },
      {
        "id": "@shine-mage/dsh-shine-board",
        "source_sha": "d8cc64dd453a4d74ef3a7076cc72313a5b02095b",
        "version": "0.0.0-b0",
        "manifest_sha256": "0dc9ac849110809b2579cb37aa929333b97693270d788cbafc654d82303f0e43",
        "pack_sha256": "a6133269183215f7bb32f40f81e7e42f65e2b0f31c9536bef7f06673215ca38c"
      },
      {
        "id": "@shine-mage/dsh-shine-funnel",
        "source_sha": "9ac830734b20c1fc4424b22c85068734da4d9f33",
        "version": "0.0.0-b0",
        "manifest_sha256": "99802cc1507b452c37f1fe778170f155941b5b6108263ec8279c7ede6e160f73",
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
