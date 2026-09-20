# 离线知识包导入边界

公开包可以作为定义、能力缺口和合成检索案例的输入。私有教材原文、业务对账、源文件清单及登录信息不在公开包内。

1. 核对 `pack.json` 的指标版本，并运行 `python3 knowledge/crm/tests/validate_pack.py`。
2. 保持教材索引、历史代码、目标定义和实现验收四层分离；索引不授予原文访问权。
3. 导入关系时保留 `evidence_refs`、冲突状态和权限标签。解释未完成指标时须说明缺数据或缺实现。
4. 实现变化后重新验证；`verification.json` 的文件指纹失配即停止宣称合成已验收。

当前候选 DSH 工具能够读取离线定义和依赖关系。WeKnora 上传、Neo4j、受限文档 ACL、真实模型调用和现役 profile 切换仍未完成。保存分析/驾驶舱的持久化引用也未接通，目前只返回来源和 `query_ref`。

真实 GSV 使用用户确认的现看板兼容口径 `dashboard-gsv/observed-v1`；扣实际退款的 `crm-metrics/v1` 是独立候选，不能再次用于扣减看板金额。新增 CRM 登录按钮仅为当前对话保存内存授权，真实用户验收仍待进行。详见 [插件说明](../../dsh-plugins/crm-knowledge/README.md)。
