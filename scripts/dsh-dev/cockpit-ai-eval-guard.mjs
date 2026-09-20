/** Native preset guard for synthetic cockpit evals; never loads model credentials. */
import { lstatSync, realpathSync } from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';

export const name = 'cockpit-ai-eval-guard';
export const inject = ['tools'];
const allowedTools = ['read', 'write', 'edit', 'present'];
const readableFiles = new Set(['TASK.md', 'source.json', 'candidate.json']);
const fail = () => { throw new Error('EVAL_SCOPE_INVALID'); };
const inside = (root, path) => {
  const part = relative(root, path);
  return part !== '' && part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part);
};

function canonicalDirectory(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) fail();
  const canonical = realpathSync(path);
  if (!lstatSync(canonical).isDirectory()) fail();
  return canonical;
}

/** Require a physical workspace underneath the supplied synthetic fixture root. */
function workspace(root, agent, presetId) {
  const header = agent?.session?.header;
  if (!agent?.ctx?.tools || typeof agent.id !== 'string' || header?.id !== agent.id
    || header.agentPreset !== presetId) fail();
  const cwd = canonicalDirectory(header.cwd);
  // The driver sends realpath(cwd). Reject aliases rather than disagreeing with
  // fs-local's physical handling of symlink/.. traversal or file: URI strings.
  if (cwd !== header.cwd || !inside(root, cwd)) fail();
  let current = root;
  for (const component of relative(root, cwd).split(sep)) {
    current = join(current, component);
    const stat = lstatSync(current);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail();
  }
  const stat = lstatSync(cwd);
  return { cwd, dev: stat.dev, ino: stat.ino };
}

function permittedPath(cwd, name, value) {
  if (typeof value !== 'string' || !value || value.includes('\0')
    || /^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)
    || value.split(/[\\/]/).includes('..')) return false;
  const target = resolve(cwd, value);
  const leaf = basename(target);
  if (target !== join(cwd, leaf)
    || (name === 'read' ? !readableFiles.has(leaf) : leaf !== 'candidate.json')) return false;
  try {
    const stat = lstatSync(target);
    // No symlink/hardlink or non-file can route an allowed filename elsewhere.
    return stat.isFile() && !stat.isSymbolicLink() && stat.nlink === 1
      && realpathSync(target) === target;
  } catch (error) {
    return error.code === 'ENOENT' && name === 'write';
  }
}

export function apply(ctx, config) {
  const root = canonicalDirectory(config?.workspaceRoot);
  const presetId = config?.presetId;
  if (typeof presetId !== 'string' || !/^cockpit-eval-[a-z0-9-]+$/.test(presetId)) fail();
  // Native restrict() rejects an unscoped context. An empty deny validates the
  // standing preset scope without hiding its tools from descendant agents.
  ctx.tools.restrict({ deny: [] });
  const admitted = new WeakMap();
  ctx.tools.guard(exec => {
    if (!allowedTools.includes(exec.name)) return 'EVAL_TOOL_DENIED';
    const expected = exec.agent && admitted.get(exec.agent);
    if (!expected) return 'EVAL_SCOPE_INVALID';
    try {
      const current = workspace(root, exec.agent, presetId);
      if (current.cwd !== expected.cwd || current.dev !== expected.dev || current.ino !== expected.ino) return 'EVAL_SCOPE_INVALID';
      const args = exec.arguments;
      if (!args || typeof args !== 'object' || Array.isArray(args)) return 'EVAL_PATH_DENIED';
      if (exec.name === 'present') {
        if (!Array.isArray(args.files) || args.files.length !== 1
          || !permittedPath(current.cwd, exec.name, args.files[0]?.path)) return 'EVAL_PATH_DENIED';
      } else if (!permittedPath(current.cwd, exec.name, args.file_path)) return 'EVAL_PATH_DENIED';
      return undefined;
    } catch { return 'EVAL_SCOPE_INVALID'; }
  });
  // Presets are standing parent scopes. Their file tools become inherited at
  // the real agent scope, where this allowlist is valid and excludes global
  // business tools, Bash, read_image, and any later inherited registrations.
  // Native agent/created is scoped and awaited before queued prompts run.
  ctx.on('agent/created', ({ agent }) => {
    const target = workspace(root, agent, presetId);
    agent.ctx.tools.restrict({ allow: [...allowedTools] });
    admitted.set(agent, target);
  });
}
