# 原快照重新授权的本地验证

2026-10-28，本轮补齐旧看板在 CRM 重登后访问同一原快照的显式授权。原来源拒绝跨代读取的保护保留。授权只放在当前 Host 内存，页面、快照及引用库均不迁移。

本轮使用独立 feature 分支，保留已验收的主仓 `e52f6e5d`、Workbench `e20a0fea` 和 CRM `5b884ba`。没有修改隔离 19327 或公网，没有合并 PR。实现合同见[原快照显式重新授权](../../operating/native-crm-source-reauthorization.md)。

## 实际验证

| 范围 | 结果与边界 |
|---|---|
| 来源及 Host Python | 149 passed，含原 116 项和新增授权回归 |
| 页面来源适配 | 42 passed |
| Node Host 与 Python 来源 | 10 passed、11 deselected；包含 1、16、17、64 引用和 warehouse 原快照恢复 |
| CRM 作者全包 | 285 passed、0 skipped；固定 rc3 构建及类型检查通过 |
| Workbench 作者 core | 1394 passed、0 skipped；固定 rc3 构建及完整类型检查通过 |
| 工作台相关交互 | 112 passed，与 core 重叠，不累加 |
| 实际 Chrome | 原来源先拒绝，显式预览和确认后恢复事实；版本、HTML、绑定、AI 文案、样式与属性保持一致，无页面写操作及浏览器异常 |

Chrome 使用实际 React 组件和合成传输，不能替代真实 CRM 登录及业务数据验收。本条为定向验证范围，后续完整推送门禁结果见交付更新；真实模型未复验。

首次直接服务环境缺少测试依赖，首次作者全包缺少固定输入，均保留失败记录。绑定现有项目测试解释器和固定 SDK 后，上表对应命令通过；未修改全局环境或放宽门禁。

## 审查与修复

采用已授权的本机 Codex CLI 同模型独立审核，不作为跨模型审计。

设计审核发现预算已过而定时器尚未执行时，确认可能先激活再报超时。实施将最终预算检查放在同步发布前，回归从失败转为通过。

工作台审核发现确认后拉取 latest 会引入并发新版本，以及丢回执后无法同票重试。实施改为仅刷新当前版本来源，并保留同票重试。两项回归从失败转为通过，独立复核关闭。工作台新增注释与抑制均为零，来源的一条复述注释已删除。CI 另发现 HTTP 地址误判为跨仓导入，已修复并补充模板字符串及 URL 模块导入的拒绝回归。

## 未完成的交付

三仓代码已推送为草稿 [Source #189](https://github.com/tyuanww/fuqing-crm-analytics/pull/189)、[CRM #6](https://github.com/tyuanww/dsh-crm-knowledge/pull/6) 和 [Workbench #14](https://github.com/tyuanww/dsh-analytics-workbench/pull/14)。两作者固定输入 CI 成功，严格包已从干净克隆离线重建并强制回读生成证明。新组合本地严格接收通过，20 份载荷只改变 CRM 与 Workbench 的四份，其余十六份逐字节相同。

正常推送门禁通过完整后端 4105 passed、81 skipped、前端构建及 236 项单测，以及现有 e20/5b 组合的 B0 兼容检查。该检查不能代替新组合 B0。主仓当前提交的远程 CI、组合锁交付及远程归档、新组合 B0、隔离 19327 真实重登验收仍待完成。原运行包与公网保持原身份，产品继续 PARTIAL，`release_ready=false`。

本轮没有扩大缓存预热、portable Linux 或正式发布范围。这些事项继续保留原开放状态。
