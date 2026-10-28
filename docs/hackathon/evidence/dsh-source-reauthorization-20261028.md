# 原快照重新授权验收记录

记录日期为 2026-10-28。新实现允许同一账号在原 DSH 会话重登后，显式授权访问同一原快照。未经新授权的旧引用仍被拒绝。页面、快照和引用库均不迁移，隔离 19327 与公网未变更。

接口见[原快照重新授权](../../operating/native-crm-source-reauthorization.md)。三个草稿 PR 为 [Source #189](https://github.com/tyuanww/fuqing-crm-analytics/pull/189)、[CRM #6](https://github.com/tyuanww/dsh-crm-knowledge/pull/6) 和 [Workbench #14](https://github.com/tyuanww/dsh-analytics-workbench/pull/14)，均未合并。

## 已完成的验证

| 范围 | 实际结果 |
|---|---|
| 来源及 Host Python | 149 passed，含原 116 项和新增授权回归 |
| 页面来源适配 | 42 passed |
| Node Host 与 Python 来源 | 10 passed、11 deselected；覆盖 1、16、17、64 个引用及仓库原快照恢复 |
| CRM 作者全包 | 285 passed、0 skipped；固定 rc3 类型检查和构建通过 |
| Workbench 作者 core | 1394 passed、0 skipped；固定 rc3 类型检查和构建通过 |
| 工作台相关交互 | 112 passed，与 core 重叠，不累加 |
| 完整推送门禁 | 后端 4105 passed、81 skipped；前端构建及 236 项单测通过 |
| 现有组合 B0 | e20a0fea 与 5b884ba 的组合兼容检查通过，不代表新组合 B0 通过 |

实际 Chrome 验证使用 React 组件和合成接口。旧来源先拒绝读取，显式预览及确认后恢复事实展示。页面版本、HTML、绑定、AI 文案、样式和属性保持一致，无页面写操作或浏览器异常。真实 CRM 重登和真实模型未复验。

两作者的[CRM 固定输入 CI](https://github.com/tyuanww/dsh-crm-knowledge/actions/runs/40619543809)和[Workbench 固定输入 CI](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/40620402486)成功。两份包均从干净克隆离线重建，并通过严格回读及生成证明检查。新组合在本地严格接收通过，20 份载荷中只替换 CRM 和 Workbench 的四份，其余十六份逐字节相同。

## 复验入口

环境选择及固定输入要求见[验证入口](../../operating/verification.md)和[作者 Quickstart](../../operating/dsh-plugin-author-quickstart.md)。下表命令在对应仓库根目录执行。

| 仓库 | 命令 | 范围 |
|---|---|---|
| 主仓 | `python scripts/run_backend_tests_bounded.py` | 完整后端，报告目录由该命令自动生成 |
| 主仓前端 | `npm --prefix frontend-vue3 run build` 和 `npm --prefix frontend-vue3 run test:unit` | 构建及前端单测 |
| CRM 作者 | `node --test plugin/test/*.test.mjs` | CRM 全包 |
| Workbench 作者 | `node scripts/run-package-tests.mjs` | 作者 core，要求新的 `WORKBENCH_TEST_OUTPUT` 目录 |

## 审查结论

审核采用已授权的本机 Codex CLI 同模型独立复核，不属于跨模型审计。

设计审核发现确认可能先激活授权，再报告超时。预算检查现位于同步发布之前。工作台审核发现授权后可能拉取并发新版本，以及丢回执后无法重试。现改为仅刷新当前版本来源，并使用原预览重试。这些问题均有失败回归、修复后通过及独立复核记录。

CI 将合法 CRM HTTP 地址误判为跨仓导入的问题已修复。拒绝回归覆盖模板字符串和 URL 模块导入。首次缺少测试依赖或固定输入的失败记录保留，补齐既定环境后通过；未放宽检查。

## 尚未完成

主仓当前提交的远程 CI、组合锁及远程归档、新组合 B0、隔离 19327 真实重登验收仍开放。原运行包保留，产品为 PARTIAL，`release_ready=false`。

全部筛选与缓存复验、portable Linux 和正式发布不属于本轮范围，继续保留原开放状态。
