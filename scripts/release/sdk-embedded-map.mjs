/** Position check for one external sourcemap. Never a release authorization. */
import assert from 'node:assert/strict';

const schema = 'shinemage-sdk-embedded-sourcemap/v1';
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const digit = new Map([...alphabet].map((char, index) => [char, index]));
const directive = /(?:\/\/[@#]|\/\*#)[ \t]*sourceMappingURL\s*=/;

const need = (ok, code) => assert.ok(ok, `SDK_EMBED_${code}`);
const object = value => value && typeof value === 'object' && !Array.isArray(value);

/** @returns {number[] | null} decoded VLQ fields, or null when the segment is not valid. */
export function decodeVlq(field) {
  if (typeof field !== 'string' || field.length === 0 || field.length > 64) return null;
  const values = [];
  let shift = 0;
  let value = 0;
  for (const char of field) {
    const raw = digit.get(char);
    if (raw === undefined) return null;
    value += (raw & 31) * 2 ** shift;
    if (!Number.isSafeInteger(value)) return null;
    if (raw & 32) {
      shift += 5;
      if (shift > 30) return null;
    } else {
      const negative = value % 2 === 1;
      value = Math.floor(value / 2);
      const signed = negative ? -value : value;
      values.push(Object.is(signed, -0) ? 0 : signed);
      value = 0;
      shift = 0;
    }
  }
  return shift === 0 && values.length > 0 ? values : null;
}

/**
 * A fitting sourcemap only shows that its generated columns land in this file.
 * It does not prove esbuild reproduced the function bodies.
 */
export function inspectEmbeddedSourceMap({ generated, map }) {
  need(typeof generated === 'string' && generated.length > 0 && generated.length <= 64 * 1024 ** 2, 'GENERATED');
  need(object(map) && map.version === 3 && typeof map.mappings === 'string'
    && Array.isArray(map.sources) && map.sources.length <= 100000, 'MAP');
  const lines = generated.split('\n');
  const mapped = map.mappings.split(';');
  let inside = 0;
  let endOfLine = 0;
  let outside = 0;
  let beyondFile = 0;
  let invalid = 0;
  for (const [lineIndex, row] of mapped.entries()) {
    if (!row) continue;
    if (lineIndex >= lines.length) {
      beyondFile += row.split(',').filter(Boolean).length;
      continue;
    }
    let column = 0;
    const limit = lines[lineIndex].length;
    for (const field of row.split(',')) {
      if (!field) continue;
      const values = decodeVlq(field);
      if (!values) {
        invalid += 1;
        continue;
      }
      column += values[0];
      if (column < 0 || column > limit) outside += 1;
      else if (column === limit) endOfLine += 1;
      else inside += 1;
    }
  }
  const positions = invalid === 0 && outside === 0 && beyondFile === 0 ? 'CONSISTENT' : 'REJECTED';
  return {
    schema,
    positions,
    inline_function_bytes: 'NOT_VERIFIED',
    reason: positions === 'CONSISTENT'
      ? 'POSITION_CONSISTENCY_DOES_NOT_PROVE_TRANSFORMED_BYTES'
      : 'SOURCEMAP_DOES_NOT_FIT_GENERATED_FILE',
    source_mapping_directive: directive.test(generated) ? 'PRESENT' : 'ABSENT',
    generated_lines: lines.length,
    mapped_lines: mapped.length,
    trailing_unmapped_lines: Math.max(0, lines.length - mapped.length),
    counts: { inside, end_of_line: endOfLine, outside, beyond_file: beyondFile, invalid },
    release_ready: false,
  };
}
