# M2-06 候选 Aside 会话边界（2026-10-13）

本记录承接[候选 peer 图修复与启动证据](shinemage-m2-06-candidate-peer-repair-20261013.md)，只记录浏览器会话边界，不把 live 登录状态转写为 candidate 登录证据。

候选 runtime `127.0.0.1:4332` 重新打开后，页面再次显示“未登录”和候选端 API Key 配置提示；同一 Aside 窗口的 `app.tyuan.chat` live 标签页显示用户账号 `WEIWEI`。两者是不同 origin，live 的账号状态没有出现在 candidate。候选账户菜单的登录入口没有在当前隔离标签页建立可观察的登录状态。

本轮没有读取或复制 cookie、localStorage、token、密码或 API Key，也没有把 live 页面导航到 candidate。候选 DSH 进程和 peer 图仍保持通过，CRM 登录、真实模型、WeKnora 来源和只读业务查询没有执行。

当前结论：`CANDIDATE_BOOT_PASS / ASIDE_SESSION_NOT_BOUND`。要继续候选 UAT，需要用户在 `127.0.0.1:4332` 这个标签页内完成可见的 Aside 登录或连接已授权的模型订阅；完成后才能继续 CRM provider 登录和只读查询。产品仍 `PARTIAL`，`release_ready=false`。
