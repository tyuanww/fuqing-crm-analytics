# rc2 候选第一轮代码审查（2026-09-26）

审查方式：`open-code-review-delegate`；OCR 仅负责 preview/rule，代码审查由宿主逐文件完成。

| 指标 | 数值 |
|---|---:|
| preview total_files | 135 |
| reviewable_files | 121 |
| reviewed_files | 121 |
| skipped_files | 0 |
| coverage_rate | 100% |
| excluded_files | 14（OCR unsupported_ext，另行检查文档内容） |

## 首轮发现与修复

- **HIGH** `scripts/dsh-dev/pin.test.mjs`：清洁候选没有随包携带 .context 上游 checkout；移除 skip 会让复现测试直接失败。修复：恢复未运行 checkout 的显式 skip，并保留有 checkout 时的 SHA 校验。
- **HIGH** `scripts/release/operator-gate.mjs`：SLI 只按可用 latency 计算 p95，未运行延迟的样本仍可能在 10 个时间戳下 PASS。修复：要求所有样本都有非负 latency，否则 NOT_RUN。
- **HIGH** `scripts/release/reconcile.mjs`：本地有摘要而远端缺摘要时原先会继续 RECONCILED，可能错误采用不完整回执。修复：摘要单边未运行返回 UNKNOWN；资产名重复也返回 UNKNOWN。
- **MEDIUM** `scripts/release/action-contract.mjs`：同 actor/idempotency key 换 action type 原先复用旧 action。修复：增加 action type 冲突和状态损坏的 fail-closed 检查。
- **MEDIUM** `scripts/release/artifact.mjs`：manifest 路径允许空段或 . 段，并未拒绝 payload 重复路径。修复：要求 canonical path，拒绝空/. /.. 段和重复 payload。
- **MEDIUM** `scripts/release/secure-unpack.py`：非 zstd 输入先整文件复制，未受解包上限约束。修复：改为分块复制并受 max-bytes 限制；同时保留 tar 成员上限。
- **MEDIUM** `scripts/release/promotion.mjs`：当前 symlink 存在但 current-target 未运行时原先放行激活。修复：未运行记录直接返回 CURRENT_TARGET_RECORD_MISSING。

## 当前未关闭的边界

- GitHub protected tag/OIDC-Sigstore 信任根仍为 `NOT_AVAILABLE`，本轮没有伪造通过。
- rc1→rc2 runtime/session/WAL、WSL2 冷验证、真实 HTTP SLI/backpressure、杭州现场 UAT 尚未运行。
- 本地候选 worktree 没有 DuckDB/WAL 文件；B0 失败仅为 Python `duckdb` 包锁漂移。

## 已审文件

- `VERSION` (modified)
- `dsh-plugins/analytics-workbench/build.mjs` (modified)
- `dsh-plugins/analytics-workbench/package.json` (modified)
- `dsh-plugins/analytics-workbench/src/client/board-spec-canvas.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/src/client/cockpit-composition-dom.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/src/client/cockpit-composition.mjs` (modified)
- `dsh-plugins/analytics-workbench/src/client/cockpit-composition.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/src/client/cockpit-main-panel.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/src/client/cockpit-sidebar.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/src/client/competition-board/competition-board-dom.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/src/client/free-html-library/free-html-library.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/src/client/html-hover-layer-dom.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/src/client/html-hover-layer.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/src/client/index.tsx` (modified)
- `dsh-plugins/analytics-workbench/src/client/leave/host-leave-adapter.mjs` (modified)
- `dsh-plugins/analytics-workbench/src/client/leave/leave-prompt.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/src/client/library-workspace.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/src/client/overlay-error-boundary.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/src/client/staff-main-panel.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/src/client/workspace-files-host.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/asset-overlay.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/built.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/cockpit-v2-browser-probe.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/helpers/native-board-bridge.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/helpers/native-composition-history.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/lane-g-delivery.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/library-board-http.integration.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/library-layout-browser-probe.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/loader.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/native-composition-history.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/native-fixture-client-boundary.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/native-prompt-inject.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/native-slot-ownership.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/plugin-ui-lifecycle.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/query-card-cancel.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/query-card-save.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/query-skills-loader.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/sessionless-view-dom.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/skills-loader.test.mjs` (modified)
- `dsh-plugins/analytics-workbench/test/tool-card-harness.mjs` (modified)
- `dsh-plugins/analytics-workbench/toolchain.json` (modified)
- `dsh-plugins/crm-knowledge/build.mjs` (modified)
- `dsh-plugins/crm-knowledge/package.json` (modified)
- `dsh-plugins/shine-board/build.mjs` (modified)
- `dsh-plugins/shine-board/package.json` (modified)
- `dsh-plugins/shine-board/src/client-lifecycle.test.mjs` (modified)
- `dsh-plugins/shine-brand/build.mjs` (modified)
- `dsh-plugins/shine-brand/package.json` (modified)
- `dsh-plugins/shine-brand/src/brand-surface.mjs` (modified)
- `dsh-plugins/shine-brand/src/brand-surface.test.mjs` (modified)
- `dsh-plugins/shine-brand/src/client-lifecycle.test.mjs` (modified)
- `dsh-plugins/shine-brand/src/client.tsx` (modified)
- `dsh-plugins/shine-crowd-action/build.mjs` (modified)
- `dsh-plugins/shine-crowd-action/package.json` (modified)
- `dsh-plugins/shine-crowd-action/src/client-lifecycle.test.mjs` (modified)
- `dsh-plugins/shine-funnel/build.mjs` (modified)
- `dsh-plugins/shine-funnel/package.json` (modified)
- `dsh-plugins/shine-funnel/src/client-lifecycle.test.mjs` (modified)
- `dsh-plugins/shine-query/build.mjs` (modified)
- `dsh-plugins/shine-query/package.json` (modified)
- `dsh-plugins/shine-query/src/client-lifecycle.test.mjs` (modified)
- `dsh-plugins/shine-waterfall/build.mjs` (modified)
- `dsh-plugins/shine-waterfall/package.json` (modified)
- `dsh-plugins/shine-waterfall/src/client-lifecycle.test.mjs` (modified)
- `scripts/dsh-b0/collect-evidence.mjs` (modified)
- `scripts/dsh-b0/control-permission-probe.mjs` (modified)
- `scripts/dsh-b0/gateway-policy.mjs` (modified)
- `scripts/dsh-b0/gateway-smoke.mjs` (modified)
- `scripts/dsh-b0/gateway.mjs` (modified)
- `scripts/dsh-b0/kernel-native-evidence.mjs` (modified)
- `scripts/dsh-b0/mock-provider.test.mjs` (modified)
- `scripts/dsh-b0/native-card-smoke.mjs` (modified)
- `scripts/dsh-b0/native-query-fault-smoke.mjs` (modified)
- `scripts/dsh-b0/native-query-smoke.mjs` (modified)
- `scripts/dsh-b0/native-smoke.mjs` (modified)
- `scripts/dsh-b0/native-state-smoke.mjs` (modified)
- `scripts/dsh-b0/package-manager-env.test.mjs` (modified)
- `scripts/dsh-b0/pipeline.mjs` (modified)
- `scripts/dsh-b0/sandbox-probe.mjs` (modified)
- `scripts/dsh-b0/serve.mjs` (modified)
- `scripts/dsh-dev/cli.mjs` (modified)
- `scripts/dsh-dev/cli.test.mjs` (modified)
- `scripts/dsh-dev/constants.mjs` (modified)
- `scripts/dsh-dev/diagnose.mjs` (modified)
- `scripts/dsh-dev/diagnose.test.mjs` (modified)
- `scripts/dsh-dev/page-globals.mjs` (modified)
- `scripts/dsh-dev/page-http.test.mjs` (modified)
- `scripts/dsh-dev/paths.mjs` (modified)
- `scripts/dsh-dev/serve.mjs` (modified)
- `.github/workflows/dsh-release-evidence.yml` (added)
- `deploy/wsl/activate-release.sh` (added)
- `deploy/wsl/install-release.sh` (added)
- `deploy/wsl/rollback-release.sh` (added)
- `docs/release/dsh-rc2-candidate/baseline.v1.json` (added)
- `package.json` (added)
- `pnpm-lock.yaml` (added)
- `scripts/dsh.mjs` (added)
- `scripts/release/action-contract.mjs` (added)
- `scripts/release/artifact.mjs` (added)
- `scripts/release/auth-contract.mjs` (added)
- `scripts/release/backpressure.mjs` (added)
- `scripts/release/compat-check.mjs` (added)
- `scripts/release/evidence.mjs` (added)
- `scripts/release/operator-gate.mjs` (added)
- `scripts/release/pack.py` (added)
- `scripts/release/page-policy.mjs` (added)
- `scripts/release/promotion.mjs` (added)
- `scripts/release/reconcile.mjs` (added)
- `scripts/release/release.test.mjs` (added)
- `scripts/release/schema.mjs` (added)
- `scripts/release/schemas/ci-evidence-index.v1.schema.json` (added)
- `scripts/release/schemas/pre-manifest.v1.schema.json` (added)
- `scripts/release/schemas/promotion-receipt.v1.schema.json` (added)
- `scripts/release/schemas/release-manifest.v1.schema.json` (added)
- `scripts/release/schemas/release-publication.v1.schema.json` (added)
- `scripts/release/secret-scan.mjs` (added)
- `scripts/release/secure-unpack.py` (added)
- `scripts/release/state-reconcile.test.mjs` (added)
- `scripts/release/state.mjs` (added)
- `scripts/release/trust.mjs` (added)
- `scripts/release/trust.test.mjs` (added)
