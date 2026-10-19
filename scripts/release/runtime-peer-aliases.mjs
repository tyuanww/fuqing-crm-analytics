import assert from 'node:assert/strict';

/** Return required peer package names that are absent from the source alias root. */
export function missingPeerAliases(required, available) {
  const availableNames = new Set([...available].map(entry => typeof entry === 'string' ? entry : entry.name));
  return [...required].filter(name => !availableNames.has(name));
}

/** Fail closed when a supported external web-plugin peer is missing upstream. */
export function assertPeerAliasesPresent(required, available, code = 'RUNTIME_EXTERNAL_WEB_PLUGIN_PEER_MISSING') {
  const missing = missingPeerAliases(required, available);
  assert.equal(missing.length, 0, `${code} ${missing.join(',')}`);
  return true;
}
