import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseUiProbeArguments } from "./html-host-browser-ui-args.mjs";
import { assertOwnedPort } from "../dsh-dev/ports.mjs";

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

test("the ui probe accepts only an explicit check or isolated headed run", () => {
  assert.throws(() => parseUiProbeArguments(args), /EXPLICIT_OPT_IN/);
  const check = parseUiProbeArguments([...args, "--check"]);
  assert.equal(check.run, false);
  assert.equal(check.headed, false);
  const run = parseUiProbeArguments([...args, "--run-isolated-host", "--port", "4328"]);
  assert.equal(run.run, true);
  assert.equal(run.headed, true);
  assert.equal(run.headlessFallback, false);
  assert.equal(run.port, 4328);
  assert.equal(assertOwnedPort(run.port), 4328);
});

test("parser integer acceptance is not the execution port allowlist", () => {
  const parsed = parseUiProbeArguments([...args, "--run-isolated-host", "--port", "4381"]);
  assert.equal(parsed.port, 4381);
  assert.throws(() => assertOwnedPort(parsed.port), /port must be one of/);
});

test("the ui probe cannot select headless mode, port 6677, or unknown flags", () => {
  assert.throws(
    () => parseUiProbeArguments([...args, "--run-isolated-host", "--port", "6677"]),
    /OWNED_PORT/,
  );
  assert.throws(
    () => parseUiProbeArguments([...args, "--check", "--headed", "true"]),
    /ARGUMENT/,
  );
  assert.throws(
    () => parseUiProbeArguments([...args, "--run-isolated-host", "--headless"]),
    /ARGUMENT/,
  );
});

test("the ui probe source launches headed Chrome and does not fall back to headless", async () => {
  const source = await readFile(
    new URL("./html-host-browser-ui.probe.mjs", import.meta.url),
    "utf8",
  );
  assert.match(source, /headless:\s*false/);
  assert.doesNotMatch(source, /headless:\s*true/);
  assert.match(source, /headlessFallback/);
  assert.doesNotMatch(source, /channel:\s*"chrome"[\s\S]{0,240}headless:\s*true/);
});
