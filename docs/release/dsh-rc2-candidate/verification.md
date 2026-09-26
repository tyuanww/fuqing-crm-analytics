# rc2 候选验证记录（2026-09-27）

此文件取代早期候选的过时记录；旧 candidate7 资产保留但不再作为通过证据。

| 检查 | 命令 | 结果 | 证据/限制 |
|---|---|---|---|
| Release security contracts | `PATH=.../node@24/bin:$PATH pnpm dsh test` | PASS 52/52 | 隔离 synthetic tar/文件夹；覆盖 digest、payload、bounded unpack、traversal/duplicate/permission/link/secret fail-closed、trust/provenance gate、token、HTTP auth→backend adapter、side-by-side、compat/action/operator/CLI/evidence/UAT contracts |
| T3 auth contract | node@24 pnpm dsh test | PASS（auth 7 + HTTP adapter 3；aggregate 52/52） | token/session/CSRF/Cookie/redaction、隔离 backend bearer proxy 和 loopback HTTP synthetic evidence；browser/host NOT_RUN |
| T4 trust contract | node@24 pnpm dsh test + workflow YAML parse | PASS | protected tag/publication binding and negative states；GitHub protected settings/OIDC NOT_RUN |
| T5 state/reconcile | node@24 pnpm dsh test + pnpm dsh reconcile synthetic fixture | PASS | crash/resume, durable RECONCILE journal and stale-lock owner checks；remote CI/杭州 resume NOT_RUN |
| T6 promotion contract | node@24 pnpm dsh test + `bash -n deploy/wsl/*.sh` | PASS | owner/restart-dependency binding, mismatch guard and wrapper syntax；systemd/readiness/host NOT_RUN |
| T7 compatibility contract | node@24 pnpm dsh test | PASS | synthetic runtime/session/WAL-like fixture；real WAL/WSL2/ABI NOT_RUN |
| T8 action contract | node@24 pnpm dsh test | PASS | action_id/actor/idempotency/type-bound terminal receipt/conflict/unknown synthetic matrix；server/browser wiring NOT_RUN |
| T9 operator/capacity contract | node@24 pnpm dsh test | PASS | owned ephemeral probe, negative SHA and 100-request/10-concurrency scheduler fixture；route/15m/real HTTP backpressure NOT_RUN |
| T10 CLI/workflow contract | node@24 pnpm dsh test + `dsh --help|--version` | PASS | stable command/exit contract and config precedence synthetic evidence；cold checkout/TTHW/CI/Hangzhou NOT_RUN |
| T11 evidence/HTML policy contract | node@24 pnpm dsh test | PASS | canonical/redaction/schema/digest verifier and CSP/sandbox fail-closed matrix；public response/browser/retention NOT_RUN |
| T12 UAT/operations contract | node@24 pnpm dsh test | PASS | seven explicit groups, RACI, metrics ledger and cleanup receipt validator；现场 UAT/owner assignment/stable window NOT_RUN |
| DSH dev contracts | `DSH_DEV_UPSTREAM=... node@24 --test scripts/dsh-dev/*.test.mjs` | NOT_RUN | 当前候选 worktree 不含 `.context/dsh-b0/upstream`，未伪造 upstream 路径；历史结果保留在 `verification-20260926.md`，不作为本轮通过证据 |
| Shell | `bash -n deploy/wsl/*.sh`、`shellcheck deploy/wsl/*.sh` | PASS（此前实跑） | 不启动服务 |
| Python lint | `python3.14 -m ruff check`（受影响模块） | PASS | 未修改真实数据 |
| Diff/syntax | `git diff --check`、Node24 `--check`、JSON parse | PASS | 当前 candidate HEAD 的 clean 状态与 SHA 以 `STATUS.md` 和最终 artifact manifest 为准；auth HTTP adapter、stale-lock hardening 与证据文档已提交 |
| Artifact build/receive | 旧 `dsh-0.12.0.0-candidate7` | REJECTED / SUPERSEDED | 旧包不含当前安全修复，且不代表 reviewed clean commit；不得接收 |
| Current offline artifact | `pnpm dsh release --offline --tag dsh-0.18.0.1-goal-t3t12-final` + `pnpm dsh receive` | PASS | 最终 clean HEAD 上生成并接收；source SHA、entries 与 tarball SHA 以 `.context/release-evidence/dsh-0.18.0.1-goal-t3t12-final/release-manifest.v1.json` 为唯一来源；internal-only，未创建 draft/tag/release |
| Doctor/verify | `node@24 scripts/dsh.mjs doctor|verify` | doctor PASS；verify 的 compat/SLI/backpressure 为 NOT_RUN | 未伪造 rc1/rc2 WAL、15 分钟 HTTP 或 10x 线上证据 |
| B0 | `B0_BUILD_UPSTREAM=... node@24 scripts/dsh-b0/pipeline.mjs --check --python ...` | FAIL | `duckdb` 与 requirements.lock 版本漂移；未安装依赖、未读取真实 DuckDB |
| WSL2/operator/UAT | 现场入口 | NOT_RUN/PARTIAL | 需要杭州事实、route/operator gate 和授权 |

本地候选 worktree 当前没有 DuckDB 或 WAL 文件；B0 的失败是 Python `duckdb` 包与锁文件版本漂移（期望 1.5.3，当前 1.5.5），未安装依赖，也未读取真实数据。

远端 GitHub push/tag/release、杭州重启/切换、Cloudflare route、旧版本清理均未执行。
