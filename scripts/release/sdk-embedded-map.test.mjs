import assert from 'node:assert/strict';
import test from 'node:test';
import { decodeVlq, inspectEmbeddedSourceMap } from './sdk-embedded-map.mjs';

const map = mappings => ({ version: 3, mappings, sources: ['a.js'] });

test('VLQ matches the sourcemap continuation and sign rules', () => {
  assert.deepEqual(decodeVlq('A'), [0]);
  assert.deepEqual(decodeVlq('C'), [1]);
  assert.deepEqual(decodeVlq('D'), [-1]);
  assert.deepEqual(decodeVlq('B'), [0]);
  assert.deepEqual(decodeVlq('gB'), [16]);
  assert.equal(decodeVlq(''), null);
  assert.equal(decodeVlq('g'), null);
  assert.equal(decodeVlq('?'), null);
});

test('a fitting external map stays unverified and does not read an escaped directive', () => {
  const generated = 'var answer = 1;\\u0023 sourceMappingURL=ignored.map\n';
  const result = inspectEmbeddedSourceMap({ generated, map: map('A') });
  assert.equal(result.positions, 'CONSISTENT');
  assert.equal(result.inline_function_bytes, 'NOT_VERIFIED');
  assert.equal(result.source_mapping_directive, 'ABSENT');
  assert.equal(result.trailing_unmapped_lines, 1);
  assert.equal(result.release_ready, false);
  assert.equal(result.counts.outside, 0);
});

test('a column past the sealed line is rejected and still not promoted', () => {
  const result = inspectEmbeddedSourceMap({ generated: 'abc', map: map('gB') });
  assert.equal(result.positions, 'REJECTED');
  assert.equal(result.counts.outside, 1);
  assert.equal(result.inline_function_bytes, 'NOT_VERIFIED');
  assert.equal(result.reason, 'SOURCEMAP_DOES_NOT_FIT_GENERATED_FILE');
});

test('a VLQ value that would wrap a 32-bit shift is rejected instead of becoming column zero', () => {
  const result = inspectEmbeddedSourceMap({ generated: 'x', map: map('ggggggE') });
  assert.equal(result.positions, 'REJECTED');
  assert.equal(result.counts.outside, 1);
  assert.equal(result.inline_function_bytes, 'NOT_VERIFIED');
});

test('an end-of-line column fits, while a real directive does not prove bytes', () => {
  const fitting = inspectEmbeddedSourceMap({ generated: 'abcdefghijklmnop', map: map('gB') });
  assert.equal(fitting.positions, 'CONSISTENT');
  assert.equal(fitting.counts.end_of_line, 1);
  const marked = inspectEmbeddedSourceMap({
    generated: 'abc\n//# sourceMappingURL=bundle.js.map\n',
    map: map('A'),
  });
  assert.equal(marked.positions, 'CONSISTENT');
  assert.equal(marked.source_mapping_directive, 'PRESENT');
  assert.equal(marked.inline_function_bytes, 'NOT_VERIFIED');
});

test('malformed map input fails closed', () => {
  assert.throws(() => inspectEmbeddedSourceMap({ generated: '', map: map('A') }), /SDK_EMBED_GENERATED/);
  assert.throws(() => inspectEmbeddedSourceMap({ generated: 'abc', map: { version: 2, mappings: 'A', sources: [] } }), /SDK_EMBED_MAP/);
  const invalid = inspectEmbeddedSourceMap({ generated: 'abc', map: map('?') });
  assert.equal(invalid.positions, 'REJECTED');
  assert.equal(invalid.counts.invalid, 1);
  assert.equal(invalid.inline_function_bytes, 'NOT_VERIFIED');
});
