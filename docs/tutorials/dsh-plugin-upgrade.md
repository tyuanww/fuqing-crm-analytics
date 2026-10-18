# Tutorial: update one plugin against a new Harness candidate

You will build one plugin, package it with generated-bytes provenance, and prepare it for an isolated Harness candidate. The main checkout and the current runtime remain unchanged.

## What you'll need

- Node `24.19.0`.
- The plugin repository and its fixed build inputs.
- A clean plugin commit.
- An official Harness tag and its upstream commit.
- An empty candidate output directory.

## Step 1: Build and test the plugin

Run the plugin's own frozen install, build, and tests from its development guide. Save the output in a private evidence directory.

```bash
export PATH=/Users/hutou/homebrew/opt/node@24/bin:$PATH
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm build
pnpm test
```

You should see a clean source commit, passing tests, and a generated `lib/` directory. If a plugin needs a different build command, use the command in that plugin's `DEVELOPMENT.md` and record the actual command.

## Step 2: Create the pack receipt

Generate a clean builder receipt, then package the plugin from the same source tree.

```bash
node scripts/release/plugin-pack.mjs \
  --plugin /absolute/plugin \
  --output-dir /absolute/evidence/packs \
  --manifest /absolute/evidence/packs/plugin-pack.json \
  --builder-receipt /absolute/plugin/.build-provenance.json
```

The output is a tarball and a `dsh-plugin-pack/v1` receipt. The receipt records the source SHA, source tree digest, generated tree digest, builder identity, and tarball SHA-256.

## Step 3: Read it as a consumer

Use the manifest digest when the candidate reads the pack.

```bash
node scripts/release/plugin-pack.mjs --help
node --test scripts/release/plugin-pack.test.mjs
```

The reader must reject a missing builder receipt, a dirty source tree, an ignored `lib/` replacement, a workspace link, and a changed tarball. A successful local read proves the pack contract. It does not prove formal release readiness.

## What you built

You now have one plugin pack that is bound to a clean source commit and a reproducible builder receipt. Add it to a new candidate profile-pack input set, run the candidate consumer closure, and keep the previous runtime available for rollback.

## Related

- [How to prepare an official Harness upgrade candidate](../operating/dsh-upgrade-candidate.md)
- [Plugin pack and provenance reference](../reference/dsh-plugin-pack-contract.md)
- [DSH plugin author quickstart](../operating/dsh-plugin-author-quickstart.md)
