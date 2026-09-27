import { readFile } from 'node:fs/promises';

const TYPE = {
  object: value => value !== null && typeof value === 'object' && !Array.isArray(value),
  array: Array.isArray,
  string: value => typeof value === 'string',
  number: value => typeof value === 'number' && Number.isFinite(value),
  integer: value => Number.isInteger(value),
  boolean: value => typeof value === 'boolean',
};

export function validateSchema(value, schema, path = '$') {
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    if (!types.some(type => TYPE[type]?.(value))) return `${path}: expected ${types.join('|')}`;
  }
  if (schema.enum && !schema.enum.some(item => Object.is(item, value))) return `${path}: value is not allowed`;
  if (schema.pattern && (typeof value !== 'string' || !new RegExp(schema.pattern).test(value))) return `${path}: pattern mismatch`;
  if (schema.minLength !== undefined && value.length < schema.minLength) return `${path}: too short`;
  if (schema.minimum !== undefined && value < schema.minimum) return `${path}: below minimum`;
  if (schema.required && TYPE.object(value)) {
    for (const key of schema.required) if (!Object.hasOwn(value, key)) return `${path}.${key}: required`;
  }
  if (schema.additionalProperties === false && TYPE.object(value)) {
    const allowed = new Set(Object.keys(schema.properties ?? {}));
    for (const key of Object.keys(value)) if (!allowed.has(key)) return `${path}.${key}: additional property is not allowed`;
  }
  if (schema.properties && TYPE.object(value)) {
    for (const [key, child] of Object.entries(schema.properties)) {
      if (Object.hasOwn(value, key)) {
        const error = validateSchema(value[key], child, `${path}.${key}`);
        if (error) return error;
      }
    }
  }
  if (schema.items && Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const error = validateSchema(value[index], schema.items, `${path}[${index}]`);
      if (error) return error;
    }
  }
  return null;
}

export async function readSchema(path) {
  return JSON.parse(await readFile(path, 'utf8'));
}

export async function assertSchema(value, path) {
  const error = validateSchema(value, await readSchema(path));
  if (error) throw new Error(`SCHEMA_INVALID ${error}`);
  return value;
}
