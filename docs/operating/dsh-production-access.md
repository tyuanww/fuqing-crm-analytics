# 杭州生产 DSH 访问

当前现场先看 [STATUS.md](../../STATUS.md)。2026-10-22 的 owner-operated cockpit-v3 现场使用 DSH `4328`、页面 HTTP `18091`，并监听 `18090`–`18094`；promo helper 仍为 `18098`。CRM 为 `crm.4`，Query 为 `query.13`。本页原先的 `6677` 是旧 rc2 现场入口，不能据此判断当前版本，也不能直接重启服务。裸地址未带 cookie 返回 `401` 是预期行为，不要关闭认证。

在 Mac 开发端打开杭州生产 DSH：

```bash
scripts/ops/open-hangzhou-dsh.sh
```

脚本从当前 owner bundle 的 `/srv/shinemage/dsh/current/runtime/browser-private.json` 读取 WSL `4328` 入口，并把认证参数改写到公开 `app.tyuan.chat`。使用前仍须核对 STATUS 中的当前 owner bundle；脚本不会切换版本，也不会替代发布 runbook。可用环境变量覆盖 SSH 密钥和目标：

```bash
SHINEMAGE_SSH_KEY=~/.ssh/id_ed25519_pc2 \
SHINEMAGE_SSH_TARGET=root@100.93.46.46 \
scripts/ops/open-hangzhou-dsh.sh
```

页面文档请求使用 `https://page.tyuan.chat`，不要从 Mac 浏览器访问杭州的 loopback 端口。打开失败时先只读确认 `ssh hangzhou-wsl` 和 `systemctl is-active shinemage-dsh.service`，不要用 `--fresh` 或猜测其他 runtime。
