# 问数智能体预设

`@shine-mage/dsh-query-agent` 是一个配置型 DSH bundle，只声明一个 `crm-query` Agent 预设，不复制业务插件实现。

这是“问数智能体”的唯一维护源。`scripts/crm-calibration/prepare-profile.mjs` 只声明兼容入口 `crm-knowledge`，避免同一 profile 重复注册 `crm-query`。

## 组合边界

| 提供方 | 职责 |
|---|---|
| `@shine-mage/dsh-crm-knowledge` | CRM 登录、指标查询、快照与分析 |
| `@shine-mage/dsh-analytics-workbench-b0/page-tools` | 可选 HTML 页面交付 |
| `file:///srv/shinemage/dsh/current/inputs/page/brand-weknora/weknora.mjs` | 只读 WeKnora 检索与文档读取 |
| `@shine-mage/dsh-query-agent/tool-policy` | Host 层同时跟踪 Agent 创建、空白会话预设切换和释放，只为 `crm-query` scope 隐藏持久终端和 shell 工具 |

CRM、知识、页面和 WeKnora 是不同权限与生命周期域，保持独立包。`@shine-mage/dsh-knowledge` 在未配置可验证的 `knowledgeOrigin` 时不进入 `crm-query`，避免向模型暴露必然失败的解释工具；公开口径改由 WeKnora 检索。后续配置并验收知识服务后，应由新的显式 preset 版本重新加入。

私有教材图谱工具不在本预设中。需要它时应创建新的显式 preset，不要因为安装了知识包就自动扩大问数 Agent 的权限。

## DSH 契约

- bundle 通过 `package.json` 的 `dsh.bundle.patch` 提供 `cordis.patch.yml`。
- Agent 通过官方 `@deepseek-ai/dsh-agent-preset` 声明，不依赖旧 `.agent-presets` 目录。
- profile 默认模型固定为 `deepseek-account / deepseek-flash / off`，避免新会话重新启用当前不可用的 thinking 路由。
- CRM Host 配置固定为 loopback `http://127.0.0.1:18093`，数据类型为 `real`。
- 工具策略位于 Host 配置，因为 Agent 创建监听器和预设注册表属于进程级服务。它在 `agent/created` 和 `agent-preset/selected` 时确认当前 Agent 使用 `crm-query`，然后对该 Agent scope 调用 `ctx.tools.restrict()`；切回其他预设或 Agent 销毁时释放限制，其他预设不受影响。
- 包只导出作用域工具策略、locale 与 icon 资源，不包含业务查询实现。

先安装 CRM 领域插件和已有的 workbench bundle，再安装本 bundle。Knowledge 包可以独立安装，但未配置服务时不属于 `crm-query`。配置顺序由 profile bundle 层保证；同名 `crm-knowledge-login-host` 只覆盖配置，不重复注册插件。

## 本地检查

```sh
node --test dsh-plugins/query-agent/test/package.test.mjs
npm pack --dry-run --json
```
