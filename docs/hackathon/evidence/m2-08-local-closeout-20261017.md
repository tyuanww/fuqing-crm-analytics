# M2-08 本地可关闭项复验（2026-10-17）

本回执只记录固定 Node 24 环境下可在当前 checkout 安全完成的 M2-08 本地检查。没有启动或重启服务，没有执行部署、激活、canary、rollback、release publish，也没有修改 DSH `0.1.7-rc.2` 主仓 pin。外部门禁仍按真实结果保持 `M2-07=BLOCKED`、`M2-08=NOT_RUN`、`release_ready=false`。

## 输入边界

| 项目 | 实际值 |
| --- | --- |
| checkout branch | `codex/current-main-fact-final2` |
| tested checkout SHA | `13c1831cee7703f33cd1d4bd00e5ffca9934773b` |
| `origin/main` at read time | `16f1e45c0c5f46d10a8a3d0ec034b3ca62be05f9` |
| Node | `v24.19.0` (`/Users/hutou/homebrew/opt/node@24/bin/node`) |
| pnpm | `11.28.2` |
| Python | `3.14.8` |
| zstd | `1.5.7` |
| DSH upstream pin | `477b4f420553e8a52c2fbccc464d7561b239c443` (`0.1.7-rc.2`) |
| worktree | tracked clean; protected untracked `security-audit-skill/` retained untouched |

## 逐项实际命令和输出

### 1. 基础 doctor

命令：

```sh
/Users/hutou/homebrew/opt/node@24/bin/node scripts/dsh.mjs doctor
```

退出码：`0`

关键原始输出：

```text
DSH_DOCTOR PASS node24=24.19.0
DSH_DOCTOR PASS version=0.20.0.0
DSH_DOCTOR PASS rc2-pin=477b4f420553e8a52c2fbccc464d7561b239c443
DSH_DOCTOR PASS release-schemas=present
```

### 2. 本地 synthetic verification

命令：

```sh
/Users/hutou/homebrew/opt/node@24/bin/node scripts/dsh.mjs verify --scope local
```

退出码：`0`

关键原始输出：

```text
DSH_VERIFY_COMPAT PASS scope=synthetic-json-only wsl2=NOT_RUN real_duckdb=NOT_RUN
DSH_VERIFY_BACKPRESSURE PASS scope=synthetic-loopback-http real_http=NOT_RUN
DSH_VERIFY_SLI NOT_APPLICABLE scope=local reason=release-only evidence
DSH_VERIFY_STATUS LOCAL_PASS scope=local
```

这只证明本地 synthetic compatibility/backpressure，不覆盖正式 release scope。

### 3. release doctor

命令：

```sh
/Users/hutou/homebrew/opt/node@24/bin/node scripts/dsh.mjs doctor --release
```

退出码：`2`（预期的 fail-closed release blocker）

基础工具链、pin、schema 和磁盘检查通过；真实 release blocker 为：

```text
DSH_DOCTOR_RELEASE FAIL git-clean=dirty:1 files code=RELEASE_BLOCKED_DIRTY_WORKTREE
DSH_DOCTOR_RELEASE FAIL plugin-packs=PROFILE_PACK_INPUTS_REQUIRED code=PREFLIGHT_PLUGIN_PACKS_INVALID
DSH_DOCTOR_RELEASE FAIL runtime-bundle=missing code=RELEASE_UPSTREAM_RUNTIME_REQUIRED
DSH_DOCTOR_RELEASE_BLOCKERS count=3 codes=RELEASE_BLOCKED_DIRTY_WORKTREE,PREFLIGHT_PLUGIN_PACKS_INVALID,RELEASE_UPSTREAM_RUNTIME_REQUIRED
DSH_DOCTOR_RELEASE_STATUS BLOCKED scope=release-readiness
```

`git-clean` 的唯一未跟踪项是项目规则保护的 `security-audit-skill/`；本轮没有删除、读取或纳入提交。正式 release 需要独立 clean reviewed checkout，不应通过改变保护目录伪造 clean tree。正式 profile pack inputs 和固定 rc2 upstream runtime bundle 也未在当前本地输入中提供。

### 4. release-scope verification

命令：

```sh
/Users/hutou/homebrew/opt/node@24/bin/node scripts/dsh.mjs verify --scope release
```

退出码：`2`

关键原始输出：

```text
DSH_DOCTOR_RELEASE_BLOCKERS count=3 codes=RELEASE_BLOCKED_DIRTY_WORKTREE,PREFLIGHT_PLUGIN_PACKS_INVALID,RELEASE_UPSTREAM_RUNTIME_REQUIRED
DSH_VERIFY_COMPAT PASS scope=synthetic-json-only wsl2=NOT_RUN real_duckdb=NOT_RUN
DSH_VERIFY_BACKPRESSURE PASS scope=synthetic-loopback-http real_http=NOT_RUN
DSH_VERIFY_SLI NOT_RUN reason=no 15-minute HTTP probe evidence
DSH_VERIFY_STATUS RELEASE_BLOCKED reason=15-minute SLI, WSL2 cold runtime/WAL, and host HTTP evidence remain NOT_RUN
```

该结果确认本地 synthetic 子项保持 PASS，但正式 release scope 仍 fail closed；未把本地结果提升为 M2-08 PASS。

### 5. release contract suite

命令：

```sh
/Users/hutou/homebrew/opt/node@24/bin/node scripts/dsh.mjs test
```

退出码：`0`

实际汇总：

```text
ℹ tests 558
ℹ pass 558
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 52872.936708
```

该套件覆盖 release CLI、preflight/readiness、artifact/receive、runtime/source provenance、service/host evidence、promotion/rollback fail-closed 和 SDK closure 等合同测试；它是本地合同验证，不替代公司 runner、正式签名、目标环境或发布授权。

## 当前 M2-08 结论

本轮本地可做项已完成：固定工具链、rc2 pin、基础 doctor、本地 synthetic verification 和 558 项 release contract suite 均按实际输出记录。`doctor --release` 与 `verify --scope release` 的 3 个阻断和正式 15 分钟 SLI/WSL2 cold runtime/WAL/host HTTP 缺口仍然存在，因此：

```text
M2-07=BLOCKED
M2-08=NOT_RUN
release_ready=false
activation=NOT_RUN
canary=NOT_RUN
rollback=NOT_RUN
```

仍需外部/正式环境提供：

1. clean reviewed checkout（保护目录不进入正式输入）；
2. 与选定 profile 绑定的正式 plugin pack inputs；
3. 固定 rc2 upstream runtime bundle；
4. 15 分钟真实 HTTP SLI 回执；
5. 正式 release authorization，以及后续 activation、canary、rollback 回执。

本地测试没有写入生产 profile、journal、服务目录或 live 端口。

### 6. rc2 preflight check（当前 checkout 复验）

在后续本地文档收口提交后的当前 checkout `1b281ff6fefaf40b2e957cc31e4a8e5f853d0379` 上，重新运行只读 `preflight --check`。该命令只检查输入和输出目录，不执行 prepare/build/runtime/release，也不写入正式 release evidence。

命令：

```sh
/Users/hutou/homebrew/opt/node@24/bin/node scripts/dsh.mjs preflight --check \
  --python /Users/hutou/.local/bin/python3 \
  --tag dsh-m2-08-local-check-20261017-r3 \
  --source-sha 1b281ff6fefaf40b2e957cc31e4a8e5f853d0379 \
  --output-dir /tmp/m2-08-local-check-20261017-r3
```

退出码：`2`。

实际输出：

```text
DSH_PREFLIGHT_CHECK PASS node24=24.19.0:expected-24.19.0
DSH_PREFLIGHT_CHECK PASS pnpm=11.28.2
DSH_PREFLIGHT_CHECK PASS python314=/Users/hutou/.local/bin/python3:Python 3.14.8
DSH_PREFLIGHT_CHECK FAIL git-clean=dirty:1 files code=RELEASE_BLOCKED_DIRTY_WORKTREE
DSH_PREFLIGHT_CHECK PASS zstd=*** Zstandard CLI (64-bit) v1.5.7, by Yann Collet ***
DSH_PREFLIGHT_CHECK PASS upstream-sha=477b4f420553e8a52c2fbccc464d7561b239c443
DSH_PREFLIGHT_CHECK PASS profile-manifest=dsh-rc2:c8c9df8c36f11060ad8fbcce68cb2ebf28d783c5eb5759d1b71ff5463782c981
DSH_PREFLIGHT_CHECK FAIL plugin-packs=PROFILE_PACK_INPUTS_REQUIRED code=PREFLIGHT_PLUGIN_PACKS_INVALID
DSH_PREFLIGHT_CHECK FAIL runtime-bundle=missing code=RELEASE_UPSTREAM_RUNTIME_REQUIRED
DSH_PREFLIGHT_CHECK PASS evidence-dir=/Users/hutou/Desktop/ai-engineering/历史项目/fuqin-date/fuqing-crm-analytics/.context/release-evidence
DSH_PREFLIGHT_CHECK PASS output-dir=/tmp/m2-08-local-check-20261017-r3:create-on-release
DSH_PREFLIGHT_CHECK PASS service-compatibility=NOT_REQUIRED
DSH_PREFLIGHT_CHECK_BLOCKERS count=3 codes=RELEASE_BLOCKED_DIRTY_WORKTREE,PREFLIGHT_PLUGIN_PACKS_INVALID,RELEASE_UPSTREAM_RUNTIME_REQUIRED
DSH_PREFLIGHT_CHECK_STATUS BLOCKED code=RELEASE_BLOCKED_DIRTY_WORKTREE
EXIT_CODE=2
```

`/tmp/m2-08-local-check-20261017-r3` 在检查结束时没有生成候选输出文件；这证明 `--check` 在正式输入缺失时 fail closed，没有把本地检查伪装成 preflight 成功。
