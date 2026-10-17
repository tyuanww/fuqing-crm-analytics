import { createHash } from 'node:crypto';
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
const SYNTHETIC_MARKER = /(?:synthetic|test[-_]?only|\btest\b|isolated|not[-_]?a[-_]?live[-_]?secret|not[-_]?a[-_]?real|not[-_]?in[-_]?json|fixture|example|placeholder|fake|b0-|a9-|do[-_]?not[-_]?log|private[-_]?server|forwarded[-_]?|globals[-_]?|existing[-_]?valid|competition[-_]http|page[-_]documents|result[-_]page|credential[-_]?never[-_]?echo|unexpected(?:[-_]|$)|not[-_]?sent|32(?:chars?|ch)|minimum)/i;
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
  'x-aws-ec2-metadata-token',
  'remove_authentication_token',
  'set_authentication_token',
  'impersonated-placeholder',
]);

// Pinned generated vendor files can contain protocol enum values that look
// like assignments. Keep each exception bound to the exact upstream bytes and
// path suffix. A changed generated file gets no exception and fails closed.
const RUNTIME_VENDOR_ASSIGNMENTS = Object.freeze([
  { suffix: 'node_modules/.pnpm/chrome-devtools-mcp@1.9.0/node_modules/chrome-devtools-mcp/build/src/third_party/index.js', sha256: 'fc6ae43cb8f6007eba4b0f269290ec8fea6db7670686d17967b4812d90d2cc10', values: ['ReportingEndpointNotToken', 'InvalidCredentialsCookie'] },
  { suffix: 'packages/experimental/inspector/lib/devtools/chunks/UIFilter-CIzBruM3.js', sha256: '528cdf0454770303f151a4e9562b750a41f221b656996ffe2bc12c13fb6e8489', values: ['response-header-set-cookie'] },
  { suffix: 'packages/experimental/inspector/lib/devtools/chunks/data_grid-CZEcy7-w.js', sha256: '729fbcd17a4356d26a52007551880bd7ef88f8a97b573e40c61fca2754da61a9', values: ['DataGridInternalToken'] },
  { suffix: 'packages/experimental/inspector/lib/devtools/chunks/legacy-CJ2qLEp3.js', sha256: '1a1b731f8ed5c22d04152e49999cf706e5edefb595ec68e2ea45ca451c9a8c91', values: ['ReportingEndpointNotToken', 'InvalidCredentialsCookie'] },
  { suffix: 'packages/experimental/inspector/lib/devtools/chunks/protocol_client-L4-X1Qrb.js', sha256: 'aecddd3577951b386a69848c3470507c6806365a8130392e57d4028adf7c1e01', values: ['ReportingEndpointNotToken', 'InvalidCredentialsCookie'] },
  { suffix: '@deepseek-ai/dsh-experimental-inspector/lib/devtools/chunks/UIFilter-CIzBruM3.js', sha256: '528cdf0454770303f151a4e9562b750a41f221b656996ffe2bc12c13fb6e8489', values: ['response-header-set-cookie'] },
  { suffix: '@deepseek-ai/dsh-experimental-inspector/lib/devtools/chunks/data_grid-CZEcy7-w.js', sha256: '729fbcd17a4356d26a52007551880bd7ef88f8a97b573e40c61fca2754da61a9', values: ['DataGridInternalToken'] },
  { suffix: '@deepseek-ai/dsh-experimental-inspector/lib/devtools/chunks/legacy-CJ2qLEp3.js', sha256: '1a1b731f8ed5c22d04152e49999cf706e5edefb595ec68e2ea45ca451c9a8c91', values: ['ReportingEndpointNotToken', 'InvalidCredentialsCookie'] },
  { suffix: '@deepseek-ai/dsh-experimental-inspector/lib/devtools/chunks/protocol_client-L4-X1Qrb.js', sha256: 'aecddd3577951b386a69848c3470507c6806365a8130392e57d4028adf7c1e01', values: ['ReportingEndpointNotToken', 'InvalidCredentialsCookie'] },
]);

export function runtimeVendorAssignmentAllowlist(name, bytesOrSha256) {
  const digest = typeof bytesOrSha256 === 'string' ? bytesOrSha256 : createHash('sha256').update(bytesOrSha256).digest('hex');
  const values = new Set();
  for (const entry of RUNTIME_VENDOR_ASSIGNMENTS) {
    if (name.endsWith(entry.suffix) && digest === entry.sha256) for (const value of entry.values) values.add(value);
  }
  return values;
}

export function scanText(text, name = '<input>', { scanAssignments = true, allowSyntheticFixtures = true, assignmentAllowlist = new Set() } = {}) {
  const findings = SECRET_PATTERNS.some(pattern => pattern.test(text)) ? [`SECRET_PATTERN ${name}`] : [];
  if (!scanAssignments) return [...new Set(findings)];
  for (const match of text.matchAll(ASSIGNMENT)) {
    // Synthetic values are exempt only inside explicitly named fixtures/tests;
    // a production/config file containing the same marker must still fail closed.
    const syntheticFixture = allowSyntheticFixtures && /(?:fixture|test|spec|probe)/i.test(name) && SYNTHETIC_MARKER.test(match[1]);
    if (!syntheticFixture && !BENIGN_PROTOCOL_LITERAL.has(match[1]) && !assignmentAllowlist.has(match[1])) findings.push(`SECRET_PATTERN ${name}`);
  }
  return [...new Set(findings)];
}

export async function scanTree(root, { maxBytes = 20 * 1024 * 1024, include = () => true, allowSyntheticFixtures = true } = {}) {
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
        findings.push(...scanText(await readFile(path, 'utf8'), rel, { allowSyntheticFixtures }));
      }
    }
  }
  await visit(root);
  return [...new Set(findings)].sort();
}

export function assertClean(findings) { if (findings.length) throw new Error(`SECRET_SCAN_FAILED ${findings.join(';')}`); }
