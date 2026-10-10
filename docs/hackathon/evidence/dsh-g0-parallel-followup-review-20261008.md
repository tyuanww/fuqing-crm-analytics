# 前两组续推：独立交付与本轮审修（2026-10-08）

从干净 `codex/plugin-boundary-review@68845ad0dfce2737d5e7b017916f16d4c8ec5255` 继续用户已确认队列。**独立作者入口与指标/知识固定包的 WSL synthetic 安装子项完成；官方依赖修复仍为 BLOCKED_UPSTREAM_RELEASE。** 产品 PARTIAL、SDK 分发 BLOCKED、`release_ready=false`。本轮按既有授权并行实施，主 Agent 顺序审查、集成文档与本地提交；没有新增规划或改变“官方 DSH + 独立领域插件/服务”的目标。

## 本轮实现

- [作者入口](../../../dsh-plugins/analytics-workbench/author-inputs.mjs)只接受明确审核的 kit tar/SHA 与领域原 tar；在源码外新 owned 父目录生成开发锁并实际 frozen 离线安装。开发 overrides 不改发布 manifest/原领域锁，普通 build/test 不重新生成锁、不重建官方 SDK。
- [kit 领域输入绑定](../../../dsh-plugins/plugin-kit/packaged-dependencies.mjs)先验证原 archive/lock，再确认真实 pnpm 安装布局、manifest、完整lib成员和每字节，才复用既有安装；漂移、额外文件、foreign binding、链接/特殊文件保持拒绝，不覆盖安装。
- HTML 三份 synthetic 合同夹具在插件测试包内固定白名单/SHA，[fixture loader](../../../dsh-plugins/analytics-workbench/src/free-page/fixture-loader.mjs)不查找相邻主仓。回归另与追踪的owner来源逐字节检查；本地固定副本不冒充owner当前生成结果。正式运行tar不含夹具、kit、作者入口或开发lock。
- [AST 边界检查](../../../scripts/dsh-b0/plugin-boundaries.mjs)只识别build/test中的字面public-kit `import(pathToFileURL(require.resolve(...)))`，继续检查精确dev依赖及公开exports；未知resolver/表达式/runtime kit导入仍拒绝。原生成清单已用真实 `--write` 更新，`--check`通过；没有增加runtime耦合或豁免。
- [指标/知识目标验证器](../../../scripts/crm-calibration/crm-services-target.py)显式读取已审核input manifest、SHA、新owned输出和install/http阶段，复用现有安全解包/离线wheel安装/check。正常边界测试只创建自有临时夹具与进程，不连接生产；现场namespace与SSH控制器只留本轮ignored证据，不是自动部署入口或journal准入器。

具体实现与运行记录见[作者验证](dsh-g0-plugin-author-inputs-20261008.md)、[指标/知识WSL](dsh-g0-crm-services-target-20261008.md)、[官方候选盘查](dsh-g0-sdk-upgrade-candidate-20261008.md)。

## 实际发现、修复与复核

1. **作者目的目录祖先symlink写回源码（P2）**：初轮独立native复核用逐字节原脚本副本复现，实际在source/src内写kit输入；在第一条包管理器调用前截断，真实仓库未写入。修复为规范化source和目标现有父目录真实路径，再重建basename并判断范围；保留exclusive mkdir。真实回归 **1 FAIL → 1 PASS**，源码无新增文件，合法outside alias、macOS `/var`路径与既有目标拒绝保留。第二次受影响复核的5个安全探针确认关闭，新增confirmed finding为0。
2. **WSL SIGTERM不执行atexit，缺少导入凭据**：首次实际服务冷安装及前13项HTTP通过，但最终缺凭据，整体FAIL保留。真实SIGTERM回归复现后，验证器在app导入前同步记录guard、每次禁止attempt即时落盘，正常退出才标final_snapshot。复用同一两包/wheel，只更新验证器并重新冷安装，15/15通过。四个服务的凭据均明确 `guard-installed / final_snapshot=false`，不冒充完整退出快照或任意代码沙箱。
3. **新增runner三处Ruff E702**：主Agent实际lint发现，集成时只拆行；保留远端执行 `865025…` 原字节。当前 `26c13aba…` 与执行快照AST完全相同，guard字符串相同，12项bounded测试与Ruff通过；独立reviewer重复核对等价。未仅因格式变化重复远端执行或伪造新SHA的WSL通过。
4. **作者合法动态public-kit导入被旧静态规则阻断**：真实入口报BOUNDARY_DYNAMIC_RUNTIME_IMPORT，最小回归先FAIL；增补上述精确AST形式后PASS。对range/private/unknown resolver/runtime的负测仍拒绝，不用全面允许动态import替代正确边界。

本轮使用gstack `/review` 检查点；两次独立native复核均为同宿主模型。初轮7个实现完整读、7个测试summary、5份夹具摘要以及生成清单/Quickstart共21项；修后复核限定于路径修复/新增回归/格式等价。测试全文及实际运行、危险现场控制器和输入审核由主Agent另行承担。初轮报告、原失败和第二轮探针保留于 `.context/checks/parallel-followup-20261008/`；没有调用外部付费模型，没有把局部通过写成整个长期branch/PR或跨模型review放行。

## 当前真实验证

命令均使用固定Node24、pnpm11.28.2及明确SDK/工具/Corepack输入；未跳过toolchain版本或frozen检查。不同套件有重叠，不累加为独立测试总数。

| 入口/范围 | 本次结果与证据 |
|---|---|
| 新owned作者工程：实际离线prepare、两次frozen安装 | PASS，最终源570文件与工作树逐字节相同 |
| `corepack pnpm build` | PASS；完整host/client typecheck |
| `corepack pnpm test` | 35基础 + 111 HTML PASS；0 FAIL/SKIP |
| `corepack pnpm test:built` | 2 PASS；0 FAIL/SKIP |
| 4份合同/source-index测试 | 25 PASS；0 FAIL/SKIP |
| `corepack pnpm pack` | 8正式成员，tar SHA `445565c63280e6ee7e97fbd101cf1db0b27e205654a5afbce5c89c3110eea936`；没有dev kit/夹具/lock |
| `node --test scripts/dsh-b0/package-inputs.test.mjs` | 12 PASS；实际frozen pnpm安装、漂移/源内alias/成员和owner字节负测 |
| `node --test --test-concurrency=1 scripts/dsh-b0/plugin-kit.test.mjs`，显式候选参数防止缺SDK跳过 | 10/10消费者、20 PASS / 0 FAIL / 0 SKIP；53.963秒 |
| `node --test scripts/dsh-b0/plugin-boundaries.test.mjs` | 12 PASS / 0 FAIL / 0 SKIP |
| `node scripts/dsh-b0/plugin-boundaries.mjs --check` | PASS；11packages/30edges/648source files；74个未解析动态项仍限测试范围 |
| 作者5项已有负测 | 错SHA、已有输出、outdated lock、SDK漂移、fixture漂移均预期拒绝，恢复后输入/lock保持 |
| 共享bounded入口：`backend/tests/test_crm_services_target.py` | 12 PASS / 0 FAIL / 0 SKIP；最终格式化源码的group日志与XML保留 |
| `python -m ruff check scripts/crm-calibration/crm-services-target.py backend/tests/test_crm_services_target.py` | PASS；原3 FAIL及格式等价另记 |
| WSL2精确metrics/knowledge两包 | 2/2离线冷安装3.269秒、15/15 HTTP/保护4.620秒；4owned进程reaped，unit inactive/MainPID0 |
| 主Agent交付复核 | 上游221证据、服务失败62+恢复73=135文件逐项核验；570作者源码、同kit/domain/lock/runtime tar核对通过 |

原领域tar SHA仍 `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182`；开发锁仍 `b9b62b11c90d787a52107e1c2cc07c6abce88dfaf76ce8ae44c5fcd84d8c405c`；固定SDK closure `37ce5d661418c0fb2468592bd3bb54f9376f8f0b728dfacb972d9b68cddc14b4`。未重打原领域输入，不因跨平台压缩差异更改锁。

主Agentignored证据为 `.context/checks/parallel-followup-20261008/`：`baseline.json`、`upstream-handoff-check.json`、`service-handoff-check.json`、`author-handoff-check.json`、`kit-consumers.{command,result}.json`/日志、`boundaries-tests.log`、`runner-format-equivalence.json`、`bounded-target-format/summary.json`、两次native报告/探针。作者最终复验另位于 `plugin-author-inputs-20261008/destination-realpath/`，旧失败与旧通过未覆盖。

## 仍开放的门禁与下一步

- 当前固定上游7个受影响版本/29条公告没有官方修复release；本轮最新alpha和master也保留，**BLOCKED_UPSTREAM_RELEASE**。先等实际可用完整SHA/原锁，再隔离准备与动态兼容，不能修改上游或pin伪造通过。26bindings/29import/12slot静态矩阵不代替编译/生命周期/浏览器。
- 发布者/构建者身份、完整组成/撤销、最终SDK签名、不透明内容执行安全和整台干净机器仍开放。npm registry验签与源码相同不等于作者签名或从该commit构建，固定SDK继续BLOCKED。
- 已关闭的fixed synthetic服务冷安装和作者入口不再列NOT_RUN。其他未覆盖宿主/UI/真实身份/生产形状、headed/移动端/无障碍、真实模型与业务UAT、生产receive/reconcile/canary/回退仍按已有队列；本轮新metrics/knowledge observer不自动接入首购专用journal verifier。
- 物理多仓与独立CI在既有stop/go后推进。SDK维护、业务插件、领域服务及数据保持独立版本；插件更新不会因此触发整套DSH或数据库升级。

本轮未运行完整B0/release或远端CI，未push/tag/Release、激活候选、修改route/生产服务、读真实库或删除旧资产。杭州current只做元数据前后核对，仍为 `dsh-0.20.0.0-r3`；本次所有运行均为自有隔离synthetic。VERSION和固定rc2上游未改。已完成/开放子项同步至STATUS、TODOS、计划与验证入口，本地提交结果以Git实际HEAD为准。
