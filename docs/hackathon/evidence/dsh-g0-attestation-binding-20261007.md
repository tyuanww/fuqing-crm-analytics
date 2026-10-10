# G0 包来源绑定与独立构建复核（2026-10-07）

状态：**源码 SHA 绑定修复通过 / T5、T19 和 G0 仍 PARTIAL**。当前工作树为 `codex/plugin-boundary-review`，HEAD `418edc29`；保留前批附件/委派恢复改动。本批没有提交、推送、发布、连接杭州、切换服务或访问业务数据；没有改写候选及 journal。

## 本次修复

原 `verifyAttestationBundle` 只约束 repository、source ref 和 signer workflow，并接受任意非空 JSON 数组。ref 相同不等于证书中的源码 commit 相同。现在强制提供完整 `sourceSha`，通过 GitHub CLI 的 `--source-digest` 核对证书来源，并明确要求 SLSA provenance/v1。空/缺字段/错误 subject digest 输出一律拒绝；流式核对验证前后 artifact 摘要，拒绝校验期间变化。

安装入口把 `manifest.source_sha` 同时交给应用和 runtime 的验证器，GitHub publish workflow 两处验证都传 `REVIEWED_SHA`。这是**产品仓库打包 workflow 的 commit**；DSH `477b4f42…` 是另一个来源，通过 runtime manifest 单独约束，不能混用。失败回执只给稳定错误码，不回传 `execFile` 命令、stderr、路径或凭据；子进程限时 60 秒。密码学仍由 `gh` 完成，不自行实现验签。

接口依据：[GitHub CLI attestation verify](https://cli.github.com/manual/gh_attestation_verify)。本机实际工具为 `gh 2.102.0`。本修复不等于已经固定所有主机的 verifier 二进制和 trust-root 生命周期，完整供应链门禁继续开放。

## 本次实际验证

所有日志位于 `.context/checks/attestation-source-binding-20261007/`：

| 命令/场景 | 实际结果 | 证据 |
|---|---|---|
| 修复前 `node --test scripts/release/attestation-binding.test.mjs` | 最初四项全部失败，复现缺 SHA、非空假输出和错误泄露 | `before-tests.log` |
| `node --test scripts/release/*.test.mjs` | **434 PASS / 0 FAIL / 0 SKIP，53.00 秒**；包含新增五项与校验期间文件变动拒绝 | `release-tests.log` |
| `B0_BUILD_UPSTREAM="$PWD/.context/dsh-b0/upstream-0.1.7-rc.2" node --test scripts/dsh-b0/plugin-isolation.test.mjs` | **4 PASS / 0 FAIL / 0 SKIP，20.23 秒** | `independent-build-tests.log` |
| 真实 `gh attestation download` + `gh attestation verify` 与修改后的 `verifyAttestationBundle` | 下述三场景符合预期 | `download.log`、`actual-gh.json`、`actual-gh.stderr`、`actual-receipts.json` |

真实签名验证使用已有 `dsh-0.20.0.0-r1` runtime，不重新打包：

- 包 SHA-256：`a049f061847dd48e58b159bdfe9f388ef7ea5efdaf8ead3c3b4293d7411fdcf4`。
- repository：`tyuanww/fuqing-crm-analytics`；source ref：`refs/tags/dsh-0.20.0.0-r1`。
- source SHA：`073c576c8d75d6ab16e2bac48b2cc99adf4a68bf`；signer：该仓 `.github/workflows/dsh-release-evidence.yml`。
- 正确组合 → **VERIFIED**，一份有效 attestation；错误 source SHA → **NOT_AVAILABLE**；合成错误 artifact 配同一 bundle → **NOT_AVAILABLE**。
- 单元测试中的临时 `gh` 程序只验证调用/回执边界，不算签名证据。上面的真实命令才使用 GitHub 下载的原始签名。

第一次下载使用了错误相对路径，在访问 artifact 前退出 1；修正为同级 evidence 目录后成功。没有覆盖先前候选；bundle 仅写入本轮新证据目录。未运行 GitHub workflow 或生产安装，不能把本地回归写成远端 CI 通过。

## 独立构建的实际边界

四个叶子插件 `shine-brand`、`shine-query`、`crm-knowledge`、`knowledge` 各自在临时目录中只带自身源码和 dev kit 完成真实构建、测试、受控打包。CRM/knowledge 还从实际解包后的包运行合同测试。每个临时目录由测试创建并回收，临时 Git fixture commit 不属于产品提交。

这一结果证明叶子插件不需要读取其他业务插件源码，**尚不证明 kit 已可独立发布**：目前仍需要固定上游 checkout/已安装 SDK 与编译工具，以及字节一致的 build-tools 闭包。workbench、领域包和全新联网安装不在四项复核范围。下一步应把 kit/SDK 构建输入变成可验证的分发单元，再决定物理分仓；不为本次检查升级 DSH 或依赖。

## 旧 rc1 来源结论及剩余项

复核上一轮原始 `session-rich-wsl-20261007/retrieved/rc1-before.json`：源码为 `46a7f68b0922371ce7144b668b90e377d8e799f4`、tracked clean，四个使用包有 package/entry 摘要，但 `compiled_build_attestation` 仍为 **NOT_VERIFIED**。这些是运行输入观察，不能证明编译闭包如何产生；本次没有重新连接旧目录或给旧文件补造历史签名。

- [x] T5/T19 的现有 release 签名来源绑定、输出结构拒绝、错误脱敏及真实正负验证。
- [x] 四个叶子插件独立构建前置复核；版本 pin 保持。
- [ ] T2 的 rc1 编译闭包来源：补原始可信构建记录；若无法取得，从固定 rc1 源码/锁文件隔离构建新的可追踪输入后重跑兼容矩阵。新构建不能冒充旧二进制的历史来源。
- [ ] T5/T19 的独立插件签名接线、SBOM/CVE 阈值、撤销/轮换与 verifier/trust-root 管理。
- [ ] 独立 kit 分发、其余包边界和 G0 stop/go；真实身份/模型/UAT、canary/回退与生产准入保持原门禁。

原候选 `a490457c…` 与 `release_ready=false` 保持，不用一次 runtime 签名成功替整个插件候选放行。

## 审查与保护

按 `open-code-review-delegate` 读取实际文件清单及规则，由当前 Agent 审查全部 **17/17 文件、0 skipped**（9 个代码/workflow，8 个文档，包含 OCR 按扩展名排除的 Markdown）；无未关闭高/中风险发现。已核对安装调用方、workflow 的 REVIEWED_SHA 来源、包/上游双 SHA、真实 gh 输出、超时与错误脱敏；前批恢复代码原字节保持，其既有实测不冒充本次重跑。

`preview-final.json`、`rules.json`、`review-final.json` 与 `integrity.json` 保留在本轮 evidence 目录。语法、`git diff --check` 和新增链接通过；1318 个既有保护文件字节/mtime 保持。候选 journal 仍 **seq 6**，末事件 digest `062f271051788a815b40aae8fb1410ab9897a6018749c86198b2b1fa92e014b1`。本轮仅更新前批五份共享状态文档，其余六个前批未提交文件保持。当前合计 17 个未提交文件，本次修改涉及其中 11 个。
