export async function runBackpressure({ requests = 100, concurrency = 10, task = async () => ({ status: 200 }), synthetic = false } = {}) {
  if (!Number.isInteger(requests) || requests < 1 || !Number.isInteger(concurrency) || concurrency < 1) throw new Error('BACKPRESSURE_ARGUMENTS_INVALID');
  let cursor = 0; let active = 0; let peak = 0; const results = [];
  await new Promise((resolve, reject) => {
    const pump = () => {
      if (cursor >= requests && active === 0) return resolve();
      while (active < concurrency && cursor < requests) {
        const index = cursor++; active += 1; peak = Math.max(peak, active);
        Promise.resolve().then(() => task(index)).then(result => results[index] = result).catch(reject).finally(() => { active -= 1; pump(); });
      }
    };
    pump();
  });
  return { status: synthetic ? 'PASS' : 'NOT_RUN', evidence_scope: synthetic ? 'synthetic-scheduler' : 'real-http-required', ...(synthetic ? {} : { reason: 'scheduler-only synthetic; real HTTP service evidence is required' }), requests, concurrency, peak, results };
}
