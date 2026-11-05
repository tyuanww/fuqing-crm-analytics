# P4 S0 kit re-cut and author re-vendor

Prepared 2026-11-05 against `origin/main` `f8aa3fa` (`#246` merge; the kit source is unchanged since `8da3c613`). This is preparation only: no author repo was written, no main lock pin moved, and the sealed artifact was not rebuilt. S0 is strictly serial and first; this document supplies the cut, the drift gate and the per-repo checklist that S0 executes under a separate authorization.

Machine-readable state: [`p4-s0-kit-vendored.v1.json`](p4-s0-kit-vendored.v1.json) (10 repos × author `main` + open PR head, with sha256, bytes, tarball name and the files each repo carries the kit in). Tool: [`scripts/dsh-b0/cut-kit-artifact.mjs`](../../scripts/dsh-b0/cut-kit-artifact.mjs). Domain contradiction: [`p4-s0-domain-sha-reconciliation.md`](p4-s0-domain-sha-reconciliation.md).

## 1. Authoritative cut (proven)

| Tarball | sha256 | Bytes | Members | Where it is live |
|---|---|---|---|---|
| kit `0.1.0` | `251383e18a76fe345ac837d8767f6c325c4616c027e2ea250d2dcec45b22c901` | 43,944 | 17 | all 10 author `main`s, `vendor/dsh-plugin-kit-0.1.0.tgz` |
| kit `0.1.1` (stale PR cut) | `a527b2a5ec54731c85930bd795a74ef8eab972731d4915dc3b01b318855f0e11` | 49,013 | 19 | all 10 open author PR heads, `vendor/dsh-plugin-kit-0.1.1.tgz` |
| **kit `0.1.1` (authoritative)** | **`e22161688cbc7bc345e64264223c9aa367e859a8dccd000a65b91c6621559fdb`** | **49,341** | **19** | none yet — S0 must distribute it |

Reproduction (the tool stages `dsh-plugins/plugin-kit` out of the commit with `git archive`, packs with the pinned pnpm and compares two independent packs):

```bash
node scripts/dsh-b0/cut-kit-artifact.mjs --commit f8aa3fa --out /tmp/p4-s0-kit
# sha256 e2216168… / 49,341 B / 19 members / reproducible: identical
node scripts/dsh-b0/cut-kit-artifact.mjs --commit origin/main --check   # red until S0 lands: 20/20 DRIFT
```

The runbook baseline `8da3c613`, `304abf9f` and current main `f8aa3fa` all cut to `e2216168…`/49,341 B byte-for-byte: main moved only by the docs-only `#245` and `#246` merges and `git diff 8da3c613 f8aa3fa -- dsh-plugins/plugin-kit` is empty, so the authoritative value does **not** change. The packer is deterministic because pnpm writes every member with mode `0644`, uid/gid `0`, empty owner names and the portable `1985-10-26` mtime; the tool asserts those headers and a byte-identical second cut.

The cut also asserts the surface that S0 needs: exports `./toolchain`, `./provenance`, `./client-banner`, `./packaged-dependencies`, `./pin`, `./package.json`; member `provenance.mjs` and `client-banner.mjs`; and `CONTRACT_PACKAGE_NAME = '@shine-mage/dsh-contracts'` in `packaged-dependencies.mjs`. It refuses any pack lifecycle script.

### Why the PR-head tarball is unusable

`a527b2a5…` is not a cut of any main commit:

- it was cut from the `#211` line **before** main `a9980f3` added `CONTRACT_PACKAGE_NAME`; `grep CONTRACT_PACKAGE_NAME package/packaged-dependencies.mjs` returns 0 in that tarball but the constant is present in `e2216168…`;
- its packed `package/package.json` still carries the dev-only `packageManager` and the pre-`fd6bc25` compact formatting with no trailing newline, while every `pnpm pack` of this kit (`251383e1…`, `e2216168…`) normalizes the manifest and drops `packageManager`;
- only two of 19 members differ from `e2216168…`: `package/package.json` and `package/packaged-dependencies.mjs`.

The `0.1.0` tarball is a different, older failure: 17 members with no `./provenance` or `./client-banner`, so no author `main` can build the rc.5 sources. The plan note `docs/plans/plugin-externalization-p0-p4-20261104.md` §2.1 item 6 (`03ca0fde…`/45,574 B) is not what the 10 `main`s carry today: every `KIT-SHA256` on `main` is `251383e1…` and every vendored tarball is 43,944 B. Correct the note when the plan is next appended; do not rewrite the historical evidence.

### Version decision

Keep `0.1.1`; do not bump for the re-cut. No author `main` ever carried `a527b2a5…` (that byte stream exists only on the open PR heads, which S0 overwrites), so `e2216168…` becomes the only `0.1.1` any `main` has ever vendored. The public surface did not change between the two `0.1.1` cuts, and main's in-repo consumers already pin `0.1.1` by `file:` path, so no main pin and no author lock specifier changes. A `0.1.2` bump would additionally require 10 in-repo `package.json` pins plus a new cut, with no identity benefit.

## 2. Live author-vendor state (2026-11-05, read-only)

All 10 author `main`s vendor `251383e1…` / 43,944 B as `vendor/dsh-plugin-kit-0.1.0.tgz`; all 10 open PR heads vendor `a527b2a5…` / 49,013 B as `vendor/dsh-plugin-kit-0.1.1.tgz`. Repo, head sha, PR number and carrier list are in the JSON manifest; the per-repo deltas are:

| Repo | Author `main` | Open PR | `KIT-SHA256` format | Extra kit carriers |
|---|---|---|---|---|
| `dsh-analytics-workbench` | `865fe2e6` | #16 `wb15-provenance` (merge #15 first) | bare digest | `inputs/ci/identity.json` |
| `dsh-crm-knowledge` | `78eb9f7d` | #6 (merge #2–#5 first) | bare digest | `inputs/ci/identity.json` |
| `dsh-knowledge` | `ef8960ed` | #2 | digest + filename | `inputs/ci/identity.json` |
| `dsh-shine-board` | `75eced47` | #2 | digest + filename | `inputs/ci/identity.json` |
| `dsh-shine-crowd-action` | `d709e80f` | #2 | digest + filename | `inputs/ci/identity.json` |
| `dsh-shine-query` | `37c853bb` | #2 | digest + filename | `inputs/ci/identity.json` |
| `dsh-shine-funnel` | `c3732617` | #2 | digest + filename | `inputs/ci/identity.json`; board tgz |
| `dsh-shine-waterfall` | `cd0a4996` | #2 | digest + filename | `inputs/ci/identity.json`; board tgz |
| `dsh-shine-brand` | `6754f370` | #2 | digest + filename | — |
| `shinemage-board-components` | `68abb1ea` | #2 `codex/rc5-pack-rebuild` | bare digest | `vendor/PROVENANCE.json` |

`bare digest` is 64 hex + newline (65 B); `digest + filename` is `<sha>  dsh-plugin-kit-0.1.1.tgz` (91 B). Keep each repo's existing format: normalizing it is an unrelated diff, and each repo's `check-inputs`/`verify-pack` already accepts its own form. Every repo also carries the kit in `package.json` (exact devDependency) and `pnpm-lock.yaml` (`file:` specifier).

## 3. S0 re-vendor checklist (not executed)

Preconditions: owner authorization to write the 10 author repos; S0 has not started; main's `config/*lock*.json` and `dsh-plugins/plugin-kit/` are untouched by this preparation.

1. [ ] Cut the authoritative tarball from the merge commit on main: `node scripts/dsh-b0/cut-kit-artifact.mjs --commit origin/main --out /tmp/p4-s0-kit`; record `sha256=e2216168…`, `bytes=49341`, commit sha.
2. [ ] For each author repo, rebase/merge its open PR branch onto the current author `main` (the PR must carry the new kit, not just main); merge the stacked parents first (workbench #15, crm #2–#5).
3. [ ] Replace `vendor/dsh-plugin-kit-0.1.0.tgz` with `vendor/dsh-plugin-kit-0.1.1.tgz` = the cut tarball; delete the `0.1.0` file if it is still present.
4. [ ] Write `vendor/KIT-SHA256` in that repo's format with `e2216168…` (never a partial digest, never a filename mismatch).
5. [ ] Update the identity carriers: `inputs/ci/identity.json` `.kit.{version,sha256,file}` where present; `vendor/PROVENANCE.json` `.kit.{version,sha256}` for board-components.
6. [ ] Confirm `package.json` still declares `"@shine-mage/dsh-plugin-kit": "0.1.1"` and `pnpm-lock.yaml` still points at `file:vendor/dsh-plugin-kit-0.1.1.tgz`. No lock regeneration is expected; if `pnpm install --lockfile-only --ignore-scripts` changes bytes, stop and review why.
7. [ ] Verify before commit: `sha256sum vendor/dsh-plugin-kit-0.1.1.tgz` equals `vendor/KIT-SHA256`; the repo's own input check passes (`node scripts/check-inputs.mjs` for workbench with the fixed `B0_BUILD_UPSTREAM`/`B0_BUILD_TOOLS`/`DSH_PACKAGE_INPUTS`, `node scripts/verify-pack.mjs` elsewhere); `git diff --stat` touches only vendor/identity files.
8. [ ] Commit (e.g. `chore(kit): re-vendor @shine-mage/dsh-plugin-kit 0.1.1 (e2216168)`), push the PR branch, run the author CI to SUCCESS, and record run id + artifact id per repo.
9. [ ] After all 10 are green: `node scripts/dsh-b0/cut-kit-artifact.mjs --commit origin/main --check` must print `"drift": 0`, `"ok": true`, exit 0; all 10 `KIT-SHA256` files must read `e2216168…`; then update this manifest's `main`/`pr` rows and `authoritative` to the observed heads in the same change that records the evidence.
10. [ ] Only after S0 is green may a main PR re-pin `config/*lock*.json` and reseal (S1). S0 itself changes no main lock pin.

Command shape per repo (run inside a `/tmp` clone of the author repo on its PR branch):

```bash
KIT=/tmp/p4-s0-kit/shine-mage-dsh-plugin-kit-0.1.1.tgz
SHA=$(sha256sum "$KIT" | cut -d' ' -f1)                       # e2216168…
cp "$KIT" vendor/dsh-plugin-kit-0.1.1.tgz
printf '%s\n' "$SHA" > vendor/KIT-SHA256                      # bare-digest repos
printf '%s  dsh-plugin-kit-0.1.1.tgz\n' "$SHA" > vendor/KIT-SHA256   # digest+filename repos
node -e 'const fs=require("fs");const p="inputs/ci/identity.json";const j=JSON.parse(fs.readFileSync(p));j.kit={...j.kit,version:"0.1.1",sha256:process.argv[1],file:"vendor/dsh-plugin-kit-0.1.1.tgz"};fs.writeFileSync(p,JSON.stringify(j,null,2)+"\n")' "$SHA"
git add vendor/KIT-SHA256 vendor/dsh-plugin-kit-0.1.1.tgz inputs/ci/identity.json
git diff --cached --stat
```

For board-components replace the identity step with the same `.kit` update in `vendor/PROVENANCE.json`; for brand skip it. Do not edit `dsh-plugins/plugin-kit/` in main and do not touch the sealed artifact in S0.

## 4. What is still blocked

- Writing any author repo, pushing branches and running author CI requires the owner authorization recorded in plan C02/C03; this preparation did not do it.
- The 10 author artifacts pinned by main expire **2026-11-18/19**; if S0 runs after that, the author CI must be re-run before any re-pin.
- The new tarball must not be called published: distribution stays a private `file:` vendor, `release_ready=false`.
