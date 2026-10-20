# 驾驶舱 rc1 并行任务卡

基线提交：`7212b6b5b047e4bb7decdd1d420cdc2c944723d2`。

本文件是驾驶舱修复任务的协调源。执行状态仍以根目录 `STATUS.md` 为准，本文件不替代验收记录。

## 工作树

| 工作树 | 分支 | 责任 |
| --- | --- | --- |
| `/Users/hutou/.codex/worktrees/cockpit-shell/fuqing-crm-analytics` | `codex/cockpit-shell-continuity` | 草稿连续性、会话绑定、主面板形态、主题注册 |
| `/Users/hutou/.codex/worktrees/cockpit-account/fuqing-crm-analytics` | `codex/cockpit-account-settings` | 本地身份语义、原生设置接缝 |
| `/Users/hutou/.codex/worktrees/cockpit-release/fuqing-crm-analytics` | `codex/cockpit-rc1-release` | rc1 构建、打包和发布证据 |

三个分支都从同一提交建立，不包含原工作树中 WeKnora 线程的未提交修改。

## 依赖启动

- 工作树不复制被忽略的 `.context/` 和 `node_modules/`。
- 驾驶舱任务在 `dsh-plugins/analytics-workbench` 内使用仓库锁文件执行冻结安装，不关闭 frozen lock。
- rc2 上游测试可以只读引用原工作树的 `.context/dsh-b0/upstream-0.1.7-rc.2`，不得把该目录复制到工作树。
- rc1 构建必须使用 release lane 的固定 rc1 输入，不得把 rc2 upstream 当成 rc1 证据。
- 不复制 `.context/dsh-b0/runtime-*`、DuckDB、SQLite、浏览器私有状态或凭据。

## 共同边界

- 不修改原工作树。
- 不启动、重启或占用 WeKnora 线程使用的服务和端口。
- 无单独授权不 commit、push、合并或部署。
- C1A、C1B 和 C2 不修改 `STATUS.md`、`CHANGELOG.md`、全局插件边界、组合包清单或 profile 装配。
- C3 可以在独立工作树准备改动，但全局生成文件和文档必须等 WeKnora 改动稳定后再收口。
- 新的验收实例必须使用独占 profile、独占端口和独占浏览器会话。

## C1A 草稿连续性与会话绑定

优先级：P0。

范围：

- 原生侧栏切走时，不能依赖 `beforeunload` 或宿主 veto。
- 草稿必须持续保存，重新进入驾驶舱时恢复内容和选中目标。
- 外部导航观察继续负责作废旧面板的异步写入。
- B0 synthetic session 只能在显式 B0 配置下自动选中。

主要文件：

- `dsh-plugins/analytics-workbench/src/client/index.tsx`
- `dsh-plugins/analytics-workbench/src/client/leave/`
- `dsh-plugins/analytics-workbench/src/client/cockpit-workspace.tsx`
- `dsh-plugins/analytics-workbench/src/initial-session.mjs`
- 对应测试

完成判据：

- rc1 中编辑草稿，点击原生侧栏其他面板，再次进入驾驶舱，草稿和选中目标恢复。
- 未被插件发起的导航不能让旧请求覆盖新面板状态。
- 普通用户当前会话不被自动切换；B0 配置只选中精确 synthetic session。

并行约束：

- C1A 独占 `index.tsx` 的当前写入窗口。
- C1A 可以与 C2 并行。
- C1A 与 C3 的代码工作可以并行，但全局清单和最终文档由 C3 串行处理。
- C1B 在 C1A 验证通过后使用同一工作树继续。

## C1B 主面板形态与主题契约

优先级：P0。

前置：

- C1A 已完成并通过验证。
- C3 已确认 rc1 与组合代码使用的 SHA 一致。

范围：

- 已选定全屏驾驶舱：原生侧栏 `main:cockpit` 是唯一生产入口。
- 删除未挂载的 split composition 路径；不把测试中的双视图当成已实现能力。
- 补全 rc1 主题 token 和关键状态验证。

主要文件：

- `dsh-plugins/analytics-workbench/src/client/index.tsx`
- `dsh-plugins/analytics-workbench/src/client/cockpit-main-panel.tsx`
- `dsh-plugins/analytics-workbench/src/client/competition-shell/`
- 对应测试

完成判据：

- 生产入口只保留一个驾驶舱形态，不出现双 Composer、双主面板或会话错绑。
- hover、focus、disabled、error、dark、light 的主题状态与宿主一致。
- 如果保留并存模式，原生会话、Composer 和驾驶舱各自只有一个所有权方。

## C2 账号与设置语义

优先级：P1。

范围：

- 取消 localStorage 显示名伪装成真实登录。
- 优先使用 DSH 原生账号身份和设置动作。
- 如果 rc1 没有稳定 API，明确标注本地演示身份，并把 DOM 选择器限制在兼容适配层。
- 删除重复、误导性的账户入口。

主要文件：

- `dsh-plugins/analytics-workbench/src/client/account-chrome.tsx`
- `dsh-plugins/analytics-workbench/src/client/account-identity.mjs`
- `dsh-plugins/analytics-workbench/test/account-identity.test.mjs`
- 新增的账户和设置 DOM 合约测试

完成判据：

- 界面不再声称 localStorage 身份是真实登录。
- 设置入口优先走官方动作。
- DOM fallback 在 rc1 结构与预期不同时给出可观察失败，不静默失效。
- C2 不需要修改 `index.tsx`。如果确实需要，先停止并报告范围变化。

并行约束：

- C2 可以与 C1A 并行。
- C2 不与 C1A 或 C1B 共用分支或工作树。

## C3 rc1 构建与发布契约

优先级：P0。

范围：

- 证明 rc1 插件包使用 `@deepseek-ai/dsh@0.2.1-rc.1` 和 upstream `1600d8a1e140dcde43a1a0941940a0480712c011`。
- 核对 peer、lock、pack manifest、runtime/profile 摘要和组合路径。
- 保留默认 rc2 兼容线，除非另有明确架构决定。
- C1B 删除 `cockpit-composition.mjs` 后，C3 契约改为验证 `main:cockpit` 唯一入口，并防止已删除的组合路径回归。

主要文件：

- `dsh-plugins/analytics-workbench/package.json`
- `dsh-plugins/analytics-workbench/pnpm-lock.yaml`
- `dsh-plugins/plugin-kit/toolchain.json`
- `docs/operating/dsh-rc1-release-lane.md`
- 与 rc1 release pack 相关的测试和证据

完成判据：

- rc1 artifact 的 peer 和构建输入都有机器可核对证据。
- 构建、测试和打包没有误用默认 rc2 输入。
- 未把“线上 rc1”误写成“仓库默认 pin 已切换”。
- 在 WeKnora 改动稳定前，不运行 `node scripts/dsh-b0/plugin-boundaries.mjs --write`。

并行约束：

- C3 不与 WeKnora 线程同时修改全局边界、组合清单、profile 装配、`STATUS.md` 或 `CHANGELOG.md`。
- C3 可以先做只读盘查和局部 patch，全局生成与证据收口必须串行。

## C4 合并后交叉验收

优先级：P0 发布门禁。

前置：

- C1A、C1B、C2、C3 均已合并。
- WeKnora 问数和插件改动已稳定并合并。

范围：

- 使用独占 profile 和端口重新构建。
- 在问数预设下进入驾驶舱，验证指标查询、知识检索、页面生成、看板编辑和返回原生对话。
- 验证原生侧栏切走后的草稿恢复、会话绑定和主题状态。
- 保存命令、版本、端口、profile 摘要、结果和未验收项。

完成判据：

- 在真实 rc1 实例中得到完整的驾驶舱与问数预设交叉矩阵。
- 没有伪造、猜测或将静态测试当作实机 UAT。
- 最终 `STATUS.md` 和 `CHANGELOG.md` 由单一合并流程更新。

## 合并顺序

1. 等待 WeKnora 线程稳定。
2. 合并或提交其问数改动。
3. 合并 C1A 和 C2。
4. 在最新基线上完成 C3 的全局生成和发布证据。
5. 在同一驾驶舱分支完成 C1B。
6. 跑 C4 交叉验收。
7. 最后由单一写手更新根状态和变更日志。
