# CRM 分析持久化交付记录（2026-09-21）

基线为新公开仓库 main `106717e6`（#33），候选 `3ae3c9c` 经 [PR #34](https://github.com/tyuanww/fuqing-crm-analytics/pull/34) 合入 `73ee74c`，两者代码树一致。VERSION 保持 0.12.0.0。原候选及失败记录保留；本文件不重写旧仓库 #215–#217 的历史交付。产品仍 PARTIAL。

## 行为与边界

复用已合 #11 的 `dashboard-purchases`：AOV/AUS 以当前看板 GSV 为分子，正额有效订单/对应买家为分母；零元订单和仅零元买家单列。未额外发布另一套销售合同。

模型查询产生服务端可信快照；用户在“CRM 分析”核对后确认保存分析，再确认加入驾驶舱。浏览器写入仅带来源 ID 和标题，不能提交金额或账号。固定结果按 CRM 账号隔离，重开及新进程读取保留原结果；查询重做产生新快照。配置、接口、重试与容量说明见[插件使用说明](../../dsh-plugins/crm-knowledge/README.md#保存分析与驾驶舱引用)。

macOS 一次性测试 Chrome 使用 mock keychain，避免临时 HOME 寻找默认钥匙串；P12 改为 CDP 就绪后单次导航。仅改变验证浏览器，不改变用户钥匙串。

## 本候选验证

- CRM 专项后端、Ruff、离线 OpenAPI/调用方类型、固定 SDK 构建通过；Node 83、原生 Host 21 通过，层级有重叠，不相加。
- 新主线候选完整 B0 pipeline 通过，含 P12 实际 Chrome、合同、Python/Node、编译后 DOM、Host/客户端类型、构建与干净重建。此前失败日志保留。
- 已确认短日期窗口：只读 GSV 与既有基准一致，正额订单和买家与独立聚合一致。固定结果写入专用私有验证 SQLite 后，保存/引用/幂等及新进程读取一致；归档文件大小和修改时间未变。验证账号为专用测试身份，不冒报真实账号浏览器验收。
- 公开候选完整后端 2810 passed、77 skipped、71 deselected，12 组通过；正常 pre-push 和 LFS 保留。首次检查因 PATH 缺少 lsof、随后因 STATUS 超出 80 行失败，修正后通过，失败日志保留。跳过及排除不算通过。
- 浏览器 QA 使用编译后 React、生产 Host 适配层与真实 FastAPI/SQLite 合成夹具：取消不写入，确认保存和引用各一次，刷新重开保留 ID/标题/固定值，窄屏与控制台检查通过。该层不是完整 DSH 真实模型或真实账号验收；原生 Host 另有 21 项测试。
- OCR delegate 由当前 Agent 审查 31/31 可审文件，0 跳过；8 份文档/生成文件另核，无未关闭的高风险项。PR 当前 HEAD 的[远端 CI](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/35525663848)和合入 `73ee74c` 的[main CI](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/35526183975)均通过，未运行的矩阵项保持 skip。

专项与真实核对日志保存在原集成工作树 `.context/checks/`，公开候选工作树保存 `release-push-status-short.log` 和完整门禁报告；浏览器回执位于私有 `browser-qa/`。公共仓库不收录真实金额、账号、凭据或私有运行回执。

## 发布与回退

代码已通过正常 hooks、review、QA 及当前 PR HEAD CI 后合并；合并与运行切换分别留回执。现役保留原 DSH runtime、历史、模型配置和 DuckDB 1.5.3 环境。新主线锁中的 DuckDB 升级仅用于隔离检查，不随此次真实归档服务切换升级。

回退恢复原代码/插件指向及 profile，保留新私有 CRM 状态目录；旧代码不读取该新状态，不将代码回退声称为数据降级。服务重启会清除内存登录，需用户在当前对话重新连接 CRM。

本机已完成候选启动 → 恢复旧版并实际启动 → 再次切入候选。6677 使用原 runtime，CRM 指向独立回环服务 18093，原 8000 进程保留。68 个既有会话/Agent 文件的原内容，以及全部既有文档版本/回执保留；页面 SQLite 完整性通过，归档大小和 mtime 未变。新版界面已显示“连接 CRM”和“CRM 分析”。

部署复用已发布的认证、QueryRouter 和指标路由，以本机私有适配入口启动，避开旧服务的全库校验及自动缓存预热。固定 DSH 的 profile 插入顺序会覆盖额外 Host patch，本轮在隔离副本验证后精确更新现有 CRM Host 行；其他配置保持原文。首次 reload 因候选未绑定默认 upstream 路径失败，绑定现有固定 checkout 后成功；未修改或复制上游。失败和回退回执保留在私有运行目录。

用户在新版原生登录框重新连接后，MiniMax-M3 Default 实际调用 `query_crm_dashboard_purchases` 和 `query_crm_dashboard_snapshot`，使用同一已确认短窗口、全店及不剔除低价条件；固定结果一致，快照标记为真实来源。随后在界面核对并确认保存分析、加入驾驶舱，整页刷新后重开分析/引用，以及通过全局驾驶舱的 CRM 入口重开，均保留同一标题、快照、分析/引用 ID 和固定指标。独立 SQLite 连接回读与先前只读独立聚合完全一致，仅产生两次确认写入回执，归档大小和 mtime 仍未改变。

**当前三步已完成。** 真实账号证据保存在私有运行目录的 `real-account-acceptance.json`，不发布真实金额、账号或私有 ID。密码由用户在原生登录框输入，未读取密码或复用旧 Host 内存令牌。本次只验收单个已确认短窗口；更多日期/渠道、逐格式模型编辑和本人视觉/UAT 不由此代签。

## 仍开放

完整历史检索、CRM 编辑/共享/可编辑组板、多用户文档 ACL、会员时点/退款/复购/LTV/派样来源、图谱全图与原文同版本、逐格式真实模型编辑及 P13/本人 UAT 继续保留。不由本轮局部验收代签。
