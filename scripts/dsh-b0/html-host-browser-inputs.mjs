/** Read-only guards for the explicitly requested isolated HTML host probe. */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readFile, readdir, realpath } from "node:fs/promises";
import {
  basename,
  dirname,
  isAbsolute,
  join,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath } from "node:url";

export const probeRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "../..",
);
export const sha256 = (bytes) =>
  createHash("sha256").update(bytes).digest("hex");
const choices = new Set([
  "--input",
  "--output",
  "--python",
  "--playwright",
  "--port",
]);

/** Do not let ambient Git selectors/config, replacement refs or fsmonitor select or execute another repository. */
export function readOnlyGit(cwd, args) {
  return execFileSync(
    "/usr/bin/git",
    [
      "--no-optional-locks",
      "-C",
      cwd,
      "-c",
      "core.fsmonitor=false",
      "-c",
      "core.hooksPath=/dev/null",
      ...args,
    ],
    {
      cwd,
      encoding: "utf8",
      timeout: 5000,
      maxBuffer: 2 * 1024 * 1024,
      env: {
        PATH: "/usr/bin:/bin",
        GIT_NO_REPLACE_OBJECTS: "1",
        GIT_CONFIG_NOSYSTEM: "1",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_TERMINAL_PROMPT: "0",
      },
    },
  ).trim();
}

export function parseProbeArguments(args) {
  const options = { port: 4328, run: false, check: false };
  for (let i = 0; i < args.length; i += 1) {
    const key = args[i];
    if (key === "--run-isolated-host" || key === "--check") {
      const name = key === "--check" ? "check" : "run";
      assert.equal(options[name], false, "HTML_PROBE_DUPLICATE");
      options[name] = true;
      continue;
    }
    assert.ok(
      choices.has(key) && typeof args[i + 1] === "string",
      "HTML_PROBE_ARGUMENT",
    );
    const name = key.slice(2);
    assert.ok(
      !Object.hasOwn(options, name) || (name === "port" && !options.portSet),
      "HTML_PROBE_DUPLICATE",
    );
    options[name] = args[++i];
    if (name === "port") options.portSet = true;
  }
  assert.notEqual(options.check, options.run, "HTML_PROBE_EXPLICIT_OPT_IN");
  for (const name of ["input", "output", "python", "playwright"]) {
    assert.ok(
      isAbsolute(options[name] ?? ""),
      `HTML_PROBE_ABSOLUTE_${name.toUpperCase()}`,
    );
  }
  options.port = Number(options.port);
  assert.ok(
    Number.isInteger(options.port) &&
      options.port >= 1024 &&
      options.port <= 65535 &&
      options.port !== 6677,
    "HTML_PROBE_OWNED_PORT",
  );
  return options;
}

function inside(parent, child) {
  const path = relative(parent, child);
  return (
    path === "" ||
    (path !== ".." && !path.startsWith("../") && !isAbsolute(path))
  );
}

/** Canonicalize aliases before the exclusive output creation. */
async function canonicalPath(path) {
  try {
    return await realpath(path);
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
    return join(await canonicalPath(dirname(path)), basename(path));
  }
}

export async function validateProbeOutput(requested, checks, inputs = []) {
  assert.ok(isAbsolute(requested), "HTML_PROBE_OUTPUT_ABSOLUTE");
  const outputParent = await realpath(dirname(requested));
  const output = join(outputParent, requested.split("/").at(-1));
  checks = await realpath(checks);
  assert.ok(
    inside(checks, output) && output !== checks,
    "HTML_PROBE_OUTPUT_CHECKS_ONLY",
  );
  for (const input of inputs) {
    const path = await canonicalPath(input);
    assert.ok(
      !inside(output, path) && !inside(path, output),
      "HTML_PROBE_OUTPUT_INPUT_ALIAS",
    );
  }
  try {
    await lstat(output);
    throw new Error("HTML_PROBE_OUTPUT_EXISTS");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return output;
}

async function regularFile(path, maxBytes = 20 * 1024 * 1024) {
  const stat = await lstat(path);
  assert.ok(
    stat.isFile() && !stat.isSymbolicLink(),
    `HTML_PROBE_REGULAR_FILE ${path}`,
  );
  assert.ok(stat.size <= maxBytes, "HTML_PROBE_FILE_LIMIT");
  return readFile(path);
}

export async function sourceDigests(source) {
  const names = [
    "package.json",
    "build.mjs",
    "author-inputs.mjs",
    "toolchain.mjs",
    "pack-skills.mjs",
    "src",
    "test",
    "skills",
    "bundled-dependencies.json",
    "cordis.patch.yml",
    ...(await readdir(source)).filter((name) =>
      name.endsWith("skill-package.lock.json"),
    ),
  ];
  const files = {};
  async function visit(name) {
    const path = join(source, name),
      stat = await lstat(path);
    assert.ok(!stat.isSymbolicLink(), "HTML_PROBE_SOURCE_SYMLINK");
    if (stat.isDirectory()) {
      for (const child of (await readdir(path)).sort())
        await visit(join(name, child));
    } else {
      assert.ok(stat.isFile(), "HTML_PROBE_SOURCE_REGULAR");
      files[name] = sha256(await readFile(path));
    }
  }
  for (const name of names) await visit(name);
  return files;
}

/** Check the whole received tree, before runtime peer links create additional files. */
export async function verifyReceivedMembers(extracted, expected) {
  const files = {};
  async function visit(path, name) {
    const stat = await lstat(path);
    assert.ok(!stat.isSymbolicLink(), "HTML_PROBE_RECEIVED_SYMLINK");
    if (stat.isDirectory()) {
      for (const child of await readdir(path))
        await visit(join(path, child), join(name, child));
    } else {
      assert.ok(stat.isFile(), "HTML_PROBE_RECEIVED_REGULAR");
      files[name] = sha256(await regularFile(path));
    }
  }
  for (const name of await readdir(extracted))
    await visit(join(extracted, name), name);
  assert.deepEqual(files, expected, "HTML_PROBE_RECEIVED_MEMBERS");
  return files;
}

/** Validate before creating output or starting any child. This does not build or prepare a SDK. */
export async function validateProbeInputs(options, root = probeRoot) {
  assert.equal(
    Number(process.versions.node.split(".")[0]),
    24,
    "HTML_PROBE_NODE_24",
  );
  root = await realpath(root);
  const inputBytes = await regularFile(options.input, 2 * 1024 * 1024),
    input = JSON.parse(inputBytes);
  assert.equal(
    input.schema,
    "html-host-input-audit/v1",
    "HTML_PROBE_INPUT_SCHEMA",
  );
  assert.match(
    input.archive_sha256 ?? "",
    /^[a-f0-9]{64}$/,
    "HTML_PROBE_ARCHIVE_DIGEST",
  );
  assert.match(input.head ?? "", /^[a-f0-9]{40}$/, "HTML_PROBE_SOURCE_HEAD");
  const head = readOnlyGit(root, ["rev-parse", "HEAD"]);
  assert.equal(head, input.head, "HTML_PROBE_HEAD_CHANGED");
  const upstream = await realpath(input.upstream);
  const pinBytes = await readFile(
    join(root, "dsh-plugins/plugin-kit/toolchain.json"),
  );
  const pin = JSON.parse(pinBytes);
  const pinned =
    pin.upstream?.commit ??
    pin.upstream?.sha ??
    pin.dsh?.commit ??
    pin.dsh?.sha;
  // This harness validates rc2 and must be reviewed before another host contract is used.
  const rc2 = "477b4f420553e8a52c2fbccc464d7561b239c443";
  assert.ok(pinBytes.includes(rc2), "HTML_PROBE_PIN_UNSUPPORTED");
  if (pinned) assert.equal(pinned, rc2, "HTML_PROBE_PIN");
  assert.equal(
    readOnlyGit(upstream, ["rev-parse", "HEAD"]),
    rc2,
    "HTML_PROBE_UPSTREAM_SHA",
  );
  assert.equal(
    readOnlyGit(upstream, ["status", "--porcelain", "--untracked-files=no"]),
    "",
    "HTML_PROBE_UPSTREAM_DIRTY",
  );
  assert.equal(
    sha256(pinBytes),
    input.pin_sha256,
    "HTML_PROBE_TOOLCHAIN_CHANGED",
  );
  const cli = join(upstream, "apps/cli/lib/bin.js");
  assert.equal(
    sha256(await regularFile(cli)),
    input.cli_sha256,
    "HTML_PROBE_CLI_CHANGED",
  );
  await regularFile(join(upstream, "apps/web/dist/index.html"));
  assert.ok(
    isAbsolute(input.archive ?? "") && input.archive.endsWith(".tgz"),
    "HTML_PROBE_ARCHIVE_PATH",
  );
  const archive = await realpath(input.archive),
    archiveBytes = await regularFile(input.archive);
  assert.ok(archiveBytes.length < 20 * 1024 * 1024, "HTML_PROBE_ARCHIVE_LIMIT");
  assert.equal(
    sha256(archiveBytes),
    input.archive_sha256,
    "HTML_PROBE_ARCHIVE_CHANGED",
  );
  const source = join(root, "dsh-plugins/analytics-workbench"),
    author = await realpath(input.author_plugin);
  const current = await sourceDigests(source);
  assert.deepEqual(current, input.source_files, "HTML_PROBE_SOURCE_CHANGED");
  for (const [name, digest] of Object.entries(current)) {
    assert.equal(
      sha256(await regularFile(join(author, name))),
      digest,
      `HTML_PROBE_AUTHOR_SOURCE ${name}`,
    );
  }
  assert.ok(
    input.package_files && Object.keys(input.package_files).length === 8,
    "HTML_PROBE_PACKAGE_CONTRACT",
  );
  for (const [name, digest] of Object.entries(input.package_files)) {
    assert.match(
      name,
      /^package\/(?:package\.json|cordis\.patch\.yml|bundled-dependencies\.json|lib\/(?:client|index|page-tools|skills|tool)\.js)$/,
      "HTML_PROBE_PACKAGE_MEMBER",
    );
    assert.match(digest, /^[a-f0-9]{64}$/, "HTML_PROBE_PACKAGE_MEMBER_DIGEST");
    if (name !== "package/package.json")
      assert.equal(
        sha256(await regularFile(join(author, name.slice(8)))),
        digest,
        "HTML_PROBE_AUTHOR_BUILD_CHANGED",
      );
  }
  const output = await validateProbeOutput(
    options.output,
    join(root, ".context/checks"),
    [upstream, author, archive, source, await realpath(options.input)],
  );
  assert.match(
    execFileSync(
      options.python,
      ["-I", "-c", 'import sys; print("%d.%d" % sys.version_info[:2])'],
      {
        encoding: "utf8",
        timeout: 5000,
        killSignal: "SIGKILL",
        maxBuffer: 1024,
      },
    ).trim(),
    /^3\.1[4-9]$/,
    "HTML_PROBE_PYTHON_314",
  );
  await regularFile(options.playwright);
  return {
    root,
    output,
    upstream,
    input,
    input_sha256: sha256(inputBytes),
    source_count: Object.keys(current).length,
  };
}
