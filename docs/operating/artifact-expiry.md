# 作者证据与密封 artifact 到期值守

`.github/workflows/artifact-expiry.yml` 每周运行
`scripts/release/check-artifact-expiry.mjs`，在 b0/preflight 开始下载 artifact
之前就报告哪些锁定的 GitHub Actions artifact 即将过期。**红色周报是预期的提醒，
不是可以忽略的噪声**：它表示还有 7 天或更少时间刷新，或者已经过期。

## 现在会过期什么

GitHub 按仓库的 artifact retention 设置删除 artifact，删除后
`GET /repos/<owner>/<repo>/actions/artifacts/<id>` 与 `.../zip` 都会 404。
当前有两类：

| 类别 | 保留期 | 当前到期（观测值） | 谁依赖它 |
|---|---|---|---|
| 作者仓的 CI evidence archive（workbench、domain、public contracts，共 5 个） | 14 天 | `2026-11-19T12:53Z`–`2026-11-19T13:01Z` | b0 的 `Receive fixed ...` 步骤、release preflight |
| 作者仓的 9 个 formal-pack artifact | 14 天 | 与上面同一窗口 | 只在重新密封（respin）时下载；字节已封装进 sealed artifact |
| 本仓的 sealed composition artifact（1 个） | 90 天 | `2027-02-03T13:22Z` | `composition-pack-inputs.mjs`、preflight、b0 |

表中的 5 个 author evidence archive 和 1 个 sealed artifact 有稳定的 artifact
id，可以轮询；9 个 formal-pack artifact 的 id 没有写进任何 lock（pack lock 只
pins `source_sha`），所以脚本无法按 id 检查它们。它们的字节已经在 sealed
artifact 里，正常 b0/preflight 不会回作者仓下载；只有重新密封时才需要作者仓
artifact 还活着。

2026-11-06 的 live 观测：脚本报告 5 个作者 archive 剩余 14 天，sealed artifact
剩余 90 天。这些数字随运行时间变化，以脚本输出为准，不是新的常量。

## 被检查的 lock

脚本只读 checked-in lock，不写任何文件。当前覆盖 5 个 lock、6 个 artifact：

| lock | 取哪个字段 | artifact 数 |
|---|---|---|
| `config/shinemage-composition-packs.lock.json` | 只校验 schema；9 个 plugin 只 pin source sha | 0 |
| `config/workbench-author-evidence.lock.json` | `archive.artifact_id` / `archive.repository` | 1 |
| `config/domain-author-evidence.lock.json` | `archive.artifact_id` / `archive.repository` | 1 |
| `config/public-contract-inputs.lock.json` | `owners.{workbench,crm,brand}.archive` | 3 |
| `config/shinemage-composition-artifact.lock.json` | 根 `id` / `repository` | 1 |

任意一个 lock 的 schema 变了、重复引用了同一个 artifact、或 API 返回的 id 与
lock 不一致，脚本都以非 0 退出（fail closed）。

## 运行

```bash
# 默认：表格 + 7 天窗口；exit 0 表示都还安全
GH_TOKEN=... node scripts/release/check-artifact-expiry.mjs

# 机器可读
GH_TOKEN=... node scripts/release/check-artifact-expiry.mjs --json

# 提前 14 天预警
GH_TOKEN=... node scripts/release/check-artifact-expiry.mjs --warn-days 14

# 离线测试：不访问 API，也不需要 GH_TOKEN
node scripts/release/check-artifact-expiry.mjs --offline /tmp/artifact-expiry.json
```

`GH_TOKEN` 必须能读所有被锁仓库的 Actions artifacts；CI 里用
`secrets.SHINEMAGE_PLUGIN_READ_TOKEN`（与 b0/preflight 的 author receiver 相同）。

退出码：

| 码 | 含义 |
|---|---|
| `0` | 所有 artifact 都还在 `--warn-days`（默认 7）之外 |
| `1` | 至少一个在窗口内或已过期 |
| `2` | lock 读不了、token 缺失、API 失败或 artifact id 对不上；同样是红色，按失败处理 |

JSON 形状：`{schema, checked_at, warn_days, threshold_exceeded, unresolved,
exit_code, locks, artifacts}`；每个 artifact 带 `id`、`repository`、`source`、
`expires_at`、`days_remaining`、`status`（`ok` / `warning` / `expired` /
`unknown`）。`days_remaining` 在未过期时向上取整、已过期时为负数。

离线 fixture 只需给所有被锁 artifact 提供 `expires_at`：

```json
{
  "artifacts": {
    "13416602588": {"expires_at": "2026-11-19T13:01:12Z", "expired": false}
  }
}
```

缺条目或条目没有 `expires_at` 会记为 `unknown` 并以 2 退出，不会静默当作安全。

## 过期后怎么刷新

先看脚本表格确定是哪个 lock / 哪个 artifact。**不要改 lock 里的 id 去“绕过”
过期**；id 必须来自真实 run 的 API 输出。

1. **在作者仓的 `main` push run 上重跑，保持 `source_sha` 不变。**
   receiver 要求 `run.head_sha` 精确等于 lock 的 `source_sha`，所以更晚的
   author `main` 不能直接满足旧 lock：

   ```bash
   # 原 run 的 head_sha 就是 lock 的 source_sha；重跑会生成新的 attempt 和新的 artifact
   gh run rerun <run_id> --repo tyuanww/<author-repo>
   ```

   如果作者 `main` 已经前进、你本来就要把 lock 移到新 main，那是一次完整的
   refill（`source_sha`、所有摘要和 pack lock 都会变），按
   [p4-repo-split-runbook.md](p4-repo-split-runbook.md) 的 refill 流程做，不要
   只改一个 id。

2. **用现有 receiver 工具重新接收并校验。** 这些命令从 API 下载新 artifact，
   逐字节核对 lock 里的 sha256/bytes，并打印观测到的 run/artifact：

   ```bash
   GH_TOKEN=... node scripts/ci/workbench-author-evidence.mjs --output "$RUNNER_TEMP/wb" --python <python3.14>
   GH_TOKEN=... node scripts/ci/domain-author-evidence.mjs --output "$RUNNER_TEMP/domain" --python <python3.14>
   GH_TOKEN=... node scripts/ci/public-contract-inputs.mjs --output "$RUNNER_TEMP/public" --python <python3.14>
   ```

   重跑后内容通常逐字节不变，变的只有 `archive.artifact_id` 和（domain /
   public contract 的）`archive.attempt`；`run_id` 不变。把 receiver 打印的
   新值回填到对应 lock。仓库目前没有“自动改 evidence lock”的 writer，回填
   必须来自上面的 API/receiver 输出，并随 PR 一起提交。

3. **重新密封 composition artifact。** 作者 pack 重打或 lock 摘要变化后，按
   [dependency-reseal.md](dependency-reseal.md) 执行：

   ```bash
   node scripts/release/respin-composition-artifact.mjs --dry-run
   node scripts/release/respin-composition-artifact.mjs
   ```

   helper 会重建 sealing 分支、等 workflow、下载并验证 20 个成员，最后改写
   `config/shinemage-composition-artifact.lock.json` 和
   `RUNTIME_HOST_SOURCE`。如果 seal 成员字节没变，它会以
   `RESPIN_ALREADY_SEALED` 结束，不会凭旧 artifact 写回 lock。

4. **走正常 PR 验证。** 提交 refill/reseal 产物后，PR 的 b0 与
   `dsh-release-preflight` 仍然是唯一的 live 证明；周报只负责提前报警，不
   替代 b0/preflight。

`gh run rerun` 生成的新 artifact 同样有 14 天保留期，所以刷新后下一次周报会
重新从 14 天开始倒计时。

## 红色周报意味着什么

- `exit 1`：表格里 `Days remaining` ≤ 7 或已过期。先刷新最紧急的那个；刷新
  后手动跑一次 `workflow_dispatch` 确认转绿。
- `exit 2`：检查本身失败（token 失效/无权限、artifact 404、lock schema
  漂移）。这同样需要处理，不能当作“脚本坏了”跳过。
- 连续红色但没人处理，最终会让 b0/preflight 在 `Receive fixed ...` 或
  `Prepare sealed independent plugin packs` 步骤 404；那时再刷新还要额外
  处理已经失败的 PR。周报的价值就是把这段时间提前。

## 边界

- 脚本只读 lock 和 GitHub API，不改 lock、artifact、workflow pin 或作者仓。
- 9 个 formal-pack artifact 没有 id 可轮询；本检查覆盖的是 lock 真正按 id
  引用的 6 个 artifact。
- `--offline` 只证明确定性的表格/JSON/退出码逻辑；live API 路径由 CI 周报
  执行。本地离线环境没有 `GH_TOKEN` 或 CA 时，live 检查可能以 2 退出，这是
  预期的 fail-closed 行为，不是绕过检查的理由。
