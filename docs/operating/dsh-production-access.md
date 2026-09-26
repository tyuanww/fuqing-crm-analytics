# 杭州生产 DSH 访问

杭州 DSH 由 Windows + WSL 的 `shinemage-dsh.service` 运行，内部监听 `127.0.0.1:6677`，通过 Cloudflare Tunnel 对外提供 `https://app.tyuan.chat/`。裸地址未带 cookie 返回 `401` 是预期行为，不要关闭认证。

在 Mac 开发端打开杭州生产 DSH：

```bash
scripts/ops/open-hangzhou-dsh.sh
```

脚本通过现有 Tailscale SSH 读取 WSL runtime 的启动链接，只把重写后的 HTTPS 地址交给 macOS 默认浏览器，不打印认证参数。可用环境变量覆盖 SSH 密钥和目标：

```bash
SHINEMAGE_SSH_KEY=~/.ssh/id_ed25519_github \
SHINEMAGE_SSH_TARGET=root@100.93.46.46 \
scripts/ops/open-hangzhou-dsh.sh
```

页面文档请求使用 `https://page.tyuan.chat`，不要从 Mac 浏览器访问杭州的 loopback 端口。打开失败时先只读确认 `ssh hangzhou-wsl` 和 `systemctl is-active shinemage-dsh.service`，不要用 `--fresh` 或猜测其他 runtime。
