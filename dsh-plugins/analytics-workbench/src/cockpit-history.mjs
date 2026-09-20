/** Cold, authenticated delivery discovery. Never retains a live Agent or crawls workspaces. */
import { posix, win32 } from 'node:path';
import { createHash } from 'node:crypto';
import { classifyWorkspaceFile, workspaceRelFromEventPath } from './client/cockpit-products.mjs';

export function deliveryRelativePath(cwd, value) {
  if (typeof value !== 'string' || !value || value.includes('\0') || value.includes('://')) return null;
  const paths = /^[A-Za-z]:[\\/]/.test(cwd ?? '') ? win32 : posix;
  if (!paths.isAbsolute(value)) return workspaceRelFromEventPath(value);
  if (!cwd || !paths.isAbsolute(cwd)) return null;
  return workspaceRelFromEventPath(paths.relative(cwd, value));
}

export function sessionDeliveries(header, events) {
  let title = header.id;
  const files = new Map(), calls = new Map();
  let unsupportedPaths = 0;
  const add = (path, event, source) => {
    if (!classifyWorkspaceFile(path)) return;
    const relative = deliveryRelativePath(header.cwd, path);
    if (!relative) { unsupportedPaths++; return; }
    files.set(relative, {
      id: `file:${header.id}:${relative}`, sessionId: header.id, path: relative,
      kind: classifyWorkspaceFile(relative), title: relative.split('/').pop(),
      source, deliveredAt: event.time, seq: event.seq, workspaceRoot: header.cwd,
    });
  };
  for (const event of events) {
    const data = event.data;
    if (event.type === 'session/title' && typeof data?.title === 'string') title = data.title;
    if (event.type === 'deliverables/presented' && Array.isArray(data?.files)) {
      for (const file of data.files) if (typeof file?.path === 'string') add(file.path, event, 'session-presented');
    }
    // A successful first-party write/edit also counts, even without a present card.
    if (event.type === 'tool/call' && ['write', 'edit'].includes(data?.name)) {
      try {
        const args = JSON.parse(data.arguments);
        if (typeof args?.file_path === 'string') calls.set(data.callId, args.file_path);
      } catch { /* malformed tool arguments are not a delivery */ }
    }
    if (event.type === 'tool/result' && event.surfaceOp === 'append') {
      const result = data?.message?.content?.[0];
      const path = calls.get(data?.message?.source?.callId);
      if (path && result && result.isError !== true) add(path, event, 'session-produced');
    }
  }
  return { files: [...files.values()].sort((a, b) => b.seq - a.seq).map(file => ({ ...file, sessionTitle: title })), unsupportedPaths };
}

/** Cursor is tied to the visible catalog so new sessions cannot silently skip old rows. */
export async function readDeliveryHistory(query, payload = {}, signal) {
  if (Object.keys(payload).some(key => !['cursor', 'sessionId'].includes(key))
      || (payload.sessionId != null && (typeof payload.sessionId !== 'string' || payload.sessionId.length > 128))) throw new Error('INVALID_HISTORY_REQUEST');
  const records = (await query.listSessions(signal)).filter(row => typeof row.header?.cwd === 'string' && !row.header.id.startsWith('session-cockpit-ai-'))
    .sort((a, b) => b.header.createdAt - a.header.createdAt || a.header.id.localeCompare(b.header.id));
  const fingerprint = createHash('sha256').update(records.map(row => row.header.id).join('\n')).digest('hex').slice(0, 20);
  let sessionOffset = 0, fileOffset = 0;
  if (payload.cursor != null) {
    if (typeof payload.cursor !== 'string' || payload.cursor.length > 128) throw new Error('INVALID_HISTORY_CURSOR');
    const match = /^([a-f0-9]{20}):(\d+):(\d+)$/.exec(payload.cursor);
    if (!match) throw new Error('INVALID_HISTORY_CURSOR');
    if (match[1] !== fingerprint) throw new Error('HISTORY_CHANGED');
    sessionOffset = Number(match[2]); fileOffset = Number(match[3]);
    if (!Number.isSafeInteger(sessionOffset) || !Number.isSafeInteger(fileOffset) || sessionOffset > records.length || fileOffset > 1000000) throw new Error('INVALID_HISTORY_CURSOR');
  }
  const files = [], failures = [];
  let examined = 0, unsupportedPaths = 0;
  for (; sessionOffset < records.length && examined < 20 && files.length < 200; sessionOffset++) {
    signal?.throwIfAborted();
    const header = records[sessionOffset].header;
    let observation;
    try {
      observation = await query.observeSession(header.id, { signal, projectionMode: 'none' });
      signal?.throwIfAborted();
      const found = sessionDeliveries(observation.header, observation.events);
      unsupportedPaths += found.unsupportedPaths;
      const portion = found.files.slice(fileOffset, fileOffset + 200 - files.length);
      files.push(...portion);
      fileOffset += portion.length;
      examined++;
      if (fileOffset < found.files.length) break;
    } catch (error) {
      signal?.throwIfAborted();
      failures.push({ sessionId: header.id, reason: 'history-unavailable' });
      examined++;
    } finally {
      observation?.[Symbol.dispose]();
    }
    fileOffset = 0;
  }
  return { files, examined, totalSessions: records.length, failures, unsupportedPaths,
    currentWorkspace: records.find(row => row.header.id === payload.sessionId)?.header.cwd ?? null,
    nextCursor: sessionOffset < records.length ? `${fingerprint}:${sessionOffset}:${fileOffset}` : null };
}
