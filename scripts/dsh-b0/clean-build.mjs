import assert from 'node:assert/strict';
import { copyFile, mkdir, mkdtemp, lstat, readdir, rm } from 'node:fs/promises';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

// The clean build is deliberately a source-only copy. A dependency tree must
// never enter it: the build binds the already audited build-tools closure.
export const CLEAN_BUILD_LIMITS = Object.freeze({
  maxBytes: 256 * 1024 * 1024,
  maxFiles: 50_000,
  maxDepth: 32,
});

const FORBIDDEN_DIRECTORIES = new Set(['.git', '.context', 'node_modules', 'dist', 'lib']);

function contained(base, target) {
  const root = resolve(base);
  const candidate = resolve(target);
  const rest = relative(root, candidate);
  assert.ok(rest === '' || (rest !== '..' && !rest.startsWith(`..${sep}`) && !isAbsolute(rest)),
    `Path escapes clean build root: ${candidate}`);
}

function assertSourcePath(source) {
  assert.ok(isAbsolute(source), `Source path must be absolute: ${source}`);
}

/**
 * Copy one source tree without following links, with a shared resource budget.
 * Rejecting links is intentional: even a link inside an otherwise small tree
 * can expose the whole workspace or a dependency volume to the build.
 */
export async function copyTreeBounded(source, destination, options = {}) {
  const limits = { ...CLEAN_BUILD_LIMITS, ...(options.limits ?? {}) };
  const budget = options.budget ?? { bytes: 0, files: 0 };
  assertSourcePath(source);
  assertSourcePath(destination);
  if (options.destinationRoot) contained(options.destinationRoot, destination);
  const sourceRoot = resolve(source);

  async function visit(from, to, depth) {
    const entry = await lstat(from);
    if (entry.isSymbolicLink()) throw new Error(`Refusing symbolic link in clean source: ${from}`);
    if (entry.isDirectory()) {
      assert.ok(depth <= limits.maxDepth, `Clean source exceeds ${limits.maxDepth} directory levels: ${from}`);
      const name = from === sourceRoot ? '' : from.slice(from.lastIndexOf(sep) + 1);
      if (name && FORBIDDEN_DIRECTORIES.has(name)) {
        throw new Error(`Refusing generated/dependency directory in clean source: ${from}`);
      }
      await mkdir(to, { recursive: true, mode: 0o700 });
      const entries = (await readdir(from)).sort();
      for (const child of entries) await visit(join(from, child), join(to, child), depth + 1);
      return;
    }
    assert.ok(entry.isFile(), `Refusing special file in clean source: ${from}`);
    budget.files += 1;
    budget.bytes += entry.size;
    assert.ok(budget.files <= limits.maxFiles,
      `Clean source exceeds file limit (${limits.maxFiles}): ${from}`);
    assert.ok(budget.bytes <= limits.maxBytes,
      `Clean source exceeds byte limit (${limits.maxBytes}): ${from}`);
    await mkdir(dirname(to), { recursive: true, mode: 0o700 });
    await copyFile(from, to);
  }

  await visit(sourceRoot, resolve(destination), 0);
  return { files: budget.files, bytes: budget.bytes };
}

export async function createCleanRoot(parent) {
  const root = resolve(parent);
  await mkdir(root, { recursive: true, mode: 0o700 });
  const cleanRoot = await mkdtemp(join(root, 'clean-build-'));
  return { root, cleanRoot };
}

/** Remove only a directory created by createCleanRoot under its owner root. */
export async function removeCleanRoot(ownerRoot, cleanRoot) {
  const owner = resolve(ownerRoot);
  const candidate = resolve(cleanRoot);
  contained(owner, candidate);
  assert.ok(candidate.startsWith(`${owner}${sep}`), `Refusing to remove owner root: ${candidate}`);
  assert.ok(candidate.slice(owner.length + 1).startsWith('clean-build-'),
    `Refusing unregistered clean build directory: ${candidate}`);
  await rm(candidate, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
}
