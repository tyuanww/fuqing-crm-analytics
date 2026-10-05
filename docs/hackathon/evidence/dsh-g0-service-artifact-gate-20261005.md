# 服务包回执接入候选 journal（2026-10-05）

本轮承接 OCR 审核和本地提交 `82c1f5cdeb0cac3f5f0ac89ec7eafdb799383e95`，工作树仍为 `codex/plugin-boundary-review`。该提交包含 22 个已审文件；本文与接线代码属于提交后的下一步增量，尚未提交。没有 push、Release、杭州或真实数据操作。

## 实现与边界

- `scripts/release/service-artifact-evidence.mjs` 消费双包回执，严格核对 scope/status/9 项观测、源码对、当前 7 个验证器/recipe、实际 archive 内外 manifest、逐文件 allowlist 与摘要、源证据中的 code、当前 bootstrap/resource、依赖锁和安装记录。
- `scripts/release/plugin-service-evidence.mjs` 重验原候选摘要/profile/plugin tarball/source gate 和既有 PREPARED journal，调用上述核验后追加 `CANDIDATE_SERVICE_ARTIFACTS_VERIFIED`。CLI 为 `pnpm dsh plugin verify-service`；没有新状态账本，也不改候选文件。
- 解包使用现有 `secure-unpack.py`，只处理已经验 hash 的私有字节副本；普通文件读取有界且拒绝 FIFO/链接。失败先于 journal 写入；成功重试仍重验文件，返回同一 seq/digest。
- 本机结果始终 `LOCAL_SERVICE_ARTIFACTS_VERIFIED`、`release_ready=false`、目标主机/供应链 NOT_RUN。JSON/hash 是本机观测的可复核绑定，不是发布者签名。命令不重新安装 wheel、不执行包内代码、不访问数据库、不启动任何服务；原 `SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE` 保留。

## 本次实际验证

固定 Node 24.19.0，所有原始日志在 `.context/checks/service-artifact-gate-20261005/`。

```sh
export PATH=/Users/hutou/homebrew/opt/node@24/bin:/Users/hutou/homebrew/bin:$PATH
node --test --test-concurrency=1 scripts/release/plugin-service-evidence.test.mjs
node scripts/dsh.mjs test
```

| 验证 | 当前结果 | 原始记录 |
|---|---|---|
| 新门禁与 CLI | **29 PASS / 0 SKIP** | `focused-final.log`；validator-only 小包夹具，不是服务运行证明 |
| 完整 release suite | **199 PASS / 0 FAIL / 0 SKIP** | `release-suite-final.log`，包含上述 29 项 |
| 既有实际双包 → 实际候选 CLI | **PASS** | `actual-cli-fixed.json`；复用本轮刚完成的真实包兼容观测 |
| 新进程重试 | **PASS**；候选与 journal 原字节不变 | `actual-cli-retry.json` / `actual-validation.json` |
| 实际产物副本的 false-release、stale-verifier、modified-archive | **3/3 拒绝**；退出 2，候选与 journal 不变 | `verify-actual.mjs` / `actual-validation.json` |

实际 CLI 参数：

```sh
node scripts/dsh.mjs plugin verify-service \
  --candidate "$PWD/.context/checks/service-gate-review-20261004/plugin-candidate/candidate.json" \
  --evidence "$PWD/.context/checks/service-artifact-review-20261005/pair/receipt.json" \
  --state-path "$PWD/.context/checks/service-artifact-gate-20261005/plugin-state.json"
```

`plugin-state.json` 是原候选 PREPARED journal 的本轮隔离副本。候选 digest 为 `0df675b839885286da2880ee8656b3757c82aac3e36ffdcac53a9881e7c8031d`；artifact evidence digest 为 `d27b6f63edf6358c06156fd645ed7285fd11e6ea96c64040a4d06fd7b69070d0`。新增 journal seq **3**，digest `a9b90089aaab469e1212c23b1f420d3f414942f261708357f328c4776d05cf37`；重复执行一致。

## 保留的首次失败

1. `actual-cli.log`：初版误把 OpenAPI `info.version` 与独立服务 API `1.0.0` 比较。已核对 factory 使用 `ANALYSIS_SCHEMA`（`analytics-first-purchase-saved-analysis/v1`），修正校验并在真实包和新门禁测试中通过；没有改业务 OpenAPI。
2. `release-suite.log`：**198 PASS / 1 FAIL**，原因是帮助文案改变了已有稳定提示。恢复原提示并增加新命令独立说明，最终 **199/199**；未放宽旧测试。

本轮没有重跑完整 B0、Python 服务测试、宿主/浏览器、模型或 WSL；前批的 25 Python / 10 Node / 9 双包观测仍按[审核记录](./dsh-g0-service-artifact-review-20261005.md)归属。测试和解包只清理各自临时目录。

最终 Node 语法、`git diff --check`、15 个改动/新增文件的空白及 Markdown 本地链接检查通过。

## 剩余条件

T3/T7/T15/T21 仍 PARTIAL。下一步是目标主机服务证据合同、受控身份/状态注入和 WSL 冷安装，再补生产形状时限/UNKNOWN、供应链和 DSH 保存 UI/浏览器。既有包带原打包 dirty 来源标记，没有借本地 commit 将它追认为 clean reviewed release；G0/stop-go 后才物理分仓。
