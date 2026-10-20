# How to prepare an official Harness upgrade candidate

Use this guide when DeepSeek Harness publishes a new tag and you want to test it with the existing plugins. The guide keeps the current runtime available while the new candidate is built, checked, and made reversible.

## What this flow protects

The main checkout keeps its current DSH pin. The candidate uses a separate checkout, runtime directory, profile, pack inputs, and evidence directory. A successful candidate does not change the main pin or production state. For the current rc1 clean rebuild, follow [the dedicated runbook](./dsh-rc1-clean-upgrade-runbook.md) and use [the candidate reference](../reference/dsh-rc1-clean-candidate.md) for receipt fields.

The internal engineering line and the main compatibility line are separate. The main checkout still reads its default compatibility pin from `dsh-plugins/plugin-kit/toolchain.json`; the rc1 candidate is built in an isolated lane with its own upstream, runtime, profile, and receipt. Read [STATUS.md](../../STATUS.md) before selecting a new tag; do not use the checkout's compatibility pin as the rc1 candidate identity.

## Inputs

Record these values before building anything:

| Input | Required value |
| --- | --- |
| Official tag | A fixed tag such as `dsh-v0.2.1-rc.1` |
| Upstream commit | The commit resolved from that tag |
| SDK or runtime tarball | Version, SHA-256, and registry integrity |
| Plugin source | A clean commit for every plugin source tree |
| Plugin pack inputs | Profile, package manifest, tarball, and digest for each selected plugin |
| Node | `24.19.0` for the current plugin lane |
| Plugin pnpm | `11.28.2` for plugin and build-tools work |
| Upstream pnpm | The version required by the selected Harness source |
| Fallback | The currently usable runtime and its receipt |

The upstream lock may use a different pnpm version from the plugin toolchain. Record both roles. Do not replace either value with `latest`.

## Prepare an isolated candidate

1. Create a clean candidate checkout from the official tag.

   ```bash
   git clone https://github.com/deepseek-ai/deepseek-harness.git /absolute/candidate/harness
   git -C /absolute/candidate/harness checkout --detach dsh-v0.2.1-rc.1
   git -C /absolute/candidate/harness rev-parse HEAD
   ```

2. Select Node 24 and the plugin toolchain.

   ```bash
   export PATH=/Users/hutou/homebrew/opt/node@24/bin:$PATH
   node --version
   pnpm --version
   ```

3. Build the host and client SDK in the candidate checkout. Keep the source, lock, and generated provenance under the candidate evidence root.

4. Build and test each plugin in its own repository. Record the plugin source SHA, tree digest, generated tree digest, tarball digest, builder Node, and builder pnpm.

5. Generate the plugin pack with an explicit builder receipt.

   ```bash
   node scripts/release/plugin-pack.mjs \
     --plugin /absolute/plugin \
     --output-dir /absolute/evidence/packs \
     --manifest /absolute/evidence/packs/plugin-pack.json \
     --builder-receipt /absolute/plugin/.build-provenance.json
   ```

   The pack reader requires `dsh-generated-bytes/v1` provenance. The receipt must bind the source tree, generated tree, builder identity, and tarball bytes.

6. Build a new profile-pack input file. Every manifest and tarball must be consumed from the selected candidate subject set. Do not mix an old rc2, alpha2, or alpha4 pack with the new candidate.

7. Keep the official plugin-market bundle in the profile. A visible market shell without its bundle or index is not a recovered plugin market.

## Run the local closure

Use a fresh staging directory and an empty HOME. Install the SDK, `dsh-tools`, Cordis, and the plugin tarballs with production-only dependencies. Then generate the dependency graph, SBOM, runtime import receipt, and provenance receipt from the same manifest.

The closure must have no peer resolution errors, no `--force`, no `--legacy-peer-deps`, no missing runtime CSS (已验证候选 runtime), and no dependency that exists only in development dependencies. The runtime builder also fails closed when an explicit web-plugin peer alias is absent; it must not defer the error to browser boot.

## Run the lifecycle smoke

Use a fresh runtime and synthetic or de-identified fixture data. Start only the candidate-owned processes. Read history and board data in a real headed browser. Restart the candidate and read the same session, board, version, and source SHA again.

For the native board canvas, start the isolated page HTTP service explicitly:

```bash
node scripts/dsh-dev/cli.mjs start \
  --plugin on \
  --web-port 14327 \
  --runtime /absolute/runtime \
  --page-http on \
  --page-http-port 18140 \
  --pack-inputs /absolute/profile-pack-inputs.json \
  --detach
```

The page HTTP listener is separate from the DSH web port. Without it, the page store remains unconfigured and the native board canvas stays unavailable by design.

## Record the result

Keep one machine-readable receipt with these fields:

- candidate SDK, upstream SHA, source SHA, Node, and pnpm;
- profile, plugin pack, fixture, and runtime digests;
- pre-restart and post-restart browser observations;
- owned process IDs and released ports;
- rollback scope and every `NOT_RUN` item;
- IM package/index status and the production switch decision;
- `formal_company_evidence`, `release_ready`, and the formal M2 disposition.

Local candidate evidence does not become company release evidence automatically. Keep `M2-07=BLOCKED`, `M2-08=NOT_RUN`, `M2-09=NOT_RUN`, and `release_ready=false` until the formal inputs and approvals exist.

## Roll back

Stop the candidate-owned processes, remove only the candidate-owned runtime, and reinstall the previously verified fallback into a separate runtime directory. Check version, help, import, and the fallback receipt. Code rollback does not prove data rollback.

## Related

- [DSH plugin author quickstart](dsh-plugin-author-quickstart.md)
- [How to update one plugin](shinemage-plugin-update.md)
- [Plugin pack and provenance reference](../reference/dsh-plugin-pack-contract.md)
- [Engineering closeout and formal gates](../hackathon/evidence/engineering-closeout-20261017.md)
