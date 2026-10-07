# 全部 kit 消费者的公开包迁移（2026-10-07）

基线为 `codex/plugin-boundary-review` / `cc1d8497`，保留此前 23 个未提交文件，在原工作树继续。本轮没有 commit、push、发布或杭州操作，没有访问业务数据，也没有生成或替换已有候选。原始日志位于 `.context/checks/kit-all-consumers-20261007/`。

## 已关闭的子项

全部 **10 个构建消费者**（9 个插件和 1 个领域包）使用精确 `@shine-mage/dsh-plugin-kit@0.1.0` 开发依赖和公开导出：shine-brand、shine-query、shine-board、shine-crowd-action、shine-funnel、shine-waterfall、crm-knowledge、knowledge、analytics-workbench、board-components。工作台保留自身类型检查；kit 没有接管业务合同。插件运行时和 optional/peer 依赖仍禁止 kit。

- 插件使用 `./toolchain`，图表领域构建使用 `./packaged-dependencies`，工作台开发测试从 `./pin` 读取固定版本。
- 边界扫描不再豁免构建入口对相邻 kit 源码的引用。公开 kit 导出只允许构建/测试阶段、精确开发依赖和包内明确文件；运行时代码依旧拒绝。
- B0、release preflight、CRM calibration 和本地 reload 均接入显式适配器；B0 clean-copy 构建也准备自己的 kit 链接。本仓 reload 对外部 checkout 返回 `EXTERNAL_PACKAGE`，不注入本仓 kit；外部安装和符号链接仍不覆盖。
- board-components 打包去除 scripts 与开发依赖，原领域 tarball 摘要仍为 `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182`。没有为构建入口改动制造同版本新领域包或改消费者 digest lock。

## 实际失败及修复

第一轮安装矩阵发现漏斗/瀑布图测试仍导入工作台源码和兄弟领域包的测试文件。保留失败日志 `consumer-tests-first.log`。现将跨工作台 props/投影断言移到仓库级 `geometry-composition.test.mjs`，B0 显式执行；领域 JSON 全矩阵及几何不变量继续由 board-components 测试维护，叶子包保留自身比例、输入拒绝、大列表与生命周期测试。没有通过复制工作台源码来让隔离测试假通过。

同时修正一个新增负测的相对路径，使其确实测试相邻 kit 源码引用，而不是误测越过包根。首次 4 个失败计数包含父测试汇总失败，不等于四个独立业务缺陷。最后差异检查发现测试文件末尾多余空行，已去除。

## 当前验证

环境 Node `24.19.0`、pnpm `11.7.0`。真实 kit tarball 在隔离 HOME、全新 store 下通过 pnpm 离线安装；每轮只复制一个消费者到相同空目录，前一消费者回收后再进入下一包。没有相邻 kit/插件源码；领域依赖仅通过同一锁定 tarball 输入。SDK/build-tools 仍由显式已准备输入提供，**不是整台干净机器 bootstrap**。

```sh
B0_BUILD_UPSTREAM="$PWD/.context/dsh-b0/upstream-0.1.7-rc.2" node --test \
  scripts/dsh-b0/plugin-kit.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs \
  scripts/dsh-b0/plugin-isolation.test.mjs scripts/dsh-b0/package-inputs.test.mjs \
  scripts/dsh-b0/clean-build.test.mjs scripts/dsh-b0/geometry-composition.test.mjs \
  dsh-plugins/board-components/test/geometry.test.mjs scripts/release/plugin-boundary.test.mjs
node --test scripts/dsh-dev/cli.test.mjs scripts/release/cli.test.mjs scripts/release/release.test.mjs
node scripts/dsh-b0/plugin-boundaries.mjs --check
```

- `consumer-tests-fixed.log`：**88 PASS / 0 FAIL / 0 SKIP**，含 10/10 实际安装构建/测试、四个叶子包的受控打包和领域/组合回归。
- 增加工作台实际 loopback Cookie/Origin/卸载测试后，仅重跑受影响 kit 套件，`kit-final.log`：**15 PASS / 0 FAIL / 0 SKIP**，仍含 10/10 消费者；工作台通过 8 份既有测试文件，包含完整类型检查、编译模块、原生插槽/提示、布局适配与局部 HTTP 夹具。这与 88 项有重叠，不相加。
- `entry-tests.log`：**73 PASS / 0 FAIL / 0 SKIP**，覆盖本地 CLI 与 release 核心；本轮未执行实际 reload 或 restart。
- 当前边界扫描 **11 包 / 34 边 / 640 源文件 / 74 项测试级动态引用 PASS**。新增公共 pin 引用已计入；相邻 kit 构建源码边为零。
- 所有改动 mjs 语法、Python `compile()`、文档新增链接与 `git diff --check` 核验。
- `integrity.json`：**1318 个历史封存文件**字节/mtime 保持，原候选与 journal 保持，journal 仍 **seq 6**。新测试仅构建自有临时目录。

未运行：全量 B0 pipeline、完整 CRM calibration 后端验收、clean reviewed-SHA release preflight、真实浏览器/模型、远端 CI 或生产切换。入口已接线及局部回归通过，不把这些未执行层级写为 PASS。

## 下一顺序

T15 的“所有 kit 构建消费者公开包安装接线”已关闭。下一步仍是 SDK/工具闭包独立分发和整台干净机器安装：当前 kit 源码包不含 26 个 DSH SDK 的编译闭包、TypeScript/esbuild/React 与业务构建依赖；真实构建仍显式复用固定 upstream/build-tools。必须保持上游 SHA/锁不变，并为这些输入建立可校验的安装路径，不能以当前离线 kit 安装代替。

其后继续 T5/T19 的插件签名、来源信任、SBOM/CVE/撤销，以及业务 UAT/G0 和物理分仓门禁。本轮未创建新仓库、未发布 kit、未升级 DSH，也没有修改 DSH 源码。整体 **PARTIAL / release_ready=false**。
