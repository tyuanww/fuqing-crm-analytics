# Cordis 修订包的官方 npm 宿主验证（2026-10-11）

两份精确 Cordis `4.0.4` 的隔离修订普通包，已在先前严格 `npm ci` 的安装目录中用官方 npm DSH CLI 完成开启、原生关闭、恢复三个进程阶段。这里补的是[校准提案](shinemage-cordis-exact-proposal-20261011.md)的宿主初始化与进程恢复证据；原作者仓、正式包和 candidate 不变。机器记录见[validation JSON](shinemage-corrected-npm-host-20261011-validation.json)。

## 输入与执行方式

- 官方 `@deepseek-ai/dsh@0.1.7-rc.2` 来自本轮普通 npm 安装目录；实际 Cordis 精确 `4.0.4`，两包 manifest 同样精确声明 `4.0.4`。没有从源码重建或修改 DSH。
- CRM 普通包 `c275ed7515338c9cfec676f9c818603203f0080c79eb78a3f523cddce5b3d521`，236798 字节；Knowledge 普通包 `46cfc722ec8732b2edd473ab69bb73fa83a36665ffb57e57d9439d955e233d7f`，16144 字节。安装目录五份运行 JS、manifest 与先前安装输入一致；锁文件 `e7b5d62b7ef76a19195b619024e5c9a13f9e63da3cd18bef0ca2f7ac50477e56` 前后不变。
- 使用隔离提案中的既有 profile renderer，只生成 diagnostic assets，通过官方 `--profile web --patch` 加载两包的公开编译入口；没有执行新的 `dsh plugin add`，也没有新建正式 service-bound profile。普通 npm 安装回执属于前一轮，不重复算成本轮安装。
- 新的 `DSH_HOME`、workspace 与 `127.0.0.1:4328` 由本次独占。子进程只传显式安全环境，telemetry 关闭，不传继承的模型/服务凭据，不改变 `HOME`。本轮没有安装依赖或联网下载。
- Host 子进程的 Seatbelt 仅允许 localhost 网络，拒绝列明主仓、九个原作者仓及个人状态内容，允许本轮普通 npm 安装目录；不是整机 deny-default。负对照实际读取两份已有源码及本次合成状态文件，三项均 EPERM；不把不存在的真实凭据路径算成 EPERM。

## 本轮 r4 实际结果

| 阶段 | 实际断言 | 结果 |
|---|---|---|
| 准备 | 安装输入同字节、三项拒读负对照、官方 config dump 含 CRM Host 与 preset | PASS |
| 开启 | 官方 npm Host ready；原生认证根页面 200；未认证 CRM 路由 401；创建非运行中的合成 CRM/Knowledge preset 会话；已认证 CRM 状态 200、connected=false、username/expires_at=null | PASS |
| 原生关闭 | 无两份业务 patch 的官方壳可启动、认证根页面 200；合成会话保留；CRM Host 路由 POST 返回 404 | PASS |
| 恢复 | 同一组修订包重新加载；原合成会话保留且未运行；新会话仍可选择 CRM/Knowledge preset；CRM Host 路由恢复为 200、connected=false | PASS |
| 清理 | 三个本次 Host 正常 exit 0；每阶段复查端口可 bind，最终进程不再存在；输入锁及受保护资料不变 | PASS |

r4 命令 exit 0，耗时 2.412 秒，同次 16 个断言；不是全平台测试数。之前 r3 的三阶段也 exit 0，但未检查关闭/恢复后的路由，不能与 r4 相加。这里的关闭与恢复依赖受控进程重启，不是 live reload、热卸载或任意插件失败隔离。

服务没有配置：生成配置明确保留 `SERVICE_NOT_CONFIGURED`；实际 CRM route 返回未连接状态。这里只验证清晰的未连接表达，未调用业务 API、知识检索或模型，也未执行浏览器 UI。Preset 声明/会话初始化不证明所有工具在真实服务下可用。

## 失败与审查

首轮 r1 停在测试 helper 的相对依赖缺失，尚未启动 Host；记录在 `wrapper-failure-r1.json`。r2 的负对照错误要求一个不存在的个人凭据路径返回 EPERM，实际 ENOENT 导致退出 1；没有读取到凭据，也未启动 Host。两轮原脚本和失败日志保留。r3 改用本次合成状态负对照后通过；r4 用新的独占 home/workspace 补两项路由断言，r3 证据保留。

沿用 `open-code-review-delegate`：OCR CLI 只做 deterministic preview/rules，主 Agent 审查实际 harness 与输入 JSON，2/2 可审文件、0 跳过，另人工审查 sandbox policy。未发现本增量 Critical/High；没有外部 LLM 或子 Agent 审查。原主仓 106 个任务修改和 Workbench 八文件在运行后逐字节未变，另八个作者仓干净，46 个受保护正式输入一致。文档同步另外记账，不把它写成源码修复。

## 未关闭与下一步

本结果仅归属于隔离修订普通包，不是 `dsh-plugin-pack/v1`、`dsh-plugin-candidate/v1` 或正式 journal 准入。原作者仓/旧正式包仍声明精确 `4.0.2`，其严格安装冲突仍未关闭；合同校准与提交授权仍待回复。

按原顺序，获得相应授权后先交付 Workbench 运行 peer 修复和 CRM/Knowledge 精确校准，再从干净固定新提交生成正式包、更新输入锁及主仓守卫，验证新 CI 和同包 candidate/service/目标/browser/恢复。真实模型、CRM、WeKnora/UAT、WSL、独立正式分发及 DSH 升级仍开放。不重跑未变化的完整 B0或 SDK 全量查询，不改写旧回执。

原始材料：`/Users/hutou/.codex/tasks/shinemage-corrected-npm-host-20261011-u4z_rd2f`。本轮无 commit、push、PR、merge、发布、部署、远端配置或删除。SDK 分发 BLOCKED，产品 PARTIAL，release_ready=false，VERSION 0.20.0.0。
