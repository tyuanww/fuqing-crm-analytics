# DSH 单链路业务边界盘查

日期：2026-10-22（北京时间）。

## 结论

这条链路已经在两个层面跑通。

- 杭州现役 side-load 已完成新会话检索 WeKnora、CRM 只读查询、RFM 预热快照、HTML 生成、驾驶舱保存和一次真实编辑。
- 当前分支源码已经补齐 HTML 结果绑定 manifest 的生成、传递、保存和回读，并通过本地固定工具链回归。

两层不能混写。`58045416` 之后生成的 Workbench 候选尚未切换到杭州现役 DSH，因此现役页面的旧 `UNBOUND_SAMPLE` 记录仍是有效的历史现场事实。当前不宣称线上已使用这次源码修复。

## 单链路结果

| 链路 | 当前结论 | 证据 |
|---|---|---|
| 新会话知识库问答 | `VERIFIED`。问数智能体检索 WeKnora 项目库并返回 3 个引用来源。 | [真实链路复核](dsh-live-chain-20261022.md) |
| 对话诊断与 CRM 数据 | `VERIFIED`。全店 GSV 快照、15 个商品新老客结果和 RFM 结果均来自杭州 CRM 只读接口。 | [真实链路复核](dsh-live-chain-20261022.md) |
| 单品一致性 | `VERIFIED`。`爆款面膜F` 的 GSV `105525.8`、用户 `770`、新客 `358`、老客 `412` 与全商品结果逐项一致。 | [真实链路复核](dsh-live-chain-20261022.md) |
| RFM 筛选与预热 | `VERIFIED`。返回 8 个 RFM 象限加 1 个已购客 TTL，共 9 个稳定标签；缓存 miss 明确不可用，不现场重算。 | `dsh-plugins/crm-knowledge/test/dashboard.test.mjs`，RFM 5 项负测 |
| HTML 生成与页面保存 | `VERIFIED`。真实页面 `page_3a80bfa9395446fc8352fbc1b352f720` 已保存到版本 2，并在 SQLite 中留下 `PATCH` revision。 | [真实链路复核](dsh-live-chain-20261022.md) |
| AI/人工编辑 | `VERIFIED`（源码候选）。文案、布局、预览、回退、失败恢复和绑定页面只读均保留原始事实。 | Workbench 编辑回归 `109/109` |
| 结果绑定 | `VERIFIED`（源码候选）。`binding_manifest` 从 page tool、native waiter、live adapter、store 一直传到 page document 和 artifact inbox。 | `58045416`，Workbench delivery `20/20`，后端 `83` 项 |

## 数据边界

1. 数据截止日是仓库最后支付日。当前现场记录为 `2026-07-05`。超过截止日的查询返回 `INSUFFICIENT_COVERAGE`，不能返回 `OK + 0`。
2. 商品结果只向模型公开唯一 `display_name`、覆盖状态和指标。内部商品名与 SPU class 留在 Host。
3. 商品查询与 GSV、RFM 快照是不同结果族。商品结果没有独立 snapshot_id，不能与 GSV 或 RFM 快照直接混算。
4. RFM 只读杭州预计算缓存。缓存缺失、分群不完整或截止日不可证明时返回不可用，不在 Web 请求中现场扫描 DuckDB。
5. 工具不接受任意 SQL、数据库路径、URL、凭据或原始客户明细。测试覆盖了这些输入在边界处被拒绝。
6. 保存分析、组板和驾驶舱引用只提交来源 ID、标题、说明、布局和展示属性。金额、分母、owner 和知识来源由服务端从快照重取。
7. 已绑定结果的 HTML/JavaScript 受保护。编辑器允许受控 CSS 或展示层调整，不能用画布输入改写真实数字。

## 仍然开放的边界

- `0.2.1-rc.1` 现役 runtime 尚未消费 `58045416` 之后的 Workbench candidate。候选包位于 `.context/release/cockpit-binding-58045416/`，tarball SHA-256 为 `ed86a02383644cec4d12ffda9f20411b621cf4c9a09de52649c59f02efb9137f`。这不是部署回执。
- 当前分支的完整 B0 pipeline 已用固定 composition、Workbench 作者、领域作者和 public-contract 输入实际启动。首次失败是工作树中残留的 CRM kit 外链，清理该生成物后再次运行已越过输入、组合和前九个合同生成器；随后发现仓库内 C0 manifest/fixture 与生成器漂移，已由 `54c75ddc` 重生成并通过单独 C0 check。再次运行继续被旧 Workbench public-contract archive 中的 `c0-fixtures.mjs` hash 阻断。该 archive 锁定 `6c5adc9f`，当前 Workbench composition 已是 `3030e3f`；不能把旧 archive 重标成当前来源，需由作者 CI 重新导出 public-contracts 并更新锁。
- Vue 登录后的商品交互 UAT仍需在杭州页面上单独完成。现有真实问数证据不等于 Vue 页面交互已验收。
- 原生 `competition_board_*` 工具仍未进入 `crm-query` 预设。当前“生成看板”走 HTML 页面和 CRM 驾驶舱引用，不等于原生 Board 工具可用。
- Git 工作树干净；本地分支仍有尚未推送到远端同名分支的本轮提交。提交主题都属于本轮 CRM、问数、Workbench 和证据收口，但尚未创建 PR、push 或 merge。

## B0 收尾回执

- 固定输入读取、组合包、领域输入和公共合同前九个 generator 已实际执行；当前阻断点是 `PUBLIC_CONTRACT_CHECK_FAILED: competition-c0-contract.mjs`，具体为旧 public-contract archive 的 `dsh-plugins/analytics-workbench/src/client/competition-board/c0-fixtures.mjs` 与当前生成 hash 不一致。
- 修复后的 C0 生成器结果为 OpenAPI SHA-256 `6d6558e894441d707417003ad9f92e4fc486c1c21c1b92a6d9bc1a24f5c5967f`、contract hash `2c1b9e57ae9818dbfa835a826a4bf82d3c78d1473e4a3472408e4a028a273c8a`；单独 `--check` 和离线评估 `30/30` 通过。
- 因此本轮不能宣称完整 B0、远端 CI、PR、杭州现役切换或正式 release 通过。下一步是重新获取与 Workbench `3030e3f` 同源的作者 public-contract artifact，重锁后再跑完整 B0。

## 可复验命令

固定环境下 CRM 全包：

```sh
B0_BUILD_UPSTREAM="$PWD/.context/dsh-b0/upstream-0.1.7-rc.2" \
CRM_METRICS_PYTHON=/Users/hutou/homebrew/bin/python3.14 \
node --test dsh-plugins/crm-knowledge/test/*.test.mjs
```

固定环境下 HTML/页面编辑回归：

```sh
B0_BUILD_UPSTREAM="$PWD/.context/dsh-b0/upstream-0.1.7-rc.2" \
node --test \
  dsh-plugins/analytics-workbench/src/client/free-html-library/html-edit-kernel.test.mjs \
  dsh-plugins/analytics-workbench/src/client/free-html-library/store.test.mjs \
  dsh-plugins/analytics-workbench/src/client/free-html-library/presentation-confirm.test.mjs \
  dsh-plugins/analytics-workbench/src/client/library-workspace.test.mjs \
  dsh-plugins/analytics-workbench/test/canvas-input-regression.test.mjs \
  dsh-plugins/analytics-workbench/test/draft-save-regression.test.mjs \
  dsh-plugins/analytics-workbench/test/lane-g-delivery.test.mjs
```

后端 artifact inbox、页面文档和 cockpit AI 持久化回归：

```sh
python3 -m pytest -q \
  backend/tests/test_artifact_inbox.py \
  backend/tests/test_page_documents.py \
  backend/tests/test_cockpit_ai.py
```
