# Workbench 编译客户端合同消费迁移（2026-10-11）

主仓基线 `5390667cc990fa558b0445aa455b086d325a6c77`，分支 `codex/shinemage-abc-local-candidate`。本轮没有 commit、push、PR、合并、发布、部署或删除。机器记录见[validation JSON](shinemage-workbench-consumer-contracts-20261011-validation.json)；此前 factory/生命周期迁移见[前轮记录](shinemage-workbench-client-pack-migration-20261011.md)。

## 本轮迁移和保留

主仓现在消费正式包的工具卡 SSR、取消、保存、首购卡/首购保存、查询故障脱敏和资产弹层运行行为。七份新入口与前轮生命周期入口共八份，实际同一输入下运行 56 项，包含前轮 12 项，不相加为 68。全部直接读取已验正式包的公开 `./client`；不读取主仓插件源码/产物，也不触发插件构建。

原测试正文与行为断言保留。原 query fault 的两个源码/分类断言仍在生产者文件；asset overlay 的源码 Tab trap 断言及三条 pointer 结构断言也保留，后者从混合运行测试单独分出。四项源码测试本轮单独运行，明确需要私有源码，不纳入源码拒读结果。固定包 fault 测试撤去“本仓 lib 不存在就 skip”条件，缺包必须失败。旧 compiled consumer 路径只作兼容入口；默认 pipeline 及 kit 生产者副本不再重复运行这些入口，生产者的其余私有/Host 检查保持。

合成消费者数据已放入主仓 `test-support/workbench-client.fixture.json`，包括固定工具名、取消文案、fixture facts、UI props 与首购保存回执。数据取自 Workbench 固定提交 `92dfa171cf8ea298bdceee5634b418269e711a37`，五个原文件逐字节核对该 commit，来源摘要留在 JSON；不复制 decoder、模型变换、saveIdentity 算法或保存网关。editor 工厂只克隆记录的测试 props，不重写业务实现。首购期望 JSON 读取主仓既有 backend 合同夹具，并继续校验原 SHA。fake fetch/内存状态不是正式服务回执，`finite_mock` 和 synthetic 边界保持。

消费者仍用既有七包 page profile 和同一正式包，来源 SHA `92dfa171…`、manifest `9f518393…`、tarball `a0d5dd08c5e97237fc38033f929eec33627ac42efa594a5ca5c87a0ee311d6b2`。客户端输入帮助函数限定八个消费 scope，拒绝未知/逃逸路径；pipeline 在源码构建之前检查全部结果目录。不同测试文件各用自己的新子目录，共用密封输入，不覆盖历史结果。

## 实际验证

| 记录 | 范围 | 结果 |
|---|---|---|
| consumer-r2 | 八份正式包客户端入口，同一 page 输入/源码拒读/localhost 策略 | 56 PASS / 0 FAIL / 0 SKIP，exit 0 |
| contracts-r1 | 客户端 scope/profile/正式包/CI 输入/显式构建回归八文件 | 105 PASS / 0 FAIL / 0 SKIP，exit 0 |
| producer-source-guards-r1 | 保留的两份源码测试文件 | 4 PASS / 0 FAIL / 0 SKIP，exit 0；不属于源码拒读验收 |
| boundary-probe-r1 | 原 21 个源码根负对照，输入可读 | 21 个 EPERM、3 个 READ，exit 0 |
| existing-output-r1 | 八个实际已用消费目录 | 8 次预期 EEXIST，验证命令 exit 0，八份原回执摘要保持 |
| assertion-retention-r1 | 原测试正文、拆出的源码断言逐项比较 | 7 组保留核对通过，无业务实现复制 |

105 包含此前 97 的本次复跑和 8 项新增 scope 检查；56 包含前轮 12 的本次复跑；四项源码检查另记，不相加为总体通过。consumer-r1 同样 56/0/0，但原 cancel 测试缺 act 环境配置产生警告；日志保留。补齐并恢复 IS_REACT_ACT_ENVIRONMENT、关闭本次 JSDOM 后 consumer-r2 无此警告，未改产品代码或断言。工具卡/取消/保存、owner/会话绑定、重复与迟到请求、丢失 ACK、版本冲突、预览/保存/恢复和权限脱敏均为实际发布 bundle 的合成消费检查。

本机 macOS arm64，Node `24.19.0`、Python `3.14.4`；固定 DSH rc2 / `477b4f42`、React/ReactDOM `18.3.1`、store `0.1.7-rc.2`、JSDOM `29.1.1`。没有启动 DSH 完整宿主、业务 HTTP 服务、Chrome、模型或远端。策略拒读主仓十个业务目录、九个原作者仓和两处来源副本；历史证据、Kit/build-tools、固定上游和未列明路径仍可读，不是整机 deny-default。页面菜单链接与响应均为合成 props/fetch，不访问生产链接或真实数据。

## 证据与剩余边界

原始目录：`/Users/hutou/.codex/tasks/shinemage-workbench-consumer-contracts-20261011-quq9ncna/`。包含起始字节快照、旧测试正文、合成数据来源、两轮运行、输入/策略/负对照、防复用和正文保留证明。正式包、上游、candidate 与 journal 不变。

仍依赖主仓源码的 compiled producer 入口为 built Host、loader、skills-loader、query-skills-loader、sessionless-view、native-prompt-inject、native-board-auth 与 lane-g；其中私有视图文件没有发布在当前正式包中，不能临时加导出或复制私有实现凑通过。Workbench/CRM/知识源码构建、历史作者输入与隔离生产者夹具还在，默认完整 B0 尚未完全脱离源码，旧副本不得删除。

原 Workbench 正式包 Host 缺运行 peer 的问题仍开放。作者仓五个修复文件尚未提交，客户端消费不能抵扣新干净提交/正式包/候选的宿主、服务、目标、浏览器和回退验收。新 hosted CI 输入、live CLI reload、完整 B0、真实模型/CRM/WeKnora/UAT、独立发布和 DSH 升级仍开放。candidate `591134e8…` / journal seq 3 未改；SDK 分发 BLOCKED、产品 PARTIAL、release_ready=false、VERSION `0.20.0.0`。
