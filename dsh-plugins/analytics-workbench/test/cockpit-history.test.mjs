import test from 'node:test';
import assert from 'node:assert/strict';
import { deliveryRelativePath, sessionDeliveries, readDeliveryHistory } from '../src/cockpit-history.mjs';
import { createCockpitDelivery } from '../src/client/cockpit-delivery.mjs';

const header = { id: 'old-session', cwd: '/workspace/report', createdAt: 1 };
const event = (path, seq = 1) => ({ type: 'deliverables/presented', seq, time: seq, data: { files: [{ path }] } });
test('history resolves absolute deliveries only within their owning workspace', () => {
  assert.equal(deliveryRelativePath(header.cwd, '/workspace/report/web/index.html'), 'web/index.html');
  assert.equal(deliveryRelativePath(header.cwd, '/workspace/report-other/secret.html'), null);
  assert.equal(deliveryRelativePath(header.cwd, '../secret.html'), null);
  assert.equal(deliveryRelativePath('C:\\work', 'C:\\work\\report.docx'), 'report.docx');
  assert.equal(deliveryRelativePath(header.cwd, 'https://example.test/a.pdf'), null);
});
test('present and successful writes are deduplicated with conversation provenance', () => {
  const found = sessionDeliveries(header, [
    event('index.html'), event('/workspace/report/index.html', 2),
    { type: 'tool/call', seq: 3, data: { name: 'write', callId: 'c', arguments: JSON.stringify({ file_path: 'result.xlsx', content: 'x' }) } },
    { type: 'tool/result', seq: 4, surfaceOp: 'append', data: { message: { source: { callId: 'c' }, content: [{ isError: false }] } } },
    { type: 'session/title', data: { title: '历史月报' } }, event('/outside/report.pdf', 5),
  ]);
  assert.equal(found.files.length, 2);
  assert.equal(found.files[0].path, 'result.xlsx');
  assert.equal(found.files[1].source, 'session-presented');
  assert.ok(found.files.every(file => file.sessionTitle === '历史月报'));
  assert.equal(found.unsupportedPaths, 1);
});
test('paged cold reads release observations and load more than one page of files', async () => {
  let disposed = 0, observed = 0;
  const query = { listSessions: async () => [{ header }],
    observeSession: async () => { observed++; return { header, events: Array.from({ length: 205 }, (_, i) => event('report' + i + '.pdf', i)),
      [Symbol.dispose]() { disposed++; } }; } };
  const first = await readDeliveryHistory(query);
  assert.equal(first.files.length, 200); assert.ok(first.nextCursor);
  const second = await readDeliveryHistory(query, { cursor: first.nextCursor });
  assert.equal(second.files.length, 5); assert.equal(second.nextCursor, null);
  assert.equal(new Set([...first.files, ...second.files].map(file => file.id)).size, 205);
  assert.equal(observed, disposed);
  await assert.rejects(readDeliveryHistory(query, { cursor: '00000000000000000000:0:0' }), /HISTORY_CHANGED/);
});
test('one unreadable session does not hide the remaining historical deliveries', async () => {
  const query = { listSessions: async () => [{ header }, { header: { ...header, id: 'failed' } }],
    observeSession: async id => {
      if (id === 'failed') throw new Error('unavailable');
      return { header, events: [event('report.docx')], [Symbol.dispose]() {} };
    } };
  const result = await readDeliveryHistory(query);
  assert.equal(result.files.length, 1); assert.equal(result.failures.length, 1);
});
test('cabinet discovers history without any currently open conversation', async () => {
  const delivery = createCockpitDelivery({ history: async () => ({ files: sessionDeliveries(header, [event('report.pdf')]).files,
    nextCursor: null, examined: 1, totalSessions: 1, failures: [], unsupportedPaths: 0 }) });
  const result = await delivery.refresh();
  assert.equal(result.status, 'ready'); assert.equal(result.sessionId, null);
  assert.equal(result.files[0].sessionId, header.id);
  delivery.dispose();
});
test('binary reads require a complete consistent file across byte windows', async () => {
  let calls = 0;
  const delivery = createCockpitDelivery({ readBytes: async (_id, _path, range) => ({ ok: true, value: {
    offset: range.offset, bytes: 2, version: ++calls === 1 ? 'a' : 'b', data: btoa('x'), eof: calls === 2,
  } }) });
  await assert.rejects(delivery.readBytes('a.pdf', { sessionId: header.id }), /发生变化/);
});

test('history and current scan collapse the same physical file, preserving its conversation', async () => {
  const delivery = createCockpitDelivery({
    listDir: async () => ({ entries: [{ name: 'report.ods', type: 'file' }] }),
    history: async () => ({ files: sessionDeliveries(header, [event('report.ods')]).files,
      currentWorkspace: header.cwd, examined: 1, totalSessions: 1, nextCursor: null }),
  });
  delivery.setSessionId('another-session-in-the-same-workspace');
  const result = await delivery.refresh();
  assert.equal(result.files.length, 1);
  assert.equal(result.files[0].sessionId, header.id);
  assert.equal(result.files[0].kind, 'spreadsheet');
});

test('AI task source/candidate files are excluded from ordinary historical and active intake', async () => {
  const id = 'session-cockpit-ai-synthetic';
  const history = await readDeliveryHistory({ listSessions: async () => [{ header: { ...header, id } }],
    observeSession: async () => { throw new Error('must not inspect AI workspace'); } });
  assert.equal(history.totalSessions, 0); assert.deepEqual(history.files, []);
  const delivery = createCockpitDelivery({ listDir: async () => { throw new Error('must not scan AI workspace'); } });
  const captured = delivery.captureSource({ ids: [id], byId: { [id]: { id, retainedBy: { mainView: 1 } } } });
  assert.equal(captured.sessionId, null);
  assert.equal((await delivery.refresh()).status, 'no-session');
  delivery.dispose();
});
