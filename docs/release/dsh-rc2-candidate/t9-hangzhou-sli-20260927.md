# 杭州 loopback SLI 只读证据（2026-09-27）

## 范围

通过 Tailscale SSH 在 `DESKTOP-FAEJK8S` 的现役旧 checkout 上执行只读 HTTP 探针；未读取 token、Cookie、DuckDB/WAL 或配置内容，未启动、重启、切换服务，也未访问 Cloudflare hostname。

探针端点与预期状态：

| 端点 | 预期 |
|---|---:|
| `127.0.0.1:6677/`（DSH） | `401` |
| `127.0.0.1:18091/`（page） | `404` |
| `127.0.0.1:18093/api/v1/health`（CRM） | `200` |
| `127.0.0.1:18094/`（frontend） | `200` |

## 结果

- UTC 时间：`2026-09-27T08:37:24Z` 至 `2026-09-27T08:53:12Z`
- 采样：`60/60`，每次间隔约 15 秒，退出码 `0`
- 四个端点每次均返回预期状态；未观察到连接错误或 `5xx`
- 观测到的单次响应时间上界约为：DSH `1.200 ms`、page `1.130 ms`、CRM `2.928 ms`、frontend `0.847 ms`

## 限制

这是当前杭州旧版本服务的 loopback 观测，不是 rc2 release artifact 的验证；没有 operator-only route、正/负身份探针、外部 hostname、浏览器 UAT、10x backpressure 或冷安装/回退证据。因此 T9 仍为 `PARTIAL`，不能写成 canary 或生产通过。

