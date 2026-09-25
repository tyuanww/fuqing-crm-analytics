# 杭州生产 DSH 访问

`https://app.tyuan.chat/` 裸地址返回 `401` 是预期行为。DSH 不接受未认证的根路径；启动时生成的 `?token=` 只用于换取 HttpOnly Cookie，随后浏览器才会进入 `/`。不要关闭这层认证，也不要把 token 写入日志、文档或聊天。

在 Mac 开发端打开杭州生产 DSH：

```bash
scripts/ops/open-hangzhou-dsh.sh
```

脚本通过 Tailscale SSH 直接读取 WSL 运行时的启动链接，只把重写后的 HTTPS 地址交给 macOS 默认浏览器，不打印认证参数。可用环境变量覆盖连接参数：

```bash
SHINEMAGE_SSH_KEY=~/.ssh/id_ed25519_github \
SHINEMAGE_SSH_TARGET=root@100.93.46.46 \
scripts/ops/open-hangzhou-dsh.sh
```

如果脚本报连接错误，先确认 `ssh hangzhou-wsl` 可用并且 `shinemage-dsh.service` 为 active；如果浏览器已经有有效 Cookie，直接打开裸地址即可复用该会话。页面收件箱请求使用 `https://page.tyuan.chat`，不会从 Mac 浏览器访问杭州的 `127.0.0.1:18091`。
