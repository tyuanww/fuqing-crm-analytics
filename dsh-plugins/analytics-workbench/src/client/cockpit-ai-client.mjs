/** Native DSH does the AI work; this client only manages durable candidates. */
const PREFIX = '/api/v1/analytics/cockpit-ai';
const EDIT_CONTEXT_PREFIX = '/api/v1/analytics/page-edit-contexts';
const CONTEXT_ID = /^editctx_[A-Za-z0-9]{16,64}$/;

export function nativeArtifactPrompt(job) {
  if (job.instruction?.trim()) return `请修改驾驶舱产物 ${JSON.stringify(job.title ?? job.filename)}（版本 ${job.base_version}）。${job.selection ? '只调整我在页面选中的板块。' : ''}先读取 TASK.md、源文件及存在的 SELECTED.json，再执行以下已确认的修改要求：\n${job.instruction}\n保持其他内容和交互，完成后交付候选，右侧产物栏会从候选包统一渲染，让我检查；尚未确认前不要保存到产物库。`;
  return `请帮我修改驾驶舱产物 ${JSON.stringify(job.title ?? job.filename)}（版本 ${job.base_version}）。${job.selection ? '本次仅修改我在画布点选的板块，严格遵守 TASK.md 的选区范围。' : ''}先读取当前目录的 TASK.md 和源文件，确认内容并询问我想怎样修改。等我提出要求后再动手，完成后交付候选，由我在产物栏预览并确认保存。`;
}

/** The plugin owns requests; closing/recreating a native tab must not forget a lost receipt. */
export function createCockpitArtifactClients(createClient) {
  const clients = new Map(), listeners = new Set();
  const notify = () => { for (const listener of listeners) listener(); };
  return {
    get(id) {
      if (!clients.has(id)) {
        const client = createClient(); client.subscribe(notify); clients.set(id, client);
      }
      return clients.get(id);
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    hasUnsavedChanges: () => [...clients.values()].some(client => client.hasUnsavedChanges()),
    async persistForLeave() {
      for (const client of clients.values()) {
        if (client.hasUnsavedChanges() && !(await client.persistForLeave()).ok) return { ok: false };
      }
      return { ok: true };
    },
    dispose() { for (const client of clients.values()) client.dispose(); clients.clear(); listeners.clear(); },
  };
}

export function nativeEditContextPrompt(contextId) {
  if (typeof contextId !== 'string' || !CONTEXT_ID.test(contextId)) throw new Error('编辑上下文标识无效。');
  return `请基于编辑上下文 ${contextId} 修改当前选区。完成后回传结构化补丁，由我回驾驶舱预览并确认保存。`;
}

export function createCockpitAIClient(http, { openNative, onSaved = async () => {} } = {}) {
  const listeners = new Set();
  let state = { jobs: [], active: null, busy: false, confirmationUncertain: false, message: '', messageError: false, comparison: null, viewer: null, html: null, previewVariant: null };
  let pendingBegin = null, pendingLoad = null, disposed = false;
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
  async function editContextRequest(path, { method = 'GET', body, headers = {} } = {}) {
    if (!http?.base) throw new Error('AI 产物服务尚未配置。');
    const response = await (http.fetchImpl ?? fetch)(http.base + EDIT_CONTEXT_PREFIX + path, {
      method,
      headers: { authorization: 'Bearer ' + http.token, ...headers, ...(body ? { 'content-type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      const error = new Error(payload?.error?.message ?? `编辑上下文请求失败（${response.status}）`);
      error.status = response.status;
      error.code = payload?.error?.code;
      throw error;
    }
    return response.json();
  }
  const accept = job => {
    if (!job || typeof job.id !== 'string') throw new Error('AI 修改回执无效。');
    update({ active: job, jobs: ['SAVED', 'CANCELLED'].includes(job.status)
      ? state.jobs.filter(row => row.id !== job.id) : [job, ...state.jobs.filter(row => row.id !== job.id)] });
  };
  async function perform(fn) {
    if (state.busy) return false;
    update({ busy: true, message: '', messageError: false });
    try { await fn(); return true; } catch (error) { update({ message: error.message, messageError: true }); return false; }
    finally { update({ busy: false }); }
  }
  const api = {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    hasUnsavedChanges: () => state.confirmationUncertain,
    async load(jobId) {
      if (pendingLoad?.id === jobId) return pendingLoad.promise;
      if (state.confirmationUncertain) return false;
      if (state.active?.id === jobId && !state.busy) return true;
      if (state.busy) return false;
      const promise = perform(async () => {
        const job = await json('/' + encodeURIComponent(jobId));
        if (job.id !== jobId) throw new Error('修改任务回执不匹配');
        accept(job);
      });
      pendingLoad = { id: jobId, promise };
      try { return await promise; } finally { pendingLoad = null; }
    },
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
      if (active?.id !== state.active?.id) update({ active, viewer: null, html: null, comparison: null, previewVariant: null, message: '', messageError: false });
    },
    async begin(target_kind, target_id, base_version, selection = null, instruction = '') {
      if (state.confirmationUncertain) return false;
      return perform(async () => {
        if (typeof openNative !== 'function') throw new Error('原生 AI 对话尚未连接。');
        instruction = instruction.trim();
        if (instruction.length > 4000) throw new Error('修改要求不能超过 4000 字。');
        const prior = state.jobs.find(job => job.target_kind === target_kind && job.target_id === target_id);
        if (prior) { if (JSON.stringify(prior.selection ?? null) !== JSON.stringify(selection) || (prior.instruction ?? '') !== instruction || prior.base_version !== base_version) throw new Error('此产物已有其他范围或要求的 AI 修改任务，请先完成或放弃，再重新选择。'); accept(prior); await openNative(prior, false); return; }
        if (!pendingBegin || pendingBegin.target_id !== target_id || pendingBegin.base_version !== base_version || pendingBegin.target_kind !== target_kind || JSON.stringify(pendingBegin.selection ?? null) !== JSON.stringify(selection) || (pendingBegin.instruction ?? '') !== instruction) {
          pendingBegin = { id: 'ai_' + crypto.randomUUID(), target_kind, target_id, base_version, ...(selection ? { selection } : {}), ...(instruction ? { instruction } : {}) };
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
          const comparison = await json('/' + state.active.id + '/comparison');
          const html = state.active.target_kind === 'page' ? await (await request('/' + state.active.id + '/content?variant=candidate')).json() : null;
          update({ comparison, ...(html ? { html, previewVariant: 'candidate' } : {}), message: 'AI 候选已收取，尚未保存。请检查修改前后内容。' });
        }
      });
    },
    async preview(variant = 'candidate') {
      if (!state.active || state.confirmationUncertain) return false;
      return perform(async () => {
        const job = state.active;
        const comparison = job.candidate_hash ? await json('/' + job.id + '/comparison') : null;
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
      if (saved) { try { await onSaved(savedJob); } catch { update({ message: '新版本已保存，产物列表刷新失败，请手动刷新。', messageError: true }); } }
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
    async openEditContext(contextId) {
      if (state.confirmationUncertain) return false;
      return perform(async () => {
        if (typeof openNative !== 'function') throw new Error('原生 AI 对话尚未连接。');
        if (typeof contextId !== 'string' || !CONTEXT_ID.test(contextId)) throw new Error('编辑上下文标识无效。');
        update({ editContextId: contextId });
        await openNative({ context_id: contextId }, true);
      });
    },
    async submitEditPatch(contextId, operation, idempotencyKey) {
      if (!operation || typeof operation !== 'object' || Array.isArray(operation)) throw new Error('编辑操作无效。');
      if (!Array.isArray(operation.capabilities) || operation.capabilities.some(item => typeof item !== 'string')) {
        throw new Error('编辑操作缺少正式 capabilities。');
      }
      if (typeof contextId !== 'string' || !CONTEXT_ID.test(contextId)) throw new Error('编辑上下文标识无效。');
      if (typeof idempotencyKey !== 'string' || !idempotencyKey.trim()) throw new Error('需要稳定的幂等键。');
      if (operation.cas?.idempotency_key !== idempotencyKey) throw new Error('幂等键不一致。');
      try {
        return await editContextRequest('/' + contextId + '/patches', {
          method: 'POST',
          body: operation,
          headers: { 'idempotency-key': idempotencyKey },
        });
      } catch (error) {
        if (error.code === 'VERSION_CONFLICT' || error.code === 'HASH_MISMATCH') update({ editContextId: null });
        throw error;
      }
    },
    dispose() { disposed = true; listeners.clear(); },
  };
  return api;
}
