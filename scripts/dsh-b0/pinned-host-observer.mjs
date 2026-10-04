/** Test-only IPC observer loaded by the unchanged official Web CLI. No HTTP control endpoint. */
import { createHash } from 'node:crypto';

export const inject = ['loader', 'agentPresets', 'agents', 'sessionPersistence', 'tools', 'appReady'];
export async function apply(ctx, config) {
  if (!process.send || !config.presetId || !config.workspace) throw Error('OWNED_HOST_OBSERVER_CONFIGURATION_REQUIRED');
  const handles = new Map();
  const { createUserMessage } = await import(config.llmModule);
  const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
  const send = message => { if (process.connected) process.send(message); };
  async function session(id, resume) {
    if (handles.has(id)) return handles.get(id).agent;
    const options = { agentOptions: { provider: 'deepseek-official', model: 'deepseek-v4-flash' },
      setup: async agentCtx => { await ctx.agentPresets.mount(agentCtx, config.presetId); } };
    const handle = resume ? await ctx.agents.resume({ ...options, resumeSessionId: id })
      : await ctx.agents.create({ ...options, sessionId: id, meta: { cwd: config.workspace, agentPreset: config.presetId } });
    handles.set(id, handle);
    return handle.agent;
  }
  async function inspect(id, prefix) {
    await ctx.sessionPersistence.flush();
    const reader = await ctx.sessionPersistence.open(id, 'read');
    try {
      const { events } = await reader.read();
      const assistant = events.filter(e => e.type === 'assistant/message').flatMap(e => e.data.message.content)
        .filter(block => block.type === 'text').map(block => block.text);
      return { id, preset: reader.header.agentPreset, count: events.length, digest: digest(events),
        prefix_digest: digest(events.slice(0, prefix ?? events.length)), assistant,
        events: events.map(e => ({ seq: e.seq, type: e.type })) };
    } finally { await reader.close(); }
  }
  async function command(message) {
    if (message.command === 'roster') {
      await ctx.loader.await();
      return { pid: process.pid, presets: await ctx.agentPresets.list(),
        composition: await ctx.agentPresets.compositionInventory(),
        crm_identity: ctx.get('crmKnowledgeAccess')?.contract ?? null };
    }
    if (message.command === 'inspect') return inspect(message.sessionId, message.prefix);
    if (message.command === 'dispose') {
      await handles.get(message.sessionId)?.dispose(); handles.delete(message.sessionId);
      return { disposed: !ctx.agents.get(message.sessionId) };
    }
    if (message.command === 'retire-preset') {
      const entry = [...ctx.loader.entries()].find(item => item.options.id === 'preset-shinemage-crm-knowledge');
      if (!entry) throw Error('OWNED_PRESET_ENTRY_NOT_FOUND');
      await entry.update({ disabled: true });
      return { presets: await ctx.agentPresets.list(),
        existing_tools: ctx.tools.schemas(handles.get(message.sessionId).agent).map(tool => tool.name) };
    }
    if (message.command === 'fault-hang') {
      // Explicit fault injection only inside this IPC-owned disposable host process.
      await ctx.plugin({ name: 'owned-hung-plugin', apply() { while (true) { /* simulate a blocking plugin */ } } });
      return;
    }
    const agent = await session(message.sessionId, message.resume === true);
    if (message.command === 'tools') return ctx.tools.schemas(agent).map(tool => tool.name);
    if (message.command === 'tool') return ctx.tools.execute({ name: message.name, arguments: message.args ?? {},
      agent, callId: 'owned-' + message.id, signal: AbortSignal.timeout(10000) });
    if (message.command === 'prompt') {
      agent.followup(createUserMessage({ source: { kind: 'user' }, content: [{ type: 'text', text: message.text }] }));
      await agent.whenIdle();
      return inspect(message.sessionId, message.prefix);
    }
    throw Error('OWNED_HOST_OBSERVER_UNKNOWN_COMMAND');
  }
  const receive = message => {
    if (!message || typeof message.id !== 'number') return;
    if (message.command === 'stop') { process.emit('SIGTERM'); return; }
    void command(message).then(result => send({ id: message.id, result }), error => send({ id: message.id, error: String(error.message) }));
  };
  ctx.effect(() => {
    process.on('message', receive);
    const ready = ctx.appReady.onReady(() => send({ ready: true, pid: process.pid }));
    return async () => {
      ready(); process.off('message', receive);
      for (const handle of handles.values()) await handle.dispose();
      handles.clear();
    };
  }, 'owned-host-observer');
}
