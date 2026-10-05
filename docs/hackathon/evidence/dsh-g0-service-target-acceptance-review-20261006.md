# WSL 合成验收记录 OCR delegate 审核（2026-10-06）

范围：`codex/plugin-boundary-review@79434033` 后的 7 份未提交 Markdown。使用 `open-code-review v1.12.11` 的 `delegate preview --format json` 与 `delegate rule --format json`；OCR 只负责确定范围和规则，审查由当前 Agent 完成，没有外部模型或子 Agent。

## 覆盖与结论

OCR 因 `unsupported_ext` 排除了全部 7 个路径，不能将空选中列表视为审查通过。本轮把七份文件全部补入 `(path,status)` 清单：

| 文件 | 状态 | 审核 |
|---|---|---|
| `STATUS.md` | modified | reviewed |
| `docs/hackathon/TODOS.md` | modified | reviewed |
| `docs/operating/crm-service-packages.md` | modified | reviewed |
| `docs/operating/verification.md` | modified | reviewed |
| `docs/plans/shinemage-plugin-platform-split.md` | modified | reviewed |
| `docs/hackathon/evidence/dsh-g0-service-target-acceptance-20261006.md` | added | reviewed |
| `docs/hackathon/evidence/dsh-g0-service-target-platform-20261006.md` | added | reviewed |

`total_files=7`、`reviewed_files=7`、`skipped_files=0`、`coverage_rate=100%`。另对照未进 Git 的实际验收适配脚本/启动边界、原始成功与失败回执、已有四个 helper、包与 wheel、权限修复和清理记录；没有只看文字结论。

未发现本批待修的 Critical/High/Medium 问题。修正两处 Low 级文档歧义：

1. STATUS/TODO/计划的“10 个临时进程”未区分轮次；改为成功轮次 10 个、失败轮次 1 个，均有退出/回收记录。
2. 平台准备记录中的 `NOT_RUN` 容易被当成当前状态；明确为准备时点，保持原始回执不变，并指向之后真实 WSL 验收。

没有将测试身份/固定时钟、合成 digest、旧包 dirty 来源或自述 JSON 升级为生产证据。旧版可写降级破坏 provenance 是已验证的阻断条件，继续保留。

## 本轮重新验证

- 本地读取并核对 28 个成功输入文件、两份原 archive/manifest、13 个 Linux wheel、两个 venv 的实际安装清单及 preflight 输出，全部匹配。
- 原成功回执 SHA-256 `d392f6c484a0e900cd5a5eb3e97c7f19abc3b468e62efc0811c4346333e80cb7` 不变；14 个不重复场景均 PASS，SIGKILL 退出码为 `-9`，成功轮次 10 个进程已停止。
- 原失败回执仍为 FAIL / 2 项完成 / 1 个进程退出；修复后 synthetic tar 目录权限确为 `0700`，生产入口首次与最终监听/PID 快照一致。
- 四个 helper 与当前仓库字节一致；实际验收脚本摘要 `08a1650f0c8af1bea785d9d2c30f8086e06c6757737e70b41c7a0f13c505df79` 与报告一致，Python 语法检查通过。
- Markdown 本地链接与 `git diff --check` 通过。本轮是**原始证据的本地复核**，没有重新运行 WSL 服务或历史 35/206 项测试，没有访问真实数据库。

审核原始记录：`.context/checks/service-target-acceptance-review-20261006/` 的 `preview.json`、`rules.json`、`checklist.json`、`findings.json`、`review-summary.json` 和 `evidence-recheck.json`。

本批允许按用户授权本地提交文档。下一步仍是目标证据验证器与原候选 journal 接线；14/14 合成验收不放行生产身份、供应链、DSH 宿主、保存 UI 或物理分仓。commit 不包含 push、发布或杭州切换。
