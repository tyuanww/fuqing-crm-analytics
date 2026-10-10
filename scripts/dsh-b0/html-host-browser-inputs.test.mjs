import test from "node:test";
import assert from "node:assert/strict";
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
import {
  parseProbeArguments,
  validateProbeOutput,
  validateProbeInputs,
  verifyReceivedMembers,
  sha256,
  readOnlyGit,
} from "./html-host-browser-inputs.mjs";

const args = [
  "--input",
  "/owned/input.json",
  "--output",
  "/owned/new",
  "--python",
  "/owned/python",
  "--playwright",
  "/owned/playwright.mjs",
];

test("the probe needs an explicit read-only check or isolated-host opt-in", () => {
  assert.throws(() => parseProbeArguments(args), /EXPLICIT_OPT_IN/);
  assert.throws(
    () => parseProbeArguments([...args, "--check", "--run-isolated-host"]),
    /EXPLICIT_OPT_IN/,
  );
  assert.equal(parseProbeArguments([...args, "--check"]).run, false);
  assert.equal(parseProbeArguments([...args, "--run-isolated-host"]).run, true);
});

test("malformed paths, duplicate flags and the occupied production port cannot be selected", () => {
  assert.throws(
    () => parseProbeArguments([...args, "--check", "--port", "6677"]),
    /OWNED_PORT/,
  );
  assert.throws(
    () =>
      parseProbeArguments([
        ...args,
        "--check",
        "--port",
        "4328",
        "--port",
        "4329",
      ]),
    /DUPLICATE/,
  );
  assert.throws(
    () => parseProbeArguments([...args, "--check", "--unknown", "x"]),
    /ARGUMENT/,
  );
  assert.throws(
    () => parseProbeArguments(["--check", "--input", "./input"]),
    /ABSOLUTE/,
  );
});

async function owned(t) {
  const root = await mkdtemp(join(tmpdir(), "html-probe-guard-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "checks"));
  await mkdir(join(root, "outside"));
  return root;
}

test("output parent aliases are checked by their real location before any write", async (t) => {
  const root = await owned(t),
    checks = join(root, "checks");
  await symlink(join(root, "outside"), join(checks, "alias"), "dir");
  await assert.rejects(
    validateProbeOutput(join(checks, "alias/new"), checks),
    /CHECKS_ONLY/,
  );
  await assert.rejects(lstat(join(root, "outside/new")), { code: "ENOENT" });
});

test("an existing output and all its evidence are preserved", async (t) => {
  const root = await owned(t),
    checks = join(root, "checks"),
    output = join(checks, "first");
  await mkdir(output);
  await writeFile(join(output, "failure.json"), '{"status":"FAIL"}');
  await assert.rejects(validateProbeOutput(output, checks), /OUTPUT_EXISTS/);
  assert.equal(
    await readFile(join(output, "failure.json"), "utf8"),
    '{"status":"FAIL"}',
  );
});

test("a candidate output cannot contain or enter an input subtree", async (t) => {
  const root = await owned(t),
    checks = join(root, "checks");
  await mkdir(join(checks, "input"));
  await assert.rejects(
    validateProbeOutput(join(checks, "input/new"), checks, [
      join(checks, "input"),
    ]),
    /INPUT_ALIAS/,
  );
  await assert.rejects(
    validateProbeOutput(join(checks, "new"), checks, [
      join(checks, "new/input"),
    ]),
    /INPUT_ALIAS/,
  );
  await assert.rejects(lstat(join(checks, "new")), { code: "ENOENT" });
});

test("invalid evidence and symlinked evidence fail before output creation or host launch", async (t) => {
  const root = await owned(t),
    input = join(root, "invalid.json"),
    output = join(root, "checks/run");
  await writeFile(input, '{"schema":"wrong"}');
  const options = {
    input,
    output,
    python: "/not-invoked",
    playwright: "/not-invoked",
  };
  await assert.rejects(validateProbeInputs(options), /INPUT_SCHEMA/);
  await symlink(input, join(root, "alias.json"));
  await assert.rejects(
    validateProbeInputs({ ...options, input: join(root, "alias.json") }),
    /REGULAR_FILE/,
  );
  await assert.rejects(lstat(output), { code: "ENOENT" });
});

test("oversize synthetic evidence is rejected before reading its body or spawning children", async (t) => {
  const root = await owned(t),
    input = join(root, "large.json"),
    output = join(root, "checks/run");
  await writeFile(input, Buffer.alloc(2 * 1024 * 1024 + 1));
  await assert.rejects(validateProbeInputs({ input, output }), /FILE_LIMIT/);
  await assert.rejects(lstat(output), { code: "ENOENT" });
});

test("the entire received tree must match the reviewed member list including unexpected top-level files", async (t) => {
  const root = await owned(t),
    extracted = join(root, "outside");
  await mkdir(join(extracted, "package"));
  await writeFile(join(extracted, "package/client.js"), "synthetic");
  const expected = { "package/client.js": sha256("synthetic") };
  assert.deepEqual(await verifyReceivedMembers(extracted, expected), expected);
  await writeFile(join(extracted, "unexpected"), "extra");
  await assert.rejects(
    verifyReceivedMembers(extracted, expected),
    /RECEIVED_MEMBERS/,
  );
});

test("a received symlink is rejected before following it to another file", async (t) => {
  const root = await owned(t),
    extracted = join(root, "outside");
  await writeFile(join(root, "read-only-input"), "synthetic");
  await symlink(join(root, "read-only-input"), join(extracted, "alias"));
  await assert.rejects(
    verifyReceivedMembers(extracted, {}),
    /RECEIVED_SYMLINK/,
  );
  assert.equal(
    await readFile(join(root, "read-only-input"), "utf8"),
    "synthetic",
  );
});

test("ambient repository selectors, replacement and global/command config cannot redirect the read-only Git proof", async (t) => {
  const root = await owned(t),
    intended = join(root, "checks"),
    wrong = join(root, "outside");
  for (const cwd of [intended, wrong]) {
    execFileSync("/usr/bin/git", ["init", "--quiet"], {
      cwd,
      env: {
        PATH: "/usr/bin:/bin",
        GIT_CONFIG_GLOBAL: "/dev/null",
        GIT_CONFIG_NOSYSTEM: "1",
      },
    });
    execFileSync(
      "/usr/bin/git",
      [
        "-c",
        "user.name=Synthetic",
        "-c",
        "user.email=synthetic@invalid",
        "commit",
        "--allow-empty",
        "--quiet",
        "-m",
        cwd,
      ],
      {
        cwd,
        env: {
          PATH: "/usr/bin:/bin",
          GIT_CONFIG_GLOBAL: "/dev/null",
          GIT_CONFIG_NOSYSTEM: "1",
        },
      },
    );
  }
  const expected = readOnlyGit(intended, ["rev-parse", "HEAD"]);
  assert.notEqual(readOnlyGit(wrong, ["rev-parse", "HEAD"]), expected);
  const global = join(root, "ambient-config"),
    mark = join(root, "fsmonitor-must-not-run");
  await writeFile(global, "[core]\n\tfsmonitor = touch " + mark + "\n");
  const original = process.env;
  process.env = {
    ...original,
    GIT_DIR: join(wrong, ".git"),
    GIT_WORK_TREE: wrong,
    GIT_INDEX_FILE: join(root, "ambient-index"),
    GIT_CONFIG_GLOBAL: global,
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "core.fsmonitor",
    GIT_CONFIG_VALUE_0: "touch " + mark,
    GIT_REPLACE_REF_BASE: "refs/other/",
    GIT_NO_REPLACE_OBJECTS: "0",
  };
  try {
    assert.equal(readOnlyGit(intended, ["rev-parse", "HEAD"]), expected);
    assert.equal(
      readOnlyGit(intended, ["status", "--porcelain", "--untracked-files=no"]),
      "",
    );
    await assert.rejects(lstat(mark), { code: "ENOENT" });
    await assert.rejects(lstat(join(root, "ambient-index")), {
      code: "ENOENT",
    });
  } finally {
    process.env = original;
  }
});
