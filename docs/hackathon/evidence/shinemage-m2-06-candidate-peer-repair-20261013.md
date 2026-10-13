# M2-06 候选运行时 peer 图修复与启动证据（2026-10-13）

本记录只覆盖杭州目标上的隔离 CRM/Knowledge candidate runtime，不注册主仓 profile/journal，不重启或切换 live current。真实模型、CRM 登录、WeKnora 引用和人工 UAT 在 Aside 登录完成前保持 `NOT_RUN`。

## 根因与修复边界

前一份手工候选把插件的 `@deepseek-ai` peer 指向 `upstream/node_modules/@deepseek-ai`，绕过了发行版的 pnpm peer 闭包。目标 boot 日志因此出现 `session-controller ... failed to import`，底层错误为 `Cannot find module 'mime-db'`，随后 session/UI 组件全部 pending。

本轮按目标 release marker 的固定关系重建临时候选：每个候选插件的 `node_modules/@deepseek-ai` 指向 `/srv/shinemage/dsh/current/upstream/node_modules/.pnpm/node_modules/@deepseek-ai`；没有在共享 upstream 目录创建补丁 symlink，也没有修改 DSH 上游。CRM host 只通过临时 patch 绑定 `http://127.0.0.1:18093`，首购 relay 绑定 `http://127.0.0.1:18091`；WeKnora preset 仍通过既有只读 hotfix patch 加载。

## 实际输入与结果

| 项 | 实际值 |
|---|---|
| DSH release | `dsh-0.20.0.0-r3` |
| DSH upstream | `0.1.7-rc.2` / `477b4f42` |
| candidate runtime | `/srv/shinemage/dsh/runtime/m2-06-candidate-r4`（远端临时目录） |
| candidate web | `127.0.0.1:4332` |
| candidate private B0 bridge | `127.0.0.1:4336` |
| live current | `127.0.0.1:4328`，本轮未重启、未改写 |
| profile package SHA-256 | `fbf0015b94610753470fd99c13bb8342e8def860cafa1997ba05ecd33255416c` |
| profile lock SHA-256 | `70a48ccb6a29b951f7b36f6fac856dd4cd41698e189de0b8ab4b955c6bb4d5ea` |
| candidate patch SHA-256 | `1a923ba34635bc78c6442b0e9bbf39d69cabdc478aca518519bb5373a2521635` |

实际命令和检查结果：

1. 以目标 release 的 `node .../upstream/lib/bin.js plugin --profile web add ... --offline --ignore-scripts` 安装 candidate CRM/Knowledge 包；输入包目录与现役 profile 隔离。
2. 从 CRM 插件目录执行 `import('@shine-mage/dsh-crm-knowledge')` 和 `import('@deepseek-ai/dsh-api-session-controller')`，结果为 `CANDIDATE_IMPORT_OK`。
3. 使用独占 `DSH_HOME`、`B0_RUNTIME_TOKEN`、`B0_SESSION_ID` 和 `B0_PORT_BASE=4335` 启动候选；boot 日志没有 `warning`、`failed to import` 或 `pending`。
4. 候选 web 未带 token 返回 `401`，私有 bridge 未带 token 返回 `401`；4332、4336 与 live 4328 同时监听，live 服务 18090/18092/18093/18094 未改变。
5. Aside 新标签页已加载候选工作台并显示登录入口。当前候选登录、真实 CRM 只读查询、真实模型调用、WeKnora 来源引用和人工业务复核仍等待用户完成登录，不能抵扣 M2-06 的完整 UAT。

## 当前结论

`CANDIDATE_BOOT_PASS / ASIDE_LOGIN_PENDING`。这关闭了本轮候选依赖图与宿主启动阻塞，未关闭真实业务 UAT、保存/权限失败/恢复、standalone 页面、SDK 供应链或 release/activation 门禁。产品仍 `PARTIAL`，`release_ready=false`。


## 2026-10-13 CRM client 接线根因与修复

候选页面最初没有出现“连接 CRM”入口。诊断日志显示，把 `@shine-mage/dsh-crm-knowledge/client` 作为 host Cordis 根条目插入后，服务端启动阶段尝试执行浏览器 bundle，结果为 `ReferenceError: window is not defined`。这是加载职责错误：浏览器 client 不能作为服务端 host 插件导入。

修复只作用于隔离 candidate runtime：移除该根条目，保留 CRM host 与 agent preset；由固定 DSH `@deepseek-ai/dsh-client-modules` 扫描 CRM 包的 `dsh.client` 声明和 `exports["./client"]`，通过浏览器 bundle 注入 conversation dock。重启 candidate 后 `4332/4336` 正常监听，启动日志没有 client import failure；候选对话出现“连接 CRM”入口，用户随后手工完成当前会话绑定。

本次没有修改仓库代码、DSH 上游、live `4328`、主仓 profile 或 journal；该临时 runtime 接线不改变插件源码职责边界。
