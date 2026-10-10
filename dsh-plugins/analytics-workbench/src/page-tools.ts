/** Public, tools-only adapter. No bridge, CRM service or host UI is started. */
import type { Context } from '@deepseek-ai/cordis';
import { defineTool } from '@deepseek-ai/dsh-tools';
import { PAGE_GENERATE_TOOL_NAME } from './competition-agent/page-family.mjs';
import { PAGE_TOOL_PARAMETERS, executePageTool } from './competition-agent/page-tools.mjs';

export const name = 'analytics-workbench-page-delivery-v1';
export const inject = ['tools'];

/** Native HTML delivery. The model authors the page; the browser workbench saves it into the cockpit. */
export function apply(ctx: Context) {
  ctx.tools.register(defineTool({
    name: PAGE_GENERATE_TOOL_NAME,
    description: '用户要生成 HTML 或驾驶舱时，把你在本回复里写好的自由 HTML 页面交出来。request_id 必须逐字复制用户消息中的 page-gen 标识；消息里没有时，填写一个 page-gen- 开头的新标识。不要写本地文件，不要改成 BoardSpec。本工具只交付源码包，保存由工作台完成。',
    parameters: PAGE_TOOL_PARAMETERS[PAGE_GENERATE_TOOL_NAME] as never,
    output: {
      schema: { type: 'object', additionalProperties: true },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }],
      presentationMeta: (_args, value) => value,
    },
    timeoutMs: 6000,
    isConcurrencySafe: () => false,
    execute: async (args, execution) => executePageTool(PAGE_GENERATE_TOOL_NAME, args as Record<string, unknown>, execution) as never,
  }));
}
