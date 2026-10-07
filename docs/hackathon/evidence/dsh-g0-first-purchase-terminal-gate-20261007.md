# 首购 Host 终态恢复回执接线（2026-10-07）

**同一候选的封存终态恢复观察已接入 journal seq 5；整体仍 PARTIAL / release_ready=false。** 本轮从干净 `25d9c53c` 继续，只实现和验证本地回执校验器，没有重新运行杭州 Host、访问真实 DuckDB、构建业务包或切换生产。

## 身份与交付边界

- 原候选 `a490457c3e867b3fb0d03fa8daeb04886f7b8657da0b1cf2fbadb30917e7887c`；插件来源 `3ffbd2a2`，查询/保存来源 `f9726f68`，官方 DSH `0.1.7-rc.2 / 477b4f42`，全部包字节保持。
- 现场运行事实归属[上一阶段的固定候选证据](dsh-g0-first-purchase-terminal-candidate-20261007.md)，本轮是重新校验其原始输出并记账，不把它算作新现场运行。
- 新封套 `dsh-terminal-host-evidence/v1` 继续走 `pnpm dsh plugin verify-host`；`inputs/controller/inventory/runtime_archive` 使用相对路径和摘要，`service_target_event` 绑定同候选的服务目标 seq 4。
- 新增 `CANDIDATE_TERMINAL_HOST_OBSERVED`，保持旧本机、HTTP、browser 的 schema 和来源规则；不把恢复观察冒充旧事件或生产授权。

## 校验合同

固定控制器映射覆盖实际归档源码，以已审查 `25d9c53c` 校验；base 元数据仍保留执行时的 `3ffbd2a2`。历史 `source-target-evidence.mjs` 还有一个执行时的精确摘要例外 `97f84025…`，该文件是未执行的 HTTP 校验器旧快照；不能由调用方指定例外或浮动到当前源码。历史 runner 原字节 SHA 为 `bc1b021a1b7a689e717f4fa77ae016283ff46fe0a934c60c9878aecdfb70b75f`，在 `test-fixtures/terminal-target-20261007.py.txt` 保存作摘要夹具，校验器和测试均不执行它。

共享原有安全解包、流式 runtime 摘要、插件安装文件清单、查询/保存 archive 与 wheel 校验。terminal 明确使用服务 binding SHA，旧 HTTP/browser 默认仍使用原同 SHA 合同。恢复部分另核对：

1. HTTP 23 项、恢复 2 项完整，三个宿主 PID 不同；被杀进程与恢复进程关联，信号为 SIGKILL，恢复后要求 CRM 重新登录。
2. committed/recovered 的 session/preset、连续事件序号、持久前缀摘要和已有摘要文本一致，开放回合收敛到 step/end、turn/end、session/end-seed。
3. 中断 run 为 FAILED、runtime EXITED、EXECUTION_UNKNOWN、活动名额释放、无结果、派发一次；UNKNOWN、仍 active、重复派发和伪成功均拒绝。
4. 原生无业务工具的 fallback、独立服务离线保存重放、一个查询 worker/一条分析和自有进程清理观察一致。
5. 原始 input/controller/结果清单、控制器安装与 pytest 输出一致；失败、跳过、错误和 PASS 并列时拒绝。所有校验完成前不写 journal。

这些是固定控制器的未签名操作者观察。session 文件正文/WAL 不在此命令中重新回放，远端 installed tree 和监听状态也不重新探测；结果明确为 `UNATTESTED_OPERATOR_OBSERVATION`。

## 本轮实际验证

证据根 `.context/checks/terminal-host-gate-20261007/`，以下记为 OUT。

| 命令 / 操作 | 实际结果 | OUT 证据 |
|---|---|---|
| `node --test scripts/release/terminal-host-evidence.test.mjs` 初轮 | 35 PASS；后续补 admission/未知 run 字段负测，最终共 37 项纳入完整 suite | `tests-r1.log` |
| `node --test scripts/release/*.test.mjs` 最终 | **391 PASS / 0 SKIP / 0 FAIL，65.51 秒**；包含新门禁 37，不重复相加 | `release-tests-final.log` |
| 当前 CLI + 原始回执，在 journal 副本上预验 | 首次 HTTP schema 失败；修复后 PASS / seq 5 | `actual-dry-run-r1.log`、`actual-dry-run-r2.log` |
| 当前 CLI + 原 candidate/journal | **WSL_SYNTHETIC_TERMINAL_HOST_OBSERVED / seq 5** | `verify-host.stdout` |
| 同命令重试 | 输出相同，journal 字节/大小/mtime 不变，前四事件保持 | `verify-host-retry.stdout`、`actual-verification.json` |
| 实际回执使用错误 parent digest | 退出 2 / PLUGIN_HOST_TERMINAL_PARENT，原 journal 不写入 | `wrong-parent.stderr` |
| 原候选与现场输入保护 | 619 个文件字节/大小/mtime 保持；旧候选 journal 不变；新 journal 只追加本轮事件 | `protected-before-final.json`、`journal-seq4.json`、`actual-verification.json` |

实际接线复用同一入口：

```sh
BASE="$PWD/.context/checks/first-purchase-terminal-candidate-20261007"
OUT="$PWD/.context/checks/terminal-host-gate-20261007"
node scripts/dsh.mjs plugin verify-host \
  --candidate "$BASE/plugin-candidate/candidate.json" \
  --evidence "$OUT/evidence/envelope.json" \
  --state-path "$BASE/plugin-state.json"
```

新事件 digest `cc5a043969492736aae4cedec6698271785fecf7248849e2b40f9818e2ea9b03`，引用原服务目标 seq 4。观测为 FAILED/EXECUTION_UNKNOWN、execution_active=false、dispatch_attempts=1、50 条持久前缀保持。这里只是被中断任务收敛到失败终态，不表示任务计算成功。

封套使用新的私有目录保存 349 个原密封输入和 227 个原取回文件，逐字节核对后复制；runtime 使用已有固定本机 archive，仅重新读取摘要。原 input/receipt/controller 不改写，没有下载或伪造新 PASS。

## 失败调查与开放项

首次真实预验返回 `PLUGIN_HOST_TERMINAL_HTTP`：最小单测夹具遗漏了真实回执的 `admission` 字段。核对固定 `first-purchase-crm-host.probe.mjs` 后，补充精确值 `official commands/execute HTTP; browser rendering NOT_RUN` 和浏览器冒充负测；没有修改原回执或放宽为接受任意多余字段。随后补齐中断 run/diagnostics 的精确字段合同和未知字段拒绝。

本批源码、测试与文档经 OCR delegate 审核后随本次本地提交交付；未 push。只关闭 T2/T7 的终态回执接线子项；新候选浏览器、完整跨版本 corpus、真实身份/模型/UAT、签名/SBOM、生产 activation/canary/rollback 和 G0 stop/go 仍开放，物理分仓未因这个观察事件自动放行。

## 提交前审查

使用 `open-code-review-delegate`：OCR 确定工作区文件与规则，宿主 Agent 审查代码，没有调用外部模型。审查目录 `.context/checks/terminal-gate-review-20261007/` 保存 `preview.json`、`rules.json` 和逐文件 `review.json`。8 个执行代码文件、1 个历史 runner 文本夹具全部审核，另手工核对 7 个文档；总计 16/16，0 跳过，覆盖率 100%。发现并修复一项 CI 阻断：历史 runner 用 `.py` 保存会被 `scripts/ci/run_checks.py` 选入 Ruff，复现 E401/E702。改为 `.py.txt` 摘要夹具并更新消费测试，原字节和 SHA 完全保持。另修复 CHANGELOG 仍写 journal 待接入的过期描述。历史 runner 仅作为原字节摘要夹具保存，不执行或改写。

本次提交前实际重跑 `node --test scripts/release/*.test.mjs`：**391 PASS / 0 SKIP / 0 FAIL，37.24 秒**，日志 `terminal-gate-review-20261007/release-tests.log`。同一真实封套 CLI 重试仍为 seq 5，journal 字节/大小/mtime 不变，619 个保护文件保持；语法与 `git diff --check` 通过，详见同目录 `validation.json`。未把上一阶段耗时或通过结果代替本次执行。

历史 runner 改存文本后，实际重新执行终态门禁 **37 PASS / 0 SKIP / 0 FAIL，10.00 秒**（`terminal-tests-final.log`），确认消费路径和原摘要仍可用。`ci-plan.json` 保留当前共享选择结果；本轮未执行远端 CI 或完整后端/B0 构建，不以 release suite 代替那些层级。
