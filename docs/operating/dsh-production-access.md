# 杭州生产 DSH 访问

当前现场先看 [STATUS.md](../../STATUS.md)。2026-10-18 的 owner-operated r9 使用 DSH `4328`、页面 HTTP `18091` 和 promo helper `18098`。本页原先的 `6677` 是旧 rc2 现场入口，不能据此判断当前版本，也不能直接重启服务。裸地址未带 cookie 返回 `401` 是预期行为，不要关闭认证。

在 Mac 开发端打开杭州生产 DSH：

```bash
scripts/ops/open-hangzhou-dsh.sh
```

脚本仍按旧 `6677` 入口读取 WSL runtime 的启动链接。使用前必须核对 STATUS 中的当前 owner bundle 和端口；脚本不会切换版本，也不会替代发布 runbook。可用环境变量覆盖 SSH 密钥和目标：

```bash
SHINEMAGE_SSH_KEY=~/.ssh/id_ed25519_pc2 \
SHINEMAGE_SSH_TARGET=root@100.93.46.46 \
scripts/ops/open-hangzhou-dsh.sh
```

页面文档请求使用 `https://page.tyuan.chat`，不要从 Mac 浏览器访问杭州的 loopback 端口。打开失败时先只读确认 `ssh hangzhou-wsl` 和 `systemctl is-active shinemage-dsh.service`，不要用 `--fresh` 或猜测其他 runtime。
