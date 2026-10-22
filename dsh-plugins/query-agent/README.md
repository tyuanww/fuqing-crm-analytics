# 问数智能体预设

`@shine-mage/dsh-query-agent` 是一个配置型 DSH bundle，只声明一个 `crm-query` Agent 预设，不复制业务插件实现。

这是“问数智能体”的唯一维护源。`scripts/crm-calibration/prepare-profile.mjs` 只声明兼容入口 `crm-knowledge`，避免同一 profile 重复注册 `crm-query`。

## 组合边界

| 提供方 | 职责 |
|---|---|
| `@shine-mage/dsh-crm-knowledge` | CRM 登录、指标查询、快照与分析 |
| `@shine-mage/dsh-analytics-workbench-b0/page-tools` | 可选 HTML 页面交付 |
| `file:///srv/shinemage/dsh/current/inputs/page/brand-weknora/weknora.mjs` | 只读 WeKnora 检索与文档读取 |
| `@shine-mage/dsh-query-agent/tool-policy` | Host 层同时跟踪 Agent 创建、空白会话预设切换和释放，只为 `crm-query` scope 隐藏持久终端和 shell 工具 |

CRM、知识、页面和 WeKnora 是不同权限与生命周期域，保持独立包。`@shine-mage/dsh-knowledge` 在未配置可验证的 `knowledgeOrigin` 时不进入 `crm-query`，避免向模型暴露必然失败的解释工具；公开口径改由 WeKnora 检索。后续配置并验收知识服务后，应由新的显式 preset 版本重新加入。

私有教材图谱工具不在本预设中。需要它时应创建新的显式 preset，不要因为安装了知识包就自动扩大问数 Agent 的权限。

## AI 增长董事会工作链

`crm-query` 把经营诊断、增长复盘和“AI 增长董事会”约束为一条证据链，而不是自由生成经营结论：

1. 先界定决策问题、业务范围和 `data_cutoff`。
2. 组合渠道、GSV/购买覆盖、商品新老客、会员和可用的 RFM 八象限加 TTL 快照；缺失项保持未知。
3. 用事实、解释、反证和待验证假设形成增长、用户运营、财务与风险四类意见。
4. 给出继续、调整或停止一个建议，并绑定目标人群、动作、主指标、护栏、责任角色、观察期和退出条件。
5. HTML 至少覆盖决策摘要、证据与截止日、用户分层、策略动作、增长跟踪、风险和未知项。经营数字必须来自本次工具结果并优先引用可信快照；绑定数字保持只读，无法绑定时标为未绑定样例。

历史数据只支持回溯和假设，不证明未来增量或因果。当前没有订单号导出工具，问数 Agent 只能输出人群条件并明确导出缺口，不得生成订单号或宣称已完成导出。

## DSH 契约

- bundle 通过 `package.json` 的 `dsh.bundle.patch` 提供 `cordis.patch.yml`。
- Agent 通过官方 `@deepseek-ai/dsh-agent-preset` 声明，不依赖旧 `.agent-presets` 目录。
- 安装本 bundle 会覆盖进程级 `agent-default-model`，把未显式选择模型的 Agent 默认路由设为 `deepseek-account / deepseek-flash / off`，避免新会话重新启用当前不可用的 thinking 路由。已有会话保留自己的模型选择。
- CRM Host 配置固定为 loopback `http://127.0.0.1:18093`，数据类型为 `real`。
- 工具策略位于 Host 配置，因为 Agent 创建监听器和预设注册表属于进程级服务。它在 `agent/created` 和 `agent-preset/selected` 时确认当前 Agent 使用 `crm-query`，然后对该 Agent scope 调用 `ctx.tools.restrict()`；切回其他预设或 Agent 销毁时释放限制，其他预设不受影响。
- 包只导出作用域工具策略、locale 与 icon 资源，不包含业务查询实现。

先安装 CRM 领域插件和已有的 workbench bundle，再安装本 bundle。Knowledge 包可以独立安装，但未配置服务时不属于 `crm-query`。配置顺序由 profile bundle 层保证；同名 `crm-knowledge-login-host` 只覆盖配置，不重复注册插件。

## side-load 身份

当前线上 owner-operated side-load 的固定身份见 [`config/query-agent-side-load.v1.json`](../../config/query-agent-side-load.v1.json)，仍为 query.11。当前仓库维护源已推进到 query.12，新增商品新老客和 RFM 快照工具，但尚未生成、side-load 或部署到杭州。其中 `source_package_manifest_sha256` 是 source `package.json` 的摘要，`generated_pack_manifest_sha256` 是生成 `plugin-pack.json` 的摘要，`tarball.sha256` 是最终归档摘要；三者不能互相替代。该 lock 只描述当前现场输入，`release_ready=false`，不创建正式发布身份。query.10 的 all-tools restriction 会误删域工具，已回滚；query.11 使用已知继承工具 masking 加执行 allowlist。

查询工具与实际浏览器边界见 [query.11 allowlist 回执](../../docs/hackathon/evidence/dsh-query11-allowlist-20261021.md)。

## 更新并验证 WeKnora 生产范围

生产检索由 DSH 外部的薄 overlay 提供，第三方 `@wxg-prc-cpg/dsh-weknora@0.1.0` 包保持独立且不改写。维护源、live 文件和回滚资产的职责如下：

| 项目 | 位置或约束 |
|---|---|
| Adapter 源 | [`scripts/ops/weknora-production.mjs`](../../scripts/ops/weknora-production.mjs)，部署为 live `brand-weknora/weknora.mjs` |
| Scope wrapper | [`scripts/ops/weknora-production-scope.mjs`](../../scripts/ops/weknora-production-scope.mjs)，与 adapter 同目录 |
| Overlay 摘要 | 仓库内为 [`config/weknora-production-overlay.v1.json`](../../config/weknora-production-overlay.v1.json)，部署时复制到 live `brand-weknora/` 并与 adapter 同目录；记录当前文件 SHA-256 |
| 第三方包 | `brand-weknora/weknora-package/`，来源与摘要见同目录 `package-origin.json` |
| 检索凭据 | `brand-weknora/retrieve.key`，仅现场 `0600 root:root`，不进入 Git、日志或 manifest |
| 修改边界 | 只允许固定项目库 `1c4627e2-dfc1-48ca-aeef-2c00b53da5f8`；禁用上游 tenant-wide 文档名 enrichment；读取前后核对文档元数据；工具注册随插件 effect 释放；不合并、不修改 WeKnora 数据卷 |

### 前置条件

- 使用仓库固定 Node 24；adapter 的 `package.json` 合同是 `24.x`。
- live overlay 目录已包含经过校验的上游 `weknora-package`，`retrieve.key` 已由授权 operator 配置。
- 已为该维护窗口准备独立的恢复目录和旧文件摘要；不要在未授权的生产窗口改 profile、symlink 或 WeKnora 数据。
- 线上 query.11 与仓库 query.12 的 `cordis.patch.yml` 都可能引用 `weknora.mjs`；替换 adapter 会同时影响引用该文件的 Agent preset。query.12 部署前必须先生成新的 provenance 和 side-load lock。

### 本地校验

```sh
node --check scripts/ops/weknora-production.mjs
node --check scripts/ops/weknora-production-scope.mjs
node --test scripts/ops/weknora-production-scope.test.mjs \
  dsh-plugins/query-agent/test/package.test.mjs
jq empty config/weknora-production-overlay.v1.json
shasum -a 256 scripts/ops/weknora-production.mjs \
  scripts/ops/weknora-production-scope.mjs \
  config/weknora-production-overlay.v1.json
```

期望当前 overlay 摘要为 `fc928415…b4ee8`（adapter）、`e060ecd5…d663`（scope helper）和 `8ef9c40c…73a7`（overlay manifest）。摘要变化时先核对内容与 PR，不要只更新 manifest 让漂移“变绿”。

### 更新现场

1. 在恢复目录保存即将替换的 adapter、scope helper 和旧 overlay manifest 的原字节与 SHA-256。
2. 按精确路径复制维护源到 `brand-weknora/weknora.mjs`、`weknora-production-scope.mjs` 和 `weknora-production-overlay.v1.json`；保持 `0600 root:root`。
3. 不复制、打印或重写 `retrieve.key`；不修改 `weknora-package/`，也不改 `package-origin.json` 的第三方身份。
4. 在 live 目录复核三个文件的 SHA-256 和权限。仅新增或更新 overlay manifest、未改变 adapter/helper 时不需要重启。
5. 改动 adapter 或 scope helper 后，只在明确授权下受控重启 `shinemage-dsh.service`，并保持 `shinemage-dsh-promo-enter.service` 的现有跟随关系。

### 验证

```sh
systemctl is-active shinemage-dsh.service
curl -sS -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18092/
```

服务恢复后，在“问数智能体”中做三项只读检查：项目资料正常返回带来源的结果；显式搜索非项目库返回 `WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED`；显式读取非项目库文档被拒绝且不返回正文。项目文档读取还会在返回前再次核对元数据，请求期间范围变化时丢弃结果。普通 search 仍只向项目库发起 passage 检索，但上游的 tenant-wide 文档名 enrichment 已禁用，避免在内存过滤前把其他库元数据拉入 DSH。真实 CRM 指标查询仍要求当前用户自行完成 CRM 登录，未登录只能是 `NOT_CONNECTED`。

### 常见拒绝

| 错误码或现象 | 处理 |
|---|---|
| `WEKNORA_RETRIEVAL_KEY_UNAVAILABLE` | 检查现场 `retrieve.key` 是否存在、非空且权限为 `0600`；不要在聊天或日志中输出值 |
| `WEKNORA_KNOWLEDGE_BASE_SCOPE_DENIED` | 这是跨库或非 allowlist 参数被拒绝；不要通过扩大 allowlist 绕过 |
| `WEKNORA_DOCUMENT_SCOPE_CHECK_FAILED` | 文档元数据查询失败或文档 ID 为空；保持 fail-closed，先查 WeKnora API 健康与工具参数 schema |
| `ERR_MODULE_NOT_FOUND` | 检查 adapter 是否与经过校验的 `weknora-package/` 同目录，不要从仓库临时复制源码替代固定包 |

### 回滚

只恢复同一次部署前保存的 adapter/helper 文件对，并再次核对 SHA-256；若这次改动了运行时文件，按授权受控重启并复测端口和日志。当前恢复目录中的版本仍保留固定 allowlist 和读取前校验，但缺少读取后二次校验与 effect 释放；恢复会降低生命周期保护。安全要求高于可用性时，应移除/禁用 WeKnora 工具而不是静默回滚。`weknora-production-overlay.v1.json` 只是审计 sidecar，回滚或删除它不会改变运行行为。

## 本地检查

```sh
node --test dsh-plugins/query-agent/test/package.test.mjs
# npm 只检查包元数据与默认发布面；正式 DSH pack 由 scripts/release/plugin-pack.mjs 生成。
cd dsh-plugins/query-agent
npm pack --dry-run --json
```
