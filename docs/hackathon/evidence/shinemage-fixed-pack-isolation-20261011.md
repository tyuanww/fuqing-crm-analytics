# 默认四插件隔离改为固定包接收（2026-10-11）

当前主仓 `codex/shinemage-abc-local-candidate`，HEAD `5390667cc990fa558b0445aa455b086d325a6c77` 加起始 140 个未提交任务路径。本轮只迁移历史四插件源码隔离，不新增产品能力，不修改作者仓、插件正式包或 candidate/journal。没有 commit、push、PR、merge、发布或部署；产品 PARTIAL、SDK 分发 BLOCKED、release_ready=false，VERSION 0.20.0.0。

## 结果及对应范围

`plugin-isolation.test.mjs` 当前分别接收 shine-brand、shine-query、CRM 和 Knowledge 的固定正式归档，不再复制旧源码、运行 build、临时造 Git 来源或重复作者私有测试。每个实际 tarball 在自有独立目录安全解包，核对 package manifest、完整成员、每个运行文件摘要；不放入兄弟源码、node_modules、kit 或测试。原 5,330 字节源码构建夹具完整保留为显式 `plugin-source-isolation.legacy.mjs`，本轮未运行。

最新归档接收 r2 **4 PASS / 0 FAIL / 0 SKIP，exit 0**。九份主仓业务源码、九个原作者仓、上游和 build-tools 的 20 个拒读负对照全为 EPERM，网络完全禁止。这证明当前四包不靠这些源码/构建输入完成接收；**不证明入口执行、SDK peer 兼容、私有作者测试、宿主或正式准入**。

既有公共行为消费者保留并另行实跑：leaf、CRM package、Knowledge package 三入口同次 **29 PASS / 0 FAIL / 0 SKIP，exit 0**。这组拒读九份业务源码和九个作者仓（18 项 EPERM），固定 SDK 可读，网络只放行 localhost。实际覆盖原生 Cordis 上的公开定义挂载/释放、品牌/叶子合成客户端、CRM 不可用原因及可见性、知识身份拒绝与卸载取消；HTTP/DOM/Agent 测试依赖是合成夹具，不是完整 DSH、浏览器、真实 CRM 或 WeKnora。

原作者构建和私有测试继续按各仓固定提交与 CI 记录；主仓归档接收的四项不能取代那些证据，也不能与 29 项或之前的 13 项相加。

## 产品增量与输入

| 文件 | 变化 |
|---|---|
| `scripts/dsh-b0/plugin-isolation.test.mjs` | 固定包输入先核验，四个 ID 各唯一；实际独立安全解包、运行文件/manifest 核对，完成后写明确范围的回执 |
| `scripts/dsh-b0/plugin-source-isolation.legacy.mjs` | 历史源码构建/测试/pack 原体逐字节保留，加用途和原 SHA 声明；不进入默认流程 |
| `scripts/dsh-b0/pipeline.mjs` | 新 `package-isolation` scope 启动前拒绝复用；执行固定包隔离，记录 legacy NOT_RUN，剩余生产者仍保留 |

三路径相对本轮起点的 `product-delta-r1.patch`：20,205 字节，SHA-256 `e9fc252096cb35f871f13ae59c5ef064fe536b7c77f159c4440d294388f72308`。历史原体 SHA-256 `379094d98be81d6170c249b81c16c17af7845e6c1c73c25ed31f7fa0ad4d7273`。

固定 Node 24.19.0、Python 3.14.4、DSH 0.1.7-rc.2 / 上游 `477b4f420553e8a52c2fbccc464d7561b239c443`。两包 CRM/Knowledge 和七包页面输入来自前轮已审准备回执，输入 SHA、四包 source SHA、manifest/tarball 与解包文件 SHA 都在机器记录的 `formal_runtime_inputs`。没有改写来源，没有重新生成包，没有把普通 content pack 混作正式 pack。

公共行为加载记录仍显示 CRM/Knowledge **声明 Cordis 4.0.2、实际 SDK 4.0.4**。该原声明的严格 npm 安装冲突没有因本轮合成 resolver 消费而关闭；精确校准提案和独立同包验收仍按原边界处理。

## 原始运行和失败留存

原始目录：`/Users/hutou/.codex/tasks/shinemage-package-isolation-ownership-20261011-2_hcqsm1/`。`archive-isolation-r2.*` 是当前四包结果，`runs-r2/package-isolation/runtime-inputs.json` 是本轮完整回执；`public-consumers-r1.*` 及 `public-r1/{leaf,crm-package,knowledge-package}/runtime-inputs.json` 分别绑定实际 SDK 公共消费。

首轮 `archive-execution-r1` exit 1：新增 SDK 拒读规则将中文路径写成 JSON ASCII Unicode 转义，Sandbox Scheme 没有按真实中文路径匹配，负对照发现可读后阻止产品测试开始。r1 是 **产品测试 NOT_RUN**，不是失败后通过数。修正为 UTF-8 真实路径的 r2 才提供当前拒读结论，原规则、脚本、日志和说明全部保留；不是放宽沙箱。

六项坏输入均实际拒绝：已有输出 EEXIST（首回执不变）、缺 CRM/相对 page 输入 PROFILE_PACK_INPUTS_REQUIRED、坏 profile digest PROFILE_PACK_PROFILE_DIGEST、缺 query 选择 PACKAGE_ISOLATION_SELECTION、symlink 输出 PACKAGE_ISOLATION_OUTPUT_REQUIRED。除已有目录外都未产生结果子目录；缺 query 使用自有派生负测 profile，仅复制原封存包字节，原 profile/receipt/tarball 未改。

实际 `pipeline --check` 复用已有 `package-isolation` scope，exit 1 / CRM_COMPOSITION_OUTPUT_EXISTS，源码/服务尚未启动；不能报整条 pipeline 通过。静态边界检查 exit 0：11 packages / 27 edges / 653 source files / 63 dynamic imports。三产品文件语法与 diff 检查通过，本地主 Agent 审查无未解决项；本轮外部 OCR/外审未运行。命令、起止时间、失败、负对照和文件绑定见[机器记录](./shinemage-fixed-pack-isolation-20261011-validation.json)。

## 接续边界

主仓仍有 board-components 生产者、package-inputs 的生产者锁合同、geometry-composition 的私有 Workbench 投影、显式缺输入构建守卫和三组主仓业务断言。两份源码夹具现在只作显式 legacy，不删除旧 `dsh-plugins/`，不把静态清单或局部 PASS 当作清理授权。

最新完整 B0、新主仓 hosted CI、完整 preflight、当前 candidate/journal、服务/目标/browser、真实模型/业务、正式安装分发与 DSH 升级仍分别未执行。SDK BLOCKED 不泛化为普通插件开发阻塞，T5/T15/T19/T21 未勾完。原作者仓、旧候选与 journal 不变。

当前操作见[固定包隔离验证](../../operating/verification.md#固定包隔离验证2026-10-11)；前轮[installed-kit 默认迁移](./shinemage-installed-kit-pack-ownership-20261011.md)、[正式包装配](./shinemage-formal-preflight-pack-assembly-20261011.md)和[当时完整 B0](./shinemage-workbench-core-formal-main-ownership-20261011.md)保留其自己的来源与范围，不能改写成当前完整通过。
