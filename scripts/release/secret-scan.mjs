import { readFile, stat, readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ASSIGNMENT = /(?:api[_-]?key|secret|password|token|cookie|authorization)\s*[:=]\s*['"]([A-Za-z0-9+/=_-]{20,})['"]/ig;
const SECRET_PATTERNS = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]{32,}?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/i,
  /(?:^|[^A-Za-z0-9_])(?:gh[pousr]|github_pat)_[A-Za-z0-9_]{20,}(?![A-Za-z0-9_])/,
  /(?:^|[^A-Za-z0-9])sk-[A-Za-z0-9]{20,}(?![A-Za-z0-9])/,
  /(?:^|[^A-Z0-9])AKIA[0-9A-Z]{16}(?![0-9A-Z])/,
];
const DENY_NAMES = /(^|\/)(?:\.env(?:\.|$)|\.npmrc(?:$|\/)|credentials?(?:[-_.]|$)|private[-_]?key(?:[-_.]|$)|cookie(?:[-_.]|$)|node_modules(?:\/|$)|__pycache__(?:\/|$)|.*\.wal$|.*\.duckdb(?:$|\.)|.*\.sqlite(?:$|\.)|.*\.log$)/i;
const SYNTHETIC_MARKER = /(?:synthetic|test[-_]?only|\btest\b|isolated|not[-_]?a[-_]?live[-_]?secret|not[-_]?a[-_]?real|not[-_]?in[-_]?json|fixture|example|placeholder|fake|b0-|a9-|do[-_]?not[-_]?log|private[-_]?server|forwarded[-_]?|globals[-_]?|existing[-_]?valid|competition[-_]http|page[-_]documents|result[-_]page|32(?:chars?|ch)|minimum)/i;
// These are protocol identifiers observed in pinned third-party bundles, not a
// general exemption for identifier-shaped values. Keep the list explicit so
// a real credential assignment still fails closed.
const BENIGN_PROTOCOL_LITERAL = new Set([
  'x-cos-security-token',
  '__DSH_CODE_ICON_INSTANCE__',
  'AWS_SECRET_ACCESS_KEY',
  'AWS_CONTAINER_AUTHORIZATION_TOKEN',
  'AWS_CONTAINER_AUTHORIZATION_TOKEN_FILE',
  'AWS_CONTAINER_CREDENTIALS_FULL_URI',
  'AWS_CONTAINER_CREDENTIALS_RELATIVE_URI',
  'remove_authentication_token',
]);

export function scanText(text, name = '<input>', { scanAssignments = true } = {}) {
  const findings = SECRET_PATTERNS.some(pattern => pattern.test(text)) ? [`SECRET_PATTERN ${name}`] : [];
  if (!scanAssignments) return [...new Set(findings)];
  for (const match of text.matchAll(ASSIGNMENT)) {
    // Synthetic values are exempt only inside explicitly named fixtures/tests;
    // a production/config file containing the same marker must still fail closed.
    const syntheticFixture = /(?:fixture|test|spec)/i.test(name) && SYNTHETIC_MARKER.test(match[1]);
    if (!syntheticFixture && !BENIGN_PROTOCOL_LITERAL.has(match[1])) findings.push(`SECRET_PATTERN ${name}`);
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
