# 真实会话验收后的根因修复

2026-10-25 从主仓 `3d329d4b`、Workbench `ac005b4`、CRM `631b8d8` 接续。真实会话仍运行杭州 rc1；以下修复已进入候选源码和新的组合 artifact，尚未切换现役。`release_ready=false`。

## 实际发现

- 现役 RFM 含 metric_type 时被通用参数校验拒绝；候选已有参数投影修复。去掉该参数后，服务日志确认 2026-07-01～07-05、GSV、全店组合缓存未命中，服务拒绝现场重算。只有其他窗口的旧预热回执，不能证明这个窗口或近两年覆盖。
- 现役普通 AI 会话依赖文件与终端，长行读取还会截断源码。原生页面模式也缺少对应 AI 路由。
- 页面保存后 durable selection 仍指向旧页，重新挂载可能打开其他页面。
- 页面工具的原始参数与返回包均缺少 textarea 的起始尖括号。错误来自模型交付；保存保留了原错误。

## 候选修复

RFM 服务返回 cache miss/unavailable 的结构化响应头，CRM 只在 RFM 接口解释这些标记；未知 503 不推断缓存状态。参数与数据截止日修复沿用已有候选，不重复实现。

原生 AI 通过专用会话分页读取及提交精确替换，候选持久化后仍须显式确认。绑定、选区、来源撤销与版本约束继续生效。独立审核发现的重开会话失配、Host 卸载后权限恢复、文件 transport 被覆盖和渲染后选区无可提交结果，均补回归并修复。任务列表改为两服务独立恢复；textarea 检查补齐 raw-text 用例。类型与测试标题同步更正。

仅持久化专用预设仍不能封住权限恢复：rc3 可以在首轮前切换预设，恢复时使用事件投影中的预设。最终将工具权限策略从页面 Host 分离，按专用会话 ID 约束新建、存活及恢复的 agent；Host 依赖策略服务，只负责两个编辑工具。卸载 Host 不撤掉策略，缺少策略时 Host 不启用。

Workbench 保存时同步页面选择。工具交付入口拒绝孤立或未闭合的 textarea，不自动改写源码；这不等于完整 HTML 校验。

## 验证

本轮使用已批准的独立只读同模型 Codex CLI 审核与注释复核替代；不是跨模型或原生 Comment Sicko。首轮有 2 个 P1、2 个 P2，后续权限生命周期与加载故障也已复现、修复。最后增量复核无新增确认 P0–P2，只覆盖本轮修复。注释复核的四项表述及类型建议已处理，本轮新增代码未删除或恢复注释，也没有未落实的约束注释。测试数据为合成夹具，现场日志和浏览器轨迹只作根因证据。

- CRM dashboard：55 PASS。
- 后端 RFM、页面候选、presentation、旧 AI 及跨进程原生组合：139 PASS，2 warnings；其中组合 15 项，使用实际 Connection/BrowserAuth 与自建小型 DuckDB。
- 固定 rc3 Host/工具运行时 4 PASS，验证专用工具、普通会话、Host 卸载、恢复及重新挂载。使用真实 Registry、Projections、Tools 和 Scope；原失败基线在独立夹具复现普通工具重新出现。
- 最后一个 Host 重载回归先以 `AI_SESSION_INVALID` 失败，解除工具安装与旧预设 header 的耦合后通过。主验证使用 Node 24.19.0；最终独立审核另在 Node 25.8.2 重跑 1 项，后者不代替固定工具链结果。
- Workbench 固定 SDK 的 Host/client 完整类型检查与构建通过；core 为 162 文件、1150 PASS，0 FAIL、0 SKIP。浏览器及 standalone 阶段未执行。

早期完整 core 首次因未设置 Python 3.14 路径失败；补齐后 1145 PASS。后续会话修复令两项旧注入夹具缺少 refresh，已补齐真实接口形状；这些失败没有记为最终通过。

## 作者交付

CRM `31e1145` 已推送至 [PR #2](https://github.com/tyuanww/dsh-crm-knowledge/pull/2) 的 `codex/dsh-rc3-ci` 分支，[对应 CI](https://github.com/tyuanww/dsh-crm-knowledge/actions/runs/40173749364) 成功。Workbench `c836d3f` 已推送至 [PR #2](https://github.com/tyuanww/dsh-analytics-workbench/pull/2)，[对应固定输入 CI](https://github.com/tyuanww/dsh-analytics-workbench/actions/runs/40173866698) 成功。两者从干净提交离线重建并通过严格包回读，保留生成来源证明。CRM manifest SHA-256 为 `26226314c62cb3172767cef0780f9473f24796994fbd773403f9cf9bfb7311d7`，Workbench 为 `db7b7a52b53e631da4cec53deabbe8764da705462a7473643263960ee52694a7`。

两个新包已进入九插件组合；20 个 payload 中只替换两个作者各自的 manifest/tgz，其他 16 个文件原字节保留。31 份公共材料已读回。Workbench 1150 项远端 core 结果已与新严格包的来源及摘要绑定。

运输提交 `ab151e0f` 的 [CI](https://github.com/tyuanww/fuqing-crm-analytics/actions/runs/40175308101) 成功。artifact `12591648417` 已实际下载，733958 字节、SHA-256 `8d0b1d82c334551d55d29663cc5607d3b244097f8ed943d4f5aaf0e49a1a8e36`；20 个文件逐字节比较及严格接收通过。旧 artifact 搭配新锁被拒绝。Git HTTPS 三次连接失败后，使用 GitHub Git 对象 API 上传完全相同的 commit/tree/blob，并在原 LFS pre-push 通过后用预期旧 SHA 更新分支；没有改写历史。

正常 B0 检查已自动发现新测试，但原入口未传入所需 SDK 路径；交付审核复现后，已在原调用补齐参数，清空环境的四项回归通过。主仓精确提交 CI 与运行包仍须单独验证。

## 仍未关闭

- 修复后的真实模型、真实浏览器与业务数据联合验收；当前线上并未消费本轮源码。
- 主仓精确提交 CI、运行包读回和隔离 rc3 消费；两个作者严格包及新组合 artifact 已完成接收。
- RFM 近两年完整预热、目标窗口及 generation 验收；商品持久化缓存；订单数据版本指纹对等额分类修正的识别。
- RFM/商品来源尚未纳入当前仅五项经营聚合的原生页面绑定。
- 正式发布门禁和杭州切换，不属于本轮已完成事项。
