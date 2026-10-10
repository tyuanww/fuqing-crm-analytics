# A/B/C 隔离集成验收（2026-10-08）

本轮完成补丁集成、缺口验证和本地回归，项目仍为 PARTIAL，release_ready=false。机器可读结果与原始证据 SHA 见 [验收摘要](shinemage-abc-integration-validation-20261008.json)。

## 工作树与改动范围

集成树为 `/Users/hutou/.codex/worktrees/shinemage-abc-integration/fuqing-crm-analytics`，基线 `cb6f723c66df4a66117ef5edbf9aacd4a94d2065`。验收时为 detached HEAD、未提交快照，JSON 中的 Git 状态保留该时间点；后续文档同步与本地提交以本文件的 Git 历史为准。A/B/C 共 19 个文件无路径冲突，先以独立临时 Git index 检查，再应用到新树。原 A/B/C 文件摘要不变；`plugin-boundary-review` 的 14 份未提交文档及状态不变。

集成后另修复两处共用入口：

- `scripts/dsh-b0/pipeline.mjs` 注册更新/取消测试、UI 参数测试及两个执行器语法检查；取消测试收到明确的 Python 路径。真实宿主和 headed 浏览器演练仍为显式运行。
- `--check` 向全部子进程设置 `COREPACK_ENABLE_NETWORK=0`。首次实际运行发现板组件的 pnpm 版本探针会触发下载，与离线检查合同不符；已验证修复后在缓存缺失时直接拒绝联网，原始退出与日志摘要见验收 JSON。
- `docs/architecture/shinemage-plugin-boundaries.json` 由现有生成器刷新，只有三行变化：已有 HTML 测试命令、对应包文件摘要及源码数量；未改变边界策略。

## 本轮实际验证

固定 Node 24.19.0、Python 3.14.4、DSH 0.1.7-rc.2 / `477b4f420553e8a52c2fbccc464d7561b239c443`。

| 验证 | 实际结果 | 限定 |
|---|---|---|
| A 固定宿主故障/重启/原生回退/恢复 | 10/10 PASS，退出 0 | 在 A 树实跑；集成树对应脚本摘要一致 |
| 集成专项测试首轮 | 78 PASS / 1 FAIL / 8 SKIP | 失败为生成清单漂移，日志保留 |
| 刷新清单后专项测试 | 79 PASS / 0 FAIL / 8 SKIP | 不算全量流水线通过 |
| 明确上游路径补跑宿主专项 | 25 PASS / 0 FAIL / 3 SKIP | 补齐上表中 5 项 skip；两次合并按唯一用例为 84 PASS / 3 SKIP |
| 边界生成检查 | PASS：11 packages / 30 edges / 652 sources / 74 dynamic imports | 现有规则未放宽 |
| 板组件固定 pnpm 离线构建 | PASS | 使用本机已有 pnpm 11.28.2；没有替换全量流水线 |
| 全量 B0 `pipeline.mjs --check` | BLOCKED | Corepack 缺少 pnpm 11.28.2 缓存；首次下载证书失败，修复后禁止下载 |
| `git diff --check`、pipeline 语法 | PASS | 不代表远端 CI |

专项入口：`node --test --test-concurrency=1`，参数为 `plugin-update-trial.test.mjs`、`plugin-update-trial-cancel.test.mjs`、`pinned-host-acceptance.test.mjs`、`html-host-browser-cleanup.test.mjs`、`html-host-browser-ui-args.test.mjs`、`html-selection-bridge.test.mjs`、`plugin-boundaries.test.mjs`。文件路径见摘要关联的日志；宿主补跑设置 `B0_BUILD_UPSTREAM` 后只执行 `pinned-host-acceptance.test.mjs`。

三项剩余 skip 要求独立 service pair / Python / wheelhouse 输入；没有把缺少输入的场景标为通过。本地日志在集成树 `.context/checks/abc-integration-20261008/`。

十场更新的现有执行入口如下，路径均替换为已审核的绝对路径；旧 CRM、知识包、两份服务包及 SDK receipt 必须匹配执行器固定输入。它是首期固定夹具演练，不是任意插件的生产更新器。两份服务包只核对摘要，不启动；命令会启动自有合成服务和 DSH，取消后不再派发下一场。

```sh
node scripts/dsh-b0/plugin-update-trial.mjs \
  --upstream /absolute/pinned-built-rc2 --output /absolute/new-trial \
  --python /absolute/python3.14 --pnpm /absolute/pnpm-11.28.2 \
  --old-crm /absolute/fixed-old-crm.tgz --knowledge /absolute/fixed-knowledge.tgz \
  --metrics-service /absolute/fixed-metrics.tar.zst --knowledge-service /absolute/fixed-knowledge-service.tar.zst \
  --sdk-receipt /absolute/received-sdk/receipt.json
```

## 加载后失败的证据边界

本轮调用既有 `pinned-host-acceptance.mjs --upstream <固定上游> --output <新目录> --packages-from <既有固定包>`。宿主已运行后，注入阻塞 `apply()` 的插件，父进程观察 IPC 超时并终止自有宿主，再启动原生配置，最后恢复旧组合和既有会话。

通过的恢复合同是 `HOST_RESTART_REQUIRED`，不是任意插件在同一进程内的安全隔离；profile 回退也不是业务数据回滚。证据中 5 个宿主 PID 均退出，受保护端口的监听者前后相同。

原始证据在 A 树 `.context/checks/abc-closeout-20261008-r1/runtime-failure-r2/`。首次未传入固定包、因未构建 `lib/index.js` 而失败的 `runtime-failure/` 和日志仍保留。复用包的输入文件标记 `PACKAGE_TRANSPORT_ONLY_NO_HOST_OBSERVATIONS` / NOT_RUN，不能作为宿主通过证据。

## 复用证据与剩余项

- A 当前十次更新演练及真实 SIGINT/SIGTERM 已在先前本轮检查中完成，见 [A 当前验证](grok-plugin-update-current-validation-20261008.json)。本页新增宿主阻塞恢复证据不改写原第 8 场准备失败的含义。
- B 复用修正探针后的 25/25 headed 结果，见 [B 交接](grok-html-ui-integration-20261008.md)。集成源码及探针摘要一致，没有因换工作树虚报新一次 headed。真实设备、读屏、原生浏览器缩放、真实模型与生产仍 NOT_RUN。
- C 见 [SDK 交接](grok-sdk-trust-integration-20261008.md)：分发 BLOCKED、嵌入组成 PARTIAL、内联函数体 NOT_VERIFIED，7 个受影响版本 / 29 条公告未重查。本轮没有 SDK prepare 或供应链结论升级。
- 外部 OCR 仍 PARTIAL：B 的六份外部审查因超时/预算未完成；本地人工检查与测试不能改写为 OCR 全部通过。
- 共用回归入口已接线，正式 CI 与 release journal 未运行。全量检查需要先按既有固定工具链准备 Corepack 缓存和构建依赖；不以单包成功替代。
- 原始 tarball、截图及运行日志仍分散在忽略目录/临时目录，长期归档未完成。本页和 JSON 为小型证据索引，不等于原始产物备份。

后续顺序：本轮文档同步后按授权本地提交；准备固定构建环境并完成全量验证；归档候选及证据，再接正式 CI/journal。SDK 分发、业务服务保存准入及正式发布门禁分别关闭，不能由 A/B 的局部通过替代。物理分仓仍按既有 stop/go，不新增平台任务。当前授权不含 push、PR、合并、发布或部署；原主成果树保持不变。

本轮文档审计只覆盖 `cb6f723c` 后的 A/B/C 集成及其入口，不重新认定相对 `origin/main` 的历史 571 文件已经发布。README 增加本页导航并对齐 STATUS 的带日期 r3 记录；架构文档纠正 kit 仍依赖相邻源码的旧描述；作者 Quickstart 解释离线检查失败；AGENTS 去掉过期 RC1 现役断言，保留 STATUS 事实归属。VERSION 保持 `0.20.0.0`，CHANGELOG 历史条目不改写。

| 现有计划项 | 本轮可关闭的部分 | 仍开放的部分 |
|---|---|---|
| T18 单插件更新 | 十场严格状态与整次取消证据 | 正式 candidate/journal 关联及完整首期预算/stop-go；不勾掉整个 T18 |
| T17 固定宿主 | 本机进程级故障恢复 | 任意插件同进程隔离不支持；目标组合/生产门禁仍独立 |
| T14/T15 HTML 作者和体验 | 当前包 headed 25 场、四档视口与键盘/状态修复 | 真实模型/读屏/设备/目标包现场与剩余准入 |
| T5/T15/T19 SDK 信任 | C 的来源/组成证据索引 | 内联组成、公告、完整身份/撤销/签名及干净主机 |

覆盖映射：单插件演练与 UI 探针已有交接页的命令参考、执行步骤和证据边界；缺独立新手教程，属于文档债，不新增功能任务。`pipeline --check` 的离线行为已有作者入口说明和失败证据。此次无模块重命名或数据流改变，边界图不需重画。STATUS/TODOS/大型计划的历史条目未批量改写；其主成果树文档另有未提交成果，后续合入时应按本页逐项对齐，不能覆盖或将所有顶层任务标为完成。

初衷核对：DSH 源码与版本升级保持独立，CRM/知识领域服务与插件分别拥有合同和包；日常插件更新复用固定 SDK，不要求重新准备 DSH、迁移数据库或运行 SDK 全量审计。尚未兑现的是物理多仓与各仓独立发布/安装的最终体验。当前卡点分别是本地构建准备、候选证据归档/接线、SDK 分发信任及后续业务准入，不应再混成每个插件都要重跑的一条巨型流程。
