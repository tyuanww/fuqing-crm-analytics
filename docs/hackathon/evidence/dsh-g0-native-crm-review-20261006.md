# CRM 原生查询归属复审

2026-10-06，`codex/plugin-boundary-review`；审查对象 `9d1a9acf`，起点工作树干净。按用户要求使用 OCR delegate，当前 Agent 自审，没有调用外部模型。

## 覆盖与修复

`ocr delegate preview --format json --commit 9d1a9acf` 选择 17 个文件；另补审被默认排除的 12 个文档、测试和生成件。已核对该提交全部 29 个文件、相关调用方和[上一阶段证据](dsh-g0-native-crm-owner-20261006.md)：`total_files=29`、`reviewed_files=29`、`skipped_files=0`、`coverage_rate=100%`。逐文件摘要、OCR 规则与结果在 `.context/checks/first-purchase-native-crm-review-20261006/{preview,rules,review}.json`。

确认并修复一项 High：调度器已经取得有效 Host 运行观察，但随后身份服务短暂 503，会落入通用 Host 错误分支；若第二次身份解析恢复，原 RUNNING 被写成 UNKNOWN。这既误报执行状态，也可能令活动 worker 按已有 UNKNOWN 规则停止。

修复将身份暂不可用与持久化故障都交回外层暂停处理，保留原状态与 intent；诊断分别为 `IDENTITY_UNAVAILABLE` / `STATE_UNAVAILABLE`，不记录身份、凭据或异常原文。新增真实 SQLite 负测先失败（`running-outage-before.log`），修复后证明状态不变、恢复沿用同一 intent、只派发一次、没有 UNKNOWN/CANCELLING 事件。既有真实 Host 不可用、撤权、取消和退出证明规则仍受回归覆盖。

## 本次实跑

所有日志在上述本轮目录，没有将旧 294 项结果算成本次通过。

| 验证 | 结果 |
|---|---|
| 修复前五文件后端回归 | 80 PASS，随后新增负测明确失败 |
| 修复后七文件后端回归 | **94 PASS**，1 warning，0 skip；`backend-fixed.log` |
| 身份观察和 CRM relay Node 测试 | **15 PASS**，0 skip；`node.log` |
| 离线 OpenAPI/TypeScript、CRM 合同副本、边界 inventory | PASS；11 包、630 源文件、31 跨包引用 |
| 修改 Python 的 Ruff、`git diff --check` | PASS |

本次使用 Node24 和既有 `/tmp/dsh-b0-python.qW3lHO/venv/bin/python`。具体主要命令：

```sh
python -m pytest --noconftest -q -W error::ResourceWarning \
  backend/tests/test_analytics_first_purchase_native_identity.py \
  backend/tests/test_analytics_first_purchase_native_crm_http.py \
  backend/tests/test_analytics_first_purchase_native.py \
  backend/tests/test_analytics_native_runtime.py backend/tests/test_analytics_worker.py \
  backend/tests/test_analytics_query_runtime.py backend/tests/test_analytics_query_native_fault.py
node --test dsh-plugins/analytics-workbench/test/first-purchase-native-identity.test.mjs \
  dsh-plugins/crm-knowledge/test/first-purchase-relay.test.mjs
node scripts/dsh-b0/first-purchase-analysis-contract.mjs --check --python /tmp/dsh-b0-python.qW3lHO/venv/bin/python
node scripts/crm-calibration/generate_types.mjs --check
node scripts/dsh-b0/plugin-boundaries.mjs --check
```

## 接续边界

本次确认缺陷已修复；产品仍 PARTIAL。下一步为固定官方 DSH 的 CRM 登录/admission/查询/保存链：不能放宽旧 B0 gateway 的整个权限门禁，也不能将受控 Host 接收器说成官方宿主或浏览器验收。实际宿主 Cookie/Origin、重启后重新登录、浏览器、新 clean candidate 和目标环境仍需独立证据。没有 push、生产切换、真实模型或业务数据访问。
