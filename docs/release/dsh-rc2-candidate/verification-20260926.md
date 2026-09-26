# rc2 候选验证记录（2026-09-26）

候选 worktree：`codex/dsh-rc2-candidate`；public main：`ba2f887b1ec55f26d7cb3849d327072140abbd95`；产品版本：`0.18.0.1`；DSH upstream：`477b4f420553e8a52c2fbccc464d7561b239c443`。

| 层级 | 命令 | 结果 | 证据/限制 |
|---|---|---|---|
| Allowlist enumeration | `node@24` `collectAllowlist` | PASS | 1634 files；scripts 122、deploy 12，包含 `package.json`、`pnpm-lock.yaml`、`scripts/dsh.mjs`；仍需 clean reviewed build |
| Release 安全单测 | `PATH=...node@24... /Users/hutou/homebrew/opt/node@24/bin/node --test scripts/release/*.test.mjs` | PASS（18/18） | 仅隔离文件夹与 synthetic tar；不等价于 GitHub/OIDC/WSL2 验收 |
| dsh-dev | `... DSH_DEV_UPSTREAM=... node@24 --test scripts/dsh-dev/*.test.mjs` | PASS（84，1 skip） | skip 为需要 built upstream 的 native registry integration；未启动生产服务 |
| B0 pipeline | `... B0_BUILD_UPSTREAM=... node@24 scripts/dsh-b0/pipeline.mjs --check --python /Users/hutou/homebrew/bin/python3.14` | FAIL | 在 Python lock 闭包检查处发现 `duckdb` 版本漂移；未安装依赖、未读取真实 DuckDB |
| 后端静态检查 | `python3.14 -m ruff check ...`（受影响模块） | PASS | 仅列出的受影响模块 |
| Git/语法 | `git diff --check`、Node24 `--check`、JSON parse | PASS | worktree 仍有候选未提交改动 |
| WSL2/Windows、GitHub trust、operator route、真实模型/业务 | — | NOT_RUN/PARTIAL | 需要现场环境与授权，不能由本地 synthetic 代替 |

本地候选 worktree 当前没有 DuckDB 或 WAL 文件；B0 的失败是 Python `duckdb` 包与锁文件版本漂移（期望 1.5.3，当前 1.5.5），未安装依赖，也未读取真实数据。

B0 失败不是通过信号；候选当前仍为 `RELEASE_BLOCKED`。此前生成的 candidate tar/evidence 保留为历史证据并标记 rejected/superseded，不作为发布资产。
