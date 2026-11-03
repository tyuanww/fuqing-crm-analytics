# 后端 fast lane

`fast` 是一条**新增的**、显式文件清单驱动的快速回归通道；它不改变 PR CI 与周度全量
（`scripts/run_backend_tests_bounded.py`）的选择。未列入清单的测试仍由 full lane 执行。

## 入口

```bash
# 运行 fast lane（默认硬预算 300s）
python3 scripts/ci/run_backend_fast_lane.py

# 查看当前选中的文件
python3 scripts/ci/run_backend_fast_lane.py --list-files

# 需要证据时落 summary.json
python3 scripts/ci/run_backend_fast_lane.py --report-dir .context/checks/fast-lane
```

- 清单：`scripts/ci/fast_lane_files.txt`（一行一个 `backend/.../test_*.py`，禁止 nodeid）。
- Runner 会校验每个路径存在、位于 full lane 范围内，然后以隔离环境启动 pytest：
  丢弃 `FQ_TEST_ARCHIVE_DB` 等父进程变量，`-m "not slow"`，并套用
  `scripts/ci/pytest_c_class_deselects.txt` 的 7 条 deselect。
- full lane：`scripts/run_backend_tests_bounded.py`，本次未改。

## 当前规模（基线 7431ac1a，Python 3.14.8）

| 口径 | 文件 | 测试数 |
| --- | ---: | ---: |
| `pytest --collect-only -q`（testpaths=`backend/tests`） | 324 | 4209 |
| full runner 范围（+2 个 nested competition 文件） | 326 | 4224 |
| 所有 backend 测试模块（含未进 full 的 contracts 目录） | 328 | 4263 |
| **fast lane** | **46** | **520** |
| full lane 实跑（扣除 64 条 `slow` 与 7 条 C-class deselect） | — | 4153 |

任务简述中的 4251 在本工作树/基线未复现；以上是实测 collection 数。本次改动前后
`pytest --collect-only -q` 均为 4209，fast 清单不改变任何测试的收集结果。

fast lane 实测：`520 passed`（多次跑批 4.4–5.2s），runner 墙钟约 **5–6s**，峰值 RSS 约 **0.23 GB**。
本次没有跑 20 分钟全量；4153 是 collection 扣除 `slow`/deselect 的计算值，不是全量计时。

## 选择规则

1. 文件必须是 full lane 的子集，且在基线通过。
2. 通过一次带运行时审计的跑批确认该文件的用例**没有**执行：DuckDB 连接、HTTP/TestClient
   调用、subprocess/线程启动、SQLite/RunStore 写入、页面/看板保存。
3. 不选仓库策略类测试：`.github` workflow、hooks、CHANGELOG/STATUS/docs 断言、部署
   plist、源码 pattern lint。它们与产品合同无关，且会因文档改动误报。
4. 只使用显式 allowlist，**不**做 `@pytest.mark.fast` 批量打标：夹具/服务实现变化时，
   自动 marker 会把集成测试悄悄带进 fast lane。

因此 fast 覆盖的是纯合同、Pydantic schema、纯函数、语义计算和 tmp 目录内的无状态
单元测试；例如 `test_calculations.py`、`test_filters.py`、`test_segments.py`、
`test_contract_ratio_audit*.py`、`test_analytics_query_contracts.py`。

## 仍只在 full lane 的测试

以下 3633 条（4153 − 520）继续由 bounded full runner 覆盖，fast 不声称覆盖它们：

- DuckDB 或 DuckDB-in-memory 语义路径（如 `test_competition_computed_results.py`、
  warehouse/RFM 系列、`backend/semantic/crm_metrics_*` 的 synthetic 查询）。
- HTTP/TestClient、页面/看板文档保存、RunStore/SQLite 持久化
  （如 `test_page_documents.py`、`test_board_documents.py`、
  `test_analytics_first_purchase_save_api.py`、cockpit 系列）。
- subprocess/worker/服务生命周期/ETL 子进程（如 `test_analytics_worker.py`、
  `test_service_target_preflight.py`、`test_first_purchase_packed_*`）。
- 仓库策略、CI workflow、hooks、CHANGELOG/STATUS/docs、部署产物检查。
- 自动 `slow` 的 64 条测试与 7 条 C-class deselect，行为与改动前完全一致。

## 风险与已知边界

- **不修复既有红灯**：基线上
  `backend/tests/test_project_hygiene_ignore.py::test_status_is_short_with_history_archive`
  已失败（`STATUS.md` 81 行 > 断言上限 80）。该文件属于仓库策略类，未加入 fast；
  full lane 仍会运行并保持原失败，未被 skip/xfail 或改断言。fast 的"绿"只代表它选中的
  纯单元子集，不代表全量通过。
- fast 是子集，不能替代 full；PR CI/nightly 仍以 bounded runner 为准。
- 清单可能随文件重命名腐烂：runner 对无效/越界/重复路径直接报错，不会静默少跑。
- 新增文件前应按上面的运行时审计口径复核，并确认整条 lane 仍绿且低于 300s。
