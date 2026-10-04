# T15 CRM 插槽合同解耦（2026-10-03）

前置审核修复已由正常 Git hooks 提交为 `f55908df`，分支 `codex/plugin-boundary-review`。本页记录其后的独立、尚未提交增量。原公共 main 的用户修改全部保留，没有推送、创建 PR、发布或现场动作。

## 本次完成

- CRM 的 5 条 workbench 内部引用中，已解除 cockpit slot 类型这一条；剩余页面交付工具/页面族 2 条与主题 2 条，共 4 条。
- `analytics-workbench/contracts/cockpit-slot.v1.json` 由驾驶舱领域拥有，冻结原有可选 `cockpit.crm` 的 single/root 形状，不改 DSH 官方 slot 合同。
- `cockpit-slot-contract.mjs` 从领域合同生成双方各自携带的 TypeScript 模块，写入源摘要。CRM 只编译自己的副本；provider 注册也使用生成常量，防止类型和实际注册各写一份。
- B0 本地/CI 调用同一生成物漂移检查；v1 的名称、基数、scope、optional 或未知字段变化均拒绝，兼容性变更需要显式新合同。
- 没有增加运行时包、全局平台服务或 kit 业务逻辑；没有搬迁仓库、改产品版本、改上游或改变保存权限。

新合同只说明插槽形状；可选注入、原生回退和宿主运行行为继续由原有 DSH/插件负责。不能据此宣称 T17 生命周期、热卸载或服务 API 完整验收。

增量沿用 OCR delegate 工作流，由当前 Agent 审核；最终 preview 中 10/10 个可审文件已覆盖，另外 11 个文档/生成物已补审，没有跳过文件或新增未关闭发现。清单、文件摘要和规则保存在同一 evidence 目录，与已提交的前置审核分开。

## 本次实际验证

Node 24.19.0 / pnpm 11.7.0；只读复用原公共工作树的固定 `477b4f42` 上游与同锁第三方依赖。B0 Python `/tmp/dsh-b0-python.qW3lHO/venv/bin/python` 为 3.14.4、DuckDB 1.5.6；不访问真实库或模型。

| 入口 | 结果 |
|---|---|
| `node --test scripts/dsh-b0/cockpit-slot-contract.test.mjs scripts/dsh-b0/plugin-boundaries.test.mjs` | 13/13 PASS；含双方当前产物、v1 拒绝变更、篡改副本拒绝且不覆盖、无 workbench 源码的真实 TypeScript 消费者 |
| `B0_BUILD_UPSTREAM=<pinned> node scripts/dsh-b0/pipeline.mjs --check --python <b0-python>` | 完整退出 0；Python 618 PASS / 23 warnings；Node 阶段合计 1413 PASS / 1 SKIP；全部合同、7 profile 插件构建、host/client types、固定 Cordis Loader/SlotCore + synthetic、独立 leaf pack、workbench clean build/pack 通过 |
| `B0_BUILD_UPSTREAM=<pinned> node dsh-plugins/crm-knowledge/build.mjs` | CRM host/client 完整类型检查和构建 PASS |
| `B0_BUILD_UPSTREAM=<pinned> node --test dsh-plugins/crm-knowledge/test/login-ui.test.mjs` | 编译后 React/AntD + synthetic HTTP UI 9/9 PASS；不是 headed 浏览器或真实账户验收 |
| `node scripts/dsh-b0/plugin-boundaries.mjs --check` | 10 包、581 源文件、28 条跨包引用；4 条精确内部源码例外 |

日志在本工作树 `.context/checks/crm-slot-20261003/`，build evidence 单独保存。1413 含 clean 阶段重复执行的 83 项，不是不重复场景数。唯一 SKIP 为未提供外部 HTML 样例；不记作通过。

workbench clean build 只复制自身源文件与 kit，六份编译输出一致。临时 fixture pack 为 416,772 bytes，SHA-256 `aa9876955baf3f484f48f95e0d0f170c911be718bbd6846ae60b46ed55d6e5d6`，`fixture_only=true`、`activation=NOT_RUN`，并非正式 reviewed release artifact。领域图表输入摘要仍为 `22245ab95511b13bf38ae8b2a5e761f6d5a3aaa413ba55b48ce1a8fcf7390182`。

## 仍需推进

页面工具合同与主题输入各自解耦，CRM/知识库服务状态矩阵、精确 DSH 生命周期、invariant、签名/SBOM/CVE、canary/回退和远端证据仍开放。当前 T15/产品 PARTIAL；本增量未提交，未达到新的 Release 或杭州激活条件。
