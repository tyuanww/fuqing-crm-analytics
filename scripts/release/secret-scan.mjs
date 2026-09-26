import { readFile, stat, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ASSIGNMENT = /(?:api[_-]?key|secret|password|token|cookie|authorization)\s*[:=]\s*['"]([A-Za-z0-9+/=_-]{20,})['"]/ig;
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9]{20,}/,
  /AKIA[0-9A-Z]{16}/,
];
const DENY_NAMES = /(^|\/)(?:\.env(?:\.|$)|\.npmrc(?:$|\/)|credentials?(?:[-_.]|$)|private[-_]?key(?:[-_.]|$)|cookie(?:[-_.]|$)|node_modules(?:\/|$)|__pycache__(?:\/|$)|.*\.wal$|.*\.duckdb(?:$|\.)|.*\.sqlite(?:$|\.)|.*\.log$)/i;
const SYNTHETIC_MARKER = /(?:synthetic|test[-_]?only|not[-_]?a[-_]?live[-_]?secret|fixture|example|placeholder|fake)/i;

export function scanText(text, name = '<input>') {
  const findings = SECRET_PATTERNS.some(pattern => pattern.test(text)) ? [`SECRET_PATTERN ${name}`] : [];
  for (const match of text.matchAll(ASSIGNMENT)) {
    if (!SYNTHETIC_MARKER.test(match[1])) findings.push(`SECRET_PATTERN ${name}`);
  }
  return [...new Set(findings)];
}

export async function scanTree(root, { maxBytes = 20 * 1024 * 1024, include = () => true } = {}) {
  const findings = [];
  let bytes = 0;
  async function visit(dir) {
    for (const entry of await readdir(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      const rel = relative(root, path).split('\\').join('/');
      if (!include(rel)) continue;
      if (DENY_NAMES.test(rel)) findings.push(`DENY_NAME ${path}`);
      if (entry.isDirectory()) await visit(path);
      else if (entry.isFile()) {
        const info = await stat(path); bytes += info.size;
        if (bytes > maxBytes) throw new Error(`SCAN_SIZE_LIMIT ${maxBytes}`);
        // Large files are rejected rather than silently omitted: a secret scan must be complete.
        if (info.size > 2 * 1024 * 1024) throw new Error(`SCAN_FILE_LIMIT ${path}`);
        findings.push(...scanText(await readFile(path, 'utf8'), path));
      }
    }
  }
  await visit(root);
  return [...new Set(findings)].sort();
}

export function assertClean(findings) { if (findings.length) throw new Error(`SECRET_SCAN_FAILED ${findings.join(';')}`); }
