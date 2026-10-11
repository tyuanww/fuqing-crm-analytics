# Workbench 原生 prompt 公共客户端消费（2026-10-11）

基线 `5390667cc990fa558b0445aa455b086d325a6c77` / `codex/shinemage-abc-local-candidate`。本轮没有 commit、push、PR、合并、发布、部署或删除。机器记录见[validation JSON](shinemage-workbench-native-prompt-pack-20261011-validation.json)，此前八入口结果见[客户端合同记录](shinemage-workbench-consumer-contracts-20261011.md)。

## 迁移与实际结果

`native-prompt-inject.test.mjs` 的 10 项原测试已迁入主仓 `workbench-native-prompt.integration.mjs`，仅消费同一正式包的公开 `./client` 和固定 DSH 已编译的真实 Cordis `4.0.4`。原 test/boot 正文与断言逐字节保留；只改输入、client factory 加载和极小的合成 RPC envelope，不复制业务实现。旧路径保留兼容，默认 pipeline 与 clean kit 不重复执行它。

| 记录 | 范围 | 结果 |
|---|---|---|
| consumer-r2 | 新迁移原生 prompt 入口，源码拒读 | 10 PASS / 0 FAIL / 0 SKIP，exit 0 |
| consumer-r3 | 同一次运行九个正式包客户端入口 | 66 PASS / 0 FAIL / 0 SKIP，exit 0，含本轮 10 及此前 56 |
| guards-r1 | 客户端输入与九个 pipeline scope | 18 PASS / 0 FAIL / 0 SKIP，exit 0，包含此前 17 |
| boundary-probe-r1 | 列明业务来源负对照 | 21 EPERM、3 READ，exit 0 |
| existing-output-r1 | 本轮已用 prompt 目录 | 预期 EEXIST，验证 exit 0，两份原回执摘要不变 |

66 是九入口的实际一次运行结果，不是把 Agent 或历史 PASS 相加；10、66、18 分别记账。原测试覆盖未声明 remote 拒绝、嵌套 session/workspace 注入、拒绝请求不改保存状态、dispose/reload 不重复注册、会话采用和迟到回复不打开旧资源。真实 Cordis 承担注入和生命周期，remote/session/RPC/fetch 仍为合成服务。

首轮 consumer-r1 为 2 PASS / 8 FAIL：VM 新上下文改变了异常与对象原型，影响原有严格断言。保留日志后，factory 改为同一 JavaScript 上下文的限时 VM 执行，并在 finally 恢复本次 synthetic window；不做 JSON 归一化、不改断言。VM 不是安全沙箱，来源/网络限制由外层进程策略承担。另保留一次清单断言失败：新改的原干净 wrapper 不属于 80 份继承 dirty 文件；按实际三份继承产品变化和两份新增 delta 修正记账，不是产品测试失败。

## 输入、留存和未关闭

原始目录：/Users/hutou/.codex/tasks/shinemage-workbench-native-prompt-pack-20261011-0bsktmwm。Node `24.19.0`、Python `3.14.4`、DSH `0.1.7-rc.2` / `477b4f42`；来源 `92dfa171…`、manifest `9f518393…`、tarball `a0d5dd08…` 不变。两份准备回执标记 INPUTS_PREPARED，不预写验收 PASS。18 份原正式 manifest/归档、candidate 与 journal 摘要复核不变。

本轮没有完整宿主、真实 session/模型、业务服务、Chrome、目标宿主或远端 CI。策略仍只拒读主仓十个业务目录、九个作者仓和两处来源副本，历史证据、kit/build-tools、固定上游及未列明路径可读；不是整机 deny-default。旧八入口的 SSR/JSDOM/fake-fetch 与本轮 Context 检查都不抵扣完整宿主准入。

剩余 compiled producer 为 built Host、loader、skills-loader、query-skills-loader、sessionless-view、native-board-auth、lane-g 七入口。Workbench/CRM/知识源码构建、历史生产者输入/隔离守卫仍在，默认完整 B0 未完全脱离源码；不能删旧副本。原 Workbench 缺运行 peer 的包仍未修复，作者五文件尚未提交；新干净来源的正式 pack/candidate、服务/目标/browser/回退、live CLI reload、hosted CI、真实模型/CRM/WeKnora/UAT、独立发布和 DSH 升级继续开放。SDK 分发 BLOCKED、PARTIAL、release_ready=false、VERSION `0.20.0.0` 保持。
