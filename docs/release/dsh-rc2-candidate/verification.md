# rc2 候选验证记录（2026-09-26）

此文件取代早期候选的过时记录；旧 candidate7 资产保留但不再作为通过证据。

| 检查 | 命令 | 结果 | 证据/限制 |
|---|---|---|---|
| Release security contracts | `node@24 --test scripts/release/*.test.mjs` | PASS 18/18 | 隔离 synthetic tar/文件夹；覆盖 digest、payload、解包、trust fail-closed、token、side-by-side |
| DSH dev contracts | `DSH_DEV_UPSTREAM=... node@24 --test scripts/dsh-dev/*.test.mjs` | PASS 84，1 skip | skip 为 built-upstream native registry integration；未启动生产服务 |
| Shell | `bash -n deploy/wsl/*.sh`、`shellcheck deploy/wsl/*.sh` | PASS（此前实跑） | 不启动服务 |
| Python lint | `python3.14 -m ruff check`（受影响模块） | PASS | 未修改真实数据 |
| Diff/syntax | `git diff --check`、Node24 `--check`、JSON parse | PASS | 候选仍 dirty，尚未提交 |
| Artifact build/receive | 旧 `dsh-0.12.0.0-candidate7` | REJECTED / SUPERSEDED | 旧包不含当前安全修复，且不代表 reviewed clean commit；不得接收 |
| Doctor/verify | `node@24 scripts/dsh.mjs doctor|verify` | doctor PASS；verify 的 compat/SLI/backpressure 为 NOT_RUN | 未伪造 rc1/rc2 WAL、15 分钟 HTTP 或 10x 线上证据 |
| B0 | `B0_BUILD_UPSTREAM=... node@24 scripts/dsh-b0/pipeline.mjs --check --python ...` | FAIL | `duckdb` 与 requirements.lock 版本漂移；未安装依赖、未读取真实 DuckDB |
| WSL2/operator/UAT | 现场入口 | NOT_RUN/PARTIAL | 需要杭州事实、route/operator gate 和授权 |

本地候选 worktree 当前没有 DuckDB 或 WAL 文件；B0 的失败是 Python `duckdb` 包与锁文件版本漂移（期望 1.5.3，当前 1.5.5），未安装依赖，也未读取真实数据。

远端 GitHub push/tag/release、杭州重启/切换、Cloudflare route、旧版本清理均未执行。
