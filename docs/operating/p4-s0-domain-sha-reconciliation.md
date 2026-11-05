# P4 S0 domain sha reconciliation

Prepared 2026-11-05 against `origin/main` `f8aa3fa` (the domain config is unchanged since `304abf9f`). This is a resolution recipe, not an execution: nothing under `config/` was edited, no domain pack was rebuilt, and the sealed artifact was not touched. The S0 kit prerequisite is in [`p4-s0-kit-revendor.md`](p4-s0-kit-revendor.md).

## 1. What the two values actually are

| File / field | Value | What it is |
|---|---|---|
| `config/shinemage-domain-pack-manifest.v1.json` `reviewed_sha` | `e78e040e14792c89f99a2e3181004dbdaefd9bf6` | Head commit of **PR #1** (`docs(board-components): align local delivery and manager setup`), merged into author `main` as `68abb1ea…`. The reviewed source of pack `22245ab9…`. |
| same manifest `pack_sha256` / `pack_bytes` / `manifest_sha256` | `22245ab9…` / 1,955 / `c756fb4b…` | The reviewed/sealed domain tarball and its pack manifest digest. |
| `config/shinemage-composition-pack-manifest.v1.json` `domains[0]` | `sha=e78e040e…`, `pack_sha256=22245ab9…`, `manifest_sha256=0a9e566c…` | The composition lock's mirror of the same row (different `manifest` field: the *pack manifest*, not the registry row). |
| `config/domain-author-evidence.lock.json` `source_sha` | `26de61fc783ecf0c2fb38a89ad2901e92e15f1c8` | Head commit of **PR #2** (`chore(board-components): re-vendor @shine-mage/dsh-plugin-kit 0.1.1`), still open. Author CI run `41871488443` captured its evidence archive and rebuilt content pack `66d53381…` (1,951 B). |
| author `main` (`tyuanww/shinemage-board-components`) | `68abb1ead321a4772f337ad8fa12e4246e0d3db7` | The merge commit of PR #1; no PR after it has merged. |

So neither value is author `main`, and they name two different commits — but not two different products.

## 2. Proof that this is a label split, not a content split

Read-only evidence, 2026-11-05 (`gh api`, full recursive tree + raw contents):

- `tree(e78e040e)` == `tree(68abb1ea)` exactly: 30/30 blobs identical. The PR #1 head and the author `main` merge commit have the same tree.
- `tree(26de61fc)` differs from `68abb1ea` in exactly 7 paths: `package.json`, `pnpm-lock.yaml`, `scripts/check-inputs.mjs`, `vendor/KIT-SHA256`, `vendor/PROVENANCE.json`, `vendor/dsh-plugin-kit-0.1.0.tgz`, `vendor/dsh-plugin-kit-0.1.1.tgz`. That is the kit re-vendor only; no `library/` path changed.
- The library bytes are identical at `e78e040e`, `68abb1ea` and `26de61fc`: `library/src/funnel.mjs` sha256 `aebd9f3c…`, `library/src/waterfall.mjs` sha256 `63aa6dc6…`, `library/package.json` sha256 `c82cc3af…`. The first two equal the corresponding `lock.members` (`package/lib/funnel.mjs`, `package/lib/waterfall.mjs`), so the reviewed pack members are exactly the author library bytes at all three refs.
- `domain-author-evidence.lock.json` binds both tarballs to the same five members: `reference` (`22245ab9…`) and `content_pack` (`66d53381…`) are both asserted equal to `lock.members` (the receiver checks this: `scripts/ci/domain-author-evidence.mjs` `DOMAIN_AUTHOR_REFERENCE_MEMBERS` / `DOMAIN_AUTHOR_BUILT_MEMBERS`). The 4-byte outer difference is pack metadata from the author rebuild, not content.

## 3. Which source wins

The **pack manifest wins for pack identity**. `config/shinemage-domain-pack-manifest.v1.json` (mirrored by `domains[0]` in the composition manifest) is what the lock chain verifies: `scripts/ci/composition-pack-inputs.mjs:174` passes `row.sha` as `expectedSourceSha`, and `scripts/release/domain-pack.mjs:110` compares it to the **pack receipt's** `source_sha`, not to a Git ref. The evidence lock is author-CI coverage for whatever commit the pack pins; it follows, it does not dictate.

Consequently, a valid reconciliation must land on one commit `M` such that all three hold: `lock.source_sha == manifest.reviewed_sha == author main`. Today none of the two values can be edited into that state on its own.

## 4. Why this PR does not "just fix" either value

Both candidate one-field edits break a real check, so no provable replacement exists in-tree:

- `manifest.reviewed_sha = 68abb1ea` (and `domains[0].sha`) fails `DOMAIN_PACK_SOURCE_SHA_MISMATCH`: the sealed pack's internal receipt still says `source_sha=e78e040e`; the manifest would disagree with the bytes it pins.
- `lock.source_sha = 68abb1ea` fails `DOMAIN_AUTHOR_SOURCE` (`scripts/ci/domain-author-evidence.mjs:93`): the archive is from run `41871488443` at `26de61fc`, its receipt binds `source.sha=26de61fc`, and authoritative runs on `main` are `event=push`, which `DOMAIN_AUTHOR_EVENT` (line 37) rejects.
- Swapping the manifest to the PR rebuild `66d53381…` would change sealed bytes for zero content change and force a reseal with no provenance gain.

Nothing in `config/` is stale-with-a-provable-replacement, so this preparation records the recipe instead of editing locks.

## 5. Exact fix, in order

Prerequisite: S0 kit re-vendor complete (`cut-kit-artifact.mjs --check` exit 0). The board-components PR #2 currently vendors the stale `a527b2a5…`, so it must be re-vendored before its evidence can be used.

1. **Re-vendor board-components.** Update PR #2 to `vendor/dsh-plugin-kit-0.1.1.tgz` = `e2216168…` (same five carriers as the other repos: tarball, `KIT-SHA256`, `vendor/PROVENANCE.json`, `package.json`, lock). Push; author CI green at head `H`.
2. **Land one commit as author main.** Fast-forward `main` to `H` (`git push origin H:main`) so `M := H` is both the pull-request head that CI reviewed and author `main`. The evidence receiver only accepts `event=pull_request`, so an ordinary merge/rebase commit would leave `main != evidence sha`. If branch protection forbids the fast-forward, do one of: (a) land a main-repo change that lets the receiver accept push runs on `main` (its own PR, before S1), or (b) keep a merge commit and accept `lock.source_sha != author main` — do not do (b) silently.
3. **Repack the domain at `M`.** Run the author's fixed build/test flow offline in the author repo (`library/` build + `verify-pack`, the same seven-step author entry). Expect the five member hashes to stay `22245ab9`'s members; the new tarball `P'` and receipt (`source_sha=M`) will differ in outer bytes, exactly as `66d53381…` did.
4. **Re-pin the evidence lock** `config/domain-author-evidence.lock.json` from the new author run `R` at `M`: `source_sha=M`, `archive.{run_id,attempt,event=pull_request,artifact_id,sha256,bytes}` from `R`, `source_files=30`, `source_inventory_sha256` recomputed from `R`'s receipt (the vendor tarball changed), `files.*` paths/digests/bytes from `R`, `members` unchanged (assert), `reference` unchanged.
5. **Re-pin the pack manifest** `config/shinemage-domain-pack-manifest.v1.json`: `reviewed_sha=M`, `pack_sha256=P'`, `pack_bytes`, `manifest_sha256` = the new pack manifest digest, `builder.*` = the new receipt's builder block.
6. **Mirror the composition row** `config/shinemage-composition-pack-manifest.v1.json` `domains[0]`: `sha=M`, `pack_sha256=P'`, `manifest_sha256`, and a fresh `status=PASS` with its evidence.
7. **Reseal the sealed artifact's domain member.** Replace `.ci/packs/domain/{plugin-pack.json,*.tgz}` with the reviewed pack files, recompute the sealed sums, then `respin-composition-artifact.mjs` for the dependency re-point and update `config/shinemage-composition-artifact.lock.json`. Keep `RUNTIME_HOST_SOURCE` at the old sealed head until this rebuild is verified.
8. **Re-run the gates:** `node --test scripts/ci/composition-pack-inputs.test.mjs`, `node --test scripts/ci/domain-author-evidence.test.mjs`, `node scripts/release/respin-composition-artifact.mjs --check`, and `node scripts/release/domain-pack.mjs --manifest <pack manifest> --manifest-sha256 <digest> --source-sha M`.

Steps 4–7 are one single-writer change (hotspot rule): a partial land leaves the lock chain inconsistent.

### Cheaper alternative (owner decision, no reseal)

Keep the reviewed pack `22245ab9…` and `reviewed_sha=e78e040e` untouched, and re-capture the evidence lock from the **PR #1** run `/artifact` (source `e78e040e`, `event=pull_request`) rather than the PR #2 run. Then `lock.source_sha == manifest.reviewed_sha == e78e040e`, and since `tree(e78e040e) == tree(68abb1ea)` the reviewed source is byte-identical to author `main`. This closes the split with no repack and no reseal, but it satisfies "one sha" **by tree equality**, not by sha equality: G6/S1 wording must then define the domain identity as "reviewed sha whose tree equals author main", and `e78e040e` is what the sealed pack receipt already carries. Do not mix the two options: either all three fields move to `M` with a reseal, or all three stay on `e78e040e` with the tree-equality amendment.

## 6. Do not

- Do not edit only `reviewed_sha` or only `lock.source_sha`; each breaks a digest/binding assertion above.
- Do not put `66d53381…` into the manifest; it is a content-identical rebuild, not the sealed pack.
- Do not repack before S0: PR #2 would still vendor `a527b2a5…` and the new evidence would bind a stale kit.
- Do not move `config/shinemage-composition-artifact.lock.json` without rebuilding the domain member first; the respin helper re-copies existing `.ci` members and fails closed on drift.

## 7. Evidence commands (read-only)

```bash
gh api repos/tyuanww/shinemage-board-components/pulls/1 --jq '{state,head:.head.sha,merge_commit_sha}'
gh api repos/tyuanww/shinemage-board-components/pulls/2 --jq '{state,head:.head.sha}'
gh api repos/tyuanww/shinemage-board-components/commits/main --jq .sha
gh api "repos/tyuanww/shinemage-board-components/git/trees/<sha>?recursive=1" --jq '.tree[]|select(.type=="blob")|"\(.path) \(.sha)"' | sort
gh api "repos/tyuanww/shinemage-board-components/contents/library/src/funnel.mjs?ref=<sha>" --jq .content | base64 -d | sha256sum
```

Observed: PR #1 head `e78e040e`, merge `68abb1ea`; PR #2 head `26de61fc`, open; `main` `68abb1ea`; trees as in §2; `library/src/funnel.mjs` = `aebd9f3c…` at all three refs.
