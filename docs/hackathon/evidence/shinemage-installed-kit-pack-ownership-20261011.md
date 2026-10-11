# installed-kit 默认源码夹具归属迁移（2026-10-11）

本轮只收口 installed-kit 默认入口，不新增产品能力。基线为主仓分支 `codex/shinemage-abc-local-candidate` 的 `5390667cc990fa558b0445aa455b086d325a6c77` 加既有未提交内容；没有提交、推送、PR、合并、发布或部署。产品 PARTIAL，SDK 分发 BLOCKED，`release_ready=false`，VERSION 保持 0.20.0.0。

## 当前结果

默认 `plugin-kit.test.mjs` 不再复制或重建 board-components 和九个业务插件。它继续实际打包当前 kit、在空 store 离线冻结安装、导入已安装的公共工具链，并严格编译自有合成领域消费者。新增 `installed-kit-packs.integration.mjs` 从固定正式包读取九份开发 kit 声明与三份领域锁。十源码原夹具逐字节保留为显式 legacy 入口，本轮没有运行。

源码拒读 r2 同次实际 **13 PASS / 0 FAIL / 0 SKIP，exit 0**；九份主仓业务源码及九个原作者仓的 18 项负对照均 EPERM。相邻三份本地合同入口另跑 **24 PASS / 0 FAIL / 0 SKIP，exit 0**，不属于源码拒读执行，也不与 13 项相加。r1 结果保留，但当前结论使用增加输出目录守卫后的 r2 字节。

## 四个产品路径

| 路径 | 变化 |
|---|---|
| `scripts/dsh-b0/plugin-kit.test.mjs` | 保留实际 kit 打包、公共工具链、SDK 只读及链接守卫；用自有合成消费者覆盖严格 TypeScript、固定领域绑定、实际编译执行、错误类型和错 kit 版本在产物覆盖前拒绝 |
| `scripts/dsh-b0/installed-kit-packs.integration.mjs` | 严格接收两包 CRM/Knowledge 与七包页面正式输入；核对开发 kit 声明、领域归档锁，记录当前包身份；不安装 peer、不构建业务源码、不启动宿主 |
| `scripts/dsh-b0/plugin-kit-source-fixture.legacy.mjs` | 头部标明历史用途，余下 24,102 字节与起始原文件逐字节相同；不进入默认 B0 自动测试清单 |
| `scripts/dsh-b0/pipeline.mjs` | 登记固定包入口、结果子目录复用拒绝和归属字段；保留其他尚未迁移的源码入口 |

本轮增量补丁 `product-delta-r1.patch` SHA-256 为 `2d3efc39d02955cdacee0b870d0aadb393fc19fff9b22a8e6c2b6163748ef1cb`，47,165 字节。该补丁只描述相对本轮起始现场的四路径增量，不包含继承修改或文档。

## 确定输入与归属

Node 24.19.0、Python 3.14.4、pnpm 11.28.2；DSH 0.1.7-rc.2，上游 `477b4f420553e8a52c2fbccc464d7561b239c443`。SDK 和 build-tools 是显式可读、不可写的已准备输入，本轮没有冷准备、升级、分发或全量 SDK 审计。

九个 manifest 都声明 kit 0.1.0 仅为开发依赖，运行依赖、optional 与 peer 均没有 kit。Workbench/funnel/waterfall 的发布归档锁共同指向领域包 `@shine-mage/board-components@0.1.0`，tarball 摘要为 `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182`。完整九包 source SHA、manifest/tarball 摘要和三份 lock 摘要在机器记录的 `formal_runtime_inputs`，不把同字节或开发声明当作宿主兼容通过。

本轮主仓消费者仍绑定 Workbench `d038f357` 的正式回执 `9d7f6bf3…` / tarball `e41df9f5…`。该作者 head 已推送及通过 CI 的记录见[前轮 Git 交付](./shinemage-workbench-core-git-delivery-20261011.md)，本轮没有再次推送或改作者仓。严格 TypeScript **仅属于 kit 自有夹具**，D/E 五仓的独立 tsc 仍为 NOT_IN_CURRENT_BUILD。合成函数输出不代表真实 CRM、WeKnora 或模型验收。

## 执行与拒绝

| 执行 | 原始结果 | 范围 |
|---|---|---|
| `run-current-r2.mjs` 经 source-denied sandbox | exit 0；内部两测试入口 13 PASS / 0 FAIL / 0 SKIP | 无网络；18 个列明源码/作者目录内容拒读；真实 kit 离线安装和自有合成编译 |
| `clean-build.test.mjs`、`package-inputs.test.mjs`、`package-manager-env.test.mjs` | exit 0；24 PASS / 0 FAIL / 0 SKIP | 相邻生产者合同，允许读取其本地夹具，不属于 source-denied 消费结果 |
| 相同输出重跑 | exit 1 / EEXIST | 首次回执摘要不变，不覆盖 |
| 缺 CRM、相对 page 输入 | 各 exit 1 / PROFILE_PACK_INPUTS_REQUIRED | 不产生输出，不回退源码 |
| 错 profile digest | exit 1 / PROFILE_PACK_PROFILE_DIGEST | 不产生输出，不回退源码 |
| symlink 输出根 | exit 1 / KIT_PACK_OUTPUT_REQUIRED | 不产生输出 |
| 实际 `pipeline --check` 复用已有 `installed-kit-packs` 子目录 | exit 1 / CRM_COMPOSITION_OUTPUT_EXISTS | 在源码/服务开始前拒绝，不报 pipeline 通过 |
| 静态边界 `--check` | exit 0；11 packages / 27 edges / 653 source files / 63 dynamic imports | 清单没有漂移，不代表物理旧目录可删 |

当前四文件语法检查和主仓 `git diff --check` 通过；主 Agent 本地审查四路径没有未解决项，**本轮没有外部 OCR 或其他外审**。命令、起止时间、各轮 stdout/stderr、拒绝输入、负对照和产物来源均按 SHA-256 绑定，见[机器验证记录](./shinemage-installed-kit-pack-ownership-20261011-validation.json)。

## 原始材料与仍开放的事项

原始目录：`/Users/hutou/.codex/tasks/shinemage-installed-kit-pack-ownership-20261011-_gagjzie/`。`kit-current-r2.*` 是当前运行，`runs-r2/installed-kit-packs/runtime-inputs.json` 是本轮完整声明/领域锁回执；`negative-inputs-r1.json`、`pipeline-scope-reject-r1.*` 保存拒绝，`adjacent-tests-r1.*` 保存相邻回归。起始快照、旧函数体、r1 与失败日志均保留。

主仓仍保留 board-components 生产者、历史四插件隔离、package-inputs 的生产者锁合同、历史 geometry-composition 的私有投影、缺输入构建守卫和三组业务断言。整个 pipeline 尚非业务源码完全不可读；本轮没有删除旧 `dsh-plugins/`。完整 preflight、新字节完整 B0、新 hosted CI、当前 candidate/journal、服务/目标/browser、真实模型/业务、正式安装分发和 DSH 升级分别保持未执行；SDK BLOCKED 不泛化为普通插件开发阻塞。

最新开发入口见[当前 kit 与固定包验证](../../operating/verification.md#当前-kit-与固定包验证2026-10-11)。[前轮正式包装配](./shinemage-formal-preflight-pack-assembly-20261011.md)和[前轮完整 B0](./shinemage-workbench-core-formal-main-ownership-20261011.md)保留原结果，不改写为本轮完整通过；T5/T15/T19/T21 未勾完。
