# 首购服务 WSL 回执接入原候选 journal（2026-10-06）

承接用户授权的“审核、修复、commit、下一步”。上一批 WSL 记录经 [OCR delegate](./dsh-g0-service-target-acceptance-review-20261006.md) 覆盖 7/7，修正两处低风险表述、核验原始输入后，通过正常 hooks 本地提交为 `2a89790b42326376f0808e0896b0a78877bd28ba`。没有 push。本页代码/测试/文档是提交后的下一步增量，尚未提交。

## 实现边界

- 沿用 `scripts/dsh.mjs plugin verify-service`，增加成对的 `--target-evidence` / `--target-input`，不另建 CLI 或状态账本。
- `scripts/release/service-target-evidence.mjs` 校验旧/新服务包与原 candidate/source gate 的关联、输入 manifest 的 28 个文件摘要/大小/白名单、固定 runner/4 个 helper、13 个 wheel 与安装记录、14 项场景、10 个进程的退出与 sidecar、清理和生产监听快照。
- 当前 v1 runner 固定为 `08a1650f0c8af1bea785d9d2c30f8086e06c6757737e70b41c7a0f13c505df79`，原字节存于 `scripts/release/test-fixtures/target-acceptance-20261006.py`。仅作本次历史验收的可审计输入，CLI/CI 不执行该脚本；更换 runner 必须单独审核，不能在输入 manifest 中重算 hash 绕过。
- 所有目标输入校验在写 journal 前完成；依次复用/写入 `CANDIDATE_SERVICE_ARTIFACTS_VERIFIED` 和 `CANDIDATE_SERVICE_TARGET_OBSERVED`，都在现有写锁内核对前置历史。两次追加之间中断可重试；不会出现目标成功但缺少 artifact 前置事件。原 candidate、现场 receipt 不被改写。
- 新结果明确为 `UNATTESTED_OPERATOR_OBSERVATION` / `SYNTHETIC_A64_ONLY`，不声称已验证真实 candidate 准入或签名来源。原 artifact 观测仍保留它当时的 `target_host=NOT_RUN`，新的目标观测单独追加，避免改写历史。

## 本次验证

工作树：`codex/plugin-boundary-review`。Node 24.19.0、已有锁定 Python 3.14.4 / Ruff 0.16.9；没有安装或升级环境。

| 验证 | 实际命令/范围 | 结果 |
|---|---|---|
| 目标接线专项 | `node --test --test-concurrency=1 scripts/release/service-target-evidence.test.mjs` | **37 PASS / 0 FAIL / 0 SKIP** |
| 完整 release suite | `node scripts/dsh.mjs test` | **243 PASS / 0 FAIL / 0 SKIP** |
| 历史 runner 归档 | `ruff check scripts/release/test-fixtures/target-acceptance-20261006.py`、AST parse、固定 hash | PASS；不执行脚本 |
| 真实回执 CLI | 使用实际双包、原候选/原 journal、WSL receipt 与 input-v2 | `LOCAL_WSL_SYNTHETIC_SERVICE_OBSERVATION_VERIFIED`，seq **4** |
| 新进程重试 | 同一 CLI 参数再次调用 | 返回同一 seq/digest；candidate/journal 字节不变 |
| 输入保留 | 包、候选、输入目录与结果目录共 108 文件 | 内容 SHA/大小/mtime 全部不变，原 journal 前三条事件不变 |
| 激活负测 | 同一 candidate + 更新后 journal 调用现有 promotion gate | `SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE`，继续阻断 |
| 文档/静态检查 | 8 份 Markdown、181 个本地链接、5 个 JS 语法、`git diff --check` | PASS；无失效本地链接 |

专项负测覆盖失败/缺失/重复场景、假生产声明、错源码/包/依赖、重算 hash 后的 runner/helper/package receipt 替换、seed 来源/越界、安装/预检/恢复/清理 sidecar 失配、无 SIGKILL、重复/存活 PID、未知文件、链接/FIFO、监听变化、部分参数、日志脱敏和幂等冲突。测试夹具的 wheel/seed 只是解析器字节，不能安装运行，不作为现场证据。

原始日志在 `.context/checks/service-target-gate-20261006/`：`target-tests.log`、`release-suite.log`、`target-readonly-check.json`、`actual-first.json`、`actual-retry.json`、`actual-verification.json`、`journal-before.json`、`journal-after.json`、`inputs-before.json`、`inputs-after.json`、`document-validation.json`。

复核命令使用已有 journal，不创建替代账本：

```bash
node scripts/dsh.mjs plugin verify-service \
  --candidate "$PWD/.context/checks/service-gate-review-20261004/plugin-candidate/candidate.json" \
  --evidence "$PWD/.context/checks/service-artifact-review-20261005/pair/receipt.json" \
  --state-path "$PWD/.context/checks/service-artifact-gate-review-20261005/actual-state.json" \
  --target-evidence "$PWD/.context/checks/service-target-acceptance-20261006/retrieved-pass/result/receipt.json" \
  --target-input "$PWD/.context/checks/service-target-acceptance-20261006/input-v2/input-manifest.json"
```

候选 digest：`0df675b839885286da2880ee8656b3757c82aac3e36ffdcac53a9881e7c8031d`。目标原 receipt digest：`d392f6c484a0e900cd5a5eb3e97c7f19abc3b468e62efc0811c4346333e80cb7`。目标输入 digest：`c4a53ca7a5bb3a886faf220a8465b111eed9c5a6dcabce1ba4e144f44bdf7ef8`。新增 seq 4 digest：`2315f80cc711b96b80420a7f79bd0294beb4b81e6df1ddde0365a84ffb031e8b`。

## 未关闭

此次重新运行的是本地 verifier/CLI，不是 WSL 场景；14/14 的实际远端执行仍以[原现场记录](./dsh-g0-service-target-acceptance-20261006.md)为准。没有连接杭州、安装/启动服务、访问真实数据、执行真实模型、push 或发布。

仅关闭目标观测与原候选 journal 的绑定子项。原包 dirty 构建来源标记保留；最终干净候选、生产身份/策略、生产时间窗口/UNKNOWN、签名/SBOM/CVE/发布来源、DSH UI/浏览器/宿主 WSL/session/WAL、指标/知识服务目标安装、物理分仓仍开放。T3/T7/T15/T21 整体仍 PARTIAL，`release_ready=false` / 激活 BLOCKED。下一步按已确认顺序从审核后的干净 SHA 准备最终候选，再补这些现场与供应链证据；commit 不代表部署。
