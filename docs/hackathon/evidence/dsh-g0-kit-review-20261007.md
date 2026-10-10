# kit 安装与 SDK 准备审核（2026-10-07）

范围：`codex/plugin-boundary-review`，`git log -1` 为 `cc1d8497`，审核工作区此前全部 **63** 个未提交路径。按用户指定 `open-code-review-delegate`，OCR 只解析文件与规则，当前 Agent 完成审核、修复与验证；未调用外部 LLM endpoint 或委派子 Agent。本轮覆盖提交前 review 检查点，不运行 ship/发布流程。

## 覆盖

`ocr delegate preview --format json` 返回 workspace、50 个 reviewable、13 个 unsupported_ext 文档。`ocr delegate rule --format json <50 paths>` 返回 JSON/package/JS/Python 四组规则。逐一读取 tracked diff 和新增完整文件，补查调用方、实际包、源码复制清单、构建入口与既有证据。

| 范围 | total_files | reviewed_files | skipped_files | coverage_rate |
|---|---:|---:|---:|---:|
| OCR reviewable | 50 | 50 | 0 | 100% |
| 手工补充被排除文档 | 13 | 13 | 0 | 100% |
| 初始范围合计 | 63 | 63 | 0 | 100% |

新增本审核报告另作补充核对。原始输出、四组规则、逐路径 `(path,status)` 清单、源码摘要、结构化 findings 和日志保存在 `.context/checks/kit-review-20261007/`。路径覆盖不等于整项目、全量 pipeline 或生产验收。

## 发现与修复

| 严重度 | 文件 | 缺陷与结果 |
|---|---|---|
| High / bug | `dsh-plugins/plugin-kit/prepare.mjs` | pnpm 的 consumer 路径为符号链接，`argv[1]` 与 `import.meta.url` 物理路径不同，正常命令会空跑退出 0。实际旧安装包 `--help` 输出为空已复现。入口比较 realpath 后修复；源码 symlink 和实际 pnpm 安装分别验证 help、已有目录退出 2，import 仍无副作用。 |
| Medium / security | `dsh-plugins/plugin-kit/toolchain.mjs` | prepare 最后的 SDK 预检继承应用环境，且删除前序 Git 隔离变量。合成哨兵证明应用 key 被送入 Git 子进程。改为最小 PATH/固定 Git 环境，禁系统/全局配置、交互、可选锁和 replacement；实际子进程负测修复后通过。 |

两项新增负测 **0 PASS / 2 FAIL** 的日志为 `new-negatives-before.log`，修复后均通过。当前审核范围没有未关闭 High/Medium；没有扩大到 DSH 上游或业务 API。

## 本次验证

- `node --test scripts/dsh-b0/plugin-kit-prepare.test.mjs scripts/dsh-b0/package-manager-env.test.mjs scripts/dsh-b0/clean-build.test.mjs`：**18 PASS / 0 FAIL / 0 SKIP**，`guards-fixed.log`。
- 十份受影响测试文件（精确命令与隔离环境见 `regression-command.json`）：**156 项覆盖，首次 153 PASS / 3 FAIL / 0 SKIP**。失败均为本次测试 PATH 未包含已有 zstd；没有修改产品代码规避。补上实际 zstd 目录后只重跑对应 `scripts/release/release.test.mjs`，**41 PASS / 0 FAIL / 0 SKIP**，`release-fixed.log`；两次有重叠，不相加报总数。
- 上述覆盖实际 pnpm 安装入口、10/10 消费方无相邻源码构建/测试、四个叶子插件受控打包、领域摘要/几何/组合、workspace 链接和 CLI/release 回归。构建复用上一轮**全新准备的**固定 SDK/工具，不重新下载编译 DSH。新增修复没有变化安装/SDK 编译配方；不把原 8 分 18 秒记录写成本轮重跑。
- 边界清单 **11 包 / 34 边 / 642 源文件 / 74 动态测试引用 PASS**；改动 mjs 语法、Python compile、文档引用与 `git diff --check` 通过。
- 原 **1318** 个封存文件的字节/mtime、candidate 和 journal seq 6 保持，见 `integrity.json`。真实 DuckDB、杭州生产和原 release 没有访问或变更。
- 首次正常 commit 被文档事实 hook 拦住：旧阶段的一句故障描述被识别为仓库功能判断。改成准确的已复现行为“inventory 错误要求 kit 提供领域包 lock”，保留原错误码与失败日志，不绕过 hook；原拒绝记录为 `commit-ground-truth-first.log`。

## 交付与下一步

用户已授权“修复后没问题就 commit”；按上述审核范围以正常 hooks 本地提交，不 push、创建 PR 或部署。实际提交 SHA 以提交后的 Git 日志/STATUS 最新增量为准。本审核报告作为新增交付文件同行提交。

提交后继续 SDK/工具闭包的可移植性与可校验分发。尚未关闭：整台干净机器/本入口 WSL、预编译 SDK 分发、registry/签名/SBOM/CVE/撤销、真实业务 UAT 和物理分仓。整体仍 **PARTIAL / release_ready=false**。
