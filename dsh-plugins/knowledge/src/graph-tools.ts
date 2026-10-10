import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { citationsFromGraphResult, createGraphReader } from './graph.mjs';
import { KNOWLEDGE_ACCESS_CONTRACT } from './knowledge-access.generated.js';

export const name = 'crm-textbook-graph';
export const inject = ['tools'];

function isolateSharedRetrieve(ctx: Context) {
  const runtime = ctx.tools as { guard?: (fn: (execution: { name: string }) => string | undefined) => () => void };
  if (typeof runtime.guard !== 'function') return;
  const registerGuard = runtime.guard.bind(ctx.tools);
  try {
    ctx.effect(() => {
      const disposeGuard = registerGuard(execution => execution.name === 'weknora_search'
        ? '共享检索不能作为账号隔离；请使用已连接 CRM 的教材检索工具。'
        : undefined);
      return typeof disposeGuard === 'function' ? disposeGuard : () => {};
    }, 'crm: isolate shared retrieve');
  } catch { /* some hosts expose guard without a live layer */ }
}

/** System preset configuration only. The model cannot select a credential, account or document. */
export function apply(ctx: Context, config: { settingsFile?: string } = {}): void {
  const graph = createGraphReader(config.settingsFile);
  const lifetime = new AbortController();
  ctx.effect(() => () => lifetime.abort(), 'knowledge: cancel owned graph requests');
  const denied = (code: string) => ({ schema_version: 'crm-textbook-graph/v1', status: 'UNAVAILABLE',
    reason: { code, message: '知识访问身份不可用或已撤销，未返回教材或历史结果。' },
    relations: [], sources: [], review_notes: [] });
  async function execute(operation: 'query' | 'retrieve' | 'expand', args: unknown, sessionId: string | undefined, signal: AbortSignal) {
    signal.throwIfAborted();
    const provider = ctx.get('crmKnowledgeAccess');
    if (!provider) return denied('IDENTITY_PROVIDER_NOT_AVAILABLE');
    if (provider.contract !== KNOWLEDGE_ACCESS_CONTRACT || typeof provider.authorize !== 'function') return denied('IDENTITY_CONTRACT_MISMATCH');
    const lease = provider.authorize(sessionId ?? '');
    if (!lease || !lease.isCurrent() || lifetime.signal.aborted) return denied('NOT_CONNECTED');
    const combined = AbortSignal.any([signal, lease.signal, lifetime.signal]);
    const result = await graph[operation](args, combined, { principal: { username: lease.username } });
    signal.throwIfAborted();
    if (lifetime.signal.aborted || lease.signal.aborted || !lease.isCurrent() || ctx.get('crmKnowledgeAccess') !== provider) return denied('NOT_CONNECTED');
    if (result?.status === 'OK') lease.rememberCitations(citationsFromGraphResult(result));
    return result;
  }
  const json = { schema: { type: 'json' as const }, render: (_args: unknown, value: unknown) => [{ type: 'text' as const, text: JSON.stringify(value) }] };
  ctx.tools.register(defineTool({
    name: 'query_crm_knowledge_graph',
    description: '只读查询当前 CRM 账号被授权教材的 Neo4j 一跳关系，例如指标的分子、分母、依赖和对象，附教材分块、页码、文档版本和审核状态。topic填简短指标词（如会员溢价）。须已连接 CRM。这是机器提取关系，须核对原文，业务口径优先用 crm_knowledge_explain。无法查询时明确报告，不把文档搜索当作图谱命中。',
    parameters: {
      topic: { type: 'string', required: true, description: '2–80字符的指标或概念，如会员溢价、客单价、IPT' },
      limit: { type: 'number', description: '最多返回多少条关系，整数1–20，默认10' },
    },
    output: json, timeoutMs: 18000, isConcurrencySafe: () => false,
    execute: async (args, exec) => {
      return execute('query', args, exec.agent?.session.id, exec.signal);
    },
  }));
  ctx.tools.register(defineTool({
    name: 'query_crm_knowledge_sources',
    description: '在当前 CRM 账号被授权的教材中检索原文分块。须已连接 CRM。不能用共享 retrieve key 或前端隐藏代替账号隔离；失败时不回退历史缓存。',
    parameters: {
      query: { type: 'string', required: true, description: '2–80字符的检索词' },
      limit: { type: 'number', description: '最多返回多少条分块，整数1–20，默认10' },
    },
    output: json, timeoutMs: 18000, isConcurrencySafe: () => false,
    execute: async (args, exec) => {
      return execute('retrieve', args, exec.agent?.session.id, exec.signal);
    },
  }));
  ctx.tools.register(defineTool({
    name: 'expand_crm_knowledge_citation',
    description: '按分块 ID 展开当前账号有权查看的教材引用。每次重新检查 CRM 账号权限、文档状态和版本；无权或服务不可用时拒绝，不返回历史缓存。',
    parameters: {
      chunk_id: { type: 'string', required: true, description: '教材分块 UUID' },
    },
    output: json, timeoutMs: 18000, isConcurrencySafe: () => false,
    execute: async (args, exec) => {
      return execute('expand', args, exec.agent?.session.id, exec.signal);
    },
  }));
  isolateSharedRetrieve(ctx);
}
