# Author-pin review for the S0 refill

Read-only review of `origin/main` `97d4b0b590ffd1f16546e4eec0159093640ec9f6` against the current
locks and the ten author repositories (nine plugin rows plus the domain). No file under `config/`
was changed. This record is the review the follow-up `consumer.reviewed_sha` advance must cite.

Artifacts were collected at the `8bb713e` snapshot. `97d4b0b` landed during CI and changes only
`docs/plans/plugin-externalization-p0-p4-20261104.md`; the reviewed `config/` tree is byte-identical.

## Method

- Author heads: `gh api repos/tyuanww/<repo>/commits/main --jq .sha`.
- Reachability: `gh api repos/tyuanww/<repo>/compare/<pin>...main --jq .status` (`identical` means
  the pin is the current head; no pinned commit was merely an ancestor).
- Artifacts: `gh api repos/<repo>/actions/artifacts/<id>/zip`, then byte count and `sha256sum`.
  Formal packs were unzipped; `plugin-pack.json` was hashed against the lock `manifest_sha256`,
  the tarball against the source-manifest `pack_sha256`, and the receipt `source_sha` against the
  lock `source_sha`.
- Evidence: `gh api repos/<repo>/actions/runs/<run_id>` for `event`, `head_branch`, `head_sha` and
  `conclusion`; archive bytes/sha compared with each evidence lock; inner member digests checked
  for the workbench and domain archives.
- Sealed artifact: downloaded and listed; all 20 member digests compared with the locks; the
  canonical `.ci/rc3-composition.sha256` content was recomputed from those members.
- All digests were compared in full. Tables use 12-character prefixes only for width; artifact ids
  are full.

## Per-repo verdicts

| Repository (pin) | Author `main` | Reach | Formal pack | `plugin-pack` sha | Tarball sha | Verdict |
|---|---|---|---|---|---|---|
| `dsh-analytics-workbench` `ae922fa3ff80` | `ae922fa3ff80` | identical | 13417225006 | `735092d62e77` ✓ | `f83a65a48900` ✓ | PASS |
| `dsh-crm-knowledge` `86ff10b9926c` | `86ff10b9926c` | identical | 13416975700 | `fc760439b84a` ✓ | `aede350861b4` ✓ | PASS |
| `dsh-knowledge` `902a1b41307c` | `902a1b41307c` | identical | 13415718286 | `6f5e1e8c3a6a` ✓ | `69c65831b9da` ✓ | PASS |
| `dsh-shine-board` `97885ddfdfca` | `97885ddfdfca` | identical | 13415952674 | `948df5481cb2` ✓ | `a61332691832` ✓ | PASS |
| `dsh-shine-crowd-action` `dc6f0d2c2bf1` | `dc6f0d2c2bf1` | identical | 13416491962 | `c5d645395366` ✓ | `2106f688733f` ✓ | PASS |
| `dsh-shine-query` `7202f182af69` | `7202f182af69` | identical | 13416920276 | `5f8734a04350` ✓ | `404308bfab66` ✓ | PASS |
| `dsh-shine-funnel` `c3dd9d3c107a` | `c3dd9d3c107a` | identical | 13416417029 | `7bf222d84425` ✓ | `17494d3b2829` ✓ | PASS |
| `dsh-shine-waterfall` `d5d2c6fcb4aa` | `d5d2c6fcb4aa` | identical | 13416068079 | `53dd522e3bfb` ✓ | `aee1fa8a3366` ✓ | PASS |
| `dsh-shine-brand` `6aa335d29d59` | `6aa335d29d59` | identical | 13415099815 | `5dd648753a25` ✓ | `47a6450505b7` ✓ | PASS |

The receipt `source_sha` in all nine formal packs equals the lock `source_sha`; package names and
versions also match. The source manifest `sha`/`manifest_sha256` fields equal the lock rows for all
nine. The current lock (as opposed to the brief) has nine plugin rows, not ten; those nine plus the
domain are the ten author repositories reviewed here.

## Evidence locks

Receivers accept `pull_request` or `push`; for `push` they require the repository default branch
(`main`) and `run.head_sha == source_sha`.

| Lock / owner | Run | Event | Branch | Head vs source | Archive id / sha256 / bytes |
|---|---|---|---|---|---|
| `workbench-author-evidence` | 42031523764 | push | main | equal (`ae922fa3`) | 13416602588 / `71d1e9cc9d57` / 654531 |
| `domain-author-evidence` | 42030897866 | push | main | equal (`4245aa81`) | 13416002428 / `533649d98390` / 11357 |
| `public-contract-inputs` workbench | 42031523764 | push | main | equal (`ae922fa3`) | 13416851263 / `c490b1894aa1` / 66273 |
| `public-contract-inputs` crm | 42031515425 | push | main | equal (`86ff10b9`) | 13416776446 / `8f7a8203be80` / 2788 |
| `public-contract-inputs` brand | 42031506827 | push | main | equal (`6aa335d2`) | 13415588775 / `807f0a3a684b` / 1740 |

All five runs are `completed`/`success`; archive bytes and sha256 match the locks. Inner digests
for the workbench archive (`content_pack` `cfee9aad`, `plan` `2dceefb5`, `result` `5ae07764`) and
the domain archive (receipt `90f0195d`, geometry/producer logs, reference `22245ab9`) also match.

## Domain

- `domain-author-evidence.lock.json` source `4245aa81…` equals author `main` and
  `shinemage-domain-pack-manifest.v1.json` `reviewed_sha`.
- Content pack `66d53381…` / 1951 B equals the lock `files.content_pack`, the composition manifest
  `domains[0].pack_sha256`, and the sealed domain tarball. Author archive `13416002428` /
  `533649d9…` / 11357 B matches the lock.
- The composition manifest `manifest_sha256` `99989ec7…` was recomputed from
  `domain/board-components-pack.json` in the sealed artifact. Its `source_sha`, tarball, source
  tree (`08cf537e`), generated tree (`899a2598`), builder receipt (`6121c78f`) and node/pnpm match
  the domain manifest. Verdict: **PASS (derived)**.
- `shinemage-board-components` publishes only `board-components-ci-evidence-*`, not a separate
  formal-pack artifact. The domain pack manifest is therefore a refill derivation from the author
  content pack plus the author tree; the digest is not independently attested by the author.

## Sealed artifact

- Lock: id `13417537931`, sha256 `b1fb2976c6299136224240422f5f64a701e36100ecd73ef40b234a235b358589`,
  838651 B, run `42035243845` (`push`, success), head `b29a84f3ac18ab2b499e8752fada47fbe4feed76`.
- `composition_lock_sha256` `81a10f70…` equals the actual `config/shinemage-composition-packs.lock.json`
  and the composition manifest `lock.sha256`.
- 20 members (nine plugin manifest/tarball pairs plus domain manifest/tarball). Every member digest
  matches the corresponding lock field; every sealed pack byte equals the downloaded formal pack.
  Recomputed canonical sums: `e181cfa0ecd7d85ffe852d211e1f8a61f6cfb4fbdf60c61b274ad705c7d21c13`.
  Verdict: **PASS**.
- `b29a84f3` is the sealing-branch commit (parent `3aab173`), not main: `compare` reports diverged
  (3 ahead, 1 behind). Provenance rests on the artifact digest plus the composition-lock binding,
  not on main ancestry.

## What did not check out / notes

No digest, source-sha, event, branch or binding mismatch was found. Deviations from the brief:
the lock has nine plugin rows (ten author repositories counting the domain), and the 2026-11-19
expiry applies to the author artifacts, not the sealed artifact.

## Residual risks

1. **Author artifact expiry 2026-11-19.** The nine formal-pack artifacts and the evidence archives
   expire then; after that date they cannot be re-downloaded. The sealed artifact expires
   2027-02-03. Keep an external copy or finish any re-verification before the author expiry.
2. **Brand behavior change.** Pinned `6aa335d2` includes `ff866cfc` (`feat(brand): stop overriding
   the runtime document title`). Downstream checks must not expect a `document.title` write; the
   main-repo integration assertion was already adjusted in this refill.
3. **Domain manifest is derived.** `99989ec7` is a refill construction, not an author-published
   domain formal-pack digest; there is no independent author-side attestation of that JSON.
4. **Sealed head is not main-reachable.** `b29a84f3` is a sealing-branch commit by design;
   regenerating or re-verifying the artifact requires the sealing branch/workflow, not just main.
5. **Deletion gate remains blocked** (at review time `remote_main_not_verified`, `production_only_closure_not_recorded`;
   `remote_main_not_verified` is now closed and the remaining reason is `real_host_acceptance_not_recorded`).
   This review did not change it and did not advance `consumer.reviewed_sha`.

## Verdict

REVIEWED_SHA_CANDIDATE = 97d4b0b590ffd1f16546e4eec0159093640ec9f6
REVIEWED_SHA_VERDICT = PASS_WITH_NOTES

This PR does not advance `consumer.reviewed_sha` (still `60d7f4e8…`). The follow-up that changes
that one line must reference this document, `docs/operating/author-pin-review-20261105.md`.

**2026-11-05 follow-up.** #260 advanced `consumer.reviewed_sha` to `727f4b94…` after this review; the verdict above is unchanged.
