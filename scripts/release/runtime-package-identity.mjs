export function comparablePackageBytes(bytes) {
  try {
    const value = JSON.parse(bytes);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return bytes;
    delete value.devDependencies;
    // pnpm injects workspace packages as absolute file locators during a
    // modern deploy. The source peer manifest still has workspace:* values.
    // Both forms identify the same pinned package; comparing the locator
    // string would report a false collision and would bind a host path into
    // the runtime identity check.
    for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      for (const [name, specifier] of Object.entries(value[section] ?? {})) {
        if (typeof specifier === 'string' && specifier.startsWith('workspace:')) {
          value[section][name] = 'workspace:';
        } else if (typeof specifier === 'string' && /@file:\/\/\/.*\/workspace\//.test(specifier)) {
          value[section][name] = 'workspace:';
        }
      }
    }
    return Buffer.from(JSON.stringify(value));
  } catch {
    return bytes;
  }
}
