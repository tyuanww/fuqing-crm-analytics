# DSH 提交前破坏性审核

日期：2026-10-23（北京时间）。

## 结论

核心读链路在固定环境下通过：WeKnora 检索、CRM 只读聚合、商品新老客、RFM 预热缓存、HTML 页面保存、展示层编辑和版本回读均有回归证据。

本轮没有发现可带入提交的已确认数据越权或凭据泄露缺陷，但不能把当前状态称为正式 release ready。正式发布仍受杭州 rc1 交接、供应链和独立验收门禁约束。

## 本轮修复

- 商品查询在仓库截止日前、截止日后和首购历史缺失时均 fail-closed；缺失首购历史映射为独立的 `FIRST_PURCHASE_UNAVAILABLE`，不再误报未知商品。
- 页面绑定清单拒绝重复引用、未声明结果引用、重复绑定 ID、非法模式和超限清单；幂等重放若绑定清单改变则冲突。
- 展示层 overlay 通过独立只读权限读取，页面重开会恢复已保存文案；绑定页面浏览态禁用页面脚本，编辑态才启用桥接脚本，降低动态跳转外带数据风险。
- 前端生产依赖中的 `follow-redirects` 固定到修复版本；Vite/Vitest 升级到修复版本。生产依赖审计为 0 个漏洞。Tailwind 3 的开发链经安全传递依赖更新后仍有 7 个 audit 报告项，Tailwind 4 迁移已单独记录为后续视觉回归工作。
- 公开证据中的真实快照 ID、页面 ID、金额和人数已脱敏。

## 已执行验证

- CRM Node 全包：132 passed。
- Workbench 页面/安全/编辑范围：119 passed；本轮受影响子集：35 passed。
- 后端受影响范围：114 passed。
- 前端单元测试：226 passed；生产构建成功。
- 页面绑定 Node 有界验证：93,750 次转移、112,500 个状态通过；TLC 2.19 无不变量违例。
- plugin boundary check 和 C0 边界测试通过。
- 依赖审计：`npm audit --omit=dev` 为 0 vulnerabilities。
- 服务包专项在锁定的 Python 3.14 环境下通过 11/11；系统 Python 的版本不匹配仍会按设计返回 `SERVICE_DEPENDENCY_VERSION_MISMATCH`。
- 完整后端在锁定的服务 Python 环境下为 `3304 passed / 85 skipped / 5 warnings / 0 failed`，退出码为 `0`。Docker Compose 插件不可用时，生产 Compose 合同测试明确跳过，不再把缺失插件误报为产品失败。
- 主仓 DSH/Cordis peer 矩阵已统一为 `0.1.7-rc.2 / 4.0.4`，见 [版本矩阵收口](./dsh-version-matrix-closeout-20261023.md)。

## 未关闭门禁

1. Tailwind 3 开发依赖链仍有 7 个 audit 报告项。生产依赖为 0 个漏洞，Tailwind 4 迁移不在本轮范围，见 [Tailwind 4 评估边界](./tailwind4-evaluation-20261023.md)。
2. 杭州现役 side-load 尚未消费本轮 Workbench 候选。本轮没有线上切换结论，仍需要 rc1 profile/toolchain 验收和真实页面 UAT。

本记录不授权 push、PR、merge、部署或杭州切换。
