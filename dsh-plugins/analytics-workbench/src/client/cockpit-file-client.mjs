/** Durable file copies and Office save receipts. Secrets stay in the existing local HTTP adapter. */
const PREFIX = '/api/v1/analytics/cockpit-files';
export const MAX_COCKPIT_FILE_BYTES = 20 * 1024 * 1024;
function checkedPreferences(value) {
  if (!value || !Array.isArray(value.removed) || !Array.isArray(value.order)
    || ![...value.removed, ...value.order].every(id => typeof id === 'string')
    || !Number.isInteger(value.rail_width) || value.rail_width < 180 || value.rail_width > 480) throw new Error('产物设置回执无效，请刷新后重试。');
  const layout = value.rail_layout;
  if (layout != null && (!['x', 'y', 'width', 'height'].every(key => Number.isInteger(layout[key]))
    || layout.x < 0 || layout.y < 0 || layout.width < 180 || layout.width > 480 || layout.height < 240 || layout.height > 1000)) throw new Error('浮动面板设置回执无效，请刷新后重试。');
  return value;
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

export function createCockpitFileClient(http) {
  const listeners = new Set();
  let state = { preferences: { removed: [], order: [], rail_width: 248 }, preferencesReady: false, organizing: false, files: [], status: 'idle', message: '', busy: false, editor: null, dirty: false, confirmationUncertain: false };
  let preferenceEpoch = 0, organizationCount = 0, organization = Promise.resolve();
  let generation = 0, saveId = null, saveGeneration = null, disposed = false, editorSynced = true;
  const update = patch => { state = { ...state, ...patch }; for (const listener of listeners) listener(); };
  async function request(path, { method = 'GET', body, raw, headers = {} } = {}) {
    if (!http?.base) throw new Error('产物保存服务尚未配置。');
    const response = await (http.fetchImpl ?? fetch)(http.base + PREFIX + path, {
      method, headers: { authorization: 'Bearer ' + http.token,
        ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? raw : JSON.stringify(body),
    });
    if (!response.ok) {
      const error = await response.json().catch(() => null);
      throw new Error(error?.error?.message || `文件服务请求失败（${response.status}）`);
    }
    return response;
  }
  const json = async (path, init) => (await request(path, init)).json();
  const api = {
    getSnapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    hasUnsavedChanges: () => state.dirty || state.confirmationUncertain || Boolean(saveId),
    async refresh() {
      if (state.organizing) return;
      const epoch = preferenceEpoch;
      update({ status: 'loading' });
      try {
        const preferences = checkedPreferences(await json('/preferences'));
        const files = []; let offset = 0;
        do {
          const page = await json('?offset=' + offset);
          if (!Array.isArray(page.items) || (page.next_offset !== null && (!Number.isSafeInteger(page.next_offset) || page.next_offset <= offset))) throw new Error('文件列表分页无效，请重试。');
          files.push(...page.items); offset = page.next_offset;
        } while (offset !== null && !disposed);
        if (!disposed) update({ files, ...(epoch === preferenceEpoch ? { preferences, preferencesReady: true } : {}), status: 'ready' });
      } catch (error) { if (!disposed) update({ status: 'error', message: error.message }); }
    },
    async organize(change) {
      if (!state.preferencesReady) return false;
      preferenceEpoch++; organizationCount++;
      update({ organizing: true, message: '' });
      const next = organization.then(async () => {
        try { update({ preferences: checkedPreferences(await json('/preferences', { method: 'PATCH', body: change })) }); return true; }
        catch (error) { update({ message: error.message }); return false; }
        finally { organizationCount--; update({ organizing: organizationCount > 0 }); }
      });
      organization = next;
      return next;
    },
    async upload(file, origin = { kind: 'upload' }) {
      if (state.busy) return null;
      if (!file.size || file.size > MAX_COCKPIT_FILE_BYTES) { update({ message: '文件不能为空，且不能超过 20 MB。' }); return null; }
      update({ busy: true, message: '' });
      try {
        // Content-based key lets an interrupted retry recover the same copy.
        const data = new Uint8Array(await file.arrayBuffer());
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(x => x.toString(16).padStart(2, '0')).join('');
        const originHash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify([file.name, origin]))))].map(x => x.toString(16).padStart(2, '0')).join('');
        const item = await json('?' + new URLSearchParams({ filename: file.name, origin: JSON.stringify(origin) }), {
          method: 'POST', raw: data, headers: { 'content-type': 'application/octet-stream', 'idempotency-key': digest + '-' + originHash },
        });
        update({ files: [item, ...state.files.filter(row => row.file_id !== item.file_id)], message: '已添加到产物库。' });
        return item;
      } catch (error) { update({ message: error.message }); return null; }
      finally { update({ busy: false }); }
    },
    async read(fileId) { return (await request('/' + encodeURIComponent(fileId) + '/content')).arrayBuffer(); },
    async openEditor(fileId) {
      if (state.busy || state.confirmationUncertain) return false;
      if (state.editor?.file_id === fileId) return true;
      if (api.hasUnsavedChanges()) return false;
      update({ busy: true, message: '' });
      try {
        const config = await json('/' + encodeURIComponent(fileId) + '/edit', { method: 'POST' });
        update({ editor: { ...config, file_id: fileId }, dirty: false, confirmationUncertain: false });
        generation++; saveId = null; editorSynced = true;
        return true;
      } catch (error) { update({ message: error.message }); return false; }
      finally { update({ busy: false }); }
    },
    changed(dirty) {
      // false means the editor has sent changes to its server, not that our
      // cabinet has persisted them. Wait for it before requesting forcesave.
      editorSynced = dirty === false;
      if (dirty === true) { generation++; update({ dirty: true, message: '有未保存修改。点击“保存版本”后写入产物库。' }); }
    },
    reportError(message) { update({ message }); },
    clearMessage() { update({ message: '' }); },
    async closeEditor() {
      if (api.hasUnsavedChanges() || state.busy) return false;
      const result = await api.discardForLeave();
      if (result.ok) update({ message: '' });
      return result.ok;
    },
    async save() {
      if (!state.editor) return { ok: !api.hasUnsavedChanges() };
      if (!api.hasUnsavedChanges()) return { ok: true };
      if (state.busy) return { ok: false, reason: 'busy' };
      const edit = state.editor;
      let dispatched = state.confirmationUncertain;
      if (saveId === null) {
        saveId = 'save_' + crypto.randomUUID();
        // A retry acknowledges the original snapshot, never later editor events.
        saveGeneration = generation;
      }
      update({ busy: true, message: '正在保存版本…' });
      try {
        const syncDeadline = Date.now() + 15000;
        while (!editorSynced && Date.now() < syncDeadline && !disposed) await delay(100);
        if (!editorSynced) throw new Error('文档仍在同步，请保留页面并重试保存。');
        dispatched = true;
        const validateReceipt = receipt => {
          if (receipt?.id !== saveId || receipt?.edit_key !== edit.edit_key
            || !['WAITING', 'SAVED', 'CONFLICT', 'FAILED'].includes(receipt.status)
            || (receipt.status === 'SAVED' && (!Number.isSafeInteger(receipt.version) || receipt.version < 1))) {
            throw new Error('保存回执不匹配，请保留页面并用同一请求重试核对。');
          }
          return receipt;
        };
        let receipt = validateReceipt(await json('/edits/' + edit.edit_key + '/save', { method: 'POST', body: { receipt_id: saveId } }));
        const deadline = Date.now() + 15000;
        while (receipt.status === 'WAITING' && Date.now() < deadline && !disposed) {
          await delay(250);
          receipt = validateReceipt(await json('/edits/' + edit.edit_key + '/receipts/' + saveId));
        }
        if (receipt.status === 'CONFLICT') {
          saveId = null;
          update({ dirty: true, confirmationUncertain: false, message: '文件已有其他新版本，当前修改未覆盖它。请先在编辑器下载保留修改，再放弃本次编辑并刷新。' });
          return { ok: false, reason: 'conflict' };
        }
        if (receipt.status === 'FAILED') {
          saveId = null;
          update({ dirty: true, confirmationUncertain: false, message: '文档服务未能保存，本次修改仍保留在编辑器中。可重试保存，或先下载保留修改。' });
          return { ok: false, reason: 'failed' };
        }
        if (receipt.status !== 'SAVED') throw new Error('保存回执尚未到达，请保留页面并重试保存。');
        saveId = null;
        const unchanged = generation === saveGeneration;
        update({ dirty: !unchanged, confirmationUncertain: false,
          message: `版本 ${receipt.version} 已保存。${unchanged ? '' : '保存期间又有修改，请再次保存。'}` });
        await api.refresh();
        return { ok: unchanged, reason: unchanged ? undefined : 'changed' };
      } catch (error) {
        if (!dispatched) saveId = null;
        update({ confirmationUncertain: dispatched, message: error.message });
        return { ok: false, reason: dispatched ? 'uncertain' : 'sync' };
      } finally { update({ busy: false }); }
    },
    persistForLeave() { return api.save(); },
    async discardForLeave() {
      if (state.busy) return { ok: false, reason: 'busy' };
      if (state.confirmationUncertain) return { ok: false, message: '请先重试保存、核对回执，避免放弃一份已经保存的修改。' };
      try {
        if (state.editor) await json('/edits/' + state.editor.edit_key + '/cancel', { method: 'POST' });
        saveId = null; generation++;
        update({ editor: null, dirty: false, confirmationUncertain: false, message: '已放弃未保存修改。' });
        return { ok: true };
      } catch (error) { update({ message: error.message }); return { ok: false }; }
    },
    dispose() { disposed = true; listeners.clear(); },
  };
  return api;
}
