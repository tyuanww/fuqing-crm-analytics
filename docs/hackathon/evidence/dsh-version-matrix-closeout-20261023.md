# DSH 版本矩阵收口

日期：2026-10-23（北京时间）。

## 结论

主仓保持一条可复现的 rc2 构建线。DSH SDK 为 `0.1.7-rc.2`，固定上游为 `477b4f420553e8a52c2fbccc464d7561b239c443`，Cordis 为 `4.0.4`。CRM 和 Knowledge 插件的 peer 已与该构建线一致。

杭州现役是独立的 rc1 side-load。它使用 DSH `0.2.1-rc.1` 和 Cordis `4.0.5`。本轮没有更改该实例，也不能用 rc2 源码测试证明线上已经切换。

## 依据

- `dsh-plugins/plugin-kit/toolchain.json` 固定 rc2 SDK 和上游 SHA。
- 固定上游的 `vendor/cordis/package.json` 实际版本为 `4.0.4`。
- `dsh-plugins/crm-knowledge/package.json` 与 `dsh-plugins/knowledge/package.json` 均声明 `@deepseek-ai/dsh-tools=0.1.7-rc.2`、`@deepseek-ai/cordis=4.0.4`。
- `config/dsh-rc1-release-lane.json` 和 `config/dsh-im-plugin-inputs.v1.json` 描述杭州 rc1 输入，不属于主仓 rc2 构建线。
- `node scripts/dsh-b0/plugin-boundaries.mjs --check` 已重新生成并核对边界清单。

## 验证

| 范围 | 结果 |
| --- | --- |
| profile、composition 和 host 合同 | `69/69` 通过 |
| CRM 和 Knowledge 包合同 | `15/15` 通过 |
| 插件边界 | `12/12` 通过 |
| release 边界和 package manager 合同 | `5/5` 通过 |
| 独立服务包 | 锁定 Python 3.14 环境下 `11/11` 通过 |
| 完整后端 | 锁定服务 Python 下 `3304 passed / 85 skipped / 5 warnings / 0 failed`，退出码 `0` |

服务包测试必须设置 `CRM_SERVICE_PYTHON` 指向锁定的 Python 3.14 环境。系统 Python 的依赖版本不匹配时，`SERVICE_DEPENDENCY_VERSION_MISMATCH` 仍按设计拒绝执行。

## 发布边界

rc1 side-load 是现场运行事实，不是本轮 rc2 构建的晋升目标。后续切换仍要生成 rc1 专用 profile、完成真实页面 UAT 和切换授权。本轮保持 `release_ready=false`，也不声明杭州已消费本轮 Workbench 候选。
