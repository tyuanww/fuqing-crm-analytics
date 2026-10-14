# M2-06 candidate CRM 通路恢复（2026-10-14）

本轮处理 Aside 显示“CRM 服务暂不可用”的问题，只修复本机到隔离 candidate 的 SSH 通路，没有重启远端 candidate、没有触碰 live 4328、没有输入 CRM 凭据或执行业务请求。

## 根因

- Aside 页面仍显示缓存的 `127.0.0.1:4332` candidate 页面。
- 本机诊断时 4332、4336 均没有监听进程。
- 远端杭州目标的 candidate runtime 仍在运行，candidate web PID 为远端进程 `2250718`，监听远端 `127.0.0.1:4332`。
- 因此故障是本地 SSH tunnel 丢失，不是 CRM provider 或远端 candidate 服务本身退出。

## 修复与验证

重新建立本机到远端 candidate 的独立隧道：

```text
127.0.0.1:4332 → remote candidate 127.0.0.1:4332
127.0.0.1:4336 → remote candidate 127.0.0.1:4336
```

通路验证结果：

- 本机 4332、4336 均恢复监听；
- candidate 根路径返回 HTTP `401`，符合 DSH web 认证入口预期；
- Aside 刷新后候选页面正常加载；
- CRM 面板不再显示“CRM 服务暂不可用”，恢复为账号/密码输入表单；
- live 4328、远端 candidate runtime 和业务数据未修改。

## 当前状态

M2-06 的 transport precondition 已恢复。下一步仍需用户在候选 CRM 面板手动输入账号/密码并点击“登录并连接当前对话”；凭据不会进入聊天、仓库或证据文件。

```text
CANDIDATE_TUNNEL_PASS / CRM_LOGIN_HANDOFF_REQUIRED
```
