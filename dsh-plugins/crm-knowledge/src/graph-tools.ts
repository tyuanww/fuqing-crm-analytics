import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { createGraphReader } from './graph.mjs';

export const name = 'crm-textbook-graph';
export const inject = ['tools'];

/** System preset configuration only. The model cannot select a credential or document. */
export function apply(ctx: Context, config: { settingsFile?: string } = {}): void {
  const graph = createGraphReader(config.settingsFile);
  ctx.tools.register(defineTool({
    name: 'query_crm_knowledge_graph',
    description: '只读查询已授权 CRM 教材的 Neo4j 一跳关系，例如指标的分子、分母、依赖和对象，附教材分块与页码。topic填简短指标词（如会员溢价）。这是机器提取关系，须核对原文，业务口径优先用 crm_knowledge_explain。无法查询时明确报告，不把文档搜索当作图谱命中。',
    parameters: {
      topic: { type: 'string', required: true, description: '2–80字符的指标或概念，如会员溢价、客单价、IPT' },
      limit: { type: 'number', description: '最多返回多少条关系，整数1–20，默认10' },
    },
    output: { schema: { type: 'json' }, render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }] },
    timeoutMs: 18000, isConcurrencySafe: () => false,
    execute: (args, exec) => graph.query(args, exec.signal),
  }));
}
