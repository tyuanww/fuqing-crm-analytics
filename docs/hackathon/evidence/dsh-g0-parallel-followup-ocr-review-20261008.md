# 前两组续推的 OCR delegate 审核与修复（2026-10-08）

**对提交 `1dae6de7e58d0fac1021f0631dec916224a79189` 的本批改动完成审查，3 项确认问题已修复；当前定向验证通过，产品仍 PARTIAL、SDK 分发 BLOCKED、`release_ready=false`。** 本次只修改隔离服务验收器及其回归、范围说明，不改变业务服务包、插件运行合同、固定 DSH 或生产环境。

## 审核范围与方法

实际工作树为 `/Users/hutou/.codex/worktrees/plugin-boundary-review/fuqing-crm-analytics`，分支 `codex/plugin-boundary-review`；开始时 HEAD 为上述提交，工作树与暂存区均干净。读取当前 AGENTS、STATUS、相关计划/TODO与验证入口；本工作树没有 CodeGraph 索引。

本次实际执行：

```sh
ocr delegate preview --format json --commit 1dae6de7e58d0fac1021f0631dec916224a79189
ocr delegate rule --format json <preview 返回的14个代码路径>
```

OCR 为 `v1.12.11 (a758d9cb)`，只负责确定范围与规则；由当前宿主执行审查，没有调用外部模型接口。按仓库 commit 前的 /review 核心清单补查路径、信号竞态、工具执行边界与文档一致性，范围限定在本批提交与维修；不声称完整长期分支、PR、跨模型或 release gate 通过。

| 覆盖项 | 实际结果 |
|---|---|
| Git 变更 | 31 个文件 |
| OCR reviewable | 14/14 reviewed，0 skipped，coverage 100% |
| OCR 排除 | 17 个：unsupported_ext / default_path；原排除原因保留 |
| 额外人工核对 | 17/17：后端测试全文、文档相关事实/命令/证据范围、4份固定 JSON 的来源与字节 |
| 总计 | `total_files=31, reviewed_files=31, skipped_files=0, coverage_rate=100%` |

每个 `(path,status)`、规则、核对说明与结构化 findings 位于本地证据 `review-report.json`。大份 OpenAPI 是固定原字节副本：当前 owner、provenance 的源 commit 和本包副本全部逐字节相同，不作为2,347行新业务实现重写审查。独立包测试只证明固定合同 conformance，不替代当前后端生成验证。

## 已确认并修复的3项问题

1. **P2 / security：输出父目录别名可以写进已验证输入。** 原 `main` 只以词法 `args.output.is_relative_to(args.input)` 判断嵌套。隔离真实 CLI 中，外部 alias 指向 synthetic input，随后创建了 `result/tmp`、`cleanup.json` 和 `install-result.json`。原输入快照实际变化，失败保存在 `original-path-regression.json`；没有使用业务数据或向仓库输入注入错误。修复为规范化 input/output 后拒绝双向重叠，检查与写入使用同一规范输出路径。

2. **P2 / bug：安装闭包尚未全部核对即执行服务。** 原 `http` 仅核对 app 启动前清单，venv 到执行后才比较；metrics 已启动时 knowledge 的 app 还未检查。两个隔离负测分别复现依赖改变和第二个 app 改变仍进入 start。修复为先检查两个 app/venv 的完整清单及只读条件，全部通过后才进入启动循环。测试的只读 flags 是明确标注的 pre-start 单元夹具，不伪称实际 mount 或 WSL HTTP 运行。

3. **P2 / bug：进程退出竞态中断其余自有进程清理。** 原 `poll → killpg` 之间进程组退出时，真实 `ProcessLookupError` 从 cleanup 列表推导抛出，后续 owned 进程未被处理。受控真实子进程交错已复现；测试 finally 回收了自己的所有进程。修复仅容忍 TERM/KILL 阶段“组已不存在”这一精确异常，仍 wait/reap，再继续其他 owned 进程；不吞掉其他权限/系统错误。补充覆盖顽固进程在 KILL 前退出。

主 Agent 已验证4组原始失败和当前修复结果，日志/XML保留；3项问题均有具体代码、隔离复现与测试。没有把新增8个参数场景全部宣称为8个原始失败。

## 本次真实验证

Node `24.19.0`、Python `3.14.4`；Node 阶段使用独立 HOME/TMP、最小环境、固定 received-r3 SDK/Corepack，关闭 Corepack 网络并使用原领域输入。未重新 prepare SDK 或覆盖原包。

| 命令/范围 | 当前结果 | 本次证据 |
|---|---|---|
| `python scripts/run_backend_tests_bounded.py backend/tests/test_crm_services_target.py --timeout-seconds 60` | 20 PASS / 0 FAIL / 0 SKIP；5.50s pytest | `repaired-observer/summary.json`及组日志/XML |
| `node --test scripts/dsh-b0/package-inputs.test.mjs` | 12 PASS / 0 FAIL / 0 SKIP；真实 frozen 离线安装、字节/链接/输入负测 | `package-inputs.log` |
| `node --test scripts/dsh-b0/plugin-boundaries.test.mjs` | 12 PASS / 0 FAIL / 0 SKIP | `boundaries-tests.log` |
| workbench 的 frozen-contract / bridge / schema / source-index 四文件测试 | 25 PASS / 0 FAIL / 0 SKIP | `workbench-contracts.log` |
| `node scripts/dsh-b0/plugin-boundaries.mjs --check` | PASS；11 packages / 30 edges / 648 source files；74 dynamic 项仍仅 test | `boundaries-check.log` |
| `python -m ruff check scripts/crm-calibration/crm-services-target.py backend/tests/test_crm_services_target.py` | PASS | 当前静态核对记录 |
| 三份 fixture 的当前与固定 owner / 摘要 | 全部相同 | `fixture-owner-check.json` |
| `git diff --check`、本次 Markdown 引用及正常提交 hooks | 以当前交付终检记录为准 | `delivery-check.json`、`commit.log` |

本次原始负测证据为 `original-regressions/`、`original-venv/`、`original-app-order/`、`original-exit-race/`；不覆盖失败。Node 的4条真实命令均退出0，临时汇总器最初只识别 TAP，误将 Node24 的 spec `ℹ pass` 输出标成失败；保留 `node-validation.json`，从同次原始日志重新解析为 `node-validation-corrected.json`，附原日志 SHA。没有为汇总器格式错误重复跑已通过套件。审计元数据初稿错误地读取根 `toolchain.json`，失败另存 `setup-failure.json`，改为实际 pin owner `dsh-plugins/plugin-kit/toolchain.json`；该错误未改源码或固定输入。

完整本地证据根为 `.context/checks/ocr-first-two-groups-20261008-r1/`；机器清单、原失败、当前通过、输入保护和最终提交结果分别保留。

## 架构、现场证据与剩余边界

官方 DSH 仍为 `0.1.7-rc.2 / 477b4f420553e8a52c2fbccc464d7561b239c443`，VERSION 仍 `0.20.0.0`。kit 仍仅用于开发，插件运行包与领域服务保持独立。陈旧/过期阈值不回到当前任务；此修复没有将数据库、知识服务或完整 DSH 维护加入每次插件更新。

[前次 WSL 报告](dsh-g0-crm-services-target-20261008.md)的2/2冷安装、15/15 HTTP仅证明封存的 `865025…` 实际 runner 与那次固定包。此次修改了路径、启动前核验和清理行为，不再与该 runner AST 等价。**本次修复后 runner 的 WSL 运行为 NOT_RUN**，没有改写历史远端摘要、包或现场日志；原始执行事实保留，不升级为新版 runner 的现场通过。本轮没有重新运行正式 workbench 构建、十消费者或完整 B0/release：相应实现未改变，前次结果只作历史上下文。

当前审核范围内未关闭代码缺陷为0。SDK上游依赖公告/发布者身份/完整组成与撤销、未覆盖宿主/UI/真实身份/生产形状、生产 receive/reconcile/canary/回退及 stop/go 后物理分仓仍按已有队列；本次没有重新查询官方发布状态，不把前次公开查询称为本轮实时结果。未 push/tag/Release、连接或切换杭州服务、读取真实库、改旧 candidate/journal 或删除资产。
