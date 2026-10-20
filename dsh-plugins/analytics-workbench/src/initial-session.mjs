/** B0/query navigation only: select the exact Host-listed session, never create one. */
export const B0_PRIMARY_SESSION_ID = 'session-b0-synthetic-primary';
export const QUERY_SESSION_IDS = Object.freeze(['session-query-synthetic-a', 'session-query-synthetic-b']);

function listed(snapshot, id) {
  return snapshot.ids.includes(id) && snapshot.byId[id]?.id === id;
}

function normalizedIds(value) {
  const rows = Array.isArray(value) ? value : typeof value === 'string' ? value.split(',') : [];
  const ids = rows.map(id => typeof id === 'string' ? id.trim() : '').filter(Boolean);
  return ids.length === new Set(ids).size ? ids : [];
}

/**
 * Explicit B0 session configuration. A normal host has neither environment
 * values nor the browser global, so plugin startup never chooses a session.
 * Query runs must list the exact pair; single-session runs list one id.
 */
export function explicitSessionIds(environment = undefined, globals = globalThis) {
  const browserValue = globals?.__SHINE_B0_SESSION_IDS__;
  if (Array.isArray(browserValue) || typeof browserValue === 'string') {
    const ids = normalizedIds(browserValue);
    return ids.length === 1 || ids.length === 2 ? ids : [];
  }
  if (!environment || typeof environment !== 'object') return [];
  const manifest = normalizedIds(environment.B0_SESSION_IDS);
  const primary = normalizedIds(environment.B0_SESSION_ID);
  if (manifest.length) return manifest.length === 2 || (environment.B0_RUNTIME_FAMILY !== 'channel_followup' && manifest.length === 1)
    ? manifest : [];
  return primary.length === 1 ? primary : [];
}

export function configuredSession(snapshot, sessionIds = []) {
  if (snapshot.phase !== 'ready') return null;
  const ids = normalizedIds(sessionIds);
  if (!(ids.length === 1 || ids.length === 2)) return null;
  if (ids.every(id => listed(snapshot, id))) return ids[0];
  return null;
}

export function mainViewSessionId(snapshot) {
  for (const id of snapshot.ids) {
    if ((snapshot.byId[id]?.retainedBy?.mainView ?? 0) > 0) return id;
  }
  return undefined;
}

/** Visible conversation for free-HTML generate. Never ids[0] or the B0 fixture unless it is current. */
export function resolvePageGenerateSession(list, compositionSessionId) {
  const ids = Array.isArray(list?.ids) ? list.ids : [];
  if (typeof compositionSessionId === 'string' && ids.includes(compositionSessionId)) {
    return compositionSessionId;
  }
  const current = mainViewSessionId(list);
  if (typeof current === 'string' && ids.includes(current)) return current;
  return null;
}

export function retainMainView(sessions, id) {
  return sessions.retain(id, { source: 'mainView' });
}

/**
 * One opt-in attempt per plugin lifetime. A session already owned by the main
 * view is never replaced, including when a B0 id happens to be listed.
 */
export function bindInitialSession(sessions, onFailure, { sessionIds = [] } = {}) {
  let active = true;
  let consumed = false;
  let held;
  const select = () => {
    if (!active || consumed) return;
    const snapshot = sessions.list.getSnapshot();
    const id = configuredSession(snapshot, sessionIds);
    if (id === null) return;
    consumed = true;
    if (mainViewSessionId(snapshot) !== undefined) return;
    try { held = retainMainView(sessions, id); }
    catch { onFailure(); }
  };
  const unsubscribe = sessions.list.subscribe(select);
  select();
  return () => { active = false; unsubscribe(); held?.release(); };
}
