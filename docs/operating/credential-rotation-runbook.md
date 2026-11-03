# 如何轮换 shinemage 凭据

这份 runbook 只写步骤和校验，不记录任何口令、token 或私钥。

## 适用范围

- CRM 服务环境文件 `/etc/shinemage/crm.env`
- DSH 服务环境文件 `/etc/shinemage/dsh.env`
- cloudflared tunnel 凭据 `/etc/cloudflared/<tunnel-id>.json`
- 页面 HTTP 的 bearer token，由 DSH supervisor 在启动时生成或注入
- WeKnora 与 Neo4j 的服务账号

## 前置条件

- 有明确的维护窗口，期间不发布新版本。
- 已确认要轮换的凭据被哪些服务读取。读取方不清楚时先不轮换。
- 已把当前环境文件备份到只有属主可读的位置，并记录备份路径。
- 已确认回退方式：恢复旧环境文件并重启对应服务。

## 步骤

1. 在仓库外生成新值，不要写进命令历史或提交。
2. 备份当前环境文件，保留权限 600。
3. 更新对应环境文件或 cloudflared 凭据文件，权限保持 600。
4. 按依赖顺序重启读取方。先 CRM backend，再页面 HTTP，最后 DSH web。发布回滚脚本不负责凭据回退。
5. 运行 `deploy/wsl/healthcheck.sh --all`，确认 CRM API、CRM web、DSH 和页面 HTTP 都返回预期状态。
6. 未认证访问必须继续返回 401。页面 HTTP 无 bearer 时也必须 401，不能因为轮换被放宽。
7. 新值验证通过后，再撤销旧值。
8. 记录轮换时间、执行人和验证结果。不要记录凭据本身。

## 验证

```bash
deploy/wsl/healthcheck.sh --all
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:6677/
curl -s -o /dev/null -w '%{http_code}\n' http://127.0.0.1:18091/
```

期望 DSH 和页面 HTTP 在未认证时返回 401。CRM API 用有效令牌访问健康检查应成功。

## 回退

1. 停止对应服务。
2. 恢复轮换前的环境文件或凭据文件，权限 600。
3. 按启动顺序重启服务。
4. 重新运行 `healthcheck.sh --all` 和上面的 401 检查。

## 边界

- 不在发布切换期间轮换凭据。
- 不把凭据写进仓库、日志、聊天记录或诊断输出。
- 旧值在新值验证通过前不要撤销。
- 没有真实服务或维护窗口时，这一步只能标记为 NOT_RUN，不能写成已轮换。
