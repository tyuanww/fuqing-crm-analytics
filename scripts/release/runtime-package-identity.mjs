export function comparablePackageBytes(bytes) {
  try {
    const value = JSON.parse(bytes);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return bytes;
    delete value.devDependencies;
    return Buffer.from(JSON.stringify(value));
  } catch {
    return bytes;
  }
}
