# 真实模型、WeKnora 与 CRM UAT 实跑（2026-10-13）

用户本人在 Aside 完成登录后，在授权杭州入口执行只读 UAT。结果是部分通过：真实模型和 WeKnora 检索完成，登录后的 CRM 人群看板加载了真实聚合数据；工作台当前会话没有暴露 `query_crm_dashboard_gsv`，模型没有编造调用，模型直连 CRM 查询保持阻塞。

## 已实际运行

### WeKnora 与真实模型

- 工作台使用真实 `DeepSeek-V41-Flash`、推理等级 `High`，代理预设为“知识库问答”。
- 只读问题要求检索 CRM 的 GSV/GMV 口径并列出来源，不执行写入。
- 观察到 `weknora_search` 和 `weknora_read_document` 工具调用；回答返回了来源标题，包括《CRM 指标已确认口径与接入边界-20260920》《项目数据库与数据接口使用说明》《归档 CRM 数据接口目录》和《CRM赛道快速上手CST-逐页识别文字》。
- 回答明确区分了知识库静态口径与实时业务数据，没有声称查询了真实 CRM 数据。

结论：**真实模型 PASS；WeKnora 检索与来源引用 PASS；未执行写入。**

### CRM 真实看板

- 用户登录后的 `board.tyuan.chat/audience` 首次请求返回 503，页面提供重试；重试后看板加载完成。
- 实际范围为 2026-01-01 至 2026-10-12、全店、YTD；页面展示 GSV/GMV、老客/新客/会员等聚合卡片和趋势区域。
- 本记录只记页面状态和范围，不复制真实指标数值、客户标识或名单。

结论：**CRM 只读看板加载 PASS；未执行保存、导出或业务数据修改。**

## 仍未关闭的集成门禁

在新建标准模式会话中明确要求直接调用 `query_crm_dashboard_gsv`。模型返回“该工具不在当前会话的工具清单里”，并列出当前可见工具只有页面生成、bash、read/write/edit、glob/grep、web 和团队工具；没有执行 CRM 查询，也没有用终端或仓库文件替代。

随后只读查看 Aside 的插件详情：`@shine-mage/dsh-analytics-workbench-b0` 与 `@shine-mage/dsh-shine-query` 都是 `v0.0.0-b0`，各自只有 `analytics-workbench-ui` / `shine-query-ui` 组件显示运行中。没有切换开关、卸载插件、重启服务或修改配置；这说明当前工作台会话拿到的是 UI 组件装配，不能据此证明目标 DSH runtime 已向 agent 暴露 CRM provider。

因此：

- `CRM_TOOL_EXPOSURE`：`BLOCKED_TOOL_NOT_EXPOSED`；需要把 CRM provider 接入当前目标会话或确认带工具面的数字员工/DSH runtime，而不是只启用 UI 组件。
- 保存/驾驶舱写入：`NOT_RUN_READ_ONLY_SCOPE`。
- 权限失败、会话恢复和人工业务代表复核：`NOT_RUN`。
- standalone、candidate-bound browser、读屏、键盘完整焦点和高对比度仍由 M2-05/M2-04 独立负责。

本轮没有修改生产数据、没有生成或保存驾驶舱、没有激活 candidate、没有 push；产品仍 `PARTIAL`，`release_ready=false`。
