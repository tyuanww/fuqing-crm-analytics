# 开发 SDK 审修与本地提交（2026-10-07）

按用户指定的 [open-code-review-delegate](https://github.com/alibaba/open-code-review) 流程，由当前 Agent 审查；OCR 仅提供文件选择与规则解析，没有调用外部 LLM 或额外 reviewer。范围是 `codex/plugin-boundary-review` 在父提交 `78175422` 后的 SDK 内容审计、缩减输入、kit 与消费者测试接线，共 32 个原始变更文件；本记录为第 33 个文件。只授权本地审修与 commit，不包含 push、Release 或杭州切换。

## 覆盖与结论

- `ocr delegate preview --format json` 的 22/22 代码/配置路径逐项审核，按 `(path,status)` 记录；额外审核 OCR 排除的 9 份文档及 1 份 Python 测试。原范围 **32/32，0 跳过，覆盖率 100%**；加本记录后最终 **33/33**。
- `ocr delegate rule --format json <paths...>` 的 JSON、JS/TS、包清单、Python 规则分别用于核对边界、错误处理、资源释放、输入验证与依赖。
- 找到 **1 个 High / P1，已修复**；当前变更范围无未关闭的 High/Medium 发现。这个结论不关闭 SDK 分发信任或产品验收门禁。
- 实现方向保留：kit 只用于开发，DSH 上游不修改；固定 SDK 校验在加载编译器前执行，完整 Git 路径与显式摘要路径共存；消费者测试保留原功能断言，真实扫描不进入每次业务插件构建。

## SDK-OCR-001：只检查最终落点不足以约束链接链

**路径：** `dsh-plugins/plugin-kit/sdk-closure.mjs`，`verifySdkClosure` 链接校验（修复后 70–90、103–106 行）。**类别：security；严重度：high；状态：fixed。**

修复前检查 `realpath` 的最终目标在 SDK 清单内，但允许两种中转：链接先到 SDK 外再返回，或经过 SDK 根下未声明的链接再返回。中转路径不受 manifest 摘要约束，破坏固定输入及迁移合同。两个自有临时目录负测在修复前均因“应该拒绝但没有拒绝”失败，证据保留于 `regressions-before.log`。

修复为先在 manifest 图内逐段解析相对链接，再比对真实终点；越界、未声明中转、非目录父项与循环均拒绝。解析保留真实目录链接后的 `..` 语义，不用简单字符串归一化误拒绝合法链接。新增第三项合法目录链与循环回归，真实 1261 条 SDK 链接也由下述消费者/审计验证。

## 修复后实际验证

本轮原始证据目录：`.context/checks/kit-sdk-ocr-20261007/`。固定缩减输入仍是 `../kit-sdk-closure-20261007/closure-r9`，manifest SHA-256 仍为 `7fa86cc9cc190f64735378e5a5bc2b1b74aece33aaa0f2b6b816c91492bcfdc6`；没有重新生成或改写它。

| 实际入口 | 本次结果 | 证据 |
|---|---|---|
| Node 24 `--test`：`sdk-closure.test.mjs`、`sdk-content-audit.test.mjs`、`plugin-boundaries.test.mjs`、`clean-build.test.mjs` | **38 PASS / 0 FAIL / 0 SKIP** | `guards-final.log` |
| Python 3.14 `-m pytest --noconftest -W error::ResourceWarning -q scripts/dsh-b0/test_sdk_archive.py` | **17 PASS / 25 subtests PASS** | `archive-tests.log` |
| 缩减 SDK，真实安装 kit 后 `node --test scripts/dsh-b0/plugin-kit.test.mjs` | **10/10 消费者构建及选定测试通过；外层 15 PASS / 0 SKIP，84.187 秒** | `compact-command.json`、`compact.sb`、`compact-consumers.log`、`compact-result.json` |
| 完整 SDK，同一安装/消费者入口 | **10/10 通过；外层 15 PASS / 0 SKIP，37.555 秒** | `legacy-command.json`、`legacy.sb`、`legacy-consumers.log`、`legacy-result.json` |
| 同一摘要 `sdk-content-audit.mjs --root … --closure-sha256 … --output …` | **0 命中 / 17 覆盖缺口，PARTIAL，退出 2**；26190 文件，14.958 秒 | `audit-command.json`、`audit-after.json`、`audit-result.json` |
| `node scripts/dsh-b0/plugin-boundaries.mjs --check` | **PASS**：11 包、28 边、644 源文件、74 动态引用 | 当前源码/生成清单比对 |
| `verify-protection.py` | 原 SDK **124231** 条、接收清单 **141091** 条、旧证据 **1318** 文件保持；candidate/journal 保持 | `integrity-after.json`、`integrity.log` |
| `git diff --check` / 暂存差异核对 | **PASS** | 提交前检查 |

两次消费者运行均使用新 HOME/TMPDIR/store，禁止外网，仅允许临时 synthetic loopback HTTP。缩减版额外禁止读取旧 SDK、完整归档/接收目录及仓库现成 node_modules，并禁止写入当前 SDK。每次只有一个消费者源码；工作台执行既有 8 个测试文件，这不等于完整前端/浏览器验收。精确命令、环境和 sandbox 均保留在上表证据中。

`preview.json` / `preview-final.json`、`rules.json`、`coverage.json`、`supplementary-coverage.json` 与 `findings.json` 保存完整覆盖与修复结果；`review-summary.json` 和 `reviewed-source-sha256.json` 绑定最终受审文件。历史失败及旧 SDK 记录未覆盖。

## 提交边界与开放项

这批代码和文档随本次授权的本地提交收录，父提交 `78175422`；提交消息为 `feat: add verified reduced SDK build inputs`，实际 hash 以 Git 记录为准。正常执行项目 pre-commit hooks，不绕过检查。

仍为 **PARTIAL / release_ready=false**：17 项不透明内容、发布者签名/来源证明、SBOM/CVE/撤销、缩减格式安全 pack/receive、目标平台/WSL/全新机器，以及既有业务 UAT 和物理分仓门禁均未因本次审修关闭。完整 pipeline、真实浏览器、完整宿主启动和远端 CI 本轮 **NOT_RUN**。没有访问真实 DuckDB，没有杭州生产动作。
