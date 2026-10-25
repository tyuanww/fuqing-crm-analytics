import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const lines = createInterface({ input: process.stdin });
const iterator = lines[Symbol.asyncIterator]();
const first = await iterator.next();
const config = JSON.parse(first.value);
const { createDashboardAccess, CRM_UI_PATH } = await import(pathToFileURL(join(process.argv[2], 'src/dashboard-access.mjs')).href);
const origin = 'http://127.0.0.1:43299';
const sessions = new Set(['native-session', 'other-session']);
const leases = new Map();
const access = createDashboardAccess({ baseUrl: config.crm_origin, browserOrigin: origin, dataKind: 'synthetic',
  hasSession: id => sessions.has(id), nativeSnapshot: {
    introspectionPort: config.host_port, sourceOrigin: config.source_origin, tokenFile: config.token_file,
  } });
const send = value => process.stdout.write(JSON.stringify(value) + '\n');
try {
  await access.start();
  send({ ready: true });
  for (;;) {
    const line = await iterator.next();
    if (line.done) break;
    const input = JSON.parse(line.value);
    const session = input.session_id ?? 'native-session';
    if (input.operation === 'close') break;
    try {
      const signal = new AbortController().signal;
      if (input.operation === 'login' || input.operation === 'disconnect') {
        const response = await access.browser(new Request(origin + CRM_UI_PATH, {
          method: 'POST', headers: { origin, 'x-crm-ui': '1', 'content-type': 'application/json' },
          body: JSON.stringify({ operation: input.operation, session_id: session,
            ...input.operation === 'login' ? { username: 'fixture-user', password: 'native-fixture-password' } : {} }),
        }));
        send(await response.json());
      } else if (input.operation === 'query') send(await access.service.querySnapshot(session, input.filters));
      else if (input.operation === 'lease_open') {
        const lease = await access.service.openNativeSnapshotLease(session, signal);
        leases.set(input.lease_id, lease);
        const { username, native_session_id, connection_generation, expires_at_ms, data_kind } = lease.identity;
        send({ ok: true, identity: { username, native_session_id, connection_generation, expires_at_ms, data_kind } });
      } else if (input.operation === 'lease_read') {
        const snapshot = await leases.get(input.lease_id).read(input.ref_id, signal);
        send({ ok: true, snapshot_id: snapshot.snapshot_id, result_sha256: snapshot.result_sha256,
          gsv_amount_fen: snapshot.result.gsv_amount_fen });
      } else if (input.operation === 'lease_assert_current') {
        await leases.get(input.lease_id).assertCurrent(signal);
        send({ ok: true });
      } else if (input.operation === 'read') send(await access.service.readNativeSnapshot(session, input.ref_id));
      else if (input.operation === 'revoke') send(await access.service.revokeNativeSnapshot(session, input.ref_id));
      else if (input.operation === 'inactive') { sessions.delete(session); send({ ok: true }); }
      else if (input.operation === 'active') { sessions.add(session); send({ ok: true }); }
      else send({ error: 'INVALID_FIXTURE_OPERATION' });
    } catch { send({ error: 'NATIVE_HOST_OPERATION_REJECTED' }); }
  }
} finally {
  await access.dispose();
  lines.close();
}
