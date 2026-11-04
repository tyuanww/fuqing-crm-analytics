import { nativePageTarget } from './free-html-library/native-page-http.mjs';

const GROUPS = ['rows', 'same_channel_rows', 'member_rows', 'member_same_channel_rows'];
const PERIODS = ['current', 'comparison', 'yoy'];
const METRICS = ['GSV', 'AOV', 'AUS', 'orders', 'buyers'];
const RFM_FAMILIES = ['analysis', 'r', 'f', 'm'];
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const text = value => typeof value === 'string' && value.length > 0;
const fail = message => { throw new Error(message); };

export function parseFactView(body, resultRef, now = Date.now()) {
  if (!object(body)) fail('来源响应无效。');
  if (body.facts_schema_version !== 'warehouse-facts/v1') fail('未知事实 schema，未展示该来源。');
  if (new TextEncoder().encode(JSON.stringify(body)).length > 512 * 1024) fail('事实响应超过 512 KiB，未展示截断内容。');
  if (body.result_ref !== resultRef || body.ok === false) fail('来源引用不匹配或读取失败。');
  if (!Array.isArray(body.rows) || body.rows.length || body.cursor !== null) fail('事实响应不是固定全量视图。');
  if (!Array.isArray(body.facts) || body.facts.length > 2000) fail('事实数量超限或无效。');
  if (body.expires_at_ms !== null && (!Number.isSafeInteger(body.expires_at_ms) || body.expires_at_ms <= now)) fail('来源事实已过期或有效期无效。');
  const summary = body.summary;
  if (!object(summary) || summary.projection_version !== 'crm-warehouse-page-aggregate/v1') {
    throw Object.assign(new Error('该来源不支持 warehouse 全量事实视图。'), { code: 'FACTS_UNSUPPORTED_SOURCE' });
  }
  if (![...RFM_FAMILIES, 'purchases', 'product'].includes(summary.family)) fail('未知 warehouse family。');
  if (!text(summary.snapshot_id) || !text(summary.result_sha256) || !text(summary.data_kind)
      || !object(summary.time_range) || !text(summary.time_range.start) || !text(summary.time_range.end)
      || !Array.isArray(summary.periods) || !summary.periods.length
      || summary.periods.some(period => !object(period) || !text(period.start) || !text(period.end))
      || !object(summary.filters) || !object(summary.warehouse)) fail('来源摘要或实际期间缺失。');
  const addresses = new Set(), tables = new Map();
  for (const fact of body.facts) {
    if (!object(fact) || !object(fact.selector) || !text(fact.unit)) fail('事实值或单位无效。');
    const value = fact.value;
    if (value !== null && !(typeof value === 'number' && Number.isFinite(value) && (!Number.isInteger(value) || Number.isSafeInteger(value)))
      && !(typeof value === 'string' && /^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value))) fail('事实必须是有限数值、精确数字字符串或 null。');
    const s = fact.selector;
    let tableId, label, field, address;
    if (s.kind === 'purchase' && summary.family === 'purchases' && METRICS.includes(s.metric)) {
      tableId = 'purchase'; label = s.metric; field = 'value'; address = [s.kind, s.metric];
    } else if (s.kind === 'rfm' && RFM_FAMILIES.includes(summary.family) && GROUPS.includes(s.group) && text(s.segment) && text(s.field)) {
      tableId = s.group; label = s.segment; field = s.field; address = [s.kind, s.group, s.segment, s.field];
    } else if (s.kind === 'product' && summary.family === 'product' && PERIODS.includes(s.period) && text(s.display_name) && text(s.field)) {
      tableId = s.period; label = s.display_name; field = s.field; address = [s.kind, s.display_name, s.period, s.field];
    } else fail('事实地址未知或与来源 family 不匹配。');
    const key = JSON.stringify(address);
    if (addresses.has(key)) fail('来源含重复事实地址，整份来源未展示。');
    addresses.add(key);
    if (!tables.has(tableId)) tables.set(tableId, { id: tableId, columns: new Set(), rows: new Map() });
    const table = tables.get(tableId);
    table.columns.add(field);
    if (!table.rows.has(label)) table.rows.set(label, new Map());
    table.rows.get(label).set(field, { value, unit: fact.unit });
  }
  const order = summary.family === 'product' ? PERIODS : summary.family === 'purchases' ? ['purchase'] : GROUPS;
  return { summary, expiresAt: body.expires_at_ms, count: body.facts.length,
    tables: order.filter(id => tables.has(id)).map(id => {
      const table = tables.get(id), columns = [...table.columns];
      return { id, columns, rows: [...table.rows].map(([label, cells]) => ({ label,
        cells: columns.map(column => cells.get(column) ?? null) })) };
    }) };
}

export function createHostFacts(store, { now = () => Date.now(), setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  const listeners = new Set(), identities = new WeakMap();
  let identity = 0, key, generation = 0, disposed = false;
  let state = { status: 'idle', sources: [] };
  let controllers = [], timers = [];
  const objectId = value => {
    if (!object(value)) return null;
    if (!identities.has(value)) identities.set(value, ++identity);
    return identities.get(value);
  };
  const publish = next => { state = next; for (const listener of listeners) listener(); };
  const context = () => {
    const s = store.getSnapshot(), candidate = s.importCandidate;
    const remote = s.preview && !['PRESENTATION', 'SOURCE'].includes(s.preview.operation);
    const page = candidate ?? (remote ? s.preview : s.current);
    const manifest = candidate ? candidate.binding_manifest : remote
      ? s.preview.binding_manifest ?? s.preview.snapshot?.spec?.binding_manifest
      : s.current?.binding_manifest;
    return { page, manifest, busy: Boolean(s.busy), active: s.previewAlive && !s.busy && s.view === 'workspace' && Boolean(page),
      key: JSON.stringify([s.view, s.previewAlive, s.busy, s.cockpitSelectionId,
        candidate?.origin?.session_id ?? s.current?.session_id, s.current?.page_id, s.current?.version,
        candidate?.preview_id, s.preview?.preview_id, objectId(candidate ?? s.current), objectId(s.preview), manifest]) };
  };
  const clear = () => {
    for (const controller of controllers) controller.abort();
    for (const timer of timers) clearTimer(timer);
    controllers = []; timers = [];
  };
  const refresh = () => {
    if (disposed) return;
    const ctx = context();
    if (key === ctx.key) return;
    key = ctx.key; const epoch = ++generation;
    clear();
    if (!ctx.active) { publish({ status: 'idle', ...(ctx.busy ? { message: '正在切换或保存，来源事实已清空。' } : {}), sources: [] }); return; }
    const refs = ctx.manifest?.result_refs;
    if (!Array.isArray(refs) || refs.some(ref => !text(ref)) || new Set(refs).size !== refs.length || refs.length > 64) {
      publish({ status: 'error', message: '当前页面或预览未提供有效来源 manifest，或含重复引用；未展示来源事实。', sources: [] }); return;
    }
    let target;
    try { target = nativePageTarget(ctx.page); }
    catch { publish({ status: 'error', message: '当前页面目标不可读取来源事实。', sources: [] }); return; }
    const manifest = structuredClone(ctx.manifest);
    publish({ status: 'active', sources: refs.map(ref => ({ ref, status: 'loading' })) });
    const update = (index, source) => {
      if (disposed || epoch !== generation || key !== context().key) return;
      publish({ ...state, sources: state.sources.map((row, i) => i === index ? source : row) });
    };
    const readSource = async (ref, index) => {
      const controller = new AbortController(); controllers.push(controller);
      const request = { result_ref: ref, mode: 'facts', target, manifest,
        request_id: crypto.randomUUID(), instance_id: crypto.randomUUID(), signal: controller.signal };
      const cancel = () => { Promise.resolve().then(() => store.adapters.bridge.cancelRead?.(request)).catch(() => {}); };
      controller.signal.addEventListener('abort', cancel, { once: true });
      try {
        const body = await store.adapters.bridge.readResult(request);
        if (disposed || controller.signal.aborted || epoch !== generation || key !== context().key) return;
        const view = parseFactView(body, ref, now());
        update(index, { ref, status: view.count ? 'ready' : 'empty', view });
        if (view.expiresAt !== null) {
          const expire = () => {
            if (disposed || epoch !== generation || controller.signal.aborted) return;
            const remaining = view.expiresAt - now();
            if (remaining > 0) { timers.push(setTimer(expire, Math.min(remaining, 2_147_483_647))); return; }
            update(index, { ref, status: 'expired', message: '来源事实已过期。恢复预览或重新打开页面后读取。' });
          };
          timers.push(setTimer(expire, Math.min(view.expiresAt - now(), 2_147_483_647)));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        const unsupported = ['FACTS_UNSUPPORTED_SOURCE', 'INVALID_PAGE'].includes(error?.code);
        update(index, { ref, status: unsupported ? 'unsupported' : 'error',
          message: error?.code === 'INVALID_PAGE' ? '该引用不支持 warehouse 事实视图或来源目标无效（INVALID_PAGE）。' :
            unsupported ? '该引用不支持 warehouse 全量事实视图。' :
              '来源读取失败：' + (error instanceof Error ? error.message : '未知错误') });
      } finally { controller.signal.removeEventListener('abort', cancel); }
    };
    let next = 0;
    const drain = async () => {
      while (!disposed && epoch === generation && key === context().key && next < refs.length) {
        const index = next++;
        await readSource(refs[index], index);
      }
    };
    for (let worker = 0; worker < Math.min(4, refs.length); worker++) void drain();
  };
  const unsubscribe = store.subscribe(refresh);
  refresh();
  return { getSnapshot: () => state, subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    dispose() { disposed = true; generation++; unsubscribe(); clear(); listeners.clear(); } };
}
