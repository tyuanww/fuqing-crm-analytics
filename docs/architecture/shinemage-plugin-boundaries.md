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
| `crm-knowledge` | CRM/知识库迁移 adapter | `shinemage-dsh-crm` + `shinemage-dsh-knowledge` | 当前仍合包；已消除对 workbench 的生产源码依赖，独立 build/test/pack 已验证 |

扫描覆盖 10 个包、591 个 JS/TS 源码文件。24 条跨包引用中：9 条为构建到 kit，10 条为已锁定领域包公开导出，5 条只用于测试；生产源码例外为 0。另有 6 条仓库测试引用；64 处非字面动态导入均在测试中，不作为运行时兼容证据。

构建 DAG：`plugin-kit` → `board-components`、`crm-knowledge` 与四个无需图表输入的 leaf → `analytics-workbench`/`shine-funnel`/`shine-waterfall`。箭头表示前后依赖，不是宿主 bundle 激活顺序；profile 组合未改变。

## 已解除与剩余依赖

| 消费者 → 提供方 | 数量 | 当前合同 | 状态 |
|---|---:|---|---|
| workbench → board-components | 6 | 标准 package exports、公开 `.d.mts`、精确版本及 tarball SHA-256；编译时打入插件 | 已替换原来指向 funnel/waterfall 源码的 6 条引用 |
| funnel/waterfall → board-components | 4 | 旧导出转接公共领域包；最终 JS/类型独立可消费 | 已验证 ESM、Node require、TypeScript |
| CRM → workbench | 0 | slot/主题为领域生成合同；页面工具由 profile 装配公开入口 | 原 5 条私有源码/类型引用全部解除；服务端与生产运行仍另验 |

运行时导入 dev kit、未声明/未锁定的领域包、未发布的私有 subpath、源码绕行、循环、过期例外和 inventory drift 都会阻断。公开依赖无需源码例外，但必须指向领域包实际 `files/exports`，并有消费者的精确版本和 digest lock。当前无生产源码例外；CRM 已通过两个显式 HTTP origin 消费合成查询/知识解释 API 1.0.0，不再从插件启动 Python CLI。服务实现仍在本仓，物理服务分仓和真实 CRM 合同仍未完成。

图表 tarball 只作为构建输入；读取器向 stdout 解包并校验，绝不让 archive 路径直接写入磁盘。私有内容寻址目录中的字节会再次校验；缺包或改动不自动退回源码。三消费者把同一个摘要写入发布包的 `bundled-dependencies.json`，线上无新增依赖。更新领域代码必须新版本/新摘要与消费者回归，不能覆盖已生成的同版本不同内容包。

## 服务、路由与合同

服务不在插件包内：`backend/analytics_*` 与 `backend/services/analytics/` 拥有 B0 分析及持久化；CRM 的 `backend/crm_metrics_app.py`、`backend/routers/metrics.py` 与领域合同拥有指标/权限；知识库服务及其数据拥有独立生命周期。插件通过 adapter 调用，不拥有生产 DuckDB、凭据或服务数据迁移。

当前提取 `/api/`、`/internal/`、`/b0/` 字面路径及模板路径，共 202 处声明、121 种路径；包括测试夹具和 gateway 资源路径，**不是 121 个已经接通的公开 API**。清单标明来源与 phase，去掉 origin 和 query 值。内部路径标为 `INTERNAL_NOT_PUBLIC`，其他路径标为 `OBSERVED_NOT_FROZEN`。

当前 13 条重要合同除 DSH pin、领域 schema/slot/主题/图表外，新增各自 owner 的合成 CRM 与公开知识服务 API 1.0.0；每条有 owner、消费者、生成器、源 SHA-256 与兼容政策。页面交付仍由 workbench 的公开 `./page-tools` 入口拥有。新服务仅支持精确 API 1.0.0，见[服务边界](../operating/crm-plugin-service-boundary.md)；T3 的真实服务版本窗口、D15 服务状态与保存矩阵仍未完成。

10 个主要控制入口由 release-control、build-tooling、host-dev-adapter、deploy-owner、backend-services 等逻辑 owner 负责；新增独立服务打包与受控运行入口，包内全部 scripts 随 manifest 记录。逻辑 owner 是职责边界，不能替代后续现场 RACI、授权与主备安排。

服务应用的完整文件/资源边界分别由 `services/crm-metrics/package.json` 和 `services/crm-knowledge/package.json` 维护，每个最终包保存这些输入的摘要与逐文件 source/target。两者是独立进程应用，不共用安装目录；语义/合同聚合初始化不进入服务包。打包与最小依赖隔离运行见[操作说明](../operating/crm-service-packages.md)，不把本页的 TS 静态依赖扫描当成 Python 服务的运行证据。

## 静态检查的边界

解析器使用固定 TypeScript 6.0.3 AST，不执行待扫描源码。它提取直接 import/export、import type、TypeScript import-equals 和字面 require/import；非静态直接 import/require 在非测试源码中拒绝。动态拼接路由、别名 loader、HTTP 方法/权限、进程生命周期仍须合同与真实宿主测试，不能靠此静态清单证明。新增这类间接机制需补受控合同与针对性验证，不能通过改测试后缀规避边界。

T1 完成代表当前依赖可见、可检查；T15 仍为 PARTIAL。两个 marker/leaf、CRM 与 workbench 的隔离构建/pack、现有生命周期单测，不替代真实 DSH unload/restart/WAL、服务保存、签名/SBOM 或杭州上线验收。

## CRM 插槽合同增量

`analytics-workbench/contracts/cockpit-slot.v1.json` 由驾驶舱领域维护，冻结现有可选 `cockpit.crm` 的 single/root 语义。`node scripts/dsh-b0/cockpit-slot-contract.mjs --check` 比较双方已交付的生成物与源摘要，`--write` 只在有意更新合同时使用；B0 本地/CI 自动检查漂移。CRM 包编译自己的生成文件，不再导入 workbench 的私有类型，也不增加运行时包依赖。领域合同只约定插槽形状，不授权数据、创建宿主能力或承诺热卸载。详见 [增量证据](../hackathon/evidence/dsh-g0-crm-slot-20261003.md)。

## CRM 页面与主题解耦增量

CRM 包不注册 HTML 页面交付工具。workbench 的公开 `./page-tools` 是仅依赖官方 `tools` 的适配入口，可由 CRM profile 的 `--page-tools-plugin` 显式组合；缺少提供方时 `crm_service_health.page_delivery` 返回 `NOT_AVAILABLE` 和原因，注册存在也只表明 AVAILABLE/NOT_RUN。源码包校验、取消、回执与保存职责保持页面领域所有。

`shine-brand/contracts/content-theme.v1.json` 只拥有插件内容 token；生成双方本地副本，既不激活品牌插件，也不操作 DSH chrome。CRM 单包构建/测试/打包不读取 workbench 或 brand 源码；工作台的明暗/native token 数值前后完全一致。详见 [CRM 端解耦证据](../hackathon/evidence/dsh-g0-crm-decoupling-20261003.md)。
