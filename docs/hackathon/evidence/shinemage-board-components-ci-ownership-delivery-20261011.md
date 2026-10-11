# board-components 作者覆盖回执 Git/CI 交付（2026-10-11）

五路径已按用户授权应用到原领域作者仓，并正常提交、推送。新提交 `e78e040e14792c89f99a2e3181004dbdaefd9bf6`，父提交 `d5aacdb464ff35b5dbb1aa46bf89717b31f131d0`，信息为 `test(board-components): record actual owner coverage and sealed inputs`。只含两个测试入口、CI workflow、README 和 DEVELOPMENT；原作者工作区干净。现有 [PR #1](https://github.com/tyuanww/shinemage-board-components/pull/1) 仍 OPEN；远端 main 仍为 `3855db80`，没有合并、发布或部署。

## 当前提交的实际 CI

[Ubuntu PR CI 38121126913](https://github.com/tyuanww/shinemage-board-components/actions/runs/38121126913) attempt 1，head 为上述新 SHA，run 和 job 均 SUCCESS。对应 push CI `38121124144` 也成功，仅作远端状态记录；不累计两条运行的测试数。Node 24.19.0、Python 3.14.4、pnpm 11.28.2。

| 本次 PR CI 的实际命令 | 结果 |
|---|---|
| `python scripts/ci/preparation-guards.test.py` | 4 tests，OK |
| `node --test scripts/run-author-tests.test.mjs` | 5 PASS / 0 FAIL / 0 SKIP |
| `node scripts/run-author-tests.mjs "$DOMAIN_EVIDENCE"`：geometry | 28 PASS / 0 FAIL / 0 SKIP |
| 同一入口：producer-inputs | 6 PASS / 0 FAIL / 0 SKIP |
| 固定输入检查、领域 build 与包核对 | exit 0 |

分组分别记账；未重跑本机相同配方、旧完整 B0、headed 或 WSL2。没有独立 tsc，状态仍是 `NOT_IN_CURRENT_BUILD`。upload-artifact 的 Node 20 弃用/强制 Node 24 warning 留在原日志中，未改固定 action。

## 下载对象及字节绑定

实际 artifact `11694947955`，名 `board-components-ci-evidence-38121126913-1`。ZIP 11356 字节，SHA-256 `5207d0adac1a449fe1be36913d0d8214c1f4d8ecc3e137f7368bd27e6c4f28ee`，与 GitHub artifact API digest 相等。有限成员、路径与文件类型检查后解出，未执行归档内容。

`author-tests.json` 8419 字节，SHA-256 `25b59ea139528ea165243f3375b9671d578bd2bee4d4b1757f030122e26aed0d`，scope 为 `AUTHOR_TESTS`、source_clean=true；30 个来源文件全部与精确提交的 Git blob 和当前干净作者仓核对一致。两个分组的真实命令、3 个测试文件摘要、4 份原始 TAP/stdout/stderr 日志及计数均复核。run_id、attempt、repository、Linux x64 和 Node pin 相符。job 内的 `workflow_conclusion` / `remote_ci` 保留 `NOT_VERIFIED_BY_JOB`，成功状态由独立 GitHub run/jobs API 确认，未重写 job 回执。

artifact 同时留存两份不同归档：

| 对象 | 字节数 | SHA-256 | 作用 |
|---|---:|---|---|
| 原封存 reference | 1955 | `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182` | 现有消费者锁定的固定输入，与提交内 reference 同字节 |
| 本次 Ubuntu build content pack | 1951 | `66d53381095e93f38dbaa7385780f20b677f68ca2692702cb270849f3392853e` | 本次实际构建对象 |

五个成员名称与字节相等，四个 JS/声明成员也与当前领域源文件相等。外层归档摘要不同，不互换、不放宽原消费者锁。领域库不是 DSH 插件，普通内容包不记为 `dsh-plugin-pack/v1` 或 candidate。

## 原始材料与边界

本次原始目录：`/Users/hutou/.codex/tasks/shinemage-domain-ci-ownership-proposal-20261011-2a8b1o72/`。其中 `authorized-git-delivery-r1.json`、`author-commit-r1.json`、`remote-ci-{run,jobs,artifacts}-r1.json`、`remote-ci-log-r1.stdout`、`remote-ci-artifact-r1.zip`、解出的同名目录、`verify-actual-ci-r1.py` 和 `actual-ci-ownership-delivery-r1.json` 支持本页结论。机器记录见[validation JSON](./shinemage-board-components-ci-ownership-delivery-20261011-validation.json)。

[五路径隔离提案](./shinemage-board-components-ci-ownership-proposal-20261011.md)的 LOCAL_PROPOSAL、r2 失败和[source d5 的上一轮 CI](./shinemage-board-components-remote-ci-20261011.md)保留原时点；不改写为本次 e78e 结果。

主仓 HEAD `5390667c`、index 空、VERSION 0.20.0.0，产品、输入锁、正式包、profile、candidate 和 journal 没有因本次交付改变。主仓仍执行旧领域生产者及若干源码合同；领域入口切换、新完整 B0、主仓 CI、当前组合准入与真实业务仍未完成。产品 PARTIAL，SDK 分发 BLOCKED，release_ready=false。
