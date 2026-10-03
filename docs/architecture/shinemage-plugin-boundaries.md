# ShineMage 当前包边界与依赖清单

本页是 T1 的实现说明；目标架构见[平台边界](./shinemage-plugin-platform.md)，T1 原始验证见[盘点证据](../hackathon/evidence/dsh-g0-boundaries-20261003.md)，图表拆分增量见[本轮证据](../hackathon/evidence/dsh-g0-board-components-20261003.md)。当前代码处于 workspace，未创建新的远端仓库、重命名包或改变生产 profile。

## 唯一机器入口

- 输入：[边界 policy](../../config/shinemage-plugin-boundaries.v1.json)。维护 owner、命令职责、合同来源和逐条临时源码依赖；没有 wildcard 豁免。
- 输出：[机器清单](./shinemage-plugin-boundaries.json)。包括 package identity、版本、files/exports、DSH/peer、全部 package scripts、正向/反向引用、构建层次、字面路由、合同摘要和生成器。
- 校验：[plugin-boundaries.mjs](../../scripts/dsh-b0/plugin-boundaries.mjs)。B0 本地/CI `--check` 直接调用，清单不能靠人工改成 PASS。

```bash
# 固定 Node 24，先按 Quickstart 准备 kit 的锁定依赖
node scripts/dsh-b0/plugin-boundaries.mjs --check
# 只有边界已获认可且代码已调整时，更新清单并审查差异
node scripts/dsh-b0/plugin-boundaries.mjs --write
node --test scripts/dsh-b0/plugin-boundaries.test.mjs
```

`inspection_baseline_sha` 是开始盘点的提交，不是本地未提交修改的 reviewed SHA；当前变更由实际输入与清单差异复核，正式发布仍从干净已审查提交重建。

## 实际包与目标归属

| 当前包目录 | 领域 | 目标仓库（尚未迁移） | 现状 |
|---|---|---|---|
| `plugin-kit` | 纯开发工具 | `shinemage-dsh-plugin-kit` | pin、lock、补丁与构建绑定归 kit；无业务源码依赖 |
| `shine-brand` | 受控主题 | `shinemage-dsh-brand` | 单包隔离 build/test/pack 已验证；默认不覆盖原生壳 |
| `shine-query` | query marker/未来问数领域 | `shinemage-dsh-query` | 单包隔离 build/test/pack 已验证；不代表完整问数产品验收 |
| `board-components` | 纯图表计算/类型 | `shinemage-dsh-board-components` | 独立 tarball、精确版本/digest、公开 exports；不注册 DSH 能力 |
| `shine-funnel` / `shine-waterfall` | DSH 图表插件适配 | `shinemage-dsh-board-components` | 保留 ID/原有导出，构建时消费领域包并打入产物 |
| `shine-board` / `shine-crowd-action` | board/marker | `shinemage-dsh-board` | 先组合，未证明独立生命周期前不额外拆仓 |
| `analytics-workbench` | 分析、页面、驾驶舱 | `shinemage-dsh-analytics-workbench` | 首期 D15 载体；现有 artifact 包名保持不变 |
| `crm-knowledge` | CRM/知识库迁移 adapter | `shinemage-dsh-crm` + `shinemage-dsh-knowledge` | 当前仍合包，且消费 workbench 内部源码 |

扫描覆盖 10 个包、579 个 JS/TS 源码文件。29 条跨包引用中：9 条为构建到 kit，10 条为已锁定领域包公开导出，5 条为仍待退役的 CRM 内部源码引用，5 条只用于测试。另有 6 条仓库测试引用；57 处非字面动态导入均在测试中，不作为运行时兼容证据。

构建 DAG：`plugin-kit` → `board-components` 与四个无需图表输入的 leaf → `analytics-workbench`/`shine-funnel`/`shine-waterfall` → `crm-knowledge`。箭头表示前后依赖，不是宿主 bundle 激活顺序；profile 组合未改变。

## 已解除与剩余依赖

| 消费者 → 提供方 | 数量 | 当前合同 | 状态 |
|---|---:|---|---|
| workbench → board-components | 6 | 标准 package exports、公开 `.d.mts`、精确版本及 tarball SHA-256；编译时打入插件 | 已替换原来指向 funnel/waterfall 源码的 6 条引用 |
| funnel/waterfall → board-components | 4 | 旧导出转接公共领域包；最终 JS/类型独立可消费 | 已验证 ESM、Node require、TypeScript |
| CRM → workbench | 5 | page-tools、page-family、theme tokens、cockpit slot | 仍为内部合同；需领域 API/公开 capability 和消费者回归 |

运行时导入 dev kit、未声明/未锁定的领域包、未发布的私有 subpath、源码绕行、循环、过期例外和 inventory drift 都会阻断。公开依赖无需源码例外，但必须指向领域包实际 `files/exports`，并有消费者的精确版本和 digest lock。临时源码例外仅剩 CRM 的五条，不代表已实现公开服务合同。

图表 tarball 只作为构建输入；读取器向 stdout 解包并校验，绝不让 archive 路径直接写入磁盘。私有内容寻址目录中的字节会再次校验；缺包或改动不自动退回源码。三消费者把同一个摘要写入发布包的 `bundled-dependencies.json`，线上无新增依赖。更新领域代码必须新版本/新摘要与消费者回归，不能覆盖已生成的同版本不同内容包。

## 服务、路由与合同

服务不在插件包内：`backend/analytics_*` 与 `backend/services/analytics/` 拥有 B0 分析及持久化；CRM 的 `backend/crm_metrics_app.py`、`backend/routers/metrics.py` 与领域合同拥有指标/权限；知识库服务及其数据拥有独立生命周期。插件通过 adapter 调用，不拥有生产 DuckDB、凭据或服务数据迁移。

当前提取 `/api/`、`/internal/`、`/b0/` 字面路径及模板路径，共 190 处声明、116 种路径；包括测试夹具和 gateway 资源路径，**不是 116 个已经接通的公开 API**。清单标明来源与 phase，去掉 origin 和 query 值。内部路径标为 `INTERNAL_NOT_PUBLIC`，其他路径标为 `OBSERVED_NOT_FROZEN`。

当前 10 条重要合同记录 DSH pin、CRM dashboard/schema、first-purchase、saved-analysis、board-spec、CRM cockpit slot、页面工具及两种图表公开类型；每条有 owner、消费者、生成器、源 SHA-256 与兼容政策。内部 slot/page 工具仍非公开合同，T3 需冻结服务版本窗口和状态矩阵；这里不虚构尚未批准的版本兼容范围。

8 个主要控制入口由 release-control、build-tooling、host-dev-adapter、deploy-owner 等逻辑 owner 负责；包内全部 scripts 随 manifest 记录。逻辑 owner 是职责边界，不能替代后续现场 RACI、授权与主备安排。

## 静态检查的边界

解析器使用固定 TypeScript 6.0.3 AST，不执行待扫描源码。它提取直接 import/export、import type、TypeScript import-equals 和字面 require/import；非静态直接 import/require 在非测试源码中拒绝。动态拼接路由、别名 loader、HTTP 方法/权限、进程生命周期仍须合同与真实宿主测试，不能靠此静态清单证明。新增这类间接机制需补受控合同与针对性验证，不能通过改测试后缀规避边界。

T1 完成代表当前依赖可见、可检查；T15 仍为 PARTIAL。两个 marker/leaf 与 workbench 的隔离构建/pack、现有生命周期单测，不替代真实 DSH unload/restart/WAL、服务保存、签名/SBOM 或杭州上线验收。
