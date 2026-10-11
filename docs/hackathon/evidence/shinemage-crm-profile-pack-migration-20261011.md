# CRM/知识 profile 消费独立正式包（2026-10-11，本地未提交）

主仓基线 `5390667cc990fa558b0445aa455b086d325a6c77`，分支 `codex/shinemage-abc-local-candidate`。本轮继续主仓装配入口迁移，只完成 CRM/知识配置准备的包输入；没有提交、远端变更、宿主/服务启动、模型调用、真实数据访问或删除。产品仍 PARTIAL，SDK 分发 BLOCKED，release_ready=false。

机器记录见[validation JSON](shinemage-crm-profile-pack-migration-20261011-validation.json)。原始输入、CLI 回执、源码负对照及测试日志在 `/Users/hutou/.codex/tasks/shinemage-crm-profile-pack-20261011-53qebpgs/`。

## 改动与输入

`scripts/crm-calibration/prepare-profile.mjs` 新增 `--pack-inputs /absolute/inputs.json`，复用既有 `dsh-profile-pack-inputs/v1` 读取和安全解包。正式包读取器额外返回从摘要已核对的归档解析出的 package manifest，以便在创建输出前检查领域、公开导出和精确 peer；它不执行插件代码，不接受 content pack 替代正式包。旧显式编译目录入口保留，不提供主仓发现回退。新测试已登记到 B0 pipeline。

本轮沿用现有 `config/dsh-profile.crm-knowledge.rc2.json` 原字节，SHA-256 `7ca3511663ab2ea5d1bb8f839c83b29f5bbd6655238450ad08a04510642191ba`。固定输入只复制下列既有正式 manifest/tarball 到独占证据目录，没有新建或改写业务 profile：

| 包 | 独立仓来源 SHA | tarball SHA-256 |
|---|---|---|
| CRM | `5a839fa86de2240cf661a9034c58e0ead2d4b4ef` | `0da9f8edd40b17a92377aa4b35d219229c8461b942060a7dd0e12265343500fd` |
| 知识 | `94ef29fa6c39d3dc506fbc5ef734f0a7ea9eb2b0` | `ed7888204d5cefe7d383632a75319d3427fec9a735863f4e123b8ea17387ef67` |

生成物仍是 `crm-profile-assets/v3`，新增 `package_inputs` 保存输入/profile 摘要、两包来源 SHA、manifest 与 tarball 摘要。运行入口指向本次 `assets/packages/` 下解出的公开 `lib/`，没有导入主仓或作者仓源码。CRM/知识的 Cordis 声明仍为 `4.0.2`；本轮没有核验固定环境 `4.0.4` 的运行兼容。带 `service_binding` 的组合明确拒绝本准备入口，仍须走正式 candidate/服务门禁。

## 实际验证

- 固定 Node `24.19.0`、Python `3.14.4`，原生 macOS Seatbelt 禁网并拒读主仓业务插件、原作者仓和既有源码来源；这是指定来源拒读，不是整机 deny-default。
- 实际 CLI 配置准备退出 0。主仓 CRM、主仓知识及 CRM 作者仓三个源码负对照均为 EPERM。缺输入、坏 manifest 摘要、混用未核对目录及既有输出分别被拒绝；既有输出回执摘要未变。八条准备/负对照记录在 `profile-proof-r1.json`，没有宿主或服务回执。
- `node --test --test-concurrency=1 scripts/crm-calibration/profile-packs.test.mjs dsh-plugins/crm-knowledge/test/profile.test.mjs scripts/release/profile-packs.test.mjs`：最终 `contracts-r3.log`，exit 0，38 PASS / 0 FAIL / 0 SKIP。
- `node --test --test-concurrency=1 scripts/release/plugin-pack.test.mjs scripts/release/plugin-candidate.test.mjs scripts/release/plugin-host-evidence.test.mjs`：`release-regression-r1.log`，exit 0，58 PASS / 0 FAIL / 0 SKIP。这些是结构和合成合同测试，不是新的正式 candidate/宿主验收；两组数字不相加为总体通过。

首次合同轮 35 PASS / 2 FAIL / 0 SKIP 保留在 `contracts-r1.log`：新测试夹具跨案例共享可变 exports，另有私有导出负例缺少对应声明文件，导致在包读取层提前拒绝。修正夹具后 `contracts-r2.log` 37 PASS；再补带 service binding 的绕过负测后，最终 r3 为 38 PASS。旧日志未删除或改写。

## 仍开放

现有 candidate `591134e8…` 和 journal seq 3 未追加或改写；本轮两包的配置准备不能继承旧 candidate、headed、WSL2 或宿主通过。Workbench 运行 peer 修复及主仓此前包输入修复仍未提交，本轮也没有生成新的正式 Workbench 包。

默认源码 B0 pipeline、原生 B0 runner、实际 CRM/知识组合测试入口与 live CLI reload 仍需收口。当前候选的同包服务/目标/浏览器/正式回退、真实模型/CRM/WeKnora/UAT、独立版本发布、旧副本 stop/go 清理和独立 DSH 升级仍开放。完整 B0、新字节远端 CI、发布和部署均 NOT_RUN；不把父任务勾完。
