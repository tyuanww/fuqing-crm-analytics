export async function runBackpressure({ requests = 100, concurrency = 10, task = async () => ({ status: 200 }), synthetic = false, evidenceScope = null } = {}) {
  if (!Number.isInteger(requests) || requests < 1 || !Number.isInteger(concurrency) || concurrency < 1) throw new Error('BACKPRESSURE_ARGUMENTS_INVALID');
  let cursor = 0; let active = 0; let peak = 0; const results = [];
  let failed = false; let firstFailure;
  await new Promise((resolve, reject) => {
    const pump = () => {
      if (active === 0 && (failed || cursor >= requests)) return failed ? reject(firstFailure) : resolve();
      while (!failed && active < concurrency && cursor < requests) {
        const index = cursor++; active += 1; peak = Math.max(peak, active);
        Promise.resolve().then(() => task(index)).then(result => results[index] = result).catch(error => {
          if (!failed) { failed = true; firstFailure = error; }
        }).finally(() => { active -= 1; pump(); });
      }
    };
    pump();
  });
  const scope = evidenceScope ?? (synthetic ? 'synthetic-scheduler' : 'real-http-required');
  return { status: synthetic ? 'PASS' : 'NOT_RUN', evidence_scope: scope, ...(synthetic ? {} : { reason: 'scheduler-only synthetic; real HTTP service evidence is required' }), requests, concurrency, peak, results };
}
