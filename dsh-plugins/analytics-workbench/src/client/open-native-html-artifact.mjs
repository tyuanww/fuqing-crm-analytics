/** The public mounted face is ready before a new session owns any tabs. */
export async function openNativeHtmlArtifact(sidebarRight, sessionId, address, { timeoutMs = 5000, signal } = {}) {
  signal?.throwIfAborted();
  const mounted = sidebarRight?.mounted;
  if (!mounted || typeof mounted.getSnapshot !== 'function' || typeof mounted.subscribe !== 'function'
    || typeof sidebarRight.openResource !== 'function') {
    throw new Error('原生右侧产物栏合同尚未连接。任务已保留，请重试打开。');
  }
  if (typeof sessionId !== 'string' || !sessionId || !Number.isFinite(timeoutMs) || timeoutMs < 0) {
    throw new Error('原生 HTML 产物请求无效。');
  }
  await new Promise((resolve, reject) => {
    let timer, settled = false, dispose = () => {};
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', aborted);
      dispose();
      if (error) reject(error); else resolve();
    };
    const aborted = () => finish(signal.reason);
    const sync = () => { if (mounted.getSnapshot() === sessionId) finish(); };
    signal?.addEventListener('abort', aborted, { once: true });
    if (signal?.aborted) { aborted(); return; }
    const unsubscribe = mounted.subscribe(sync);
    dispose = typeof unsubscribe === 'function' ? unsubscribe : () => {};
    // A subscription may publish synchronously before returning its disposer.
    if (settled) dispose();
    else {
      timer = setTimeout(() => finish(new Error('对话已打开，右侧产物栏尚未就绪。任务已保留，请重试打开。')), timeoutMs);
      sync();
    }
  });
  signal?.throwIfAborted();
  // A later UI gesture may change the foreground between the ready event and this continuation.
  if (mounted.getSnapshot() !== sessionId) {
    throw new Error('当前对话已切换。HTML 修改任务已保留，请重新打开对应对话。');
  }
  // The official face places the resource and expands its column atomically.
  // Its claim/mount errors must reach the client; do not silently fall back to another session.
  sidebarRight.openResource(address);
}
