# shine-brand：固定 pnpm 调用与 CI 输入接续（2026-10-08）

接续 [A/B/C 独立化交付](./shinemage-plugin-independence-integration-20261008.md)。主树仍 detached `f8db3949a7323c1e058c4d57f6287d4dbf54451d`，起点 88 项未提交内容。独立仓 `/Users/hutou/.codex/tasks/shinemage-shine-brand-independent-20261008/dsh-shine-brand` 仍为 unborn main，无 commit、无 remote。本轮没有产品提交、clone、远程建仓、push、PR、发布或部署。

## 本轮关闭的具体问题

B-R2 的命令来源不一致已关闭：原 workflow 用 `corepack pnpm install`，pack 用裸 `pnpm`。现在两者都通过 `scripts/pinned-pnpm.mjs`，要求 `SHINE_BRAND_PNPM_ENTRY` 为已准备的 pnpm JS 文件绝对路径，用 `process.execPath` 执行，不搜索 PATH、不自动下载或切换默认环境。根开发 manifest 固定 Node 24.19.0 / pnpm 11.28.2，实际版本不符即拒绝；子命令失败保留退出码，Corepack 网络与自动 pin 强制关闭。

新增 `scripts/check-inputs.mjs` 在离线安装后、构建前检查三个显式绝对目录，并复用既有 kit `inspectToolchain` 核验固定上游 SHA/锁、build-tools 五文件、编译器和 SDK bindings。该入口不构建 DSH、不写插件链接、不重跑 SDK 安全审计；报告中的 SDK BLOCKED 是既有发布边界，不是新审计。

只改独立仓 7 文件：workflow、DEVELOPMENT、开发根 package.json、verify-pack，以及新增 pinned-pnpm、其测试、check-inputs。没有改 plugin manifest、plugin/build.mjs、运行源码、kit、锁或主集成树产品。精确 diff、修前副本和逐文件摘要位于 `.context/checks/shine-brand-ci-inputs-20261008/{independent-delta.patch,independent-delta.json,before-independent/}`。

## 本轮真实运行

全部下列步骤使用原 `sandbox.sb`：网络、主仓和兄弟业务源码不可读；固定上游 checkout 与 build-tools 两个目录仍放行。没有把本地 sandbox 等价流程称为 GitHub Actions。

| 入口 | 退出 / 结果 |
|---|---|
| `node scripts/pinned-pnpm.mjs --version` | 0，11.28.2 |
| `node --test --test-reporter=tap scripts/build-input.test.mjs scripts/pinned-pnpm.test.mjs` | 0，20 PASS / 0 FAIL / 0 SKIP |
| `node scripts/pinned-pnpm.mjs install --frozen-lockfile --ignore-scripts --offline` | 0，复用 1 包，downloaded 0；重建本仓 node_modules，锁字节不变 |
| `node scripts/check-inputs.mjs` | 0，固定输入校验通过；不含 SDK 分发放行 |
| `node plugin/build.mjs <固定上游绝对路径> <固定工具绝对路径>` | 0 |
| 两个既有品牌行为测试 | 0，7 PASS / 0 FAIL / 0 SKIP |
| `node scripts/verify-pack.mjs` | 0，5 成员，2559 字节，摘要保持 `e9e053442beca4a33d406b8fb428f778eebe19d99f3d5c85843c647a0a016757` |

测试覆盖缺失/空值/相对入口、版本漂移在执行 install 前拒绝、同一 Node/字面参数转发、禁用 Corepack 网络及保留非零退出；SDK 预检覆盖三个相对目录拒绝。版本测试使用隔离假命令验证拒绝分支，正向流程另用真实 pnpm 11.28.2。20/7 不与上一轮测试相加。

每步实际完整 argv、白名单环境、退出、stdout/stderr 摘要在 `run-r1/*.json`；原日志同目录。安装输出的缓存 supply-chain policy 提示不是本轮 SDK 审计通过。内容包在原 verify-pack 临时目录清理逻辑下验证，未转成正式候选。JS 两文件、锁、kit tar 和旧 candidate/journal 的摘要保持。

## 开发依赖与远程 CI 的明确边界

可用作者输入仍是：kit `0.1.0` tar SHA `251383e18a76fe345ac837d8767f6c325c4616c027e2ea250d2dcec45b22c901`、固定上游 `477b4f420553e8a52c2fbccc464d7561b239c443` / lock `5d3980bcd2a0113101815aabfeb4f8a875d556a333521539b7f11d790f4a50aa`、已安装的匹配 build-tools。没有新的 npm-only 方案，没有将 SDK 分发门禁放宽，也没有再做全量审计。

远程 CI **NOT_RUN**。workflow 尚需 runner 上实际存在的 Node24.19.0、pnpm11.28.2 JS 入口及固定 SDK/工具目录；三个 repository vars 是 `SHINE_BRAND_PNPM_ENTRY`、`SHINE_BRAND_UPSTREAM`、`SHINE_BRAND_BUILD_TOOLS`，没有配置它们或假定 ubuntu-24.04 hosted runner 自带它们。CI 的 YAML 已解析、本地命令对应关系已检查，但没有据此报远程通过。

下一步是独立仓的授权提交与真实本地 clone 验证，再按对应授权和输入落实远程仓/runner/CI。未形成提交时 clone 得不到工作区文件。本轮不顺带提交主集成树的文档/其他成果。原 A 的运行回执缺口、真实业务/WeKnora、独立 DSH 升级仍分别开放。

[机器记录](./shinemage-shine-brand-ci-inputs-20261008-validation.json)保存本轮文件、工具入口及保护摘要。SDK 分发 **BLOCKED**，产品 **PARTIAL**，`release_ready=false`；B-R2 仅命令绑定部分关闭，runner 输入条件仍待落实。
