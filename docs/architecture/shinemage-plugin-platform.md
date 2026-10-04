# ShineMage 插件平台边界

本设计落实[已批准的拆分计划](../plans/shinemage-plugin-platform-split.md)，不是重新选型。目标是官方 DSH 底座、独立 CRM/知识库服务、各自版本化的插件和一个组合 profile。当前先在 workspace 证明边界；物理分仓、私有 catalog 和生产切换尚未执行。

## 四类升级各有归属

| 改动 | 归属与交付 | 必须验证 | 不随之打包的内容 |
|---|---|---|---|
| 官方 DSH | host exact SHA、SDK 和 runtime lock；当前 `0.1.7-rc.2` / `477b4f42` | 固定宿主的工具、slot、生命周期、恢复和插件兼容矩阵 | CRM/知识库源码、业务数据库 |
| 单个插件 | 本领域源码、版本、测试、`lib/`、peer、bundle patch；产出独立 digest | files/exports、安全扫描、合同消费者测试、目标宿主验收 | 其他插件源码、DSH runtime、服务状态 |
| CRM/知识库服务 | API、权限、领域 schema、持久化与迁移协议 | API 兼容窗口、权限、幂等/回放、状态 forward-fix | DSH shell 与其他服务的数据 |
| profile/部署 | 固定包的有序清单、host pin、来源、digest、回执与回退指针 | 来源信任、同一 artifact、canary、受控激活和恢复 | 构建工具、源代码仓库、现场编译流程 |

不需要先 fork DSH 才能维护插件。当前不修改上游源码，也不自动追随 latest；下一代 DSH 在独立 candidate 中适配后单独升级。Plugin Hub 只能作为发现/安装参考，不能替代本项目锁定来源和兼容证据。

## 开发工具与运行时分开

`dsh-plugins/plugin-kit` 只拥有固定工具链、依赖锁与构建绑定；它不导入业务插件、不读取服务状态、不进入插件 tarball。插件自己的类型检查、测试、生成物与业务行为由插件维护。当前仍以相邻 workspace 路径引用开发 kit；未来迁成版本化 dev dependency 时必须保留同样的干净包构建证据。

`toolchain.json`、build-tools manifest/lock/补丁现在位于 kit；release、B0 pipeline、开发入口和合同生成器读取同一份 pin。不能为了让一个包构建成功，静默从相邻历史仓库找依赖。已准备的第三方依赖可以复用，但须与 kit 锁定输入一致。

当前事实见[机器清单与依赖说明](./shinemage-plugin-boundaries.md)。首批 leaf 已能脱离 workbench 构建；CRM 原 5 条 workbench 私有引用全部解除，合成 Python 查询/知识解释也改为显式配置的独立服务 HTTP API 1.0.0。插件不再发现主仓路径或启动 Python。两项服务已各自产出[独立应用候选包](../operating/crm-service-packages.md)，资源与依赖按领域锁定；知识服务不再加载指标引擎或 DuckDB。源码仍在 workspace，尚未物理分仓。源码/服务边界进展不等于完整宿主故障隔离。

CRM 与知识插件也已拆成两个独立候选包：CRM 保留旧包 ID，知识使用 `@shine-mage/dsh-knowledge`；profile v3 按包分别选择、分别记录指纹。双方只共享领域 owner 维护的公开合同生成物；私有知识通过可撤销会话 lease 获取身份，不读取 CRM 实现或凭据。公开解释可独立运行，私有教材当前仍需要 CRM Host 作为身份提供方。迁移需要新 profile 和对应新 Host，不能宣称原地热替换已验证，详见[服务与插件边界](../operating/crm-plugin-service-boundary.md)。

## 领域合同不能变成共享业务单体

- 极小的跨插件合同只约定 capability 的提供/消费、slot、结果 envelope 与不可用状态。
- CRM、问数、看板、页面与知识库 schema 由各领域拥有；生成器、源摘要、消费者和兼容政策一起维护。
- 观察到的 `/internal/native/*` 是内部 adapter，不能当成长期公开 API。字面路由清单也不证明权限、幂等或可用性。
- 插件被禁用或依赖缺失时，动作必须显示 `disabled` / `NOT_AVAILABLE` 和原因；默认保留 DSH 原生标题、侧栏、会话及工具合同，`--shine-brand off`。

## 安装、故障与保存边界

首期包身份保持现有 `@shine-mage/dsh-analytics-workbench-b0`；不能把目标仓库名称当成已获授权的 npm 包重命名。profile 只引用固定包及 digest。每次候选记录来源 SHA、生成合同摘要、DSH pin、capability 和 journal，不能用工作区目录作为发布身份。

同进程插件挂死或部分注册不能靠静态分析证明可隔离。T17 必须在命令拥有的临时 profile/home/WAL/PID/端口中验证固定 DSH 的实际行为；不支持安全卸载时明确 `HOST_RESTART_REQUIRED`，按已验证的原生回退与受控重启处理。当前不宣称热插拔或无重启回退。

profile 回退不回滚已写入 CRM/SQLite 的记录。D15 是否启用 durable save 由 T3/T7 的服务状态矩阵决定：candidate/correlation/idempotency、成功但回执丢失、重复提交、UNKNOWN 重放和 forward-fix 都需要证据。证据不足时首个候选仍只交付可核对结果。

## 实施顺序与放行

1. T1 固化 owner、实际依赖和边界检查；T15 先证明 dev kit 与低耦合 leaf 包。
2. board-components 已拥有公开计算/类型，workbench 的 6 条图表源码引用已改为固定 tarball，独立 build/pack 与消费者回归已有本地证据。CRM 的 slot/主题改为领域版本化生成合同，页面工具由 profile 装配公开入口，原 5 条 workbench 内部引用全部解除；单包构建/测试/pack 通过。细目在机器清单，每解除一条就删除对应临时例外；不把源码解耦当作生命周期验收。
3. T2/T17 固定宿主证据与 T3/T7 保存矩阵通过后，完成 D15 workbench 包的独立 candidate、canary 和回退证据。
4. 保留批准的签名、SBOM/CVE、来源、权限、灰度和责任门禁；首期 stop/go 之后再按 DAG 物理分仓、建立多生产者 catalog。

打包成功不代表发布就绪。GitHub 发布、杭州 receive/activate、WSL/路由操作和真实数据迁移仍按各自授权及现场门禁执行。开发与 CI 可以生成验证包；生产只接收已审查 SHA 的不可变 artifact，大包由杭州直接下载，Tailscale 负责控制与探针。
