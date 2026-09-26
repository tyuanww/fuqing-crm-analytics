# rc2 候选验证记录（2026-09-26）

此文件取代早期候选的过时记录；旧 candidate7 资产保留但不再作为通过证据。

| 检查 | 命令 | 结果 | 证据/限制 |
|---|---|---|---|
| Release security contracts | `PATH=.../node@24/bin:$PATH pnpm dsh test` | PASS 44/44 | 隔离 synthetic tar/文件夹；覆盖 digest、payload、bounded unpack、traversal/duplicate/permission/link/secret fail-closed、trust、token、side-by-side、compat/action/operator/CLI/evidence/UAT contracts |
| T3 auth contract | node@24 pnpm dsh test | PASS（auth 7 tests；aggregate 44/44） | token/session/CSRF/Cookie/redaction synthetic evidence；browser/host NOT_RUN |
| T4 trust contract | node@24 pnpm dsh test + workflow YAML parse | PASS | protected tag/publication binding and negative states；GitHub protected settings/OIDC NOT_RUN |
| T5 state/reconcile | node@24 pnpm dsh test + pnpm dsh reconcile synthetic fixture | PASS | crash/resume and durable RECONCILE journal；remote CI/杭州 resume NOT_RUN |
| T6 promotion contract | node@24 pnpm dsh test | PASS | owner/restart-dependency binding and mismatch guard；systemd/readiness/host NOT_RUN |
| T7 compatibility contract | node@24 pnpm dsh test | PASS | synthetic runtime/session/WAL-like fixture；real WAL/WSL2/ABI NOT_RUN |
| T8 action contract | node@24 pnpm dsh test | PASS | action_id/terminal receipt/conflict/unknown synthetic matrix；server/browser wiring NOT_RUN |
| T9 operator/capacity contract | node@24 pnpm dsh test | PASS | owned ephemeral probe, negative SHA and 10x scheduler fixture；route/15m/real backpressure NOT_RUN |
| T10 CLI/workflow contract | node@24 pnpm dsh test + `dsh --help|--version` | PASS | stable command/exit contract and config precedence synthetic evidence；cold checkout/TTHW/CI/Hangzhou NOT_RUN |
| T11 evidence/HTML policy contract | node@24 pnpm dsh test | PASS | canonical/redaction/schema/digest verifier and CSP/sandbox fail-closed matrix；public response/browser/retention NOT_RUN |
| T12 UAT/operations contract | node@24 pnpm dsh test | PASS | seven explicit groups, RACI, metrics ledger and cleanup receipt validator；现场 UAT/owner assignment/stable window NOT_RUN |
| DSH dev contracts | `DSH_DEV_UPSTREAM=... node@24 --test scripts/dsh-dev/*.test.mjs` | PASS 84，1 skip | skip 为 built-upstream native registry integration；未启动生产服务 |
| Shell | `bash -n deploy/wsl/*.sh`、`shellcheck deploy/wsl/*.sh` | PASS（此前实跑） | 不启动服务 |
| Python lint | `python3.14 -m ruff check`（受影响模块） | PASS | 未修改真实数据 |
| Diff/syntax | `git diff --check`、Node24 `--check`、JSON parse | PASS | T2 implementation commit `81f8cf3a` clean；本次文档证据更新随当前提交收口 |
| Artifact build/receive | 旧 `dsh-0.12.0.0-candidate7` | REJECTED / SUPERSEDED | 旧包不含当前安全修复，且不代表 reviewed clean commit；不得接收 |
| Current offline artifact | `pnpm dsh release --offline --tag dsh-0.18.0.1-t12-candidate` + `pnpm dsh receive` | PASS | clean commit `b8d2863d` (`b8d2863dd8065bafe87cdee1a72fccd81b62edb4`)；1682 entries；tarball SHA `017aa667795c375e3688241d1b14536e2c2325b60e02e1f3f977e0c76cc11028`；internal-only，未创建 draft/tag/release |
| Doctor/verify | `node@24 scripts/dsh.mjs doctor|verify` | doctor PASS；verify 的 compat/SLI/backpressure 为 NOT_RUN | 未伪造 rc1/rc2 WAL、15 分钟 HTTP 或 10x 线上证据 |
| B0 | `B0_BUILD_UPSTREAM=... node@24 scripts/dsh-b0/pipeline.mjs --check --python ...` | FAIL | `duckdb` 与 requirements.lock 版本漂移；未安装依赖、未读取真实 DuckDB |
| WSL2/operator/UAT | 现场入口 | NOT_RUN/PARTIAL | 需要杭州事实、route/operator gate 和授权 |

本地候选 worktree 当前没有 DuckDB 或 WAL 文件；B0 的失败是 Python `duckdb` 包与锁文件版本漂移（期望 1.5.3，当前 1.5.5），未安装依赖，也未读取真实数据。

远端 GitHub push/tag/release、杭州重启/切换、Cloudflare route、旧版本清理均未执行。
