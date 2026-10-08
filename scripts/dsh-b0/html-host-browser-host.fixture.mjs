/** Owned synthetic seed/config only; official slots, sessions and CLI remain unchanged. */
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
export const name = 'html-host-owned-fixture';
export const inject = ['webServer', 'connection', 'sessions'];
export async function apply(ctx, config) {
  const { createUserMessage } = await import(
    pathToFileURL(join(config.upstream, 'packages/llm/llm/lib/index.js')).href
  );
  ctx.on('webserver/index-inject', (table) => {
    table.push(
      { kind: 'global', name: '__SHINE_BOARD__', value: true },
      { kind: 'global', name: '__SHINE_QUERY__', value: false },
      { kind: 'global', name: '__PAGE_DOCUMENTS_HTTP_BASE__', value: config.httpOrigin },
      {
        kind: 'global',
        name: '__PAGE_DOCUMENTS_HTTP_TOKEN__',
        value: 'html-host-isolated-synthetic-token-32chars',
      },
    );
  });
  ctx.effect(
    () =>
      ctx.webServer.register({
        kind: 'exact',
        path: '/__html_host_seed__',
        async handler(req, res) {
          const rejection = ctx.connection.requestRejection(req);
          if (rejection) {
            res.writeHead(rejection);
            res.end();
            return;
          }
          if (req.method !== 'POST') {
            res.writeHead(405);
            res.end();
            return;
          }
          const s = ctx.sessions.get('html-host-synthetic');
          assert.ok(s);
          assert.equal(s.header.cwd, config.workspace);
          if (!s.snapshotEvents().some((e) => e.type === 'user/message')) {
            s.append('turn/start', { turn: 1 });
            s.append(
              'user/message',
              createUserMessage({
                content: [{ type: 'text', text: '隔离 HTML 宿主验收；预置历史，不是业务结果或模型回答。' }],
                source: { kind: 'user' },
              }),
              { surfaceOp: 'append' },
            );
            s.append('turn/end', { turn: 1, reason: { kind: 'completed' } });
          }
          assert.equal(await ctx.sessions.flush(s), true);
          res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
          res.end(JSON.stringify({ messages: s.deriveMessages().length }));
        },
      }),
    'html-owned: seed',
  );
}
