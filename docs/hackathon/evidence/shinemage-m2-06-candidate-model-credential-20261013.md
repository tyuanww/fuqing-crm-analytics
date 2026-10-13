# M2-06 candidate 真实模型凭据门禁（2026-10-13）

本记录承接候选 peer 图、候选会话边界和 CRM host 路由探针，只记录杭州授权目标上隔离 candidate `127.0.0.1:4332` 的登录、只读模式和真实模型启动结果。它不改变 live `4328`，不注册主仓 profile/journal，不读取或复制任何 cookie、token、密码、API key 或业务数据。

| 项目 | 实际观察 |
|---|---|
| candidate web | `127.0.0.1:4332`，隔离 runtime `m2-06-candidate-r4` |
| candidate 登录 | DSH 账户菜单显示 `hutou`；这是 candidate 自身的本地显示名登录，不代表 live origin 的会话被复制 |
| 工作区 | `uat-probe-workspace`，由前序 host route probe 创建的临时 workspace |
| 访问模式 | `仅可查看` |
| 选择模型 | `DeepSeek-V41-Flash · High` |
| UAT 请求 | 只读列举 CRM/WeKnora 工具，健康探针与 GSV 查询使用指定日期和参数；禁止保存、分享、删除、激活、切换、设置或提交业务数据 |
| 结果时间 | 2026-10-13 03:50（Asia/Shanghai，页面显示） |

## 结果

提交只读 UAT 请求后，candidate 页面显示：

```text
本轮运行失败
llm-deepseek: no API key for provider route "deepseek-official";
store DEEPSEEK_API_KEY through the credentials service (the web Models page writes it),
or export DEEPSEEK_API_KEY in the launching environment
MISSING_CREDENTIAL
```

这次运行在模型调用前失败，因此：

- CRM 工具列表、`crm_service_health`、`query_crm_dashboard_gsv` 和 WeKnora 工具没有被模型调用，均保持 `NOT_RUN`；
- 没有读取 CRM/WeKnora 业务数据，没有保存、分享、删除、权限变更或恢复操作；
- 没有输入、读取、转移或记录 API key；
- 不能把 candidate 登录成功写成真实业务 UAT 通过；
- live 侧此前的工具面结果仍单独记录为 `NOT_EXPOSED / NOT_RUN`，不与 candidate 的模型凭据失败混合。

## 门禁结论

`CANDIDATE_LOGIN_PASS / READ_ONLY_MODE_PASS / MODEL_MISSING_CREDENTIAL`。要继续 candidate 真实模型/CRM/WeKnora UAT，需要在 candidate 的受控 credentials service 中由授权人员配置该 provider 的凭据，再重新执行同一只读请求；凭据不得通过聊天、仓库、环境回显或证据文件传递。当前 M2-06 仍为 `PARTIAL_REAL_UAT`，产品仍为 `PARTIAL`，`release_ready=false`。

## 2026-10-13 Aside 复核

在同一 candidate headed 页面重新打开模型选择器，确认 `模型与推理等级` 菜单只显示 `DeepSeek-V41-Flash` 和 `High`；没有在浏览器中代填、读取或提交任何凭据，也没有发起新的模型、CRM 或 WeKnora 请求。当前仍需要授权人员在 candidate 的受控 credentials service / Models 页面手工录入 provider 凭据后，才能重跑同一只读 UAT。

随后在同一 candidate 会话发送加强脱敏约束的只读 UAT 请求，页面时间显示约 `13:14`。结果仍为：

```text
本轮运行失败
llm-deepseek: no API key for provider route "deepseek-official"
MISSING_CREDENTIAL
```

本次重试没有进入 CRM 或 WeKnora 工具调用，未读取业务数据；浏览器控制台错误为空。候选模型凭据门禁仍保持 `MODEL_MISSING_CREDENTIAL`。
