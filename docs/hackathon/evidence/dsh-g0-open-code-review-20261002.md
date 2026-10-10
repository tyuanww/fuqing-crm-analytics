# DSH G0 Open Code Review 证据（2026-10-02）

## 范围

- 工作树：`fuqing-crm-analytics-public`
- 分支：`main`
- 审查入口：`ocr delegate`（`open-code-review v1.12.4`）
- 审查模式：workspace
- OCR 预览：54 个变更文件，其中 39 个代码/配置文件可审查，15 个 Markdown 文件因 `unsupported_ext` 被 OCR 排除；排除文件已人工检查当前 diff。
- 规则覆盖：对 39 个可审查文件执行 `ocr delegate rule --format json`，并逐文件检查 diff/源码与相关测试。覆盖率为 39/39（100%），无代码文件跳过。

本技能是 delegation 模式，OCR 只负责文件筛选和规则解析，实际审查由当前 Agent 完成；没有调用外部模型，也没有把历史测试结果当作本次证据。

## 本轮发现与修复

1. **候选回执先于 journal 成功事件（高风险）**
   - `scripts/release/plugin-candidate.mjs` 现在先记录 `CANDIDATE_INTENT`，以私有 pending 文件写入并原子改名，再记录 `CANDIDATE_PREPARED`。
   - 最终 journal 失败时，回执会恢复为 `candidate.pending.json`，不会留下可被误认为已准备完成的 `candidate.json`。
   - 候选状态不再输出绝对 state 路径。

2. **receive 校验失败会留下未验证目录（高风险）**
   - `scripts/release/artifact.mjs` 现在在私有临时目录完成解包、allowlist、payload digest、secret scan 和 runtime entrypoint 校验，全部通过后才原子改名到最终目录。
   - `scripts/dsh.mjs receive` 在物理安装前写入 `RECEIVE_INTENT`，成功后才写 `RECEIVED`。

3. **profile/plugin 路径存在 lexical 与 canonical 不一致风险（高风险）**
   - `profile.mjs`、`plugin-pack.mjs` 增加真实路径边界和 symlink 拒绝。
   - `plugin-candidate.mjs` 额外校验 CLI plugin 路径与 profile 选中路径的 canonical path 一致。

4. **重复选项和 publication identity 不明确（中高风险）**
   - `scripts/dsh.mjs` 对 state path、tag、config、scope 和必填选项拒绝重复值，返回稳定的 `*_AMBIGUOUS` 错误码。
   - `state.mjs` 固化 source/manifest/artifact/checksum/evidence/assets identity；冲突 fail-closed。
   - `reconcile.mjs` 对已进入上传阶段但缺少 publication identity 的远端回执返回 `UNKNOWN`，不会静默采用远端状态。

## 本次验证

以下命令均在当前工作树实际执行：

```text
pnpm dsh test
  102 passed, 0 failed

node --test scripts/release/plugin-candidate.test.mjs
  3 passed, 0 failed

node scripts/dsh-b0/pipeline.mjs --check --python /tmp/dsh-b0-python.qW3lHO/venv/bin/python
  exit 0
  618 pytest passed
  314 B0/Node checks passed
  7 plugin builds/tests passed
  clean rebuild passed

pnpm dsh verify --scope local
  exit 0, LOCAL_PASS

pnpm dsh doctor --release
  exit 2, expected BLOCKED
  blockers: RELEASE_BLOCKED_DIRTY_WORKTREE,
            RELEASE_UPSTREAM_RUNTIME_REQUIRED

git diff --check
  exit 0

node --check (当前变更的 JS/MJS/TS/TSX 文件)
  exit 0
```

`doctor --release` 的阻断是真实当前状态：工作树仍有未提交修改，且当前环境没有固定的 DSH 上游 runtime bundle。它不能作为 release candidate 的通过证据。

## 仍未关闭的边界

- 插件 candidate 的 host receive、canary、rollback 仍为 `NOT_AVAILABLE/NOT_RUN`，尚未伪造为通过。
- WSL2 冷启动、session/WAL 真实 runtime、15 分钟 HTTP SLI、host HTTP、真实权限/网络/容量和杭州 UAT 尚未执行。
- GitHub protected tag、OIDC/Release publication 和远端 receipt 尚未执行；本轮没有 push、tag、Release、重启或部署。
- Release 仍必须从 clean reviewed commit 使用同一个 immutable artifact；当前 dirty worktree 不能生成正式 release。
