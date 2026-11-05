# 依赖锁变更后的密封件重签

B0 的 sealed composition artifact 会读取 sealed head 上的 `requirements-lock.txt` 来校验 source-target query lock。PR #215 为提速把根 `requirements*.txt` 移出 B0 scope 后，PR #228 的 `starlette 1.6.0 -> 1.10.0` 在 B0 跳过的状态下合入 main，sealed artifact 仍留 1.6.0，下一个 B0 PR 以 `SERVICE_SOURCE_TARGET_QUERY_LOCK` 失败，直到 #233 手工重签。

现在规则是 fail-closed：**任何改 `requirements.txt` / `requirements-lock.txt` / `services/**` 的 PR 都会跑 B0，合并前必须重签。** 不要合并 stale artifact。

## 一条命令（依赖 PR）

```bash
git fetch origin
git switch <dependency-pr-branch>
node scripts/release/respin-composition-artifact.mjs --dry-run   # 只读预检
node scripts/release/respin-composition-artifact.mjs             # 重签
```

helper 顺序执行：

1. 校验 worktree 是目标 commit 且没有 tracked 改动；
2. `service-manifest-pins.mjs --write`，再 `--check`，仍有 `SERVICE_DEPENDENCY_*` drift 就失败；
3. 从目标 commit 重建 `codex/rc3-composition-artifact-20261024`，只对该分支 `--force-with-lease` 推送，触发 push workflow；
4. 等 workflow SUCCESS，用 `composition-pack-inputs.mjs --artifact-lock` 下载并验证 20 个成员、sha256、run/head 绑定，并校验 sealed head 的 `requirements-lock.txt` 能对上当前 service recipes；
5. 改写 `config/shinemage-composition-artifact.lock.json`，把 `scripts/release/runtime-host-evidence.mjs` 的 `RUNTIME_HOST_SOURCE` 移到新 sealed head；
6. 打印每个改动文件与 old/new artifact id、run、head。

成功后提交 helper 写出的文件，再走正常 PR：

```bash
git status --short
git add -A
git commit -m "chore(release): reseal composition artifact for <dep>"
git push
```

预期改动只有：`config/shinemage-composition-artifact.lock.json`、`scripts/release/runtime-host-evidence.mjs`，以及 step 2 重新生成的 `services/*/package.json`。

## 验证

```bash
node scripts/release/respin-composition-artifact.mjs --check   # 本地一致，不联网、不写文件
node scripts/release/respin-composition-artifact.mjs --dry-run # 已重签时输出 RESPIN_ALREADY_SEALED
```

期望：

- helper 退出码 `0`，最后一行 `RESPIN_SUMMARY ...`；重复执行输出 `RESPIN_ALREADY_SEALED`，不会二次重签；
- `--check` 输出 `RESPIN_CHECK_OK`；
- PR 的 `b0-contract-build` SUCCESS，且 `test` / `dependency-audit` 绿；
- lock 的 `id/runId/headSha` 与 run 页面一致，`RUNTIME_HOST_SOURCE` 等于 `headSha`；
- 不带 `--dry-run` 的 run 已证明远端 artifact 可下载、digest 与 run/head 绑定。

## Dependabot 分支

优先在 Dependabot PR 上直接重签（需要该 PR 允许 maintainer edits）：

```bash
gh pr checkout <dependabot-pr>
node scripts/release/respin-composition-artifact.mjs --dry-run
node scripts/release/respin-composition-artifact.mjs
git add -A && git commit -m "chore(release): reseal composition artifact for <dep>" && git push
```

不能推 Dependabot 分支时，用本地分支替代 PR：

```bash
gh pr view <dependabot-pr> --json headRefName -q .headRefName
git fetch origin pull/<dependabot-pr>/head:respin/<dep>
git switch respin/<dep>
node scripts/release/respin-composition-artifact.mjs
git add -A && git commit -m "chore(release): reseal composition artifact for <dep>"
git push -u origin respin/<dep>
gh pr create --base main --head respin/<dep> \
  --title "fix(ci): make dependency-lock changes run B0 and reseal" \
  --body "Replacement for #<dependabot-pr>; resealed artifact."
```

合并替代 PR 后关闭原 Dependabot PR。Dependabot 版本内容不变，只补 lock/pin。

## 预期耗时

| 阶段 | 典型耗时 |
|---|---|
| `--dry-run` / `--check` | 数秒 |
| step 3 sealing workflow | 1–2 分钟（warm） |
| step 4 下载 + 全量验证 | 1–2 分钟（取决于网络） |
| 整个 helper | 3–6 分钟 |
| PR 的 B0（冷缓存） | 10–16 分钟；热缓存更快 |

B0 未绿前不要合并。

## 失败与回滚

| 现象 | 处理 |
|---|---|
| `RESPIN_DIRTY_TREE` / `RESPIN_TARGET_MISMATCH` | 先停在目标 commit 并清理 tracked 改动；不要用 `--force` 绕过 |
| `RESPIN_SERVICE_PINS_STILL_DRIFTING` | 生成器仍报 drift，检查 `requirements-lock.txt` 与 `services/dependency-closure.json`，修输入而不是手改 manifest |
| `RESPIN_SEALED_*` / `RESPIN_SOURCE_TARGET_LOCK` | 密封成员字节与目标锁不一致，或 sealed head 的 lock 对不上 recipe；不要手改 `.ci`，先修依赖/recipe，再重跑 |
| `RESPIN_DEPENDENT_LOCK_UNSUPPORTED` | 有新的 `config/*.json` 嵌了旧 artifact id/head；先扩展 helper 的依赖锁改写，再重签 |
| `RESPIN_SEALING_RUN_FAILED` | 打开 run 日志；sealing 分支已推到失败 head，修因后重跑 helper（force-with-lease 会覆盖该专用分支） |
| `RESPIN_ARTIFACT_VERIFY` / `RESPIN_ARTIFACT_MISSING` | workflow 未产出 20 成员 artifact 或下载/校验失败；重跑 sealing workflow，不要把旧 artifact 写回 lock |
| 已推送错误 lock、尚未合并 | `git checkout -- config/shinemage-composition-artifact.lock.json scripts/release/runtime-host-evidence.mjs services/`，在正确的 commit 上重跑 helper；旧 artifact 保留 90 天可回溯，不要手写 id |
| 已合并且 B0 红 | revert 该 PR 的 lock/pin 提交，从 revert commit 重跑 helper 重新密封；不要改历史 artifact |

## 边界

- helper 不改依赖版本、service pin 数值或 `.ci` 成员字节，只重建专用 sealing 分支并回填 lock/pin。
- 触发 workflow、下载 artifact 是 live-only，需要仓库 push 权限和 `gh` 认证；单元测试只覆盖确定性部分：
  `node --test scripts/release/respin-composition-artifact.test.mjs`（lock/pin 改写、20 成员摘要、stale source-target 拒绝、`--dry-run` 不写文件）。
- `--check` 是离线检查，不证明远端 artifact 仍存在或未过期；以 live run 和 PR 的 B0 为准。
