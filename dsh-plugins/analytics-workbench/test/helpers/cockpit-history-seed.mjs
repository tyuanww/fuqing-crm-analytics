/** Explicit synthetic history fixture, only in a probe-owned workspace. */
import assert from 'node:assert/strict';
export const name = 'cockpit-history-fixture';
export const inject = ['sessions', 'connection', 'webServer'];
export function apply(ctx) {
  ctx.connection.fetch.register({ path: '/api/cockpit-history-seed', methods: ['POST'], requestBody: 'buffered',
    async fetch() {
      for (const [id, title, path] of [
        ['session-history-html', '历史经营月报 · 合成', 'archive/deep/report.html'],
        ['session-history-sheet', '历史表格 · 合成', 'archive/rows.csv'],
      ]) {
        const session = ctx.sessions.get(id);
        assert.ok(session?.header.cwd?.includes('/.context/office-test/native-'));
        if (!session.snapshotEvents().some(event => event.type === 'deliverables/presented')) {
          session.append('session/title', { title, messageSeqs: [], source: { kind: 'user' } });
          session.append('turn/start', { turn: 1 });
          session.append('deliverables/presented', { turn: 1, callId: 'synthetic-present', files: [{ path: session.header.cwd + '/' + path }] });
          session.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
          assert.equal(await ctx.sessions.flush(session), true);
        }
      }
      return Response.json({ seeded: true, modelCalls: 0 });
    },
  });
}
