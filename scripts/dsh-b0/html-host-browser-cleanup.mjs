/** Bounded teardown for resources explicitly owned by the isolated HTML probe. */
export function installProbeInterruption(onAbort, { timeoutMs = 180000 } = {}) {
  const controller = new AbortController();
  const errors = [];
  let resolveAborted;
  const aborted = new Promise(resolve => { resolveAborted = resolve; });
  const interrupt = reason => {
    if (controller.signal.aborted) return;
    controller.abort(reason);
    resolveAborted(reason);
    // Wake owned I/O, then let the runner's finally join it and persist failure.
    try { onAbort(); } catch (error) { errors.push(String(error.message)); }
  };
  const term = () => interrupt(new Error('HTML_PROBE_INTERRUPTED SIGTERM'));
  const int = () => interrupt(new Error('HTML_PROBE_INTERRUPTED SIGINT'));
  process.on('SIGTERM', term);
  process.on('SIGINT', int);
  const timer = setTimeout(() => interrupt(new Error('HTML_PROBE_RUN_TIMEOUT')), timeoutMs);
  return {
    signal: controller.signal, aborted, errors,
    dispose() {
      clearTimeout(timer);
      process.off('SIGTERM', term);
      process.off('SIGINT', int);
    },
  };
}

/** The deadline remains attached while callers consume the response body. */
export function fetchProbeResponse(url, init = {}, { signal, timeoutMs = 10000 } = {}) {
  return fetch(url, { ...init, signal: AbortSignal.any([
    ...[signal, init.signal].filter(Boolean), AbortSignal.timeout(timeoutMs),
  ]) });
}

function childRunning(child) {
  if (!child?.pid || child.exitCode !== null || child.signalCode !== null)
    return false;
  try {
    process.kill(child.pid, 0);
    return true;
  } catch (error) {
    if (error.code === "ESRCH") return false;
    throw error;
  }
}

export async function boundedAttempt(action, timeoutMs, label) {
  let timer;
  try {
    return await Promise.race([
      Promise.resolve().then(action),
      new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error("HTML_PROBE_CLEANUP_TIMEOUT " + label)),
          timeoutMs,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

export async function stopOwnedChild({
  child,
  exit,
  graceful = null,
  graceMs = 0,
  termMs = 8000,
  killMs = 3000,
}) {
  const receipt = {
    pid: child.pid,
    term_sent: false,
    kill_sent: false,
    errors: [],
  };
  const wait = async (ms) => {
    if (!childRunning(child)) {
      receipt.exit = { code: child.exitCode, signal: child.signalCode };
      return;
    }
    try {
      receipt.exit = await boundedAttempt(() => exit, ms, "pid " + child.pid);
    } catch (error) {
      if (!error.message.startsWith("HTML_PROBE_CLEANUP_TIMEOUT"))
        receipt.errors.push(error.message);
    }
  };
  if (graceful && childRunning(child)) {
    try {
      await boundedAttempt(
        graceful,
        Math.max(1, graceMs),
        "graceful pid " + child.pid,
      );
    } catch (error) {
      receipt.errors.push(error.message);
    }
    await wait(Math.max(1, graceMs));
  }
  if (childRunning(child)) {
    receipt.term_sent = child.kill("SIGTERM");
    await wait(termMs);
  }
  if (childRunning(child)) {
    receipt.kill_sent = child.kill("SIGKILL");
    await wait(killMs);
  }
  receipt.remaining = childRunning(child);
  if (receipt.remaining)
    receipt.errors.push("HTML_PROBE_OWNED_CHILD_REMAINS " + child.pid);
  return receipt;
}

/**
 * Every cleanup is attempted even if another close fails. Artifact writes run
 * only after all cleanup attempts; logging cannot skip another owned resource.
 */
export async function cleanupOwnedResources(actions, artifacts = []) {
  const receipt = { steps: {}, artifacts: {}, errors: [] };
  for (const [name, action, timeoutMs = 12000] of actions) {
    try {
      const result = await boundedAttempt(action, timeoutMs, name);
      receipt.steps[name] = {
        status: "PASS",
        ...(result === undefined ? {} : { result }),
      };
      if (result?.remaining || result?.errors?.length) {
        receipt.steps[name].status = "FAIL";
        receipt.errors.push({
          name,
          detail: result.errors?.join("; ") || "owned resource remains",
        });
      }
    } catch (error) {
      receipt.steps[name] = { status: "FAIL", detail: error.message };
      receipt.errors.push({ name, detail: error.message });
    }
  }
  for (const [name, write, timeoutMs = 5000] of artifacts) {
    try {
      await boundedAttempt(write, timeoutMs, name);
      receipt.artifacts[name] = { status: "PASS" };
    } catch (error) {
      receipt.artifacts[name] = { status: "FAIL", detail: error.message };
      receipt.errors.push({ name, detail: error.message });
    }
  }
  return receipt;
}
