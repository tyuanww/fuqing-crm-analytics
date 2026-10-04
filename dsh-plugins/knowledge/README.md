# 独立知识插件候选

`@shine-mage/dsh-knowledge@0.0.0-candidate.1` 拥有公开指标解释、教材检索、引用展开与图谱查询。固定 DSH `0.1.7-rc.2`、Cordis `4.0.2`、Node 24；不携带 CRM 登录/UI、指标查询实现、Python、业务数据或凭据。CRM 包保留原有身份，但已移出这些知识工具。

| 公开入口 | 工具 | 配置和依赖 |
|---|---|---|
| `.` → `lib/index.js` | `crm_knowledge_explain` | 可选 `knowledgeOrigin`，只接受 loopback HTTP；调用公开 synthetic API 1.0.0，无需 CRM 插件 |
| `./graph-tools` → `lib/graph-tools.js` | `query_crm_knowledge_sources`、`expand_crm_knowledge_citation`、`query_crm_knowledge_graph` | 私有 `settingsFile`；需要 `shinemage-knowledge-access/v1` 身份能力与文档 grants |

保留原工具名以兼容调用方；名称中的 `crm` 不表示实现仍在 CRM 包。公开解释未配置服务时返回 `NOT_AVAILABLE / SERVICE_NOT_CONFIGURED`。私有知识没有身份提供方时返回 `UNAVAILABLE / IDENTITY_PROVIDER_NOT_AVAILABLE`，没有当前会话授权时返回 `NOT_CONNECTED`；不使用共享 retrieve key 代替账号授权。

身份能力由 CRM Host 提供可撤销的会话 lease，只含用户名、取消信号、有效性检查和引用记录回调，不暴露密码/令牌。知识工具在返回结果前再次检查 lease 和提供方。断开/重登/Host 卸载或知识模块卸载会取消在途请求、丢弃迟到结果。未来身份提供方可实现同一版本合同；当前私有知识仍需 CRM Host，尚未实现独立登录 UI。

## 构建与独立选择

在仓库根目录使用已准备的固定工具链；构建不联网、不自动安装：

```sh
node dsh-plugins/knowledge/build.mjs /absolute/pinned-dsh-checkout /absolute/plugin-kit/build-tools
B0_BUILD_UPSTREAM=/absolute/pinned-dsh-checkout node --test dsh-plugins/knowledge/test/*.test.mjs
node scripts/crm-calibration/prepare-profile.mjs \
  --output /absolute/new-private-profile \
  --knowledge-plugin /absolute/installed/knowledge \
  --knowledge-origin http://127.0.0.1:18102
```

这会生成仅含知识工具的配置；不探活、不安装、不激活宿主。需要私有教材时，另选 `--plugin /absolute/installed/crm` 和 `--graph-settings /absolute/private/settings.json`；配置格式、账号映射和历史现场证据见[图谱说明](../../docs/crm-calibration/graph-deployment.md)。

`cordis.patch.yml` 为空补丁，因为本包没有 Host UI，Agent 工具由 profile 显式选择。仅将 bundle 加入列表不会自动为所有会话注册工具。profile v3 为每个模块生成独立 Cordis 条目，不把多个 `apply()` 合进同一作用域。宿主显式加载生成的 `preset.patch.yml`，通过官方 `@deepseek-ai/dsh-agent-preset` 注册；单独复制 `preset/` 描述文件不会注册。整组切换按受控重启处理，不能承诺移除声明立即卸载旧会话；禁用业务工具后原生对话可恢复。

## 合同和验证边界

HTTP schema/类型、传输层、公开 GSV 定义与身份能力声明均携带本地生成物。维护源与 SHA 见[机器边界清单](../../docs/architecture/shinemage-plugin-boundaries.md)；`generate_contract.py --check` 和 `generate_types.mjs --check` 检查漂移。构建不读取 CRM 业务实现或兄弟插件源码；dev kit 只用于构建，不打入运行产物。

两插件的统一验证用[CRM 验证入口](../crm-knowledge/README.md#本地复验)。实际 tarball 的安全解包、固定 SDK 加载和双插件组合见[拆分证据](../../docs/hackathon/evidence/dsh-g0-crm-plugin-split-20261004.md)。后续[固定官方 Web 宿主验收](../../docs/hackathon/evidence/dsh-g0-pinned-host-20261004.md)已验证本机加载、重启、原生 synthetic 会话/WAL 与禁用/恢复；同进程任意插件隔离、WSL、真实知识库 UAT 和生产发布仍未通过。当前仍为本地候选。
