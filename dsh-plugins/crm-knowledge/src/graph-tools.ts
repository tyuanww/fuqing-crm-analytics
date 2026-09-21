import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { citationsFromGraphResult, createGraphReader } from './graph.mjs';

export const name = 'crm-textbook-graph';
export const inject = ['tools'];

function principalOf(ctx: Context, sessionId: string | undefined) {
  const username = ctx.get('crmDashboard')?.principal?.(sessionId ?? '')?.username;
  return username ? { principal: { username } } : undefined;
}

function remember(ctx: Context, sessionId: string | undefined, result: { status?: string; sources?: unknown; source?: unknown; document?: unknown }) {
  if (result?.status !== 'OK') return;
  ctx.get('crmDashboard')?.rememberCitations?.(sessionId ?? '', citationsFromGraphResult(result));
}

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
      const result = await graph.query(args, exec.signal, principalOf(ctx, exec.agent?.session.id));
      remember(ctx, exec.agent?.session.id, result);
      return result;
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
      const result = await graph.retrieve(args, exec.signal, principalOf(ctx, exec.agent?.session.id));
      remember(ctx, exec.agent?.session.id, result);
      return result;
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
      const result = await graph.expand(args, exec.signal, principalOf(ctx, exec.agent?.session.id));
      remember(ctx, exec.agent?.session.id, result);
      return result;
    },
  }));
  isolateSharedRetrieve(ctx);
}
