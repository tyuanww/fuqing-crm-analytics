/**
 * In-memory undo stack for one edit session.
 *
 * Presentation, source, and logic steps stay in this process. Undo and redo
 * only move the working copy; they do not append a page revision. The stack
 * is discarded on refresh, which reloads the last confirmed version.
 * Concurrent editors are not merged: there is no operational transform or CRDT.
 */

const CHANNELS = new Set(['presentation', 'source', 'logic']);

function viewOf(entries, cursor) {
  const applied = entries.slice(0, cursor);
  return Object.freeze({
    applied: cursor,
    retained: entries.length,
    can_undo: cursor > 0,
    can_redo: cursor < entries.length,
    channels: Object.freeze(applied.map(entry => entry.channel)),
    operation_ids: Object.freeze(applied.map(entry => entry.operation_id)),
  });
}

export function createSessionHistory() {
  const entries = [];
  let cursor = 0;

  function view() {
    return viewOf(entries, cursor);
  }

  return {
    view,
    clear() {
      entries.length = 0;
      cursor = 0;
    },
    undoDrafts() {
      return entries.slice(0, cursor).map(entry => structuredClone(entry.before.draft));
    },
    record({ channel, operation_id, before, after }) {
      if (!CHANNELS.has(channel) || typeof operation_id !== 'string' || !operation_id) {
        throw new Error('session history records one presentation, source, or logic step');
      }
      entries.splice(cursor);
      entries.push({
        channel,
        operation_id,
        before: structuredClone(before),
        after: structuredClone(after),
      });
      cursor = entries.length;
      return view();
    },
    peekUndo() {
      if (cursor === 0) return null;
      const entry = entries[cursor - 1];
      return {
        channel: entry.channel,
        operation_id: entry.operation_id,
        working: structuredClone(entry.before),
      };
    },
    commitUndo() {
      if (cursor === 0) return false;
      cursor -= 1;
      return true;
    },
    peekRedo() {
      if (cursor >= entries.length) return null;
      const entry = entries[cursor];
      return {
        channel: entry.channel,
        operation_id: entry.operation_id,
        working: structuredClone(entry.after),
      };
    },
    commitRedo() {
      if (cursor >= entries.length) return false;
      cursor += 1;
      return true;
    },
  };
}
