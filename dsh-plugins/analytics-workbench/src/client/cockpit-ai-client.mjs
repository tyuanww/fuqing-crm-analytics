/** Native DSH does the AI work; this client only manages durable candidates. */
const PREFIX = '/api/v1/analytics/cockpit-ai';
export function nativeArtifactPrompt(job) {
  return `请帮我修改驾驶舱产物 ${JSON.stringify(job.title ?? job.filename)}（版本 ${job.base_version}）。先读取当前目录的 TASK.md 和源文件，确认内容并询问我想怎样修改。等我提出要求后再动手，完成后交付候选，由我回驾驶舱预览并确认保存。`;
}

export function createCockpitAIClient(http, { openNative, onSaved = async () => {} } = {}) {
  const listeners = new Set();
  let state = { jobs: [], active: null, busy: false, confirmationUncertain: false, message: '', comparison: null, viewer: null, html: null, previewVariant: null };
  let pendingBegin = null, disposed = false;
  const update = patch => { if (disposed) return; state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  async function request(path, { method = 'GET', body } = {}) {
    if (!http?.base) throw new Error('AI 产物服务尚未配置。');
    const response = await (http.fetchImpl ?? fetch)(http.base + PREFIX + path, { method,
      headers: { authorization: 'Bearer ' + http.token, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const error = new Error(payload?.error?.message ?? `AI 修改请求失败（${response.status}）`);
      error.status = response.status; throw error;
    }
    return response;
  }
  const json = async (path, options) => (await request(path, options)).json();
  const accept = job => {
    if (!job || typeof job.id !== 'string') throw new Error('AI 修改回执无效。');
    update({ active: job, jobs: ['SAVED', 'CANCELLED'].includes(job.status)
      ? state.jobs.filter(row => row.id !== job.id) : [job, ...state.jobs.filter(row => row.id !== job.id)] });
  };
  async function perform(fn) {
    if (state.busy) return false;
    update({ busy: true, message: '' });
    try { await fn(); return true; } catch (error) { update({ message: error.message }); return false; }
    finally { update({ busy: false }); }
  }
  const api = {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    hasUnsavedChanges: () => state.confirmationUncertain,
    async refresh() {
      if (state.busy || state.confirmationUncertain) return;
      await perform(async () => {
        const jobs = []; let offset = 0;
        do {
          const result = await json('?offset=' + offset);
          if (!Array.isArray(result.items) || (result.next_offset != null
            && (!Number.isSafeInteger(result.next_offset) || result.next_offset <= offset))) throw new Error('AI 修改任务列表无效。');
          jobs.push(...result.items); offset = result.next_offset ?? null;
        } while (offset !== null && !disposed);
        update({ jobs });
      });
    },
    select(targetKind, targetId) {
      if (state.busy || state.confirmationUncertain) return;
      const active = state.jobs.find(row => row.target_kind === targetKind && row.target_id === targetId)
        ?? (state.active?.target_kind === targetKind && state.active?.target_id === targetId ? state.active : null);
      if (active?.id !== state.active?.id) update({ active, viewer: null, html: null, comparison: null, previewVariant: null, message: '' });
    },
    async begin(target_kind, target_id, base_version) {
      if (state.confirmationUncertain) return false;
      return perform(async () => {
        if (typeof openNative !== 'function') throw new Error('原生 AI 对话尚未连接。');
        const prior = state.jobs.find(job => job.target_kind === target_kind && job.target_id === target_id);
        if (prior) { accept(prior); await openNative(prior, false); return; }
        if (!pendingBegin || pendingBegin.target_id !== target_id || pendingBegin.base_version !== base_version || pendingBegin.target_kind !== target_kind) {
          pendingBegin = { id: 'ai_' + crypto.randomUUID(), target_kind, target_id, base_version };
        }
        const job = await json('', { method: 'POST', body: pendingBegin });
        accept(job); pendingBegin = null;
        update({ viewer: null, html: null, comparison: null, previewVariant: null });
        await openNative(job, true);
      });
    },
    async openConversation() {
      if (!state.active || state.confirmationUncertain) return false;
      return perform(async () => { await openNative(state.active, false); });
    },
    async collect() {
      if (!state.active || state.confirmationUncertain) return false;
      return perform(async () => {
        accept(await json('/' + state.active.id + '/collect', { method: 'POST' }));
        if (state.active.status === 'READY') {
          update({ comparison: await json('/' + state.active.id + '/comparison'), message: 'AI 候选已收取，尚未保存。请检查修改前后内容。' });
        }
      });
    },
    async preview(variant = 'candidate') {
      if (!state.active || state.confirmationUncertain) return false;
      return perform(async () => {
        const job = state.active;
        const comparison = await json('/' + job.id + '/comparison');
        if (job.target_kind === 'page' || /\.html?$/i.test(job.filename)) {
          const text = await (await request('/' + job.id + '/content?variant=' + variant)).text();
          update({ comparison, previewVariant: variant, viewer: null, html: job.target_kind === 'page' ? JSON.parse(text) : { html: text, css: '', js: '', resources: [] } });
        } else {
          update({ comparison, previewVariant: variant, html: null, viewer: await json('/' + job.id + '/viewer?variant=' + variant) });
        }
      });
    },
    async confirm() {
      if (!state.active || !state.active.candidate_hash) return { ok: false };
      let saved = false, savedJob = null;
      await perform(async () => {
        const submitted = state.active, wasUncertain = state.confirmationUncertain;
        update({ confirmationUncertain: true });
        try {
          const result = await json('/' + submitted.id + '/confirm', { method: 'POST', body: { candidate_hash: submitted.candidate_hash } });
          if (result.id !== submitted.id || result.candidate_hash !== submitted.candidate_hash || result.status !== 'SAVED'
            || result.saved_version !== submitted.base_version + 1 || result.target_id !== submitted.target_id) throw new Error('保存回执不匹配，请保留页面并重试核对。');
          accept(result); saved = true; savedJob = result;
          update({ confirmationUncertain: false, viewer: null, html: null, comparison: null, previewVariant: null, message: `AI 修改已保存为版本 ${result.saved_version}。` });
        } catch (error) {
          if (!wasUncertain && error.status && error.status < 500) update({ confirmationUncertain: false });
          throw error;
        }
      });
      // Refresh failures cannot undo a verified receipt or cause another confirmation.
      if (saved) { try { await onSaved(savedJob); } catch { update({ message: '新版本已保存，产物列表刷新失败，请手动刷新。' }); } }
      return { ok: saved };
    },
    persistForLeave() { return api.confirm(); },
    async discardForLeave() { return { ok: !state.confirmationUncertain }; },
    async cancel() {
      if (!state.active || state.confirmationUncertain) return false;
      return perform(async () => {
        const result = await json('/' + state.active.id + '/cancel', { method: 'POST' });
        accept(result);
        update({ viewer: null, html: null, comparison: null, previewVariant: null, message: result.status === 'SAVED' ? '此候选已保存，请刷新查看新版本。' : '已放弃候选，原版本保留。AI 对话如仍运行，请在原生对话中停止。' });
      });
    },
    dispose() { disposed = true; listeners.clear(); },
  };
  return api;
}
