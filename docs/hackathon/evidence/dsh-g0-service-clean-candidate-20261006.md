# 首购服务 clean 候选与本机兼容验收（2026-10-06）

完整候选链 [OCR 审核及文档修正](./dsh-g0-candidate-full-review-20261006.md)已通过正常 hooks 提交为 `2be518e584d3adfb0343be58049dc3c674cea2f9`。本页为用户要求的提交后下一步：从该 clean SHA 生成首购服务候选，完成源码及精确包验收。后续证据文档提交不改写包的来源，也不要求仅因文档变化重打包。

## 固定输入与产物

- baseline 服务源码：`56198c32a52d9822c7a3338d92b0fa077d1c61bc`。
- candidate 服务源码、两包打包器：`2be518e584d3adfb0343be58049dc3c674cea2f9`；两个打包回执均为 `worktree_dirty=false`。
- Darwin arm64，Node 24.19.0 / Python 3.14.4。每包在新 venv 使用已有 wheelhouse 的 13 个精确 wheel，以 `--no-index --no-deps --require-hashes` 冷安装；依赖版本与原兼容窗口相同，不是依赖升级测试。

产物目录：`.context/checks/service-clean-2be518e5-20261006/pair/`。

| 服务包 | 字节 | archive SHA-256 | manifest SHA-256 |
|---|---:|---|---|
| baseline `0.0.0rc1` | 66647 | `e721dde8976ac28d75d169fbdb14143bd0070788cf6c2be952979d2edf8021e8` | `e7856d366ac315f209201eef631c25cdd2123fa92ec5c5a57288e2014efc06a7` |
| candidate `0.1.0rc1` | 75811 | `190050f6eaecdaf199c87ca516e3ff9323e72187995721709e448f764c9217db` | `a0905e4ee81912030396f3ed233c09a38dc8530cf3173b3dc708d63759ea8b5f` |

两者文件名分别为 `shinemage-analytics-first-purchase-service-0.0.0rc1.tar.zst`、`shinemage-analytics-first-purchase-service-0.1.0rc1.tar.zst`。旧版身份仅供此次对比，不冒充历史生产发布包。

## 实际执行

```sh
GIT_NO_REPLACE_OBJECTS=1 PYTHON_DOTENV_DISABLED=1 \
"$PWD/.context/checks/service-package-pair-20261005/build-venv/bin/python" -I -B \
  scripts/dsh-b0/service-save-compatibility.py \
  --baseline 56198c32a52d9822c7a3338d92b0fa077d1c61bc \
  --candidate 2be518e584d3adfb0343be58049dc3c674cea2f9 \
  --output "$PWD/.context/checks/service-clean-2be518e5-20261006/source"

node scripts/crm-calibration/service-package-compatibility.mjs \
  --baseline 56198c32a52d9822c7a3338d92b0fa077d1c61bc \
  --candidate 2be518e584d3adfb0343be58049dc3c674cea2f9 \
  --baseline-python "$PWD/.context/checks/service-package-pair-20261005/build-venv/bin/python" \
  --candidate-python "$PWD/.context/checks/service-package-pair-20261005/build-venv/bin/python" \
  --baseline-wheelhouse "$PWD/.context/checks/service-package-pair-20261005/wheels" \
  --candidate-wheelhouse "$PWD/.context/checks/service-package-pair-20261005/wheels" \
  --output "$PWD/.context/checks/service-clean-2be518e5-20261006/pair"
```

上述目录现已存在，重跑须使用新目录，不能覆盖证据。构建使用已有固定环境，未下载依赖、重建 DSH 或启动现役服务。

| 检查 | 本次结果 |
|---|---|
| 精确源码 → synthetic SQLite / ASGI 兼容 | **9/9 PASS**；同一已有测试环境，独立于下行最小 venv 证据 |
| 实际 pack → 安全解包 → 两个离线 venv → HTTP | **9/9 PASS**；保存、只读回退、恢复回放、forward-fix、小库备份恢复和未知 schema 拒绝 |
| 当前控制面的 `prepareServiceCompatibility` / `verifyServiceArtifactEvidence` | 重新读取源码回执、双包、manifest、代码摘要及安装清单，`LOCAL_SERVICE_ARTIFACTS_VERIFIED` |
| 把旧 WSL 回执交给新包校验 | `SERVICE_TARGET_PAIR_MISMATCH`，正确拒绝；没有改旧回执或 journal |
| 生产激活负测 | `SERVICE_ACTIVATION_EVIDENCE_INCOMPLETE`，保持阻断 |
| 临时进程 | 两个 runner 完成后，无本次 fixture/probe 进程残留；临时安装与小库由各自 runner 回收 |

源码回执 SHA-256：`fceb87382d3ab5d7232f9e08bfb8e1724309d84c4222aabbc5eee8d6f7cd99e9`；包配对回执：`a74bf6e92d3246c6d3632af41e495df9fc75b72fb8a437efa6b6399aaf0549a2`。同一证据根下保存 `source.log`、`pair.log`、`source/receipt.json`、`pair/receipt.json`、`service-binding.json`、`source-gate.json` 和 `verification.json`。

## 仍然开放

只完成 **clean 首购服务包的本机子项**，尚未接入新的最终 plugin candidate journal（`journal_binding=NOT_RUN`）。已有 CRM/知识插件候选及其宿主记录保持原 SHA；该服务包也未启用保存 UI。

新包的 WSL 冷安装/恢复为 NOT_RUN，旧包的 14/14 仍只属于旧包。身份/候选准入与时钟仍由包外 synthetic fixture 注入，生产身份/状态策略、时间与 UNKNOWN 窗口、签名/SBOM/CVE、受信任接收与激活、目标 DSH runtime/浏览器、G0 与物理分仓均未完成。`release_ready=false`。没有连接杭州、真实 DuckDB 操作、push、Release 或生产部署。
